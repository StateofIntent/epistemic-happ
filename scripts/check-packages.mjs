#!/usr/bin/env node
// ============================================================================
// scripts/check-packages.mjs — would `npm publish` produce a working package?
//
// WHY THIS IS NOT OBVIOUS FROM READING package.json. A publishable package is
// defined by what ends up in the TARBALL, and that is decided by `files`,
// `.npmignore`, `.gitignore` and npm's own built-in rules interacting. The
// failure modes are all quiet:
//
//   - `files` missing, so the tarball carries src/, tsconfig.json and
//     whatever else was lying around.
//   - `dist` listed but never built, so the tarball is a package whose
//     entry point does not exist. It installs fine and fails on import.
//   - A `file:../thing` dependency, which works perfectly on this machine
//     and cannot resolve on anyone else's. mcp-server had exactly this.
//   - A licence declared in the SPDX field and absent from the tarball, so
//     the package states terms it does not carry.
//
// None of these is visible until someone installs the published package, by
// which time the version number is spent. `npm pack --dry-run --json` reports
// the real file list, so this asserts against that rather than against
// intentions.
// ============================================================================

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PACKAGES = ['agent-sdk', 'mcp-server'];
const REQUIRED = ['README.md', 'LICENSE-MIT', 'LICENSE-APACHE', 'package.json'];
const FORBIDDEN = [/^src\//, /^node_modules\//, /tsconfig\.json$/, /^test/, /\.map$/];

let failures = 0;
const check = (label, cond) => {
  if (cond) console.log(`  PASS: ${label}`);
  else { console.log(`  FAIL: ${label}`); failures++; }
};

for (const pkg of PACKAGES) {
  console.log(`\n=== ${pkg} ===`);
  const pj = JSON.parse(execFileSync('cat', [`${pkg}/package.json`], { encoding: 'utf8' }));

  check(`${pkg} declares a licence`, pj.license === 'MIT OR Apache-2.0');
  check(`${pkg} is marked publicly publishable (scoped packages default to restricted)`,
    pj.publishConfig?.access === 'public');
  check(`${pkg} points at its repository`, typeof pj.repository?.url === 'string');
  check(`${pkg} carries keywords, which is how anyone finds it`,
    Array.isArray(pj.keywords) && pj.keywords.length >= 4);

  const deps = Object.entries(pj.dependencies ?? {});
  const localDeps = deps.filter(([, v]) => String(v).startsWith('file:') || String(v).startsWith('link:'));
  check(`${pkg} has no file:/link: dependency — those cannot resolve on an installing machine`,
    localDeps.length === 0);
  if (localDeps.length) console.log(`      offending: ${JSON.stringify(localDeps)}`);

  // The real question: what actually goes in the tarball.
  execFileSync('npm', ['run', 'build'], { cwd: pkg, stdio: 'ignore' });
  execFileSync('cp', ['LICENSE-MIT', 'LICENSE-APACHE', `${pkg}/`]);
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: pkg, encoding: 'utf8' });
  const files = JSON.parse(out)[0].files.map((f) => f.path);

  for (const req of REQUIRED) {
    check(`${pkg} tarball contains ${req}`, files.includes(req));
  }
  check(`${pkg} tarball contains its built entry point`,
    files.some((f) => f === pj.main?.replace(/^\.\//, '')));
  check(`${pkg} tarball contains type declarations`,
    files.some((f) => f.endsWith('.d.ts')));
  for (const bad of FORBIDDEN) {
    const hit = files.filter((f) => bad.test(f));
    check(`${pkg} tarball excludes ${bad}`, hit.length === 0);
    if (hit.length) console.log(`      found: ${hit.slice(0, 3).join(', ')}`);
  }
  // The entry point has to exist on disk, not merely be listed.
  check(`${pkg}'s declared entry point was actually built`,
    existsSync(`${pkg}/${pj.main}`));
}

// ---------------------------------------------------------------------------
// THE CHECK EVERYTHING ABOVE WAS MISSING: does the package actually WORK when
// somebody installs it?
//
// Every assertion up to this point inspects the tarball's file list. All of
// them passed for 0.1.0, and 0.1.0 was unusable: `npm install` followed by a
// single `import` crashed with ERR_MODULE_NOT_FOUND, because @holochain/client
// depends on libsodium-wrappers@^0.7.13 and a fresh resolve picks 0.7.16,
// whose ESM build imports a sibling file the package does not contain. The
// repo never saw it — its lockfile pins 0.7.13, which has no ESM build and so
// uses the working CJS one. Nothing that reads package.json or a file list can
// see a difference like that.
//
// So this packs each package for real, installs the tarball into an empty
// directory the way a stranger would, and imports it. It is slower than
// everything above put together and it is the only part that would have
// caught the bug that shipped.
console.log('\n=== installed-and-imported ===');
const tmpRoot = mkdtempSync(join(tmpdir(), 'epistemic-pkgcheck-'));
const tarballs = {};
try {
  // Pack everything first, so a package can be installed alongside its own
  // sibling rather than reaching for a registry version that may not exist
  // yet. mcp-server depends on agent-sdk, and during a version bump the new
  // agent-sdk is by definition not published — testing against the OLD
  // published one would verify the wrong code.
  for (const pkg of PACKAGES) {
    const file = JSON.parse(execFileSync('npm', ['pack', '--json'], { cwd: pkg, encoding: 'utf8' }))[0].filename;
    tarballs[pkg] = join(process.cwd(), pkg, file);
  }

  for (const pkg of PACKAGES) {
    const pj = JSON.parse(execFileSync('cat', [`${pkg}/package.json`], { encoding: 'utf8' }));
    const dir = join(tmpRoot, pkg);
    execFileSync('mkdir', ['-p', dir]);
    execFileSync('npm', ['init', '-y'], { cwd: dir, stdio: 'ignore' });

    // Install this package's tarball, plus any sibling tarball it depends on.
    const toInstall = [tarballs[pkg]];
    for (const other of PACKAGES) {
      if (other !== pkg && pj.dependencies?.[JSON.parse(execFileSync('cat', [`${other}/package.json`], { encoding: 'utf8' })).name]) {
        toInstall.unshift(tarballs[other]);
      }
    }
    let installed = true;
    try {
      execFileSync('npm', ['install', ...toInstall], { cwd: dir, stdio: 'ignore' });
    } catch {
      installed = false;
    }
    check(`${pkg} installs from its tarball into an empty project`, installed);
    if (!installed) continue;

    // A file rather than -e: the probe contains quotes and newlines, and
    // escaping it through an argv string is its own source of false failures.
    const probe = join(dir, 'probe.mjs');
    writeFileSync(probe, `import(${JSON.stringify(pj.name)})\n  .then((m) => console.log('OK:' + Object.keys(m).length))\n  .catch((e) => console.log('ERR:' + String(e.message).split('\\n')[0]));\n`);
    let out = '';
    try { out = execFileSync('node', ['probe.mjs'], { cwd: dir, encoding: 'utf8' }).trim(); }
    catch (e) { out = `ERR:${String(e.message).split('\n')[0]}`; }
    check(`${pkg} imports cleanly after that install — ${out.slice(0, 60)}`, out.startsWith('OK:'));

    // A package with a `bin` is meant to be RUN, and importing it proves only
    // that its modules resolve. For those, speak the protocol it claims to
    // speak: start it and ask it to list its tools. This is the end-user path,
    // and the one an "it installed fine" result says nothing about.
    if (pj.bin) {
      const entry = join(dir, 'node_modules', pj.name, pj.main);
      const smoke = join(dir, 'smoke.mjs');
      writeFileSync(smoke, [
        "import { spawn } from 'node:child_process';",
        `const s = spawn('node', [${JSON.stringify(entry)}], { stdio: ['pipe','pipe','pipe'] });`,
        "let buf='', id=1; const pend=new Map();",
        "s.stdout.on('data', d => { buf += d; let n; while ((n = buf.indexOf('\\n')) >= 0) { const l = buf.slice(0,n).trim(); buf = buf.slice(n+1); if(!l) continue; try { const m = JSON.parse(l); const r = pend.get(m.id); if (r) { pend.delete(m.id); r(m); } } catch {} } });",
        "const rpc = (mm, pp) => new Promise(r => { const i = id++; pend.set(i, r); s.stdin.write(JSON.stringify({jsonrpc:'2.0',id:i,method:mm,params:pp}) + '\\n'); setTimeout(() => { if (pend.has(i)) { pend.delete(i); r({}); } }, 15000); });",
        "await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'check', version: '0' } });",
        "s.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'}) + '\\n');",
        "const r = await rpc('tools/list', {});",
        "console.log('TOOLS:' + (r.result?.tools?.length ?? 0));",
        "s.kill(); process.exit(0);",
      ].join('\n') + '\n');
      let smokeOut = '';
      try { smokeOut = execFileSync('node', ['smoke.mjs'], { cwd: dir, encoding: 'utf8' }).trim(); }
      catch (e) { smokeOut = `ERR:${String(e.message).split('\n')[0]}`; }
      const n = Number((smokeOut.match(/TOOLS:(\d+)/) ?? [])[1] ?? 0);
      check(`${pkg} runs as a binary and advertises its tools (${smokeOut.slice(0, 40)})`, n > 0);
    }
  }
} finally {
  for (const t of Object.values(tarballs)) { try { execFileSync('rm', ['-f', t]); } catch { /* gone */ } }
  execFileSync('rm', ['-rf', tmpRoot]);
}

console.log('');
if (failures === 0) console.log('ALL CHECKS PASSED — both packages publish, install and import.');
else console.log(`${failures} CHECK(S) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
