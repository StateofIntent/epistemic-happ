#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/author-scope-ui.mjs — the By Author surface, and the
// one read the surfacing residue had filed under a reason that did not
// describe it: `get_claims_by_agent`.
//
// WHY THIS EXISTS. README's surfacing caveat grouped four functions as
// "hash-addressed getters which a screen that already holds the record does
// not need to call". Three of them take an AnyDhtHash and the reasoning
// holds. `get_claims_by_agent` takes an AgentPubKey and returns Vec<Record>
// by following AgentToClaim links from an agent anchor — a DHT-wide query
// for everything one agent has published, which no screen holding a single
// record could possibly stand in for. It was the last genuinely unsurfaced
// read.
//
// THE FAILURE THIS FILE EXISTS TO CATCH is not a blank screen. It is a By
// Author tab that looks right while never calling the function at all —
// filtering the claims the Browse tab already loaded, client-side, by
// author. That screen is indistinguishable from a correct one on any
// single-domain test, and it would leave the read exactly as unsurfaced as
// it was while letting the checkbox be ticked.
//
// So the central check is built to break that impostor specifically: the
// agent publishes into TWO domains, the UI is made to load only the FIRST
// through Browse, and the By Author tab must then show the claim from the
// SECOND — which is on the DHT but has never been in the browser's memory.
// A client-side filter cannot produce it. Everything else here is
// supporting evidence for that one assertion.
//
// A SECOND AGENT IS NOT OPTIONAL, for the reason this directory records
// under a different heading: "everything this agent claimed" cannot be
// distinguished from "everything anyone claimed" on a conductor holding
// one agent's work. Agent 2 publishes into the same domain, and its claim
// must be absent from agent 1's listing. Without that control the headline
// check passes on a screen that simply lists everything.
//
// INVARIANT 1 IS ALSO CHECKED, because this is the screen where breaching
// it would be easiest. The invariant bars a canonical comparative score
// while requiring raw history stay "open and queryable", so the list itself
// is the shape it protects — but a claim tally rendered beside a person is
// a great deal closer to karma than the per-species adoption count that
// sets the precedent for showing numbers as facts. The screen shows no
// count, and this file asserts that no digit appears in its framing.
//
// Prereqs: a CLEAN sandbox (scripts/sandbox.sh clean && start) and a UI
// build — scripts/pack-webhapp.sh does both builds in the right order. A
// stale `dist/` means you are verifying the previous version of the UI and
// everything here will pass.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
//   Injection: the impostor described above. `loadClaimsByAuthor` filters
//   the claims Browse already loaded by author, client-side, and never
//   calls the zome function at all.
//   Result: three red — the claim from the unbrowsed domain was missing,
//   nothing named get_claims_by_agent went onto the wire, and the screen
//   listed one card where the conductor held four.
//   AND, THE POINT OF RUNNING IT: both scoping checks STAYED GREEN. "another
//   agent's claim in the same domain is absent" passed, and so did "asking
//   for agent2 returns agent2's claim and not agent1's". They passed
//   honestly — a client-side filter by author IS correctly scoped by author.
//   So the checks that look like they carry this harness's meaning cannot
//   detect the failure that matters, and a version of this file containing
//   only the obvious per-agent assertions would have certified a screen
//   that leaves the read exactly as unsurfaced as it was. What catches it
//   is the cross-domain claim and the wire-watcher, both of which exist for
//   no other reason.
//
//   Injection: a tally in the framing — "N claims." prepended to the note.
//   Result: exactly one red, the assertion that no digit appears in the
//   framing. The two checks that read the words STAYED GREEN: the screen
//   went on saying "this is a record, not a ranking" and "there is no score
//   here" with a count sitting immediately in front of both sentences. A
//   screen can state the invariant it is breaching, in the same paragraph,
//   without any contradiction a text search would find. Only the structural
//   assertion notices, which is why it is written against the presence of a
//   digit rather than against a phrase.
//
//   Injection: the tab bar's previous CSS put back — `display: flex` with
//   `flex: 1` on the tabs and no wrapping.
//   Result: all six layout checks red at 390, 360 and 320. Worth stating
//   plainly because this one is not hypothetical: that CSS was live, and
//   the assertions were written after measuring what it actually did rather
//   than to describe a fault imagined for the occasion.
//
//   Restored and re-run: 26 checks green.
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

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
const AGENT2_APP_ID = 'epistemic-resonance-happ-authorscope2';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;
const PREVIEW_PORT = 4189;

