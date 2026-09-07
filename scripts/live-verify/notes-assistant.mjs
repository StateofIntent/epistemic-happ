#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/notes-assistant.mjs — THE AI IN THE ROOM, AS A MEMBER.
//
// The design note's bet is that an assistant living inside a notes space, next
// to the writing that is actually happening, replaces documentation: it can
// explain the difference between a note and a Claim at the moment someone is
// trying to make one, and be "right often enough to be useful and wrong safely
// enough to be corrected". This drives that end to end — a real notes server,
// a real assistant process joining through a real invite link, and a real
// Chromium asking it a question from inside the promotion form.
//
// NO CONDUCTOR, and no API key either.
//
//   No conductor, because everything here happens above the gate. The
//   promotion form is disabled without one and the assistant is not — asking
//   for help with a half-formed note is exactly the thing a person does
//   before they have a conductor, or before they want one.
//
//   No API key, because the assistant's fallback is a real answer rather than
//   a stub: with no ANTHROPIC_API_KEY it answers from a fixed keyword table
//   and SAYS SO in the `source` line the screen renders. That is what keeps
//   this feature demonstrable and verifiable at all, and the honesty of that
//   label is itself checked below. If a key IS present the checks still hold —
//   they assert the shape of an answer and its attribution, never its wording.
//
// THE PROPERTY THIS EXISTS TO PROTECT is that a suggestion is a suggestion.
// The single most tempting thing to build here is a form that fills itself in
// when the answer arrives, and it is the one thing that would turn "AI-assisted
// if you want it" into "the AI decided". So: nothing is applied until a button
// is pressed, the form is complete and usable with the assistant ignored, and
// the assistant is only offered when the room actually contains one.
//
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — the injection PASSED the first time, and that is the
// most useful thing in this file.
//
//   Injection: auto-applying the suggestion when the answer arrives — the
//   single most tempting wrong turn this feature could take, and the one that
//   converts "AI-assisted if you want it" into "the AI decided".
//
//   First result: ALL CHECKS PASSED. The assertion could not fail. It read
//   the mode field before asking and compared it afterwards, and the mode
//   select defaults to the first of the five variants — which is exactly the
//   mode suggested for this note. An auto-apply wrote the value that was
//   already there. This is the same shape as the two weak checks this
//   directory's README records (`founding-ui`, `evidence-retraction-ui`): a
//   label that claims more than its assertion tests.
//
//   Fixed by setting the field, before asking, to a mode the suggestion is
//   demonstrably NOT — read from the answer already collected over HTTP
//   earlier in the run — and by asserting the Claim/Critique switch as well.
//   A check now guards the setup itself, so a future note whose suggestion
//   happens to match cannot quietly hollow the test out again.
//
//   Second result: two reds, precisely the two properties broken.
//
//   AND THE RESTORED RUN STILL WENT RED ONCE, which found a real defect
//   rather than a test artefact: asking the assistant wiped the promotion
//   form. main.ts's render() rebuilds the DOM on every pass, so fields
//   initialised from the note discarded everything typed the moment anything
//   in the space changed — an arriving answer most sharply, but also another
//   member writing a note. Fixed by binding the form to draft state that
//   outlives a render (`promotionDraft` in `notes-ui.ts`). Nothing was
//   injected to find this; the strengthened assertion found it.
// ---------------------------------------------------------------------------
// Prereqs: `cd notes && npm install && npm run build`, and a built UI
// (`cd mobile-ui && npm run build` — vite preview serves `dist/`). Starts and
// stops its own notes server (port 8793) and its own assistant process.
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

const PORT = Number(process.env.EPI_NOTES_TEST_PORT ?? 8793);
const ORIGIN = `http://localhost:${PORT}`;
const PREVIEW_PORT = 4188;
const NOTES_MAIN = new URL('../../notes/dist/main.js', import.meta.url).pathname;
const ASSISTANT_MAIN = new URL('../../notes/dist/assistant-main.js', import.meta.url).pathname;

