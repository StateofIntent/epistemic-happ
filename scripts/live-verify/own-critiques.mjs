#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/own-critiques.mjs — an author can find out that somebody
// disagreed with them, and the number stays a fact rather than becoming a
// score. Open-work 6.15, the PULL half.
//
// WHY THIS EXISTS, in a participant's own words, filed hours after they wrote
// the first critique in this protocol's history: "when someone posts a
// critique, how does the author of the claim find out? If there's no
// notification, discussions might fade simply because the author doesn't know
// someone responded, nor does the one who wrote the critique."
//
// MEASURED, AND IT IS AN ASYMMETRY RATHER THAN A MISSING FEATURE.
// `create_claim` emits a signal; `create_critique` emits nothing at all. So
// the one act this protocol exists to carry is the one act that announces
// itself to nobody. The first two critiques in the pilot were both delivered
// over Telegram — a disagreement protocol whose disagreements arrive by side
// channel has the side channel as a dependency.
//
// WHAT IS UNDER TEST IS THE PULL HALF ONLY. Push is 6.15's `[D]` and stays
// undecided. Nothing here sends a signal or subscribes to one.
//
// THE REASON GIVEN HERE WAS FALSE AND IS CORRECTED (2026-11-14). It said
// `send_peer_signal` writes a permanent CapGrant per call on the SENDER's
// chain, so notifying on every critique would grow a critic's own chain in
// proportion to how much they disagree. That is `peer-signal.mjs`'s NEGATIVE
// EVIDENCE entry `CH` — a defect somebody INJECTED and watched go 2 red — read
// as if it were the measurement. That harness asserts the opposite, and
// `send_peer_signal` plainly writes nothing: one entry per agent to open a
// channel, once, and zero per signal thereafter. **Push is not the expensive
// branch.** What keeps the `[D]` open is the Invariant 1 question — whether an
// attention ordering is a merit ordering — which is what this file's own
// subject is, and it is untouched by the cost correction.
//
// THE TWO FAKES THIS FILE HAS TO DEFEAT, and neither is a blank screen.
//
//   1. A COUNT OF WHAT THE BROWSER ALREADY HOLDS. `critiquesByClaim` is
//   populated whenever a reader expands a claim's critique panel, so a count
//   read from that map looks right as soon as anybody uses the screen
//   normally. Here the critiques are authored by a SECOND agent and no panel
//   is ever opened, so a client-side count is zero and the real one is not.
//
//   2. A ZERO THAT MEANS "NOT ASKED YET". This is 6.13's defect in a second
//   costume, and on this screen it is worse: rendering an unread count as 0
//   tells an author nobody disagreed with them, at the moment the screen
//   opens, before any read has returned. A MutationObserver records every
//   state the critiqued claim's card passes through, so the assertion is
//   about what was EVER displayed rather than what is displayed now — a
//   sampled check would race the read and pass either way.
//
// AND INVARIANT 1, WHICH IS WHY THREE OF THESE CHECKS ARE CONTROLS. The
// By Author tab's own comment used to say it shows NO count, deliberately,
// because "a claim tally next to a person is a great deal closer to karma
// than an adoption tally next to a critique type". A critique count is a
// different object — attached to a claim, not a person — but only while three
// things hold at once, so each is asserted: it appears ONLY on the reader's
// own claims (checked against a claim of ANOTHER agent that really does have
// a critique on it, so the screen is declining to show data it holds rather
// than lacking it), nothing is ordered by it, and no total is taken across
// claims.
//
// Prereqs: a CLEAN sandbox (scripts/sandbox.sh clean && scripts/sandbox.sh
// start) and a UI build — scripts/pack-webhapp.sh does both in the right
// order. A stale `dist/` means you are verifying the previous version of the
// UI and everything here will pass.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing five times, and
// TWO INJECTIONS PASSED, which turned out to be the most useful runs. 18
// checks green on a live conductor; every figure below is a real run.
//
//   X. THE IMPOSTOR: the counts taken from `critiquesByClaim` — the map the
//   critique panel fills — instead of from `get_critiques_for`.
//   Result: 4 red. Both numbers came back as `0`, the wire check saw no
//   `get_critiques_for`, and the observer check fell with them. This is the
//   failure the whole file is shaped around: that screen is correct the
//   moment anybody expands a panel, and silently tells every author nobody
//   disagreed with them until they do.
//
//   Z. An unread count rendered as zero — `myCritiqueCounts.get(key) ?? 0`
//   in place of the `.has(key)` guard.
//   Result: exactly 1 red, the observer check, AND THE THREE CHECKS THAT
//   READ THE NUMBERS STAYED GREEN. They are sampled after the counts land,
//   where this defect has already corrected itself; the only trace it leaves
//   is a state the card passed THROUGH. A file without the observer would
//   certify a screen that tells authors they are unchallenged every time it
//   opens.
//
//   V. A total across claims appended to the framing note.
//   Result: 1 red — `the screen's framing still carries no digit at all`,
//   which is `author-scope-ui.mjs`'s own Invariant 1 assertion re-made here
//   because this is the change that would have broken it.
//
//   W2. Sorted by how much disagreement each claim attracted, at RENDER
//   time. Result: 1 red, the ordering check — and it reds ONLY because the
//   fixture publishes least-critiqued first. See the publish-order comment
//   in the setup: the first version of this file published two-then-one-then
//   -none, which made the wire order identical to descending-count order and
//   the ordering check green against both a sorted screen and an unsorted
//   one. The harness said so itself, and that is the only reason it was
//   caught. There is now a vacuity control asserting the two orders differ,
//   placed before the assertion it protects.
//
//   Y2. BOTH halves of the self-only restriction removed — the loader's
//   `agentB64 === me` test and the card's `mineForCount` gate.
//   Result: 1 red, the control reading another agent's listing. Invariant 1
//   holds here at two independent layers.
//
// AND THE TWO THAT PASSED, which are findings rather than gaps:
//
//   Y. The loader's restriction removed ALONE — counts fetched for whichever
//   agent is being viewed. PASSED, every check green. The card's own
//   `mineForCount` gate still refuses to render them, so the restriction is
//   defended twice and no single-layer removal can leak a count. Y2 above is
//   the same injection with both layers removed, and it reds. Recorded
//   because a reader of this file should not conclude from Y2 that one gate
//   is doing the work.
//
//   W. The same sort as W2, applied in `loadClaimsByAuthor` instead of at
//   render. PASSED, and for a reason worth knowing: `myCritiqueCounts` is
//   still EMPTY at that point — the counts are fetched after the claims are
//   on screen, deliberately, so a slow count degrades the answer rather than
//   delaying it. A sort there reads every count as 0 and is a no-op. So the
//   only place this screen can acquire a disagreement ordering is render
//   time, which is where the assertion points.
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { CHROMIUM } from './chromium.mjs';

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
const AGENT2_APP_ID = 'epistemic-resonance-happ-owncritiques2';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;
const PREVIEW_PORT = 4195;

