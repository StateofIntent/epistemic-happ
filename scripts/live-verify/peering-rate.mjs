#!/usr/bin/env node
// ============================================================================
// peering-rate.mjs — HOW OFTEN DOES nodeD JOIN THE DHT AND EXCHANGE NOTHING,
// AND DOES THE GOSSIP ROUND TIMEOUT CHANGE IT?
//
// §9 has carried "why a node sometimes joins the DHT and exchanges nothing" as
// an open question through four falsified hypotheses. The blocker on it has
// always been stated as irreproducibility — but that was true of the ORIGINAL
// CLUE, not of the failure. `transitive-gossip.mjs`'s own setup text puts the
// failure at "roughly one run in eight", from two failures in fifteen runs.
// A one-in-eight failure is not irreproducible; it is sixteen trials.
//
// SO THIS MEASURES A DISTRIBUTION RATHER THAN A PASS RATE, because the harness
// that reported the rate also warns its reader to "expect a long tail rather
// than a broken state", and those two are not distinguishable by a pass/fail
// with a window on it. A trial here records the TIME for nodeA's claim to reach
// nodeD, capped, so the output can answer which shape it is:
//
//   a long tail       -> crossings land late but land, and the window is wrong
//   a broken state    -> crossings do not land at all inside a generous cap
//
// `partition-rejoin` and `real-gossip` both reached for that distinction with
// an instrumented one-off; this takes it by repetition instead.
//
// AND IT IS A CONTROLLED COMPARISON, WHICH IS THE SECOND REASON IT EXISTS.
// `scripts/network.sh` now sets `advanced.k2Gossip.roundTimeoutMs` to 60s
// against kitsune2's 15s default, on the argument that a round lost to that
// timeout cannot be retried with the same peer for `min_initiate_interval_ms`
// (300s) — which, if right, predicts that a short timeout produces exactly the
// behaviour this question is about. §9 records that prediction and says plainly
// that it is checkable at no extra cost. This is the check: the same trial, run
// at 15000 and at 60000, through the override that script already takes.
//
// WHAT WOULD FALSIFY THE PREDICTION, stated before the run rather than after:
// if the two arms produce the same rate and the same distribution, the round
// timeout is not what drives this and §9's mechanism paragraph is a side-story.
// That outcome is the likelier one on the evidence as it stands, and it is
// worth recording either way — a negative result here retires a hypothesis
// that currently sits in the README looking plausible.
//
// ----------------------------------------------------------------------------
// WHAT IT ACTUALLY FOUND — AND THE FIRST READING OF IT WAS WRONG, WHICH IS
// RECORDED HERE BECAUSE THE SUMMARY TABLE IS WHAT CAUSED THE ERROR.
//
// First run, 8 trials per arm, cap 330s, on a development machine. The
// per-trial crossings, which are the real output:
//
//     60000:   3.0  3.0  3.0  3.0  3.0  3.0  3.0  3.0
//     15000: 307.5  3.0  3.0  3.0  3.0 42.2  3.0  3.0
//
// THE ARMS DIFFER, AND THE 307.5s IS THE WHOLE RESULT. `min_initiate_interval_ms`
// is 300_000 — the minimum before a round may be initiated with a given peer
// again — so a crossing at 300s plus 7.5s is precisely the predicted shape: the
// first round was lost, no retry was permitted for five minutes, and the next
// one crossed in a few seconds. Nothing else in play predicts a delay that
// lands on that constant. The 60s arm produced no crossing above a single poll.
//
// AND IT WOULD HAVE BEEN A CI FAILURE. `real-gossip`'s window is 330s, so
// 307.5s is a pass with 22s of margin; a slightly slower machine turns that
// into the baseline crossing that never happens, which is the surviving
// `network` failure mode exactly.
//
// WHAT THIS DOES NOT SUPPORT IS A RATE. Two slow trials in eight against zero
// in eight is Fisher exact p = 0.467 — no frequency claim survives that, and
// none is made. The magnitude is the evidence; the count is not.
//
// THE 42.2s IS NOT EXPLAINED by the 300s model and is left unexplained rather
// than fitted. It is not a multiple of the rate limit and not a poll boundary.
//
// HOW THE FIRST READING WENT WRONG, since it is the more useful lesson. The
// summary printed "crossed 8, timed out 0, MEDIAN 3.0s" for both arms. Every
// figure true, and the median of a distribution whose interesting feature is a
// single long tail is exactly the statistic that erases it — so the run was
// first written up as "16/16, no information in it", a null result, and
// published as one. The per-trial lines were sitting directly above the table
// the whole time. The summary now prints the SLOWEST crossing and a count of
// trials over 10s, because a tail question answered with a median is not an
// answer.
//
// THE PRE-REGISTERED CONDITION WAS ALSO BADLY WRITTEN, independently of that.
// "If the two arms produce the same rate, the round timeout is not what drives
// this" cannot separate the hypotheses at this sample size in either direction:
// with few events, equal rates are the null's most likely output whether the
// mechanism is real or not. The condition should have been about the
// DISTRIBUTION — specifically about crossings near 300s — which is what the
// data turned out to carry.
//
// FOR CALIBRATION: this machine crosses inside one 3s poll on 14 of 16 trials,
// so it is not slow enough to lose a 15s race often. The CI runner is. A run
// here is a weak version of the real experiment and the header below says what
// the strong one is.
//
// AND THE FAST TIMES ARE POLL GRANULARITY, NOT LATENCY. "3.0s" means the first
// poll already found the claim; the true figure is somewhere in 0-3s. The slow
// figures are real, since they span many polls.
//
// ----------------------------------------------------------------------------
// THE STRONG RUN HAPPENED, AND IT REFUTES THE HYPOTHESIS ABOVE.
//
// Run 37464088862 on a two-vCPU hosted runner, 10 trials per arm requested, 17
// completed before the harness hung (see the BOUNDS block for the hang and its
// fix). Per-trial crossings:
//
//     60000: 135.3  63.0  NONE  156.2  129.3  NONE  NONE  63.0  63.0  63.0
//     15000:  18.1 132.3  21.1  NONE   135.3 132.3   0.0   (3 trials lost)
//
// NOTHING LANDS NEAR 300s. The development machine's single 307.5s crossing was
// read as `min_initiate_interval_ms` (300_000) — a lost round waiting out the
// rate limit. On the machine that actually loses rounds, no crossing comes
// within 20s of 300s. Instead they cluster at 63.0s (x4), ~129-135s (x5) and
// ~18-21s. That model does not survive, and this block is left standing rather
// than rewritten because the reasoning was sound and the sample was one.
//
// AND THE 60s ARM IS NOT PROTECTIVE, which was the whole pre-registered
// prediction: 3 no-crossings in 10 against the 15s arm's 1 in 7. Fisher exact
// p = 0.603, so NO difference is established in either direction — but the
// point estimate runs opposite to the prediction, and the prediction was that
// the short arm would be worse.
//
// WHAT DOES SEPARATE THE TRIALS is whether nodeD ever initiated gossip at all.
// Three of the four no-crossings logged `Initiated gossip with` zero times; the
// fourth initiated four times and still never crossed. One trial
// (rt60000, no crossing) logged `No agents with overlapping arcs available`
// 320 times with zero initiations — a node up, on the same DHT (sameDht is
// checked before the clock starts), repeatedly finding no gossip peer. That is
// this file's question stated as a measurement rather than a symptom.
//
// `Accept message from wrong peer`: ZERO in all 17 trials. Fifth independent
// confirmation it is not the marker.
//
// THE CONFOUND, NAMED BECAUSE IT NEARLY SURVIVED: `No agents with overlapping
// arcs available` is a LIFETIME count, so a 330s timeout logs more of it than
// a 3s crossing for reasons that have nothing to do with the cause. Only
// equal-duration trials compare. Among the four that ran the full cap: 2, 1, 1,
// 320. The outlier survives the correction; a general "slow trials log more"
// claim does not.
//
// WHY A TRIAL IS A WHOLE CLEAN NETWORK. The one-clean-environment rule is not
// a precaution here: `scripts/live-verify/README.md` records `partition-rejoin`
// dying in its baseline phase when run straight after `transitive-gossip` on
// the same network, and the nodeD failure's only known reset is a full
// `clean && start`. A trial that reused a network would be measuring the
// previous trial.
//
// ASSERTS NOTHING. Prints per-trial crossings and a tail summary; read the
// per-trial lines, not the table alone — see the results block below for why
// that distinction is not pedantry. Not a gate, not in CI — the
// same standing as `stall-bisect.mjs`, `stall-threshold.mjs` and
// `dht-isolation-probe.mjs`, and for the same reason: it answers a question
// rather than defending a property.
//
// Prereqs: the Holochain toolchain on PATH, a packed .happ, and the bootstrap
// binary `scripts/network.sh` needs. Takes roughly two and a half minutes per
// trial, so the defaults below are about an hour. Settable:
//
//   EPI_PEERING_TRIALS      trials per arm            (default 8)
//   EPI_PEERING_TIMEOUTS    comma-separated arms, ms  (default 60000,15000)
//   EPI_PEERING_CAP_MS      per-trial crossing cap    (default 330000)
//   EPI_PEERING_LOG_DIR     where archives go         (default /tmp/epi-peering-logs)
//   EPI_PEERING_DEADLINE_MIN  whole-run budget, min   (default 300)
//   EPI_PEERING_NET_TIMEOUT_MS      per network.sh call  (default 300000)
//   EPI_PEERING_CONNECT_TIMEOUT_MS  per socket/call      (default 120000)
//
// Run: node scripts/live-verify/peering-rate.mjs
// ============================================================================
import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';

