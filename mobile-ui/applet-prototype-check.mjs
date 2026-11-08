// Exercises the pure half of the applet prototype. Not a harness — a
// prototype's own evidence that its one enforced rule fires.
import { readFileSync } from 'node:fs';
const src = readFileSync('/home/vqd/epistemic-happ/mobile-ui/src/applet.ts', 'utf8');
// Strip types so this runs as plain JS without a build step.
const js = src
  .replace(/^export type .*$/gm, '')
  .replace(/^export interface [\s\S]*?^}$/gm, '')
  .replace(/: unknown|: string|: HostContext|: Hrl|: Creatable|: HostContext = hostContext\(\)/g, '')
  .replace(/export const CREATABLES = \['claim', 'critique'\] as const;/, "export const CREATABLES = ['claim','critique'];")
  .replace(/\): 'standalone' \| 'applet' \{/g, ') {')
  .replace(/\): boolean \{/g, ') {')
  .replace(/\): HostContext \{/g, ') {');
const mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

let fails = 0;
const check = (label, ok) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${label}`); if (!ok) fails++; };

console.log('--- the WAL guard, which is the rule this prototype enforces ---');
check('a weave-0.15 URL is recognised as a WAL', mod.looksLikeWal('weave-0.15://abc'));
// THE POINT OF THE GENERAL PATTERN: a guard pinned to 0.15 would stop firing
// at exactly the moment the hazard becomes real.
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

console.log('\n--- detection, against the three cases that actually occur ---');
// `window` does not exist in node, so each case is stubbed explicitly. That is
// the only way to exercise a host-sentinel check off the host.
const withWindow = (w, fn) => {
  const had = 'window' in globalThis;
  const prev = globalThis.window;
  globalThis.window = w;
  try { return fn(); } finally { if (had) globalThis.window = prev; else delete globalThis.window; }
};
const self = {}; self.parent = self;
check('a Moss sentinel reports applet',
  withWindow({ __WEAVE__: {}, parent: self }, () => mod.hostContext()) === 'applet');
check('a Launcher sentinel reports standalone, not applet',
  withWindow({ __HC_LAUNCHER_ENV__: {}, parent: self }, () => mod.hostContext()) === 'standalone');
check('an ordinary top-level tab reports standalone',
  withWindow(self, () => mod.hostContext()) === 'standalone');
// THE CASE THE PROTOTYPE REFUSES TO GUESS: framed, no sentinel.
check('framed with NO sentinel reports unknown rather than applet',
  withWindow({ parent: {} }, () => mod.hostContext()) === 'unknown');
check('and unknown therefore renders standalone, so a wrong guess costs nothing',
  mod.entryPoint(withWindow({ parent: {} }, () => mod.hostContext())) === 'standalone');
check('no window at all reports unknown', mod.hostContext() === 'unknown');

console.log('\n--- the entry point is a branch, and standalone is the default ---');
check('unknown context renders standalone, never applet', mod.entryPoint('unknown') === 'standalone');
check('standalone renders standalone', mod.entryPoint('standalone') === 'standalone');
check('applet renders applet', mod.entryPoint('applet') === 'applet');
check('hrlToRef is not a url, so a WAL cannot be pasted where it goes',
  !mod.hrlToRef({ dnaHash: 'uhC0kA', targetHash: 'uhCkkB' }).includes('://'));
check('a note is NOT advertised as creatable', !mod.CREATABLES.includes('note'));

console.log(`\n${fails === 0 ? 'the prototype enforces what it claims' : fails + ' FAILED'}`);
process.exit(fails ? 1 : 0);
