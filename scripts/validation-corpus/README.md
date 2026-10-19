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

**Ten entry types and six link types, and the coverage is asserted rather
than stated.** 106 checks, **seven of which need a second agent** — see
*A second agent* below, and three of which are driven with no baseline at all,
because a valid `AttestationGrant` needs thirty days of prior membership. Every link type here is now 3 of 3: nothing in this
slice is declared unreachable any more. Link rules use the same driver — a link case is still
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
| `AttestationGrant` | **none — `grant_attestation`** | 2 | 2 | 0 |
| `Reinforcement` | **none — `reinforce_synaptic_link`** | 1 | 1 | 0 |

**The slice covers all three probers on purpose.** The generic one carries 18 of
the 19 link types and lets the caller choose base, target and raw tag bytes; the
other two are single-purpose and NARROWER, building the anchor themselves from a
domain or an override, so the rules they can reach are bounded by their
parameters rather than by the validator. A slice using only the generic prober
would have proved nothing about the other two.

**The last two rows have no prober, and that is finding 11.** Reachability was
decided per TYPE from a hand-maintained list of prober names, so one rule on
each of those two types sat in `needs_prober` — "needs a DNA rebuild" — while an
ordinary published extern could make it fire, and `COVERED_LINKS` never listed
the type, so no denominator counted it either. It is now decided per RULE, with
the probed set read off the coordinator's own match arms.

**13 of 19 link types remain.** What is done is the driver, the three prober
shapes, both anchor forms, and a second driver shape for rules whose baseline
cannot exist.

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
| `crafted` | 122 | reachable only by calling the coordinator with a payload the typed methods never produce |
| `deferred` | 14 | a `must_get_*` guard — **the message never fires**; see below |
| `needs_prober` | 13 | link rules **no published path can make fire**, so unreachable from JavaScript at all — decided per rule, not per link type, since finding 11 |
| `needs_extern` | 10 | entry rules whose field the coordinator **derives** rather than accepting — same cost as `needs_prober` |
| `remote` | 4 | needs a bad DNA build or a `Delete` action the coordinator never emits |
| `passthrough` | 12 | forwards another validator's result; no message of its own |

**`deferred` was 9 and `honest` was 24 until 2026-10-17.** Six sites moved, all
in the same direction, because the classifier could only see one of the four
shapes this zome writes a `must_get_*` guard in. The counts below are the
corrected ones; what the correction found is finding 4.

**And `needs_prober` was 14, `crafted` 120 and `deferred` 15 until 2026-10-19.**
Three more sites moved, in both directions this time: two rules were reachable
through an ordinary extern while the inventory said they needed a DNA rebuild
(finding 11), and one deferred link rule was keyed to no link type at all and
turned out to be unreachable on a closer look (finding 12). **Every one of the
three was invisible to every denominator in this directory**, which is the
property these two findings share with finding 4 and is why they are worth more
than the three rules they moved.

### Three findings this produced on its first run

**1. An AI agent driving the MCP server can reach 19 of 194.** That is the
`honest` row, and it is a feature of the SDK rather than a gap in the tools:
`agent-sdk` sets `author: this.agentPubKey` and `timestamp: nowMicros()`
(`index.ts:308-309`), so every *"author must match action author"* rule and
every self-reported-time rule is unreachable from any honest client. Pointing
agents at `publish_claim` exercises the semantic rules and the budget path
hard — and leaves the identity and ordering rules untouched while looking like
validation stress. A further 122 need `EpistemicAgent.call()`
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
calls "the link types nobody probed".

***Corrected 2026-10-19 — this said "reaching their 15 rules means adding an
`attempt_*` function and rebuilding the DNA", and for two of them it was not
true.*** A prober is not the only path with caller-chosen fields:
`reinforce_synaptic_link` passes its only argument through as the link's base
and `grant_attestation` carries base, target and tag. **Two of those 15 rules
were reachable all along**, and the figure is now 13 — see finding 11, which is
also why the question is asked per rule rather than per link type.

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

### Finding 10 — a `Claim` deserialises as a `Mew`, and two type checks cannot fire

