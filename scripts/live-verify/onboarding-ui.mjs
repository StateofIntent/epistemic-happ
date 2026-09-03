#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/onboarding-ui.mjs — live verification of
// mobile-ui's progressive disclosure, against a real conductor and a
// real browser.
//
// What matters here is not that notes appear. It is WHERE THE STAGING
// STOPS. README.md §4.4 permits chrome to adapt per viewer and forbids
// the artifact under evaluation from doing so, and onboarding.ts draws
// the corollary line: routine detail may collapse, an active signal may
// not. The assertions below are written to fail if that line moves.
//
// Specifically, on a genuine first run — localStorage cleared, so no
// concept has been seen and no milestone reached — a newcomer must still
// see, in full: a claim's retraction banner, its antibody flag, every
// critique with its mode and content, and the protocol's own discourse
// drift warning. Only explanations and routine domain detail are staged.
//
// Prereqs: scripts/sandbox.sh start (clean), and `npx vite build` in
// mobile-ui/.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
// This directory's own rule is that a harness which has only ever been
// green has not been shown to test anything. Recorded here, rather than
// only in a merged PR, so it is readable at the point someone runs this
// file.
//
//   Regression injected: removing the one-note-at-a-time gate in renderConceptNote.
//   Result: four FAILs — every unseen note renders at once, the wall of explanation progressive disclosure exists to prevent.
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
const PREVIEW_PORT = 4175;
const DOMAIN = `Onboarding${Date.now()}`;

const nowMicros = () => Date.now() * 1000;
const nowSecs = () => Math.floor(Date.now() / 1000);
const log = (...a) => console.log(...a);

let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

async function seed() {
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: APP_ID });
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
  const me = cellIds[0][1];
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });

  log(`Seeding ${DOMAIN} ...`);
  const constitution = await call('publish_constitution', {
    agent: me,
    promises: [{ action: 'distinguish observation from inference', domain: DOMAIN, modality: null }],
    conditions: [], published_at: nowSecs(), expires_at: null,
  });
  await call('create_membrane', {
    domain: DOMAIN,
    description: 'Seeded membrane for onboarding verification.',
    required_promises: ['distinguish observation from inference'],
    validation_rules_hash: null, creator: me, created_at: nowSecs(), constitution,
  });
  await call('create_claim', {
    content: 'Seeded claim a newcomer must see in full.',
    domain: DOMAIN, author: me, timestamp: nowMicros(),
    evidence_hashes: [], confidence: 'Tentative', semantic_tags: [], source_mew: null,
  });
  const claims = await call('get_claims_by_domain', DOMAIN);
  const target = claims[0].signed_action.hashed.content.entry_hash;

  // 4 abstract : 1 embodied drives the ratio past 3.0 so the protocol's
  // own warning fires — the active signal staging must never hide.
  for (const mode of ['Logical', 'Logical', 'Logical', 'Logical', 'Experiential']) {
    await call('create_critique', {
      target, target_type: 'Claim', critique_mode: mode,
      content: `Seeded ${mode} critique.`, author: me, timestamp: nowMicros(),
      replication_attempted: false, evidence_hashes: [], species: null,
    });
  }
  // Epistemic state a newcomer must see despite being a newcomer.
  await call('publish_antibody_pattern', {
    target, target_type: 'Claim', kind: 'SpamFlood',
    rationale: 'Seeded flag a newcomer must still see.', author: me, timestamp: nowSecs(),
  });
  await call('create_retraction', {
    target_claim: target, reason: 'Seeded retraction a newcomer must still see.',
    replacement_claim: null, author: me, timestamp: nowSecs(),
  });

  log('  seeded.\n');
  return { app, admin };
}