const NODES = {
  A: { node: 'nodeA', admin: 8899, app: 8898, appId: 'epistemic-net-a' },
  D: { node: 'nodeD', admin: 8891, app: 8890, appId: 'epistemic-net-d' },
};

const NET_ROOT = process.env.EPI_NET_ROOT || '/tmp/epi-net';
const REPO_ROOT = new URL('../..', import.meta.url).pathname;

const TRIALS = Number(process.env.EPI_PEERING_TRIALS ?? 8);
const ARMS = (process.env.EPI_PEERING_TIMEOUTS ?? '60000,15000')
  .split(',').map((s) => s.trim()).filter(Boolean);
// 330s matches `transitive-gossip`'s own ACQUIRE_WINDOW_MS, so a trial this
// file calls a timeout is a trial that harness would have failed. Chosen for
// comparability rather than convenience: a shorter cap would turn its long
// tail into this file's failures and the two would stop meaning the same
// thing.
const CAP_MS = Number(process.env.EPI_PEERING_CAP_MS ?? 330_000);
const POLL_MS = 3_000;

// --- BOUNDS, because the first real run of this file hung and cost a day ---
//
// WHAT HAPPENED, since the fix only makes sense against it. Run 37464088862
// completed 17 of 20 trials on a hosted runner, then stopped progressing after
// trial 7 of the second arm and sat there for roughly 23 hours. The job's own
// `timeout-minutes: 330` DID NOT FIRE. Three separate things were wrong:
//
//   - `net()` shells out with `execFileSync` and NO timeout, so a `network.sh`
//     that never returns blocks the harness forever. This is the most likely
//     site: bringing up three conductors and two services waits on ports.
//   - `AdminWebsocket.connect` / `AppWebsocket.connect` / `appInfo()` take no
//     timeout either, so a conductor that accepts a socket and never answers
//     hangs the same way.
//   - nothing bounded the RUN, so there was no point at which the harness
//     would give up and let the workflow reach its upload step.
//
// The run survived only because the artifact upload is `if: always()` — 572KB
// of archives came out of a terminated job. That is luck the next run should
// not need: an experiment that cannot finish should FAIL FAST and summarise
// what it has, because a partial distribution is still a result and a wedged
// job is not.
//
// Every bound is generous on purpose. These are not performance limits; they
// are the difference between "this trial failed" and "this experiment is gone".
const NET_TIMEOUT_MS = Number(process.env.EPI_PEERING_NET_TIMEOUT_MS ?? 300_000);
const CONNECT_TIMEOUT_MS = Number(process.env.EPI_PEERING_CONNECT_TIMEOUT_MS ?? 120_000);
// Default sits UNDER the workflow's `timeout-minutes: 330` so the harness
// always stops first and the upload step always runs. Raising one without the
// other is how a run goes back to being killed mid-summary.
const DEADLINE_MS = Number(process.env.EPI_PEERING_DEADLINE_MIN ?? 300) * 60_000;
const STARTED_AT = Date.now();
const deadlineLeftMs = () => DEADLINE_MS - (Date.now() - STARTED_AT);

