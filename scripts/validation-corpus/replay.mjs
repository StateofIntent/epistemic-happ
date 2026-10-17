#!/usr/bin/env node
// ============================================================================
// scripts/validation-corpus/replay.mjs — DRIVE EVERY REACHABLE REJECTION AND
// ASSERT THE ZOME ACTUALLY REFUSES.
//
// Reads corpus/inventory.json (see enumerate.mjs), builds a VALID baseline
// payload per entry type, applies one mutation per site, and asserts the call
// is refused with that site's own message.
//
// WHY ONE MUTATION AT A TIME. A payload that violates two rules proves nothing
// about either: validation returns at the first failing check, so the message
// that comes back names whichever rule happens to sit earlier in the function.
// Every case here starts from a baseline that is known to COMMIT, and changes
// exactly one field — so a refusal naming a different rule is itself a failure,
// and is reported as one rather than being counted as a pass.
//
// WHY THE BASELINE IS ASSERTED FIRST. If the baseline does not commit, every
// case below it "passes" by being refused for the wrong reason, and a run of
// green ticks means nothing. The baseline commit is check #1 for each entry
// type, and its cases are counted as SKIPS rather than dropped when it fails —
// a run reporting one failure must not look like a run that exercised the
// whole table and found one bug.
//
// FIVE ENTRY TYPES, AND THE COVERAGE IS ASSERTED RATHER THAN CLAIMED. `Claim`,
// `Mew`, `Evidence`, `Constitution` and `CritiqueSpecies` — every rule the
// inventory lists for those five has a case here, checked BOTH ways at the
// bottom of this file: a rule with no case fails, and a case naming a rule the
// inventory no longer lists fails too. The second direction is the one that
// would otherwise rot quietly, since a case asserting a message the zome can
// no longer produce still looks like coverage.
//
// The entry types NOT here are not pretended about: see README.md's class
// table. `WorldlineTrace` and `Revelation` need dependency chains rather than
// payloads, which is a larger job than this file.
// ============================================================================

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AdminWebsocket, AppWebsocket } from '@holochain/client';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const INVENTORY = resolve(HERE, 'corpus/inventory.json');

const ADMIN_URL = process.env.EPI_ADMIN_URL ?? 'ws://localhost:8889';
const APP_URL = process.env.EPI_APP_URL ?? 'ws://localhost:8888';
const APP_ID = process.env.EPI_APP_ID ?? 'epistemic-resonance-happ';
const ROLE = 'epistemic';
const ZOME = 'epistemic_coordinator';

let pass = 0, fail = 0, skip = 0;
const failures = [];
const log = (s = '') => console.log(s);
function check(ok, label, detail) {
  if (ok) { pass++; log(`  PASS: ${label}`); }
  else { fail++; failures.push({ label, detail }); log(`  FAIL: ${label}`); if (detail) log(`        ${detail}`); }
}

// --- A well-formed hash that resolves to nothing.
//
// Holochain hashes are 39 bytes: a 3-byte type prefix, 32 bytes of digest, and
// 4 bytes of DHT location. The PREFIX IS PART OF THE TYPE, and getting it wrong
// does not produce the refusal under test — it produces a msgpack Deserialize
// error from the coordinator's extern before validation is ever reached, which
// a harness checking only "did it throw" would score as a pass. Building the
// first version of this file from an ActionHash for an EntryHash field is
// exactly that mistake, and it is why these are explicit constants.
const HASH_PREFIX = {
  entry: [0x84, 0x21, 0x24],   // uhCEk…
  action: [0x84, 0x29, 0x24],  // uhCkk…
  agent: [0x84, 0x20, 0x24],   // uhCAk…
};

function danglingHash(kind, seed = 0) {
  const prefix = HASH_PREFIX[kind];
  if (!prefix) throw new Error(`unknown hash kind: ${kind}`);
  const h = new Uint8Array(39);
  h.set(prefix, 0);
  for (let i = 3; i < 35; i++) h[i] = (i * 31 + seed * 7 + 11) & 0xff;
  // The trailing 4 bytes are the DHT location. Nothing on the write path
  // recomputes them for a hash arriving in a payload, so any value deserializes
  // — confirmed by the author-mismatch case, which reaches its rule with the
  // digest rewritten and the location left alone.
  h.set([0x00, 0x00, 0x00, 0x00], 35);
  return h;
}

