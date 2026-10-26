#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/promises-ui.mjs — CAN SOMEBODY PROMISE WITHOUT FOUNDING
// A DOMAIN?
//
// WHY THIS EXISTS. A `Membrane` may declare `required_promises`, and until
// 2026-10-27 this client's ONLY call to `publish_constitution` was inside the
// founding form — so the only way to promise anything was to found a domain,
// while `join_membrane` and the "what this author promises" read were both
// already wired. The protocol's own entry condition was unusable by exactly
// the people it is for: an invitee asked to make the four promises of
// `docs/the-joining-promise.md` had nowhere to make them.
//
// The second half of the same gap: the founding form published exactly ONE
// promise of the founder's own (a single-line input) while accepting SEVERAL
// demands of others (a textarea), so a founder requiring four phrases was
// missing three of them in their own membrane — visible in the first
// `promiseCompliance` read and invisible in the form. Both halves are open-work
// 6.7, and this harness is what makes them stay fixed.
//
// WHAT IT PROVES, and the order is deliberate:
//   §1  The standalone surface exists in the Domains tab, states permanence
//       BEFORE the button, and refuses an empty promise list with a message
//       rather than a zome error.
//   §2  Several promises, published in one call, read back from the DHT by an
//       INDEPENDENT zome call rather than believed off the screen — and the
//       four pilot phrases round-trip byte-identically, which is the property
//       the whole joining promise rests on, since the comparison is string
//       equality.
//   §3  Promises are PER DOMAIN: the same agent's promises in another domain
//       do not appear for this one.
//   §4  Publishing again supersedes for readers and deletes nothing — the
//       later set is what `get_agent_constitution` returns, and Invariant 6
//       means the earlier is still on the record. The screen says so.
//   §5  The FOUNDING form now publishes several own-promises too, and a
//       founder requiring four is missing none of them. This is the half that
//       would have bitten the pilot.
//
// Prereqs: scripts/sandbox.sh clean && scripts/sandbox.sh start, and a built
// UI (cd mobile-ui && npm run build), exactly as the other browser harnesses.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
//   Regression injected: the founding form reverted to publishing only its first own-promise.
//   Result: 2 FAILs in §5 — the founder reads back one promise of four, and
//   is missing three in the membrane they themselves founded. §§1-4 stayed
//   green, which is the point of §5 existing separately.
//
//   Regression injected: the standalone form's promise list truncated to its first line.
//   Result: 3 FAILs in §2 — the count, the round-trip of all four phrases, and
//   the on-screen confirmation that names them.
//
// Re-check the same way if you change what this asserts: inject, watch it go
// red, restore, watch it go green.
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
const PREVIEW_PORT = 4181;
const STAMP = Date.now();
const DOMAIN = `promises${STAMP}`;
const OTHER = `elsewhere${STAMP}`;
const FOUNDED = `founded${STAMP}`;

// The four the pilot actually asks for — docs/the-joining-promise.md §1.
// Byte-identical here on purpose: the comparison these exist for is string
// equality, so this harness is also the regression guard for the phrases.
const FOUR = [
  'answer for what I publish',
  'treat everything I publish as permanent',
  'publish no personal information about another person',
  'answer a complaint about something I published',
];

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};
const same = (a, b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

async function zomeConnection() {
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: APP_ID });
  const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      if (cell?.type === CellType.Provisioned || cell?.type === CellType.Cloned) cellIds.push(cell.value.cell_id);
    }
  }
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { me: cellIds[0][1], call };
}

async function fillAndPublish(page, domain, lines) {
  await page.locator('[data-testid="my-promises-domain"]').fill(domain);
  await page.locator('[data-testid="my-promises-text"]').fill(lines.join('\n'));
  await page.locator('[data-testid="my-promises-submit"]').click();
  await page.waitForSelector('[data-testid="my-promises-current"]:not([hidden])', { timeout: 20000 });
  return (await page.locator('[data-testid="my-promises-current"]').innerText()).trim();
}

