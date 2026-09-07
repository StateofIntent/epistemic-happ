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
}

function send(res: ServerResponse, status: number, payload: unknown): void {
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    // A notes server's answers are live state, and a cached member list is
    // worse than a slow one.
    'cache-control': 'no-store',
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
}

export function buildRoutes(options: NotesServerOptions): Route[] {
  const { store, publicOrigin } = options;
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
      handler: ({ body }) => {
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

    // --- Invites ----------------------------------------------------------
    {
      method: 'POST', pattern: /^\/spaces\/([^/]+)\/invites$/,
      handler: ({ token, body }, [spaceId]) => {
        store.requireMemberOf(token, spaceId);
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
      handler: ({ body }, [inviteToken]) => store.joinViaInvite(inviteToken, body),
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
        return { note: store.createNote(spaceId, member.id, body?.text, body?.exemplar === true) };
      },
    },
    {
      method: 'PATCH', pattern: /^\/notes\/([^/]+)$/,
      handler: ({ token, body }, [noteId]) => {
        const note = store.getNote(noteId);
        store.requireMemberOf(token, note.spaceId);
        return { note: store.editNote(noteId, body?.text) };
      },
    },
    {
      method: 'DELETE', pattern: /^\/notes\/([^/]+)$/,
      handler: ({ token }, [noteId]) => {
        const note = store.getNote(noteId);
        store.requireMemberOf(token, note.spaceId);
        store.deleteNote(noteId);
        return { deleted: true };
      },
    },

    // --- The gate, recorded ----------------------------------------------
    {
      method: 'POST', pattern: /^\/notes\/([^/]+)\/promotions$/,
      handler: ({ token, body }, [noteId]) => {
        const note = store.getNote(noteId);
        const member = store.requireMemberOf(token, note.spaceId);
        return { promotion: store.recordPromotion(noteId, member.id, body) };
      },
    },

    // --- Liveness ---------------------------------------------------------
    {
      // Long-poll. Answers as soon as the store's revision moves past
      // `since`, or after POLL_TIMEOUT_MS with the current revision and no
      // changes. A client that has never polled passes since=0 and gets an
      // immediate snapshot.
      method: 'GET', pattern: /^\/spaces\/([^/]+)\/events$/,
      handler: async ({ token, url }, [spaceId]) => {
        store.requireMemberOf(token, spaceId);
        const since = Number(url.searchParams.get('since') ?? '0');
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        while (store.currentRevision <= since && Date.now() < deadline) {
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
        };
      },
    },
  ];
}

export function createNotesServer(options: NotesServerOptions): Server {
  const routes = buildRoutes(options);

  return createServer(async (req, res) => {
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
        const ctx: Ctx = { req, res, url, body, token: bearer(req) };
        const payload = await route.handler(ctx, match.slice(1).map(decodeURIComponent));
        send(res, 200, payload);
      } catch (error) {
        if (error instanceof NotesError) {
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
}
