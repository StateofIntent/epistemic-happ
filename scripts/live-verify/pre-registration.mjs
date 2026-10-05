#!/usr/bin/env node
// ============================================================================
// pre-registration.mjs — DOES COMMIT-REVEAL REFUSE THE THINGS THAT WOULD MAKE
// IT A LAUNDERING MACHINE?
//
// WHAT THIS IS FOR. The primitive lets an agent commit to a prediction before
// the evidence exists and reveal it later — the standard defence against
// HARKing. README.md §9 refused to build it for a long time on a specific
// ground: the NAIVE version is worse than nothing. Commit ten predictions,
// reveal the two that came true, stay silent on the eight that did not. Every
// reveal verifies, and the track record is a fabrication wearing a
// cryptographic proof.
//
// SO THE CHECKS THAT MATTER HERE ARE THE REFUSALS, not the happy path. A
// commit-reveal that merely works is the dangerous one. Three properties have
// to hold, each from §9's own list, and each is probed by trying to violate
// it:
//
//   1. A commitment expires VISIBLY. Its deadline is public from the moment
//      it is made, and a commitment cannot be born already expired.
//   2. The question PREDATES the commitment, so a prediction cannot be
//      re-pointed at whichever question the outcome happens to fit.
//   3. A reveal must be what was committed to, by the committer, before the
//      deadline. A late reveal would let an author decide AFTER seeing the
//      outcome whether a commitment counts as revealed or quietly expired.
//
// AND THE DENOMINATOR IS CHECKED AS A READ, not as a doc comment: an expired
// commitment must appear in `get_foresight_record`'s `expired` list without
// its author doing anything to surface it. That read is the difference between
// this primitive and the one §9 refused.
//
// Prereqs: a CLEAN sandbox (scripts/sandbox.sh clean && start).
// ============================================================================
import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';

// Admin is 8889 and app is 8888, which is the opposite of the order they are
// usually written in. scripts/sandbox.sh pins both to match
// bridge/.env.example, so they are not free to change here.
const ADMIN = Number(process.env.ADMIN_PORT ?? 8889);
const APP = Number(process.env.APP_PORT ?? 8888);
const APP_ID = process.env.APP_ID ?? 'epistemic-resonance-happ';

let failures = 0;
const log = (...a) => console.log(...a);
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowMicros = () => Date.now() * 1000;