async function main() {
  log('Starting vite preview (production bundle) ...');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: new URL('../../mobile-ui/', import.meta.url).pathname, stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 4000));

  const browser = await chromium.launch({ executablePath: CHROMIUM });
  try {
    const { me, call } = await zomeConnection();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });
    await page.getByRole('button', { name: 'Domains', exact: true }).click();
    await page.waitForSelector('[data-testid="my-promises-form"]', { timeout: 20000 });

    log('\n§1 The surface exists without founding anything, and says what it costs');
    check('a promise form is on the Domains tab with no founding form open',
      await page.locator('[data-testid="my-promises-form"]').count() === 1
      && await page.locator('[data-testid="founding-form"]').count() === 0);
    const permanenceY = await page.locator('[data-testid="my-promises-permanence"]').boundingBox();
    const buttonY = await page.locator('[data-testid="my-promises-submit"]').boundingBox();
    check('permanence is stated BEFORE the button, not confirmed after it',
      permanenceY.y < buttonY.y);
    const note = await page.locator('[data-testid="my-promises-permanence"]').innerText();
    check('it says a later publish does not delete the earlier one', /does not replace or delete/i.test(note));
    check('and that this admits you to nothing — joining is separate', /joining is separate/i.test(note));
    await page.locator('[data-testid="my-promises-submit"]').click();
    const err = await page.locator('[data-testid="my-promises-error"]').innerText();
    check('an empty form is refused with a sentence, not a zome error', /at least one thing you promise/i.test(err));

    log('\n§2 Several promises in one call, read back from the DHT');
    const confirmation = await fillAndPublish(page, DOMAIN, FOUR);
    const published = await call('get_agent_constitution', me);
    const inDomain = (published?.promises ?? []).filter((p) => p.domain === DOMAIN).map((p) => p.action);
    check('all four promises are on the DHT, not just the first', inDomain.length === 4);
    check('and byte-identical to what the joining promise asks for', same(inDomain, FOUR));
    check('the screen names them back rather than claiming success', FOUR.every((p) => confirmation.includes(p)));

    log('\n§3 Promises are per domain');
    await fillAndPublish(page, OTHER, ['answer for what I publish']);
    const after = await call('get_agent_constitution', me);
    const forOther = (after?.promises ?? []).filter((p) => p.domain === OTHER).map((p) => p.action);
    const forDomain = (after?.promises ?? []).filter((p) => p.domain === DOMAIN).map((p) => p.action);
    check('the other domain has its own single promise', same(forOther, ['answer for what I publish']));
    check('and the first domain is NOT in this constitution — a later publish supersedes',
      forDomain.length === 0);

    log('\n§4 Superseding is not deletion, and the chain still holds both');
    const all = await call('get_all_constitutions');
    check('every constitution published remains on the record (Invariant 6)',
      Array.isArray(all) && all.length >= 2);

    log('\n§5 The founding form publishes SEVERAL own-promises — the half that would have bitten the pilot');
    await page.locator('[data-testid="found-toggle"]').click();
    await page.waitForSelector('[data-testid="founding-form"]', { timeout: 20000 });
    await page.locator('[data-testid="founder-promise"]').fill(FOUR.join('\n'));
    await page.locator('[data-testid="founding-domain"]').fill(FOUNDED);
    await page.locator('[data-testid="founding-description"]').fill('Founding with four own-promises.');
    await page.locator('[data-testid="founding-required"]').fill(FOUR.join('\n'));
    await page.locator('[data-testid="founding-submit"]').click();
    await page.waitForSelector(`[data-testid="founding-form"]`, { state: 'detached', timeout: 20000 });
    const founded = await call('get_agent_constitution', me);
    const foundedPromises = (founded?.promises ?? []).filter((p) => p.domain === FOUNDED).map((p) => p.action);
    check('the founder published all four of their own promises', foundedPromises.length === 4);
    check('so the founder is missing none of what their own membrane requires', same(foundedPromises, FOUR));

    check('no uncaught page errors', errors.length === 0);
  } finally {
    await browser.close();
    preview.kill();
  }
  log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
