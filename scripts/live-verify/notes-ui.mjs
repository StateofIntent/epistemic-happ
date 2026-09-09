#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/notes-ui.mjs — THE GATE, DRIVEN BY A REAL BROWSER.
//
// `notes-layer.mjs` proves the soft layer's rules against its own service.
// This proves the part that service structurally cannot do: carrying a note
// across into the protocol, in a real Chromium, under a real agent key,
// against a real conductor — and then verifying the published entry with an
// INDEPENDENT zome call rather than believing the screen.
//
// THREE PROCESSES, and all three are real: a `notes/` server, `vite preview`
// serving the production `dist/` bundle, and an `hc sandbox` conductor. The
// browser is the only thing that touches all three, which is the point — the
// promotion path exists nowhere else in the system, and its whole design is
// that the two halves stay apart.
//
// WHAT IS ACTUALLY WORTH CHECKING HERE, beyond "the button works":
//
//   1. The soft layer is reachable WITHOUT a conductor. If the notes room
//      were only available after the connect screen, the ceremony this layer
//      exists to sit in front of would be back in front of it. Checked first,
//      before any conductor is involved at all.
//   2. The promotion form is rendered and DISABLED while unconnected, and
//      says why. This codebase's rule for an unavailable affordance
//      (`affordance-surfacing.mjs`) applied to the one act that crosses.
//   3. What was published is what was read. The excerpt captured when the
//      form opened, not the note's text at submit time — notes here are
//      editable by anyone in the space.
//   4. The note SURVIVES promotion, and records the hash. Promotion is not a
//      move; the soft copy stays soft.
//   5. Nothing on the screen ranks anything. The directory's ordering control
//      offers exactly two options, and neither is about popularity.
//   6. Two members, two browser contexts, one invite link. A shared notebook
//      that only ever has one member in a test is not shared.
//
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — watched failing twice, and the first attempt at each
// exposed a weakness in this harness rather than in the code.
//
//   Injection A: the promotion form returns empty when there is no
//   connection, instead of rendering disabled with a reason.
//   Result: four reds, all in section 3. The first attempt did not report
//   them at all — a bare `waitFor` on the submit button died as a Playwright
//   timeout, which is the exact complaint this directory's README records
//   against `launcher-packaging`'s first regression report. Every wait that
//   could legitimately fail is now bounded and then asserted.
//
//   Injection B: deleting the note after a successful promotion — promotion
//   as a MOVE rather than a copy, which is the single most plausible wrong
//   turn this design could take.
//   Result: three reds in section 7, and — correctly — the four DHT checks
//   above them stayed green. The Claim really was published; what broke was
//   the soft copy surviving, which is a different property and is asserted
//   separately for exactly this reason.
//
//   A THIRD DEFECT WAS FOUND WITHOUT ANY INJECTION, on the first run: an
//   empty `EPI_NOTES_STATE` was treated as a filename rather than as
//   "unset", so the notes service started, served every read, and threw
//   ENOENT on the first WRITE. Fixed in `notes/src/main.ts` and guarded in
//   `notes-layer.mjs` rather than worked around here.
//
//   A FOURTH, also unforced: a space still being read rendered as an empty
//   room. A newcomer who had just followed an invite was told the room was
//   dead. Fixed by distinguishing "not read yet" from "nothing here" — the
//   same rule this codebase applies to adoption counts and grounding.
// ---------------------------------------------------------------------------
// Prereqs: a CLEAN sandbox (`scripts/sandbox.sh clean && start`), a built UI
// (`scripts/pack-webhapp.sh`, or `cd mobile-ui && npm run build` — vite
// preview serves `dist/`, so a stale build verifies the previous version of
// this screen), and a built notes service (`cd notes && npm install && npm run
// build`). It starts and stops its own notes server on port 8792.
//
// It spends one unit of the SWO critique budget (one promoted Critique) and
// publishes two Claims, so it wants a clean conductor like everything else in
// this directory.
// ============================================================================

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { decode } from '@msgpack/msgpack';
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

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_ID = 'epistemic-resonance-happ';
const PREVIEW_PORT = 4187;
const NOTES_PORT = 8792;
const NOTES_ORIGIN = `http://localhost:${NOTES_PORT}`;
const NOTES_MAIN = new URL('../../notes/dist/main.js', import.meta.url).pathname;

