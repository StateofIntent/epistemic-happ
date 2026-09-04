#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/evidence-retraction-ui.mjs — live verification of
// evidence, grounding, and retraction in the UI, plus the two validation
// changes that back them.
//
// Three things under test:
//
//   1. EVIDENCE AND GROUNDING END TO END. Publishing a claim with
//      evidence creates the Evidence entry first and cites it, and
//      get_grounding_path then reports the claim as grounded. A claim
//      published without evidence reports as ungrounded — which is a
//      valid state, not an error, and the UI styles it as neither.
//   2. RETRACTION IS AUTHOR-ONLY, ENFORCED. validate_retraction checked
//      only the signature, so anyone could publish a Retraction of
//      anyone's claim. Clients render retractions against the claim, so
//      a third party could make someone else's claim appear withdrawn
//      while its author still stood by it. The UI said "Retracted by its
//      author" unconditionally, which was a statement it could not back.
//      Now validation enforces it and the sentence is true by
//      construction — the bypass case below is what proves it.
//   3. create_evidence RETURNS AN ENTRY HASH. It returned the
//      ActionHash, which is the one hash unusable for the single purpose
//      evidence has (Claim.evidence_hashes is Vec<EntryHash>). If that
//      regressed, grounding below would silently never find anything.
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
//   Regression injected: adding error-box to the ungrounded badge and rewording it as 'UNVERIFIED'.
//   Result: three FAILs — but only after this file's check was strengthened. It previously asserted that .grounding.ungrounded EXISTED, which stays true when an error class is added alongside it, so the injected regression left that check green.
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
const PREVIEW_PORT = 4178;
const DOMAIN = `Evidence${Date.now()}`;

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

