// ============================================================================
// gateway/src/conductor.ts — a read-only door onto a conductor.
//
// THE ONE PROPERTY THIS FILE EXISTS TO ENFORCE. The Linked Data face is a
// ONE-WAY EXPORT. The DHT is the source; HTTP is a mirror; nothing a reader
// does over HTTP may reach the protocol. That is easy to say and easy to lose
// later — a gateway with a conductor connection is three lines away from
// accepting a POST — so it is enforced here rather than promised in a README:
//
//   Every zome call goes through `read()`, which refuses any function not in
//   READS. The list is the complete set of coordinator functions this service
//   may call, it contains no writer, and a call to anything else throws
//   before it reaches the conductor. A future handler that tried to publish
//   would fail on its first request rather than working quietly.
//
// This is the same shape as the notes service's own guarantee (it holds no
// Holochain credentials at all, so it cannot publish). This service does hold
// credentials — it must, since even a read is a signed zome call — so the
// guarantee has to be made a different way.
//
// AND IT CONNECTS AS SOMEBODY. A zome call is signed, so the gateway runs as
// an agent on the network, with an agent key of its own. What it therefore is
// NOT: an anonymous window onto other people's data. It is a member of the
// network that has chosen to re-publish what it can read, which is a thing a
// human operator decides to do and takes responsibility for. `README.md` says
// so in the operator's own words rather than leaving it implied.
// ============================================================================

import { AdminWebsocket, AppWebsocket, CellType, type AppClient, type CellId } from '@holochain/client';
import { decode } from '@msgpack/msgpack';

/** Every coordinator function this gateway may call. Reads only.
 *
 * Adding a name here is the only way to widen what the gateway can do, which
 * makes widening it a visible, reviewable act. Nothing in this list writes:
 * checked against the coordinator's own externs, and asserted again by
 * `scripts/live-verify/linked-data-gateway.mjs` against the built bundle. */
const READS = new Set([
  'get_claim',
  'get_claims_by_domain',
  'get_claims_by_agent',
  'get_critiques_for',
  'get_retractions_for_claim',
  'get_antibody_patterns_for',
  'get_evidence',
  'get_grounding_path',
  'get_membranes',
  'get_agent_constitution',
]);

export interface GatewayConfig {
  adminUrl: string;
  appUrl: string;
  appId: string;
  roleName: string;
  zomeName: string;
}

export const DEFAULT_CONFIG: GatewayConfig = {
  adminUrl: 'ws://localhost:8889',
  appUrl: 'ws://localhost:8888',
  appId: 'epistemic-resonance-happ',
  roleName: 'epistemic',
  zomeName: 'epistemic_coordinator',
};

export class ReadOnlyConductor {
  private constructor(
    private readonly client: AppClient,
    private readonly config: GatewayConfig,
    readonly myAgentPubKey: Uint8Array,
  ) {}

  /** The admin-auth sequence this project has established twice already —
   * `bridge/src/index.ts` and `mobile-ui/src/holochain.ts`, whose headers
   * carry the reasoning and the two real bugs that made it non-obvious. There
   * is no Launcher path here: a gateway is a server someone runs, not a UI a
   * host loads. */
  static async connect(config: GatewayConfig): Promise<ReadOnlyConductor> {
    const admin = await AdminWebsocket.connect({
      url: new URL(config.adminUrl),
      // Node's `ws` client sends no Origin header by default and a real
      // conductor rejects that even under `allowed_origins: Any`. A browser
      // sends its own and must NOT be given this — see mobile-ui's header for
      // the browser half of the same story.
      wsClientOptions: { origin: 'epistemic-gateway' },
    });
    const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: config.appId });
    const client = await AppWebsocket.connect({
      url: new URL(config.appUrl),
      token,
      wsClientOptions: { origin: 'epistemic-gateway' },
    });

    const info = await client.appInfo();
    const cellIds: CellId[] = [];
    for (const roleCells of Object.values(info?.cell_info ?? {})) {
      for (const cell of roleCells) {
        if (cell?.type === CellType.Provisioned || cell?.type === CellType.Cloned) {
          cellIds.push(cell.value.cell_id);
        }
      }
    }
    if (cellIds.length === 0) {
      throw new Error(`app "${config.appId}" has no provisioned cells — every read would fail`);
    }
    for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
    return new ReadOnlyConductor(client, config, cellIds[0][1]);
  }

  /** The only way this process talks to the DHT. */
  async read<T = unknown>(fnName: string, payload: unknown = null): Promise<T> {
    if (!READS.has(fnName)) {
      throw new Error(
        `${fnName} is not a read this gateway may perform. The Linked Data face is a one-way `
        + `export: the DHT is the source and HTTP is a mirror, so nothing here writes. If a new `
        + `READ is genuinely needed, add it to READS in conductor.ts deliberately.`,
      );
    }
    return this.client.callZome({
      role_name: this.config.roleName,
      zome_name: this.config.zomeName,
      fn_name: fnName,
      payload,
    }) as Promise<T>;
  }
}

/** A Record as the conductor returns it, with the App entry decoded. Same
 * shape and same reasoning as `mobile-ui/src/holochain.ts`'s own decoder: the
 * client library cannot know this app's entry schema, so it hands back opaque
 * msgpack bytes. */
export interface DecodedRecord<T> {
  entryHash: Uint8Array;
  actionHash: Uint8Array;
  author: Uint8Array;
  timestamp: number;
  entry: T;
}

export function decodeRecords<T>(records: any[]): DecodedRecord<T>[] {
  const out: DecodedRecord<T>[] = [];
  for (const record of records ?? []) {
    const present = record?.entry?.Present;
    if (!present) continue;
    const content = record.signed_action.hashed.content;
    out.push({
      entryHash: content.data.entry_hash,
      actionHash: record.signed_action.hashed.hash,
      author: content.author,
      timestamp: content.timestamp,
      entry: decode(present.entry) as T,
    });
  }
  return out;
}
