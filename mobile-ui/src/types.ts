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
