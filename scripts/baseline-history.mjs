#!/usr/bin/env node
// ============================================================================
// scripts/baseline-history.mjs — READINESS §3's running count, measured instead
// of hand-recorded. Row 7.40.
//
// WHAT THIS IS FOR, AND IT IS NARROWER THAN THE ROW THAT ASKED FOR IT.
//
// `partition-rejoin.mjs` ends its `MAX_SOUND_BASELINE_MS` note with an
// instruction to whoever hits the red:
//
//     "check whether the rejoin assertions below passed. If they did, this is
//      the runner being slow and the finding is the baseline figure — record it
//      in READINESS §3 beside the others rather than re-running until it goes
//      green."
//
// That instruction is right and it is **expensive**: the figures in READINESS
// §3 were gathered by reading `gh run view` logs one at a time, which is why
// its running count is eight observations dated 2026-10-14 and pooled across
// two harnesses. **This script is that instruction made cheap.** It is not a
// new analysis — READINESS §3 and `partition-rejoin.mjs`'s own header already
// carry the analysis, including three refused fixes and the reason the retry is
// held — it only replaces the hand-reading.
//
// WHAT IT DOES NOT DO, said first because row 7.40's first draft overreached.
// It does NOT decide anything, and three decisions here are already taken and
// must not be quietly reopened by a number from this script:
//
//   * RAISING THE 60s BOUND is refused. It is `DWELL_CAP_MS / 5`; clearing the
//     slowest crossing on record needs a 79-minute dwell.
//   * SILENCING THE CHECK is refused. The divergence assertion goes
//     inconclusive *because* this check is red, so a green run would prove
//     nothing.
//   * PORTING `real-gossip`'s `CROSSING_ATTEMPTS` is refused for this harness:
//     what reds is the PRECONDITION rather than a missed crossing, and this
//     harness needs the SLOWEST crossing the network produces, not a fast
//     resample.
//
// The one OPEN question it bears on is READINESS §3's own: **"whether a slow
// baseline is intermittent or routine."** A bimodal distribution with an empty
// middle is evidence for intermittent. **It is NOT evidence about consumer
// networks**, which is what the held retry decision actually waits on — these
// are datacentre runners, the same limit READINESS puts on its five crossings.
//
// TWO LIMITS OF THE INSTRUMENT ITSELF.
//
//   1. **A RE-RUN OVERWRITES THE RUN'S CONCLUSION.** `gh` reports the latest
//      attempt only, so a slow attempt that was re-run is INVISIBLE here. On
//      2026-11-21 a 200.4s attempt was re-run, landed at 275.7s, and only the
//      275.7s survives in the API. **So every rate this prints is a LOWER
//      BOUND**, and that is also the second reason not to re-run: it destroys
//      the observation the harness asked you to record.
//   2. **It reads only what a log line says.** A run whose baseline never
//      crossed has no `baseline crossed in` line at all; those are counted
//      separately as `never-crossed` rather than dropped, because dropping them
//      would bias the sample toward the measurable.
// ============================================================================

import { execFileSync } from 'node:child_process';

const WORKFLOW = 'network.yml';
const JOB_PREFIX = 'partition-rejoin';
// `DWELL_CAP_MS / 5` in partition-rejoin.mjs. Stated here as the figure the
// harness derives, not as a preference, and NOT adjustable from this script.
const MAX_SOUND_BASELINE_S = 60;

const gh = (args) =>
  execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });

const limit = Number(process.argv.find((a) => /^--limit=/.test(a))?.split('=')[1] ?? 60);

function runs() {
  return JSON.parse(
    gh(['run', 'list', '--workflow', WORKFLOW, '--limit', String(limit),
        '--json', 'databaseId,conclusion,createdAt,headSha,headBranch'])
  ).filter((r) => r.conclusion === 'success' || r.conclusion === 'failure');
}

function sample(run) {
  let jobConclusion;
  try {
    jobConclusion = JSON.parse(gh(['run', 'view', String(run.databaseId), '--json', 'jobs']))
      .jobs.filter((j) => j.name.startsWith(JOB_PREFIX))
      .map((j) => j.conclusion)[0];
  } catch {
    return null;
  }
  // A SKIPPED JOB IS NOT A PASSING JOB, AND PUTTING ONE IN THE DENOMINATOR IS
  // HOW THIS SCRIPT'S FIRST RUN REPORTED 11% WHERE THE ANSWER IS 19%.
  // `network.yml` skips `partition-rejoin` on docs-only diffs, so 20 of the
  // first 47 runs sampled had the job SKIPPED — counted as runs, measured in
  // none of them. The rate must divide by runs where the measurement actually
  // happened. Skipped runs are reported separately rather than dropped
  // silently, because a denominator you cannot see is the defect here.
  if (!jobConclusion) return null; // no such job at all
  if (jobConclusion === 'skipped' || jobConclusion === 'cancelled') {
    return { ...run, jobConclusion, baseline: null, mode: 'did-not-run' };
  }
  let log = '';
  try {
    log = gh(['run', 'view', String(run.databaseId), '--log']);
  } catch {
    return { ...run, jobConclusion, baseline: null, mode: 'log-unavailable' };
  }
  const m = log.match(/baseline crossed in ([0-9.]+)s/);
  const baseline = m ? Number(m[1]) : null;
  const neverCrossed = /The network is not carrying claims even with both nodes up/.test(log);
  return {
    ...run,
    jobConclusion,
    baseline,
    mode: baseline !== null ? 'crossed' : neverCrossed ? 'never-crossed' : 'unknown',
  };
}

