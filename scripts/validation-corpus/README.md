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

**Ten entry types and fourteen link types, and the coverage is asserted rather
than stated.** 175 checks, **seventeen of which need a second agent** — see
*A second agent* below. Every link type here is 3 of 3 (AgentToClaim 6 of 6):
nothing in this slice is declared unreachable any more. Link rules use the same driver — a link case is still
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

### The index rules that must name what the entry names

Four link types landed together because they share one rule shape, and it is
the shape that matters most in this whole directory: **a link must name what
the ENTRY it points at already names.** An unbound index does not forge an
entry; it files a true entry in a false place, and every read built on that
index then answers about the wrong thing.

| link type | what an unbound index would do |
|---|---|
| `ClaimToRetraction` | file a retraction of one claim against another, so `get_retractions_for_claim` shows a claim as withdrawn that its author still stands by — §2.3's remedy inverted |
| `RetractionToReplacement` | record a replacement the Retraction never declared |
| `MewToClaim` | assert a promotion the Claim does not claim |
| `ClaimToExternalCritique` | attach an imported reply to a claim it never named |
| `MembraneToFederationRecord` | record a federation against a membrane the record never named |

**Three of these needed a second ENTITY rather than a wrong hash**, and that is
the recurring cost of this family: the rule sits behind a `must_get`, so a
dangling hash DEFERS and the rule never fires. So the setups publish, purely to
be pointed at wrongly, a second claim (`ClaimToRetraction`), a second Mew
(`MewToClaim`), and a second claim again (`ClaimToExternalCritique`).

**Two rules needed something stranger than a second entity.**
`RetractionToReplacement` has to refuse a link whose base Retraction names NO
replacement, which needs a second Retraction that declares none. And
`MewToClaim` has to refuse a link recording a promotion the Claim does not
claim, which needs a Claim with `source_mew: None`. Neither is reachable by
mutating a hash; both are a different valid entry.

**TWO of these owner rules are unforgeable by construction**, which is worth
noting as a design observation rather than a harness one.
`ClaimToExternalCritique`'s `importer` is taken from `agent_info()` inside
`import_twitter_reply` and cannot be supplied in the payload; and
`MembraneToFederationRecord`'s author is already required by §5.18 to be the
membrane's founder. In both cases the only way to obtain one that belongs to
somebody else is to have somebody else make it — so the second agent is not a
convenience here, it is the only path, and neither rule could be driven at all
without item 5f.

`MembraneToFederationRecord` also carries the **deepest chain in this
directory**: Constitution → Membrane → FederationRecord → the link about it,
with a SECOND Membrane under the same Constitution published only to be pointed
at wrongly.

### The pre-registration index pair, and why these two rules are not bookkeeping

`QuestionToPreRegistration` and `PreRegistrationToRevelation` carry the index
rules the commit-reveal mechanism's denominator rests on. §5.19's note explains
what the denominator is for — *"commit ten predictions, reveal the two that came
true, stay silent on the eight that did not"* — and an unrevealed commitment is
countable only because its question anchor and its reveal link are both bound to
the commitment's own identity.

**One of these rules says what breaks otherwise, in the zome's own words:** a
`PreRegistrationToRevelation` link must hang from the PreRegistration the
Revelation itself names, because *"a reveal of one commitment may not be
recorded against another — that is how an expired commitment is made to look
revealed."* That is the same attack item 13 confirmed by a different route: item
13 moved the clock, this rule stops the reveal being re-pointed. **Both have to
hold for the record to mean anything, and only one of them currently does** —
this one is enforced and asserted here; the clock one is not enforceable at all
(SPEC §5.22).

Two implementation notes, both found by needing them:

- **The mismatch cases need a REAL hash of the right kind, not a dangling one.**
  "does not match the question it names" and "must hang from the PreRegistration
  the Revelation names" both sit behind a `must_get`, so a dangling hash DEFERS
  and the rule never fires. The setup therefore publishes a second question and
  a second commitment purely to be pointed at wrongly.
- **`base must be an EntryHash anchor` needs both anchor fields null**, because
  `attempt_false_attachment_link` passes `base` through verbatim only when
  neither `anchor_of` nor `question_anchor_of` is set — otherwise it derives the
  anchor and the mutation has no effect.

### Finding 8 — a `Claim` deserialises as a `Mew`, so the type check does not separate them

**Measured, and the obvious payload COMMITTED.** `AgentToMew`'s type rule is

