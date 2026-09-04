#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/neighborhood-ui.mjs — the neighborhood half of HRR:
// query_neighborhood_resonance, given a surface at last.
//
// WHAT THIS SURFACE IS, AND THE THING IT MUST NOT BECOME. §2.5 permits this
// layer to be "a receiver, not a truth engine", and the coordinator's own doc
// comment is blunt: a NeighborRecall's similarity is "a hint worth checking,
// not a claim of fact", never a substitute for get_grounding_path or
// get_critiques_for, which remain the exact reads. So the failure this file
// exists to catch is not a broken probe. It is a screen where the approximate
// half quietly displaces the exact one — resonance shown above the evidence
// chain, a similarity rendered as a measurement, or an empty probe reported
// as an error when "nothing to resonate with" is a legitimate answer.
//
// IT IS A MEMBERSHIP PROBE, NOT A SEARCH, and that is why this surface is
// invariant-safe at all. query_neighborhood_resonance does not discover
// anything: it scores candidates the caller supplies and echoes each back
// with its own hash. A discovery feature would have to rank the DHT by
// relevance, which is the comparative ordering Invariant 1 refuses — and
// which scripts/live-verify/mcp-server.mjs already refuses on the agent side.
//
// THE TRAP, WHICH IS THE SAME ONE THE WORLDLINE PROBE RECORDS. The
// coordinator applies NO THRESHOLD. It scores every candidate handed to it
// and returns them all, so probing claims with no relationship to the subject
// still yields a full list — just with low scores. Rendered identically to a
// set of findings, a meaningless probe reads as evidence. This file checks
// that the screen says so, in words, before showing any of it.
//
// Prereqs: a CLEAN sandbox (scripts/sandbox.sh clean && start) and a UI build.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
//   Injection: similarity rendered as "73% match" instead of "~0.73" — the
//   §2.5 inversion where a hint is presented as a measurement.
//   Result: two red, the tilde check and the percentage control. This is the
//   same injection worldline-ui.mjs records for the other half of HRR, and it
//   is worth repeating here rather than assumed to generalise: the two halves
//   are separate surfaces and the inversion is available to both.
//
//   Injection: filter the results to similarity > 0.2, so the panel shows
//   only what looks like a match.
//   Result: FOUR red, and the number is the interesting part — the panel went
//   to ZERO ROWS. Every score in this arrangement is below 0.2, because a
//   binding built from one neighbour spreads thinly over a fixed-size vector.
//   So the "reasonable" threshold a well-meaning change might add does not
//   trim noise; it empties the panel and leaves a screen that silently
//   reports nothing whenever a claim's neighborhood is small. That is a
//   stronger argument for the no-threshold rule than the caveat's own wording,
//   and it is why the harness checks that an UNRELATED claim is present rather
//   than merely that some rows exist.
//
//   Restored and re-run: 14 checks green.
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const requireFromUi = createRequire(new URL('../../mobile-ui/package.json', import.meta.url));
let chromium;
try { ({ chromium } = requireFromUi('playwright')); }
catch { console.error('Could not resolve playwright from mobile-ui/.'); process.exit(1); }

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_ID = 'epistemic-resonance-happ';
const PREVIEW_PORT = 4198;
const STAMP = Date.now();
const DOMAIN = `Neighborhood${STAMP}`;

const SUBJECT = `Loaded carries reduce recurrence, stamped ${STAMP}.`;
const RELATED = `Progressive loading protocols in rehabilitation, stamped ${STAMP}.`;
const UNRELATED = `An entirely unrelated assertion about tides, stamped ${STAMP}.`;

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};
const nowMicros = () => Date.now() * 1000;

async function zome() {
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: APP_ID });
  const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const cellIds = [];
  for (const rc of Object.values(info.cell_info)) {
    for (const c of rc) if (c?.type === CellType.Provisioned) cellIds.push(c.value.cell_id);
  }
  for (const id of cellIds) await admin.authorizeSigningCredentials(id);
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { me: cellIds[0][1], call };
}

