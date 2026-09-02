# Metabolic Biosignalling Currency Layer — Design Brief v2

**Status:** supersedes an earlier, informal brief of the same name that
circulated outside this repository. This version is written *from* the
actual, compiling, tested code in `dna/coordinator/src/lib.rs` and
`dna/integrity/src/lib.rs` as of the commit this file ships in, not
written first and implemented later — every function name, constant, and
line of behavior below was checked against a real `cargo check`/`cargo
test` pass on both zomes, natively and for `wasm32-unknown-unknown`,
before this document was finalized. See §1 for exactly what was wrong in
the earlier version and why that matters.

---

## 1. What changed since the informal brief — and why this rewrite exists

An earlier brief, written before any of this was implemented, described a
four-part design (stigmergic conductance decay, demurrage-decaying
mutual credit, bounded burn coupling, an unchanged honesty layer) as
"implemented... unless marked NOT YET BUILT." When that claim was
checked against this actual repository, two things turned out to be
false:

1. **The described mutual-credit ledger and burn coupling
   (`MutualCreditTransfer`, `create_credit_transfer`,
   `get_credit_balance`, `SYNAPTIC_LINK_HARD_CEILING`,
   `CREDIT_PER_EXTRA_ACTION`) did not exist anywhere in this repository**
   — not on `main`, not on any other branch, not anywhere in git history
   (`git log --all -S"MutualCreditTransfer"` and equivalent searches for
   every named identifier returned nothing).
2. **The described conductance-decay constants and function names didn't
   match what was actually shipped.** The real, working, already-tested
   Phase 1 mechanism (`decay_factor`/`compute_effective_conductance`,
   `dna/coordinator/src/lib.rs`) uses a 30-day half-life, not the 7 days
   the informal brief stated, and is structurally richer than described
   — it decays the base conductance from creation *and* separately sums
   independently-decaying contributions from every historical
   reinforcement event, not one shared decay clock.

Neither of these was a small transcription error; the informal brief's
central claim ("implemented... unless marked NOT YET BUILT") was false
for its two largest sections. This document exists so that claim doesn't
get made again: everything below is stated as *built* only where a real
`cargo test` pass backs it up, and everything deferred is named as
deferred, in its own section (§6), the same way this codebase's own
README already flags "VERIFICATION STATUS" and "KNOWN GAP" rather than
letting an unverified claim sit undistinguished from a verified one.

---

## 2. Research trail

Before building anything, real prior art was researched for systems that
already solve some version of "value or trust that cascades through a
network, decaying as it goes" — the property the informal brief's
single-hop burn coupling didn't actually have. Findings, kept separate by
what was actually adopted:

**Circles UBI** — live, ~200k accounts. Individualized currencies over a
trust graph, with a pathfinder algorithm routing payments transitively
through chains of trust rather than requiring a direct bilateral
relationship for every exchange, plus a real, running 7%/year demurrage.
Real, working precedent for multi-hop cascading value flow, each hop
capacity-bounded by that edge's own limit. **Not built this pass** — see
§6.1 for why.

**SourceCred** — Cred flows backward through a contribution graph via a
modified PageRank, with recency-weighted decay, converting into a real
spendable currency ("Grain") minted proportional to Cred. **Explicitly
NOT adopted** — a single canonical score per contributor/node is exactly
what this codebase's Invariant #1 (§3) rules out.

**EigenTrust** — the academic ancestor of SourceCred's approach:
PageRank-style transitive trust propagation for P2P networks, aggregating
local trust into a global trust value per peer. **Explicitly NOT
adopted**, same reason as SourceCred: a *global* score, not a
*personalized* one.

**MeritRank** (arXiv 2207.09950, BRAINS 2022) — proves a reputation
system can't simultaneously be generalizable, trustless, and
Sybil-resistant, and resolves the trilemma with two tunable decay knobs
— transitivity decay (an attestation matters less the more hops it
crossed) and epoch decay (it matters less the older it is) — instead of
a single binary depth cutoff. Validated on real MakerDAO interaction
data. **Adopted**, but reshaped: MeritRank's own framing is
*personalized* (computed relative to a caller-chosen root set), which is
exactly compatible with this codebase's existing `AttestationPolicy`
pattern — see §4.3.

**hREA** — a real, multi-year, community-maintained Holochain hApp
implementing REA/ValueFlows economic coordination, explicitly built for
mutual-credit and mutual-aid networks, already running on this project's
exact stack (Holochain). **Not built or integrated this pass** — see
§6.2 for why.

