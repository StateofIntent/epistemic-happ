#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/notes-live.mjs — TWO PEOPLE IN ONE ROOM, FOR REAL.
//
// WHAT THIS IS FOR. `notes/` has had a long-poll since it was written: `GET
// /spaces/:id/events` parks for 25 seconds and answers the moment the space
// changes. Until now nothing in the browser called it. The room was a shared
// notebook that only ever showed you what you had done yourself — two members
// writing in the same space did not see each other, and the README described
// a collaborative layer that was not, in the only sense a person can check,
// collaborative. This harness exists because that gap was invisible to every
// other harness in this directory: each of them drives ONE client, and one
// client is exactly the configuration in which the bug does not appear.
//
// SO IT DRIVES TWO BROWSERS. Two Chromium contexts, two members, one room, no
// conductor anywhere — the notes layer sits above the promotion gate and has
// never needed one. Nobody touches the first browser after the room is open:
// every check about arrival is a check that the screen changed while its
// owner was doing nothing at all.
//
// THE PROPERTY THAT COST THE MOST THOUGHT is not arrival, it is what arrival
// must not break. A screen that rebuilds itself whenever a stranger writes is
// a screen that can throw away a half-typed sentence, or move somebody's
// caret mid-word, or — worst — quietly overwrite an edit that landed while a
// save was in flight. Going live makes all three reachable for the first
// time, so all three are checked here: a draft survives an arrival, the caret
// survives with it, and a note that moved underneath an open editor refuses
// the save rather than losing what either person wrote.
//
// THE OTHER HALF OF THE CEILING. The service caps CONCURRENT parked polls per
// member (see `notes/src/limits.ts`), which is the right shape for a route
// designed to park. A client that walks out of a room without hanging up
// therefore spends its own allowance on rooms nobody is looking at — and a
// server that only releases the slot when the poll times out makes the abort
// meaningless. Both halves are checked, through the UI, with the ceiling set
// to one so that "did it actually let go" is answerable rather than inferred.
//
// Prereqs: `cd notes && npm install && npm run build` and a built UI
// (`cd mobile-ui && npm run build`). No conductor, no friction budget, safe
// to run at any time alongside anything else.
//
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness can fail, and fails in the right place.
//
//   Injection: the composer's draft moved back into the textarea's own value,
//   which is where it lived before this work and where it looks harmless.
//   Result: two reds — the draft check and the caret check — while every
//   arrival check stayed green, which is the point: the room was still live,
//   and being live is what destroyed the sentence.
//
//   THE INTERMITTENCY THIS DIAGNOSTIC WAS BUILT FOR HAS SINCE BEEN CAUGHT AND
//   FIXED, on its third occurrence, and the diagnostic is what caught it. It
//   reported that the screen was NOT on the join screen at all and was showing
//   "That does not look like an invite link or token", while the SERVICE
//   previewed the same invite fine. Both halves were needed: either alone is
//   consistent with a bad invite.
//
//   The cause: opening the notes tab fires `loadDirectory` asynchronously, and
//   `ctx.rerender()` rebuilds the tree when it lands. The invite box kept its
//   value only in its DOM node, so a directory load landing between the paste
//   and the click emptied it, and "Look at it" parsed the empty string. Fixed in
//   `notes-ui.ts` (`inviteDraft`, and the same for every other typed box on
//   those screens), and guarded above by FORCING that rebuild — refreshing the
//   directory — rather than waiting to be unlucky. Injecting the old DOM-only
//   invite box now fails every run with "the invite box lost the link before it
//   could be followed", where it used to fail roughly once a day.
//
//   Injections A, B and C: the three ways a join form can fail to appear,
//   forced one at a time, to prove the diagnostic in `joinAs` tells them
//   apart. This was written BEFORE the cause of the real intermittency was
//   known — see `joinAs` for why that order.
//     A — an invite token the service has never heard of.
//     B — the preview request routed into a black hole exactly once, so it
//         goes out and never comes back.
//     C — an invite box that never takes the browser to the join screen.
//   Result: three different sentences where there had been one bare
//   `TimeoutError` naming a line number. A says the service refused and the
//   screen was right; B says the read HUNG rather than being refused, and —
//   the split that matters — that the service previews the same invite fine
//   when asked directly a moment later; C says the browser is not on the join
//   screen at all, and quotes the error it IS showing. Watched in all three
//   directions before any of them was believed.
//
//   Injection: `store.editNote` ignoring `expectedRev` — the state this code
//   was in until this work, and the state one deleted `if` returns it to.
//   Result: two reds. The refusal itself, and then — one step later, without
//   any check being written for it — "keeping theirs leaves their version
//   standing", because the save that should have been refused had already
//   overwritten what Bo then chose to keep. That second red is the defect
//   arriving where a person would actually meet it, and it is the reason the
//   check order here is not rearranged for tidiness. The conflict WARNING
//   stayed green throughout, correctly: the screen still noticed the note had
//   moved, it just no longer stopped anything. A warning is not a guarantee.
// ---------------------------------------------------------------------------
// Runtime: ~30 seconds, most of it two browser contexts starting.
// ============================================================================

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { CHROMIUM } from './chromium.mjs';

