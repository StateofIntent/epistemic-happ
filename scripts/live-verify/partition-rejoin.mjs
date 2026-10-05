#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/partition-rejoin.mjs — DOES A NODE THAT MISSED WRITES
// CATCH UP WHEN IT COMES BACK?
//
// WHY THIS EXISTS. real-gossip.mjs proved an entry written on one
// conductor reaches another over a real network, with both nodes up the
// whole time. That is the easy half. A network whose participants are
// never offline is not a network anyone runs: laptops close, processes
// restart, links drop. The property that actually matters for a protocol
// built on "nothing is deleted, only witnessed" is that a node which was
// AWAY while history was written does not stay ignorant of it.
//
// Nothing had tested that. This harness does, and it partitions in both
// directions rather than one, because a one-sided test cannot distinguish
// "the returning node catches up" from "the node that stayed up pushes to
// whoever appears" — two different mechanisms with the same happy path.
//
// THE SHAPE OF THE TEST. Stopping a conductor is the partition. That is
// deliberate: it is unambiguous, and it is what actually happens in
// practice. Blocking traffic between two processes that are both still
// running is a different and murkier experiment, since either may hold an
// already-negotiated QUIC connection that no longer depends on the
// signal server it was introduced by.
//
//   Phase 0  Both up. A claim crosses A -> B. This is the baseline: if
//            the network is not healthy BEFORE the partition, nothing
//            after it can be interpreted.
//   Phase 1  nodeB stopped. nodeA writes claimA. nodeB never saw it and
//            could not have — it was not running when it was written.
//   Phase 2  nodeA stopped, THEN nodeB started, in that order so the two
//            are never up together. nodeB is confirmed NOT to hold
//            claimA — this is the divergence, and it is the check that
//            makes the whole run mean something, so it waits several
//            times the crossing time Phase 0 measured before asserting
//            the absence. nodeB writes claimB, which nodeA never saw.
//   Phase 3  nodeA restarted. Both up for the first time since Phase 0.
//   Phase 4  Do they converge? nodeA must acquire claimB and nodeB must
//            acquire claimA. Both directions, measured CONCURRENTLY from
//            one shared clock — see the note at the call site for why
//            measuring them in sequence produces a true-but-misleading
//            second number.
//   Phase 5  A claim written AFTER healing propagates normally — so the
//            link is genuinely healed and not merely backfilled once.
//
// nodeC, on its own DHT, stays up throughout and must never see any of
// it. It is the same control real-gossip.mjs uses and it does the same
// job: without it, "nodeB has claimA" cannot be separated from "any
// conductor pointed at these services ends up with everything."
//
// Prereqs: scripts/network.sh clean && scripts/network.sh start, and a
// packed .happ at the repo root (scripts/pack-webhapp.sh). This harness
// stops and starts conductors via scripts/network.sh stop-node/start-node,
// so it needs that network and not scripts/sandbox.sh's conductor.
//
// SAFE TO RE-RUN without cleaning, for the same reasons real-gossip.mjs
// is: every check is scoped to a domain minted from Date.now(), and
// create_claim spends no SWO friction budget. It does leave the network
// running with all three nodes up, whatever phase it failed in.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing, and the
// first injection found a real defect IN THIS FILE rather than confirming
// it was already sound.
//
//   Regression injected: both `stop-node` calls removed, so no partition
//   ever happened and all three nodes stayed up throughout.
//   Result, FIRST TIME: the two "is genuinely down" checks went red, as
//   they should — and the DIVERGENCE check, the one that carries the
//   entire meaning of the run, STAYED GREEN. It read nodeB immediately
//   after nodeA's write, sooner than the ~5s a claim actually takes to
//   cross, so it observed zero for a reason that had nothing to do with
//   any partition. The label said "it was never up alongside nodeA"; the
//   assertion tested "nothing has arrived yet." That is this directory's
//   recorded failure mode — a check whose label claims more than its
//   assertion tests — and it was live here until the injection exposed
//   it. Fixed by waiting several times the crossing time Phase 0 measures
//   on the same network before asserting the absence.
//   Result, AFTER THE FIX: the same injection turns the DIVERGENCE check
//   red too, which is the only reason its passing means anything.
//
//   Regression injected: nodeB's entry in NODES pointed at nodeC's ports,
//   so the "peer" was a conductor on a different DHT.
//   Result: the same-DHT and distinct-agent-key checks went red and the
//   run aborted before partitioning anything, printing all three DNA
//   hashes. Exit 1.
//
//   Restored and re-run: 23 checks green, catch-up measured at 326.6s in
//   both directions.
//
//   --- `readOrExplain`'s three branches, each watched printing ---
//
//   All three were injected against three real local conductors, because
//   this diagnosis only ever runs on a failing run and an untested
//   diagnostic is a guess with formatting. The injected throw fires
//   immediately rather than after a real 60s hang, so the "after 0.0s"
//   in these outputs is an artefact of the injection; the elapsed figure
//   is real only in a real hang.
//
//   Injection: the divergence read throws, nodeB left running.
//   Result: "nodeB'S ADMIN PORT STILL ANSWERS, so the conductor is UP".
//   This is the branch the two 2026-10-05 CI failures actually hit.
//
//   Injection: nodeB stopped, then the read throws.
//   Result: "ADMIN PORT IS ALSO REFUSING, so the conductor is GONE".
//
//   Injection: the probe aimed at a socket that accepts TCP and never
//   speaks, which is what a wedged admin port looks like at the transport
//   layer.
//   Result: "DID NOT ANSWER OR REFUSE within 10s either". This branch
//   exists BECAUSE of what the first version of this code would have done
//   here: `portRefuses` reports "refusing" for any unsuccessful connect, a
//   hung one included, so a wedged conductor would have been diagnosed as
//   GONE — sending somebody to investigate an exited process that was in
//   fact still running. A diagnostic that confidently names the wrong
//   cause is worse than one that says nothing, so the probe is bounded and
//   answers three ways instead of two.
//
//   TWO DEFECTS IN THIS DIAGNOSTIC WERE FOUND BY RUNNING IT, not by
//   reading it, which is the whole argument for injecting an error path.
//   It first advised `scripts/network.sh logs nodeB` — there is no `logs`
//   subcommand, so following the advice would have failed; it now names
//   the file, $NET_ROOT/nodeB.log. The fix for that then rendered as
//   literal source text, because `$\{` in a template literal is an escaped
//   brace and not an interpolation. `node --check` accepts both happily:
//   valid syntax, wrong output, in the one code path that only runs when
//   something else has already gone wrong.
//
//   Restored and re-run with all three branches in place: 25 checks green,
//   catch-up 55.3s in both directions. (The 23 recorded above is from an
//   earlier commit and is left as written; 25 is what this run measured.)
//
//   --- the dwell cap, and the defect the FIX itself shipped ---
//
//   Injection: base.ms forced to 396_000, the real figure from CI run
//   37266214567 on main.
//   Result, FIRST VERSION OF THE FIX: the new baseline check went red and
//   the dwell capped at 300s as intended — AND THE DIVERGENCE CHECK PRINTED
//   A CLEAN PASS, labelled "after long enough that it would have arrived",
//   on a run where the dwell was 300s and the crossing takes 396s. That
//   label was false and the line read as a sound result. It is the failure
//   mode recorded at the top of this block, committed a second time by the
//   change written to guard against it: capping a derived value is not
//   enough on its own, because every claim derived from it has to be
//   re-examined too. Found by running the injection, not by reading it.
//   Result, AFTER THE FIX: the divergence line reports INCONCLUSIVE and is
//   counted as neither pass nor failure. Passing it would be a lie; failing
//   it would double-count one cause, since the run is already red on the
//   baseline check, which is the thing actually wrong.
//
//   Restored and re-run on the healthy path: 26 checks green, dwell 25s from
//   a 5.1s baseline, catch-up 50.3s / 40.2s. 26 rather than 25 because the
//   baseline check is new; the dwell on a healthy run is unchanged.
//
//   Why the baseline check is the one that fails, rather than this being
//   handled by a longer budget: a dwell long enough to be sound after a
//   396s baseline is 1980s, and that does not fit the job. A runner that
//   cannot measure the property should say so in seconds, not sleep for 33
//   minutes and then report a pass.
//
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { decode } from '@msgpack/msgpack';
import { execFileSync } from 'node:child_process';

