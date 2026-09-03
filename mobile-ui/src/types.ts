// Mirrors the Rust entry types this UI actually calls into
// (dna/integrity/src/lib.rs) — only the fields this app reads or
// writes, not a full restatement of the DNA's schema. Field names and
// enum variant strings must match exactly: Holochain's msgpack
// (de)serialization uses serde's default externally-tagged
// representation for these plain enums, so "Moderate"/"Logical"/etc.
// have to be spelled exactly as the Rust variant names, and a
// mismatched field name silently fails to deserialize on the Rust side
// rather than erroring here.

export type ConfidenceLevel = 'Hypothetical' | 'Tentative' | 'Moderate' | 'High' | 'Certain';

export const CONFIDENCE_LEVELS: ConfidenceLevel[] = [
  'Hypothetical', 'Tentative', 'Moderate', 'High', 'Certain',
];

export type CritiqueMode = 'Experiential' | 'Methodological' | 'Logical' | 'Evidential' | 'Phenomenological';

export const CRITIQUE_MODES: CritiqueMode[] = [
  'Experiential', 'Methodological', 'Logical', 'Evidential', 'Phenomenological',
];

export interface Claim {
  content: string;
  domain: string;
  author: Uint8Array;
  timestamp: number;
  evidence_hashes: Uint8Array[];
  confidence: ConfidenceLevel;
  semantic_tags: string[];
  source_mew: Uint8Array | null;
}

export interface Critique {
  target: Uint8Array;
  target_type: 'Claim';
  critique_mode: CritiqueMode;
  content: string;
  author: Uint8Array;
  timestamp: number;
  replication_attempted: boolean;
  evidence_hashes: Uint8Array[];
  species: Uint8Array | null;
}

/** now_micros, matching every other place in this codebase that builds
 * a Holochain Timestamp-shaped microsecond value by hand (see
 * bridge/src/index.ts and this project's own live-verification
 * harnesses — Timestamp itself is µs-since-epoch, not ms). */
export function nowMicros(): number {
  return Date.now() * 1000;
}

// --- Epistemic state the protocol computes about discourse -------------
//
// These are read-only views the coordinator zome already exposes. They
// are protocol-computed and identical for every viewer, which is what
// makes them safe to surface under README.md §4.4's second constraint:
// the artifact under evaluation renders the same for everyone. Nothing
// here is inferred by this client.

/** get_synaptic_link_friction_status — this agent's own SWO budget for
 * the current rolling window. Agent-centric by construction: it reads
 * the caller's own source chain, so it is never a comparative signal
 * about anyone else. */
export interface SynapticFrictionStatus {
  recent_count: number;
  limit: number;
  window_secs: number;
  blocked: boolean;
}

export type AntibodyPatternKind =
  | 'SpamFlood'
  | 'SybilCluster'
  | 'Plagiarism'
  | 'CoordinatedManipulation'
  | 'Impersonation';

export interface AntibodyPattern {
  target: Uint8Array;
  target_type: 'Claim' | 'Critique' | 'Constitution' | 'Membrane' | 'CritiqueSpecies';
  kind: AntibodyPatternKind;
  rationale: string;
  author: Uint8Array;
  timestamp: number;
}

export interface Retraction {
  target_claim: Uint8Array;
  reason: string;
  replacement_claim: Uint8Array | null;
  author: Uint8Array;
  timestamp: number;
}

// --- Membranes: domains as founded things ------------------------------
//
// A Membrane is what makes a domain more than a free-text string on a
// Claim — it has a founder, a description, and the promises it demands
// of anyone working in it. Several reads are anchored to a Membrane
// rather than a domain name for exactly that reason (see
// GetDiscourseHealthPayload's own comment in the coordinator zome):
// the aggregate is scoped to something that actually exists on the DHT.

export interface Membrane {
  domain: string;
  description: string;
  required_promises: string[];
  validation_rules_hash: Uint8Array | null;
  creator: Uint8Array;
  created_at: number;
  /** The founder's own published Constitution — a Membrane cannot be
   * created without one, which is how domain creation was made
   * accountable rather than costly. */
  constitution: Uint8Array;
}

/** get_discourse_health — an aggregate over a Membrane's own domain.
 * Protocol-computed and identical for every viewer. */
export interface DiscourseHealth {
  domain: string;
  abstract_to_embodied_ratio: number;
  /** Set by the protocol when the ratio exceeds 3.0 — discourse drifting
   * away from practice. Not a score, and not about any agent. */
  warning: string | null;
  total_claims: number;
  total_critiques: number;
  /** Arrives as [mode, count] pairs — serde's representation of the
   * Rust Vec<(CritiqueMode, u32)>. */
  critique_mode_distribution: [CritiqueMode, number][];
}

/** get_cross_domain_critiques — a reading lens, never a gate. Reports
 * which critiques in a membrane came from agents whose own claims live
 * elsewhere, and which other domains those are. Scores nothing. */
export interface CrossDomainCritique {
  critique_action: Uint8Array;
  critique_author: Uint8Array;
  critiquer_home_domains: string[];
}

// --- Founding a domain -------------------------------------------------
//
// Two entries, in order: a Constitution (what the FOUNDER promises, under
// their own key) and then a Membrane referencing it (what the DOMAIN
// demands of anyone working in it). Those are different things and the
// founding UI keeps them visibly apart, because conflating "what I
// promise" with "what I require of others" is the easiest mistake to make
// here and the protocol treats them as distinct.

export interface Promise {
  action: string;
  domain: string;
  /** Optional receptor mode this promise is scoped to. Left null by the
   * founding flow — a promise about how one works is rarely specific to
   * one mode of critique. */
  modality: CritiqueMode | null;
}

export interface Condition {
  condition_type: string;
  parameters: string[];
}

export interface Constitution {
  agent: Uint8Array;
  /** At least one is required by validation. */
  promises: Promise[];
  /** Carried into N4L export but given no protocol meaning — left empty
   * by the founding flow rather than inventing a UI for a field nothing
   * reads. */
  conditions: Condition[];
  published_at: number;
  expires_at: number | null;
}
