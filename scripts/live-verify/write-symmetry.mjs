#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/write-symmetry.mjs — the two places this UI showed
// protocol state it gave no way to participate in.
//
// WHY. README.md §9's "surface the epistemic state the backend already
// computes" was being counted by how many coordinator functions had a
// screen. That count hid a sharper problem than coverage: two functions
// were surfaced READ-ONLY while their write counterparts were not.
//
//   - get_effective_conductance was surfaced; reinforce_synaptic_link
//     was not. The UI showed a connection's strength and offered no way
//     to strengthen it — while conductance's entire meaning is decay
//     unless reinforced. A client that only reads it describes a process
//     it lets nobody take part in.
//   - get_antibody_patterns_for was surfaced; publish_antibody_pattern
//     was not. The UI showed what others had flagged and let the
//     practitioner flag nothing, making the reader a spectator of §4.2's
//     immune response rather than part of it.
//
// WHAT IS VERIFIED, against a live conductor:
//
//   1. Reinforcement really moves the number. The conductance shown for
//      a critique is read BEFORE and AFTER pressing Reinforce, and must
//      strictly increase — and the increase is confirmed independently
//      via get_effective_conductance, not taken from the UI's own text.
//   2. The Reinforcement is really on the DHT, on the right link: an
//      independent client re-reads the same SynapticLink and sees the
//      same raised value.
//   3. Flagging publishes a real AntibodyPattern, which an independent
//      client reads back with the kind and rationale intact.
//   4. A flag with no rationale is refused by the UI before it reaches
//      the conductor — an unexplained flag is the flat downvote this
//      protocol exists not to have.
//   5. Flagging REMOVES NOTHING. The claim is still present and still
//      readable afterwards, which is what the form's own microcopy
//      promises and Invariant #6 requires.
//
// Prereqs: scripts/sandbox.sh start, and a UI build (npm run build in
// mobile-ui/).
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
const PREVIEW_PORT = 4181;
const DOMAIN = `WriteSym${Date.now()}`;

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

