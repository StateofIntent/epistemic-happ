#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/protocol-version.mjs — THE NETWORK SAYS WHICH PROTOCOL
// IT IS, AND CANNOT LIE ABOUT IT.
//
// WHAT THIS IS FOR. `SPEC.md` §11.1 works out what this substrate actually
// permits, and the conclusion is narrow: a Holochain network *is* its integrity
// zome. The DNA hash is computed over the integrity manifest — `network_seed`,
// `properties`, and the integrity zomes — and only peers sharing that hash share
// a DHT. So every edit to the integrity zome forks the network, there is no such
// thing as an additive backward-compatible entry change, and a network runs
// exactly ONE version by construction.
//
// Which means the version in `dna/dna.yaml`'s `properties` is not a
// compatibility mechanism — there is nothing for it to be compatible with. It is
// a DECLARATION, and the only thing worth proving about a declaration is that it
// cannot be false. Three separate claims, and each is checked against a running
// conductor rather than argued from the manifest:
//
//   1. THE DECLARATION IS READABLE. `get_protocol_version` answers on an empty
//      network, before anything has been written — which is when "which
//      protocol is this?" is actually asked.
//   2. THE DECLARATION IS INSIDE THE IDENTITY. A DNA differing ONLY in
//      `properties.protocol_version` packs to a DIFFERENT DNA hash. This is the
//      whole argument for putting the version there rather than on each entry,
//      and it is checked by packing both and comparing, not by citing a doc
//      comment.
//   3. A MISDECLARING DNA IS INERT. A DNA whose `properties` say one version
//      while its integrity zome implements another is installed for real, and
//      every write to it is refused by DHT VALIDATION naming both numbers.
//      This is the one mistake the hash cannot prevent — one forgotten edit at
//      a bump — and a network that lies about which protocol it speaks is worse
//      than one that refuses to start.
//
// WHY 3 IS THE POINT. Checks 1 and 2 would both pass on a version that
// validation ignored entirely. Only 3 distinguishes a real declaration from a
// decorative one, and it is the reason `validate_protocol_version` runs on every
// op rather than once at genesis: a mispacked DNA installs perfectly, and the
// lie only matters at the moment something is written under it.
//
// Prereqs: a CLEAN sandbox (`scripts/sandbox.sh clean && scripts/sandbox.sh
// start`) on a freshly packed bundle (`scripts/pack-webhapp.sh`). The DNA hash
// CHANGED when `properties` were first set — that is the cost this decision was
// taken with eyes open, recorded in README §9 — so a resumed sandbox holding
// pre-version data is a different network and will not do. `hc` must be on PATH
// or in ~/.cargo/bin, as everywhere else here.
//
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
//   Injection: `validate()` returning early WITHOUT calling
//   `validate_protocol_version` — the state this zome was in before this work,
//   and the state one deleted `if` returns it to.
//   Result: the two checks in section 3 go red — the misdeclared DNA accepts a
//   write — while sections 1 and 2 stay green. That split is the finding: a
//   version can be readable and inside the hash and still be decorative, and
//   only section 3 can tell. Watched before it was believed.
//
//   Injection: `properties` removed from `dna/dna.yaml` (back to `~`).
//   Result: this harness never reaches the conductor — it stops at its own
//   setup check, because the version it compares against is READ from that
//   manifest and there is nothing there to read. Recorded exactly that way
//   rather than tidied, because the harness stopping early is correct and the
//   claim it does NOT prove had to be checked separately: probed directly, an
//   unversioned DNA refuses BOTH the write ("Validation failed … declares no
//   readable protocol version") and the read, so absent properties fail like
//   mismatched ones. That is what stops the declaration from being optional,
//   and it is evidence from a probe, not from this file.
// ============================================================================
import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_ID = 'epistemic-resonance-happ';
const BAD_APP_ID = 'epistemic-resonance-happ-misdeclared';
const REPO = new URL('../../', import.meta.url).pathname;

// The version this repository is on, read from the manifest rather than
// hardcoded here: a harness that carries its own copy of the number cannot
// notice the two drifting apart, which is the entire failure it exists for.
const DNA_YAML = join(REPO, 'dna/dna.yaml');
const EXPECTED = Number(
  (/^\s*protocol_version:\s*(\d+)\s*$/m.exec(readText(DNA_YAML)) ?? [])[1],
);

const b64 = (u8) => Buffer.from(u8).toString('base64');
const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};
function setupFail(lines) {
  log('');
  for (const l of lines) log(`  SETUP FAILED: ${l}`);
  process.exit(1);
}
function readText(p) {
  return readFileSync(p, 'utf8');
}

