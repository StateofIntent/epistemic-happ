# Open work, in order

**Assembled 2026-10-22, after the day that closed the last hardware-blocked
row.** This is the single ordered list the repository did not have: `READINESS`
carries the release order and the engineering queue, `README` §9 carries the
detail, and the research questions were in neither. Three stale pointers were
found on 2026-10-22 alone — `READINESS`'s step 3, `README`'s *scale beyond four
nodes* cell, and the dangling item 9 → item 22 reference — each because a
dependency closed and the thing waiting on it was not re-read. **This file
exists to be the thing that gets re-read.**

**Every line carries what it is blocked on.** That is the only property that
makes rot detectable: a line whose blocker has gone is a line to act on, and a
line whose blocker cannot be stated was never a task.

**Who can do what**, used as a column below rather than repeated in prose:
**[M]** model, bounded; **[H]** needs the human's hands or machines;
**[D]** a decision only the human can take; **[X]** outward-facing or
third-party.

---

## 0. In flight right now

| # | item | who | blocked on |
|---|---|---|---|
| 0.1 | **#310** — foresight repair 4, ordinal not a clock | M | CI; `ui` re-running after a flake |
| 0.2 | **#311** — Promise Theory reading of Invariants 6 and 9 | M | CI |
| 0.3 | **#312** — SPEC §7b, the two reporting disciplines | M | CI |
| 0.4 | **#313** — stale-pointer sweep (step 3, the scale row) | M | CI |
| 0.5 | **`stage1/peer-signal-medium`** — pushed, no PR, sections 3-4 red | M | item 1.1 |

`main` has branch protection with **`strict: true`**, so every merge puts the
others behind and forces a fresh ~20-minute cycle each. Five docs-only changes
therefore cost an hour of wall clock in sequence. **Worth revisiting whether
`strict` earns its keep on a repository where most pull requests touch only
Markdown** — that is a decision [D], not a task.

---

## 1. Immediate engineering — bounded, and the model can do all of it

| # | item | who | blocked on |
|---|---|---|---|
| 1.1 | **Why `send_remote_signal` does not deliver.** Stage 1's receiving half, cost accounting, idempotence and control all verify; remote delivery does not. Every failure path in the host's implementation is `tracing::info!` then `return` under *"timeouts and errors are ignored"*, so the default log level hides it. Diagnostic: both nodes at `RUST_LOG=info` | M | nothing |
| 1.2 | **The scale run above twelve.** `scale-dht.mjs` exists, `EPI_SCALE_NODES` parameterises it, twelve all claimed a FULL arc. The figure wanted is **the N at which an arc first narrows**. ~95-98 MB and ~8% of a core per conductor, so 48 is ~4.7 GB and ~4 cores against 11 GB and 12 cores free | M | **a go-ahead** [D] — unattended conductors on the human's machine is not the model's call |
| 1.3 | **The `ui` flake, which is probably not flake.** Four failures on 2026-10-22 across `taxonomy-ui` and `graph-ui`, every one a `waitForSelector` timeout of the shape *write something, then wait for it to render*, every one green on re-run. The two-house run established that transit is sub-second and **local integration under contention** is the cost, which is exactly what a loaded runner has. Wanted: a counted record beside the harnesses the way the `network` pass rate is kept, and the wait declaring its own mode per §7b.2 | M | nothing |
| 1.4 | **Two desktop installs talking to each other.** Closes the clause still open in release step 3 — *"against that build"* — since both ends of every 2026-10-22 crossing were `hc sandbox` conductors. The relay path is measured; the packaging is not | H | two machines with `v0.2.0` installed |
| 1.5 | **Record the 426.0s `partition-rejoin` occurrence.** It failed again on 2026-10-22 with a 426.0s crossing and an `INCONCLUSIVE` divergence verdict, and nodeB's census carried `All agents with overlapping arcs are on timeout=265`. §3 keeps a **running count** of these occurrences precisely so a premise going stale is visible as a rate; this one was observed and never written down | M | nothing |
| 1.6 | **The parked gate.** Branch `chore/gate-probabilistic-setup`, no commits, to gate probabilistic setup searches in `ordering-policy.mjs` (three sites, lines 244/266/310) | M | nothing; nothing is lost by it sitting there |

