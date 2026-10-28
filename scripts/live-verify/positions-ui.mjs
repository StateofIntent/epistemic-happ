#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/positions-ui.mjs — attributed positions on screen, and
// the tally that must never appear beside them.
//
// WHY THIS EXISTS, and it is not "assessments got a screen". `Assessment` and
// `get_assessments_for` have been in the coordinator since long before any
// client reached either. On 2026-10-28 `agent-sdk` and `mcp-server` both
// gained assessment PUBLISHING — so from that moment an agent could file an
// attributed position on somebody's claim and the person whose claim it was
// had no surface that showed it. That is worse than the original absence: it
// is the half-surfaced defect this directory keeps recording (`write-symmetry`
// is the same asymmetry pointed the other way), and it was introduced by this
// project's own work rather than inherited.
//
// WHAT THE PLAUSIBLE FAKE IS HERE, because it is not a missing panel. It is a
// panel that renders every position accurately — stance, confidence, author,
// reasons — and then puts "2 support, 1 disputes" at the top of it. Every word
// of that would be true, and it would be a VERDICT NOBODY PUBLISHED: an
// unattributed conclusion assembled by the client out of attributed positions,
// which is Invariant #1 through the back door. The protocol refuses to divide
// these lists itself; `SettlementStatus` turns assessments into a state only
// against a NAMED policy somebody signed and can be argued with. So this
// file's central check is not that the panel works. It is that NOTHING ON THE
// PAGE COUNTS, with three real positions rendered and a deliberate 2-1 split
// available to be counted.
//
// THE SECOND ASSERTION IS open-work 6.1's, AND IT ONLY BECAME TESTABLE NOW.
// 6.1 was reclassified as blocked on 6.5 because `cone_recorded` was false for
// every entry in existence — nothing populated `past_cone`, so the indicator
// had one state and a one-state indicator teaches nothing. An SDK agent now
// records a cone that is true by construction, so BOTH states occur on one
// screen and the rule can finally be checked: an absent cone must read as
// "recorded nothing", never as "saw nothing". The harness therefore seeds one
// critique WITH a cone and one WITHOUT, which is the control that makes the
// distinction observable rather than asserted.
//
// SET UP THROUGH THE CONDUCTOR, MEASURED THROUGH THE BROWSER, for the reason
// `foresight-ui.mjs` gives: the stances, the split and the cones are created
// by zome call so the harness knows the truth before it looks at the screen.
//
// Prereqs: a CLEAN sandbox (scripts/sandbox.sh clean && start) and a UI build.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
//   TWO DEFECTS WERE FOUND BY WRITING IT, BOTH IN THE UI IT TESTS, and the
//   second is the one worth reading.
//
//   (a) The no-tally scan covered the WHOLE PAGE and failed on `Critique
//   budget 16/20 left this 60 min`. That meter is a legitimate ratio — the
//   reader's own rate-limit budget against the protocol's limit, which says
//   nothing about anybody's positions — so a whole-page ban on `n/m` forbids
//   the wrong thing, and honouring it would have meant deleting an honest
//   meter to satisfy a check. Scoped to the claim card, which is where a
//   tally of positions could appear. The checks now PRINT what they matched,
//   because a bare red sent the first run looking for a tally that was never
//   there.
//
//   (b) THE UI HAD INVENTED A THIRD CONE STATE AND CLAIMED IGNORANCE WITH IT.
//   `renderConeState` treated `past_cone: []` as distinct from an absent
//   field and rendered it as "Recorded having seen none of this claim's other
//   objections" — a positive claim that the author saw nothing, which is
//   precisely the over-claim open-work 6.1 exists to prevent, committed by
//   the code written to prevent it. It is also unrepresentable: `past_cone`
//   is a `Vec<ActionHash>` with `#[serde(default)]`, so an omitted field and
//   an explicit `[]` are the SAME STORED VALUE, and the protocol's own
//   `cone_recorded = !past_cone.is_empty()` makes both "not recorded". There
//   are two states. §4 failing against CORRECT UI behaviour is what surfaced
//   it — the control asserted an absent-cone marker the UI would never draw.
//
//   Injection H: an accurate tally — `${supports} support, ${disputes}
//   disputes` — rendered at the top of the panel. This is the fake this file
//   exists for: every word true, and a verdict nobody published.
//   Result: ONE red, naming the string it found ("2 support").
//   WHAT STAYED GREEN IS THE POINT: the ratio check and the consensus check
//   both passed, because "2 support, 1 disputes" is neither "2/1" nor the
//   word "consensus". The three patterns are COMPLEMENTARY and none of them
//   is sufficient alone — a tally written as a fraction is caught only by the
//   first, one written as a declaration only by the third. Do not delete any
//   of the three on the grounds that another covers it.
//
//   Injection I: the not-recorded cone reworded to "Saw none of this claim's
//   other objections."
//   Result: TWO red — the wording check and the explicit-denial check — while
//   "CONTROL: one that recorded nothing is ALSO marked" STAYED GREEN, because
//   the element is still present with its testid and merely lies. Presence
//   proves nothing about honesty here; the wording assertions carry it, and
//   the denial is checked separately from the phrasing because avoiding a
//   false statement is weaker than actively refusing the inference.
//
//   Injection J: the panel sorted by stance name.
//   Result: TWO red — the grouping check and its control. A reader skims
//   order as significance, so sorting stances ranks them.
//
//   Restored and re-run: all twenty-three green.
//
//   An injection result that is not reproduced is a claim, not evidence —
//   `foresight-ui.mjs`'s header records what that cost once.
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

