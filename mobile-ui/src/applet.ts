// ============================================================================
// mobile-ui/src/applet.ts — RUNNING THIS UI AS A MOSS TOOL. NO LONGER A
// PROTOTYPE: the view is implemented (open-work 1.28) and this file holds the
// rules it runs on.
//
// Moss (Lightningrod Labs / Holochain) hosts third-party happs as "Tools", and
// the contract its docs state is: build a normal Holochain app, add some sugar
// to make it run in Moss, and optionally knit it together with other Tools via
// the Weave Interaction Protocol. A Tool brings ITS OWN happ, DNA and cells —
// so nothing here touches the integrity zome, the DNA hash or the network.
//
// THE DEPENDENCY LIVES IN `applet-host.ts`, NOT HERE, AND A TEST IS WHY.
//
// `@theweave/api` is installed at `0.7.0-dev.5`, and when its import sat in
// this file the addressing rules below could not be exercised in node at all:
// the package pulls `ws` through `isomorphic-ws`, which needs a CJS `require`
// no ESM bundle for node will give it. So the rules that are OURS were
// untestable because of a dependency they do not use — which is the same
// coupling this module claims to avoid, present in the module that claims it.
//
// Split, so this file imports nothing and `applet-host.ts` is the only place
// the dependency appears.
//
// TWO COSTS MEASURED RATHER THAN ASSUMED, both worth knowing before this ships
// in an installer. It took `mobile-ui/node_modules` from 70M to 161M, and the
// version is a DEV PRERELEASE — `0.7.0-dev.5` — which is the same class of
// risk open-work 6.10 measured when it routed around Your Own AI: a surface
// that moves under you. The difference is that this one is isolated to a
// single module behind one function, and the standalone app is untouched by
// it, so the cost of the surface moving is this file rather than the client.
//
// WHY THE PROTOTYPE THAT PRECEDED THIS HAD NO IMPORT.
//
// Two reasons, and the second is the one that matters. The first is that their
// documentation says of itself that it is "still under construction", and a
// dependency taken on a moving surface is a cost this project has measured
// once already: open-work 6.10 routed around Your Own AI because the feature
// it needed was agent-mode-only, and the release that changes it had still not
// shipped weeks later.
//
// The second is the precedent in `holochain.ts`. That file detects a Holochain
// Launcher by reading `window.__HC_LAUNCHER_ENV__` directly rather than
// deep-importing the client's own `isLauncher()`, and its comment gives the
// reason: the name "is not the library's private detail but the HOST's
// contract". The same reasoning applies here, with one honest difference —
// `__HC_LAUNCHER_ENV__` was confirmed against installed source and the Moss
// equivalent was not — a gap that turned out to matter, because the name taken
// from the documentation was WRONG. See `hostContext` below.
//
// WHAT IS PROVED AND WHAT IS STILL NOT. This file holds the rules — the
// addressing refusal, the surface mapping, what a host may and may not gate —
// and they are exercised in node by `applet-prototype-check.mjs`, which is
// why it imports nothing. The wiring they govern is exercised in a browser by
// `scripts/live-verify/applet-view.mjs`, against a FAKE Moss host whose
// `appletClient` bridges to a real conductor: so the claim "a Tool render
// reaches real DHT data without touching the Admin API" is measured rather
// than reasoned about.
//
// WHAT IS STILL UNPROVED IS A REAL MOSS INSTALL. None is installed here. The
// fake host injects what the installed library reads — `__WEAVE_API__`,
// `__WEAVE_RENDER_INFO__` — and is faithful in the respect that matters (the
// client comes from outside the page and the page has no admin access), which
// is the same honesty `launcher-packaging.mjs` claims about its Launcher. A
// genuine Moss install remains unverified and should be stated as such rather
// than implied to be covered.
// ============================================================================

/** How this UI is running. `unknown` is a real answer and not a failure: a
 *  browser tab that is neither a Launcher nor a Moss applet is the ordinary
 *  development case, and a detector that guessed would be worse than one that
 *  declines. */
export type HostContext = 'standalone' | 'applet' | 'unknown';

// --- Addressing: the decision this prototype exists to enforce --------------
//
// Weave has two addressing forms and they are NOT interchangeable for a
// protocol whose records cannot be edited:
//
//   HRL  — Holochain Resource Locator. Hashes. Does not carry a version.
//   WAL  — Weave Addressable Location, rendered as a URL whose scheme CARRIES
//          A VERSION: `weave-0.15://`.
//
// A WAL written into a `Claim`, `BridgeRecord` or `FederationRecord` cements
// `weave-0.15://` into an entry nobody can edit, including its author, because
// Invariant 6 refuses deletion and offers only additive retraction. When Moss
// reaches 0.16 every such record points at a scheme that has moved, and the
// only repair is a retraction naming a replacement.
//
// So: HRLs may be persisted. WAL URL STRINGS MAY NOT. They belong in the
// client and in the notes layer, where nothing is permanent by design.