/** Reject if a promise has not settled inside `ms`.
 *
 * The underlying socket is NOT torn down on timeout — @holochain/client owns
 * it and there is no cancel. A trial that times out here is abandoned and the
 * next one runs `network.sh clean`, which takes the conductor with it. */
function withTimeout(promise, ms, what) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} did not answer in ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// A TRIAL'S LOGS DO NOT SURVIVE THE NEXT TRIAL, WHICH IS THE THIRD TIME THIS
// REPOSITORY HAS LOST THE RUN THAT MATTERED TO EXACTLY THIS.
//
// Every trial opens with `network.sh clean`, which deletes NET_ROOT — so the
// conductor logs from a slow crossing are destroyed by the trial that follows
// it. Before this, a run could MEASURE a 307.5s crossing and keep nothing
// explaining it, which is the one artefact an upstream report needs.
//
// The two earlier instances, both already written down elsewhere and both the
// same shape:
//
//   - kitsune2#638's own second comment: "the first batch only saved logs when
//     `wrong peer` matched, which is precisely why the run that mattered was
//     lost." Conditioning capture on a log STRING loses every failure that
//     does not print it — and two of the three measured failures printed
//     nothing distinctive at all.
//
//   - `network.yml`'s census step: `if: failure()` made conductor logs exist
//     only on runs already gone wrong, so "three passing runs showed zero
//     occurrences" was the absence of the FILE, not of the error.
//
// So capture is conditioned on the OUTCOME this file measures — a slow or
// absent crossing — and never on anything found inside a log. AND CONTROLS ARE
// KEPT TOO, which is the second lesson rather than a nicety: logs from slow
// trials alone cannot answer "do the fast ones show this line as well?", and
// that exact question is what the census gap above destroyed. A couple of fast
// trials per arm are therefore archived as controls.
const SLOW_MS = 10_000;
const KEEP_DIR = process.env.EPI_PEERING_LOG_DIR || '/tmp/epi-peering-logs';