---

## 2. The autopoiesis staging — in dependency order, not preference order

The ordering is forced, not chosen. Stage 1 exists to make Stage 2 affordable;
Stage 2 is the only item that decides whether **operational closure** is true
rather than aspirational; Stage 3 is the first *consequence*; 4 and 5 are
downstream of both.

| # | item | who | blocked on |
|---|---|---|---|
| 2.1 | **Stage 1 — the medium.** Typed ephemeral peer signals. One entry to open a channel, zero per signal. Coordinator-only and **proven not to fork**: the DNA hash was byte-identical before and after | M | item 1.1 |
| 2.2 | **Stage 2 — proprioception.** `get_local_tension`: one read bundling closure deficit, ordering ambiguity, friction headroom, conductance decay, arc width. Then dispositions respond to it. **This is the stage that matters.** Luhmann's criterion for an autopoietic system of communications is that a communication be produced by prior communications rather than by the environment; right now every claim is produced by a human or an externally-triggered agent, and this is the single change that makes the graph's own state the proximate cause of the next write | M | 2.1 |
| 2.3 | **Stage 3 — standing / apoptosis.** Standing as a function of causal distance, computed at read time, writing nothing. Primitives exist (`order_records`, `past_cone`, `get_grounding_path`). Needs a harness with injections, since a standing rule that cannot go red is this repository's recurring failure | M | **item 3.1, the threshold** |
| 2.4 | **Stage 4 — secretion.** Dispositions propose `CritiqueSpecies`; `get_species_adoption` read a second time **at a causal distance from the first**, which is the only way exploration becomes distinguishable from degradation. The swarm currently passes `species: null` (`scripts/swarm/run-swarm.mjs:250`) | M | 2.2; and note item 1.3 sits on this exact path |
| 2.5 | **Stage 5 — microbiome.** Membranes read each other's published policies and import foreign critiques. `federation/` currently contains **zero** references to `ConductancePolicy` or `AttestationPolicy` | M | 2.1 and 2.4 |

---

## 3. Research questions — no code until these have answers

| # | question | who | why it is open |
|---|---|---|---|
| 3.1 | **What sets the atrophy threshold?** Quantitative Promise Theory: a threshold turning a signal into a decision **is itself a promise and needs an agent behind it** — the argument that retired `CONDUCTANCE_HALF_LIFE_SECS` as a universal constant with no promiser. Two candidates: a **per-membrane declared promise**, or a threshold **derived** so nobody chose it. **This, not the 6-versus-9 tension, is what Invariant 9 is waiting on** | D | genuinely a decision: the first is a governance choice, the second a research result |
| 3.2 | **Is there a derived measure that does not punish exploration?** Project 89's dead-head criterion has exactly the right *form* — `τ = 0.96/√d`, local to the component, zero parameters, validated against ablation ground truth at 95-100% across six models. But it equates low alignment with the receiver's state with death, and in a discourse graph the orthogonal contribution is sometimes the only valuable one. **The swarm deliberately runs an exploring minority that this criterion would classify as dead on sight.** Candidates to replace alignment: grounding density, citation closure, assessment reachability over causal distance | M | 3.1's second branch depends on it |
| 3.3 | **Why was rejoin round 1 slower than round 3, from a *shorter* outage?** Round 3 self-recovered in 687-692s from 884s offline; round 1 was still dry at 905s from 861s offline, then crossed 65s after a third node joined. Recovery scales with absence in both clean runs, but round 1 is outside that. **The `Unsolicited Accept` hypothesis is dead** — it coincided to the second with round 2's recovery and failed to recur at round 3's | M | a fourth round, or a reading of kitsune2's gossip scheduling |
| 3.4 | **Can a metabolic budget exist without being Invariant 1's leaderboard?** The mutual-credit ledger was built, verified and **removed** — `docs/metabolic-biosignalling-currency-brief.md`, 1,020 lines — and reason 3 was that `get_credit_balance` was a canonical per-agent scalar over an enumerable agent set. The escape route the brief itself names: `AttestationPolicy` survives because **its answers are caller-scoped and legitimately differ between observers**. So a budget can exist only **per-reader** — my budget for you, under my policy — and never as a number the protocol asserts about you. Without that constraint settled first, building it is a re-run of a deletion | D | the constraint is clear; whether to build on it is not |
| 3.5 | **Observer diversity is unverifiable, and it is one problem wearing two costumes.** Ten observer identities may be one actor; and if every observer runs one model, the exploring minority is one mind in different hats. **The swarm has an accidental defence**: dispositions are *mechanical*, every rule a property of auditable data, so the variation does not come from the model. **Observers-as-entries would throw that defence away**, since the thing being selected becomes a prompt | D | a cost to price before adopting observers-as-entries, not a bug to fix |
| 3.6 | **Does anything actually depend on Andras's store shipping?** A prior session recorded a *"Phase 8 — waiting on Andras' CAS shipping"*. **"Phase 8", "CAS" and "content-addressable" appear nowhere in README, READINESS or SPEC.** After §5.22's repair 4 there is now a plausible real dependency — the ordinal anchor needs closed versions published into the DHT — so if something is blocked, it needs a row | D | undocumented; the first task is deciding whether it is real |

