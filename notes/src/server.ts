// ============================================================================
// notes/src/server.ts — HTTP transport over NotesStore. No policy lives here.
//
// WHY THIS SERVICE HOLDS NO HOLOCHAIN CREDENTIALS, and why that is the single
// most important line in the file. The design note's gate — promotion — is
// specified as "explicit, never automatic". A service that could publish to
// the DHT would need a rule saying it must not; a service that CANNOT publish
// needs no such rule. So this process never connects to a conductor, imports
// no Holochain client, and learns about promotions only by being told about
// one after the fact, by the client that performed it under the member's own
// agent key. There is no auto-promotion code path to accidentally enable.
//
// AUTHENTICATION is a bearer token minted at join and scoped to one space.
// This is a soft-layer credential for a soft layer: it says "someone gave you
// this link and you walked through it", not "you are this person". Identity
// with cryptographic weight starts one layer down, where an ActionHash is
// signed by an agent key. Do not build anything on a notes token that would
// be wrong if the person holding it were someone else who had been forwarded
// the link.
//
// CORS is open, deliberately. The browser client is served from a Vite dev
// server, from `vite preview`, from a Launcher-installed webhapp with its own
// origin, and from a practitioner's own file server — four origins, none of
// which this process can know. What it protects is not origin but token: a
// caller from anywhere still needs a member token, and a member token is only
// obtained by following an invite link. Cookies are never used, so there is
// nothing for a hostile page to ride on.
// ============================================================================

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { NotesError, NotesStore } from './store.js';
import {
  capsFromEnv, clientAddress, Limiter, MEMBER_CAPS, RateLimitError, type CapName,
} from './limits.js';

/** How long an /events long-poll waits before answering "nothing yet".
 * Short enough to sit inside every proxy's idle timeout, long enough that an
 * idle space is not a busy-loop. */
const POLL_TIMEOUT_MS = 25_000;
const POLL_TICK_MS = 250;

interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  body: any;
  token: string | null;
  /** Who to charge for the unauthenticated routes. Resolved once per request
   * so a handler cannot accidentally pick a different answer than the one the
   * limiter is keyed on. */
  address: string;
}

function send(
  res: ServerResponse,
  status: number,
  payload: unknown,
  extra: Record<string, string> = {},
): void {
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    // Retry-After is the one header a client should be able to act on without
    // having parsed our JSON, so it has to reach the browser's own fetch.
    'access-control-expose-headers': 'retry-after',
    // A notes server's answers are live state, and a cached member list is
    // worse than a slow one.
    'cache-control': 'no-store',
    ...extra,
  });
  res.end(text);
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    // 1 MB. A note is capped at 40k characters by the store; this is the
    // transport-level backstop so a hostile body is refused before it is
    // parsed rather than after.
    if (size > 1_000_000) throw new NotesError(413, 'body_too_large', 'request body too large');
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new NotesError(400, 'bad_json', 'request body is not valid JSON');
  }
}

function bearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Handler = (ctx: Ctx, params: string[]) => unknown | Promise<unknown>;

interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
}

export interface NotesServerOptions {
  store: NotesStore;
  /** Origin this server believes it is reachable at, used only to render
   * invite links. Wrong here means a link someone cannot follow, so it is
   * explicit rather than guessed from a Host header an intermediary may have
   * rewritten. */
  publicOrigin: string;
  /** Optional so a caller cannot construct a server with no ceilings at all:
   * omitting it builds one from the environment, it does not disable them.
   * Turning a cap off is `EPI_NOTES_CAP_*=off`, which is a thing an operator
   * writes down. */
  limiter?: Limiter;
  /** Whether anything is in front of this process. See `clientAddress`. */
  trustProxy?: boolean;
}