/** A versioned Weave URL scheme, e.g. `weave-0.15://`. Matched generally
 *  rather than pinned to 0.15, because the whole hazard is that the number
 *  moves and a guard written against today's number would stop firing.
 *
 *  NOT ANCHORED, AND THAT IS A FIX RATHER THAN A STYLE CHOICE. This pattern
 *  began as `/^weave-\d+\.\d+:\/\//` and the installed source says that misses
 *  the form the host itself produces by default:
 *
 *      weaveUrlFromWal(wal, webPrefix)  // api.js:31
 *        -> 'https://theweave.social/wal?weave-0.12://hrl/<dna>/<target>'
 *
 *  — a versioned scheme sitting after a query marker, in a string that begins
 *  `https://`. The anchored guard returned FALSE for it and `assertPersistable`
 *  waved it through into a permanent entry: exactly the value this module
 *  exists to refuse, in the shape the host hands out when asked for a shareable
 *  link. Found by reading `node_modules/@theweave/api/dist/api.js` rather than
 *  the documentation, which is the same way `__WEAVE__` was caught being wrong.
 *
 *  A second measured reason the number must not be pinned: the host's own
 *  parser REFUSES a url whose version is not the version it is running —
 *  `weaveUrlToLocation` throws `Got invalid Weave url` unless the string starts
 *  with `weave-${window.__WEAVE_PROTOCOL_VERSION__}://` (api.js:42). So a
 *  persisted WAL url does not merely point at a scheme that has moved; at 0.16
 *  it cannot be read by the software that wrote it. Note also that the library's
 *  fallback version is `'0.12'`, not the `0.15` these comments were written
 *  against — another reason to match the shape and never the digits. */
const WAL_SCHEME = /weave-\d+\.\d+:\/\//i;

export function looksLikeWal(ref: unknown): boolean {
  return typeof ref === 'string' && WAL_SCHEME.test(ref.trim());
}

/** The versionless string form of a WAL, offered by the host as `stringifyHrl`
 *  (`hrl://<dnaB64>/<targetB64>`, api.js:138) and as `stringifyWal` (msgpack of
 *  `{hrl, context}`, base64, carrying no version at all).
 *
 *  Recorded here because the rule above is easy to over-read as *nothing from
 *  Weave may be persisted*, which is not what was measured. The version lives
 *  in the URL rendering, not in the address. What this module still refuses to
 *  persist is `stringifyWal`'s output, for a different reason: it is opaque
 *  base64 that nobody auditing a chain can read, and Invariant 6 means an
 *  unreadable permanent entry can only be retracted, never corrected. An HRL
 *  is two hashes and reads as two hashes. */
export function looksVersionless(ref: unknown): boolean {
  return typeof ref === 'string' && !WAL_SCHEME.test(ref.trim());
}

/** Refuses a versioned WAL URL on its way into anything permanent.
 *
 *  THROWS rather than returning a flag, and that is deliberate: a boolean gets
 *  checked at one call site and forgotten at the next, whereas the one thing
 *  this project cannot do is notice the mistake afterwards. The message names
 *  the reason rather than the rule, so whoever hits it can decide instead of
 *  looking it up. */
export function assertPersistable(ref: string, field: string): string {
  if (looksLikeWal(ref)) {
    throw new Error(
      `Refusing to put a Weave URL in \`${field}\`: its scheme carries a version `
      + `(${ref.trim().slice(0, 16)}…), and this record can never be edited. `
      + `Persist the HRL — hashes do not version — and keep WAL URLs in the client `
      + `or the notes layer, where nothing is permanent.`,
    );
  }
  return ref;
}

/** An HRL as this client would store it: a DNA hash and a target hash, both
 *  base64, and no scheme.
 *
 *  NOT PARSED FROM A WAL HERE, on purpose. The exact encoding of a WAL's
 *  payload is not in the documentation I have read, and a parser written
 *  against a guessed encoding would silently produce wrong hashes — which, in
 *  a permanent record, is worse than having no parser. When the format is
 *  confirmed, the conversion belongs here and `assertPersistable` already
 *  guards its output. */
export interface Hrl {
  dnaHash: string;
  targetHash: string;
}

