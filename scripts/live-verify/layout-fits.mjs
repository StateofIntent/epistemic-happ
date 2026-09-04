#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/layout-fits.mjs — DOES THE PAGE FIT THE SCREEN IT IS
// FOR, ON EVERY TAB, AT EVERY WIDTH, WITH CONTENT THAT CAN BREAK IT?
//
// WHY THIS EXISTS, AND WHY IT IS ITS OWN FILE. Two layout defects shipped in
// this UI and neither was caught by the fifteen browser harnesses that drive
// it every run:
//
//   - The tab bar overflowed and the whole document scrolled sideways, at
//     390, 360 and 320, with `New Claim` — the primary write action — off
//     the right edge. True at five tabs, before a sixth was added.
//   - The stylesheet contained NO wrap rule of any kind, so a single
//     153-character URL in one claim produced 1326px of scroll width inside
//     a 320px viewport. Every user-text surface shared it.
//
// EVERY BROWSER HARNESS RUNS AT 390x844, so all fifteen were driving a page
// that scrolled sideways and none of them looked. They navigate by clicking
// tabs by accessible name, and Playwright scrolls an element into view
// before clicking it, so a tab outside the visible bar is still perfectly
// clickable. A suite can drive a broken layout indefinitely without a single
// red check, because CLICKING IS NOT SEEING.
//
// The first guards for this were added to author-scope-ui.mjs, because that
// is the file whose work uncovered them. That was the wrong home twice over:
// "the page does not scroll sideways" is not a fact about
// `get_claims_by_agent`, and those guards only ever measured one tab. They
// live here now, over every tab, and the audit that found the defects is
// reproducible by someone who was not there.
//
// TWO MEASUREMENT TRAPS, both of which caught this out and are the reason
// the assertions are shaped the way they are:
//
//   1. AN EMPTY SCREEN NEVER OVERFLOWS. The pass that found the wrapping
//      defect reported "no overflow" at 390px and overflow at 360 and 320,
//      which reads like a width-dependent bug. It was not: at 390 the claim
//      had not finished loading and the screen being measured was empty. A
//      true observation and a false conclusion. So every width here asserts
//      FIRST that the breaking content is on the page, and the load is
//      retried rather than an empty screen being accepted as an answer.
//   2. ELEMENT RECTANGLES CANNOT SEE A LONG TOKEN. Text overflows its
//      container without the container's own box ever exceeding the
//      viewport, so a sweep of getBoundingClientRect() over every element
//      reports zero offenders while the document scrolls to 1326px. Text
//      runs have to be measured directly, with a Range.
//
// FOUR OF THE SIX TABS ARE GIVEN CONTENT THAT CAN BREAK THEM, and the other
// two are named rather than glossed. Browse and By Author render a claim
// carrying the token, Domains a membrane whose description carries it, and
// Critique Types a species whose required evidence carries it. Each asserts
// its content is on screen BEFORE being measured — a green from an empty
// screen is exactly the vacuity this file exists to refuse, and both the
// Domains and By Author controls have gone red for precisely that reason on
// their first run, since neither tab loads anything until asked.
//
// Those four are guarded, and it is the injection that says so rather than
// this comment: removing the wrap rule turns twelve checks red, four tabs at
// three widths. Before they were seeded it turned six.
//
// THE OTHER TWO CANNOT FAIL ON CONTENT, and pretending otherwise would be
// the same overstatement this file was written to catch:
//   - New Claim is a form. The token is typed into it, which is worth doing
//     because it exercises the field, but a textarea scrolls its own content
//     internally and cannot push the page sideways however long the input.
//   - Worldline renders dates and short domain names. Checked rather than
//     assumed: the longest unbroken run on that tab is 20 characters, and
//     the checksum appears as a sentence — "Checksum verifies — this trace
//     is intact" — not as a hash. An earlier draft of this comment claimed
//     it rendered long base64 by nature. It does not.
// For those two, a green means the structure fits, and nothing more.
//
// Prereqs: a CLEAN sandbox (scripts/sandbox.sh clean && start) and a UI
// build — scripts/pack-webhapp.sh does both builds in the right order.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing, and BOTH
// injections are defects that genuinely shipped rather than faults imagined
// for the occasion.
//
//   Injection: `overflow-wrap: anywhere` removed from html, body.
//   Result: six red — Browse and By Author at all three widths, each
//   reporting 1326px of scroll width and naming the text run responsible.
//   The four tabs with no long content stayed green, correctly: they have
//   nothing that can break.
//
//   That injection also found a hole IN THIS FILE on its first run, which
//   is the reason the By Author control exists. Browse went red and By
//   Author stayed green — not because the tab was sound, but because it
//   starts empty until asked for an agent, so the measurement had nothing
//   to measure. The vacuity trap this file's header warns about, reproduced
//   inside this file, on the first injection that could expose it. By
//   Author is now loaded from a byline click and asserted to be rendering
//   the token before it is measured.
//
//   Injection: the tab bar's pre-fix CSS put back — `display: flex` with
//   `flex: 1` and no wrapping.
//   Result, FIRST TIME: ALL GREEN, and the harness was wrong. The wrap rule
//   from the other fix masks this one: `anywhere` lets a flex item shrink
//   below its own word width, so instead of overflowing, the bar renders
//   six tabs 65px wide and 100px tall with every label broken mid-word —
//   "Critique Types" shredded down a column. Nothing scrolls sideways, so
//   an overflow-only assertion calls it a pass. Two defects that look
//   identical from the outside and are not, and only one of them is about
//   overflow at all.
//   Result, AFTER ADDING THE LABEL CHECK: eighteen red, every tab at every
//   width, naming "By Author", "Critique Types" and "New Claim" as the
//   labels broken. A text run split across more than two line boxes is the
//   signature — wrapping between words is fine, wrapping inside one is not.
//
//   The lesson is the one this directory keeps relearning in new costume: a
//   check whose label claims more than its assertion tests. "Fits the
//   viewport" claimed the page was laid out acceptably; it tested only that
//   nothing hung off the edge.
//
//   Injection, after every tab was given content of its own: the wrap rule
//   removed again. Result: TWELVE red where the same injection had produced
//   six — Browse, By Author, Domains and Critique Types, at all three
//   widths. That difference is the entire value of the seeding, and it is
//   why the four controls exist: before it, Domains and Critique Types were
//   being measured empty and their green meant nothing.
//
//   Both of those controls earned their place on their first run. Domains
//   went red because that tab loads nothing until "Load domains" is clicked,
//   exactly as By Author loads nothing until asked for an agent. Two tabs,
//   the same trap, caught twice by the same kind of check.
//
//   Restored and re-run: 33 checks green.
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
const PREVIEW_PORT = 4195;
const WIDTHS = [390, 360, 320];
const TABS = ['Browse', 'By Author', 'Domains', 'Critique Types', 'Worldline', 'New Claim'];

