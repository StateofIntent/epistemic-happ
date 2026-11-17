#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/founding-is-findable.mjs — the app says that founding is
// what makes a domain findable, at the moment somebody is choosing not to.
//
// WHY THIS EXISTS, AND IT IS A DECISION'S INSTRUMENT RATHER THAN A FEATURE'S
// TEST. Row 6.12's `[D]` — whether founding becomes the price of being
// findable — was TAKEN on 2026-11-15: require founding, `get_membranes` is the
// index, and bump candidate 4.7 was withdrawn rather than scheduled. It was
// taken AGAINST the branch 6.12 and 4.7 both pointed at, and the reason was a
// measurement rather than an argument: those rows rested on a participant's
// revealed preference — they published a claim saying the founding step was
// worth it, then filed that claim into somebody else's domain — and read it as
// having priced the step. It had not. On that date `findable`, `be found` and
// `discoverable` had ZERO user-facing occurrences in mobile-ui/src/main.ts,
// and the "just one more click away" the participant quoted was the Domains
// tab's own `it costs nothing`. The app had never told anybody a step existed.
//
// SO WHAT THIS GATES IS THE THING THAT MAKES THE DECISION REVERSIBLE. 6.12
// records the measurement that would overturn it: a participant who declines
// founding AFTER being told what declining costs. Until these three surfaces
// shipped, a refusal to found was evidence of nothing, because it was never a
// choice anybody was offered. Every check below is therefore about what the
// screen SAYS, and the hardest ones are about what it must not say.
//
// THE THREE SURFACES, which are 6.12's own list:
//
//   1. THE DOMAINS TAB SAYS WHAT IT LISTS. It is a registry of the FOUNDED,
//      not an index of every domain in use, and as shipped nothing said so —
//      the tab is labelled "Domains" and the button says "Load domains", so a
//      reader was left to infer it held everything. 6.12 named that as the
//      real defect in the require-founding branch a week before that branch
//      was taken. The empty state's "it costs nothing" is corrected here too:
//      there is no fee, but the price is four fields and a PERMANENT
//      Constitution under the reader's own key.
//   2. THE COST IS DISCLOSED WHERE IT IS PAID. The New Claim form answers,
//      live as the domain is typed, whether that domain is founded and
//      therefore findable by someone who was never told its name.
//   3. FOUNDING IS REACHABLE FROM THERE, carrying the string. Telling
//      somebody the price and leaving them to find the till in another tab is
//      most of the friction this row is about, and retyping a domain is how
//      one domain becomes two — a cost 6.12 records being paid once already,
//      by hand, in Telegram.
//
// FOUR STATES, AND THAT THEY ARE FOUR IS THE POINT. `membranes.length === 0`
// cannot tell "nobody has founded anything" from "nobody asked", and a FAILED
// get_membranes must never be able to report a domain as unfindable — telling
// somebody their claim cannot be found when the truth is that the app could
// not look is 6.13 exactly, and the four further instances 6.25 found. So the
// notice carries `founded`, `unfounded`/`near`, `checking` and `unknown`, and
// all four are driven below. The in-flight one is recorded by a
// MutationObserver rather than sampled, because a state that lasts one network
// round trip cannot be caught by looking at the right moment.
//
// AND ONE CHECK IS ABOUT A MILESTONE NOT BEING FORGED. The New Claim form
// performs the same `get_membranes` read the Domains tab does, and must not
// write `viewed-domains` into onboarding state while doing it — a client
// recording that its user went somewhere they never went is 6.5's objection in
// miniature, under their own key. `loadMembranes` holds the milestone and
// `readMembranes` holds the read, and phase 5 is why they are two functions.
//
// Prereqs: scripts/sandbox.sh clean && scripts/sandbox.sh start, and
// `npm run build` in mobile-ui/ — a FAILED tsc leaves the previous bundle in
// dist/ for this harness to drive, which has produced a green run against code
// that was never compiled. Coordinator-only change, so the DNA hash is
// unchanged and a resumed sandbox is fine.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
// Recorded by scripts/injection-ledger/ledger.mjs. Each entry is a defect
// INJECTED into the production source and observed reddening the checks
// named. A harness nobody has seen fail is a harness that has not been shown
// to be capable of failing, which is this suite's standing lesson and the
// reason these blocks are not optional.
//
//   WATCHED FAILING FIVE WAYS, AND THREE OF THE FIVE PREDICTIONS WERE WRONG
//   — which is the whole argument for leaving the counts out of this block
//   until each had been run. Measured against the 34-check file.
//
//   [A] The registry note not appended in renderMembranesTab.
//       -> 5 RED (predicted 3). The fifth is in PHASE 3, which uses that note
//          as its "did the reader land on the Domains tab" signal — so one
//          deletion reddens a navigation assertion two phases away. The
//          empty-state price check stayed GREEN and correctly so: it is a
//          different sentence making a different claim.
//   [B] `foundedDomain` made case-insensitive — the plausible "helpful"
//       version, which reports a domain as founded under a string that
//       reaches nothing, because the protocol hashes `domain_{domain}`
//       literally (coordinator :5136).
//       -> 3 RED, all three in phase 2e, and PHASE 2d STAYED GREEN. That is
//          the shape of the defect rather than a gap: a domain nobody founded
//          case-matches nothing either, so only a near-miss can distinguish a
//          literal match from a folded one. 2e is the whole probe.
//   [C] The `membranesError` branch removed, so a failed read cannot report
//       that it failed.
//       -> 2 RED, AND THE FIRST RUN OF THIS INJECTION FOUND A HOLE IN THIS
//          FILE. At 33 checks it reddened exactly 1, and BOTH controls beside
//          it stayed green — because removing that branch does not produce
//          6.13's defect at all. `membranesLoaded` is still false, so the
//          notice falls into the in-flight branch and says "Checking whether
//          this domain is founded…" FOR EVER. A notice stuck in flight is
//          indeed "not reporting the domain as unfounded", so the control was
//          satisfied by the wrong outcome. That is 6.25's family — a read
//          whose failure renders as a permanent non-answer — and the check
//          added to catch it is the second red here.
//   [D] The milestone moved back into the shared read (`markDone` in
//       `readMembranes`), so opening New Claim records a tab visit.
//       -> EXACTLY 1 RED, with both controls green: the read still happened,
//          and opening the tab still marks it. A precise probe.
//   [E] `foundingDomainSeed` never set by the notice's button.
//       -> 1 RED (predicted 2). Founding is still REACHABLE and the reader
//          still lands on the Domains tab — only the string fails to travel.
//          Which is the point: the two checks that stayed green are why the
//          value is asserted rather than the arrival.
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { decode } from '@msgpack/msgpack';
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
const PREVIEW_PORT = 4197;
const ONBOARDING_KEY = 'epistemic-mobile-ui:onboarding';

