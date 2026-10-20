#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/metabolism.mjs — THE PROTOCOL HAS A PRESENT TENSE,
// verified by watching something happen while nothing is calling it.
//
// READINESS item 8. `metabolic_tick` is the first `#[hdk_extern(infallible)]`
// in this repository: a function the HOST runs on its own scheduler, with no
// client, no workflow and no caller. Everything else here happens as the
// synchronous consequence of a zome call.
//
// THE CENTRAL ASSERTION IS AN ABSENCE OF CAUSE, which is harder to test than a
// presence and is the only thing worth testing here. "A signal arrived" proves
// nothing on its own — a signal arrives whenever anybody calls `create_claim`.
// What has to be shown is that one arrived with NO CALL HAVING BEEN MADE, so
// this harness:
//
//   1. subscribes, waits, and asserts NO tick arrives before it is started —
//      the control, without which every assertion below passes vacuously on a
//      conductor that was already ticking from an earlier run;
//   2. calls `start_metabolism` ONCE, and nothing else, ever again;
//   3. waits in silence and asserts a tick arrives anyway;
//   4. keeps waiting and asserts a SECOND tick arrives, because one tick only
//      proves `schedule()` fires, and the claim is that it RECURS;
//   5. asserts the DHT is byte-identical across all of it.
//
// Between step 2 and the end, this process makes NO zome call of any kind. That
// is the point, and it is why the counts in step 5 are taken before step 2 and
// after the last tick rather than continuously — a poll would itself be the
// external call whose absence is under test.
//
// WHY A SECOND TICK IS WORTH THE WAIT. `schedule()` "will trigger it once
// unconditionally on the next iteration of the conductor's internal scheduler
// loop", so a single tick is consistent with a function that fired once and
// returned `None`. Only the second tick distinguishes a heartbeat from a
// one-shot, and `metabolic_tick` returning `Some(Ephemeral(..))` is exactly what
// that tests. The first tick is fast (the loop runs every 100ms–10s); the second
// waits out METABOLIC_TICK_SECS, which is why this harness takes ~2 minutes.
//
// Prereqs: a sandbox conductor (scripts/sandbox.sh clean && start) and a built
// .happ. No browser: there is no screen for this yet, and asserting one would
// be testing nothing.
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
//   AN: `metabolic_tick` returns `None` instead of a schedule.
//   Result: 1 red. The first tick still arrives and the SECOND never does —
//   the one-shot-versus-heartbeat distinction, caught by the only check that
//   can see it.
//
//   AO: an autonomous `create_entry` added to the tick.
//   Result: IT PASSED, and that was the finding. The no-write check read
//   `get_claims_by_domain(DOMAIN)` — only the domain this test seeded — and an
//   autonomous writer has no reason to write there, so a tick writing to a
//   domain of its own was invisible. The assertion read as "the tick wrote
//   nothing" and tested "the tick wrote nothing HERE".
//
//   The fix is in section 6: the ticks' own chain-local `own_claims` is
//   compared ACROSS ticks. A scheduled function runs as the author of the chain
//   it runs for, so anything it writes lands on the chain the next tick counts,
//   whatever domain it chose — and it needs no extra zome call, which matters
//   because a call is the thing whose absence is under test. AO now reds with
//   `own_claims: 1, 2`, and the restored code reports `1, 1`.
//
// Re-check both the same way if you change what this asserts.
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_ID = 'epistemic-resonance-happ';
const DOMAIN = `Metabolism${Date.now()}`;

// The tick interval the zome compiles in. Kept here as a number to wait
// against, with a generous multiplier: the host refuses to promise scheduler
// granularity ("historically ranged from once every 100ms to every 10s"), so a
// tight window would red on the host's timing rather than on the subject.
const TICK_SECS = 60;
const FIRST_TICK_WAIT_MS = 30_000;
const SECOND_TICK_WAIT_MS = (TICK_SECS + 45) * 1000;
const CONTROL_QUIET_MS = 12_000;

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (u8) => Buffer.from(u8).toString('base64');
const nowSecs = () => Math.floor(Date.now() / 1000);

