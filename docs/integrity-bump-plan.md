# The integrity bump — what it costs, what goes in it, and what has to be true first

**Drafted 2026-10-24.** `docs/open-work.md` §4 says the integrity changes
"accumulate, then bump once". This file is the once: the candidate set, the
mechanics, and — the part that matters most — **what must be decided before it
can be cut at all.**

It is not a schedule. Four of the five candidates are blocked on decisions or
on somebody else's answers, so a schedule would be fiction.

---

## 1. What a bump actually costs

From SPEC §11.1, which is descriptive rather than aspirational:

- **The DNA hash is computed over the integrity manifest and nothing else** —
  `network_seed`, `properties`, and the integrity zomes.
- **Any** edit to the integrity zome changes it: an entry struct field, a link
  type, a validation rule. Additive changes included.
- A different hash is **a different network**. Old and new peers never gossip.
  **There is no in-place migration.**

And the corollary this protocol feels harder than most: **Invariant 6 forbids
even deleting the orphans.** A bump does not retire the old network's entries,
it strands them, permanently, and nobody can clean up afterwards.

So the honest framing is that **a bump is a relaunch, not an upgrade.** Every
install reinstalls; no claim, critique, assessment or membrane carries over.
That is the cost to weigh against the contents below, and it does not get
cheaper by batching — batching only stops it being paid five times.

**One mechanical constraint**, recorded in the integrity zome itself: entry
types are **position-indexed**, so a new one must be *appended* to
`EntryTypes`. Inserting above an existing variant renumbers everything after it
and silently reinterprets stored entries. Every addition below goes at the end.

