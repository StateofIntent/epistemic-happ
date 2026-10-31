#!/usr/bin/env node
// ============================================================================
// scripts/check-prose-claims.mjs — docs/open-work.md item 1.20.
//
// WHEN THE PROSE SAYS THERE ARE N OF SOMETHING, ARE THERE?
//
// WHY THIS EXISTS. Counted claims in code are gated and caught in seconds;
// counted claims in PROSE rot silently, and this repository has paid for that
// four times in §1 alone:
//
//   1.11   "Eighteen link types are bound, not four"     — two counts wrong in
//                                                          opposite directions
//   1.15   SPEC §2.4 said past_cone had FOUR validation
//          rules and then listed five
//   1.17   app-level timestamps interpreted in two units, neither declared
//   1.19   README §6.6 said the suite held NINETEEN harnesses; it held 64 —
//          stale by a factor of three, two files from figures
//          `check-harness-counts.mjs` gates and catches instantly
//
// The version claim went stale in five places at once, and TWO of those lines
// carried a note saying they had already been corrected once — rotting a second
// time beside their own record of rotting.
//
// WHY THE EXISTING GATES DO NOT COVER IT. There are ten `check-*.mjs` scripts
// and each gates ONE hand-made family: `check-harness-counts` the per-harness
// check counts, `check-spec-drift` SPEC §10's function list, `check-time-units`
// the time fields, and so on. They are precise and they are enumerated by hand,
// which means **a claim of a shape nobody has written a gate for is ungated by
// default, and nothing says so.** This script is the inventory that says so.
//
// WHAT IT CHECKS, AND IT IS NARROWER THAN "EVERY NUMBER IN THE PROSE". Only a
// cardinal attached to a COUNTABLE ARTIFACT OF THIS REPOSITORY — harnesses,
// link types, entry types, zome functions, Chromium importers. For each such
// artifact the script carries a counter that measures the truth, so the output
// is not the weak form ("this claim is ungated") but the strong one: **says
// nineteen, has 66.**
//
// Numbers are matched as digits AND as English words, because every one of the
// four defects above was spelled out: *nineteen*, *Eighteen*, *twenty-three*.
// A detector that only read digits would have caught none of them.
//
// TWO EXTRACTORS, AND THE CORPUS DECIDED BETWEEN THEM RATHER THAN TASTE.
// The first build used the declared vocabulary below and nothing else, on the
// argument that its recall can be stated and audited while a model's cannot.
// **Measured against the corpus it scored 2 of 4**, and both misses were
// structural rather than tuning:
//
//   1.19  the prose said "nineteen of THEM" — an anaphor pointing at "scripts"
//         in the previous sentence. There is no noun to match. No regex over a
//         noun vocabulary can resolve that, and sharpening the pattern cannot
//         help.
//   1.15  "four validation rules" — the vocabulary has no counter because
//         validation rules exist only as prose, so even perfect extraction has
//         nothing to compare against.
//
// Put against those two exact cases, a local 3B model through Your Own AI's
// endpoint resolved BOTH — including the anaphor, returning count 19 against
// artifact "live-verify suite scripts". So extraction is the half a model is
// genuinely better at, and the vocabulary is the half it must not be trusted
// with: in the same reply it labelled "nineteen of them" `is_total: true` when
// nineteen is a SUBSET of the sixty-six. That is the same failure shape 6.10
// measured — the objection text is good and the label on it is not.
//
// **So the split is: the model may EXTRACT, and only a counter may ADJUDICATE.**
// A model's count is never compared against another model's count, and
// `is_total` is read as a hint for a human rather than as a fact. The
// vocabulary's limit remains KNOWN AND NAMED: see UNCOVERED_BY_DESIGN.
//
// THE VOCABULARY MODE DOES NOT ASSERT STALENESS, AND THAT IS A MEASUREMENT
// RATHER THAN A CAUTION. Comparing every extracted claim against the total was
// tried and produced **63 "stale" claims on prose that is entirely correct** —
// because "one harness does X" and "four harnesses cover Y" are contextual
// claims, not assertions about how many the suite holds. A gate with 63 false
// reds is not a weak gate, it is a broken one, and it would have been trusted
// for exactly one morning. So this mode prints an INVENTORY and exits zero. The
// only path that adjudicates is the model extractor, and the only reason it is
// allowed to is that `prose-claims-corpus.mjs` measures it against four real
// historical defects and it scores 4 of 4 surfaced, 3 of 4 proven.
//
// A QUALIFIER MEANS A SUBSET, AND A TOTAL COUNTER DOES NOT ADJUDICATE SUBSETS.
// The first live run flagged forty claims, and most were partitive — "three
// BOUND link types", "four link types [that remain unconditional]" — measured
// against the 31 link types that exist. Comparing a subset claim to a total is
// not a finding, it is noise, and noise is how this becomes the unread output
// 1.21 warns about. So a claim whose number does not sit DIRECTLY against the
// noun is extracted and reported as unadjudicated rather than compared. The
// cost is real and is stated rather than hidden: "Eighteen link types are
// bound" is itself a subset claim that this rule would NOT adjudicate, and it
// is 1.11. The vocabulary catches it only because the qualifier trails the noun
// instead of preceding it, which is luck rather than design — and precisely why
// the model extractor is the one that meets the ship condition.
//
// WHAT IT CANNOT DO. It cannot see a claim about something it has no counter
// for, it cannot read a limit-claim that carries no number ("the only", "never
// more than"), and it cannot tell a live claim from a quoted historical one by
// meaning — that last is handled by HISTORICAL markers and the EXEMPT table
// below, both of which are conservative: they suppress, so an error there is a
// MISS, which is the failure mode this script is least allowed. Every entry in
// EXEMPT therefore carries a reason.
// ============================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// --------------------------------------------------------------- the counters
// Each must MEASURE, never be stated. A counter that is itself a hand-written
// number would put this script in the class of defect it exists to catch.

