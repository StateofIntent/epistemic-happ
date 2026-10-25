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

> **MEASURED 2026-10-25, because the figures below it had rotted badly.** This
> paragraph said *"Ten entry types and TWENTY-FOUR link types — every link type
> in the zome"* and *"244 checks"*. Taken from the runs themselves rather than
> recounted by hand, on `main`: **eighteen entry types, twenty-six link types,
> 332 checks, 0 failed, 0 skipped** (run `40165642682`). It had been **316**
> two hours earlier (run `40160703198`); the sixteen new checks are item 1.10's
> ten settlement link rules with their baselines and coverage lines.
>
> **ON THIS BRANCH, WHICH IS HELD: nineteen entry types and twenty-seven link
> types**, adding `foreign_critique` and `DomainToForeignCritique` (item 4.5,
> `protocol_version: 12`). Its own check total is whatever this merge's
> `conductor` job prints and is recorded here from that run — not predicted
> from `main`'s, which is how the figure above came to be 72 behind.
>
> **NOTHING GATES THE CHECK TOTAL, which is why it drifted 72 behind.**
> `replay.mjs` needs a conductor to produce the number, so no static checker
> can hold this sentence to it — and `check-harness-counts.mjs`, which gates
> figures of exactly this kind, reads the ROOT README and this directory's
> suite index, never this file. The totals here are therefore written as dated
> measurements naming the run behind each, rather than as standing claims.
>
> **WHAT *IS* GATED NOW is the thing the old wording was really claiming.**
> `check-corpus-coverage.mjs` fails on any entry or link type with assertable
> rules that is neither in `COVERED`/`COVERED_LINKS` nor declared with a
> reason — so *"every rule either asserted or declared"* can no longer quietly
> stop being true. It was not true when that gate was written: settlement's
> two link types carried ten assertable rules outside `COVERED_LINKS` from
> `protocol_version: 11` until 2026-10-25, and the corpus reported
> *"0 failed, 0 skipped"* over them for four days.
>
> **AND *"every link type in the zome"* NEEDED THE PRECISION IT LACKED.** The
> zome declares **31** link types on `main` and **32** on this branch, which
> adds `DomainToForeignCritique`. **26 have validation sites on `main` and 27
> here, and all of them are covered.** (An earlier draft of this notice, on
> this branch, said 32 for `main` — counted with a regex loose enough to catch
> a line that is not a variant. The number was wrong for a day, which is the
> whole subject of this notice.) The other five — `CritiqueToEvidence`, `ClaimToEvidence`,
> `MembraneToClaim`, `ClaimToBridgeRecord`, `SpeciesToCritique` — have no
> `validate_create_link` branch at all and are accepted unconditionally, which
> is **SPEC §5.17**, stated there deliberately and with its three categories.
> They are not an oversight and not this corpus's to cover: there is no rule to
> assert.
>
> **Finding 16's "15 entry types, 282 checks" below is left exactly as
> written.** It is a dated record of what the corpus was when that finding was
> made, not a claim about now, and editing it would destroy the only evidence
> of when those numbers were last true.

~~**Ten entry types and TWENTY-FOUR link types — every link type in the zome,
with every rule either asserted or declared unreachable with its reason.**~~
**Nineteen entry types and twenty-seven link types on this held branch**
(eighteen and twenty-six on `main`) — every link type that has a rule — with
every rule either asserted or declared with its reason, and that is gated
rather than asserted (see the notice above). ~~244~~ **332 on `main`; this
branch's own total is recorded in the notice above**
checks, **twenty-three of which need a second agent** — see *A second agent*
below — and **three of which are driven with no baseline at all**, because a
valid `AttestationGrant` needs thirty days of prior membership: see *Refusals
with no baseline*. Every link type here is 3 of 3 (AgentToClaim 6 of 6):
nothing in this slice is declared unreachable any more. Link rules use the same driver — a link case is still
a valid thing with one field broken — but they are keyed on `link_type` rather
than `entry`, because every link site shares `entry: "create_link"` and
grouping them by entry would collapse nineteen rule sets into one meaningless
denominator.

***The table immediately below is the ORIGINAL four-type slice and is not the
current denominator*** — the figure above is. It is kept because the three-prober
argument under it is still the reason the slice was chosen that way, but items
5c and 18 took coverage to every link type in the zome, and item 19 added
`AttestationGrant` with no baseline at all. Noted rather than rewritten: a table
of twenty-four rows would restate what `node replay.mjs` prints per type on
every run.

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

~~**15 of 19 link types remain.**~~ **None remain**, as of item 18 — and item 19
added the one link type that needs a second driver shape, because its baseline
cannot exist. What is done is both drivers, the three prober shapes, and both
anchor forms.

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

~~`enumerate.mjs` cannot see any of this yet — it learned about derived fields in
5d, not about pre-checks that shadow a rule. Teaching it is its own queue item.~~
**It can, as of 2026-10-20 — READINESS item 5e. See *Finding 12* below**, which
is what the sweep this paragraph asked for actually found: nine shadowed sites
rather than six, a reason the two entry-type declarations above could be
deleted instead of kept, and two bugs in this tool's own view of the
coordinator that were hiding the ninth.

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