Current state on `main`, **measured 2026-10-25 from `dna/integrity/src/lib.rs`
rather than carried forward**: `PROTOCOL_VERSION = 11`, **nineteen** entry
types and **thirty-one** link types. The held 4.5 branch (PR #350) stands at
**12, twenty and thirty-two**, and that number is
provisional — if 4.1, 4.2 or 4.3 join the same cut, 12 is shared rather than
sequential. One bump, one number.

> **This paragraph said "sixteen entry types" and "12 and seventeen" until
> 2026-10-25, and the sentence contradicted itself.** Sixteen was the count
> before settlement; `protocol_version: 11` IS settlement, and it appended
> three entry types (`Assessment`, `SettlementPolicy`, `SettlementStatus`) and
> two link types. So the version and the count beside it could not both have
> been true, and the figure for the held branch was wrong by the same three.
> The numbers above are now read from the enums, which is the only way they
> stay right: nothing gates a count written in prose.

**AND ONE RELAUNCH IN THIS COST MODEL IS NOT OURS TO SCHEDULE: §6 BELOW.**
Everything above and everything in §2-§4 is about an integrity change *this
project chooses*. A Holochain breaking change forks the DNA hash by the same
mechanism, on upstream's clock, with none of these decisions involved — and
until 2026-11-21 this file did not mention it.

---

## 2. The candidate set — six, after 3.1 was decided, two were found missing, and all six were re-priced

§4 lists three. This session added two more, and they belong in the same bump
because they are the same kind of change.

> **CORRECTED 2026-11-15, AND THIS FILE WAS THE ONE THAT WAS WRONG.** This
> table carried four and this header said so, while `docs/open-work.md` §4 had
> listed **five** since 2026-10-26 night: **4.6 was never entered here at
> all** — opened the same night this count changed to four, and missed. That
> matters more than a miscount because §4 names *this* file as "the authority
> on the set", so the authority was the stale copy and the index was right.
> Found by filing 4.7. Both are below.

| # | change | integrity surface | status |
|---|---|---|---|
| 4.1 | **Foresight ordinal anchor** — `PreRegistration.reveal_deadline` becomes a position in a declared order; `Revelation` gains an association; `Membrane` gains a declared notary key; validation checks shape only | ~~3 entry structs, 1 validation rule~~ **RE-PRICED 2026-11-15: 3 entry structs, TWO validation rules, and both are DELETIONS rather than edits.** `reveal_deadline` has 5 sites in the integrity zome and 7 in the coordinator, and **two of the integrity sites compare it as a TIME**: `:1383` refuses a commitment born already expired, `:1443` refuses a late `Revelation`. An ordinal cannot be compared against `action.timestamp()`, so both rules go. **That is the point of 4.1 — it is the clock-skew repair (§5.22, the sixth security defect) — but this row said "validation checks shape only" without saying that two guarantees are surrendered to get there.** | **blocked**: Andras's three answers (asked, 7.6) |
| 4.2 | **Observers as entries** — prompts, heuristics and thresholds as signed entries, so selection acts on the agents | ~~1 new entry type (appended)~~ **RE-PRICED 2026-11-15, AND THIS IS 4.5's DEFECT REPEATING: an entry type is never the cost, what INDEXES it is.** Measured: **16 of 19 entry types are resolved inside a `validate_create_link` branch.** Of the three that are not, `Evidence` IS linked — by `ClaimToEvidence` and `CritiqueToEvidence`, two of the four link types with **no validation branch at all** — while `SealedPrediction` is embedded at its construction site and `SettlementPolicy` is reachable only by a hash the caller already holds. **So an un-indexed entry type exists here only where nobody needs to FIND it**, and 4.2's whole purpose is selection acting on agents, which is discovery. Add **at least 1 link type and 1 validation branch** — by the measured pattern, 42-77 lines with 3 `Invalid` returns and a `must_get_valid_record` | **blocked**: 3.5's cost, priced |
| 4.3 | **Species provenance + metabolic policy fields** | fields on `CritiqueSpecies`; policy fields TBD. **RE-PRICED 2026-11-15 AND THE INDEX HALF SURVIVES — the only one of the three that did.** `CritiqueSpecies` is already indexed three ways (`TaxonomyToSpecies`, `CritiqueToSpecies`, `SpeciesToParent`), so adding fields needs **no new index and no new link type**. **One thing the estimate missed:** a *provenance* field that points at anything is a **reference field**, and §5.3's gated rule is that reference fields resolve their target in validation — currently **8 of 9**, the exception being `Critique.evidence_hashes`. Provenance makes it 9 of 10 and adds one resolution site. **"Policy fields TBD" is not a measurement and cannot be made one until 3.4 settles** | **blocked**: 3.4 (a budget at all), and 2.4 is now done |
| ~~4.4~~ | ~~**Declared atrophy threshold N**~~ — a `Constitution` field | — | **DROPPED 2026-10-24.** 3.1 decided: the reader is the promiser, per-reader is enough. No declared-N field is being built. |
| **4.5** | **`ForeignCritique` as a real entry type** — the honest home for an imported critique, instead of the tagged-`Claim` witness Stage 5 ships | ~~1 new entry type (appended), 1 validation rule~~ **CORRECTED by writing it: 1 entry type, 1 LINK type, and nine validation sites** — five on the entry, four on the link. The witness was discoverable for free because it WAS a `Claim` and rode the domain index; a `ForeignCritique` cannot, and an unconstrained link type is what §5.19 refuses. Inventory 233 → 242 | **WRITTEN AND HELD — PR #350**, draft, do not merge until the bump is cut |
| 4.6 | **Per-field content mode — `public_permanent` or `withdrawable`, declared by the membrane** (opened 2026-10-26 night out of 7.16's advice; `docs/erasure-and-the-content-split.md` §3) | **RE-PRICED 2026-11-15, AND LIKE 4.7 IT IS A FORK IN THE ROAD RATHER THAN A NUMBER.** Its content-rule inventory **verifies exactly** — all four line numbers still land on the rules the row names (`:1331`, `:1309`, `:1513`/`:1516`, `:2119`), so that half was honest. **BUT "PER-FIELD" IS NOT EXPRESSIBLE BY THE MECHANISM THE ROW CITES: Holochain visibility is declared PER ENTRY TYPE** (`#[entry_type(visibility = "private")]`), and `SealedPrediction` — **the only private entry type in the zome** — is private wholesale. So: **(a) SPLIT THE ENTRY** — a public `Claim` plus a private companion — costs **1 new entry type + 1 new link type + 1 validation branch** (42-77 lines, 3 `Invalid`, one `must_get_valid_record` by the measured pattern), **and the binding can only be STRUCTURAL**, because validation cannot see a private body at all: hdi delivers `None` and `Some(_)` is an outright error (`:798-810`). Or **(b) ENCRYPT IN PLACE** (§3.2) — no new entry type, but withdrawal becomes key destruction, which **makes 4.6 DEPENDENT ON 4.1's ordinal anchor** for *erased as of version N*. The row half-says this; the re-price makes it a dependency rather than an aside. **Note the precedent cuts both ways: `SealedPrediction` is cheap because it is BOTH private AND one of the three un-indexed entry types** (embedded at its construction site). A private companion to a `Claim` is the opposite — it must be findable from the public half, so it cannot inherit that cheapness | **blocked**: the adoption decision — **and now also on route (a) vs (b), which 4.1 partly decides** |
| **4.7** | **A domain index — enumerating the SET of domains** (6.12's `[D]` half; filed 2026-11-15 by re-pricing on §3's *what indexes it?*) | ~~**CONDITIONAL**~~ **RESOLVED TO NONE, AND THE CANDIDATE IS WITHDRAWN — 2026-11-15, the day it was filed.** 6.12's `[D]` was taken and the answer is *require founding*, so there is nothing to bump: a founded domain is a `Membrane`, `MembraneRegistry` already indexes them, and `get_membranes` already reads it (`dna/coordinator/src/lib.rs:2815-2836`, link-only, one global anchor, `GetStrategy::Network`). The alternative — 1 new link type plus the first TAG-VALIDATING branch in this zome — is **not scheduled** | ~~**blocked**~~ **WITHDRAWN**: 6.12's founding question was answered, and it removed this candidate rather than specifying it |

**4.4 and 4.5 were both added by this session's work, and 4.4 has already been
dropped again.** 4.4 came out of Stage 3 (#324): the threshold works as the
caller's promise, and the *declared-per-membrane* variant was the thing 3.1
decided. **3.1 was decided on 2026-10-24 — per-reader is enough — so 4.4 is
off the list** (the count has since moved three times more, all on
2026-11-15: 4.6 was found missing from this table, 4.7 was filed, and **4.7
was then WITHDRAWN the same day when 6.12's founding question was answered**,
so the set is **six listed and five bumped**), which is a useful demonstration
that the blocked items here are blocked on real questions: answering one
removed a candidate rather than scheduling it — **and that has now happened
twice, 4.4 and 4.7, which is the strongest single argument for pricing a
candidate before scheduling it.** 4.5 came out
of Stage 5 (#321): the witness-as-tagged-`Claim` was chosen precisely to avoid
forking, and it is a workaround with a real cost — a reader must filter by tag,
and `get_discourse_health` needed `imported_claims` to keep its own count
honest. A typed entry removes both.

---

## 3. What has to be true before it can be cut

Ordered by what blocks what, not by preference.

1. ~~**3.1 must be decided**~~ — **DONE 2026-10-24: the reader is the
   promiser, per-reader is enough.** 4.4 is dropped and the bump is four
   items. This was the only blocker fully inside the project's control, and
   it is now gone.
2. **Andras must answer** — 4.1's three questions, asked in 7.6. Until then the
   ordinal anchor cannot be specified, only sketched. Note the 2026-10-19
   decision still stands that the anchor is **not adopted**; the reopen order
   is repair 3 first (free), then repair 4.
3. **3.5's cost must be priced** — 4.2 is an addition to the attack surface,
   not just the schema: observers-as-entries makes the thing being selected a
   prompt, which throws away the swarm's accidental defence that dispositions
   are mechanical.
4. **3.4 must be settled** — whether a metabolic budget can exist at all
   without being Invariant 1's leaderboard. If not, 4.3 shrinks to species
   provenance alone.
5. ~~**6.12's founding question must be answered**~~ **ANSWERED 2026-11-15:
   *require founding*. This was the only precondition here that could REMOVE a
   candidate rather than specify one, and it did — 4.7 is withdrawn.**
   `MembraneRegistry` and `get_membranes` already enumerate founded domains,
   with no integrity change and no fork. The branch not taken would have needed
   the first tag-validating link branch in this zome — which `DomainToClaim`'s
   own SPEC §10.0 row declined for `DomainToClaim` itself, and which carries
   the unbounded-single-anchor growth §10.0 sustained against for
   `get_critiques_by_mode`. **So this item is closed and no longer gates the
   batch.** The reasoning, including what would reverse it, is in 6.12; the
   short version is that the revealed preference pointing the other way was
   measured and found unpriced — the app never told anybody founding was what
   made a domain findable.

   **This is the second time answering a blocker here has removed an item
   instead of scheduling one** — 3.1 did it to 4.4 — which is the argument
   that these are real questions rather than a queue.

~~**4.5 needs nothing.** It can be written now and held.~~ **WRITTEN AND HELD
2026-10-25 — PR #350, draft.** And it earned its keep before merging: writing
it is what found that §2 had understated its surface by a link type and eight
validation sites. **Re-price the other three on the same question — *what
indexes it?*** — because the one candidate anybody actually built is the one
whose cost was wrong. **DONE ON ALL FOUR, 2026-11-15 — AND TWO OF THE THREE OLDER ESTIMATES WERE
UNDERSTATED, WHICH IS THE RESULT THIS INSTRUCTION PREDICTED.** 4.1 is two
validation rules and not one, and both are surrenders rather than edits; 4.2
understates by a link type and a validation branch, **which is 4.5's defect
repeating exactly**; 4.3's index half is the only estimate that survived, and
its other half still cannot be priced. The 4.7 re-price **changed the answer
from a cost to a CONDITION**, found two things the estimate had wrong
(the registry pattern cannot be copied, because a domain is not an entry and
all three existing index types bind their author through a field on a real
record; and the path-hierarchy route does not exist — no `ensure()`, no
`TypedPath`, no `children()` anywhere, every anchor hash-only), and surfaced
4.6's absence from §2. **4.6 was re-priced on 2026-11-15 too, so ALL SIX now have been** — and it
came out like 4.7, a fork in the road rather than a number: its content-rule
inventory verifies exactly, but *per-field* is not expressible by the
mechanism it cites, because Holochain visibility is per ENTRY TYPE and
`SealedPrediction` — the only private entry type here — is private wholesale.
**Of the five re-priced estimates, three were wrong (4.1, 4.2, 4.6), one held
(4.3), and one turned out to be conditional on a decision (4.7).**

---

## 4. The scheduling question nobody has asked yet

**Release step 4 is "invite ten people on desktop" (§7.4).** A bump after that
invitation strands whatever those ten people wrote — permanently, with no
cleanup path, under Invariant 6.

So the bump and the invitation are in direct tension, and the ordering is a
decision rather than a detail:

- **Bump first, invite second** — the invited network is the one that lasts,
  but the invitation waits on four blocked decisions.
- **Invite first, bump second** — testing starts sooner and the testers' data
  is knowingly disposable, which has to be *told to them in advance* or it is a
  broken promise rather than a known limitation.
- **Invite, and never bump** — treat 11 as final and drop all five candidates.
  Worth stating as an option because it is the only one with no cost, and
  because four of five are blocked anyway.

**DECIDED 2026-10-25: INVITE FIRST, BUMP SECOND.** The ten people are invited
onto `protocol_version: 11`, and they are told before they write that what they
publish does not survive the next integrity change.

**What decided it was not a preference between the first two.** It was that
`v0.3.0` removed the only cheap argument for *bump first*. While the published
build was two forks behind, step 4 was blocked whatever anybody decided, so
waiting cost nothing — the bump could ride a delay that already existed. The
release closed that on 2026-10-24. *Bump first* now means the invitation waits
on three answers nobody in this project controls: Andras's three questions for
4.1, pricing 3.5 for 4.2, settling 3.4 for 4.3. **An invitation blocked on
somebody else's mail is not a schedule.**

**And *never bump* was not chosen, though it is the only option with no cost.**
Three of the four candidates are blocked on questions that are worth answering
rather than on indecision, and dropping them would be deciding those questions
by default. 4.5 is the proof the cost is real: it was ready, so it was written
(held in PR #350) and it immediately found that this plan had **understated its
own integrity surface** — §2 is corrected above. That is not the kind of thing
a dropped candidate teaches.

**WHAT THE DECISION OBLIGES, and it is not optional.** Under Invariant 6 a
tester's only protection is knowing in advance, because nothing can be deleted
afterwards — not by them, not by an operator, not by anybody. 7.1's commitment
is to vouch for honesty rather than for safety, so the disclosure IS the
commitment here and not a courtesy attached to it. `INSTALL.md` now says a
further break is **planned rather than hypothetical**; that sentence is part of
the decision, not a consequence of it.

~~There is also a live inconsistency to resolve~~ **— AND IT IS RESOLVED.**
This paragraph said `v0.2.0` carried `protocol_version: 9` against `main`'s 11,
so anyone invited would join a network two forks behind what this repository
describes, and *some* release had to happen before step 4 regardless of this
bump. **That release was cut: `v0.3.0`, 2026-10-24, `protocol_version: 11`.**
The precondition that was not about the bump at all is therefore gone, and what
remains below is only the bump's own ordering.

Note what this does and does not change for the scheduling question. It
**removes the argument that step 4 must wait on something anyway** — which was
the cheapest reason to prefer "bump first", because the invitation was blocked
regardless. With the release shipped, "invite first" costs only the testers'
data, knowingly and in advance, while "bump first" now costs the whole
invitation waiting on three answers nobody in this project controls.

---

## 5. What this plan deliberately does not do

It does not sequence implementation work, because nothing is unblocked except
4.5 and one item is not a batch. It does not estimate effort, because the
expensive part of every item above is a decision rather than code — 4.1's
hardest question is what a non-participant can check, not what the struct looks
like.

And it does not recommend cutting the bump. With 3.1 decided, **every
remaining blocker is outside this project's control**: 4.1 waits on Andras,
4.2 on pricing 3.5, 4.3 on settling 3.4. Only 4.5 — `ForeignCritique` as a
real entry type — is ready, and one item is not a batch. **That still holds
after the 2026-10-25 decision, and the decision is why: inviting first means
the bump waits for the batch rather than the batch waiting for the bump.**

So the bump waits, and the next thing that could move it is an answer rather
than a decision. The scheduling question in §4 above is now the live one: a
bump and release step 4's invitation collide, and that ordering is still
unmade. **It is now the only thing standing between this plan and step 4** —
the release half closed on 2026-10-24 and 7.1 was decided the same day, so
nothing else in this file is waiting on anything inside the project.

**ONE QUALIFICATION, ADDED WITH §6 RATHER THAN LEFT TO ROT:** that last
sentence is true of **the bump**, and §6.3 names one thing inside this
project's control that nothing is waiting on only because it is not scheduled
— **publishing the `.happ` beside the installers, which is the only artefact
that could ever verify a seed against a DNA hash.** It is not a bump
precondition and does not belong in §3; it is recorded here so the absolute
above is not read wider than it was measured.

---

## 6. The Holochain version — the relaunch this plan does not schedule

**Added 2026-11-21, as row 7.37's `[D]`, taken.** Until that day this file was
245 lines on breaking changes and **mentioned the Holochain version zero
times** — measured by grep, not impression. It was found by reading what an
adjacent Holochain project open-sourced, whose author's stated reason was *"to
be a viable long running app, you need to plan for Holochain breaking change
migrations at a minimum."* **This section is that plan, and most of it is
already implied by §1 — which is the point: the mechanism is the same one, and
nobody had written down that it fires without us.**

### 6.1 A Holochain breaking change forks the DNA hash, by §1's own mechanism

Not reasoned — the chain is measured end to end, in three places that already
existed:

1. **The hash covers the integrity zomes** (SPEC §11.1, quoted in §1 above):
   `network_seed`, `properties`, and the integrity zomes, and nothing else.
2. **"The integrity zomes" means the compiled wasm, and the evidence is
   sharper than the manifest.** SPEC §5.1 records a **measured** three-row
   table — baseline, a ~30-line explanatory **comment** added, comment
   reverted — in which **the comment alone changed the DNA hash**, with the
   revert returning to the baseline hash as the control. The mechanism is that
   `wasm_error!` expands to a struct carrying `::core::line!()` and this zome
   uses it **23 times**, so any line-shifting edit rewrites baked-in constants
   and changes the wasm. **If a comment forks the network, a different
   compiler input certainly does.**
3. **A new `hdi` is a different compiler input for every entry struct in the
   zome, and this project has already been through one.** The 0.6 → 0.7 move
   **changed `dna/integrity/Cargo.toml`'s dependency list**: the file's own
   comment records that `holochain_serialized_bytes` became **a required
   DIRECT dependency from 0.7 on**, because `#[hdk_entry_helper]` expands to a
   `#[derive(SerializedBytes)]` naming it by absolute path, *"so the crate has
   to be in this crate's own dependency list or every entry struct fails"*.
   Current pins: **`hdi = "=0.8.0"`, `hdk = "=0.7.0"`**, and this machine's
   conductor reports **`holochain 0.7.0`**.

**So §1's framing holds without amendment — a Holochain bump is a relaunch,
not an upgrade** — and nothing in §2's candidate set, §3's preconditions or
§4's ordering bears on it at all. There is no entry struct to append, no
validation rule to price, and no decision of ours to take first.

### 6.2 What is different, and it is the whole reason this section exists: the schedule is not ours

**§4 decided *invite first, bump second*, and that decision assumes the bump's
timing is a choice.** For a Holochain breaking change it is not. It arrives
when upstream ships it, and the only lever here is whether to follow.

**"Never follow" is a real option and it is the one with an expiry**, which is
what distinguishes it from §4's *invite, and never bump*. Declining our own
bump costs five candidates; declining Holochain's costs a conductor nobody
upstream maintains, and the cost grows on its own. **This file does not pick a
date, because nobody here knows one:** we are on `0.7.0`, the next line is
`0.8.x`, and the adjacent project that prompted this section moved 0.6.1 →
0.7.1 and is planning for 0.8.

### 6.3 And it is a relaunch the network seed does not know about

**`breakingVersion` takes exactly one input: the desktop release tag.**
`scripts/pilot-node/breaking-version.mjs`, the ported single copy of the
desktop's `filesystem.ts:190`, reads a semver and collapses it to a band;
`cli.ts:103` builds the seed as `${productName}-${breakingVersion()}`. **The
Holochain version is not an input to the seed, and cannot be inferred from the
tag.**

**The shape of this gap is ALREADY written down, with one cause named instead
of two.** `verify.mjs:187-195` says it plainly: *"the DNA hash is a hash of the
integrity zomes AND the modifiers. A PATCH release that changed an integrity
zome would keep the seed `0.3.x`, split the network anyway, and this check
would say YES."* That names **us** editing the zome. **A Holochain upgrade is a
second cause of the identical silent fork, and it is the one nobody chooses** —
which is why it is worse: the first is a mistake someone could notice making,
and the second is a consequence of a dependency bump.

**THE RULE THIS SECTION ADOPTS, AND IT IS THE ONLY CHOICE IN IT: a release
that moves the Holochain version ships as a desktop MINOR at minimum, never as
a patch.** The DNA hash forks either way — that is 6.1 and it is not
negotiable — so the seed is the only thing that makes the fork **legible**, and
`breakingVersion` moves the seed on a minor and keeps it on a patch. A
Holochain upgrade shipped as a patch would produce two DNA hashes under one
seed, which is precisely the *"mystery hash"* SPEC §5.1 records `dna/dna.yaml`'s
version field as existing to prevent. **It costs nothing, it needs no work, and
it is reversible.**

**NOTHING VERIFIES IT, AND THAT IS STATED RATHER THAN PAPERED OVER.** The
release publishes installers, not the `.happ`, **so there is no released DNA
hash to read** — `verify.mjs`'s own recorded limit, and the reason its old
`RELEASED_DNA` paste was deleted rather than kept. The rule above is therefore
**a discipline, not a gate**, and this file does not keep a claim with no
artefact behind it. What *would* close it is a released `.happ` to hash
against; that is not scheduled either.

### 6.4 What it does not change: the data, and Invariant 6

**§1's corollary stands and gets no worse.** A Holochain-forced relaunch
strands the old network's entries exactly as one of ours would, and
**Invariant 6 forbids cleaning up after either.** §4's obligation — telling
people *before* they write that what they publish does not survive the next
integrity change — already covers this, and the honest reading is that it
makes that disclosure **more** load-bearing rather than different: a further
break is planned *and* one can arrive unplanned.

**The migration machinery that prompted this section does not change that for
us.** `flowsta-hc-lines` caches and runs two conductor versions side by side to
carry one person's data from the old line to the new, which is the right shape
of the problem — but it is Tauri-oriented Rust against a different application
framework (row 7.37). **Not scheduled and not priced, and 7.31's rule applies:
nothing here is worth building before it is needed.**

**One thing from that work is worth taking as a DESIGN rather than as code.**
Its release manifest carries `holochain: { lines: [...], changes_line: bool }`,
so a release **declares** which Holochain lines it runs on and whether it moves
people's data. Here the same fact is **implicit in a seed string** that
`band-plan-check.mjs` has to round-trip through the real `breakingVersion` to
check at all. A declared field is strictly more legible than a derived one, and
6.3's rule is the cheap half of it.

**And its zero-knowledge point lands the same way for this protocol, which is
why it is recorded rather than just noted.** Private data cannot be migrated by
the network, because it is locked to whoever holds the keys: some people sign
back in late and some never return. **So a migration is per-person and
voluntary** — which is what Invariant 6 would require here anyway, and it means
the expensive version of this problem (moving everyone's data) is not available
to be chosen even if it were wanted.

### 6.5 What this section deliberately does not do

It does **not add a candidate to §2.** A Holochain bump is not an integrity
change this project selects, so it has no entry type, no link type and no
validation rule to price, and putting it in that table would make the batch
look schedulable when the trigger is somebody else's release.

It does **not reopen §4's ordering.** *Invite first* was decided on the cost of
the testers' data being knowingly disposable; an unscheduled fork makes that
cost arrive **sooner**, not become something else. The disclosure that decision
obliges is unchanged in wording and more important in fact.

And it does **not claim this has been rehearsed.** The 0.6 → 0.7 move is
evidence that a Holochain breaking change reaches `dna/integrity/Cargo.toml`;
**it is not evidence that this project has ever carried live participant data
across one**, because there was none to carry at the time. `docs/holochain-runtime-0.7.patch`
is the other artefact from that period and is explicit about the same
distinction — *"`cargo check` exits 0 … what it is NOT verified to do: anything
at runtime."*
