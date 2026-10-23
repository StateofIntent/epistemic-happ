#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/ordering-policy.mjs — THE O DIAL, AND THE ONE THING IT
// REFUSES TO CONSULT.
//
// Light Cone Consistency (arXiv 2605.09114) splits observer-relative
// consistency into two coupled dials: C, the closure filter deciding which
// dependencies an observer must have seen, and O, the ordering of the
// concurrent forks that filter admits. This protocol already had C —
// `which_entries_resolve_locally`, SPEC §5.3's closure, validation's dependency
// fetch. O was unset, so every reader invented its own sequence for two
// critiques written in ignorance of each other.
//
// WHAT IS BEING VERIFIED IS A DETERMINISTIC REPLAY ORDER, NOT A GLOBAL ONE,
// and the distinction is the whole reason this file states it twice. Landers &
// Kramer put linearizability outside a single observer's reach by construction
// — "a composite of two systems, a store and a global real-time serializer
// supplying an order no single observer's light cone can" — and Burgess &
// Gerlits derive their invariant global ordering from a hierarchy whose parent
// nodes are "a single point of calibration", which this DNA does not have.
// What `order_records` promises is narrower and checkable: every observer
// handed the same set computes the same sequence, and causality is never
// violated. That is enough to make settlement a pure function of (policy,
// input set) — which is what makes two aggregators disagreeing VISIBLE rather
// than hidden.
//
// ---------------------------------------------------------------------------
// §4 IS THE CHECK THAT MATTERS AND THE REASON THIS FILE EXISTS.
//
// Author timestamps are self-reported. SPEC §5.22 records that validation
// cannot reach a clock at all, and READINESS item 14 MEASURED a
// `reveal_deadline` being backdated by moving the authoring conductor's clock
// — permanently, since the resulting entry cannot be deleted. An order built
// on those numbers is an order the author chooses.
//
// So §4 writes a record whose timestamp claims it came first by a year, and
// requires the order to ignore it. A policy that consulted timestamps would
// pass every other check in this file.
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — and ALL THREE INJECTIONS PASSED AGAINST THE FIRST
// VERSION OF THIS FILE, which is the finding worth more than the dial.
//
// Each section asserted that a causal rule produced the right order, and each
// used records that were ALREADY in the right order by hash. Deleting the rule
// under test therefore changed nothing: the tie-break silently produced the
// same answer the rule would have. Three checks that could not go red, written
// by somebody who had spent the previous two days cataloguing exactly that
// failure in this repository.
//
// THE GENERAL FORM, worth carrying to any ordering test: a check is only
// sensitive when the policy under test and the policy it must NOT be give
// DIFFERENT answers on the data. So every section here now chooses records
// whose hash order CONTRADICTS the order the rule must produce.
//
// AND A SECOND GENERAL FORM, learned three times in this one file: WHEN A
// SETUP SEARCHES FOR THE DATA A CHECK NEEDS, THE SEARCH CAN MISS, AND THE SIZE
// OF THE SEARCH SPACE IS NOT THE ODDS OF MISSING. "Under 1%" was 1 in 256.
// "About 1 in 10^19" was 1 in 12,870. `2^-496` and `2^-256` were 2^-118 and
// 2^-26. Every one came from counting the PAIRS a search examines and reading
// the count as an exponent, when pairs drawn from a shared pool of records are
// not independent draws. The miss probabilities are computed by
// `log2MissSorted` / `log2MissDisjoint` below and logged at runtime, so the
// figure a reader sees is derived from the batch sizes that actually ran
// rather than from a number somebody wrote down once and nobody rechecked.
//
//   BO: the tie-break switched from action hash to the self-reported
//   `timestamp`. First version: PASSED — the backdated record was its
//   author's second write, so a chain edge pinned it behind regardless, and
//   the assertion read "timestamps do not move records" while testing "this
//   record cannot be first". Final version: 1 red, §4 alone, and nothing else
//   — which is why §4 is a two-record set rather than part of the graph.
//
//   BP: the chain-order edge removed. First version: PASSED — agent 1's two
//   claims happened to be in hash order. Final version: 3 reds.
//
//   BQ: the reference edge removed. First version: PASSED — the claim
//   happened to hash below its critique. Final version: 4 reds.
//
// A SECOND DEFECT CAME OUT OF FIXING THE FIRST, and it is why the mint loops
// are gone. The second version retried `create_critique` until the hashes
// disagreed — against §6's ceiling of 20 per rolling hour. The harness
// exhausted its own author's critique budget and reported `SWO temporal
// friction` as a setup failure. It was diagnosed only because the loop
// distinguishes "the write was refused" from "the predicate missed"; before
// that it looked like twenty-five improbable misses. Nothing is retried now:
// one batch of Claims is written and the pair is CHOSEN from it, Claims and
// Evidence carry no friction, and the batches are 32 wide rather than 8 after
// an 8-candidate search missed on a 1-in-256 draw. Width is cheap precisely
// because Claims are unrationed: §2 now misses at 2^-32, §3 at 2^-118, §4 at
// 2^-61.
//
// Prereqs: a sandbox conductor (scripts/sandbox.sh clean && start) and a built
// .happ. Two agents, because records by one author are chain-ordered and the
// concurrent case needs two.
// ============================================================================

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_ID = 'epistemic-resonance-happ';
const AGENT2_APP_ID = 'epistemic-resonance-happ-agent2';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;
const DOMAIN = `Ordering${Date.now()}`;

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};
const b64 = (u8) => Buffer.from(u8).toString('base64');
const nowMicros = () => Date.now() * 1000;
const shuffle = (xs) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = (i * 7 + 3) % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

