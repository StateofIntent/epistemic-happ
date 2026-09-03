#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/taxonomy-ui.mjs — live verification of the critique
// taxonomy surface: the evolving vocabulary of critique KINDS, which
// README.md §9 named as the next unsurfaced read and which nothing could
// show until get_all_critique_species became a DHT read (PR #51).
//
// Three phases:
//
//   1. SEED, over a direct zome connection: a root species and a child of
//      it, so the tree has real parent/child structure rather than a flat
//      list that would pass a weaker assertion.
//   2. VERIFY IN A REAL BROWSER: the tree renders, the child is nested
//      under its parent, required evidence is shown, and each species
//      carries a live adoption count.
//   3. THE WRITE HALVES: pick a species when writing a critique (the
//      field was hardcoded `null` before this), and propose a new species
//      from the UI. Both confirmed by an INDEPENDENT client rather than
//      by the UI's own word.
//
// WHAT THIS DELIBERATELY ASSERTS ABOUT ORDERING. The coordinator exposes
// get_critique_species_adoption_count as a SINGULAR read and its doc
// comment records why there is intentionally no "all species ranked by
// adoption": that is the comparative leaderboard Invariant #1 and
// README.md §4.4's first constraint refuse. A UI that sorted by the
// count client-side would reintroduce exactly that one layer up. So this
// harness checks the rendered order is TAXONOMY order and stays put when
// adoption changes — a regression that started ranking would pass every
// other check in this file.
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
//   Regression injected: reverting Critique.species to a hardcoded null; separately, sorting the species tree by adoption.
//   Result: one FAIL for the first (adoption stays 0 -> 0) and three for the second (the ranked leaderboard Invariant #1 refuses).
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
const PREVIEW_PORT = 4182;
const DOMAIN = `Taxonomy${Date.now()}`;
const ROOT = `RootCritique${Date.now()}`;
const CHILD = `ChildCritique${Date.now()}`;
const PROPOSED = `ProposedCritique${Date.now()}`;

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

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

