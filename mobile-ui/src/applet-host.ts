// ============================================================================
// mobile-ui/src/applet-host.ts — THE ONLY PLACE `@theweave/api` APPEARS.
//
// Separated from `applet.ts` so the addressing rules there import nothing: the
// package pulls `ws` through `isomorphic-ws`, which needs a CJS `require`, and
// with the import co-located those rules could not be exercised in node at
// all. A dependency that makes untouched code untestable is the coupling this
// integration is supposed to avoid.
//
// Installed at `0.7.0-dev.5` — a DEV PRERELEASE, and the same class of risk
// open-work 6.10 measured when it routed around Your Own AI: a surface that
// moves under you. Isolated here so the cost of it moving is one file.
//
// MEASURED, NOT ASSUMED, AND RE-MEASURED WHEN THE VIEW LANDED. Installing it
// took `node_modules` from 70M to 161M and added 2,726 bytes to the shipped
// bundle — 0.40% — for a branch that rendered a notice. IMPLEMENTING the view
// (open-work 1.28) cost 8,556 bytes more: 679,703 -> 688,259, +1.26%. So the
// whole Moss integration is under 1.7% of the bundle, and the 91M is dev-time
// weight rather than installer weight, which is the distinction that matters
// for a UI that ships inside desktop installers.
//
// EVERY CLAIM THIS FILE MAKES ABOUT THE HOST IS READ OFF
// `node_modules/@theweave/api/dist/`, NOT THE DOCUMENTATION, and the line
// numbers are cited so the next reader can check rather than trust. That rule
// exists because the version of this file that preceded it took a sentinel
// name from the published API reference and the name was wrong — see
// `hostContext` — and because the interface in `applet.ts` named one method
// the host does not have AT ALL (`notifyCreated`, invented from a sentence in
// the docs) and two more for things that exist under different names and
// different shapes (`pickAsset` is `client.assets.userSelectAsset` and returns
// a WAL, not an HRL; `groupLabel` and `view` are FIELDS on `RenderInfo`, not
// calls). All of it compiled. That is the shape both mistakes share: a surface
// described accurately enough to compile against and inaccurately enough to
// never engage.
// ============================================================================
import { WeaveClient, AppletServices, isWeaveContext } from '@theweave/api';
import { encodeHashToBase64, decodeHashFromBase64, type AppClient } from '@holochain/client';
import {
  CONNECT_TIMEOUT_MS, CREATABLE_TYPES, appletSurface, hrlFromHostWal,
  encodeCritiqueArrived, decodeCritiqueArrived,
  type AppletSurface, type AppletTarget, type HostContext, type Hrl, type WeaveHost,
} from './applet';

/** DELEGATES TO `@theweave/api`'s OWN `isWeaveContext()`, and the reason is a
 *  mistake this file made first.
 *
 *  The prototype that preceded this hand-wrote the check against
 *  `window.__WEAVE__`, taken from the published API reference. **That name is
 *  wrong.** The installed source reads:
 *
 *      isWeaveContext = () => window.location.protocol === 'applet:'
 *                             || !!window.__WEAVE_API__
 *
 *  — `__WEAVE_API__`, and a second condition for an `applet:` protocol that no
 *  amount of reading documentation would have produced. The hand-written check
 *  would have returned `standalone` inside a real Moss applet and the
 *  integration would simply never have engaged, silently. That is precisely
 *  what `holochain.ts`'s "Confirmed against the installed 0.17.1 source" earns
 *  the right to say and this file previously could not, so the host's own
 *  function is now the authority rather than a copy of it.
 *
 *  THAT SECOND CONDITION IS ALSO WHY `connectAppletHost` HAS A TIMEOUT. The
 *  `applet:` protocol arm answers true with no render info present, and
 *  `WeaveClient.connect()` then waits forever — see `CONNECT_TIMEOUT_MS` in
 *  `applet.ts` for the measurement. A detector that is right and a connect
 *  that cannot fail is still a blank screen.
 *
 *  WRAPPED IN `Boolean()` ON PURPOSE. `isWeaveContext` is DECLARED
 *  `() => true` (`api.d.ts:24`) while its body plainly returns a boolean. That
 *  does not break compilation — a probe confirmed `tsc` accepts a branch on it
 *  — but it does mean the type system will never warn that the standalone
 *  branch has gone dead. Coercing keeps the lie from propagating into the one
 *  decision this module exists to make.
 *
 *  `'unknown'` remains a real answer: no `window` at all, which is how the
 *  pure checks exercise this off the host. */
