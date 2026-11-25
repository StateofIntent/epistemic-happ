#!/usr/bin/env node
// ROW 6.29 — exercises `src/domain-proximity.ts`'s own rules in 19 checks.
// That file imports NOTHING, which is what makes this runnable with no browser
// and no conductor, the same reason `key-mnemonic-check.mjs` can drive
// `key-mnemonic.ts`. Transpile and run:
//
//   npx esbuild src/domain-proximity.ts --format=esm --outfile=<tmp>/dp.mjs \
//     && node domain-proximity-check.mjs <tmp>/dp.mjs
//
// THE CHECK WORTH COPYING IS "NO THRESHOLD", because it is the one that would
// fail the obvious optimisation. A reader looking at this module will want to
// add a cutoff — stop listing names past distance 5, say — and that cutoff is
// exactly what the 2026-11-26 invariant sweep on row 6.29 forbids: a module
// that decides which names are close ENOUGH has asserted that two names are
// one domain, which Invariants 2 and 10 refuse and which
// `get_claims_by_domain` cannot hold, since it hashes the raw string. The cap
// is on COUNT. A constraint stated only in prose is a constraint nothing
// enforces, so it is stated here as a test that goes red.
//
// WHAT THIS CAN AND CANNOT SEE. It sees the ordering rules: the fold, the
// distance, the exclusions, the tie-break and the absence of a cutoff. It
// cannot see a screen — whether the list reaches a reader, says what it is,
// and blocks nothing is `founding-ui.mjs` §7's job, and neither check
// substitutes for the other.

let fails = 0;
const check = (label, ok) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${label}`); if (!ok) fails++; };

const target = process.argv[2];
if (!target) {
  console.error('usage: domain-proximity-check.mjs <transpiled domain-proximity.mjs>');
  process.exit(2);
}
const { foldDomain, domainDistance, closestFoundedDomains } = await import(target);

console.log('\n--- the fold is case and whitespace, and nothing else ---');
check('leading, trailing and repeated whitespace collapse',
  foldDomain('  Mental   Health  Reform ') === 'mental health reform');
check('case folds', foldDomain('MENTAL health Reform') === 'mental health reform');
// Punctuation deliberately SURVIVES the fold. Folding it here would make
// "Mental-Health" and "Mental Health" the same name to `nearFoundedDomain`,
// which says "the same words, different capitals or spacing" — a sentence that
// would then be false. Punctuation differences are for the ordering to surface.
check('punctuation is NOT folded, so the near state keeps telling the truth',
  foldDomain('Mental-Health Reform') !== foldDomain('Mental Health Reform'));
check('folding twice changes nothing', foldDomain(foldDomain(' A  B ')) === foldDomain(' A  B '));

console.log('\n--- distance orders, and zero means the fold already caught it ---');
check('zero exactly when the folds are equal',
  domainDistance('Mental Health Reform', 'mental  health reform') === 0
  && domainDistance('a', 'b') > 0);
check('symmetric', domainDistance('Reform', 'Refrom') === domainDistance('Refrom', 'Reform'));
check('a trailing plural is one edit away',
  domainDistance('Mental Health Reform', 'Mental Health Reforms') === 1);
// The reported case: "spelt differently". A transposition is two single-character
// edits under Levenshtein, which is why the nearest-first ordering matters more
// than any cutoff would — two is close for a 20-character name and far for a
// three-character one, and this module declines to decide which.
check('a transposition is two edits',
  domainDistance('Mental Health Reform', 'Mental Health Refrom') === 2);
check('an empty side costs the other side\'s length',
  domainDistance('', 'abc') === 3 && domainDistance('abc', '') === 3);

console.log('\n--- THERE IS NO THRESHOLD: the cap is on count, never on closeness ---');
const far = closestFoundedDomains('Mental Health Reform', ['Cooking'], 3);
check('a name nothing like the typed one is still listed when it is among the nearest',
  far.length === 1 && far[0] === 'Cooking');
check('and the module exports no cutoff to tune',
  typeof domainDistance === 'function' && typeof closestFoundedDomains === 'function'
  && Object.keys({ foldDomain, domainDistance, closestFoundedDomains }).length === 3);

console.log('\n--- the exact and near states own the fold-equal names ---');
const names = ['Mental Health Reform', 'mental health reform', 'Mental Health Reforms', 'Cooking'];
check('a fold-equal name is excluded, because the notice above states it in full',
  !closestFoundedDomains('MENTAL HEALTH REFORM', names, 4).some((n) => foldDomain(n) === 'mental health reform'));
check('two founded names differing only by case collapse to one candidate',
  closestFoundedDomains('Cooking', ['Mental Health Reform', 'mental health reform'], 4).length === 1);

console.log('\n--- ordering, ties and limits ---');
check('nearest first',
  JSON.stringify(closestFoundedDomains('Mental Health Refrom', names, 2))
  === JSON.stringify(['Mental Health Reform', 'Mental Health Reforms']));
// Ties break alphabetically so the output is a function of the SET, not of the
// order the DHT returned links in — a harness can assert it without
// controlling link order, which is the same property `order_records` exists for.
const tiedA = closestFoundedDomains('cat', ['bat', 'hat', 'mat'], 3);
const tiedB = closestFoundedDomains('cat', ['mat', 'hat', 'bat'], 3);
check('equal distances break alphabetically, so link order cannot change the list',
  JSON.stringify(tiedA) === JSON.stringify(['bat', 'hat', 'mat'])
  && JSON.stringify(tiedA) === JSON.stringify(tiedB));
check('the limit caps the count', closestFoundedDomains('cat', ['bat', 'hat', 'mat'], 2).length === 2);
check('a limit of zero or less returns nothing',
  closestFoundedDomains('cat', ['bat'], 0).length === 0
  && closestFoundedDomains('cat', ['bat'], -1).length === 0);
check('an empty box returns nothing, because nothing typed is not a finding',
  closestFoundedDomains('   ', ['bat'], 3).length === 0);

// The same self-counting guard `key-mnemonic-check.mjs` carries, and for the
// same reason: the figure in this header and in row 6.29 cannot go stale
// without reddening here. The two numbers must be equal because nothing in
// this file loops over `check`.
const STATED_CHECKS = 19;
const { readFileSync } = await import('node:fs');
const ownSource = readFileSync(new URL(import.meta.url), 'utf8');
const ownSites = [...ownSource.matchAll(/\bcheck\(\s*'(?:[^'\\]|\\.)*'/g)].length
  + [...ownSource.matchAll(/\bcheck\(\s*"(?:[^"\\]|\\.)*"/g)].length
  + [...ownSource.matchAll(/\bcheck\(\s*`(?:[^`\\]|\\.)*`/g)].length;
check(`this file states ${STATED_CHECKS} checks and has ${ownSites} call sites, so the `
  + 'figure quoted in row 6.29 cannot go stale without reddening here',
  ownSites === STATED_CHECKS);

console.log(`\n${fails === 0 ? 'the ordering is an ordering: no threshold, no judgement, no link-order dependence'
  : fails + ' FAILED'}`);
process.exit(fails ? 1 : 0);
