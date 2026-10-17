# The validation corpus

`dna/integrity/src/lib.rs` returns `ValidateCallbackResult::Invalid` at **194
sites**. Before this directory existed, no harness in `scripts/live-verify`
asserted a single one of those messages, and `SECURITY.md` recorded that 72 of
the harness's 73 checks had never been shown capable of failing. The validation
layer was the largest body of unexercised behaviour in the repository.

Two files:

- **`enumerate.mjs`** reads the integrity zome and writes
  `corpus/inventory.json` — every site, its enclosing validator, its guard
  condition, its message, and **what kind of thing could reach it**.
- **`replay.mjs`** builds a valid baseline payload per entry type, applies one
  mutation per site, and asserts the zome does what the inventory says it does.

Run them in that order. `replay.mjs` needs a sandbox
(`scripts/sandbox.sh clean && scripts/sandbox.sh start`).

**Both run in CI as of 2026-10-13** (#264): `enumerate.mjs` in the
`no-conductor` job, where its output is diffed against the committed
`inventory.json` so a rule added or removed without regenerating it fails the
build, and `replay.mjs` in `conductor.yml` against a real conductor.

## What is covered, and what the denominator is

**Six entry types, 23 rules, and the coverage is asserted rather than
stated.** `Claim`, `Mew`, `Evidence`, `Constitution`, `CritiqueSpecies` and
`Retraction` — 38 checks, which is 6 baselines, 1 dependency chain, 23 rules
and 8 coverage assertions.

| entry type | assertable rules | refusals | deferrals | declared unreachable |
|---|---|---|---|---|
| `Claim` | 5 | 3 | 2 | 0 |
| `Mew` | 4 | 3 | 1 | 0 |
| `Evidence` | 2 | 2 | 0 | 0 |
| `Constitution` | 4 | 4 | 0 | 0 |
| `CritiqueSpecies` | 3 | 2 | 1 | 0 |
| `Retraction` | 6 | 3 | 2 | 1 |

**`Retraction` is the first entry type with a dependency chain, and it cost one
extra call rather than a new mechanism.** `target_claim` must be the EntryHash
of a Claim that exists and belongs to the retracting agent, so a spec may now
declare an async `setup` whose result `baseline(ctx)` consumes. The chain is
built once per entry type, not once per case, and a chain that fails to build is
its own red — if it were not, every case below it would be refused for the wrong
reason and "pass" by being refused at all, which is the baseline check's trap one
level further out.

**The declared-unreachable column is the honest part of that table.** A
`Retraction` of somebody else's Claim is what *"can only be published by the
claim's own author"* catches, and this harness drives one conductor with one
agent: every Claim it can author is its own, and a forged `author` is stopped one
rule earlier. So the rule is listed in `GAPS` with its reason, printed on every
run, and **asserted to still exist in the inventory** — a declared gap whose rule
the zome no longer has reds this file exactly as an orphaned case does, so the
escape hatch cannot rot into a silencer. Reaching it needs a second agent on one
DHT, which `scripts/network.sh` already builds for the gossip harnesses: a
harness-shape change, not a zome change.

**The counts in that table are not hand-maintained, which is the point.**
`replay.mjs` compares the rules its case tables name against the inventory's
own list for those five entry types, in **both** directions: a rule with no
case fails the harness, and a case naming a rule the inventory no longer lists
fails it too. The second direction is the one that would otherwise rot
silently — a case asserting a message the zome can no longer produce still
*looks* like coverage. The drift check in `live-verify.yml` catches the step
before this one, where `lib.rs` moves and the inventory does not; neither
catches the other's case.

**What the shallow slice showed, which was the reason to do it before the long
chains.** The baseline-plus-one-mutation pattern generalises without
modification: four more entry types needed four baseline payloads and no change
to the driver, and the Claim block was folded into the same driver rather than
copied. Two shapes did need care, and both are boundary rather than
bulk — `Mew`'s length rule is asserted at **561** bytes rather than a
comfortable 600, because a value well past the limit passes against an
off-by-one; and `Constitution`'s `expires_at` is asserted at **equality**,
since the guard is `<=` while the message claims `>`, so a date in the past
would fire the rule and leave that boundary unproven.

What it did **not** touch was described here as the reason the remaining items
are costed in hours: `WorldlineTrace` needing `PeriodBoundary`s whose
`sample_action` is authored by the trace agent plus a 32-byte checksum, and
`Revelation` needing a `PreRegistration` with a question action predating it.
**That turned out to be the wrong reason, and finding 5 below is why** — neither
entry type has a coordinator extern that accepts a raw payload, so those fields
are derived and the rules about them are not reachable from JavaScript at all.
The expensive thing was never the chain. `Retraction` has a real chain and cost
one extra call.

## What the classification is for

The headline number is not 194. Counting all 194 as "rules to test" would be
the same mistake as a green tick that cannot go red, because most of them
cannot be reached by the thing that would need to reach them.

| class | count | what it means |
|---|---|---|
| `honest` | 19 | reachable through the SDK's typed methods or the MCP tools, by a client doing nothing special |
| `crafted` | 130 | reachable only by calling the coordinator with a payload the typed methods never produce |
| `deferred` | 15 | a `must_get_*` guard — **the message never fires**; see below |
| `needs_prober` | 14 | link rules with no `attempt_*` path, so unreachable from JavaScript at all |
| `remote` | 4 | needs a bad DNA build or a `Delete` action the coordinator never emits |
| `passthrough` | 12 | forwards another validator's result; no message of its own |

**`deferred` was 9 and `honest` was 24 until 2026-10-17.** Six sites moved, all
in the same direction, because the classifier could only see one of the four
shapes this zome writes a `must_get_*` guard in. The counts below are the
corrected ones; what the correction found is finding 4.

### Three findings this produced on its first run

**1. An AI agent driving the MCP server can reach 24 of 194.** That is the
`honest` row, and it is a feature of the SDK rather than a gap in the tools:
`agent-sdk` sets `author: this.agentPubKey` and `timestamp: nowMicros()`
(`index.ts:308-309`), so every *"author must match action author"* rule and
every self-reported-time rule is unreachable from any honest client. Pointing
agents at `publish_claim` exercises the semantic rules and the budget path
hard — and leaves the identity and ordering rules untouched while looking like
validation stress. The remaining 130 need `EpistemicAgent.call()`
(`index.ts:195`, public) with a hand-built payload.

**2. The nine `must_get_*` rules are enforced, but not by the lines that look
like the enforcement.** `must_get_entry` and `must_get_action` are deterministic
dependency fetches: when the dependency is absent the host abandons the callback
with unresolved dependencies, so the `Invalid("… not found.")` branch beneath
each one is never taken. The rule still holds — the write is stopped by the
host, which returns `DepMissingFromDht`, *"could not be completed but may be
retried"*.

**The write is stopped immediately and visibly**, which an earlier version of
this file got wrong. Measured against protocol 9, a `Claim` citing a well-formed
but nonexistent `EntryHash`:

| | |
|---|---|
| time to error | **0.1s** — it throws, it does not hang |
| entry written | **no** — `get_claims_by_domain` returns 0 |
| what the caller sees | `DepMissingFromDht(uhCEk…)`, not the rule's own message |

So `SPEC.md` §5.3:350 (*"MUST resolve to a real, existing entry at validation
time"*) and §5.3:549 (*"enforced for every listed field"*) are **substantively
correct**: a claim citing a nonexistent entry cannot be committed. §5.3:358
already states the deferral mechanism, and states it as the reason
`Critique.evidence_hashes` is deliberately left unchecked. Nothing in §5.3 needs
to change.

Two things do follow, and the second is the one that matters.

The nine `Invalid("… not found.")` strings read as the enforcement and are not.
They cannot be annotated in place: per §5.1, a comment in the integrity zome
changes the DNA hash, because `wasm_error!` expands to `::core::line!()` and the
zome uses it 23 times. The caveat therefore lives in `SPEC.md` §5.3, which is
what §5.1 says to do.

And the error names a missing hash rather than a broken rule. On a single node
that is cosmetic. On a real network it is not: the dependency will often be
**present on a peer but not yet local**, so a *legitimate* claim citing
just-published evidence fails to commit until propagation catches up. §5.3:358
names exactly this cost — *"gate validation of this protocol's most frequent act
on the propagation of everything it cites"* — and `Claim.evidence_hashes`
accepts it deliberately, for traversal well-formedness. With propagation
measured at 415–943s (READINESS §3), that is a user blocked from publishing for
**7–16 minutes**, told only to retry. Whether the SDK should absorb that is an
open question, not a defect.

`replay.mjs` asserts the dependency stall for these nine and asserts the rule's
message does **not** appear. A build where it did would mean the semantics had
changed, and that should be a loud failure rather than a silent improvement.

**3. Fifteen link rules need a coordinator change, not a test.** Link ops are
authored locally — every `create_claim` writes index links — so a link rule is
not unreachable for being a link rule. What decides it is whether a path exists
that writes that link type with a caller-chosen base, target or tag. Those paths
are the `attempt_*` probers, and twenty link types have one.
**`AgentToMembrane`, `AttestationGrant`, `Reinforcement`, `TaxonomyToSpecies`
and `SynapticLink` do not** — the same list `attachment-links.mjs`'s header
calls "the link types nobody probed". Reaching their 15 rules means adding an
`attempt_*` function and rebuilding the DNA, which is a different and much
larger job than adding a payload here.

### Finding 4 — the deferral classifier found one shape out of four, and two rules it mislabelled are measured

**`deferred` means "the message never fires", so a site in the wrong class is a
corpus case that would fail forever.** Until 2026-10-17 the class was decided by
a regex over the extracted guard condition, `/must_get_(entry|action)/`, and that
matched exactly one of the four shapes in `lib.rs`:

| shape | what the guard extractor returned |
|---|---|
| `if must_get_entry(h).is_err() { Invalid(..) }` | the guard — **found** |
| `let Ok(v) = must_get_entry(h) else { Invalid(..) }` | `null` |
| `match must_get_entry(h) { Err(_) => Invalid(..) }` | `"Err(_) =>"` |
| `must_get_valid_record(h)?` | no `Invalid` of its own |

**Measured against a real conductor rather than argued.** Two of the mislabelled
sites were classed `honest` — *"reachable by a client doing nothing special"* —
and both are retryable stalls:

| payload | result |
|---|---|
| `create_retraction` with a nonexistent `target_claim` | `DepMissingFromDht([AnyDhtHash(..)])` |
| `record_federation` with a nonexistent `local_membrane` | `DepMissingFromDht([AnyDhtHash(..)])` |

Neither rule's own message appears. Six sites moved to `deferred`:
`PreRegistration question does not resolve.`, `Revelation pre_registration does
not resolve.`, `Retraction target claim not found.`, `FederationRecord
local_membrane not found.`, `PeriodBoundary sample_action not found.`, and
`AttestationGrant's referenced membership action not found.` None belong to an
entry type the corpus already covered, so the existing 29 checks were unaffected
— confirmed by running them against the regenerated inventory before anything
else changed.

**And proximity is not the fix, which is why `enumerate.mjs` now does brace
matching.** `Retraction target must be a Claim.` sits six lines below the same
`must_get_entry` and is **not** a deferral: it is reached when the entry resolves
and is the wrong type. Any rule keyed on *"is there a `must_get` above me"*
mislabels it in the other direction. What decides the class is whether the site
sits inside the **failure branch** of the call, so that is what is computed — per
shape, with the `?` form deliberately producing no site at all rather than a
mislabelled one. Both sites are now cases in the `Retraction` table, one
asserting the stall and one asserting the message, which is the distinction held
open by a test rather than by a comment.

### Finding 5 — some `crafted` sites have no write path at all, and `WorldlineTrace` is 1 of 8 rather than 8

**`crafted` assumes a hand-built payload can reach the validator. That is only
true if a coordinator extern accepts the raw entry**, and for five entry types
none does — the extern takes a params struct and derives the fields the rules
are about.

| extern | takes | consequence |
|---|---|---|
| `generate_worldline_trace` | `TraceGenerationParams` | `agent`, `period_boundaries`, `checksum`, `trace_payload` all derived |
| `reveal_pre_registration` | `RevealInput` | — |
| `pre_register` | `PreRegisterInput` | — |
| `record_twitter_mirror` | `RecordTwitterMirrorInput` | — |
| `import_twitter_reply` | `ImportTwitterReplyInput` | — |

`generate_worldline_trace` is the worked example. It sets `agent` from
`agent_info()`, builds `period_boundaries` by `query()`ing the caller's own
source chain, and derives `checksum` and `trace_payload` — so of its 8 sites,
**exactly one is reachable from JavaScript**: `expires_at must be > created_at.`,
because `params.expires_at` passes straight through. The other seven need a new
`attempt_*` extern and a DNA rebuild, which is the same cost as the
`needs_prober` link rules.

**The classification is wrong in both directions here**, which is the part worth
keeping: `PeriodBoundary sample_action not found.` was classed `honest` and is
not reachable at all, while `expires_at must be > created_at.` is classed
`crafted` and is the one a plain client can trigger. `enumerate.mjs` reads only
the integrity zome, so it cannot see any of this — teaching it to cross-check the
coordinator's externs is the fix, and it is not done. Until it is, **24 sites
across those five entry types are counted assertable and mostly are not.**

## Negative evidence

Every assertion in `replay.mjs` has been watched failing, against an otherwise
green run. A and B were taken on the Claim-only version; C, D and E on the
five-type version, which is 29 checks.

- **Injection A** — the mutation for `Claim content cannot be empty.` removed,
  so the payload is valid and commits. Result: that one case red, the other five
  green. A rule that stops firing is caught.
- **Injection B** — the expected message changed to
  `Claim domain must be a palindrome.`. Result: that one case red, the rest
  green. The assertion is on the message, not merely on "it threw".
- **Injection C** — `Mew`'s 561-byte mutation replaced with a short string, so
  the payload is valid. Result: **28 passed, 1 failed**, the one case reporting
  `the call COMMITTED — nothing stopped this payload`. A length rule that stops
  firing is caught on an entry type other than `Claim`.
- **Injection D** — `CritiqueSpecies name cannot be empty.` renamed in the case
  table to a message the zome never emits. Result: **26 passed, 3 failed** — the
  assertion itself, *and both coverage directions*, because a renamed rule is
  simultaneously a rule with no case and a case naming nothing in the
  inventory. Three reds from one edit is the coverage check working rather than
  noise.
- **Injection E** — the case for `Evidence content cannot be empty.` deleted
  outright, with the inventory left correct. Result: **27 passed, 1 failed**,
  on `evidence: all 2 assertable rules have a case`. This is the gap the
  inventory drift check cannot see: a correct inventory, a correct zome, and
  coverage that silently shrank.

F, G and I were taken on the six-type version, which is 38 checks.

- **Injection F** — the mutation for `Retraction reason cannot be empty.`
  removed, so the payload stays valid and commits. Result: **37 passed, 1
  failed**, that case reporting `the call COMMITTED`. A rule that stops firing
  is caught on an entry type reached through a dependency chain, not only on a
  flat payload.
- **Injection G** — `Retraction target claim not found.` asserted as a
  **refusal** instead of a deferral, which is exactly the mistake the old
  classification would have led someone to write. Result: **37 passed, 1
  failed**. The deferral assertion is load-bearing: a stall does not satisfy a
  refusal, so the two cannot be confused into a green tick.
- **Injection I** — the declared-unreachable rule renamed to a message the zome
  never emits. Result: **36 passed, 2 failed** — the retraction coverage count
  *and* `every declared-unreachable rule is still in the inventory`. Two reds
  from one edit, the same shape as Injection D, and the reason `GAPS` cannot
  become a way to hide a missing case: an exemption that outlives its rule reds
  the file.

## Why one mutation at a time

A payload that violates two rules proves nothing about either: validation
returns at the first failing check, so the message names whichever rule sits
earlier in the function. Every case starts from a baseline that is asserted to
**commit**, and changes exactly one field. A refusal naming a different rule is
reported as a failure rather than counted as a pass — and the baseline is
checked first, because if it does not commit then every case below it "passes"
by being refused for the wrong reason.
