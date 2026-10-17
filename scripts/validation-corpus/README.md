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

**Ten entry types and four link types, and the coverage is asserted rather
than stated.** 92 checks. Link rules use the same driver — a link case is still
a valid thing with one field broken — but they are keyed on `link_type` rather
than `entry`, because every link site shares `entry: "create_link"` and
grouping them by entry would collapse nineteen rule sets into one meaningless
denominator.

| link type | prober | assertable rules | asserted | declared unreachable |
|---|---|---|---|---|
| `AgentToClaim` | `attempt_false_attachment_link` | 6 | 5 | 1 |
| `AgentToConstitution` | `attempt_false_attachment_link` | 3 | 2 | 1 |
| `DomainToClaim` | `attempt_false_domain_index` | 3 | 2 | 1 |
| `MembraneRegistry` | `attempt_false_membrane_registry` | 3 | 2 | 1 |

**The slice covers all three probers on purpose.** The generic one carries 18 of
the 19 link types and lets the caller choose base, target and raw tag bytes; the
other two are single-purpose and NARROWER, building the anchor themselves from a
domain or an override, so the rules they can reach are bounded by their
parameters rather than by the validator. A slice using only the generic prober
would have proved nothing about the other two.

**15 of 19 link types remain.** What is done is the driver, the three prober
shapes, and both anchor forms.

| entry type | assertable rules | refusals | deferrals | declared unreachable |
|---|---|---|---|---|
| `Claim` | 5 | 3 | 2 | 0 |
| `Mew` | 4 | 3 | 1 | 0 |
| `Evidence` | 2 | 2 | 0 | 0 |
| `Constitution` | 4 | 4 | 0 | 0 |
| `CritiqueSpecies` | 3 | 2 | 1 | 0 |
| `Retraction` | 6 | 3 | 2 | 1 |
| `Critique` | 6 | 4 | 1 | 1 |
| `AntibodyPattern` | 5 | 4 | 0 | 1 |
| `Membrane` | 5 | 4 | 0 | 1 |
| `FederationRecord` | 6 | 4 | 1 | 1 |

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
| `crafted` | 120 | reachable only by calling the coordinator with a payload the typed methods never produce |
| `deferred` | 15 | a `must_get_*` guard — **the message never fires**; see below |
| `needs_prober` | 14 | link rules with no `attempt_*` path, so unreachable from JavaScript at all |
| `needs_extern` | 10 | entry rules whose field the coordinator **derives** rather than accepting — same cost as `needs_prober` |
| `remote` | 4 | needs a bad DNA build or a `Delete` action the coordinator never emits |
| `passthrough` | 12 | forwards another validator's result; no message of its own |

**`deferred` was 9 and `honest` was 24 until 2026-10-17.** Six sites moved, all
in the same direction, because the classifier could only see one of the four
shapes this zome writes a `must_get_*` guard in. The counts below are the
corrected ones; what the correction found is finding 4.

### Three findings this produced on its first run

**1. An AI agent driving the MCP server can reach 19 of 194.** That is the
`honest` row, and it is a feature of the SDK rather than a gap in the tools:
`agent-sdk` sets `author: this.agentPubKey` and `timestamp: nowMicros()`
(`index.ts:308-309`), so every *"author must match action author"* rule and
every self-reported-time rule is unreachable from any honest client. Pointing
agents at `publish_claim` exercises the semantic rules and the budget path
hard — and leaves the identity and ordering rules untouched while looking like
validation stress. A further 120 need `EpistemicAgent.call()`
(`index.ts:195`, public) with a hand-built payload.

*(This read 24 and 130 on the first run. Both numbers were wrong for reasons
findings 4 and 5 record: five sites were deferrals mislabelled `honest`, and ten
were `crafted` rules whose field the coordinator derives, so no payload reaches
them. The counts here are regenerated rather than hand-maintained — `node
enumerate.mjs` prints them — and the figures in this file are from the
2026-10-17 run.)*

**2. The `must_get_*` rules are enforced, but not by the lines that look
like the enforcement.** *(This said "nine" and the count is 15 — see finding 4.
The mechanism below is unchanged and was never in doubt; only how many sites it
covers was.)* `must_get_entry` and `must_get_action` are deterministic
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

**The classification was wrong in both directions here**, which is the part
worth keeping: `PeriodBoundary sample_action not found.` was classed `honest`
and is not reachable at all, while `expires_at must be > created_at.` sat in
`crafted` alongside seven rules nobody can reach.

**FIXED 2026-10-17 — `enumerate.mjs` now reads the coordinator too**, and the
split of labour is the point. Mechanical half: for each extern it parses the
struct literal that builds the entry and records, per field, whether the value
comes from the params (`input.x`, `params.x`) or from the host. Judgement half:
mapping a RULE to the field it guards, which most messages do themselves and
some do not — *"Only the author of a PreRegistration may reveal it."* guards
`pre_registration` and names no field. Those are curated in `GUARDS_FIELD`, and
**a params-only site matching neither a field name nor the table stops the build
with exit 1 before the inventory is written.** An unresolved site is a question
about reachability, and answering it by default is how the wrong denominator got
here. The gate fired twice during development, on real omissions.

