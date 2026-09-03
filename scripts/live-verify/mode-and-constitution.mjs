#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/mode-and-constitution.mjs — the last two unsurfaced
// reads on §9's list: get_critiques_by_mode and get_agent_constitution.
//
// THEY ARE PAIRED HERE BECAUSE THEY FAIL IN OPPOSITE DIRECTIONS.
//
//   get_critiques_by_mode is CHAIN-LOCAL BY SPECIFICATION (SPEC §10.0).
//   It returns the caller's own critiques and cannot see anyone else's.
//   The failure mode is a label: a heading reading "Logical critiques"
//   over that data is false, and falsest in its empty state, where a
//   practitioner reads zero as "nobody critiques this way" when it means
//   "I have not". So this harness gives agent 2 critiques agent 1 will
//   never see, and asserts the UI never claims otherwise.
//
//   get_agent_constitution is a real DHT read, global and cross-agent.
//   Its failure mode is the opposite: inferring something from ABSENCE.
//   Nothing requires an agent to publish a constitution, so a UI that
//   made its absence look like a deficiency would be scoring agents on a
//   field the protocol never asked them to fill — Invariant #1 through
//   the back door. So agent 2 publishes one and agent 3 does not, and
//   both renderings are checked.
//
// Prereqs: a CLEAN sandbox (scripts/sandbox.sh clean && start) and a UI
// build — scripts/pack-webhapp.sh does both builds in the right order.
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
const AGENT2_APP_ID = 'epistemic-resonance-happ-agent2';
const AGENT3_APP_ID = 'epistemic-resonance-happ-agent3';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;
const PREVIEW_PORT = 4185;
const DOMAIN = `ModeConst${Date.now()}`;

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

const nowMicros = () => Date.now() * 1000;
const nowSecs = () => Math.floor(Date.now() / 1000);
const b64 = (u8) => Buffer.from(u8).toString('base64');

async function connectApp(admin, appId) {
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: appId });
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

async function ensureAgent(admin, appId) {
  const apps = await admin.listApps({});
  if (!apps.some((a) => a.installed_app_id === appId)) {
    const key = await admin.generateAgentPubKey();
    await admin.installApp({ path: HAPP_PATH, agent_key: key, installed_app_id: appId, membrane_proofs: {} });
    await admin.enableApp({ installed_app_id: appId });
  }
  return connectApp(admin, appId);
}

