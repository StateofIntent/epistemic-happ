#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/founding-ui.mjs — live verification of the domain
// founding flow, and of the validation that now backs it.
//
// Two things are under test and the second matters more.
//
//   1. THE FLOW. Founding a domain through the UI publishes a
//      Constitution and then a Membrane referencing it, and the founded
//      domain appears with its required promises.
//   2. THE ACCOUNTABILITY IS REAL. Until this change, validate_membrane
//      checked only creator-matches-author and a non-empty domain. The
//      coordinator's create_membrane checked the constitution and the
//      required promises, and its comment claimed to be "mirroring
//      validate_membrane's DHT-enforced rule (the real enforcement
//      layer, unbypassable by a custom client)" — which was false. The
//      whole "accountable rather than costly" mechanism was a
//      coordinator-side courtesy while being documented as an invariant.
//
// So the bypass cases below are the point. They call create_entry paths
// that a custom client could reach, and assert the INTEGRITY zome
// refuses them — not the form, and not the coordinator's pre-check.
//
// Prereqs: scripts/sandbox.sh start (clean), `npx vite build` in
// mobile-ui/, and a rebuilt/repacked hApp.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
// This directory's own rule is that a harness which has only ever been
// green has not been shown to test anything. Recorded here, rather than
// only in a merged PR, so it is readable at the point someone runs this
// file.
//
//   Regression injected: appending the permanence note AFTER the submit button.
//   Result: one FAIL — but only after this file's check was strengthened. It previously asserted count() === 1, which is presence, not order: the injected regression left it GREEN. Now compared with compareDocumentPosition.
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
const PREVIEW_PORT = 4177;
const DOMAIN = `Founded${Date.now()}`;

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

async function zomeConnection() {
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: APP_ID });
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
  const me = cellIds[0][1];
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { app, admin, me, call };
}

