#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/expertise-ui.mjs — live verification of expertise
// assertions: assert_expertise and generate_worldline_trace, surfaced.
//
// WHAT THIS IS REALLY GUARDING. assert_expertise's justification, written
// in its own doc comment, is that an expertise assertion IS a Claim —
// "that anyone can critique through the existing typed CritiqueMode
// machinery ... not a separate, unaccountable field". Two things have to
// hold for that to be true rather than merely asserted, and both are
// easy to lose:
//
//   1. ANYONE CAN FIND IT. assert_expertise built its Claim by hand and
//      wrote only an AgentToClaim link, never the DomainToClaim index
//      PR #51 added to create_claim — so browsing "expertise/<domain>"
//      returned NOTHING and the claim was reachable only by an agent who
//      already knew whose expertise to look for. Verified broken against
//      a live conductor before the fix, which is why agent 2 exists in
//      this harness: agent 1 finding its own claim proves nothing.
//   2. IT MUST NOT READ AS A CREDENTIAL. The coordinator's own comment
//      says the trace-ownership check is "a courtesy, not an enforced
//      rule" and that these claims carry no standing. A UI badge that
//      looked like verification would manufacture precisely the
//      credibility signal Invariant #1 declines to compute, on a field
//      nothing validates.
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
//   Regression injected: reverting assert_expertise's DomainToClaim index; separately, replacing the marker with '✓ Verified expertise'.
//   Result: three FAILs for the first, including the CONTROL, and five for the second.
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
const PREVIEW_PORT = 4184;
const DOMAIN = `Expertise${Date.now()}`;

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
      if (CellType.Provisioned in cell) cellIds.push(cell[CellType.Provisioned].cell_id);
      else if (CellType.Cloned in cell) cellIds.push(cell[CellType.Cloned].cell_id);
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
    await admin.installApp({
      path: HAPP_PATH, agent_key: agent2Pub,
      installed_app_id: AGENT2_APP_ID, membrane_proofs: {},
    });
    await admin.enableApp({ installed_app_id: AGENT2_APP_ID });
  }
  const agent2 = await connectApp(admin, AGENT2_APP_ID);
  log(`agent2 (a stranger, who must be able to find it) = ${b64(agent2.me).slice(0, 12)}…\n`);

  // A claim, so the worldline trace has real history to be derived from.
  await agent1.call('create_claim', {
    content: 'Loaded carries reduce recurrence.', domain: DOMAIN, author: agent1.me,
    timestamp: nowMicros(), evidence_hashes: [], confidence: 'Moderate',
    semantic_tags: [], source_mew: null,
  });

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

    log('=== 1. Asserting expertise through the UI ===');
    await page.getByRole('button', { name: 'New Claim', exact: true }).click();
    await page.locator('[data-testid="expertise-toggle"]').click();
    await page.waitForSelector('[data-testid="expertise-form"]', { timeout: 20000 });

    const hint = await page.locator('[data-testid="expertise-form"] .hint').first().innerText();
    check('the form says plainly that this is not a credential',
      /not a credential/i.test(hint) && /critique/i.test(hint));

    await page.locator('[data-testid="expertise-domain"]').fill(DOMAIN);
    await page.locator('[data-testid="expertise-submit"]').click();
    await page.waitForSelector('[data-testid="expertise-done"]:not([hidden])', { timeout: 30000 });
    const doneText = await page.locator('[data-testid="expertise-done"]').innerText();
    check(`the UI names the domain it actually published into (got "${doneText.slice(0, 50)}…")`,
      doneText.includes(`expertise/${DOMAIN}`));

    log('\n=== 2. A STRANGER can find it — the whole justification ===');
    // Agent 1 finding its own claim proves nothing: get_claims_by_agent
    // and a source-chain query both succeed for the author regardless of
    // whether the DHT index was ever written. Agent 2 is the real test,
    // and it is the one that failed before assert_expertise indexed the
    // claim under its domain.
    const strangerSees = await agent2.call('get_claims_by_domain', `expertise/${DOMAIN}`);
    check(`agent 2 finds the expertise assertion by browsing its domain (got ${strangerSees.length})`,
      strangerSees.length === 1);
    const authorSees = await agent1.call('get_claims_by_domain', `expertise/${DOMAIN}`);
    check('CONTROL: and so does its author, so the index is not merely author-blind',
      authorSees.length === 1);

    // Critiquable is the claim being made about it, so it must actually
    // be critiquable — by the stranger, not by its author.
    const targetHash = strangerSees.length > 0
      ? strangerSees[0].signed_action.hashed.content.entry_hash : null;
    let critiqued = false;
    if (targetHash) {
      try {
        await agent2.call('create_critique', {
          target: targetHash, target_type: 'Claim', critique_mode: 'Evidential',
          content: 'The cited trace shows activity, not competence.',
          author: agent2.me, timestamp: nowMicros(), replication_attempted: false,
          evidence_hashes: [], species: null,
        });
        critiqued = true;
      } catch (e) {
        log(`    (create_critique failed: ${String(e?.message ?? e).slice(0, 140)})`);
      }
    }
    check('and a stranger can critique it like any other claim', critiqued);

    log('\n=== 3. It must not read as a credential ===');
    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await page.getByPlaceholder(/domain/i).first().fill(`expertise/${DOMAIN}`);
    await page.getByRole('button', { name: 'Load claims', exact: true }).click();
    await page.waitForSelector('.claim-card', { timeout: 20000 });

    const badge = page.locator('[data-testid="expertise-badge"]').first();
    check('the assertion is marked as an expertise assertion when browsed',
      await badge.count() === 1);
    const badgeText = await badge.innerText();
    check('the marker says it is SELF-asserted', /self-asserted/i.test(badgeText));
    check('and says explicitly that it is not verified', /not verified/i.test(badgeText));
    check('and that it carries no standing', /no standing/i.test(badgeText));
    check('and points at critique as the recourse', /critique/i.test(badgeText));
    // A credential-shaped marker is the failure mode. Nothing that reads
    // as endorsement belongs on a field nothing validates.
    check('and uses no endorsement or verification iconography',
      !/✓|✔|certified|credential/i.test(badgeText));

    log('\n=== 4. Ordinary claims are not marked ===');
    // Settle before typing the next domain, and NOT as test hygiene.
    // render() rebuilds app.innerHTML wholesale and re-seeds this input
    // from currentDomain, so a value typed while the previous load's
    // badge/conductance reads are still landing is discarded with the
    // DOM that held it — the click then re-loads the PREVIOUS domain.
    // Observed here exactly that way: the expertise claim stayed on
    // screen and this check reported an expertise marker on a "plain"
    // claim that was really the old card. Same defect, same wait, as
    // write-symmetry.mjs documents at length; README.md §9 tracks the
    // real fix against the local-first mirror item.
    await page.waitForTimeout(3000);
    await page.getByPlaceholder(/domain/i).first().fill(DOMAIN);
    await page.getByRole('button', { name: 'Load claims', exact: true }).click();
    // Wait for the NEW list to be on screen rather than for a duration.
    // render() rebuilds app.innerHTML when the read returns, so a fixed
    // timeout races it and can assert against the previous domain's
    // cards — which is what a first version of this check did, reporting
    // a marker on a plain claim that was really the expertise claim
    // still rendered from the load before.
    await page.locator('.claim-card', { hasText: 'Loaded carries reduce recurrence.' })
      .first().waitFor({ timeout: 20000 });
    check('a plain claim carries no expertise marker',
      await page.locator('[data-testid="expertise-badge"]').count() === 0);

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
