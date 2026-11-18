#!/usr/bin/env node
// ROW 6.23 — exercises `src/key-mnemonic.ts`'s own rules in 24 checks. That
// file imports
// NOTHING, which is what makes this runnable with no browser and no conductor,
// the same reason `applet-prototype-check.mjs` can drive `applet.ts`.
// Transpile and run:
//
//   npx esbuild src/key-mnemonic.ts --format=esm --outfile=<tmp>/key-mnemonic.mjs \
//     && node key-mnemonic-check.mjs <tmp>/key-mnemonic.mjs
//
// WHY THE WORDLISTS ARE GATED HERE AND NOT IN A BROWSER HARNESS. The live
// harnesses re-implement `short()` by TRANSCRIPTION — `HASH_TAG_CHARS = 4`
// appears in four of them — and that is fine for a four-character slice. A
// 512-word table is not: it is exactly the kind of copy that drifts silently,
// and the drift would be invisible because both copies would look plausible.
// So there is ONE copy, this check imports it, and `reading-a-thread.mjs`
// asserts what a SCREEN can be asked without holding the lists at all.
//
// WHAT THIS CAN AND CANNOT SEE. It sees the function and the tables: that a
// mnemonic is derived from the bytes it claims to be derived from, that the
// lists are the frozen shape the module's header promises, and that no entry
// reads as a person's name. It cannot see a byline — whether this reaches a
// reader is `reading-a-thread.mjs` §1b's job, and neither check substitutes
// for the other.
//
// THE CHECK WORTH COPYING IS THE NAME BLOCKLIST, because it is the one that
// would have failed the obvious first draft. A wordlist for "two words derived
// from a key" reaches for colours and nature words, and a great many of those
// are given names — amber, ruby, jade, hazel, iris, rose, olive, sage, fern,
// ivy, reed, brook, rowan, clay, flint, ash, river, wren, robin, dawn, willow,
// laurel. The row's closing constraint is that a mnemonic "must not be allowed
// to read as one", and a constraint stated only in prose is a constraint
// nothing enforces.

let fails = 0;
const check = (label, ok) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${label}`); if (!ok) fails++; };

const target = process.argv[2];
if (!target) {
  console.error('usage: key-mnemonic-check.mjs <transpiled key-mnemonic.mjs>');
  process.exit(2);
}
const mod = await import(target);

const { MNEMONIC_ADJECTIVES: ADJ, MNEMONIC_NOUNS: NOUN, MNEMONIC_TAG_BYTES: TAG, keyMnemonic } = mod;

/** A plausible AgentPubKey: 39 bytes — 3-byte multihash tag, 32-byte ed25519
 *  public key, 4-byte DHT location. The tag is the REAL one (`0x84 0x20 0x24`,
 *  which is what base64s to `hCAk`) so that a check reading past it is reading
 *  past the same thing the app skips. */
const keyWith = (a, b, fill = 0x7f) => {
  const u8 = new Uint8Array(39);
  u8[0] = 0x84; u8[1] = 0x20; u8[2] = 0x24;
  u8[TAG] = a; u8[TAG + 1] = b;
  for (let i = TAG + 2; i < 39; i++) u8[i] = fill;
  return u8;
};

console.log('\n--- the lists are the frozen shape the header promises ---');
// 256 is not a preference. One byte indexes one word, so the range of a byte
// IS the length of the list, and that is what makes the derivation free of
// modulo bias. A list of any other length would need masking or a modulo, and
// a modulo over 256 values would make some words commoner than others.
check(`exactly 256 adjectives (${ADJ.length}), which is one byte's whole range`,
  ADJ.length === 256);
check(`exactly 256 nouns (${NOUN.length}), likewise`, NOUN.length === 256);
check('the adjectives are all distinct, so no two indices render the same word',
  new Set(ADJ).size === ADJ.length);
check('the nouns are all distinct, likewise', new Set(NOUN).size === NOUN.length);
// Not pedantry: "folded-folded" would read as a stutter rather than a pair,
// and a word appearing in both lists would make the two halves confusable.
check('no word appears in both lists',
  ADJ.every((w) => !NOUN.includes(w)));
check('every entry is lowercase letters only, so nothing reads as a proper noun',
  [...ADJ, ...NOUN].every((w) => /^[a-z]+$/.test(w)));
check('and none is so short or so long that it is unreadable at a glance',
  [...ADJ, ...NOUN].every((w) => w.length >= 3 && w.length <= 12));

