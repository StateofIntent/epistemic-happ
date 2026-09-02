#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/credit-transfer.mjs — live, two-agent verification of
// the metabolic biosignalling currency layer's countersigning flow
// (docs/metabolic-biosignalling-currency-brief.md §7's stated top
// priority next step).
//
// Unlike federation's federate.mjs (two genuinely separate conductors),
// this uses ONE conductor hosting TWO agents/cells of the same DNA —
// countersigning needs both signers to be reachable on the same network,
// which two cells of the same DNA on one conductor already are, without
// needing real inter-process network transport to be working in this
// environment. Same admin-auth connection flow as federate.mjs/
// domains/bootstrap.mjs, extended with admin.generateAgentPubKey() +
// admin.installApp() to bring up the second agent.
//
// Prereqs: scripts/sandbox.sh start (a single-agent conductor already
// running epistemic-resonance-happ on the standard 8889/8888 ports).
// ============================================================================
import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const AGENT1_APP_ID = 'epistemic-resonance-happ';
const AGENT2_APP_ID = 'epistemic-resonance-happ-agent2';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;

function b64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function nowSecs() {
  return Math.floor(Date.now() / 1000);
}

function log(...args) {
  console.log(...args);
}

/** Wraps an already-installed+enabled app: issues an auth token, connects
 * an AppWebsocket, discovers its cell id, authorizes signing credentials,
 * and returns a callZome helper — same shape federate.mjs's connect(). */
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
  if (cellIds.length === 0) throw new Error(`App "${appId}" has no provisioned or cloned cells.`);
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  const myAgent = cellIds[0][1];
  const callZome = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { myAgent, callZome, app };
}

