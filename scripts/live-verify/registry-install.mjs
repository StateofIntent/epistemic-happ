#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/registry-install.mjs — WHAT A STRANGER INSTALLS TODAY,
// AS OPPOSED TO WHAT WE WOULD PUBLISH NEXT. `docs/open-work.md` item 1.8.
//
// THE GAP THIS CLOSES, AND WHY IT IS NOT A DUPLICATE OF ITS SIBLING.
// `published-packages.mjs` PACKS THE LOCAL TREE and installs those tarballs,
// for a reason its own step-2 comment states and which is correct: during a
// version bump the replacement SDK is by definition not on the registry yet, so
// resolving the registry copy would verify precisely the code being replaced.
//
// The consequence nobody had drawn is that a green `conductor` run therefore
// means *the tarball we would publish from HEAD works against a real
// conductor* — and says nothing whatever about the artifact somebody installs
// right now. Those are different objects, and this repository has already been
// bitten by the difference:
//
//   THE REGISTRY COPY OF 0.1.3 WAS BROKEN FROM 2026-10-15 UNTIL 0.1.4, because
//   `mcp-server`'s dependency RANGE resolved to an `agent-sdk` that did not
//   work. Nothing in the repository was wrong at any point. A local-tarball
//   test cannot see this failure mode by construction: it never asks the
//   registry to resolve anything.
//
// So this harness installs BY VERSION FROM THE REGISTRY, reports what actually
// resolved, and drives it against a real conductor. The two harnesses answer
// different questions and both are worth having.
//
// IT REPORTS WHAT IT RESOLVED, WHICH IS §7b.2 APPLIED TO AN INSTALL. A check
// that passes without saying which version it tested is indistinguishable from
// one silently pinned to a stale version that happens to work — so the resolved
// versions are printed and asserted to be the ones asked for. `latest` is
// resolved through the registry rather than assumed.
//
// RUN IT ON A SCHEDULE, NOT PER-PUSH. It tests the registry, which does not
// change when this repository does; per-push it would burn a conductor job to
// re-answer an unchanged question, and would go red for reasons no diff caused.
// That is also why it is NOT added to any required context.
//
//   EPI_REGISTRY_VERSION=latest   (default) both packages at `latest`
//   EPI_REGISTRY_VERSION=0.1.1    the known-broken pair — see below
//
// NEGATIVE EVIDENCE IS FREE HERE, which is rare and worth using. `0.1.1` of
// both packages is STILL ON THE REGISTRY and still broken — it failed every
// zome call for anyone who installed it. So:
//
//   EPI_REGISTRY_VERSION=0.1.1 node scripts/live-verify/registry-install.mjs
//
// must go RED at the conductor step while the install and import stay GREEN.
// That is not a simulation of the failure, it is the failure, preserved. Any
// change that makes this harness pass against 0.1.1 has broken the harness.
//
// Prereqs: a sandbox conductor (scripts/sandbox.sh clean && start) and the
// network, since the install resolves from the registry — that resolve IS the
// thing under test.
// ============================================================================
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SDK = '@stateofintent/agent-sdk';
const MCP = '@stateofintent/mcp-server';
const WANT = (process.env.EPI_REGISTRY_VERSION ?? 'latest').trim();
const DOMAIN = `RegistryInstall${Date.now()}`;

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};
function setupFail(lines) {
  log('');
  for (const l of lines) log(`  SETUP FAILED: ${l}`);
  log('  This is not a result about the packages.');
  process.exit(2);
}
const npm = (args, cwd, opts = {}) =>
  execFileSync('npm', args, { cwd, encoding: 'utf8', stdio: 'pipe', ...opts });