console.log('\n--- and none of them reads as a person (6.23\'s closing constraint) ---');
// THIS IS THE LIST THE FIRST DRAFT WOULD HAVE TRIPPED ON. Every one of these
// is both an ordinary English word of the kind these lists are made of AND a
// given name in common use, which is what makes them the trap: "amber-lantern"
// reads as somebody called Amber, and a mnemonic that reads as a name asserts
// an identity the key never vouched for — the exact defect 6.23 ruled a
// DISPLAY name out for.
const GIVEN_NAMES = [
  'amber', 'ruby', 'jade', 'hazel', 'iris', 'rose', 'olive', 'sage', 'basil',
  'fern', 'ivy', 'reed', 'brook', 'heath', 'rowan', 'linden', 'clay', 'flint',
  'ash', 'river', 'wren', 'robin', 'dawn', 'sky', 'star', 'summer', 'autumn',
  'pearl', 'opal', 'crystal', 'grace', 'hope', 'faith', 'joy', 'misty',
  'sunny', 'merry', 'holly', 'willow', 'laurel', 'juniper', 'aspen', 'birch',
  'cedar', 'jasmine', 'lily', 'daisy', 'poppy', 'violet', 'scarlet', 'ebony',
  'ivory', 'coral', 'raven', 'skye', 'glen', 'dale', 'cliff', 'forest',
  'hunter', 'mason', 'cooper', 'tanner', 'miller', 'baker', 'archer',
  'fletcher', 'smith', 'taylor', 'parker', 'carter', 'porter', 'sawyer',
  'wheeler', 'chandler', 'marshall', 'shepherd', 'gardner', 'fisher', 'walker',
];
const nameHits = [...ADJ, ...NOUN].filter((w) => GIVEN_NAMES.includes(w));
check(`no entry is one of the ${GIVEN_NAMES.length} common given names that an obvious `
  + `wordlist would have reached for (${nameHits.length} hits${nameHits.length ? ': ' + nameHits.join(',') : ''})`,
  nameHits.length === 0);
// The hyphen and the lowercase are what carry "this is a tag, not a name" to a
// reader who never reads the header above. Asserted on a real rendering.
check('a rendered mnemonic is two lowercase words joined by one hyphen',
  /^[a-z]+-[a-z]+$/.test(keyMnemonic(keyWith(0, 0))));

console.log('\n--- it is derived from the key, and from the bytes it says ---');
check('the mnemonic is the adjective at byte 3 and the noun at byte 4',
  keyMnemonic(keyWith(0, 0)) === `${ADJ[0]}-${NOUN[0]}`
  && keyMnemonic(keyWith(255, 255)) === `${ADJ[255]}-${NOUN[255]}`
  && keyMnemonic(keyWith(7, 200)) === `${ADJ[7]}-${NOUN[200]}`);
check('the same key always gives the same mnemonic',
  keyMnemonic(keyWith(42, 99)) === keyMnemonic(keyWith(42, 99)));
// THE TAG IS SKIPPED, AND THIS IS THE CHECK THAT PROVES IT RATHER THAN THE
// COMMENT THAT CLAIMS IT. Every agent key begins with the same three bytes, so
// a derivation that read from offset 0 would hand every agent in the network
// the SAME mnemonic — a byline that looks like an answer and is a constant.
// Here the tag bytes are varied and the mnemonic must not move.
const tagVaried = keyWith(42, 99);
tagVaried[0] = 0x00; tagVaried[1] = 0xff; tagVaried[2] = 0x01;
check('changing the multihash tag changes nothing, so the tag is genuinely skipped',
  keyMnemonic(tagVaried) === keyMnemonic(keyWith(42, 99)));
// And the converse: nothing BEYOND the two bytes may leak in, or two readers
// looking at the same shortened key would see different mnemonics beside it.
check('changing any later byte changes nothing either',
  keyMnemonic(keyWith(42, 99, 0x01)) === keyMnemonic(keyWith(42, 99, 0xfe)));
check('different keys differ: every one of the 256 adjectives is reachable',
  new Set(Array.from({ length: 256 }, (_, i) => keyMnemonic(keyWith(i, 0)))).size === 256);
check('and every one of the 256 nouns is reachable',
  new Set(Array.from({ length: 256 }, (_, i) => keyMnemonic(keyWith(0, i)))).size === 256);
// 65536 pairs is the whole claim the header makes about collisions, and it is
// worth asserting rather than reasoning about, because it is the number that
// says "the key is what disambiguates".
check('so the mnemonic space is exactly 65536 pairs, which is what makes it a digest '
  + 'and not an identity',
  ADJ.length * NOUN.length === 65536);
