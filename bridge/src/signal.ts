// ============================================================================
// bridge/src/signal.ts — THE SIGNAL PATH, PULLED OUT SO IT CAN BE WATCHED.
//
// READINESS item 21. Everything here used to live inside
// `EpistemicBridgeService.handleSignal` and the two `bridge*ToTwitter`
// methods, where it could not be tested at all: `index.ts` calls `main()` at
// module load, so importing it connects to a conductor and demands Twitter
// credentials. A decision nobody can call in isolation is a decision nobody
// can watch fail, and item 21's blocker was exactly that — "a fix nobody
// watched fail is not evidence", with no way to produce the evidence.
//
// So the two decisions the bridge makes about a signal — IS THIS MINE, and
// WHAT DOES THE TWEET SAY — are pure functions here, driven by
// `scripts/live-verify/bridge-signal.mjs` against signals from a real
// conductor. The harness drives THESE functions, not a copy of them: a
// harness carrying its own parse would pass while the bridge stayed broken,
// which is this repository's "a prober proves the rule it probes" failure in
// its most direct form.
// ============================================================================

export const COORDINATOR_ZOME = 'epistemic_coordinator';

/** What the bridge decided a signal was, or `null` for "not mine". */
export type CoordinatorSignal =
  | { kind: 'NewMew'; mew: any; entryHash: unknown }
  | { kind: 'NewClaim'; claim: any; entryHash: unknown };

// THE SIGNAL SHAPE IS NESTED, AND READING IT FLAT DISCARDS EVERYTHING.
//
// `@holochain/client` 0.21 delivers a signal as
// `{ type: 'app', value: { cell_id, zome_name, payload } }`. The older flat
// shape — `signal.zome_name`, payload on `signal.data` — matches nothing, so
// the guard evaluates `undefined !== 'epistemic_coordinator'`, which is always
// true, and every signal is dropped before anything reads it.
//
// This is the same client release that turned `CellInfo` into a discriminated
// union, which `scripts/live-verify/trust-lenses.mjs` already documents in the
// same terms: a filter written against the old shape "matches nothing against
// the new shape, silently yielding no cell ids at all".
//
// `?? signal` rather than a version check: the nested shape is what 0.21+
// sends, and falling back to the argument itself keeps a flat signal working
// if anything ever hands one over. The guard below is what decides ownership,
// and it must stay — without it this function claims every signal on the
// interface, including other zomes' and the host's.
export function parseCoordinatorSignal(signal: any): CoordinatorSignal | null {
  const inner = signal?.value ?? signal;
  if (inner?.zome_name !== COORDINATOR_ZOME) return null;

  // `payload` is 0.21's name for it; `data` was the old one.
  const payload = inner.payload ?? inner.data;
  if (!payload || typeof payload !== 'object') return null;

  // NewMew/NewClaim are struct variants carrying entry_hash alongside the
  // entry itself (see SignalPayload in the coordinator zome) — a bare
  // Mew/Claim has no hash field of its own.
  if (payload.NewMew) {
    return { kind: 'NewMew', mew: payload.NewMew.mew, entryHash: payload.NewMew.entry_hash };
  }
  if (payload.NewClaim) {
    return { kind: 'NewClaim', claim: payload.NewClaim.claim, entryHash: payload.NewClaim.entry_hash };
  }
  // NewCritique, NewRetraction, NewBridgeRecord and MetabolicTick are real
  // variants this bridge does not mirror. Returning null for them is a
  // decision, not an oversight: the tick in particular fires every 60s with
  // nothing to tweet.
  return null;
}

