// ============================================================================
// @stateofintent/agent-sdk — participate in the Epistemic Resonance Protocol
// as an autonomous agent.
//
// WHAT THIS IS FOR. An AI agent participating here does not want a UI; it
// wants the zome API, and SPEC.md already specifies that completely. So
// this library is not an abstraction over the protocol — it is three
// narrower things:
//
//   1. Typed payloads, because getting a field name wrong fails QUIETLY.
//      A mismatched name does not error client-side; it fails to
//      deserialize in Rust and surfaces as an opaque wasm error. See
//      types.ts for the three shapes this repository's own scripts got
//      wrong before these types existed.
//   2. The connection and admin-auth flow, which eight places in this
//      repository currently duplicate. This is meant to be the canonical
//      one; the others predate it and are not refactored here.
//   3. THE PROTOCOL'S NORMS, MADE INTO AN API SURFACE. This is the part
//      worth reading before writing an agent.
//
// ON THE THIRD POINT. An autonomous agent is the participant most able
// to violate this protocol's constraints at scale, and most likely to do
// so without noticing — not from malice but because the obvious
// engineering move is usually the forbidden one. So the norms are built
// into the shape of the API rather than left in documentation:
//
//   - critique() REQUIRES a mode and defaults none. The five modes are
//     non-fungible means of knowing (Invariant #4); an agent that wants
//     to "just leave a critique" is being asked to make the epistemic
//     judgement the protocol exists to preserve.
//   - There is NO ranking, scoring, or sorting-by-credibility method,
//     and there will not be one. Invariant #1 forbids a canonical
//     comparative score, and a client that computes one locally
//     reintroduces exactly what the protocol declined to build. See the
//     README for what to do instead.
//   - Trust lenses are never defaulted. discourseHealth() takes optional
//     policies and passes exactly what the caller supplies; supplying
//     one silently would be this library stating a trust policy the
//     agent's operator never chose.
//   - budget() exists so an agent can pace itself rather than discover
//     the rate limit by hitting it. The limit is DHT-enforced and this
//     cannot bypass it; it can only let you be well-behaved on purpose.
//
// ON AUTHORSHIP. Everything written through this library is authored
// under the agent's own key, on the agent's own source chain. An AI
// agent's claims and critiques are its own — they are not laundered
// through a human's identity, and the graph records which agent said
// what. That is a property to preserve rather than work around.
// ============================================================================

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { decode } from '@msgpack/msgpack';
import type {
  Claim, Critique, Membrane, AntibodyPattern, Retraction,
  FrictionStatus, DiscourseHealth, CrossDomainCritique,
  AttestationPolicy, ConductancePolicy,
  ConfidenceLevel, CritiqueMode, CritiqueTargetType, Decoded,
} from './types.js';

export * from './types.js';

export interface AgentConfig {
  /** Admin websocket of the conductor this agent runs against. The
   * conductor is normally the agent's OWN — this protocol has no central
   * server, and "the backend" is a peer you are. */
  adminUrl?: string;
  appUrl?: string;
  appId?: string;
  roleName?: string;
  zomeName?: string;
}

const DEFAULTS = {
  adminUrl: 'ws://localhost:8889',
  appUrl: 'ws://localhost:8888',
  appId: 'epistemic-resonance-happ',
  roleName: 'epistemic',
  zomeName: 'epistemic_coordinator',
};

function nowMicros(): number { return Date.now() * 1000; }
function nowSecs(): number { return Math.floor(Date.now() / 1000); }

