# The Epistemic Resonance Protocol
## A General Theory of Dimensional Preservation Across Digital-Physical Boundaries
### Architecture, Implementation & Operating Manual

---

**Version:** 0.1.0  
**Date:** 2026-08-25  
**Status:** Design Complete — HRR Compressor Deferred  
**License:** TBD (recommend: AGPL-3.0 for protocol layer)

---

## Table of Contents

1. [What This Is](#1-what-this-is)
2. [The Five Pillars](#2-the-five-pillars)
3. [The Architecture Stack](#3-the-architecture-stack)
4. [How It All Connects](#4-how-it-all-connects)
5. [Code Walkthrough](#5-code-walkthrough)
6. [Build & Run Instructions](#6-build--run-instructions)
7. [The Theory in Plain Language](#7-the-theory-in-plain-language)
8. [Glossary](#8-glossary)
9. [Roadmap](#9-roadmap)

---

## 1. What This Is

This is not a social media app. This is not a blockchain project. This is an **epistemic nervous system** — a distributed computing architecture designed to preserve the full dimensionality of human knowledge on its own substrate (the DHT), and to treat flat external platforms like Twitter honestly: as a one-way funnel *into* that substrate, not a channel that can carry the substrate's full dimensionality back out. Content flowing *into* the DHT from Twitter is deliberately kept lightweight (see `Mew`, §5.2) so its flatness doesn't leak into the graph. Content flowing *out* to Twitter is necessarily lossy — a 200-character excerpt plus a link back to the full record — because no 280-character platform can carry a typed critique graph. The protocol's job is to make sure that loss is legible (the DHT always retains the full original) and one-directional (Twitter never becomes a second source of truth), not to pretend the loss doesn't happen.

### The Problem It Solves

Current platforms (Twitter, Reddit, Instagram) flatten human knowledge into 1D metrics:
- A 10-year rehabilitation protocol → 280 characters → engagement metric → "trending"
- Each hop is lossy compression. By the time it reaches the receiver, the information is gone.
- Moderation is algorithmic — AI that doesn't understand context deletes heterodox but true insights.
- Reputation systems (karma, followers) judge the speaker, not the statement.

### The Solution

A protocol that:
1. **Preserves full context** — every claim carries its history, its critiques, its evidence
2. **Types all critiques** — experiential, methodological, logical, phenomenological — never flattening to a like/dislike
3. **Makes agents sovereign** — each runs their own node, makes their own promises, controls their own data
4. **Bridges without flattening** — Twitter is raw stimulus; the DHT is cortical processing; the bridge is a transducer, not a pipe
5. **Evolves like biology** — domains are membranes, critique types speciate, dead knowledge atrophies naturally

---

## 2. The Five Pillars

### 2.1 Holochain — The Substrate

**What it is:** An agent-centric, sharded distributed hash table (DHT) where each agent has their own immutable source chain.

**Why it matters:**
- No global blockchain — each agent is a sovereign cell with its own membrane
- Source chains are **worldlines** — a complete, cryptographically signed history of everything that agent has ever said
- The DHT is the **extracellular matrix** — shared space where agents interact without losing sovereignty
- Gossip protocol is **wave propagation** — information ripples through the network organically

**Key concept from CEPTR:** `call_zome` is not a function call. It is a **ligand-receptor interaction** — one agent sends a signal; the zome's validation rules are the binding site; if the signal matches, the membrane opens and the cascade begins.

**In this design:**
- `Claim`, `Critique`, `Evidence` are entry types (excitations of the field)
- `LinkTypes` are synaptic connections (couplings between nodes)
- `Source chain` is the agent's worldline through semantic spacetime
- `Validation rules` are the physics — what can exist, what cannot

### 2.2 Semantic Spacetime (Mark Burgess + SSTorytime) — The Geometry

**What it is:** A framework where autonomous agents make **voluntary promises** that create a geometry — a curved manifold where "distance" between claims is determined by promise compatibility, not physical proximity.

**Why it matters:**
- In traditional systems, time is a global clock and space is a flat feed
- In Semantic Spacetime, time is **causal ordering of promises** and space is **domain/modality compatibility**
- A claim in `LumbarRehab` with `Experiential` modality is at a specific coordinate: `(domain, modality, author, time)`
- Two claims can have identical content but different coordinates — meaning depends on context
- A point in semantic spacetime is an **agent**, not an event: unlike Einstein's spacetime, where a point is an event something happens *at*, semantic spacetime's points are the agents themselves — an atom, a human, and a computer are the same kind of point, just at different scales. Agents are the quanta the geometry is quantized into; nothing smaller than an agent gets its own coordinate.

**SSTorytime** is Mark Burgess' reference implementation — a graph database with N4L (Notes for Learning) as its query language and 3D visualization.

**In this design:**
- `Membrane` entries are regions of shared promise geometry
- `Domain` tags are spatial coordinates
- `CritiqueMode` is the receptor type (which frequency of vibration)
- `WorldlineTrace` is the agent's trajectory through the manifold
- N4L export serializes the DHT graph for SSTorytime visualization

**The no-imposition axiom, resolved:** Promise Theory's actual claim is narrower than "nothing can ever act on an agent against its will" — an agent's behavior is autonomous by construction, so no other agent can literally force an outcome, only issue a promise (including a threatening one) that the target agent then chooses how to respond to. This is why a dictator doesn't formally violate the axiom either: compliance under threat is still a choice, just one with an engineered cost attached. That means "no imposition" cannot, by itself, be the thing that distinguishes this protocol's design from a dictator's — something more specific has to do that work. What actually does it here: nobody can force what content exists on the DHT, force a claim to disappear, or force a reader's interpretation of it (Invariants #1, #2, #6 — Appendix A). The protocol can only shape which choices are cheap or expensive (SWO temporal friction, §2.3; attestation tenure, §2.6), never which choice an agent is permitted to make. A metabolic-cost account-creation scheme was considered early in this design and rejected for exactly this reason — see §2.3's sybil-resistance discussion.

### 2.3 SWO (Stacc) — The Economic Topology

**What it is:** An Arbitrum Orbit L3 where each new L4 chain is launched via **burn-to-deploy**. Bridge latency between chains acts as a natural rebalancer — spreads persist because cross-chain arbitrage is non-atomic.

**Key insight:** Stacc didn't fight physics with code. He **used physics**:
- Bridge latency = temporal separation that preserves information spreads
- Burn-to-deploy = metabolic cost that makes launch events irreversible and meaningful
- Fragmentation = the feature, not the bug — thin pools create high-resolution price fields

**In this design:**
- The **Twitter bridge** uses temporal separation (not instant sync) to preserve epistemic spreads
- A tweet doesn't instantly become a validated critique — the delay is the **binding time** of the receptor
- The **cost to create a domain** (attention/effort, not tokens) is the metabolic cost that filters noise
- **Mesh topology** between domains (cross-domain critique links) creates the same multi-pool structure
- **SynapticLink and Critique creation are both rate-limited per agent** (§5.2–5.3, "SWO temporal friction") — a rolling-window cap on how many of each one agent can create, enforced both as a fast coordinator-side pre-check and, more importantly, as real DHT validation via `must_get_agent_activity` in the integrity zome. That DHT-side check bounds its activity walk using a **WorldlineTrace checkpoint** the validator discovers independently on the author's own chain, rather than an arbitrary fixed depth — an agent who checkpoints regularly gets a precisely-bounded (and cheaper) validation walk; one who never does falls back to a flat safety cap. This is the first concrete, implemented instance of "cost, not score": it makes mass-produced critique/adoption links slow rather than gating them by identity or reputation.
  **What this is not:** temporal friction bounds *per-identity throughput*, and nothing more. It does not raise the cost of creating a new agent identity at all — `SYNAPTIC_LINK_MAX_PER_WINDOW = 20` means one agent gets 20 links/hour, but 10,000 agents get 200,000 links/hour between them, with no sybil-specific mechanism slowing that down. Calling this "what defends the protocol against sybil farming" (an earlier draft of this document did) was an overclaim worth correcting explicitly, in the same spirit as this project's other VERIFICATION STATUS caveats: this is a **spam defense**, not **sybil resistance**, and the two are different properties. **Sybil resistance is currently open** — no mechanism in this codebase raises the cost of identity creation itself. The mitigation available today is containment at the read layer: `get_effective_conductance` (§2.6) computes each `SynapticLink`'s decay- and reinforcement-weighted strength at read time, so a flood of un-reinforced sybil links measurably fades toward zero without needing to be deleted or blocked — but it's not automatically applied everywhere; a caller has to actually call it and choose what to do with the result. A caller who wants to discount unattested activity more directly now has `AttestationPolicy` (§2.6): an explicit, **opt-in** parameter to `get_discourse_health`, never a protocol default. A protocol-level, hardcoded attested/unattested filter was considered and deliberately not built — applied automatically, that would itself be a canonical, comparative one-bit reputation signal, which Invariant #1 rules out. `AttestationPolicy` threads that needle by staying entirely in the caller's hands: omit it and nothing changes from before it existed; supply it and you're stating your own trust policy, not asking the protocol to compute one for you (see the Invariant #1 discussion in Appendix A). `AttestationGrant` (§2.6) sharpens this one further step: an agent's *ability to vouch* for someone else now costs something real — a tenure bar (you must have belonged to the membrane a while) and a rate limit (only so many grants per window), both enforced by DHT validation, not just advisory. This still doesn't touch the cost of *creating* an identity — a fresh sybil can still be created for free — but it does mean a fresh sybil's own vouching carries no weight until it has been a member long enough, which raises the cost of a sybil farm's puppets being useful as attesters, even though the puppets themselves remain free to create.
  **The honest ceiling:** global sybil resistance requires a global scarce resource, which an agent-centric DHT deliberately doesn't have — that's the tradeoff this architecture makes on purpose, not an oversight. What *is* available for free is local sybil resistance: a membrane with a genuine founding population that actually resonates with new claims (via real `SynapticLink`s from real, established agents) is resistant within itself, simply because a membrane full of self-attested sybils has no links from anyone outside it — the attack succeeds at creating entries and returns nothing anyone else will ever traverse to. That's the correct outcome, and it falls out of the topology (Invariant #2) rather than needing to be separately engineered.
  **Why identity creation was never made to cost something, on purpose:** an earlier design direction considered exactly the obvious fix — a metabolic token cost to spin up a new agent identity, mirroring SWO's own burn-to-deploy pattern above. It was evaluated and deliberately rejected, not for infeasibility but because charging for identity would impose a real cost as the price of an agent simply existing — the same imposition the no-imposition axiom rules out (§2.2's "no-imposition axiom, resolved" note), for reasons that have nothing to do with tokens specifically. The friction mechanisms that did ship (SWO temporal friction above, attestation tenure in §2.6) all raise the cost of a specific *act* an already-existing agent chooses to take, never the cost of the agent coming into being at all — that distinction is the actual boundary this design holds to, not a placeholder for "not implemented yet."

### 2.4 Correlative Witness (inspired by Mattereum) — The Binding Layer

**What it is:** A pattern *inspired by* Vinay Gupta's Ricardian contracts — legal agreements that are simultaneously human-readable and machine-executable, binding physical assets to digital tokens with enforceable terms on both sides.

**Important distinction:** Our bridge is **not** a Ricardian contract in the strict sense — there's no human-signed agreement, no legal enforceability, and no obligation on Twitter's part. What we borrow from Mattereum is the *shape* of the idea: a **binding layer** that preserves the irreducible complexity of the thing being bridged, rather than flattening it. We call our version a **correlative witness** — a deliberately more modest, more accurate name for what the bridge actually does.

**In this design:**
- The **bridge service** creates a correlative witness between Twitter and Holochain
- It doesn't convert the tweet into a DHT entry — it creates a **correlation**, recorded durably on the Holochain side
- The witness is **asymmetric**: Holochain remembers the correlation permanently; Twitter has no awareness of or obligation toward it, and can delete the tweet at any time
- Even if Twitter deletes the tweet, the DHT preserves the `BridgeRecord` — proof the correlation existed, not an enforceable claim that it must persist
- The bridge preserves **provenance** — who said what, when, in what context

### 2.5 OpenZoo (HRR) — The Holographic Index

**What it is:** Holographic Reduced Representations (Plate 1995) — a mathematical technique for binding vectors via circular convolution, creating fixed-size superpositions that can be queried via inverse convolution.

**Key insight:** The brain doesn't store memories as discrete files. It stores them as **distributed superpositions** across neural populations. HRR mimics this.

**In this design:**
- `WorldlineTrace` has **hooks** for HRR (`trace_payload`, `binding_key`) — currently `None`
- When implemented, each agent's source chain will be compressed into a **holographic vector**
- Peers can **unbind** this vector to find relevant time periods without traversing the full chain
- The trace works **today** as a simple period-boundary index (table of contents)
- HRR is an **optimization**, not a requirement

**Critical constraint:** HRR runs **locally** on each agent's machine. Never as a centralized service. The DHT remains the single source of truth.

**What the oracle is permitted to be:** a receiver, not a truth engine. A tuner resonates with signal at a given wavelength; it does not decide what's true. **HRR is the index — it sorts retrieval. The DHT is the store — it preserves payload. The trace never touches what a claim says.** This is why HRR being deferred (§9 Roadmap, Phase 3) costs this design nothing structurally: the role was always "find relevant periods faster," never "adjudicate content" — the exact distinction that kept the EVA-era version's math from ever being load-bearing on anything the protocol actually claims is true.

**Two distinct HRR use cases, not one — worldline binding vs. neighborhood binding:** everything above describes *worldline binding* — one agent's source chain compressed into a single vector, indexed by time, answering "when did this agent say things." That's the only shape Phase 3 (§9) currently commits to. A second, independent use case, surfaced in outside review of this design, is *neighborhood binding*: bind a single claim's local neighborhood — the claim itself, its evidence chain, its critique stack — into its own corpus, queried associatively rather than temporally, answering "what's near this claim" instead of "when did this agent speak." Both are legitimate applications of the same HRR math (Plate 1995 circular convolution/unbinding), but they compress different axes of the graph and neither implies the other. Nothing in this document currently commits to building neighborhood binding — see §9, Phase 3 — and it should be treated as its own roadmap item, not an implicit consequence of worldline binding shipping.

**The constraint neighborhood binding must satisfy, stated the same way §2.6 states testable constraints:**

| HRR concept | Constraint it implies | How to check it |
|---|---|---|
| Neighborhood binding is a *reading lens*, never a second record | A holographic summary is a pointer into the DHT, not a replacement for it | Every value returned by an HRR-recall function must carry the source `EntryHash`/`ActionHash` list it was unbound from; a recall result with no such list is a protocol violation, not a convenience shortcut |
| Retrieval is lossy by construction (HRR always is) | Approximate recall must never be presented as, or substitute for, an exact provenance query | Any caller-facing API that returns an HRR-recalled slice must be named and documented distinctly from `get_grounding_path`/`export_to_n4l` (§5.3), which remain the only exact, lossless reads |
| Self-correlated sybil clusters don't resonate outward | A probe over real, independently-created bindings should measurably fail to recall a claim whose only reinforcement comes from within its own sybil ring | Not yet testable — this is a predicted consequence of combining `get_effective_conductance`'s decay-without-rebinding (§2.6) with HRR's interference-based recall, not a built or verified mechanism; record it here as a design hypothesis to confirm once neighborhood binding exists, not as a current guarantee |

This keeps HRR consistent with Invariant #10 (Appendix A) for exactly the reason the existing text above already gives for worldline binding: HRR here is asked to be a receiver tuned to signal already present in the graph, never an engine that adjudicates what's true. A sybil ring that only cites itself is, in interference-memory terms, a self-correlated cluster no outside probe resonates with — the same fact §2.3 already states in graph language ("a membrane full of self-attested sybils has no links from anyone outside it"). Neighborhood binding doesn't add a new sybil defense; if built to the constraint above, it inherits the one the topology already provides.

**"Why compress at all — just feed max context" doesn't obsolete this, because it answers a different audience.** A natural objection to neighborhood binding: modern LLM context windows are large and growing; why build a retrieval lens instead of just handing an agent the whole relevant slice of the graph directly? That objection answers the *machine*-retrieval case, and even there only partly — a context window makes ingesting everything cheap, it doesn't make irrelevant content harmless once ingested, since a query can still be pulled toward noise sitting in that context whether or not compression was used to get it there. But the harder case this section exists for was never about machine context size at all — it's Dom's original question in the design conversation this repo tracks: "what would the spread of evidence look like to a normal person if they clicked on it? Would it be overwhelming?" A human reader does not get a bigger context window as compute gets cheaper. Neighborhood binding's actual job is presenting a bounded, relevant slice to *that* reader, and "just feed max context" has no answer to that case at all, regardless of how large machine context windows get.

**The decay argument for ignoring noise ("it'll never resonate, so don't bother filtering it") has a timing gap worth stating plainly.** `get_effective_conductance` (below) makes old, un-reinforced noise fade toward irrelevance without needing active filtering — but decay is a function of elapsed time, and a `SynapticLink` starts at its full initial conductance the moment it's created. Freshly created noise hasn't decayed yet by definition, so "it'll never hit" is a claim that becomes true over the link's half-life, not one that's true immediately. Nothing in this design currently accounts for that window — a reader (or a neighborhood-binding recall) querying shortly after a noise link is created can still retrieve it at close to full weight. This isn't a flaw unique to HRR; it's the same gap the decay-without-rebinding mechanism already has on its own, just newly relevant here because neighborhood binding would inherit it.

### 2.6 Fractal Impedance Matching — The Cross-Scale Rationale

**What it is:** RF engineering's answer to coupling two systems of very different scale without destructive reflection: an impedance-matching network (or a self-similar, fractal antenna geometry) so a signal crosses a large impedance ratio in graduated steps instead of one lossy jump. Deliberately *not* named after any specific named device — "impedance matching across scale boundaries" is the claim; nothing more specific than that is asserted, on purpose (see the naming note below).

**Why it's here:** an earlier design document for this project framed the whole protocol this way — Twitter's low-dimensional signal and the DHT's high-dimensional graph as two systems at wildly different "impedance," coupled through staged transduction rather than direct conversion. That framing was evaluated against this codebase and kept, but only for what it actually earns: **naming and topology that were already implemented, not new mathematics.** The EVA-era version's failure mode was committing schema to physics the implementation never actually computed (`f64`-valued "spectral distance," a versor-power scheme that didn't reconcile with its own core equation) — dressing arithmetic in vocabulary it hadn't earned. This section exists specifically to not repeat that: every row below is a mechanism that's already implemented, gets a name it didn't have before, and nothing is added that isn't real.

**What's already built, now named for what it is:**

| Impedance-matching concept | Already implemented as | Testable constraint it implies |
|---|---|---|
| Staged transduction (no direct coupling across a large impedance ratio) | `Mew` → `promote_mew_to_claim` — inbound content lands in a deliberately lightweight staging type and only reaches the `Claim` graph via an explicit, agent-initiated act | Any future external bridge (Mastodon, RSS, email) must land in a `Mew`-equivalent staging type, never write directly to `Claim` |
| Impedance boundary | `Membrane` — domain sovereignty, `required_promises` as the matching condition, now also gated on the creator's own `Constitution` (§9 roadmap) | A membrane's `required_promises` is the explicit statement of what must match to cross into it |
| Self-similar branching | `CritiqueSpecies` + `SpeciesToParent` — a recursive taxonomy with no privileged root | New species may attach to any existing one; the taxonomy has no fixed depth |
| Scale-invariant critique | `Critique.target: AnyLinkableHash` (was `target_claim: EntryHash`, Claim-only) — a Critique can target a Claim, another Critique, a Constitution, a Membrane, or a CritiqueSpecies; see `CritiqueTargetType` | The critique operation is identical at every level of the graph — critique-of-critique, or of the promises judging a claim, is a real, validated, N4L-exportable edge, not a special case |
| Conductance that actually moves | `LinkTypes::Reinforcement` + `get_effective_conductance` — see below | A `SynapticLink` nobody reinforces measurably decays; one somebody keeps reinforcing measurably doesn't |
| Subjective trust, not protocol reputation | `AttestationPolicy` — an opt-in parameter to `get_discourse_health`, never a default — see below | Two callers with different `AttestationPolicy`s can get different discourse-health numbers for the same domain; the protocol itself asserts neither is more correct |
| The right to confer costs something | `LinkTypes::AttestationGrant` + `grant_attestation` — tenure- and budget-gated vouching, DHT-enforced — see below | An agent who joined a membrane a minute ago cannot grant attestation within it, no matter how many times they try |
| Aggregates anchored to a real boundary, not a free-text label | `GetDiscourseHealthPayload.membrane: AnyDhtHash` (was `domain: String`) — see below | `get_discourse_health` can only be asked about a domain some real `Membrane` actually founded, never an arbitrary string nobody committed to |
| Ground as termination | `get_grounding_path` — see below | A claim's support chain either reaches real Evidence or it doesn't; the answer is visible on request, and nothing about creating, critiquing, or linking an ungrounded claim is blocked by it |
| The mismatch recorded as structure | `BridgeRecord.carried_fields`/`dropped_fields`/`original_length`/`excerpt_length` — see below | Given a `BridgeRecord`, a reader can see exactly which named fields of the original Mew/Claim made it into the tweet and which didn't — not just that some unspecified truncation happened |

**Scale-invariant critique, how it actually works:** `validate_critique` independently re-derives the target's real entry type from the DHT (the same probe-by-type pattern `bridge_link_type_for` uses) and rejects a Critique whose `target_type` field doesn't match reality — so the discriminator can't be spoofed, the same way `AgentToMembrane`'s tag-encoded agent can't be. The discriminator exists at all only because `ToN4L::to_n4l` is a pure function with no DHT access: it can't call `get()` to discover what `self.target` actually is, so `n4l_prefix_for_target_type` picks the correct alias prefix (`"claim"`, `"critique"`, `"constitution"`, `"membrane"`, or `"critiquespecies"`) from the validated field instead. `LinkTypes::TargetToCritique` (was `ClaimToCritique`) is one link type reused across all five target kinds — Holochain's link model doesn't care what entry type a link's base is, so this didn't need five separate link-type variants. `get_critiques_for_claim` was renamed `get_critiques_for` to match. `get_discourse_health`'s critique counting still only follows direct critiques of a claim, not transitively through critique-of-critique chains — a deliberate scope limit, not an oversight.

**Conductance atrophy, how it actually works:** the `f32` conductance written into a `SynapticLink`'s `LinkTag` at creation is now explicitly its *initial* value only — `LinkTag`s can't be mutated, so it never changes. What actually matters is `get_effective_conductance`, computed fresh on every call from two decaying contributions: the base conductance decaying since the link's own creation, plus one decaying contribution per `Reinforcement` link (a new link type — an agent calling `reinforce_synaptic_link` on a `SynapticLink`'s own `ActionHash` to record "I resonate with this," found via the new `find_synaptic_link` lookup, since `create_synaptic_link`'s return value isn't surfaced through `create_critique`). Both terms use `2^(-elapsed / half_life)` (a 30-day half-life by default) — exactly 1.0 at the moment of the event, exactly 0.5 one half-life later, and so on — so a reinforcement itself fades in significance the same way the base does, rather than permanently propping a link up. `Reinforcement` gets its own SWO temporal friction budget (separate from `SynapticLink`'s, since reinforcing is a cheaper, more casual act), enforced both coordinator-side and — the real, unbypassable layer — in `validate_create_link`, which also confirms a `Reinforcement`'s target is the reinforcing agent themselves (never claimed on someone else's behalf) and that its base really is a `SynapticLink` creation, not an arbitrary hash. This is the honest resolution to this project's own sybil-farming discussion: it's containment, not prevention — nothing here raises the cost of *creating* a `SynapticLink`, only the cost of one *staying load-bearing*. A flood of un-reinforced links stays fully present in the record (Invariants #6 and #9 — nothing deleted, atrophy required) but decays toward zero in any conductance-weighted read. Nine unit tests cover the decay math directly: the half-life lands exactly where claimed, decay is monotonic, un-reinforced links keep shrinking without plateauing, a recent reinforcement measurably lifts a decayed link, and an old reinforcement matters less than a recent one. Wiring `get_effective_conductance` into `get_discourse_health` or other read paths as an actual filter/sort is a further step, not done in this pass — this delivers the mechanism itself, verified in isolation. **A timing gap worth stating plainly:** decay is a function of elapsed time, and a link starts at full initial conductance the moment it's created — "noise fades so it's safe to ignore" only becomes true over the half-life, not immediately. A freshly created noise link can still be retrieved at close to full weight by anything querying shortly after it appears; nothing here accounts for that window.

**AttestationPolicy, how it actually works:** agent A "directly attests" agent B if either (a) A has created a `SynapticLink` connecting to one of B's Claims — the same `SynapticLink` `create_critique` already makes for every critique, so this reads existing links rather than needing any new DHT writes — or (b) A has created an `AttestationGrant` for B within the membrane the check is scoped to (see below). `AttestationPolicy { require_attestation_from: Option<Vec<AgentPubKey>>, min_attestations: usize, max_attestation_depth: Option<u8> }` is a genuine, bounded web-of-trust check, not just a membership flag: with `max_attestation_depth > 0`, an attester who isn't in the trusted root set themselves still counts if *they're* attested (by either source) by the root set within one fewer hop — real transitive trust, computed by `count_attestations_pure`, a depth-bounded recursive walk with a cycle guard and a hard node-visit cap (`MAX_ATTESTATION_SEARCH_NODES`), the same "heuristic, not exhaustive" shape as the `WorldlineTrace` checkpoint bounding elsewhere in this codebase. It only ever walks outward from the specific candidate being checked, never across "all agents" — Holochain doesn't offer a way to enumerate that. `require_attestation_from: None` means no restriction at all (any agent's attestation counts, `min_attestations` is the only constraint); omitting the whole policy at the `get_discourse_health` call site (`attestation_policy: None`) skips attestation filtering entirely — the exact old, unfiltered behavior. Seven unit tests cover the walk directly against an in-memory fixture graph: direct attestation, transitive attestation both allowed and blocked by depth, a two-agent mutual-attestation cycle that must terminate rather than loop forever, multiple distinct attesters, and the empty-graph case — that coverage is of `count_attestations_pure` itself, unaffected by adding a second attester source, since the pure walk never cared where its `direct_attesters` closure's answers actually came from.

**AttestationGrant (budget and tenure), how it actually works:** `SynapticLink`-derived attestation is a free side effect of critiquing — nothing stops one agent from critiquing a hundred different newcomers' claims in an hour and having all hundred count as "attested." `AttestationGrant` is a second, deliberately more expensive attestation source that closes that gap for callers who want it: a new `LinkTypes::AttestationGrant` link (a `Membrane`'s `EntryHash` → the candidate agent), created by `grant_attestation`, carrying two real, DHT-validated costs rather than advisory ones. **Tenure:** the granter must reference their own `AgentToMembrane` join action (found via `get_my_membership_action`, or reused from `join_membrane`'s own return value) in the link's tag; `validate_create_link`'s `AttestationGrant` branch independently fetches that exact action via `must_get_valid_record` and checks it really is an `AgentToMembrane` creation, authored by this same granter, based on this same membrane, and old enough — a pure `tenure_satisfied` function does the timing arithmetic, five new unit tests cover it directly. This is the same self-supplied-but-independently-verified shape `assert_expertise`'s `WorldlineTrace` proof already uses: a forged or irrelevant hash simply fails verification, so nothing is gained by lying about it, and it costs one fetch rather than a bounded scan. **Budget:** only `ATTESTATION_GRANT_MAX_PER_WINDOW` (5) grants per `ATTESTATION_GRANT_WINDOW_SECS` (7 days) per granter, enforced both as a coordinator-side pre-check and, unbypassably, via the same checkpoint-bounded friction machinery every other SWO check in this codebase uses — deliberately a raw grant count, not a distinct-candidate count, since re-granting the same candidate twice just wastes some of the granter's own budget rather than opening a gap. `direct_attesters_of` unions this source with the `SynapticLink`-derived one, scoped to whichever membrane the caller's `AttestationPolicy` check names — see below.

**Membrane-scoped discourse health, how it actually works:** `GetDiscourseHealthPayload.domain: String` — free text, checkable against nothing — became `membrane: AnyDhtHash`. `get_discourse_health` now resolves the real `Membrane` entry first and reads its own `domain` field for the claims query, so the aggregate is anchored to a domain some agent actually founded (with `required_promises` and a `Constitution` behind it — see the membrane row above) rather than a string anyone could type into the old field with nothing behind it. This is also what makes `AttestationGrant` checkable at all: `is_agent_attested` and `IsAgentAttestedPayload` gained the same `membrane: AnyDhtHash` field, resolved once and threaded into `direct_attesters_of` as the scope for its `AttestationGrant` lookup — without a membrane in hand there would be no way to know which membrane's grants to even look for, since `AttestationGrant` links are based from the membrane, not from the candidate agent. `count_attestations_pure` itself needed no changes at all: the membrane is captured in a closure at the call site, not threaded through the pure recursive walk.

**Ground as termination, how it actually works:** `get_grounding_path` walks a Claim's `evidence_hashes` depth-first, looking for a path that terminates in a real `Evidence` entry — the reference potential a chain of support is supposed to eventually rest on. It's read-only and never scores or gates anything: `validate_claim` was already checking only that each `evidence_hashes` entry resolves to *something*, not that it's `Evidence` specifically, so a claim can — and sometimes will — cite another Claim as its "evidence." Grounding treats that honestly: a cited Claim isn't ground, it's another link in the chain to walk through, via its own `evidence_hashes` in turn, up to a depth cap and a shared node-visit cap (`MAX_GROUNDING_SEARCH_NODES`, the same bounded-search shape used by `AttestationPolicy` and the `WorldlineTrace` checkpoint scan). If a claim has several `evidence_hashes`, the search tries each in turn and returns the first path that actually grounds, rather than giving up after one dead-end branch. When nothing grounds — a bare claim, a citation cycle, a dangling or non-Claim/non-Evidence hash, or the depth budget running out first — the response still reports the path walked to where it broke down, not just `false`: seeing *where* a chain fails is the actual audit value here (Invariant #2 — the topology is the truth function). An ungrounded claim stays exactly as valid, critiquable, and linkable as before; nothing about creating one changes. Eight unit tests cover the walk directly against an in-memory fixture graph: direct grounding, walking through a cited Claim, a bare claim, a dangling citation, finding a grounded branch after an earlier one fails, a two-claim citation cycle that must terminate, the depth cap cutting a chain short of grounding that would otherwise succeed, and Evidence itself as a trivial one-node path.

**On evidence weighting specifically:** nothing in this design ever judges one piece of `Evidence` as stronger, more credible, or more "worth" citing than another — that would be exactly the canonical, comparative signal Invariant #1 rules out, applied to evidence instead of agents. `get_grounding_path` only ever asks a binary question (does this chain reach *some* real `Evidence` entry, yes or no); it has no notion of evidence quality to report even if asked. `get_effective_conductance` (above) is sometimes mistaken for an evidence-weighting mechanism, but it scores a `SynapticLink` — a critique's resonance over time — never an `Evidence` entry itself. Two claims backed by different evidence are never compared to each other by anything in this codebase; that comparison, if anyone wants it, stays entirely with the reader.

**The mismatch recorded as structure, how it actually works:** `BridgeRecord` gained four fields — `carried_fields`/`dropped_fields: Vec<String>`, `original_length`/`excerpt_length: u32` — a real set difference, not a fabricated scalar like the naming-discipline note below warns against. The DHT can't compute this itself (`record_twitter_mirror` just stores whatever `BridgeRecord` it's handed), so `bridge/src/index.ts` computes it at the moment it actually builds the tweet text, from a small `MEW_FIELDS`/`CLAIM_FIELDS` list kept in sync with the real Rust struct fields by hand (there's no shared schema to derive it from automatically — a field added to either struct needs a matching update in the bridge or `dropped_fields` silently under-reports). `validate_bridge_record` checks the two constraints that *are* independently derivable from the entry's own data alone — `excerpt_length` can't exceed `original_length`, and no field name can appear in both lists — via a pure, directly-unit-tested `bridge_record_loss_fields_consistent` (five new tests, the integrity zome's first test module: everything else there needed either a real host call or was covered indirectly through the coordinator's own extractions). It can't verify the lists are *accurate* to what was really dropped — same asymmetric-witness limit as the rest of `BridgeRecord` — only that they're internally consistent.

**A naming discipline worth stating explicitly:** the earlier design document that inspired this section used "infinite step-down Tesla transformer." That device doesn't exist as described, and the name carries real crank valence with exactly the technically literate readers this project needs to convince. "Impedance matching across scale boundaries" is standard, respectable RF engineering vocabulary that generates the same real constraints without that cost — the same judgment that made removing the EVA-era versor algebra correct. The test applied to every row above: *does this generate a constraint that could be violated?* If a piece of the metaphor doesn't clear that bar, it isn't in this section.

---

## 3. The Architecture Stack

### 3.1 Layer Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  HUMAN AGENT (Consciousness — the non-computable observer)                  │
│  • Reads 3D semantic manifold (SSTorytime)                                  │
│  • Writes critiques that collapse epistemic superposition                   │
│  • Makes voluntary promises that curve spacetime                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  SSTORYTIME (Semantic Spacetime Visualization)                              │
│  • N4L query language — "from !agent_A trace 'fascial'"                    │
│  • 3D graph traversal — local cone paths                                     │
│  • Renders the curved manifold of knowledge                                  │
│  • Runs locally per-agent — PostgreSQL cache, rebuildable from DHT           │
├─────────────────────────────────────────────────────────────────────────────┤
│  HRR INDEX (OpenZoo — OPTIONAL, DEFERRED)                                   │
│  • Local holographic compression of source chains                            │
│  • Fast semantic retrieval — "find relevant periods"                         │
│  • Bridge payload optimization                                               │
│  • Runs locally, publishes trace to DHT                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  HOLOCHAIN DHT (CEPTR Receptors — The Substrate)                            │
│  • Immutable source chains (worldlines)                                      │
│  • Typed entries: Claim, Critique, Evidence, Membrane, etc.                 │
│  • Typed links: TargetToCritique, SynapticLink, etc.                        │
│  • Promise-based validation (no global consensus)                            │
│  • Gossip protocol (wave propagation)                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  BRIDGE SERVICE (Twitter ↔ Holochain — The Transducer)                      │
│  • Correlative witness — preserves provenance, not just content              │
│  • Temporal separation — bridge latency preserves epistemic spreads          │
│  • Two-way: Holochain → Twitter (publish), Twitter → Holochain (import)     │
│  • Runs locally per-agent — no centralized service                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Data Flow

**Creating a Claim:**
```
Agent writes Claim → Holochain zome validates → Entry created on source chain
  → Gossiped to DHT → Signal emitted → Bridge service detects → Tweet posted
  → BridgeRecord created → Link from Claim to BridgeRecord
```

**Creating a Critique:**
```
Agent writes Critique → Validation checks target exists AND its real type
  matches the claimed target_type (Claim, Critique, Constitution,
  Membrane, or CritiqueSpecies — see §2.6)
  → SynapticLink created with conductance (f32 in tag)
  → TargetToCritique link created
  → DHT gossip propagates the binding
```

**Importing Twitter Reply:**
```
Bridge polls mentions → Detects reply with Holochain hash → Calls import_twitter_reply
  → ExternalCritique entry created → ClaimToExternalCritique link created
  → Now part of the immutable critique graph
```

**Generating WorldlineTrace:**
```
Agent calls generate_worldline_trace → Traverses own source chain
  → Groups entries by domain/modality into PeriodBoundaries
  → Computes Merkle root checksum
  → Publishes WorldlineTrace to DHT → Links from agent anchor
```

**Exporting to N4L:**
```
Agent calls export_to_n4l → Queries DHT for entries matching filter
  → Serializes each entry to N4L text → Returns string
  → Local SSTorytime instance ingests N4L → Renders 3D graph
```

---

## 4. How It All Connects

### 4.1 The Philosophy → Code Mapping

| Philosophy | Code Implementation |
|-----------|---------------------|
| "All matter is vibration" | DHT entries are excitations; links are couplings |
| "Stillness listening to itself" | Immutable DHT substrate witnesses all discourse |
| "Consciousness is differential vibration" | Critique graph creates meaning through contrast |
| "No deletion — only atrophy" | Validation rejects Delete ops; links can fade |
| "Promise Theory — voluntary binding" | Capability grants; agent publishes own constitution |
| "Semantic Spacetime — curved manifold" | Domain membranes; promise-compatible clustering |
| "Bridge latency preserves spreads" | Bridge service has temporal separation built in |
| "Correlative witness binds without flattening" | BridgeRecord preserves provenance across platforms |
| "HRR compresses without destroying" | WorldlineTrace hooks; trace_payload is optional |

### 4.2 The Biological → Digital Mapping

| Biological System | Digital Equivalent | File/Module |
|-------------------|-------------------|-------------|
| Cell membrane | Agent source chain + capability grants | `integrity/src/lib.rs` (validation rules) |
| Receptor | Zome function with typed parameters | `coordinator/src/lib.rs` (entry CRUD) |
| Ligand | Entry payload (Claim, Critique, etc.) | `integrity/src/lib.rs` (entry types) |
| Synapse | Link between entries with conductance | `coordinator/src/lib.rs` (create_critique) |
| Action potential | Signal emitted on entry creation | `coordinator/src/lib.rs` (emit_signal) |
| Neurotransmitter | Token/attention cost (future) | Integrity zome (burn-to-deploy hook) |
| Hippocampus | WorldlineTrace (index of episodes) | `coordinator/src/lib.rs` (generate_worldline_trace) |
| Cortex | SSTorytime (topographic semantic map) | `export_to_n4l` function |
| Immune system | AntibodyPattern (future) | Deferred |
| Homeostasis | Discourse health monitoring | `get_discourse_health` |

### 4.3 The Quantum → Classical Mapping

| Quantum Concept | Protocol Implementation |
|-----------------|------------------------|
| Superposition | Claim exists as multiple possible interpretations before critique |
| Measurement | Critique/validation collapses superposition into definite record |
| Entanglement | Claim and critique are linked — meaning depends on both |
| Decoherence | Bridge latency prevents instantaneous flattening |
| No-cloning theorem | Source chains are cryptographically unique |
| Wavefunction | DHT topology as probability field over what is true |
| Observer | Human agent — the non-computable measurement apparatus |

---

## 5. Code Walkthrough

### 5.1 File Structure

```
epistemic-happ/
├── dna/
│   ├── dna.yaml                    # DNA manifest — bundles zomes
│   ├── integrity/
│   │   ├── Cargo.toml              # Rust dependencies (hdi, serde)
│   │   └── src/
│   │       └── lib.rs              # Entry types, enums, link types, validation rules
│   └── coordinator/
│       ├── Cargo.toml              # Rust dependencies (hdk, integrity zome)
│       └── src/
│           └── lib.rs              # CRUD functions, bridge integration, N4L export
├── bridge/
│   ├── package.json                # Node.js dependencies
│   ├── tsconfig.json               # TypeScript config
│   └── src/
│       └── index.ts                # Bridge service daemon
├── happ.yaml                       # hApp manifest — defines roles
└── README.md                       # This document
```

### 5.2 Integrity Zome (`dna/integrity/src/lib.rs`)

**Entry Types:**

- `Claim` — A knowledge assertion. Fields: `content`, `domain`, `author`, `timestamp`, `evidence_hashes`, `confidence`, `semantic_tags`, `source_mew`
- `Critique` — A typed response to any critiquable node (scale-invariant — see §2.6). Fields: `target` (`AnyLinkableHash`), `target_type` (`CritiqueTargetType`: `Claim`/`Critique`/`Constitution`/`Membrane`/`CritiqueSpecies`, cross-checked against the DHT so it can't be spoofed), `critique_mode`, `content`, `author`, `timestamp`, `replication_attempted`, `evidence_hashes`, `species` (optional link to a `CritiqueSpecies` taxonomy)
- `Evidence` — Supporting data. Fields: `content`, `evidence_type`, `source_url`, `author`, `timestamp`
- `Membrane` — A domain with shared promise geometry. Fields: `domain`, `description`, `required_promises`, `validation_rules_hash`, `creator`, `created_at`
- `CritiqueSpecies` — An evolving critique taxonomy. Fields: `name`, `parent_species`, `required_evidence`, `proposer`, `created_at`. No stored adoption count — see `get_critique_species_adoption_count`, a live query over real `CritiqueToSpecies` links (§9, Invariant #1 note)
- `WorldlineTrace` — Holographic index of agent's history. Fields: `agent`, `period_boundaries`, `expertise_tags`, `trace_payload` (HRR hook), `binding_key` (HRR hook), `checksum`, `created_at`, `expires_at`
- `BridgeRecord` — Proof of Twitter mirroring. Fields: `mew_hash`, `twitter_id`, `platform`, `mirrored_at`, `carried_fields`, `dropped_fields` (the real set difference of which Mew/Claim fields made the crossing — see §2.6), `original_length`, `excerpt_length`
- `ExternalCritique` — Imported Twitter reply. Fields: `twitter_id`, `author_handle`, `content`, `linked_holochain_claim`, `imported_at`

**Validation Rules (enforced by every peer):**

1. `validate_claim`: Author must match action author. Content and domain must be non-empty. Evidence hashes must point to valid Evidence entries.
2. `validate_critique`: Author must match. Target must exist and its real DHT-derived entry type must match the claimed `target_type` (Claim, Critique, Constitution, Membrane, or CritiqueSpecies — scale-invariant, see §2.6). Content must be non-empty. Subject to SWO temporal friction (§2.3).
3. `validate_worldline_trace`: Author must match agent field. At least one period boundary. Each `sample_action` must exist on the author's chain. Checksum must be 32 bytes. Temporal consistency. Expiration must be in future. HRR payload < 64KB.
4. `validate_delete`: **Rejected.** Nothing is deleted. Entries are immutable.

**Link Types:**

- `TargetToCritique` — Any critiquable node (Claim, Critique, Constitution, Membrane, or CritiqueSpecies — see §2.6) → a critique of it. One link type reused across all five target kinds; was `ClaimToCritique`, Claim-only, before Critique became scale-invariant.
- `SynapticLink` — With initial conductance (f32, immutable once written) stored in LinkTag; effective conductance is computed at read time — see `get_effective_conductance` (§2.6)
- `Reinforcement` — A SynapticLink's own ActionHash → the reinforcing agent. One decaying contribution to effective conductance per reinforcement; see §2.6
- `AgentToWorldlineTrace` — Agent anchor → their trace
- `ClaimToBridgeRecord` — Claim → proof of Twitter mirroring
- `ClaimToExternalCritique` — Claim → imported Twitter reply
- `SpeciesToParent` — Critique species → parent species (evolution)

### 5.3 Coordinator Zome (`dna/coordinator/src/lib.rs`)

**N4L Serialization:**

The `ToN4L` trait is implemented once for each of the 8 entry types (`Claim`, `Critique`, `Evidence`, `Membrane`, `WorldlineTrace`, `Mew`, `Retraction`, `Constitution`). This converts Rust structs into real N4L text — plain-text notes with parenthesized relations — per [SSTorytime's N4L spec](https://github.com/markburgess/SSTorytime/blob/main/docs/N4L.md), not JSON or a struct-literal format.

Example output for a Claim and a Critique of it:
```n4l
@claim_9f2a1c3d0e4b7a11 "Anterior pelvic tilt correction reduces lumbar strain" (asserted by) "AgentPubKey..."
     "                (has domain) "LumbarRehab"
     "                (has confidence) "High"
     "                (has dht hash) "EntryHash..."
     "                (has evidence) "EntryHash..."
     "                (has tag) "hip-mobility"

@critique_5b8e2f19aa03c4d1 "This mechanism ignores fascial tension" (critiques) $claim_9f2a1c3d0e4b7a11.1
     "                (target type) "Claim"
     "                (critique mode) "Methodological"
     "                (asserted by) "AgentPubKey..."
```

A critique of a critique (or of a Constitution, Membrane, or CritiqueSpecies — see §2.6) looks identical except the reference resolves under a different alias prefix, matching whichever `$critique_...`/`$constitution_...`/etc. that target was exported under, and `(target type)` reads accordingly.

The relation vocabulary used above (`asserted by`, `has domain`, `critiques`, `retracts`, etc.) is registered in [`n4l/arrows-epistemic.sst`](../n4l/arrows-epistemic.sst) at the repo root, organized under N4L's `leadsto`/`contains`/`properties` categories. **This file cannot simply be placed "alongside" SSTorytime's standard `SSTconfig/` files** — the real `N4L` binary's `ReadConfig()` only ever loads a hardcoded list of 6 exact filenames (`arrows-LT-1.sst`, `arrows-NR-0.sst`, `arrows-CN-2.sst`, `arrows-EP-3.sst`, `annotations.sst`, `closures.sst`); a 7th file, however named, is silently never read. Each of `arrows-epistemic.sst`'s three sections must instead be merged into the matching one of those 6 files as its own `:: epistemic ::` context block — see the file's own header comment for the exact mapping.

**✅ Verification status:** run end-to-end against the real `N4L` Go binary (built from source, with a live PostgreSQL backend — `N4L`'s `Open()` pings the database unconditionally even for `-v`/no-upload runs) and a real export sample generated by actually calling this crate's `ToN4L` impls, not hand-written text. That run found and fixed two real defects, both now applied to `dna/coordinator/src/lib.rs` and `n4l/arrows-epistemic.sst`:

1. Every `ToN4L` impl's output was missing the `- <chapter title>` declaration N4L requires before any other line — fatal (`Declarations outside a section or chapter at line 1`), blocking 100% of output. `export_to_n4l` now emits one.
2. `WorldlineTrace`/`Constitution` baked a loop index directly into relation-name strings (`covers period 0`, `promise 0 action`, ...); N4L's arrow directory is a fixed, pre-declared vocabulary, so an open-ended family of relation names can never all be registered — fatal (`No such arrow has been declared in the configuration: (covers period 0)`). Fixed by moving the index to N4L's comma-delimited context-tag syntax (`covers period,p0`) on a static, already-registered name instead. `has dht hash`, `replication attempted`, `promise domain`, and `condition param` were also missing from the arrow file outright and are now registered.

With both fixes applied and `arrows-epistemic.sst` merged as documented above, a full sample (Evidence, Claim, Critique, `WorldlineTrace` with multiple indexed periods, `Constitution` with indexed promises/conditions, and Membrane) parses through `N4L -v` cleanly — exit code 0, zero arrow or declaration errors, through to node-inference/clique-completion. The exporter is confirmed-parsing, not merely spec-conformant, as of this pass.

**Key Functions:**

- `create_claim(claim)` → Creates entry, links from agent anchor, emits signal
- `create_critique(critique)` → Creates entry, links from target (any critiquable node — see §2.6), creates SynapticLink with conductance
- `generate_worldline_trace(params)` → Traverses agent's source chain, groups by domain, computes Merkle root, publishes trace
- `export_to_n4l(query)` → Queries DHT, computes each entry's `EntryHash` via `hash_entry()`, serializes matching entries to N4L text (see verification note above)
- `get_discourse_health(payload)` → `payload.membrane` (resolved to its `domain` field) + optional `payload.attestation_policy` (§2.6). Computes abstract-to-embodied ratio, warns if >3.0; with a policy supplied, only counts critiques from attested authors
- `is_agent_attested(payload)` → Standalone AttestationPolicy check, scoped to `payload.membrane`, for callers who just want the yes/no without going through discourse health (§2.6)
- `grant_attestation(payload)` → Explicit, tenure- and budget-gated vouch for a candidate agent within a membrane (§2.6)
- `get_my_membership_action(membrane)` → Convenience lookup for the caller's own `AgentToMembrane` join action, needed as proof of tenure by `grant_attestation` (§2.6)
- `get_grounding_path(claim)` → Walks `evidence_hashes` for a path terminating in real Evidence; read-only, never scores or gates (§2.6)
- `find_synaptic_link(base, target_action)` → Looks up a SynapticLink's own ActionHash by the base/target it connects (needed since `create_critique` doesn't surface it directly — see §2.6)
- `reinforce_synaptic_link(synaptic_link_action)` → Records "I resonate with this connection"; subject to its own SWO temporal friction budget (§2.6)
- `get_effective_conductance(synaptic_link_action)` → Computes decay- and reinforcement-weighted conductance at read time (§2.6)
- `get_unbridged_claims()` → Returns claims with no BridgeRecord links
- `import_twitter_reply(payload)` → Creates ExternalCritique, links to original claim

### 5.4 Bridge Service (`bridge/src/index.ts`)

**Architecture:**

The bridge is a local Node.js daemon that runs on the same machine as the Holochain conductor.

**Components:**

1. `HolochainClient` — Connects via WebSocket to the conductor's App API. Calls zome functions. Listens for signals.
2. `TwitterBridge` — Wraps `twitter-api-v2` library. Posts tweets. Fetches mentions.
3. `EpistemicBridgeService` — Orchestrates both directions.

**Real-time flow (Holochain → Twitter):**

1. Agent creates Claim → Holochain emits `SignalPayload::NewClaim`
2. Bridge service detects signal via WebSocket
3. Bridge formats tweet text (truncated to 240 chars + hashtag)
4. Bridge posts to Twitter via API
5. Bridge calls `record_twitter_mirror` to store BridgeRecord on DHT

**This is a funnel, not a mirror.** Steps 3–4 are lossy by construction: a `Claim` carries a domain, confidence level, evidence hashes, and semantic tags, and a tweet carries 280 characters. The outbound bridge is not attempting to preserve that dimensionality on Twitter — it can't. Its job is narrower: post a legible excerpt, and make sure the excerpt always points back to the one place (the DHT) where the full record actually lives. Anyone who reads only the tweet gets a lossy summary; anyone who follows the DHT hash gets everything.

**Polling fallback:**

Every 30 seconds, the bridge calls `get_unbridged_claims` and processes any claims that missed the signal.

**Two-way flow (Twitter → Holochain):**

Every 5 minutes, the bridge:
1. Fetches mentions for the Twitter account
2. Checks if mention text contains a Holochain hash (regex: `0x[a-fA-F0-9]{64}`)
3. If found, calls `import_twitter_reply` with the tweet content and linked hash
4. The reply becomes an `ExternalCritique` entry, permanently part of the critique graph

**Why this is a correlative witness, not a Ricardian contract:**

The bridge doesn't just copy text. It creates a **witnessed correlation**:
- The tweet references the DHT hash
- The DHT records the Twitter ID
- Even if Twitter deletes the tweet, the BridgeRecord persists

But unlike a true Ricardian contract, this binding is **not mutual or enforceable** — Twitter never agrees to anything, and there's no legal or executable recourse if the correlation is broken. Only the Holochain side durably remembers it happened. The value is still real (provenance survives platform deletion, and replies are imported as first-class `ExternalCritique` entries) — it's just asymmetric witnessing, not a two-sided contract.

---

## 6. Build & Run Instructions

### 6.1 Prerequisites

- **Rust** (latest stable) with `wasm32-unknown-unknown` target
- **Node.js** (v18+) and npm
- **Holochain CLI** (`hc`) — install via `nix-shell` or binary release
- **Twitter API credentials** (or OpenTweet subscription)

### 6.2 Build the DNA

```bash
cd epistemic-happ/dna/integrity
cargo build --target wasm32-unknown-unknown --release

cd ../coordinator
cargo build --target wasm32-unknown-unknown --release

cd ..
hc dna pack .
```

### 6.3 Build the hApp

```bash
cd epistemic-happ
hc app pack .
```

### 6.4 Install the Bridge Service

```bash
cd epistemic-happ/bridge
npm install
```

### 6.5 Configure Environment

Create `.env` in the `bridge/` directory:

```env
HOLOCHAIN_URL=ws://localhost:8888
HOLOCHAIN_APP_ID=epistemic-resonance-happ
TWITTER_API_KEY=your_api_key
TWITTER_API_SECRET=your_api_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_ACCESS_SECRET=your_access_secret
POLL_INTERVAL_MS=30000
```

### 6.6 Run the Conductor

`hc run -p 8888` (this section's instruction prior to the live-conductor
verification pass logged in §9 Phase 2) is not a real subcommand of any
`hc` version this project has actually installed — the real one is
`hc sandbox`, and getting it running the first time surfaced several real,
non-obvious gotchas (missing `lair-keystore`, global-vs-subcommand flag
ordering, a wrapper process that exits before the server it started does).
`scripts/sandbox.sh` (see its own header for the full account) wraps all of
that:

```bash
scripts/sandbox.sh start    # generates a sandbox from epistemic-resonance-happ.happ
                             # the first time, resumes it (same DHT state) on
                             # every later call — admin :8889, app :8888,
                             # matching bridge/.env.example's defaults exactly
scripts/sandbox.sh status   # is it up?
scripts/sandbox.sh stop     # stop it (DHT state persists for the next `start`)
scripts/sandbox.sh clean    # wipe it entirely — next `start` is genuinely fresh
```

### 6.7 Run the Bridge

```bash
cd bridge
npm run build
npm start
```

### 6.8 Test the Flow

1. **Create a claim:** Use the Holochain client or UI to call `create_claim`
2. **Check Twitter:** The bridge should post a tweet within seconds
3. **Reply on Twitter:** Reply to the tweet, including the Holochain hash
4. **Check Holochain:** After 5 minutes, the reply should appear as `ExternalCritique`
5. **Generate trace:** Call `generate_worldline_trace` to index your history
6. **Export N4L:** Call `export_to_n4l` to get text for SSTorytime

---

## 7. The Theory in Plain Language

### 7.1 Why Not Just Use Twitter?

Twitter is a **maximally lossy channel** optimized for throughput, not fidelity. Your 10 years of rehab knowledge gets flattened to 280 characters, then to an engagement metric, then to "trending." Each hop destroys information.

This protocol is the **error-correcting code**:
- The source chain is the encoder — full context, typed critiques, semantic tags
- The DHT is the channel — distributed, redundant, survivable
- The human reader is the decoder — reconstructing meaning from preserved structure

### 7.2 Why Not Just Use AI?

AI is a **stochastic parrot** — sophisticated voltage manipulation without understanding. It has no body, no stakes, no context. It predicts the next token because it's probable, not because it's true.

This protocol uses **human agents as the measurement apparatus**:
- Each agent has their own source chain (their own body of knowledge)
- Each critique is typed and contextual (not a binary like)
- The topology of the graph is the truth function — no algorithm computes it

### 7.3 Why Holochain?

Because it's the only architecture that is:
- **Agent-centric** — each cell has its own membrane
- **Sharded** — no global bottleneck, no platform extraction
- **CEPTR-native** — designed as receptor-based computing from first principles
- **Promise-compatible** — validation is voluntary binding, not imposed obligation

### 7.4 Why This Matters

If you accept that:
1. The brain uses probability distributions, not binary logic
2. Understanding is non-algorithmic and context-dependent
3. Current platforms systematically destroy that context
4. Distributed systems can preserve it

Then this protocol is not optional. It is **necessary infrastructure** for any domain where human knowledge is being flattened by platform extraction.

The rehab hApp is the **first cell type**. The protocol generalizes to any domain: climate science, nutrition, software engineering, history.

---

## 8. Glossary

| Term | Definition |
|------|-----------|
| **CEPTR** | Composable semantic receptor framework — the predecessor to Holochain |
| **DHT** | Distributed Hash Table — the shared space where Holochain agents interact |
| **HRR** | Holographic Reduced Representations — vector compression technique (Plate 1995) |
| **Membrane** | A domain with shared promise geometry — a region of semantic spacetime |
| **N4L** | Notes for Learning — SSTorytime's query/input language |
| **Orch-OR** | Orchestrated Objective Reduction — Penrose-Hameroff theory of quantum consciousness |
| **Correlative Witness** | This project's bridge pattern: a durable, one-sided Holochain record that a DHT entry and an external post (e.g. a tweet) co-occurred — inspired by, but not equivalent to, a Ricardian contract, since there's no mutual agreement or enforceability |
| **Promise Theory** | Mark Burgess' framework where autonomous systems interact through voluntary promises |
| **Ricardian Contract** | (Reference concept, not implemented here) A contract that is simultaneously human-readable, machine-executable, and mutually enforceable between both parties — see Correlative Witness for what this project actually uses |
| **Semantic Spacetime** | A geometry where promises create curved manifolds of meaning |
| **Source Chain** | An agent's immutable, cryptographically signed history of all actions |
| **Stochastic Parrot** | Bender et al.'s critique that LLMs predict without understanding |
| **SWO** | Stacc's economic topology — burn-to-deploy L3/L4 chain architecture |
| **SynapticLink** | A link whose `LinkTag` carries an immutable initial `f32` conductance; its *effective* conductance is computed fresh at read time (`get_effective_conductance`, §2.6) from that initial value decaying since creation, plus a decaying contribution from each explicit `Reinforcement` — not literally "traversal frequency" (passive reads aren't tracked, only an agent's deliberate `reinforce_synaptic_link` call is) |
| **Worldline** | An agent's trajectory through semantic spacetime — their source chain |
| **WorldlineTrace** | A holographic index of an agent's worldline for fast retrieval |

---

## 9. Roadmap

### Phase 1: Foundation (Current)
- [x] Integrity zome with all entry types
- [x] Coordinator zome with CRUD, N4L export, bridge integration
- [x] Bridge service with real-time and polling modes
- [x] Validation rules enforcing all 10 invariants
- [x] WorldlineTrace with HRR hooks (payloads empty)
- [x] **Coordinator zome deduplicated** — the file previously had `Mew`/`Retraction`/`Constitution` functions and the `SignalPayload` enum each defined 2–3 times across incremental edits that appended "updated" versions without removing the old ones, which would not have compiled (`E0119`/`E0428`). Consolidated to one copy of each, keeping the more complete version where they differed (e.g. `promote_mew_to_claim` links the resulting Claim from the agent anchor; the superseded `enrich_mew_to_claim` didn't).
- [x] **Fixed systemic `EntryHash`/`ActionHash` return-type mismatch** — every `create_X` function declared `ExternResult<EntryHash>` while returning `create_entry()`'s actual `ActionHash`. Fixed across all 12 affected functions.
- [x] **Getter/creator hash mismatch resolved.** The five getters that look up a single entry by its own hash (`get_claim`, `get_evidence`, `get_critique_species`, `get_mew`, `verify_trace_checksum`) now take `AnyDhtHash` instead of `EntryHash`. Holochain's hash encoding is self-describing about which hash type it is, so `get()` resolves an `ActionHash` (what every `create_X` returns) or an `EntryHash` (what link bases and the N4L exporter use) to the same record — callers no longer need to compute one from the other first. Functions that take a hash as a *link base* rather than a direct lookup (`get_retractions_for_claim`, `get_twitter_replies_for_claim`) were left as `EntryHash`-only, since that's the actual key the corresponding links are created under, not a getter/creator mismatch. (`get_critiques_for` — see below — is the exception: it does accept `AnyDhtHash`, since scale-invariant critique made this genuinely a getter/creator-shaped case again.)
- [x] **Coordinator zome tests added and verified against a real build.** `dna/coordinator/src/lib.rs`'s `#[cfg(test)] mod tests` covers the N4L export layer (`ToN4L` for `Claim`/`Critique`/`WorldlineTrace`/`Retraction`, including cross-reference aliasing and quote-escaping), `compute_merkle_root` (determinism, order-sensitivity, per-field sensitivity), and `bridge_link_type_for` (the `BridgeRecord` link-type decision, extracted out of `record_twitter_mirror` so it's testable without a `get()` mock) — **17 tests, `cargo test --lib`, all passing**, run for real (rustc/cargo 1.98.0), not just type-checked. A `MockHdkT`-based integration-test file for `create_claim`/`create_mew`'s host-calling behavior was attempted and had to be removed: hdk 0.4.4's own bundled `mockall::mock!` block doesn't compile against the `HdkT`/`HdiT` traits this hdk version itself resolves — a bug in the published crate (see coordinator's `Cargo.toml`), not something fixable from this project. `record_twitter_mirror`'s `get()` branch, `get_unbridged_claims`, and `get_unbridged_mews` remain untested at the runtime-behavior level for the same reason (all three need a mocked `get()`/`query()` returning a fake `Record`).
  Getting a real compiler in the loop (this environment's toolchain was upgraded from rustc 1.61.0/2022 to 1.98.0, and `epistemic_integrity`'s `hdi` pin was corrected from a loose `"0.4"` — which resolved to 0.4.6 in isolation — to the exact `=0.5.4` that `hdk 0.4.4` actually requires, since without a Cargo workspace unifying versions the two zome crates were silently resolving to physically different, incompatible `hdi`/`holo_hash` instances) surfaced and fixed real bugs no amount of reasoning alone had caught, across both zomes: `#[hdk_entry_defs]`/`#[unit_enum(...)]` were this hdi version's old macro names (now `#[hdk_entry_types]` + `#[unit_enum(...)]` together, no separate derive); `EntryCreationAction`'s `.author`/`.timestamp`/`.prev_action` are methods, but the concrete `Create`/`CreateLink` action structs `OpEntry`/`OpRecord` actually hand over expose them as plain fields — every validator now takes `&Create` directly instead of the mismatched `&EntryCreationAction`; `must_get_valid_record` requires an `ActionHash` specifically and silently doesn't accept the `EntryHash`s this codebase uses for cross-references (fixed via `must_get_entry`, its `EntryHash`-native counterpart); `get_links` takes one `GetLinksInput` (built via `GetLinksInputBuilder::try_new`) instead of three positional arguments; `create_entry` needs an owned `EntryTypes` value, not a reference; pattern-matching `AnyLinkableHash::Entry(hash)` doesn't exist — downcast via `EntryHash::try_from(link.target)` instead; timestamps are `i64` via `Timestamp::as_seconds_and_nanos().0`, not `u64`; and `bridge_link_type_for` had a real regression from an earlier fix pass, caught by its own test: propagating a `to_app_option::<Claim>()` deserialize error via `?` when probing "is this a Claim, or if not a Mew?" turned "wrong type, try the next" into a hard error instead of falling through. Both zomes now build cleanly — no warnings — natively and for the actual deployment target, `cargo check --target wasm32-unknown-unknown`.
- [x] **Scale-invariant `Critique` target shipped** — see §2.6's table and its "how it actually works" note for the full design. `Critique.target_claim: EntryHash` (Claim-only) became `Critique.target: AnyLinkableHash` plus a `target_type: CritiqueTargetType` discriminator (needed because `ToN4L::to_n4l` has no DHT access to discover the target's real type itself), with `validate_critique` independently re-deriving and cross-checking that discriminator so it can't be spoofed. `LinkTypes::ClaimToCritique` → `TargetToCritique` (one link type, reused across all five target kinds, superseding the never-wired-up `MembraneToCritique` stub); `get_critiques_for_claim` → `get_critiques_for(target: AnyDhtHash)`. Two new tests specifically exercise the cross-scale case — a critique targeting another critique resolves its N4L cross-reference under the `"critique"` alias prefix, and asserts it does *not* resolve under `"claim"`, the old hardcoded behavior. All 19 tests pass; both zomes still build clean, natively and for `wasm32-unknown-unknown`.
- [x] **Conductance atrophy shipped** — see §2.6's "how it actually works" note for the full design. New `LinkTypes::Reinforcement` link type (a SynapticLink's own ActionHash → the reinforcing agent), created via `reinforce_synaptic_link` and subject to its own SWO temporal friction budget (separate from SynapticLink's own, since reinforcing is meant to be a cheaper act) enforced both coordinator-side and, unbypassably, in `validate_create_link` — which also confirms the target is the reinforcing agent themselves and the base really is a SynapticLink creation, not an arbitrary hash. `get_effective_conductance` computes the actual read-time value from a pure, directly-unit-tested `compute_effective_conductance`/`decay_factor` core (`2^(-elapsed/half_life)`, 30-day default half-life) — nine new tests confirm the half-life lands exactly where claimed, decay is monotonic and never plateaus, and a recent reinforcement measurably outweighs an old one. `create_synaptic_link` now returns the link's own ActionHash instead of discarding it (`create_critique` still doesn't surface this through its own return value, so `find_synaptic_link` exists for callers to recover it after the fact). 29 tests pass; both zomes still build clean, natively and for `wasm32-unknown-unknown`. Not done in this pass: wiring `get_effective_conductance` into `get_discourse_health` or any other read path as an actual filter — this ships the mechanism, not its integration everywhere it could matter.
- [x] **`AttestationPolicy` shipped** — see §2.6's "how it actually works" note for the full design. New opt-in `attestation_policy: Option<AttestationPolicy>` field on `get_discourse_health`'s payload (its own struct now, `GetDiscourseHealthPayload`, replacing the bare `domain: String` argument); `None` is exactly the old, unfiltered behavior. `AttestationPolicy { require_attestation_from, min_attestations, max_attestation_depth }` is a real, bounded, depth-limited web-of-trust check (`count_attestations_pure`), not just a membership flag — transitive attestation is genuinely computed, with a cycle guard and a hard node-visit cap (`MAX_ATTESTATION_SEARCH_NODES`), and it only ever walks outward from the specific candidate being checked rather than across "all agents," which Holochain has no way to enumerate. New standalone `is_agent_attested` extern for callers who just want the check directly. Deliberately **not** built as a protocol-computed default anywhere — that would itself be the one-bit reputation score Invariant #1 rules out; this stays entirely in the caller's hands, matching the `get_critique_species_adoption_count` precedent (raw data out, interpretation client-side). Seven new unit tests cover the walk directly against an in-memory fixture graph, including a two-agent mutual-attestation cycle that must terminate rather than loop forever. 36 tests pass; both zomes still build clean, natively and for `wasm32-unknown-unknown`. Not done in this pass: membrane-scoped discourse health (still keyed by a free-text `domain: String`, not a `Membrane` entry) — a related but separate idea from `AttestationPolicy` itself, left for its own pass.
- [x] **`get_grounding_path` shipped** — see §2.6's "how it actually works" note for the full design. New read-only `get_grounding_path(claim: AnyDhtHash) -> GroundingPath` walks a Claim's `evidence_hashes` for a path terminating in real `Evidence`, treating a cited Claim (something `validate_claim` already allowed, since it only checks that `evidence_hashes` resolve to *something*, not that it's `Evidence` specifically) as another link to walk through rather than a dead end. Tries every branch (not just the first) before reporting ungrounded, bounded by a depth cap and a shared node-visit cap (`MAX_GROUNDING_SEARCH_NODES`) with a cycle guard — same bounded-search shape as `AttestationPolicy`. Never scores, never gates: an ungrounded claim stays exactly as valid as before. Eight new unit tests cover the walk directly against an in-memory fixture graph: direct grounding, walking through a cited claim, a bare claim, a dangling citation, finding a grounded branch after an earlier one fails, a two-claim citation cycle that must terminate, the depth cap cutting off a chain that would otherwise ground, and Evidence itself as a trivial path. 44 tests pass; both zomes still build clean, natively and for `wasm32-unknown-unknown`.
- [x] **`BridgeRecord` loss-tracking fields shipped** — see §2.6's "how it actually works" note for the full design. `carried_fields`/`dropped_fields: Vec<String>` and `original_length`/`excerpt_length: u32` added to `BridgeRecord`; `bridge/src/index.ts` now actually computes the set difference (via a small `computeFieldLoss` against `MEW_FIELDS`/`CLAIM_FIELDS` constants) when it builds the tweet text, instead of the fields not existing at all. `validate_bridge_record` checks the two constraints derivable from the entry's own data (`excerpt_length <= original_length`; no field in both lists) via a new pure `bridge_record_loss_fields_consistent` — the integrity zome's first test module, five new tests, run and passing. This closes out every item from the Fractal Impedance Matching section's original follow-up list — nothing remains open there.
  **Also found and fixed, incidentally, by actually running `tsc` for the first time this project** (echoing the Rust side's own "getting a real compiler in the loop" discovery): `bridge/src/index.ts` imported `AppAgentCall` from `@holochain/client`, which doesn't exist as an export of the installed version — a hard compile error — alongside `RoleName`/`ZomeName`/`FunctionName`, none of which were ever actually used anywhere in the file; all four removed. More significantly, `AppWebsocket.connect()`'s `token` option is typed `AppAuthenticationToken = number[]`, a real byte token obtained via `AdminWebsocket#issueAppAuthenticationToken` — not an arbitrary string. The `'bridge-auth-token'` placeholder this bridge had always passed was never a valid token, meaning **this bridge has never actually been able to authenticate against a real conductor**, a functional gap invisible to `cargo`-only verification since it's TypeScript, not Rust. `token` is optional, so it's now omitted (works for a single-app/no-auth-required conductor setup); a genuine admin-auth flow (connect an `AdminWebsocket`, call `issueAppAuthenticationToken`, pass the resulting `number[]`) is not implemented — a separate piece of work, not something to guess at without a real conductor to verify against. `npx tsc --noEmit` now passes clean.
- [x] **Membrane-scoped discourse health, and AttestationGrant (budget + tenure), shipped** — see §2.6's "how it actually works" notes for the full design of both. `GetDiscourseHealthPayload.domain: String` became `membrane: AnyDhtHash`, resolved to the real `Membrane` entry's own `domain` field — closing the gap flagged in the `AttestationPolicy` bullet above (an aggregate previously checkable against nothing). `is_agent_attested`/`IsAgentAttestedPayload` gained the same `membrane` field, since that's what makes the second half of this pass checkable at all: a new `LinkTypes::AttestationGrant` link type (Membrane → candidate agent), created via `grant_attestation`, requires the granter to prove — via a self-supplied-but-independently-verified `AgentToMembrane` join action, the same shape `assert_expertise`'s `WorldlineTrace` proof already uses — that they've belonged to the membrane long enough (a pure `tenure_satisfied` helper, five new integrity-zome tests), and is subject to its own SWO friction budget (5 grants/7 days/granter), enforced unbypassably in `validate_create_link`. `direct_attesters_of` now unions `AttestationGrant`-derived attesters with the existing `SynapticLink`-derived ones; `count_attestations_pure` itself needed zero changes, since the membrane is captured in a closure at the call site rather than threaded through the pure recursive walk. New convenience extern `get_my_membership_action` recovers a caller's own join action if they didn't keep `join_membrane`'s return value. All 44 existing coordinator tests still pass unchanged (this pass reshaped `direct_attesters_of`'s signature and closures, not `count_attestations_pure`'s own logic, so nothing there needed new tests beyond `tenure_satisfied`'s); the integrity zome's test count went from 5 to 10 with the new `tenure_satisfied` coverage. Both zomes still build clean, natively and for `wasm32-unknown-unknown`. This closes both gaps identified as genuinely unbuilt after cross-checking the Fractal Impedance Matching discussion against the shipped code — nothing from that discussion remains open.
- [x] **Bridge admin-auth flow shipped** — closes the gap flagged two bullets above ("this bridge has never actually been able to authenticate against a real conductor"). `HolochainClient#connect` now does the real flow against the installed `@holochain/client` 0.17.1: connects an `AdminWebsocket` to a separate, newly-required `HOLOCHAIN_ADMIN_URL` (the admin interface is a different port from the App API's `HOLOCHAIN_URL` — the conductor's config declares both independently, so one can't be derived from the other, documented in the new `bridge/.env.example`); calls `issueAppAuthenticationToken({ installed_app_id })` and passes the resulting byte token into `AppWebsocket.connect`, replacing the always-invalid `'bridge-auth-token'` string placeholder.
  **A second, deeper gap surfaced while implementing this, invisible until a real `callZome` was actually attempted:** this client's `callZome` signs every request via `getSigningCredentials(cell_id)` (`zome-call-signing.js`), which throws `NoSigningCredentialsForCell` unless `AdminWebsocket#authorizeSigningCredentials` has been called for that cell first. Fixing only the connection token would have left every `callZome()` in this file failing on its first real call regardless — the bridge would trade an authentication error for a signing error. `connect` now also reads the freshly-authenticated `AppWebsocket`'s own `appInfo()` (previously best-effort/non-fatal — now load-bearing, since `cell_info` is what gets authorized, so a failure here is now a hard startup error rather than a swallowed warning), extracts every provisioned/cloned cell's `CellId` via `CellType`, and calls `authorizeSigningCredentials` on each before the service starts listening for signals.
  **Still open:** none of this has been run against a real conductor yet — verified only by `npx tsc --noEmit` passing clean against the installed client library's own type definitions, the same verification bar the previous pass in this bullet's sibling above was held to. Live-conductor verification is the same gap Phase 2 already flags for the SSTorytime side (below) — this bridge and that integration are both blocked on the same missing piece: an actual running `hc` conductor in this environment.

### Phase 2: SSTorytime Integration
- [x] **`export_to_n4l` output verified against the real `N4L` Go binary** — see §5.2's "Verification status" note for the full account. Run end-to-end with a built-from-source `N4L` binary and a live PostgreSQL backend, against a real sample generated by actually calling this crate's `ToN4L` impls. Found and fixed two real defects: every `ToN4L` impl was missing N4L's mandatory `- <chapter title>` opening declaration (fatal, blocked 100% of output — `export_to_n4l` now emits one), and `WorldlineTrace`/`Constitution` baked loop indices directly into relation-name strings, which can never match N4L's fixed, pre-declared arrow vocabulary (fatal — fixed by moving indices to N4L's comma-delimited context-tag syntax on static, registered names instead). Also confirmed and documented that `arrows-epistemic.sst` must be merged into SSTorytime's 6 hardcoded config filenames, not merely placed alongside them — the real binary silently never reads a 7th file. A full multi-entry-type sample (including indexed `WorldlineTrace` periods and `Constitution` promises/conditions) now parses through `N4L -v` with exit code 0 and zero errors. All 44 coordinator unit tests still pass, including the one updated to match the new relation format.
- [x] **Local SSTorytime instance per agent, N4L ingestion pipeline, 3D graph visualization, and local cone paths navigation — all four shipped as `sstorytime/`, see its own README for usage.** All four turned out to be a deployment/wiring problem, not new algorithm or rendering code: SSTorytime already ships a real N4L compiler, an HTTP graph browser (`cmd/server`, HTML5-canvas-based — "3D" refers to semantic spacetime's own domain/modality/time coordinate space, §2.2, not literal WebGL), and a cone-path solver (`cmd/pathsolve`, backed by `GetConstraintConePathsAsLinks`/`GetFwdConeAsNodes`). What was missing was the glue: `sstorytime/setup.sh` clones+builds SSTorytime pinned to a specific commit, merges `n4l/arrows-epistemic.sst` into its 6 hardcoded config files (idempotently, rebuilt fresh each run — never appended-to in place), generates the visualization server's TLS cert, and creates the `sstoryline` Postgres role/db if missing. `sstorytime/ingest.sh` runs the real `N4L -u` upload path. `sstorytime/serve.sh` and `sstorytime/cone-path.sh` wrap the other two binaries.
  **Verified end-to-end, not just wired:** all four scripts were actually run against `sstorytime/fixtures/sample_export.n4l` (the same sample verified in §5.2) on a real local Postgres instance. `setup.sh`/`ingest.sh` ran clean (exit 0, zero warnings) only after a real finding this pass surfaced: `arrows-epistemic.sst` had redefined three arrows — `has description`, `describes`, `has condition` — that SSTorytime's own stock vocabulary already provides under the same long name, which N4L flags as a redefinition warning during upload (non-fatal, but a real collision). `has description` is genuinely used (`Membrane::to_n4l`) and now simply resolves via the stock arrow instead of a redundant local one — no Rust code change needed, since `to_n4l` only emits relation text, never a short code. `describes` and `has condition` were dead entries, never emitted by anything, and were removed outright. After that fix: `ingest.sh` uploaded cleanly (33 nodes, 741 arrows); `serve.sh`'s `/searchN4L` endpoint, queried directly, correctly returned our ingested Claim/Critique with real relation names (`is critiqued by`, `target type`, `critique mode`, ...) and spatial coordinates; `cone-path.sh` found five real paths between our Claim and Critique nodes with computed betweenness centrality. One usage caveat surfaced and documented in `cone-path.sh`'s own header: `-begin`/`-end` match via Postgres full-text search against node text, so they need a short keyword (`"pelvic"`), not the full literal sentence a node contains — a full-sentence match silently fails at node lookup before any path search runs, confirmed directly rather than assumed.
  **What's still open:** all of this is verified against a fixed fixture sample, not a live Holochain conductor — ingesting real `export_to_n4l` output from a running `hc` conductor needs the Holochain toolchain installed, which this pass deliberately did not take on (see `sstorytime/README.md`'s own note on this). That remains this project's next real integration gap, not a hidden one.
- [x] **Live-conductor verification closed — the gap flagged above and the bridge's own "still open" note (§5.4) are both resolved.** Holochain toolchain (`hc`/`holochain` 0.4.4) installed; `hc dna pack`/`hc app pack` run for real, surfacing and fixing the stale bundle paths in `dna/dna.yaml`/`happ.yaml` (both still pointed at a repo-root `target/` that can never exist under this project's two-crate, no-workspace layout — see those files' own new comments). A real `hc sandbox` conductor was brought up (`--in-process-lair`, since a standalone `lair-keystore` binary isn't part of the `hc`/`holochain` release artifacts and wasn't separately installed) and a real `create_claim` zome call executed against it end-to-end — proof the wasm actually runs under the real Holochain host, not just links (§6.2's `.cargo/config.toml` note) or type-checks.
  **Two real, previously-invisible bugs surfaced only by actually running the bridge against this live conductor, both now fixed:** (1) `HolochainClient#connect` in `bridge/src/index.ts` never set `wsClientOptions.origin` on either websocket connection — the underlying `ws` client, unlike a browser, sends no `Origin` header by default, and a real conductor's admin/app interface hard-rejects a handshake with none (`HolochainError [ConnectionError]: ... Unexpected server response: 400`) even under an `allowed_origins: Any` policy, since "Any" means any origin *value* is accepted, not that the header may be absent. Invisible to `tsc --noEmit` (a runtime handshake behavior, not a type error) and to every prior check in this project, all of which stopped at compilation. (2) `@holochain/client`'s declared `"libsodium-wrappers": "^0.7.13"` resolves, as of this pass, to `0.7.16` — whose published npm tarball ships a broken ESM entrypoint (`dist/modules-esm/libsodium-wrappers.mjs` imports a sibling `./libsodium.mjs` that the tarball never includes), which is fatal at import time for any consumer, since `@holochain/client` is itself pure ESM (`"type": "module"`) and Node's ESM loader has no fallback here. Fixed via a `bridge/package.json` `overrides` pin to `libsodium-wrappers@0.7.13` — the last version before the package split its ESM/CJS builds apart, still within `@holochain/client`'s own declared range, with no `exports` map so Node's ESM loader correctly falls back to the working CJS build via interop.
  **Verified, not just fixed:** with both fixes applied, a standalone harness replicating `HolochainClient#connect` exactly (`AdminWebsocket.connect` → `issueAppAuthenticationToken` → `AppWebsocket.connect` with the real token → `appInfo()` → `authorizeSigningCredentials` per cell) ran clean against the live sandbox conductor, followed by a real signed `callZome` (`export_to_n4l`). The real `bridge/` now also builds clean (`npm run build`) with the fix in place. Real conductor output was then written to `sstorytime/fixtures/live_conductor_export.n4l` and ingested via `sstorytime/ingest.sh --wipe` into the local SSTorytime instance (6 nodes, 741 arrows) — `serve.sh`'s `/searchN4L` endpoint, queried directly, correctly returned the live-conductor claim with its real relations (`asserted by`, `has domain`, `has confidence`, `has dht hash`, `has tag`) and actual DHT hash, closing the loop this section's "what's still open" note above named as the next integration gap. Twitter-side posting itself remains unverified — no live Twitter API credentials were exercised this pass — but that's a credentials/API-access question, not a code-correctness one; the Holochain-facing half of the bridge is now proven against a real conductor.

### Phase 3: HRR Implementation
- [x] **Local HRR compressor, vector binding/unbinding protocol, worldline binding, and a first real increment of peer HRR query support — all shipped in `dna/coordinator/src/lib.rs`, verified against a live conductor, not just unit-tested.** Plate 1995 circular convolution (`hrr_bind`)/circular correlation (`hrr_unbind`)/superposition (`hrr_superpose`) over fixed 512-dimension `f32` vectors (2048 bytes — well under `validate_worldline_trace`'s existing 64KB `trace_payload` cap), with atomic symbol vectors derived deterministically from a symbol string via SHA-256-seeded splitmix64 (no new dependency — `sha2` was already in use for `compute_merkle_root`) rather than any external RNG or FFT crate, matching this codebase's established preference for small, hand-rolled, directly-tested pure math over new dependencies. Nine new unit tests cover the actual guarantees this depends on: determinism, unit length, low similarity between unrelated symbols (empirically < 0.3 at this dimension), single-pair bind/unbind fidelity (empirically ~0.75 — a real measured number, not an assumed theoretical one, and the test asserts against what was actually observed), a superposition of three bound pairs still resolving each one's own correct period index as its top match, and an exact (non-lossy) byte codec round-trip — the codec is plain serialization, only the HRR math itself is lossy by construction.
  `generate_worldline_trace` now populates `WorldlineTrace.trace_payload` (the superposed `(domain_tag ⊛ period_index)` vector across every real period the chain scan already computes) and `binding_key` (a versioned scheme descriptor, `"hrr-v1;dim=512;pos=period_index"` — not a secret, since every quantity the scheme needs is a pure function of that string alone; its job is forward compatibility, so a future scheme bump fails loudly on an old trace instead of silently misreading its bytes). New `query_worldline_resonance(agent, domain_tag, max_periods)` extern is the first real "peer HRR query support" increment: given a peer's `AgentPubKey` — the same public identifier `get_agent_worldline_trace`/`assert_expertise` already take — it unbinds that peer's trace and ranks candidate period indices by resonance, the literal capability §2.5 names ("peers can unbind this vector to find relevant time periods without traversing the full chain"). Read-only, approximate by construction, and never a substitute for `period_boundaries` itself, which remains the exact answer — the same "receiver, not truth engine" split §2.5 draws everywhere else for HRR.
  **Verified live, not just wired:** with three real claims created in distinct domains (`LumbarRehab`, `Nutrition`, `HipMobility`) against a real `hc sandbox` conductor (`scripts/sandbox.sh`), `generate_worldline_trace` produced a real 3-period trace with a `trace_payload` of exactly the expected 2048 bytes; `query_worldline_resonance`, called once per domain, correctly ranked each domain's own real period index first every time, by a wide margin over the noise floor (~0.47–0.52 similarity for the correct period vs. ~0.01–0.08 for the wrong ones) — the actual "index, not exact store" capability this section claims, confirmed against real DHT data, not a fixture.
  **A real, pre-existing, previously-undetected bug surfaced and fixed along the way, unrelated to HRR itself:** `get_agent_worldline_trace` (and, it turned out, seven other functions across this file — `get_claims_by_agent`, `get_my_latest_worldline_checkpoint`, `get_critiques_for`, `get_twitter_replies_for_claim`, `get_mews_by_agent`, `get_retractions_for_claim`, `get_agent_constitution`) all read a link's target via `EntryHash::try_from(link.target)`, but every one of their corresponding `create_link` calls actually targets the entry's own `ActionHash` (`create_entry`'s return value, passed straight through, never converted) — a genuine hash-type mismatch that made the `TryFrom` fail and, caught by nothing but a silently-swallowed `if let Ok(...)`, made every one of these eight functions return empty/`None` unconditionally, on any real conductor, regardless of how much real data actually existed. Invisible to `cargo check`/`cargo test` (a failed `TryFrom` is a valid, non-panicking runtime `Err`, and none of these functions were ever exercised in this project's unit tests, which need live host calls this crate's `Cargo.toml` already documents as unmockable this pass) — caught only because `query_worldline_resonance`'s own live verification depended on `get_agent_worldline_trace` actually working, surfaced the same way `get_claims_by_agent` was cross-checked directly against the same live conductor to confirm the bug wasn't HRR-specific. Fixed uniformly (`ActionHash::try_from` in place of `EntryHash::try_from` at all eight sites) and re-verified live: `get_claims_by_agent`, previously returning `[]` against three real claims from their own author, now returns all three. `get_critiques_for`'s own doc comment previously asserted the opposite of what the code actually did ("always an EntryHash in practice, since create_critique never converts it") — corrected in place, with the real story left in the comment rather than just deleted, matching this codebase's existing convention of documenting confirmed-wrong assumptions where they were made, not just silently fixing them.
  **Deliberately not built in this pass:** neighborhood binding — §2.5 is explicit that it's a separate, independent roadmap item, not an implied consequence of worldline binding shipping (shipped in its own pass, next bullet). `query_worldline_resonance` is a first increment of peer query support, not its final shape: it takes an `AgentPubKey` the caller already has (the same "no way to enumerate peers" limitation `AttestationPolicy`/`get_grounding_path` already live with), and an FFT-based O(n log n) convolution was deliberately skipped in favor of the current O(n²) direct sum — HRR_DIM=512 keeps that cheap enough for something that only ever runs locally, never in a validation hot path.
- [x] **Neighborhood binding shipped — §2.5's independent second HRR use case, and its own constraint table, both closed out.** New `build_neighborhood_binding(claim_hash)` compresses a Claim's local neighborhood — its direct `evidence_hashes` citations plus every `get_critiques_for` result — into a `NeighborhoodBinding`, reusing every HRR primitive worldline binding already shipped (`hrr_bind`/`hrr_superpose`/`hrr_cosine_similarity`), with its own versioned `binding_key` (`"hrr-neighborhood-v1;dim=512;pos=source_hash"`). Deliberately writes nothing to the DHT — §2.5's constraint table requires neighborhood binding be "a reading lens, never a second record," so this recomputes fresh from real data on every call rather than introducing a new persisted entry type; a caller who wants to reuse one caches it locally, which is what "runs locally" already means for worldline binding too. New `recall_neighborhood(corpus_payload, binding_key, candidates)` is the associative "what's near this claim" query: given caller-supplied `(hash, role)` candidates — not the binding's own already-labeled `source_hashes`, which would make the probe answer a question the caller already had the answer to — it scores each by correlating the corpus directly against that candidate's own bound-pair vector, the standard VSA "clean-up" membership test. Both mandatory constraints from §2.5's table are met structurally: `build_neighborhood_binding`'s output always carries its real `source_hashes`/`neighbor_kinds`, and every `NeighborRecall` echoes back the exact `source_hash` its score is about — never a bare number with nothing to check it against. Four new unit tests cover the pure math directly (role-symbol separation, hash-symbol determinism, a binding_key compatibility guard) plus the actual discrimination property recall depends on: a real member scores clearly above the same hash probed under the wrong role, and clearly above a hash that was never bound in at all.
  **Verified live, not just wired:** against the same real `hc sandbox` conductor, with a real `Evidence` entry, a real `Claim` citing it, and a real `Critique` targeting that claim all created live, `build_neighborhood_binding` correctly found exactly one Evidence neighbor and one Critique neighbor with a 2048-byte corpus; `recall_neighborhood`, probed with four candidates, scored the two real members at 0.72 (the critique, correct role) and 0.67 (the evidence, correct role) against 0.03 (the evidence hash probed under the wrong role) and −0.005 (a hash never bound in at all) — the exact discrimination pattern the unit tests predicted, confirmed against real Claim/Evidence/Critique data, not a fixture.
  **Not tested, by §2.5's own account:** the sybil-resonance property §2.5's constraint table names ("a probe over real, independently-created bindings should measurably fail to recall a claim whose only reinforcement comes from within its own sybil ring") is explicitly recorded there as an unverified design hypothesis, not a built mechanism — nothing above claims to test or guarantee it; it inherits whatever that property turns out to be from the same superposition math already in use, no new claim is made about it here.

### Phase 4: Advanced Features
- [ ] Immune system (AntibodyPattern)
- [ ] Synaptic plasticity (conductance updates)
- [ ] Cross-domain critique links
- [ ] Token/cost layer (burn-to-deploy for domains)
- [ ] Mobile UI for practitioners

### Phase 5: Generalization
- [ ] Protocol specification document
- [ ] New domain templates (climate, nutrition, etc.)
- [ ] Federation between domain membranes
- [ ] Academic validation study

---

## Appendix A: The 10 Invariants

1. **Never compute or expose a canonical, comparative reputation score.** Raw promise-keeping history stays open and queryable — nothing is hidden or deleted. But no karma, no stars, no trust index, and no sorted "top agents" or "top species" leaderboard. Interpretation of that history stays local to the observer, per Promise Theory's subjective-trust model.
2. **The topology is the truth function**, not an algorithm.
3. **Every claim carries its own history.**
4. **Every critique is typed, not flattened.**
5. **Every domain is a sovereign membrane.**
6. **Nothing is deleted — only witnessed or atrophied.**
7. **The bridge must preserve dimensionality**, not extract it.
8. **Agents are cells with membranes**, not users with accounts.
9. **Death is required** — unused entry types and membranes must atrophy.
10. **The system doesn't compute truth. It creates conditions for truth to resonate.**

*A note on Invariant 7:* this means the DHT's own dimensionality must never be flattened by the bridge's presence — not that every external platform the bridge touches can itself carry that dimensionality. Inbound (Twitter → DHT), the invariant holds fully: replies become typed `ExternalCritique` entries, not flattened text. Outbound (DHT → Twitter), a 280-character platform cannot carry a typed critique graph by construction, so the bridge sends a lossy excerpt plus a link back to the full record instead. The invariant is satisfied by making that loss legible and one-directional — the DHT stays the sole source of truth — not by pretending the excerpt is dimensionally complete.

*A note on Invariant 1:* this wording was tightened after review — the original text ("never compute a reputation score") was true to the letter but incomplete in spirit, since `WorldlineTrace.expertise_tags` and the old `CritiqueSpecies.adoption_count` functioned as de facto reputation signals even without a single scalar score. Three concrete fixes closed that gap: (1) `adoption_count` was removed as a stored, self-declared field and replaced with `get_critique_species_adoption_count`, a live, per-species, unranked query over real `CritiqueToSpecies` links; (2) `SynapticLink` creation carries SWO temporal friction (§2.3, §5.2–5.3), enforced as real DHT validation via `must_get_agent_activity`, so mass-producing adoption signals is slow rather than free; (3) expertise can now be formally asserted via `assert_expertise` as a real, critiquable `Claim` rather than an unaccountable string tag — `expertise_tags` itself remains an informal, non-authoritative index. Together these satisfy Promise Theory's actual model: history stays open, nothing is ranked by the protocol, and the only thing made expensive is fabricating signal quickly.

---

*End of document*