export function hrlToRef(hrl: Hrl): string {
  // Deliberately NOT a URL. A ref that looks like a URL invites somebody to
  // paste a WAL into the same field.
  return `${hrl.dnaHash}/${hrl.targetHash}`;
}

/** What this Tool would advertise it can create, so "New Claim" can appear in
 *  Moss's own create menu (`CreatableName` in the Weave API).
 *
 *  A claim and a critique only. NOT a note: the notes layer is off-DHT and
 *  ephemeral by default, and a host offering to create one would be offering
 *  something this UI cannot promise to keep. */
export const CREATABLES = ['claim', 'critique'] as const;
export type Creatable = typeof CREATABLES[number];

/** What Moss needs in order to put those in its own create menu:
 *  `AppletServices.creatables` is `Record<CreatableName, CreatableType>`, and
 *  `CreatableType` is `{ label, icon_src, width?, height? }` — read off
 *  `types.d.ts:142`, not the documentation.
 *
 *  `icon_src` is deliberately an EMPTY STRING rather than a data URI or a
 *  path. A path would resolve against whatever origin the host chose for this
 *  iframe, which under Moss is an `applet:` protocol URL this UI does not
 *  control — the same reason `vite.config.ts` sets `base: './'`. An empty
 *  string lets the host fall back to its own placeholder, which is a visibly
 *  missing icon rather than a visibly broken one. */
export const CREATABLE_TYPES: Record<Creatable, {
  label: string; icon_src: string; width: 'small' | 'medium' | 'large'; height: 'small' | 'medium' | 'large';
}> = {
  claim: { label: 'Claim', icon_src: '', width: 'medium', height: 'medium' },
  critique: { label: 'Critique', icon_src: '', width: 'medium', height: 'medium' },
};

// --- What a Moss role may and may not decide ---------------------------------
//
// THE NAMES IN THIS PROJECT'S NOTES WERE DOC-DERIVED AND THE SOURCE DISAGREES.
// Open-work 1.28 states the constraint as "`MossPrivilege`/`MossRole` may gate
// what the UI SHOWS and must never gate who may PUBLISH". Both names are real
// (`types.d.ts:588` and `:600`) but neither is what a Tool is handed. The
// client exposes exactly one accountability surface:
//
//     myAccountabilitiesPerGroup: () => Promise<[DnaHash, MossAccountability[]][]>
//     MossAccountability = { role: MossRole, ... }         // types.d.ts:618
//
// — per GROUP, asynchronous, and plural. That shape matters for the rule
// below: there is no single "my role", so any code asking "am I allowed" has
// to pick a group first, and a Tool rendered cross-group has none to pick.

/** The ONE question a Moss accountability is allowed to answer here, declared
 *  as data so the rule is enforceable instead of remembered.
 *
 *  Joining a membrane is unrestricted by design; membranes carry promises
 *  rather than permissions, and interpretation stays reader-local. A host that
 *  decided who may speak would import a hierarchy the protocol refuses — so
 *  `publish`, `critique` and `retract` are listed explicitly as REFUSED rather
 *  than merely omitted, because an empty allow-list would also pass a test and
 *  would say nothing about intent. */
export const HOST_MAY_GATE = ['chrome'] as const;
export const HOST_MAY_NEVER_GATE = ['publish', 'critique', 'retract', 'join'] as const;

export function hostMayGate(what: string): boolean {
  if ((HOST_MAY_NEVER_GATE as readonly string[]).includes(what)) return false;
  return (HOST_MAY_GATE as readonly string[]).includes(what);
}

// --- Consuming RenderInfo ----------------------------------------------------
//
// WHAT WAS NOT KNOWN WHEN THIS ROW WAS OPENED, AND IS NOW READ OFF THE SOURCE.
// `RenderInfo` (types.d.ts:176) is a two-arm union, and the second arm is the
// one the row listed as unknown:
//
//   { type: 'applet-view',      view: AppletView, appletClient, profilesClient,
//     peerStatusStore, appletHash, groupProfiles, groupHash, renderLocation? }
//   { type: 'cross-group-view', view: CrossGroupView, applets: Map<…> }
//
// `AppletView` is `main` | `asset` | `creatable` — the three this project
// already guessed — and `CrossGroupView` is only `{ type: 'main' }`. The
// surprise is the cross-group arm itself: it carries NO `appletClient` and NO
// `groupHash`, a MAP of other applets' clients instead, and its `view.type` is
// ALSO the string `'main'`. So anything that switched on `renderInfo.view.type`
// alone would route a cross-group render into the single-group main view and
// then read an `appletClient` that is not there.
//
// There is also `renderLocation?: 'main' | 'embedded' | 'side' | 'window'`,
// documented as undefined on hosts predating it — a fourth thing to not
// require.