**Found by driving the obvious payload and watching it pass.** `AgentToMew target
is not a Mew.` guards `target_record.entry().to_app_option::<Mew>()`, so the
payload that should trigger it is a link whose target is not a Mew. A `Claim`
was the nearest thing to hand — and the call COMMITTED.

| `Mew`'s non-Option fields | `Claim` carries |
|---|---|
| `content: String` | yes, same type |
| `author: AgentPubKey` | yes, same type |
| `timestamp: u64` | yes, same type |
| `semantic_tags: Vec<String>` | yes, same type |
| `reply_to`, `linked_claim` (both `Option`) | **neither** — and the deserialise still succeeded |

So the empirical rule, which is the one worth writing down because it is
stronger than the obvious guess: **A reads from B iff every NON-Option field of
A exists in B at an identical declared type.** A missing `Option` is tolerated;
extra fields in B are ignored. The direction therefore matters, and here it is
everything — `Claim` carries `domain`, `confidence` and `evidence_hashes`, which
`Mew` does not, so **a Mew never passes as a Claim.**

**The sweep found a SECOND live site the original finding had missed** (item 16,
`scripts/check-entry-type-confusion.mjs`): the shared BridgeRecord guard
computes `is_mew` with the same call, so a **Claim** base passes as a Mew and
`A MewToBridgeRecord link's base is not a Mew.` cannot fire either — a claim's
mirror can be filed under the Mew link type, which is the mirror image of the
harm its sibling rule names. The sibling, `A ClaimToBridgeRecord link's base is
not a Claim.`, holds for the one-directionality reason above.

**WHAT IS NOT BROKEN, because the exposure is what decided the response.** Both
sites are bounded by their own ownership rules, so neither is cross-agent: the
worst available is an agent filing its OWN Claim where a reader expects a Mew.
And `An AgentToMew link may only be created by the Mew's own author.` still
fires, because it compares the deserialised `author` to the action author and a
Claim carries an `author` too — what it loses is only that the entry it calls a
Mew may be a Claim.

**READINESS item 17 decided to accept it.** The repair is a discriminant field
on `Mew`, which changes the integrity zome and therefore the DNA hash — a
`protocol_version` bump and a network reset for every installed hApp, this
repository's most expensive change class, for two guards with that exposure. So
the rules stop READING as enforcement instead: both sites now carry an
`enforcement_caveat` in `corpus/inventory.json`, derived from the entry structs
by `enumerate.mjs` rather than hand-noted, saying what the guard does not cover
and what it still does — it fires for an entry of any other type (the
deserialise fails) and for a non-entry action (`Ok(None)`).

**Two independent derivations that must agree.** `enumerate.mjs` publishes the
confusable pairs in the inventory and `check-entry-type-confusion.mjs` derives
them again from the zome and fails if the two sets differ. One parser agreeing
with itself proves nothing about a conclusion this specific.

### Finding 11 — the drivability list was hand-maintained, and for two link types it was gating nothing

**`enumerate.mjs` decided whether a link rule was reachable by asking whether
its link type had an `attempt_*` prober**, from a `PROBED_LINK_TYPES` set of
twenty names typed into the file. Everything else was `needs_prober` — "needs a
coordinator change + DNA rebuild". That inference is wrong in one direction: **a
prober is not the only published path with caller-chosen fields.**

| extern | what the caller controls | the rule it reaches |
|---|---|---|
| `reinforce_synaptic_link(ActionHash)` | the link's entire BASE — it is the only argument | `Reinforcement base is not a SynapticLink creation.` |
| `grant_attestation(GrantAttestationPayload)` | base, target, and the tag's bytes | `AttestationGrant requires proof of sufficiently tenured membership …` |

Both rules were reachable from JavaScript, were labelled as needing a DNA
rebuild, and — because `replay.mjs`'s coverage loop iterates a hand-maintained
`COVERED_LINKS` — **were in no denominator anywhere.** Nobody would have noticed
either of them being deleted. The file's own header had warned about the shape:
*"a prober proves the rule it probes and silently flatters the rules it does
not."*