const ADMIN = Number(process.env.ADMIN_PORT ?? 8889);
const APP = Number(process.env.APP_PORT ?? 8888);
const APP_ID = process.env.APP_ID ?? 'epistemic-resonance-happ';
const PREVIEW_PORT = Number(process.env.PREVIEW_PORT ?? 4183);

let failures = 0;
const log = (...a) => console.log(...a);
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowMicros = () => Date.now() * 1000;

async function connect() {
  const admin = await AdminWebsocket.connect({ url: new URL(`ws://localhost:${ADMIN}`), wsClientOptions: { origin: 'live-verify' } });
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: APP_ID });
  const app = await AppWebsocket.connect({ url: new URL(`ws://localhost:${APP}`), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const ids = [];
  for (const cells of Object.values(info.cell_info))
    for (const c of cells) if (c?.type === CellType.Provisioned) ids.push(c.value.cell_id);
  for (const id of ids) {
    for (let i = 0; i < 30; i++) {
      try { await admin.authorizeSigningCredentials(id); break; }
      catch (e) { if (!String(e.message ?? e).includes('CellDisabled')) throw e; await sleep(1000); }
    }
  }
  return {
    me: ids[0][1],
    call: (fn, payload) => app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload }, 60000),
  };
}

const CLAIM_TEXT = 'A claim with positions taken on it, for the positions surface.';
const WITH_CONE = 'Filed while recording what had already been said.';
const WITHOUT_CONE = 'Filed with no record of what had already been said.';
const REASONED = 'Supported because the method replicates.';