async function main() {
  log(`Connecting to admin (${ADMIN_URL}) ...`);
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });

  log('Connecting agent 1 (already installed by scripts/sandbox.sh) ...');
  const agent1 = await connectApp(admin, AGENT1_APP_ID);
  log(`  agent1 = ${b64(agent1.myAgent)}`);

  log('Generating and installing agent 2 on the same conductor ...');
  const apps = await admin.listApps({});
  const alreadyInstalled = apps.some((a) => a.installed_app_id === AGENT2_APP_ID);
  let agent2Pub;
  if (alreadyInstalled) {
    log('  agent2 app already installed — reusing it.');
    const info = apps.find((a) => a.installed_app_id === AGENT2_APP_ID);
    agent2Pub = Object.values(info.cell_info)[0][0][CellType.Provisioned].cell_id[1];
  } else {
    agent2Pub = await admin.generateAgentPubKey();
    await admin.installApp({
      path: HAPP_PATH,
      agent_key: agent2Pub,
      installed_app_id: AGENT2_APP_ID,
      membrane_proofs: {},
    });
    await admin.enableApp({ installed_app_id: AGENT2_APP_ID });
  }
  const agent2 = await connectApp(admin, AGENT2_APP_ID);
  log(`  agent2 = ${b64(agent2.myAgent)}\n`);

  let failures = 0;
  const check = (label, cond) => {
    if (cond) log(`  PASS: ${label}`);
    else { log(`  FAIL: ${label}`); failures++; }
  };

  // -- Negative case FIRST: a plain, non-countersigned commit must be
  // rejected outright by validate() — this is the actual security
  // property being verified, not a side note.
  // attempt_uncountersigned_credit_transfer does exactly what a client
  // that skipped countersigning would do, and exists in the coordinator
  // zome solely so that this rejection can be checked against a real
  // conductor (see its own doc comment).
  log('=== Negative case: a plain, non-countersigned commit ===');
  const bypassPayload = {
    from: agent1.myAgent,
    to: agent2.myAgent,
    amount: 999.0,
    reason: 'bypass-attempt',
    timestamp: nowSecs(),
  };
  try {
    await agent1.callZome('attempt_uncountersigned_credit_transfer', bypassPayload);
    check('plain non-countersigned MutualCreditTransfer is rejected', false);
  } catch (e) {
    const msg = String(e?.data?.data ?? e?.message ?? e);
    log(`  (rejected as expected: ${msg.slice(0, 200)})`);
    check('plain non-countersigned MutualCreditTransfer is rejected', true);
  }

  // -- Positive case: the real 3-step countersigning flow.
  log('\n=== Positive case: real countersigned MutualCreditTransfer ===');
  const transferPayload = {
    from: agent1.myAgent,
    to: agent2.myAgent,
    amount: 10.0,
    reason: 'live-verify-transfer',
    timestamp: nowSecs(),
  };

  log('Step 1/3: agent1 proposes ...');
  const preflightRequest = await agent1.callZome('propose_credit_transfer', transferPayload);
  log('  got PreflightRequest.');

  log('Step 2/3: both agents accept ...');
  const [acc1, acc2] = await Promise.all([
    agent1.callZome('accept_credit_transfer', preflightRequest),
    agent2.callZome('accept_credit_transfer', preflightRequest),
  ]);
  check('agent1 accepted', 'Accepted' in acc1);
  check('agent2 accepted', 'Accepted' in acc2);

  // Both signed PreflightResponses go to BOTH parties — a countersigned
  // entry embeds the whole session, so neither side can build its own
  // half from its own response alone. Order matters: it must match the
  // PreflightRequest's own signing_agents order (`from`, then `to`),
  // which is the order these two accepts were issued in.
  const responses = [acc1.Accepted, acc2.Accepted];

  log('Step 3/3: both agents finalize (commit their own half concurrently) ...');
  const [hash1, hash2] = await Promise.all([
    agent1.callZome('finalize_credit_transfer', { transfer: transferPayload, responses }),
    agent2.callZome('finalize_credit_transfer', { transfer: transferPayload, responses }),
  ]);
  log(`  agent1's action hash: ${b64(hash1)}`);
  log(`  agent2's action hash: ${b64(hash2)}`);
  check('both sides committed successfully', !!hash1 && !!hash2);

  // Indexing the transfer under each agent's own anchor is a separate
  // call: a chain in a countersigning session accepts the session entry
  // and nothing else, so finalize_credit_transfer cannot write its own
  // index link. See link_credit_transfer's doc comment.
  log('Indexing the transfer under each agent\'s own anchor ...');
  await Promise.all([
    agent1.callZome('link_credit_transfer', hash1),
    agent2.callZome('link_credit_transfer', hash2),
  ]);

  log('\nReading balances back ...');
  const bal1 = await agent1.callZome('get_credit_balance', agent1.myAgent);
  const bal2 = await agent1.callZome('get_credit_balance', agent2.myAgent);
  log(`  get_credit_balance(agent1) = ${bal1}`);
  log(`  get_credit_balance(agent2) = ${bal2}`);
  // Bounds are inclusive of the undecayed value on purpose. Demurrage
  // has a 30-day half-life, so a transfer read back a fraction of a
  // second after it commits has decayed by far less than an f32 can
  // represent — the balance is exactly ±10, not ±9.999…. An earlier,
  // exclusive version of these two checks failed for that reason alone,
  // with the ledger behaving correctly.
  check('agent1 balance is ~ -10', bal1 <= -9.9 && bal1 >= -10.0);
  check('agent2 balance is ~ +10', bal2 >= 9.9 && bal2 <= 10.0);

  // -- CreditBurn: single-signer, no countersigning needed.
  log('\n=== CreditBurn (single-signer) ===');
  const burnHash = await agent1.callZome('create_credit_burn', { amount: 3.0, reason: 'burn_friction' });
  log(`  burn action hash: ${b64(burnHash)}`);
  const bal1AfterBurn = await agent1.callZome('get_credit_balance', agent1.myAgent);
  log(`  get_credit_balance(agent1) after burning 3 = ${bal1AfterBurn}`);
  check('agent1 balance dropped by ~3 after the burn', bal1AfterBurn <= bal1 - 2.9 && bal1AfterBurn >= bal1 - 3.0);

  log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
