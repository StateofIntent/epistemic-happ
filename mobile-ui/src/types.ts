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
