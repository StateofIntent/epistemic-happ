#!/usr/bin/env node
// ============================================================================
// scripts/check-outbound-claims.mjs — docs/open-work.md row 7.39.
//
// THE CLAIMS IN A MESSAGE ABOUT TO BE SENT, AGAINST WHAT THIS REPO MEASURES.
//
// WHY THIS EXISTS. `docs/funding/` is in `.git/info/exclude`. It holds every
// outbound letter and every participant draft, and it is the ONE directory no
// gate in this repository can read — `check-stale-blockers.mjs`,
// `check-prose-claims.mjs` and every grep a PR author runs over tracked files
// are all blind to it. **The most outward-facing documents in the project are
// the only ones nothing checks.** Row 7.39 found that the hard way: #527
// corrected the Ricardian contract's attribution in `README.md` and the same
// error sat in four files there, and in `bridge/src/index.ts`.
//
// WHY IT IS HAND-RUN AND MUST NEVER GO IN CI. The files it reads are not in
// git. A CI job would grep an absent directory, find nothing, and go green —
// **the vacuous green this repository refuses**, and the same argument that
// keeps `band-plan-check.mjs` out of CI (a muted check is indistinguishable
// from a passing one). So this exits 2 / CANNOT VERIFY when it cannot see its
// inputs, and never 0.
//
// ---------------------------------------------------------------------------
// THE SAFETY PROPERTY, WHICH IS THE WHOLE REASON THIS IS NOT A BLOCKLIST SWEEP
// ---------------------------------------------------------------------------
//
// **A SENT RECORD IS EVIDENCE, NOT PROSE.** `docs/funding/` holds both drafts
// and the archive of what was actually sent, and they are the same shape on
// disk. On 2026-11-21 I swept the Ricardian correction across four of those
// files before noticing row 7.21 records them **SENT on 2026-10-27** — so the
// edit made the archive claim the letter said something it did not.
// `holo-ventures-approach.md`'s own header says it exists to record *"what was
// sent … so a reply can be answered against the record rather than against
// memory."* The remedy for an error already sent is a note, or a correction to
// the recipient. **Never an edit to the file that records it.**
//
// So this tool does NOT sweep the directory and does NOT infer sent-ness.
// **It checks the specific draft you name, on the turn you are about to send
// it** — the one moment when "is this claim still true?" is both answerable
// and actionable, and when the file is unsent by construction because you
// chose it. Status inference is the failure mode; the caller supplies the fact.
//
// `--list` inventories the directory WITHOUT an extension filter, because the
// miss that started 7.39 was exactly an extension filter: a sweep restricted
// to `*.md`/`*.rs`/`*.ts` missed `holo-ventures-BODY.txt` and
// `holo-ventures-letter-PLAINTEXT.txt`, **the send-ready forms**, and the
// directory also holds `manifund-fields` with no extension at all. An
// extension filter is an instrument and that one was wrong in the direction of
// comfort.
//
// ---------------------------------------------------------------------------
// THE TIERS, AND WHY ONLY ONE OF THEM FAILS THE RUN
// ---------------------------------------------------------------------------
//
// MEASURED (hard, exits 1). A number in the draft against the thing in this
// repo that determines it. No judgement, no wordlist: `protocol_version` comes
// from the `PROTOCOL_VERSION` constant, and the release version from the
// desktop repo's published tags. **Read from the authority, never from another
// document** — while building this I grepped `protocol_version` out of
// `SPEC.md`, got `10` from a historical mention, and briefly believed the
// letters were wrong when `PROTOCOL_VERSION: u16 = 11` says they were right.
//
// RETRACTED (hard, exits 1, and deliberately tiny). Claims this repository has
// explicitly corrected, each carrying where. Every entry must cite the
// correction, so the registry is auditable rather than a pile of
// remembered grudges. Lines that are RECORDING a correction are suppressed —
// most matches in this corpus are records (*"Corrected from the earlier
// wording"*, *"What I had written down was that Granite must never…"*), which
// is why a naive blocklist over this directory is not a weak gate but a broken
// one, the same measurement `check-prose-claims.mjs` made when comparing every
// counted claim against a total produced 63 false reds on correct prose.
// **Suppression means an error here is a MISS**, which is the direction this
// file chooses when it must choose.
//
// STYLE (advisory, never fails the run). Row 7.38's rule, which is currently
// enforced by nothing but judgement — and whose own word count was stated
// wrong twice in four places before anybody counted. So it is counted here.
// It is advisory because prose quality is not mechanical; the count is.
//
// WHAT IT CANNOT DO. It cannot tell a live claim from a quoted one by meaning.
// It cannot know whether a draft was already sent — that is the caller's to
// know, and the reason the interface takes a path. It has no counter for any
// claim not listed below, and **a claim of a shape nobody has written a rule
// for is unchecked by default**, so `--list` prints the registry's size next
// to the corpus's so the ratio is visible rather than implied.
// ============================================================================

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const OUTBOUND_DIR = 'docs/funding';
const DESKTOP_REPO = 'StateofIntent/epistemic-resonance-desktop';

