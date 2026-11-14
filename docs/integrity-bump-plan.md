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

---

## 2. The candidate set — six, after 3.1 was decided and two were found missing

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
| 4.6 | **Per-field content mode — `public_permanent` or `withdrawable`, declared by the membrane** (opened 2026-10-26 night out of 7.16's advice; `docs/erasure-and-the-content-split.md` §3) | fields on `Membrane`, and a content split whose surface is not yet counted | **blocked**: the adoption decision. **NEVER ENTERED IN THIS TABLE UNTIL 2026-11-15** — see the correction above, and note its integrity surface is still a sketch rather than a measurement |
| **4.7** | **A domain index — enumerating the SET of domains** (6.12's `[D]` half; filed 2026-11-15 by re-pricing on §3's *what indexes it?*) | **CONDITIONAL, and that is the finding: NONE if founding becomes the price of findability** — a founded domain is a `Membrane`, `MembraneRegistry` already indexes them and `get_membranes` already reads it, so there is nothing to bump. Otherwise **1 new link type, appended, plus the first TAG-VALIDATING branch in this zome** | **blocked**: 6.12's founding question *only*. Answer *require founding* and this candidate is **withdrawn, not scheduled** |

**4.4 and 4.5 were both added by this session's work, and 4.4 has already been
dropped again.** 4.4 came out of Stage 3 (#324): the threshold works as the
caller's promise, and the *declared-per-membrane* variant was the thing 3.1
decided. **3.1 was decided on 2026-10-24 — per-reader is enough — so 4.4 is
off the list** (the count has since moved twice more: 4.6 was found missing
from this table and 4.7 filed, both on 2026-11-15, so the set is **six listed
and at most five bumped**, since 4.7 may be withdrawn rather than scheduled), which is a useful demonstration
that the blocked items here are blocked on real questions: answering one
removed a candidate rather than scheduling it. 4.5 came out
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
5. **6.12's founding question must be answered, and it is the only
   precondition here that can REMOVE a candidate rather than specify one.**
   Answer *require founding* and 4.7 is withdrawn: `MembraneRegistry` and
   `get_membranes` already enumerate founded domains, with no integrity change
   and no fork. Answer *do not require founding* and 4.7 joins the batch and
   needs the first tag-validating link branch in this zome — which
   `DomainToClaim`'s own SPEC §10.0 row declined for `DomainToClaim` itself,
   and which carries the unbounded-single-anchor growth §10.0 sustained
   against for `get_critiques_by_mode`.

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
4.6's absence from §2. **4.6's surface is still a sketch rather than a
measurement, and is now the only candidate that has not been re-priced.**

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