const nowMicros = () => Date.now() * 1000;
const b64 = (u8) => Buffer.from(u8).toString('base64');

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
  const { me, call } = await zome();

  // Writing a critique spends SWO budget. Checked up front for the same
  // reason write-symmetry.mjs checks it: the alternative is a Playwright
  // timeout on a disabled textarea, which reads like a broken form
  // rather than the affordance gate doing its job.
  const budget = await call('get_synaptic_link_friction_status', null);
  if (budget.blocked) {
    log(`Budget: ${budget.recent_count}/${budget.limit} used — SPENT.`);
    log('\nPRECONDITION FAILED: no SWO budget left, so no critique can be published');
    log('and the species picker cannot be exercised. This is the affordance gate');
    log('working, not a defect. Run: scripts/sandbox.sh clean && scripts/sandbox.sh start');
    process.exit(1);
  }
  log(`Budget: ${budget.recent_count}/${budget.limit} used — ok.`);

  log(`\nSeeding taxonomy: ${ROOT} with child ${CHILD} ...`);
  await call('create_critique_species', {
    name: ROOT, parent_species: null,
    required_evidence: ['The alternative method, and why it is more appropriate'],
    proposer: me, created_at: nowMicros(),
  });
  // create_critique_species returns an ActionHash, but parent_species
  // needs the ENTRY hash — the same getter/creator distinction this
  // codebase documents throughout, and the reason domains/bootstrap.mjs
  // reads the species back rather than using the returned hash.
  const seeded = await call('get_all_critique_species', null);
  const rootRecord = firstOrFail(
    seeded.filter((r) => r.entry?.Present?.entry != null), 'get_all_critique_species',
    `the root species ${ROOT} just created`,
  );
  const rootEntryHash = rootRecord.signed_action.hashed.content.entry_hash;

  await call('create_critique_species', {
    name: CHILD, parent_species: rootEntryHash,
    required_evidence: [], proposer: me, created_at: nowMicros(),
  });

  // A claim to hang a critique on, so the species picker has somewhere
  // to be exercised.
  await call('create_claim', {
    content: 'Loaded carries reduce recurrence.', domain: DOMAIN,
    author: me, timestamp: nowMicros(), evidence_hashes: [],
    confidence: 'Moderate', semantic_tags: [], source_mew: null,
  });

  const adoptionBefore = await call('get_critique_species_adoption_count', rootEntryHash);
  log(`Adoption of ${ROOT} before the UI writes anything: ${adoptionBefore}`);

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
    // The non-hosted path opens on the connect screen with the defaults
    // already filled from bridge/.env.example's ports, so this is one
    // click rather than three fills — same as every other browser
    // harness here.
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });

    log('\n=== 1. The taxonomy renders as a tree, not a flat list ===');
    await page.getByRole('button', { name: 'Critique Types', exact: true }).click();
    await page.waitForSelector('[data-testid="species-tree"]', { timeout: 20000 });

    const cards = page.locator('[data-testid="species-card"]');
    const names = await cards.evaluateAll((els) => els.map((e) => e.dataset.species));
    check('both seeded species are listed', names.includes(ROOT) && names.includes(CHILD));

    const childCard = page.locator(`[data-species="${CHILD}"]`);
    check('the child is rendered nested under its parent, not as a sibling',
      await childCard.evaluate((el) => el.classList.contains('child')));
    check('the root is NOT rendered as a child',
      await page.locator(`[data-species="${ROOT}"]`)
        .evaluate((el) => !el.classList.contains('child')));

    const rootText = await page.locator(`[data-species="${ROOT}"]`).innerText();
    check("required evidence is shown, so the species' demand is legible",
      rootText.includes('The alternative method'));

    log('\n=== 2. Adoption is a live count, not a stored number ===');
    // The integrity zome deliberately removed the stored adoption_count
    // because it was proposer-set and unvalidated. What renders must be
    // the query-time count, so it must read 0 before any critique
    // declares this species — not blank, and not "unavailable".
    const rootAdoption = await page.locator(`[data-species="${ROOT}"] [data-testid="species-adoption"]`).innerText();
    check(`a species nothing has used yet reads as 0 (got "${rootAdoption}")`,
      /used by 0 critiques/.test(rootAdoption));
    check('adoption is not rendered as unavailable when the read succeeded',
      !/unavailable/i.test(rootAdoption));

    log('\n=== 3. The write half: a critique can declare a species ===');
    // Before this change, Critique.species was hardcoded null at the one
    // place a critique is created, so the vocabulary was unspeakable and
    // every count was 0 forever.
    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await page.getByPlaceholder(/domain/i).first().fill(DOMAIN);
    await page.getByRole('button', { name: 'Load claims', exact: true }).click();
    await page.waitForSelector('.claim-card', { timeout: 20000 });
    await page.getByRole('button', { name: 'View / add critiques', exact: true }).first().click();
    await page.waitForSelector('.critique-form', { timeout: 20000 });
    // Settle before typing — render() rebuilds app.innerHTML wholesale
    // and the panel's own loads each re-render. Same wait, same reason,
    // as write-symmetry.mjs documents at length.
    await page.waitForTimeout(3000);

    const picker = page.locator('[data-testid="critique-species-select"]');
    check('the critique form offers a species picker', await picker.count() >= 1);
    const options = await picker.first().locator('option').allInnerTexts();
    check('the picker offers the seeded species', options.includes(ROOT));
    check('choosing no species stays a first-class option, since the protocol does not require one',
      options.some((o) => /no specific type/i.test(o)));

    await picker.first().selectOption({ label: ROOT });
    await page.locator('.critique-form textarea').fill('Sample size is not reported.');
    await page.getByRole('button', { name: 'Add critique', exact: true }).click();
    await page.waitForSelector('.critique-item', { timeout: 25000 });

    // INDEPENDENT confirmation — the UI's own word is not evidence that
    // the field reached the DHT. This is the convention the directory
    // README names as carrying most of these harnesses' value.
    const { call: call2 } = await zome();
    const adoptionAfter = await call2('get_critique_species_adoption_count', rootEntryHash);
    check(`adoption rose ${adoptionBefore} -> ${adoptionAfter}, read by an independent client`,
      adoptionAfter === adoptionBefore + 1);

    log('\n=== 4. Ordering stays taxonomy order after adoption changes ===');
    // The regression this guards: sorting the tree by adoption. With the
    // root now used once and the child never, a ranked render would put
    // the root first for a new reason and could reorder. Taxonomy order
    // is parent-then-its-children regardless of counts.
    await page.getByRole('button', { name: 'Critique Types', exact: true }).click();
    await page.waitForSelector('[data-testid="species-tree"]', { timeout: 20000 });
    const orderAfter = await page.locator('[data-testid="species-card"]')
      .evaluateAll((els) => els.map((e) => e.dataset.species));
    check('the child still renders immediately after its parent',
      orderAfter.indexOf(CHILD) === orderAfter.indexOf(ROOT) + 1);
    check('the child is still nested, not promoted by having no adoptions',
      await page.locator(`[data-species="${CHILD}"]`)
        .evaluate((el) => el.classList.contains('child')));

    log('\n=== 5. The other write half: proposing a species from the UI ===');
    await page.locator('[data-testid="propose-species-toggle"]').click();
    await page.waitForSelector('[data-testid="propose-species-form"]', { timeout: 20000 });
    await page.locator('[data-testid="species-name-input"]').fill(PROPOSED);
    await page.locator('[data-testid="species-parent-select"]').selectOption({ label: `Child of ${ROOT}` });
    await page.getByRole('button', { name: 'Propose', exact: true }).click();
    await page.waitForSelector(`[data-species="${PROPOSED}"]`, { timeout: 25000 });

    // Read back through get_critique_species rather than inspecting the
    // raw Record: a Record's entry arrives msgpack-encoded, so matching
    // on its bytes would be testing this harness's decoder. The
    // coordinator hands back a decoded CritiqueSpecies, which is both
    // simpler and the same path any real client would take.
    const allSpecies = await call2('get_all_critique_species', null);
    const decoded = await Promise.all(allSpecies.map((r) =>
      call2('get_critique_species', r.signed_action.hashed.content.entry_hash)));
    const proposed = decoded.find((sp) => sp && sp.name === PROPOSED);
    check('the proposed species is on the DHT under the name given, per an independent client',
      proposed != null);
    // The parent was chosen in the UI's own select, so this is the half
    // that would silently regress if the form sent null: the tree would
    // still render, just flat, and a laxer check would not notice.
    check('and the DHT records the parent the form selected, not a null parent',
      proposed != null && proposed.parent_species != null
        && b64(proposed.parent_species) === b64(rootEntryHash));
    check('and it renders nested under that parent',
      await page.locator(`[data-species="${PROPOSED}"]`)
        .evaluate((el) => el.classList.contains('child')));

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
