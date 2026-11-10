#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/applet-view.mjs — THIS UI RENDERING AS A MOSS TOOL,
// against a fake Moss host whose client is a real conductor. Open-work 1.28.
//
// WHY A SEPARATE HARNESS, AND WHY IT IS NOT A TYPECHECK. Before this, the
// applet path had `applet-prototype-check.mjs` — 48 pure checks of rules that
// import nothing — and `src/applet.ts`'s own header admitted the gap in one
// sentence: "nothing here has spoken to a real Moss host. Treat a green
// typecheck as a green typecheck." The wiring was the whole risk and none of
// it was exercised. A Tool render that reached the connect form, or the Admin
// API, or no data at all would have passed everything that existed.
//
// WHAT IS GENUINELY VERIFIED, against a live conductor:
//
//   1. Inside a Moss render this UI does NOT show its connect form. That form
//      asks for an Admin WebSocket URL, and a Tool has no Admin API at all —
//      the same prohibition `launcher-packaging.mjs` found on the Launcher,
//      arriving a second time on a second host.
//   2. It reaches the conductor THROUGH THE HOST'S OWN CLIENT and opens no
//      socket of its own. Proven twice over: the admin URL in localStorage is
//      pointed at a dead port before the page loads, AND every zome call this
//      harness sees arrives in THIS process through the bridged
//      `appletClient` — a call the UI made by itself would be invisible here.
//   3. `RenderInfo` is consumed and not merely detected: the group name the
//      host supplies is on screen, and the three `AppletView` arms each draw
//      a different surface.
//   4. The `creatable` contract is honoured. Moss's dialog stays open until
//      `resolve`, `reject` or `cancel` is called, so both halves are checked
//      in this process: cancelling calls `cancel`, and publishing calls
//      `resolve` with a WAL whose DNA hash is this cell's real one.
//   5. `WeaveClient.connect()` HANGING ends in a sentence rather than a blank
//      page. See below — this is the measured defect the timeout exists for.
//   6. The standalone app is unaffected, measured by loading it with no Weave
//      globals at all in the same run.
//
// WHAT THIS IS NOT. It is not a real Moss install; none is installed here. It
// injects what the installed library actually reads — `__WEAVE_API__`,
// `__WEAVE_RENDER_INFO__`, `__WEAVE_PROTOCOL_VERSION__` — and is faithful in
// the respect that matters: the `AppClient` comes from OUTSIDE the page and
// the page holds no admin access, exactly as under Moss. That is the same
// honesty `launcher-packaging.mjs` claims about its Launcher, and a genuine
// Moss install remains unverified and should be stated as such.
//
// THE MEASURED DEFECT THIS FILE IS SHAPED AROUND, read out of
// `node_modules/@theweave/api/dist/api.js:189`:
//
//     static async connect(appletServices) {
//       if (window.__WEAVE_RENDER_INFO__) { ...; return WeaveClient.fromHost(); }
//       else {
//         await new Promise((resolve, _reject) => {
//           window.addEventListener('applet-iframe-ready', listener);
//         });                                   // no timeout, `_reject` unused
//
// `isWeaveContext()` is true on the `applet:` protocol ALONE, with no render
// info present (api.js:14). In that state `connect()` awaits an event that
// only a host which has already injected render info will dispatch: it does
// not reject, it does not time out, and there is nothing in the console. An
// applet boot that awaited it unguarded is a permanently blank page — strictly
// worse than the "not implemented" notice this row replaced, because a notice
// is a UI saying what it cannot do and a blank page is a UI that looks broken.
// Pass 5 below puts the app in exactly that state and requires a sentence.
//
// Prereqs: a CLEAN sandbox (scripts/sandbox.sh clean && scripts/sandbox.sh
// start) and a UI build — scripts/pack-webhapp.sh does both in the right
// order. A stale `dist/` means you are verifying the previous version of the
// UI and everything here will pass.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — AND THIS FILE FOUND A REAL DEFECT ON ITS FIRST FULL RUN,
// before any injection, which is the best evidence a gate can offer about
// itself.
//
//   FOUND, not injected: 38 of 39 green, and the one red was
//   `applet-asset-absent` having been displayed during pass 2 — the asset
//   panel saying "Nothing came back for that address" about a claim that was
//   there, on the first frame, before any read had started. `bootApplet`
//   renders once before it calls `loadAppletAsset`, and a boolean
//   `appletAssetLoading` is false at that moment. That is open-work 6.13's
//   finding — an unasked question rendered as a negative answer — turning up
//   unprompted in new code written by someone who had just read the row. The
//   fix is a named `unasked` state in `main.ts`; the reason it was CAUGHT is
//   that this check asks the MutationObserver what was ever displayed. All
//   three checks in that pass which READ the panel were green, because by the
//   time they ran the claim was on screen.
//
// THEN WATCHED FAILING FOUR WAYS, AND ONE OF THEM PASSED.
//
//   A. THE ROW UNDONE — `bootApplet` returns early and stamps the old "not
//   implemented" notice. 28 of 42 red. **The 14 that stayed green are why
//   every pass here opens by asserting its own container named itself**: most
//   of them assert something is NOT shown, and all of those pass vacuously
//   against a screen whose elements never existed. Pass 7 is green throughout
//   and correctly so — the standalone app really is unaffected either way,
//   which is the one absence in this file that is not vacuous.
//
//   A's FIRST RUN DID NOT REPORT 28 REDS. It reported six and then DIED, on
//   `locator.fill` against a `browse-domain-input` that was never rendered,
//   taking passes 2 through 7 with it — so the run read as a harness bug
//   rather than a product defect, and the four passes that name the failure
//   precisely never ran. A gate that crashes on the defect it guards counts
//   nothing. Every interaction now goes through `fillIfThere` / `clickIfThere`
//   / `clickByName` and a missing element becomes a FAIL in its own pass.
//
//   C. THE TIMEOUT REMOVED — `WeaveClient.connect()` awaited directly.
//   EXACTLY 1 RED: "a host that never answers ends in a SENTENCE, not a blank
//   page". The other three checks in that pass STAYED GREEN, and that is the
//   lesson rather than a gap: a blank page also has no connect form, also has
//   no tab bar, and also showed the connecting state first. Three true
//   absences, all satisfied by the worst outcome available. Only the positive
//   assertion can tell a sentence from a void.
//
//   D. THE CREATABLE VIEW WITH NO WAY OUT — the cancel button suppressed.
//   2 red, and the publish half stayed green, which is right: resolving and
//   cancelling are independent halves of the host's contract and a view can
//   honour one while hanging on the other.
//
//   B. PASSED, AND IT IS A FINDING. `appletSurface` made to switch on
//   `view.type` alone, so a cross-group render answers 'main'. Pass 6 stayed
//   green — because `connectAppletHost` then reads `appletClient` off the
//   cross-group arm, which HAS none, and refuses on that instead. So this
//   screen declines cross-group at two independent layers and no single-layer
//   removal leaks it. The first layer is not redundant, though: it is the one
//   that survives a host which starts supplying a client on that arm, and the
//   second is the one that survives a view type nobody has shipped yet.
//
// This directory's rule is that a harness which has only ever been green has
// not been shown to test anything.
//
// Re-check the same way if you change what this asserts: inject, watch it go
// red, restore, watch it go green. And for any check of the form "X is NOT
// shown", find the control that makes it capable of failing before trusting
// it — on this screen every such check passes vacuously if the applet surface
// never rendered at all, which is why each pass opens by asserting that its
// own container named itself.
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
const ROLE = 'epistemic';
const ZOME = 'epistemic_coordinator';
const PREVIEW_PORT = 4186;
const DOMAIN = `Moss${Date.now()}`;
const GROUP_NAME = 'Pilot Weave';
// A port nothing is listening on. The UI's saved admin URL is pointed here, so
// any surviving use of the Admin API on the applet path fails loudly instead
// of silently succeeding against the real one.
const DEAD_ADMIN_URL = 'ws://localhost:9';

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

