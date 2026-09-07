// ============================================================================
// gateway/src/jsonld.ts — the protocol's entries as Linked Data, honestly.
//
// WHAT THIS IS FOR. The design note's diagnosis of the Semantic Web is that it
// bought universal addresses and machine-readable structure, and paid with no
// native model of disagreement and weak provenance. This protocol is the other
// way round. So the export's whole job is to carry the two things Linked Data
// could not express, rather than to flatten into the shapes it already has:
//
//   1. TYPED DISAGREEMENT TRAVELS WITH THE CLAIM. Every critique is exported
//      with its mode intact — Experiential, Methodological, Logical,
//      Evidential, Phenomenological. A consumer that ignores the mode gets a
//      list of critiques, not a score, because there is no score to get.
//
//   2. PROVENANCE IS THE HOLOCHAIN HASH, and it travels. The `@id` here is an
//      HTTP URL because Linked Data needs one, but `canonicalHash` is the
//      entry's real address, and `isBasedOn` points at it. If this gateway
//      disappears the hash still resolves on the DHT; if the two disagree, the
//      DHT is right. Said in the data, not only in the prose.
//
// WHAT IS DELIBERATELY ABSENT, and must stay absent. schema.org has
// `aggregateRating`, `ratingValue`, `interactionStatistic` and
// `upvoteCount`/`downvoteCount`, and every one of them would accept this
// protocol's critiques as input and produce exactly the canonical comparative
// score Invariant 1 exists to refuse. Emitting one would not be a convenience
// for consumers; it would be this gateway computing, in a JSON document, the
// number the protocol declined to compute — and every downstream tool would
// then treat that number as the protocol's own. There is no vocabulary term
// here for "how good is this claim", and adding one is a protocol decision
// rather than a serialization detail.
// ============================================================================

import type { DecodedRecord } from './conductor.js';

export interface Claim {
  content: string;
  domain: string;
  author: Uint8Array;
  timestamp: number;
  evidence_hashes: Uint8Array[];
  confidence: string;
  semantic_tags: string[];
  source_mew: Uint8Array | null;
}

export interface Critique {
  target: Uint8Array;
  target_type: string;
  critique_mode: string;
  content: string;
  author: Uint8Array;
  timestamp: number;
  replication_attempted: boolean;
  evidence_hashes: Uint8Array[];
  species: Uint8Array | null;
}

export interface Retraction {
  target_claim: Uint8Array;
  reason: string;
  replacement_claim: Uint8Array | null;
  author: Uint8Array;
  timestamp: number;
}

export interface AntibodyPattern {
  target: Uint8Array;
  target_type: string;
  kind: string;
  rationale: string;
  author: Uint8Array;
  timestamp: number;
}

export const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
/** base64url, so a hash survives a URL path without escaping. Decoded back to
 * plain base64 on the way in — the two differ only in two characters. */
export const b64url = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url');
export const fromB64url = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'base64url'));

/** Holochain Timestamps are microseconds since the epoch, not milliseconds —
 * the same conversion every other package in this repo makes by hand. */
export const isoFromMicros = (micros: number): string => new Date(Math.floor(micros / 1000)).toISOString();

export interface Origin {
  /** The public origin this gateway is reachable at, used to mint `@id`s.
   * Explicit rather than derived from a Host header an intermediary may have
   * rewritten — a wrong `@id` is a permanent lie in someone else's cache. */
  origin: string;
}

export const claimUrl = (o: Origin, entryHash: Uint8Array) => `${o.origin}/claims/${b64url(entryHash)}`;
export const domainUrl = (o: Origin, domain: string) => `${o.origin}/domains/${encodeURIComponent(domain)}`;
export const agentUrl = (o: Origin, agent: Uint8Array) => `${o.origin}/agents/${b64url(agent)}`;

/** The vocabulary namespace is this gateway's own `/ns`, and `/ns` is a real
 * page describing every term. Pointing at a hosted vocabulary that does not
 * exist is the commonest way Linked Data ends up unresolvable, and inventing a
 * domain name for one would be worse than useless here. */
export const vocabulary = (o: Origin) => `${o.origin}/ns#`;

export function context(o: Origin): unknown {
  return [
    'https://schema.org/',
    {
      erp: vocabulary(o),
      domain: 'erp:domain',
      confidence: 'erp:confidence',
      critiqueMode: 'erp:critiqueMode',
      canonicalHash: 'erp:canonicalHash',
      canonicalHashAlgorithm: 'erp:canonicalHashAlgorithm',
      dnaHash: 'erp:dnaHash',
      critique: { '@id': 'erp:critique', '@container': '@set' },
      retraction: { '@id': 'erp:retraction', '@container': '@set' },
      flag: { '@id': 'erp:flag', '@container': '@set' },
      semanticTag: { '@id': 'erp:semanticTag', '@container': '@set' },
      replicationAttempted: 'erp:replicationAttempted',
      agentPubKey: 'erp:agentPubKey',
    },
  ];
}

