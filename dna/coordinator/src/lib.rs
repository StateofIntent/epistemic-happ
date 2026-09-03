use hdk::prelude::*;
use epistemic_integrity::*;
use sha2::{Sha256, Digest};
use std::collections::{HashMap, HashSet};

// ============================================================================
// N4L SERIALIZATION
//
// Produces genuine N4L syntax per SSTorytime's language spec:
//   https://github.com/markburgess/SSTorytime/blob/main/docs/N4L.md
// The relation vocabulary used below is defined in n4l/arrows-epistemic.sst
// at the repo root, which must be loaded into SSTconfig/ (alongside
// SSTorytime's own standard arrow files) before ingesting exported .dat
// files with the real `N4L` compiler.
//
// ALIASING: N4L aliases (`@name`) must avoid the language's reserved
// characters ( ) + - @ $ #. Holochain hash strings are not guaranteed
// free of these, so we never use a raw hash as an alias. Instead each
// alias is a SHA-256 digest of the entry's EntryHash, hex-encoded and
// truncated — guaranteed N4L-safe, short, and deterministic. The full
// hash is still preserved losslessly as a quoted property value on the
// node itself, so nothing is lost, only kept out of the identifier.
//
// CROSS-REFERENCES: entries that reference another entry (e.g. a
// Critique's target) store an EntryHash (or, for Critique specifically,
// an AnyLinkableHash that downcasts to one — see CritiqueTargetType).
// To make those references
// resolve to the *same* alias the referenced entry was exported under,
// callers must pass the EntryHash (via `hash_entry()`), not the
// ActionHash of the record — using ActionHash here would silently break
// every cross-reference, since Holochain's EntryHash and ActionHash for
// the same record are different values.
// ============================================================================

pub trait ToN4L {
    fn to_n4l(&self, entry_hash: &EntryHash) -> String;
}

fn n4l_alias(prefix: &str, entry_hash: &EntryHash) -> String {
    let digest = Sha256::digest(entry_hash.to_string().as_bytes());
    format!("{}_{}", prefix, hex::encode(&digest[..8]))
}

fn n4l_esc(s: &str) -> String {
    s.replace('"', "\\\"")
}

/// Renders a `" (relation) "value"` continuation line, chaining off the
/// first item on the aliased line above via N4L's `"` continuation mark.
fn n4l_prop(relation: &str, value: &str) -> String {
    format!("     \"                ({}) \"{}\"\n", relation, value)
}

/// The alias prefix a Critique's target was exported under — must match
/// whatever prefix that target's own `to_n4l` impl used (n4l_alias
/// "claim" for Claim, "critique" for Critique, etc.), or the
/// `$alias.1` cross-reference in critique_to_n4l below resolves to
/// nothing. This is the whole reason CritiqueTargetType exists: to_n4l
/// has no DHT access to discover this by looking the target up.
fn n4l_prefix_for_target_type(t: &CritiqueTargetType) -> &'static str {
    match t {
        CritiqueTargetType::Claim => "claim",
        CritiqueTargetType::Critique => "critique",
        CritiqueTargetType::Constitution => "constitution",
        CritiqueTargetType::Membrane => "membrane",
        CritiqueTargetType::CritiqueSpecies => "critiquespecies",
    }
}

impl ToN4L for Claim {
    fn to_n4l(&self, entry_hash: &EntryHash) -> String {
        let alias = n4l_alias("claim", entry_hash);
        let mut out = format!(
            "@{alias} \"{content}\" (asserted by) \"{author}\"\n",
            alias = alias, content = n4l_esc(&self.content), author = self.author
        );
        out += &n4l_prop("has domain", &n4l_esc(&self.domain));
        out += &n4l_prop("has confidence", &format!("{:?}", self.confidence));
        out += &n4l_prop("has dht hash", &entry_hash.to_string());
        for ev in &self.evidence_hashes {
            out += &n4l_prop("has evidence", &ev.to_string());
        }
        for tag in &self.semantic_tags {
            out += &n4l_prop("has tag", &n4l_esc(tag));
        }
        out.push('\n');
        out
    }
}

impl ToN4L for Critique {
    fn to_n4l(&self, entry_hash: &EntryHash) -> String {
        let alias = n4l_alias("critique", entry_hash);
        // self.target is scale-invariant (Claim, Critique, Constitution,
        // Membrane, or CritiqueSpecies — see CritiqueTargetType), so the
        // alias prefix has to be picked dynamically rather than hardcoded
        // to "claim". validate_critique guarantees target downcasts to
        // an EntryHash for every Critique actually accepted onto the
        // DHT, so this should never hit the fallback in practice — but
        // export must not panic on a record this function didn't itself
        // validate, so a downcast failure degrades to a raw, unresolvable
        // hash reference instead of crashing the whole export batch.
        let target_placeholder = match EntryHash::try_from(self.target.clone()) {
            Ok(target_hash) => {
                let prefix = n4l_prefix_for_target_type(&self.target_type);
                format!("${}.1", n4l_alias(prefix, &target_hash))
            }
            Err(_) => format!("\"{}\"", self.target),
        };
        let mut out = format!(
            "@{alias} \"{content}\" (critiques) $target_placeholder\n",
            alias = alias, content = n4l_esc(&self.content)
        );
        // N4L references an aliased line via $alias.1 — since the
        // target's alias is computed deterministically from the same
        // EntryHash and type-appropriate prefix, this resolves correctly
        // as long as the target was exported in the same or an earlier
        // N4L batch.
        out = out.replace("$target_placeholder", &target_placeholder);
        out += &n4l_prop("target type", &format!("{:?}", self.target_type));
        out += &n4l_prop("critique mode", &format!("{:?}", self.critique_mode));
        out += &n4l_prop("asserted by", &self.author.to_string());
        out += &n4l_prop("has dht hash", &entry_hash.to_string());
        out += &n4l_prop("replication attempted", &self.replication_attempted.to_string());
        for ev in &self.evidence_hashes {
            out += &n4l_prop("has evidence", &ev.to_string());
        }
        if let Some(ref species) = self.species {
            out += &n4l_prop("adopts species", &species.to_string());
        }
        out.push('\n');
        out
    }
}

impl ToN4L for AntibodyPattern {
    fn to_n4l(&self, entry_hash: &EntryHash) -> String {
        let alias = n4l_alias("antibodypattern", entry_hash);
        // Same dynamic-prefix resolution Critique's to_n4l already uses
        // for its own scale-invariant target — see that impl's comment
        // for why this can't be resolved any other way from a pure
        // function with no DHT access.
        let target_placeholder = match EntryHash::try_from(self.target.clone()) {
            Ok(target_hash) => {
                let prefix = n4l_prefix_for_target_type(&self.target_type);
                format!("${}.1", n4l_alias(prefix, &target_hash))
            }
            Err(_) => format!("\"{}\"", self.target),
        };
        let mut out = format!(
            "@{alias} \"{rationale}\" (flags) $target_placeholder\n",
            alias = alias, rationale = n4l_esc(&self.rationale)
        );
        out = out.replace("$target_placeholder", &target_placeholder);
        out += &n4l_prop("target type", &format!("{:?}", self.target_type));
        out += &n4l_prop("pattern kind", &format!("{:?}", self.kind));
        out += &n4l_prop("asserted by", &self.author.to_string());
        out += &n4l_prop("has dht hash", &entry_hash.to_string());
        out.push('\n');
        out
    }
}

impl ToN4L for Evidence {
    fn to_n4l(&self, entry_hash: &EntryHash) -> String {
        let alias = n4l_alias("evidence", entry_hash);
        let mut out = format!(
            "@{alias} \"{content}\" (asserted by) \"{author}\"\n",
            alias = alias, content = n4l_esc(&self.content), author = self.author
        );
        out += &n4l_prop("evidence type", &format!("{:?}", self.evidence_type));
        out += &n4l_prop("has dht hash", &entry_hash.to_string());
        if let Some(ref url) = self.source_url {
            out += &n4l_prop("has source url", &n4l_esc(url));
        }
        out.push('\n');
        out
    }
}

impl ToN4L for Membrane {
    fn to_n4l(&self, entry_hash: &EntryHash) -> String {
        let alias = n4l_alias("membrane", entry_hash);
        let mut out = format!(
            "@{alias} \"{domain}\" (has description) \"{desc}\"\n",
            alias = alias, domain = n4l_esc(&self.domain), desc = n4l_esc(&self.description)
        );
        out += &n4l_prop("created by", &self.creator.to_string());
        out += &n4l_prop("has dht hash", &entry_hash.to_string());
        out += &n4l_prop("founded on constitution", &self.constitution.to_string());
        for p in &self.required_promises {
            out += &n4l_prop("requires promise", &n4l_esc(p));
        }
        out.push('\n');
        out
    }
}

impl ToN4L for WorldlineTrace {
    fn to_n4l(&self, entry_hash: &EntryHash) -> String {
        let alias = n4l_alias("worldline", entry_hash);
        let mut out = format!(
            "@{alias} \"worldline of {agent}\" (asserted by) \"{agent}\"\n",
            alias = alias, agent = self.agent
        );
        out += &n4l_prop("has checksum", &hex::encode(&self.checksum));
        out += &n4l_prop("has dht hash", &entry_hash.to_string());
        for tag in &self.expertise_tags {
            out += &n4l_prop("has expertise tag", &n4l_esc(tag));
        }
        // The period index is carried as an N4L context tag (the
        // "(name,ctx)" comma form GetLinkArrowByName parses), not baked
        // into the relation name itself. N4L's arrow directory is a
        // fixed, pre-declared vocabulary (n4l/arrows-epistemic.sst) — an
        // open-ended family of relation names like "covers period 3"
        // can never all be registered in advance, and was confirmed
        // fatal against the real binary ("No such arrow has been
        // declared in the configuration: (covers period 0)"). Prefixing
        // the tag with a letter ("p0") keeps it a non-numeric context
        // string rather than being parsed as a relation weight.
        for (i, b) in self.period_boundaries.iter().enumerate() {
            out += &n4l_prop(&format!("covers period,p{}", i), &b.domain_tag);
            out += &n4l_prop(&format!("sample action,p{}", i), &b.sample_action.to_string());
            out += &n4l_prop(&format!("has entry count,p{}", i), &b.entry_count.to_string());
        }
        out.push('\n');
        out
    }
}

impl ToN4L for Mew {
    fn to_n4l(&self, entry_hash: &EntryHash) -> String {
        let alias = n4l_alias("mew", entry_hash);
        let mut out = format!(
            "@{alias} \"{content}\" (asserted by) \"{author}\"\n",
            alias = alias, content = n4l_esc(&self.content), author = self.author
        );
        out += &n4l_prop("has dht hash", &entry_hash.to_string());
        if let Some(ref reply) = self.reply_to {
            out += &n4l_prop("replies to", &reply.to_string());
        }
        if let Some(ref claim) = self.linked_claim {
            out += &n4l_prop("promoted to", &claim.to_string());
        }
        for tag in &self.semantic_tags {
            out += &n4l_prop("has tag", &n4l_esc(tag));
        }
        out.push('\n');
        out
    }
}

impl ToN4L for Retraction {
    fn to_n4l(&self, entry_hash: &EntryHash) -> String {
        let alias = n4l_alias("retraction", entry_hash);
        let target_alias = n4l_alias("claim", &self.target_claim);
        let mut out = format!(
            "@{alias} \"{reason}\" (retracts) ${target}.1\n",
            alias = alias, reason = n4l_esc(&self.reason), target = target_alias
        );
        out += &n4l_prop("asserted by", &self.author.to_string());
        out += &n4l_prop("has dht hash", &entry_hash.to_string());
        if let Some(ref replacement) = self.replacement_claim {
            let repl_alias = n4l_alias("claim", replacement);
            out += &format!("     \"                (replaced by) ${}.1\n", repl_alias);
        }
        out.push('\n');
        out
    }
}

impl ToN4L for Constitution {
    fn to_n4l(&self, entry_hash: &EntryHash) -> String {
        let alias = n4l_alias("constitution", entry_hash);
        let mut out = format!(
            "@{alias} \"constitution of {agent}\" (asserted by) \"{agent}\"\n",
            alias = alias, agent = self.agent
        );
        out += &n4l_prop("has dht hash", &entry_hash.to_string());
        if let Some(expires) = self.expires_at {
            out += &n4l_prop("expires at", &expires.to_string());
        }
        // Same fix as WorldlineTrace above: index carried as an N4L
        // context tag on a static, registered relation name, never
        // interpolated into the name itself.
        for (i, p) in self.promises.iter().enumerate() {
            out += &n4l_prop(&format!("promise action,p{}", i), &p.action);
            out += &n4l_prop(&format!("promise domain,p{}", i), &p.domain);
            if let Some(ref modality) = p.modality {
                out += &n4l_prop(&format!("promise modality,p{}", i), &format!("{:?}", modality));
            }
        }
        for (i, c) in self.conditions.iter().enumerate() {
            out += &n4l_prop(&format!("condition type,c{}", i), &c.condition_type);
            for (j, param) in c.parameters.iter().enumerate() {
                out += &n4l_prop(&format!("condition param,c{},p{}", i, j), param);
            }
        }
        out.push('\n');
        out
    }
}

// ============================================================================
// CLAIM FUNCTIONS
// ============================================================================

#[hdk_extern]
pub fn create_claim(claim: Claim) -> ExternResult<ActionHash> {
    let action_hash = create_entry(EntryTypes::Claim(claim.clone()))?;

    // Create synaptic link from agent anchor.
    let agent_anchor = agent_anchor_hash(&claim.author)?;
    create_link(
        agent_anchor,
        action_hash.clone(),
        LinkTypes::AgentToClaim,
        LinkTag::new(claim.domain.as_bytes().to_vec()),
    )?;

    // Emit signal for bridge service. The bridge needs this claim's
    // EntryHash — not just its ActionHash — to later record a
    // BridgeRecord link keyed the same way every other claim link is
    // keyed (see TargetToCritique, get_unbridged_claims). A bare Claim
    // has no hash field of its own, so it's computed and attached here
    // rather than left for the bridge to guess at (it previously read a
    // nonexistent `claim.action_hash`).
    let entry_hash = hash_entry(&claim)?;
    emit_signal(&SignalPayload::NewClaim {
        claim,
        entry_hash,
        action_hash: action_hash.clone(),
    })?;

    Ok(action_hash)
}

// Accepts either hash type: create_claim returns an ActionHash, but a
// caller who got this claim's hash from a link base or an N4L export
// (both of which use EntryHash, see get_unbridged_claims/ToN4L) has an
// EntryHash instead. Holochain's hash encoding carries its own type tag,
// so `get()` resolves either representation to the same record without
// the caller needing to know or compute which one they have. This is
// the fix for the getter/creator hash mismatch the README's roadmap
// flagged as not yet audited.
#[hdk_extern]
pub fn get_claim(hash: AnyDhtHash) -> ExternResult<Option<Claim>> {
    match get(hash, GetOptions::default())? {
        Some(record) => {
            let claim: Option<Claim> = record.entry().to_app_option().map_err(|e| wasm_error!(WasmErrorInner::Guest(format!("{:?}", e))))?;
            Ok(claim)
        }
        None => Ok(None),
    }
}

#[hdk_extern]
pub fn get_claims_by_domain(domain: String) -> ExternResult<Vec<Record>> {
    let mut claims = Vec::new();
    // Query all Claim entries and filter by domain.
    let filter = ChainQueryFilter::new()
        .include_entries(true)
        .entry_type(EntryType::App(UnitEntryTypes::Claim.try_into()?));

    let records = query(filter)?;
    for record in records {
        if let Ok(Some(claim)) = record.entry().to_app_option::<Claim>() {
            if claim.domain == domain {
                claims.push(record);
            }
        }
    }
    Ok(claims)
}

#[hdk_extern]
pub fn get_claims_by_agent(agent: AgentPubKey) -> ExternResult<Vec<Record>> {
    let anchor = agent_anchor_hash(&agent)?;
    let links = get_links(GetLinksInputBuilder::try_new(anchor, LinkTypes::AgentToClaim)?.build())?;

    let mut claims = Vec::new();
    for link in links {
        if let Ok(hash) = ActionHash::try_from(link.target) {
            if let Some(record) = get(hash, GetOptions::default())? {
                claims.push(record);
            }
        }
    }
    Ok(claims)
}

// ============================================================================
// SWO TEMPORAL FRICTION
//
// A cost mechanism, not a reputation score — see the design discussion on
// Invariant #1 and Promise Theory's subjective-trust model. Rather than
// rank agents, this makes rapid mass-production of SynapticLinks slow.
// It is identity-blind: it doesn't gate on *who* you are or *what* you've
// built a reputation for, only on *how fast* you're acting right now.
// That preserves open participation (anyone can join, anyone can promise)
// while making synaptic-link farming expensive in wall-clock time instead
// of gated by permission.
//
// TWO LAYERS, DELIBERATELY:
//   1. Coordinator-side pre-check (below): fast, local, gives the calling
//      agent's own client a friendly error before it wastes a commit.
//      On its own this is advisory only — any custom client that skips
//      this coordinator function and calls create_link directly bypasses
//      it entirely.
//   2. Integrity-zome validation (see dna/integrity/src/lib.rs,
//      validate_create_link): the real enforcement layer. It runs on
//      every validating peer via `must_get_agent_activity`, independent
//      of what the author's own client chose to check, so it can't be
//      bypassed by a modified client the way a coordinator-only check can.
//
// VERIFICATION STATUS: this has been written against the documented HDK/
// HDI 0.4 API surface but has not been run through a real `hc` conductor.
// The exact field names on OpRecord::CreateLink and the ChainFilter
// builder API should be checked against the installed HDI version before
// relying on this in production — same caveat as the N4L exporter.
// ============================================================================

const SYNAPTIC_LINK_WINDOW_SECS: i64 = 3600; // rolling 1-hour window
const SYNAPTIC_LINK_MAX_PER_WINDOW: usize = 20; // tunable; not load-bearing on exact value

// There is deliberately NO coupling to the metabolic currency layer
// here. A burn-to-extend tier (free below 20, purchasable to 30) once
// sat at this spot and was removed — it was unreachable by any honest
// client, and handed ten extra links to the one client that could reach
// it, for burns that nothing funds. See the integrity zome's matching
// REMOVED note and docs/metabolic-biosignalling-currency-brief.md §7.2.

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SynapticFrictionStatus {
    pub recent_count: usize,
    pub limit: usize,
    pub window_secs: i64,
    pub blocked: bool,
}

/// Counts this agent's own SynapticLink creations within the friction
/// window, by querying their own source chain. Agent-centric by
/// construction: each agent checks their own history, no central
/// rate-limiter, consistent with "agents are cells with membranes."
fn count_recent_synaptic_links(since: Timestamp) -> ExternResult<usize> {
    let filter = ChainQueryFilter::new()
        .action_type(ActionType::CreateLink)
        .include_entries(false);
    let records = query(filter)?;

    // Raw LinkType values from a queried record can't convert back into
    // LinkTypes without zome-index context (TryFrom<LinkType> isn't
    // implemented — only TryFrom<ScopedZomeType<LinkType>> is), so this
    // compares in the other direction instead: convert the one known
    // LinkTypes value we care about into its scoped raw form once, then
    // compare raw-to-raw for every candidate action.
    let synaptic_link_type: ScopedLinkType = LinkTypes::SynapticLink
        .try_into()
        .map_err(|_| wasm_error!(WasmErrorInner::Guest("Could not resolve SynapticLink type.".into())))?;

    let count = records
        .iter()
        .filter(|r| match r.action() {
            Action::CreateLink(cl) => {
                cl.timestamp >= since
                    && cl.zome_index == synaptic_link_type.zome_index
                    && cl.link_type == synaptic_link_type.zome_type
            }
            _ => false,
        })
        .count();

    Ok(count)
}

#[hdk_extern]
pub fn get_synaptic_link_friction_status(_: ()) -> ExternResult<SynapticFrictionStatus> {
    let now = sys_time()?;
    let since = Timestamp::from_micros(now.as_micros() - SYNAPTIC_LINK_WINDOW_SECS * 1_000_000);
    let recent_count = count_recent_synaptic_links(since)?;
    Ok(SynapticFrictionStatus {
        recent_count,
        limit: SYNAPTIC_LINK_MAX_PER_WINDOW,
        window_secs: SYNAPTIC_LINK_WINDOW_SECS,
        blocked: recent_count >= SYNAPTIC_LINK_MAX_PER_WINDOW,
    })
}

fn check_synaptic_link_friction() -> ExternResult<()> {
    let now = sys_time()?;
    let since = Timestamp::from_micros(now.as_micros() - SYNAPTIC_LINK_WINDOW_SECS * 1_000_000);
    let recent_count = count_recent_synaptic_links(since)?;

    if recent_count >= SYNAPTIC_LINK_MAX_PER_WINDOW {
        // Absolute. No burn lifts this — see the note beside the
        // friction constants above. Friendly pre-check only; the
        // integrity zome's validate_create_link independently re-derives
        // the same limit from the DHT and is what actually enforces it.
        return Err(wasm_error!(WasmErrorInner::Guest(format!(
            "SWO temporal friction: {} SynapticLinks already created in the last {} seconds (limit {}). \
             This is an absolute limit.",
            recent_count, SYNAPTIC_LINK_WINDOW_SECS, SYNAPTIC_LINK_MAX_PER_WINDOW
        ))));
    }
    Ok(())
}

/// Finds the calling agent's most recent published WorldlineTrace and
/// returns its ActionHash, if one exists. Exposed as a standalone utility
/// for client UIs that want to nudge agents to checkpoint periodically —
/// NOT consumed by SynapticLink validation. The integrity zome's
/// validate_create_link deliberately discovers an author's checkpoint by
/// independently scanning their chain activity rather than trusting a
/// self-reported reference, since a self-reported checkpoint could be
/// omitted, forged, or pointed at an irrelevant trace by a malicious
/// client. See that function's comments for the real mechanism.
#[hdk_extern]
pub fn get_my_latest_worldline_checkpoint(_: ()) -> ExternResult<Option<ActionHash>> {
    let agent = agent_info()?.agent_latest_pubkey;
    let agent_anchor = agent_anchor_hash(&agent)?;
    let links = get_links(GetLinksInputBuilder::try_new(agent_anchor, LinkTypes::AgentToWorldlineTrace)?.build())?;

    let mut candidates: Vec<(u64, ActionHash)> = Vec::new();
    for link in links {
        if let Ok(hash) = ActionHash::try_from(link.target) {
            if let Some(record) = get(hash, GetOptions::default())? {
                if let Ok(Some(trace)) = record.entry().to_app_option::<WorldlineTrace>() {
                    let now = sys_time()?.as_seconds_and_nanos().0 as u64;
                    if trace.expires_at.map_or(true, |exp| exp > now) {
                        candidates.push((trace.created_at, record.action_address().clone()));
                    }
                }
            }
        }
    }

    candidates.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(candidates.into_iter().next().map(|(_, hash)| hash))
}

/// The single path for creating a SynapticLink. Funnels every caller in
/// this zome through the friction check so it can't be silently skipped
/// by a future function that forgets to call it — see integrity zome's
/// validate_create_link for the real enforcement layer, which bounds its
/// validation walk via an independently-discovered checkpoint rather than
/// anything read from this tag. Returns the SynapticLink's own
/// ActionHash (create_link's return value, previously discarded here) —
/// callers that need to reinforce this specific connection later (see
/// CONDUCTANCE ATROPHY below) need it, and create_critique (the only
/// current caller) doesn't surface it through its own return value
/// (that returns the Critique's ActionHash instead) — see
/// find_synaptic_link for how a caller recovers it after the fact.
fn create_synaptic_link(
    base: impl Into<AnyLinkableHash>,
    target: impl Into<AnyLinkableHash>,
    conductance: f32,
) -> ExternResult<ActionHash> {
    check_synaptic_link_friction()?;
    let conductance_bytes = conductance.to_le_bytes();
    create_link(base, target, LinkTypes::SynapticLink, LinkTag::new(conductance_bytes.to_vec()))
}

/// Finds the SynapticLink connecting `base` to `target_action`, if one
/// exists — e.g. the link create_critique made from a critique's target
/// to the critique's own ActionHash. A caller who wants to reinforce
/// that specific connection (see reinforce_synaptic_link) needs its
/// ActionHash, which create_critique's return value doesn't carry.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FindSynapticLinkPayload {
    pub base: AnyDhtHash,
    pub target_action: ActionHash,
}