export type AppletSurface = 'main' | 'asset' | 'creatable' | 'cross-group' | 'standalone';

/** Maps a `RenderInfo` to the surface this UI should draw.
 *
 *  TAKES `unknown` ON PURPOSE, for the same reason `entryPoint` takes its
 *  context rather than fetching it: this file imports nothing, so the rule is
 *  exercisable in node, and the one input it cannot trust is a live object
 *  handed over by another program. Every unrecognised shape answers
 *  `'standalone'`, which is constraint (1) of the row — anything uncertain
 *  renders the app that already works, so a host that changes under this costs
 *  a view and never the product. */
export function appletSurface(renderInfo: unknown): AppletSurface {
  if (!renderInfo || typeof renderInfo !== 'object') return 'standalone';
  const info = renderInfo as { type?: unknown; view?: { type?: unknown } };
  if (info.type === 'cross-group-view') return 'cross-group';
  if (info.type !== 'applet-view') return 'standalone';
  const view = info.view?.type;
  if (view === 'main' || view === 'asset' || view === 'creatable') return view;
  return 'standalone';
}

/** Converts a host `WAL` into the `Hrl` this client would store, given the
 *  host's own base64 encoder.
 *
 *  THE PARSER CONSTRAINT IS NOW SATISFIED RATHER THAN DEFERRED. Row 1.28 said
 *  "still no WAL parser until the payload encoding is confirmed against
 *  installed source", because a parser written against a guessed encoding puts
 *  wrong hashes in permanent records. It is confirmed now, and the answer is
 *  that WE DO NOT NEED ONE: a WAL is `{ hrl: [DnaHash, ActionHash|EntryHash],
 *  context? }` (types.d.ts:30) — already decoded hashes, not a string — and
 *  going the other way from a url is `weaveUrlToWAL`, the host's own function.
 *  So the only conversion left is hash -> base64, and this takes the encoder as
 *  an argument so the rule stays importable with no dependency and the
 *  encoding stays the library's rather than a copy of it.
 *
 *  Returns `null` rather than throwing on a malformed WAL: this is on the read
 *  path from another Tool, where a stranger's bad data should cost one picker
 *  result, not the view. `assertPersistable` is still the gate on the way in. */
export function hrlFromHostWal(
  wal: unknown,
  encodeHash: (h: Uint8Array) => string,
): Hrl | null {
  const hrl = (wal as { hrl?: unknown } | null | undefined)?.hrl;
  if (!Array.isArray(hrl) || hrl.length < 2) return null;
  const [dna, target] = hrl;
  if (!(dna instanceof Uint8Array) || !(target instanceof Uint8Array)) return null;
  if (dna.length === 0 || target.length === 0) return null;
  try {
    const dnaHash = encodeHash(dna);
    const targetHash = encodeHash(target);
    // The encoder is the host's, so its output is checked rather than trusted:
    // a versioned string arriving here would otherwise reach a permanent entry
    // through the one path `assertPersistable` is not on.
    if (!looksVersionless(dnaHash) || !looksVersionless(targetHash)) return null;
    return { dnaHash, targetHash };
  } catch {
    return null;
  }
}

/** The narrow slice of the host this UI actually uses, declared here rather
 *  than taken from `WeaveServices` wholesale.
 *
 *  A small interface is what makes the dependency replaceable and the
 *  integration auditable: these can be read, and the full `WeaveServices`
 *  surface cannot — counted rather than estimated, it is 26 members plus a
 *  13-member `assets` namespace, including clone-cell management, screen
 *  capture and on-device speech recognition.
 *
 *  TWO OF THESE WERE WRONG WHEN THEY WERE DOC-DERIVED, and the corrections are
 *  the point of this revision:
 *
 *    - `pickAsset` was declared as a host method. There is none. The real one
 *      is `client.assets.userSelectAsset(from?)` (api.d.ts:84), returns
 *      `WAL | undefined` not an HRL, and takes a source — `'pocket'`,
 *      `'search'`, `'create'`, `'pocket-no-create'`. The adapter converts and
 *      `hrlFromHostWal` is the conversion.
 *    - `notifyCreated` did not exist at all; it was invented from the sentence
 *      "so it can appear in the group's own feed of activity". Moss has two
 *      real mechanisms and they are not interchangeable: inside a `creatable`
 *      view the host passes `resolve(wal)` INTO the view and closes it when
 *      called, and separately `notifyFrame(FrameNotification[])` raises a
 *      notice. Declaring one method hid the fact that the first is mandatory
 *      (a creatable view that never resolves hangs the host's dialog) and the
 *      second is optional and user-configurable.
 *
 *  `MossAccountability` is still deliberately ABSENT. See `hostMayGate`. */