async function main() {
  const { app, admin } = await seed();
  try { await app.client?.close?.(); } catch { /* best effort */ }
  try { await admin.client?.close?.(); } catch { /* best effort */ }

  log('Starting vite preview (production bundle) ...');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: new URL('../../mobile-ui/', import.meta.url).pathname, stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 4000));

  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
    // A genuine first run: no concept seen, no milestone reached.
    await page.evaluate(() => localStorage.removeItem('epistemic-mobile-ui:onboarding'));
    await page.reload({ waitUntil: 'domcontentloaded' });

    // The app does not auto-reconnect after a reload — `connection` is
    // module state and only the conductor config is persisted — so each
    // reload needs a fresh Connect. Factored out because this script
    // reloads three times to prove that dismissals and disclosure
    // actually persist rather than merely surviving one render.
    const connect = async () => {
      await page.getByRole('button', { name: /connect/i }).first().click();
      await page.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });
    };

    log('=== First run ===');
    await connect();
    // The next-step hint lives in the tab bar, which exists only once
    // connected — before that the only next step IS connecting, and the
    // connect screen already says so.
    check('a single next step is suggested once connected',
      await page.locator('[data-testid="next-browse"]').count() === 1);

    log('\n=== Concept notes: one at a time, where the concept appears ===');
    check('the local-conductor note appears on connecting',
      await page.locator('[data-testid="concept-local-conductor"]').count() === 1);
    // Exactly one, never a wall: three concepts introduce themselves on
    // this screen and delivering them together would recreate the
    // problem progressive disclosure exists to solve.
    check('only ONE concept note is shown at a time',
      await page.locator('.concept-note').count() === 1);
    check('the friction-budget note is therefore queued, not shown yet',
      await page.locator('[data-testid="concept-friction-budget"]').count() === 0);

    // Dismissal must stick, or the note is nagging rather than teaching.
    await page.locator('[data-testid="concept-local-conductor"]').getByRole('button', { name: 'Got it' }).click();
    check('a dismissed note stays dismissed',
      await page.locator('[data-testid="concept-local-conductor"]').count() === 0);
    check('dismissing one brings the next',
      await page.locator('[data-testid="concept-friction-budget"]').count() === 1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await connect();
    check('and stays dismissed across a reload',
      await page.locator('[data-testid="concept-local-conductor"]').count() === 0);

    log('\n=== §4.4 boundary: a newcomer sees the whole artifact ===');
    await page.getByPlaceholder(/domain/i).first().fill(DOMAIN);
    await page.getByRole('button', { name: 'Load claims', exact: true }).click();
    await page.waitForSelector('.claim-card', { timeout: 20000 });

    await page.waitForSelector('[data-testid="retraction-banner"]', { timeout: 20000 });
    check('retraction banner is NOT staged away from a newcomer',
      await page.locator('[data-testid="retraction-banner"]').count() === 1);
    check('antibody flag is NOT staged away from a newcomer',
      await page.locator('[data-testid="antibody-flag"]').count() === 1);
    const claimText = await page.locator('.claim-content').first().innerText();
    check('the claim itself renders in full', /Seeded claim a newcomer must see/.test(claimText));

    await page.getByRole('button', { name: /view \/ add critiques/i }).first().click();
    await page.waitForSelector('.critique-item', { timeout: 20000 });
    check('every critique renders for a newcomer',
      await page.locator('.critique-item').count() === 5);
    // Queued behind whatever is still undismissed on this screen, so
    // the assertion is that at most one note shows anywhere — the
    // invariant that matters — rather than which one won the race.
    check('still only one concept note on screen',
      await page.locator('.concept-note').count() <= 1);

    log('\n=== Routine detail collapses; the active signal does not ===');
    await page.getByRole('button', { name: 'Domains', exact: true }).click();
    await page.getByRole('button', { name: 'Load domains', exact: true }).click();
    await page.waitForSelector('[data-testid="membrane-card"]', { timeout: 20000 });
    await page.waitForSelector('[data-testid="health-toggle"]', { timeout: 20000 });

    check('routine detail (totals) is collapsed on first run',
      await page.locator('[data-testid="health-totals"]').count() === 0);
    check('routine detail (mode distribution) is collapsed on first run',
      await page.locator('[data-testid="mode-distribution"]').count() === 0);
    const warn = await page.locator('[data-testid="health-warning"]').innerText();
    log(`  warning while collapsed: ${warn}`);
    check('THE DRIFT WARNING IS VISIBLE ANYWAY — an active signal is never staged',
      /detached from practice/i.test(warn));

    await page.locator('[data-testid="health-toggle"]').click();
    await page.waitForSelector('[data-testid="health-totals"]', { timeout: 10000 });
    check('expanding reveals the routine detail', true);
    check('still only one concept note on screen after expanding',
      await page.locator('.concept-note').count() <= 1);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await connect();
    await page.getByRole('button', { name: 'Domains', exact: true }).click();
    await page.getByRole('button', { name: 'Load domains', exact: true }).click();
    await page.waitForSelector('[data-testid="health-totals"]', { timeout: 20000 });
    check('disclosure runs one way — detail stays open after a reload', true);

    check('no uncaught page errors', errors.length === 0);
    if (errors.length) log(`  errors: ${errors.join(' | ')}`);

    if (process.env.ONBOARDING_SCREENSHOT) {
      await page.screenshot({ path: process.env.ONBOARDING_SCREENSHOT, fullPage: true });
      log(`  screenshot written to ${process.env.ONBOARDING_SCREENSHOT}`);
    }
  } finally {
    await browser.close();
    preview.kill();
  }

  log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
