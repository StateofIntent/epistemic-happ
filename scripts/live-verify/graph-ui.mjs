#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/graph-ui.mjs — live verification of mobile-ui's
// spatial view of critique structure.
//
// The seed builds a genuinely THREE-LEVEL argument: a claim, a critique
// of it, a critique of that critique, and a critique of THAT. Depth is
// the entire justification for this view — a Critique is itself a valid
// CritiqueTargetType. A seed that only went one level would verify
// nothing the list could not already do.
//
// THE SECOND HALF OF THAT SENTENCE USED TO READ "the critique panel only
// ever fetches depth 1, so anything deeper is invisible in the list", AND
// ROW 6.19 MADE IT FALSE. The panel now fetches one level of REPLIES, so
// the depth-2 critique renders inside the list as a reply under the
// critique it answers. Depth 3 is still invisible there, which is what
// keeps this view justified — but the line is now one level further down
// than this file assumed.
//
// AND THE ASSERTION BELOW WAS A RACE FROM THE MOMENT 6.19 LANDED, which
// is worth recording because it passed three CI runs before it failed
// one. It counted `.critique-item`, a class 6.19's replies also carry,
// so the number depended on whether `loadReplies` had resolved before the
// count was taken — green on a slow fetch, red on a fast one, with no
// code change between. It is now scoped to non-replies and waits for the
// reply to arrive rather than racing it, so both halves are asserted.
//
// The assertions that matter are the constraints, not the pixels:
//
//   - Every node is FOCUSABLE and LABELLED. This view is SVG rather than
//     canvas specifically so it stays keyboard-reachable and
//     screen-reader-readable, and an assertion that only checked "a
//     picture appeared" would let that silently regress.
//   - NODE RADII ARE ALL EQUAL. Sizing by engagement or conductance
//     would be the client asserting which critique matters more —
//     Invariant #1's canonical comparative signal, drawn instead of
//     computed.
//   - LAYOUT IS DETERMINISTIC. Rendering the same claim twice must give
//     identical coordinates, or two viewers see different shapes for the
//     same argument and §4.4's second constraint is broken by geometry.
//
// Prereqs: scripts/sandbox.sh start (clean), `npx vite build` in
// mobile-ui/.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
// This directory's own rule is that a harness which has only ever been
// green has not been shown to test anything. Recorded here, rather than
// only in a merged PR, so it is readable at the point someone runs this
// file.
//
//   Regression injected: sizing nodes by depth instead of a uniform NODE_RADIUS.
//   Result: one FAIL — 'every node has an identical radius', i.e. Invariant #1 asserted through geometry rather than through a number.
//
//   Regression injected (row 6.25): `get_critiques_for` forced to throw inside
//   the structure walk.
//   Result: the new `critique-graph-failed` notice renders and the summary
//   checks go red. Before 6.25 this threw out of an `await` in an onclick —
//   an unhandled rejection, with the panel left saying "Reading the critique
//   structure…" and nothing reading. The run still stops further down, where
//   the accessibility section needs nodes that are not there; the wait on the
//   summary admits either outcome now, so the structure section reports
//   rather than dying at a 20-second timeout with nothing said.
//
// Re-check it the same way if you change what this file asserts: inject,
// watch it go red, restore, watch it go green.
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { CHROMIUM } from './chromium.mjs';
import { waitDeclaringMode } from './declared-wait.mjs';

const requireFromUi = createRequire(new URL('../../mobile-ui/package.json', import.meta.url));
let chromium;
try {
  ({ chromium } = requireFromUi('playwright'));
} catch {
  console.error('Could not resolve playwright from mobile-ui/. Run: cd mobile-ui && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install');
  process.exit(1);
}

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_ID = 'epistemic-resonance-happ';
const PREVIEW_PORT = 4176;
const DOMAIN = `Graph${Date.now()}`;

const nowMicros = () => Date.now() * 1000;
const log = (...a) => console.log(...a);

let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

