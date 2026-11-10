#!/usr/bin/env node
// Exercises `src/applet.ts`'s own rules — 48 checks. That file imports
// NOTHING, which is what makes this runnable at all — see its header: with
// `@theweave/api` co-located, `ws` came through `isomorphic-ws` and no ESM
// bundle for node would load it. Transpile and run:
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
//
// RUN BY NOBODY UNTIL 2026-11-10. It was written with #450, carried 14 checks,
// and appeared in no workflow at all — a gate that exists and does not run is
// indistinguishable from one that was never written, except that it reads like
// coverage. It is now a step in `ui.yml`, placed BEFORE the five-minute pack
// because it needs no conductor and no browser, so a broken addressing rule
// fails the job in seconds.
//
// NEGATIVE EVIDENCE. The WAL guard was ANCHORED (`/^weave-\d+\.\d+:\/\//`)
// until the installed source was read, and the host's own
// `weaveUrlFromWal(wal, webPrefix)` returns
// `https://theweave.social/wal?weave-0.12://hrl/…` — a versioned scheme that
// is not at the start of the string, which the anchored guard called NOT a
// WAL and `assertPersistable` waved into a permanent entry. Re-anchoring it
// turns **3 checks red**, and the other 10 in that section stay green, which
// is how the hole survived being tested.
//
// `applet-view.mjs` is the other half of this row's gate: these are the rules,
// and that is the wiring, driven in a browser against a fake Moss host whose
// client is a real conductor.
const target = process.argv[2];
if (!target) { console.error('usage: node applet-prototype-check.mjs <bundled applet.mjs>'); process.exit(2); }
const mod = await import(target);

let fails = 0;
const check = (label, ok) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${label}`); if (!ok) fails++; };

console.log('--- the WAL guard, which is the rule this module enforces ---');
check('a weave-0.15 URL is recognised as a WAL', mod.looksLikeWal('weave-0.15://abc'));
// THE REGRESSION THIS FILE DID NOT CATCH UNTIL THE SOURCE WAS READ. The guard
// was `/^weave-\d+\.\d+:\/\//` and the host's own `weaveUrlFromWal(wal, true)`
// returns 'https://theweave.social/wal?weave-0.12://hrl/<dna>/<target>' — a
// versioned scheme that is not at the start of the string. The anchored guard
// said FALSE and `assertPersistable` waved the host's own default shareable
// link straight into a permanent entry. Every other check in this section
// passed throughout.
const WEB_PREFIXED = 'https://theweave.social/wal?weave-0.12://hrl/uhC0kAAA/uhCkkBBB';
check('the WEB-PREFIXED form the host produces by default is recognised too',
  mod.looksLikeWal(WEB_PREFIXED));
let threwWeb = null;
try { mod.assertPersistable(WEB_PREFIXED, 'bridge_ref'); } catch (e) { threwWeb = e.message; }
check('and persisting THAT throws as well', threwWeb !== null);
check('the library\'s own fallback version (0.12, not 0.15) is caught',
  mod.looksLikeWal('weave-0.12://hrl/a/b'));
check('looksVersionless agrees with the guard, inverted',
  mod.looksVersionless('uhC0kAAA/uhCkkBBB') && !mod.looksVersionless(WEB_PREFIXED));
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


console.log('\n--- RenderInfo: which surface a host asked for ---');
// The three AppletView arms, read off types.d.ts:109 rather than the docs.
check('an applet-view main render is the whole app',
  mod.appletSurface({ type: 'applet-view', view: { type: 'main' } }) === 'main');
check('an asset render is the asset surface',
  mod.appletSurface({ type: 'applet-view', view: { type: 'asset' } }) === 'asset');
check('a creatable render is the creatable surface',
  mod.appletSurface({ type: 'applet-view', view: { type: 'creatable' } }) === 'creatable');
// THE ONE THIS FUNCTION EXISTS FOR, and it is why switching on `view.type`
// alone is wrong: CrossGroupView's type is ALSO the string 'main'
// (types.d.ts:138), and that arm carries no `appletClient` and no `groupHash`
// — a Map of OTHER applets' clients instead. Code that routed it to the main
// view would read `appletClient` off an object that has none and throw on the
// first zome call.
check('a CROSS-GROUP render is not the main view, though its view.type says main',
  mod.appletSurface({ type: 'cross-group-view', view: { type: 'main' } }) === 'cross-group');
