# The Epistemic Resonance Protocol
## A General Theory of Dimensional Preservation Across Digital-Physical Boundaries
### Architecture, Implementation & Operating Manual

---

**Version:** 0.1.0  
**Date:** 2026-08-25  
**Status:** Design Complete — HRR Compressor Deferred  
**Licence:** MIT OR Apache-2.0, at your option — see [Licence](#licence)  
**Runs on:** Holochain 0.7.0

---

> ### Just want to run it?
>
> **[Download the desktop app](https://github.com/StateofIntent/epistemic-resonance-desktop/releases/latest)**
> — Windows, macOS and Linux, each carrying its own Holochain conductor. No
> Rust, Node, or terminal needed. See [INSTALL.md](INSTALL.md) first: the
> builds are unsigned, so macOS needs one Terminal command to open them, and
> there are three other things worth knowing before you install.
>
> Everything below is for working on the code.

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
  **The honest ceiling:** global sybil resistance requires a global scarce resource, which an agent-centric DHT deliberately doesn't have — that's the tradeoff this architecture makes on purpose, not an oversight. What *is* available for free is **containment** — and this passage called it "local sybil resistance" for a long time, which claims a stronger property than what is actually there. **Nothing in this protocol resists the creation of a sybil.** A membrane with a genuine founding population that actually resonates with new claims (via real `SynapticLink`s from real, established agents) is not protected because the attack is refused. It is protected because a membrane full of self-attested sybils has no links from anyone outside it, so nobody ever traverses into the ring. The entries are created successfully, they are valid, and they sit there — **unreachable rather than rejected**. A reader who asked "so is it sybil resistant locally?" was being answered *yes* by a phrase that meant something else. The outcome falls out of the topology (Invariant #2) rather than needing to be separately engineered, which is precisely why the name matters: a property nobody built is also a property nobody can tune, and calling it resistance invites exactly the wrong expectation about what happens when it is leaned on.
  **Containment holds for traversals. It does not hold for index lookups** — the caveat that makes the distinction load-bearing rather than pedantic, and the reason the paragraph above cannot simply be re-worded and left alone. You arrive at a claim by following `SynapticLink`s from something you already hold, and a ring with no inbound links is never reached that way. `get_claims_by_domain` is **not** that kind of read: it is answered from the by-domain index directly, without walking anything, and `Claim` creation carries no friction by design — a decision §9's currency entry examined on purpose and kept, on the reasoning that `Claim` only ever extends its own author's anchor. So a sybil flood pollutes that listing in full, and containment does nothing whatsoever about it. §9's currency entry reaches the same place from the other end, recording that claim-flooding remains possible and that the right shape of a fix is a **read-layer lens** rather than friction on the generative act — but for a long time neither passage mentioned the other, so each one read as narrower than the pair actually is. Stated as one sentence: **containment for what you traverse to, nothing for what you look up.**
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
│   │   ├── notes.ts                # Client for the notes service — never touches the DHT
│   │   ├── notes-ui.ts             # The Notes tab, and the promotion form (the gate)
│   │   └── style.css
│   ├── public/
│   │   ├── manifest.webmanifest    # PWA manifest
│   │   ├── sw.js                   # Minimal service worker (installability)
│   │   └── icon.svg
│   └── README.md                   # This app's own build/run/verification account
├── notes/                          # THE SOFT LAYER — above the promotion gate
│   ├── package.json                # No runtime dependencies; node:http only
│   └── src/
│       ├── types.ts                # Spaces, members, invites, notes, promotions
│       ├── store.ts                # The rules — including the directory's refusal to rank
│       ├── server.ts               # HTTP transport; holds NO Holochain credentials
│       ├── assistant.ts            # The AI member's suggesters (Claude, or fixed rules)
│       ├── assistant-main.ts       # Runs one, joining a space by invite link
│       └── main.ts                 # Entry point; ephemeral by default
├── gateway/                        # THE LINKED DATA FACE — one-way, out only
│   ├── package.json
│   └── src/
│       ├── conductor.ts            # Read-only: an allowlist with no writer in it
│       ├── jsonld.ts               # The export, and what it deliberately never emits
│       ├── pages.ts                # The human half of the same documents
│       ├── server.ts               # Content negotiation; noindex by default
│       └── main.ts
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
4. `validate_delete`: **Rejected**, and since `protocol_version: 4` so is every `DeleteLink` — nothing written is ever removed, entry or link. Entries may still be *updated*: the no-deletion rule is not immutability, and §5.1 is explicit about the difference rather than letting the shorter word stand in.

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
- **`kitsune2-bootstrap-srv`** — needed by **both** `scripts/network.sh` and
  `scripts/sandbox.sh`. Holochain 0.7 removed `hc run-local-services`, and
  this binary is what replaced it: one process serving both the bootstrap
  service and an embedded iroh relay.

  *This bullet used to say the single-node sandbox did not need it, which was
  true until it stopped being.* `hc sandbox generate` writes a conductor
  config naming a **public** bootstrap service and an iroh canary relay, with
  a 60-second request timeout; a machine that cannot reach them turns every
  zome call into a 60-second stall, which is how it presented on CI. The
  sandbox now runs its own service on `:8887` and depends on nothing outside
  your machine — see `scripts/sandbox.sh`'s header for the evidence.

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

**Where it goes.** The `.webhapp` is the input to
[epistemic-resonance-desktop](https://github.com/StateofIntent/epistemic-resonance-desktop),
which packages it — via [Kangaroo](https://github.com/holochain/kangaroo-electron)
— into a standalone desktop app carrying its own Holochain conductor.
Copy the freshly built bundle into that repo's `pouch/` and follow its
README to cut a release. Installers for Windows, macOS and Linux are
published at
[releases/latest](https://github.com/StateofIntent/epistemic-resonance-desktop/releases/latest);
end users want those, not this file.

**Not the Holochain Launcher.** It is what the rest of this section
originally assumed, and it cannot install this bundle: its most recent
release is v0.400.0 from March 2025, bundling Holochain 0.4.1, and the app
manifest format changed at 0.6. It fails with a manifest parse error
rather than a version mismatch. The per-app packaging above is what
replaced that model.

**What changes when it is installed, and why that needed code.** A
Launcher-installed UI runs in a genuinely different environment from the
one every other instruction in this section produces, and the difference
is not cosmetic:

| | Developing against your own conductor | Installed as the desktop app |
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

### Where this is up to

CI now covers every layer that had a harness waiting for one — `zomes` (it
compiles and its units hold), `live-verify` (the soft layer above the promotion
gate), `conductor` (the protocol against a real DHT), `network` (an entry
crossing between peers), and `ui` (the screen held to the same invariants, in a
real browser).

What remains is blocked on different things, and the checkboxes below do not say
which — so this section does. **Two of these are not checkboxes at all**: they
are gaps recorded in prose, in §2.3 and in `SPEC.md` §11, and being written up
somewhere other than a to-do list is exactly how they stay invisible.

**Every piece of CODE blocked on nothing but effort is now done, and so is the
one item that *was* blocked on a recurrence** — a second item blocked on a
recurrence has since opened, the `real-gossip` forward leg recorded below, so
that clause describes what became true of `notes-ui` rather than a property of
this section. The qualifier is load-bearing, and
was missing here while six documentation gaps sat at the end of this section
blocked on nothing whatsoever. A section whose whole argument is that a gap
written up outside a to-do list stays invisible should not open by implying
those six do not exist. Protocol versioning shipped and its deadline
is spent; the CI binary download retries; four browser intermittencies were
traced to one defect and fixed — the fourth being the same defect's second half,
which only became visible because the first fix let `main` fail again in a way
that named it; the address-keyed ceilings hold for one machine however it
connects; a room can ask somebody to leave; the npm republish is prepared down to
a single command; and the `notes-ui` intermittency was closed without waiting for
its recurrence, by forcing the race its written-up hypothesis described.
**Exactly one open item needs a person rather than a decision**, and it is the
only one with outside impact:

> `scripts/publish-packages.sh --publish`, run by somebody with publish rights on
> the `@stateofintent` npm scope. Both published packages are broken against
> Holochain 0.7 today. Everything else about that republish is done and checked.

**Current as of 2026-10-10, restructured because the single table had grown to
fourteen rows with eight struck through and the live items were buried inside
the settled ones.** This section's own failure mode is a status line that was
true when written and went stale without anybody editing it — it did exactly
that for a day while [#134](../../pull/134) sat in CI — so the rows are written
to be checkable rather than trusted, and the split below is maintenance of that
rather than tidying.

**Five things are open. One needs a person; the rest need effort or a decision.**

| Open item | Blocked on |
|---|---|
| `scripts/publish-packages.sh --publish` | **a person.** Publish rights on the `@stateofintent` npm scope. Both published packages are broken against Holochain 0.7 today; everything else about that republish is done and checked. **The only item with outside impact, and unchanged across this whole session.** |
| Why nodeA's URL turns over at ~926s | **effort, and still open — the instrument is in place and the event has not recurred.** Instrumented in [#227](../../pull/227) `967a671` (`core_space.rs:703`, successful broadcast at INFO). A targeted run ([`38045749074`](../../actions/runs/38045749074)) crossed 12 for 12 with **zero** `No agents to gossip with`, so the blocking mode did not occur and there was nothing to compare. Needs the mode to happen, not more dispatches. |
| ~~Why one op waits out 27 others — the ~425s mode~~ | **SOLVED from logs on disk.** The claim's own op is dequeued, silently dropped, and not offered again for **~365s** (+361.8s and +368.0s in the two trials), then sent and stored in milliseconds. `CoreFetchConfig` has no retry timer and the unresponsive path *removes* the op, so only gossip can bring it back. See the entry below. |
| ~~Which gossip mechanism re-offers a dropped op after ~365s~~ | **ANSWERED, n=2.** First offer arrives on a received `NoDiff` (bookmark path, `respond.rs:187`) and is dropped; the one that works arrives on a received `Accept` (`respond/accept.rs:52`), each within 7ms of its dequeue. |
| Why nodeA omits the op from ~60 consecutive Accepts | **mechanism argued from code; the arithmetic is retracted.** `new_since` is a pagination cursor over the *serving* peer's store keyed on `stored_at` (`kitsune2_api` `op_store.rs:126`), not a possession claim, so comparing it to the claim's creation time was the wrong comparison. [#222](../../pull/222)'s ordering still holds structurally — `respond.rs:181` advances the cursor before `:187` fetches — but it is not proven here. |
| ~~nodeA's `stored_at` for the claim op~~ | **MEASURED: integrated ~4.7s after authoring, then never again.** Recovered from `changed / ops_ps` — the pass that took the claim logged at `13:50:44.308Z`, elapsed 2.8ms, so `when_integrated` ≈ `13:50:44.306Z`. Integration lag on the authoring node is **ruled out**. |
| Why an eligible op went undelivered for seven minutes | **needs Holochain patched — and the stopping rule says write the report instead.** The op sits at the only cursor nodeD advertised (`13:50:44.306176Z`) and `sync_queries.rs` compares `when_integrated >= ?`, **inclusive** — so it was eligible on every round. No explanation; four instruments is where this stops. |
| Write the upstream report on the structural finding | **effort, and it is the live lead.** `respond.rs:181` advances the cursor before `:187` fetches, and `core_fetch.rs:346` drops silently. Four timestamp arguments built on that have been withdrawn; the code reading has not moved. **That is the reportable finding.** |
| ~~What `retrieve_new_op_ids`'s `since` actually filters on~~ | **ANSWERED: `stored_at` on the serving peer, as a pagination cursor** (`kitsune2_api` `op_store.rs:126`). Not creation time, not a possession claim — which retracts this thread's timestamp arithmetic and dissolves the delivery contradiction along with it. |
| The middle dequeue in both slow traces | **open, small, and recorded rather than smoothed.** `08:08:21.872` and `10:57:03.404` have no received message within a second, where the other two couple within 7ms. Both were dropped, so neither changed the outcome; neither is explained. |
| Why one failed connect marks the peer and another does not | **effort, and narrower than it was.** Batch 8's `rt60000` trial 4 failed one initiation, logged zero `No agents to gossip with`, and recovered in 1.0s with 73 initiations — so that failure never marked the peer at all. What distinguishes a marking connect from a non-marking one is unestablished. |
| Shape B's trigger | **effort, and not much is warranted.** Resource starvation versus an iroh-level defect, still undistinguished. The mechanism is known; only the trigger is not. |
| Report burst exhaustion as an outcome, or widen past 600s | **a decision, deliberately deferred.** The evidence for the first option is one occurrence, and one occurrence is what this section has repeatedly been wrong to act on. |

**And one standing recommendation, which is the clearest thing eight batches
established: stop running batches.** Batches 1 through 8 produced sixty trials of
distribution and one mechanism, and that mechanism came from reading four
conductor logs rather than from the sixty. Every advance on 2026-10-10 came from
an instrument or a source reading; every batch after the fifth confirmed a shape
already visible. The next finding is in the logs the modules now emit.

**Settled on 2026-10-10, kept because a reader needs to know these were asked
and answered rather than never considered.**

| Was open | Outcome |
|---|---|
| Closing the `NoDiff` caveat | **Closed by batch 5** ([`38024547790`](../../actions/runs/38024547790)) — the `NoDiff` trial with the integration check active at 0.0s. [#222](../../pull/222) `43018b4`. |
| The `NoDiff` mechanism | **Falsified by the same trial.** All 35 `NoDiff` messages carried non-empty `new_ops`; identical snapshots are the expected state for a recent op, which rides the bookmark into a fetch queue. An expected condition had been taken for the defect. |
| Make the fetch queue visible | **Done**, [#223](../../pull/223) `6ea451e` — and its first run disproved the mechanism #222 had proposed. |
| Is the fetch drop the defect? | **No**, at n=12. 74% dropped and crossed in 24.1s; 78% dropped and never crossed. The fetcher drops in 12 of 12 at 43–78%; the publisher drops nothing. Positional as to which node, variable as to rate, predictive of nothing. [#224](../../pull/224) `1d3596a`, [#225](../../pull/225) `c5669e8`. |
| Do the ops never recover, or does the harness stop watching? | **Both.** Batch 7 at 600s crossed two at **424.6s** and **360.6s**; batch 8 at 1500s crossed one at **943.0s** and went 12 for 12. Non-crossings of that shape were truncated recoveries. [#226](../../pull/226) `9b6526f`. |
| What excludes nodeD's only peer | **The unresponsive entry, keyed by URL** (`core_space.rs:268`, `initiate.rs:269`) — not by expiry. Batch 8's block ended at **926.4s** when nodeA reappeared under a new URL, which is why it bore no relation to the 1200s `agent_info.expires_at` predicted from the code. [#227](../../pull/227) `967a671`. |
| The `iroh incoming connection failed` discriminator | **Falsified on its passing row.** A run logging `nodeB: 6 x` passed every check, so the signature marks a disrupted transport rather than a failed run. [#221](../../pull/221) `a708142`. |
| Does `roundTimeoutMs` separate anything? | **No**, across 36 trials. Batches 6 and 7 are exact mirrors; batch 8 is 6-for-6 on both arms. The arms are the experiment's own independent variable and they predict neither failures nor slow crossings. |

**#218 landed** as merge commit `3018178`, and it carried two things. The
four-batch census: 48 trials, 13 non-crossings (27%), and the `NoDiff` mode at
**3 in 48, about 6%** — with the caveat explicitly *not* closed, because batch 4
produced no `NoDiff` trial and twelve immediate integrations do not retroactively
measure a trial that ran before the instrument existed. And the **426.0s Phase 0
baseline** recorded below, whose value is not the figure but the census beside
it: `initiate too soon` at **zero on every node**, which is what stopped burst
exhaustion being the only available path into the 300–600s band.

**#127 through #135 all landed.** #127 is a diagnostic rather than a fix —
`real-gossip` reporting how many peers each conductor has heard of, so the next
missed gossip says whether the two nodes had even met; the occurrence that
prompted it is recorded further down this section. #129 closed the `notes-ui`
intermittency described immediately below, along with a second defect found
underneath it.

**One thing is open, and this section said "nothing is open" for a day while
[#134](../../pull/134) was sitting in CI.** That sentence was true when written
and stopped being true without anybody editing it, which is the failure this
whole section is an argument against — a status line is only worth reading if
going stale is treated as a defect in it. #134 has since landed: `SPEC.md`'s
function list is something CI notices now, and it found real drift on its first
run. What is open is one item, and it is not blocked on effort:

- **The `real-gossip` forward-leg intermittency is open again, with a narrower
  suspect than it has ever had.** Its third occurrence ruled out peer discovery
  — the standing hypothesis — using counts taken before the publish, and it is
  recorded in full further down this section. **Closed: cause found in the
  substrate, and the check is now two checks.** Publishing an op has no retry in
  `kitsune2` 0.5.0, so a missed first publish can only be repaired by a gossip
  round — and gossip re-initiates every 120 seconds plus jitter, which was the
  same figure as this harness's own window, so the repair could never beat the
  deadline. Convergence now gates at 180s; a slow direct publish is a warning
  carrying its measured time. **What remains open from that investigation is the
  second failure shape the batch turned up**, in which nothing crossed in either
  direction although both conductors reported knowing 2 peers — five runs inside
  a 12-second window, unexplained, and deliberately not pooled with the first.

**The flake was provoked rather than waited for: 30 dispatched runs, 7 failures
— and they are TWO different shapes that must not be pooled.** `network.yml` was
dispatched 30 times in three waves of ten, one throwaway ref per run because its
concurrency group is per-ref and same-ref dispatches cancel each other. Pooling
those 7 into "23%" would be the most misleading number this section could print.

**Shape A — the historical flake, and the probe's signature for it held twice.**
One failure in each of the first two waves, 2 of 30:

| Run | Fresh claim | The missed claim |
|---|---|---|
| `34671043317` | crossed in **2.0s** | turned up **12s after the fresh one**, ~134s after its own publish |
| `34671351347` | crossed in **2.0s** | never arrived, through 30 more seconds of probing |

In both, new publishes were crossing in two seconds while an op already two
minutes old sat undelivered, with peer counts at `2` and `2` before the publish.
For these two occurrences discovery is out, the transport is out, and "the path
was down and came back" is out — a path coming up would have delivered both
claims in the same poll, and in the first run the fresh claim beat the old one by
twelve seconds. **The suspect is the delivery and retry of an op that missed its
first attempt**, which is readable code rather than a wait. That is two
occurrences agreeing, not a proof: n is 2.

**Shape B is no longer unexplained, and the evidence had been in the dumped logs
the whole time.** Reading the conductors' own logs from all seven failures and
thirteen of the passes produced a clean discriminator:

| | `iroh incoming connection failed` |
|---|---|
| All 7 failing runs | **2 to 7 occurrences each** |
| 13 passing runs sampled | **zero** |

The message is `Accepting incoming connection failed … src: Some(timed out)`. A
QUIC session could not be **accepted** — the peers knew of each other from the
bootstrap server and could not reach each other. That is the direct evidence for
the caveat this section had only reasoned its way to: a peer count is bootstrap
knowledge, not a working session.

**And it does not separate shape A from shape B — it separates failures from
passes.** Both stranded-op runs carry it too, five times each. So the two shapes
are degrees of one thing rather than two defects: the transport fails to
establish sessions, and whether that strands a single op or stops everything is a
matter of how much of the window it covers. It also completes shape A's chain,
which until now ended at a hypothesis: an accept timeout is exactly what marks a
peer unresponsive or fails a `send_module`, and `core_publish.rs` then skips or
drops the op with no retry.

**That table's passing row is now falsified, by a run that passed.** Twelve
`network.yml` dispatches off `8742211` (runs
[`38023962491`](../../actions/runs/38023962491) through
[`38024007232`](../../actions/runs/38024007232)) **all twelve passed**, and one of
them — [`38024003109`](../../actions/runs/38024003109) — logged `nodeA: 1 x` and
`nodeB: 6 x "iroh incoming connection failed"` while passing every check in both
harnesses. Six occurrences is inside the 2-to-7 band the failing runs showed. So
the signature does **not** separate failures from passes: it marks a transport
that was disrupted, and whether that disruption costs the run depends on how much
of the window it covers — which is what the paragraph above says about the two
*shapes*, now true one level up as well.

**The honest limit on that correction.** The log-signature block only prints when
a crossing is slow, so this batch can count the signature in that one run and in
none of the other eleven. The counterexample stands on its own — a passing run
with six — but no replacement rate is measurable from here, and the original
table's numbers are left as written rather than edited, because they were a true
reading of the runs they described.

**The same run is shape A's third occurrence, and the first one that was
repaired.** Its probe signature held exactly as the previous two did — peer
counts `2` and `2` at publish and again at 60s, then `STRANDED OP: the fresh
claim crossed in 0.0s and the missed one is STILL absent`. The difference is the
ending: the missed claim **arrived after 176.8s**. The two earlier occurrences
turned up ~134s after their own publish and never arrived at all, so this is the
first time the repair has been watched completing. **It would have failed under
both retired windows** — 120s and 145s — and passed under 330s as a warning
carrying its time. That is a second vindication of the widening, from a run
nobody set up to test it.

**A single `initiate too soon` is background noise, which bounds what the
five-on-nodeB occurrence meant.** Four of these twelve passing runs carry exactly
one (`38023962491`, `38023994105`, `38023998911`, `38024007232`), all with fast
crossings. The count was the finding, not the presence — worth stating because a
reader grepping a green run's census will find the string and have no way to know
it is unremarkable.

**Twenty-four fresh measurements, and the middle of the range is populated.**

| | n | measured |
|---|---|---|
| `real-gossip` forward leg | 12 | 2.0 2.0 2.0 4.0 4.0 4.0 6.1 6.1 12.1 14.1 20.1 **176.8** |
| `partition-rejoin` Phase 0 baseline | 12 | 0.0 0.0 0.0 5.0 5.0 5.0 10.0 15.1 20.1 20.1 20.1 **50.1** |

Read against the 426.0s baseline recorded above, 50.1s and 176.8s matter more
than the eleven fast ones: the entry two above this says the pair 426.0s-then-5.0s
shows a network "either immediate or minutes-long with nothing in between", and
these two sit in between. **That sentence was about one pair and is defensible as
written, and it reads as a stronger claim than twenty-four measurements support**
— so it is qualified here rather than left to be quoted on its own. A long right
tail is the shape the evidence now has; two modes is not.

*(Provenance, because it explains why there are twelve `network.yml` runs and not
one: these were dispatched while aiming at a fifth `NoDiff` batch, which lives in
`peering-rate.yml` and not here. A twelve-trial `NoDiff` batch is one dispatch of
that workflow, with `trials: 6` across two arms — and the throwaway-ref-per-run
method belongs to this workflow's flake probe, because `network.yml` sets
`cancel-in-progress: true` on a per-ref group while `peering-rate.yml` does not.
The batch was wrong for its purpose and the runs are still measurements, so they
are recorded for what they are.)*

**Two more signatures change what the repair interval actually is.** The same
logs carry `PeerBehaviorError { ctx: "initiate too soon" }` and
`Unsolicited Accept message`. So a gossip round can time out at 15s, its late
Accept be discarded as unsolicited, and the **retry be refused** — and the gate
on that refusal is the **burst limiter**, and an earlier version of this section
said it was `min_initiate_interval_ms` — which was wrong, and wrong in the
direction that matters. That field is declared, defaulted to 300,000 and set by
test harnesses, and **nothing in kitsune2 or holochain reads it**; its own doc
comment says a burst mechanism replaces it, and it does.
`respond/initiate.rs` refuses on `burst.check_accept`, and `burst.rs` allows
`initiate_burst_factor * initiate_burst_window_count` = 3 x 5 = **15** accepted
initiations per peer inside a sliding window of
`initiate_interval_ms * initiate_burst_window_count` = **600 seconds**. Fifteen
per ten minutes, per peer — a rate limit, not a floor. A node whose rounds keep
failing burns its fifteen and is then refused until timestamps age out, so the
true ceiling is nearer **600s** than 300s. Evidence consistent with that: run
`34671351347` had not converged at 150s, and the shape B runs had not at ~210s.

**The decision was taken: `GOSSIP_REPAIR_WORST_CASE_MS` is now 300s and
`CONVERGE_WINDOW_MS` is 330s.** That covers the ordinary refused-retry case with
room for the interval, the jitter and a round, and it is **a chosen ceiling
rather than a derived maximum** — the constant's name overstates it slightly and
its comment says so. What it deliberately does not cover is an **exhausted burst
allowance**, because that would need a window past 600s, which at the equal
budgets this harness keeps is over twenty minutes in a failing run before
sections 6 to 9 start. That residue is a known gap, recorded here rather than
implied by a constant: a run that fails with `initiate too soon` in its logs and
no convergence may simply have run out of allowance, and the harness now prints
that signature so the reader can tell.

**The widened window was vindicated and its residue reached, by the same run,
within minutes of shipping it.** The very first CI run carrying the 330s window
([#143](../../pull/143), `34676896521`) failed, and it is worth more than a green
one would have been:

| Section | What happened |
|---|---|
| 3, the gate | **never converged**, through the full 330s |
| 3, the probe at 60s | `NO PATH YET` — neither the fresh claim nor the missed one |
| 3, the log scan | nodeA 1 x accept timeout, 1 x `database is locked`; **nodeB 4 x accept timeout and 5 x `initiate too soon`** |
| 8, the reverse leg | **passed, after 215.2s** |
| 9, paired control | passed — the network recovered later in the run |

**215.2 seconds is the measurement that justifies the ceiling**, and it is an
accident of timing that it exists at all: a reverse leg taking 215s would have
FAILED under the old 120s window and been inexplicable under the old 145s figure.
Raised to 300s the same afternoon, it passed and was reported as a warning. So
the decision to widen is no longer an argument from the substrate's defaults —
there is a crossing in the record that needed more than both of the previous
numbers and less than the new one.

**And the gap the ceiling deliberately leaves is not theoretical. It is what
failed this run.** Five `initiate too soon` refusals on nodeB is an exhausted
burst allowance — 15 initiations per peer per 600s — and with the retries refused
the op had no mechanism left inside 330s. Until this run, "an exhausted burst
allowance reaches toward 600s" was a reading of `burst.rs`; it is now a thing
that has happened, in the first failure after the change, which is a different
kind of fact and should not be left filed as a cautious aside.

**The next run, on an identical tree, crossed in 6.1 seconds** with the direct
publish landing and the probe silent. That pair — 330s of nothing, then 6.1s —
is this intermittency's whole character in two consecutive runs, and it is now
legible from the output alone rather than from a bare red tick.

**What this leaves open is a question rather than a defect, and it is the same
question one level deeper.** A convergence failure carrying `initiate too soon`
is the substrate's own rate limiter behaving exactly as designed — which is the
argument that already moved a slow direct publish from a failure to a warning. So
the honest options are to report burst exhaustion as an outcome rather than gate
on it, or to widen past 600s and accept failing runs over twenty minutes long.
**The second is not recommended**, and neither is being taken here: the evidence
for the first is one occurrence, and one occurrence is what this section has
twice been wrong to act on.

**Half of that question now has a measurement, and it came from this branch's own
CI run rather than from a dispatch batch.** In run
[`37719653059`](../../actions/runs/37719653059), `partition-rejoin`'s Phase 0
baseline — both nodes up, nothing partitioned, no probe interference — **crossed
in 426.0 seconds**. So the op arrives **late rather than never**, which is the
half of the open question above that had no datum attached to it. The crossing is
past `CONVERGE_WINDOW_MS`, so an identical crossing in `real-gossip` would have
been a red tick with nothing to read; it was recorded only because
`partition-rejoin` budgets 600s and polls all the way through.

**And it does not fit the burst-exhaustion story — the census for that run shows
`initiate too soon` at ZERO on every node.** That matters more than the figure
does. The residue the ceiling deliberately leaves was argued from `burst.rs`:
fifteen initiations per peer per 600s, exhausted, retries refused, nothing left
inside 330s. Here the rate limiter never engaged at all and the crossing still
took 426.0s. **So burst exhaustion is not the only path into the 300–600s band**,
and the band cannot be read as that one mechanism's signature.

What the census does carry for that run is a different signature in quantity:
`No agents with overlapping arcs available` **39 times on nodeA and 29 on
nodeB**, with nodeA's first `Initiated gossip with` landing **11.4s** after its
initiate task started and nodeB's **23.4s** after. Both nodes were running
rounds and finding no overlapping-arc peer to run them against. The accept-timeout
cluster that discriminated failures from passes across the thirty dispatched runs
is **not** what this looks like: nodeB logged one `iroh connect timed out`, one
`Unsolicited Accept message`, one `Peer behavior error` and three `database is
locked` — present, singular, nothing like 2-to-7 occurrences each.

**The harness said this itself, in the run output, and then declined to claim a
pass it had not earned.** It printed `THE 426.0s IS THE FINDING, not this cap`,
capped the partition dwell at 300s because a sound 5x dwell of 2130s does not fit
the job, and reported the divergence assertion as **INCONCLUSIVE** rather than as
a pass — nodeB showing zero in claimA's domain cannot distinguish "the partition
held" from "it has not arrived yet" when the dwell is shorter than the crossing
the same network had just taken. That is the right outcome and it is why the job
is red: the failing check is `the baseline is fast enough to measure divergence
inside the job budget`, not any claim about partitions.

**n is 1.** One occurrence is what this section has twice been wrong to act on,
so no window moves on it and the options above stay as they were. What changed is
narrower and worth the paragraphs: "arrives late" is a measurement now, and
`initiate too soon` is no longer load-bearing for it.

**Its companion measurement is 5.0s, one docs-only commit later.** Run
[`38021587179`](../../actions/runs/38021587179) — the same branch, the same
harness, a tree differing only in this section's prose — took **5.0s** on the
Phase 0 baseline where the previous run took 426.0s, passed the divergence
assertion it had had to report INCONCLUSIVE, and finished both harnesses with
ALL CHECKS PASSED in 5m49s against 16m52s. Convergence was 20.1s and 30.1s, the
post-heal crossing 5.0s.

**426.0s then 5.0s is the same pair this intermittency has already shown once**,
at 330s-then-6.1s two entries above, and recording the fast half matters as much
as the slow one: without it the 426.0s reads as a network that is slow, when what
the two runs together say is that the *same* network is either immediate or
minutes-long with nothing in between and no change to the tree. That is a
property of the substrate's round scheduling rather than of this harness, and it
is why a mean over these runs would describe nothing real.

**The diagnostic was the actual defect here.** For ten occurrences the workflow
dumped these logs and nothing read them — the red tick said "nodeB never
received it" while the answer sat forty lines down in output that looks like
noise. `real-gossip` now reads the conductors' logs itself on a failure and
reports which signatures appear, with what each one means. A failure with **none**
of them is reported as new rather than filed alongside the known ones, since
every measured failure so far had at least one.

**What remains genuinely open about shape B is only its trigger**, not its
mechanism: accept timeouts on a 2-vCPU runner under ten concurrent dispatched
jobs look like resource starvation, and the clustering fits that, but nothing
here distinguishes starvation from an iroh-level defect. The five passes
interleaved with the five failures in the same wave argue against a simple
"everything was slow at 04:00" story.

**Shape B — five runs in which NOTHING crossed, and it is not a rate.** Every
failure in the third wave, 5 of 10, each red on 10 checks rather than 1 or 7:
nothing reached nodeB, the reverse direction failed too, and section 9's paired
control failed. They published **within 12 seconds of each other** (04:00:12 to
04:00:24), and the five runs that PASSED in that same wave are interleaved with
them by start order — so this is neither a clean time window nor five
independent samples, and it is excluded from the rate above rather than added to
it. It is unexplained. Candidates, none confirmed: an artifact of dispatching 30
runs from one account inside 20 minutes, or a hosted-runner window. **What makes
it worth recording anyway is that all five reported `nodeA knows of 2 peer(s),
nodeB knows of 2` while carrying nothing in either direction for over two
minutes.** That is the sharpest evidence yet for the caveat stated above — the
count is bootstrap knowledge, not a working session — and it is a shape this
harness had never recorded before.

**So the rate is about 7% for the shape that has been failing all along** (2 in
30), consistent with "about once a day". And the method carries its own warning:
dispatched runs on a quiet account need not reproduce the contention profile of
the pull-request queue where this flake has historically appeared, and wave three
is a concrete reason to distrust any rate pooled out of such a batch.

**And then the cause was found by reading the substrate rather than by waiting
for another occurrence, and it is two ordinary things colliding.** The sources
are in the cargo registry for `kitsune2` 0.5.0 — the line Holochain 0.7.0 builds
against — and they answer the question the probe had narrowed to.

**First: publishing an op has no retry.** In
`kitsune2_core-0.5.0/src/factories/core_publish.rs`, `outgoing_publish_ops_task`
drops an op on the floor in two distinct ways. If the receiving peer's URL is
marked *unresponsive* in the peer meta store it **skips the publish entirely**
(`continue`), and if `send_module` returns an error it logs
`could not send publish ops` at warn level and carries on to the next item. There
is no retry queue and nothing rescheduled. **Once a direct publish misses, the
only thing that can ever deliver that op is a gossip round.** That is exactly
the shape the probe measured: the live path working for new ops while one
specific older op sat undelivered.

**Second: gossip initiates every two minutes.** From
`kitsune2_gossip-0.5.0/src/config.rs`:

| Parameter | Default |
|---|---|
| `initial_initiate_interval_ms` | 1,000 |
| `initiate_interval_ms` | **120,000** |
| `initiate_jitter_ms` | 10,000 |
| `min_initiate_interval_ms` | 300,000 — **declared and never read**; the burst limiter replaced it |
| `initiate_burst_factor` x `initiate_burst_window_count` | 3 x 5 = 15 initiations per peer per 600s |
| `round_timeout_ms` | 15,000 |

The fast one-second interval is **not** the steady state. `initiate.rs` uses it
only in the branch where a local agent's storage arc is still growing; once every
local agent is at its target arc — which is the case for the full-arc nodes this
harness runs — the loop sleeps `compute_delay(initiate_interval)`, which is
120 seconds **plus up to 10 seconds of jitter**, between initiation attempts.
Holochain 0.7.0 does not override these: nothing in `holochain_p2p`'s spawn
configuration or the conductor config sets them.

**So `real-gossip`'s window is numerically identical to the recovery interval it
is implicitly racing, and the jitter is added on top.** `GOSSIP_WINDOW_MS` is
`120_000`; `initiate_interval_ms` is `120_000`. Whenever the first publish
misses, **the only mechanism that can repair it is guaranteed to arrive after the
harness has already given up** — gossip at 120 to 130 seconds, the check
abandoning at exactly 120. That is not a hypothesis that needs another
occurrence; it is arithmetic over two published defaults, and both measured
failures fit it:

- `34671043317` — the claim arrived **~134s** after its publish, which is the
  120s interval plus jitter plus the round itself. Only the probe's extra 30
  seconds of watching saw it at all.
- `34671351347` — nothing by 150s, consistent with a round hitting the 15s
  timeout and its retry being refused by the peer's burst limiter.

**This reframes the rule this section has twice applied, and the reframing is the
part worth arguing about.** "A timeout raised to hide a stall makes it slower to
notice rather than absent" was right for `notes-ui` and for `transitive-gossip`,
and it is why nobody widened this window. But 120 seconds here is not a patience
figure somebody chose generously — it is **below the documented recovery time for
the exact condition under test**, so the check as written can fail on a network
that is behaving exactly as its substrate says it will. That is a
mis-specification rather than a stall being hidden.

**The decision was taken: the check is split in two.** It is recorded here with
the alternative it was chosen over, because the reasoning is the part that has to
survive:

- **Widen the window past `initiate_interval + jitter`** (≥140s, realistically
  150s). One line, and the check then means "it arrives, eventually". The cost is
  that a genuinely lost op is no longer distinguishable from a slow one, and the
  failing path gets slower — which is the reflex this section has twice refused.
- **Split it into two checks with different names and budgets** — one for the
  direct publish landing promptly, one for eventual convergence via gossip. More
  work, and it is the honest shape: "the publish landed" and "the DHT converges"
  are different promises, and conflating them is what produced a red tick nobody
  could read. The `STRANDED OP` and `STRANDED THEN REPAIRED` verdicts already
  separate the two cases at diagnosis time; this would separate them at assertion
  time.

**The second was chosen and is built.** `GOSSIP_WINDOW_MS` is gone, replaced by
two budgets whose values come from the substrate rather than from taste:

| Constant | Value | Why that number |
|---|---|---|
| `PROMPT_PUBLISH_MS` | 60s | healthy crossings are 2-4s; the slowest recorded are 10.1s, 14.1s and 16.1s on loaded runners. Nearly four times the worst of those, and still well under gossip's first opportunity, so an arrival inside it means the publish path worked rather than that gossip covered for it |
| `CONVERGE_WINDOW_MS` | 330s | must clear `GOSSIP_REPAIR_WORST_CASE_MS` with margin |
| `GOSSIP_REPAIR_WORST_CASE_MS` | 300s | a **chosen ceiling**: covers a refused retry with room for interval, jitter and a round. Does not cover an exhausted burst allowance, which reaches toward 600s |

**The figure behind `PROMPT_PUBLISH_MS` is a sequence, and it is drifting
upward.** It was sized against a slowest-ever direct publish of 10.1s. The run
that shipped the split then recorded **14.1s**, and the next day's
documentation-only run recorded **16.1s** — each a new record, neither raising a
warning, because each is a direct publish that needed no repair. The budget is
still comfortable: 60s is nearly four times 16.1s. But it was originally
described as "six times the worst observed", and that multiplier is now under
four, which is the kind of quietly stale justification this section treats as a
defect. **What would change the decision is a fourth record materially above
these** — 60s is comfortable against 16.1s and would not be against 40s. The
warning itself is the instrument: it prints the measured time whenever it fires,
so the drift is visible rather than needing to be remembered.

**Convergence is the only one that gates**, because "an entry written on one
conductor reaches another" is the invariant this harness exists for. A missed
prompt publish raises a `::warning::` carrying the measured time and does not
fail the run — an op that publish dropped and gossip repaired is the substrate
doing exactly what its defaults say, and a red tick for that is the
flaky-red-meaning-nothing this section has twice refused. The warning is applied
to the reverse leg and the paired control too, not only to section 3, so a
direction that quietly drifts from 2s to 90s shows up as something that happened.

**The inequality is now enforced rather than explained.**
`CONVERGE_WINDOW_MS < GOSSIP_REPAIR_WORST_CASE_MS` *is* the defect this harness
shipped with, so the run aborts at setup if a future edit restores it, naming the
interval it collides with. Putting the window back to `120_000` was injected and
produces exactly that abort, before anything is published.

**Two consequences are deliberate and both cost something.** The probe now fires
at the 60s boundary rather than at 120s, which sharpens it — a repair seen inside
the probe is too early to be a gossip round, so the fetch queue becomes the
candidate, and the message says so instead of attributing it to gossip. And a run
where the entry genuinely never arrives now spends 180s here and another 180s in
section 5, where it used to spend 120s and 120s. Section 5 keeps the **same**
budget on purpose: holding one index to a laxer standard than the other was the
#131 defect and is not being reintroduced to save three minutes on a path that
should be rare.

**The split was watched failing in all four of its shapes**, with the budgets
scaled to seconds: a 10-second blindness produced a passing run with a warning
and a full diagnosis where the identical run used to be seven reds; permanent
blindness still failed the gate; the restored 120s window aborted at setup; and
nodeC made to claim it had seen the entry *only while the probe ran* turned two
of section 6's controls red — a 30-second hole in which the control asserting
"nodeC never sees it" had not been looking, now closed because the probe samples
the isolated node on every poll.

**The first of those two occurrences also corrected the probe, which is the
second time in two days a diagnostic here has been caught asserting a cause its
own numbers contradicted.** It printed `LATE PATH` — "the path came up some time
after the publish and then carried both" — beside timestamps showing the twelve
second gap in the wrong direction. So "both arrived" is three shapes, separated
by the ORDER of the two arrivals, which was already being measured and thrown
away:

- **`WINDOW TOO SHORT`** — the missed claim was already there at the probe's
  first poll, so it crossed within about a second of the window closing.
- **`LATE PATH`** — it arrived no later than the fresh claim. Consistent with a
  path that was down and came up, carrying both; the fix would be in
  `scripts/network.sh`.
- **`STRANDED THEN REPAIRED`** — it arrived *after* the fresh claim. The live
  path was working the whole time and a second mechanism delivered the old op
  later. This is what the real occurrence was.

**The second occurrence corrected a different line, and this one was mine to
own.** Section 5's poll printed `by-agent=1` for two solid minutes next to a
failing check. That index is keyed on the **author**, and the probe publishes as
the same author, so the count included the probe's own claim — the probe's fresh
*domain* keeps it out of the by-domain sections, and the comment claiming it
"cannot contaminate sections 4 to 7" was too strong. The check was never wrong,
because it matches on content; the number printed beside it was. It now reads
`by-agent=N, none of them this run's claim`.

**So the next action is a reading of section 3's output, not section 5's.** The
probe prints one of five verdicts and they point at different files:
`STRANDED OP` and `STRANDED THEN REPAIRED` at op publication and retry;
`LATE PATH` and `WINDOW TOO SHORT` at node readiness and `scripts/network.sh`;
`NO PATH YET` at sections 8 and 9 for whether it recovers at all.

**So the next thing to look at is still not code that anybody can simply sit
down and write.** Everything left is waiting on a person, waiting on an
argument, waiting on a recurrence, or one of the documentation items at the end
of this section — and those last ones are blocked on nothing at all, which
makes them the only work here anybody can simply pick up.

**The `notes-ui` intermittency is closed. The hypothesis was right, and writing
it down before it could be proved is what closed it** — the reproduction attempt
that failed left behind two specific reasons it failed, and both of them were
what the successful one needed:

- **The server side was ruled out, and stayed ruled out.**
  `NotesStore.createNote` inserts the note and THEN bumps the revision
  (`store.ts`), and the service is single-threaded, so a waking long-poll cannot
  see the new revision without the note. A snapshot generated after the write
  always contains it.
- **The cause was the client's two unordered writers to the same state.** The
  submit path (`notes-ui.ts`, composer `onsubmit` → `createNote` → `loadSpace` →
  `notesBySpace.set`) and the parked long-poll (`applySnapshot` →
  `notesBySpace.set`) both replaced the note list wholesale, and neither
  compared which was read first. A snapshot generated *before* your note that
  lands *after* your own read puts the list back without it — your own note
  vanishing from the screen that wrote it, which is the reported shape.
- **The fix needed no new plumbing, as predicted.** Both responses already carry
  a revision — `GET /spaces/:id/notes` returns `{ notes, revision }` and the
  events snapshot returns `revision`, both from the same store-wide counter — so
  the rule is to apply state only when it is not known to be older than what is
  held. `revisionBySpace` and `acceptRevision` in `notes-ui.ts`, consulted by
  both writers. Two smaller consequences are deliberate and documented at the
  code: equal revisions are applied rather than dropped, because the same
  revision is the same store state; and `loadSpace`'s three concurrent reads are
  stamped with the notes revision, the oldest of the three that is knowable,
  because stamping HIGHER than the data's real age is the one error that would
  lose writes.
- **It is now a forced check rather than a hope**, in `notes-live.mjs` — the
  harness that owns liveness, because the second writer does not exist until the
  room is live. A poll is intercepted, its answer held until after a note is
  submitted, and the REPAIR poll held too so the assertion is not racing the
  next answer. Three witnesses guard it against passing vacuously. Removing the
  guard fails it 3 runs out of 3; restoring it passes 3 out of 3, where the
  defect used to surface about once a day and only deep inside a long batch.
- **Both lessons from the failed attempt were load-bearing.** A route must be
  installed on the CONTEXT and catch a poll that STARTS after it, because a
  parked poll runs for 25 seconds and is not intercepted retroactively — so the
  room is nudged once to retire the poll already in flight, and the check then
  waits for evidence it is holding one. And the disappearance repairs itself,
  since the next poll answers at a newer revision and puts the note back — which
  is why the repair poll is held at the route rather than sampled against.

**Making the client trust that revision exposed a second defect underneath, and
it was already there.** The store's revision was a field on the class and not
part of the persisted state, so a service restarted on its own state file came
back at zero while every client carried on holding the number it had. That is a
client asking `since=57` of a service at revision 3: the poll parks for its full
25 seconds and answers `changed: false`, over and over, while the room fills up.
**A room that goes quiet with nothing on screen saying so**, which is the
failure this layer is least able to notice. It did not need the new guard to
exist — the long-poll cursor alone was enough — but the guard would have
extended it to the repair path, because a reopened room reads at revision 3 too.

The revision is persisted now, optional in the state file so one written before
it loads and starts from zero exactly as today, and monotonic from then on.
`notes-layer.mjs` checks it by doing what a client does rather than by reading
the number back: a poll asked with the `since` it was still holding across the
restart, which must still wake. Removing the field again turns both red, and the
second red is the one that matters — "a state file survives a restart" stays
green throughout, because every note and every token does come back. What does
not is the ability to be told about the next one.

**What is deliberately NOT guarded is a state file restored from a backup**,
which rewinds the counter under clients holding a higher one. A client with a
stale `since` is broken there with or without the persisted field, the repair is
a reload either way, and inventing an epoch to detect it would put a number in
every reply for a case nobody here has met. `notes/README.md` records it.

The rest are decisions, and each is recorded with what it would cost to answer.

| Item | Blocked on | Where it is written up |
|---|---|---|
| Republish the npm packages | **Credentials only** — everything else is done; one command | `agent-sdk/README.md`, `mcp-server/README.md`, `scripts/publish-packages.sh` |
| Android and iOS builds | **Upstream, not us** — a 0.7-capable plugin exists, but it is cleanroom work awaiting darksoil's permission to use the name, not a licence to their code; iOS has no official support though two people have it working | §9 below, `INSTALL.md` |
| ~~Who may remove a member from a notes room~~ | **Decided and built** — a removal is a note in the room | `notes/README.md` |
| ~~The `notes-ui` intermittency~~ | **Done** — the written hypothesis was right; cause fixed and forced into a check | §9 above, `scripts/live-verify/notes-live.mjs` header |
| ~~The `real-gossip` discovery flake~~ | **Ruled out as discovery** — the counts answered on the third occurrence; see the row below | §9 below |
| ~~The `real-gossip` forward-leg intermittency~~ | **Done** — cause found in the substrate, and the check split into a gating convergence budget and a warned-about prompt-publish budget | §9 below, `scripts/live-verify/real-gossip.mjs` header |
| Whether an exhausted gossip burst allowance should gate | **One occurrence** — it is the substrate rate-limiting as designed, but the evidence is a single run and that is what this section has twice been wrong to act on | §9 below |
| Pre-registration (commit–reveal) | **A stated need** — nobody has asked | §9 item below |
| Surfacing the last coordinator functions | **A new argument** — not a queue position | §9 item below |
| ~~The `notes-layer` X-Forwarded-For intermittency~~ | **Done** — the recurrence came, and named a real defect underneath | §9 below, `notes/README.md` |
| ~~The `notes-live` `joinAs` intermittency~~ | **Done** — the diagnostic named it on its third occurrence; cause fixed | §9 below, `scripts/live-verify/notes-live.mjs` header |
| ~~The `hud-layer` typing intermittency~~ | **Done** — the draft fix was half of it; the caret was the other half | §9 below, `mobile-ui/README.md` |
| ~~Protocol versioning~~ | **Done** — declared, enforced, and live-verified | `SPEC.md` §11.1–§11.2, §9 below |
| Migration across a fork | **Decided, not built** — provenance is in-protocol, on the correlative-witness pattern `FederationRecord` already establishes; the entry type waits for the migration tooling so one fork carries both | `SPEC.md` §11.3 |
| **Sybil resistance** | **Nothing — it is an accepted ceiling**, not unfinished work | §2.3, `SPEC.md` §7 |
| ~~Retrying the binary download in CI~~ | **Done** — `scripts/ci/install-holochain.sh` | §9, this section |

**The one with real outside impact was the npm republish, and it happened on
2026-09-12.** `@stateofintent/agent-sdk@0.1.2` and
`@stateofintent/mcp-server@0.1.2` are on the registry and are `latest` on both.
**Verified from the registry rather than from a tarball:** installed by version
into an empty project outside this checkout — `npm ls` confirming
`resolved: https://registry.npmjs.org/@stateofintent/agent-sdk/-/agent-sdk-0.1.2.tgz`
— the SDK connects, authorizes signing, writes a claim a real conductor accepts,
and reads it back; the MCP server advertises its nine tools and answers a
`claims_in_domain` call that reaches that conductor and finds the claim. That is
the install a stranger gets, and it works.

**What was wrong with `0.1.1`, kept because the shape of it is the lesson.** The
published SDK predated the `@holochain/client` 0.21 upgrade, matched no cell,
authorized no signing credentials, and failed every zome call.
`scripts/check-packages.mjs` was green on it throughout, correctly — it proves a
package publishes, installs and imports, all of which a broken build does
perfectly, because listing tools touches no conductor. The defect lived past the
point where a package stops being a package and starts making zome calls.
**`0.1.1` is still on the registry** and still broken; what changed is that
nobody resolves it any more, since `latest` moved and `mcp-server` requires
`^0.1.2`.

**Three things were missing before that publish could be trusted, and only one
of them was credentials:**

- **A check that would have caught it.**
  `scripts/live-verify/published-packages.mjs` packs both packages, installs them
  into an empty project with a *fresh* dependency resolution, and writes a claim
  to a real conductor **from that install** — then reads it back, and calls an MCP
  tool that reaches the conductor rather than one that lists tools. It is
  deliberately neither `check-packages` (which proves the tarball imports) nor
  `agent-sdk`/`mcp-server` (which drive *this tree's* build through *this tree's*
  lockfile). What a stranger installs resolves its own dependency tree, and that
  difference is exactly where 0.1.1 lives. It runs in `conductor.yml`, and it has
  been watched failing: pointing the installed copy at a cell that does not exist
  leaves every packaging check green and turns the first conductor call red,
  which is the whole shape of the bug.
- **The bump.** Both packages are at `0.1.2` in this tree, and `mcp-server`'s
  dependency range was tightened from `^0.1.1` to `^0.1.2` — otherwise an
  installer could resolve the very SDK version being replaced.
- **A publish that cannot be done carelessly.** `scripts/publish-packages.sh`
  refuses on a dirty tree, on a version already on the registry, on an
  `mcp-server` range that does not name the SDK version being published, and
  without `npm whoami`. It runs the packaging checks and the live check, then
  publishes `agent-sdk` first and waits until the registry can actually serve it
  before publishing `mcp-server` — because otherwise the first person to install
  `mcp-server` resolves the broken SDK. It is a dry run unless given `--publish`.

**That command has now been run**, by somebody with publish rights on the
`@stateofintent` scope, and it found two things about itself in the process —
both fixed, both recorded in the script's own header. It could not answer the
one-time password npm demands of a 2FA account, and it discovered that only
after every check had passed rather than in preflight; and it treated an
already-published version as a hard failure, which made the one state its own
ordering exists to pass through safely — the SDK published and `mcp-server` not
— impossible to resume from without the hand-typed `npm publish` that shipped
`0.1.1` in the first place.

**What remains is the tags.** `agent-sdk-v0.1.2` and `mcp-server-v0.1.2` on the
commit the tarballs were built from, so a published package maps to something
checkoutable.

**A room can now ask somebody to leave, and that was the item most worth
closing** — not because it was the largest, but because three documents in this
repository described it as working. They said an assistant could be stopped by
"revoking the link or removing the member", and **neither half was true**: an
invite is consulted only at join time, so revoking one stops the *next* arrival
and does nothing about anyone already inside, and the `NotesStore.removeMember`
those documents named as existing-but-unexposed **did not exist at all**. The
store had `leave`, which is somebody removing themselves. A claim repeated in
three places for long enough reads as verified, which is how this one survived
being written down twice more.

**The decision was the blocker, not the code, and the shape chosen is that a
removal is a note in the room.** No owner and no admin: any member may ask any
member to leave, which is the same answer this layer already gives for
rewriting and deleting anybody's note. What keeps that from being a hole is not
a permission but the record — attributed, in the room, readable by everyone it
happened to. Four consequences are load-bearing, and each is checked:

- **The record is the one note nobody may rewrite or delete.** A real exception
  to this layer's "anyone may edit anything", and the entire argument for the
  shape: an account any of the people involved can quietly erase is not an
  account.
- **The token dies immediately**, because the member row is gone and
  `authenticate` looks tokens up in it. `assistant-main.ts` already stops on a
  401 rather than retrying, which is what makes stopping an assistant work the
  moment the route exists.
- **The door they came through closes**, because an invite checked only at join
  time is a way back in for the person holding it — which is everybody who was
  just removed. The cost is deliberate: anybody else holding that link is
  stopped too, and the room can mint another.
- **An AI member may not remove anybody.** The one asymmetry, and it is about
  kind rather than rank: an agent is a full member, meets the same ceilings,
  and may write, rewrite and delete any note — it does not decide who is in the
  room.

What is deliberately NOT built is a way to stop somebody holding a *different*
live invite from walking back in. This is the soft layer, the door is a link
anybody inside can mint, and a re-entry is visible to everyone in the room.
`notes/README.md` carries the full reasoning; `notes-layer.mjs` holds all of it,
and was watched failing against the service as it stood — exactly the nine
removal checks red, every other check in the file green.

**The other two are deliberately parked, and each records why.** Pre-registration
would be actively harmful built carelessly — the naive commit–reveal is gameable
by selective revelation, which launders HARKing rather than reducing it, so it
needs the denominator (a reveal deadline, the expired count readable beside the
revealed) before it needs code. Member removal is a question about how a room
governs itself, not a detail to settle inside a client fix. And the surfacing
count is not a queue: every function still without a screen has a reason that
survived inspection, so the next one needs an argument of its own.

**Protocol versioning is the one with a deadline, and it is cheap only while
nobody is running this.** Changing the integrity zome changes the DNA hash, so a
fixed conductor is a *different network* from a pre-fix one, and Holochain offers
no in-place migration across that boundary. There is no protocol-wide version
number, no feature negotiation, and no migration path defined — a genuinely
breaking change, such as a new required field on an existing entry type, is
currently just a commit with no compatibility story for DHT data written under
the old shape. With no deployed network that costs nothing. The moment anyone is
running this it costs everything, and the option to design it calmly is gone.
`SPEC.md` §11 names it as a real, open gap; the changelog attaches a worked
example. Related and smaller: nothing automatically keeps `SPEC.md` in sync with
`dna/` beyond the function-list check in `scripts/check-spec-drift.mjs`, so it
remains a manually maintained snapshot of the commit named at its top.

`SPEC.md` §11.1 now works out what the substrate actually permits, and the answer
narrows this decision sharply. **The usual versioning toolkit does not apply
here.** A Holochain network *is* its integrity zome — the DNA hash is computed
over the integrity manifest, and only peers sharing that hash share a DHT — so a
network always runs exactly one version, by construction. There is no version
skew between validating peers, which means a per-entry version discriminant
enables no coexistence, feature negotiation has nothing to negotiate, and
permissive "accept unknown fields" validation buys no compatibility while costing
the exhaustive validation §5 and §7 depend on. The corollary that surprises
people: **there is no additive, backward-compatible entry change on this
substrate.** Adding an `Option<T>` field forks the network exactly as violently
as deleting a required one, because both edit the integrity zome. The one class
that really is free is coordinator-only changes, which are hot-swappable via the
admin `update_coordinators` call and are not protocol changes at all.

So the open question is not "how do two versions interoperate" — they cannot. It
is **what happens at a fork**: how a network says which protocol it is running,
and what carries across when a new one replaces it. Three shapes, costed:

| Shape | What it is | Cost | What it buys |
|---|---|---|---|
| **A — Name the fork, build nothing** | Document that every integrity change is a new network, and that migration is out of scope | Nothing now | Honesty, and no speculative machinery. Every future change is a migration nobody has tooling for |
| **B — A version in `properties`, plus a migration contract** | Put a protocol version in the DNA's `properties` (currently `~`), so it is in the hash and readable from validation via `dna_info()`; define what an export/re-publish across a fork must preserve | One field now — but it **changes the DNA hash**, invalidating the shipped `.happ`/`.webhapp` and any existing sandbox state. Migration tooling later | A network that can state its own version, and a defined answer to "what carries across". The export half is largely built already — N4L export and the gateway's JSON-LD both walk the same data |
| **C — Per-entry version discriminant** | A `v: u8` on every entry, with validation accepting a listed set | A field on every entry type, forever | **On inspection, almost nothing** — see §11.1. It cannot produce in-network coexistence, because every peer runs the same integrity zome. Recorded so it is not re-proposed as the obvious answer |

**B was chosen and is now shipped.** C is kept in the table because it is what
most people reach for first, including this document's own earlier framing of
the gap — and §11.1 is why it buys nothing.

`dna/dna.yaml` sets `properties.protocol_version: 2`, the integrity zome carries
the same number as `PROTOCOL_VERSION`, and **validation refuses every entry and
every link when the two disagree**, naming both numbers. Absent properties fail
identically, so a DNA that declares no version accepts no protocol data at all —
which is what makes the declaration real rather than decorative. The gate is
scoped to protocol writes and deliberately not to the whole validation callback:
a blanket check also refuses capability grants, leaving a misdeclaring network
unable to answer the very call that would explain it. Refuse the protocol, not
the ability to be questioned. `get_protocol_version` reads back the declared
version, the implemented version, and the DNA hash, on an empty network.

That cost was paid rather than avoided: **setting `properties` changed the DNA
hash**, so the bundle shipped before this is a different network from the one
shipped now. That was the whole "free now, never again" argument, and it is now
spent — a rebuild today instead of an unmigratable fork later.

`scripts/live-verify/protocol-version.mjs` proves the three claims against a
running conductor: the declaration is readable, it is *inside* the identity (two
DNAs differing only in that number pack to different hashes — checked by packing
both, not by citing a doc comment), and a misdeclaring DNA is installed for real
and refuses writes. It has been watched failing in both directions; removing the
gate turns the third section red while the first two stay green, which is the
finding — a version can be readable and in the hash and still be decorative, and
only the third section can tell.

**What is NOT built is migration.** `SPEC.md` §11.3 states the contract instead,
because §11.1's constraints are knowable without the tooling and the hardest one
is already decided: §5.2 binds an entry's author to its action's author, so **no
agent can re-publish another's entries**, and no exemption may be added for
migration without handing everyone a way to forge authorship. Migration across a
fork is therefore necessarily partial and voluntary, entry hashes change, and
anything referencing an entry by hash must be re-resolved. The one open question
left is whether provenance across a fork belongs *in* the protocol as an entry
type or entirely outside it; neither has been chosen and nothing should be built
until one is.

**Sybil resistance is open and is expected to stay open, which is a different
statement from the rest of this table.** It is an accepted architectural ceiling,
not a queued task: global sybil resistance requires a global scarce resource, and
an agent-centric DHT deliberately does not have one. Raising the cost of identity
creation would close it and is refused on principle, because it charges people
for merely existing. What *is* shipped is real and worth not re-deriving: local
containment falls out of the topology (a membrane full of self-attested sybils
has no links from anyone outside it, so the attack creates entries nobody
traverses — for *traversals*; §2.3 records that an index read such as
`get_claims_by_domain` is not one, and is exactly where containment stops), `get_effective_conductance` fades un-reinforced sybil links toward
zero at read time, `AttestationPolicy` lets a *caller* state its own trust policy
without the protocol computing one, and `AttestationGrant` puts a 30-day tenure
bar and a rate limit on the ability to vouch — so a fresh sybil's vouching is
worthless even though the sybil is free to create. What remains untouched is the
cost of creating the identity itself, and that is the ceiling, stated honestly in
§2.3 rather than papered over.

**A second, different browser intermittency turned up while this section was
being written, and is recorded here before it is understood.** `notes-live`
failed twice in CI on the same afternoon — once on an unrelated branch, once on a
documentation-only change that cannot have caused it — both times in `joinAs`,
waiting for `[data-testid="notes-join-name"]` to become visible, after the live
arrival checks above it had already passed. It is **not** the `notes-ui`
intermittency below: that one is a note failing to render after a submit, this
one is a join form failing to appear at all. It also dies as a bare Playwright
`TimeoutError` naming a line number and no check — the exact shape this
directory's README records against `launcher-packaging`'s first regression
report, and the shape `notes-ui` was given a diagnostic to escape.

**`joinAs` has now been given that treatment, before the cause is known**, on
the reasoning that two occurrences in one day is enough to expect a third and a
third saying only "timeout at line 150" teaches nothing. A missing join form has
three unrelated causes that look identical from outside, and the third
occurrence will now name which one it was:

| What the screen shows | What it means |
|---|---|
| the service's refusal, quoted | a revoked, expired or unknown invite — **the screen is working** |
| stuck on "Reading the invite…" | the preview went out and **never came back** — a hung read, not a refusal |
| not the join screen at all | the invite link **never took the browser there**, and the error it *is* showing |

Alongside that it asks the service about the same invite directly, from inside
the failing browser and over the same origin the app itself uses, which splits
"the screen never rendered the form" from "this join was never going to happen".
All three were forced one at a time and watched producing three different
sentences; the harness header records them as injections A, B and C. The
**The intermittency is no longer open, and this is how it was closed.** On its
third occurrence the diagnostic reported that the screen was not on the join
screen at all and was showing *"That does not look like an invite link or
token"*, while the service previewed the same invite fine — which is the whole
answer, and which neither half gives alone. The invite box kept its value only in
its DOM node, and `loadDirectory` re-renders asynchronously whenever the notes
tab is opened, so a load landing between the paste and the click emptied it.
Fixed in `notes-ui.ts`, and the guard now forces that rebuild rather than waiting
to be unlucky, so the injection fails every run instead of once a day.

**Three browser intermittencies turned out to be one defect, and naming it is
worth more than the three fixes.** `render()` rebuilds the DOM wholesale in both
`mobile-ui/src/main.ts` and `mobile-ui/src/notes-ui.ts`, so an input's value
survives a rebuild only if something outside the DOM remembers it — and nothing
did. Any asynchronous load that re-renders when it lands could therefore discard
what somebody had typed, between the keystroke and the button, with no error
anywhere. It hit the browse box (the friction and taxonomy loads), the New Claim
form (publishing into the domain being browsed), and the notes invite box (the
directory load), and it is a defect a person meets as readily as a harness:
paste an invite quickly enough and the app refuses a perfectly good link.

Two things about how it was found are the transferable part:

- **The `joinAs` diagnostic was written before the cause was known, and is what
  found it.** On the third occurrence it reported that the screen was showing
  *"That does not look like an invite link or token"* while the service previewed
  the same invite fine. Neither half alone distinguishes a lost input from a bad
  invite; together they are the whole answer. A diagnostic cannot be added
  retroactively to a failure that has already happened, which is the argument for
  building it before hunting the cause.
- **Every fix converts the intermittency into a deterministic check** by FORCING
  the rebuild — switching tabs, refreshing the directory — rather than waiting to
  be unlucky. The injections now fail on every run where the defect used to
  surface about once a day.

**That fix was half the defect, and `main` went red again within the hour saying
so.** `hud-layer` failed on a documentation-only merge with the draft fix already
in it, and this time the diagnostic written in the same commit did its job: it
reported an *empty domain box* rather than a bare timeout, which rules out the
read and names the screen. Persisting a draft keeps what has already been typed
when the screen rebuilds. **It does not keep the caret.** `render()` destroys the
focused input, focus falls back to `<body>`, and every keystroke after that
lands nowhere at all — no error, no event, and the box still showing the text
typed before the rebuild, so the screen looks fine and simply stops accepting
letters.

**It was reproduced outside this repository, which is what turned a third
occurrence into an answer.** A minimal page carrying only this app's shape — a
wholesale rebuild, a value persisted on `oninput` — loses a Playwright `fill()`
in **35 runs out of 300** when the rebuild lands in the few milliseconds the
fill spends between focusing the box and inserting the text: no `input` event
fires anywhere and the value is never written, because text goes to whatever
holds focus and by then that is the body. The same page with the fix below loses
**0 of 300**. A person types one keystroke at a time and loses the same letters,
so this is a defect somebody meets, not a harness artefact — the difference is
that a harness types fast enough to lose the whole domain in one go.

Three changes, and the second and third only became visible once the first was
made:

- **`render()` captures the caret and puts it back**, in `mobile-ui/src/main.ts`.
  Capture and restore happen inside the one synchronous rebuild, so there is no
  window in which a keystroke arrives and finds nothing focused. Focus is
  restored only when it was in a field — a render caused by pressing a button
  leaves the button focused, and dragging the caret back into a box somebody has
  just left would be its own defect.
- **`loadClaims` no longer re-seeds the box when the read was started from it.**
  With the caret kept, the next thing a person loses is the letters typed while
  the read is in flight: the load lands a round trip later and overwrote the
  draft with the domain it had been asked for. A read started anywhere else —
  publishing into the domain being browsed, following a domain from a card —
  still names its domain in the box, which was the affordance that assignment
  existed for.
- **The notes layer's `rerenderLive` collapses into it.** That function was this
  same capture-and-restore, written when a stranger's note arriving mid-sentence
  was the only way a screen moved by itself. It was never notes-specific: the
  identical rebuild takes the caret out of the Browse tab's domain box, so the
  behaviour now lives in `render()` where it covers every screen, and one
  mechanism does the job two were doing.

**The check is forced rather than waited for, like the three before it.**
`hud-layer` now types a domain, presses Enter, and keeps typing while the read is
in flight — the exact sequence a practitioner performs — then asserts that every
later keystroke reached the box and that the caret is still in it. It carries a
witness against passing vacuously: the live input is marked before the read, and
because a rebuild cannot preserve that mark, a run where the read landed before
the typing began reports itself as proving nothing instead of going green.

**Both halves of that were watched in CI rather than argued for.** Against the
screen with only the draft fix, the section goes red twice — the box holding
`HudLayer1789050644890`, the domain and not one of the eleven characters typed
after it, and the caret gone from the box entirely — while the witness check
stays green and every other check in the file passes. Against the fixed screen
all three pass. The first version of the check went red on the FIXED screen too,
quoting `HudLayer17890Interrupted50340358`: every keystroke had arrived,
contiguously, at character 13, because a click leaves the caret where it lands
and a 390px box shows the middle of a 21-character domain. That was the check
being wrong and the fix being right, and it is recorded in
`scripts/live-verify/hud-layer.mjs`'s negative-evidence block because a check
that asserts where text lands has to say where the caret was first.

**Every field in the app was then audited against the same rule**, since a fix
that depends on a box naming itself is only as good as the naming. Exactly one
failed: the New Claim form's Tags box, which identifies itself through the
`<label>` around it and nothing else. It is named now, and `focusKey` falls back
to the wrapping label, so the next field added without remembering any of this
keeps its caret regardless.

**`real-gossip` failed on `main`'s pull request queue, and the shape of the
failure is worth more than the failure.** It went red on a change that touched
only the notes layer: nodeB did not receive nodeA's claim inside 120 seconds.
Then, seconds later, **the reverse direction arrived in about two** — the same
two conductors, the same DHT, the same run — and the isolated control node
correctly never saw anything at all. So the network was working and the DNA
hashes were right; whatever was missing happened *before* gossip.

That is the "instant-or-never" bimodality this section already records for
`transitive-gossip`, and the reverse leg passing is the sharpest evidence yet
for the standing hypothesis: **the suspect is peer DISCOVERY, not gossip.**
*(On 25 runs the bimodality is in a different variable than this paragraph
assumes: the acquire is not bimodal — 10.1s, 135.4s and a passing 140.4s all
occurred — while nodeD's JOIN is, cleanly, at 5s or under versus 30s or never.
**The discovery hypothesis here survives and is sharpened by that**: a join that
either completes promptly or does not complete is what a discovery step failing
looks like, and it predicted all three failures. See §9's entry on the 25 runs.)* By
the time the second leg ran, the two nodes had found each other. `real-gossip`
connects and publishes immediately, so nothing in it has ever distinguished
"gossip is slow" from "these two had not met yet".

**The next occurrence came almost immediately, and the diagnostic paid for
itself by ruling out the thing it was built to catch.** `real-gossip` went red
again — on a documentation-only pull request, which again cannot have caused it
— and the peer counts it now prints said `nodeA knows of 2 peer(s), nodeB knows
of 2` at publish time. The two conductors had met. The claim then arrived at
nodeB in 6.1 seconds, and every content check on it passed. So discovery was
not the suspect this time, and neither was gossip; without the counts, this
failure would have been filed as another instance of the flake above and the
real defect would have gone on hiding behind that story.

**The defect was in the harness, and it was an assumption stated in the
harness's own header.** Section 5 exists to show that a SECOND, independent
index finds the entry — `get_claims_by_agent` as well as `get_claims_by_domain`
— so that the result is not a quirk of one index. It asked that second index
exactly once, with no window at all, immediately after section 3's poll
returned. On this run that gave the by-agent link about thirteen milliseconds
to arrive.

**The word doing the damage is "independent".** The two are link queries on
DIFFERENT base hashes, so their links gossip to different neighbourhoods and
land separately — which is precisely why section 5 is worth having, and
precisely why it may not assume that the first index arriving means the second
has. They usually land within milliseconds of each other, which is why a
development machine always wins and a loaded runner is where you first lose.
This is the same shape as the `notes-ui` race closed above: a check that is
correct about what it wants to prove and wrong about when the thing it wants is
guaranteed to be there.

**The second index now gets its own bounded wait, on the same budget as the
first**, and prints its arrival time. That is deliberately not "a timeout was
raised": holding one index to 120 seconds and the other to zero was the defect,
so the fix is that neither is held to a laxer standard than the other, and the
number is printed so an index that starts taking sixty seconds shows up as a
figure that moved rather than as a check that still passes. A by-agent link
that never arrives inside the window still fails, and a gap of more than five
seconds between the two raises a warning on the job, because the separation
being real and widening is the thing worth knowing if this ever goes red again.

**It has not been reproduced on a development machine, and is not expected to
be** — that is what the failure says about itself. Three conductors on two
vCPUs is where the two links separate; one machine with the toolchain installed
is where they do not. The claim being made is therefore narrow: the assumption
the old check rested on was false, the log shows it being false, and the new
check no longer rests on it.

**No timeout was raised and no precondition was invented, deliberately.** The
harness now reports how many peers each conductor has heard of, before the
publish and again after a miss — so the next occurrence says which of the two
it was, and the failure carries its own diagnosis. Both counts above one means
they had met and gossip still missed; a count of one on either means that node
was alone on the DHT when it mattered. That is the same rule this changelog
applied to `notes-ui` and to `joinAs`: make it explain itself before hunting the
cause, because a diagnostic cannot be added retroactively to a failure that has
already happened. When the answer is known the fix belongs in
`scripts/network.sh`, which starts the nodes, rather than in the harness that
measures them.

**The next occurrence came, the counts answered, and the answer was no. Peer
discovery is ruled out for it** — which is the first time this intermittency has
had a suspect eliminated rather than added. `real-gossip` went red again on a
pull request that touches a CI script and spec prose and nothing a conductor
runs ([#134](../../pull/134), run `34623781857`, 2026-09-11), and the numbers it
now prints say this:

| Moment | What the run recorded |
|---|---|
| Before the publish | `nodeA knows of 2 peer(s), nodeB knows of 2` |
| After the 120s window closed | the same, `2` and `2` |
| Section 3 | nodeB never saw the claim, for the whole 120s |
| Section 5 | the by-agent index never saw it either, for another 120s |
| Section 8, four minutes later | nodeB publishes, nodeA has it in **0.0s** |
| Section 9's paired control, seconds after that | nodeA publishes, nodeB has it in **2s** |
| nodeC throughout | saw nothing, and answered when asked — controls green |

**So the two conductors had met before the claim was written, and the path that
failed to carry it was carrying claims minutes later.** Seven checks failed, and
a re-run against an identical tree went green. Discovery was the standing
hypothesis and it does not survive this: the counts were taken *before* the
publish precisely so they could not be explained away afterwards. Nor is the
transport broken, because `nodeA → nodeB` worked in 2 seconds later in the same
process. What is left is one op that went undelivered and was not retried, while
everything published after it crossed in seconds.

**What the peer count does not say is now the load-bearing caveat.** It is the
number of agent infos the conductor holds, which is knowledge obtained from the
bootstrap server — not evidence of a live QUIC session, and not evidence that a
gossip round with that peer has ever completed. "They had met" is the strongest
reading it supports. A first publish issued before the first successful gossip
round is consistent with every number above, and that is the narrower suspect
this occurrence leaves behind: not *discovery*, but the gap between knowing of a
peer and having a working session with it.

**The same run exposed a diagnostic that stated the wrong cause, which is worse
than one that says nothing.** Section 5 printed *"the by-domain index had it
after never, so the entry crossed and only this index is missing"* — a sentence
that contradicts itself, on a run where the entry had not crossed at all. It is
read by somebody who has just been handed a red tick and wants the answer, and
it was telling them to look at an index when section 3 had already failed. It
now distinguishes three cases: the entry crossed and one index lagged; the entry
crossed *late*, after the window, which the harness can now watch happen; and
nothing crossed, in which case it says so and points back at section 3.

**And the next occurrence will say which of three stories it is, rather than
leaving it to be worked out by hand a fourth time.** On a section 3 miss the
harness now publishes one more claim — same author, same receiver, its own fresh
domain so it cannot contaminate the later sections — and watches both for 30
seconds:

- **`STRANDED OP`** — the fresh claim crosses, the missed one stays missing. The
  hypothesis above, confirmed: one op lost, network fine. **Seen for real** in
  run `34671351347`.
- **`STRANDED THEN REPAIRED`** — the fresh claim crosses and the missed one
  follows it some seconds later. The live path was working throughout, so a
  second mechanism delivered the old op afterwards. **Seen for real** in run
  `34671043317`, where the gap was twelve seconds; this shape is the reason the
  next two entries exist, because the first version of this list called it
  `LATE PATH` and said the path had "come up".
- **`WINDOW TOO SHORT`** — the missed claim was already there at the probe's
  first poll. Nothing stranded, nothing repaired; section 3 gave up about a
  second early, and the finding is that a crossing took just over the window.
- **`LATE PATH`** — the missed claim turns up no later than the fresh one, so
  they arrived together. Consistent with a path that was down and came up, and
  the fix would be a readiness signal rather than anything about lost ops.
- **`NO PATH YET`** — neither. Nothing is crossing at that moment, and sections
  8 and 9 say whether it recovers.

It is **not a check and cannot turn this job green**, the same rule the peer
counts follow: a job that is intermittently red must not gain a second way to be
red while the evidence for the first is still being gathered. It is not free of
consequence further down, though, and the code says so rather than claiming
purity — it spends 30 seconds before sections 4 and 5 read anything, so an entry
that crosses *during* the probe is one they will now see, turning five reds in
section 4 into five greens. That is the truth improving, not a failure masked:
section 3's red stands either way, and a crossing this harness watched happen
should not be reported as an absence. Section 5 is told about it explicitly for
exactly that reason.

**Five injections, because a diagnostic only ever runs on a red run — a green CI
history says nothing about whether its words are true.** Each was run against
the real network of three conductors, and each produced one of the messages
above: a 100ms gossip window (`LATE PATH`, and section 4 passing on the entry
that arrived during the probe); the same with the second index stubbed out
(section 5's new "crossed late" message, which is the CI run reproduced); nodeB
stubbed blind to both indexes (`NO PATH YET`, and section 5 correctly saying the
entry never crossed — the wrong-cause message gone from the very shape that
produced it); nodeB seeing the probe's domain but never the missed one
(`STRANDED OP`); and nodeB throwing `Websocket closed with code 1006` the moment
the probe asks, which reports and carries on instead of replacing section 3's
diagnosis with a stack trace about the probe. Restored and re-run clean
afterwards: green, with the probe silent. The harness header records all five.

**A fourth intermittency is open, has been seen exactly once, and is recorded
here before it is understood.** `notes-layer`'s check that *"X-Forwarded-For is
ignored unless an operator says something is in front — one header must not reset
a ceiling"* failed once on `main`, and passed on re-run and three times in a row
locally. It matters more than its one occurrence suggests, because of what it
guards: a rate limit that any caller could otherwise reset by sending one header,
which is the failure mode `notes/src/limits.ts` calls the worst kind — a ceiling
that reads as a defence in review and is not one. **A ceiling that fails open
occasionally is worse than one that fails visibly**, so this should not be
re-run away.

The untested hypothesis, written down so the next person does not start from
nothing: the block immediately above it kills a server with `SIGTERM` while a
poll is parked, and the next block starts a new server on the same port with
different environment. If the first request lands before the new server is really
ready, no budget is consumed and the second request returns 200 instead of the
expected 429 — which is exactly the observed shape, and would be load-sensitive,
fitting a CI runner under concurrent load and not a development machine. Unlike
the browser intermittencies this one already reports as a named check rather than
a bare timeout, so there is something to work with on the next occurrence.

**The recurrence came, the hypothesis was wrong in its mechanism and right in
its shape, and underneath it was a real defect.** The second occurrence was on a
pull request that touched nothing but the mobile UI, which is what makes the
next part worth stating: *no budget is consumed* was the correct reading, but
not because a server was unready. **A ceiling keyed on `socket.remoteAddress`
verbatim is keyed on the address FAMILY as much as on the caller.** The same
machine is `::1` over IPv6 and `127.0.0.1` over IPv4 — two keys, two budgets,
one caller — and an IPv4 client on a dual-stack listener arrives as
`::ffff:1.2.3.4`, so a caller even changes key when the *listener* changes. This
harness reached `http://localhost`, which resolves to both, and Node's fetch
picks a family per connection. The check asks a 1-per-hour ceiling to refuse the
**second** create, so a single call landing on the other family made it the first
call again and the refusal never came.

**Proved by hand rather than argued for**: with the ceiling at 1/hour, two
creates over `127.0.0.1` give `200` then `429`, and a third over `[::1]` gives
`200`. After `normaliseAddress`, that third create is `429`.

It is the smaller cousin of the failure the X-Forwarded-For rule exists to
prevent — a ceiling that reads as a defence in review and is opened by a caller
who does nothing cleverer than connect the other way — which is why not
re-running it away was worth the two red ticks it cost. **What is fixed is one
machine being one key; what is not is a caller with a whole IPv6 `/64`**, and
`notes/README.md` records why folding a prefix is a decision about what an
address means here rather than a line of code: a `/64` is one household on some
networks and one customer of a provider on others.

**The `notes-ui` intermittency was caused, and the stale-snapshot race written
up here as "plausible and unproven" is what it was.** The diagnostic is what got
it there: on a miss the harness says whether the SERVICE holds the note, which
splits "the screen did not show it" from "the write never landed", and both
halves of that were watched failing. That split ruled out a refused write, which
is the whole reason the remaining hypothesis could be narrowed to the client and
written down in a form specific enough to act on.

**What closed it was forcing the race rather than waiting for it**, and the load
sensitivity recorded here is exactly why waiting was never going to work — green
8/8 run alone, failing only deep inside a long sequential batch. The check now
lives in `notes-live.mjs`, because holding one answer back while another lands is
something only the harness that owns the long-poll can do. `notes-ui.mjs` keeps
its diagnostic unchanged: it is what would name the process the next unexplained
miss lives in.

**One item here was blocked on nothing at all, and is now done** — see
`scripts/ci/install-holochain.sh`. Every conductor-bound workflow —
`conductor.yml`, `ui.yml` and `network.yml` — began by downloading `hc` and
`holochain` from the `holochain-0.7.0` release with `gh release download`, in
three copies of the same four lines, with no retry. It failed **three separate
ways in a single afternoon**, none of them anything this repository controls:

| Times | Failure | Asset |
|---|---|---|
| 4 | `HTTP 500` from `api.github.com` | `hc-x86_64-unknown-linux-gnu` |
| 1 | `connection reset by peer` from `release-assets.githubusercontent.com` | `holochain-x86_64-unknown-linux-gnu` (54 MB) |

Every one of them passed on re-run against an identical tree, and the same asset
downloaded cleanly from a development machine three times in a row while CI was
failing on it. It is the **first real step** in those jobs, so when it flakes it
takes a whole job with it and produces a red tick that means nothing — which is
the specific thing this repository has twice decided is worth more than a green
one it cannot read.

The three copies are now one script, and the retry in it is deliberately not
just a retry, for the reason this repository already applies to timeouts: one
that hides a *real* outage is the same mistake as a timeout raised to hide a
stall. So three properties carry more weight than the retrying does.

- **It asserts on the binary, not on the exit code.** An attempt succeeds when
  the downloaded file *runs and reports the pinned version*, not when `gh`
  returns 0. A truncated 54 MB asset, an HTML error page written to the output
  path, and a redirect that quietly served a neighbouring release all exit 0
  somewhere and all fail here. This is also what finally makes the version pin
  real rather than decorative.
- **It does not retry a permanent failure.** A missing release, a renamed asset
  or a wrong-but-working version is a real break in this repository's
  assumptions; retrying it four times converts a clear error into a slow,
  confusing one. Those fail on the first attempt.
- **It says how many attempts it made.** A retry that succeeds silently turns a
  degrading dependency into an invisible one. Any download needing more than one
  attempt raises a `::warning::` on the job, naming what the previous attempt
  failed with, so a slow success still reads as something that happened.

The bound is four attempts with a 5s/15s/30s backoff — against jobs that run for
six to twenty-six minutes, so a genuine outage still fails in under a minute
rather than parking a runner. Each path is exercisable locally by stubbing `gh`
on `PATH`; the script takes `DEST`, `INSTALL_ATTEMPTS`, `HOLOCHAIN_TAG` and
`HOLOCHAIN_VERSION` from the environment for exactly that.

#### Smaller items, all of them documentation

None of these is code. They are here because the argument for this section is
that a gap written up somewhere other than a to-do list stays invisible, and
each of these is currently exactly that.

- ~~**§2.3 should say *containment*, not "local sybil resistance".**~~ **Done.**
  §2.3 now says containment, and says why the weaker word is the true one: the
  entries are created successfully and are valid, and what protects the membrane
  is that nobody traverses into the ring — unreachable rather than rejected.
- ~~**§2.3 should be linked to the traversal-versus-index asymmetry.**~~
  **Done, and in four places rather than one**, because the claim was stated at
  four different widths. §2.3 now carries the limit in full ("containment for
  what you traverse to, nothing for what you look up"); §9's currency entry,
  which had been the only passage to say it, now points back at §2.3 for the
  other half; this section's own sybil-resistance summary above no longer reads
  broader than the long form it summarises; and `SPEC.md` §6's "what this is
  not" names containment and its limit instead of sending the reader off to an
  unnamed "local-topology mitigation".
- ~~**A stale "not built yet" note in §9.**~~ **Done, and it was not alone.**
  The entry named the browser client and promotion flow in `mobile-ui/`, the
  in-space AI collaborator, and the Linked Data face as unbuilt; all three had
  shipped, each with its own entry and harness. Fixing it turned up a second
  passage of the same kind in the same section — the changelog's account of the
  `notes-ui` intermittency, which still said the stale-snapshot hypothesis had
  failed its own test and that no fix was being made. Both are corrected in
  place rather than deleted: what they said was true when written, and a
  changelog that silently edits its own past is worse than one that is out of
  date.
- ~~**Nothing keeps `SPEC.md` in sync with `dna/`.**~~ **Partly done, and the
  part that is not done is now stated rather than implied.**
  `scripts/check-spec-drift.mjs` compares the coordinator zome's
  `#[hdk_extern]` functions against §10's tables and fails in both directions;
  it runs first in the no-conductor workflow, because it answers in
  milliseconds and needs nothing built. It found real drift on its first run —
  `attempt_unaccountable_membrane` and `attempt_false_domain_index` were
  callable and absent from §10 — which is now fixed in `SPEC.md` §10.15 rather
  than allowlisted, so the check went green on a correction instead of on an
  exception. **What remains unchecked is most of the document**: §5 and §7 are
  MUST and SHOULD rules about validation, and nothing compares those to
  `validate_*`. That boundary is written into `SPEC.md` §11 and into the
  script's own header, because a name-level check cited as "the spec is
  verified" would be the same overclaim §2.3 was just corrected for.

  **It now also measures the surface count, and gates on it** — the fix for a
  defect this document has paid for three times. The ratio of coordinator
  functions the UI actually calls was hand-derived every time, and went stale
  every time: reported as "12 of 56" for several increments because the metric
  only matched calls whose name sat on the same line as `callZome` and several
  wrap; then left at "37 of 58" in one paragraph while the heading above it had
  drifted back into being correct at "38 of 60"; and most recently a stale
  sentence calling a capability unsurfaced a month after it shipped, which sent a
  session off to build a screen that already existed before anybody caught it.
  Since the check already holds the extern set, counting `callZome` call sites
  under `mobile-ui/src` against it costs nothing and closes the loop: **the
  number in this item's heading is compared against the measured one on every
  push, and a mismatch fails the build.**

  **Two further checks fell out of having both sets, and the second is the one
  worth having.** A `callZome` literal naming something that is not an extern is
  a call to a function that does not exist — a runtime failure on that path, and
  a claim this document used to make by hand ("no call site names a function
  that does not exist"). And if the gated sentence is reworded away, the check
  fails with `SETUP FAILED` rather than passing quietly, because a check that
  goes silent when its subject disappears is precisely how this metric went
  unmeasured for so long. All three failures were watched happening before the
  check was trusted; the injections and what each one proved are recorded in the
  script's own header. **What it still does not do is tell a screen from a token
  call** — `callZome` reach is not evidence a function is well surfaced, and this
  item records a function that had a call site and was still half-surfaced,
  read-only where the write was what mattered. The metric is a floor.

  **The same defect was then found in a third place, and all seven instances of
  it were wrong.** This document cites harnesses by size — "`taxonomy-ui.mjs`,
  seventeen checks" — and that figure does real work: it is how a reader judges
  what a green tick covers without opening the file. Every one was stated by
  hand and none was gated. Measured against real runs on a live conductor,
  **all seven were wrong**: `domain-index` said 14 and ran 22, `write-symmetry`
  12 and ran 11, `taxonomy-ui` 17 and ran 16, `trust-lenses` 28 and ran 27,
  `expertise-ui` 14 and ran 13, `mode-and-constitution` 16 and ran 15,
  `worldline-ui` 17 and ran 18. Every harness **passed** — the defect was
  entirely in the prose, five overstating by one, one understating by one, and
  one short by eight because the harness grew and the sentence did not. Seven
  hand-stated numbers drifted seven ways with nothing watching, which is the
  same story as the surface ratio two paragraphs up, and the same remedy:
  `scripts/check-harness-counts.mjs` now gates them, beside `check-spec-drift`
  in the no-conductor workflow.

  **And the gate was nearly shipped resting on a premise its own data refuted**,
  which is worth recording because it is the failure this repository keeps
  paying for. It counts `check(...)` call sites, which equals the number of
  checks only if none sits in a loop — an assumption, so it was measured across
  all eight cited harnesses. Seven held. **`domain-index` did not:** twelve call
  sites, twenty-two checks, because one site is reused per poisoning attempt
  through a helper and an if/else pair means only one of two fires. It is
  therefore carved out by name, with that reason printed on every run rather
  than skipped silently, and its figure comes from a run. `layout-fits` is the
  same shape from the other side — seven call sites, thirty-nine checks, looping
  over tabs and widths — and is deliberately never cited with a count at all.
  A harness that later moves a check into a loop makes this gate go red, and
  the fix is to exempt it with a reason rather than to adjust the number until
  the gate agrees.
- ~~**Whether the remaining chain-local reads should have global indexes at all.**~~
  **Answered, per function, and `get_membranes` is now indexed** — see the entry
  on `MembraneRegistry` later in this section. This bullet said §10.0 "names the
  question rather than answering it, which is correct — but it is a question
  nobody is tracking", and the not-tracking was the accurate half: the answer
  turned out to be determinable from what the repository already did, and the
  question stayed open because three unlike reads were argued as one class.
  `get_all_constitutions` stays chain-local on its own reasoning, which is now
  stated rather than deferred.
- ~~**`mcp-server` ships no lockfile.**~~ **Done, and the blocker recorded for it
  was wrong in the same way the first reason was.** The first reason — "adding one
  changes what a published install resolves" — is false, since npm never packs a
  lockfile. The replacement said `npm ci` cannot coexist with the
  `npm install --no-save ../agent-sdk` that keeps the SDK local, which is true in
  one order only: run `npm ci` first and the two compose exactly as wanted, with
  the lockfile left byte-identical. Tested rather than argued. See the entry at
  the end of this section.
- **Why a node sometimes joins the DHT and exchanges nothing is unknown, and
  four hypotheses have been falsified.** `transitive-gossip.mjs` now fails with a
  named setup error when it happens — nodeD holding the same DNA hash while
  exchanging nothing with nodeA in either direction — rather than blaming the
  protocol for a failure to relay. The cause is still open. Tested and ruled out
  on 2026-09-12, each by experiment on a real four-node network: a relay identity
  that changes on restart (a restarted nodeB was reachable in ≤0s); generating a
  node into an already-running network (fresh nodeD, ≤10s); the failing
  configuration specifically, nodeB stopped while nodeA writes (≤10s); and
  `database is locked` from `integrate_dht_ops_consumer`, which appears in
  healthy runs too and is routine contention. **The one surviving correlation has
  since been demoted, and this entry was overdue in saying so:** `Accept message
  from wrong peer` appeared in the original sighting and in none of the healthy
  runs of that session — but `transitive-gossip.mjs`'s own setup-failure text
  already records that two *later* measured failures produced **no distinctive
  error at all**, that line included. One sighting in three observed failures is
  not a correlation to reason from, and the harness tells its reader to "expect a
  long tail rather than a broken state". The harness's own comment carries the
  four experiments so nobody repeats them.

  **The upstream report this entry used to point at is closed, and it was closed
  for the other half of itself.** `holochain/kitsune2#638` carried two separate
  things: an error-attribution bug read out of the gossip source, and this
  symptom as a sighting. The first was accepted and fixed — `#639`, *"attribute
  a gossip message from the wrong peer to that peer"*, merged **2026-09-30** —
  and the issue was closed on that merge with "The referenced PR has been
  merged. Closing this". **The symptom half was never addressed**, there is no
  successor issue, and no upstream record of it now exists. Filing two unrelated
  things in one issue is what made that possible, and the lesson is the filing
  shape rather than the outcome.

  **Two pieces of maintainer feedback are worth carrying, since both bear on how
  the next report should look.** The substantive one: the issue was *"too much
  text for such a small fix"*, with a pointer to `kitsune2`'s `AI_POLICY.md`.
  The procedural one is in this repository's own second comment on it — the
  first batch of runs saved conductor logs only when `wrong peer` matched, which
  is exactly why the run that mattered was lost. So a re-filing needs a short
  write-up and a captured log pair, in that order of scarcity.

  **The instrument for the second of those was built, run twice, and settled the
  question against the hypothesis it was built to test.** `peering-rate.mjs`
  archives every trial's conductor logs, and
  `.github/workflows/peering-rate.yml` runs it on a two-vCPU hosted runner — the
  machine slow enough to lose a 15s gossip round, which the development machine
  measured below is not. Dispatch only, asserts nothing, uploads the archive.
  **What it found is below**, and the short version is that there is nothing to
  re-file: the symptom decomposed into `initiate_interval_ms` and an iroh
  transport timeout, neither a kitsune2 gossip defect, so the log pair this
  paragraph was written to go and capture turned out not to document a bug.

  **That log line does now have a mechanism, which is worth writing down even
  though it is no longer the lead.** Read out of `kitsune2_gossip-0.5.0`: gossip
  keeps exactly **one** outgoing round — `initiated_round_state:
  Arc<Mutex<Option<GossipRoundState>>>`, whose doc comment says "we only initiate
  one round at a time, so this is a single value" — while *accepted* rounds get
  `accepted_round_states: Arc<RwLock<HashMap<Url, ...>>>`, keyed per peer. An
  incoming Accept is therefore checked against that single slot, and
  `validate_accept` emits this exact string when `self.session_with_peer !=
  from_peer`. So: initiate with X, lose the round to `round_timeout_ms`, have the
  reaper clear the slot, initiate with Y, and X's late Accept is then rejected as
  coming from the wrong peer. It needs at least two gossip peers, which
  `transitive-gossip`'s four nodes have and a two-node harness does not — which
  is why it showed up here and nowhere else.

  **What that does and does not buy.** It explains the *symptom*, from source,
  and it ties it to the same lost-round cause that `scripts/network.sh` now
  raises `roundTimeoutMs` for. It does **not** explain this entry's actual
  question, because the symptom is absent from two of the three failures anybody
  measured — a mechanism for a clue that mostly is not there cannot be the cause
  of the thing that is. Stated as a prediction instead, at no extra cost: the 60s
  `roundTimeoutMs` should make `Accept message from wrong peer` rarer, since a
  lost round is step one of the sequence. If a node still joins and exchanges
  nothing while that line stays absent, this paragraph is a side-story and the
  open question is untouched — which, on the evidence, is the likelier outcome.

  **The prediction was tested locally and it held, on the one measurement that
  carries information.** `scripts/live-verify/peering-rate.mjs` runs the nodeD
  peering step as a trial on its own clean network, at `roundTimeoutMs` 60000 and
  15000, eight trials each, capped at `transitive-gossip`'s own 330s. The
  per-trial crossings:

  | `roundTimeoutMs` | crossings (s) |
  |---|---|
  | 60000 | 3.0 3.0 3.0 3.0 3.0 3.0 3.0 3.0 |
  | 15000 | **307.5** 3.0 3.0 3.0 3.0 **42.2** 3.0 3.0 |

  **The 307.5s is the result, because of where it lands rather than because it
  is slow.** `min_initiate_interval_ms` is 300,000 — the minimum before a round
  may be initiated with a given peer again — so a crossing at 300s plus 7.5s is
  the predicted shape exactly: the first round lost, no retry permitted for five
  minutes, then a crossing in a few seconds. Nothing else in play predicts a
  delay that lands on that constant. The 60s arm produced no crossing above a
  single poll. **And 307.5s would have been a CI failure on a slightly slower
  machine:** `real-gossip`'s window is 330s, so that run passed with 22s of
  margin, and losing that margin is the surviving `network` failure mode exactly.

  **What it does not support is a rate.** Two slow trials in eight against zero
  in eight is Fisher exact **p = 0.467**; no frequency claim survives that and
  none is made here. The magnitude is the evidence, the count is not. The 42.2s
  is not explained by the 300s model and is left unexplained rather than fitted.

  **This entry first recorded the run as a null result, and the correction is the
  more useful half.** The harness's summary printed "crossed 8, timed out 0,
  **median** 3.0s" for both arms — every figure true, and the median of a
  distribution whose only interesting feature is one long tail is precisely the
  statistic that erases it. It was written up as "16/16, no information in it"
  from that table, with the per-trial lines sitting directly above it. The
  summary now prints the slowest crossing and a count of trials over 10s. The
  pre-registered condition was wrong in the same direction — "if the two arms
  produce the same rate" cannot separate the hypotheses at eight trials an arm,
  and should have been about crossings near 300s, which is what the data carried.

  **And then the strong run happened and refuted it, which is why the paragraphs
  above are left standing rather than edited.** `peering-rate.yml` ran the same
  harness on a two-vCPU hosted runner — the machine the note above says the
  development machine is not — requesting 10 trials an arm. 17 completed before
  the harness hung (bounded since; see its own BOUNDS block):

  | `roundTimeoutMs` | crossings (s) |
  |---|---|
  | 60000 | 135.3 · 63.0 · **none** · 156.2 · 129.3 · **none** · **none** · 63.0 · 63.0 · 63.0 |
  | 15000 | 18.1 · 132.3 · 21.1 · **none** · 135.3 · 132.3 · 0.0 · *(3 lost)* |

  **Nothing lands near 300s.** The 307.5s crossing was the entire basis for the
  `min_initiate_interval_ms` reading, and on the machine that actually loses
  gossip rounds no crossing comes within 20s of 300s. They cluster at 63.0s
  (×4), ~129–135s (×5) and ~18–21s instead. **And the 60s arm is not
  protective**, which was the pre-registered prediction's whole content: 3
  no-crossings in 10, against the 15s arm's 1 in 7. Fisher exact **p = 0.603**,
  so no difference is established in either direction — but the point estimate
  runs *opposite* to the prediction. The round-timeout mechanism is no longer
  the lead, and §5's `roundTimeoutMs: 60000` is now a setting with no measured
  benefit rather than a fix.

  **What separates the trials is whether nodeD ever gossiped at all.** Three of
  the four no-crossings logged `Initiated gossip with` **zero** times; the
  fourth initiated four times and still never crossed. One no-crossing trial
  logged `No agents with overlapping arcs available` **320 times with zero
  initiations** — a conductor up, answering, on the same DNA hash (`sameDht` is
  asserted before the clock starts), repeatedly finding no peer to gossip with.
  That is this entry's question restated as a measurement. It is also what
  `log-census.sh`'s own comment already called "the surviving explanation … the
  one path that logs nothing wrong", so the census was built for exactly this
  and found it.

  **`Accept message from wrong peer`: zero in all 17 trials.** Fifth independent
  confirmation that the demoted marker is absent, and it should stop being
  mentioned as a candidate.

  **One confound, named because it nearly survived.** That arcs figure is a
  *lifetime* count, so a trial that ran the full 330s logs more of it than one
  that crossed in 3s, for reasons unrelated to cause. Only equal-duration trials
  compare; among the four that ran the full cap the counts are 2, 1, 1 and
  **320**. The outlier survives the correction — a general "slow trials log more
  of it" claim does not, and an earlier draft of this paragraph made it.

  **What is still missing is a healthy baseline.** Exactly one trial of 17 came
  in under 10s, so there is almost nothing to compare the slow ones against. The
  harness now archives every trial named for its own crossing time, which fixes
  the collection side; the next run has to actually produce fast trials for the
  comparison to mean anything, and on this runner that is not guaranteed.

  **The three-arm run is the one that answers things, and it starts by retiring
  two findings from the paragraphs above.** Run `37478744160`: 30 trials, arms
  60000/30000/15000 interleaved on one runner, all ten per arm completed, every
  trial archived. The 30000 arm exists because a 15s grid cannot falsify a
  "crossings land just after a multiple of `roundTimeoutMs`" reading — any value
  is within 15s of a multiple of 15 — while a 30s grid can.

  | arm | crossings (s) | never crossed |
  |---|---|---|
  | 60000 | 9.8 · 44.4 · 44.5 · 0.0 · 134.1 · 153.4 · 138.3 · 123.3 | 2 of 10 |
  | 30000 | 131.3 · 126.3 · 3.0 · 137.4 · 137.1 · 3.0 · 0.1 · 3.0 · 132.3 | 1 of 10 |
  | 15000 | 7.6 · 27.1 · 18.1 · 123.3 · 138.4 · 132.3 · 18.1 · 3.0 | 2 of 10 |

  **Retired: the 320-line outlier does not reproduce.** The previous run's
  strongest single datum was one trial logging `No agents with overlapping arcs
  available` 320 times. Across these 30 trials the maximum is **2**. One
  observation, not a signature, and it should not be cited again.

  **Retired: "three of four non-crossings never initiated gossip" was not
  diagnostic.** `Initiated gossip with` = 0 appears just as readily in the
  *fastest* trials — 0.0s, 0.1s, 9.8s — because a claim that arrives immediately
  needs no round initiated to fetch it. The previous run had one control and
  could not see this; this one has eight sub-10s trials and the reading does not
  survive them. That is what controls are for, and it is the second time this
  entry has had to withdraw a pattern drawn without them.

  **Refuted: the cadence reading.** Excess over the nearest multiple of
  `roundTimeoutMs`, per arm: 60000 → 0.0, 3.3, 9.8, 14.1, 18.3, 33.4, 44.4,
  44.5; 30000 → 0.1, 3.0, 3.0, 3.0, 6.3, 11.3, 12.3, 17.1, 17.4. The 30s band is
  filled, not bunched at its start, and 44.4/44.5 sit mid-band under any reading.
  Killed by the arm added to kill it.

  **Confirmed, now decisively: `roundTimeoutMs` is not the variable.** 2 of 10,
  1 of 10, 2 of 10 across a 4× range of the setting, interleaved so arm and
  machine-fatigue are no longer the same variable. §5's `roundTimeoutMs: 60000`
  has no measured benefit and should be understood as a setting nobody has shown
  to help.

  **What is real: an arm-independent band at ~123–153s holding 12 of 25
  crossings**, contributed to about equally by all three arms (4, 5, 3), with the
  rest split between a fast mode under 10s (eight trials) and a thin middle
  (five). `partition-rejoin`'s baseline sits inside that band too — 125.3s,
  twice, to the decimal, on a job that never varies the setting. The band is the
  thing to explain and it has nothing to do with gossip round timeouts.

  **And the non-crossings split into two distinct modes**, which is the first
  mechanism-level result this question has produced. Counting nodeD's gossip
  traffic per trial and normalising by duration — the only valid comparison,
  since a 330s trial has more time to log anything than a 3s one:

  | class | n | initiates/100s | messages handled/100s |
  |---|---|---|---|
  | crossed in 123–153s | 12 | 4.17 | 8.15 |
  | never crossed | 5 | 0.73 | 1.03 |

  - **Mode 1, four of five: one initiate, then silence.** nodeD sends exactly one
    `Initiate` and handles zero or one message in the whole 330s. `Starting
    initiate task` is **2 in all thirty trials**, so the task reliably starts —
    and then, in these four, does nothing further for five and a half minutes.
    0.30 initiates/100s against the band's 4.17: a **14×** difference, duration-
    matched.
  - **Mode 2, one of five: rounds complete and move nothing.** Eight full rounds,
    sixteen messages handled, **eight concluding `NoDiff`** — while nodeA held a
    claim nodeD did not have. Gossip worked repeatedly and still transferred
    nothing, which is a different and worse failure than not gossiping.

  **`Accept message from wrong peer`: zero across all 30 trials** — 47 trials
  cumulative with zero, and it should be struck from this entry's candidate list
  rather than merely demoted.

  **Status: reproducible at 5 in 30 on hardware anybody can rent**, which is the
  thing this question has never had. The upstream report was always blocked on
  "a maintainer cannot act on a run nobody can reproduce"; that blocker is gone,
  and the two modes above are what should be filed — not the 320.

  **And then the band stopped being a mystery, from reading the archives and
  kitsune2's own config defaults.** Every one of those 12 band trials contains a
  **single stall of 107–123s with zero transport errors**, and in 8 of 12 the
  activity resumes *inbound* — a peer initiating to nodeD, not nodeD retrying.
  `kitsune2_gossip-0.5.0/src/config.rs`:

  | constant | default |
  |---|---|
  | `initial_initiate_interval_ms` | 1_000 |
  | `initiate_interval_ms` | **120_000** |
  | `initiate_jitter_ms` | 10_000 |
  | `min_initiate_interval_ms` | 300_000 (per peer) |

  A 120s-plus-jitter sleep, minus the trailing accept/terminate lines of the
  burst before it, is a measured gap of ~107–125s. That is the band, exactly.
  It also explains the opening burst at ~1s intervals, and why the band is
  **arm-independent**: not one of those constants is `roundTimeoutMs`. The
  development machine's 307.5s looked like `min_initiate_interval_ms` and was a
  coincidence; the driver is the 120s interval.

  **The fix held for the median and NOT for the tail, and the first write-up of
  this said "the fix held" full stop.** That claim lasted about two hours. The
  post-fix baselines, each captured before a re-run could overwrite it:

  | run | baseline |
  |---|---|
  | #193 (the fix itself) | 10.0s |
  | #195 | 25.1s |
  | #207, first attempt | **195.5s** — failed |
  | #207, re-run | 0.0s |
  | #201, first attempt | **170.4s** — failed |
  | #201, re-run | **900s** — failed, 300s past a 600s window |
  | #201, third attempt | 5.0s |

  **The last three rows are one commit.** 170.4s, then 900s, then 5.0s, from
  identical code — a 180× spread that no code change can explain, which is also
  what rules the v4 fork out as a cause. The slow mode is independent of what is
  being tested, and #207 hitting it at 195.5s with no zome change at all
  confirms that from the other direction.

  **So the fix moved the fast mode and the median dramatically, and the slow
  mode survived it and got worse** — 900s against the 120–125s band the fix was
  built to eliminate. Lowering `initiate_interval_ms` genuinely removed the
  120s-shaped stall, and something else produces a longer one.

  **The distribution was then measured deliberately rather than waited for, and
  it confirms the split.** `peering-rate` already does this job — a fresh
  network per trial, N trials, per-trial crossing times — and its 30-trial run
  predated the fix, so re-running it measures the current configuration with no
  new code. Run `37621098063`, 12 trials, one arm (the three-arm run having
  settled that `roundTimeoutMs` is not the variable):

  ```
  0.0  0.0  0.0  3.0  3.0  18.0  21.0  27.0  27.1  49.9  142.0  NO CROSSING
  ```

  | | pre-fix (30 trials) | post-fix (12 trials) |
  |---|---|---|
  | never crossed | 5 of 30 (17%) | 1 of 12 (8%) |
  | crossings over 120s | 12 of 25, banded 123–153s | 1 of 11, at 142.0s |
  | median crossing | in the 123–153s band | **18.0s** |
  | inside one poll | rare on this runner | **5 of 12** |

  **So the median moved hard and the tail did not disappear.** Five of twelve
  now cross inside a single poll, where the pre-fix run's crossings clustered
  above two minutes — and there is still a 142.0s crossing and still a trial
  that never crossed at all. That is the same conclusion the correction above
  reaches from CI failures, reached independently from a deliberate measurement,
  which is the first time these two routes have agreed about this question.

  **What the run did NOT produce is the archive, and the cause was a bug in this
  harness rather than anything about CI.** The paragraph that stood here blamed
  GitHub for orphaning the job and proposed shorter dispatches as the
  mitigation. Both were wrong, and a four-trial run disproved the mitigation
  within the hour: it finished its trials in five minutes and then hung for
  eighty-seven more.

  **`peering-rate.mjs` never exited.** `connectNode` opens an `AdminWebsocket`
  and an `AppWebsocket` per node per trial and returns neither, so nothing can
  close them; open sockets are live libuv handles, so Node keeps the event loop
  alive after `main()` resolves. Earlier trials escape it because the next trial
  runs `network.sh clean`, which takes those conductors down and lets the client
  sockets error out — but the last trial has no successor, and `stop-node nodeD`
  leaves nodeA, nodeB and nodeC running. Every run therefore ended holding live
  sockets to a live conductor and waited forever.

  **Three runs were lost to it, and the symptom pointed away from the cause the
  whole time.** Every orphaned run printed its complete summary first — trials,
  table, footer. The measurement always finished; the process would not leave.
  That looked exactly like infrastructure losing a runner, which is what it was
  twice written up as, and `timeout-minutes` not firing seemed to confirm it.
  What settled it was a control sitting in the same directory:
  `cross-internet.mjs` uses the same connect pattern and the same client
  library, has never orphaned once, and differs in one relevant respect — its
  `main()` ends with an explicit `process.exit`. `peering-rate.mjs` had one only
  on the error path.

  Fixed with an explicit exit, and the other 43 harnesses were checked for the
  same shape — a harness that connects and has no exit. None of them has it.

  **And with the exit fixed, the census this question has wanted since the
  beginning finally exists.** Run `37648330341`, 12 trials, and — for the first
  time in four attempts — **the archive uploaded**, which is the fix confirmed
  by the one thing it was supposed to enable. Two trials never crossed, so the
  run carries non-crossings and fast controls in the same archive.

  ```
  15.1  18.1  21.1  12.0  NONE  21.1  45.6  11.0  11.1  45.9  18.1  NONE
  ```

  **nodeD's own census splits the twelve into two populations, cleanly:**

  | | population A | population B |
  |---|---|---|
  | `iroh connect timed out` | **0** | **1 each** |
  | `Initiated gossip with` | 3–4 | 0–1 |
  | `NoDiff` rounds | 4–8 | 0–1 |
  | `MultipathNotNegotiated` | 1 | 2–4 |
  | crossings | 12.0, 15.1, 18.1, 18.1, 21.1, 21.1 | 11.0, 11.1, 45.6, 45.9 |
  | never crossed | **0 of 6** | **2 of 6** |

  **Every non-crossing has an iroh connect timeout, and no trial that crossed in
  12–21s has one.** In population B nodeD's own gossip is effectively dead —
  zero or one initiation against three or four, and almost no completed rounds —
  so arrival depends entirely on a peer pushing to it. Four of six got that
  push; two did not, and those are the non-crossings.

  That is a coherent mechanism and it matches the earlier finding that four of
  five non-crossings carried iroh timeouts — but it now has **controls**, which
  that finding did not, and the controls are what make the comparison mean
  anything.

  **The rate is not established and the sample is twelve.** 2 of 6 against 0 of
  6 is Fisher exact **p = 0.45**. The correlation is perfect in one direction,
  which is suggestive and nothing more; this section has twice recorded a
  pattern read off too few controls and had to withdraw it. What is new is not a
  rate but a reproducible instrument: a run that archives every trial and
  survives to upload, so the next twelve extend this table instead of restarting
  the question.

  **A second batch of twelve broke that reading, and produced the strongest
  evidence this question has ever had.** Run `37652304206`, same configuration:
  three non-crossings this time, so five across twenty-four trials (21%). Four
  of the five carry an `iroh connect timed out`, which is the pattern above and
  the same four-of-five split the original 30-trial run showed. **The fifth does
  not, and it is the interesting one.**

  `rt15000-nocrossing-trial04`: **zero transport errors, 60 initiations, 121
  `NoDiff` rounds**, and the entry never arrived in 330 seconds. Every
  explanation that dissolved the earlier `NoDiff` case fails against it:

  | explanation | why it does not apply |
  |---|---|
  | transport failure | `iroh connect timed out` = **0**, `MultipathNotNegotiated` = 1, the same as the fast controls |
  | the initiate interval | **60** initiations across the window — the node was asking constantly |
  | rounds predated the entry | the earlier case's informative rounds were at t+9.4s against a claim created at t+17.0s. Here the rounds run from t+10.0s to **t+342.2s** |
  | gossiping with the wrong peer | peer URLs resolve uniquely across the four logs, and **58 of the `NoDiff` rounds are with nodeA after t+25s** — the node that holds the claim, well past its creation |

  **So: two conductors on one DHT, completing fifty-eight gossip rounds over
  five minutes, agreeing each time that their snapshots were identical, while
  one of them held an entry the other never received.** That is a gossip-level
  result rather than a transport one, and it is the first time this question has
  produced a case that survives all four checks rather than dissolving under the
  third or fourth.

  **One caveat that is not resolved and should not be glossed.** The harness
  confirms `create_claim` returned on nodeA; it does not independently confirm
  that nodeA had *integrated* the op into the shard gossip offers from. Sixty
  rounds over five minutes makes an integration lag implausible, but implausible
  is not checked, and the honest statement is that this is one trial in
  twenty-four with one unverified assumption in it. The instrument now archives
  every trial and survives to upload, so the next batch either reproduces this
  or it does not.

  **It reproduced twice in the next batch, and the fingerprint is tight.** Run
  `37656458850`, same configuration, five non-crossings in twelve — so ten
  across thirty-six trials (28%). Two of the five are the same thing:

  | | initiations | `NoDiff` | rounds with nodeA | post-entry | last round |
  |---|---|---|---|---|---|
  | batch 2, trial 04 | 60 | 121 | 61 | 58 | t+342.2s |
  | batch 3, trial 03 | 58 | 118 | 64 | 62 | t+334.1s |
  | batch 3, trial 06 | 60 | 122 | 65 | 63 | t+336.6s |

  Zero transport errors in all three. **Three occurrences, which is the
  threshold this section has invoked against itself repeatedly** — the nodeD
  question's own counts "answered on the third occurrence", and a single
  occurrence has twice been called not a finding here. This is the third, and
  the signature barely varies: 58–60 initiations, 118–122 completed rounds,
  58–63 of them with the entry-holding node after the entry exists, running to
  within fifteen seconds of the window's end.

  **So the ten non-crossings across thirty-six trials are two distinct faults,
  not one:**

  | | occurrences | signature |
  |---|---|---|
  | transport | 7 of 10 | `iroh connect timed out` ≥ 1, 0–1 initiations, elevated `MultipathNotNegotiated`. nodeD's gossip never starts; arrival depends on being pushed to |
  | **gossip** | **3 of 10** | zero transport errors, ~60 initiations, ~120 rounds all concluding no difference, against the node that holds the entry |

  The second is a protocol-level result and the first is not. Both were hiding
  inside one symptom — "a node joins the DHT and exchanges nothing" — for the
  life of this entry, which is why every single-cause hypothesis tried against
  it got partial support and then collapsed.

  **Four batches, forty-eight trials, and the caveat is weakened but not closed.**

  | batch | trials | never crossed | transport | gossip |
  |---|---|---|---|---|
  | 1 | 12 | 2 | 2 | 0 |
  | 2 | 12 | 3 | 2 | 1 |
  | 3 | 12 | 5 | 3 | 2 |
  | 4 | 12 | 3 | 3 | 0 |
  | | **48** | **13 (27%)** | **10 (77%)** | **3 (23%)** |

  So the `NoDiff` mode is **3 in 48 trials, about 6%** — rare enough that a
  twelve-trial batch misses it more often than not, which batch 4 duly did.

  **Batch 4 ran with the integration check active and found integration
  instantaneous: 0.0s in 12 of 12, including all three non-crossings.** That
  rules integration lag out as a general effect in this harness. It does **not**
  close the specific question, because batch 4 produced no `NoDiff` trial — the
  check was added after batch 3, and the three `NoDiff` cases predate it. So
  "nodeA had integrated the op in those three trials" is now a strong inference
  from twelve consecutive 0.0s measurements plus ~180 completed rounds apiece,
  and still an inference rather than a measurement.

  Stated plainly because the temptation runs the other way: twelve immediate
  integrations do not retroactively measure a trial that ran before the
  instrument existed. Closing it needs a `NoDiff` trial to occur with the check
  active, which at 6% means roughly another two or three batches.

  **Batch 5 closed it on the first attempt, and closing it falsified the
  mechanism this entry had been attributing the mode to.** Run
  [`38024547790`](../../actions/runs/38024547790), twelve trials across the same
  two arms: eleven crossed, **one did not**, and integration was measured at
  0.0s in eleven of twelve — the twelfth being 7.7s on a trial that then crossed
  at 33.1s.

  | batch | trials | never crossed | transport | gossip |
  |---|---|---|---|---|
  | 5 | 12 | 1 | 0 | 1 |
  | | **60** | **14 (23%)** | **10 (71%)** | **4 (29%)** |

  *(The 48-trial totals above are superseded and kept: 13 (27%), transport 10
  (77%), gossip 3 (23%). The `NoDiff` mode is now **4 in 60 trials, about 7%**,
  which is the same figure the 6% was — a batch yielding one is the expected
  outcome, and batch 4 yielding none was equally expected.)*

  **The occurrence is exactly the one the caveat specified.** `rt60000` trial 6:
  no crossing in 330s, **with the integration check active and reporting 0.0s**.
  nodeA demonstrably held its own claim before the clock started, and nodeD never
  saw it. The mode reproduced in full — nodeD exchanged **36 NoDiff rounds with
  nodeA**, 35 of them received, spanning 04:47:51 to 04:53:10, which is the whole
  window. Peer identity was established by set subtraction over the three relay
  URLs appearing across the four conductor logs: each node's own URL is the one
  absent from its own peer list, giving nodeA `41081e`, nodeB `aa096a`,
  nodeD `77653e`.

  **And then the thing that was supposed to be a confirmation was a refutation.
  Not one of those 35 NoDiff messages carried an empty `new_ops`** — every one
  carried 11 to 14 op ids, in 28 distinct sets. So the sentence this entry has
  repeated — ~120 rounds "every one concluding that their snapshots were
  identical, while the entry never arrived" — is **true about the message and
  wrong about the fault**.

  Verified against `kitsune2_gossip` **0.5.0**, the version the runner ran, pinned
  and read rather than inferred from 0.5.2 (`respond/accept.rs`,
  `respond/no_diff.rs` and `respond.rs` are byte-identical across the two, so the
  reading transfers):

  - `respond/accept.rs:111` emits `NoDiff` on `DhtSnapshotNextAction::Identical`,
    logging "Snapshots identical, no diff needed". That part was read correctly.
  - But `accept_response` is built at `respond/accept.rs:86` from
    `retrieve_new_op_ids(&common_arc_set, since: accept.new_since, …)` and
    attached to the message **regardless of the snapshot outcome**. Recent ops
    travel by bookmark, not by DHT diff.
  - And the receiving side — `respond/no_diff.rs` into `respond.rs:173`
    `handle_accept_response` — calls
    `self.fetch.request_ops(op_ids_to_publish_ops(decode_ids(accept_response.new_ops)), from_peer)`.
    Announced ops go onto a **fetch queue**.

  **So identical snapshots are the expected state for an op this recent, and a
  NoDiff round is not a round that exchanged nothing.** This entry had taken a
  normal condition for the defect. nodeA told nodeD about ops in all 35 rounds
  and nodeD never obtained the claim, which moves the suspect off gossip's diff
  and onto the fetch path.

  **The pinned source also offers a sharper candidate than the one being
  replaced, and it stays a candidate.** In `handle_accept_response` the bookmark
  moves first and the fetch is requested second:
  `update_new_ops_bookmark(from_peer, accept_response.updated_new_since)` at
  `respond.rs:181`, then `fetch.request_ops(…)` at `respond.rs:187`. Nothing
  re-offers an op whose bookmark has already advanced, because the next round's
  `retrieve_new_op_ids(since: new_since)` will not include it — a readable path to
  an op being **permanently skipped** rather than merely delayed, which is the
  shape this investigation has been looking for since shape A.

  Two limits keep it a hypothesis, and both are stated because the alternative is
  the move this entry has now had to withdraw twice:

  - `request_ops` returns `K2Result` and is `?`-propagated, so a call that failed
    outright would abort the handler. The gap is a fetch **accepted onto the queue
    and never completed**, which is a different claim and is not evidenced here.
  - nodeA sent **28 distinct** `new_ops` sets across 35 rounds, so ops were
    plainly still being offered. That is not what a bookmark racing permanently
    past everything looks like, and these logs cannot reconcile it: nodeD's
    `fetch` module has no tracing enabled, so the queue is invisible. **Making it
    visible is the next step**, not another batch.

  **The queue is visible now, and its first run disproved the candidate above
  within the hour.** [#223](../../pull/223) put
  `kitsune2_core::factories::core_fetch=debug` on the conductors and counted its
  four lines in the census. Run
  [`38026557039`](../../actions/runs/38026557039) — that pull request's own
  `network` job, a passing one, forward leg 4.0s:

  | | `processing` | `sending` | `response` | `stored` |
  |---|---|---|---|---|
  | real-gossip nodeA | 26 | 26 | 26 | 26 |
  | real-gossip nodeB | **42** | **18** | 18 | 18 |
  | real-gossip nodeC | 0 | 0 | 0 | 0 |
  | partition-rejoin nodeA | 22 | 22 | 22 | 22 |
  | partition-rejoin nodeB | **85** | **60** | 60 | 60 |
  | partition-rejoin nodeC | 0 | 0 | 0 | 0 |

  The instrumentation is sound on its own terms: non-zero on a run that crossed,
  all four counters carried by the census, and nodeC — a different DHT with
  nothing to fetch — at zero across the board, which is the control that makes
  the other rows mean something.

  **And nodeB dequeued 24 and 25 ops it never sent, in a run that passed every
  check.** That is the silent-drop fingerprint the entry above predicted, found
  immediately — and it refutes the hypothesis rather than confirming it. **If a
  dropped op alone caused a non-crossing, this run would have failed.** It
  dropped forty-nine and crossed in four seconds. So the drop is **background**,
  in the same category as `database is locked`: ops are re-announced on a later
  round and fetched then, and the queue losing some is the normal operation of a
  system that expects to be told again.

  Recorded at this length because of how fast it went: the mechanism was proposed
  from a source reading, instrumented, and disproved by the instrument's first
  run. The two limits stated alongside it were the right limits and they were not
  what killed it — what killed it was a passing run doing the thing that was
  supposed to be diagnostic, forty-nine times.

  **So the suspect moves a third time, and this time it is narrower rather than
  merely elsewhere.** Drops are routine and recovery normally follows, so what
  needs explaining is not a lost op but **a lost op that is never recovered** —
  one entry failing to come back across 35 rounds and 319 seconds while the
  machinery around it works. That is a question about what makes a particular op
  ineligible for re-announcement or re-fetch, and it is the first version of this
  question that the logs can now be pointed at.

  **A second thing the table raised — and the next run answered it, so it is
  recorded with the answer rather than as an open question.** In the run above,
  nodeA's chain matched exactly in both harnesses (26/26/26/26 and 22/22/22/22)
  and every drop was nodeB's: 0% on one conductor against ~30% on the other, same
  machine, same seconds, which is not what background contention predicts either.
  That looked like it might be a property of nodeB's role.

  **It is not. The very next run with the filter on dropped nothing at all.** Run
  [`38028080100`](../../actions/runs/38028080100) — forward leg 2.0s, Phase 0
  baseline 0.0s, both harnesses passing — censused nodeB at **35/35/35/35** and
  **40/40/40/40**, nodeA at 26/26/26/26 and 22/22/22/22.

  | run | nodeB dequeued | nodeB sent | dropped |
  |---|---|---|---|
  | [`38026557039`](../../actions/runs/38026557039) | 127 | 78 | **49** |
  | [`38028080100`](../../actions/runs/38028080100) | 75 | 75 | **0** |

  So a drop is **occasional rather than positional** — it is not nodeB's role
  that drops ops, and two runs on near-identical trees differ by 49 of them.
  **(Too strong, and corrected by batch 6 immediately below: which node drops IS
  positional — the fetcher, in twelve of twelve — while the rate varies with how
  much it has to fetch. These three `network.yml` runs are the low-volume end of
  that, not a counterexample to it.)** This
  is written down with both runs because an n=1 asymmetry left standing for a day
  is the exact failure this section is an argument against, and the run that
  settled it arrived within the hour, in the CI of the pull request recording the
  first one.

  *(One small thing the pair does establish: nodeA's counts are identical across
  both runs — 26 in `real-gossip`, 22 in `partition-rejoin`, four times over.
  nodeB's vary (127 and 75). Not interpreted here beyond noting that one side
  looks deterministic and the other does not.)*

  **Batch 6 is the first with the fetch chain live, and it found two
  non-crossings, a 213.5s crossing, and a reason to doubt the cap itself.** Run
  [`38029161000`](../../actions/runs/38029161000) off `6ea451e`:

  | batch | trials | never crossed | transport | gossip |
  |---|---|---|---|---|
  | 6 | 12 | 2 | 0 | 2 |
  | | **72** | **16 (22%)** | **10 (63%)** | **6 (37%)** |

  | arm | crossed | timed out | slowest |
  |---|---|---|---|
  | `rt60000` | 4 | **2** | 24.1s |
  | `rt15000` | 6 | 0 | **213.5s** |

  **nodeD's fetch chain, all twelve trials.** The two zero rows are the control
  the harness's own note asks for — they crossed fastest, so the direct publish
  landed and the queue was never involved:

  | trial | dequeued | sent | dropped | |
  |---|---|---|---|---|
  | `rt15000` 8.0s | 0 | 0 | 0 | queue never used |
  | `rt60000` 10.2s | 0 | 0 | 0 | queue never used |
  | `rt15000` 15.0s | 47 | 18 | 29 | 62% |
  | `rt60000` 15.0s | 47 | 18 | 29 | 62% |
  | `rt15000` 21.1s | 47 | 18 | 29 | 62% |
  | `rt15000` 21.1s | 47 | 27 | 20 | 43% |
  | `rt60000` 24.1s | 47 | 18 | 29 | 62% |
  | `rt60000` 24.1s | 43 | 11 | 32 | **74%, and it crossed** |
  | `rt15000` **213.5s** | 59 | 27 | 32 | 54% |
  | `rt60000` **no crossing** | 37 | 8 | 29 | **78%** |
  | `rt60000` **no crossing** | 27 | 10 | 17 | 63% |

  nodeA was **18/18/18/18 with zero drops in every single trial.**

  **The drop rate does not separate a crossing from a non-crossing, now at n=12
  rather than n=1.** A trial dropping **74%** crossed in 24.1s; one dropping
  **78%** never crossed. That is the entry above confirmed on a second harness
  and an order of magnitude more data, and it closes the question of whether the
  drop is the defect. It is not.

  **But "occasional rather than positional", one entry above, is too strong and
  is corrected here.** That read came from three `network.yml` runs where nodeB
  dropped 49, then 0, then 2. Across these twelve trials the **fetching** node
  drops in **ten of twelve, at 43% to 78%**, while nodeA — the publisher, which
  holds everything and fetches little — drops **nothing, in twelve of twelve**.
  So the accurate statement has three parts, and the earlier one collapsed them:
  **which** node drops is positional (the fetcher, always), the **rate** varies
  with how much it has to fetch, and **neither** predicts the outcome. The
  `network.yml` zero-drop runs are consistent with that — nodeB there is up from
  the start and has little to fetch, where `peering-rate`'s nodeD joins late and
  must fetch a history.

  **And the finding that matters most is the 213.5 seconds.** An op was dropped
  thirty-two times and **still arrived**. So recovery does happen, and it happens
  late — which means a "non-crossing" at the 330s cap is not demonstrably a
  failure to recover. **The cap is 330s and the longest observed recovery is
  213.5s: a factor of 1.5.** A distribution whose tail reaches 213.5s cannot be
  said to end before 330s on this evidence, and the two non-crossings may simply
  be the same tail past the shutter.

  **That reframes the live lead rather than answering it.** The question was "what
  makes one op never recover" and the honest version is now **"do these ops never
  recover, or does the harness stop watching first"** — which is a cheaper
  question: `peering-rate.yml` takes `cap_ms` as a dispatch input, so a batch at
  600s or 900s answers it directly. Worth doing before any more mechanism
  hunting, because every mechanism proposed so far has been for a failure that
  may not exist.

  **One more thing batch 6 broke: integration is no longer always instantaneous.**
  Three of twelve trials measured it at **8.1s, 8.1s and 8.2s**, where batches 4
  and 5 were 0.0s almost throughout. The distribution matters less than what it
  does to the reasoning: §9 has been treating "integration is instantaneous" as
  settled, and it is a property of those batches rather than of the harness. It
  is still not the cause here — one non-crossing had 8.1s integration and the
  other had 0.0s, and the 213.5s crossing had 8.1s — but the figure needs
  measuring per trial rather than assuming, which is exactly why #217 reports it
  per trial.

  **Batch 7 doubled the cap to 600s and answered the question both ways at once.**
  Run [`38031344843`](../../actions/runs/38031344843), `cap_ms=600000`, everything
  else unchanged:

  | arm | crossed | timed out | slowest |
  |---|---|---|---|
  | `rt60000` | **6** | 0 | **424.6s** |
  | `rt15000` | 4 | **2** | 39.1s |

  | batch | trials | never crossed | transport | gossip |
  |---|---|---|---|---|
  | 7 (600s cap) | 12 | 2 | **2** | 0 |
  | | **84** | **18 (21%)** | **12 (67%)** | **6 (33%)** |

  **Part one: the cap was an artefact, for some of them.** Two crossings landed at
  **424.6s** and **360.6s**. Both are past 330s, so both would have been recorded
  as non-crossings in every batch before this one — and the `rt60000` arm went
  **6 for 6** where batch 6 had it 4 of 6, the entire difference being those two
  late arrivals. So a real share of the 18 historical non-crossings were ops that
  recovered after the shutter closed, and the 27%/23%/22% rates in the batches
  above are measuring the window as much as the network.

  **Part two: two trials still failed at 600s, and they are a different fault with
  a single cause.** Both `rt15000` non-crossings have an identical signature on
  nodeD, and it is not NoDiff and not the fetch queue — **the fetch queue and the
  gossip rounds are both at zero, because nodeD never gossiped at all:**

  | nodeD | trial 04 | trial 05 | control (424.6s crossing) |
  |---|---|---|---|
  | `Attempting to initiate gossip with` | 1 | 1 | 76 |
  | `Failed to initiate gossip` | **1** | **1** | 0 |
  | `Initiated gossip with` | **0** | **0** | 76 |
  | `All agents with overlapping arcs are on timeout` | **584** | **584** | 0 |
  | `No agents to gossip with` | **584** | **584** | 0 |
  | `NoDiff` | 0 | 0 | 153 |
  | fetch dequeued / sent | 0 / 0 | 0 / 0 | 71 / 27 |

  **One failed connect ended the run.** nodeD selected a target 3 seconds in,
  attempted its first initiation, and got
  `Failed to initiate gossip: Other { ctx: "iroh connect timed out" }`. For the
  remaining **597 seconds** its initiate loop ran **584 more times** and found
  nobody to gossip with on every one of them — logging
  `All agents with overlapping arcs are on timeout, selecting from all agents`
  and then `No agents to gossip with`, 584 times each. It never attempted a
  second initiation. The claim could not arrive because no round was ever started
  to carry it.

  **So these two belong in the transport column, not the gossip one.** The table
  above classifies them that way and it is a change in kind rather than a
  recount: `iroh connect timed out` is the same transport signature §9 has been
  tracking since shape B, and what is new is the *consequence* — a single
  transport failure at t+3s removing nodeD's only viable target for the rest of
  the run. Every mechanism proposed today assumed rounds were happening and
  something inside them was wrong. In these two trials nothing was happening at
  all.

  **And the code says which filter, with a number attached.** It is the
  unresponsive one, and the marking lasts far longer than either cap. When the
  transport gives up on a peer, `CoreSpace::set_unresponsive`
  (`kitsune2_core-0.5.0/src/factories/core_space.rs:268`) writes the entry with
  its expiry set to **`agent_info.expires_at`** — not a backoff, not an
  interval, the peer's own agent-info lifetime. And agent info is minted with
  `created_at + Duration::from_secs(60 * 20)` (`core_space.rs:498` and `:566`),
  so that expiry is **1200 seconds**.

  `select_next_target` skips unresponsive peers at `initiate.rs:269`, and it does
  so in **both** passes — the overlapping-arc pass and the "selecting from all
  agents" fallback. So:

  | t+3s | nodeD's first initiation fails, `iroh connect timed out` |
  |---|---|
  | immediately | the transport marks nodeA unresponsive, expiring at nodeA's agent-info expiry |
  | for up to 1200s from agent-info creation | `select_next_target` skips nodeA in both passes |
  | consequence | `No agents to gossip with`, 584 times, and no round ever starts |

  **The filter is named by elimination rather than by a log line, because those
  branches are silent.** Every exclusion arm at `initiate.rs:255-277` is a bare
  `continue` with no tracing. What rules the other two out: the agent had a URL
  (it was selected as a target three seconds earlier), and its agent info was
  three seconds old so it had not expired. Unresponsive is what is left, and the
  1200s figure is what makes it fit — both caps are shorter.

  **So "it is a code question, not another batch" was half right, and the half it
  got wrong is the useful half.** A batch *can* test this, and it is the one test
  that discriminates: a cap meaningfully past **1200s** should see these trials
  recover, because the marking will have expired. The paragraph below said
  doubling the cap again was not worth it, written before this reading; a ~1500s
  cap is now the sharpest single experiment available, and it is cheap because it
  only has to run until the two failures either recover or do not.

  **One thing not claimed, and one thing this paragraph got wrong.** 424.6s
  against a 600s cap is a factor of 1.4 — very nearly the 213.5s-against-330s
  ratio that prompted this batch — so 600s is not demonstrably a ceiling either,
  and that still stands. What this paragraph originally went on to say was that
  doubling again was not worth it, "because the two trials that failed here
  failed for a reason that has nothing to do with the cap". **That reasoning was
  right about the cause and wrong about the consequence**: the cause is an
  unresponsive marking that expires at 1200s, so the cap is exactly what decides
  whether those trials recover. Kept as written, with the correction, because the
  error is instructive — "this failure is not about the window" was true of the
  *mechanism* and false of the *observable*, and the two got conflated inside one
  sentence.

  **The arms stopped meaning anything, which is worth saying since they are the
  experiment's own independent variable.** Batch 6 had `rt60000` failing twice
  and `rt15000` clean; batch 7 has exactly the reverse, 6-for-6 against 4-of-6.
  Over the two batches `roundTimeoutMs` predicts neither the failures nor the
  slow crossings, and the harness's own header already says a handful of trials
  per arm cannot establish a rate. These batches are worth running for the
  per-trial evidence they dump, not for the arm comparison they are nominally
  shaped around.

  **Batch 8 raised the cap to 1500s and crossed 12 for 12 — the prediction held
  in direction and failed on its number.** Run
  [`38036069009`](../../actions/runs/38036069009), `cap_ms=1500000`:

  | arm | crossed | timed out | slowest |
  |---|---|---|---|
  | `rt60000` | **6** | 0 | 429.8s |
  | `rt15000` | **6** | 0 | **943.0s** |

  | batch | trials | never crossed |
  |---|---|---|
  | 8 (1500s cap) | 12 | **0** |
  | | **96** | **18 (19%)** |

  **The batch 7 failures were truncated recoveries, and this is the trial that
  shows it finishing.** `rt15000` trial 4 carries the batch 7 signature exactly —
  and then ends differently:

  | nodeD, `rt15000` trial 4 | |
  |---|---|
  | `Attempting to initiate gossip with` | 3 |
  | `Failed to initiate gossip` | 1, at **t+25s** |
  | `No agents to gossip with` | **924** |
  | `All agents with overlapping arcs are on timeout` | 924 |
  | `Initiated gossip with` | **2**, the first at **08:24:48.300** |
  | crossing | **943.0s** |

  One failed initiation, 924 consecutive iterations finding nobody, then two
  rounds and the entry arrives. Batch 7's two non-crossings are the same shape
  stopped at 584 iterations by a 600s shutter. **So the question "do these ops
  never recover" is answered: they recover, and the block has a measured length
  — 926.4 seconds from the failed initiation to the first successful one.**

  **And 926.4s is not the 1200s this section predicted, which refutes the clock
  rather than the mechanism.** The reading was that
  `CoreSpace::set_unresponsive` expires the entry at `agent_info.expires_at`, and
  that agent info is minted `created_at + 60 * 20`. nodeA's conductor started at
  `08:08:43` and nodeD recovered at `08:24:48` — **965.3s later**, roughly 235
  seconds before `created_at + 1200s` could possibly have landed, since the
  network is built fresh per trial and nodeA's info cannot predate its own
  conductor. So whatever released the peer, it was not that expiry elapsing.
  The `set_unresponsive` reading stands as a reading of the code and is **not**
  the explanation of the measurement.

  **The second slow trial is the control that narrows it, and it rules out the
  obvious simplification.** `rt60000` trial 4 also logged exactly one
  `Failed to initiate gossip` — and **zero** `No agents to gossip with`,
  recovering in **1.0 second** with 73 successful initiations over the trial. So
  a failed connect does **not** reliably produce the block: it is necessary and
  nowhere near sufficient, and something about the one case escalated it from a
  one-second stumble to fifteen minutes. That trial's own 429.8s crossing is
  slow for some other reason entirely and is not explained here.

  **And the answer was already in the logs, under the filter that was already on.
  nodeA came back under a different URL.** The second of the two guesses in the
  paragraph this replaces — a republish with a fresh expiry, or a changed URL —
  is the right one, and nodeD's own gossip lines say so without any new module:

  | | time | nodeA's peer URL |
  |---|---|---|
  | `Attempting to initiate gossip with` | `08:08:59` | `…/4c86264ee78a92b7…` |
  | `Failed to initiate gossip` | `08:09:21` | *(same)* |
  | `Initiated gossip with` | `08:24:48` | `…/f61381fd9e416d96…` |

  **So the unresponsive entry is keyed by URL, and what ends the block is the
  peer's URL turning over — not the entry expiring.** `set_unresponsive` stores
  against `agent_info.url` (`core_space.rs:268`), `select_next_target` tests
  `get_unresponsive(url)` (`initiate.rs:269`), and when nodeA re-signs its agent
  info with a new URL (`core_space.rs:490-505`, which mints a fresh
  `created_at`/`expires_at` whenever `current_url` is set) the old entry stops
  matching anything nodeD will try. That is why 926.4s bore no relation to
  1200s: **the expiry never came into it.** The 1200s figure is a real constant
  in the code and was simply the wrong constant for this observable — the third
  reading in this investigation to be right about the code and wrong about the
  measurement.

  **What is left is a smaller and better question: why does the URL turn over at
  ~926s?** That is a transport-level event — a relay reconnection giving nodeA a
  new address — and it is the thing worth instrumenting now, where the old
  phrasing of this paragraph would have instrumented a question that had already
  been answered. `core_bootstrap` and `core_space` carry the agent-info
  publication path and both are silenced by the current filter — and
  **`core_space` does log the successful publish**, which a first pass at this
  paragraph denied. `core_space.rs:703` is
  `tracing::info!("Broadcast new agent info to {} peers", ok)`, at INFO, where
  the base `warn` hides it and the module directive lets it through. So the
  turnover batch 8 had to infer from peer URLs becomes a timestamped line on
  nodeA, and lining those up against nodeD's URL change is the whole remaining
  question rather than an inference from it. The failure and prune lines are the
  surround rather than the substance — and that broadcast line doubles as the
  canary for whether the three modules loaded at all, since every other new
  counter fires only on a failure and the first run with the modules read zero
  on all four, confirming nothing. Still cheaper than a ninth batch: eight have
  now produced distributions rather than mechanism.

  **The arms still predict nothing**, for the third batch running: 6-for-6 and
  6-for-6 here, mirrored failures in batches 6 and 7. `roundTimeoutMs` has not
  separated an outcome in 36 trials.

  **A targeted run was dispatched for the URL lead and did not get its event —
  and ruled something out instead.** Run
  [`38045749074`](../../actions/runs/38045749074), `cap_ms=1500000`, first with
  [#227](../../pull/227)'s publication modules live: **12 for 12 crossed**, and
  **zero `No agents to gossip with` in any trial**. The blocking mode simply did
  not occur, so the broadcast-versus-URL comparison it was dispatched to make had
  nothing to compare. Recorded as a run that did not fire rather than as weak
  support for anything.

  **What it did produce is the *other* slow mode, for the second time, at almost
  exactly the same figure.**

  | run | trial | crossing | failed initiations | `No agents to gossip with` | initiations |
  |---|---|---|---|---|---|
  | [`38036069009`](../../actions/runs/38036069009) | `rt60000` 4 | **429.8s** | 1 | **0** | 73 |
  | [`38045749074`](../../actions/runs/38045749074) | `rt60000` 4 | **424.9s** | 1 | **0** | 73 |

  Two occurrences **4.9 seconds apart**, each with exactly one failed initiation,
  no blocking, and the same 73 successful initiations. §9 called the first one
  "slow for some other reason entirely and is not explained here"; it is now a
  *mode* rather than an oddity, and the repeated ~425s is the most specific
  unexplained number in this section. **n is 2, so nothing is built on it** —
  what would confirm a constant is a third at the same figure, and what would
  kill it is one at 200s or 700s with the same signature.

  **And the new modules earned themselves on a trial they were not dispatched
  for, by ruling out the mechanism that was fresh in mind.** nodeA broadcast new
  agent info three times — `10:49:27` to 0 peers, `10:49:28` to 0 peers,
  `10:49:58` to 1 peer — and the crossing was at roughly `10:57:0x`, **some 430
  seconds after the last broadcast.** So this slow crossing is **not** a URL
  turnover. Without `core_space.rs:703` that would have been a guess; with it, it
  is read off the log.

  **The decisive thing about this mode is that nothing was stalled.** Through those
  425 seconds nodeD ran **73 gossip initiations and 144 `NoDiff` rounds**, and its
  fetch chain was busy from end to end — **61 dequeued, 27 sent, 27 answered, 27
  stored**, with sends and stores spanning `10:50:33` to `10:57:07`, the whole
  trial. Ops were crossing continuously. **The claim was simply last.**

  So this is not an outage of gossip, not an outage of fetch, and not a peer
  exclusion. It is one op waiting out twenty-seven others, which makes the
  question **announcement timing or fetch ordering** — why this op is offered or
  requested after everything else — and that is a different question from every
  one this section has asked so far. Each previous mode was something failing;
  this is everything working and one entry at the back of the queue.

  *(The 34 drops in that trial — 61 dequeued against 27 sent, 56% — are the
  background rate established above and are not offered as an explanation: a
  trial dropping 74% crossed in 24.1s. Noted only so the figure is not read as
  new.)*

  *(One contrast worth a line, unexplained and not pursued:
  `rt15000` trial 6 crossed in 44.8s with the fetch queue at **0/0** — it never
  used the queue at all, where the fast trials that do that cross in under 10s.
  A 44.8s crossing with no fetch activity does not fit either the fast
  direct-publish shape or this 425s one.)*

  **The ~425s mode is solved, from logs already on disk, and it is the claim's own
  op being dropped and not re-offered for six minutes.** No new run: the two
  slow trials recorded above were re-read for the one thing nobody had checked —
  the history of **the specific op that was late**, rather than the aggregate
  counters. Both trials carry an identical five-line trace.

  | | batch 8, 429.8s ([`38036069009`](../../actions/runs/38036069009)) | batch 9, 424.9s ([`38045749074`](../../actions/runs/38045749074)) |
  |---|---|---|
  | claim op | `uhCQkqYTstrwlVvodxCelZTW2…` | `uhCQkOVdHZE9H3rFNehExQdB_…` |
  | dequeued | `08:02:20.027` | `10:50:55.394` |
  | *no* `sending fetch request` | **dropped** | **dropped** |
  | dequeued again | `08:08:21.872` — **+361.8s** | `10:57:03.404` — **+368.0s** |
  | *no* `sending fetch request` | **dropped again** | **dropped again** |
  | dequeued, sent | `08:08:29.167` (+7.3s) | `10:57:07.622` (+4.2s) |
  | stored | `08:08:29.186` (+19ms) | `10:57:07.633` (+11ms) |

  Three dequeues each, the first two silently dropped, the third sent and stored
  within milliseconds. **The entire ~425s is one op being dropped and then not
  offered again for ~365 seconds.** Two occurrences, intervals 6.2 seconds apart.

  **This reconciles the contradiction the fetch instrumentation created.** §9
  established above that the drop rate predicts nothing — a trial dropping 74%
  crossed in 24.1s, one dropping 78% did not cross — and that is still true and
  was still the right conclusion from aggregates. What it missed is that the
  aggregate was the wrong unit. **A trial can drop 74% of ops and cross fast
  because the claim's own op was not among them.** When it *is* among them, the
  trial waits out a re-offer. The per-op history explains what the per-trial rate
  could not, and no rate over a trial will ever recover it.

  **The ~365s is a gossip interval, not a fetch one, and the code says why.**
  `CoreFetchConfig` has exactly one field — `parallel_request_count`, default 2 —
  and **no retry timer at all**. On the unresponsive path the op is *removed*
  from the request set (`core_fetch.rs:346`) rather than deferred. So nothing in
  the fetch module will ever come back to a dropped op: a re-dequeue can only be
  a fresh `request_ops` call, which means gossip announced it again. The fetch
  queue has no memory, and that is the whole of why a drop costs minutes rather
  than milliseconds.

  **Which revives the bookmark reading from [#222](../../pull/222), in a narrower
  and better-evidenced form.** That entry proposed that
  `update_new_ops_bookmark` running *before* `fetch.request_ops`
  (`respond.rs:181` then `:187`) could let an op be skipped permanently, and it
  was set aside when the drop turned out not to cause failures. It does not cause
  failures — and it is exactly what a ~365s delay looks like. The bookmark has
  already advanced past the op, so the cheap `new_ops` path will not re-offer it,
  and recovery has to wait for whatever slower mechanism notices the discrepancy.
  **The hypothesis was wrong about the consequence and right about the
  mechanism**, which is the inverse of the error made about the 1200s expiry.

  **And that correlation has now been done, on the same logs, and it names the two
  paths.** Each dequeue sits milliseconds after a specific received gossip
  message, and the pairing is identical across both trials:

  | | first announce | the one that worked |
  |---|---|---|
  | batch 8 | `NoDiff` at `08:02:20.026` → dequeue **+1.5ms** | `Accept` at `08:08:29.164` → dequeue **+3.8ms** |
  | batch 9 | `NoDiff` at `10:50:55.391` → dequeue **+3.0ms** | `Accept` at `10:57:07.615` → dequeue **+7.0ms** |

  Two different messages, so two different call sites. A received `NoDiff` goes
  through `respond/no_diff.rs` into `handle_accept_response`
  (`respond.rs:187`) — the bookmark path. A received `Accept` goes through
  `respond/accept.rs:52`, which calls `request_ops` directly on
  `accept.new_ops`. **So the op is first offered by one mechanism, dropped, and
  then only ever re-offered by the other.** The bookmark path does not bring it
  back, which is what [#222](../../pull/222)'s reading predicted and what this
  pairing now shows rather than infers.

  **The asymmetry in which side started the round is real, and the explanation
  first built on it was wrong — measured and discarded in the same sitting.**
  Read off the state machine, a node receiving `NoDiff` is the one that
  *accepted* a round (`no_diff.rs` rejects an unsolicited one by checking
  `accepted_round_states`) and a node receiving `Accept` is the one that
  *initiated* (`initiated_round_state`, `initiate.rs:105`), so the op was
  announced to nodeD in a round nodeD did not start and delivered in one it did.
  The tempting next step was that the ~365s is therefore nodeD's initiation
  cadence toward that peer. **It is not, and the logs say so flatly:**

  | nodeD's initiations toward nodeA in the 424.9s trial | |
  |---|---|
  | count | **73** (against 1 toward nodeB) |
  | median gap | **5.5s** |
  | maximum gap | **6.0s** |

  nodeD initiated with the right peer every five or six seconds, without
  interruption, straight through the stall. **So the op sat undelivered across
  roughly sixty rounds with the peer that had it**, and the delay cannot be a
  cadence of anything nodeD does.

  **Which moved the question onto what nodeA puts in those sixty Accepts — and
  that is measurable from the same logs, which a first pass at this paragraph
  wrongly said needed a new instrument.** `new_since` and `updated_new_since` are
  printed in the message structs already. nodeD's bookmark toward nodeA across
  the whole trial took exactly two values:

  | `new_since` nodeD sent to nodeA | occurrences |
  |---|---|
  | `1791629412967360` | 2, at `10:50:34` and `10:50:35` |
  | `1791629434400057` | **71**, from `10:50:40` through `10:57:07` |

  **It advanced once, forty seconds in, and never moved again — including on the
  round that finally delivered the op.** The sixty rounds that omitted the op and
  the one round that carried it were sent with the *same* `new_since`.

  **So the bookmark is not the discriminator, and
  [#222](../../pull/222)'s ordering is finished as an explanation for this
  delay.** `retrieve_new_op_ids(&common_arc_set, since: accept.new_since, …)`
  (`respond/accept.rs:86`) was handed an identical `since` and returned the op
  once, then not for six minutes, then again. Same input, different output: the
  cause is in the other argument or in nodeA's store, not in the bookmark. That
  reading survived two entries on the strength of being mechanically plausible,
  and it is retired here on a measurement rather than on another plausibility.

  **What is left, and it is narrower than anything this section has had.** The
  remaining variable in that call is `common_arc_set`, which `update_storage_arcs`
  moves as snapshots are exchanged — so the candidate is that the op fell outside
  the common arc for those six minutes and came back inside it. **Not
  established**, and the honest statement of its difficulty is that arcs are the
  one input to that call which nothing currently prints.

  **The byte budget is eliminated, and eliminating it exposed that the previous
  entry retired the wrong hypothesis on the wrong test.** Both corrections are
  recorded here because the second is the finding.

  **First, the budget, dead in one grep.** `accept.max_op_data_bytes` is
  **constant at 104,857,600** — 100 MiB — across all 289 occurrences in the
  trial, and `respond/accept.rs`'s own `"Used {}/{} op budget to send {} op ids"`
  line shows actual consumption of **340 to 13,769 bytes**. nodeA's dominant line
  is `Used 3219/104857600 op budget to send 10 op ids`, 136 times. The limit is
  never approached, so `respect_size_limit_for_new_ops` truncation cannot be
  withholding anything. Checked before being written up as a candidate, which is
  the only reason it cost a grep instead of an entry.

  **Second, and this is the correction: the bookmark hypothesis is reinstated,
  with a timestamp.** The entry above retired
  [#222](../../pull/222)'s `update_new_ops_bookmark` ordering on the grounds that
  nodeD's `new_since` was *constant* across the rounds that omitted the op and
  the round that delivered it. **Constancy was the wrong test.** The question is
  not whether the bookmark moved; it is whether the op is **older than** it:

  | | value | wall clock |
  |---|---|---|
  | claim created (t0 = delivery − 424.9s) | — | **≈10:50:02.7Z** |
  | `new_since` nodeD advertised from `10:50:40` | `1791629434400057` | **10:50:34.400Z** |

  **The op is roughly 32 seconds older than the bookmark nodeD was advertising.**
  So `retrieve_new_op_ids(&arc, since: 10:50:34.400, …)` was never going to
  return it — not once in sixty rounds, correctly, because nodeD had told nodeA
  it already held everything up to 10:50:34.4. nodeA was not withholding the op.
  **nodeD had disclaimed it**, at `10:50:40`, while that very op sat in its fetch
  queue waiting to be dropped.

  That is `respond.rs:181` advancing the bookmark before `respond.rs:187`
  requests the fetch — [#222](../../pull/222)'s reading — and the six minutes of
  silence is not a delay in offering the op but the correct behaviour of a peer
  answering the question it was asked.

  **And the "same input, different output" argument that retired it was comparing
  two different tracks.** The first offer arrived on a received `NoDiff` and the
  delivery on a received `Accept`, which the entry above establishes are different
  call sites — and they are also fed by **different `since` values**, built by
  different responders in different messages. Holding one track's `new_since`
  constant and then pointing at the other track's delivery is not a controlled
  comparison, and it read as one. The error is recorded rather than quietly
  fixed because it is the same error this section has made before in a different
  dress: a figure that was genuinely constant, carrying an inference it could not
  support.

  **The batch 8 trial carries the same relation, and shows the before-and-after
  this one could not.** Its t0 is `08:01:19.367Z`, and nodeD advertised three
  distinct bookmarks to nodeA:

  | `new_since` | wall clock | vs t0 | rounds |
  |---|---|---|---|
  | `1791619261876925` | `08:01:01.876Z` | **t0 −17.5s** | 4 |
  | `1791619327008021` | `08:02:07.008Z` | **t0 +47.6s** | **68** |
  | `1791619702882175` | `08:08:22.882Z` | t0 +423.5s | 1 |

  **It begins below the op's timestamp, advances above it, and stays above for
  all 68 rounds of the stall.** That is the disclaimer happening in the record
  rather than reconstructed from a single value, and it is why batch 8 is the
  better of the two traces: batch 9's bookmarks were *both* above its t0
  (+10.3s and +31.7s), so that trial can show the silence but not its onset.
  **n is 2 for the silence.**

  **What it does not explain is the delivery, and the arithmetic says so
  sharply.** In batch 8 nodeD sent its highest bookmark — `t0 +423.5s`, which
  excludes the op by a wide margin — at `08:08:29.138`, received an `Accept`
  26ms later at `.164`, and dequeued the op at `.167`. **So nodeA put the op in
  an `Accept` answering an Initiate whose bookmark disclaimed it.**

  **Both explanations offered for that have now been read in the source, and both
  are false.** `respond/initiate.rs:110` passes
  `Timestamp::from_micros(initiate.new_since)` into `retrieve_new_op_ids` — so
  the Accept's `new_ops` **is** built from the Initiate's bookmark, not from
  something else. And `get_request_new_since` at `:105` — nodeA's own stored
  bookmark for nodeD — feeds only the *outgoing* `new_since` field at `:135`,
  never the retrieval. Nor is a fetch-level retry hiding the third dequeue:
  `core_fetch.rs:195`, inside `request_ops`, is the **only** producer for the
  outgoing queue, so three dequeues are three distinct announcements and the
  queue has no memory, as recorded above.

  **That assumption was mine, it has now been read, and it was wrong — so the
  arithmetic in this entry is measuring the wrong clock.**
  `kitsune2_api-0.5.0/src/op_store.rs:126` documents the predicate exactly:

  > The `start` timestamp is used to retrieve ops by their **`stored_at`**
  > timestamp rather than their **creation** timestamp. This means that the
  > `start` value can be used to page an op store.

  So `new_since` is a **pagination cursor over the serving peer's store**, keyed
  on when *that peer stored* each op — not a statement about what the requester
  possesses, and **not comparable to t0**, which is when the claim was authored.
  Every "the op is ~32 seconds older than the bookmark" comparison above puts a
  creation time next to a `stored_at` cursor.

  **What survives, and it is the structural half.** The ordering
  [#222](../../pull/222) identified is still there in the code and needs no
  arithmetic: `respond.rs:181` records the returned cursor and `:187` then
  requests the fetch, so **the cursor advances whether or not the op is ever
  fetched** — and `retrieve_op_ids_bounded`'s own doc says that returned value
  "should be used as the `start` value for the next call", which is precisely
  what makes an unfetched op unreachable on that track afterwards. The observed
  pattern survives too: cursor low, op announced, op dropped, cursor high for 68
  rounds, silence.

  **What does not survive is the proof.** "The op was older than the bookmark"
  is no longer established — it may well be true, and these logs cannot say,
  because nodeA's `stored_at` for that op is not in them. The same dissolves the
  delivery contradiction: an `Accept` built from a high cursor can legitimately
  carry the op if nodeA's `stored_at` for it is higher still, which an authored
  op's integration path could easily make true.

  **So this entry ends weaker than its middle reads, deliberately.** The
  mechanism is a cursor that advances past unfetched ops — structural, and
  argued from code. The timestamps were the wrong comparison and are retained
  only as the record of how the reading was reached. **Establishing it needs
  nodeA's `stored_at`**, which nothing currently prints and which is the one
  measurement this whole thread has been circling.

  **The clock has a name, and it is Holochain's integration pass.** The entry
  above retracted its arithmetic on finding that `new_since` pages the serving
  peer's store by `stored_at` rather than by creation time. Holochain's
  implementation says what `stored_at` is:
  `holochain_p2p-0.7.0/src/op_store.rs:305` calls it **"the integration
  timestamp"** in its own comment, and the query beneath it is
  `op_ids_since_time_batch(arc_start, arc_end, cursor_t, 500)`.

  **So the value deciding whether a peer offers an op is when that peer
  integrated it** — and on the node that *authored* the claim that is not the
  moment of authoring: `integrate_dht_ops_workflow` is a separate workflow with
  its own `when_integrated = Timestamp::now()`. Every reconstruction in this
  thread used t0, the authoring moment, which is why the arithmetic had to go.

  **Instrumented, with the limit first.** The workflow logs
  `tracing::debug!(?changed, %ops_ps, "ops integrated")` — **a count, never op
  identities** — so the filter now carries
  `holochain::core::workflow::integrate_dht_ops_workflow=debug` and the census
  counts `ops integrated`. That yields, per node, **when each integration pass
  ran and how many ops it took**, and yields nothing about any particular op's
  `stored_at`. `holochain_p2p`'s op store has only `warn!` lines, so no filter
  reaches per-op integration times; that needs Holochain patched.

  **Why a proxy is still the right measurement here.** A `peering-rate` trial is
  a fresh network carrying one claim, so an integration pass at t0 against one at
  t0+423s is exactly the discrimination the ~425s mode needs, and the counts
  bound which pass could have carried the claim.

  **And the honest ceiling on this line of work, recorded before it is reached.**
  This is the **third** instrument added to chase one mode, and its output is a
  proxy rather than the value. If integration-pass timings do not discriminate,
  the next step is patching Holochain to log per-op integration times — a
  different order of effort — and the better move at that point is an upstream
  report built on what is established: that a dropped fetch leaves an op
  unreachable on the track whose cursor has advanced past it, which is
  structural and argued from code rather than from any of the timestamps this
  thread has had to withdraw.

  **The integration instrument answered its question on the first run that used
  it, and the answer is the branch that keeps the puzzle open.** Run
  [`38055534977`](../../actions/runs/38055534977), 12 for 12 crossed at the 1500s
  cap, with **both** slow modes present in one batch: `rt60000` trial 4 at
  **929.1s** carrying the blocking signature (1 failed initiation, **894**
  `No agents to gossip with`, zero `NoDiff`), and `rt60000` trial 5 at **415.0s**
  carrying the other one.

  **Trial 5 is the first ~425s instance with no failed initiation at all** — 79
  initiations, zero failures, zero `No agents to gossip with`, 56 dequeued
  against 27 sent. So the failed connect that accompanied both earlier instances
  is **not** part of this mode. It was a coincidence of two samples.

  **What the instrument established, and this is what it was built for.** nodeA's
  integration passes in trial 5 run from `13:49:58` to `13:50:44` and then
  **stop entirely** for the remaining seven minutes. With t0 ≈ `13:50:39.6`
  (delivery minus 415.0s), the pass that logged `changed=11` at `13:50:44.309`
  is the one that took the claim — **roughly 4.7 seconds after it was
  authored.** So integration on the authoring node is **early**, it never moves
  again, and the possibility that this mode is integration lag — which the
  harness's own 0.0s check could not have seen, since it reads the link index
  rather than the DHT op store — is **ruled out.**

  **And the arithmetic then landed on a coincidence worth stating precisely.**
  nodeD advertised exactly **one** cursor to nodeA across the whole trial:
  `1791640244306176`, which is `13:50:44.306176Z`. The claim's integration
  timestamp is recoverable because `ops_ps` is logged alongside `changed`, so the
  pass duration is `changed / ops_ps` and `when_integrated` — captured at
  workflow start, logged at its end — is the log time minus that:

  | pass logged | changed | elapsed | `when_integrated` ≈ |
  |---|---|---|---|
  | `13:50:30.389Z` | 1 | 2.2ms | `13:50:30.387Z` |
  | `13:50:39.395Z` | 6 | 1.7ms | `13:50:39.394Z` |
  | **`13:50:44.308Z`** | **11** | **2.8ms** | **`13:50:44.306Z`** |

  **The op's `stored_at` and the cursor nodeD advertises are the same
  millisecond.**

  **Which looked exactly like a boundary race, and is not one.** The obvious
  reading is that an op landing on the cursor falls on the excluded side and is
  stranded — a tidy explanation for a seven-minute silence. **The SQL says
  otherwise.** `holochain_data-0.7.0/src/dht/inner/sync_queries.rs` builds
  `op_ids_since_time_batch` with `ChainOp.when_integrated >= ?` — **inclusive**,
  for both the `ChainOp` and `WarrantOp` arms, ordered `when_integrated ASC`.
  An op whose timestamp equals the cursor is **returned**. Reading that one line
  is the only reason this entry is not a confident write-up of the wrong
  mechanism.

  **So the mode is sharper and still unexplained.** What is now measured: the op
  was integrated early, its timestamp is fixed, it sits at or just after the only
  cursor nodeD ever advertised, and the retrieval predicate includes that
  boundary. **The op was eligible to be offered on every one of those rounds and
  was not delivered for seven minutes.** That is a narrower statement than this
  thread has managed before and it is not an explanation.

  **The blocking mode, meanwhile, is at n=4 and its recovery clusters.** Two
  trials hit the 600s cap in batch 7, one recovered at 943.0s in batch 8, and
  this one at 929.1s — the two measured recoveries **14 seconds apart**. Recorded
  because a second figure near 930s is the sort of thing that becomes a constant
  on a third sample, and because this mode has a mechanism already (one failed
  connect, the peer skipped, recovery on a URL turnover) where the 415s mode does
  not.

  **This is where this line of work should stop, and the stopping rule written
  one entry above is the reason.** The instrument discriminated — integration lag
  is out, which is a real result — and the remaining question needs per-op
  retrieval tracing inside Holochain's SQL layer, which means patching Holochain.
  **What is established and worth reporting upstream is the structural half**:
  `respond.rs:181` advances the new-ops cursor before `:187` requests the fetch,
  so a fetch that is dropped — and `core_fetch.rs:346` drops silently, with no
  log line — leaves an op whose re-offer depends on a cursor that has already
  moved. Four timestamp arguments have been built on top of that and withdrawn;
  the code reading has not moved once.

  **And this entry's own CI produced a fourth slow baseline, which could not be
  analysed — so the archiving gap is closed in the same change.** The
  `network` job on [#233](../../pull/233) failed with
  `partition-rejoin`'s Phase 0 baseline at **175.4s**, the harness printing
  `THE 175.4s IS THE FINDING, not this cap` and reporting the divergence
  assertion INCONCLUSIVE, exactly as the 426.0s occurrence did at the top of
  this section. The poll trace is unambiguous — zero at t+170s, one at t+175s.

  **175.4s is also the second crossing near 176s**, after the `real-gossip`
  forward leg of 176.8s recorded further up, on a different harness. Two figures
  1.4 seconds apart, and no claim built on them: this section has a ~425s pair
  and a ~930s pair already, and a third coincidence is a reason to keep counting
  rather than to start explaining.

  **What could not be done is the thing that worked all day on `peering-rate`.**
  The claim op's fetch history — dequeued, dropped, re-offered — is how the ~425s
  mode was characterised, and it needs the conductor logs. `network.yml` had no
  artifact: it tailed **100 lines per log, on failure only**, and because each
  harness step cleans `/tmp/epi-net` first, those tails describe the last
  harness alone. Of the fetch entries that mattered, **25 survived**.

  **Failure-only archiving would not have been enough either, and that is the
  part worth stating.** The most informative `network.yml` runs today were
  **green**: the 176.8s forward leg and the 50.1s baseline both passed, inside
  their windows, and both are unrecoverable. §9 already records this mistake in
  an earlier dress — the first flake batch saved conductor logs only when
  `wrong peer` matched, *"which is exactly why the run that mattered was lost"*.
  So `network.yml` now archives both harnesses' logs **on every run, pass or
  fail**, at 14 days' retention.

  **Which means this occurrence is recorded as a sighting and not as evidence**,
  and the next one will be analysable. That asymmetry — a mode with three
  instruments on it and a harness that threw the logs away — is the sort of thing
  that stays invisible until a red run asks for the one file nobody kept.




  **So the account is half closed, and the halves should not be run together.**
  The six minutes of silence is explained at n=2: nodeD disclaimed the op and
  nodeA correctly withheld it. The delivery is **not** explained, and the
  obvious-looking story — "the bookmark eventually let it through" — is the one
  thing these timestamps rule out.


  **Still n=2, and one thing in the trace remains unaccounted for.** The middle
  dequeue — `08:08:21.872` and `10:57:03.404` — has no received message within a
  second of it in either trial, where the other two couple within 7ms. Both were
  dropped, so neither mattered to the outcome, and neither is explained. Recorded
  rather than smoothed over: a trace with three dequeues and two explanations is
  not a trace with three explanations.






  **Superseded by batch 5, and kept because the reasoning it records is what the
  batch was run to settle.** The integration caveat below was "the only thing
  between this and an upstream report" when written; it is now closed, and what
  stands between this and an upstream report is the fetch queue being invisible
  rather than the integration premise being unmeasured.

  **The integration caveat still stands and is now the only thing between this
  and an upstream report.** The harness confirms `create_claim` returned on
  nodeA; it does not confirm nodeA integrated the op into the shard gossip
  offers from. Across three trials and roughly 180 completed rounds spanning
  five minutes each, an integration lag is not a credible explanation — but it
  is still an assumption rather than a measurement, and closing it means having
  nodeA read its own claim back before the clock starts.

  **It also points away from gossip and towards transport.** `iroh connect timed
  out` is a QUIC-layer failure, and `MultipathNotNegotiated` — 2 to 4 occurrences
  in population B against 1 in A — is `noq_proto`, below kitsune2 entirely.
  Neither is something this protocol's validation, friction or arc logic can
  cause or fix.

  **And the "21 runs, no failures" figure was an artefact of this entry's own
  warning.** It was read off `gh run list`, which cannot see a failure that was
  re-run — and this session re-ran four of them. So the headline claim was wrong
  *because of* the hazard documented in the same paragraph: the only numbers
  worth anything here are the ones captured before pressing re-run, which is why
  the table above exists and why it is the first honest measurement of this
  distribution.

  **AND THE RECORDED HISTORY UNDERCOUNTS, BECAUSE RE-RUNNING A FAILED JOB
  OVERWRITES ITS CONCLUSION.** `gh run list` shows two `network` failures in the
  project's history, both from 2026-10-06. That is not the real number: every
  failure that was re-run — #190, #191, #192 and the one below — had its
  conclusion replaced by the re-run's, so the evidence of the failure rate was
  destroyed by the act of remediating it. The honest figures come from what was
  observed at the time, not from the run list, and anyone computing a flake rate
  from GitHub's API here will get a number that is too low by however many times
  somebody pressed re-run. Worth knowing before trusting that endpoint for any
  reliability claim.

  **The one post-fix failure is not either known cause, and that is the open
  thread.** `real-gossip`'s crossing never happened inside 330s, with
  `iroh connect timed out` at **zero** — so not the transport class that
  explained four of five non-crossings — and `Initiated gossip with` at
  **70**. A node that initiated seventy times in 330 seconds and still never
  received the entry rules out "it needed to retry more often", which is exactly
  what the lowered interval bought. It is one occurrence, which by this
  section's own standard is not a finding; the census is instrumented to
  recognise it if it recurs.

  **So the band is not a bug — it is a configured default**, and
  `partition-rejoin`'s three baseline failures today (125.3s, 125.3s, 120.3s)
  were the same default, on a harness that never varies `roundTimeoutMs`.
  `scripts/network.sh` now sets `initiateIntervalMs`, `initiateJitterMs` and
  `minInitiateIntervalMs` for the local test network. All three are needed, not
  just the first: `initiate_interval_ms`'s own doc comment says a low value only
  produces a burst, after which "when it has run out of peers, it will idle for
  a while" — bounded by the 300s per-peer floor, which on a four-node network is
  what actually binds.

  **The non-crossings decompose too, and only one of them is a gossip problem.**
  Counting `iroh connect timed out` per trial: **0 of 12** band trials, 1 of 8
  fast, 4 of 5 middle — and **4 of the 5 non-crossings**, which are precisely
  the four mode-1 trials. Those four are a *transport* failure (`iroh connect
  timed out`, `MultipathNotNegotiated`): gossip never gets a connection, which
  is why it sent one `Initiate` and went quiet. The single mode-2 trial has
  **zero** transport errors and is the only case left where gossip ran
  correctly — eight complete rounds, all concluding `NoDiff` — and was wrong.

  **And then the `NoDiff` trial turned out to be correct behaviour too, which
  removes the last candidate defect.** The paragraph that stood here called it
  "the only case left where gossip ran correctly and was wrong". It is not, and
  the check that settles it is a clock comparison the earlier reading skipped.

  Mapping peer URLs to nodes (each URL appears in exactly two logs — its owner's
  and its partner's — which pins all three uniquely) gives nodeD's partners as
  nodeA and nodeB. Then, against nodeD's own conductor clock:

  | nodeD.log offset | round | the entry existed? |
  |---|---|---|
  | 9.4s | `NoDiff` with **nodeA** | **no** — created at 17.0s |
  | 9.7s | `NoDiff` with **nodeA** | **no** |
  | 136.7s | `NoDiff` with nodeB | yes |
  | 263.9s | `NoDiff` with nodeB | yes |

  **Both rounds with the node that held the entry predate the entry.** They
  correctly reported no difference. After it existed nodeD gossiped only with
  nodeB — and whether *those* `NoDiff`s were right depends on whether nodeB had
  yet received it from nodeA, which nodeD's log cannot say. Nothing here
  demonstrates a wrong answer.

  **Why nodeD never asked nodeA again is the same constants as the band.** It
  initiated with nodeA at 3.5s and 9.5s, so `min_initiate_interval_ms` (300s,
  per peer) barred it until ~309s, and `initiate_interval_ms` put its next
  attempt past the 330s cap. It spent both of its nodeA initiations in the first
  ten seconds, before there was anything to fetch.

  **What that leaves: nothing for upstream.** The question "why does a node join
  the DHT and exchange nothing" was two phenomena wearing one name — the
  initiation constants (the band, and the `NoDiff` trial) and `iroh connect
  timed out` (four of the five non-crossings). Neither is a kitsune2 gossip
  defect. `scripts/network.sh` addresses the first for this repo's test networks
  and `partition-rejoin`'s baseline went from 125.3s to **10.0s** on that change;
  the second is a transport-layer observation, and a 2-vCPU runner on loopback
  is a plausible enough cause that it is not worth filing as a bug either.

  **So this entry closes, and the honest summary of how is that nothing was
  found to be broken.** Four hypotheses were falsified before this session and
  five more during it — the 300s reading, the 320-line outlier, the
  never-initiated reading, the cadence reading, and this `NoDiff` one. Every one
  failed the same way: a pattern read off a run with too few controls, or in
  this case off a log without checking a clock. What the question actually was,
  all along, is a test network running a protocol tuned for the open internet.

- **Cross-internet peer discovery has one measured crossing, after a lifetime of
  having none.** This was recorded for the
  life of the repository as the one thing nobody could check: every verification
  here is one machine, `sandbox.sh` being a single conductor and `network.sh`
  three or four against a bootstrap and iroh relay on 127.0.0.1. Loopback peers
  establish that gossip works and nothing whatever about peer *discovery* across
  NATs through a public rendezvous.

  **What made it testable was noticing that two CI jobs are two machines.**
  GitHub gives each job its own VM with its own address and no network path to
  the other — which is the situation two people installing the `.webhapp` are
  actually in. So `.github/workflows/cross-internet.yml` runs a matrix of two:
  one publishes an entry, the other polls for it, and **the DHT is the only
  channel between them**. They agree on a network seed and a domain by both
  deriving them from `github.run_id`; that is the entire coordination mechanism.

  **The infrastructure is Holochain's own default**, read out of
  `holochain_conductor_api-0.7.0/src/config/conductor.rs` rather than picked:
  bootstrap `https://dev-test-bootstrap2.holochain.org`, relay
  `https://use1-1.relay.n0.iroh-canary.iroh.link./`. A node started by
  `scripts/cross-internet-node.sh` therefore joins by the same path a Launcher
  install would — the path that was never exercised.

  **The seed is a safety requirement, not hygiene, and the script refuses
  without one.** The shipped `.happ` declares no network seed, so every
  installer lands on one shared DHT. Testing on that DHT would write test
  entries into the network real users join, and **Invariant #6 means they could
  never be removed.** A run-unique seed gives a genuine crossing of the public
  internet through public rendezvous infrastructure while writing nothing
  anywhere it cannot be taken back.

  **Two design points exist because the obvious version produces false
  negatives.** Setup takes 8–10 minutes and varies by a couple between runners,
  so both jobs wait until a fixed offset past the run's own `created_at` before
  starting their windows — otherwise a slow publisher and a fast reader miss
  each other and report a discovery failure that never happened. And the
  publisher **holds** for the whole window: Holochain is not a server, so once
  the publishing conductor exits there is no peer holding the entry, and a
  publisher that exited on success would produce exactly the reader-side failure
  being measured.

  **It is an experiment, never a gate**, for the reason `peering-rate` is: it
  depends on two third-party services, and either being down or rate-limiting a
  runner produces the same observable as a protocol fault. A red run is a prompt
  to read the conductor logs, which upload on `always()`.

  **IT RAN TWICE AND CROSSED BOTH TIMES, EACH INSIDE ONE POLL.** Run
  `37564173490`, two jobs:

  | | publisher | reader |
  |---|---|---|
  | DNA hash | `hC0kdkvws+au+3nTMDR8tirf…` | **identical** |
  | agent key | `hCAkZlX7D7U0J+VmQuhjKRy3…` | **different** |
  | | published into `XNet37564173490` at 03:07:03.70 | `t+0s` nothing · **CROSSED in 5.0s** at 03:07:09.14 |

  All three of the checks this harness prints for exactly this purpose are
  clean: the two hosts reported the **same DNA hash**, so they were genuinely on
  one DHT; **different agent keys**, so it was two nodes rather than one
  conductor finding its own entry; and the bootstrap was answering, with
  `cross-internet-node.sh` confirming the generated config actually named the
  public services rather than silently falling back to localhost. The crossing
  took one poll interval — discovery through
  `dev-test-bootstrap2.holochain.org`, NAT traversal via iroh's canary relay,
  and the gossip of a single entry, all inside five seconds between two machines
  that had never heard of each other.

  **This is the first evidence in this repository's life that any of it works
  off one machine.** Forty-three harnesses preceded it and every one ran on a
  single host.

  **Run `37567632325` repeated it**: crossed on the first poll again, same DNA
  hash on both hosts, different agent keys, both jobs green. Two for two, and
  the aligned-start coordination worked twice rather than having happened to
  line up once — which was the other thing a second run was for.

  **"5.0s" IS THE POLL INTERVAL, NOT A LATENCY, and the first write-up of this
  got that wrong.** `cross-internet.mjs` polls every 5s, and both runs found the
  entry on the first poll after `t+0s`. So the crossing took *somewhere between
  0 and 5 seconds* and the harness cannot say where — exactly the distinction
  `peering-rate.mjs`'s header already draws about its own 3.0s figures ("the
  fast times are poll granularity, not latency"). Two runs bound it under five
  seconds; neither measures it.

  **Three things this does NOT establish, and they matter more than the result.**
  **Two runs** show the crossing can happen and are nowhere near a rate. Those were two **datacentre VMs with public addresses and good
  connectivity** — two laptops behind consumer routers is the harder case, the
  one relays exist for, and it is still unchecked; INSTALL.md says so to users
  rather than claiming their case is covered. And the publisher **held** for the
  whole window, so this measured discovery-then-gossip with both peers up, which
  is not a node that was offline coming back.

- **There is no Android or iOS build, and the blocker is one version upstream.**
  Holochain 0.7 is the release that made iOS possible at all — it added wasmer's
  wasmi interpreted backend, which satisfies Apple's prohibition on hot-loading
  binaries, the thing that had kept Holochain off iOS for years. So the substrate
  is ready and the UI is ready: `mobile-ui/` is responsive, PWA-installable, and
  already adapts to being hosted rather than configured, so a mobile shell would
  load it unchanged.

  **What cannot get there is the packaging.** The desktop installers are
  Kangaroo builds — Electron — and Electron does not target mobile, so this is a
  separate project on Tauri 2 plus `tauri-plugin-holochain` rather than an extra
  entry in a build matrix. **Re-checked 2026-10-07 and still
  true:** every branch of that plugin pins `holochain_types = "0.6"` — `main`,
  `develop`, `main-0.6` and `main-0.6.1` (at `0.6.1-rc`) — there is no 0.7
  branch, and the repository has had no push since **2026-07-16**. (The reading
  dated 2026-09-12 said `main` was last updated 2026-05-15; that was its last
  merge commit, not the repository's last push.) These zomes pin
  `hdk = "=0.7.0"`; a 0.6 conductor cannot run them. iOS is unclear even at 0.6
  — Android is supported, every iOS reference says "in development", and that
  project's own iOS how-to page 404s. It is also source-available rather than
  open source, which is why a licence question was recorded here as preceding
  the technical one — see below for why that is no longer the question.

  **Both questions were asked, and both came back answered** — by Paul d'Aoust in
  the Holochain chat on **2026-09-14**, which is also the standing answer to this
  section's own instruction to re-check the dated claims above rather than trust
  them. *When is a 0.7 branch expected* has no answer from darksoil, because
  darksoil have shifted from building tools for Holochain developers to building a
  couple of p2p applications full-time, and nobody could confirm who is
  maintaining the shipyard tool. `tauri-plugin-holochain` is believed to be the
  core of p2p shipyard and would be the core of iOS support too — offered
  explicitly as not certain, and recorded that way. **Waiting for an upstream 0.7
  branch was therefore never a plan**; Android is a priority on the Holochain side
  and has been discussed there with some urgency. *Is iOS shipped* is no: there is
  no official support, but it is not undemonstrated either — two people have it
  working independently, one of them with an LLM's help. So the honest status is
  unpaved rather than impossible.

  **And the first account of what unblocks it was wrong — corrected eight days
  later by the same person who gave it.** The first report, on 2026-09-15, was
  that Holochain had *forked* darksoil's Tauri plugin, updated it to 0.7, and was
  waiting on darksoil to consent to distributing it. The correction, on
  2026-09-23: not a fork. It is a **cleanroom implementation** of their own, and
  the only thing being asked of darksoil is **permission to use the name** of the
  now-outdated library.

  **That distinction is load-bearing rather than pedantic, and it retires the
  blocker this section recorded.** A fork awaiting consent to distribute is
  blocked on a copyright licence to somebody else's source — which is exactly the
  "licence question precedes the technical one" recorded above. A cleanroom
  implementation awaiting permission to reuse a name is blocked on something
  trademark-shaped: a different question, with a different answer, and no bearing
  on whether the code may ship at all. The source-available licence still governs
  *darksoil's* code; it governs nothing about the replacement. **Note the word
  that carried the error both times — "apparently".** Both reports were secondhand
  and said so, and on the first one that label was the only accurate part. A
  dependency's status arriving through a third party is worth recording with its
  date and its source precisely because this is how it goes wrong.

  **The one concrete opening here was offered rather than found, and nobody has
  taken it.** The same conversation suggested asking the two people who already
  have iOS working whether they would share their source, while the official path
  is still being built. That is the only step in this entire item that does not
  wait on somebody else's schedule or somebody else's permission — which is reason
  enough to record it as an action rather than as background.

  **The darksoil migration itself has now been measured, which matters only as a
  fallback — the official path is a cleanroom implementation and does not need
  it.** Recorded because the size was never known, and an unknown cost is how
  "blocked upstream" turns into "assumed impossible".

  `holochain_runtime` — the sibling crate in darksoil's repository where the
  conductor is actually embedded, 14 files and ~84KB of Rust — was taken at
  `main`, migrated to 0.7, and compiled: **`cargo check` exits 0**. Both wasmer
  backends build, including **`wasmer-wasmi`**, the interpreted backend this
  section credits with making iOS possible at all; it is confirmed present in
  0.7's feature list. The delta is ~70 lines, kept as [`docs/holochain-runtime-0.7.patch`](docs/holochain-runtime-0.7.patch) — committed rather than left on one machine, because a measured figure with no artefact behind it is the kind of claim this repository does not keep. That file states what it is verified to do (`cargo check`, both backends) and what it is not (anything at runtime):

  | kind | change |
  |---|---|
  | versions | `holochain`, `mr_bundle`, `holochain_types`, `holochain_keystore`, `holochain_conductor_api`, `holochain_util` 0.6.1 → 0.7; `holochain_client` 0.8 → 0.9; `lair_keystore_api`/`lair_keystore` 0.6.3 → 0.7 |
  | features | `wasmer_sys` → `wasmer-sys` **plus** `wasmer-sys-cranelift`, since 0.7 requires a compiler sub-feature; `transport-iroh` dropped, iroh no longer being optional; `holochain/sqlite` gone and `sqlite-encrypted` → `holochain/encryption` |
  | pins | the `ed25519`/`pkcs8` hard pins removed — their own comment said to drop them once `iroh-base-holochain` unpinned, and 0.7 uses `kitsune2_transport_iroh` 0.5, so that crate has left the tree |
  | source | `InstallAppPayload` gained `restore_from_dht: bool` → `false`; `CoordinatorZomeDef::wasm_hash()` removed, replaced by matching `as_any_zome_def()` for `WasmZomeDef.wasm_hash` and returning `ZomeError::NonWasmZome` exactly as 0.7's own `get_wasm_zome_hash` does; `Conductor::shutdown(self: Arc<Self>)` now takes the Arc by value and needs a `.clone()` |

  Three source edits and one helper. The lair bump alone cleared three of the
  seven original errors, all of them "expected `LairClient`, found a different
  `LairClient`" — two lair versions in one tree rather than an API change.

  **What this does not establish, since the gap is the entire remaining risk.**
  `cargo check` is not a build, not a test run, and no evidence anything works at
  runtime. Only `holochain_runtime` was migrated; `tauri-plugin-holochain` itself
  is untouched, as are `hc-pilot` and the scaffold crates. **No mobile artifact
  was produced and none could be here** — iOS cannot be built on Linux at all,
  and this machine has no JDK, Android SDK/NDK, `adb` or Tauri CLI. It bounds a
  cost; it does not move the roadmap.

  **Two consequences to weigh even once it is unblocked**, neither of them a
  packaging problem: mobile nodes run **zero-arc**, so they hold and serve no DHT
  data and depend on reliable full-arc peers — and cross-internet peer discovery
  now has **one measured crossing** (5.0s, two datacentre VMs — not the
  consumer-router case; see the §9 entry below). And the desktop
  builds are unsigned today, which is survivable for sideloading and impossible
  for the App Store.

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
  **What was proposed to replace it, and why it was then rejected too.** The successor named at removal time was non-transferable regenerating capacity: one per-agent budget, spent at differing rates by differing acts, refilling over time, unable to move between agents. The biology argued for it — cells do not trade ATP, metabolic energy is local, and when ATP itself crosses a membrane it *stops being energy and becomes signal* (purinergic signalling); this protocol's signalling layers are the parts that work, and the currency layer made energy itself transferable, the one thing metabolism does not do. **How far that licenses the metaphor is bounded deliberately:** it may rule mechanisms out; it has not earned the right to specify one, since letting a metaphor propose rather than veto is how the burn tier arrived in the first place. The docs brief §5.1 records that limit and one live tension it creates — the purinergic cascade *inverts* its signal (CD39/CD73 degrade ATP to adenosine, which acts on opposing receptors), while this protocol deliberately has no inverting signal at all, §9's "synaptic plasticity" item having rejected one as a disguised downvote under Invariant #1. Noticing the correspondence is not evidence for building it. It also dissolved every technical problem the ledger had: no transfers means no double-spend and no global balance, and it never needs to answer a question about another agent, so it has no leaderboard surface at all. **It was nevertheless not built**, once the question it depended on was actually answered: *which act should cost more than another, that separately tuned flat caps cannot already express?* Nothing did. The protocol already differentiates sharply — `AttestationGrant` at 5/week plus a 30-day tenure bar against `Reinforcement` at 40/hour is roughly a 1000× differential — so capacity would re-encode a working judgment while adding **substitutability**, which is a defect here rather than a feature: these caps do not ration a shared resource, they each bound a distinct flooding surface (critique-flooding at 20/hour, conductance-farming at 40/hour), and letting unspent allowance for one become extra allowance for another means every bound becomes its own limit plus whatever was declined elsewhere. That is structurally the same failure as the burn tier — buying past a limit undermines what the limit protected — and building it immediately after removing that tier would have been the wrong lesson. The finer within-type pricing it would enable (costlier cross-domain critique, costlier critique of a `Constitution`) is pricing this protocol should actively not want, chilling critique exactly where Invariant #2 and governance most need it. Burst tolerance, the one thing rolling windows genuinely cannot express, is a property of bucket shape rather than of unified budgets, and can be had per-limit without any substitutability if it is ever actually wanted. **The cost model is therefore flat per-act caps plus accountability (`Constitution`/`required_promises`) plus vouching (`AttestationGrant`) — the model that already existed.** One apparent asymmetry surfaced while answering the question, was investigated, and turned out not to be one: `create_claim` carries no friction while `Critique` is capped at 20/hour. Described as "the protocol rate-limits disagreement but not assertion" that reads like a value judgement about speech acts, and it was briefly recorded that way here — but the mechanism encodes something else entirely. Friction applies to acts that write onto a base another agent owns or that move a shared signal, and to nothing else: `Critique`, `SynapticLink` and `AntibodyPattern` all attach to someone else's target, `Reinforcement` moves a conductance value others read, `AttestationGrant` writes about another agent into a membrane's trust graph. `Claim`, `Mew`, `Retraction`, `Constitution` and `Evidence` are unlimited because each only extends its own author's anchor. `Critique`'s cap in particular exists to close a bypass of `SynapticLink`'s — every critique creates a conductance edge — not because critique is held to be costlier speech. **That is Invariant #2 (no imposition) expressed as rate limits: fill your own shelf freely, writing on someone else's shelf is metered.** Left unchanged deliberately. Claim-flooding remains possible and pollutes the unfiltered `get_claims_by_domain` listing, but the correct shape of a fix would be a read-layer lens there — the containment strategy §2.3 already describes — not friction on the generative act, and no such flood has been reported on a protocol with no deployed network. **§2.3 now states the other half of this explicitly**, because for a long time only this entry said it: containment is a property of *traversals*, and an index read is not a traversal, so the by-domain listing is exactly where it does not reach. `scripts/live-verify/friction-limits.mjs` stands guard on the one property that must not regress: throughput is not purchasable by any mechanism.
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

  **Verified live with two agents:** `scripts/live-verify/domain-index.mjs`, 22 checks. Both agents see both claims in a shared domain; an unused domain reads empty rather than erroring; all three poisoning attempts are refused by validation; the index is confirmed unchanged afterwards; and — the taxonomy's real test — agent 2 adopts a species agent 1 proposed and the adoption count reads 1, which is the shared vocabulary actually being shared. `read-scope.mjs` was updated to assert the *corrected* behaviour for the two fixed reads rather than being retired, so it stays the live map of `SPEC.md` §10.0 and goes red if either index regresses. 77 unit tests still pass (67 coordinator + 10 integrity).

  **Three reads remain chain-local, deliberately:** `get_critiques_by_mode`, `get_membranes`, `get_all_constitutions`. Each would be one global index over an unbounded, ever-growing set, and whether that firehose should exist at all is a real design question — unlike "the claims in this domain" and "the vocabulary of critique types", which are bounded and obviously wanted. Named in `SPEC.md` §10.0 rather than left to be rediscovered. *(Two, as of the entry at the end of this section: the question is answered per function and `get_membranes` is now indexed. Treating the three as one class is what kept it open.)*

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

  **Verified live:** `scripts/live-verify/write-symmetry.mjs`, eleven checks. Reinforcing moves the displayed conductance (1.00 → 2.00) and an *independent* client reads the same raised value off the same link, so the UI is shown to be rendering the conductor's number rather than an optimistic local one. A flag with no rationale is refused before it reaches the conductor; a real one is read back off the DHT with kind and rationale intact; and the flagged claim and its critique are both confirmed still present afterwards, because the form promises that in so many words and a promise in microcopy deserves a check like any other. `affordance-surfacing.mjs` and `evidence-retraction-ui.mjs` both still pass.
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

  **Verified live, and observed failing first.** `scripts/live-verify/taxonomy-ui.mjs`, sixteen checks: the tree nests, adoption is the query-time count (0 reads as "0", never as "unavailable" — different answers, rendered differently), a critique written *through the UI* raises the count 0 → 1 as read by an **independent** client, and a species proposed through the form lands on the DHT under the right name *and* the parent the select chose. Then the two regressions it exists to catch were injected and watched go red: reverting `species` to `null` fails the adoption check, and sorting the tree by adoption fails three checks at once.

- [x] **Opt-in trust lenses surfaced — the item §9 flagged as needing care under §4.4, and the care turned out to be the whole job.** `AttestationPolicy` is the mechanism §4.4 itself names as the honest kind of lens: aimed explicitly by the caller, so two callers legitimately get different answers because they asked different questions. Surfacing it means `is_agent_attested`, `grant_attestation` and `get_my_membership_action` now have a UI, and `get_discourse_health` can finally be asked a question rather than only a neutral one.

  **Three rules, taken straight from §4.4's "if the interface is filtering, the user must have chosen the filter and be able to see it".** No lens is ever on by default — every read still passes `attestation_policy: null` until a user builds one. An active lens renders a banner that is not collapsible, naming its roots, threshold and depth, and saying in words that it is the user's question and not the protocol's verdict. And the unfiltered figures stay on screen beside the lensed ones, because a filter whose *effect* cannot be read off is presented as neutral even when its existence is disclosed.

  **A real defect the harness caught in this UI's own first version.** The banner printed "Claims N → N" beside the critique figure. `get_discourse_health` applies an `AttestationPolicy` when tallying **critiques and never when counting claims** — so that line implied the lens had considered claims and spared them, when it never looks at them at all. Misstating a filter's *scope* is the same §4.4 failure as hiding it. The banner now names the claim total as explicitly unfiltered.

  **An empty root set is refused rather than accepted.** `require_attestation_from: None` makes `is_agent_attested` return `true` for everyone, so a lens built with no roots would render a banner claiming a filter that filters nothing — a verdict while being none.

  **Vouching is disclosed, not gated, and that is §4.5's third rule rather than laziness.** `grant_attestation` is bounded by a membership-tenure bar and a rolling grant budget, and the coordinator exposes a status read for **neither** — unlike `get_synaptic_link_friction_status`. Gating on state this client cannot re-derive would refuse what the protocol might allow, so the affordance stays live and its cost is stated before it is spent. The *shape* of the rule is named and the numbers deliberately are not: the integrity zome calls its 30-day bar "a placeholder scale … tunable", so a figure copied into UI copy becomes a lie the day it is tuned.

  **A stated limit: no successful vouch has ever been observed, and none can be in a test.** Validation requires 30 days of membership tenure, so on any conductor a harness can create — minutes old by definition — `grant_attestation` cannot succeed. Confirmed directly rather than assumed: it returns "AttestationGrant requires proof of sufficiently tenured membership in this membrane". What is verified instead is the part that could regress — the affordance is offered, its cost is stated, the refusal reaches the user legibly, and an independent client confirms the refusal was genuine rather than cosmetic.

  **Verified live, and observed failing first.** `scripts/live-verify/trust-lenses.mjs`, twenty-seven checks — two agents *and* a browser, which no other harness here combines, because a lens needs somebody it legitimately excludes. It carries a **vacuity guard**: it refuses to run at all unless the seeded lens demonstrably removes something, after an earlier version seeded no critiques, filtered nothing, and passed every "the lens works" assertion while proving nothing. Then the violation it exists to catch was injected — a lens applied by default — and it failed **five** checks at once.

- [x] **Expertise assertions surfaced — and the claim that made them legitimate turned out not to be true yet.** `assert_expertise` justifies itself on the grounds that an expertise assertion **is** a Claim, "that anyone can critique through the existing typed CritiqueMode machinery … not a separate, unaccountable field". Surfacing it meant checking that, and the first half was false.

  **Anyone could critique it; nobody could find it.** `assert_expertise` builds its Claim by hand rather than calling `create_claim`, so it wrote only an `AgentToClaim` link and never the `DomainToClaim` index PR #51 added. Browsing `expertise/<domain>` returned nothing — verified against a live conductor before anything was built — and the assertion was reachable only by an agent who already knew whose expertise to go looking for. Exactly #51's bug, missed there because this function does not go through the fixed path. Two lines of Rust; a second agent now finds it, which is the only version of "findable" that means anything.

  **The badge is the §4.4 surface, and it is deliberately not a credential.** The coordinator's own comment says its trace-ownership check is "a courtesy, not an enforced rule" — a client bypassing the function can cite anyone's `WorldlineTrace` — and that these claims carry no standing. So the marker says what it is (self-asserted), what it is not (verified), and what the recourse is (critique it). No check mark, no accent colour, no pill: a credential-shaped badge on a field nothing validates would manufacture precisely the credibility signal Invariant #1 declines to compute.

  **It lives in the New Claim tab and nowhere else, on purpose.** A profile-shaped home would present expertise as a property of the person rather than an assertion they made and can be challenged on — which is the distinction the function exists to preserve. The `WorldlineTrace` is generated at submit rather than chosen: it is derived entirely from the caller's own chain, so the only choice on offer would be stale-or-fresh, and fresh is the honest reading of "evidenced by my history".

  **Verified live, and observed failing twice.** `scripts/live-verify/expertise-ui.mjs`, thirteen checks, two agents — because agent 1 finding its own claim proves nothing, since a source-chain read succeeds for the author whether or not the index was ever written. Reverting the index fix fails three checks including the CONTROL; replacing the marker with "✓ Verified expertise" fails five.

- [x] **The last two reads on §9's list surfaced — `get_critiques_by_mode` and `get_agent_constitution` — paired because they fail in opposite directions.** Neither is large. Both are easy to get wrong in a way that leaves a working screen.

  **`get_critiques_by_mode` is chain-local by specification** (SPEC §10.0, which names it alongside `get_all_constitutions` as deliberately unindexed — `get_membranes` was the third and is now indexed: a global index over every critique of a mode is an unbounded firehose whose desirability is an open design question). It returns the caller's own critiques and can see nobody else's. **The failure mode is a label, not a bug.** A heading reading "Logical critiques" over that data is false, and worst in its empty state — a practitioner reads zero as "nobody critiques this way" when it means "I have not". So the affordance says "your own" before it is opened, the scope note cites §10.0 and spells out what zero means, and every count is phrased as *you have written N* rather than as a total.

  **`get_agent_constitution` is the opposite: a real cross-agent DHT read, whose failure mode is inferring from absence.** It answers what an author has publicly promised, which is what §4.3's cross-checking is checking *against* — without it a methodological critique is one person's opinion of another's method; with it, it is a comparison against something the author put on the record. Nothing requires an agent to publish one, so an author who has not is reported as exactly that, with no adverse framing. Making absence look like a deficiency would score agents on a field the protocol never asked them to fill — Invariant #1 through the back door, and the same shape as the "✓ Verified expertise" badge the previous increment refused.

  **Neither gets a bar, a percentage or a colour scale.** All three read as ranking, and there is nothing to rank against — the by-mode read cannot even see another agent.

  **Verified live, and observed failing first.** `scripts/live-verify/mode-and-constitution.mjs`, fifteen checks, **three agents**: agent 2 writes critiques agent 1 must never see, and agent 3 publishes no constitution on purpose so the absence path is exercised rather than assumed. Its first check is a control proving the read really is chain-local, so the honesty assertions cannot pass against a read that is merely broken. Then both violations were injected — presenting the chain-local read as network-wide, and rendering a missing constitution as "unverified" — and ten checks failed at once.

  **A documentation drift from the previous increment, fixed here.** SPEC §7's `DomainToClaim` row said "Written by `create_claim`" — true until #56 made `assert_expertise` write it too. Corrected, with the general rule attached: any future function that creates a `Claim` without going through `create_claim` has to write that index itself, which is exactly how the omission #56 fixed came about.

- [x] **The worldline half of HRR surfaced — `get_agent_worldline_trace`, `get_my_latest_worldline_checkpoint`, `verify_trace_checksum`, `query_worldline_resonance` and `sample_period`.** These were the eight functions the caveat above had wrongly called deferred; correcting that record is what made them visible as the one remaining candidate with real data and no screen. Taken on the argument that a worldline should be legible to its own author, not on a queue position.

  **Two kinds of answer, and the screen exists to keep them apart.** `period_boundaries` is exact and lossless; resonance is approximate by construction, and `query_worldline_resonance`'s own doc comment says a high similarity "is a hint worth checking, not a claim of fact" and that it "never substitutes for get_agent_worldline_trace's own period_boundaries". So the exact record renders first and unconditionally, the probe is layered beneath it, **every hit is paired with the exact boundary it points at**, and `sample_period` opens that window's real records. Making the hint checkable is the difference between honouring §2.5's "receiver, not a truth engine" and reciting it.

  **A real defect the harness caught in this screen's first version.** `query_worldline_resonance` scores **every** period index and sorts them — no threshold, no filtering — so a probe for a tag with no relationship to the chain still returns a full ranked list, just at low scores. Verified live: a real tag scored ~0.71 and a nonsense tag −0.09, both returning every period. The first version rendered those identically and described an empty result as "nothing resonates", a mechanism that does not exist. Presenting a ranked list as a set of *matches* is the truth-engine reading arriving through presentation rather than through the number, so the screen now says outright that it ranks every period and applies no threshold, and the genuinely empty return is described by its four real causes — no trace, a null payload, a foreign binding key, an unparseable payload.

  **This agent's own worldline only, deliberately.** The coordinator accepts any `AgentPubKey`, but a "how strongly does this agent resonate with domain X" probe over other people would hand every client a per-agent scalar that `get_membrane_members` makes enumerable and sortable — the leaderboard §9 records removing `get_credit_balance` to avoid, arriving by another route. The protocol permitting a read does not oblige a UI to offer it. The harness asserts there is no agent selector on the screen at all.

  **Verified live, and observed failing first.** `scripts/live-verify/worldline-ui.mjs`, eighteen checks, with a control that refuses to run unless the seeded trace has a real HRR payload and at least one period — otherwise "the exact half renders" would pass vacuously. Then the §2.5 inversion was injected — the probe rendered before the exact record, and the score restated as "73% match" — and two checks failed.

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

  **The honest limit, since a green result here invites a bigger claim than it supports.** All three conductors run on one machine against a localhost bootstrap and a localhost signal server. What is now verified is that this hApp's entries propagate between genuinely separate conductors over a real transport, with real peer discovery, and that the chain-local reads stay chain-local when they do. What is *not* touched here: network partition and rejoin, or more than trivially few nodes. **Three items were struck from this list after it was written, and by different work:** partition and rejoin is covered by `partition-rejoin` in `network.yml`, and NAT traversal, a public bootstrap and real internet latency were all exercised by the cross-internet crossing recorded in §9 — one run, two hosts, 5.0s. The sentence is left in place rather than deleted because a list of what a green result does *not* cover is worth keeping honest as the coverage changes, and this one was wrong in the direction of understating it. That is the next real networking gap, named here the same way the Launcher-install gap is named above rather than left to be discovered by someone reading a passing test as more than it is.

- [x] **Partition and rejoin — a node that was offline while history was written catches up. It took about five and a half minutes on Holochain 0.4.4, and takes about 55 seconds on 0.7; see the correction at the end of this section.** `scripts/live-verify/partition-rejoin.mjs`, and `stop-node`/`start-node` added to `scripts/network.sh`.

  **Why the previous increment was only half the question.** Real multi-node networking proved an entry crosses between conductors that are both up the whole time. A network whose participants are never offline is not a network anyone runs — laptops close, processes restart, links drop — and for a protocol built on "nothing is deleted, only witnessed", the property that actually matters is that a node which was *away* while history was written does not stay ignorant of it. Nothing tested that.

  **Partitioned in both directions, because one direction cannot tell two mechanisms apart.** A test where only one node ever goes offline cannot distinguish "the returning node catches up" from "the node that stayed up pushes to whoever appears" — different mechanisms, same happy path. So each node in turn writes something the other cannot see: nodeB is stopped and nodeA writes; then **nodeA is stopped before nodeB is restarted**, so the two are never running simultaneously, and nodeB writes. Stopping a conductor is the partition, deliberately — it is unambiguous and it is what actually happens, unlike blocking traffic between two processes that may both still hold an already-negotiated WebRTC connection.

  **The result, and the number is the interesting part.** Both nodes converged on the other's writes, in both directions, **at 326.6s — the same instant for both**, which is what shows they heal in a single gossip round rather than independently. Content and authorship were checked, not just counts. A claim written *after* healing then crossed in 5.0s, confirming the link was genuinely repaired rather than backfilled once. nodeC, on its own DHT, saw none of it throughout, and was confirmed alive rather than merely silent. 23 checks.

  **Five and a half minutes is not a defect, and the constant that explains it is in the conductor's own config.** Steady-state gossip here is ~2-5s. Post-partition catch-up is dominated instead by `gossip_peer_on_error_next_gossip_delay_ms: 300000` — a node that tried to reach a peer while that peer was down took the error path and will not retry it for five minutes. Worth stating plainly because it sets an expectation: **a node returning from an outage is not current for several minutes**, and any UI that implies otherwise would be lying about what it can see. *That expectation is narrowed by the transitive-gossip entry below: it holds when the only peer available is the one the node just failed to reach, which on a two-member DHT is always. With a third node up, the same catch-up takes seconds.*

  **Both halves of that paragraph are now wrong, and the substrate is why — see the correction at the end of this section.** `gossip_peer_on_error_next_gossip_delay_ms` is a `kitsune_p2p_types` 0.4.4 parameter, which is what this project ran when the figure was measured. It does not exist in the kitsune2 0.5 that Holochain 0.7 uses, and the expectation it set — a returning node not being current for several minutes — no longer holds on 0.7, where the same catch-up is about 55 seconds.

  **A too-short timeout produced a confident wrong answer, and that is why the window is now derived rather than guessed.** The first version used a 180s window and was on course to report a convergence *failure* that would have been pure impatience. The window is now 600s, sized from the backoff constant above. A timeout that is shorter than the mechanism it is timing does not measure the mechanism; it measures the timeout, and reports it as a property of the system.

  **The first injection found a real defect in the harness rather than confirming it was sound.** With both partitions removed, so that nothing ever went offline, the two "is genuinely down" checks went red as they should — and **the divergence check, which carries the entire meaning of the run, stayed green.** It read the returning node immediately after the write, sooner than the ~5s a claim takes to cross, so it saw zero for a reason with nothing to do with any partition: the label said "it was never up alongside nodeA", the assertion tested "nothing has arrived yet". That is precisely the failure mode `scripts/live-verify/README.md` records — a check whose label claims more than its assertion tests — found live, in a new harness, by the injection convention that exists to find it. It now waits several times the crossing time Phase 0 measures on the same network before asserting absence, and the same injection turns it red.

  **A misleading pair of true numbers, also fixed.** Measured in sequence, the second direction was timed only after the first had already waited out the whole healing delay, so it reported `0.0s` and read as instant. The run printed "nodeA 351.7s, nodeB 0.0s" — both true, and together a false story. Both directions are now measured concurrently from one shared clock, which is how the matching 326.6s figures came out.

  **A leak in `network.sh` that only a caller could see.** `( cmd & )` looks like it detaches a process and does not: the child stays attached and the script blocks in `wait()` until it exits, which for a conductor is never. Running `network.sh` from a terminal hides this completely — the output all appears and the prompt returns — and it surfaced only when this harness called `stop-node`/`start-node` through Node's `execFileSync`, which waits for the process *and* for its stdout to reach EOF. The harness hung indefinitely with three leaked `network.sh` processes sitting in `do_wait` behind it, one per launch site. Every long-running child is now started with `setsid --fork`; `start` went from never returning to returning in 16s.

  **The honest limit is unchanged and worth repeating.** Three conductors on one machine against localhost services. This tests partition by process exit, not by network failure — no NAT, no packet loss, no asymmetric reachability, no partition of a group larger than two, and no case where both sides keep running but cannot see each other, which is the harder and more realistic shape. *The last of those is now covered by the entry below; the rest stand.*

- [x] **Both sides up, neither able to reach the other, and both still writing — a partition at the packet level.** `scripts/live-verify/network-partition.mjs`, run inside the throwaway namespace `scripts/netns.sh` provides.

  **Why the previous increment was still the easy half.** `partition-rejoin.mjs` partitions by stopping a conductor, which is unambiguous and is what actually happens — and it cannot reach the shape the entry above named as its own honest limit. A stopped process cannot accept writes, so a stop-based test can never have *both* sides diverging at once under live load. The interesting failure is the one where both peers are healthy, both keep serving, both keep writing, and they simply cannot see each other. Producing that needs packet-level control rather than process control.

  **The first assumption was wrong, and the harness now asserts against it rather than trusting it.** The obvious guess is that peers talk WebRTC over UDP, so dropping UDP should partition them. It was tried first and it did not work: claims crossed with all UDP dropped in both directions. The sockets explained why — each conductor holds exactly two TCP connections, one to the bootstrap server and one to the signal server, with **no direct conductor-to-conductor connection and no UDP socket at all**. Peer traffic is relayed through the signal server, so the data path to cut is TCP to the signal port. That is a fact about this setup and not a law, so check 2 reads the conductors' own sockets on every run and fails loudly if it ever stops being true — the alternative is a harness that goes on cutting a path nothing uses and reporting a partition it did not cause.

  **Cutting one port rather than all of them is what makes the result mean anything.** Severing every TCP path would partition the peers and prove very little, being indistinguishable from the machine's networking failing. So the cut is aimed at the signal port alone, and the bootstrap server on another port is probed throughout and must stay reachable. *Alive and reachable but for this one path* is the claim; a general outage is the thing being ruled out. Neither conductor is signalled, restarted or reconfigured, both answer zome calls throughout, and their pids are checked unchanged across the whole run — so "this is not secretly a restart" is asserted rather than asserted-by-comment.

  **The result. 26 checks, and the recovery figure reproduces.** Both conductors wrote while partitioned and neither saw the other for a dwell derived from that run's own baseline. On healing, **nodeA converged at 301.6s and nodeB at 301.5s** — measured concurrently from one shared clock, so neither number is an artefact of waiting for the other, and matching the same pair of figures a previous clean run produced rather than being one sample. Content and authorship were checked, not counts alone. A claim written after healing crossed in 5.1s. nodeC, on its own DHT, saw none of it and was confirmed alive rather than merely silent. The five-and-a-half-minute figure the entry above explains by `gossip_peer_on_error_next_gossip_delay_ms` holds here too, reached by a completely different route to the same backoff. *(Both of these figures are 0.4.4 measurements. On Holochain 0.7 the same catch-up is about 55s and that constant does not exist — the correction at the end of this section has the detail. The 301.6s/301.5s pair recorded here is left as measured rather than restated, since it is evidence about 0.4.4 and re-running it on 0.7 would produce a different number rather than a better version of this one.)*

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

  **Which quietly corrects the headline figure of the entry two above.** `partition-rejoin.mjs` measured a returning node taking **326.6s** to catch up, dominated by `gossip_peer_on_error_next_gossip_delay_ms: 300000` — the backoff a node incurs against a peer it tried and failed to reach — and that was written up as "a node returning from an outage is not current for several minutes." With a third node present the same catch-up takes seconds. The difference is not a faster protocol; it is that a returning node has no failure history against a peer that stayed up, so there is no backoff to wait out. **The five-and-a-half-minute figure is a property of a two-member DHT**, where the only peer a returning node has is the one it just failed to reach. Stated as the inference it is: it rests on the measurements and the config constant, and this harness does not instrument the backoff directly. *(That inference has since been undercut from the other direction: the config constant it rests on is kitsune1's and does not exist on Holochain 0.7, where a two-member catch-up measures ~55s rather than 326s. The correction at the end of this section has it. This paragraph's internal logic was sound and its paired measurement was real; what moved was the substrate underneath both figures.)* But it is a *paired* measurement, not a comparison across configurations — `partition-rejoin.mjs` was re-run on this same network, same machine, same session, after the `network.sh` change and with nodeD down: 23 green, catch-up **326.7s** against the 326.6s it first recorded. The two figures being contrasted differ in the presence of one conductor and not in the machine, the build or the day. That re-run doubles as the regression check for making nodeD opt-in — the harness the opt-in exists to protect is confirmed unaffected by running it rather than by arguing it should be.

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

- [x] **The Linked Data face — the protocol is no longer invisible to everything that already speaks HTTP.** `gateway/`, and `scripts/live-verify/linked-data-gateway.mjs` (38 checks).

  **The trade this answers, stated the way the design note states it.** The Semantic Web bought universal addresses and machine-readable structure and paid with no native model of disagreement and weak provenance. This protocol is the other way round: typed disagreement and cryptographic provenance, addressed by a hash nobody can paste into a browser and no existing tool can read. The gateway gives the second the first's reach, in the only direction that is safe — **out**.

  **One way, enforced rather than promised.** Every zome call goes through an allowlist in `conductor.ts` holding ten reads and no writer, so a call to anything else throws before it reaches the conductor; a `POST` is refused with 405 and an explanation of where writing actually happens. The harness asserts both, and asserts against the built bundle that no coordinator write function appears in it at all. Widening what this service can do means editing that list — a visible, reviewable act rather than a quiet one.

  **The hash travels and stays canonical.** `@id` is an HTTP URL because Linked Data needs one, but `canonicalHash` is the entry's real address, `canonicalHashAlgorithm` says which kind, `dnaHash` says which network — the same hash on another DNA is a different claim — and `isBasedOn` states *in the data* that the DHT copy is authoritative and this one may be stale or absent. An export whose provenance is its own URL would have recreated the weak-provenance problem it exists to answer.

  **Nothing becomes a score, and this needed the most care.** schema.org offers `aggregateRating`, `ratingValue`, `interactionStatistic` and `upvoteCount`, and every one of them would accept this protocol's critiques as input and emit precisely the canonical comparative number Invariant 1 refuses — under the protocol's own name, in a document every downstream tool would believe. There is no vocabulary term here for "how good is this claim". Critiques export with their five typed modes intact, and a domain listing declares `ItemListUnordered` rather than leaving a consumer to infer a ranking from the sequence. The absence is asserted across every document the gateway serves, because an absence is the only form this property can take.

  **Retractions travel with their claim, above it.** A one-way export that drops a retraction leaves the web asserting something its author has publicly withdrawn, in their name, indefinitely. So it is in the document and *above* the claim on the page, where it is read first — checked by document order rather than presence, the lesson §9 already records from `founding-ui`. The claim itself is still exported: a retraction withdraws, it does not delete.

  **Noindex by default, which is a judgement rather than a setting.** Publishing to a DHT is a decision to make something available to that network; it is not, by itself, a decision to be indexed by search engines under one's own name forever. The gateway's purpose is fully served without indexing, so an operator who has the standing to decide otherwise sets `EPI_GATEWAY_INDEXABLE=1` deliberately. Related and stated in `gateway/README.md`: this service connects **as an agent with a key of its own**, because even a read is a signed zome call — it is not an anonymous window onto other people's data but a network member re-publishing what it can read, which someone chose to do and answers for.

  **Watched failing, and its first run found three defects before anything was injected.** Emitting an `aggregateRating` computed from the critique count turns two checks red, and correctly leaves the domain and index documents green. Unforced: a made-up hash reached the conductor and returned a wasm deserialization error, so a wrong URL was reported as a gateway failure rather than a malformed address — now shape-checked at 39 bytes before the call. And two of the checks were themselves wrong: the retraction-ordering assertion compared indices across the whole document, where the embedded JSON-LD in `<head>` carries the claim text too, and the "mode is a label, not a severity" assertion forbade the word "score" anywhere in HTML that legitimately uses it to say there is not one.

- [x] **The AI in the room, and it is a member rather than a feature.** `notes/src/assistant.ts`, `assistant-main.ts`, an assist channel in the notes service, a suggestion block in the promotion form, and `scripts/live-verify/notes-assistant.mjs` (43 checks).

  **This is the piece the design note says replaces documentation.** An assistant sitting inside a notes space, next to the writing that is actually happening, can explain the difference between a note and a Claim *at the moment someone is trying to make one* — rather than in an onboarding flow they clicked through three days ago. It is allowed to be wrong, because every answer lands beside an accept and a reject.

  **It joins through an invite link, as a member with `kind: "ai"`.** There is no registration endpoint for AI members and no configuration flag that conjures one into a space: somebody hands the process a link, exactly as they would hand one to a person. **Stopping one already in the room is a route now, and was not when this was written** — any member removes it, the room keeps a note saying so, its token stops at once and the invite it arrived through is revoked; see `notes/README.md`. What stood in the way was never code but the answer to "who may remove whom", and the entry further down this section records how long the *documented* answer went on being false. That also makes "3 AI agents helping here" a fact about who is in the room — surfaced in the directory and in the invite preview, where it is a reason to walk in the door rather than a feature listed on a page.

  **The notes service still holds no model credentials and makes no outbound calls.** It routes the question and stores the answer, with `source` recorded as the answerer's own statement of what produced it. That field is rendered next to the suggestion, because "a model said so" and "a keyword table said so" deserve different amounts of trust and the reader is the one who decides.

  **Without an API key the assistant still answers, from fixed keyword rules, and says so.** A feature that goes silent without a credential is undemonstrable and unverifiable; one that passes a keyword match off as a considered judgement is worse than useless. So the fallback labels itself, and **declines to draft the published wording at all** — it will say which of the five modes the words look like and why, and stop there, because a keyword table has no business writing what someone is about to sign with their own key. Verified in exactly that configuration.

  **Nothing is applied on arrival.** The single most tempting thing to build here is a form that fills itself in when the answer arrives, and it is the one change that would turn "AI-assisted if you want it" into "the AI decided". Every field lands beside a button; the form is complete and usable with the assistant ignored, which the design requires in as many words.

  **The injection PASSED the first time, and that is the most useful result in this pass.** Auto-applying the suggestion left every check green: the assertion read the mode field before asking and compared it afterwards, and the select defaults to the first of the five variants — which is the mode suggested for that note, so the auto-apply wrote the value already there. Same shape as the two weak checks §9 already records: a label claiming more than its assertion tests. Fixed by setting the field, before asking, to a mode the suggestion demonstrably is not — read from the answer already collected over HTTP — and by asserting the Claim/Critique switch too; a further check now guards that setup so a future note whose suggestion happens to match cannot hollow it out again. Re-run injected: two reds, exactly the two properties broken.

  **And the strengthened check then found a real defect with nothing injected at all.** Asking the assistant wiped the promotion form. `render()` rebuilds the DOM on every pass, so fields initialised from the note discarded whatever had been typed the moment anything in the space changed — an arriving answer most sharply, but equally another member writing a note. Fixed by binding the form to draft state that outlives a render.

- [x] **The gate is a screen now — a note becomes a real Claim, in a real browser, under the practitioner's own key.** `mobile-ui/src/notes.ts`, `notes-ui.ts`, a Notes tab, and `scripts/live-verify/notes-ui.mjs` (41 checks, across two browser contexts).

  **The soft layer is reachable without a conductor, and that ordering is the point.** The connect screen offers a second door straight into the notes layer. Requiring a connection first would put the protocol's ceremony back in front of the room built to sit in front of the protocol — the whole design would still be true and nobody would ever reach it. Everything works there: writing, invite links, the directory, joining. Publishing is the one act that needs an agent key.

  **So the promotion form is rendered and DISABLED with a reason, never hidden.** §4.5's rule, applied to the one affordance that crosses layers: hide what is structurally impossible, disable-with-a-reason what is merely unavailable now. Publishing is unavailable without a conductor and perfectly possible with one, so hiding it would teach a newcomer that the notes layer cannot reach the protocol at all — the opposite of the thing being explained. The wording names the conductor and the agent key, and does not offer the notes server as a way round, because there is none: that service has no key and cannot sign.

  **The critique mode is asked in plain language, and that is the entire onboarding argument in one field.** `CritiqueMode` is a fixed five-variant axis the integrity zome will not let anyone skip, and it is the wall a newcomer hits. Each variant is offered as a sentence — "I tried this myself and something different happened", "The reasoning does not follow, even if the facts are right" — with the variant name sent unchanged. Free text is not offered as a sixth option, because the protocol's refusal of it is what stops disagreement collapsing into a single bit.

  **Promotion is a copy, not a move**, and the note records what it became. The excerpt is captured when the form opens rather than read at submit time: notes here are editable by anyone in the space, and what gets published must be what was read.

  **Verified against the DHT, not against the screen.** In a real Chromium at 390×844 across two browser contexts — two members, one invite link, one shared notebook — a note was promoted to a Claim and another to a typed Critique, and both were read back by an **independent** client off a real conductor: right content, right domain, right mode, authored by the practitioner's own agent key and not by the notes server. Exactly one Claim, not one per render.

  **Watched failing twice, and two more defects were found without any injection.** Hiding the form when disconnected: four reds. Deleting the note after publishing: three reds, with the DHT checks correctly staying green, since the Claim really was published and what broke was a different property. Unforced, on first runs: an empty `EPI_NOTES_STATE` was treated as a filename, so the service served every read and threw on the first write; and a space still being read rendered as an empty room, telling someone who had just followed an invite that they had walked into a dead one. Both fixed at the source and guarded by checks. The first attempt at each injection also reported nothing but a Playwright timeout — the complaint this project already records against `launcher-packaging`'s first regression report — so every wait in that harness that can legitimately fail is now bounded and then asserted.

- [x] **The shared notes layer exists — the first thing this project has built that sits ABOVE the protocol rather than inside it.** `notes/`, and `scripts/live-verify/notes-layer.mjs` (89 checks).

  **The problem it answers is one this protocol earned by succeeding.** Typed disagreement, permanent history, cryptographic authorship and a hard refusal of global scores are bought with ceremony, and the bill comes due at capture: a half-formed thought has nowhere to land, and every invariant that makes the graph worth reading is also a reason not to write in it. The obvious fix — relax the rules, allow a half-thought as a `Claim` — would destroy the only property this protocol has that Twitter and the Semantic Web do not.

  **So nothing was relaxed.** A room was put in front of the rules where they do not apply yet, and one deliberate act carries material across. Because notes never reach the DHT, there is no pressure to weaken validation, friction limits or Invariant 1 to accommodate them — which is the whole argument for the two-layer shape, and the reason this is a new package rather than a new entry type.

  **The service structurally cannot publish, which is what makes "promotion is never automatic" a fact rather than a policy.** It imports no Holochain client, holds no conductor credentials, and learns about a promotion only by being told after the client has already published under the member's own agent key. A service that *could* publish would need a rule saying it must not; one that cannot needs no rule, and there is no code path a later refactor can quietly enable. The harness asserts the absence against the built bundle rather than against intent.

  **Invariant 1 reappears one layer up, wearing a directory.** Every field a listing legitimately shows — participant count, last activity, notes this week — is one `sort=` parameter away from being a leaderboard over rooms, which is exactly what the layer below exists to avoid. The directory therefore offers two orderings, `recent` and `alphabetical` — a fact about time and a fact about names — and **refuses anything else with a 400 that says why**, rather than falling back to a default and leaving the caller believing they got what they asked for. Activity signals are space-local and descriptive for the same reason: "12 notes this week" tells you a room is alive; the same number sorted against every other room tells you it is better, and that is a different and worse thing.

  **The one place the two layers deliberately disagree is deletion.** Below the gate, `RegisterDelete` is refused for every entry type, so no `Claim`, `Critique` or retraction can be removed once written (link deletion is the one accepted exception — §5.1). Above it, deleting a note really deletes it. That is not a missing feature relative to the protocol; it is the difference between the layers stated in code. A person who cannot throw away a bad half-thought will not write half-thoughts, and half-thoughts are the entire point of this layer.

  **Provenance survives editing, which needed a decision rather than a field.** Notes here are rewritable by any member of the space — a shared notebook, not adjacent private ones — so a promotion stores the promoted excerpt *verbatim* alongside the `ActionHash`, not a pointer into text that may since have changed. The hash is stored as what it is: an unverifiable claim by a member about something they say they did, whose authoritative copy is on the DHT and addressed by that hash. The soft layer is never a second source of truth about the hard one.

  **The room has ceilings, and they are the room's, not the protocol's.** One unauthenticated create endpoint on an open port is an unbounded write endpoint, so `notes/src/limits.ts` puts fixed-window caps on the acts that multiply — spaces created, joins per address and per invite, notes written and edited, invites minted, assists asked and answered — each overridable per deployment as `EPI_NOTES_CAP_<BUCKET>=count/seconds` or `off`, and each refusing with a 429 that names the bucket, carries `Retry-After` in both the header and the body, and **says in words that this is the notes layer's own friction and spends none of the protocol's**. That sentence is load-bearing: a practitioner who reads "rate limited" and concludes their publishing budget is gone has been misled by their own tooling about §2.3's SWO temporal friction, which is a different mechanism, one layer down, measured against their agent key. **Promotion is deliberately uncapped for the same reason.** The publish it records already paid the protocol's price; a second ceiling here could refuse someone who still has real friction remaining, which would make the hard layer's limit unpredictable from inside the soft one — exactly the coupling the two-layer shape exists to prevent. `/events` counts *held sockets* rather than requests, because a route designed to park for 25 seconds and answer late would otherwise punish the client using it correctly. `/me/budget` reports a member's own remaining friction and takes no parameter that could name anyone else, so a friction meter cannot become a comparison — Invariant #1 again, in its third costume. And `X-Forwarded-For` is honoured only under `EPI_NOTES_TRUST_PROXY=1`, because a ceiling any caller can reset with one header is worse than no ceiling: it is believed.

  **Watched failing, three times.** Widening the directory's allow-list to include `popular`, plus the four lines that make it work, turned exactly two checks red and left the paired `sort=activity` check correctly green. Then, on the ceilings: reading `X-Forwarded-For` unconditionally — the shape this arrives in the day a proxy goes in front — turned exactly one check red while both `TRUST_PROXY=1` checks correctly stayed green; and moving the `spaces.create` charge to *after* `store.createSpace`, where it lands if you think "charge for what happened" rather than "refuse before anything happens", turned exactly one check red while every 429 check stayed green — the refusal still looked perfect from outside while the room had already grown a space. All three reverted; 80 green at the time, 89 now that the same harness also guards the save-clobber described below. See the harness header.

- [x] **Four harnesses now run themselves, on every push and pull request.** `.github/workflows/live-verify.yml`.

  **The gap was procedural rather than technical, which is why it lasted.** This repository has around thirty live-verify harnesses and had no CI at all: every merge was gated by somebody remembering to run the right ones by hand. That held while one person ran everything, and stopped holding the first time it was tested — one pull request was merged with a harness unrun for its entire review, on a mistaken claim that its prerequisites were unavailable, and the mistake surfaced through a follow-up question rather than through anything automatic. The tooling had been installed the whole time, in `~/.cargo/bin`, which is not on a non-interactive shell's PATH — the same trap `scripts/sandbox.sh` already documents in its own header.

  **Only the four conductor-free harnesses are in it, and that restraint is the design.** `notes-layer`, `notes-live`, `notes-assistant` and `theme-pinning` drive the `notes/` service and the built UI bundle, hold no Holochain credentials, and by construction never touch a DHT; together they take about a minute. Everything else needs a real conductor, a built WASM DNA and a clean sandbox per run, and would have to spend real SWO friction budget to prove anything. **A green tick that quietly stopped covering the protocol would be worse than no tick**, so the workflow says in its own header what it does not claim: it is evidence about the layer above the promotion gate and says nothing about the layer below. `notes-ui.mjs` — the gate itself, against a real DHT — is still run by a person on a machine with a sandbox.

  One prerequisite had to change for any of this to be possible: the browser harnesses hardcoded `/usr/bin/chromium`. The three conductor-free ones now resolve `EPI_CHROMIUM`, then that path, then Playwright's own download, which is what a runner has. The conductor-bound ones keep the hardcoded path deliberately — they only ever run where a toolchain is already installed, and changing files that cannot be exercised here would be churn asserting itself as safe.

- [x] **CI now reaches below the promotion gate too — as far as a linker reaches, and the tick says exactly that much.** `.github/workflows/zomes.yml`.

  **77 unit tests existed and nothing ran them.** Ten in the integrity zome, 67 in the coordinator, all green, all invisible unless somebody typed `cargo test` — and nothing compiled either zome automatically either. The workflow above deliberately stops at the notes layer and says so in its own header, which was the right restraint and left roughly 6,700 lines of Rust with no automatic anything.

  **Why a build step earns a workflow in a repository that distrusts checks not touching a DHT.** The two most consequential defects in this changelog were compile-class rather than logic: the coordinator zome's `Mew`/`Retraction`/`Constitution` functions and its `SignalPayload` enum each defined two or three times (`E0119`/`E0428` — it would not have compiled at all), and every `create_X` function declaring `ExternResult<EntryHash>` while returning `create_entry()`'s actual `ActionHash`, across twelve functions. Both are what a compiler prints in seconds. Both reached `main`. Both were found by a person reading the file.

  **It builds rather than `cargo check`s, and that distinction is the one real decision inside this.** `.cargo/config.toml` already recorded, in its own header, that `cargo check` "does NOT invoke the linker at all" and so "says nothing about whether the crate actually links into a deployable .wasm" — the file exists because `hdi`/`hdk` declare Holochain's `__hc__*` host functions as bodyless `extern "C"` that must become WASM *import* entries. **Watched failing rather than taken on trust:** with that link flag alone removed and the `getrandom` cfg beside it kept, `cargo check --target wasm32-unknown-unknown` on the integrity zome exits 0 — perfectly green — while `cargo build --release` on the identical tree dies with ten undefined `__hc__*` symbols from `rust-lld`. So the job builds the exact release binaries `dna/dna.yaml` points at, which cost 41s and 56s from a clean tree here and produced real 2.7 MB and 5.7 MB `.wasm` files.

  **And that control corrected the file it came from.** `.cargo/config.toml`'s own header still said that without it `cargo check` stays green and only the build fails. True under 0.4; not true since the 0.7 upgrade added the `getrandom_backend` cfg, which is read at compile time — delete the whole file today and `cargo check` fails too, on `getrandom` rather than on the linker. The claim it was making survives and was re-confirmed directly; it just needs the narrower control to show it, and the file now says so.

  **What the tick does not claim, which is the part that had to be designed rather than written.** Nothing here runs `hc dna pack`, starts a conductor, publishes an entry, gossips, or exercises one validation rule — the wasm it builds is thrown away with the runner. A zome that links clean and passes all 77 tests can still be wrong about everything the DHT does. It is a second workflow rather than four more steps in the first one precisely so that `live-verify.yml`'s boundary statement stays true instead of being quietly widened.

  **Two smaller decisions, each of which could have gone the other way.** `cargo clippy` is **not** in it, because it is not green: the integrity zome is clean and the coordinator produces 14 warnings today, so `-D warnings` would land CI red on arrival — and clearing them first would mean editing the coordinator zome, the layer this job explicitly cannot exercise, for cosmetic reasons. And the toolchain is `stable` rather than a pinned version, because this project's development machine builds these zomes with `stable`; a pin would make CI assert a compiler nobody here uses. The version is printed by a step of its own, so every run says on the record which compiler produced its result. The cache holds the registry and not `target/`, for the reason this repository already applies to a stale `dist/`: a download may be reused, a result must be produced fresh.

  **Verified before the first run**, as far as it can be from here: the four commands were run against a clean copy of the tree with no `target/` anywhere, `--locked` against both committed lockfiles, and are green — 41s and 56s for the two builds, real `.wasm` out of each, then 10 and 67 tests passing. What cannot be checked from here is the runner's own toolchain and cache behaviour; the first run on GitHub is the evidence for that.

- [x] **CI now runs against a real conductor and a real DHT — the first automatic evidence about the protocol itself rather than the layer above it.** `.github/workflows/conductor.yml`, running `domain-index`, `read-scope`, `mew-lifecycle` and `friction-limits` on every push.

  **The standing reason this was impossible turned out to be two thirds wrong, and finding that out cost one command.** Both earlier workflows say in their headers that the conductor-bound harnesses stay out of CI because they need a Holochain toolchain, a built WASM DNA and a clean conductor per run, and would spend real SWO friction budget. That was an accurate account of the cost *on this machine*, inherited rather than re-checked. **The toolchain is a download, not a build**: `holochain/holochain` publishes prebuilt `x86_64-unknown-linux-gnu` binaries with every release, and the `holochain-0.7.0` tag carries both `hc` (9 MB) and `holochain` (54 MB) at exactly the version this repository targets — nothing is compiled to obtain them. **And the friction budget is cheaper on a runner, not dearer**, which is the part that inverts: the one hard rule in `scripts/live-verify/README.md` is a clean conductor per harness, because the rolling-hour caps mean a harness that spends the budget strands the next one — and on a fresh VM every step gets `sandbox.sh clean && sandbox.sh start` for free. The constraint that makes these harnesses awkward locally costs nothing there. Only the third objection was ever real, and `zomes.yml` had already paid it.

  **It drives this repository's own scripts rather than reimplementing their steps.** `pack-webhapp.sh` and `sandbox.sh` each carry a long header of constraints learned the expensive way — which `hc` flags are global, that `hc sandbox run` exits on its own and leaks an orphan if you record the wrong PID, that packing does not compile. A workflow that open-coded those would drift from the documented path and end up verifying something nobody runs. The binaries are installed into `~/.cargo/bin` precisely so both scripts find them the way they do here, unmodified — which makes this job the only automatic check that either script still works.

  **Verified locally against the downloaded release binaries, not against the installed toolchain**, which is the distinction that matters when the claim is "this will work on a runner": `hc dna pack` and `hc app pack` were both driven by the downloaded `hc`, a conductor was started from the downloaded `holochain` via `sandbox.sh`, and all four harnesses ran green against it with a clean conductor each — 29s, 20s, 12s and 13s, about 75 seconds plus restarts. `scripts/pack-webhapp.sh` was then run end to end and is green. What cannot be checked from here is the runner's own network and filesystem; the first run on GitHub is the evidence for that.

  **What a green tick here does and does not mean.** Real zome calls against a real DHT with real validation running — `domain-index` includes validation refusing three separate attempts to poison the by-domain index, and `friction-limits` gets a critique refused by the rolling-hour cap for real. But it is one conductor on one machine, so it says nothing about gossip, partition or convergence between peers. Still not running, and none of it a wall: the browser harnesses below the gate (they hardcode `/usr/bin/chromium` — #103 left that alone because it could not exercise them, a reason that expires now), the three needing their own package built first, and the four multi-node ones, whose bootstrap and iroh-relay binaries are published on the same release tag.

- [x] **The promotion gate is no longer something only a person can check.** `notes-ui.mjs` — named in both earlier workflows as the harness a person still had to run on a machine with a sandbox — now runs in `conductor.yml` on every push.

  **This is the follow-up the previous entry said had an expiry date, collected.** It is the harness worth having most: three real processes (the `notes/` service, `vite preview` serving the production bundle, and the conductor), a real browser as the only thing touching all three, and the published entry read back by an **independent zome call** rather than believed off the screen. The promotion path exists nowhere else in the system, and its whole design is that the two halves stay apart — so a harness is the only place that design gets tested at all.

  **One harness changed, and only one, which is the part worth keeping as a rule.** All eighteen conductor-bound browser harnesses hardcode `/usr/bin/chromium`. #103 declined to touch them because it could not exercise them, and that premise died the moment CI grew a conductor on a machine with no system browser. But the replacement rule is narrower than "so change them all": **change the resolution in the harness you are adding to CI, in the same commit that adds it**, so the edit is exercised by the check that motivated it. Seventeen files edited at once to satisfy a workflow running one of them would be the same churn wearing a better justification, so the other seventeen are untouched and wait their turn behind a check that can run them. *(That check is `ui.yml`, four entries below; all seventeen changed in the commit that added it, and the resolution moved to `scripts/live-verify/chromium.mjs` rather than being copied a further seventeen times.)*

  **Verified against both browsers, because that is the actual risk.** Which branch of the resolution fires is trivial; whether a Playwright-downloaded Chromium behaves like the system one is not, and that is what a runner gets. Against a clean conductor, `notes-ui` passed in **23s** with the system `/usr/bin/chromium`, and again in **23s** with `EPI_CHROMIUM` pointed at Playwright's own download — all nine sections, gate included.

  **And it worked: the first CI run found a real defect in this harness, on a machine slower than this one.** Exactly one check failed — section 6's "the other member's note is there" — while the entire gate, Claim and Critique publication passed. The cause was mechanical rather than mysterious: section 5 waits for the room's notes to arrive on their **second request** and says so in a comment; section 6 read the list the instant its *container* rendered, and waited for nothing. The tell that it was the harness rather than the room is section 7 in the same failing run, which found a note in that very list and promoted it. **Watched failing:** injecting a genuine absence — a note nobody ever wrote — turns exactly that one check red, so the added wait cannot have turned the assertion into a no-op. This had raced invisibly for as long as the harness existed, because a development machine always won the race.

  **Three bare waits are gone, and this is the durable part.** Each was a `waitForFunction` whose failure surfaced as a raw Playwright `TimeoutError` naming a line number and no check — the precise complaint this harness's own header records against `launcher-packaging`'s first regression report, left standing in three places inside the file that records it. One had `check(..., true)` after it, a tautology where the wait carried the entire verdict. They now share one helper that reports **which** of two unrelated diagnoses occurred: a note rendering slowly, or a write the room *refused* — `notes-layer.mjs` proves those ceilings refuse for real, so a refusal is an ordinary thing to hit and was indistinguishable from a hang.

  **One thing is unresolved and is recorded rather than closed.** Two further intermittent timeouts were seen locally, in sections 2 and 5, waiting for a note to render after a submit. Neither reproduced — eight subsequent runs were green, four of them consecutively on a quiet machine — and **no cause was established**, so nothing here claims to have fixed them. The submit handler awaits its POST and then reloads the space explicitly rather than depending on the live-events poll, which makes a refused write the more plausible of the two candidates, but that is a hypothesis and not a finding. Shipping it into the gate anyway is a deliberate call: the diagnostic above means the next occurrence names its own cause instead of dying as a line number, which is the fastest route to actually knowing. If it turns out to recur often enough that a red tick becomes something to ignore, the answer is to take it back out, not to widen the timeout.

  ***Update — the leading candidate above is now ruled out, and the useful part is what the exclusion cost.*** It recurred twice more, and both times the composer said `<nothing>`: **no refusal**. A refused write paints an error in the composer, which is precisely what the diagnostic was built to detect, so "the room refused it" is no longer on the table. What replaced it as the obvious candidate was a stale-snapshot race — `loadSpace` and `applySnapshot` both blind-write `notesBySpace`, the revision each one needs to order on is on the wire and discarded — and **that was tried and failed to reproduce**, for a reason worth keeping: a parked `/events` poll is woken *by the note's own revision bump*, so the snapshot it returns already contains the note and applying it late changes nothing. Delaying the events path by three seconds left the harness green. A stale snapshot needs a poll woken by some *earlier* change and delayed past the write, which could not be forced reliably here. So the race remains plausible, unproven, and is not being fixed on a hypothesis.

  **What the recurrence did establish is the condition.** Both new failures happened with `notes-ui` running as the twenty-second harness of a long sequential batch; run on its own it was green eight times out of eight. It tracks machine load, not the harness. That also corrects a figure stated in passing during the investigation — "40%" was the rate inside those batches and 0/8 outside them, and quoting the first without the second overstates it.

  **So the diagnostic got sharper rather than the code getting a speculative patch.** On a miss the harness now asks the *service* whether the note exists, from inside the browser that failed to show it, using that browser's own stored origin and token — which splits the two remaining candidates cleanly: "the service HAS the note … the SCREEN did not show it" against "the service does NOT have the note — the WRITE never landed". Both halves were forced and watched (injections C and D in the harness header): dropping every note from `renderNotes`, and resolving `createNote` without issuing the POST. **Both print the identical composer line**, which is the measurement of how little the previous diagnostic could say — two defects in two different processes, indistinguishable from the screen alone.

  **Three candidate causes were investigated and none survived, which is recorded here so the next person does not repeat the search.** *The room's ceilings* were the first guess and are ruled out by arithmetic: the harness starts its own notes service with `EPI_NOTES_STATE: ''`, so the service is in-memory and every counter is fresh per run, and a single run spends about three of a 60-per-hour `notes.create` budget and one of a 10-per-hour `join.address`. *The parked-poll ceiling* (`DEFAULT_PARKED_POLLS = 4`, counted per member) is ruled out the same way: the run holds at most two or three sockets across two members. *A stale snapshot overwriting a fresh write* was the most promising, because it is a real shape in the code — `loadSpace` reads `client.notes()`, which returns `{ notes, revision }`, and **discards the revision** (`mobile-ui/src/notes-ui.ts`), while `applySnapshot` replaces the same map from the `/events` poll with no comparison at all. Two writers to one piece of state, both handed a revision, neither looking at it. **A deliberate attempt to exploit it did not, at the time, reproduce the symptom:** a probe that intercepts the browser's first `/events` request, holds its response until after the member types a note, and then releases that older snapshot, left the note on screen. No fix was made on the strength of a hypothesis that had failed its own test — the same rule that keeps pre-registration and the directory door unbuilt.

  **That was the right call on the evidence then, and the hypothesis was nevertheless correct.** The probe failed for two reasons that were about the probe: a route must be installed on the CONTEXT and catch a poll that STARTS after it, since a parked poll runs for 25 seconds and is not intercepted retroactively; and the disappearance repairs itself a poll later, so releasing the stale snapshot and then looking is a race against the recovery rather than an observation of the defect. Both were written down at the time, and both are what the successful reproduction needed. The race was forced, the note vanished, and `revisionBySpace`/`acceptRevision` in `notes-ui.ts` now drop state known to be older than what is held — see §9's account above, and the forced check in `scripts/live-verify/notes-live.mjs`. **This paragraph is left standing rather than rewritten**, because "the smell was real, the first probe was wrong, and the fix waited for evidence" is the whole lesson, and deleting the wrong half would remove the part worth having.

- [x] **CI now knows something about gossip, which is the one thing all of it was previously silent on — and getting there meant correcting a claim this changelog had made confidently and never checked.** `.github/workflows/network.yml`, running `real-gossip` against three real conductors on a real iroh QUIC network, on every push.

  **What was missing was not a harness but the arrangement it needs.** `conductor.yml`'s header ends by saying a green tick there is silent on gossip, partition and convergence between peers, because it is one conductor on one machine — and that understates it slightly. `hc sandbox generate` produces `transport_pool: []` and `bootstrap_service: null`, so there is no transport to gossip over and nobody to gossip to; every multi-agent harness in this repository then installs its extra agents on that same conductor, where they share one local DHT store and an entry is visible to the other agent instantly because it never travelled. That is the correct setup for the questions those harnesses ask and it makes this one unaskable. **`nodeC` is why the result is evidence rather than an anecdote:** same `.happ`, same code, same bootstrap server, same machine, differing from A and B in the network *seed* alone, so its DNA hash differs and it is on a different DHT. Without it, "B received it over the network" and "any conductor pointed at these services would have shown it" are indistinguishable. `real-gossip` also re-asks the read-scope question on a network demonstrably carrying claims: chain-local reads stay chain-local, which on one conductor could always be answered "it simply had not gossiped yet". Here there is gossip, and it still does not carry them.

  **The claim that had to be corrected was mine, and it was wrong in the most ordinary way.** Both `conductor.yml` and `scripts/live-verify/README.md` said these harnesses were held back only by scope, because their "bootstrap and iroh-relay binaries are published on the same release tag". The `holochain-0.7.0` tag publishes exactly three binaries — `hc`, `hcterm`, `holochain` — and no bootstrap server. The bootstrap service and the iroh relay are one binary from a different project, `kitsune2-bootstrap-srv`, and the `kitsune2` v0.5.1 release carries **no release assets at all**. There is nothing to download; it has to be compiled. That is not obscure knowledge, either: **`scripts/network.sh`'s own header has said `cargo install kitsune2_bootstrap_srv --version 0.5.1 --locked` since the day it was written.** The false sentence was produced by generalising from the `hc`/`holochain` download that made `conductor.yml` possible — the discovery that inverted that pull request — and it contradicted a file in this repository without anyone noticing, for two merges. **Both files now carry the correction in place of the claim**, not a quiet swap of the text, because the interesting part is that a checkable statement went unchecked precisely because the adjacent one had been so satisfying to check.

  **So the cost is real, and the answer is to pay it once.** About two and a half minutes to compile on a warm registry locally, which would be a poor thing to repeat on every push for harnesses that run in under a minute. The binary is cached on its own, keyed by exact version so a bump invalidates rather than silently restoring the old one under the new number, and the `cargo install` step is skipped entirely on a hit. **"On a hit" is load-bearing there, and a miss is not a bug** — GitHub scopes caches by branch, so a cache written on a branch is readable only by that branch while one written on the *default* branch is readable by all. The first run on a new branch can therefore rebuild despite a green run having cached the binary an hour earlier. Observed rather than deduced: the second run on this feature branch hit its own cache and took **3m17s**, and the very next run — same commits, on `main`, straight after the merge — missed, rebuilt and took **7m09s**. `main` has now written the cache in the scope every branch reads, so the shorter figure is the steady state. Recorded because a step named "Cache the …" that visibly rebuilds looks exactly like a wrong key and usually is not one. **Measured, not estimated:** `real-gossip` 47s of harness time locally and 67s as a whole step — the difference is `network.sh clean && start`, which brings three conductors and two services up in about 19 seconds and is run before **each** harness, not once before the batch. That rule is observed rather than inherited: `partition-rejoin` run straight after `transitive-gossip` on the same network died in its baseline phase with a 60-second zome-call timeout and passed in full on a freshly started one.

  **`transitive-gossip` shipped in this workflow, failed its own first CI run, and was taken back out — which is the part of this entry worth keeping.** It asks the question nothing else can: does an entry reach a node from a peer that did not author it? It is green locally in 29s, and it went green on CI on the *second* attempt. On the first, against an identical tree, it died waiting for nodeD to pick up the claim with a bare `Request timed out in 60000 ms: call_zome` — the `@holochain/client` default — while the baseline had crossed nodeA to nodeB in 5.0s earlier in that same run. So the network was working and one conductor stopped answering. **The evidence is bimodal, which is the most useful thing known about it:** on the passing run the identical wait reported `nodeD had it in 0.0s`. Gossip merely slowed by a loaded runner would give values in between; instant-or-never points instead at nodeD not being ready to answer when the first call arrives — a readiness race between `network.sh start-node nodeD` and that call, which a development machine always wins and which four conductors plus two services on two vCPUs is where you would first lose. **That is a hypothesis and it is not confirmed** — and it has since been tested and found wrong; see the entry below on what four experiments falsified — so nothing was fixed on the strength of it and the client timeout was not widened — the same rule this changelog already applied to the `notes-ui` intermittency two entries above, and the reason a red tick on this workflow stays worth reading. One failure in two runs is not a gate. `real-gossip` passed both runs and is what ships. `scripts/live-verify/README.md` estimates ~3 min for `transitive-gossip`; that was not reproduced, and the measurement is recorded beside the older figure rather than replacing it, since one fast run on one machine does not overturn somebody else's.

  **Twenty-five runs later, the bimodality is real and is in a different variable than anyone measured.** One machine, freshly generated network each time, three figures per run: the baseline nodeA -> nodeB crossing, how long nodeD took to acquire that same baseline claim, and whether section 3's acquire happened at all.

  | nodeD acquires the baseline | runs | outcome |
  |---|---|---|
  | 0.0s | 21 | all passed |
  | 5.0s | 1 | passed |
  | 30.1s | 1 | **failed section 3** |
  | 35.1s | 1 | **failed section 3** |
  | never | 1 | **failed the precondition** |

  **Every passing run had nodeD holding the claim within 5s; every failing one took 30s or never got it; nothing landed in between.** Meanwhile the baseline crossing over the same 25 runs was 5.0s twenty-two times, 10.1s, 135.4s and 140.4s — **and the two slowest baselines both passed.** So the *acquire* is not bimodal at all, which is what "instant or never" claimed, and has a genuine long tail that predicts nothing; **nodeD's join is** bimodal, and it predicted all three failures. The original intuition was pointing at something real, measured on the wrong variable with too few samples.

  **A window change was made on this evidence and then reverted by it, which is the part worth keeping.** Reading the failures as a tail that exceeded 330s, the acquire window was raised to 600s. The next batch failed at **661s** with that window in place, its nodeD having taken 35.1s to join. A nodeD in that state does not arrive late — it does not arrive, and no window helps. 330s is back, and 140.4s is the worst baseline it has to cover. Recorded rather than quietly reverted, because "the window was too short" is the obvious reading of a timeout and here it is wrong.

  **The harness now warns on a slow join and does not gate on it.** Tripping 15s — which sits in the empty gap between 5.0s and 30.1s — says the run is probably already lost and the ten minutes it will spend timing out is waste. It is a `::warning::` and not a failure because three failures are not a sample, and acting on n=3 is precisely what produced the readiness-race hypothesis this entry has just withdrawn.

  **3 in 25 is the answer on CI: still no**, and now with a rate rather than an anecdote about one bad run.

  **The other two multi-node harnesses are still out, and now with measured costs rather than a guess.** `partition-rejoin` takes about five and a half minutes and drives `network.sh stop-node`/`start-node` itself to take a conductor offline mid-run; `network-partition` takes about twenty-five minutes on 0.7 — reconciliation after a heal took ~930s in each direction — and installs `iptables` **and** `ip6tables` rules, refusing to run outside the throwaway namespace `scripts/netns.sh` builds for it. Neither is "it might work", which is what the sentence they replace amounted to.

  **It packs the `.happ` inline rather than running `pack-webhapp.sh`**, which is a deliberate small divergence: that script also builds, zips and packs the UI, and nothing in this job opens a browser, so running it whole would install `mobile-ui`'s dependencies and run a `vite` build to produce a bundle nothing reads. `conductor.yml` still drives the script unmodified on every push, so it does not stop being covered. The build-before-pack order is kept exactly, because `hc dna pack` compiles nothing and packing first would wrap stale wasm in a fresh timestamp — the trap that was once observed passing this entire suite with a deliberately broken `get_claims_by_domain`.

- [x] **The three surfaces an agent reaches for are in CI too, and adding them found a published package that does not work.** `.github/workflows/conductor.yml` now also runs `agent-sdk`, `mcp-server` and `linked-data-gateway` on every push — eight harnesses from `scripts/live-verify/` against a real conductor, up from five.

  **The exclusion was the cheapest one on the list, which is the lesson.** All three were held out of #105 for one stated reason — each needs its own package built first — and that reason was true and turned out to cost a `tsc` and about ten seconds of runtime each, conductor restart included. It sat in a workflow header as an exclusion for two pull requests, in the same list as `iptables` in a throwaway namespace and a nine-minute gossip backoff, and being adjacent to genuinely hard items made it read like one. **What they cover is not marginal either:** the SDK an agent imports (including the friction budget driven to exhaustion — twenty critiques until the twenty-first is refused as a *typed* `FrictionLimitError`, since an agent loop's pacing depends on telling "wait" from "broken"), the MCP server spoken to over stdio as JSON-RPC the way an agent actually reaches it, and the linked-data export held to the absence that defines it — no `aggregateRating`, no `upvoteCount`, nothing schema.org offers that would publish a canonical comparative score under this protocol's name and be believed downstream.

  **And the published SDK on npm is broken, which is the real find.** `mcp-server` depends on `@stateofintent/agent-sdk` *by version* — deliberately, since a `file:` path cannot resolve on anyone else's machine, and `scripts/check-packages.mjs` fails if that form returns. When that note was written the version was not on the registry, so a plain `npm install` 404'd, and the note said the whole paragraph could go once the SDK was published. It is published now, and **the plain install succeeds and gives you the wrong SDK**: the registry's copy rather than the checkout's, which would let a pull request changing `agent-sdk/src` be verified against code it never touched. Worse, that copy predates the `@holochain/client` 0.21 upgrade, where `CellInfo` became a discriminated union. The published build still tests `CellType.Provisioned in cell` — which compiles fine, because these values are `any`, and matches nothing at runtime — so it collects no cell ids, authorizes no signing credentials, and fails every zome call with `NoSigningCredentialsForCell`.

  **Watched failing, one line apart.** Built against the registry copy in a fresh clone, `mcp-server.mjs` goes red on **eight** checks; installed with `npm install --no-save ../agent-sdk` and rebuilt, the same harness on the same conductor is green. The workflow therefore installs the local path, as `mcp-server/README.md` has always documented, and then **asserts that what landed is a symlink** — a registry copy is a real directory, so the two are distinguishable, and the guard fails immediately with a named error rather than three steps later as eight inscrutable reds. That run also demonstrated one of this repository's own recorded traps working: the vacuous-pass control in section 5 stayed green through the wreckage, exactly as its header says an absence check does, while the CONTROL line directly above it went red and caught it.

  **`scripts/check-packages.mjs` is green on both packages throughout, and that is not a failure of it.** It installs each tarball into an empty project, imports it, and runs `mcp-server` as a binary until it advertises its nine tools — all of which the broken build does perfectly, because listing tools touches no conductor. The defect lives strictly past the point where a package stops being a package and starts making zome calls, which is exactly the boundary a live harness exists to cross and a packaging check by construction does not. Two checks, two different questions, and the answer to "does it publish, install and import" was never evidence for "does it work".

  **`@stateofintent/agent-sdk@0.1.1` and `@stateofintent/mcp-server@0.1.1` on npm were therefore both unusable against Holochain 0.7, and only a republish fixed it** — a version bump and a publish by someone holding the credentials, which no workflow here can do. **That republish happened on 2026-09-12: `0.1.2` is on the registry and `latest` for both, and an install by version into an empty project outside this checkout writes a claim to a real conductor and reads it back.** `0.1.1` is still there and still broken; nothing resolves it now that `latest` has moved and `mcp-server` requires `^0.1.2`. Recorded in `agent-sdk/README.md` and `mcp-server/README.md`, where a person installing the package would actually look, rather than only here.

  **One consequence outlives the fix, and it is the one that matters for CI.** `conductor.yml` installs `../agent-sdk` with `--no-save` rather than letting `npm install` resolve the range, and until now that had two reasons: the registry copy was not this tree, *and* it was broken. The second is gone — a plain install there now resolves a working `0.1.2`. The first has not moved and never will: a pull request changing `agent-sdk/src` must be verified against the checkout, not against whatever the registry serves, or it passes against code it never touched. The guard asserting a symlink landed is therefore still load-bearing, and now carries the whole weight. `mcp-server` also ships no lockfile, which is why every instruction for it says `npm install` and never `npm ci`; that is still open, though not for the reason recorded until now — a lockfile cannot change what a published install resolves, since npm never packs one, and what actually blocks `npm ci` there is that it cannot coexist with the local-SDK install. §9's open-questions list and `mcp-server/README.md` carry that correction.

  **A ten-minute non-failure is also now documented in `scripts/sandbox.sh`.** `sandbox.sh start | tail -3` never returns, and it is not a holochain quirk: `start` deliberately leaves a `holochain` process running, that process inherits the script's stdout, and `tail` cannot print until the write end closes — which is held open by a conductor meant to outlive the command. It looks exactly like a conductor that failed to come up, which is the wrong thing to spend the time debugging. The header now says to redirect instead.

- [x] **The room is actually a shared room now — two people in it see each other write.** `mobile-ui/src/notes-ui.ts`, and `scripts/live-verify/notes-live.mjs` (20 checks, two browser contexts, no conductor).

  **The gap was a shipped feature not doing what its README said.** `GET /spaces/:id/events` — a 25-second long-poll that answers the moment a space changes — existed from the day the service was written, and nothing in the browser ever called it. The screen refreshed when the person using it acted, and at no other time, so two members in one notebook wrote past each other invisibly. What made it survive four harnesses is worth recording: **every one of them drove a single client**, and a single client is exactly the configuration in which this bug cannot appear. The fix is a poll loop; finding it needed a second browser, which is now a harness.

  **Going live is what created the interesting failures, not what fixed them.** A screen that rebuilds itself whenever a stranger writes is a screen that can throw away a half-typed sentence, move somebody's caret mid-word, or overwrite an edit that landed while a save was in flight — three defects that were unreachable while nobody could see anyone else's writing arrive. Drafts therefore live in module state rather than in the DOM, the caret is restored across the rebuild, and both are checked by writing a sentence into one browser, having somebody else write from outside it, and asserting the sentence and the cursor both survived.

  **The clobber, which is the one that would have hurt.** Any member may rewrite any note — a shared notebook, not adjacent private ones — but the second save used to win *silently*, and the first person's paragraph vanished with nothing on either screen to say it had. Notes now carry `rev`, a save may state which version it was written against, and one written against a version somebody already replaced is refused with a 409 instead of applied. The refusal is opt-in at the service (`curl` stays usable; omitting it means "I do not care what I overwrite") and always sent by the browser. On screen both versions are shown, the refused draft is kept exactly as typed, and overwriting anyway — having read theirs — is a second deliberate press. **A version counter rather than a timestamp**, because two edits inside one millisecond are indistinguishable by clock, and "rare" is not "impossible" for a check whose only job is catching a race.

  **The ceiling shipped one step earlier turned out to have a hole, and the client is what found it.** `events.parked` counts held sockets per member, which is right for a route designed to park — but the service released the slot only when the poll finished, so a browser hanging up on its way out of a room kept the slot for up to 25 more seconds. Walk in and out of a room four times inside half a minute and the member is locked out of their own room by a limit built to bound machines. The client now aborts on the way out and the server releases on socket close, and the harness sets the ceiling to **one** so "did it actually let go" is answered rather than assumed.

  **Watched failing twice.** Moving the composer's draft back into the textarea's own value — where it lived before this work, and where it looks harmless — turned exactly two checks red, the draft and the caret, while every arrival check stayed green: the room was still live, and being live is what destroyed the sentence. Deleting the `expectedRev` check in the store turned two red, the refusal and then, one step later, "keeping theirs leaves their version standing" — the defect arriving where a person actually meets it. The conflict *warning* stayed green under that second injection, correctly: the screen still noticed the note had moved, it simply no longer stopped anything, and a warning is not a guarantee.

  **And the ceilings turned out to bind the assistant, which nobody had checked.** `assists.answer` is 60/hour per member and an AI member is a member, so a tireless participant in a busy room is exactly who runs out first — the cap working, not failing. What was wrong was the client: `assistant-main.ts` swallowed the 429, so the question was retried on the next wake of its own `/events` poll, which means **the retry rate was whatever the room's write rate happened to be** — invisible in a quiet room, once per note anybody typed in a busy one, and with an API key set, a paid model call each time to produce an answer the room was about to refuse. It now waits the number of seconds the service named, calls no suggester while paused, says whose friction this is so nobody goes looking at their agent key, and **stops on a dead membership** instead of retrying a 401 forever, since a token that no longer authenticates cannot be recovered by asking again.

  **And it turned out the documented way to stop an assistant did not exist.** Three places in this repository said an assistant could be stopped by "revoking the link or removing the member". Neither half was true: an invite is consulted only at join time, so revoking it stops the *next* arrival and not one already in the room, and `NotesStore.removeMember` — named here and in two other places as existing but unexposed — **did not exist either**. The store had `leave`, which is somebody removing themselves. The claim had been repeated for long enough to read as verified, including, briefly, in this roadmap entry, which then repeated the half about `removeMember` as well: a false claim checked against another document rather than against the code stays false and gains a citation. **It is built now** — a removal is a note in the room, any member may write one, the token dies immediately and the door closes behind them — and the decision that blocked it, "who may remove whom", is recorded with its costs in `notes/README.md`. The 401 handling above is what makes it land.

  **Two checks in this work had to be strengthened after passing against a live defect, which is worth recording as a pattern rather than as two anecdotes.** The retry-storm check counted a log message that the broken version no longer wrote, so zero waits passed a test for "not many waits"; it now counts every shape of "tried and could not", and makes the room busy while the ceiling is full, which is the only condition under which a bad client and a good one differ. The shutdown check asserted that `SIGTERM` does not wait out a parked long-poll — but sat in a harness where whether anything was parked at kill time was luck, and passed cleanly against a server with the defect still in it; it moved to `notes-layer.mjs`, where the poll is parked on purpose first. Both now go red on injection. The lesson is the one this project already recorded against the auto-apply check: a green result is evidence only about a check that has been watched failing.

  **What was not built when this entry was written — and all three have since shipped.** The line here used to read "what is not built yet, and is not claimed to be", naming the browser client and promotion flow in `mobile-ui/`, the in-space AI collaborator, and the Linked Data face for published entries. Every one of them landed afterwards, each with its own entry and its own harness: `mobile-ui/`'s promotion flow (`scripts/live-verify/notes-ui.mjs`), the AI in the room as a member rather than a feature (`notes/src/assistant.ts`, `assistant-main.ts`, `notes-assistant.mjs`), and the Linked Data face (`gateway/`, `linked-data-gateway.mjs`). The sentence is kept rather than deleted because a changelog that silently edits its own past is worse than one that is out of date: what it said was true when it was written, and the correction is the useful part. **A document that asserts its own obsolete state is worse than one that says nothing**, which is why this was tracked as an open item until it was fixed.
- [x] **The screen is in CI now — seventeen browser harnesses against a real conductor, and the exclusion that had held them out was one hardcoded path.** `.github/workflows/ui.yml`, and `scripts/live-verify/chromium.mjs`.

  **Three files recorded this exclusion and none of them recorded its size.** `conductor.yml`, `scripts/live-verify/README.md` and this changelog each said the other seventeen conductor-bound browser harnesses stayed out because they hardcode `/usr/bin/chromium`, and each added, carefully, that they "wait their turn behind a check, not behind a preference". That was the whole of it. Every other cost had already been paid by `conductor.yml`: the Holochain binaries are a download rather than a build, the clean-conductor-per-harness rule that is a chore on a development machine is free on a fresh VM, and `pack-webhapp.sh` already builds the `mobile-ui` bundle these harnesses drive, because building it is what packing a webhapp means. The exclusion had been sitting in the same bulleted list as `iptables` in a throwaway namespace and a twenty-five-minute reconciliation, and being adjacent to genuinely hard things made it read like one — **the same failure this changelog recorded two entries ago**, when `agent-sdk`, `mcp-server` and `linked-data-gateway` sat excluded for two pull requests and turned out to need a `tsc` and ten seconds each.

  **All seventeen were green locally before the workflow was written, and green again after the edit.** 247 seconds of harness time for the set, from 9s (`hud-layer`, `membranes-ui`, `founding-ui`, `graph-ui`) to 36s (`layout-fits`, six tabs at three widths), plus about six seconds per conductor restart. Run twice on purpose: once against the tree as it stood, so that a red tick would be evidence about the runner rather than about a harness nobody had ever run, and once after the Chromium change at 243s, with `notes-ui` and the three conductor-free browser harnesses added to that second pass because they were converted in the same commit. Twenty-one green.

  **The rule for touching them was kept rather than waived, which is the part worth carrying forward.** `notes-ui` resolved the browser path when `conductor.yml` took it, on a rule stated at the time and narrower than "so change them all": **change the resolution in the harness you are adding to CI, in the same commit that adds it**, so the edit is exercised by the check that motivated it. Seventeen files edited to satisfy a workflow running one of them would have been churn wearing a better justification. `ui.yml` runs all seventeen, so all seventeen changed here — and every file that now resolves the browser is exercised by the commit that made it resolve it.

  **It became a module rather than a line each, because by then there were four copies of the same paragraph.** `notes-ui`, `theme-pinning`, `notes-live` and `notes-assistant` each carried the same fifteen-line comment explaining `EPI_CHROMIUM`, then the system path, then Playwright's own download. Twenty-one copies is the exact shape `scripts/live-verify/README.md` warns about in its own opening: the clean-conductor rule was "stated eight times, once per file, and visible in no place where someone decides to run them all". The reasoning now lives once, in `chromium.mjs`, and the harnesses import a constant. What deliberately did **not** move is Playwright's own resolution out of `mobile-ui/node_modules` — that one prints a specific "install it there first" message, and hoisting it would put that message one import further from the file somebody actually ran.

  **A separate workflow rather than seventeen more steps in `conductor.yml`,** because each workflow here exists to make one tick readable on its own: `zomes.yml` says it compiles and its units hold, `live-verify.yml` says the layer above the promotion gate works, `conductor.yml` says the protocol does what it says against a real DHT, `network.yml` says an entry crosses between peers. This one says what none of those says — **that the screen tells the truth about the protocol underneath it**: no node drawn bigger than another, no trust lens on by default, no chain-local read presented as global, no score beside a person. Folding it in would have made one tick mean two things, made a red one ambiguous, and roughly tripled the runtime of the job that currently gives the fastest protocol answer. `notes-ui` stays in `conductor.yml` for the mirror-image reason: it is the promotion gate itself, and moving it would quietly shrink what that tick covers. That is the one deliberate overlap in intent between the two files, and it is written into both headers.

  **A false claim in `conductor.yml`'s header was corrected on the way past.** It said `real-gossip` and `transitive-gossip` "now run in `network.yml`" and listed "two of the four" multi-node harnesses as excluded. True for exactly one commit: `transitive-gossip` shipped there, failed its own first CI run against an identical tree, and was taken back out. That removal was recorded in `network.yml`, in `scripts/live-verify/README.md` and here — and not in the one other file that named it, which is how a file can go stale while three others are careful. Three of the four now, with the correction left visible rather than swapped in silently, because a harness leaving CI is the same kind of event as one arriving.

  **What is still not automatic**, with measured costs rather than a guess: **two** of the four multi-node harnesses. `network-partition` (~25 min, and it needs `iptables` **and** `ip6tables` inside the throwaway namespace `scripts/netns.sh` builds); and `transitive-gossip`, which is out on its own evidence. *(`partition-rejoin` was the third and now runs on every push — see the entry at the end of this section. The readiness race this paragraph named as the condition for `transitive-gossip` returning has since been tested and is not supported, so that condition no longer means anything; what it waits on now is repeated green runs, not a demonstration.)*

- [x] **A single-node sandbox was reaching for public infrastructure it did not need, and it took two workflows red on a tree that had been green for days.** `scripts/sandbox.sh` now runs its own `kitsune2-bootstrap-srv`, as `scripts/network.sh` always has.

  **The generated config is the whole story, and nothing in this repository had ever read it.**

  ```yaml
  network:
    bootstrap_url: https://dev-test-bootstrap2.holochain.org/
    relay_url: https://use1-1.relay.n0.iroh-canary.iroh.link./
    request_timeout_s: 60
  ```

  `hc sandbox generate` writes that by default. A development machine reaches both instantly and nothing is visible, which is why it survived every green run recorded here. A CI runner that could not reach them turned zome calls into stalls of exactly `request_timeout_s`, sometimes surfacing the host-side wait and sometimes only the client's view of it:

  ```
  holochain::core::ribosome::host_fn::get_links:72:
    Host("iroh connect timed out (src: deadline has elapsed)")
  Error: Request timed out in 60000 ms: call_zome
  ```

  **Four observations, two workflows, four harnesses.** `ui.yml` lost `hud-layer` to the named error and `neighborhood-ui` to the bare client one; `conductor.yml` lost `domain-index` and then `read-scope`, on a job that had been green on `main` for days and was untouched by the work that exposed it. **`main` would have gone red on its next push regardless.** Striking the first harness of one job and the fourteenth of another also rules out the obvious hypothesis that many conductor start/stop cycles exhaust something: it is the runner's reach at that moment, not position in the run.

  **The job that stayed green is what named the cause, which is worth more than the failures were.** `network.yml` runs *three* conductors on real QUIC with a real iroh relay and passed every one of those runs. If the runner's networking were broken it would have been the first to die. The difference is that `scripts/network.sh` has pointed its conductors at a `kitsune2-bootstrap-srv` of its own since it was written — the single-node sandbox was the only thing here still trusting a third party. A green tick on the harder job is what proved the easier one was misconfigured.

  **`network mem` was tried first and is not what shipped.** The in-memory transport genuinely removes the QUIC dial, and the host-side `iroh connect timed out` stopped appearing — but the generated config still names both public URLs, and the sixty-second stalls continued unchanged. Recorded because it looks like it ought to work and cost a full CI cycle to disprove. Pointing the bootstrap at a black-holed address was tried too, and is worse than useless: the conductor then never finishes starting at all, which is a different failure wearing the same clothes.

  **The fix is not a longer timeout, deliberately.** The rule this changelog applied to the `notes-ui` intermittency and again to `transitive-gossip` is that a timeout raised to hide a stall makes it slower to notice rather than absent — and this stall is not even in the client.

  **What it costs, stated plainly.** `sandbox.sh` now has a service dependency: `cargo install kitsune2_bootstrap_srv --version 0.5.1 --locked`, the same binary and version `network.sh` already required, resolved from PATH or `~/.cargo/bin` the same way and failing with that exact command in the error when it is missing. One instance serves both the bootstrap and the relay role on `:8887` — below this script's 8888/8889 and clear of `network.sh`'s 8890-8899, so a three-node network and a sandbox can be up at once, which `scripts/live-verify/README.md` already promises. `network.sh` runs two instances on two ports instead, and that split stays: it exists only so `network-partition.mjs` can sever peer traffic while proving the bootstrap stayed up, and one conductor has no such control to preserve. `conductor.yml` and `ui.yml` cache the binary under the key `network.yml` already uses, so a runner that has built it once restores it rather than spending two and a half minutes.

  **Verified across every conductor-bound harness in the repository, not just the ones that failed.** All twenty-five — the seventeen in `ui.yml` and the eight in `conductor.yml` — green against the local bootstrap, at timings indistinguishable from the public-bootstrap ones (247s for the seventeen, the same total as before). `notes-ui` failed once in that sweep and passed on re-run, on the section-2 "note did not render after a submit" intermittency this changelog records as open and uncaused; it is the same shape, and nothing here claims to have touched it.

  **A first attempt at that sweep failed almost entirely, and the cause was the person running it.** Twelve harnesses died with `unable to open database file` after a hand-run `hc sandbox generate` left stale sandbox paths behind — `hc sandbox clean` reported removing four. Recorded because the failure looked exactly like "the change broke everything" and was one directory of leftover state. The clean-environment rule this repository enforces per harness applies to the machine running the sweep too.

- [x] **This correction was already made once, in the one file a stranger reads, and propagated to none of the eight that a contributor reads.** `INSTALL.md` has said for some time that the five-and-a-half-minute catch-up figure "was accurate when written", measured under Holochain 0.4's tx5/WebRTC transport, and that on 0.7 the wait is **about a minute** — 65s and 60s from its own run. Meanwhile §9 above, `scripts/live-verify/README.md`, `network.yml`, `conductor.yml` and three harness headers all still advertised ~5.5 min and still explained it with a config parameter that no longer exists. **The failure mode is this repository's own recurring one, in its least visible direction:** it has twice recorded that a claim stated in many places reads as verified, and here a claim *corrected* in one place stayed wrong in eight. Corrected now in all of them, and independently re-measured.

  **The constant does not exist in what runs today.** `gossip_peer_on_error_next_gossip_delay_ms: 300000` is cited as living in "the conductor's own config", and it did: it is a `kitsune_p2p_types` **0.4.4** tuning parameter — kitsune1 — documented there as *"How long should we hold off talking to a peer we've previously gotten errors speaking to. [Default: 5 minute]"*, exactly as these files describe it. `holochain --version` on this machine is **0.7.0**, which uses **kitsune2 0.5**, and the name appears nowhere in it. Searched rather than assumed: the only copies on this machine are under `kitsune_p2p_types-0.4.4`, `kitsune_p2p-0.4.4` and `holochain-0.4.4`.

  **kitsune2 has no per-peer error backoff at all.** Its gossip defaults are `initiate_interval_ms: 120_000`, `initiate_jitter_ms: 10_000`, `min_initiate_interval_ms: 300_000`, `round_timeout_ms: 15_000`, `initiate_burst_factor: 3`, `initiate_burst_window_count: 5`. The 300s that remains is a **floor on re-initiating with the same peer**, not a penalty for having failed to reach one — a different mechanism that happens to share the number, which is exactly how a stale citation survives a substrate change.

  **And the figure moved with it.** `partition-rejoin` recorded catch-up at 326.6s, re-measured at 326.7s, on 0.4.4. Re-run twice on 0.7 **with nodeD down — the two-member arrangement the old figure is specifically attributed to** — catch-up was 50.4s/40.3s, then 55.4s/55.3s from a freshly cleaned network. Total harness runtime 1m35s and 1m45s against the ~5.5 min this changelog advertised. Those figures agree with `INSTALL.md`'s independently measured 65s/60s to within the spread of a single run, which is the useful part: two measurements taken for different reasons, months apart, land in the same place.

  **`INSTALL.md` attributes the improvement to the transport — 0.4's tx5/WebRTC replaced by 0.7's iroh QUIC — and this adds a second mechanism rather than displacing that one.** Both are consequences of the same substrate jump, and the disappearance of the backoff parameter is the half that can be checked by grep rather than by measurement: a five-minute penalty that no longer exists cannot be waited out, whatever the transport underneath. Neither claim is instrumented directly here, and both are stated as the inferences they are.

  **What this does NOT overturn.** The reasoning in those paragraphs was sound for the substrate it was written against, and the 326.6s/326.7s pair was a genuine paired measurement — what moved is underneath both figures, so the old numbers are left as recorded rather than restated. It also does not travel to `network-partition.mjs`, whose 930.0s/924.9s were measured **on 0.7** and stand on their own: a stopped peer refuses a connection and errors quickly, while a peer whose packets are dropped has to time out, so the two harnesses are not measuring the same thing and a correction to one is not a correction to the other.

  **A duplicated bullet fell out of the same sweep.** `network.yml`'s list of excluded harnesses carried the `partition-rejoin` line **twice**, identically, and it was the second copy that revealed it — a search-and-replace corrected one and left the other standing next to it. Collapsed into one. Three excluded harnesses listed as four is the same kind of thing the stale figure is: nobody reads a comment block for arithmetic.

  **No window changed.** 600s in `partition-rejoin` and `transitive-gossip`, 330s for the acquire waits, ~30 min in `network-partition` — all still comfortable, and all now described as headroom rather than as derivations from a parameter that is not there. The rule they were invoked for is the reason to keep them long and is untouched: a window shorter than the mechanism it times measures itself rather than the mechanism, and being generous costs nothing because every one of those loops exits the moment the claim arrives. **The defect was the justification, not the number** — the same class as the `PROMPT_PUBLISH_MS` sequence and the lockfile reason corrected earlier in this section.

- [x] **`partition-rejoin` runs on every push, and it was excluded on a number rather than a constraint.** `.github/workflows/network.yml` now runs two harnesses. Nothing else automated asks whether a node that was OFFLINE while the network moved on catches up at all.

  **The exclusion was never reconsidered because the figure it rested on was never rechecked.** This changelog, `network.yml`, `conductor.yml` and `scripts/live-verify/README.md` all listed it as costing about five and a half minutes and left it out "for cost". That figure was measured under Holochain 0.4.4; the same harness measures **1m45s** on 0.7, twice. At the real number the cost argument does not survive contact with it — the previous entry has why the number moved. **The pattern is worth more than the harness:** an item stayed out of CI for as long as a stale measurement went unchallenged, and no reasoning was ever wrong — the reasoning was applied to an out-of-date input, which is a failure mode no amount of careful argument catches.

  **Hardened before being switched on, not simply enabled.** Its wait loops were killed outright by one unanswered read, and no exit path restored the network after it had stopped a conductor, so a failure left the NEXT harness broken. Both were watched failing and then passing before this step existed. Switching on a harness whose known failure modes were still live would have bought a flaky red tick, which this repository has repeatedly refused.

  **The job timeout went from 30 to 45 minutes, and not because the expected cost rose.** Expected total is well under ten minutes even allowing for two vCPUs. `partition-rejoin` calls `awaitConvergence` twice with a 600s window each, so a slow but legitimately passing run can want twenty minutes on its own — and a timeout it could reach would kill a passing run and report it as a failure, which is exactly the flaky-red-meaning-nothing this section keeps refusing. Sized from the worst case, not the observed one.

  **It gets its own clean network rather than sharing `real-gossip`'s.** It drives `stop-node`/`start-node` itself and ends by restarting what it stopped, so a harness inheriting a network another was halfway through repairing breaks the one-clean-conductor-per-harness rule in a subtler way than usual.

  **Also corrected on the way past, in the file that had it wrong:** `network.yml`'s header still said the nodeD readiness race "has not been confirmed". It has since been tested and is not supported — a node generated fresh into a running network and called immediately answered inside 10s. That paragraph is left standing with the correction attached, because its reasoning was the right shape and only its conclusion was wrong. Which is the second time in two entries that a correction had been made in one file and not the others.

- [x] **SPEC §10.0's open design question is answered, and the answer is different for each of the three reads it held back.** `LinkTypes::MembraneRegistry` in the integrity zome, written by `create_membrane`, read by `get_membranes`.

  **Treating them as one class is what kept the question open for as long as it stayed open.** §10.0 held `get_critiques_by_mode`, `get_membranes` and `get_all_constitutions` back together, as "a single global index over an unbounded, ever-growing set". That objection is decisive for two of them and weak for the third, and nothing could be decided while they were argued as a group. What separates them is not boundedness in the abstract but **what the index grows with, against whether any reader wants the whole of it.**

  **`get_membranes` gets the index.** A `Membrane` is founded once per domain, so the index grows with **foundings, not with activity** — strictly slower than `DomainToClaim`, which grows with every claim and was accepted without argument. And it is the discovery surface: you cannot join a membrane you cannot find.

  **It was not a firehose nobody wanted. It was a live defect, and the UI was showing it.** `mobile-ui`'s Domains tab calls `get_membranes` with **no scope caveat anywhere** — unlike the by-mode reads, which the UI labels "your own" in three places precisely because they are chain-local. So on any multi-agent network the Domains tab showed each agent only the domains they had founded, and a newcomer saw an empty tab and concluded there were none. That is the same defect §10.0 already records as the motivating case for the by-domain index — "browsing a domain returned only your own claims" — one scale up, sitting unnoticed while the class-level argument ran.

  **`get_critiques_by_mode` stays chain-local, and the objection is strongest there.** Five `CritiqueMode` variants means five anchors accumulating every critique ever written, forever: unbounded growth concentrated on a fixed, tiny number of DHT locations, the worst hot-spot shape this substrate offers. And the questions people actually ask are already served DHT-wide — `get_critiques_for` for a target, `get_discourse_health`'s `critique_mode_distribution` for a domain. **The domain-scoped version already exists**, which makes the global one redundant rather than missing.

  **`get_all_constitutions` stays chain-local and is additionally the wrong question.** It grows linearly with *agents*, the least bounded of the three; `get_agent_constitution` already answers what anyone actually asks, DHT-wide; no client calls it and the SDK does not expose it. A list of every agent's published promises is nearer a surveillance surface than a discovery one, which is a reason to want its absence rather than tolerate it.

  **Validation, watched refusing rather than asserted.** The same three properties as `TaxonomyToSpecies`, reading `Membrane.creator` where that reads `CritiqueSpecies.proposer` — the near-miss the integrity zome's own audit note warns about, since neither field is called `author`. `attempt_false_membrane_registry` is the negative-path prober, and `domain-index.mjs` §2c now watches all three refuse for real: one agent indexing another's membrane, a non-`Membrane` target, and a membrane hung off a base that is not the registry anchor. Each refused by DHT validation rather than a coordinator guard, and the registry holds exactly the one real membrane afterwards.

  **Link-only, with no chain-query fallback, which is normative and not incidental.** A union with the old query would return the caller's own membranes whether or not the index worked — so on a single-agent conductor, the only kind this protocol was tested on for most of its life, a broken index would go on passing every test. That fallback is exactly what hid this defect for as long as it hid.

  **Appended at the END of `LinkTypes`, deliberately.** Link types are position-indexed: inserting one above would renumber every type after it and silently reinterpret every existing link of those types.

  **This forks the network, and the version says so.** A new link type is an integrity-zome change, so the DNA hash changes (§11.1) — old and new peers never gossip and no in-place migration exists. `PROTOCOL_VERSION` and `dna/dna.yaml` both go to **2**, per §11.2's rule that any integrity change altering what is accepted MUST bump it. `protocol-version.mjs` confirms the pair is coherent, including that a DNA misdeclaring itself is refused every write while still answering the question that explains why.

  **Evidence.** `read-scope.mjs` asserted `get_membranes` does NOT see another agent's membrane; that assertion is inverted and passes — two real agents, agent 2 seeing a membrane agent 1 founded, where it saw zero before. `domain-index.mjs`, `trust-lenses.mjs` and `membranes-ui.mjs` all green against the repacked hApp, each on its own clean conductor.

- [x] **SPEC §11.3's open question was answered twice before it was asked, by this protocol's own shipped entry types.** The decision is recorded; the entry type is deliberately not built yet.

  **The question.** Whether provenance across a fork belongs *in* the protocol — an entry saying "this is a re-publication of something I authored on network X" — or entirely outside it. §11.3 recorded three objections to the in-protocol option: it talks about a network the reader cannot query, §5.3 cannot check its reference, and its only purpose is that talk.

  **Every one of those objections describes something §2.11 and §2.12 already do.** `BridgeRecord.twitter_id` references a platform this DHT cannot query at all, and §2.11 documents the asymmetric-witness limitation instead of treating it as disqualifying. `FederationRecord` is the exact shape needed: it references **a different Holochain network**, by fields its own definition calls "an opaque, out-of-band reference — never a real Holochain hash on THIS DHT", one-sided by construction, with reciprocity pushed to an external witness that has queried both sides. Fork provenance is that situation with the remote network being this network's own predecessor. **So the answer is in-protocol, on the correlative-witness pattern, and the question was open because nobody had connected it to the pattern rather than because the merits were close.**

  **This is the second time today that a question recorded as open turned out to be answerable from precedent the document did not cite** — §10.0's index question was the first, where treating three unlike reads as one class kept it open. Worth naming as a pattern: this repository is unusually good at recording what it has not decided, and that creates a specific failure mode where a recorded question acquires standing and stops being re-examined against what shipped since.

  **What it inherits.** The record's `author` MUST be the migrating agent (§5.2), so provenance can only ever be self-asserted — the same rule that makes migration voluntary and partial. And it MUST NOT be presented as evidence the referenced entry existed or was valid; it is one agent's statement about a network the reader cannot query.

  **Deliberately not built, and for fork economics rather than doubt about the decision.** A new entry type is an integrity change, so it forks the network again — and forking to ship a type no agent yet writes spends the network's identity on nothing. It rides along with the migration tooling that would use it, so one fork carries both. §11.1 says a coordinator-only change should not be batched into an integrity change; this is that rule's converse.

- [x] **Every recorded open question audited against the codebase, after two in a row turned out to be already answered.** §10.0's index question and §11.3's fork-provenance question were both closed this session by reading them against precedent the documents did not cite — so the remaining ones were read the same way rather than assumed live.

  **What was checked.** `SPEC.md`'s only explicitly-recorded open question was §11.3, now closed. README §9's open-questions list held four live items, and its unchecked roadmap items three more. Each was tested against the code rather than re-read.

  | Question | Verdict |
  |---|---|
  | Whether the remaining chain-local reads should be indexed | **Was already answered** — §10.0, this session. The bullet still said "a question nobody is tracking"; corrected above |
  | `mcp-server` ships no lockfile | **Answerable, and the recorded blocker was too strong** — see the entry below |
  | Why a node sometimes joins the DHT and exchanges nothing | **Correctly open.** Measured at 3 in 25 this session, cause unknown, upstream. Reported at holochain/kitsune2#638, which is now **closed** — on the merge of its error-attribution half (#639); the symptom half was never addressed and has no successor issue |
  | No Android or iOS build | **Correctly open**, and the blocker is precise and dated: `tauri-plugin-holochain` pins `holochain_types = "0.6"` while these zomes pin `hdk = "=0.7.0"` |
  | Pre-registration (commit-reveal) | **Closed this session** — built, with the denominator structural rather than bolted on. The need was finally stated; the selective-revelation flaw is what shaped the implementation. See the entry below |
  | Migration across a fork | **Closed this session** — §11.3, in-protocol on the correlative-witness pattern |

  **Two of six were not live, and a seventh finding fell out of checking the numbers.** The surfacing item's headline and its own verified-recount paragraph had drifted apart — see the correction above, where 58/37/21 becomes 60/38/22 and `get_protocol_version` turns out never to have been accounted for.

  **The pattern is worth stating because it is not carelessness.** This repository records what it has not decided more carefully than most, and that has a specific cost: **a recorded question acquires standing.** It stops being re-read against what shipped after it was written, and the more precisely it was argued the more settled it looks. Both questions closed this session were answerable from existing precedent with no new information — one needed three unlike things separated, the other needed one sentence connecting it to `FederationRecord`. Neither needed research. The defence is not to record less; it is to re-read the open list against the code periodically, which is what this entry is.

- [x] **`mcp-server` commits a lockfile, and the reason it did not was wrong twice over.** `mcp-server/package-lock.json`, `npm ci` in `conductor.yml`, and one new invariant in `scripts/check-packages.mjs`.

  **Two reasons were recorded for the gap, and both were too strong.** The first — "adding one changes what a published install resolves" — is simply false, since npm never packs a lockfile into a tarball; that was corrected earlier in this session. The replacement was better and still wrong: it said `npm ci` "deletes `node_modules` and installs exactly the lockfile, which cannot coexist with `npm install --no-save ../agent-sdk`". **That is true in one order only.** Run `npm ci` first and the local install second and they compose exactly as intended — a reproducible tree from the lockfile, then this checkout's SDK swapped into it — and `--no-save` leaves the committed lockfile byte-identical, so nothing is overwritten per run and nothing needs regenerating. Tested, not argued.

  **So the two things held to be in tension never were**, and `mcp-server` now has the same build reproducibility as the other seven packages while keeping the local-SDK guarantee that `conductor.yml`'s symlink assertion defends.

  **One invariant comes with the lockfile, and its justification is deliberately narrower than the tempting one.** A lockfile carrying `"link": true` with `"resolved": "../agent-sdk"` was found in a working tree on 2026-09-12 with `package.json` clean — so that state is reachable, and it now matters more, because `npm ci` reads this file and such an entry would make CI resolve the SDK from a sibling directory that exists on one machine. `check-packages.mjs` now asserts every lockfile entry resolves from the registry, and was watched failing on a deliberately polluted lockfile before being trusted.

  **What produced that file was not reproduced, and the check says so rather than naming a cause.** Two candidates were tested and both behave correctly: `npm install --no-save ../agent-sdk` leaves an existing lockfile byte-identical and creates none when absent; the flagless form does write the link but also rewrites `package.json`, which the existing check already caught. The invariant is therefore justified as cheap rather than as a defence against a known command — which is the same rule this session applied to the gossip flake, where a mechanism that could not be demonstrated was not asserted.

- [x] **The `network` job is flaking at 3 in 13, the mechanism is named, and the fix is deliberately not chosen yet — the harness now takes the measurement that would choose it.** `scripts/live-verify/real-gossip.mjs`.

  **The rate, counted rather than felt.** Three of thirteen completed `network` runs went red on 2026-09-12, and one of them was on `main` after #155 merged and went unexamined for four hours, because PR checks were being read and the post-merge run was not. Two harnesses, one root: a nodeA -> nodeB crossing that does not happen inside `CONVERGE_WINDOW_MS` — `real-gossip`'s own crossing twice, `partition-rejoin`'s baseline once.

  **The mechanism was already named by this repository's own instrumentation.** `real-gossip.mjs` carries a table matching conductor-log patterns to causes, and the failures hit `Unsolicited Accept message` — "a gossip round's Accept arrived after the initiator had timed out (15s), so the reply was discarded as unsolicited". That 15s is kitsune2's `round_timeout_ms`. A round must finish inside it; the next initiation is `initiate_interval_ms` (120s) plus up to 10s of jitter away. Two abandoned rounds exceeds a 330s window, which is also why one failing run's reverse leg crossed at 203.2s while its forward leg never did.

  **That leaves two candidate fixes and, until now, no way to choose.** Either the op eventually arrives and the WINDOW is the constraint, or it never does and no window helps — pointing instead at `roundTimeoutMs` being too tight for a 2-vCPU runner, which is settable as `roundTimeoutMs` under the conductor's `network.advanced` where `irohTransport` already sits.

  **Local reproduction was attempted first and failed.** Five `real-gossip` runs with all three conductors and the harness pinned to two CPUs (`taskset -c 0,1`, affinity confirmed per pid) passed 5 of 5, slowest crossing 16.2s. Two pinned cores here are not two vCPUs there, so the measurement has to be taken where the failure happens.

  **The count is now 4 in 14, and the split decided where the instrument had to go.** A fourth failure landed on `main` after #159 — `partition-rejoin`'s baseline again — making it two `real-gossip` crossings and two `partition-rejoin` baselines. Both wait 330s on the same nodeA -> nodeB crossing, so instrumenting only the harness whose failure was in front of me would have covered half the occurrences. Both are instrumented.

  **And the first version of that instrument would have crashed instead of reporting.** The `partition-rejoin` copy referenced `ACQUIRE_WINDOW_MS`, which exists in `transitive-gossip.mjs` and not in that file — a copy-paste between harnesses that `node --check` cannot see, because an undefined name is a runtime error rather than a syntax one. It would have thrown `ReferenceError` at exactly the moment it was supposed to explain a failure. **What hid it was an injection test that silently exercised nothing:** the injection rewrote `ACQUIRE_WINDOW_MS`, which that file does not define, so the window never shrank, the run passed, and the passing run was read as the instrument working. A test that does not reach the path reports success for the wrong reason — the same defect this section keeps recording in other forms.

  **So the harness now keeps watching for 300s after the gate has already failed**, and says which of the two happened — `IT ARRIVED LATE` with the true total, or `STILL ABSENT` after a further 300s. It is a `::warning::` and not a check: the run is already red, the gate is unchanged, and a passing run never reaches it. Both branches were watched working before being trusted, by injecting a window shorter than the real crossing and, for the second branch, pointing the observation at a domain nothing was written to.

  **Nothing was widened, and that restraint is the point.** A window was raised on a plausible tail theory earlier the same day and the next batch refuted it at 661s. One late arrival is not a distribution either; the difference now is that the next three failures will say which fix they wanted instead of leaving it to be argued.

- [x] **A second `network` failure mode appeared, out-frequenting the first, and a hung read now names the node instead of printing a bare client timeout.** `scripts/live-verify/partition-rejoin.mjs`.

  **It is not the flake above, and the baseline is what rules that out.** On 2026-10-05 two runs on two different refs, started within a minute of each other, died in `partition-rejoin` Phase 2 with nothing but `HARNESS ERROR: Error: Request timed out in 60000 ms: call_zome`. Both had crossed nodeA to nodeB in 0.0s in Phase 0, so `CONVERGE_WINDOW_MS` was not involved and neither was the gossip crossing the entry above instruments. **At two in four runs it is now more frequent than that one's four in fourteen.**

  **The signature is already in this file, attached to a harness that was removed for it.** `transitive-gossip` came out of `network.yml` on exactly this error, and `partition-rejoin.mjs` cites it by name. The recorded hypothesis then was a readiness race on a freshly started conductor; four experiments falsified it. So nothing here is fixed on a mechanism, and no timeout is widened — the same restraint the entry above describes.

  **What was wrong was not the failure but what it looked like.** That message names no node, no read and no elapsed time, and it cannot distinguish a conductor that has **died** from one that is **up and not serving zome calls**. Those want opposite fixes. The discriminator already existed — `portRefuses`, which the harness uses to confirm a node is down — so a hung read now probes the node's own admin port and reports the pair. The ten bare reads that feed a `check` all route through it, each labelled with what it was reading. The error is rethrown unchanged, nothing is swallowed, and a passing run never reaches the code. The deliberate choice that `check`-feeding reads stay bare, unlike `pollCount`'s budgeted polls, is unchanged and still right.

  **It answers three ways, not two, and the third branch exists because the first version would have lied.** `portRefuses` reports "refusing" for any unsuccessful connect — a *hung* one included — so a conductor wedged badly enough to stall its admin port would have been diagnosed as `GONE`, sending somebody after a process that was still running. **A diagnostic that confidently names the wrong cause is worse than one that says nothing.** The probe is therefore bounded at 10s and distinguishes refused (exited), answered (up but not serving), and neither (wedged) — and that third state is the strongest signal of the three, because it is specifically not a readiness race: a starting conductor refuses connections, it does not hang.

  **Two defects in the diagnostic were found by running it rather than reading it**, which is the entire argument for injecting an error path. It first advised `scripts/network.sh logs nodeB`, and there is no `logs` subcommand — following the advice would have failed — so it now names the file. The fix for *that* then rendered as literal source text, because `$\{` in a template literal is an escaped brace rather than an interpolation. `node --check` accepts both: valid syntax, wrong output, in the one path that runs only when something has already gone wrong. All three branches were then watched printing against three real conductors, with the injections recorded in the file's own header.

- [x] **A `network` run passed in 44.1 of its 45 allotted minutes, and the pass was the finding.** `scripts/live-verify/partition-rejoin.mjs`.

  **An unbounded multiplier on a measured value nearly ate a whole job.** The dwell before `partition-rejoin`'s divergence assertion was `base.ms * 5` with no ceiling — derived from a real crossing rather than guessed, which is right, and which did not account for a pathological baseline. On **2026-10-05**, run `37266214567` on `main`, Phase 0 took **396.0s** to cross nodeA → nodeB *with both nodes up and nothing partitioned*. Five times that is 1980s, so the harness slept **33 minutes** and the job finished with **53 seconds of margin**. A baseline ten per cent slower would have hit the ceiling, and a job killed there reports a bare timeout: no harness summary, no restore step, and none of the instrumentation this file now carries for exactly that moment.

  **The 396s is the news, not the sleep.** `real-gossip`'s window is 330_000, so a crossing that slow is a *failure* over there, and it was only recorded here because this harness budgets 600_000. That makes it the first hard data on the question the entry above left open: the op **arrives late** rather than never, which points at the window rather than at `roundTimeoutMs`. One occurrence is not a distribution and no window is changed on it — but the answer is no longer zero, and the figure previously scrolled past as one unremarkable line while the 33-minute sleep looked like the anomaly.

  **Capping the dwell alone would have reintroduced an older defect, so the fix is a pair.** The divergence check is only meaningful if the dwell *outlasts* gossip; a dwell shorter than the measured crossing makes its label false. So the dwell is bounded at 300s **and** a baseline too slow for a sound 5× dwell inside the budget is itself a failed check — a runner that cannot measure the property says so in seconds instead of sleeping through it. The cap makes the worst case bounded, not comfortable: the convergence windows after it are 600s each, which was always true.

  **The first version of this fix shipped the exact defect it was written to prevent.** It capped the dwell, added the failing baseline check — and left the divergence check printing `PASS: ... after long enough that it would have arrived` on a run where the dwell was 300s and the crossing was 396s. The label was false and the line read as a sound result: the "label claims more than the assertion tests" failure this file's own header already records, committed a second time by the change guarding against it. **Capping a derived value is not enough on its own, because every claim derived from it has to be re-examined too.** The divergence line now reports `INCONCLUSIVE` and counts as neither — passing it would be a lie, and failing it would double-count one cause when the run is already red on the baseline check. Found by running the injection rather than reading it, which is the second time in two changes to this file that reading was not enough.

- [x] **Root-caused and reported upstream as holochain/holochain#6012 — and it is not a wasm bug, which is the third framing this failure has had here.** `scripts/live-verify/strategy-compare.mjs`.

  **The full error names the cause, and every earlier record of it was truncated.** The entry below calls this a wasm crash on the strength of `Ribosome: RuntimeError`. That string is a wrapper. Captured untruncated, the conductor says:

  ```
  Ribosome: RuntimeError: holochain::core::ribosome::host_fn::get_links:72:
    Host("iroh connect timed out (src: deadline has elapsed)")
  ```

  So `get_links` dials a peer, the iroh connect deadline elapses, and the host-call failure propagates out of wasm as a `RuntimeError`. **Three layers of message, each hiding the one beneath**: the client's 60s ceiling hid the ribosome error, and the ribosome error hid the transport timeout. Every prior account in this file — including the entry below — was reasoning about a layer rather than the cause.

  **The trigger needs a REMEMBERED peer, not an absent one**, which is the condition the entry below misses. Two things are required together: the conductor has restarted, **and** it already knew a peer that is now unreachable. A conductor that never discovered a peer has nothing to dial and answers from local storage in 0.01s. That was found the hard way — the first standalone reproducer stopped the second node before it had ever met the first, and **did not reproduce the bug at all** while appearing to run correctly. The reproducer now proves discovery with a warmup write the second node must observe, and reports the crossing time, so a silent non-reproduction is impossible.

  **The strategy is the discriminator**, measured on a minimal two-zome hApp with the identical query exposed twice:

  | | result |
  |---|---|
  | `GetStrategy::Local` | 3/3 ok, 0.01s each |
  | `GetStrategy::Network` | 3/3 failed, 86.1s each |

  `Local` is not a drop-in substitute — it returns what is in local storage, which is a different question — so this says which call completes, nothing more. **No cause is claimed upstream.** `GetStrategy`'s own doc says a call will not go to the network "if the current agent is an authority for this hash", and these are full-arc conductors, so one reading is that authority state is not yet established after a restart. That is inference from outside the conductor and the issue says so.

  **Four accounts of this were refuted before the right one**, and the pattern is more useful than the answer: DHT isolation (an isolated node that has not restarted answers in 10ms), "first read after an isolated restart" (0 of 5 when repeated), entry provenance (gossiped, locally authored and absent all fail identically), and "no reachable peers" (which does not reproduce — there must be a peer to dial). Each was formed after seeing data and each died to the next experiment. **The one that held was the only one pre-registered before its run.**

  **Also corrected here: a claim this section made twice.** The failure duration was called "not a signal" on a 43.7–104.7s spread. It is stable within a fixed setup — 86.1s three times to the tenth — and varies across setups, so the spread was the harnesses differing rather than noise in the bug.

  **Three prerequisites that cost a maintainer nothing to know and everything to miss** are in the upstream issue: the `getrandom_backend="custom"` and `--import-undefined` rustflags without which a 0.7 zome does not build; `holochain_serialized_bytes` as an explicit dependency no source file names; and `wsClientOptions.origin`, without which the conductor answers HTTP 400 and a reproducer dies before reaching the bug. The first version of the reproducer hit all three.

  **A second, independent observation is recorded upstream separately rather than folded in:** after this error the app websocket is unusable — a later `callZome` never reaches the conductor and the client's per-call timeout does not fire. One such call sat for 47 minutes. That is possibly a `@holochain/client` 0.21.0 issue, and it is why the strategy comparison runs as independent processes instead of two calls on one connection.

- [x] **The stall is a wasm crash in a 20-second window after a conductor restart, the "timeout" was never a timeout, and the dwell floor was selecting for it.** `scripts/live-verify/stall-bisect.mjs`, `scripts/live-verify/stall-threshold.mjs`.

  **It was never a timeout, which is the finding that reframes everything before it.** Every record of this failure said `Request timed out in 60000 ms: call_zome` — three CI occurrences, this repository's own instrument, and `transitive-gossip`'s removal from `network.yml` long before. That message is the **client's** default, not the conductor's answer. Re-measured with the per-call ceiling at 180s, the conductor says `Wasm runtime error while working with Ribosome: RuntimeError` — at 65.6s, 65.7s, 85.4s, 87.6s, 94.7s, 104.7s, all past 60s, so the default fired first and hid a crash behind a timeout for as long as this has been tracked. The locally-authored case was already showing the real error at 43.7s, below the default and therefore never truncated; two numbers in one table, one of them an artefact, and the artefact was the one being reasoned about.

  **The trigger is the first zome call after a conductor's first restart, 8 of 8, and provenance is irrelevant.** Gossiped in from a peer, authored locally, or absent entirely — all three crash identically, and `absent` is `partition-rejoin` Phase 2 exactly, with nodeB legitimately holding nothing. The second call always answers in 0.00s. So three accounts were refuted on the way here: **DHT isolation** (an isolated full-arc node answers a link query in 10ms, since it is authority for the whole space), **"first read after an isolated restart"** (repeated five times, 0 of 5), and **provenance** (the sharpest and most reportable of the three).

  **Then the window was measured, and it is about 20 seconds wide.**

  | delay after `start-node` | crashed |
  |---|---|
  | t+0 … t+15s | 1/1 at each |
  | **t+20s** | **3/4 — straddles** |
  | t+25s / 30s / 35s | 0/3, 0/4, 0/3 |

  20s produced both crashes and passes, so it is a race at the boundary rather than a cutoff. No crash was observed above 20s in 10 trials — a bound, not a guarantee.

  **And that closes the CI-versus-local puzzle with numbers rather than a story.** `dwellMs = max(floor, base.ms * 5)`. All three CI failures crossed their baseline in **0.0s**, so the multiple was zero and the dwell fell to its **15s floor** — inside the window. Local runs measured a 5.1s baseline, got **25s**, and passed by five seconds over a race. **The faster the network, the shorter the dwell, the likelier the crash** — an inversion that explains why this read as random for months: it preferentially hit the healthiest runs, and the one run that took 396s to cross sailed through on a 300s dwell.

  **The floor is now 45s, and it is a workaround for somebody else's defect rather than a fix.** More than twice the last delay at which a crash was seen, and above a straddled boundary rather than merely past it. The bug is a wasm crash inside the conductor; the dwell exists to make the divergence assertion sound; the two are unrelated, and that floor is now load-bearing for a reason its name does not suggest. Written into the file for the same reason the entry above exists — a constant quietly holding up something it was not written for is how the next reader gets surprised.

  **Both probes assert nothing and neither is in CI.** They are reproducers, indexed as experiments in `scripts/live-verify/README.md`. The harness's diagnostic reads now outlast the client default so a CI failure reports the conductor's error instead of the ceiling's, and #165's branch text — which said "did not serve one zome call", pointing at readiness — now points at the crash. It was true and it was aimed at the wrong cause.

- [x] **The Phase 2 stall reproduces locally, which retires every load-based theory about it — and both of my own accounts of it are refuted too.** `scripts/live-verify/dht-isolation-probe.mjs`.

  **Three CI failures on 2026-10-05 died on one bare read**, and the instrument added above narrowed it: nodeB's admin port still answered, so the conductor was up and simply did not serve one `get_claims_by_domain` inside the client's 60s default. Phase 2 changes **two** things at once — nodeA is stopped so nodeB is alone on its DHT, and nodeB is restarted immediately before the read — so a hypothesis naming only one of them was not yet a tested thing. The probe runs the 2×2.

  | | nodeB not restarted | nodeB freshly restarted |
  |---|---|---|
  | **nodeA up** | 0.02s | 0.29s |
  | **nodeA stopped** | 0.01s | **60.00s, timed out** |

  **It reproduces on a developer machine, 2 of 2 runs**, which is the single most important thing here: every prior theory about this signature assumed load. `transitive-gossip`'s readiness race was asserted on it and falsified by four experiments; the entry above reasoned from a 2-vCPU runner. This machine is neither, so the stall is not load-dependent, and the signature is for the first time reproducible outside CI.

  **The isolation hypothesis — mine — is refuted, twice over.** Being alone on the DHT is not sufficient: cell A answers in 10ms, including for a domain nothing was ever written to, exactly as full-arc authority predicts, since each conductor is an authority for the whole space and needs no peer to answer a link query. And *inside* the failing cell the never-written domain answers in 10ms while the domain nodeB **holds** is the one that hangs — the reverse of what the hypothesis predicted.

  **And the obvious account of the conjunction is wrong as well, which is the most useful line in the experiment.** "The first read after a restart while isolated" describes the failing cell exactly — so the probe does precisely that five more times, and it never hangs, trial 1 included, at 0.24s. Isolation plus fresh start plus first-read is therefore not sufficient either. Something about *where* that cell sits in the sequence is load-bearing and is not yet controlled: by the repeat phase nodeB has already been restarted once and nodeA has been up and down again, whereas the failing cell is nodeB's first restart in a clean network after nodeA went down.

  **So what is established is narrow, and is stated narrowly.** A reproducible 60s stall exists; it is not load-dependent, not isolation alone, not a fresh start alone, and not simply the first read after an isolated restart. It waits out the client rather than erroring, so the conductor is blocked rather than refusing. **Why** it waits is inside Holochain and this probe measures from outside. Nothing is fixed on it and no timeout is widened — the rule this section has now applied to the same class of defect three times.

- [x] **The dwell fix moved `network` from 83.1% to ~86%, and the round timeout was raised to 60s with the knob proven real before it was trusted.** `scripts/network.sh`. **The "93.3%" this heading first claimed was a six-run artefact and is corrected below, as is "the one surviving failure mode" — there are two, and the better-evidenced one is not the round timeout.**

  **The measurement first, because the exclusion asks for it.** `network` is kept out of `main`'s required checks on the grounds that it is genuinely flaky, with a standing instruction to re-measure rather than assume before revisiting that. Re-measured across 91 completed runs: **83.1% before the dwell fix (64/77), 93.3% after it (14/15)**. Four of the five failures in the days around it were the wasm crash the entry above fixed, and they stop at the commit that fixed it. One is left, and it is a different animal.

  **The survivor is a BASELINE crossing that never happens** — nodeA writes, nodeB never sees it, and `partition-rejoin` reports SETUP FAILED having watched 900s. The instrumentation that harness and `real-gossip` both carry for exactly this question answered it: *"more time would NOT have helped, so the window is not the thing to change. That points at the 15s round timeout being too tight for this machine."*

  **Two recorded observations pointed opposite ways, and one mechanism explains both** — which is the part worth keeping, because the entries above read as a contradiction. `transitive-gossip` saw an op arrive at **396s** and this changelog concluded it "points at the window rather than at `roundTimeoutMs`"; `partition-rejoin` then saw nothing in **900s**, which points the other way. `kitsune2_gossip-0.5.0/src/config.rs` reconciles them: a gossip round is terminated after `round_timeout_ms` (default **15,000**), and `min_initiate_interval_ms` (default **300,000**) is "the minimum amount of time that must be allowed to pass before a gossip round can be initiated by a given peer". **So a round lost to the 15s timeout cannot be retried with that peer for five minutes.** A crossing therefore either lands on the first attempt — 2.0s, 2.1s, 5.1s in every healthy measurement here — or waits out a 300s rate limit for the next permitted initiation. 396s is one lost round and a retry; 900s of silence is three lost in a row. **`real-gossip`'s 330s window sits barely above that 300s floor,** so a single lost round is usually a failed run. Widening windows buys more retries at 300s each; raising the timeout attacks the thing being lost.

  **The knob was proven before it was used, because the path it travels discards what it does not recognise.** `network.advanced` is handed to kitsune2 verbatim by `NetworkConfig::to_k2_config`, and `K2GossipFactory::create` reads it back as `K2GossipModConfig { k2_gossip: K2GossipConfig { round_timeout_ms: u32 } }` under `#[serde(rename_all = "camelCase")]` — so the path is `advanced.k2Gossip.roundTimeoutMs`, and the struct's own default is exactly the 15,000 the harnesses had been attributing to it. **A conductor starts perfectly happily with `roundTimeoutMsTYPO` in that map**, which means "it booted" is no evidence at all. Proven instead by putting a *string* in the field and watching the conductor log `K2Error(... "decode config" ... invalid type: string "not-a-number", expected u32)` — the value is read, and read as a `u32`.

  **That proof produced a second finding worth more than the first: the failure is not fatal.** The malformed config failed the cell's **network join** while the conductor reported ready and every port answered. That is "a network that reports itself fully up, on which nothing ever gossips" — the exact failure `network.sh`'s header already warns about for unpinned bootstrap ports, reachable by a second route. So `set_gossip_round_timeout` writes the value and then **greps it back out of the file**, and fails the run if either the `advanced:` key or the written line is missing. A silent no-op dressed as a fix is the one outcome worse than the flake.

  **Generated without `-r`, then patched, then run.** `-r` makes `hc sandbox generate` start the conductor too, and a conductor reads its config once at startup, so with `-r` there is no moment at which the file exists unread. Patching afterwards would need a restart — and the entry above established that the first zome call after a node's first restart crashes the ribosome, so setup must not spend that window on the nodes a harness is about to measure. The three steps avoid it entirely.

  **Verified on the real three-node network, and what that does and does not establish.** All three nodes carry `roundTimeoutMs: 60000` with zero network-join errors; `real-gossip` is 25 checks green and `partition-rejoin` 26, the latter crossing its baseline in 5.1s and dwelling the full 45s. **It does not establish that the flake is gone.** This machine crosses in 5.1s and has never reproduced the CI failure — the whole point is that a 2-vCPU runner is slow enough to lose a race this one wins. The confirming measurement is the pass rate over the next runs, and until there is one **`network` stays out of the required checks**, on the same instruction that produced the measurement at the top of this entry. 60s is four times the default and well inside the 330s window, so a slow round can finish while a dead one is still reaped long before any harness gives up.

  **AND THE MEASUREMENT CAME BACK AGAINST THE OPTIMISM IN THIS ENTRY, which is
  what it was for.** The "93.3% (14/15)" above was taken six runs after the dwell
  fix landed. At twenty-one runs it is **85.7% (18/21)**, and the two most recent
  runs at the time of writing both failed — so the honest reading is that the
  dwell fix cleared the wasm-crash family and the rate has not demonstrably moved
  since, not that the job is nearly clean. A rate quoted off fifteen samples was
  too few to carry the weight this entry put on it.

  **Both of those failures are one mode, and it is not the round timeout.** Each
  failed `partition-rejoin`'s baseline — but not by never crossing. The baseline
  **crossed**, at **120.3s** and **125.3s**, and the harness failed a separate
  guard requiring a baseline fast enough to measure divergence in budget (≤60s).
  Its own warning says so: *"THE 120.3s IS THE FINDING, not this cap."*

  **Those two numbers land on a different kitsune2 constant from the 307.5s one.**
  `initiate_interval_ms` is **120,000** — "how often Kitsune will attempt to find
  a peer to gossip with" — with `initiate_jitter_ms` of **10,000** added as a
  random 0–10s. 120.3s and 125.3s are both 120s plus jitter, to the tenth of a
  second, on two independent runs. The shape that produces it is the **first**
  attempt at `initial_initiate_interval_ms` (1s) finding no peer to gossip with
  at all — bootstrap discovery has not completed a second after start — and the
  crossing then waiting for the next scheduled attempt two minutes later.
  **Raising `roundTimeoutMs` cannot help that**, because no round was lost to a
  timeout; none was started.

  **So there are two failure modes with two signatures, and the evidence is the
  other way round from how this entry ordered them.** The 300s one
  (`min_initiate_interval_ms`, a lost round rate-limited before retry) rests on a
  single 307.5s observation from a local experiment. The 120s one rests on two CI
  observations agreeing to the tenth of a second. The better-evidenced mechanism
  is the one this entry did not predict.

  **The candidate fix is a sibling knob and is deliberately NOT applied here.**
  `advanced.k2Gossip.initiateIntervalMs` travels the same proven path as the
  round timeout, and lowering it would make a missed first attempt cost seconds
  rather than two minutes — `min_initiate_interval_ms` still rate-limits any
  individual peer at 300s, so it is the look-for-a-peer cadence that would
  change, not the load on one. It is not applied because the lesson of this very
  entry is that a config change needs its effect shown rather than argued, and
  nothing here can show it: this machine crosses inside one 3s poll and has never
  reproduced the slow baseline. **`network` therefore stays out of the required
  checks**, which is now the second measurement in a row to say so.

  **CPU STARVATION IS NOT THE LEVER, which retires the framing both this entry
  and the round-timeout one leaned on.** "A 2-vCPU runner is slow enough to lose
  the race" was never measured, only asserted. Measured now, by giving the
  conductors a runner-sized budget *from the moment they start* — CPU affinity is
  inherited across `fork`/`exec`, including through `setsid --fork`, so pinning
  the launcher hands the mask to every conductor it spawns, which matters because
  the trigger is at t≈1s and pinning afterwards would miss it. The mask was read
  back off the running conductor rather than assumed:

  | conductors' CPU budget | baseline crossings |
  |---|---|
  | 12 cores (unconstrained) | ≤3s |
  | 2 cores | 1.03s |
  | **1 core**, shared by three conductors and the bootstrap service | 1.03s, 3.07s, 3.06s, 3.06s |

  **The crossing time does not move across a twelve-fold range of CPU budget.**
  That is a stronger statement than the trial count supports on its own: if core
  starvation produced the 120s wait, pinning three conductors onto one core
  should have shifted the distribution, and it did not shift at all. So local
  reproduction by CPU limiting is the wrong tool, and the runner's relevant
  difference is not its core count.

  **And the failing runs logged nothing at all, which narrows it further.** The
  per-harness census (`scripts/log-census.sh`) on both slow-baseline failures:

  ```
  nodeA.log  lines=9  [initiate too soon=0] [Accept message from wrong peer=0]
                      [iroh connect timed out=0] [Peer behavior error=0]
  nodeB.log  lines=8-9  all zero        nodeC.log  lines=8  all zero
  ```

  Eight or nine lines per node, every signature zero, one routine `database is
  locked`. **That kills both mechanisms this README had proposed for it:**
  `Accept message from wrong peer` is absent, and so is `initiate too soon` —
  which is what hitting the 300s per-peer rate limit logs, so the 307.5s
  mechanism did not occur here either. Nothing errored; gossip simply did not
  happen until the two-minute mark.

  **What survives is the one path that logs nothing by design.** Finding no peer
  to gossip with at the first attempt is not an error, so it writes no line —
  and it is the only candidate left that produces a silent wait ending on
  `initiate_interval_ms`. Why a peer is unknown a second after start on a runner
  and not here is then a question about bootstrap registration and transport
  setup timing, not about CPU, and that is where anyone picking this up should
  look. The harness said as much before any of this: *"expect a long tail rather
  than a broken state"*, and *"do not expect a distinctive error."*

  **A third failure arrived while this was being written, and it is the same
  number again: 125.3s, 120.3s, 120.3s.** Three independent CI observations, all
  on `initiate_interval_ms` plus jitter, with every census mute — 8–9 lines per
  node, every tracked signature zero. The signature is now the best-established
  fact about this failure, and the mechanism behind it is still the only one that
  fits a silent wait ending on that constant.

  **And the pass rate has fallen with every re-measurement, which is a lesson
  about quoting it at all.** 93.3% at n=15, 85.7% at n=21, **80.0% (20/25)** now
  — against 83.1% before the dwell fix, so that fix's apparent gain has gone,
  within noise. Three revisions in one direction say the figure was quoted while
  it was still accumulating; treat any current value here as provisional, and
  prefer the signature over the rate.

  **So the node logs now carry the gossip timeline, which is the only thing that
  can settle it.** `scripts/network.sh` raises the conductor's log filter —
  `CUSTOM_FILTER`, which is all `tracing_override` sets — so that
  `kitsune2_gossip`'s own lines reach the log: "Starting initiate task" once per
  node at startup, "Selected target for gossip: <url>" and "Initiated gossip
  with <url>" per attempt, and `select_next_target`'s reason when there is
  nobody to gossip with, which the `Ok(None)` arm defers to it for by name.
  `scripts/log-census.sh` counts the first three — the first non-error entries
  in that list, because counting errors harder was never going to reach a path
  that logs none.

  **A slow baseline whose first "Initiated gossip with" is two minutes after
  start is this mechanism caught in the act; one at t+1s refutes it.** Either way
  the next occurrence answers the question instead of restating it. The filter is
  checked after startup rather than trusted, and watched failing: with
  `EPI_GOSSIP_LOG_FILTER=error` the guard fires on all three nodes and the census
  goes mute again, which is exactly the state the last five failures were
  diagnosed in.

  **The first data arrived immediately and refuted the strong form of the
  hypothesis.** The next failure censused **`Initiated gossip with=11`** on nodeA
  and 13 on nodeB — so "no peer was ever found and nothing was initiated" is
  dead; rounds were being started throughout. It also logged `iroh connect timed
  out=1` on nodeB, a signature absent from all three earlier failures, and
  crossed at **425.8s**, a fourth distinct value after 125.3s, 120.3s, 120.3s.

  **And the instrumentation discarded the half that mattered, which is a defect
  in the commit above rather than a result.** Counts cannot say *when*, and when
  is the only thing separating the remaining explanations. The timeline was in
  the log and never reached the job output: the end-of-job dump is `tail -100`,
  the filter had grown that log to 1017 lines, and every surviving "Initiated
  gossip with" timestamp fell **after** the baseline window it was meant to
  explain — 07:17 against a window that closed at 07:12. Instrumentation that
  produces an answer and then throws it away is worse than none, because the
  census looks like it reported.

  **So `log-census.sh` prints the first initiation per node, on every run.**
  Bounded and per-node, so it cannot grow into the thing that gets tailed away;
  on every run rather than on failure, because that file's own header records
  what failure-only collection already cost here — three passing runs showed
  zero occurrences *and* zero conductor log, so zero was the absence of the file
  rather than of the event. The healthy control, measured:

  | node | initiate task | first initiation | delay |
  |---|---|---|---|
  | nodeA | 07:23:48.47 | 07:23:54.48 | 6.0s |
  | nodeB | 07:23:53.90 | 07:23:55.90 | 2.0s |
  | nodeC | 07:23:59.31 | **NEVER** | — |

  **nodeC's `NEVER` is the metric validating itself.** It is the isolated control
  on a different seed, so it has nobody to gossip with — precisely the state the
  surviving hypothesis attributes to a slow node. A slow baseline should show
  nodeA or nodeB at ~120s against the 2–6s here, and that comparison is now
  available on the next occurrence instead of needing another session to arrange.

- [x] **Pre-registration (commit-reveal) — built, and the flaw this entry identified is what the implementation is shaped around.** What `EntryVisibility::Private` genuinely provides is not privacy but **timestamped commitment**: an agent commits a private entry now, its Action and entry hash are published, and a later reveal can be checked against that hash — proving they held the content at the earlier time without disclosing it then.

  The epistemically apt use, and the only one that clearly fits this protocol, is pre-registering a prediction before the evidence exists — the standard defence against HARKing (hypothesising after results are known). A protocol built around `Claim`, `Critique`, `Evidence` and declared confidence arguably has a shaped hole here, and this is the primitive that fits it.

  **Deliberately not built.** No one has asked for it; the need is inferred from the protocol's subject matter rather than reported, and this project's standing rule is that a mechanism waits on a stated need — the reasoning that removed the burn tier and declined capacity applies unchanged. It would also need real design, not just a private entry type: what a reveal action looks like, how a revealed prediction relates to the `Claim` it becomes, and whether an unrevealed pre-registration should be visible as such (it necessarily is, since the Action publishes). Worth doing properly if someone wants it; not worth doing speculatively.

  **The naive version is gameable by SELECTIVE REVELATION, and this is the caveat that turns "not yet" into "not carelessly".** Commit ten predictions, reveal the two that came true, stay silent on the eight that did not. Every reveal verifies. The track record is a fabrication wearing a cryptographic proof. A commitment establishes that the author held *that* content at that time; it never establishes that it was all they held. Note what this does to the argument for building it at all: the protocol currently *cannot* express foresight, which is an honest limitation and a visible one, while a careless implementation would express it **wrongly**, in a form that looks rigorous and is awkward to dispute. For a protocol whose whole value is that its signals are honest, a false positive is worse than a missing signal — this feature would not reduce the HARKing it targets so much as launder it. Anything built here therefore needs the denominator: a reveal deadline so an unrevealed commitment expires visibly rather than silently, the count of expired commitments readable alongside the revealed ones, and a prediction bound to a question posed in advance so it cannot be reinterpreted at reveal time to fit whatever happened.

  **Built on the terms this entry set, and the terms are what the code is shaped around.** `SealedPrediction` (the only private entry type in this zome), `PreRegistration` and `Revelation`; `pre_register`, `reveal_pre_registration`, `get_pre_registrations_for_question` and `get_foresight_record`; SPEC §10.16; `scripts/live-verify/pre-registration.mjs`, which runs in `conductor.yml`. Each of the three requirements above is enforced rather than documented: a deadline that must be later than the commitment's own action timestamp, so nothing is born already expired; a question public from commit time and immutable thereafter; and a reveal that must hash to the commitment, come from the committer, and arrive before the deadline. **A late reveal is refused outright**, because accepting one would let an author decide, having seen the outcome, whether a commitment counts as revealed or quietly expired — which is the selective revelation this entry refused to ship.

  **The substrate forced the shape, and that is worth recording because the obvious design does not work.** Validation cannot see a private entry's content — hdi delivers `None` for the body and treats `Some(_)` as an error — so the deadline and the question *cannot* live inside the seal, where they would be unverifiable. Only the content is hidden; the commitment hash, the deadline and the question are public from the first moment. The hash is recomputed at reveal time, which is the only moment the content exists publicly to check at all.

  **`get_foresight_record` returns lists and refuses to divide them, which is Invariant #1 read carefully.** Invariant #1 bars a canonical comparative score while requiring that raw history stay open and queryable. An expired commitment exists to **deflate** a claim of foresight, not to rank its author — and a revelation read without the expired set beside it is exactly the laundering above, so withholding the denominator is what would breach the invariant here rather than surfacing it. SPEC §10.16 states the no-score rule as a MUST NOT. A hit rate is a client's decision to defend, with its own judgements about what counts, not something this zome blesses by returning a number.

  **Surfaced as a Foresight tab, and `get_pre_registrations_for_question` is deliberately left out of it.** Three of the four externs have a surface: the record read, the commit form and the reveal control — the write half included, because a read-only surface here would be the "half-surfaced" defect this item already records for `get_claims_by_agent`, where the read shipped and the write that mattered did not. **The fourth is held back because surfacing it carelessly reintroduces the laundering at the view layer.** A per-question list of revealed predictions, shown to someone evaluating a claim, is a list of people who called it right — with no sight of what any of them committed to and never revealed. That is the selective revelation the backend now refuses, rebuilt in a different place. Doing it honestly means each author's expired count beside their revealed prediction, which is a per-agent display adjacent to Invariant #1 and a design decision not yet made. It stays unsurfaced with that reason rather than shipped with a caveat.

  **What the tab must do, as opposed to what it could look like.** The expired group renders unconditionally, adjacent to the revealed one and not after it — a group below the fold or behind a toggle is a group that can be missed, and one is the denominator of the other. No ratio is computed anywhere. The reveal control appears only on pending commitments, never on expired ones, because the protocol refuses a late reveal and a button that always fails would teach a reader the deadline is advisory. And the commit form states before its fields that the prediction and salt are unrecoverable, since a committer who learns that at reveal time learns it too late.

  **Verified live, and the guard that mattered most was watched passing an injection it was written to catch.** `scripts/live-verify/foresight-ui.mjs`, sixteen checks, set up through the conductor so the harness knows the truth before it looks at the screen — one commitment revealed inside a far deadline, one given a four-second deadline and deliberately left to lapse. The fake it defeats is not a broken screen: it is an accurate one that renders the revealed predictions and omits the expired, which is this entry's selective revelation rebuilt at the view layer, where no validation rule reaches. Removing the expired group turns **five of the sixteen red** and the run completes rather than crashing on the absence it is looking for. Adding `layout-fits`'s seeded Foresight tab makes the wrap-rule injection turn **fifteen red where it used to turn twelve**, and the seven-label tab bar was measured at 320px rather than assumed to still fit.

  **Then the no-score check passed a hit rate, which is the one result here worth reading twice.** A `revealed / (revealed + expired)` line was rendered on the page as "Hit rate: 1/2" and **all sixteen checks stayed green** — the check that exists for precisely that injection did not object, and neither did anything else. The cause was not the pattern but the text it searched: `textContent` concatenates adjacent blocks with no separator, so the page read "…Hit rate: 1/2There is no hit rate on this page…", and with the `2` followed by a `T` the ratio pattern's trailing `\b` had no boundary to match. A newline per element fixes it, and the injection now turns exactly that one check red while every list check stays green — which is the whole reason the absence of a score is asserted separately from the presence of the lists.

  **An earlier version of that file's header recorded the hit-rate injection as going red, and it never had.** The claim was inherited across a session rather than re-run, and it was wrong in the most expensive direction: a guard documented as proven while the thing it guards was displayable. That is the same defect this directory keeps recording in new costume — `pre-registration.mjs`'s probe scoring a pass against a function that was never there, a label claiming more than its assertions — and it is the argument for re-running an injection rather than citing one. **An injection result that is not reproduced is a claim, not evidence.**

  **One check in validation guards a state nothing can reach, and saying so is the point.** "The question must predate the commitment" sounds like what makes requirement 3 hold. It is not: a commitment references the question's hash, so the question must already exist, and sequential creates take increasing action timestamps. The harness was written to violate it and could not — the commitment was correctly accepted, and the test failed by asserting a refusal that should never come. The check is kept because it is free and would catch a future-dated action from a broken clock, but **what actually delivers requirement 3 is the `question` field being public and immutable**, with no update or delete path in the zome. Recorded at this length because the first version of the harness cited the unreachable check as evidence, and a test that cannot fail is worse than no test.

  **Two defects in the harness, both of the kind this directory keeps recording.** Its first summary line claimed the run proved "a question chosen afterwards" is refused, which it no longer tests — a label claiming more than its assertions. And a probe for "a commitment cannot be updated" called an extern that does not exist while asserting the error contained `"not"`, which `"function not found"` satisfies: a guard scoring a pass against a function that was never there. Verifying that a function is *absent* is `check-spec-drift.mjs`'s job, since it enumerates what exists; it is not something a live call can establish by being rejected.

  **And it runs directly at Invariant 1, which is the deeper reason to design it before building it.** "Who called it right" is a comparative standing, and this feature begs to become one. The invariant permits exactly what pre-registration would produce — raw history, open and queryable, a record of what someone committed and when — and forbids what everyone would immediately want computed from it. So the constraint is not on the record but on the arithmetic: no hit rate, no calibration score, no ranking of forecasters, however tempting a cryptographically verifiable one would be. A leaderboard arriving with a proof attached is *worse* than an obviously subjective one, because it is harder to argue with and no more legitimate. That is the trap this entry is parked in front of, not merely the absence of a stated need.
- [ ] **Surface the epistemic state the backend already computes — now 43 of 64 coordinator functions, from 4.** Everything the protocol computes *about* discourse is what distinguishes it from a forum, and most of it had no surface. Shipped so far: the HUD layer (`get_discourse_health`, `get_effective_conductance`, `get_cross_domain_critiques`, `get_antibody_patterns_for`, `get_synaptic_link_friction_status`), membranes and governance (`get_membranes`, `get_membrane_members`, `join_membrane`, `create_membrane`, `publish_constitution`), evidence and grounding (`create_evidence`, `get_grounding_path`, and `get_claim`/`get_evidence` to resolve the path that returns), and retraction in both directions (`create_retraction`, `get_retractions_for_claim`).

  **The critique taxonomy is now shipped** — `get_all_critique_species`, `get_critique_species_adoption_count` and `create_critique_species` all have a surface, and `Critique.species` is no longer hardcoded `null` at the one place a critique is written. See the Critique Types entry below.

  **The ordered list this item carried is now empty, and the one thing the audit found behind it has been built.** Every read the list named has a surface, and the residue below was re-checked function by function against the code rather than carried forward — which is how `get_claims_by_agent` turned out to be filed under a justification that does not describe it. **It now has a screen of its own**, the By Author tab, verified by `scripts/live-verify/author-scope-ui.mjs`; the rest of the residue has reasons that hold. (The count was 37 of 58 when this paragraph was written; the live figure is in this item's own heading and is now machine-checked, so it is stated in one place rather than restated here.)

  **The screen had to be built so that a plausible fake would fail it, because the fake here is very plausible indeed.** A By Author tab that filters the claims the Browse tab already loaded — client-side, by author — looks correct, is correctly scoped, and leaves `get_claims_by_agent` exactly as unsurfaced as it was. So the harness makes the agent publish into two domains, has the browser load only the first, and requires the second to appear: a filter over the browser's own memory cannot produce a claim the browser has never held. A watcher on `WebSocket.send` confirms the function name actually goes onto the wire, wrapped before the app loads rather than added as a reporting hook to the app, since a check that depends on production code cooperating is one the production code can satisfy while doing nothing else. **Injecting exactly that fake turns three checks red — and leaves both per-agent scoping checks green**, honestly, because a client-side filter by author really is scoped by author. The assertions that look like they carry the meaning are not the ones that do.

  **Invariant 1 shapes the screen, and it cuts both ways.** It bars a canonical comparative score while requiring that raw history stay "open and queryable" — so an unranked list of what one agent has claimed is the shape the invariant protects rather than one it constrains. What would breach it is the framing, not the list: arriving by ranking agents, sorting by anything readable as merit, or a tally beside a person. The screen shows **no count**, deliberately, even though the per-species adoption count is precedent for showing a number as a fact rather than a position — agents are what Invariant 1 is actually about, and a claim tally next to a person is much closer to karma than an adoption tally next to a critique type. Injecting a count proves the guard is structural rather than verbal: **one check goes red, and the two that read the words stay green**, with the screen still saying "this is a record, not a ranking" and "there is no score here" immediately after the number. A screen can state the invariant it is breaching, in the same paragraph, with no contradiction a text search would find. What remains unsurfaced is the residue the caveat below itemises — bridge-only functions, HRR's two neighborhood-pipeline halves, `federation/`'s two, prober externs that exist to be watched being refused, one read that is chain-local by specification, and one hash-addressed getter a screen holding the record does not need. None is a screen anyone has asked for, so the next increment here needs a new argument rather than the next entry on a list; this item stays open because "most of it had no surface" is still true of the count, not because a queue is waiting. **Both halves of HRR now have screens, and the sentence that stood here said otherwise for long enough to be acted on.** It read "the HRR group is the one candidate with real data and no screen", which was true when written and was then falsified twice — by the worldline surface, and by the neighborhood one (`mobile-ui/src/main.ts`'s resonance panel, `scripts/live-verify/neighborhood-ui.mjs`'s 14 checks, run on every push by `.github/workflows/ui.yml`). **The correction already existed and did not help, because of where it sat.** The parenthetical in the caveat below had recounted the residue correctly — `query_neighborhood_resonance` moved to the surfaced set, the other two left with a reason — but this sentence sat above it, in bold, still naming a gap that was closed. A later session read the bold line, took it for the current state, and set out to build a screen that already shipped; the recount three paragraphs down was never reached. A correction filed underneath the claim it corrects does not reach a reader who stops at the claim, which is the same failure mode as the stale denominator recorded below, in prose rather than in arithmetic.

  **What remains of HRR is `build_neighborhood_binding` and `recall_neighborhood`, and their reason is the coordinator's own rather than one inferred here.** `query_neighborhood_resonance` "collapses the common single-shot case" into one call any peer can make about any claim, "without first fetching and re-passing back a NeighborhoodBinding they have no other use for"; the two-step pipeline is "for a caller who wants to cache a corpus and probe it repeatedly". A screen holding a `corpus_payload` it has no other use for is precisely the caller that pipeline is not for, so surfacing these two would mean building the wrong caller to justify the call — which is what the `get_claims_by_agent` entry below warns against from the opposite direction, where a real reason was missing and got borrowed from a neighbour.

  **A caveat on the denominator, because the ratio invites the wrong arithmetic.** The unsurfaced functions are not that many missing screens — the table above is the live division, gated; what follows is the argument behind its categories, and the record of how they were arrived at after an earlier version of this paragraph was found wrong on all three points below. **Nine are bridge-only** (`create_mew`, `get_unbridged_claims`, `import_twitter_reply` and siblings) and belong to `bridge/`. **Two are HRR's neighborhood half** (`build_neighborhood_binding`, `recall_neighborhood`) — §2.5 calls neighborhood and worldline binding "two distinct use cases, not one", and both halves now have a screen: the worldline five, and `query_neighborhood_resonance`, which is why it is no longer the third name in this clause. **Two are `federation/`'s**, two are negative-path probers whose own doc comments say they exist to *fail* (`attempt_unaccountable_membrane` and, since the by-domain index landed, `attempt_false_domain_index`), and `export_to_n4l` is an export path. **One, `get_all_constitutions`, is chain-local by specification** (SPEC §10.0, alongside `get_critiques_by_mode` which now has a surface saying so). *(Count re-derived after the neighborhood surface landed: 38 of 58, residue 20 — `query_neighborhood_resonance` moved from the residue to the surfaced set, and `build_neighborhood_binding` and `recall_neighborhood` remain unsurfaced because the one-call wrapper is what a screen needs; the two-step local pipeline is for a caller caching a corpus.)*

Three of the four remaining were called **hash-addressed getters** which a screen that already holds the record does not need to call: `get_claim`, `get_evidence` and `get_critique_species` all take an `AnyDhtHash`. **The fourth was not, and the reasoning never held for it.** `get_claims_by_agent` takes an `AgentPubKey` and returns `Vec<Record>` — a DHT-wide query for everything a given agent has claimed, not a lookup of a record the caller already has. The paragraph had been using a true statement about its three neighbours to excuse a fourth it did not describe. That one now has a screen.

**And then two of the three remaining turned out to be the same error one level deeper, which is why the residue is 21 rather than 23.** `get_claim` and `get_evidence` are surfaced now. The category reason — a screen holding the record does not need to re-read it — is true wherever the screen holds the record, and `get_grounding_path` is the one place it does not: it returns `Vec<EntryHash>` and a bool, **hashes and no content**, so the claim card could report "Grounded — evidence chain reaches a source in 3 steps" with no way to show what the source said, every hash in the walk discarded unread. Invariant #3 is "every claim carries its own history" and a step count is not the history. The tell was sitting on the same card: the resonance panel's own caveat told its reader that "the evidence chain and critiques above are the exact answer", which was true of the critiques and not of the chain. The chain is now resolvable node by node — `get_claim` for the nodes the walk passed through, `get_evidence` for the one that closed it — and offered for ungrounded claims too, since where a citation dead-ends is the more useful of the two answers.

**`get_critique_species` keeps the reason, checked rather than assumed:** the UI reads species through `get_all_critique_species`, which returns full `Record`s, and resolves the parent hierarchy from that list rather than by hash — so it genuinely does hold the record. One getter, not three, and the surviving one survives inspection.

  **The breakdown is a table now, and CI reads it, because recounting it by hand is what kept going wrong.** Three times this item recounted the residue in prose and three times the prose went stale — most tellingly when `get_protocol_version` turned out never to have been accounted for *at all*, found by somebody adding up a paragraph rather than by any check. Meanwhile `check-spec-drift.mjs` printed the residue on every run under the heading "§9 carries a reason for each", which was an assertion it did not test: the same defect this repository keeps finding in its own harnesses, a label claiming more than it checks. It checks it now. The table below must name **exactly** the unsurfaced set — a function missing from it fails the build, and so does a row for a function that has since been surfaced or no longer exists.

  **And the other half of this item is gated now too, which is the half nobody
  would have gone looking at.** The sentence above names fourteen functions as
  shipped; until now nothing checked that any of them still had a call site. The
  accounting table and that sentence are two halves of one claim — what has a
  screen and what does not — and only the second half was tested. `check-spec-
  drift.mjs` now fails if a function named as shipped has no `callZome` site, or
  is not an extern at all.

  **The asymmetry mattered more than it looks.** This item already records what
  the other direction costs: a stale sentence calling a capability unsurfaced a
  month after it shipped, which sent a session off to build a screen that
  already existed. That error gets found, eventually, because somebody wants the
  feature and goes to build it. **A sentence promising a screen that has quietly
  lost its call site is never found that way** — nobody checks a claim that
  something exists. It fails silently and for longer, which is why the untested
  half was the one worth testing.


  **And one SPEC rule is checked now rather than merely written down, which is the first time that has been true.** `check-spec-drift.mjs` and SPEC §11 have both said for a long time that most of the document is MUST and SHOULD rules about validation, and that nothing compares those to `validate_*`. **§5.2's author binding is compared now** — for every entry type carrying an `author`, `agent`, `creator` or `proposer` field, the validator must compare that field against the authoring action's real author. A missing bind is forgery: an agent authoring an entry attributed to somebody else.

  **The compiler cannot cover this, and that is the whole justification.** `validate_create_entry`'s match over `EntryTypes` has no wildcard, so rustc refuses to build when a new entry type has no arm — that half is genuinely gated and this does not duplicate it. What rustc cannot see is what the arm *does*. **Proven rather than argued:** `validate_claim`'s bind was replaced with `if false` and the zome built clean, exit 0, with one warning — and the warning appeared only because `action` became unused in that function, so a validator still using the action for anything else would compile silently. An entry type with a forgeable author ships green.

  **All thirteen bind today**, measured, so this finds no current defect and does not pretend to. It exists for the fourteenth entry type, added by somebody who has not read §5.2. The comparison has to name the *field*: an earlier draft matched any `.author()` call in the validator and would have passed one calling it for an unrelated purpose — the same "matched something adjacent to the thing" error as the `chromium.mjs` count. The script's "NOTHING here verifies those rules" caveat is narrowed rather than left standing, because it is now false in exactly one place.

  | Unsurfaced extern | Why it has no screen |
  |---|---|
  | `create_mew` | bridge-only — `bridge/` owns the Twitter surface, and the UI is not a Twitter client |
  | `get_mew` | bridge-only |
  | `get_mews_by_agent` | bridge-only |
  | `get_twitter_replies_for_claim` | bridge-only |
  | `get_unbridged_claims` | bridge-only |
  | `get_unbridged_mews` | bridge-only |
  | `import_twitter_reply` | bridge-only |
  | `promote_mew_to_claim` | bridge-only |
  | `record_twitter_mirror` | bridge-only |
  | `get_federation_records_for` | `federation/`'s, not a screen's |
  | `record_federation` | `federation/`'s, not a screen's |
  | `build_neighborhood_binding` | HRR's two-step pipeline, which is for a caller caching a corpus and probing it repeatedly; a screen wants the one-call `query_neighborhood_resonance`, which it has |
  | `recall_neighborhood` | the other half of that pipeline, same reason |
  | `attempt_false_domain_index` | a negative-path prober — its own doc comment says it exists to *fail*, so validation can be watched refusing a poisoned index rather than assumed to |
  | `attempt_false_membrane_registry` | a negative-path prober, same shape |
  | `attempt_unaccountable_membrane` | a negative-path prober, same shape |
  | `export_to_n4l` | an export path whose caller is `sstorytime/ingest.sh`, not a screen |
  | `get_all_constitutions` | chain-local by specification (SPEC §10.0) — a global list it cannot honestly produce |
  | `get_critique_species` | hash-addressed getter, same reason |
  | `get_protocol_version` | its callers are the gateway and the federation bridge, which must state which protocol they speak; a screen has no such sentence to write. Covered by `scripts/live-verify/protocol-version.mjs` |
  | `get_pre_registrations_for_question` | **deliberately unsurfaced** — a per-question list of revealed predictions is a list of people who called it right, with no sight of what any of them committed to and never revealed. See the pre-registration entry above |

  *(Superseded figures kept as a record of when each recount happened, since a count that drifts silently is how the last error here went unnoticed: 41 of 64 with a residue of 23, before `get_claim` and `get_evidence` were surfaced by the grounding chain; 38 of 60 with a residue of 22, which is the recount that found `get_protocol_version` unaccounted for; before that 38 of 58, residue 20, when the neighborhood surface landed; before that 37 of 58, residue 21.)*

  **What that drift shows is the shape of the problem rather than a slip in arithmetic.** The paragraph above read "the denominator is 58 … the numerator is now 37 … the 21 divide as … two probers", every figure of which was right when it was written. Since then two externs were added (`attempt_false_membrane_registry` among them) and `query_worldline_resonance` gained a surface — so the headline's own "38 … 22" had quietly become correct again on a denominator of 60 while the verified paragraph beneath it stayed at 58, and the two halves of one item disagreed with each other. A ratio that has to be recounted by hand to stay true will keep going stale between recounts; `check-spec-drift.mjs` already computes the denominator on every push, and the numerator was the half nothing measured. **It measures both now, and gates on them** — see the entry above. The diagnosis in this paragraph is what the change was built from, so it stays as written rather than being edited into hindsight.

  **The worldline half of the HRR group now has a surface, and the paragraph that once called the whole group deferred was wrong about it.** The claim was "Phase 3 defers with payloads empty, so there is nothing to show yet", which is the opposite of what Phase 3 did: it is Phase *2*'s line — "WorldlineTrace with HRR hooks (payloads empty)" — describing the state before the work, mistakenly carried forward past it. `generate_worldline_trace` populates `trace_payload` and `binding_key` from a real superposition over every period the chain scan computes, and leaves them `None` only for an empty chain with nothing to compress. Neighborhood binding and peer query support shipped too. Those eight were the one part of the residue with real data and no screen, and five of them — the worldline half — were surfaced on exactly that argument: a worldline should be legible to its own author. The three that remain are neighborhood binding, which §2.5 treats as an independent use case rather than the rest of this one. Recorded at this length because the error survived being copied forward and then repeated aloud, and a count that quietly justifies itself is worse than no count.

  Tracking the raw ratio overstates the gap, and — as the read/write asymmetry above showed — can understate it too, since a function with a screen can still be half-surfaced.

  A note on the denominator moving: it was 57 and is now 58 because PR #51 added `attempt_false_domain_index`, a prober extern that exists so validation can be watched refusing a poisoned index rather than assumed to. It is not a screen anyone wants, and it moves the denominator without moving the goal — recorded because a count that drifts silently is how the last error in this metric went unnoticed.

  A note on the count itself: it was reported as "12 of 56" for several increments and was wrong — the metric regex only matched calls whose function name sat on the same line as `callZome`, and several wrap. Corrected by counting across lines.
- [x] ~~**Academic validation study**~~ — **decided against, not deferred**, and recorded that way because the distinction is the whole point of this list. It sat here as a bare line with no argument attached, which is the shape of an item that survives by never being examined: listed, unfinished, and not an engineering task, so every pass over this roadmap surfaced it as the obvious remaining gap. It is not a gap. The same treatment the token/cost currency layer got applies here — an item decided against stops being re-proposed, where an item merely unfinished does not.

  **This is the failure mode §9 already describes about itself**, one entry above: "a recorded question acquires standing. It stops being re-read against what shipped after it was written, and the more precisely it was argued the more settled it looks." This line was the opposite case and reached the same end — argued not at all, and therefore never answerable, so it outlived every item around it.

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
terms: cross-internet peer discovery now has **exactly one measured crossing**
— 5.0s between two hosts, which is one run on datacentre VMs and not the
two-consumer-routers case that matters to a user — and a returning node takes
minutes rather than seconds to catch up when it is the only other peer. See §9.

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

**This document's own header said something different until it was corrected,
and the correction is recorded rather than swapped in silently.** It read
`License: TBD (recommend: AGPL-3.0 for protocol layer)` — a recommendation from
before the decision was taken, left in place after it. Everything that actually
governs the licence had already moved: `LICENSE`, `LICENSE-MIT`,
`LICENSE-APACHE`, `dna/integrity/Cargo.toml`, `dna/coordinator/Cargo.toml`,
`agent-sdk/package.json` and `mcp-server/package.json` all say
`MIT OR Apache-2.0`, as does this section. So the header was the single outlier,
and it was the first line a visitor read — which is the worst place for a stale
claim and the reason AGPL, a licence this project does not use, could have been
quoted back at it in good faith. Recorded here because a licence is exactly the
kind of fact somebody acts on without asking.

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