**Physarum polycephalum flow-network algorithms** — real, extensively
published: tube diameter adapts to flux (`dD/dt = f(flow) − decay·D`),
unused paths shrink to zero, loaded paths thicken. Structurally close to
what this codebase's already-shipped `decay_factor` does, but flux-
coupled rather than pure half-life decay. **Not built this pass** — a
refinement to Phase 1 code, named in §6.3 as a real, scoped follow-on.

**Arthur Brock / MetaCurrency** — Holochain's own co-founder wrote the
philosophical root of everything here: biomimicry-based "flow accounting"
currency design, explicitly rejecting blockchain tokenization
("Beyond Blockchain: Simple Scalable Cryptocurrencies"). Named here as
the primary source this whole layer is downstream of, whether or not
it's cited elsewhere in this codebase.

No published work was found combining hormone/enzyme-cascade biology
directly with tokenomics by name — the graph-propagation systems above
(Circles, SourceCred, EigenTrust, MeritRank) are the closest real
analogues, not a ready-made "biosignalling token" that already exists.

---

## 3. Invariant #1 — the constraint that reshaped this design

`README.md`'s Appendix A states ten invariants this codebase holds as
binding, not aspirational. The first is load-bearing for everything in
this document:

> **Never compute or expose a canonical, comparative reputation score.**
> Raw promise-keeping history stays open and queryable — nothing is
> hidden or deleted. But no karma, no stars, no trust index, and no
> sorted "top agents" or "top species" leaderboard. Interpretation of
> that history stays local to the observer, per Promise Theory's
> subjective-trust model.

This directly rules out a SourceCred/EigenTrust-style single canonical
score per agent — exactly the shape a first draft of "cascading trust"
for this layer would naturally reach for. The codebase already had the
correct alternative pattern built and tested before this pass started:
`AttestationPolicy`/`count_attestations_pure`/`is_agent_attested`
(Phase 1) answer trust questions only ever *for one caller-supplied root
set, on request* — never stored, never a default, never comparable
across agents. `ConductancePolicy` (Phase 1) does the same for
connection strength. This layer's own "cascading" extension
(`WeightedAttestationPolicy`, §4.3) is built as a third instance of
exactly that same shape, not a new pattern.

---

## 4. The finalized design — what is actually built

All of the following is implemented in `dna/coordinator/src/lib.rs` and
`dna/integrity/src/lib.rs`, compiles clean (`cargo check`/`cargo build`,
native and `wasm32-unknown-unknown`, both zomes), and is covered by 22
new unit tests (13 coordinator, 9 integrity) on top of the 74 that
already existed — 96 total, all passing — and is verified live against
a real two-agent conductor. See §7 for exactly what that covers, and
§7.1 for the three defects the live pass found that the unit tests could
not.

### 4.1 Fast signal layer — unchanged

`SynapticLink.conductance` decay (`decay_factor`,
`compute_effective_conductance`) is real, already-shipped Phase 1 code.
Nothing in this pass touched it. `CONDUCTANCE_HALF_LIFE_SECS = 30 days`.
See §1 for the earlier brief's incorrect description of this mechanism.

### 4.2 Slow reserve layer — demurrage-decaying mutual credit

Two new integrity-zome entry types (`dna/integrity/src/lib.rs`,
"METABOLIC BIOSIGNALLING CURRENCY" section):

```rust
pub struct MutualCreditTransfer {
    pub from: AgentPubKey,
    pub to: AgentPubKey,
    pub amount: f32,
    pub reason: String,   // open, non-authoritative, like expertise_tags
    pub timestamp: u64,   // Unix seconds
}

pub struct CreditBurn {
    pub agent: AgentPubKey,
    pub amount: f32,
    pub reason: String,
    pub timestamp: u64,
}
```

**Why two entry types, not one, and why this differs from the informal
brief's single-`MutualCreditTransfer`-with-a-`credit_to_burn`-parameter
design:** a transfer moves standing *between* two agents, so both must
consent; a burn destroys *your own* standing, so it needs no one else's
consent. Splitting them is also what makes burns independently
verifiable by DHT validation at all (§4.4) — a `credit_to_burn: f32`
function parameter with no backing entry, as the informal brief proposed,
can't be checked by anyone; a real, separately validated `CreditBurn`
entry can.

