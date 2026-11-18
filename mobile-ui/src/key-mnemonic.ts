/** ROW 6.23 — A TWO-WORD MNEMONIC FOR AN AGENT KEY, DERIVED AND NOTHING ELSE.
 *
 *  THE QUESTION THIS ANSWERS WAS ASKED THREE TIMES BY THE SAME PERSON. The
 *  pilot's first publisher, over three messages across five days: "If 5 people
 *  would enter, you wouldnt know if you're speaking to the same or others",
 *  then "People writing critiques, still unclear if it is one person or the
 *  same", then — in this row's own vocabulary — "it would make everything a
 *  lot clearer if someone has a nickname DERIVED FROM KEY. It is easier to see
 *  who is who."
 *
 *  TWO EARLIER ANSWERS WERE BUILT AND BOTH WERE CONFIRMED INSUFFICIENT BY THE
 *  PERSON WHO ASKED, which is why this exists and is worth reading before
 *  changing it. 6.18 added a byline — "it doesnt show who the other person is"
 *  was true and is fixed. 6.23's own same-author marker says "same author as
 *  an earlier critique" inside one panel, and they replied "It saying same
 *  author as an earlier critique = good" in the same breath as "this remains
 *  unclear" about one person versus several. The marker answers the question
 *  WITHIN a panel by a sentence; it cannot answer it ACROSS panels, or between
 *  two people neither of whom wrote the row above.
 *
 *  THE PROPERTY BEING BOUGHT IS *SAME-OR-DIFFERENT AT A GLANCE*, NOT *WHO*.
 *  Twelve base64 characters are distinct and are not distinguishable: a string
 *  a reader compares character by character or not at all. Two words are
 *  compared by looking at them.
 *
 *  WHAT THIS IS NOT, AND THE DISTINCTION IS THE WHOLE REASON IT IS ALLOWED.
 *  A DISPLAY NAME was ruled out by this row and permitted by 1.31, and the two
 *  look alike and are opposites. A host-supplied name is CHOSEN and CHANGEABLE,
 *  so a byline showing one asserts an identity the DHT cannot vouch for — a
 *  weaker claim that looks to a reader like a stronger one. A KEY-DERIVED
 *  mnemonic is the opposite case on every count: nobody can choose it, every
 *  client computes the same one from the same bytes, and IT ASSERTS NOTHING
 *  THE KEY DOES NOT ALREADY SAY. It is a rendering of the key, not a claim
 *  about its holder.
 *
 *  AND IT IS NOT A NAME, WHICH IS A CONSTRAINT ON THE WORDLISTS AND NOT ONLY
 *  ON THE PROSE. The row's closing line is "a two-word mnemonic is not a name,
 *  and must not be allowed to read as one" — so the lists below are an
 *  ADJECTIVE and a THING, joined by a hyphen and never capitalised, because
 *  "folded-lantern" cannot be mistaken for what somebody is called. The first
 *  draft of a wordlist like this reaches for colours and nature words, and a
 *  great many of those ARE given names — amber, ruby, jade, hazel, iris, rose,
 *  olive, sage, fern, ivy, reed, brook, rowan, clay, flint, ash, river, wren,
 *  robin, dawn, willow, laurel. Every one is excluded, and
 *  `key-mnemonic-check.mjs` asserts the exclusion against a blocklist rather
 *  than trusting this paragraph: that check would have failed the obvious
 *  first draft, which is the only reason it is worth having.
 *
 *  NO COLOUR AND NO IDENTICON, AND THAT IS THE DECISION RATHER THAN A
 *  DEFERRAL. The 2026-11-14 HOLD reasoned that a purely visual identity needs
 *  a text alternative for a screen reader and for a colour-blind reader, which
 *  this repository already holds as a standard — so the text would be doing
 *  the distinguishing work and the colour would be decoration on top of it.
 *  That is an argument for shipping the text alone.
 *
 *  THE LISTS ARE FROZEN. Each is exactly 256 entries and INDEX IS IDENTITY:
 *  reordering, inserting, deleting or respelling any entry changes the
 *  mnemonic every reader already associates with every key they have seen.
 *  They may not be edited, and appending is not possible — 256 is the whole
 *  range of one byte. A second client rendering these must carry these two
 *  lists in this order; that is what makes the mnemonic a property of the key
 *  rather than of the client.
 *
 *  IT COLLIDES, AND THE KEY IS WHAT DISAMBIGUATES. 256 x 256 is 65536 pairs,
 *  so two mnemonics are equal about one time in 65536 and, by the birthday
 *  bound, a population of ~300 agents is more likely than not to contain one
 *  collision somewhere. This is a 16-bit DIGEST of an identity, not an
 *  identity. The key is always rendered beside it (see `agentLabel`) and is
 *  what a critique is held to; the mnemonic says "probably not the same
 *  person" with certainty and "the same person" only probably. Nothing in the
 *  UI may order, count, rank or total by it.
 *
 *  WHY THESE PARTICULAR BYTES, AND THE PROPERTY IS A NICE ONE. The first three
 *  bytes of every Holochain hash are a multihash type tag and are constant
 *  across every agent key (`HASH_TAG_CHARS`, 6.23's mechanical half), so they
 *  are skipped. Bytes 3 and 4 are the first two bytes of the ed25519 public
 *  key and are uniformly distributed. One byte per word means no modulo and so
 *  no bias. AND THOSE ARE THE SAME BYTES THE SHORTENED KEY BEGINS WITH: base64
 *  character 4 is bit 24 is byte 3, so the twelve characters `short()` shows
 *  encode bytes 3 to 11. The mnemonic is therefore a rendering of the first
 *  two bytes the reader is already looking at, and the two halves of a byline
 *  cannot disagree about which agent they describe.
 *
 *  THIS FILE IMPORTS NOTHING, which is what lets `key-mnemonic-check.mjs`
 *  transpile and run it in node with no browser and no conductor — the same
 *  reason `applet.ts` imports nothing. The wordlists are the kind of thing a
 *  harness would otherwise TRANSCRIBE, and a transcribed 512-word table is a
 *  drift waiting to happen; there is one copy and both callers import it. */

