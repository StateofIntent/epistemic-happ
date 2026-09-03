# Epistemic — Practitioner Mobile UI

A mobile-responsive web app (installable as a PWA) for browsing and publishing `Claim`s and adding typed `Critique`s against a live Holochain conductor running this hApp. Resolves README.md §9 Phase 4's "Mobile UI for practitioners."

## What this is, and isn't

This UI runs in **two environments**, and `src/holochain.ts` picks between them by detecting the host, never by configuration. See that file's header comment for the full reasoning; the short version:

- **Installed from the `.webhapp`** (a Holochain Launcher — the path anyone who is not developing this takes). The host has already issued the app authentication token and chosen the app interface port, and injects both; it also signs zome calls itself. It **never** exposes the Admin API to UI code, so on this path the UI opens no `AdminWebsocket`, issues no token, and authorizes no signing credentials. There is nothing to configure, so no Connect screen is shown at all. Built by `scripts/pack-webhapp.sh` — root `README.md` §6.9.
- **Directly against your own conductor** (`scripts/sandbox.sh`, or a real `hc` install, or the dev server). Nothing issues anything, so the UI does the admin-auth dance itself — the same flow `bridge/src/index.ts`'s `HolochainClient#connect` uses. A real, working shape for development; still **not** a production multi-tenant auth model.

The distinction is load-bearing rather than cosmetic: until this UI shipped in a bundle, it opened an `AdminWebsocket` as its first action, which inside a Launcher would have thrown before rendering a single screen.

Scope has grown well past the first increment: browsing and publishing `Claim`s, viewing and adding `Critique`s, Membranes and their discourse health, evidence and retraction, spatial navigation of the critique tree, and the critique taxonomy. HRR queries remain unsurfaced — a real gap, not an oversight, and Phase 3 defers them with payloads empty so there is nothing to show yet. The root `README.md` §9 roadmap item carries the current count and the ordered list of what is still unsurfaced; this sentence is a summary of it and not a second source of truth.

