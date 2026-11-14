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

// SHARED MODULES ARE NOT HARNESSES, and counting them as such made this file
// measure 68 where `check-harness-counts.mjs` measures 66 — two scripts in one
// repository disagreeing about the artifact one of them ADJUDICATES. Found
// 2026-11-08 while fixing `gatedBy`: the gate's own `harnessNames()` excludes
// these (`check-harness-counts.mjs:139`) and this file excluded nothing, so the
// truth it compared prose against was inflated by two. The list is duplicated
// rather than imported because that script does not export it; if it grows
// there and not here, this count silently re-inflates — which is why the
// disagreement is now asserted below rather than left to be rediscovered.
//
// 1.21's `injection-coverage.mjs` set the precedent in the same words:
// seven files with no `check()` are excluded as helpers rather than counted,
// "because overstating the target set is the one direction this measurement
// must not err".
const SHARED_MODULES = new Set(['chromium.mjs', 'declared-wait.mjs']);

const harnessFiles = () =>
  readdirSync(join(ROOT, 'scripts/live-verify'))
    .filter((f) => f.endsWith('.mjs') && !SHARED_MODULES.has(f));

const countHarnesses = () => harnessFiles().length;

const countChromiumImporters = () =>
  harnessFiles().filter((f) => read(`scripts/live-verify/${f}`).includes('CHROMIUM')).length;

