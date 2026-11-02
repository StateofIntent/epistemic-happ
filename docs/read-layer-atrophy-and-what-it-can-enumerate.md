# Read-layer atrophy, and the thing that actually bounds it

**Research answer to open-work 3.8, written 2026-11-02.** The row asks whether
STRUCTURAL atrophy can be a read-layer property the way conductance and
standing already are — dormancy for **membranes** and **entry types**, derived
at read time, with the threshold supplied by the caller. It would be the fourth
time this protocol answers a wall with *put it in the reading, not the record*
(time §5.22, exclusion §8, sybil cost 3.7, decay here).

**The answer is yes for one of the two and no for the other, and the reason the
second fails is not the one the row anticipated.** It is not about clocks, and
it is not about whether a read can compute decay. It is about what this DNA can
**enumerate** — and the honest result is a sentence the row does not contain:

> A read-layer answer is bounded by what the read layer can enumerate, and this
> DNA deliberately enumerates almost nothing globally.

---

## 1. The success condition, restated first, because it is easy to overstate

A positive result here is **reader-local dormancy, not removal**. It is
progress on a declared aspiration — Invariant 9 was relabelled as exactly that
in #367 — and never satisfaction of it. SPEC §5.22 already carries the
objection: *"atrophy that emits no events cannot drive anything, and a tick
that reports decay drives nothing either."* A dormancy read drives nothing by
itself. The only consequence available is the reader's own action on it.

In autopoietic terms this is not death. Death removes and recycles a
component; a reader declining to count something is **being ignored**, which is
what *coral reef rather than cell* already concedes — the old structure stays
and stops being load-bearing.

## 2. Why it is possible at all, and the asymmetry is narrower than it looks

Validation cannot reach a clock (§5.22). A **coordinator read** can. That is
the whole reason `get_effective_conductance` and `get_standing` exist and write
nothing.

But the clock a read may trust is specifically the **host action timestamp**,
not the entry's own field. `effective_conductance_with_half_life` reads
`link_action.timestamp()` off the `CreateLink` action — host-supplied,
unforgeable by the author. Compare `Membrane.created_at`: an ordinary entry
field, author-supplied, and uncheckable for the same reason validation cannot
check any timestamp. **So a dormancy read must be built on action timestamps
over a set of records, and never on the `created_at` of the thing whose
dormancy is being asked about.** That is a constraint on the shape, not an
obstacle.

## 3. MEMBRANES: yes, and it is nearly a by-product of a read that exists

`get_standing` already assembles exactly the set this needs. Given a membrane
it resolves the domain, takes `get_claims_by_domain`, excludes discourse
readings and federation imports, then walks critiques to a caller-named
horizon. It then computes causal heights over that graph and compares them
against the caller's `max_causal_distance`.

Every record in that walk carries a host action timestamp. **What is missing is
reading them.** The walk currently yields structure and discards time; a
dormancy read is the same walk reporting `most_recent_action_secs` beside the
heights, and the caller comparing it against a staleness threshold of their own
naming — exactly 3.1's decision (*the reader is the promiser*) one layer up.

Two properties come free and are worth stating because they are what make it
safe:

- **It is opt-in and has no default.** A membrane with no threshold named is
  not dormant, it is unassessed — the same posture `AttestationPolicy` and
  `max_causal_distance` already take. Two readers may legitimately differ.
- **It writes nothing**, so no entry type, no link type, no validation rule, no
  `protocol_version` bump, no fork. Coordinator-only per §11.

## 4. ENTRY TYPES: no — and the question is unaskable rather than unimplemented

This is the half that fails, and it fails structurally.

To ask *has anything of this kind happened lately, anywhere*, a reader must be
able to enumerate things of that kind without already knowing where they are.
This DNA has exactly **two unparameterised global anchors**:

```
Path::from("membranes")          -> every Membrane
Path::from("critique_species")   -> every CritiqueSpecies
```

Every other index is **parameterised by a key the caller must already hold**:

```
Path::from(format!("agent_{}",    agent))      -> that agent's worldline
Path::from(format!("domain_{}",   domain))     -> that domain's claims
Path::from(format!("question_{}", question))   -> that question's pre-registrations
```