const NETWORK_SH = new URL('../network.sh', import.meta.url).pathname;

const NODES = {
  A: { node: 'nodeA', admin: 8899, app: 8898, appId: 'epistemic-net-a' },
  B: { node: 'nodeB', admin: 8897, app: 8896, appId: 'epistemic-net-b' },
  C: { node: 'nodeC', admin: 8895, app: 8894, appId: 'epistemic-net-c' },
};

// THE WINDOW WAS SIZED FROM A CONSTANT THAT NO LONGER EXISTS, AND IS NOW JUST
// GENEROUS. This paragraph used to say the window was derived from the
// conductor's own backoff config:
//
//     gossip_peer_on_success_next_gossip_delay_ms: 60000    (1 min)
//     gossip_peer_on_error_next_gossip_delay_ms:  300000    (5 min)
//
// Those are real, and they are `kitsune_p2p_types` 0.4.4 — kitsune1, the
// substrate this project ran when the 326.6s catch-up below was measured.
// `gossip_peer_on_error_next_gossip_delay_ms` appears nowhere in kitsune2 0.5,
// which is what Holochain 0.7 uses and what this harness now runs against.
// kitsune2's gossip config has no per-peer error backoff at all; its defaults
// are `initiate_interval_ms: 120_000`, `initiate_jitter_ms: 10_000`,
// `min_initiate_interval_ms: 300_000` (a floor on re-initiating with the SAME
// peer, not a penalty for a failed attempt — it merely shares the number) and
// `round_timeout_ms: 15_000`.
//
// MEASURED ON 0.7, TWICE, WITH nodeD DOWN — the two-member arrangement the old
// figure is attributed to: catch-up of 50.4s/40.3s and then 55.4s/55.3s from a
// freshly cleaned network, against the 326.6s and 326.7s recorded on 0.4.4.
// README §9 carries the full account.
//
// 600s therefore stays, but as headroom rather than as a figure derived from
// anything: it is ten times the largest catch-up now observed here, and the
// cost of it being generous is nil, since the loop exits as soon as the claim
// arrives. What a window must NOT be is short: an earlier version used 180s and
// was on course to report a convergence failure that would really have been
// impatience, which is why a too-short timeout is worse than no result.
const CONVERGE_WINDOW_MS = 600_000;

