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
// AND §5 IS THE OTHER HALF OF THE SAME ROW, ADDED 2026-11-02, WHICH CLOSES IT.
// §4 reads the ENTRY: it asserts whether an author recorded anything. That is
// a numerator with its denominator hidden — "recorded having seen 1 other
// objection" says nothing until a reader knows whether there was one other
// objection or forty, and NO ENTRY CAN CARRY THE ANSWER, because the figure is
// a count of what this conductor can resolve over its own arc at read time.
// That is `critiques_unseen_by`, the query open-work 6.1 held unsurfaced, and
// §5 is what it says on a screen.
//
// THE FAKE HERE IS A WORKING SCREEN, which is why the load-bearing check is an
// ABSENCE. A panel that listed the unseen set under every critique would be
// correct about every hash it drew and still be wrong: for a critique whose
// client never sent `past_cone` the "unseen" set is EVERY sibling, so showing
// it captioned as what the author did not see manufactures a gap out of a
// missing feature and reads as an accusation nobody made. So §5 asserts that
// NO set is offered in the not-recorded branch, beside a control proving one
// IS offered where a cone genuinely omits something.
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
//   FIVE MORE INJECTIONS CAME WITH §5, 2026-11-02, AND THREE OF THEM WENT RED
//   WHERE NO WORDING CHECK COULD — which is the finding, not the count.
//
//   CJ: the `cone_recorded` guard removed, so the unseen SET is offered in
//   the not-recorded branch too — the accusation manufactured out of a
//   missing feature, and the one defect this section exists for.
//   Result: THREE red. The absence check, the control beside it, and §5c's
//   row count. THE CONTROL IS THE INTERESTING RED: it reads
//   `toggles.first()`, and with every critique carrying a toggle the first
//   one is no longer the partial case — so the control is coupled to the
//   absence it controls for, and a reader of a future failure should expect
//   both to move together rather than treat the second as a separate defect.
//   WHAT STAYED GREEN IS WORTH MORE: "each is named by its own words"
//   passed, because the injected list is a SUPERSET and still contains the
//   two rows the check looks for. That check cannot discriminate a superset
//   and is left recorded as such rather than tightened into something the
//   row count already covers.
//
//   CK: the partial line's denominator dropped — "Recorded having seen 1
//   other objections before writing".
//   Result: TWO red, both in §5. §4's own cone check stayed green, correctly,
//   because it asserts a different line; and the `data-state` check stayed
//   green, which is the thing to notice — the state ATTRIBUTE and the WORDING
//   can drift apart, so a screen can be in the right state and say the wrong
//   sentence, and only the text assertions see it.
//
//   CL: the not-recorded line faded — `opacity: 0.55`, `font-size: 0.68rem`.
//   Result: ONE red, and EVERY wording check green. This is 6.1's rule
//   broken typographically after the words were careful not to break it, and
//   it is invisible to every assertion that reads text. Caught only by
//   reading `getComputedStyle` back off the rendered page, which the check
//   prints: `10.88px|400|italic|0.55` against `12px|400|italic|1`.
//
//   CM: the coordinator's `note` paraphrased into the client's own voice.
//   Result: THREE red — and "the coordinator's own note is rendered for every
//   critique" STAYED GREEN, because it counts elements. A COUNT CANNOT TELL
//   WHOSE WORDS ARE IN THEM, which is this directory's own recurring finding
//   about checks that validate a self-description; the three wording
//   assertions are what actually carry §5b.
//
//   CN: the denial moved to sit UNDER the list it qualifies.
//   Result: ONE red, both wording checks green — the denial is still there
//   and merely arrives too late to reach a reader who has already drawn the
//   conclusion. Order is the assertion, so order is checked.
//
//   AND THE FIXTURE'S OWN DEFECT, found before the browser opened twice over:
//   the first draft seeded two critiques and could not produce the PARTIAL
//   outcome at all (the one that recorded a cone had seen every sibling there
//   was), and the second asserted two siblings when there are three, having
//   forgotten that the complete-case critique is itself a sibling of the
//   partial one. Both were caught by asserting the fixture THROUGH THE QUERY
//   before opening the page — without which §5 would have been asserting over
//   a screen that had no partial state to draw, and passing.
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
// THE TWO FIXTURES §5 NEEDS, AND NEITHER BRANCH IS REACHABLE WITHOUT THEM.
// `critiques_unseen_by` has three outcomes and the first draft of this setup
// could only produce two: with A (no cone) and B (cone [A]) in existence, B
// has seen every sibling there is, so the PARTIAL case — a cone that records
// something and omits something — never occurred. LATE arrives after B and
// is never in anybody's cone, which is what makes B partial; SAW_ALL records
// all three and is the control that keeps "partial" from being the only
// recorded state on screen.
const LATE = 'Filed after the one that recorded a cone, so it is in nobody\'s.';
const SAW_ALL = 'Filed last, recording every objection already on the claim.';
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
  const withCone = await node.call('create_critique', {
    target, target_type: 'Claim', critique_mode: 'Methodological', content: WITH_CONE,
    author: node.me, timestamp: nowMicros(), replication_attempted: false,
    evidence_hashes: [], species: null, past_cone: [firstCritique],
  });
  await sleep(500);
  // AFTER the one that recorded a cone, and deliberately not in it — this is
  // what turns `withCone` from "recorded everything" into "recorded 1 of 2",
  // which is the only state where an unseen SET exists to be shown at all.
  const late = await node.call('create_critique', {
    target, target_type: 'Claim', critique_mode: 'Evidential', content: LATE,
    author: node.me, timestamp: nowMicros(), replication_attempted: false,
    evidence_hashes: [], species: null,
  });
  await sleep(500);
  // THE COMPLETE CASE, and transitive closure is why the list is all three:
  // admitting `withCone` means admitting everything `withCone` admitted, so
  // a cone of [withCone, late] alone would be REFUSED for omitting
  // `firstCritique`. The validation rule and the fixture agree here by
  // construction rather than by luck.
  await node.call('create_critique', {
    target, target_type: 'Claim', critique_mode: 'Experiential', content: SAW_ALL,
    author: node.me, timestamp: nowMicros(), replication_attempted: false,
    evidence_hashes: [], species: null, past_cone: [firstCritique, withCone, late],
  });
  await sleep(500);

  // ASSERTED THROUGH THE QUERY BEFORE THE BROWSER IS OPENED, so a §5 red is
  // known to be the screen's fault and not the fixture's. This is the
  // `foresight-ui` rule — set up through the conductor, measured through the
  // browser — applied to the thing §5 is actually about.
  const coneReport = await node.call('critiques_unseen_by', withCone);
  log(`    conductor says: withCone recorded ${coneReport.seen_count} of `
    + `${coneReport.total_known}, ${coneReport.unseen.length} unseen`);
  // THREE SIBLINGS, NOT TWO, AND THE FIRST DRAFT OF THIS ASSERTION SAID TWO
  // — it forgot that the complete-case critique is itself a sibling of the
  // partial one. Caught here rather than in the browser, which is the whole
  // reason the fixture is asserted through the query before the page opens.
  if (!(coneReport.cone_recorded && coneReport.unseen.length === 2
        && coneReport.total_known === 3)) {
    log('  SETUP FAILED: the PARTIAL cone case was not produced, so §5 would');
    log('  be asserting over a screen that has no partial state to draw.');
    process.exit(1);
  }

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

    log('\n=== 5. THE DENOMINATOR, AND THE SET IT LEAVES OUT (6.1 second half) ===');
    // WHAT THIS SECTION IS FOR, and it is not "the query got a screen". §4
    // asserts the cone STATE: whether an author recorded anything. That line
    // is a numerator with its denominator hidden — "recorded having seen 1"
    // says nothing until a reader knows whether there was one other
    // objection or forty, and only `critiques_unseen_by` knows, because the
    // denominator is a count of what THIS conductor can resolve right now.
    //
    // THE PLAUSIBLE FAKE HERE IS A WORKING SCREEN. A panel that renders the
    // unseen list accurately under every critique would be correct about
    // every hash it drew and would still be wrong: for a critique whose
    // client never sent `past_cone` the "unseen" set is EVERY sibling, so
    // listing it captioned as what the author did not see manufactures a
    // gap out of a missing feature and reads as an accusation nobody made.
    // So the load-bearing check below is an ABSENCE — no set is offered in
    // the not-recorded branch — and it sits beside a control proving a set
    // IS offered where one genuinely exists.
    await page.waitForSelector('[data-testid="unseen-figures"]', { timeout: 20000 });
    const figures = page.locator('[data-testid="unseen-figures"]');
    check('every critique carries the denominator, not just the interesting one',
      await figures.count() === 4);
    const states = await figures.evaluateAll(
      (els) => els.map((el) => el.dataset.state));
    check('all three of the query\'s outcomes are on ONE screen',
      states.filter((x) => x === 'not-recorded').length === 2
      && states.filter((x) => x === 'recorded-partial').length === 1
      && states.filter((x) => x === 'recorded-complete').length === 1);

    const partial = figures.nth(states.indexOf('recorded-partial'));
    const partialText = await partial.innerText();
    log(`    partial reads: ${JSON.stringify(partialText)}`);
    // BOTH NUMBERS OR NEITHER. A line stating what was seen without what it
    // was seen out of is the exact half-statement this row was left holding.
    check('the partial case states the numerator AND the denominator',
      /seen 1 of the 3 other objections/i.test(partialText));
    // ONE OBSERVER'S COUNT, SAID OUT LOUD. `total_known` is what this
    // conductor could resolve over its own arc at read time; stated flatly
    // the figure reads as a fact about the world.
    check('and attributes the denominator to this reader, not to the world',
      /this reader/i.test(partialText));

    const absentFigures = figures.nth(states.indexOf('not-recorded'));
    const absentFiguresText = await absentFigures.innerText();
    log(`    not-recorded reads: ${JSON.stringify(absentFiguresText)}`);
    check('CONTROL: the not-recorded case gets a denominator line too, not silence',
      /knows of 3 other objections/i.test(absentFiguresText));
    check('and says there is no gap to show rather than showing one',
      /no gap here to show/i.test(absentFiguresText));

    // THE LOAD-BEARING ABSENCE. Two critiques recorded nothing; neither may
    // offer a list of what it "did not see", because there is no statement
    // for that list to be a gap in.
    const toggles = page.locator('[data-testid="unseen-toggle"]');
    check('NO unseen set is offered for a critique that recorded nothing',
      await toggles.count() === 1);
    check('CONTROL: and one IS offered where a cone really does omit something',
      /Show the 2 not recorded as seen/i.test(await toggles.first().innerText()));

    // EQUAL WEIGHT, MEASURED RATHER THAN ASSERTED. 6.1's rule is that the
    // not-recorded case must not be rendered more faintly than the recorded
    // one — a fainter absence re-asserts ignorance typographically after the
    // wording has avoided it. The two lines share a class so that it holds;
    // this reads it back off the rendered page, which is the only place the
    // claim is true or false.
    const weights = await page.evaluate(() => {
      const els = [...document.querySelectorAll('[data-testid="unseen-figures"]')];
      const pick = (state) => {
        const el = els.find((e) => e.dataset.state === state);
        if (!el) return null;
        const s = getComputedStyle(el);
        return `${s.fontSize}|${s.fontWeight}|${s.fontStyle}|${s.opacity}|${s.color}`;
      };
      return { absent: pick('not-recorded'), partial: pick('recorded-partial') };
    });
    log(`    absent: ${weights.absent}`);
    log(`    partial: ${weights.partial}`);
    check('the two cone states render at the SAME typographic weight',
      weights.absent !== null && weights.absent === weights.partial);

    log('\n=== 5b. the protocol says what the figures support, not the client ===');
    // THE DIVISION OF LABOUR: the client states the figures, which it can
    // check; the coordinator states what they do and do not support, which
    // is a judgement SPEC writes down. Paraphrasing it here would be a
    // second place for that wording to rot — open-work 1.20's bug class.
    const notes = page.locator('[data-testid="unseen-note"]');
    check('the coordinator\'s own note is rendered for every critique',
      await notes.count() === 4);
    const absentNote = await notes.nth(states.indexOf('not-recorded')).innerText();
    log(`    absent note: ${JSON.stringify(absentNote.slice(0, 90))}`);
    // VERBATIM FROM THE ZOME. These are the coordinator's words, so a client
    // that rewrote them in its own voice fails here — which is the point.
    check('and it is the zome\'s wording, carrying "silent, not uninformed"',
      /silent, not uninformed/i.test(absentNote));
    check('the absent note denies that any of it is evidence of ignorance',
      /nothing here is evidence of ignorance/i.test(absentNote));
    const completeNote = await notes.nth(states.indexOf('recorded-complete')).innerText();
    check('and the complete case keeps the observer caveat',
      /another observer may know of more/i.test(completeNote));

    log('\n=== 5c. the set, and the denial that arrives BEFORE it ===');
    await toggles.first().click();
    await page.waitForSelector('[data-testid="unseen-list"]', { timeout: 10000 });
    const unseenItems = page.locator('[data-testid="unseen-item"]');
    check('the set opens and holds exactly as many rows as the figures stated',
      await unseenItems.count() === 2);
    // BOTH of them, by their own words — a list that rendered one row and
    // stated two would leave the figure above it unverifiable, which is the
    // failure this check exists to make impossible.
    const setText = (await unseenItems.allInnerTexts()).join('\n');
    check('each is named by its own words, so the figure can be checked',
      setText.includes(LATE) && setText.includes(SAW_ALL));
    check('and none is a bare hash the reader cannot audit',
      await page.locator('[data-testid="unseen-item-unresolved"]').count() === 0);
    // ORDER IS THE ASSERTION. A caveat printed under the list arrives after
    // the reader has already drawn the conclusion.
    const denialFirst = await page.evaluate(() => {
      const caption = document.querySelector('[data-testid="unseen-caption"]');
      const list = document.querySelector('[data-testid="unseen-list"]');
      if (!caption || !list) return false;
      return (caption.compareDocumentPosition(list)
        & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    check('the denial is rendered BEFORE the list it qualifies, not after',
      denialFirst);
    const caption = await page.locator('[data-testid="unseen-caption"]').first().innerText();
    check('and it denies the accusation in words, not merely omits it',
      /does NOT mean the author knew of them and ignored them/i.test(caption));
    check('naming the innocent reading too — they may not have arrived',
      /had not arrived/i.test(caption));

    log('\n=== 6. ordering is the protocol\'s, not the client\'s ===');
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
    log('');
    log('AND THE DENOMINATOR IS ON SCREEN WITH IT, which closes 6.1: all three');
    log('of critiques_unseen_by\'s outcomes render on one page, every figure is');
    log('attributed to THIS reader rather than to the world, the coordinator\'s');
    log('own note is rendered verbatim rather than paraphrased, and the unseen');
    log('SET is offered ONLY where a cone was actually recorded — because for a');
    log('critique whose client never sent past_cone that set is every sibling,');
    log('and listing it would manufacture a gap out of a missing feature.');
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\nHARNESS ERROR: ${e?.stack ?? e}`); process.exit(1); });
