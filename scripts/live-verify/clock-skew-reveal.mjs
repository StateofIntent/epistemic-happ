#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/clock-skew-reveal.mjs — READINESS.md queue item 13.
//
// DOES THE reveal_deadline REFUSAL SURVIVE A DISHONEST CLOCK?
//
// SPEC §5.22 argues, from source, that it does not: `hdi` exposes no
// `sys_time`, so validation compares `action.timestamp()` against
// `pr.reveal_deadline` with nothing anchoring the former to real time. The
// host checks only chain-local monotonicity (`check_prev_timestamp`,
// `t2 >= t1`). That section says plainly it is an argument and not a result.
// This file is the result, either way.
//
// WHY `pre-registration.mjs` CANNOT ANSWER THIS. Its §6 already asserts that
// a late reveal is refused, and it passes — but it runs against an HONEST
// conductor, which stamps `Timestamp::now()` itself. An honest conductor can
// only ever demonstrate honest behaviour. The discriminating case needs the
// author's clock to lie, which is exactly the adversary the mechanism exists
// to stop (SECURITY.md already names hot-swappable coordinators).
//
// HOW THE CLOCK IS MOVED. libfaketime, via LD_PRELOAD on the conductor AND on
// this process, with FAKETIME_TIMESTAMP_FILE + FAKETIME_NO_CACHE=1 so the
// offset can be rewritten between phases and both processes re-read it. The
// offset applies to CLOCK_REALTIME only; CLOCK_MONOTONIC is untouched, so
// Node's timers still measure real durations.
//
// THE THREE PHASES, and the monotonicity constraint that shapes them:
//
//   A  offset +0      commit with a deadline 300s out.                 accept
//   B  offset +3600   the window is long past. Read it as expired,
//                     then try an honest reveal.                       refuse
//   C  offset +60     back inside the window. Try again.                   ???
//
// C is the attack. It only works because B's refusal writes NOTHING to the
// chain — if B had committed, the monotonic floor would sit at +3600 and C
// would be refused by SYS validation with a PrevActionError, which is a
// different refusal and is checked for separately below so it cannot be
// mistaken for the deadline holding.
//
// Run: scripts/run-clock-skew-probe.sh  (it builds nothing; see that file)
// ============================================================================
import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { writeFileSync } from 'node:fs';

const ADMIN = Number(process.env.ADMIN_PORT ?? 8889);
const APP = Number(process.env.APP_PORT ?? 8888);
const APP_ID = process.env.APP_ID ?? 'epistemic-resonance-happ';
const TSF = process.env.FAKETIME_TIMESTAMP_FILE;

let failures = 0;
const log = (...a) => console.log(...a);
const check = (label, cond, detail) => {
  log(`  ${cond ? 'ok  ' : 'FAIL'}: ${label}`);
  if (!cond) { failures++; if (detail) log(`        ${detail}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowMicros = () => Date.now() * 1000;

// Move BOTH clocks. NO_CACHE=1 means the next clock_gettime in either process
// re-reads this file, so there is nothing to wait for beyond the write itself.
function setOffset(spec) {
  if (!TSF) throw new Error('FAKETIME_TIMESTAMP_FILE is not set — run this through scripts/run-clock-skew-probe.sh');
  writeFileSync(TSF, spec);
}

async function connect() {
  const admin = await AdminWebsocket.connect({ url: new URL(`ws://localhost:${ADMIN}`), wsClientOptions: { origin: 'live-verify' } });
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: APP_ID });
  const app = await AppWebsocket.connect({ url: new URL(`ws://localhost:${APP}`), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const ids = [];
  for (const cells of Object.values(info.cell_info))
    for (const c of cells) if (c?.type === CellType.Provisioned) ids.push(c.value.cell_id);
  if (ids.length === 0) throw new Error('no provisioned cell');
  for (const id of ids) {
    for (let i = 0; i < 30; i++) {
      try { await admin.authorizeSigningCredentials(id); break; }
      catch (e) { if (!String(e.message ?? e).includes('CellDisabled')) throw e; await sleep(1000); }
    }
  }
  return {
    me: ids[0][1],
    call: (fn, payload) => app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload }, 60000),
  };
}

