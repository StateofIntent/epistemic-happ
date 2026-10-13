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

**Five entry types, 18 rules, and the coverage is asserted rather than
stated.** `Claim`, `Mew`, `Evidence`, `Constitution` and `CritiqueSpecies` —
29 checks, which is 5 baselines, 18 rules and 6 coverage assertions.

| entry type | assertable rules | refusals | deferrals |
|---|---|---|---|
| `Claim` | 5 | 3 | 2 |
| `Mew` | 4 | 3 | 1 |
| `Evidence` | 2 | 2 | 0 |
| `Constitution` | 4 | 4 | 0 |
| `CritiqueSpecies` | 3 | 2 | 1 |

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

What it did **not** touch is the reason items beyond this one are costed in
hours: `WorldlineTrace` needs `PeriodBoundary`s whose `sample_action` is
authored by the trace agent plus a 32-byte checksum, and `Revelation` needs a
`PreRegistration` with a question action predating it. Those are dependency
chains, not payloads.

## What the classification is for

The headline number is not 194. Counting all 194 as "rules to test" would be
the same mistake as a green tick that cannot go red, because most of them
cannot be reached by the thing that would need to reach them.

| class | count | what it means |
|---|---|---|
| `honest` | 24 | reachable through the SDK's typed methods or the MCP tools, by a client doing nothing special |
| `crafted` | 130 | reachable only by calling the coordinator with a payload the typed methods never produce |
| `deferred` | 9 | a `must_get_*` guard — **the message never fires**; see below |
| `needs_prober` | 15 | link rules with no `attempt_*` path, so unreachable from JavaScript at all |
| `remote` | 4 | needs a bad DNA build or a `Delete` action the coordinator never emits |
| `passthrough` | 12 | forwards another validator's result; no message of its own |

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

## Why one mutation at a time

A payload that violates two rules proves nothing about either: validation
returns at the first failing check, so the message names whichever rule sits
earlier in the function. Every case starts from a baseline that is asserted to
**commit**, and changes exactly one field. A refusal naming a different rule is
reported as a failure rather than counted as a pass — and the baseline is
checked first, because if it does not commit then every case below it "passes"
by being refused for the wrong reason.