async function main() {
  const node = await connect();
  const DOMAIN = `Positions${Date.now()}`;

  log('--- setting up through the conductor, so the truth is known ---');
  const claim = await node.call('create_claim', {
    content: CLAIM_TEXT, domain: DOMAIN, confidence: 'Moderate', semantic_tags: [],
    author: node.me, timestamp: nowMicros(), evidence_hashes: [], attestation_policy: null,
  });
  void claim; // the ACTION hash; critique and assessment targets are ENTRY hashes
  // RESOLVED FROM THE DOMAIN READ rather than assumed to equal the action
  // hash — `validate_critique` refuses an ActionHash-shaped target outright.
  const inDomain = await node.call('get_claims_by_domain', DOMAIN);
  if (inDomain.length !== 1) {
    log(`  SETUP FAILED: expected one claim in ${DOMAIN}, found ${inDomain.length}.`);
    process.exit(1);
  }
  const target = inDomain[0].signed_action.hashed.content.data.entry_hash;

  // THE FIELD IS OMITTED HERE, and it would be identical sent as `[]` —
  // which is the finding this setup's first draft produced. `past_cone` is a
  // `Vec<ActionHash>` with `#[serde(default)]`, so an omitted field and an
  // explicit `[]` are THE SAME STORED VALUE, and the protocol's own
  // `cone_recorded = !past_cone.is_empty()` makes BOTH "not recorded". There
  // is no third state, and the UI's first draft invented one: it rendered
  // `[]` as a positive claim of having seen none of the siblings, which is
  // exactly the over-claim open-work 6.1 exists to prevent. §4 failing
  // against correct behaviour is what surfaced it. Omitted is written here
  // because it is the real-world case — every critique from before
  // `protocol_version: 10`, and every client that does not send the field.
  const firstCritique = await node.call('create_critique', {
    target, target_type: 'Claim', critique_mode: 'Logical', content: WITHOUT_CONE,
    author: node.me, timestamp: nowMicros(), replication_attempted: false,
    evidence_hashes: [], species: null,
  });
  await sleep(500);
  await node.call('create_critique', {
    target, target_type: 'Claim', critique_mode: 'Methodological', content: WITH_CONE,
    author: node.me, timestamp: nowMicros(), replication_attempted: false,
    evidence_hashes: [], species: null, past_cone: [firstCritique],
  });

  // A DELIBERATE 2-1 SPLIT, so a tally is available to be computed. Without an
  // uneven split "no tally on the page" would be satisfied by a page that
  // happened to have nothing interesting to count.
  for (const [stance, confidence, rationale] of [
    ['Supports', 'High', REASONED],
    ['Supports', 'Tentative', null],
    ['Disputes', 'Moderate', 'Disputed because the sample is small.'],
    ['Abstains', 'Hypothetical', 'Looked, and will not take a side on this one.'],
  ]) {
    await node.call('publish_assessment', {
      assessor: node.me, target, stance, confidence, rationale,
      past_cone: [], timestamp: nowMicros(),
    });
  }

  const truth = await node.call('get_assessments_for', target);
  log(`    conductor says: ${truth.length} assessments on the claim`);
  if (truth.length !== 4) {
    log('  SETUP FAILED: expected four assessments.');
    log('  If the code looks right the conductor is on a STALE BUILD —');
    log('  scripts/pack-webhapp.sh, then scripts/sandbox.sh clean && start.');
    process.exit(1);
  }

  log('\nStarting vite preview (production bundle) ...');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: new URL('../../mobile-ui/', import.meta.url).pathname, stdio: 'ignore',
  });
  await sleep(3000);

  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  try {
    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
    // THE CONNECT SCREEN COMES FIRST. The tab bar does not exist until the
    // client has a conductor, and the form's defaults already point at the
    // sandbox — so this is one click, not a configuration step.
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });
    await page.locator('nav.tab-bar button', { hasText: 'Browse' }).first().click();
    await page.locator('[data-testid="browse-domain-input"]').fill(DOMAIN);
    await page.getByRole('button', { name: /load claims/i }).first().click();
    await page.waitForSelector('[data-testid="toggle-critiques"]', { timeout: 20000 });
    await page.locator('[data-testid="toggle-critiques"]').first().click();
    await page.waitForSelector('[data-testid="assessment-panel"]', { timeout: 20000 });

    log('\n=== 1. the positions are on screen, attributed ===');
    const items = page.locator('[data-testid="assessment-item"]');
    check('every position the conductor holds is rendered, none dropped',
      await items.count() === 4);
    const stances = await page.locator('[data-testid="assessment-stance"]').allInnerTexts();
    check('each carries its own stance', stances.length === 4);
    check('and ABSTAINS is rendered as a position like the others',
      stances.some((t) => /Abstains/i.test(t)));
    check('every position names an assessor, so none is anonymous',
      await page.locator('[data-testid="assessment-assessor"]').count() === 4);
    // LABELLED AS THEIRS. Unlabelled, a confidence figure beside an agent
    // reads as this client's confidence IN that agent, which is a reputation
    // signal the protocol does not compute and must not be implied.
    const confs = await page.locator('[data-testid="assessment-confidence"]').allInnerTexts();
    check('and states whose confidence it is, not a bare number',
      confs.length === 4 && confs.every((t) => /their confidence/i.test(t)));

    log('\n=== 2. A POSITION WITH NO REASON SAYS SO ===');
    // One assessment was published with `rationale: null`. A silent gap
    // invites a reader to supply a reason on the assessor's behalf.
    check('the unreasoned position states that no reason was given',
      await page.locator('[data-testid="assessment-no-rationale"]').count() === 1);
    check('and says the position still stands as theirs',
      /still stands as theirs/i.test(
        await page.locator('[data-testid="assessment-no-rationale"]').first().innerText()));
    check('CONTROL: the reasoned ones render their reasons',
      await page.locator('[data-testid="assessment-rationale"]').count() === 3);

    log('\n=== 3. NOTHING ON THE PAGE COUNTS THEM ===');
    // THE CENTRAL CHECK. Two Supports against one Disputes is on screen and
    // available to be divided; a client that summarised it would be
    // publishing a verdict nobody authored.
    // SCOPED TO THE CLAIM CARD, NOT THE WHOLE PAGE, and the first draft was
    // not — it failed on `Critique budget 16/20 left this 60 min`. That meter
    // is a LEGITIMATE ratio: it is the reader's own rate-limit budget against
    // the protocol's limit, which SPEC requires a client to be able to show
    // and which says nothing about anybody's positions. A whole-page ban on
    // `n/m` therefore forbids the wrong thing, and keeping it would have meant
    // deleting an honest meter to satisfy a check. The claim card is the
    // region where a tally of positions could appear, so it is the region
    // asserted over.
    const cardText = await page.evaluate(() => {
      const card = document.querySelector('.claim-card');
      if (!card) return '';
      // innerText per LEAF with a newline, NOT textContent on the container:
      // textContent concatenates adjacent blocks with no separator, and
      // `foresight-ui.mjs` records an injection that passed BECAUSE of that —
      // "Hit rate: 1/2There is no…" left the ratio pattern's \b unmatched.
      const parts = [];
      card.querySelectorAll('*').forEach((el) => {
        // THE PANEL'S OWN DISCLAIMER IS EXCLUDED, and it has to be: it
        // says "a tally would be a verdict nobody published", so scanning
        // it for the word "verdict" fails on the sentence that exists to
        // promise the opposite. `foresight-ui.mjs` records the same trap
        // from the other side — its no-score check once PASSED a rendered
        // hit rate because the disclaimer's text ran into it. Excluding
        // the denial is what makes the absence assertion about the page
        // rather than about its own microcopy, and the disclaimer's
        // wording is asserted separately below.
        if (el.closest('[data-testid="assessment-no-tally"]')) return;
        if (el.children.length === 0 && el.textContent) parts.push(el.textContent);
      });
      return parts.join('\n');
    });
    check('the claim card was found, so the checks below are not vacuous',
      cardText.length > 0);
    // NAMES WHAT IT MATCHED when it fails. A bare "no ratio displayed: FAIL"
    // sent the first run of this file looking for a tally that was never
    // there; printing the string found the friction meter in one read.
    //
    // THE LABEL STAYS A LITERAL at every call site rather than being passed
    // into a wrapper, because `check-harness-counts.mjs` counts sites whose
    // first argument is a literal — a wrapper made four of them invisible to
    // it and the stated count went wrong by exactly four. Keeping the figure
    // gated is worth more than the lines a wrapper would save.
    //
    // And do not write the call's name followed by a backtick in a comment
    // here: that gate also counts template-literal labels, so the sequence
    // reads to it as a twenty-fourth site. Cost one wrong count to find.
    const noMatch = (re) => {
      const hit = cardText.match(re);
      if (hit) log(`    found: ${JSON.stringify(hit[0].slice(0, 80))}`);
      return hit === null;
    };
    check('no x-of-y ratio is displayed on the claim card',
      noMatch(/\b\d+\s*\/\s*\d+\b/));
    check('no percentage is displayed',
      noMatch(/\b\d{1,3}\s*%/));
    check('no "N support" style tally is displayed',
      noMatch(/\b\d+\s+(support|supports|disputes|dissent|against|in favou?r)\b/i));
    check('no consensus or majority verdict is declared',
      noMatch(/\b(consensus|majority|verdict|overall|net\s+(support|stance))\b/i));
    check('and the panel says IN WORDS that it does not count them',
      /not\s+votes|nothing\s+here\s+counts/i.test(
        await page.locator('[data-testid="assessment-no-tally"]').first().innerText()));
    // AND IT NAMES WHAT WOULD BE NEEDED INSTEAD, because "we do not count"
    // read alone is a refusal; the protocol has an answer and it is a policy
    // somebody published and can be argued with.
    check('naming a stated policy as what a settled state would require',
      /policy/i.test(
        await page.locator('[data-testid="assessment-no-tally"]').first().innerText()));

    log('\n=== 4. THE PAST CONE: "recorded nothing" IS NOT "saw nothing" (6.1) ===');
    // Both states are on screen because the setup seeded both. Before an
    // agent could record a cone this check could not exist: every entry was
    // in the absent state and a one-state indicator asserts nothing.
    const recorded = page.locator('[data-testid="cone-recorded"]');
    const absent = page.locator('[data-testid="cone-absent"]');
    check('a critique that recorded what it had seen says so',
      await recorded.count() >= 1);
    check('CONTROL: and one that recorded nothing is ALSO marked, not left bare',
      await absent.count() >= 1);
    const absentText = await absent.first().innerText();
    check('the absent case says "recorded nothing", not "saw nothing"',
      /recorded nothing/i.test(absentText));
    // THE LOAD-BEARING ONE. The wording must actively deny the inference a
    // reader would otherwise make, rather than merely avoid stating it.
    check('and explicitly denies that it means having seen nothing',
      /not the same as having seen nothing/i.test(absentText));
    check('the recorded case states HOW MANY were seen, not merely that some were',
      /seen \d+ other objection/i.test(await recorded.first().innerText()));

    log('\n=== 5. ordering is the protocol\'s, not the client\'s ===');
    // A panel that put Supports first would be ranking stances, and a reader
    // skims order as significance. The conductor's order is the only one
    // this client is entitled to show.
    const onScreen = (await items.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    check('the stances are NOT grouped or sorted into blocks',
      // Supports, Supports, Disputes, Abstains was published in that order;
      // any client-side sort by stance name would put Abstains first.
      !/^Abstains/i.test(onScreen[0] ?? ''));
    check('CONTROL: the first rendered position is the first one published',
      /Supports/i.test(onScreen[0] ?? ''));

    check('no page errors', pageErrors.length === 0);
    if (pageErrors.length) log(`    ${pageErrors[0].slice(0, 200)}`);
  } finally {
    await browser.close();
    preview.kill();
  }

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — four attributed positions are on screen with their');
    log('assessors, their own confidences and their reasons; the one with no');
    log('reason says so; an uneven split is available to be counted and NOTHING');
    log('counts it; and the past cone distinguishes "recorded nothing" from');
    log('"saw nothing" in both directions, which is open-work 6.1\'s rule and');
    log('was untestable until an agent could record a cone at all.');
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\nHARNESS ERROR: ${e?.stack ?? e}`); process.exit(1); });
