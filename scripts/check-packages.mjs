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
import { existsSync } from 'node:fs';

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

console.log('');
if (failures === 0) console.log('ALL CHECKS PASSED — both packages would publish as working packages.');
else console.log(`${failures} CHECK(S) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
