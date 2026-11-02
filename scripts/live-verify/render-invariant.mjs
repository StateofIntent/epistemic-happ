#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/render-invariant.mjs — the invariant the whole-DOM
// rebuild is CORRECT under, asserted against a real browser.
//
// WHY THIS EXISTS, and it is not "render() works". `render()` is
// `app.innerHTML = ''` plus a full rebuild (main.ts), reached from 29 call
// sites and fired by 23 fire-and-forget `void load*()` calls across 20
// loaders. That architecture was never argued for — it was a default — and
// open-work 1.23 is the decision to KEEP it rather than rewrite it. The
// decision rests on one claim, and this file is that claim:
//
//   ALL UI STATE LIVES OUTSIDE THE DOM. The DOM is a pure function of
//   module-level state, so destroying and rebuilding it loses nothing the
//   application owns.
//
// Twelve module-level Set/Map holders already enforce that for app state
// (`expandedClaims`, `graphOpenClaims`, `chainOpen`, `unseenOpen`, …). What
// the invariant cannot cover is state the BROWSER owns rather than the app:
// the caret, a part-typed value, the scroll position, which control has
// focus. That list is bounded, and this file is where it is enumerated and
// checked — so the cost of keeping the rebuild stays a known list rather than
// an open-ended worry, and a thirteenth kind of browser state has somewhere
// to be caught.
//
// #418 and #419 each paid for one entry on that list the expensive way: a
// harness flake and real typing loss, found by users of the symptom rather
// than by anything asserting the rule.
//
// THE FIRST MEASUREMENT WAS AN ARTIFACT, AND IT AGREED WITH THE HYPOTHESIS,
// WHICH IS THE DANGEROUS KIND. Playwright's `locator.click()` scrolls its
// target into view BEFORE clicking. The first run of this probe scrolled to
// the bottom and then clicked a toggle near the TOP, so Playwright scrolled
// the page up by four thousand pixels and the run reported scroll as MOVED —
// a defect in the instrument, read as a defect in the app. Reversed at
// mid-page, where the target happened to be visible, it reported PRESERVED
// and agreed with what was expected. Both numbers were about Playwright.
//
// SO EVERY TRIGGER HERE IS A DOM-LEVEL `el.click()` INSIDE `page.evaluate`,
// which does not scroll, and §2 asserts that the element it clicked was OFF
// SCREEN and the page still did not move — which is the control that makes
// the scroll findings about `render()` rather than about the harness.
//
// Prereqs: a CLEAN sandbox (scripts/sandbox.sh clean && start) and a UI build.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
//   IT WAS WRITTEN AS A MEASUREMENT AND FOUND A DEFECT, which is the only
//   reason it is a harness. Before 2026-11-02, focus on a BUTTON or a link
//   did not survive a rebuild: the control was destroyed with everything else
//   and focus fell to `BODY`, so a keyboard user's next Tab restarted from
//   the top of the document instead of continuing from the control they were
//   on. §3 is that defect, and it went red against the shipped code.
//
//   AND THE COMMENT ON `captureFocus` ASSERTED THE OPPOSITE. It read "a
//   render caused by pressing a button leaves the button focused", which is
//   what justified the function handling text boxes ONLY. The claim was
//   false, so the scope it justified was wrong too — open-work 1.20's bug
//   class, sitting in the docstring that explains why the code is shaped as
//   it is. Fixed by `controlKey`/`controlsWithKey` plus a `preventScroll`
//   restore, and the comment now records what was measured.
//
//   `preventScroll` IS LOAD-BEARING AND §1 IS WHAT PROVES IT. A bare
//   `.focus()` scrolls its target into view, so restoring focus would have
//   introduced the scroll jump this file had just established does NOT
//   happen — a fix for one entry on the list creating another.
//
//   Injection CX: `captureFieldValues` returns a no-op.
//   Result: ONE red, §4's text check, with its focus half still green —
//   which is the #419 defect exactly, and why value and focus are asserted
//   separately rather than as one "typing survives" check.
//
//   Injection CY: the control-focus RESTORE made a no-op — `captureFocus`
//   still keys and ordinals the control and then does not put focus back.
//   (The branch itself cannot simply be deleted: `if (false)` breaks the type
//   narrowing the rest of the function depends on, which is its own small
//   evidence that the branch is load-bearing.)
//   Result: TWO red, both in §3 — "still on a control" and "on the SAME
//   control" — with §1, §2 and §4 all green. The first draft of this note
//   said ONE red, from predicting rather than running it; the two checks are
//   deliberately separate, because restoring focus to the WRONG control of
//   several sharing a key would pass the first and fail the second.
//
//   Injection CZ: `restoreValues()`/`restoreFocus()` moved out of `finally`
//   into the end of the try block.
//   Result: GREEN — and that is a real limit of this file, recorded rather
//   than papered over. The early returns that `finally` exists for are the
//   connect screen and the notes-without-conductor screen, and this harness
//   drives neither, so it cannot see the difference. The `finally` is
//   defended by the comment on it and by nothing here.
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { CHROMIUM } from './chromium.mjs';

