#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/trust-lenses.mjs — live verification of the opt-in
// trust lens surface: AttestationPolicy aimed by the user, is_agent_attested,
// and grant_attestation.
//
// THIS HARNESS IS MOSTLY ABOUT A CONSTRAINT, NOT A FEATURE. README.md §4.4's
// first constraint is what makes this surface legitimate at all:
//
//   "A UI may be a lens the user aims. It must not be a lens that aims
//    itself and conceals that it is aiming. ... If the interface is
//    filtering, the user must have chosen the filter and be able to see it."
//
// The protocol removed get_attestation_weight for approaching a canonical
// reputation score, and a client can trivially reintroduce one. So the
// assertions here are weighted toward the ways this screen could betray
// that, all of which would leave a feature that still "works":
//
//   * a lens applied by DEFAULT — the single worst failure, because the
//     user never chose it and every figure is quietly filtered
//   * a lens applied INVISIBLY, with no banner saying it is on
//     and what it is
//   * a lens whose EFFECT is invisible — disclosed, but with the
//     unfiltered figures replaced rather than shown beside it, so nobody
//     can say what it removed
//   * an empty-root lens accepted as though it were a filter, when
//     is_agent_attested returns true for everyone under it
//   * "not checked" rendered as "does not pass" — a verdict nobody asked for
//
// Two agents AND a browser, which no other harness here combines: agent 2
// exists so there is somebody for agent 1 to vouch FOR, and so a lens
// rooted at agent 1 has a real negative answer to give before the vouch
// and a real positive one after.
//
// Prereqs: a CLEAN sandbox (scripts/sandbox.sh clean && start) and a UI
// build — scripts/pack-webhapp.sh does both builds in the right order.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
// This directory's own rule is that a harness which has only ever been
// green has not been shown to test anything. Recorded here, rather than
// only in a merged PR, so it is readable at the point someone runs this
// file.
//
//   Regression injected: applying a lens by default rather than when the user aims one.
//   Result: five FAILs — the §4.4 violation this whole file exists to catch.
//
// Re-check it the same way if you change what this file asserts: inject,
// watch it go red, restore, watch it go green.
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

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
const AGENT2_APP_ID = 'epistemic-resonance-happ-agent2';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;
const PREVIEW_PORT = 4183;
const DOMAIN = `TrustLens${Date.now()}`;

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

const nowMicros = () => Date.now() * 1000;
const nowSecs = () => Math.floor(Date.now() / 1000);
const b64 = (u8) => Buffer.from(u8).toString('base64');

async function connectApp(admin, appId) {
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: appId });
  const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      // CellInfo became a discriminated union in @holochain/client
      // 0.21 ({ type, value }); it used to be keyed by cell type. The
      // old `CellType.Provisioned in cell` test matches nothing against
      // the new shape, silently yielding no cell ids at all.
      if (cell?.type === CellType.Provisioned || cell?.type === CellType.Cloned) {
        cellIds.push(cell.value.cell_id);
      }
    }
  }
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { me: cellIds[0][1], call };
}