async function connectApp(admin, appId) {
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: appId });
  const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      if (cell?.type === CellType.Provisioned || cell?.type === CellType.Cloned) cellIds.push(cell.value.cell_id);
    }
  }
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  return {
    me: cellIds[0][1],
    call: (fn, payload) => app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload }),
  };
}

async function main() {
  log('=== THE ORDERING POLICY (O dial) ===\n');
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const a1 = await connectApp(admin, APP_ID);
  const apps = await admin.listApps({});
  if (!apps.some((a) => a.installed_app_id === AGENT2_APP_ID)) {
    const pub2 = await admin.generateAgentPubKey();
    await admin.installApp({ source: { type: 'path', value: HAPP_PATH }, agent_key: pub2, installed_app_id: AGENT2_APP_ID });
    await admin.enableApp({ installed_app_id: AGENT2_APP_ID });
  }
  const a2 = await connectApp(admin, AGENT2_APP_ID);
  log(`agent1 = ${b64(a1.me).slice(0, 12)}…   agent2 = ${b64(a2.me).slice(0, 12)}…\n`);

  const claim = (agent, content, timestamp) => agent.call('create_claim', {
    content, domain: DOMAIN, author: agent.me, timestamp,
    evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
  });
  const entryHashOf = async (agent, actionHash) => {
    const rows = await agent.call('get_claims_by_domain', DOMAIN);
    const key = b64(actionHash);
    const row = rows.find((r) => b64(r.signed_action.hashed.hash) === key);
    return row?.signed_action?.hashed?.content?.data?.entry_hash ?? null;
  };

  // --- Seed a small graph -------------------------------------------------
  // agent1 writes two claims IN CHAIN ORDER; agent2 critiques the first.
  const c1 = await claim(a1, 'first claim by agent 1', nowMicros());
  const c2 = await claim(a1, 'second claim by agent 1', nowMicros());
  const c1Entry = await entryHashOf(a1, c1);
  const crit = await a2.call('create_critique', {
    target: c1Entry, target_type: 'Claim', critique_mode: 'Methodological',
    content: 'a critique of the first claim', author: a2.me, timestamp: nowMicros(),
    replication_attempted: false, evidence_hashes: [], species: null,
  });

  const posOf = (res, h) => res.order.findIndex((x) => b64(x) === b64(h));

  // EVERY ORDERING CHECK IN THIS FILE NEEDS THE TWO CANDIDATE POLICIES TO
  // DISAGREE, and all three sections below originally failed to arrange that.
  // Injections BO, BP and BQ each PASSED against the first version, because a
  // record that happened to sort correctly by hash made the causal rule under
  // test redundant. A check that only passes when luck agrees with it is a
  // coin-flip wearing an assertion.
  //
  // THE SECOND VERSION MINTED RECORDS IN A LOOP UNTIL THE HASHES DISAGREED,
  // AND THAT BROKE DIFFERENTLY — it burned a rationed resource. §2 retried
  // `create_critique` up to 25 times against a ceiling of 20 per rolling hour
  // (§6), so the harness exhausted the author's critique budget and reported
  // `SWO temporal friction` as a setup failure. Diagnosed only because the
  // loop distinguishes "the write was refused" from "the predicate missed";
  // before that it looked like 25 improbable misses.
  //
  // SO NOTHING IS RETRIED. A BATCH IS WRITTEN ONCE AND THE PAIR IS CHOSEN
  // FROM IT. The records used are Claims and Evidence, which carry NO friction
  // budget at all, so the batch can be as wide as the arithmetic needs. Only
  // §5's tie-break figures still need a critique, and that is one write.
  //
  // AND THE WIDTH IS THE PART THIS FILE GOT WRONG ONCE. The first version of
  // this comment said eight candidates leave "under 1%" chance that none has
  // the needed hash relation, and accepted it. Under 1% is 1 in 256 — one
  // draw in 256 where a correct protocol reds a required CI check with a
  // SETUP failure, which reads as a defect and is not one. It came up on run
  // 39705302447: §2 wrote its eight, every one hashed below the citing claim,
  // and the job failed with nothing wrong. A harness that is green 255 times
  // out of 256 is not a gate, it is a coin with a long memory.
  //
  // §2 now draws from 32, so a miss is 2^-32 — about 1 in 4.3 billion, and it
  // costs ~2s of unrationed writes. §3 reads the same batch, where a miss
  // needs all 32 already sorted: 2^-118. §4 writes 32 of its own against
  // those 32: 2^-61. All three are DECLARED and GATED below rather than
  // asserted in prose here, because prose is what rotted the first three
  // times — and the floor is what makes a thin setup a red with a reason
  // instead of a mystery once every few hundred runs.
  const pickWhere = (candidates, predicate) => candidates.find(predicate) ?? null;
  const hashLt = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)) < 0;

  // HOW LIKELY A SETUP SEARCH IS TO MISS — and the reason these are functions
  // rather than numbers in a comment. The first version of this file wrote
  // "under 1%" for what was 1 in 256 and accepted it; the version that fixed
  // that wrote "about 1 in 10^19" for what is 1 in 12,870, and then wrote
  // `2^-496` and `2^-256` for the widened searches below. All four are the
  // SAME MISTAKE: counting the PAIRS a search examines and treating each as an
  // independent coin. Pairs drawn from a shared pool are not independent —
  // 496 pairs over 32 records are 496 views of only 32 random values — so
  // 2^-(pair count) understates the miss by orders of magnitude every time.
  //
  // A SEARCH SPACE IS A COUNT; A MISS PROBABILITY IS A DISTRIBUTION. Only §2
  // happens to be a row of independent coins. The other two are order
  // statistics and are computed as such:
  const log2Fact = (n) => { let t = 0; for (let i = 2; i <= n; i++) t += Math.log2(i); return t; };
  // log2 C(n, k)
  const log2Choose = (n, k) => { let t = 0; for (let i = 1; i <= k; i++) t += Math.log2((n - k + i) / i); return t; };
  // A miss in §3 means all n hashes landed already in chain order: 1 of n!.
  const log2MissSorted = (n) => log2Fact(n);
  // A miss in §4 means every one of the m backdated hashes fell below every
  // one of the n recent ones: 1 of C(n+m, m) interleavings.
  const log2MissDisjoint = (n, m) => log2Choose(n + m, m);
  // A miss in §2 means ONE PIVOT outranked all n values it was compared
  // against — i.e. the pivot was the maximum of n+1, which is 1/(n+1). With k
  // independent pivots the misses multiply: (1/(n+1))^k.
  //
  // THIS IS THE FOURTH TIME THIS FILE HAS GOT ITS OWN ODDS WRONG, and the
  // first three are catalogued above. The previous version read "n
  // comparisons against one fixed hash, so n independent coins, so 2^-n" and
  // GATED on that figure. The draws are independent; the EVENT is not. They
  // all share the pivot, so the question is not n coins but one rank: 2^-32
  // was really 1/33, about 3%, and CI duly drew it on run 39979768672 while
  // the gate was printing "2^-32.0 is past the 2^-30 floor" immediately above
  // the red. A shared pivot collapses n independent draws into one order
  // statistic — the same shape as §3 and §4, which is why those were already
  // fixed, and exactly the error this file exists to warn about.
  const log2MissPivot = (n, k) => k * Math.log2(n + 1);

  // AND A PRINTED PROBABILITY IS NOT A GATE, which is the other half of what
  // item 1.6 asked for. Logging "2^-26" next to a passing check still leaves a
  // human to notice that 26 bits is thin; the figure that mattered on run
  // 39705302447 was printed nowhere and nobody was watching for it anyway. So
  // each setup search DECLARES its miss probability and the harness REFUSES a
  // setup weaker than the floor — a red with a reason, before the policy under
  // test is ever called, rather than a mysterious setup failure once every few
  // hundred runs.
  //
  // 30 bits is chosen, not derived: ~1 in a billion, so across this suite's
  // whole plausible lifetime of CI runs a setup miss should never be seen once.
  // Every section currently clears it with room (32, 118, 61).
  const MIN_MISS_BITS = 30;
  const gateMiss = (section, bits, how) => {
    log(`    ${how}`);
    check(`§${section}'s setup cannot miss by luck: 2^-${bits.toFixed(1)} is past the 2^-${MIN_MISS_BITS} floor`,
      bits >= MIN_MISS_BITS);
  };

  // === 1. DETERMINISM: the same set, however it arrives =================
  log('--- 1. Determinism: the same set in any input order ---');
  const set = [c1, c2, crit];
  const r1 = await a1.call('order_records', set);
  const r2 = await a1.call('order_records', shuffle(set));
  const r3 = await a2.call('order_records', shuffle(shuffle(set)));
  const seq = (r) => r.order.map(b64).join('|');
  check('a shuffled input produces an IDENTICAL order',
    seq(r1) === seq(r2));
  check('and so does the SAME SET READ BY A DIFFERENT OBSERVER — the property settlement rests on',
    seq(r1) === seq(r3));
  check('every input is in the output, none dropped',
    r1.order.length === set.length);
  check('the policy names itself, so a reader can tell which one ran',
    typeof r1.policy === 'string' && /causal-then-hash/.test(r1.policy));
  check('and the policy states that timestamps are not consulted',
    /timestamp/i.test(r1.policy) && /NOT consulted/i.test(r1.policy));

  // === 2. CAUSALITY: a referenced record precedes its referrer ==========
  log('\n--- 2. Causality: a referenced record precedes the record citing it ---');
  log(`    causal_edges=${r1.causal_edges}  tie_broken=${r1.tie_broken}`);
  // EIGHT CLAIMS, THEN ONE CLAIM CITING ALL EIGHT AS EVIDENCE. A Claim's
  // `evidence_hashes` are §5.3 dependencies — `validate_claim` calls
  // `must_get_entry` on each, existence-only and type-agnostic, so a Claim may
  // cite another Claim — and each therefore had to resolve before the citing
  // claim could commit. Every one of them is causally prior by construction.
  //
  // Among 32, at least one has an ACTION hash sorting ABOVE the citing
  // claim's unless a 2^-32 draw says otherwise. That is the one worth
  // asserting on: hash order would place it after, and only the reference
  // edge places it before.
  //
  // CLAIMS RATHER THAN CRITIQUES, and that is the fix for the defect this
  // section had. The previous version retried `create_critique` until the
  // hashes disagreed and hit §6's ceiling of 20 per rolling hour — the
  // harness exhausted its own author's budget. Claims carry no friction.
  const CITED_N = 32;
  const cited = [];
  for (let i = 0; i < CITED_N; i++) {
    cited.push(await claim(a1, `cited claim ${i} for the ordering harness`, nowMicros()));
  }
  const citedEntries = [];
  for (const c of cited) citedEntries.push(await entryHashOf(a1, c));
  check(`${CITED_N} citable claims were written, costing no friction budget`,
    cited.length === CITED_N && citedEntries.every((e) => e != null));

  // SEVEN CITING CLAIMS, NOT ONE, AND THE COUNT IS THE WHOLE REPAIR. One
  // pivot gives a 1-in-33 miss no matter how wide `cited` is, because the
  // question is whether that single hash outranks all 32 — widening the batch
  // moves 1/(n+1) by a hair and nothing else. Independent PIVOTS are what
  // multiply: with k of them a miss is (1/33)^k, so seven puts it at 2^-35,
  // past the floor with room. Claims carry no friction, so the extra six cost
  // about a second.
  const CITING_K = 7;
  const citings = [];
  for (let i = 0; i < CITING_K; i++) {
    citings.push(await a2.call('create_claim', {
      content: `a claim citing all ${CITED_N} as evidence (${i})`, domain: DOMAIN, author: a2.me,
      timestamp: nowMicros(), evidence_hashes: citedEntries, confidence: 'Moderate',
      semantic_tags: [], source_mew: null,
    }));
  }
  check(`${CITING_K} citing claims were written, so the miss figure below holds`,
    citings.length === CITING_K && citings.every((c) => c != null));

  // The first pivot that has a cited claim hashing above it, and that claim.
  let citing = null, inverting = null;
  for (const c of citings) {
    const hit = pickWhere(cited, (x) => hashLt(c, x));
    if (hit) { citing = c; inverting = hit; break; }
  }
  gateMiss(2, log2MissPivot(CITED_N, CITING_K),
    `${CITING_K} pivots against ${CITED_N} candidates; a miss needs EVERY pivot to outrank all `
    + `${CITED_N}, which is (1/${CITED_N + 1})^${CITING_K} — not 2^-${CITED_N}, because the `
    + `comparisons share a pivot and are one rank rather than ${CITED_N} coins`);
  check('at least one cited claim HASHES ABOVE a claim citing it, so hash order would invert',
    inverting !== null);
  if (inverting) {
    const r2c = await a1.call('order_records', [citing, inverting]);
    log('    hash order would put the citing claim first; the reference edge must not allow it');
    check('THE CITED RECORD SORTS FIRST — causality outranks the tie-break',
      b64(r2c.order[0]) === b64(inverting));
    check('and it is a real causal edge, with nothing left to the tie-break',
      r2c.causal_edges >= 1 && r2c.tie_broken === 0);
  }

  // === 3. CHAIN ORDER: one author's own sequence ========================
  log('\n--- 3. Chain order: two records by one author follow the chain ---');
  // Chosen from the same batch rather than minted: `cited` is 32 claims on
  // agent 1's chain IN ORDER, so any pair where the later one hashes below the
  // earlier is a case where chain order and hash order disagree. A miss means
  // the batch arrived ALREADY SORTED by hash — 1 in 32!, around 2^-118 — so
  // this is the strongest of the three setups by a wide margin, and the
  // 496-pair count that looks like the big number is not what makes it so.
  let chainEarly = null, chainLate = null;
  outer: for (let i = 0; i < cited.length; i++) {
    for (let j = i + 1; j < cited.length; j++) {
      if (hashLt(cited[j], cited[i])) { chainEarly = cited[i]; chainLate = cited[j]; break outer; }
    }
  }
  // 496 pairs, but only 32 underlying values: a miss needs all 32 to have
  // landed in increasing hash order, which is 1 of 32!, NOT 2^-496.
  gateMiss(3, log2MissSorted(CITED_N),
    `search space ${(CITED_N * (CITED_N - 1)) / 2} pairs over ${CITED_N} records; a miss is 1/${CITED_N}! = 2^-${log2MissSorted(CITED_N).toFixed(1)}`);
  check('a chain pair was found whose HASH order contradicts its CHAIN order',
    chainEarly !== null && chainLate !== null);
  if (chainEarly && chainLate) {
    const r3c = await a1.call('order_records', [chainLate, chainEarly]);
    log('    hash order would put the LATER record first; chain order must not');
    check('THE EARLIER CHAIN RECORD STILL SORTS FIRST — the chain outranks the tie-break',
      b64(r3c.order[0]) === b64(chainEarly));
    check('and it is a real causal edge rather than a tie-break',
      r3c.causal_edges >= 1 && r3c.tie_broken === 0);
  }

  // === 4. TIMESTAMPS ARE NOT CONSULTED ==================================
  // The check this file exists for. A record whose self-reported timestamp
  // claims it came first by a year must not move: the field is author-chosen,
  // and READINESS item 14 measured exactly this being abused with a real clock.
  //
  // THE SET IS EXACTLY TWO MUTUALLY CONCURRENT RECORDS, and the first version
  // of this section was not — which injection BO proved by PASSING. That
  // version dropped a backdated claim into the graph above and asserted it did
  // not sort first; it could not sort first under ANY policy, because a
  // chain-order edge pinned it behind. The assertion read "timestamps do not
  // move records" and tested "this record cannot be first".
  log('\n--- 4. A backdated timestamp does not move a record ---');
  // 32, NOT 8 — and the reason is the arithmetic above rather than symmetry.
  // §4's miss is an interleaving, 1 of C(recent + backdated, backdated), and
  // that figure is governed by the SMALLER batch: 32 recent against 8
  // backdated is 256 pairs but only 2^-26, which made §4 the weakest check in
  // this file by some ninety powers of two while displaying the largest pair
  // count. 32 against 32 is 2^-61. Claims carry no friction budget, so the
  // extra 24 writes cost about a second and nothing else.
  const BACKDATED_N = 32;
  const backdatedBatch = [];
  for (let i = 0; i < BACKDATED_N; i++) {
    backdatedBatch.push(await a2.call('create_claim', {
      content: `claims to be a year old (${i})`, domain: DOMAIN, author: a2.me,
      timestamp: nowMicros() - 365 * 24 * 3600 * 1_000_000, evidence_hashes: [],
      confidence: 'Moderate', semantic_tags: [], source_mew: null,
    }));
  }
  // GATED THE WAY `cited` IS. The miss probability below is a function of both
  // batch SIZES, and an assumed size is the thing that turns a certainty into a
  // coin without anybody noticing — so both are asserted, deterministically,
  // before any probability is claimed about them.
  check(`${BACKDATED_N} backdated claims were written, so the miss figure below holds`,
    backdatedBatch.length === BACKDATED_N && backdatedBatch.every((h) => h != null));

  // A PAIR, NOT A CANDIDATE: the RECENT record must win on hash, so that a
  // timestamp policy — which puts the year-old one first — gives a visibly
  // different answer. Searching one batch against a fixed partner was a 1-in-
  // 256 miss and it missed.
  //
  // THE REPLACEMENT WAS SOLD WITH A WRONG NUMBER, which is the part worth
  // keeping on the record. Eight recent against eight backdated was described
  // here as "64 pairs, where missing is about 1 in 10^19". A miss needs all
  // eight backdated hashes to fall below all eight recent ones — 1 of C(16,8),
  // which is 1 in 12,870, or about 1e-4. The claim was wrong by fifteen orders
  // of magnitude, and a 1-in-12,870 flake on a required gate is exactly the
  // defect the "1 in 256" paragraph above was written to stop. Counting pairs
  // and reading the count as an exponent is what produced both.
  //
  // The §2 claims are concurrent with agent 2's: different authors, and
  // neither references the other.
  let concurrentA = null, backdated = null;
  outer4: for (const recent of cited) {
    for (const old of backdatedBatch) {
      if (hashLt(recent, old)) { concurrentA = recent; backdated = old; break outer4; }
    }
  }
  gateMiss(4, log2MissDisjoint(CITED_N, BACKDATED_N),
    `search space ${CITED_N} x ${BACKDATED_N} = ${CITED_N * BACKDATED_N} pairs over ${CITED_N + BACKDATED_N} records; `
    + `a miss is 1/C(${CITED_N + BACKDATED_N},${BACKDATED_N}) = `
    + `2^-${log2MissDisjoint(CITED_N, BACKDATED_N).toFixed(1)} — NOT 2^-${CITED_N * BACKDATED_N}, the pairs are not independent`);
  check('a concurrent pair was found whose hash order DISAGREES with its timestamp order',
    concurrentA !== null && backdated !== null);
  if (backdated && concurrentA) {
    const r4 = await a1.call('order_records', [backdated, concurrentA]);
    const first = b64(r4.order[0]);
    log('    two concurrent records: by timestamp the year-old one leads, by hash the other does');
    log(`    order[0] is ${first === b64(concurrentA) ? 'the RECENT one (hash order)' : 'the YEAR-OLD one (TIMESTAMP order)'}`);
    check("NO CAUSAL EDGE BETWEEN THEM, so the tie-break alone decides — this check's premise",
      r4.causal_edges === 0 && r4.tie_broken >= 1);
    check('A YEAR-OLD SELF-REPORTED TIMESTAMP DOES NOT PUT IT FIRST — the hash decides',
      first === b64(concurrentA));
  }
  const r4b = await a1.call('order_records', [c1, c2, crit, ...(backdated ? [backdated] : [])]);
  check('and causality still holds with a backdated record in the set',
    posOf(r4b, c1) < posOf(r4b, crit) && posOf(r4b, c1) < posOf(r4b, c2));

  // === 5. HONESTY ABOUT WHAT THE ORDER MEANS ============================
  log('\n--- 5. The report says how much of the order is arbitrary ---');
  check('tie_broken is reported, so a reader knows how much was a coin-toss',
    typeof r4b.tie_broken === 'number');
  check('concurrent records DID force a tie-break, so the figure is live rather than always zero',
    r4b.tie_broken >= 1);
  check('no cycle is detected in a well-formed graph',
    r4b.cycle_detected === false);

  // === 6. UNRESOLVED INPUTS ARE REPORTED, NOT DROPPED ===================
  // An order over a smaller set than was asked for is a different answer, and
  // silently returning it is how a caller comes to trust a partial result.
  log('\n--- 6. An input that does not resolve is named ---');
  const dangling = new Uint8Array([0x84, 0x29, 0x24, ...Array(36).fill(7)]);
  const r6 = await a1.call('order_records', [c1, dangling, crit]);
  check('the unresolvable input is REPORTED in `unresolved`',
    r6.unresolved.length === 1 && b64(r6.unresolved[0]) === b64(dangling));
  check('and it is not silently included in the order',
    r6.order.length === 2);
  check('while the records that did resolve are still ordered causally',
    posOf(r6, c1) < posOf(r6, crit));

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — one order, any observer, causality never inverted,');
    log('and a self-reported clock never consulted.');
  } else {
    log(`${failures} CHECK(S) FAILED`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(1); });