const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
const token = (await admin.issueAppAuthenticationToken({ installed_app_id: APP_ID })).token;
const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });
const appInfo = await app.appInfo();
const myKey = appInfo.agent_pub_key;

// Zome calls from outside the launcher are signed, and the signing keypair has
// to be authorized per cell first — agent-sdk does the same at index.ts:181.
// Without it every call fails with "no signing credentials have been
// authorized", which looks exactly like a validation refusal to a harness that
// only checks "did it throw".
for (const roleCells of Object.values(appInfo.cell_info)) {
  for (const cell of roleCells) {
    const id = cell?.value?.cell_id;
    if (id) await admin.authorizeSigningCredentials(id);
  }
}

const call = (fn_name, payload) =>
  app.callZome({ role_name: ROLE, zome_name: ZOME, fn_name, payload });

async function refusal(fn_name, payload) {
  try { await call(fn_name, payload); return null; }
  catch (e) { return String(e?.message ?? e); }
}

const nowMicros = () => Date.now() * 1000;

log('=== validation corpus: replay ===');
log(`conductor ${APP_URL}  app ${APP_ID}`);
const inv = JSON.parse(readFileSync(INVENTORY, 'utf8'));
log(`inventory: ${inv.total_sites} sites, protocol_version ${inv.protocol_version}`);
log('');
// ============================================================================
// THE CASE TABLES, AND WHAT KEEPS THEM HONEST.
//
// One table per entry type: a baseline the zome is asserted to ACCEPT, then one
// mutation per inventoried rule. `drive()` below commits the baseline first and
// skips the mutations if it does not commit, because a baseline that is already
// invalid makes every case below it "pass" by being refused for the wrong
// reason — eighteen green ticks that mean nothing.
//
// EVERY RULE IS SPELLED, NOT COUNTED. Each case names the exact message it
// expects, and `coverage()` at the bottom compares the set of rules named here
// against the inventory's own list for these five entry types. So a rule added
// to `validate_mew` without a case here fails this harness, rather than
// quietly shrinking what a green run covers — which is the failure mode the
// inventory drift check in `live-verify.yml` catches one step earlier, for
// the file rather than for the corpus.
// ============================================================================

// The entry types this corpus claims COMPLETE coverage of. Everything outside
// this list is accounted for in README.md's class table and is not pretended
// about here.
//
// THIS COMMENT USED TO SAY that `WorldlineTrace` and `Revelation` were excluded
// because they need dependency chains, and that this was "a different and much
// larger job than a payload". The first half was a guess and the second was
// wrong in both directions. `Retraction` DOES need a chain and it cost one extra
// call — it is in the list now. `WorldlineTrace` and `Revelation` are excluded
// for a different reason entirely: no coordinator extern accepts a raw payload
// for either, so the fields their rules are about are derived by the extern and
// cannot be reached from JavaScript at all. See README.md's finding 5.
const COVERED = ['claim', 'mew', 'evidence', 'constitution', 'critique_species', 'retraction'];

// --- Rules that are inventoried as assertable and are NOT reachable from this
// harness, each with the reason, so that coverage stays a real number instead
// of being quietly redefined.
//
// WHY AN EXPLICIT LIST RATHER THAN A SHORTER DENOMINATOR. A gap left out of the
// coverage check is indistinguishable from a rule nobody noticed. A gap listed
// here is asserted to STILL EXIST in the inventory, so a renamed or deleted
// rule reds this file the same way an orphaned case does — the escape hatch
// cannot rot into a silencer. It is printed on every run, loudly, because the
// number that matters is "covered out of assertable", not "covered out of
// covered".
//
// THE ONE THING IN HERE SO FAR IS A SECOND-AGENT PROBLEM, not a payload one.
// "A Retraction can only be published by the claim's own author" fires when the
// target Claim was authored by SOMEBODY ELSE, and this harness drives one
// conductor with one agent: every Claim it can create is its own, and a Claim
// with a forged `author` is stopped one rule earlier by "Claim author must match
// action author." Reaching it needs a second agent on the same DHT — which
// `scripts/network.sh` already builds for the gossip harnesses — so it is a
// harness-shape change, not a zome change, and it is the natural next slice.
const GAPS = [
  {
    entry: 'retraction',
    rule: 'A Retraction can only be published by the claim\'s own author — it records that the author no longer stands by it, not that someone else disagrees. Use a Critique for that.',
    why: 'needs a Claim authored by a DIFFERENT agent; this harness has one agent on one conductor',
  },
];

