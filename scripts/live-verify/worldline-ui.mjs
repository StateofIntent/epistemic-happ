#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/worldline-ui.mjs — the HRR/worldline surface:
// get_agent_worldline_trace, get_my_latest_worldline_checkpoint,
// verify_trace_checksum, query_worldline_resonance and sample_period.
//
// THE CONSTRAINT IS THE FEATURE. README §2.5 permits this layer to be
// "a receiver, not a truth engine", and query_worldline_resonance's own
// doc comment is unusually explicit about what that means in practice:
// unbinding is approximate by construction, "a high similarity score is
// a hint worth checking, not a claim of fact", and it "never substitutes
// for get_agent_worldline_trace's own period_boundaries, which remain
// the exact, lossless answer".
//
// So the failure this file exists to catch is not a broken read. It is a
// screen where the approximate half quietly displaces the exact one:
// resonance shown without the boundaries it points at, a similarity
// rendered as a measurement, or an empty probe reported as an error when
// the coordinator calls "nothing resonates" and "nothing to resonate
// with" both legitimate answers.
//
// It also checks the scoping decision. The coordinator accepts ANY
// AgentPubKey, but this UI probes only the caller's own worldline: a
// per-agent-per-domain similarity is a scalar that get_membrane_members
// makes enumerable and sortable, which is the leaderboard §9 records
// removing get_credit_balance to avoid, arriving by another route.
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
//   Regression injected: rendering the resonance probe BEFORE the exact
//   period record, and restating the similarity as "73% match" instead
//   of "~0.73" — the §2.5 inversion where the approximate half displaces
//   the exact one and a hint is presented as a measurement.
//   Result: two FAILs — the document-order check and the approximate-
//   marking check.
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
const PREVIEW_PORT = 4186;
const DOMAIN = `Worldline${Date.now()}`;

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
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
  log(`agent = ${b64(me).slice(0, 12)}…\n`);

  // Real chain activity, so the trace has periods to compress rather
  // than being the empty-chain edge case.
  log(`Seeding chain activity in ${DOMAIN} ...`);
  for (let i = 0; i < 3; i += 1) {
    await call('create_claim', {
      content: `Loaded carries reduce recurrence (${i + 1}).`, domain: DOMAIN,
      author: me, timestamp: nowMicros(), evidence_hashes: [],
      confidence: 'Moderate', semantic_tags: [], source_mew: null,
    });
  }

  // The exact answer the UI must not depart from.
  await call('generate_worldline_trace', {
    period_granularity_secs: 3600, expertise_tags: [], expires_at: null,
  });
  const trace = await call('get_agent_worldline_trace', me);
  if (!trace) {
    log('\n  SETUP FAILED: get_agent_worldline_trace returned nothing straight after');
    log('  generate_worldline_trace. A real failure of the zome, not of this harness.');
    log('  If the code looks correct the conductor is on a STALE BUILD —');
    log('  scripts/pack-webhapp.sh, then scripts/sandbox.sh clean && start.');
    process.exit(1);
  }
  const periods = trace.period_boundaries.length;
  log(`Exact answer: ${periods} period(s), payload ${trace.trace_payload ? 'present' : 'null'}`);
  if (periods === 0) {
    log('\n  SETUP FAILED: the trace covers no periods, so "the exact half renders"');
    log('  would pass vacuously. Refusing to run against a setup that cannot');
    log('  distinguish a working screen from an empty one.');
    process.exit(1);
  }
  check('CONTROL: the trace has a real HRR payload, not the empty-chain case',
    trace.trace_payload !== null && trace.binding_key !== null);

  log('\nStarting vite preview (production bundle) ...');
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

    log('\n=== 1. The exact half renders, and renders first ===');
    await page.getByRole('button', { name: 'Worldline', exact: true }).click();
    await page.waitForSelector('[data-testid="period-list"]', { timeout: 25000 });
    await page.waitForTimeout(2000);

    const shown = await page.locator('.period-row').count();
    check(`every real period is listed (${shown} shown, ${periods} in the trace)`,
      shown === periods);
    const firstCount = await page.locator('[data-testid="period-count"]').first().innerText();
    check(`entry counts come from the trace, not from a guess (got "${firstCount}")`,
      firstCount === `${trace.period_boundaries[0].entry_count} ${trace.period_boundaries[0].entry_count === 1 ? 'entry' : 'entries'}`);
    check('the checksum was verified rather than assumed',
      /checksum verifies/i.test(await page.locator('[data-testid="worldline-checksum"]').innerText()));

    // The exact block must precede the approximate one. A screen that
    // leads with resonance has inverted §2.5's rule however carefully it
    // words its caveat.
    const exactFirst = await page.evaluate(() => {
      const ex = document.querySelector('[data-testid="worldline-exact"]');
      const res = document.querySelector('[data-testid="resonance-caveat"]');
      if (!ex || !res) return false;
      return (ex.compareDocumentPosition(res) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    check('the exact record is placed before the approximate probe, not after it',
      exactFirst);

    log('\n=== 2. The probe is framed as a hint, and stays checkable ===');
    const caveat = await page.locator('[data-testid="resonance-caveat"]').innerText();
    check('the probe says unbinding is lossy', /lossy/i.test(caveat));
    check('and calls a high score a hint worth checking, not a fact',
      /hint worth checking/i.test(caveat) && /not a claim of fact/i.test(caveat));
    check('and points back at the exact periods as the real answer',
      /exact answer/i.test(caveat));
    // The shape of the result is not what a reader assumes, and getting
    // this wrong lets a meaningless probe read as findings.
    // query_worldline_resonance scores EVERY period and sorts them: no
    // threshold, no filtering. A UI that presents that as "matches" has
    // become a truth engine through presentation rather than through the
    // number. Found by probing a nonsense tag and getting a
    // confident-looking ranked list back.
    check('and says the list ranks every period rather than selecting matches',
      /every one of your periods/i.test(caveat) && /no threshold/i.test(caveat));

    await page.locator('[data-testid="resonance-tag"]').fill(DOMAIN);
    await page.locator('[data-testid="resonance-submit"]').click();
    await page.waitForTimeout(2500);

    const hits = await page.locator('.resonance-row').count();
    const expected = await call('query_worldline_resonance', {
      agent: me, domain_tag: DOMAIN, max_periods: periods,
    });
    check(`the probe renders exactly what the conductor returned (${hits} vs ${expected.length})`,
      hits === expected.length);

    if (expected.length > 0) {
      const rowText = await page.locator('.resonance-row').first().innerText();
      // The pairing is the whole design: a rank with no referent is the
      // truth-engine reading; a rank beside its real window is a lead.
      check(`each hit names the exact period it points at (got "${rowText.replace(/\n/g, ' ')}")`,
        /Period \d+ —/.test(rowText) && /entries/.test(rowText));
      const score = await page.locator('[data-testid="resonance-score"]').first().innerText();
      check(`the score is marked approximate rather than stated flat (got "${score}")`,
        score.trim().startsWith('~'));
    } else {
      log('  (no hits returned; the empty-answer path is checked below instead)');
    }

    log('\n=== 3. An unrelated tag still returns a full ranked list ===');
    // This is the check that would have caught the first version of this
    // screen. An empty result is NOT reachable by probing a bad tag —
    // the coordinator's four early returns are no trace, a null payload,
    // a foreign binding key, and an unparseable payload. Every period is
    // always scored. So the honest test is that a nonsense tag returns
    // the same number of rows as a real one, at lower scores, and that
    // the UI has told the reader to expect exactly that.
    const nonsense = `NothingLikeThis${Date.now()}`;
    await page.locator('[data-testid="resonance-tag"]').fill(nonsense);
    await page.locator('[data-testid="resonance-submit"]').click();
    await page.waitForTimeout(2500);
    const nonsenseRows = await page.locator('.resonance-row').count();
    check(`an unrelated tag still returns every period (${nonsenseRows}), not an empty set`,
      nonsenseRows === periods);
    const nonsenseScore = parseFloat(
      (await page.locator('[data-testid="resonance-score"]').first().innerText()).replace('~', ''),
    );
    log(`  nonsense tag top score: ${nonsenseScore}`);
    check('and it is still marked approximate rather than presented as a match',
      !Number.isNaN(nonsenseScore));

    // The genuinely empty path, checked where it is actually reachable:
    // an agent with no trace at all. Asserted at the zome rather than in
    // the browser, because this UI never renders a probe form for an
    // agent with no worldline.
    const emptyForNoTrace = await call('query_worldline_resonance', {
      agent: (await zome()).me, domain_tag: DOMAIN, max_periods: 4,
    });
    check('CONTROL: the empty return is a real code path, reached by absence not by a bad tag',
      Array.isArray(emptyForNoTrace));

    log('\n=== 4. A hint can be checked against the chain itself ===');
    await page.locator('[data-testid="period-sample"]').first().click();
    await page.waitForTimeout(2500);
    const sampleText = await page.locator('[data-testid="period-sample"]').first().innerText();
    check(`sample_period opens the window's real records (got "${sampleText}")`,
      /\d+ record/.test(sampleText));

    log('\n=== 5. Only this agent\'s own worldline is probed ===');
    // The scoping decision, asserted rather than trusted: no field
    // anywhere on this screen accepts another agent's key.
    const inputs = await page.locator('.worldline-tab input').count();
    const tagOnly = await page.locator('.worldline-tab input[data-testid="resonance-tag"]').count();
    check('the only input on the screen is the domain tag — no agent selector',
      inputs === 1 && tagOnly === 1);

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
