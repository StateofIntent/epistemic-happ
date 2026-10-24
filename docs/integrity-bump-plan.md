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

Current state: `PROTOCOL_VERSION = 11`, sixteen entry types.

---

## 2. The candidate set — five, not three

§4 lists three. This session added two more, and they belong in the same bump
because they are the same kind of change.

| # | change | integrity surface | status |
|---|---|---|---|
| 4.1 | **Foresight ordinal anchor** — `PreRegistration.reveal_deadline` becomes a position in a declared order; `Revelation` gains an association; `Membrane` gains a declared notary key; validation checks shape only | 3 entry structs, 1 validation rule | **blocked**: Andras's three answers (asked, 7.6) |
| 4.2 | **Observers as entries** — prompts, heuristics and thresholds as signed entries, so selection acts on the agents | 1 new entry type (appended) | **blocked**: 3.5's cost, priced |
| 4.3 | **Species provenance + metabolic policy fields** | fields on `CritiqueSpecies`; policy fields TBD | **blocked**: 3.4 (a budget at all), and 2.4 is now done |
| **4.4** | **Declared atrophy threshold N** — a `Constitution` field, so a membrane declares how fast its own domain forgets | 1 field on `Constitution` | **blocked**: 3.1, and only if 3.1 goes the *declared* way rather than *derived* |
| **4.5** | **`ForeignCritique` as a real entry type** — the honest home for an imported critique, instead of the tagged-`Claim` witness Stage 5 ships | 1 new entry type (appended), 1 validation rule | **ready whenever the bump is cut** — no decision outstanding |

**4.4 and 4.5 are new.** 4.4 came out of Stage 3 (#324): the threshold works as
the caller's promise, and the *declared-per-membrane* variant is the thing 3.1
decides, which is a `Constitution` field and therefore integrity. 4.5 came out
of Stage 5 (#321): the witness-as-tagged-`Claim` was chosen precisely to avoid
forking, and it is a workaround with a real cost — a reader must filter by tag,
and `get_discourse_health` needed `imported_claims` to keep its own count
honest. A typed entry removes both.

---

## 3. What has to be true before it can be cut

Ordered by what blocks what, not by preference.

1. **3.1 must be decided** — declared-per-membrane, or derived. This gates 4.4
   entirely, and it is the one decision that changes the *shape* of the bump
   rather than just its contents. If derived, 4.4 disappears and the bump is
   four items.
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

**4.5 needs nothing.** It can be written now and held.

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

There is also a live inconsistency to resolve: `v0.2.0` on the desktop carries
`protocol_version: 9`, while `main` is at **11**. Anyone invited today is
invited onto a network two forks behind what this repository describes, so
*some* release has to happen before step 4 regardless of whether this bump
does. See 1.4's note on what "against that build" can mean.

---

## 5. What this plan deliberately does not do

It does not sequence implementation work, because nothing is unblocked except
4.5 and one item is not a batch. It does not estimate effort, because the
expensive part of every item above is a decision rather than code — 4.1's
hardest question is what a non-participant can check, not what the struct looks
like.

And it does not recommend cutting the bump. **The cheapest correct action
today is to decide 3.1**, because it is the only blocker fully inside this
project's control, it changes the bump's shape rather than its contents, and
Stage 3 already ships without it — so deciding it costs nothing that is not
already built.
