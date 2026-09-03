#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/membranes-ui.mjs — live verification of mobile-ui's
// Domains (Membrane) tab against a real conductor and a real browser.
//
// Membranes are what unlocked get_discourse_health and
// get_cross_domain_critiques for the UI: both are anchored to a Membrane
// entry rather than a domain string, so neither could be surfaced while
// the UI knew only about free-text domains.
//
// SEED, over a direct zome connection, because founding a domain is not
// yet a UI flow (it needs a published Constitution first — see
// domains/bootstrap.mjs): a Constitution, a Membrane, and enough claims
// and critiques in its domain that get_discourse_health has something
// real to aggregate. The abstract:embodied ratio is driven deliberately
// past 3.0 so the protocol's own warning fires and the UI has to render
// it.
//
// VERIFY, in a real Playwright-driven Chromium against the production
// bundle, for the reason README.md's Phase 4 entry records: this UI's one
// real bug was invisible to tsc and every build-time check.
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
//   Regression injected: summing the five CritiqueModes into a single total.
//   Result: one FAIL — 'critique modes shown as named counts, not summed away', the Invariant #4 non-fungibility this screen is meant to preserve.
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
  console.error(
    'Could not resolve playwright from mobile-ui/. Install it there first:\n' +
    '  cd mobile-ui && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install'
  );
  process.exit(1);
}

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_ID = 'epistemic-resonance-happ';
const PREVIEW_PORT = 4174;
const DOMAIN = `MembraneUI${Date.now()}`;
const OTHER_DOMAIN = `${DOMAIN}Elsewhere`;

function nowMicros() { return Date.now() * 1000; }
function nowSecs() { return Math.floor(Date.now() / 1000); }
function log(...a) { console.log(...a); }

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

  log(`Seeding domain ${DOMAIN} ...`);
  const constitution = await call('publish_constitution', {
    agent: me,
    promises: [{
      action: 'distinguish observation from inference',
      domain: DOMAIN,
      modality: null,
    }],
    conditions: [],
    published_at: nowSecs(),
    expires_at: null,
  });

  await call('create_membrane', {
    domain: DOMAIN,
    description: 'Seeded membrane for Domains-tab verification.',
    required_promises: ['distinguish observation from inference', 'disclose funding'],
    validation_rules_hash: null,
    creator: me,
    created_at: nowSecs(),
    constitution,
  });

  const mkClaim = (content, domain, confidence) => call('create_claim', {
    content, domain, author: me, timestamp: nowMicros(),
    evidence_hashes: [], confidence, semantic_tags: [], source_mew: null,
  });

  // One claim here to critique, plus one in another domain so its author
  // reads as cross-domain when they critique into this membrane.
  await mkClaim('Seeded claim inside the membrane.', DOMAIN, 'Tentative');
  await mkClaim('Seeded claim in a different domain.', OTHER_DOMAIN, 'Tentative');

  const claims = await call('get_claims_by_domain', DOMAIN);
  const target = claims[0].signed_action.hashed.content.entry_hash;

  // Drive abstract:embodied past 3.0. Experiential is the embodied mode;
  // everything else counts as abstract, so 4 Logical to 1 Experiential
  // trips the protocol's own warning at ratio > 3.
  const modes = ['Logical', 'Logical', 'Logical', 'Logical', 'Experiential'];
  for (const [i, mode] of modes.entries()) {
    await call('create_critique', {
      target, target_type: 'Claim', critique_mode: mode,
      content: `Seeded ${mode} critique #${i + 1}.`,
      author: me, timestamp: nowMicros(),
      replication_attempted: false, evidence_hashes: [], species: null,
    });
  }

  log('  seeded constitution + membrane + claims + 5 critiques.\n');
  return { app, admin };
}