const STAMP = Date.now();
const DOMAIN = `NotesGate${STAMP}`;
const SPACE_NAME = `Loaded carries ${STAMP}`;
const NOTE_TEXT = `Grip gave out before the shoulder did, six sessions running (${STAMP}).`;
const PROMOTED_SENTENCE = 'Grip gave out before the shoulder did, six sessions running';
const SECOND_MEMBER_NOTE = `Brun's note, stamped ${STAMP}.`;
const TARGET_CLAIM = `A claim to be critiqued from the notes layer, stamped ${STAMP}.`;

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

/** Wait, bounded, for a note carrying `text` to render, and answer whether it
 * did rather than throwing.
 *
 * Every place this replaces was a bare `waitForFunction`, which fails as a raw
 * Playwright TimeoutError naming a line number and no check — the exact
 * complaint this file's header records against `launcher-packaging`'s first
 * regression report, left standing in three places here. Worse than the
 * unhelpful shape is that it conflates two unrelated diagnoses: a note that is
 * rendering slowly, and a write the room REFUSED, which paints an error in the
 * composer and renders no note at all. `notes-layer.mjs` proves those ceilings
 * refuse for real, so a refusal here is an ordinary thing to hit and was
 * indistinguishable from a hang. On a miss this now says which it was. */
async function noteAppeared(target, text) {
  const ok = await target.waitForFunction(
    (t) => Array.from(document.querySelectorAll('.note-text')).some((n) => n.textContent?.includes(t)),
    text, { timeout: 10000 },
  ).then(() => true).catch(() => false);
  if (!ok) {
    const said = (await target.locator('.error-box').allTextContents()).map((s) => s.trim()).filter(Boolean);
    log(`    (no note rendered after 10s; the composer says: ${said.length ? said.join(' | ') : '<nothing>'})`);
  }
  return ok;
}
const b64 = (u8) => Buffer.from(u8).toString('base64');
const nowMicros = () => Date.now() * 1000;
const entryOf = (record) => decode(record.entry.Present.entry);

async function connectApp(admin, appId) {
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: appId });
  const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const cellIds = [];
  for (const rc of Object.values(info.cell_info)) {
    for (const c of rc) {
      if (c?.type === CellType.Provisioned || c?.type === CellType.Cloned) cellIds.push(c.value.cell_id);
    }
  }
  if (cellIds.length === 0) setupFail([`App "${appId}" has no provisioned cells.`]);
  for (const id of cellIds) await admin.authorizeSigningCredentials(id);
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { me: cellIds[0][1], call };
}