async function main() {
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: APP_ID });
  const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });

  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      if (cell?.type === CellType.Provisioned || cell?.type === CellType.Cloned) cellIds.push(cell.value.cell_id);
    }
  }
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  const me = cellIds[0][1];
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });

  log(`agent = ${b64(me).slice(0, 12)}…\n`);

  // Every tick this process ever sees, with the wall-clock time it arrived, so
  // the gaps can be reported rather than merely asserted.
  const ticks = [];
  // THE SIGNAL SHAPE IS NESTED, and reading it flat is how this harness first
  // reported the scheduler as broken when it was working perfectly.
  //
  // `@holochain/client` 0.21 delivers `{ type: 'app', value: { cell_id,
  // zome_name, payload } }`. The older flat shape — `signal.zome_name` with the
  // payload on `signal.data` — matches nothing, so a filter written against it
  // discards EVERY signal and the absence is indistinguishable from a function
  // that never ran. Measured here: a direct call to `metabolic_tick` returned
  // `Ephemeral(60s)` and emitted a signal, while this harness saw nothing.
  //
  // Same client change as the `CellInfo` discriminated union this directory
  // already documents in `connectApp`. `bridge/src/index.ts:399` still reads
  // the FLAT shape and is therefore discarding every signal it receives — see
  // READINESS item 21.
  app.on('signal', (signal) => {
    const inner = signal?.value ?? signal;
    if (inner?.zome_name !== 'epistemic_coordinator') return;
    const payload = inner.payload ?? inner.data;
    if (payload && typeof payload === 'object' && 'MetabolicTick' in payload) {
      ticks.push({ at: Date.now(), observation: payload.MetabolicTick });
    }
  });

  // === 1. The control: nothing is ticking yet ============================
  log('--- 1. The control: no tick before anything starts one ---');
  log(`    listening quietly for ${CONTROL_QUIET_MS / 1000}s ...`);
  await sleep(CONTROL_QUIET_MS);
  check('CONTROL: no metabolic tick arrives before start_metabolism is called',
    ticks.length === 0);
  if (ticks.length > 0) {
    log(`    ${ticks.length} tick(s) already arriving — this conductor is already`);
    log('    ticking from an earlier run, so every assertion below would pass');
    log('    vacuously. Restart it: scripts/sandbox.sh clean && scripts/sandbox.sh start');
    log(`\n${failures} CHECK(S) FAILED`);
    process.exit(1);
  }

  // === 2. Seed something for the tick to observe, and count the DHT ======
  log('\n--- 2. Seeding state, then recording what the DHT holds ---');
  await call('create_claim', {
    content: 'A claim for the heartbeat to count.',
    domain: DOMAIN, confidence: 'Moderate', evidence_hashes: [],
    semantic_tags: [], author: me, timestamp: Date.now() * 1000,
  });
  const claimsBefore = (await call('get_claims_by_domain', DOMAIN)).length;
  check('the seeded claim is readable, so there is something to observe',
    claimsBefore === 1);

  // === 3. One call, and then silence ====================================
  log('\n--- 3. start_metabolism, and then NO further call from this process ---');
  await call('start_metabolism', null);
  log('    scheduled. From here this process makes no zome call at all.');
  const startedAt = Date.now();

  log(`    waiting up to ${FIRST_TICK_WAIT_MS / 1000}s for a tick with nobody calling ...`);
  const deadline1 = Date.now() + FIRST_TICK_WAIT_MS;
  while (ticks.length < 1 && Date.now() < deadline1) await sleep(500);

  check('A TICK ARRIVES WITH NO CALL HAVING BEEN MADE — the protocol has a present tense',
    ticks.length >= 1);
  if (ticks.length < 1) {
    log('    Nothing arrived. Either schedule() did not take, or the host is not');
    log('    running its scheduler loop. Check the conductor log for metabolic_tick.');
    log(`\n${failures} CHECK(S) FAILED`);
    process.exit(1);
  }
  const first = ticks[0];
  log(`    first tick after ${((first.at - startedAt) / 1000).toFixed(1)}s`);

  // === 4. What it saw ====================================================
  log('\n--- 4. The observation it carried ---');
  const o = first.observation;
  log(`    ${JSON.stringify(o)}`);
  check('the tick carries a host timestamp, which validation could not have reached',
    typeof o?.at_secs === 'number' && Math.abs(o.at_secs - nowSecs()) < 300);
  check('it counted the claim this agent actually has',
    o?.own_claims === claimsBefore);
  check('it declares that it wrote nothing, rather than leaving that implied',
    o?.wrote_nothing === true);

  // === 5. It RECURS, which one tick cannot show =========================
  log('\n--- 5. A second tick, which is what separates a heartbeat from a one-shot ---');
  log(`    waiting up to ${(SECOND_TICK_WAIT_MS / 1000).toFixed(0)}s ...`);
  const deadline2 = Date.now() + SECOND_TICK_WAIT_MS;
  while (ticks.length < 2 && Date.now() < deadline2) await sleep(1000);

  check('IT RECURS: a second tick arrives, so metabolic_tick rescheduled itself',
    ticks.length >= 2);
  if (ticks.length >= 2) {
    const gap = (ticks[1].at - ticks[0].at) / 1000;
    log(`    gap between ticks: ${gap.toFixed(1)}s (floor is ${TICK_SECS}s; the host promises no granularity)`);
    check('and the gap is at least the compiled-in floor, not faster',
      gap >= TICK_SECS - 5);
  }

  // === 6. Nothing was written ===========================================
  log('\n--- 6. The DHT is byte-identical: the clock moved, the record did not ---');
  const claimsAfter = (await call('get_claims_by_domain', DOMAIN)).length;
  check("no claim appeared in this test's own domain", claimsAfter === claimsBefore);
  check('every tick reported writing nothing',
    ticks.every((t) => t.observation?.wrote_nothing === true));

  // THE DOMAIN-SCOPED CHECK ABOVE IS NOT ENOUGH, and an injection proved it.
  //
  // Injection AO made the tick create a Claim in a domain of its own, and this
  // harness PASSED every check — because `get_claims_by_domain(DOMAIN)` reads
  // only the domain this test seeded, and an autonomous writer has no reason to
  // write there. The assertion read as "the tick wrote nothing" and tested "the
  // tick wrote nothing HERE", which is the weaker claim and the one that cannot
  // catch the thing it exists to catch.
  //
  // THE TICKS THEMSELVES ARE THE INSTRUMENT. `own_claims` is a CHAIN-LOCAL
  // count, and a scheduled function runs as the author of the chain it runs
  // for — so anything a tick writes lands on the chain the NEXT tick counts,
  // whatever domain it chose. Comparing the counts across ticks therefore
  // detects a self-write anywhere, and it needs no extra zome call, which
  // matters because a call is the thing whose absence is under test.
  const counts = ticks.map((t) => t.observation?.own_claims);
  const grew = counts.some((c) => c !== counts[0]);
  check('ITS OWN CHAIN DID NOT GROW across ticks — detects a write to ANY domain, not just this one',
    ticks.length >= 2 && !grew);
  log(`    own_claims across ${ticks.length} tick(s): ${counts.join(', ')}`);
  log(`    ${ticks.length} tick(s) observed, ${claimsAfter} claim(s) in ${DOMAIN} — unchanged`);

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — the host ran a function this process never called,');
    log('twice, and the DHT is exactly as it was. The protocol has a present');
    log('tense, and it still writes nothing on its own.');
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nHARNESS ERROR:', e);
  process.exit(1);
});