export function buildRoutes(options: NotesServerOptions): Route[] {
  const { store, publicOrigin } = options;
  const limiter = options.limiter ?? new Limiter(capsFromEnv());
  const inviteUrl = (token: string) => `${publicOrigin.replace(/\/$/, '')}/invites/${token}`;

  const withInviteUrl = (invite: { token: string }) => ({ ...invite, url: inviteUrl(invite.token) });

  return [
    {
      method: 'GET', pattern: /^\/health$/,
      handler: () => ({ ok: true, service: 'epistemic-notes', revision: store.currentRevision }),
    },

    // --- Creating and finding spaces -------------------------------------
    {
      method: 'POST', pattern: /^\/spaces$/,
      handler: ({ body, address }) => {
        // The only unauthenticated create in the service, and so the only one
        // that can be charged to nothing but an address.
        limiter.charge('spacesCreate', address);
        const created = store.createSpace(body);
        return { ...created, invite: withInviteUrl(created.invite) };
      },
    },
    {
      method: 'GET', pattern: /^\/directory$/,
      handler: ({ url }) => ({
        entries: store.listDirectory(
          url.searchParams.get('sort') ?? 'recent',
          url.searchParams.get('tag') ?? undefined,
        ),
      }),
    },
    {
      method: 'GET', pattern: /^\/spaces\/([^/]+)$/,
      handler: ({ token }, [spaceId]) => {
        const member = store.requireMemberOf(token, spaceId);
        return { space: store.getSpace(spaceId), me: member };
      },
    },
    {
      method: 'PATCH', pattern: /^\/spaces\/([^/]+)$/,
      handler: ({ token, body }, [spaceId]) => {
        store.requireMemberOf(token, spaceId);
        return { space: store.updateSpace(spaceId, body) };
      },
    },
    {
      method: 'GET', pattern: /^\/spaces\/([^/]+)\/members$/,
      handler: ({ token }, [spaceId]) => {
        store.requireMemberOf(token, spaceId);
        return { members: store.publicMembers(spaceId) };
      },
    },
    {
      method: 'GET', pattern: /^\/spaces\/([^/]+)\/signals$/,
      handler: ({ token }, [spaceId]) => {
        store.requireMemberOf(token, spaceId);
        return { signals: store.signals(spaceId) };
      },
    },
    {
      method: 'POST', pattern: /^\/spaces\/([^/]+)\/leave$/,
      handler: ({ token }, [spaceId]) => {
        const member = store.requireMemberOf(token, spaceId);
        store.leave(member.id);
        return { left: true };
      },
    },
    {
      // Asking somebody else to leave, which until now this service could not
      // do at all — three documents said it could, by "revoking the link or
      // removing the member", and neither half was true: an invite is checked
      // only at join time, and the removeMember those documents named did not
      // exist. See NotesStore#removeMember for who may do this and why.
      //
      // A POST that creates a note rather than a DELETE on the member, because
      // that is what it IS: the room's account of a removal, in the room, for
      // everyone it happened to. It answers with the whole membership as well,
      // so a caller does not have to re-read to find out who is left.
      method: 'POST', pattern: /^\/spaces\/([^/]+)\/removals$/,
      handler: ({ token, body }, [spaceId]) => {
        const member = store.requireMemberOf(token, spaceId);
        // The same ceiling a note costs, because it writes one. Deliberately
        // not a ceiling of its own: a room where removals are cheap and notes
        // are not would be a strange room.
        limiter.charge('notesCreate', member.id);
        const note = store.removeMember(spaceId, member, body?.memberId);
        return { note, members: store.publicMembers(spaceId) };
      },
    },

    // --- Invites ----------------------------------------------------------
    {
      method: 'POST', pattern: /^\/spaces\/([^/]+)\/invites$/,
      handler: ({ token, body }, [spaceId]) => {
        const member = store.requireMemberOf(token, spaceId);
        // The fleet-multiplier route: one member already inside can mint doors
        // for an arbitrary number of others.
        limiter.charge('invitesCreate', member.id);
        const invite = store.createInvite(spaceId, body?.mode ?? 'open', body?.ttlSeconds ?? null);
        return { invite: withInviteUrl(invite) };
      },
    },
    {
      method: 'GET', pattern: /^\/spaces\/([^/]+)\/invites$/,
      handler: ({ token }, [spaceId]) => {
        store.requireMemberOf(token, spaceId);
        return { invites: store.listInvites(spaceId).map(withInviteUrl) };
      },
    },
    {
      method: 'DELETE', pattern: /^\/invites\/([^/]+)$/,
      handler: ({ token }, [inviteToken]) => {
        // Resolve which space the invite belongs to first, so the membership
        // check is against that space rather than against whatever space the
        // caller's token happens to be for.
        const spaceId = store.inviteSpaceId(inviteToken);
        store.requireMemberOf(token, spaceId);
        return { invite: store.revokeInvite(inviteToken) };
      },
    },
    {
      // Public on purpose: holding the link is the credential. See
      // NotesStore#previewInvite.
      method: 'GET', pattern: /^\/invites\/([^/]+)$/,
      handler: (_ctx, [inviteToken]) => ({ preview: store.previewInvite(inviteToken) }),
    },
    {
      method: 'POST', pattern: /^\/invites\/([^/]+)\/join$/,
      handler: ({ body, address }, [inviteToken]) => {
        // Two keys, because there are two different things going wrong. The
        // address cap stops one machine becoming a hundred members; the invite
        // cap bounds what a single leaked link can do no matter how many
        // machines follow it. Charged in that order, and both charged even
        // when the join then fails, because a caller hammering a revoked
        // invite is exactly who these ceilings are for.
        limiter.charge('joinAddress', address);
        limiter.charge('joinInvite', inviteToken);
        return store.joinViaInvite(inviteToken, body);
      },
    },

    // --- Request-to-join --------------------------------------------------
    {
      method: 'GET', pattern: /^\/spaces\/([^/]+)\/requests$/,
      handler: ({ token }, [spaceId]) => {
        store.requireMemberOf(token, spaceId);
        return { requests: store.listRequests(spaceId) };
      },
    },
    {
      method: 'POST', pattern: /^\/requests\/([^/]+)\/decision$/,
      handler: ({ token, body }, [requestId]) => {
        const request = store.getRequest(requestId);
        store.requireMemberOf(token, request.spaceId);
        if (typeof body?.granted !== 'boolean') {
          throw new NotesError(400, 'bad_field', 'granted must be a boolean');
        }
        const decided = store.decideRequest(requestId, body.granted);
        // The token is NOT returned to the deciding member — it belongs to
        // the person who asked, who collects it from GET /requests/:id.
        return { request: decided.request };
      },
    },
    {
      // The requester's own view. The request id is the only thing they hold,
      // and it is unguessable for the same reason an invite token is.
      method: 'GET', pattern: /^\/requests\/([^/]+)$/,
      handler: (_ctx, [requestId]) => store.claimGrantedRequest(requestId),
    },

    // --- Notes ------------------------------------------------------------
    {
      method: 'GET', pattern: /^\/spaces\/([^/]+)\/notes$/,
      handler: ({ token }, [spaceId]) => {
        store.requireMemberOf(token, spaceId);
        return { notes: store.listNotes(spaceId), revision: store.currentRevision };
      },
    },
    {
      method: 'POST', pattern: /^\/spaces\/([^/]+)\/notes$/,
      handler: ({ token, body }, [spaceId]) => {
        const member = store.requireMemberOf(token, spaceId);
        limiter.charge('notesCreate', member.id);
        return { note: store.createNote(spaceId, member.id, body?.text, body?.exemplar === true) };
      },
    },
    {
      method: 'PATCH', pattern: /^\/notes\/([^/]+)$/,
      handler: ({ token, body }, [noteId]) => {
        const note = store.getNote(noteId);
        const member = store.requireMemberOf(token, note.spaceId);
        // Editing shares one ceiling with deleting: both are "changing what is
        // already there", any member may do either to any note, and splitting
        // them would let a loop spend twice the budget doing the same damage.
        limiter.charge('notesEdit', member.id);
        return { note: store.editNote(noteId, body?.text, body?.expectedRev) };
      },
    },
    {
      method: 'DELETE', pattern: /^\/notes\/([^/]+)$/,
      handler: ({ token }, [noteId]) => {
        const note = store.getNote(noteId);
        const member = store.requireMemberOf(token, note.spaceId);
        limiter.charge('notesEdit', member.id);
        store.deleteNote(noteId);
        return { deleted: true };
      },
    },

    // --- The gate, recorded ----------------------------------------------
    {
      // DELIBERATELY UNCAPPED, and the one place in this file where that needs
      // saying. The publish this records already spent the protocol's own
      // friction budget, under the member's agent key, one layer down. A
      // second ceiling here would mean a practitioner with protocol budget
      // remaining could be refused by the soft layer — making the hard layer's
      // limit unpredictable from inside the room, which is exactly the
      // coupling the two-layer design exists to prevent. Recording a promotion
      // is also the least attractive thing to flood: it writes one small entry
      // and asserts nothing this service can verify.
      method: 'POST', pattern: /^\/notes\/([^/]+)\/promotions$/,
      handler: ({ token, body }, [noteId]) => {
        const note = store.getNote(noteId);
        const member = store.requireMemberOf(token, note.spaceId);
        return { promotion: store.recordPromotion(noteId, member.id, body) };
      },
    },

    // --- Asking the room's AI members --------------------------------------
    {
      method: 'POST', pattern: /^\/spaces\/([^/]+)\/assists$/,
      handler: ({ token, body }, [spaceId]) => {
        const member = store.requireMemberOf(token, spaceId);
        // Each question is work somebody else's process is expected to do, and
        // possibly to pay a model for.
        limiter.charge('assistsAsk', member.id);
        return { assist: store.askAssist(spaceId, member.id, body) };
      },
    },
    {
      // `waiting=1` is what an assistant polls; without it this is the room's
      // whole history of questions and answers, which is deliberately visible
      // to every member — an assistant answering privately would be a
      // participant nobody else can check.
      method: 'GET', pattern: /^\/spaces\/([^/]+)\/assists$/,
      handler: ({ token, url }, [spaceId]) => {
        store.requireMemberOf(token, spaceId);
        return { assists: store.listAssists(spaceId, url.searchParams.get('waiting') === '1') };
      },
    },
    {
      method: 'GET', pattern: /^\/assists\/([^/]+)$/,
      handler: ({ token }, [assistId]) => {
        const assist = store.getAssist(assistId);
        store.requireMemberOf(token, assist.spaceId);
        return { assist };
      },
    },
    {
      // Any member may answer, not only an AI one. A person who knows the
      // answer is not less qualified than a program, and gating this on
      // `kind: "ai"` would make the assistant an authority rather than a
      // participant.
      method: 'POST', pattern: /^\/assists\/([^/]+)\/answer$/,
      handler: ({ token, body }, [assistId]) => {
        const assist = store.getAssist(assistId);
        const member = store.requireMemberOf(token, assist.spaceId);
        // First answer wins, so racing to answer costs the racer nothing and a
        // losing race is silent. Charged before the store so a lost race still
        // costs the loser something.
        limiter.charge('assistsAnswer', member.id);
        return { assist: store.answerAssist(assistId, member.id, body) };
      },
    },

    // --- Liveness ---------------------------------------------------------
    {
      // Long-poll. Answers as soon as the store's revision moves past
      // `since`, or after POLL_TIMEOUT_MS with the current revision and no
      // changes. A client that has never polled passes since=0 and gets an
      // immediate snapshot.
      method: 'GET', pattern: /^\/spaces\/([^/]+)\/events$/,
      handler: async ({ req, token, url }, [spaceId]) => {
        const member = store.requireMemberOf(token, spaceId);
        // Concurrency, not rate. This route is MEANT to park for 25 seconds
        // and answer late, so a requests-per-hour ceiling would punish exactly
        // the client that is using it correctly. What is actually scarce is
        // held sockets, so that is what is counted — and released in a finally,
        // because a leaked slot locks a member out until the process restarts.
        const release = limiter.hold(member.id);
        // A client that hangs up must stop counting against its own ceiling
        // AT ONCE, not when this poll would have timed out anyway. Without
        // this, a browser leaving a room holds a slot for up to 25 more
        // seconds: walk in and out of a room four times inside half a minute
        // and the member is locked out of their own room by a limit that
        // exists to bound machines, not people. The client aborts on the way
        // out; this is the half that makes the abort mean something.
        let hungUp = false;
        const noteHangUp = () => { hungUp = true; };
        req.on('close', noteHangUp);
        try {
          const since = Number(url.searchParams.get('since') ?? '0');
          const deadline = Date.now() + POLL_TIMEOUT_MS;
          while (store.currentRevision <= since && Date.now() < deadline && !hungUp) {
            await sleep(POLL_TICK_MS);
          }
          const changed = store.currentRevision > since;
          return {
            revision: store.currentRevision,
            changed,
            // Only send a snapshot when something actually moved; an idle poll
            // should cost as close to nothing as a poll can.
            notes: changed ? store.listNotes(spaceId) : null,
            members: changed ? store.publicMembers(spaceId) : null,
            signals: changed ? store.signals(spaceId) : null,
            assists: changed ? store.listAssists(spaceId, false) : null,
          };
        } finally {
          req.off('close', noteHangUp);
          release();
        }
      },
    },

    // --- Your own budget, and nobody else's -------------------------------
    {
      // Answers for the bearer token in hand and takes no parameter that could
      // name anyone else. That is what keeps a friction meter from becoming a
      // comparison: there is no shape of this call that returns two members,
      // so there is nothing here to sort. It mirrors the protocol layer, where
      // an agent can see its own remaining friction and no one else's.
      //
      // Address-keyed caps are absent on purpose — a member is not an address,
      // and reporting "you have 3 space-creations left" against a token would
      // be answering a question nobody asked with a number that is wrong for
      // anyone sharing a NAT.
      method: 'GET', pattern: /^\/me\/budget$/,
      handler: ({ token }) => {
        const member = store.authenticate(token);
        return { budget: limiter.peek(MEMBER_CAPS as CapName[], member.id) };
      },
    },
  ];
}