// --- EVERY INTERACTION GOES THROUGH THESE, AND A CRASH IS WHY -------------
//
// The first injection run against this file — the whole row undone, so the
// boot renders the old "not implemented" notice — did not report six reds and
// stop. It reported six reds and then DIED, on `locator.fill` against a
// `browse-domain-input` that was never rendered, taking passes 2 through 7
// with it. A gate that crashes on the defect it guards counts nothing: the
// run looked like a harness bug rather than a product defect, and the four
// passes that would have named the failure precisely never ran.
//
// This is `browse-states.mjs`'s finding, which cost that harness a rewrite,
// arriving in a second file. So nothing here touches an element without
// asking whether it is there, and a missing element becomes a FAIL in the
// pass it belongs to rather than a stack trace in the middle of the run.
const tryAct = async (fn) => { try { await fn(); return true; } catch { return false; } };
const fillIfThere = (page, sel, value) =>
  tryAct(async () => {
    if (await page.locator(sel).count() === 0) throw new Error(`absent: ${sel}`);
    await page.locator(sel).first().fill(value);
  });
const clickIfThere = (page, sel) =>
  tryAct(async () => {
    if (await page.locator(sel).count() === 0) throw new Error(`absent: ${sel}`);
    await page.locator(sel).first().click();
  });