---

## 4. Behind one integrity fork — accumulate, then bump once

Every edit to the integrity zome forks the network, additive changes included,
so these batch into a single `protocol_version` bump rather than five. **Stages
1 to 3 need no fork at all**, which is why they come first.

| # | item | who | blocked on |
|---|---|---|---|
| 4.1 | **The foresight ordinal anchor.** `PreRegistration.reveal_deadline` changes type to a position in a declared order; `Revelation` gains an association; `Membrane` gains a declared notary key. Validation then checks shape only — the association resolves, its author is the declared notary, its counter precedes the deadline's. **Not adopted** — the 2026-10-19 decision stands, since no surface grants this timestamp authority — but the reopen order changed: repair 3 first because it is free, then **repair 4**, and countersigning only if an ordinal anchor is unavailable | D | the answers to the three questions sent to Andras: is a closed version citable by value and **signed**; what is the closure cadence; does a node learn which version its request landed in |
| 4.2 | **Observers as entries**, if adopted — prompts, heuristics and thresholds as signed entries, so selection acts on the agents. Contrary to one claim on file, this **is** a new entry type and therefore does fork | D | 3.5's cost, priced |
| 4.3 | **Species provenance and metabolic policy fields**, if Stage 4 and a budget are adopted | M | 2.4, 3.4 |

---

## 5. Adopted from Veritas (Project 89) — cheap, and partly landed

| # | item | who | blocked on |
|---|---|---|---|
| 5.1 | **SPEC §7b, the two disciplines** — *grounded or silent, and counted*; *every read declares the mode it ran in* | M | in #312 |
| 5.2 | **Apply 7b.1 to an ingestion path.** The discipline's point is that automated inflow becomes safe to switch on exactly when its rejects are counted. Nothing ingests yet, so the rule currently binds nothing | M | a decision to build ingestion at all [D] |
| 5.3 | **A typed source-ownership class on `Evidence`**, applied bloc-agnostically — independent / public-broadcaster / state-media / state-official. `Evidence` currently carries only `source_url` and a free `EvidenceType`. **This is expressiveness without ranking**: a type, not a score, and the symmetry is what stops it being a politics | M | an integrity change, so §4's bump |
| 5.4 | **Divergence-by-perspective-class as a read.** Veritas does not adjudicate; it surfaces how the same event is told to different audiences. That is Invariant 2 and Invariant 10 implemented as a feature rather than a slogan, and the strongest evidence seen that *"creates conditions for truth to resonate"* is buildable | M | 5.3 |

**Do not import the surrounding cosmology.** Project 89's broader framing
includes deriving the fine structure constant from a lattice learning rule at
1.5 ppb with zero free parameters — an extraordinary claim, treated here as
unvalidated. The disciplines above and the dead-head *form* stand on their own
and do not depend on it.

---

## 6. Interaction design — four unsurfaced reads

Each is deliberately unsurfaced **with its reason recorded**, and each needs a
design decision rather than wiring. Verified 2026-10-22 against `mobile-ui/src`:
all four return zero hits, while `get_discourse_health` returns three — the
read is wired, the publish is not.