/** The base64 length of a multihash type tag: three bytes, four characters.
 *  Duplicated from `main.ts` rather than imported, because this file importing
 *  nothing is what makes it testable in node. The two are asserted equal by
 *  `key-mnemonic-check.mjs`. */
export const MNEMONIC_TAG_BYTES = 3;

/** Index is identity. Do not reorder, respell, insert or delete. */
export const MNEMONIC_ADJECTIVES: readonly string[] = [
  'brisk', 'quiet', 'hollow', 'narrow', 'spiral', 'tilted', 'folded', 'rugged',
  'brittle', 'supple', 'vivid', 'murky', 'glossy', 'coarse', 'silken', 'nimble',
  'sturdy', 'lofty', 'humble', 'ancient', 'frozen', 'molten', 'arid', 'briny',
  'bitter', 'tangy', 'smoky', 'dusty', 'cloudy', 'starry', 'windy', 'foggy',
  'snowy', 'sunlit', 'moonlit', 'shaded', 'bright', 'faded', 'muted', 'stark',
  'plain', 'ornate', 'gilded', 'rusted', 'polished', 'chipped', 'dented', 'woven',
  'knotted', 'braided', 'tangled', 'looped', 'hinged', 'latched', 'sealed', 'shuttered',
  'hidden', 'buried', 'floating', 'sunken', 'drifting', 'anchored', 'tethered', 'loose',
  'tight', 'slack', 'taut', 'limber', 'stiff', 'springy', 'bouncy', 'steady',
  'wobbly', 'crooked', 'straight', 'curved', 'angled', 'rounded', 'pointed', 'blunt',
  'jagged', 'smooth', 'ridged', 'grooved', 'pitted', 'speckled', 'striped', 'mottled',
  'banded', 'dappled', 'flecked', 'veined', 'marbled', 'frosted', 'glazed', 'waxed',
  'oiled', 'salted', 'peppered', 'honeyed', 'candied', 'pickled', 'toasted', 'baked',
  'boiled', 'chilled', 'warmed', 'heated', 'cooled', 'thawed', 'dried', 'soaked',
  'rinsed', 'scrubbed', 'swept', 'raked', 'mown', 'pruned', 'trimmed', 'clipped',
  'shorn', 'shaggy', 'fuzzy', 'downy', 'bristly', 'prickly', 'thorny', 'spiny',
  'feathered', 'furred', 'scaled', 'shelled', 'horned', 'tusked', 'winged', 'finned',
  'hooved', 'clawed', 'webbed', 'beaked', 'antlered', 'whiskered', 'crested', 'plumed',
  'humming', 'buzzing', 'chirping', 'croaking', 'howling', 'yapping', 'purring', 'clicking',
  'creaking', 'groaning', 'rattling', 'clanging', 'chiming', 'ringing', 'tolling', 'drumming',
  'whistling', 'sighing', 'rustling', 'crackling', 'sizzling', 'bubbling', 'gurgling', 'trickling',
  'splashing', 'dripping', 'pouring', 'flooding', 'ebbing', 'surging', 'swirling', 'eddying',
  'spinning', 'whirling', 'rolling', 'tumbling', 'sliding', 'gliding', 'soaring', 'diving',
  'climbing', 'crawling', 'hopping', 'leaping', 'bounding', 'galloping', 'trotting', 'ambling',
  'wandering', 'roaming', 'circling', 'pacing', 'resting', 'dozing', 'waking', 'stirring',
  'blinking', 'squinting', 'peering', 'gazing', 'glancing', 'watching', 'listening', 'waiting',
  'patient', 'restless', 'eager', 'wary', 'bold', 'timid', 'calm', 'lively',
  'solemn', 'cheerful', 'wistful', 'dreamy', 'alert', 'drowsy', 'jolly', 'grumpy',
  'fickle', 'loyal', 'canny', 'clever', 'crafty', 'sly', 'earnest', 'candid',
  'frugal', 'lavish', 'tidy', 'cluttered', 'sparse', 'crowded', 'empty', 'brimming',
  'early', 'tardy', 'sudden', 'gradual', 'constant', 'fleeting', 'lasting', 'passing',
  'northern', 'southern', 'eastern', 'western', 'upland', 'lowland', 'inland', 'coastal',
];

