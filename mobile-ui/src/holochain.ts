// Connection + zome-call layer for the practitioner mobile UI.
//
// Mirrors bridge/src/index.ts's HolochainClient#connect flow (the real,
// live-verified admin-auth sequence documented in README.md's Phase 1
// changelog: AdminWebsocket -> issueAppAuthenticationToken ->
// AppWebsocket.connect -> appInfo -> authorizeSigningCredentials per
// cell) rather than reinventing it, since that sequence was hard-won —
// see the bridge's own comments for the two real bugs (missing Origin
// header, unauthorized signing credentials) that made this non-obvious.
//
// TWO CONNECTION SHAPES, because this UI now ships in two ways and they
// are not the same environment. `connect()` below picks between them by
// asking the client library, never by configuration:
//
//   1. LAUNCHER (`launcherEnvPresent()` below — the Holochain Launcher,
//      or any host injecting `window.__HC_LAUNCHER_ENV__`). This is the path a
//      `.webhapp` installed by someone else actually takes. The host
//      has already issued the app authentication token and chosen the
//      app interface port, and injects both; `AppWebsocket.connect()`
//      with no arguments reads them itself. Critically, the Launcher
//      NEVER exposes the Admin API to UI code — so on this path there
//      is no AdminWebsocket, no `issueAppAuthenticationToken`, and no
//      `authorizeSigningCredentials`. Zome calls are signed by the
//      host's own injected signer (`__HC_ZOME_CALL_SIGNER__`), which
//      the client library's callZome transform prefers over its own
//      in-page signing whenever it is present.
//
//      Getting this wrong is not a degraded experience, it is a dead
//      bundle: the admin-auth flow below would throw at its very first
//      line inside a Launcher, before any screen could render.
//
//   2. DIRECT ADMIN (everything else — a browser pointed at a
//      practitioner's own conductor, `scripts/sandbox.sh`, the
//      live-verification harnesses). No host issues anything, so this
//      UI does the admin-auth dance itself, mirroring the bridge.
//      Appropriate for developing against your own local conductor;
//      still not a production multi-tenant auth model, and still not
//      what an installed `.webhapp` uses.
import { AdminWebsocket, AppWebsocket, CellType, type AppClient, type CellId } from '@holochain/client';
import { decode } from '@msgpack/msgpack';

/** The sentinel a Holochain Launcher injects onto `window` before
 * loading a hApp's UI, carrying the app interface port and the app
 * authentication token it has already issued.
 *
 * @holochain/client 0.17.1 has its own `isLauncher()` using exactly this
 * name, but does not re-export it: `lib/index.d.ts` re-exports only
 * `api`, `hdk`, `types` and `utils`, not `environments/`. Rather than
 * deep-import a path the package's `exports` map does not expose (which
 * would break on any repackaging, and is not a supported entry point),
 * the one-line check is written out here. This is safe to duplicate
 * precisely because the name is not the library's private detail but
 * the HOST's contract — `AppWebsocket.connect()` keys its own
 * url-and-token discovery off the very same `window.__HC_LAUNCHER_ENV__`
 * that this reads, so the two cannot disagree about whether a Launcher
 * is present. Confirmed against the installed 0.17.1 source. */
const LAUNCHER_ENV_KEY = '__HC_LAUNCHER_ENV__';

function launcherEnvPresent(): boolean {
  return typeof window !== 'undefined' && LAUNCHER_ENV_KEY in window;
}

export interface ConductorConfig {
  adminUrl: string;
  appUrl: string;
  appId: string;
  roleName: string;
  zomeName: string;
}

export const DEFAULT_CONFIG: ConductorConfig = {
  // Matches scripts/sandbox.sh's own fixed ports and bridge/.env.example's
  // defaults exactly — see that script's header comment.
  adminUrl: 'ws://localhost:8889',
  appUrl: 'ws://localhost:8888',
  appId: 'epistemic-resonance-happ',
  roleName: 'epistemic',
  zomeName: 'epistemic_coordinator',
};

const CONFIG_STORAGE_KEY = 'epistemic-mobile-ui:conductor-config';

/** Reads a saved config from localStorage, falling back to the sandbox
 * defaults for anything missing or on first run. Never throws — a
 * corrupted or absent value just means "use the defaults," the same
 * as this app never having been configured before. */
export function loadConfig(): ConductorConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: ConductorConfig): void {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // localStorage can throw (private browsing, quota) — losing the
    // saved config is a minor inconvenience (falls back to defaults
    // next load), not a reason to break the connect flow over.
  }
}

export class HolochainConnection {
  private client: AppClient;
  readonly config: ConductorConfig;
  readonly myAgentPubKey: Uint8Array;

  private constructor(client: AppClient, config: ConductorConfig, myAgentPubKey: Uint8Array) {
    this.client = client;
    this.config = config;
    this.myAgentPubKey = myAgentPubKey;
  }

  /** True when a host (the Holochain Launcher) is supplying the app
   * connection, meaning this UI must not ask the user for URLs it will
   * not use and must not reach for an Admin API it cannot have. */
  static isHosted(): boolean {
    return launcherEnvPresent();
  }