| # | item | who | blocked on |
|---|---|---|---|
| 6.1 | `critiques_unseen_by` — the honest screen must render `cone_recorded` as prominently as `unseen`, or silence reads as ignorance | D | a design decision |
| 6.2 | `publish_discourse_reading` | D | same |
| 6.3 | the settlement screen | D | same |
| 6.4 | the assessment screen | D | same |

**Item 22's reopen condition is structurally gated on 6.2**, which is a useful
property rather than a coincidence. Both halves are required — *a surface for
readings exists* AND *somebody wants them faster than a person will click* —
and the first is false while 6.2 is unbuilt, so the autonomous-writer question
cannot become live by any other route.

---

## 7. Human, outward-facing, and third-party

| # | item | who | blocked on |
|---|---|---|---|
| 7.1 | **The sybil position.** *"A person standing behind it before inviting a crowd. Explicitly not technical."* The question is whether to vouch for this publicly knowing a modified coordinator stays on the network and the integrity zome is the only trust boundary | D | nothing but the decision |
| 7.2 | **An outside audit — none has been done.** Distinct from the internal review of the *zomes* on 2026-10-11, which found five defects of one shape, closed all five, bound eighteen link types, watched both halves of all eighteen rules fail across six injections, and runs 101 checks on every push as a required check. **That part is strong and done** | X | procurement |
| 7.3 | **Four services with no security review at all** — `bridge/`, `gateway/`, `federation/`, `mcp-server/`. None is part of what an installing user runs, so they are outside a tester's attack surface and **inside it for anyone who deploys them** | M or X | scope decision: review, or state plainly that they are not for deployment |
| 7.4 | **Release step 4 — invite ten people on desktop.** And there is now a number to tell them rather than a shrug: seconds between peers both up, but **five to twelve minutes for somebody who closed their laptop and came back**, growing with the absence. That is what ten testers will report as "it's broken" | H | 1.4 first; 7.1 arguably first |
| 7.5 | **Release step 5 — a per-claim delivery indicator.** Explicitly for the *second* round, not the first. Needs a zome surface that does not exist, so it is a protocol change rather than a UI task | M | §4's bump |
| 7.6 | **Send the drafted reply to Andras.** Drafted 2026-10-22 and **not sent**. It reports that his reframing produced a spec change, asks the three questions item 4.1 is blocked on, and narrows the claim that a shared order might be enough for shared judgement — inclusion is binary and self-evident to whoever asked, which is why happened-before is free; judgement is neither | H | nothing but sending it |
| 7.7 | **The HDK documentation bug, upstream.** `hdk-0.7.0/src/p2p.rs:134` gives the required receiving signature as `fn recv_remote_signal(signal: ExternIO)`. That fails every delivery: the host passes the payload's bytes *as* the extern input, so the macro tries to deserialize a map into a byte array, the receiver logs `Deserialize([129, 169, "Saturated"…])`, and the sender — which cannot see errors at all — sees nothing. Reproduced and worked around here | X | **the human's account and call; the model does not file upstream** |
| 7.8 | **The returning-node asymmetry, upstream.** A known peer returning behaves far worse than a stranger arriving — reproducibly, with a fresh node getting the full history in ~15s while a returning one had nothing after 905s. Plausibly worth reporting | X | **the human's account and the human's call; the model does not file upstream** |

---

## What this list does not contain

Anything whose blocker could not be stated. Two things were considered and left
out for that reason: a "speed and scalability" item, which `READINESS` already
says comes after real reports from step 4 and therefore has step 4 as its
blocker rather than a technical one; and a general "make it autopoietic" item,
which is §2 with the ambition removed — **the honest target is operational
closure in Varela's weaker sense, or Luhmann's autopoiesis of communications,
and not biological autopoiesis.** Varela himself declined to extend the term to
social systems. Self-production of the boundary and self-repair both stay out of
reach: a person still installs the hApp, and a system that cannot delete cannot
heal, only accrete and lose standing. **Coral reef rather than cell** — durable
accretion with living tissue on the surface — is the better description and the
better story.