/** `hc`, resolved the way every other script here resolves it. */
function hc(args, cwd) {
  const candidates = ['hc', join(process.env.HOME ?? '', '.cargo/bin/hc')];
  let lastErr = null;
  for (const bin of candidates) {
    try { return execFileSync(bin, args, { cwd, encoding: 'utf8' }); }
    catch (e) { lastErr = e; if (e.code !== 'ENOENT') throw e; }
  }
  throw lastErr ?? new Error('hc not found');
}

async function connectApp(admin, appId) {
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: appId });
  const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      if (cell?.type === CellType.Provisioned || cell?.type === CellType.Cloned) {
        cellIds.push(cell.value.cell_id);
      }
    }
  }
  if (cellIds.length === 0) throw new Error(`App "${appId}" has no provisioned or cloned cells.`);
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { dnaHash: cellIds[0][0], me: cellIds[0][1], call };
}

const nowMicros = () => Date.now() * 1000;
const claimOf = (author, domain, content) => ({
  content, domain, confidence: 'Moderate', semantic_tags: [],
  author, timestamp: nowMicros(), evidence_hashes: [], attestation_policy: null,
});

/** Pack a DNA that declares `version`, using the SAME compiled wasm as the real
 * one. Absolute paths, because `path:` resolves relative to the manifest and
 * this manifest lives in a temp directory. */
function packDnaDeclaring(version, dir) {
  const integrity = join(REPO, 'dna/integrity/target/wasm32-unknown-unknown/release/epistemic_integrity.wasm');
  const coordinator = join(REPO, 'dna/coordinator/target/wasm32-unknown-unknown/release/epistemic_coordinator.wasm');
  for (const w of [integrity, coordinator]) {
    if (!existsSync(w)) {
      setupFail([`${w} does not exist.`, 'Run: scripts/pack-webhapp.sh']);
    }
  }
  const name = `epistemic-dna-v${version}`;
  writeFileSync(join(dir, 'dna.yaml'), [
    'manifest_version: "0"',
    `name: ${name}`,
    'integrity:',
    '  network_seed: ~',
    '  properties:',
    `    protocol_version: ${version}`,
    '  zomes:',
    '    - name: epistemic_integrity',
    '      hash: ~',
    `      path: ${integrity}`,
    '      dependencies: ~',
    'coordinator:',
    '  zomes:',
    '    - name: epistemic_coordinator',
    '      hash: ~',
    `      path: ${coordinator}`,
    '      dependencies:',
    '        - name: epistemic_integrity',
    '',
  ].join('\n'));
  hc(['dna', 'pack', dir], dir);
  return join(dir, `${name}.dna`);
}

/** Wrap a packed DNA in a minimal hApp so the conductor will install it. */
function packHapp(dnaPath, appName, dir) {
  writeFileSync(join(dir, 'happ.yaml'), [
    'manifest_version: "0"',
    `name: ${appName}`,
    'description: "misdeclared protocol version — live-verify fixture"',
    'roles:',
    '  - name: epistemic',
    '    provisioning:',
    '      strategy: create',
    '      deferred: false',
    '    dna:',
    `      path: ${dnaPath}`,
    '      modifiers:',
    '        network_seed: ~',
    '        properties: ~',
    '      installed_hash: ~',
    '      clone_limit: 0',
    '',
  ].join('\n'));
  hc(['app', 'pack', dir], dir);
  return join(dir, `${appName}.happ`);
}