const STAMP = Date.now();
const DOMAIN = `OwnCritiques${STAMP}`;
// Three claims with three different answers, which is what makes "says its
// own number" separable from "says a number".
const CONTENT_TWO = 'Mine, and two people disagreed with it.';
const CONTENT_ONE = 'Mine, and one person disagreed with it.';
const CONTENT_NONE = 'Mine, and nobody has disagreed with it.';
const CONTENT_THEIRS = "Another agent's claim, which also has a critique on it.";

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
      if (cell?.type === CellType.Provisioned || cell?.type === CellType.Cloned) {
        cellIds.push(cell.value.cell_id);
      }
    }
  }
  if (cellIds.length === 0) throw new Error(`App "${appId}" has no provisioned or cloned cells.`);
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { me: cellIds[0][1], call };
}

const claim = (agent, content) => agent.call('create_claim', {
  content, domain: DOMAIN, confidence: 'Moderate', semantic_tags: [],
  author: agent.me, timestamp: nowMicros(), evidence_hashes: [], attestation_policy: null,
});

const critique = (agent, targetHash, content) => agent.call('create_critique', {
  target: targetHash, target_type: 'Claim', critique_mode: 'Methodological',
  content, author: agent.me, timestamp: nowMicros(),
  replication_attempted: false, evidence_hashes: [], species: null,
});

