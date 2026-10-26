// ============================================================================
// The protocol's entry types, mirrored from dna/integrity/src/lib.rs.
//
// Field names and enum variant strings must match the Rust exactly.
// Holochain's msgpack (de)serialization uses serde's default
// externally-tagged representation for these plain enums, so
// "Moderate"/"Logical" and the rest have to be spelled as the Rust
// variants are, and a mismatched FIELD name does not error here — it
// fails to deserialize on the Rust side, which surfaces as an opaque
// wasm error rather than a type error.
//
// That failure mode is the main reason this package exists. Writing
// against this protocol by hand means guessing payload shapes from
// SPEC.md, and guessing wrong is quiet: `Promise` carries `modality`
// rather than `conditions`, `Constitution` carries its own separate
// `conditions` list, and `ConfidenceLevel` has no "Speculative" variant
// however natural that sounds. Each of those was gotten wrong while
// writing this repository's own verification scripts.
//
// SPEC.md §2 is the normative statement of all of this. These types are
// a convenience over it, not a replacement for it.
// ============================================================================

export type ConfidenceLevel =
  | 'Hypothetical' | 'Tentative' | 'Moderate' | 'High' | 'Certain';

export const CONFIDENCE_LEVELS: readonly ConfidenceLevel[] = [
  'Hypothetical', 'Tentative', 'Moderate', 'High', 'Certain',
] as const;

/** The five modes are non-fungible means of knowing, not a rating scale
 * (SPEC.md §3.2, Invariant #4). An experiential report and a logical
 * objection are different kinds of claim about the world; the protocol
 * refuses to flatten them into one signal, and so does this library —
 * see EpistemicAgent#critique, which requires one and defaults none. */
export type CritiqueMode =
  | 'Experiential'      // "I tried this and..."
  | 'Methodological'    // "The study design is flawed because..."
  | 'Logical'           // "This contradicts itself because..."
  | 'Evidential'        // "This source doesn't say what you claim..."
  | 'Phenomenological'; // "My subjective experience differs because..."

export const CRITIQUE_MODES: readonly CritiqueMode[] = [
  'Experiential', 'Methodological', 'Logical', 'Evidential', 'Phenomenological',
] as const;

export type CritiqueTargetType =
  | 'Claim' | 'Critique' | 'Constitution' | 'Membrane' | 'CritiqueSpecies';

export type AntibodyPatternKind =
  | 'SpamFlood' | 'SybilCluster' | 'Plagiarism'
  | 'CoordinatedManipulation' | 'Impersonation';

export interface Claim {
  content: string;
  domain: string;
  author: Uint8Array;
  /** Microseconds. */
  timestamp: number;
  evidence_hashes: Uint8Array[];
  confidence: ConfidenceLevel;
  semantic_tags: string[];
  source_mew: Uint8Array | null;
}

export interface Critique {
  target: Uint8Array;
  target_type: CritiqueTargetType;
  critique_mode: CritiqueMode;
  content: string;
  author: Uint8Array;
  /** Microseconds. */
  timestamp: number;
  replication_attempted: boolean;
  evidence_hashes: Uint8Array[];
  species: Uint8Array | null;
}

export interface AntibodyPattern {
  target: Uint8Array;
  target_type: CritiqueTargetType;
  kind: AntibodyPatternKind;
  rationale: string;
  author: Uint8Array;
  /** Seconds. */
  timestamp: number;
}

export interface Retraction {
  target_claim: Uint8Array;
  reason: string;
  replacement_claim: Uint8Array | null;
  author: Uint8Array;
  /** Seconds. */
  timestamp: number;
}

export interface Membrane {
  domain: string;
  description: string;
  required_promises: string[];
  validation_rules_hash: Uint8Array | null;
  creator: Uint8Array;
  /** Seconds. */
  created_at: number;
  constitution: Uint8Array;
}

/** One clause of a Constitution: what an agent promises, in which
 * domain, optionally through which receptor type. `action` is free text
 * by design — the protocol never supplies a vocabulary of promises, and
 * a membrane's `required_promises` are matched against this field as
 * written. */
export interface ConstitutionPromise {
  action: string;
  domain: string;
  modality: CritiqueMode | null;
}

/** A conditional clause. Carried for completeness: nothing in this
 * library interprets one, and `promiseCompliance()` deliberately ignores
 * them — a condition is a statement about WHEN a promise applies, and
 * deciding that is a reader's judgement rather than a string match. */
export interface Condition {
  condition_type: string;
  parameters: string[];
}