async function main() {
  if (!Number.isInteger(EXPECTED)) {
    setupFail([
      `Could not read protocol_version from ${DNA_YAML}.`,
      'It must be set — a DNA without it is inert by design. See SPEC.md §11.',
    ]);
  }
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const good = await connectApp(admin, APP_ID);
  const tmp = mkdtempSync(join(tmpdir(), 'epi-protocol-version-'));

  try {
    // === 1. The declaration is readable, before anything is written ======
    log('\n--- The network says which protocol it is ---');
    let identity = null;
    try { identity = await good.call('get_protocol_version', null); }
    catch (e) {
      setupFail([
        `get_protocol_version failed: ${e?.message ?? e}`,
        'A DNA with no readable protocol_version in its properties is inert by',
        'design. Rebuild with scripts/pack-webhapp.sh, then sandbox.sh clean && start.',
      ]);
    }
    check('the network can be asked which protocol it is running',
      Number.isInteger(identity?.declared_version));
    check(`and it says what dna/dna.yaml says — ${EXPECTED} — rather than drifting from it`,
      identity.declared_version === EXPECTED);
    check('the zome that implements it agrees, which is the only thing validation can check',
      identity.implemented_version === identity.declared_version);
    check('the hash it reports IS this cell\'s network, not a number it made up',
      b64(identity.dna_hash) === b64(good.dnaHash));

    // The baseline the refusal below is measured against. Without it, "writes
    // are refused" proves nothing — they might be refused everywhere.
    const mine = await good.call('create_claim',
      claimOf(good.me, `ProtocolVersion${Date.now()}`, 'A correctly declared network accepts writes.'));
    check('a correctly-declared network accepts writes — the control for section 3',
      mine !== null && mine !== undefined);

    // === 2. The declaration is inside the network's identity =============
    log('\n--- The version is part of what the network IS ---');
    const sameDna = packDnaDeclaring(EXPECTED, mkdtempSync(join(tmpdir(), 'epi-same-')));
    const otherDna = packDnaDeclaring(EXPECTED + 1, mkdtempSync(join(tmpdir(), 'epi-other-')));
    // `hc dna hash` prints multibase base64url — a leading "u", then
    // base64url — while the client hands back raw bytes. Same hash, two
    // spellings; compared as bytes so a formatting difference is never
    // mistaken for a different network.
    const fromHc = (s) => Buffer.from(s.trim().replace(/^u/, ''), 'base64url');
    const sameHash = fromHc(hc(['dna', 'hash', sameDna]));
    const otherHash = fromHc(hc(['dna', 'hash', otherDna]));
    check('two DNAs differing ONLY in the declared version hash differently — the version is in the identity',
      sameHash.length > 0 && !sameHash.equals(otherHash));
    const running = Buffer.from(good.dnaHash);
    check('and the one declaring what this repository declares IS this running network',
      sameHash.equals(running));
    if (!sameHash.equals(running)) {
      log(`    (packed ${b64(sameHash)} vs running ${b64(running)} — a stale build, or a sandbox older than the manifest)`);
    }

    // === 3. A misdeclaring DNA is inert ==================================
    // The one mistake the hash cannot prevent: properties bumped, zome not, or
    // the other way round. Installed for real rather than argued about.
    log('\n--- A DNA that misdeclares itself cannot be written to ---');
    const badHapp = packHapp(otherDna, 'epistemic-misdeclared', tmp);
    const apps = await admin.listApps({});
    if (!apps.some((a) => a.installed_app_id === BAD_APP_ID)) {
      const key = await admin.generateAgentPubKey();
      await admin.installApp({
        source: { type: 'path', value: badHapp },
        agent_key: key,
        installed_app_id: BAD_APP_ID,
      });
      await admin.enableApp({ installed_app_id: BAD_APP_ID });
    }
    const bad = await connectApp(admin, BAD_APP_ID);

    // Reading still works, deliberately: a network that refuses every write
    // must still be able to say WHY, or the failure is a mystery.
    let badIdentity = null;
    try { badIdentity = await bad.call('get_protocol_version', null); } catch { /* reported below */ }
    check('a misdeclaring network can still be ASKED what it thinks it is — otherwise the failure is a mystery',
      badIdentity !== null && badIdentity.declared_version === EXPECTED + 1);
    check('and it reports the disagreement rather than hiding it',
      badIdentity !== null && badIdentity.implemented_version !== badIdentity.declared_version);

    let refusal = null;
    try {
      await bad.call('create_claim',
        claimOf(bad.me, `Misdeclared${Date.now()}`, 'This must never be written.'));
    } catch (e) { refusal = String(e?.message ?? e); }

    check('a write to a misdeclaring network is REFUSED — the declaration is enforced, not decorative',
      refusal !== null);
    check('refused by DHT validation, not by a coordinator courtesy any client could skip',
      refusal !== null && /InvalidCommit|Validation failed/i.test(refusal));
    check('and the refusal names BOTH numbers, so the forgotten edit is obvious',
      refusal !== null
        && /misdeclares itself/i.test(refusal)
        && refusal.includes(String(EXPECTED + 1))
        && refusal.includes(String(EXPECTED)));
    if (refusal !== null) log(`    (${refusal.split('\n')[0].slice(0, 240)})`);
  } finally {
    // The misdeclared app is left installed on purpose: it is inert, it is
    // named for what it is, and re-installing it on every run costs a fresh
    // agent key each time. `sandbox.sh clean` removes it with everything else.
    rmSync(tmp, { recursive: true, force: true });
  }

  log('');
  if (failures === 0) log('ALL CHECKS PASSED');
  else log(`${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