// AN UNBOUNDED MULTIPLIER ON A MEASURED VALUE ALMOST ATE A WHOLE JOB.
//
// The dwell below was `base.ms * 5` with no ceiling, on the reasoning that a
// dwell derived from a real crossing beats a guessed one. That reasoning is
// right and is kept. What it did not account for is a PATHOLOGICAL baseline.
//
// On 2026-10-05, run 37266214567 on main, Phase 0 took 396.0s to cross
// nodeA -> nodeB with both nodes up and nothing partitioned. Five times that
// is 1980s, so the harness then slept 33 MINUTES, and the job finished in
// 44.1 of its 45 allotted minutes — 53 SECONDS OF MARGIN. (Phases 3 and 4
// share one clock, so the waits after the dwell are one window and not two;
// the cap does not make the worst case comfortable, only bounded.) A baseline ten per
// cent slower would have hit the ceiling, and a job killed at the ceiling
// reports a bare timeout: no harness summary, no restore step, and none of
// the instrumentation this file carries for exactly that moment.
//
// So the dwell is capped. But capping it alone would quietly reintroduce the
// defect this file's own negative-evidence block records: the divergence
// check is only meaningful if the dwell OUTLASTS gossip, and a dwell shorter
// than the measured crossing makes "after long enough that it would have
// arrived" false. Passing it then would be a label claiming more than its
// assertion tests, which is this directory's named failure mode.
//
// Hence the pair. The dwell is bounded, AND a baseline too slow for a sound
// 5x dwell inside the budget is itself a failed check rather than 33 minutes
// of silence. That is the honest report: this runner could not measure the
// property today, and the reason is named. It also makes the 396s visible —
// the real news in that run, which scrolled past as one unremarkable line
// while the 33-minute sleep looked like the anomaly.
const DWELL_CAP_MS = 300_000;
const MAX_SOUND_BASELINE_MS = DWELL_CAP_MS / 5;

// THE FLOOR WAS 15s AND 15s IS INSIDE A CONDUCTOR CRASH WINDOW.
//
// This floor exists so a fast baseline still gets some dwell. It turned out
// to be selecting for a failure. scripts/live-verify/stall-threshold.mjs
// measured when a restarted conductor stops crashing on its first zome call:
//
//     t+0s .. t+20s   crashed (20s straddles: 2 crashes, 1 pass in 3)
//     t+25s, 30s, 35s no crash in 9 trials
//
// All three CI failures crossed their baseline in 0.0s, so `base.ms * 5` was
// zero and the dwell fell to the 15s floor -- squarely inside the window.
// Local runs measured a 5.1s baseline, got a 25s dwell, and passed. So THE
// FASTER THE NETWORK, THE SHORTER THE DWELL, AND THE MORE LIKELY THE CRASH,
// which is why this read as random for months: it preferentially hit the
// healthiest runs.
//
// 45s is a floor above a STRADDLED boundary, not just past it: more than
// twice the last delay at which a crash was seen, and the 25s that local runs
// were passing on was only 5s clear of a race. It costs a fast-baseline run
// 30 extra seconds and nothing else, since a longer dwell can only help the
// divergence assertion this is for.
//
// SAID PLAINLY: THIS IS A WORKAROUND FOR SOMEBODY ELSE'S DEFECT, not a fix.
// The bug is a wasm crash inside the conductor, the dwell exists to make the
// divergence assertion sound, and the two have nothing to do with each other.
// This floor is now load-bearing for an unrelated reason and that is exactly
// the kind of silent coupling #166 was about -- so it is written down here
// rather than left for somebody to discover by shortening it.
const DWELL_FLOOR_MS = 45_000;
const POLL_MS = 5_000;

// WATCH PAST THE WINDOW BEFORE GIVING UP, for the reason real-gossip.mjs's own
// copy of this explains at length. Short version: this harness's BASELINE
// crossing was two of the four `network` job failures on 2026-09-12 — the same
// nodeA -> nodeB crossing exceeding the same 330s, with the conductors logging a
// gossip round whose Accept arrived after the initiator's 15s `round_timeout_ms`.
//
// Two fixes are possible and the evidence does not yet choose: either the op
// arrives given more time, so the WINDOW is the constraint, or it never does and
// `roundTimeoutMs` is too tight for a 2-vCPU runner. Instrumenting only
// real-gossip.mjs would have covered half the failures, which is why this is
// here too.
//
// Reported as a ::warning:: and then the setup failure proceeds unchanged: the
// run is already lost, and this only records which fix it wanted.
const OBSERVE_PAST_WINDOW_MS = 300_000;

const b64 = (u8) => Buffer.from(u8).toString('base64');
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowMicros = () => Date.now() * 1000;

let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