async function main() {
  const { me, call } = await zome();
  const mk = (content) => call('create_claim', {
    content, domain: DOMAIN, confidence: 'Moderate', semantic_tags: [],
    author: me, timestamp: nowMicros(), evidence_hashes: [], attestation_policy: null,
  });
  log(`Seeding ${DOMAIN} with a subject and two other claims ...`);
  await mk(SUBJECT); await mk(RELATED); await mk(UNRELATED);

  // Give the subject a real neighborhood: an evidence citation and a critique,
  // so the binding has something in it. A probe against an EMPTY binding would
  // return zeros for everything and the checks below would pass without
  // distinguishing anything.
  const all = await call('get_claims_by_domain', DOMAIN);
  const subject = all.find((r) => {
    try { return String(Buffer.from(r.entry.Present.entry)).includes('Loaded carries'); } catch { return false; }
  }) ?? all[0];
  const subjectHash = subject.signed_action.hashed.content.data.entry_hash;
  await call('create_critique', {
    target: subjectHash, target_type: 'Claim', critique_mode: 'Logical',
    content: `A critique giving the subject a neighborhood, stamped ${STAMP}.`,
    author: me, timestamp: nowMicros(), replication_attempted: false,
    evidence_hashes: [], species: null,
  });

  const binding = await call('build_neighborhood_binding', subjectHash);
  log(`  binding holds ${binding.source_hashes.length} neighbour(s)`);
  if (binding.source_hashes.length === 0) {
    log('\n  SETUP FAILED: the subject has an empty neighborhood binding, so a probe');
    log('  would score everything zero and prove nothing. A real failure of the zome');
    log('  or a STALE BUILD — scripts/pack-webhapp.sh, then sandbox.sh clean && start.');
    process.exit(1);
  }

  log('\nStarting vite preview ...');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: new URL('../../mobile-ui/', import.meta.url).pathname, stdio: 'ignore',
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
    await page.locator('.search-row input').first().fill(DOMAIN);
    await page.getByRole('button', { name: 'Load claims' }).first().click();
    await page.waitForSelector('.claim-card', { timeout: 20000 });
    await page.waitForTimeout(1500);

    const card = page.locator('.claim-card').filter({ hasText: 'Loaded carries' }).first();

    // ---- 1. It is opt-in, and it is not the first thing offered ---------
    log('=== 1. The probe is offered, and offered second ===');
    check('the claim card offers a resonance probe',
      (await card.locator('[data-testid="resonance-toggle"]').count()) === 1);
    check('CONTROL: no probe results are on screen before anyone asks',
      (await page.locator('[data-testid="resonance-panel"]').count()) === 0);

    // §2.5's rule as a question of document order: the exact reads come
    // first. worldline-ui.mjs checks the same property for the other half.
    const exactFirst = await card.evaluate((el) => {
      const critique = el.querySelector('button.link-button');
      const probe = el.querySelector('[data-testid="resonance-toggle"]');
      if (!critique || !probe) return false;
      return (critique.compareDocumentPosition(probe) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    check('the exact reads are placed before the approximate probe, not after',
      exactFirst);

    // ---- 2. What it says before it shows anything -----------------------
    log('\n=== 2. The framing arrives with the numbers ===');
    await card.locator('[data-testid="resonance-toggle"]').click();
    await page.waitForSelector('[data-testid="resonance-panel"]', { timeout: 20000 });
    await page.waitForTimeout(2500);
    const caveat = await page.locator('[data-testid="neighborhood-caveat"]').innerText();
    check('it says unbinding is lossy', /lossy/i.test(caveat));
    check('it says there is NO THRESHOLD — the trap that makes a nonsense probe look like findings',
      /no threshold/i.test(caveat));
    check('it says a high score is a hint rather than a fact',
      /hint worth checking/i.test(caveat) && /not a claim of fact/i.test(caveat));
    check('it names the exact answer the probe does not replace',
      /evidence chain|critiques above/i.test(caveat));

    // ---- 3. The numbers are approximations, and say so ------------------
    log('\n=== 3. A similarity is rendered as an approximation ===');
    const rows = await page.locator('[data-testid="resonance-row"]').count();
    check(`the probe returned scored rows (${rows})`, rows > 0);
    const scores = await page.locator('[data-testid="resonance-score"]').allInnerTexts();
    check('every score is marked approximate with a tilde',
      scores.length > 0 && scores.every((t) => t.trim().startsWith('~')));
    check('CONTROL: no score is rendered as a percentage — that would state a measurement',
      !scores.some((t) => t.includes('%')));

    // ---- 4. The unrelated claim is present, not filtered -----------------
    //
    // This is the check that makes the caveat honest rather than decorative.
    // The coordinator applies no threshold, so an unrelated claim MUST still
    // appear. If a future change quietly filtered low scores, the screen
    // would start implying selection it does not perform.
    log('\n=== 4. No threshold is applied, exactly as the caveat says ===');
    const panelText = await page.locator('[data-testid="resonance-panel"]').innerText();
    check('the unrelated claim appears in the results too — nothing was filtered',
      panelText.includes('unrelated assertion about tides'));
    check('so does the related one', panelText.includes('Progressive loading protocols'));
    check('CONTROL: the subject does not resonate with itself — it is excluded as a candidate',
      !panelText.includes('Loaded carries reduce recurrence'));

    check('CONTROL: the page raised no uncaught errors', pageErrors.length === 0);
    if (pageErrors.length) for (const e of pageErrors) log(`    pageerror: ${e}`);
  } finally {
    await browser.close();
    preview.kill();
  }

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — the neighborhood probe has a surface that offers it');
    log('second, marks every score as an approximation, states that it filters');
    log('nothing, and proves it by showing an unrelated claim among the results.');
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(1); });
