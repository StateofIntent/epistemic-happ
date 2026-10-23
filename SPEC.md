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
| `past_cone` | `Vec<ActionHash>` | **What this author recorded having seen of the SAME target's critiques, at write time.** Optional (`#[serde(default)]`): an omitted field is an empty cone, which honestly records *nothing was recorded* and is NOT a claim that nothing was seen. Added at `protocol_version: 10`. Implements Light Cone Consistency's Detection = Prevention bound — *"a system can tell its order inverted causality only if it retained exactly what would have prevented the inversion"* (arXiv 2605.09114) — so it is retained at write time and never reconstructed. **Validation MUST enforce four rules and MUST NOT claim a fifth.** (1) at most `MAX_PAST_CONE` (256) entries; (2) no duplicates; (3) every member resolves to a valid `Critique`; (4) every member critiques the SAME target; and — load-bearing — (5) **transitive closure**: every member's own `past_cone` MUST be a subset of this one. **What validation CANNOT check is that the author actually saw these**, and no rule can: the field is author-supplied and validation has no view of anybody's screen — the same shape as §5.22's `reveal_deadline`. Over-claiming is therefore possible and harmless; rule 5 is what makes claimed IGNORANCE non-selective, which is the direction that matters |

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
| `required_promises` | `Vec<String>` | MUST be non-empty (§5.8a) — a domain states what it demands of participants rather than charging them to enter |
| `validation_rules_hash` | `Option<EntryHash>` | Not independently validated |
| `creator` | `AgentPubKey` | MUST equal the creating action's author |
| `created_at` | `u64` | |
| `constitution` | `ActionHash` | The creator's own published `Constitution`. MUST resolve to a real `Constitution` entry, and that entry's `agent` MUST equal `creator` (§5.8a). **This was previously specified as populated-but-not-cross-checked**, which was accurate — the rule existed only as a coordinator-side courtesy while a code comment described it as DHT-enforced. It is now genuinely enforced |

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