export function hostContext(): HostContext {
  if (typeof window === 'undefined') return 'unknown';
  if (Boolean(isWeaveContext())) return 'applet';
  return 'standalone';
}

/** What a successful host connection yields: the narrow host adapter, and the
 *  `AppClient` the HOST already authenticated.
 *
 *  THE CLIENT IS THE WHOLE POINT, and it is what keeps this from becoming a
 *  second client. A Tool brings its own happ, DNA and cells, and Moss installs
 *  and authenticates them itself — so inside an applet there is no admin
 *  interface to reach (the same prohibition the Launcher path documents in
 *  `holochain.ts`) and no token to issue. `renderInfo.appletClient` IS the
 *  connection. `HolochainConnection.fromAppClient` adopts it and every zome
 *  call in this UI then runs unchanged over a socket this file never opened. */
export interface AppletHostConnection {
  host: WeaveHost;
  appClient: AppClient;
}

/** Everything this Tool offers the host about itself.
 *
 *  `creatables` is what puts "Claim" and "Critique" in Moss's own create menu.
 *
 *  `getAssetInfo` is what makes a claim LEGIBLE from another Tool: Moss calls
 *  it with the WAL somebody dragged or pasted and renders what comes back.
 *  Implemented with `get_claim`, the one zome function that answers for a
 *  single hash. It returns `undefined` rather than throwing for anything it
 *  cannot resolve — a stranger's bad WAL should cost one tooltip, not the
 *  host's render.
 *
 *  `search` IS DELIBERATELY LEFT AS THE LIBRARY'S DEFAULT, which returns `[]`
 *  (`api.js:113`). There is no search zome function in this DNA; the reads are
 *  `get_claims_by_domain` and `get_claims_by_agent`, both of which need a key
 *  the searcher does not have. Searching by scanning every domain would need a
 *  domain enumeration, and whether this protocol should offer one AT ALL is an
 *  open decision — open-work 6.12's `[D]` — not something to settle by
 *  implementing it here for a host's search box. An empty result is honest;
 *  a partial one scraped from whatever this device happens to have loaded
 *  would be the "looks wired and is not" shape this row exists to remove. */
function appletServices(config: { roleName: string; zomeName: string }): AppletServices {
  const services = new AppletServices();
  services.creatables = { ...CREATABLE_TYPES };
  services.getAssetInfo = async (appletClient, wal) => {
    const hrl = hrlFromHostWal(wal, encodeHashToBase64);
    if (!hrl) return undefined;
    try {
      const claim = await appletClient.callZome({
        role_name: config.roleName,
        zome_name: config.zomeName,
        fn_name: 'get_claim',
        payload: decodeHashFromBase64(hrl.targetHash),
      }) as { content?: string } | null;
      if (!claim || typeof claim.content !== 'string') return undefined;
      const content = claim.content.trim();
      return {
        // Truncated because the host renders this in a chip, and a claim is
        // prose of any length. The ellipsis is part of the name on purpose:
        // a silently cut claim read as a complete one would misrepresent
        // somebody's position, which is the one failure mode this whole
        // protocol is about.
        name: content.length > 80 ? `${content.slice(0, 79)}…` : content,
        icon_src: '',
      };
    } catch {
      return undefined;
    }
  };
  return services;
}