const countHdkExterns = () =>
  (read('dna/coordinator/src/lib.rs').match(/#\[hdk_extern/g) || []).length;

// THIS ONE USED TO BE A HAND-WRITTEN PAIR OF NUMBERS IN THE TABLE BELOW, which
// is the defect this whole file exists to find — stated inside the output that
// names stated figures as the problem. It had gone stale by 23 and 36 within
// two days of being written. Measured now, by the same expression open-work
// 1.21 quotes, so the sentence cannot drift from the suite again.
//
// COUNTS CALL SITES, NOT EXECUTIONS, and says so where it prints: a check
// inside a loop runs more often than it is written. The word is not spelled
// out anywhere in prose in this repository for the reason 1.21 records — the
// expression matches its own name wherever it appears, comments included. THAT
// WORRY WAS MEASURED ON 2026-11-14 AND IS UNREALISED: zero of the matches in
// `scripts/live-verify` fall inside a comment, so the prophylaxis is working
// rather than merely stated.
//
// WHAT THE MEASURE DID GET WRONG, found the same day: `\b` MATCHES AFTER A
// DOT, so Playwright's `.check()` — which ticks a checkbox and asserts nothing
// — was counted as an assertion. Two of them, in `notes-ui.mjs` and
// `trust-lenses.mjs`. The figure was 1,763 and is 1,761. Two is not a
// headline; it is fixed because this file's whole subject is a number that
// does not mean what it says, and because the injection ledger's denominator
// is the same count arrived at independently — three measures that disagree by
// two are the second-place-a-number-is-written defect in the tool built to
// catch it.
const countCheckSites = (dir) => {
  const re = /(?<![.\w$])check\(/g;
  let n = 0;
  const walk = (rel) => {
    for (const e of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name === 'node_modules') continue;
        walk(`${rel}/${e.name}`);
      } else if (e.name.endsWith('.mjs')) {
        n += (read(`${rel}/${e.name}`).match(re) || []).length;
      }
    }
  };
  walk(dir);
  return n;
};

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
  ['check() calls',    `already gated per harness by check-harness-counts.mjs; the SUITE total (${countCheckSites('scripts/live-verify')} call sites in live-verify, ${countCheckSites('scripts')} across scripts/ — MEASURED here, not stated, because this line itself had gone stale by 23 and 36) is given in prose and is a real extension candidate`],
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

// A SUBSET MARKER BEFORE THE NUMBER WAS INVISIBLE, which is open-work 1.20's
// own bug class inside 1.20's own tool. The `qualified` test below only ever
// looked at the words BETWEEN the number and the noun, so `N more harnesses`
// was caught and **`the other 43 harnesses`** was not — the marker sits in
// front of the number, where the regex never captured. Found 2026-11-08 by
// trying to execute this row's publish-as-`Claim`s half: of 36 claims the tool
// called gated-and-unqualified, **not one had `stated == measured`**, because
// they were local statements wearing a total counter's label.
const SUBSET_BEFORE = /\b(other|others|another|further|more|remaining|rest|these|those|same|first|last|next|each|every|only|just|all but|of the|among|one of)\s+(?:[a-z][a-z-]*\s+){0,2}$/i;

// `gatedBy` IS NOW READ FROM WHAT THE GATING SCRIPT ACTUALLY MATCHES, not
// guessed from the prose. The old behaviour attached a gate per ARTIFACT, so
// every harness claim carried `check-harness-counts.mjs` and local statements
// were reported as adjudicated — the exact failure this row calls worse than no
// detector, because it converts an unexamined claim into one somebody believes
// has been examined.
//
// A prose-totality heuristic was tried first and rejected the same hour: it
// matched *"every one of"* in `README:6113`, which quantifies over four
// harnesses just named rather than over the suite. **An ambiguous marker must
// not ship as truth** — this file already says so about open-work rows.
//
// What replaced it is exact. `check-harness-counts.mjs:275` gates ONE sentence,
// by this literal pattern, as its FOURTH index claim:
//
//     drive it — <WORD> of them, each proving one property
//
// AND THAT SENTENCE IS INVISIBLE TO THIS EXTRACTOR, which is the finding. It
// reads *"sixty-eight of them"* — an anaphor with no noun to match, the same
// shape as 1.19's *"nineteen of them"* that this row records the vocabulary
// mode missing and a model resolving. So the only adjudicated harness count in
// the repository is one this mode cannot see, and **every claim it CAN see is
// ungated.** `gated` is therefore 0, truthfully, and the publish-as-`Claim`s
// half has nothing to draw from this mode: it needs the model extractor.
const GATE_PATTERNS = {
  // key -> the regex the gating script itself matches, or null when the gate
  // adjudicates something that is not a prose count in FILES at all.
  // The sentence reads "66 of them" — a NUMERAL. A first version of this
  // pattern required a spelled-out word and matched NOTHING, which would have
  // reported the gate as absent when it is present and passing. Accepts both.
  harness: /drive it — [a-z0-9-]+ of them, each proving one property/i,
  // check-harness-counts gates ui.yml's own header, which is not in FILES.
  chromium: null,
  // check-spec-drift asserts SET EQUALITY over SPEC §10, not a counted claim.
  zomefn: null,
  linktype: null,
  entrytype: null,
};

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
    // Prefer the `<name>:agent` variant — see adversary-spike.mjs.
    const offered = (list.data || []).map((m) => m.id);
    model = process.env.YOAI_ALLOW_PERSONA === '1'
      ? offered.find((m) => !m.endsWith(':agent')) || offered[0]
      : offered.find((m) => m.endsWith(':agent')) || offered[0];
    if (!model) throw new Error(`${YOAI} offers no models — open Your Own AI and pick an offline-only AI.`);
  }
  const res = await fetch(`${YOAI}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Your-Own-AI-Record': 'off',
      // Agent mode, because `Memory: off` is honoured in AGENT MODE ONLY —
      // persona mode always injects the author's memories. MEASURED 2026-11-01:
      // this machine has no agentic model that fits, so this REFUSES rather than
      // falling back to the leak. See scripts/adversary-spike.mjs for the detail.
      ...(process.env.YOAI_ALLOW_PERSONA === '1' ? {} : { 'X-Your-Own-AI-Mode': 'agent' }),
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
          // Words between the number and the noun qualify it into a subset —
          // and so do words BEFORE it, which this missed until 2026-11-08.
          const between = m[0].replace(/\s+/g, ' ').split(' ').length > 1 + m[2].split(/\s+/).length;
          const before = SUBSET_BEFORE.test(line.slice(Math.max(0, m.index - 40), m.index));
          const qualified = between || before;
          // Adjudicated only if this very line is what the gating script
          // matches. Anything else is ungated, which over-reports the gap —
          // the direction this measurement must err in.
          const pat = GATE_PATTERNS[art.key];
          const gatedBy = art.gatedBy && pat && pat.test(line) ? art.gatedBy : null;
          found.push({
            file: f, line: i + 1, artifact: art.key, noun: m[2], stated, text: m[0],
            gatedBy, qualified,
            // Kept so the change is auditable rather than invisible: what the
            // old behaviour WOULD have said, beside what this one says.
            gate_available: art.gatedBy, subset_marker_before: before,
          });
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
    // REPORT PER-CLAIM GATING, NOT THE GATE THAT EXISTS. Printing `a.gatedBy`
    // here said "gated by check-harness-counts.mjs" beside 56 harness claims of
    // which only a total claim is actually adjudicated — the same over-claim
    // the per-claim field carried until 2026-11-08, surviving one layer up.
    const mine = claims.filter((c) => c.artifact === a.key);
    const gated = mine.filter((c) => c.gatedBy !== null).length;
    const avail = a.gatedBy ? a.gatedBy : 'no counter exists';
    console.log(`  ${a.key.padEnd(10)} measured ${String(a.count()).padStart(4)}   claims found ${String(mine.length).padStart(3)}   ${String(gated).padStart(3)} adjudicated   (${avail})`);
  }

  console.log(`\n${ungated.length} claim(s) are of a shape no existing gate covers.`);
  console.log(`${unadjudicated.length} of the ${claims.length} carry a qualifier, so they describe a SUBSET that no total counter can adjudicate.`);

  console.log('\nnot covered by this vocabulary, by design:');
  for (const [what, why] of UNCOVERED_BY_DESIGN) console.log(`  ${what.padEnd(16)} ${why}`);

  // THE DUPLICATED LIST IS CHECKED AGAINST ITS SOURCE, because a copy that
  // drifts re-inflates the truth this file compares prose against — and it did
  // exactly that until 2026-11-08. Reported rather than failed: this mode's
  // contract is that it exits zero, and `check-harness-counts.mjs` is the gate
  // that may go red.
  try {
    const src = read('scripts/check-harness-counts.mjs');
    const block = src.match(/const SHARED_MODULES = new Set\(\[([\s\S]*?)\]\)/);
    const theirs = new Set([...(block?.[1] ?? '').matchAll(/'([^']+\.mjs)'/g)].map((m) => m[1]));
    const mine = SHARED_MODULES;
    const same = theirs.size === mine.size && [...theirs].every((f) => mine.has(f));
    if (!same) {
      console.log('\nSHARED_MODULES HAS DRIFTED from check-harness-counts.mjs:');
      console.log(`  there: ${[...theirs].sort().join(', ') || '(none parsed)'}`);
      console.log(`  here:  ${[...mine].sort().join(', ')}`);
      console.log('  Until they agree, the harness total above is not the gate\'s total.');
    }
  } catch { /* the gate is the authority; a failed read here changes nothing */ }

  console.log('\nTHIS MODE ASSERTS NOTHING ABOUT STALENESS and always exits zero.');
  console.log('Comparing these claims against totals was measured and produced 63 false');
  console.log('reds on correct prose. Adjudication lives behind the model extractor, which');
  console.log('`node scripts/prose-claims-corpus.mjs --model` measures against four real');
  console.log('historical defects before it is allowed to be believed.');
}

// --json emits the per-claim records rather than the summary, so a consumer
// can act on individual claims — open-work 1.20's publish-as-`Claim`s half
// needs `gatedBy` and `qualified` per claim, which the summary flattens away.
// It is a SEPARATE mode and does not change what the gate reports or exits:
// this script's contract is that it asserts nothing about staleness and always
// exits zero, and adding an output format must not quietly alter that.
export function claims() {
  return scan().map((c) => ({ ...c, measured: measure(c.artifact) }));
}

function emitJson() {
  const rows = claims();
  console.log(JSON.stringify({
    generated_for: 'open-work 1.20',
    total: rows.length,
    gated_and_unqualified: rows.filter((c) => c.gatedBy !== null && !c.qualified).length,
    claims: rows,
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--json')) emitJson(); else main();
}
