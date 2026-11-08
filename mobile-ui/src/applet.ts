// ============================================================================
// mobile-ui/src/applet.ts — RUNNING THIS UI AS A MOSS TOOL. A PROTOTYPE.
//
// Moss (Lightningrod Labs / Holochain) hosts third-party happs as "Tools", and
// the contract its docs state is: build a normal Holochain app, add some sugar
// to make it run in Moss, and optionally knit it together with other Tools via
// the Weave Interaction Protocol. A Tool brings ITS OWN happ, DNA and cells —
// so nothing here touches the integrity zome, the DNA hash or the network.
//
// WHY THERE IS NO `@theweave/api` IMPORT IN THIS FILE.
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
// `__HC_LAUNCHER_ENV__` was confirmed against installed source, and the Moss
// equivalent below is confirmed only against the PUBLISHED API REFERENCE —
// `isWeaveContext()` and `window.__WEAVE__`. That is a weaker warrant, it is
// isolated into one function, and closing it means taking the dependency and
// preferring `isWeaveContext()`.
//
// WHAT IS PROVED BY THIS FILE AND WHAT IS NOT. It proves the SHAPE: that the
// entry point is a branch, that the standalone app is untouched by it, and
// that the addressing decision below can be enforced rather than remembered.
// It does NOT prove the sugar works, because nothing here has spoken to a real
// Moss host. Treat a green typecheck as a green typecheck.
// ============================================================================

/** How this UI is running. `unknown` is a real answer and not a failure: a
 *  browser tab that is neither a Launcher nor a Moss applet is the ordinary
 *  development case, and a detector that guessed would be worse than one that
 *  declines. */
export type HostContext = 'standalone' | 'applet' | 'unknown';

/** `@theweave/api` exports `isWeaveContext()` for exactly this question, and
 *  the sentinel behind it is **`window.__WEAVE__`** — the same shape as the
 *  Launcher's `__HC_LAUNCHER_ENV__`, which is why the one-line check is
 *  written out here for the same reason `holochain.ts` writes that one out: a
 *  host's sentinel is the HOST's contract, not the library's private detail.
 *
 *  ONE DIFFERENCE FROM THAT PRECEDENT, STATED BECAUSE IT MATTERS.
 *  `holochain.ts` says of its check "Confirmed against the installed 0.17.1
 *  source." This one is **confirmed against the published API reference and
 *  NOT against installed source**, because no dependency has been taken. That
 *  is a weaker warrant, and it is the thing to close before this is wired:
 *  take the dependency and prefer `isWeaveContext()`, or read the installed
 *  source and say so here.
 *
 *  THE FRAMED-BUT-UNMARKED CASE STAYS `'unknown'`. Applets communicate over
 *  `AppletToParentRequest` / `ParentToAppletMessage`, a postMessage shape, so a
 *  Tool is framed — but plenty of things frame a page, and being framed is
 *  necessary rather than sufficient. Claiming applet context on that evidence
 *  is how a UI renders a host integration nobody is listening to.
 *
 *  The first call a Tool makes once the dependency exists is
 *  `WeaveClient.connect()`; this function only decides whether to make it. */
export function hostContext(): HostContext {
  if (typeof window === 'undefined') return 'unknown';
  if ('__WEAVE__' in window) return 'applet';
  if ('__HC_LAUNCHER_ENV__' in window) return 'standalone';
  // Framed with no sentinel: not enough to act on. See above.
  return window.parent !== window ? 'unknown' : 'standalone';
}

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
 *  moves and a guard written against today's number would stop firing. */
const WAL_SCHEME = /^weave-\d+\.\d+:\/\//i;

export function looksLikeWal(ref: unknown): boolean {
  return typeof ref === 'string' && WAL_SCHEME.test(ref.trim());
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

/** The narrow slice of the host this UI would actually use, declared here
 *  rather than taken from `WeaveServices` wholesale.
 *
 *  A small interface is the thing that makes the dependency replaceable and
 *  the integration auditable: four methods can be read, and the full
 *  `WeaveServices` surface cannot. `MossPrivilege`/`MossRole` is deliberately
 *  ABSENT — Moss roles may gate what this UI shows, and must never gate who
 *  may publish. Joining a membrane is unrestricted by design, membranes carry
 *  promises rather than permissions, and interpretation stays reader-local;
 *  a host that decided who may speak would import a hierarchy the protocol
 *  below refuses. */
export interface WeaveHost {
  /** The group this Tool instance is rendered in, for display only. */
  groupLabel(): Promise<string | null>;
  /** Ask the host to let the user pick something from another Tool. Returns an
   *  HRL, never a WAL URL — if the real API returns a WAL, the adapter
   *  converts and `assertPersistable` guards the result. */
  pickAsset(): Promise<Hrl | null>;
  /** Tell the host this Tool created something, so it can appear in the
   *  group's own feed of activity. */
  notifyCreated(kind: Creatable, hrl: Hrl): Promise<void>;
  /** Render target, so the standalone app and the applet view can differ
   *  without either knowing about the other. */
  view(): 'main' | 'asset' | 'creatable';
}

/** The entry-point branch, and the whole point of the prototype: the
 *  standalone app is untouched. `applet` is a wrapper, never a rewrite, and
 *  anything that cannot be rendered in an applet renders standalone. */
export function entryPoint(ctx: HostContext = hostContext()): 'standalone' | 'applet' {
  return ctx === 'applet' ? 'applet' : 'standalone';
}