const entries = [
  {
    entry: 'claim',
    label: 'Claim',
    fn: 'create_claim',
    baseline: () => ({
      content: 'corpus baseline claim',
      domain: 'CorpusDomain',
      author: myKey,
      timestamp: nowMicros(),
      evidence_hashes: [],
      confidence: 'Moderate',
      semantic_tags: [],
      source_mew: null,
    }),
    cases: [
      { rule: 'Claim content cannot be empty.', mutate: (c) => { c.content = ''; } },
      { rule: 'Claim domain cannot be empty.', mutate: (c) => { c.domain = ''; } },
      { rule: 'Claim author must match action author.', mutate: (c) => { c.author = danglingHash('agent', 1); } },
      // These two are classed `deferred`, not `honest`: the guard is a
      // must_get_entry, so a missing dependency abandons validation with
      // unresolved dependencies instead of returning Invalid. What is asserted
      // is therefore the real behaviour — the write STALLS, retryably — and the
      // site's own message is asserted NOT to appear, because a build where it
      // did would mean the semantics had changed.
      { rule: 'Claim evidence hash not found.', expect: 'deferral', mutate: (c) => { c.evidence_hashes = [danglingHash('entry', 2)]; } },
      { rule: 'Claim source_mew not found.', expect: 'deferral', mutate: (c) => { c.source_mew = danglingHash('entry', 3); } },
    ],
  },
  {
    entry: 'mew',
    label: 'Mew',
    fn: 'create_mew',
    baseline: () => ({
      content: 'corpus baseline mew',
      author: myKey,
      timestamp: nowMicros(),
      reply_to: null,
      semantic_tags: [],
      linked_claim: null,
    }),
    cases: [
      { rule: 'Mew author must match action author.', mutate: (m) => { m.author = danglingHash('agent', 11); } },
      { rule: 'Mew content cannot be empty.', mutate: (m) => { m.content = ''; } },
      // 561 and not 600: the guard is `content.len() > 560` on BYTES, and a
      // length chosen comfortably past the limit would pass against an
      // off-by-one that a boundary value catches. ASCII on purpose, so
      // `.len()` and the character count agree and the case is not secretly
      // about UTF-8 — the 2x margin in the message is the zome's own answer to
      // multi-byte content.
      { rule: 'Mew content exceeds 560 characters (2x tweet size for unicode safety).', mutate: (m) => { m.content = 'x'.repeat(561); } },
      // Deferred for the same reason as Claim's two: a must_get_entry guard.
      { rule: 'Mew linked_claim not found.', expect: 'deferral', mutate: (m) => { m.linked_claim = danglingHash('entry', 12); } },
    ],
  },
  {
    entry: 'evidence',
    label: 'Evidence',
    fn: 'create_evidence',
    // `evidence_type` is a unit enum variant and crosses as a bare string,
    // the same shape `Claim.confidence` uses above.
    baseline: () => ({
      content: 'corpus baseline evidence',
      evidence_type: 'Text',
      source_url: null,
      author: myKey,
      timestamp: nowMicros(),
    }),
    cases: [
      { rule: 'Evidence author must match action author.', mutate: (e) => { e.author = danglingHash('agent', 21); } },
      { rule: 'Evidence content cannot be empty.', mutate: (e) => { e.content = ''; } },
    ],
  },
  {
    entry: 'constitution',
    label: 'Constitution',
    fn: 'publish_constitution',
    baseline: () => ({
      agent: myKey,
      promises: [{ action: 'validate_claims', domain: 'CorpusDomain', modality: null }],
      conditions: [],
      published_at: nowMicros(),
      expires_at: null,
    }),
    cases: [
      { rule: 'Constitution agent must match action author.', mutate: (c) => { c.agent = danglingHash('agent', 31); } },
      { rule: 'Constitution must contain at least one promise.', mutate: (c) => { c.promises = []; } },
      // The promise list stays NON-EMPTY, or this would be refused by the rule
      // above and scored against the wrong one. Only `action` is blanked:
      // the guard is an `||` over both fields, and emptying both would not
      // distinguish which half fires.
      { rule: 'Promise action and domain cannot be empty.', mutate: (c) => { c.promises = [{ action: '', domain: 'CorpusDomain', modality: null }]; } },
      // EQUAL, not earlier. The guard is `expires <= published_at`, so equality
      // is the boundary the message's `>` actually claims; a date in the past
      // would also fire and would leave the `<` case unproven.
      { rule: 'expires_at must be > published_at.', mutate: (c) => { c.expires_at = c.published_at; } },
    ],
  },
  {
    entry: 'critique_species',
    label: 'CritiqueSpecies',
    fn: 'create_critique_species',
    baseline: () => ({
      name: 'CorpusSpecies',
      parent_species: null,
      required_evidence: [],
      proposer: myKey,
      created_at: nowMicros(),
    }),
    cases: [
      { rule: 'CritiqueSpecies proposer must match action author.', mutate: (s) => { s.proposer = danglingHash('agent', 41); } },
      { rule: 'CritiqueSpecies name cannot be empty.', mutate: (s) => { s.name = ''; } },
      // Deferred: a must_get_entry guard, as with Claim and Mew.
      { rule: 'Parent CritiqueSpecies not found.', expect: 'deferral', mutate: (s) => { s.parent_species = danglingHash('entry', 42); } },
    ],
  },
  // --- THE FIRST ENTRY TYPE WITH A DEPENDENCY CHAIN. Everything above is a
  // payload: a valid one can be written down field by field. A valid
  // `Retraction` cannot, because `target_claim` must be the EntryHash of a
  // Claim that exists and belongs to the retracting agent, so `setup` publishes
  // one first. That is the whole of what made this entry type "a different and
  // much larger job than a payload" — one extra call, not a new mechanism.
  //
  // TWO HASHES COME OUT OF SETUP AND THEY ARRIVE DIFFERENTLY, which is worth
  // stating because getting it wrong looks like a validation bug. `create_claim`
  // returns an ActionHash and `Retraction.target_claim` is an EntryHash, so the
  // claim's entry hash is read back off the record
  // (`signed_action.hashed.content.data.entry_hash`, the same path
  // `membranes-ui.mjs` uses). `create_evidence` is this zome's exception: it
  // ends `hash_entry(&evidence)` and hands back the EntryHash directly.
  {
    entry: 'retraction',
    label: 'Retraction',
    fn: 'create_retraction',
    chainNote: 'published a Claim to retract, and an Evidence entry to stand in as a non-Claim target',
    setup: async () => {
      // A per-run domain, so a re-run cannot read a previous run's claim out of
      // the index and retract something this run did not publish.
      const domain = `CorpusRetraction${Date.now()}`;
      await call('create_claim', {
        content: 'corpus claim, published in order to be retracted',
        domain, author: myKey, timestamp: nowMicros(),
        evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
      });
      const claims = await call('get_claims_by_domain', domain);
      if (!claims.length) throw new Error(`the claim did not come back from get_claims_by_domain(${domain})`);
      const targetClaim = claims[0].signed_action.hashed.content.data.entry_hash;

      // A real entry that is NOT a Claim, for the target-type rule. It has to
      // RESOLVE — a dangling hash defers instead, which is the case above it.
      const notAClaim = await call('create_evidence', {
        content: 'corpus evidence, used only as a non-Claim retraction target',
        evidence_type: 'Text', source_url: null, author: myKey, timestamp: nowMicros(),
      });
      return { targetClaim, notAClaim };
    },
    baseline: (ctx) => ({
      target_claim: ctx.targetClaim,
      reason: 'corpus baseline retraction',
      replacement_claim: null,
      author: myKey,
      timestamp: nowMicros(),
    }),
    cases: [
      { rule: 'Retraction author must match action author.', mutate: (r) => { r.author = danglingHash('agent', 51); } },
      // RECLASSIFIED 2026-10-17, measured rather than reasoned: the guard is
      // `let Ok(target) = must_get_entry(..) else`, so a nonexistent target
      // defers the commit (`DepMissingFromDht`) and this message never fires.
      // The inventory called it `honest` until enumerate.mjs learned the
      // let-else shape. Asserting the message here would have failed forever.
      { rule: 'Retraction target claim not found.', expect: 'deferral', mutate: (r) => { r.target_claim = danglingHash('entry', 52); } },
      // The distinction the line above exists to protect: this target RESOLVES
      // and is the wrong type, which is a refusal with a message, six lines
      // below a must_get in the same validator.
      { rule: 'Retraction target must be a Claim.', mutate: (r, ctx) => { r.target_claim = ctx.notAClaim; } },
      { rule: 'Retraction reason cannot be empty.', mutate: (r) => { r.reason = ''; } },
      { rule: 'Retraction replacement_claim not found.', expect: 'deferral', mutate: (r) => { r.replacement_claim = danglingHash('entry', 53); } },
    ],
  },
];