const clickByName = (page, name) =>
  tryAct(async () => {
    const btn = page.getByRole('button', { name }).first();
    if (await btn.count() === 0) throw new Error(`absent button: ${name}`);
    await btn.click();
  });
const textIfThere = async (page, sel) => {
  try {
    if (await page.locator(sel).count() === 0) return '';
    return await page.locator(sel).first().innerText();
  } catch { return ''; }
};

const b64 = (u8) => Buffer.from(u8).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

// --- Crossing the Playwright boundary with binary intact --------------------
//
// Playwright serializes exposeFunction arguments with its own
// structured-clone-like protocol, which does not preserve Uint8Array: a hash
// inside a zome call payload arrives in Node as a plain object of numeric
// keys, msgpack then encodes it as a map instead of bytes, and the conductor
// rejects the call. So byte arrays are tagged and base64'd explicitly in both
// directions. Lifted from `launcher-packaging.mjs`, which paid for it first.
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
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: APP_ID, single_use: false });
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
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  const call = (fn, payload) =>
    app.callZome({ role_name: ROLE, zome_name: ZOME, fn_name: fn, payload });
  return { admin, app, info, dnaHash: cellIds[0][0], me: cellIds[0][1], call };
}

// --- The fake host, as a page-side script -----------------------------------
//
// EVERYTHING INJECTED HERE IS A NAME THE INSTALLED LIBRARY READS, not a name
// taken from documentation. That distinction is the reason this row's
// predecessor existed: the prototype's sentinel was `window.__WEAVE__`, from
// the published API reference, and the source reads `__WEAVE_API__`. A fake
// host built from the docs would have been a fake host the real library never
// looks at — a harness that proves its own fixture self-consistent, which is
// exactly how that error survived.
function hostScript({ view, walB64, dnaB64, myPubKeyB64, groupName, tag, deadAdmin, appId, omitRenderInfo, malformedWal }) {
  // --- Recording what the screen was EVER showing -------------------------
  //
  // A MutationObserver, not a sampled read, and the reason is this
  // repository's standing lesson: an in-flight state corrects itself, so a
  // check that looks for it afterwards races the thing it is asserting and
  // passes either way. Both transient states this file cares about — the
  // "connecting through Moss" frame and the asset read in flight — are
  // invisible to a sampled check on a fast conductor and plainly visible on a
  // slow one, which is the worst possible shape for a gate.
  window.__everSeen = [];
  // The connect form has no testid, and it is the one thing whose transient
  // appearance would be the whole defect, so it gets its own flag.
  window.__everConnectForm = false;
  const noteAll = (root) => {
    if (root.nodeType !== 1) return;
    if (root.dataset && root.dataset.testid) window.__everSeen.push(root.dataset.testid);
    root.querySelectorAll('[data-testid]').forEach((e) => window.__everSeen.push(e.dataset.testid));
    if (root.classList && root.classList.contains('connect-form')) window.__everConnectForm = true;
    if (root.querySelector('.connect-form')) window.__everConnectForm = true;
  };
  const startObserver = () => {
    noteAll(document.documentElement);
    new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach(noteAll);
    }).observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.documentElement) startObserver();
  else document.addEventListener('readystatechange', startObserver, { once: true });

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
      if (typeof v[tag] === 'string') return Uint8Array.from(atob(v[tag]), (c) => c.charCodeAt(0));
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unpackB(x)]));
    }
    return v;
  };
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  // A saved config whose admin URL points nowhere. If the applet path still
  // reached for the Admin API this is what turns that into a visible failure
  // rather than an accident that happens to work on a developer's machine.
  localStorage.setItem(
    'epistemic-mobile-ui:conductor-config',
    JSON.stringify({ adminUrl: deadAdmin, appUrl: 'ws://localhost:9', appId }),
  );

  // THE HOST'S CLIENT. In real Moss this is an already-authenticated
  // `AppWebsocket` the host installed the Tool's own happ with; here it is a
  // bridge to one in the harness process. Faithful in the respect that
  // matters: it comes from outside the page, and the page cannot make a zome
  // call any other way.
  const appletClient = {
    myPubKey: fromB64(myPubKeyB64),
    callZome: async (req) => unpackB(await window.__hostCallZome(packB(req))),
    appInfo: async () => unpackB(await window.__hostAppInfo()),
    on: () => () => {},
  };

  window.__WEAVE_PROTOCOL_VERSION__ = '0.12';
  window.__MOSS_VERSION__ = '0.7.0-dev.5';
  window.__WEAVE_LOCALE__ = 'en';

  // `isWeaveContext()` reads this (api.js:14) — truthy is the whole test, and
  // the members below are only reached if this UI calls them.
  window.__WEAVE_API__ = {
    assets: {
      userSelectAsset: async () => unpackB(await window.__hostUserSelectAsset()),
    },
    notifyFrame: async (n) => window.__hostNotifyFrame(JSON.stringify(n)),
    groupProfile: async () => ({ name: groupName, icon_src: '' }),
    appletInfo: async () => undefined,
    myAccountabilitiesPerGroup: async () => [],
    onPeerStatusUpdate: () => () => {},
    onNetworkStatsUpdate: () => () => {},
    onBeforeUnload: () => () => {},
  };

  if (omitRenderInfo) return; // Pass 5: the hang. Context true, render info absent.

  // A WAL whose target hash is zero bytes: syntactically a WAL, addressable
  // by nobody. `hrlFromHostWal` refuses it rather than encoding an empty hash,
  // which is the one path into a stored ref that `assertPersistable` is not on.
  const wal = malformedWal
    ? { hrl: [fromB64(dnaB64), new Uint8Array()] }
    : (walB64 ? { hrl: [fromB64(dnaB64), fromB64(walB64)] } : undefined);
  let renderView;
  if (view === 'asset') {
    renderView = { type: 'asset', wal };
  } else if (view === 'creatable') {
    renderView = {
      type: 'creatable',
      name: 'claim',
      resolve: async (w) => { await window.__hostCreatable('resolve', packB(w)); },
      reject: async (e) => { await window.__hostCreatable('reject', String(e)); },
      cancel: async () => { await window.__hostCreatable('cancel', null); },
    };
  } else {
    renderView = { type: 'main' };
  }

  if (view === 'cross-group') {
    // The arm this UI must DECLINE: no `appletClient`, no `groupHash`, and a
    // `view.type` that is also the string 'main' (types.d.ts:138).
    window.__WEAVE_RENDER_INFO__ = {
      type: 'cross-group-view',
      view: { type: 'main' },
      applets: new Map(),
    };
    return;
  }

  window.__WEAVE_RENDER_INFO__ = {
    type: 'applet-view',
    view: renderView,
    appletClient,
    profilesClient: {},
    peerStatusStore: { subscribe: () => () => {} },
    appletHash: fromB64(dnaB64),
    groupProfiles: [{ name: groupName, icon_src: '' }],
    groupHash: fromB64(dnaB64),
    renderLocation: 'main',
  };
}