/** What an agent has published about what it promises. Nothing requires
 * an agent to have one, and its absence is not a deficiency — see
 * `promiseCompliance()` on why that distinction is load-bearing.
 *
 * ON THE TIMESTAMPS: `Membrane.created_at` above is documented as
 * seconds, `get_agent_constitution` filters expiry against `sys_time()`
 * in SECONDS, and this repository's own harnesses have published
 * `published_at` in both seconds and microseconds. Publish both fields
 * in SECONDS. A microsecond `expires_at` is a hundred thousand times too
 * large to ever fire, so the constitution it belongs to never expires
 * from that read's point of view. */
export interface Constitution {
  agent: Uint8Array;
  promises: ConstitutionPromise[];
  conditions: Condition[];
  /** Seconds — see the note above. */
  published_at: number;
  /** Seconds, and MUST be > published_at. */
  expires_at: number | null;
}

/** One member's promises set beside what their membrane asks for.
 *
 * NOT A SCORE, AND THE SHAPE IS WHAT KEEPS IT HONEST. Every field is a
 * set of strings traceable to a published entry: what the membrane
 * declared it requires, and what this agent declared it promises. There
 * is no number, no ranking, and no ordering by compliance — Invariant #1
 * forbids a canonical comparative signal over agents, and a client that
 * reduced this to a percentage would have rebuilt one.
 *
 * `promisesAll` is a fact about declared text and nothing else: it says
 * the required phrases appear in this agent's constitution for this
 * domain. It does not say the agent kept the promise, and nothing in the
 * protocol can. */
export interface MemberPromiseStanding {
  agent: Uint8Array;
  /** False means exactly that — no constitution found. It is NOT a
   * verdict: nothing obliges an agent to publish one. */
  hasConstitution: boolean;
  /** Promised actions whose domain matches the membrane's. */
  promised: string[];
  /** Promised actions in some OTHER domain. Kept separate rather than
   * counted, because a promise about another domain is not a promise
   * about this one — and silently accepting it would make the whole
   * comparison meaningless. */
  promisedElsewhere: string[];
  /** Required here, not promised here. */
  missing: string[];
  /** Promised here beyond what is required. Not a violation. */
  extra: string[];
  /** `missing.length === 0`. */
  promisesAll: boolean;
}

/** A membrane's declared requirements beside every member's declared
 * promises. Read-only, caller-scoped, and it gates nothing: see
 * `promiseCompliance()`. */
export interface MembranePromiseCompliance {
  domain: string;
  requiredPromises: string[];
  /** In the order the DHT returned the members, deduplicated. Never
   * sorted by compliance. */
  members: MemberPromiseStanding[];
}

/** This agent's own SWO budget for the current rolling window. Reads
 * only the caller's own source chain, so it says nothing about anyone
 * else and is never a comparative signal. */
export interface FrictionStatus {
  recent_count: number;
  limit: number;
  window_secs: number;
  blocked: boolean;
}

/** An aggregate over a Membrane's domain. Describes the domain, never an
 * agent, and nothing in the protocol acts on it. */
export interface DiscourseHealth {
  domain: string;
  abstract_to_embodied_ratio: number;
  /** Set by the protocol above a 3.0 ratio — discourse drifting from
   * practice. Advisory; nothing enforces it. */
  warning: string | null;
  total_claims: number;
  total_critiques: number;
  /** [mode, count] pairs — serde's shape for Vec<(CritiqueMode, u32)>. */
  critique_mode_distribution: [CritiqueMode, number][];
}

export interface CrossDomainCritique {
  critique_action: Uint8Array;
  critique_author: Uint8Array;
  critiquer_home_domains: string[];
}

/** A trust lens the CALLER aims: the roots and depth are supplied per
 * call, and two callers legitimately get different answers. There is no
 * default, deliberately — see SPEC.md §10.8 and README.md §4.4. */
export interface AttestationPolicy {
  require_attestation_from: Uint8Array[] | null;
  min_attestations: number;
  max_attestation_depth: number | null;
}

/** The same shape for connection strength: the threshold is the
 * caller's, never the protocol's. */
export interface ConductancePolicy {
  min_effective_conductance: number;
}

/** A Record with its app entry decoded, plus both hashes. The conductor
 * hands back raw msgpack bytes for the entry — it cannot know this app's
 * schema — so decoding happens once, here. */
export interface Decoded<T> {
  entryHash: Uint8Array;
  actionHash: Uint8Array;
  entry: T;
}
