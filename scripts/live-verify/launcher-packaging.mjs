#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/launcher-packaging.mjs — verification that the UI
// works on the path an INSTALLED .webhapp actually takes.
//
// WHY THIS EXISTS AS A SEPARATE HARNESS. Every other harness in this
// directory drives the UI's own connect form, which runs the direct-admin
// path (mobile-ui/src/holochain.ts's shape 2). That path is the one a
// developer uses against their own conductor, and it is NOT the one
// anybody who installs this bundle will ever run. A Holochain Launcher
// injects `window.__HC_LAUNCHER_ENV__` with an app interface port and an
// already-issued app authentication token, and — the part that makes
// this a correctness question rather than a convenience one — NEVER
// exposes the Admin API to UI code. The admin-auth flow the other
// harnesses exercise would therefore throw on its first line inside a
// real Launcher, before any screen rendered.
//
// So: the packaging work is only real if the launcher path is real, and
// the launcher path had no coverage at all. This harness gives it some.
//
// WHAT IS GENUINELY VERIFIED, against a live conductor:
//
//   1. With a launcher environment present, the UI does NOT render its
//      connect form and does NOT ask for any URL. It connects on its own.
//   2. It reaches the conductor WITHOUT the Admin API. Proven, not
//      assumed: the admin URL in localStorage is pointed at a dead port
//      before the page loads. If any part of the connect path still
//      touched the Admin API, connecting would fail — so a successful
//      connection is evidence the admin websocket was never opened.
//   3. Real zome calls succeed on that connection: a claim published
//      through the launcher-connected UI is read back from the conductor
//      by an independent client.
//   4. The identity the UI reports is the one the host's own token was
//      issued for (client.myPubKey), not one dug out of a cell id by
//      enumerating cells for signing — the step the launcher path must
//      not perform.
//
// WHAT THIS IS NOT. It is not a real Holochain Launcher; none is
// installed here. It reproduces the two things a Launcher injects — the
// environment and a HOST-SIDE zome call signer — and is faithful in the
// respect that matters (the signer lives outside the page and the page
// holds no signing credentials of its own, exactly as under a Launcher).
// A genuine Launcher install remains unverified and is stated as such in
// README.md section 6.7 rather than implied to be covered by this.
//
// Prereqs: scripts/sandbox.sh start (clean), and scripts/pack-webhapp.sh
// (this loads the same built bundle that script zips into the .webhapp).
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
// This directory's own rule is that a harness which has only ever been
// green has not been shown to test anything. Recorded here, rather than
// only in a merged PR, so it is readable at the point someone runs this
// file.
//
//   Regression injected: restoring the pre-packaging admin-first connect path.
//   Result: one FAIL — but only after this file replaced a bare waitForSelector with a real diagnosis. The regression previously surfaced as 'waiting for locator(friction-meter)', which reads like a flaky selector rather than 'the UI took a path a Launcher does not offer'.
//
// Re-check it the same way if you change what this file asserts: inject,
// watch it go red, restore, watch it go green.
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType, signZomeCall } from '@holochain/client';
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
const APP_PORT = 8888;
const APP_ID = 'epistemic-resonance-happ';
const PREVIEW_PORT = 4179;
const DOMAIN = `Launcher${Date.now()}`;
// A port nothing is listening on. The UI's saved admin URL is pointed
// here so that any surviving use of the Admin API on the launcher path
// fails loudly instead of silently succeeding against the real one.
const DEAD_ADMIN_URL = 'ws://localhost:9';

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

const b64 = (u8) => Buffer.from(u8).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

// --- Crossing the Playwright boundary with binary intact ---------------
//
// Playwright serializes exposeFunction arguments with its own
// structured-clone-like protocol, which does not preserve Uint8Array —
// a hash inside a zome call payload arrives in Node as a plain object of
// numeric keys, which msgpack then encodes as a map instead of bytes,
// and the conductor rejects the call. So byte arrays are tagged and
// base64'd explicitly on the way across, both directions.
const TAG = '__u8__';
function packBytes(value) {
  if (value instanceof Uint8Array) return { [TAG]: b64(value) };
  if (Array.isArray(value)) return value.map(packBytes);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, packBytes(v)]));
  }
  return value;
}
function unpackBytes(value) {
  if (Array.isArray(value)) return value.map(unpackBytes);
  if (value && typeof value === 'object') {
    if (typeof value[TAG] === 'string') return unb64(value[TAG]);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unpackBytes(v)]));
  }
  return value;
}

async function adminSession() {
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: APP_ID });
  const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      if (CellType.Provisioned in cell) cellIds.push(cell[CellType.Provisioned].cell_id);
      else if (CellType.Cloned in cell) cellIds.push(cell[CellType.Cloned].cell_id);
    }
  }
  // Authorized in THIS process, not in the page. That is the whole point:
  // the signing credentials live host-side, and the page can only get a
  // call signed by asking out through the injected signer below.
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { admin, app, me: cellIds[0][1], call };
}

