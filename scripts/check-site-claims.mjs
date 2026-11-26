#!/usr/bin/env node
// ============================================================================
// scripts/check-site-claims.mjs — docs/open-work.md row 7.39, public arm.
//
// EVERY COUNTED CLAIM ON THE PUBLIC PAGE, AGAINST THE THING THAT DETERMINES IT.
//
// WHY THIS EXISTS. `site/index.html` is the most outward-facing document in
// this repository — it is served at
// <https://stateofintent.github.io/epistemic-happ/> to anyone, with no login —
// and until this file existed **nothing re-measured a single number on it.**
// `check-prose-claims.mjs` reads an explicit six-document `FILES` list and the
// page was not in it; `check-outbound-claims.mjs` takes a named draft and is
// hand-run by design. So the one document strangers read was the one document
// no gate could see. That is row 7.39's hazard with a URL on it.
//
// WHY IT MAY BE IN CI WHEN `check-outbound-claims.mjs` MUST NOT BE. That file
// refuses CI for a stated reason: its inputs live in `docs/funding/`, which is
// in `.git/info/exclude`, so a CI job would grep an absent directory, find
// nothing and go green — the vacuous green this repository refuses. **That
// argument does not reach here, because `site/index.html` is tracked.** A
// runner that checks the repository out has the page. The one way this could
// still go vacuously green is the page being renamed or the figure grid
// rewritten, so both are asserted below and both exit 2 rather than 0.
//
// ---------------------------------------------------------------------------
// WHAT IT READS, AND WHY IT IS THE RENDERED TEXT RATHER THAN A DATA ATTRIBUTE
// ---------------------------------------------------------------------------
//
// The obvious build is `data-claim="integrity-lines" data-measured="4016"` on
// each cell, and it was rejected: an attribute and the visible number are two
// copies, and two copies drift — which is the entire subject of this file. So
// this reads **the digits a stranger actually sees**, out of the figure grid's
// own markup and out of the prose around it. There is one copy, and the gate
// reads it.
//
// ---------------------------------------------------------------------------
// WHY COMPARING AGAINST TOTALS IS SAFE HERE AND IS NOT SAFE IN README.md
// ---------------------------------------------------------------------------
//
// `check-prose-claims.mjs` measured the cost of adjudicating prose counts
// against totals and got **63 "stale" claims on prose that is entirely
// correct**, because "one harness does X" and "four harnesses cover Y" are
// contextual claims, not assertions about how many the suite holds. It
// therefore prints an inventory and exits zero.
//
// **The public page is a different corpus and that is a property of the page,
// not an optimism about it.** Its figures live in a block titled *"Counted, not
// estimated"* whose every cell is a total by construction, and the handful of
// repeats elsewhere restate the same totals. So the claims here CAN be
// adjudicated — and each one is adjudicated against a counter, never against
// another document. Local, contextual and rhetorical numbers on the page
// ("Five kinds of objection", "Nine layers", "ten thousand generated claims")
// are not in the table below and are not matched by anything in it; the ones
// that are countable but have no mechanical enumeration are named in
// UNCOVERED, so the gap is a statement rather than a silence.
//
// ---------------------------------------------------------------------------
// THE TIERS
// ---------------------------------------------------------------------------
//
// MEASURED (exits 1). A figure this repository determines. Read from the
// authority and never from another document: `callable` is parsed the way
// `check-spec-drift.mjs` parses it, because that is the gate which asserts set
// equality over SPEC §10 and it is therefore the authority on what a callable
// zome function is.
//
// LOWER BOUND (exits 1 only when the page claims MORE than exists). The merged
// pull request count only ever goes up, so a page saying 580 when 581 have
// merged is understating and is true; a page saying 600 is false. Red on
// overstatement only. Needs the network, so when the API is unreachable this
// reports CANNOT VERIFY and does not pass silently.
//
// CANNOT VERIFY (exits 2). The page is missing, the figure grid did not parse,
// or a claim below was not found on the page at all. **A claim this gate
// cannot locate is the failure mode it is least allowed**, because that is
// precisely how a check keeps passing after the thing it watched was reworded.
// Every MEASURED claim therefore asserts it matched at least once.
//
// ---------------------------------------------------------------------------
// WHAT THE FIRST RUN FOUND, which is why the comments above are not theory
// ---------------------------------------------------------------------------
//
// Three figures on the live public page were wrong, and two of the three are
// defects this repository has already found, fixed and written down elsewhere:
//
//   1. **77 live-conductor harnesses → 75.** `scripts/live-verify/` holds 77
//      `.mjs` files and two of them are shared modules, not harnesses.
//      `check-harness-counts.mjs:207` excludes exactly those two and measures
//      75, and `check-prose-claims.mjs`'s own header records making this same
//      mistake and correcting it: *"SHARED MODULES ARE NOT HARNESSES, and
//      counting them as such made this file measure 68 where
//      check-harness-counts measures 66 — two scripts in one repository
//      disagreeing about the artifact one of them ADJUDICATES."* The public
//      page was the third surface, and the only one a stranger reads.
//
//   2. **98 callable functions → 95.** `site/README.md` recorded the
//      instrument as `grep -c '#[hdk_extern]'`, and three of those 98 matches
//      are the string `#[hdk_extern]` written inside COMMENTS, at
//      coordinator lines 5667, 7533 and 8438. A fourth and fifth are
//      `#[hdk_extern(infallible)]` — `metabolic_tick`, which the host
//      schedules and no caller can call — which a looser pattern picks up for
//      100. The callable surface is 95. This is the `.check()` defect in a new
//      place: `check-prose-claims.mjs` records fixing a counter that matched
//      Playwright's `.check()` after a dot, and records measuring the
//      comment-match worry in `scripts/live-verify` and finding it
//      **unrealised there** — it is realised here.
//
//   3. **"15 — run on every change" → 11.** `scripts/check-*.mjs` holds 15
//      files, which is what was counted, but four of them are hand-run and are
//      in no workflow: `check-load-bearing`, `check-outbound-claims`,
//      `check-prose-claims` and `check-stale-blockers`. The number was right
//      and the verb was false. A page that says "run on every change" is
//      claiming enforcement, so enforcement is what gets counted here.
//
// The figure that prompted the audit had already been corrected once: the
// source draft said **21 document and spec gates**, which is
// `ls scripts/*.mjs | wc -l` — every top-level script, including a spike, a
// generator, a coverage reporter, a history reader, a corpus measurement and
// `ci-scope.mjs`, none of which gate anything. Correcting 21 to 15 moved the
// claim onto the right set of files and left it on the wrong verb, and nothing
// in the repository could see either version. That is this file's whole
// argument for existing.
//
// ---------------------------------------------------------------------------
// THIS GATE COUNTS ITSELF, AND THAT IS INTENDED
// ---------------------------------------------------------------------------
//
// `enforcedGates()` counts the gates wired into a workflow, and this file is
// one of them. So adding or removing a gate changes the figure the page must
// state, and the page goes red until it is updated. That is the correct
// direction: the alternative is a hand-maintained exclusion for this file,
// which is a stated number inside the tool that exists to find stated numbers.
// ============================================================================

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const PAGE = 'site/index.html';