const countHarnesses = () =>
  readdirSync(join(ROOT, 'scripts/live-verify')).filter((f) => f.endsWith('.mjs')).length;

const countChromiumImporters = () =>
  readdirSync(join(ROOT, 'scripts/live-verify'))
    .filter((f) => f.endsWith('.mjs'))
    .filter((f) => read(`scripts/live-verify/${f}`).includes('CHROMIUM')).length;

const countHdkExterns = () =>
  (read('dna/coordinator/src/lib.rs').match(/#\[hdk_extern/g) || []).length;

const enumBody = (src, name) => {
  const m = src.match(new RegExp(`pub enum ${name}\\s*\\{([\\s\\S]*?)\\n\\}`));
  return m ? m[1] : '';
};
const countLinkTypes = () =>
  (enumBody(read('dna/integrity/src/lib.rs'), 'LinkTypes').match(/^\s+[A-Z][A-Za-z]*,/gm) || []).length;
const countEntryTypes = () =>
  (enumBody(read('dna/integrity/src/lib.rs'), 'EntryTypes').match(/^\s+[A-Z][A-Za-z]*\(/gm) || []).length;

// --------------------------------------------------------------- the vocabulary
// `gatedBy` names the script that already gates claims of this shape. `null`
// means NOTHING gates it — which is the whole output of this file.
const ARTIFACTS = [
  { key: 'harness',   nouns: ['harnesses', 'harness'],              count: countHarnesses,        gatedBy: 'check-harness-counts.mjs (suite total only)' },
  { key: 'chromium',  nouns: ['browser harnesses'],                 count: countChromiumImporters, gatedBy: 'check-harness-counts.mjs (CHROMIUM importers)' },
  { key: 'linktype',  nouns: ['link types', 'link type'],           count: countLinkTypes,        gatedBy: null },
  { key: 'entrytype', nouns: ['entry types', 'entry type'],         count: countEntryTypes,       gatedBy: null },
  { key: 'zomefn',    nouns: ['zome functions', 'zome function'],   count: countHdkExterns,       gatedBy: 'check-spec-drift.mjs (SPEC §10 set equality)' },
];

// Artifacts this vocabulary deliberately does NOT cover, named so the gap is a
// statement rather than a silence. Each is a candidate for the next extension.
const UNCOVERED_BY_DESIGN = [
  ['open-work rows',   'two defensible counters disagree (82 vs 83) because one row embeds a literal "|" inside a grep pattern; a counter that is ambiguous must not ship as truth'],
  ['validation rules', 'no mechanical enumeration exists — SPEC states them in prose, which is precisely 1.15 and needs its own parser'],
  ['check() calls',    'already gated per harness by check-harness-counts.mjs; the SUITE total (1,353 in live-verify, 1,389 across scripts/) is stated in prose and is a real extension candidate'],
  ['packages',         'gated by check-packages.mjs and published-packages'],
  ['time fields',      'gated by check-time-units.mjs — this is 1.17, and it is closed'],
];

const WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};
const TENS = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ONES = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const NUMBER_RE = `(?:\\d{1,4}|${TENS.map((t) => ONES.map((o) => `${t}-${o}`).join('|')).join('|')}|${Object.keys(WORDS).join('|')})`;

function toNumber(tok) {
  const t = tok.toLowerCase().replace(/,/g, '');
  if (/^\d+$/.test(t)) return Number(t);
  if (WORDS[t] !== undefined) return WORDS[t];
  const [a, b] = t.split('-');
  if (WORDS[a] !== undefined && WORDS[b] !== undefined) return WORDS[a] + WORDS[b];
  return null;
}

// A line that is RECORDING a past wrong claim must not be read as making it.
// Conservative by construction: these suppress, and a wrong suppression is a
// miss. Kept narrow and literal for that reason.
const HISTORICAL = /\b(said|says|used to|claimed|stated|asserted|was wrong|were wrong|stale|rotted|CORRECTED|corrected|instead of|rather than|not four|~~)\b/;

// file + substring → reason. Suppresses one specific claim, never a pattern.
const EXEMPT = [
  ['scripts/check-prose-claims.mjs', 'ALL', 'this file quotes all four historical defects in its own header'],
];

const FILES = ['README.md', 'SPEC.md', 'READINESS.md', 'SECURITY.md', 'docs/open-work.md', 'scripts/live-verify/README.md'];

// ------------------------------------------------------- the model extractor
// Optional, local-only, and OFF by default. It reads prose and writes nothing;
// no entry, no attribution, nothing permanent — 1.20 is advisory by
// construction. The endpoint is Your Own AI's documented one; the two headers
// keep an unpublished draft out of the person's records and memories, and the
// call is routed by the chosen AI's own mode, so an OFFLINE-ONLY AI is what
// makes this local. See docs.yourownai.net/external-apps/connect.
const YOAI = process.env.YOAI_BASE || 'http://localhost:11435/v1';

const EXTRACT_SYSTEM = `You extract COUNTED CLAIMS about a software repository's own artifacts from its documentation.
A counted claim states how many of something the repository has: harnesses, scripts, link types, entry types, validation rules, functions.
Resolve pronouns: "nineteen of them" is a counted claim when "them" refers to a countable artifact.
Return JSON only: {"claims":[{"quote":"...","artifact":"...","count":N,"is_total":true|false}]}`;

export async function extractWithModel(text, model = process.env.YOAI_MODEL) {
  if (!model) {
    const list = await fetch(`${YOAI}/models`).then((r) => r.json());
    model = (list.data || [])[0]?.id;
    if (!model) throw new Error(`${YOAI} offers no models — open Your Own AI and pick an offline-only AI.`);
  }
  const res = await fetch(`${YOAI}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Your-Own-AI-Record': 'off',
      'X-Your-Own-AI-Memory': 'off',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: EXTRACT_SYSTEM }, { role: 'user', content: text }],
      max_tokens: 600,
    }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    if (res.status === 503 || /routing_failed/.test(detail)) {
      throw new Error(`${YOAI} could not route to "${model}": ${detail}\nPick an AI set to offline-only and download a model for it.`);
    }
    throw new Error(`${YOAI} returned ${res.status}: ${detail}`);
  }
  const body = await res.json();
  const raw = body.choices?.[0]?.message?.content ?? '';
  // Scan every top-level JSON value rather than one span: a 3B model answering
  // in prose around its JSON is the measured case, not the exception.
  for (const m of raw.matchAll(/\{[\s\S]*\}/g)) {
    try {
      const parsed = JSON.parse(m[0]);
      if (Array.isArray(parsed.claims)) return parsed.claims;
    } catch { /* keep scanning */ }
  }
  return [];
}

// Map a model-named artifact onto a vocabulary key, so adjudication stays with
// the counters. Unmapped is NOT an error — it is the honest "nothing gates
// this" answer, which is 1.20's actual output.
export function artifactKeyFor(name = '') {
  const n = name.toLowerCase();
  if (/harness|live-verify|script/.test(n) && !/browser|chromium/.test(n)) return 'harness';
  if (/browser|chromium/.test(n)) return 'chromium';
  if (/link type/.test(n)) return 'linktype';
  if (/entry type/.test(n)) return 'entrytype';
  if (/zome function|hdk_extern|extern/.test(n)) return 'zomefn';
  return null;
}

// ------------------------------------------------------------------- the scan
export function scan(files = FILES, { source } = {}) {
  const found = [];
  for (const f of files) {
    if (EXEMPT.some(([file, what]) => file === f && what === 'ALL')) continue;
    let text;
    try { text = source ? source(f) : read(f); } catch { continue; }
    const lines = text.split('\n');
    for (const art of ARTIFACTS) {
      const nounAlt = art.nouns.map((n) => n.replace(/ /g, '\\s+')).join('|');
      const re = new RegExp(`\\b(${NUMBER_RE})\\s+(?:[a-z][a-z-]*\\s+){0,2}(${nounAlt})\\b`, 'gi');
      lines.forEach((line, i) => {
        for (const m of line.matchAll(re)) {
          const stated = toNumber(m[1]);
          if (stated === null) continue;
          const window = line.slice(Math.max(0, m.index - 120), m.index + m[0].length + 120);
          if (HISTORICAL.test(window)) continue;
          // Words between the number and the noun qualify it into a subset.
          const qualified = m[0].replace(/\s+/g, ' ').split(' ').length > 1 + m[2].split(/\s+/).length;
          found.push({ file: f, line: i + 1, artifact: art.key, noun: m[2], stated, text: m[0], gatedBy: art.gatedBy, qualified });
        }
      });
    }
  }
  return found;
}

export function measure(key) {
  const a = ARTIFACTS.find((x) => x.key === key);
  return a ? a.count() : null;
}

// ------------------------------------------------------------------- reporting
function main() {
  const claims = scan();
  const truth = Object.fromEntries(ARTIFACTS.map((a) => [a.key, a.count()]));

  const unadjudicated = claims.filter((c) => c.qualified);
  const ungated = claims.filter((c) => c.gatedBy === null);

  console.log(`prose counted claims about repository artifacts: ${claims.length} across ${FILES.length} documents\n`);
  for (const a of ARTIFACTS) {
    const n = claims.filter((c) => c.artifact === a.key).length;
    console.log(`  ${a.key.padEnd(10)} measured ${String(a.count()).padStart(4)}   claims found ${String(n).padStart(3)}   ${a.gatedBy ? 'gated by ' + a.gatedBy : 'GATED BY NOTHING'}`);
  }

  console.log(`\n${ungated.length} claim(s) are of a shape no existing gate covers.`);
  console.log(`${unadjudicated.length} of the ${claims.length} carry a qualifier, so they describe a SUBSET that no total counter can adjudicate.`);

  console.log('\nnot covered by this vocabulary, by design:');
  for (const [what, why] of UNCOVERED_BY_DESIGN) console.log(`  ${what.padEnd(16)} ${why}`);

  console.log('\nTHIS MODE ASSERTS NOTHING ABOUT STALENESS and always exits zero.');
  console.log('Comparing these claims against totals was measured and produced 63 false');
  console.log('reds on correct prose. Adjudication lives behind the model extractor, which');
  console.log('`node scripts/prose-claims-corpus.mjs --model` measures against four real');
  console.log('historical defects before it is allowed to be believed.');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