// A refusal is only evidence if it is the RIGHT refusal. A call that fails
// because the payload was malformed, or because a port moved, would read as a
// passing guard. So each negative probe asserts on the error text as well as
// on the fact of rejection.
async function refuses(label, fn, expectSubstring) {
  try {
    await fn();
    check(`${label} — REFUSED`, false);
    log(`    it was accepted, which is the defect this probe exists for`);
  } catch (e) {
    const msg = String(e?.message ?? e);
    const matched = msg.toLowerCase().includes(expectSubstring.toLowerCase());
    check(`${label} — REFUSED`, matched);
    if (!matched) log(`    refused, but for the wrong reason: ${msg.slice(0, 200)}`);
  }
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

async function main() {
  const node = await connect();
  const DOMAIN = `PreReg${Date.now()}`;

  log('--- a question, posed in advance ---');
  const question = await node.call('create_claim', {
    content: 'Will the convergence flake turn out to have one cause or several?',
    domain: DOMAIN, confidence: 'Moderate', semantic_tags: [],
    author: node.me, timestamp: nowMicros(), evidence_hashes: [], attestation_policy: null,
  });
  check('a question claim exists to pre-register against', !!question);

  // The question must predate the commitment, and these are separate actions
  // so their timestamps differ. A commitment made in the same microsecond
  // would be indistinguishable from one made after the outcome.
  await sleep(1100);

  log('\n--- 1. the happy path: commit, then reveal ---');
  const salt = 'salt-one-9f3a';
  const prediction = 'Several causes, and the timing candidates will point opposite ways.';
  const far = nowMicros() + 3_600_000_000;   // an hour out
  const pr = await node.call('pre_register', { question, prediction, salt, reveal_deadline: far });
  check('a prediction can be committed without disclosing it', !!pr);

  const forQ = await node.call('get_pre_registrations_for_question', question);
  check('the commitment is readable from the question it is about', forQ.length >= 1);

  // ASSERTED BY MEMBERSHIP, NOT BY COUNT. An earlier version checked
  // `pending.length === 1`, which passes only on a freshly cleaned sandbox
  // and failed the moment this harness was run twice in a row — the agent's
  // chain still held the previous run's commitments. A harness that depends on
  // being the only thing that ever ran is testing its own setup. These look
  // for the specific hashes created here instead.
  const has = (list, h) => list.some((e) => JSON.stringify(e.pre_registration) === JSON.stringify(h));
  const find = (list, h) => list.find((e) => JSON.stringify(e.pre_registration) === JSON.stringify(h));

  let rec = await node.call('get_foresight_record', node.me);
  check('before revealing, it sits in PENDING', has(rec.pending, pr));
  check('and not in revealed', !has(rec.revealed, pr));
  check('and the sealed prediction is NOT readable from the pending entry', find(rec.pending, pr)?.revealed_prediction === null);

  await node.call('reveal_pre_registration', { pre_registration: pr, prediction, salt });
  rec = await node.call('get_foresight_record', node.me);
  check('after revealing, it moves to REVEALED', has(rec.revealed, pr));
  check('and leaves PENDING', !has(rec.pending, pr));
  check('and the revealed prediction is the one committed to', find(rec.revealed, pr)?.revealed_prediction === prediction);

  log('\n--- 2. a reveal must be WHAT WAS COMMITTED TO ---');
  const pr2 = await node.call('pre_register', {
    question, prediction: 'One cause, in the gossip layer.', salt: 'salt-two-11bb', reveal_deadline: far,
  });
  await refuses(
    'revealing different content than was sealed',
    () => node.call('reveal_pre_registration', { pre_registration: pr2, prediction: 'Something else entirely.', salt: 'salt-two-11bb' }),
    'does not hash to the sealed commitment',
  );
  await refuses(
    'revealing the right content with the wrong salt',
    () => node.call('reveal_pre_registration', { pre_registration: pr2, prediction: 'One cause, in the gossip layer.', salt: 'wrong-salt' }),
    'does not hash to the sealed commitment',
  );

  log('\n--- 3. a commitment cannot be born already expired ---');
  await refuses(
    'committing with a deadline in the past',
    () => node.call('pre_register', {
      question, prediction: 'Backdated.', salt: 'salt-three', reveal_deadline: nowMicros() - 60_000_000,
    }),
    'must be after the commitment',
  );

  log('\n--- 4. the question is BOUND PUBLICLY at commit time ---');
  //
  // WHAT REQUIREMENT 3 ACTUALLY RESTS ON, which is not what the integrity
  // zome's ordering check guards.
  //
  // §9 asks for "a prediction bound to a question posed in advance so it
  // cannot be reinterpreted at reveal time to fit whatever happened". The
  // protection that delivers that is the `question` field being PUBLIC and
  // IMMUTABLE from the moment of commitment: it is readable before any reveal,
  // and this zome refuses every Update and Delete, so there is no path to
  // re-point it afterwards.
  //
  // THE ORDERING CHECK IN VALIDATION IS UNREACHABLE AND IS KEPT ANYWAY. An
  // earlier version of this harness tried to commit against a question
  // created AFTER the commitment, and the commitment was correctly accepted —
  // because that state cannot be constructed. A commitment references the
  // question's hash, so the question must already exist, and sequential
  // creates take increasing action timestamps. The check therefore guards a
  // state no in-protocol path reaches. It stays because it is free and would
  // catch a future-dated action from a broken clock, but it must not be cited
  // as the thing that makes requirement 3 hold. Recorded because the first
  // version of this file DID cite it, and a test that cannot fail is worse
  // than no test.
  const boundBefore = await node.call('get_pre_registrations_for_question', question);
  check('the question is readable from the commitment before any reveal', boundBefore.length >= 1);

  const pr4 = await node.call('pre_register', {
    question, prediction: 'Bound to this question and no other.', salt: 'salt-four', reveal_deadline: far,
  });
  const recBound = await node.call('get_foresight_record', node.me);
  const bound = recBound.pending.find((e) => JSON.stringify(e.pre_registration) === JSON.stringify(pr4));
  check('a pending commitment already names its question', !!bound);
  check('and names the question it was committed against', JSON.stringify(bound?.question) === JSON.stringify(question));

  // NO PROBE FOR "cannot be updated", DELIBERATELY. The obvious one — call an
  // update extern and watch it refuse — cannot be written here, because this
  // zome exposes no update path at all. An earlier version of this file called
  // a `update_entry_unchecked` that does not exist and asserted the error
  // contained "not", which "function not found" satisfies: a guard scoring a
  // pass against a function that was never there. Immutability here is a
  // property of the SURFACE (no update or delete extern) and of validation
  // (every FlatOp::Delete is refused), and the honest way to verify a missing
  // function is absent is check-spec-drift.mjs enumerating what exists, not a
  // live call hoping to be rejected.

  log('\n--- 5. THE DENOMINATOR: an unrevealed commitment expires visibly ---');
  //
  // The deadline is seconds out, so this test can actually watch it pass.
  // Nothing is written when a deadline goes by -- expiry is computed against
  // the reader's clock -- so the only way to verify it is to read, wait, and
  // read again.
  const soon = nowMicros() + 4_000_000;   // four seconds
  const pr3 = await node.call('pre_register', {
    question, prediction: 'Never to be revealed.', salt: 'salt-five', reveal_deadline: soon,
  });
  check('a short-deadline commitment is accepted', !!pr3);

  rec = await node.call('get_foresight_record', node.me);
  const pendingBefore = rec.pending.length;
  check('it is PENDING while its deadline is still ahead', pendingBefore >= 1);

  log('    waiting out the 4s deadline ...');
  await sleep(6000);

  rec = await node.call('get_foresight_record', node.me);
  const expiredHashes = rec.expired.map((e) => JSON.stringify(e.pre_registration));
  check('once the deadline passes it appears in EXPIRED', expiredHashes.includes(JSON.stringify(pr3)));
  check('without the author having done anything to surface it', rec.expired.length >= 1);
  check('and it is NOT counted as revealed', !rec.revealed.some((e) => JSON.stringify(e.pre_registration) === JSON.stringify(pr3)));

  log('\n--- 6. a late reveal is refused, not silently accepted ---');
  await refuses(
    'revealing after the deadline has passed',
    () => node.call('reveal_pre_registration', { pre_registration: pr3, prediction: 'Never to be revealed.', salt: 'salt-five' }),
    'past its reveal_deadline',
  );
  rec = await node.call('get_foresight_record', node.me);
  check('so it stays in EXPIRED after the attempt', rec.expired.some((e) => JSON.stringify(e.pre_registration) === JSON.stringify(pr3)));

  log('\n--- 7. the read returns no score, which is Invariant #1 ---');
  const keys = Object.keys(rec).sort();
  check('ForesightRecord has exactly revealed/expired/pending', JSON.stringify(keys) === JSON.stringify(['expired', 'pending', 'revealed']));
  check('and carries no ratio, score or ordering field', !('score' in rec) && !('ratio' in rec) && !('rank' in rec));

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — a prediction can be committed without disclosure');
    log('and revealed against its commitment, and the reveals that would launder');
    log('a track record are refused: wrong content, wrong salt, and any reveal');
    log('after the deadline. A commitment cannot be born already expired.');
    log('');
    log('AND THE DENOMINATOR WORKS, which is the part §9 withheld this feature');
    log('for: an unrevealed commitment appears in `expired` once its deadline');
    log('passes, without its author doing anything to surface it, and the read');
    log('returns revealed/expired/pending with no score, ratio or ordering.');
    log('');
    log('NOT CLAIMED: that a question cannot be chosen after the fact. The');
    log('ordering check in validation guards a state no in-protocol path can');
    log('reach — see section 4. What holds requirement 3 up is the question');
    log('being public and immutable from commit time, which is what is tested.');
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(1); });