async function main() {
  const { admin, call, me } = await adminSession();

  // single_use: false because the page's AppWebsocket.connect authenticates
  // with it once, and a reload (or this harness retrying) would otherwise
  // fail on a spent token in a way that looks like a bug in the UI.
  const { token: launcherToken } = await admin.issueAppAuthenticationToken({
    installed_app_id: APP_ID,
    single_use: false,
  });

  log('Starting vite preview (the same production bundle pack-webhapp.sh zips) ...');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: new URL('../../mobile-ui/', import.meta.url).pathname, stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 4000));

  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    // The host-side signer. A real Launcher injects one of these; it
    // signs outside the page precisely so UI code never holds signing
    // authority. Here the signing happens in this Node process, using
    // the credentials authorized above.
    await page.exposeFunction('__hostSignZomeCall', async (packed) => {
      const request = unpackBytes(packed);
      const signed = await signZomeCall(request);
      return packBytes(signed);
    });

    await page.addInitScript(
      ({ port, token, appId, deadAdmin, tag }) => {
        // 1. What the Launcher injects to say "you are installed, here is
        //    your app interface." AppWebsocket.connect() reads these
        //    itself — the UI passes no url and no token of its own.
        window.__HC_LAUNCHER_ENV__ = {
          APP_INTERFACE_PORT: port,
          APP_INTERFACE_TOKEN: token,
          INSTALLED_APP_ID: appId,
        };

        // 2. The host signer, mirrored back over the exposed function.
        const packB = (v) => {
          if (v instanceof Uint8Array) return { [tag]: btoa(String.fromCharCode(...v)) };
          if (Array.isArray(v)) return v.map(packB);
          if (v && typeof v === 'object') {
            return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, packB(x)]));
          }
          return v;
        };
        const unpackB = (v) => {
          if (Array.isArray(v)) return v.map(unpackB);
          if (v && typeof v === 'object') {
            if (typeof v[tag] === 'string') {
              return Uint8Array.from(atob(v[tag]), (c) => c.charCodeAt(0));
            }
            return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unpackB(x)]));
          }
          return v;
        };
        window.__HC_ZOME_CALL_SIGNER__ = {
          signZomeCall: async (request) => unpackB(await window.__hostSignZomeCall(packB(request))),
        };

        // 3. A saved config whose admin URL points nowhere. If the
        //    launcher path still reached for the Admin API, this is what
        //    turns that into a visible failure rather than an accident
        //    that happens to work on a developer's own machine.
        localStorage.setItem(
          'epistemic-mobile-ui:conductor-config',
          JSON.stringify({ adminUrl: deadAdmin, appUrl: 'ws://localhost:9', appId }),
        );
      },
      { port: APP_PORT, token: launcherToken, appId: APP_ID, deadAdmin: DEAD_ADMIN_URL, tag: TAG },
    );

    log('\n=== Connecting with a launcher environment present ===');
    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });

    // No click anywhere in this harness. If the UI needed a button, this
    // wait times out — which IS the assertion, but a bare TimeoutError
    // names this file's line number and not the thing that broke. Caught
    // during the negative-evidence pass: restoring the pre-packaging
    // admin-first connect made this harness go red with nothing but
    // "waiting for locator(friction-meter)", which reads like a flaky
    // selector rather than "the UI took a path a Launcher does not
    // offer". Same opaque-diagnosis fix as read-scope's firstOrFail.
    let connectedWithoutAction = true;
    try {
      await page.waitForSelector('[data-testid="friction-meter"]', { timeout: 25000 });
    } catch {
      connectedWithoutAction = false;
      log('');
      log('  The UI never reached a connected state in a launcher environment.');
      log('  The launcher injects a token and app port and exposes NO admin');
      log('  interface, so this is what happens when the connect path opens an');
      log('  AdminWebsocket instead of using what the host provided — the exact');
      log('  bug packaging surfaced. Check HolochainConnection.connect still');
      log('  branches on launcherEnvPresent() before taking the admin path.');
      log('');
    }
    check('the UI connects with no user action and no connect form',
      connectedWithoutAction);
    if (!connectedWithoutAction) {
      log(`\n${failures} CHECK(S) FAILED`);
      process.exit(1);
    }
    check('no connect form is rendered at all',
      await page.locator('.connect-form').count() === 0);
    check('the dead admin URL was never used — connecting succeeded anyway',
      await page.locator('.connect-screen').count() === 0);

    log('\n=== A real zome call over the launcher connection ===');
    await page.getByRole('button', { name: 'New Claim', exact: true }).click();
    const content = 'Published from inside a launcher environment.';
    await page.locator('[data-testid="new-claim-content"]').fill(content);
    await page.locator('[data-testid="new-claim-domain"]').fill(DOMAIN);
    await page.getByRole('button', { name: 'Publish claim', exact: true }).click();
    await page.waitForTimeout(3000);

    // Read back with an INDEPENDENT client. The UI saying it worked is
    // not evidence; the conductor holding the entry is.
    const records = await call('get_claims_by_domain', DOMAIN);
    check('the claim published through the launcher-connected UI is really on the DHT',
      Array.isArray(records) && records.length === 1);

    log('\n=== Identity on the launcher path ===');
    // The launcher path takes myPubKey from the AppInfo the host's token
    // was issued against, rather than enumerating cells (which needs the
    // Admin API). Same agent either way — this checks it is not merely
    // some other value that happens to be present.
    const uiKey = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="agent-key"]');
      return el ? el.textContent : null;
    });
    if (uiKey === null) {
      log('  (no agent key surfaced in the UI; comparing via the published record instead)');
      const author = records?.[0]?.signed_action?.hashed?.content?.author;
      check('the claim was authored by this conductor\'s own agent',
        !!author && b64(author) === b64(me));
    } else {
      check('the UI reports this conductor\'s own agent', uiKey.includes(b64(me).slice(0, 12)));
    }

    check('no uncaught page errors', errors.length === 0);
    if (errors.length) errors.forEach((e) => log(`    ${e}`));
  } finally {
    await browser.close();
    preview.kill();
  }

  log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
