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
//   7. OPEN-WORK 1.31: a critique byline carries the HOST's name for its
//      author AND the author's key, with a control on the same screen — an
//      agent the host has no name for still renders bare, so a name being
//      shown is a name that was fetched rather than a constant being painted.
//   8. OPEN-WORK 1.32: an announcement that a critique landed MARKS an open
//      panel without bringing the critique into it, and publishing one sends
//      an announcement carrying a claim reference and nothing else. Three
//      controls, because this is a feature whose whole risk is firing when it
//      should not: another claim's announcement, another Tool's signal, and a
//      malformed payload must each mark nothing.
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
//   F. THE LOOP-CLOSING CHECK, WHICH HAD NO COVERAGE UNTIL 2026-11-15 AND IS
//   WHY THIS ENTRY EXISTS AT ALL. `finishCreatable` made to resolve
//   `{ hrl: [result.dnaHash, result.dnaHash] }` — the DNA hash where the
//   claim's target hash belongs, so Moss is handed a WELL-FORMED WAL pointing
//   at the wrong thing. **Exactly 1 red**, pass 4's independent resolution,
//   and the two checks beside it STAYED GREEN: the WAL is still a two-element
//   hrl of two `Uint8Array`s, and its DNA hash is still this cell's real one.
//   Only reading the target back through a separate client can see it.
//
//   WHY IT HAD NO RECORD. The check was REWRITTEN rather than added — its
//   predecessor passed on `includes(published) || back.length >= 2`, and the
//   second disjunct is true the moment the seed claim and this one both
//   exist, so it would have gone green for a resolve carrying any hash at
//   all. Rewriting it retired the old label, and the injection ledger keys
//   coverage BY LABEL — correctly, since a label is the evidence — so the
//   stronger check inherited nothing from the weaker one it replaced and sat
//   unprobed while `ledger verify` reported the retired label as a red that
//   never resolved. **The general lesson: strengthening a check resets its
//   coverage to zero, and the ledger will say so if anybody reads it.**
//
//   G. PASS 8's WHOLE SUBJECT REMOVED — the host notify call dropped at the
//   signal receiver, so the Moss arm goes silent while 6.15's in-app line
//   still works. **5 red of 51.** The two CONTROLS stayed green, correctly,
//   since they assert an absence that is still true — and so did *no count in
//   it*, VACUOUSLY: with nothing raised there is no text to search, which is
//   why the presence check is asserted first and this one is listed second.
//
//   H. `urgency` RAISED FROM 'low' TO 'medium', which is the plausible "make
//   it more visible" change somebody will reach for. **Exactly 1 red**, and
//   that is the point: 'medium' is documented as A DOT IN THE SYSTEM TRAY
//   (types.d.ts:62-66), which is the thing 6.15's decision refused by name,
//   arriving from the other side of the host boundary where no in-app check
//   can see it. Every other assertion in the pass stayed green, because the
//   notice is otherwise identical.
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
// Open-work 1.30's pass needs somebody ELSE to do the critiquing, and until
// that pass existed this file ran on one agent throughout — its seed claim is
// published by the harness's own key over a second socket, which is a
// different CLIENT and not a different author.
const AGENT2_APP_ID = 'epistemic-resonance-happ-moss2';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;
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

// The byline the UI itself renders, copied from `main.ts` rather than
// approximated: `HASH_TAG_CHARS = 4` is skipped because EVERY agent key's
// base64 begins `hCAk`, so a naive first-12 would make two people's bylines
// identical for four characters before differing (open-work 6.23, measured
// over 8 real keys). A check that re-derived this differently would compare
// the screen against a rule the screen does not use.
const HASH_TAG_CHARS = 4;
const short = (bytes) => b64(bytes).slice(HASH_TAG_CHARS, HASH_TAG_CHARS + 12) + '…';

/** A second agent's own app socket. Separate from `adminSession` because that
 *  one also authorizes signing credentials for the cell the PAGE drives, and
 *  this agent never touches the page — it only critiques. */
