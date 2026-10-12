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

**2. The nine `must_get_*` rules cannot reject anything.** `must_get_entry` and
`must_get_action` are deterministic dependency fetches: when the dependency is
absent the host abandons the callback with unresolved dependencies, and the
commit returns `DepMissingFromDht` — *"could not be completed but may be
retried"*. Confirmed live against protocol 9: a `Claim` citing a well-formed but
nonexistent `EntryHash` is **held, not refused**, and
`Invalid("Claim evidence hash not found.")` is never returned.

`SPEC.md` §5.3 states the mechanism correctly at line 358. Two other places
overstate the consequence — §5.3:350 (*"MUST resolve to a real, existing entry
at validation time"*) and §5.3:549 (*"enforced for every listed field"*) —
because what is enforced is that the write **waits**, not that a dangling
reference is rejected. A caller who cites a hash that never arrives does not get
an error; they get a commit that never completes.

`replay.mjs` therefore asserts the deferral for these nine, and asserts the
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

Both assertions in `replay.mjs` have been watched failing, against an otherwise
green run:

- **Injection A** — the mutation for `Claim content cannot be empty.` removed,
  so the payload is valid and commits. Result: that one case red, the other five
  green. A rule that stops firing is caught.
- **Injection B** — the expected message changed to
  `Claim domain must be a palindrome.`. Result: that one case red, the rest
  green. The assertion is on the message, not merely on "it threw".

## Why one mutation at a time

A payload that violates two rules proves nothing about either: validation
returns at the first failing check, so the message names whichever rule sits
earlier in the function. Every case starts from a baseline that is asserted to
**commit**, and changes exactly one field. A refusal naming a different rule is
reported as a failure rather than counted as a pass — and the baseline is
checked first, because if it does not commit then every case below it "passes"
by being refused for the wrong reason.