Of the 24 sites across those five entry types, **9 are assertable as refusals**,
5 are deferrals and 10 are `needs_extern`:

| entry type | caller-controlled fields | reachable as a refusal |
|---|---|---|
| `worldline_trace` | `expertise_tags`, `expires_at` | **1** of 8 |
| `revelation` | `pre_registration`, `prediction`, `salt` | 4 of 6 |
| `pre_registration` | `question`, `reveal_deadline` | 2 of 4 |
| `bridge_record` | 8 fields | 1 of 3 |
| `external_critique` | 5 fields | 1 of 3 |

**Two details that decided the implementation**, both found by being wrong
first. Matching a rule to *caller-controlled* field names only is not enough —
`trace_payload exceeds 64KB limit.` names its field plainly and fell through to
"unresolved" precisely BECAUSE the field is derived, so the match runs over every
field of the entry and reachability is decided by membership afterwards. And the
field whose name appears **earliest** in the message wins, not the longest:
*"ExternalCritique importer must match action author. Note this is … the Twitter
handle in `author_handle`"* names two fields and guards the first, so
longest-match picks `author_handle` and is wrong.

### Finding 6 — the coordinator refuses first, so the rule's own message never appears

**The reachability question 5d opened has a second answer, and this one is not
about derived fields.** Four of `Membrane`'s rules and both SWO friction rules
are mirrored as coordinator PRE-CHECKS, with different wording. Driving them
through the ordinary extern produces the coordinator's string, so every case
"passes" by being refused for the wrong reason:

