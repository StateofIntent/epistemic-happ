#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/hud-layer.mjs — live verification of mobile-ui's
// epistemic-state ("HUD") layer against a real conductor and a real
// browser.
//
// Two phases, because the UI can create only some of the state it
// displays:
//
//   1. SEED, over a direct zome connection: a Claim, a Critique on it,
//      an AntibodyPattern flagging it, and a Retraction of it. The UI
//      has no screen for the last two yet — it reads them, it cannot
//      write them — so they are authored here rather than pretended at.
//   2. VERIFY, in a real Playwright-driven Chromium against the built
//      production bundle: connect, browse the domain, and confirm the
//      UI actually renders the friction meter, the retraction banner,
//      the antibody flag, and a conductance reading.
//
// Browser-driven rather than asserted from the DOM-free side, for the
// reason README.md's Phase 4 entry already records: this UI's one real
// bug (passing wsClientOptions to a native WebSocket) was invisible to
// tsc and to every build-time check, and surfaced only by connecting a
// real browser to a real conductor.
//
// Prereqs: scripts/sandbox.sh start (clean), and `npx vite build` in
// mobile-ui/ — this drives the production bundle via `vite preview`, not
// the dev server, so what is verified is what would ship.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
// This directory's own rule is that a harness which has only ever been
// green has not been shown to test anything. Recorded here, rather than
// only in a merged PR, so it is readable at the point someone runs this
// file.
//
//   Regression injected: rendering a constant '⟿ 9.99' instead of the real conductance.
//   Result: one FAIL — the fresh link no longer reads ~1.00. Note that DELETING the element instead produces only an opaque Playwright timeout, not a named FAIL.
//
//   Regression injected: the browse tab's domain box seeded from the last
//   LOADED domain with nothing persisting what is typed — i.e. this screen
//   exactly as it shipped, restored with `git checkout mobile-ui/src/main.ts`.
//   Result: two FAILs and a named error. The survival check goes red saying the
//   box now holds "", and the listing check goes red quoting the box and the
//   list's own empty-state text. That pairing is the point: this file's real CI
//   failure was a bare `TimeoutError` on `.claim-card` with the seed confirmed
//   written and the friction meter already rendering real state, and nothing in
//   it said whether the screen had lost the domain or the read had returned
//   nothing. It now says which.
//
//   Worth knowing about that injection: it fails DETERMINISTICALLY here while
//   the CI failure was intermittent. Both are the same defect. The
//   intermittency came from depending on an async re-render (the taxonomy load)
//   landing in the window between the keystroke and the click; the check forces
//   the same rebuild by switching tabs, which is what converts it from
//   something you wait to be unlucky about into something that is simply true
//   or false.
//
// Re-check it the same way if you change what this file asserts: inject,
// watch it go red, restore, watch it go green.
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { CHROMIUM } from './chromium.mjs';

// Playwright is a devDependency of mobile-ui (the UI it drives), not of
// this directory — scripts/live-verify/node_modules is a symlink to
// federation's, which has no reason to carry a browser automation
// library. Resolved explicitly from there rather than relying on an npx
// cache, which is not a stable path.
const requireFromUi = createRequire(new URL('../../mobile-ui/package.json', import.meta.url));
let chromium;
try {
  ({ chromium } = requireFromUi('playwright'));
} catch {
  console.error(
    'Could not resolve playwright from mobile-ui/. Install it there first:\n' +
    '  cd mobile-ui && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install\n' +
    '(the browser download is skipped on purpose where a system Chromium is ' +
    "already installed — see chromium.mjs for what this script actually drives)."
  );
  process.exit(1);
}

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_ID = 'epistemic-resonance-happ';
const PREVIEW_PORT = 4173;
const DOMAIN = `HudLayer${Date.now()}`;

function nowMicros() { return Date.now() * 1000; }
function nowSecs() { return Math.floor(Date.now() / 1000); }
function log(...a) { console.log(...a); }