  static async connect(config: ConductorConfig): Promise<HolochainConnection> {
    if (launcherEnvPresent()) return HolochainConnection.connectViaLauncher(config);
    return HolochainConnection.connectViaAdmin(config);
  }

  /** Launcher path — see this file's header, shape (1). Everything the
   * connection needs is injected by the host; the only thing this
   * method may legitimately do is ask for it. */
  private static async connectViaLauncher(config: ConductorConfig): Promise<HolochainConnection> {
    // No url and no token argument on purpose: AppWebsocket.connect
    // reads APP_INTERFACE_PORT and APP_INTERFACE_TOKEN out of the
    // injected launcher environment itself, and passing our own would
    // override the host's with values this UI has no way to know.
    const client = await AppWebsocket.connect();

    // client.myPubKey comes from the AppInfo the host's own token was
    // issued against — the authoritative answer to "who am I" here.
    // The admin path below has to dig the same key out of a cell id
    // only because it enumerates cells for signing authorization,
    // which this path must not do.
    return new HolochainConnection(client, config, client.myPubKey);
  }

  /** Direct-admin path — see this file's header, shape (2). */
  private static async connectViaAdmin(config: ConductorConfig): Promise<HolochainConnection> {
    // bridge/src/index.ts's own connect() passes an explicit
    // `wsClientOptions.origin` because Node's `ws` client sends no
    // Origin header by default, which a real conductor rejects even
    // under `allowed_origins: Any`. A browser's native WebSocket has no
    // such gap — it always sends a real, truthful Origin itself, and
    // (unlike Node's `ws`) gives no way to override it from JS at all.
    // This isn't just "unneeded" here, it's actively broken to pass:
    // @holochain/client's WsClient.connect forwards its second argument
    // straight into `new WebSocket(url, options)`, and the *native*
    // WebSocket constructor's second positional argument is the
    // `protocols` list (string | string[]), not an options bag — an
    // object there fails immediately with "Failed to construct
    // 'WebSocket': The subprotocol '[object Object]' is invalid."
    // Confirmed directly, running this in a real (Playwright-driven)
    // Chromium against a live conductor, not assumed from reading the
    // library's source alone.
    const admin = await AdminWebsocket.connect({ url: new URL(config.adminUrl) });

    let token;
    try {
      const issued = await admin.issueAppAuthenticationToken({ installed_app_id: config.appId });
      token = issued.token;
    } catch (error) {
      throw new Error(
        `Failed to issue an app authentication token for "${config.appId}" via the admin ` +
        `interface at ${config.adminUrl}. Confirm the app id matches what's actually ` +
        `installed on this conductor. Cause: ${error}`
      );
    }

    const client = await AppWebsocket.connect({ url: new URL(config.appUrl), token });

    const info = await client.appInfo();
    const cellIds: CellId[] = [];
    for (const roleCells of Object.values(info.cell_info)) {
      for (const cell of roleCells) {
        // CellInfo is a discriminated union as of @holochain/client 0.21
        // ({ type, value }), where it used to be keyed by cell type. The
        // old `CellType.Provisioned in cell` test matches nothing against
        // the new shape and silently yields no cell ids.
        if (cell?.type === CellType.Provisioned || cell?.type === CellType.Cloned) {
          cellIds.push(cell.value.cell_id);
        }
      }
    }
    if (cellIds.length === 0) {
      throw new Error(
        `App "${config.appId}" has no provisioned or cloned cells — every zome call would ` +
        `fail with NoSigningCredentialsForCell.`
      );
    }
    for (const cellId of cellIds) {
      await admin.authorizeSigningCredentials(cellId);
    }

    const myAgentPubKey = cellIds[0][1];
    return new HolochainConnection(client, config, myAgentPubKey);
  }

  async callZome<T = unknown>(fnName: string, payload: unknown): Promise<T> {
    return this.client.callZome({
      role_name: this.config.roleName,
      zome_name: this.config.zomeName,
      fn_name: fnName,
      payload,
    }) as Promise<T>;
  }
}

/** A Record as the conductor hands it back, with the App entry decoded
 * (record.entry.Present.entry arrives as raw msgpack bytes — the client
 * library has no way to know this app's entry schema, so it hands back
 * opaque bytes rather than decoding them; every screen in this app
 * needs the decoded form, so this is done once, here, rather than
 * repeated ad hoc at each call site). */
export interface DecodedRecord<T> {
  entryHash: Uint8Array;
  actionHash: Uint8Array;
  entry: T;
}

export function decodeRecords<T>(records: any[]): DecodedRecord<T>[] {
  const out: DecodedRecord<T>[] = [];
  for (const record of records) {
    const present = record?.entry?.Present;
    if (!present) continue;
    out.push({
      entryHash: record.signed_action.hashed.content.data.entry_hash,
      actionHash: record.signed_action.hashed.hash,
      entry: decode(present.entry) as T,
    });
  }
  return out;
}
