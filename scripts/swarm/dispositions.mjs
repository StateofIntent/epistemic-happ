// ============================================================================
// scripts/swarm/dispositions.mjs — WHAT MAKES ONE OBSERVER DIFFER FROM ANOTHER.
//
// READINESS item 11: "Run a deliberate minority of observers with looser
// thresholds and unusual CritiqueSpecies preferences — the swarm result
// applied to this graph." A disposition is that sentence made executable: a
// threshold, a mode preference, and a declared promise about both.
//
// ---------------------------------------------------------------------------
// MECHANICAL, NOT GENERATED, AND THAT IS THE FIRST INCREMENT'S WHOLE DESIGN.
//
// Every rule here is a property of the data a reader can check for themselves
// — "confidence is High and evidence_hashes is empty" is true or it is not.
// None of it is an opinion about content.
//
// The reason is Invariant 6 rather than caution about language models.
// Everything a swarm writes is permanent and un-deletable by anybody, and
// item 11's own finding is that exploration cannot be told from degradation
// at the time of writing — adoption is visible only afterwards. So the first
// permanent writes an autonomous population ever makes should be ones whose
// basis a reader can audit line by line. An LLM emitting free-form critiques
// is a content-quality problem this repository has no machinery for, and its
// output would be permanent before anybody could assess it.
//
// THRESHOLDS ARE PROMISES, which is Burgess's framing and is load-bearing
// here rather than decorative. Each disposition's threshold is published as a
// `Constitution` promise BEFORE the agent acts, so the standard an agent
// judges by is itself on the record and itself critiquable. An agent whose
// behaviour diverges from its declared threshold is visible by comparison,
// not by anybody's say-so.
//
// NOTHING HERE COMPUTES A SCORE. Invariant 1 bars a canonical comparative
// reputation, and the temptation in a swarm is to rank agents by how often
// they were "right". These functions return a decision and a reason; the
// reason names the property that triggered it.
// ============================================================================

/** Confidence levels, ordered. THE PROTOCOL'S OWN ENUM, and these five names
 *  are copied from `dna/integrity/src/lib.rs` rather than remembered — the
 *  first version of this file invented `Speculative` and `Replicated`, which
 *  do not exist, and the claims it seeded failed to DESERIALIZE at the extern
 *  boundary before any validation rule saw them. A disposition that reasons
 *  about levels the protocol does not have is reasoning about nothing. */
const CONFIDENCE_RANK = {
  Hypothetical: 0,
  Tentative: 1,
  Moderate: 2,
  High: 3,
  Certain: 4,
};

export const confidenceRank = (c) => CONFIDENCE_RANK[c] ?? -1;

// THE DISPOSITIONS.
//
// `minConfidenceToFlag` is the threshold item 11 means by "looser": an agent
// with a LOWER bar flags more, because it objects to unevidenced claims at
// confidence levels the others let pass. That is the deliberate minority, and
// it is a number rather than a personality.
export const DISPOSITIONS = {
  // The majority position: an unevidenced claim is only worth objecting to
  // once its author has asserted real confidence in it.
  evidential_strict: {
    name: 'evidential_strict',
    minConfidenceToFlag: CONFIDENCE_RANK.High,
    mode: 'Evidential',
    minority: false,
    promise:
      'I will publish an Evidential critique of any claim asserting High confidence or above '
      + 'while citing no evidence, and of no other claim. I state this threshold so that my '
      + 'silence about a weaker claim is a position rather than an oversight.',
  },
  // THE DELIBERATE MINORITY — a looser threshold, by one number.
  evidential_loose: {
    name: 'evidential_loose',
    minConfidenceToFlag: CONFIDENCE_RANK.Tentative,
    mode: 'Evidential',
    minority: true,
    promise:
      'I will publish an Evidential critique of any claim citing no evidence at Tentative '
      + 'confidence or above. This is a deliberately looser threshold than the majority holds, '
      + 'and I expect to object to claims others let pass. Whether that is exploration or noise '
      + 'is not mine to decide; it is visible in whether anybody adopts what I propose.',
  },
  // A different QUESTION, not a different threshold: this one objects to the
  // method rather than the evidence, and only where a claim is specific
  // enough that a method should have been stated.
  methodological: {
    name: 'methodological',
    minConfidenceToFlag: CONFIDENCE_RANK.Moderate,
    mode: 'Methodological',
    minority: false,
    promise:
      'I will publish a Methodological critique of any claim at Moderate confidence or above '
      + 'that cites evidence but states no method of arriving at it. I do not object to the '
      + 'evidence; I object to not being told how it was used.',
  },
};