// --------------------------------------------------------------- the counters
// Each MEASURES. A counter that is itself a hand-written number would put this
// file in the class of defect it exists to catch.

const integrity = () => read('dna/integrity/src/lib.rs');
const coordinator = () => read('dna/coordinator/src/lib.rs');
const lines = (s) => s.split('\n').length - 1;

const protocolVersion = () => {
  const m = integrity().match(/PROTOCOL_VERSION[^=\n]*=\s*(\d+)/);
  if (!m) throw new Error('dna/integrity/src/lib.rs declares no PROTOCOL_VERSION');
  return Number(m[1]);
};

const enumBody = (src, name) => {
  const m = src.match(new RegExp(`pub enum ${name}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!m) throw new Error(`dna/integrity/src/lib.rs has no \`pub enum ${name}\``);
  return m[1];
};
const entryTypes = () => (enumBody(integrity(), 'EntryTypes').match(/^\s+[A-Z][A-Za-z]*\(/gm) || []).length;
const linkTypes = () => (enumBody(integrity(), 'LinkTypes').match(/^\s+[A-Z][A-Za-z]*,/gm) || []).length;

// PARSED THE WAY `check-spec-drift.mjs:198` PARSES IT, deliberately and by
// copy. That script asserts set equality between these names and SPEC §10, so
// it is the authority on what counts as a callable zome function, and a second
// expression here that merely looked right is how three scripts came to report
// 95, 98 and 100 for one artifact. The agreement is asserted in main() rather
// than assumed, the way `check-prose-claims.mjs` asserts SHARED_MODULES
// against its source.
const CALLABLE_RE = /#\[hdk_extern\][^\n]*\n(?:\s*(?:\/\/[^\n]*|#\[[^\]]*\])\n)*\s*pub fn\s+([a-z_0-9]+)/g;
const callableNames = () => [...coordinator().matchAll(CALLABLE_RE)].map((m) => m[1]);
const callable = () => callableNames().length;

// SHARED MODULES ARE NOT HARNESSES. Duplicated from
// `check-harness-counts.mjs:207` rather than imported, because that script
// does not export it — and checked against it in main(), because a copy that
// drifts is what put 77 on the public page.
const SHARED_MODULES = new Set(['chromium.mjs', 'declared-wait.mjs']);
const harnessFiles = () =>
  readdirSync(join(ROOT, 'scripts/live-verify'))
    .filter((f) => f.endsWith('.mjs') && !SHARED_MODULES.has(f));
const harnesses = () => harnessFiles().length;
const harnessLines = () =>
  harnessFiles().reduce((n, f) => n + lines(read(`scripts/live-verify/${f}`)), 0);

// THE GATES, AND THE DISTINCTION THE PAGE'S VERB TURNS ON. `gateFiles()` is
// how many exist; `enforcedGates()` is how many a workflow runs. The page
// claims the second and counted the first.
const gateFiles = () => readdirSync(join(ROOT, 'scripts')).filter((f) => /^check-.*\.mjs$/.test(f));
const workflowText = () =>
  readdirSync(join(ROOT, '.github/workflows'))
    .filter((f) => f.endsWith('.yml'))
    .map((f) => read(`.github/workflows/${f}`))
    .join('\n');
const enforcedGates = () => {
  const wf = workflowText();
  return gateFiles().filter((f) => wf.includes(`scripts/${f}`));
};
const handRunGates = () => {
  const run = new Set(enforcedGates());
  return gateFiles().filter((f) => !run.has(f));
};

// Needs the network. Never a hard failure on unreachability — that is the
// CANNOT VERIFY tier, and a silent pass here would be the vacuous green.
const mergedPRs = () => {
  const out = execFileSync('gh', [
    'api', '-X', 'GET', 'search/issues',
    '-f', 'q=repo:StateofIntent/epistemic-happ is:pr is:merged',
    '--jq', '.total_count',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 });
  const n = Number(out.trim());
  if (!Number.isFinite(n) || n <= 0) throw new Error(`unreadable total_count: ${out.trim()}`);
  return n;
};

// ----------------------------------------------------------------- the claims
// `grid` is the <dt> label in the "Counted, not estimated" block, or null for a
// figure that appears only in prose. `sweep` finds every OTHER statement of the
// same figure on the page; each pattern must capture the number in group 1.
// A claim that matches nowhere is CANNOT VERIFY, never a pass.
const CLAIMS = [
  {
    id: 'protocol-version',
    what: 'protocol version',
    grid: 'Protocol version',
    sweep: [/protocol\s+v(\d+)\b/i, /protocol version\s+(\d+)\b/i],
    measure: protocolVersion,
    authority: 'PROTOCOL_VERSION in dna/integrity/src/lib.rs',
  },
  {
    id: 'integrity-lines',
    what: 'integrity zome lines',
    grid: 'Integrity zome',
    sweep: [/([\d,]+)\s+lines of it/i],
    measure: () => lines(integrity()),
    authority: 'wc -l dna/integrity/src/lib.rs',
  },
  {
    id: 'entry-types',
    what: 'entry types',
    grid: null,
    sweep: [/([\d,]+)\s+entry types/i],
    measure: entryTypes,
    authority: 'the EntryTypes enum in dna/integrity/src/lib.rs',
  },
  {
    id: 'link-types',
    what: 'link types',
    grid: null,
    sweep: [/([\d,]+)\s+link types/i, /typed links,\s+([\d,]+)\s+kinds/i],
    measure: linkTypes,
    authority: 'the LinkTypes enum in dna/integrity/src/lib.rs',
  },
  {
    id: 'coordinator-lines',
    what: 'coordinator zome lines',
    grid: 'Coordinator zome',
    sweep: [],
    measure: () => lines(coordinator()),
    authority: 'wc -l dna/coordinator/src/lib.rs',
  },
  {
    id: 'callable',
    what: 'callable zome functions',
    grid: null,
    sweep: [/([\d,]+)\s+callable functions/i],
    measure: callable,
    authority: "#[hdk_extern] pub fn in the coordinator, parsed as check-spec-drift.mjs parses it",
  },
  {
    id: 'harnesses',
    what: 'verification harnesses',
    grid: 'Verification harness',
    sweep: [/([\d,]+)<\/b>\s+live-conductor harnesses/i, /([\d,]+)\s+live-conductor harnesses/i],
    measure: harnesses,
    authority: 'scripts/live-verify/*.mjs less the two shared modules',
  },
  {
    id: 'harness-lines',
    what: 'verification harness lines',
    grid: null,
    sweep: [/([\d,]+)\s+lines<\/small>/i],
    measure: harnessLines,
    authority: 'wc -l over the harnesses, less the two shared modules',
  },
  {
    id: 'gates',
    what: 'document & spec gates run on every change',
    grid: 'Document &amp; spec gates',
    sweep: [],
    measure: () => enforcedGates().length,
    authority: 'scripts/check-*.mjs referenced by a file in .github/workflows/',
  },
  {
    id: 'merged-prs',
    what: 'merged pull requests',
    grid: 'Merged pull requests',
    sweep: [/([\d,]+)<\/b>\s+merged PRs/i, /([\d,]+)\s+merged pull requests/i],
    measure: mergedPRs,
    lowerBound: true,
    network: true,
    authority: 'the GitHub search API',
  },
];

// Countable things the page states that this gate does NOT adjudicate, named so
// the gap is a statement rather than a silence. Each is a candidate.
const UNCOVERED = [
  ['18 self-declared timestamps',
   'the figure is an audit result (row 8.6), counting timestamp FIELDS across entry structs. `check-time-units.mjs` declares seven field NAMES and their units, which is a different denominator; a counter would have to enumerate struct fields by type and nothing does'],
  ['nine layers, first seven exist',
   'the layer model is prose in the funding draft and has no enumeration in the tree, so a counter would read a document rather than the thing'],
  ['a cap of 20 per window',
   'a protocol constant and genuinely gated — but it is a VALUE, not a count of artifacts, and lives in the integrity zome. Worth adding as a value assertion rather than a cardinal'],
  ['26 recorded corrections, seven interlocutors',
   'figures about an EXTERNAL document (the ECM review appendix) that this repository does not hold and must not restate as its own measurement'],
  ['two pilot operators',
   'a fact about the world, not about the tree. It is the one figure on the page that no script can ever check, and it is the one most likely to change'],
];

// --------------------------------------------------------------------- output
let hard = 0;
let cannot = 0;
const num = (s) => Number(String(s).replace(/,/g, ''));
const fmt = (n) => n.toLocaleString('en-US');

const fail = (claim, msg, fix) => {
  hard++;
  console.error(`FAIL  ${claim.id.padEnd(18)} ${msg}`);
  console.error(`      authority: ${claim.authority}`);
  if (fix) console.error(`      ${fix}`);
};
// STRUCTURAL: the page moved, a label was reworded, a grid stopped parsing.
// Exits 2, because a claim this gate cannot locate is how a check keeps passing
// after the thing it watched was renamed.
const unverifiable = (id, msg) => {
  cannot++;
  console.error(`CANNOT VERIFY  ${String(id).padEnd(18)} ${msg}`);
};

// ENVIRONMENTAL: the tree is fine and the runner could not reach the network.
// Loud, and does NOT change the exit code — which is not a softening, it is the
// precedent `check-outbound-claims.mjs` already set for this exact situation:
// when the desktop repo is unreachable it pushes a NOTE reading *"This is NOT a
// pass — re-run with network, or check by hand"* rather than a finding, because
// a transient DNS failure is not evidence about the document. The structural
// tier above is what must never be softened, and it is not.
let noted = 0;
const note = (id, msg) => {
  noted++;
  console.error(`NOTE           ${String(id).padEnd(18)} ${msg}`);
};

/** Every `<div class="fig"><dt>LABEL</dt><dd>NUMBER<small>…` cell, by label. */
function parseGrid(html) {
  const cells = new Map();
  const re = /<dt>([\s\S]*?)<\/dt>\s*<dd>\s*([\d,]+)\s*<small>([\s\S]*?)<\/small>/g;
  for (const m of html.matchAll(re)) {
    cells.set(m[1].trim(), { stated: num(m[2]), small: m[3].trim(), raw: m[2] });
  }
  return cells;
}

function main() {
  if (!existsSync(join(ROOT, PAGE))) {
    unverifiable(PAGE, 'the public page is not at this path. It was renamed, moved or deleted — this gate cannot pass without reading it.');
    process.exit(2);
  }
  const html = read(PAGE);
  const grid = parseGrid(html);

  if (grid.size === 0) {
    unverifiable('figure grid',
      'no <dt>…</dt><dd>N<small>…</small> cell parsed out of the page. The markup of the "Counted, not estimated" block changed; this gate is reading nothing and must not report a pass.');
    process.exit(2);
  }

  // Two counters duplicated from the scripts that own them. A silent drift in
  // either is how the figure this file corrects reached the public page.
  try {
    const src = read('scripts/check-harness-counts.mjs');
    const block = src.match(/const SHARED_MODULES = new Set\(\[([\s\S]*?)\]\)/);
    const theirs = new Set([...(block?.[1] ?? '').matchAll(/'([^']+\.mjs)'/g)].map((m) => m[1]));
    const same = theirs.size === SHARED_MODULES.size && [...theirs].every((f) => SHARED_MODULES.has(f));
    if (!same) {
      unverifiable('shared-modules',
        `SHARED_MODULES has drifted from check-harness-counts.mjs — there: ${[...theirs].sort().join(', ') || '(none parsed)'}; here: ${[...SHARED_MODULES].sort().join(', ')}. Until they agree, the harness figure below is not the gate's figure.`);
    }
  } catch {
    unverifiable('shared-modules', 'could not read check-harness-counts.mjs to confirm the shared-module list.');
  }
  try {
    const theirs = read('scripts/check-spec-drift.mjs');
    if (!theirs.includes(CALLABLE_RE.source)) {
      unverifiable('callable-parser',
        'the #[hdk_extern] pattern here is no longer byte-identical to the one in check-spec-drift.mjs, which is the authority on the callable set. Two expressions for one artifact is how 95, 98 and 100 all got written down.');
    }
  } catch {
    unverifiable('callable-parser', 'could not read check-spec-drift.mjs to confirm the callable-function pattern.');
  }

  console.log(`${PAGE} — ${grid.size} figure cells, ${CLAIMS.length} adjudicated claims\n`);

  for (const claim of CLAIMS) {
    let measured;
    try {
      measured = claim.measure();
    } catch (e) {
      if (claim.network) {
        note(claim.id, `could not measure (${e.message.split('\n')[0]}). This is NOT a pass — the figure is unchecked on this run; re-run with network, or check by hand.`);
      } else {
        unverifiable(claim.id, e.message);
      }
      continue;
    }

    // Every place the page states this figure: the grid cell, then the sweep.
    const sites = [];
    if (claim.grid) {
      const cell = grid.get(claim.grid);
      if (!cell) {
        unverifiable(claim.id, `no figure cell labelled "${claim.grid}" on the page. The label was reworded, so this claim is no longer being read.`);
        continue;
      }
      sites.push({ where: `figure cell "${claim.grid}"`, stated: cell.stated });
      // The <small> under a cell carries further totals; sweep it too.
      for (const re of claim.sweep) {
        const m = cell.small.match(re);
        if (m) sites.push({ where: `"${claim.grid}" subtitle`, stated: num(m[1]) });
      }
    }
    for (const re of claim.sweep) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
      for (const m of html.matchAll(g)) {
        const line = html.slice(0, m.index).split('\n').length;
        sites.push({ where: `line ${line}`, stated: num(m[1]) });
      }
    }

    if (sites.length === 0) {
      unverifiable(claim.id,
        `measured ${fmt(measured)} but the page states this figure NOWHERE this gate can find. Either the claim was removed — in which case delete it here — or it was reworded and is now unwatched.`);
      continue;
    }

    const seen = new Set();
    let bad = 0;
    for (const s of sites) {
      const key = `${s.where}:${s.stated}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (claim.lowerBound) {
        if (s.stated > measured) {
          bad++;
          fail(claim, `${s.where} claims ${fmt(s.stated)} ${claim.what}; ${fmt(measured)} exist. A lower-bound figure may understate and may not overstate.`);
        }
      } else if (s.stated !== measured) {
        bad++;
        fail(claim, `${s.where} says ${fmt(s.stated)} ${claim.what}; measured ${fmt(measured)}.`,
          `fix the page, not this gate, unless the counter is wrong — and if it is, fix it where the artifact's own gate measures it.`);
      }
    }
    if (bad === 0) {
      const how = claim.lowerBound ? `≥ stated, measured ${fmt(measured)}` : `= ${fmt(measured)}`;
      console.log(`  ok  ${claim.id.padEnd(18)} ${how.padEnd(26)} ${seen.size} site(s) on the page`);
    }
  }

  console.log('\nenforcement, which is what the gates figure claims:');
  console.log(`  ${enforcedGates().length} of ${gateFiles().length} check-*.mjs are referenced by a workflow`);
  console.log(`  hand-run: ${handRunGates().join(', ')}`);

  console.log('\ncountable on the page and NOT adjudicated here, by design:');
  for (const [what, why] of UNCOVERED) console.log(`  ${what}\n      ${why}`);

  if (noted > 0) {
    console.error(`\n${noted} claim(s) could not be measured on this run for an environmental reason.`);
    console.error('They are UNCHECKED, not passed. The exit code below does not count them.');
  }
  if (cannot > 0 && hard === 0) {
    console.error(`\n${cannot} claim(s) CANNOT BE VERIFIED and none failed. That is not a pass: exiting 2.`);
    process.exit(2);
  }
  if (hard > 0) {
    console.error(`\n${hard} counted claim(s) on the public page do not match what this repository measures${cannot ? `, and ${cannot} could not be verified` : ''}.`);
    console.error('This page is served to strangers at https://stateofintent.github.io/epistemic-happ/.');
    process.exit(1);
  }
  if (noted > 0) {
    // NOT "NO DRIFT". Saying every claim matches while one of them was never
    // measured is the overclaim this whole file exists to catch, and it would
    // be this file making it.
    console.log(`\nNO DRIFT among the ${CLAIMS.length - noted} claims measured on this run. ${noted} was not measured and is unchecked.`);
    return;
  }
  console.log('\nNO DRIFT: every counted claim on the public page matches the thing that determines it.');
}

main();
