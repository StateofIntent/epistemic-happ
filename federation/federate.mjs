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
//     [--check-only] [--import-critiques] [--min-attestations N]
//     [--min-conductance F] [--half-life-secs S]
//
// --check-only skips writing new FederationRecords and only reports
// current mutual status — useful for re-confirming federation later
// without re-declaring it, since mutuality can only ever be confirmed
// by re-querying both sides, never cached or assumed.
//
// ---------------------------------------------------------------------------
// --import-critiques — STAGE 5, THE MICROBIOME HALF (open-work item 2.5).
//
// Reads the REMOTE membrane's discourse and records, on the LOCAL network,
// a witness for each foreign critique found. Only runs when mutual
// federation is confirmed: importing from a membrane that has not recognised
// you back is helping yourself to somebody's discourse, and the one-sided
// case is exactly what `FederationRecord` was built to make visible.
//
// THE LENS IS THE ARGUMENT, AND IT IS WHY THIS FLAG TAKES POLICY OPTIONS.
// `AttestationPolicy` and `ConductancePolicy` are READER-SUPPLIED — the
// reader supplying one is the promiser, which is READINESS item 10's
// resolution of Invariant #1's first note. So the remote's discourse read
// unfiltered and read under this importer's declared policy are DIFFERENT
// SETS, and neither is "the" set. Whichever is used is carried into every
// witness entry, because a filtered import presented as a neutral one is a
// lensed number wearing a neutral face.
//
// `--min-attestations`, `--min-conductance` and `--half-life-secs` are how an
// importer declares that lens. Supplying none means unfiltered — which is
// itself a methodological choice, and the most consequential one, so it is
// stated in the witness rather than left blank.
//
// WHAT IT CANNOT DO, and the limitation is structural rather than a gap:
// neither network can see the other's data, so nothing imported is verified.
// Each witness is the importing agent's own signed assertion that a critique
// saying this exists over there — the correlative-witness shape
// `FederationRecord` and `BridgeRecord` already use. The foreign author,
// target and mode travel as OPAQUE STRINGS rather than typed hashes,
// precisely because a type would assert a validation this network never
// performed.
// ============================================================================
import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { decode } from '@msgpack/msgpack';