// PUTTING THE NETWORK BACK IS EVERY EXIT PATH'S JOB, AND IT WAS NO PATH'S. This
// harness stops nodeB in phase 1 and nodeA in phase 2, and every other harness
// in this directory expects to find its three nodes up. `setupFail` exited
// straight out, and `main().catch` did nothing at all, so a failure anywhere
// after phase 1 left a conductor down — and the cost is paid by whoever runs a
// harness NEXT, which is how it stays invisible to the run that caused it.
//
// `transitive-gossip.mjs` had the same hole and it was watched twice: a run
// aborted after its own `stop-node` left the next invocation dying before its
// first check on `could not connect to Holochain Conductor API at
// ws://localhost:8897/`, a websocket stack trace for a network the previous run
// had dismantled.
//
// DELIBERATELY NOT VIA `net`. `net` calls `setupFail` when a command fails, and
// `setupFail` calls this, so routing the restore through it would recurse on the
// first failure. It execs directly and guards against re-entry.
//
// nodeD is not touched: this harness never starts it, so stopping it here would
// be reaching outside what this run changed.
let restoring = false;
function restoreNetwork(why) {
  if (restoring) return false;
  restoring = true;
  log(`\n--- Restoring the network (${why}) ---`);
  let ok = true;
  for (const n of ['nodeA', 'nodeB', 'nodeC']) {
    try {
      execFileSync('bash', [NETWORK_SH, 'start-node', n], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      ok = false;
      log(`    COULD NOT restart ${n}: ${String(e.stderr || e.message).split('\n')[0].slice(0, 160)}`);
    }
  }
  log(ok
    ? '    nodeA, nodeB and nodeC are up — the shape every other harness expects'
    : '    RESTORE INCOMPLETE. Run: scripts/network.sh clean && scripts/network.sh start');
  restoring = false;
  return ok;
}

function setupFail(lines) {
  log('');
  for (const l of lines) log(`  SETUP FAILED: ${l}`);
  // Before exiting, not after. The next harness to run is entitled to the
  // network this one was handed.
  restoreNetwork('after a setup failure');
  log('');
  log('  If the network itself is wrong, rebuild it:');
  log('    scripts/network.sh clean && scripts/network.sh start');
  process.exit(1);
}

const net = (...args) => {
  try {
    return execFileSync('bash', [NETWORK_SH, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    setupFail([
      `scripts/network.sh ${args.join(' ')} failed.`,
      String(e.stderr || e.stdout || e.message).trim().split('\n').slice(-5).join('\n  '),
    ]);
  }
};

// Connecting is retried on CellDisabled for the same reason it is in
// real-gossip.mjs, and it matters more here: this harness restarts
// conductors on purpose, and a restarted one reports both its ports up
// while its cell is still coming back. Duplicated rather than shared
// because every harness in this directory is deliberately standalone —
// see the directory README — but the two copies must stay in step.
async function connectNode(name) {
  const { admin: adminPort, app: appPort, appId } = NODES[name];
  let admin;
  try {
    admin = await AdminWebsocket.connect({
      url: new URL(`ws://localhost:${adminPort}`),
      wsClientOptions: { origin: 'live-verify' },
    });
  } catch (e) {
    setupFail([`node${name}'s admin port ${adminPort} did not answer (${e.message}).`]);
  }
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: appId });
  const app = await AppWebsocket.connect({
    url: new URL(`ws://localhost:${appPort}`),
    token,
    wsClientOptions: { origin: 'live-verify' },
  });
  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      // CellInfo became a discriminated union in @holochain/client
      // 0.21 ({ type, value }); it used to be keyed by cell type. The
      // old `CellType.Provisioned in cell` test matches nothing against
      // the new shape, silently yielding no cell ids at all.
      if (cell?.type === CellType.Provisioned) cellIds.push(cell.value.cell_id);
    }
  }
  if (cellIds.length === 0) setupFail([`App "${appId}" on node${name} has no provisioned cells.`]);
  for (const cellId of cellIds) {
    let lastErr;
    for (let attempt = 0; attempt < 30; attempt++) {
      try { await admin.authorizeSigningCredentials(cellId); lastErr = null; break; }
      catch (e) {
        lastErr = e;
        if (!String(e.message ?? e).includes('CellDisabled')) throw e;
        await sleep(1000);
      }
    }
    if (lastErr) setupFail([
      `node${name}'s cell was still disabled after 30s of retrying.`,
      String(lastErr.message ?? lastErr),
    ]);
  }
  const call = (fn, payload, timeoutMs) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload }, timeoutMs);
  return { name, dna: cellIds[0][0], me: cellIds[0][1], call, adminPort, appPort };
}

const claimEntry = (record) => decode(record.entry.Present.entry);

async function publishClaim(node, domain, content) {
  await node.call('create_claim', {
    content, domain, confidence: 'Moderate', semantic_tags: [],
    author: node.me, timestamp: nowMicros(), evidence_hashes: [], attestation_policy: null,
  });
}

const countIn = async (node, domain, timeoutMs) => (await node.call('get_claims_by_domain', domain, timeoutMs)).length;

// A POLL THAT FAILS IS "NOT YET", NOT THE END OF THE RUN. `awaitConvergence`
// below is a loop with a 600s budget, and that budget is meant to be the
// authority on when to give up. Called bare, one throw escapes `main` and ends
// the harness inside a loop with minutes left that would have polled again.
//
// This is not theoretical for this directory: `transitive-gossip.mjs` came out
// of `network.yml` on exactly that, `Request timed out in 60000 ms: call_zome`
// from a node that had answered seconds earlier, and the same error was then
// caught again on a local run of it. The client's default per-call timeout is
// 60s, so a single hung read also eats a tenth of this window before aborting.
//
// A failed poll counts as zero and the loop continues. NOT swallowed: each one
// prints a ::warning:: naming the node, and the run ends with a count, because
// a run that passed with reads missing is evidence about a flake rather than a
// clean pass. The reads that feed a `check` stay bare — there is no budget
// behind them and a node that cannot answer at all is a real failure.
const pollFailures = [];
const pollCount = async (node, domain) => {
  try { return await countIn(node, domain); }
  catch (e) {
    const msg = String(e?.message ?? e).split('\n')[0].slice(0, 200);
    pollFailures.push({ node: `node${node.name}`, msg });
    log(`    ::warning::node${node.name} did not answer a poll: ${msg}`);
    return 0;
  }
};

// Is a conductor's admin port actually refusing connections? "Stopped"
// has to be confirmed, not assumed — a partition that did not happen
// would make every check after it meaningless while looking identical.
async function portRefuses(port) {
  try {
    const ws = await AdminWebsocket.connect({
      url: new URL(`ws://localhost:${port}`), wsClientOptions: { origin: 'live-verify' },
    });
    try { await ws.client?.close?.(); } catch { /* best effort */ }
    return false;
  } catch { return true; }
}