**A WARNING ABOUT THE NUMBERS, because they are not unique and that has already
cost a session.** The two findings below are 8 and 9 of this first-run series,
and there are a SECOND finding 8 and finding 9 further down — the `Claim`
deserialises as a `Mew` pair, written when item 16 and the BridgeRecord sweep
found them. Four findings, two numbers. When something cites "findings 8 and 9"
it almost always means the Claim/Mew pair, since that is the pair with
consequences still open. New findings from here are numbered 10 up, and the
duplicates are left alone rather than renumbered because
`check-entry-type-confusion.mjs` and READINESS rows both cite them by number.

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

### The coverage hole item 18 opened, and how it was found

**This is the most important thing in this file, because the tool that catches
inversions committed one.**

`enumerate.mjs` decided whether a link rule was drivable by consulting
`PROBED_LINK_TYPES` — a HARDCODED list of eighteen names. Item 18 added four
`AttachmentLinkKind` variants in the coordinator and a fifth single-purpose
prober, and nothing connected the Rust to that list. So five link types stayed
classed `needs_prober` while their rules were perfectly drivable.

**The corpus then asserted nine of those rules, and the coverage loop reported
`0 of 0 assertable rules` for two whole link types.** Cases running. Cases
passing. Gating nothing — because a rule the inventory calls unreachable is a
rule the coverage check does not require a case for. Delete those nine cases and
the harness would have stayed green.

It was caught by reading the coverage output rather than by any gate, which is
worth saying plainly: the inventory drift gate passed, correctly, because
regenerating produced an identical file. The inventory was not stale. It was
WRONG in a way regeneration could not fix, because the classifier's own input
was a list nobody had updated.

**The fix is to stop restating the Rust.** `PROBED_LINK_TYPES` is now parsed
from `enum AttachmentLinkKind`, and only the three single-purpose probers —
one extern per link type, not enumerable from a type — stay listed, each
checked to actually exist in the coordinator. Adding a variant in Rust now
reclassifies its rules with no second edit, and `needs_prober` fell to **zero**:
every link rule in the zome is `crafted`, so every one of them must now be
cased or declared.

**That forced five honest declarations rather than letting them hide**, which is
the whole point:

| rule | why it stays undrivable |
|---|---|
| `AttestationGrant` ×3 | **no committing baseline exists.** `ATTESTATION_GRANT_MIN_TENURE_SECS_VALIDATION` is thirty days, so a valid grant needs a join action thirty days older than it. Without a baseline every case is refused for tenure rather than for the rule under test — the exact trap the baseline check exists to stop. Needs a harness that asserts refusals without a valid baseline, not another extern |
| `Reinforcement` friction | 40 in one window, spending allowance the rest of the run needs |
| `SynapticLink` friction | 20 in one window, and each one costs a Critique |

### Two operational findings from driving these

**An agent target must be sent with the ENTRY prefix.** `Reinforcement`'s target
is the reinforcing agent, and validation does
`AgentPubKey::try_from(target_address)`. In Rust, `create_link(base, agent, ..)`
reaches `AnyLinkableHash` via `EntryHash::from(AgentPubKey)`, which REWRITES the
three-byte prefix — so the hash the DHT stores is entry-prefixed. Sending raw
agent-prefixed bytes is refused by `AnyLinkableHash`'s own deserialiser before
any rule runs, as a payload `Deserialize` at the extern. Same 36-byte core,
different first three bytes. Measured both ways.

**A clean sandbox resets the friction window.** Development hit
`20 Critiques already created in the last 3600 seconds` partway through this
item — the limit this corpus documents, arriving in practice. The window is per
AGENT, and `sandbox.sh clean && start` generates a new one, so a restart buys a
fresh allowance where waiting an hour is the alternative. Worth knowing before
concluding a spec is broken.

### Item 18: a prober this corpus asked for, and what a prober cannot fix

`TaxonomyToSpecies` is the first type here driven by an extern added BECAUSE
the corpus needed it, rather than one that happened to exist. All three of its
rules were classed `needs_prober` for a precise reason:
`attempt_false_attachment_link` derives only an AGENT anchor and a QUESTION
anchor, and this link's base is the TAXONOMY anchor — so no payload through
that prober could put the base in the right place.
`attempt_false_taxonomy_index` mirrors `attempt_false_domain_index`: it derives
the real anchor, and `anchor_override` moves the base off it.

**AND THE SCOPE OF ITEM 18 TURNED OUT TO BE SMALLER THAN ITS OWN FRAMING.** The
row said "14 rules the corpus cannot drive", which reads as though probers
unlock fourteen. They do not. Mapped against what a prober can actually reach:

| link type | rules | reachable with a prober |
|---|---|---|
| `TaxonomyToSpecies` | 3 | **3 — done, here** |
| `AgentToMembrane` | 3 | 3 — variant added, specs not yet written |
| `Reinforcement` | 3 | 2; the SWO friction rule is the same class as this corpus's two standing gaps |
| `SynapticLink` | 2 | 1; same friction exception |
| `AttestationGrant` | 3 | **0, and not because of a prober** |

