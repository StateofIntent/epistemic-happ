#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/published-packages.mjs — THE PACKAGE A STRANGER INSTALLS,
// DRIVEN AGAINST A REAL CONDUCTOR.
//
// WHY THIS EXISTS, AND WHY THE TWO CHECKS EITHER SIDE OF IT DID NOT CATCH THE
// BUG THAT SHIPPED. `@stateofintent/agent-sdk@0.1.1` and
// `@stateofintent/mcp-server@0.1.1` went to the registry failing every zome call
// for anyone who installed them. They are still there, and were replaced on
// 2026-09-12 by `0.1.2`, which this harness gated. Two checks were already in
// place when 0.1.1 shipped and both were green on it, correctly:
//
//   - `scripts/check-packages.mjs` packs each package, installs the tarball into
//     an empty project the way a stranger would, and imports it. It proves the
//     tarball is a package. The broken build does that perfectly — importing a
//     module and listing MCP tools touches no conductor.
//   - `scripts/live-verify/agent-sdk.mjs` drives the SDK against a real
//     conductor, and passes. But it imports `agent-sdk/dist/index.js` — THIS
//     REPOSITORY'S build directory, resolving its dependencies through this
//     repository's `node_modules` and this repository's lockfile.
//
// The defect lives in the gap between them: what a stranger installs resolves
// its OWN dependency tree from the registry, and that tree is not this one. A
// package can import cleanly and still be wrong the moment it makes a call —
// which is exactly the shape 0.1.1 shipped in, and exactly what neither check
// can see. `check-packages.mjs`'s own header already records a version of this
// lesson from 0.1.0 (a libsodium ESM build that only a fresh resolve picks) and
// stops one step too early: it proves the install imports, not that it works.
//
// SO THIS ONE CLOSES IT. Pack both packages, install them into an empty project
// with a FRESH dependency resolution, and then — from inside that install, not
// from this repository — write a claim to a real conductor and read it back with
// an independent call. Nothing here imports anything from `agent-sdk/dist` or
// `mcp-server/dist`; if it did, it would be `agent-sdk.mjs` again.
//
// WHAT IT IS FOR IN PRACTICE. This is the check that has to be green before
// anybody spends a version number. §9 records that the republish is blocked on
// credentials, which is true and is not the whole story: it was also blocked on
// having any way to know the next publish would be better than the last.
//
// Prereqs: a CLEAN sandbox (`scripts/sandbox.sh clean && scripts/sandbox.sh
// start`). Needs the network, because it installs from the registry — the
// packages' own dependencies are fetched, deliberately, since that fresh resolve
// IS the thing under test.
//
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
//   Injection A: `agent-sdk`'s `main` pointed at a file the build does not
//   produce — the 0.1.0 shape, a package whose entry point is not there.
//   Result: all six checks red, and the INSTALL still green. It dies at the
//   first import with ERR_MODULE_NOT_FOUND, taking the MCP server down with it
//   since that depends on the SDK. Recorded because the install passing is the
//   informative part: "it installed" has never been the question.
//
//   Injection B: the SDK resolving no cell — the 0.1.1 failure mode itself,
//   reproduced by pointing the installed copy's `appId` at an app that is not
//   installed.
//   Result: three reds, and this is the split the harness exists for. Packing
//   and installing stay GREEN — the package is a perfectly good package — and
//   it fails at the first conductor call, saying "The app your connection token
//   was issued for was not found." The MCP server's own tool call stays green
//   too, because reaching the conductor is not what broke; only the check that
//   the two packages agree about one network catches it. Watched before it was
//   believed.
// ============================================================================
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = new URL('../../', import.meta.url).pathname;
const PACKAGES = ['agent-sdk', 'mcp-server'];
const DOMAIN = `PublishedPkg${Date.now()}`;

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};
function setupFail(lines) {
  log('');
  for (const l of lines) log(`  SETUP FAILED: ${l}`);
  process.exit(1);
}

