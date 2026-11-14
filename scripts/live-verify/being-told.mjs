#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/being-told.mjs — ROW 6.15's PUSH HALF, END TO END.
//
// THE QUESTION THE ROW WAS OPENED WITH, by the pilot's first participant
// hours after filing the pilot's first critique: *"when someone posts a
// critique, how does the author of the claim find out? If there's no
// notification, discussions might fade simply because the author doesn't know
// someone responded."* The pull half shipped 2026-11-10 — an author can ASK.
// Nothing told them until 2026-11-15.
//
// WHY A SECOND AGENT ON ONE CONDUCTOR IS ENOUGH HERE, where `peer-signal.mjs`
// insists on `network.sh`. That file's claim is about COST — one entry to open
// a channel, zero per signal — and two agents sharing a conductor share a DHT
// store, so a remote signal between them need not cross a transport and would
// flatter the measurement. This file's claim is different: does the host's cap
// grant gate delivery, and does the notice reach a screen. Both happen on the
// receiving conductor, and cross-transport delivery is already `peer-signal`'s
// subject. Stated so nobody reads a green run here as evidence about the wire.
//
// WHAT IS ASSERTED, and the controls are the half that matters:
//
//   - A notice arrives at all, naming the agent who wrote the critique — and
//     the key it names is checked against the key of the agent that actually
//     wrote it, not merely "a key", because a notice rendered from
//     `myAgentPubKey` would pass the weaker form while naming the reader.
//   - NOTHING ARRIVES BEFORE THE OPT-IN. `open_signal_channel` writes the cap
//     grant the host demands; until it exists the host drops the signal. If
//     this control ever passes a notice through, the opt-in is decorative and
//     every other assertion here is measuring something else.
//   - NO SELF-NOTICE. Critiquing your own claim is allowed by this protocol
//     and rendered by 6.18 as *the claim's author*; it must not notify you
//     about your own act.
//   - NO COUNT, NO BADGE, NO TOTAL. 6.15's pull half refused all three on the
//     reasoning that an attention ordering is not a merit ordering but is
//     easily mistaken for one. A push that arrives as a number reintroduces
//     exactly what that half declined, so the absence is asserted rather than
//     left to review.
//
// Prereqs: scripts/sandbox.sh start (clean), `npx vite build` in mobile-ui/.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
//   Injection C: the self-notify guard removed (`if recipient != critique
//   .author` -> `if true`), so critiquing your own claim notifies you.
//   Result: exactly ONE red — *agent1 critiquing agent1's claim adds no
//   notice (1 -> 2)* — and nothing else moved.
//
//   Injection D: `open_signal_channel` called automatically at connect,
//   removing the gesture.
//   Result: THREE red, both section 1 controls among them — a notice arrives
//   before the opt-in is pressed, and the control is no longer offered. The
//   third is downstream: with a notice already present from before the
//   opt-in, the FIRST notice is the Methodological one and section 3 is
//   asking about the Evidential.
//
//   AND INJECTION D KILLED THE RUN THE FIRST TIME, which is the more useful
//   half. With the channel already open the opt-in button is DISABLED, and
//   clicking a disabled button times out and throws — so the harness died
//   with two reds on screen and every check below them unreported. The click
//   is now guarded. A harness that dies against its own injection measures
//   nothing about what it never reached.
//
//   WHAT CANNOT BE INJECTED FROM INSIDE THIS CODEBASE, and it is a limit
//   rather than an omission. Section 1's control rests on the HOST refusing a
//   remote signal to an agent holding no cap grant, and nothing here can
//   withdraw that refusal — the same limit `peer-signal.mjs` records for its
//   own §1. Injection D is the nearest reachable thing: it removes the
//   GESTURE rather than the enforcement, so it proves the control is
//   sensitive to the opt-in being real in this client, not that the host
//   gates delivery. That half is carried by the HDK's behaviour and by
//   `peer-signal.mjs`, not by this file.
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
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
const AGENT2_APP_ID = 'epistemic-resonance-happ-told2';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;
const PREVIEW_PORT = 4181;
const DOMAIN = `Told${Date.now()}`;
const NOTICE_WAIT_MS = 20000;

const nowMicros = () => Date.now() * 1000;
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (u8) => Buffer.from(u8).toString('base64');
/** The twelve characters the UI puts in a byline — not from the front, since
 *  row 6.23: every agent key's base64 begins with the same multihash tag. */