**`AttestationGrant` cannot be driven in this harness's SHAPE at all, and that
is the finding.** `ATTESTATION_GRANT_MIN_TENURE_SECS_VALIDATION` is
`30 * 24 * 3600` — thirty days. A valid grant needs an `AgentToMembrane` join
whose action timestamp is thirty days older than the grant's, so **no test run
can construct a committing baseline for it.** Without one, every case would be
refused for the tenure reason rather than for the rule under test, and would
"pass" by being refused at all — exactly the trap the baseline check exists to
stop. Closing these three needs either a fixture aged past a month, a clock
this harness does not have in CI, or a differently shaped harness that asserts
refusals without a valid baseline. It is not a prober problem and adding one
would not help.

So the honest arithmetic for item 18 is **9 of 14 reachable, 3 blocked by a
thirty-day tenure and 2 by the friction exception** — and three of the nine are
in this slice.

### The rate-limited four, and the denominator that is left

`CritiqueToSpecies`, `SpeciesToParent`, `TargetToCritique` and
`TargetToAntibody` went in as one slice for a reason that is not about their
rules: **`Critique` and `AntibodyPattern` creation is capped at 20 per rolling
hour each (§6), enforced by DHT validation.** Every setup here spends allowance
a later run in the same hour will not have, so these are written to be
economical rather than tidy — agent 2's single critique declares BOTH a species
and a target so it serves two owner rules, and nothing is published that an
existing fixture already covers. Iterating these four separately would have
failed for friction rather than for a defect, which is the kind of red that
teaches people to ignore a harness.

Two of them carry the "does not declare it" rule the promotion index had: a
Critique whose `species` is None, and a child species whose `parent_species` is
None. Neither is reachable by mutating a hash; both need a second,
differently-shaped VALID entry.

**WITH THESE FOUR, EVERY LINK TYPE A PUBLISHED PATH CAN DRIVE IS COVERED.** The
honest remaining denominator is not zero, and it is not rules — it is five link
types no extern can reach at all:

| link type | rules |
|---|---|
| `AgentToMembrane` | 3 |
| `Reinforcement` | 3 |
| `AttestationGrant` | 3 |
| `TaxonomyToSpecies` | 3 |
| `SynapticLink` | 2 |

All five are classed `needs_prober`: `attempt_false_attachment_link`'s
`AttachmentLinkKind` has no variant for them, so no published path can write one
with a broken field. **14 rules, and they are not gaps in this corpus** — a type
nobody can drive has no cases to declare unreachable. Closing them means adding
probers and rebuilding the DNA, a different piece of work, queued as its own
item rather than left looking like coverage that is merely missing.

### Finding 9 — finding 8 defeats a SECOND rule, and the asymmetry predicted which one

**The Claim-reads-as-Mew confusion is reachable at two guard sites, not one**,
and at the second it makes a protective rule inert in exactly one direction.

`MewToBridgeRecord` and `ClaimToBridgeRecord` share one guard:

```rust
let is_claim = subject_entry.to_app_option::<Claim>().ok().flatten().is_some();
let is_mew   = subject_entry.to_app_option::<Mew>().ok().flatten().is_some();
let wanted_claim = link_type == LinkTypes::ClaimToBridgeRecord;
if  wanted_claim && !is_claim { return Invalid("...base is not a Claim...") }
if !wanted_claim && !is_mew   { return Invalid("...base is not a Mew.")     }
```

Driving a CLAIM's entry as the base of a `MewToBridgeRecord` link — the obvious
payload for "base is not a Mew" — **COMMITTED**. `is_mew` is computed by
`to_app_option::<Mew>()`, a Claim deserialises into `Mew` (finding 8), so
`is_mew` is TRUE for a Claim and the rule cannot fire.

**THE SIBLING RULE HOLDS, AND THE SWEEP SAID WHY BEFORE THIS WAS DRIVEN.**
`scripts/check-entry-type-confusion.mjs` reports exactly one direction —
`Claim -> Mew`, never `Mew -> Claim`, because `Claim` has non-Option fields
(`domain`, `confidence`, `evidence_hashes`, `attestation_policy`) that `Mew`
does not carry. So a Mew base cannot pass as a Claim, `is_claim` is false, and
`ClaimToBridgeRecord`'s half fires correctly. **One guard, two rules, and the
confusion's asymmetry decides which of them is real.** That is the sweep
earning its place: the model predicted the asymmetry before the probe found it.

**WHY THIS ONE MATTERS MORE THAN FINDING 8 DID.** `AgentToMew`'s consequence
was an agent mis-indexing its own Claim in a by-author list. Here the sibling
rule's own message states the stake — *"a mirror of a Mew filed as a claim's
would make `get_unbridged_claims` answer about the wrong entry"* — and the
inert direction is the reverse of that: a CLAIM's mirror can be filed under the
Mew link type, so the read over `MewToBridgeRecord` answers about the wrong
entry. Bounded the same way finding 8 is: the owner rule still binds, so only
the mirror's own recorder can do it.

**The payload that does reach the message is an entry that is NEITHER type.**
`create_evidence` returns an EntryHash directly and an `Evidence` is neither a
Claim nor a Mew, so the case mirrors one and uses it as the base. Recorded
because it is the 5b lesson for a third time: the obvious payload proved the
rule inert, and only a stranger one proved it exists at all.

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
the 150- and 167-check versions, AA on the 175-check one, AB on the 185-check version,
AC on the 217-check one, AD on the
223-check one, and AE on the 238-check one. AF and AG are on the 244-check one
— see *Refusals with no baseline*.

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

