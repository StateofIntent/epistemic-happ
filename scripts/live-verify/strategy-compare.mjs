#!/usr/bin/env node
// ============================================================================
// strategy-compare.mjs — IS THE STALL ON THE NETWORK PATH SPECIFICALLY?
//
// The third and last probe for the failure reported upstream as
// holochain/holochain#6012: a conductor that restarts and dials a peer it
// remembers, which is now gone, fails `get_links` with
//
//     Ribosome: RuntimeError: host_fn::get_links:72:
//     Host("iroh connect timed out (src: deadline has elapsed)")
//
// stall-bisect.mjs established the trigger and stall-threshold.mjs the ~20s
// window. Both used this project's own zomes, where every read passes
// GetStrategy::Network. This one asks whether the strategy is the thing, using
// a MINIMAL two-zome hApp with the identical query exposed twice -- once
// Network, once Local.
//
// Measured, three runs each on a fresh network:
//
//     GetStrategy::Local      3/3 ok,     0.01s each
//     GetStrategy::Network    3/3 failed, 86.1s each
//
// Local returns whatever is in local storage, so it is NOT a drop-in
// substitute -- it answers a different question. The comparison is only about
// which call completes.
//
// Requires the minimal hApp, which is not in this repository. Build it from
// the source in the upstream issue, then point EPI_HAPP_PATH at it. Run as
// WHICH=local or WHICH=network.
//
// Asserts nothing. Prints one line. Not in CI.
// ============================================================================

// ONE STRATEGY PER RUN, each on a fresh network and a fresh connection.
//
// The first attempt called both strategies on one connection inside one
// window. That cannot work. After the ribosome error the app websocket is
// unusable: the next callZome never reaches the conductor at all (zero
// mentions in its log), and the client's per-call timeout does not fire --
// it hung for 47 minutes. So the second call is poisoned by the first in
// EITHER order, and the only clean comparison is one call per run.
import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { execFileSync } from 'node:child_process';

const N = {
  A: { admin: 8899, app: 8898, id: 'epistemic-net-a' },
  B: { admin: 8897, app: 8896, id: 'epistemic-net-b' },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const net = (...a) => execFileSync('scripts/network.sh', a, {
  stdio: 'pipe',
  env: { ...process.env, EPI_HAPP_PATH: process.env.EPI_HAPP_PATH ?? '/tmp/hc-min-repro/minrepro.happ' },
});

async function conn(k) {
  const { admin: ap, app: pp, id } = N[k];
  const ad = await AdminWebsocket.connect({ url: new URL(`ws://localhost:${ap}`), wsClientOptions: { origin: 'live-verify' } });
  const { token } = await ad.issueAppAuthenticationToken({ installed_app_id: id });
  const app = await AppWebsocket.connect({ url: new URL(`ws://localhost:${pp}`), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const ids = [];
  for (const rc of Object.values(info.cell_info))
    for (const c of rc) if (c?.type === CellType.Provisioned) ids.push(c.value.cell_id);
  for (const i of ids) {
    for (let n = 0; n < 30; n++) {
      try { await ad.authorizeSigningCredentials(i); break; }
      catch (e) { if (!String(e.message ?? e).includes('CellDisabled')) throw e; await sleep(1000); }
    }
  }
  return { call: (f, p) => app.callZome({ role_name: 'minrepro', zome_name: 'minrepro_coordinator', fn_name: f, payload: p }, 120000) };
}

const WHICH = process.env.WHICH ?? 'network';

net('clean'); net('start');
const A = await conn('A');
net('stop-node', 'nodeB');
await A.call('create_thing', 'x');
net('stop-node', 'nodeA');
net('start-node', 'nodeB');
const B = await conn('B');

const t = Date.now();
let out;
try {
  const r = await B.call(`count_${WHICH}`, null);
  out = `ok in ${((Date.now() - t) / 1000).toFixed(2)}s -> ${r} link(s)`;
} catch (e) {
  out = `FAILED after ${((Date.now() - t) / 1000).toFixed(1)}s -> ${String(e?.message ?? e).split('\n')[0].slice(0, 160)}`;
}
console.log(`RESULT count_${WHICH}: ${out}`);
net('start-node', 'nodeA');
process.exit(0);
