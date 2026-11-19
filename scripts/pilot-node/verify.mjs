// THE PILOT NODE — install (once), enable, and verify. PUBLISHES NOTHING.
//
// docs/open-work.md 7.29. This node exists to be reachable, not to speak:
// it installs the happ under the DESKTOP'S network seed so it lands on the
// same DHT as the released app, enables it so it joins and holds a full
// arc, and calls NO zome function. No constitution, no membrane, no join.
// Its source chain stays at genesis.
//
// DELIBERATELY NOT ~/.epi-agent. That root holds the declared automated
// agent and its AttestationGrant tenure clock, which is an instrument and
// must NOT be in the pilot. Different root, different key, different ports.
//
// Re-running this is the verification; it is idempotent.
//
// IT LIVES IN THE REPOSITORY AS OF 2026-11-19, which is 7.30's sub-`[D]`
// taken. It used to live at `~/.epi-pilot-node/verify.mjs` and nowhere
// else: unversioned, ungated, and impossible to SEND to the second
// operator who accepted on 2026-11-10. The row's own argument was that a
// check nobody else can hold is a check that strands the person it was
// written to protect. `~/.epi-pilot-node/verify.mjs` is now a symlink to
// this file, so there is one copy and the habit still works.
//
// NOTHING SECRET MOVED. The keystore, the passphrase and the conductor
// config stay in `~/.epi-pilot-node` and are not in this repository and
// must not be — that asymmetry is probably why the move was never asked
// about, so it is named here rather than left implicit.
//
// `node_modules` here is a gitignored symlink to `federation/node_modules`,
// the same convention `scripts/live-verify/` uses, which is what pins
// `@holochain/client` to one version across the repo. See README.md for
// what a second operator has to do.
import { existsSync } from 'node:fs';
import { AdminWebsocket, CellType } from '@holochain/client';
import { breakingVersion } from './breaking-version.mjs';

// EVERY PATH AND PORT THAT WAS A HOME DIRECTORY IS NOW DERIVED OR
// OVERRIDABLE, because the whole point of moving this file is that it
// runs on a machine that is not this one. The defaults are what the
// author's node has always used, so nothing changed for it.
const ADMIN = process.env.EPI_PILOT_ADMIN ?? 'ws://127.0.0.1:9499';
const APP_ID = process.env.EPI_PILOT_APP_ID ?? 'epistemic-pilot-node';
// Repo-relative rather than absolute: this file sits at
// scripts/pilot-node/, so the packed bundle is two levels up. It is
// GITIGNORED and built by `scripts/pack-webhapp.sh` — needed only on the
// run that INSTALLS, so a missing bundle is not an error on any later run.
const HAPP = process.env.EPI_PILOT_HAPP
  ?? new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;

// ───────────────────────────────────────────────────────────────────────
// IS THIS NODE ON THE NETWORK THE RELEASED APP IS ON?  (open-work 7.30)
//
// THIS USED TO BE A PASTED CONSTANT AGAINST A PASTED CONSTANT, and that
// is the defect 7.30 was opened for. `SEED` was hand-written here and
// `RELEASED_DNA` was hand-copied from the same reading, while the `dna`
// it was compared against is read off the ALREADY-INSTALLED cell. Both
// sides were frozen at install time, so once the line had printed YES it
// could not print anything else, whatever the desktop went on to release
// — a one-time install-time assertion reprinted every run in the present
// tense. Run on 2026-11-17 it printed YES and was right, which is the
// only reason it was invisible.
//
// Now ONE side is derived from the live release and the OTHER is read
// from the running conductor, so the two can disagree:
//
//   expected  = productName + '-' + breakingVersion(github /latest tag)
//   installed = getDnaDefinition(cell).modifiers.network_seed
//
// The expected side moves the day a release lands. The installed side
// cannot move without a reinstall. That asymmetry is the whole check.
//
// IT IS STILL VACUOUS ON THE RUN THAT INSTALLS — the install uses the
// derived seed, so the first comparison is a tautology. It is a real
// measurement on every run after that one, which is every run this node
// will ever do.
//
// WHY productName IS STILL A CONSTANT, and why that is not the same
// mistake: it is not version-derived and a release does not change it.
// It CANNOT be lifted off the release assets — electron-builder
// sanitises the space out of them ('Epistemic-Resonance-0.3.6-mac.zip',
// 'Epistemic.Resonance-0.3.6-mac.zip.blockmap'), while the seed uses the
// raw 'Epistemic Resonance' WITH the space. Deriving it from a filename
// would produce a confidently wrong seed.
const PRODUCT_NAME = 'Epistemic Resonance';
const RELEASES_LATEST =
  'https://api.github.com/repos/StateofIntent/epistemic-resonance-desktop/releases/latest';

// FAIL LOUD RATHER THAN FALL BACK. Limit (2) in 7.30: if this cannot read
// the release it must say so and stop. Falling back to a pasted constant
// would recreate the original defect with more code around it, and the
// person it would deceive is a second operator who cannot see this file.
// Unauthenticated on purpose — the repo is public, so a second operator
// needs no `gh` and no token.
async function expectedSeed() {
  let res;
  try {
    res = await fetch(RELEASES_LATEST, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'epi-pilot-node-verify' },
    });
  } catch (e) {
    throw new Error(`cannot reach github to read the released version: ${e.message}`);
  }
  if (!res.ok) throw new Error(`github returned ${res.status} for ${RELEASES_LATEST}`);
  const rel = await res.json();
  const tag = rel.tag_name;
  if (!tag) throw new Error('github /latest returned no tag_name');
  return { tag, seed: `${PRODUCT_NAME}-${breakingVersion(tag)}` };
}