- **Injection AB** — the bridge index's `base is not a Mew` case restored to a
  CLAIM base, the payload finding 9 proved inert, plus its owner case aimed at
  agent 1's own. Result: **183 passed, 2 failed**. **This one doubles as a
  regression test for finding 9**: the first failure IS the confusion, so if
  `Claim -> Mew` is ever tightened, AB stops failing there and says so.
- **Injection AC** — across the rate-limited four: both "does not declare it"
  rules pointed at entries that DO declare, and all four owner cases aimed at
  agent 1's own. Result: **211 passed, 6 failed**. One run, because an
  injection run spends critique allowance too.

- **Injection AD** — the taxonomy index's base-override removed and its owner
  case aimed at agent 1's own species. Result: **221 passed, 2 failed**. It is
  the proof that matters for item 18: the prober added for this corpus does not
  merely compile and get called, it drives rules that fail when the payload
  stops violating them.

- **Injection AE** — across item 18's last three: `AgentToMembrane`'s tag
  restored to the author's own key, `Reinforcement`'s target likewise, and
  `SynapticLink`'s short tag padded back to four bytes. Result: **235 passed, 3
  failed**.

### Refusals with no baseline — the harness item 18's declarations asked for

**Every case in this corpus starts from a payload asserted to COMMIT and
changes one field**, and *Why one mutation at a time* below is the argument for
it. `AttestationGrant` cannot be driven that way. A valid grant needs the
granter's own `AgentToMembrane` join to be at least
`ATTESTATION_GRANT_MIN_TENURE_SECS_VALIDATION` old — **thirty days** — and a run
makes both actions seconds apart. The only things that would produce one are
waiting a month or moving `CLOCK_REALTIME`, and the clock probe is deliberately
not a CI check. **So a valid `AttestationGrant` has never been committed by
anything in this repository, and cannot be.**

That is why item 18 declared all three of its rules, and the note closing that
declaration said what was missing: *"these need a harness that asserts refusals
WITHOUT a valid baseline, which is a different shape from this one — not another
extern."* `driveUnbaselined` is that shape. Finding 11 is why two of the three
rules did not need the baseline at all.

**WHAT REPLACES THE BASELINE WAS ALREADY IN THE EVIDENCE.** Each link branch of
`validate_create_link` is a straight-line sequence that RETURNS at the first
failure, so a refusal naming rule N is itself proof that every check above N
passed on that payload — exactly what the baseline supplies from outside. The
message carries it instead.

**WHAT IS LOST, stated rather than glossed**, because a driver that quietly
asserts less than its neighbour is the failure mode this corpus exists to find:

- **A deleted rule is still caught, both ways.** With the rule gone the call
  either commits — reported as `the call COMMITTED` — or is refused by a LATER
  check, and the assertion requires THIS rule's own prefix, so a different
  message reds as `stopped for a different reason`. Both drivers share ONE copy
  of that discipline (`assertStopped`, extracted rather than duplicated),
  because a second copy of the prefix rule is a second place for it to be
  loosened into "did it throw" — which is what injections P and Q protect.
- **What is genuinely lost** is the proof that nothing BELOW the rule would also
  have refused the payload. These cases assert the rule fires FIRST among those
  they violate, not that it is the only one. Here that is visible rather than
  hidden: the three cases are the branch's first three checks in order, and the
  only check below all three is the friction rule still declared above.

**THIS MUST NOT SPREAD.** Where a baseline CAN commit, `drive` is strictly
stronger, because two signals beat one. The test for belonging here is "a
baseline is impossible", not "a baseline is inconvenient" — and for every other
link type in this corpus, the four `AttachmentLinkKind` variants item 18 added
included, a baseline commits. One link type qualifies.

**238 → 244 checks, 0 failed**, against a sandbox conductor.

- **Injection AF** — the tag-length case given a VALID 36-byte tag (the real
  join action). Result: **243 passed, 1 failed**, and the detail is the thing
  worth having: `stopped for a different reason: … AttestationGrant requires
  proof of sufficiently tenured membership …`. **This is the ordering argument
  measured rather than asserted** — with check 1 satisfied the refusal comes
  from check 3, so the tag case's green tick is attributable to the tag rule and
  to nothing else.
- **Injection AG** — the tenure case given a dangling 36-byte tag. Result:
  **fails** with `stopped for a different reason: … DepMissingFromDht`. The
  payload defers rather than being refused, so the tenure assertion cannot be
  satisfied by any refusal, and the real join action is load-bearing: the rule
  is reached only because the referenced action RESOLVES and is then found too
  young.
- Both also confirm the deferral case is not a tautology: it is the only one of
  the three that expects a stall, and `assertStopped` fails it if the rule's
  message appears instead.

### Finding 10 — a deferred link rule was keyed to no link type, so it was in no denominator

**The same family as item 18's own finding, found one gate over.** `classify()`
returns `deferred` BEFORE the branch that records `link_type`, and the per-type
coverage loop keys on exactly that field — so a deferred LINK site came out of
the classifier with no link type at all and was in **no type's denominator and
no total**. Two sites: `AgentToMembrane base is not a valid Membrane.` and
`AttestationGrant's referenced membership action not found.`