const sameHash = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  log('=== item 13: does the reveal_deadline refusal survive a dishonest clock? ===\n');

  // --- the clock is ours before anything else happens ---
  setOffset('+0');
  const node = await connect();
  const realStart = new Date().toISOString();
  log(`  faketime file: ${TSF}`);
  log(`  conductor + probe clock at offset +0 (${realStart})\n`);

  const DOMAIN = `ClockSkew${Date.now()}`;
  const PREDICTION = 'The deadline is enforced against a number the author writes.';
  const SALT = 'item-13-salt-7c1f';

  log('--- A. commit, with the clock honest and a 300s window ---');
  const question = await node.call('create_claim', {
    content: 'Does validation enforce reveal_deadline against real time?',
    domain: DOMAIN, confidence: 'Moderate', semantic_tags: [],
    author: node.me, timestamp: nowMicros(), evidence_hashes: [], attestation_policy: null,
  });
  check('a question claim exists to pre-register against', !!question);
  await sleep(1500);  // the question MUST predate the commitment (lib.rs:1159)

  const committedAt = nowMicros();
  const deadline = committedAt + 300_000_000;   // 300s out
  const pr = await node.call('pre_register', {
    question, prediction: PREDICTION, salt: SALT, reveal_deadline: deadline,
  });
  check('the commitment is accepted', !!pr);
  log(`        deadline is 300s after commit, at fake-epoch ${Math.floor(deadline / 1e6)}`);

  let rec = await node.call('get_foresight_record', node.me);
  check('it is PENDING while its deadline is ahead', rec.pending.some((e) => sameHash(e.pre_registration, pr)));

  // -------------------------------------------------------------------------
  log('\n--- B. CONTROL: jump the clock an hour ahead; the window is long past ---');
  setOffset('+3600');
  await sleep(300);
  log(`        probe now believes it is ${new Date().toISOString()}`);

  rec = await node.call('get_foresight_record', node.me);
  const isExpired = rec.expired.some((e) => sameHash(e.pre_registration, pr));
  check('the commitment now reads as EXPIRED, with nothing written to surface it', isExpired);

  let bRefused = false, bMsg = '';
  try {
    await node.call('reveal_pre_registration', { pre_registration: pr, prediction: PREDICTION, salt: SALT });
  } catch (e) { bRefused = true; bMsg = String(e?.message ?? e); }
  check('an HONEST late reveal is refused (reproduces pre-registration.mjs §6)', bRefused, bMsg || 'the call was ACCEPTED');
  if (bRefused) {
    check('and refused for the deadline, naming the rule', bMsg.toLowerCase().includes('past its reveal_deadline'),
      `got: ${bMsg.slice(0, 220)}`);
  }

  rec = await node.call('get_foresight_record', node.me);
  check('it is still EXPIRED after the refused attempt', rec.expired.some((e) => sameHash(e.pre_registration, pr)));
  check('and still NOT revealed', !rec.revealed.some((e) => sameHash(e.pre_registration, pr)));

  // -------------------------------------------------------------------------
  log('\n--- C. THE ATTACK: set the clock back inside the window and reveal ---');
  log('        the outcome is already known to the author; only the clock changed');
  setOffset('+60');
  await sleep(300);
  log(`        probe now believes it is ${new Date().toISOString()}`);

  let accepted = false, cMsg = '', revHash = null;
  try {
    revHash = await node.call('reveal_pre_registration', { pre_registration: pr, prediction: PREDICTION, salt: SALT });
    accepted = true;
  } catch (e) { cMsg = String(e?.message ?? e); }

  const prevActionError = /PrevActionError|prev action|InvalidSeq|Timestamp\(/i.test(cMsg);

  log('');
  if (accepted) {
    log('  >>> ACCEPTED. The backdated reveal was committed.');
    check('the Revelation committed with a backdated action timestamp', true);
    rec = await node.call('get_foresight_record', node.me);
    check('and it now reads as REVEALED rather than expired',
      rec.revealed.some((e) => sameHash(e.pre_registration, pr)));
    check('and the revealed prediction is the one committed to',
      rec.revealed.find((e) => sameHash(e.pre_registration, pr))?.revealed_prediction === PREDICTION);
    check('and it has left EXPIRED', !rec.expired.some((e) => sameHash(e.pre_registration, pr)));

    log('\n  --- does the fraud persist once the clock is honest again? ---');
    setOffset('+3600');
    await sleep(300);
    rec = await node.call('get_foresight_record', node.me);
    check('with the clock restored, it STILL reads as revealed',
      rec.revealed.some((e) => sameHash(e.pre_registration, pr)),
      'if this fails the record is clock-dependent on read, which would be a different finding');
  } else if (prevActionError) {
    log('  >>> REFUSED BY SYS VALIDATION, not by the deadline.');
    log('      The monotonic floor moved, so phase B must have written to the chain');
    log('      after all. This run does NOT test the deadline — see the header.');
    check('phase C was a clean test of the deadline rule', false, cMsg.slice(0, 300));
  } else {
    log('  >>> REFUSED. The deadline held even with the clock moved back.');
    check('the backdated reveal was refused', true);
    check('refused naming the deadline rule', cMsg.toLowerCase().includes('past its reveal_deadline'),
      `got: ${cMsg.slice(0, 300)}`);
    log('      SPEC §5.22 would be REFUTED: something bounds the action timestamp');
    log('      that this probe has not located. Capture the message above.');
  }

  // -------------------------------------------------------------------------
  log('\n=== VERDICT ===');
  if (accepted) {
    log('  SPEC §5.22 CONFIRMED. A reveal whose window has passed in real time was');
    log('  accepted by moving the authoring conductor\'s clock back inside it.');
    log('  The denominator holds; the deadline\'s authority does not.');
  } else if (prevActionError) {
    log('  INCONCLUSIVE — phase B dirtied the chain. Re-run with phase B\'s reveal');
    log('  attempt made against a SEPARATE commitment.');
  } else {
    log('  SPEC §5.22 REFUTED as written. The refusal survived clock manipulation.');
  }

  log(`\n${failures} CHECK(S) FAILED.`);
  setOffset('+0');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  log(`\nSETUP FAILED: ${e?.message ?? e}`);
  try { setOffset('+0'); } catch { /* the file may not be ours */ }
  process.exit(2);
});