**`MutualCreditTransfer` requires countersigning — the informal brief's
top stated gap, now closed.** Real reference precedent:
`holochain-open-dev/community-mutual-credit` and a minimal implementation
by `vanarchist` both document countersigning as the fix for a
Holochain-specific attack: because Holochain has no global consensus, an
agent could otherwise roll back their own local chain and double-spend.
The mechanism, concretely:

- `validate` (integrity zome) intercepts `Op::StoreEntry` for
  `MutualCreditTransfer` **before** calling `.flattened()` — flattening
  discards the raw `Entry::CounterSign(session_data, ...)` envelope down
  to just the decoded app struct, which is the one piece of information
  needed to tell a genuinely countersigned commit apart from a plain,
  single-signer `Entry::App` that happens to decode to the same struct.
  A plain commit is rejected unconditionally, regardless of content.
  A countersigned commit is checked: `session_data.preflight_request
  .signing_agents` must be exactly `{from, to}`, no one else, no more,
  no fewer.
- Coordinator-side flow (`propose_credit_transfer` /
  `accept_credit_transfer` / `finalize_credit_transfer` /
  `link_credit_transfer`) implements the real HDK 0.4.4 countersigning
  protocol: build a `PreflightRequest`, have both `from` and `to`
  independently accept it (locking each of their own chains for the
  session window), exchange the two signed `PreflightResponse`s, then
  have each party commit their own half — passing **both** responses,
  since a countersigned entry embeds the whole session and neither side
  can build its half from its own response alone. Getting the
  `PreflightRequest`/`PreflightResponse`s from one agent's client to the
  other's is left as a client/transport concern (`call_remote`, a
  signal, an out-of-band channel), the same way this codebase never
  prescribes how a UI moves a claim's hash between screens.
  **This paragraph described a different, non-working mechanism until a
  real conductor run corrected it** — see §7.1 for what was wrong and
  what it cost, since the correction is more instructive than the final
  design.
- A countersigned commit must construct `Entry::CounterSign(session_data,
  bytes)` explicitly and commit it through `create(CreateInput { .. })`.
  The ordinary `create_entry` helper can only ever produce a plain
  `Entry::App`: the session lives in the *entry body*, not in ambient
  chain state the host splices in on the app's behalf.
- The index link tying a transfer to each party's own agent anchor is a
  separate zome call (`link_credit_transfer`), made after the session
  releases the chain. A chain inside a countersigning session accepts
  the session entry and nothing else, so `finalize_credit_transfer`
  cannot write its own index link. The consequence, stated plainly: a
  transfer whose finalize succeeded but whose link call never happened
  is a real, valid entry on both chains that simply doesn't show up in
  that agent's `get_credit_balance` until the link call is retried. The
  link is an index, not the record.
- `hdk`'s `unstable-countersigning` feature is now enabled in
  `dna/coordinator/Cargo.toml` — real and shipped as of hdk 0.4.4, but
  still labeled unstable by the Holochain project itself. Worth knowing
  before bumping the hdk pin.

**Reading a countersigned entry back needs its own care.**
`RecordEntry::to_app_option` — how every other read in this zome decodes
an app entry — matches `Entry::App` alone and returns `Ok(None)` for
`Entry::CounterSign`, silently. Since every valid `MutualCreditTransfer`
is countersigned by construction, `get_credit_balance` decodes through a
`transfer_from_record` helper that handles both variants. Using the
ordinary helper made every balance read a flat 0 — see §7.1.

**`get_credit_balance(agent) -> f32`** (coordinator) replays one named
agent's own transfer-and-burn history — found via their own anchor's
`AgentToCreditTransfer`/`AgentToCreditBurn` links (both parties to a
transfer link it from their own anchor, so an agent's own anchor always
carries every transfer they were party to) — applying demurrage decay
**per individual transaction**, not to a running total, so one very old
transaction can't distort how fast the whole balance fades:

```
decayed = amount * 2^(-elapsed_secs / CREDIT_DEMURRAGE_HALF_LIFE_SECS)
CREDIT_DEMURRAGE_HALF_LIFE_SECS = 30 days
```

Reference precedent: Silvio Gesell's 1906 Freigeld design, tested at
Wörgl, Austria in 1932, still running today as the German Chiemgauer —
currency that loses value the longer it sits unspent. `get_credit_balance`
**always answers for one specific, named agent, on request** — never a
sorted list, never a comparison, per Invariant #1 (§3).

