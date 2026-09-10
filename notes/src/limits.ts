// ============================================================================
// notes/src/limits.ts — ceilings on what one caller can do, and nothing else.
//
// WHY THIS IS NOT IN store.ts. The store is the model of what a room IS: what
// a space is, who may see it, what the directory may sort by. A ceiling is not
// part of that model — it is a property of the door policy, it varies between
// an operator running a private room for four people and one running a public
// service, and it needs the client's network address, which the store has
// never seen and should not start seeing. So limits live beside the transport
// that has the address, and the store stays a description of the room.
//
// WHY THESE ARE NOT PERSISTED. They live in memory and reset when the process
// does. That is correct for a layer whose default is ephemeral: a server that
// carefully remembered how much you had written last week, across restarts,
// would be keeping a durable record of behaviour in the one place built to
// keep nothing. The cost is that a restart forgives everyone, which is a
// cheaper failure than the alternative.
//
// WHY FIXED WINDOWS RATHER THAN TOKEN BUCKETS. A refusal here has to say when
// it lifts, and "60 per hour, this window resets in 12 minutes" is a sentence
// a person and a retry loop can both act on. A leaky bucket's answer to the
// same question is a rate, which is true and useless.
//
// WHAT IS DELIBERATELY NOT CAPPED. Reads, because a room that will not answer
// is not a room. And promotions, because the publish a promotion records has
// already spent the protocol's own friction budget one layer down — charging
// again here would make the hard layer's limit unpredictable from inside the
// soft one, which is exactly the coupling the two-layer design avoids.
// ============================================================================

import type { IncomingMessage } from 'node:http';
import { NotesError } from './store.js';

/** A ceiling on one named action, for one caller, inside one window.
 *
 * `noun` is not decoration: it is what the 429 says the caller ran out of, and
 * an error that names the wrong thing sends someone to fix the wrong call. */
export interface Cap {
  bucket: string;
  limit: number;
  windowMs: number;
  noun: string;
}

/** A NotesError that also knows when it stops being true.
 *
 * Separate from the base class so server.ts can set `Retry-After` on exactly
 * these and nothing else — a 400 with a retry hint would be a lie, and a 429
 * without one makes every client invent its own backoff. */
export class RateLimitError extends NotesError {
  constructor(message: string, readonly retryAfter: number, readonly bucket: string) {
    super(429, 'rate_limited', message);
    this.name = 'RateLimitError';
  }
}

const HOUR_MS = 60 * 60 * 1000;

/** The defaults. Every one of these is overridable per deployment; see
 * `capsFromEnv`. The numbers are chosen to be invisible to a person using the
 * room as a room, and a real ceiling for a loop. */
export const DEFAULT_CAPS = {
  /** The only unauthenticated create in the service. Anyone who can reach the
   * port can make rooms, so this is the one cap that stands between a public
   * notes server and an unbounded write endpoint. */
  spacesCreate: { bucket: 'spaces.create', limit: 5, windowMs: HOUR_MS, noun: 'spaces created' },
  /** One machine should not be able to become a hundred members. */
  joinAddress: { bucket: 'join.address', limit: 10, windowMs: HOUR_MS, noun: 'joins from this address' },
  /** Bounds one invite's blast radius independently of who is walking through
   * it, so a link that leaks is a bounded problem rather than the server's. */
  joinInvite: { bucket: 'join.invite', limit: 60, windowMs: HOUR_MS, noun: 'joins through this invite' },
  notesCreate: { bucket: 'notes.create', limit: 60, windowMs: HOUR_MS, noun: 'notes written' },
  /** Higher than writing, because any member may rewrite or delete any note
   * and correcting other people's half-thoughts is the point of the room. */
  notesEdit: { bucket: 'notes.edit', limit: 120, windowMs: HOUR_MS, noun: 'note edits' },
  /** A member already inside can mint doors for everyone else. This is the
   * route that turns one participant into an arbitrary number of them. */
  invitesCreate: { bucket: 'invites.create', limit: 20, windowMs: HOUR_MS, noun: 'invites minted' },
  /** Each question is work somebody else's process is expected to do. */
  assistsAsk: { bucket: 'assists.ask', limit: 30, windowMs: HOUR_MS, noun: 'questions asked' },
  /** First answer wins, so racing to answer costs the racer nothing. */
  assistsAnswer: { bucket: 'assists.answer', limit: 60, windowMs: HOUR_MS, noun: 'answers posted' },
} as const satisfies Record<string, Cap>;

export type CapName = keyof typeof DEFAULT_CAPS;