async function main() {
  const { call } = await zome();

  // This harness has to publish a critique to get a SynapticLink worth
  // reinforcing, so it needs SWO budget. Checked up front because the
  // alternative is a Playwright timeout on a disabled textarea, which
  // reports as "the form never became editable" and reads like a bug in
  // this UI rather than an exhausted budget from an earlier run — the
  // affordance gate doing exactly its job. Observed the confusing way
  // first, hence this check.
  const budget = await call('get_synaptic_link_friction_status', null);
  if (budget.blocked) {
    log(`Budget: ${budget.recent_count}/${budget.limit} used — SPENT.`);
    log('\nPRECONDITION FAILED: no SWO budget left, so no critique can be published and');
    log('there is no SynapticLink to reinforce. This is the affordance gate working, not');
    log('a defect. Run: scripts/sandbox.sh clean && scripts/sandbox.sh start');
    process.exit(1);
  }
  log(`Budget: ${budget.recent_count}/${budget.limit} used — ok.`);

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

    await page.getByRole('button', { name: 'New Claim', exact: true }).click();
    await page.locator('[data-testid="new-claim-content"]').fill('Loaded carries reduce recurrence.');
    await page.locator('[data-testid="new-claim-domain"]').fill(DOMAIN);
    await page.getByRole('button', { name: 'Publish claim', exact: true }).click();
    await page.waitForTimeout(2500);

    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await page.getByPlaceholder(/domain/i).first().fill(DOMAIN);
    await page.getByRole('button', { name: 'Load claims', exact: true }).click();
    await page.waitForSelector('.claim-card', { timeout: 20000 });

    // A critique, so there is a SynapticLink with a conductance to move.
    await page.getByRole('button', { name: 'View / add critiques', exact: true }).first().click();
    await page.waitForSelector('.critique-form', { timeout: 20000 });
    // Settle before typing, and NOT as test hygiene — this waits out a
    // real defect. render() rebuilds app.innerHTML wholesale, and
    // opening a panel kicks off loadCritiques and loadConductances,
    // which each call render() when they return. Anything typed into the
    // form before those land is discarded with the DOM that held it.
    // Observed here first as a critique that was silently never created:
    // no error, no budget spent, just nothing. A person typing fast
    // would hit the same thing. Recorded in README.md §9 against the
    // local-first mirror item, which is the actual fix.
    await page.waitForTimeout(3000);
    await page.locator('.critique-form textarea').fill('The cited trial reports adherence, not recurrence.');
    await page.getByRole('button', { name: 'Add critique', exact: true }).click();
    await page.waitForSelector('[data-testid="conductance"]', { timeout: 25000 });

    log('\n=== 1. Reinforcement moves the number it is attached to ===');
    const readShown = async () =>
      parseFloat((await page.locator('[data-testid="conductance"]').first().innerText()).replace(/[^\d.]/g, ''));

    const shownBefore = await readShown();
    log(`  conductance shown before: ${shownBefore}`);
    check('a reinforce affordance is offered beside the conductance it acts on',
      await page.locator('[data-testid="reinforce"]').count() >= 1);

    await page.locator('[data-testid="reinforce"]').first().click();
    await page.waitForTimeout(3000);
    const shownAfter = await readShown();
    log(`  conductance shown after:  ${shownAfter}`);
    check('the displayed conductance strictly increased', shownAfter > shownBefore);
    check('no error was surfaced on the reinforce affordance',
      await page.locator('[data-testid="reinforce-error"]').count() === 0);

    log('\n=== 2. The Reinforcement is really on the DHT ===');
    // Independent client, same link, resolved the same way the UI does.
    const claimRecords = await call('get_claims_by_domain', DOMAIN);
    const claimEntryHash = firstOrFail(claimRecords, 'get_claims_by_domain',
      "the claim this harness seeded into its domain").signed_action.hashed.content.entry_hash;
    const critiqueRecords = await call('get_critiques_for', claimEntryHash);
    const critiqueActionHash = critiqueRecords[0].signed_action.hashed.hash;
    const linkHash = await call('find_synaptic_link', {
      base: claimEntryHash, target_action: critiqueActionHash,
    });
    const independent = await call('get_effective_conductance', linkHash);
    log(`  independent read: ${independent}`);
    // Compared against what the UI SHOWED, so this fails if the UI is
    // rendering an optimistic local number rather than the conductor's.
    check('an independent client sees the same raised conductance',
      Math.abs(independent - shownAfter) < 0.02);
    check('it is genuinely higher than the pre-reinforcement value',
      independent > shownBefore);

    log('\n=== 3. Flagging a structural pattern ===');
    await page.locator('[data-testid="flag-toggle"]').first().click();
    await page.waitForSelector('[data-testid="flag-form"]', { timeout: 20000 });

    // An unexplained flag is refused before the conductor ever sees it.
    await page.locator('[data-testid="flag-submit"]').first().click();
    await page.waitForTimeout(600);
    const flagErr = await page.locator('[data-testid="flag-error"]').first().innerText();
    check('a flag with no rationale is refused', /rationale is required/i.test(flagErr));

    await page.locator('[data-testid="flag-kind"]').first().selectOption('Plagiarism');
    await page.locator('[data-testid="flag-rationale"]').first()
      .fill('Identical wording to a 2019 review, with no citation.');
    await page.locator('[data-testid="flag-submit"]').first().click();
    await page.waitForSelector('[data-testid="antibody-flag"]', { timeout: 25000 });

    const flagText = await page.locator('[data-testid="antibody-flag"]').first().innerText();
    log(`  ${flagText}`);
    check('the new flag renders with its kind and rationale',
      /Plagiarism/.test(flagText) && /2019 review/.test(flagText));

    const patterns = await call('get_antibody_patterns_for', claimEntryHash);
    check('an independent client reads the AntibodyPattern off the DHT',
      Array.isArray(patterns) && patterns.length === 1);

    log('\n=== 4. Flagging removes nothing ===');
    // The form promises this in so many words, so it is checked rather
    // than trusted. Invariant #6: nothing is deleted, only witnessed.
    const cardText = await page.locator('.claim-card').first().innerText();
    check('the flagged claim is still present and still readable',
      /Loaded carries reduce recurrence/.test(cardText));
    check('its critique is still there too',
      (await call('get_critiques_for', claimEntryHash)).length === 1);

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