async function startNotesServer() {
  const child = spawn(process.execPath, [NOTES_MAIN], {
    env: { ...process.env, EPI_NOTES_PORT: String(NOTES_PORT), EPI_NOTES_ORIGIN: NOTES_ORIGIN, EPI_NOTES_STATE: '' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.on('data', (d) => process.stderr.write(`[notes stderr] ${d}`));
  for (let i = 0; i < 100; i++) {
    await sleep(50);
    try {
      if ((await fetch(`${NOTES_ORIGIN}/health`)).ok) return child;
    } catch { /* not up yet */ }
  }
  child.kill('SIGKILL');
  setupFail([`the notes server never answered /health on ${NOTES_ORIGIN}.`]);
}

/** Points a page's stored notes-server origin at this run's server before the
 * app boots, so no screen has to be driven just to type an address. The real
 * form is exercised separately below. */
async function seedOrigin(context) {
  await context.addInitScript((origin) => {
    try { localStorage.setItem('epistemic-mobile-ui:notes-origin', origin); } catch { /* private mode */ }
  }, NOTES_ORIGIN);
}

async function main() {
  if (!existsSync(NOTES_MAIN)) {
    setupFail([
      `${NOTES_MAIN} does not exist.`,
      'Run: cd notes && npm install && npm run build',
    ]);
  }

  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const agent = await connectApp(admin, APP_ID);
  log(`agent = ${b64(agent.me).slice(0, 12)}…`);

  // A real claim for the critique half to point at. Published here rather
  // than through the UI so the critique target is unambiguously not
  // something this screen invented.
  await agent.call('create_claim', {
    content: TARGET_CLAIM,
    domain: DOMAIN,
    author: agent.me,
    timestamp: nowMicros(),
    evidence_hashes: [],
    confidence: 'Moderate',
    semantic_tags: [],
    source_mew: null,
  });

  const notes = await startNotesServer();
  log(`notes server up on ${NOTES_ORIGIN}`);

  log('Starting vite preview (production bundle) ...');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: new URL('../../mobile-ui/', import.meta.url).pathname,
    stdio: 'ignore',
  });
  await sleep(3000);

  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await seedOrigin(context);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  let inviteUrl = null;

  try {
    // === 1. The soft layer is reachable with no conductor at all ===========
    log('\n=== 1. A door that does not go through the connect screen ===');
    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
    const soloDoor = page.locator('[data-testid="connect-to-notes"]');
    check('the connect screen offers the notes layer as a second door',
      await soloDoor.count() === 1);
    await soloDoor.click();
    await page.waitForSelector('[data-testid="notes-solo-banner"]', { timeout: 10000 });
    check('following it reaches the notes layer without ever connecting to a conductor',
      await page.locator('[data-testid="notes-solo-banner"]').count() === 1);
    check('and the app is genuinely not connected — the tab bar is not there',
      await page.locator('.tab-bar').count() === 0);

    // === 2. Starting a space, writing a note ==============================
    log('\n=== 2. A space, and something half-formed in it ===');
    await page.locator('[data-testid="notes-start-space"]').click();
    await page.locator('[data-testid="notes-create-name"]').fill(SPACE_NAME);
    await page.locator('[data-testid="notes-create-description"]').fill(
      'Working notes on loaded-carry progressions, before any of it is worth publishing.');
    await page.locator('[data-testid="notes-create-tags"]').fill('rehab, strength');
    await page.locator('[data-testid="notes-create-examples"]').fill(
      'Rotator cuff fine at 32kg, grip gave out first.\nSix weeks in, asymmetry gone.');
    await page.locator('[data-testid="notes-create-you"]').fill('Ada');
    await page.locator('[data-testid="notes-create-listed"]').check();
    await page.locator('[data-testid="notes-create-submit"]').click();
    await page.waitForSelector('[data-testid="notes-composer"]', { timeout: 10000 });
    check('creating a space drops you straight into it', await page.locator('[data-testid="notes-composer"]').count() === 1);

    await page.locator('[data-testid="notes-composer"]').fill(NOTE_TEXT);
    await page.locator('[data-testid="notes-composer-submit"]').click();
    check('a note written in the browser is there', await noteAppeared(page, NOTE_TEXT));

    const signals = await page.locator('[data-testid="notes-signals"]').textContent();
    check('activity is stated as a sentence about this room, not a figure to compare',
      /notes this week/.test(signals ?? '') && /active today/.test(signals ?? ''));

    // === 3. The gate is visible and refuses, politely, with no conductor ===
    log('\n=== 3. The gate, before there is an agent key to sign with ===');
    const noteCard = page.locator('.note-card', { hasText: NOTE_TEXT });
    await noteCard.getByRole('button', { name: /publish a stronger version/i }).click();
    const submit = page.locator('[data-testid="promotion-submit"]');
    // Bounded, and then asserted — never a bare waitFor. A hidden form would
    // otherwise surface as a Playwright timeout, which is true and useless:
    // the same complaint this directory's README records against
    // `launcher-packaging`'s first regression report.
    await submit.waitFor({ timeout: 10000 }).catch(() => {});
    const rendered = await submit.count() === 1;
    check('the promotion form is RENDERED rather than hidden — hiding it would tell someone '
      + 'the notes layer cannot reach the protocol at all', rendered);
    check('and it is disabled, because there is no key to sign with',
      rendered && await submit.isDisabled());
    const why = rendered
      ? await page.locator('[data-testid="promotion-unavailable"]').textContent().catch(() => null)
      : null;
    check('and it says why, naming the conductor rather than failing silently',
      /conductor/i.test(why ?? '') && /agent key/i.test(why ?? ''));
    check('the notes server is not offered as a way round it',
      why !== null && !/notes server (can|will) (sign|publish)/i.test(why));
    if (rendered) await page.locator('[data-testid="promotion-cancel"]').click();

    // The invite link, needed by the second member below.
    await page.locator('[data-testid="notes-invites"] summary').click();
    const inviteCode = page.locator('.notes-invite-url').first();
    await inviteCode.waitFor({ timeout: 10000 });
    inviteUrl = (await inviteCode.textContent())?.trim() ?? null;
    check('a space has an invite link to hand out, without anyone minting one',
      typeof inviteUrl === 'string' && inviteUrl.includes('/invites/'));

    // === 4. The directory offers two orderings and no ranking =============
    log('\n=== 4. Discovery that is not a leaderboard ===');
    await page.locator('[data-testid="notes-space-back"]').click();
    await page.locator('[data-testid="notes-directory-refresh"]').click();
    await page.waitForSelector('[data-testid="notes-directory"]', { timeout: 10000 });
    const sortOptions = await page.locator('[data-testid="notes-directory-sort"] option')
      .evaluateAll((els) => els.map((e) => e.value));
    check('the ordering control offers exactly two options',
      sortOptions.length === 2 && sortOptions.includes('recent') && sortOptions.includes('alphabetical'));
    check('and neither is about popularity, activity volume or a "top" list',
      !sortOptions.some((v) => /pop|top|rank|active|trend|best/i.test(v)));
    const directoryText = await page.locator('[data-testid="notes-directory"]').textContent();
    check('a listed space is findable in the directory', (directoryText ?? '').includes(SPACE_NAME));
    check('a directory row says how many people are there and when something last happened',
      /\d+ (person|people)/.test(directoryText ?? '') && /last activity/.test(directoryText ?? ''));
    check('and nothing on the row reads as a score or a position',
      !/#\d|\brank\b|\btop\b|\d+ points/i.test(directoryText ?? ''));

    // === 5. A second member, a second browser, one invite link ============
    log('\n=== 5. Two members — a notebook with one member is not shared ===');
    const brunContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await seedOrigin(brunContext);
    const brun = await brunContext.newPage();
    await brun.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
    await brun.locator('[data-testid="connect-to-notes"]').click();
    await brun.waitForSelector('[data-testid="notes-invite-input"]', { timeout: 10000 });
    await brun.locator('[data-testid="notes-invite-input"]').fill(inviteUrl);
    await brun.locator('[data-testid="notes-invite-open"]').click();
    await brun.waitForSelector('[data-testid="notes-invite-examples"]', { timeout: 10000 });
    const examples = await brun.locator('[data-testid="notes-invite-examples"]').textContent();
    check('a newcomer sees the creator\'s example notes BEFORE joining',
      /grip gave out first/i.test(examples ?? ''));
    check('and is told who is already in the room',
      /\d+ (person|people)/.test(await brun.locator('[data-testid="notes-invite-meta"]').textContent() ?? ''));
    await brun.locator('[data-testid="notes-join-name"]').fill('Brun');
    await brun.locator('[data-testid="notes-join-submit"]').click();
    await brun.waitForSelector('[data-testid="notes-composer"]', { timeout: 10000 });
    // The room's notes arrive on a second request, so this waits for them —
    // and the screen must say it is still reading rather than rendering an
    // unloaded room as an empty one, which is asserted first.
    check('a room being read is not rendered as an empty room',
      await brun.locator('[data-testid="notes-empty"]').count() === 0);
    await brun.waitForFunction(
      (text) => Array.from(document.querySelectorAll('.note-text')).some((n) => n.textContent?.includes(text)),
      NOTE_TEXT, { timeout: 10000 }).catch(() => {});
    const brunSees = await brun.locator('[data-testid="notes-list"]').textContent();
    check('joining through the link shows the room\'s existing notes', (brunSees ?? '').includes(NOTE_TEXT));
    await brun.locator('[data-testid="notes-composer"]').fill(SECOND_MEMBER_NOTE);
    await brun.locator('[data-testid="notes-composer-submit"]').click();
    check("the second member's own note appears in their own view",
      await noteAppeared(brun, SECOND_MEMBER_NOTE));

    // === 6. Connect a conductor; the room is still there ==================
    log('\n=== 6. The same room, now with an agent key behind it ===');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });
    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await page.waitForSelector('[data-testid="notes-my-spaces"]', { timeout: 10000 });
    check('the space this browser joined survives connecting a conductor',
      (await page.locator('[data-testid="notes-my-spaces"]').textContent() ?? '').includes(SPACE_NAME));
    await page.locator('[data-testid="notes-my-spaces"] button').first().click();
    await page.waitForSelector('[data-testid="notes-list"]', { timeout: 10000 });
    // The list CONTAINER renders before the notes in it: they arrive on a
    // second request, which section 5 above already accounts for and this did
    // not. Bounded and then asserted, never a bare wait — a note that is
    // genuinely absent still fails the check below, so the wait cannot turn
    // the assertion into a no-op; only the read-too-early case changes.
    //
    // Found by CI on its first run, having raced invisibly here for as long as
    // this harness has existed: a development machine always won the race, and
    // a slower runner did not. The tell that it was the harness and not the
    // room is section 7 immediately below, which finds and promotes a note
    // from this very list and passed in the same failing run.
    await noteAppeared(page, SECOND_MEMBER_NOTE);
    const bothNotes = await page.locator('[data-testid="notes-list"]').textContent();
    check('and the other member\'s note is there — this is one shared notebook',
      (bothNotes ?? '').includes(SECOND_MEMBER_NOTE));

    // === 7. Promotion: a note becomes a real Claim ========================
    log('\n=== 7. Across the gate, as a Claim ===');
    const claimsBefore = await agent.call('get_claims_by_domain', DOMAIN);
    const card = page.locator('.note-card', { hasText: NOTE_TEXT });
    await card.getByRole('button', { name: /publish a stronger version/i }).click();
    await page.locator('[data-testid="promotion-submit"]').waitFor({ timeout: 10000 });
    check('with a conductor connected, the same form is now available',
      !(await page.locator('[data-testid="promotion-submit"]').isDisabled()));
    await page.locator('[data-testid="promotion-content"]').fill(PROMOTED_SENTENCE);
    await page.locator('[data-testid="promotion-domain"]').fill(DOMAIN);
    await page.locator('[data-testid="promotion-submit"]').click();
    // Bounded and then asserted, never a bare wait: if promotion MOVED the
    // note instead of leaving it, this would otherwise die as a timeout and
    // report nothing about the property that actually broke.
    await page.waitForFunction(
      () => document.querySelectorAll('.note-promotions').length > 0,
      null, { timeout: 20000 }).catch(() => {});

    // The independent confirmation. Everything above is the screen's own
    // word for what happened; this is the DHT's.
    const claimsAfter = await agent.call('get_claims_by_domain', DOMAIN);
    const promotedClaim = claimsAfter.map(entryOf).find((c) => c.content === PROMOTED_SENTENCE);
    check('a real Claim exists on the conductor, read back by a separate client',
      promotedClaim !== undefined);
    check('exactly one Claim was published, not one per render',
      claimsAfter.length === claimsBefore.length + 1);
    check('it carries the domain the form asked for', promotedClaim?.domain === DOMAIN);
    check('and it is authored by the practitioner\'s own agent key, not by the notes server',
      promotedClaim !== undefined && b64(promotedClaim.author) === b64(agent.me));

    const cardAfter = page.locator('.note-card', { hasText: NOTE_TEXT });
    const noteSurvived = await cardAfter.count() === 1;
    check('the note itself is STILL THERE — promotion is not a move', noteSurvived);
    const promotionText = noteSurvived
      ? await cardAfter.locator('.note-promotions').textContent().catch(() => null)
      : null;
    check('and the note now records that it crossed, as a Claim',
      /published as a claim/i.test(promotionText ?? ''));
    const hashText = noteSurvived
      ? await cardAfter.locator('.promotion-hash').textContent().catch(() => null)
      : null;
    check('with the published entry\'s own hash beside it', (hashText ?? '').length > 20);

    // === 8. Promotion as a typed Critique =================================
    log('\n=== 8. Across the gate, as a typed Critique ===');
    // Browse the domain first: a critique needs a claim to point at, and the
    // form offers the claims the app has actually loaded rather than asking
    // anyone to paste a base64 hash.
    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await page.locator('.search-row input').first().fill(DOMAIN);
    await page.locator('.search-row button').first().click();
    await page.waitForTimeout(2000);
    // Coming back to the Notes tab returns to the space that was open, not to
    // the space list — the screen remembers where you were, the same as every
    // other tab in this app.
    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await page.waitForSelector('[data-testid="notes-list"]', { timeout: 10000 });
    check('returning to the Notes tab comes back to the room you were in',
      await page.locator('[data-testid="notes-composer"]').count() === 1);

    const brunCard = page.locator('.note-card', { hasText: SECOND_MEMBER_NOTE });
    await brunCard.getByRole('button', { name: /publish a stronger version/i }).click();
    await page.locator('[data-testid="promotion-kind"]').selectOption('critique');
    const modeOptions = await page.locator('[data-testid="promotion-mode"] option')
      .evaluateAll((els) => els.map((e) => e.textContent ?? ''));
    check('the critique mode is asked for in plain language, not as five bare enum names',
      modeOptions.length === 5 && modeOptions.every((t) => t.includes('—') && t.length > 20));
    check('and free text is not offered as a sixth option',
      !modeOptions.some((t) => /other|free|custom/i.test(t)));

    const targetOptions = await page.locator('[data-testid="promotion-target"] option')
      .evaluateAll((els) => els.map((e) => e.textContent ?? ''));
    const hasTarget = targetOptions.some((t) => t.includes(TARGET_CLAIM.slice(0, 40)));
    check('claims already on screen are offered as targets, so nobody pastes a hash', hasTarget);
    if (!hasTarget) {
      log('    (skipping the critique publish — no target was offered to select)');
    } else {
      await page.locator('[data-testid="promotion-target"]')
        .selectOption({ label: targetOptions.find((t) => t.includes(TARGET_CLAIM.slice(0, 40))) });
      await page.locator('[data-testid="promotion-mode"]').selectOption('Experiential');
      await page.locator('[data-testid="promotion-content"]').fill(
        `Tried it and saw the opposite, stamped ${STAMP}.`);
      await page.locator('[data-testid="promotion-submit"]').click();
      await page.waitForTimeout(4000);

      const targetRecord = claimsAfter.find((r) => entryOf(r).content === TARGET_CLAIM);
      const critiques = await agent.call(
        'get_critiques_for', targetRecord.signed_action.hashed.content.data.entry_hash);
      const promotedCritique = critiques.map(entryOf)
        .find((c) => c.content === `Tried it and saw the opposite, stamped ${STAMP}.`);
      check('a real Critique exists on the conductor, against the claim that was chosen',
        promotedCritique !== undefined);
      check('and it carries the typed mode the form asked for in plain words',
        promotedCritique?.critique_mode === 'Experiential');
    }

    // === 9. Layout, at the width this UI is for ===========================
    log('\n=== 9. It fits ===');
    for (const width of [390, 360, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      check(`the notes screen does not scroll sideways at ${width}px`, !overflow);
    }
    // The two unbreakable tokens this screen introduces. An invite URL and a
    // base64 ActionHash have no spaces and are longer than a phone is wide.
    const wideToken = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('.promotion-hash, .notes-invite-url'));
      return nodes.some((n) => n.getBoundingClientRect().right > document.documentElement.clientWidth + 1);
    });
    check('and neither the invite link nor the published hash runs off the edge', !wideToken);

    check('no uncaught page errors during the whole run', pageErrors.length === 0);
    if (pageErrors.length) for (const e of pageErrors) log(`    ${e}`);

    await brunContext.close();
  } finally {
    await browser.close();
    preview.kill();
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