const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// --------------------------------------------------------------- the measures
// Each MEASURES its truth from the artifact that determines it. A measure that
// read another document would put this file in the class of defect it exists
// to catch.

/** `PROTOCOL_VERSION` as the integrity zome declares it — the only authority. */
function measuredProtocolVersion() {
  const m = read('dna/integrity/src/lib.rs').match(
    /pub const PROTOCOL_VERSION: *u16 *= *(\d+)/
  );
  if (!m) throw new Error('PROTOCOL_VERSION not found in dna/integrity/src/lib.rs');
  return Number(m[1]);
}

/** The newest published desktop release tag. Network; may be unavailable. */
function measuredLatestRelease() {
  const out = execFileSync(
    'gh',
    ['release', 'list', '--repo', DESKTOP_REPO, '--limit', '30', '--json', 'tagName'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  );
  const tags = JSON.parse(out)
    .map((r) => r.tagName)
    .filter((t) => /^v\d+\.\d+\.\d+$/.test(t));
  if (tags.length === 0) throw new Error('no semver release tags returned');
  return tags.sort(cmpVersion).at(-1);
}

const verKey = (v) => v.replace(/^v/, '').split('.').map(Number);
function cmpVersion(a, b) {
  const [x, y] = [verKey(a), verKey(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

// ------------------------------------------------------------ the retractions
// EVERY ENTRY CITES ITS CORRECTION. An entry without one is a grudge, not a
// finding, and must not ship: `assertRegistryIsAuditable` below refuses.

const RETRACTED = [
  {
    id: 'ricardian-author',
    // Narrow on purpose: the possessive is the error. "Mattereum (Vinay Gupta)"
    // for the physical-asset APPLICATION is correct and must not match.
    pattern: /Gupta['’]s Ricardian|Ricardian contracts?[^.]{0,40}\bGupta\b/i,
    says: "credits the Ricardian contract itself to Vinay Gupta",
    instead: "the concept is Ian Grigg's (1996, the Ricardo payment system); Mattereum/Gupta is the physical-asset application",
    correctedIn: 'PR #527; README.md §2.4 carries the split and the reason',
  },
  {
    id: 'settlement-minute',
    // Row 7.34: the figure the correction was written to withdraw, which the
    // reader lifted back out anyway. A range, never a single figure.
    pattern: /\b(a|one|1) minutes?\b[^.]{0,60}\b(settle|settles|settled|settlement|confident)\b|\b(settle|settlement|confident settlement)\b[^.]{0,60}\b(a|one|1) minutes?\b/i,
    says: "gives a single settlement figure of about a minute",
    instead: "7.34's remedy — a range and two outcomes, with no single figure a reader can lift out",
    correctedIn: 'row 7.34; §5 was revised specifically to stop saying "a minute", and §10 withdrew it after it came back',
  },
  {
    id: 'granite-prohibition',
    // Row 6.10, overturned by Eric Doriean's own measurement.
    pattern: /Granite[^.]{0,80}never be reported as a 4\s?GB|never be reported as a 4\s?GB[^.]{0,80}Granite/i,
    says: "repeats the prohibition that Granite must never be reported as a 4 GB option",
    instead: "that verdict is FALSE — he measured 8/8 tool choices on a 4 GB card and put the tag back in the 0.9.1 betas",
    correctedIn: 'row 6.10, overturned 2026-11-20 by the maintainer\'s own measurement',
  },
  {
    id: 'macos-update-too-broad',
    // Row 7.37: true of OUR build, false of Holochain desktop apps generally.
    pattern: /(macOS|mac)[^.]{0,60}can never auto-?update(?![^.]{0,40}\b(ours|our build|this build|our bundle)\b)/i,
    says: "says macOS can never auto-update without scoping it to THIS build",
    instead: "7.37 — true of our ad-hoc-signed Electron bundle, false in general; Flowsta self-updates on macOS because it is Tauri and has no Squirrel.Mac. Say *ours*",
    correctedIn: 'row 7.37, opened 2026-11-21 from reading Flowsta\'s repositories',
  },
];

// A line RECORDING a correction must not be read as making the claim. These
// SUPPRESS, so a wrong suppression is a MISS — the direction this file chooses
// deliberately, because a false red on a letter is how a check becomes unread.
const HISTORICAL =
  /\b(corrected|correction|was wrong|were wrong|had written|used to|earlier wording|withdrawn|withdraw|retract|no longer|turned out|I shouldn['’]t have|replied|he said|quoted|superseded|FALSE|stale)\b|^\s*>/i;

function assertRegistryIsAuditable() {
  if (RETRACTED.length === 0) {
    throw new Error('RETRACTED is empty: this check would be vacuous');
  }
  for (const r of RETRACTED) {
    if (!r.correctedIn || !r.instead) {
      throw new Error(`registry entry ${r.id} has no citation: a grudge, not a finding`);
    }
  }
}

// ------------------------------------------------------------------- the body
// A draft may be a whole file, or one numbered section of the drafts file. The
// message body is what is quoted with "> "; the notes above it are analysis and
// are deliberately NOT in the style count (row 7.38 rule 6: the analysis goes
// in the notes, a message to a person is not a row).

function extractSection(src, n) {
  const lines = src.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^##\\s+${n}\\.`).test(l));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

function messageBody(src) {
  const quoted = src
    .split('\n')
    .filter((l) => /^>\s?/.test(l))
    .map((l) => l.replace(/^>\s?/, ''));
  // A standalone letter has no quoting; a drafts section quotes its body.
  return quoted.length >= 3 ? quoted.join('\n') : src;
}

// THE METHOD IS DECLARED BECAUSE TWO HONEST COUNTERS DISAGREED AND BOTH WERE
// IN THE REPO. Row 7.38's figures (§11 "377", §13 "334") counted every
// whitespace-separated token, which includes standalone punctuation — the
// em-dashes this project uses as bullets. By that method §11 is 377 and §13 is
// 334; counting only tokens containing a letter or digit they are 371 and 329.
// **A bare "—" is not a word**, so this is the method, and it is stated rather
// than assumed: an undeclared counting method is how "count it, do not
// estimate it" still produced four wrong figures. The RATIO those figures were
// cited for survives either way (§13 is 11% shorter than §11 on both counts),
// which is why this corrected the record without changing any conclusion.
const WORD_METHOD =
  'tokens containing a letter or digit, code spans stripped (a bare em-dash is not a word)';
const wordCount = (s) =>
  s.replace(/`[^`]*`/g, ' ').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;

// ------------------------------------------------------------------ the run

function checkText(label, full, body) {
  const findings = [];
  const notes = [];

  // --- MEASURED: protocol_version
  const pv = measuredProtocolVersion();
  for (const m of full.matchAll(/protocol_version[`"']?:? *`?(\d+)/gi)) {
    if (Number(m[1]) !== pv) {
      findings.push({
        tier: 'MEASURED',
        id: 'protocol-version',
        what: `says protocol_version ${m[1]}, the integrity zome declares ${pv}`,
        fix: `dna/integrity/src/lib.rs declares PROTOCOL_VERSION = ${pv}`,
      });
    }
  }

  // --- MEASURED: release version
  const vs = [...new Set([...full.matchAll(/\bv(\d+\.\d+\.\d+)\b/g)].map((m) => `v${m[1]}`))];
  if (vs.length > 0) {
    let latest;
    try {
      latest = measuredLatestRelease();
    } catch {
      notes.push(
        'CANNOT VERIFY the release version: the desktop repo was unreachable. ' +
          'This is NOT a pass — re-run with network, or check by hand.'
      );
    }
    if (latest) {
      const highest = vs.sort(cmpVersion).at(-1);
      if (cmpVersion(highest, latest) < 0) {
        findings.push({
          tier: 'MEASURED',
          id: 'release-version',
          what: `the newest version it mentions is ${highest}; ${latest} is published`,
          fix:
            `a draft whose highest version is behind the published tag describes a world ` +
            `that no longer exists. If this is a RECORD of something already sent, it is ` +
            `correct as it stands and must NOT be edited — do not run this on sent mail.`,
        });
      }
    }
  }

  // --- RETRACTED
  for (const r of RETRACTED) {
    full.split('\n').forEach((line, i) => {
      if (!r.pattern.test(line)) return;
      if (HISTORICAL.test(line)) {
        notes.push(`line ${i + 1}: matched ${r.id} but reads as a record — suppressed`);
        return;
      }
      findings.push({
        tier: 'RETRACTED',
        id: r.id,
        what: `line ${i + 1} ${r.says}`,
        fix: `${r.instead}  [${r.correctedIn}]`,
      });
    });
  }

  // --- STYLE (advisory): row 7.38
  const words = wordCount(body);
  const bold = (body.match(/\*\*/g) || []).length / 2;
  const style = [];
  style.push(`${words} words — method: ${WORD_METHOD}`);
  if (words > 371) style.push(`LONGER than §11 (371), the message a reader could not read`);
  else style.push(`benchmarks: §13 = 329, §11 = 371, §9 = 250`);
  if (bold >= 1) style.push(`${Math.round(bold)} bold span(s) — rule 3 says no bold in a message body`);

  return { findings, notes, style, words };
}

// ------------------------------------------------------------------ interface

function listCorpus() {
  const dir = join(ROOT, OUTBOUND_DIR);
  if (!existsSync(dir)) return null;
  // NO EXTENSION FILTER. That filter is what started row 7.39.
  return readdirSync(dir)
    .map((n) => ({ name: n, size: statSync(join(dir, n)).size }))
    .filter((f) => statSync(join(dir, f.name)).isFile());
}

function selfTest() {
  assertRegistryIsAuditable();
  const cases = [
    ['ricardian-author', "influenced by Vinay Gupta's Ricardian contracts."],
    ['settlement-minute', 'about a minute to confident settlement in practice.'],
    ['granite-prohibition', 'Granite must never be reported as a 4GB option at all.'],
    ['macos-update-too-broad', 'the macOS build can never auto-update, full stop.'],
  ];
  let bad = 0;
  for (const [id, text] of cases) {
    const r = RETRACTED.find((x) => x.id === id);
    const fires = r.pattern.test(text);
    const notSuppressed = !HISTORICAL.test(text);
    const ok = fires && notSuppressed;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${id} fires on its own example`);
    if (!ok) bad++;
  }
  // The suppressor must actually suppress a record.
  const rec = "Corrected from the earlier wording: Vinay Gupta's Ricardian contracts.";
  const sup = HISTORICAL.test(rec);
  console.log(`  ${sup ? 'PASS' : 'FAIL'}: a line recording a correction is suppressed`);
  if (!sup) bad++;
  // The measures must return something, from the authority.
  try {
    const pv = measuredProtocolVersion();
    console.log(`  PASS: PROTOCOL_VERSION measured from the zome = ${pv}`);
  } catch (e) {
    console.log(`  FAIL: ${e.message}`);
    bad++;
  }
  return bad;
}

function main() {
  const argv = process.argv.slice(2);
  assertRegistryIsAuditable();

  if (argv.includes('--self-test')) {
    console.log('check-outbound-claims --self-test — can every rule fire?\n');
    const bad = selfTest();
    console.log(bad === 0 ? '\nall rules can fire.' : `\n${bad} RULE(S) CANNOT FIRE`);
    process.exit(bad === 0 ? 0 : 1);
  }

  if (argv.includes('--list') || argv.length === 0) {
    const corpus = listCorpus();
    if (!corpus) {
      console.log(`CANNOT VERIFY: ${OUTBOUND_DIR} does not exist here.`);
      console.log('That directory is gitignored, so a clone or a CI runner has none of it.');
      console.log('This is exit 2, not a pass: there is nothing to check, which is not the');
      console.log('same as nothing being wrong.');
      process.exit(2);
    }
    console.log(`${OUTBOUND_DIR} — ${corpus.length} file(s), no extension filter:\n`);
    for (const f of corpus) {
      const ext = f.name.includes('.') ? f.name.split('.').pop() : '(none)';
      console.log(`  ${String(f.size).padStart(7)}  ${f.name.padEnd(52)} ext=${ext}`);
    }
    console.log(`\n${RETRACTED.length} retraction(s) in the registry, 2 measured claims.`);
    console.log('A claim of a shape nobody has written a rule for is UNCHECKED by default.');
    console.log('\nUsage: check-outbound-claims.mjs <file> [--section N]');
    console.log('Run it on a draft you are ABOUT TO SEND. Never on sent mail: a sent record');
    console.log('is evidence, and its claims are correct as of the day it went out.');
    process.exit(argv.includes('--list') ? 0 : 2);
  }

  const secIdx = argv.indexOf('--section');
  const section = secIdx !== -1 ? argv[secIdx + 1] : null;
  // `i !== secIdx + 1` was the first version and it COULD NOT FAIL: with no
  // --section, secIdx is -1, so secIdx + 1 is 0 and the FILE ARGUMENT itself
  // was filtered out — `files` came back empty, the loop never ran, and the
  // script printed "no findings" and exited 0 on every input. Caught within
  // minutes by deliberately feeding it a draft that must go red, which is this
  // repository's own rule (`affordance-surfacing.mjs` passed on its first run
  // and proved nothing until the feature was disabled). The guard below is why
  // an empty file list is now CANNOT VERIFY rather than success.
  const skip = secIdx === -1 ? -1 : secIdx + 1;
  const files = argv.filter((a, i) => !a.startsWith('--') && i !== skip);
  if (files.length === 0) {
    console.log('CANNOT VERIFY: no file named. Nothing was checked, which is not');
    console.log('the same as nothing being wrong.');
    process.exit(2);
  }

  let failed = 0;
  for (const f of files) {
    const path = existsSync(join(ROOT, f)) ? join(ROOT, f) : f;
    if (!existsSync(path)) {
      console.log(`CANNOT VERIFY: ${f} not found.`);
      process.exit(2);
    }
    let src = readFileSync(path, 'utf8');
    if (section) {
      const s = extractSection(src, section);
      if (!s) {
        console.log(`CANNOT VERIFY: no section "## ${section}." in ${f}`);
        process.exit(2);
      }
      src = s;
    }
    const body = messageBody(src);
    const { findings, notes, style } = checkText(f, src, body);

    console.log(`\n=== ${f}${section ? ` §${section}` : ''} ===`);
    console.log(
      '  (If this is already SENT, stop: its claims were true the day it went out.\n' +
        '   A sent record is evidence. Correct the recipient, never the file.)'
    );
    console.log('  STYLE (advisory, row 7.38):');
    for (const s of style) console.log(`    ${s}`);
    if (notes.length) {
      console.log('  NOTES:');
      for (const n of notes) console.log(`    ${n}`);
    }
    if (findings.length === 0) {
      console.log('  no MEASURED or RETRACTED finding.');
    } else {
      console.log('  FINDINGS:');
      for (const x of findings) {
        console.log(`    ${x.tier} [${x.id}] ${x.what}`);
        console.log(`      → ${x.fix}`);
      }
      failed += findings.length;
    }
  }

  console.log(
    failed === 0
      ? '\nno findings. The registry is small; this is not a certificate.'
      : `\n${failed} FINDING(S).`
  );
  process.exit(failed === 0 ? 0 : 1);
}

main();