// A BARE READ THAT HANGS SHOULD NAME THE NODE, NOT JUST THE TIMEOUT.
//
// `pollCount` above covers the budgeted polls. The reads that feed a `check`
// stay bare on purpose — there is no budget behind them and a node that cannot
// answer at all is a real failure — and that judgment is unchanged here. What
// was wrong is what such a failure LOOKS like.
//
// Twice on 2026-10-05, on two different refs within a minute of each other,
// this harness died in Phase 2 with nothing but
//
//     HARNESS ERROR: Error: Request timed out in 60000 ms: call_zome
//
// the `@holochain/client` default, thrown by a read of nodeB taken 15s after
// `start-node nodeB`. That message names no node, no read and no elapsed time,
// and it cannot tell a conductor that has DIED from one that is UP and merely
// not serving zome calls yet. Those two want opposite fixes. It is the same
// bind #160 was built to break for the convergence window, and the same
// answer applies: the run is already lost, so spend a moment establishing
// WHICH failure this was instead of leaving it to be argued later.
//
// The discriminator is the node's own admin port, which `portRefuses` above
// already exists to probe. Nothing is swallowed and no timeout is widened —
// the error is rethrown unchanged, and a passing run never reaches this code.
// THE CLIENT'S 60s DEFAULT WAS TRUNCATING THE REAL ERROR, SO THESE READS
// OUTLAST IT.
//
// Every record of this failure said `Request timed out in 60000 ms:
// call_zome` -- the three CI occurrences, this instrument's own first firing,
// and transitive-gossip's removal from network.yml before that. That message
// is the CLIENT's, not the conductor's. stall-bisect.mjs re-measured the same
// stall with the ceiling raised and the conductor's actual answer is
//
//     Wasm runtime error while working with Ribosome: RuntimeError
//
// at 65.6s, 65.7s and 87.6s -- past 60s every time, so the default fired
// first and hid a wasm crash behind a timeout for as long as this has been
// tracked. Raising the ceiling on these reads is not widening a timeout to
// hide a failure, which is what §9's rule is about; it is the opposite, and
// it costs a green run nothing because a healthy read returns in
// milliseconds.
//
// NOT A RETRY, deliberately. The second read of the same domain succeeds in
// 0.00s -- the crash is once per conductor lifetime -- so a retry would
// succeed and destroy the evidence. One read, given room to fail honestly.
const DIAGNOSTIC_READ_TIMEOUT_MS = 180_000;

const readOrExplain = async (node, domain, what) => {
  const t0 = Date.now();
  try { return await countIn(node, domain, DIAGNOSTIC_READ_TIMEOUT_MS); }
  catch (e) {
    const heldFor = ((Date.now() - t0) / 1000).toFixed(1);
    const msg = String(e?.message ?? e).split('\n')[0].slice(0, 200);
    log(`\n    ::warning::node${node.name} did not answer "${what}" after ${heldFor}s — ${msg}`);
    // THE PROBE ITSELF HAS TO BE BOUNDED, OR IT MISDIAGNOSES THE WORST CASE.
    //
    // `portRefuses` reports "refusing" for anything that is not a successful
    // connect, a hung connect included. A conductor wedged badly enough to
    // stall its admin port would therefore be reported as GONE — pointing at
    // an exited process that is in fact still running, which is a worse
    // outcome than saying nothing. So the probe gets its own short deadline
    // and three answers, not two: refused, answered, or neither.
    const probe = await Promise.race([
      portRefuses(node.adminPort).then((refused) => (refused ? 'refused' : 'answered')),
      sleep(10_000).then(() => 'wedged'),
    ]);
    if (probe === 'wedged') {
      log(`    ::warning::node${node.name}'S ADMIN PORT DID NOT ANSWER OR REFUSE within 10s either, so`);
      log(`    the conductor is running but wedged — not serving app calls AND not serving admin.`);
      log(`    That is the strongest of the three signals and the one worth reporting upstream,`);
      log(`    because it is not a readiness race: a starting conductor refuses, it does not hang.`);
    } else if (probe === 'refused') {
      log(`    ::warning::node${node.name}'S ADMIN PORT IS ALSO REFUSING, so the conductor is GONE,`);
      log(`    not busy. This is a conductor that exited; read its log rather than reasoning about`);
      log(`    gossip or about any window. network.sh has no "logs" subcommand — the file is`);
      log(`    ${process.env.EPI_NET_ROOT || '/tmp/epi-net'}/${NODES[node.name].node}.log`);
    } else {
      log(`    ::warning::node${node.name}'S ADMIN PORT STILL ANSWERS, so the conductor PROCESS is`);
      log(`    healthy. It is not dead and not wedged. Read the error above rather than this`);
      log(`    text: if it names a Ribosome RuntimeError then the zome call CRASHED, which is`);
      log(`    the known cause here and is not a timeout, not readiness, and not`);
      log(`    CONVERGE_WINDOW_MS. scripts/live-verify/stall-bisect.mjs reproduces it locally:`);
      log(`    it is the FIRST read after nodeB is restarted while nodeA is down, 5 of 5 across`);
      log(`    clean networks, and the next read of the same domain answers in 0.00s. See`);
      log(`    README §9. If instead it still names a 60000 ms client timeout, then this read`);
      log(`    did not get DIAGNOSTIC_READ_TIMEOUT_MS and that is a bug in this harness.`);
    }
    throw e;
  }
};

async function awaitConvergence(node, domain, label, isolated) {
  const t0 = Date.now();
  let isolatedEverSaw = false;
  while (Date.now() - t0 < CONVERGE_WINDOW_MS) {
    const got = await pollCount(node, domain);
    const iso = await pollCount(isolated, domain);
    if (iso > 0) isolatedEverSaw = true;
    log(`    [${label}] t+${((Date.now() - t0) / 1000).toFixed(0)}s  ${label}=${got}  node${isolated.name}=${iso}`);
    if (got > 0) return { ms: Date.now() - t0, isolatedEverSaw };
    await sleep(POLL_MS);
  }
  return { ms: null, isolatedEverSaw };
}

