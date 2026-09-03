# Epistemic — Practitioner Mobile UI

A mobile-responsive web app (installable as a PWA) for browsing and publishing `Claim`s and adding typed `Critique`s against a live Holochain conductor running this hApp. Resolves README.md §9 Phase 4's "Mobile UI for practitioners."

## What this is, and isn't

This connects **directly** to a conductor's Admin and App WebSocket APIs from the browser — the same admin-auth flow `bridge/src/index.ts`'s `HolochainClient#connect` uses (issue an app auth token, then authorize zome-call signing credentials per cell). That's a real, working shape for developing against your own local conductor (`scripts/sandbox.sh`, or a real `hc` install), **not** the production multi-tenant auth model: a real deployed hApp UI is normally loaded by the Holochain Launcher, which issues the app auth token itself and never exposes the Admin API to UI code at all. See `src/holochain.ts`'s own header comment for the full reasoning.

Scope of this first increment: browse `Claim`s by domain, publish a `Claim`, view and add `Critique`s on a claim. It does not cover Membranes, discourse health, AntibodyPatterns, or HRR queries — those are real gaps, not oversights, left for a later pass.

**Before extending this UI, read `README.md` §4.4.** It states two constraints that any client for this protocol must respect and that ordinary UI instincts violate: a UI may be a lens the *user* aims but must not infer a credibility ordering and present it as neutral (Invariant #1 is a protocol invariant, and a client can reintroduce in the browser exactly what the protocol declined to compute); and while chrome may adapt per user, the artifact under evaluation must not, because cross-checking presupposes that two agents looked at the same thing. `README.md` §9 scopes the highest-leverage work here — this UI calls 4 of 56 coordinator functions, so nearly all the epistemic state the backend computes is currently invisible.

## Prerequisites

- Node.js 18+ and npm
- A running conductor with this hApp installed — see the root `README.md` §6, or `scripts/sandbox.sh start` for the fastest local path

## Development

```bash
cd mobile-ui
npm install
npm run dev
```

Opens on `http://localhost:5173`. On first load, the Connect screen is pre-filled with `scripts/sandbox.sh`'s own defaults (`ws://localhost:8889` admin, `ws://localhost:8888` app, `epistemic-resonance-happ` app id) — edit them if your conductor uses different ports, and they're remembered in `localStorage` for next time (nothing is sent anywhere else).

## Build

```bash
npm run build    # type-checks (tsc --noEmit) then builds via Vite into dist/
npm run preview  # serves the production build locally, for a final check before deploying it somewhere
```

`dist/` is a static site — any static host works. Because it connects directly to a conductor's WebSocket ports from the browser, it needs to actually reach them: on a phone, that means the conductor's admin/app ports need to be reachable from the phone's network (e.g. both on the same LAN, with the conductor's WebSocket interfaces bound to more than `localhost` — a conductor configuration concern, not something this app controls).

## Verified live, not just built

Every screen in this app (Connect → Browse → New Claim → add Critique → config persists across reload) was driven end to end with a real, Playwright-controlled Chromium browser (`executablePath` pointed at the system's own `/usr/bin/chromium`, not a bundled download) against a real `hc sandbox` conductor — both the Vite dev server and the actual production `dist/` build via `vite preview`. All ten checks passed against both. This caught a real, previously-invisible bug no amount of `tsc`/build-time checking would have: **a browser is not Node**, and this codebase's Node-side fix for one connection issue (`bridge/src/index.ts`'s `wsClientOptions.origin`, needed because Node's `ws` client sends no `Origin` header by default) is actively broken if copied into a browser client verbatim. `@holochain/client`'s `WsClient.connect` forwards its options object straight into `new WebSocket(url, options)`; the *native* browser `WebSocket` constructor's second positional argument is a `protocols` list (string or array of strings), not an options bag, so passing an object there fails immediately with `Failed to construct 'WebSocket': The subprotocol '[object Object]' is invalid.` — before any connection is even attempted. A browser's native WebSocket sends a real, truthful `Origin` header on its own regardless (and gives no way to override it from JS at all), so the fix is simply not passing `wsClientOptions` in this client — see `src/holochain.ts`'s own comment on `AdminWebsocket.connect`/`AppWebsocket.connect` for the full account.

## Known limitations, stated plainly

- **Bundle size**: ~940KB minified (~332KB gzipped), almost entirely `@holochain/client` and its crypto/msgpack dependencies (`libsodium-wrappers`, `@bitgo/blake2b`, `@msgpack/msgpack`). Not code-split in this pass — acceptable for a practitioner tool used repeatedly (cached after first load), worth revisiting if this needs to load quickly on a poor connection every time.
- **PWA installability was not verified against a real Lighthouse audit or an actual mobile device this pass** — `manifest.webmanifest` and `public/sw.js` are present and syntactically real (the service worker was confirmed to register and intercept same-origin GETs during the Playwright run), but full install-prompt behavior varies by browser and wasn't independently audited.
- **`npm audit` flags a moderate advisory in `esbuild` (via `vite@5`)**: the advisory is specific to `esbuild`'s local dev server accepting cross-origin requests — it affects `npm run dev` only, not the built `dist/` output, and `vite@5`'s fix requires the breaking `vite@8`. Left as-is for this pass; worth revisiting alongside a real Vite major-version upgrade, not in isolation.