const STAMP = Date.now();
const DOMAIN_BROWSED = `AuthorBrowsed${STAMP}`;
const DOMAIN_UNBROWSED = `AuthorUnbrowsed${STAMP}`;
const CONTENT_BROWSED = 'Published into the domain the Browse tab loads.';
const CONTENT_UNBROWSED = 'Published into a domain the browser never loads.';
const CONTENT_AGENT2 = 'Published by a different agent, in the same domain.';

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

const nowMicros = () => Date.now() * 1000;
const b64 = (u8) => Buffer.from(u8).toString('base64');

async function connectApp(admin, appId) {
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: appId });
  const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      if (CellType.Provisioned in cell) cellIds.push(cell[CellType.Provisioned].cell_id);
      else if (CellType.Cloned in cell) cellIds.push(cell[CellType.Cloned].cell_id);
    }
  }
  if (cellIds.length === 0) throw new Error(`App "${appId}" has no provisioned or cloned cells.`);
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { me: cellIds[0][1], call };
}

const claim = (agent, domain, content) => agent.call('create_claim', {
  content, domain, confidence: 'Moderate', semantic_tags: [],
  author: agent.me, timestamp: nowMicros(), evidence_hashes: [], attestation_policy: null,
});

async function main() {
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const agent1 = await connectApp(admin, APP_ID);
  log(`agent1 (the UI's own) = ${b64(agent1.me).slice(0, 12)}…`);

  const apps = await admin.listApps({});
  if (!apps.some((a) => a.installed_app_id === AGENT2_APP_ID)) {
    const agent2Pub = await admin.generateAgentPubKey();
    await admin.installApp({
      path: HAPP_PATH, agent_key: agent2Pub,
      installed_app_id: AGENT2_APP_ID, membrane_proofs: {},
    });
    await admin.enableApp({ installed_app_id: AGENT2_APP_ID });
  }
  const agent2 = await connectApp(admin, AGENT2_APP_ID);
  log(`agent2 (the control)  = ${b64(agent2.me).slice(0, 12)}…\n`);

  if (b64(agent1.me) === b64(agent2.me)) {
    log('  SETUP FAILED: both slots resolved to the same agent key, so "another');
    log("  agent's claim is absent\" could not fail. Refusing to run.");
    process.exit(1);
  }

  log(`agent1 publishes into ${DOMAIN_BROWSED} and ${DOMAIN_UNBROWSED} ...`);
  await claim(agent1, DOMAIN_BROWSED, CONTENT_BROWSED);
  await claim(agent1, DOMAIN_UNBROWSED, CONTENT_UNBROWSED);
  log(`agent2 publishes into ${DOMAIN_BROWSED} ...`);
  await claim(agent2, DOMAIN_BROWSED, CONTENT_AGENT2);

  // The answer the screen will be measured against, read independently.
  const truth = await agent1.call('get_claims_by_agent', agent1.me);
  log(`get_claims_by_agent(agent1) returns ${truth.length} record(s) from the conductor.\n`);
  if (truth.length < 2) {
    log('  SETUP FAILED: agent1 should hold at least the two claims just published.');
    log('  If the code looks correct the conductor is on a STALE BUILD —');
    log('  scripts/pack-webhapp.sh, then scripts/sandbox.sh clean && start.');
    process.exit(1);
  }

  log('Starting vite preview (production bundle) ...');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: new URL('../../mobile-ui/', import.meta.url).pathname, stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 3000));

  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  // Every zome call the page makes, so "it called get_claims_by_agent" is
  // observed rather than inferred from what ended up on screen. Done by
  // wrapping WebSocket.send in the page BEFORE the app loads, rather than
  // by adding a reporting hook to the app: a check that depends on
  // production code cooperating is a check the production code can also
  // satisfy while doing nothing else. The frame is msgpack, and a msgpack
  // string is its bytes verbatim, so the function name is searchable in
  // the raw payload without decoding it.
  await page.addInitScript(() => {
    window.__zomeCalls = [];
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      try {
        let bytes = null;
        if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
        else if (ArrayBuffer.isView(data)) bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        if (bytes) {
          const text = new TextDecoder('latin1').decode(bytes);
          for (const fn of ['get_claims_by_agent', 'get_claims_by_domain']) {
            if (text.includes(fn)) window.__zomeCalls.push(fn);
          }
        }
      } catch { /* observation must never break the page */ }
      return send.call(this, data);
    };
  });

  try {
    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });

    // ---- 1. Browse loads ONE domain, so the browser's memory is known ----
    log('=== 1. The browser is given only the first domain ===');
    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await page.locator('.search-row input').first().fill(DOMAIN_BROWSED);
    await page.getByRole('button', { name: 'Load claims' }).first().click();
    await page.waitForTimeout(2500);
    const browsedText = await page.locator('.claim-list').first().innerText();
    check('the browsed domain is on screen', browsedText.includes(CONTENT_BROWSED));
    check('CONTROL: the unbrowsed domain is NOT on screen — the browser has never held it',
      !browsedText.includes(CONTENT_UNBROWSED));

    // ---- 2. The byline is the way in ------------------------------------
    log('\n=== 2. The author byline navigates, carrying the key with it ===');
    const bylineCount = await page.locator('.author-link').count();
    check('every claim card offers its author as an affordance', bylineCount >= 1);
    await page.locator('.author-link').first().click();
    await page.waitForTimeout(2500);
    const onAuthorTab = await page.locator('[data-testid="author-claim-list"]').count();
    check('clicking an author lands on the By Author tab', onAuthorTab === 1);
    const keyField = await page.locator('[data-testid="author-key-input"]').inputValue();
    check('the tab arrives pre-filled with that agent\'s key, not empty',
      keyField === b64(agent1.me));

    // ---- 3. THE CENTRAL CHECK -------------------------------------------
    //
    // A client-side filter over what Browse loaded cannot produce this,
    // because the browser has never seen it. Everything else in this file
    // is supporting evidence for this one line.
    log('\n=== 3. It is a real DHT read, not a filter of what was already loaded ===');
    const authorText = await page.locator('[data-testid="author-claim-list"]').innerText();
    check('the claim from the UNBROWSED domain is listed — the read reached the DHT',
      authorText.includes(CONTENT_UNBROWSED));
    check('the claim from the browsed domain is listed too', authorText.includes(CONTENT_BROWSED));
    const zomeCalls = await page.evaluate(() => window.__zomeCalls ?? []);
    check('the page actually put get_claims_by_agent on the wire',
      zomeCalls.includes('get_claims_by_agent'));
    check('CONTROL: the wire-watcher works — it also saw the domain read Browse made',
      zomeCalls.includes('get_claims_by_domain'));

    // ---- 4. It is one agent's record, not everyone's --------------------
    log('\n=== 4. CONTROL: it is scoped to the agent asked for ===');
    check("another agent's claim in the SAME domain is absent",
      !authorText.includes(CONTENT_AGENT2));
    const cardsShown = await page.locator('[data-testid="author-claim-list"] .claim-card').count();
    check(`the screen lists what the conductor returned (${cardsShown} shown, ${truth.length} returned)`,
      cardsShown === truth.length);

    // Asking for agent2 must return agent2's work, not agent1's — the same
    // check in the opposite direction, which is what makes it a scoping
    // result rather than a coincidence about ordering.
    await page.locator('[data-testid="author-key-input"]').fill(b64(agent2.me));
    await page.getByTestId('author-load').click();
    await page.waitForTimeout(2500);
    const agent2Text = await page.locator('[data-testid="author-claim-list"]').innerText();
    check("asking for agent2 returns agent2's claim", agent2Text.includes(CONTENT_AGENT2));
    check("asking for agent2 does NOT return agent1's claims",
      !agent2Text.includes(CONTENT_BROWSED) && !agent2Text.includes(CONTENT_UNBROWSED));

    // ---- 5. Invariant 1 --------------------------------------------------
    log('\n=== 5. Invariant 1: a record, never a ranking ===');
    const note = await page.locator('[data-testid="author-note"]').innerText();
    check('the screen says in words that this is not a ranking', /not a ranking/i.test(note));
    check('the screen says there is no score here', /no score/i.test(note));
    check('the framing carries NO number that could be read as a standing',
      !/\d/.test(note));
    const tabBar = await page.locator('.tab-bar').innerText();
    check('CONTROL: no tab offers a list of agents to compare',
      !/agents|leaderboard|top|rank/i.test(tabBar));

    // ---- 6. Absence is an answer ----------------------------------------
    log('\n=== 6. An agent with nothing published, and a key that is not one ===');
    const strangerKey = b64(await admin.generateAgentPubKey());
    await page.locator('[data-testid="author-key-input"]').fill(strangerKey);
    await page.getByTestId('author-load').click();
    await page.waitForTimeout(2500);
    check('an agent with no claims is reported as empty, not as a failure',
      (await page.locator('[data-testid="author-empty"]').count()) === 1);

    await page.locator('[data-testid="author-key-input"]').fill('not a key!!');
    await page.getByTestId('author-load').click();
    await page.waitForTimeout(1500);
    check('a malformed key is explained rather than swallowed',
      (await page.locator('[data-testid="author-error"]').count()) === 1);

    // ---- 7. The tab bar fits the screen it is on -----------------------
    //
    // Lives here because this is the file that added a sixth tab, and the
    // defect it guards was found by measuring the bar after doing so — but
    // it was NOT caused by that tab. Five already overflowed: at 390, 360
    // and 320 the bar clipped and the whole document scrolled sideways,
    // with `New Claim`, the primary write action, off the right edge. A
    // flex item will not shrink below its own min-content width, so
    // `flex: 1` never made the labels fit; it only hid the fact.
    //
    // Asserted against the DOCUMENT scrolling, not against a tab count or a
    // row count, because those are design choices that may change while
    // "the page does not scroll sideways on a phone" should not.
    log('\n=== 7. The tab bar fits, at the widths this UI is for ===');
    for (const width of [390, 360, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(300);
      const fits = await page.evaluate(() => {
        const bar = document.querySelector('.tab-bar');
        const barBox = bar.getBoundingClientRect();
        const tabs = [...bar.querySelectorAll('.tab')];
        return {
          barOverflows: bar.scrollWidth > bar.clientWidth + 1,
          clipped: tabs.some((t) => {
            const b = t.getBoundingClientRect();
            return b.left < barBox.left - 1 || b.right > barBox.right + 1;
          }),
          pageScrollsX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        };
      });
      check(`at ${width}px the page does not scroll sideways`, !fits.pageScrollsX);
      check(`at ${width}px every tab is inside the bar`, !fits.clipped && !fits.barOverflows);
    }
    await page.setViewportSize({ width: 390, height: 844 });

    check('CONTROL: the page raised no uncaught errors throughout',
      pageErrors.length === 0);
    if (pageErrors.length) for (const e of pageErrors) log(`    pageerror: ${e}`);
  } finally {
    await browser.close();
    preview.kill();
  }

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — get_claims_by_agent has a surface, it reaches the');
    log('DHT rather than filtering what was already on screen, it is scoped to');
    log('the agent asked for in both directions, and it reads as a record');
    log('rather than a ranking.');
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(1); });
