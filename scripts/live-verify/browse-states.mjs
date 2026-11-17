#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/browse-states.mjs — the four answers the Browse tab can
// give, the breadcrumb that says which domain a claim is in, and the domain
// the reader actually meant when they mistyped the capitals.
//
// WHY THIS EXISTS, and it is a measurement rather than a polish item. On
// 2026-11-09 the shipped v0.3.3 desktop build was driven to find out whether a
// pilot participant's claims had landed. The domain returned zero, and THE
// SCREEN COULD NOT SAY WHETHER THE READ HAD HAPPENED: one sentence — `No
// claims loaded yet for "X"` — stood for a domain nobody has written in, a
// read that was never started, and a conductor that is down. Establishing
// that the button worked at all took loading a second, known-populated domain
// as a positive control. A verification that needs a control to interpret its
// own UI is the defect stated as an experiment, and that is row 6.13.
//
// THE EMPTY ANSWER IS THE COMMON ONE HERE, NOT THE RARE ONE. A claim is on
// its author's source chain the moment it is committed, but it is only
// READABLE while somebody holding it is reachable. Until an always-on node
// existed, a correct read of a domain that genuinely held claims returned zero
// whenever its author's laptop was shut — so the answer this screen refused to
// characterise was the answer a participant saw most often.
//
// WHAT IT CHECKS. The four states By Author already distinguishes, each
// against the others rather than on its own: not asked, in flight, a real
// empty answer, and a failure. The point is the DISTINCTION, so every
// assertion carries the negative half — an error that does not also render as
// an empty domain, an empty answer that is not the not-asked-yet prompt, an
// empty answer that does not leave the previous domain's claims on screen.
//
// AND THE ONBOARDING STEP, which is the half of 6.13 that is not visible.
// `browsed-domain` was marked done BEFORE the await, so a rejected call
// advanced the tour. That is checked here against localStorage rather than
// against the screen, because nothing on the screen ever showed it.
//
// PLUS 6.12'S CHEAP HALF, in this file because it is the same reader in the
// same moment: a claim card never named its own domain, so arriving at one
// from the By Author tab left the reader unable to learn the string that would
// show them its neighbours. Checked where it matters rather than where it is
// easy — on the By Author tab, which lists claims from TWO domains, so a
// breadcrumb that renders the Browse box's domain instead of the claim's own
// fails rather than passing by coincidence.
//
// AND 6.16, THE WAY BACK, which is the same reader again one step earlier.
// The pilot's actual complaint was never "I cannot discover new domains" — it
// was "I cannot get back to the one I was in ten minutes ago", and the only
// route anybody had found was copying a domain string out of a Worldline
// trace, which is a frozen snapshot that silently omits everything written
// since it was generated. Two lists now: the domains this agent has published
// in, read off the chain through `get_claims_by_agent`, and the domains loaded
// on this device, which is localStorage because reading is not an act the
// protocol records.
//
// THE FAKE THIS HALF HAS TO DEFEAT is the same one `author-scope-ui.mjs` was
// built against, and it is the obvious implementation: a "where you have been"
// list assembled from the claims the Browse tab already loaded. That screen
// looks right the moment anybody uses it. So the list is measured BEFORE the
// Browse box has loaded anything, where a client-side version is necessarily
// empty — and the measurement is paired with a control asserting no claim card
// is on screen, because the check is only meaningful while that holds.
//
// HOW THE FAILURE IS PRODUCED, and why not by stopping the conductor.
// `WebSocket.prototype.send` is wrapped before the app loads and made to throw
// for one function name on command. Disabling the app would also work and was
// the first plan; it rejects the page's whole connection, so the screen under
// test would be the connect screen rather than Browse. This injects a failure
// of exactly the shape the row is about — one rejected zome call, everything
// else healthy — and it touches no production code, so a check cannot be
// satisfied by the app cooperating with it.
//
// Prereqs: a CLEAN sandbox (scripts/sandbox.sh clean && scripts/sandbox.sh
// start) and a UI build — scripts/pack-webhapp.sh does both in the right
// order. A stale `dist/` means you are verifying the previous version of the
// UI and everything here will pass.
// ============================================================================
// ---------------------------------------------------------------------------
// AND 6.27, THE NEAR MISS THE SCREEN WAS HOLDING AND NOT SAYING. The empty
// state already warned that a domain is an exact match, which is TRUE and is
// the rule rather than the answer — and the pilot's first publisher had worked
// the rule out already: "If you accidently type in Mental health Reform
// compared to Mental Health Reform - it states no domains found. I get why,
// but it is I think inconvinient." What they could not get was WHICH domain
// they meant, and `nearFoundedDomain` had been computing exactly that since
// 6.12 — for one caller, on the New Claim form, which is not the screen where
// a reader mistypes a domain.
//
// FOLDING THE LOOKUP IS NOT THE FIX AND IS NOT WHAT IS CHECKED HERE.
// `get_claims_by_domain` hashes the domain string, so two spellings are two
// domains that cannot see each other, and a case-insensitive match would
// report a domain as findable under a string that reaches nothing. The notice
// states that a second domain exists; it never merges it with the first, and
// a check asserts it says so.
//
// FOUR STATES AGAIN, FOR THE REASON 6.13 ESTABLISHED AND 6.25 FOUND FOUR MORE
// OF: `membranes` being empty means "nobody founded anything" OR "nobody
// asked", so SILENCE would say "no near miss" when the truth is "never
// looked". Every phase below therefore opens by asserting the notice is on
// screen AT ALL, and the no-near-miss case is asserted to say so out loud.
// Injection H is that exact defect, and one phase can see it.
//
// NEGATIVE EVIDENCE — this harness has been watched failing EIGHT times. 51
// checks green on a live conductor; every figure below is a real run.
//
//   A. The screen this replaced, reverted wholesale — `git stash` of
//   `mobile-ui/src/main.ts`, so the one sentence, no `browseLoaded`, no
//   `browseError`, no testids, no breadcrumb, no recall block, `markDone`
//   above the await.
//   Result: 20 of 31 red. And the uncaught-error control fired with
//   `Error: injected transport failure`, which is 6.13's claim measured
//   rather than argued: with no `try` in `loadClaims`, a rejected zome call
//   leaves the UI as an unhandled rejection.
//   THE 11 THAT STAYED GREEN ARE THE REASON THE FIRST CHECK EXISTS. Most of
//   them assert that a state is NOT being shown — no empty answer during a
//   failure, no error during an empty answer, no stale claim left on screen
//   — and every one passes vacuously against a screen whose elements do not
//   exist at all. A file containing only those would certify the unfixed UI.
//   `the claim list names itself` is what makes the rest mean anything, and
//   it is the first thing to fall.
//   AND IT TOOK TWO RUNS TO GET A COUNT AT ALL: the first died at
//   `locator.inputValue: Timeout 30000ms exceeded` on an element the old
//   screen never rendered. A gate that crashes on the defect it guards
//   reports nothing, which is why every read here goes through `textOf` or
//   `valueOf` rather than straight at the locator.
//
//   B. `markDone('browsed-domain')` moved back above the await.
//   Result: exactly 1 red — `a read that failed does not advance the tour`.
//   Every visible state stayed green, because nothing on screen ever showed
//   this. It is the only assertion in the suite that can see it.
//
//   C. The card's breadcrumb rendered from `currentDomain` (the Browse box)
//   rather than from `claim.entry.domain`.
//   Result: 4 red, all on the By Author tab where the two domains differ.
//   `every claim card names its own domain` STAYED GREEN — the cards did
//   each name a domain, the same wrong one twice. A count cannot catch a
//   wrong value, which is why the check beside it asserts the two domains BY
//   NAME and follows the navigation through to the claims it lands on.
//
//   D. THE IMPOSTOR: `myDomains` built from `claims` — the domains the
//   Browse tab had already loaded — instead of from `get_claims_by_agent`.
//   Result: 3 red, and the first of them reported `0 chips`, which is the
//   whole design of phase 1b: before anything is loaded the client-side
//   version has nothing to list. THE CONTROL BESIDE IT STAYED GREEN AND
//   SHOULD HAVE — it asserts no claim card is on screen, which is exactly
//   the condition that makes the chip count meaningful. Neither half is the
//   test; the pair is.
//
//   F. 6.27 REVERTED WHOLESALE — `git checkout main -- mobile-ui/src/main.ts`,
//   so the empty state is the old sentence and no notice exists.
//   Result: 13 of 16 red. AND FOUR CONTROLS STAYED GREEN, every one of them a
//   "does not say X" assertion that passes against text that does not exist:
//   `does not name a domain it never managed to read`, `does not name the
//   founded domain it did NOT match`, `nor does the typo spelling itself get
//   reported as founded`, and `the near-miss notice is gone`. That is this
//   file's own first lesson arriving in a new section, which is why every
//   phase opens with a presence check — those are among the 13 that fall, and
//   they are what make the four mean anything.
//
//   G. `loadClaims(near.entry.domain, true)` — the `fromTheBox` flag passed
//   when the box holds the TYPO, which was the first version of the feature.
//   Result: EXACTLY 1 red — `the box now holds the domain being shown, not the
//   typo`. The check beside it, `following it lands on the founded domain's
//   claims`, correctly STAYED GREEN: the claims do load and only the input is
//   wrong. A content check cannot see a wrong input value, which is why the
//   pair is asserted rather than the landing alone.
//
//   H. THE VACUOUS SHAPE THE ROW WARNED ABOUT: the notice appended only when
//   it has something to report, so "I looked and found none" becomes silence.
//   Result: EXACTLY 3 red, all in phase 6b, and EVERY OTHER PHASE STAYED FULLY
//   GREEN — the near-miss path still works and the failure path still reports.
//   6b is the only thing in this suite that can see it, and without it the
//   silent version would ship looking identical to the correct one.
//
//   E. The two lists merged into one, the shape this file exists to refuse.
//   Result: 3 red, including `the device-local half says on screen that it
//   is device-local and losable` — because once merged there is no second
//   half to say it about, and a reader is shown a chain-derived warranty
//   over localStorage entries that cannot honour it.
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
const PREVIEW_PORT = 4193;
const ONBOARDING_KEY = 'epistemic-mobile-ui:onboarding';