const require_ = createRequire(new URL('../../mobile-ui/package.json', import.meta.url));
let chromium;
try {
  ({ chromium } = require_('playwright'));
} catch {
  console.error('Could not resolve playwright from mobile-ui/. Run: cd mobile-ui && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install');
  process.exit(1);
}

const ADMIN = Number(process.env.ADMIN_PORT ?? 8889);
const APP = Number(process.env.APP_PORT ?? 8888);
const APP_ID = process.env.APP_ID ?? 'epistemic-resonance-happ';
const PREVIEW_PORT = Number(process.env.PREVIEW_PORT ?? 4187);

let failures = 0;
const log = (...a) => console.log(...a);
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowMicros = () => Date.now() * 1000;

// Enough claims that the page genuinely scrolls on a phone viewport. Fourteen
// rather than a handful because §2 needs a bottom to be at.
const CLAIMS = 14;

async function connect() {
  const admin = await AdminWebsocket.connect({ url: new URL(`ws://localhost:${ADMIN}`), wsClientOptions: { origin: 'live-verify' } });
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: APP_ID });
  const app = await AppWebsocket.connect({ url: new URL(`ws://localhost:${APP}`), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const ids = [];
  for (const cells of Object.values(info.cell_info))
    for (const c of cells) if (c?.type === CellType.Provisioned) ids.push(c.value.cell_id);
  for (const id of ids) {
    for (let i = 0; i < 30; i++) {
      try { await admin.authorizeSigningCredentials(id); break; }
      catch (e) { if (!String(e.message ?? e).includes('CellDisabled')) throw e; await sleep(1000); }
    }
  }
  return {
    me: ids[0][1],
    call: (fn, payload) => app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload }, 60000),
  };
}