async function seed() {
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: APP_ID });
  const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      // CellInfo became a discriminated union in @holochain/client
      // 0.21 ({ type, value }); it used to be keyed by cell type. The
      // old `CellType.Provisioned in cell` test matches nothing against
      // the new shape, silently yielding no cell ids at all.
      if (cell?.type === CellType.Provisioned || cell?.type === CellType.Cloned) {
        cellIds.push(cell.value.cell_id);
      }
    }
  }
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  const me = cellIds[0][1];
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });

  log(`Seeding a three-level argument in ${DOMAIN} ...`);
  await call('create_claim', {
    content: 'Loaded carries reduce recurrence more than rest does.',
    domain: DOMAIN, author: me, timestamp: nowMicros(),
    evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
  });
  const claims = await call('get_claims_by_domain', DOMAIN);
  const claimHash = claims[0].signed_action.hashed.content.data.entry_hash;

  // A critique targets an entry hash (SPEC §5.4), so critiquing a
  // critique means reading back its entry hash and targeting that.
  const critiqueOn = async (targetHash, targetType, mode, content) => {
    await call('create_critique', {
      target: targetHash, target_type: targetType, critique_mode: mode,
      content, author: me, timestamp: nowMicros(),
      replication_attempted: false, evidence_hashes: [], species: null,
    });
    const list = await call('get_critiques_for', targetHash);
    return list[list.length - 1].signed_action.hashed.content.data.entry_hash;
  };

  const l1 = await critiqueOn(claimHash, 'Claim', 'Methodological',
    'Compared against what rest protocol, and over what follow-up window?');
  const l2 = await critiqueOn(l1, 'Critique', 'Evidential',
    'The cited trial does specify both — twelve weeks, standardised rest arm.');
  await critiqueOn(l2, 'Critique', 'Logical',
    'That trial reports adherence, not recurrence, so it cannot settle this.');

  // A second branch at depth 1, so the layout has real breadth as well
  // as depth and a single-child chain is not the only case exercised.
  await critiqueOn(claimHash, 'Claim', 'Experiential',
    'In my practice the effect held only where load was progressed slowly.');

  log('  seeded: claim -> 2 critiques, one of them 3 levels deep.\n');
  return { app, admin };
}