**A deliberate property, not a bug: burns fade too.** Because demurrage
is applied per-transaction to *both* credits and debits (including
`CreditBurn`), a burn's effect on the balance recovers over time, the
same way real metabolic capacity regenerates rather than staying
permanently scarred. This wasn't stated as a design goal by the informal
brief but falls directly out of the "decay each transaction individually"
choice it did make, and reads as a genuine, thematically apt property of
a *metabolic* currency rather than a financial one: it models
regeneration, not debt.

**KNOWN GAP, stated explicitly rather than silently assumed away, same
as the informal brief's own gap-disclosure convention:** neither
`validate_credit_transfer` nor `validate_credit_burn` checks that the
sender actually has sufficient balance to cover the amount. Holochain's
agent-centric, eventually-consistent DHT has no cheap way to check a
live, globally-agreed balance at validation time — the same reason
Circles and every other real mutual-credit system enforces balance/
credit limits socially or client-side, not via a global validator check.
An unbounded negative balance is possible today. If this needs
tightening, the honest fix is a per-pair credit limit checked against
both parties' own chains via `must_get_agent_activity`, not a pretend
global balance check this substrate can't actually make atomic.

### 4.3 Coupling — bounded burn-to-extend-friction

```rust
SYNAPTIC_LINK_MAX_PER_WINDOW = 20   // free tier, unchanged from original SWO
SYNAPTIC_LINK_HARD_CEILING   = 30   // absolute — no burn crosses this
CREDIT_PER_EXTRA_ACTION      = 5.0  // cost per action of headroom above the free tier
CREDIT_BURN_FRICTION_REASON  = "burn_friction"  // the one CreditBurn.reason
                                                 // string validation treats
                                                 // as load-bearing
```

Same two-tier shape the informal brief specified — free below the
original limit, burn-gated between the limit and a hard ceiling, rejected
unconditionally at or above the ceiling regardless of burn amount — but
now **actually enforced**, which the informal brief's design couldn't be
(it had no backing entry for a claimed burn to check against; see §4.2).
`validate_create_link`'s `SynapticLink` branch independently re-derives
the claimed burn via `must_get_agent_activity`/`must_get_valid_record`
(the same checkpoint-bounded scan `count_recent_actions_since_checkpoint`
already established for the plain SWO count, generalized via a new
`recent_matching_activity_since_checkpoint` helper so both share one
implementation), summing only `CreditBurn`s tagged
`CREDIT_BURN_FRICTION_REASON` within the same window. Nothing about a
claimed burn is trusted from the client. The coordinator's
`check_synaptic_link_friction` mirrors the same logic as a friendly,
bypassable pre-check — same relationship the plain SWO count already has
between its coordinator and integrity copies.

### 4.4 The "cascading" property — `WeightedAttestationPolicy`

This is what the informal brief's single-hop burn coupling didn't have,
and what the research pass (§2) was aimed at finding a real precedent
for. Given Invariant #1 (§3), it's built as an extension of the
*existing* `AttestationPolicy`/`count_attestations_pure` web-of-trust
walk (Phase 1), not a new graph or a new canonical score:

```rust
pub struct WeightedAttestationPolicy {
    pub roots: Vec<AgentPubKey>,
    pub max_depth: u8,
    pub transitivity_decay: f32,     // per-hop multiplier, clamped [0,1]
    pub epoch_half_life_secs: f64,   // per-edge age decay
}
```

`get_attestation_weight` walks the same two attestation sources
`direct_attesters_of` already reads (free SynapticLink-derived
attestation, and costed `AttestationGrant`-derived vouching), now paired
with each edge's own creation timestamp, through the same bounded,
cycle-safe recursive shape `count_attestations_pure` already uses
(`MAX_ATTESTATION_SEARCH_NODES` visit cap, a `visited` set as both cycle
guard and cap). Each attestation's contribution to the final weight is
its own age-decayed strength (`epoch_decay_factor`), multiplied by
`transitivity_decay` once per hop crossed to reach it — MeritRank's two
knobs, computed on request, for one caller-named root set, never stored.

**Deliberately not built:** anything resembling a single number attached
to an agent that means the same thing to every caller — that is precisely
what Invariant #1 forbids, and precisely what SourceCred/EigenTrust's own
canonical-score designs are. `get_attestation_weight` means something
only relative to the `roots`/decay parameters the specific caller passed
in, exactly like `is_agent_attested` already does for the binary version.

### 4.5 Honesty layer — unchanged