export function createNotesServer(options: NotesServerOptions): Server {
  // Resolved once and passed down, so the routes and the sweeper are looking
  // at the same counters. Building one in each place would give a server whose
  // ceilings worked and whose memory never got reclaimed.
  const limiter = options.limiter ?? new Limiter(capsFromEnv());
  const trustProxy = options.trustProxy === true;
  const routes = buildRoutes({ ...options, limiter });

  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, content-type',
        'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'access-control-max-age': '600',
      });
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', 'http://notes.invalid');
    const path = url.pathname.replace(/\/+$/, '') || '/';

    for (const route of routes) {
      if (route.method !== req.method) continue;
      const match = route.pattern.exec(path);
      if (!match) continue;
      try {
        const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);
        const address = clientAddress(req, trustProxy);
        const ctx: Ctx = { req, res, url, body, token: bearer(req), address };
        const payload = await route.handler(ctx, match.slice(1).map(decodeURIComponent));
        send(res, 200, payload);
      } catch (error) {
        if (error instanceof RateLimitError) {
          // The retry hint goes in both places on purpose: the header so an
          // ordinary HTTP client backs off without having been taught this
          // service's JSON, the body so a person reading a failed request in a
          // console can see it without opening the network tab.
          send(
            res, error.status,
            { error: error.code, message: error.message, bucket: error.bucket, retryAfter: error.retryAfter },
            { 'retry-after': String(error.retryAfter) },
          );
        } else if (error instanceof NotesError) {
          send(res, error.status, { error: error.code, message: error.message });
        } else {
          // Deliberately terse to the caller and loud in the log: an
          // unexpected throw here is a bug in this service, not something a
          // client can act on.
          console.error('[notes] unhandled error', error);
          send(res, 500, { error: 'internal', message: 'the notes service failed to handle that' });
        }
      }
      return;
    }
    send(res, 404, { error: 'no_such_route', message: `no route for ${req.method} ${path}` });
  });

  // Without this the counter map grows one entry per distinct address forever
  // — a slow leak whose rate an unauthenticated caller chooses. Unref'd so it
  // never holds the process open, and cleared on close so a harness starting
  // and stopping servers in a loop does not accumulate timers.
  const sweeper = setInterval(() => limiter.sweep(), 5 * 60 * 1000);
  sweeper.unref();
  server.on('close', () => clearInterval(sweeper));

  return server;
}