function agentNode(o: Origin, agent: Uint8Array): unknown {
  return {
    '@type': 'Person',
    '@id': agentUrl(o, agent),
    // The only identity this protocol has is a public key, and the export
    // says so rather than inventing a name for a reader to trust.
    agentPubKey: b64(agent),
    name: `agent ${b64(agent).slice(0, 12)}…`,
  };
}

export function critiqueNode(
  o: Origin, claimEntryHash: Uint8Array, record: DecodedRecord<Critique>,
): unknown {
  return {
    '@type': ['erp:Critique', 'Comment'],
    // A fragment of the claim it targets: a critique is only meaningful with
    // its target, and the protocol has no read that fetches one alone.
    '@id': `${claimUrl(o, claimEntryHash)}#critique-${b64url(record.actionHash)}`,
    // The field Linked Data had no way to express, kept as the protocol's own
    // typed value rather than mapped onto a rating or a sentiment.
    critiqueMode: record.entry.critique_mode,
    text: record.entry.content,
    author: agentNode(o, record.entry.author),
    dateCreated: isoFromMicros(record.entry.timestamp),
    replicationAttempted: record.entry.replication_attempted,
    canonicalHash: b64(record.actionHash),
    canonicalHashAlgorithm: 'holochain-action-hash',
  };
}

export function claimDocument(input: {
  o: Origin;
  claim: DecodedRecord<Claim>;
  critiques: DecodedRecord<Critique>[];
  retractions: DecodedRecord<Retraction>[];
  flags: DecodedRecord<AntibodyPattern>[];
  dnaHash: string | null;
}): unknown {
  const { o, claim, critiques, retractions, flags, dnaHash } = input;
  return {
    '@context': context(o),
    '@type': ['erp:Claim', 'CreativeWork'],
    '@id': claimUrl(o, claim.entryHash),
    text: claim.entry.content,
    domain: claim.entry.domain,
    // The author's own stated confidence — a self-declaration, never anyone
    // else's assessment of them, and it must never be read as a rating.
    confidence: claim.entry.confidence,
    semanticTag: claim.entry.semantic_tags,
    author: agentNode(o, claim.entry.author),
    dateCreated: isoFromMicros(claim.entry.timestamp),
    isPartOf: { '@id': domainUrl(o, claim.entry.domain) },
    canonicalHash: b64(claim.entryHash),
    canonicalHashAlgorithm: 'holochain-entry-hash',
    dnaHash,
    // The exported document is BASED ON the DHT entry, not equal to it. If
    // this URL and that hash ever disagree, the hash is right.
    isBasedOn: {
      '@type': 'CreativeWork',
      identifier: b64(claim.entryHash),
      description:
        'The canonical entry on the Holochain DHT. This HTTP document is a one-way export of '
        + 'it; the DHT copy is authoritative and this one may be stale or absent.',
    },
    critique: critiques.map((record) => critiqueNode(o, claim.entryHash, record)),
    // A retraction that did not travel with its claim would leave the web
    // copy asserting something its author has publicly withdrawn — the single
    // most damaging thing a one-way export can get wrong.
    retraction: retractions.map((record) => ({
      '@type': 'erp:Retraction',
      '@id': `${claimUrl(o, claim.entryHash)}#retraction-${b64url(record.actionHash)}`,
      text: record.entry.reason,
      author: agentNode(o, record.entry.author),
      dateCreated: isoFromMicros(record.entry.timestamp),
      canonicalHash: b64(record.actionHash),
      canonicalHashAlgorithm: 'holochain-action-hash',
    })),
    // Antibody flags are one agent's accusation of a structural pattern, not a
    // verdict, and are exported with the accuser attached for that reason.
    flag: flags.map((record) => ({
      '@type': 'erp:AntibodyPattern',
      '@id': `${claimUrl(o, claim.entryHash)}#flag-${b64url(record.actionHash)}`,
      name: record.entry.kind,
      text: record.entry.rationale,
      author: agentNode(o, record.entry.author),
      dateCreated: isoFromMicros(record.entry.timestamp),
      canonicalHash: b64(record.actionHash),
      canonicalHashAlgorithm: 'holochain-action-hash',
    })),
  };
}

export function domainDocument(input: {
  o: Origin;
  domain: string;
  claims: DecodedRecord<Claim>[];
}): unknown {
  const { o, domain, claims } = input;
  return {
    '@context': context(o),
    // ItemList and not a ranked one: `itemListOrder` is deliberately
    // "Unordered" rather than absent, because a consumer that finds no order
    // stated will invent one, and the honest answer is that the DHT returned
    // these in the order it happened to return them.
    '@type': ['erp:Domain', 'ItemList'],
    '@id': domainUrl(o, domain),
    name: domain,
    itemListOrder: 'https://schema.org/ItemListUnordered',
    numberOfItems: claims.length,
    itemListElement: claims.map((record) => ({
      '@type': ['erp:Claim', 'CreativeWork'],
      '@id': claimUrl(o, record.entryHash),
      text: record.entry.content,
      author: agentNode(o, record.entry.author),
      dateCreated: isoFromMicros(record.entry.timestamp),
      canonicalHash: b64(record.entryHash),
    })),
  };
}