function parseArgs(argv) {
  const args = { checkOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check-only') args.checkOnly = true;
    else if (a === '--import-critiques') args.importCritiques = true;
    else if (a.startsWith('--')) args[a.slice(2)] = argv[++i];
  }
  args.importCritiques = args.importCritiques ?? false;
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
      // CellInfo is a discriminated union as of @holochain/client 0.21
      // ({ type, value }), where it used to be keyed by cell type. The
      // old `CellType.Provisioned in cell` test matches nothing against
      // the new shape and silently yields no cell ids.
      if (cell?.type === CellType.Provisioned || cell?.type === CellType.Cloned) {
        cellIds.push(cell.value.cell_id);
      }
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

/** The lens this importer declares, assembled from the flags.
 *
 *  BOTH HALVES ARE `null` UNLESS ASKED FOR, and that is not a default so much
 *  as a position: `null` means "every critique counted, no decay threshold",
 *  which `describe_method` in the coordinator spells out in words rather than
 *  leaving blank. An importer who filtered and did not say so would be
 *  publishing a lensed set as a neutral one. */
function lensFrom(args) {
  const minAttestations = args['min-attestations'] ? Number(args['min-attestations']) : null;
  const minConductance = args['min-conductance'] ? Number(args['min-conductance']) : null;
  const halfLife = args['half-life-secs'] ? Number(args['half-life-secs']) : null;
  return {
    attestation_policy: minAttestations === null ? null : {
      require_attestation_from: null,
      min_attestations: minAttestations,
      max_attestation_depth: null,
    },
    conductance_policy: (minConductance === null && halfLife === null) ? null : {
      min_effective_conductance: minConductance ?? 0.0,
      half_life_secs: halfLife,
    },
  };
}

/** Every critique of every claim in the remote membrane's domain, as this
 *  bridge can see them from the remote side. Read through the remote's OWN
 *  conductor, which is the only process that can see that DHT at all. */
async function readRemoteCritiques(remote, remoteMembraneB64) {
  const membrane = Buffer.from(remoteMembraneB64, 'base64');
  const health = await remote.callZome('get_discourse_health', {
    membrane, attestation_policy: null, conductance_policy: null,
  });
  const claims = await remote.callZome('get_claims_by_domain', health.domain);
  const found = [];
  for (const record of claims) {
    const entryHash = record?.signed_action?.hashed?.content?.data?.entry_hash;
    if (!entryHash) continue;
    const critiques = await remote.callZome('get_critiques_for', entryHash);
    for (const c of critiques) {
      // DECODED HERE RATHER THAN THROUGH A GETTER, because there is no
      // `get_critique` extern — `get_critiques_for` returns Records and a
      // Record's entry crosses as msgpack. `recognizes()` above already does
      // exactly this for FederationRecord; the first version of this function
      // called a `get_critique` that does not exist and died on the real
      // error the conductor gives for that, which is the better failure.
      let decoded;
      try { decoded = decode(c.entry.Present.entry); } catch { continue; }
      if (!decoded?.content) continue;
      found.push({
        author: b64(Uint8Array.from(decoded.author?.data ?? decoded.author ?? [])),
        mode: typeof decoded.critique_mode === 'string'
          ? decoded.critique_mode : JSON.stringify(decoded.critique_mode),
        content: decoded.content,
        target: b64(entryHash),
      });
    }
  }
  return { domain: health.domain, critiques: found };
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

  if (args.importCritiques) {
    // REFUSED WITHOUT MUTUALITY. Importing from a membrane that has not
    // recognised you back is helping yourself to somebody's discourse, and
    // the one-sided case is exactly what FederationRecord exists to expose.
    if (!mutual) {
      console.log('\n--import-critiques REFUSED: federation is not mutual.');
      console.log('  A membrane that has not recognised you back has not invited this.');
      process.exit(1);
    }
    const lens = lensFrom(args);
    console.log('\n--- Importing foreign critiques as witnesses ---');
    console.log(`  lens: attestation ${lens.attestation_policy ? JSON.stringify(lens.attestation_policy) : 'none (every critique counted)'}`);
    console.log(`        conductance ${lens.conductance_policy ? JSON.stringify(lens.conductance_policy) : 'none (no decay threshold)'}`);
    const { domain, critiques } = await readRemoteCritiques(remote, args['remote-membrane']);
    console.log(`  remote domain "${domain}" holds ${critiques.length} critique(s) this bridge can see`);
    let imported = 0;
    for (const c of critiques) {
      const result = await local.callZome('import_foreign_critique', {
        membrane: Buffer.from(args['local-membrane'], 'base64'),
        remote_network_label: args['remote-label'],
        remote_membrane_ref: args['remote-membrane'],
        foreign_author_ref: c.author,
        foreign_mode: c.mode,
        foreign_content: c.content,
        foreign_target_ref: c.target,
        attestation_policy: lens.attestation_policy,
        conductance_policy: lens.conductance_policy,
        // The IMPORTER's confidence in their own report of what they saw.
        // Tentative because nothing here is verified and nothing can be.
        confidence: 'Tentative',
      });
      imported++;
      if (imported === 1) console.log(`  read through: ${result.read_through}`);
    }
    console.log(`  ${imported} witness(es) written on the local network.`);
    console.log('  NONE of them is verified, and none counts as this domain\'s own');
    console.log('  discourse — get_discourse_health excludes them and reports the');
    console.log('  count separately as imported_claims.');
  }

  process.exit(mutual ? 0 : 1);
}

main().catch((err) => {
  console.error('ERROR:', err.message ?? err);
  process.exit(2);
});