Correlative Witness stays exactly as it was — a non-binding witness
record, never an enforceable contract. Nothing in this pass touched it.

---

## 5. Explicit exclusions — guardrails carried forward

The original research (not repeated in full here) investigated a real
person's OpenZoo ecosystem for design patterns and found real, useful
engineering alongside content that must never be reintroduced. Restated
because a future session that only sees "biosignalling-inspired design"
without this context could otherwise reintroduce it:

1. **No project token, no external tradable asset, ever, as a required
   gate for participation.** Everything runs on the internal mutual-
   credit ledger built in this pass.
2. **No recursive/percentage-cascading revenue share of any kind.**
   Burning credit to extend your own friction ceiling is a one-time,
   bounded, self-directed spend — never a payout that flows to a third
   party by virtue of who introduced whom.
3. **No autonomous agent with standing financial, credential, or
   social-account access instructed to run without human checkpoints.**
4. **No metering-circumvention or traffic-interception tooling**, for
   this protocol's own inference use or anyone else's product.
5. **No claim of legal enforceability for any external correlation** —
   Correlative Witness stays a witness, never a contract.
6. **No canonical, comparative reputation or balance ranking of any
   kind** (Invariant #1, §3) — new for this pass specifically, since
   none of the research sources that motivated §1–5 above raised this
   risk the way SourceCred/EigenTrust's own designs directly do.

---

## 6. What was researched and deliberately NOT built this pass

### 6.1 Circles-style multi-hop atomic payment routing

Circles' pathfinder (§2) routes a payment transitively through chains of
existing trust/credit relationships — real, live, capacity-bounded by
construction. Not built here because atomic settlement across more than
two parties, on a substrate with no global consensus, is its own hard
distributed-systems problem: Holochain's countersigning (§4.2) gives a
real, correct two-party atomic commit, but chaining several such commits
into one atomic multi-hop transfer needs its own protocol (something in
the shape of a hashed-timelock relay) that wasn't attempted. What's
built handles direct bilateral transfers correctly; multi-hop transitive
settlement is a real, well-scoped future increment, not a silent gap.

### 6.2 hREA integration

A real, existing, multi-year Holochain hApp for REA/ValueFlows economic
coordination, explicitly built for mutual-credit networks, running on
this project's exact stack. Not integrated this pass because doing so
properly means either becoming a multi-DNA hApp with cross-DNA bridge
calls to hREA's own DNAs, or vendoring/depending on hREA's zome crates
directly inside this project's existing zomes (which they aren't
designed for — they're built to run as their own DNA) — a materially
larger architectural commitment than what this pass's `MutualCreditTransfer`
/`CreditBurn` addition required, and disproportionate to the actual gap
being closed. Worth a dedicated scoping spike of its own before deciding,
not a default "wire it in" pass — specifically worth checking whether
hREA already has its own answer to the countersigning/double-commit
problem §4.2 solved here, since if so that's a real argument for
migrating onto it later rather than maintaining a parallel
implementation.

### 6.3 Physarum flux-coupled decay refinement

`decay_factor`/`compute_effective_conductance` (§4.1, Phase 1, already
shipped and untouched by this pass) use pure elapsed-time half-life
decay. Physarum polycephalum's real, published tube-adaptation model
(`dD/dt = f(flow) − decay·D`) couples decay rate to current traversal
load — a link under active use would decay slower, an idle one faster,
closer to real vascular/slime-mold adaptation. This is a refinement to
already-working Phase 1 code, not part of the credit/burn layer this
pass actually needed to build, and touching tested, shipped decay math
without a specific need to was avoided on purpose. Named here as a real,
scoped follow-on rather than silently dropped.

---

## 7. Verification status

**Verified live, against a real conductor with two real agents.**
`scripts/live-verify/credit-transfer.mjs` drives the complete flow
against an `hc sandbox` conductor hosting two agents of this DNA:
a plain, non-countersigned commit is rejected by DHT-side validation;
the real propose → accept (both sides) → exchange responses → finalize
(both sides) → index → `get_credit_balance` round trip succeeds; and a
single-signer `CreditBurn` debits the balance. All checks pass.
Countersigning needs both signers reachable on the same network, which
two cells of one DNA on one conductor already are — so unlike
federation's own two-sandbox verification, this deliberately uses one
conductor and two agents rather than two conductors.

Concretely, the live pass ends with agent 1 at a balance of `-10`, agent
2 at `+10` from a countersigned transfer neither could have committed
alone, and agent 1 at `-13` after burning 3.

### 7.1 What the live pass found — three real defects unit tests could not

This section is the most useful thing in this document, so it is kept in
full rather than folded into a changelog. Everything below passed
`cargo check`, `cargo build` for `wasm32-unknown-unknown`, and 96 unit
tests, in the state described by an earlier version of §4.2 that
asserted the mechanism worked.

1. **`create_entry` can never produce a countersigned entry.** The
   original `finalize_credit_transfer` took only the transfer payload
   and called `create_entry`, on the stated reasoning that "HDK
   recognizes the already-accepted session for that entry's hash" and
   that "`CreateInput` carries no countersigning field." Both halves are
   false. `CreateInput.entry` is a full `Entry`, whose `CounterSign`
   variant is exactly the field claimed not to exist, and the app must
   build it: collect every party's signed `PreflightResponse`, assemble
   a `CounterSigningSessionData`, wrap the app bytes in
   `Entry::CounterSign`, and commit via `create`. What actually happened
   live is worth stating precisely, because it is the failure mode a
   test suite is least likely to model: the commit *succeeded* as a
   plain single-signer entry, and was then caught by this DNA's own
   integrity `validate`. The countersigning requirement held. The
   mechanism meant to satisfy it never ran.
2. **A chain in a countersigning session accepts the session entry and
   nothing else.** `finalize_credit_transfer` also wrote its own
   `AgentToCreditTransfer` index link, which fails with "Attempted to
   write anything other than the countersigning session entry at the
   same time as the session entry." Split into `link_credit_transfer`,
   called once the session releases the chain (§4.2).
3. **`to_app_option` silently drops countersigned entries.** It matches
   `Entry::App` alone and returns `Ok(None)` — not an error — for
   `Entry::CounterSign`. With defects 1 and 2 fixed, transfers committed
   and validated correctly and *every balance still read exactly 0*,
   indistinguishable from an agent who had never transacted. Fixed with
   the `transfer_from_record` helper (§4.2).

The through-line: all three defects live precisely where this codebase's
pure, host-call-free unit tests cannot reach — in what the *host* does
with an entry, not in what the app computes. The unit tests covering
decay math and validation content were correct, passing, and blind to
all three, and the earlier version of this document called the
countersigning flow this pass's "highest-risk, most novel piece" while
recording it as built. It was the right risk call; the fix was to go run
it.

The rest of this section describes the unit-test coverage, which stands
unchanged.

**Compiled and unit-tested, and now also run through a real `hc`
conductor.**
`cargo check`/`cargo build`/`cargo test --lib` all pass clean, both
zomes, both natively and for `wasm32-unknown-unknown`. 22 new unit tests
(13 coordinator: `credit_decay_factor`/`epoch_decay_factor`'s decay math,
`compute_attestation_weight`'s weighted walk against an in-memory fixture
graph mirroring `count_attestations_pure`'s own test shape; 9 integrity:
`validate_credit_transfer`/`validate_credit_burn`'s content checks
against a fixture `Create` action) join the 74 that already existed
(64 coordinator + 10 integrity before this pass) — 96 total, all passing.

This is real coverage of the pure logic, and §7.1 is the standing
evidence for what it does not cover. **One live gap remains, named
rather than quietly closed:** the `SynapticLink` burn-extension path
(§4.3) — free below the original limit, burn-gated up to the hard
ceiling, refused at it — has not been exercised against a real DHT. Its
integrity-side enforcement re-derives claimed burns through
`must_get_agent_activity`, another host-call path of exactly the kind
§7.1's three defects all hid in, so it deserves the same treatment
rather than an assumption that the credit layer's live pass covers it by
association. That is now the top item in §8.

---

## 8. Immediate next steps, in priority order

1. **Live verification of the `SynapticLink` burn-extension path**
   (§4.3) — the one part of this layer still resting on unit tests over
   pure logic, and a host-call path of exactly the kind §7.1's three
   defects all hid in. The countersigning flow itself is now verified
   live (§7); this is what's left of that item.
2. **Per-pair credit limits**, if this ledger needs to hold anything with
   real stakes — closes the balance-check gap named in §4.2.
3. **Multi-hop transitive settlement** (§6.1), if bilateral-only transfers
   turn out to be too limiting in practice.
4. **hREA migration spike** (§6.2) — worth doing before this parallel
   implementation grows much further, specifically to check whether it
   already solves the countersigning problem this pass solved
   independently.