export interface WeaveHost {
  /** The group this Tool instance is rendered in, for display only. `null`
   *  under a cross-group render, which has no single group — not an error. */
  groupLabel(): string | null;
  /** Which surface the host asked for. */
  surface(): AppletSurface;
  /** What this view was opened ON, for an `asset` render. */
  openedOn(): AppletTarget | null;
  /** Ask the host to let the user pick something from another Tool. Returns an
   *  HRL, never a WAL url: the adapter converts, and `assertPersistable`
   *  guards anything that then heads for a permanent entry. */
  pickAsset(): Promise<Hrl | null>;
  /** Finish a `creatable` render. MANDATORY on that surface and a no-op on
   *  every other — the host's dialog stays open until one of these is
   *  called, so a view that forgets looks like a hung host.
   *
   *  TAKES RAW HASHES, not the base64 `Hrl` above, and that is the opposite
   *  of the obvious choice for a reason. The caller is the publish handler,
   *  which holds the `ActionHash` `create_claim` returned as bytes; the host
   *  wants bytes too. Routing those through base64 and back would put two
   *  encodings in a UI module that imports neither — and the two in play are
   *  NOT interchangeable: this project's own `b64()` is plain base64 over raw
   *  bytes while a Holochain hash in text is base64url with a `u` prefix.
   *  Crossing them produces the right number of bytes and the wrong value,
   *  which in a hash means a WAL that resolves to nothing. Both conversions
   *  stay in `applet-host.ts`, where the library that defines them is already
   *  imported. */
  finishCreatable(result:
    | { ok: true; dnaHash: Uint8Array; targetHash: Uint8Array }
    | { ok: false; reason: 'cancel' }
    | { ok: false; reason: 'error'; error: unknown }
  ): Promise<void>;
}

/** What an `asset` render was opened on, in both forms the two callers need.
 *
 *  `ref` is the auditable one — base64, what would go into a permanent entry
 *  if anything ever did, and what `assertPersistable` guards. `target` is the
 *  raw hash, because reading the claim means handing an `AnyDhtHash` to
 *  `get_claim` and the decode belongs on the side of the boundary that
 *  already imports the decoder. Carried together so no caller has to convert
 *  between them, which is the step that would go wrong. */
export interface AppletTarget {
  ref: Hrl;
  target: Uint8Array;
}

/** The entry-point branch: the standalone app is untouched, `applet` is a
 *  wrapper rather than a rewrite, and anything uncertain renders standalone.
 *
 *  TAKES THE CONTEXT RATHER THAN FETCHING IT. A default of `hostContext()`
 *  would drag the dependency back into this file and make these rules
 *  untestable again — the caller knows where it is running, and this decides
 *  what that means. */
export function entryPoint(ctx: HostContext): 'standalone' | 'applet' {
  return ctx === 'applet' ? 'applet' : 'standalone';
}

/** How long to wait for `WeaveClient.connect()` before giving up and rendering
 *  standalone.
 *
 *  THIS NUMBER EXISTS BECAUSE `connect()` CAN NEVER RESOLVE, which is measured
 *  rather than feared. `api.js:189`:
 *
 *      static async connect(appletServices) {
 *        if (window.__WEAVE_RENDER_INFO__) { ...; return WeaveClient.fromHost(); }
 *        else {
 *          await new Promise((resolve, _reject) => {
 *            window.addEventListener('applet-iframe-ready', listener);
 *          });                                  // no timeout, `_reject` unused
 *
 *  So when `isWeaveContext()` is true — and it is true on the `applet:`
 *  protocol ALONE, with no render info present — `connect()` awaits an event
 *  that only a host which has already injected render info will dispatch. It
 *  does not reject, it does not time out, and there is no error to report. An
 *  applet boot that awaited it unguarded would show a permanently blank page,
 *  which is strictly worse than the honest "not implemented" notice it
 *  replaces: the notice is a UI saying what it cannot do, and a blank page is
 *  a UI that looks broken.
 *
 *  Eight seconds, not eight hundred milliseconds: a real host injecting render
 *  info resolves this synchronously, so the only runs that wait at all are the
 *  ones already going wrong, and on those a slow-but-working host must not be
 *  cut off. The fallback costs nothing by constraint (1) — it renders the app
 *  that works. */
export const CONNECT_TIMEOUT_MS = 8000;
