#!/usr/bin/env node
// ============================================================================
// stall-threshold.mjs — HOW LONG AFTER A RESTART DOES THE WASM CRASH LAST?
//
// stall-bisect.mjs established the crash: the first zome call after nodeB's
// first restart in a clean network fails with `Wasm runtime error while
// working with Ribosome: RuntimeError`, 8 of 8 across three provenances, and
// the next call answers in 0.00s. It did NOT explain why partition-rejoin
// passes locally on the same conditions.
//
// THE UNTESTED DIFFERENCE IS A SLEEP. partition-rejoin waits its dwell (15s,
// or 5x a measured baseline) between starting nodeB and taking the read.
// stall-bisect reads immediately. If the crash is a cold-start window that
// clears after some seconds, that single difference explains the local
// passes, the CI failures on a slower machine, and the 8-of-8 here, all at
// once. This finds the number.
//
// WHY THE DELAY IS MEASURED FROM start-node AND NOT FROM THE SLEEP. Opening
// the admin socket, issuing a token, opening the app socket, reading appInfo
// and retrying authorizeSigningCredentials past CellDisabled all take real
// time, and that time is already part of whatever window exists. A "0s"
// delay measured from the sleep would in truth be several seconds after the
// restart and the threshold would read low. So each trial records the elapsed
// time since start-node returned and sleeps only the remainder.
//
// THE PROVENANCE USED IS `absent` -- nodeB offline while nodeA writes, so the
// anchor is on the DHT and nodeB holds nothing -- because that is
// partition-rejoin Phase 2 exactly. Provenance was shown not to matter, so
// the one that matches the real harness is the one to use.
//
// Asserts nothing. Prints a table. Not in CI. One clean network per trial,
// so every trial gets a genuine first restart.
// ============================================================================
import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { execFileSync } from 'node:child_process';

const NODES = {
  A: { node: 'nodeA', admin: 8899, app: 8898, appId: 'epistemic-net-a' },
  B: { node: 'nodeB', admin: 8897, app: 8896, appId: 'epistemic-net-b' },
};
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const net = (...args) => execFileSync('scripts/network.sh', args, { stdio: 'pipe' });
const nowMicros = () => Date.now() * 1000;

const READ_TIMEOUT_MS = Number(process.env.READ_TIMEOUT_MS ?? 180_000);
const DELAYS_S = (process.env.DELAYS_S ?? '0,2,5,10,15,20,30').split(',').map(Number);
const ROUNDS = Number(process.env.ROUNDS ?? 1);

async function connect(name) {
  const { admin: adminPort, app: appPort, appId } = NODES[name];
  const admin = await AdminWebsocket.connect({ url: new URL(`ws://localhost:${adminPort}`), wsClientOptions: { origin: 'live-verify' } });
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: appId });
  const app = await AppWebsocket.connect({ url: new URL(`ws://localhost:${appPort}`), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const ids = [];
  for (const roleCells of Object.values(info.cell_info))
    for (const cell of roleCells) if (cell?.type === CellType.Provisioned) ids.push(cell.value.cell_id);
  for (const id of ids) {
    for (let i = 0; i < 30; i++) {
      try { await admin.authorizeSigningCredentials(id); break; }
      catch (e) { if (!String(e.message ?? e).includes('CellDisabled')) throw e; await sleep(1000); }
    }
  }
  return {
    name, me: ids[0][1],
    call: (fn, payload) => app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload }, READ_TIMEOUT_MS),
  };
}