const STAMP = Date.now();
const DOMAIN_FULL = `BrowseFull${STAMP}`;
const DOMAIN_OTHER = `BrowseOther${STAMP}`;
// Never published into, by anybody. The whole file turns on this string
// having a real and reportable answer rather than no answer.
const DOMAIN_EMPTY = `BrowseEmpty${STAMP}`;
const CONTENT_FULL = 'Published into the domain the Browse box loads.';
const CONTENT_OTHER = 'Published into a second domain, so the breadcrumb has something to be wrong about.';
// ROW 6.27. A FOUNDED domain, and the same string with its capitals flattened.
// `.toLowerCase()` over a name whose tail is a timestamp changes only the
// letters, so the two differ in case and in nothing else — which is the exact
// pair the reporter hit, and narrower than a general typo.
const DOMAIN_FOUNDED = `BrowseFounded${STAMP}`;
const DOMAIN_FOUNDED_TYPO = DOMAIN_FOUNDED.toLowerCase();
const CONTENT_FOUNDED = 'Published into the founded domain, so following the hint lands somewhere.';

const PROMPT = 'Enter a domain above and load its claims.';

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

const nowMicros = () => Date.now() * 1000;
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
  return { me: cellIds[0][1], call };
}

const claim = (agent, domain, content) => agent.call('create_claim', {
  content, domain, confidence: 'Moderate', semantic_tags: [],
  author: agent.me, timestamp: nowMicros(), evidence_hashes: [], attestation_policy: null,
});