async function main() {
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
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });

    log('=== Founding a domain through the UI ===');
    await page.getByRole('button', { name: 'Domains', exact: true }).click();
    await page.getByRole('button', { name: 'Found a domain', exact: true }).click();
    await page.waitForSelector('[data-testid="founding-form"]', { timeout: 20000 });

    // The two commitments are kept visibly apart — the mistake this form
    // exists to prevent is conflating what you promise with what you
    // require of others.
    const legends = await page.locator('.founding-form legend').allInnerTexts();
    log(`  fieldsets: ${legends.join(' | ')}`);
    check('the founder\'s promise and the domain\'s demands are separate sections',
      legends.length === 2
      && /what you promise/i.test(legends[0])
      && /asks of participants/i.test(legends[1]));
    // ORDER, not merely presence. This check used to assert count() === 1,
    // which is what its own label says it is NOT checking: a note moved
    // below the submit button still counts 1, and the warning then
    // arrives after the irreversible act rather than before it. Caught by
    // deliberately deferring the note's append and watching this stay
    // green — the negative-evidence pass this suite's own convention asks
    // for. compareDocumentPosition is used rather than reading offsets,
    // so it is unaffected by layout, wrapping or viewport size.
    const permanenceBeforeButton = await page.evaluate(() => {
      const note = document.querySelector('[data-testid="permanence-note"]');
      const btn = document.querySelector('[data-testid="founding-submit"]');
      if (!note || !btn) return false;
      // DOCUMENT_POSITION_FOLLOWING (4) means btn comes after note.
      return (note.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    check('permanence is stated before the button, not confirmed after it',
      permanenceBeforeButton);

    // Incomplete founding is refused with a usable message.
    await page.locator('[data-testid="founding-domain"]').fill(DOMAIN);
    await page.locator('[data-testid="founding-submit"]').click();
    const err = await page.locator('[data-testid="founding-error"]').innerText();
    log(`  incomplete: ${err}`);
    check('founding without promises is refused', /at least one promise/i.test(err));

    await page.locator('[data-testid="founder-promise"]').fill('distinguish observation from inference');
    await page.locator('[data-testid="founding-description"]').fill('Seeded by the founding-flow verification.');
    await page.locator('[data-testid="founding-required"]').fill('distinguish observation from inference\ndisclose funding');
    await page.locator('[data-testid="founding-submit"]').click();

    await page.waitForSelector('[data-testid="membrane-card"]', { timeout: 25000 });
    const card = page.locator('[data-testid="membrane-card"]').filter({ hasText: DOMAIN });
    check('the founded domain appears in the list', await card.count() === 1);
    const promises = await card.locator('[data-testid="required-promises"]').innerText();
    log(`  required promises: ${promises.replace(/\n/g, ' | ')}`);
    check('both required promises were recorded',
      /distinguish observation/.test(promises) && /disclose funding/.test(promises));

    // A domain founded moments ago has no discourse, so nothing can have
    // drifted from practice. This warned on every new domain until
    // discourse_ratio stopped collapsing "no critiques at all" and
    // "abstract discourse with nothing embodied" into one sentinel.
    check('a brand-new domain does NOT warn about drifting from practice',
      await card.locator('[data-testid="health-warning"]').count() === 0);

    check('no uncaught page errors', errors.length === 0);
    if (errors.length) log(`  errors: ${errors.join(' | ')}`);

    if (process.env.FOUNDING_SCREENSHOT) {
      await page.screenshot({ path: process.env.FOUNDING_SCREENSHOT, fullPage: true });
      log(`  screenshot written to ${process.env.FOUNDING_SCREENSHOT}`);
    }
  } finally {
    await browser.close();
    preview.kill();
  }

  // --- The part that matters: is the accountability actually enforced?
  log('\n=== Accountability is DHT-enforced, not the form\'s courtesy ===');
  const { app, admin, me, call } = await zomeConnection();
  try {
    const constitution = await call('publish_constitution', {
      agent: me,
      promises: [{ action: 'state my sources', domain: 'BypassProbe', modality: null }],
      conditions: [], published_at: Math.floor(Date.now() / 1000), expires_at: null,
    });

    // 1. No required promises. The coordinator refuses this too, so the
    // interesting question is whether the INTEGRITY zome does — which is
    // what a client bypassing create_membrane would meet.
    let refused = null;
    try {
      await call('attempt_unaccountable_membrane', {
        domain: 'BypassProbeA', description: 'no demands stated',
        required_promises: [], validation_rules_hash: null,
        creator: me, created_at: Math.floor(Date.now() / 1000), constitution,
      });
    } catch (e) { refused = String(e?.data?.data ?? e?.message ?? e); }
    check('a domain declaring nothing of its participants is refused', refused !== null);
    check('  ...by DHT VALIDATION, not the coordinator pre-check',
      /InvalidCommit|Validation failed/i.test(refused ?? ''));
    log(`  ${refused?.slice(0, 150)}`);

    // 2. A constitution hash that resolves to something that is not a
    // Constitution. This is the case that had NO DHT-side check at all
    // before this change.
    const claimHash = await call('create_claim', {
      content: 'Not a constitution.', domain: 'BypassProbe', author: me,
      timestamp: Date.now() * 1000, evidence_hashes: [],
      confidence: 'Tentative', semantic_tags: [], source_mew: null,
    });
    let refusedB = null;
    try {
      await call('attempt_unaccountable_membrane', {
        domain: 'BypassProbeB', description: 'constitution points at a claim',
        required_promises: ['something'], validation_rules_hash: null,
        creator: me, created_at: Math.floor(Date.now() / 1000), constitution: claimHash,
      });
    } catch (e) { refusedB = String(e?.data?.data ?? e?.message ?? e); }
    check('a constitution hash pointing at a non-Constitution is refused', refusedB !== null);
    check('  ...by DHT VALIDATION, not the coordinator pre-check',
      /InvalidCommit|Validation failed/i.test(refusedB ?? ''));
    log(`  ${refusedB?.slice(0, 150)}`);
  } finally {
    try { await app.client?.close?.(); } catch { /* best effort */ }
    try { await admin.client?.close?.(); } catch { /* best effort */ }
  }

  log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