// EVERY TRIAL IS ARCHIVED, LABELLED BY ITS OWN CROSSING TIME, and the reason
// is the first real run rather than tidiness. That run kept "slow" trials plus
// up to two "controls" per arm chosen by a 10s threshold — and on a two-vCPU
// runner only ONE trial in seventeen came in under 10s, so the design yielded
// a single control and no way to characterise a healthy run. The threshold was
// calibrated on a development machine where 14 of 16 trials crossed inside one
// poll; on the machine the experiment actually needs, it inverted.
//
// A rank cannot be known at archive time either — logs must be copied before
// the NEXT trial's `clean` deletes them, which is long before the fastest
// trial is known. So the threshold is abandoned rather than retuned: archive
// unconditionally, put the measurement in the directory name, and let analysis
// pick its own controls by sorting. 17 trials cost 572KB, so the disk argument
// for being selective never existed.
const pad = (n, w) => String(n).padStart(w, '0');
const outcomeLabel = (ms) => (ms === null ? 'nocrossing' : `${pad((ms / 1000).toFixed(1), 6)}s`);

/** Archive this trial's conductor logs under a name carrying its outcome.
 *  Returns the directory, or null if there was nothing to copy.
 *
 * Best-effort by construction: losing an archive must never fail a trial whose
 * measurement already succeeded, since the measurement is the primary result
 * and the logs are the follow-up evidence. */
