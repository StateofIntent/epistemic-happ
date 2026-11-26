#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/critiqued-flag-ui.mjs — row 6.28: a reader can tell
// whether a claim has been critiqued WITHOUT being handed a ranking.
//
// WHY THIS EXISTS. A participant asked three separate times whether a claim
// has been argued with, having to open each claim to find out. The answer was
// refused twice on Invariant 1 grounds: a critique COUNT rendered across a
// domain's claims is comparative, and a screen showing how disputed each
// claim is orders the domain by disputedness, which a reader reads as merit.
//
// He then argued past the refusal: "I don't think it has to mean a popularity
// ranking. It shows the areas people feel strongly about, and that's probably
// where people learn the most from a debate." That is not the counter-argument
// the row anticipated — it asks for the OUTPUT of the refused thing, not the
// thing. So what shipped is a BOOLEAN: "this claim has been critiqued" with
// the number thrown away at the point of derivation. Two buckets cannot be
// ordered into a gradient, so the ranking surface is absent BY CONSTRUCTION
// rather than by restraint.
//
// THE FAILURE THIS FILE EXISTS TO CATCH is not a missing line. It is the
// boolean shipping correctly while a COUNT also leaks onto the same screen —
// which is what the code did before this row, and the reason the central
// check below is a regression test rather than a feature test.
//
// `myCritiqueCounts` is module-level and never cleared (no `.clear()`, no
// `.delete()` anywhere), Browse renders the reader's OWN claims alongside
// everyone else's, and `renderClaimCard` is shared by both tabs. So the
// sequence "By Author on yourself, then Browse a domain you have claims in"
// rendered "3 critiques on this claim." on the reader's claims, beside other
// people's claims carrying no number at all. Exactly the comparative surface
// the Invariant 1 note says is refused.
//
// AND THE GUARD THAT NOTE NAMED WAS THE WRONG KIND, which is the transferable
// part: "nothing outside `loadMyCritiqueCounts` ever writes that map" is a
// WRITE-side guard for a READ-side problem. Restricting who fills a map does
// not restrict where a filled map is rendered. So check 3 drives that exact
// sequence — it is the only check here that could have caught the shipped
// defect, and every other check in this file passed against it.
//
// A SECOND AGENT IS NOT OPTIONAL. "Every claim shows the flag" cannot be
// distinguished from "the reader's own claims show the flag" on a conductor
// holding one agent's work, and the leak being tested for lives precisely in
// the difference. Agent 2 publishes an uncritiqued claim into the same domain.
//
// THREE STATES, NOT TWO, and the middle one is why a claim with no critiques
// is a different assertion from a claim whose read has not returned. Absent
// from the map means nobody has asked yet; `false` means somebody asked and
// the answer was none. Telling a reader a claim is unchallenged before the
// read has landed is the defect 6.13 closed one screen over, and it is
// available here in a new place.
//
// Prereqs: a CLEAN sandbox (scripts/sandbox.sh clean && start) and a UI build
// — scripts/pack-webhapp.sh does both builds in the right order. A stale
// `dist/` means you are verifying the previous version of the UI and
// everything here will pass.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
//   Injection: the surface gate reverted, i.e. the shipped defect restored.
//   `renderClaimCard`'s count condition goes back to ownership plus
//   map-presence with no `surface === 'byAuthor'`.
//   Result: 3 red of 19 — the count rendered on Browse after a By Author
//   visit (2 of them), the words "N critiques on this" appeared in the list,
//   and only 2 of 3 flags survived, because the count and the flag are
//   mutually exclusive on a card so the leaking count DISPLACED a flag.
//
//   AND THE POINT OF RUNNING IT: THE OTHER SIXTEEN CHECKS STAYED GREEN.
//   Every check that reads like this file's purpose passed with the defect
//   live — the flag appeared on claims, it discriminated critiqued from not,
//   it carried no digit, it had at most two states, it issued no
//   instruction, the By Author count still worked, another agent's listing
//   still had no count, the wire-watcher saw the read, and an empty domain
//   showed no flags. A version of this file containing only the obvious
//   "does the boolean work" assertions would have certified the exact screen
//   the row exists to prevent: a correct boolean sitting beside a leaked
//   count that orders the domain by disputedness.
//
//   WHICH IS WHY CHECK 3 IS BUILT AS A SEQUENCE RATHER THAN A STATE. The
//   leak is invisible to any check that loads Browse first, because the map
//   is empty until a By Author visit fills it. The defect requires a
//   NAVIGATION to exist, so the check performs one, and the precondition
//   assertion above it exists so that a future change making the By Author
//   count vanish turns this into a loud failure rather than a vacuous pass.
//
//   One thing the first run caught before any injection: `create_claim`
//   returns an ActionHash, not a Record, so reading
//   `.signed_action.hashed...` off its return threw. It failed loudly only
//   because the next line used the value immediately — a reminder that the
//   setup is as capable of being wrong as the product.
//
//   Restored and re-run: 19 checks green.
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
const AGENT2_APP_ID = 'epistemic-resonance-happ-critiquedflag2';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;
const PREVIEW_PORT = 4193;