**THE FIX IS THE SPLIT OF LABOUR 5d ALREADY USED FOR ENTRY TYPES.** Mechanical:
which link types any path writes at all, read off the coordinator — the eighteen
attachment kinds come from `attempt_false_attachment_link`'s own match arms, so a
new kind is probed the moment the arm is added and a deleted prober stops
flattering its rules the moment it goes. Judgement: for a type with no prober,
reachability is per-RULE and not per-type — `grant_attestation` makes the tenure
rule reachable and **cannot** make `AttestationGrant tag must be exactly 36
bytes.` fire at all, because it builds the tag from an `ActionHash` and an
`ActionHash` is always 36 bytes. Those thirteen verdicts are curated in
`UNPROBED_LINK_RULES` with their reasons, and **a link rule on an unprobed type
that is missing from the table exits 1 before the inventory is written.** The
old list could omit a whole type in silence; this cannot omit one rule.

`needs_prober` 14 → 13 and `crafted` 120 → 122, which is the whole of the
correction: two rules, and the third class change below.

**Also recorded: the three friction rules on these types are NOT reachable, and
the evidence is a pair of constants.** The coordinator's limit equals
validation's in all three cases (`SYNAPTIC_LINK_MAX_PER_WINDOW` 20 = 20,
`REINFORCEMENT_MAX_PER_WINDOW` 40 = 40, `ATTESTATION_GRANT_MAX_PER_WINDOW`
5 = 5) and the coordinator checks before `create_link`, so the published path
always refuses in the coordinator's own wording — the same shape as the two
`GAPS` rows for `Critique` and `AntibodyPattern`, now stated per rule instead of
hidden inside a per-type class.

### Finding 12 — a deferred link rule was keyed to no link type, so it was in no denominator

Found by the orphan check, which reported a corpus case naming a rule it said
was not in the inventory. `classify()` returns `deferred` BEFORE the link branch
runs, and the link branch is where `link_type` was set — so **a deferred LINK
site came out with no `link_type` at all**, and `replay.mjs`'s per-type coverage
loop keys on exactly that field. Two sites: `AgentToMembrane base is not a valid
Membrane.` and `AttestationGrant's referenced membership action not found.`
Neither was in any type's denominator or in any total.

The link type is now recorded before any class is decided. **And the fix exposed
a second question the early return had been skipping:** `deferred` says the
message never fires *when the op is authored*, which still presumes something
can author it. On an unprobed type that is the same judgement
`UNPROBED_LINK_RULES` answers, so it is consulted for deferred sites too — and
`AgentToMembrane base is not a valid Membrane.` turns out to be unreachable
either way, because `join_membrane` resolves the membrane with `get()` and fails
with `Membrane not found.` before `create_link`. It moved to `needs_prober`;
`deferred` 15 → 14. `AttestationGrant`'s deferral IS reachable, is asserted, and
is the first deferred LINK rule this corpus drives.

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

### A second agent — item 5f, and it was cheaper than predicted

**Twenty-three rules in this corpus fire when a thing belongs to somebody
else**, and one conductor has one agent, so everything this harness could author
was its own and forging the owning field was refused one rule earlier by the
matching author check. The queue row assumed closing that needed
`scripts/network.sh` and two conductors on a real network.

**It did not.** Every one of these rules compares an owning field against the
ACTION author, so the probe is *agent 1 writes about agent 2's thing*: the
driver keeps making every call as agent 1, and all that changes is who published
the entity it points at. A second agent on the SAME conductor is enough — no
call routing, no second conductor, no cross-network gossip. The pattern is
`scripts/live-verify/attachment-links.mjs`, which has run two agents on one
conductor since §5.19.

Two pieces of plumbing, both in `replay.mjs`:

- `callOther` — a second agent installed idempotently on the same conductor
  (`generateAgentPubKey` + `installApp` under its own app id), used only to
  author entities.
- `awaitVisibleToMe` — **waited for, not slept through.** Agent 1's validation
  has to `must_get_entry` an entry agent 2 wrote, and until that resolves
  locally the commit DEFERS with `DepMissingFromDht` instead of being refused by
  the rule under test — which would read as a rule that does not fire. Two
  agents on one conductor make it fast but neither instant nor a fixed duration,
  so this polls agent 1's own read and reports a timeout as a SETUP failure,
  which `drive` already separates from a rule failure.

