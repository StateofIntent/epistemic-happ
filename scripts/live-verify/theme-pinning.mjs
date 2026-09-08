#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/theme-pinning.mjs — CAN A USER CHOOSE THE PALETTE, AND
// DOES THE CHOICE ACTUALLY WIN?
//
// WHY THIS EXISTS. style.css took the palette from the OS and nothing else:
// light tokens on :root, dark tokens inside @media (prefers-color-scheme:
// dark). One install therefore rendered as a dark app on a dark desktop and
// a white one on a Windows machine left in the default light app mode, and
// nothing inside the app could say otherwise. That was reported from a real
// pair of installs of the same bundle before this control existed.
//
// THE ONE HARNESS HERE THAT NEEDS NO CONDUCTOR. The theme control sits in the
// title row, which renders before a connection exists — chrome should not be
// gated on being connected — so the Connect screen is a sufficient surface
// and this file runs against `vite preview` alone. That is a property worth
// asserting rather than merely relying on, so it is checked below.
//
// FOUR THINGS ARE EASY TO GET WRONG HERE, and the assertions are shaped by
// them rather than by the happy path:
//
//   1. A PIN HAS TO WIN IN BOTH DIRECTIONS. The obvious implementation —
//      :root[data-theme='dark'] alone — makes pinning dark on a light OS
//      work and pinning light on a dark OS do nothing, because the media
//      query is still in charge. Every check below runs under BOTH emulated
//      OS preferences for exactly that reason; a one-directional bug passes
//      the whole suite at a single colorScheme.
//   2. 'SYSTEM' MUST STAY A LIVE DEFERRAL, not a third fixed palette. It is
//      the default, so most users never leave it, and an implementation that
//      sampled the OS preference once and stamped it would look identical
//      until the OS flipped. So the OS is flipped underneath, on 'system'
//      (must follow) and while pinned (must not).
//   3. THE WIDGETS ARE PAINTED BY THE BROWSER, NOT THE STYLESHEET. Tokens
//      alone leave color-scheme at `light dark`, so pinning light on a dark
//      desktop yields light surfaces with dark scrollbars and a dark caret —
//      a half-applied choice, which is worse than none. Asserted directly.
//   4. A PIN THAT ARRIVES AFTER FIRST PAINT IS THE BUG IT WAS MEANT TO FIX.
//      The module bundle is deferred, so reading the preference only there
//      paints one default-palette frame per launch: a white flash for
//      whoever pinned dark. index.html carries a pre-paint read for this,
//      and the check below holds the bundle back with a route delay so that
//      the stamp it observes demonstrably cannot have come from the module.
//
// Prereqs: a UI build (`cd mobile-ui && npm run build`, or
// scripts/pack-webhapp.sh). A **browser** harness serves the production
// dist/, so a stale build means verifying the previous version of the UI.
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
//   Regression injected: dropped the `:not([data-theme='light'])` guard from
//   the dark media query in mobile-ui/src/style.css, leaving the pin
//   one-directional — the shape a reasonable implementation lands on first.
//   Result: 2 FAILs, both under the dark OS and neither under the light one
//   — pinning light no longer repaints, and no longer survives a reload.
//   Worth noting what stayed GREEN: `pinning light moves color-scheme too`,
//   because that rule lives outside the media query and kept applying. A
//   harness that had only checked color-scheme would have missed this
//   entirely, and one that ran at a single emulated OS preference would have
//   missed it too.
//
//   Regression injected: removed the pre-paint <script> from
//   mobile-ui/index.html, leaving src/theme.ts as the only reader.
//   Result: 1 FAIL — 'root already stamped dark before the bundle runs' —
//   while every other check stayed green, which is the point of holding the
//   bundle back rather than measuring after load.
//
// Re-check it the same way if you change what this file asserts: inject,
// watch it go red, restore, watch it go green.
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const requireFromUi = createRequire(new URL('../../mobile-ui/package.json', import.meta.url));
let chromium;
try {
  ({ chromium } = requireFromUi('playwright'));
} catch {
  console.error('Could not resolve playwright from mobile-ui/. Run: cd mobile-ui && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install');
  process.exit(1);
}

/** Which Chromium to drive.
 *
 * This directory's harnesses were written on a machine with a system
 * Chromium, and hardcoded its path. That is right for the ones that need a
 * conductor — they only ever run where one is already installed — but it is
 * what stopped the conductor-free harnesses from running anywhere else, CI
 * included. Resolution order: an explicit EPI_CHROMIUM, then the system
 * browser these were written against, then Playwright's own download
 * (`executablePath: undefined`), which is what a runner has. */
const CHROMIUM = process.env.EPI_CHROMIUM?.trim()
  || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);

const PREVIEW_PORT = 4176;
const STORAGE_KEY = 'epistemic-mobile-ui:theme';

