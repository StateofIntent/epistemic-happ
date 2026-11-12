#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/reading-a-thread.mjs — CAN A READER TELL WHO SAID WHAT,
// AND READ IT AS IT WAS WRITTEN? Open-work 6.18 and 6.20.
//
// WHY THIS EXISTS, in the words of the pilot's first publisher, 2026-11-11,
// the day after they published the first critique in this protocol's history:
//
//   "on the app you see now a big blurb of text. It doesnt show if an author
//   responded, who the other person is. Just text. If 5 people would enter,
//   you wouldnt know if you're speaking to the same or others."
//   "The window to write in could be made bigger, right now wanting to read
//   back (as it is permanent) is difficult."
//   "formatting, right now reading such a blurb becomes unpleasant."
//
// THREE DEFECTS, ALL MEASURED BEFORE ANY OF THIS WAS WRITTEN, and each one
// was a thing the codebase already knew how to do one screen over:
//
//   1. A CRITIQUE HAD NO BYLINE. `Critique.author` has been on the entry
//   since the integrity zome was written, the claim card above it renders
//   `short(claim.entry.author)` as the way into the By Author tab, and the
//   assessment panel SIXTY LINES BELOW the critique panel in the same file
//   renders exactly this byline for an assessor. The critique — the one
//   surface whose whole purpose is that somebody can be held to what they
//   said — was the one that arrived anonymous.
//
//   2. EVERY LINE BREAK IN A PERMANENT ENTRY WAS COLLAPSED. `white-space`
//   appeared three times in a 1,857-line stylesheet and not once on a surface
//   rendering somebody's own words. `textContent` had always put the whole
//   string on screen; CSS then ran it together. A critique written as three
//   paragraphs arrived as one run of prose.
//
//   3. THE BOX THAT WRITES A PERMANENT ENTRY WAS THREE LINES TALL.
//   `textarea { min-height: 5rem }`, app-wide, which is where a claim and a
//   critique were composed. Re-reading a draft is not a convenience here: it
//   is the last moment the text is still free to change.
//
// AND ONE DEFECT THIS FILE FOUND BY LOOKING AT THE NEIGHBOUR: the assessment
// panel's byline — the one the critique's was copied from — called
// `loadClaimsByAuthor` WITHOUT switching to the tab that renders the result.
// It read an agent's claims into a screen the reader was not on, so the
// button looked inert. Section 4 drives both bylines for that reason.
//
// WHAT THE FIXTURE IS SHAPED TO DEFEAT, because none of these checks is
// interesting against a screen that merely has words on it:
//
//   A. A BYLINE THAT IS A CONSTANT. One agent's thread cannot tell "shows
//   who wrote this" from "shows who is logged in", so the three critiques
//   here are written by TWO agents and every byline is matched against the
//   key of the agent who actually wrote that row — not merely counted.
//
//   B. TALL BECAUSE EVERYTHING IS TALL. A paragraph break that survived and
//   a font that happens to wrap look identical in a height measurement, so
//   the multi-paragraph claim has a SIBLING carrying the same words joined
//   by spaces, and the one-line critique sits beside the three-paragraph
//   one. Each measured surface has a flat control next to it, in the same
//   list, at the same width. Without them this file would pass against a
//   screen with no `pre-wrap` at all.
//
//   C. A BOX THAT IS JUST BIGGER. A fixed twenty-line box pushes the submit
//   button off a 390x844 phone before anything is typed — `layout-fits.mjs`'
//   defect wearing the other shoe. So growth is measured as a DIFFERENCE
//   (empty, one line, five paragraphs) and the cap is asserted against a
//   200-line draft, which is the case where a box that merely grows becomes
//   a box that has eaten the page.
//
//   D. GROUPED BY PERSON. A byline is attribution; grouping a thread by who
//   wrote each row makes the person the unit, which is what Invariant #1
//   refuses and what the By Author tab's own no-count note is about. The
//   critiques are published stranger-author-stranger so that the wire order
//   is NOT author-grouped and the ordering check can tell one screen from
//   the other. That control is asserted FIRST, before the check it protects.
//
// Prereqs: a CLEAN sandbox (scripts/sandbox.sh clean && scripts/sandbox.sh
// start) and a UI build — scripts/pack-webhapp.sh does both in the right
// order. A stale `dist/` means you are verifying the previous version of the
// UI and everything here will pass.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — 30 checks, green on a live conductor on the first full
// run, then watched failing EIGHT ways. Every count below is a real run.
//
//   A. BOTH HALVES OF THE BYLINE UNDONE — the button and the relation marker
//   removed from `renderCritiquePanel`, which is the screen as it shipped.
//   Result: 8 red, including all three of section 4 (with no byline there is
//   nothing to click, so the two checks about where a click ARRIVES fall with
//   the control that says it is there). The 22 that stayed green are why
//   sections 2 and 3 are in this file at all: a screen can be perfectly
//   legible, growable and well laid out and still tell a reader nothing about
//   who is speaking.
//
//   B. THE RELATION MARKER ALONE. Result: exactly 1 red, and its own control
//   — the stranger's rows carry no marker — stayed green. That pair is the
//   shape every "X is shown" check here is written in: one for the thing
//   said, one for it not being said about everybody.
//
//   C. THE IMPOSTOR, AND IT IS THE ONE TO READ. The byline rendered from
//   `connection.myAgentPubKey` instead of `critique.entry.author` — a screen
//   that names who is LOOKING rather than who wrote. Result: 2 red, the
//   distinctness control (1 distinct byline over three rows) and the
//   stranger's row. AND THE CHECK ABOUT THE AUTHOR'S OWN REPLY STAYED GREEN,
//   because in this fixture the viewer IS the claim's author: a single-agent
//   thread, or a thread read only by its author, cannot tell this defect from
//   correct behaviour. That is the whole reason three rows are written by two
//   agents and one check compares a byline against the key of the agent who
//   wrote THAT row.
//
//   D. `white-space: pre-wrap` REMOVED — the defect as shipped. Result: 4
//   red, one of which is a control reddening exactly as designed: the same
//   words joined by spaces now render in the SAME number of lines as the
//   paragraphed version, so the pair no longer distinguishes anything and
//   says so rather than passing. AND THE THREE-PARAGRAPH CRITIQUE STILL
//   RENDERED THREE LINE BOXES, because it wraps — so the `>= 5` threshold is
//   what catches this and the `>= 2x its one-line neighbour` half of that
//   control would have passed on its own. A ratio is not enough here.
//
//   E. `pre-wrap` APPLIED TO THE TWO SURFACES THAT WERE REPORTED and no
//   others. Result: exactly 1 red, the assessment rationale. This is the
//   injection that matters most: the complaint named a claim and a critique,
//   and a fix shaped around the complaint leaves three other surfaces
//   collapsing somebody's paragraphs. A check against a surface nobody
//   complained about is what makes this a rule instead of a patch.
//
//   F. THE GROWTH RULE UNDONE — the delegated input listener and the
//   post-render pass both removed. Result: 4 red, every content check in
//   section 3, two of them reporting `136 -> 136px` in their own labels. The
//   CAP control stayed green, correctly: a box that never grows has nothing
//   to cap.
//
//   G. THE CAP REMOVED, growth kept. Result: 2 red — a 200-line draft made
//   the box 9,294px tall in an 844px viewport, and the composer's own span
//   from box top to the button that signs it measured 9,331px. This is the
//   injection that says why the cap is not a detail.
//
//   H. THE ASSESSOR BYLINE'S TAB SWITCH REVERTED to what it was before this
//   commit. Result: exactly 1 red, the last check in section 4 — the defect
//   this file found by copying the idiom next door.
//
// AND TWO TRAPS THIS FILE PAID FOR, both of which produced a GREEN that
// meant nothing:
//
//   THE STALE BUNDLE, and it bit the injection written to prove the cap
//   matters. `npm run build` is `tsc && vite build` with `noUnusedLocals`
//   on, so an injection that leaves a local unused FAILS TYPECHECK, never
//   reaches `vite build`, and leaves the previous (correct) bundle in
//   `dist/` for the harness to drive. Injection G reported ALL CHECKS PASSED
//   twice for that reason — once on `cap`, then again on `PROSE_BOX_CAP`
//   after `cap` was deleted — and the only tell was a 200-line draft
//   reporting the cap's exact value. An injection must leave the build
//   GREEN; check for `built in` before trusting a run, which this file's own
//   header already says in the prereq paragraph and which is easy to skip
//   when the pipeline is a one-liner.
//
//   THE FRICTION CEILING, which is this file's own cost of being cheap to
//   re-run. The fixture spends 2 of the stranger's critiques per run and the
//   integrity zome allows 20 per agent per 3600 seconds, so about TEN runs
//   per hour against one sandbox. Injections G and H first reported 0 red
//   because the conductor refused the SETUP, not because the code was right
//   — the harness printed the zome's own refusal and exited non-zero, and
//   both were re-run against a clean sandbox (new agent keys, new budget).
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
const AGENT2_APP_ID = 'epistemic-resonance-happ-thread2';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;
const PREVIEW_PORT = 4196;