/** Concurrent parked long-polls per member.
 *
 * A RATE limit on /events would be wrong: that route is meant to park for 25
 * seconds and answer late, so counting requests-per-hour there penalises
 * exactly the well-behaved client. What is actually scarce is held sockets,
 * so that is what is counted. Four is a browser tab, a second tab, an agent,
 * and room to spare. */
export const DEFAULT_PARKED_POLLS = 4;

/** The caps a member can see for themselves, in the order a person reads
 * them. Address-keyed caps are absent on purpose: `/me/budget` answers for a
 * member token, and a member is not an address. */
export const MEMBER_CAPS: CapName[] = [
  'notesCreate', 'notesEdit', 'invitesCreate', 'assistsAsk', 'assistsAnswer',
];

export interface BudgetLine {
  bucket: string;
  used: number;
  limit: number;
  /** Epoch ms at which this window rolls over. Null when nothing has been
   * charged yet, because there is no window open to end. */
  resetsAt: number | null;
}

interface Window {
  count: number;
  startedAt: number;
}

function humanDuration(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

/** Fixed-window counters keyed by `bucket|key`, plus a concurrency counter for
 * parked polls. Deliberately one small class: the whole point of putting this
 * beside the transport is that it stays small enough to read in one sitting. */
export class Limiter {
  private windows = new Map<string, Window>();
  private held = new Map<string, number>();

  constructor(
    readonly caps: Record<CapName, Cap>,
    readonly parkedPolls: number = DEFAULT_PARKED_POLLS,
  ) {}

  private static slot(bucket: string, key: string): string {
    return `${bucket}|${key}`;
  }

  /** Charges one unit, or throws. Call BEFORE the store mutates: a caller who
   * is refused must not have changed anything. */
  charge(name: CapName, key: string, now: number = Date.now()): void {
    const cap = this.caps[name];
    // limit <= 0 is how an operator turns a cap off entirely (EPI_NOTES_CAP_*
    // set to `off`). Treated as "no ceiling", never as "refuse everything" —
    // a config typo should not silently close the room.
    if (cap.limit <= 0) return;

    const slot = Limiter.slot(cap.bucket, key);
    const open = this.windows.get(slot);
    if (open === undefined || now - open.startedAt >= cap.windowMs) {
      this.windows.set(slot, { count: 1, startedAt: now });
      return;
    }
    if (open.count >= cap.limit) {
      const remaining = open.startedAt + cap.windowMs - now;
      throw new RateLimitError(
        `${cap.limit} ${cap.noun} per ${humanDuration(cap.windowMs)} is the ceiling here, and this `
        + `window is full. It resets in ${humanDuration(remaining)}. This is the notes layer's own `
        + `friction and is unrelated to the protocol's — nothing you do above the gate spends what `
        + `you have below it.`,
        Math.max(1, Math.ceil(remaining / 1000)),
        cap.bucket,
      );
    }
    open.count += 1;
  }

  /** What `GET /me/budget` reports. Never charges, and takes one key: there is
   * no shape of this call that answers for somebody else, which is what keeps
   * a budget from becoming a comparison. */
  peek(names: CapName[], key: string, now: number = Date.now()): BudgetLine[] {
    return names.map((name) => {
      const cap = this.caps[name];
      const open = this.windows.get(Limiter.slot(cap.bucket, key));
      const live = open !== undefined && now - open.startedAt < cap.windowMs;
      return {
        bucket: cap.bucket,
        used: live ? open!.count : 0,
        limit: cap.limit,
        resetsAt: live ? open!.startedAt + cap.windowMs : null,
      };
    });
  }

  /** Takes one concurrency slot, returning the release. The caller MUST
   * release in a finally: a leaked slot is a member who can never poll again
   * until the process restarts. */
  hold(key: string): () => void {
    if (this.parkedPolls > 0) {
      const current = this.held.get(key) ?? 0;
      if (current >= this.parkedPolls) {
        throw new RateLimitError(
          `${this.parkedPolls} live connections to this room at once is the ceiling, and you already `
          + `have that many open. They are long-polls: each one ends by itself within half a minute, `
          + `so this clears without anything being retried.`,
          30,
          'events.parked',
        );
      }
      this.held.set(key, current + 1);
    }
    let released = false;
    return () => {
      if (released || this.parkedPolls <= 0) return;
      released = true;
      const current = this.held.get(key) ?? 1;
      if (current <= 1) this.held.delete(key);
      else this.held.set(key, current - 1);
    };
  }

  /** Drops windows that have already rolled over. Without this the map grows
   * one entry per distinct address forever, which on a public server is a slow
   * leak with an attacker-chosen rate. */
  sweep(now: number = Date.now()): void {
    const longest = Math.max(...Object.values(this.caps).map((cap) => cap.windowMs));
    for (const [slot, window] of this.windows) {
      if (now - window.startedAt >= longest) this.windows.delete(slot);
    }
  }

  /** Test seam. Nothing in the service calls this. */
  get openWindows(): number {
    return this.windows.size;
  }
}

/** `EPI_NOTES_CAP_NOTES_CREATE=120/3600` — count per window-seconds — or `off`.
 *
 * Per-cap rather than a single global dial because the deployments differ in
 * kind, not in degree: a private room for four people wants no ceilings at
 * all, a public directory wants tight ones on the unauthenticated routes and
 * loose ones inside a room. One number cannot express both. */
export function capsFromEnv(env: NodeJS.ProcessEnv = process.env): Record<CapName, Cap> {
  const out = {} as Record<CapName, Cap>;
  for (const [name, cap] of Object.entries(DEFAULT_CAPS) as [CapName, Cap][]) {
    const varName = `EPI_NOTES_CAP_${cap.bucket.replace(/\./g, '_').toUpperCase()}`;
    const raw = (env[varName] ?? '').trim();
    if (raw === '') { out[name] = { ...cap }; continue; }
    if (raw.toLowerCase() === 'off') { out[name] = { ...cap, limit: 0 }; continue; }
    const match = /^(\d+)\/(\d+)$/.exec(raw);
    if (!match) {
      // Loud, at startup, rather than a silent fall back to a default the
      // operator does not know they are running.
      throw new Error(
        `${varName}=${raw} is not a cap. Write it as count/seconds, for example 120/3600, or "off".`,
      );
    }
    out[name] = { ...cap, limit: Number(match[1]), windowMs: Number(match[2]) * 1000 };
  }
  return out;
}

/** Which address to charge.
 *
 * X-Forwarded-For is read ONLY when an operator has said something is in front
 * of this process. Honouring it unconditionally would make every address-keyed
 * ceiling in this file spoofable by one header, which is worse than having no
 * ceiling at all: it looks like a defence and is not one. */
export function clientAddress(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const header = req.headers['x-forwarded-for'];
    const first = (Array.isArray(header) ? header[0] : header)?.split(',')[0]?.trim();
    if (first) return normaliseAddress(first);
  }
  return normaliseAddress(req.socket.remoteAddress);
}