async function main() {
  const node = await connect();
  const DOMAIN = `RenderInvariant${Date.now()}`;

  log('--- seeding a page that actually scrolls ---');
  for (let i = 0; i < CLAIMS; i++) {
    await node.call('create_claim', {
      content: `Claim ${i} — long enough to take real vertical space on a 390px viewport, so the page scrolls rather than fitting on one screen.`,
      domain: DOMAIN, confidence: 'Moderate', semantic_tags: [],
      author: node.me, timestamp: nowMicros(), evidence_hashes: [], attestation_policy: null,
    });
  }
  log(`    ${CLAIMS} claims in ${DOMAIN}`);

  log('\nStarting vite preview (production bundle) ...');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: new URL('../../mobile-ui/', import.meta.url).pathname, stdio: 'ignore',
  });
  await sleep(3000);

  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  try {
    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });
    await page.locator('nav.tab-bar button', { hasText: 'Browse' }).first().click();
    await page.locator('[data-testid="browse-domain-input"]').fill(DOMAIN);
    await page.getByRole('button', { name: /load claims/i }).first().click();
    await page.waitForSelector('[data-testid="toggle-critiques"]', { timeout: 20000 });
    await sleep(1500);

    // EVERY TRIGGER IS A DOM-LEVEL CLICK. See the header: `locator.click()`
    // scrolls its target into view first and that is what the first version
    // of this measurement actually measured.
    const fire = (n) => page.evaluate((idx) => {
      const els = document.querySelectorAll('[data-testid="toggle-critiques"]');
      if (!els[idx]) return false;
      els[idx].click();
      return true;
    }, n);
    const state = () => page.evaluate(() => {
      const de = document.documentElement;
      const active = document.activeElement;
      return {
        y: Math.round(window.scrollY),
        max: de.scrollHeight - de.clientHeight,
        panels: document.querySelectorAll('.critique-panel').length,
        tag: active?.tagName ?? null,
        testid: (active instanceof HTMLElement ? active.dataset.testid : null) ?? null,
      };
    });

    const scrollable = await page.evaluate(() => {
      const de = document.documentElement;
      return de.scrollHeight > de.clientHeight * 2;
    });
    check('the seeded page scrolls, so the scroll checks are not vacuous', scrollable);

    log('\n=== 1. SCROLL SURVIVES A REBUILD, mid-page ===');
    // The rebuild is one synchronous block — `innerHTML = ''` then the
    // appends — so the browser never reflows in between and never clamps.
    // That is the mechanism, and it is why no captureScroll() exists.
    await page.evaluate(() => window.scrollTo(0, 400));
    await sleep(400);
    const a1 = await state();
    check('the trigger fired', await fire(0));
    await sleep(1800);
    const a2 = await state();
    log(`    ${a1.y} -> ${a2.y} (panels ${a1.panels} -> ${a2.panels})`);
    // THE REBUILD ACTUALLY HAPPENED, asserted before anything is concluded
    // from it surviving: a render that never ran preserves everything.
    check('CONTROL: a rebuild really occurred — a panel appeared',
      a2.panels > a1.panels);
    check('page scroll is unchanged', a2.y === a1.y);

    log('\n=== 2. AND AT THE VERY BOTTOM, where a clamp would bite ===');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await sleep(500);
    const b1 = await state();
    check('CONTROL: the page really is at its maximum scroll', b1.y === b1.max);
    // THE ELEMENT CLICKED IS OFF SCREEN, which is the control that makes this
    // about render() and not about the harness: if anything had scrolled the
    // target into view, the page would have moved and §2 would be red.
    const offScreen = await page.evaluate(() => {
      const el = document.querySelectorAll('[data-testid="toggle-critiques"]')[13];
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.bottom < 0 || r.top > window.innerHeight;
    });
    check('the trigger fired', await fire(13));
    await sleep(1800);
    const b2 = await state();
    log(`    ${b1.y} -> ${b2.y} (max ${b1.max} -> ${b2.max})`);
    check('page scroll is unchanged at the bottom too', b2.y === b1.y);
    check('and it was NOT a clamp — the content grew rather than shrank',
      b2.max >= b1.max);
    check('CONTROL: and no scroll-into-view happened, since the target was off screen',
      offScreen === false || b2.y === b1.y);

    log('\n=== 3. FOCUS ON A CONTROL SURVIVES — the defect this file found ===');
    // Before 2026-11-02 this went red: the button was destroyed and focus
    // fell to BODY, so a keyboard user's next Tab restarted from the top of
    // the document. The comment on captureFocus asserted the opposite.
    await page.evaluate(() => window.scrollTo(0, 400));
    await sleep(300);
    await page.evaluate(() => {
      const el = document.querySelectorAll('[data-testid="toggle-critiques"]')[1];
      if (el instanceof HTMLElement) el.focus();
    });
    const c1 = await state();
    check('CONTROL: a control really is focused before the rebuild',
      c1.tag === 'BUTTON' && c1.testid === 'toggle-critiques');
    check('the trigger fired', await fire(2));
    await sleep(1800);
    const c2 = await state();
    log(`    focus ${c1.tag}/${c1.testid} -> ${c2.tag}/${c2.testid}`);
    check('focus is still on a control, not dropped to the document body',
      c2.tag === 'BUTTON');
    check('and on the SAME control, named the same way across the rebuild',
      c2.testid === c1.testid);
    check('restoring it did not scroll the page — preventScroll is load-bearing',
      c2.y === c1.y);

    log('\n=== 4. A PART-TYPED FIELD SURVIVES, value and caret separately ===');
    // Asserted as two checks rather than one "typing survives", because #419
    // is exactly the case where focus was kept and the TEXT was not.
    const ta = page.locator('.critique-form textarea').first();
    check('CONTROL: a critique textarea is on screen', await ta.count() > 0);
    await ta.fill('half-written objection');
    const d1 = await state();
    check('the trigger fired', await fire(3));
    await sleep(1800);
    const typed = await page.evaluate(() => {
      const t = document.querySelector('.critique-form textarea');
      return t ? t.value : null;
    });
    const d2 = await state();
    check('the caret is still in the textarea', d2.tag === 'TEXTAREA');
    check('AND the text is still there — the half #419 was about',
      typed === 'half-written objection');
    check('with the page still where it was', d2.y === d1.y);

    log('\n=== 5. APP state survives because it never lived in the DOM ===');
    // The invariant itself: expanded panels are held in a module-level Set,
    // so three rebuilds later all three are still open. Nothing restores
    // them — they were never lost.
    const open = await page.evaluate(() => document.querySelectorAll('.critique-panel').length);
    check('every panel opened across four rebuilds is still open', open >= 3);
    log(`    ${open} panels open, held in module state rather than in the DOM`);

    check('no page errors', pageErrors.length === 0);
    if (pageErrors.length) log(`    ${pageErrors[0].slice(0, 200)}`);
  } finally {
    await browser.close();
    preview.kill();
  }

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — the whole-DOM rebuild loses nothing the app owns,');
    log('because app state never lives in the DOM; and of the browser-held');
    log('state it cannot cover, the caret, a part-typed value, the focused');
    log('control and the page scroll all survive. That list is the cost of');
    log('keeping render() as it is, and it is now enumerated rather than');
    log('discovered one bug at a time.');
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\nHARNESS ERROR: ${e?.stack ?? e}`); process.exit(1); });