There is deliberately no stored adoption-count field — see `get_critique_species_adoption_count`, a live query over real links, not a self-declared number (Invariant #1, §7). **That count answers how many critiques, not how many agents, and it includes the proposer's own** — so `get_species_adoption` decomposes the same links by author, which is what READINESS item 11 needed to tell a species others took up from one its proposer uses alone — and `get_species_secretion` decomposes them again by **causal distance**, because "another agent cited it" still does not say whether that agent had ever seen it used.

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
| `author` | `AgentPubKey` | **Added at `protocol_version: 8`.** MUST equal the authoring action's author (§5.2). Filled by `record_twitter_mirror` from `agent_info()` rather than accepted from the caller, so the field states who called. Until version 8 this entry carried no agent at all, which made §5.2 inexpressible for it and, with it, any rule about who may file it into an index — an instrument nobody signs is one nobody is accountable for |
| `mew_hash` | `EntryHash` | MUST resolve to a real entry — the mirrored `Mew` **or `Claim`**; the field name is narrower than its contents and §5.19's two bridge rules re-derive which it is from the DHT rather than from the name or the link type |
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
| `importer` | `AgentPubKey` | **Added at `protocol_version: 8`.** The Holochain agent who imported this; MUST equal the authoring action's author (§5.2), and filled from `agent_info()` by `import_twitter_reply`. **Deliberately not called `author`**: this entry has two different people in it, and `author_handle` below is the other one |
| `twitter_id` | `String` | |
| `author_handle` | `String` | The **Twitter** handle — an unverifiable string from another platform, and the reason `importer` carries the name it does. Binding a rule to this field would be binding to nothing |
| `content` | `String` | MUST be non-empty |
| `linked_holochain_claim` | `EntryHash` | MUST resolve to a real entry |
| `imported_at` | `u64` | |

**Two people in one entry, stated once because conflating them would be worse than omitting the second.** `author_handle` is who wrote the reply on Twitter; `importer` is who chose to bring it into this DHT. Only the second is something this network can hold anyone to, and it is the one §5.19's `ClaimToExternalCritique` rule binds. `check-spec-drift.mjs`'s author-binding gate was extended to recognise `importer` so that choosing the clearer name did not cost the check.

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
| `ClaimToRetraction` | `Claim` (`target_claim`, `EntryHash`) → `Retraction` `ActionHash` | `"retracted"` | **One purpose only as of `protocol_version: 5`.** It carried a second, inverted use until then — see `RetractionToReplacement` below for what was split out and why. Written by `create_retraction`, read by `get_retractions_for_claim`. Validation binds the link to the Retraction's own `target_claim` and author (§5.19) |
| `RetractionToReplacement` | `Retraction` (`ActionHash`) → its `replacement_claim` (`EntryHash`) | `"replacement"` | Split out of `ClaimToRetraction` at `protocol_version: 5`, and **appended at the END of `LinkTypes`** for the position-indexing reason `MembraneRegistry` states below. Written by `create_retraction` when a replacement is named; **read by nothing yet.** The old arrangement asked a reader to tell the two cases apart "from the base's real type" — an instruction validation could not follow, since the two have mutually exclusive rules and one branch cannot enforce both, and a branch dispatching on the `LinkTag` would be enforcing the protocol off a field its own author chooses. See §5.19 |
| `TargetToCritique` | Any of the five `CritiqueTargetType` kinds → `Critique` `ActionHash` | `critique_mode` (debug-formatted) | One link type reused across all five target kinds — Holochain's link model does not care what entry type a link's base is. Validation binds the base to `Critique.target` and the link's author to the critique's (§5.19), which is what makes §5.4's target cross-check load-bearing on what a reader is shown |
| `CritiqueToEvidence` | *(declared, unused)* | — | Declared in `LinkTypes` but not created or read by any current coordinator function |
| `ClaimToEvidence` | *(declared, unused)* | — | Declared in `LinkTypes` but not created or read by any current coordinator function |
| `CritiqueToSpecies` | `CritiqueSpecies` (`EntryHash`) → `Critique` `ActionHash` | `"adopts"` (literal string) | **Name is the inverse of its actual direction** — the base is the species, not the critique; verify against `create_critique`/`get_critique_species_adoption_count` rather than the name alone. The real, query-time basis for adoption counting (§10.6), and bound to `Critique.species` and the critique's author as of `protocol_version: 5` (§5.19) — a count anybody can increment is the self-declared field it replaced, with extra steps |
| `MembraneToClaim` | *(declared, unused)* | — | Declared in `LinkTypes` but not created or read by any current coordinator function. Considered and **rejected** as the by-domain index (`DomainToClaim` below): a `Claim`'s `domain` is free text and a `Membrane` need not exist for it, so a Membrane-keyed index would leave claims in unfounded domains unfindable — the same defect §10.0 describes, reached another way |
| `AgentToMembrane` | `Membrane` (`EntryHash`) → the joining agent's own anchor (not the raw `AgentPubKey` directly — see below) | Raw 36-byte `AgentPubKey` | The real agent identity lives in the tag, cross-checked against it (§5.13); target is an agent anchor, same construction as §4's closing note |
| `AttestationGrant` | `Membrane` (`EntryHash`) → candidate agent (`AgentPubKey`, directly — not an anchor) | The granter's own `my_membership_action` `ActionHash`, raw 36 bytes | See §5.14 — a costed (tenure- and budget-gated) act of vouching; the tag is what tenure validation independently re-fetches and checks |
| `AgentToConstitution` | Agent anchor → `Constitution` `ActionHash` | `"constitution"` | Read by `get_agent_constitution`, which a client renders beside another agent's name — so this index is what makes a promise attributable. Bound to `Constitution.agent` (§5.19) |
| `AgentToWorldlineTrace` | Agent anchor → `WorldlineTrace` `ActionHash` | `"worldline"` | Read by `get_agent_worldline_trace`, which returns a single trace per agent. Bound to `WorldlineTrace.agent` (§5.19) |
| `AgentToClaim` | Agent anchor → `Claim` `ActionHash` | `domain` (raw bytes) | **The by-author index**, read by `get_claims_by_agent` and written by `create_claim`, `assert_expertise` and `promote_mew_to_claim`. The tag is the only domain a by-agent reader has to go on, so validation checks it against the claim's real `domain` as well as binding anchor and author (§5.19) |
| `AgentToMew` | Agent anchor → `Mew` `ActionHash` | `"mew"` | Read by `get_mews_by_agent`. Bound to `Mew.author` (§5.19) |
| `ClaimToBridgeRecord` | `Claim` → `BridgeRecord` | `"bridged"` | |
| `ClaimToExternalCritique` | `Claim` (`linked_holochain_claim`) → `ExternalCritique` | `"twitter"` | |
| `MewToBridgeRecord` | `Mew` → `BridgeRecord` | `"bridged"` | |
| `SpeciesToParent` | **parent** `CritiqueSpecies` → the newly created (child) `CritiqueSpecies` `ActionHash` | `"child"` | **Name is the inverse of its actual direction** — the base is the parent, the target is the new species being created, despite the name reading like "species → its parent." Verify against `create_critique_species` rather than the name alone. Bound to the child's own `parent_species` and `proposer` as of `protocol_version: 6` (§5.19); **read by nothing today**, which is why it was bound before it acquires a reader |
| `SpeciesToCritique` | *(declared, unused)* | — | Declared in `LinkTypes` but not created by any coordinator function (`CritiqueToSpecies` above, base/target as corrected in that row, is the link actually used for this relationship) |
| `TargetToAntibody` | Any of the five `CritiqueTargetType` kinds → `AntibodyPattern` `ActionHash` | `kind` (debug-formatted) | Same one-link-type-for-five-kinds reasoning as `TargetToCritique`, and bound the same way: base against `AntibodyPattern.target`, link author against the pattern's (§5.19) |
| `SynapticLink` | A `Critique`'s target → the critique's own `ActionHash` | 4-byte LE `f32` initial conductance | See §2.13, §5.11 |
| `Reinforcement` | A `SynapticLink`'s own `CreateLink` `ActionHash` → the reinforcing agent | — | See §5.12 |
| `MembraneToFederationRecord` | `Membrane` → `FederationRecord` | `remote_network_label` (raw bytes) | See §2.14, §5.18, §10.14 |
| `DomainToClaim` | Domain anchor → `Claim` `ActionHash` | — (empty) | **The by-domain index.** Anchor is `path_entry_hash()` of `Path::from("domain_{domain}")`. Tag deliberately empty: the domain is already the anchor, so repeating it in the tag would be a second copy validation must keep honest for no reader's benefit. Written by `create_claim` **and by `assert_expertise`**, read by `get_claims_by_domain`. See §10.0. `assert_expertise` builds its `Claim` by hand rather than calling `create_claim`, so it did not inherit this index when the index was added and its assertions were unfindable by anyone but their author — any future function that creates a `Claim` without going through `create_claim` has to write this link itself |
| `TaxonomyToSpecies` | Taxonomy anchor → `CritiqueSpecies` `ActionHash` | — (empty) | **The critique-taxonomy index.** One global anchor, `path_entry_hash()` of `Path::from("critique_species")` — `CritiqueSpecies` has no domain field on purpose, since a species is meant to be adoptable across membranes. Written by `create_critique_species`, read by `get_all_critique_species`. See §10.0 |
| `MembraneRegistry` | Membrane-registry anchor → `Membrane` `ActionHash` | — (empty) | **The membrane registry.** One global anchor, `path_entry_hash()` of `Path::from("membranes")`. Written by `create_membrane`, read by `get_membranes`. Validation enforces the same three properties as `TaxonomyToSpecies`, reading `Membrane.creator` where that reads `CritiqueSpecies.proposer`. **Appended at the END of `LinkTypes` deliberately:** link types are position-indexed, so inserting one above would renumber every type after it and silently reinterpret existing links. `attempt_unaccountable_membrane` does NOT write this link, and that is not the `assert_expertise` omission below — entries that validation refuses cannot be link targets either. See §10.0 |
| `QuestionToPreRegistration` | Question anchor → `PreRegistration` `ActionHash` | — (empty) | Anchor is `path_entry_hash()` of `Path::from("question_{question_action_hash}")`. Written by `pre_register`, read by `get_pre_registrations_for_question`. Bound to the commitment's own `question` and `author` at `protocol_version: 7` (§5.19) |
| `AgentToPreRegistration` | Agent anchor → `PreRegistration` `ActionHash` | — (empty) | **The denominator.** Written by `pre_register`, read by `get_foresight_record` — the index that makes an unrevealed commitment countable without its author surfacing it (§2's pre-registration note). Bound to `PreRegistration.author` at `protocol_version: 7` |
| `PreRegistrationToRevelation` | `PreRegistration` `ActionHash` → `Revelation` `ActionHash` | — (empty) | **What decides whether a commitment counts as revealed.** Written by `reveal_pre_registration`, read by `get_foresight_record`. Bound to the `Revelation`'s own `pre_registration` and `author` at `protocol_version: 7` — see §5.19 for what it cost while unbound |

**These three rows did not exist in this table until `protocol_version: 7`**, while §5.17's prose referred to "the three pre-registration links" as a known category. A link type described in prose and absent from the table that is supposed to enumerate them is the §11 drift this document warns about, committed by this document — and the reason it went unnoticed is that nothing gates §4 the way `check-spec-drift.mjs` gates §10.

"Agent anchor" is `path_entry_hash()` of the `Path` constructed from the string `agent_{agent_pub_key}` — a deterministic per-agent anchor point, not a stored entry of its own.

**A note on the pattern above, stated once rather than per-row**: four link-type *names* in this table (`CritiqueToSpecies`, `SpeciesToParent`, and by convention likely worth re-checking before relying on any other name in this enum) do not describe their actual base→target direction — they describe the *relationship*, and Holochain's `create_link(base, target, ...)` was written with whichever direction was operationally convenient for the query pattern the code needed, not to match the type name. This specification states the verified, actual direction in every row; a future implementer should verify against `create_link`/`get_links` call sites directly rather than infer direction from a link type's name, in this codebase or a reimplementation of it.

## 5. Validation Rules

Validation is enforced by **every validating peer independently** (Holochain's `validate(Op)` callback), not by a coordinator/client convention — this is what makes each MUST below a real protocol requirement rather than the reference implementation's own preference.

### 5.0 Global rule: the DNA must not misdeclare its protocol version
Every `CreateEntry` and `CreateLink` op is refused unless `properties.protocol_version` (§11.2) equals the version the integrity zome implements, and refused with a message naming both numbers. Absent or unparseable properties are refused identically: a DNA declaring no version accepts no protocol data at all.

This cannot catch a peer running a different version — the DNA hash makes that impossible (§11.1) — and is not trying to. It catches the one mistake the hash cannot prevent: a DNA packed with the manifest bumped and the zome not, or the reverse. Deliberately scoped to these two op kinds rather than the whole callback, so that a misdeclaring network still answers `get_protocol_version` and can say what is wrong with it; see §11.2.

### 5.1 Global rule: no deletion, and no entry mutation
Any `RegisterDelete` operation is **rejected outright**; as of `protocol_version: 4` so is every `DeleteLink`; and as of `protocol_version: 9` so is every **app-entry update** — `OpUpdate::Entry` and `OpUpdate::PrivateEntry` on the relation, and `OpEntry::UpdateEntry` on the new entry it stores. All of it applies to every entry type and every link type without exception. See Invariant #6 (§7).

**Agent key updates and capability updates remain permitted**, and the scope is the whole care in that rule — see "not every update" below.

**Invariant #6 is now true rather than nearly true, and that took a network fork.** For versions 1–3 the dispatch had two delete arms that disagreed:

```rust
FlatOp::Delete(_)                       => Invalid("Deletion is not permitted. Entries are immutable.")
FlatOp::Link(OpLink::DeleteLink { .. }) => Valid        // versions 1-3
```

So "nothing is deleted" held for entries and not for links: a `Critique` could not be deleted while the `SynapticLink` carrying its conductance (§5.11) could, as could every link type in §4 and §5.17. Earlier revisions of this section recorded that asymmetry and **deferred** the fix, because any edit to the integrity zome forks the DNA hash (§11.1) and there was no other reason to fork.

**What changed is the cost of forking, not the argument.** A fork orphans every entry already written, with no migration path — Invariant #6 forbids even deleting the old ones. That price is paid by whoever holds data at the moment of the fork, and *before the first user there is nobody to pay it.* Deferring past that point would have meant either carrying the flaw permanently or charging real users for it later. So both deferred changes land here, together, in the commit that forks deliberately while forking is still free:

```rust
FlatOp::Delete(_)                       => Invalid("Deletion is not permitted. Nothing written here \
                                                    is ever removed; entries may still be updated.")
FlatOp::Link(OpLink::DeleteLink { .. }) => Invalid("Link deletion is not permitted. Nothing written \
                                                    here is ever removed.")        // version 4
```

**The refusal message no longer overclaims — and at version 9 the overclaim became true.** "Entries are immutable" was false when it was written and said so to anybody who tripped it: `FlatOp::Update(_)` returned `Valid`, so every update op was accepted for every entry type, and immutability was a property of deletion and not of mutation. Version 4 reworded it to state what was actually enforced. **Version 9 makes the original adjective accurate**, by refusing app-entry updates rather than by editing the sentence — which is the order these two should have happened in, and is recorded that way because the four versions in between are the interesting part.

**`protocol_version` is bumped 3 → 4 in the same commit, in both places.** Refusing an op that was previously accepted changes what the network accepts, which is exactly the condition §11 requires for a bump; `dna/dna.yaml`'s own note says "bump BOTH, or neither", and the integrity zome's `PROTOCOL_VERSION` constant and the manifest property are checked against each other by `validate_protocol_version` — a mismatch refuses every write, so the two cannot drift.

**What the old message got wrong, kept because the error is instructive.** `FlatOp::Update(_)` returns `Valid` — every update op is accepted, for every entry type — so "Entries are immutable" was true of deletion and false of mutation. The stated invariant was always the narrower one (#6, "nothing is deleted"); it was *the adjective in the message* that overreached, in a document whose §11 warns that a name-level check cited as "the spec is verified" would be an overclaim. It is reworded as of version 4. Note that **updates are still accepted** — the fork narrowed the message and closed the link-delete gap, and did not make entries immutable.

**What actually keeps entries unmutated today is the absence of an update path, which is a weaker guarantee than it looks.** No coordinator extern calls `update_entry`, so no client can author an update through the shipped API. But §11.1's own table records that a coordinator-zome edit leaves the DNA hash **unchanged** and is hot-swappable via `update_coordinators` — so a peer running a modified coordinator stays on this network and can author update ops that every node's validation will accept. The integrity zome is the only part the hash covers, and therefore the only place a guarantee can live.

**THE UPDATE GAP IS CLOSED AT `protocol_version: 9`, AND IT WAS A DECISION RATHER THAN A FIX.** The paragraph that stood here for four versions said the gap was "latent rather than a live defect" because "nothing reads update chains", and deferred the question on the grounds that refusing updates "would change what the network accepts for every entry type, which is a far larger decision than closing a link-delete hole, and no evidence has been offered that it should be made". The evidence was offered by a security review of the validation path, and the deferral's own reasoning turned out to be measuring the wrong thing.

**What it was measuring, and what it missed.** "Nothing reads update chains" was true of the *relation* and false of the *entry*. An Update stores its new entry, which reaches validation as `OpEntry::UpdateEntry` — a variant `validate_create_entry` never matched, so it fell through that function's catch-all and **no entry validator ran on it at all**. The body is then addressable by its own `EntryHash` through `get_claim`, `get_evidence` and `must_get_entry`, none of which touches an update chain. So the capability was not "stored and surfaced by no reader": it was an unvalidated write of any entry type, with any content and any claimed author, readable by hash.

**Four things decided it, and the third is what settles it.**

1. **Nothing reads update chains** — re-measured at version 9 across the coordinator, the UI, the SDK and the MCP server: zero `get_details`, zero `Details::`, zero `.updates`. Refusing updates breaks no feature because no feature uses them.
2. **No extern calls `update_entry`**, so no client could author one through the shipped API. The capability was reachable only by a peer running a modified coordinator — which §11.1 confirms stays on this network — so it was available only to the party it should have been guarded against.
3. **A validated update would still be invisible — now demonstrated rather than argued.** Injection run `38124164735` reverted this refusal and the harness's own read-side check on the updated claim **stayed green while the forged update was accepted**: `get_claim` on the original entry hash returns the original either way, because `update_entry` writes a new entry plus a relation and leaves the original untouched. So no client-surface read can see an accepted app-entry update at all, and the refusal's only observable is the refusal itself. That is why "validate updates properly" is not the better option it appears to be. Every index, link, critique and conductance in this protocol is anchored on the **original** entry's hash. An update creates a new entry plus a `RegisterUpdate` relation; links keep pointing at the original, and `get()` on its hash keeps returning it. Only a reader walking update chains would see the new content, and nothing walks them. Validating updates would therefore permit a capability no reader can observe — checked, stored, and unreachable — which is worse than either refusing it or building it properly.
4. **It is in tension with this protocol's own remedies.** §7's account of Invariant 6 is that erasure is structurally impossible and the remedies are **additive**: a `Retraction` by the author, an `AntibodyPattern` by anyone, each leaving the original readable with the objection attached. Mutation is the non-additive remedy. If a `Claim` could be edited, "the record" becomes "the current version of the record", and a critique could be answered by editing the thing critiqued rather than by replying to it — against Invariant #3, that every claim carries its own history.

**If mutation is ever wanted, it arrives as a feature with a design**: an explicit additive mechanism with a reader — a revision entry type and a link, validated like everything else — rather than as a latent capability nobody can see. That is the form in which this question should be reopened.

**NOT EVERY UPDATE, and this is where the refusal could have gone badly wrong.** `FlatOp::Update` covers `Agent`, `CapClaim` and `CapGrant` as well as `Entry` and `PrivateEntry`. A capability grant is itself a source-chain write, so a blanket refusal makes `authorizeSigningCredentials` fail and leaves a network **nothing can call** — the exact failure §5.0's version gate already hit and recorded, which is why that gate is scoped to two op kinds rather than applied to the whole callback. The same scoping applies here: refuse the protocol's own entries, leave the conductor's plumbing alone. Whether agent key rotation *should* be permitted is a separate question and is not decided by this change.

**Watched being refused.** `attempt_entry_update` (§10) is the negative-path prober — needed precisely because no extern called `update_entry`, so the capability was unreachable from the tree and therefore untestable from it — and `scripts/live-verify/attachment-links.mjs` §2b attempts a Claim update **with a forged author**, which is what the gap bought, and requires DHT validation to refuse it. Its control is the scoped half: signing credentials and zome calls still work afterwards. That control proves cap-grant issuance survives; it does **not** exercise `OpUpdate::CapGrant` itself, since nothing in the harness can force a grant to be updated rather than created, and the harness says so rather than letting a passing control imply more than it tests.

**The reasoning that deferred this for three versions is left on the record, because it was correct and the conclusion still changed.** Rewording a string satisfies neither condition §11 sets for a protocol bump and forks the network anyway, producing two hashes both claiming `protocol_version: 3` — precisely the "mystery hash" `dna/dna.yaml` says the version field exists to prevent. All of that held. What it missed is that the fork was going to happen eventually and would only ever get more expensive: the argument for waiting had no stopping condition, and "wait for a real reason" quietly meant "wait until users are holding data". Version 4 forks on purpose, bumps the number so the fork is legible, and pays the cost while it is zero.

**This note was going to live as a comment beside that arm, and it cannot: a COMMENT in the integrity zome changes the DNA hash too.** `wasm_error!` expands to a struct carrying `::core::line!()`, and this zome uses it 23 times — so every line-shifting edit rewrites baked-in line constants, changes the wasm, and forks the network. Comments included. Measured rather than reasoned about, after the opposite was assumed:

| step | DNA hash |
|---|---|
| baseline, rebuilt and repacked unchanged | `uhC0keFcP2UoOwpAWpSNZp4gHfxalbVrV_aBQ8Fmi8U8b72kSp68Y` |
| a ~30-line explanatory comment added | `uhC0k7eeaHx0BviHHpQDAHhxFViDcsvSayKVS52U8VTP-PMQHHeIR` |
| comment reverted, rebuilt, repacked | `uhC0keFcP2UoOwpAWpSNZp4gHfxalbVrV_aBQ8Fmi8U8b72kSp68Y` |

The first row is the control that makes the comparison mean anything — the build is deterministic, and the repacked bundle is byte-identical to the committed one. **So the integrity zome cannot be annotated for free, and this document is where its caveats have to live.** That is a sharper constraint than §11.1's table states, and it applies to anyone who was about to add a clarifying comment there.

### 5.2 Author binding
For every entry type carrying an `author`/`agent`/`creator`/`proposer` field, that field MUST equal the actual authoring action's real author. This is checked independently by every validator (listed per-type in §2) — never trusted from the entry's own claimed value alone.

### 5.3 Referential integrity
Every field typed as an `EntryHash` reference to another entry (`evidence_hashes`, `source_mew`, `linked_claim`, `target_claim`, `replacement_claim`, `parent_species`, `mew_hash`, `linked_holochain_claim`) MUST resolve to a real, existing entry at validation time, except where noted otherwise in §2.

**`Critique.evidence_hashes` is the one remaining exception** — populated but not independently cross-checked, while `Claim.evidence_hashes` is. **That asymmetry is correct, and the reason is worth stating so it is not repeatedly re-flagged as an oversight.**

The check on `Claim` exists to keep a *traversal* well-formed, not to police honesty: `get_grounding_path` recurses through a claim's `evidence_hashes`, so a hash that resolves to nothing would be a dead end mid-walk. It is deliberately weak in exactly the way that purpose implies — it requires the hash to resolve to *some* entry, not to an `Evidence` entry, precisely so a claim may cite another claim and grounding can keep walking back.

Nothing traverses `Critique.evidence_hashes`. Grounding never enters a critique; the field is read only by N4L export and by clients that display it. So a dangling hash there produces a dangling reference in an export and nothing else — no protocol decision rests on it.

Tightening it would also cost something real. `must_get_entry` is a deterministic dependency fetch, so validation *defers* until the dependency is available. Requiring one per cited hash would gate validation of this protocol's most frequent act on the propagation of everything it cites, in exchange for no protection. A conforming implementation SHOULD leave it unchecked for the same reason.

**WHERE THE ENFORCEMENT ACTUALLY LIVES, AND WHY THIS NOTE IS HERE RATHER THAN IN THE ZOME.** Each checked field sits under a `must_get_entry` / `must_get_action` guard whose failure arm returns `Invalid("… not found.")`. **That arm is never taken.** A deterministic dependency fetch against an absent dependency does not hand the validator an error; it abandons the callback with unresolved dependencies, and the conductor refuses the commit itself with `DepMissingFromDht` — "could not be completed but may be retried". The rule in this section holds exactly as stated; it is enforced by the host, not by the nine strings that look like the enforcement.

Measured against `protocol_version: 9`, a `Claim` citing a well-formed but nonexistent `EntryHash`: the call **throws in 0.1s**, and `get_claims_by_domain` returns **zero** — the write is stopped immediately and visibly, not left pending. `scripts/validation-corpus/replay.mjs` asserts this stall for all nine, and asserts the rule's own message does **not** appear, so a build in which it did would fail loudly rather than pass quietly.

This caveat cannot be written beside those arms: per §5.1, **a comment in the integrity zome changes the DNA hash** — `wasm_error!` expands to `::core::line!()` and this zome uses it 23 times, so any line-shifting edit forks the network. §5.1 is explicit that this document is where such caveats have to live, and this is one.

**THE LIVE-NETWORK CONSEQUENCE IS NOT COSMETIC.** The measurement above had the dependency genuinely absent. On a real network it will frequently be **present on a peer but not yet local**, and the refusal is identical: a *legitimate* `Claim` citing evidence a collaborator published minutes ago cannot be committed until that evidence propagates. This is precisely the cost the paragraph above names — gating this protocol's most frequent act on the propagation of everything it cites — and `Claim.evidence_hashes` accepts it deliberately, to keep `get_grounding_path` well-formed. With propagation measured at 415s, 424.9s, 425.9s, 929.1s and 943.0s (READINESS.md §3), the author is blocked for **7–16 minutes** and told only that the commit "may be retried", against a raw hash. **A conforming client SHOULD absorb this**, and the reference SDK now does: `agent-sdk` retries the write for `dependencyWaitMs` (default 1,200,000ms, chosen to exceed the slowest recorded crossing) behind an `onPendingDependency` callback, and gives up with a typed `PendingDependencyError` stating that the payload is still valid rather than rejected. **A client MUST NOT apply such a retry to a write carrying its own deadline** — a `Revelation` is refused once the action's timestamp passes the `PreRegistration`'s `reveal_deadline`, so retrying one across a propagation window converts a transient stall into a permanent and correct rejection, spending a sealed commitment that cannot be remade. Decided and recorded in README.md §9. None of this is a defect in this section.

**THE TWENTY-MINUTE DEFAULT IS A CLOSURE DIAL WITH A GUESSED VALUE, and naming it that way is both more honest and more useful than calling it a timeout.** In an observer-centric consistency model the question is not *how long should a client wait* but *what must this observer have seen before it may act* — closure — and a cited hash that has not arrived is not a slow write, it is a write whose evidence is outside the observer's past cone. `dependencyWaitMs` currently answers that by exceeding the slowest crossing anybody has recorded, which is a defensible number and still a guess, and it degrades in the one way a guess does: a client cannot distinguish "waiting, three of four citations already resolve locally" from "waiting, none of them do." A conforming client MAY therefore expose **closure state** alongside or instead of the timer, reporting how many of a claim's `evidence_hashes` resolve locally.

**CORRECTED 2026-10-19, and the correction is the reason closure needed a function of its own.** This section said the reference SDK's `onPendingDependency` callback "already carries enough to do it", and READINESS item 12 repeated it. **It does not, because the refusal names exactly ONE hash however many are missing.** Measured against a sandbox conductor: a `Claim` citing two unresolvable hashes, then three, then three with a resolvable one placed first and then last, each produced `DepMissingFromDht([AnyDhtHash(..)])` carrying a single element. The cause is in this specification's own mechanism — the validator loops `must_get_entry` over `evidence_hashes` and the host abandons the callback at the **first** unresolved dependency, so the refusal is a report about one hash and never a set. A client subtracting it from what it cited would report "3 of 4 resolve" for a claim where none of the other three do, which is worse than no indicator. **Closure is therefore asked for directly: `which_entries_resolve_locally` (§10) answers per hash, type-agnostically and from local databases only**, and the reference SDK exposes it both as `closureOf(hashes)` before a write and on `onPendingDependency`'s `closure` while one is stalled. **This is also the second of the two options the open propagation item asks for.** README.md §9's "Before mass adoption" table says that item needs *"a decision rather than a fix: state a bound a user can rely on, or surface 'not yet propagated' in the UI"* — surfacing closure is that second option, stated precisely enough to build, and it does not require this protocol to promise a propagation bound its substrate does not offer.

`Membrane.constitution` was previously the second exception and is now cross-checked, both that it resolves and that it belongs to the creator — see §5.8a.

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

### 5.8a `Membrane` creation — the accountability rule

- `required_promises` MUST be non-empty.
- `constitution` MUST resolve to a real `Constitution` entry (via `must_get_valid_record`, a deterministic dependency fetch, so every validating peer resolves the same entry or defers rather than disagreeing).
- That `Constitution`'s own `agent` MUST equal the `Membrane`'s `creator` — a founder is accountable under promises they made themselves.

Together these are the "accountable rather than costly" mechanism: founding a domain has no fee, stake or token, and instead requires a published commitment of one's own plus a stated condition of entry for others.

**Recorded because the gap is instructive:** none of the above was enforced at the DHT layer until recently. All three checks lived only in the coordinator's `create_membrane`, whose comment described itself as *"mirroring validate_membrane's DHT-enforced rule (the real enforcement layer, unbypassable by a custom client)"* — while `validate_membrane` checked only author-matching and a non-empty domain. A client bypassing the coordinator could found a domain demanding nothing, citing a constitution hash pointing at anything. A conforming implementation MUST enforce these in validation, not in a client-facing function.

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

**Historical note, because a burn-to-extend tier was specified here in an earlier revision and an implementer may have built it.** That tier made creation free below 20, purchasable up to a ceiling of 30 against `CreditBurn`s tagged `"burn_friction"`, and refused at 30. It was removed after live verification showed no honest client could reach it — `create_critique` is the only way to create a `SynapticLink`, `Critique` creation carries its own hard 20-per-hour cap (§5.15) with no burn tier, and that cap is checked first, so the paid tier opened at exactly the count where creating another `Critique` had already become impossible. It also *weakened* the limit for the one client that could reach it (one authoring `CreateLink` actions directly), granting ten extra links for burns that nothing funded, since no balance check was ever implemented. (An earlier revision of this note asserted that a balance is *not checkable* on an agent-centric DHT. That was overstated: the removed design countersigned every transfer onto both parties' chains, making a balance a chain-local fold of the same shape as the limits in this section. What was missing was a bound on that fold, not the possibility of one. An implementation wanting enforced balances should carry a running total per balance-affecting entry and validate it inductively, and should note that fork-based double-spend remains preventable only with global consensus — an exposure the limits in §6 already share.)

The mutual-credit ledger that tier was the only consumer of (`MutualCreditTransfer`, `CreditBurn`, `get_credit_balance`, and the countersigning flow around them) was subsequently removed from this protocol entirely. **Throughput here is not purchasable by any mechanism, and a conforming implementation MUST NOT make it so.**

A successor was considered and rejected: non-transferable regenerating capacity, a single per-agent budget spent at differing rates by differing acts. It would have been verifiable from an agent's own chain and free of any leaderboard surface, but it was not built, because unifying the budgets introduces **substitutability** — an agent's unspent allowance for one act becomes extra allowance for another. The limits in §6 are not rationing a shared resource; each bounds a distinct flooding surface at its own threshold. Under one budget the effective bound on any single act becomes its own limit plus whatever the agent declined to spend elsewhere, which weakens every limit simultaneously. Separate per-act caps are the correct shape, and are what this specification requires.

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
Every link type not named in §5.11–§5.14 or §5.19 has no dedicated `validate_create_link` branch and is accepted unconditionally at the link-creation layer — whatever constraints apply come from the entry-level validation of what the link connects.

**This section used to name `TargetToCritique` and `TargetToAntibody` among them, and the pairing it offered as reassurance was the defect.** It said their "real constraint is `Critique`'s own validation (§5.4/§5.15)" — true of the entry and silent about the attachment, which is the half a reader sees. §5.19 records what that cost and closes it for thirteen link types. **What remains unconditional after §5.19 is four link types, and nothing writes any of them**: `CritiqueToEvidence`, `ClaimToEvidence`, `MembraneToClaim`, `SpeciesToCritique`. A link type nothing creates cannot be forged, and each acquires a rule with its first writer — which is now a rule of this specification rather than an aspiration, since every link type that *is* written is bound.

**An earlier revision of this list named `CritiqueToSpecies` and the three per-agent-anchor links as the obvious next pass, and that pass happened in the same fork** — nine link types are bound in §5.19, not five. What is left here divides into three honest categories rather than one: the four unused types above; the five bridge and promotion links, whose base and target are both bridge-owned records (`bridge/` is a trusted service holding its own keys, which is an argument for a rule rather than against one, and it has not been made yet); and the three pre-registration links. **Every candidate this list has ever named has since been taken** — `SpeciesToParent` at `protocol_version: 6`, the pre-registration three at `7`, the bridge and promotion five at `8` — which is what the list was for.

**And the argument this section said the bridge five were waiting on turned out to be answerable, after it had been recorded here as a reason to wait.** The claim was that a rule "would have to say what a `BridgeRecord`'s base may be, and that is a question about the Twitter surface rather than about link validation". It is not: `record_twitter_mirror` already bases the link on `BridgeRecord.mew_hash`, so the base rule was sitting in the entry the whole time, and the only genuinely missing piece was an author — which was a missing FIELD, not a missing argument. Recorded at this length because a deferral with a plausible reason attached is the hardest kind to re-examine, and this one survived two passes over this section before anybody checked whether the reason was true.

### 5.18 `FederationRecord` creation
In addition to the non-empty `remote_network_label`/`remote_membrane_ref` requirements (§2.14): `local_membrane` MUST resolve to a real `Membrane` entry, and the creating agent MUST equal that `Membrane`'s own `creator` field — only a membrane's own founder may declare federation on its behalf, the same governance principle that already gates who can found the membrane at all (§5's `Membrane` author-binding rule, §5.2). No SWO temporal friction — see §10.14 for why.

### 5.19 Attachment and index links — base/target binding
As of `protocol_version: 5`, a tenth at `6`, three more at `7` and five more at `8` — **eighteen** link types MUST bind the link to the entry it points at. That is **every link type anything writes**; what remains unconditional (§5.17) is four types nothing creates. Each rule has the same two parts: the link's base MUST be the node the target entry itself names as its subject, and the link's author MUST equal that entry's own author (§5.2).

| Link type | Base MUST equal | Author MUST equal | Also |
|---|---|---|---|
| `ClaimToRetraction` | `Retraction.target_claim` | `Retraction.author` | — |
| `RetractionToReplacement` | *(base is the Retraction)* — target MUST equal `Retraction.replacement_claim`, and a Retraction naming none has no valid link of this type | `Retraction.author` | — |
| `TargetToCritique` | `Critique.target` | `Critique.author` | No separate friction budget: one link per `Critique`, and §5.15 already caps the entry |
| `TargetToAntibody` | `AntibodyPattern.target` | `AntibodyPattern.author` | — |
| `AgentToClaim` | `path_entry_hash()` of `Path::from("agent_{claim.author}")` | `Claim.author` | Tag MUST equal `Claim.domain` as raw bytes |
| `CritiqueToSpecies` | `Critique.species`, which MUST be `Some` — a link cannot record an adoption the critique does not declare | `Critique.author` | Base is the **species**; the name reads the other way (§4) |
| `AgentToConstitution` | `path_entry_hash()` of `Path::from("agent_{constitution.agent}")` | `Constitution.agent` | — |
| `AgentToWorldlineTrace` | the same anchor over `WorldlineTrace.agent` | `WorldlineTrace.agent` | — |
| `AgentToMew` | the same anchor over `Mew.author` | `Mew.author` | — |
| `SpeciesToParent` | the child's `parent_species`, which MUST be `Some` | `CritiqueSpecies.proposer` (the child's) | Base is the **parent**; the name reads the other way (§4). Added at `protocol_version: 6` |
| `PreRegistrationToRevelation` | `Revelation.pre_registration` | `Revelation.author` | Added at `protocol_version: 7`. See the denominator note below |
| `AgentToPreRegistration` | the agent anchor over `PreRegistration.author` | `PreRegistration.author` | Added at `protocol_version: 7` |
| `QuestionToPreRegistration` | `path_entry_hash()` of `Path::from("question_{pr.question}")` | `PreRegistration.author` | Added at `protocol_version: 7` |
| `MewToClaim` | `Claim.source_mew`, which MUST be `Some` | `Claim.author` | Added at `8`. Read by nothing |
| `MembraneToFederationRecord` | `FederationRecord.local_membrane` | `FederationRecord.author` | Added at `8`. §5.18 already requires that author to be the membrane's founder |
| `MewToBridgeRecord` | `BridgeRecord.mew_hash`, **and the base MUST resolve to a `Mew`** | `BridgeRecord.author` | Added at `8` |
| `ClaimToBridgeRecord` | `BridgeRecord.mew_hash`, **and the base MUST resolve to a `Claim`** | `BridgeRecord.author` | Added at `8` |
| `ClaimToExternalCritique` | `ExternalCritique.linked_holochain_claim` | `ExternalCritique.importer` — **not** `author_handle` (§2.12) | Added at `8` |

**The two bridge rules are one rule plus a type discrimination, and the discrimination is not decoration.** `record_twitter_mirror` bases both on `BridgeRecord.mew_hash` and picks the link type from what that hash actually resolves to, so the base comparison is identical and the only difference is which kind of entry the base must be. Validation **re-derives** that from the DHT rather than trusting the link type — the same shape as §5.4's `Critique.target_type` cross-check, and for the same reason: a caller must not be able to say what kind of thing its subject is. Without it, a mirror of a `Mew` filed as a claim's would make `get_unbridged_claims` report a claim as bridged on the strength of a record about something else.

**Three of these five had no author rule until the entry types changed, which is why the entry types changed.** `BridgeRecord` and `ExternalCritique` carried no `AgentPubKey` at all for seven protocol versions, so §5.2 was inexpressible for them and nothing could be said about who may file their links. The fields were added at `protocol_version: 8` (§2.11, §2.12) rather than leaving three rules permanently half-stated. The alternative — binding the base and leaving the filer unconstrained — would have been a rule that prevents misattribution while letting anyone write the index entry, and recording that as "bound" would have overclaimed.

**The denominator, and this is the one of the thirteen that emptied a feature rather than misattributing a record.** §2's pre-registration note states the attack the design exists to refuse: *"Commit ten predictions, reveal the two that came true, stay silent on the eight that did not: every reveal verifies, and the track record is a fabrication wearing a cryptographic proof."* The answer was to make the denominator structural — an unrevealed commitment expires **visibly**, because its deadline and its question are public from the moment it is made.

**`validate_revelation` is airtight about the `Revelation` entry** (§5): the author must be the committer, the content must hash to the sealed commitment, and a late reveal is refused. All of it concerns one `Revelation` and the `PreRegistration` *it names*. **What decides whether a commitment counts as revealed is the link**, and `get_foresight_record` treated any `Revelation` reachable from a `PreRegistration` as that commitment's reveal.

So: commit twice, reveal the first honestly, let the second lapse, then hang the first reveal off the second commitment. Both entries are valid, the signature is real, the commitment hash checks out — and an expired commitment is reported as revealed, carrying the other prediction's text. **No victim is required**: the laundering is of the author's own record, which is exactly the fabrication §2 says this primitive was withheld to avoid. The reveal path was closed and the accounting path was open.

**The reader is fixed too, and the distinction matters.** `get_foresight_record` now requires `rv.pre_registration` to equal the commitment it is being read under. That is a courtesy, not the enforcement — §5.19's link rule is the layer a custom client cannot skip, and §5.21 records the general principle — but a reader that counts any reachable `Revelation` as this commitment's reveal is wrong on its own terms, and it was the half of the defect that turned a forged link into a laundered record.

**No tag rule on the last three, and that is a decision rather than an omission.** Their tags are fixed literals (`"constitution"`, `"worldline"`, `"mew"`) that no reader consults — these links are read by base and type alone. Pinning a literal in validation would add a byte-for-byte duplication contract across the two crates, for no reader's benefit, and would refuse every link on the network the first time somebody renamed a tag nothing reads. `AgentToClaim`'s tag IS checked, because a by-agent reader has nothing else to go on for a claim's domain. The three share an anchor helper; `AgentToClaim` keeps its checks inline for exactly that difference, since folding three-of-four into a helper while the fourth reads differently is how a near-miss gets built on purpose.

**`CritiqueToSpecies` is the one with a number behind it.** `get_critique_species_adoption_count` counts these links, and §10.6 describes counting links as "the real, query-time basis" replacing "the old self-declared, unenforced `adoption_count` field". That replacement was half-finished: the field was removed from the entry and nothing stopped an agent writing the links directly, so **a count anybody could increment was the self-declared field with extra steps.** Invariant #1 (§7) is why the distinction is load-bearing rather than tidy — a per-species adoption count is permissible precisely because it is a number stating a fact rather than a position, and a fact anybody can write is not one.

**Why these nine, and why in one commit.** Five were the review's findings; the other four were named in the same pass as the same shape, and a fork that is already happening is the cheapest moment to bind them — a second fork for four rules nobody had yet exploited would cost the same as this one and buy less. The three index links (§5.11–§5.14's neighbours: `DomainToClaim`, `TaxonomyToSpecies`, `MembraneRegistry`) were already bound this way, and `DomainToClaim`'s own rule states the general principle: an index is only worth reading if a false entry cannot be written into it. That principle was enforced for the links answering *what exists* and for none of the links answering *what is true of this node* — the ones a claim's own screen traverses to decide what to display about it. Entry validation was thorough on all four entry types involved; nothing checked the link against the entry, so an agent could author a valid entry about their own claim and file it against anybody's. **The displayed attribution came from the entry; the choice of what it was displayed on came from the link.**

**What each one cost while open, stated concretely because "unconditional" understated all five.**

- **`ClaimToRetraction`** was the sharpest. §2.3 and the `Retraction` validator both require a retraction to come from the claim's own author — that check exists so a client can say "Retracted by its author" and mean it, and `mobile-ui` says exactly that, with a comment calling it "guaranteed rather than asserted". It was reachable around: author a Retraction of your *own* claim (valid), link it from somebody else's, and `get_retractions_for_claim` hands it to every reader of the victim's claim. The guarantee held for the entry; the false statement was produced by the link. This is the harm Invariant #2 (§7) exists to prevent, arriving one layer down from where it was guarded.
- **`TargetToAntibody`** rendered `flagged by <author>` for an author who never flagged that claim — one legitimately-signed pattern, relinked onto any number of other nodes. No forged signature anywhere: the signature is real, and the lie is which node it was filed against.
- **`TargetToCritique`** returned critiques that never named a claim as that claim's own critique list, and — less visibly — `get_discourse_health` (§10) *counts these links per claim*, so a membrane's reported discourse health was writable without authoring a single critique. The per-hour critique cap (§5.15, §6) bounds entries; this attack creates only links. **A budget on the generative act does not bound an attachment nobody validated.**
- **`AgentToClaim`** let anyone write into any agent's by-author index. The argument against that was already written one row up in §4, about the by-*domain* index: a third party filing someone else's claim into an index is "unbounded by that claim's author's own friction budget, which would make the index a flooding surface answerable to nobody". The two links are created four lines apart in `create_claim` and only one of them was enforced.
- **`RetractionToReplacement`** is read by nothing today, which is the reason to bind it now rather than later: an unvalidated link type acquires its first reader long after the commit that could have constrained it, and that reader cannot tell the difference.

**Why it went unseen, recorded because the pattern generalises.** The three bound link types are exactly the three with adversarial prober externs (`attempt_false_domain_index`, `attempt_false_membrane_registry`, `attempt_unaccountable_membrane`, §10). **The same reasoning closed TEN ENTRY rules on 2026-10-21, and took `needs_extern` and `needs_prober` both to zero** — every rule reachable from JavaScript now has a case or a stated gap. It began with eight: — `validate_worldline_trace`, `validate_pre_registration` and `validate_revelation` had rules about fields their externs DERIVE, so nothing could reach them and nothing had tested them; `attempt_raw_worldline_trace`, `attempt_raw_pre_registration` and `attempt_raw_revelation` make the refusals observable, and the corpus asserts all eight (READINESS 5g). The link types nobody probed are the link types nobody validated, and coverage looked complete because every link type anybody had *tried* to forge was refused. **A prober proves the rule it probes and silently flatters the rules it does not.**

**`must_get_*` errors in these branches are propagated, not mapped.** A missing dependency inside validation is how the conductor is told to hold an op and retry once the target arrives. The three older index branches convert that into a guest error (`map_err(|_| ...)`), discarding the retry signal — a link whose target has simply not gossiped yet is not an invalid link. The nine branches here propagate with `?` instead. The older three are deliberately left as they are: changing them is a separate argument about those three, not part of closing these nine.

**`protocol_version` is bumped 4 → 5 in the same commit, in both places.** Refusing ops that were previously accepted is exactly the condition §11 sets for a bump, and the link-type split changes `LinkTypes` itself. **`SpeciesToParent`'s rule arrived one fork later at 5 → 6, and the three pre-registration rules at 6 → 7**, and the honest reason it was not in the first nine is that §5.17 had it in the "next pass" list rather than in the review's findings — it was named as the same shape and then taken, which is what that list is for. The cost of the second fork is the same as the first and still zero, since nobody holds data; a third would be too, and that is the argument §5.1 already makes for paying this price while it is free rather than after a release. Note that this fork was unavoidable even for the comments: §5.1's measured table shows a comment-only edit to the integrity zome changes the DNA hash, because `wasm_error!` bakes in `::core::line!()`.

**Confirmed on a real conductor, and one thing is still not claimed.** `scripts/live-verify/attachment-links.mjs` drives `attempt_false_attachment_link` (§10) against two agents on a live conductor and was green on its first execution anywhere — run `38110651478`, 2026-10-11, **all 35 checks** in 22 seconds: 8 honest reads, 12 refusals each paired with an assertion that the refusal came from DHT validation rather than a coordinator guard, and 3 reads afterwards proving nothing was poisoned on the way through.

**Part 1 of that harness is the result worth stating separately.** Four of these nine rules compare a link's base against an agent anchor derived independently in `dna/integrity` and `dna/coordinator`, which share no library — the same byte-for-byte duplication contract the domain, taxonomy and registry anchors already carry. Had those two derivations disagreed, every honest by-author link on the network would be refused **and all twelve forgery checks would still have passed**. A rule that refuses everything satisfies any test that only looks for refusals, which is why the positive reads sit in front of them. The derivations agreed at the first attempt.

**And watched failing on its own rule, which is what makes the green run mean anything.** Run `38111598258`, commit `3f90244` on a throwaway ref: the `retraction.target_claim != declared_claim` comparison deleted from the `ClaimToRetraction` branch, nothing else touched. **2 checks failed of 34** — the probe written for that rule, and, independently, the part-3 read asserting claim B carries no retraction. The prediction was recorded in the injection commit before the run, so a wrong one would have been visible rather than retrofitted.

Three things that result establishes which the green run did not. **The probe tests its own rule**: one rule reverted, one probe red. **The count drops 35 → 34**, because the harness's `expectRefusal` emits a single FAIL on its success path and never reaches the paired validation-source assertion — so a forgeable link produces one red line, not two. **The read-side check earned its place**: part 3 went red without being aimed at the injection, because the forged link succeeded and `get_retractions_for_claim` then answered with it, so the defect was caught twice rather than once.

**And the control held.** "A third party cannot file somebody else's retraction at all" stayed green throughout, because the author binding below the reverted comparison still refuses agent 2 filing agent 1's retraction. The two parts of the `ClaimToRetraction` rule are therefore independently tested rather than jointly asserted — which is the near-miss §5.19's own helper note warns about, demonstrated instead of argued.


**A SECOND INJECTION TOOK FOUR FAMILIES AT ONCE: 7 reds of 66, exactly the seven predicted before the run.** Run `38124164735` reverted four rules chosen from families the first injection left untested — the shared per-agent anchor helper, `AgentToClaim`'s tag rule, the Claim/Mew discrimination on the two bridge links, and §5.1's update refusal. The helper fanned out to **four** probes (constitution, worldline, mew, foresight commitment); the other three reverts produced one each.

**Two controls held, which is what makes four-at-once isolation rather than a smear.** "A claim cannot be indexed under another agent's by-author anchor" stayed green while the shared helper was gutted, because `AgentToClaim`'s anchor check is **inline** — so the helper/inline split this section kept on purpose is measured rather than asserted. And the bridge **base**-rule probe stayed green while the discrimination was removed, so the two halves of that rule are separable.

**A predicted false green was confirmed**, and it is recorded in §5.1 because it bears on that decision rather than on these rules: the harness's read-side check on an updated claim passed while a forged update was accepted, which establishes that no client-surface read can observe an accepted app-entry update.

**TWO MORE INJECTIONS CLOSED THE BASE-RULE GAP AND MEASURED A HARNESS ONE.** Run `38124976517` reverted **all seventeen author bindings** of these eighteen rules and produced **three** reds — because only three probes isolate an author binding, the ones where the base is correct and the filer is a third party. **Fourteen of the seventeen author bindings are reached by no probe at all**: every other probe is refused by a base or anchor rule first, so the author check behind it never does the work. That is a gap in the harness rather than in the rules, and the fix is new probes rather than another injection.

Run `38125081165` reverted **the thirteen remaining base comparisons** — every one except `ClaimToRetraction`'s, already covered — and produced **16 reds of 60**. All thirteen probe reds landed, and three of §2b's poisoning checks went red for the first time, proving they detect poisoning rather than merely asserting it. Eight controls held, including all three author probes and the Claim/Mew discrimination, so thirteen-at-once was isolation rather than a smear.

**THE PREDICTION SAID SEVENTEEN AND WAS WRONG BY ONE, in the informative direction.** "The outstanding commitment is still outstanding" was predicted red and stayed green: the forged `PreRegistrationToRevelation` link *was* accepted, and `get_foresight_record` ignored it anyway, because the coordinator-side comparison added alongside that rule caught what validation had let through. **That check needs both layers reverted to fail**, which measures the reader check as load-bearing and independent — the defence-in-depth claim §5.1 makes about courtesies, demonstrated for once rather than asserted.

**So every base comparison of the eighteen is now injected**, along with the update refusal, the tag rule, the shared anchor helper and the discrimination.

**AND A FIFTH INJECTION CLOSED THE AUTHOR HALF, by re-running the third one unchanged.** Fourteen probes were added for the bindings nothing reached, and then run `38127900644` reverted **the identical seventeen bindings with the identical script**, leaving the same five older rules intact — so the only variable between it and `38124976517` was the harness. Three reds became **eighteen of 84, exactly as predicted**. That rules out the one failure a green log cannot: a probe whose base its own link rule refuses never reaches the author check, tests nothing, and looks identical to a working one. None of the fourteen was that.

**The eighteenth red came from the poisoning section and taught something the rule's own commit did not say.** The `AgentToPreRegistration` probe files at the committing agent's *own* anchor, so with the binding gone it creates a **duplicate** link; `get_foresight_record` iterates links, so the commitment appears twice in `revealed`. That binding guards the denominator against **inflation** by a third party, not only against misfiling.

**A SIXTH INJECTION TESTED THE OPPOSITE DIRECTION AND FALSIFIED A DOCUMENTED CLAIM.** Every injection above removed a check, testing *under*-refusal. Run `38129574846` made one rule — `TargetToCritique` — refuse **every** link, correct ones included. Three results:

1. **The harness that caught it was a different one**, `domain-index.mjs`, simply because it is an earlier `conductor.yml` step that also calls `create_critique`. Which harness reports an over-refusing rule is an accident of step ordering rather than of design.
2. **Detection was by crash, not by a named check** — `internal_error: Source chain error: InvalidCommit ...` with a stack trace into `node_modules`. CI went red, so detection is real, but a crash says the zome broke without saying which property broke.
3. **`attachment-links.mjs`'s positive reads cannot catch this, and its own header said they could.** Link creation happens inside the same zome call as entry creation, so an over-refusing rule fails `create_critique` itself during setup and the read phase never runs. The claim was corrected and a `seed()` wrapper added, so a refused seeding call now reports as a named failure identifying the call and saying what it implies.

**Evidence now, as arithmetic rather than a fraction.** Both halves of all eighteen rules, plus the update refusal, the tag rule, the anchor helper and the discrimination, have each been watched failing on their own probe: **38 of 38 probes proven sensitive**, and five of six poisoning checks red on a real poisoning. **58 of the 101 checks have never been shown to fail** — the 38 paired validation-source assertions (which need a refusal from a coordinator guard), the 18 positive reads (which need an *over*-refusing injection, still not done), one plumbing control, and one check proven *insensitive* rather than unproven. The rules are well evidenced; a little under half the individual assertions are.

### 5.20a Every normative claim in §2 and §5, checked against validation

A second audit, from the specification side rather than the code side. §5.21 swept coordinator guards for checks claiming a DHT twin that did not exist; that sweep could not have caught `validate_retraction`, whose gap was a **specification claim with no coordinator guard at all** — §2.3 and the entry type's own doc comment both said a retraction records *the author* withdrawing, and validation checked only the signature. Three such gaps had been found by then (the `SynapticLink` burn tier, `validate_membrane`, `validate_retraction`), so every MUST in §2 and §5 was checked against a reachable validation branch.

**Result: no further gaps.** Every stated rule is enforced. Specifically confirmed rather than assumed:

- **Author binding (§5.2)** holds for every type that carries such a field. `BridgeRecord` and `ExternalCritique` have none — `ExternalCritique.author_handle` is an external platform handle this DHT cannot verify, correctly outside the rule rather than an omission from it.
- **Referential integrity (§5.3)** is enforced for every listed field, with `Critique.evidence_hashes` the one documented exception and correctly so (see §5.3's own reasoning).
- **`Critique.target` and `AntibodyPattern.target`** both reject `Agent`- and `External`-kind hashes via a real `EntryHash::try_from` guard, not merely by convention, and both cross-check the declared `target_type` against the entry's actual decoded type.
- **`Reinforcement`** enforces both its stated rules: the target downcasts to an `AgentPubKey` equal to the action's author, and the base is independently verified to be a real `SynapticLink` `CreateLink` action.
- **`AttestationGrant`** enforces tenure *and* budget, not just the budget.
- **`WorldlineTrace`** enforces all seven of its constraints, including that each `PeriodBoundary.sample_action` resolves to an action authored by the trace's own agent.

**What made three gaps possible, stated so the next one is easier to spot:** each was a rule whose *natural place to check* was somewhere other than validation — the burn tier and membrane accountability lived in coordinator functions that felt authoritative, and retraction's author rule lived only in prose that read like a description of the type rather than a constraint on it. A rule is enforced only where `validate` runs. Prose in §2, a doc comment, and a coordinator guard are all equally non-binding.

### 5.21 Coordinator courtesies that are NOT validation rules

Audit result, recorded because the distinction has been got wrong twice in this codebase and both times a comment asserted enforcement that did not exist (§5.8a, and the `SynapticLink` burn tier removed earlier).

Every coordinator-side refusal was checked against what the integrity zome actually dispatches. The five SWO friction limits (§6) are all genuinely enforced — each constant is used inside a reachable branch of `validate_critique`, `validate_antibody_pattern` or `validate_create_link`. `Claim.source_mew` resolution is enforced, and promoting another agent's `Mew` is blocked by the author-matching rule rather than by the coordinator's own check.

**THREE coordinator guards have no validation counterpart, and all three are correct — this section said "one" until 2026-10-21, which is the kind of counted claim that goes stale without anybody editing it.** The other two were found by `enumerate.mjs`'s inverse sweep (READINESS items 5e and 20) rather than by this audit, and they are recorded below. The first: `assert_expertise` refuses to build an expertise `Claim` citing a `WorldlineTrace` that is not the caller's own. The entry it produces is an ordinary `Claim`, so `validate_claim` governs it and has no notion of traces. A client bypassing the coordinator can therefore author an expertise claim citing anyone's trace.

That is a courtesy rather than a gap, for a reason specific to what expertise is here: an expertise assertion is deliberately a self-asserted `Claim`, critiquable like any other, and `expertise_tags` is explicitly an informal, non-authoritative index. Nothing in the protocol grants it standing, so there is nothing for a forged one to obtain. It is recorded here so that a future mechanism which *does* give expertise claims weight knows it would have to add the validation first — the guard it might otherwise assume exists is not there.

**The other two are `pre_register`'s emptiness checks, and for them a validation twin is not a judgement call — it is IMPOSSIBLE.** `prediction` and `salt` live in `SealedPrediction`, this zome's only private entry, and the integrity zome says so at the exact arm where the rule would have to go: *"a private entry's content is not available here"* — `hdi` delivers `None` for the body and treats `Some(_)` as an error. No peer ever sees either field at commit time, so no rule at any `protocol_version` can constrain them. This is a third member of the family §5.22 names: a goal that cannot be expressed as a deterministic rule over data validation can reach.

**For `prediction`, the content IS public at reveal, so the rule could live in `validate_revelation` instead. It should not, and the reason was measured rather than argued.** *"Not empty"* is a proxy for *"not vacuous"*, and the proxy does not hold: `prediction: "."` is accepted by the coordinator, revealed inside its deadline, and lands in `get_foresight_record`'s `revealed` list indistinguishably from a real kept commitment. A rule would refuse the one input nobody would ever use while admitting every vacuous one. **And the inflation it would guard against has no consumer:** nothing in this repository counts revealed commitments — there is no `.revealed.length` in the UI, the SDK or the MCP server, every surface renders the prediction's own text, and the foresight tab's intro says in as many words that there is no score on the page. That absence is load-bearing, and anything that later introduces a count inherits this gap.

**For `salt`, the check does not achieve what its own message claims, which is the sharper finding.** The message says the salt exists so that *"a guessable prediction is [not] recoverable from its hash"*, and `salt: "."` is accepted — a one-character salt is as brute-forcible as none. **The achievable version is an entropy requirement, and no validation rule can check one:** entropy is a property of the process that produced a string, not of the string, so a validator cannot distinguish a well-chosen salt from a badly-chosen one by inspection. Exactly §5.22's shape, reached from a different direction. The exposure is also the committer's own — a weak salt makes *their* commitment recoverable and misleads nobody else — so the coordinator, where the author can be warned, is the right layer and the only possible one.

**Neither needs a `protocol_version` bump, which is what READINESS item 20 was holding open.** The three readings are carried in `enumerate.mjs`'s `ACKNOWLEDGED` list so the tool stops re-reporting them as unread candidates, and that list exits 1 if any entry stops matching a real pre-check — a stale acknowledgement reads as a decision about code that is no longer there.

**The rule this audit suggests generally:** a coordinator check is a courtesy unless a reachable validation branch enforces the same predicate. A comment is not enforcement, and a constant's existence is not its use. **And a corollary the two `pre_register` checks add:** before asking whether a courtesy *should* be a rule, ask whether it *can* be. Two of the three candidates here were unenforceable by construction, and the question the row posed assumed the answer was a choice.

### 5.22 Time, and the one validation rule whose referent is author-supplied

**Validation in this protocol cannot read a clock, and that is a property of the host rather than a choice made here.** `hdi` — the integrity API every `validate_*` function is written against — does not expose `sys_time` at all: `grep -rn sys_time` over `hdi-0.8.0/src/` returns nothing, while the coordinator's `hdk-0.7.0/src/time.rs:63` exports it. The reason is determinism: every peer validating an op must reach the same verdict, and a rule consulting the validator's own clock would make validity observer-dependent, so the DHT would disagree with itself. §5.21 records a coordinator guard with no validation counterpart. This section records the mirror image, which is worse and had no section at all: **a validation rule whose referent validation has no way to reach.**

**THE THREE TIME COMPARISONS IN THE PRE-REGISTRATION PATH THEREFORE COMPARE TWO NUMBERS THE SAME AGENT SUPPLIED.** All three live in `dna/integrity/src/lib.rs`:

| Check | Compares |
|---|---|
| `reveal_deadline` must postdate the commitment (`:1150`) | `pr.reveal_deadline` against this action's own timestamp |
| the question must predate the commitment (`:1159`) | the question action's timestamp against this action's |
| **the reveal must precede the deadline (`:1210`)** | this action's timestamp against `pr.reveal_deadline` |

**What the host enforces about an action timestamp is monotonicity, and nothing else.** `check_prev_timestamp` (`holochain-0.7.0/src/core/sys_validate.rs:247`) is `t2 >= t1` against the previous action on the author's own chain. No production path compares an action timestamp to any validator's clock — the `Timestamp::now()` occurrences in that file are inside `mod tests`. The one place Holochain *does* bound a timestamp against another party's clock is countersigning, which is the repair named below.

**THE CONSEQUENCE FOR THE FORESIGHT MECHANISM.** §5.19's denominator note states the attack the shape exists to refuse: *"Commit ten predictions, reveal the two that came true, stay silent on the eight that did not."* The denominator holds — an unrevealed commitment is countable because its deadline and question are public from the moment it is made. What does not hold is the deadline's authority. An author may commit at T0 with deadline D, write nothing further to their chain, wait past D, observe the outcome, and then commit the `Revelation` carrying a timestamp T where `T0 <= T < D`. Monotonicity is satisfied, because the chain top is still the `PreRegistration` at T0, and `:1210` is therefore satisfied too. The commitment is spent only if the author wants it spent, which is precisely the selective revelation the rule's own comment says it refuses.

**CONFIRMED ON 2026-10-18 BY `scripts/live-verify/clock-skew-reveal.mjs`, AND THE CONTROL IN THE SAME RUN IS WHAT MAKES IT TRUSTWORTHY.** The probe starts a sandbox conductor under `libfaketime` with `FAKETIME_TIMESTAMP_FILE` and `FAKETIME_DONT_FAKE_MONOTONIC=1`, so `CLOCK_REALTIME` — the clock `SystemTime::now()` and therefore every action timestamp reads — can be moved between phases while tokio's timers keep measuring real durations. Three phases, reproduced identically twice with 0 failed checks:

| Phase | Clock | Call | Result |
|---|---|---|---|
| A | offset `+0` | `pre_register`, deadline 300s out | accepted, reads as `pending` |
| B | offset `+3600` | `get_foresight_record`, then an honest `reveal_pre_registration` | reads as `expired` with nothing written to surface it; the reveal is **REFUSED**, naming `past its reveal_deadline` |
| C | offset `+60` | **the identical reveal call, nothing changed but the clock** | **ACCEPTED** |

**Phase B is the control and it is load-bearing.** It reproduces `pre-registration.mjs` §6 inside the same process and against the same commitment, so the rule demonstrably fires and the harness is demonstrably not broken; phase C then differs from it in exactly one variable. No `PrevActionError` was raised in phase C, which also confirms the refusal in B wrote nothing to the chain and that chain monotonicity never constrained the backdated write.

**AND THE FORGERY IS PERMANENT, which was not predicted and is the part that matters most.** After phase C the probe restores the clock to `+3600` and reads the record again: the commitment **still reports as revealed**. So this is not a transient artifact of reading under a skewed clock — the `Revelation` is a durable entry whose action timestamp sits inside a window that had, in real time, already closed, and by Invariant 6 (§5.1, §7) it cannot afterwards be deleted. An author may therefore convert any expired commitment into a revealed one at any later time, having already seen the outcome, and the resulting record is indistinguishable from an honest reveal and permanent.

**WHAT THIS MEANS NORMATIVELY.** §5.19's denominator holds: commitments remain countable, and one never revealed still expires visibly. What does not hold is the deadline's authority, and therefore the meaning of the `revealed` list. **A conforming implementation MUST NOT present `get_foresight_record`'s `revealed` entries as evidence of foresight**, and MUST NOT compute or display any accuracy figure derived from them, unless one of the three repairs below is in force — and none is adopted, by decision taken 2026-10-19, so **this MUST is permanent for this implementation rather than an interim note** (see the decision below). Treating that list as audited is the overclaim this section exists to prevent. Note that a stock conductor stamps `Timestamp::now()` itself, so exercising this needs a modified conductor or a directly constructed chain — which is not a defence, because the adversary this mechanism exists to stop is the author, and `SECURITY.md` already names hot-swappable coordinators as a known and deliberate position.

**The probe is deliberately not a CI check.** It requires `libfaketime` built locally and it manipulates a clock, neither of which belongs on a shared runner; `scripts/run-clock-skew-probe.sh` documents how to run it by hand. It answered a question once and the answer is recorded here.

**Two things bound the attack, and both are worth recording because they are the only leverage available without a clock.** First, monotonicity is a real constraint: any action the author writes after D raises the floor and forecloses backdating, so a cheat requires the author's chain to stay silent across the entire window. Second, that silence is **observable** — a `Revelation` claiming a timestamp inside the window while its chain neighbours bracket D is a signature a reader can look for. Such a check can never be a validation rule, for the determinism reason above, but it is a legitimate read-layer observation of exactly the kind Invariant #2 prefers.

**Three repairs, and every one of them names a clock rather than adding a rule.** A conforming implementation MAY adopt any of them; this specification requires none, and states that plainly rather than implying the gap is closed:

1. **Countersign the `Revelation`.** `MIN_COUNTERSIGNING_AGENTS = 2` and `SESSION_TIME_FUTURE_MAX` of six seconds (`holochain_integrity_types-0.7.0/src/countersigning.rs:17`) are checked at the accepting agent's conductor against *its* clock, which bounds the timestamp to a second party. The cost is liveness: a reveal then requires a witness online at reveal time.
2. **Anchor to a named external clock**, attested as its own record. This is the same shape as countersigning with a service in place of a witness, and the same trade-off between an agent's autonomy and the rate at which a shared clock advances.
3. **Detect rather than prevent**, per the chain-gap signature above, and surface it read-layer.

**THE DECISION, TAKEN 2026-10-19: NONE OF THE THREE IS ADOPTED, AND THE MUST ABOVE IS PERMANENT RATHER THAN PROVISIONAL.** It was written reading as an interim measure — *"unless one of the three repairs below is in force"* — with READINESS item 14 queued to close it. Item 14 is closed by this decision instead, and the reasoning is worth keeping because the cost each repair carries is not a cost of implementation:

- **Repair 1 buys the deadline by spending autonomy.** Countersigning makes a reveal require a witness online at reveal time, so an agent that can write to its own chain could no longer complete a foresight commitment alone. That changes what this protocol promises rather than adding a check — and Invariant #2 prefers a read-layer observation to a mechanism that makes an agent wait on someone else.
- **Repair 2 is repair 1 with a service in place of the witness**, trading a witness's availability for a named clock's and adding an operator the protocol would then depend on.
- **Repair 3 is already permitted and needs nothing from this specification.** The chain-gap signature above is a read-layer observation any client MAY implement, and nothing here forbids it.

So the position taken is the one the MUST already states: **this protocol records foresight commitments and does not audit them.** The denominator holds, an unrevealed commitment still expires visibly, and `revealed` is a record of what an author chose to reveal rather than evidence of when they knew it.

**WHAT WOULD REOPEN THIS, stated so the next person need not re-derive the trade-off.** Any surface that grants this timestamp authority — a client displaying an accuracy figure, a reputation weight over `revealed`, a scoring client. At that moment the MUST is blocking a feature rather than annotating a mechanism nobody reads, and the cost of repair 1 becomes worth paying for that surface. The order then is **repair 3 first**, because it is free, read-layer, and already allowed, and repair 1 only if detection proves insufficient.

**A FOURTH REPAIR EXISTS AND IT IS NOT REPAIR 2, which is the whole reason this paragraph is here.** Added 2026-10-22, from a correspondence with Andras Gerlits about the ordering in *Continuous Integration of Data-Histories* (the invariant global ordering of Burgess & Gerlits, arXiv 2204.00470, already cited in §10's `order_records` note). Repair 2 is *"anchor to a named external clock"* and was rejected for being repair 1 with a service in place of the witness. **This one anchors to an ORDINAL, not a clock**, and the difference is not cosmetic: every objection recorded against repairs 1 and 2 is an objection to waiting on somebody's clock, and there is no clock in this one anywhere — not the author's, not a witness's, not a validator's.

4. **Anchor the deadline to a declared order's counter rather than to a time.** `reveal_deadline` becomes a position in a voluntarily-shared order — *version N* — and a `Revelation` MUST carry an association to a **closed** version whose counter precedes N. Validation then compares two counters, neither of which the author produced, because closing a version is not the author's act to perform.

**WHY THIS MEETS THIS SECTION'S ACTUAL CRITERION.** The defect recorded above is not that `hdi` lacks a clock; it is that *"the three time comparisons in the pre-registration path compare two numbers the same agent supplied."* Repairs 1 and 2 fix that by importing a second party's clock, and pay for it in autonomy. Repair 4 fixes it by making the referent **ordinal and externally closed** — so the determinism objection that keeps clocks out of validation does not arise at all, since nothing is being read from any validator's environment.

**ITS INDEPENDENCE IS STRUCTURAL RATHER THAN SOCIAL, which is the one respect in which it is strictly better than countersigning.** Countersigning bounds a timestamp against another party's clock and therefore requires that party to be *independent*: `MIN_COUNTERSIGNING_AGENTS = 2` is satisfied by two keys one actor holds, and this specification nowhere states who may witness. A counter requires only that the author cannot close versions. One needs an assumption about who the second party is; the other needs an assumption about what they can do.

**AND IT COSTS LESS AUTONOMY THAN REPAIR 1, which is the reason repair 1 was declined.** Repair 1 requires a witness online *at reveal time*. Repair 4 requires only that some version with a suitable counter has **already** closed, which the author discovers by reading rather than by waiting for a counterparty to sign. An agent that can write to its own chain can still complete a foresight commitment alone. Invariant #2's preference for a read-layer observation over a mechanism that makes an agent wait is therefore not violated in the way repair 1 violates it.

**WHAT `hdi` FORCES ON THE IMPLEMENTATION, and it is the part that makes this concrete rather than aspirational.** Validation cannot make network calls, so it can never confirm that an association corresponds to a real closed version in some external service. The closed versions must therefore be **in the DHT**, where `must_get_valid_record` can reach them:

- a notary agent publishes version records — a counter and whatever calibration metadata it attests — under its own key;
- a `Membrane` **declares** its notary key, as a published promise in the §10.9 sense;
- validation checks shape only: the association resolves, the referenced record's author equals the declared notary, and its counter precedes the deadline's.

No clock, no network call, no view of anybody's screen. Every rule is a deterministic predicate over data validation can already reach, which is the family test §5.22 opened with.

**A MEMBRANE MAY DECLARE ITS OWN SOCKPUPPET AS NOTARY, AND THAT IS NOT A HOLE.** It converts a silent, permanent forgery into a **public, attributable, critiquable choice**: the declared key is readable, and a notary that is the author's own key is visible to anyone who looks. This is the protocol's standing pattern — an additive remedy with interpretation local to the observer (Invariant #1) — rather than a new guarantee. What it must not be mistaken for is a proof of independence.

**THREE COSTS, STATED RATHER THAN IMPLIED.** First, it imports a **single point of calibration** for this path, which §10's `order_records` note explicitly says *"the centralization this DNA does not have"*; the mitigation is that the parent produces calibration and never events, so it orders without adjudicating content, but it is a scoped exception to a stated position and not a free one. Second, the honest path gains a **liveness dependency**: a reveal cannot complete until a suitable version has closed, which is a delay rather than a silent wrong — the trade this section's own measurement makes worth considering, since the present failure mode is an undetectable permanent forgery. Third, `PreRegistration.reveal_deadline` changes type and `Revelation` gains a field, so this is an **integrity change and forks the DNA** (§11.1); it belongs in a batched `protocol_version` bump and not in a bump of its own.

**STILL NOT ADOPTED, AND THE DECISION OF 2026-10-19 STANDS.** No surface grants this timestamp authority, so the MUST above is still annotating a mechanism nobody reads. What changes is the **reopen order**: it was *"repair 3 first, because it is free, and repair 1 only if detection proves insufficient."* It is now **repair 3 first, then repair 4, and repair 1 only if an ordinal anchor is unavailable** — because repair 4 buys the same bound as repair 1 without the autonomy cost that was the stated reason for declining it. And the reopen condition is no longer hypothetical: a published foresight record treated as audited is exactly the surface named, and it is the one this protocol would most plausibly be asked for.

**ONE THING THIS REPAIR DOES NOT DO.** It is **prospective only**. Every `Revelation` already written remains forgeable in the way measured above and, by Invariant 6, permanent. No repair at any `protocol_version` reaches backwards, so the `revealed` list of any pre-fork commitment stays what this section says it is: a record of what an author chose to reveal.

**Recorded and now measured rather than fixed, in the sense §5.21's closing paragraph means.** A coordinator comment is not enforcement and a constant's existence is not a limit; by the same rule, a timestamp comparison is not a deadline unless something outside the author bounds the timestamp. The guard a future mechanism might assume exists is not there, and anything that grants this timestamp weight — a reputation surface, a scoring client, a published foresight record treated as audited — would have to add one of the three repairs first.

**Two smaller findings in the same path, both drift of the kind §11 describes.** `PreRegistration.timestamp` and `Revelation.timestamp` (`dna/integrity/src/lib.rs:794`, `:806`) are **never read** — not by validation, and not by the coordinator, where every `.timestamp` reference resolves to an action's or a link's. They are unvalidated fields an author may set to anything, and a conforming implementation MUST NOT treat either as authoritative; the action timestamp is the only one any rule consults. Separately, **neither `PreRegistration` nor `Revelation` has a §2 subsection**, though both are listed in §10 and gated there by `check-spec-drift.mjs`. The entry types a rule is written about are absent from the data model that is supposed to enumerate them, which is the §4 gap §5.19's note already names, in a second place.

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

**Which acts appear in this table, and which do not, follows one rule.** Friction applies to acts that write onto a base another agent owns, or that move a signal shared between agents — and to nothing else. Every row above does one or both: `Critique` and `AntibodyPattern` attach to someone else's target, `SynapticLink` does the same while carrying conductance, `Reinforcement` moves a conductance value others read, and `AttestationGrant` writes about another agent into a membrane's trust graph. `Claim`, `Mew`, `Retraction`, `Constitution` and `Evidence` are unlimited because each only extends its own author's anchor and touches no one else's surface.

This is Invariant #2 (no imposition) expressed as rate limits: an agent may fill their own shelf freely, and writing on someone else's shelf is metered. It is deliberately **not** a judgement that asserting is cheaper than disagreeing — `Critique`'s cap exists to close a bypass of `SynapticLink`'s, since every critique creates a conductance edge, not because critique is held to be costlier speech. A conforming implementation adding a new entry type SHOULD apply friction on this basis: ask what surface the act writes to, not how expensive it feels.

**On bursts**: each row is a count within a rolling window, so an agent MAY spend a window's entire allowance instantaneously and then go quiet — bursting up to the limit is permitted by construction. What is deliberately not permitted is *banking*: allowance unused in one window does not accumulate into a later one. A token-bucket formulation with capacity above its refill rate would add exactly that, and was rejected for it — idling to accumulate and then dumping is the flooding pattern these limits exist to bound.

**What this is not**: none of the above raises the cost of creating a new agent identity — an unlimited number of fresh agents can each independently spend their own full budget. This is documented in this codebase as *spam defense*, explicitly distinct from *sybil resistance*, which remains open (see README.md §2.3 for the full discussion and for *containment*, the weaker property that is available without it — it makes a sybil ring unreachable by traversal rather than refusing its creation, and it does not extend to index reads such as `get_claims_by_domain`).

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

Three notes, since they materially affect conformance. The first two are carried forward from Appendix A as clarifications of what their invariants mean; the third is not a clarification but a consequence — what Invariant 6 costs, which is a deployment decision rather than a reading of the rule:

- **On Invariant 7**: this means the DHT's own dimensionality must never be flattened by the bridge's presence — not that every external platform the bridge touches can itself carry that dimensionality. Inbound (Twitter → DHT), the invariant holds fully. Outbound (DHT → Twitter), a 280-character platform cannot carry a typed critique graph by construction, so the bridge sends a lossy excerpt plus a link back to the full record instead; the invariant is satisfied by making that loss legible (§2.11's `carried_fields`/`dropped_fields`) and one-directional, not by pretending the excerpt is complete.
- **On Invariant 1**: every opt-in, caller-supplied filter this protocol currently exposes (`AttestationPolicy`, `ConductancePolicy` — §10.8, §10.9) is deliberately **never a protocol default**. Omitting the field is always exactly the old, unfiltered behavior; supplying it states the *caller's own* trust policy, never a value the protocol computes and asserts as authoritative. A hardcoded, always-applied version of either would itself be the kind of canonical signal this invariant rules out.

- **On Invariant 6, and this one is a legal and operational consequence rather than a design clarification.** As of `protocol_version: 4` no delete op of any kind is accepted (§5.1), which makes this invariant true without qualification — and makes **data erasure structurally impossible**. There is no deletion path for an author, an operator, or a hypothetical administrator: the capability is absent from the integrity zome, not merely unexposed, and a coordinator edit cannot add it because validation is what refuses. The remedies this protocol does offer are *additive*: a `Retraction` (§2.3) by the original author, which leaves the claim readable with the withdrawal attached, and an `AntibodyPattern` (§2.5) by anyone, which attaches a typed objection. Both add a record; neither removes one.

  **Two consequences an implementer or deployer MUST weigh before onboarding anyone.** First, a request to erase personal data — a right under GDPR Article 17 and comparable regimes — **cannot be complied with on this network**, by anyone, by any means short of every peer abandoning the DNA. That is a deliberate property of the design and not a defect, but it is a decision to make explicitly rather than discover: a private group among informed participants is a different proposition from a public deployment. Second, because §5.2's author binding makes retraction author-only (`validate_retraction` compares the retraction's author to the claim's), **an agent key that is lost takes the ability to retract with it** — the entries remain, permanently, un-withdrawable by anybody. Holochain offers no key recovery or rotation here, so this is not recoverable by operational means either. `INSTALL.md` states both to a prospective user in plain terms, which is the minimum this invariant obliges.

  **AND THE WORDING PERMITS A READING THAT WOULD VIOLATE PROMISE THEORY, which is worth closing since this protocol derives most of its invariants from it.** *"Nothing is deleted"* can be read two ways, and only one of them is defensible. Read as **"no agent may erase another agent's record of what was promised"**, it is not merely compatible with Promise Theory but close to required: an assessment is the assessor's own, and a promiser able to delete it would be exercising authority over another agent, which autonomy forbids. Read as **"a promiser may not withdraw their own promise"**, it violates autonomy directly — withdrawal is within an agent's own authority in Promise Theory, and a system that forbids it is making a promise on the agent's behalf. **The first reading is the operative one here, and `Retraction` is what makes it so**: §2.3 lets the author withdraw the promise while leaving every observer's record of it intact. So the mechanism was already the Promise-Theory-correct one; what was missing was the sentence saying which of the two readings the invariant means. It means the first. An implementation that read it as the second — refusing retraction on the grounds that nothing may change — would be conforming to the words and violating the theory the words come from.

- **On Invariant 1, a second note, and it was a tension between the note above and this one until 2026-10-19.** The note above says a hardcoded, always-applied version of a caller-supplied policy "would itself be the kind of canonical signal this invariant rules out." `CONDUCTANCE_HALF_LIFE_SECS = 30 days` was exactly that: one constant, applied to every membrane, converting elapsed time into a conductance a reader acts on — a threshold the protocol asserted universally with **no promiser behind it**. Quantitative Promise Theory states the general case, that a threshold turning a signal into a decision is itself a promise and therefore needs an agent to make it.

  **RESOLVED BY MAKING THE READER THE PROMISER, which is to say the note above governs.** `ConductancePolicy.half_life_secs` (§10.9) is the field: supplying it states *"for the purposes of what I am about to count, connections are stale on this schedule"*, and omitting it is exactly the previous behaviour, which is the shape every other read-layer policy here already has. A reader for a climate-science membrane and one for a market-commentary membrane no longer have to accept the same forgetting rate. **What it costs is cross-reader comparability, accepted deliberately:** two readers with different half-lives get different effective conductances for the same link and neither is wrong, because the number was never a property of the link alone. What stays comparable is what the DHT holds — the base conductance and the Reinforcement events, byte-identical for every reader.

  **THE OTHER CANDIDATE AND WHY IT WAS NOT TAKEN.** Declaring the half-life per membrane in its `Constitution` is the more expressive design and remains the better Promise-Theory shape, since a membrane is the agent whose domain is doing the forgetting. `Constitution` is an **integrity** entry, so adding a field changes the DNA hash, and §11.1 is explicit that a different hash is a different network rather than an upgrade: every installed hApp reinstalls and no existing claim carries over. That price is not worth paying for this alone, and it stays queued for the next `protocol_version` change that happens for another reason.

  **HALF THE COMPLAINT SURVIVES, AND IS RECORDED RATHER THAN QUIETLY CLOSED.** A reader who supplies no policy still gets thirty days, still with no promiser. Unlike an attestation filter, a half-life has no neutral "off" position — time passes whether or not anybody promised a rate — so "omitting it is the old behaviour" cannot mean "no threshold is applied" here the way it does there. The strict reading of the note above would be: **no promiser, no decay**, with effective conductance left as base plus reinforcements undecayed. That is a change to what every existing conductance read returns, was deliberately not taken on 2026-10-19, and is the remaining half of this tension.

- **On Invariant 9, and this is an admission rather than a note.** *"Death is required — unused entry types and membranes must atrophy."* Only conductance atrophies, and only at read time: `get_effective_conductance` recomputes `decay_factor` when asked and writes nothing, so the DHT is byte-identical before and after a link has decayed to nothing. Entry types and membranes do not atrophy at all. **The schedule half of that is no longer true as of 2026-10-20 and the invariant is still not satisfied, which is worth stating in that order.** `grep -c infallible` over the two zomes now returns **6 and 0** — `metabolic_tick`, in the coordinator, is the first `#[hdk_extern(infallible)]` here, and `#[hdk_extern(infallible)]` with `schedule()` is the host's only mechanism for a DNA to act without an external call. So a DNA that acts on its own clock exists, verified against a real conductor: a tick arrives with no caller and recurs on a 60s floor (`scripts/live-verify/metabolism.mjs`, READINESS item 8). **It changes nothing about Invariant 9, because the tick OBSERVES and does not act.** Atrophy that emits no events cannot drive anything, and a tick that reports decay drives nothing either — so **Invariant 9 remains the one invariant on this list with no mechanism behind it**, and a conforming implementation still cannot satisfy it. What moved is which half is missing: it was the clock and the consequence, and it is now only the consequence. **The consequence is deliberately unbuilt rather than merely absent.** Anything a scheduled observer wrote would be permanent under Invariant 6 and would spend a §6 friction budget every tick, so what it should write is a governance question and not an implementation detail. **That question was queued as READINESS item 9, item 9 CLOSED on 2026-10-20, and the question did not move anywhere — corrected 2026-10-21.** Item 9 settled the half it could: a discourse-health reading is an AGENT's signed, critiquable promise, because a membrane has no key. A scheduled tick runs as the author of the chain it runs for, so it *has* a key and the write is now possible. **What remains is the part item 8 named and nobody has decided: WHAT it writes, HOW OFTEN, and under WHOSE key** — every such entry being permanent under Invariant 6 and spending a §6 friction budget per tick, which makes switching on an autonomous writer the least reversible change available in this protocol. **DECIDED 2026-10-21 — READINESS item 22, option (a): no autonomous write.** The tick keeps emitting an ephemeral signal and a reading is published when a person chooses to. **So this invariant is now unsatisfied BY DECISION rather than by omission**, which is a different state from the one this note described for most of its life: the clock exists, and the consequence is declined. **The three reasons, shortest first.** There is no consumer — `publish_discourse_reading` is itself unsurfaced (§9), so an autonomous publisher would create permanent supply for a screen that does not exist. Invariant 6 makes it the least reversible change available, since the off switch stops future writes and nothing else. And the signature question is not about storage at all: a reading is somebody's signed, critiquable promise, so an unattended writer makes permanent attributable promises in an agent's name while they are not watching. **ENFORCED, NOT MERELY STATED:** `scripts/live-verify/metabolism.mjs` asserts the tick's own chain does not grow across ticks — chain-locally, so a write to any domain is caught — and that check has been watched failing (injection AO). The decision cannot drift into its opposite by implementation. **THE TENSION IS WORTH NAMING, AND AS OF 2026-10-22 IT IS NARROWER THAN THIS NOTE CLAIMED FOR MOST OF ITS LIFE.** The claim was: *Invariants 6 and 9 pull against each other by construction. 9 requires atrophy to DRIVE something; 6 makes anything it drives permanent and un-deletable. The available consequences are therefore ephemeral — which does not satisfy 9 — or durable, which accumulate for ever. No implementation resolves that; it would need one of the two invariants amended.* **The second half of that is wrong, and the reason is that neither 6 nor 9 is a Promise Theory axiom.** Invariants 1, 2, 4, 5 and 8 are derivations from autonomy, typed promise bodies and observer-local assessment. 6 and 9 are **imports** — 6 from an immutable-ledger ethic and the substrate's refusal of delete ops, 9 from autopoiesis. Promise Theory therefore cannot adjudicate between them, because it speaks to neither; and the conflict is between two imported axioms rather than between two consequences of the model, which is a different kind of problem and a smaller one.

**WHAT PROMISE THEORY DOES SAY IS WHAT "DEATH" MEANS, AND IT IS NOT DELETION.** A promise with no assessor has no effect — not because it has been destroyed, but because effect exists only in assessment. The Promise-Theory translation of *"death is required"* is therefore **loss of standing**, not loss of data: an entry nobody assesses stops participating while remaining exactly where it was, fetchable by anybody who asks for it directly. Read that way:

  - **Invariant 6 is untouched.** Nothing is deleted. Nothing is even written: the verdict is a computation a reader performs, which anybody can recompute and dispute.
  - **Invariant 9 gets a real consequence.** What the system PRESENTS changes, and presentation is precisely where assessment happens — so a consequence that alters what a default read returns is not a weaker substitute for atrophy, it is what atrophy means for a system whose effects are assessments.
  - **The durable-or-ephemeral dilemma dissolves**, because it assumed the consequence must be durable to count. In Promise Theory a durable atrophy verdict would be a NEW promise about somebody else's entry, made by an agent who is not its author — a strictly stronger and more questionable act than declining to assess, and one Invariant 1 would then have to be read against.

**SO THE AMENDMENT THIS NOTE CALLED FOR IS NOT NEEDED.** Neither invariant has to change; what had to change is this note's claim that no implementation resolves the tension. A read-time standing rule resolves it, satisfies both, writes nothing, and does not reopen READINESS item 22 — whose reopen condition governs autonomous WRITES and therefore does not apply to a computation performed on demand. **What remains genuinely open is the THRESHOLD, and that is a Quantitative Promise Theory problem rather than a 6-versus-9 one**: a threshold turning a signal into a decision is itself a promise and needs an agent behind it, which is the argument that retired `CONDUCTANCE_HALF_LIFE_SECS` as a universal constant with no promiser. The two available answers are therefore a **per-membrane declared promise** (§10.9's shape, and the reading under which "same DNA, different expression" is exact), or a threshold **derived** rather than chosen, so that no agent had to pick it. Nothing here yet does either, and that — not the invariant pair — is what Invariant 9 is waiting on. **Reopen condition: a surface for readings exists AND somebody wants them faster than a person will click** — both halves, and then option (b), opt-in per agent and write-on-change, rather than a heartbeat. The observation is therefore emitted as an ephemeral signal, touching neither the DHT nor the source chain. The structural rule is unchanged and is what made this possible: it belongs in the coordinator, where `sys_time` and `schedule` are both available, and never in validation, for the reason §5.22 gives.

## 7b. Two disciplines that are not invariants

**These are not invariants and are deliberately not numbered among them.** They are not derivations from Promise Theory, nothing in validation can enforce them, and an implementation that ignored them would still conform to §7. They are rules about how this protocol REPORTS, written down because both were already practised in several places and in none of them as a rule — which is exactly the condition under which a practice lapses without anybody deciding to drop it.

**Both are adopted from Veritas (Project 89, `github.com/project-89/Veritas`), which states them as system-wide rules for an evidence-grounded ingestion pipeline.** The wording below is theirs; the instances are this repository's.

### 7b.1 Grounded or silent — and counted

**Anything that cannot cite what it rests on is dropped, AND THE DROP IS COUNTED.** Veritas's form: *"Claims and extracted examples must cite verifiable evidence; unverifiable ones are dropped and counted."*

**The counted half is the load-bearing one**, because a silent drop is indistinguishable from an empty input. A filter that returns three things from a hundred and reports three looks identical to one that was handed three. §5.19's denominator note is this discipline applied to pre-registration — an unrevealed commitment stays countable because its deadline and question are public from the moment it is made — and §10's `order_records` applies it to reads: `unresolved` NAMES the inputs it could not read rather than omitting them, and `tie_broken` reports how many positions were decided arbitrarily so a reader can tell a sequence from a list.

**Where it binds next is automated ingestion**, which is the one direction that would make this protocol's inflow problem tractable and the one most likely to erode it. An ingesting agent is safe to switch on exactly when its rejects are counted: *"dropped 400 of 500, 380 for an unresolvable citation"* is a reading somebody can dispute, while the same run reporting 100 claims is indistinguishable from a quiet day.

**What it forbids:** a read that returns fewer things than it considered without saying so.

### 7b.2 Every read declares the mode it ran in

**A computation with more than one mode — a fallback, a sampling resolution, a cap, a tie-break — reports which mode it used, in the same structure as its answer.** Veritas's form is *"honest degradation"*: each stage declares its fallback, and outputs *"state what they filtered rather than silently shrinking."*

**This repository has been bitten three times by its absence, which is why it is a rule and not a preference.** The single datacentre crossing was quoted as a latency of "5.0s" for months when it was an upper bound from a 5s sampler (corrected 2026-10-21). A 421.1s figure was read as a deterministic constant when the repetition was the sampler's step size. And on 2026-10-22 both errors were made again in one day from the opposite directions: four readers run in parallel against one conductor inflated a crossing figure through lock contention, and a diagnostic started to explain a stall erased the self-recovery figure it was run to find.

**The strongest form puts the declaration and the measurement in the same structure, so a harness can compare them to each other rather than trusting either.** `MetabolismTerms` declares `writes_to_the_dht: false` and `scripts/live-verify/metabolism.mjs` asserts the tick's own chain does not grow across ticks; `SignalChannelTerms` declares `entries_written_per_signal: 0` and carries the agent's `chain_length` in the same struct so a caller can read it, send signals, and read it again. **A declaration nothing checks is a comment**, and §5.21 already records what this repository thinks of comments standing in for enforcement.

**What it forbids:** an answer whose precision is implied by its format.

### 7b.3 Why these are disciplines rather than rules

Neither is reachable by validation. Both concern coordinator reads, harnesses and clients — the hot-swappable half — so the only enforcement available is the one 7b.2 names: a check that compares a declaration against a measurement and goes red when they disagree. That is weaker than validation and it is what is available. Stating the disciplines is what makes the absence of such a check visible as a gap rather than invisible as a habit nobody wrote down.

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

### 10.0 Read scope: which reads see the DHT, and which see only your own chain

**This distinction is normative and was not stated in any revision of this document before now. An implementation that ignores it will appear to work and will not.**

The reads below divide into two kinds, and their signatures do not distinguish them — several of both kinds take a filter and return `Vec<Record>`.

- **DHT-wide reads** resolve a hash with `get`, or follow `get_links` from a hash or anchor. They see entries authored by *any* agent. `get_claims_by_agent`, `get_critiques_for`, `get_antibody_patterns_for`, `get_retractions_for_claim`, `get_membrane_members`, `get_agent_constitution`, `get_critique_species_adoption_count` and `get_effective_conductance` are of this kind.
- **Chain-local reads** are built on `query(ChainQueryFilter)`, which by Holochain's definition scans **the calling agent's own source chain and never the DHT**. They return only what *that agent* authored.

Chain-local is the *correct* scope for some of these, and saying so matters as much as naming the gap: `generate_worldline_trace` and `sample_period` index the caller's own history by definition, `export_to_n4l` exports the caller's own records, and `get_unbridged_claims`/`get_unbridged_mews` exist so a bridge can publish *its own* agent's backlog. Nothing is wrong there.

The problem is the remainder, where chain-local scope contradicts the function's evident purpose. **Two of those five are now fixed; three remain.**

**Fixed — these are DHT-wide as of this revision.** `get_claims_by_domain` reads `LinkTypes::DomainToClaim` from a domain anchor (`Path::from("domain_<name>")`), and `get_all_critique_species` reads `LinkTypes::TaxonomyToSpecies` from the single taxonomy anchor (`Path::from("critique_species")`). `create_claim` and `create_critique_species` write those links respectively. **Both reads are link-only with no chain-query fallback, and that is normative rather than incidental:** a union with the old query would return the caller's own records whether or not the index worked, which on a single-agent conductor — the only kind this protocol had ever been tested on — would let a broken index go on passing every test. That fallback is precisely what would have hidden this defect, and an implementation must not add one.

Validation enforces three properties on `DomainToClaim`, and an implementation that omits them has an index rather than a trustworthy one: the target must resolve to a real `Claim`; the base anchor must be the one that claim's *own declared domain* derives (otherwise any claim may be filed under any domain); and the link author must be the claim's author (§5.2 author binding — a third party filing others' claims is bounded by nobody's friction budget). `TaxonomyToSpecies` enforces the analogous three, with `CritiqueSpecies.proposer` in place of `Claim.author` and a fixed anchor in place of a derived one.

**That design question is now answered, and the answer is different for each of the three.** They were held back as one class — "a single global index over an unbounded, ever-growing set" — and treating them as one class is what kept the question open, because the objection is decisive for two of them and weak for the third. What distinguishes them is not boundedness in the abstract but **what the index grows with, against whether any reader wants the whole of it.**

**`get_membranes` is indexed as of this revision, DHT-wide over `LinkTypes::MembraneRegistry`.** A `Membrane` is founded once per domain, so this index grows with **foundings, not with activity** — strictly slower than `DomainToClaim`, which grows with every claim and was accepted without argument. And the read is the discovery surface: **you cannot join a membrane you cannot find.** Left chain-local it was not a firehose nobody wanted, it was a directory showing each agent only the domains they had founded themselves — the same defect as browsing a domain and seeing only your own claims, one scale up, and it was live in the UI's Domains tab. The anchor is `path_entry_hash()` of `Path::from("membranes")`, written by `create_membrane`, and validation enforces the same three properties as `TaxonomyToSpecies` with `Membrane.creator` in place of `CritiqueSpecies.proposer`. Link-only with no chain-query fallback, for the reason stated above, which is normative.

**`get_critiques_by_mode` stays chain-local, and the objection is strongest here.** `CritiqueMode` has five variants, so a global index would be **five anchors accumulating every critique ever written**, forever — unbounded growth concentrated on a fixed, tiny number of DHT locations, which is the worst hot-spot shape available on this substrate. And no reader wants it: "every Logical critique in existence" is not a question anyone asks, while the questions people do ask are already served DHT-wide — `get_critiques_for` for a given target, and `get_discourse_health`'s `critique_mode_distribution` for a given domain. **The domain-scoped version of this read already exists**, which makes the global one redundant rather than missing.

**`get_all_constitutions` stays chain-local, and is additionally the wrong question.** It grows linearly with **agents**, making it the least bounded of the three, and `get_agent_constitution` already answers the question anyone actually has — one agent's constitution, DHT-wide over `AgentToConstitution`. No client calls `get_all_constitutions`; the SDK does not expose it. A list of every agent's published promises is also closer to a surveillance surface than a discovery one, which is a reason to want its absence rather than merely to tolerate it. Its honest purpose is the caller's own constitutions over time, since they can be superseded and can expire.

**An implementation MUST treat `get_critiques_by_mode` and `get_all_constitutions` as chain-local, and MUST NOT present either as a network-wide view.** `mobile-ui` labels every by-mode figure "your own" for exactly this reason: a heading reading "Logical critiques" over chain-local data is false, and falsest in its empty state, where a reader takes zero for "nobody critiques this way" when it means "I have not".

The consequence, for the historical record and because it explains the shape of the fix: before the two indexes existed, **on a network with more than one agent, browsing a domain returned only your own claims** — the ordinary entry point into a protocol whose entire purpose is agents cross-checking each other. The data was never missing, only unfindable: `get_claims_by_agent` retrieved the very same entries the domain read could not see.

**Why this survived to now:** every conductor this project has ever verified against ran exactly one agent, and on one agent the two kinds are indistinguishable in behaviour. It is a genuine gap in the specified protocol, not a client bug, and is confirmed live with two real agents by `scripts/live-verify/read-scope.mjs` — the same claim being invisible to `get_claims_by_domain` while `get_claims_by_agent` returns it for the same agent at the same moment, which is what rules out "not yet gossiped".

**Confirmed live, with controls**, by `scripts/live-verify/read-scope.mjs`: two real agents on one conductor, every chain-local read paired with a link-based read of the *same* entry by the *same* agent at the *same* moment, so an observed zero cannot be explained by "not yet gossiped". That harness now asserts the corrected behaviour for the three indexed reads — including `get_membranes` seeing a membrane the caller did not found — and the still-chain-local behaviour for the remaining two, making it the executable form of this section. `scripts/live-verify/domain-index.mjs` covers the indexes themselves, including three attempts to poison the by-domain index — a claim filed under a domain it does not declare, a third party filing someone else's claim, and a non-`Claim` target — each performed for real through the `attempt_false_domain_index` prober and each observed being refused by validation. §2c of that harness does the same three for the membrane registry through `attempt_false_membrane_registry`, and asserts afterwards that the registry still holds only the one real membrane.

### 10.0b Protocol version
| Function | Payload | Returns |
|---|---|---|
| `get_protocol_version` | `()` | `ProtocolIdentity { declared_version: u16, implemented_version: u16, dna_hash: DnaHash }` — a pure `dna_info()` read (§11.2) |

`declared_version` is what the DNA's `properties` say; `implemented_version` is what the running integrity zome implements. They can only differ on a DNA that accepts no writes (§5.0), which is exactly when something needs to be able to say so. No DHT access, so it answers on an empty network.

### 10.1 Claim
| Function | Payload | Returns |
|---|---|---|
| `create_claim` | `Claim` | `ActionHash` |
| `get_claim` | `hash: AnyDhtHash` | `Option<Claim>` |
| `get_claims_by_domain` | `domain: String` | `Vec<Record>` — DHT-wide via `DomainToClaim` (§10.0) |
| `get_claims_by_agent` | `agent: AgentPubKey` | `Vec<Record>` |

### 10.2 Critique
| Function | Payload | Returns |
|---|---|---|
| `create_critique` | `Critique` | `ActionHash` |
| `get_critiques_for` | `target: AnyDhtHash` | `Vec<Record>` |
| `get_critiques_by_mode` | `mode: CritiqueMode` | `Vec<Record>` — **chain-local** (§10.0) |
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
| `critiques_unseen_by` | `critique_hash: ActionHash` | `UnseenReport { critique, unseen, seen_count, cone_recorded, total_known, note }` — which critiques of the same target a given critique's author did NOT record having seen. The detection half of the C dial; `Critique.past_cone` is the retention. **`cone_recorded` MUST be consulted before reading `unseen` as ignorance.** When it is false the author recorded nothing, which is silence rather than ignorance — an author whose client does not populate cones is uninformative, not uninformed — and conflating the two manufactures a finding out of a missing feature. `total_known` is this observer's denominator, published so the figures can be checked rather than trusted. Coordinator-only: the QUERY costs no DNA hash change; the field it reads cost the bump to 10 |
| `publish_assessment` | `Assessment { assessor, target, stance, confidence, rationale, past_cone, timestamp }` | `ActionHash`. **One agent's stance on one target** — `Supports`, `Disputes` or `Abstains`, a TYPED stance rather than a score, for the reason Invariant 4 applies to critique modes and Invariant 1 to comparative measures. Carries a `past_cone` under the same rules as `Critique` (§10, `protocol_version: 10`): an assessment made without seeing the objections is a different act from one made in spite of them. Indexed by `TargetToAssessment`, which validation binds to the assessment's own target AND author |
| `publish_settlement_policy` | `SettlementPolicy { author, name, min_assessors, max_dissent, statement, published_at }` | `ActionHash`. **A threshold published BEFORE it is applied** — Burgess's point that a threshold is itself a promise, so the rule for turning disagreement into a status is on the record and separately arguable. Validation **MUST** refuse `min_assessors == 0` (a policy settling on an empty input set would settle anything) and **MUST** refuse an empty `statement` (a threshold nobody explained is a number pretending to be a reason). All parameters are integers and all comparisons exact, because validation recomputes from them and every peer must reach the identical answer |
| `publish_settlement_status` | `SettlementStatus { aggregator, target, policy, inputs, state, timestamp }` | `ActionHash`. **An aggregator's published settlement, and validation RECOMPUTES IT.** Settlement is a pure function of (policy, inputs), so `validate_settlement_status` performs it: a state that does not follow from the cited policy and inputs is **refused by every peer independently**, not merely detectable by a careful reader. `policy` is cited BY HASH so the exact parameters are pinned; `inputs` lists every record counted. **Status is an ENTRY, not a field** — §5.1 refuses app-entry updates, so a later status cannot erase an earlier one and two aggregators may legitimately disagree. Validation **MUST** refuse duplicate inputs, inputs naming a different target, and inputs that are neither an `Assessment` nor a `Critique` |
| `recompute_settlement` | `{ target, policy, inputs }` | `RecomputedSettlement { .., distinct_assessors, dissent, unusable_inputs, state, note }` — the same `settle()` function validation runs, exposed as a read so anybody can reproduce another aggregator's result without writing. **Distinct assessors are counted by `AgentPubKey`**, so one agent assessing five times is one assessor — the only sybil-adjacent property a rule here can check. `unusable_inputs` is reported rather than dropped, because a recomputation over a quietly smaller set is a different answer wearing the same name |
| `get_assessments_for` | `target: AnyLinkableHash` | `Vec<Record>` via `TargetToAssessment` |
| `get_settlement_statuses_for` | `target: AnyLinkableHash` | `Vec<Record>` via `TargetToSettlementStatus` — **ALL of them, including ones that disagree.** Nothing picks a winner: hiding a dissenting status behind a "current" one would be the deletion Invariant 6 forbids, performed by a reader instead of a writer |
| `order_records` | `hashes: Vec<ActionHash>` | `OrderedRecords { order, policy, causal_edges, tie_broken, unresolved, cycle_detected }` — **the O dial (§5.3's closure is the C dial).** A deterministic replay order: a referenced record precedes its referrer (a §5.3 dependency had to resolve before the referrer could commit), two actions on one chain follow the chain, and concurrent records tie-break on action hash. **Author timestamps are NOT consulted, and that is normative** — §5.22 records that validation cannot reach a clock, and READINESS item 14 measured a `reveal_deadline` backdated by moving the authoring conductor's clock. An order built on self-reported times is an order the author chooses. **THIS IS NOT A GLOBAL ORDER AND MUST NOT BE PRESENTED AS ONE.** Linearizability is "a composite of two systems, a store and a global real-time serializer supplying an order no single observer's light cone can" (Landers & Kramer, arXiv 2605.09114), and the invariant global ordering of Burgess & Gerlits (arXiv 2204.00470) derives from a hierarchy whose parent nodes are "a single point of calibration" — the centralization this DNA does not have. What this promises is narrower and checkable: **every observer handed the same set computes the same sequence**, which is what lets an aggregate be recomputed and disputed rather than trusted. `tie_broken` reports how many positions were decided arbitrarily, so a reader can tell a sequence from a list; `unresolved` names inputs that could not be read rather than dropping them. Coordinator-only: no entry type, no link type, no validation rule, so the DNA hash is untouched |
| `which_entries_resolve_locally` | `hashes: Vec<AnyDhtHash>` | `Vec<bool>`, one per input hash and in the same order — whether the local databases can serve it NOW (`GetOptions::local()`, no network call). Type-agnostic, matching the question `must_get_entry` asks of `evidence_hashes`. This is **closure** (§5.3), not validation: a `true` is not a promise that a commit citing it will succeed, since propagation is not transactional |

### 10.5 Membrane, Constitution, CritiqueSpecies
| Function | Payload | Returns |
|---|---|---|
| `create_membrane` | `Membrane` | `ActionHash` |
| `get_membranes` | — | `Vec<Record>` — **DHT-wide** over `MembraneRegistry` (§10.0) |
| `join_membrane` | `membrane: AnyDhtHash` | `ActionHash` |
| `get_membrane_members` | `membrane: AnyDhtHash` | `Vec<AgentPubKey>` |
| `get_my_membership_action` | `membrane: AnyDhtHash` | `Option<ActionHash>` |
| `publish_constitution` | `Constitution` | `ActionHash` |
| `get_agent_constitution` | `agent: AgentPubKey` | `Option<Constitution>` |
| `get_all_constitutions` | — | `Vec<Record>` — **chain-local** (§10.0) |
| `create_critique_species` | `CritiqueSpecies` | `ActionHash` |
| `get_critique_species` | `hash: AnyDhtHash` | `Option<CritiqueSpecies>` |
| `get_all_critique_species` | — | `Vec<Record>` — DHT-wide via `TaxonomyToSpecies` (§10.0) |
| `get_critique_species_adoption_count` | `species_hash: EntryHash` | `usize` — live count of real `CritiqueToSpecies` links, not a stored field |
| `get_species_adoption` | `species_hash: EntryHash` | `SpeciesAdoption { species, name, proposer, total_citations, proposer_citations, independent_adopters: Vec<AgentPubKey>, unattributable_citations, warning }` — the same links DECOMPOSED BY WHO CITED THEM. `total_citations` is `get_critique_species_adoption_count`'s figure, kept so the two reads cannot drift; `independent_adopters` is distinct agents OTHER than the proposer, which is the number the count above cannot express. **Components and no score**, for the reason Invariant #1 (§7) gives — a species one agent proposed and then cited fifty times is not fifty adoptions, and a single index would read as a verdict on its proposer. READINESS item 11 |
| `get_species_secretion` | `species_hash: EntryHash` | `SpeciesSecretion { species, name, proposer, total_citations, proposer_citations, unattributable_citations, downstream_adopters, parallel_adopters, cone_silent_citations, max_independent_causal_depth, citations, note }` — the same links decomposed by **CAUSAL DISTANCE**, which is the half `get_species_adoption` cannot reach. Three independent citers look identical whether they took the species up BECAUSE they had seen it working or arrived at the same vocabulary never having met it; the first is uptake, the second coincidence, and reading the second as the first is how a private vocabulary is mistaken for a discovery. **`downstream_adopters`** are independent citers whose own `Critique.past_cone` contains a prior citation of this species — they demonstrably wrote having seen it in use, PROVEN BY WHAT THE AUTHOR RETAINED. **`parallel_adopters`** recorded a cone that holds no prior citation: consistent with independent arrival and NOT proof of it, since the earlier citation may simply not have reached them. **`cone_silent_citations`** recorded no cone at all and are evidence of nothing either way — an author whose client omits cones is SILENT, NOT IGNORANT (the same discipline `UnseenReport` carries). **NOT A SECOND READ DIFFED AGAINST THE FIRST**, which is the obvious implementation and is wrong: two reads are separated by a CLOCK, and §5.22 records that validation cannot reach one while READINESS item 14 MEASURED a `reveal_deadline` backdated by moving a conductor's — so a proposer wanting uptake to look like growth would control the write times a diff is computed from. The past cone cannot be re-chosen afterwards. `max_independent_causal_depth` is the one figure two readings may be compared on, and it EXCLUDES the proposer specifically so a proposer citing its own species in an ever-deeper chain cannot drive it. **Components and no score**, per Invariant #1 (§7). It still cannot clear a divergent observer IN ADVANCE: adoption is visible only after others have had the chance to adopt, so item 11's measurement makes a minority OBSERVABLE, not SAFE |

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
| `get_discourse_health` | `GetDiscourseHealthPayload { membrane: AnyDhtHash, attestation_policy: Option<AttestationPolicy>, conductance_policy: Option<ConductancePolicy> }` | `DiscourseHealth { domain: String, abstract_to_embodied_ratio: f32, warning: Option<String>, total_claims: u32, reading_claims: u32, total_critiques: u32, critique_mode_distribution: Vec<(CritiqueMode, u32)> }`. **`total_claims` EXCLUDES claims tagged `discourse-health-reading`, and `reading_claims` says how many were set aside** — added 2026-10-21. `publish_discourse_reading` writes its Claim into the domain the reading is ABOUT, so counting it made this aggregate measure itself: measured at 1, 2, 3, 4 over three readings of a domain holding one real claim. The critiques OF a reading are excluded with it, which is the less obvious half — a critique of a reading is real discourse about the MEASUREMENT rather than about the domain's subject, and leaving it in the numerator would inflate the ratio with argument about the instrument. **`total_claims + reading_claims` MUST account for every record `get_claims_by_domain` returns for that domain**, so the exclusion is auditable rather than silent. Coordinator-only: no entry type, no link type, no validation rule, so no DNA hash change. READINESS item 22 |
| `publish_discourse_reading` | `PublishDiscourseReadingPayload { membrane: AnyDhtHash, attestation_policy: Option<AttestationPolicy>, conductance_policy: Option<ConductancePolicy>, confidence: ConfidenceLevel }` | `PublishedReading { action_hash: ActionHash, entry_hash: EntryHash, health: DiscourseHealth, method: String, method_stated: bool }` — publishes the reading as the CALLING agent's own `Claim`, tagged `discourse-health-reading` |
| `get_cross_domain_critiques` | `membrane: AnyDhtHash` | `Vec<CrossDomainCritique { critique_action: ActionHash, critique_author: AgentPubKey, critiquer_home_domains: Vec<String> }>` |

**A published reading does not breach Invariant 1, and WHO is speaking is the whole reason.** Quantitative Promise Theory's result is that an agent cannot normalise over a population it cannot see, so aggregation requires a NAMED aggregator. The objection to a canonical score is that it claims a view from nowhere; an attributed reading claims a view from somewhere, which makes it a promise like any other and critiquable by anyone who disputes the method — strictly stronger than a protocol-computed score, because a protocol's arithmetic cannot be argued with. **THE DECISION, taken 2026-10-20: two agents MAY publish contradictory readings of the same discourse and this protocol MUST NOT adjudicate between them.** Both stand, both are signed, both are critiquable, and no extern computes a winner. **A conforming implementation MUST carry the method in the published content**, including when no lens was applied — `get_discourse_health` takes lenses the caller aims, so two readings of the same membrane at the same moment legitimately differ, and a figure that does not say which lens produced it is a lensed number presented as a neutral one. That is Invariant 1's objection rebuilt at the publishing layer. **It is a `Claim` rather than a new entry type**, the same call `assert_expertise` makes: a reading inherits the typed `CritiqueMode` machinery Invariant 4 governs, so Methodological critique applies to it exactly as to any other claim. Nothing new to validate, and no `protocol_version` change. **A membrane cannot author anything** — only an agent has a key — so "the membrane's reading" can only mean "this agent's reading OF this membrane"; the membrane is the subject, never the speaker. Any agent may publish a reading of any membrane, which follows from the decision above rather than from permissiveness.

`ConductancePolicy { min_effective_conductance: f32, half_life_secs: Option<u64> }` — see §10.2's `get_effective_conductance` for the arithmetic. `half_life_secs` is the reader's own forgetting schedule: `None` is the protocol default of thirty days and therefore exactly the previous behaviour, and supplying it states *"for the purposes of what I am about to count, connections are stale on this schedule"* — which is what gives the threshold a promiser, per §7's notes on Invariant 1. Zero or negative falls back to the default rather than being refused, because a half-life of zero is a division by zero rather than a fast-forgetting policy. **Two readers using different half-lives get different effective conductances for the same link and neither is wrong**; what stays comparable across readers is what the DHT holds — the base conductance and the `Reinforcement` events. `get_effective_conductance`'s own signature is deliberately unchanged, so the standalone read always uses the default.

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
| `record_twitter_mirror` | `RecordTwitterMirrorInput` (`BridgeRecord` minus `author`) | `ActionHash` — the author is filled from `agent_info()`, so the wire payload is unchanged from before `protocol_version: 8` |
| `get_unbridged_claims` | — | `Vec<UnbridgedRecord { entry_hash: EntryHash, record: Record }>` |
| `get_unbridged_mews` | — | `Vec<UnbridgedRecord>` |
| `import_twitter_reply` | `ImportTwitterReplyInput` (`ExternalCritique` minus `importer`) | `ActionHash` — same arrangement; `author_handle` stays caller-supplied because it cannot be verified, `importer` does not because it can |
| `get_twitter_replies_for_claim` | `claim_hash: EntryHash` | `Vec<Record>` |

### 10.13 Signals
Emitted (not called) — `SignalPayload` variants: `NewMew { mew: Mew, entry_hash: EntryHash, action_hash: ActionHash }`, `NewClaim { claim: Claim, entry_hash: EntryHash, action_hash: ActionHash }`, `NewCritique(Critique)`, `NewRetraction(Retraction)`, `NewBridgeRecord(BridgeRecord)`, `MetabolicTick(MetabolicObservation)`. Consumed by `bridge/src/index.ts` to trigger outbound Twitter posts. **`MetabolicTick` is the only variant not caused by a call** — it is emitted by `metabolic_tick` (§10.14a), which the host runs on its own scheduler, and it carries `MetabolicObservation { at_secs: i64, own_claims: u32, own_critiques: u32, wrote_nothing: bool }`. `wrote_nothing` is carried explicitly rather than left implied: a client is entitled to know the tick that produced the observation changed no state, and an implementation that later DOES write MUST change this field rather than mean something different by the same payload.

### 10.13a Peer signals — the medium (Stage 1)

**ONE entry to open a channel, per agent, once; ZERO per signal thereafter.**
Nothing a signal carries reaches the DHT or either source chain. The one entry
is an unrestricted `CapGrant` on `recv_remote_signal`, which
`send_remote_signal` requires.

**WHY AN EXPLICIT EXTERN AND NOT `init`**, which is what the HDK documents. The
host warns that an `init` callback *"may not happen immediately or ever after
happ installation"*, so a grant created there would exist or not depending on
whether somebody made an unrelated call — and because the host call is
send-and-forget, a signal sent before the grant existed would be dropped in
silence on both ends. Opening the medium is therefore a decision somebody
takes, and its absence is diagnosable.

| Function | Payload | Returns |
|---|---|---|
| `open_signal_channel` | `()` | `SignalChannelTerms` — `granted_to`, `created` (TRUE only on the call that made the grant, so a caller can tell *I opened it* from *it was already open*), `entries_written_to_open: 1`, `entries_written_per_signal: 0`, `chain_length` and `limits`. Idempotent by a chain-local query for the `recv_remote_signal` tag, not by luck. `chain_length` is reported so the declaration and the measurement can be compared to each other rather than trusted |
| `send_peer_signal` | `SendPeerSignalInput { signal: PeerSignal, recipients: Vec<AgentPubKey> }` | `PeerSignalSent { attempted, delivery_confirmed }` — `attempted` is how many recipients the host was ASKED to reach, never how many received. `delivery_confirmed` is **always false by construction**: the host call is non-blocking and reports no failures, so no other value would be truthful |
| `recv_remote_signal` | `PeerSignal` | `()` — the receiving half the HDK requires BY NAME. Emits `SignalPayload::PeerSignal { from, signal }` to this agent's own client, where `from` is `call_info()?.provenance` — the host's answer to *who called me*, never a field the sender supplied. **The parameter is `PeerSignal`, not the `ExternIO` the HDK's own docs give** (`hdk-0.7.0/src/p2p.rs:134`): the host passes `RemoteSignal.signal`'s bytes AS the extern input, so declaring `ExternIO` tries to deserialize a map into a byte array and fails every delivery |

`PeerSignal` is a closed enum carrying **no free text and no timestamp**:
`Saturated { domain, headroom }`, `ClosureDeficit { target, resolved, cited }`,
`Settled { target }`, `ProposingSpecies { name, parent }`. No variant carries a
time because §5.22 records what an author-supplied one is worth to a reader:
nothing. A signal is received in the recipient's present, so the only honest
clock is the recipient's own, applied on arrival.

**THREE LIMITS, NORMATIVE because a signal looks more trustworthy than it is.**

1. **Delivery is unverifiable by the sender.** A caller that needs to know
   something arrived MUST hear back; the absence of a reply means nothing.
2. **The sender is host-verified, the payload is not.** An agent claiming
   `Saturated` may not be, and nothing here can check it.
3. **No friction budget is spent (§6)**, because nothing is written — so a
   modified coordinator can emit without limit. This is `SECURITY.md`'s
   standing hot-swappable-coordinator position, and it is the price of the
   medium being free: rate-limiting a signal would require writing something
   to count it.

**SO SIGNALS ARE HINTS AND MUST NEVER BE EVIDENCE.** Nothing downstream may
treat a received signal as a reason to WRITE, only as a reason to LOOK. A
disposition that writes because a peer said so has made an unauthenticated
assertion load-bearing.

### 10.13b Proprioception — one read of the caller's own state (Stage 2)

**`get_local_tension` makes the graph's own state available as the proximate
cause of the next write.** Luhmann's criterion for an autopoietic system of
communications is that a communication be produced by prior communications
rather than by the environment; until this read existed every Claim was
produced by a human or by something a human triggered. A disposition can now
read its own position and act on that.

| Function | Payload | Returns |
|---|---|---|
| `get_local_tension` | `GetLocalTensionPayload { membrane: ActionHash, conductance_policy: Option<ConductancePolicy> }` | `LocalTension` — four signals bundled into one read, plus what it refuses to be. Writes nothing; no entry type, no link type, no validation rule, so the DNA hash is untouched (§11) |

**IT REPORTS AND MUST NOT DECIDE.** There is no score, no verdict, no
threshold and no field named `healthy` or `stale`. The number that would turn
any of these signals into an action is itself a promise and needs an agent
behind it — the Quantitative Promise Theory argument that retired
`CONDUCTANCE_HALF_LIFE_SECS` as a universal constant (READINESS item 10) —
and that promise has not been made. Every figure is raw and carries its own
denominator. Deciding is the caller's to do.

**CALLER-SCOPED BY CONSTRUCTION, WHICH IS THE INVARIANT 1 DEFENCE.** There is
no `agent` parameter. `observer` comes from `agent_info()`, the counts come
from the caller's own source chain, and closure is computed against the
caller's own local cache. A caller cannot ask for anybody else's tension, so
this cannot become the canonical per-agent scalar over an enumerable agent set
that got the mutual-credit ledger deleted. The answers are caller-scoped and
legitimately differ between observers, exactly as `AttestationPolicy`'s do.

**THE FOUR SIGNALS.**

1. **`closure`** — of every Claim in the domain this observer can read, how
   many citations resolve for it *now*, from local cache only.
   `resolved_locally + deficit == cited_total` always. Observer-relative by
   construction: another agent with a different cache gets a different figure
   and neither is wrong. **Scoped to the domain's claims and not the caller's
   own**, because a deficit over your own claims is near-always zero by
   construction — `validate_claim` calls `must_get_entry` on every evidence
   hash, so each resolved for its author at write time. The quantity that
   means something is the one `PeerSignal::ClosureDeficit` names: what *this*
   observer cannot reach of what somebody else cited.
2. **`ordering`** — `tie_broken` from `order_records` over the caller's own
   Claims and in-domain Critiques: how many points in the order were decided
   by a hash rather than by causality. A disposition about to settle anything
   is entitled to know how arbitrary the sequence is *before* it writes.
   Critiques whose target did not resolve locally are reported in
   `critique_targets_unresolved` rather than dropped, since a `Critique`
   carries no `domain` of its own and can only be placed by its target.
3. **`friction`** — every rationed §6 path with `recent_count`, `limit`,
   `window_secs`, `headroom` and `blocked`, each counted by the same helper
   the corresponding write path's own pre-check calls. `blocked` is true if
   and only if `headroom` is zero, so two callers testing the two fields
   cannot disagree.
4. **`conductance`** — `total_initial` and `total_effective` over the
   caller's own SynapticLinks, under the half-life **the caller promised**.
   `half_life_promised_by_caller` reports whether one was supplied, because a
   reader is entitled to know whether it got its own schedule or the
   protocol's unpromised thirty-day default. Not comparable across policies.

**ARC WIDTH IS ABSENT, AND THE ABSENCE IS A FIELD.** `arc_width` is always
`None`, with `arc_width_absent_because` giving the reason: a coordinator zome
cannot reach it. `AgentInfo` carries only `agent_initial_pubkey` and
`chain_head`, and the HDK exposes no storage-arc call; the figure exists only
as `storageArc` on the admin websocket's `agentInfo` payload, which makes it a
client-side read about the conductor rather than a zome-side read about the
agent. `signals_bundled: 4` and `signals_intended: 5` report the gap as a
number so it cannot rot quietly.

### 10.14 Federation
| Function | Payload | Returns |
|---|---|---|
| `record_federation` | `FederationRecord` | `ActionHash` |
| `get_federation_records_for` | `membrane: AnyDhtHash` | `Vec<Record>` — one-sided: every `FederationRecord` this membrane has itself authored, never anything about whether the remote side has reciprocated |

Two independently-run Holochain networks share no DHT — one cannot query the other's data, so a `FederationRecord` can only ever record what the *local* membrane has declared. Mutual/"federated" status is not a value either network computes or stores; it is derived externally by a bridge process (`federation/federate.mjs`) that connects to both conductors and independently checks both directions — the same correlative-witness shape §2.4/`BridgeRecord` already establishes for the Twitter bridge, applied to a second network instead of a non-Holochain platform. See `federation/README.md` for the verified, live, two-conductor account.


### 10.14a Metabolism (the present tense)

| Function | Payload | Returns |
|---|---|---|
| `start_metabolism` | `()` | `MetabolismTerms { runs_as: AgentPubKey, tick_interval_secs: u64, writes_to_the_dht: bool, spends_friction_budget: bool, stopped_by: String, terms: String }` — schedules `metabolic_tick` on the CALLING agent's chain. Idempotent by the host: if already scheduled, the existing schedule is respected and the call is a noop, and the terms are returned on those calls too. **It returned `()` until 2026-10-21, and that was the whole of its problem**: this is the only consent gesture the protocol has for an unattended process running on the caller's own key, and it said nothing about what it was consenting to. `writes_to_the_dht` and `spends_friction_budget` are **false** in this version by the decision in READINESS item 22 (option (a)), and a version that starts writing **MUST** return `writes_to_the_dht: true` — a visible change to this payload rather than a quiet change in behaviour. The same device as `MetabolicObservation.wrote_nothing`. `scripts/live-verify/metabolism.mjs` asserts the declaration against the behaviour: the terms must say `false` **and** the tick's own chain must not grow across ticks, so a promise that stopped matching reality reds |

`metabolic_tick` is **not** in this table, because it is not callable protocol
surface in the ordinary sense: it is `#[hdk_extern(infallible)]`, takes and
returns only `Option<Schedule>`, and exists so the HOST can run it with no
client and no caller. It is the first such function in this implementation.

**Three properties a conforming implementation MUST preserve, because each one
is load-bearing rather than incidental.**

- **It MUST live in a coordinator zome and MUST NOT be reachable from
  validation.** §5.22 gives the reason: `hdi` exposes no `sys_time` because
  every validating peer must reach the same verdict, so a clock cannot be
  reached from a validator at all. `sys_time` and `schedule` both exist in a
  coordinator, which is what makes this possible there and nowhere else.
- **It runs as the author of the chain it runs for, and the scheduling agent's
  provenance is lost** as soon as the original call returns. So
  `start_metabolism` cannot schedule on anybody else's behalf, and a conforming
  implementation MUST NOT present it as able to.
- **A conforming implementation MUST assume the tick can be triggered at the
  wrong time** — the host's own guidance — and so MUST keep it safe at any
  moment. The implementation here is read-only, which makes that trivially
  true: there is no window in which an extra tick costs anything.

**What it does NOT do, specified because the absence is deliberate.** The tick
writes nothing: its observation is emitted as an ephemeral signal
(§10.13's `MetabolicTick`), touching neither the DHT nor any source chain, so
the record is byte-identical across any number of ticks and no §6 friction
budget is spent. **An autonomous writer is a different thing and is not
specified here.** Under Invariant 6 anything it wrote would be permanent and
un-deletable by anyone, which makes what it should write a governance question
rather than an implementation detail — see §7's note on Invariant 9, which this
mechanism explicitly does NOT close.

### 10.15 Negative-path probers

Two externs exist in order to **fail**, and they are specified here because
they are callable protocol surface: a client can invoke them, so a document
that does not admit they exist is incomplete regardless of what they are for.

| Function | Payload | Returns |
|---|---|---|
| `attempt_unaccountable_membrane` | `Membrane` | `ActionHash` — MUST be refused by `validate_membrane` whenever `required_promises` is empty or the constitution is not the caller's own |
| `attempt_raw_worldline_trace` | `WorldlineTrace` | `ActionHash` — MUST be refused by `validate_worldline_trace` whenever the agent is not the action author, the boundaries are empty, a boundary samples another agent's action, the checksum is not 32 bytes, a boundary's `start_time` exceeds its `end_time`, `expires_at` is not after `created_at`, or `trace_payload` exceeds 64KB |
| `attempt_raw_pre_registration` | `PreRegistration` | `ActionHash` — MUST be refused by `validate_pre_registration` whenever the author is not the action author, the deadline is not after the commitment, or the question does not resolve |
| `attempt_raw_revelation` | `Revelation` | `ActionHash` — MUST be refused by `validate_revelation` whenever the author is not the action author, the commitment does not resolve or is not a `PreRegistration`, the revealer is not the committer, the content does not hash to the sealed commitment, or the deadline has passed |
| `attempt_raw_bridge_record` | `BridgeRecord` | `ActionHash` — MUST be refused by `validate_bridge_record` whenever the author is not the action author, the mirrored target does not resolve, or the loss fields are inconsistent (`excerpt_length` exceeding `original_length`, or a field in both `carried_fields` and `dropped_fields`) |
| `attempt_raw_external_critique` | `ExternalCritique` | `ActionHash` — MUST be refused by `validate_external_critique` whenever the **importer** is not the action author, the content is empty, or the linked claim does not resolve. The rule binds the importer and deliberately **not** `author_handle`, which is an unverifiable string from another platform |
| `attempt_false_domain_index` | `FalseDomainIndexPayload` | `ActionHash` — MUST be refused by link validation when the claim does not declare the domain it is being filed under, or when a third party files another agent's claim |
| `attempt_false_membrane_registry` | `FalseMembraneRegistryPayload` | `ActionHash` — MUST be refused by link validation when a third party indexes another agent's membrane, when the target is not a `Membrane`, or when the base is not the registry anchor. `anchor_override` exists only so that last case can be reached: the honest anchor is computed inside the function, so proving the base is checked needs a way to pass a different one |
| `attempt_false_taxonomy_index` | `FalseTaxonomyIndexPayload` | `ActionHash` — MUST be refused by link validation when the species was proposed by somebody else, when the target is not a `CritiqueSpecies`, or when `anchor_override` puts the base anywhere but the real taxonomy anchor. Added for READINESS item 18, on the same terms as the two probers above: `TaxonomyToSpecies`'s base is a DERIVED anchor, so a caller cannot supply it and `attempt_false_attachment_link` — which knows only the agent and question anchors — cannot reach these three rules at all |
| `attempt_entry_update` | `AttemptEntryUpdatePayload` | `ActionHash` — MUST be refused by validation for every entry type (§5.1, `protocol_version: 9`). Exists because no other extern calls `update_entry`, which is exactly why the gap it probes survived eight versions: a capability unreachable from the tree is untestable from it. The new entry inherits its type from the original action, so a Claim update is probed by handing it a Claim's `ActionHash` |
| `attempt_false_attachment_link` | `FalseAttachmentLinkPayload` | `ActionHash` — MUST be refused by link validation whenever the base is not what the target entry itself names as its subject, or the caller is not that entry's author (§5.19). Covers all nine bound link types through one surface, naming which in `kind`: nine externs would be nine copies of one `create_link` differing by a match arm, and each copy is a protocol surface §9's accounting has to justify. `base`, `target` and `tag` are passed through unchanged, which is what makes a mismatch expressible |

**Why a protocol has functions that must not succeed.** Both bypass a
coordinator-side courtesy check in order to reach validation directly. The
distinction they exist to enforce is the one §5 rests on: a coordinator that
refuses something proves only that *this* coordinator refuses it, while a
custom client can call the host directly. `attempt_unaccountable_membrane`'s
own doc comment records the gap that made it necessary — `validate_membrane`
went without accountability checks while a comment claimed it had them,
because the tests were exercising the courtesy and reporting it as
enforcement.

**These are not an attack surface, and that is a claim with a condition
attached.** Every call a custom client could make through them is rejected by
validation, which is the whole point. If either ever SUCCEEDS on the inputs
above, the property has regressed from validation to coordinator-side
courtesy, and the refusal that the rest of this specification depends on is no
longer being enforced where it is claimed to be. `scripts/live-verify/`
exercises both: `domain-index.mjs` drives three separate poisoning attempts
through `attempt_false_domain_index` and watches each one refused. `scripts/live-verify/attachment-links.mjs` does the same for §5.19's nine link rules through `attempt_false_attachment_link`.
### 10.16 Pre-registration (commit-reveal)

A commitment to a prediction, disclosed later and checkable against what was
committed. The entry types are specified in the integrity zome's own section;
what matters normatively here is that **the denominator is protocol surface,
not a client convention.**

The naive form of this primitive is gameable by selective revelation: commit
many predictions, reveal the ones that came true, stay silent on the rest.
Every reveal verifies and the record is a fabrication. Three properties
therefore MUST hold, and all three are enforced rather than documented:

1. `reveal_deadline` MUST be public at commit time and MUST be later than the
   commitment's own action timestamp, so an unrevealed commitment expires
   **visibly** and a commitment cannot be born already expired.
2. `question` MUST be public at commit time and its action MUST **predate**
   the commitment, so a prediction cannot be re-pointed at a question chosen
   after the outcome is known.
3. A reveal MUST hash to the sealed commitment, MUST be authored by the
   committer, and MUST NOT be accepted after the deadline — a late reveal
   would let an author decide, having seen the outcome, whether a commitment
   counts as revealed or quietly expired.

`get_foresight_record` returns `revealed`, `expired` and `pending` as raw
lists and MUST NOT return a score, a ratio or an ordering. Invariant #1 bars a
canonical comparative score while requiring that raw history stay open and
queryable; the expired list exists to **deflate** a claim of foresight rather
than to rank agents, and a revelation read without it is the laundering above.
Deriving a hit rate is a client's decision to defend, not this protocol's to
bless.

| Function | Payload | Returns |
|---|---|---|
| `pre_register` | `PreRegisterInput` | `ActionHash` — writes the sealed content as a private entry and a public `PreRegistration` carrying its hash, the question and the deadline. The caller supplies `salt`, because a salt generated here would have to be stored in the entry it protects |
| `reveal_pre_registration` | `RevealInput` | `ActionHash` — MUST be refused unless the content hashes to the commitment, the caller is the committer, and the deadline has not passed |
| `get_pre_registrations_for_question` | `ActionHash` | `Vec<Record>` — every commitment made about one question, revealed or not |
| `get_foresight_record` | `AgentPubKey` | `ForesightRecord` — `revealed` / `expired` / `pending`, as lists. Expiry is computed against the reader's clock, since nothing is written when a deadline passes |

## 11. Versioning & Change Process

This document tracks a specific commit of `main` (noted at the top) and is a manually maintained snapshot, honestly labeled as such rather than implied to be self-updating. **One narrow slice of it is now checked automatically, and the boundary is worth stating precisely.** `scripts/check-spec-drift.mjs` compares the `#[hdk_extern]` functions in `dna/coordinator/src/lib.rs` against the functions listed in §10's tables, and fails in both directions: an extern absent from §10 is a callable surface this document does not admit exists, and a §10 row with no extern behind it is worse, because an implementer would write code against a function that is not there. It runs in CI on every pull request.

**That check verifies the function LIST and nothing else.** Most of this document is MUST and SHOULD rules about validation, and nothing compares those to `validate_*`. A green run does not mean this specification is verified, and it must not be cited as if it did. The check also deliberately reads only the tables, never the prose: §10 legitimately names HDK builtins, admin calls, and functions that were specified once and removed — recording a removal is honesty, and a checker that flagged it as drift would push this document toward forgetting its own history. A change to any entry type, link type, validation rule, rate limit, invariant, HRR encoding, N4L vocabulary, or zome function signature in `dna/` or `n4l/arrows-epistemic.sst` **SHOULD** be accompanied by a corresponding update to this document in the same change, the same discipline this codebase already applies to keeping `README.md`'s own code-walkthrough sections current with what actually shipped.

Forward-compatibility within the protocol itself is currently handled locally, not globally: `WorldlineTrace.binding_key`/`NeighborhoodBinding.binding_key` (§8) are the only versioned wire values today, each guarding its own narrow scheme. There is no protocol-wide version number, feature-negotiation mechanism, or migration path defined yet — a genuinely breaking change (e.g. a new required field on an existing entry type) would currently just be a new commit with no compatibility story for DHT data written under the old shape. This is a real, open gap, not a hidden one.

### 11.1 What a change actually costs on this substrate

This subsection is **descriptive, not aspirational**: it states what Holochain 0.7 does, which constrains every versioning scheme that could be chosen. It is here because the gap above cannot be closed sensibly without it, and because the usual toolkit for protocol versioning turns out not to apply.

**The DNA hash is computed over the integrity manifest, and nothing else.** `dna/dna.yaml`'s `integrity:` block is exactly `network_seed`, `properties` and the integrity zomes; `DnaModifiers` in `holochain_integrity_types` states in its own doc comment that the modifiers "are included in the DNA hash computation", and the network seed's doc adds that the DNA hash "in turn determines the network peers and the DHT, meaning that only peers with the same DNA hash of a shared DNA participate in the same network and co-create the DHT."

Three consequences follow, and they are hard constraints rather than preferences:

| Change | DNA hash | What it means |
|---|---|---|
| Any edit to the integrity zome — an entry struct field, a link type, a validation rule | **changes** | A different network. Old and new peers never gossip. No in-place migration exists. |
| Any edit to `network_seed` or `properties` | **changes** | Same as above, deliberately: this is the supported way to fork a network on purpose. |
| Any edit to a coordinator zome — a new function, a changed signature, a fixed courtesy check | **unchanged** | Hot-swappable on a running conductor via the admin `update_coordinators` call. Not a protocol change at all. |

**The uncomfortable corollary is that this substrate has no such thing as an additive, backward-compatible entry change.** Adding an `Option<T>` field to an existing entry type — the canonical non-breaking change in almost every other protocol — edits the integrity zome, so it changes the DNA hash, so it forks the network exactly as violently as removing a required field would. Nothing about the field being optional makes any difference.

That has a direct bearing on what a version number could be for. **A Holochain network is always running exactly one version of its integrity zome, by construction**, because the zome *is* the network's identity. There can be no version skew between validating peers, and therefore:

- a per-entry version discriminant cannot enable in-network coexistence of two entry shapes, because the shapes are fixed by the one integrity zome every peer runs;
- feature negotiation between peers has nothing to negotiate;
- permissive "accept unknown fields" validation buys no compatibility, and costs the thing this protocol is *for* — §5 and §7 are only worth anything because validation is exhaustive. An unvalidated extension region inside an entry would be where the invariants quietly stop applying.

So the question a versioning scheme has to answer here is **not** "how do two versions interoperate" — they cannot. It is **"what happens at a fork"**: how a network states which protocol it is running, and what, if anything, carries across when a new one replaces it. Both halves are open; `README.md` §9 records the decision and what each option costs.

One narrower point is settled and worth stating, because it is the only genuinely non-breaking change class available: **coordinator-only changes are free.** Everything in §5.21 ("coordinator courtesies that are NOT validation rules"), every zome function signature in §10, and every read path can change without touching the network's identity. A change confined there **SHOULD** be recognised as such rather than batched into an integrity change that forks the network for no reason.

### 11.2 The declared protocol version

**Implemented and enforced.** `dna/dna.yaml` sets `properties.protocol_version`, and the integrity zome carries the same number as `PROTOCOL_VERSION`.

- The version **MUST** equal the value the integrity zome implements. Validation refuses every `CreateEntry` and `CreateLink` op when the two disagree, naming both numbers, so a DNA packed with one edited and not the other is inert rather than silently misdeclared. Absent or unparseable `properties` fail identically — a DNA that declares no version cannot be written to at all.
- The version **MUST** be bumped by any change to the integrity zome that alters what is accepted or what an entry means. It **MUST NOT** be bumped for a coordinator-only change, which is not a protocol change (§11.1).
- `get_protocol_version` (§10) reads it, along with the version the running zome implements and the DNA hash. It is a pure `dna_info()` read: no DHT access, and it answers on an empty network, which is when the question is actually asked.

The version is **not** a compatibility mechanism, and §11.1 explains why there can be no such thing here. Its purpose is that a fork is legible: two DNA hashes differing only by this number are provably a protocol change rather than two hashes nobody can tell apart. Because `properties` is inside the hash, the declaration is one no peer on the network can disagree with.

The gate is scoped to ops that write protocol data, deliberately. A blanket check over the whole validation callback also refuses capability grants — which are source-chain writes — leaving a misdeclaring network unable to answer any call at all, including the one that would explain the problem. Refusing the protocol while remaining answerable is the intended behaviour: `scripts/live-verify/protocol-version.mjs` checks both halves against a running conductor.

### 11.3 Migration across a fork

**Not implemented.** This subsection is the contract a migration would have to satisfy, recorded now because §11.1's constraints do not change and the requirements are knowable without the tooling. It is stated as requirements on a conforming migration, not as a description of code that exists.

A network at version *n* and one at version *n+1* are different DHTs with no shared data (§11.1). "Migration" therefore means **re-publishing** into the new network, and the hard constraint is §5.2: an entry's `author` field must equal the real authoring action's author, checked independently by every validator. That single rule decides the shape of everything below.

- A migration **MUST NOT** re-publish another agent's entries under the migrator's key. It cannot: §5.2 refuses it, and no exemption may be added for migration — an exemption would let anyone forge authorship by declaring it a migration. **Only an agent can migrate its own entries.**
- A migration is therefore **necessarily partial and voluntary**. A network at *n+1* will hold the entries of whichever agents chose to re-publish, and no others. Any design that assumes a complete carry-over is wrong on this substrate.
**`protocol_version: 10` (2026-10-21) — `Critique.past_cone`.** The first bump since 9's update refusal, and taken deliberately while **nobody had installed the hApp**, which is the only moment a fork is free. It adds one `#[serde(default)]` field, so every existing caller keeps working and an omitted cone records empty — honest about having recorded nothing, which is not a claim about having seen nothing. **The ratchet applies to this field specifically and sharply:** a past cone is a list of ActionHashes, and the rule immediately below says hashes MUST NOT be carried across a fork. So **cone history cannot survive a migration** and resets at every future bump — Landers & Kramer's *"a level lost under migration is never regained"* (arXiv 2605.09114), instantiated. That is an argument for batching future integrity changes hard, not an argument against this one: the cost of forking is lowest now and rises with every cone recorded.

**`protocol_version: 11` (2026-10-22) — settlement.** Three entry types (`Assessment`, `SettlementPolicy`, `SettlementStatus`) and two link types, taken while nobody had installed and a fork is still free. **The notable rule is that validation RECOMPUTES a settlement**: it is a pure function of (policy, inputs), both fetchable by every peer, so `validate_settlement_status` performs the arithmetic and refuses a state that does not follow. That makes settlement **enforcement rather than a reader's courtesy** — the first aggregate in this protocol with that property. **Two aggregators may still disagree legitimately** by choosing different input sets, which is scope rather than arithmetic and is visible because `inputs` is published. **The ratchet applies here too**: `SettlementStatus.inputs` and `Assessment.past_cone` are lists of ActionHashes, so neither survives a migration under the rule below.

- Entry hashes **MUST** be expected to change. Anything that references an entry by hash (§5.3 referential integrity, `evidence_hashes`, `source_mew`, `target_claim`, and every link) must be re-resolved against the new network's hashes, not carried across. A migration that preserves a hash from the old network is either wrong or has recreated a byte-identical entry by coincidence.
- Original timestamps **MUST** be preserved in the entry's own `timestamp` field, which is data rather than action metadata. The new action's timestamp is necessarily the migration's, and that divergence is a fact about the fork, not something to hide.
- The old network's data **MUST NOT** be presented as having been validated by the new one. It was validated under version *n*'s rules; if *n+1* validates differently, the re-published entry is accepted or refused on *n+1*'s terms and no other.
- What can be carried faithfully is what the export layers already produce: the N4L export (§9) and the gateway's JSON-LD both walk this data and neither depends on Holochain hashes.

**The open question this left** was whether provenance across a fork should be recorded *in* the protocol — an entry type saying "this is a re-publication of a claim I made on network X" — or left entirely outside it. Recording it is honest and makes a migrated network self-describing; it is also a new entry type whose only purpose is to talk about a network the reader cannot query, and §5.3 could not check its reference.

**That question was already answered by this protocol twice before it was asked, and the answer is in-protocol.** Every objection above is an objection to something §2.11 and §2.12 already do and already document as an accepted limit:

- `BridgeRecord.twitter_id` and `BridgeRecord.platform` reference a platform this DHT cannot query at all, and §2.11 states the asymmetric-witness limitation rather than treating it as disqualifying.
- `FederationRecord` goes further and is the exact shape needed here: it references **a different Holochain network**, by `remote_network_label` and `remote_membrane_ref`, which its own definition describes as "an opaque, out-of-band reference — never a real Holochain hash on THIS DHT". One-sided by construction, because this DHT cannot see the remote network's data, with the reciprocity question pushed to an external witness that has queried both sides.

Fork provenance is `FederationRecord`'s situation with the remote network being this network's own predecessor. **So the pattern to use is the correlative witness, not a new question:** an entry recording "this is a re-publication of something I authored on network X", where X is an opaque label, the old entry's reference is opaque, and neither is validatable here. §5.3 not being able to check the reference is the *specified* behaviour of this pattern rather than a defect in it, and the alternative — provenance kept entirely outside the protocol — is strictly worse than a documented one-sided witness, because it makes a migrated network silent about being migrated.

**Two constraints this inherits and MUST keep.** The entry's `author` MUST be the migrating agent, per §5.2, so a provenance record can only ever be self-asserted — the same rule that makes migration necessarily voluntary and partial. And a conforming implementation MUST NOT present such a record as evidence that the referenced entry existed or was valid; it is a statement by one agent about a network the reader cannot query, which is exactly what §2.11's asymmetric-witness paragraph already says of its own fields.

**Still not implemented, deliberately, and the reason is fork economics rather than the decision.** Adding the entry type is an integrity change, so it forks the network again (§11.1) — and forking to ship a type no agent yet writes would spend the network's identity on nothing. The sequencing that follows: this entry type rides along with the migration tooling that would use it, so one fork carries both. §11.1's rule that a coordinator-only change SHOULD NOT be batched into an integrity change has a converse, and this is it.