let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

// A SETUP read coming back empty is the regression itself, not a bug in
// this harness — but dereferencing [0] on it dies with "Cannot read
// properties of undefined (reading 'signed_action')", which names this
// file's line number and says nothing about the zome that returned
// nothing. Observed for real while proving this suite catches
// regressions. The detection was sound; the diagnosis was useless, which
// is the opaque-failure mode this directory's README argues against.
const firstOrFail = (records, fn, expected) => {
  if (Array.isArray(records) && records.length > 0) return records[0];
  log(`\n  SETUP FAILED: ${fn} returned ${Array.isArray(records) ? '0 records' : String(records)}`);
  log(`  Expected ${expected}, published by this harness moments ago.`);
  log('  This is a real failure of the zome, not of the harness.');
  log('  If the code looks correct, the conductor is probably running a');
  log('  STALE BUILD: hc dna pack packages the wasm on disk rather than');
  log('  compiling it. Rebuild with scripts/pack-webhapp.sh, then');
  log('  scripts/sandbox.sh clean && scripts/sandbox.sh start.');
  process.exit(1);
};

async function seed() {
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

  log(`Seeding domain ${DOMAIN} ...`);
  await call('create_claim', {
    content: 'Seeded claim for HUD-layer verification.',
    domain: DOMAIN,
    author: me,
    timestamp: nowMicros(),
    evidence_hashes: [],
    confidence: 'Tentative',
    semantic_tags: ['hud'],
    source_mew: null,
  });
  const claimRecords = await call('get_claims_by_domain', DOMAIN);
  const claimEntryHash = firstOrFail(claimRecords, 'get_claims_by_domain',
    "the claim this harness seeded into its domain").signed_action.hashed.content.data.entry_hash;

  await call('create_critique', {
    target: claimEntryHash,
    target_type: 'Claim',
    critique_mode: 'Methodological',
    content: 'Seeded critique — exercises the SynapticLink conductance read.',
    author: me,
    timestamp: nowMicros(),
    replication_attempted: false,
    evidence_hashes: [],
    species: null,
  });

  // Neither of the following has a UI screen yet; the UI reads them.
  await call('publish_antibody_pattern', {
    target: claimEntryHash,
    target_type: 'Claim',
    kind: 'SpamFlood',
    rationale: 'Seeded flag for HUD-layer verification.',
    author: me,
    timestamp: nowSecs(),
  });
  await call('create_retraction', {
    target_claim: claimEntryHash,
    reason: 'Seeded retraction for HUD-layer verification.',
    replacement_claim: null,
    author: me,
    timestamp: nowSecs(),
  });

  log('  seeded claim + critique + antibody pattern + retraction.\n');
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

  const browser = await chromium.launch({ executablePath: CHROMIUM });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });

    log('=== Connecting the UI to the conductor ===');
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });
    check('friction meter renders once connected', true);

    const meterText = await page.locator('[data-testid="friction-meter"]').innerText();
    log(`  meter: ${meterText.replace(/\n/g, ' ')}`);
    check('meter reports a real budget out of the 20/hour limit', /\/\s*20\b/.test(meterText));
    // The seed authored one critique, which spends one SynapticLink.
    check('meter reflects budget already spent by the seed', /\b19\/20\b/.test(meterText));

    log('\n=== Browsing the seeded domain ===');
    await page.getByPlaceholder(/domain/i).first().fill(DOMAIN);

    // THE CHECK THAT WOULD HAVE NAMED THIS FILE'S INTERMITTENCY, and the
    // reason it is here rather than in a harness about typing.
    //
    // This wait timed out in CI on a bare `TimeoutError` naming a line number,
    // with the seed confirmed written and the friction meter already rendered
    // from real state — so the conductor had the claim and the screen would not
    // show it. The cause was not the read. `render()` rebuilds the DOM
    // wholesale, the domain box was seeded from the last LOADED domain, and
    // nothing outside the DOM remembered what had been typed; connecting fires
    // two independent async loads that each re-render when they resolve, so the
    // typed domain could vanish between the keystroke and the click and "Load
    // claims" would load the empty string.
    //
    // Forcing the rebuild rather than waiting to be unlucky is what turns an
    // intermittency into a check: switching tabs and back is a real re-render,
    // and the box must still hold what a person typed.
    await page.getByRole('button', { name: 'New Claim', exact: true }).click();
    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    const survived = await page.getByPlaceholder(/domain/i).first().inputValue();
    check('a typed domain survives the screen rebuilding underneath it',
      survived === DOMAIN);
    if (survived !== DOMAIN) log(`    (the box now holds ${JSON.stringify(survived)}, not the typed domain)`);

    // Exact name, not a loose pattern: the tab row also has a "Browse"
    // button, and a fuzzy match grabs the tab rather than the loader.
    await page.getByRole('button', { name: 'Load claims', exact: true }).click();
    const listed = await page.waitForSelector('.claim-card', { timeout: 20000 })
      .then(() => true).catch(() => false);
    check('the seeded claim is listed', listed);
    if (!listed) {
      // Never a bare timeout again: say which of the two it was. The service
      // half is asked through the page's own connection, so it is a statement
      // about the same conductor the screen is reading.
      const box = await page.getByPlaceholder(/domain/i).first().inputValue();
      const hint = (await page.locator('.claim-list .hint').allTextContents()).join(' | ');
      log(`    (domain box holds ${JSON.stringify(box)}; the list says ${JSON.stringify(hint)})`);
      log('    (if the box is empty the screen lost the typed domain; if it is right,');
      log('     the read returned nothing and the seed never became visible)');
      throw new Error('the seeded claim never appeared — see the two lines above for which half failed');
    }

    log('\n=== Epistemic state on the claim ===');
    await page.waitForSelector('[data-testid="retraction-banner"]', { timeout: 20000 });
    const retraction = await page.locator('[data-testid="retraction-banner"]').innerText();
    log(`  ${retraction}`);
    check('retraction banner renders with its reason', /Seeded retraction/.test(retraction));

    const antibody = await page.locator('[data-testid="antibody-flag"]').innerText();
    log(`  ${antibody}`);
    check('antibody flag renders its kind and rationale', /SpamFlood/.test(antibody) && /Seeded flag/.test(antibody));

    // The claim is annotated, never hidden — retraction is additive here.
    const claimText = await page.locator('.claim-content').first().innerText();
    check('the retracted claim is still fully readable', /Seeded claim/.test(claimText));

    log('\n=== Conductance on the critique ===');
    await page.getByRole('button', { name: /view \/ add critiques/i }).first().click();
    await page.waitForSelector('[data-testid="conductance"]', { timeout: 20000 });
    const conductance = await page.locator('[data-testid="conductance"]').first().innerText();
    log(`  ${conductance}`);
    check('conductance renders for the seeded critique', /⟿\s*\d/.test(conductance));
    // A fresh, un-reinforced link sits at its initial 1.0 before decay.
    check('conductance reads ~1.00 for a fresh link', /1\.00/.test(conductance));

    check('no uncaught page errors', errors.length === 0);

    // Layout is confirmed at a 390x844 (iPhone-class) viewport rather
    // than assumed from a media query, the same way Phase 4's own mobile
    // verification caught a real header-wrapping defect.
    if (process.env.HUD_SCREENSHOT) {
      await page.screenshot({ path: process.env.HUD_SCREENSHOT, fullPage: true });
      log(`  screenshot written to ${process.env.HUD_SCREENSHOT}`);
    }
    if (errors.length) log(`  errors: ${errors.join(' | ')}`);
  } finally {
    await browser.close();
    preview.kill();
  }

  log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