async function main() {
  const { app, admin } = await seed();
  try { await app.client?.close?.(); } catch { /* best effort */ }
  try { await admin.client?.close?.(); } catch { /* best effort */ }

  log('Starting vite preview (production bundle) ...');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: new URL('../../mobile-ui/', import.meta.url).pathname, stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 4000));

  const browser = await chromium.launch({ executablePath: CHROMIUM });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });
    await page.getByPlaceholder(/domain/i).first().fill(DOMAIN);
    await page.getByRole('button', { name: 'Load claims', exact: true }).click();
    await page.waitForSelector('.claim-card', { timeout: 20000 });

    log('=== The list view shows depth 1 only ===');
    await page.getByRole('button', { name: /view \/ add critiques/i }).first().click();
    // §7b.2. The fourth of the four observed `ui` failures was this selector.
    // Unlike taxonomy-ui's two this is a REVEAL of data seeded above rather
    // than a write-then-wait, which makes the mode answer sharper rather than
    // weaker: the critiques are known to exist, so a NOT-readable answer here
    // would mean the seed itself did not integrate, and a READABLE one puts it
    // squarely on the panel.
    await waitDeclaringMode(page, '.critique-item', {
      timeout: 20000,
      probeLabel: 'whether the seeded critiques are readable for this claim',
      log,
      probe: async () => {
        const claims = await call('get_claims_by_domain', DOMAIN);
        if (claims.length === 0) {
          return { readable: false, detail: 'the seeded claim is not readable by domain' };
        }
        const target = claims[0].signed_action.hashed.content.data.entry_hash;
        const rows = await call('get_critiques_for', target);
        return { readable: rows.length > 0, detail: `${rows.length} direct critiques on the seeded claim` };
      },
    });
    // Wait for 6.19's replies rather than racing them: the depth-2 critique
    // is a reply to the depth-1 one, so it MUST appear. Racing this is what
    // made the old assertion flaky.
    await page.waitForSelector('[data-testid="critique-reply"]', { timeout: 20000 })
      .catch(() => {});
    const listed = await page.locator('.critique-item:not(.critique-reply)').count();
    const nested = await page.locator('[data-testid="critique-reply"]').count();
    log(`  critique panel lists ${listed} direct and ${nested} nested`);
    check('the flat list shows only the 2 direct critiques', listed === 2);
    check('CONTROL: the depth-2 critique is in the list as a REPLY (row 6.19), so the '
      + `count above is scoped rather than lucky (${nested})`, nested === 1);

    log('\n=== The spatial view shows the structure the list cannot ===');
    await page.getByRole('button', { name: 'View critique structure', exact: true }).click();
    // EITHER OUTCOME — see the 6.25 control at the end of this file. The
    // structure walk can now settle into a failure instead of a tree, and a
    // wait that only admits the tree turns a conductor that will not answer
    // into a harness that stops reporting rather than one that reports.
    await page.waitForSelector(
      '[data-testid="graph-summary"], [data-testid="critique-graph-failed"]',
      { timeout: 20000 },
    );
    const summaryEl = page.locator('[data-testid="graph-summary"]');
    const summary = (await summaryEl.count()) === 0 ? '' : await summaryEl.innerText();
    log(`  ${summary}`);
    check('all 4 critiques are found, not just the direct 2', /4 critiques/.test(summary));
    check('depth is reported as 3 levels', /3 levels deep/.test(summary));
    check('and it says plainly what the list cannot show',
      /critiques of critiques the list view cannot show/.test(summary));

    log('\n=== Accessibility: the reason this is SVG, not canvas ===');
    const nodes = page.locator('.graph-node');
    const nodeCount = await nodes.count();
    check('every node is a real DOM element (claim + 4 critiques)', nodeCount === 5);
    const focusable = await page.locator('.graph-node[tabindex="0"]').count();
    check('every node is keyboard-focusable', focusable === nodeCount);
    const labelled = await page.locator('.graph-node[aria-label]').count();
    check('every node carries an accessible label', labelled === nodeCount);
    const firstLabel = await nodes.nth(1).getAttribute('aria-label');
    log(`  a node label: ${firstLabel?.slice(0, 78)}…`);
    check('labels name the mode and depth, not just "node"',
      /critique at level \d/.test(firstLabel ?? ''));
    // Focus really lands on it — tabindex alone can be inert.
    await nodes.nth(1).focus();
    check('a node genuinely takes keyboard focus',
      await nodes.nth(1).evaluate((el) => el === document.activeElement));
    const listPeer = await page.locator('[data-testid="graph-node-list"] li').count();
    check('the text peer carries the same 4 critiques', listPeer === 4);
    // Reading ORDER, not just presence. Layout emits nodes post-order —
    // children before parents — so building this list from the placed
    // array presents the thread deepest-reply-first. That shipped
    // briefly and is the defect this assertion exists to catch, because
    // for a screen-reader user this list IS the view.
    const depths = await page.locator('[data-testid="graph-node-list"] li')
      .evaluateAll((els) => els.map((el) => Number(el.dataset.depth)));
    log(`  peer list depths in order: ${depths.join(', ')}`);
    check('the text peer reads top-down, parent before reply',
      JSON.stringify(depths) === JSON.stringify([1, 2, 3, 1]));

    log('\n=== Invariant #1: size encodes nothing ===');
    const radii = await nodes.evaluateAll((els) => els.map((el) => el.getAttribute('r')));
    log(`  radii: ${[...new Set(radii)].join(', ')}`);
    check('every node has an identical radius — no node is drawn "bigger"',
      new Set(radii).size === 1);

    log('\n=== §4.4: layout is deterministic ===');
    const coordsOf = () => nodes.evaluateAll(
      (els) => els.map((el) => `${el.getAttribute('cx')},${el.getAttribute('cy')}`).join('|'),
    );
    const first = await coordsOf();
    // Close and reopen: a force-directed layout would reseed and move.
    await page.getByRole('button', { name: 'Hide structure', exact: true }).click();
    await page.getByRole('button', { name: 'View critique structure', exact: true }).click();
    await page.waitForSelector('[data-testid="graph-summary"]', { timeout: 20000 });
    const second = await coordsOf();
    check('the same argument renders at identical coordinates', first === second);

    // ROW 6.25. `loadCritiqueTree` had no catch and is `await`ed from an
    // onclick, so a read that threw became an unhandled rejection AND left
    // the panel saying "Reading the critique structure…" with nothing in
    // flight. It now settles into `critiqueTreeFailed`, which this control
    // keeps off a structure that demonstrably rendered — the node count above
    // is the anchor, so this cannot pass against a panel that was never open.
    check('CONTROL: a structure that rendered its nodes does not also report a failure',
      nodeCount === 5
      && (await page.locator('[data-testid="critique-graph-failed"]').count()) === 0);

    check('no uncaught page errors', errors.length === 0);
    if (errors.length) log(`  errors: ${errors.join(' | ')}`);

    if (process.env.GRAPH_SCREENSHOT) {
      await page.screenshot({ path: process.env.GRAPH_SCREENSHOT, fullPage: true });
      log(`  screenshot written to ${process.env.GRAPH_SCREENSHOT}`);
    }
  } finally {
    await browser.close();
    preview.kill();
  }

  log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
