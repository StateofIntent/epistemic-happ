#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/affordance-surfacing.mjs — the critique form is
// unavailable exactly when the protocol would refuse it.
//
// WHY. README.md §9 recorded four UI patterns worth borrowing from game
// interfaces. Three shipped (the HUD layer, spatial navigation,
// progressive disclosure). The fourth — state-driven affordance
// surfacing, showing what you CAN do right now so you never attempt what
// the world will refuse — did not, and the gap had a sharp edge:
// `frictionStatus.blocked` was read in exactly two places, both purely
// cosmetic (the meter's label and its bar colour). Nothing gated the
// action. A practitioner whose budget was spent still saw an enabled
// "Add critique" button, wrote a critique, submitted it, and got an
// opaque validation error from the DHT — the precise failure the HUD
// was introduced to prevent. The meter depleted in front of them, and
// then the button lied.
//
// WHAT IS VERIFIED, against a live conductor, in one run:
//
//   1. WITH BUDGET REMAINING the form is fully usable — enabled
//      controls, no blocked reason. This is the built-in negative
//      control: a gate that is always closed would pass check 2 while
//      being useless, and this is what distinguishes the two.
//   2. WITH THE BUDGET SPENT the form is present but disabled, and says
//      why. Present and disabled, NOT hidden — see the critique form's
//      own comment in main.ts for why this case differs from retraction
//      on someone else's claim, which is hidden outright.
//   3. The budget is spent by an INDEPENDENT client, not through the UI.
//      So the UI is reacting to conductor state it did not itself
//      create, which is the actual claim being made.
//   4. The gate is not stale. The budget is exhausted while the panel is
//      already open on screen; merely re-opening it picks up the new
//      state, without a reload.
//
// Prereqs: scripts/sandbox.sh start, and a UI build (npm run build in
// mobile-ui/, or scripts/pack-webhapp.sh).
//
// NOTE ON RE-RUNS: the SWO limit is 20 SynapticLinks per ROLLING HOUR,
// so this harness genuinely spends the agent's real budget. Running it
// twice within the hour will fail at check 1 — correctly, since the
// precondition (budget remaining) is really false. Restart the sandbox
// for a clean run rather than treating that failure as flaky.
// ============================================================================
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
const PREVIEW_PORT = 4180;
const DOMAIN = `Affordance${Date.now()}`;

const log = (...a) => console.log(...a);
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

async function zome() {
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
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { me: cellIds[0][1], call };
}

const nowMicros = () => Date.now() * 1000;

async function main() {
  const { me, call } = await zome();

  const before = await call('get_synaptic_link_friction_status', null);
  log(`Budget at start: ${before.recent_count}/${before.limit} used, blocked=${before.blocked}`);
  if (before.blocked) {
    log('\nPRECONDITION FAILED: the budget is already spent, so the "form usable" control');
    log('cannot be checked. Restart the sandbox (scripts/sandbox.sh stop && start) and re-run.');
    process.exit(1);
  }

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

    // A claim of our own to hang the critique panel off.
    await page.getByRole('button', { name: 'New Claim', exact: true }).click();
    await page.locator('[data-testid="new-claim-content"]').fill('Budget-gating reference claim.');
    await page.locator('[data-testid="new-claim-domain"]').fill(DOMAIN);
    await page.getByRole('button', { name: 'Publish claim', exact: true }).click();
    await page.waitForTimeout(2500);

    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await page.getByPlaceholder(/domain/i).first().fill(DOMAIN);
    await page.getByRole('button', { name: 'Load claims', exact: true }).click();
    await page.waitForSelector('.claim-card', { timeout: 20000 });

    const openPanel = async () => {
      await page.getByRole('button', { name: 'View / add critiques', exact: true }).first().click();
      await page.waitForSelector('.critique-form', { timeout: 20000 });
      // The gate is applied on re-render after the friction read returns.
      await page.waitForTimeout(1500);
    };
    const closePanel = async () => {
      await page.getByRole('button', { name: 'Hide critiques', exact: true }).first().click();
      await page.waitForTimeout(400);
    };

    log('\n=== 1. With budget remaining, the form is usable (the control) ===');
    await openPanel();
    check('the critique form is present', await page.locator('.critique-form').count() === 1);
    check('its submit button is enabled',
      await page.locator('.critique-form button[type="submit"]').isDisabled() === false);
    check('its textarea is enabled',
      await page.locator('.critique-form textarea').isDisabled() === false);
    check('no blocked reason is shown',
      await page.locator('[data-testid="critique-blocked-reason"]').count() === 0);

    log('\n=== 2. Spending the whole budget from an INDEPENDENT client ===');
    // The UI is not involved in exhausting this. Whatever it does next is
    // a reaction to conductor state it did not create.
    const claimRecords = await call('get_claims_by_domain', DOMAIN);
    const targetHash = firstOrFail(claimRecords, 'get_claims_by_domain',
      "the claim this harness seeded into its domain").signed_action.hashed.content.entry_hash;
    const remaining = before.limit - before.recent_count;
    for (let i = 0; i < remaining; i++) {
      await call('create_critique', {
        target: targetHash,
        target_type: 'Claim',
        critique_mode: 'Logical',
        content: `Budget-spending critique ${i + 1}.`,
        author: me,
        timestamp: nowMicros(),
        replication_attempted: false,
        evidence_hashes: [],
        species: null,
      });
    }
    const after = await call('get_synaptic_link_friction_status', null);
    log(`  Budget now: ${after.recent_count}/${after.limit} used, blocked=${after.blocked}`);
    check('the conductor now reports the budget as spent', after.blocked === true);

    log('\n=== 3. The form becomes unavailable, without a reload ===');
    // Deliberately no page.reload(): closing and re-opening the panel is
    // the interaction a practitioner actually performs, and it is what
    // must pick up the new state. A gate that only refreshes on reload
    // would pass a reload-based test and still be stale in real use.
    await closePanel();
    await openPanel();

    check('the form is still PRESENT — unavailable, not hidden',
      await page.locator('.critique-form').count() === 1);
    check('its submit button is now disabled',
      await page.locator('.critique-form button[type="submit"]').isDisabled() === true);
    check('its textarea is now disabled',
      await page.locator('.critique-form textarea').isDisabled() === true);

    const reasonCount = await page.locator('[data-testid="critique-blocked-reason"]').count();
    check('a reason is shown', reasonCount === 1);
    if (reasonCount === 1) {
      const reason = await page.locator('[data-testid="critique-blocked-reason"]').innerText();
      log(`  reason: ${reason}`);
      check('the reason names the budget and when it resets',
        /budget spent/i.test(reason) && /\d+\s*min/.test(reason));
    }

    // The whole point is that the practitioner never reaches the opaque
    // DHT error. A disabled submit cannot be activated by clicking it.
    const errBefore = await page.locator('.critique-form .error-box:not([hidden])').count();
    await page.locator('.critique-form button[type="submit"]').click({ force: true, timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const errAfter = await page.locator('.critique-form .error-box:not([hidden])').count();
    check('clicking the disabled button raises no opaque conductor error',
      errBefore === 0 && errAfter === 0);

    check('no uncaught page errors', errors.length === 0);
    if (errors.length) errors.forEach((e) => log(`    ${e}`));
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