**Found by the orphan check, and it is the only gate that could have found it.**
The coverage loop cannot miss a rule it never iterates; the inventory drift gate
passes because regeneration is identical; and the per-type denominators looked
right. What reported it was the other direction — a corpus case naming a rule
the inventory did not list — which is the check that exists for a rule whose
wording changed, doing a job it was not written for.

The link type is now recorded before any class is decided. **And fixing it
surfaced an uncovered rule**, which is what a denominator is for:
`AgentToMembrane base is not a valid Membrane.` moved into its type's count at
4 of 4 with no case, and now has one — a deferral, since a well-formed EntryHash
that resolves to nothing reaches `must_get_entry` and abandons the callback.

### Finding 11 — a declaration's reason was stronger than the declaration, and two of three rules needed no baseline

Item 18 declared all three `AttestationGrant` rules unreachable from this
harness, on reasoning that is correct as far as it goes: a valid grant needs an
`AgentToMembrane` join thirty days older than it, so **no run can construct a
committing baseline**, and without one every case would be refused for tenure
rather than for the rule under test.

**Both steps hold. The conclusion does not follow for two of the three**, and
the thing that makes it not follow is the order of the checks in the branch:

| # | check | needs a baseline? |
|---|---|---|
| 1 | `tag.0.len() != 36` | **no — nothing above it can preempt it.** It is the first check in the branch, so the payload can hit nothing else |
| 2 | `must_get_valid_record(..)` fails | **no** — a refusal at 1 would prove 1 had stopped firing, and 2 is asserted as a DEFERRAL |
| 3 | tenure | **no** — a refusal here is itself proof 1 and 2 passed on this payload |
| 4 | friction | n/a — still declared, and its reason was never the baseline |

**A refusal naming rule N is proof that every check above N passed**, because
the branch returns at the first failure. That is exactly what a baseline
supplies from outside, so for a straight-line validator the message carries its
own isolation. The three cases above are the first three checks in order, each
one passing the ones above it, and they are driven by `driveUnbaselined` rather
than `drive`.

**What the friction rule's declaration should have said**, and now does: not the
baseline, but the coordinator. `check_attestation_grant_friction` pre-checks at
the same limit (`ATTESTATION_GRANT_MAX_PER_WINDOW` 5 = `..._VALIDATION` 5), so
`grant_attestation` refuses in the coordinator's own wording — the shape the
`Critique` and `AntibodyPattern` gaps already take. Reaching it through the
prober would additionally need five grants that PASS the tenure bar, which is
the thing no run can produce.

### Finding 12 — the sweep for shadowed rules found nine, and two bugs that were hiding the ninth

**READINESS item 5e, and the thing worth carrying forward is not the nine.**
Finding 6 above named six shadowed sites from having run into them, and asked
for a sweep because `create_claim` and friends carry pre-checks too and nobody
had checked whether any of THOSE shadow a rule. The sweep says: **no others.**
Nine sites total — finding 6's six, plus the three LINK friction rules items 18
and 19 had already declared by hand for the same reason — and nothing else in
either zome.

**How it decides, and which half is mechanical.** A pre-check and its validation
twin are usually the same Rust expression, because they were written as a pair.
So the conditions are compared as text after normalising the one difference the
pair always has — the integrity zome's constant carries a `_VALIDATION` suffix
(`CRITIQUE_MAX_PER_WINDOW_VALIDATION` against `CRITIQUE_MAX_PER_WINDOW`, five
such pairs). That resolves seven of the nine on the expression itself. The other
two are curated in `SHADOWED_BY_PRECHECK` and the build fails if either stops
matching:

| rule | why it is not mechanical |
|---|---|
| `Membrane's constitution hash does not resolve to a Constitution entry.` | the same refusal written two ways — `let Some(c) = .. else` in the validator, `.ok_or(wasm_error!(..))` on a `get` + `to_app_option` in the extern |
| `Membrane creator must match action author.` | **no twin at all.** Shadowed by ORDERING: forging the creator means naming somebody else, so the extern's constitution-ownership check fires first and refuses on a DIFFERENT rule — which is exactly what finding 6 observed happening |

**WHAT SHADOWING COSTS DEPENDS ON WHETHER A BYPASS EXISTS, and that is the
distinction item 5e asked to keep.** With a raw-write path the rule is still
assertable and its class does not change; what changes is that the inventory now
says the ordinary extern must not be used, carried on the site as an
`enforcement_caveat`, so a case cannot quietly be refused by the courtesy and
counted. Without one, nothing can assert the rule and it leaves the denominator
as the new `shadowed` class.

| | shadowed sites | bypass |
|---|---|---|
| `Membrane` × 4 | all four of finding 6's | `attempt_unaccountable_membrane` — `create_entry` with nothing in front of it |
| `SynapticLink`, `Reinforcement`, `AttestationGrant` friction | the three link rules | `attempt_false_attachment_link`, which carries no pre-check |
| `Critique`, `AntibodyPattern` friction | the two entry rules | **none** — nothing writes either without its friction helper |

**So two hand-written declarations in `replay.mjs` were DELETED rather than
kept.** The Critique and AntibodyPattern friction gaps said, in prose, exactly
what the tool now derives from the two zomes. Keeping both copies would leave
one that could rot, which is the thing this file's own note on the GAPS list
forbids — and the coverage line reads better for it: `critique: 5 of 5` instead
of `5 of 6, 1 declared unreachable`. **The three LINK friction declarations
stay**, because shadowing is not their only reason: each also needs a budget one
run cannot spend (forty Reinforcements, twenty SynapticLinks each costing a
Critique, five attestation grants that would have to pass a thirty-day tenure
bar), and that half is not mechanical.