**Before extending this UI, read `README.md` §4.4.** It states two constraints that any client for this protocol must respect and that ordinary UI instincts violate: a UI may be a lens the *user* aims but must not infer a credibility ordering and present it as neutral (Invariant #1 is a protocol invariant, and a client can reintroduce in the browser exactly what the protocol declined to compute); and while chrome may adapt per user, the artifact under evaluation must not, because cross-checking presupposes that two agents looked at the same thing. `README.md` §9 scopes the highest-leverage work here — a large share of the epistemic state the backend computes still has no surface (the roadmap item tracks the current count and what is still unsurfaced).

**Then read `README.md` §4.5**, which is the constructive half: the four patterns worth borrowing from game interfaces (resource meters, spatial navigation, progressive disclosure, state-driven affordance surfacing), the two that are declined and why, and the three rules that keep affordance gating on the right side of §4.4 — gate only on a rule the protocol itself enforces; hide only what is structurally impossible and disable-with-a-reason what is merely unavailable now; never gate on unknown state.

**Two constraints on the last pair of reads, which fail in opposite directions.** `get_critiques_by_mode` is **chain-local by specification** (SPEC §10.0) — it returns your own critiques and can see nobody else's — so every label around it must say so. A heading reading "Logical critiques" over that data is false, and worst when empty, where zero reads as "nobody critiques this way" rather than "I have not". `get_agent_constitution` is the opposite, a real cross-agent read whose hazard is inferring from absence: nothing requires an agent to publish a constitution, so an author without one is reported neutrally and never as deficient — framing absence as a shortfall scores agents on a field the protocol never asked them to fill. `scripts/live-verify/mode-and-constitution.mjs` uses three agents to hold both lines, and was observed failing ten checks when the chain-local read was labelled network-wide and a missing constitution was rendered as "unverified".

**One constraint specific to the expertise marker.** An expertise assertion is an ordinary Claim, and the marker on it must never read as a credential. The coordinator's own comment records that its trace-ownership check is "a courtesy, not an enforced rule" and that these claims carry no standing — so a check mark, an accent colour or a pill would manufacture the credibility signal Invariant #1 declines to compute, on a field nothing validates. The marker states that it is self-asserted, not verified, carries no standing, and is critiquable like anything else. `scripts/live-verify/expertise-ui.mjs` asserts each of those clauses and was observed failing five checks against a "✓ Verified expertise" badge.

**One constraint specific to the trust-lens controls on the Domains screen, because this is the single easiest place in the whole app to violate §4.4.** A trust lens is an `AttestationPolicy` the *user aims*, and §4.4 names exactly that as the honest kind of lens — but only under conditions the code has to keep: it is never on by default, it is unmissable while active, and the unfiltered figures stay beside the lensed ones so its effect can be read off rather than merely known about. Two further things are easy to get wrong and were both got wrong once here: an empty root set must be refused (`require_attestation_from: None` attests everyone, so such a lens filters nothing while looking applied), and the banner must not misstate the filter's **scope** — `get_discourse_health` filters critiques and never claims, so wording that implies claims were considered is the same failure as hiding the filter. `scripts/live-verify/trust-lenses.mjs` asserts all of it, refuses to run unless its own seed data demonstrably exercises the lens, and was observed failing five checks against a lens applied by default.

**One constraint specific to the Critique Types screen, because it is the easiest place in this UI to violate §4.4 by accident.** The taxonomy is rendered in taxonomy order — parents, then their children — and never sorted, sized or coloured by adoption. That is not a styling preference. `get_critique_species_adoption_count` is deliberately a *singular* read, and the coordinator's own doc comment records why there is intentionally no "all species ranked by adoption": it would be the comparative leaderboard Invariant #1 refuses. Ranking client-side reintroduces it one layer up, which is precisely the "lens that aims itself" §4.4 names. `scripts/live-verify/taxonomy-ui.mjs` asserts the rendered order, and that assertion was observed failing against a deliberately introduced sort — so a regression here goes red rather than merely looking tidier.

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

`vite.config.ts` sets `base: './'` so every emitted asset reference is relative rather than origin-rooted; `public/manifest.webmanifest` and the service worker's precache list are relative for the same reason. That matters only for the packaged path, where a host serves this UI from an origin it chose and the app is not guaranteed to sit at its root — see `vite.config.ts`'s own comment. It costs the static-host case nothing: relative and absolute resolve identically when served at a root.

To build the installable bundle rather than a static site, use the root `scripts/pack-webhapp.sh`, which runs this build and zips `dist/` into the `.webhapp` — not `hc web-app pack` directly, which would happily package whatever `dist/` already contained.

## Verified live, not just built

**The packaged (Launcher) path** is covered by `scripts/live-verify/launcher-packaging.mjs`: the real production bundle, in a Playwright Chromium with a launcher environment and a host-side zome-call signer injected, against a live `hc sandbox` conductor. It connects with no user action and no Connect screen, publishes a `Claim` that an independent client reads back off the DHT, and does it with the saved admin URL pointed at a dead port — so connecting at all is evidence the Admin API was never opened, rather than an assumption. The harness was then checked against a negative control (launcher detection forced off), where it fails; a suite that has only ever passed has not been shown to test anything. What it is **not**: a real Holochain Launcher, none being installed here. It reproduces what a Launcher injects and is faithful in the respect that decides this code path, but a genuine first install remains unverified — stated plainly in root `README.md` §6.9 rather than implied to be covered.

**The direct-admin path.** Every screen in this app (Connect → Browse → New Claim → add Critique → config persists across reload) was driven end to end with a real, Playwright-controlled Chromium browser (`executablePath` pointed at the system's own `/usr/bin/chromium`, not a bundled download) against a real `hc sandbox` conductor — both the Vite dev server and the actual production `dist/` build via `vite preview`. All ten checks passed against both. This caught a real, previously-invisible bug no amount of `tsc`/build-time checking would have: **a browser is not Node**, and this codebase's Node-side fix for one connection issue (`bridge/src/index.ts`'s `wsClientOptions.origin`, needed because Node's `ws` client sends no `Origin` header by default) is actively broken if copied into a browser client verbatim. `@holochain/client`'s `WsClient.connect` forwards its options object straight into `new WebSocket(url, options)`; the *native* browser `WebSocket` constructor's second positional argument is a `protocols` list (string or array of strings), not an options bag, so passing an object there fails immediately with `Failed to construct 'WebSocket': The subprotocol '[object Object]' is invalid.` — before any connection is even attempted. A browser's native WebSocket sends a real, truthful `Origin` header on its own regardless (and gives no way to override it from JS at all), so the fix is simply not passing `wsClientOptions` in this client — see `src/holochain.ts`'s own comment on `AdminWebsocket.connect`/`AppWebsocket.connect` for the full account.

## Known limitations, stated plainly

- **Bundle size**: ~940KB minified (~332KB gzipped), almost entirely `@holochain/client` and its crypto/msgpack dependencies (`libsodium-wrappers`, `@bitgo/blake2b`, `@msgpack/msgpack`). Not code-split in this pass — acceptable for a practitioner tool used repeatedly (cached after first load), worth revisiting if this needs to load quickly on a poor connection every time.
- **PWA installability was not verified against a real Lighthouse audit or an actual mobile device this pass** — `manifest.webmanifest` and `public/sw.js` are present and syntactically real (the service worker was confirmed to register and intercept same-origin GETs during the Playwright run), but full install-prompt behavior varies by browser and wasn't independently audited.
- **`npm audit` flags a moderate advisory in `esbuild` (via `vite@5`)**: the advisory is specific to `esbuild`'s local dev server accepting cross-origin requests — it affects `npm run dev` only, not the built `dist/` output, and `vite@5`'s fix requires the breaking `vite@8`. Left as-is for this pass; worth revisiting alongside a real Vite major-version upgrade, not in isolation.