// EVERY PAIR, not a sample, and the reason is a defect this check watched
// happen. A list one entry short passes every derivation check above — both
// sides of "the adjective at byte 3" are then `undefined` and agree — and
// renders `undefined-lantern` to a reader. The length assertion catches that
// one cause; this catches the SYMPTOM whatever causes it, which is the half
// that survives somebody changing how the lists are built.
const everyPair = [];
for (let a = 0; a < 256; a++) for (let n = 0; n < 256; n++) everyPair.push(keyMnemonic(keyWith(a, n)));
check(`all ${everyPair.length} pairs render as two lowercase words, so no index can `
  + 'reach past a list and print "undefined" at a reader',
  everyPair.length === 65536 && everyPair.every((m) => /^[a-z]+-[a-z]+$/.test(m)));
check('and all 65536 are distinct, so the pair space is really the space',
  new Set(everyPair).size === 65536);

console.log('\n--- a value that cannot carry one gets null, not a guess ---');
// An AgentPubKey is always 39 bytes, so this is not a case that happens in the
// app — it is a caller passing something that is not an agent key. The point
// is that the failure is VISIBLE: `agentLabel` drops the mnemonic and shows
// the key alone, rather than rendering a confident mnemonic for bytes the
// function never read.
check('an empty value has no mnemonic', keyMnemonic(new Uint8Array(0)) === null);
check('and neither does one with a tag and nothing after it',
  keyMnemonic(new Uint8Array(TAG)) === null);
check('and neither does one a single byte short',
  keyMnemonic(new Uint8Array(TAG + 1)) === null);
check('the shortest value that CAN carry one does',
  typeof keyMnemonic(new Uint8Array(TAG + 2)) === 'string');
// The tag length is duplicated in `main.ts` as `HASH_TAG_CHARS` (4 base64
// characters for 3 bytes) because this file importing nothing is what makes it
// testable. Duplication is allowed; disagreement is not.
check(`the tag length agrees with main.ts's four base64 characters (${TAG} bytes)`,
  TAG === 3);

console.log('\n--- and this file\'s own stated count is not stale ---');
// ROW 6.23 FOUND FOUR STALE "N checks" NUMBERS IN AN UNGATED DOCUMENT, one of
// them wrong by more than a factor of two through four sessions that each ran
// the harness and read the figure. `scripts/check-harness-counts.mjs` gates
// those sentences — but only for `scripts/live-verify/*.mjs`, and this file is
// in `mobile-ui/` beside `applet-prototype-check.mjs`, so neither is covered.
//
// RATHER THAN EXTEND THAT GATE, THIS FILE GATES ITSELF, because the number and
// the checks are in one file and a fixed point is cheaper than a crawler. The
// count is declared ONCE, at the top of this block, and asserted against the
// check call sites in this file's own source — the same counting rule
// check-harness-counts uses. Adding a check without updating the figure reds
// here, which is the only way the figure stays true.
//
// AND THE COUNTING RULE HAS A TRAP THIS FILE WALKED INTO FIRST TRY: the regex
// matches a `check` followed by an open paren and a quote, so writing that
// token inside a COMMENT counts as a call site. The first run of this block
// reported 25 sites against 24 checks, and the defect was the sentence above
// quoting the pattern it describes. The figure was not the thing that was
// wrong, which is why the check prints both numbers rather than just failing.
//
// NOT THE EXECUTION COUNT, and the distinction is one that gate already
// documents: three live-verify harnesses run more checks than they have call
// sites because theirs sit in loops. Measured here: 24 call sites, 24 executed,
// equal because nothing in this file loops over `check`.
const STATED_CHECKS = 24;
const { readFileSync } = await import('node:fs');
const ownSource = readFileSync(new URL(import.meta.url), 'utf8');
const ownSites = [...ownSource.matchAll(/\bcheck\(\s*'(?:[^'\\]|\\.)*'/g)].length
  + [...ownSource.matchAll(/\bcheck\(\s*"(?:[^"\\]|\\.)*"/g)].length
  + [...ownSource.matchAll(/\bcheck\(\s*`(?:[^`\\]|\\.)*`/g)].length;
check(`this file states ${STATED_CHECKS} checks and has ${ownSites} call sites, so the `
  + 'figure quoted elsewhere cannot go stale without reddening here',
  ownSites === STATED_CHECKS);

console.log(`\n${fails === 0 ? 'the mnemonic is derived, frozen, and reads as nothing but itself'
  : fails + ' FAILED'}`);
process.exit(fails ? 1 : 0);