// The two --bg tokens, as the browser reports them. Asserting the computed
// background rather than the attribute is deliberate: the attribute only
// says what was requested, and a token block edited in one of its two homes
// and not the other would still stamp correctly while painting the wrong
// colour. See style.css's note that the two dark blocks are edited together.
const LIGHT_BG = 'rgb(247, 245, 242)';
const DARK_BG = 'rgb(21, 23, 26)';
const bgFor = (scheme) => (scheme === 'dark' ? DARK_BG : LIGHT_BG);

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};
const checkEq = (label, actual, expected) => {
  if (actual === expected) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); failures++; }
};

const bodyBg = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const colorScheme = (page) => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
const stamped = (page) => page.evaluate(() => document.documentElement.dataset.theme ?? '(none)');
const storedPref = (page) => page.evaluate((k) => localStorage.getItem(k) ?? '(none)', STORAGE_KEY);

const SELECT = '[data-testid="theme-select"]';

async function verifyUnderOs(browser, osScheme, url) {
  log(`\n--- OS preference = ${osScheme} ---`);
  const ctx = await browser.newContext({ colorScheme: osScheme, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate((k) => localStorage.removeItem(k), STORAGE_KEY);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(SELECT, { timeout: 20000 });

  // The control is on the Connect screen, before any conductor exists. If
  // this ever moves behind a connection, this whole harness silently starts
  // needing a sandbox — so it is a check, not an assumption.
  check('the control renders before any connection exists',
    await page.getByRole('button', { name: /connect/i }).first().isVisible());

  checkEq('a fresh install follows the OS', await bodyBg(page), bgFor(osScheme));
  checkEq('a fresh install stamps no attribute', await stamped(page), '(none)');
  checkEq('a fresh install writes no preference', await storedPref(page), '(none)');
  checkEq('the control reads System', await page.inputValue(SELECT), 'system');

  for (const pin of ['dark', 'light']) {
    await page.selectOption(SELECT, pin);
    checkEq(`pinning ${pin} repaints immediately`, await bodyBg(page), bgFor(pin));
    // Browser-painted widgets, not the stylesheet's tokens — trap 3 above.
    checkEq(`pinning ${pin} moves color-scheme too`, await colorScheme(page), pin);
    checkEq(`pinning ${pin} persists`, await storedPref(page), pin);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector(SELECT, { timeout: 20000 });
    checkEq(`a pinned ${pin} survives a reload`, await bodyBg(page), bgFor(pin));
    checkEq(`a pinned ${pin} is reflected back by the control`, await page.inputValue(SELECT), pin);
  }

  await page.selectOption(SELECT, 'system');
  checkEq('returning to System clears the stored preference', await storedPref(page), '(none)');
  checkEq('returning to System clears the attribute', await stamped(page), '(none)');
  checkEq('returning to System follows the OS again', await bodyBg(page), bgFor(osScheme));

  // Trap 2: 'system' is a live deferral, and a pin is not.
  const flipped = osScheme === 'dark' ? 'light' : 'dark';
  await page.emulateMedia({ colorScheme: flipped });
  checkEq('System tracks an OS change made while the app is open', await bodyBg(page), bgFor(flipped));
  await page.selectOption(SELECT, osScheme);
  await page.emulateMedia({ colorScheme: osScheme });
  checkEq(`a pinned ${osScheme} ignores an OS change underneath it`, await bodyBg(page), bgFor(osScheme));

  check('no uncaught page errors', errors.length === 0);
  if (errors.length) log(`  errors: ${errors.join(' | ')}`);
  await ctx.close();
}

// Trap 4. The bundle is held back so it demonstrably has not run when the
// root is inspected; a stamp present at that moment can only have come from
// the pre-paint script in index.html. Measuring after load would pass either
// way, which is what makes the delay the whole check.
async function verifyNoFlash(browser, url) {
  log('\n--- first paint, dark pinned, light OS ---');
  const ctx = await browser.newContext({ colorScheme: 'light', viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((k) => {
    try { localStorage.setItem(k, 'dark'); } catch { /* blocked site-data: the check below will say so */ }
  }, STORAGE_KEY);
  const page = await ctx.newPage();
  await page.route('**/*.js', async (route) => {
    await new Promise((r) => setTimeout(r, 2000));
    await route.continue();
  });
  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForFunction(() => document.documentElement !== null);
  check('the module bundle has not run yet',
    await page.evaluate(() => (document.querySelector('#app')?.childElementCount ?? -1) === 0));
  checkEq('root already stamped dark before the bundle runs', await stamped(page), 'dark');
  await ctx.close();
}

async function main() {
  log('Starting vite preview (production bundle) ...');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: new URL('../../mobile-ui/', import.meta.url).pathname, stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 4000));

  const url = `http://localhost:${PREVIEW_PORT}/`;
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  try {
    // Both, always. A one-directional pin passes either one alone.
    await verifyUnderOs(browser, 'light', url);
    await verifyUnderOs(browser, 'dark', url);
    await verifyNoFlash(browser, url);
  } finally {
    await browser.close();
    preview.kill();
  }

  log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