/** One machine reaching this service is ONE key, whichever way it connects.
 *
 * A ceiling keyed on `socket.remoteAddress` verbatim is keyed on the address
 * FAMILY as much as on the caller. A dual-stack client that connects over IPv6
 * is `::1` and over IPv4 is `127.0.0.1` — two keys, two budgets, for one
 * machine — and a client on a dual-stack listener arrives as `::ffff:1.2.3.4`
 * rather than `1.2.3.4`, so the same caller changes key when the LISTENER
 * changes. Neither is a different caller in any sense a ceiling means.
 *
 * That is the smaller cousin of the failure `clientAddress` above exists to
 * prevent: a ceiling present in the code, readable as a defence, and openable
 * by a caller who does nothing cleverer than connect the other way.
 *
 * FOUND THROUGH THE HARNESS THAT KEPT FLAKING ON IT. `notes-layer`'s
 * X-Forwarded-For check failed twice on CI, months apart, and was recorded as
 * open and uncaused — it asks a 1-per-hour ceiling to refuse the SECOND create,
 * so a single call landing on the other family makes it the first call again
 * and the refusal never comes. The harness reached `http://localhost`, and
 * Node's fetch picks a family per connection. Proved by hand: two creates over
 * 127.0.0.1 give 200 then 429, and a third over [::1] gives 200.
 *
 * WHAT THIS DOES NOT DO, and it is a real limit rather than an oversight: a
 * caller with a whole IPv6 /64 to itself still has as many keys as it has
 * addresses. Bucketing IPv6 by prefix is the standard answer and is a decision
 * about what an "address" means here, not a detail to settle inside a
 * normalisation function — see notes/README.md. */
export function normaliseAddress(raw: string | undefined): string {
  if (!raw) return 'unknown';
  // An IPv4 client on a dual-stack listener, wearing an IPv6 costume.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(raw);
  const address = mapped ? mapped[1] : raw;
  // The same machine reaching itself, by the other family.
  return address === '::1' ? '127.0.0.1' : address;
}