const STAMP = Date.now();
const DOMAIN = `Layout${STAMP}`;
// Unbreakable by nature, and the same shape as things this app renders on
// its own account: base64 agent keys, action hashes, pasted links.
const LONG_TOKEN = `https://example.org/evidence/${'a1b2c3d4e5'.repeat(12)}.pdf`;
const CONTENT_LONG = `See ${LONG_TOKEN} for the protocol.`;
const MEMBRANE_DESC = `Seeded for layout verification. Charter: ${LONG_TOKEN}`;
const SPECIES_NAME = `LayoutSpecies${STAMP}`;
const SPECIES_EVIDENCE = `The source, published at ${LONG_TOKEN}`;
const nowSecs = () => Math.floor(Date.now() / 1000);

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};
const nowMicros = () => Date.now() * 1000;

async function zome() {
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: APP_ID });
  const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const cellIds = [];
  for (const rc of Object.values(info.cell_info)) {
    for (const c of rc) {
      // CellInfo became a discriminated union in @holochain/client 0.21
      // ({ type, value }); it used to be keyed by cell type. The old
      // `CellType.Provisioned in cell` test matches nothing against the
      // new shape, silently yielding no cell ids at all.
      if (c?.type === CellType.Provisioned || c?.type === CellType.Cloned) {
        cellIds.push(c.value.cell_id);
      }
    }
  }
  for (const id of cellIds) await admin.authorizeSigningCredentials(id);
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { me: cellIds[0][1], call };
}