async function main() {
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const agent1 = await connectApp(admin, APP_ID);
  log(`agent1 (the browser's own agent) = ${b64(agent1.me).slice(0, 12)}…`);

  const apps = await admin.listApps({});
  if (!apps.some((a) => a.installed_app_id === AGENT2_APP_ID)) {
    log('Installing agent 2 on the same conductor ...');
    const agent2Pub = await admin.generateAgentPubKey();
    // installApp takes `source: { type: 'path', value }` as of client
    // 0.21, not a bare `path`, and no longer accepts a top-level
    // `membrane_proofs` map. The old shape is rejected by the conductor
    // with "deserialization: Failed to deserialize request".
    await admin.installApp({
      source: { type: 'path', value: HAPP_PATH },
      agent_key: agent2Pub,
      installed_app_id: AGENT2_APP_ID,
    });
    await admin.enableApp({ installed_app_id: AGENT2_APP_ID });
  }
  const agent2 = await connectApp(admin, AGENT2_APP_ID);
  log(`agent2 (the one agent 1 will vouch for) = ${b64(agent2.me).slice(0, 12)}…\n`);

  log(`Seeding membrane ${DOMAIN} with both agents as members ...`);
  const constitution = await agent1.call('publish_constitution', {
    agent: agent1.me,
    promises: [{ action: 'distinguish observation from inference', domain: DOMAIN, modality: null }],
    conditions: [], published_at: nowSecs(), expires_at: null,
  });
  const membraneAction = await agent1.call('create_membrane', {
    domain: DOMAIN,
    description: 'Seeded membrane for trust-lens verification.',
    required_promises: ['distinguish observation from inference'],
    validation_rules_hash: null,
    creator: agent1.me,
    created_at: nowSecs(),
    constitution,
  });

  const membranes = await agent1.call('get_membranes', null);
  const seeded = membranes.find((r) => r.signed_action.hashed.hash
    && b64(r.signed_action.hashed.hash) === b64(membraneAction));
  if (!seeded) {
    log('\n  SETUP FAILED: the membrane just created is not in get_membranes.');
    log('  This is a real failure of the zome, not of the harness. If the code');
    log('  looks correct, the conductor is probably running a STALE BUILD —');
    log('  rebuild with scripts/pack-webhapp.sh and clean the sandbox.');
    process.exit(1);
  }
  const membraneEntryHash = seeded.signed_action.hashed.content.data.entry_hash;

  // Agent 2 needs a constitution of its own before it can join, and a
  // claim so there is discourse for a lens to filter.
  await agent2.call('publish_constitution', {
    agent: agent2.me,
    promises: [{ action: 'distinguish observation from inference', domain: DOMAIN, modality: null }],
    conditions: [], published_at: nowSecs(), expires_at: null,
  });
  await agent1.call('join_membrane', membraneEntryHash);
  await agent2.call('join_membrane', membraneEntryHash);
  await agent1.call('create_claim', {
    content: 'Loaded carries reduce recurrence.', domain: DOMAIN, author: agent1.me,
    timestamp: nowMicros(), evidence_hashes: [], confidence: 'Moderate',
    semantic_tags: [], source_mew: null,
  });
  await agent2.call('create_claim', {
    content: 'Rest alone is sufficient.', domain: DOMAIN, author: agent2.me,
    timestamp: nowMicros(), evidence_hashes: [], confidence: 'Moderate',
    semantic_tags: [], source_mew: null,
  });

  // CRITIQUES, not just claims — and this is the whole reason the seeding
  // is this elaborate. get_discourse_health applies an AttestationPolicy
  // only when tallying CRITIQUES; claim counts are never filtered by one.
  // An earlier version of this harness seeded no critiques, so the lens
  // had nothing to remove, every total matched, and the "the lens's
  // effect is visible" check passed while proving nothing whatsoever.
  // Agent 2 is the unattested author here, so its critique is precisely
  // what a lens rooted at agent 1 must set aside.
  const claimsForCritique = await agent1.call('get_claims_by_domain', DOMAIN);
  if (claimsForCritique.length === 0) {
    log('\n  SETUP FAILED: get_claims_by_domain returned 0 after publishing two claims.');
    log('  A real failure of the zome, not of this harness. If the code looks correct,');
    log('  the conductor is running a STALE BUILD — scripts/pack-webhapp.sh, then clean.');
    process.exit(1);
  }
  const targetHash = claimsForCritique[0].signed_action.hashed.content.data.entry_hash;
  const critiqueBy = (agent, content) => ({
    target: targetHash, target_type: 'Claim', critique_mode: 'Methodological',
    content, author: agent, timestamp: nowMicros(), replication_attempted: false,
    evidence_hashes: [], species: null,
  });
  await agent1.call('create_critique', critiqueBy(agent1.me, 'Sample size is not reported.'));
  await agent2.call('create_critique', critiqueBy(agent2.me, 'The control group is unstated.'));

  // The baseline the UI must not silently depart from.
  const neutral = await agent1.call('get_discourse_health', {
    membrane: membraneEntryHash, attestation_policy: null, conductance_policy: null,
  });
  const rootedPolicy = {
    require_attestation_from: [agent1.me], min_attestations: 1, max_attestation_depth: 1,
  };
  const lensedExpected = await agent1.call('get_discourse_health', {
    membrane: membraneEntryHash, attestation_policy: rootedPolicy, conductance_policy: null,
  });
  log(`Unfiltered: ${neutral.total_claims} claims, ${neutral.total_critiques} critiques`);
  log(`Through a lens rooted at agent 1: ${lensedExpected.total_critiques} critiques`);
  if (neutral.total_critiques <= lensedExpected.total_critiques) {
    log('\n  SETUP FAILED: the lens removes nothing, so every assertion about its');
    log('  effect below would pass vacuously. Expected agent 2\'s critique to be set');
    log('  aside by a lens rooted at agent 1. This harness refuses to run green on');
    log('  a setup that cannot distinguish a working lens from an absent one.');
    process.exit(1);
  }
  log('');

  log('Starting vite preview (production bundle) ...');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: new URL('../../mobile-ui/', import.meta.url).pathname,
    stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 3000));

  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  try {
    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });

    await page.getByRole('button', { name: 'Domains', exact: true }).click();
    await page.getByRole('button', { name: 'Load domains', exact: true }).click();
    await page.waitForSelector('[data-testid="membrane-card"]', { timeout: 20000 });
    await page.waitForTimeout(3000);

    // Discourse detail is behind a progressive-disclosure toggle (see
    // README.md §4.5), so the totals this harness reads about only exist
    // once it is expanded. Opened here rather than asserted into
    // existence, the same way membranes-ui.mjs does it.
    const healthToggle = page.locator('[data-testid="health-toggle"]').first();
    if (await healthToggle.count() > 0 && /Show/i.test(await healthToggle.innerText())) {
      await healthToggle.click();
      await page.locator('[data-testid="health-totals"]').first().waitFor({ timeout: 20000 });
    }

    log('=== 1. No lens is applied until the user aims one ===');
    // The most important assertion in this file. A filter nobody chose is
    // the exact thing §4.4 forbids, and it would leave every other check
    // here passing.
    check('no trust-lens banner is shown on a freshly loaded domain',
      await page.locator('[data-testid="lens-banner"]').count() === 0);
    check('no per-member attestation verdicts are rendered before a lens exists',
      await page.locator('[data-testid="attested-badge"]').count() === 0);
    const shownTotals = await page.locator('[data-testid="health-totals"]').first().innerText();
    check(`the unfiltered figures are what render by default (got "${shownTotals.replace(/\n/g, ' ')}")`,
      shownTotals.includes(String(neutral.total_claims)));

    log('\n=== 2. A lens with no roots is refused, not silently a no-op ===');
    // require_attestation_from: null makes is_agent_attested return true
    // for everyone. Accepting an empty root set would render a banner
    // claiming a filter that filters nothing — a verdict while being none.
    await page.locator('[data-testid="lens-toggle"]').first().click();
    await page.waitForSelector('[data-testid="lens-builder"]', { timeout: 20000 });
    await page.locator('[data-testid="lens-apply"]').first().click();
    const lensErr = page.locator('[data-testid="lens-error"]').first();
    check('applying a lens with no roots chosen is refused',
      await lensErr.isVisible() && /at least one root/i.test(await lensErr.innerText()));
    check('and no banner appeared for the refused lens',
      await page.locator('[data-testid="lens-banner"]').count() === 0);

    log('\n=== 3. An aimed lens is visible, and its effect is legible ===');
    await page.locator(`[data-testid="lens-root-checkbox"][data-agent="${b64(agent1.me)}"]`).check();
    await page.locator('[data-testid="lens-apply"]').first().click();
    await page.waitForSelector('[data-testid="lens-banner"]', { timeout: 20000 });
    await page.waitForTimeout(2500);

    const banner = await page.locator('[data-testid="lens-banner"]').first().innerText();
    check('the banner says a lens is applied', /trust lens is applied/i.test(banner));
    check('and names the threshold and depth it was aimed with',
      /at least 1 attester/i.test(banner) && /1 hop/i.test(banner));
    check('and says plainly that this is the user\'s question, not a protocol verdict',
      /not the protocol/i.test(banner));

    // Disclosure is not enough on its own: the unfiltered figures must
    // stay on screen so the lens's effect can be READ OFF, not merely
    // known about. Asserted against the two numbers the conductor
    // actually returns, so this cannot pass by printing a number that
    // happens to be present — the failure mode an earlier version of
    // this check had.
    const delta = await page.locator('[data-testid="lens-delta"]').first().innerText();
    check(`the banner shows the real before-and-after critique counts (got "${delta}")`,
      delta.includes(`${neutral.total_critiques} \u2192 ${lensedExpected.total_critiques}`));
    check('and says how many the lens set aside, not just the new total',
      /sets aside \d+/i.test(delta));
    // The lens filters critiques and never claims. Saying "Claims N → N"
    // implies it considered them and spared them, which is a different
    // and false statement about what is being filtered.
    check('and names the claim total as explicitly unfiltered rather than implying it was filtered',
      /claims .*are not filtered/i.test(delta));
    const stillShown = await page.locator('[data-testid="health-totals"]').first().innerText();
    check('and the unfiltered health block is still rendered, not replaced',
      stillShown.includes(String(neutral.total_critiques)));

    log('\n=== 4. The lens gives a real answer per member ===');
    const badges = page.locator('[data-testid="attested-badge"]');
    check('per-member verdicts appear once a lens is active', await badges.count() >= 2);
    const a2Row = page.locator(`.member-row[data-agent="${b64(agent2.me)}"]`);
    const a2Before = await a2Row.locator('[data-testid="attested-badge"]').innerText();
    check(`agent 2 does NOT pass a lens rooted at agent 1 before any vouch (got "${a2Before}")`,
      /does not pass/i.test(a2Before));
    check('and "does not pass" is distinguishable from "not checked"',
      !/not checked/i.test(a2Before));

    log('\n=== 5. Vouching is offered, costed, and refused honestly ===');
    // WHAT THIS DELIBERATELY DOES NOT TEST: a successful vouch. The
    // integrity zome requires 30 days of membership tenure before an
    // AttestationGrant validates, so on any conductor a test can create
    // — which is by definition minutes old — a grant CANNOT succeed.
    // Verified directly rather than assumed: calling grant_attestation
    // over a plain zome connection here returns "AttestationGrant
    // requires proof of sufficiently tenured membership in this
    // membrane".
    //
    // So the assertions are about what a UI owes a user in that
    // situation, which is the part that could actually regress: offer
    // the affordance (it is real, just expensive), state the cost before
    // it is spent, and pass the conductor's refusal through legibly
    // instead of swallowing it or faking success.
    check('the vouch affordance is offered for another member', 
      await a2Row.locator('[data-testid="vouch"]').count() === 1);
    check('and NOT offered against yourself',
      await page.locator(`.member-row[data-agent="${b64(agent1.me)}"] [data-testid="vouch"]`).count() === 0);
    const costNote = await page.locator('[data-testid="vouch-cost-note"]').first().innerText();
    check(`the cost of vouching is stated before it is spent (got "${costNote.slice(0, 60)}…")`,
      /established membership/i.test(costNote) && /per week/i.test(costNote));

    const attestedBefore = await agent1.call('is_agent_attested', {
      candidate: agent2.me, membrane: membraneEntryHash, policy: rootedPolicy,
    });
    check('the conductor agrees agent 2 is unattested before any vouch', attestedBefore === false);

    await a2Row.locator('[data-testid="vouch"]').click();
    await page.waitForTimeout(4000);

    const vouchErr = a2Row.locator('[data-testid="vouch-error"]');
    check('the tenure refusal reaches the user rather than failing silently',
      await vouchErr.isVisible());
    const vouchErrText = await vouchErr.innerText();
    check(`and the message names the reason, not a link-tag internal (got "${vouchErrText.slice(0, 70)}…")`,
      /tenure|membership/i.test(vouchErrText));

    // The refusal must be real, not cosmetic: an independent client must
    // still see agent 2 as unattested. A UI that showed the error while
    // the grant had landed would be the worse bug.
    const attestedAfter = await agent2.call('is_agent_attested', {
      candidate: agent2.me, membrane: membraneEntryHash, policy: rootedPolicy,
    });
    check('and the refusal was genuine — an INDEPENDENT client still sees agent 2 unattested',
      attestedAfter === false);
    const a2After = await a2Row.locator('[data-testid="attested-badge"]').innerText();
    check('and the UI does not claim the vouch succeeded',
      /does not pass/i.test(a2After));

    log('\n=== 6. Removing the lens returns to the neutral read ===');
    await page.locator('[data-testid="lens-clear"]').first().click();
    await page.waitForTimeout(1500);
    check('the banner is gone', await page.locator('[data-testid="lens-banner"]').count() === 0);
    check('and so are the per-member verdicts, since nothing was asked',
      await page.locator('[data-testid="attested-badge"]').count() === 0);
    const afterClear = await page.locator('[data-testid="health-totals"]').first().innerText();
    check('and the unfiltered figures are what remain',
      afterClear.includes(String(neutral.total_claims)));

    check('no uncaught page errors', pageErrors.length === 0);
    if (pageErrors.length > 0) log('  ' + pageErrors.join('\n  '));
  } finally {
    await browser.close();
    preview.kill();
  }

  log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
