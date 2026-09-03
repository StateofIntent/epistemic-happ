use hdi::prelude::*;

// ============================================================================
// ENTRY TYPES
// ============================================================================

/// A lightweight, tweet-sized entry for raw bridge input.
/// Acts as the raw stimulus before it is transduced into a fully-typed Claim.
#[hdk_entry_helper]
#[derive(Clone, PartialEq)] // Debug is already provided by hdk_entry_helper —
                             // re-deriving it here conflicted (E0119).
pub struct Mew {
    pub content: String,
    pub author: AgentPubKey,
    pub timestamp: u64,
    pub reply_to: Option<EntryHash>,
    pub semantic_tags: Vec<String>,
    pub linked_claim: Option<EntryHash>, // If this Mew was promoted to a Claim
}

/// A claim is a knowledge assertion with full dimensional coordinates.
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct Claim {
    pub content: String,
    pub domain: String,
    pub author: AgentPubKey,
    pub timestamp: u64,
    pub evidence_hashes: Vec<EntryHash>,
    pub confidence: ConfidenceLevel,
    pub semantic_tags: Vec<String>,
    pub source_mew: Option<EntryHash>, // If promoted from a Mew
}

/// A retraction is not a deletion. It is a new entry that says:
/// "I no longer stand by this claim, and here is why."
/// This strengthens the graph by adding provenance, not removing it.
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct Retraction {
    pub target_claim: EntryHash,
    pub reason: String,
    pub replacement_claim: Option<EntryHash>, // Optional: what I believe now
    pub author: AgentPubKey,
    pub timestamp: u64,
}

/// What kind of node `Critique.target` points at. A fractal antenna
/// resonates across scales because the same geometry repeats at every
/// scale; the epistemic analogue is that the critique operation should
/// be identical at every level of the graph, not just "Claim." This is
/// the scale-invariance piece the Fractal Impedance Matching README
/// section flagged as not yet built — now built.
///
/// This field exists ONLY because `ToN4L::to_n4l` is a pure function
/// with no DHT access: it cannot call `get()` to discover what
/// `self.target` actually is, so it needs to be told, in the entry
/// itself, which alias prefix to resolve the cross-reference under.
/// `validate_critique` independently re-derives the target's real type
/// from the DHT and rejects a Critique whose claimed `target_type`
/// doesn't match reality — so this is authoritative, not just advisory,
/// the same way AgentToMembrane's tag-encoded agent is cross-checked
/// against the real action author rather than trusted at face value.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum CritiqueTargetType {
    Claim,
    Critique,
    Constitution,
    Membrane,
    CritiqueSpecies,
}

/// Typed critique modes - the "receptor specificity" of epistemic binding.
///
/// `target` is scale-invariant: it can point at a Claim, another
/// Critique (critique-of-critique — the recursion needed for the graph
/// to correct itself), a Constitution (closing the assert_expertise
/// circle: expertise is a Claim, claims are critiquable, and now so are
/// the promises judging them), a Membrane, or a CritiqueSpecies (arguing
/// with a bad taxonomy instead of only being able to not-adopt it).
/// Previously this was `target_claim: EntryHash`, Claim-only.
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct Critique {
    pub target: AnyLinkableHash,
    pub target_type: CritiqueTargetType,
    pub critique_mode: CritiqueMode,
    pub content: String,
    pub author: AgentPubKey,
    pub timestamp: u64,
    pub replication_attempted: bool,
    pub evidence_hashes: Vec<EntryHash>,
    pub species: Option<EntryHash>, // Optional: which CritiqueSpecies taxonomy this uses
}

/// Recognized classes of bad-faith structural/behavioral pattern — the
/// "antigens" this protocol's agents have actually named. Deliberately a
/// fixed, small, typed enum rather than free text, the same "typed, not
/// flattened" discipline CritiqueMode already applies to disagreement
/// (Invariant #4): "spam" as an open string would be exactly the kind of
/// untyped, unaccountable label this codebase avoids elsewhere. Each
/// variant names a specific pattern this project's own design
/// discussions have already grounded (see README §2.3's spam-defense/
/// sybil-farming discussion for SpamFlood and SybilCluster specifically)
/// — matching §2.6's naming discipline of not dressing a mechanism in
/// vocabulary it hasn't earned.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum AntibodyPatternKind {
    SpamFlood,               // rapid, low-effort, repetitive content
    SybilCluster,             // a self-reinforcing ring with no real
                               // resonance from outside itself
    Plagiarism,               // content copied without attribution
    CoordinatedManipulation,  // multiple agents acting in concert to
                               // distort a graph region
    Impersonation,            // content misrepresenting its own
                               // provenance or authorship
}

/// An agent's own recognition that some entry exhibits a known
/// bad-faith pattern — the "antibody" half of the immune-system
/// metaphor (§4.2). Deliberately NOT the same thing as a `Critique`:
/// a Critique is an ordinary, expected part of discourse, adjudicating
/// a claim's *content* (is it true, well-reasoned, well-evidenced —
/// Invariant #4's five typed receptor modes); an AntibodyPattern
/// instead flags a *structural or behavioral* pattern — the entry (or
/// the activity around it) looking like spam, a sybil ring, plagiarism,
/// and so on, independent of whether its content is right or wrong.
/// Conflating the two would blur a distinction this protocol needs to
/// keep: disagreeing with a claim is not an accusation of bad faith,
/// and an accusation of bad faith is not, by itself, a claim that the
/// content is false.
///
/// `target`/`target_type` reuse `AnyLinkableHash`/`CritiqueTargetType`
/// exactly as `Critique` does — an AntibodyPattern can point at anything
/// a Critique can (Claim, Critique, Constitution, Membrane, or
/// CritiqueSpecies), cross-checked against the DHT the same
/// unspoofable way (see `validate_antibody_pattern`). Deliberately
/// CANNOT target an `AgentPubKey` directly: an antibody that names an
/// agent, rather than a specific entry that agent authored, would
/// function as exactly the canonical, comparative reputation mark on an
/// *identity* that Invariant #1 rules out — the same reasoning
/// §2.3 already gives for why identity creation itself was never made
/// to cost something. `rationale` is required non-empty, the same
/// accountability requirement `Critique.content` already carries: an
/// AntibodyPattern must say why, not just flag silently.
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct AntibodyPattern {
    pub target: AnyLinkableHash,
    pub target_type: CritiqueTargetType,
    pub kind: AntibodyPatternKind,
    pub rationale: String,
    pub author: AgentPubKey,
    pub timestamp: u64,
}

/// Evidence entries link to external or internal supporting data.
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct Evidence {
    pub content: String,
    pub evidence_type: EvidenceType,
    pub source_url: Option<String>,
    pub author: AgentPubKey,
    pub timestamp: u64,
}

/// A domain membrane - a region of shared promise geometry.
///
/// `constitution` is required (not Option): a membrane must be founded
/// by an agent who has already published what they promise. Before this
/// field existed, membrane creation checked only `domain.non_empty()`,
/// making it free to spawn unlimited membranes with no commitment behind
/// them — see validate_membrane, which also requires `required_promises`
/// to be non-empty. This doesn't make membrane creation costly in any
/// cryptoeconomic sense (there's still no token/burn layer — see the
/// SWO pillar's "Token/cost layer" roadmap item), only accountable:
/// creating a membrane means articulating what it demands, on the
/// record, not just naming a domain string.
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct Membrane {
    pub domain: String,
    pub description: String,
    pub required_promises: Vec<String>,
    pub validation_rules_hash: Option<EntryHash>,
    pub creator: AgentPubKey,
    pub created_at: u64,
    pub constitution: ActionHash, // creator's own published Constitution
}

/// A membrane's own witness that it recognizes a specific membrane on a
/// DIFFERENT Holochain network — the correlative-witness pattern
/// (README §2.4, `BridgeRecord` above) applied to network-to-network
/// federation instead of Holochain-to-Twitter. The two networks share
/// no DHT, so the remote side can only ever be an opaque, out-of-band
/// reference — never a real Holochain hash on THIS DHT, the same
/// honest limitation `BridgeRecord.twitter_id` already has for Twitter.
///
/// One-sided by construction: this entry records only that the LOCAL
/// membrane recognizes the remote one. It says nothing about whether
/// the remote side has reciprocated — this DHT has no way to see the
/// remote network's own data, so mutual/"federated" status can only be
/// confirmed by an external witness that has actually queried both
/// sides (see `federation/`'s bridge service) — the same reasoning
/// `AttestationPolicy` already applies to never computing a signal this
/// DHT can't independently verify.
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct FederationRecord {
    pub local_membrane: EntryHash,
    pub remote_network_label: String,
    pub remote_membrane_ref: String,
    pub author: AgentPubKey,
    pub created_at: u64,
}