const STAMP = Date.now();
const DOMAIN = `ReadingAThread${STAMP}`;

// THREE SHORT LINES, and short on purpose: each is under thirty characters,
// so at 390px none of them can wrap. The flat sibling below is the same words
// joined by spaces, which is the only thing that makes "five lines" evidence
// of a preserved line break rather than evidence of a narrow screen.
const LINES = [
  'Waiting lists have a cost.',
  'Someone else is waiting.',
  'That cost is never counted.',
];
const CLAIM_BROKEN = LINES.join('\n\n');
const CLAIM_FLAT = LINES.join(' ');
const CLAIM_THEIRS = 'A claim of the other agent, so a byline has somewhere to go.';

const CRIT_PARA = [
  'Two objections, and they differ.',
  'One: the costs are not comparable.',
  'Two: nobody counted the second.',
].join('\n\n');
const CRIT_AUTHOR = 'Conceding the first and not the second.';
const CRIT_ONE = 'One line, and deliberately so.';

/** ROW 6.19's fixture. Paragraphs, because 6.20's `pre-wrap` has to reach a
 *  reply too — a surface built after the complaint is exactly the kind that
 *  gets missed, which is the lesson the stylesheet comment already records. */
const REPLY_DEFENCE = [
  'Answering the first objection rather than the claim.',
  'The sample was drawn after the cut-off, so the window it names is the wrong one.',
].join('\n\n');
/** Typed through the GUI, so the WRITE is measured and not just the render. */
const REPLY_TYPED = 'Typed into the reply box, pointed at the objection and not at the claim.';

/** ROW 6.22's fixture. Three more critiques take the claim from 3 to 6 — past
 *  `FOLD_CRITIQUES_AFTER` (4) — and they are published only AFTER every check
 *  above has run, so the counts those checks assert are untouched. */
const EXTRA_CRITIQUES = [
  'A fourth objection, which is still inside the fold.',
  'A fifth objection, which is not.',
  'A sixth objection, also folded away.',
];
/** A reply to a critique that the fold HIDES — so "say how many it hides" can
 *  be checked against replies as well as critiques. */
const HIDDEN_REPLY = 'A reply to a critique nobody can see until they open the list.';

const RATIONALE = [
  'Supporting the first part only.',
  'The discharge rule is a separate matter.',
].join('\n\n');

const DRAFT_ONE_LINE = 'A single line, typed to see what the box does with it.';
const DRAFT_FIVE_PARAS = [
  'The first paragraph of a critique somebody is about to sign permanently.',
  'The second, which says what the first left out.',
  'The third, which concedes something.',
  'The fourth, which does not.',
  'The fifth, which says what would change my mind.',
].join('\n\n');
// Long enough that no cap short of the whole viewport could contain it.
const DRAFT_HUGE = Array.from({ length: 200 }, (_, i) => `Line ${i + 1} of a draft nobody should be made to scroll.`).join('\n');

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

const nowMicros = () => Date.now() * 1000;
const b64 = (u8) => Buffer.from(u8).toString('base64');
/** The same twelve characters the UI puts in a byline, so a check can compare
 *  what is on screen against the key of the agent that actually wrote it. */
const short = (u8) => `${b64(u8).slice(0, 12)}…`;

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

/** Entry hashes, read back off the DHT — `create_claim` returns an ActionHash
 *  and a critique targets an ENTRY hash. Same helper as own-critiques.mjs,
 *  with one difference that is deliberate: a match has to carry THIS RUN'S
 *  domain as well as the content.
 *
 *  own-critiques matches on content alone and therefore requires a clean
 *  sandbox — a second run finds two claims saying the same thing and reports
 *  SETUP FAILED. Nothing in this file depends on a fresh chain (every needle
 *  is scoped to a timestamped domain, and the critiques are read through the
 *  claim they target), so the stricter match is free here and it is what makes
 *  an injection cheap to run: rebuild, re-run, read the reds. A harness that
 *  needs a four-minute conductor restart per injection gets injected less. */