#[hdk_extern]
pub fn find_synaptic_link(payload: FindSynapticLinkPayload) -> ExternResult<Option<ActionHash>> {
    let links = get_links(GetLinksInputBuilder::try_new(payload.base, LinkTypes::SynapticLink)?.build())?;
    for link in links {
        if let Ok(target_action) = ActionHash::try_from(link.target.clone()) {
            if target_action == payload.target_action {
                return Ok(Some(link.create_link_hash));
            }
        }
    }
    Ok(None)
}

// ============================================================================
// REINFORCEMENT TEMPORAL FRICTION
//
// Mirrors SynapticLink's friction pattern exactly (see that section
// above for the full two-layer rationale) but with its own budget:
// reinforcing is a cheaper, more casual act ("I resonate with this")
// than authoring a new connection, so it's given more headroom — but it
// still needs friction, or an agent (or a sybil farm) could
// mass-reinforce their own SynapticLinks to keep conductance
// artificially high forever, defeating the entire point of computing it
// from real activity. See CONDUCTANCE ATROPHY below for what this
// friction is actually protecting.
// ============================================================================

const REINFORCEMENT_WINDOW_SECS: i64 = 3600;
const REINFORCEMENT_MAX_PER_WINDOW: usize = 40; // must match integrity zome's limit

fn count_recent_reinforcements(since: Timestamp) -> ExternResult<usize> {
    let filter = ChainQueryFilter::new()
        .action_type(ActionType::CreateLink)
        .include_entries(false);
    let records = query(filter)?;

    let reinforcement_type: ScopedLinkType = LinkTypes::Reinforcement
        .try_into()
        .map_err(|_| wasm_error!(WasmErrorInner::Guest("Could not resolve Reinforcement type.".into())))?;

    let count = records
        .iter()
        .filter(|r| match r.action() {
            Action::CreateLink(cl) => {
                cl.timestamp >= since
                    && cl.zome_index == reinforcement_type.zome_index
                    && cl.link_type == reinforcement_type.zome_type
            }
            _ => false,
        })
        .count();

    Ok(count)
}

fn check_reinforcement_friction() -> ExternResult<()> {
    let now = sys_time()?;
    let since = Timestamp::from_micros(now.as_micros() - REINFORCEMENT_WINDOW_SECS * 1_000_000);
    let recent_count = count_recent_reinforcements(since)?;

    if recent_count >= REINFORCEMENT_MAX_PER_WINDOW {
        return Err(wasm_error!(WasmErrorInner::Guest(format!(
            "SWO temporal friction: {} Reinforcements already created in the last {} seconds (limit {}). \
             This is intentional friction, not a reputation judgment — try again later.",
            recent_count, REINFORCEMENT_WINDOW_SECS, REINFORCEMENT_MAX_PER_WINDOW
        ))));
    }
    Ok(())
}

/// Records that the calling agent resonates with an existing
/// SynapticLink — the sole way a Reinforcement link is created, funneled
/// through the friction check the same way create_synaptic_link funnels
/// SynapticLink creation through its own. The real enforcement is DHT-
/// side (integrity zome's validate_create_link, Reinforcement branch);
/// this is the friendly, bypassable pre-check.
#[hdk_extern]
pub fn reinforce_synaptic_link(synaptic_link_action: ActionHash) -> ExternResult<ActionHash> {
    check_reinforcement_friction()?;
    let agent = agent_info()?.agent_latest_pubkey;
    create_link(synaptic_link_action, agent, LinkTypes::Reinforcement, LinkTag::new(Vec::<u8>::new()))
}

// ============================================================================
// CONDUCTANCE ATROPHY
//
// SynapticLink's f32 conductance in its LinkTag is the immutable INITIAL
// value — LinkTags can't be mutated once written. What actually matters
// over time is computed here, at read time, from two decaying
// contributions: the base conductance decaying since the link's own
// creation, plus one decaying contribution per Reinforcement event.
// This is the biologically-grounded resolution to "a synapse whose
// activity is uncorrelated with anything downstream loses conductance
// and is eventually pruned" — not a firing gate (nothing here prevents
// a flood of SynapticLinks from being CREATED; that's what SynapticLink
// friction is for), but a read-time signal that lets an observer
// discount connections nobody has found worth reinforcing. This is
// containment, not prevention, of the sybil-farming concern the
// README's Fractal Impedance Matching section discusses: it doesn't
// raise the cost of creating a SynapticLink, only the cost of making one
// that STAYS load-bearing — a flood of un-reinforced links stays fully
// present in the record (nothing deleted, nothing blocked — Invariants
// #6 and #9) but decays toward zero in any conductance-weighted read.
// ============================================================================

const CONDUCTANCE_HALF_LIFE_SECS: f64 = 30.0 * 24.0 * 3600.0; // 30 days
const REINFORCE_WEIGHT: f32 = 1.0; // comparable to typical initial conductance

/// `2^(-elapsed_secs / half_life)`: exactly 1.0 at elapsed_secs <= 0,
/// exactly 0.5 at elapsed_secs == CONDUCTANCE_HALF_LIFE_SECS,
/// monotonically toward 0 after. Negative elapsed (clock skew, or
/// evaluating "now" before an event's timestamp for some other reason)
/// clamps to 1.0 rather than producing a value above 1 or panicking.
fn decay_factor(elapsed_secs: f64) -> f32 {
    if elapsed_secs <= 0.0 {
        return 1.0;
    }
    2f64.powf(-elapsed_secs / CONDUCTANCE_HALF_LIFE_SECS) as f32
}

/// Pure core of effective-conductance computation — no host calls, so
/// it's directly unit-testable (see the tests below). Timestamps are
/// Unix seconds, matching what Timestamp::as_seconds_and_nanos().0
/// already gives every other timestamp use in this file.
fn compute_effective_conductance(
    base_conductance: f32,
    created_at_secs: i64,
    reinforcement_timestamps_secs: &[i64],
    now_secs: i64,
) -> f32 {
    let mut total = base_conductance * decay_factor((now_secs - created_at_secs) as f64);
    for &t in reinforcement_timestamps_secs {
        total += REINFORCE_WEIGHT * decay_factor((now_secs - t) as f64);
    }
    total
}

/// The read-time effective conductance of a SynapticLink — see
/// CONDUCTANCE ATROPHY above. `synaptic_link_action` is the SynapticLink
/// CreateLink action's own ActionHash (from find_synaptic_link, or
/// captured directly by a caller that made the link itself).
#[hdk_extern]
pub fn get_effective_conductance(synaptic_link_action: ActionHash) -> ExternResult<f32> {
    let record = must_get_valid_record(synaptic_link_action.clone())?;
    let (base_conductance, created_at_secs) = match record.action() {
        Action::CreateLink(cl) => {
            if cl.tag.0.len() < 4 {
                return Err(wasm_error!(WasmErrorInner::Guest(
                    "SynapticLink tag too short to contain a conductance value.".into()
                )));
            }
            let bytes: [u8; 4] = cl.tag.0[0..4].try_into().map_err(|_| {
                wasm_error!(WasmErrorInner::Guest("Could not read conductance bytes.".into()))
            })?;
            (f32::from_le_bytes(bytes), cl.timestamp.as_seconds_and_nanos().0)
        }
        _ => {
            return Err(wasm_error!(WasmErrorInner::Guest(
                "Target action is not a CreateLink — not a SynapticLink.".into()
            )));
        }
    };

    let links = get_links(GetLinksInputBuilder::try_new(synaptic_link_action, LinkTypes::Reinforcement)?.build())?;
    let reinforcement_timestamps: Vec<i64> = links
        .iter()
        .map(|link| link.timestamp.as_seconds_and_nanos().0)
        .collect();

    let now_secs = sys_time()?.as_seconds_and_nanos().0;

    Ok(compute_effective_conductance(base_conductance, created_at_secs, &reinforcement_timestamps, now_secs))
}

// ============================================================================
// CRITIQUE FUNCTIONS
// ============================================================================

// ============================================================================
// CRITIQUE TEMPORAL FRICTION
//
// Extends the SWO temporal friction pattern (see SynapticLink's section
// above) to Critique creation directly. create_critique already creates
// a SynapticLink for every Critique, which is already friction-limited —
// but only for callers who go through this function. A custom client
// could create a Critique entry directly, bypassing create_critique (and
// the SynapticLink it would have made) entirely, so the coordinator-side
// check below is paired with real DHT-side enforcement in the integrity
// zome's validate_critique, the same two-layer shape as SynapticLink.
//
// GLOBAL PER-AGENT, NOT PER-DOMAIN — same tradeoff as the integrity
// zome's check: per-domain bucketing would need resolving each
// candidate critique's target claim's domain, extra cost for a fairness
// refinement rather than the core security property. Deferred.
// ============================================================================

const CRITIQUE_WINDOW_SECS: i64 = 3600;
const CRITIQUE_MAX_PER_WINDOW: usize = 20; // must match integrity zome's limit

/// Counts this agent's own Critique creations within the friction
/// window, by querying their own source chain. Mirrors
/// count_recent_synaptic_links's agent-centric, no-central-limiter shape.
fn count_recent_critiques(since: Timestamp) -> ExternResult<usize> {
    // .entry_type() alone (no separate .action_type()) matches this
    // file's existing entry-type filters elsewhere (get_claims_by_domain,
    // get_critiques_by_mode, export_to_n4l) rather than introducing a
    // combination not otherwise used in this codebase.
    let filter = ChainQueryFilter::new()
        .include_entries(false)
        .entry_type(EntryType::App(UnitEntryTypes::Critique.try_into()?));
    let records = query(filter)?;

    let count = records
        .iter()
        .filter(|r| r.action().timestamp() >= since)
        .count();

    Ok(count)
}

fn check_critique_friction() -> ExternResult<()> {
    let now = sys_time()?;
    let since = Timestamp::from_micros(now.as_micros() - CRITIQUE_WINDOW_SECS * 1_000_000);
    let recent_count = count_recent_critiques(since)?;

    if recent_count >= CRITIQUE_MAX_PER_WINDOW {
        return Err(wasm_error!(WasmErrorInner::Guest(format!(
            "SWO temporal friction: {} Critiques already created in the last {} seconds (limit {}). \
             This is intentional friction to make critique-flooding slow, not a reputation judgment — \
             try again later.",
            recent_count, CRITIQUE_WINDOW_SECS, CRITIQUE_MAX_PER_WINDOW
        ))));
    }
    Ok(())
}

#[hdk_extern]
pub fn create_critique(critique: Critique) -> ExternResult<ActionHash> {
    check_critique_friction()?;

    let action_hash = create_entry(EntryTypes::Critique(critique.clone()))?;

    // Link from the target (any critiquable node — see CritiqueTargetType)
    // to this critique. One link type reused across all target kinds;
    // see TargetToCritique's own comment for why that's fine in
    // Holochain's link model.
    create_link(
        critique.target.clone(),
        action_hash.clone(),
        LinkTypes::TargetToCritique,
        LinkTag::new(format!("{:?}", critique.critique_mode).into_bytes()),
    )?;

    // If this critique declares a species/taxonomy, record the real link.
    // This is what get_critique_species_adoption_count actually counts —
    // replacing the old self-declared, unenforced adoption_count field.
    if let Some(ref species_hash) = critique.species {
        create_link(
            species_hash.clone(),
            action_hash.clone(),
            LinkTypes::CritiqueToSpecies,
            LinkTag::new("adopts"),
        )?;
    }

    // Synaptic link with initial conductance, subject to SWO temporal
    // friction (see section above) to make mass-produced links slow
    // rather than free. create_synaptic_link takes impl Into<AnyLinkableHash>,
    // so the already-AnyLinkableHash target passes straight through.
    create_synaptic_link(critique.target.clone(), action_hash.clone(), 1.0)?;

    Ok(action_hash)
}

/// Every critique of `target` — a Claim, another Critique, a
/// Constitution, a Membrane, or a CritiqueSpecies (see
/// CritiqueTargetType). Accepts either hash type (see get_claim's
/// comment on AnyDhtHash) since callers may have an ActionHash from a
/// create_X return or an EntryHash from a link/N4L export; both convert
/// to AnyLinkableHash, which is what TargetToCritique links are keyed by
/// on the base side. On the link's own target side, though — the
/// critique being found — it's always the critique's own ActionHash
/// (create_critique's create_link call passes create_entry's return
/// value straight through, never converting it): this comment
/// previously claimed the opposite ("always an EntryHash in practice"),
/// which was never actually true and, paired with the matching
/// EntryHash::try_from(link.target) this function used to have, meant
/// every call here silently returned zero results — a real, confirmed
/// bug caught only by running this against a live conductor (see
/// README.md's Phase 3 changelog), not by cargo check/test, since a
/// failed TryFrom here was always silently swallowed by `if let Ok`.
/// The same wrong-hash-type bug, from the same root misunderstanding,
/// was present in every other link-target reader in this file.
#[hdk_extern]
pub fn get_critiques_for(target: AnyDhtHash) -> ExternResult<Vec<Record>> {
    let links = get_links(GetLinksInputBuilder::try_new(target, LinkTypes::TargetToCritique)?.build())?;
    let mut critiques = Vec::new();
    for link in links {
        if let Ok(hash) = ActionHash::try_from(link.target) {
            if let Some(record) = get(hash, GetOptions::default())? {
                critiques.push(record);
            }
        }
    }
    Ok(critiques)
}

#[hdk_extern]
pub fn get_critiques_by_mode(mode: CritiqueMode) -> ExternResult<Vec<Record>> {
    let filter = ChainQueryFilter::new()
        .include_entries(true)
        .entry_type(EntryType::App(UnitEntryTypes::Critique.try_into()?));

    let records = query(filter)?;
    let mut critiques = Vec::new();
    for record in records {
        if let Ok(Some(critique)) = record.entry().to_app_option::<Critique>() {
            if critique.critique_mode == mode {
                critiques.push(record);
            }
        }
    }
    Ok(critiques)
}

// ============================================================================
// IMMUNE SYSTEM — ANTIBODY PATTERNS
//
// README §4.2's Biological → Digital mapping named "AntibodyPattern" as
// deferred; this ships the first real increment. See AntibodyPattern's
// own doc comment (integrity zome) for why this is a distinct entry
// type from Critique, not a rename of it: a Critique adjudicates a
// claim's content (Invariant #4's five typed receptor modes); an
// AntibodyPattern flags a structural/behavioral pattern (spam, a sybil
// cluster, plagiarism, coordinated manipulation, impersonation —
// AntibodyPatternKind) independent of whether the content itself is
// right or wrong. Same friction pattern as Critique: a coordinator-side
// pre-check paired with real, unbypassable DHT-side enforcement in the
// integrity zome's validate_antibody_pattern, since a custom client
// could create the entry directly and skip this function entirely.
// ============================================================================

const ANTIBODY_PATTERN_WINDOW_SECS: i64 = 3600;
const ANTIBODY_PATTERN_MAX_PER_WINDOW: usize = 20; // must match integrity zome's limit

/// Mirrors count_recent_critiques exactly, for AntibodyPattern instead.
fn count_recent_antibody_patterns(since: Timestamp) -> ExternResult<usize> {
    let filter = ChainQueryFilter::new()
        .include_entries(false)
        .entry_type(EntryType::App(UnitEntryTypes::AntibodyPattern.try_into()?));
    let records = query(filter)?;

    let count = records
        .iter()
        .filter(|r| r.action().timestamp() >= since)
        .count();

    Ok(count)
}

fn check_antibody_pattern_friction() -> ExternResult<()> {
    let now = sys_time()?;
    let since = Timestamp::from_micros(now.as_micros() - ANTIBODY_PATTERN_WINDOW_SECS * 1_000_000);
    let recent_count = count_recent_antibody_patterns(since)?;

    if recent_count >= ANTIBODY_PATTERN_MAX_PER_WINDOW {
        return Err(wasm_error!(WasmErrorInner::Guest(format!(
            "SWO temporal friction: {} AntibodyPatterns already created in the last {} seconds (limit {}). \
             This is intentional friction, not a reputation judgment — try again later.",
            recent_count, ANTIBODY_PATTERN_WINDOW_SECS, ANTIBODY_PATTERN_MAX_PER_WINDOW
        ))));
    }
    Ok(())
}

#[hdk_extern]
pub fn publish_antibody_pattern(pattern: AntibodyPattern) -> ExternResult<ActionHash> {
    check_antibody_pattern_friction()?;

    let action_hash = create_entry(EntryTypes::AntibodyPattern(pattern.clone()))?;

    // Link from the target (any critiquable node — see CritiqueTargetType,
    // reused here exactly as Critique.target_type does) to this pattern.
    create_link(
        pattern.target.clone(),
        action_hash.clone(),
        LinkTypes::TargetToAntibody,
        LinkTag::new(format!("{:?}", pattern.kind).into_bytes()),
    )?;

    Ok(action_hash)
}

/// Every AntibodyPattern flagging `target` — a raw, unfiltered read, the
/// same shape get_critiques_for already has for Critique. Never scores,
/// ranks, or filters (Invariant #1) — a caller who wants to discount
/// patterns from agents they don't trust composes this with their own
/// judgment, the same way AttestationPolicy/ConductancePolicy stay
/// entirely opt-in rather than a protocol default.
#[hdk_extern]
pub fn get_antibody_patterns_for(target: AnyDhtHash) -> ExternResult<Vec<Record>> {
    let links = get_links(GetLinksInputBuilder::try_new(target, LinkTypes::TargetToAntibody)?.build())?;
    let mut patterns = Vec::new();
    for link in links {
        if let Ok(hash) = ActionHash::try_from(link.target) {
            if let Some(record) = get(hash, GetOptions::default())? {
                patterns.push(record);
            }
        }
    }
    Ok(patterns)
}

// ============================================================================
// EVIDENCE FUNCTIONS
// ============================================================================

/// Returns the EntryHash, not the ActionHash.
///
/// Evidence is only ever referenced by EntryHash — `Claim.evidence_hashes`
/// is a `Vec<EntryHash>`, and get_grounding_path walks those. Returning
/// the ActionHash, as this did, handed callers the one hash they cannot
/// use for the single purpose evidence has, and left them to recover the
/// right one themselves.
///
/// This codebase has already paid for that shape once: the federation
/// work fed create_membrane's ActionHash return value straight into a
/// FederationRecord's EntryHash field and got a Deserialize error out of
/// the integrity zome. Same trap, same fix — hand back the hash the
/// field actually takes.
#[hdk_extern]
pub fn create_evidence(evidence: Evidence) -> ExternResult<EntryHash> {
    create_entry(EntryTypes::Evidence(evidence.clone()))?;
    hash_entry(&evidence)
}

// Accepts either hash type — see get_claim's comment above for why.
#[hdk_extern]
pub fn get_evidence(hash: AnyDhtHash) -> ExternResult<Option<Evidence>> {
    match get(hash, GetOptions::default())? {
        Some(record) => {
            let evidence: Option<Evidence> = record.entry().to_app_option().map_err(|e| wasm_error!(WasmErrorInner::Guest(format!("{:?}", e))))?;
            Ok(evidence)
        }
        None => Ok(None),
    }
}

// ============================================================================
// GROUNDING PATH
//
// "Ground" is the reference potential that terminates a regress of
// support — an observation, a measurement, a body — the same way a
// circuit needs a return path to a fixed reference, not just another
// wire. Every chain of evidential support should eventually rest on
// something that isn't another claim. This makes that auditable
// (read-only, DOES NOT SCORE) rather than merely asserted:
// get_grounding_path walks a Claim's evidence_hashes looking for a path
// that terminates in a real Evidence entry.
//
// AN UNGROUNDED CLAIM IS NOT INVALID. Nothing here gates anything —
// validate_claim already accepts any existing entry hash in
// evidence_hashes (see that function: it only checks the hash resolves
// to *something*, not that the something is Evidence specifically), so
// a claim can exist, be critiqued, be linked, be exported, with no
// grounding at all. This function makes that visible to a caller who
// wants to see it, on request — never blocks it. That's Invariant #2
// (the topology is the truth function, not an algorithm) applied to a
// specific, useful question, and it's deliberately shaped like
// AttestationPolicy and conductance atrophy before it: read-layer,
// opt-in, no protocol verdict.
//
// WHY evidence_hashes CAN LEAD TO ANOTHER CLAIM, NOT JUST EVIDENCE:
// validate_claim doesn't actually enforce that evidence_hashes point at
// Evidence entries specifically — only that the hash resolves to
// *something*. A claim can (and in practice sometimes will) cite another
// Claim as its "evidence" — e.g. building on a prior finding. Grounding
// treats that as a real link in the chain to walk through, not a dead
// end: only an actual Evidence entry counts as ground; a Claim just
// means "keep walking, this isn't ground yet, it's another claim to
// trace back further."
// ============================================================================

const MAX_GROUNDING_SEARCH_NODES: usize = 100;
const DEFAULT_GROUNDING_MAX_DEPTH: u8 = 20;

/// What a single evidence_hashes entry resolves to, for grounding
/// purposes — the three-way distinction the walk actually needs.
#[derive(Clone, Debug)]
enum GroundingNode {
    /// A genuine Evidence entry — the chain terminates here, grounded.
    Evidence,
    /// Another Claim, carrying its own evidence_hashes to continue
    /// walking through.
    Claim(Vec<EntryHash>),
    /// The hash doesn't resolve to anything, or resolves to neither
    /// Evidence nor Claim (e.g. a Critique or Constitution cited by
    /// mistake, or maliciously) — a dead end, not ground, not further
    /// walkable.
    Unknown,
}

/// Pure core of the grounding walk: given `resolve` (host calls in
/// production via resolve_grounding_node, an in-memory fixture map in
/// tests — the same dependency-injection shape as
/// count_attestations_pure), depth-first searches evidence_hashes for
/// ANY path terminating in real Evidence, trying each of a claim's
/// evidence_hashes in order and returning the first that grounds. If
/// none do — including because max_depth or
/// MAX_GROUNDING_SEARCH_NODES was hit first — returns the dead-end
/// point of the first-tried branch, not `false` alone: seeing WHERE a
/// chain breaks down is the actual audit value here, not just knowing
/// that it does. `visited` is shared across the whole recursive walk as
/// both a cycle guard (a claim that cites itself, directly or through a
/// longer loop, must not recurse forever) and the global visit cap.
fn find_grounding_path_pure<F>(
    start: &EntryHash,
    max_depth: u8,
    resolve: &F,
    visited: &mut HashSet<EntryHash>,
) -> ExternResult<(Vec<EntryHash>, bool)>
where
    F: Fn(&EntryHash) -> ExternResult<GroundingNode>,
{
    if visited.contains(start) || visited.len() >= MAX_GROUNDING_SEARCH_NODES {
        return Ok((vec![start.clone()], false));
    }
    visited.insert(start.clone());

    match resolve(start)? {
        GroundingNode::Evidence => Ok((vec![start.clone()], true)),
        GroundingNode::Claim(evidence_hashes) => {
            if max_depth == 0 || evidence_hashes.is_empty() {
                // A genuinely bare claim (no evidence at all) or the
                // depth budget ran out — either way, ungrounded here.
                return Ok((vec![start.clone()], false));
            }
            for next in &evidence_hashes {
                let (sub_path, sub_grounded) =
                    find_grounding_path_pure(next, max_depth - 1, resolve, visited)?;
                if sub_grounded {
                    let mut path = vec![start.clone()];
                    path.extend(sub_path);
                    return Ok((path, true));
                }
            }
            // None of this claim's evidence branches grounded. Report
            // the dead end at THIS claim rather than every failed
            // sub-path — keeps "where it breaks down" legible instead
            // of a sprawling dump of every branch that didn't work.
            Ok((vec![start.clone()], false))
        }
        GroundingNode::Unknown => Ok((vec![start.clone()], false)),
    }
}