/// An agent's constitution - their voluntary promises.
/// Makes Promise Theory explicit in the DHT, not just implicit in validation rules.
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct Constitution {
    pub agent: AgentPubKey,
    pub promises: Vec<Promise>,
    pub conditions: Vec<Condition>,
    pub published_at: u64,
    pub expires_at: Option<u64>,
}

/// A single promise made by an agent.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Promise {
    pub action: String,        // e.g., "validate_claims", "bridge_to_twitter"
    pub domain: String,        // e.g., "LumbarRehab"
    pub modality: Option<CritiqueMode>, // Optional: which receptor type
}

/// Conditions under which a promise applies.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Condition {
    pub condition_type: String, // e.g., "if_evidence_present", "if_domain_match"
    pub parameters: Vec<String>,
}

/// Evolving critique taxonomy - "speciation" of receptor types.
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct CritiqueSpecies {
    pub name: String,
    pub parent_species: Option<EntryHash>,
    pub required_evidence: Vec<String>,
    pub proposer: AgentPubKey,
    pub created_at: u64,
    // adoption_count intentionally removed: it was a plain u32 the
    // proposer set to any value at creation time, with no validation
    // and no increment mechanism anywhere in the codebase — a free,
    // self-declared number, not a derived signal. See coordinator's
    // get_critique_species_adoption_count for the real, query-time
    // replacement, which counts actual CritiqueToSpecies links.
}

/// Holographic index of an agent's source chain - HRR compatibility hook.
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct WorldlineTrace {
    pub agent: AgentPubKey,
    pub period_boundaries: Vec<PeriodBoundary>,
    pub expertise_tags: Vec<String>,
    pub trace_payload: Option<Vec<u8>>,
    pub binding_key: Option<Vec<u8>>,
    pub checksum: Vec<u8>,
    pub created_at: u64,
    pub expires_at: Option<u64>,
}

/// A single "door" into an agent's source chain history.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PeriodBoundary {
    pub start_time: u64,
    pub end_time: u64,
    pub sample_action: ActionHash,
    pub domain_tag: String,
    pub entry_count: u32,
}

/// Correlative witness record — durable, one-sided proof that a Holochain
/// entry and a Twitter post co-occurred at a specific time. This is NOT a
/// mutual contract: Twitter has no awareness of or obligation toward this
/// record. If the tweet is deleted, this entry is what survives — evidence
/// the correlation existed, not an enforceable claim that it must persist.
/// Do not delete or "simplify away" this entry type; it is the only place
/// the correlation is durably witnessed.
///
/// `carried_fields`/`dropped_fields`/`original_length`/`excerpt_length`
/// record WHAT WAS LOST making this crossing, honestly, as a set
/// difference — not a fabricated scalar like a "reflection coefficient"
/// (see the README's Fractal Impedance Matching section, which names
/// exactly this kind of decorative-not-real number as the EVA-era
/// mistake not to repeat: `TwitterMirror.information_loss: f64` there
/// was a made-up number nothing actually computed). This makes
/// Invariant #7 ("the bridge must preserve dimensionality") auditable
/// instead of merely asserted: a reader can see exactly which named
/// fields of the original Mew/Claim made it into the tweet and which
/// didn't, not just that some unspecified truncation happened.
///
/// Populated by the bridge service (bridge/src/index.ts) when it
/// actually builds the tweet text — the DHT has no independent way to
/// verify these lists are *accurate* to what was really dropped, the
/// same asymmetric-witness limitation as the rest of BridgeRecord
/// (Twitter never confirms anything either). validate_bridge_record
/// (see bridge_record_loss_fields_consistent) checks only what IS
/// independently derivable from the entry's own data — excerpt_length
/// <= original_length, and no field name appearing in both lists — not
/// whether the lists are honest.
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct BridgeRecord {
    pub mew_hash: EntryHash,
    pub twitter_id: String,
    pub platform: String,
    pub mirrored_at: u64,
    pub carried_fields: Vec<String>,
    pub dropped_fields: Vec<String>,
    pub original_length: u32,
    pub excerpt_length: u32,
}

/// External critique imported from Twitter.
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct ExternalCritique {
    pub twitter_id: String,
    pub author_handle: String,
    pub content: String,
    pub linked_holochain_claim: EntryHash,
    pub imported_at: u64,
}

