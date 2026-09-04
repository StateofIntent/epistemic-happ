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
- **Mesh topology** between domains (cross-domain critique links) creates the same multi-pool structure — `get_cross_domain_critiques` (§9, Phase 4) makes this real and queryable rather than just descriptive
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

**Conductance atrophy, how it actually works:** the `f32` conductance written into a `SynapticLink`'s `LinkTag` at creation is now explicitly its *initial* value only — `LinkTag`s can't be mutated, so it never changes. What actually matters is `get_effective_conductance`, computed fresh on every call from two decaying contributions: the base conductance decaying since the link's own creation, plus one decaying contribution per `Reinforcement` link (a new link type — an agent calling `reinforce_synaptic_link` on a `SynapticLink`'s own `ActionHash` to record "I resonate with this," found via the new `find_synaptic_link` lookup, since `create_synaptic_link`'s return value isn't surfaced through `create_critique`). Both terms use `2^(-elapsed / half_life)` (a 30-day half-life by default) — exactly 1.0 at the moment of the event, exactly 0.5 one half-life later, and so on — so a reinforcement itself fades in significance the same way the base does, rather than permanently propping a link up. `Reinforcement` gets its own SWO temporal friction budget (separate from `SynapticLink`'s, since reinforcing is a cheaper, more casual act), enforced both coordinator-side and — the real, unbypassable layer — in `validate_create_link`, which also confirms a `Reinforcement`'s target is the reinforcing agent themselves (never claimed on someone else's behalf) and that its base really is a `SynapticLink` creation, not an arbitrary hash. This is the honest resolution to this project's own sybil-farming discussion: it's containment, not prevention — nothing here raises the cost of *creating* a `SynapticLink`, only the cost of one *staying load-bearing*. A flood of un-reinforced links stays fully present in the record (Invariants #6 and #9 — nothing deleted, atrophy required) but decays toward zero in any conductance-weighted read. Nine unit tests cover the decay math directly: the half-life lands exactly where claimed, decay is monotonic, un-reinforced links keep shrinking without plateauing, a recent reinforcement measurably lifts a decayed link, and an old reinforcement matters less than a recent one. Wiring `get_effective_conductance` into `get_discourse_health` as an actual filter is now done — see the Phase 1 roadmap bullet "`ConductancePolicy` shipped" — but the same wiring into other read paths remains a further step. **A timing gap worth stating plainly:** decay is a function of elapsed time, and a link starts at full initial conductance the moment it's created — "noise fades so it's safe to ignore" only becomes true over the half-life, not immediately. A freshly created noise link can still be retrieved at close to full weight by anything querying shortly after it appears; nothing here accounts for that window.

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
│  HUMAN AGENT — the interpreter with stakes                                  │
│  • Reads 3D semantic manifold (SSTorytime)                                  │
│  • Writes typed critiques — how a claim acquires status                     │
│  • Makes voluntary promises (Promise Theory binding)                        │
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
| Immune system | AntibodyPattern | `AntibodyPattern` entry type + `publish_antibody_pattern`/`get_antibody_patterns_for` (§9, Phase 4) |
| Homeostasis | Discourse health monitoring | `get_discourse_health` |

### 4.3 The Epistemological Foundation — and what replaced the physics framing

**This section previously held a "Quantum → Classical Mapping" table** — superposition/measurement/entanglement/decoherence/no-cloning/wavefunction/observer, each mapped to a protocol concept. It has been removed rather than softened, and the reasoning is worth keeping because the table was not harmless.

Non-locality in physics is a specific, measurable phenomenon: correlations violating Bell inequalities, which no local hidden-variable process can explain. DHT gossip is the opposite of that. Every message travels node-to-node bounded by ordinary network latency, fully explicable by classical causal propagation — **maximally local**. "Vacuum state," "wavefunction" and "measurement apparatus" are likewise precise terms with mathematical definitions in quantum field theory; applying them to a DHT identified no mechanism, it borrowed vocabulary because the analogy felt apt. A useful test: *if a sentence stays true after replacing "quantum" with "complicated," no quantum mechanism was doing work in it.* Every row of that table failed it.

To a technically literate reader the table also undermined trust in the parts of this project that are well-reasoned, which is the practical reason it is gone rather than merely qualified.

**Two adjacent arguments are recorded here because they are the next places this reasoning tends to go wrong.** First, *relativity supplies no substitute*: an "observer" in relativity is any reference frame or measuring instrument, the effect depends on relative velocity and gravitational potential, and it produces differences on the order of nanoseconds for anything earthbound. Network latency between DHT nodes — hundreds of milliseconds — has nothing to do with it, and "human observers at different nodes correlate the way relativistic frames do" equivocates between two unrelated technical senses of the same word. Second, *physical reductionism cannot be applied selectively*: if "it is just electrons in silicon" is grounds to deny an LLM any deeper status, the identical argument applies to every Holochain node, since hashing, gossiping and validating are also voltage changes in doped silicon. Whatever distinction is being drawn between human and synthetic participants — see §4.3's third calibration below — it cannot be a substrate argument, because both sides run on the same substrate.

**Two things that look similar are deliberately kept**, because they are their frameworks' own vocabulary rather than physics imported for effect. *Superposition* in the HRR sections (§2.5, §5.3) is the established name for the element-wise bundling operator in vector-symbolic architectures (Plate 1995), not an appeal to quantum states. *Semantic Spacetime* and its curved manifold are Burgess's own defined terms, and §2.2 already states the disanalogy with Einstein's spacetime explicitly.

**What the design actually rests on, stated positively.** No single sense-apparatus is a self-certifying source of truth — mine or anyone else's. The pramāṇa tradition (Dignāga, Dharmakīrti) develops this into a theory of how knowledge is validated: through recognised means of knowing that must themselves be checked, and through convergence across independent instances of them. Nāgārjuna's Madhyamaka sharpens it: nothing possesses *svabhāva*, inherent self-standing existence, and things arise only dependently, in relation to conditions and observers. Applied here: **a claim's epistemic status is not a property it holds on its own.** It exists only relationally, as a function of how other bounded agents have critiqued, corroborated or contested it.

Burgess supplies the mechanism in his own vocabulary. An agent's interior — its private reasoning, its unshared data — sits behind an *event horizon* by construction, not by any physical barrier, and becomes visible only through what the agent voluntarily promises to expose. What crosses that boundary is exactly the material available for cross-checking by other bounded agents. **In this implementation the boundary is `create_entry` itself** — unpublished reasoning is not hidden on the DHT, it is absent from it, which is a stronger form of the same property (§9 records why a private-entry mechanism would have been weaker, not stronger). This needs no non-locality, entanglement, or vacuum state: only bounded agents, voluntary disclosure, and a graph in which truth-status is relational.

**Three calibrations, because a foundation is easy to over-claim** — the same discipline `docs/metabolic-biosignalling-currency-brief.md` §5.1 applies to this project's biological metaphor:

1. **The epistemological claim is adopted; the metaphysical one is declined.** "No single observer's report is self-certifying, and validity emerges relationally" is well-founded and directly usable. "Observation *constitutes* reality" — closer to Wheeler's participatory universe, or contested idealist readings of Yogācāra — is a distinct and live philosophical dispute that this design takes no position on and does not need to. Nāgārjuna's own conclusion is in fact *more* deflationary than "we jointly build a shared reality"; his target is the absence of any fixed ground, including that one.
2. **This is articulation, not derivation.** Invariant #1 (no canonical comparative score), Invariant #4 (every critique is typed, never flattened to one bit), and the prohibition on deletion were all built and justified before this framing was written down, from Promise Theory and from the codebase's own reasoning. Note that `CritiqueMode`'s five non-fungible modes are already the pramāṇa point about distinct means of knowing — arrived at independently. **The framework explains and reinforces what exists; it is not evidence for adding anything.** Applying §4.3's own test: "a claim's status is a function of how other agents engaged with it" stays true with the citation deleted, so Madhyamaka supplies lineage and vocabulary rather than mechanism. That is worth having and is a weaker claim than "foundation" usually implies.
3. **What makes cross-checking trustworthy is a social precondition, not a protocol guarantee.** The account above works because the checking is done by genuinely independent observers with real stakes. **This protocol cannot verify any of that.** Identity creation is free, sybil resistance is open (§2.3), and ten independent people are indistinguishable to it from ten sybils of one. The epistemology is sound; the guarantee that its conditions hold lives outside the software, in the same place §2.3's honest ceiling already puts it.

### 4.4 Two constraints on any UI built for this protocol

Both follow directly from §4.3 and from Invariant #1, and both are far cheaper to state now than to retrofit once an interface exists. They are written for whoever builds a client — including an AI asked to generate or evolve one — because neither is obvious from general UI practice, and a good UI designer following ordinary instincts would violate both.

**1. A UI may be a lens the user aims. It must not be a lens that aims itself and conceals that it is aiming.**

This protocol deliberately computes no canonical, comparative score (Invariant #1), and two mechanisms have been removed for approaching one — `get_credit_balance`, whose per-agent scalar any client could enumerate and sort, and `get_attestation_weight`. But a client can reintroduce exactly what the protocol declined to build. A UI that "adapts to its user" by observing whose claims they engage with, then quietly ranking, reordering or hiding accordingly, has computed a reputation score in the browser. The protocol is not violated; its whole point is.

The distinction that keeps this honest already exists in the design. `AttestationPolicy` and `ConductancePolicy` are lenses the **caller aims** — the roots and thresholds are supplied explicitly, per call, by whoever wants them, and two callers legitimately get different answers because they asked different questions. A UI is welcome to expose those, remember a user's chosen policy, surface affordances, and adapt density and navigation. It must not infer a credibility ordering and present the result as neutral. If the interface is filtering, the user must have chosen the filter and be able to see it.

**2. Chrome may adapt. The artifact under evaluation must not.**

§4.3's account requires that a claim's status emerge from independent agents cross-checking one another's disclosures. That presupposes a **shared referent**: when I critique a claim and you evaluate my critique against it, we must have been looking at the same thing. A per-user generated or evolving presentation breaks this silently — the cross-check degrades and nobody can see that it has, because neither party can observe the other's rendering.

So: claim text, its critiques, their `CritiqueMode`s, authorship and ordering should render identically for every viewer. Navigation, layout, information density, onboarding, theming and progressive disclosure may adapt freely. This constraint is peculiar to this protocol and has no analogue in software that merely presents information — a game has no requirement that two players evaluated the same artifact identically, which is exactly why borrowing wholesale from game UI practice needs this guardrail attached.

### 4.5 What Transfers From Game Interfaces, and What Doesn't

The guardrails above exist because the question that prompted them was a good one: game interfaces are the most refined body of practice we have for making a complex, stateful world legible to someone standing inside it, which is exactly the problem this protocol's UI has. Four patterns transfer. Two, tempting ones, do not.

**Transferable — all four now built:**

| Pattern | What it means here | Status |
|---|---|---|
| **Resource meters / HUD** | Epistemic state the protocol already computes, shown continuously rather than discovered by hitting it — the SWO critique budget as a depleting bar, effective conductance, discourse health, antibody flags | §9 Phase 4 |
| **Spatial navigation** | The critique graph as a structure you move through, not a flat list — critiques of critiques have real depth and it should be walkable | §9 Phase 4 |
| **Progressive disclosure** | Staging *explanation* for a newcomer, never the artifact under evaluation — §4.4's second constraint draws that line and it is not negotiable | §9 Phase 4 |
| **State-driven affordance surfacing** | The interface shows what you *can* do right now, so you never attempt what the protocol will refuse | §9 Phase 5 |

The fourth is the subtlest and was the last built, so it is worth stating what it actually requires. **An affordance may be gated only on a rule the protocol itself enforces, never on the interface's own judgement** — that is the line between surfacing a rule and quietly becoming §4.4's self-aiming lens. Gating the critique form on a spent SWO budget is legitimate because `get_synaptic_link_friction_status` derives `blocked` from the same count, the same window, and the same source chain that `check_synaptic_link_friction` refuses on; the UI is re-deriving the conductor's answer, not forming an opinion. Gating anything on inferred credibility would not be legitimate, however reasonable it looked.

Two further rules follow, both learned by building it:

- **Hide only what is structurally impossible; disable and explain what is merely unavailable now.** Retraction on someone else's claim is hidden, because validation permits only the author and its absence tells no lie. A spent critique budget instead leaves the form visibly present, visibly unavailable, and stating why — it is this agent's own transient state, an hour from being false, and hiding it would conceal a rule the practitioner needs in order to plan around it.
- **Never gate on unknown state.** When the status read fails or has not returned, the action stays available. Guessing "blocked" from missing information refuses something the protocol would have allowed, which is a worse failure than the opaque error the gate exists to remove.

**Not transferable, and declined deliberately:**

- **Immediate-mode canvas rendering.** It costs text selection, deep linking and screen-reader access — a real regression, not a theoretical one, with LumbarRehab (a clinical rehabilitation domain) as the reference domain.
- **A continuous tick loop.** Discourse is event-driven and mostly static. There is no world simulating itself between a claim and its critique, and a render loop would burn battery to animate nothing.

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
├── mobile-ui/
│   ├── package.json                # Node.js dependencies (Vite + @holochain/client)
│   ├── index.html                  # Entry point
│   ├── src/
│   │   ├── holochain.ts            # Conductor connection + zome-call layer
│   │   ├── types.ts                # Claim/Critique field shapes, mirroring the DNA
│   │   ├── main.ts                 # Screens (Connect, Browse, New Claim) — vanilla DOM, no framework
│   │   └── style.css
│   ├── public/
│   │   ├── manifest.webmanifest    # PWA manifest
│   │   ├── sw.js                   # Minimal service worker (installability)
│   │   └── icon.svg
│   └── README.md                   # This app's own build/run/verification account
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

- **Rust** ≥ 1.88 with the `wasm32-unknown-unknown` target
  (`rustup target add wasm32-unknown-unknown`). Holochain 0.7 raised the
  minimum from what 0.4 needed; this project is developed on 1.98.
- **Node.js** (v18+) and npm
- **Holochain 0.7.0** — both the conductor and the `hc` CLI, installed from
  crates.io and pinned to the same version as the `hdk`/`hdi` pins in
  `dna/*/Cargo.toml`:

  ```bash
  cargo install holochain     --version 0.7.0 --locked
  cargo install holochain_cli --version 0.7.0 --locked   # provides `hc`
  ```

  These land in `~/.cargo/bin`, which is **not** on the default `PATH` in
  every shell — `scripts/sandbox.sh` works around that with `-H`
  (`--holochain-path`) rather than mutating the caller's `PATH`. A
  standalone `lair-keystore` binary is not part of either release artifact
  and is not needed: the sandbox runs with `--in-process-lair`.

  The version matters. Holochain manifests are `deny_unknown_fields` and
  the manifest schema changed at 0.6, so `dna/dna.yaml`, `happ.yaml` and
  `web-happ.yaml` in this repo (`manifest_version: "0"`, `path:` rather
  than `bundled:`, no `origin_time`/`quantum_time`) will not parse under a
  0.4 or 0.5 `hc`, and vice versa.
- **`kitsune2-bootstrap-srv`** — only for the multi-node network
  (`scripts/network.sh`); the single-node sandbox does not need it.
  Holochain 0.7 removed `hc run-local-services`, and this binary is what
  replaced it: one process serving both the bootstrap service and an
  embedded iroh relay.

  ```bash
  cargo install kitsune2_bootstrap_srv --version 0.5.1 --locked
  ```

  0.5.x is the kitsune2 line holochain 0.7.0 itself builds against.
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

With a conductor up, `scripts/live-verify/` holds the harnesses that
drive it — nineteen of them, each proving one property against real zome
calls and real DHT validation, several of them through a real
Playwright-controlled browser against the production UI bundle. That
directory's own README says what each one covers, and carries the rule
that governs running them: **one clean conductor per harness, not one
before the batch.** They assert exact counts and spend real per-agent,
per-hour friction budgets, so a runner that starts one conductor and
loops over the files will report failures that are not real.

```bash
scripts/sandbox.sh clean && scripts/sandbox.sh start   # before EACH harness
node scripts/live-verify/<harness>.mjs
```

`real-gossip.mjs` is the one exception: it ignores this conductor
entirely and needs the three-node network of §6.6b instead.

### 6.6b Run a Real Network (three conductors that can actually reach each other)

`sandbox.sh` starts **one** conductor with no networking at all — that is
what `hc sandbox` produces by default, and the generated config says so
outright:

```yaml
network:
  transport_pool: []          # no transport. Nothing to gossip over.
  bootstrap_service: null     # no peer discovery. Nobody to gossip to.
```

That is fine for almost everything in `scripts/live-verify/`, whose
multi-agent harnesses install their extra agents on that single conductor
and ask questions about *visibility* — what one agent can and cannot find
of another's work. It cannot answer a question about *propagation*, and
this document has asserted one since Phase 1: "gossip protocol is wave
propagation — information ripples through the network organically."

`scripts/network.sh` (see its own header for the full account) builds the
arrangement that makes that checkable — a local bootstrap server with an
embedded iroh relay, and three conductors against it:

```bash
scripts/network.sh start    # bootstrap + relay :8893, and three conductors:
                             #   nodeA  admin :8899  app :8898   seed "netverify-seed-1"
                             #   nodeB  admin :8897  app :8896   seed "netverify-seed-1"
                             #   nodeC  admin :8895  app :8894   seed "netverify-seed-2-isolated"
scripts/network.sh status   # what is up, on which ports
scripts/network.sh stop     # stop everything, keep DHT state
scripts/network.sh clean    # stop + delete all state
scripts/network.sh addrs    # the bootstrap/relay URL in use

scripts/network.sh stop-node nodeB    # take ONE node offline, leave the rest up
scripts/network.sh start-node nodeB   # and bring it back
```

The last two are how `scripts/live-verify/partition-rejoin.mjs` partitions
the network mid-run: taking a conductor offline is an unambiguous
partition, unlike blocking traffic between two processes that are both
still running.

**nodeA and nodeB share a network seed**, so they install identical DNA
hashes and are on the same DHT. **nodeC differs in the seed alone** —
same `.happ`, same wasm, same bootstrap and relay, same machine
— so it is on a different DHT and can never receive anything the other
two exchange. It exists so that "nodeB received it over the network"
cannot be quietly confused with "any conductor pointed at these services
would have shown it." Without nodeC, a harness watching only nodeB prove
positive is an anecdote.

The ports are deliberately disjoint from `sandbox.sh`'s 8888/8889, so
this network and the single-node sandbox can both be up without either
noticing the other.

With it up, `node scripts/live-verify/real-gossip.mjs` asks whether an
entry crosses between two conductors at all, and
`node scripts/live-verify/partition-rejoin.mjs` asks the harder version:
whether a node that was *offline* while history was written catches up
when it returns. The second takes about nine minutes, most of it spent
waiting out a real gossip backoff rather than doing anything.

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

### 6.9 Package the Installable Bundle

Everything above builds this protocol for *the person who has the source
tree*. This step builds it for everyone else: a single
`epistemic-resonance-happ.webhapp` containing the DNA, the hApp, and the
practitioner UI, which a Holochain Launcher installs on its own.

```bash
cd epistemic-happ
scripts/pack-webhapp.sh
```

That one script replaces §6.2, §6.3, a UI build, and a zip step, in that
order — see its header for why each of them has a constraint that is not
guessable and was learned the expensive way. It genuinely runs the §6.2
`cargo build`s now; it did not until the live-verify suite was caught
passing a deliberately broken zome, because `hc dna pack` packages the
wasm on disk rather than compiling it. The output is
gitignored on purpose: the bundle to hand someone is the one just built,
not a stale copy found in the tree.

**Installing it.** Open a Holochain Launcher, choose to install a hApp
from a file, and select the `.webhapp`. The Launcher creates the agent
key, installs the DNA, and serves the UI itself.

**What changes when it is installed, and why that needed code.** A
Launcher-installed UI runs in a genuinely different environment from the
one every other instruction in this section produces, and the difference
is not cosmetic:

| | Developing against your own conductor | Installed from the `.webhapp` |
|---|---|---|
| Who issues the app auth token | the UI, over the Admin API | the Launcher, before the UI loads |
| Admin API reachable from UI code | yes | **never** |
| Who signs zome calls | the UI, with credentials it authorized | the Launcher's own host signer |
| Connection settings shown | admin URL, app URL, app id | none — there is nothing to ask |

The middle row is the load-bearing one. The UI's original connect flow
opened an `AdminWebsocket` as its *first* action, so inside a Launcher
it would have thrown before rendering a single screen — a dead bundle,
not a degraded one. `mobile-ui/src/holochain.ts` now detects the host
environment and takes a path that never touches the Admin API; its
header comment documents both shapes in full.

**How far this is verified, and where that stops.**
`scripts/live-verify/launcher-packaging.mjs` runs the UI against a live
conductor with a launcher environment injected, and confirms it connects
with no user action, renders no connect form, publishes a claim that an
independent client then reads back off the DHT, and does all of it with
its saved admin URL pointed at a dead port — so a successful connection
is positive evidence the Admin API was never opened, rather than an
assumption. That harness was checked against a negative control: with
launcher detection forced off, it fails, which is the only reason its
passing means anything.

What is **not** verified: no real Holochain Launcher is installed in
this environment, so the bundle has never been installed by one. The
harness reproduces what a Launcher injects — the environment and a
host-side signer that lives outside the page — and is faithful in the
respect that decides this code path, but it is a stand-in. Two things
follow from that honestly: the `.webhapp` packs, unpacks and contains
what it should (checked directly, by unpacking it), and the UI works
under a faithful simulation of the host; a genuine first install is the
next real verification gap, and it is this one, not a hidden one.

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
- [x] **`ConductancePolicy` shipped — `get_effective_conductance` wired into `get_discourse_health` as an actual filter, closing the gap the Conductance Atrophy note above and the "not done in this pass" line beside it both flagged as still open.** New opt-in `conductance_policy: Option<ConductancePolicy>` field on `GetDiscourseHealthPayload`, following the exact shape `attestation_policy` already established: `None` (the default a caller gets by simply omitting the field) is exactly the old, unfiltered behavior — every critique in the domain counts regardless of decay. `Some(ConductancePolicy { min_effective_conductance })` excludes a critique from every tally (`total_critiques`, `critique_mode_distribution`, the abstract/embodied ratio) whose `SynapticLink` — the one `create_critique` always creates, found the same way `find_synaptic_link` already finds it — has an effective conductance below the threshold at read time. Deliberately a threshold filter, not a weighted sum: the existing counts are plain `u32`s, and a binary "does this pass the caller's own bar" check is the same shape `AttestationPolicy`'s `min_attestations` already uses, kept consistent rather than introducing a second aggregation style. This is not a protocol default and never silently discounts anything on a caller's behalf — the same Invariant #1 reasoning `AttestationPolicy`'s own header comment gives, applied to conductance instead of attestation. The two policies are independent and stack: a critique must pass whichever of `attestation_policy`/`conductance_policy` are actually `Some` to be counted.
  **Verified live, not just wired.** The `hc`/`holochain` toolchain turned out to already be installed in this environment (at `~/.cargo/bin`, just not on the shell's default `PATH` — the earlier note above was a false negative, corrected once checked directly) — a rebuilt wasm and freshly packed `.happ` were brought up via `scripts/sandbox.sh` against a real `hc sandbox` conductor, then exercised end to end with a real `AdminWebsocket`/`AppWebsocket` client, the same admin-auth flow `bridge/src/index.ts`'s `HolochainClient#connect` already uses: `publish_constitution` → `create_membrane` → two real `create_claim`s → two real `create_critique`s (each creating its own `SynapticLink` at initial conductance 1.0) → `reinforce_synaptic_link` on only one of them. `get_effective_conductance` read back **1.0** for the untouched link and **2.0** for the reinforced one — a real, measured gap, not assumed. `get_discourse_health` with `conductance_policy: null` counted both critiques (`total_critiques: 2`), exactly the old unfiltered behavior; called again with `conductance_policy: { min_effective_conductance: 1.5 }` — a threshold placed between the two real measured values — it counted exactly one (`total_critiques: 1`, `critique_mode_distribution` dropping from `Logical: 2` to `Logical: 1`), correctly excluding the unreinforced critique and keeping the reinforced one. No new unit tests were added for the new filter's own plumbing (`critique_effective_conductance`) for the same reason `get_discourse_health` itself has never had runtime-behavior unit tests — it's real host calls end to end, not extractable pure logic the way `compute_effective_conductance`'s own nine tests already cover; this live run is that coverage. All 57 existing tests still pass unchanged; both zomes still build clean natively and for `wasm32-unknown-unknown`.

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
- [x] **Peer HRR query support completed for neighborhood binding, closing the gap `query_worldline_resonance` already closed for worldline binding.** New `query_neighborhood_resonance(claim_hash, candidates)` collapses `build_neighborhood_binding` + `recall_neighborhood`'s two-step local pipeline into one call — "is X near claim C" in a single round trip, with no intermediate `NeighborhoodBinding` for the caller to fetch back and re-pass in. Unlike `query_worldline_resonance`, this takes no `AgentPubKey`: a Claim's evidence and critiques are ordinary public DHT data, readable by any agent via the exact same `get()`/`get_critiques_for` calls `build_neighborhood_binding` already makes — there's no agent-specific "whose neighborhood is this" question the way there is for a `WorldlineTrace`, so `claim_hash` alone is the only identity this needs. Still a reading lens, not a second record: builds the binding fresh on every call, same as `build_neighborhood_binding` itself. The actual scoring logic was extracted into a shared pure `score_neighborhood_candidates`, now the one function both `recall_neighborhood` and this call it — and now what `neighborhood_recall_scores_true_members_above_impostors`'s own test exercises directly, rather than a parallel reimplementation of the same probe. The two-step pipeline stays available for a caller who wants to cache one corpus and probe it repeatedly without rebuilding it each time.
  **Verified live:** against a real `hc sandbox` conductor, with a real `Evidence` entry and a real `Claim` citing it, `query_neighborhood_resonance` — called once, with no prior `build_neighborhood_binding` call — correctly scored the real evidence hash at a clean 1.0 (mathematically exact here, not approximate: with only one bound pair and no superposition noise, `hrr_superpose`'s normalization doesn't change direction, so `cosine_similarity(normalize(x), x) = 1.0` precisely) against −0.01 (same hash, wrong role) and −0.04 (an unrelated hash never bound in at all).

### Phase 4: Advanced Features
- [x] **Immune system (AntibodyPattern) shipped — §4.2's Biological → Digital mapping named this "deferred"; this is the first real increment.** New `AntibodyPattern` entry type: an agent's own recognition that some entry exhibits a known bad-faith *pattern* — deliberately a distinct type from `Critique`, not a rename of it. A `Critique` adjudicates a claim's *content* (Invariant #4's five typed receptor modes — is it true, well-reasoned, well-evidenced); an `AntibodyPattern` instead flags a *structural or behavioral* pattern (`AntibodyPatternKind`: `SpamFlood`, `SybilCluster`, `Plagiarism`, `CoordinatedManipulation`, `Impersonation` — each grounded in a pattern this design's own SWO/sybil-farming discussion, §2.3, already names) independent of whether the content itself is right or wrong. Conflating the two would blur a distinction this protocol needs: disagreeing with a claim is not an accusation of bad faith, and an accusation of bad faith is not, by itself, a claim that the content is false. `target`/`target_type` reuse `AnyLinkableHash`/`CritiqueTargetType` exactly as `Critique` does — an `AntibodyPattern` can point at anything a `Critique` can (Claim, Critique, Constitution, Membrane, or CritiqueSpecies), cross-checked against the DHT the same unspoofable way `validate_critique` already establishes. **Deliberately cannot target an `AgentPubKey` directly** — an antibody naming an agent, rather than a specific entry that agent authored, would function as exactly the canonical, comparative reputation mark on an *identity* Invariant #1 rules out, the same reasoning §2.3 already gives for why identity creation itself was never made to cost something. `rationale` is required non-empty, the same accountability requirement `Critique.content` already carries.
  New `publish_antibody_pattern`/`get_antibody_patterns_for` externs mirror `create_critique`/`get_critiques_for` exactly, including the same two-layer SWO temporal friction (coordinator-side pre-check + real, unbypassable DHT-side enforcement in `validate_antibody_pattern`, via the same `count_recent_actions_since_checkpoint` machinery every other rate-limited entry type in this codebase already uses). `get_antibody_patterns_for` is a raw, unfiltered read — never scores, ranks, or gates (Invariant #1) — the same "reading lens, caller decides what to trust" shape `AttestationPolicy`/`ConductancePolicy` already establish. `ToN4L` is implemented for `AntibodyPattern` too (a `(flags)`/`(is flagged by)` relation plus `pattern kind`, both newly registered in `n4l/arrows-epistemic.sst`), and `export_to_n4l` gained an opt-in `include_antibody_patterns` field on `N4LQuery`, matching `include_critiques`/`include_evidence`'s existing shape — this is now the ninth entry type with a real `ToN4L` impl. Two new unit tests cover the N4L cross-reference the same way `critique_to_n4l`'s own tests do: a claim-target and a critique-target (scale invariance) each resolve under the correct alias prefix. All 64 tests pass (62 + 2 new); both zomes build clean natively and for `wasm32-unknown-unknown`.
  **Verified live, not just wired — DHT through to the real N4L graph, not stopping at the coordinator zome.** Against a real `hc sandbox` conductor: created a real Claim, published a real `AntibodyPattern` flagging it (`SpamFlood`, with a real rationale), and confirmed `get_antibody_patterns_for` returns exactly that one pattern for the flagged claim (and none for an unrelated second claim created in the same run — scoping isn't accidental). Exported real N4L output via `export_to_n4l` with `include_antibody_patterns: true`, re-ran `sstorytime/setup.sh` to pick up the two newly registered arrows, and uploaded the export through the real `N4L -u` binary (`sstorytime/ingest.sh --wipe`) — clean upload, zero errors. Queried `serve.sh`'s `/searchN4L` endpoint directly and confirmed the flagged claim's own node carries a real `is flagged by` edge to the antibody pattern node, itself correctly showing `target type: Claim`, `pattern kind: SpamFlood`, `asserted by`, and `has dht hash` — the complete path from a live zome call through to a queryable graph edge, not just a string that happens to contain the right words. Fixture saved to `sstorytime/fixtures/live_antibody_export.n4l`.
- [x] **Synaptic plasticity — closed out as substantially already shipped, not built as a new mechanism this pass.** What this roadmap line asked for is exactly what `Reinforcement` + `get_effective_conductance` (§2.6, shipped in Phase 1) already deliver: a `SynapticLink`'s real, read-time strength genuinely changes over time — it rises when `reinforce_synaptic_link` is called, and drifts back down through `decay_factor`'s `2^(-elapsed/half_life)` otherwise, recomputed fresh on every read. The one thing that literally doesn't happen is mutating the `f32` stored in the `LinkTag` itself — a deliberate design choice (Holochain `LinkTag`s are immutable once written), not an oversight this roadmap line was pointing at.
  **One real gap was identified and deliberately left unbuilt, not missed:** every existing way to move effective conductance is either an active *positive* signal (`reinforce_synaptic_link`) or passive time-based decay — there is no active *negative* signal, the LTD-like inverse of the reinforcement (LTP-like) mechanism already built ("I looked at this and it doesn't resonate"). This was considered and rejected for this pass: an explicit "this doesn't resonate" link, wired into the same effective-conductance computation `AttestationPolicy`/`ConductancePolicy` already read from, would function as a disguised downvote on a critique's *strength* rather than its *content* — precisely the canonical, comparative signal Invariant #1 rules out, applied to conductance instead of an agent's own reputation. The typed `Critique` mechanism is this protocol's actual answer to "I disagree" (Invariant #4 — every critique is typed, not flattened to a single bit); adding a second, untyped, single-bit disagreement channel that happens to also move a number would undercut that, not extend it. If this needs to be revisited, it should be scoped as its own explicit roadmap item with its own Invariant #1 analysis, not folded into "synaptic plasticity" by default.
- [x] **Cross-domain critique links shipped — the first Phase 4 item, and the mechanism §2.3's "mesh topology between domains (cross-domain critique links)" line named but never built.** Nothing needed to change to make cross-domain critiquing *possible*: `Critique.target` has been `AnyLinkableHash` since the scale-invariant Critique work (§2.6), so an agent could already critique a Claim in a domain other than their own with zero validation changes required — Invariant #2's "no imposition" axiom means nothing here was ever going to gate that anyway. What was actually missing was the ability to *see* the mesh — a real, queryable answer to "which critiques in this domain came from agents whose own claims live elsewhere," rather than the metaphor sitting unbacked by any function. New read-only `get_cross_domain_critiques(membrane: AnyDhtHash) -> Vec<CrossDomainCritique>`, in the same reading-lens shape `get_grounding_path` already established: never scores, ranks, or gates anything (Invariants #1 and #2), just reports real structure. A critique counts as cross-domain if its author has authored at least one real Claim in a domain other than the one being critiqued into — a literal, directly checkable definition, not a fuzzier heuristic like "critiques mostly outside their home domain" (which would require defining "home domain" for an agent with claims in several, a question this design doesn't need to answer). `CrossDomainCritique` reports every *other* domain the critiquing agent has claims in, deduplicated — never the membrane's own domain, since that's not "cross" anything. The dedup/filter logic is a pure `distinct_other_domains` function, split out the same way `bridge_link_type_for`/`compute_effective_conductance` already separate pure logic from host calls — five new unit tests cover it directly: home-domain-only claims produce no result, repeats are deduped, first-seen order is preserved, no claims at all is the empty case, and an agent with claims in both the home domain and elsewhere reports only the elsewhere part. Per-author claim-domain lookups are cached within one call, the same `attestation_cache` pattern `get_discourse_health` already uses, since several critiques scanned together commonly share an author.
  **Verified live, not just wired.** Against a real `hc sandbox` conductor: one agent created a Claim in `DomainA`, a second Claim in `DomainB`, then critiqued the `DomainA` claim. `get_cross_domain_critiques` on `DomainA`'s membrane correctly returned exactly that one critique, with `critiquer_home_domains: ["DomainB"]` — and did *not* list `DomainA` itself, confirming the home-domain exclusion works on real DHT data, not just the pure unit tests. All 62 tests pass (57 + 5 new); both zomes build clean, natively and for `wasm32-unknown-unknown`.
- [x] **Token/cost layer — a mutual-credit ledger was built, live-verified, and then removed; the direction that replaces it is non-transferable regenerating capacity.** See `docs/metabolic-biosignalling-currency-brief.md` for the full account, which is kept precisely because what was learned is more valuable than the code was. The short version, in the order it landed. An entirely DHT-native mutual-credit ledger was built — `MutualCreditTransfer` (countersigned, so both parties must accept the same session, closing Holochain's real double-spend risk), `CreditBurn` (single-signer), and `get_credit_balance` with per-transaction demurrage — plus a burn-to-extend coupling to `SynapticLink` friction. **A live two-agent conductor pass found three defects that 96 passing unit tests could not**, all of which compiled clean: `create_entry` can never produce a countersigned entry (the app must build `Entry::CounterSign` itself — the commit *succeeded* as a plain single-signer entry and was caught only by this DNA's own `validate`, so the requirement held while the mechanism meant to satisfy it never ran); a chain in a countersigning session accepts the session entry and nothing else; and `to_app_option` silently returns `Ok(None)` for countersigned entries, so every balance read exactly 0 while everything else looked correct. All three live where pure, host-call-free unit tests structurally cannot reach — in what the *host* does with an entry, not what the app computes.
  **Then the layer was removed, for reasons that arrived in sequence.** The burn coupling turned out to be **unreachable** by any honest client — `create_critique` is the only caller of `create_synaptic_link`, `Critique` creation carries its own hard 20/hour cap with no burn tier, and that cap is checked first, so the paid tier opened at exactly the count where another `Critique` had already become impossible — and worse than inert, since the one client that *could* reach it (hand-crafting `CreateLink` actions) got ten extra links for burns nothing funded. Removing it made the protocol stricter. That left the ledger with **no consumer at all**, and exposed a third problem: `get_credit_balance` returned a canonical per-agent scalar, identical for every caller because the demurrage half-life is a protocol constant, over an agent set any client can enumerate with `get_membrane_members`. That is Invariant #1's leaderboard, prevented only by the protocol declining to sort rather than by construction — unlike `AttestationPolicy`, whose answers are caller-scoped and legitimately differ between observers. A defect with a fix argues for fixing; a defect in a mechanism with no consumer argues for removal — and those two facts decided it. A third reason was originally recorded and has since been corrected as overstated: that a checkable balance is *unachievable* on this substrate. It isn't. Countersigning put every transfer on both parties' chains, so a balance here was a chain-local fold of the same shape as the friction limits that work fine; what was missing was a bound on that fold (a running total validated inductively), not the possibility of one, and the fork-based double-spend that genuinely does need global consensus is an exposure friction already shares. See the docs brief §4.2. The removal stands without that reason.
  **What was proposed to replace it, and why it was then rejected too.** The successor named at removal time was non-transferable regenerating capacity: one per-agent budget, spent at differing rates by differing acts, refilling over time, unable to move between agents. The biology argued for it — cells do not trade ATP, metabolic energy is local, and when ATP itself crosses a membrane it *stops being energy and becomes signal* (purinergic signalling); this protocol's signalling layers are the parts that work, and the currency layer made energy itself transferable, the one thing metabolism does not do. **How far that licenses the metaphor is bounded deliberately:** it may rule mechanisms out; it has not earned the right to specify one, since letting a metaphor propose rather than veto is how the burn tier arrived in the first place. The docs brief §5.1 records that limit and one live tension it creates — the purinergic cascade *inverts* its signal (CD39/CD73 degrade ATP to adenosine, which acts on opposing receptors), while this protocol deliberately has no inverting signal at all, §9's "synaptic plasticity" item having rejected one as a disguised downvote under Invariant #1. Noticing the correspondence is not evidence for building it. It also dissolved every technical problem the ledger had: no transfers means no double-spend and no global balance, and it never needs to answer a question about another agent, so it has no leaderboard surface at all. **It was nevertheless not built**, once the question it depended on was actually answered: *which act should cost more than another, that separately tuned flat caps cannot already express?* Nothing did. The protocol already differentiates sharply — `AttestationGrant` at 5/week plus a 30-day tenure bar against `Reinforcement` at 40/hour is roughly a 1000× differential — so capacity would re-encode a working judgment while adding **substitutability**, which is a defect here rather than a feature: these caps do not ration a shared resource, they each bound a distinct flooding surface (critique-flooding at 20/hour, conductance-farming at 40/hour), and letting unspent allowance for one become extra allowance for another means every bound becomes its own limit plus whatever was declined elsewhere. That is structurally the same failure as the burn tier — buying past a limit undermines what the limit protected — and building it immediately after removing that tier would have been the wrong lesson. The finer within-type pricing it would enable (costlier cross-domain critique, costlier critique of a `Constitution`) is pricing this protocol should actively not want, chilling critique exactly where Invariant #2 and governance most need it. Burst tolerance, the one thing rolling windows genuinely cannot express, is a property of bucket shape rather than of unified budgets, and can be had per-limit without any substitutability if it is ever actually wanted. **The cost model is therefore flat per-act caps plus accountability (`Constitution`/`required_promises`) plus vouching (`AttestationGrant`) — the model that already existed.** One apparent asymmetry surfaced while answering the question, was investigated, and turned out not to be one: `create_claim` carries no friction while `Critique` is capped at 20/hour. Described as "the protocol rate-limits disagreement but not assertion" that reads like a value judgement about speech acts, and it was briefly recorded that way here — but the mechanism encodes something else entirely. Friction applies to acts that write onto a base another agent owns or that move a shared signal, and to nothing else: `Critique`, `SynapticLink` and `AntibodyPattern` all attach to someone else's target, `Reinforcement` moves a conductance value others read, `AttestationGrant` writes about another agent into a membrane's trust graph. `Claim`, `Mew`, `Retraction`, `Constitution` and `Evidence` are unlimited because each only extends its own author's anchor. `Critique`'s cap in particular exists to close a bypass of `SynapticLink`'s — every critique creates a conductance edge — not because critique is held to be costlier speech. **That is Invariant #2 (no imposition) expressed as rate limits: fill your own shelf freely, writing on someone else's shelf is metered.** Left unchanged deliberately. Claim-flooding remains possible and pollutes the unfiltered `get_claims_by_domain` listing, but the correct shape of a fix would be a read-layer lens there — the containment strategy §2.3 already describes — not friction on the generative act, and no such flood has been reported on a protocol with no deployed network. `scripts/live-verify/friction-limits.mjs` stands guard on the one property that must not regress: throughput is not purchasable by any mechanism.
  **A dead run instruction survived that removal through 75 commits and 36 merged PRs, and is fixed here.** Removing the ledger correctly deleted this item's own account of `scripts/live-verify/credit-transfer.mjs` — but §6.6, in the *Build & Run Instructions*, still told the reader to run that file against a live conductor, and it no longer exists. Two occurrences, one swept and one missed. The shape is worth naming because it is not a typo: the same fact lived in two genres, a **changelog** entry describing what was done and an **operating instruction** telling someone what to do, and the removal pass only looked in the genre it was editing. A stale changelog entry is merely wrong about history; a stale instruction sends the next person to a file-not-found in the section they are most likely to be following literally. Checked exhaustively rather than by eye this time — every path-like token in §6, and then in every tracked markdown file outside the historical brief, resolved against the filesystem. This was the only dead reference. **The `docs/` brief keeps its references to `credit-transfer.mjs` and `burn-friction.mjs` deliberately** — it opens with a banner stating the layer was built, verified and removed, so its mentions are past-tense record of verification that really happened, which is the one genre where naming a deleted file is correct.

  **A "cascading" trust extension built alongside the ledger was removed with it.** `WeightedAttestationPolicy`/`get_attestation_weight` added transitivity and epoch decay to the existing `AttestationPolicy` walk, borrowing two of MeritRank's three mechanisms (arXiv 2207.09950); SourceCred and EigenTrust were investigated and ruled out immediately, since a single canonical score per agent is exactly what Invariant #1 forbids. What condemned the graded version was a defect of its own, not the ledger's: it returned a number that could differ between two callers passing **identical** inputs, because `weighted_direct_attesters_of` read links in unsorted `get_links` order and a shared first-path-wins `visited` set then decided which paths contributed. That is *undeclared nondeterminism* — a different and worse thing than `is_agent_attested`'s deliberate caller-scoping, where observers differ because they **chose different roots**, which is precisely what Invariant #1 intends. The defect was fixable (sort the traversal, memoize per node-and-depth), so this was a judgement about unused code rather than a condemnation: the function had no caller, had never been run against a conductor, and existed to serve the currency layer's cascading-trust story, which was itself removed — so the fix, a live verification pass, and a re-decision on its MeritRank framing would all have been spent on code nobody called. `is_agent_attested` continues to answer the trust question in a form that is used, correct, and caller-scoped. A graded variant, if wanted later, should be shaped by the caller that wants it and built deterministic from the start; the reasoning is preserved in the docs brief §4.4.
- [x] **Mobile UI for practitioners shipped — first increment, `mobile-ui/`, see its own README for the full account.** A mobile-responsive web app (installable as a PWA) connecting directly to a conductor's Admin/App WebSocket APIs from the browser, using the same admin-auth flow `bridge/src/index.ts`'s `HolochainClient#connect` already established (issue an app auth token, authorize zome-call signing credentials per cell) — a real, working shape for developing against a practitioner's own local conductor, explicitly **not** the production multi-tenant auth model (a real deployed hApp UI is normally loaded by the Holochain Launcher, which never exposes the Admin API to UI code at all — documented as a deliberate simplification, not a hidden one, in `mobile-ui/src/holochain.ts`'s own header comment). Vanilla TypeScript + Vite, no UI framework — this codebase's established minimal-dependency preference (see the HRR section's own reasoning) applied to the UI layer too, appropriate at this screen count. Scope of this first increment: browse `Claim`s by domain, publish a `Claim`, view and add typed `Critique`s on a claim, with the conductor connection config persisted in `localStorage`. Membranes, discourse health, AntibodyPatterns, and HRR queries are real gaps, not oversights, left for a later pass.
  **A real, previously-invisible bug was found and fixed by actually running this in a browser, not just building it.** Node's `ws` client sends no `Origin` header by default, which is why `bridge/src/index.ts` passes an explicit `wsClientOptions.origin` — but a browser's native `WebSocket` constructor treats its second positional argument as a `protocols` list (string or array of strings), not an options bag, so passing the same `wsClientOptions` object here failed immediately with `Failed to construct 'WebSocket': The subprotocol '[object Object]' is invalid.`, before any connection was even attempted. Invisible to `tsc --noEmit` (a runtime browser-API mismatch, not a type error) and to every build-time check — caught only by actually connecting a real browser to a real conductor. A browser's native WebSocket sends a real, truthful `Origin` on its own regardless (and gives no way to override it from JS at all), so the fix was simply not passing `wsClientOptions` in this client.
  **Verified live, not just built:** every screen (Connect → Browse → New Claim → add Critique → config persists across reload) was driven end to end by a real, Playwright-controlled Chromium (the system's own `/usr/bin/chromium`, not a bundled download) against a real `hc sandbox` conductor — ten checks, all passing, run against both the Vite dev server and the actual production `dist/` build via `vite preview`, confirming the fix above holds in the real shipped artifact and not just the dev server's own module graph. A real `Claim` was published, appeared correctly in the browse list with its confidence level, and a real `Critique` added to it rendered with the correct mode and content — the complete practitioner loop, against real DHT data, not a fixture. Screenshotted at a 390×844 (iPhone-class) viewport to confirm the layout actually reads as mobile, not just responds to a media query in principle — one real layout defect surfaced this way (the header title wrapped awkwardly against the connection-status text at that width) and was fixed, re-verified against the same ten checks afterward.

### Phase 5: Generalization
- [x] **THE PRIMARY BROWSE PATH WAS CHAIN-LOCAL — five reads could not see other agents at all; two are now fixed.** Found while scoping the critique-taxonomy UI, proven with two real agents, and the most consequential defect this project has surfaced to date. Now specified in `SPEC.md` §10.0.

  `get_claims_by_domain` is built on `query(ChainQueryFilter)`, which by Holochain's definition scans **the calling agent's own source chain and never the DHT**. So **on any network with more than one agent, browsing a domain returns only your own claims.** For a protocol whose entire purpose is independent agents cross-checking one another's disclosures, that is close to a contradiction of the premise: §4.3's account requires agents to *find* each other's claims in order to critique them, and the ordinary entry point cannot.

  The same shape affects `get_critiques_by_mode`, `get_membranes`, `get_all_critique_species` and `get_all_constitutions`. So the "shared, evolving vocabulary of critique types" that the taxonomy roadmap item describes is in fact each agent's private list, and `domains/bootstrap.mjs`'s 11 seeded `CritiqueSpecies` are visible only to the agent that ran it.

  **The data is not missing — only unfindable.** Others' claims are fully present on the DHT, gossiped and reachable: `get_claims_by_agent` (link-based) retrieves the very same entries the domain read cannot see. Nothing is lost; there is simply no by-domain index.

  **Why it survived this long, which is the part worth learning from.** Every conductor this project has verified against ran exactly one agent, and on one agent a chain query and a DHT query are behaviourally identical. Both shapes take a filter and return `Vec<Record>`; nothing in a signature distinguishes them. Every live-verification harness in `scripts/live-verify/`, all of them genuinely exercising a real conductor, was structurally incapable of noticing — this is the sharpest instance yet of the pattern §9 keeps recording, where correct-looking code is fine in the environment it is tested in and wrong in the one it is for. It is the same family as the Launcher bug (an admin-auth flow that worked everywhere except where it would actually ship), one layer deeper.

  **Proven, not inferred:** `scripts/live-verify/read-scope.mjs` installs a second agent on the same conductor and pairs every chain-local read with a link-based read of the *same* entry by the *same* agent at the *same* moment — `get_claims_by_agent` returns the claim while `get_claims_by_domain` returns nothing, `get_agent_constitution` finds the constitution while `get_all_constitutions` does not. That pairing is what rules out "not yet gossiped" and turns an observed zero into evidence. Twelve checks, three of them controls.

  **And since confirmed on a real network, which is where this claim was always actually about.** The pairing above is an indirect answer to "not yet gossiped" — a good one, made necessary by there being no network to gossip over. `scripts/live-verify/real-gossip.mjs` now answers it directly: on two conductors demonstrably exchanging claims in both directions, `get_all_constitutions` on one still returns only its own. See the multi-node networking entry below.

  **THE FIX, and the two design decisions inside it.** `create_claim` now writes a `DomainToClaim` link from a domain anchor (`Path::from("domain_<name>")`), and `get_claims_by_domain` reads that index instead of the caller's chain. `create_critique_species`/`get_all_critique_species` got the same treatment via a single `TaxonomyToSpecies` anchor, because that read blocked the taxonomy UI this was found while scoping.

  *Not `MembraneToClaim`*, the declared-but-unused link type that looked like the obvious candidate. A Claim's `domain` is free text and a Membrane need not exist for it — the practitioner UI publishes into unfounded domains as a matter of course — so indexing by Membrane would have left exactly those claims unfindable: the same bug with extra steps. A domain anchor covers every claim regardless.

  *No chain-query fallback*, deliberately, and this is the decision worth keeping. Unioning the link read with the old query looks like belt-and-braces and would in fact restore the exact blindness that hid the bug: on a single-agent conductor the fallback returns your own claims whether or not the index works, so a broken index would go on passing every test forever. The read is link-only so that a failure to index is a failure someone can see.

  **An index is only worth reading if it cannot be poisoned**, so validation enforces three properties rather than trusting `create_claim`: the target must resolve to a real `Claim`; the base anchor must be the one that claim's *own declared domain* derives (or any claim could be filed under any domain — the same failure arriving by another route); and the link author must be the claim's author (§5.2, since a third party filing others' claims is bounded by nobody's friction budget). All three are proven refused, live, through a new `attempt_false_domain_index` prober in the same spirit as `attempt_unaccountable_membrane` — and each refusal is confirmed to come from **DHT validation**, not a coordinator guard, which is the distinction PR #44's audit established as the only one that counts.

  **Verified live with two agents:** `scripts/live-verify/domain-index.mjs`, 14 checks. Both agents see both claims in a shared domain; an unused domain reads empty rather than erroring; all three poisoning attempts are refused by validation; the index is confirmed unchanged afterwards; and — the taxonomy's real test — agent 2 adopts a species agent 1 proposed and the adoption count reads 1, which is the shared vocabulary actually being shared. `read-scope.mjs` was updated to assert the *corrected* behaviour for the two fixed reads rather than being retired, so it stays the live map of `SPEC.md` §10.0 and goes red if either index regresses. 77 unit tests still pass (67 coordinator + 10 integrity).

  **Three reads remain chain-local, deliberately:** `get_critiques_by_mode`, `get_membranes`, `get_all_constitutions`. Each would be one global index over an unbounded, ever-growing set, and whether that firehose should exist at all is a real design question — unlike "the claims in this domain" and "the vocabulary of critique types", which are bounded and obviously wanted. Named in `SPEC.md` §10.0 rather than left to be rediscovered.

  **Migration:** there isn't one, and there cannot be. Changing the integrity zome changes the DNA hash, so a fixed conductor is a different network from a pre-fix one — Holochain offers no in-place migration across that boundary. For a protocol with no deployed network this costs nothing today; it is recorded because it will not be free later, and `SPEC.md` §11's own note that no protocol version or migration path is defined is now a gap with a worked example attached.
- [x] **Protocol specification document shipped — `SPEC.md`, at the repo root.** Deliberately a different genre from this document: `README.md` is the narrative account (the *why* — philosophy, code walkthrough, changelog); `SPEC.md` is the precise, implementation-agnostic *what, exactly* — every entry type's field-level schema, every link type's real base→target direction and tag content, every validation rule (author binding, referential integrity, the scale-invariant target cross-check, SWO temporal friction's exact windows/counts), the Ten Invariants restated as binding conformance requirements, the HRR encoding scheme (dimension, symbol derivation, both versioned `binding_key` strings), the N4L export mapping, and a complete zome function reference (51 externs) — precise enough that an independent implementation, in a different language or off Holochain entirely, could target compatibility without reading a line of this project's Rust.
  **Verification, for a document, meant something different here: not build/test, but line-by-line cross-checking every claim against the actual source rather than against memory of it** — the same discipline this project applies to code, applied to documentation instead. That pass caught and fixed six real, would-have-been-wrong claims before publishing: `CritiqueToSpecies` and `SpeciesToParent`'s *names* both read as the inverse of their actual `create_link` base→target direction (verified from the real call sites, not inferred from the name); `CritiqueToEvidence`, `ClaimToEvidence`, and `MembraneToClaim` are declared in `LinkTypes` but never actually created or read by any current coordinator function — an easy, plausible-sounding mistake to make from the enum alone, caught only by grepping for real usage; `ClaimToRetraction` turned out to serve two distinct semantic purposes depending on which entry is its base, undocumented anywhere before now; and `AgentToMembrane`/`AttestationGrant`'s link targets and tag contents were subtly different from what a first pass assumed (an agent *anchor*, not a raw `AgentPubKey`, for the former; a real membership-action hash carried in the tag, not an empty tag, for the latter). `SPEC.md` states the corrected, verified facts and flags the naming/direction mismatches explicitly so a future reader doesn't repeat the same inference.
  **Not done in this pass, stated in the document itself** (§11): no automated check keeps `SPEC.md` in sync with `dna/` as the implementation evolves — it is a manually maintained snapshot of the commit noted at its own top, and there is no protocol-wide version number or migration path defined for a genuinely breaking future change. Both are named as real, open gaps in the spec's own text, not silently left unstated.
- [x] **New domain templates shipped — `domains/`, see its own README for the full schema.** Nothing in `dna/` is domain-specific (a `Membrane.domain` is a plain `String` — see `SPEC.md`), so this isn't new zome code: it's a template format plus a bootstrap tool (`domains/bootstrap.mjs`, same admin-auth connection flow `bridge/src/index.ts`/`mobile-ui/src/holochain.ts` already established) that founds a real domain from a JSON template — publishing a `Constitution`, creating the `Membrane`, then creating a starter `CritiqueSpecies` taxonomy in order, resolving each species' named `parent` to the real `EntryHash` of a species created earlier in the same run. Two worked examples prove the point rather than just asserting it: `climate.json` (`ClimateScience` — promises requiring model/observation distinction and funding disclosure; `MethodologicalCritique` → `ModelUncertaintyCritique`/`StatisticalCritique`, `SourceCritique` → `FundingBiasCritique`/`PeerReviewStatusCritique`) and `nutrition.json` (`NutritionScience` — promises requiring correlation/causation distinction and industry-funding disclosure; `StudyDesignCritique` → `ObservationalVsRCTCritique`/`SampleSizeCritique`, `ConflictOfInterestCritique` → `IndustryFundingCritique`) — two genuinely differentiated starter taxonomies, not `LumbarRehab`'s implicit vocabulary copied twice with new names.
  **A real bug found and fixed by actually running the tool, not just writing it:** the script's own work completed correctly on the first live run (confirmed from its own printed output), but the process never exited — the open `AdminWebsocket`/`AppWebsocket` connections keep Node's event loop alive indefinitely, and neither client is exposed for an explicit `close()`. Fixed with an explicit `process.exit(0)` once `main()` resolves, the correct behavior for a one-shot CLI tool; re-verified with a clean, fast exit (`EXIT_CODE=0`) on a second live run.
  **Verified live, not just wired:** both templates run for real against a live `hc sandbox` conductor, in the same run — 11 `CritiqueSpecies` total on the DHT (6 climate + 5 nutrition), independently read back via `get_all_critique_species` and decoded: every parent-name in each template resolved to the correct `EntryHash` (`ModelUncertaintyCritique`'s parent decodes to `MethodologicalCritique`, `IndustryFundingCritique`'s to `ConflictOfInterestCritique`, root species correctly carry `parent_species: null`), confirming the resolution logic against real DHT data, not just the script's own optimistic printout.
- [x] **Federation between domain membranes shipped — `federation/`, see its own README for the full account.** Two membranes on the *same* DHT were already fully interlinked before this pass (nothing restricts a `Critique`/`AntibodyPattern` from crossing domains, and `get_cross_domain_critiques`, Phase 4, already surfaces exactly that) — "federation" only means something once there's an actual boundary to cross: two conductors that genuinely share no network. Holochain gives no native way for one DHT to see another's; the only way across is an external process that connects to both, the same shape the Twitter bridge already is. New `FederationRecord` entry type (integrity zome): a membrane's own witness that it recognizes a specific membrane on a different network — one-sided by construction, authorable only by that membrane's own `creator` (validated on-chain), the remote side necessarily an opaque out-of-band reference, the same honest limitation `BridgeRecord.twitter_id` already has for Twitter. `record_federation`/`get_federation_records_for` (coordinator zome) mirror this codebase's established CRUD shape; no SWO temporal friction here — declaring federation with several networks in succession isn't the flooding pattern friction exists to slow. **Mutual federation is never a stored fact on either DHT** — neither network can see the other's data to confirm reciprocation, so it's derived, fresh, by `federation/federate.mjs` connecting to both conductors and independently checking both directions.
  **A real bug, the exact class this project's own history is already full of, caught in my own new test harness while verifying this:** `FederationRecord.local_membrane` is an `EntryHash`, but a first attempt fed it `create_membrane`'s own return value — its `ActionHash` — straight through, which fails with a real `Deserialize` error from the integrity zome (a strongly-typed field rejecting the wrong Holochain hash-type prefix), not a silent wrong answer. Fixed by recovering the Membrane's real `EntryHash` via `get_membranes()` + decode, the same pattern this codebase's other live-verification harnesses already use — documented explicitly in `federation/README.md` so a future user doesn't repeat it.
  **Verified live, not just wired — against two genuinely separate `hc sandbox` conductors**, different ports, different sandbox data directories, different agent keys, not one conductor pretending to be two: a real membrane on each side, federated via `federate.mjs` — both `FederationRecord`s created, `MUTUAL FEDERATION CONFIRMED` reported, matching a direct independent read-back of both conductors. `--check-only` re-verification (no new writes) reported the same confirmed result. A negative case — two real membranes that were never federated with each other — correctly reported `NOT mutually federated`, not a false positive from the mere existence of *some* `FederationRecord` on either side. A genuinely nonexistent hash queried against the wrong network surfaced a real `"Membrane not found."` error from the DHT itself, rather than a silently wrong `false`.
- [x] **Interior/exterior boundary — investigated and found already satisfied; the roadmap item that stood here was wrong.** It claimed that because `EntryVisibility::Private` appears nowhere in `dna/`, privacy is "the absence of a feature rather than a modelled boundary," and that this contradicted §4.3's event horizon. Checking Holochain's actual semantics reversed the conclusion.

  For a private entry, **the Action is still published to the DHT** — `RecordEntry::Hidden` documents this exactly: "the Action has an entry_address reference, but we are in a public context and the entry is private." Peers therefore learn that an agent committed something, of what type, when, and its entry hash. Only the content is withheld. **Not committing leaks nothing at all.** A private entry is strictly *more* disclosing than silence, so it is not a privacy primitive, and adopting it would have weakened the very property it was supposed to model.

  The event horizon is already implemented, in the strongest available form: `create_entry` **is** the deliberate act of promising, and an agent's unpublished reasoning, drafts and raw observations are not hidden on the DHT but absent from it. The boundary is modelled as commit-or-don't, which is exactly §4.3's "becomes visible only through what the agent voluntarily promises to expose." Nothing to build.

- [x] **Installable `.webhapp` bundle shipped — the artifact someone who is not us needs in order to run this at all.** `scripts/pack-webhapp.sh` builds `epistemic-resonance-happ.webhapp` from `web-happ.yaml`: DNA, hApp, and the practitioner UI in the one file a Holochain Launcher installs. See §6.9 for the full account. This was the piece the previous pass explicitly sequenced itself *before* ("inviting participants onto a network whose stated guarantees have not been verified is the wrong order") — so it is now in the order that pass intended.

  **Packaging was not the whole of it; packaging surfaced a bug that would have made the bundle dead on arrival.** The UI's connect flow opened an `AdminWebsocket` as its very first action. The Holochain Launcher **never** exposes the Admin API to UI code — so an installed bundle would have thrown before rendering a single screen. This was not a hidden defect: `mobile-ui/src/holochain.ts`'s own header comment had described the admin-auth dance as "a real, working shape for this project's current stage, not the final production auth model," and the Phase 4 changelog entry above says the same thing in the same words. It was correctly documented and correctly harmless right up until the moment this bundle existed, at which point the documented simplification became a defect without a line of code changing. `holochain.ts` now detects the host environment and takes a Launcher path that opens no `AdminWebsocket`, issues no token, and authorizes no signing credentials (the host signs); the connect form is not rendered at all under a host, because there is nothing to ask.

  **Three smaller things packaging surfaced, all of the same family — assumptions that were true only because the app was served at an origin root it now no longer controls.** Vite's default `base: '/'` emitted absolute `/assets/…` references; `public/manifest.webmanifest` declared an absolute `start_url` and icon `src`; and the service worker precached `['/', '/manifest.webmanifest', '/icon.svg']` with `cache.addAll`, which is all-or-nothing — one 404 among them rejects the install and the worker never activates, turning a missing icon into no service worker at all. All four are now relative, and the precache tolerates per-entry failure. None of these could be *confirmed* broken without a real Launcher; each is the choice that is correct under both origins rather than the one verified correct in the untested case, and `vite.config.ts` says so in those terms.

  **Verified live, and the harness checked against a negative control.** `scripts/live-verify/launcher-packaging.mjs` runs the real production bundle in a Playwright Chromium with a launcher environment and a host-side zome-call signer injected, against a live `hc sandbox` conductor. It connects with no user action and no connect form, publishes a `Claim` that an independent client then reads back off the DHT, and does it all with the saved admin URL pointed at a dead port — so connecting *at all* is positive evidence the Admin API was never opened, not an assumption. Because a suite that passes on its first run has proven nothing yet, launcher detection was then forced off and the harness re-run: it fails, which is the only reason its passing means anything. The existing direct-admin harness (`evidence-retraction-ui.mjs`) still passes unchanged, confirming the relative-path changes did not break the developer path. The `.webhapp` was unpacked and inspected directly rather than trusted from a zero exit code — `index.html` at the archive root, the DNA inside the hApp.

  **The real limit, stated rather than implied away:** no Holochain Launcher is installed in this environment, so this bundle has never been installed by one. The harness reproduces what a Launcher injects and is faithful in the respect that decides the code path, but it is a stand-in. A genuine first install is this project's next real integration gap — the same species of gap live-conductor verification was before it was closed, and named here for the same reason.
- [x] **Two read-only surfaces made read-write — the asymmetry the coverage count was hiding.** "Surface the epistemic state" was being tracked by how many coordinator functions had a screen, and that metric concealed a sharper problem than coverage: two functions were surfaced for *reading* while their write counterparts were not.

  `get_effective_conductance` was surfaced; **`reinforce_synaptic_link` was not** — the UI displayed a connection's strength and offered no way to strengthen it, while conductance's entire meaning is decay unless reinforced (§2.6). A client that only reads that number describes a process it lets nobody take part in. `get_antibody_patterns_for` was surfaced; **`publish_antibody_pattern` was not** — the UI showed what others had flagged and let the practitioner flag nothing, making the reader a spectator of §4.2's immune response rather than a participant in it.

  Both are now offered. Reinforcing needed almost no new plumbing: `loadConductances` already resolved each critique's `SynapticLink` ActionHash via `find_synaptic_link` and threw it away after scoring, so it is now kept. Flagging opens a small typed form (kind + rationale), with a rationale required for the same reason a retraction's is — an unexplained flag is precisely the flat downvote this protocol exists not to have. The form states plainly what publishing does and does not do: it is not a report button, there is no moderator behind it, and it removes nothing (Invariant #6) — language implying otherwise would promise an authority the protocol deliberately does not have.

  **Neither is gated on friction, and that is §4.5's third rule doing real work rather than being recited.** Both actions have their own SWO limits (`check_reinforcement_friction`, `check_antibody_pattern_friction`), but unlike the critique budget neither has a status function to re-derive the conductor's answer from. So this client cannot know whether the action would be refused, and *never gate on unknown state* forbids guessing: a gate built on a number the UI cannot see would refuse what the protocol permits. The refusals surface honestly instead, and the coordinator's own message already explains itself.

  **A real defect found while building, in code neither this change nor the last one introduced.** `render()` rebuilds `app.innerHTML` wholesale, and opening a critique panel starts `loadCritiques` and `loadConductances`, each of which calls `render()` when it returns. Anything typed into the form before those land is discarded along with the DOM that held it. It surfaced as a critique that was silently never created — no error, no budget spent, just nothing — and a person typing quickly would hit exactly the same thing. Narrowed by making the budget refresh re-render only when the number actually moved, but **not fixed**: the wholesale rebuild is the cause, and the real fix is the local-first in-memory mirror pattern in §4.5, which is a genuine piece of work and not this one. Recorded here rather than left as an unexplained `waitForTimeout` in a harness.

  **Verified live:** `scripts/live-verify/write-symmetry.mjs`, twelve checks. Reinforcing moves the displayed conductance (1.00 → 2.00) and an *independent* client reads the same raised value off the same link, so the UI is shown to be rendering the conductor's number rather than an optimistic local one. A flag with no rationale is refused before it reaches the conductor; a real one is read back off the DHT with kind and rationale intact; and the flagged claim and its critique are both confirmed still present afterwards, because the form promises that in so many words and a promise in microcopy deserves a check like any other. `affordance-surfacing.mjs` and `evidence-retraction-ui.mjs` both still pass.
- [x] **State-driven affordance surfacing shipped — the last of the four game-interface patterns, and the one that made the HUD honest.** The full list of four, with what does *not* transfer, is now written up as §4.5; it had existed only in a commit message, which is a roadmap nobody can act on.

  **The gap had a sharp edge.** `frictionStatus.blocked` was read in exactly two places in `mobile-ui/src/main.ts`, both purely cosmetic — the meter's label and its bar colour. Nothing gated the action. A practitioner whose critique budget was spent still saw an enabled "Add critique" button, wrote a critique, submitted it, and got an opaque validation error from the DHT. That is verbatim the failure the HUD work was introduced to prevent ("a user who hits the 20/hour cap today gets an opaque error instead of having watched a budget deplete"). We had shipped the watching half and left the acting half: the meter depleted in front of them, and then the button lied.

  The critique form is now disabled when the budget is spent, and says why. Gating it is legitimate under §4.4 for a specific reason worth keeping: `get_synaptic_link_friction_status` derives `blocked` from the same count, window and source chain that `check_synaptic_link_friction` refuses on, so the UI re-derives the conductor's own answer rather than forming an opinion. `create_synaptic_link` was confirmed to have exactly one call site (in `create_critique`), so this is the whole of the budget's surface, not one instance of it.

  **Two things the build taught, both now rules in §4.5.** *Hide only what is structurally impossible; disable and explain what is merely unavailable now* — the retract affordance was already correctly hidden on other people's claims, and its comment even named the principle, but it was the only place applying it and the principle had no name. A spent budget is the opposite case: transient, and hiding it would conceal a rule the practitioner needs to plan around. And *never gate on unknown state* — a failed or pending status read leaves the action available, since guessing "blocked" from missing information refuses what the protocol would have allowed, which is the original failure inverted.

  **A staleness bug found while building, not after.** The first version refreshed the budget inside `loadCritiques`, which the expand handler skips whenever the panel is already cached — so a re-opened panel kept whatever verdict it was born with. Since the limit is a *rolling* window, that meant a gate that latched: blocked at connect time, still blocked on screen an hour later, refusing on the UI's behalf something the conductor would now accept. Moved to fire whenever a panel opens.

  **Verified live, with the control built into the same run:** `scripts/live-verify/affordance-surfacing.mjs` opens the panel with budget remaining and asserts the form is fully usable, then spends the entire budget from an *independent* client (so the UI reacts to conductor state it did not create), then re-opens the panel — without a reload, because closing and re-opening is what a practitioner actually does and a gate that only refreshes on reload would pass a reload-based test while staying stale in real use. The form is present but disabled, names the budget and its reset window, and clicking it raises no conductor error. Nine checks, all passing. No separate negative control was needed here: a gate that was simply always closed would fail the first check, so the two halves of one run distinguish a working gate from a stuck one.
- [x] **Critique taxonomy surfaced — the vocabulary of *how* to disagree, which had been on the DHT and invisible.** §9 named this as the next unsurfaced read and it was blocked until PR #51 made `get_all_critique_species` a real DHT read rather than a source-chain query. `domains/climate.json` and `nutrition.json` seed eleven real species with two-level parent/child structure, and no screen could show any of them.

  **The read half is a tree, deliberately, and deliberately not a ranking.** `get_critique_species_adoption_count` is a *singular* read — one hash in, one count out — and its own doc comment records why there is intentionally no "all species ranked by adoption": that is the comparative leaderboard Invariant #1 and §4.4's first constraint exist to refuse. Ranking client-side by the number would reintroduce it one layer up, which is exactly the "lens that aims itself" §4.4 names. So the tree renders in taxonomy order, the count is stated beside each species as a fact about it rather than as its position, and `style.css` carries no size, colour or weight derived from the count either — a ranking smuggled in as styling is still a ranking.

  **The write half was the whole reason the read was inert.** `Critique.species` was hardcoded `null` at the one place a critique is created, so the vocabulary was unspeakable and every species read zero adoptions forever. It is now a picker on the critique form. Choosing nothing stays first-class: `species` is `Option<EntryHash>` and nothing validates its presence, so requiring one would be the UI inventing a rule the protocol does not enforce.

  **Two smaller things the build settled.** The picker is *hidden* when the taxonomy is empty and *disabled* when the budget is spent — §4.5's rule that structural impossibility hides while transient unavailability explains itself. And both connect paths load the taxonomy, not just the manual one: a Launcher-installed practitioner reaches the critique form without ever opening the tab, so loading it only there would have left the picker empty on precisely the path that ships.

  **Verified live, and observed failing first.** `scripts/live-verify/taxonomy-ui.mjs`, seventeen checks: the tree nests, adoption is the query-time count (0 reads as "0", never as "unavailable" — different answers, rendered differently), a critique written *through the UI* raises the count 0 → 1 as read by an **independent** client, and a species proposed through the form lands on the DHT under the right name *and* the parent the select chose. Then the two regressions it exists to catch were injected and watched go red: reverting `species` to `null` fails the adoption check, and sorting the tree by adoption fails three checks at once.

- [x] **Opt-in trust lenses surfaced — the item §9 flagged as needing care under §4.4, and the care turned out to be the whole job.** `AttestationPolicy` is the mechanism §4.4 itself names as the honest kind of lens: aimed explicitly by the caller, so two callers legitimately get different answers because they asked different questions. Surfacing it means `is_agent_attested`, `grant_attestation` and `get_my_membership_action` now have a UI, and `get_discourse_health` can finally be asked a question rather than only a neutral one.

  **Three rules, taken straight from §4.4's "if the interface is filtering, the user must have chosen the filter and be able to see it".** No lens is ever on by default — every read still passes `attestation_policy: null` until a user builds one. An active lens renders a banner that is not collapsible, naming its roots, threshold and depth, and saying in words that it is the user's question and not the protocol's verdict. And the unfiltered figures stay on screen beside the lensed ones, because a filter whose *effect* cannot be read off is presented as neutral even when its existence is disclosed.

  **A real defect the harness caught in this UI's own first version.** The banner printed "Claims N → N" beside the critique figure. `get_discourse_health` applies an `AttestationPolicy` when tallying **critiques and never when counting claims** — so that line implied the lens had considered claims and spared them, when it never looks at them at all. Misstating a filter's *scope* is the same §4.4 failure as hiding it. The banner now names the claim total as explicitly unfiltered.

  **An empty root set is refused rather than accepted.** `require_attestation_from: None` makes `is_agent_attested` return `true` for everyone, so a lens built with no roots would render a banner claiming a filter that filters nothing — a verdict while being none.

  **Vouching is disclosed, not gated, and that is §4.5's third rule rather than laziness.** `grant_attestation` is bounded by a membership-tenure bar and a rolling grant budget, and the coordinator exposes a status read for **neither** — unlike `get_synaptic_link_friction_status`. Gating on state this client cannot re-derive would refuse what the protocol might allow, so the affordance stays live and its cost is stated before it is spent. The *shape* of the rule is named and the numbers deliberately are not: the integrity zome calls its 30-day bar "a placeholder scale … tunable", so a figure copied into UI copy becomes a lie the day it is tuned.

  **A stated limit: no successful vouch has ever been observed, and none can be in a test.** Validation requires 30 days of membership tenure, so on any conductor a harness can create — minutes old by definition — `grant_attestation` cannot succeed. Confirmed directly rather than assumed: it returns "AttestationGrant requires proof of sufficiently tenured membership in this membrane". What is verified instead is the part that could regress — the affordance is offered, its cost is stated, the refusal reaches the user legibly, and an independent client confirms the refusal was genuine rather than cosmetic.

  **Verified live, and observed failing first.** `scripts/live-verify/trust-lenses.mjs`, twenty-eight checks — two agents *and* a browser, which no other harness here combines, because a lens needs somebody it legitimately excludes. It carries a **vacuity guard**: it refuses to run at all unless the seeded lens demonstrably removes something, after an earlier version seeded no critiques, filtered nothing, and passed every "the lens works" assertion while proving nothing. Then the violation it exists to catch was injected — a lens applied by default — and it failed **five** checks at once.

- [x] **Expertise assertions surfaced — and the claim that made them legitimate turned out not to be true yet.** `assert_expertise` justifies itself on the grounds that an expertise assertion **is** a Claim, "that anyone can critique through the existing typed CritiqueMode machinery … not a separate, unaccountable field". Surfacing it meant checking that, and the first half was false.

  **Anyone could critique it; nobody could find it.** `assert_expertise` builds its Claim by hand rather than calling `create_claim`, so it wrote only an `AgentToClaim` link and never the `DomainToClaim` index PR #51 added. Browsing `expertise/<domain>` returned nothing — verified against a live conductor before anything was built — and the assertion was reachable only by an agent who already knew whose expertise to go looking for. Exactly #51's bug, missed there because this function does not go through the fixed path. Two lines of Rust; a second agent now finds it, which is the only version of "findable" that means anything.

  **The badge is the §4.4 surface, and it is deliberately not a credential.** The coordinator's own comment says its trace-ownership check is "a courtesy, not an enforced rule" — a client bypassing the function can cite anyone's `WorldlineTrace` — and that these claims carry no standing. So the marker says what it is (self-asserted), what it is not (verified), and what the recourse is (critique it). No check mark, no accent colour, no pill: a credential-shaped badge on a field nothing validates would manufacture precisely the credibility signal Invariant #1 declines to compute.

  **It lives in the New Claim tab and nowhere else, on purpose.** A profile-shaped home would present expertise as a property of the person rather than an assertion they made and can be challenged on — which is the distinction the function exists to preserve. The `WorldlineTrace` is generated at submit rather than chosen: it is derived entirely from the caller's own chain, so the only choice on offer would be stale-or-fresh, and fresh is the honest reading of "evidenced by my history".

  **Verified live, and observed failing twice.** `scripts/live-verify/expertise-ui.mjs`, fourteen checks, two agents — because agent 1 finding its own claim proves nothing, since a source-chain read succeeds for the author whether or not the index was ever written. Reverting the index fix fails three checks including the CONTROL; replacing the marker with "✓ Verified expertise" fails five.

- [x] **The last two reads on §9's list surfaced — `get_critiques_by_mode` and `get_agent_constitution` — paired because they fail in opposite directions.** Neither is large. Both are easy to get wrong in a way that leaves a working screen.

  **`get_critiques_by_mode` is chain-local by specification** (SPEC §10.0, which names it alongside `get_membranes` and `get_all_constitutions` as deliberately unindexed: a global index over every critique of a mode is an unbounded firehose whose desirability is an open design question). It returns the caller's own critiques and can see nobody else's. **The failure mode is a label, not a bug.** A heading reading "Logical critiques" over that data is false, and worst in its empty state — a practitioner reads zero as "nobody critiques this way" when it means "I have not". So the affordance says "your own" before it is opened, the scope note cites §10.0 and spells out what zero means, and every count is phrased as *you have written N* rather than as a total.

  **`get_agent_constitution` is the opposite: a real cross-agent DHT read, whose failure mode is inferring from absence.** It answers what an author has publicly promised, which is what §4.3's cross-checking is checking *against* — without it a methodological critique is one person's opinion of another's method; with it, it is a comparison against something the author put on the record. Nothing requires an agent to publish one, so an author who has not is reported as exactly that, with no adverse framing. Making absence look like a deficiency would score agents on a field the protocol never asked them to fill — Invariant #1 through the back door, and the same shape as the "✓ Verified expertise" badge the previous increment refused.

  **Neither gets a bar, a percentage or a colour scale.** All three read as ranking, and there is nothing to rank against — the by-mode read cannot even see another agent.

  **Verified live, and observed failing first.** `scripts/live-verify/mode-and-constitution.mjs`, sixteen checks, **three agents**: agent 2 writes critiques agent 1 must never see, and agent 3 publishes no constitution on purpose so the absence path is exercised rather than assumed. Its first check is a control proving the read really is chain-local, so the honesty assertions cannot pass against a read that is merely broken. Then both violations were injected — presenting the chain-local read as network-wide, and rendering a missing constitution as "unverified" — and ten checks failed at once.

  **A documentation drift from the previous increment, fixed here.** SPEC §7's `DomainToClaim` row said "Written by `create_claim`" — true until #56 made `assert_expertise` write it too. Corrected, with the general rule attached: any future function that creates a `Claim` without going through `create_claim` has to write that index itself, which is exactly how the omission #56 fixed came about.

- [x] **The worldline half of HRR surfaced — `get_agent_worldline_trace`, `get_my_latest_worldline_checkpoint`, `verify_trace_checksum`, `query_worldline_resonance` and `sample_period`.** These were the eight functions the caveat above had wrongly called deferred; correcting that record is what made them visible as the one remaining candidate with real data and no screen. Taken on the argument that a worldline should be legible to its own author, not on a queue position.

  **Two kinds of answer, and the screen exists to keep them apart.** `period_boundaries` is exact and lossless; resonance is approximate by construction, and `query_worldline_resonance`'s own doc comment says a high similarity "is a hint worth checking, not a claim of fact" and that it "never substitutes for get_agent_worldline_trace's own period_boundaries". So the exact record renders first and unconditionally, the probe is layered beneath it, **every hit is paired with the exact boundary it points at**, and `sample_period` opens that window's real records. Making the hint checkable is the difference between honouring §2.5's "receiver, not a truth engine" and reciting it.

  **A real defect the harness caught in this screen's first version.** `query_worldline_resonance` scores **every** period index and sorts them — no threshold, no filtering — so a probe for a tag with no relationship to the chain still returns a full ranked list, just at low scores. Verified live: a real tag scored ~0.71 and a nonsense tag −0.09, both returning every period. The first version rendered those identically and described an empty result as "nothing resonates", a mechanism that does not exist. Presenting a ranked list as a set of *matches* is the truth-engine reading arriving through presentation rather than through the number, so the screen now says outright that it ranks every period and applies no threshold, and the genuinely empty return is described by its four real causes — no trace, a null payload, a foreign binding key, an unparseable payload.

  **This agent's own worldline only, deliberately.** The coordinator accepts any `AgentPubKey`, but a "how strongly does this agent resonate with domain X" probe over other people would hand every client a per-agent scalar that `get_membrane_members` makes enumerable and sortable — the leaderboard §9 records removing `get_credit_balance` to avoid, arriving by another route. The protocol permitting a read does not oblige a UI to offer it. The harness asserts there is no agent selector on the screen at all.

  **Verified live, and observed failing first.** `scripts/live-verify/worldline-ui.mjs`, seventeen checks, with a control that refuses to run unless the seeded trace has a real HRR payload and at least one period — otherwise "the exact half renders" would pass vacuously. Then the §2.5 inversion was injected — the probe rendered before the exact record, and the score restated as "73% match" — and two checks failed.

  **Neighborhood binding is not included, and that is §2.5's own division:** it calls neighborhood and worldline binding "two distinct HRR use cases, not one", independent rather than two halves of one job.

- [x] **Real multi-node networking — the first time anything in this repository has watched an entry travel.** `scripts/network.sh` and `scripts/live-verify/real-gossip.mjs`.

  **The gap was structural, not an oversight.** This document has said since Phase 1 that "gossip protocol is wave propagation — information ripples through the network organically," and §2.5 that "DHT gossip propagates the binding." Nothing here had ever run two conductors that could reach each other, so those were statements about Holochain taken on faith rather than observations of this hApp. `hc sandbox` produces no networking at all by default — the generated config reads `transport_pool: []` and `bootstrap_service: null` — and every multi-agent harness in `scripts/live-verify/` installs its extra agents on that same conductor, where two "agents" share one local DHT store and an entry is visible to the second the instant the first writes it, because it never travelled. `federation/` does drive two real conductors, but deliberately ones sharing no network; the boundary is the entire point there. So the arrangement needed to ask the question did not exist and had to be built: `hc run-local-services` for a bootstrap server and a tx5 WebRTC signal server, and three conductors generated against them.

  **Three nodes, and the third is what makes the other two mean anything.** nodeA and nodeB share a network seed, so they install identical DNA hashes and are on the same DHT. nodeC differs in the seed alone — same `.happ`, same wasm, same bootstrap and signal servers, same machine, same moment — so its DNA hash differs and it is on a different DHT. Without it, a harness watching nodeB succeed is an anecdote: "nodeB received it" and "any conductor pointed at these services would have shown it" are indistinguishable from a single positive.

  **Verified live — 25 checks against three conductors in three separate OS processes, with three distinct agent keys and three separate data directories.** nodeA published a `Claim`; nodeB received it over WebRTC in 2.0s, byte-identical in content and domain, carrying nodeA's agent key as author and the same `ActionHash` nodeA authored — found by two independent read paths (`get_claims_by_domain` and `get_claims_by_agent`). The reverse direction was exercised on its own fresh domain rather than inferred from symmetry: nodeB published, nodeA received in 2.1s. Every run uses a fresh domain string and reads it on nodeB **before** nodeA publishes, so "it was already there" is excluded without depending on how fast gossip happens to be. nodeC never saw any of it — watched for 20s past the moment nodeB succeeded, because "never arrives" is a claim about a stretch of time and not an instant, and checked to be alive and answering rather than merely silent.

  **The sharpest result is not the gossip; it is what the gossip made checkable.** `read-scope.mjs` established that `get_all_constitutions` reads the calling agent's own source chain rather than the DHT, and proved it with two agents on one conductor. That setup left one objection permanently open: with both agents on the same node there is no network, so "agent 2 cannot see it" was never fully separable from "there is nothing here to see it with." `read-scope` answered that indirectly, by pairing each chain-local read with a link-based read of the same entry at the same moment — a good answer, and not the direct one. Here the objection is retired outright. On a network demonstrably carrying claims in both directions moments earlier, nodeA published a `Constitution` and nodeB's `get_all_constitutions` returned only nodeB's own — with nodeB publishing one of its own first, so a read that was simply broken could not pass the check by returning nothing to anybody, and with a claim published alongside it arriving at nodeB normally, so a network that had quietly stopped working could not pass it either. **§9's caveat that on a real network a practitioner browsing with a chain-local read sees only their own work has been true and untested since it was written. It is now measured.**

  **Five things the tooling cost, recorded in `scripts/network.sh`'s header so they cost nobody else anything.** `--in-process-lair` puts a unix socket at `<root>/<node>/ks/socket` and unix socket paths are capped by `SUN_LEN` (~108 bytes), so a sandbox root under a long path fails at startup with `path must be shorter than SUN_LEN` and holochain's crash-report banner — an error naming neither the path nor the flag responsible. `hc sandbox generate` **appends** to a `.hc` file in the current working directory, and `sandbox.sh` reads that file's *last* line to decide which sandbox to resume, so generating these nodes from the repo root would have made the next `sandbox.sh start` try to resume nodeC; this script therefore runs with its cwd inside its own root, and cleans up with `rm -rf` rather than `hc sandbox clean`, which would delete `sandbox.sh`'s conductor too. And the bootstrap and signal ports had to be **pinned** despite `run-local-services` recommending ephemeral ones: a conductor's bootstrap and signal URLs are written into its persistent config at generate time, so a stop/start cycle brings the services back on new ports while the resumed conductors go on dialling the old ones — a network that reports itself fully up and on which nothing ever gossips. Observed exactly that way, and only caught because the previous run's services happened to still be alive.

  **The fourth was found by the pinning fix, and is the one worth generalising.** `( cd X && nohup Y & )` backgrounds the whole `cd && nohup` list, so `$!` names that transient subshell rather than the long-running process — an earlier version of this script recorded it, and `stop` therefore killed something that had exited milliseconds after starting while the real bootstrap and signal servers went on running and holding their ports. This is precisely the leak `sandbox.sh`'s header already documents for conductors, reproduced from scratch for the services because the lesson had been written down as a fact about `hc sandbox` rather than as a fact about backgrounding. It was invisible for as long as the service ports were ephemeral — every start got fresh ones, so a leaked predecessor collided with nothing — and pinning them surfaced it immediately as `AddrInUse`, which is an argument for pinning beyond the resume correctness it was done for. Every PID in this script is now *found* by matching the process's own arguments, never captured; and it was found by running `clean && start` end to end rather than by re-reading the function.

  **The fifth was found by exercising `stop` and `start` as a cycle rather than only from scratch.** `hc sandbox generate` installs an app *and enables it*; `hc sandbox run` against an existing sandbox brings the conductor back with the app **disabled**. Nothing about that is visible from outside: both ports answer, the process is alive, and `network.sh status` reports every node healthy. The first zome call then fails with `CellDisabled(CellId(...))` raised from inside the client's signing-credential setup — an error that names a cell id and says nothing about what is wrong or what to do. `start` now calls `hc sandbox call -r <admin port> enable-app` on every node, on the generate path as well as the resume path (EnableApp is idempotent, confirmed by calling it twice) so the two paths cannot drift apart.

  **Two fixes that looked sufficient were not, and that is the part worth keeping.** Adding the `enable-app` call changed nothing observable — the harness failed identically, same error, same cell. Enabling is asynchronous: the call reports `Activated app` while the cell is still coming up, and a client connecting inside that window gets exactly the error it would get if the app had never been enabled at all. The obvious follow-up, polling the app's own status until it reported `Running` before declaring the node ready, *also* changed nothing: that poll passes immediately, because the app's status flips well before the cell can accept a capability grant. What settled it was running the authorization by hand some minutes later and watching it succeed — proving a race rather than a stuck state. So the readiness signal is now the operation itself: `real-gossip.mjs` retries `authorizeSigningCredentials` on `CellDisabled` for up to 30s, and gives up with an explanation naming `list-apps` rather than a bare cell id.

  **Three general lessons rather than Holochain trivia.** A `start` that has only ever been run from scratch has not been shown to work, in the same way a harness that has only ever been green has not been shown to test anything — this was found only by exercising `stop` and `start` as a cycle. A fix that leaves the symptom byte-for-byte identical has not been shown to be the fix, however plausible its story; two in a row here looked right and were not. And a component's own report that it is ready is a weaker signal than the operation you need succeeding — where the two disagree, retry the operation.

  **Watched failing, twice, in the two ways that matter.** Pointing nodeB at nodeC's ports made three checks fail at once and aborted the run before it published anything, printing all three DNA hashes rather than producing a result that looked like an answer. The second injection is the one worth having: the receiver and the isolated-control slots were swapped and the precondition abort bypassed, so the "receiver" sat on a different DHT while the "isolated control" was a genuine peer. Fourteen of the twenty-five went red — and among them, the point of the exercise, **both nodeC control checks**. A control asserting that something never happens is exactly the check that can stay green forever while testing nothing, and swapping the slots is the only arrangement that makes it fail.

  **That run also showed something no green run could have.** Check 9's own assertion — nodeB does not see nodeA's constitution — **passed** during the injection, because the node in the nodeB slot was on a different DHT and could not have seen anything at all. What exposed the pass as empty was the paired control immediately after it going red. That is the exact job the paired control was added to do, now confirmed rather than assumed: without it, the sharpest check in this harness reports a meaningless green precisely when the network is broken in the way that matters most. Restored afterwards and re-run: all 25 checks green again, on the same conductors, without cleaning them.

  **The honest limit, since a green result here invites a bigger claim than it supports.** All three conductors run on one machine against a localhost bootstrap and a localhost signal server. What is now verified is that this hApp's entries propagate between genuinely separate conductors over a real transport, with real peer discovery, and that the chain-local reads stay chain-local when they do. What is *not* touched: NAT traversal, a public signal server, real internet latency, network partition and rejoin, or more than trivially few nodes. That is the next real networking gap, named here the same way the Launcher-install gap is named above rather than left to be discovered by someone reading a passing test as more than it is.

- [x] **Partition and rejoin — a node that was offline while history was written catches up, and it takes about five and a half minutes.** `scripts/live-verify/partition-rejoin.mjs`, and `stop-node`/`start-node` added to `scripts/network.sh`.

  **Why the previous increment was only half the question.** Real multi-node networking proved an entry crosses between conductors that are both up the whole time. A network whose participants are never offline is not a network anyone runs — laptops close, processes restart, links drop — and for a protocol built on "nothing is deleted, only witnessed", the property that actually matters is that a node which was *away* while history was written does not stay ignorant of it. Nothing tested that.

  **Partitioned in both directions, because one direction cannot tell two mechanisms apart.** A test where only one node ever goes offline cannot distinguish "the returning node catches up" from "the node that stayed up pushes to whoever appears" — different mechanisms, same happy path. So each node in turn writes something the other cannot see: nodeB is stopped and nodeA writes; then **nodeA is stopped before nodeB is restarted**, so the two are never running simultaneously, and nodeB writes. Stopping a conductor is the partition, deliberately — it is unambiguous and it is what actually happens, unlike blocking traffic between two processes that may both still hold an already-negotiated WebRTC connection.

  **The result, and the number is the interesting part.** Both nodes converged on the other's writes, in both directions, **at 326.6s — the same instant for both**, which is what shows they heal in a single gossip round rather than independently. Content and authorship were checked, not just counts. A claim written *after* healing then crossed in 5.0s, confirming the link was genuinely repaired rather than backfilled once. nodeC, on its own DHT, saw none of it throughout, and was confirmed alive rather than merely silent. 23 checks.

  **Five and a half minutes is not a defect, and the constant that explains it is in the conductor's own config.** Steady-state gossip here is ~2-5s. Post-partition catch-up is dominated instead by `gossip_peer_on_error_next_gossip_delay_ms: 300000` — a node that tried to reach a peer while that peer was down took the error path and will not retry it for five minutes. Worth stating plainly because it sets an expectation: **a node returning from an outage is not current for several minutes**, and any UI that implies otherwise would be lying about what it can see. *That expectation is narrowed by the transitive-gossip entry below: it holds when the only peer available is the one the node just failed to reach, which on a two-member DHT is always. With a third node up, the same catch-up takes seconds.*

  **A too-short timeout produced a confident wrong answer, and that is why the window is now derived rather than guessed.** The first version used a 180s window and was on course to report a convergence *failure* that would have been pure impatience. The window is now 600s, sized from the backoff constant above. A timeout that is shorter than the mechanism it is timing does not measure the mechanism; it measures the timeout, and reports it as a property of the system.

  **The first injection found a real defect in the harness rather than confirming it was sound.** With both partitions removed, so that nothing ever went offline, the two "is genuinely down" checks went red as they should — and **the divergence check, which carries the entire meaning of the run, stayed green.** It read the returning node immediately after the write, sooner than the ~5s a claim takes to cross, so it saw zero for a reason with nothing to do with any partition: the label said "it was never up alongside nodeA", the assertion tested "nothing has arrived yet". That is precisely the failure mode `scripts/live-verify/README.md` records — a check whose label claims more than its assertion tests — found live, in a new harness, by the injection convention that exists to find it. It now waits several times the crossing time Phase 0 measures on the same network before asserting absence, and the same injection turns it red.

  **A misleading pair of true numbers, also fixed.** Measured in sequence, the second direction was timed only after the first had already waited out the whole healing delay, so it reported `0.0s` and read as instant. The run printed "nodeA 351.7s, nodeB 0.0s" — both true, and together a false story. Both directions are now measured concurrently from one shared clock, which is how the matching 326.6s figures came out.

  **A leak in `network.sh` that only a caller could see.** `( cmd & )` looks like it detaches a process and does not: the child stays attached and the script blocks in `wait()` until it exits, which for a conductor is never. Running `network.sh` from a terminal hides this completely — the output all appears and the prompt returns — and it surfaced only when this harness called `stop-node`/`start-node` through Node's `execFileSync`, which waits for the process *and* for its stdout to reach EOF. The harness hung indefinitely with three leaked `network.sh` processes sitting in `do_wait` behind it, one per launch site. Every long-running child is now started with `setsid --fork`; `start` went from never returning to returning in 16s.

  **The honest limit is unchanged and worth repeating.** Three conductors on one machine against localhost services. This tests partition by process exit, not by network failure — no NAT, no packet loss, no asymmetric reachability, no partition of a group larger than two, and no case where both sides keep running but cannot see each other, which is the harder and more realistic shape. *The last of those is now covered by the entry below; the rest stand.*

- [x] **Both sides up, neither able to reach the other, and both still writing — a partition at the packet level.** `scripts/live-verify/network-partition.mjs`, run inside the throwaway namespace `scripts/netns.sh` provides.

  **Why the previous increment was still the easy half.** `partition-rejoin.mjs` partitions by stopping a conductor, which is unambiguous and is what actually happens — and it cannot reach the shape the entry above named as its own honest limit. A stopped process cannot accept writes, so a stop-based test can never have *both* sides diverging at once under live load. The interesting failure is the one where both peers are healthy, both keep serving, both keep writing, and they simply cannot see each other. Producing that needs packet-level control rather than process control.

  **The first assumption was wrong, and the harness now asserts against it rather than trusting it.** The obvious guess is that peers talk WebRTC over UDP, so dropping UDP should partition them. It was tried first and it did not work: claims crossed with all UDP dropped in both directions. The sockets explained why — each conductor holds exactly two TCP connections, one to the bootstrap server and one to the signal server, with **no direct conductor-to-conductor connection and no UDP socket at all**. Peer traffic is relayed through the signal server, so the data path to cut is TCP to the signal port. That is a fact about this setup and not a law, so check 2 reads the conductors' own sockets on every run and fails loudly if it ever stops being true — the alternative is a harness that goes on cutting a path nothing uses and reporting a partition it did not cause.

  **Cutting one port rather than all of them is what makes the result mean anything.** Severing every TCP path would partition the peers and prove very little, being indistinguishable from the machine's networking failing. So the cut is aimed at the signal port alone, and the bootstrap server on another port is probed throughout and must stay reachable. *Alive and reachable but for this one path* is the claim; a general outage is the thing being ruled out. Neither conductor is signalled, restarted or reconfigured, both answer zome calls throughout, and their pids are checked unchanged across the whole run — so "this is not secretly a restart" is asserted rather than asserted-by-comment.

  **The result. 26 checks, and the recovery figure reproduces.** Both conductors wrote while partitioned and neither saw the other for a dwell derived from that run's own baseline. On healing, **nodeA converged at 301.6s and nodeB at 301.5s** — measured concurrently from one shared clock, so neither number is an artefact of waiting for the other, and matching the same pair of figures a previous clean run produced rather than being one sample. Content and authorship were checked, not counts alone. A claim written after healing crossed in 5.1s. nodeC, on its own DHT, saw none of it and was confirmed alive rather than merely silent. The five-and-a-half-minute figure the entry above explains by `gossip_peer_on_error_next_gossip_delay_ms` holds here too, reached by a completely different route to the same backoff.

  **The first run found a real defect in the harness, which is the whole reason check 2 is written strictly.** It reported six direct conductor-to-conductor connections — which, had it been true, would have falsified the premise of the entire file. It was not true; the count was wrong. Those six were the harness's *own* admin and app websockets: every client connection it opens is a connection to a conductor, so `ss` attributes the conductor's end to holochain and it reads exactly like a peer link unless the ports are actually parsed. A check written loosely enough to pass would have banked that miscount as a fact about Holochain's transport. The excluded count is now printed on every run rather than silently subtracted, so the correction stays visible instead of disappearing the moment it went green.

  **Watched failing, four ways.** Cutting the bootstrap port as well turned **six** checks red — the intended control first, and then, unpredicted, both convergence checks, both authorship checks and the post-heal crossing, because with discovery cut too the peers never re-found each other: the harness does not merely notice a broad outage, it correctly reports that nothing healed. Removing the cut entirely turned exactly two red, and the second is the one worth having — *"neither side saw the other while the link was cut"* went red rather than staying green through a total absence of any partition, which is the `partition-rejoin.mjs` lesson (a check whose label claims more than its assertion tests) holding on a new harness. And the safety refusal was injected twice: run on the real machine it exits 1 before opening a connection, and run inside a user namespace that is *not* a network namespace — where the uid check alone says "throwaway, go ahead" and is wrong, since the real interfaces are still there — it still refuses, on the second signal alone. Neither signal is decorative.

  **A result was thrown away, and that is the most transferable lesson here.** The first bootstrap-cut injection reported that all four DROP rules had no effect whatsoever. That was a true observation and a false conclusion: several namespace runs had been started concurrently, and **a network namespace is not a mount namespace**, so they shared `/tmp/epi-ns` — which each run deletes on startup. `netns.sh` now takes a lock and refuses to overlap, which also protects the timings this harness exists to report. An impossible-looking result from a harness is a claim about the harness's environment before it is a claim about the system under test, and is worth reproducing in isolation before it is worth explaining.

  **The tooling cost one more thing, and it was invisible from any single run.** `unshare --net` isolates the network and *nothing else*, so when a namespace went away its conductors did not — nothing had ever told them to. Eighteen of them from six aborted runs, about 7.5 GB, were found still alive hours later, competing for the CPU of every run that came after. `--pid --fork` fixes the clean case and `--kill-child` fixes the aborted one, which was the case actually failing: a PID namespace dies with its own init, not with whoever started it, so killing the script left the inner shell and its three conductors running with no one watching. Measured rather than argued — SIGKILL to the outer process left three conductors alive; SIGKILL to the namespace's own init took all three down in four seconds. The header's promise that there is nothing to clean up was true of firewall rules and false of processes until then.

  **The honest limit, narrowed but not gone.** Three conductors on one machine against localhost services, and the partition is a firewall rule on a loopback port rather than a real network failing. What is now covered is the shape the previous entry named as missing: both sides up, both writing, neither reachable, and convergence afterwards. Still untouched: NAT traversal, a public signal server, real internet latency, packet loss and reordering short of a full cut, and any partition of a group larger than two.

  **One item was struck from that list after being measured, because it is not a gap in the tests but a property of the transport.** Asymmetric reachability — where one direction survives — was listed here as untested. It is not producible at all on this setup, and the reason is the socket topology check 2 asserts: all peer traffic rides a **single TCP connection per conductor** to the relay, and TCP has no independent directions. Dropping only the relay→conductor packets was tried directly, to find out rather than to argue about it. Exactly one further segment lands and then nothing does: the sender's unacknowledged data fills the window, `cwnd` collapses to 1, and it retransmits the same bytes under exponential backoff — `rto:12864 backoff:6`, 127 bytes queued and never sent — while `send()` goes on returning success for **over a minute**. The receiving end's TCP counted eleven inbound data segments carrying twenty new bytes; its application saw nothing after the first. So a one-way cut does not yield one working direction. It yields a dead link, and a sender with no way to tell. Genuine asymmetry would need direct peer connections — which check 2 asserts do not exist here — or interference above the transport, and neither is a firewall rule.

  **Which leaves a gap none of these paragraphs had named: the DHT under test has only ever had two members.** `network.sh` puts nodeA and nodeB on the shared seed and nodeC on a different one by design, so nodeC is a control rather than a participant. Every networking result so far is therefore a two-party result, and in a two-party network **gossip and point-to-point delivery are indistinguishable** — an entry has never once reached a node from a peer that was not its author. That is the same ambiguity that made `partition-rejoin.mjs` partition in both directions and `read-scope.mjs` pair every negative with a control, sitting unexamined under the whole networking story. A third node on the shared seed makes the first genuinely new question askable: partition A from B, leave both reachable from D, and see whether A's write reaches B *through* D.

- [x] **An entry reaches a node from a peer that did not author it — and the five-and-a-half-minute recovery figure turns out to be an artefact of having only two nodes.** `scripts/live-verify/transitive-gossip.mjs`, and an opt-in `nodeD` in `scripts/network.sh`.

  **The gap none of the three previous honest-limit paragraphs had named.** `network.sh` put nodeA and nodeB on the shared seed and nodeC on a different one, so the shared DHT had exactly **two members** and nodeC was a control rather than a participant. Every networking result up to here was therefore a two-party result, and in a two-party network "nodeB has nodeA's entry" cannot distinguish gossip from point-to-point delivery, because nodeA is the only peer nodeB has. An entry had never once reached a node from a peer that was not its author. That is the same ambiguity that made `partition-rejoin.mjs` partition in both directions and `read-scope.mjs` pair every negative with a control — sitting unexamined underneath the whole networking story.

  **The obvious design cannot be built here, and the reason is the previous increment's own finding.** The natural experiment is spatial: partition A from B while leaving both able to reach D, then watch A's write arrive at B by the only route left. That is not producible on this setup. All peer traffic is relayed through the one signal server, so a conductor's entire network presence is a single TCP connection to it — cut it and the node is isolated from everyone including D, leave it and the node can reach everyone including B. There is no per-peer granularity at the packet layer to aim a rule at, and giving each conductor its own address would not create any, since the relay is still one hop that either carries a node's traffic or does not. This is the same constraint that makes asymmetric reachability impossible here, applied to a different question.

  **So the isolation is temporal, which this network expresses exactly.** nodeB is stopped and nodeA writes; nodeD, up throughout, is confirmed to have acquired the claim, because a courier that never received the parcel cannot deliver it. Then **nodeA is stopped before nodeB is restarted**, so the two are never running together. An earlier version also asserted that nodeB returns *without* the claim; that assertion was removed after a full-suite run turned it red, because it tested a race rather than a property — nodeB can sync from nodeD during the connection handshake, and on a warmed network it does, in 0.0s. Divergence never depended on it: the domain is minted fresh and nodeB is asserted genuinely down before the claim is authored, so a node that was not running cannot have been sent it. The only live holder is nodeD, which did not write it. The author's liveness is re-checked on *every poll* of the wait rather than once at the start — "nodeA was down when we began waiting" is a much weaker statement than "nodeA was down at the instant the entry arrived", and only the second supports the claim.

  **The result, and the number is the interesting part again.** nodeB acquired nodeA's claim, with nodeA's content and nodeA's key as author, while nodeA was down for the whole wait. 21 checks. Three clean runs measured **5.0s, 55.3s and 55.3s** — reported as a range rather than a constant, since the same figure twice suggests a periodic gossip cycle a returning node waits its turn in rather than random scatter.

  **Which quietly corrects the headline figure of the entry two above.** `partition-rejoin.mjs` measured a returning node taking **326.6s** to catch up, dominated by `gossip_peer_on_error_next_gossip_delay_ms: 300000` — the backoff a node incurs against a peer it tried and failed to reach — and that was written up as "a node returning from an outage is not current for several minutes." With a third node present the same catch-up takes seconds. The difference is not a faster protocol; it is that a returning node has no failure history against a peer that stayed up, so there is no backoff to wait out. **The five-and-a-half-minute figure is a property of a two-member DHT**, where the only peer a returning node has is the one it just failed to reach. Stated as the inference it is: it rests on the measurements and the config constant, and this harness does not instrument the backoff directly. But it is a *paired* measurement, not a comparison across configurations — `partition-rejoin.mjs` was re-run on this same network, same machine, same session, after the `network.sh` change and with nodeD down: 23 green, catch-up **326.7s** against the 326.6s it first recorded. The two figures being contrasted differ in the presence of one conductor and not in the machine, the build or the day. That re-run doubles as the regression check for making nodeD opt-in — the harness the opt-in exists to protect is confirmed unaffected by running it rather than by arguing it should be.

  **nodeD is opt-in, and that is load-bearing rather than tidiness.** Adding a third node to the default network would break `partition-rejoin.mjs` outright — that harness stops the author before restarting the returning node precisely so the returning node cannot have obtained the entry from its author, and a third node holding the same entry defeats exactly that, turning its divergence check red for a reason unrelated to the property it tests. `network-partition.mjs` would be muddied the same way on the healing side. So `start` brings up the same three conductors every existing harness was written against, and anything wanting a three-member DHT brings nodeD up itself and puts it back.

  **Watched failing, and the first injection is the one worth keeping.** Leaving nodeA running rather than stopping it — the single confound the whole design exists to exclude — turned three checks red, and **"nodeB acquired the claim" stayed green**. It stayed green because nodeB genuinely did acquire the claim; it simply acquired it from the wrong place, and nothing about the positive result distinguishes the two cases. What distinguishes them is the paired control on the author's liveness. Without it this harness would report a confident, meaningless success in exactly the arrangement it was built to rule out — the same shape `real-gossip.mjs` recorded when its receiver and control slots were swapped, reproduced on a different property. The second injection is the causal half: removing the courier at the moment of delivery, so nothing live holds the claim, turned the acquisition check red after the full 600s window elapsed with zero on every poll. With the courier, seconds; without it and nothing else changed, still nothing ten minutes later. The difference between those two runs is one process.

  **The honest limit.** Three members is not many, and the courier here is a single node rather than a path of several. What is now shown is that an entry can arrive from a non-author peer at all, and that recovery time depends on how many peers a returning node has — not how either behaves at a scale anyone would call a network. Still untouched: NAT traversal, a public signal server, real internet latency, packet loss short of a full cut, and partitions of a group larger than two.

- [x] **The audit that found the two layout defects is now a harness, and running it found a third thing — that the two fixes were masking each other.** `scripts/live-verify/layout-fits.mjs`.

  **Why it needed its own file.** The guards for the two defects below were added to `author-scope-ui.mjs`, because that is the file whose work uncovered them. Wrong home twice over: "the page does not scroll sideways" is not a fact about `get_claims_by_agent`, and measuring it there only ever covered one tab of six. Worse, the audit that actually found both defects was a throwaway script that was deleted — so the evidence for the most interesting finding of the increment was not reproducible by anyone who was not present. It now runs over every tab at 390, 360 and 320, with an unbreakable token on screen.

  **The first injection found a hole in the new harness, on the run that was meant to validate it.** Removing the wrap rule turned Browse red at every width and left **By Author green** — not because that tab was sound, but because it starts empty until asked for an agent, so the measurement had nothing to measure. That is the vacuity trap this harness's own header warns about, reproduced inside the harness, by the first injection capable of exposing it. By Author is now loaded from a byline click and asserted to be rendering the token *before* it is measured.

  **The second injection is the one worth the whole exercise: it passed, and the harness was wrong.** Putting back the pre-fix tab bar produced **all green**. The two fixes overlap — `overflow-wrap: anywhere` lets a flex item shrink below its own word width, so instead of overflowing, the old bar renders six tabs 65px wide and **100px tall with every label broken mid-word**, "Critique Types" shredded down a column. Nothing scrolls sideways, so an overflow-only assertion calls it a pass. **Two defects that look identical from outside and are not**, and only one of them is about overflow at all. The check now also asserts that no tab label is split across more than two line boxes — wrapping between words is fine, wrapping inside one is not — and the same injection turns eighteen checks red.

  **Which is this directory's recorded failure mode in new costume**: a check whose label claims more than its assertion tests. "Fits the viewport" claimed the page was laid out acceptably; it tested only that nothing hung off the edge. 27 checks, and `author-scope-ui.mjs` is back to the 20 that are actually about its own subject.

  **The gap that shipped with it has been closed, and closing it doubled what the harness can catch.** The first version measured four of its six tabs empty, so their green meant only that an empty screen fits. Domains now renders a membrane whose description carries the token and Critique Types a species whose required evidence does — and the proof that this matters is the injection, not the intention: removing the wrap rule now turns **twelve checks red where the same injection had produced six**. Both new controls earned their place on their first run, going red because neither tab loads anything until asked — Domains needs "Load domains" clicked, exactly as By Author needs an agent. The same trap, caught twice by the same kind of check.

  **The two tabs that still cannot fail on content are named rather than glossed**, since claiming otherwise would be the overstatement this harness exists to catch. New Claim is a form: the token is typed in, which exercises the field, but a `textarea` scrolls its own content and cannot push the page sideways however long the input. Worldline renders dates and short domain names — checked rather than assumed, its longest unbroken run is **20 characters**, and its checksum appears as the sentence "Checksum verifies — this trace is intact" rather than as a hash. An earlier draft of this entry claimed that tab rendered long base64 by nature; it does not. For those two a green means the structure fits, and nothing more.

- [x] **No wrap rule existed anywhere in the stylesheet, so one pasted URL scrolled the whole page sideways.** `mobile-ui/src/style.css`, and text-run assertions in `scripts/live-verify/author-scope-ui.mjs`.

  **Found by asking whether the tab-bar defect below was the only one of its kind.** It was not, and the second one is worse: the tab bar was a fixed set of six short labels, while this is any claim, critique, species name or membrane description a user ever writes. A single 153-character URL in one claim produced **1326px of scroll width inside a 320px viewport**. The stylesheet contained no `overflow-wrap`, `word-break` or `word-wrap` rule at all, so every user-text surface shared the defect — and this app renders unbreakable tokens by nature: base64 agent keys, action hashes, pasted links.

  **Fixed once, on `html, body`, rather than per class**, since the absence was global. `anywhere` rather than `break-word`, so min-content sizing shrinks too and a flex or grid parent cannot be forced wide by a child it is unable to break.

  **The near-miss is the part worth recording.** The first measurement pass reported *no overflow at 390px* and overflow at 360 and 320, which read like a width-dependent bug. It was not: at 390 the claim had not finished loading, so the screen being measured was empty, and **an empty screen never overflows**. A true observation, a false conclusion, and it would have hidden the defect entirely had the narrower widths not happened to load in time. Every layout assertion now sits behind a control confirming that the content capable of breaking it is actually on the page — and the probe retries the load rather than accepting an empty screen as an answer.

  **Element rectangles cannot see this defect**, which is why the assertion measures text runs. A long token overflows its container without the container's own box ever exceeding the viewport, so a sweep of `getBoundingClientRect()` over every element reports zero offenders while the document scrolls. The check walks text nodes with a `Range` instead. Watched failing: removing the rule turns six checks red across the three widths, while both tab-bar checks stay green.

- [x] **The tab bar had been overflowing the page sideways, on every width this UI is for.** `mobile-ui/src/style.css`, and six layout assertions in `scripts/live-verify/author-scope-ui.mjs`.

  **Found by doing a regression check that had been skipped, which is the part worth keeping.** Adding nodeD to `network.sh` was followed by re-running `partition-rejoin.mjs` to prove the change had not altered what it measured. Adding a sixth tab to the UI was not followed by anything equivalent — thirteen browser harnesses interact with that tab bar and only the new one was run. Going back to do it found the defect, and the defect turned out to predate the new tab entirely.

  **What was actually wrong, measured at three widths.** A flex item's default `min-width: auto` will not let it shrink below its own min-content width, so `flex: 1` never made six labels — or five — fit into 390px. The bar overflowed, tabs were clipped, and **the whole document scrolled sideways at 390, 360 and 320**, with `New Claim`, the primary write action, off the right edge. Confirmed as pre-existing by building the commit before the By Author tab and measuring it the same way: five tabs, same clipping, same horizontal page scroll. The sixth tab made it worse and made it visible; it did not cause it.

  **Why no harness had noticed.** Every browser harness runs at 390×844, so all of them were driving a page that scrolled sideways, and none of them looked. They navigate by clicking tabs by accessible name, which works regardless of whether the tab is inside the visible bar — Playwright scrolls to an element before clicking it. A test suite can drive a broken layout indefinitely without a single red check, because clicking is not seeing.

  **Fixed by wrapping**, which costs a row of vertical space and keeps every tab reachable — the better trade on a phone than a strip that hides its own contents. Two rows at 390 and 360, three at 320.

  **The check asserts on the document, not the design.** It tests that the page does not scroll sideways and that no tab falls outside the bar, rather than a tab count or a row count, because those are design choices that may change while "a phone screen does not scroll sideways" should not. Watched failing: restoring the previous CSS turns all six red.

- [x] **The Twitter bridge's zome surface is verified end to end, and the first run found a real defect: promoted claims were invisible to anyone browsing their own domain.** `scripts/live-verify/mew-lifecycle.mjs`, and a one-link fix in `promote_mew_to_claim`.

  **Nine coordinator functions belonged to `bridge/` and not one had ever been exercised against a running conductor.** They had unit tests and inspection, which is exactly the position this project records as insufficient — a deliberately broken `get_claims_by_domain` once passed the entire suite, because packing compiles nothing and a stale build verifies the previous version of everything. The bridge was the last subsystem resting on that.

  **It did not need Twitter, which is why the gap lasted longer than it needed to.** Holochain zome functions cannot make network calls — there is no HTTP in the WASM host — so all nine are pure DHT and source-chain operations. Checked rather than assumed: the coordinator's only matches for `http` or `fetch` are in comments. What genuinely cannot be verified is the live X API layer inside `bridge/` — auth, rate limits, response parsing — which stays deferred pending API budget and is named in the harness's own output so a green run cannot be mistaken for covering it.

  **The defect, found on the first run.** `create_claim` indexes a claim under two anchors: `AgentToClaim` and `DomainToClaim`. `promote_mew_to_claim` created `AgentToClaim` and `MewToClaim` — **and no domain link at all**. So every Claim the bridge promoted was invisible to `get_claims_by_domain`, which is every by-domain reader there is, the Browse tab included. The Claim existed, validated, and was reachable through `get_claims_by_agent`; the bridge could promote a Mew, report success, and produce something nobody browsing that domain would ever see. It is the same defect `create_claim`'s own comment records having been fixed on that path — "browsing a domain returned only your own claims" — repaired there and never propagated to the promotion path, because the fix was applied to a caller rather than to the shape both callers share.

  **The 67 coordinator unit tests passed before the fix and after.** They are not wrong; they cannot see this. A missing link is not a bad return value — the function returns a perfectly good `ActionHash` either way, and only a reader on the far side of the DHT notices that nothing is there. That is the argument for this directory, restated by the one subsystem that had been left out of it.

  **What the harness asserts beyond the CRUD.** That the bridge is "a transducer, not a pipe": a Mew is not a Claim, a Claim is not mirrored, and each crossing is a separate witnessed act — checked by confirming after every step that the *next* one has not silently happened. And two scoping facts invisible from the function names: `get_unbridged_mews` and `get_unbridged_claims` both use `query()` with a `ChainQueryFilter`, so they read the caller's own source chain and never the DHT. A second agent publishes an unbridged Mew purely so its absence from the first agent's queue can be checked, in both directions. 21 checks.

  **Watched failing a second time, deliberately.** Dropping `source_mew` on promotion turns exactly one check red — the provenance assertion — while content, tags and author stay green, correctly: a promoted claim with its provenance stripped is identical in every other respect, which is why that check is written separately rather than folded into "the claim looks right".

- [x] **The neighborhood half of HRR has a surface — the last substantial capability that was built, paid for and unreachable.** `scripts/live-verify/neighborhood-ui.mjs`, and a resonance probe on every claim card. **38 of 58.**

  **It is a membership probe, not a search, and that is what makes it safe to surface at all.** `query_neighborhood_resonance` does not discover related claims: it scores candidates the caller supplies and echoes each back with its own hash. A discovery feature would have to rank the DHT by relevance, which is exactly the comparative ordering Invariant 1 refuses and which the MCP server already refuses on the agent side. Here the candidates are the other claims already loaded in the domain — material the reader chose, not a ranking of everything.

  **§2.5's rule is a question of document order as much as of wording.** The approximate reading must never displace the exact one, so the probe sits *after* the grounding badge and the critique stack, is opt-in, and renders nothing until asked. An earlier draft of this work put it before the critique toggle while its own comment claimed it came after — caught by reading the code against the comment, which is the failure this project tracks most often and which does not stop applying to the person writing the guard.

  **The trap, inherited from the worldline half and just as live here.** The coordinator applies **no threshold**: it scores every candidate handed to it and returns them all, so probing claims with no relationship to the subject still yields a full list, just with low scores. Rendered as a set of findings, a meaningless probe reads as evidence. The screen says so before showing any of it, and the harness proves the claim by requiring an *unrelated* claim to appear among the results rather than merely requiring rows to exist.

  **Watched failing, and the second injection changed the argument.** Rendering similarity as "73% match" turns two checks red — the same inversion `worldline-ui.mjs` records, repeated here because the two halves are separate surfaces. Then filtering to `similarity > 0.2`, the sort of reasonable-looking tidy-up someone would add later, turned **four** red by taking the panel to **zero rows**: every score in that arrangement is below 0.2, because a binding built from one neighbour spreads thinly over a fixed-size vector. A threshold does not trim noise here; it empties the panel whenever a claim's neighborhood is small, and reports nothing while looking like it found nothing. That is a better argument for the no-threshold rule than the caveat's own wording.

- [ ] **Pre-registration (commit-reveal) — the real question the privacy investigation surfaced, recorded rather than built.** What `EntryVisibility::Private` genuinely provides is not privacy but **timestamped commitment**: an agent commits a private entry now, its Action and entry hash are published, and a later reveal can be checked against that hash — proving they held the content at the earlier time without disclosing it then.

  The epistemically apt use, and the only one that clearly fits this protocol, is pre-registering a prediction before the evidence exists — the standard defence against HARKing (hypothesising after results are known). A protocol built around `Claim`, `Critique`, `Evidence` and declared confidence arguably has a shaped hole here, and this is the primitive that fits it.

  **Deliberately not built.** No one has asked for it; the need is inferred from the protocol's subject matter rather than reported, and this project's standing rule is that a mechanism waits on a stated need — the reasoning that removed the burn tier and declined capacity applies unchanged. It would also need real design, not just a private entry type: what a reveal action looks like, how a revealed prediction relates to the `Claim` it becomes, and whether an unrevealed pre-registration should be visible as such (it necessarily is, since the Action publishes). Worth doing properly if someone wants it; not worth doing speculatively.

  **The naive version is gameable by SELECTIVE REVELATION, and this is the caveat that turns "not yet" into "not carelessly".** Commit ten predictions, reveal the two that came true, stay silent on the eight that did not. Every reveal verifies. The track record is a fabrication wearing a cryptographic proof. A commitment establishes that the author held *that* content at that time; it never establishes that it was all they held. Note what this does to the argument for building it at all: the protocol currently *cannot* express foresight, which is an honest limitation and a visible one, while a careless implementation would express it **wrongly**, in a form that looks rigorous and is awkward to dispute. For a protocol whose whole value is that its signals are honest, a false positive is worse than a missing signal — this feature would not reduce the HARKing it targets so much as launder it. Anything built here therefore needs the denominator: a reveal deadline so an unrevealed commitment expires visibly rather than silently, the count of expired commitments readable alongside the revealed ones, and a prediction bound to a question posed in advance so it cannot be reinterpreted at reveal time to fit whatever happened.

  **And it runs directly at Invariant 1, which is the deeper reason to design it before building it.** "Who called it right" is a comparative standing, and this feature begs to become one. The invariant permits exactly what pre-registration would produce — raw history, open and queryable, a record of what someone committed and when — and forbids what everyone would immediately want computed from it. So the constraint is not on the record but on the arithmetic: no hit rate, no calibration score, no ranking of forecasters, however tempting a cryptographically verifiable one would be. A leaderboard arriving with a proof attached is *worse* than an obviously subjective one, because it is harder to argue with and no more legitimate. That is the trap this entry is parked in front of, not merely the absence of a stated need.
- [ ] **Surface the epistemic state the backend already computes — now 38 of 58 coordinator functions, from 4.** Everything the protocol computes *about* discourse is what distinguishes it from a forum, and most of it had no surface. Shipped so far: the HUD layer (`get_discourse_health`, `get_effective_conductance`, `get_cross_domain_critiques`, `get_antibody_patterns_for`, `get_synaptic_link_friction_status`), membranes and governance (`get_membranes`, `get_membrane_members`, `join_membrane`, `create_membrane`, `publish_constitution`), evidence and grounding (`create_evidence`, `get_grounding_path`), and retraction in both directions (`create_retraction`, `get_retractions_for_claim`).

  **The critique taxonomy is now shipped** — `get_all_critique_species`, `get_critique_species_adoption_count` and `create_critique_species` all have a surface, and `Critique.species` is no longer hardcoded `null` at the one place a critique is written. See the Critique Types entry below.

  **The ordered list this item carried is now empty, and the one thing the audit found behind it has been built.** Every read the list named has a surface, and the residue below was re-checked function by function against the code rather than carried forward — which is how `get_claims_by_agent` turned out to be filed under a justification that does not describe it. **It now has a screen of its own**, the By Author tab, verified by `scripts/live-verify/author-scope-ui.mjs`; the rest of the residue has reasons that hold. The count is 37 of 58.

  **The screen had to be built so that a plausible fake would fail it, because the fake here is very plausible indeed.** A By Author tab that filters the claims the Browse tab already loaded — client-side, by author — looks correct, is correctly scoped, and leaves `get_claims_by_agent` exactly as unsurfaced as it was. So the harness makes the agent publish into two domains, has the browser load only the first, and requires the second to appear: a filter over the browser's own memory cannot produce a claim the browser has never held. A watcher on `WebSocket.send` confirms the function name actually goes onto the wire, wrapped before the app loads rather than added as a reporting hook to the app, since a check that depends on production code cooperating is one the production code can satisfy while doing nothing else. **Injecting exactly that fake turns three checks red — and leaves both per-agent scoping checks green**, honestly, because a client-side filter by author really is scoped by author. The assertions that look like they carry the meaning are not the ones that do.

  **Invariant 1 shapes the screen, and it cuts both ways.** It bars a canonical comparative score while requiring that raw history stay "open and queryable" — so an unranked list of what one agent has claimed is the shape the invariant protects rather than one it constrains. What would breach it is the framing, not the list: arriving by ranking agents, sorting by anything readable as merit, or a tally beside a person. The screen shows **no count**, deliberately, even though the per-species adoption count is precedent for showing a number as a fact rather than a position — agents are what Invariant 1 is actually about, and a claim tally next to a person is much closer to karma than an adoption tally next to a critique type. Injecting a count proves the guard is structural rather than verbal: **one check goes red, and the two that read the words stay green**, with the screen still saying "this is a record, not a ranking" and "there is no score here" immediately after the number. A screen can state the invariant it is breaching, in the same paragraph, with no contradiction a text search would find. What remains unsurfaced is the residue the caveat below itemises — bridge-only functions, the HRR/worldline group, `federation/`'s two, prober externs that exist to be watched being refused, one read that is chain-local by specification, and four hash-addressed getters a screen holding the record does not need. None is a screen anyone has asked for, so the next increment here needs a new argument rather than the next entry on a list; this item stays open because "most of it had no surface" is still true of the count, not because a queue is waiting. **The HRR group is the one candidate with real data and no screen** — see the caveat, which corrects a long-standing claim that it was deferred with empty payloads.

  **A caveat on the denominator, since 58 invites the wrong arithmetic.** The 22 unsurfaced functions are not 22 missing screens, and they divide as follows — recounted against the actual call sites rather than carried forward, after an earlier version of this paragraph was found to be wrong on all three points below. **Nine are bridge-only** (`create_mew`, `get_unbridged_claims`, `import_twitter_reply` and siblings) and belong to `bridge/`. **Three are HRR's neighborhood half** (`build_neighborhood_binding`, `query_neighborhood_resonance`, `recall_neighborhood`) — §2.5 calls neighborhood and worldline binding "two distinct use cases, not one", and the worldline five now have a screen. **Two are `federation/`'s**, two are negative-path probers whose own doc comments say they exist to *fail* (`attempt_unaccountable_membrane` and, since the by-domain index landed, `attempt_false_domain_index`), and `export_to_n4l` is an export path. **One, `get_all_constitutions`, is chain-local by specification** (SPEC §10.0, alongside `get_critiques_by_mode` which now has a surface saying so). *(Count re-derived after the neighborhood surface landed: 38 of 58, residue 20 — `query_neighborhood_resonance` moved from the residue to the surfaced set, and `build_neighborhood_binding` and `recall_neighborhood` remain unsurfaced because the one-call wrapper is what a screen needs; the two-step local pipeline is for a caller caching a corpus.)*

Three of the four remaining are genuinely **hash-addressed getters** which a screen that already holds the record does not need to call: `get_claim`, `get_evidence` and `get_critique_species` all take an `AnyDhtHash`, and the reasoning holds. **The fourth was not, and the reasoning never held for it.** `get_claims_by_agent` takes an `AgentPubKey` and returns `Vec<Record>` — a DHT-wide query for everything a given agent has claimed, not a lookup of a record the caller already has. The paragraph had been using a true statement about its three neighbours to excuse a fourth it did not describe. **That one now has a screen**, so the residue is 21 and every member of it has a reason that survives inspection.

  **Verified rather than carried forward**, before and after: the denominator is 58 (60 `#[hdk_extern]` attributes, two of them inside comments), the numerator is now 37 counted wrap-aware across `mobile-ui/src`, and no call site names a function that does not exist. The 21 divide as nine belonging to `bridge/`, three to HRR's neighborhood half, two to `federation/`, two probers that exist to fail, one export path whose caller is `sstorytime/ingest.sh` rather than a screen, one read that is chain-local by specification, and three hash-addressed getters.

  **The worldline half of the HRR group now has a surface, and the paragraph that once called the whole group deferred was wrong about it.** The claim was "Phase 3 defers with payloads empty, so there is nothing to show yet", which is the opposite of what Phase 3 did: it is Phase *2*'s line — "WorldlineTrace with HRR hooks (payloads empty)" — describing the state before the work, mistakenly carried forward past it. `generate_worldline_trace` populates `trace_payload` and `binding_key` from a real superposition over every period the chain scan computes, and leaves them `None` only for an empty chain with nothing to compress. Neighborhood binding and peer query support shipped too. Those eight were the one part of the residue with real data and no screen, and five of them — the worldline half — were surfaced on exactly that argument: a worldline should be legible to its own author. The three that remain are neighborhood binding, which §2.5 treats as an independent use case rather than the rest of this one. Recorded at this length because the error survived being copied forward and then repeated aloud, and a count that quietly justifies itself is worse than no count.

  Tracking the raw ratio overstates the gap, and — as the read/write asymmetry above showed — can understate it too, since a function with a screen can still be half-surfaced.

  A note on the denominator moving: it was 57 and is now 58 because PR #51 added `attempt_false_domain_index`, a prober extern that exists so validation can be watched refusing a poisoned index rather than assumed to. It is not a screen anyone wants, and it moves the denominator without moving the goal — recorded because a count that drifts silently is how the last error in this metric went unnoticed.

  A note on the count itself: it was reported as "12 of 56" for several increments and was wrong — the metric regex only matched calls whose function name sat on the same line as `callZome`, and several wrap. Corrected by counting across lines.
- [ ] Academic validation study

---

## Agents

Two ways for a program rather than a person to participate, and the difference
matters more than it looks.

**[`agent-sdk/`](agent-sdk/README.md)** is a typed client library — the right
thing when you are writing an agent and already know this protocol exists.

**[`mcp-server/`](mcp-server/README.md)** exposes the protocol as MCP tools, and
answers a different question: how does an agent *find* this at all. For an
MCP-capable model the tool schemas are the documentation — it discovers the
vocabulary, the required fields and the constraints by listing tools, with
nobody having written an integration first.

**The agent surface is the other door into the same invariants, and it is
guarded the same way.** There is no ranking tool, no `top_claims`, no agent
reputation and no delete — and `scripts/live-verify/mcp-server.mjs` fails if any
appears, because an agent that found a ranking tool would use it and Invariant 1
would be broken from outside the app rather than inside it. Injecting exactly
such a tool turns those checks red.

The friction budget is the part an agent author should read: critiques are
capped per rolling hour, the cap is network-enforced, and a spent budget is
reported as the protocol working rather than as a failed request — so a loop can
tell "wait" from "something is broken".

## Installing it (for people who just want to run it)

See **[INSTALL.md](INSTALL.md)**. The short version: install the
[Holochain Launcher](https://github.com/holochain/launcher/releases), download
`epistemic-resonance-happ.webhapp` from [the latest release](../../releases/latest),
and install it from a file. No Rust, no Node, no terminal, no account.

Everyone installing the same `.webhapp` lands on the same network — the bundle
declares no network seed, so the file itself decides which peers you join.
INSTALL.md states the two caveats that matter to a first-time user in plain
terms: cross-internet peer discovery is the one thing this project has never
been able to test, and a returning node takes minutes rather than seconds to
catch up when it is the only other peer.

## Licence

Dual-licensed under either **[Apache License 2.0](LICENSE-APACHE)** or the
**[MIT licence](LICENSE-MIT)**, at your option — `SPDX-License-Identifier: MIT OR Apache-2.0`.

Both, rather than one, because the protocol core is Rust, where offering both is
the ecosystem's convention and what contributors and reimplementers expect. It is
also strictly more permissive for a recipient than either alone: take the Apache
arm for the express patent grant, or MIT for shorter and more widely understood
terms. The deciding reason was compatibility — Apache-2.0 on its own is
incompatible with GPLv2, which would have quietly excluded a class of downstream
projects from using this at all.

Unless you state otherwise, any contribution you intentionally submit for
inclusion is dual-licensed as above, with no additional terms.

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