const STAMP = Date.now();
// FOUNDED for real, through the zome, before the browser opens.
const DOMAIN_FOUNDED = `FoundedDomain${STAMP}`;
// Never founded by anybody, and the file turns on this having a reportable
// answer rather than no answer.
const DOMAIN_UNFOUNDED = `UnfoundedDomain${STAMP}`;
// Differs from DOMAIN_FOUNDED by case alone. The protocol hashes
// `domain_{domain}` literally, so this is a DIFFERENT domain that reaches
// nothing — and reporting it as founded is the defect injection [B] makes.
const DOMAIN_NEARLY = DOMAIN_FOUNDED.toLowerCase();

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

const b64 = (u8) => Buffer.from(u8).toString('base64');

async function connectApp(admin, appId) {
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: appId });
  const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      if (cell?.type === CellType.Provisioned || cell?.type === CellType.Cloned) {
        cellIds.push(cell.value.cell_id);
      }
    }
  }
  if (cellIds.length === 0) throw new Error(`App "${appId}" has no provisioned or cloned cells.`);
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { app, me: cellIds[0][1], call };
}

// Guarded rather than bare, for the reason browse-states.mjs's own injections
// found: a screen that lost its element makes a direct innerText() throw, and
// a harness that dies instead of reporting counts nothing.
const textOf = async (page, selector) => {
  const loc = page.locator(selector);
  return (await loc.count()) ? await loc.first().innerText() : '';
};
const valueOf = async (page, selector) => {
  const loc = page.locator(selector);
  return (await loc.count()) ? await loc.first().inputValue() : null;
};
const stateOf = async (page) => {
  const loc = page.locator('[data-testid="domain-findability"]');
  return (await loc.count()) ? await loc.first().getAttribute('data-state') : null;
};

/** Type into the domain box and let the notice repaint. The notice is painted
 * on `oninput` without a full render, so `fill` alone is enough — but the
 * wait is real, because phase 2b's in-flight state is a network round trip. */