// ============================================================================
// ENUMS
// ============================================================================

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum ConfidenceLevel {
    Hypothetical,
    Tentative,
    Moderate,
    High,
    Certain,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum CritiqueMode {
    Experiential,      // "I tried this and..."
    Methodological,    // "The study design is flawed because..."
    Logical,           // "This contradicts itself because..."
    Evidential,        // "This source doesn't say what you claim..."
    Phenomenological,  // "My subjective experience differs because..."
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum EvidenceType {
    Study,
    CaseReport,
    Video,
    Image,
    Text,
    Measurement,
}

// ============================================================================
// LINK TYPES
// ============================================================================

#[hdk_link_types]
pub enum LinkTypes {
    // Core epistemic links
    MewToClaim,           // Promotion: Mew → Claim
    ClaimToRetraction,    // A claim may have retractions (not deletions)
    TargetToCritique,      // Any critiquable node (Claim, Critique,
                            // Constitution, Membrane, CritiqueSpecies) →
                            // a Critique of it. One link type reused
                            // across all five target kinds — Holochain
                            // links don't care what entry type their base
                            // is, so this doesn't need one variant per
                            // target kind. Was ClaimToCritique before
                            // Critique.target became scale-invariant;
                            // this supersedes the never-wired-up
                            // MembraneToCritique stub too.
    CritiqueToEvidence,
    ClaimToEvidence,
    CritiqueToSpecies,     // Critique → the CritiqueSpecies taxonomy it uses;
                           // real link creation, replacing the old
                           // self-declared adoption_count field

    // Membrane topology
    MembraneToClaim,
    AgentToMembrane,       // Membrane -> agent who joined it. See
                            // join_membrane/get_membrane_members in the
                            // coordinator zome and this file's
                            // AgentToMembrane validation below. Real
                            // membership is what AttestationGrant's
                            // tenure check is built on (below).
    AttestationGrant,       // Membrane -> candidate agent. An explicit,
                            // costed act of vouching, separate from (and
                            // additional to) the implicit attestation the
                            // coordinator zome's AttestationPolicy
                            // machinery already derives from SynapticLink
                            // activity (see direct_attesters_of, which
                            // unions both sources). Where SynapticLink-
                            // derived attestation is a free side effect of
                            // critiquing, this one carries its own two
                            // real costs — tenure (see this file's
                            // AttestationGrant validation) and a budget
                            // (only so many grants per window) — applied
                            // to the right to confer rather than to the
                            // act of critiquing itself, per the "Where
                            // real cost can live" refinement.

    // Agent identity
    AgentToConstitution,  // Agent → their published constitution
    AgentToWorldlineTrace,
    AgentToClaim,
    AgentToMew,           // Agent → their raw Mews

    // Bridge links
    ClaimToBridgeRecord,
    ClaimToExternalCritique,
    MewToBridgeRecord,    // Raw Mew → proof it was tweeted

    // Critique species evolution
    SpeciesToParent,
    SpeciesToCritique,

    // Immune system
    TargetToAntibody,      // Any critiquable node (same five kinds
                            // Critique's target can point at) → an
                            // AntibodyPattern flagging it. One link type
                            // reused across all five target kinds, the
                            // same reasoning TargetToCritique already
                            // documents — Holochain's link model doesn't
                            // care what entry type a link's base is.

    // Federation
    MembraneToFederationRecord,  // Membrane -> a FederationRecord it
                                  // authored, recognizing a membrane on
                                  // a different network. See
                                  // FederationRecord's own doc comment —
                                  // one-sided per link, mutuality is
                                  // confirmed externally, not derivable
                                  // from this DHT alone.

    // Synaptic / Hebbian links
    SynapticLink,
    Reinforcement,          // SynapticLink's own ActionHash -> reinforcing
                            // agent. The Hebbian half of "conductance
                            // atrophy": a SynapticLink's f32 conductance
                            // in its LinkTag is the immutable INITIAL
                            // value (LinkTags can't be mutated); what
                            // actually matters over time is computed at
                            // read time in the coordinator zome
                            // (get_effective_conductance) as base
                            // conductance decayed since creation, plus
                            // one decaying contribution per Reinforcement
                            // event. A synapse nobody ever reinforces
                            // fades toward zero without being deleted or
                            // blocked — Invariant #6 (atrophy, not
                            // deletion) and #9 (death is required)
                            // applied to links specifically, and the
                            // honest containment-not-prevention answer to
                            // the sybil-farming discussion in the README:
                            // a flood of un-reinforced SynapticLinks
                            // stays fully present in the record but
                            // becomes invisible to conductance-weighted
                            // traversal.
}

// ============================================================================
// ENTRY DEFS
// ============================================================================

// hdk_entry_defs was this version's older name for hdk_entry_types;
// #[unit_enum(...)] stays a plain attribute paired directly with it (not
// wrapped in a separate #[derive(UnitEnum)], which conflicts with what
// hdk_entry_types already generates) — confirmed against a real build.
#[hdk_entry_types]
#[unit_enum(UnitEntryTypes)]
pub enum EntryTypes {
    Mew(Mew),
    Claim(Claim),
    Retraction(Retraction),
    Critique(Critique),
    Evidence(Evidence),
    Membrane(Membrane),
    Constitution(Constitution),
    CritiqueSpecies(CritiqueSpecies),
    WorldlineTrace(WorldlineTrace),
    BridgeRecord(BridgeRecord),
    ExternalCritique(ExternalCritique),
    AntibodyPattern(AntibodyPattern),
    FederationRecord(FederationRecord),
}

// ============================================================================
// VALIDATION
// ============================================================================

#[hdk_extern]
pub fn validate(op: Op) -> ExternResult<ValidateCallbackResult> {
    match op.flattened::<EntryTypes, LinkTypes>()? {
        FlatOp::StoreEntry(store_entry) => validate_store_entry(store_entry),
        FlatOp::RegisterUpdate(_) => Ok(ValidateCallbackResult::Valid),
        FlatOp::RegisterDelete(_) => Ok(ValidateCallbackResult::Invalid(
            "Deletion is not permitted. Entries are immutable.".into()
        )),
        // RegisterCreateLink/RegisterDeleteLink are struct variants in
        // this hdi version, not tuple variants — destructure the fields
        // validate_create_link actually needs rather than passing the
        // whole variant through.
        FlatOp::RegisterCreateLink { base_address, target_address, tag, link_type, action, .. } =>
            validate_create_link(base_address, target_address, tag, link_type, action),
        FlatOp::RegisterDeleteLink { .. } => Ok(ValidateCallbackResult::Valid),
        _ => Ok(ValidateCallbackResult::Valid),
    }
}

fn validate_store_entry(entry: OpEntry<EntryTypes>) -> ExternResult<ValidateCallbackResult> {
    match entry {
        OpEntry::CreateEntry { app_entry, action } => {
            match app_entry {
                EntryTypes::Mew(mew) => validate_mew(&mew, &action),
                EntryTypes::Claim(claim) => validate_claim(&claim, &action),
                EntryTypes::Retraction(retraction) => validate_retraction(&retraction, &action),
                EntryTypes::Critique(critique) => validate_critique(&critique, &action),
                EntryTypes::Evidence(evidence) => validate_evidence(&evidence, &action),
                EntryTypes::Membrane(membrane) => validate_membrane(&membrane, &action),
                EntryTypes::Constitution(constitution) => validate_constitution(&constitution, &action),
                EntryTypes::CritiqueSpecies(species) => validate_critique_species(&species, &action),
                EntryTypes::WorldlineTrace(trace) => validate_worldline_trace(&trace, &action),
                EntryTypes::BridgeRecord(record) => validate_bridge_record(&record, &action),
                EntryTypes::ExternalCritique(ext) => validate_external_critique(&ext, &action),
                EntryTypes::AntibodyPattern(pattern) => validate_antibody_pattern(&pattern, &action),
                EntryTypes::FederationRecord(record) => validate_federation_record(&record, &action),
            }
        }
        _ => Ok(ValidateCallbackResult::Valid),
    }
}

// NOTE ON `action: &Create` (not `&EntryCreationAction`) BELOW: every
// validator here takes the concrete `Create` action struct, matching
// what `OpEntry::CreateEntry { app_entry, action }` actually hands over
// in this hdi version — `Create` exposes `author`/`timestamp`/
// `prev_action` as plain fields (same as `CreateLink` does further
// below), unlike the `EntryCreationAction` union type, which needs
// `.author()` etc. as methods to unify across Create/Update. The
// original code assumed `EntryCreationAction` throughout; every
// `action.author` field access below was already correct once the
// parameter type matches what's actually available — confirmed against
// a real build, not guessed.

// --- Mew Validation ---
fn validate_mew(mew: &Mew, action: &Create) -> ExternResult<ValidateCallbackResult> {
    if mew.author != action.author {
        return Ok(ValidateCallbackResult::Invalid("Mew author must match action author.".into()));
    }
    if mew.content.is_empty() {
        return Ok(ValidateCallbackResult::Invalid("Mew content cannot be empty.".into()));
    }
    // Mew content should be tweet-sized (<= 280 chars) for bridge compatibility.
    if mew.content.len() > 560 {
        return Ok(ValidateCallbackResult::Invalid(
            "Mew content exceeds 560 characters (2x tweet size for unicode safety).".into()
        ));
    }
    // If linked_claim is present, it must exist. linked_claim is an
    // EntryHash (content-addressed reference), so this checks existence
    // via must_get_entry — must_get_valid_record wants an ActionHash
    // specifically and would not accept this.
    if let Some(claim_hash) = &mew.linked_claim {
        if must_get_entry(claim_hash.clone()).is_err() {
            return Ok(ValidateCallbackResult::Invalid("Mew linked_claim not found.".into()));
        }
    }
    Ok(ValidateCallbackResult::Valid)
}

// --- Claim Validation ---
fn validate_claim(claim: &Claim, action: &Create) -> ExternResult<ValidateCallbackResult> {
    if claim.author != action.author {
        return Ok(ValidateCallbackResult::Invalid("Claim author must match action author.".into()));
    }
    if claim.content.is_empty() {
        return Ok(ValidateCallbackResult::Invalid("Claim content cannot be empty.".into()));
    }
    if claim.domain.is_empty() {
        return Ok(ValidateCallbackResult::Invalid("Claim domain cannot be empty.".into()));
    }
    for hash in &claim.evidence_hashes {
        if must_get_entry(hash.clone()).is_err() {
            return Ok(ValidateCallbackResult::Invalid("Claim evidence hash not found.".into()));
        }
    }
    // NOTE ON THE ASYMMETRY WITH Critique: a Claim's evidence_hashes are
    // checked to resolve and a Critique's are not, which reads as an
    // oversight and is not one. get_grounding_path RECURSES through a
    // claim's evidence_hashes, so a hash resolving to nothing would be a
    // dead end mid-traversal; this check keeps that walk well-formed. It
    // is deliberately weak in the way that purpose implies — the hash
    // must resolve to SOME entry, not to Evidence — so that a claim may
    // cite another claim and grounding can keep walking back. Nothing
    // traverses a Critique's evidence_hashes, so nothing needs the same
    // guarantee, and adding must_get_entry there would defer validation
    // of the protocol's most frequent act until everything it cites had
    // propagated. See SPEC.md §5.3.

    // If source_mew is present, it must be a valid Mew.
    if let Some(mew_hash) = &claim.source_mew {
        if must_get_entry(mew_hash.clone()).is_err() {
            return Ok(ValidateCallbackResult::Invalid("Claim source_mew not found.".into()));
        }
    }
    Ok(ValidateCallbackResult::Valid)
}

// --- Retraction Validation ---
fn validate_retraction(retraction: &Retraction, action: &Create) -> ExternResult<ValidateCallbackResult> {
    if retraction.author != action.author {
        return Ok(ValidateCallbackResult::Invalid("Retraction author must match action author.".into()));
    }
    // Target claim must exist.
    if must_get_entry(retraction.target_claim.clone()).is_err() {
        return Ok(ValidateCallbackResult::Invalid("Retraction target claim not found.".into()));
    }
    if retraction.reason.is_empty() {
        return Ok(ValidateCallbackResult::Invalid("Retraction reason cannot be empty.".into()));
    }
    // If replacement_claim is present, it must exist.
    if let Some(replacement) = &retraction.replacement_claim {
        if must_get_entry(replacement.clone()).is_err() {
            return Ok(ValidateCallbackResult::Invalid("Retraction replacement_claim not found.".into()));
        }
    }
    Ok(ValidateCallbackResult::Valid)
}

// --- Critique Validation ---
//
// SWO TEMPORAL FRICTION ON CRITIQUE CREATION ITSELF: create_critique (the
// coordinator zome) already creates a SynapticLink for every Critique,
// which is already friction-limited by validate_create_link below — but
// that's an indirect, bypassable protection: a custom client could call
// create_entry for a Critique directly, skipping create_critique (and
// therefore the SynapticLink it would have made) entirely. The check
// below closes that gap by enforcing friction on the Critique entry's
// own creation, independent of whether a SynapticLink accompanies it.
//
// GLOBAL PER-AGENT, NOT PER-DOMAIN: correctly bucketing by domain here
// would mean resolving each historical Critique's target's domain
// during this walk — an extra fetch per candidate action found — real
// added validation cost for a fairness refinement (so one agent's
// activity in domain A doesn't eat into their budget in domain B), not
// for the core security property (bounding how fast one agent can flood
// critiques at all). Deferred; this cap is global across all domains,
// same shape as SynapticLink's.
//
// See count_recent_actions_since_checkpoint (below, shared with
// SynapticLink's check) for the checkpoint-bounding mechanism and its
// verification-status caveat, which applies here unchanged.
const CRITIQUE_WINDOW_SECS_VALIDATION: i64 = 3600;
const CRITIQUE_MAX_PER_WINDOW_VALIDATION: usize = 20; // must match coordinator's limit

fn validate_critique(critique: &Critique, action: &Create) -> ExternResult<ValidateCallbackResult> {
    if critique.author != action.author {
        return Ok(ValidateCallbackResult::Invalid("Critique author must match action author.".into()));
    }

    // The target must exist, and its real type must match what the
    // author claimed in target_type — this can't be spoofed, the same
    // way AgentToMembrane's tag-encoded agent can't be (see that
    // validation for the identical pattern). All five valid target
    // kinds (Claim, Critique, Constitution, Membrane, CritiqueSpecies)
    // are entries, so target must downcast to an EntryHash; an Agent or
    // External hash is rejected outright — nothing critiquable is
    // addressed that way.
    let target_hash = EntryHash::try_from(critique.target.clone()).map_err(|_| {
        wasm_error!(WasmErrorInner::Guest("Critique target must be an EntryHash-shaped reference.".into()))
    })?;
    // to_app_option is a method on RecordEntry, not the bare Entry
    // must_get_entry hands back — wrap it, matching how
    // bridge_link_type_for (coordinator zome) probes entry types.
    let target_entry = RecordEntry::Present(
        must_get_entry(target_hash)
            .map_err(|_| wasm_error!(WasmErrorInner::Guest("Critique target not found.".into())))?
            .into_content(),
    );

    // Probed the same way bridge_link_type_for probes entry types in the
    // coordinator zome: `.ok().flatten()`, not `?` — a deserialize
    // failure here means "not this type, try the next candidate," not a
    // real error to propagate.
    let actual_target_type = if target_entry.to_app_option::<Claim>().ok().flatten().is_some() {
        Some(CritiqueTargetType::Claim)
    } else if target_entry.to_app_option::<Critique>().ok().flatten().is_some() {
        Some(CritiqueTargetType::Critique)
    } else if target_entry.to_app_option::<Constitution>().ok().flatten().is_some() {
        Some(CritiqueTargetType::Constitution)
    } else if target_entry.to_app_option::<Membrane>().ok().flatten().is_some() {
        Some(CritiqueTargetType::Membrane)
    } else if target_entry.to_app_option::<CritiqueSpecies>().ok().flatten().is_some() {
        Some(CritiqueTargetType::CritiqueSpecies)
    } else {
        None
    };

    match actual_target_type {
        Some(ref t) if *t == critique.target_type => {}
        Some(_) => {
            return Ok(ValidateCallbackResult::Invalid(
                "Critique target_type does not match what the target actually is.".into()
            ));
        }
        None => {
            return Ok(ValidateCallbackResult::Invalid(
                "Critique target is not a critiquable entry type.".into()
            ));
        }
    }

    if critique.content.is_empty() {
        return Ok(ValidateCallbackResult::Invalid("Critique content cannot be empty.".into()));
    }
    if let Some(ref species_hash) = critique.species {
        if must_get_entry(species_hash.clone()).is_err() {
            return Ok(ValidateCallbackResult::Invalid("Critique species reference not found.".into()));
        }
    }

    // prev_action is a plain field on Create (every non-Dna action has
    // one) — no Option to unwrap, unlike what an earlier draft of this
    // function assumed.
    let window_start = action.timestamp.as_micros() - CRITIQUE_WINDOW_SECS_VALIDATION * 1_000_000;
    let critique_entry_type = EntryType::App(
        UnitEntryTypes::Critique.try_into().map_err(|_| {
            wasm_error!(WasmErrorInner::Guest("Could not resolve Critique entry type.".into()))
        })?
    );
    let recent_count = count_recent_actions_since_checkpoint(
        action.author.clone(),
        action.prev_action.clone(),
        window_start,
        move |a| matches!(a, Action::Create(create) if create.entry_type == critique_entry_type),
    )?;

    if recent_count >= CRITIQUE_MAX_PER_WINDOW_VALIDATION {
        return Ok(ValidateCallbackResult::Invalid(format!(
            "SWO temporal friction: author has {} Critiques in the last {} seconds \
             (limit {}). This is enforced by DHT validation, not a client-side courtesy.",
            recent_count, CRITIQUE_WINDOW_SECS_VALIDATION, CRITIQUE_MAX_PER_WINDOW_VALIDATION
        )));
    }

    Ok(ValidateCallbackResult::Valid)
}

// --- AntibodyPattern Validation ---
//
// Mirrors validate_critique's shape closely — same target/target_type
// cross-check (unspoofable the same way), same non-empty-accountability
// requirement (rationale in place of content), same SWO temporal
// friction pattern via count_recent_actions_since_checkpoint. An
// AntibodyPattern is a distinct entry type from Critique (see that
// struct's own doc comment for why), but nothing about validating it
// needs to be — the two are structurally the same shape of "typed,
// accountable, targeted, rate-limited claim about another entry."
const ANTIBODY_PATTERN_WINDOW_SECS_VALIDATION: i64 = 3600;
const ANTIBODY_PATTERN_MAX_PER_WINDOW_VALIDATION: usize = 20; // must match coordinator's limit

fn validate_antibody_pattern(pattern: &AntibodyPattern, action: &Create) -> ExternResult<ValidateCallbackResult> {
    if pattern.author != action.author {
        return Ok(ValidateCallbackResult::Invalid("AntibodyPattern author must match action author.".into()));
    }

    // Same unspoofable cross-check validate_critique already uses: the
    // target must exist, and its real DHT-derived type must match what
    // the author claimed. All five valid target kinds are entries (never
    // an Agent or External hash — see AntibodyPattern's own doc comment
    // on why an agent is deliberately not a valid target).
    let target_hash = EntryHash::try_from(pattern.target.clone()).map_err(|_| {
        wasm_error!(WasmErrorInner::Guest("AntibodyPattern target must be an EntryHash-shaped reference.".into()))
    })?;
    let target_entry = RecordEntry::Present(
        must_get_entry(target_hash)
            .map_err(|_| wasm_error!(WasmErrorInner::Guest("AntibodyPattern target not found.".into())))?
            .into_content(),
    );

    let actual_target_type = if target_entry.to_app_option::<Claim>().ok().flatten().is_some() {
        Some(CritiqueTargetType::Claim)
    } else if target_entry.to_app_option::<Critique>().ok().flatten().is_some() {
        Some(CritiqueTargetType::Critique)
    } else if target_entry.to_app_option::<Constitution>().ok().flatten().is_some() {
        Some(CritiqueTargetType::Constitution)
    } else if target_entry.to_app_option::<Membrane>().ok().flatten().is_some() {
        Some(CritiqueTargetType::Membrane)
    } else if target_entry.to_app_option::<CritiqueSpecies>().ok().flatten().is_some() {
        Some(CritiqueTargetType::CritiqueSpecies)
    } else {
        None
    };

    match actual_target_type {
        Some(ref t) if *t == pattern.target_type => {}
        Some(_) => {
            return Ok(ValidateCallbackResult::Invalid(
                "AntibodyPattern target_type does not match what the target actually is.".into()
            ));
        }
        None => {
            return Ok(ValidateCallbackResult::Invalid(
                "AntibodyPattern target is not a critiquable entry type.".into()
            ));
        }
    }

    if pattern.rationale.is_empty() {
        return Ok(ValidateCallbackResult::Invalid("AntibodyPattern rationale cannot be empty.".into()));
    }

    let window_start = action.timestamp.as_micros() - ANTIBODY_PATTERN_WINDOW_SECS_VALIDATION * 1_000_000;
    let antibody_entry_type = EntryType::App(
        UnitEntryTypes::AntibodyPattern.try_into().map_err(|_| {
            wasm_error!(WasmErrorInner::Guest("Could not resolve AntibodyPattern entry type.".into()))
        })?
    );
    let recent_count = count_recent_actions_since_checkpoint(
        action.author.clone(),
        action.prev_action.clone(),
        window_start,
        move |a| matches!(a, Action::Create(create) if create.entry_type == antibody_entry_type),
    )?;

    if recent_count >= ANTIBODY_PATTERN_MAX_PER_WINDOW_VALIDATION {
        return Ok(ValidateCallbackResult::Invalid(format!(
            "SWO temporal friction: author has {} AntibodyPatterns in the last {} seconds \
             (limit {}). This is enforced by DHT validation, not a client-side courtesy.",
            recent_count, ANTIBODY_PATTERN_WINDOW_SECS_VALIDATION, ANTIBODY_PATTERN_MAX_PER_WINDOW_VALIDATION
        )));
    }

    Ok(ValidateCallbackResult::Valid)
}

// --- Evidence Validation ---
fn validate_evidence(evidence: &Evidence, action: &Create) -> ExternResult<ValidateCallbackResult> {
    if evidence.author != action.author {
        return Ok(ValidateCallbackResult::Invalid("Evidence author must match action author.".into()));
    }
    if evidence.content.is_empty() {
        return Ok(ValidateCallbackResult::Invalid("Evidence content cannot be empty.".into()));
    }
    Ok(ValidateCallbackResult::Valid)
}

// --- Membrane Validation ---
fn validate_membrane(membrane: &Membrane, action: &Create) -> ExternResult<ValidateCallbackResult> {
    if membrane.creator != action.author {
        return Ok(ValidateCallbackResult::Invalid("Membrane creator must match action author.".into()));
    }
    if membrane.domain.is_empty() {
        return Ok(ValidateCallbackResult::Invalid("Membrane domain cannot be empty.".into()));
    }

    // ACCOUNTABILITY, ACTUALLY ENFORCED. Founding a domain here was made
    // accountable rather than costly (README §2.6): instead of charging
    // a fee, a founder must have published their own Constitution and
    // must state what the domain demands of its participants.
    //
    // Until this was added, none of that was enforced DHT-side. The
    // coordinator's create_membrane checked all three and its comment
    // claimed to be "mirroring validate_membrane's DHT-enforced rule
    // (the real enforcement layer, unbypassable by a custom client)" —
    // and this function checked neither the constitution nor the
    // promises, so a client bypassing the coordinator could found a
    // domain with no stated demands and a constitution hash pointing at
    // nothing. The accountability was a coordinator-side courtesy while
    // being documented as an invariant. Same shape as the burn tier's
    // own false claim: a pre-check asserting a validation twin that did
    // not exist.
    //
    // must_get_valid_record is the right primitive here for the reason
    // the friction checks already use it: it is a DETERMINISTIC
    // dependency fetch, so every validating peer resolves the same
    // constitution or defers, rather than disagreeing based on what each
    // happens to have gossiped.
    if membrane.required_promises.is_empty() {
        return Ok(ValidateCallbackResult::Invalid(
            "Membrane must declare at least one required_promise — a domain states what it \
             demands of its participants rather than charging them to enter.".into()
        ));
    }

    let record = must_get_valid_record(membrane.constitution.clone())?;
    let constitution: Option<Constitution> = record.entry().to_app_option()
        .map_err(|e| wasm_error!(WasmErrorInner::Guest(format!("{:?}", e))))?;
    let Some(constitution) = constitution else {
        return Ok(ValidateCallbackResult::Invalid(
            "Membrane's constitution hash does not resolve to a Constitution entry.".into()
        ));
    };
    if constitution.agent != membrane.creator {
        return Ok(ValidateCallbackResult::Invalid(
            "Membrane's constitution must be the creator's own published Constitution — a founder \
             is accountable under promises they made themselves.".into()
        ));
    }

    Ok(ValidateCallbackResult::Valid)
}

// --- FederationRecord Validation ---
//
// Only a membrane's own founding creator may declare federation on its
// behalf — the same governance principle that already gates who can
// found the membrane at all (validate_membrane above). Not something a
// member, or an unrelated agent, can do unilaterally: federation is a
// membrane-level commitment, not an individual one. No SWO temporal
// friction here (unlike Critique/AntibodyPattern/SynapticLink) — a
// membrane creator declaring federation with several other networks in
// quick succession isn't the flooding-pattern friction exists to slow.
fn validate_federation_record(record: &FederationRecord, action: &Create) -> ExternResult<ValidateCallbackResult> {
    if record.author != action.author {
        return Ok(ValidateCallbackResult::Invalid("FederationRecord author must match action author.".into()));
    }

    let membrane_entry = match must_get_entry(record.local_membrane.clone()) {
        Ok(entry) => entry.into_content(),
        Err(_) => return Ok(ValidateCallbackResult::Invalid("FederationRecord local_membrane not found.".into())),
    };
    let membrane: Membrane = match RecordEntry::Present(membrane_entry).to_app_option() {
        Ok(Some(m)) => m,
        Ok(None) | Err(_) => {
            return Ok(ValidateCallbackResult::Invalid("FederationRecord local_membrane is not a Membrane entry.".into()));
        }
    };
    if membrane.creator != record.author {
        return Ok(ValidateCallbackResult::Invalid(
            "FederationRecord can only be authored by local_membrane's own creator.".into()
        ));
    }

    if record.remote_network_label.is_empty() {
        return Ok(ValidateCallbackResult::Invalid("FederationRecord remote_network_label cannot be empty.".into()));
    }
    if record.remote_membrane_ref.is_empty() {
        return Ok(ValidateCallbackResult::Invalid("FederationRecord remote_membrane_ref cannot be empty.".into()));
    }

    Ok(ValidateCallbackResult::Valid)
}

// --- Constitution Validation ---
fn validate_constitution(constitution: &Constitution, action: &Create) -> ExternResult<ValidateCallbackResult> {
    if constitution.agent != action.author {
        return Ok(ValidateCallbackResult::Invalid("Constitution agent must match action author.".into()));
    }
    if constitution.promises.is_empty() {
        return Ok(ValidateCallbackResult::Invalid("Constitution must contain at least one promise.".into()));
    }
    for promise in &constitution.promises {
        if promise.action.is_empty() || promise.domain.is_empty() {
            return Ok(ValidateCallbackResult::Invalid("Promise action and domain cannot be empty.".into()));
        }
    }
    if let Some(expires) = constitution.expires_at {
        if expires <= constitution.published_at {
            return Ok(ValidateCallbackResult::Invalid("expires_at must be > published_at.".into()));
        }
    }
    Ok(ValidateCallbackResult::Valid)
}

// --- CritiqueSpecies Validation ---
fn validate_critique_species(species: &CritiqueSpecies, action: &Create) -> ExternResult<ValidateCallbackResult> {
    if species.proposer != action.author {
        return Ok(ValidateCallbackResult::Invalid("CritiqueSpecies proposer must match action author.".into()));
    }
    if species.name.is_empty() {
        return Ok(ValidateCallbackResult::Invalid("CritiqueSpecies name cannot be empty.".into()));
    }
    if let Some(parent) = &species.parent_species {
        if must_get_entry(parent.clone()).is_err() {
            return Ok(ValidateCallbackResult::Invalid("Parent CritiqueSpecies not found.".into()));
        }
    }
    Ok(ValidateCallbackResult::Valid)
}

// --- WorldlineTrace Validation ---
fn validate_worldline_trace(trace: &WorldlineTrace, action: &Create) -> ExternResult<ValidateCallbackResult> {
    if trace.agent != action.author {
        return Ok(ValidateCallbackResult::Invalid("WorldlineTrace agent must match action author.".into()));
    }
    if trace.period_boundaries.is_empty() {
        return Ok(ValidateCallbackResult::Invalid("WorldlineTrace must have at least one period boundary.".into()));
    }
    for boundary in &trace.period_boundaries {
        // sample_action is an ActionHash, so must_get_valid_record (which
        // wants exactly that type) is correct here unchanged — unlike
        // every EntryHash-typed reference above, which needed
        // must_get_entry instead.
        match must_get_valid_record(boundary.sample_action.clone()) {
            Ok(record) => {
                if *record.action().author() != trace.agent {
                    return Ok(ValidateCallbackResult::Invalid("PeriodBoundary sample_action must be authored by trace agent.".into()));
                }
            }
            Err(_) => {
                return Ok(ValidateCallbackResult::Invalid("PeriodBoundary sample_action not found.".into()));
            }
        }
    }
    if trace.checksum.len() != 32 {
        return Ok(ValidateCallbackResult::Invalid("Checksum must be 32 bytes.".into()));
    }
    for boundary in &trace.period_boundaries {
        if boundary.start_time > boundary.end_time {
            return Ok(ValidateCallbackResult::Invalid("PeriodBoundary start_time must be <= end_time.".into()));
        }
    }
    if let Some(expires) = trace.expires_at {
        if expires <= trace.created_at {
            return Ok(ValidateCallbackResult::Invalid("expires_at must be > created_at.".into()));
        }
    }
    if let Some(ref payload) = trace.trace_payload {
        if payload.len() > 65_536 {
            return Ok(ValidateCallbackResult::Invalid("trace_payload exceeds 64KB limit.".into()));
        }
    }
    Ok(ValidateCallbackResult::Valid)
}

// --- BridgeRecord Validation ---
/// The two BridgeRecord loss-tracking constraints that are checkable from
/// the entry's own data alone, independent of any DHT lookup — see
/// BridgeRecord's own doc comment for why these are the only two checks
/// possible (the lists' actual accuracy to what was really dropped can't
/// be independently verified; only their internal consistency can).
/// Pure — no host calls — so it's directly unit-testable, the same split
/// used for bridge_link_type_for and the coordinator zome's other
/// extracted pure cores.
fn bridge_record_loss_fields_consistent(record: &BridgeRecord) -> Result<(), &'static str> {
    if record.excerpt_length > record.original_length {
        return Err("excerpt_length cannot exceed original_length");
    }
    if record.carried_fields.iter().any(|f| record.dropped_fields.contains(f)) {
        return Err("a field cannot be listed in both carried_fields and dropped_fields");
    }
    Ok(())
}

fn validate_bridge_record(record: &BridgeRecord, _action: &Create) -> ExternResult<ValidateCallbackResult> {
    if must_get_entry(record.mew_hash.clone()).is_err() {
        return Ok(ValidateCallbackResult::Invalid("BridgeRecord target not found.".into()));
    }
    if let Err(msg) = bridge_record_loss_fields_consistent(record) {
        return Ok(ValidateCallbackResult::Invalid(format!("BridgeRecord {}.", msg)));
    }
    Ok(ValidateCallbackResult::Valid)
}

// --- ExternalCritique Validation ---
fn validate_external_critique(ext: &ExternalCritique, _action: &Create) -> ExternResult<ValidateCallbackResult> {
    if ext.content.is_empty() {
        return Ok(ValidateCallbackResult::Invalid("ExternalCritique content cannot be empty.".into()));
    }
    if must_get_entry(ext.linked_holochain_claim.clone()).is_err() {
        return Ok(ValidateCallbackResult::Invalid("ExternalCritique linked claim not found.".into()));
    }
    Ok(ValidateCallbackResult::Valid)
}

// --- Link Validation ---
//
// SynapticLink creation is subject to SWO-style temporal friction: this
// is the real enforcement layer (see coordinator's SWO TEMPORAL FRICTION
// section for the paired fast pre-check). Unlike a coordinator-side
// check, this runs on every validating peer via must_get_agent_activity,
// which independently re-derives the author's recent activity from the
// DHT rather than trusting whatever the author's own client reported —
// so it can't be bypassed by a client that skips the coordinator function.
//
// CHECKPOINT BOUNDING: rather than always walking a flat, arbitrary
// number of past actions, this first does a small scan to find the
// author's most recent WorldlineTrace entry (a checkpoint they publish
// themselves, see generate_worldline_trace) and, if one exists within
// reach, bounds the real friction-counting walk to only the activity
// since that checkpoint via ChainFilter::until. This is a genuine use of
// infrastructure the schema already has, not a placeholder — but it is a
// heuristic optimization, not a cryptographic guarantee: the
// checkpoint's timestamp/position is trusted as an honest marker of
// "this agent's own chain, up to here," the same way any other
// must_get_agent_activity result is trusted (peers already trust chain
// data returned this way for every other check in this file). If no
// checkpoint is found within the initial scan (e.g. a new agent, or one
// who has never called generate_worldline_trace), this falls back to
// the original flat cap + time-window filter as a safety net — an
// agent who never checkpoints still gets bounded, capped validation,
// just less tightly bounded than one who does. Agents are incentivized
// to checkpoint periodically both for worldline discoverability (the
// original purpose) and now for cheaper validation of their own future
// actions.
const SYNAPTIC_LINK_WINDOW_SECS_VALIDATION: i64 = 3600;
const SYNAPTIC_LINK_MAX_PER_WINDOW_VALIDATION: usize = 20; // must match coordinator's limit
const CHECKPOINT_SCAN_CAP: u32 = 50; // small first-pass scan to look for a recent checkpoint
const FALLBACK_SCAN_CAP: u32 = 200; // safety net when no checkpoint is found

// Reinforcement gets its own, separate friction budget from
// SynapticLink's — reinforcing is a cheaper, more casual act ("I
// resonate with this") than authoring a new critique/claim connection,
// so it's given more headroom, but it's still friction-limited: without
// this, an agent (or a sybil farm) could mass-reinforce their own
// SynapticLinks to keep conductance artificially high forever, which
// would undermine the entire point of computing conductance from real
// reinforcement activity.
const REINFORCEMENT_WINDOW_SECS_VALIDATION: i64 = 3600;
const REINFORCEMENT_MAX_PER_WINDOW_VALIDATION: usize = 40; // must match coordinator's limit

// AttestationGrant's two costs. TENURE is a flat "you must have been a
// member of this membrane for at least this long" bar — 30 days is a
// placeholder scale (long enough that a sybil farm can't self-certify its
// own puppets on day one), not a value derived from anything; tunable.
// BUDGET is a rolling-window cap on how many grants one agent can issue —
// a week/5 is deliberately tighter than SynapticLink's hour/20: vouching
// for a new agent is meant to be a rarer, more deliberate act than
// critiquing, so it gets a smaller, slower budget, not a bigger one.
const ATTESTATION_GRANT_MIN_TENURE_SECS_VALIDATION: i64 = 30 * 24 * 3600;
const ATTESTATION_GRANT_WINDOW_SECS_VALIDATION: i64 = 7 * 24 * 3600;
const ATTESTATION_GRANT_MAX_PER_WINDOW_VALIDATION: usize = 5; // must match coordinator's limit

// REMOVED: the burn-to-extend-friction tier, and with it the whole
// mutual-credit ledger it was the only consumer of.
//
// SynapticLink creation was once free below 20, purchasable up to a
// ceiling of 30 against verified CreditBurns, and refused at 30. Driving
// it against a real conductor established that no honest client could
// reach the paid tier — create_critique is the only way to create a
// SynapticLink, Critique creation carries its own hard 20/hour cap with
// no burn tier, and that cap is checked first — while the one client
// that COULD reach it, by hand-crafting CreateLink actions, got ten
// extra links for burns that nothing funds, since no balance check was
// ever implemented (an earlier version of this note said a balance is
// unenforceable on an agent-centric DHT — overstated; countersigning
// made every transfer chain-local, so what was missing was a bound on
// the fold, not the possibility of one). A plain hard limit is stricter
// against that client as well as simpler.
//
// The ledger (MutualCreditTransfer, CreditBurn, countersigning,
// get_credit_balance) was then removed too. It had no other consumer,
// and get_credit_balance was a canonical per-agent scalar that any
// client could enumerate via get_membrane_members and sort — Invariant
// #1's leaderboard, preserved only by the protocol declining to build
// it rather than by construction.
//
// A successor was proposed and then also rejected: non-transferable
// regenerating capacity, one per-agent budget spent at differing rates
// by differing acts. It would have dissolved the ledger's problems
// entirely — no transfers, so no double-spend, no global balance, and
// no need to answer questions about other agents at all — and the
// biology argued for it, since cells do not trade ATP and ATP crossing
// a membrane becomes signal rather than energy.
//
// It was not built because the question it depended on was answered and
// the answer was no: no act needs to cost more than another in a way
// the separate caps in this file cannot already express. AttestationGrant
// at 5/week plus a 30-day tenure bar against Reinforcement at 40/hour is
// already a ~1000x differential. What unification would add is
// substitutability — unspent allowance for one act becoming extra
// allowance for another — and that is a defect here, not a feature:
// these caps do not ration a shared resource, they each bound a distinct
// flooding surface, so one budget makes every bound its own limit plus
// whatever the agent declined to spend elsewhere. That is the burn
// tier's failure shape again.
//
// The cost model is flat per-act caps plus accountability
// (Constitution/required_promises) plus vouching (AttestationGrant) —
// the model that already existed. See
// docs/metabolic-biosignalling-currency-brief.md.

/// Pure arithmetic core of AttestationGrant's tenure check: has enough
/// time elapsed between the referenced AgentToMembrane join action and
/// this grant action for the join to satisfy the required minimum
/// tenure? Split out from the validation branch below (which also needs
/// several host-call-dependent structural checks — real record type,
/// matching author, matching base — that can't be tested this way) so
/// at least the timing arithmetic itself is directly unit-testable, the
/// same split used for bridge_record_loss_fields_consistent above.
fn tenure_satisfied(join_timestamp_micros: i64, grant_timestamp_micros: i64, min_tenure_secs: i64) -> bool {
    join_timestamp_micros <= grant_timestamp_micros - min_tenure_secs * 1_000_000
}

/// Shared core of the checkpoint-bounded chain scan: returns `author`'s
/// own activity items since `prev_action`, at or after `window_start`
/// (microseconds), that satisfy `matches` — bounded by their most
/// recent WorldlineTrace checkpoint if one is found within a small
/// first-pass scan, falling back to a flat safety cap otherwise.
/// Extracted so SynapticLink's and Critique's temporal friction checks
/// share one implementation of the checkpoint-bounding mechanism instead
/// of two copies that could drift.
fn count_recent_actions_since_checkpoint(
    author: AgentPubKey,
    prev_action: ActionHash,
    window_start: i64,
    matches: impl Fn(&Action) -> bool,
) -> ExternResult<usize> {
    let worldline_entry_type = EntryType::App(
        UnitEntryTypes::WorldlineTrace.try_into().map_err(|_| {
            wasm_error!(WasmErrorInner::Guest("Could not resolve WorldlineTrace entry type.".into()))
        })?
    );

    // Phase 1: small scan to look for a recent checkpoint.
    let scan_filter = ChainFilter::new(prev_action.clone()).take(CHECKPOINT_SCAN_CAP);
    let scan_activity = must_get_agent_activity(author.clone(), scan_filter)?;

    let checkpoint_hash = scan_activity.iter().find_map(|item| {
        match item.action.action() {
            Action::Create(create) if create.entry_type == worldline_entry_type => {
                Some(item.action.action_address().clone())
            }
            _ => None,
        }
    });

    // Phase 2: bound the real friction-counting walk to activity since
    // the checkpoint if one was found; otherwise fall back to a flat
    // safety-cap scan.
    let activity = match checkpoint_hash {
        Some(cp_hash) => {
            let bounded_filter = ChainFilter::new(prev_action).until(cp_hash);
            must_get_agent_activity(author, bounded_filter)?
        }
        None => {
            let fallback_filter = ChainFilter::new(prev_action).take(FALLBACK_SCAN_CAP);
            must_get_agent_activity(author, fallback_filter)?
        }
    };

    Ok(activity
        .into_iter()
        .filter(|item| {
            let a = item.action.action();
            a.timestamp().as_micros() >= window_start && matches(a)
        })
        .count())
}

fn validate_create_link(
    base_address: AnyLinkableHash,
    target_address: AnyLinkableHash,
    tag: LinkTag,
    link_type: LinkTypes,
    action: CreateLink,
) -> ExternResult<ValidateCallbackResult> {
    if link_type == LinkTypes::SynapticLink {
        if tag.0.len() < 4 {
            return Ok(ValidateCallbackResult::Invalid(
                "SynapticLink tag must contain at least 4 bytes (f32 conductance).".into()
            ));
        }

        let window_start = action.timestamp.as_micros() - SYNAPTIC_LINK_WINDOW_SECS_VALIDATION * 1_000_000;
        let recent_count = count_recent_actions_since_checkpoint(
            action.author.clone(),
            action.prev_action.clone(),
            window_start,
            |a| matches!(a, Action::CreateLink(cl) if cl.link_type == action.link_type),
        )?;

        // A plain, absolute limit. There is deliberately no way to buy
        // past this with burned credit — see the REMOVED note beside
        // this zome's friction constants for why the burn tier that
        // used to sit here made the limit weaker rather than stronger.
        if recent_count >= SYNAPTIC_LINK_MAX_PER_WINDOW_VALIDATION {
            return Ok(ValidateCallbackResult::Invalid(format!(
                "SWO temporal friction: author has {} SynapticLinks in the last {} seconds (limit {}). \
                 This is an absolute limit, enforced by DHT validation, not a client-side courtesy.",
                recent_count, SYNAPTIC_LINK_WINDOW_SECS_VALIDATION, SYNAPTIC_LINK_MAX_PER_WINDOW_VALIDATION
            )));
        }
    } else if link_type == LinkTypes::AgentToMembrane {
        // Membership is a voluntary promise (Promise Theory) — only the
        // agent themselves can record that they joined, never a third
        // party on their behalf. The tag carries the raw 36-byte
        // AgentPubKey the coordinator's join_membrane encoded (see that
        // function); it must both be well-formed AND match the action's
        // real author.
        if tag.0.len() != 36 {
            return Ok(ValidateCallbackResult::Invalid(
                "AgentToMembrane tag must be exactly 36 bytes (a raw AgentPubKey).".into()
            ));
        }
        let claimed_agent = AgentPubKey::from_raw_36(tag.0.clone());
        if claimed_agent != action.author {
            return Ok(ValidateCallbackResult::Invalid(
                "AgentToMembrane links can only be created by the agent joining, not on \
                 someone else's behalf.".into()
            ));
        }
        // The base must be a real Membrane. base_address arrives as
        // AnyLinkableHash (link bases can point at entries, actions,
        // agents, or externals in general) — join_membrane always links
        // from a Membrane's EntryHash specifically, so downcasting to
        // EntryHash should always succeed for a legitimately-created
        // link; a base that doesn't downcast is itself a validation
        // failure, not something to ignore.
        match EntryHash::try_from(base_address) {
            Ok(membrane_hash) => {
                if must_get_entry(membrane_hash).is_err() {
                    return Ok(ValidateCallbackResult::Invalid(
                        "AgentToMembrane base is not a valid Membrane.".into()
                    ));
                }
            }
            Err(_) => {
                return Ok(ValidateCallbackResult::Invalid(
                    "AgentToMembrane base must be an EntryHash.".into()
                ));
            }
        }
    } else if link_type == LinkTypes::Reinforcement {
        // "I resonate with this connection" — recorded the same
        // voluntary-promise way AgentToMembrane records membership: only
        // the reinforcing agent can create this on their own behalf, the
        // target must be exactly them, never a third party.
        let claimed_reinforcer = AgentPubKey::try_from(target_address.clone()).map_err(|_| {
            wasm_error!(WasmErrorInner::Guest("Reinforcement target must be an AgentPubKey.".into()))
        })?;
        if claimed_reinforcer != action.author {
            return Ok(ValidateCallbackResult::Invalid(
                "Reinforcement links can only be created by the agent doing the reinforcing, \
                 not on someone else's behalf.".into()
            ));
        }

        // The base must be a real SynapticLink's own ActionHash — you
        // can only reinforce an actual synaptic connection, not
        // arbitrary DHT addresses.
        let synaptic_link_type: ScopedLinkType = LinkTypes::SynapticLink.try_into().map_err(|_| {
            wasm_error!(WasmErrorInner::Guest("Could not resolve SynapticLink type.".into()))
        })?;
        let base_action_hash = ActionHash::try_from(base_address).map_err(|_| {
            wasm_error!(WasmErrorInner::Guest("Reinforcement base must be an ActionHash.".into()))
        })?;
        let base_record = must_get_valid_record(base_action_hash).map_err(|_| {
            wasm_error!(WasmErrorInner::Guest("Reinforcement base record not found.".into()))
        })?;
        let is_synaptic_link = matches!(
            base_record.action(),
            Action::CreateLink(cl)
                if cl.zome_index == synaptic_link_type.zome_index
                    && cl.link_type == synaptic_link_type.zome_type
        );
        if !is_synaptic_link {
            return Ok(ValidateCallbackResult::Invalid(
                "Reinforcement base is not a SynapticLink creation.".into()
            ));
        }

        // Reinforcement's own SWO temporal friction — see the constants'
        // comment above for why this needs its own budget, separate from
        // SynapticLink's.
        let window_start = action.timestamp.as_micros() - REINFORCEMENT_WINDOW_SECS_VALIDATION * 1_000_000;
        let recent_count = count_recent_actions_since_checkpoint(
            action.author.clone(),
            action.prev_action.clone(),
            window_start,
            |a| matches!(a, Action::CreateLink(cl) if cl.link_type == action.link_type),
        )?;
        if recent_count >= REINFORCEMENT_MAX_PER_WINDOW_VALIDATION {
            return Ok(ValidateCallbackResult::Invalid(format!(
                "SWO temporal friction: author has {} Reinforcements in the last {} seconds \
                 (limit {}). This is enforced by DHT validation, not a client-side courtesy.",
                recent_count, REINFORCEMENT_WINDOW_SECS_VALIDATION, REINFORCEMENT_MAX_PER_WINDOW_VALIDATION
            )));
        }
    } else if link_type == LinkTypes::AttestationGrant {
        // TENURE: rather than having the validator independently DISCOVER
        // the granter's join event via a bounded scan (the SynapticLink
        // checkpoint pattern above), the tag carries the granter's own
        // AgentToMembrane join action's raw ActionHash, self-supplied —
        // then every property of it is independently verified below. This
        // is the same shape as assert_expertise's self-supplied
        // WorldlineTrace hash: nothing is gained by lying about it,
        // because a forged or irrelevant hash simply fails verification,
        // and it's one fetch instead of a scan.
        if tag.0.len() != 36 {
            return Ok(ValidateCallbackResult::Invalid(
                "AttestationGrant tag must be exactly 36 bytes (a raw ActionHash).".into()
            ));
        }
        let claimed_membership_action = ActionHash::from_raw_36(tag.0.clone());
        let membership_record = match must_get_valid_record(claimed_membership_action) {
            Ok(r) => r,
            Err(_) => {
                return Ok(ValidateCallbackResult::Invalid(
                    "AttestationGrant's referenced membership action not found.".into()
                ));
            }
        };

        let agent_to_membrane_type: ScopedLinkType = LinkTypes::AgentToMembrane.try_into().map_err(|_| {
            wasm_error!(WasmErrorInner::Guest("Could not resolve AgentToMembrane type.".into()))
        })?;

        let tenure_ok = match membership_record.action() {
            Action::CreateLink(cl) => {
                cl.zome_index == agent_to_membrane_type.zome_index
                    && cl.link_type == agent_to_membrane_type.zome_type
                    && cl.author == action.author
                    && cl.base_address == base_address
                    && tenure_satisfied(
                        cl.timestamp.as_micros(),
                        action.timestamp.as_micros(),
                        ATTESTATION_GRANT_MIN_TENURE_SECS_VALIDATION,
                    )
            }
            _ => false,
        };
        if !tenure_ok {
            return Ok(ValidateCallbackResult::Invalid(
                "AttestationGrant requires proof of sufficiently tenured membership in this \
                 membrane — the referenced action must be the granter's own AgentToMembrane \
                 join for this same membrane, created at least the required tenure period ago."
                    .into()
            ));
        }

        // BUDGET: reuses the same checkpoint-bounded friction mechanism as
        // SynapticLink/Critique/Reinforcement above — a raw count of
        // recent AttestationGrant creations by this author, not a
        // distinct-candidate count. Re-granting the same candidate twice
        // just wastes some of the granter's own budget, which is strictly
        // more conservative than a distinct-count cap, not a gap in it.
        let window_start = action.timestamp.as_micros() - ATTESTATION_GRANT_WINDOW_SECS_VALIDATION * 1_000_000;
        let recent_count = count_recent_actions_since_checkpoint(
            action.author.clone(),
            action.prev_action.clone(),
            window_start,
            |a| matches!(a, Action::CreateLink(cl) if cl.link_type == action.link_type),
        )?;
        if recent_count >= ATTESTATION_GRANT_MAX_PER_WINDOW_VALIDATION {
            return Ok(ValidateCallbackResult::Invalid(format!(
                "SWO temporal friction: author has granted attestation {} times in the last {} \
                 seconds (limit {}). This bounds how fast the right to vouch can be spent, not \
                 just how fast links can be created.",
                recent_count, ATTESTATION_GRANT_WINDOW_SECS_VALIDATION, ATTESTATION_GRANT_MAX_PER_WINDOW_VALIDATION
            )));
        }
    }
    Ok(ValidateCallbackResult::Valid)
}

// ============================================================================
// TESTS
//
// This crate's first test module — everything else in the integrity
// zome so far either needs a real host call (must_get_entry,
// must_get_agent_activity, etc.) or was covered instead by the
// coordinator zome's tests (which exercise the same validation rules
// indirectly through its own pure-logic extractions, e.g.
// bridge_link_type_for mirrors this file's entry-type probing). This one
// function is different: bridge_record_loss_fields_consistent touches no
// host call at all, so it's directly, fully testable in isolation — see
// its own doc comment for what it does and doesn't check.
//
// VERIFICATION STATUS: run and passing against a real build (rustc/cargo
// 1.98.0) — see the coordinator zome's own TESTS section for the fuller
// story of getting a real compiler into this project and what it caught.
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_entry_hash(seed: u8) -> EntryHash {
        EntryHash::from_raw_36(vec![seed; 36])
    }

    fn fixture_agent_pubkey(seed: u8) -> AgentPubKey {
        AgentPubKey::from_raw_36(vec![seed; 36])
    }

    fn fixture_action_hash(seed: u8) -> ActionHash {
        ActionHash::from_raw_36(vec![seed; 36])
    }

    /// A minimal but well-formed Create action for validate_credit_transfer
    /// /validate_credit_burn — both are pure functions of `&Create` (no
    /// host calls), so unlike most validate_* functions in this file they
    /// can be tested directly rather than needing the pure/impure split
    /// tenure_satisfied and friends already use. entry_type/entry_hash are
    /// filled with harmless placeholders neither function inspects.
    fn fixture_create(author: AgentPubKey, timestamp_secs: i64) -> Create {
        Create {
            author,
            timestamp: Timestamp::from_micros(timestamp_secs * 1_000_000),
            action_seq: 1,
            prev_action: fixture_action_hash(0),
            entry_type: EntryType::AgentPubKey,
            entry_hash: fixture_entry_hash(0),
            weight: EntryRateWeight::default(),
        }
    }

    fn fixture_bridge_record(
        carried_fields: Vec<&str>,
        dropped_fields: Vec<&str>,
        original_length: u32,
        excerpt_length: u32,
    ) -> BridgeRecord {
        BridgeRecord {
            mew_hash: fixture_entry_hash(1),
            twitter_id: "123456789".into(),
            platform: "twitter".into(),
            mirrored_at: 0,
            carried_fields: carried_fields.into_iter().map(String::from).collect(),
            dropped_fields: dropped_fields.into_iter().map(String::from).collect(),
            original_length,
            excerpt_length,
        }
    }

    #[test]
    fn bridge_record_loss_fields_consistent_accepts_a_well_formed_record() {
        let record = fixture_bridge_record(vec!["content", "domain"], vec!["evidence_hashes", "confidence"], 340, 200);
        assert!(bridge_record_loss_fields_consistent(&record).is_ok());
    }

    #[test]
    fn bridge_record_loss_fields_consistent_accepts_empty_lists() {
        // A degenerate but not inherently invalid case — e.g. an entry
        // whose fields were never itemized either way.
        let record = fixture_bridge_record(vec![], vec![], 0, 0);
        assert!(bridge_record_loss_fields_consistent(&record).is_ok());
    }

    #[test]
    fn bridge_record_loss_fields_consistent_rejects_excerpt_longer_than_original() {
        let record = fixture_bridge_record(vec!["content"], vec![], 100, 200);
        assert!(bridge_record_loss_fields_consistent(&record).is_err());
    }

    #[test]
    fn bridge_record_loss_fields_consistent_accepts_excerpt_exactly_equal_to_original() {
        // Nothing was actually truncated — the whole thing carried over.
        // Not an error case; excerpt_length == original_length is valid.
        let record = fixture_bridge_record(vec!["content"], vec![], 100, 100);
        assert!(bridge_record_loss_fields_consistent(&record).is_ok());
    }

    #[test]
    fn bridge_record_loss_fields_consistent_rejects_a_field_in_both_lists() {
        let record = fixture_bridge_record(vec!["content", "domain"], vec!["domain"], 340, 200);
        assert!(bridge_record_loss_fields_consistent(&record).is_err());
    }

    // --- tenure_satisfied ---------------------------------------------

    const ONE_DAY_MICROS: i64 = 24 * 3600 * 1_000_000;

    #[test]
    fn tenure_satisfied_true_when_join_is_exactly_the_minimum_before_grant() {
        let min_tenure_secs = 30 * 24 * 3600;
        let grant_at = 1_000_000_000_000i64;
        let join_at = grant_at - min_tenure_secs * 1_000_000;
        assert!(tenure_satisfied(join_at, grant_at, min_tenure_secs));
    }

    #[test]
    fn tenure_satisfied_false_when_join_is_one_microsecond_short_of_the_minimum() {
        let min_tenure_secs = 30 * 24 * 3600;
        let grant_at = 1_000_000_000_000i64;
        let join_at = grant_at - min_tenure_secs * 1_000_000 + 1;
        assert!(!tenure_satisfied(join_at, grant_at, min_tenure_secs));
    }

    #[test]
    fn tenure_satisfied_true_for_a_join_far_older_than_the_minimum() {
        let min_tenure_secs = 30 * 24 * 3600;
        let grant_at = 1_000_000_000_000i64;
        let join_at = grant_at - 365 * ONE_DAY_MICROS; // a year old
        assert!(tenure_satisfied(join_at, grant_at, min_tenure_secs));
    }

    #[test]
    fn tenure_satisfied_false_for_a_join_recorded_after_the_grant() {
        // Shouldn't happen on a real chain (actions are ordered), but the
        // arithmetic itself should still fail closed, not panic or wrap.
        let min_tenure_secs = 30 * 24 * 3600;
        let join_at = 1_000_000_000_000i64;
        let grant_at = join_at - ONE_DAY_MICROS;
        assert!(!tenure_satisfied(join_at, grant_at, min_tenure_secs));
    }

    #[test]
    fn tenure_satisfied_true_when_minimum_tenure_is_zero() {
        // A degenerate but not invalid policy: any join, even one
        // microsecond before the grant, satisfies a zero-tenure bar.
        let grant_at = 1_000_000_000_000i64;
        let join_at = grant_at - 1;
        assert!(tenure_satisfied(join_at, grant_at, 0));
    }

}
