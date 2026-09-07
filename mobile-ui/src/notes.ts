// ============================================================================
// mobile-ui/src/notes.ts — client for the shared notes layer (`notes/`).
//
// THE SHAPES BELOW ARE MIRRORED BY HAND, deliberately, exactly as
// `mobile-ui/src/types.ts` mirrors the Rust entry types rather than importing
// them. The notes service is a separate package with its own build, and a
// browser bundle reaching across into `../../notes/src` would make this app's
// build depend on that package's — for types that exist only to describe a
// JSON payload. The HTTP surface is the contract; these interfaces are this
// app's reading of it, and `notes/README.md` is where the contract is written
// down. A field renamed on one side and not the other fails loudly at the one
// screen that reads it, which is the same trade types.ts already takes.
//
// WHAT THIS CLIENT DELIBERATELY CANNOT DO: publish anything to the DHT. It
// talks only to the notes service, which itself holds no Holochain
// credentials. Promotion happens in `notes-ui.ts`, through the app's own
// `HolochainConnection`, under the practitioner's own agent key — and the
// notes service is told about it afterwards via `recordPromotion`. Keeping
// those two clients apart is what makes the gate a deliberate act rather than
// a setting.
// ============================================================================

export type NotesMemberKind = 'human' | 'ai';

export interface NotesMember {
  id: string;
  displayName: string;
  kind: NotesMemberKind;
  offers: string[];
  joinedAt: number;
  lastSeenAt: number;
}

export interface NotesSpace {
  id: string;
  name: string;
  description: string;
  tags: string[];
  listed: boolean;
  createdAt: number;
}

export interface NotesPromotion {
  id: string;
  noteId: string;
  memberId: string;
  excerpt: string;
  kind: 'claim' | 'critique';
  actionHash: string;
  dnaHash: string | null;
  promotedAt: number;
}

export interface Note {
  id: string;
  spaceId: string;
  authorId: string;
  text: string;
  exemplar: boolean;
  createdAt: number;
  updatedAt: number;
  promotions: NotesPromotion[];
}

export interface NotesInvite {
  token: string;
  spaceId: string;
  mode: 'open' | 'request' | 'expiring';
  expiresAt: number | null;
  createdAt: number;
  revokedAt: number | null;
  /** Added by the server from its own configured public origin — the thing a
   * member actually pastes into a chat window. */
  url: string;
}

export interface NotesSignals {
  spaceId: string;
  notesLastDay: number;
  notesLastWeek: number;
  membersActiveToday: number;
  aiMembers: number;
  totalMembers: number;
  lastActivityAt: number | null;
  promotionsAllTime: number;
}

/** A question asked of the room's AI members, and their answer.
 *
 * The answer is a SUGGESTION. Nothing in this client applies one on its own:
 * every field arrives beside a button somebody has to press, and `source`
 * (the answerer's own statement of what produced it — a model id, or fixed
 * keyword rules) is rendered next to it, because "a model said so" and "a
 * keyword table said so" deserve different amounts of trust. */
export interface AssistSuggestion {
  critiqueMode: string | null;
  entryKind: 'claim' | 'critique' | null;
  wording: string | null;
  reason: string | null;
}

export interface Assist {
  id: string;
  spaceId: string;
  askedBy: string;
  noteId: string | null;
  kind: 'critique-mode' | 'draft' | 'general';
  prompt: string;
  createdAt: number;
  answeredAt: number | null;
  answeredBy: string | null;
  answer: string | null;
  suggestion: AssistSuggestion | null;
  source: string | null;
}

export interface DirectoryEntry {
  space: NotesSpace;
  totalMembers: number;
  aiMembers: number;
  lastActivityAt: number | null;
}

export interface InvitePreview {
  space: NotesSpace;
  mode: NotesInvite['mode'];
  expiresAt: number | null;
  examples: string[];
  totalMembers: number;
  aiMembers: number;
  aiOffers: string[];
}

export interface JoinRequest {
  id: string;
  spaceId: string;
  displayName: string;
  kind: NotesMemberKind;
  requestedAt: number;
  decidedAt: number | null;
  granted: boolean | null;
}

/** The two orderings the directory offers, and the only two it will accept.
 *
 * There is no third value to add here. The service refuses anything else with
 * a 400 naming the reason, and this type exists so the refusal is unreachable
 * from this client rather than merely handled by it. */