// --- One driver for all five, rather than the Claim block copied four times.
// The baseline-first rule and the refused-for-a-different-reason rule are the
// two things this harness is actually about, and they are now written once.
async function drive(spec) {
  log(`--- ${spec.label}: baseline, then one mutation per rule ---`);

  // THE DEPENDENCY CHAIN, AND WHY IT IS A SEPARATE STEP FROM THE BASELINE.
  // The five entry types this corpus started with are payloads: every field of
  // a valid one can be written down. `Retraction` cannot — its `target_claim`
  // has to be the EntryHash of a Claim that EXISTS and is the retracting
  // agent's own, so something has to be published before the baseline can be
  // described at all. `setup` returns that context and `baseline(ctx)` consumes
  // it.
  //
  // It runs ONCE per entry type rather than per case, which is deliberate: the
  // chain is shared scaffolding, not part of what any single case is testing,
  // and re-publishing it per mutation would spend friction budget on setup. The
  // cost of that choice is that a case must not mutate `ctx` itself — only the
  // payload it is handed — and `baseline(ctx)` therefore builds a fresh payload
  // every call while reading the same ctx.
  //
  // A SETUP FAILURE IS NOT A RULE FAILURE, and is reported as its own check so
  // a red says which. If the chain cannot be built, every case below it would
  // be refused for the wrong reason and "pass" by being refused at all — the
  // same trap the baseline check exists to stop, one level further out.
  let ctx = null;
  if (spec.setup) {
    try {
      ctx = await spec.setup();
      check(true, `${spec.label} dependency chain builds — ${spec.chainNote ?? 'setup published its prerequisites'}`);
    } catch (e) {
      check(false, `${spec.label} dependency chain builds`, String(e?.message ?? e).slice(0, 300));
      for (const c of spec.cases) { skip++; log(`  SKIP: ${c.rule} — dependency chain did not build`); }
      log('');
      return;
    }
  }

  let committed = false;
  try {
    await call(spec.fn, spec.baseline(ctx));
    committed = true;
    check(true, `baseline ${spec.label} commits — the mutations below start from something valid`);
  } catch (e) {
    check(false, `baseline ${spec.label} commits`, String(e?.message ?? e).slice(0, 300));
  }

  if (!committed) {
    // Counted as skips rather than silently dropped: a run reporting "2 failed"
    // where 2 is one baseline and its whole table went unexercised must not
    // read like a run that tested everything and found two bugs.
    for (const c of spec.cases) { skip++; log(`  SKIP: ${c.rule} — baseline did not commit`); }
    log('');
    return;
  }

  for (const c of spec.cases) {
    const p = spec.baseline(ctx);
    c.mutate(p, ctx);
    const err = await refusal(spec.fn, p);
    const kind = c.expect ?? 'refusal';

    if (err === null) {
      check(false, `${kind}: ${c.rule}`, 'the call COMMITTED — nothing stopped this payload');
      continue;
    }
    if (kind === 'refusal') {
      check(err.includes(c.rule), `refused: ${c.rule}`,
        err.includes(c.rule) ? null : `stopped for a different reason: ${err.slice(0, 180)}`);
      continue;
    }
    // kind === 'deferral'
    const deferred = /DepMissingFromDht|may be retried|unresolved dependenc/i.test(err);
    const messageAppeared = err.includes(c.rule);
    check(deferred && !messageAppeared,
      `deferred (not refused): ${c.rule}`,
      deferred && !messageAppeared ? null
        : messageAppeared
          ? `the Invalid branch FIRED — must_get_* semantics have changed, update SPEC §5.3 and this corpus`
          : `expected a retryable dependency stall, got: ${err.slice(0, 180)}`);
  }
  log('');
}

