/** ROW 6.29 — ORDERING FOUNDED DOMAIN NAMES BY PROXIMITY TO WHAT WAS TYPED,
 *  AND NOTHING ELSE.
 *
 *  WHY THIS IS NOT A NEAR-MATCH MATCHER. The 2026-11-26 invariant sweep on
 *  row 6.29 found two constraints that are not matters of taste:
 *
 *    - Invariant 5 (every domain is a sovereign membrane) forbids BLOCKING on
 *      a name collision: a new founder's sovereignty cannot be subordinated to
 *      whoever founded first. Nothing here blocks; this returns strings.
 *    - Invariants 2 and 10 (the topology is the truth function, not an
 *      algorithm; the system does not compute truth) forbid asserting that two
 *      names ARE one domain. `get_claims_by_domain` hashes the raw string, so
 *      two spellings are two domains that cannot see each other — the protocol
 *      structurally cannot hold the identity such a warning would assert.
 *
 *  SO THE RULE THIS FILE IMPLEMENTS IS: STATE SIMILARITY, NEVER IDENTITY.
 *  There is **no distance threshold anywhere in this module.** The cap is on
 *  how many names are returned, never on how close they must be, which is what
 *  keeps this a search result rather than an accusation. A caller cannot ask
 *  "is this a duplicate" because this file cannot answer it.
 *
 *  AND THAT IS WHY IT HAS NO FALSE POSITIVES TO TUNE. A threshold would need a
 *  false-positive rate to justify it, and that rate is unmeasurable while the
 *  pilot has too few founded domains for two to collide by accident. An
 *  ordering has no rate: it asserts that these names exist and that this is
 *  how near they are, both of which are true by construction.
 *
 *  THIS FILE IMPORTS NOTHING, the same property `key-mnemonic.ts` has and for
 *  the same reason: `domain-proximity-check.mjs` transpiles and runs it in node
 *  with no browser and no conductor, so the ordering rules are gated in seconds
 *  rather than inside a browser harness that needs a live DHT. */

/** The fold `nearFoundedDomain` has always used, moved here so there is ONE
 *  copy: case and whitespace only. `main.ts` imports this rather than keeping
 *  its own, because two folds that drift would disagree about which names are
 *  already covered by the exact and near states. */
export function foldDomain(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Levenshtein distance over the FOLDED strings, so case and spacing cost
 *  nothing — a name differing only that way is already the form's `near`
 *  state and is excluded below rather than ranked.
 *
 *  Chosen because it is deterministic, dependency-free and explains itself to
 *  a reader: one edit is one step. It is used ONLY to order. No caller may
 *  compare it against a cutoff, and this module exposes none. */
export function domainDistance(a: string, b: string): number {
  const s = foldDomain(a);
  const t = foldDomain(b);
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  // Two rows rather than a full matrix: the inputs are domain names, but a
  // pasted paragraph in the box should not allocate a megabyte either.
  let prev = new Array<number>(t.length + 1);
  let curr = new Array<number>(t.length + 1);
  for (let j = 0; j <= t.length; j += 1) prev[j] = j;
  for (let i = 1; i <= s.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const swap = prev; prev = curr; curr = swap;
  }
  return prev[t.length];
}

/** The founded names nearest to what was typed, nearest first — at most
 *  `limit` of them, with NO minimum closeness.
 *
 *  EXCLUDES anything whose fold equals the typed fold, because those are the
 *  form's `exact` and `near` states and are stated there in full. This answers
 *  the question those two do not: what else is out there, spelled otherwise.
 *
 *  TIES BREAK ALPHABETICALLY, so the list is a function of the input set and
 *  not of the order the DHT happened to return it in — a harness can assert
 *  the output without controlling link order. */
export function closestFoundedDomains(
  typed: string,
  names: readonly string[],
  limit: number,
): string[] {
  const folded = foldDomain(typed);
  if (!folded || limit <= 0) return [];
  const seen = new Set<string>();
  const candidates: { name: string; distance: number }[] = [];
  for (const name of names) {
    const key = foldDomain(name);
    if (!key || key === folded || seen.has(key)) continue;
    seen.add(key);
    candidates.push({ name, distance: domainDistance(folded, key) });
  }
  candidates.sort((x, y) => (
    x.distance - y.distance || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0)
  ));
  return candidates.slice(0, limit).map((c) => c.name);
}