const typeDomain = async (page, value) => {
  await page.locator('[data-testid="new-claim-domain"]').fill(value);
  await page.waitForTimeout(400);
};

async function main() {
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const agent = await connectApp(admin, APP_ID);
  log(`agent (the UI's own) = ${b64(agent.me).slice(0, 12)}…`);

  // ---- The conductor's truth, established before any screen is read -----
  //
  // Without these controls the file would be asserting that a UI reports
  // foundedness correctly for domains whose real state nobody checked.
  log(`founding ${DOMAIN_FOUNDED} through the zome ...`);
  const constitution = await agent.call('publish_constitution', {
    agent: agent.me,
    promises: [{ action: 'state my sources', domain: DOMAIN_FOUNDED, modality: null }],
    conditions: [], published_at: Math.floor(Date.now() / 1000), expires_at: null,
  });
  await agent.call('create_membrane', {
    domain: DOMAIN_FOUNDED,
    description: 'Founded so the screen has a founded domain to be right about.',
    required_promises: ['state my sources'],
    validation_rules_hash: null,
    creator: agent.me,
    created_at: Math.floor(Date.now() / 1000),
    constitution,
  });

  const founded = await agent.call('get_membranes', null);
  const foundedNames = founded.map((r) => {
    const entry = r?.entry?.Present?.entry;
    try { return entry ? decode(entry).domain : null; } catch { return null; }
  });
  log(`get_membranes returns ${founded.length} membrane(s) — the control.`);
  if (founded.length === 0) {
    log('  SETUP FAILED: the domain just founded is not in the registry.');
    log('  If the code looks right the conductor is on a STALE BUILD —');
    log('  scripts/pack-webhapp.sh, then scripts/sandbox.sh clean && start.');
    process.exit(1);
  }
  if (foundedNames.includes(DOMAIN_UNFOUNDED) || foundedNames.includes(DOMAIN_NEARLY)) {
    log('  SETUP FAILED: a domain chosen to be UNfounded is in the registry.');
    process.exit(1);
  }

  // ONE CLAIM IN THE FOUNDED DOMAIN, AND IT IS PHASE 2b THAT NEEDS IT —
  // ADDED 2026-11-18 BECAUSE 6.27 TOOK THAT PHASE'S IN-FLIGHT MOMENT AWAY.
  // 6.27 put a near-miss notice in the Browse tab's EMPTY state, and that
  // notice reads `get_membranes` itself when nothing has yet. Phase 2b reaches
  // the New Claim form by browsing `DOMAIN_FOUNDED` first, so that the box
  // pre-fills and the registry read is still in flight when the form is built
  // — and this file publishes nothing, so that domain was empty, so the browse
  // landed in 6.27's notice and the read it needed in flight had already
  // happened. CI caught it: `"checking" was EVER displayed ... (saw: founded)`.
  //
  // A claim here makes the browse land on a populated domain, which renders no
  // near-miss notice, fires no registry read, and leaves phase 2b's in-flight
  // moment exactly where it was. It is also the more representative path: a
  // reader browsing a founded domain usually finds something in it.
  //
  // Nothing in this file asserts anything about the claim list, so this
  // changes no other phase.
  await agent.call('create_claim', {
    content: 'Published so browsing the founded domain is not an EMPTY browse — see the note above.',
    domain: DOMAIN_FOUNDED, confidence: 'Moderate', semantic_tags: [],
    author: agent.me, timestamp: Date.now() * 1000, evidence_hashes: [], attestation_policy: null,
  });
  log(`published one claim into ${DOMAIN_FOUNDED}, so phase 2b's browse is not empty.`);
  log('');

  log('Starting vite preview (production bundle) ...');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: new URL('../../mobile-ui/', import.meta.url).pathname, stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 3000));

  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  // Two instruments, both installed before the app loads so neither depends
  // on production code cooperating:
  //
  //   __noticeStates — every state the findability notice has ever been in.
  //   The in-flight `checking` lasts one round trip, so sampling for it would
  //   be a race; recording every mutation and asking afterwards whether it was
  //   EVER displayed is not. browse-states.mjs's __browseRenders, same reason.
  //
  //   __failZome — makes one zome call reject on command, so phase 2f drives a
  //   real failure rather than a simulated one.
  const INSTRUMENTS = () => {
    window.__noticeStates = [];
    window.__failZome = null;
    const record = () => {
      const el = document.querySelector('[data-testid="domain-findability"]');
      const state = el && el.getAttribute('data-state');
      if (state && window.__noticeStates[window.__noticeStates.length - 1] !== state) {
        window.__noticeStates.push(state);
      }
    };
    const observer = new MutationObserver(record);
    const start = () => {
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      record();
    };
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);

    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      try {
        if (window.__failZome) {
          let bytes = null;
          if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
          else if (ArrayBuffer.isView(data)) bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          if (bytes && new TextDecoder('latin1').decode(bytes).includes(window.__failZome)) {
            throw new Error('injected transport failure');
          }
        }
      } catch (e) {
        if (String(e).includes('injected transport failure')) throw e;
        /* observation must never break the page */
      }
      return send.call(this, data);
    };
  };

  // REGISTERED PER PAGE, AND THE FIRST RUN OF THIS FILE PROVED WHY.
  // `addInitScript` on a Page applies to THAT page only, so phases 2b, 2f and
  // 5 — each of which opens its own page to get a conductor read it has not
  // already performed — ran against a page where `window.__failZome` was an
  // inert property nobody read. Phase 2f therefore drove no failure at all
  // and reported `founded`, which is a check that passes or fails for reasons
  // unconnected to what it names. Same shape as `graph-ui`'s §7b.2
  // declaring-wait probe: an instrument wired to a scope it could never run
  // in. A page is opened through this helper from here on.
  const openPage = async () => {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
    p.on('pageerror', (e) => pageErrors.push(String(e)));
    await p.addInitScript(INSTRUMENTS);
    return p;
  };
  await page.addInitScript(INSTRUMENTS);

  try {
    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });

    // ---- 1. Surface 1: the Domains tab says what it lists ---------------
    log('=== 1. The Domains tab is a registry of the FOUNDED, and says so ===');
    await page.getByRole('button', { name: 'Domains', exact: true }).click();
    await page.waitForTimeout(500);
    check('the Domains tab carries a note about what it lists',
      (await page.locator('[data-testid="domains-registry-note"]').count()) === 1);
    const noteText = await textOf(page, '[data-testid="domains-registry-note"]');
    check('it says these are the domains somebody FOUNDED',
      /founded/i.test(noteText));
    check('and that it is NOT every domain in use — the inference it existed to stop',
      /not a list of every domain/i.test(noteText));
    check('and it names the consequence in the reader\'s terms, not the protocol\'s',
      /findable/i.test(noteText));

    // The empty state is read BEFORE "Load domains", which is the only moment
    // it is on screen — a founded domain exists on the chain already.
    const emptyText = await textOf(page, '.claim-list .hint');
    check('the unloaded state names the REAL price of founding, not "it costs nothing"',
      /permanently under your key/i.test(emptyText) && !/costs nothing/i.test(emptyText));

    // ---- 2. Surface 2: the four states of the notice --------------------
    //
    // New Claim is reached WITHOUT browsing first, deliberately: the domain
    // box pre-fills from `currentDomain`, so a prior Browse would leave phase
    // 2a asserting an empty box that is not empty.
    log('\n=== 2. The New Claim form answers, live, as the domain is typed ===');
    await page.getByRole('button', { name: 'New Claim', exact: true }).click();
    await page.waitForTimeout(500);

    log('\n--- 2a. nothing typed is not a finding ---');
    check('the notice names itself, so a harness can hold its states apart',
      (await page.locator('[data-testid="domain-findability"]').count()) === 1);
    check('an empty box says nothing — the notice does not shout before it is asked',
      (await textOf(page, '[data-testid="domain-findability"]')) === '');
    check('CONTROL: and offers no founding button for a domain nobody has named',
      await page.locator('[data-testid="found-from-claim"]').isHidden());

    log('\n--- 2b. the in-flight state, DRIVEN rather than hoped for ---');
    //
    // THE FIRST RUN OF THIS FILE ASSERTED THIS ON THE MAIN PAGE AND SAW ONLY
    // `empty`, WHICH WAS THE CHECK'S FAULT AND NOT THE CODE'S. The registry
    // read is kicked off when the form is BUILT, and a reader takes seconds to
    // type a domain — so by the first keystroke the answer has already landed
    // and the in-flight state never shows. It is still reachable, on a path a
    // reader actually walks: browse a domain, then open New Claim, where the
    // box PRE-FILLS from `currentDomain` and is therefore non-empty at build
    // time, before the read has returned. That is what this phase drives, and
    // the pre-fill is asserted first so the phase cannot pass by the box being
    // empty for some unrelated reason.
    const page2b = await openPage();
    await page2b.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
    await page2b.getByRole('button', { name: /connect/i }).first().click();
    await page2b.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });
    await page2b.getByRole('button', { name: 'Browse', exact: true }).click();
    await page2b.locator('[data-testid="browse-domain-input"]').fill(DOMAIN_FOUNDED);
    await page2b.getByRole('button', { name: 'Load claims' }).first().click();
    await page2b.waitForTimeout(1500);
    await page2b.getByRole('button', { name: 'New Claim', exact: true }).click();
    await page2b.waitForTimeout(2500);
    check('CONTROL: the box pre-fills from the domain being browsed, so there '
      + 'is an in-flight moment to catch at all',
      (await valueOf(page2b, '[data-testid="new-claim-domain"]')) === DOMAIN_FOUNDED);
    const states = await page2b.evaluate(() => window.__noticeStates || []);
    check(`"checking" was EVER displayed, not a silent gap (saw: ${states.join(' -> ') || 'none'})`,
      states.includes('checking'));
    check('and it RESOLVED rather than staying in flight for ever',
      (await stateOf(page2b)) === 'founded');
    await page2b.close();

    log('\n--- 2c. a founded domain ---');
    await typeDomain(page, DOMAIN_FOUNDED);
    check('a founded domain is reported founded', (await stateOf(page)) === 'founded');
    const foundedText = await textOf(page, '[data-testid="domain-findability"]');
    check('and the notice says somebody who was never told the name can find it',
      /never told its name can still find it/i.test(foundedText));
    check('CONTROL: no founding button — there is nothing left to found',
      await page.locator('[data-testid="found-from-claim"]').isHidden());

    log('\n--- 2d. a domain nobody founded ---');
    await typeDomain(page, DOMAIN_UNFOUNDED);
    check('an unfounded domain is reported unfounded', (await stateOf(page)) === 'unfounded');
    const unfoundedText = await textOf(page, '[data-testid="domain-findability"]');
    check('the notice says publishing still works — this is a price, not a refusal',
      /you can publish here/i.test(unfoundedText));
    check('and says plainly that nobody not sent the string will find it',
      /will ever find it/i.test(unfoundedText));
    check('and surface 3 is offered exactly here, where the cost is disclosed',
      await page.locator('[data-testid="found-from-claim"]').isVisible());

    log('\n--- 2e. a case variant is a DIFFERENT domain, not a match ---');
    await typeDomain(page, DOMAIN_NEARLY);
    check('a domain differing only in case is NOT reported as founded',
      (await stateOf(page)) === 'near');
    const nearText = await textOf(page, '[data-testid="domain-findability"]');
    check('both strings are named, so the reader can see which one they have',
      nearText.includes(DOMAIN_NEARLY) && nearText.includes(DOMAIN_FOUNDED));
    check('and it says a domain is an exact match — the protocol\'s own rule',
      /exact match/i.test(nearText));

    log('\n--- 2f. a read that FAILED cannot say a domain is unfindable ---');
    const page2 = await openPage();
    await page2.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
    await page2.evaluate(() => { window.__failZome = 'get_membranes'; });
    await page2.getByRole('button', { name: /connect/i }).first().click();
    await page2.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });
    await page2.getByRole('button', { name: 'New Claim', exact: true }).click();
    await page2.waitForTimeout(500);
    await page2.locator('[data-testid="new-claim-domain"]').fill(DOMAIN_FOUNDED);
    await page2.waitForTimeout(2500);
    const failedState = await stateOf(page2);
    check(`a failed get_membranes reports that it could not CHECK (state: ${failedState})`,
      failedState === 'unknown');
    const failedText = await textOf(page2, '[data-testid="domain-findability"]');
    check('CONTROL: and does NOT report the domain as unfounded — 6.13, in the '
      + 'surface built to answer 6.12',
      !/not a founded domain/i.test(failedText) && !/will ever find it/i.test(failedText));
    check('CONTROL: nor does it offer to found a domain that is already founded',
      await page2.locator('[data-testid="found-from-claim"]').isHidden());
    // ADDED BECAUSE INJECTION C EXPOSED THE CHECKS ABOVE AS INSENSITIVE TO IT.
    // Removing the `membranesError` branch does NOT produce the 6.13 defect
    // the control beside it was written for — a failed read leaves
    // `membranesLoaded` false, so the notice falls into the in-flight branch
    // and says "Checking whether this domain is founded…" FOR EVER. That is a
    // different family and one 6.25 found four instances of: a read whose
    // failure renders as an answer, here as a permanent non-answer. Both
    // controls above stayed green against it, because a notice stuck in flight
    // is indeed not reporting the domain as unfounded. A failed read has to
    // RESOLVE, which is what this asserts and what they could not.
    check('CONTROL: and it does not sit in flight for ever — a failed read '
      + 'resolves to a statement rather than to a spinner',
      (await stateOf(page2)) !== 'checking');
    await page2.close();

    // ---- 3. Surface 3: founding is reachable, and carries the string ----
    log('\n=== 3. Founding is reachable from where the cost is disclosed ===');
    await typeDomain(page, DOMAIN_UNFOUNDED);
    await page.locator('[data-testid="found-from-claim"]').click();
    await page.waitForTimeout(800);
    check('acting on the notice opens the founding form',
      (await page.locator('[data-testid="founding-domain"]').count()) === 1);
    check('and it is the Domains tab the reader lands on',
      (await page.locator('[data-testid="domains-registry-note"]').count()) === 1);
    check('the domain travels with them rather than being retyped',
      (await valueOf(page, '[data-testid="founding-domain"]')) === DOMAIN_UNFOUNDED);

    // ---- 4. The notice is the instrument, so it must survive the round --
    log('\n=== 4. Having declined, the reader can still publish ===');
    await page.getByRole('button', { name: 'New Claim', exact: true }).click();
    await page.waitForTimeout(500);
    check('the typed domain survived the trip to the founding form and back',
      (await valueOf(page, '[data-testid="new-claim-domain"]')) === DOMAIN_UNFOUNDED);
    check('and it is still reported unfounded — declining is a state, not an error',
      (await stateOf(page)) === 'unfounded');

    // ---- 5. The milestone must not be forged ----------------------------
    //
    // The New Claim form has now performed get_membranes several times. If it
    // reached `loadMembranes` rather than `readMembranes`, onboarding state
    // records that this reader visited a tab they have in fact visited — so
    // the check is ordered: a FRESH page that never opens Domains.
    log('\n=== 5. Reading the registry is not the same as having visited it ===');
    const page3 = await openPage();
    await page3.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
    await page3.evaluate((k) => localStorage.removeItem(k), ONBOARDING_KEY);
    await page3.reload({ waitUntil: 'domcontentloaded' });
    await page3.getByRole('button', { name: /connect/i }).first().click();
    await page3.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });
    await page3.getByRole('button', { name: 'New Claim', exact: true }).click();
    await page3.locator('[data-testid="new-claim-domain"]').fill(DOMAIN_FOUNDED);
    await page3.waitForTimeout(2500);
    check('CONTROL: the form really did read the registry, so the check below '
      + 'is about a read that happened',
      (await stateOf(page3)) === 'founded');
    const tour = await page3.evaluate((k) => localStorage.getItem(k), ONBOARDING_KEY);
    check('reading the registry from New Claim does NOT record a tab visit',
      !String(tour).includes('viewed-domains'));
    await page3.getByRole('button', { name: 'Domains', exact: true }).click();
    await page3.locator('button', { hasText: 'Load domains' }).first().click();
    await page3.waitForTimeout(2000);
    const tourAfter = await page3.evaluate((k) => localStorage.getItem(k), ONBOARDING_KEY);
    check('and actually opening the tab DOES — so the milestone still works',
      String(tourAfter).includes('viewed-domains'));
    await page3.close();

    check('CONTROL: the page raised no uncaught errors throughout',
      pageErrors.length === 0);
    if (pageErrors.length) for (const e of pageErrors) log(`    pageerror: ${e}`);
  } finally {
    await browser.close();
    preview.kill();
    // CLOSED EXPLICITLY, because an open @holochain/client websocket is a
    // ref'd handle nothing else closes — two harnesses in this suite printed
    // ALL CHECKS PASSED and then hung for ever, which is 1.29's finding and
    // most of why they were never switched on.
    try { await agent.app.client.close(); } catch { /* already gone */ }
    try { await admin.client.close(); } catch { /* already gone */ }
  }

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — the Domains tab says it lists the founded rather');
    log('than everything, the New Claim form says whether the domain being');
    log('typed can be found by a stranger and tells a failed check apart from');
    log('an unfounded domain, founding is reachable from there with the string');
    log('carried, and reading the registry does not forge a tab visit.');
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(1); });