/// Host-calling resolver — the thin, untested-at-runtime shim over
/// find_grounding_path_pure's pure algorithm, matching the split already
/// used for bridge_link_type_for, compute_effective_conductance, and
/// count_attestations_pure.
fn resolve_grounding_node(hash: &EntryHash) -> ExternResult<GroundingNode> {
    let record = match get(hash.clone(), GetOptions::default())? {
        Some(r) => r,
        None => return Ok(GroundingNode::Unknown),
    };
    if record.entry().to_app_option::<Evidence>().ok().flatten().is_some() {
        return Ok(GroundingNode::Evidence);
    }
    if let Some(claim) = record.entry().to_app_option::<Claim>().ok().flatten() {
        return Ok(GroundingNode::Claim(claim.evidence_hashes));
    }
    Ok(GroundingNode::Unknown)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GroundingPath {
    /// The chain walked, in order, starting from the queried claim's own
    /// EntryHash. When `grounded` is true, the last entry is the
    /// EntryHash of the Evidence that terminates the chain. When false,
    /// the last entry is the claim (or hash) where the chain broke
    /// down — visibility into WHERE grounding failed, not just that it
    /// did.
    pub path: Vec<EntryHash>,
    pub grounded: bool,
}

/// Walks `claim`'s evidence_hashes (and, transitively, any Claims they
/// cite in turn) looking for a path that terminates in real Evidence.
/// Read-only; does not score, does not gate — see this section's header
/// comment. Accepts either hash type (see get_claim's comment) since a
/// caller may have the ActionHash create_claim returned or an EntryHash
/// from elsewhere.
#[hdk_extern]
pub fn get_grounding_path(claim: AnyDhtHash) -> ExternResult<GroundingPath> {
    let record = get(claim, GetOptions::default())?
        .ok_or(wasm_error!(WasmErrorInner::Guest("Claim not found.".into())))?;
    let claim_entry: Claim = record
        .entry()
        .to_app_option()
        .map_err(|e| wasm_error!(WasmErrorInner::Guest(format!("{:?}", e))))?
        .ok_or(wasm_error!(WasmErrorInner::Guest("Target is not a Claim.".into())))?;
    let claim_hash = hash_entry(&claim_entry)?;

    let mut visited = HashSet::new();
    let (path, grounded) = find_grounding_path_pure(
        &claim_hash,
        DEFAULT_GROUNDING_MAX_DEPTH,
        &resolve_grounding_node,
        &mut visited,
    )?;

    Ok(GroundingPath { path, grounded })
}

// ============================================================================
// MEMBRANE FUNCTIONS
// ============================================================================

#[hdk_extern]
pub fn create_membrane(membrane: Membrane) -> ExternResult<ActionHash> {
    // Friendly pre-check mirroring validate_membrane's DHT-enforced rule
    // (the real enforcement layer, unbypassable by a custom client): the
    // creator must reference their own already-published Constitution,
    // and declare at least one required promise. On its own this
    // coordinator-side check is advisory only — same two-layer shape as
    // SWO temporal friction elsewhere in this file.
    //
    // That description was FALSE when written and is now true.
    // validate_membrane checked only creator-matches-author and a
    // non-empty domain, so neither the constitution nor the promises had
    // any DHT-side enforcement at all and a client bypassing this
    // function could found a domain with no stated demands and a
    // constitution hash pointing at nothing. The checks below were the
    // whole of the "accountable rather than costly" mechanism while
    // being documented as an invariant. The integrity zome now enforces
    // all three; see its own note in validate_membrane.
    if membrane.required_promises.is_empty() {
        return Err(wasm_error!(WasmErrorInner::Guest(
            "Membrane must declare at least one required_promise.".into()
        )));
    }
    let record = get(membrane.constitution.clone(), GetOptions::default())?
        .ok_or(wasm_error!(WasmErrorInner::Guest(
            "Constitution not found — publish one first via publish_constitution.".into()
        )))?;
    let constitution: Constitution = record.entry()
        .to_app_option().map_err(|e| wasm_error!(WasmErrorInner::Guest(format!("{:?}", e))))?
        .ok_or(wasm_error!(WasmErrorInner::Guest("Referenced entry is not a Constitution.".into())))?;
    if constitution.agent != membrane.creator {
        return Err(wasm_error!(WasmErrorInner::Guest(
            "Membrane constitution must be the creator's own published Constitution.".into()
        )));
    }

    create_entry(EntryTypes::Membrane(membrane))
}

/// Creates a Membrane WITHOUT create_membrane's pre-checks, so the
/// integrity zome's own enforcement can be verified against a real
/// conductor rather than asserted.
///
/// This exists for the same reason and on the same terms as
/// SynapticLink's own bypass probe: create_membrane refuses an
/// unaccountable Membrane before the entry is ever built, so a test
/// calling it proves only that the COORDINATOR refuses — which is
/// precisely the confusion that let validate_membrane go without these
/// checks while a comment claimed it had them. Testing the courtesy and
/// reporting it as enforcement is how that gap survived.
///
/// Not an attack surface: every call that a custom client could make to
/// gain something is rejected by validate_membrane, which is the point.
/// If this ever SUCCEEDS with empty required_promises or a constitution
/// that is not the caller's own, the accountability has regressed to
/// coordinator-side courtesy again.
#[hdk_extern]
pub fn attempt_unaccountable_membrane(membrane: Membrane) -> ExternResult<ActionHash> {
    create_entry(EntryTypes::Membrane(membrane))
}

#[hdk_extern]
pub fn get_membranes() -> ExternResult<Vec<Record>> {
    let filter = ChainQueryFilter::new()
        .include_entries(true)
        .entry_type(EntryType::App(UnitEntryTypes::Membrane.try_into()?));
    query(filter)
}

/// Resolves either hash type (see get_claim's comment on AnyDhtHash) down
/// to the Membrane's canonical EntryHash — the value AgentToMembrane
/// links are actually keyed by, so join_membrane and
/// get_membrane_members always agree on the same base regardless of
/// which hash a caller happened to have.
fn membrane_entry_hash(membrane: AnyDhtHash) -> ExternResult<EntryHash> {
    let record = get(membrane, GetOptions::default())?
        .ok_or(wasm_error!(WasmErrorInner::Guest("Membrane not found.".into())))?;
    let membrane_entry: Membrane = record.entry()
        .to_app_option().map_err(|e| wasm_error!(WasmErrorInner::Guest(format!("{:?}", e))))?
        .ok_or(wasm_error!(WasmErrorInner::Guest("Target is not a Membrane entry.".into())))?;
    hash_entry(&membrane_entry)
}

/// Records that the calling agent has joined `membrane` — a voluntary
/// promise (Promise Theory), not something assignable by anyone else;
/// validate_create_link's AgentToMembrane check enforces that the
/// author and the joining agent must be the same. This is the
/// membership record peer attestation would need to check against
/// ("has an existing member SynapticLinked to this new agent's claim")
/// — that gating logic is not implemented yet, only this prerequisite.
///
/// Membership here is unrestricted-to-join (anyone can promise to join
/// any membrane) and idempotent-in-name-only: joining twice creates two
/// AgentToMembrane links rather than being deduplicated. Not a
/// correctness problem for get_membrane_members (a duplicate just shows
/// up twice; callers who need a unique member list should dedupe
/// client-side), but worth knowing going in.
#[hdk_extern]
pub fn join_membrane(membrane: AnyDhtHash) -> ExternResult<ActionHash> {
    let membrane_hash = membrane_entry_hash(membrane)?;
    let agent = agent_info()?.agent_latest_pubkey;
    let member_anchor = agent_anchor_hash(&agent)?;

    create_link(
        membrane_hash,
        member_anchor,
        LinkTypes::AgentToMembrane,
        LinkTag::new(agent.get_raw_36().to_vec()),
    )
}

#[hdk_extern]
pub fn get_membrane_members(membrane: AnyDhtHash) -> ExternResult<Vec<AgentPubKey>> {
    let membrane_hash = membrane_entry_hash(membrane)?;
    let links = get_links(GetLinksInputBuilder::try_new(membrane_hash, LinkTypes::AgentToMembrane)?.build())?;
    Ok(links.into_iter().map(|link| AgentPubKey::from_raw_36(link.tag.0)).collect())
}

// ============================================================================
// FEDERATION
//
// README §9 Phase 5's "federation between domain membranes" — reusing
// the correlative-witness pattern §2.4 already establishes for the
// Twitter bridge (BridgeRecord), applied to a different pair of systems
// that share no DHT: two independently-run Holochain networks, rather
// than Holochain and Twitter. FederationRecord (integrity zome) is
// one-sided by construction — the DHT itself cannot see the remote
// network's data, so it cannot verify the remote side has reciprocated.
// Mutual/"federated" status is derived only by an external witness that
// has actually connected to and queried both conductors — see
// federation/'s bridge service, which does exactly what
// record_twitter_mirror's caller (bridge/src/index.ts) already does for
// Twitter: build the correlation from outside, then record it durably
// on the side(s) it can write to.
// ============================================================================

#[hdk_extern]
pub fn record_federation(record: FederationRecord) -> ExternResult<ActionHash> {
    let action_hash = create_entry(EntryTypes::FederationRecord(record.clone()))?;
    create_link(
        record.local_membrane.clone(),
        action_hash.clone(),
        LinkTypes::MembraneToFederationRecord,
        LinkTag::new(record.remote_network_label.as_bytes().to_vec()),
    )?;
    Ok(action_hash)
}

/// Every FederationRecord `membrane` has itself authored — one-sided,
/// per FederationRecord's own doc comment: this never reports whether
/// any of these recognitions have been reciprocated by the remote side,
/// only what THIS membrane has declared.
#[hdk_extern]
pub fn get_federation_records_for(membrane: AnyDhtHash) -> ExternResult<Vec<Record>> {
    let membrane_hash = membrane_entry_hash(membrane)?;
    let links = get_links(GetLinksInputBuilder::try_new(membrane_hash, LinkTypes::MembraneToFederationRecord)?.build())?;
    let mut records = Vec::new();
    for link in links {
        if let Ok(hash) = ActionHash::try_from(link.target) {
            if let Some(record) = get(hash, GetOptions::default())? {
                records.push(record);
            }
        }
    }
    Ok(records)
}

// ============================================================================
// CRITIQUE SPECIES FUNCTIONS
// ============================================================================

#[hdk_extern]
pub fn create_critique_species(species: CritiqueSpecies) -> ExternResult<ActionHash> {
    let action_hash = create_entry(EntryTypes::CritiqueSpecies(species.clone()))?;

    // Link to parent species if exists.
    if let Some(parent) = species.parent_species {
        create_link(
            parent,
            action_hash.clone(),
            LinkTypes::SpeciesToParent,
            LinkTag::new("child"),
        )?;
    }

    Ok(action_hash)
}

// Accepts either hash type — see get_claim's comment above for why.
#[hdk_extern]
pub fn get_critique_species(hash: AnyDhtHash) -> ExternResult<Option<CritiqueSpecies>> {
    match get(hash, GetOptions::default())? {
        Some(record) => {
            let species: Option<CritiqueSpecies> = record.entry().to_app_option().map_err(|e| wasm_error!(WasmErrorInner::Guest(format!("{:?}", e))))?;
            Ok(species)
        }
        None => Ok(None),
    }
}

#[hdk_extern]
pub fn get_all_critique_species() -> ExternResult<Vec<Record>> {
    let filter = ChainQueryFilter::new()
        .include_entries(true)
        .entry_type(EntryType::App(UnitEntryTypes::CritiqueSpecies.try_into()?));
    query(filter)
}

/// Live, per-species adoption count — how many real Critiques have
/// declared this species via their `species` field, counted from actual
/// CritiqueToSpecies links, not a self-declared stored field.
///
/// Deliberately singular: this takes one species hash and returns one
/// count. There is intentionally no "get all species sorted by adoption"
/// function — that would recreate the ranked-leaderboard failure mode
/// this replacement exists to avoid (see design discussion re: Invariant
/// #1 and Promise Theory's local-assessment model). Anyone who wants to
/// compare adoption across species can call this per species and rank
/// them client-side, on their own terms — the protocol itself doesn't
/// hand back a comparative ranking.
#[hdk_extern]
pub fn get_critique_species_adoption_count(species_hash: EntryHash) -> ExternResult<usize> {
    let links = get_links(GetLinksInputBuilder::try_new(species_hash, LinkTypes::CritiqueToSpecies)?.build())?;
    Ok(links.len())
}

// ============================================================================
// HOLOGRAPHIC REDUCED REPRESENTATIONS (OpenZoo / HRR) — Plate 1995
// ============================================================================
// See README.md §2.5. HRR compresses "who said what, when" into one
// fixed-size real vector via circular convolution ("bind"), approximately
// queryable via circular correlation ("unbind") — lossy by construction,
// never exact. Every function below is pure (no host calls, no DHT
// access) and runs entirely locally over data the caller already has —
// the same "index, not truth engine" role the README insists on: this
// never adjudicates what a claim says, only where (which period) a
// domain's activity might resonate. Wired into worldline binding below
// (generate_worldline_trace) and into query_worldline_resonance, a first
// real increment of "peer HRR query support" — a caller who already has
// a WorldlineTrace's ActionHash (the same way every other hash-addressed
// read in this codebase works; Holochain has no way to enumerate peers
// or their traces on its own) can ask which periods likely cover a
// domain without walking period_boundaries by hand.
//
// Deliberately NOT built in this pass: neighborhood binding (README
// §2.5 is explicit that it's a separate, independent roadmap item, not
// an implied consequence of worldline binding shipping) and any
// FFT-based O(n log n) convolution (HRR_DIM=512 keeps the O(n^2) direct
// sum below cheap enough for something that only ever runs locally, at
// trace-generation or query time — never in a validation hot path).

/// Vector width. 512 * 4 bytes = 2048 bytes per HRR vector — one
/// WorldlineTrace's trace_payload is a single such vector regardless of
/// how many periods it superposes, well inside the 64KB cap
/// validate_worldline_trace already enforces (see integrity's
/// lib.rs), leaving room for real chains with hundreds of periods.
const HRR_DIM: usize = 512;

/// Version/scheme descriptor stored verbatim as WorldlineTrace's
/// binding_key. Not a secret — every quantity in this scheme (dimension,
/// how position symbols are rendered) is derivable from this string
/// alone, and hrr_symbol_vector's output depends on nothing else, so no
/// key exchange is needed for a peer to reproduce it. Its actual job is
/// forward compatibility: query_worldline_resonance checks a fetched
/// trace's binding_key against this constant before trusting its
/// trace_payload's bytes, so a future scheme bump (a different
/// dimension, a different position encoding) fails loudly on an old
/// trace instead of silently misinterpreting its bytes as the new
/// layout.
const HRR_BINDING_KEY: &[u8] = b"hrr-v1;dim=512;pos=period_index";

/// Deterministically derive a unit-length pseudo-random vector for a
/// symbol string — HRR's "atomic vector" construction (Plate 1995 §3).
/// Pure function of the symbol's own bytes: any two peers who derive a
/// vector for the same string get bit-identical results, with no key
/// exchange, which is what lets query_worldline_resonance re-derive the
/// same domain/position vectors a trace's own author used. Splitmix64
/// (seeded from a SHA-256 digest of the symbol, since sha2 is already a
/// dependency via compute_merkle_root — no cryptographic property of
/// either hash is actually needed here, only a well-spread deterministic
/// seed) rather than any external RNG crate, matching this codebase's
/// existing preference for small hand-rolled pure math over new
/// dependencies (see decay_factor, compute_merkle_root).
fn hrr_symbol_vector(symbol: &str) -> [f32; HRR_DIM] {
    let digest = Sha256::digest(symbol.as_bytes());
    let mut state = u64::from_le_bytes(digest[0..8].try_into().unwrap())
        ^ u64::from_le_bytes(digest[8..16].try_into().unwrap());
    let mut v = [0f32; HRR_DIM];
    for slot in v.iter_mut() {
        // splitmix64's standard mixing step.
        state = state.wrapping_add(0x9E3779B97F4A7C15);
        let mut z = state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
        z ^= z >> 31;
        // Map to a standard-normal-ish value via a signed fraction of
        // u64's range — HRR only needs zero-mean, roughly-symmetric
        // per-dimension noise for its concentration-of-measure
        // properties to hold at this dimension, not a true Gaussian.
        *slot = (z as i64 as f64 / i64::MAX as f64) as f32;
    }
    hrr_normalize(&v)
}

/// Rescale to unit length (element-wise, not per-component) — keeps
/// hrr_cosine_similarity comparisons meaningful across vectors built
/// from different numbers of superposed terms.
fn hrr_normalize(v: &[f32; HRR_DIM]) -> [f32; HRR_DIM] {
    let mag = (v.iter().map(|x| x * x).sum::<f32>()).sqrt();
    if mag < f32::EPSILON {
        return *v;
    }
    let mut out = [0f32; HRR_DIM];
    for i in 0..HRR_DIM {
        out[i] = v[i] / mag;
    }
    out
}

/// Circular convolution — HRR's "bind" operator: combines two vectors
/// into one the same fixed size, associating them so hrr_unbind can
/// later approximately recover one given the other.
fn hrr_bind(a: &[f32; HRR_DIM], b: &[f32; HRR_DIM]) -> [f32; HRR_DIM] {
    let mut out = [0f32; HRR_DIM];
    for i in 0..HRR_DIM {
        let mut sum = 0f32;
        for j in 0..HRR_DIM {
            // (i - j) mod HRR_DIM, done in a wrapping-add-then-mod form
            // since Rust's % on a negative isize would otherwise return
            // a negative remainder.
            let k = (i + HRR_DIM - j) % HRR_DIM;
            sum += a[j] * b[k];
        }
        out[i] = sum;
    }
    out
}

/// The involution used by hrr_unbind: v'[i] = v[(-i) mod HRR_DIM] —
/// circular correlation is circular convolution with one operand
/// involuted first (the standard HRR unbind construction, Plate 1995
/// §3.2), so hrr_bind is the only convolution kernel this file needs.
fn hrr_involute(v: &[f32; HRR_DIM]) -> [f32; HRR_DIM] {
    let mut out = [0f32; HRR_DIM];
    for i in 0..HRR_DIM {
        out[i] = v[(HRR_DIM - i) % HRR_DIM];
    }
    out
}

/// Circular correlation — HRR's "unbind" operator, the APPROXIMATE
/// inverse of hrr_bind: hrr_unbind(hrr_bind(a, b), a) ≈ b, never exact,
/// and noisier still once `c` is itself a superposition of several
/// bound pairs (see hrr_superpose) — this is what makes HRR retrieval
/// lossy by construction (README §2.5), not a bug to fix later.
fn hrr_unbind(c: &[f32; HRR_DIM], a: &[f32; HRR_DIM]) -> [f32; HRR_DIM] {
    hrr_bind(c, &hrr_involute(a))
}

/// Superposition — HRR's "combine" operator: element-wise sum,
/// normalized back to unit length. Combining N bound pairs into one
/// vector this way is what makes a WorldlineTrace's trace_payload a
/// single fixed-size field no matter how many periods it covers.
fn hrr_superpose(vectors: &[[f32; HRR_DIM]]) -> [f32; HRR_DIM] {
    let mut out = [0f32; HRR_DIM];
    for v in vectors {
        for i in 0..HRR_DIM {
            out[i] += v[i];
        }
    }
    hrr_normalize(&out)
}

/// How a caller measures "did this resonate" after unbinding — never
/// exact equality; HRR here is a receiver tuned to approximate
/// resonance, never an exact-match index (README §2.5's "receiver, not
/// truth engine" framing carried into the actual math).
fn hrr_cosine_similarity(a: &[f32; HRR_DIM], b: &[f32; HRR_DIM]) -> f32 {
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let mag_a = (a.iter().map(|x| x * x).sum::<f32>()).sqrt();
    let mag_b = (b.iter().map(|x| x * x).sum::<f32>()).sqrt();
    if mag_a < f32::EPSILON || mag_b < f32::EPSILON {
        return 0.0;
    }
    dot / (mag_a * mag_b)
}

fn hrr_vector_to_bytes(v: &[f32; HRR_DIM]) -> Vec<u8> {
    let mut out = Vec::with_capacity(HRR_DIM * 4);
    for x in v {
        out.extend_from_slice(&x.to_le_bytes());
    }
    out
}

/// The exact inverse of hrr_vector_to_bytes — unlike the HRR math
/// itself, this codec round-trips exactly; it's plain little-endian f32
/// serialization, not a lossy operation. Returns None for anything not
/// exactly HRR_DIM * 4 bytes (a trace_payload from an incompatible
/// scheme version, or corrupt data) rather than panicking or silently
/// truncating/padding.
fn hrr_bytes_to_vector(bytes: &[u8]) -> Option<[f32; HRR_DIM]> {
    if bytes.len() != HRR_DIM * 4 {
        return None;
    }
    let mut out = [0f32; HRR_DIM];
    for i in 0..HRR_DIM {
        out[i] = f32::from_le_bytes(bytes[i * 4..i * 4 + 4].try_into().unwrap());
    }
    Some(out)
}

/// The public position-symbol encoding query_worldline_resonance and
/// generate_worldline_trace both derive from — period index N's
/// position vector is always hrr_symbol_vector(&hrr_period_symbol(n)),
/// never anything an entry needs to store per-period, since it's a pure
/// function of the index alone.
fn hrr_period_symbol(index: usize) -> String {
    format!("period:{index}")
}

// ============================================================================
// WORLDLINE TRACE FUNCTIONS
// ============================================================================

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TraceGenerationParams {
    pub period_granularity_secs: u64,
    pub expertise_tags: Vec<String>,
    pub expires_at: Option<u64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct PeriodAccumulator {
    start_time: u64,
    end_time: u64,
    sample_action: ActionHash,
    domain_tag: String,
    entry_count: u32,
}

impl PeriodAccumulator {
    fn into_boundary(self) -> ExternResult<PeriodBoundary> {
        Ok(PeriodBoundary {
            start_time: self.start_time,
            end_time: self.end_time,
            sample_action: self.sample_action,
            domain_tag: self.domain_tag,
            entry_count: self.entry_count,
        })
    }
}

#[hdk_extern]
pub fn generate_worldline_trace(params: TraceGenerationParams) -> ExternResult<ActionHash> {
    let agent = agent_info()?.agent_initial_pubkey;

    let filter = ChainQueryFilter::new()
        .include_entries(true)
        .action_type(ActionType::Create);

    let records = query(filter)?;
    let mut periods: Vec<PeriodBoundary> = Vec::new();
    let mut current_period: Option<PeriodAccumulator> = None;

    for record in records {
        let timestamp = record.action().timestamp().as_seconds_and_nanos().0 as u64;
        let domain_tag = match extract_domain_tag(&record) {
            Ok(tag) => tag,
            Err(_) => continue,
        };

        match &mut current_period {
            Some(period) if period.domain_tag == domain_tag 
                && timestamp.saturating_sub(period.start_time) < params.period_granularity_secs => {
                period.end_time = timestamp;
                period.entry_count += 1;
            }
            _ => {
                if let Some(p) = current_period.take() {
                    periods.push(p.into_boundary()?);
                }
                current_period = Some(PeriodAccumulator {
                    start_time: timestamp,
                    end_time: timestamp,
                    sample_action: record.action_address().clone(),
                    domain_tag,
                    entry_count: 1,
                });
            }
        }
    }

    if let Some(p) = current_period {
        periods.push(p.into_boundary()?);
    }

    let checksum = compute_merkle_root(&periods)?;
    let now = sys_time()?.as_seconds_and_nanos().0 as u64;

    // Worldline binding (README §2.5): superpose (domain_tag ⊛ position)
    // across every period into one fixed-size holographic vector. This
    // runs entirely on the periods just computed above — the same data
    // period_boundaries already carries in plain sight — so it adds no
    // new information a reader couldn't already get by scanning
    // period_boundaries directly; its value is being a fixed-size,
    // superposable index a peer can probe without doing that scan
    // themselves (README §2.5's "optimization, not a requirement").
    let bound_periods: Vec<[f32; HRR_DIM]> = periods
        .iter()
        .enumerate()
        .map(|(i, p)| hrr_bind(&hrr_symbol_vector(&p.domain_tag), &hrr_symbol_vector(&hrr_period_symbol(i))))
        .collect();
    let (trace_payload, binding_key) = if bound_periods.is_empty() {
        // An empty chain has nothing to superpose — leave both hooks
        // unset rather than emit a meaningless all-zero vector, matching
        // this field's documented "currently None" default state for a
        // trace with nothing to compress.
        (None, None)
    } else {
        let trace_vector = hrr_superpose(&bound_periods);
        (Some(hrr_vector_to_bytes(&trace_vector)), Some(HRR_BINDING_KEY.to_vec()))
    };

    let trace = WorldlineTrace {
        agent,
        period_boundaries: periods,
        expertise_tags: params.expertise_tags,
        trace_payload,
        binding_key,
        checksum,
        created_at: now,
        expires_at: params.expires_at,
    };

    let action_hash = create_entry(EntryTypes::WorldlineTrace(trace.clone()))?;

    let agent_anchor = agent_anchor_hash(&trace.agent)?;
    create_link(
        agent_anchor,
        action_hash.clone(),
        LinkTypes::AgentToWorldlineTrace,
        LinkTag::new("worldline"),
    )?;

    Ok(action_hash)
}

#[hdk_extern]
pub fn get_agent_worldline_trace(agent: AgentPubKey) -> ExternResult<Option<WorldlineTrace>> {
    let agent_anchor = agent_anchor_hash(&agent)?;
    let links = get_links(GetLinksInputBuilder::try_new(agent_anchor, LinkTypes::AgentToWorldlineTrace)?.build())?;

    let mut candidates: Vec<WorldlineTrace> = Vec::new();
    for link in links {
        if let Ok(hash) = ActionHash::try_from(link.target) {
            if let Some(record) = get(hash, GetOptions::default())? {
                if let Ok(Some(trace)) = record.entry().to_app_option::<WorldlineTrace>() {
                    let now = sys_time()?.as_seconds_and_nanos().0 as u64;
                    if trace.expires_at.map_or(true, |exp| exp > now) {
                        candidates.push(trace);
                    }
                }
            }
        }
    }

    candidates.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(candidates.into_iter().next())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorldlineResonanceQuery {
    pub agent: AgentPubKey,
    pub domain_tag: String,
    /// How many period indices to score, starting from 0. period_boundaries'
    /// own length is the natural upper bound, but this function
    /// deliberately never reads that field — see this function's own doc
    /// comment for why — so the caller supplies it directly, the same
    /// externally-supplied-bound shape MAX_ATTESTATION_SEARCH_NODES/
    /// MAX_GROUNDING_SEARCH_NODES already use elsewhere in this file.
    pub max_periods: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PeriodResonance {
    pub period_index: u32,
    pub similarity: f32,
}

const MAX_RESONANCE_QUERY_PERIODS: u32 = 4096;

/// First real increment of "peer HRR query support" (README §9 Phase 3):
/// given a peer's AgentPubKey (the same public identifier every other
/// peer-facing read in this codebase already takes — get_agent_worldline_trace
/// itself, assert_expertise's proof) and a domain tag to probe, unbind
/// that peer's most recent WorldlineTrace and rank candidate period
/// indices by how strongly each resonates with that domain — the
/// literal capability README §2.5 describes: "peers can unbind this
/// vector to find relevant time periods without traversing the full
/// chain."
///
/// Approximate by construction (HRR always is) and read-only. This
/// never substitutes for get_agent_worldline_trace's own
/// period_boundaries, which remain the exact, lossless answer — the
/// same "receiver, not truth engine" distinction README §2.5 draws for
/// HRR everywhere else. A high similarity score is a hint worth
/// checking, not a claim of fact; nothing here reads, gates, or scores
/// what any Claim/Mew/Critique actually says.
///
/// Returns an empty result — never an error — when the agent has no
/// trace, an empty trace_payload (nothing was ever superposed into it,
/// e.g. an agent with no chain activity yet), or a binding_key that
/// doesn't match this function's own HRR_BINDING_KEY (unset, or a
/// future/foreign scheme version this function doesn't know how to
/// interpret): "nothing resonates" and "nothing to resonate with" are
/// both legitimately empty answers, not failures.
#[hdk_extern]
pub fn query_worldline_resonance(query: WorldlineResonanceQuery) -> ExternResult<Vec<PeriodResonance>> {
    let max_periods = query.max_periods.min(MAX_RESONANCE_QUERY_PERIODS);

    let trace = match get_agent_worldline_trace(query.agent)? {
        Some(t) => t,
        None => return Ok(Vec::new()),
    };
    let payload = match trace.trace_payload {
        Some(p) => p,
        None => return Ok(Vec::new()),
    };
    match trace.binding_key {
        Some(ref k) if k.as_slice() == HRR_BINDING_KEY => {}
        _ => return Ok(Vec::new()),
    }
    let trace_vector = match hrr_bytes_to_vector(&payload) {
        Some(v) => v,
        None => return Ok(Vec::new()),
    };

    let unbound = hrr_unbind(&trace_vector, &hrr_symbol_vector(&query.domain_tag));
    let mut results: Vec<PeriodResonance> = (0..max_periods)
        .map(|i| PeriodResonance {
            period_index: i,
            similarity: hrr_cosine_similarity(&unbound, &hrr_symbol_vector(&hrr_period_symbol(i as usize))),
        })
        .collect();
    results.sort_by(|a, b| b.similarity.partial_cmp(&a.similarity).unwrap_or(std::cmp::Ordering::Equal));
    Ok(results)
}

/// Formally asserts expertise in a domain as a real, critiquable Claim,
/// backed by the caller's own WorldlineTrace.
///
/// `WorldlineTrace.expertise_tags` remains a lightweight, informal
/// self-index — useful for discovery, not a source of trust on its own.
/// This function is the accountable counterpart: it turns a specific tag
/// into a first-class Claim ("Agent X has demonstrated engagement in
/// domain Y, evidenced by worldline trace Z") that anyone can critique
/// through the existing typed CritiqueMode machinery — Methodological,
/// Evidential, etc. all apply here exactly as they would to any other
/// Claim, since expertise assertions ARE Claims, not a separate,
/// unaccountable field. This is what actually closes the "expertise
/// asserted outside the critique graph" gap — nothing new to validate,
/// it reuses infrastructure Invariant #4 already governs.
#[hdk_extern]
pub fn assert_expertise(payload: ExpertiseAssertionPayload) -> ExternResult<ActionHash> {
    let author = agent_info()?.agent_latest_pubkey;

    // The assertion should be backed by the caller's own WorldlineTrace —
    // you can't assert expertise "evidenced by" someone else's history.
    //
    // A COURTESY, NOT AN ENFORCED RULE, and deliberately so. What this
    // builds is an ordinary Claim, so validate_claim governs it and has
    // no notion of traces; a client bypassing this function can cite
    // anyone's. That is tolerable only because an expertise assertion
    // here is a self-asserted, critiquable Claim carrying no standing —
    // expertise_tags is an informal, non-authoritative index. Any future
    // mechanism that gives these claims weight has to add the validation
    // first. Stated because two comments in this codebase have claimed
    // DHT enforcement that did not exist (see create_membrane); this one
    // is claiming the opposite on purpose. SPEC.md §5.21.
    let record = get(payload.worldline_trace_hash.clone(), GetOptions::default())?
        .ok_or(wasm_error!(WasmErrorInner::Guest("WorldlineTrace not found".into())))?;
    let trace: WorldlineTrace = record.entry()
        .to_app_option().map_err(|e| wasm_error!(WasmErrorInner::Guest(format!("{:?}", e))))?
        .ok_or(wasm_error!(WasmErrorInner::Guest("Invalid WorldlineTrace entry".into())))?;
    if trace.agent != author {
        return Err(wasm_error!(WasmErrorInner::Guest(
            "Can only assert expertise backed by your own WorldlineTrace.".into()
        )));
    }

    let claim = Claim {
        content: format!(
            "Agent {} has demonstrated engagement in domain \"{}\", evidenced by worldline trace {}.",
            author, payload.domain, payload.worldline_trace_hash
        ),
        domain: format!("expertise/{}", payload.domain),
        author: author.clone(),
        timestamp: sys_time()?.as_seconds_and_nanos().0 as u64,
        evidence_hashes: vec![],
        confidence: ConfidenceLevel::Moderate, // self-asserted; not yet contested
        semantic_tags: vec!["expertise-assertion".into(), payload.domain.clone()],
        source_mew: None,
    };

    let action_hash = create_entry(EntryTypes::Claim(claim.clone()))?;

    let agent_anchor = agent_anchor_hash(&author)?;
    create_link(
        agent_anchor,
        action_hash.clone(),
        LinkTypes::AgentToClaim,
        LinkTag::new(claim.domain.as_bytes().to_vec()),
    )?;

    Ok(action_hash)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ExpertiseAssertionPayload {
    pub domain: String,
    pub worldline_trace_hash: ActionHash, // matches generate_worldline_trace's real return type
}

#[hdk_extern]
pub fn sample_period(boundary: PeriodBoundary) -> ExternResult<Vec<Record>> {
    let filter = ChainQueryFilter::new()
        .include_entries(true)
        .action_type(ActionType::Create);

    let records = query(filter)?;
    let sampled: Vec<Record> = records.into_iter()
        .filter(|r| {
            let ts = r.action().timestamp().as_seconds_and_nanos().0 as u64;
            ts >= boundary.start_time && ts <= boundary.end_time
        })
        .collect();

    Ok(sampled)
}

// Accepts either hash type — generate_worldline_trace returns an
// ActionHash; see get_claim's comment above for why both work here.
#[hdk_extern]
pub fn verify_trace_checksum(trace_hash: AnyDhtHash) -> ExternResult<bool> {
    let record = get(trace_hash, GetOptions::default())?
        .ok_or(wasm_error!(WasmErrorInner::Guest("Trace not found".into())))?;

    let trace: WorldlineTrace = record.entry()
        .to_app_option().map_err(|e| wasm_error!(WasmErrorInner::Guest(format!("{:?}", e))))?
        .ok_or(wasm_error!(WasmErrorInner::Guest("Invalid trace entry".into())))?;

    let recomputed = compute_merkle_root(&trace.period_boundaries)?;
    Ok(recomputed == trace.checksum)
}

// ============================================================================
// NEIGHBORHOOD BINDING (OpenZoo / HRR) — README §2.5
// ============================================================================
// A second, independent HRR use case from worldline binding above —
// §2.5 is explicit these are separate roadmap items, not one implying
// the other. Where worldline binding compresses one agent's source
// chain, indexed by time ("when did this agent speak"), neighborhood
// binding compresses one Claim's local neighborhood — its direct
// evidence citations and the critiques that target it — indexed
// associatively ("what's near this claim"), queried by role
// (Evidence/Critique) rather than by period index.
//
// This deliberately does NOT introduce a new DHT entry type. §2.5's own
// constraint table is explicit that neighborhood binding must be "a
// reading lens, never a second record" — so build_neighborhood_binding
// below writes nothing; it's a pure read that recomputes a
// NeighborhoodBinding fresh, every call, from real evidence_hashes and
// get_critiques_for data already on the DHT. Caching one locally (this
// runs "locally, never as a centralized service", same as worldline
// binding) is the caller's own business, not something this protocol
// commits to disk.
//
// §2.5's constraint table also requires that "every value returned by
// an HRR-recall function must carry the source EntryHash/ActionHash
// list it was unbound from" — recall_neighborhood's own NeighborRecall
// results below always carry their real source_hash, drawn only from
// the exact list build_neighborhood_binding produced, never invented —
// and that any such API be "named and documented distinctly from
// get_grounding_path/export_to_n4l, which remain the only exact,
// lossless reads" — see both functions' own doc comments below for
// that distinction stated directly. The sybil-resonance property §2.5's
// table names is explicitly left as an unverified design hypothesis
// there ("not yet testable... a predicted consequence, not a built or
// verified mechanism") — nothing below claims to test or guarantee it;
// it inherits whatever that property turns out to be from the same
// superposition math worldline binding already uses, no new claim is
// made about it here.

const NEIGHBORHOOD_BINDING_KEY: &[u8] = b"hrr-neighborhood-v1;dim=512;pos=source_hash";

/// How this Claim's own evidence_hashes/get_critiques_for data relates
/// to it — deliberately just these two, one hop each, not a transitive
/// walk (get_grounding_path already owns transitive evidence walking;
/// duplicating that here would blur exactly the "reading lens vs. exact
/// read" line §2.5's constraint table draws).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum NeighborKind {
    Evidence,
    Critique,
}

fn hrr_neighbor_role_symbol(kind: &NeighborKind) -> &'static str {
    match kind {
        NeighborKind::Evidence => "neighbor-role:evidence",
        NeighborKind::Critique => "neighbor-role:critique",
    }
}

/// A neighbor's own hash, rendered via the same to_string() this
/// codebase already uses everywhere a hash needs to become a stable
/// string (see ToN4L's "has dht hash" fields) — the identity symbol
/// hrr_bind associates with its role in the corpus, and what
/// recall_neighborhood re-derives to score each of source_hashes
/// against the unbound result.
fn hrr_neighbor_hash_symbol(hash: &AnyDhtHash) -> String {
    format!("neighbor-hash:{}", hash)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NeighborhoodBinding {
    pub claim: AnyDhtHash,
    pub corpus_payload: Vec<u8>,
    pub binding_key: Vec<u8>,
    // The mandatory source-hash list — see this section's own header
    // comment. neighbor_kinds[i] is the role source_hashes[i] was bound
    // under; both empty together for a claim with no evidence or
    // critiques to bind.
    pub neighbor_kinds: Vec<NeighborKind>,
    pub source_hashes: Vec<AnyDhtHash>,
}

// Matches this file's other bounded-search caps (MAX_ATTESTATION_SEARCH_NODES,
// MAX_GROUNDING_SEARCH_NODES) — a claim with an unusually large critique
// stack still gets a bounded, not unbounded, corpus.
const MAX_NEIGHBORHOOD_CRITIQUES: usize = 512;

/// Builds a Claim's neighborhood binding fresh from real DHT data —
/// never stored, see this section's header comment for why. Binds
/// (role_symbol ⊛ neighbor_hash_symbol) for every direct evidence
/// citation and every critique get_critiques_for finds targeting this
/// claim, superposed into one fixed-size corpus_payload alongside the
/// real source_hashes list recall_neighborhood needs to score against.
///
/// Returns an empty binding (not an error) for a claim with no evidence
/// and no critiques — nothing to bind is a legitimate answer, the same
/// judgment generate_worldline_trace already makes for an empty chain.
#[hdk_extern]
pub fn build_neighborhood_binding(claim_hash: AnyDhtHash) -> ExternResult<NeighborhoodBinding> {
    let claim: Claim = get(claim_hash.clone(), GetOptions::default())?
        .ok_or(wasm_error!(WasmErrorInner::Guest("Claim not found".into())))?
        .entry()
        .to_app_option()
        .map_err(|e| wasm_error!(WasmErrorInner::Guest(format!("{:?}", e))))?
        .ok_or(wasm_error!(WasmErrorInner::Guest("Target is not a Claim".into())))?;

    let mut kinds: Vec<NeighborKind> = Vec::new();
    let mut hashes: Vec<AnyDhtHash> = Vec::new();

    for evidence_hash in &claim.evidence_hashes {
        kinds.push(NeighborKind::Evidence);
        hashes.push(AnyDhtHash::from(evidence_hash.clone()));
    }

    let critiques = get_critiques_for(claim_hash.clone())?;
    for record in critiques.into_iter().take(MAX_NEIGHBORHOOD_CRITIQUES) {
        kinds.push(NeighborKind::Critique);
        hashes.push(AnyDhtHash::from(record.action_address().clone()));
    }

    if hashes.is_empty() {
        return Ok(NeighborhoodBinding {
            claim: claim_hash,
            corpus_payload: Vec::new(),
            binding_key: Vec::new(),
            neighbor_kinds: Vec::new(),
            source_hashes: Vec::new(),
        });
    }

    let bound: Vec<[f32; HRR_DIM]> = kinds
        .iter()
        .zip(hashes.iter())
        .map(|(kind, hash)| hrr_bind(&hrr_symbol_vector(hrr_neighbor_role_symbol(kind)), &hrr_symbol_vector(&hrr_neighbor_hash_symbol(hash))))
        .collect();
    let corpus_vector = hrr_superpose(&bound);

    Ok(NeighborhoodBinding {
        claim: claim_hash,
        corpus_payload: hrr_vector_to_bytes(&corpus_vector),
        binding_key: NEIGHBORHOOD_BINDING_KEY.to_vec(),
        neighbor_kinds: kinds,
        source_hashes: hashes,
    })
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RecallNeighborhoodInput {
    pub corpus_payload: Vec<u8>,
    pub binding_key: Vec<u8>,
    // Caller-supplied candidates to probe, each with the role being
    // tested — deliberately NOT "the binding's own source_hashes,
    // filtered by kind": that would just echo neighbor_kinds/
    // source_hashes back with no HRR involved at all, since role is
    // already explicit, stored data on a NeighborhoodBinding a caller
    // holds in full. Scoring caller-supplied candidates instead is what
    // makes this a genuine associative probe rather than a roundabout
    // re-listing of already-known structured fields — a caller can ask
    // "does hash H, as Evidence, belong here" with only corpus_payload
    // and binding_key in hand (received or cached separately from a
    // full NeighborhoodBinding, e.g. from a peer, or checked against a
    // DIFFERENT claim's corpus than the one H was originally bound
    // into), which the by-source_hashes-only shape couldn't answer at
    // all.
    pub candidates: Vec<(AnyDhtHash, NeighborKind)>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NeighborRecall {
    // The mandatory pointer back into the DHT — see this section's
    // header comment. Always exactly the candidate hash this result is
    // about (the caller's own input, echoed back paired with its
    // score) — never a value this function invents.
    pub source_hash: AnyDhtHash,
    pub kind: NeighborKind,
    pub similarity: f32,
}

/// Approximate, associative membership probe over an already-built
/// neighborhood corpus: "does this candidate, under this claimed role,
/// belong near this claim" — scores each (hash, kind) candidate by how
/// strongly bind(role_symbol(kind), hash_symbol(hash)) itself resonates
/// with the corpus (a direct correlation against the candidate's own
/// bound-pair vector, the standard VSA "clean-up" pattern for testing a
/// specific pair's presence in a superposition — mathematically
/// equivalent in expectation to unbinding by role and comparing against
/// the candidate, but doesn't require enumerating every real member
/// first, which is what makes this usable from just corpus_payload/
/// binding_key alone).
///
/// Lossy by construction, like every HRR read in this codebase — this
/// is deliberately NOT get_grounding_path or export_to_n4l, and never a
/// substitute for either: those remain the only exact, lossless reads
/// of a claim's real evidence chain or critique stack (§2.5's own
/// distinction). A NeighborRecall's similarity is a hint worth
/// checking, not a claim of fact.
///
/// Returns an empty result for a binding_key that doesn't match
/// NEIGHBORHOOD_BINDING_KEY (unset, or a future/foreign scheme version)
/// rather than misinterpreting incompatible bytes — the same
/// fail-closed check query_worldline_resonance performs for
/// WorldlineTrace.
#[hdk_extern]
pub fn recall_neighborhood(input: RecallNeighborhoodInput) -> ExternResult<Vec<NeighborRecall>> {
    if input.binding_key.as_slice() != NEIGHBORHOOD_BINDING_KEY {
        return Ok(Vec::new());
    }
    let corpus_vector = match hrr_bytes_to_vector(&input.corpus_payload) {
        Some(v) => v,
        None => return Ok(Vec::new()),
    };
    Ok(score_neighborhood_candidates(&corpus_vector, &input.candidates))
}

/// Shared by recall_neighborhood and query_neighborhood_resonance below —
/// pure, so it's the one thing about either extern this crate's tests
/// can actually exercise directly (see the note on host-call mocking in
/// this crate's own Cargo.toml).
fn score_neighborhood_candidates(corpus_vector: &[f32; HRR_DIM], candidates: &[(AnyDhtHash, NeighborKind)]) -> Vec<NeighborRecall> {
    let mut results: Vec<NeighborRecall> = candidates
        .iter()
        .map(|(hash, kind)| {
            let probe = hrr_bind(&hrr_symbol_vector(hrr_neighbor_role_symbol(kind)), &hrr_symbol_vector(&hrr_neighbor_hash_symbol(hash)));
            NeighborRecall {
                source_hash: hash.clone(),
                kind: kind.clone(),
                similarity: hrr_cosine_similarity(corpus_vector, &probe),
            }
        })
        .collect();
    results.sort_by(|a, b| b.similarity.partial_cmp(&a.similarity).unwrap_or(std::cmp::Ordering::Equal));
    results
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct QueryNeighborhoodResonanceInput {
    pub claim_hash: AnyDhtHash,
    pub candidates: Vec<(AnyDhtHash, NeighborKind)>,
}

/// Peer HRR query support for neighborhood binding — the completion
/// query_worldline_resonance already gave worldline binding, done the
/// same way: one call, no intermediate object for the caller to manage.
///
/// build_neighborhood_binding + recall_neighborhood is already a
/// perfectly usable two-step local pipeline for a caller who wants to
/// cache a corpus and probe it repeatedly (§2.5's "runs locally"
/// framing) — this doesn't replace that, it collapses the common
/// single-shot case ("is X near claim C") into one call any peer can
/// make about any claim, without first fetching and re-passing back a
/// NeighborhoodBinding they have no other use for. Unlike
/// query_worldline_resonance, this needs no owner/peer identity
/// argument at all: a Claim's evidence and critiques are ordinary
/// public DHT data, readable by any agent via the exact same
/// get()/get_critiques_for calls build_neighborhood_binding already
/// makes — there is no agent-specific "whose neighborhood is this"
/// question the way there is for a WorldlineTrace, which is why this
/// takes a claim_hash instead of an AgentPubKey.
///
/// Still a reading lens, not a second record: builds the binding fresh
/// on every call, exactly like build_neighborhood_binding does — see
/// this section's header comment.
#[hdk_extern]
pub fn query_neighborhood_resonance(input: QueryNeighborhoodResonanceInput) -> ExternResult<Vec<NeighborRecall>> {
    let binding = build_neighborhood_binding(input.claim_hash)?;
    if binding.binding_key.as_slice() != NEIGHBORHOOD_BINDING_KEY {
        // A claim with nothing to bind (build_neighborhood_binding's own
        // documented empty case) — nothing to resonate with, not an
        // error.
        return Ok(Vec::new());
    }
    let corpus_vector = match hrr_bytes_to_vector(&binding.corpus_payload) {
        Some(v) => v,
        None => return Ok(Vec::new()),
    };
    Ok(score_neighborhood_candidates(&corpus_vector, &input.candidates))
}

// ============================================================================
// N4L EXPORT
//
// VERIFICATION STATUS: output has been checked by hand against the N4L
// spec (see n4l/arrows-epistemic.sst header for details) but has NOT
// been run through the real N4L Go binary. Run `N4L -v` against a
// sample export before relying on this in production.
// ============================================================================

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct N4LQuery {
    pub domain: Option<String>,
    pub author: Option<AgentPubKey>,
    pub limit: u32,
    pub include_critiques: bool,
    pub include_evidence: bool,
    pub include_antibody_patterns: bool,
}

#[hdk_extern]
pub fn export_to_n4l(params: N4LQuery) -> ExternResult<String> {
    let mut n4l = String::new();
    // N4L requires every content file to open with a `- <chapter title>`
    // declaration (docs/N4L.md's "-section/chapter" syntax) before any
    // other declaration; a bare comment does not satisfy this. Confirmed
    // against the real N4L binary: omitting this line fails the entire
    // export with "Declarations outside a section or chapter at line 1"
    // before a single entry is parsed. See README §5.2 verification note.
    n4l.push_str("- epistemic export\n\n");
    n4l.push_str("# Epistemic Resonance Protocol - N4L Export\n\n");

    // Export claims.
    let claim_filter = ChainQueryFilter::new()
        .include_entries(true)
        .entry_type(EntryType::App(UnitEntryTypes::Claim.try_into()?));

    let claims = query(claim_filter)?;
    for record in claims {
        if let Ok(Some(claim)) = record.entry().to_app_option::<Claim>() {
            if let Some(ref domain) = params.domain {
                if &claim.domain != domain { continue; }
            }
            if let Some(ref author) = params.author {
                if &claim.author != author { continue; }
            }
            // Use hash_entry, not the record's ActionHash: Critique.target
            // and similar cross-references store EntryHash, so the alias here
            // must be derived the same way or references won't resolve.
            let entry_hash = hash_entry(&claim)?;
            n4l.push_str(&claim.to_n4l(&entry_hash));
        }
    }

    // Export critiques if requested.
    if params.include_critiques {
        let critique_filter = ChainQueryFilter::new()
            .include_entries(true)
            .entry_type(EntryType::App(UnitEntryTypes::Critique.try_into()?));

        let critiques = query(critique_filter)?;
        for record in critiques {
            if let Ok(Some(critique)) = record.entry().to_app_option::<Critique>() {
                if let Some(ref author) = params.author {
                    if &critique.author != author { continue; }
                }
                let entry_hash = hash_entry(&critique)?;
                n4l.push_str(&critique.to_n4l(&entry_hash));
            }
        }
    }

    // Export evidence if requested.
    if params.include_evidence {
        let evidence_filter = ChainQueryFilter::new()
            .include_entries(true)
            .entry_type(EntryType::App(UnitEntryTypes::Evidence.try_into()?));

        let evidences = query(evidence_filter)?;
        for record in evidences {
            if let Ok(Some(evidence)) = record.entry().to_app_option::<Evidence>() {
                if let Some(ref author) = params.author {
                    if &evidence.author != author { continue; }
                }
                let entry_hash = hash_entry(&evidence)?;
                n4l.push_str(&evidence.to_n4l(&entry_hash));
            }
        }
    }

    // Export antibody patterns if requested.
    if params.include_antibody_patterns {
        let antibody_filter = ChainQueryFilter::new()
            .include_entries(true)
            .entry_type(EntryType::App(UnitEntryTypes::AntibodyPattern.try_into()?));

        let patterns = query(antibody_filter)?;
        for record in patterns {
            if let Ok(Some(pattern)) = record.entry().to_app_option::<AntibodyPattern>() {
                if let Some(ref author) = params.author {
                    if &pattern.author != author { continue; }
                }
                let entry_hash = hash_entry(&pattern)?;
                n4l.push_str(&pattern.to_n4l(&entry_hash));
            }
        }
    }

    // Export membranes.
    let membrane_filter = ChainQueryFilter::new()
        .include_entries(true)
        .entry_type(EntryType::App(UnitEntryTypes::Membrane.try_into()?));

    let membranes = query(membrane_filter)?;
    for record in membranes {
        if let Ok(Some(membrane)) = record.entry().to_app_option::<Membrane>() {
            let entry_hash = hash_entry(&membrane)?;
            n4l.push_str(&membrane.to_n4l(&entry_hash));
        }
    }

    Ok(n4l)
}

// ============================================================================
// BRIDGE INTEGRATION
// ============================================================================

/// A record paired with the EntryHash it was found under. The zome
/// functions below already have this hash on hand (they compute it to do
/// the link lookup); returning it saves the bridge from having to
/// recompute an entry hash client-side just to call `record_twitter_mirror`
/// with the right value.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UnbridgedRecord {
    pub entry_hash: EntryHash,
    pub record: Record,
}

/// Records a correlative witness and links it from whichever entry was
/// actually mirrored, so get_unbridged_claims/get_unbridged_mews can find
/// it again. `payload.mew_hash` is used as the mirrored entry's hash for
/// both Mews and Claims (see bridge/src/index.ts) despite the field name,
/// so this looks the entry up to decide which link type applies rather
/// than assuming — previously this function created no link at all,
/// which meant every claim looked permanently "unbridged."
/// Decides which BridgeRecord link type applies to a mirrored entry,
/// based on what app entry type it actually turns out to be. Extracted
/// as its own function, separate from the `get()` call that fetches the
/// record in the first place, for one reason: this part is pure (no host
/// call — `to_app_option` just deserializes bytes already in hand), so
/// it's directly unit-testable without mocking the HDK, unlike
/// record_twitter_mirror as a whole. See the "bridge_link_type_for"
/// tests below.
fn bridge_link_type_for(entry: &RecordEntry) -> ExternResult<Option<LinkTypes>> {
    // Deliberately `.ok().flatten()`, not `?`: this probes "is it a
    // Claim? if not, is it a Mew?" — a deserialize failure here means
    // "not this type," the same as a clean Ok(None), not a real error to
    // propagate. This matches extract_domain_tag's existing
    // `if let Ok(Some(x)) = ...to_app_option()` pattern elsewhere in this
    // file. An earlier version of this function used `?` here, which
    // turned "this entry isn't a Claim" into a hard error instead of
    // falling through to check Mew — caught by this file's own tests
    // (bridge_link_type_for_mew_is_mew_to_bridge_record failed against a
    // real build before this fix).
    if entry.to_app_option::<Claim>().ok().flatten().is_some() {
        return Ok(Some(LinkTypes::ClaimToBridgeRecord));
    }
    if entry.to_app_option::<Mew>().ok().flatten().is_some() {
        return Ok(Some(LinkTypes::MewToBridgeRecord));
    }
    Ok(None)
}

#[hdk_extern]
pub fn record_twitter_mirror(payload: BridgeRecord) -> ExternResult<ActionHash> {
    let action_hash = create_entry(EntryTypes::BridgeRecord(payload.clone()))?;

    if let Some(record) = get(payload.mew_hash.clone(), GetOptions::default())? {
        if let Some(link_type) = bridge_link_type_for(record.entry())? {
            create_link(
                payload.mew_hash.clone(),
                action_hash.clone(),
                link_type,
                LinkTag::new("bridged"),
            )?;
        }
    }

    Ok(action_hash)
}

#[hdk_extern]
pub fn get_unbridged_claims() -> ExternResult<Vec<UnbridgedRecord>> {
    let claim_filter = ChainQueryFilter::new()
        .include_entries(true)
        .entry_type(EntryType::App(UnitEntryTypes::Claim.try_into()?));

    let claims = query(claim_filter)?;
    let mut unbridged = Vec::new();

    for record in claims {
        // ClaimToBridgeRecord links are keyed by the claim's EntryHash
        // (see record_twitter_mirror and TargetToCritique's identical
        // convention), not its ActionHash — querying by ActionHash here
        // would never match even once the link above is actually created.
        if let Ok(Some(claim)) = record.entry().to_app_option::<Claim>() {
            let claim_hash = hash_entry(&claim)?;
            let links = get_links(GetLinksInputBuilder::try_new(claim_hash.clone(), LinkTypes::ClaimToBridgeRecord)?.build())?;
            if links.is_empty() {
                unbridged.push(UnbridgedRecord { entry_hash: claim_hash, record });
            }
        }
    }

    Ok(unbridged)
}

#[hdk_extern]
pub fn get_unbridged_mews() -> ExternResult<Vec<UnbridgedRecord>> {
    let mew_filter = ChainQueryFilter::new()
        .include_entries(true)
        .entry_type(EntryType::App(UnitEntryTypes::Mew.try_into()?));

    let mews = query(mew_filter)?;
    let mut unbridged = Vec::new();

    for record in mews {
        if let Ok(Some(mew)) = record.entry().to_app_option::<Mew>() {
            let mew_hash = hash_entry(&mew)?;
            let links = get_links(GetLinksInputBuilder::try_new(mew_hash.clone(), LinkTypes::MewToBridgeRecord)?.build())?;
            if links.is_empty() {
                unbridged.push(UnbridgedRecord { entry_hash: mew_hash, record });
            }
        }
    }

    Ok(unbridged)
}

#[hdk_extern]
pub fn import_twitter_reply(payload: ExternalCritique) -> ExternResult<ActionHash> {
    let action_hash = create_entry(EntryTypes::ExternalCritique(payload.clone()))?;

    // Link from the original claim.
    create_link(
        payload.linked_holochain_claim.clone(),
        action_hash.clone(),
        LinkTypes::ClaimToExternalCritique,
        LinkTag::new("twitter"),
    )?;

    Ok(action_hash)
}

#[hdk_extern]
pub fn get_twitter_replies_for_claim(claim_hash: EntryHash) -> ExternResult<Vec<Record>> {
    let links = get_links(GetLinksInputBuilder::try_new(claim_hash, LinkTypes::ClaimToExternalCritique)?.build())?;
    let mut replies = Vec::new();
    for link in links {
        if let Ok(hash) = ActionHash::try_from(link.target) {
            if let Some(record) = get(hash, GetOptions::default())? {
                replies.push(record);
            }
        }
    }
    Ok(replies)
}

// ============================================================================
// ATTESTATION GRANT
//
// An explicit, costed act of vouching — separate from, and additional
// to, the implicit attestation ATTESTATION POLICY (below) already
// derives from SynapticLink activity for free. Where a SynapticLink is
// a side effect of critiquing that costs nothing extra to also count as
// attestation, an AttestationGrant is a deliberate act carrying two real
// costs, both enforced at the validation layer (see the integrity
// zome's AttestationGrant branch — the actual enforcement; everything
// here is only the friendly, bypassable pre-check plus a convenience
// lookup):
//   - TENURE: only an agent who has belonged to `membrane` for at least
//     the integrity zome's ATTESTATION_GRANT_MIN_TENURE_SECS_VALIDATION
//     may grant — proven by referencing their own AgentToMembrane join
//     action, the same self-supplied-but-independently-verified shape
//     as assert_expertise's WorldlineTrace proof.
//   - BUDGET: only so many grants per rolling window, per granter —
//     mirrors the SynapticLink/Reinforcement/Critique friction pattern
//     exactly, just with its own (smaller, slower) numbers, since
//     vouching for a new agent is meant to be a rarer, more deliberate
//     act than critiquing.
// This is the "the cost of attesting should fall on the attester"
// refinement applied to the right to confer attestation, not to the act
// of critiquing itself — direct_attesters_of (below) unions this source
// with the existing SynapticLink-derived one.
// ============================================================================

const ATTESTATION_GRANT_WINDOW_SECS: i64 = 7 * 24 * 3600;
const ATTESTATION_GRANT_MAX_PER_WINDOW: usize = 5; // must match integrity zome's limit

fn count_recent_attestation_grants(since: Timestamp) -> ExternResult<usize> {
    let filter = ChainQueryFilter::new()
        .action_type(ActionType::CreateLink)
        .include_entries(false);
    let records = query(filter)?;

    let grant_type: ScopedLinkType = LinkTypes::AttestationGrant
        .try_into()
        .map_err(|_| wasm_error!(WasmErrorInner::Guest("Could not resolve AttestationGrant type.".into())))?;

    let count = records
        .iter()
        .filter(|r| match r.action() {
            Action::CreateLink(cl) => {
                cl.timestamp >= since
                    && cl.zome_index == grant_type.zome_index
                    && cl.link_type == grant_type.zome_type
            }
            _ => false,
        })
        .count();

    Ok(count)
}

fn check_attestation_grant_friction() -> ExternResult<()> {
    let now = sys_time()?;
    let since = Timestamp::from_micros(now.as_micros() - ATTESTATION_GRANT_WINDOW_SECS * 1_000_000);
    let recent_count = count_recent_attestation_grants(since)?;

    if recent_count >= ATTESTATION_GRANT_MAX_PER_WINDOW {
        return Err(wasm_error!(WasmErrorInner::Guest(format!(
            "SWO temporal friction: {} AttestationGrants already created in the last {} seconds \
             (limit {}). This bounds how fast the right to vouch can be spent — try again later.",
            recent_count, ATTESTATION_GRANT_WINDOW_SECS, ATTESTATION_GRANT_MAX_PER_WINDOW
        ))));
    }
    Ok(())
}

/// Finds the calling agent's own AgentToMembrane join action for
/// `membrane`, if they've joined — the ActionHash grant_attestation
/// needs to prove tenure with. A convenience for callers who joined a
/// while ago and no longer have join_membrane's return value cached.
/// get_links is the right tool here (unlike in the integrity zome's
/// validation, which must stick to must_get_* for deterministic
/// results across validators) because this is an ordinary,
/// eventually-consistent coordinator-side read, not a validation check.
#[hdk_extern]
pub fn get_my_membership_action(membrane: AnyDhtHash) -> ExternResult<Option<ActionHash>> {
    let membrane_hash = membrane_entry_hash(membrane)?;
    let agent = agent_info()?.agent_latest_pubkey;
    let links = get_links(GetLinksInputBuilder::try_new(membrane_hash, LinkTypes::AgentToMembrane)?.build())?;
    Ok(links
        .into_iter()
        .find(|link| AgentPubKey::from_raw_36(link.tag.0.clone()) == agent)
        .map(|link| link.create_link_hash))
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GrantAttestationPayload {
    pub candidate: AgentPubKey,
    pub membrane: AnyDhtHash,
    /// The granter's own AgentToMembrane join action for this membrane —
    /// see get_my_membership_action. Required explicitly, rather than
    /// looked up internally, so which membership is being proven is
    /// unambiguous — the same reasoning as assert_expertise requiring
    /// its WorldlineTrace hash explicitly rather than having the
    /// function guess which trace to use.
    pub my_membership_action: ActionHash,
}

/// Explicitly vouches that `candidate` should be treated as attested
/// within `membrane` — the sole way an AttestationGrant link is
/// created, funneled through the friction check the same way
/// reinforce_synaptic_link funnels Reinforcement creation through its
/// own. The real enforcement (tenure AND budget) is DHT-side (integrity
/// zome's validate_create_link, AttestationGrant branch); this is the
/// friendly, bypassable pre-check.
#[hdk_extern]
pub fn grant_attestation(payload: GrantAttestationPayload) -> ExternResult<ActionHash> {
    check_attestation_grant_friction()?;
    let membrane_hash = membrane_entry_hash(payload.membrane)?;
    create_link(
        membrane_hash,
        payload.candidate,
        LinkTypes::AttestationGrant,
        LinkTag::new(payload.my_membership_action.get_raw_36().to_vec()),
    )
}

// ============================================================================
// ATTESTATION POLICY
//
// Read layer, not validation layer: the DHT records who reinforces and
// SynapticLinks whom as ordinary links and interprets none of it —
// attestation is never DHT-enforced, never blocks anything from being
// created, and is never computed by the protocol as a default. A
// protocol-level, hardcoded attested/unattested filter was deliberately
// NOT built: applied automatically and without a caller's say, it would
// itself be a canonical, comparative reputation signal, which Invariant
// #1 rules out ("never compute or expose a canonical, comparative
// reputation score"). What's here instead is an explicit, OPT-IN,
// caller-supplied policy: get_discourse_health's default
// (attestation_policy: None) hands back everything and takes no
// position, exactly as before this existed. A caller who wants to
// discount unattested activity says so themselves, on their own terms —
// that's subjective trust, Promise Theory's actual model (see Appendix
// A's Invariant #1 discussion), not a protocol verdict.
//
// DEFINITION: agent A "directly attests" agent B if either (a) A has
// created a SynapticLink connecting to one of B's Claims (the same
// SynapticLink create_critique already makes for every Critique — no
// new DHT writes needed, this only reads existing ones; global, not
// membrane-scoped), or (b) A has created an AttestationGrant for B
// within the membrane this check is scoped to (see ATTESTATION GRANT
// above — a costed, deliberate vouch, membrane-scoped because that's
// where its tenure requirement is anchored). With max_attestation_depth
// > 1, attestation is transitive and bounded: A also counts as
// attesting B if A is themselves attested (by either source) by the
// root set within one fewer hop. This is a genuine, bounded
// web-of-trust walk (with a cycle guard and a hard node-visit cap — same
// "heuristic, not exhaustive" shape as the WorldlineTrace checkpoint
// bounding elsewhere in this file), not a network-wide search:
// Holochain doesn't offer a way to enumerate "every agent," so this only
// ever walks outward from the specific candidate being checked.
// ============================================================================

const MAX_ATTESTATION_SEARCH_NODES: usize = 100;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AttestationPolicy {
    /// The trusted root set an attester must belong to (directly, or
    /// transitively within max_attestation_depth) to count.
    /// `None` means no restriction at all — any agent's SynapticLink
    /// counts as an attestation, and min_attestations is the only real
    /// constraint. This is NOT the same as omitting the whole policy
    /// (Option<AttestationPolicy> = None at the call site): that skips
    /// attestation filtering entirely, whereas this still requires
    /// min_attestations distinct attesters, just from anyone.
    pub require_attestation_from: Option<Vec<AgentPubKey>>,
    /// How many distinct (direct-or-transitive) attesters are required.
    pub min_attestations: usize,
    /// How many hops of transitive attestation to allow. `None` or
    /// `Some(0)`/`Some(1)` behave the same — only direct attestation
    /// from the root set counts (no meaningful difference between them,
    /// since depth 0 vs depth 1 both mean "no transitivity" here).
    /// Ignored when require_attestation_from is None, since without a
    /// root set there's nothing to be a bounded number of hops away from.
    pub max_attestation_depth: Option<u8>,
}

/// Every agent who has attested `agent` — the raw, unfiltered "who has
/// attested this agent at all" set that count_attestations_pure searches
/// over, unioning both sources described in ATTESTATION GRANT's DEFINITION
/// comment above. Real host calls (get_claims_by_agent, get_links); kept
/// separate from the pure graph-walk logic below specifically so that
/// logic can be unit tested without mocking the HDK, the same way
/// bridge_link_type_for and compute_effective_conductance were split
/// from their I/O.
fn direct_attesters_of(agent: &AgentPubKey, membrane: &EntryHash) -> ExternResult<Vec<AgentPubKey>> {
    let mut attesters: Vec<AgentPubKey> = Vec::new();

    // Source 1: SynapticLink-derived — free, global, unscoped by
    // membrane (a SynapticLink is created wherever a critique happens,
    // with no membrane context anywhere in that schema).
    let claims = get_claims_by_agent(agent.clone())?;
    for record in &claims {
        if let Ok(Some(claim)) = record.entry().to_app_option::<Claim>() {
            let claim_hash = hash_entry(&claim)?;
            let links = get_links(GetLinksInputBuilder::try_new(claim_hash, LinkTypes::SynapticLink)?.build())?;
            for link in links {
                if !attesters.contains(&link.author) {
                    attesters.push(link.author);
                }
            }
        }
    }

    // Source 2: AttestationGrant-derived — explicit, tenure-gated (at
    // creation time — see the integrity zome), budget-limited vouching,
    // scoped to this specific membrane (AttestationGrant's base).
    let grant_links = get_links(GetLinksInputBuilder::try_new(membrane.clone(), LinkTypes::AttestationGrant)?.build())?;
    for link in grant_links {
        if let Ok(candidate) = AgentPubKey::try_from(link.target.clone()) {
            if &candidate == agent && !attesters.contains(&link.author) {
                attesters.push(link.author);
            }
        }
    }

    Ok(attesters)
}

/// Pure core of the attestation walk: given `direct_attesters` (a
/// lookup — real host calls in production via direct_attesters_of, or a
/// plain in-memory closure in tests), counts how many of `candidate`'s
/// direct-or-transitive attesters fall within `roots`, bounded by
/// `max_depth` hops and MAX_ATTESTATION_SEARCH_NODES total visits.
/// `visited` is shared across the whole recursive walk as both a cycle
/// guard (an agent already being checked can't also count as their own
/// attester through some indirect path back to themselves) and the
/// global visit-count cap.
fn count_attestations_pure<F>(
    candidate: &AgentPubKey,
    roots: &[AgentPubKey],
    max_depth: u8,
    direct_attesters: &F,
    visited: &mut HashSet<AgentPubKey>,
) -> ExternResult<usize>
where
    F: Fn(&AgentPubKey) -> ExternResult<Vec<AgentPubKey>>,
{
    if visited.contains(candidate) || visited.len() >= MAX_ATTESTATION_SEARCH_NODES {
        return Ok(0);
    }
    visited.insert(candidate.clone());

    let attesters = direct_attesters(candidate)?;

    let mut count = 0usize;
    for attester in &attesters {
        if roots.contains(attester) {
            count += 1;
        } else if max_depth > 0 {
            let transitively_attested =
                count_attestations_pure(attester, roots, max_depth - 1, direct_attesters, visited)?;
            if transitively_attested > 0 {
                count += 1;
            }
        }
    }
    Ok(count)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct IsAgentAttestedPayload {
    pub candidate: AgentPubKey,
    /// Which membrane's AttestationGrant links to also consider — see
    /// direct_attesters_of's DEFINITION comment. SynapticLink-derived
    /// attestation is unaffected by this (it's global); this only scopes
    /// the AttestationGrant source, since that's the source whose cost
    /// (tenure) is inherently anchored to a specific membrane's
    /// membership.
    pub membrane: AnyDhtHash,
    pub policy: AttestationPolicy,
}

/// Whether `candidate` satisfies `policy` within `membrane` — see
/// AttestationPolicy's own field docs and this section's header comment
/// for the full semantics.
#[hdk_extern]
pub fn is_agent_attested(payload: IsAgentAttestedPayload) -> ExternResult<bool> {
    let Some(ref roots) = payload.policy.require_attestation_from else {
        return Ok(true);
    };
    let membrane_hash = membrane_entry_hash(payload.membrane)?;
    let max_depth = payload.policy.max_attestation_depth.unwrap_or(1);
    let mut visited = HashSet::new();
    let count = count_attestations_pure(
        &payload.candidate,
        roots,
        max_depth,
        &|agent: &AgentPubKey| direct_attesters_of(agent, &membrane_hash),
        &mut visited,
    )?;
    Ok(count >= payload.policy.min_attestations)
}

// ============================================================================
// DISCOURSE HEALTH
// ============================================================================

// CONDUCTANCE POLICY
//
// Read layer, same opt-in shape as AttestationPolicy immediately above:
// get_effective_conductance (CONDUCTANCE ATROPHY section) has existed
// since Phase 1 but was never wired into any aggregate read as an actual
// filter — this closes that gap. A protocol-level default that silently
// discounted low-conductance critiques was deliberately NOT built, for
// the same Invariant #1 reason AttestationPolicy stays opt-in: applied
// automatically, it would itself be a canonical, comparative judgment
// about whose critique "counts." payload.conductance_policy: None (the
// default) is exactly the old, unfiltered behavior — every critique in
// the domain counts, no conductance check performed at all. A caller who
// wants to discount critiques nobody has reinforced says so themselves,
// on their own terms.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConductancePolicy {
    /// A critique is only counted if its SynapticLink's read-time
    /// effective conductance (base conductance decayed since creation,
    /// plus one decaying contribution per Reinforcement — see
    /// get_effective_conductance) is at least this. A critique with no
    /// discoverable SynapticLink at all (should not happen in practice —
    /// create_critique always makes one — but handled defensively) is
    /// treated as conductance 0.0, i.e. excluded by any positive
    /// threshold.
    pub min_effective_conductance: f32,
}

/// The effective conductance of the SynapticLink create_critique made
/// for `critique` (base: critique.target, target: the critique's own
/// ActionHash — see create_critique and find_synaptic_link), or 0.0 if
/// none is found. Split out so get_discourse_health's loop body stays
/// readable; not itself an extern, since callers who want this for a
/// critique they already hold can already compose find_synaptic_link +
/// get_effective_conductance themselves.
fn critique_effective_conductance(critique: &Critique, critique_action: &ActionHash) -> ExternResult<f32> {
    let base: AnyDhtHash = match AnyDhtHash::try_from(critique.target.clone()) {
        Ok(hash) => hash,
        Err(_) => return Ok(0.0),
    };
    let synaptic_link_action = find_synaptic_link(FindSynapticLinkPayload {
        base,
        target_action: critique_action.clone(),
    })?;
    match synaptic_link_action {
        Some(link_action) => get_effective_conductance(link_action),
        None => Ok(0.0),
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DiscourseHealth {
    pub domain: String,
    pub abstract_to_embodied_ratio: f32,
    pub warning: Option<String>,
    pub total_claims: u32,
    pub total_critiques: u32,
    pub critique_mode_distribution: Vec<(CritiqueMode, u32)>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GetDiscourseHealthPayload {
    /// The Membrane this health check is scoped to. Previously this
    /// field was `domain: String` — free text, unrelated to any real
    /// entry, so a caller could ask for the "health" of a domain no one
    /// had ever founded a membrane for, or that had never articulated
    /// what it demands (see Membrane's own doc comment on
    /// required_promises/constitution). The domain actually queried is
    /// now read from the resolved Membrane entry's own `domain` field,
    /// not independently supplied — the aggregate is anchored to
    /// something that actually exists on the DHT.
    pub membrane: AnyDhtHash,
    /// Opt-in — see the ATTESTATION POLICY section above. `None`
    /// (the default a caller gets by simply omitting this field) means
    /// exactly the old, unfiltered behavior: every critique in the
    /// domain counts, no attestation check performed at all. When
    /// `Some`, this membrane is also what scopes the AttestationGrant
    /// source in is_agent_attested's check.
    pub attestation_policy: Option<AttestationPolicy>,
    /// Opt-in — see the CONDUCTANCE POLICY section above. `None` (the
    /// default a caller gets by simply omitting this field) means every
    /// critique in the domain counts regardless of how decayed or
    /// reinforced its SynapticLink is, exactly the behavior before this
    /// field existed. When `Some`, independent of attestation_policy —
    /// a critique must pass both checks (whichever are `Some`) to count.
    pub conductance_policy: Option<ConductancePolicy>,
}

/// Abstract-to-embodied ratio for a domain's critiques.
///
/// Split out as pure logic so its edge cases can be tested directly —
/// the same treatment bridge_link_type_for and distinct_other_domains
/// already get — because the one that matters is invisible from inside
/// get_discourse_health's host calls.
///
/// THE EDGE CASE THIS FIXES. `experiential == 0` used to yield
/// `f32::MAX` unconditionally, which trips the > 3.0 warning. That is
/// right when there IS abstract discourse and nothing embodied to
/// ground it, and wrong when there are simply no critiques at all: a
/// freshly founded domain announced "discourse becoming detached from
/// practice" before anyone had said anything. Two different situations
/// were being collapsed into one sentinel.
///
/// It was invisible until the UI surfaced discourse health, and then
/// obvious in the first screenshot of a domain founded through the new
/// flow. A warning that fires on every new domain is also a warning
/// people learn to ignore, which costs more than the false positive.
fn discourse_ratio(logical_count: u32, experiential_count: u32) -> f32 {
    if experiential_count > 0 {
        logical_count as f32 / experiential_count as f32
    } else if logical_count > 0 {
        // Real abstract discourse with no embodied report grounding it.
        f32::MAX
    } else {
        // No critiques at all. Nothing has drifted from practice,
        // because nothing has happened yet.
        0.0
    }
}

#[hdk_extern]
pub fn get_discourse_health(payload: GetDiscourseHealthPayload) -> ExternResult<DiscourseHealth> {
    let membrane_record = get(payload.membrane, GetOptions::default())?
        .ok_or(wasm_error!(WasmErrorInner::Guest("Membrane not found.".into())))?;
    let membrane_entry: Membrane = membrane_record.entry()
        .to_app_option().map_err(|e| wasm_error!(WasmErrorInner::Guest(format!("{:?}", e))))?
        .ok_or(wasm_error!(WasmErrorInner::Guest("Target is not a Membrane.".into())))?;
    let membrane_hash = hash_entry(&membrane_entry)?;
    let domain = membrane_entry.domain.clone();
    let claims = get_claims_by_domain(domain.clone())?;

    // TargetToCritique links are indexed by the claim's EntryHash (see
    // create_critique, which links from critique.target), not its
    // ActionHash — so each claim's EntryHash must be derived via
    // hash_entry(), the same pattern used in export_to_n4l. The previous
    // version collected record.action_address() (an ActionHash) into a
    // Vec<EntryHash>, which wouldn't compile, and even if it had, would
    // have looked up critiques under the wrong hash and silently
    // returned zero for every claim.
    let mut claim_hashes: Vec<EntryHash> = Vec::new();
    for record in &claims {
        if let Ok(Some(claim)) = record.entry().to_app_option::<Claim>() {
            claim_hashes.push(hash_entry(&claim)?);
        }
    }

    let mut total_critiques = 0u32;
    let mut mode_counts: Vec<(CritiqueMode, u32)> = vec![
        (CritiqueMode::Experiential, 0),
        (CritiqueMode::Methodological, 0),
        (CritiqueMode::Logical, 0),
        (CritiqueMode::Evidential, 0),
        (CritiqueMode::Phenomenological, 0),
    ];

    let mut logical_count = 0u32;
    let mut experiential_count = 0u32;

    // Cache attestation results per author within this call — several
    // critiques being tallied here likely share an author, and
    // is_agent_attested's graph walk isn't free.
    let mut attestation_cache: HashMap<AgentPubKey, bool> = HashMap::new();

    for hash in claim_hashes {
        let critiques = get_critiques_for(hash.into())?;

        for record in critiques {
            if let Ok(Some(critique)) = record.entry().to_app_option::<Critique>() {
                if let Some(ref policy) = payload.attestation_policy {
                    let attested = match attestation_cache.get(&critique.author) {
                        Some(&cached) => cached,
                        None => {
                            let result = is_agent_attested(IsAgentAttestedPayload {
                                candidate: critique.author.clone(),
                                membrane: membrane_hash.clone().into(),
                                policy: policy.clone(),
                            })?;
                            attestation_cache.insert(critique.author.clone(), result);
                            result
                        }
                    };
                    if !attested {
                        continue;
                    }
                }

                if let Some(ref policy) = payload.conductance_policy {
                    let effective = critique_effective_conductance(&critique, record.action_address())?;
                    if effective < policy.min_effective_conductance {
                        continue;
                    }
                }

                total_critiques += 1;
                for (mode, count) in &mut mode_counts {
                    if *mode == critique.critique_mode {
                        *count += 1;
                    }
                }
                if critique.critique_mode == CritiqueMode::Logical {
                    logical_count += 1;
                }
                if critique.critique_mode == CritiqueMode::Experiential {
                    experiential_count += 1;
                }
            }
        }
    }

    let ratio = discourse_ratio(logical_count, experiential_count);

    let warning = if ratio > 3.0 {
        Some("Discourse becoming detached from practice. More experiential data needed.".into())
    } else {
        None
    };

    Ok(DiscourseHealth {
        domain,
        abstract_to_embodied_ratio: ratio,
        warning,
        total_claims: claims.len() as u32,
        total_critiques,
        critique_mode_distribution: mode_counts,
    })
}

// ============================================================================
// CROSS-DOMAIN CRITIQUE LINKS
//
// README.md's Fractal Impedance Matching section (SWO pillar, §2.3)
// names "mesh topology between domains (cross-domain critique links)"
// as the same multi-pool structure SWO's fragmented liquidity pools
// create — but nothing before this shipped the actual mechanism, and
// nothing needed to: Critique.target is already AnyLinkableHash (see
// the scale-invariant Critique work, §2.6), so an agent could already
// critique a Claim in a domain other than their own with no validation
// change required. What was actually missing was the ability to SEE
// that mesh — a real, queryable answer to "which critiques in this
// domain came from agents whose own claims live elsewhere," rather than
// the metaphor sitting unbacked by any function. This is a reading
// lens only (Invariant #2 — the topology is the truth function), the
// same shape get_grounding_path already uses: it never scores, ranks,
// or gates anything, and creating/critiquing across domains was never
// blocked by anything before this existed either. A critique counts as
// cross-domain here if its author has authored at least one real Claim
// in a domain other than the one being critiqued into — a literal,
// checkable operationalization of "cross-domain," not a fuzzier
// heuristic (e.g. "critiques mostly outside their home domain"), which
// would require defining what a "home domain" even means for an agent
// who has claims in several.
// ============================================================================

/// Every domain (other than `home_domain`) that appears in
/// `claim_domains` — deduplicated, order-preserving. Pure so the actual
/// filtering/dedup logic is directly unit-testable without a DHT; the
/// host-calling half (which domains an agent's own claims are actually
/// in) lives in get_cross_domain_critiques below, the same split
/// bridge_link_type_for/compute_effective_conductance already use.
fn distinct_other_domains(claim_domains: &[String], home_domain: &str) -> Vec<String> {
    let mut others: Vec<String> = Vec::new();
    for domain in claim_domains {
        if domain != home_domain && !others.contains(domain) {
            others.push(domain.clone());
        }
    }
    others
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CrossDomainCritique {
    pub critique_action: ActionHash,
    pub critique_author: AgentPubKey,
    /// Distinct domains — other than the membrane's own — the
    /// critiquing agent has authored at least one real Claim in. Always
    /// non-empty for an entry in get_cross_domain_critiques' result,
    /// since that's the condition for being included at all.
    pub critiquer_home_domains: Vec<String>,
}

/// Every critique of a Claim in `membrane`'s domain whose author has
/// also authored at least one Claim in a different domain — the real,
/// queryable mesh topology CROSS-DOMAIN CRITIQUE LINKS above discusses.
/// Read-only: never scores or gates, matching get_grounding_path's own
/// shape and the same Invariant #1/#2 reasoning AttestationPolicy and
/// ConductancePolicy already document — this surfaces real structure,
/// it doesn't rank agents by how "cross-domain" they are.
#[hdk_extern]
pub fn get_cross_domain_critiques(membrane: AnyDhtHash) -> ExternResult<Vec<CrossDomainCritique>> {
    let membrane_record = get(membrane, GetOptions::default())?
        .ok_or(wasm_error!(WasmErrorInner::Guest("Membrane not found.".into())))?;
    let membrane_entry: Membrane = membrane_record.entry()
        .to_app_option().map_err(|e| wasm_error!(WasmErrorInner::Guest(format!("{:?}", e))))?
        .ok_or(wasm_error!(WasmErrorInner::Guest("Target is not a Membrane.".into())))?;
    let home_domain = membrane_entry.domain.clone();

    let claims = get_claims_by_domain(home_domain.clone())?;
    let mut claim_hashes: Vec<EntryHash> = Vec::new();
    for record in &claims {
        if let Ok(Some(claim)) = record.entry().to_app_option::<Claim>() {
            claim_hashes.push(hash_entry(&claim)?);
        }
    }

    // Cache each author's own claim domains within this call — the same
    // reasoning get_discourse_health's attestation_cache already gives:
    // several critiques being scanned here likely share an author, and
    // get_claims_by_agent isn't free.
    let mut author_domains_cache: HashMap<AgentPubKey, Vec<String>> = HashMap::new();
    let mut results: Vec<CrossDomainCritique> = Vec::new();

    for hash in claim_hashes {
        let critiques = get_critiques_for(hash.into())?;
        for record in critiques {
            if let Ok(Some(critique)) = record.entry().to_app_option::<Critique>() {
                let author_domains = match author_domains_cache.get(&critique.author) {
                    Some(cached) => cached.clone(),
                    None => {
                        let their_claims = get_claims_by_agent(critique.author.clone())?;
                        let mut domains = Vec::new();
                        for their_record in &their_claims {
                            if let Ok(Some(their_claim)) = their_record.entry().to_app_option::<Claim>() {
                                domains.push(their_claim.domain);
                            }
                        }
                        author_domains_cache.insert(critique.author.clone(), domains.clone());
                        domains
                    }
                };

                let other_domains = distinct_other_domains(&author_domains, &home_domain);
                if !other_domains.is_empty() {
                    results.push(CrossDomainCritique {
                        critique_action: record.action_address().clone(),
                        critique_author: critique.author,
                        critiquer_home_domains: other_domains,
                    });
                }
            }
        }
    }

    Ok(results)
}

// ============================================================================
// HELPERS
// ============================================================================

fn agent_anchor_hash(agent: &AgentPubKey) -> ExternResult<EntryHash> {
    let path = Path::from(format!("agent_{}", agent));
    Ok(path.path_entry_hash()?)
}

fn extract_domain_tag(record: &Record) -> ExternResult<String> {
    if let Ok(Some(claim)) = record.entry().to_app_option::<Claim>() {
        return Ok(claim.domain);
    }
    if let Ok(Some(critique)) = record.entry().to_app_option::<Critique>() {
        // A critique's target is scale-invariant now (see
        // CritiqueTargetType) — only a Claim target actually has a
        // domain to report. For any other target kind, this reports
        // what KIND of thing was critiqued rather than chasing further
        // (e.g. following a critique-of-critique to ITS target's domain)
        // — a single hop only, same lookup cost as before, avoiding
        // unbounded recursion through arbitrarily long critique chains.
        if critique.target_type == CritiqueTargetType::Claim {
            if let Ok(target_hash) = EntryHash::try_from(critique.target.clone()) {
                if let Some(target) = get(target_hash, GetOptions::default())? {
                    if let Ok(Some(target_claim)) = target.entry().to_app_option::<Claim>() {
                        return Ok(format!("{}/critique", target_claim.domain));
                    }
                }
            }
            return Ok("unknown".into());
        }
        return Ok(format!("critique-of-{}", n4l_prefix_for_target_type(&critique.target_type)));
    }
    if let Ok(Some(evidence)) = record.entry().to_app_option::<Evidence>() {
        return Ok(format!("{:?}/evidence", evidence.evidence_type));
    }
    Err(wasm_error!(WasmErrorInner::Guest("Cannot extract domain tag from record".into())))
}

fn compute_merkle_root(periods: &[PeriodBoundary]) -> ExternResult<Vec<u8>> {
    let mut hasher = Sha256::new();
    for boundary in periods {
        hasher.update(boundary.domain_tag.as_bytes());
        hasher.update(&boundary.start_time.to_le_bytes());
        hasher.update(&boundary.end_time.to_le_bytes());
        hasher.update(boundary.sample_action.as_ref());
        hasher.update(&boundary.entry_count.to_le_bytes());
    }
    Ok(hasher.finalize().to_vec())
}


// ============================================================================
// CONSTITUTION HELPERS (kept; not redefined in the consolidated block below)
// ============================================================================

#[hdk_extern]
pub fn get_all_constitutions() -> ExternResult<Vec<Record>> {
    let filter = ChainQueryFilter::new()
        .include_entries(true)
        .entry_type(EntryType::App(UnitEntryTypes::Constitution.try_into()?));
    query(filter)
}

// ============================================================================
// SIGNALS
//
// Consolidated to a single definition here. This file previously had this
// enum, plus its function callers, duplicated three times across a series
// of incremental edits that each appended an "updated" version without
// removing the old one — none of which could have compiled, since Rust
// rejects duplicate top-level item names regardless of whether their
// bodies match. This is the one remaining copy.
// ============================================================================

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum SignalPayload {
    // Struct variants (not tuple variants) so the bridge receives the
    // entry's EntryHash and ActionHash alongside its content. A bare
    // Mew/Claim has no hash field of its own; the bridge previously
    // (incorrectly) read one anyway as `mew.action_hash` /
    // `claim.action_hash`, which was always undefined. See create_mew /
    // create_claim, which compute and attach these hashes.
    NewMew { mew: Mew, entry_hash: EntryHash, action_hash: ActionHash },
    NewClaim { claim: Claim, entry_hash: EntryHash, action_hash: ActionHash },
    NewCritique(Critique),
    NewRetraction(Retraction),
    NewBridgeRecord(BridgeRecord),
}

#[hdk_extern]
pub fn create_mew(mew: Mew) -> ExternResult<ActionHash> {
    let action_hash = create_entry(EntryTypes::Mew(mew.clone()))?;

    // Link from agent anchor.
    let agent_anchor = agent_anchor_hash(&mew.author)?;
    create_link(
        agent_anchor,
        action_hash.clone(),
        LinkTypes::AgentToMew,
        LinkTag::new("mew"),
    )?;

    // Emit signal for bridge service.
    let entry_hash = hash_entry(&mew)?;
    emit_signal(&SignalPayload::NewMew {
        mew,
        entry_hash,
        action_hash: action_hash.clone(),
    })?;

    Ok(action_hash)
}

// Accepts either hash type — see get_claim's comment above for why.
#[hdk_extern]
pub fn get_mew(hash: AnyDhtHash) -> ExternResult<Option<Mew>> {
    match get(hash, GetOptions::default())? {
        Some(record) => {
            let mew: Option<Mew> = record.entry().to_app_option().map_err(|e| wasm_error!(WasmErrorInner::Guest(format!("{:?}", e))))?;
            Ok(mew)
        }
        None => Ok(None),
    }
}

#[hdk_extern]
pub fn get_mews_by_agent(agent: AgentPubKey) -> ExternResult<Vec<Record>> {
    let anchor = agent_anchor_hash(&agent)?;
    let links = get_links(GetLinksInputBuilder::try_new(anchor, LinkTypes::AgentToMew)?.build())?;

    let mut mews = Vec::new();
    for link in links {
        if let Ok(hash) = ActionHash::try_from(link.target) {
            if let Some(record) = get(hash, GetOptions::default())? {
                mews.push(record);
            }
        }
    }
    Ok(mews)
}

/// Promote a Mew to a fully-typed Claim.
/// This is the transduction event: raw stimulus → structured knowledge.
#[hdk_extern]
pub fn promote_mew_to_claim(payload: PromoteMewPayload) -> ExternResult<ActionHash> {
    let mew_record = get(payload.mew_hash.clone(), GetOptions::default())?
        .ok_or(wasm_error!(WasmErrorInner::Guest("Mew not found".into())))?;

    let mew: Mew = mew_record.entry()
        .to_app_option().map_err(|e| wasm_error!(WasmErrorInner::Guest(format!("{:?}", e))))?
        .ok_or(wasm_error!(WasmErrorInner::Guest("Invalid Mew entry".into())))?;

    let claim = Claim {
        content: mew.content,
        domain: payload.domain,
        author: mew.author,
        timestamp: sys_time()?.as_seconds_and_nanos().0 as u64,
        evidence_hashes: payload.evidence_hashes,
        confidence: payload.confidence,
        semantic_tags: mew.semantic_tags,
        source_mew: Some(payload.mew_hash.clone()),
    };

    let claim_hash = create_entry(EntryTypes::Claim(claim.clone()))?;

    // Link the Mew to its promoted Claim.
    create_link(
        payload.mew_hash,
        claim_hash.clone(),
        LinkTypes::MewToClaim,
        LinkTag::new("promoted"),
    )?;

    // Link from agent anchor.
    let agent_anchor = agent_anchor_hash(&claim.author)?;
    create_link(
        agent_anchor,
        claim_hash.clone(),
        LinkTypes::AgentToClaim,
        LinkTag::new(claim.domain.as_bytes().to_vec()),
    )?;

    Ok(claim_hash)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PromoteMewPayload {
    pub mew_hash: EntryHash,
    pub domain: String,
    pub evidence_hashes: Vec<EntryHash>,
    pub confidence: ConfidenceLevel,
}

// ============================================================================
// RETRACTION FUNCTIONS
// ============================================================================

/// A retraction is not a deletion. It is a new entry that adds provenance.
/// "I no longer stand by this claim, and here is why."
/// This is the (-3,3) inversion: withdrawing strengthens the graph.
#[hdk_extern]
pub fn create_retraction(retraction: Retraction) -> ExternResult<ActionHash> {
    let action_hash = create_entry(EntryTypes::Retraction(retraction.clone()))?;

    // Link from target claim to retraction.
    create_link(
        retraction.target_claim.clone(),
        action_hash.clone(),
        LinkTypes::ClaimToRetraction,
        LinkTag::new("retracted"),
    )?;

    // If there's a replacement claim, link retraction to it.
    if let Some(replacement) = &retraction.replacement_claim {
        create_link(
            action_hash.clone(),
            replacement.clone(),
            LinkTypes::ClaimToRetraction,
            LinkTag::new("replacement"),
        )?;
    }

    Ok(action_hash)
}

#[hdk_extern]
pub fn get_retractions_for_claim(claim_hash: EntryHash) -> ExternResult<Vec<Record>> {
    let links = get_links(GetLinksInputBuilder::try_new(claim_hash, LinkTypes::ClaimToRetraction)?.build())?;
    let mut retractions = Vec::new();
    for link in links {
        if let Ok(hash) = ActionHash::try_from(link.target) {
            if let Some(record) = get(hash, GetOptions::default())? {
                retractions.push(record);
            }
        }
    }
    Ok(retractions)
}

// ============================================================================
// CONSTITUTION FUNCTIONS (Promise Theory Explicit)
// ============================================================================

/// Publish your constitution — what you promise to do, under what conditions.
/// This makes Promise Theory visible in the DHT, not just implicit in validation rules.
#[hdk_extern]
pub fn publish_constitution(constitution: Constitution) -> ExternResult<ActionHash> {
    let action_hash = create_entry(EntryTypes::Constitution(constitution.clone()))?;

    // Link from agent anchor.
    let agent_anchor = agent_anchor_hash(&constitution.agent)?;
    create_link(
        agent_anchor,
        action_hash.clone(),
        LinkTypes::AgentToConstitution,
        LinkTag::new("constitution"),
    )?;

    Ok(action_hash)
}

#[hdk_extern]
pub fn get_agent_constitution(agent: AgentPubKey) -> ExternResult<Option<Constitution>> {
    let agent_anchor = agent_anchor_hash(&agent)?;
    let links = get_links(GetLinksInputBuilder::try_new(agent_anchor, LinkTypes::AgentToConstitution)?.build())?;

    let mut candidates: Vec<Constitution> = Vec::new();
    for link in links {
        if let Ok(hash) = ActionHash::try_from(link.target) {
            if let Some(record) = get(hash, GetOptions::default())? {
                if let Ok(Some(constitution)) = record.entry().to_app_option::<Constitution>() {
                    let now = sys_time()?.as_seconds_and_nanos().0 as u64;
                    if constitution.expires_at.map_or(true, |exp| exp > now) {
                        candidates.push(constitution);
                    }
                }
            }
        }
    }

    candidates.sort_by(|a, b| b.published_at.cmp(&a.published_at));
    Ok(candidates.into_iter().next())
}

// ============================================================================
// TESTS
//
// SCOPE: these cover the N4L export layer (ToN4L impls + the n4l_alias /
// n4l_esc / n4l_prop helpers), the worldline Merkle checksum
// (compute_merkle_root), and bridge_link_type_for's decision logic (which
// BridgeRecord link type applies to a mirrored entry — extracted out of
// record_twitter_mirror specifically so it doesn't need the `get()` call
// that surrounds it in production). All pure — no HDK host function
// (create_entry, get, query, create_link, emit_signal, hash_entry) is
// actually invoked by any of these tests.
//
// VERIFICATION STATUS: this module type-checks and its assertions were
// reasoned through carefully, but — like every #[hdk_extern] function in
// this crate — it has not actually been *executed* under `cargo test` in
// this environment, because linking a runnable test binary needs a
// native-compatible HDK host backend and hdk 0.4.4's "mock" feature
// (the mechanism meant to provide one) doesn't build here: its own
// bundled `mockall::mock! { impl HdkT for HdkT { ... } }` block
// references methods that don't exist on the HdkT/HdiT traits this hdk
// version itself resolves — a bug in the published crate, confirmed via
// a real build, not fixable from this project's Cargo.toml. A
// MockHdkT-based integration test file was attempted and had to be
// removed for the same reason.
//
// What HAS been verified against a real build in this environment,
// including this test module: `cargo check` for both zome crates —
// natively, and (more importantly, since it's the actual deployment
// target) for `--target wasm32-unknown-unknown` — all pass cleanly, with
// no warnings, against the real hdk 0.4.4 / hdi 0.5.4 API surface. That
// caught and fixed real, substantive bugs this file used to have: get_links
// taking three positional arguments instead of one GetLinksInput,
// create_entry needing an owned EntryTypes rather than a reference,
// AnyLinkableHash::Entry(hash) pattern-matching that doesn't exist,
// EntryCreationAction/Create field-vs-method confusion, and a systemic
// i64/u64 timestamp mismatch, among others — see this crate's and
// epistemic_integrity's git history / Cargo.toml comments for the full
// list. What's still unverified is specifically *runtime behavior* —
// whether the assertions here hold when the code actually executes, not
// whether the code compiles and type-checks. HOST-CALLING functions
// (create_claim, create_mew, record_twitter_mirror's `get()` branch,
// get_unbridged_claims, get_unbridged_mews) remain untested at the
// runtime-behavior level for that reason.
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_entry_hash(seed: u8) -> EntryHash {
        EntryHash::from_raw_36(vec![seed; 36])
    }

    fn fixture_action_hash(seed: u8) -> ActionHash {
        ActionHash::from_raw_36(vec![seed; 36])
    }

    fn fixture_agent(seed: u8) -> AgentPubKey {
        AgentPubKey::from_raw_36(vec![seed; 36])
    }

    // --- n4l_alias / n4l_esc -------------------------------------------

    #[test]
    fn n4l_alias_is_deterministic_and_prefixed() {
        let hash = fixture_entry_hash(1);
        let a1 = n4l_alias("claim", &hash);
        let a2 = n4l_alias("claim", &hash);
        assert_eq!(a1, a2, "same hash must always produce the same alias");
        assert!(a1.starts_with("claim_"));
        // 8 bytes of the SHA-256 digest, hex-encoded, = 16 hex chars.
        assert_eq!(a1.len(), "claim_".len() + 16);
    }

    #[test]
    fn n4l_alias_differs_by_prefix_for_the_same_hash() {
        // Different entry types referencing the same underlying hash bytes
        // must not collide, since the prefix is part of the alias.
        let hash = fixture_entry_hash(2);
        assert_ne!(n4l_alias("claim", &hash), n4l_alias("critique", &hash));
    }

    #[test]
    fn n4l_esc_escapes_embedded_quotes_only() {
        assert_eq!(n4l_esc(r#"says "hello""#), r#"says \"hello\""#);
        assert_eq!(n4l_esc("no quotes here"), "no quotes here");
    }

    // --- ToN4L: Claim -----------------------------------------------------

    #[test]
    fn claim_to_n4l_includes_all_scalar_and_list_fields() {
        let entry_hash = fixture_entry_hash(3);
        let claim = Claim {
            content: "Anterior pelvic tilt correction reduces lumbar strain".into(),
            domain: "LumbarRehab".into(),
            author: fixture_agent(4),
            timestamp: 1_000,
            evidence_hashes: vec![fixture_entry_hash(5), fixture_entry_hash(6)],
            confidence: ConfidenceLevel::High,
            semantic_tags: vec!["hip-mobility".into(), "fascia".into()],
            source_mew: None,
        };

        let out = claim.to_n4l(&entry_hash);

        assert!(out.starts_with(&format!("@{}", n4l_alias("claim", &entry_hash))));
        assert!(out.contains("(asserted by)"));
        assert!(out.contains("(has domain) \"LumbarRehab\""));
        assert!(out.contains("(has confidence) \"High\""));
        assert!(out.contains(&format!("(has dht hash) \"{}\"", entry_hash)));
        for ev in &claim.evidence_hashes {
            assert!(out.contains(&format!("(has evidence) \"{}\"", ev)));
        }
        assert!(out.contains("(has tag) \"hip-mobility\""));
        assert!(out.contains("(has tag) \"fascia\""));
    }

    #[test]
    fn n4l_prefix_for_target_type_covers_every_variant_distinctly() {
        let prefixes = [
            n4l_prefix_for_target_type(&CritiqueTargetType::Claim),
            n4l_prefix_for_target_type(&CritiqueTargetType::Critique),
            n4l_prefix_for_target_type(&CritiqueTargetType::Constitution),
            n4l_prefix_for_target_type(&CritiqueTargetType::Membrane),
            n4l_prefix_for_target_type(&CritiqueTargetType::CritiqueSpecies),
        ];
        // No two target kinds may share a prefix, or their N4L aliases
        // could collide despite being genuinely different entries.
        for i in 0..prefixes.len() {
            for j in (i + 1)..prefixes.len() {
                assert_ne!(prefixes[i], prefixes[j], "duplicate N4L prefix for distinct CritiqueTargetType variants");
            }
        }
    }

    #[test]
    fn claim_to_n4l_escapes_quotes_in_content_and_tags() {
        let entry_hash = fixture_entry_hash(7);
        let claim = Claim {
            content: r#"The "SAID principle" applies here"#.into(),
            domain: "Training".into(),
            author: fixture_agent(8),
            timestamp: 0,
            evidence_hashes: vec![],
            confidence: ConfidenceLevel::Tentative,
            semantic_tags: vec![r#"quoted "tag""#.into()],
            source_mew: None,
        };

        let out = claim.to_n4l(&entry_hash);
        assert!(out.contains(r#"\"SAID principle\""#));
        assert!(out.contains(r#"\"tag\""#));
    }

    // --- ToN4L: Critique ----------------------------------------------

    #[test]
    fn critique_to_n4l_references_claim_target_by_its_own_alias() {
        let claim_entry_hash = fixture_entry_hash(9);
        let critique_entry_hash = fixture_entry_hash(10);

        let critique = Critique {
            target: claim_entry_hash.clone().into(),
            target_type: CritiqueTargetType::Claim,
            critique_mode: CritiqueMode::Methodological,
            content: "The study design is flawed".into(),
            author: fixture_agent(11),
            timestamp: 0,
            replication_attempted: false,
            evidence_hashes: vec![],
            species: None,
        };

        let out = critique.to_n4l(&critique_entry_hash);

        // The reference must resolve to the SAME alias a Claim exported
        // under `claim_entry_hash` would get — this is the cross-
        // reference guarantee export_to_n4l depends on (see this file's
        // CROSS-REFERENCES header comment).
        let expected_target_alias = n4l_alias("claim", &claim_entry_hash);
        assert!(out.contains(&format!("${}.1", expected_target_alias)));
        assert!(out.contains("(target type) \"Claim\""));
        assert!(out.contains("(critique mode) \"Methodological\""));
        assert!(out.contains("(replication attempted) \"false\""));
    }

    #[test]
    fn critique_to_n4l_references_critique_target_under_the_critique_prefix() {
        // Scale invariance: a Critique can target another Critique, not
        // just a Claim. The cross-reference must resolve under the
        // "critique" alias prefix, not "claim" — this is the whole
        // reason CritiqueTargetType/n4l_prefix_for_target_type exist,
        // since to_n4l has no DHT access to discover the target's real
        // type on its own.
        let target_critique_entry_hash = fixture_entry_hash(50);
        let critique_entry_hash = fixture_entry_hash(51);

        let critique = Critique {
            target: target_critique_entry_hash.clone().into(),
            target_type: CritiqueTargetType::Critique,
            critique_mode: CritiqueMode::Logical,
            content: "This critique contradicts itself".into(),
            author: fixture_agent(52),
            timestamp: 0,
            replication_attempted: false,
            evidence_hashes: vec![],
            species: None,
        };

        let out = critique.to_n4l(&critique_entry_hash);

        let expected_target_alias = n4l_alias("critique", &target_critique_entry_hash);
        assert!(out.contains(&format!("${}.1", expected_target_alias)));
        // Must NOT resolve under the "claim" prefix — that would be the
        // old, Claim-only behavior silently miscategorizing the target.
        let wrong_alias = n4l_alias("claim", &target_critique_entry_hash);
        assert!(!out.contains(&format!("${}.1", wrong_alias)));
        assert!(out.contains("(target type) \"Critique\""));
    }

    #[test]
    fn critique_to_n4l_includes_species_link_only_when_present() {
        let critique_entry_hash = fixture_entry_hash(12);
        let species_hash = fixture_entry_hash(13);

        let with_species = Critique {
            target: fixture_entry_hash(14).into(),
            target_type: CritiqueTargetType::Claim,
            critique_mode: CritiqueMode::Evidential,
            content: "content".into(),
            author: fixture_agent(15),
            timestamp: 0,
            replication_attempted: true,
            evidence_hashes: vec![],
            species: Some(species_hash.clone()),
        };
        let out = with_species.to_n4l(&critique_entry_hash);
        assert!(out.contains(&format!("(adopts species) \"{}\"", species_hash)));

        let without_species = Critique { species: None, ..with_species };
        let out2 = without_species.to_n4l(&critique_entry_hash);
        assert!(!out2.contains("(adopts species)"));
    }

    // --- ToN4L: AntibodyPattern -------------------------------------------

    #[test]
    fn antibody_pattern_to_n4l_references_claim_target_by_its_own_alias() {
        let claim_entry_hash = fixture_entry_hash(60);
        let pattern_entry_hash = fixture_entry_hash(61);

        let pattern = AntibodyPattern {
            target: claim_entry_hash.clone().into(),
            target_type: CritiqueTargetType::Claim,
            kind: AntibodyPatternKind::SpamFlood,
            rationale: "Ten near-identical claims posted in one minute".into(),
            author: fixture_agent(62),
            timestamp: 0,
        };

        let out = pattern.to_n4l(&pattern_entry_hash);

        // Same cross-reference guarantee critique_to_n4l's own test
        // checks: the alias must match what the target's own to_n4l
        // impl would produce.
        let expected_target_alias = n4l_alias("claim", &claim_entry_hash);
        assert!(out.contains(&format!("${}.1", expected_target_alias)));
        assert!(out.contains("(target type) \"Claim\""));
        assert!(out.contains("(pattern kind) \"SpamFlood\""));
        assert!(out.contains("(flags)"));
    }

    #[test]
    fn antibody_pattern_to_n4l_references_critique_target_under_the_critique_prefix() {
        // Scale invariance, same as Critique's own target: an
        // AntibodyPattern can flag another Critique, not just a Claim.
        let target_critique_entry_hash = fixture_entry_hash(63);
        let pattern_entry_hash = fixture_entry_hash(64);

        let pattern = AntibodyPattern {
            target: target_critique_entry_hash.clone().into(),
            target_type: CritiqueTargetType::Critique,
            kind: AntibodyPatternKind::CoordinatedManipulation,
            rationale: "Five agents posted the same critique within seconds of each other".into(),
            author: fixture_agent(65),
            timestamp: 0,
        };

        let out = pattern.to_n4l(&pattern_entry_hash);

        let expected_target_alias = n4l_alias("critique", &target_critique_entry_hash);
        assert!(out.contains(&format!("${}.1", expected_target_alias)));
        let wrong_alias = n4l_alias("claim", &target_critique_entry_hash);
        assert!(!out.contains(&format!("${}.1", wrong_alias)));
        assert!(out.contains("(target type) \"Critique\""));
        assert!(out.contains("(pattern kind) \"CoordinatedManipulation\""));
    }

    // --- ToN4L: WorldlineTrace ------------------------------------------

    #[test]
    fn worldline_trace_to_n4l_enumerates_every_period_boundary() {
        let entry_hash = fixture_entry_hash(16);
        let trace = WorldlineTrace {
            agent: fixture_agent(17),
            period_boundaries: vec![
                PeriodBoundary {
                    start_time: 0,
                    end_time: 10,
                    sample_action: fixture_action_hash(18),
                    domain_tag: "LumbarRehab".into(),
                    entry_count: 3,
                },
                PeriodBoundary {
                    start_time: 10,
                    end_time: 20,
                    sample_action: fixture_action_hash(19),
                    domain_tag: "Nutrition".into(),
                    entry_count: 5,
                },
            ],
            expertise_tags: vec!["rehab".into()],
            trace_payload: None,
            binding_key: None,
            checksum: vec![0u8; 32],
            created_at: 100,
            expires_at: None,
        };

        let out = trace.to_n4l(&entry_hash);
        // Static, registered relation name with the period index carried
        // as an N4L comma-context tag, not baked into the name itself —
        // see the comment on this loop in ToN4L for WorldlineTrace.
        assert!(out.contains("(covers period,p0) \"LumbarRehab\""));
        assert!(out.contains("(covers period,p1) \"Nutrition\""));
        assert!(out.contains("(has entry count,p0) \"3\""));
        assert!(out.contains("(has entry count,p1) \"5\""));
    }

    // --- ToN4L: Retraction ----------------------------------------------

    #[test]
    fn retraction_to_n4l_links_replacement_only_when_present() {
        let entry_hash = fixture_entry_hash(20);
        let target = fixture_entry_hash(21);
        let replacement = fixture_entry_hash(22);

        let retraction = Retraction {
            target_claim: target.clone(),
            reason: "New evidence contradicts this".into(),
            replacement_claim: Some(replacement.clone()),
            author: fixture_agent(23),
            timestamp: 0,
        };

        let out = retraction.to_n4l(&entry_hash);
        let target_alias = n4l_alias("claim", &target);
        let replacement_alias = n4l_alias("claim", &replacement);
        assert!(out.contains(&format!("(retracts) ${}.1", target_alias)));
        assert!(out.contains(&format!("(replaced by) ${}.1", replacement_alias)));
    }

    #[test]
    fn retraction_to_n4l_omits_replacement_line_when_absent() {
        let entry_hash = fixture_entry_hash(24);
        let retraction = Retraction {
            target_claim: fixture_entry_hash(25),
            reason: "No longer confident in this".into(),
            replacement_claim: None,
            author: fixture_agent(26),
            timestamp: 0,
        };

        let out = retraction.to_n4l(&entry_hash);
        assert!(!out.contains("(replaced by)"));
    }

    // --- compute_merkle_root ---------------------------------------------

    fn sample_boundary(tag: &str, seed: u8) -> PeriodBoundary {
        PeriodBoundary {
            start_time: 0,
            end_time: 100,
            sample_action: fixture_action_hash(seed),
            domain_tag: tag.into(),
            entry_count: 1,
        }
    }

    #[test]
    fn merkle_root_is_deterministic_and_32_bytes() {
        let periods = vec![sample_boundary("A", 1), sample_boundary("B", 2)];
        let r1 = compute_merkle_root(&periods).unwrap();
        let r2 = compute_merkle_root(&periods).unwrap();
        assert_eq!(r1, r2);
        // Must match validate_worldline_trace's `checksum.len() != 32`
        // check in the integrity zome, or every trace this produces
        // would fail validation.
        assert_eq!(r1.len(), 32);
    }

    #[test]
    fn merkle_root_is_sensitive_to_boundary_order() {
        let a = sample_boundary("A", 1);
        let b = sample_boundary("B", 2);
        let forward = compute_merkle_root(&[a.clone(), b.clone()]).unwrap();
        let reversed = compute_merkle_root(&[b, a]).unwrap();
        assert_ne!(
            forward, reversed,
            "reordering periods must change the checksum, or verify_trace_checksum \
             couldn't detect history reordering"
        );
    }

    #[test]
    fn merkle_root_changes_when_any_field_changes() {
        let base = compute_merkle_root(&[sample_boundary("A", 1)]).unwrap();

        let different_tag = compute_merkle_root(&[sample_boundary("B", 1)]).unwrap();
        assert_ne!(base, different_tag);

        let mut different_count = sample_boundary("A", 1);
        different_count.entry_count = 99;
        let different_count_root = compute_merkle_root(&[different_count]).unwrap();
        assert_ne!(base, different_count_root);

        let different_action = sample_boundary("A", 99);
        let different_action_root = compute_merkle_root(&[different_action]).unwrap();
        assert_ne!(base, different_action_root);
    }

    #[test]
    fn merkle_root_of_empty_periods_is_the_empty_sha256() {
        // Not a meaningful trace in practice (validate_worldline_trace
        // rejects an empty period_boundaries list), but compute_merkle_root
        // itself should still behave predictably rather than panic: zero
        // loop iterations over an empty slice means the hasher never sees
        // an update() call, so this must equal SHA-256 of the empty
        // input — checked here against an independent computation rather
        // than a hand-copied constant, since that's not something this
        // environment's toolchain could compile-check (see this module's
        // header note).
        let root = compute_merkle_root(&[]).unwrap();
        let independently_computed_empty_hash = Sha256::digest(b"").to_vec();
        assert_eq!(root.len(), 32);
        assert_eq!(root, independently_computed_empty_hash);
    }

    // --- bridge_link_type_for --------------------------------------------
    //
    // Builds a RecordEntry the same way create_entry itself does under the
    // hood: EntryTypes (the #[hdk_entry_types]-annotated enum) is what
    // actually implements the conversion to Entry, not the inner structs
    // (Claim, Mew, ...) directly — confirmed against a real build, not a
    // guess: this exact TryFrom<EntryTypes> bound is what create_entry's
    // own call sites throughout this file rely on already.
    fn app_entry(entry_type: EntryTypes) -> RecordEntry {
        let entry: Entry = entry_type
            .try_into()
            .expect("must build a valid Entry from EntryTypes");
        RecordEntry::Present(entry)
    }

    #[test]
    fn bridge_link_type_for_claim_is_claim_to_bridge_record() {
        let claim = Claim {
            content: "test".into(),
            domain: "TestDomain".into(),
            author: fixture_agent(30),
            timestamp: 0,
            evidence_hashes: vec![],
            confidence: ConfidenceLevel::Moderate,
            semantic_tags: vec![],
            source_mew: None,
        };
        let entry = app_entry(EntryTypes::Claim(claim));
        assert_eq!(bridge_link_type_for(&entry).unwrap(), Some(LinkTypes::ClaimToBridgeRecord));
    }

    #[test]
    fn bridge_link_type_for_mew_is_mew_to_bridge_record() {
        let mew = Mew {
            content: "test mew".into(),
            author: fixture_agent(31),
            timestamp: 0,
            reply_to: None,
            semantic_tags: vec![],
            linked_claim: None,
        };
        let entry = app_entry(EntryTypes::Mew(mew));
        assert_eq!(bridge_link_type_for(&entry).unwrap(), Some(LinkTypes::MewToBridgeRecord));
    }

    #[test]
    fn bridge_link_type_for_neither_claim_nor_mew_is_none() {
        // record_twitter_mirror should silently skip link creation for an
        // entry that's neither — not error, not guess.
        let evidence = Evidence {
            content: "test evidence".into(),
            evidence_type: EvidenceType::Text,
            source_url: None,
            author: fixture_agent(32),
            timestamp: 0,
        };
        let entry = app_entry(EntryTypes::Evidence(evidence));
        assert_eq!(bridge_link_type_for(&entry).unwrap(), None);
    }

    // --- decay_factor / compute_effective_conductance --------------------
    //
    // The actual mathematical core of conductance atrophy — pure, no
    // host calls, so every claim the README's Fractal Impedance Matching
    // section makes about this mechanism (decays toward zero when
    // un-reinforced, reinforcement pulls it back up, half-life is
    // exactly that) is checked here directly rather than only asserted
    // in prose.

    const HALF_LIFE: f64 = CONDUCTANCE_HALF_LIFE_SECS;

    #[test]
    fn decay_factor_is_one_at_zero_elapsed() {
        assert_eq!(decay_factor(0.0), 1.0);
    }

    #[test]
    fn decay_factor_clamps_negative_elapsed_to_one() {
        // Shouldn't come up in practice (an event's timestamp is never
        // after "now" when this is called), but must not produce a
        // value above 1.0 or panic if it somehow does.
        assert_eq!(decay_factor(-100.0), 1.0);
    }

    #[test]
    fn decay_factor_is_exactly_half_at_the_half_life() {
        let d = decay_factor(HALF_LIFE);
        assert!((d - 0.5).abs() < 0.0001, "expected ~0.5 at exactly one half-life, got {}", d);
    }

    #[test]
    fn decay_factor_is_exactly_quarter_at_two_half_lives() {
        let d = decay_factor(HALF_LIFE * 2.0);
        assert!((d - 0.25).abs() < 0.0001, "expected ~0.25 at two half-lives, got {}", d);
    }

    #[test]
    fn decay_factor_is_monotonically_decreasing() {
        let earlier = decay_factor(HALF_LIFE * 0.5);
        let later = decay_factor(HALF_LIFE * 1.5);
        assert!(earlier > later, "conductance must not increase with elapsed time alone");
    }

    #[test]
    fn effective_conductance_with_no_reinforcement_equals_decayed_base() {
        let base = 1.0;
        let created_at = 0;
        let now = HALF_LIFE as i64;
        let result = compute_effective_conductance(base, created_at, &[], now);
        assert!((result - 0.5).abs() < 0.001, "un-reinforced link at one half-life should be ~0.5, got {}", result);
    }

    #[test]
    fn effective_conductance_decays_toward_zero_the_longer_a_link_is_ignored() {
        // This is the actual "atrophy" claim: the same base link, sampled
        // further and further past its creation with no reinforcement,
        // must keep shrinking — never plateau, never bounce back on its
        // own.
        let base = 1.0;
        let created_at = 0;
        let at_one_hl = compute_effective_conductance(base, created_at, &[], HALF_LIFE as i64);
        let at_four_hl = compute_effective_conductance(base, created_at, &[], (HALF_LIFE * 4.0) as i64);
        let at_ten_hl = compute_effective_conductance(base, created_at, &[], (HALF_LIFE * 10.0) as i64);
        assert!(at_one_hl > at_four_hl);
        assert!(at_four_hl > at_ten_hl);
        assert!(at_ten_hl < 0.01, "should be nearly fully atrophied after ten half-lives, got {}", at_ten_hl);
    }

    #[test]
    fn effective_conductance_recent_reinforcement_lifts_a_decayed_link() {
        // The "unless" half of the design: a link that's mostly decayed
        // gets pulled back up by a reinforcement close to "now" — this
        // is what makes reinforcement meaningfully different from just
        // never atrophying in the first place.
        let base = 1.0;
        let created_at = 0;
        let now = (HALF_LIFE * 10.0) as i64; // heavily decayed by now

        let unreinforced = compute_effective_conductance(base, created_at, &[], now);
        let reinforced_recently = compute_effective_conductance(base, created_at, &[now - 1], now);

        assert!(unreinforced < 0.01);
        assert!(
            reinforced_recently > unreinforced + 0.9,
            "a reinforcement one second ago should contribute close to its full REINFORCE_WEIGHT, got {} vs {}",
            reinforced_recently, unreinforced
        );
    }

    #[test]
    fn effective_conductance_old_reinforcement_matters_less_than_recent_one() {
        // Reinforcement itself decays too — a single reinforcement from
        // ten half-lives ago shouldn't still be propping up conductance
        // as if it just happened. Otherwise a single early reinforcement
        // would let a link coast forever, which isn't "atrophy" at all.
        let base = 0.0; // isolate the reinforcement term entirely
        let created_at = 0;
        let now = (HALF_LIFE * 10.0) as i64;

        let old_reinforcement = compute_effective_conductance(base, created_at, &[0], now);
        let recent_reinforcement = compute_effective_conductance(base, created_at, &[now - 1], now);

        assert!(old_reinforcement < recent_reinforcement);
        assert!(old_reinforcement < 0.01, "a ten-half-lives-old reinforcement should itself be nearly fully decayed");
    }

    #[test]
    fn effective_conductance_multiple_reinforcements_accumulate() {
        let base = 0.0;
        let created_at = 0;
        let now: i64 = 1_000_000;
        let one = compute_effective_conductance(base, created_at, &[now - 1], now);
        let three = compute_effective_conductance(base, created_at, &[now - 1, now - 2, now - 3], now);
        assert!(three > one, "more recent reinforcements should sum to a higher value than one alone");
    }

    // --- count_attestations_pure -----------------------------------------
    //
    // The actual graph-walk algorithm behind AttestationPolicy, tested
    // against an in-memory fixture graph rather than the real DHT —
    // direct_attesters_of (the host-calling half) is a thin, untested-
    // at-runtime shim over this, the same split used for
    // bridge_link_type_for and compute_effective_conductance.

    /// Builds a lookup closure from `edges` — (attester_seed,
    /// attested_seed) pairs meaning "attester attests attested" — shaped
    /// to satisfy count_attestations_pure's `F: Fn(&AgentPubKey) ->
    /// ExternResult<Vec<AgentPubKey>>` bound without any host call.
    fn fixture_attestation_graph(edges: &[(u8, u8)]) -> impl Fn(&AgentPubKey) -> ExternResult<Vec<AgentPubKey>> {
        let mut graph: std::collections::HashMap<AgentPubKey, Vec<AgentPubKey>> = std::collections::HashMap::new();
        for &(attester_seed, attested_seed) in edges {
            graph.entry(fixture_agent(attested_seed)).or_default().push(fixture_agent(attester_seed));
        }
        move |agent: &AgentPubKey| Ok(graph.get(agent).cloned().unwrap_or_default())
    }

    #[test]
    fn count_attestations_direct_root_attester_counts() {
        let root = fixture_agent(1);
        let candidate = fixture_agent(2);
        let lookup = fixture_attestation_graph(&[(1, 2)]); // root(1) attests candidate(2)

        let mut visited = HashSet::new();
        let count = count_attestations_pure(&candidate, &[root], 0, &lookup, &mut visited).unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn count_attestations_non_root_attester_at_depth_zero_does_not_count() {
        let root = fixture_agent(1);
        let candidate = fixture_agent(2);
        let stranger = fixture_agent(99);
        let lookup = fixture_attestation_graph(&[(99, 2)]); // stranger, not root, attests candidate

        let mut visited = HashSet::new();
        let count = count_attestations_pure(&candidate, &[root], 0, &lookup, &mut visited).unwrap();
        assert_eq!(count, 0);
        let _ = stranger; // named for clarity in the test above, not asserted on directly
    }

    #[test]
    fn count_attestations_transitive_attester_counts_when_depth_allows() {
        // root(1) attests middle(2), middle(2) attests candidate(3).
        // candidate should count middle as an attester at depth >= 1,
        // since middle is themselves attested by the root set.
        let root = fixture_agent(1);
        let middle = fixture_agent(2);
        let candidate = fixture_agent(3);
        let lookup = fixture_attestation_graph(&[(1, 2), (2, 3)]);

        let mut visited = HashSet::new();
        let count = count_attestations_pure(&candidate, &[root], 1, &lookup, &mut visited).unwrap();
        assert_eq!(count, 1);
        let _ = middle;
    }

    #[test]
    fn count_attestations_transitive_attester_blocked_by_insufficient_depth() {
        // Same graph as above, but max_depth = 0 means only DIRECT root
        // attestation counts — middle is two hops from candidate's
        // perspective (candidate <- middle <- root), so at depth 0 it
        // must not count.
        let root = fixture_agent(1);
        let candidate = fixture_agent(3);
        let lookup = fixture_attestation_graph(&[(1, 2), (2, 3)]);

        let mut visited = HashSet::new();
        let count = count_attestations_pure(&candidate, &[root], 0, &lookup, &mut visited).unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn count_attestations_handles_a_two_cycle_without_looping_forever() {
        // A attests B, B attests A. Checking whether B is attested by
        // root={A} must terminate and give a sane answer rather than
        // recursing forever chasing the cycle.
        let a = fixture_agent(1);
        let b = fixture_agent(2);
        let lookup = fixture_attestation_graph(&[(1, 2), (2, 1)]); // A attests B, B attests A

        let mut visited = HashSet::new();
        let count = count_attestations_pure(&b, &[a.clone()], 5, &lookup, &mut visited).unwrap();
        // b is directly attested by a, which IS the root — counts once,
        // and the walk terminates instead of hanging.
        assert_eq!(count, 1);
    }

    #[test]
    fn count_attestations_multiple_distinct_direct_attesters_all_count() {
        let root_a = fixture_agent(1);
        let root_b = fixture_agent(2);
        let candidate = fixture_agent(3);
        let lookup = fixture_attestation_graph(&[(1, 3), (2, 3)]);

        let mut visited = HashSet::new();
        let count = count_attestations_pure(&candidate, &[root_a, root_b], 0, &lookup, &mut visited).unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn count_attestations_no_attesters_at_all_is_zero() {
        let root = fixture_agent(1);
        let candidate = fixture_agent(2);
        let lookup = fixture_attestation_graph(&[]); // empty graph

        let mut visited = HashSet::new();
        let count = count_attestations_pure(&candidate, &[root], 3, &lookup, &mut visited).unwrap();
        assert_eq!(count, 0);
    }

    // --- find_grounding_path_pure -----------------------------------------
    //
    // The actual walk behind get_grounding_path, tested against an
    // in-memory fixture graph rather than the real DHT — resolve_grounding_node
    // (the host-calling half) is a thin, untested-at-runtime shim over this,
    // the same split used for bridge_link_type_for,
    // compute_effective_conductance, and count_attestations_pure.

    #[derive(Clone)]
    enum FixtureNode {
        Evidence,
        Claim(Vec<u8>), // seeds of the entries this claim's evidence_hashes point to
    }

    /// Builds a resolver closure from `nodes` — (seed, FixtureNode)
    /// pairs — shaped to satisfy find_grounding_path_pure's
    /// `F: Fn(&EntryHash) -> ExternResult<GroundingNode>` bound without
    /// any host call. A seed with no entry in `nodes` resolves to
    /// GroundingNode::Unknown, matching resolve_grounding_node's real
    /// behavior for a hash that doesn't exist or isn't Claim/Evidence.
    fn fixture_grounding_resolver(nodes: &[(u8, FixtureNode)]) -> impl Fn(&EntryHash) -> ExternResult<GroundingNode> {
        let mut map: HashMap<EntryHash, FixtureNode> = HashMap::new();
        for (seed, node) in nodes {
            map.insert(fixture_entry_hash(*seed), node.clone());
        }
        move |hash: &EntryHash| -> ExternResult<GroundingNode> {
            match map.get(hash) {
                Some(FixtureNode::Evidence) => Ok(GroundingNode::Evidence),
                Some(FixtureNode::Claim(seeds)) => {
                    Ok(GroundingNode::Claim(seeds.iter().map(|s| fixture_entry_hash(*s)).collect()))
                }
                None => Ok(GroundingNode::Unknown),
            }
        }
    }

    #[test]
    fn grounding_path_claim_directly_citing_evidence_is_grounded() {
        let claim = 1;
        let evidence = 2;
        let resolve = fixture_grounding_resolver(&[
            (claim, FixtureNode::Claim(vec![evidence])),
            (evidence, FixtureNode::Evidence),
        ]);

        let mut visited = HashSet::new();
        let (path, grounded) =
            find_grounding_path_pure(&fixture_entry_hash(claim), 20, &resolve, &mut visited).unwrap();

        assert!(grounded);
        assert_eq!(path, vec![fixture_entry_hash(claim), fixture_entry_hash(evidence)]);
    }

    #[test]
    fn grounding_path_walks_through_a_claim_citing_another_claim() {
        // claim1 cites claim2 as its "evidence" (validate_claim allows
        // this — see this section's header comment); claim2 cites real
        // Evidence. The chain should walk through claim2, not stop there.
        let claim1 = 1;
        let claim2 = 2;
        let evidence = 3;
        let resolve = fixture_grounding_resolver(&[
            (claim1, FixtureNode::Claim(vec![claim2])),
            (claim2, FixtureNode::Claim(vec![evidence])),
            (evidence, FixtureNode::Evidence),
        ]);

        let mut visited = HashSet::new();
        let (path, grounded) =
            find_grounding_path_pure(&fixture_entry_hash(claim1), 20, &resolve, &mut visited).unwrap();

        assert!(grounded);
        assert_eq!(
            path,
            vec![fixture_entry_hash(claim1), fixture_entry_hash(claim2), fixture_entry_hash(evidence)]
        );
    }

    #[test]
    fn grounding_path_claim_with_no_evidence_hashes_is_ungrounded() {
        let claim = 1;
        let resolve = fixture_grounding_resolver(&[(claim, FixtureNode::Claim(vec![]))]);

        let mut visited = HashSet::new();
        let (path, grounded) =
            find_grounding_path_pure(&fixture_entry_hash(claim), 20, &resolve, &mut visited).unwrap();

        assert!(!grounded);
        assert_eq!(path, vec![fixture_entry_hash(claim)]);
    }

    #[test]
    fn grounding_path_citing_an_unknown_hash_is_ungrounded() {
        // A claim's evidence_hashes points at something that isn't
        // registered in the fixture at all — matching a real dangling
        // or non-Claim/non-Evidence hash.
        let claim = 1;
        let dangling = 99;
        let resolve = fixture_grounding_resolver(&[(claim, FixtureNode::Claim(vec![dangling]))]);

        let mut visited = HashSet::new();
        let (path, grounded) =
            find_grounding_path_pure(&fixture_entry_hash(claim), 20, &resolve, &mut visited).unwrap();

        assert!(!grounded);
        assert_eq!(path, vec![fixture_entry_hash(claim)]);
    }

    #[test]
    fn grounding_path_finds_a_grounded_branch_even_if_an_earlier_one_fails() {
        // claim cites two things: a dead end first, real Evidence
        // second. The search must not give up after the first branch
        // fails — a grounding path exists and must be found.
        let claim = 1;
        let dead_end_claim = 2;
        let evidence = 3;
        let resolve = fixture_grounding_resolver(&[
            (claim, FixtureNode::Claim(vec![dead_end_claim, evidence])),
            (dead_end_claim, FixtureNode::Claim(vec![])),
            (evidence, FixtureNode::Evidence),
        ]);

        let mut visited = HashSet::new();
        let (path, grounded) =
            find_grounding_path_pure(&fixture_entry_hash(claim), 20, &resolve, &mut visited).unwrap();

        assert!(grounded);
        assert_eq!(path, vec![fixture_entry_hash(claim), fixture_entry_hash(evidence)]);
    }

    #[test]
    fn grounding_path_handles_a_two_claim_citation_cycle_without_looping_forever() {
        // claim1 cites claim2, claim2 cites claim1 back — a cycle with
        // no Evidence anywhere. Must terminate, and report ungrounded.
        let claim1 = 1;
        let claim2 = 2;
        let resolve = fixture_grounding_resolver(&[
            (claim1, FixtureNode::Claim(vec![claim2])),
            (claim2, FixtureNode::Claim(vec![claim1])),
        ]);

        let mut visited = HashSet::new();
        let (_path, grounded) =
            find_grounding_path_pure(&fixture_entry_hash(claim1), 20, &resolve, &mut visited).unwrap();

        assert!(!grounded);
    }

    #[test]
    fn grounding_path_depth_cap_stops_a_chain_that_would_otherwise_ground() {
        // claim1 -> claim2 -> evidence, but max_depth = 0 means claim1's
        // own evidence_hashes are never even examined — ungrounded, not
        // because no grounding exists, but because the budget ran out
        // before reaching it. Matches "visibility into where it breaks
        // down," not "whether grounding is theoretically possible."
        let claim1 = 1;
        let claim2 = 2;
        let evidence = 3;
        let resolve = fixture_grounding_resolver(&[
            (claim1, FixtureNode::Claim(vec![claim2])),
            (claim2, FixtureNode::Claim(vec![evidence])),
            (evidence, FixtureNode::Evidence),
        ]);

        let mut visited = HashSet::new();
        let (path, grounded) =
            find_grounding_path_pure(&fixture_entry_hash(claim1), 0, &resolve, &mut visited).unwrap();

        assert!(!grounded);
        assert_eq!(path, vec![fixture_entry_hash(claim1)]);
    }

    #[test]
    fn grounding_path_evidence_itself_as_the_start_is_trivially_grounded() {
        let evidence = 1;
        let resolve = fixture_grounding_resolver(&[(evidence, FixtureNode::Evidence)]);

        let mut visited = HashSet::new();
        let (path, grounded) =
            find_grounding_path_pure(&fixture_entry_hash(evidence), 20, &resolve, &mut visited).unwrap();

        assert!(grounded);
        assert_eq!(path, vec![fixture_entry_hash(evidence)]);
    }

    // --- discourse_ratio ----------------------------------------------------

    #[test]
    fn discourse_ratio_is_zero_when_there_are_no_critiques_at_all() {
        // The case that shipped broken: a freshly founded domain warned
        // that its discourse had detached from a practice nobody had
        // started. Nothing has happened, so nothing has drifted.
        assert_eq!(discourse_ratio(0, 0), 0.0);
        assert!(discourse_ratio(0, 0) <= 3.0, "must not trip the drift warning");
    }

    #[test]
    fn discourse_ratio_is_max_for_abstract_discourse_with_no_embodied_report() {
        // Still the right answer: there IS discourse, and none of it is
        // grounded in anyone's practice.
        assert_eq!(discourse_ratio(5, 0), f32::MAX);
        assert!(discourse_ratio(5, 0) > 3.0, "must trip the drift warning");
    }

    #[test]
    fn discourse_ratio_divides_when_both_are_present() {
        assert_eq!(discourse_ratio(4, 1), 4.0);
        assert_eq!(discourse_ratio(3, 3), 1.0);
    }

    // --- HRR: bind/unbind/superpose (OpenZoo, README §2.5) ---------------

    #[test]
    fn hrr_symbol_vector_is_deterministic() {
        assert_eq!(hrr_symbol_vector("LumbarRehab"), hrr_symbol_vector("LumbarRehab"));
    }

    #[test]
    fn hrr_symbol_vector_is_unit_length() {
        let v = hrr_symbol_vector("Nutrition");
        let mag = (v.iter().map(|x| x * x).sum::<f32>()).sqrt();
        assert!((mag - 1.0).abs() < 1e-4, "expected unit length, got {mag}");
    }

    #[test]
    fn hrr_distinct_symbols_have_low_similarity() {
        // Two random unit vectors in 512 dimensions concentrate tightly
        // around zero similarity — nowhere near hrr_bind/hrr_unbind's own
        // round-trip fidelity (checked below), which is the actual
        // property HRR's retrieval depends on: an unrelated symbol
        // should never be mistaken for the real bound value.
        let pairs = [
            ("LumbarRehab", "Nutrition"),
            ("period:0", "period:1"),
            ("HipMobility", "period:0"),
        ];
        for (a, b) in pairs {
            let sim = hrr_cosine_similarity(&hrr_symbol_vector(a), &hrr_symbol_vector(b));
            assert!(sim.abs() < 0.3, "expected low similarity for {a:?}/{b:?}, got {sim}");
        }
    }

    #[test]
    fn hrr_bind_unbind_roundtrip_recovers_the_bound_value() {
        let domain = hrr_symbol_vector("LumbarRehab");
        let position = hrr_symbol_vector(&hrr_period_symbol(0));
        let bound = hrr_bind(&domain, &position);

        let recovered = hrr_unbind(&bound, &domain);
        let sim = hrr_cosine_similarity(&recovered, &position);
        // A single bound pair's own noise floor at HRR_DIM=512 — measured
        // directly (~0.75), not assumed from theory — sits well below a
        // hypothetical "near-perfect" bar but is still unmistakably a
        // strong resonance, nowhere close to the ~0.3 unrelated-symbol
        // ceiling from the test above.
        assert!(sim > 0.5, "expected high-fidelity single-pair recovery, got {sim}");

        // And unbinding with an unrelated vector should NOT recover it —
        // the actual property that makes hrr_bind associate a specific
        // pair rather than any pair.
        let wrong = hrr_symbol_vector("Nutrition");
        let sim_wrong = hrr_cosine_similarity(&hrr_unbind(&bound, &wrong), &position);
        assert!(sim_wrong < sim, "unbinding with the wrong key should recover less than the right key");
    }

    #[test]
    fn hrr_superposition_still_resolves_each_periods_own_position() {
        // The actual capability worldline binding depends on: after
        // superposing several (domain ⊛ position) pairs into one fixed-
        // size vector, unbinding with a given domain's vector should
        // resonate most strongly with THAT domain's real period index,
        // not any of the others' — an index, not a lossless store, but
        // one that still ranks the right answer first.
        let pairs = [("LumbarRehab", 0usize), ("Nutrition", 1usize), ("HipMobility", 2usize)];
        let bound: Vec<[f32; HRR_DIM]> = pairs
            .iter()
            .map(|(domain, i)| hrr_bind(&hrr_symbol_vector(domain), &hrr_symbol_vector(&hrr_period_symbol(*i))))
            .collect();
        let trace_vector = hrr_superpose(&bound);

        for (domain, correct_index) in pairs {
            let recovered = hrr_unbind(&trace_vector, &hrr_symbol_vector(domain));
            let mut best = (usize::MAX, f32::MIN);
            for (_, candidate_index) in pairs {
                let sim = hrr_cosine_similarity(&recovered, &hrr_symbol_vector(&hrr_period_symbol(candidate_index)));
                if sim > best.1 {
                    best = (candidate_index, sim);
                }
            }
            assert_eq!(best.0, correct_index, "domain {domain:?} should resonate most with its own period index");
        }
    }

    #[test]
    fn hrr_vector_byte_codec_roundtrips_exactly() {
        // Unlike the HRR math itself, this is plain serialization — it
        // must round-trip exactly, not approximately.
        let v = hrr_symbol_vector("roundtrip-check");
        let bytes = hrr_vector_to_bytes(&v);
        assert_eq!(bytes.len(), HRR_DIM * 4);
        assert_eq!(hrr_bytes_to_vector(&bytes), Some(v));
    }

    #[test]
    fn hrr_bytes_to_vector_rejects_wrong_length() {
        assert_eq!(hrr_bytes_to_vector(&[0u8; 10]), None);
        assert_eq!(hrr_bytes_to_vector(&[]), None);
    }

    #[test]
    fn hrr_cosine_similarity_of_a_vector_with_itself_is_one() {
        let v = hrr_symbol_vector("self-similarity-check");
        let sim = hrr_cosine_similarity(&v, &v);
        assert!((sim - 1.0).abs() < 1e-4, "expected ~1.0, got {sim}");
    }

    #[test]
    fn query_worldline_resonance_rejects_incompatible_binding_key() {
        // The forward-compatibility check HRR_BINDING_KEY exists for:
        // a trace_payload paired with a binding_key from a different (or
        // absent) scheme must never be silently reinterpreted as this
        // scheme's byte layout.
        let trace = WorldlineTrace {
            agent: fixture_agent(30),
            period_boundaries: vec![],
            expertise_tags: vec![],
            trace_payload: Some(hrr_vector_to_bytes(&hrr_symbol_vector("whatever"))),
            binding_key: Some(b"some-other-scheme-v0".to_vec()),
            checksum: vec![0u8; 32],
            created_at: 0,
            expires_at: None,
        };
        // Exercises the same binding_key check query_worldline_resonance
        // itself runs, directly against a fixture entry — the extern
        // wrapping it needs a live agent_activity/get() host call this
        // crate's tests can't mock (see this Cargo.toml's own note), so
        // the guard clause is verified here instead of through the
        // #[hdk_extern] function directly.
        let is_compatible = matches!(&trace.binding_key, Some(k) if k.as_slice() == HRR_BINDING_KEY);
        assert!(!is_compatible);
    }

    // --- HRR: neighborhood binding (README §2.5) --------------------------
    //
    // build_neighborhood_binding/recall_neighborhood themselves need live
    // get()/get_critiques_for host calls this crate's tests can't mock
    // (see this Cargo.toml's own note) — the same reason
    // generate_worldline_trace's own wiring wasn't natively unit-tested
    // either. What's tested here directly is the pure math both externs
    // are built from: hrr_bind/hrr_superpose/hrr_cosine_similarity plus
    // the role/hash symbol derivation, replicated the same way
    // build_neighborhood_binding and recall_neighborhood actually call
    // them.

    #[test]
    fn hrr_neighbor_role_symbols_are_distinct() {
        let sim = hrr_cosine_similarity(
            &hrr_symbol_vector(hrr_neighbor_role_symbol(&NeighborKind::Evidence)),
            &hrr_symbol_vector(hrr_neighbor_role_symbol(&NeighborKind::Critique)),
        );
        assert!(sim.abs() < 0.3, "expected low similarity between the two role symbols, got {sim}");
    }

    #[test]
    fn hrr_neighbor_hash_symbol_is_deterministic_and_hash_specific() {
        let a = AnyDhtHash::from(fixture_entry_hash(40));
        let b = AnyDhtHash::from(fixture_entry_hash(41));
        assert_eq!(hrr_neighbor_hash_symbol(&a), hrr_neighbor_hash_symbol(&a));
        assert_ne!(hrr_neighbor_hash_symbol(&a), hrr_neighbor_hash_symbol(&b));
    }

    #[test]
    fn neighborhood_recall_scores_true_members_above_impostors() {
        // Replicates build_neighborhood_binding's own corpus construction
        // (two Evidence hashes, one Critique hash) directly, then checks
        // the property recall_neighborhood's membership probe actually
        // depends on: a real member scores clearly higher, under its real
        // role, than either (a) the same hash probed under the WRONG role,
        // or (b) a hash that was never bound in at all.
        let evidence_1 = AnyDhtHash::from(fixture_entry_hash(50));
        let evidence_2 = AnyDhtHash::from(fixture_entry_hash(51));
        let critique_1 = AnyDhtHash::from(fixture_action_hash(52));
        let never_bound = AnyDhtHash::from(fixture_entry_hash(53));

        let members = [
            (&evidence_1, NeighborKind::Evidence),
            (&evidence_2, NeighborKind::Evidence),
            (&critique_1, NeighborKind::Critique),
        ];
        let bound: Vec<[f32; HRR_DIM]> = members
            .iter()
            .map(|(hash, kind)| hrr_bind(&hrr_symbol_vector(hrr_neighbor_role_symbol(kind)), &hrr_symbol_vector(&hrr_neighbor_hash_symbol(hash))))
            .collect();
        let corpus = hrr_superpose(&bound);

        // Through score_neighborhood_candidates itself — the exact shared
        // function both recall_neighborhood and query_neighborhood_resonance
        // call — rather than reimplementing the probe inline, so this
        // test locks in the real code path, not a parallel copy of it.
        let candidates = vec![
            (evidence_1.clone(), NeighborKind::Evidence), // true member, correct role
            (evidence_1.clone(), NeighborKind::Critique),  // true member, WRONG role
            (evidence_2.clone(), NeighborKind::Evidence),  // true member, correct role
            (critique_1.clone(), NeighborKind::Critique),  // true member, correct role
            (never_bound.clone(), NeighborKind::Evidence), // never bound at all
        ];
        let results = score_neighborhood_candidates(&corpus, &candidates);
        let score_of = |hash: &AnyDhtHash, kind: &NeighborKind| -> f32 {
            results.iter().find(|r| &r.source_hash == hash && &r.kind == kind).unwrap().similarity
        };

        let true_member_score = score_of(&evidence_1, &NeighborKind::Evidence);
        let wrong_role_score = score_of(&evidence_1, &NeighborKind::Critique);
        let never_bound_score = score_of(&never_bound, &NeighborKind::Evidence);

        assert!(
            true_member_score > wrong_role_score,
            "a real member under its real role ({true_member_score}) should score above the same hash under the wrong role ({wrong_role_score})"
        );
        assert!(
            true_member_score > never_bound_score,
            "a real member ({true_member_score}) should score above a hash never bound in at all ({never_bound_score})"
        );

        // And every real member individually still scores clearly above
        // an unrelated candidate, not just in relative ranking.
        assert!(score_of(&evidence_2, &NeighborKind::Evidence) > never_bound_score);
        assert!(score_of(&critique_1, &NeighborKind::Critique) > never_bound_score);

        // score_neighborhood_candidates' own contract: results come back
        // sorted descending by similarity.
        for pair in results.windows(2) {
            assert!(pair[0].similarity >= pair[1].similarity, "results must be sorted descending by similarity");
        }
    }

    #[test]
    fn neighborhood_recall_rejects_incompatible_binding_key() {
        // Mirrors query_worldline_resonance_rejects_incompatible_binding_key
        // above — the same forward-compatibility guard, for the same
        // reason, on the neighborhood-binding side.
        let is_compatible = |key: &[u8]| key == NEIGHBORHOOD_BINDING_KEY;
        assert!(!is_compatible(b"some-other-scheme-v0"));
        assert!(is_compatible(NEIGHBORHOOD_BINDING_KEY));
    }

    // ---- CROSS-DOMAIN CRITIQUE LINKS: distinct_other_domains ----

    #[test]
    fn distinct_other_domains_excludes_the_home_domain() {
        let claim_domains = vec!["LumbarRehab".to_string(), "LumbarRehab".to_string()];
        let others = distinct_other_domains(&claim_domains, "LumbarRehab");
        assert!(others.is_empty(), "an agent whose claims are all in the home domain has no cross-domain presence");
    }

    #[test]
    fn distinct_other_domains_dedups_repeats() {
        let claim_domains = vec![
            "Nutrition".to_string(),
            "Nutrition".to_string(),
            "HipMobility".to_string(),
        ];
        let others = distinct_other_domains(&claim_domains, "LumbarRehab");
        assert_eq!(others, vec!["Nutrition".to_string(), "HipMobility".to_string()]);
    }

    #[test]
    fn distinct_other_domains_preserves_first_seen_order() {
        let claim_domains = vec![
            "HipMobility".to_string(),
            "Nutrition".to_string(),
            "HipMobility".to_string(),
        ];
        let others = distinct_other_domains(&claim_domains, "LumbarRehab");
        assert_eq!(others, vec!["HipMobility".to_string(), "Nutrition".to_string()]);
    }

    #[test]
    fn distinct_other_domains_of_no_claims_is_empty() {
        let others = distinct_other_domains(&[], "LumbarRehab");
        assert!(others.is_empty());
    }

    #[test]
    fn distinct_other_domains_mixes_home_and_foreign() {
        // An agent with claims in both their critique target's domain
        // AND elsewhere should still surface as cross-domain, reporting
        // only the elsewhere part — the home domain itself isn't
        // "cross" anything.
        let claim_domains = vec![
            "LumbarRehab".to_string(),
            "Nutrition".to_string(),
            "LumbarRehab".to_string(),
        ];
        let others = distinct_other_domains(&claim_domains, "LumbarRehab");
        assert_eq!(others, vec!["Nutrition".to_string()]);
    }
}