function keepLogs(arm, trial, label) {
  // ARM, THEN TIME, THEN TRIAL INDEX — in that order so a plain `ls | sort`
  // puts the fastest trial of each arm first and `nocrossing` last ('n' sorts
  // after a digit). Naming it `-trialNN-<time>` instead sorts by trial order,
  // which is the one ordering the analysis never wants.
  const dest = `${KEEP_DIR}/rt${arm}-${label}-trial${String(trial).padStart(2, '0')}`;
  let copied = 0;
  try {
    if (!existsSync(NET_ROOT)) return null;
    mkdirSync(dest, { recursive: true });
    for (const f of readdirSync(NET_ROOT)) {
      if (!f.endsWith('.log')) continue;
      try { copyFileSync(`${NET_ROOT}/${f}`, `${dest}/${f}`); copied++; }
      catch { /* one unreadable log is not the end of the archive */ }
    }
  } catch { return null; }
  return copied > 0 ? dest : null;
}

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowMicros = () => Date.now() * 1000;

const net = (...args) => {
  const env = { ...process.env };
  // `timeout` is the whole point — see the BOUNDS block. Without it a
  // network.sh that waits forever on a port takes the experiment with it.
  return execFileSync('bash', [`${REPO_ROOT}/scripts/network.sh`, ...args], {
    encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'],
    timeout: NET_TIMEOUT_MS, killSignal: 'SIGKILL',
  });
};

async function connectNode(name) {
  const { admin: adminPort, app: appPort, appId } = NODES[name];
  // Each await here is bounded — see the BOUNDS block. A conductor that
  // accepts the socket and never answers is the second way this file hung.
  const admin = await withTimeout(AdminWebsocket.connect({
    url: new URL(`ws://localhost:${adminPort}`), wsClientOptions: { origin: 'live-verify' },
  }), CONNECT_TIMEOUT_MS, `${NODES[name].node} admin connect`);
  const { token } = await withTimeout(
    admin.issueAppAuthenticationToken({ installed_app_id: appId }),
    CONNECT_TIMEOUT_MS, `${NODES[name].node} auth token`);
  const app = await withTimeout(AppWebsocket.connect({
    url: new URL(`ws://localhost:${appPort}`), token, wsClientOptions: { origin: 'live-verify' },
  }), CONNECT_TIMEOUT_MS, `${NODES[name].node} app connect`);
  const info = await withTimeout(app.appInfo(), CONNECT_TIMEOUT_MS, `${NODES[name].node} appInfo`);
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      if (cell?.type === CellType.Provisioned) cellIds.push(cell.value.cell_id);
    }
  }
  if (cellIds.length === 0) throw new Error(`${NODES[name].node} has no provisioned cells`);
  for (const cellId of cellIds) {
    let lastErr;
    for (let i = 0; i < 30; i++) {
      try {
        await withTimeout(admin.authorizeSigningCredentials(cellId),
          CONNECT_TIMEOUT_MS, `${NODES[name].node} authorizeSigningCredentials`);
        lastErr = null; break;
      }
      catch (e) {
        lastErr = e;
        if (!String(e.message ?? e).includes('CellDisabled')) throw e;
        await sleep(1000);
      }
    }
    if (lastErr) throw new Error(`${NODES[name].node}'s cell still disabled after 30s`);
  }
  return {
    name: NODES[name].node,
    dna: cellIds[0][0],
    me: cellIds[0][1],
    call: (fn, payload) => app.callZome({
      role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload,
    }, 60_000),
  };
}

/** THE SAME DNA HASH ON BOTH SIDES, CHECKED BEFORE THE CLOCK STARTS.
 *
 * "nodeD exchanges nothing with nodeA" is only interesting if they are on the
 * same DHT. A seed mismatch would produce a timeout on every trial in both
 * arms and look exactly like a catastrophic result. */
const sameDht = (a, d) => Buffer.from(a.dna).equals(Buffer.from(d.dna));

/** Grep every node log for the line §9's mechanism paragraph is about.
 *
 * Counted per trial rather than per run, because the question is whether it
 * tracks the failures — a count over a whole session cannot say that. */
function wrongPeerHits() {
  let n = 0;
  for (const f of ['nodeA', 'nodeB', 'nodeC', 'nodeD']) {
    const p = `${NET_ROOT}/${f}.log`;
    if (!existsSync(p)) continue;
    try {
      n += (readFileSync(p, 'utf8').match(/Accept message from wrong peer/g) ?? []).length;
    } catch { /* a log we cannot read is not a hit */ }
  }
  return n;
}