**THE TWO BUGS ARE THE PART WORTH KEEPING, because both failed by producing an
ABSENT answer rather than a wrong one.** The SynapticLink friction rule was
missing from this analysis entirely, three separate times, and each cause was a
bound somebody had set confidently:

1. **The extern scanner could not see wrapped signatures.** It required the
   parameter on the same line as `pub fn`, and `rustfmt` wraps a signature once
   it is long enough — so **five of the coordinator's 68 externs were invisible,
   including BOTH multi-line `attempt_*` probers.** The three link friction
   rules therefore reported no raw-write path while the prober written for
   exactly that purpose sat in the tree: the bypass could not be seen because
   its extern could not be seen. Same shape as item 18's `PROBED_LINK_TYPES` —
   a classifier reaching a confident conclusion from an input nobody had
   maintained. No entry write path changes as a result, so 5d's
   classifications are untouched; the hole was latent for entries and live for
   links.
2. **The guard window was too tight by exactly one comment block.** A
   coordinator refusal's condition is read from the first real line above it,
   and the window was three lines. `check_synaptic_link_friction` explains
   itself in four comment lines between its `if` and its `return Err`, so its
   condition read as absent and matched nothing. Widened to twelve, which is
   safe because the loop still breaks on the first real line — that is what
   separates an `if` guard from the `.ok_or(wasm_error!(..))` form, which has no
   condition of its own.

**And one judgement that was wrong rather than merely bounded.** Guards were
collected one call level deep, with the bound written down as covering every
case in this file. It did not: `create_critique` reaches the SynapticLink
pre-check through TWO hops (`create_synaptic_link` → `check_synaptic_link_friction`).
Reachability is now the transitive closure with a visited set, which removes the
judgement instead of restating its limit. The closure being too BROAD is the
opposite risk and is bounded by what a match demands — the same condition
expression, or a curated entry naming the exact message.

**The closure is the wrong question in one place, and that is stated because it
reads as an inconsistency.** Whether an extern WRITES is decided from its own
body alone. Asking the closure makes every read a write path: `get_discourse_health`
reaches `effective_conductance_with_half_life` legitimately, and the graph keeps
going, so three read-only externs each reported the same conductance-tag guard
as an enforcement gap. Reachability is right for finding a guard and wrong for
deciding whether a write happened.

### Finding 13 — the inverse of shadowing, and this repository has shipped it twice

**Three coordinator refusals have no validation twin at all.** This fell out of
5e's comparison for free and is reported rather than classified, because it is
the opposite arrangement and the opposite problem. Shadowing is a pre-check WITH
a twin, where the twin is what cannot be reached — a TESTING gap. A pre-check
with NO twin is an ENFORCEMENT gap: a custom client skips the coordinator and
the condition is not checked by anybody.

| refusal | in |
|---|---|
| `Can only assert expertise backed by your own WorldlineTrace.` | `assert_expertise`, which writes a `Claim` |
| `prediction must not be empty` | `pre_register` |
| `salt must not be empty; without it a guessable prediction is recoverable` | `pre_register` |

**This is a candidate list, not a defect list, and the distinction is load-bearing.**
A pre-check may legitimately have no twin — it can guard a coordinator-only
concern, or a field the host derives and verifies another way. Deciding which is
which needs a reader, so the tool reports and does not judge, the same split 5d
and 5e already use for the half that is not mechanical.

**What makes it worth a permanent check rather than a one-off look is that this
exact shape has shipped here twice**, and both are recorded in the zomes' own
comments. `create_membrane` carried all three accountability checks while
`validate_membrane` checked neither the constitution nor the promises — and its
comment claimed to be *"mirroring validate_membrane's DHT-enforced rule (the
real enforcement layer, unbypassable by a custom client)"* while that function
did no such thing. The burn tier was the same: a pre-check asserting a
validation twin that did not exist. Both were found by reading, late. This now
reds nothing and prints every run, so the next one is found by looking at
output.

**Queued as READINESS item 20** — a decision rather than a sweep, because
closing any of the three means a rule in the integrity zome, and that is a
`protocol_version` bump and a DNA hash change.

### Finding 14 — the foresight types were excluded on a reason that was wrong twice over, and the case that closed them was passing by accident

**The exclusion note said `WorldlineTrace` and `Revelation` "need dependency
chains rather than payloads, which is a larger job than this file".** That note
had already been corrected once — it originally blamed chains for `Retraction`
too, which turned out to cost one extra call. On 2026-10-21 the rest of it went
the same way, and in both directions.

**The chains were already built.** `otherAgentFixtures()` has been publishing a
trace, a commitment and a reveal since item 5f, for the link rules — so the
expensive-sounding prerequisite existed and nothing consumed it for entry
rules. What actually blocks these types is narrower and does not look like a
chain: **most of their fields are derived by the extern**, so the rules about
them are `needs_extern` and unreachable from JavaScript at any effort. Eight of
the eighteen sites across the three types are that, and they stay out of the
denominator by class rather than by exemption.