// Read the release BEFORE touching the conductor: on a first run the
// install needs the derived seed, and on every run a release we cannot
// read means we cannot answer the question this script exists to answer.
let EXPECTED;
try {
  EXPECTED = await expectedSeed();
} catch (e) {
  console.error(`CANNOT VERIFY — ${e.message}`);
  console.error('  No pasted fallback by design (open-work 7.30, limit 2).');
  process.exit(1);
}

const b64 = (k) => 'uhC0k' + Buffer.from(k).subarray(3).toString('base64url');
const admin = await AdminWebsocket.connect({ url: new URL(ADMIN), wsClientOptions: { origin: '*' } });

let apps = await admin.listApps({});
if (!apps.find((a) => a.installed_app_id === APP_ID)) {
  if (!existsSync(HAPP)) {
    console.error(`CANNOT INSTALL — no happ bundle at ${HAPP}`);
    console.error('  It is gitignored and built, not committed. From the repo root:');
    console.error('    ./scripts/pack-webhapp.sh');
    console.error('  Or point EPI_PILOT_HAPP at a bundle you already have.');
    await admin.client.close();
    process.exit(1);
  }
  const key = await admin.generateAgentPubKey();
  await admin.installApp({ source: { type: 'path', value: HAPP }, agent_key: key,
                           installed_app_id: APP_ID, network_seed: EXPECTED.seed });
  await admin.enableApp({ installed_app_id: APP_ID });
  console.log(`installed and enabled under seed '${EXPECTED.seed}'`);
  apps = await admin.listApps({});
}

const app = apps.find((a) => a.installed_app_id === APP_ID);
let cellId;
for (const cells of Object.values(app.cell_info))
  for (const c of cells) if (c?.type === CellType.Provisioned) cellId = c.value.cell_id;

const dna = b64(cellId[0]);
const def = await admin.getDnaDefinition(cellId);
const installedSeed = def.modifiers.network_seed;
const infos = await admin.agentInfo({ cell_id: cellId });
const parsed = infos.map((i) => { try { const o = JSON.parse(i); return JSON.parse(o.agentInfo ?? i); } catch { return {}; } });
// agentInfo reports the 32-byte CORE, not the 39-byte holo-hash: take
// bytes 3..35, or the node reports itself as a peer.
const mine = Buffer.from(cellId[1]).subarray(3, 35).toString('base64url');
const self = parsed.find((p) => p.agent === mine);

const onReleasedDht = installedSeed === EXPECTED.seed;

console.log(`  app status        : ${JSON.stringify(app.status)}`);
console.log(`  released tag      : ${EXPECTED.tag} (github /latest, read just now)`);
console.log(`  expected seed     : ${EXPECTED.seed} (derived from that tag)`);
console.log(`  installed seed    : ${installedSeed} (read off this conductor's cell)`);
console.log(`  on released DHT   : ${onReleasedDht ? 'YES' : 'NO — WRONG NETWORK'}`);
console.log(`  dna               : ${dna}`);
console.log(`  agent             : ${mine}`);
console.log(`  storage arc       : ${self ? JSON.stringify(self.storageArc) : 'no self record yet'}`);
console.log(`  peers known       : ${infos.length} (including self)`);
for (const p of parsed) if (p.agent && p.agent !== mine) console.log(`    peer            : ${p.agent}`);

// THE PROMISE OF THIS NODE, MEASURED RATHER THAN ASSERTED. It publishes
// nothing: no Claim, no Constitution, no Membrane, no join. A chain of
// genesis records only — Dna, AgentValidationPkg, AgentPubKey — and ZERO
// App entries. If this ever prints otherwise, something called a zome
// function on this node and the row's whole argument has changed.
const state = await admin.dumpFullState({ cell_id: cellId, dht_ops_cursor: undefined });
const records = state.source_chain_dump.records;
const appEntries = records.filter((r) => r.entry?.entry_type === 'App').length;
console.log(`  own chain         : ${records.length} records, ${appEntries} App entries`);
console.log(`  publishes nothing : ${appEntries === 0 ? 'HOLDS' : 'VIOLATED — ' + appEntries + ' app entries on this chain'}`);
await admin.client.close();

// THIS DETECTS; IT CANNOT MIGRATE — limit (1) in 7.30. A new seed is a
// new cell with a new agent key and an EMPTY CHAIN, so the response to a
// NO is a reinstall and this node's tenure starts over. That is a cost
// worth knowing BEFORE a bump, which is the point of saying it here.
//
// AND ONE THING THE SEED CHECK STILL DOES NOT COVER, stated rather than
// papered over: the DNA hash is a hash of the integrity zomes AND the
// modifiers. A PATCH release that changed an integrity zome would keep
// the seed '0.3.x', split the network anyway, and this check would say
// YES. `breakingVersion` IS the project's assertion that patches do not
// do that; nothing here verifies it, and nothing can — the release
// publishes installers, not the .happ, so there is no released DNA hash
// to read. The old `RELEASED_DNA` constant did not verify it either: it
// was a paste, which is why it is gone rather than kept.
if (!onReleasedDht) {
  console.error('');
  console.error(`WRONG NETWORK: this node is serving '${installedSeed}' while the released`);
  console.error(`app (${EXPECTED.tag}) is on '${EXPECTED.seed}'. It is reachable, healthy, and`);
  console.error('alone. Fix is a REINSTALL under the new seed — a new agent key and an');
  console.error('empty chain. Delete the app and re-run:');
  console.error(`  node -e "…admin.uninstallApp({ installed_app_id: '${APP_ID}' })" && node verify.mjs`);
  process.exit(2);
}
process.exit(0);