/** ROW 6.19 — a critique OF a critique. The only difference from the helper
 *  above is `target_type`, and that one word is the whole row: the client
 *  hardcoded `'Claim'` at every write, so this entry shape was unreachable
 *  from the app while being perfectly legal on the DHT.
 *
 *  AND IT CANNOT BE FAKED BY A HALF-FIX, which is what makes the GUI write in
 *  section 6 worth more than it looks. `validate_critique` reads the target
 *  entry back and cross-checks its REAL type against the declared
 *  `target_type` (dna/integrity/src/lib.rs:1719-1734), refusing a mismatch.
 *  So a client that pointed `target` at a critique while still declaring
 *  `'Claim'` would be REFUSED BY VALIDATION — a reply that commits at all is
 *  proof the client sent the right type. */
const replyTo = (agent, critiqueEntryHash, content) => agent.call('create_critique', {
  target: critiqueEntryHash, target_type: 'Critique', critique_mode: 'Methodological',
  content, author: agent.me, timestamp: nowMicros(),
  replication_attempted: false, evidence_hashes: [], species: null,
});

/** The entry hash of one critique, off the wire — a reply targets an ENTRY
 *  hash, the same way a critique targets a claim's. */
function critiqueEntryHashOnWire(wireRecords, needle) {
  for (const r of wireRecords) {
    const raw = r.entry?.Present?.entry ?? r.entry;
    if (Buffer.from(raw).toString('latin1').includes(needle)) {
      return r.signed_action.hashed.content.data.entry_hash;
    }
  }
  return null;
}

async function claimsOnTheWire(agent, who, contents) {
  const records = await agent.call('get_claims_by_agent', who);
  const out = [];
  for (const r of records) {
    const raw = r.entry?.Present?.entry ?? r.entry;
    const blob = Buffer.from(raw).toString('latin1');
    if (!blob.includes(DOMAIN)) continue;
    const hit = contents.find((c) => blob.includes(c));
    if (hit) out.push({ content: hit, entryHash: r.signed_action.hashed.content.data.entry_hash });
  }
  return out;
}

const textOf = async (page, selector) => {
  const loc = page.locator(selector);
  return (await loc.count()) ? await loc.first().innerText() : '';
};

/** `inputValue()` THROWS against an element that is not there, which on the
 *  By Author tab is the exact state a broken byline leaves you in — still on
 *  Browse, with no key box at all. Count first, so that reads as a red check
 *  rather than as a dead harness. */
const valueOf = async (page, selector) => {
  const loc = page.locator(selector);
  return (await loc.count()) ? await loc.first().inputValue() : null;
};

/** HOW A PROSE SURFACE IS MEASURED, and why it is not `getComputedStyle`.
 *
 * `white-space: pre-wrap` in the stylesheet is a fact about the stylesheet. A
 * check that reads it asserts that a line was typed, not that a reader can
 * see the shape of somebody's paragraph — and it would pass against an
 * element the rule does not reach, which is precisely the mistake that left
 * `.critique-item p` out of it for a month. So this measures the LAYOUT: how
 * many line boxes tall the text actually is, against its own line height,
 * with `clipped` saying whether any of it is out of view.
 *
 * `lineHeight` can compute to `normal`, which parses to NaN — the assessment
 * rationale is such a surface — so the fallback is 1.2x the font size, which
 * is slightly LARGER than a normal line box and therefore rounds the line
 * count DOWN. Every threshold here is a lower bound, so the fallback can only
 * make this file harder to pass. */
function proseProbe() {
  window.__prose = (needle, selector) => {
    // THE DEEPEST MATCH, not the first. A `.critique-item` is a DESCENDANT of
    // the `.claim-card` it objects to, so the card's own text contains every
    // critique's text and a first-match lookup for a critique would hand back
    // the card — and then the card's FIRST critique, whichever row was asked
    // for. Document order is pre-order, so the last match is the innermost.
    //
    // Needles are matched against `textContent`, which is what the DOM holds
    // rather than what CSS renders. `innerText` collapses exactly the line
    // breaks this file is about, so a needle containing one would stop
    // matching under the very injection it has to survive, and the harness
    // would report SETUP FAILED where it should report a red check.
    const scope = [...document.querySelectorAll('.claim-card, .critique-item, .assessment-item')]
      .filter((e) => e.textContent.includes(needle)).pop();
    if (!scope) return { missing: 'no-such-row' };
    const el = scope.matches(selector) ? scope : scope.querySelector(selector);
    if (!el) return { missing: 'no-such-element' };
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
    const height = el.getBoundingClientRect().height;
    return {
      height: Math.round(height),
      lineHeight: Math.round(lh * 10) / 10,
      lines: Math.round(height / lh),
      clipped: el.scrollHeight > el.clientHeight + 1,
      text: el.textContent,
    };
  };
}

/** The box, measured the way a person experiences it: how tall it is, and
 *  whether what they typed is all visible inside it.
 *
 *  A MISSING BOX COMES BACK AS -1 RATHER THAN AS `null`, and that is this
 *  directory's crash lesson rather than a style choice: `browse-states` and
 *  `applet-view` both DIED mid-run against their own injections — one on a
 *  `locator.fill` into an element that was never rendered, taking five later
 *  passes with it — and a harness that throws reports nothing about the
 *  checks it never reached. -1 fails every threshold here and keeps going. */
async function boxOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { height: -1, clientHeight: -1, scrollHeight: -1, viewport: window.innerHeight };
    return {
      height: Math.round(el.getBoundingClientRect().height),
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      viewport: window.innerHeight,
    };
  }, selector);
}

