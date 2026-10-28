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
  Constitution, ConstitutionPromise, Condition,
  MembranePromiseCompliance, MemberPromiseStanding,
  Assessment, Stance, SettlementPolicy, SettlementStatus,
  SettlementState, RecomputedSettlement,
  SealedPrediction, ForesightRecord, PublishedReading,
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

  /** How long a write may wait for an entry it cites to propagate before
   * giving up, in milliseconds. Default 1_200_000 (20 minutes).
   *
   * WHY THIS EXISTS AND WHY THE DEFAULT IS THAT LARGE. §5.3's referential
   * integrity on `Claim.evidence_hashes` is enforced by the conductor's
   * deterministic dependency fetch, which refuses the commit with
   * `DepMissingFromDht` when a cited hash is not yet available locally. On one
   * node that means the hash is bogus. On a real network it usually means the
   * cited entry EXISTS and has not arrived yet — so the honest retry window is
   * the network's propagation time, measured in this project at 415s, 424.9s,
   * 425.9s, 929.1s and 943.0s (READINESS.md §3). A default below ~16 minutes
   * would abandon writes that were going to succeed.
   *
   * Set to 0 to disable waiting entirely and surface the refusal immediately,
   * which is the right choice for a harness asserting the refusal itself. */
  dependencyWaitMs?: number;

  /** Called before each wait, so a UI can say "waiting for cited evidence to
   * propagate" instead of showing a raw hash. Never called when a write
   * succeeds first time, which is the overwhelmingly common case. */
  onPendingDependency?: (info: PendingDependencyInfo) => void;
}

/** Progress report while a write waits for something it cites. */
export interface PendingDependencyInfo {
  /** Coordinator function being retried, e.g. `create_claim`. */
  readonly fnName: string;
  /** The hashes the conductor said it could not resolve. */
  readonly missingHashes: readonly string[];
  /** 1 on the first wait. */
  readonly attempt: number;
  /** Milliseconds spent waiting so far. */
  readonly waitedMs: number;
  /** Milliseconds left before `dependencyWaitMs` is exhausted. */
  readonly remainingMs: number;
  /** CLOSURE: how much of what this write cites the local observer can
   * actually see, which is the question a timer cannot answer.
   *
   * `null` when it could not be determined — nothing was cited, or the
   * conductor has no `which_entries_resolve_locally` (a happ older than this
   * SDK). Null means UNKNOWN and must not be rendered as zero. */
  readonly closure: ClosureState | null;
}

/** What the local observer can see of a pending write's citations.
 *
 * WHY THIS IS NOT DERIVED FROM `missingHashes`, which is what both SPEC §5.3
 * and READINESS item 12 assumed could be done: **the refusal names exactly one
 * hash however many are missing.** Measured 2026-10-19 — a claim citing two
 * dangling hashes, then three, then three with a resolvable one first and then
 * last, each produced a `DepMissingFromDht` naming a single hash, because the
 * validator loops `must_get_entry` and the host abandons the callback at the
 * first unresolved dependency. Subtracting that one hash from the citation
 * list would report "3 of 4 resolve" for a claim where none of the other three
 * do. So closure is asked for directly instead. */
export interface ClosureState {
  /** How many hashes this write cites and therefore needs resolvable. */
  readonly cited: number;
  /** How many of them the local databases can serve right now. */
  readonly resolvedLocally: number;
  /** The ones they cannot — the whole set, not the one the refusal named. */
  readonly unresolved: readonly Uint8Array[];
}

const DEFAULTS = {
  adminUrl: 'ws://localhost:8889',
  appUrl: 'ws://localhost:8888',
  appId: 'epistemic-resonance-happ',
  roleName: 'epistemic',
  zomeName: 'epistemic_coordinator',
  dependencyWaitMs: 1_200_000,
  onPendingDependency: (_info: PendingDependencyInfo) => { /* no-op */ },
};

/** The conductor refuses a commit whose dependencies are not local yet. This
 * is a commit-time refusal, not a validation rejection: nothing is written,
 * and the same payload succeeds once the dependency arrives. */
const DEPENDENCY_STALL = /DepMissingFromDht|could not be completed but may be retried/i;