for (const spec of entries) await drive(spec);

// ---------------------------------------------------------------- coverage
// WHY THIS IS A CHECK AND NOT A PRINTOUT. The inventory drift gate in
// live-verify.yml notices when `lib.rs` changes without `inventory.json` being
// regenerated. It cannot notice the next step: an inventory regenerated and
// committed correctly, with no case added here. That leaves a green run whose
// coverage silently shrank, which is this repository's most frequently
// rediscovered defect — a tick that no longer means what it meant.
log('--- coverage: every inventoried rule for these entry types has a case ---');

const named = new Set(entries.flatMap((s) => s.cases.map((c) => c.rule)));
const gapped = new Set(GAPS.map((g) => g.rule));

for (const entry of COVERED) {
  // `passthrough` sites forward another validator's result and have no message
  // of their own; `needs_prober` and `remote` are not reachable from here at
  // all. See README.md's class table for why the denominator is not 194.
  const sites = inv.sites.filter(
    (s) => s.entry === entry && ['honest', 'crafted', 'deferred'].includes(s.class) && s.message,
  );
  const messages = [...new Set(sites.map((s) => s.message))];
  const missing = messages.filter((m) => !named.has(m) && !gapped.has(m));
  const gapsHere = messages.filter((m) => gapped.has(m));

  check(missing.length === 0,
    `${entry}: ${messages.length - gapsHere.length} of ${messages.length} assertable rules have a case`
      + (gapsHere.length ? `, ${gapsHere.length} declared unreachable` : ''),
    missing.length === 0 ? null
      : `no case for: ${missing.map((m) => JSON.stringify(m)).join(', ')}`);
}