**Ten were reachable and eight now have cases.** The corpus goes from **10
entry types to 13** — `pre_registration`, `revelation` and `worldline_trace` —
at **260 checks, 0 failed, 0 skipped**. What those eight assert is what a
caller actually hands in: a deadline, a question hash, an expiry, and the
content offered at reveal time.

**A THIRD SHAPE OF GAP, which this corpus had not seen before.** `PreRegistration
question must predate the commitment` is classed `crafted`, because `question`
**is** caller-controlled — and the rule is still unreachable, because the guard
does not compare the field. It compares `question.action().timestamp()` against
the commitment's own, and both are host-assigned. Any question that resolves
was authored earlier, so the only way to make the comparison fire is a clock
moved backwards, which is READINESS item 14's defect and has its own probe.
**A `crafted` classification is a claim about the field, not about the rule** —
the first time those two have come apart here. Declared in `GAPS` with that
reason, alongside `PeriodBoundary sample_action not found`, which cannot dangle
because the extern builds every boundary from the caller's own chain.

**AND THE INJECTION FOUND A WEAKNESS IN A CASE RATHER THAN CONFIRMING IT, which
is the second time that has happened here and the better outcome both times.**
Injection **BH** removed `Only the author of a PreRegistration may reveal it.`
The case red — and for the wrong reason: *"stopped for a different reason:
Revelation content does not hash to the sealed commitment"*. The case had been
offering agent 1's own prediction and salt, so the **hash check one line later**
was refusing the forged reveal, and the case would have gone on passing if the
author rule were deleted tomorrow. It now supplies agent 2's real content —
named once in `OTHER_PREDICTION`/`OTHER_SALT` rather than typed a third time —
leaving the author rule as the only check that can refuse it. Re-injected, the
forged reveal **COMMITS**, which is the strongest red available.

**That also sharpens what the rule is for.** Against somebody who does not know
the committed content the hash check is already sufficient; the author rule's
unique work is against somebody who **does** — after a reveal elsewhere, or a
leak — which is precisely when a third party could otherwise decide for an
author whether their commitment counts as revealed.

| injection | what was removed | result |
|---|---|---|
| **BG** | `reveal_deadline` must be after the commitment | 1 red, and the call **COMMITTED** — an already-expired commitment is accepted |
| **BH** | only the author may reveal | first run: 1 red **for the wrong reason** (see above). After the case was strengthened: 1 red, and the forged reveal **COMMITS** |
| **BI** | `expires_at must be > created_at` | 1 red, and the call **COMMITTED** |

Each was a separate build against a clean conductor; the restored zome returns
260 passed, 0 failed, 0 skipped. **What is NOT asserted here**: the two
`expect: 'deferral'` cases were not individually injected, for the same reason
`Claim`'s dependency cases were not — the assertion is that the message does
*not* appear and the write stalls retryably, which a removed rule does not
change.

### Finding 15 — the eight unreachable rules were a settled decision read as an open one, and reaching them found which rules are load-bearing

**Finding 14 ended by calling the raw-payload extern "a protocol surface
decision — whether this repository wants an extern existing only so tests can
reach derived fields". That framing was wrong: the decision had already been
made, six times.** `attempt_unaccountable_membrane`,
`attempt_false_domain_index`, `attempt_false_membrane_registry`,
`attempt_false_taxonomy_index`, `attempt_entry_update` and
`attempt_false_attachment_link` all exist for exactly this reason, and the
first one's own comment carries the argument:

> *"Not an attack surface: every call that a custom client could make to gain
> something is rejected by `validate_membrane`, which is the point. If this
> ever SUCCEEDS ... the accountability has regressed to coordinator-side
> courtesy again."*

It also names the failure the probers exist to prevent, which is the one these
eight rules were sitting in: *"a test calling it proves only that the
COORDINATOR refuses — which is precisely the confusion that let
`validate_membrane` go without these checks while a comment claimed it had
them."* And SPEC §11.1 makes the security argument structural rather than a
judgement: a coordinator edit is hot-swappable via `update_coordinators`, so a
peer running a modified coordinator can already author any op validation
accepts. A prober grants an attacker nothing; it grants a test the ability to
**observe** the refusal.

**So three probers were added** — `attempt_raw_worldline_trace`,
`attempt_raw_pre_registration`, `attempt_raw_revelation`, each three lines, each
writing no index link for the reason the membrane probe states. `needs_extern`
fell from **10 to 2**, the three specs moved onto the probers the way the
`membrane` spec already drove its own, and the corpus reads **270 checks, 0
failed, 0 skipped**: `worldline_trace` 8 of 8, `revelation` 6 of 6,
`pre_registration` 3 of 4 with the timestamp rule still declared unreachable.
The `PeriodBoundary sample_action not found` gap is **gone rather than
re-justified** — a dangling boundary is now a payload anybody can write.

**AND THE FIRST RUN OF THE NEWLY REACHABLE RULES PRODUCED A FINDING THAT WAS
UNKNOWABLE BEFORE, which is the best argument for having built them.**
Injection **BK** removed all three author-binding rules at once:

| type | what happened with the rule gone |
|---|---|
| `PreRegistration` | **the call COMMITTED** — a commitment with a forged author was accepted, so this rule is the ONLY thing standing there |
| `WorldlineTrace` | stopped by `PeriodBoundary sample_action must be authored by trace agent` instead |
| `Revelation` | stopped by `Only the author of a PreRegistration may reveal it` instead |

Three reds, and the reds are not equivalent: **the author-binding rule is solely
load-bearing for `PreRegistration` and backed up by an adjacent rule for the
other two.** Nothing could have established that while the rules were
unreachable — which is the whole of Finding 14's argument, turned around and
pointed at Finding 14's own conclusion.

**The estimate was wrong in the same direction twice.** Finding 14 said the
remaining work was a protocol-surface decision; it was nine lines of Rust and
eight cases. Before that, the exclusion note said these types needed dependency
chains; the chains already existed. **Both estimates were written from the
conclusion rather than from the obstacle**, which is the shape this repository
had already named four times in the two days before this was written.

### Finding 16 — `needs_extern` and `needs_prober` are both 0, and the last three rules were each the only thing standing

**Two more probers finished what Finding 15 started.** `attempt_raw_bridge_record`
and `attempt_raw_external_critique`, same three-line shape, same argument. The
corpus is **15 entry types, 282 checks, 0 failed, 0 skipped**, and both
unreachable classes are now empty:

| class | before 2026-10-21 | after |
|---|---|---|
| `needs_extern` | 10 | **0** |
| `needs_prober` | 0 | **0** |

**Every validation rule reachable from JavaScript now has a case or a stated
gap.** What remains outside that is `remote` (4 — needs a peer authoring a bad
op), `passthrough` (12 — forwards another validator's result, no message of its
own), `shadowed` (2 — the coordinator refuses first, derived rather than
declared since item 5e) and four declared `GAPS`.

**AND INJECTION BN SAYS SOMETHING BK DID NOT.** All three newly reached rules
were removed at once, and all three red with **"the call COMMITTED — nothing
stopped this payload"**:

- `BridgeRecord author must match action author.`
- `BridgeRecord {}.` (the loss-field consistency rule)
- `ExternalCritique importer must match action author.`

**Compare BK**, where only `PreRegistration`'s author rule committed and the
other two fell through to an adjacent rule. So the three here are each **solely
load-bearing** — nothing else in their validator catches the payload. That is
the fact a prober buys: before these existed, "is this rule the only thing
standing?" was not a question anybody could answer about them.

**ONE HARNESS IMPROVEMENT CAME OUT OF IT, and it is the escape hatch the code
already asked for.** `BridgeRecord {}.` is a `format!` rule whose literal prefix
is twelve characters — `"BridgeRecord"` — which identifies nothing, so
`assertStopped` refused it outright with *"assert it another way"*. That refusal
is correct and was deliberately kept: a weakened match is worse than none. The
"another way" is now a case-level **`expectText`**, which asserts the FULL
interpolated string (`BridgeRecord excerpt_length cannot exceed
original_length.`) rather than a prefix — **stricter, not looser**, since a
prefix matches any rule sharing its head while this names one exact message. It
must be copied from the zome rather than imagined, which is the same discipline
the prefix rule enforces by refusing.

### Finding 17 — the corpus now spends three more SynapticLinks per run, and the ceiling is 20

**`protocol_version: 10` added `Critique.past_cone` and five validation rules, and the corpus gained five cases — 282 to 287 checks, 0 failed.** The rules are classed correctly without help: the size ceiling comes out **`shadowed`** (the coordinator refuses first, in its own wording), the dangling-member rule **`deferred`** (`must_get_valid_record`), the type rule **`honest`**, and the duplicate, same-target and transitive-closure rules **`crafted`**.

**THE COST THAT WILL BITE SOMEBODY LATER IS NOT THE CHECKS, IT IS THE LINKS.** The cone fixtures need three real critiques — one legal cone member, one whose own cone is non-empty (for the transitive case), and one of a different target (for the same-target rule). **Every `create_critique` also creates a SynapticLink, and §6 caps those at 20 per author per rolling hour.** Running the corpus twice inside an hour on one conductor now fails its *Critique dependency chain* with `SWO temporal friction: 20 SynapticLinks already created`, and every case below it SKIPs.

That is the clean-conductor rule this directory already states, with less headroom than before. **It is recorded rather than worked around**, because the alternative — trimming a fixture — would weaken a case: the transitive-closure fixture is the one that makes the under-claiming attack reachable at all.

**Two wrong hashes were tried before the type-failure case worked, and both are worth keeping.** `ctx.claimAction` did not exist, so the mutation fell through to a dangling hash — which **defers** rather than refusing, so the case red for the wrong reason and said so. Then `notCritiquable` looked obviously right and was not: `create_evidence` returns an **`EntryHash`**, `past_cone` is `Vec<ActionHash>`, and the payload failed to deserialize at the extern boundary before validation ever saw it. A hash is not a hash; the type is part of the contract.

## Why one mutation at a time

A payload that violates two rules proves nothing about either: validation
returns at the first failing check, so the message names whichever rule sits
earlier in the function. Every case starts from a baseline that is asserted to
**commit**, and changes exactly one field. A refusal naming a different rule is
reported as a failure rather than counted as a pass — and the baseline is
checked first, because if it does not commit then every case below it "passes"
by being refused for the wrong reason.