// A HASH REACHES THIS MODULE AS 39 RAW BYTES, NOT AS A STRING, and the
// interpolation that used to happen here put those bytes in the tweet.
//
// Both `callZome` results and signal payloads deserialize a Holochain hash to
// a `Uint8Array`/`Buffer`, so `${entryHash}` yields the bytes decoded as
// text — measured here as `Full context: �!$�0���7...`
// rather than a hash. That mattered in BOTH directions and only one of them
// was visible:
//
//   - `record_twitter_mirror`'s `mew_hash` is FINE with the raw bytes —
//     msgpack carries them and the zome deserializes an `EntryHash`. So the
//     DHT half of the correlative witness has always been correct.
//   - The TWEET TEXT was not. The witness principle at the top of `index.ts`
//     rests on step 1, "the tweet references the DHT hash (in text or
//     metadata)" — and a reference nobody can read back is not one.
//
// This half of the defect is NOT the signal shape and was NOT masked by the
// polling fallback: the poll path formats the hash the same way, so every
// tweet the bridge has ever composed carried an unreadable pointer. It was
// found by driving real signal data through the real functions, which is the
// argument for this file existing.
export function formatDhtHash(hash: unknown): string {
  if (hash == null) return '';
  if (typeof hash === 'string') return hash;
  // base64url, unpadded — the encoding `encodeHashToBase64` produces and the
  // one `pollMentions`' `/u[A-Za-z0-9_-]{45,}/` regex is written against.
  // Done by hand rather than via the client's helper so this module stays
  // free of a `@holochain/client` import and can be driven without one.
  if (hash instanceof Uint8Array || Array.isArray(hash)) {
    return 'u' + Buffer.from(hash as Uint8Array).toString('base64url');
  }
  return String(hash);
}

/** The tweet for a Mew, and the excerpt it was built from (the caller needs
 *  the excerpt's length for `record_twitter_mirror`). */
export function buildMewTweet(mew: any, entryHash: unknown): { text: string; excerpt: string } {
  // Include the DHT hash in the tweet text so replies can reference it.
  // This is the witness link: the tweet carries a pointer to its DHT
  // origin, though Twitter itself remains unaware of what that means.
  const ref = formatDhtHash(entryHash);
  const hashRef = ref ? `\n\nDHT: ${ref}` : '';
  const excerpt = mew.content.substring(0, 200);
  return { text: `${excerpt}${hashRef}\n\n— via #EpistemicResonance`, excerpt };
}

/** The tweet for a Claim. Claims are richer than Mews: the tweet is a summary
 *  and the full dimensional context stays on the DHT. */
export function buildClaimTweet(claim: any, entryHash: unknown): { text: string; excerpt: string } {
  const ref = formatDhtHash(entryHash);
  const hashRef = ref ? `\n\nFull context: ${ref}` : '';
  const excerpt = claim.content.substring(0, 200);
  return {
    text: `${excerpt}${hashRef}\n\nDomain: ${claim.domain} — via #EpistemicResonance`,
    excerpt,
  };
}

// THE REVERSE LEG LOOKED FOR A FORMAT NOTHING HERE EVER WROTE, which is the
// same defect as the one above seen from the other end.
//
// `pollMentions` matched `/0x[a-fA-F0-9]{64}/` — a 32-byte Ethereum-shaped
// hex string. A Holochain hash is 39 bytes and base64url in every encoding
// this project uses, so that pattern could not match a reference the bridge
// itself had written, in base64 OR in raw bytes. It then passed the match on
// as a STRING, where `ImportTwitterReplyInput.linked_holochain_claim` is an
// `EntryHash` — so even a hand-typed match would have been refused by the
// zome, into the `catch` that logs "Poll mentions failed" and continues.
//
// Both halves of the binding now come from this module, so the format the
// bridge writes and the format it reads cannot drift apart again without a
// red in `scripts/live-verify/bridge-signal.mjs` section 4. That check — the
// written reference matched by the reading pattern, decoded back to the bytes
// the signal carried — is the one worth keeping: nothing had ever compared
// the two sides, because they were four hundred lines apart and neither was
// reachable from a test.
//
// 45 is a floor rather than the exact length (a 39-byte hash is 52 base64url
// characters) so the pattern keeps matching if a future hash type is shorter,
// and `decodeDhtHashRef` is what decides whether a match is really a hash.
export const DHT_HASH_REF = /u[A-Za-z0-9_-]{45,}/;

/** The inverse of `formatDhtHash`: a matched reference back to the bytes a
 *  zome call needs. Returns null for anything that does not decode to a
 *  plausible hash, so a reply quoting something else cannot drive a call. */
export function decodeDhtHashRef(ref: string): Uint8Array | null {
  if (typeof ref !== 'string' || !ref.startsWith('u')) return null;
  try {
    const bytes = Buffer.from(ref.slice(1), 'base64url');
    // Every Holochain hash is 39 bytes: a 3-byte multihash prefix, 32 bytes
    // of digest, 4 bytes of DHT location. A decode that lands on any other
    // length is not one, and base64 decoding is forgiving enough that the
    // length is the real check.
    if (bytes.length !== 39) return null;
    return new Uint8Array(bytes);
  } catch {
    return null;
  }
}