/** Everything that decides whether this page fits, measured in one pass. */
const MEASURE = (w) => {
  const doc = document.documentElement;
  const offenders = [];
  for (const el of document.querySelectorAll('body *')) {
    const b = el.getBoundingClientRect();
    if (!b.width && !b.height) continue;
    if (b.right > w + 1 || b.left < -1) {
      offenders.push(`<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 30)}"> ${Math.round(b.left)}..${Math.round(b.right)}`);
    }
  }
  let widestText = 0, widestTextWhere = '';
  for (const el of document.querySelectorAll('p, div, span, li, h1, h2, h3, button, label, td, th')) {
    for (const node of el.childNodes) {
      if (node.nodeType !== 3 || !node.textContent.trim()) continue;
      const rng = document.createRange();
      rng.selectNodeContents(node);
      const right = rng.getBoundingClientRect().right;
      if (right > widestText) {
        widestText = right;
        widestTextWhere = `.${String(el.className).slice(0, 30)}: "${node.textContent.trim().slice(0, 40)}"`;
      }
    }
  }
  const bar = document.querySelector('.tab-bar');
  let barClipped = false;
  let shreddedLabels = [];
  if (bar) {
    const bb = bar.getBoundingClientRect();
    const tabs = [...bar.querySelectorAll('.tab')];
    barClipped = bar.scrollWidth > bar.clientWidth + 1
      || tabs.some((t) => {
        const b = t.getBoundingClientRect();
        return b.left < bb.left - 1 || b.right > bb.right + 1;
      });
    // NOT the same failure as overflow, and it took an injection to learn
    // that. `overflow-wrap: anywhere` lets a flex item shrink below its own
    // word width, so it PREVENTS the bar overflowing by breaking every label
    // mid-word instead — six tabs 65px wide and 100px tall, each label
    // shredded across half a dozen lines. Nothing scrolls; it is still
    // broken. A text run split across more than two line boxes is the
    // signature, since wrapping BETWEEN words is fine and wrapping inside
    // one is not.
    for (const t of tabs) {
      for (const node of t.childNodes) {
        if (node.nodeType !== 3 || !node.textContent.trim()) continue;
        const rng = document.createRange();
        rng.selectNodeContents(node);
        if (rng.getClientRects().length > 2) shreddedLabels.push(node.textContent.trim());
      }
    }
  }
  return {
    pageScrollsX: doc.scrollWidth > doc.clientWidth + 1,
    scrollW: doc.scrollWidth, clientW: doc.clientWidth,
    offenders: offenders.slice(0, 4),
    widestText: Math.round(widestText), widestTextWhere,
    barClipped, shreddedLabels,
  };
};