const requireFromUi = createRequire(new URL('../../mobile-ui/package.json', import.meta.url));
let chromium;
try {
  ({ chromium } = requireFromUi('playwright'));
} catch {
  console.error('Could not resolve playwright from mobile-ui/. Run: cd mobile-ui && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install');
  process.exit(1);
}

const PORT = Number(process.env.EPI_NOTES_TEST_PORT ?? 8794);
const ORIGIN = `http://localhost:${PORT}`;
const PREVIEW_PORT = 4189;
const NOTES_MAIN = new URL('../../notes/dist/main.js', import.meta.url).pathname;
const MEMBERSHIPS_KEY = 'epistemic-mobile-ui:notes-memberships';

const STAMP = Date.now();
const SPACE_NAME = `Live room ${STAMP}`;

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};
function setupFail(lines) {
  log('');
  for (const l of lines) log(`  SETUP FAILED: ${l}`);
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, { token, body, signal } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${ORIGIN}${path}`, {
    method, headers, signal, body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  try { payload = await res.json(); } catch { /* no body */ }
  return { status: res.status, body: payload };
}

async function startNotesServer() {
  const child = spawn(process.execPath, [NOTES_MAIN], {
    env: {
      ...process.env,
      EPI_NOTES_PORT: String(PORT),
      EPI_NOTES_ORIGIN: ORIGIN,
      EPI_NOTES_STATE: '',
      // One, so that "the client let go of its slot" is a question this
      // harness can actually answer rather than assume. The default is four.
      EPI_NOTES_PARKED_POLLS: '1',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.on('data', (d) => process.stderr.write(`[notes stderr] ${d}`));
  for (let i = 0; i < 100; i++) {
    await sleep(50);
    try { if ((await fetch(`${ORIGIN}/health`)).ok) return child; } catch { /* not up */ }
  }
  child.kill('SIGKILL');
  setupFail([`the notes server never answered /health on ${ORIGIN}.`]);
}

/** Walks a fresh browser context in through an invite link, as a person does:
 * the notes door on the connect screen, paste the link, pick a name. */
const JOIN_STEP_TIMEOUT = 15000;

/** Get two browsers into one room.
 *
 * Every wait here is bounded AND EXPLAINED, which it was not. This function
 * failed twice in CI on the same afternoon — once on an unrelated branch, once
 * on a documentation-only change that cannot have caused it — both times on the
 * same wait, for `notes-join-name`, after the live-arrival checks above it had
 * already passed. Both times it died as a bare Playwright `TimeoutError` naming
 * a line number and no check, which is the exact shape this directory's README
 * records against `launcher-packaging`'s first regression report and the shape
 * `notes-ui.mjs` was given a diagnostic to escape. Two occurrences in a day is
 * enough to expect a third, and a third that says only "timeout at line 150"
 * teaches nothing, so this is done BEFORE the cause is hunted rather than after.
 *
 * It is NOT the `notes-ui` intermittency, and the diagnostic is built not to
 * fold them together: that one is a note failing to render after a submit, this
 * one is a join form failing to appear at all.
 *
 * A missing join form has three unrelated causes that look identical from
 * outside, and naming which one it was is most of the value here:
 *
 *   1. The service refused the preview — a revoked, expired or unknown invite.
 *      The screen is working perfectly and is showing the refusal.
 *   2. The preview never came back. The screen is stuck on "Reading the
 *      invite…", which is a hung or lost request, not a refusal.
 *   3. The click never got us to the join screen at all — the invite box
 *      rejected the link, or the app is on some other screen entirely.
 *
 * So on a miss this reports what the SCREEN is showing, what the SERVICE says
 * about that same invite when asked directly, and whether anything threw in the
 * page — and then throws a sentence rather than a stack trace. */
async function joinAs(browser, inviteUrl, displayName) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript((origin) => {
    try { localStorage.setItem('epistemic-mobile-ui:notes-origin', origin); } catch { /* private mode */ }
  }, ORIGIN);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const step = (testid, what) => joinStep(page, testid, what, { displayName, inviteUrl, errors });

  await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="connect-to-notes"]').click();
  await step('notes-invite-input', 'the invite box, after opening the notes tab');
  await page.locator('[data-testid="notes-invite-input"]').fill(inviteUrl);

  // THE CAUSE OF THIS HARNESS'S OWN INTERMITTENCY, now an assertion.
  //
  // Opening the notes tab fires `loadDirectory` asynchronously, and it
  // re-renders when it lands. `ctx.rerender()` rebuilds the tree, so a pasted
  // invite link survived only if nothing outside the DOM had to remember it —
  // and nothing did. A directory load landing between the paste and the click
  // silently emptied the box, and "Look at it" then parsed the empty string and
  // refused a link that was perfectly good.
  //
  // That is what the diagnostic below finally reported on the third occurrence:
  // the screen showing "That does not look like an invite link or token" while
  // the SERVICE previewed the same invite fine. Checked here rather than left to
  // luck, and checked BEFORE the click, because after it the evidence is gone.
  //
  // The rebuild is FORCED rather than waited for. Refreshing the directory is
  // the same `loadDirectory` -> `ctx.rerender()` path that used to land at an
  // unlucky moment, so this turns the intermittency into something that is
  // simply true or false on every run instead of once a day.
  const refresh = page.locator('[data-testid="notes-directory-refresh"]');
  if (await refresh.count() > 0) {
    await refresh.first().click();
    await page.waitForTimeout(400);
  }
  const heldInvite = await page.locator('[data-testid="notes-invite-input"]').inputValue();
  if (heldInvite !== inviteUrl) {
    log('');
    log(`  JOIN FAILED for ${displayName}: the invite box lost the link before it could be followed`);
    log(`    it holds ${JSON.stringify(heldInvite)}, not the invite that was pasted`);
    log('    this is the notes-ui rebuild discarding typed input — see notes-ui.ts `inviteDraft`');
    throw new Error(`joinAs(${displayName}): the invite box was emptied by a re-render before the click`);
  }

  await page.locator('[data-testid="notes-invite-open"]').click();
  await step('notes-join-name', 'the join form, after following the invite link');
  await page.locator('[data-testid="notes-join-name"]').fill(displayName);
  await page.locator('[data-testid="notes-join-submit"]').click();
  await step('notes-composer', 'the room itself, after submitting the join form');
  return { context, page, errors };
}

/** One bounded wait in the join sequence, and everything worth knowing if it
 * misses. Throws, because this is setup and there is nothing to check after
 * it — but throws having already said which step, what was on screen, and what
 * the service thought. */
async function joinStep(page, testid, what, { displayName, inviteUrl, errors }) {
  const appeared = await page.waitForSelector(`[data-testid="${testid}"]`, { timeout: JOIN_STEP_TIMEOUT })
    .then(() => true).catch(() => false);
  if (appeared) return;

  const screen = await screenVerdict(page);
  const service = await inviteVerdict(page, inviteUrl);
  log('');
  log(`  JOIN FAILED for ${displayName}: waited ${JOIN_STEP_TIMEOUT / 1000}s for ${what}`);
  log(`    the screen:  ${screen}`);
  log(`    the service: ${service}`);
  log(`    page errors: ${errors.length ? errors.join(' | ') : 'none — nothing threw in this browser'}`);
  throw new Error(
    `joinAs(${displayName}) gave up waiting for ${what}. `
    + `SCREEN: ${screen} SERVICE: ${service}`,
  );
}

/** What the screen is actually showing, in the vocabulary of the three causes
 * above. Reads the room rather than guessing at it: the visible test hooks are
 * listed because "which screen is this" is otherwise unanswerable from a
 * timeout, and every `.error-box` is quoted because a refusal the app is
 * displaying correctly must never be reported as a hang.
 *
 * A diagnostic must never turn a miss into a different failure, so every path
 * returns a sentence rather than throwing. */
async function screenVerdict(page) {
  try {
    return await page.evaluate(() => {
      const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null;
      const hooks = Array.from(document.querySelectorAll('[data-testid]'))
        .map((n) => n.dataset.testid).filter(Boolean);
      const boxes = Array.from(document.querySelectorAll('.error-box'))
        .map((n) => n.textContent?.trim() ?? '')
        .filter((t) => t.length > 0);
      const where = `[on screen: ${hooks.length ? hooks.join(', ') : 'no test hooks at all'}]`;

      const inviteError = text('[data-testid="notes-invite-error"]');
      if (inviteError !== null) {
        return `the join screen is showing the service's refusal — "${inviteError}". `
          + `The SCREEN is fine; the INVITE was not accepted. ${where}`;
      }
      if (document.querySelector('[data-testid="notes-invite-reading"]')) {
        return 'the join screen is stuck on "Reading the invite…" — the preview request went out '
          + `and never came back, which is a HUNG READ and not a refusal. ${where}`;
      }
      if (document.querySelector('[data-testid="notes-composer"]')) {
        return `this browser is already inside a room — the join form was skipped, not lost. ${where}`;
      }
      const said = boxes.length ? ` Errors on screen: ${boxes.join(' | ')}.` : ' Nothing is showing an error.';
      return `not on the join screen at all — the invite link never took this browser there.${said} ${where}`;
    });
  } catch (error) {
    return `could not be read: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** Ask the SERVICE about the same invite, and split "the screen never rendered
 * it" from "this join was never going to happen".
 *
 * Asked from inside the failing browser, with that browser's own stored origin,
 * for the reason `notes-ui.mjs` gives at length: a client built out here would
 * be asking about a service the failing page might not even be pointed at. The
 * invite preview is public by design — holding the link is the credential — so
 * no token is needed, which is why this works before anyone has joined. */
async function inviteVerdict(page, inviteUrl) {
  try {
    return await page.evaluate(async (url) => {
      const origin = localStorage.getItem('epistemic-mobile-ui:notes-origin');
      if (!origin) return 'could not be asked: this browser has no notes origin stored';
      const token = url.replace(/\/+$/, '').split('/').pop();
      if (!token) return `could not be asked: no invite token in ${url}`;
      let res;
      try {
        res = await fetch(`${origin}/invites/${encodeURIComponent(token)}`);
      } catch (e) {
        return `unreachable from this browser at ${origin} (${String(e)}) — the notes server is gone or the origin is wrong`;
      }
      if (!res.ok) {
        let detail = '';
        try { detail = JSON.stringify(await res.json()); } catch { /* not JSON */ }
        return `refuses this invite: HTTP ${res.status} ${detail} — the join was never going to happen, `
          + 'and the screen was right not to show a form';
      }
      const body = await res.json();
      const preview = body?.preview;
      return `previews this invite fine (space "${preview?.space?.name ?? '?'}", `
        + `${preview?.totalMembers ?? '?'} member(s), mode ${preview?.mode ?? '?'}) `
        + '— the invite is good and the SCREEN did not render the form';
    }, inviteUrl);
  } catch (error) {
    return `could not be asked: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** The member token this browser is holding, read the only place it exists. */
async function tokenOf(page, spaceId) {
  const raw = await page.evaluate((key) => localStorage.getItem(key), MEMBERSHIPS_KEY);
  const found = JSON.parse(raw ?? '[]').find((m) => m.spaceId === spaceId);
  return found?.token ?? null;
}

const noteTexts = (page) => page.evaluate(
  () => Array.from(document.querySelectorAll('.note-text')).map((n) => n.textContent ?? ''),
);

/** Waits for the screen to show something, WITHOUT touching the screen. Every
 * use of this is the actual claim being made: nobody clicked anything. */
async function waitForNote(page, text, timeout = 10000) {
  const started = Date.now();
  try {
    await page.waitForFunction(
      (t) => Array.from(document.querySelectorAll('.note-text')).some((n) => (n.textContent ?? '').includes(t)),
      text, { timeout, polling: 100 },
    );
    return Date.now() - started;
  } catch {
    return null;
  }
}

async function main() {
  if (!existsSync(NOTES_MAIN)) {
    setupFail([`${NOTES_MAIN} does not exist.`, 'Run: cd notes && npm install && npm run build']);
  }
  if (!existsSync(new URL('../../mobile-ui/dist/index.html', import.meta.url).pathname)) {
    setupFail(['mobile-ui/dist does not exist.', 'Run: cd mobile-ui && npm run build']);
  }

  const notes = await startNotesServer();
  let preview = null;
  let browser = null;
  let bo = null;
  let cy = null;

  try {
    const created = await call('POST', '/spaces', {
      body: {
        name: SPACE_NAME,
        description: 'A room two people are in at the same time.',
        listed: true,
        creator: { displayName: 'Ada' },
      },
    });
    if (created.status !== 200) setupFail([`space creation returned ${created.status}`]);
    const spaceId = created.body.space.id;
    const ada = created.body.token;
    const inviteUrl = created.body.invite.url;

    preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
      cwd: new URL('../../mobile-ui/', import.meta.url).pathname,
      stdio: 'ignore',
    });
    await sleep(3000);
    browser = await chromium.launch({ executablePath: CHROMIUM });

    // === Bo is in the room, and the room says so =========================
    log('\n--- A room that is listening ---');
    bo = await joinAs(browser, inviteUrl, 'Bo');
    await bo.page.waitForSelector('[data-testid="notes-live"][data-state="live"]', { timeout: 15000 });
    check('the room says out loud that it is live, rather than leaving a stopped room looking like a quiet one',
      (await bo.page.locator('[data-testid="notes-live"]').textContent() ?? '').toLowerCase().includes('live'));

    // === Somebody else writes, and Bo's screen changes by itself =========
    log('\n--- Nobody touches this browser again ---');
    const fromAda = `Ada wrote this without Bo pressing anything ${STAMP}.`;
    await call('POST', `/spaces/${spaceId}/notes`, { token: ada, body: { text: fromAda } });
    const arrival = await waitForNote(bo.page, fromAda);
    check('a note written by another member appears on this screen with nobody touching it',
      arrival !== null);
    check('and it arrives when it is written, not when a poll happens to time out',
      arrival !== null && arrival < 8000);

    // === A second browser, and a second member ===========================
    cy = await joinAs(browser, inviteUrl, 'Cy');
    await cy.page.waitForSelector('[data-testid="notes-live"][data-state="live"]', { timeout: 15000 });
    const membersShowCy = await bo.page.waitForFunction(
      () => (document.querySelector('[data-testid="notes-members"]')?.textContent ?? '').includes('Cy'),
      null, { timeout: 12000, polling: 150 },
    ).then(() => true).catch(() => false);
    check('somebody joining shows up in the room while it is open, not on the next reload', membersShowCy);

    const fromCy = `Cy typed this into a real composer ${STAMP}.`;
    await cy.page.locator('[data-testid="notes-composer"]').fill(fromCy);
    await cy.page.locator('[data-testid="notes-composer-submit"]').click();
    check('a note typed in one browser reaches the other browser — two people, one notebook',
      (await waitForNote(bo.page, fromCy)) !== null);
    check('the room\'s own signals move with it, so "is anything happening here" stays true',
      /note/.test(await bo.page.locator('[data-testid="notes-signals"]').textContent() ?? ''));

    // === What arrival must not break =====================================
    // The failure this guards against is created BY the feature above: a
    // screen that rebuilds when a stranger writes is a screen that can throw
    // away a sentence somebody is halfway through.
    log('\n--- A half-written thought survives the room moving ---');
    const halfWritten = 'A half-formed thought, still being typed';
    await bo.page.locator('[data-testid="notes-composer"]').click();
    await bo.page.locator('[data-testid="notes-composer"]').type(halfWritten, { delay: 5 });
    const interrupting = `An interrupting note from Ada ${STAMP}.`;
    await call('POST', `/spaces/${spaceId}/notes`, { token: ada, body: { text: interrupting } });
    const interrupted = await waitForNote(bo.page, interrupting);
    check('the interrupting note really did arrive mid-sentence — otherwise the next two prove nothing',
      interrupted !== null);
    check('the half-written note is still in the composer, whole',
      (await bo.page.locator('[data-testid="notes-composer"]').inputValue()) === halfWritten);
    const caret = await bo.page.evaluate(() => {
      const active = document.activeElement;
      return {
        testid: active instanceof HTMLElement ? active.dataset.testid ?? null : null,
        at: active instanceof HTMLTextAreaElement ? active.selectionStart : null,
      };
    });
    check('and the caret is still in it, at the end of what was typed — a rebuilt DOM does not move the cursor',
      caret.testid === 'notes-composer' && caret.at === halfWritten.length);
    await bo.page.locator('[data-testid="notes-composer"]').fill('');

    // === Two people editing one note =====================================
    // Any member may rewrite any note; that is the point of a shared
    // notebook. What was wrong is that the second save won SILENTLY.
    log('\n--- Two people, one note ---');
    const contested = await call('POST', `/spaces/${spaceId}/notes`, {
      token: ada, body: { text: `Ada's first draft ${STAMP}.` },
    });
    const contestedId = contested.body.note.id;
    await waitForNote(bo.page, `Ada's first draft ${STAMP}.`);

    await bo.page.locator(`[data-testid="note-edit-open-${contestedId}"]`).click();
    await bo.page.locator(`[data-testid="note-edit-${contestedId}"]`).fill(`Bo's rewrite ${STAMP}.`);
    await call('PATCH', `/notes/${contestedId}`, {
      token: ada, body: { text: `Ada's second draft, written while Bo was editing ${STAMP}.`, expectedRev: 0 },
    });
    const warned = await bo.page.waitForSelector(`[data-testid="note-conflict-${contestedId}"]`, { timeout: 12000 })
      .then(() => true).catch(() => false);
    check('an editor whose note moved underneath it is told so while it is still open', warned);
    check('and the person\'s own draft is still on screen — being overtaken loses nobody\'s writing',
      (await bo.page.locator(`[data-testid="note-edit-${contestedId}"]`).inputValue()) === `Bo's rewrite ${STAMP}.`);
    check('the other version is shown too, so there is something to decide between',
      (await bo.page.locator(`[data-testid="note-conflict-theirs-${contestedId}"]`).textContent() ?? '')
        .includes('second draft'));

    // The refusal itself, at the service, with the version Bo's editor was
    // opened against — the exact request the Save button would send.
    const staleSave = await call('PATCH', `/notes/${contestedId}`, {
      token: await tokenOf(bo.page, spaceId), body: { text: `Bo's rewrite ${STAMP}.`, expectedRev: 0 },
    });
    check('the exact request the Save button sends is refused by the service, not applied',
      staleSave.status === 409 && staleSave.body.error === 'note_changed');

    await bo.page.locator(`[data-testid="note-conflict-theirs-take-${contestedId}"]`).click();
    await sleep(500);
    check('keeping theirs closes the editor and leaves their version standing',
      (await noteTexts(bo.page)).some((t) => t.includes('second draft')));

    // And the other choice, which must remain possible: having READ what the
    // other person wrote, a member may still decide their own version is the
    // one the room keeps. That is what "anyone may rewrite any note" means.
    await bo.page.locator(`[data-testid="note-edit-open-${contestedId}"]`).click();
    await bo.page.locator(`[data-testid="note-edit-${contestedId}"]`).fill(`Bo insists ${STAMP}.`);
    await call('PATCH', `/notes/${contestedId}`, {
      token: ada, body: { text: `Ada again ${STAMP}.` },
    });
    await bo.page.waitForSelector(`[data-testid="note-conflict-${contestedId}"]`, { timeout: 12000 });
    await bo.page.locator(`[data-testid="note-conflict-mine-${contestedId}"]`).click();
    await sleep(800);
    check('and overwriting deliberately, after reading theirs, still works — this is a shared notebook',
      (await noteTexts(bo.page)).some((t) => t.includes('Bo insists')));

    // === Letting go of the room ==========================================
    // The ceiling is set to one parked poll for this run, so the question
    // "did the client actually hang up, and did the server actually let go"
    // has an answer rather than an assumption.
    // === Being asked to leave, from both sides of it =====================
    //
    // LAST, and in this order on purpose: Cy is removed, so nothing after this
    // may depend on Cy being in the room. Two browsers is the only way to
    // check the half that matters — a removal one person performs is something
    // ANOTHER person's screen has to notice, without them touching it, which is
    // the same property the whole file exists for.
    log('\n--- Being asked to leave ---');
    const cyMemberId = await cy.page.evaluate(([key, id]) => {
      const raw = localStorage.getItem(key);
      return (JSON.parse(raw ?? '[]').find((m) => m.spaceId === id) ?? {}).memberId ?? null;
    }, [MEMBERSHIPS_KEY, spaceId]);
    await bo.page.locator(`[data-testid="notes-remove-${cyMemberId}"]`).click();
    check('removing somebody takes two presses — it is not one stray tap on a phone',
      (await cy.page.locator('[data-testid="notes-composer"]').count()) === 1);
    await bo.page.locator(`[data-testid="notes-remove-${cyMemberId}"]`).click();

    const roomSaysSo = await bo.page.waitForFunction(
      () => document.querySelector('[data-testid^="note-removal-"]') !== null,
      null, { timeout: 10000, polling: 200 },
    ).then(() => true).catch(() => false);
    check('the room keeps the account of it, in the room, where everyone can read it', roomSaysSo);
    check('and it names who removed whom rather than saying somebody left',
      /Bo removed Cy/.test(await bo.page.locator('[data-testid^="note-removal-"]').first().innerText()));

    // The removed browser is not touched here either. Its next authenticated
    // call fails, and the client already knows what a 401 means.
    const cyIsOut = await cy.page.waitForFunction(
      () => document.querySelector('[data-testid="notes-composer"]') === null,
      null, { timeout: 15000, polling: 250 },
    ).then(() => true).catch(() => false);
    check('the removed screen puts itself out of the room, without anybody touching it', cyIsOut);

    log('\n--- Leaving a room lets go of it ---');
    const boToken = await tokenOf(bo.page, spaceId);
    const held = await call('GET', `/spaces/${spaceId}/events?since=999999`, { token: boToken });
    check('while the room is open the client is holding its one live connection',
      held.status === 429 && held.body.bucket === 'events.parked');
    await bo.page.locator('[data-testid="notes-space-back"]').click();
    await sleep(1200);
    const released = await call('GET', `/spaces/${spaceId}/events?since=0`, { token: boToken });
    check('walking back out of the room frees it again — a browser that wanders off does not spend its own ceiling',
      released.status === 200);
    check('and the screen stops claiming to be live once it is not',
      await bo.page.locator('[data-testid="notes-live"]').count() === 0);

    check('no uncaught page errors in either browser',
      bo.errors.length === 0 && cy.errors.length === 0);
    if (bo.errors.length || cy.errors.length) log(`    ${[...bo.errors, ...cy.errors].join('\n    ')}`);
  } finally {
    await bo?.context.close().catch(() => {});
    await cy?.context.close().catch(() => {});
    await browser?.close().catch(() => {});
    preview?.kill('SIGTERM');
    notes.kill('SIGTERM');
  }

  log('');
  if (failures === 0) log('ALL CHECKS PASSED');
  else log(`${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