async function main() {
  log(`=== WHAT A STRANGER INSTALLS: ${SDK} and ${MCP} @ ${WANT} ===\n`);

  // === 1. Ask the registry what it is serving ============================
  // Before installing anything: a version that does not exist must fail as a
  // SETUP failure and not as a red check, or "the package is broken" and "the
  // version was a typo" become the same report.
  let resolvedWant;
  try {
    resolvedWant = JSON.parse(npm(['view', `${SDK}@${WANT}`, 'version', '--json'], process.cwd()));
    if (Array.isArray(resolvedWant)) resolvedWant = resolvedWant[resolvedWant.length - 1];
  } catch (e) {
    setupFail([
      `The registry does not serve ${SDK}@${WANT}.`,
      String(e.stderr ?? e.message).split('\n')[0].slice(0, 200),
      'Check EPI_REGISTRY_VERSION, or that the publish actually happened.',
    ]);
  }
  log(`  the registry resolves ${SDK}@${WANT} -> ${resolvedWant}`);

  const tmpRoot = mkdtempSync(join(tmpdir(), 'epistemic-registry-'));
  const dir = join(tmpRoot, 'stranger');
  try {
    execFileSync('mkdir', ['-p', dir]);
    npm(['init', '-y'], dir);

    // === 2. Install from the registry, by version ========================
    log('\n--- Installing from the registry into an empty project ---');
    let installed = true;
    let installErr = '';
    try {
      npm(['install', `${SDK}@${WANT}`, `${MCP}@${WANT}`], dir, { stdio: 'pipe' });
    } catch (e) {
      installed = false;
      installErr = String(e.stderr ?? e.message).split('\n').slice(0, 3).join(' ');
    }
    check('both packages install together from the registry into an empty project', installed);
    if (!installed) {
      log(`    (${installErr})`);
      // THE 0.1.3 FAILURE MODE LANDS HERE and is worth naming where it lands:
      // an ETARGET on the SDK means mcp-server's published range cannot be
      // satisfied — the registry is inconsistent with itself, and nothing in
      // this repository can be read off that.
      if (/ETARGET|No matching version/i.test(installErr)) {
        log('    => the published dependency RANGE cannot resolve. This is the 0.1.3');
        log('       failure class: the registry is inconsistent with itself, and no');
        log('       local tarball test can see it.');
      }
      log(`\n${failures} CHECK(S) FAILED`);
      process.exit(1);
    }

    // === 3. SAY WHAT RESOLVED — §7b.2 for an install =====================
    // A check that does not report the version it tested cannot be told apart
    // from one pinned to something stale that happens to work.
    let tree = {};
    try { tree = JSON.parse(npm(['ls', '--all', '--json'], dir)); } catch { /* reported below */ }
    const sdkGot = tree?.dependencies?.[SDK]?.version ?? null;
    const mcpGot = tree?.dependencies?.[MCP]?.version ?? null;
    const clientGot = tree?.dependencies?.[SDK]?.dependencies?.['@holochain/client']?.version
      ?? tree?.dependencies?.['@holochain/client']?.version ?? null;
    log(`  resolved: ${SDK} ${sdkGot}, ${MCP} ${mcpGot}, @holochain/client ${clientGot ?? 'not under the SDK'}`);
    check(`the install resolved the version asked for (${resolvedWant}), not something else`,
      sdkGot === resolvedWant);
    check('and the MCP server resolved a version too, so its own range was satisfiable',
      mcpGot !== null);

    // === 4. Drive the installed copy against a real conductor ============
    // Inside the install. Nothing here reaches into this repository.
    log('\n--- Writing to a real conductor, from the registry copy ---');
    writeFileSync(join(dir, 'probe.mjs'), `
import { EpistemicAgent } from '${SDK}';
const out = (o) => console.log('RESULT:' + JSON.stringify(o));
try {
  const agent = await EpistemicAgent.connect();
  const published = await agent.publishClaim({
    content: 'A claim written by the REGISTRY copy of the SDK.',
    domain: ${JSON.stringify(DOMAIN)},
    confidence: 'Moderate',
    semanticTags: [],
  });
  const back = await agent.claimsInDomain(${JSON.stringify(DOMAIN)});
  await agent.close();
  out({
    ok: true,
    wrote: published !== null && published !== undefined,
    readBack: back.length,
    matched: back.some((c) => c.entry?.domain === ${JSON.stringify(DOMAIN)}),
  });
} catch (e) {
  out({ ok: false, error: String(e?.message ?? e).split('\\n')[0].slice(0, 300) });
}
process.exit(0);
`);
    let result = { ok: false, error: 'the probe produced no result line' };
    try {
      const raw = execFileSync('node', ['probe.mjs'], { cwd: dir, encoding: 'utf8', timeout: 120000 });
      const line = raw.split('\n').find((l) => l.startsWith('RESULT:'));
      if (line) result = JSON.parse(line.slice('RESULT:'.length));
    } catch (e) {
      result = { ok: false, error: String(e.stderr ?? e.message).split('\n')[0].slice(0, 300) };
    }

    check('the registry copy connects to a conductor and authorizes signing', result.ok === true);
    if (!result.ok) {
      log(`    (${result.error})`);
      log('    => THE PUBLISHED ARTIFACT IS BROKEN FOR ANYONE INSTALLING IT NOW.');
      log('       The repository may be perfectly healthy; these are different objects.');
    }
    check('it writes a claim the network accepts', result.ok === true && result.wrote === true);
    check('and an independent read finds what it wrote',
      result.ok === true && result.matched === true);
    if (result.ok) log(`    (${result.readBack} claim(s) in ${DOMAIN})`);

    log('');
    if (failures > 0) {
      log(`${failures} CHECK(S) FAILED`);
      log(`The versions under test were ${SDK} ${sdkGot} and ${MCP} ${mcpGot}, from the registry.`);
      process.exit(1);
    }
    log(`ALL CHECKS PASSED — ${SDK} ${sdkGot} and ${MCP} ${mcpGot}, as served by the registry`);
  } finally {
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