async function main() {
  const { me, call } = await zome();

  log(`Seeding ${DOMAIN} with a ${LONG_TOKEN.length}-character unbreakable token ...`);
  await call('create_claim', {
    content: CONTENT_LONG, domain: DOMAIN, confidence: 'Moderate', semantic_tags: ['rehab'],
    author: me, timestamp: nowMicros(), evidence_hashes: [], attestation_policy: null,
  });
  await call('create_claim', {
    content: 'An ordinary claim, so the list is not a single special case.',
    domain: DOMAIN, confidence: 'High', semantic_tags: [],
    author: me, timestamp: nowMicros(), evidence_hashes: [], attestation_policy: null,
  });

  // Each remaining tab gets user-authored text of its own carrying the same
  // unbreakable token, so that its check can fail. Measuring these in their
  // default state — which is what this harness did first — exercises their
  // structure and nothing else, and a green from a screen with no content
  // on it is the vacuity this file exists to refuse.
  log('Seeding the other tabs so their checks can fail ...');
  const constitution = await call('publish_constitution', {
    agent: me,
    promises: [{ action: 'state my sources', domain: DOMAIN, modality: null }],
    conditions: [], published_at: nowSecs(), expires_at: null,
  });
  await call('create_membrane', {
    domain: DOMAIN, description: MEMBRANE_DESC,
    required_promises: ['state my sources'], validation_rules_hash: null,
    creator: me, created_at: nowSecs(), constitution,
  });
  await call('create_critique_species', {
    name: SPECIES_NAME, parent_species: null,
    required_evidence: [SPECIES_EVIDENCE], proposer: me, created_at: nowMicros(),
  });
  await call('generate_worldline_trace', {
    period_granularity_secs: 3600, expertise_tags: [], expires_at: null,
  });

  log('Starting vite preview (production bundle) ...');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: new URL('../../mobile-ui/', import.meta.url).pathname, stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 3000));

  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
  try {
    for (const width of WIDTHS) {
      log(`\n=== ${width}px ===`);
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(String(e)));
      await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /connect/i }).first().click();
      await page.waitForSelector('.tab-bar', { timeout: 20000 });

      // Load the domain, retrying rather than accepting an empty screen —
      // trap 1. Without this the checks below can pass on nothing at all.
      await page.locator('.search-row input').first().fill(DOMAIN);
      await page.getByRole('button', { name: 'Load claims' }).first().click();
      try {
        await page.waitForSelector('.claim-card', { timeout: 8000 });
      } catch {
        await page.locator('.search-row input').first().fill(DOMAIN);
        await page.getByRole('button', { name: 'Load claims' }).first().click();
        await page.waitForSelector('.claim-card', { timeout: 20000 });
      }
      await page.waitForTimeout(600);
      check(`${width}px CONTROL: the breaking content is on screen, so nothing below passes vacuously`,
        (await page.locator('.claim-list').first().innerText()).includes(LONG_TOKEN));

      for (const tab of TABS) {
        await page.getByRole('button', { name: tab, exact: true }).click();
        await page.waitForTimeout(700);
        // By Author starts empty until it is asked for an agent, so measuring
        // it straight after the click measures nothing — and an empty screen
        // never overflows. Found by injection: with the wrap rule removed,
        // Browse went red at every width and By Author stayed green, which is
        // the vacuity trap this file warns about, reproduced inside this file.
        // Clicking a byline gives it the same long-token claim to render.
        if (tab === 'Domains') {
          // Like By Author, this tab loads nothing until asked. Its first
          // run here went red on the control below rather than passing on an
          // empty screen, which is the control doing its job.
          const load = page.getByRole('button', { name: 'Load domains' });
          if (await load.count()) { await load.first().click(); }
          await page.waitForTimeout(1800);
          check(`${width}px CONTROL: Domains renders the membrane's long description`,
            (await page.locator('.tab-content').innerText()).includes(LONG_TOKEN));
        }
        if (tab === 'Critique Types') {
          await page.waitForTimeout(1200);
          check(`${width}px CONTROL: Critique Types renders the species' evidence text`,
            (await page.locator('.tab-content').innerText()).includes(LONG_TOKEN));
        }
        if (tab === 'New Claim') {
          // A form holds no user text until someone types some, so typing
          // the token is the only way this tab's check can fail at all.
          const box = page.locator('.tab-content textarea, .tab-content input[type="text"]').first();
          await box.fill(CONTENT_LONG);
          await page.waitForTimeout(400);
        }
        if (tab === 'By Author') {
          const byline = page.locator('[data-testid="author-claim-list"]').locator('..').locator('.author-link');
          if (await page.locator('[data-testid="author-claim-list"] .claim-card').count() === 0) {
            await page.getByRole('button', { name: 'Browse', exact: true }).click();
            await page.waitForSelector('.claim-card', { timeout: 20000 });
            await page.locator('.author-link').first().click();
            await page.waitForSelector('[data-testid="author-claim-list"] .claim-card', { timeout: 20000 });
            await page.waitForTimeout(600);
          }
          void byline;
          check(`${width}px CONTROL: By Author is rendering the long token, not an empty tab`,
            (await page.locator('[data-testid="author-claim-list"]').innerText()).includes(LONG_TOKEN));
        }
        const m = await page.evaluate(MEASURE, width);
        const fits = !m.pageScrollsX && m.offenders.length === 0
          && m.widestText <= width + 1 && !m.barClipped
          && m.shreddedLabels.length === 0;
        check(`${width}px ${tab} fits the viewport`, fits);
        if (!fits) {
          log(`      document ${m.scrollW} vs ${m.clientW}${m.pageScrollsX ? '  SCROLLS SIDEWAYS' : ''}`);
          if (m.barClipped) log('      tab bar: a tab falls outside the bar');
          if (m.shreddedLabels.length) log(`      tab labels broken mid-word: ${JSON.stringify(m.shreddedLabels)}`);
          if (m.widestText > width + 1) log(`      text run reaches ${m.widestText} in ${m.widestTextWhere}`);
          for (const o of m.offenders) log(`      element ${o}`);
        }
      }
      check(`${width}px CONTROL: no uncaught page errors while measuring`, pageErrors.length === 0);
      await page.close();
    }
  } finally {
    await browser.close();
    preview.kill();
  }

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — every tab fits every width this UI is for, with');
    log('an unbreakable token on screen, and the page never scrolls sideways.');
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(1); });
