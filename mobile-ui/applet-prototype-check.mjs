#!/usr/bin/env node
// Exercises `src/applet.ts`'s own rules. That file imports NOTHING, which is
// what makes this runnable at all — see its header: with `@theweave/api`
// co-located, `ws` came through `isomorphic-ws` and no ESM bundle for node
// would load it. Transpile and run:
//
//   npx esbuild src/applet.ts --format=esm --outfile=<tmp>/applet.mjs \
//     && node applet-prototype-check.mjs <tmp>/applet.mjs
//
// WHAT IS NO LONGER TESTED HERE, AND WHY THAT IS THE RIGHT OUTCOME.
// `hostContext` used to contain a hand-written sentinel check and these checks
// exercised it. It now delegates to the host's own `isWeaveContext()`, so
// there is nothing of ours left to assert — and the hand-written version it
// replaced was WRONG (`__WEAVE__` where the installed source reads
// `__WEAVE_API__`, plus an `applet:` protocol case). Testing a copy of
// somebody else's detector would only have proved the copy self-consistent,
// which is exactly how that error survived. What remains asserted is the part
// that is ours: the addressing rule, and that an uncertain host costs nothing.
const target = process.argv[2];
if (!target) { console.error('usage: node applet-prototype-check.mjs <bundled applet.mjs>'); process.exit(2); }
const mod = await import(target);

let fails = 0;
const check = (label, ok) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${label}`); if (!ok) fails++; };

console.log('--- the WAL guard, which is the rule this module enforces ---');
check('a weave-0.15 URL is recognised as a WAL', mod.looksLikeWal('weave-0.15://abc'));
// THE POINT OF MATCHING THE PATTERN RATHER THAN THE NUMBER: a guard pinned to
// 0.15 would stop firing at exactly the moment the hazard becomes real.
check('and so is a FUTURE version the hazard is actually about', mod.looksLikeWal('weave-0.16://abc'));
check('and 1.0, so the guard survives a major bump', mod.looksLikeWal('weave-1.0://abc'));
check('a bare hash pair is NOT a WAL and may be persisted', !mod.looksLikeWal('uhC0kAAA/uhCkkBBB'));
check('neither is an ordinary url', !mod.looksLikeWal('https://moss.social/x'));

let threw = null;
try { mod.assertPersistable('weave-0.15://something', 'remote_membrane_ref'); }
catch (e) { threw = e.message; }
check('persisting a WAL THROWS rather than returning a flag', threw !== null);
check('and the refusal names the field it was about to poison', (threw ?? '').includes('remote_membrane_ref'));
check('and says WHY, not just that a rule exists', /can never be edited/.test(threw ?? ''));
check('an HRL ref passes through unchanged', mod.assertPersistable('uhC0kAAA/uhCkkBBB', 'x') === 'uhC0kAAA/uhCkkBBB');

console.log('\n--- the entry point: standalone is the default, and uncertainty is free ---');
check('unknown context renders standalone, never applet', mod.entryPoint('unknown') === 'standalone');
check('standalone renders standalone', mod.entryPoint('standalone') === 'standalone');
check('applet renders applet', mod.entryPoint('applet') === 'applet');
// Off a host there is no `window`, which is the one detection case still ours.
// `hostContext` is not importable here by design — it lives in
// `applet-host.ts` with the dependency. What is asserted instead is the
// property that makes an uncertain host free: anything that is not 'applet'
// renders standalone, so a detector that is wrong in that direction costs
// nothing. The detector being wrong the OTHER way is what the installed
// source caught.
check('any context that is not applet renders standalone',
  ['standalone', 'unknown'].every((c) => mod.entryPoint(c) === 'standalone'));
check('hrlToRef is not a url, so a WAL cannot be pasted where it goes',
  !mod.hrlToRef({ dnaHash: 'uhC0kA', targetHash: 'uhCkkB' }).includes('://'));
check('a note is NOT advertised as creatable', !mod.CREATABLES.includes('note'));

console.log(`\n${fails === 0 ? 'the module enforces what it claims' : fails + ' FAILED'}`);
process.exit(fails ? 1 : 0);
