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
// AND WHO WROTE EACH NODE (row 6.18's second half). The list view got a
// byline when that row opened and this view did not, so it labelled every
// node by mode alone — five people's objections reading *Logical,
// Evidential, …*, which is the complaint the row was opened with, intact in
// the one view whose subject is who is answering whom. Asserting that needed
// a SECOND AGENT in this fixture: see AGENT2_APP_ID below for why a
// single-agent thread cannot tell the impostor defect from correct
// behaviour, and the negative evidence below for the measurement.
//
// Two classes are shared with the list view's byline (`link-button
// critique-author`) and the test ids deliberately are NOT —
// `graph-node-author`, `graph-node-relation`. That is the `.critique-item`
// lesson this very file taught the suite: a shared selector is how an
// assertion silently starts counting somebody else's elements. Checked both
// ways — nothing in `reading-a-thread.mjs` selects by those classes, and the
// graph mounts on the claim card rather than inside a `.critique-item`.
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
//   Regression injected (row 6.18, second half): the text-peer byline rendered
//   from `connection.myAgentPubKey` — who is LOOKING — instead of
//   `node.entry.author`, who WROTE. This is the exact impostor defect 6.18
//   measured in the LIST view, where it turned only TWO checks red because
//   that fixture had one agent and the viewer WAS the claim's author.
//   Result: FIVE red — the distinct-byline control (1 distinct over four
//   nodes), the level-1 objection's attribution, the control that agent2's
//   nodes carry no marker (every node read "you"), the Invariant #1 check
//   that nothing is grouped by author (1111 rather than 2112), and the key
//   the By Author tab arrives carrying. The difference is the second agent,
//   which is why this fixture now installs one.
//
//   Regression injected: `flattenPreOrder` passing `null` as the parent.
//   Result: exactly ONE red — the level-3 node no longer says it is the
//   critique's author. The relation that only exists below depth 1 is the
//   only thing the parent is carried for, and nothing else moved.
//
//   Regression injected: the SVG `aria-label` reverted to mode and depth
//   alone, leaving the byline only in the text peer.
//   Result: TWO red. The accessible label is the whole reason this view is
//   SVG rather than canvas, so a byline a screen-reader user cannot hear is
//   not a byline this view has.
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
// A SECOND AGENT, AND ROW 6.18 IS WHY IT IS NOT OPTIONAL. This fixture wrote
// every entry as `author: me`, so the impostor defect that row measured —
// a byline rendered from `myAgentPubKey`, who is LOOKING, rather than from
// `entry.author`, who WROTE — is indistinguishable from correct behaviour
// here: every byline would be right by coincidence. The complaint that opened
// the row is *"if 5 people would enter, you wouldnt know if you're speaking to
// the same or others"*, and a single-agent thread cannot answer it.
const AGENT2_APP_ID = 'epistemic-resonance-happ-graph2';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;
const PREVIEW_PORT = 4176;
const DOMAIN = `Graph${Date.now()}`;

const nowMicros = () => Date.now() * 1000;
const log = (...a) => console.log(...a);

const b64 = (u8) => Buffer.from(u8).toString('base64');
/** The same twelve characters the UI puts in a byline — NOT from the front.
 *  Row 6.23's mechanical half: every Holochain agent key's base64 begins
 *  `hCAk`, a multihash type tag, so `slice(0, 12)` spent a third of every
 *  byline on a constant where the eye lands. This mirror moves with the UI
 *  deliberately — if the two disagree, every per-node byline check below reds,
 *  which is what makes the offset tested rather than declared. */
const HASH_TAG_CHARS = 4;
const short = (u8) => `${b64(u8).slice(HASH_TAG_CHARS, HASH_TAG_CHARS + 12)}\u2026`;

let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

async function connectApp(admin, appId) {
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: appId });
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
  if (cellIds.length === 0) throw new Error(`App "${appId}" has no provisioned or cloned cells.`);
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  return {
    app,
    me: cellIds[0][1],
    call: (fn, payload) => app.callZome({
      role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload,
    }),
  };
}