export type DirectorySort = 'recent' | 'alphabetical';

/** An error carrying the service's own machine-readable code, so a screen can
 * distinguish "that invite expired" from "the server is down" without parsing
 * prose. */
export class NotesRequestError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'NotesRequestError';
  }
}

const ORIGIN_KEY = 'epistemic-mobile-ui:notes-origin';
const MEMBERSHIPS_KEY = 'epistemic-mobile-ui:notes-memberships';

/** Where the notes server is. Unlike the conductor config there is no
 * meaningful default beyond localhost: a notes server is a thing someone runs
 * or is given the address of, and guessing wrong produces a connection error
 * rather than a wrong answer. */
export const DEFAULT_NOTES_ORIGIN = 'http://localhost:8790';

export function loadNotesOrigin(): string {
  try {
    return localStorage.getItem(ORIGIN_KEY) ?? DEFAULT_NOTES_ORIGIN;
  } catch {
    return DEFAULT_NOTES_ORIGIN;
  }
}

export function saveNotesOrigin(origin: string): void {
  try { localStorage.setItem(ORIGIN_KEY, origin); } catch { /* private mode */ }
}

/** What this browser holds for one space: the bearer token minted when it
 * joined, and who it joined as.
 *
 * This is the whole of the soft layer's identity model on the client side,
 * and it is deliberately weak — a token says "someone gave you this link and
 * you walked through it". The strong identity is the agent key one layer
 * down, and it is the key a promotion is signed with. */
export interface Membership {
  spaceId: string;
  token: string;
  memberId: string;
  displayName: string;
  /** Remembered so a space this browser belongs to can be listed by name
   * without a round trip, including while the server is unreachable. */
  spaceName: string;
}

