#!/usr/bin/env node
// ============================================================================
// federation/federate.mjs — records and confirms mutual federation
// between a Membrane on THIS network and a Membrane on a genuinely
// separate Holochain network (a different conductor — different
// machine, or the same machine on different ports for local testing).
//
// The two networks share no DHT: neither side can see the other's data
// directly, so this script is the external witness that connects to
// BOTH conductors, writes each side's own FederationRecord (a one-sided
// correlative witness — see dna/integrity/src/lib.rs's own doc comment
// on FederationRecord for why), and then independently confirms
// mutuality by reading both sides back. Same admin-auth connection flow
// bridge/src/index.ts, mobile-ui/src/holochain.ts, and
// domains/bootstrap.mjs all already established.
//
// Usage:
//   node federate.mjs \
//     --local-admin ws://localhost:8889 --local-app ws://localhost:8888 \
//     --local-app-id epistemic-resonance-happ \
//     --local-membrane <base64 EntryHash of a real Membrane on the local conductor> \
//     --local-label "network-a" \
//     --remote-admin ws://localhost:9889 --remote-app ws://localhost:9888 \
//     --remote-app-id epistemic-resonance-happ \
//     --remote-membrane <base64 EntryHash of a real Membrane on the remote conductor> \
//     --remote-label "network-b" \
//     [--check-only]
//
// --check-only skips writing new FederationRecords and only reports
// current mutual status — useful for re-confirming federation later
// without re-declaring it, since mutuality can only ever be confirmed
// by re-querying both sides, never cached or assumed.
// ============================================================================
import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { decode } from '@msgpack/msgpack';

function parseArgs(argv) {
  const args = { checkOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check-only') args.checkOnly = true;
    else if (a.startsWith('--')) args[a.slice(2)] = argv[++i];
  }
  const required = [
    'local-admin', 'local-app', 'local-app-id', 'local-membrane', 'local-label',
    'remote-admin', 'remote-app', 'remote-app-id', 'remote-membrane', 'remote-label',
  ];
  const missing = required.filter((k) => !args[k]);
  if (missing.length > 0) {
    console.error(`Missing required arguments: ${missing.map((k) => `--${k}`).join(', ')}`);
    process.exit(1);
  }
  return args;
}

function nowMicros() {
  return Date.now() * 1000;
}

async function connect(adminUrl, appUrl, appId) {
  const wsClientOptions = { origin: 'epistemic-federation-bridge' };
  const admin = await AdminWebsocket.connect({ url: new URL(adminUrl), wsClientOptions });
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: appId });
  const app = await AppWebsocket.connect({ url: new URL(appUrl), token, wsClientOptions });
  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      if (CellType.Provisioned in cell) cellIds.push(cell[CellType.Provisioned].cell_id);
      else if (CellType.Cloned in cell) cellIds.push(cell[CellType.Cloned].cell_id);
    }
  }
  if (cellIds.length === 0) throw new Error(`App "${appId}" at ${appUrl} has no provisioned or cloned cells.`);
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  const myAgent = cellIds[0][1];
  const callZome = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { myAgent, callZome };
}

function b64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

/** Whether `federationRecords` (this side's own get_federation_records_for
 * result) contains one whose remote_membrane_ref names the other side's
 * membrane. This is the actual, honest mutuality check: not "does a
 * FederationRecord exist" but "does at least one of them specifically
 * point at the exact membrane we're checking." */
function recognizes(federationRecords, targetMembraneB64) {
  return federationRecords.some((r) => {
    const decoded = decode(r.entry.Present.entry);
    return decoded.remote_membrane_ref === targetMembraneB64;
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log(`Connecting to local conductor (${args['local-admin']}) ...`);
  const local = await connect(args['local-admin'], args['local-app'], args['local-app-id']);
  console.log(`  local agent: ${b64(local.myAgent)}`);

  console.log(`Connecting to remote conductor (${args['remote-admin']}) ...`);
  const remote = await connect(args['remote-admin'], args['remote-app'], args['remote-app-id']);
  console.log(`  remote agent: ${b64(remote.myAgent)}\n`);

  if (!args.checkOnly) {
    console.log(`Recording local membrane's recognition of remote membrane ...`);
    await local.callZome('record_federation', {
      local_membrane: Buffer.from(args['local-membrane'], 'base64'),
      remote_network_label: args['remote-label'],
      remote_membrane_ref: args['remote-membrane'],
      author: local.myAgent,
      created_at: nowMicros(),
    });

    console.log(`Recording remote membrane's recognition of local membrane ...`);
    await remote.callZome('record_federation', {
      local_membrane: Buffer.from(args['remote-membrane'], 'base64'),
      remote_network_label: args['local-label'],
      remote_membrane_ref: args['local-membrane'],
      author: remote.myAgent,
      created_at: nowMicros(),
    });
    console.log('');
  } else {
    console.log('--check-only: skipping writes, reading current state from both sides.\n');
  }

  const localRecords = await local.callZome('get_federation_records_for', Buffer.from(args['local-membrane'], 'base64'));
  const remoteRecords = await remote.callZome('get_federation_records_for', Buffer.from(args['remote-membrane'], 'base64'));

  const localRecognizesRemote = recognizes(localRecords, args['remote-membrane']);
  const remoteRecognizesLocal = recognizes(remoteRecords, args['local-membrane']);

  console.log(`Local membrane's FederationRecords: ${localRecords.length}`);
  console.log(`Remote membrane's FederationRecords: ${remoteRecords.length}`);
  console.log(`Local -> Remote recognition: ${localRecognizesRemote ? 'YES' : 'no'}`);
  console.log(`Remote -> Local recognition: ${remoteRecognizesLocal ? 'YES' : 'no'}`);

  const mutual = localRecognizesRemote && remoteRecognizesLocal;
  console.log(`\n${mutual ? 'MUTUAL FEDERATION CONFIRMED' : 'NOT mutually federated (one-sided or absent)'}`);

  process.exit(mutual ? 0 : 1);
}

main().catch((err) => {
  console.error('ERROR:', err.message ?? err);
  process.exit(2);
});