/** `create_claim` returns an ActionHash, and a critique targets an ENTRY
 * hash, so the hashes are read back off the DHT rather than taken from the
 * write. That is not a workaround: reading them back is also how the wire
 * ORDER is obtained, which section 4's ordering check is asserted against. */
async function claimsOnTheWire(agent, who, contents) {
  const records = await agent.call('get_claims_by_agent', who);
  const out = [];
  for (const r of records) {
    const raw = r.entry?.Present?.entry ?? r.entry;
    const blob = Buffer.from(raw).toString('latin1');
    const hit = contents.find((c) => blob.includes(c));
    if (hit) out.push({ content: hit, entryHash: r.signed_action.hashed.content.data.entry_hash });
  }
  return out;
}

const textOf = async (page, selector) => {
  const loc = page.locator(selector);
  return (await loc.count()) ? await loc.first().innerText() : '';
};

/** The count a card is displaying, or null when it is displaying none —
 * which is the state this file most needs to tell apart from zero. */
async function countOn(page, content) {
  return page.evaluate((needle) => {
    for (const card of document.querySelectorAll('.claim-card')) {
      if (!card.textContent.includes(needle)) continue;
      const el = card.querySelector('[data-testid="critique-count"]');
      return el ? { count: el.dataset.count, text: el.textContent } : null;
    }
    return 'no-such-card';
  }, content);
}