```rust
let mew = match target_record.entry().to_app_option::<Mew>() {
    Ok(Some(m)) => m,
    _ => return Invalid("AgentToMew target is not a Mew."),
};
```

so the message needs the deserialise to fail or return `None`. Pointing the
target at a **Claim**'s ActionHash does neither: the Claim's entry
deserialises into `Mew` successfully, the rule never fires, and the link
commits. `Mew` is `{content, author, timestamp, reply_to, semantic_tags,
linked_claim}` and a `Claim` carries `content`, `author`, `timestamp` and
`semantic_tags` already, which is apparently enough.

**A `Constitution` is the payload that reaches the rule** — it shares no field
names with `Mew` — and that is what the case uses.

**WHAT THIS MEANS, bounded honestly.** The ownership rule still binds, so this
is not cross-agent poisoning: `mew.author != action.author()` stops an agent
indexing somebody else's entry. What an agent CAN do is index **its own Claim
under its own AgentToMew anchor**, so `get_mews_by_agent` may return a Claim to
a reader expecting a Mew. Mild, and real, and the rule reads as though it
prevents exactly this.

**It is the AgentToClaim contrast in reverse.** There, the validator matches
`_ =>`, which catches a deserialise Err as well as `Ok(None)`, and a
Constitution target is refused the obvious way. Here the same shape of guard is
defeated not by the error path but by a SUCCESSFUL deserialise of the wrong
entry type. Two entry types whose field sets overlap are not distinguished by
`to_app_option` at all, and nothing in this corpus would have found that without
driving the obvious payload first and watching it pass.

### The agent-anchor family is not uniform

Four link types index an entity under its owner's agent anchor and carry the
same three rules. **Three are `crafted` and are covered. The fourth,
`AgentToMembrane`, is not** — the inventory classes it `needs_prober`, and the
reason is checkable: `attempt_false_attachment_link`'s `AttachmentLinkKind` has
no `AgentToMembrane` variant, so no published path can write one with a broken
field. It stays out of `COVERED_LINKS` rather than being declared a gap,
because a type nobody can drive has no cases to declare unreachable.

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

O, P and Q were taken on the version with link rules, which is 92 checks.
R was taken on the 93-check version, S on the 99-check one, T on the 117-check
version with the agent-anchor family, X on the 133-check version, Y and Z on
the 150- and 167-check versions, and AA on the 175-check one.

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

- **Injection T** — the three agent-anchor owner cases aimed at agent 1's own
  Mew, trace and PreRegistration instead of agent 2's. Result: **114 passed, 3
  failed**, all three `the call COMMITTED`. Confirms the family's owner rules
  are sensitive on the same terms injection S established for the first four,
  and that nothing about the new types is passing by accident.

- **Injection X** — three mutations in the pre-registration index pair
  neutralised at once: the cross-commitment reveal pointed back at its OWN
  commitment, and both owner cases aimed at agent 1's own entities. Result:
  **130 passed, 3 failed**, all `the call COMMITTED`. The one worth naming is
  the middle one — the rule whose own comment says a mis-hung reveal is "how an
  expired commitment is made to look revealed" is proven to fire only because
  the base really is a different commitment, so the check is not passing on the
  mere presence of a link.

- **Injection Y** — the retraction pair's two name-what-the-entry-names
  mutations pointed back at the right entity, and both owner cases aimed at
  agent 1's own. Result: **146 passed, 4 failed**.
- **Injection Z** — the same treatment across the promotion and import pair,
  plus the `source_mew: None` case pointed at a Claim that IS promoted. Result:
  **162 passed, 5 failed**. The `source_mew` one is the interesting member: it
  proves the rule fires on the Claim's own declaration rather than on the link
  being malformed, which is the distinction the rule exists to make.

- **Injection AA** — the federation index's mismatch case pointed back at the
  Membrane the record names, and its owner case aimed at agent 1's own.
  Result: **173 passed, 2 failed**. Both `the call COMMITTED`.

## Why one mutation at a time

A payload that violates two rules proves nothing about either: validation
returns at the first failing check, so the message names whichever rule sits
earlier in the function. Every case starts from a baseline that is asserted to
**commit**, and changes exactly one field. A refusal naming a different rule is
reported as a failure rather than counted as a pass — and the baseline is
checked first, because if it does not commit then every case below it "passes"
by being refused for the wrong reason.