**ALL SEVEN SECOND-AGENT RULES ARE NOW ASSERTED**, 92 -> 99 checks. The shape
is the same in every one: the owning field stays agent 1's so the author-match
rule still passes, and only the thing pointed AT changes to something agent 2
published. Nothing is forged anywhere.

| rule | what agent 2 owns | what keeps the earlier rule from firing first |
|---|---|---|
| `Retraction` ownership | a Claim | `author` stays agent 1's |
| `Membrane` constitution accountability | a Constitution | `creator` stays agent 1's; driven through the prober, since `create_membrane` pre-checks it |
| `FederationRecord` creator | a Membrane | `author` stays agent 1's |
| `AgentToClaim` author | a Claim | `anchor_of` AND `tag` are agent 2's, so the base and tag rules pass |
| `AgentToConstitution` author | a Constitution | `anchor_of` is agent 2's |
| `DomainToClaim` author | a Claim | `domain` is agent 2's, so the anchor matches |
| `MembraneRegistry` author | a Membrane | `anchor_override` stays null, so the registry anchor is real |

**The fixtures are published once and shared**, and waited for INDIVIDUALLY
rather than once at the end: agent 1's validation fetches a different one per
rule, so a single wait would leave the others racing and a rule whose dependency
has not arrived DEFERS rather than refusing.

**Two rows remain in `GAPS` and neither is a second-agent problem** — both SWO
friction rules are mirrored as coordinator pre-checks with no bypassing extern,
which needs a new extern and a DNA rebuild.

O, P and Q were taken on the version with link rules, which is 92 checks. T, U and V are below, on the 106-check version.
R was taken on the 93-check version and S on the 99-check one.

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