/** Connects to the host, or answers `null` and lets the caller render the
 *  standalone app.
 *
 *  RACES `WeaveClient.connect()` AGAINST A TIMEOUT BECAUSE THAT CALL CAN NEVER
 *  RESOLVE. The measurement is in `applet.ts` beside `CONNECT_TIMEOUT_MS`: with
 *  no `window.__WEAVE_RENDER_INFO__` present, `connect()` awaits an
 *  `applet-iframe-ready` event, with no timeout and an unused `_reject`. On the
 *  `applet:` protocol arm of `isWeaveContext` that state is reachable, and an
 *  unguarded await there is a permanently blank page with nothing in the
 *  console.
 *
 *  ANSWERS `null` FOR EVERY FAILURE, including a shape it does not recognise.
 *  That is constraint (1) of open-work 1.28 — the standalone app is unaffected,
 *  and anything uncertain renders it — which makes a detector that is wrong in
 *  this direction free. The direction that is NOT free is the other one, and
 *  that is what the installed source caught. */
export async function connectAppletHost(
  config: { roleName: string; zomeName: string },
  timeoutMs: number = CONNECT_TIMEOUT_MS,
): Promise<AppletHostConnection | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const client = await Promise.race([
      WeaveClient.connect(appletServices(config)),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
    if (!client) return null;

    const info = client.renderInfo;
    const surface = appletSurface(info);
    if (surface === 'standalone') return null;

    // The cross-group arm carries NO `appletClient` — it hands a MAP of other
    // applets' clients instead (`types.d.ts:196`). There is nothing for this
    // UI to connect to there, and reading `appletClient` off it would be
    // `undefined` passed into a `callZome` and a runtime error on the first
    // read. Declined explicitly rather than by accident.
    if (surface === 'cross-group') return null;

    const appletView = info as Extract<typeof info, { type: 'applet-view' }>;
    const appClient = appletView.appletClient;
    if (!appClient) return null;

    return { host: buildHost(client, surface), appClient };
  } catch {
    // A host that threw is a host this UI cannot use, and the app that works
    // is one branch away. Swallowed rather than surfaced because there is no
    // screen yet in which to surface it — the standalone app renders next.
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** The adapter: the real `WeaveClient` surface narrowed to the five things
 *  `WeaveHost` declares. Each member names where it comes from, because the
 *  members this replaced named methods the host does not have. */
function buildHost(client: WeaveClient, surface: AppletSurface): WeaveHost {
  const info = client.renderInfo;
  const appletView = info.type === 'applet-view' ? info : null;

  return {
    // `groupProfiles` is on `RenderInfo` itself (`types.d.ts:186`), not behind
    // a call — and its own doc comment says it is NON-EXHAUSTIVE, because a
    // federated applet may be shared with groups this agent is not in. So the
    // first name is a label and never a membership claim, which is why
    // `WeaveHost` calls this `groupLabel` and returns a string.
    groupLabel: () => appletView?.groupProfiles?.[0]?.name ?? null,

    surface: () => surface,

    // Only the `asset` arm of `AppletView` has a mandatory `wal`; `main` has an
    // OPTIONAL one (`types.d.ts:111`), which is the host deep-linking into the
    // main view, and `creatable` has none at all.
    openedOn: (): AppletTarget | null => {
      const view = appletView?.view;
      if (!view || !('wal' in view) || !view.wal) return null;
      const ref = hrlFromHostWal(view.wal, encodeHashToBase64);
      if (!ref) return null;
      // The raw hash is taken from the WAL rather than decoded back out of
      // `ref`, so nothing round-trips through base64 on the way to a read.
      return { ref, target: view.wal.hrl[1] };
    },

    // `client.assets.userSelectAsset(from?)` (`api.d.ts:84`) — on the `assets`
    // sub-namespace, not on the client, and it resolves `undefined` on cancel.
    // `'pocket'` is the library's own default and is passed explicitly so the
    // default moving does not change what this UI offers.
    pickAsset: async () => {
      const wal = await client.assets.userSelectAsset('pocket');
      if (!wal) return null;
      return hrlFromHostWal(wal, encodeHashToBase64);
    },

    // OPEN-WORK 1.30. `notifyFrame` takes an ARRAY and a free-form
    // `notification_type`; both are narrowed here rather than passed through.
    // The array is narrowed because a batch invites a digest and a digest is a
    // count with extra steps, which 6.15's decision refused. The type is fixed
    // at 'critique' because it is the only kind of notice this Tool raises,
    // and a caller choosing the string is a caller who can drift from it.
    //
    // CAUGHT RATHER THAN AWAITED-AND-TRUSTED. A host that declines
    // notifications is the ordinary case — Moss makes them configurable per
    // Tool — so a rejection here must not surface as an error in a UI that has
    // already told the user in its own frame. The 6.15 line is rendered before
    // this is reached, so the worst outcome of a throw is that the host frame
    // stays quiet, which is exactly what the user asked for if they turned it
    // off.
    notify: async (notice) => {
      try {
        await client.notifyFrame([{
          title: notice.title,
          body: notice.body,
          notification_type: 'critique',
          icon_src: undefined,
          // 'low', AND THIS IS THE SUB-DECISION THE ROW DID NOT ANTICIPATE.
          // `urgency` is mandatory and is a three-level ranking whose levels
          // are delivery channels (types.d.ts:62-66): 'low' reaches Moss's
          // Activity Feed, 'medium' ADDS A DOT TO THE SYSTEM TRAY, and 'high'
          // additionally fires an OS notification.
          //
          // 6.15's decision refused a badge, a count, a dot and an ordering by
          // name. 'medium' is that dot, arriving from the other side of the
          // host boundary, and 'high' is the dot plus an interruption — so the
          // precedent rules out two of the three levels, and the one left is
          // the one that was going to be chosen on its own merits anyway.
          //
          // IT STILL DOES THIS ROW'S ONE JOB. 1.30 survives only as the
          // app-closed difference, and the Activity Feed is persistent: a
          // reader whose Tool was not in front still finds the notice when
          // they next look. What 'low' gives up is the INTERRUPTION, which is
          // the part a disagreement has not earned — claiming OS-level urgency
          // for somebody disagreeing with you is an attention ordering
          // asserting itself as importance, which is what that decision was
          // about. If an interruption is ever wanted it is a separate
          // decision, and it is one character here.
          urgency: 'low',
          // RECEIPT TIME, and the field wants the ACTION's time — Moss uses it
          // to decide whether an event is fresh or happened while the user was
          // offline. The signal payload carries the critique's hash and mode
          // and no timestamp, so the action's own time is not in hand here
          // without a second read. These are close by construction: a remote
          // signal is ephemeral and arrives only while this client is
          // connected and listening, so it cannot deliver a stale event. The
          // field is MILLISECONDS, which `Date.now()` already is — unlike the
          // protocol's own timestamps, which are micros.
          timestamp: Date.now(),
        }]);
      } catch { /* a host that declines is not a failure — see above */ }
    },

    // OPEN-WORK 1.31. `profilesClient` is on `RenderInfo` itself, not behind a
    // call, and sits on the SAME object `groupProfiles` is read from eleven
    // lines above — which is the contrast that made this a gap rather than a
    // tidy-up: the group had a name on screen and the people in it did not.
    //
    // `getAgentProfile` RETURNS AN `EntryRecord<Profile>`, not a `Profile`.
    // The nickname is `.entry.nickname`, and reading `.nickname` off the
    // record yields `undefined` — a silent wrong answer that renders as a
    // missing name rather than as an error, which is this repository's
    // recurring failure shape and is why the path is written out here.
    //
    // LOCAL-ONLY ON PURPOSE, which is the library's own default and is stated
    // rather than inherited. A byline resolves per agent on a screen that can
    // hold many, and a network `get` each would put a round trip between a
    // reader and a list they are already looking at. Inside a Moss group a
    // member's profile is gossiped within the group DNA and is very likely
    // present; when it is not, the byline shows the key, which is what it
    // showed before this existed. The cost of being wrong is a missing aid,
    // never a missing attribution.
    //
    // EVERY FAILURE IS `null`. The cross-group arm carries no profiles client
    // at all (`applet.ts` documents that union), an older host may not have
    // one, and the call itself can reject. None of those is distinguishable
    // to a caller and none of them should be — see the interface comment on
    // why telling them apart would mean making a claim about a person out of
    // a cache miss.
    participantName: async (agent) => {
      const profiles = appletView?.profilesClient;
      if (!profiles) return null;
      try {
        const record = await profiles.getAgentProfile(agent, true);
        const nickname = record?.entry?.nickname;
        return typeof nickname === 'string' && nickname.length > 0 ? nickname : null;
      } catch {
        return null;
      }
    },

    // OPEN-WORK 1.32. `sendRemoteSignal` is fire-and-forget to group members
    // who are ONLINE, writes to no chain, and is a different mechanism from
    // the protocol's `emit_signal` — which 6.24 established reaches only the
    // LOCAL conductor's websocket clients and so can never carry a remote
    // agent's publication across.
    //
    // THE ENCODING IS UTF-8 JSON RATHER THAN MSGPACK, and the doc comment
    // suggesting msgpack is a suggestion: the parameter is `Uint8Array` and
    // nothing in the host inspects it. JSON keeps the codec in `applet.ts`
    // where it is pure and exercisable off a host, and the payload is two
    // short strings — the size argument msgpack would win does not arise.
    //
    // SWALLOWED ON FAILURE, same contract as `notify`. An announcement that
    // does not go out costs a reader a marker they would have got; the
    // critique itself is already on the chain by the time this is called, so
    // nothing is lost that a re-read does not recover.
    announceCritique: async (claimRef) => {
      try {
        await client.sendRemoteSignal(new TextEncoder().encode(encodeCritiqueArrived(claimRef)));
      } catch { /* ephemeral by contract — see above */ }
    },

    // THE RECEIVING HALF. Returns the host's own `UnsubscribeFunction`.
    //
    // THE CHANNEL IS SHARED WITH EVERY OTHER TOOL IN THE GROUP, so a payload
    // that is not ours is the ORDINARY case. Anything that does not decode is
    // dropped in silence by `decodeCritiqueArrived` — not logged, because a
    // console line per signal from a neighbouring Tool is a log that teaches
    // its reader to stop reading it.
    //
    // DECODING BYTES CANNOT THROW PAST THIS. `TextDecoder` with the default
    // (non-fatal) setting substitutes replacement characters rather than
    // raising, so malformed UTF-8 arrives as a string that fails `JSON.parse`
    // inside the codec, which already answers `null`. The try/catch is kept
    // anyway for the one thing outside that: a host handing a payload that is
    // not a `Uint8Array` at all.
    onCritiqueAnnounced: (cb) => {
      return client.onRemoteSignal((payload) => {
        let claimRef: string | null = null;
        try {
          claimRef = decodeCritiqueArrived(new TextDecoder().decode(payload));
        } catch {
          return;
        }
        if (claimRef !== null) cb(claimRef);
      });
    },

    // THE MANDATORY ONE. `resolve`, `reject` and `cancel` are passed INTO the
    // creatable view by the host (`types.d.ts:122-136`) and its dialog stays
    // open until one of them is called. A view that forgets does not fail —
    // it hangs, in somebody else's UI, which is the worst available outcome
    // and the reason this is a required method rather than an optional one.
    finishCreatable: async (result) => {
      const view = appletView?.view;
      if (!view || view.type !== 'creatable') return;
      if (result.ok) {
        await view.resolve({ hrl: [result.dnaHash, result.targetHash] });
      } else if (result.reason === 'cancel') {
        await view.cancel();
      } else {
        await view.reject(result.error);
      }
    },
  };
}

/** Re-exported so `main.ts` has one import for the host boundary and the
 *  `Hrl` shape it hands back. */
export type { Hrl };