function missingHashesIn(message: string): string[] {
  return [...message.matchAll(/AnyDhtHash\(([A-Za-z0-9_-]+)\)/g)].map((m) => m[1]);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** One phrase for a progress message, saying what is known and no more.
 * UNKNOWN is spelled out rather than shown as 0 of 0: a client that printed
 * "0 of 0 resolve" for an unknown closure would be reporting a false green. */
function describeClosure(c: ClosureState | null): string {
  if (!c) return 'closure is unknown (nothing cited, or the conductor predates which_entries_resolve_locally)';
  if (c.cited === 0) return 'cites nothing, so there is nothing to wait for';
  return `${c.resolvedLocally} of ${c.cited} citation${c.cited === 1 ? '' : 's'} resolve locally`;
}

// MICROSECONDS, and the unit is not a free choice: SPEC.md §5.23 declares it
// per field — `timestamp` in micros (matching Holochain's own `Timestamp`),
// and `created_at`/`published_at`/`expires_at` in SECONDS, because
// `get_agent_constitution` and the worldline checkpoint reads compare expiry
// against `sys_time()` in seconds. See `Constitution` in types.ts for what
// goes wrong if the two are mixed.
//
// THE SECONDS HELPER IS NO LONGER DEAD CODE, and this comment used to say it
// was: `publishSettlementPolicy` writes `SettlementPolicy.published_at`,
// which §5.23 puts in the seconds family. It was written with `nowMicros()`
// and `check-time-units.mjs` caught it — a gate that exists because the
// mixup is invisible at every other layer: it type-checks, it validates, it
// round-trips, and only an EXPIRY in the wrong unit misbehaves, ~1e5 too
// large to ever fire. Use the helper that matches the field, not the one
// that is nearest.
function nowMicros(): number { return Date.now() * 1000; }
function nowSecs(): number { return Math.floor(Date.now() / 1000); }
/** Enough of a Constitution to tell two of this agent's apart. Not a
 * hash of the entry — the point is to compare what a client decoded
 * against what the coordinator returned, which travel by different
 * paths and need not be byte-identical to be the same claim. */
function constitutionFingerprint(c: Constitution): string {
  return JSON.stringify([
    c.published_at, c.expires_at ?? null,
    c.promises?.map((p) => [p.action, p.domain, p.modality ?? null]) ?? [],
    c.conditions?.map((x) => [x.condition_type, x.parameters]) ?? [],
  ]);
}

/** Holochain's hash-type prefixes, MEASURED against a live conductor on
 * 2026-10-28 rather than taken from memory: ActionHash `132,41,36`,
 * EntryHash `132,33,36`, AgentPubKey `132,32,36`, all 39 bytes.
 *
 * WHY THIS IS WORTH A HELPER. The zome's structs are typed, so handing a
 * coordinator function an EntryHash where it declares an ActionHash fails
 * while DESERIALIZING THE WHOLE PAYLOAD — before the function body runs,
 * before any friendly check inside it, and before the line number in the
 * error means anything. What the caller sees is
 * `Deserialize([135, 166, 100, 111, ...])`: the msgpack bytes of their own
 * arguments, as a decimal array. Nothing in it says "wrong kind of hash".
 *
 * AND IT IS THE MISTAKE MOST AVAILABLE TO A MODEL, which is the reason it
 * earns a check rather than a comment. `claims_in_domain` returns
 * `entry_hash` and `action_hash` side by side, critique targets ARE entry
 * hashes, and a constitution reference is an action hash — so an agent
 * copying "the hash of the thing" has even odds of copying the wrong one. */
const HASH_PREFIXES = {
  ActionHash: [132, 41, 36],
  EntryHash: [132, 33, 36],
  AgentPubKey: [132, 32, 36],
} as const;

/** Name the kind of hash these bytes are, or null if they are not one. */
function hashKindOf(bytes: Uint8Array): keyof typeof HASH_PREFIXES | null {
  if (bytes?.length !== 39) return null;
  for (const [kind, prefix] of Object.entries(HASH_PREFIXES)) {
    if (prefix.every((byte, i) => bytes[i] === byte)) return kind as keyof typeof HASH_PREFIXES;
  }
  return null;
}

/** Refuse a hash of the wrong kind before the conductor refuses it
 * unreadably. Names what was passed, because "expected an ActionHash" on
 * its own does not tell a caller holding two hashes which one is wrong. */
function requireHashKind(
  bytes: Uint8Array,
  expected: keyof typeof HASH_PREFIXES,
  argument: string,
  because: string,
): void {
  const actual = hashKindOf(bytes);
  if (actual === expected) return;
  throw new Error(
    `${argument} must be an ${expected} and is ${actual === null
      ? `not a Holochain hash at all (${bytes?.length ?? 0} bytes)`
      : `an ${actual}`}. ${because} This is refused here because the zome's structs are ` +
    `typed, so the conductor rejects it while deserializing the whole payload — the caller ` +
    `gets \`Deserialize([135, 166, ...])\`, the msgpack bytes of their own arguments as a ` +
    `decimal array, with nothing in it naming the real problem.`,
  );
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** The protocol's ceiling on a recorded past cone (`MAX_PAST_CONE` in the
 * integrity zome).
 *
 * A bound is required rather than tidy: validation resolves every member
 * and then every member's own members, so an unbounded cone is an
 * unbounded validation cost every peer on the network pays. The zome
 * REFUSES a cone over this rather than trimming one, because a trimmed
 * cone is a false statement about what was seen — so this library
 * refuses too. */
export const MAX_PAST_CONE = 256;

/** A cryptographically random salt, URL-safe base64.
 *
 * WHY THIS IS HERE AND NOT IN THE ZOME. A salt the zome generated would
 * have to be stored in the private entry it protects to be recoverable,
 * which is why `pre_register` takes one instead. A salt generated
 * client-side can be handed straight back to the caller without being
 * stored anywhere, so this is the right layer for it.
 *
 * 32 bytes from the platform CSPRNG. A salt's whole job is to stop a
 * short or guessable prediction being recovered from its commitment
 * hash by brute force, so `Math.random()` would defeat the mechanism
 * while appearing to work. Throws rather than falling back if no CSPRNG
 * is available — a silent downgrade here is the worst available
 * outcome. */
export function randomSalt(): string {
  const g: any = globalThis as any;
  const bytes = new Uint8Array(32);
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(bytes);
  } else {
    throw new Error(
      'No CSPRNG available (globalThis.crypto.getRandomValues). A salt from a ' +
      'non-cryptographic source would leave predictions brute-forceable from ' +
      'their commitment hashes while appearing to work, so this refuses rather ' +
      'than falling back. Supply your own salt to preRegister() instead.',
    );
  }
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeRecords<T>(records: any[]): Decoded<T>[] {
  const out: Decoded<T>[] = [];
  for (const record of records ?? []) {
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

/** A write waited out `dependencyWaitMs` and the entry it cites still had not
 * arrived. The write was never committed, and retrying later with the same
 * payload is valid — this is a propagation timeout, not a rejection. */
export class PendingDependencyError extends Error {
  /** Hashes the conductor could not resolve. NOTE: the conductor names ONE
   * hash per refusal however many are missing, so this is not a count of what
   * is outstanding — `closure` is. */
  readonly missingHashes: readonly string[];
  readonly waitedMs: number;
  readonly attempts: number;
  /** Closure at the moment the budget ran out, or `null` if unknown. */
  readonly closure: ClosureState | null;
  constructor(message: string, info: { missingHashes: readonly string[]; waitedMs: number; attempts: number; closure?: ClosureState | null }) {
    super(message);
    this.name = 'PendingDependencyError';
    this.missingHashes = info.missingHashes;
    this.waitedMs = info.waitedMs;
    this.attempts = info.attempts;
    this.closure = info.closure ?? null;
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
    // CellInfo became a discriminated union in @holochain/client 0.21:
    // `{ type: CellType, value: ProvisionedCell | ClonedCell | StemCell }`,
    // where it used to be an object keyed by cell type. Because these
    // values are `any` here, the old `CellType.Provisioned in cell` test
    // compiled fine against the new client and simply matched nothing,
    // leaving cellIds empty and every zome call failing later with
    // NoSigningCredentialsForCell. Corrected against the published type,
    // not the typechecker.
    const cellIds: any[] = [];
    for (const roleCells of Object.values(info!.cell_info)) {
      for (const cell of roleCells as any[]) {
        if (cell?.type === CellType.Provisioned || cell?.type === CellType.Cloned) {
          cellIds.push(cell.value.cell_id);
        }
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

  /** A write that tolerates the one refusal which is not the author's fault.
   *
   * `call` above stays a THIN passthrough on purpose, and this is deliberately
   * not folded into it. Two reasons.
   *
   * ONE: a retry is only safe when the payload cannot go stale. The conductor
   * stamps the action's own timestamp at commit, and two validators compare it
   * against a self-reported deadline — `validate_revelation` refuses a
   * `Revelation` whose ACTION timestamp is past the `PreRegistration`'s
   * `reveal_deadline`, and `validate_pre_registration` requires the question to
   * predate the commitment. Retrying a reveal across a propagation window could
   * therefore walk it past its own deadline and turn a transient dependency
   * stall into a permanent, CORRECT rejection — silently spending a sealed
   * commitment the author can never make again. So the writes routed through
   * here are the ones with no deadline of their own, and anything with one goes
   * through `call` and surfaces the refusal to its caller.
   *
   * TWO: a harness asserting the refusal needs to see it. `call` retrying would
   * make `scripts/validation-corpus/` and anything else probing dependency
   * behaviour wait instead of observing, which is the same mistake as a timeout
   * raised to hide a stall.
   *
   * Nothing is retried but a dependency stall. A validation rejection, a
   * friction refusal, a transport fault — all rethrown untouched on the first
   * attempt. */
  /** CLOSURE for a set of hashes: how many a write citing them would find
   * resolvable right now, and which it would not.
   *
   * Public because the useful moment is often BEFORE the write. A composer
   * holding four evidence hashes can show "3 of 4 have arrived" while the
   * author is still typing, rather than discovering it during a twenty-minute
   * retry — which is §5.3's point about closure versus a timer.
   *
   * RETURNS NULL RATHER THAN THROWING, in two cases that are not errors:
   * nothing was cited, and the conductor does not have
   * `which_entries_resolve_locally` because its happ predates this SDK. The
   * second is why this is caught rather than propagated — closure is a
   * progress indicator, and a client that lost the ability to WRITE because it
   * could not report progress would be strictly worse off than before this
   * existed. Null means unknown; `describeClosure` says so in words.
   *
   * A `true` is not a promise that the commit will succeed. Propagation is not
   * transactional and the answer can change in either direction between this
   * call and the next attempt. */
  async closureOf(cited: readonly Uint8Array[]): Promise<ClosureState | null> {
    if (!cited.length) return null;
    try {
      const resolved = await this.call<boolean[]>('which_entries_resolve_locally', cited);
      if (!Array.isArray(resolved) || resolved.length !== cited.length) return null;
      return {
        cited: cited.length,
        resolvedLocally: resolved.filter(Boolean).length,
        unresolved: cited.filter((_, i) => !resolved[i]),
      };
    } catch {
      return null;
    }
  }

  private async commitWaitingForDeps<T>(fnName: string, payload: unknown, cited: readonly Uint8Array[] = []): Promise<T> {
    const budgetMs = this.cfg.dependencyWaitMs;
    const startedAt = Date.now();
    let attempt = 0;
    let backoffMs = 2_000;
    let lastMissing: string[] = [];
    let closure: ClosureState | null = null;

    for (;;) {
      try {
        return await this.call<T>(fnName, payload);
      } catch (cause) {
        const message = String((cause as any)?.data?.data ?? (cause as any)?.message ?? cause);
        if (!DEPENDENCY_STALL.test(message)) throw cause;

        lastMissing = missingHashesIn(message);
        closure = await this.closureOf(cited);
        const waitedMs = Date.now() - startedAt;
        const remainingMs = budgetMs - waitedMs;
        if (remainingMs <= 0) {
          throw new PendingDependencyError(
            `${fnName} waited ${(budgetMs / 1000).toFixed(0)}s for what it cites and ` +
            `${describeClosure(closure)}. Nothing was written, and the same payload is still ` +
            `valid — this is a propagation timeout, not a rejection.`,
            { missingHashes: lastMissing, waitedMs, attempts: attempt + 1, closure },
          );
        }

        attempt++;
        this.cfg.onPendingDependency({
          fnName, missingHashes: lastMissing, attempt, waitedMs, remainingMs, closure,
        });
        await sleep(Math.min(backoffMs, remainingMs));
        backoffMs = Math.min(backoffMs * 2, 30_000);
      }
    }
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

  /** What an agent has published about what it promises, or `null`.
   *
   * `null` MEANS "nothing published", NOT "unverified". Nothing in this
   * protocol obliges an agent to publish a constitution, so rendering
   * its absence as a deficiency would be scoring agents on a field the
   * protocol never asked them to fill — Invariant #1 through the back
   * door, and the exact failure `mode-and-constitution.mjs` exists to
   * catch in the UI. The zome returns the most recently published one
   * and drops any that has expired. */
  async agentConstitution(agent: Uint8Array): Promise<Constitution | null> {
    return (await this.call<Constitution | null>('get_agent_constitution', agent)) ?? null;
  }

  /** THIS agent's current constitution together with the ActionHash that
   * references it, or `null` if it has published none.
   *
   * WHY IT IS NOT JUST `agentConstitution(me)`. `get_agent_constitution`
   * returns the ENTRY and not its hash, and `create_membrane` needs the
   * hash — so founding a domain was unreachable from this SDK for any
   * agent that had published a constitution and not kept the hash the
   * publish returned. That is the whole reason this exists. It resolves
   * the hash from `get_all_constitutions`, whose Records carry their own.
   *
   * IT DUPLICATES THE COORDINATOR'S SELECTION RULE, WHICH IS A DEFECT
   * GENERATOR, SO IT CHECKS ITSELF INSTEAD OF ASSUMING. The ordering
   * below is `get_agent_constitution`'s: expired entries dropped, then
   * most recent author-supplied `published_at` first — SECONDS, so two
   * publishes inside one second tie — and the tie broken by the
   * host-stamped action timestamp in micros. Having chosen, it compares
   * its pick against what the coordinator actually returns and THROWS if
   * they disagree. A client and a zome silently differing on which
   * constitution is current would mean founding a membrane against one
   * while every reader of the DHT sees the other, and failing loudly is
   * strictly better than that.
   *
   * THE EARLIER CONSTITUTIONS ARE STILL THERE. "Current" is a reading
   * over an append-only set, not a mutation; republishing supersedes
   * which one answers this call and erases nothing. */
  async ownConstitution(): Promise<{ actionHash: Uint8Array; constitution: Constitution } | null> {
    const records = await this.call<any[]>('get_all_constitutions');
    const nowSeconds = nowSecs();
    const mine: { actionHash: Uint8Array; actionMicros: number; constitution: Constitution }[] = [];
    for (const record of records ?? []) {
      const present = record?.entry?.Present;
      if (!present) continue;
      const constitution = decode(present.entry) as Constitution;
      if (!constitution?.agent || !sameBytes(constitution.agent, this.agentPubKey)) continue;
      // KEEP when there is no expiry or it is still in the future — the
      // coordinator's `map_or(true, |exp| exp > now)`, in seconds.
      if (constitution.expires_at !== null && constitution.expires_at !== undefined
          && constitution.expires_at <= nowSeconds) continue;
      mine.push({
        actionHash: record.signed_action.hashed.hash,
        actionMicros: Number(record.signed_action.hashed.content.timestamp ?? 0),
        constitution,
      });
    }
    if (mine.length === 0) return null;
    mine.sort((a, b) =>
      (b.constitution.published_at - a.constitution.published_at) || (b.actionMicros - a.actionMicros));
    const picked = mine[0];

    const authoritative = await this.agentConstitution(this.agentPubKey);
    if (authoritative === null) {
      throw new Error(
        'This client found a live constitution for this agent and get_agent_constitution ' +
        'returned none. Nothing was written. The two read the same DHT, so the likely cause ' +
        'is propagation rather than disagreement — but founding a membrane against a ' +
        'constitution no reader can resolve would produce a membrane nobody can validate, ' +
        'so this refuses instead of guessing.',
      );
    }
    if (constitutionFingerprint(authoritative) !== constitutionFingerprint(picked.constitution)) {
      throw new Error(
        'This client and the coordinator disagree about which of this agent\'s constitutions ' +
        `is current (client published_at=${picked.constitution.published_at}, coordinator ` +
        `published_at=${authoritative.published_at}). Nothing was written. Both apply the same ` +
        'documented rule, so a disagreement means the rule has drifted on one side — most ' +
        'likely the same-second tie-break, since published_at is SECONDS. Pass the ' +
        'constitution hash explicitly to createMembrane rather than letting it be resolved.',
      );
    }
    return { actionHash: picked.actionHash, constitution: picked.constitution };
  }

  /** Does any member actually promise what their membrane requires?
   *
   * WHY THIS IS A CLIENT FUNCTION AND NOT A ZOME ONE. A membrane
   * declares `required_promises` and founding enforces that the list is
   * non-empty and that the founder references their own constitution.
   * JOINING ENFORCES NOTHING: `join_membrane` is unrestricted, and the
   * `AgentToMembrane` validation rule checks only that the tag is a
   * well-formed agent key, that it is the real author's, and that the
   * base is a real membrane. Nothing anywhere looks at the joiner's
   * promises.
   *
   * THAT IS CORRECT RATHER THAN MISSING. Membership is a voluntary
   * promise; a protocol that refused the join would make a membrane an
   * authority over who may speak. So the comparison belongs where every
   * other threshold in this protocol ended up — in the reading, not the
   * record. This function is that reading, it writes nothing, and it
   * gates nothing.
   *
   * MATCHING IS BY ACTION AND DOMAIN, both as written. The required
   * phrases are free text the membrane chose and the promised phrases
   * are free text the agent chose, so this is string equality, scoped to
   * the membrane's own domain; a promise made for a different domain is
   * reported in `promisedElsewhere` rather than accepted. Two honest
   * limits follow directly: it catches "promised nothing" and cannot
   * catch "promised and did not mean it", and a membrane whose required
   * phrases drift from the ones members actually wrote will report
   * everybody missing everything — which is information about the
   * membrane, not about the members. */
  async promiseCompliance(membraneHash: Uint8Array): Promise<MembranePromiseCompliance> {
    const membranes = await this.membranes();
    const key = (u8: Uint8Array) => Buffer.from(u8).toString('base64');
    const wanted = key(membraneHash);
    const found = membranes.find((m) => key(m.entryHash) === wanted);
    if (!found) {
      throw new Error(
        'promiseCompliance: no Membrane with that EntryHash. Pass the ' +
        'membrane\'s ENTRY hash (get_membranes returns records; the entry ' +
        'hash is what get_membrane_members and join_membrane take too).',
      );
    }
    const { domain, required_promises: requiredPromises } = found.entry;

    // join_membrane is idempotent in name only — joining twice writes two
    // AgentToMembrane links — so the member list can repeat an agent.
    // Deduplicated here, in first-seen order, because a member listed
    // twice would otherwise appear twice in the reading.
    const seen = new Set<string>();
    const members: Uint8Array[] = [];
    for (const agent of await this.membraneMembers(membraneHash)) {
      const k = key(agent);
      if (seen.has(k)) continue;
      seen.add(k);
      members.push(agent);
    }

    const standings: MemberPromiseStanding[] = [];
    for (const agent of members) {
      const constitution = await this.agentConstitution(agent);
      const clauses = constitution?.promises ?? [];
      const promised = clauses.filter((p) => p.domain === domain).map((p) => p.action);
      const promisedElsewhere = clauses.filter((p) => p.domain !== domain).map((p) => p.action);
      const missing = requiredPromises.filter((r) => !promised.includes(r));
      const extra = promised.filter((a) => !requiredPromises.includes(a));
      standings.push({
        agent,
        hasConstitution: constitution !== null,
        promised,
        promisedElsewhere,
        missing,
        extra,
        promisesAll: missing.length === 0,
      });
    }
    return { domain, requiredPromises, members: standings };
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
    return this.commitWaitingForDeps<Uint8Array>('create_claim', {
      content: input.content,
      domain: input.domain,
      author: this.agentPubKey,
      timestamp: nowMicros(),
      evidence_hashes: input.evidenceHashes ?? [],
      confidence: input.confidence,
      semantic_tags: input.semanticTags ?? [],
      source_mew: null,
    }, input.evidenceHashes ?? []);
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
    /** What this agent had SEEN of the target's critiques. Omit it and
     * nothing is recorded, which the protocol reads as "recorded
     * nothing" rather than "saw nothing" — see `witnessedCritiquesOf`,
     * which builds a cone that is true by construction. */
    pastCone?: Uint8Array[];
  }): Promise<Uint8Array> {
    const pastCone = input.pastCone ?? [];
    if (pastCone.length > MAX_PAST_CONE) {
      // REFUSED HERE RATHER THAN TRIMMED, because the zome refuses
      // rather than trimming and for its reason: a trimmed cone is a
      // FALSE STATEMENT about what was seen, and silently making one on
      // the caller's behalf is worse than the error.
      throw new Error(
        `past_cone has ${pastCone.length} entries; the protocol's ceiling is ` +
        `${MAX_PAST_CONE} (MAX_PAST_CONE) and create_critique refuses rather ` +
        `than trimming. A target with more critiques than that cannot record a ` +
        `complete cone — state that limit rather than sending a partial cone, ` +
        `which would be a false statement about what you saw.`,
      );
    }
    try {
      return await this.commitWaitingForDeps<Uint8Array>('create_critique', {
        target: input.target,
        target_type: input.targetType ?? 'Claim',
        critique_mode: input.mode,
        content: input.content,
        author: this.agentPubKey,
        timestamp: nowMicros(),
        replication_attempted: input.replicationAttempted ?? false,
        evidence_hashes: input.evidenceHashes ?? [],
        species: null,
        past_cone: pastCone,
      }, [input.target, ...(input.evidenceHashes ?? []), ...pastCone]);
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
    return this.commitWaitingForDeps<Uint8Array>('join_membrane', membraneHash, [membraneHash]);
  }

  // --- Founding ------------------------------------------------------
  //
  // TWO CALLS AND NOT ONE, DELIBERATELY. `createMembrane` takes the
  // ActionHash of a constitution this agent has ALREADY published; it
  // will not publish one for you. That is README §2.6's mechanism, not
  // an ergonomic oversight: founding a domain here was made
  // *accountable* rather than *costly* — no fee, but the founder must
  // have stated their own promises in public first, and must say what
  // the domain demands of anyone else. A convenience that minted the
  // constitution inside the founding call would leave that requirement
  // technically satisfied and substantively empty, since nobody would
  // ever have chosen what they were promising. Both halves are enforced
  // DHT-side by `validate_membrane`, so the cost of collapsing them
  // would be borne entirely by the meaning.

  /** Publish what this agent promises to do, under what conditions.
   *
   * `agent` is NOT a parameter and cannot be one. `validate_constitution`
   * requires the constitution's agent to equal the action author, so a
   * caller-supplied key could only ever be this agent's own or rejected
   * by the DHT. You cannot publish someone else's promises; Promise
   * Theory's first result is that no agent can promise on another's
   * behalf, and this is that result as a type signature.
   *
   * NOTHING OBLIGES AN AGENT TO PUBLISH ONE. An agent with no
   * constitution is not deficient — see `agentConstitution`, where the
   * same asymmetry is spelled out for the read side. The one thing it
   * gates is founding a membrane.
   *
   * `publishedAt` is stamped in SECONDS (SPEC §5.23). Two constitutions
   * published inside the same second carry EQUAL `published_at`, and
   * `get_agent_constitution` then falls back to the host-stamped action
   * timestamp to order them — so a republish-twice-quickly caller gets a
   * well-defined answer, but not one its own field determined. */
  async publishConstitution(input: {
    promises: ConstitutionPromise[];
    conditions?: Condition[];
    /** Seconds, and MUST be > now. Omit for a constitution that does not
     * expire. */
    expiresAt?: number | null;
  }): Promise<Uint8Array> {
    // Pre-checks mirroring validate_constitution, which is the real
    // enforcement layer. These exist only so the caller meets the rule in
    // its own vocabulary rather than as a `Guest(...)` string surfacing
    // from validation — the same reason `critique` pre-reads its budget.
    if (input.promises.length === 0) {
      throw new Error(
        'A constitution must contain at least one promise. An empty constitution is ' +
        'refused by validation rather than treated as "promises nothing", because ' +
        'publishing silence and publishing an empty list are different acts and only ' +
        'one of them is representable.',
      );
    }
    for (const [i, promise] of input.promises.entries()) {
      if (!promise.action || !promise.domain) {
        throw new Error(
          `promises[${i}] needs both an action and a domain, and has ` +
          `${!promise.action ? 'no action' : 'no domain'}. A promise scoped to no domain ` +
          `is unmatchable — see promiseCompliance, which compares required phrases to ` +
          `promised phrases WITHIN a domain.`,
        );
      }
    }
    const publishedAt = nowSecs();
    const expiresAt = input.expiresAt ?? null;
    if (expiresAt !== null && expiresAt <= publishedAt) {
      throw new Error(
        `expires_at (${expiresAt}) must be > published_at (${publishedAt}), and both are ` +
        `SECONDS (SPEC §5.23). An expiry handed over in MICROSECONDS passes this rule and ` +
        `every validation rule — it is ~1e5 times larger than the seconds clock ` +
        `get_agent_constitution compares it against, so the constitution simply never ` +
        `expires. That is the silent direction, which is why this check names the unit.`,
      );
    }
    // THE CENTURY CEILING — THE ONE CHECK NO LAYER BELOW THIS ONE CAN MAKE,
    // and the reason it exists is that the rule above is TRUE IN EITHER UNIT.
    // An expiry handed over in microseconds is ~1e5 times the seconds clock
    // `get_agent_constitution` compares it against, so it is comfortably
    // greater than `published_at`, the coordinator accepts it, validation
    // accepts it, it round-trips intact — and the constitution then never
    // expires while its author believes it does. Nothing DHT-side can object,
    // because read as seconds that number is a legitimate far-future date.
    //
    // A STATED HEURISTIC AND NOT A PROTOCOL RULE, held as one: this refuses
    // on the grounds that no caller means a century, and a caller who means
    // "does not expire" has `expiresAt: null` to say it with. Without this,
    // the message above only DESCRIBED the silent case while accepting it.
    const CENTURY_SECS = 100 * 365 * 24 * 3600;
    if (expiresAt !== null && expiresAt - publishedAt > CENTURY_SECS) {
      throw new Error(
        `expires_at (${expiresAt}) is more than a century after published_at ` +
        `(${publishedAt}), and both are SECONDS (SPEC §5.23). The overwhelmingly likely ` +
        `cause is a value in MICROSECONDS, which passes the expires_at > published_at ` +
        `rule and every validation rule in the DNA — it is ~1e5 times larger than the ` +
        `seconds clock get_agent_constitution compares it against, so the constitution ` +
        `never expires and nothing anywhere says so. This is a stated heuristic rather ` +
        `than a protocol rule; a constitution that genuinely does not expire is spelled ` +
        `expiresAt: null.`,
      );
    }
    return this.commitWaitingForDeps<Uint8Array>('publish_constitution', {
      agent: this.agentPubKey,
      promises: input.promises,
      conditions: input.conditions ?? [],
      published_at: publishedAt,
      expires_at: expiresAt,
    });
  }

  /** Found a domain: a membrane, the promises it requires of anyone who
   * participates, and the founder's own already-published constitution.
   *
   * `constitution` is the ActionHash returned by `publishConstitution`,
   * and must be THIS agent's own — `create_membrane` fetches it and
   * refuses a constitution whose agent is not the creator, as does
   * `validate_membrane` with `must_get_valid_record`. See the block
   * comment above for why this is two calls.
   *
   * CITED, SO A FRESHLY PUBLISHED CONSTITUTION DOES NOT LOSE THE RACE.
   * Founding immediately after publishing is the ordinary path and the
   * one that stalls: both the coordinator's `get` and validation's
   * deterministic fetch can run before the constitution has propagated.
   * Routing through the dependency wait turns that into a wait and a
   * legible `PendingDependencyError`, instead of a rejection the caller
   * would reasonably read as "my constitution is wrong".
   *
   * `requiredPromises` IS NOT A GATE ON JOINING, and nothing makes it
   * one. `join_membrane` is unrestricted by design — a protocol that
   * refused the join would make a membrane an authority over who may
   * speak. The list is what a reader compares members against; see
   * `promiseCompliance`, which performs that comparison and gates
   * nothing. */
  async createMembrane(input: {
    domain: string;
    description: string;
    requiredPromises: string[];
    /** The hash from `publishConstitution`. Must be this agent's own.
     * Omit to have it resolved by `ownConstitution()`, which refuses
     * rather than guesses if it cannot. */
    constitution?: Uint8Array;
    validationRulesHash?: Uint8Array | null;
  }): Promise<Uint8Array> {
    if (!input.domain) {
      throw new Error(
        'A membrane needs a non-empty domain. Enforced by validate_membrane and NOT by ' +
        'create_membrane, so a client skipping this check meets it as a validation ' +
        'rejection rather than a coordinator error.',
      );
    }
    if (input.requiredPromises.length === 0) {
      throw new Error(
        'A membrane must declare at least one required_promise. This is the whole of ' +
        'founding\'s cost (README §2.6): no fee is charged, so what is asked instead is ' +
        'that the domain say what it demands. A membrane requiring nothing is refused ' +
        'by validation, not accepted as an open one.',
      );
    }
    // RESOLVING THE HASH IS NOT THE CONVENIENCE THE BLOCK COMMENT ABOVE
    // REFUSES. Looking up a constitution this agent has ALREADY published
    // leaves README §2.6's requirement fully intact and fully enforced —
    // an agent that has published none gets the error below and founds
    // nothing. What would hollow the requirement out is MINTING one here,
    // which this does not do.
    let constitution = input.constitution;
    if (constitution) {
      requireHashKind(
        constitution, 'ActionHash', 'createMembrane\'s `constitution`',
        'It is the hash publishConstitution RETURNED, which is an action hash — not a ' +
        'claim\'s entry_hash and not your agent key.',
      );
    }
    if (!constitution) {
      const own = await this.ownConstitution();
      if (own === null) {
        throw new Error(
          'Founding a domain requires your own published constitution, and this agent has ' +
          'none. Call publishConstitution first. This is not a formality to be worked ' +
          'around: founding here is accountable rather than costly (README §2.6) — no fee ' +
          'is charged, and what is asked instead is that you state what you promise before ' +
          'you ask anything of anyone else. validate_membrane enforces it DHT-side, so a ' +
          'client skipping this check meets the same refusal one layer down.',
        );
      }
      constitution = own.actionHash;
    }
    return this.commitWaitingForDeps<Uint8Array>('create_membrane', {
      domain: input.domain,
      description: input.description,
      required_promises: input.requiredPromises,
      validation_rules_hash: input.validationRulesHash ?? null,
      creator: this.agentPubKey,
      created_at: nowSecs(),
      constitution,
    }, [constitution]);
  }

  async retract(input: {
    claimEntryHash: Uint8Array;
    reason: string;
    replacementClaim?: Uint8Array | null;
  }): Promise<Uint8Array> {
    return this.commitWaitingForDeps<Uint8Array>('create_retraction', {
      target_claim: input.claimEntryHash,
      reason: input.reason,
      replacement_claim: input.replacementClaim ?? null,
      author: this.agentPubKey,
      timestamp: nowMicros(),
    }, [input.claimEntryHash, ...(input.replacementClaim ? [input.replacementClaim] : [])]);
  }

  // --- Assessment ----------------------------------------------------
  //
  // AN AI AGENT ASSESSING IS NOT A SPECIAL CASE. Assessment is a real
  // entry type with its own validation, and a model publishing one is
  // doing exactly what a human does: stating an attributed position
  // under its own key, which anybody who disputes it can critique. That
  // is the only shape in which a machine judgement belongs here. A
  // canonical score would claim a view from nowhere; an attributed
  // reading is a promise like any other.

  /** Publish an assessment of a target under this agent's own key.
   *
   * `stance` is REQUIRED and has no default, for the same reason
   * `critique`'s `mode` has none: it is the whole content of the act,
   * and an agent that wants to "just assess something" is exactly the
   * caller that should be made to choose. `Abstains` is a real stance,
   * not a null one — an assessor who looked and declined to take a side
   * is saying something different from one who never looked.
   *
   * `confidence` is the assessor's confidence in their OWN assessment.
   * The protocol does not compute it and will not second-guess it. */
  async publishAssessment(input: {
    target: Uint8Array;
    stance: Stance;
    confidence: ConfidenceLevel;
    rationale?: string | null;
    /** What this agent had SEEN of the target's critiques when it
     * assessed. See `witnessedCritiquesOf`. */
    pastCone?: Uint8Array[];
  }): Promise<Uint8Array> {
    const pastCone = input.pastCone ?? [];
    if (pastCone.length > MAX_PAST_CONE) {
      throw new Error(
        `past_cone has ${pastCone.length} entries; the protocol's ceiling is ` +
        `${MAX_PAST_CONE} (MAX_PAST_CONE). Refused rather than trimmed — a ` +
        `trimmed cone is a false statement about what you saw.`,
      );
    }
    const assessment: Assessment = {
      assessor: this.agentPubKey,
      target: input.target,
      stance: input.stance,
      confidence: input.confidence,
      rationale: input.rationale ?? null,
      past_cone: pastCone,
      timestamp: nowMicros(),
    };
    return this.commitWaitingForDeps<Uint8Array>(
      'publish_assessment', assessment, [input.target, ...pastCone],
    );
  }

  /** Every assessment of a target, in the order the protocol returns
   * them. Not tallied, not ranked. Counting stances into a verdict is a
   * caller's judgement to own — `recomputeSettlement` is where that is
   * done ATTRIBUTABLY, against a named policy somebody signed. */
  async assessmentsFor(target: Uint8Array): Promise<Decoded<Assessment>[]> {
    return decodeRecords<Assessment>(
      await this.call<any[]>('get_assessments_for', target),
    );
  }

  /** The critiques of a target, together with a past cone that is TRUE
   * BY CONSTRUCTION — the cone is the action hashes of the critiques
   * this call actually fetched, not a list the caller asserts.
   *
   * WHY THIS EXISTS. An agent populating `past_cone` by hand is
   * asserting what it read, and the honest version of that assertion is
   * tedious to assemble and easy to get subtly wrong in the direction
   * that flatters the author. Validation makes claimed IGNORANCE sticky
   * — each cone member's own cone must be a subset of yours — so
   * UNDER-claiming is the direction the rules bite on, and it is also
   * the direction a careless client drifts in. Reading and recording in
   * one step removes the gap.
   *
   * It does NOT make the claim unfalsifiable: an agent can still pass a
   * cone of its own devising to `critique` or `publishAssessment`. This
   * is the convenient path, deliberately, so that the convenient path
   * is the accurate one. */
  async witnessedCritiquesOf(target: Uint8Array): Promise<{
    critiques: Decoded<Critique>[];
    pastCone: Uint8Array[];
  }> {
    const critiques = await this.critiquesFor(target);
    return { critiques, pastCone: critiques.map((c) => c.actionHash) };
  }

  // --- Settlement ----------------------------------------------------

  /** Publish an aggregator's declared rule for when assessments amount
   * to a settlement.
   *
   * THE POLICY IS SIGNED AND ATTRIBUTED, which is what keeps this from
   * being a canonical verdict. Two aggregators with different policies
   * legitimately reach different states over the same assessments, and
   * that disagreement is the design rather than a defect to resolve. */
  async publishSettlementPolicy(input: {
    name: string;
    minAssessors: number;
    maxDissent: number;
    /** The rule in words, so a critic can dispute the METHOD and not
     * merely the number it produced. */
    statement: string;
  }): Promise<Uint8Array> {
    const policy: SettlementPolicy = {
      author: this.agentPubKey,
      name: input.name,
      min_assessors: input.minAssessors,
      max_dissent: input.maxDissent,
      statement: input.statement,
      // SECONDS, per SPEC.md §5.23 — `published_at` is in the seconds
      // family alongside `created_at`/`expires_at`, NOT with `timestamp`.
      published_at: nowSecs(),
    };
    return this.call<Uint8Array>('publish_settlement_policy', policy);
  }

  /** What state a policy yields over stated inputs, WITHOUT publishing.
   *
   * Call this before `publishSettlementStatus`. Validation recomputes
   * the same thing and refuses a status that does not follow from its
   * cited policy and inputs, so this is the cheap way to find out what
   * you are allowed to say. `unusable_inputs` is worth reading rather
   * than ignoring: a state computed over fewer inputs than were offered
   * is a different fact from one computed over all of them. */
  async recomputeSettlement(input: {
    target: Uint8Array;
    policy: Uint8Array;
    inputs: Uint8Array[];
  }): Promise<RecomputedSettlement> {
    return this.call<RecomputedSettlement>('recompute_settlement', {
      target: input.target,
      policy: input.policy,
      inputs: input.inputs,
    });
  }

  /** Publish a settlement status.
   *
   * `inputs` must NAME the assessments the state was computed over. A
   * status whose inputs are not stated cannot be checked by anyone, and
   * validation recomputes the state from exactly these — a state that
   * does not follow is refused, so there is no way to publish a verdict
   * the cited evidence does not support. */
  async publishSettlementStatus(input: {
    target: Uint8Array;
    policy: Uint8Array;
    inputs: Uint8Array[];
    state: SettlementState;
  }): Promise<Uint8Array> {
    const status: SettlementStatus = {
      aggregator: this.agentPubKey,
      target: input.target,
      policy: input.policy,
      inputs: input.inputs,
      state: input.state,
      timestamp: nowMicros(),
    };
    return this.commitWaitingForDeps<Uint8Array>(
      'publish_settlement_status', status,
      [input.target, input.policy, ...input.inputs],
    );
  }

  // --- Discourse readings --------------------------------------------

  /** Publish an attributed reading of a membrane's discourse health as
   * this agent's own signed, critiquable Claim.
   *
   * WHY THIS DOES NOT BREACH INVARIANT #1, since publishing a number
   * about discourse looks like exactly what the invariant forbids. The
   * objection to a canonical score is that it claims a view from
   * nowhere. An attributed reading claims nothing of the kind: it is one
   * agent's promise, taken through a stated lens, and critiquable by
   * anyone who disputes the method. Two agents reading the SAME membrane
   * through different lenses publish different figures and both stand,
   * with nothing computing which is right.
   *
   * The lens is the caller's and there is NO DEFAULT, deliberately.
   * Passing neither policy is itself a methodological choice — and the
   * most consequential one, since an unfiltered reading counts every
   * critique regardless of attestation or decay — so the method string
   * spells that out rather than staying silent about it.
   *
   * Use `entry_hash` from the result to critique the reading;
   * `action_hash` cannot be a critique target. */
  async publishDiscourseReading(input: {
    membrane: Uint8Array;
    attestationPolicy?: AttestationPolicy | null;
    conductancePolicy?: ConductancePolicy | null;
    /** The READER's confidence in their own reading. A reading taken
     * through a narrow lens over a thin corpus is one its author might
     * honestly call `Tentative`, and the protocol has no business
     * overriding that. */
    confidence: ConfidenceLevel;
  }): Promise<PublishedReading> {
    return this.call<PublishedReading>('publish_discourse_reading', {
      membrane: input.membrane,
      attestation_policy: input.attestationPolicy ?? null,
      conductance_policy: input.conductancePolicy ?? null,
      confidence: input.confidence,
    });
  }

  // --- Pre-registration (commit–reveal) ------------------------------
  //
  // THE PROTOCOL'S CENTRAL MECHANISM, and until 2026-10-28 the one
  // thing an SDK agent could not do: it could publish claims, critique,
  // retract and join a membrane, but it could not commit to a
  // prediction in advance — the half of this protocol that costs
  // something. See SPEC.md §10.16.

  /** Commit to a prediction without disclosing it.
   *
   * THE SALT IS RETURNED, ALWAYS, generated here when you do not supply
   * one. The zome deliberately does not generate salts — a salt it
   * invented would have to be stored in the private entry it protects —
   * but an SDK can generate one and HAND IT BACK without storing it
   * anywhere, which is a different and safe thing. It is returned even
   * when you passed it in, so no code path treats the salt as something
   * it can forget to keep.
   *
   * KEEP IT. Without the salt and the exact prediction text, a reveal
   * cannot be constructed: the salt is unguessable by construction, and
   * a prediction without one is brute-forceable from its hash, which is
   * why it exists. A commitment you cannot reveal before its deadline
   * expires publicly on a chain with no delete. `mySealedPrediction`
   * can read both back from this agent's own chain, which is a recovery
   * path and not a reason to discard them — it works only on the
   * conductor that made the commitment. */
  async preRegister(input: {
    /** The action hash of a claim posed in advance. Validation requires
     * it to PREDATE the commitment: a prediction that can be re-pointed
     * at reveal time is not a prediction. */
    question: Uint8Array;
    prediction: string;
    /** Omit to have a cryptographically random one generated and
     * returned. Supply one only if you have somewhere better to keep
     * it than the caller of this function does. */
    salt?: string;
    /** Microseconds since the epoch. A reveal after this is REFUSED by
     * validation — a late reveal would let an author decide, having
     * seen the outcome, whether a commitment counts. */
    revealDeadline: number;
  }): Promise<{ actionHash: Uint8Array; salt: string }> {
    const salt = input.salt ?? randomSalt();
    const actionHash = await this.commitWaitingForDeps<Uint8Array>('pre_register', {
      question: input.question,
      prediction: input.prediction,
      salt,
      reveal_deadline: input.revealDeadline,
    }, [input.question]);
    return { actionHash, salt };
  }

  /** Disclose a prediction. Validation checks the content against the
   * commitment, that the caller is the committer, and that the deadline
   * has not passed — none of which this client can route around.
   *
   * The prediction must be the EXACT text committed to; a reveal that
   * does not hash to the commitment is refused. If you no longer hold
   * it, try `mySealedPrediction` first. */
  async revealPreRegistration(input: {
    preRegistration: Uint8Array;
    prediction: string;
    salt: string;
  }): Promise<Uint8Array> {
    return this.commitWaitingForDeps<Uint8Array>('reveal_pre_registration', {
      pre_registration: input.preRegistration,
      prediction: input.prediction,
      salt: input.salt,
    }, [input.preRegistration]);
  }

  /** This agent's own sealed prediction and salt, read back from its own
   * source chain.
   *
   * `null` MEANS "NOT ON THIS CHAIN", NOT "LOST" — your own commitment,
   * made on another conductor. This device cannot help, which is
   * different from the commitment being unrecoverable, so do not report
   * it as a failure.
   *
   * IT MEANS ONLY THAT, and the two neighbouring cases THROW rather
   * than returning null: another agent's commitment is refused ("Only
   * the author … may read its sealed content"), and a hash that is not
   * a PreRegistration is refused ("Target is not a PreRegistration").
   * Keeping them distinguishable matters because the action differs —
   * *yours, elsewhere* means go find your note, while *not a
   * commitment* means you passed the wrong hash.
   *
   * Chain-local by nature, not by restriction — a private entry's
   * content has no DHT representation at all, so another agent's sealed
   * prediction is structurally unreachable rather than merely refused.
   * Recovering the values does not excuse a late reveal. */
  async mySealedPrediction(
    preRegistration: Uint8Array,
  ): Promise<SealedPrediction | null> {
    return (await this.call<SealedPrediction | null>(
      'get_my_sealed_prediction', preRegistration,
    )) ?? null;
  }

  /** An agent's commitments as three raw lists: `revealed`, `expired`,
   * `pending`.
   *
   * THIS SDK WILL NOT DIVIDE THEM AND NEITHER SHOULD YOU. The zome
   * refuses to return a score; `expired` exists to DEFLATE a claim of
   * foresight rather than to rank anyone, and a `revealed` list shown
   * without `expired` beside it is the selective revelation this
   * protocol refused to implement at the backend. SPEC.md §10.16 states
   * the no-score rule as a MUST NOT and goes further: a conforming
   * implementation MUST NOT present `revealed` as evidence of foresight
   * at all, because a stock conductor stamps its own timestamps and the
   * deadline's authority does not survive a modified one.
   *
   * Expiry is computed against the READER's clock, since nothing is
   * written when a deadline passes. */
  async foresightRecord(agent?: Uint8Array): Promise<ForesightRecord> {
    return this.call<ForesightRecord>(
      'get_foresight_record', agent ?? this.agentPubKey,
    );
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