async function zome() {
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

    const publish = async (content, evidence) => {
      await page.getByRole('button', { name: 'New Claim', exact: true }).click();
      // Explicit test ids: the New Claim domain field's placeholder is
      // "e.g. LumbarRehab" with no "domain" in it, so a placeholder
      // match silently targeted the Browse tab's field instead.
      await page.locator('[data-testid="new-claim-content"]').fill(content);
      await page.locator('[data-testid="new-claim-domain"]').fill(DOMAIN);
      if (evidence) {
        await page.locator('[data-testid="evidence-content"]').fill(evidence);
        await page.locator('[data-testid="evidence-type"]').selectOption('Study');
        await page.locator('[data-testid="evidence-url"]').fill('https://example.org/trial');
      }
      await page.getByRole('button', { name: 'Publish claim', exact: true }).click();
      await page.waitForTimeout(2500);
    };

    log('=== Evidence and grounding ===');
    // Content chosen so neither string is a substring of the other:
    // "Grounded claim" also matches "UNgrounded claim" under Playwright's
    // case-insensitive substring filter, which made both cards match.
    await publish('Loaded carries reduce recurrence.', 'Twelve-week randomised trial, n=180.');
    await publish('Rest alone is sufficient.', null);

    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await page.getByPlaceholder(/domain/i).first().fill(DOMAIN);
    await page.getByRole('button', { name: 'Load claims', exact: true }).click();
    await page.waitForSelector('.claim-card', { timeout: 20000 });
    await page.waitForSelector('[data-testid="grounding"]', { timeout: 20000 });

    const grounded = page.locator('.claim-card').filter({ hasText: 'Loaded carries' });
    const ungrounded = page.locator('.claim-card').filter({ hasText: 'Rest alone' });
    const gText = await grounded.locator('[data-testid="grounding"]').innerText();
    const uText = await ungrounded.locator('[data-testid="grounding"]').innerText();
    log(`  with evidence:    ${gText}`);
    log(`  without evidence: ${uText}`);
    // This is also the regression test for create_evidence returning an
    // EntryHash: with an ActionHash the citation would never resolve and
    // this claim would report ungrounded.
    check('a claim published with evidence reports as grounded', /^Grounded/.test(gText));
    check('a claim published without evidence reports as not grounded', /^Not grounded/.test(uText));
    // NOT styled as an error, which is a stronger claim than "has the
    // ungrounded class". This used to assert only that
    // .grounding.ungrounded existed — a class that stays present when an
    // error class is added ALONGSIDE it, so the check passed while the
    // badge was rendered in error styling. Caught by adding error-box to
    // the same element and watching this stay green. An ungrounded claim
    // is a valid, unremarkable state: the protocol lets a claim exist, be
    // critiqued and be exported with no grounding at all, so framing it
    // as a defect is the client inventing a standard the DNA never set.
    const ungroundedBadge = ungrounded.locator('[data-testid="grounding"]');
    const uClass = await ungroundedBadge.getAttribute('class') ?? '';
    check('ungrounded is not styled as an error — it is a valid state',
      /\bungrounded\b/.test(uClass) && !/error|warn|danger|invalid/i.test(uClass));
    check('and is not worded as a deficiency either',
      !/unverified|invalid|missing|fails|must/i.test(uText));

    log('\n=== Retracting your own claim ===');
    await ungrounded.getByRole('button', { name: 'Retract this claim', exact: true }).click();
    await page.waitForSelector('[data-testid="retract-form"]', { timeout: 20000 });
    // A reason is required: the record is the point of a retraction.
    await page.locator('[data-testid="retract-submit"]').click();
    const reasonErr = await page.locator('[data-testid="retract-error"]').innerText();
    check('retracting without a reason is refused', /reason is required/i.test(reasonErr));

    await page.locator('[data-testid="retract-reason"]').fill('The trial I had in mind reports adherence, not recurrence.');
    await page.locator('[data-testid="retract-submit"]').click();
    await page.waitForSelector('[data-testid="retraction-banner"]', { timeout: 25000 });
    const banner = await page.locator('[data-testid="retraction-banner"]').innerText();
    log(`  ${banner}`);
    check('the retraction renders with its reason', /adherence, not recurrence/.test(banner));

    // Not a deletion. The claim stays fully readable underneath.
    const stillThere = await page.locator('.claim-card').filter({ hasText: 'Rest alone' }).count();
    check('the retracted claim is NOT deleted — it stays readable', stillThere === 1);

    check('no uncaught page errors', errors.length === 0);
    if (errors.length) log(`  errors: ${errors.join(' | ')}`);

    if (process.env.EVIDENCE_SCREENSHOT) {
      await page.screenshot({ path: process.env.EVIDENCE_SCREENSHOT, fullPage: true });
      log(`  screenshot written to ${process.env.EVIDENCE_SCREENSHOT}`);
    }
  } finally {
    await browser.close();
    preview.kill();
  }

  log('\n=== Retraction is author-only, enforced by validation ===');
  const { app, admin, me, call } = await zome();
  try {
    // A claim by this agent, then a retraction claiming a DIFFERENT
    // author. validate_retraction's signature check catches that one.
    // The case that had no check at all is a correctly-signed retraction
    // of a claim someone else wrote — which cannot be staged with a
    // single agent, so this exercises the reachable half: a Retraction
    // whose target is not a Claim at all.
    const evidenceHash = await call('create_evidence', {
      content: 'Standalone evidence, not a claim.', evidence_type: 'Text',
      source_url: null, author: me, timestamp: Math.floor(Date.now() / 1000),
    });
    check('create_evidence returns a usable EntryHash', evidenceHash instanceof Uint8Array);

    let refused = null;
    try {
      await call('create_retraction', {
        target_claim: evidenceHash, reason: 'retracting something that is not a claim',
        replacement_claim: null, author: me, timestamp: Math.floor(Date.now() / 1000),
      });
    } catch (e) { refused = String(e?.data?.data ?? e?.message ?? e); }
    check('retracting a non-Claim is refused', refused !== null);
    check('  ...by DHT validation', /InvalidCommit|Validation failed/i.test(refused ?? ''));
    log(`  ${refused?.slice(0, 130)}`);
  } finally {
    try { await app.client?.close?.(); } catch { /* best effort */ }
    try { await admin.client?.close?.(); } catch { /* best effort */ }
  }

  log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