So of the **19 entry types** the integrity zome declares, dormancy is askable
for **three**, and two of those are the anchors above:

| askable | how |
|---|---|
| `Membrane` | the `membranes` registry anchor, `GetStrategy::Network` |
| `CritiqueSpecies` | the `critique_species` taxonomy anchor |
| `Claim` | **only per-domain**, and only for domains the reader can NAME — the membrane registry names the founded ones, so claims in a free-text domain nobody founded are invisible to any global sweep |

The remaining **sixteen** — `Mew`, `Retraction`, `Critique`, `Evidence`,
`Constitution`, `WorldlineTrace`, `BridgeRecord`, `ExternalCritique`,
`AntibodyPattern`, `FederationRecord`, `SealedPrediction`, `PreRegistration`,
`Revelation`, `Assessment`, `SettlementPolicy`, `SettlementStatus` — are
reachable only from a base you must already possess: a target, a claim, an
agent, a question. There is no base from which to ask the question at all.

**And two of the enumerations that look global are chain-local.**
`get_all_constitutions` and `get_critiques_by_mode` are
`query(ChainQueryFilter)` over the **caller's own source chain** —
`get_all_constitutions` by specification (§10.0), and `get_critiques_by_mode`
as a fact about the code. A dormancy figure built on either would describe the
reader's own history while appearing to describe the network's. That is a
sharper trap than an absent index, because the call returns data.

### Why building the missing index is the wrong fix

Making entry-type dormancy askable means a global index per type: a link, or an
anchor entry, **written on every creation**. That is a write, on the hot path,
for every entry in the protocol. Item 22 already declined a write whose only
purpose was to drive atrophy, and Invariant 6 makes every such link permanent —
so the index could never be retired even after the question stopped being
interesting. **The cure is the thing the invariant exists to prevent.**

## 5. So what 3.8's answer actually is

**Dormancy is a read-layer property exactly where the read layer can
enumerate**, and this protocol enumerates two things globally on purpose. That
is not an accident to be fixed; it is the same property that makes this a DHT
rather than a database — there is no `SELECT * FROM critiques`, and the absence
is what keeps a reader's cost predictable and a writer's obligations finite.

The useful reframing is that **the row asked the question one layer too high.**
*Entry types* is the wrong unit. Structural atrophy at the level of *has this
KIND of thing fallen out of use network-wide* needs a census, and a census needs
either a global index (a write) or an aggregator who has walked everything and
publishes what they found (an attributed `Claim`, which 1.20's stronger version
and `publish_discourse_reading` already describe). **Both of those are already
decided elsewhere in this file, in the opposite direction from a read.**

What is left, and it is worth having:

1. **Membrane dormancy** — buildable now, as a field on `get_standing`'s
   existing walk, caller-thresholded, writing nothing. `[M]`, no decision.
2. **CritiqueSpecies dormancy** — buildable now from the taxonomy anchor, and
   `get_critique_species_adoption_count` already exists, so *proposed long ago
   and adopted by nobody since* is derivable. The honesty constraint is
   `species-adoption.mjs`'s: adoption is a fact about a vocabulary's reception,
   never a ranking of species.
3. **Everything else: declined, with this reason**, rather than left open.

## 6. What this does not claim

It does not close Invariant 9, and nothing here should be read as doing so.
Dormancy that a reader computes and acts on is *being ignored*, not death. The
protocol still has no mechanism by which an unused structure is removed or its
capacity recycled, and after this row it still has no path to one that does not
require a write somebody already declined.

**It also does not claim the two buildable reads are wanted.** They are
derivable and honest; whether a membrane's dormancy is a thing any reader has
asked for is a separate question, and 6.x's rows are the record of how often a
read's screen turns out to be the hard part. Nothing here should be built
because it is possible.

---

*Related: 3.1 (closed per-reader; supplies the threshold pattern), 3.2 (the
derived alternative, parked), 3.7 (`docs/sybil-cost-and-the-root-set.md`, whose
headline was also a correction to its own row), item 22 (declined the write a
driving consequence would need), Invariant 6 (why that write was declined), and
SPEC §5.22 (the objection this answer concedes).*