/** Index is identity. Do not reorder, respell, insert or delete. */
export const MNEMONIC_NOUNS: readonly string[] = [
  'lantern', 'anvil', 'kettle', 'ledger', 'compass', 'bellows', 'trowel', 'chisel',
  'mallet', 'lathe', 'auger', 'pulley', 'winch', 'ratchet', 'caliper', 'plumbline',
  'inkwell', 'quill', 'satchel', 'canteen', 'lanyard', 'tinderbox', 'matchbook', 'candlestick',
  'doorknob', 'keyhole', 'hinge', 'latchkey', 'padlock', 'shutter', 'awning', 'gable',
  'chimney', 'hearth', 'mantel', 'rafter', 'gutter', 'cornice', 'lintel', 'threshold',
  'staircase', 'bannister', 'alcove', 'pantry', 'cellar', 'attic', 'corridor', 'courtyard',
  'cobblestone', 'flagstone', 'gravel', 'sandbar', 'mudflat', 'saltpan', 'quarry', 'ravine',
  'gully', 'canyon', 'plateau', 'foothill', 'hillock', 'ridgeline', 'saddleback', 'escarpment',
  'glacier', 'snowdrift', 'icicle', 'hailstone', 'raincloud', 'thunderhead', 'whirlwind', 'waterspout',
  'tidepool', 'lagoon', 'estuary', 'inlet', 'fjord', 'atoll', 'reef', 'shoal',
  'driftwood', 'seaweed', 'barnacle', 'limpet', 'scallop', 'cockle', 'urchin', 'anemone',
  'mackerel', 'herring', 'haddock', 'pilchard', 'whelk', 'periwinkle', 'mussel', 'oyster',
  'beehive', 'anthill', 'cobweb', 'chrysalis', 'tadpole', 'caterpillar', 'dragonfly', 'mayfly',
  'firefly', 'cricket', 'beetle', 'weevil', 'earwig', 'woodlouse', 'millipede', 'silkworm',
  'thistle', 'bramble', 'nettle', 'dandelion', 'clover', 'mistletoe', 'bindweed', 'cowslip',
  'foxglove', 'snapdragon', 'marigold', 'hollyhock', 'columbine', 'larkspur', 'cornflower', 'buttercup',
  'acorn', 'pinecone', 'chestnut', 'hazelnut', 'walnut', 'almond', 'pistachio', 'hickory',
  'sapling', 'treetop', 'deadwood', 'kindling', 'firewood', 'woodchip', 'sawdust', 'timber',
  'haystack', 'cornstalk', 'wheatsheaf', 'barleycorn', 'millstone', 'pitchfork', 'scarecrow', 'farmgate',
  'henhouse', 'duckpond', 'pigpen', 'sheepfold', 'cowbell', 'horseshoe', 'saddlebag', 'bridlepath',
  'wagonwheel', 'handcart', 'wheelbarrow', 'sledge', 'toboggan', 'rowboat', 'dinghy', 'schooner',
  'galleon', 'longboat', 'ferryboat', 'lighthouse', 'breakwater', 'jetty', 'pontoon', 'gangplank',
  'porthole', 'mainmast', 'rudder', 'keelson', 'ballast', 'mooring', 'buoy', 'lifering',
  'telescope', 'sextant', 'astrolabe', 'sundial', 'hourglass', 'metronome', 'barometer', 'thermometer',
  'abacus', 'sliderule', 'inkstand', 'blotter', 'bookmark', 'bookshelf', 'footstool', 'armchair',
  'hammock', 'bedroll', 'pillowcase', 'quilt', 'blanket', 'tablecloth', 'napkin', 'teapot',
  'saucer', 'tumbler', 'decanter', 'flagon', 'tankard', 'goblet', 'ladle', 'colander',
  'skillet', 'cauldron', 'stockpot', 'breadboard', 'rollingpin', 'whisk', 'grater', 'sieve',
  'birdcage', 'fishbowl', 'flowerpot', 'windowbox', 'wateringcan', 'birdbath', 'sundeck', 'weathervane',
  'windmill', 'watermill', 'waterwheel', 'aqueduct', 'cistern', 'standpipe', 'downspout', 'drainpipe',
  'footbridge', 'turnstile', 'stepladder', 'scaffold', 'handrail', 'signpost', 'milestone', 'waymarker',
  'knapsack', 'haversack', 'waterskin', 'powderhorn', 'snuffbox', 'pocketwatch', 'keyring', 'coinpurse',
];

/** The mnemonic for an agent key, or `null` if the bytes cannot carry one.
 *
 *  `null` RATHER THAN A FALLBACK, deliberately. An AgentPubKey is always 39
 *  bytes, so a value too short to index is not a case that happens — it is a
 *  caller passing something that is not an agent key. A fallback would render
 *  a confident mnemonic for a key the function never read, which is the shape
 *  of defect this repository has paid for twice; `agentLabel` omits the
 *  mnemonic instead and shows the key alone. */
export function keyMnemonic(bytes: Uint8Array): string | null {
  if (bytes.length < MNEMONIC_TAG_BYTES + 2) return null;
  const adjective = MNEMONIC_ADJECTIVES[bytes[MNEMONIC_TAG_BYTES]];
  const noun = MNEMONIC_NOUNS[bytes[MNEMONIC_TAG_BYTES + 1]];
  return `${adjective}-${noun}`;
}