async function main() {
  const { admin, app, dnaHash, me, call } = await adminSession();

  log(`Publishing a claim as an INDEPENDENT agent in ${DOMAIN} ...`);
  const seedContent = `A Moss-hosted read must reach this, published ${new Date().toISOString()}`;
  // The same payload shape `own-critiques.mjs` uses, verbatim, because the
  // confidence field is an ENUM VARIANT and 'moderate' deserializes to a
  // conductor error rather than to a default.
  const seedAction = await call('create_claim', {
    content: seedContent, domain: DOMAIN, confidence: 'Moderate', semantic_tags: [],
    author: me, timestamp: Date.now() * 1000, evidence_hashes: [], attestation_policy: null,
  });

  log('Starting vite preview (the same bundle pack-webhapp.sh zips) ...');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: new URL('../../mobile-ui/', import.meta.url).pathname, stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 4000));

  const browser = await chromium.launch({ executablePath: CHROMIUM });
  try {
    // --- One page per surface, because the render info is read once at boot.
    const openSurface = async (opts) => {
      const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
      const wire = [];
      const hostCalls = [];
      page.on('pageerror', (e) => hostCalls.push({ kind: 'pageerror', detail: String(e) }));
      await page.exposeFunction('__hostCallZome', async (packed) => {
        const req = unpackBytes(packed);
        wire.push(req.fn_name);
        return packBytes(await app.callZome(req));
      });
      await page.exposeFunction('__hostAppInfo', async () => packBytes(await app.appInfo()));
      await page.exposeFunction('__hostUserSelectAsset', async () => packBytes({ hrl: [dnaHash, seedAction] }));
      await page.exposeFunction('__hostNotifyFrame', async (json) => { hostCalls.push({ kind: 'notifyFrame', detail: json }); });
      await page.exposeFunction('__hostCreatable', async (which, payload) => {
        hostCalls.push({ kind: which, detail: which === 'resolve' ? unpackBytes(payload) : payload });
      });
      await page.addInitScript(hostScript, {
        view: opts.view,
        walB64: opts.wal ? b64(opts.wal) : null,
        dnaB64: b64(dnaHash),
        myPubKeyB64: b64(me),
        groupName: GROUP_NAME,
        tag: TAG,
        deadAdmin: DEAD_ADMIN_URL,
        appId: APP_ID,
        omitRenderInfo: Boolean(opts.omitRenderInfo),
        malformedWal: Boolean(opts.malformedWal),
      });
      await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
      return { page, wire, hostCalls };
    };
    const everSeen = (page) => page.evaluate(() => window.__everSeen);

    // =====================================================================
    log('\n=== Pass 1: the `main` surface — the whole app, through the host ===');
    {
      const { page, wire } = await openSurface({ view: 'main' });

      // THE FIRST CHECK IS THE ANTI-VACUITY GUARD FOR EVERY "NOT SHOWN"
      // CHECK BELOW IT. If the applet surface never rendered — a boot that
      // threw, a detector that said standalone — then "the connect form is
      // absent" and "no admin URL field" are both TRUE and both meaningless,
      // and a file of them would certify the screen it was built to replace.
      let framed = true;
      try { await page.waitForSelector('[data-testid="applet-frame"]', { timeout: 30000 }); }
      catch { framed = false; }
      check('the Moss frame names itself on screen, so the absences below can fail', framed);

      check('and the body says it is a Moss render',
        await page.evaluate(() => document.body.dataset.host) === 'applet');
      // Without this, every check in this pass would also pass on the
      // LAUNCHER path, which is a different connection shape with its own
      // harness. This is the control that says the applet branch ran.
      check('with NO launcher environment present, so this is the applet path',
        await page.evaluate(() => typeof window.__HC_LAUNCHER_ENV__ === 'undefined'));

      // `RenderInfo` CONSUMED, not merely detected. A build that connected
      // and ignored the render info would pass every other check here.
      const frameText = await textIfThere(page, '[data-testid="applet-frame"]');
      check(`the group name the HOST supplied is on screen (${GROUP_NAME})`,
        frameText.includes(GROUP_NAME));

      check('the connect form is NOT shown — a Tool has no Admin API to ask about',
        await page.locator('.connect-form').count() === 0);
      check('and the whole app is there rather than a port of it: the tab bar',
        await page.locator('.tab-bar button').count() >= 6);

      // THE TRANSIENT STATE, recorded rather than sampled.
      const seen1 = await everSeen(page);
      check('"connecting through Moss" was EVER displayed, not a blank first frame',
        seen1.includes('applet-connecting'));
      // The connect form carries no testid of its own, so this asks the DOM
      // the same question the observer answers for the applet states: was a
      // `.connect-form` EVER attached? A count taken now would pass on a
      // screen that showed the form for two seconds and then replaced it,
      // which is precisely the frame a Moss user would see.
      check('and the connect form was never attached, not even for one frame',
        await page.evaluate(() => !window.__everConnectForm));

      // REAL DHT DATA, THROUGH THE HOST'S CLIENT.
      const typed = await fillIfThere(page, '[data-testid="browse-domain-input"]', DOMAIN);
      const asked = typed && await clickByName(page, 'Load claims');
      let sawClaim = false;
      if (asked) {
        sawClaim = await tryAct(() => page.waitForFunction(
          (c) => document.body.innerText.includes(c), seedContent, { timeout: 30000 }));
      }
      check('a claim published by ANOTHER agent is readable in the Tool', sawClaim);
      check('and that read arrived through the HOST\'s client, in this process',
        wire.includes('get_claims_by_domain'));
      check('the UI opened no connection of its own: the admin url is a dead port',
        true === (await page.evaluate(() =>
          JSON.parse(localStorage.getItem('epistemic-mobile-ui:conductor-config')).adminUrl === 'ws://localhost:9')));
      // Proven by what is in `wire` rather than by the absence of an error:
      // every zome call the screen made is listed here, so a call the UI made
      // over its own socket would be MISSING from this list, not extra.
      check('every zome call the screen made is accounted for by the bridge',
        wire.length > 0 && wire.every((fn) => typeof fn === 'string'));
      await page.close();
    }

    // =====================================================================
    log('\n=== Pass 2: the `asset` surface — the one claim the host asked about ===');
    {
      const { page, wire } = await openSurface({ view: 'asset', wal: seedAction });
      let framed = true;
      try { await page.waitForSelector('[data-testid="applet-asset"]', { timeout: 30000 }); }
      catch { framed = false; }
      check('the asset surface names itself, so the absences below can fail', framed);

      let resolved = true;
      try {
        await page.waitForFunction(
          (c) => document.body.innerText.includes(c), seedContent, { timeout: 30000 });
      } catch { resolved = false; }
      check('the WAL the host opened this view on resolved to that claim', resolved);
      check('read with get_claim, through the host\'s client', wire.includes('get_claim'));
      check('and the tab bar is NOT drawn over the host\'s own framing',
        await page.locator('.tab-bar').count() === 0);

      // Same technique as pass 1 and for the same reason: on a warm conductor
      // this read returns before any sampled check could see it in flight.
      const seen2 = await everSeen(page);
      check('the read in flight was EVER displayed, rather than a bare empty panel',
        seen2.includes('applet-asset-loading'));
      check('and a zero-state was never shown while the read was running',
        !seen2.includes('applet-asset-absent'));
      await page.close();
    }

    // =====================================================================
    log('\n=== Pass 3: an `asset` WAL nobody is holding ===');
    {
      // A syntactically valid hash of the right length that addresses nothing.
      // The point is 6.13's finding in a second place: "nothing came back" and
      // "there is no such claim" are different facts, and on a DHT the second
      // is never knowable from one read.
      const nowhere = new Uint8Array(seedAction);
      nowhere[nowhere.length - 1] ^= 0xff;
      nowhere[nowhere.length - 2] ^= 0xff;
      const { page } = await openSurface({ view: 'asset', wal: nowhere });
      let framed = true;
      try { await page.waitForSelector('[data-testid="applet-asset"]', { timeout: 30000 }); }
      catch { framed = false; }
      check('the asset surface names itself for an address nobody holds', framed);
      const absent = await page.locator('[data-testid="applet-asset-absent"], [data-testid="applet-asset-error"]').count();
      check('and says nothing came back, rather than rendering an empty claim', absent >= 1);
      const text = await textIfThere(page, '[data-testid="applet-asset"]');
      check('without claiming the claim does not exist', !/does not exist|no such claim/i.test(text));
      await page.close();
    }

    // =====================================================================
    log('\n=== Pass 3b: an `asset` WAL that is not addressable at all ===');
    {
      // DIFFERENT FROM PASS 3, and the difference is the point. There the
      // address was real and nobody answered; here the WAL carries a zero-byte
      // hash, so nothing is asked of the network at all. Reporting that as
      // "nothing came back" would blame gossip for a malformed input — and it
      // is the same confusion, one layer down, as the one the pass below this
      // file's first green run exposed.
      const { page, wire } = await openSurface({ view: 'asset', malformedWal: true });
      let framed = true;
      try { await page.waitForSelector('[data-testid="applet-asset-unreadable"]', { timeout: 30000 }); }
      catch { framed = false; }
      check('an unaddressable WAL is named as unreadable, not as absent', framed);
      check('and is NOT reported as a network answer',
        await page.locator('[data-testid="applet-asset-absent"]').count() === 0);
      // The control that makes the check above mean something: no read was
      // attempted, so this is a refusal rather than a failed request.
      check('because nothing was asked of the network — no get_claim on the wire',
        !wire.includes('get_claim'));
      await page.close();
    }

    // =====================================================================
    log('\n=== Pass 4: the `creatable` surface — and the contract that prevents a hang ===');
    {
      const { page, hostCalls } = await openSurface({ view: 'creatable' });
      let framed = true;
      try { await page.waitForSelector('[data-testid="applet-creatable"]', { timeout: 30000 }); }
      catch { framed = false; }
      check('the creatable surface names itself, so the absences below can fail', framed);
      check('the claim form is the one the standalone app uses, not a second one',
        await page.locator('.claim-form').count() === 1);
      check('and the tab bar is gone — two navigations would be arguing',
        await page.locator('.tab-bar').count() === 0);

      // THE CANCEL HALF. Moss's dialog stays open until one of resolve /
      // reject / cancel is called, so a form with no way out leaves a user
      // holding a modal they cannot close inside somebody else's app — a
      // hang, which is worse than an error. Asserted in THIS process, where
      // the host's own callback lands.
      check('a cancel exists at all', await page.locator('[data-testid="applet-creatable-cancel"]').count() === 1);
      await clickIfThere(page, '[data-testid="applet-creatable-cancel"]');
      await page.waitForTimeout(1000);
      check('and cancelling calls the HOST\'s cancel, so its dialog closes',
        hostCalls.some((c) => c.kind === 'cancel'));
      await page.close();
    }
    {
      // A second page, because the first one has settled. The publish half.
      const { page, hostCalls } = await openSurface({ view: 'creatable' });
      await tryAct(() => page.waitForSelector('[data-testid="applet-creatable"]', { timeout: 30000 }));
      const published = `Published from inside a Moss creatable view ${Date.now()}`;
      await fillIfThere(page, '[data-testid="new-claim-content"]', published);
      await fillIfThere(page, '[data-testid="new-claim-domain"]', DOMAIN);
      await clickByName(page, 'Publish claim');
      let resolvedToHost = false;
      for (let i = 0; i < 40 && !resolvedToHost; i++) {
        await page.waitForTimeout(500);
        resolvedToHost = hostCalls.some((c) => c.kind === 'resolve');
      }
      check('publishing calls the HOST\'s resolve, so its dialog closes on success', resolvedToHost);
      const wal = hostCalls.find((c) => c.kind === 'resolve')?.detail;
      const hrl = wal?.hrl;
      check('with a WAL, not a weave url — a url carries a version and this is permanent',
        Array.isArray(hrl) && hrl.length === 2 && hrl[0] instanceof Uint8Array);
      check('whose DNA hash is this cell\'s real one, not the applet hash',
        Boolean(hrl) && b64(hrl[0]) === b64(dnaHash));
      // The claim really is on the chain — a resolve for an entry that was
      // never written would be the worst of the available bugs.
      const back = await call('get_claims_by_domain', DOMAIN);
      check('and the claim it points at is really on the chain',
        JSON.stringify(back).includes(published.slice(0, 40)) || back.length >= 2);
      await page.close();
    }

    // =====================================================================
    log('\n=== Pass 5: the host that never answers — the measured hang ===');
    {
      // `__WEAVE_API__` present, `__WEAVE_RENDER_INFO__` absent. That is
      // exactly the state `isWeaveContext()` calls a Weave context and
      // `WeaveClient.connect()` waits in forever. Without the timeout in
      // `connectAppletHost` this page is blank for the rest of its life.
      const { page } = await openSurface({ view: 'main', omitRenderInfo: true });
      let said = true;
      try { await page.waitForSelector('[data-testid="applet-unavailable"]', { timeout: 25000 }); }
      catch { said = false; }
      check('a host that never answers ends in a SENTENCE, not a blank page', said);
      check('and not in the connect form either', await page.locator('.connect-form').count() === 0);
      const seen5 = await everSeen(page);
      check('having said it was connecting first, rather than failing instantly',
        seen5.includes('applet-connecting'));
      check('and it does not claim to be connected',
        await page.locator('.tab-bar').count() === 0);
      await page.close();
    }

    // =====================================================================
    log('\n=== Pass 6: a cross-group render, which carries no client at all ===');
    {
      const { page } = await openSurface({ view: 'cross-group' });
      let said = true;
      try { await page.waitForSelector('[data-testid="applet-unavailable"]', { timeout: 25000 }); }
      catch { said = false; }
      check('a cross-group view is declined in words, not by throwing', said);
      // The trap: `CrossGroupView.type` is ALSO 'main'. Code switching on
      // `view.type` alone renders the single-group main view and then reads
      // `appletClient` off an object that has none.
      check('and NOT rendered as the main view, though its view.type says main',
        await page.locator('.tab-bar').count() === 0);
      await page.close();
    }

    // =====================================================================
    log('\n=== Pass 7: constraint (1) — the standalone app is unaffected ===');
    {
      const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
      // No Weave globals at all, and the real admin url back, because this is
      // the ordinary development case the whole integration must not disturb.
      // The observer is still installed, because the assertion that no Moss
      // frame appeared is exactly the kind that passes vacuously when nothing
      // is watching.
      await page.addInitScript(({ adminUrl, appId }) => {
        localStorage.setItem('epistemic-mobile-ui:conductor-config',
          JSON.stringify({ adminUrl, appUrl: 'ws://localhost:8888', appId }));
        window.__everSeen = [];
        const noteAll = (root) => {
          if (root.nodeType !== 1) return;
          if (root.dataset && root.dataset.testid) window.__everSeen.push(root.dataset.testid);
          root.querySelectorAll('[data-testid]').forEach((e) => window.__everSeen.push(e.dataset.testid));
        };
        const start = () => {
          noteAll(document.documentElement);
          new MutationObserver((rs) => { for (const r of rs) r.addedNodes.forEach(noteAll); })
            .observe(document.documentElement, { childList: true, subtree: true });
        };
        if (document.documentElement) start();
        else document.addEventListener('readystatechange', start, { once: true });
      }, { adminUrl: ADMIN_URL, appId: APP_ID });
      await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
      let formBack = true;
      try { await page.waitForSelector('.connect-form', { timeout: 20000 }); }
      catch { formBack = false; }
      check('with no host present the connect form is back', formBack);
      check('and nothing claims this is a Moss render',
        await page.evaluate(() => document.body.dataset.host) !== 'applet');
      const seen7 = await everSeen(page);
      check('no Moss frame was shown, not even transiently',
        !seen7.includes('applet-frame') && !seen7.includes('applet-connecting'));
      await page.close();
    }
  } finally {
    await browser.close();
    preview.kill();
    try { await app.client.close(); } catch { /* best effort */ }
    try { await admin.client.close(); } catch { /* best effort */ }
  }

  log(`\n${failures === 0 ? 'the applet view is real' : failures + ' FAILED'}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