async function main() {
  const DOMAIN_A = `PartA${Date.now()}`;
  const DOMAIN_B = `PartB${Date.now()}`;
  const DOMAIN_POST = `PartPost${Date.now()}`;
  const CONTENT_A = 'Written on nodeA while nodeB was offline.';
  const CONTENT_B = 'Written on nodeB while nodeA was offline.';

  log('Connecting to three conductors ...');
  let A = await connectNode('A');
  let B = await connectNode('B');
  const C = await connectNode('C');
  log(`  nodeA  dna ${b64(A.dna).slice(0, 14)}…  agent ${b64(A.me).slice(0, 12)}…`);
  log(`  nodeB  dna ${b64(B.dna).slice(0, 14)}…  agent ${b64(B.me).slice(0, 12)}…`);
  log(`  nodeC  dna ${b64(C.dna).slice(0, 14)}…  agent ${b64(C.me).slice(0, 12)}…`);

  // ---- Preconditions ----------------------------------------------------
  log('\n--- Preconditions ---');
  const sameDht = b64(A.dna) === b64(B.dna);
  const isolatedOk = b64(A.dna) !== b64(C.dna);
  check('nodeA and nodeB are on the SAME DHT', sameDht);
  check('nodeC is on a DIFFERENT DHT', isolatedOk);
  check('all three agent keys are distinct', new Set([b64(A.me), b64(B.me), b64(C.me)]).size === 3);
  if (!sameDht || !isolatedOk) {
    setupFail(['The DNA hashes are not in the arrangement this harness requires.',
      `nodeA ${b64(A.dna)}`, `nodeB ${b64(B.dna)}`, `nodeC ${b64(C.dna)}`]);
  }

  // ---- Phase 0: the network is healthy before we break it ---------------
  //
  // Without this, a total convergence failure later is indistinguishable
  // from a network that was never working in the first place.
  log('\n--- Phase 0: BASELINE — the network works before the partition ---');
  const DOMAIN_BASE = `PartBase${Date.now()}`;
  await publishClaim(A, DOMAIN_BASE, 'Baseline, both nodes up.');
  const base = await awaitConvergence(B, DOMAIN_BASE, 'nodeB', C);
  check('a claim crosses nodeA -> nodeB with both up (baseline)', base.ms !== null);
  if (base.ms === null) {
    // See OBSERVE_PAST_WINDOW_MS. Takes the one measurement that distinguishes
    // the two candidate fixes, before the run ends.
    log(`\n    --- still watching for ${OBSERVE_PAST_WINDOW_MS / 1000}s past the window, to `
      + 'establish whether more time would have helped ---');
    const tObs = Date.now();
    let lateMs = null;
    // Sleeps before re-checking, so at least one poll always happens — a budget
    // that takes zero observations would report "still absent" without looking.
    while (Date.now() - tObs < OBSERVE_PAST_WINDOW_MS) {
      await sleep(POLL_MS);
      const got = await pollCount(B, DOMAIN_BASE);
      log(`    t+${((Date.now() - tObs) / 1000).toFixed(0)}s past window: node${B.name}=${got}`);
      if (got > 0) { lateMs = Date.now() - tObs; break; }
    }
    if (lateMs !== null) {
      log(`    ::warning::IT ARRIVED LATE — ${((CONVERGE_WINDOW_MS + lateMs) / 1000).toFixed(0)}s from `
        + `the write, i.e. ${(lateMs / 1000).toFixed(0)}s past a ${CONVERGE_WINDOW_MS / 1000}s window. On `
        + 'THIS run the window was the constraint and the mechanism did eventually work. Record it '
        + 'against the other occurrences before widening anything — a window raised on one '
        + 'occurrence was already reverted once, see transitive-gossip.mjs.');
    } else {
      log(`    ::warning::STILL ABSENT after a further ${OBSERVE_PAST_WINDOW_MS / 1000}s — `
        + `${(CONVERGE_WINDOW_MS + OBSERVE_PAST_WINDOW_MS) / 1000}s from the write in total. On THIS run `
        + 'more time would NOT have helped, so the window is not the thing to change. That points at '
        + 'the 15s round timeout being too tight for this machine.');
    }
    setupFail(['The network is not carrying claims even with both nodes up.',
      'Nothing this harness does after breaking it could be interpreted.',
      'Check scripts/network.sh status, and run real-gossip.mjs first.',
      'The ::warning:: above says whether more time would have helped.']);
  }
  log(`    baseline crossed in ${(base.ms / 1000).toFixed(1)}s`);

  // ---- Phase 1: partition, and write where B cannot see -----------------
  log('\n--- Phase 1: nodeB goes offline; nodeA writes anyway ---');
  net('stop-node', 'nodeB');
  check('nodeB is genuinely down (its admin port refuses connections)', await portRefuses(NODES.B.admin));
  await publishClaim(A, DOMAIN_A, CONTENT_A);
  check('nodeA wrote claimA while nodeB was offline', (await readOrExplain(A, DOMAIN_A, "nodeA's own claimA, written during the partition")) === 1);

  // ---- Phase 2: swap which node is offline ------------------------------
  //
  // ORDER MATTERS AND IS THE POINT. nodeA is stopped BEFORE nodeB is
  // started, so the two are never running at the same time. That is what
  // guarantees nodeB cannot have learned claimA, making the divergence
  // real rather than probable.
  log('\n--- Phase 2: nodeA goes offline BEFORE nodeB returns, so they never overlap ---');
  net('stop-node', 'nodeA');
  check('nodeA is genuinely down (its admin port refuses connections)', await portRefuses(NODES.A.admin));
  net('start-node', 'nodeB');
  B = await connectNode('B');

  // THE DIVERGENCE CHECK HAS TO OUTLAST GOSSIP, or it proves nothing.
  //
  // Reading nodeB the instant it returns and finding zero is exactly what
  // you would see if the partition had never happened and the claim were
  // merely still in flight — steady-state propagation is a couple of
  // seconds, and this read happens sooner than that. Found by injection:
  // with both `stop-node` calls removed, so that no partition occurred at
  // all, the two "is genuinely down" checks went red as they should and
  // THIS CHECK STILL PASSED. A check whose label claims more than its
  // assertion tests is this directory's recorded failure mode, and this
  // was one.
  //
  // So the dwell is derived from what this run actually measured rather
  // than from a guess: Phase 0 timed a real crossing on this very
  // network, and we wait several times that before asserting absence. If
  // the nodes were in fact connected, the claim would have arrived well
  // inside the window.
  //
  // THAT IS NOW TRUE IN A NARROWER BAND THAN THIS PARAGRAPH SUGGESTS, and
  // saying so beats letting it drift. With DWELL_FLOOR_MS at 45s, `base.ms
  // * 5` only takes over above a 9s baseline; below that the floor decides,
  // and a healthy network measures well below it -- 5.1s locally, 0.0s on
  // the CI runs that failed. So on most runs the dwell is the floor, chosen
  // to clear a conductor crash window, not a multiple of anything this run
  // measured. The multiple still governs a genuinely slow network, which is
  // the case it was written for.
  //
  // See DWELL_CAP_MS. The 5x ideal is kept, bounded, and the baseline that
  // would have made it unaffordable is reported rather than slept through.
  const soundBaseline = base.ms <= MAX_SOUND_BASELINE_MS;
  check(`the baseline is fast enough to measure divergence inside the job budget (<= ${MAX_SOUND_BASELINE_MS / 1000}s)`, soundBaseline);
  if (!soundBaseline) {
    log(`    ::warning::THE BASELINE CROSSED IN ${(base.ms / 1000).toFixed(1)}s, with both nodes up and`);
    log(`    nothing partitioned. A sound dwell is 5x that = ${(base.ms * 5 / 1000).toFixed(0)}s, which does not fit`);
    log(`    this job alongside the ${CONVERGE_WINDOW_MS / 1000}s convergence waits that follow it. The dwell is capped at`);
    log(`    ${DWELL_CAP_MS / 1000}s and the divergence assertion below is WEAKER THAN DESIGNED — nodeB showing`);
    log(`    zero may mean the claim has not arrived yet rather than that the partition held.`);
    log(`    ::warning::THE ${(base.ms / 1000).toFixed(1)}s IS THE FINDING, not this cap. real-gossip's own window is`);
    log(`    ${330}s, so a crossing this slow is a FAILURE over there and was only recorded here`);
    log(`    because this harness budgets ${CONVERGE_WINDOW_MS / 1000}s. It is evidence that the op arrives late`);
    log(`    rather than never — the question README §9 left open — and one occurrence is not`);
    log(`    a distribution, so record it beside the others before changing any window.`);
  }
  const dwellMs = Math.min(Math.max(DWELL_FLOOR_MS, base.ms * 5), DWELL_CAP_MS);
  log(`    waiting ${(dwellMs / 1000).toFixed(0)}s before asserting absence — ${(base.ms / 1000).toFixed(1)}s was enough to cross in Phase 0${dwellMs === DWELL_CAP_MS && base.ms * 5 > DWELL_CAP_MS ? ' (CAPPED)' : ''} ...`);
  await sleep(dwellMs);
  const bSawA = await readOrExplain(B, DOMAIN_A, 'the divergence read: does nodeB have claimA on return');
  log(`    nodeB's view of claimA's domain on return: ${bSawA}`);
  // THE LABEL IS ONLY TRUE IF THE DWELL ACTUALLY OUTLASTED GOSSIP.
  //
  // When the cap binds, it did not: a 300s dwell against a 396s crossing
  // means absence does not distinguish "the partition held" from "it has not
  // arrived yet". Reporting PASS there would be a label claiming more than
  // its assertion tested — this directory's named failure mode, and one the
  // first version of THIS fix committed, by capping the dwell and leaving the
  // check untouched so it printed a clean PASS on a false premise.
  //
  // So on a capped run the result is reported as inconclusive and counted as
  // neither. The run is already red on the baseline check above, which is the
  // finding; inventing a second failure here would double-count one cause,
  // and passing it would be a lie.
  if (soundBaseline) {
    check('DIVERGENCE: nodeB does NOT have claimA, after long enough that it would have arrived', bSawA === 0);
  } else {
    log(`  INCONCLUSIVE: nodeB shows ${bSawA} in claimA's domain, but the dwell was capped at`);
    log(`    ${DWELL_CAP_MS / 1000}s, below the ${(base.ms / 1000).toFixed(1)}s this network actually took to cross in Phase 0.`);
    log(`    Absence therefore does not distinguish "the partition held" from "it has not`);
    log(`    arrived yet", so this is counted as neither a pass nor a failure. See the`);
    log(`    baseline check above for the thing that is actually wrong.`);
  }

  await publishClaim(B, DOMAIN_B, CONTENT_B);
  check('nodeB wrote claimB while nodeA was offline', (await readOrExplain(B, DOMAIN_B, "nodeB's own claimB, written during the partition")) === 1);
  check('nodeC has neither claim', (await readOrExplain(C, DOMAIN_A, "the isolated node's view of claimA's domain")) === 0 && (await readOrExplain(C, DOMAIN_B, "the isolated node's view of claimB's domain")) === 0);

  // ---- Phase 3 & 4: heal, and converge in both directions ---------------
  log('\n--- Phase 3: nodeA returns. Both up for the first time since Phase 0 ---');
  net('start-node', 'nodeA');
  A = await connectNode('A');
  check('nodeA still has its own claimA after restarting', (await readOrExplain(A, DOMAIN_A, 'claimA still on nodeA after its restart')) === 1);
  check('nodeB still has its own claimB after nodeA restarted', (await readOrExplain(B, DOMAIN_B, 'claimB still on nodeB after nodeA restarted')) === 1);

  //
  // BOTH DIRECTIONS ARE MEASURED CONCURRENTLY, FROM ONE SHARED CLOCK, and
  // that is a correctness property of the measurement rather than a
  // convenience. Measured in sequence, the second direction is timed only
  // after the first has already waited out the whole healing delay, so it
  // reports ~0s and reads as "instant" when nothing of the sort happened:
  // both directions in fact heal together, in the same gossip round. The
  // first version of this harness did exactly that and printed
  // "nodeA 351.7s, nodeB 0.0s" — two true numbers that together tell a
  // false story. Run in parallel, both report the real elapsed time from
  // the same t0.
  log('\n--- Phase 4: do BOTH nodes acquire what the other wrote while they were away? ---');
  log('    (measured concurrently — see the note in the source on why)');
  const [convA, convB] = await Promise.all([
    awaitConvergence(A, DOMAIN_B, 'nodeA', C),
    awaitConvergence(B, DOMAIN_A, 'nodeB', C),
  ]);
  check('nodeA converges on claimB, written while nodeA was offline', convA.ms !== null);
  if (convA.ms !== null) log(`    nodeA converged in ${(convA.ms / 1000).toFixed(1)}s`);
  check('nodeB converges on claimA, written while nodeB was offline', convB.ms !== null);
  if (convB.ms !== null) log(`    nodeB converged in ${(convB.ms / 1000).toFixed(1)}s`);

  // Content, not just count — "a record arrived" and "the record the other
  // node wrote arrived" are different claims.
  const aHasB = await A.call('get_claims_by_domain', DOMAIN_B);
  const bHasA = await B.call('get_claims_by_domain', DOMAIN_A);
  check('what nodeA acquired is nodeB\'s entry, authored by nodeB',
    aHasB.length === 1 && claimEntry(aHasB[0]).content === CONTENT_B && b64(claimEntry(aHasB[0]).author) === b64(B.me));
  check('what nodeB acquired is nodeA\'s entry, authored by nodeA',
    bHasA.length === 1 && claimEntry(bHasA[0]).content === CONTENT_A && b64(claimEntry(bHasA[0]).author) === b64(A.me));

  // ---- Phase 5: the link is healed, not merely backfilled ---------------
  log('\n--- Phase 5: a claim written AFTER healing propagates normally ---');
  check('nodeB sees 0 in the post-heal domain before nodeA publishes', (await readOrExplain(B, DOMAIN_POST, 'the post-heal domain on nodeB, before anything is written to it')) === 0);
  await publishClaim(A, DOMAIN_POST, 'Written after the partition healed.');
  const post = await awaitConvergence(B, DOMAIN_POST, 'nodeB', C);
  check('a NEW claim crosses nodeA -> nodeB after healing', post.ms !== null);
  if (post.ms !== null) log(`    crossed in ${(post.ms / 1000).toFixed(1)}s`);

  // ---- The isolated control, over the whole run -------------------------
  log('\n--- CONTROL: the isolated node saw none of it, throughout ---');
  check('nodeC never saw claimA', (await readOrExplain(C, DOMAIN_A, "the isolated node's final view of claimA's domain")) === 0);
  check('nodeC never saw claimB', (await readOrExplain(C, DOMAIN_B, "the isolated node's final view of claimB's domain")) === 0);
  check('nodeC never saw the post-heal claim', (await readOrExplain(C, DOMAIN_POST, "the isolated node's final view of the post-heal domain")) === 0);
  check('nodeC never saw anything during any convergence wait',
    !base.isolatedEverSaw && !convA.isolatedEverSaw && !convB.isolatedEverSaw && !post.isolatedEverSaw);
  check('nodeC is alive and answering, not merely silent',
    Array.isArray(await C.call('get_claims_by_domain', 'AnyDomainAtAll')));

  // The same call the failure paths make, rather than relying on the phases
  // above having happened to leave every node up.
  restoreNetwork('end of run');
  check('nodeA is answering at the end — the next harness gets the network this one was handed',
    !(await portRefuses(NODES.A.admin)));
  check('nodeB is answering at the end', !(await portRefuses(NODES.B.admin)));

  log('');
  // Said once at the end, where it survives the scrollback of a ten-minute wait.
  if (pollFailures.length > 0) {
    const byNode = {};
    for (const f of pollFailures) byNode[f.node] = (byNode[f.node] ?? 0) + 1;
    log(`::warning::${pollFailures.length} poll(s) went unanswered during this run `
      + `(${Object.entries(byNode).map(([n, c]) => `${n}: ${c}`).join(', ')}). `
      + `Each counted as zero and the wait continued. First: ${pollFailures[0].msg}`);
    log('');
  }
  if (failures === 0) {
    log('ALL CHECKS PASSED — two conductors each wrote history the other');
    log('could not see, and on rejoining converged on both, in both');
    log('directions, while an isolated conductor saw none of it.');
    if (convA.ms !== null && convB.ms !== null) {
      log(`Catch-up: nodeA ${(convA.ms / 1000).toFixed(1)}s, nodeB ${(convB.ms / 1000).toFixed(1)}s.`);
    }
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nHARNESS ERROR:', e);
  // This handler used to do nothing but exit, so an error after phase 1 left a
  // conductor stopped for the next harness to trip over.
  try { restoreNetwork('after a harness error'); } catch (e2) {
    console.error('  and the restore itself failed:', String(e2?.message ?? e2).split('\n')[0]);
  }
  process.exit(1);
});