const STAMP = Date.now();
const SPACE_NAME = `Assisted space ${STAMP}`;
// Deliberately reads as a disagreement from lived practice: the fixed-rules
// suggester should reach Experiential, and a model should too. The checks
// below assert the SHAPE of the answer, never this particular verdict.
const NOTE_TEXT =
  'I tried the loaded-carry protocol exactly as written for six weeks and the grip gave out '
  + 'every time, which does not match what that claim says happens.';

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

async function call(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${ORIGIN}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  try { payload = await res.json(); } catch { /* no body */ }
  return { status: res.status, body: payload };
}

async function startNotesServer() {
  const child = spawn(process.execPath, [NOTES_MAIN], {
    env: { ...process.env, EPI_NOTES_PORT: String(PORT), EPI_NOTES_ORIGIN: ORIGIN, EPI_NOTES_STATE: '' },
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

function startAssistant(inviteUrl) {
  const child = spawn(process.execPath, [ASSISTANT_MAIN, inviteUrl], {
    env: { ...process.env, EPI_NOTES_ORIGIN: ORIGIN, EPI_ASSISTANT_NAME: 'Tutor' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lines = [];
  child.stdout.on('data', (d) => { lines.push(String(d)); });
  child.stderr.on('data', (d) => process.stderr.write(`[assistant stderr] ${d}`));
  return { child, lines };
}

async function main() {
  if (!existsSync(ASSISTANT_MAIN)) {
    setupFail([`${ASSISTANT_MAIN} does not exist.`, 'Run: cd notes && npm install && npm run build']);
  }

  const notes = await startNotesServer();
  let assistant = null;
  let preview = null;
  let browser = null;

  try {
    // === 1. The assistant joins like anyone else ==========================
    log('\n--- An assistant walks in through the front door ---');
    const created = await call('POST', '/spaces', {
      body: {
        name: SPACE_NAME,
        description: 'A room with a tutor in it.',
        listed: true,
        creator: { displayName: 'Ada' },
        examples: ['A rough note, written before it was worth publishing.'],
      },
    });
    if (created.status !== 200) setupFail([`space creation returned ${created.status}`]);
    const spaceId = created.body.space.id;
    const ada = created.body.token;
    const inviteUrl = created.body.invite.url;

    const before = await call('GET', `/spaces/${spaceId}/members`, { token: ada });
    check('before the assistant runs, the room has no AI members',
      before.body.members.filter((m) => m.kind === 'ai').length === 0);

    assistant = startAssistant(inviteUrl);
    let members = [];
    for (let i = 0; i < 60; i++) {
      await sleep(250);
      members = (await call('GET', `/spaces/${spaceId}/members`, { token: ada })).body.members;
      if (members.some((m) => m.kind === 'ai')) break;
    }
    const ai = members.find((m) => m.kind === 'ai');
    check('the assistant joins through an ordinary invite link, as a member', ai !== undefined);
    check('and is visibly an AI, not disguised as another participant', ai?.kind === 'ai');
    check('and advertises what it offers, so the room knows what it is for',
      Array.isArray(ai?.offers) && ai.offers.length > 0);
    check('the space now reports an AI agent in its own descriptive signals',
      (await call('GET', `/spaces/${spaceId}/signals`, { token: ada })).body.signals.aiMembers === 1);
    check('and an invite preview says so before anyone joins — the AI is a reason to walk in',
      (await call('GET', `/invites/${inviteUrl.split('/').pop()}`)).body.preview.aiMembers === 1);

    // === 2. A question, and an answer that says what produced it ==========
    log('\n--- Asking the room ---');
    const note = await call('POST', `/spaces/${spaceId}/notes`, { token: ada, body: { text: NOTE_TEXT } });
    const asked = await call('POST', `/spaces/${spaceId}/assists`, {
      token: ada,
      body: { kind: 'critique-mode', prompt: NOTE_TEXT, noteId: note.body.note.id },
    });
    check('a member can ask the room how something might be published', asked.status === 200);
    check('and the question starts unanswered', asked.body.assist.answeredAt === null);

    let answered = null;
    for (let i = 0; i < 120; i++) {
      await sleep(500);
      const current = await call('GET', `/assists/${asked.body.assist.id}`, { token: ada });
      if (current.body.assist.answeredAt !== null) { answered = current.body.assist; break; }
    }
    if (!answered) setupFail(['the assistant never answered. Check its stderr above.']);

    check('the assistant answers', typeof answered.answer === 'string' && answered.answer.length > 20);
    check('the answer is attributed to the member that gave it', answered.answeredBy === ai.id);
    check('and states what produced it, rather than arriving as the system\'s own view',
      typeof answered.source === 'string' && answered.source.length > 0);
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      check('with no API key, the answer says plainly that it came from fixed rules — a labelled '
        + 'fallback rather than a stub or a silence',
        /rule/i.test(answered.source) && /no model|ANTHROPIC_API_KEY/i.test(answered.source));
      check('and it declines to draft the published wording, which a keyword table has no business doing',
        answered.suggestion?.wording === null);
    } else {
      check('with a key present, the answer names the model that produced it',
        /claude/i.test(answered.source));
    }
    check('the structured suggestion names one of the protocol\'s five modes, or none at all',
      answered.suggestion === null || answered.suggestion.critiqueMode === null
      || ['Experiential', 'Methodological', 'Logical', 'Evidential', 'Phenomenological']
        .includes(answered.suggestion.critiqueMode));

    // The thing that must NOT have happened.
    const noteAfter = (await call('GET', `/spaces/${spaceId}/notes`, { token: ada })).body.notes
      .find((n) => n.id === note.body.note.id);
    check('answering changed nothing about the note itself', noteAfter.text === NOTE_TEXT);
    check('and published nothing — a suggestion is not a promotion', noteAfter.promotions.length === 0);

    const second = await call('POST', `/assists/${asked.body.assist.id}/answer`, {
      token: ada, body: { answer: 'Overwriting someone else\'s answer.' },
    });
    check('an answered question cannot be answered over the top of — first answer wins',
      second.status === 409);

    const everyone = await call('GET', `/spaces/${spaceId}/assists`, { token: ada });
    check('questions and answers are visible to the whole room, not whispered to the asker',
      everyone.body.assists.length === 1 && everyone.body.assists[0].answer !== null);

    // === 3. The same thing, from inside the promotion form ================
    log('\n--- From inside the form, in a real browser ---');
    preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
      cwd: new URL('../../mobile-ui/', import.meta.url).pathname,
      stdio: 'ignore',
    });
    await sleep(3000);
    browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript((origin) => {
      try { localStorage.setItem('epistemic-mobile-ui:notes-origin', origin); } catch { /* private mode */ }
    }, ORIGIN);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="connect-to-notes"]').click();
    await page.waitForSelector('[data-testid="notes-invite-input"]', { timeout: 10000 });
    await page.locator('[data-testid="notes-invite-input"]').fill(inviteUrl);
    await page.locator('[data-testid="notes-invite-open"]').click();
    await page.waitForSelector('[data-testid="notes-join-name"]', { timeout: 10000 });
    const offersLine = await page.locator('[data-testid="notes-invite-offers"]').textContent().catch(() => null);
    check('the invite preview tells a newcomer what help the room offers',
      (offersLine ?? '').length > 0);
    await page.locator('[data-testid="notes-join-name"]').fill('Brun');
    await page.locator('[data-testid="notes-join-submit"]').click();
    await page.waitForSelector('[data-testid="notes-composer"]', { timeout: 10000 });
    await page.waitForFunction(
      (text) => Array.from(document.querySelectorAll('.note-text')).some((n) => n.textContent?.includes(text)),
      NOTE_TEXT, { timeout: 10000 }).catch(() => {});

    const card = page.locator('.note-card', { hasText: NOTE_TEXT.slice(0, 40) });
    await card.getByRole('button', { name: /publish a stronger version/i }).click();
    await page.waitForSelector('[data-testid="promotion-submit"]', { timeout: 10000 });

    check('the promotion form offers the room\'s assistant, because the room has one',
      await page.locator('[data-testid="assist-block"]').count() === 1);
    check('and the form is fully usable without asking — the assistant is not the only way in',
      await page.locator('[data-testid="promotion-mode"]').count() === 1
      && await page.locator('[data-testid="promotion-content"]').count() === 1);

    // The fields are deliberately set to values the suggestion is NOT, using
    // the answer already collected over HTTP above. Without this the check
    // below cannot fail: the mode select defaults to the first of the five,
    // and the suggestion for this note is that same one — so an auto-apply
    // would write the value that was already there and the assertion would
    // pass while the property was broken. Observed, not theorised; see this
    // file's NEGATIVE EVIDENCE block.
    const MODES = ['Experiential', 'Methodological', 'Logical', 'Evidential', 'Phenomenological'];
    const suggestedMode = answered.suggestion?.critiqueMode ?? null;
    const unlikeSuggestion = MODES.find((mode) => mode !== suggestedMode);
    // The mode select lives inside the critique half of the form, which is
    // hidden while the kind is "claim" — so it is revealed, set, and hidden
    // again, and every value is read with evaluate() rather than
    // inputValue(), which would wait for visibility it does not need.
    const valueOf = (testid) =>
      page.locator(`[data-testid="${testid}"]`).evaluate((el) => el.value);
    await page.locator('[data-testid="promotion-kind"]').selectOption('critique');
    await page.locator('[data-testid="promotion-mode"]').selectOption(unlikeSuggestion);
    await page.locator('[data-testid="promotion-kind"]').selectOption('claim');
    const modeBefore = await valueOf('promotion-mode');
    const kindBefore = await valueOf('promotion-kind');
    const contentBefore = await valueOf('promotion-content');
    check('the check below can actually fail — the field is set to a mode the suggestion is not',
      suggestedMode === null || modeBefore !== suggestedMode);

    await page.locator('[data-testid="assist-ask"]').click();
    await page.waitForSelector('[data-testid="assist-answer"]', { timeout: 60000 });
    check('the answer arrives in the form', await page.locator('[data-testid="assist-answer"]').count() === 1);
    const sourceLine = await page.locator('[data-testid="assist-source"]').textContent();
    check('the screen names who suggested it and what produced it',
      /Tutor/.test(sourceLine ?? '') && /AI/.test(sourceLine ?? ''));
    check('and says in as many words that it is a suggestion rather than a verdict',
      /suggestion, not a verdict/i.test(sourceLine ?? ''));

    // THE property. An answer that fills the form in is the one wrong turn
    // this feature could take.
    check('NOTHING was applied on arrival — the mode field is untouched',
      await valueOf('promotion-mode') === modeBefore);
    check('nor was the form switched from a Claim to a Critique behind the reader\'s back',
      await valueOf('promotion-kind') === kindBefore);
    check('and the wording is untouched', await valueOf('promotion-content') === contentBefore);

    const applyMode = page.locator('[data-testid="assist-apply-mode"]');
    if (await applyMode.count() === 1) {
      await applyMode.click();
      const after = await valueOf('promotion-mode');
      check('pressing the button applies the suggested mode, and only then',
        after !== '' && ['Experiential', 'Methodological', 'Logical', 'Evidential', 'Phenomenological'].includes(after));
      check('and applying a critique mode switches the form to a Critique, since a mode implies one',
        await valueOf('promotion-kind') === 'critique');
    } else {
      log('    (no mode was suggested for this note — the apply path is not exercised)');
    }

    await page.locator('[data-testid="assist-dismiss"]').click();
    check('and a suggestion can be thrown away', await page.locator('[data-testid="assist-answer"]').count() === 0);

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    check('the assisted form does not scroll sideways at 390px', !overflow);
    check('no uncaught page errors', pageErrors.length === 0);
    if (pageErrors.length) for (const e of pageErrors) log(`    ${e}`);

    await context.close();
  } finally {
    if (browser) await browser.close();
    if (preview) preview.kill();
    if (assistant) assistant.child.kill('SIGTERM');
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