| driven through | came back |
|---|---|
| `create_membrane`, empty promises | `Membrane must declare at least one required_promise.` (no trailing prose — the coordinator's) |
| `create_membrane`, bad constitution | `Deserialize("missing field `agent`")` |
| `create_membrane`, forged creator | `Membrane constitution must be the creator's own published Constitution.` — a DIFFERENT rule, because the coordinator checks in another order |
| `create_critique` × 21 | `epistemic_coordinator:888`, *"already created in the last 3600 seconds"* |

**For `Membrane` there is a way through and it is already in the tree.**
`attempt_unaccountable_membrane` is `create_entry` with nothing in front of it,
and its own doc comment says that is why it exists: so DHT validation can be
observed refusing rather than assumed to. The corpus drives `Membrane` through
the prober, and all four rules then produce their real messages.

**For the two friction rules there is no such path**, so they are declared
unreachable. The part worth not losing: **what is tested is the courtesy and
what is untested is the enforcement.** The coordinator's check is what a custom
client skips; the integrity rule, built on
`count_recent_actions_since_checkpoint`, is what every validating peer runs.
That inversion is exactly what this corpus exists to find, and it is now
recorded instead of implied.

`enumerate.mjs` cannot see any of this yet — it learned about derived fields in
5d, not about pre-checks that shadow a rule. Teaching it is its own queue item.

### Finding 7 — a message that needs `Ok(None)`, which a wrong-typed entry does not produce

`Membrane's constitution hash does not resolve to a Constitution entry.` guards:

```rust
let record = must_get_valid_record(membrane.constitution)?;
let c: Option<Constitution> = record.entry().to_app_option().map_err(..)?;
let Some(c) = c else { return Invalid("... does not resolve ...") };
```

The message needs `to_app_option` to return **`Ok(None)`**, and two obvious
payloads do not get there — both measured before the third worked:

| `constitution` points at | what happens |
|---|---|
| a dangling ActionHash | `must_get_valid_record(..)?` **defers** the commit |
| a Claim's ActionHash | a Claim IS an app entry, so the deserialize **fails** — `Deserialize("missing field `agent`")`, a wasm error, not this rule |
| **a CreateLink action** | no app entry → `Ok(None)` → **the rule fires** |

So the corpus builds a valid `AgentToClaim` link through
`attempt_false_attachment_link` and uses its ActionHash. Two constraints showed
up on the way: the target must be an **ActionHash**, and the tag must be the
claim's own domain or the link itself is refused and the record never exists to
be fetched.

**This is the deferral finding's shape again at one more remove.** A rule whose
message reads as the enforcement, whose obvious trigger produces something else
entirely, and which is reachable only by a payload nobody would guess. It is
asserted now rather than assumed.

### Finding 8 — 23 rules are waiting on one piece of work, and it is a second agent

**Counted rather than discovered a few at a time.** Every one of the 19 link
types carries a *"may only be created by the owner"* rule in some wording:
**20 of the 88 link rules**, across all 19 types. Add the three entry-type gaps
(`Retraction`, `Membrane`, `FederationRecord`) and **23 rules in this corpus are
blocked on the same thing** — a second agent on one DHT. One conductor has one
agent, so everything it can author is its own, and forging the owning field is
stopped a rule earlier by the matching author check.

| | count |
|---|---|
| link rules reachable with one agent | 68 |
| link rules needing a second agent | 20 |
| entry rules needing a second agent | 3 |

**That makes the two-agent harness higher-leverage than the remaining link
bulk**, which is the opposite of how the queue was ordered when the link work
was costed. `scripts/network.sh` already stands up multiple conductors for the
gossip harnesses, so the parts exist; what is missing is the corpus driving two
of them.

### Finding 9 — a `format!` rule cannot be matched literally

The inventory records the zome's SOURCE string, so
`DomainToClaim base anchor does not match the claim's own domain ({:?}).` is
what the rule says, while the conductor returns the domain substituted in. The
first formatted rule to be *asserted* rather than declared unreachable found
this immediately.

Matching the literal would fail forever. Loosening the check to "did it throw"
would pass for any reason at all — the failure mode this whole corpus exists to
stop. So the comparison is the stable **prefix up to the first interpolation**,
everything the zome wrote verbatim, and **a prefix too short to identify a rule
is refused outright rather than silently weakened** (under 20 characters). That
guard is tested, not assumed — see Injection Q.

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

J and K are on `enumerate.mjs` rather than `replay.mjs` — the inventory is input
to the corpus, so a classifier that cannot go wrong loudly is the same hazard one
level up.

- **Injection J** — `Checksum must be 32 bytes.` removed from `GUARDS_FIELD`, so
  a params-only rule has no field mapping. Result: **exit 1**, naming
  `worldline_trace:1650`, and `corpus/inventory.json` is left untouched — the
  guard sits above the write, so a half-classified inventory is never committed.
- **Injection K** — the coordinator edited so `checksum` comes from
  `params.checksum_override` instead of being derived. Result: `needs_extern`
  **10 → 9** and that rule moves to `crafted`, with `checksum` appearing in its
  `caller_controlled_fields`. This is the one that matters: it shows the class is
  computed from the coordinator's own source rather than from a list of entry
  types somebody typed, so an extern that starts accepting a field is noticed
  instead of staying permanently unreachable in the records.

L, M and N were taken on the ten-type version, which is 68 checks.

- **Injection L** — `Membrane` driven through `create_membrane` instead of
  `attempt_unaccountable_membrane`. Result: **65 passed, 3 failed**, each
  reporting the COORDINATOR's wording rather than the zome's, and one of them
  naming a different rule entirely because the coordinator checks in another
  order. This is finding 6 as a test: the prober is load-bearing, not a
  stylistic choice, and without it three green ticks would have meant nothing.
- **Injection M** — the non-Constitution hash changed from the CreateLink
  action's to a Claim's. Result: **67 passed, 1 failed**, on
  `epistemic_integrity:1531: Deserialize("missing field `agent`")`. Finding 7 as
  a test: the obvious payload raises a wasm error instead of the rule, so a case
  written the obvious way asserts nothing.
- **Injection N** — the mutation for `FederationRecord remote_membrane_ref
  cannot be empty.` removed. Result: **67 passed, 1 failed**, `the call
  COMMITTED`. A rule that stops firing is caught at the end of a depth-2 chain,
  not only on a flat payload.

O, P and Q were taken on the version with link rules, which is 92 checks.

- **Injection O** — the `AgentToClaim` tag mutation removed. Result: **91
  passed, 1 failed**, `the call COMMITTED`. A LINK rule that stops firing is
  caught, on the same terms as an entry rule.
- **Injection P** — the formatted rule's prefix changed to a message the zome
  never emits. Result: **89 passed, 3 failed** — the assertion reports `stopped
  for a different reason` and both coverage directions red. **The prefix match
  is not a wildcard**, which is the thing worth proving about it: a rule matched
  on a prefix could easily have become a check that passes on any refusal.
- **Injection Q** — a case whose rule interpolates after three characters
  (`"Mem {} brane"`). Result: **89 passed, 3 failed**, the assertion reporting
  `this rule interpolates too early to identify it from a prefix ("Mem")`. The
  guard refuses rather than weakening, so finding 9's mechanism cannot be
  stretched into a loophole by the next rule that happens to interpolate early.

## Why one mutation at a time

A payload that violates two rules proves nothing about either: validation
returns at the first failing check, so the message names whichever rule sits
earlier in the function. Every case starts from a baseline that is asserted to
**commit**, and changes exactly one field. A refusal naming a different rule is
reported as a failure rather than counted as a pass — and the baseline is
checked first, because if it does not commit then every case below it "passes"
by being refused for the wrong reason.