- **Injection R** — the second-agent probe aimed at agent 1's OWN claim instead
  of agent 2's. Result: **92 passed, 1 failed**, `the call COMMITTED — nothing
  stopped this payload`. This is the injection that matters for 5f, because it
  proves **the second agent is load-bearing rather than decorative**: with the
  target switched to the driver's own claim the retraction is simply valid, so a
  green tick here cannot be had without agent 2 actually having authored the
  thing being retracted.

- **Injection S** — `otherAgentFixtures` switched to publish as agent 1 instead
  of agent 2, so every "other" entity is the driver's own. Result: **93 passed,
  6 failed**, and it failed in TWO shapes, which is the part worth keeping.
  Four — `Membrane`, `FederationRecord`, `DomainToClaim`, `MembraneRegistry` —
  reported `the call COMMITTED`, because owning the thing makes the operation
  simply valid. The other two — `AgentToClaim` and `AgentToConstitution` — were
  REFUSED but for a different reason, because their `anchor_of` is still agent
  2's while the claim is now agent 1's, so the base-mismatch rule fires one line
  above the ownership rule. **The assertion caught that instead of passing on
  any refusal**, which is the prefix discipline injection P exists to protect,
  holding on a second family of rules. `Retraction` is unaffected because it
  seeds its own target rather than using the shared fixtures — injection R
  covers it.

### Refusals with no baseline — `AttestationGrant`, and why a thirty-day tenure makes one impossible

**Every case in this corpus starts from a payload asserted to COMMIT and changes
one field** — the argument for that is at the bottom of this file. Three rules
cannot be driven that way, and it is not a shortcoming of the harness. It is
arithmetic in the zome.

`AttestationGrant` validation requires the granter's own `AgentToMembrane` join
action to be at least `ATTESTATION_GRANT_MIN_TENURE_SECS_VALIDATION` old, which
is **30 days** (`dna/integrity/src/lib.rs:1773`). Both actions are this agent's
own and on a sandbox chain they are minutes apart. No payload, no fixture and no
second agent produces a valid one: the only things that would are waiting a
month or moving `CLOCK_REALTIME`, and the clock probe is deliberately not a CI
check (READINESS item 13). **So a valid `AttestationGrant` has never been
committed by anything in this repository, and cannot be.**

**WHAT REPLACES THE BASELINE WAS ALREADY IN THE EVIDENCE.** Each link branch of
`validate_create_link` is a straight-line sequence of checks that RETURNS at the
first failure. So a refusal naming rule N is itself proof that every check above
N passed on that payload — exactly what the baseline was supplying from outside.
The message carries it instead.

**WHAT IS LOST, stated rather than glossed**, because a driver that quietly
asserts less than its neighbour is the failure mode this corpus exists to find:

- **A deleted rule is still caught, both ways.** With the rule gone the call
  either commits — reported as `the call COMMITTED` — or is refused by a LATER
  check, and since the assertion requires THIS rule's own prefix a different
  message reds as `stopped for a different reason`. Both drivers share one copy
  of that discipline (`assertStopped`), extracted rather than duplicated because
  a second copy of the prefix rule is a second place for it to be loosened into
  "did it throw", which is what injections P and Q exist to prevent.
- **What is genuinely lost** is the proof that nothing BELOW the rule would also
  have refused the payload. These cases assert the rule fires FIRST among the
  ones they violate, not that it is the only one they violate. For the tenure
  case the distinction is empty: the only check below it is the friction rule,
  which needs five grants that passed the tenure bar.

**IT MUST NOT SPREAD, and the one exception says why it is one.** Where a
baseline CAN commit, `drive` is strictly stronger — two signals beat one — so
the test for belonging here is "a baseline is impossible", not "a baseline is
inconvenient". `Reinforcement` is the exception: a baseline is possible
(`create_critique` writes a real SynapticLink), but the one reachable rule needs
only the base, the check above it is satisfied by construction, and a baseline
would spend a Critique from the 20-per-hour budget this harness has so far never
touched. A case for anything BELOW that rule must build the real SynapticLink
and use `drive`.

**Three rules, three different answers, which is the honest outcome** rather
than "AttestationGrant is covered":

| rule | how it ends up |
|---|---|
| `AttestationGrant requires proof of sufficiently tenured membership …` | **ASSERTED** as a refusal. The referenced action is this agent's own join for this same membrane and fails on AGE alone, which exercises `tenure_satisfied`'s arithmetic rather than the type check in front of it |
| `AttestationGrant's referenced membership action not found.` | **ASSERTED as a DEFERRAL** — a well-formed hash that resolves to nothing abandons the callback, so the message never appears. The first deferred LINK rule this corpus drives (finding 12) |
| `AttestationGrant tag must be exactly 36 bytes (a raw ActionHash).` | **`needs_prober`, and permanently so through this extern**: `grant_attestation` builds the tag from `my_membership_action.get_raw_36()` and an `ActionHash` is always 36 bytes |
| `SWO temporal friction: author has granted attestation {} times …` | **`needs_prober`**: the coordinator pre-checks at the same limit (5 = 5) and reaching it would need five grants that passed the tenure bar |

99 → 106 checks, 0 failed, against a sandbox conductor.

- **Injection T** — the tenure case aimed at a dangling ActionHash instead of
  the real join action. Result: **FAIL, `stopped for a different reason:
  DepMissingFromDht`**. The payload defers rather than being refused, so this
  proves two things at once: the assertion does not pass on any refusal, and the
  real join action is load-bearing — the rule is reached only because the
  referenced action RESOLVES and is then found too young.
- **Injection U** — the deferral case pointed at the real join action instead of
  a dangling one. Result: **105 passed, 1 failed**, the deferral assertion
  reporting that it got a refusal where it expected a retryable stall. A
  deferral case cannot be satisfied by "it threw".
- **Injection V** — one verdict deleted from `UNPROBED_LINK_RULES`. Result: the
  build **exits 1 and writes no inventory** (`md5sum` unchanged), naming the
  rule AND the write path it found for the type — `Reinforcement:2074 … write
  paths: reinforce_synaptic_link`, which is the evidence that answers the
  question rather than just reporting it unanswered. The same gate fired
  unprompted during development on a mistyped message string, which is how the
  SynapticLink friction rule's exact wording got checked.

## Why one mutation at a time

A payload that violates two rules proves nothing about either: validation
returns at the first failing check, so the message names whichever rule sits
earlier in the function. Every case starts from a baseline that is asserted to
**commit**, and changes exactly one field. A refusal naming a different rule is
reported as a failure rather than counted as a pass — and the baseline is
checked first, because if it does not commit then every case below it "passes"
by being refused for the wrong reason.
