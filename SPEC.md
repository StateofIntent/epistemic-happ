# The Epistemic Resonance Protocol — Specification

**Tracks:** `main` @ `9e583dd` (PR #19 merged), plus this document's own metabolic-currency addition — Phases 1–4 complete, Phase 5 in progress
**Status:** Living document — see [§11](#11-versioning--change-process)
**Companion to:** `README.md` (the architecture, philosophy, and build/run manual — read that first for *why*; this document is *what, exactly*)

---

## 0. Purpose and Scope

`README.md` is this project's narrative account: the biological/physical metaphors that motivated each design decision, a code walkthrough, and a running changelog of what shipped and how it was verified. This document extracts the same protocol into a form deliberately stripped of that framing — precise enough that an independent implementation (a different language, a different Holochain zome layout, or a non-Holochain reimplementation targeting protocol compatibility) could conform to it without reading a single line of Rust.

Everything normative here is a direct transcription of what `dna/integrity/src/lib.rs` and `dna/coordinator/src/lib.rs` actually enforce as of the commit above — not aspiration, not roadmap. Roadmap items (Phase 5 and beyond) are out of scope for this document entirely; see `README.md` §9 for those.

## 1. Conformance Language

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** in this document are to be interpreted as in RFC 2119: MUST/MUST NOT are hard requirements a conforming implementation cannot violate; SHOULD/SHOULD NOT are strong defaults that may be departed from with reason; MAY is genuinely optional.

Every MUST/MUST NOT below is currently enforced by real DHT-side validation (the integrity zome), not merely a coordinator-side convention — Holochain validates independently on every peer, so a rule that only lived in a coordinator function would not actually be protocol-conformant; it would just be one client's courtesy. Where a constraint is coordinator-side only (a "friendly," bypassable pre-check paired with the real DHT-side enforcement), this is stated explicitly.

## 2. Data Model

Every entry type below is a Holochain app entry (`#[hdk_entry_helper]`). Field types use Rust/Holochain vocabulary directly (`AgentPubKey`, `EntryHash`, `ActionHash`, `AnyLinkableHash`) since this protocol is currently defined only in terms of a Holochain DHT — a non-Holochain implementation MUST provide an equivalent content-addressed hash and agent-key primitive for each.

### 2.1 `Mew`
Lightweight, tweet-sized staging entry for inbound bridge content — the raw stimulus before (optional) promotion to a `Claim`.

| Field | Type | Notes |
|---|---|---|
| `content` | `String` | MUST be non-empty; MUST be ≤ 560 bytes (2× a tweet, for Unicode headroom) |
| `author` | `AgentPubKey` | MUST equal the creating action's author |
| `timestamp` | `u64` | |
| `reply_to` | `Option<EntryHash>` | |
| `semantic_tags` | `Vec<String>` | |
| `linked_claim` | `Option<EntryHash>` | If `Some`, MUST resolve to a real entry |

### 2.2 `Claim`
A knowledge assertion — the graph's primary unit of content.

| Field | Type | Notes |
|---|---|---|
| `content` | `String` | MUST be non-empty |
| `domain` | `String` | MUST be non-empty. Free text at the `Claim` level — a `Membrane` (§2.7) is what makes a domain a real, sovereign, promise-bearing entity, but nothing requires a `Claim`'s domain to have a corresponding `Membrane` |
| `author` | `AgentPubKey` | MUST equal the creating action's author |
| `timestamp` | `u64` | |
| `evidence_hashes` | `Vec<EntryHash>` | Every hash MUST resolve to a real entry (not necessarily an `Evidence` entry specifically — see §5.9, Grounding) |
| `confidence` | `ConfidenceLevel` (§3.1) | |
| `semantic_tags` | `Vec<String>` | |
| `source_mew` | `Option<EntryHash>` | If `Some`, MUST resolve to a real entry |

### 2.3 `Retraction`
Not a deletion — a new entry recording that the author no longer stands by a claim, and why.

| Field | Type | Notes |
|---|---|---|
| `target_claim` | `EntryHash` | MUST resolve to a real entry |
| `reason` | `String` | MUST be non-empty |
| `replacement_claim` | `Option<EntryHash>` | If `Some`, MUST resolve to a real entry |
| `author` | `AgentPubKey` | MUST equal the creating action's author |
| `timestamp` | `u64` | |

### 2.4 `Critique`
A typed response to any critiquable node. Scale-invariant: the same entry type and validation apply whether the target is a `Claim`, another `Critique`, a `Constitution`, a `Membrane`, or a `CritiqueSpecies`.

| Field | Type | Notes |
|---|---|---|
| `target` | `AnyLinkableHash` | MUST resolve to a real entry whose actual type matches `target_type` (§5.4) |
| `target_type` | `CritiqueTargetType` (§3.4) | Cross-checked against the DHT, not trusted at face value — see §5.4 |
| `critique_mode` | `CritiqueMode` (§3.2) | The typed receptor mode — MUST be one of the five fixed variants; never free text (see Invariant #4, §7) |
| `content` | `String` | MUST be non-empty |
| `author` | `AgentPubKey` | MUST equal the creating action's author |
| `timestamp` | `u64` | |
| `replication_attempted` | `bool` | |
| `evidence_hashes` | `Vec<EntryHash>` | Not independently validated to resolve (unlike `Claim.evidence_hashes`) |
| `species` | `Option<EntryHash>` | If `Some`, MUST resolve to a real entry |

Creating a `Critique` is rate-limited (§6) and, as a side effect, creates one `SynapticLink` (§2.12) from `target` to the critique's own `ActionHash` at initial conductance `1.0`.

### 2.5 `AntibodyPattern`
An agent's own recognition that some entry exhibits a known bad-faith *structural or behavioral* pattern — distinct from a `Critique`, which adjudicates a claim's *content*. See Invariant #1 (§7) for why this entry type deliberately cannot target an `AgentPubKey` directly.

| Field | Type | Notes |
|---|---|---|
| `target` | `AnyLinkableHash` | Same five valid target kinds as `Critique.target`, same DHT cross-check (§5.5). MUST NOT be, and cannot structurally be, an `AgentPubKey` — only the five entry kinds `CritiqueTargetType` enumerates are accepted |
| `target_type` | `CritiqueTargetType` (§3.4) | |
| `kind` | `AntibodyPatternKind` (§3.5) | Fixed, typed vocabulary — never free text |
| `rationale` | `String` | MUST be non-empty |
| `author` | `AgentPubKey` | MUST equal the creating action's author |
| `timestamp` | `u64` | |

Creating an `AntibodyPattern` is rate-limited (§6).

### 2.6 `Evidence`
Supporting data a `Claim` or `Critique` may cite.

| Field | Type | Notes |
|---|---|---|
| `content` | `String` | MUST be non-empty |
| `evidence_type` | `EvidenceType` (§3.3) | |
| `source_url` | `Option<String>` | |
| `author` | `AgentPubKey` | MUST equal the creating action's author |
| `timestamp` | `u64` | |

### 2.7 `Membrane`
A domain's sovereign, promise-bearing boundary. Not required to exist for a `Claim` to use its `domain` string, but required for that domain to be queryable as discourse health (§10.9) or scoped attestation (§10.8).

| Field | Type | Notes |
|---|---|---|
| `domain` | `String` | MUST be non-empty |
| `description` | `String` | |
| `required_promises` | `Vec<String>` | |
| `validation_rules_hash` | `Option<EntryHash>` | Not independently validated |
| `creator` | `AgentPubKey` | MUST equal the creating action's author |
| `created_at` | `u64` | |
| `constitution` | `ActionHash` | The creator's own published `Constitution` — required (not optional); not independently validated to resolve or belong to `creator` at the DHT-validation layer (accountability by requiring the field to be populated, not a cross-check) |

### 2.8 `Constitution`
An agent's voluntary, published promises — Promise Theory made explicit in the DHT.

| Field | Type | Notes |
|---|---|---|
| `agent` | `AgentPubKey` | MUST equal the creating action's author |
| `promises` | `Vec<Promise>` | MUST be non-empty. Every element's `action` and `domain` MUST be non-empty |
| `conditions` | `Vec<Condition>` | |
| `published_at` | `u64` | |
| `expires_at` | `Option<u64>` | If `Some`, MUST be `> published_at` |

`Promise { action: String, domain: String, modality: Option<CritiqueMode> }` — `action`/`domain` describe what's promised (e.g. `"validate_claims"` / `"LumbarRehab"`); `modality` optionally names which `CritiqueMode` the promise concerns.
`Condition { condition_type: String, parameters: Vec<String> }` — not independently validated beyond being present.

### 2.9 `CritiqueSpecies`
An evolving critique taxonomy — self-similar branching with no privileged root.

| Field | Type | Notes |
|---|---|---|
| `name` | `String` | MUST be non-empty |
| `parent_species` | `Option<EntryHash>` | If `Some`, MUST resolve to a real entry |
| `required_evidence` | `Vec<String>` | |
| `proposer` | `AgentPubKey` | MUST equal the creating action's author |
| `created_at` | `u64` | |

There is deliberately no stored adoption-count field — see §10.6's `get_critique_species_adoption_count`, a live query over real links, not a self-declared number (Invariant #1, §7).

### 2.10 `WorldlineTrace`
An agent's own index of their source-chain history — a table of contents, with an optional HRR compression hook.

| Field | Type | Notes |
|---|---|---|
| `agent` | `AgentPubKey` | MUST equal the creating action's author |
| `period_boundaries` | `Vec<PeriodBoundary>` | MUST be non-empty. See §5.7 for per-boundary constraints |
| `expertise_tags` | `Vec<String>` | Informal, non-authoritative — see §10.6's `assert_expertise` for the accountable alternative |
| `trace_payload` | `Option<Vec<u8>>` | If `Some`, MUST be ≤ 65,536 bytes. See §8 for its HRR encoding when populated |
| `binding_key` | `Option<Vec<u8>>` | See §8 |
| `checksum` | `Vec<u8>` | MUST be exactly 32 bytes |
| `created_at` | `u64` | |
| `expires_at` | `Option<u64>` | If `Some`, MUST be `> created_at` |

`PeriodBoundary { start_time: u64, end_time: u64, sample_action: ActionHash, domain_tag: String, entry_count: u32 }` — `sample_action` MUST resolve to a real action authored by the same `agent` as the trace; `start_time` MUST be `<= end_time`.

### 2.11 `BridgeRecord`
A durable, one-sided correlative witness between a Holochain entry and a Twitter post. Asymmetric by design: Holochain remembers the correlation permanently; Twitter has no awareness of or obligation toward it.

| Field | Type | Notes |
|---|---|---|
| `mew_hash` | `EntryHash` | MUST resolve to a real entry (the mirrored `Mew` or `Claim` — the field name is historical) |
| `twitter_id` | `String` | |
| `platform` | `String` | |
| `mirrored_at` | `u64` | |
| `carried_fields` | `Vec<String>` | Named fields of the original entry that made it into the excerpt |
| `dropped_fields` | `Vec<String>` | Named fields that did not. MUST NOT share any element with `carried_fields` |
| `original_length` | `u32` | |
| `excerpt_length` | `u32` | MUST be `<= original_length` |

The DHT cannot independently verify `carried_fields`/`dropped_fields` are *accurate* to what was really dropped (only that the two lists are internally consistent) — the same asymmetric-witness limitation as the rest of `BridgeRecord`.

### 2.12 `ExternalCritique`
A Twitter reply imported into the critique graph as a typed entry.

| Field | Type | Notes |
|---|---|---|
| `twitter_id` | `String` | |
| `author_handle` | `String` | |
| `content` | `String` | MUST be non-empty |
| `linked_holochain_claim` | `EntryHash` | MUST resolve to a real entry |
| `imported_at` | `u64` | |

### 2.13 `SynapticLink` (a link, not an entry)
Not an entry type — a `TargetToCritique`-paired link (§4) from a `Critique`'s target to the critique's own `ActionHash`, carrying a 4-byte little-endian `f32` initial conductance in its `LinkTag`. Immutable once written (Holochain `LinkTag`s cannot be mutated) — see §5.11 and §5.12 for how its *effective* conductance is instead computed fresh at read time from decay and `Reinforcement` links.

### 2.14 `FederationRecord`
A membrane's own, one-sided witness that it recognizes a specific membrane on a **different** Holochain network. See §10.14 for why this is necessarily one-sided (the two networks share no DHT) and how mutual recognition is derived externally rather than stored.

| Field | Type | Notes |
|---|---|---|
| `local_membrane` | `EntryHash` | MUST resolve to a real `Membrane` entry on this network |
| `remote_network_label` | `String` | MUST be non-empty. A human-readable identifier for the remote network — not independently verifiable, the same asymmetric-witness limitation `BridgeRecord.platform` already has |
| `remote_membrane_ref` | `String` | MUST be non-empty. An opaque, out-of-band reference to a membrane on the remote network (its own `EntryHash`, base64-encoded, by convention — but this DHT cannot and does not verify that) |
| `author` | `AgentPubKey` | MUST equal the creating action's author, AND MUST equal `local_membrane`'s own `creator` field (§5.18) — only a membrane's own founder may declare federation on its behalf |
| `created_at` | `u64` | |

## 3. Enumerations

Every enumeration below is a plain Rust enum (`#[derive(Serialize, Deserialize)]`, no custom representation attributes) — on the wire (Holochain's msgpack payload encoding) each unit variant serializes as its bare variant name string (e.g. `"Moderate"`, `"Logical"`), not an integer or a tagged object. An implementation in another language MUST reproduce this exact string representation to interoperate.

### 3.1 `ConfidenceLevel`
`Hypothetical` | `Tentative` | `Moderate` | `High` | `Certain`

### 3.2 `CritiqueMode`
`Experiential` | `Methodological` | `Logical` | `Evidential` | `Phenomenological`

Fixed and exhaustive by design (Invariant #4, §7) — never extended with free text.

### 3.3 `EvidenceType`
`Study` | `CaseReport` | `Video` | `Image` | `Text` | `Measurement`

### 3.4 `CritiqueTargetType`
`Claim` | `Critique` | `Constitution` | `Membrane` | `CritiqueSpecies`

The five entry kinds a `Critique` or `AntibodyPattern` may target. Exists because `to_n4l` (§9) is a pure function with no DHT access and needs to be told, in the entry itself, which alias prefix to resolve a cross-reference under — but the field is authoritative, not merely advisory, because validation independently re-derives the target's real type from the DHT and rejects a mismatch (§5.4, §5.5).

### 3.5 `AntibodyPatternKind`
`SpamFlood` | `SybilCluster` | `Plagiarism` | `CoordinatedManipulation` | `Impersonation`

Fixed and exhaustive by design, the same "typed, not flattened" discipline `CritiqueMode` applies to disagreement (Invariant #4, §7), applied here to bad-faith-pattern recognition instead.

### 3.6 `NeighborKind`
`Evidence` | `Critique`

The two roles a candidate hash may be probed under in neighborhood-binding recall (§8.2).

## 4. Link Types

Every row is a Holochain typed link (`#[hdk_link_types]`). "Base → Target" gives the link's direction; "Tag" gives what (if anything) is encoded in the `LinkTag`.

| Link type | Base → Target | Tag | Notes |
|---|---|---|---|
| `MewToClaim` | `Mew` → `Claim` | `"promoted"` | Promotion |
| `ClaimToRetraction` | (a) `Claim` (`target_claim`) → `Retraction`; (b) *also reused*: the `Retraction`'s own `ActionHash` → its `replacement_claim`, when present | `"retracted"` (a); `"replacement"` (b) | One link type serving two distinct semantic purposes depending on which entry is the base — verify which case applies from the base's real type, not the link type name alone |
| `TargetToCritique` | Any of the five `CritiqueTargetType` kinds → `Critique` | `critique_mode` (debug-formatted) | One link type reused across all five target kinds — Holochain's link model does not care what entry type a link's base is |
| `CritiqueToEvidence` | *(declared, unused)* | — | Declared in `LinkTypes` but not created or read by any current coordinator function |
| `ClaimToEvidence` | *(declared, unused)* | — | Declared in `LinkTypes` but not created or read by any current coordinator function |
| `CritiqueToSpecies` | `CritiqueSpecies` (`EntryHash`) → `Critique` | `"adopts"` (literal string) | **Name is the inverse of its actual direction** — the base is the species, not the critique; verify against `create_critique`/`get_critique_species_adoption_count` rather than the name alone. The real, query-time basis for adoption counting (§10.6) |
| `MembraneToClaim` | *(declared, unused)* | — | Declared in `LinkTypes` but not created or read by any current coordinator function |
| `AgentToMembrane` | `Membrane` (`EntryHash`) → the joining agent's own anchor (not the raw `AgentPubKey` directly — see below) | Raw 36-byte `AgentPubKey` | The real agent identity lives in the tag, cross-checked against it (§5.13); target is an agent anchor, same construction as §4's closing note |
| `AttestationGrant` | `Membrane` (`EntryHash`) → candidate agent (`AgentPubKey`, directly — not an anchor) | The granter's own `my_membership_action` `ActionHash`, raw 36 bytes | See §5.14 — a costed (tenure- and budget-gated) act of vouching; the tag is what tenure validation independently re-fetches and checks |
| `AgentToConstitution` | Agent anchor → `Constitution` | `"constitution"` | |
| `AgentToWorldlineTrace` | Agent anchor → `WorldlineTrace` | `"worldline"` | |
| `AgentToClaim` | Agent anchor → `Claim` | `domain` (raw bytes) | |
| `AgentToMew` | Agent anchor → `Mew` | `"mew"` | |
| `ClaimToBridgeRecord` | `Claim` → `BridgeRecord` | `"bridged"` | |
| `ClaimToExternalCritique` | `Claim` (`linked_holochain_claim`) → `ExternalCritique` | `"twitter"` | |
| `MewToBridgeRecord` | `Mew` → `BridgeRecord` | `"bridged"` | |
| `SpeciesToParent` | **parent** `CritiqueSpecies` → the newly created (child) `CritiqueSpecies` | `"child"` | **Name is the inverse of its actual direction** — the base is the parent, the target is the new species being created, despite the name reading like "species → its parent." Verify against `create_critique_species` rather than the name alone |
| `SpeciesToCritique` | *(declared, unused)* | — | Declared in `LinkTypes` but not created by any coordinator function (`CritiqueToSpecies` above, base/target as corrected in that row, is the link actually used for this relationship) |
| `TargetToAntibody` | Any of the five `CritiqueTargetType` kinds → `AntibodyPattern` | `kind` (debug-formatted) | Same one-link-type-for-five-kinds reasoning as `TargetToCritique` |
| `SynapticLink` | A `Critique`'s target → the critique's own `ActionHash` | 4-byte LE `f32` initial conductance | See §2.13, §5.11 |
| `Reinforcement` | A `SynapticLink`'s own `CreateLink` `ActionHash` → the reinforcing agent | — | See §5.12 |
| `MembraneToFederationRecord` | `Membrane` → `FederationRecord` | `remote_network_label` (raw bytes) | See §2.14, §5.18, §10.14 |

"Agent anchor" is `path_entry_hash()` of the `Path` constructed from the string `agent_{agent_pub_key}` — a deterministic per-agent anchor point, not a stored entry of its own.

**A note on the pattern above, stated once rather than per-row**: four link-type *names* in this table (`CritiqueToSpecies`, `SpeciesToParent`, and by convention likely worth re-checking before relying on any other name in this enum) do not describe their actual base→target direction — they describe the *relationship*, and Holochain's `create_link(base, target, ...)` was written with whichever direction was operationally convenient for the query pattern the code needed, not to match the type name. This specification states the verified, actual direction in every row; a future implementer should verify against `create_link`/`get_links` call sites directly rather than infer direction from a link type's name, in this codebase or a reimplementation of it.

## 5. Validation Rules

Validation is enforced by **every validating peer independently** (Holochain's `validate(Op)` callback), not by a coordinator/client convention — this is what makes each MUST below a real protocol requirement rather than the reference implementation's own preference.

### 5.1 Global rule: no deletion
Any `RegisterDelete` operation is **rejected outright** — `ValidateCallbackResult::Invalid("Deletion is not permitted. Entries are immutable.")`. This applies to every entry type without exception. See Invariant #6 (§7).

### 5.2 Author binding
For every entry type carrying an `author`/`agent`/`creator`/`proposer` field, that field MUST equal the actual authoring action's real author. This is checked independently by every validator (listed per-type in §2) — never trusted from the entry's own claimed value alone.

### 5.3 Referential integrity
Every field typed as an `EntryHash` reference to another entry (`evidence_hashes`, `source_mew`, `linked_claim`, `target_claim`, `replacement_claim`, `parent_species`, `mew_hash`, `linked_holochain_claim`) MUST resolve to a real, existing entry at validation time, except where noted otherwise in §2 (`Critique.evidence_hashes` and `Membrane.constitution` are the two documented exceptions — populated but not independently cross-checked to resolve/match).

### 5.4 `Critique` target cross-check
`Critique.target_type` MUST equal the *actual* DHT-derived type of the entry `Critique.target` resolves to. The validator independently fetches `target` and determines its real type by attempting to deserialize it as each of the five `CritiqueTargetType` candidates in turn — a caller cannot spoof `target_type` to something other than what `target` really is. `target` MUST downcast to an `EntryHash` (an `Agent` or `External`-kind `AnyLinkableHash` is rejected outright — nothing critiquable is addressed that way).

### 5.5 `AntibodyPattern` target cross-check
Identical mechanism and requirement to §5.4, applied to `AntibodyPattern.target`/`target_type`.

### 5.6 `Mew` size bound
`Mew.content` MUST be ≤ 560 bytes — twice a tweet's 280-character limit, headroom for Unicode multi-byte encoding, not a hard tweet-length guarantee.

### 5.7 `WorldlineTrace` structural constraints
- `period_boundaries` MUST be non-empty.
- Every `PeriodBoundary.sample_action` MUST resolve to a real action, authored by the same agent as `WorldlineTrace.agent`.
- Every `PeriodBoundary` MUST have `start_time <= end_time`.
- `checksum` MUST be exactly 32 bytes.
- If `expires_at` is `Some`, it MUST be `> created_at`.
- If `trace_payload` is `Some`, it MUST be ≤ 65,536 bytes.

### 5.8 `Constitution` structural constraints
- `promises` MUST be non-empty.
- Every `Promise.action` and `Promise.domain` MUST be non-empty.
- If `expires_at` is `Some`, it MUST be `> published_at`.

### 5.9 `BridgeRecord` loss-consistency
- `excerpt_length` MUST be `<= original_length`.
- No field name may appear in both `carried_fields` and `dropped_fields`.

These are the only two constraints independently derivable from the entry's own data; the lists' *accuracy* to what was really dropped cannot be validated (see §2.11).

### 5.10 SWO temporal friction — the shared checkpoint-bounded mechanism
Several entry/link creations below are rate-limited per agent via the same mechanism: a rolling time window, a maximum count within that window, enforced as **real DHT-side validation** via `must_get_agent_activity` (not merely a coordinator-side courtesy — a client that bypasses the coordinator's create function still cannot bypass this).

The walk is bounded, not unbounded: a validator first does a small scan (cap: 50 actions) for the author's most recent `WorldlineTrace` (a self-published checkpoint, §2.10). If found, the friction-counting walk is bounded to only the activity since that checkpoint (`ChainFilter::until`). If no checkpoint is found, it falls back to a flat safety cap of 200 actions. An agent who checkpoints regularly gets a precisely-bounded, cheaper validation walk; one who never does still gets a bounded (if less tight) one via the fallback. Within whichever window of activity was scanned, only actions at or after `now - window_secs` and matching the specific action/link type being rate-limited are counted.

This bounds *per-identity throughput only* — it does not raise the cost of creating a new agent identity at all. See Invariant #1's discussion (§7) for why: sybil resistance and spam defense are treated as distinct properties in this protocol, and only the latter is addressed here.

### 5.11 `SynapticLink` creation
- `LinkTag` MUST be at least 4 bytes (the `f32` initial conductance).
- Subject to SWO temporal friction (§5.10, §6): 20 per rolling hour per agent, an absolute limit. There is deliberately no way to buy past it.

**Historical note, because a burn-to-extend tier was specified here in an earlier revision and an implementer may have built it.** That tier made creation free below 20, purchasable up to a ceiling of 30 against `CreditBurn`s tagged `"burn_friction"`, and refused at 30. It was removed after live verification showed no honest client could reach it — `create_critique` is the only way to create a `SynapticLink`, `Critique` creation carries its own hard 20-per-hour cap (§5.15) with no burn tier, and that cap is checked first, so the paid tier opened at exactly the count where creating another `Critique` had already become impossible. It also *weakened* the limit for the one client that could reach it (one authoring `CreateLink` actions directly), granting ten extra links for burns that nothing funded, since balance is not checkable at validation time on an agent-centric DHT.

The mutual-credit ledger that tier was the only consumer of (`MutualCreditTransfer`, `CreditBurn`, `get_credit_balance`, and the countersigning flow around them) was subsequently removed from this protocol entirely. **Throughput here is not purchasable by any mechanism, and a conforming implementation MUST NOT make it so.** The named direction for any future cost layer is non-transferable regenerating capacity — a per-agent budget, spent at differing rates by differing acts, refilling over time, that cannot move between agents — which is verifiable from an agent's own chain exactly as the limits in this section already are, and which never needs to answer questions about other agents.

### 5.12 `Reinforcement` creation
- Target MUST be an `AgentPubKey`, and MUST equal the creating action's own author — an agent can only reinforce as themselves, never on another agent's behalf.
- Base MUST be a real `SynapticLink`'s own `CreateLink` action (independently verified, not trusted) — reinforcement can only attach to an actual synaptic connection, not an arbitrary DHT address.
- Subject to its own, separate SWO temporal friction budget (§5.10, §6): 40 per rolling hour per agent — deliberately larger than `SynapticLink`'s own budget, since reinforcing is a cheaper, more casual act.

### 5.13 `AgentToMembrane` creation
- `LinkTag` MUST be exactly 36 bytes (a raw `AgentPubKey`).
- The tag's encoded agent MUST equal the creating action's real author — membership can only be recorded by the agent joining themselves, never by a third party on their behalf (Promise Theory's voluntary-membership requirement made a real constraint, not just a convention).

### 5.14 `AttestationGrant` creation
Two independent, real costs:
- **Tenure**: the granter MUST reference their own prior `AgentToMembrane` join action (by `ActionHash`, supplied in the link creation). The validator independently fetches that exact action and confirms it (a) really is an `AgentToMembrane` creation, (b) authored by this same granter, (c) based on this same membrane, and (d) old enough — `join_timestamp <= grant_timestamp - 30 days` (`ATTESTATION_GRANT_MIN_TENURE_SECS`, currently `30 * 24 * 3600`).
- **Budget**: subject to SWO temporal friction (§5.10, §6), a *distinct, larger* window than every other friction-limited action here: 5 grants per rolling **7-day** window per agent (deliberately tighter than the hour-scale windows above — vouching is meant to be a rarer, more deliberate act).

### 5.15 `Critique` creation (entry-level friction)
In addition to §5.4's target cross-check and the non-empty `content` requirement (§2.4): subject to SWO temporal friction (§5.10, §6), 20 per rolling hour per agent, enforced independently of whether the caller also created the accompanying `SynapticLink` — closing the gap a client could otherwise exploit by creating a bare `Critique` entry directly, skipping the coordinator's `create_critique` (and the `SynapticLink` it would have made) entirely.

### 5.16 `AntibodyPattern` creation (entry-level friction)
In addition to §5.5's target cross-check and the non-empty `rationale` requirement (§2.5): subject to SWO temporal friction (§5.10, §6), 20 per rolling hour per agent.

### 5.17 All other link types
Every link type not named in §5.11–§5.14 (including `TargetToCritique`, `TargetToAntibody`, `MembraneToFederationRecord`, and every membrane-topology/agent-identity/bridge link in §4) has no dedicated `validate_create_link` branch and is accepted unconditionally at the link-creation layer — whatever constraints apply come from the entry-level validation of what the link connects (e.g. `TargetToCritique`'s real constraint is `Critique`'s own validation, §5.4/§5.15).

### 5.18 `FederationRecord` creation
In addition to the non-empty `remote_network_label`/`remote_membrane_ref` requirements (§2.14): `local_membrane` MUST resolve to a real `Membrane` entry, and the creating agent MUST equal that `Membrane`'s own `creator` field — only a membrane's own founder may declare federation on its behalf, the same governance principle that already gates who can found the membrane at all (§5's `Membrane` author-binding rule, §5.2). No SWO temporal friction — see §10.14 for why.

## 6. Rate Limits (SWO Temporal Friction) — Consolidated

All windows are rolling (not fixed calendar buckets) and per-agent (global across domains, not per-domain — a deliberate, documented tradeoff, not an oversight). Coordinator-side and DHT-side limits are kept numerically identical by convention (each constant's own comment cross-references its sibling); nothing enforces that equality automatically.

| Rate-limited action | Window | Max per window | Enforced |
|---|---|---|---|
| `SynapticLink` creation | 1 hour | 20 | DHT (§5.11) + coordinator pre-check |
| `Critique` creation | 1 hour | 20 | DHT (§5.15) + coordinator pre-check |
| `AntibodyPattern` creation | 1 hour | 20 | DHT (§5.16) + coordinator pre-check |
| `Reinforcement` creation | 1 hour | 40 | DHT (§5.12) + coordinator pre-check |
| `AttestationGrant` creation | 7 days | 5 | DHT (§5.14) + coordinator pre-check |

`AttestationGrant`'s tenure bar (30 days of prior membership, §5.14) is a separate, non-windowed cost, not a rate limit.

Every row is an absolute cutoff. Nothing in this protocol can be bought past — `SynapticLink` briefly had a purchasable middle tier and no longer does (§5.11).

**What this is not**: none of the above raises the cost of creating a new agent identity — an unlimited number of fresh agents can each independently spend their own full budget. This is documented in this codebase as *spam defense*, explicitly distinct from *sybil resistance*, which remains open (see README.md §2.3 for the full discussion and the local-topology mitigation that is available without it).

## 7. Invariants

The following ten invariants are the protocol's own normative constraints on any future extension, restated here verbatim from `README.md` Appendix A as the specification's binding requirements, not merely design guidance:

1. **Never compute or expose a canonical, comparative reputation score.** Raw promise-keeping history stays open and queryable — nothing is hidden or deleted. But no karma, no stars, no trust index, and no sorted "top agents" or "top species" leaderboard. Interpretation of that history stays local to the observer.
2. **The topology is the truth function**, not an algorithm.
3. **Every claim carries its own history.**
4. **Every critique is typed, not flattened.**
5. **Every domain is a sovereign membrane.**
6. **Nothing is deleted — only witnessed or atrophied.**
7. **The bridge must preserve dimensionality**, not extract it.
8. **Agents are cells with membranes**, not users with accounts.
9. **Death is required** — unused entry types and membranes must atrophy.
10. **The system doesn't compute truth. It creates conditions for truth to resonate.**

Two clarifying notes carried forward from Appendix A, since they materially affect conformance:

- **On Invariant 7**: this means the DHT's own dimensionality must never be flattened by the bridge's presence — not that every external platform the bridge touches can itself carry that dimensionality. Inbound (Twitter → DHT), the invariant holds fully. Outbound (DHT → Twitter), a 280-character platform cannot carry a typed critique graph by construction, so the bridge sends a lossy excerpt plus a link back to the full record instead; the invariant is satisfied by making that loss legible (§2.11's `carried_fields`/`dropped_fields`) and one-directional, not by pretending the excerpt is complete.
- **On Invariant 1**: every opt-in, caller-supplied filter this protocol currently exposes (`AttestationPolicy`, `ConductancePolicy` — §10.8, §10.9) is deliberately **never a protocol default**. Omitting the field is always exactly the old, unfiltered behavior; supplying it states the *caller's own* trust policy, never a value the protocol computes and asserts as authoritative. A hardcoded, always-applied version of either would itself be the kind of canonical signal this invariant rules out.

## 8. HRR Encoding (Holographic Reduced Representations)

Both HRR mechanisms below are **reading lenses only** — approximate, local, recomputed on demand — never a second source of truth. Every value they return carries the real `EntryHash`/`ActionHash`(es) it was computed from or scored against; the exact, lossless answer always remains the direct DHT read (`get_grounding_path`, `export_to_n4l`, or a plain `get()`).

### 8.1 Common parameters
- **Dimension**: `HRR_DIM = 512`, `f32` per component.
- **Vector byte encoding**: 512 × 4 = 2048 bytes, each `f32` little-endian, in index order. Exact, lossless round-trip codec (only the HRR math itself — bind/unbind/superpose — is lossy, not this serialization).
- **Atomic symbol vectors**: derived deterministically from a symbol string via SHA-256 of the string, used to seed a splitmix64 generator, which produces the 512 components (no external RNG or FFT crate). Same string → same vector, always; empirically low (< 0.3) cosine similarity between unrelated symbol strings.
- **Core operations**: `hrr_bind` (circular convolution), `hrr_unbind` (circular correlation via involution), `hrr_superpose` (normalized sum), `hrr_cosine_similarity` — standard Plate (1995) VSA operations.

### 8.2 Worldline binding
Compresses one agent's `WorldlineTrace` period index into a single vector: the superposition of `hrr_bind(hrr_symbol_vector(domain_tag), hrr_symbol_vector(period_symbol(i)))` across every real period `i` the trace's own chain scan computes, where `period_symbol(i)` is a fixed, public, index-derived string (never separately stored — a pure function of `i` alone).

- **`binding_key`**: the literal byte string `b"hrr-v1;dim=512;pos=period_index"`. Not a secret — every quantity the scheme needs is a pure function of this string alone; its role is forward-compatibility. A `WorldlineTrace` whose `binding_key` does not exactly match this value MUST be treated as an incompatible/unreadable scheme version by any caller attempting to unbind it (`query_worldline_resonance`, §10.6, checks this and rejects rather than silently misreading).
- **Query**: given a peer's `AgentPubKey`, unbind their trace and rank candidate period indices by resonance (`query_worldline_resonance`, §10.6) — approximate "which period(s) likely cover this," never a substitute for reading `period_boundaries` directly. `max_periods` is clamped server-side to `MAX_RESONANCE_QUERY_PERIODS = 4096` regardless of what a caller requests.
- **Empty-chain edge case**: if a trace has no periods to bind, both `trace_payload` and `binding_key` are left `None` rather than emitting a meaningless all-zero vector.

### 8.3 Neighborhood binding
An independent second use case: compresses one `Claim`'s local neighborhood (its direct `evidence_hashes` citations, plus every `Critique` found via `TargetToCritique`, up to `MAX_NEIGHBORHOOD_CRITIQUES = 512`) into its own corpus, queried associatively rather than temporally.

- **`binding_key`**: the literal byte string `b"hrr-neighborhood-v1;dim=512;pos=source_hash"` — same forward-compatibility role as §8.2's, and the same MUST-reject-on-mismatch requirement for any caller attempting to score against it.
- Each neighbor is bound as `hrr_bind(role_symbol(kind), hash_symbol(source_hash))`, where `role_symbol` distinguishes `NeighborKind::Evidence` from `NeighborKind::Critique` and `hash_symbol` is derived from the neighbor's own hash bytes.
- **Never written to the DHT** — recomputed fresh on every call (`build_neighborhood_binding`, `recall_neighborhood`, `query_neighborhood_resonance` — §10.7), consistent with the reading-lens requirement above: there is no `NeighborhoodBinding` entry type, only a computed, ephemeral response shape.
- **Empty-neighborhood edge case**: a `Claim` with no citations and no critiques returns a `NeighborhoodBinding` with empty `corpus_payload`/`binding_key`/`neighbor_kinds`/`source_hashes` — note `binding_key` is empty here, *not* `NEIGHBORHOOD_BINDING_KEY`, since there is nothing to have bound under that scheme.
- **Recall** (`NeighborRecall`) always echoes back the exact candidate `source_hash`/`kind` its score is about — a bare similarity number with nothing to check it against would be a protocol violation of the reading-lens requirement, not an acceptable convenience shortcut.

## 9. N4L Export Mapping

`export_to_n4l` (§10.11) serializes a subset of the DHT graph into real [N4L](https://github.com/markburgess/SSTorytime/blob/main/docs/N4L.md) text (SSTorytime's own note-taking/graph language), not JSON or a struct-literal format. This section is the normative reference for that mapping; the authoritative relation vocabulary itself lives in `n4l/arrows-epistemic.sst`, which any consumer of this export MUST have merged into its own N4L configuration for the relation names below to resolve (see that file's own header for the exact merge procedure — N4L's real binary only reads six fixed config filenames, never a file placed "alongside" them unmerged).

### 9.1 Output structure
- Every export MUST open with N4L's mandatory `- <chapter title>` declaration before any other content (`- epistemic export`) — omitting this is a fatal parse error in the real N4L compiler, not a stylistic nicety.
- Each entry is emitted as one `@alias "primary text" (relation) target` line, followed by zero or more `"                (relation) "value"` continuation lines (N4L's `"` continuation-mark syntax).
- **Alias derivation**: `n4l_alias(prefix, entry_hash) = "{prefix}_{first 8 bytes of SHA-256(entry_hash.to_string()) as hex}"`. A cross-reference to another entry resolves via `$alias.1` and is only valid if the referenced entry was exported (in the same or an earlier batch) using the *same* prefix — which is exactly why `CritiqueTargetType`/the alias-prefix table below exists: a scale-invariant target's real kind must be known to pick the right prefix, and `to_n4l` (a pure function) has no DHT access to discover it independently.

### 9.2 Alias-prefix table
| Entry type | Prefix |
|---|---|
| `Claim` | `claim` |
| `Critique` | `critique` |
| `Constitution` | `constitution` |
| `Membrane` | `membrane` |
| `CritiqueSpecies` | `critiquespecies` |
| `Evidence` | `evidence` |
| `AntibodyPattern` | `antibodypattern` |
| `WorldlineTrace` | (indexed per-period; see `n4l/arrows-epistemic.sst`'s comma-delimited context-tag syntax, not a loop index baked into the relation name) |
| `Retraction` | (uses `ClaimToRetraction`-style relations, no independent alias prefix table entry) |

### 9.3 Relation vocabulary
`n4l/arrows-epistemic.sst` defines every relation name this export emits, split across N4L's three used semantic-spacetime types (`leadsto` — causal/affecting; `contains` — membership/part-of; `properties` — descriptive), each with its own short code and reciprocal inverse relation, per N4L's own arrow syntax. Relations of particular note for this specification: `critiques`/`is critiqued by`, `flags`/`is flagged by` (the `AntibodyPattern` relation, §2.5), `target type`/`is target type of`, `pattern kind`/`is kind of pattern`, `has dht hash`/`is dht hash of`, `asserted by`/`is the assertion of`. See the file itself for the complete, current list — it is the single source of truth for this vocabulary, not duplicated here in full to avoid the two drifting apart.

### 9.4 Loss recorded as structure
`BridgeRecord`'s `carried_fields`/`dropped_fields` (§2.11) are the normative mechanism for Invariant #7's "the loss must be legible" requirement (§7) — any implementation of the Twitter-bound half of the bridge MUST compute this real set difference at the point it actually builds the outbound excerpt, not report a placeholder or omit it.

## 10. Zome Function Reference

Every function below is a Holochain zome extern (`role_name: "epistemic"`, `zome_name: "epistemic_coordinator"`), callable via `callZome`. Payload/return types reference the structs and enums defined in §2–§3 and this section's own inline definitions. This is a reference, not a tutorial — see `README.md` §6 for build/run instructions and `mobile-ui/src/holochain.ts` or `bridge/src/index.ts` for real, live-verified client code driving several of these end to end.

### 10.1 Claim
| Function | Payload | Returns |
|---|---|---|
| `create_claim` | `Claim` | `ActionHash` |
| `get_claim` | `hash: AnyDhtHash` | `Option<Claim>` |
| `get_claims_by_domain` | `domain: String` | `Vec<Record>` |
| `get_claims_by_agent` | `agent: AgentPubKey` | `Vec<Record>` |

### 10.2 Critique
| Function | Payload | Returns |
|---|---|---|
| `create_critique` | `Critique` | `ActionHash` |
| `get_critiques_for` | `target: AnyDhtHash` | `Vec<Record>` |
| `get_critiques_by_mode` | `mode: CritiqueMode` | `Vec<Record>` |
| `get_synaptic_link_friction_status` | `()` | `SynapticFrictionStatus { recent_count: usize, limit: usize, window_secs: i64, blocked: bool }` |
| `find_synaptic_link` | `FindSynapticLinkPayload { base: AnyDhtHash, target_action: ActionHash }` | `Option<ActionHash>` |
| `reinforce_synaptic_link` | `synaptic_link_action: ActionHash` | `ActionHash` |
| `get_effective_conductance` | `synaptic_link_action: ActionHash` | `f32` — see §8's decay formula in README §2.6 for the exact arithmetic (`2^(-elapsed/half_life)`, 30-day half-life, base + one term per `Reinforcement`) |

### 10.3 Immune System
| Function | Payload | Returns |
|---|---|---|
| `publish_antibody_pattern` | `AntibodyPattern` | `ActionHash` |
| `get_antibody_patterns_for` | `target: AnyDhtHash` | `Vec<Record>` |

### 10.4 Evidence & Grounding
| Function | Payload | Returns |
|---|---|---|
| `create_evidence` | `Evidence` | `ActionHash` |
| `get_evidence` | `hash: AnyDhtHash` | `Option<Evidence>` |
| `get_grounding_path` | `claim: AnyDhtHash` | `GroundingPath { path: Vec<EntryHash>, grounded: bool }` — walks `evidence_hashes` (through cited `Claim`s too) for a path reaching real `Evidence`; never scores or gates, reports where a chain broke down when it does |

### 10.5 Membrane, Constitution, CritiqueSpecies
| Function | Payload | Returns |
|---|---|---|
| `create_membrane` | `Membrane` | `ActionHash` |
| `get_membranes` | — | `Vec<Record>` |
| `join_membrane` | `membrane: AnyDhtHash` | `ActionHash` |
| `get_membrane_members` | `membrane: AnyDhtHash` | `Vec<AgentPubKey>` |
| `get_my_membership_action` | `membrane: AnyDhtHash` | `Option<ActionHash>` |
| `publish_constitution` | `Constitution` | `ActionHash` |
| `get_agent_constitution` | `agent: AgentPubKey` | `Option<Constitution>` |
| `get_all_constitutions` | — | `Vec<Record>` |
| `create_critique_species` | `CritiqueSpecies` | `ActionHash` |
| `get_critique_species` | `hash: AnyDhtHash` | `Option<CritiqueSpecies>` |
| `get_all_critique_species` | — | `Vec<Record>` |
| `get_critique_species_adoption_count` | `species_hash: EntryHash` | `usize` — live count of real `CritiqueToSpecies` links, not a stored field |

### 10.6 Worldline / HRR (worldline binding)
| Function | Payload | Returns |
|---|---|---|
| `generate_worldline_trace` | `TraceGenerationParams { period_granularity_secs: u64, expertise_tags: Vec<String>, expires_at: Option<u64> }` | `ActionHash` |
| `get_agent_worldline_trace` | `agent: AgentPubKey` | `Option<WorldlineTrace>` |
| `query_worldline_resonance` | `WorldlineResonanceQuery { agent: AgentPubKey, domain_tag: String, max_periods: u32 }` | `Vec<PeriodResonance { period_index: u32, similarity: f32 }>` |
| `assert_expertise` | `ExpertiseAssertionPayload { domain: String, worldline_trace_hash: ActionHash }` | `ActionHash` |
| `sample_period` | `boundary: PeriodBoundary` | `Vec<Record>` |
| `verify_trace_checksum` | `trace_hash: AnyDhtHash` | `bool` |
| `get_my_latest_worldline_checkpoint` | `()` | `Option<ActionHash>` |

### 10.7 Neighborhood Binding (HRR)
| Function | Payload | Returns |
|---|---|---|
| `build_neighborhood_binding` | `claim_hash: AnyDhtHash` | `NeighborhoodBinding { claim: AnyDhtHash, corpus_payload: Vec<u8>, binding_key: Vec<u8>, neighbor_kinds: Vec<NeighborKind>, source_hashes: Vec<AnyDhtHash> }` |
| `recall_neighborhood` | `RecallNeighborhoodInput { corpus_payload: Vec<u8>, binding_key: Vec<u8>, candidates: Vec<(AnyDhtHash, NeighborKind)> }` | `Vec<NeighborRecall { source_hash: AnyDhtHash, kind: NeighborKind, similarity: f32 }>` |
| `query_neighborhood_resonance` | `QueryNeighborhoodResonanceInput { claim_hash: AnyDhtHash, candidates: Vec<(AnyDhtHash, NeighborKind)> }` | `Vec<NeighborRecall>` — the one-call collapse of `build_neighborhood_binding` + `recall_neighborhood` |

### 10.8 Attestation
| Function | Payload | Returns |
|---|---|---|
| `grant_attestation` | `GrantAttestationPayload { candidate: AgentPubKey, membrane: AnyDhtHash, my_membership_action: ActionHash }` | `ActionHash` |
| `is_agent_attested` | `IsAgentAttestedPayload { candidate: AgentPubKey, membrane: AnyDhtHash, policy: AttestationPolicy }` | `bool` |

`AttestationPolicy { require_attestation_from: Option<Vec<AgentPubKey>>, min_attestations: usize, max_attestation_depth: Option<u8> }` — see §5.10/§6 and README §2.6 for the full bounded web-of-trust walk semantics (direct-or-transitive, cycle-guarded, capped at 100 visited nodes).

A *graded* companion to this (`get_attestation_weight`/`WeightedAttestationPolicy`, returning a decayed scalar rather than a boolean) was specified here in an earlier revision and has been removed. It returned a number that could differ between two callers passing **identical** inputs, because the traversal read links in unsorted `get_links` order and a shared first-path-wins visit set then decided which paths contributed. That is undeclared nondeterminism, which is a different and worse thing than this section's deliberate caller-scoping: `is_agent_attested` differs between observers because they *chose different roots*, and that difference is exactly what Invariant #1 intends. An implementation adding a graded variant MUST make it deterministic for fixed inputs — sort the traversal and memoize per (node, depth) — or it is not answering a well-defined question.

### 10.9 Discourse Health & Cross-Domain
| Function | Payload | Returns |
|---|---|---|
| `get_discourse_health` | `GetDiscourseHealthPayload { membrane: AnyDhtHash, attestation_policy: Option<AttestationPolicy>, conductance_policy: Option<ConductancePolicy> }` | `DiscourseHealth { domain: String, abstract_to_embodied_ratio: f32, warning: Option<String>, total_claims: u32, total_critiques: u32, critique_mode_distribution: Vec<(CritiqueMode, u32)> }` |
| `get_cross_domain_critiques` | `membrane: AnyDhtHash` | `Vec<CrossDomainCritique { critique_action: ActionHash, critique_author: AgentPubKey, critiquer_home_domains: Vec<String> }>` |

`ConductancePolicy { min_effective_conductance: f32 }` — see §10.2's `get_effective_conductance`.

### 10.10 Mew, Retraction
| Function | Payload | Returns |
|---|---|---|
| `create_mew` | `Mew` | `ActionHash` |
| `get_mew` | `hash: AnyDhtHash` | `Option<Mew>` |
| `get_mews_by_agent` | `agent: AgentPubKey` | `Vec<Record>` |
| `promote_mew_to_claim` | `PromoteMewPayload { mew_hash: EntryHash, domain: String, evidence_hashes: Vec<EntryHash>, confidence: ConfidenceLevel }` | `ActionHash` |
| `create_retraction` | `Retraction` | `ActionHash` |
| `get_retractions_for_claim` | `claim_hash: EntryHash` | `Vec<Record>` |

### 10.11 N4L Export
| Function | Payload | Returns |
|---|---|---|
| `export_to_n4l` | `N4LQuery { domain: Option<String>, author: Option<AgentPubKey>, limit: u32, include_critiques: bool, include_evidence: bool, include_antibody_patterns: bool }` | `String` (real N4L text — see §9) |

### 10.12 Bridge Integration
| Function | Payload | Returns |
|---|---|---|
| `record_twitter_mirror` | `BridgeRecord` | `ActionHash` |
| `get_unbridged_claims` | — | `Vec<UnbridgedRecord { entry_hash: EntryHash, record: Record }>` |
| `get_unbridged_mews` | — | `Vec<UnbridgedRecord>` |
| `import_twitter_reply` | `ExternalCritique` | `ActionHash` |
| `get_twitter_replies_for_claim` | `claim_hash: EntryHash` | `Vec<Record>` |

### 10.13 Signals
Emitted (not called) — `SignalPayload` variants: `NewMew { mew: Mew, entry_hash: EntryHash, action_hash: ActionHash }`, `NewClaim { claim: Claim, entry_hash: EntryHash, action_hash: ActionHash }`, `NewCritique(Critique)`, `NewRetraction(Retraction)`, `NewBridgeRecord(BridgeRecord)`. Consumed by `bridge/src/index.ts` to trigger outbound Twitter posts.

### 10.14 Federation
| Function | Payload | Returns |
|---|---|---|
| `record_federation` | `FederationRecord` | `ActionHash` |
| `get_federation_records_for` | `membrane: AnyDhtHash` | `Vec<Record>` — one-sided: every `FederationRecord` this membrane has itself authored, never anything about whether the remote side has reciprocated |

Two independently-run Holochain networks share no DHT — one cannot query the other's data, so a `FederationRecord` can only ever record what the *local* membrane has declared. Mutual/"federated" status is not a value either network computes or stores; it is derived externally by a bridge process (`federation/federate.mjs`) that connects to both conductors and independently checks both directions — the same correlative-witness shape §2.4/`BridgeRecord` already establishes for the Twitter bridge, applied to a second network instead of a non-Holochain platform. See `federation/README.md` for the verified, live, two-conductor account.

## 11. Versioning & Change Process

This document tracks a specific commit of `main` (noted at the top) — there is currently **no automated check** keeping it in sync with the DNA source as the implementation evolves; it is a manually maintained snapshot, honestly labeled as such rather than implied to be self-updating. A change to any entry type, link type, validation rule, rate limit, invariant, HRR encoding, N4L vocabulary, or zome function signature in `dna/` or `n4l/arrows-epistemic.sst` **SHOULD** be accompanied by a corresponding update to this document in the same change, the same discipline this codebase already applies to keeping `README.md`'s own code-walkthrough sections current with what actually shipped.

Forward-compatibility within the protocol itself is currently handled locally, not globally: `WorldlineTrace.binding_key`/`NeighborhoodBinding.binding_key` (§8) are the only versioned wire values today, each guarding its own narrow scheme. There is no protocol-wide version number, feature-negotiation mechanism, or migration path defined yet — a genuinely breaking change (e.g. a new required field on an existing entry type) would currently just be a new commit with no compatibility story for DHT data written under the old shape. This is a real, open gap, not a hidden one.