async function trial(delayS, label) {
  net('clean'); net('start');
  const DOMAIN = `Thresh${Date.now()}`;
  const A = await connect('A');

  net('stop-node', 'nodeB');
  await A.call('create_claim', {
    content: 'threshold sweep', domain: DOMAIN, confidence: 'Moderate', semantic_tags: [],
    author: A.me, timestamp: nowMicros(), evidence_hashes: [], attestation_policy: null,
  });
  net('stop-node', 'nodeA');

  net('start-node', 'nodeB');
  const started = Date.now();                      // the clock that matters
  const B = await connect('B');
  const connectCost = Date.now() - started;
  const remaining = delayS * 1000 - connectCost;
  if (remaining > 0) await sleep(remaining);
  const sinceStart = Date.now() - started;

  const t0 = Date.now();
  let res;
  try { res = { ms: Date.now() - t0, got: (await B.call('get_claims_by_domain', DOMAIN)).length, err: null }; }
  catch (e) { res = { ms: Date.now() - t0, err: String(e?.message ?? e).split('\n')[0].slice(0, 54), got: null }; }
  const crashed = !!res.err;
  log(`    [${label}] read at t+${(sinceStart / 1000).toFixed(1)}s since start-node (connect took ${(connectCost / 1000).toFixed(1)}s): ` +
      (crashed ? `CRASHED after ${(res.ms / 1000).toFixed(1)}s — ${res.err}` : `ok in ${(res.ms / 1000).toFixed(2)}s, got ${res.got}`));
  return { delayS, sinceStart, crashed };
}

async function main() {
  log(`delays: ${DELAYS_S.join(', ')}s   rounds each: ${ROUNDS}   read ceiling: ${READ_TIMEOUT_MS / 1000}s`);
  const all = [];
  for (const d of DELAYS_S) {
    log(`\n--- target delay ${d}s ---`);
    for (let r = 1; r <= ROUNDS; r++) all.push(await trial(d, `${d}s r${r}`));
  }
  log('\n=== CRASH RATE BY DELAY ===');
  for (const d of DELAYS_S) {
    const rows = all.filter((x) => x.delayS === d);
    const c = rows.filter((x) => x.crashed).length;
    const actual = rows.map((x) => (x.sinceStart / 1000).toFixed(1)).join(', ');
    log(`  target ${String(d).padStart(2)}s  ->  ${c}/${rows.length} crashed   (actual t+ ${actual}s)`);
  }
  // REPORTING A BRACKET REQUIRES THE TWO ENDS TO BE DIFFERENT DELAYS.
  //
  // The first version of this took the worst crash and the best pass and
  // printed the interval between them. When one delay produces BOTH -- which
  // is what a race at the boundary looks like, and 20s gave 2 crashes and 1
  // pass -- it printed "between t+20.0s and t+20.0s", a zero-width interval
  // stated with full confidence. A boundary that straddles a delay is the
  // most informative result this probe can produce and it was the one case
  // the summary could not say.
  const crashed = all.filter((x) => x.crashed);
  const passed = all.filter((x) => !x.crashed);
  log('');
  if (crashed.length === 0) {
    log('  NOTHING CRASHED — the window did not reproduce at any delay in this sweep.');
  } else if (passed.length === 0) {
    log('  EVERYTHING CRASHED — the window is longer than the largest delay swept.');
  } else {
    const lastCrash = Math.max(...crashed.map((x) => x.delayS));
    const firstCleanAbove = Math.min(...passed.filter((x) => x.delayS > lastCrash).map((x) => x.delayS));
    const mixed = DELAYS_S.filter((d) => {
      const rows = all.filter((x) => x.delayS === d);
      return rows.some((x) => x.crashed) && rows.some((x) => !x.crashed);
    });
    log(`  Last delay with any crash: ${lastCrash}s. First clean delay above it: ${Number.isFinite(firstCleanAbove) ? `${firstCleanAbove}s` : 'none'}.`);
    if (mixed.length > 0) {
      log(`  STRADDLED at ${mixed.join(', ')}s — both crashes and passes at the same delay, so this`);
      log('  is a race at the boundary rather than a clean cutoff. A floor set AT a straddled');
      log('  delay is not safe; set it well above.');
    }
    const n = passed.filter((x) => x.delayS > lastCrash).length;
    if (n > 0) log(`  No crash observed above ${lastCrash}s in ${n} trial(s) — a bound, not a guarantee.`);
  }
  net('start-node', 'nodeA');
}

main().catch((e) => { console.error('\nPROBE ERROR:', e); try { net('start-node', 'nodeA'); } catch {} process.exit(1); });