async function main() {
  const { app, admin } = await seed();
  try { await app.client?.close?.(); } catch { /* best effort */ }
  try { await admin.client?.close?.(); } catch { /* best effort */ }

  log('Starting vite preview (production bundle) ...');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: new URL('../../mobile-ui/', import.meta.url).pathname,
    stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 4000));

  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });

    log('=== Domains tab ===');
    await page.getByRole('button', { name: 'Domains', exact: true }).click();
    await page.getByRole('button', { name: 'Load domains', exact: true }).click();
    await page.waitForSelector('[data-testid="membrane-card"]', { timeout: 20000 });
    check('the seeded membrane is listed', true);

    const card = page.locator('[data-testid="membrane-card"]').filter({ hasText: DOMAIN });
    check('the membrane shows its own domain name', await card.count() > 0);

    const promises = await card.locator('[data-testid="required-promises"]').innerText();
    log(`  required promises: ${promises.replace(/\n/g, ' | ')}`);
    check('required promises render — the accountable-not-costly mechanism',
      /distinguish observation from inference/.test(promises) && /disclose funding/.test(promises));

    log('\n=== Discourse health (unlocked by membranes) ===');
    await card.locator('[data-testid="discourse-health"]').waitFor({ timeout: 20000 });
    // Routine detail is collapsed on a first run by progressive
    // disclosure (onboarding.ts), so it has to be opened before it can
    // be asserted on. This script predates that change and silently
    // began failing when it landed, because only the new script was
    // re-run at the time — the whole live-verify suite is the unit that
    // needs running, not the one file a change is about.
    const toggle = card.locator('[data-testid="health-toggle"]');
    if (await toggle.count() > 0 && /Show/i.test(await toggle.innerText())) {
      await toggle.click();
      await card.locator('[data-testid="health-totals"]').waitFor({ timeout: 20000 });
    }
    const health = await card.locator('[data-testid="discourse-health"]').innerText();
    log(`  ${health.replace(/\n/g, ' | ')}`);
    check('totals render', /1 claim/.test(health) && /5 critiques/.test(health));
    check('abstract:embodied ratio renders', /abstract:embodied\s+4\.00/.test(health));

    const dist = await card.locator('[data-testid="mode-distribution"]').innerText();
    log(`  modes: ${dist.replace(/\n/g, ' ')}`);
    check('critique modes shown as named counts, not summed away',
      /Logical 4/.test(dist) && /Experiential 1/.test(dist));

    const warn = await card.locator('[data-testid="health-warning"]').innerText();
    log(`  warning: ${warn}`);
    check("the protocol's own drift warning renders", /detached from practice/i.test(warn));

    log('\n=== Cross-domain critiques (the other membrane-anchored read) ===');
    // The seed author holds a claim in OTHER_DOMAIN as well as this one,
    // so every critique they wrote into this membrane counts as coming
    // from an agent whose claims also live elsewhere. The home-domain
    // exclusion means this membrane's own domain must NOT be listed.
    await card.locator('[data-testid="cross-domain"]').waitFor({ timeout: 20000 });
    const cross = await card.locator('[data-testid="cross-domain"]').innerText();
    log(`  ${cross}`);
    check('cross-domain critiques render', /critiques? from agents whose claims live elsewhere/.test(cross));
    check('the other domain is named', cross.includes(OTHER_DOMAIN));
    check('the membrane\'s own domain is excluded from "elsewhere"',
      !new RegExp(`\\(${DOMAIN}[,)]`).test(cross));

    log('\n=== Membership ===');
    const before = await card.locator('[data-testid="member-count"]').innerText();
    log(`  ${before}`);
    check('member count renders (0 before joining)', /^0 members$/.test(before.trim()));
    await card.getByRole('button', { name: 'Join domain', exact: true }).click();
    await card.locator('[data-testid="joined-badge"]').waitFor({ timeout: 20000 });
    const after = await card.locator('[data-testid="member-count"]').innerText();
    log(`  ${after} (after joining)`);
    check('joining updates the member count from the conductor', /^1 member$/.test(after.trim()));

    check('no uncaught page errors', errors.length === 0);
    if (errors.length) log(`  errors: ${errors.join(' | ')}`);

    if (process.env.MEMBRANE_SCREENSHOT) {
      await page.screenshot({ path: process.env.MEMBRANE_SCREENSHOT, fullPage: true });
      log(`  screenshot written to ${process.env.MEMBRANE_SCREENSHOT}`);
    }
  } finally {
    await browser.close();
    preview.kill();
  }

  log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