const npm = (args, cwd, opts = {}) =>
  execFileSync('npm', args, { cwd, encoding: 'utf8', stdio: 'pipe', ...opts });

function pkgJson(pkg) {
  return JSON.parse(execFileSync('cat', [join(REPO, pkg, 'package.json')], { encoding: 'utf8' }));
}

async function main() {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'epistemic-published-'));
  try {
    // === 1. Pack what would be published =================================
    log('\n--- Packing what `npm publish` would upload ---');
    const tarballs = {};
    for (const pkg of PACKAGES) {
      try {
        npm(['run', 'build'], join(REPO, pkg));
        execFileSync('cp', [join(REPO, 'LICENSE-MIT'), join(REPO, 'LICENSE-APACHE'), join(REPO, pkg) + '/']);
        const filename = JSON.parse(npm(['pack', '--json'], join(REPO, pkg)))[0].filename;
        tarballs[pkg] = join(REPO, pkg, filename);
      } catch (e) {
        setupFail([`Could not pack ${pkg}: ${String(e.message).split('\n')[0]}`,
          `Run: cd ${pkg} && npm install && npm run build`]);
      }
      log(`  packed ${pkg} -> ${tarballs[pkg].split('/').pop()}`);
    }

    // === 2. Install as a stranger would ==================================
    // A fresh resolve, in an empty project, with the sibling tarball rather
    // than the registry's copy — during a version bump the new agent-sdk is by
    // definition not published, and testing against the OLD one would verify
    // precisely the code being replaced.
    log('\n--- Installing into an empty project, resolving dependencies fresh ---');
    const dir = join(tmpRoot, 'stranger');
    execFileSync('mkdir', ['-p', dir]);
    npm(['init', '-y'], dir);
    let installed = true;
    let installErr = '';
    try {
      npm(['install', tarballs['agent-sdk'], tarballs['mcp-server']], dir, { stdio: 'pipe' });
    } catch (e) { installed = false; installErr = String(e.stderr ?? e.message).split('\n').slice(0, 2).join(' '); }
    check('both packages install together into an empty project', installed);
    if (!installed) {
      log(`    (${installErr})`);
      log(`\n${failures} CHECK(S) FAILED`);
      process.exit(1);
    }

    // The resolved tree is the thing under test, so say what it resolved to —
    // a difference here against this repository's own lockfile is the most
    // likely cause of anything below going red, and guessing at it afterwards
    // is how 0.1.0 was diagnosed the slow way.
    try {
      const tree = JSON.parse(npm(['ls', '--all', '--json'], dir));
      const client = tree?.dependencies?.['@stateofintent/agent-sdk']?.dependencies?.['@holochain/client'];
      log(`  installed @holochain/client -> ${client?.version ?? 'not resolved under agent-sdk'}`);
    } catch { log('  (could not read the resolved tree)'); }

    // === 3. Drive the INSTALLED copy against a real conductor ============
    // Everything below runs inside that install. Nothing reaches back into
    // this repository's node_modules or dist — that is the whole point.
    log('\n--- Writing to a real conductor, from the installed package ---');
    const probe = join(dir, 'probe.mjs');
    writeFileSync(probe, `
import { EpistemicAgent } from '@stateofintent/agent-sdk';
const out = (o) => console.log('RESULT:' + JSON.stringify(o));
try {
  const agent = await EpistemicAgent.connect();
  const published = await agent.publishClaim({
    content: 'A claim written by the packaged SDK, not the repository build.',
    domain: ${JSON.stringify(DOMAIN)},
    confidence: 'Moderate',
    semanticTags: [],
  });
  const back = await agent.claimsInDomain(${JSON.stringify(DOMAIN)});
  await agent.close();
  out({
    ok: true,
    agentKey: Buffer.from(agent.agentPubKey).toString('base64').slice(0, 12),
    wrote: published !== null && published !== undefined,
    readBack: back.length,
    matched: back.some((c) => c.entry?.domain === ${JSON.stringify(DOMAIN)}),
  });
} catch (e) {
  out({ ok: false, error: String(e?.message ?? e).split('\\n')[0].slice(0, 300) });
}
process.exit(0);
`);
    let result = { ok: false, error: 'probe produced no result line' };
    try {
      const raw = execFileSync('node', ['probe.mjs'], { cwd: dir, encoding: 'utf8', timeout: 120000 });
      const line = raw.split('\n').find((l) => l.startsWith('RESULT:'));
      if (line) result = JSON.parse(line.slice('RESULT:'.length));
    } catch (e) {
      result = { ok: false, error: String(e.stderr ?? e.message).split('\n')[0].slice(0, 300) };
    }

    check('the installed SDK connects to a conductor and authorizes signing — the step 0.1.1 fails at',
      result.ok === true);
    if (!result.ok) log(`    (${result.error})`);
    check('it writes a claim that the network accepts', result.ok === true && result.wrote === true);
    check('and an independent read finds what it wrote — the package works, not merely imports',
      result.ok === true && result.matched === true);
    if (result.ok) log(`    (agent ${result.agentKey}…, ${result.readBack} claim(s) in ${DOMAIN})`);

    // === 4. The MCP server, past the point where listing tools is enough ==
    // `check-packages.mjs` proves this binary starts and lists its tools. That
    // is true of the broken build too, because listing touches no conductor.
    // This calls one that does.
    log('\n--- The MCP server answering a tool call that reaches the conductor ---');
    const mcpProbe = join(dir, 'mcp-probe.mjs');
    writeFileSync(mcpProbe, `
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const out = (o) => console.log('RESULT:' + JSON.stringify(o));
try {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['node_modules/@stateofintent/mcp-server/dist/index.js'],
  });
  const client = new Client({ name: 'live-verify', version: '0' }, { capabilities: {} });
  await client.connect(transport);
  const tools = await client.listTools();
  const called = await client.callTool({ name: 'claims_in_domain', arguments: { domain: ${JSON.stringify(DOMAIN)} } });
  await client.close();
  const text = (called?.content ?? []).map((c) => c.text ?? '').join('\\n');
  out({ ok: true, tools: tools.tools.length, isError: called?.isError === true, text: text.slice(0, 400) });
} catch (e) {
  out({ ok: false, error: String(e?.message ?? e).split('\\n')[0].slice(0, 300) });
}
process.exit(0);
`);
    let mcp = { ok: false, error: 'probe produced no result line' };
    try {
      const raw = execFileSync('node', ['mcp-probe.mjs'], { cwd: dir, encoding: 'utf8', timeout: 120000 });
      const line = raw.split('\n').find((l) => l.startsWith('RESULT:'));
      if (line) mcp = JSON.parse(line.slice('RESULT:'.length));
    } catch (e) {
      mcp = { ok: false, error: String(e.stderr ?? e.message).split('\n')[0].slice(0, 300) };
    }

    check('the installed MCP server starts and lists its tools', mcp.ok === true && mcp.tools > 0);
    if (!mcp.ok) log(`    (${mcp.error})`);
    check('a tool call that REACHES THE CONDUCTOR succeeds — the half listing tools cannot prove',
      mcp.ok === true && mcp.isError === false);
    check('and it returns the claim the SDK just wrote, so both packages agree about one network',
      mcp.ok === true && typeof mcp.text === 'string' && mcp.text.includes(DOMAIN));
    if (mcp.ok) log(`    (${mcp.tools} tools; tool output ${mcp.text.length} chars)`);
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
    for (const pkg of PACKAGES) {
      execFileSync('bash', ['-c', `rm -f ${join(REPO, pkg)}/*.tgz`]);
    }
  }

  log('');
  if (failures === 0) log('ALL CHECKS PASSED');
  else log(`${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
