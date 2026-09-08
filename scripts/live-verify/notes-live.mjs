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
async function joinAs(browser, inviteUrl, displayName) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript((origin) => {
    try { localStorage.setItem('epistemic-mobile-ui:notes-origin', origin); } catch { /* private mode */ }
  }, ORIGIN);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="connect-to-notes"]').click();
  await page.waitForSelector('[data-testid="notes-invite-input"]', { timeout: 15000 });
  await page.locator('[data-testid="notes-invite-input"]').fill(inviteUrl);
  await page.locator('[data-testid="notes-invite-open"]').click();
  await page.waitForSelector('[data-testid="notes-join-name"]', { timeout: 15000 });
  await page.locator('[data-testid="notes-join-name"]').fill(displayName);
  await page.locator('[data-testid="notes-join-submit"]').click();
  await page.waitForSelector('[data-testid="notes-composer"]', { timeout: 15000 });
  return { context, page, errors };
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
    browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });

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