const HASH_TAG_CHARS = 4;
const short = (u8) => `${b64(u8).slice(HASH_TAG_CHARS, HASH_TAG_CHARS + 12)}…`;

let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

async function connectApp(admin, appId) {
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: appId });
  const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      if (cell?.type === CellType.Provisioned || cell?.type === CellType.Cloned) cellIds.push(cell.value.cell_id);
    }
  }
  if (cellIds.length === 0) throw new Error(`App "${appId}" has no provisioned or cloned cells.`);
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  return {
    app,
    me: cellIds[0][1],
    call: (fn, payload) => app.callZome({
      role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload,
    }),
  };
}

/** Refuse rather than run a fixture that is not the one the checks assume. */
async function waitUntil(what, probe, timeoutMs = 20000) {
  const start = Date.now();
  for (;;) {
    let ok = false;
    try { ok = await probe(); } catch { ok = false; }
    if (ok) return;
    if (Date.now() - start > timeoutMs) {
      log(`  SETUP FAILED: ${what} did not become readable within ${timeoutMs}ms.`);
      process.exit(1);
    }
    await sleep(400);
  }
}

const noticeCount = (page) => page.locator('[data-testid="critique-notice"]').count();

async function main() {
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const agent1 = await connectApp(admin, APP_ID);
  log(`agent1 (the UI's own, the claim's author) = ${short(agent1.me)}`);

  const apps = await admin.listApps({});
  if (!apps.some((a) => a.installed_app_id === AGENT2_APP_ID)) {
    const pub = await admin.generateAgentPubKey();
    await admin.installApp({ source: { type: 'path', value: HAPP_PATH }, agent_key: pub, installed_app_id: AGENT2_APP_ID });
    await admin.enableApp({ installed_app_id: AGENT2_APP_ID });
  }
  const agent2 = await connectApp(admin, AGENT2_APP_ID);
  log(`agent2 (the objector)                     = ${short(agent2.me)}\n`);

  if (b64(agent1.me) === b64(agent2.me)) {
    log('  SETUP FAILED: both slots are the same agent, so "the notice names who');
    log('  wrote it" could not fail. Refusing to run.');
    process.exit(1);
  }

  log(`Seeding one claim by agent1 in ${DOMAIN} ...`);
  await agent1.call('create_claim', {
    content: 'Loaded carries reduce recurrence more than rest does.',
    domain: DOMAIN, author: agent1.me, timestamp: nowMicros(),
    evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
  });
  const claims = await agent1.call('get_claims_by_domain', DOMAIN);
  const claimHash = claims[0].signed_action.hashed.content.data.entry_hash;
  await waitUntil("agent1's claim, to agent2",
    async () => (await agent2.call('get_claims_by_domain', DOMAIN)).length > 0);

  const critique = (agent, target, mode, content) => agent.call('create_critique', {
    target, target_type: 'Claim', critique_mode: mode, content,
    author: agent.me, timestamp: nowMicros(),
    replication_attempted: false, evidence_hashes: [], species: null,
  });

  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: new URL('../../mobile-ui/', import.meta.url).pathname, stdio: 'ignore',
  });
  await sleep(4000);

  const browser = await chromium.launch({ executablePath: CHROMIUM });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });

    // The opt-in and the notices live beside the pull half, on By Author.
    await page.getByRole('button', { name: 'By Author', exact: true }).click();
    await page.waitForSelector('[data-testid="notify-optin"]', { timeout: 20000 });

    // === 1. THE CONTROL THAT MAKES THE REST MEAN ANYTHING =================
    log('\n=== 1. CONTROL: nothing arrives before the opt-in ===');
    await critique(agent2, claimHash, 'Methodological',
      'Compared against what rest protocol, and over what follow-up window?');
    await sleep(6000);
    const beforeOptIn = await noticeCount(page);
    check('CONTROL: a critique written BEFORE opting in produces no notice '
      + `(${beforeOptIn}) — the host drops a signal to an agent holding no grant, `
      + 'so the opt-in is load-bearing rather than decorative',
      beforeOptIn === 0);
    check('and the opt-in control is still offered, not already satisfied',
      await page.locator('[data-testid="notify-optin"]').isEnabled());

    // === 2. The opt-in itself =============================================
    log('\n=== 2. The opt-in: one entry, once ===');
    const chainBefore = (await agent1.call('open_signal_channel', null))?.chain_length;
    // GUARDED, AND THE INJECTION IS WHY. Clicking a DISABLED button times out
    // and throws, so under an injection that opens the channel automatically
    // this line killed the run — two reds already on screen and everything
    // below them unreported. A harness that dies against its own injection
    // measures nothing about the checks it never reached, which is this
    // directory's standing crash lesson.
    if (await page.locator('[data-testid="notify-optin"]').isEnabled()) {
      await page.locator('[data-testid="notify-optin"]').click();
    } else {
      log('    the opt-in was already satisfied before it was pressed — see the control above');
    }
    await page.waitForFunction(
      () => document.querySelector('[data-testid="notify-optin"]')?.hasAttribute('disabled'),
      { timeout: 20000 },
    ).catch(() => {});
    check('the control reports the channel open once pressed',
      (await page.locator('[data-testid="notify-optin"]').innerText()).includes('✓'));
    check('and no error surfaced',
      (await page.locator('[data-testid="notify-error"]').count()) === 0);
    log(`    chain_length as agent1 saw it before the click: ${chainBefore}`);

    // === 3. Being told ====================================================
    log('\n=== 3. Being told ===');
    await critique(agent2, claimHash, 'Evidential',
      'The cited trial reports adherence, not recurrence.');
    const deadline = Date.now() + NOTICE_WAIT_MS;
    while ((await noticeCount(page)) === 0 && Date.now() < deadline) await sleep(300);
    const arrived = await noticeCount(page);
    check(`a notice arrives after opting in (${arrived})`, arrived >= 1);

    const noticeText = arrived > 0
      ? await page.locator('[data-testid="critique-notice"]').first().innerText()
      : '';
    log(`    the notice reads: ${noticeText}`);
    // ANCHORED ON agent2's KEY. A notice rendered from `myAgentPubKey` — who
    // is reading rather than who wrote — would satisfy "names an agent".
    check('it names the agent who WROTE the critique, not the one reading it',
      noticeText.includes(short(agent2.me)));
    check('CONTROL: and that is NOT the reader’s own key, so the line above can fail',
      !noticeText.includes(short(agent1.me)));
    check('it says what kind of critique it was', /Evidential/.test(noticeText));

    // === 4. Invariant #1: no number anywhere ==============================
    log('\n=== 4. Invariant #1: a notice is not a score ===');
    // A MISSING AREA COMES BACK AS EMPTY RATHER THAN THROWING, which is this
    // directory's crash lesson and this harness learned it the hard way: the
    // first run died here on `locator.innerText` against an element that was
    // never rendered, taking section 5 with it and reporting nothing about the
    // checks it never reached.
    const noticeArea = (await page.locator('[data-testid="critique-notices"]').count()) > 0
      ? await page.locator('[data-testid="critique-notices"]').innerText()
      : '';
    // NOT "no digit anywhere", WHICH IS WHAT THIS CHECK SAID FIRST AND IT WAS
    // WRONG. A byline is twelve characters of base64 and base64 contains
    // digits, so the naive form reddened on `4RsrWarlaHrD…` — a digit that is
    // not a count, in the one part of the line that must be there. The thing
    // Invariant 1 forbids is a NUMBER STANDING ON ITS OWN: a tally, a badge, a
    // total. That is what is asserted, and the check was narrowed only after
    // watching the broad version fail for a reason that was not a defect.
    const standaloneNumber = /(^|\s)\d+(\s|$|[.,;:)])/;
    check(`no standalone number appears in the notice area — no count, no badge, `
      + `no total (${noticeArea.match(standaloneNumber)?.[0]?.trim() ?? 'none'})`,
      !standaloneNumber.test(noticeArea));
    check('CONTROL: the area is not simply empty, which is what makes that mean something',
      noticeArea.trim().length > 20);

    // === 5. No self-notice ================================================
    log('\n=== 5. Critiquing your own claim tells you nothing ===');
    const beforeSelf = await noticeCount(page);
    await critique(agent1, claimHash, 'Logical', 'On reflection my own sample is thin.');
    await sleep(6000);
    const afterSelf = await noticeCount(page);
    check(`agent1 critiquing agent1’s claim adds no notice (${beforeSelf} -> ${afterSelf})`,
      afterSelf === beforeSelf);
    check('CONTROL: and the earlier notice is still on screen, so a stall would not pass this',
      afterSelf >= 1);

    check('no uncaught page errors', errors.length === 0);
    if (errors.length) log(`  errors: ${errors.join(' | ')}`);
  } finally {
    await browser.close();
    preview.kill();
  }

  log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