/** Refuse rather than run a fixture that is not the one the checks assume.
 *  Two agents on one conductor still reach each other through the DHT, so a
 *  cross-author critique has to wait for its target to be readable BY THE
 *  AGENT ABOUT TO CRITIQUE IT. A timeout here is a setup failure and says so;
 *  the alternative is a tree of the wrong shape quietly reddening six count
 *  assertions that have nothing to do with what broke. */
async function waitUntil(what, probe, timeoutMs = 20000) {
  const start = Date.now();
  for (;;) {
    let ok = false;
    try { ok = await probe(); } catch { ok = false; }
    if (ok) return;
    if (Date.now() - start > timeoutMs) {
      log(`  SETUP FAILED: ${what} did not become readable within ${timeoutMs}ms.`);
      log('  Refusing to run: the checks below assert a specific tree and a specific');
      log('  byline on each node, and neither would mean anything against a partial seed.');
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function seed() {
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const agent1 = await connectApp(admin, APP_ID);
  log(`agent1 (the UI's own, and the claim's author) = ${short(agent1.me)}`);

  const apps = await admin.listApps({});
  if (!apps.some((a) => a.installed_app_id === AGENT2_APP_ID)) {
    const agent2Pub = await admin.generateAgentPubKey();
    await admin.installApp({
      source: { type: 'path', value: HAPP_PATH },
      agent_key: agent2Pub,
      installed_app_id: AGENT2_APP_ID,
    });
    await admin.enableApp({ installed_app_id: AGENT2_APP_ID });
  }
  const agent2 = await connectApp(admin, AGENT2_APP_ID);
  log(`agent2 (the objector)                        = ${short(agent2.me)}`);

  if (b64(agent1.me) === b64(agent2.me)) {
    log('  SETUP FAILED: both slots resolved to the same agent key, so "this node\u2019s');
    log('  byline names who wrote THIS node" could not fail. Refusing to run.');
    process.exit(1);
  }

  log(`\nSeeding a three-level argument between two people in ${DOMAIN} ...`);
  await agent1.call('create_claim', {
    content: 'Loaded carries reduce recurrence more than rest does.',
    domain: DOMAIN, author: agent1.me, timestamp: nowMicros(),
    evidence_hashes: [], confidence: 'Moderate', semantic_tags: [], source_mew: null,
  });
  const claims = await agent1.call('get_claims_by_domain', DOMAIN);
  const claimHash = claims[0].signed_action.hashed.content.data.entry_hash;

  await waitUntil("agent1's claim, to agent2",
    async () => (await agent2.call('get_claims_by_domain', DOMAIN)).length > 0);

  // A critique targets an entry hash (SPEC §5.4), so critiquing a
  // critique means reading back its entry hash and targeting that.
  const critiqueOn = async (agent, targetHash, targetType, mode, content) => {
    await agent.call('create_critique', {
      target: targetHash, target_type: targetType, critique_mode: mode,
      content, author: agent.me, timestamp: nowMicros(),
      replication_attempted: false, evidence_hashes: [], species: null,
    });
    const list = await agent.call('get_critiques_for', targetHash);
    return list[list.length - 1].signed_action.hashed.content.data.entry_hash;
  };

  // WHO WROTE WHAT IS THE FIXTURE, not decoration on it. agent2 objects;
  // agent1 — the claim's own author — DEFENDS, which is the exact thing the
  // participant who opened 6.18 said they could not see; and then agent1
  // concedes against their own defence, which is a critique whose author IS
  // its parent's author, the one relation that cannot exist at depth 1 and so
  // cannot be shown by the flat list at all.
  const l1 = await critiqueOn(agent2, claimHash, 'Claim', 'Methodological',
    'Compared against what rest protocol, and over what follow-up window?');

  await waitUntil("agent2's objection, to agent1",
    async () => (await agent1.call('get_critiques_for', claimHash)).length > 0);

  const l2 = await critiqueOn(agent1, l1, 'Critique', 'Evidential',
    'The cited trial does specify both \u2014 twelve weeks, standardised rest arm.');
  await critiqueOn(agent1, l2, 'Critique', 'Logical',
    'That trial reports adherence, not recurrence, so it cannot settle this.');

  // A second branch at depth 1, so the layout has real breadth as well
  // as depth and a single-child chain is not the only case exercised.
  await critiqueOn(agent2, claimHash, 'Claim', 'Experiential',
    'In my practice the effect held only where load was progressed slowly.');

  log('  seeded: claim (agent1) -> 2 critiques (agent2), one branch 3 levels deep');
  log('  with agent1 defending at level 2 and conceding to itself at level 3.\n');
  return { admin, agent1, agent2 };
}

async function main() {
  const { admin, agent1, agent2 } = await seed();
  // THE APP SOCKET STAYS OPEN, AND THAT IS A FIX RATHER THAN A CHANGE OF MIND.
  // The §7b.2 probe below — the whole point of which is to say whether the
  // seeded critiques are readable when the selector times out — called a
  // `call` that was declared `const` INSIDE `seed()`, and did it after this
  // line had closed the only socket it could have used. So the diagnostic
  // that exists to explain a failure would have thrown a ReferenceError and
  // replaced the explanation with a stack trace, on the one path where it
  // runs. Invisible on every green run, which is why it survived.
  //
  // Leaving it open is safe here for the reason row 1.29 measured: an open
  // `@holochain/client` websocket is a REF'D handle nothing in this suite
  // closes, so a harness that ends by falling off the bottom of `main` hangs
  // for ever — and this one ends on `process.exit(failures === 0 ? 0 : 1)`,
  // which is the form that cannot.
  const call = agent1.call;
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

    // ---- ROW 6.18, SECOND HALF: every node says who wrote it ------------
    //
    // The list view got a byline when 6.18 opened; this one kept labelling
    // nodes by mode alone, so five people's objections read *Logical,
    // Evidential, …* and a reader who opened the structure view was back
    // where the row started. Every assertion here is anchored to the key of
    // the agent that ACTUALLY WROTE that node, which is the only shape that
    // can fail against the impostor defect 6.18 measured — a byline rendered
    // from `myAgentPubKey`, who is looking, rather than from `entry.author`,
    // who wrote.
    log('\n=== Who wrote each node (6.18, second half) ===');
    const rows = await page.locator('[data-testid="graph-node-list"] li')
      .evaluateAll((els) => els.map((el) => ({
        depth: Number(el.dataset.depth),
        mode: el.querySelector('.critique-mode')?.textContent ?? '',
        byline: el.querySelector('[data-testid="graph-node-author"]')?.textContent ?? '',
        relation: el.querySelector('[data-testid="graph-node-relation"]')?.textContent ?? '',
      })));
    for (const r of rows) {
      log(`  L${r.depth} ${r.mode.padEnd(15)} ${r.byline}  ${r.relation}`);
    }
    const withByline = rows.filter((r) => r.byline.length > 0).length;
    check(`every node in the text peer carries a byline (${withByline} of ${rows.length})`,
      withByline === 4 && rows.length === 4);
    // THE CONTROL THAT MAKES THE LINE ABOVE MEAN ANYTHING, and it is the
    // complaint itself: *"if 5 people would enter, you wouldnt know if you're
    // speaking to the same or others."* Four bylines all reading the same
    // string would satisfy "every node carries a byline" perfectly.
    const distinct = new Set(rows.map((r) => r.byline));
    check(`CONTROL: those are not one repeated string \u2014 ${distinct.size} distinct over four `
      + 'nodes, so this view can tell a disagreement between two people from one person talking',
      distinct.size === 2);

    const atDepth = (d) => rows.filter((r) => r.depth === d);
    const objection = atDepth(1).find((r) => r.mode === 'Methodological');
    const defence = atDepth(2)[0];
    const concession = atDepth(3)[0];
    check('the level-1 objection is attributed to agent2, who wrote it \u2014 not to the '
      + `viewer (${objection?.byline})`,
      objection?.byline === short(agent2.me));
    check(`the level-2 defence is attributed to agent1 (${defence?.byline})`,
      defence?.byline === short(agent1.me));

    // THE RELATIONS. 6.18's participant asked to see "if an author responded",
    // so the author DEFENDING is the headline; the third relation is the one
    // the flat list structurally cannot show, because a critique whose author
    // is its PARENT's author cannot exist at depth 1.
    check('the level-2 node says it is the CLAIM\u2019S AUTHOR answering \u2014 the thing the '
      + `row was opened about (${defence?.relation})`,
      /the claim\u2019s author/.test(defence?.relation ?? ''));
    check('the level-3 node says it is the CRITIQUE\u2019S AUTHOR \u2014 somebody answering an '
      + `objection to their own, which only exists below depth 1 (${concession?.relation})`,
      /the critique\u2019s author/.test(concession?.relation ?? ''));
    // AN UNMARKED NODE IS WHAT MAKES A MARKED ONE MEAN ANYTHING. Under the
    // impostor defect every node would read "you", so this reds there too.
    const strangers = rows.filter((r) => r.byline === short(agent2.me));
    check(`CONTROL: agent2\u2019s ${strangers.length} nodes are marked with nothing at all, so a `
      + 'marker is a statement rather than furniture',
      strangers.length === 2 && strangers.every((r) => r.relation === ''));

    // INVARIANT #1, WHICH 6.18's OWN BUILD DREW: a byline is attribution and
    // a tally is a score. Nothing here is grouped, ordered or totalled by
    // author — the seed interleaves the two authors deliberately, so a view
    // that gathered a thread by person would read agent2, agent2, agent1,
    // agent1 and go red.
    const bylineOrder = rows.map((r) => (r.byline === short(agent1.me) ? '1' : '2')).join('');
    log(`  byline order in reading order: ${bylineOrder}`);
    check(`nothing is grouped by author \u2014 the order is the argument's (${bylineOrder})`,
      bylineOrder === '2112');

    // AND IN THE ACCESSIBLE LABEL, not only in the text peer. The accessible
    // label is the entire reason this view is SVG rather than canvas, so a
    // byline that lives only in the list below is a byline a screen-reader
    // user does not get.
    const ariaLabels = await nodes.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
    const named = ariaLabels.filter((l) => /\bby [^:]+:/.test(l ?? '')).length;
    check(`every node's accessible label names who wrote it (${named} of ${ariaLabels.length})`,
      named === 5 && ariaLabels.length === 5);
    const claimLabel = await page.locator('.graph-node.claim').getAttribute('aria-label');
    log(`  the claim node: ${claimLabel?.slice(0, 70)}\u2026`);
    check('including the claim node, against its own author\u2019s key',
      (claimLabel ?? '').includes(`by ${short(agent1.me)}`));

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

    // LAST, BECAUSE IT NAVIGATES AWAY. The byline this was copied from was
    // BROKEN in exactly this way: 6.18 found the assessor's button calling
    // `loadClaimsByAuthor` without switching tabs, so it read an agent's
    // claims into a screen the reader was not on and looked inert. A byline
    // that leads nowhere is decoration.
    log('\n=== A byline leads somewhere (6.18) ===');
    await page.locator('[data-testid="graph-node-author"]').first().click();
    await page.waitForSelector('[data-testid="author-key-input"]', { timeout: 20000 })
      .catch(() => {});
    const landed = await page.locator('[data-testid="author-key-input"]').count() === 1;
    check('clicking a node\u2019s byline switches to the By Author tab', landed);
    const keyShown = landed
      ? await page.locator('[data-testid="author-key-input"]').inputValue()
      : '';
    check('and it arrives carrying the key of the agent whose node was clicked '
      + `(${keyShown.slice(0, 16)}\u2026)`,
      keyShown === b64(agent2.me));

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