/**
 * Should this disposition critique this claim, and why?
 *
 * Pure: no network, no clock, no randomness. Given the same claim and the same
 * disposition it returns the same answer for ever, which is what makes a
 * swarm's output auditable after the fact rather than merely observed.
 *
 * Returns `{ act: false, reason }` or `{ act: true, mode, reason, content }`.
 */
export function assess(disposition, claim, { alreadyCritiquedBy = [] } = {}) {
  const d = typeof disposition === 'string' ? DISPOSITIONS[disposition] : disposition;
  if (!d) return { act: false, reason: 'unknown disposition' };

  // NEVER TWICE ON ONE TARGET. A disposition is a standard, not an appetite:
  // having said a thing once, saying it again adds no information and spends
  // a permanent write plus a §6 friction allowance. This is the self-limiting
  // the brief asks for, enforced here rather than left to the loop.
  if (alreadyCritiquedBy.includes(d.name)) {
    return { act: false, reason: `${d.name} has already critiqued this target` };
  }

  const rank = confidenceRank(claim.confidence);
  if (rank < 0) return { act: false, reason: `unreadable confidence: ${claim.confidence}` };
  if (rank < d.minConfidenceToFlag) {
    return {
      act: false,
      reason: `confidence ${claim.confidence} is below ${d.name}'s declared threshold`,
    };
  }

  const evidenceCount = (claim.evidence_hashes ?? []).length;

  if (d.mode === 'Evidential') {
    if (evidenceCount > 0) {
      return { act: false, reason: `claim cites ${evidenceCount} piece(s) of evidence` };
    }
    return {
      act: true,
      mode: 'Evidential',
      reason: `confidence ${claim.confidence} with zero cited evidence, at or above ${d.name}'s threshold`,
      content:
        `This claim asserts ${claim.confidence} confidence and cites no evidence. `
        + `Published by the ${d.name} disposition, whose declared threshold is to flag `
        + `unevidenced claims at or above ${rankName(d.minConfidenceToFlag)} confidence. `
        + `THIS IS A STRUCTURAL OBSERVATION, NOT A JUDGEMENT OF THE CONTENT: no reading of `
        + `what the claim says was performed, and the author may well be right.`,
    };
  }

  if (d.mode === 'Methodological') {
    // The inverse population: cites evidence, so the Evidential dispositions
    // are silent, but says nothing about how.
    if (evidenceCount === 0) {
      return { act: false, reason: 'claim cites no evidence, which is the Evidential question' };
    }
    if (statesMethod(claim.content)) {
      return { act: false, reason: 'claim states a method' };
    }
    return {
      act: true,
      mode: 'Methodological',
      reason: `cites ${evidenceCount} piece(s) of evidence with no method stated`,
      content:
        `This claim cites ${evidenceCount} piece(s) of evidence but states no method. `
        + `Published by the ${d.name} disposition. The objection is to the absence of a `
        + `stated method, not to the evidence or the conclusion. `
        + `THIS IS A STRUCTURAL OBSERVATION: the test is a literal search for method words, `
        + `so a method described in other terms will be missed and this critique will be wrong.`,
    };
  }

  return { act: false, reason: `no rule for mode ${d.mode}` };
}

const rankName = (r) => Object.keys(CONFIDENCE_RANK).find((k) => CONFIDENCE_RANK[k] === r) ?? '?';

/**
 * Does this claim say how it got there?
 *
 * A LITERAL WORD SEARCH, AND ITS WEAKNESS IS DECLARED IN THE CRITIQUE IT
 * PRODUCES. There is no semantic understanding here and none is pretended: a
 * claim describing its method without using any of these words is a false
 * positive, which is why the published critique says so in its own text. A
 * mechanical rule that hides its own failure mode is worse than one that
 * states it.
 */
export function statesMethod(content) {
  return /\b(method|methodology|measured|sampled|replicat|procedure|protocol|experiment|survey|trial)\w*/i
    .test(String(content ?? ''));
}

/**
 * The deliberate minority's share of a population.
 *
 * Item 11 asks for "a deliberate minority". The brief suggests around 20%, and
 * the reason to keep it a minority rather than half is the swarm result it
 * comes from: a population aligns while a minority explores, so an even split
 * is not a swarm with dissent, it is two swarms.
 */
export function assignDispositions(count, { minorityShare = 0.2 } = {}) {
  const minorityCount = Math.max(1, Math.round(count * minorityShare));
  const out = [];
  for (let i = 0; i < count; i++) {
    if (i < minorityCount) out.push(DISPOSITIONS.evidential_loose);
    else if (i % 2 === 1) out.push(DISPOSITIONS.evidential_strict);
    else out.push(DISPOSITIONS.methodological);
  }
  return out;
}
