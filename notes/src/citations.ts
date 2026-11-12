// ============================================================================
// notes/src/citations.ts — WHAT THE ROOM WAS ACTUALLY READING.
//
// The protocol below the gate has a field for this and nothing fills it.
// `Critique.past_cone` is meant to record what its author had seen before
// speaking, it is `#[serde(default)]`, and every `create_critique` commits an
// empty one — so `cone_recorded` is false everywhere. Open-work 6.5 is why,
// and the reason is not wiring: populating a cone means a CLIENT ASSERTING
// WHAT ITS USER READ, which is a promise under that user's key, and a client
// that over-claims makes its user appear better informed than they were.
//
// THE ROOM IS A THIRD OPTION THAT 6.5 DOES NOT CURRENTLY HAVE. It is not
// guessing and it is not reading minds: when somebody pastes a hash into a
// note, that hash was in front of the room. This module extracts those
// references as a PURE FUNCTION OF THE TEXT — so the derivation is auditable,
// re-runnable by anybody holding the same note, and cannot drift from what the
// note actually says.
//
// WHAT IT DELIBERATELY DOES NOT DO, and this is the whole of its honesty:
// it produces a CANDIDATE, never a cone. Nothing here reaches the DHT, nothing
// is signed, and no promotion sends a `past_cone` on anybody's behalf. 6.5
// stays open; this only means that when it is decided, the author has
// something to confirm rather than a blank field and a bad choice between
// leaving it empty and inventing it.
//
// HASH SHAPES, taken from the ones this project actually handles rather than
// from the spec's full set: Holochain's base64 hashes carry a 3-byte multihash
// prefix, which renders as a fixed 5-character head — `uhCkk` ActionHash,
// `uhCEk` EntryHash, `uhCAk` AgentPubKey, `uhC0k` DnaHash. A cone is made of
// ACTION hashes, so those are the ones collected as citations; the rest are
// recognised only so they can be reported separately instead of silently
// landing in a cone where they do not belong. That distinction is the same one
// `attachment-links.mjs` makes about hash kinds, and getting it wrong is the
// mistake the wrong-hash guard in `agent-sdk` exists for.
// ============================================================================

/** A reference found in a note's text. `kind` is what the prefix says it is,
 *  never what the surrounding prose claims. */
export interface Citation {
  ref: string;
  kind: 'action' | 'entry' | 'agent' | 'dna' | 'note';
}

export interface Citations {
  /** ActionHashes — the only kind a `past_cone` is made of. */
  actions: string[];
  /** Recognised, and NOT cone material. Reported so a reader can see that a
   *  hash was present and deliberately not offered, which is different from
   *  the room having missed it. */
  other: Citation[];
  /** Other notes in this room, by id. The room's own cross-references: a
   *  half-thought that answers another half-thought. Not DHT objects, so
   *  never cone material either — but they are how a thread's shape becomes
   *  visible before anything is published. */
  notes: string[];
}

// Base64url-ish body after the 5-char prefix. Holochain hashes are 39 bytes
// -> 52 base64 characters, and the trailing 4 are a DHT location rather than
// part of the identity; matching greedily and not asserting an exact length
// keeps a pasted hash with a stray character from being silently dropped.
const HASH = /\buhC(?:kk|Ek|Ak|0k)[A-Za-z0-9_-]{20,}/g;
// NO TRAILING `\b`, AND THAT IS THE WHOLE OF A REAL BUG — see the HASH
// pattern above, which never had one.
//
// `\b` is a boundary between a word character and a non-word one, and `-` is
// NOT a word character while `_` is. A note id is `nte_` plus 12 base64url
// characters, whose alphabet includes BOTH — so an id ending in `-` followed
// by ordinary punctuation ("Answering nte_abcdefghij-, and ...") has no word
// boundary at its end, the greedy class backtracks, and the match comes back
// one character SHORT. The citation then references an id that belongs to no
// note, silently.
//
// One in sixty-four ids end in `-` (the last of 12 base64url characters is
// uniform over 64), so this failed about 1.6% of the time and passed every
// other run — which is exactly how it survived: it was found when CI drew it
// on an unrelated PR, and the harness could not reproduce it locally.
//
// A negative lookahead would also work; dropping the boundary is what the
// neighbouring HASH pattern already does, for the same reason, and matching it
// keeps one rule in this file rather than two.
const NOTE_ID = /\bnte_[A-Za-z0-9_-]{8,}/g;

const KIND_FOR: Record<string, Citation['kind']> = {
  kk: 'action', Ek: 'entry', Ak: 'agent', '0k': 'dna',
};

/** Pure: same text in, same citations out, for ever. No clock, no state, no
 *  network — the property that lets a reader re-derive this from the note
 *  rather than trust the room's bookkeeping. */
export function citationsIn(text: unknown): Citations {
  const s = typeof text === 'string' ? text : '';
  const actions: string[] = [];
  const other: Citation[] = [];
  for (const m of s.match(HASH) ?? []) {
    const kind = KIND_FOR[m.slice(3, 5)];
    if (kind === 'action') { if (!actions.includes(m)) actions.push(m); }
    else if (kind && !other.some((o) => o.ref === m)) other.push({ ref: m, kind });
  }
  const notes: string[] = [];
  for (const m of s.match(NOTE_ID) ?? []) if (!notes.includes(m)) notes.push(m);
  return { actions, other, notes };
}

/** The room's union, for a promotion that wants to offer the THREAD's
 *  references rather than one note's.
 *
 *  `excludeNoteId` drops the note being promoted from the note-reference list:
 *  a note does not cite itself, and offering it back would be noise in the one
 *  place the author is being asked to confirm something.
 *
 *  ORDER IS BY FIRST APPEARANCE ACROSS THE NOTES AS GIVEN, so a caller that
 *  passes notes in creation order gets citations in the order the room met
 *  them. Stable, and not a ranking: nothing here says an earlier citation
 *  matters more, and the protocol below refuses rankings outright. */
export function citationsAcross(
  notes: { id: string; text: string }[],
  excludeNoteId?: string,
): Citations {
  const actions: string[] = [];
  const other: Citation[] = [];
  const noteRefs: string[] = [];
  for (const n of notes) {
    const c = citationsIn(n.text);
    for (const a of c.actions) if (!actions.includes(a)) actions.push(a);
    for (const o of c.other) if (!other.some((x) => x.ref === o.ref)) other.push(o);
    for (const r of c.notes) {
      if (r === excludeNoteId) continue;
      if (!noteRefs.includes(r)) noteRefs.push(r);
    }
  }
  return { actions, other, notes: noteRefs };
}

/** What a client should offer the author at promotion time, and what it must
 *  say while offering it.
 *
 *  The sentence is here rather than in the UI on purpose: it is the honest
 *  description of what this candidate IS, and a client that paraphrases it
 *  into "your cone" would be making exactly the over-claim 6.5 refuses. The
 *  room saw these hashes in its own text. It did not watch anybody read them.
 */
export const CANDIDATE_CAVEAT =
  'These are the hashes this room\'s notes mention. The room saw them in its own text — '
  + 'it did not watch anyone read them. Confirm or edit before this becomes part of a '
  + 'permanent record of what you had seen.';