// Guarded rather than bare, and for a reason this file's own injections
// found: the screen being replaced has NO testid on its list at all, so a
// direct `.innerText()` throws and the harness dies instead of reporting.
// A gate that crashes on the defect it guards counts nothing.
const textOf = async (page, selector) => {
  const loc = page.locator(selector);
  return (await loc.count()) ? await loc.first().innerText() : '';
};
const valueOf = async (page, selector) => {
  const loc = page.locator(selector);
  return (await loc.count()) ? await loc.first().inputValue() : null;
};

async function main() {
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const agent = await connectApp(admin, APP_ID);
  log(`agent (the UI's own) = ${b64(agent.me).slice(0, 12)}…`);

  log(`publishing into ${DOMAIN_FULL} and ${DOMAIN_OTHER} ...`);
  await claim(agent, DOMAIN_FULL, CONTENT_FULL);
  await claim(agent, DOMAIN_OTHER, CONTENT_OTHER);

  // ROW 6.27's world, founded through the zome so the screen has a real
  // near miss to be right about rather than a fixture's idea of one.
  log(`founding ${DOMAIN_FOUNDED} and publishing into it ...`);
  const constitution = await agent.call('publish_constitution', {
    agent: agent.me,
    promises: [{ action: 'state my sources', domain: DOMAIN_FOUNDED, modality: null }],
    conditions: [], published_at: Math.floor(Date.now() / 1000), expires_at: null,
  });
  await agent.call('create_membrane', {
    domain: DOMAIN_FOUNDED,
    description: 'Founded so the Browse hint has a founded near miss to name.',
    required_promises: ['state my sources'],
    validation_rules_hash: null,
    creator: agent.me,
    created_at: Math.floor(Date.now() / 1000),
    constitution,
  });
  await claim(agent, DOMAIN_FOUNDED, CONTENT_FOUNDED);

  // The empty domain is empty according to the conductor, not according to
  // the screen. Without this the file would be asserting that a UI reports
  // emptiness correctly on a domain that might simply be unreadable.
  const emptyTruth = await agent.call('get_claims_by_domain', DOMAIN_EMPTY);
  log(`get_claims_by_domain(${DOMAIN_EMPTY}) returns ${emptyTruth.length} record(s) — the control.`);
  if (emptyTruth.length !== 0) {
    log('  SETUP FAILED: the domain chosen to be empty is not empty.');
    process.exit(1);
  }
  // ROW 6.27's three controls. Without them this file would assert that a
  // screen names a near miss correctly for domains whose real state nobody
  // established: that the typo'd spelling is EMPTY (or the hint never renders
  // at all, since it lives in the empty state), that the founded spelling IS
  // founded, and that the typo'd one is NOT — because a hint that fired on an
  // exact match would be reporting the domain you are already looking at.
  const typoTruth = await agent.call('get_claims_by_domain', DOMAIN_FOUNDED_TYPO);
  if (typoTruth.length !== 0) {
    log(`  SETUP FAILED: ${DOMAIN_FOUNDED_TYPO} is not empty, so the hint would never render.`);
    process.exit(1);
  }
  const foundedNow = await agent.call('get_membranes', null);
  const foundedNames = foundedNow.map((r) => {
    const entry = r?.entry?.Present?.entry;
    try { return entry ? decode(entry).domain : null; } catch { return null; }
  });
  if (!foundedNames.includes(DOMAIN_FOUNDED) || foundedNames.includes(DOMAIN_FOUNDED_TYPO)) {
    log('  SETUP FAILED: the founded/typo pair is not the pair this file needs —');
    log(`  founded=${foundedNames.includes(DOMAIN_FOUNDED)} typo=${foundedNames.includes(DOMAIN_FOUNDED_TYPO)}`);
    process.exit(1);
  }
  log(`get_membranes lists ${DOMAIN_FOUNDED} and not its lowercased spelling — the control.`);

  const fullTruth = await agent.call('get_claims_by_domain', DOMAIN_FULL);
  if (fullTruth.length !== 1) {
    log(`  SETUP FAILED: ${DOMAIN_FULL} holds ${fullTruth.length} claims, expected 1.`);
    log('  If the code looks correct the conductor is on a STALE BUILD —');
    log('  scripts/pack-webhapp.sh, then scripts/sandbox.sh clean && start.');
    process.exit(1);
  }
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
  //   __browseRenders — every sentence the Browse hint has ever shown. An
  //   in-flight state lasts one network round trip, so asserting it by
  //   sampling the DOM at the right moment would be a race. Recording every
  //   mutation and asking afterwards whether it was ever displayed is not.
  //
  //   __failZome — makes one zome call reject on command. See the header.
  await page.addInitScript(() => {
    window.__browseRenders = [];
    window.__failZome = null;
    const observer = new MutationObserver(() => {
      const hint = document.querySelector('[data-testid="browse-claim-list"] .hint');
      if (hint && hint.textContent) window.__browseRenders.push(hint.textContent);
    });
    const start = () => observer.observe(document.body, { childList: true, subtree: true, characterData: true });
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
  });

  try {
    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });
    await page.getByRole('button', { name: 'Browse', exact: true }).click();

    // ---- 1. Not asked yet ------------------------------------------------
    log('=== 1. Nothing asked: a prompt, and not an answer ===');
    check('the claim list names itself, so a harness can hold its states apart',
      (await page.locator('[data-testid="browse-claim-list"]').count()) === 1);
    const beforeText = await textOf(page, '[data-testid="browse-claim-list"] .hint');
    check('before any read the screen asks for a domain', beforeText.includes(PROMPT));
    check('CONTROL: and does not render the empty ANSWER, which it has not got',
      (await page.locator('[data-testid="browse-empty"]').count()) === 0);

    // ---- 1b. 6.16, measured where a client-side version cannot pass ------
    //
    // Nothing has been loaded through the Browse box yet, so a "domains you
    // have been in" list assembled from what this browser happens to hold
    // would be empty here. Both domains appearing is the read reaching the
    // chain.
    log('\n=== 1b. The way back: domains read off this agent\'s own chain ===');
    await page.waitForSelector('[data-testid="my-domains"]', { timeout: 15000 }).catch(() => {});
    const published = await page.locator('[data-testid="my-domains"] .domain-chip').allInnerTexts();
    check(`the domains this agent published in are listed (${published.length} chips)`,
      published.includes(DOMAIN_FULL) && published.includes(DOMAIN_OTHER));
    check('CONTROL: and they are there BEFORE Browse has loaded anything, so the '
      + 'list is read from the chain rather than from what this browser holds',
      (await page.locator('[data-testid="browse-claim-list"] .claim-card').count()) === 0);

    // ---- 2. A read that failed -------------------------------------------
    //
    // Deliberately before any successful browse, so the onboarding check
    // below measures a tour that has never been advanced rather than one
    // already advanced by an earlier phase.
    log('\n=== 2. A rejected read, told apart from an empty domain ===');
    //
    // Failed against the domain this agent has NOT published in, so the
    // last check below has something to be about: a domain already on the
    // chain-derived list would appear in the recall block either way.
    await page.evaluate(() => { window.__failZome = 'get_claims_by_domain'; });
    await page.locator('[data-testid="browse-domain-input"]').fill(DOMAIN_EMPTY);
    await page.getByRole('button', { name: 'Load claims' }).first().click();
    await page.waitForTimeout(2500);
    const errCount = await page.locator('[data-testid="browse-error"]').count();
    check('a rejected read is reported on screen', errCount === 1);
    const errText = await textOf(page, '[data-testid="browse-error"]');
    check('the failure names the domain that was asked for', errText.includes(DOMAIN_EMPTY));
    check('CONTROL: the failure did NOT render as a domain with nothing in it',
      (await page.locator('[data-testid="browse-empty"]').count()) === 0);
    const tourAfterFailure = await page.evaluate((k) => localStorage.getItem(k), ONBOARDING_KEY);
    check('a read that failed does not advance the tour',
      !String(tourAfterFailure).includes('browsed-domain'));
    const visitedAfterFailure = await page.locator('[data-testid="visited-domains"] .domain-chip').allInnerTexts();
    check('6.16: and is not remembered as somewhere you have been',
      !visitedAfterFailure.includes(DOMAIN_EMPTY));
    await page.evaluate(() => { window.__failZome = null; });

    // ---- 3. THE POSITIVE CONTROL -----------------------------------------
    //
    // This is the check whose ABSENCE from the screen is the whole row: on
    // 2026-11-09 a populated domain had to be loaded by hand to find out
    // whether the button worked.
    log('\n=== 3. A populated domain, which is how the other states mean anything ===');
    await page.evaluate(() => { window.__browseRenders = []; });
    await page.locator('[data-testid="browse-domain-input"]').fill(DOMAIN_FULL);
    await page.getByRole('button', { name: 'Load claims' }).first().click();
    await page.waitForTimeout(2500);
    const fullText = await textOf(page, '[data-testid="browse-claim-list"]');
    check('the populated domain renders its claim', fullText.includes(CONTENT_FULL));
    check('no empty answer is shown when claims came back',
      (await page.locator('[data-testid="browse-empty"]').count()) === 0);
    check('CONTROL: the error state cleared when the read succeeded',
      (await page.locator('[data-testid="browse-error"]').count()) === 0);
    const renders = await page.evaluate(() => window.__browseRenders);
    check('the read said so while it was in flight', renders.some((t) => t.includes('Reading…')));
    const tourAfterRead = await page.evaluate((k) => localStorage.getItem(k), ONBOARDING_KEY);
    check('a read that came back DOES advance the tour',
      String(tourAfterRead).includes('browsed-domain'));

    // ---- 4. A real empty answer, after a populated one -------------------
    log('\n=== 4. An empty domain, reported as the answer it is ===');
    await page.locator('[data-testid="browse-domain-input"]').fill(DOMAIN_EMPTY);
    await page.getByRole('button', { name: 'Load claims' }).first().click();
    await page.waitForTimeout(2500);
    check('an empty domain is reported as empty',
      (await page.locator('[data-testid="browse-empty"]').count()) === 1);
    const emptyText = await textOf(page, '[data-testid="browse-empty"]');
    check('the empty answer names the domain it is about', emptyText.includes(DOMAIN_EMPTY));
    check('CONTROL: and is NOT the not-asked-yet prompt', !emptyText.includes(PROMPT));
    check('CONTROL: and is NOT reported as a failure',
      (await page.locator('[data-testid="browse-error"]').count()) === 0);
    const staleText = await textOf(page, '[data-testid="browse-claim-list"]');
    check("CONTROL: the previous domain's claim is gone rather than left on screen",
      !staleText.includes(CONTENT_FULL));

    // ---- 4b. 6.16's weaker half, and the separation it turns on ----------
    log('\n=== 4b. A domain you loaded here, kept apart from the chain\'s own list ===');
    const visited = await page.locator('[data-testid="visited-domains"] .domain-chip').allInnerTexts();
    check('a domain you loaded is remembered on this device', visited.includes(DOMAIN_EMPTY));
    const publishedNow = await page.locator('[data-testid="my-domains"] .domain-chip').allInnerTexts();
    check('CONTROL: and is NOT merged into the list read from the chain, which '
      + 'carries a different warranty', !publishedNow.includes(DOMAIN_EMPTY));
    check('CONTROL: nor is a chain-derived domain duplicated into the device list',
      !visited.includes(DOMAIN_FULL) && publishedNow.includes(DOMAIN_FULL));
    const recallText = await textOf(page, '[data-testid="where-youve-been"]');
    check('the device-local half says on screen that it is device-local and losable',
      /this browser only/i.test(recallText) && /chain/i.test(recallText));
    const fullChip = page.locator('[data-testid="my-domains"] .domain-chip', { hasText: DOMAIN_FULL });
    if (await fullChip.count()) {
      await fullChip.first().click();
      await page.waitForTimeout(2500);
    }
    check('clicking a remembered domain loads it, which is the whole point of 6.16',
      (await textOf(page, '[data-testid="browse-claim-list"]')).includes(CONTENT_FULL));

    // ---- 5. 6.12's breadcrumb, measured where it can be wrong ------------
    log('\n=== 5. A claim card says which domain it is in ===');
    await page.locator('[data-testid="browse-domain-input"]').fill(DOMAIN_FULL);
    await page.getByRole('button', { name: 'Load claims' }).first().click();
    await page.waitForTimeout(2500);
    await page.locator('.author-link').first().click();
    await page.waitForTimeout(2500);
    const crumbs = await page.locator('[data-testid="claim-domain"]').allInnerTexts();
    check(`every claim card names its own domain (${crumbs.length} on the By Author tab)`,
      crumbs.length >= 2);
    check('the breadcrumb is the CLAIM\'s domain, not the Browse box\'s — two domains, both named',
      crumbs.includes(DOMAIN_FULL) && crumbs.includes(DOMAIN_OTHER));
    const otherIndex = crumbs.indexOf(DOMAIN_OTHER);
    if (otherIndex >= 0) {
      await page.locator('[data-testid="claim-domain"]').nth(otherIndex).click();
      await page.waitForTimeout(2500);
    } else {
      log('    (no breadcrumb named the second domain; the three checks below');
      log('     measure a navigation that was never offered)');
    }
    check('clicking it lands on the Browse tab',
      (await page.locator('[data-testid="browse-claim-list"]').count()) === 1);
    check('and seeds the box with that domain, so the reader can see where they are',
      (await valueOf(page, '[data-testid="browse-domain-input"]')) === DOMAIN_OTHER);
    const followedText = await textOf(page, '[data-testid="browse-claim-list"]');
    check("and the followed domain's claims are what is on screen",
      followedText.includes(CONTENT_OTHER) && !followedText.includes(CONTENT_FULL));

    // ---- 6. ROW 6.27 — the answer the screen was holding and not saying ---
    //
    // The empty state already warned that a domain is an exact match. That is
    // true, it is the RULE, and the reporter had already worked the rule out
    // for themselves: "I get why, but it is I think inconvinient." What they
    // could not get was WHICH domain they meant — and `nearFoundedDomain` had
    // been computing exactly that since 6.12, for one caller on another screen.
    //
    // EVERY CHECK HERE IS PAIRED, because this whole family fails by being
    // SILENT. A notice that renders nothing looks identical to a notice that
    // correctly found no near miss — 6.13's defect, and the four more 6.25
    // found after it.
    //
    // HOW THE FAILURE IS REACHED, AND THE FIRST VERSION OF THIS PHASE GOT IT
    // WRONG — caught by this harness on its first run, which is the only
    // reason it is written down. It injected the failure here and asserted
    // `unknown`, on the reasoning that nothing had read `get_membranes` yet so
    // the notice's own cold-read guard would fire and fail. **It had already
    // fired, in phase 4**: that phase browses an empty domain, which is
    // exactly the state this notice lives in, so the read happened there and
    // succeeded. The result was `state=none` — the notice correctly reporting a
    // successful read nobody had noticed it making.
    //
    // TWO THINGS FOLLOW. The injection must therefore force a RE-read, and
    // only the Domains tab's button does that (`loadMembranes` calls
    // `readMembranes` unconditionally; the notice's own guard deliberately
    // does not, so a dead conductor is not flooded). And phase 4's checks now
    // silently depend on a membrane read they do not mention — which is fine
    // and worth knowing: a `get_membranes` failure during phase 4 would show
    // up there as this notice saying it could not check.
    log('\n=== 6. The membrane read failing, told apart from finding nothing ===');
    await page.evaluate(() => { window.__failZome = 'get_membranes'; });
    await page.getByRole('button', { name: 'Domains', exact: true }).click();
    await page.getByRole('button', { name: 'Load domains' }).first().click();
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await page.locator('[data-testid="browse-domain-input"]').fill(DOMAIN_EMPTY);
    await page.getByRole('button', { name: 'Load claims' }).first().click();
    await page.waitForTimeout(3000);
    check('the near-miss notice is on screen even when its read failed',
      (await page.locator('[data-testid="browse-near-miss"]').count()) === 1);
    const failState = await page.locator('[data-testid="browse-near-miss"]').first()
      .getAttribute('data-state').catch(() => null);
    check(`a failed membrane read is NOT reported as "none" (state=${failState})`,
      failState === 'unknown');
    const failText = await textOf(page, '[data-testid="browse-near-miss"]');
    check('CONTROL: it says it could not check, rather than that nothing matched',
      /could not check/i.test(failText));
    check('CONTROL: and does not name a domain it never managed to read',
      !failText.includes(DOMAIN_FOUNDED));
    check('CONTROL: the empty answer is unaffected — one read failing is not the other',
      (await page.locator('[data-testid="browse-empty"]').count()) === 1);

    // Recovery through the same button, which is the only path that re-reads
    // after a failure — by design, and realistic: the reader retries. Without
    // this every phase below would stay 'unknown'.
    await page.evaluate(() => { window.__failZome = null; });
    await page.getByRole('button', { name: 'Domains', exact: true }).click();
    await page.getByRole('button', { name: 'Load domains' }).first().click();
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: 'Browse', exact: true }).click();

    // ---- 6b. No near miss, said out loud rather than by silence ----------
    log('\n=== 6b. No near miss, said out loud rather than by silence ===');
    await page.locator('[data-testid="browse-domain-input"]').fill(DOMAIN_EMPTY);
    await page.getByRole('button', { name: 'Load claims' }).first().click();
    await page.waitForTimeout(3000);
    check('a domain with no founded near miss still renders the notice',
      (await page.locator('[data-testid="browse-near-miss"]').count()) === 1);
    const noneState = await page.locator('[data-testid="browse-near-miss"]').first()
      .getAttribute('data-state').catch(() => null);
    check(`and says it looked and found none (state=${noneState})`, noneState === 'none');
    const noneText = await textOf(page, '[data-testid="browse-near-miss"]');
    // `membranes` holds FOUNDED domains only, so this must not be heard as "no
    // domain": an unfounded case-variant is invisible to it, and that is what
    // 6.12 decided founding buys rather than a gap in this check.
    check('CONTROL: and scopes itself to FOUNDED domains rather than overclaiming',
      /founded/i.test(noneText));
    check('CONTROL: and does not name the founded domain it did NOT match',
      !noneText.includes(DOMAIN_FOUNDED));

    // ---- 6c. The near miss, named ----------------------------------------
    log('\n=== 6c. A domain differing only in capitals, NAMED rather than hinted at ===');
    await page.locator('[data-testid="browse-domain-input"]').fill(DOMAIN_FOUNDED_TYPO);
    await page.getByRole('button', { name: 'Load claims' }).first().click();
    await page.waitForTimeout(3000);
    check('a near miss is reported on screen at all',
      (await page.locator('[data-testid="browse-near-miss"]').count()) === 1);
    const nearState = await page.locator('[data-testid="browse-near-miss"]').first()
      .getAttribute('data-state').catch(() => null);
    check(`the notice says it FOUND one (state=${nearState})`, nearState === 'near');
    const nearText = await textOf(page, '[data-testid="browse-near-miss"]');
    // The failure this separates: "a similar domain exists" makes the reader
    // hunt for it, which is the old sentence with more words in it.
    check('and NAMES the founded domain, which is the thing the reader was missing',
      nearText.includes(DOMAIN_FOUNDED));
    check('CONTROL: and says the two are DIFFERENT domains rather than folding them',
      /different domain/i.test(nearText));
    check('CONTROL: the empty answer is still there, so the hint ADDS and does not replace',
      (await page.locator('[data-testid="browse-empty"]').count()) === 1);
    check('CONTROL: and this is not reported as a failure',
      (await page.locator('[data-testid="browse-error"]').count()) === 0);
    check('CONTROL: nor does the typo spelling itself get reported as founded',
      !new RegExp(`"${DOMAIN_FOUNDED_TYPO}" IS founded`).test(nearText));

    // ---- 6d. Following it through, and the box following with it ---------
    //
    // A sentence still leaves the string to be retyped, and retyping a domain
    // by hand is the act 6.12 records going wrong once already — a wrong
    // string sent to a participant and corrected after the fact. A link
    // cannot be mistyped, which is 6.26's argument one screen early.
    log('\n=== 6d. Following the hint, and the box following with it ===');
    const goBtn = page.locator('[data-testid="browse-near-miss-load"]');
    check('the hint is actionable rather than only informative', (await goBtn.count()) === 1);
    if (await goBtn.count()) {
      await goBtn.first().click();
      await page.waitForTimeout(3000);
    }
    check("following it lands on the founded domain's claims",
      (await textOf(page, '[data-testid="browse-claim-list"]')).includes(CONTENT_FOUNDED));
    // THE DEFECT THIS CHECK EXISTS FOR, and it was in the first version of
    // this feature: `loadClaims(domain, true)` means "the string is already in
    // the input", and it is not — the input holds the TYPO. Passing it loads
    // the right domain and leaves the wrong string on screen, which is this
    // row's own confusion rebuilt one step later.
    check('and the box now holds the domain being shown, not the typo',
      (await valueOf(page, '[data-testid="browse-domain-input"]')) === DOMAIN_FOUNDED);
    check('CONTROL: and the near-miss notice is gone, the domain being founded and non-empty',
      (await page.locator('[data-testid="browse-near-miss"]').count()) === 0);

    check('CONTROL: the page raised no uncaught errors throughout',
      pageErrors.length === 0);
    if (pageErrors.length) for (const e of pageErrors) log(`    pageerror: ${e}`);
  } finally {
    await browser.close();
    preview.kill();
  }

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — the Browse tab tells a domain nobody has written');
    log('in apart from a read that never ran and a read that failed, says so');
    log('while it is reading, advances the tour only on an answer, every');
    log('claim card names the domain it is in and navigates there, and a');
    log('domain differing only in capitals is NAMED rather than hinted at —');
    log('with "I looked and found none" said out loud rather than by silence.');
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(1); });