const rows = runs().map(sample).filter(Boolean);
if (rows.length === 0) {
  console.log('CANNOT VERIFY: no completed run in this window carried a');
  console.log(`${JOB_PREFIX} job. Nothing was measured, which is not the same`);
  console.log('as nothing being wrong.');
  process.exit(2);
}

const ran = rows.filter((r) => r.mode !== 'did-not-run');
const didNotRun = rows.filter((r) => r.mode === 'did-not-run');
const fast = rows.filter((r) => r.baseline !== null && r.baseline <= MAX_SOUND_BASELINE_S);
const slow = rows.filter((r) => r.baseline !== null && r.baseline > MAX_SOUND_BASELINE_S);
const never = rows.filter((r) => r.mode === 'never-crossed');
const failed = rows.filter((r) => r.jobConclusion === 'failure');
const unknown = ran.filter((r) => r.mode === 'unknown' || r.mode === 'log-unavailable');

console.log(`${JOB_PREFIX} Phase 0 baseline — last ${limit} ${WORKFLOW} runs\n`);
console.log(`  ${rows.length} completed run(s); the job RAN in ${ran.length} and was skipped in ${didNotRun.length}.`);
console.log('  The rate below divides by the runs where it RAN. A skipped job is not a passing job.\n');
console.log('FAILURES, enumerated so the claim can be re-checked rather than re-estimated:');
if (failed.length === 0) console.log('  none in this window.');
for (const r of failed) {
  const what = r.baseline !== null ? `slow baseline ${r.baseline}s` : r.mode.toUpperCase();
  console.log(`  ${r.createdAt.slice(0, 16)}  ${r.headSha.slice(0, 7)}  ${r.headBranch.slice(0, 26).padEnd(26)} ${what}`);
}

console.log('\nDISTRIBUTION:');
const fs_ = fast.map((r) => r.baseline).sort((a, b) => a - b);
const ss = slow.map((r) => r.baseline).sort((a, b) => a - b);
console.log(`  fast (<= ${MAX_SOUND_BASELINE_S}s): ${fast.length} run(s)` + (fs_.length ? `  ${fs_[0]}s .. ${fs_.at(-1)}s` : ''));
console.log(`  slow (>  ${MAX_SOUND_BASELINE_S}s): ${slow.length} run(s)` + (ss.length ? `  ${ss[0]}s .. ${ss.at(-1)}s` : ''));
console.log(`  never crossed at all:  ${never.length} run(s)`);
if (fs_.length && ss.length) {
  console.log(`  GAP between the regimes: ${fs_.at(-1)}s .. ${ss[0]}s — nothing observed inside it`);
  console.log('  Two regimes with an empty middle is evidence for INTERMITTENT');
  console.log('  rather than routine, which is READINESS §3\'s open question. It is');
  console.log('  NOT evidence about consumer networks, which is what the held');
  console.log('  retry decision actually waits on.');
}

if (unknown.length) {
  console.log(`  UNCLASSIFIED: ${unknown.length} run(s) where the job ran but no baseline line was found.`);
  console.log('  Named rather than dropped, because a silently shrinking denominator is');
  console.log('  the defect this script already committed once.');
}
const rate = ((failed.length / ran.length) * 100).toFixed(0);
console.log(`\nRATE: ${failed.length} of ${ran.length} run(s) where the job ran = ${rate}%, a LOWER BOUND —`);
console.log('a re-run overwrites the run\'s conclusion, so any slow attempt that was');
console.log('re-run is invisible to this script. Do not re-run to go green; record');
console.log('the figure, which is what partition-rejoin.mjs asks for.');
console.log('\nThe analysis is NOT here: READINESS §3 and partition-rejoin.mjs\'s');
console.log('MAX_SOUND_BASELINE_MS note carry it, including three refused fixes.');

// Exit 0 always: this is an inventory, not a gate. It asserts nothing about
// whether today's run should have passed, and a non-zero exit would invite
// somebody to wire it into CI, where its own input (run history) makes it
// meaningless as a per-commit check.
process.exit(0);