const STAMP = Date.now();
const DOMAIN = `CritiquedFlag${STAMP}`;
// Agent 1 owns both of these, so the domain contains one critiqued and one
// uncritiqued claim BY THE SAME AUTHOR. Without that pair, "the flag
// distinguishes critiqued from not" could pass on a screen that simply
// labels every claim the same way.
const CONTENT_CRITIQUED = 'Mine, and somebody has argued with it.';
const CONTENT_QUIET = 'Mine, and nobody has argued with it.';
const CONTENT_AGENT2 = "Another agent's, and nobody has argued with it.";

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

/** The card for one claim, located by its content rather than by index — card
 *  order is whatever the DHT returned and asserting on position would make
 *  this file fail for a reason that is not a defect. */
const cardFor = (page, content) =>
  page.locator('.claim-card').filter({ hasText: content }).first();

async function main() {
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const agent1 = await connectApp(admin, APP_ID);
  log(`agent1 (the UI's own) = ${b64(agent1.me).slice(0, 12)}…`);

  const apps = await admin.listApps({});
  if (!apps.some((a) => a.installed_app_id === AGENT2_APP_ID)) {
    const agent2Pub = await admin.generateAgentPubKey();
    await admin.installApp({
      source: { type: 'path', value: HAPP_PATH },
      agent_key: agent2Pub,
      installed_app_id: AGENT2_APP_ID,
    });
    await admin.enableApp({ installed_app_id: AGENT2_APP_ID });
  }
  const agent2 = await connectApp(admin, AGENT2_APP_ID);
  log(`agent2 (the control)  = ${b64(agent2.me).slice(0, 12)}…\n`);

  if (b64(agent1.me) === b64(agent2.me)) {
    log('  SETUP FAILED: both slots resolved to the same agent key, so the leak');
    log('  this file tests for could not be distinguished. Refusing to run.');
    process.exit(1);
  }

  log(`Publishing three claims into ${DOMAIN} ...`);
  await claim(agent1, DOMAIN, CONTENT_CRITIQUED);
  await claim(agent1, DOMAIN, CONTENT_QUIET);
  await claim(agent2, DOMAIN, CONTENT_AGENT2);

  // `create_claim` returns an ActionHash, and a Critique targets a claim by
  // ENTRY hash — so the target is read back off the domain listing rather
  // than derived from the create. An earlier version of this file read
  // `signed_action.hashed.content.entry_hash` off the create's return and got
  // `undefined.hashed`, which failed loudly rather than quietly, but only
  // because the very next line used it.
  const published = await agent1.call('get_claims_by_domain', DOMAIN);
  if (published.length !== 3) {
    log(`\n  SETUP FAILED: get_claims_by_domain returned ${published.length} after publishing three.`);
    log('  A real failure of the zome, not of this harness. If the code looks correct,');
    log('  the conductor is on a STALE BUILD — scripts/pack-webhapp.sh, then clean && start.');
    process.exit(1);
  }
  const decode = (rec) => rec.signed_action.hashed.content.data.entry_hash;
  const critiquedTarget = published.find(
    (r) => Buffer.from(r.entry?.Present?.entry ?? []).toString('latin1').includes(CONTENT_CRITIQUED),
  );
  if (!critiquedTarget) {
    log('\n  SETUP FAILED: could not find the claim that is meant to be critiqued.');
    process.exit(1);
  }

  // The critique comes from AGENT 2, so "has been critiqued" is not a
  // statement about the reader's own activity. A self-critique would let a
  // screen that reports "you have critiqued this" pass as if it reported
  // "this has been critiqued", and those are different facts.
  const targetHash = decode(critiquedTarget);
  await agent2.call('create_critique', {
    target: targetHash, target_type: 'Claim', critique_mode: 'Methodological',
    content: 'The sample size is not reported.',
    author: agent2.me, timestamp: nowMicros(), replication_attempted: false,
    evidence_hashes: [], species: null,
  });
  log('agent2 critiques agent1\'s first claim.\n');

  // The answer the screen will be measured against, read independently.
  const truth = await agent1.call('get_critiques_for', targetHash);
  log(`get_critiques_for(critiqued claim) returns ${truth.length} record(s) from the conductor.`);
  if (truth.length !== 1) {
    log('  SETUP FAILED: the critique just published should be the only one on that claim.');
    log('  If the code looks correct the conductor is on a STALE BUILD —');
    log('  scripts/pack-webhapp.sh, then scripts/sandbox.sh clean && start.');
    process.exit(1);
  }

  log('Starting vite preview (production bundle) ...');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: new URL('../../mobile-ui/', import.meta.url).pathname, stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 3000));

  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  // Observed rather than inferred from what ended up on screen, and wrapped
  // BEFORE the app loads rather than by a reporting hook in the app: a check
  // that depends on production code cooperating is one the production code
  // can satisfy while doing nothing else.
  await page.addInitScript(() => {
    window.__zomeCalls = [];
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      try {
        let bytes = null;
        if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
        else if (ArrayBuffer.isView(data)) bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        if (bytes) {
          const text = new TextDecoder('latin1').decode(bytes);
          for (const fn of ['get_critiques_for', 'get_claims_by_domain', 'get_claims_by_agent']) {
            if (text.includes(fn)) window.__zomeCalls.push(fn);
          }
        }
      } catch { /* observation must never break the page */ }
      return send.call(this, data);
    };
  });

  try {
    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });

    // ---- 1. The flag is on every claim, and it discriminates -------------
    log('=== 1. Browse: the flag appears on every claim and tells them apart ===');
    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await page.locator('.search-row input').first().fill(DOMAIN);
    await page.getByRole('button', { name: 'Load claims' }).first().click();
    await page.waitForTimeout(4000);

    const browseText = await page.locator('.claim-list').first().innerText();
    check('all three claims are on screen',
      browseText.includes(CONTENT_CRITIQUED) && browseText.includes(CONTENT_QUIET)
      && browseText.includes(CONTENT_AGENT2));

    const flagCount = await page.locator('[data-testid="critiqued-flag"]').count();
    check(`every claim carries a flag (${flagCount} flags, 3 claims)`, flagCount === 3);

    const critiquedFlag = cardFor(page, CONTENT_CRITIQUED).locator('[data-testid="critiqued-flag"]');
    const quietFlag = cardFor(page, CONTENT_QUIET).locator('[data-testid="critiqued-flag"]');
    check('the critiqued claim reads as critiqued',
      (await critiquedFlag.getAttribute('data-critiqued')) === 'true');
    check('the uncritiqued claim reads as NOT critiqued — the flag discriminates',
      (await quietFlag.getAttribute('data-critiqued')) === 'false');
    check("another agent's uncritiqued claim also reads as NOT critiqued",
      (await cardFor(page, CONTENT_AGENT2).locator('[data-testid="critiqued-flag"]')
        .getAttribute('data-critiqued')) === 'false');

    const critiquedWords = await critiquedFlag.innerText();
    const quietWords = await quietFlag.innerText();
    check(`the words differ between the two states (${JSON.stringify(critiquedWords)} vs ${JSON.stringify(quietWords)})`,
      critiquedWords !== quietWords && /critiqued/i.test(critiquedWords));

    // ---- 2. INVARIANT 1: no magnitude anywhere on this surface -----------
    //
    // Written against the PRESENCE OF A DIGIT rather than against a phrase,
    // for the reason author-scope-ui.mjs records: a screen can state the
    // invariant it is breaching, in the same paragraph, with a count sitting
    // in front of the sentence, and no text search finds a contradiction.
    log('\n=== 2. Invariant 1: a fact, with no magnitude to order by ===');
    const allFlagText = (await page.locator('[data-testid="critiqued-flag"]').allInnerTexts()).join(' | ');
    check(`NO FLAG CARRIES A DIGIT (${JSON.stringify(allFlagText.slice(0, 90))})`,
      !/\d/.test(allFlagText));

    // AND NO QUANTITY WORD, which the digit rule alone does not catch. English
    // smuggles magnitude without numerals: "several responses" reverses 6.28's
    // decision by a text change exactly the way "3 critiques" would, and the
    // first draft of 6.31 proposed "Two people added their experience" — a
    // count in words, caught while building this.
    check(`NO FLAG CARRIES A QUANTITY WORD (${JSON.stringify(allFlagText.slice(0, 90))})`,
      !/\b(one|two|three|four|five|six|seven|eight|nine|ten|several|many|most|few|multiple|numerous|dozens?)\b/i
        .test(allFlagText));

    // THE TWO-STATE CHECK WAS REPLACED, NOT RELAXED, WHEN 6.28 WAS DECIDED.
    //
    // It asserted `distinctFlagStates.size <= 2`, which enforced the BOOLEAN —
    // the thing 6.28 decided against, because a boolean is the maximal
    // flattening of five modes and Invariant 4 forbids exactly that. A typed
    // signal has more than two states by construction, so that assertion
    // would now fail for the right reason, and deleting it would leave the
    // property it protected unguarded.
    //
    // WHAT IT PROTECTED WAS NOT THE STATE COUNT. It was: a reader must not be
    // able to order a domain by this line. Three assertions replace it, and
    // together they are stricter than the one they retire.
    const flagModes = await page.locator('[data-testid="critiqued-flag"]').evaluateAll(
      (els) => els.map((e) => (e.dataset.modes || '').split(',').filter(Boolean)),
    );

    // (1) NOMINAL, NOT ORDINAL: every label must come from the five-mode
    // vocabulary, so nothing numeric or quantitative can reach this line.
    const VOCAB = ['experiential', 'methodological', 'logical', 'evidential', 'phenomenological'];
    const strange = flagModes.flat().filter((m) => !VOCAB.includes(m.toLowerCase()));
    check(`every rendered kind is one of the five modes (${JSON.stringify([...new Set(flagModes.flat())])})`,
      strange.length === 0);

    // (2) NO KIND REPEATS ON A CLAIM, so a count cannot be inferred by
    // repetition — de-duplication happens at derivation and this proves it.
    const repeated = flagModes.filter((ms) => new Set(ms).size !== ms.length);
    check('no claim repeats a kind, so repetition cannot smuggle a tally in', repeated.length === 0);

    // (3) BOUNDED AT FIVE. 6.28 accepts a cardinality of 0..5 as the price of
    // Invariant 4 — bounded, where a count was unbounded. If a claim ever
    // showed more than five, the de-duplication is gone and with it the bound.
    const widest = Math.max(0, ...flagModes.map((ms) => ms.length));
    check(`no claim shows more than five kinds, so the magnitude stays bounded (widest ${widest})`,
      widest <= 5);

    check('the flag says what happened and does not instruct — an instruction would be an attention ordering',
      !/should|must|needs|review this|look at/i.test(allFlagText));

    // ---- 3. THE CENTRAL CHECK — the regression, and the only one that -----
    //         could have caught the shipped defect
    //
    // By Author on the reader's OWN claims fills `myCritiqueCounts`, which is
    // module-level and never cleared. Returning to Browse then re-rendered
    // the same shared card with a COUNT on the reader's claims and nothing on
    // anyone else's. Every other check in this file passed against that.
    log('\n=== 3. THE REGRESSION: a count from By Author must not follow the reader to Browse ===');
    await page.getByRole('button', { name: 'By Author', exact: true }).click();
    await page.locator('[data-testid="author-key-input"]').fill(b64(agent1.me));
    await page.getByTestId('author-load').click();
    await page.waitForTimeout(4000);

    const authorCounts = await page.locator('[data-testid="critique-count"]').count();
    check(`PRECONDITION: the count DOES render on the reader's own By Author listing (${authorCounts}) — `
      + 'without this the regression check below is vacuous',
      authorCounts >= 1);

    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await page.waitForTimeout(1500);

    const browseCounts = await page.locator('[data-testid="critique-count"]').count();
    check(`and NO count renders on Browse afterwards (${browseCounts}) — the gate is on the SURFACE, `
      + 'not only on ownership',
      browseCounts === 0);

    const browseAfter = await page.locator('.claim-list').first().innerText();
    check('no claim on Browse shows a critique tally in words either',
      !/\d+\s+critiques?\s+on\s+this/i.test(browseAfter));
    check('the flags are still there after the round trip — the fix removed the count, not the answer',
      (await page.locator('[data-testid="critiqued-flag"]').count()) === 3);

    // ---- 4. The By Author surface keeps its count, and only for the owner -
    log('\n=== 4. CONTROL: By Author still counts the reader\'s own, and flags everyone else\'s ===');
    await page.getByRole('button', { name: 'By Author', exact: true }).click();
    await page.locator('[data-testid="author-key-input"]').fill(b64(agent2.me));
    await page.getByTestId('author-load').click();
    await page.waitForTimeout(4000);

    const otherAgentCounts = await page.locator('[data-testid="critique-count"]').count();
    check(`no count on ANOTHER agent's listing (${otherAgentCounts})`, otherAgentCounts === 0);
    check("another agent's claims carry the flag instead",
      (await page.locator('[data-testid="critiqued-flag"]').count()) >= 1);

    // ---- 5. The read is real, and the third state exists -----------------
    log('\n=== 5. The read reached the DHT, and absence is distinguishable from none ===');
    const zomeCalls = await page.evaluate(() => window.__zomeCalls ?? []);
    check('the page put get_critiques_for on the wire', zomeCalls.includes('get_critiques_for'));
    check('CONTROL: the wire-watcher works — it also saw the domain read',
      zomeCalls.includes('get_claims_by_domain'));

    // A domain the browser has never read: every claim is in the ABSENT
    // state, so the screen must show no flag at all rather than a page of
    // "no critiques on this yet" — which would be the 6.13 defect in a new
    // place, telling a reader a claim is unchallenged before asking.
    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await page.locator('.search-row input').first().fill(`${DOMAIN}Empty`);
    await page.getByRole('button', { name: 'Load claims' }).first().click();
    await page.waitForTimeout(2500);
    check('an empty domain shows no flags rather than a screenful of "no critiques yet"',
      (await page.locator('[data-testid="critiqued-flag"]').count()) === 0);

    check('CONTROL: the page raised no uncaught errors throughout', pageErrors.length === 0);
    if (pageErrors.length) for (const e of pageErrors) log(`    pageerror: ${e}`);
  } finally {
    await browser.close();
    preview.kill();
  }

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — a reader can tell whether a claim has been argued');
    log('with, on every claim and without opening it; the signal has two states');
    log('and no digit, so there is no magnitude to order a domain by; and a');
    log('count read on the By Author tab does not follow the reader to Browse.');
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(1); });