export function loadMemberships(): Membership[] {
  try {
    const raw = localStorage.getItem(MEMBERSHIPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMembership(membership: Membership): void {
  const all = loadMemberships().filter((m) => m.spaceId !== membership.spaceId);
  all.push(membership);
  try { localStorage.setItem(MEMBERSHIPS_KEY, JSON.stringify(all)); } catch { /* private mode */ }
}

export function forgetMembership(spaceId: string): void {
  const all = loadMemberships().filter((m) => m.spaceId !== spaceId);
  try { localStorage.setItem(MEMBERSHIPS_KEY, JSON.stringify(all)); } catch { /* private mode */ }
}

export function membershipFor(spaceId: string): Membership | null {
  return loadMemberships().find((m) => m.spaceId === spaceId) ?? null;
}

/** Accepts either a full invite URL as pasted, or the bare token.
 *
 * Both are real inputs: a link arrives from a chat window with an origin
 * attached, and a token arrives from someone reading it out. Returning null
 * rather than throwing lets the caller say "that doesn't look like an invite"
 * in its own words. */
export function inviteTokenFrom(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const fromUrl = /\/invites\/([A-Za-z0-9_-]+)/.exec(trimmed);
  if (fromUrl) return fromUrl[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(trimmed) ? trimmed : null;
}

export class NotesClient {
  constructor(readonly origin: string) {}

  private async request<T>(
    method: string,
    path: string,
    options: { token?: string | null; body?: unknown } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    let response: Response;
    try {
      response = await fetch(`${this.origin.replace(/\/$/, '')}${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch (error) {
      // A fetch that never reached the server is a different failure from one
      // the server refused, and the screens say so differently.
      throw new NotesRequestError(0, 'unreachable',
        `could not reach the notes server at ${this.origin}: ${error}`);
    }
    let payload: any = null;
    try { payload = await response.json(); } catch { /* some responses carry no body */ }
    if (!response.ok) {
      throw new NotesRequestError(
        response.status,
        payload?.error ?? 'unknown',
        payload?.message ?? `${method} ${path} failed with ${response.status}`,
      );
    }
    return payload as T;
  }

  health(): Promise<{ ok: boolean; service: string; revision: number }> {
    return this.request('GET', '/health');
  }

  createSpace(input: {
    name: string;
    description: string;
    tags: string[];
    listed: boolean;
    creator: { displayName: string; kind?: NotesMemberKind; offers?: string[] };
    examples: string[];
  }): Promise<{ space: NotesSpace; member: NotesMember; token: string; invite: NotesInvite }> {
    return this.request('POST', '/spaces', { body: input });
  }

  directory(sort: DirectorySort, tag?: string): Promise<{ entries: DirectoryEntry[] }> {
    const params = new URLSearchParams({ sort });
    if (tag) params.set('tag', tag);
    return this.request('GET', `/directory?${params}`);
  }

  previewInvite(token: string): Promise<{ preview: InvitePreview }> {
    return this.request('GET', `/invites/${encodeURIComponent(token)}`);
  }

  joinInvite(token: string, input: { displayName: string; kind?: NotesMemberKind }): Promise<
    | { outcome: 'joined'; member: NotesMember; token: string }
    | { outcome: 'requested'; request: JoinRequest }
  > {
    return this.request('POST', `/invites/${encodeURIComponent(token)}/join`, { body: input });
  }

  requestStatus(requestId: string): Promise<{ request: JoinRequest; token: string | null }> {
    return this.request('GET', `/requests/${encodeURIComponent(requestId)}`);
  }

  decideRequest(requestId: string, token: string, granted: boolean): Promise<{ request: JoinRequest }> {
    return this.request('POST', `/requests/${encodeURIComponent(requestId)}/decision`, {
      token, body: { granted },
    });
  }

  pendingRequests(spaceId: string, token: string): Promise<{ requests: JoinRequest[] }> {
    return this.request('GET', `/spaces/${spaceId}/requests`, { token });
  }

  notes(spaceId: string, token: string): Promise<{ notes: Note[]; revision: number }> {
    return this.request('GET', `/spaces/${spaceId}/notes`, { token });
  }

  createNote(spaceId: string, token: string, text: string): Promise<{ note: Note }> {
    return this.request('POST', `/spaces/${spaceId}/notes`, { token, body: { text } });
  }

  editNote(noteId: string, token: string, text: string): Promise<{ note: Note }> {
    return this.request('PATCH', `/notes/${noteId}`, { token, body: { text } });
  }

  deleteNote(noteId: string, token: string): Promise<{ deleted: boolean }> {
    return this.request('DELETE', `/notes/${noteId}`, { token });
  }

  members(spaceId: string, token: string): Promise<{ members: NotesMember[] }> {
    return this.request('GET', `/spaces/${spaceId}/members`, { token });
  }

  signals(spaceId: string, token: string): Promise<{ signals: NotesSignals }> {
    return this.request('GET', `/spaces/${spaceId}/signals`, { token });
  }

  invites(spaceId: string, token: string): Promise<{ invites: NotesInvite[] }> {
    return this.request('GET', `/spaces/${spaceId}/invites`, { token });
  }

  createInvite(
    spaceId: string, token: string, mode: NotesInvite['mode'], ttlSeconds: number | null,
  ): Promise<{ invite: NotesInvite }> {
    return this.request('POST', `/spaces/${spaceId}/invites`, { token, body: { mode, ttlSeconds } });
  }

  updateSpace(
    spaceId: string, token: string, patch: Partial<Pick<NotesSpace, 'name' | 'description' | 'tags' | 'listed'>>,
  ): Promise<{ space: NotesSpace }> {
    return this.request('PATCH', `/spaces/${spaceId}`, { token, body: patch });
  }

  askAssistant(spaceId: string, token: string, body: {
    kind: Assist['kind']; prompt: string; noteId: string | null;
  }): Promise<{ assist: Assist }> {
    return this.request('POST', `/spaces/${spaceId}/assists`, { token, body });
  }

  assist(assistId: string, token: string): Promise<{ assist: Assist }> {
    return this.request('GET', `/assists/${assistId}`, { token });
  }

  assists(spaceId: string, token: string): Promise<{ assists: Assist[] }> {
    return this.request('GET', `/spaces/${spaceId}/assists`, { token });
  }

  /** Records that something crossed the gate. Called only AFTER the publish
   * has succeeded against the practitioner's own conductor — see this file's
   * header, and `notes-ui.ts`'s promotion flow. */
  recordPromotion(noteId: string, token: string, body: {
    kind: 'claim' | 'critique';
    excerpt: string;
    actionHash: string;
    dnaHash: string | null;
  }): Promise<{ promotion: NotesPromotion }> {
    return this.request('POST', `/notes/${noteId}/promotions`, { token, body });
  }
}