// The three checks above are the control for these four: a function that
// always answered 'standalone' would pass every refusal below and nothing
// above it.
for (const [label, input] of [
  ['null', null], ['undefined', undefined], ['a string', 'applet-view'],
  ['an empty object', {}], ['a view type nobody has shipped yet',
    { type: 'applet-view', view: { type: 'dashboard' } }],
]) {
  check(`${label} renders standalone, which costs nothing`,
    mod.appletSurface(input) === 'standalone');
}

console.log('\n--- a WAL from the host, converted without a parser of our own ---');
const enc = (h) => `u${Buffer.from(h).toString('base64url')}`;
const dna = new Uint8Array([0x84, 0x2d, 0x24, 1, 2, 3]);
const tgt = new Uint8Array([0x84, 0x21, 0x24, 4, 5, 6]);
const good = mod.hrlFromHostWal({ hrl: [dna, tgt] }, enc);
check('a real WAL yields an Hrl of two encoded hashes',
  good !== null && good.dnaHash === enc(dna) && good.targetHash === enc(tgt));
check('and that Hrl is persistable, which is the whole point of preferring it',
  mod.assertPersistable(mod.hrlToRef(good), 'x').includes('/'));
for (const [label, input] of [
  ['no hrl at all', {}],
  ['a one-element hrl', { hrl: [dna] }],
  ['base64 strings where hashes belong', { hrl: ['uhC0kAAA', 'uhCkkBBB'] }],
  ['an empty hash', { hrl: [new Uint8Array(), tgt] }],
  ['null', null],
]) {
  check(`${label} yields null rather than a wrong hash`,
    mod.hrlFromHostWal(input, enc) === null);
}
// The encoder is somebody else's, so its OUTPUT is checked rather than
// trusted: this is the one path into a stored ref that `assertPersistable`
// does not sit on.
check('an encoder that returned a versioned string is refused, not stored',
  mod.hrlFromHostWal({ hrl: [dna, tgt] }, () => 'weave-0.12://hrl/a/b') === null);

console.log('\n--- what a Moss role may decide, and what it may never ---');
check('the host may gate CHROME', mod.hostMayGate('chrome'));
for (const refused of mod.HOST_MAY_NEVER_GATE) {
  check(`the host may NEVER gate ${refused}`, !mod.hostMayGate(refused));
}
// Without this, an allow-list that happened to be empty would pass every
// refusal above and say nothing about intent.
check('and the refusals are listed explicitly rather than merely omitted',
  mod.HOST_MAY_NEVER_GATE.includes('publish') && mod.HOST_MAY_GATE.length > 0);
check('anything not named is refused by default', !mod.hostMayGate('transclude'));

console.log('\n--- what this Tool advertises it can create ---');
check('exactly the creatables, with no extra key',
  Object.keys(mod.CREATABLE_TYPES).sort().join(',') === [...mod.CREATABLES].sort().join(','));
check('each has the label Moss renders in its own menu',
  Object.values(mod.CREATABLE_TYPES).every((t) => typeof t.label === 'string' && t.label.length > 0));
// An icon path would resolve against the `applet:` origin the host chose for
// this iframe, which this UI does not control — the same reason vite.config.ts
// sets `base: './'`. Empty lets the host show its own placeholder.
check('and no icon path, which would resolve against an origin we do not own',
  Object.values(mod.CREATABLE_TYPES).every((t) => t.icon_src === ''));
check('a note is still NOT advertised as creatable', !('note' in mod.CREATABLE_TYPES));

console.log('\n--- the timeout that exists because connect() can never resolve ---');
check('there is one, and it is a real wait rather than a token',
  typeof mod.CONNECT_TIMEOUT_MS === 'number' && mod.CONNECT_TIMEOUT_MS >= 1000);

console.log(`\n${fails === 0 ? 'the module enforces what it claims' : fails + ' FAILED'}`);
process.exit(fails ? 1 : 0);