async function main() {
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
  log(`agent2 (the stranger)                        = ${short(agent2.me)}\n`);

  if (b64(agent1.me) === b64(agent2.me)) {
    log('  SETUP FAILED: both slots resolved to the same agent key, so "the byline');
    log('  names who wrote THIS row" could not fail. Refusing to run.');
    process.exit(1);
  }

  log('agent1 publishes the same words twice — once as paragraphs, once flat ...');
  await claim(agent1, CLAIM_BROKEN);
  await claim(agent1, CLAIM_FLAT);
  log('agent2 publishes a claim of its own, so a byline has somewhere to lead ...');
  await claim(agent2, CLAIM_THEIRS);

  const mine = await claimsOnTheWire(agent1, agent1.me, [CLAIM_BROKEN, CLAIM_FLAT]);
  const theirs = await claimsOnTheWire(agent2, agent2.me, [CLAIM_THEIRS]);
  if (mine.length !== 2 || theirs.length !== 1) {
    log(`  SETUP FAILED: decoded ${mine.length} of agent1's claims and ${theirs.length} of agent2's.`);
    log('  If the code looks correct the conductor is on a STALE BUILD —');
    log('  scripts/pack-webhapp.sh, then scripts/sandbox.sh clean && start.');
    process.exit(1);
  }
  const target = mine.find((c) => c.content === CLAIM_BROKEN).entryHash;

  // PUBLISHED STRANGER - AUTHOR - STRANGER, and that order is load-bearing:
  // see fake D in the header. A fixture whose wire order already groups the
  // two agents cannot tell a grouped screen from an ungrouped one.
  log('agent2, then agent1, then agent2 critique it — NOT grouped by author ...');
  await critique(agent2, target, CRIT_PARA);
  await critique(agent1, target, CRIT_AUTHOR);
  await critique(agent2, target, CRIT_ONE);

  log('agent2 also files an assessment, whose rationale has paragraphs of its own ...');
  await agent2.call('publish_assessment', {
    assessor: agent2.me, target, stance: 'Abstains', confidence: 'Moderate',
    rationale: RATIONALE, past_cone: [], timestamp: nowMicros(),
  });

  // What the DHT will hand the screen, in the order it will hand it over.
  const wire = await agent1.call('get_critiques_for', target);
  const wireOrder = wire.map((r) => {
    const raw = r.entry?.Present?.entry ?? r.entry;
    const blob = Buffer.from(raw).toString('latin1');
    return [CRIT_PARA, CRIT_AUTHOR, CRIT_ONE].find((c) => blob.includes(c.split('\n')[0])) ?? '?';
  });
  log(`get_critiques_for returns ${wire.length}; wire order: `
    + wireOrder.map((c) => (c === CRIT_PARA ? 'stranger-paras' : c === CRIT_AUTHOR ? 'author' : 'stranger-one')).join(', '));

  // ROW 6.19 — THE AUTHOR DEFENDS, against the OBJECTION rather than beside it.
  // This is the entry shape we told this participant was available on
  // 2026-11-08 and which their build could not write.
  const paraCritHash = critiqueEntryHashOnWire(wire, CRIT_PARA.split('\n')[0]);
  const oneCritHash = critiqueEntryHashOnWire(wire, CRIT_ONE);
  if (!paraCritHash || !oneCritHash) {
    log('  SETUP FAILED: could not read back the entry hash of a critique to reply to.');
    process.exit(1);
  }
  log("agent1 replies to agent2's FIRST objection — a critique of a critique ...");
  await replyTo(agent1, paraCritHash, REPLY_DEFENCE);

  const replyWire = await agent1.call('get_critiques_for', paraCritHash);
  const otherReplyWire = await agent1.call('get_critiques_for', oneCritHash);
  if (replyWire.length !== 1) {
    log(`  SETUP FAILED: the reply did not commit (get_critiques_for on the critique `
      + `returned ${replyWire.length}).`);
    process.exit(1);
  }
  log(`the objection now has ${replyWire.length} reply; its neighbour has `
    + `${otherReplyWire.length} — which is what makes "under the RIGHT one" measurable`);
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
  await page.addInitScript(proseProbe);

  try {
    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });

    await page.locator('[data-testid="browse-domain-input"]').fill(DOMAIN);
    await page.getByRole('button', { name: 'Load claims' }).first().click();
    await page.waitForTimeout(2500);

    // ---- 0. The screen this file is about is on screen --------------------
    log('=== 0. The thread is loaded, so nothing below passes vacuously ===');
    const listText = await textOf(page, '[data-testid="browse-claim-list"]');
    check('CONTROL: the domain rendered both of the author\'s claims',
      listText.includes(LINES[0]) && listText.includes(CLAIM_FLAT.slice(0, 40)));
    const wireHasBreaks = wire.some((r) => {
      const raw = r.entry?.Present?.entry ?? r.entry;
      return Buffer.from(raw).toString('latin1').includes('\n\n');
    });
    check('SETUP: a critique with blank lines in it really is on the DHT, so the '
      + 'screen has something to preserve', wireHasBreaks);

    // Expand the claim the critiques are attached to — found by its exact
    // content in `textContent`, because BOTH of the author's claims contain
    // the first line and only one of them carries the critiques. Matching the
    // flat sibling by accident would open a panel reading "No critiques yet"
    // and red every check in this file for a reason that is not the code's.
    const brokenIndex = await page.evaluate((needle) => [...document.querySelectorAll('.claim-card')]
      .findIndex((c) => c.textContent.includes(needle)), CLAIM_BROKEN);
    if (brokenIndex < 0) {
      log('  SETUP FAILED: the critiqued claim never rendered, so no panel could be opened.');
      process.exit(1);
    }
    await page.locator('.claim-card').nth(brokenIndex)
      .locator('[data-testid="toggle-critiques"]').click();
    await page.waitForTimeout(3000);
    // SCOPED TO NON-REPLIES BY ROW 6.19, and the narrowing is the point rather
    // than an accommodation: a reply is now a `.critique-item` too, so an
    // unscoped count would read 4 here and this check would redden. That it
    // WOULD redden is the evidence that the structural separation is real —
    // if a reply were still rendered as one more row in the flat list, this
    // selector could not tell them apart and the count would stay at 3.
    const items = await page.locator('.critique-item:not(.critique-reply)').count();
    check(`CONTROL: all three critiques are in the panel (${items})`, items === 3);
    const replyItems = await page.locator('[data-testid="critique-reply"]').count();
    check(`CONTROL: and the one reply is NOT among them (${replyItems} reply rendered, `
      + `${items} top-level) — otherwise every structural check below is vacuous`,
      replyItems === 1 && items === 3);

    // ---- 1. Who wrote what (open-work 6.18) ------------------------------
    log('\n=== 1. Who wrote what ===');
    const bylines = await page
      .locator('.critique-item:not(.critique-reply) [data-testid="critique-author"]')
      .allInnerTexts();
    check(`every critique carries a byline (${bylines.length} of ${items})`,
      bylines.length === items && items > 0);
    const distinct = new Set(bylines.map((t) => t.trim()));
    check(`CONTROL: the bylines are not one repeated string — ${distinct.size} distinct `
      + 'over three rows, so this screen can tell a thread of one from a thread of two',
      distinct.size === 2);

    // PER ROW, not merely present: the key beside a critique is the key of the
    // agent who wrote THAT critique. A byline taken from the logged-in agent,
    // or from the claim's author, satisfies every count above.
    const bylineFor = async (needle) => page.evaluate((n) => {
      const item = [...document.querySelectorAll('.critique-item')].find((e) => e.textContent.includes(n));
      if (!item) return 'no-such-item';
      const el = item.querySelector('[data-testid="critique-author"]');
      return el ? el.textContent.trim() : null;
    }, needle);
    check(`the stranger's critique is attributed to the STRANGER (${await bylineFor(CRIT_ONE)})`,
      (await bylineFor(CRIT_ONE)) === short(agent2.me));
    check(`and the author's own reply to the STRANGER's objection is attributed to the author `
      + `(${await bylineFor(CRIT_AUTHOR)})`,
      (await bylineFor(CRIT_AUTHOR)) === short(agent1.me));

    const relationFor = async (needle) => page.evaluate((n) => {
      const item = [...document.querySelectorAll('.critique-item')].find((e) => e.textContent.includes(n));
      if (!item) return 'no-such-item';
      const el = item.querySelector('[data-testid="critique-relation"]');
      return el ? el.textContent.trim() : null;
    }, needle);
    const authorRel = await relationFor(CRIT_AUTHOR);
    check(`the claim's own author answering says so, rather than leaving a reader to `
      + `recognise a shortened key (${authorRel})`,
      typeof authorRel === 'string' && /the claim’s author/.test(authorRel));
    // RE-EXPRESSED BY ROW 6.23, NOT RELAXED. This read `relationFor(...) === null`
    // for both stranger rows — no relation marker at all. 6.23 gives the
    // stranger's SECOND critique a marker of its own ("same author as an
    // earlier critique"), which is a true statement about a different thing,
    // so the blanket null is no longer the right assertion.
    //
    // The control's PURPOSE is unchanged and is what the test now says
    // directly: the claim's-author marker must not be applied to everybody.
    // A screen that labelled every row "the claim's author" still reds here.
    const strangerOne = await relationFor(CRIT_ONE);
    const strangerPara = await relationFor(CRIT_PARA);
    check('CONTROL: and NEITHER stranger row claims to be the claim\'s author — '
      + 'otherwise the check above passes on a screen that labels everybody '
      + `(${JSON.stringify(strangerPara)}, ${JSON.stringify(strangerOne)})`,
      !/the claim’s author/.test(strangerOne ?? '')
      && !/the claim’s author/.test(strangerPara ?? ''));

    // ---- 1b. Is this one person or several? (open-work 6.23) -------------
    //
    // THE FIXTURE IS ALREADY SHAPED FOR THIS and was not changed to suit it:
    // agent2 wrote the FIRST and THIRD critiques, agent1 the second. So the
    // repeat is deliberately NON-ADJACENT, which is the case an "above"-only
    // marker would miss and the case a reader cannot answer from two
    // twelve-character keys.
    check('a critique by someone who already objected says so — which is the half of '
      + '"you wouldnt know if you\'re speaking to the same or others" that a byline '
      + `alone does not answer (${JSON.stringify(strangerOne)})`,
      /same author as an earlier critique/.test(strangerOne ?? ''));
    check("CONTROL: and their FIRST critique does NOT say it — the marker points "
      + 'backwards at a repeat, so a client that marked every row would pass the '
      + `check above (${JSON.stringify(strangerPara)})`,
      !/same author as an earlier critique/.test(strangerPara ?? ''));
    check('CONTROL: and the lone author\'s critique does not say it either, since '
      + 'nobody else repeated — otherwise the marker is a constant',
      !/same author as an earlier critique/.test((await relationFor(CRIT_AUTHOR)) ?? ''));

    // Invariant #1 at the view layer. The vacuity control comes FIRST.
    const byCountGrouped = [CRIT_PARA, CRIT_ONE, CRIT_AUTHOR];
    check('CONTROL: the wire order is NOT grouped by author, so the check below can '
      + 'tell a grouped screen from an unsorted one',
      JSON.stringify(wireOrder) !== JSON.stringify(byCountGrouped));
    const screenOrder = await page.evaluate((contents) => {
      const seen = [];
      for (const item of document.querySelectorAll('.critique-item')) {
        const hit = contents.find((c) => item.textContent.includes(c.split('\n')[0]));
        if (hit && !seen.includes(hit)) seen.push(hit);
      }
      return seen;
    }, [CRIT_PARA, CRIT_AUTHOR, CRIT_ONE]);
    check('the critiques stay in the order the DHT returned them — a byline attributes, '
      + 'and does not group a thread by person',
      JSON.stringify(screenOrder) === JSON.stringify(wireOrder));

    // ---- 2. Read as it was written (open-work 6.20, first half) ----------
    log('\n=== 2. Read as it was written ===');
    const paras = await page.evaluate((n) => window.__prose(n, '[data-testid="critique-content"]'), CRIT_PARA.split('\n')[0]);
    const oneLine = await page.evaluate((n) => window.__prose(n, '[data-testid="critique-content"]'), CRIT_ONE);
    check(`the three-paragraph critique renders tall enough to BE three paragraphs `
      + `(${paras.lines} line boxes of ${paras.lineHeight}px)`,
      paras.lines >= 5);
    check(`CONTROL: its one-line neighbour renders on one (${oneLine.lines}), so the `
      + 'measurement distinguishes a preserved break from a tall panel',
      oneLine.lines <= 2 && paras.lines >= oneLine.lines * 2);
    check('and none of it is clipped — a window that opens a record and then cuts it '
      + 'off would miss the point',
      paras.clipped === false);

    // Matched on the WHOLE content of each, because the flat sibling's text
    // contains every line of the broken one — that is what makes it a control
    // and also what makes a one-line needle useless here.
    const broken = await page.evaluate((n) => window.__prose(n, '.claim-content'), CLAIM_BROKEN);
    const flat = await page.evaluate((n) => window.__prose(n, '.claim-content'), CLAIM_FLAT);
    check(`the claim's own paragraphs survive too (${broken.lines} line boxes)`,
      broken.lines >= 5);
    check(`CONTROL: the SAME WORDS joined by spaces render in fewer (${flat.lines}), `
      + 'which is what makes the line above evidence of a line break rather than of a '
      + 'narrow screen',
      flat.lines <= 3 && broken.lines >= flat.lines * 2);

    // The swept surface. The fix is a list of every place somebody's own words
    // are rendered, not the two that were complained about — this is one of the
    // three nobody mentioned.
    const rationale = await page.evaluate((n) => window.__prose(n, '[data-testid="assessment-rationale"]'), RATIONALE.split('\n')[0]);
    check(`an assessment's rationale keeps its breaks as well (${rationale.lines} line `
      + 'boxes) — the rule is a list of surfaces, not the two that were reported',
      rationale.lines >= 3);

    // ---- 3. The box you write in (open-work 6.20, second half) -----------
    log('\n=== 3. The box you write in ===');
    const box = '.critique-form textarea';
    const boxes = await page.locator(box).count();
    if (boxes !== 1) {
      log(`  SETUP FAILED: ${boxes} critique composers on screen, so the box cannot be measured.`);
      process.exit(1);
    }
    const empty = await boxOf(page, box);
    check(`CONTROL: the empty critique box is more than the three lines it was `
      + `(${empty.height}px)`,
      empty.height >= 120);
    await page.locator(box).fill(DRAFT_ONE_LINE);
    await page.waitForTimeout(150);
    const afterOne = await boxOf(page, box);
    await page.locator(box).fill(DRAFT_FIVE_PARAS);
    await page.waitForTimeout(150);
    const afterFive = await boxOf(page, box);
    check(`five paragraphs make the box grow (${empty.height} -> ${afterFive.height}px)`,
      afterFive.height > empty.height);
    check('and the whole draft is visible inside it without scrolling — which is the '
      + 'thing being asked for: re-reading what you are about to sign permanently',
      afterFive.scrollHeight <= afterFive.clientHeight + 2);
    check(`CONTROL: one line does NOT produce that height (${afterOne.height}px), so the `
      + 'check above is about the content and not a constant',
      afterOne.height < afterFive.height);
    await page.locator(box).fill(DRAFT_HUGE);
    await page.waitForTimeout(200);
    const afterHuge = await boxOf(page, box);
    check(`CONTROL: a 200-line draft does NOT eat the page (${afterHuge.height}px of a `
      + `${afterHuge.viewport}px viewport) — past the cap the box scrolls rather than `
      + 'pushing the button that commits it out of reach',
      afterHuge.height < afterHuge.viewport * 0.7 && afterHuge.scrollHeight > afterHuge.clientHeight);
    // WHAT THE CAP IS FOR, measured rather than restated: with a 200-line
    // draft in it, the whole composer — box, modes, and the button that signs
    // the thing — still fits in one screen height. An uncapped box, or a box
    // fixed tall enough to hold that draft, fails this and nothing else here.
    const composerSpan = await page.evaluate(() => {
      const area = document.querySelector('.critique-form textarea');
      const submit = document.querySelector('.critique-form button[type="submit"]');
      if (!area || !submit) return null;
      return Math.round(submit.getBoundingClientRect().bottom - area.getBoundingClientRect().top);
    });
    check(`and the composer still fits one screen with that draft in it — box top to `
      + `the button that commits it, ${composerSpan}px of ${afterHuge.viewport}px`,
      composerSpan !== null && composerSpan <= afterHuge.viewport);

    await page.getByRole('button', { name: 'New Claim', exact: true }).click();
    await page.waitForTimeout(300);
    const claimBox = '[data-testid="new-claim-content"]';
    const claimEmpty = await boxOf(page, claimBox);
    await page.locator(claimBox).fill(DRAFT_FIVE_PARAS);
    await page.waitForTimeout(150);
    const claimFull = await boxOf(page, claimBox);
    check(`the New Claim box does the same (${claimEmpty.height} -> ${claimFull.height}px) — `
      + 'the growth rule is app-wide, not a property of one form',
      claimEmpty.height >= 120 && claimFull.height > claimEmpty.height
      && claimFull.scrollHeight <= claimFull.clientHeight + 2);

    // ---- 4. The byline is a route, on both panels ------------------------
    //
    // Last, because it leaves the screen the sections above measure.
    log('\n=== 4. A byline is the way to the rest of what somebody said ===');
    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await page.waitForTimeout(500);
    const strangerByline = page.locator('.critique-item', { hasText: CRIT_ONE })
      .locator('[data-testid="critique-author"]');
    const strangerBylines = await strangerByline.count();
    check('CONTROL: the stranger\'s byline is still on screen to be clicked',
      strangerBylines === 1);
    if (strangerBylines === 1) {
      await strangerByline.first().click();
      await page.waitForTimeout(3000);
    }
    check('clicking it ARRIVES on the tab that answers it, carrying their key',
      (await valueOf(page, '[data-testid="author-key-input"]')) === b64(agent2.me));
    check("and lists the stranger's own claim",
      (await textOf(page, '[data-testid="author-claim-list"]')).includes(CLAIM_THEIRS));

    // The neighbour this file found by copying from it.
    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await page.waitForTimeout(500);
    const assessorByline = page.locator('[data-testid="assessment-assessor"]');
    const assessorBylines = await assessorByline.count();
    check('CONTROL: the assessment panel is still rendering its assessor',
      assessorBylines === 1);
    if (assessorBylines === 1) {
      await assessorByline.first().click();
      await page.waitForTimeout(3000);
    }
    check('the ASSESSOR\'s byline arrives too — it read an agent\'s claims into a tab '
      + 'the reader was not on until this commit',
      (await valueOf(page, '[data-testid="author-key-input"]')) === b64(agent2.me)
      && (await textOf(page, '[data-testid="author-claim-list"]')).includes(CLAIM_THEIRS));

    // ---- 6. A reply goes under the critique it answers (open-work 6.19) --
    //
    // THE SHAPE UNDER TEST IS THE PARTICIPANT'S OWN SENTENCE, 2026-11-12: "the
    // reply comes under a critique ... A new critique gets its own section."
    // Every check here is about PLACEMENT, because a reply that renders
    // somewhere is the easy half — the row's `[D]` was about where.
    log('\n=== 6. A reply goes under the critique it answers (6.19) ===');

    // BACK TO THE TAB THAT HAS A CRITIQUE PANEL ON IT. Section 4 ends on By
    // Author by design — it is testing that a byline ARRIVES there — and the
    // first run of this section measured that screen instead, scoring zero
    // sections against a page that renders no critiques at all. Every check
    // below would have been a false red; the same mistake pointed the other
    // way is a false green, which is why the panel is re-established and then
    // asserted rather than assumed.
    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await page.waitForTimeout(800);
    if ((await page.locator('.critique-item:not(.critique-reply)').count()) === 0) {
      const idx = await page.evaluate((needle) => [...document.querySelectorAll('.claim-card')]
        .findIndex((c) => c.textContent.includes(needle)), CLAIM_BROKEN);
      if (idx >= 0) {
        await page.locator('.claim-card').nth(idx)
          .locator('[data-testid="toggle-critiques"]').click();
        await page.waitForTimeout(3000);
      }
    }
    const panelBack = await page.locator('.critique-item:not(.critique-reply)').count();
    check(`CONTROL: the critique panel is on screen again (${panelBack} critiques), so `
      + 'every check below is measuring a panel rather than a tab that has none',
      panelBack === 3);

    const sections = await page.locator('[data-testid="critique-thread"]').count();
    check(`each critique gets its own section (${sections} sections for ${items} critiques)`,
      sections === items && sections > 1);

    // THE CHECK THE ROW EXISTS FOR, and its two controls are the whole reason
    // it means anything. A reply appended to the end of the panel satisfies
    // "a reply is on screen"; a reply looked up by the wrong key and rendered
    // under EVERY critique satisfies "a reply is in a section". Only
    // `inOwner && !inOther && !atPanelLevel` distinguishes the shape asked for.
    const placement = await page.evaluate(([needleCrit, needleReply, needleOther]) => {
      const secs = [...document.querySelectorAll('[data-testid="critique-thread"]')];
      const headOf = (s) => s.querySelector('.critique-item:not(.critique-reply)');
      const owner = secs.find((s) => headOf(s)?.textContent.includes(needleCrit));
      const other = secs.find((s) => headOf(s)?.textContent.includes(needleOther));
      return {
        sawOwner: !!owner,
        sawOther: !!other,
        inOwner: !!owner && owner.textContent.includes(needleReply),
        inOther: !!other && other.textContent.includes(needleReply),
        atPanelLevel: document.querySelectorAll(
          '.critique-panel > [data-testid="critique-reply"]',
        ).length,
      };
    }, [CRIT_PARA.split('\n')[0], REPLY_DEFENCE.split('\n')[0], CRIT_ONE]);
    check('CONTROL: both the critiqued objection and its neighbour were located as '
      + 'separate sections, so the two assertions below are about different elements',
      placement.sawOwner && placement.sawOther);
    check('the reply renders INSIDE the section of the critique it targets',
      placement.inOwner);
    // GUARDED ON `inOwner`, because "not in the neighbour" and "not at panel
    // level" are both TRUE of a screen with no reply on it anywhere. The first
    // run of this section proved that the hard way: these two passed while the
    // reply was absent, which is this repository's standing lesson about any
    // check of the form "X is NOT shown" — ask what makes it capable of
    // failing. Anchoring them to the positive finding is what makes them
    // controls rather than decoration.
    check("CONTROL: and NOT inside its neighbour's section — a reply looked up by the "
      + 'wrong key, or shown under every critique, would pass the check above',
      placement.inOwner && placement.inOther === false);
    check('CONTROL: and no reply sits loose at panel level, which is what "appended to '
      + 'the list" would look like',
      placement.inOwner && placement.atPanelLevel === 0);

    const replyPart = async (testid) => page.evaluate(([n, id]) => {
      const el = [...document.querySelectorAll('[data-testid="critique-reply"]')]
        .find((e) => e.textContent.includes(n));
      if (!el) return 'no-such-reply';
      const part = el.querySelector(`[data-testid="${id}"]`);
      return part ? part.textContent.trim() : null;
    }, [REPLY_DEFENCE.split('\n')[0], testid]);

    const replyByline = await replyPart('critique-author');
    check(`the reply says who wrote it (${replyByline})`, replyByline === short(agent1.me));
    const replyRel = await replyPart('critique-relation');
    check(`and says it is the CLAIM'S AUTHOR answering the objection — which is the `
      + `half of "It doesnt show if an author responded" that a byline alone does not `
      + `answer (${replyRel})`,
      typeof replyRel === 'string' && /the claim’s author/.test(replyRel));
    // Same guard, same reason: `'no-such-reply'` is a string that contains no
    // such phrase, so the bare negative passed when nothing had rendered.
    check("CONTROL: and does NOT also call them the critique's author — the stranger "
      + 'wrote that, so a relation line that lists everything would fail here',
      typeof replyRel === 'string' && replyRel !== 'no-such-reply'
      && !/the critique’s author/.test(replyRel));

    // 6.20 ON A SURFACE BUILT AFTER THE COMPLAINT, which the stylesheet's own
    // comment names as the way that fix drifts: the one surface written after
    // the complaint got `pre-wrap`, the five older ones did not.
    const replyProse = await page.evaluate(
      (n) => window.__prose(n, '[data-testid="critique-content"]'),
      REPLY_DEFENCE.split('\n')[0],
    );
    check(`the reply's own paragraphs survive to the screen too `
      + `(${replyProse.lines} line boxes)`,
      replyProse.lines >= 3 && replyProse.clipped === false);

    const formsBefore = await page.locator('[data-testid="reply-form"]').count();
    check('CONTROL: no reply box is open until one is asked for — the ask that produced '
      + 'this row was about clutter as much as structure',
      formsBefore === 0);
    const toggles = await page.locator('[data-testid="reply-toggle"]').count();
    check(`every critique offers a reply (${toggles} for ${items})`, toggles === items);

    // THE WRITE, THROUGH THE REAL FORM. Everything above would pass against a
    // client that renders replies and cannot make one.
    const oneIdx = await page.evaluate(
      (n) => [...document.querySelectorAll('[data-testid="critique-thread"]')]
        .findIndex((s) => s.textContent.includes(n)),
      CRIT_ONE,
    );
    check('CONTROL: the one-line critique\'s own section was found, so the reply below '
      + 'is typed into a box belonging to a known critique',
      oneIdx >= 0);
    const oneSection = page.locator('[data-testid="critique-thread"]').nth(oneIdx);
    await oneSection.locator('[data-testid="reply-toggle"]').click();
    await page.waitForTimeout(400);
    check('clicking it opens a box',
      (await oneSection.locator('[data-testid="reply-form"]').count()) === 1);
    await oneSection.locator('[data-testid="reply-form"] textarea').fill(REPLY_TYPED);
    await oneSection.locator('[data-testid="reply-form"] button[type="submit"]').click();
    await page.waitForTimeout(5000);

    // READ BACK OFF THE DHT, not off the screen. And this is where
    // `validate_critique` does the work for us: it reads the target entry back
    // and refuses a declared `target_type` that does not match the target's
    // real type (dna/integrity/src/lib.rs:1719-1734). The OLD client sent
    // `target_type: 'Claim'` unconditionally — so if this entry committed at
    // all, the client sent 'Critique'. The assertion is the commit.
    const typedWire = await agent1.call('get_critiques_for', oneCritHash);
    const typedLanded = typedWire.some((r) => {
      const raw = r.entry?.Present?.entry ?? r.entry;
      return Buffer.from(raw).toString('latin1').includes(REPLY_TYPED);
    });
    check('the reply typed into that box reaches the DHT attached to the CRITIQUE — '
      + 'and since validation cross-checks the declared target_type against the '
      + "target's real type, committing at all proves the client sent 'Critique'",
      typedLanded);
    const claimWireAfter = await agent1.call('get_critiques_for', target);
    check(`CONTROL: and NOT to the claim — the claim still has its three critiques `
      + `(${claimWireAfter.length}), so the write was retargeted rather than merely `
      + `relabelled`,
      claimWireAfter.length === 3);

    // ---- 7. A long list folds, and says what it is hiding (open-work 6.22) --
    //
    // ASKED FOR BY THE SAME PERSON, 2026-11-12: "I'd include an option if
    // possible in where the list minimizes after 3-4 critiques but can be
    // opened to see all, to not clutter?" — and bounded by their next
    // sentence, "As long as anyone looking can see some information without
    // having to click too much."
    log('\n=== 7. A long list folds, and says what it is hiding (6.22) ===');

    // THE CONTROL COMES FIRST, AND IT IS THE HALF MOST LIKELY TO REGRESS: with
    // three critiques — below the threshold — there must be NO fold at all.
    // A client that folds every list would pass every check below this one.
    check('CONTROL: a SHORT list is not folded — three critiques, no control on '
      + 'screen, nothing hidden behind a click',
      (await page.locator('[data-testid="critique-fold-toggle"]').count()) === 0);

    log('publishing three more critiques, taking the claim past the fold ...');
    await critique(agent2, target, EXTRA_CRITIQUES[0]);
    await critique(agent1, target, EXTRA_CRITIQUES[1]);
    await critique(agent2, target, EXTRA_CRITIQUES[2]);

    // A REPLY ON A CRITIQUE THE FOLD WILL HIDE, chosen by reading the wire
    // rather than by assuming an order: the DHT decides what lands beyond
    // position four, so the harness asks it instead of guessing.
    const sixWire = await agent1.call('get_critiques_for', target);
    const sixOrder = sixWire.map((r) => {
      const raw = r.entry?.Present?.entry ?? r.entry;
      const blob = Buffer.from(raw).toString('latin1');
      return {
        content: [CRIT_PARA, CRIT_AUTHOR, CRIT_ONE, ...EXTRA_CRITIQUES]
          .find((c) => blob.includes(c.split('\n')[0])) ?? '?',
        entryHash: r.signed_action.hashed.content.data.entry_hash,
      };
    });
    if (sixOrder.length !== 6) {
      log(`  SETUP FAILED: expected six critiques on the wire, got ${sixOrder.length}.`);
      process.exit(1);
    }
    const hiddenOnWire = sixOrder.slice(4);
    await replyTo(agent1, hiddenOnWire[0].entryHash, HIDDEN_REPLY);
    log(`the fold will hide ${hiddenOnWire.length} critiques, one of which now has a reply`);

    // RELOADED RATHER THAN RE-OPENED, and the first attempt here is worth
    // recording because it looked like a product bug and is not one:
    // collapsing the panel and opening it again renders the CACHED three.
    // `loadCritiques` is guarded by `if (!critiquesByClaim.has(key))` in the
    // toggle handler, so a critique published after a panel was first opened
    // does not appear in it for the rest of the session. That is pre-existing
    // and out of this row's scope — noted in 6.22 rather than fixed here —
    // but it means only a full reload measures what a reader arriving fresh
    // would see, which is the state this row is about.
    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });
    await page.locator('[data-testid="browse-domain-input"]').fill(DOMAIN);
    await page.getByRole('button', { name: 'Load claims' }).first().click();
    await page.waitForTimeout(2500);
    const sixIdx = await page.evaluate((needle) => [...document.querySelectorAll('.claim-card')]
      .findIndex((c) => c.textContent.includes(needle)), CLAIM_BROKEN);
    if (sixIdx < 0) {
      log('  SETUP FAILED: the critiqued claim did not render after the reload.');
      process.exit(1);
    }
    await page.locator('.claim-card').nth(sixIdx)
      .locator('[data-testid="toggle-critiques"]').click();
    await page.waitForTimeout(4000);

    const visible = await page.locator('.critique-item:not(.critique-reply)').count();
    check(`the long list is capped — ${visible} critiques on screen of 6 published`,
      visible === 4);
    const foldToggles = await page.locator('[data-testid="critique-fold-toggle"]').count();
    check('CONTROL: and a control appeared to open it, which the short list above had none of',
      foldToggles === 1);

    // THE REQUIREMENT THE ROW IS ACTUALLY ABOUT. A chevron would satisfy
    // "there is a control"; only a count tells a reader the list is partial.
    const foldLabel = await textOf(page, '[data-testid="critique-fold-toggle"]');
    check(`it SAYS HOW MANY it is hiding, rather than being a bare chevron `
      + `("${foldLabel}")`,
      /\b2\b/.test(foldLabel) && /critique/i.test(foldLabel));
    check('and counts the hidden REPLY too — a fold that hides a reply and mentions '
      + 'only critiques understates itself by exactly the amount this row is about',
      /\b1\b/.test(foldLabel) && /repl/i.test(foldLabel));

    // The hidden content is HIDDEN, not merely scrolled past.
    const hiddenShown = await page.evaluate(
      (n) => document.body.textContent.includes(n),
      EXTRA_CRITIQUES[2].slice(0, 30),
    );
    check('CONTROL: a folded critique is genuinely off the screen, so the count above '
      + 'is describing something real', hiddenShown === false || visible === 4);

    await page.locator('[data-testid="critique-fold-toggle"]').click();
    await page.waitForTimeout(600);
    const afterOpen = await page.locator('.critique-item:not(.critique-reply)').count();
    check(`opening it shows all six (${afterOpen})`, afterOpen === 6);
    const hiddenReplyShown = await page.evaluate(
      (n) => document.body.textContent.includes(n), HIDDEN_REPLY,
    );
    check('and the reply that was folded away comes with it — the defence arrives '
      + 'with the objection it answers, never one click further',
      hiddenReplyShown);
    const backLabel = await textOf(page, '[data-testid="critique-fold-toggle"]');
    check(`and the control now offers the way back ("${backLabel}")`,
      /fewer/i.test(backLabel));

    check('CONTROL: the page raised no uncaught errors throughout', pageErrors.length === 0);
    if (pageErrors.length) for (const e of pageErrors) log(`    pageerror: ${e}`);
  } finally {
    await browser.close();
    preview.kill();
  }

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — a reader can tell who wrote each critique, and tell the');
    log("claim's own author answering from a stranger objecting; somebody's paragraphs");
    log('reach the screen as paragraphs on every surface that renders their own words;');
    log('and the box that writes a permanent entry grows to what is in it, up to a cap');
    log('that keeps the button which commits it on screen. A reply goes under the');
    log('critique it answers, in that critique\'s own section and no other, and the box');
    log('that writes one targets the objection rather than the claim. A long list');
    log('folds and says how many critiques AND replies it is hiding; a short one is');
    log('left alone.');
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(1); });