async function main() {
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const agent1 = await connectApp(admin, APP_ID);
  log(`agent1 (the browser) = ${b64(agent1.me).slice(0, 12)}…`);
  log('Installing agents 2 and 3 on the same conductor ...');
  const agent2 = await ensureAgent(admin, AGENT2_APP_ID);
  const agent3 = await ensureAgent(admin, AGENT3_APP_ID);
  log(`agent2 (publishes a constitution) = ${b64(agent2.me).slice(0, 12)}…`);
  log(`agent3 (publishes none, on purpose) = ${b64(agent3.me).slice(0, 12)}…\n`);

  // agent 2 has a constitution; agent 3 deliberately does not.
  await agent2.call('publish_constitution', {
    agent: agent2.me,
    promises: [{ action: 'distinguish observation from inference', domain: DOMAIN, modality: null }],
    conditions: [], published_at: nowSecs(), expires_at: null,
  });

  // Each of agents 2 and 3 authors a claim, so the browser has a card
  // per author to open the constitution affordance on.
  const a2Claim = 'Rest alone is sufficient.';
  const a3Claim = 'Load tolerance is the wrong metric.';
  for (const [agent, content] of [[agent2, a2Claim], [agent3, a3Claim]]) {
    await agent.call('create_claim', {
      content, domain: DOMAIN, author: agent.me, timestamp: nowMicros(),
      evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
    });
  }

  // Agent 2 writes critiques agent 1 must never see in a by-mode read.
  const claims = await agent2.call('get_claims_by_domain', DOMAIN);
  if (claims.length === 0) {
    log('\n  SETUP FAILED: get_claims_by_domain returned 0 after publishing two claims.');
    log('  A real failure of the zome, not of this harness. If the code looks correct,');
    log('  the conductor is running a STALE BUILD — scripts/pack-webhapp.sh, then clean.');
    process.exit(1);
  }
  const target = claims[0].signed_action.hashed.content.entry_hash;
  for (let i = 0; i < 2; i += 1) {
    await agent2.call('create_critique', {
      target, target_type: 'Claim', critique_mode: 'Logical',
      content: `Agent 2's logical critique ${i + 1}.`, author: agent2.me,
      timestamp: nowMicros(), replication_attempted: false, evidence_hashes: [], species: null,
    });
  }

  // The baseline the UI must reproduce exactly: agent 1's OWN count.
  const a1Logical = await agent1.call('get_critiques_by_mode', 'Logical');
  const a2Logical = await agent2.call('get_critiques_by_mode', 'Logical');
  log(`agent1 get_critiques_by_mode(Logical) -> ${a1Logical.length}`);
  log(`agent2 get_critiques_by_mode(Logical) -> ${a2Logical.length}`);
  if (a2Logical.length === 0) {
    log('\n  SETUP FAILED: agent 2 cannot see its own critiques, so the chain-local');
    log('  claim below cannot be distinguished from a broken read. Refusing to run.');
    process.exit(1);
  }
  check('CONTROL: the read is chain-local — agent 1 does not see agent 2\'s critiques',
    a1Logical.length === 0 && a2Logical.length === 2);

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

    log('\n=== 1. The by-mode breakdown never claims to be global ===');
    await page.getByRole('button', { name: 'Critique Types', exact: true }).click();
    const modeToggle = page.locator('[data-testid="mode-breakdown-toggle"]');
    check('the affordance names the scope before it is opened',
      /your own/i.test(await modeToggle.innerText()));
    await modeToggle.click();
    await page.waitForSelector('[data-testid="mode-list"]', { timeout: 20000 });
    await page.waitForTimeout(2500);

    const scopeNote = await page.locator('[data-testid="mode-scope-note"]').innerText();
    check('an explicit scope note is shown', /your own critiques only/i.test(scopeNote));
    check('and it names the specification rather than hand-waving',
      /chain-local/i.test(scopeNote) && /10\.0/.test(scopeNote));
    // The empty state is where the lie would do real damage.
    check('and says plainly that zero means "you have not", not "nobody has"',
      /not that nobody has/i.test(scopeNote));

    const logicalRow = page.locator('.mode-row[data-mode="Logical"]');
    const logicalText = await logicalRow.locator('[data-testid="mode-count"]').innerText();
    check(`agent 1's own Logical count renders as 0, matching the conductor (got "${logicalText}")`,
      /you have written 0/i.test(logicalText));
    check('and the count is phrased as the reader\'s own, not as a total',
      /you have written/i.test(logicalText));
    check('every protocol mode is listed, not only the ones used',
      await page.locator('.mode-row').count() === 5);

    log('\n=== 2. An author\'s constitution is readable across agents ===');
    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await page.getByPlaceholder(/domain/i).first().fill(DOMAIN);
    await page.getByRole('button', { name: 'Load claims', exact: true }).click();
    await page.waitForSelector('.claim-card', { timeout: 20000 });
    await page.waitForTimeout(3000);

    const a2Card = page.locator('.claim-card', { hasText: a2Claim }).first();
    await a2Card.locator('[data-testid="constitution-toggle"]').click();
    await page.waitForSelector('[data-testid="author-promises"]', { timeout: 20000 });
    const promises = await a2Card.locator('[data-testid="author-promises"]').innerText();
    check('agent 1 can read agent 2\'s published promises — a real cross-agent DHT read',
      /distinguish observation from inference/i.test(promises));
    const cMeta = await a2Card.locator('[data-testid="constitution-meta"]').innerText();
    check('and when the promise was made is stated, since a promise covers a window',
      /published \d{4}-\d{2}-\d{2}/i.test(cMeta));

    log('\n=== 3. Absence is reported, never scored ===');
    const a3Card = page.locator('.claim-card', { hasText: a3Claim }).first();
    await a3Card.locator('[data-testid="constitution-toggle"]').click();
    await page.waitForSelector('[data-testid="constitution-none"]', { timeout: 20000 });
    const noneText = await a3Card.locator('[data-testid="constitution-none"]').innerText();
    check('an author with no constitution is reported as exactly that',
      /has not published a constitution/i.test(noneText));
    // The whole point: nothing requires one, so nothing may be read into
    // its absence. A UI that framed it as a deficiency would be scoring
    // agents on a field the protocol never asked them to fill.
    check('and the UI states that nothing requires one',
      /nothing requires one/i.test(noneText));
    check('and that its absence says nothing about their claims',
      /says nothing about their claims/i.test(noneText));
    check('and uses no deficiency language',
      !/missing|incomplete|unverified|fails|lacks|warning/i.test(noneText));

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