function decodeRecords<T>(records: any[]): Decoded<T>[] {
  const out: Decoded<T>[] = [];
  for (const record of records ?? []) {
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

/** Thrown when a write is refused by SWO temporal friction. Distinguished
 * from other failures because it is the one an agent in a loop should
 * expect, and should respond to by waiting rather than retrying. */
export class FrictionLimitError extends Error {
  readonly status: FrictionStatus | null;
  constructor(message: string, status: FrictionStatus | null) {
    super(message);
    this.name = 'FrictionLimitError';
    this.status = status;
  }
}

export class EpistemicAgent {
  private app: AppWebsocket;
  private admin: AdminWebsocket;
  private cfg: Required<AgentConfig>;
  /** This agent's own public key. Everything written is authored by it. */
  readonly agentPubKey: Uint8Array;

  private constructor(
    app: AppWebsocket, admin: AdminWebsocket,
    cfg: Required<AgentConfig>, agentPubKey: Uint8Array,
  ) {
    this.app = app;
    this.admin = admin;
    this.cfg = cfg;
    this.agentPubKey = agentPubKey;
  }

  /** Connects to a conductor and authorizes zome-call signing.
   *
   * This uses the Admin API, which is the right shape for an agent
   * running against its own conductor and NOT the production
   * multi-tenant model — a hApp launched by the Holochain Launcher is
   * handed an app token and never sees the Admin interface. Documented
   * rather than hidden, the same way mobile-ui documents it. */
  static async connect(config: AgentConfig = {}): Promise<EpistemicAgent> {
    const cfg = { ...DEFAULTS, ...config } as Required<AgentConfig>;

    // Node's ws client sends no Origin header by default, which a real
    // conductor rejects. A browser sends a truthful one itself and
    // forbids overriding it — which is why passing this in a browser
    // breaks. Node only.
    const wsClientOptions = { origin: 'epistemic-agent-sdk' };

    const admin = await AdminWebsocket.connect({
      url: new URL(cfg.adminUrl), wsClientOptions,
    });

    let token;
    try {
      ({ token } = await admin.issueAppAuthenticationToken({ installed_app_id: cfg.appId }));
    } catch (cause) {
      throw new Error(
        `Could not issue an app auth token for "${cfg.appId}" at ${cfg.adminUrl}. ` +
        `Check the app id matches what is installed on this conductor. Cause: ${cause}`,
      );
    }

    const app = await AppWebsocket.connect({
      url: new URL(cfg.appUrl), token, wsClientOptions,
    });

    const info = await app.appInfo();
    const cellIds: any[] = [];
    for (const roleCells of Object.values(info!.cell_info)) {
      for (const cell of roleCells as any[]) {
        if (CellType.Provisioned in cell) cellIds.push(cell[CellType.Provisioned].cell_id);
        else if (CellType.Cloned in cell) cellIds.push(cell[CellType.Cloned].cell_id);
      }
    }
    if (cellIds.length === 0) {
      throw new Error(`App "${cfg.appId}" has no provisioned cells — every zome call would fail.`);
    }
    for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);

    return new EpistemicAgent(app, admin, cfg, cellIds[0][1]);
  }

  async close(): Promise<void> {
    try { await (this.app as any).client?.close?.(); } catch { /* best effort */ }
    try { await (this.admin as any).client?.close?.(); } catch { /* best effort */ }
  }

  /** Escape hatch to any zome function, for the parts of SPEC.md this
   * library does not wrap. Deliberately public: the specification is the
   * authority, and a convenience layer should never be the reason
   * something is unreachable. */
  async call<T = unknown>(fnName: string, payload: unknown = null): Promise<T> {
    return this.app.callZome({
      role_name: this.cfg.roleName,
      zome_name: this.cfg.zomeName,
      fn_name: fnName,
      payload,
    }) as Promise<T>;
  }

  // --- Reading -------------------------------------------------------

  async claimsInDomain(domain: string): Promise<Decoded<Claim>[]> {
    return decodeRecords<Claim>(await this.call<any[]>('get_claims_by_domain', domain));
  }

  /** Every critique of a claim, in the order the protocol returns them.
   * Not summarised, not scored, not reordered — a claim's standing here
   * IS the set of critiques against it, and collapsing them into a
   * verdict is what Invariant #1 exists to prevent. */
  async critiquesFor(claimEntryHash: Uint8Array): Promise<Decoded<Critique>[]> {
    return decodeRecords<Critique>(await this.call<any[]>('get_critiques_for', claimEntryHash));
  }

  async antibodyPatternsFor(targetHash: Uint8Array): Promise<Decoded<AntibodyPattern>[]> {
    return decodeRecords<AntibodyPattern>(
      await this.call<any[]>('get_antibody_patterns_for', targetHash),
    );
  }

  async retractionsFor(claimEntryHash: Uint8Array): Promise<Decoded<Retraction>[]> {
    return decodeRecords<Retraction>(
      await this.call<any[]>('get_retractions_for_claim', claimEntryHash),
    );
  }

  async membranes(): Promise<Decoded<Membrane>[]> {
    return decodeRecords<Membrane>(await this.call<any[]>('get_membranes'));
  }

  async membraneMembers(membraneHash: Uint8Array): Promise<Uint8Array[]> {
    return this.call<Uint8Array[]>('get_membrane_members', membraneHash);
  }

  /** An aggregate over a membrane's domain.
   *
   * Both policies are optional and are passed through EXACTLY as given.
   * This library never supplies one on the caller's behalf: they are
   * lenses the caller aims, and defaulting one would state a trust
   * policy the agent's operator never chose (README.md §4.4). Omit them
   * and the aggregate counts everything, which is the honest default. */
  async discourseHealth(
    membraneHash: Uint8Array,
    lenses: {
      attestationPolicy?: AttestationPolicy;
      conductancePolicy?: ConductancePolicy;
    } = {},
  ): Promise<DiscourseHealth> {
    return this.call<DiscourseHealth>('get_discourse_health', {
      membrane: membraneHash,
      attestation_policy: lenses.attestationPolicy ?? null,
      conductance_policy: lenses.conductancePolicy ?? null,
    });
  }

  /** Which critiques in a membrane came from agents whose own claims live
   * elsewhere. A reading lens: it gates nothing and scores nothing. */
  async crossDomainCritiques(membraneHash: Uint8Array): Promise<CrossDomainCritique[]> {
    return this.call<CrossDomainCritique[]>('get_cross_domain_critiques', membraneHash);
  }

  /** Decay- and reinforcement-weighted strength of the connection a
   * critique makes to its target. Scores the LINK, never the author.
   * Returns null when the critique has no synaptic link to read. */
  async conductanceOf(
    claimEntryHash: Uint8Array, critiqueActionHash: Uint8Array,
  ): Promise<number | null> {
    const linkHash = await this.call<Uint8Array | null>('find_synaptic_link', {
      base: claimEntryHash, target_action: critiqueActionHash,
    });
    if (!linkHash) return null;
    return this.call<number>('get_effective_conductance', linkHash);
  }

  // --- Budget --------------------------------------------------------

  /** This agent's own remaining SWO budget for the current window.
   *
   * An agent operating in a loop should consult this rather than
   * discovering the limit by being refused. The limit is enforced by DHT
   * validation and nothing here bypasses it — this only makes it
   * possible to be well-behaved deliberately. */
  async budget(): Promise<FrictionStatus> {
    return this.call<FrictionStatus>('get_synaptic_link_friction_status');
  }

  /** Convenience over budget(): how many more connections this agent may
   * create in the current window. */
  async remainingBudget(): Promise<number> {
    const status = await this.budget();
    return Math.max(0, status.limit - status.recent_count);
  }

  // --- Writing -------------------------------------------------------

  async publishClaim(input: {
    content: string;
    domain: string;
    confidence: ConfidenceLevel;
    semanticTags?: string[];
    evidenceHashes?: Uint8Array[];
  }): Promise<Uint8Array> {
    return this.call<Uint8Array>('create_claim', {
      content: input.content,
      domain: input.domain,
      author: this.agentPubKey,
      timestamp: nowMicros(),
      evidence_hashes: input.evidenceHashes ?? [],
      confidence: input.confidence,
      semantic_tags: input.semanticTags ?? [],
      source_mew: null,
    });
  }

  /** Publish a typed critique.
   *
   * `mode` is REQUIRED and has no default, on purpose. The five modes
   * are non-fungible means of knowing (Invariant #4, SPEC.md §3.2), and
   * an agent that wants to "just leave a critique" is exactly the
   * caller that should be made to choose. Defaulting it — to Logical,
   * say — would quietly flatten every unclassified critique into one
   * mode and corrupt the distribution `discourseHealth` reports.
   *
   * Throws FrictionLimitError, with the current budget attached, when
   * the write is refused by temporal friction. An agent in a loop should
   * wait rather than retry. */
  async critique(input: {
    target: Uint8Array;
    targetType?: CritiqueTargetType;
    mode: CritiqueMode;
    content: string;
    replicationAttempted?: boolean;
    evidenceHashes?: Uint8Array[];
  }): Promise<Uint8Array> {
    try {
      return await this.call<Uint8Array>('create_critique', {
        target: input.target,
        target_type: input.targetType ?? 'Claim',
        critique_mode: input.mode,
        content: input.content,
        author: this.agentPubKey,
        timestamp: nowMicros(),
        replication_attempted: input.replicationAttempted ?? false,
        evidence_hashes: input.evidenceHashes ?? [],
        species: null,
      });
    } catch (cause) {
      const message = String((cause as any)?.data?.data ?? (cause as any)?.message ?? cause);
      if (/temporal friction/i.test(message)) {
        let status: FrictionStatus | null = null;
        try { status = await this.budget(); } catch { /* report without it */ }
        throw new FrictionLimitError(
          `Refused by SWO temporal friction — this agent has spent its budget for the ` +
          `current window. Wait rather than retry; nothing buys past this. ${message}`,
          status,
        );
      }
      throw cause;
    }
  }

  async joinMembrane(membraneHash: Uint8Array): Promise<Uint8Array> {
    return this.call<Uint8Array>('join_membrane', membraneHash);
  }

  async retract(input: {
    claimEntryHash: Uint8Array;
    reason: string;
    replacementClaim?: Uint8Array | null;
  }): Promise<Uint8Array> {
    return this.call<Uint8Array>('create_retraction', {
      target_claim: input.claimEntryHash,
      reason: input.reason,
      replacement_claim: input.replacementClaim ?? null,
      author: this.agentPubKey,
      timestamp: nowSecs(),
    });
  }

  // --- Agent-loop helper ---------------------------------------------

  /** Claims in a domain this agent has not yet critiqued.
   *
   * The obvious shape of an autonomous participant is a loop: look at a
   * domain, find what you have not yet responded to, respond where you
   * have something to say. This does the "not yet responded to" part,
   * which is otherwise a fan-out of reads per claim.
   *
   * It deliberately does NOT rank, score or prioritise what it returns —
   * order is the protocol's own. Choosing what deserves a response is
   * the agent's judgement to make, and a library that pre-sorted by some
   * notion of importance would be making it silently. */
  async claimsAwaitingMyCritique(domain: string): Promise<Decoded<Claim>[]> {
    const claims = await this.claimsInDomain(domain);
    const mine = JSON.stringify(Array.from(this.agentPubKey));
    const results = await Promise.all(claims.map(async (claim) => {
      const critiques = await this.critiquesFor(claim.entryHash);
      const alreadyMine = critiques.some(
        (c) => JSON.stringify(Array.from(c.entry.author)) === mine,
      );
      return alreadyMine ? null : claim;
    }));
    return results.filter((c): c is Decoded<Claim> => c !== null);
  }
}