async function connectSecond(admin, appId) {
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: appId, single_use: false });
  const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  let cellId = null;
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      if (cell?.type === CellType.Provisioned || cell?.type === CellType.Cloned) cellId = cell.value.cell_id;
    }
  }
  if (!cellId) throw new Error(`App "${appId}" has no provisioned cell.`);
  await admin.authorizeSigningCredentials(cellId);
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { app, me: cellId[1], call };
}

/** Poll until a predicate holds, so gossip between two agents on one
 *  conductor is waited FOR rather than slept through — a fixed sleep is the
 *  thing that makes a two-agent fixture flake. */
async function waitFor(what, predicate, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { if (await predicate()) return true; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  log(`  SETUP FAILED: timed out waiting for ${what}.`);
  process.exit(1);
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
function hostScript({ view, walB64, dnaB64, myPubKeyB64, groupName, tag, deadAdmin, appId, omitRenderInfo, malformedWal, nicknames }) {
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
  // SIGNALS CROSS THE BRIDGE NOW, AND THEY DID NOT UNTIL 2026-11-15.
  // `on` was `() => () => {}` — a no-op that returned a no-op — so a page
  // registering a signal handler through the host's client got a dead one and
  // nothing could ever arrive. That is invisible to every check in this file
  // that predates pass 8, because nothing had asked the host for a signal
  // before; pass 8's first run is what found it, by asserting an inbound
  // notice and watching the 6.15 line fail to appear alongside the new one.
  //
  // A FIXTURE THAT CANNOT DELIVER AN EVENT IS A FIXTURE THAT PROVES THE
  // ABSENCE OF EVERY FEATURE BUILT ON ONE. Worth fixing rather than working
  // around: 1.32 wants `onRemoteSignal` next, and it would have met the same
  // wall.
  window.__signalHandlers = [];
  // Drained on a timer, started by the first `on()` and not before: a page
  // that never asks for signals never talks to the host about them, which is
  // also how the real client behaves.
  let signalPump = null;
  const startSignalPump = () => {
    if (signalPump) return;
    signalPump = setInterval(async () => {
      try {
        const batch = unpackB(await window.__hostTakeSignals());
        for (const sig of (batch || [])) {
          for (const h of window.__signalHandlers) { try { h(sig); } catch (e) { void e; } }
        }
      } catch (e) { void e; }
    }, 250);
  };
  // ROW 1.32's inbound pump. Separate from the conductor signal pump above
  // because it carries a different thing from a different place — a group
  // member's announcement, not this conductor's own emission — and merging
  // them would let a check pass on the wrong one.
  window.__remoteSignalHandlers = [];
  let remotePump = null;
  const startRemotePump = () => {
    if (remotePump) return;
    remotePump = setInterval(async () => {
      try {
        const texts = await window.__hostTakeRemoteSignals();
        for (const text of (texts || [])) {
          const bytes = new TextEncoder().encode(text);
          for (const h of window.__remoteSignalHandlers) { try { h(bytes); } catch (e) { void e; } }
        }
      } catch (e) { void e; }
    }, 250);
  };

  const appletClient = {
    myPubKey: fromB64(myPubKeyB64),
    callZome: async (req) => unpackB(await window.__hostCallZome(packB(req))),
    appInfo: async () => unpackB(await window.__hostAppInfo()),
    // `(event, cb)`, NOT `(cb)`, and the first version of this shim got it
    // wrong: `holochain.ts` subscribes with `client.on('signal', handler)`, so
    // a one-argument shim stored the STRING 'signal' as its handler and threw
    // the real one away. The harness's own socket saw the signals and the page
    // never did — indistinguishable, from the screen, from a conductor that
    // never emitted. That is READINESS item 21's defect (reading a signal at
    // the wrong LEVEL, which dropped every signal for months) arriving one
    // argument over, and the comment recording it sits directly above the
    // subscription this gets wrong.
    on: (event, cb) => {
      if (event === 'signal' && typeof cb === 'function') window.__signalHandlers.push(cb);
      startSignalPump();
      return () => {};
    },
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

    // ROW 1.32. Both halves are real, for the reason the whole block above
    // exists: a fixture that cannot deliver an event proves the absence of
    // every feature built on one.
    //
    // OUTBOUND is recorded in the harness so a check can assert that
    // publishing a critique ANNOUNCED it — the payload is handed over as
    // text, because that is what the adapter encoded and decoding it here
    // would hide a wrong encoding rather than expose it.
    sendRemoteSignal: async (payload) => {
      await window.__hostRemoteSignalSent(new TextDecoder().decode(payload));
    },
    // INBOUND uses the same page-pulls-from-node direction the signal pump
    // does, and for the identical measured reason: `page.evaluate` does not
    // carry a `Uint8Array` across intact, and a payload that arrives
    // corrupted looks exactly like a host that never sent one. The page asks
    // for its own announcements and encodes the text itself.
    onRemoteSignal: (cb) => {
      window.__remoteSignalHandlers.push(cb);
      startRemotePump();
      return () => {
        const at = window.__remoteSignalHandlers.indexOf(cb);
        if (at >= 0) window.__remoteSignalHandlers.splice(at, 1);
      };
    },
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
    // ROW 1.31's FIXTURE, AND IT WAS `{}` UNTIL 2026-11-16 — which is the
    // same defect as the dead `on()` above, one object over. An empty
    // profiles client makes `participantName` throw on its first property
    // access, the adapter catches and answers `null`, and EVERY check about
    // a name on screen then passes by the feature being absent. The fixture
    // has to be able to answer for "no name is shown" to mean anything.
    //
    // SHAPED LIKE THE REAL RETURN, which is an `EntryRecord<Profile>` and
    // not a `Profile`: the nickname lives at `.entry.nickname`. A fixture
    // that returned `{ nickname }` directly would pass a client that read
    // `.nickname` — the exact wrong path the adapter comment warns about —
    // and so would certify the bug.
    //
    // ANSWERS `undefined` FOR AN AGENT IT DOES NOT KNOW, because that is the
    // ordinary case the interface is built around (no profile, older host,
    // or a local-only read that missed) and a fixture that named everybody
    // could not exercise the fallback to a bare key.
    profilesClient: {
      getAgentProfile: async (agent) => {
        const nickname = (nicknames || {})[btoa(String.fromCharCode(...agent))];
        if (!nickname) return undefined;
        return { entry: { nickname, fields: {} } };
      },
    },
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

  // A SECOND AGENT, for pass 8 only, and this file had none until 1.30 needed
  // one. Its seed claim above is published by the harness's own key over a
  // second socket — a different CLIENT, not a different author — which is
  // enough for a cross-client READ and not enough for somebody to be
  // critiqued BY SOMEBODY ELSE. `graph-ui` shipped the same shape and its
  // impostor defect was indistinguishable from correct behaviour until a
  // second agent existed (6.18).
  const apps = await admin.listApps({});
  if (!apps.some((a) => a.installed_app_id === AGENT2_APP_ID)) {
    const pub = await admin.generateAgentPubKey();
    await admin.installApp({ source: { type: 'path', value: HAPP_PATH }, agent_key: pub, installed_app_id: AGENT2_APP_ID });
    await admin.enableApp({ installed_app_id: AGENT2_APP_ID });
  }
  const agent2 = await connectSecond(admin, AGENT2_APP_ID);
  const agent2Key = async () => agent2.me;

  // `create_critique` targets a Claim by ENTRY hash, not by the ActionHash
  // `create_claim` returned — the same distinction `being-told.mjs` resolves
  // by reading the hash back off the index rather than reusing what it held.
  const seedEntryHash = (await call('get_claims_by_domain', DOMAIN))
    .map((r) => r?.signed_action?.hashed?.content?.data?.entry_hash)
    .filter(Boolean)[0];
  if (!seedEntryHash) {
    log('  SETUP FAILED: the seed claim is not readable by entry hash.');
    process.exit(1);
  }
  await waitFor("the seed claim to reach agent 2", async () =>
    (await agent2.call('get_claims_by_domain', DOMAIN)).length > 0);
  // `critique_mode` IS AN ENUM VARIANT, and the five are Experiential,
  // Methodological, Logical, Evidential and Phenomenological — nothing else
  // deserializes. The first draft of pass 8 passed 'Empirical', which is not
  // one of them, and the conductor answered with a `Deserialize` error rather
  // than a default. That is the same trap this file's own `create_claim`
  // comment records for `confidence`, met a second time one field over.
  const critiqueAs = (agent, _unusedActionHash, mode) => agent.call('create_critique', {
    target: seedEntryHash, target_type: 'Claim', critique_mode: mode,
    content: `A ${mode} objection filed so the host has something to raise.`,
    author: agent.me, timestamp: Date.now() * 1000,
    replication_attempted: false, evidence_hashes: [], species: null,
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
      // The harness holds the only real socket, so it is the only thing that
      // RECEIVES a signal — and the page is where the handler lives.
      //
      // QUEUED AND DRAINED BY THE PAGE, rather than pushed with
      // `page.evaluate`, and the first version did push. A signal payload is
      // full of `Uint8Array`s; `page.evaluate` does not carry one across
      // intact, so the page's unpack threw and the rejection went into a
      // `.catch` that existed for a closed page — a silent failure that looked
      // exactly like a conductor that never emitted. The direction that
      // demonstrably works in this file is page -> node through
      // `exposeFunction`, which already carries packed bytes BOTH ways for
      // every zome call, so the page asks for its own signals.
      const pendingSignals = [];
      let signalsSeen = 0;
      app.on('signal', (sig) => { signalsSeen++; pendingSignals.push(sig); });
      await page.exposeFunction('__hostTakeSignals', async () =>
        packBytes(pendingSignals.splice(0, pendingSignals.length)));
      await page.exposeFunction('__hostSignalsSeen', async () => signalsSeen);
      // ROW 1.32's two bridges. The inbound queue is a plain array of TEXT —
      // the adapter's own encoding, carried as a string on purpose, so the
      // page does the `TextEncoder` work and a wrong encoding fails here
      // rather than being papered over by the harness doing it correctly.
      const remoteSent = [];
      const pendingRemote = [];
      await page.exposeFunction('__hostRemoteSignalSent', async (text) => { remoteSent.push(text); });
      await page.exposeFunction('__hostTakeRemoteSignals', async () =>
        pendingRemote.splice(0, pendingRemote.length));
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
        // ROW 1.31. Keyed by the agent's base64 key, and by default the ONLY
        // agent named is the independent publisher whose claim this harness
        // seeds — so a byline that shows a name proves the host was asked
        // about that specific agent, and the reader's own byline staying
        // bare proves the fallback still works on the same screen.
        nicknames: opts.nicknames ?? {},
      });
      await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
      // `remoteSent` and `pendingRemote` are handed back so a check can read
      // what the page announced and push what it should hear — the two
      // directions 1.32 needs, neither of which existed before.
      return { page, wire, hostCalls, remoteSent, pendingRemote };
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
        Array.isArray(hrl) && hrl.length === 2
        && hrl[0] instanceof Uint8Array && hrl[1] instanceof Uint8Array);
      check('whose DNA hash is this cell\'s real one, not the applet hash',
        Boolean(hrl) && b64(hrl[0]) === b64(dnaHash));
      // THE LOOP CLOSED, AND THE FIRST VERSION OF THIS CHECK DID NOT CLOSE IT.
      // It read `get_claims_by_domain` and passed on
      // `includes(published) || back.length >= 2` — and the second half is true
      // of this domain the moment the seed claim and this one both exist, so it
      // would have gone green for a resolve carrying ANY hash, including a
      // wrong one. That is this file's own subject committed inside it: a check
      // whose cheaper disjunct cannot fail.
      //
      // What matters is not that a claim was written — the publish handler's
      // own success notice already says that — but that the hash handed to
      // MOSS resolves to THIS claim. Anything else is a WAL another Tool will
      // store permanently and never be able to open. So the target hash is
      // resolved directly, by an independent client, with no fallback.
      let pointsAtIt = false;
      if (hrl && hrl[1] instanceof Uint8Array) {
        try {
          const claim = await call('get_claim', hrl[1]);
          pointsAtIt = Boolean(claim) && claim.content === published;
        } catch { pointsAtIt = false; }
      }
      check('and the hash handed to Moss resolves to THAT claim, read independently',
        pointsAtIt);
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
    // =====================================================================
    // OPEN-WORK 1.30 — the host raises a notice, and only for somebody who
    // asked to be reachable.
    //
    // THE ONE THING THE MOSS ARM CAN DO THAT THE PROTOCOL ARM CANNOT: reach a
    // reader whose Tool is not in front. 6.15 built the in-app line; this is
    // the same event handed to the host as well.
    //
    // THE CALL SITE IS WHY THIS PASS LOOKS LIKE 6.15's AND NOT LIKE A PUBLISH
    // TEST. The row said to call the host where `create_critique` succeeds,
    // which would have raised a notice in the CRITIC's own frame — telling
    // them about their own act. `notifyFrame` is local to its caller, so the
    // only seam that reaches the person critiqued is the inbound signal
    // handler. A test written against the row's description would have passed
    // while notifying the wrong person.
    log('\n=== Pass 8: 1.30 — the host is told, and only after the opt-in ===');
    {
      const { page, hostCalls } = await openSurface({ view: 'main' });
      await page.waitForSelector('[data-testid="applet-frame"]', { timeout: 25000 });
      await page.getByRole('button', { name: 'By Author', exact: true }).click();
      await page.waitForSelector('[data-testid="notify-optin"]', { timeout: 20000 });

      // THE CONTROL FIRST, and it is the one that makes the rest mean
      // anything. A critique filed BEFORE the opt-in must reach neither
      // surface: the host drops a remote signal to an agent holding no cap
      // grant, so if a notice appears here then the opt-in is decorative and
      // every assertion below is measuring something else. Same control
      // `being-told.mjs` opens with, re-made here because this is the arm
      // where a second notifier was added.
      await critiqueAs(agent2, seedAction, 'Methodological');
      await page.waitForTimeout(3000);
      check('CONTROL: before the opt-in the HOST is not notified either',
        hostCalls.filter((c) => c.kind === 'notifyFrame').length === 0);
      check('CONTROL: ...and neither is the in-app line, so the gate is the '
        + 'channel and not this pass',
        (await page.locator('[data-testid="critique-notice"]').count()) === 0);

      log('    (opting in ...)');
      await page.locator('[data-testid="notify-optin"]').click({ timeout: 15000 });
      await page.waitForTimeout(2500);
      log('    (opted in; agent 2 critiquing ...)');
      await critiqueAs(agent2, seedAction, 'Logical');
      log('    (critique filed; waiting for the notice ...)');
      // SAYS WHICH SIDE FAILED, because two runs were spent not knowing. A
      // conductor that never emitted and a bridge that never delivered
      // produce the same empty screen, and the harness is the only place that
      // can see both ends at once.
      await page.waitForTimeout(4000);
      log(`    (the harness's own socket has seen ${await page.evaluate(() => window.__hostSignalsSeen())} signal(s))`);
      await page.waitForFunction(
        () => document.querySelectorAll('[data-testid="critique-notice"]').length > 0,
        { timeout: 25000 },
      ).catch(() => {});

      const notices = hostCalls.filter((c) => c.kind === 'notifyFrame');
      check(`the host is notified once the channel is open (${notices.length} call(s))`,
        notices.length >= 1);
      const raised = notices.length ? JSON.parse(notices[notices.length - 1].detail) : null;
      check('and it is an ARRAY of one — a batch is the shape that invites a digest',
        Array.isArray(raised) && raised.length === 1);
      const n = raised && raised[0] ? raised[0] : {};
      check('URGENCY IS "low": 6.15 refused a dot by name, and "medium" IS the '
        + 'system-tray dot arriving from the host side',
        n.urgency === 'low');
      check('it names the agent who wrote the critique, as the in-app line does',
        typeof n.body === 'string' && n.body.includes(short(await agent2Key())));
      // A STANDALONE number, not ANY digit, and the first version of this
      // check said any digit. It failed on a correct notice: the byline is 12
      // BASE64 characters and base64 includes 0-9, so forbidding every digit
      // forbids the byline the check two lines up requires. What 6.15 refused
      // was a COUNT — "3 critiques", "(2)" — and a count is a number standing
      // on its own, which `\b\d+\b` catches while a digit inside an
      // alphanumeric key run has no word boundary to match on.
      check('NO COUNT in it — a push arriving as a number reintroduces '
        + 'everything the pull half refused',
        !/\b\d+\b/.test(String(n.title)) && !/\b\d+\b/.test(String(n.body)));
      check('its timestamp is MILLISECONDS, which is what Moss reads it as — '
        + 'not the protocol\'s micros',
        typeof n.timestamp === 'number'
        && n.timestamp > 1e12 && n.timestamp < 1e13);
      check('CONTROL: the in-app line from 6.15 is there too, so the host '
        + 'notice is an ADDITION and not a replacement',
        (await page.locator('[data-testid="critique-notice"]').count()) >= 1);
      await page.close();
    }

    log('\n=== Pass 9: 1.31 — the host names the people, and the key still binds ===');
    {
      // ONLY AGENT 2 IS NAMED, and that asymmetry is the pass. A fixture that
      // named everybody could not tell "the name was fetched for this agent"
      // from "a name is painted on every byline", and a fixture that named
      // nobody would make every check below vacuous.
      const nickname = 'Kaimana';
      const { page, wire } = await openSurface({
        view: 'main',
        nicknames: { [b64(await agent2Key())]: nickname },
      });
      await page.waitForSelector('[data-testid="applet-frame"]', { timeout: 25000 });
      await critiqueAs(agent2, seedAction, 'Evidential');
      await fillIfThere(page, '[data-testid="browse-domain-input"]', DOMAIN);
      await clickByName(page, 'Load claims');
      await page.waitForFunction(
        (c) => document.body.innerText.includes(c), seedContent, { timeout: 30000 },
      ).catch(() => {});
      await page.locator('[data-testid="toggle-critiques"]').first().click({ timeout: 15000 });
      await page.waitForSelector('[data-testid="critique-author"]', { timeout: 25000 });
      // Names resolve through the host and then re-render, so the byline is
      // waited FOR rather than sampled the instant the panel paints.
      await page.waitForFunction(
        (n) => document.body.innerText.includes(n), nickname, { timeout: 15000 },
      ).catch(() => {});

      const byline = await textIfThere(page, '[data-testid="critique-author"]');
      check(`the critique byline carries the host's name for its author (${nickname})`,
        byline.includes(nickname));
      // THE DECISION, AS A CHECK. A name that REPLACED the key would pass the
      // line above and would be the thing 1.31 refused: a nickname is chosen
      // and changeable, so a byline showing only a name makes a weaker claim
      // than one showing a key while looking stronger. Both must be there.
      check('AND THE KEY IS STILL THERE — the name is an aid to reading the '
        + 'byline, never the thing the critique is held to',
        byline.includes(short(await agent2Key())));
      // BOTH PRESENT AND THEN ORDERED, which the first version of this check
      // did not require — it compared two `indexOf` results, and a missing
      // name yields -1, which is less than any real index. So the check
      // passed on a byline with NO NAME IN IT AT ALL, the exact state it
      // exists to distinguish. Found by arming the inert fixture and watching
      // this line stay green while the one above it went red.
      const nameAt = byline.indexOf(nickname);
      const keyAt = byline.indexOf(short(await agent2Key()));
      check('with the name first, which is the half a reader scans',
        nameAt >= 0 && keyAt >= 0 && nameAt < keyAt);

      // THE ANTI-VACUITY CONTROL. Every check above would also pass if this
      // UI simply printed a constant, or painted the same name on every
      // byline it drew. The reader's OWN key is on screen in the status line
      // and the fixture does not know a name for it, so it must still render
      // bare — which is the fallback path every standalone build takes for
      // every byline, exercised here on the same screen.
      const status = await textIfThere(page, '.status, [data-testid="status"]');
      const statusOrBody = status || (await page.evaluate(() => document.body.innerText));
      check('CONTROL: an agent the host has NO name for still renders as a bare '
        + 'key, so a name on screen is a name that was fetched',
        statusOrBody.includes(short(me)) && !statusOrBody.includes(`${nickname} · ${short(me)}`));
      check('CONTROL: the names came from the HOST and not from a zome call — '
        + 'no profile read appears on the bridge',
        !wire.some((fn) => String(fn).includes('profile')));
      await page.close();
    }

    // =====================================================================
    log('\n=== Pass 10: 1.32 — a critique that lands is MARKED, not swapped in ===');
    {
      const { page, remoteSent, pendingRemote } = await openSurface({ view: 'main' });
      await page.waitForSelector('[data-testid="applet-frame"]', { timeout: 25000 });
      await fillIfThere(page, '[data-testid="browse-domain-input"]', DOMAIN);
      await clickByName(page, 'Load claims');
      await page.waitForFunction(
        (c) => document.body.innerText.includes(c), seedContent, { timeout: 30000 },
      ).catch(() => {});
      await page.locator('[data-testid="toggle-critiques"]').first().click({ timeout: 15000 });
      await page.waitForSelector('[data-testid="critique-form"]', { timeout: 25000 });

      // THE CONTROL BEFORE ANYTHING ARRIVES. Without it, "the marker is shown"
      // cannot be told from "the marker is always shown".
      check('CONTROL: no arrival marker before anything has arrived',
        (await page.locator('[data-testid="critiques-arrived"]').count()) === 0);

      // A SIGNAL FOR A DIFFERENT CLAIM, and this is the check that would have
      // caught a handler that marked every open panel. It is pushed through
      // the same bridge as the real one, so it also proves the bridge is live
      // before the negative result below is trusted.
      pendingRemote.push(JSON.stringify({
        t: 'epistemic-resonance/critique-arrived', claim: 'a-claim-nobody-here-is-reading',
      }));
      await page.waitForTimeout(2000);
      check('CONTROL: an announcement about ANOTHER claim marks nothing',
        (await page.locator('[data-testid="critiques-arrived"]').count()) === 0);

      // AND A PAYLOAD THAT IS NOT OURS AT ALL. The remote-signal channel is
      // GROUP-wide, not applet-scoped, so another Tool's traffic is the
      // ordinary case and must be dropped in silence rather than throwing.
      pendingRemote.push('{"t":"some-other-tool/hello"}');
      pendingRemote.push('not json at all');
      await page.waitForTimeout(1500);
      check('CONTROL: another Tool\'s signal and a malformed one are both '
        + 'dropped without a page error',
        (await page.locator('[data-testid="critiques-arrived"]').count()) === 0);

      // THE REAL ONE. The claim key the panel is keyed by is this project's
      // own base64 of the claim's ENTRY hash, which is what the page itself
      // announces — so it is read off the page rather than recomputed here,
      // because recomputing it is how a check certifies its own arithmetic.
      const claimRef = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="toggle-critiques"]');
        return el ? el.closest('[data-claim-key]')?.dataset.claimKey ?? null : null;
      });
      // COUNTED, NOT COMPARED AS TEXT, and the first version of this check
      // compared text — which was vacuous by the time it ran. It asked
      // whether "No critiques yet." survived the announcement, and by Pass 10
      // this claim has critiques from Passes 8 and 9, so the panel was never
      // empty and the check's own condition made it `true` without looking at
      // anything. A count of the rendered critique items can fail whether the
      // list holds none or nine, which is the property the text version
      // lacked. Found by arming the defect it exists to catch and watching it
      // stay green.
      const itemsBefore = await page.locator('.critique-panel .critique-item').count();
      // A REAL CRITIQUE BEHIND THE REAL ANNOUNCEMENT, and this is what makes
      // the count check able to fail at all. Announcing something that does
      // not exist would leave a live re-render finding the same list it
      // already had — so a UI that re-read underneath the reader would score
      // identically to one that marked, and the check measuring the
      // difference would be measuring nothing. Agent 2 files first; the
      // announcement then says something true.
      await critiqueAs(agent2, seedAction, 'Phenomenological');
      await page.waitForTimeout(2500);
      pendingRemote.push(JSON.stringify({
        t: 'epistemic-resonance/critique-arrived', claim: claimRef,
      }));
      await page.waitForFunction(
        () => document.querySelectorAll('[data-testid="critiques-arrived"]').length > 0,
        { timeout: 20000 },
      ).catch(() => {});
      check(`an announcement about the OPEN panel's claim is marked (${claimRef ? 'key read off the page' : 'KEY NOT FOUND'})`,
        (await page.locator('[data-testid="critiques-arrived"]').count()) === 1);

      // 1.32's DECISION, AND THE ONLY CHECK IN THIS PASS THAT IS ABOUT IT.
      // The marker must not have brought the critique in with it: a surface
      // that rewrites itself while somebody is deciding what to say about it
      // is what §4.4 cares about most, and a live re-render would pass every
      // check above while committing exactly that.
      const itemsAfter = await page.locator('.critique-panel .critique-item').count();
      check('THE LIST ITSELF DID NOT CHANGE UNDERNEATH THE READER — the marker '
        + `says something arrived, it does not bring it in (${itemsBefore} item(s) before, ${itemsAfter} after)`,
        itemsAfter === itemsBefore);
      check('and the marker carries NO COUNT, which would be the tally the '
        + 'pull half refused arriving by the back door',
        !/\b\d+\b/.test(await textIfThere(page, '[data-testid="critiques-arrived"]')));
      check('it offers a re-read the READER chooses to take',
        (await page.locator('[data-testid="critiques-reread"]').count()) === 1);
      // AND THE RE-READ ACTUALLY RE-READS. Without this the two checks above
      // are satisfied by a marker that is decorative: a line that appears and
      // a button that does nothing would pass both. Taking it must produce
      // the critique the announcement was about, and must clear the marker —
      // which is the whole shape of the decision, the reader choosing when
      // the text under them changes.
      // GUARDED, because a run that FAILS must still report. Armed against
      // its own defect (a live re-render leaves no marker to click), this
      // click threw and took the rest of the pass with it — so the two
      // checks below never ran and the log ended in a stack trace instead of
      // a list of reds. A harness that cannot survive the bug it is testing
      // for reports less the moment it matters most.
      await tryAct(() => page.locator('[data-testid="critiques-reread"]')
        .click({ timeout: 15000 }));
      await page.waitForFunction(
        (n) => document.querySelectorAll('.critique-panel .critique-item').length > n,
        itemsBefore, { timeout: 20000 },
      ).catch(() => {});
      const itemsReread = await page.locator('.critique-panel .critique-item').count();
      check(`taking the re-read brings the critique in (${itemsBefore} -> ${itemsReread})`,
        itemsReread > itemsBefore);
      check('and clears the marker, so it is dismissed by being ACTED ON '
        + 'rather than by being closed',
        (await page.locator('[data-testid="critiques-arrived"]').count()) === 0);

      // THE SENDING HALF, on the same page: publishing a critique announces
      // it. Checked last because it changes the panel this pass was reading.
      await page.locator('[data-testid="critique-form"] textarea').first()
        .fill('A critique filed from inside the Moss arm, to prove it announces.');
      await clickByName(page, 'Add critique');
      await page.waitForTimeout(4000);
      check(`publishing a critique ANNOUNCES it to the group (${remoteSent.length} sent)`,
        remoteSent.length >= 1);
      const announced = remoteSent.length
        ? JSON.parse(remoteSent[remoteSent.length - 1]) : {};
      check('and the announcement carries a claim reference and nothing else — '
        + 'no critique, no author, no count',
        announced.claim === claimRef
        && Object.keys(announced).sort().join(',') === 'claim,t');
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