async function main() {
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const agent1 = await connectApp(admin, APP_ID);
  log(`agent1 (the UI's own) = ${b64(agent1.me).slice(0, 12)}…`);

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
  log(`agent2 (the critic)   = ${b64(agent2.me).slice(0, 12)}…\n`);

  if (b64(agent1.me) === b64(agent2.me)) {
    log('  SETUP FAILED: both slots resolved to the same agent key, so "the critiques');
    log('  came from somebody else" could not fail. Refusing to run.');
    process.exit(1);
  }

  // PUBLISHED LEAST-CRITIQUED FIRST, AND THAT ORDER IS LOAD-BEARING.
  // `get_claims_by_agent` returns them in publish order, so publishing
  // two-then-one-then-none would make the wire order identical to
  // descending-count order and section 4's ordering check could never tell a
  // sorted screen from an unsorted one. The first run of this file did
  // exactly that and said so, which is the only reason it was noticed — the
  // check was green and meaningless.
  log('agent1 publishes three claims, LEAST-critiqued first ...');
  await claim(agent1, CONTENT_NONE);
  await claim(agent1, CONTENT_TWO);
  await claim(agent1, CONTENT_ONE);
  log("agent2 publishes a claim of its own ...");
  await claim(agent2, CONTENT_THEIRS);

  const mine = await claimsOnTheWire(agent1, agent1.me, [CONTENT_TWO, CONTENT_ONE, CONTENT_NONE]);
  const theirs = await claimsOnTheWire(agent2, agent2.me, [CONTENT_THEIRS]);
  const truthOrder = mine.map((c) => c.content);
  log(`get_claims_by_agent returns agent1's ${mine.length} claim(s); wire order: `
    + truthOrder.map((c) => c.split(' ')[2]).join(', '));
  if (mine.length !== 3 || theirs.length !== 1) {
    log(`  SETUP FAILED: decoded ${mine.length} of agent1's claims and ${theirs.length} of agent2's.`);
    log('  If the code looks correct the conductor is on a STALE BUILD —');
    log('  scripts/pack-webhapp.sh, then scripts/sandbox.sh clean && start.');
    process.exit(1);
  }
  const hashOf = (content) => mine.find((c) => c.content === content).entryHash;

  // THE CRITIQUES ARE AGENT2'S, and no panel is ever opened in the browser,
  // so nothing this page holds in memory could produce these numbers.
  log('agent2 critiques the first claim twice and the second once ...');
  await critique(agent2, hashOf(CONTENT_TWO), 'First disagreement.');
  await critique(agent2, hashOf(CONTENT_TWO), 'Second disagreement.');
  await critique(agent2, hashOf(CONTENT_ONE), 'The only disagreement.');
  // The control for the self-only restriction: agent2's OWN claim really does
  // have a critique on it, so a screen showing no count for it is declining
  // to show data rather than lacking any.
  log("agent1 critiques agent2's claim, so the control has data behind it ...");
  await critique(agent1, theirs[0].entryHash, 'Disagreeing in the other direction.');
  log('');

  log('Starting vite preview (production bundle) ...');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: new URL('../../mobile-ui/', import.meta.url).pathname, stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 3000));

  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  // Two instruments, installed before the app loads so neither depends on
  // production code cooperating: the wire-watcher from author-scope-ui.mjs,
  // and an observer recording every state the critiqued claim's card passes
  // through. See fake 2 in the header for why the second cannot be a sample.
  await page.addInitScript((needle) => {
    window.__zomeCalls = [];
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      try {
        let bytes = null;
        if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
        else if (ArrayBuffer.isView(data)) bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        if (bytes) {
          const text = new TextDecoder('latin1').decode(bytes);
          for (const fn of ['get_critiques_for', 'get_claims_by_agent']) {
            if (text.includes(fn)) window.__zomeCalls.push(fn);
          }
        }
      } catch { /* observation must never break the page */ }
      return send.call(this, data);
    };

    window.__critiquedCardStates = [];
    const observer = new MutationObserver(() => {
      for (const card of document.querySelectorAll('.claim-card')) {
        if (card.textContent.includes(needle)) window.__critiquedCardStates.push(card.textContent);
      }
    });
    const start = () => observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
  }, CONTENT_TWO);

  try {
    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });

    // ---- 1. The route to your own listing --------------------------------
    log('=== 1. Your own claims, without pasting your own key ===');
    await page.getByRole('button', { name: 'By Author', exact: true }).click();
    check('the tab offers your own claims as an affordance',
      (await page.locator('[data-testid="author-mine"]').count()) === 1);
    await page.getByTestId('author-mine').click();
    await page.waitForTimeout(3000);
    check('it arrives carrying your own key rather than an empty box',
      (await page.locator('[data-testid="author-key-input"]').inputValue()) === b64(agent1.me));
    const listText = await textOf(page, '[data-testid="author-claim-list"]');
    check('and lists your own claims',
      listText.includes(CONTENT_TWO) && listText.includes(CONTENT_ONE) && listText.includes(CONTENT_NONE));

    // ---- 2. THE CENTRAL CHECK --------------------------------------------
    //
    // These numbers cannot come from anything this browser holds: the
    // critiques are agent2's and no critique panel has been opened.
    log('\n=== 2. How many critiques came back, per claim ===');
    const twoCount = await countOn(page, CONTENT_TWO);
    const oneCount = await countOn(page, CONTENT_ONE);
    const noneCount = await countOn(page, CONTENT_NONE);
    check(`the twice-critiqued claim says two (${JSON.stringify(twoCount)})`,
      twoCount && twoCount.count === '2');
    check(`the once-critiqued claim says its OWN number, not the first one's (${oneCount && oneCount.count})`,
      oneCount && oneCount.count === '1');
    check('the uncritiqued claim says so rather than saying nothing',
      noneCount && noneCount.count === '0' && /no critiques/i.test(noneCount.text));
    const zomeCalls = await page.evaluate(() => window.__zomeCalls ?? []);
    check('the page put get_critiques_for on the wire — the count is a DHT read, '
      + 'not a tally of what this browser already held',
      zomeCalls.includes('get_critiques_for'));
    check('CONTROL: the wire-watcher works — it also saw the claims read',
      zomeCalls.includes('get_claims_by_agent'));

    // ---- 3. Absence is not zero ------------------------------------------
    log('\n=== 3. An unread count is never displayed as nobody disagreeing ===');
    const states = await page.evaluate(() => window.__critiquedCardStates ?? []);
    check(`the critiqued card was observed in ${states.length} state(s), so the observer ran`,
      states.length > 0);
    check('and in NONE of them did it claim nobody had disagreed',
      states.length > 0 && !states.some((t) => /no critiques/i.test(t)));

    // ---- 4. Invariant 1, which is why these are controls -----------------
    log('\n=== 4. A fact about a claim, and not a score for a person ===');
    const counted = await page.evaluate(() => ({
      all: document.querySelectorAll('[data-testid="critique-count"]').length,
      onCards: document.querySelectorAll('.claim-card [data-testid="critique-count"]').length,
    }));
    check(`CONTROL: every count is attached to a claim, so no total stands apart `
      + `from them (${counted.onCards}/${counted.all})`,
      counted.all > 0 && counted.all === counted.onCards);
    const note = await textOf(page, '[data-testid="author-note"]');
    check('CONTROL: the screen\'s framing still carries no digit at all', !/\d/.test(note));
    const screenOrder = await page.evaluate((contents) => {
      const seen = [];
      for (const card of document.querySelectorAll('.claim-card')) {
        const hit = contents.find((c) => card.textContent.includes(c));
        if (hit && !seen.includes(hit)) seen.push(hit);
      }
      return seen;
    }, [CONTENT_TWO, CONTENT_ONE, CONTENT_NONE]);
    // THE VACUITY CONTROL COMES FIRST, for the reason this directory already
    // records under a different heading: an empty screen never overflows. If
    // the wire order happens to equal descending-count order, the assertion
    // below passes on a screen that sorts by disagreement and on one that
    // does not, and nothing distinguishes them. That is not hypothetical —
    // it is what the first run of this file reported.
    const byCountDesc = [CONTENT_TWO, CONTENT_ONE, CONTENT_NONE];
    check('CONTROL: the wire order is NOT descending-count order, so the check '
      + 'below can tell a sorted screen from an unsorted one',
      JSON.stringify(truthOrder) !== JSON.stringify(byCountDesc));
    check('the claims are in the order the DHT returned them, not ordered by how '
      + 'much disagreement each attracted',
      JSON.stringify(screenOrder) === JSON.stringify(truthOrder));

    // ---- 5. THE SELF-ONLY RESTRICTION, against data that exists ---------
    //
    // agent2's claim really does carry a critique. If a count appears here,
    // the screen has become comparable across people, which is the object
    // the By Author tab's Invariant 1 note refuses.
    log('\n=== 5. Somebody else\'s claims carry no count, though the data is there ===');
    const theirCritiques = await agent1.call('get_critiques_for', theirs[0].entryHash);
    check(`SETUP: agent2's own claim really has a critique on it (${theirCritiques.length})`,
      theirCritiques.length === 1);
    await page.locator('[data-testid="author-key-input"]').fill(b64(agent2.me));
    await page.getByTestId('author-load').click();
    await page.waitForTimeout(3000);
    const theirsText = await textOf(page, '[data-testid="author-claim-list"]');
    check("CONTROL: their claim is on screen, so the check below is not about an empty list",
      theirsText.includes(CONTENT_THEIRS));
    check('CONTROL: and it carries NO critique count, so there is no second number '
      + 'to compare a person against',
      (await page.locator('[data-testid="critique-count"]').count()) === 0);

    check('CONTROL: the page raised no uncaught errors throughout',
      pageErrors.length === 0);
    if (pageErrors.length) for (const e of pageErrors) log(`    pageerror: ${e}`);
  } finally {
    await browser.close();
    preview.kill();
  }

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — an author can reach their own claims in one click and');
    log('see how many critiques came back on each, read from the DHT rather than');
    log('from this browser; an unread count is never shown as nobody disagreeing;');
    log('and the number appears on nobody else\'s claims, orders nothing, and is');
    log('never totalled.');
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(1); });