// The gaps have to still be real. A declared-unreachable rule that the zome no
// longer has is an exemption outliving its subject, and it would go on
// subtracting from the denominator forever — so it reds here exactly as an
// orphaned case does.
const inventoriedAll = new Set(inv.sites.filter((s) => s.message).map((s) => s.message));
const staleGaps = GAPS.filter((g) => !inventoriedAll.has(g.rule));
check(staleGaps.length === 0,
  `every declared-unreachable rule is still in the inventory`,
  staleGaps.length === 0 ? null
    : `no longer a rule: ${staleGaps.map((g) => JSON.stringify(g.rule)).join(', ')}`);

if (GAPS.length) {
  log('');
  log(`  declared unreachable from this harness (${GAPS.length}), each still inventoried:`);
  for (const g of GAPS) log(`    - [${g.entry}] ${g.why}`);
}

// And the other direction, which catches a case left behind by a rule that was
// REMOVED or whose wording changed — a case asserting a message the zome can no
// longer produce would otherwise sit here looking like coverage.
const inventoried = new Set(
  inv.sites.filter((s) => COVERED.includes(s.entry) && s.message).map((s) => s.message),
);
const orphans = [...named].filter((m) => !inventoried.has(m));
check(orphans.length === 0,
  `every case here names a rule the inventory still lists`,
  orphans.length === 0 ? null
    : `not in the inventory: ${orphans.map((m) => JSON.stringify(m)).join(', ')}`);

log('');
log(`${pass} passed, ${fail} failed, ${skip} skipped`);
if (failures.length) {
  log('');
  log('failures:');
  for (const f of failures) log(`  - ${f.label}${f.detail ? `\n      ${f.detail}` : ''}`);
}
process.exit(fail === 0 ? 0 : 1);