async function oneTrial(roundTimeoutMs, i) {
  process.env.EPI_GOSSIP_ROUND_TIMEOUT_MS = String(roundTimeoutMs);

  net('clean');
  net('start');
  net('start-node', 'nodeD');

  const A = await connectNode('A');
  const D = await connectNode('D');

  if (!sameDht(A, D)) {
    return { ms: null, note: 'SETUP: nodeA and nodeD are on different DHTs', wrongPeer: 0 };
  }

  const domain = `Peering${Date.now()}`;
  await A.call('create_claim', {
    content: 'peering-rate trial', domain, confidence: 'Moderate', semantic_tags: [],
    author: A.me, timestamp: nowMicros(), evidence_hashes: [], attestation_policy: null,
  });

  const t0 = Date.now();
  let ms = null;
  while (Date.now() - t0 < CAP_MS) {
    let got = 0;
    try { got = (await D.call('get_claims_by_domain', domain)).length; }
    catch { /* a read that cannot answer yet is "not yet", not the end */ }
    if (got > 0) { ms = Date.now() - t0; break; }
    await sleep(POLL_MS);
  }

  return { ms, note: null, wrongPeer: wrongPeerHits() };
}

async function main() {
  log('=== nodeD peering rate, by gossip round timeout ===');
  log(`${TRIALS} trials per arm, arms [${ARMS.join(', ')}] ms, cap ${(CAP_MS / 1000).toFixed(0)}s`);
  log('A trial is a whole clean network — see the header for why reuse would');
  log('measure the previous trial rather than this one.');
  log('');

  const results = {};
  for (const arm of ARMS) results[arm] = [];
  let kept = 0;
  let ranOut = false;
  // A trial needs the cap plus a network bring-up. Stopping BEFORE one that
  // cannot finish is what keeps the summary and the upload reachable.
  const perTrialBudget = CAP_MS + 150_000;

  // ARMS ARE INTERLEAVED — one trial of each per round — rather than one arm
  // run to completion and then the next. The first run of this file is why.
  //
  // It ran 60000 to completion and then hung partway through 15000, giving 10
  // trials against 7, and the headline comparison was a NO-CROSSING RATE
  // between the arms. Truncation therefore landed entirely on one arm, which
  // is the one place a missing trial is not neutral: it biases exactly the
  // quantity being compared, and it does so silently, because an arm that
  // simply stopped early looks identical to an arm that was always shorter.
  //
  // Interleaved, any stop — deadline, hang, cancellation — leaves the arms
  // differing by at most one trial, and the comparison degrades evenly instead
  // of lopsidedly. It costs nothing: `roundTimeoutMs` is an environment
  // variable read when a trial generates its own network, and every trial
  // already builds one from scratch, so alternating arms is the same work in a
  // different order.
  //
  // It also removes a confound nobody had ruled out. Sequential arms means the
  // first arm always runs on a freshly-booted runner and the second always
  // runs after an hour of conductor churn, so "arm" and "how tired the machine
  // is" were the same variable. Alternating separates them.
  outer:
  for (let i = 1; i <= TRIALS; i++) {
    log(`--- round ${i} of ${TRIALS} ---`);
    for (const arm of ARMS) {
      if (deadlineLeftMs() < perTrialBudget) {
        ranOut = true;
        log(`  STOPPING: ${(deadlineLeftMs() / 60_000).toFixed(1)} min left of the`);
        log(`  ${(DEADLINE_MS / 60_000).toFixed(0)}-minute budget, and a trial can need`);
        log(`  ${(perTrialBudget / 60_000).toFixed(1)}. What ran is below; a partial`);
        log('  distribution is a result, a wedged job is not.');
        break outer;
      }
      let r;
      try {
        r = await oneTrial(arm, i);
      } catch (e) {
        r = { ms: null, note: `TRIAL ERROR: ${String(e?.message ?? e).split('\n')[0].slice(0, 120)}`, wrongPeer: wrongPeerHits() };
      }
      results[arm].push(r);
      const when = r.ms === null ? `NO CROSSING in ${(CAP_MS / 1000).toFixed(0)}s` : `${(r.ms / 1000).toFixed(1)}s`;

      // UNCONDITIONALLY, and before the next trial's `clean` deletes them.
      // The label is the measurement, never anything read out of a log — see
      // KEEP_DIR's note for what conditioning on either cost before.
      const archive = keepLogs(arm, i, outcomeLabel(r.ms));
      if (archive) kept++;

      log(`  rt${arm} trial ${String(i).padStart(2)}: ${when}${r.wrongPeer ? `   wrong-peer lines: ${r.wrongPeer}` : ''}${r.note ? `   ${r.note}` : ''}${archive ? `\n              logs kept: ${archive}` : ''}`);
    }
    log('');
  }

  log('=== summary ===');
  log('');
  // THE MEDIAN IS THE WRONG STATISTIC HERE, AND IT ALREADY PRODUCED A WRONG
  // CONCLUSION ONCE. The first run's summary said "median 3.0s, 0 timed out"
  // for both arms — true, and it hid the only thing the run found: one arm had
  // a 307.5s crossing and the other had nothing above a single poll. The
  // question this file asks is about a TAIL, so the summary prints the tail.
  log(`  roundTimeoutMs   crossed   timed out   slowest   trials >${SLOW_MS / 1000}s   wrong-peer trials`);
  for (const arm of ARMS) {
    const rs = results[arm];
    const ok = rs.filter((r) => r.ms !== null).map((r) => r.ms).sort((a, b) => a - b);
    const out = rs.filter((r) => r.ms === null).length;
    const max = ok.length ? `${(ok[ok.length - 1] / 1000).toFixed(1)}s` : '—';
    const slow = ok.filter((m) => m > SLOW_MS).length;
    const wp = rs.filter((r) => r.wrongPeer > 0).length;
    log(`  ${arm.padEnd(16)} ${String(ok.length).padStart(7)}   ${String(out).padStart(9)}   ${max.padStart(7)}   ${String(slow).padStart(11)}   ${String(wp).padStart(17)}`);
  }
  log('');
  log('READ THE PER-TRIAL LINES, NOT JUST THIS TABLE. A handful of trials per');
  log('arm cannot establish a RATE to any useful precision. What a single slow');
  log('crossing CAN do is land on a constant the mechanism predicts:');
  log('`min_initiate_interval_ms` is 300s, so a crossing at ~300s plus a few');
  log('seconds is a lost round waiting out that rate limit, and a crossing');
  log('inside one poll is a round that was never lost. Magnitude carries the');
  log('information here; frequency, at this many trials, does not.');
  log('');
  if (kept > 0) {
    log(`  ${kept} trial log set(s) archived under ${KEEP_DIR}, one per trial,`);
    log('  each directory named for its own crossing time. Sort them to pick');
    log('  controls: the fastest trials ARE the controls, and a signature');
    log('  present in the slow ones and in those too explains nothing. Compare');
    log('  only trials of similar duration — a lifetime count like "No agents');
    log('  with overlapping arcs available" rises with how long a trial ran,');
    log('  so a 330s timeout against a 3s crossing is not a comparison.');
  } else {
    log(`  No logs archived — nothing was written under ${KEEP_DIR}, which`);
    log('  means no trial ever produced a conductor log. Treat the numbers');
    log('  above as unexplained rather than as a measurement.');
  }
  log('');
  if (ranOut) {
    const counts = ARMS.map((a) => `${a}:${results[a].length}`).join(' ');
    log(`  INCOMPLETE: stopped on the ${(DEADLINE_MS / 60_000).toFixed(0)}-minute budget.`);
    log(`  Trials per arm — ${counts}. Arms are interleaved, so any stop leaves`);
    log('  them within one trial of each other: the rate comparison degrades');
    log('  evenly rather than landing on whichever arm happened to run last.');
  } else {
    log(`  Complete: every arm ran its ${TRIALS} trials inside the budget.`);
  }

  // Restores the shape every other harness in this directory expects: three
  // nodes up, nodeD down. The last trial left nodeD running.
  try { net('stop-node', 'nodeD'); } catch { /* best effort */ }
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(1); });
