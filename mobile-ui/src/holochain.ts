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
// One deliberate simplification, stated plainly rather than left
// implicit: a real multi-user deployment of a Holochain hApp UI is
// normally loaded by the Holochain Launcher, which issues the app
// auth token itself — the UI never touches an AdminWebsocket. This
// client instead does the admin-auth dance directly, the same way the
// Twitter bridge and this project's own live-verification harnesses
// do, because it's meant to run against a practitioner's own locally
// running conductor (scripts/sandbox.sh, or a real `hc` install), not
// a production multi-tenant deployment. That's a real, working shape
// for this project's current stage, not the final production auth
// model.
import { AdminWebsocket, AppWebsocket, CellType, type AppClient, type CellId } from '@holochain/client';
import { decode } from '@msgpack/msgpack';

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

  static async connect(config: ConductorConfig): Promise<HolochainConnection> {
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
        if (CellType.Provisioned in cell) cellIds.push(cell[CellType.Provisioned].cell_id);
        else if (CellType.Cloned in cell) cellIds.push(cell[CellType.Cloned].cell_id);
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
      entryHash: record.signed_action.hashed.content.entry_hash,
      actionHash: record.signed_action.hashed.hash,
      entry: decode(present.entry) as T,
    });
  }
  return out;
}
