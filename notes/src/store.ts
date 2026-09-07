// ============================================================================
// notes/src/store.ts — the rules of the soft layer, with no HTTP in sight.
//
// Everything that decides what the notes layer IS lives here: what a space
// is, who may see it, how an invite behaves, what the directory is allowed to
// sort by, and what an activity signal may say. server.ts is a transport over
// this and holds no policy of its own, so the interesting properties can be
// exercised directly — and, more to the point, so that "the directory refuses
// to rank" is a property of the data model rather than of one route handler
// somebody could add a second copy of.
//
// STATE IS A SINGLE JSON DOCUMENT, written atomically. This is the "cheapest
// first" storage option the design note asks for, one rung up from
// local-only: a conventional collaborative store, deliberately conventional.
// It is not a CRDT, it is not eventually consistent, and it is not trying to
// be the DHT. The DHT is one directory down and one gate below; the soft
// layer's job is to be easy, and a JSON file behind a single process is easy.
//
// NOTHING HERE IS PERMANENT — deletion really deletes. That is not a missing
// feature relative to the protocol, it is the difference between the layers
// stated in code. Below the gate, `RegisterDelete` is refused for every entry
// type and history is inviolable. Above it, you may throw away a bad note and
// nobody can retrieve it. A person who cannot delete a half-thought will not
// write half-thoughts, and half-thoughts are the entire point of this layer.
// ============================================================================

import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  Assist, AssistKind, AssistSuggestion, DirectoryEntry, DirectorySort, Invite, InviteMode,
  InvitePreview, JoinRequest, Member, MemberKind, Note, Promotion, PublicMember, Space,
  SpaceSignals,
} from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** An error with an HTTP status already decided, so server.ts can stay a
 * transport. `code` is a stable string for clients and harnesses to match on;
 * `message` is for the person reading it. */
export class NotesError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'NotesError';
  }
}

/** Orderings the directory will serve. Anything else is refused loudly.
 *
 * The refusal matters more than the allow-list. A "most active" or "top
 * spaces" ordering is the single easiest way to rebuild the attention economy
 * inside a system built to avoid it, and it arrives disguised as a
 * convenience — every field the directory legitimately shows (participant
 * count, note counts, recency of activity) is one `sort=` away from being a
 * leaderboard. So the parameter is validated against this list and an
 * unrecognised value gets a 400 that says why, rather than silently falling
 * back to a default and leaving the caller believing they got what they
 * asked for. */
const DIRECTORY_SORTS: DirectorySort[] = ['recent', 'alphabetical'];

interface StoredMember extends Member {
  /** Bearer token. Returned exactly once, at join, and never included in any
   * member listing — see `publicMember`. */
  token: string;
}

interface State {
  version: 1;
  spaces: Record<string, Space>;
  members: Record<string, StoredMember>;
  invites: Record<string, Invite>;
  requests: Record<string, JoinRequest>;
  notes: Record<string, Note>;
  /** Optional so a state file written before assists existed still loads —
   * this layer is ephemeral by default, but someone running with a state file
   * should not lose their notes to a version bump. */
  assists?: Record<string, Assist>;
}

function emptyState(): State {
  return { version: 1, spaces: {}, members: {}, invites: {}, requests: {}, notes: {}, assists: {} };
}

function id(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString('base64url')}`;
}

/** Invite tokens and member tokens are both unguessable secrets, and an
 * invite token is a capability someone will paste into a chat window. 32
 * bytes, base64url, no ambiguity about which characters survive a copy. */
function secret(): string {
  return randomBytes(32).toString('base64url');
}

function trimmed(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw new NotesError(400, 'bad_field', `${field} must be a string`);
  const out = value.trim();
  if (!out) throw new NotesError(400, 'bad_field', `${field} must not be empty`);
  if (out.length > max) {
    throw new NotesError(400, 'bad_field', `${field} must be at most ${max} characters`);
  }
  return out;
}

function stringList(value: unknown, field: string, maxItems: number, maxLen: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new NotesError(400, 'bad_field', `${field} must be an array`);
  if (value.length > maxItems) {
    throw new NotesError(400, 'bad_field', `${field} must have at most ${maxItems} entries`);
  }
  return value.map((item, i) => trimmed(item, `${field}[${i}]`, maxLen));
}

function memberKind(value: unknown): MemberKind {
  if (value === 'human' || value === 'ai') return value;
  throw new NotesError(400, 'bad_field', `kind must be "human" or "ai"`);
}

export interface CreateSpaceInput {
  name: string;
  description: string;
  tags?: string[];
  listed?: boolean;
  creator: { displayName: string; kind?: MemberKind; offers?: string[] };
  /** Two or three notes showing the tone. The design asks for these at
   * creation time rather than as a later nicety, because an empty room and a
   * room with three example notes recruit differently. */
  examples?: string[];
}

export interface JoinInput {
  displayName: string;
  kind?: MemberKind;
  offers?: string[];
}

/** What a join attempt produced: either membership (with the one-time token)
 * or a filed request awaiting a decision. */
export type JoinOutcome =
  | { outcome: 'joined'; member: Member; token: string }
  | { outcome: 'requested'; request: JoinRequest };

export class NotesStore {
  private state: State;
  private readonly path: string | null;
  /** Bumped on every mutation. Clients long-poll on it (see server.ts's
   * /events) rather than this service holding sockets open per note. */
  private revision = 0;

  private constructor(state: State, path: string | null) {
    this.state = state;
    this.path = path;
  }

  /** `path === null` is the ephemeral mode used by tests and by anyone who
   * wants a room that provably cannot outlive the process. */
  static open(path: string | null): NotesStore {
    if (path === null) return new NotesStore(emptyState(), null);
    if (path.trim() === '') {
      // Never silently treat this as ephemeral: a caller that passed an empty
      // string meant to pass something, and a store that quietly forgets
      // everything is a worse answer than one that refuses to start. main.ts
      // normalises an empty EPI_NOTES_STATE to null before reaching here, so
      // this catches a programmatic caller rather than an env var.
      throw new Error('notes state path is an empty string — pass null for an ephemeral store');
    }
    if (!existsSync(path)) {
      mkdirSync(dirname(path), { recursive: true });
      return new NotesStore(emptyState(), path);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      // Refusing to start beats silently starting empty on top of a file
      // somebody's notes are in: an empty state would be persisted over it on
      // the very first write.
      throw new Error(`notes state at ${path} is not readable JSON: ${error}`);
    }
    const state = parsed as State;
    if (state?.version !== 1) throw new Error(`notes state at ${path} has unknown version`);
    return new NotesStore(state, path);
  }

  get currentRevision(): number { return this.revision; }

  private touched(): void {
    this.revision++;
    if (this.path === null) return;
    // Write-then-rename: a crash mid-write leaves the previous good file
    // rather than a truncated one. Cheap enough at this size to do on every
    // mutation, and the alternative (debouncing) buys nothing here and loses
    // notes on a kill -9.
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state), 'utf8');
    renameSync(tmp, this.path);
  }

  // --- Spaces ------------------------------------------------------------

  createSpace(input: CreateSpaceInput): { space: Space; member: Member; token: string; invite: Invite } {
    const now = Date.now();
    const space: Space = {
      id: id('spc'),
      name: trimmed(input.name, 'name', 120),
      description: trimmed(input.description, 'description', 2000),
      tags: stringList(input.tags, 'tags', 12, 40).map((t) => t.toLowerCase()),
      listed: input.listed === true,
      createdAt: now,
    };
    this.state.spaces[space.id] = space;

    const { member, token } = this.addMember(space.id, {
      displayName: input.creator?.displayName,
      kind: input.creator?.kind,
      offers: input.creator?.offers,
    });

    for (const text of stringList(input.examples, 'examples', 5, 4000)) {
      this.insertNote(space.id, member.id, text, true);
    }

    // Every space has an invite link from the moment it exists. The design is
    // explicit that this is the one discovery mechanism that must work on day
    // one, and a space you have to remember to make shareable is a space
    // nobody shares.
    const invite = this.createInvite(space.id, 'open', null);
    this.touched();
    return { space, member, token, invite };
  }

  getSpace(spaceId: string): Space {
    const space = this.state.spaces[spaceId];
    if (!space) throw new NotesError(404, 'no_such_space', `no space ${spaceId}`);
    return space;
  }

  /** Updating the space's own self-description, including whether it is
   * listed. Any member may do this: a notes space is a shared notebook, not
   * a hierarchy, and there are no roles in this layer beyond "member". */
  updateSpace(spaceId: string, patch: Partial<Pick<Space, 'name' | 'description' | 'tags' | 'listed'>>): Space {
    const space = this.getSpace(spaceId);
    if (patch.name !== undefined) space.name = trimmed(patch.name, 'name', 120);
    if (patch.description !== undefined) space.description = trimmed(patch.description, 'description', 2000);
    if (patch.tags !== undefined) space.tags = stringList(patch.tags, 'tags', 12, 40).map((t) => t.toLowerCase());
    if (patch.listed !== undefined) {
      if (typeof patch.listed !== 'boolean') throw new NotesError(400, 'bad_field', 'listed must be a boolean');
      space.listed = patch.listed;
    }
    this.touched();
    return space;
  }

  // --- The directory -----------------------------------------------------

  /** Listed spaces only, ordered by a fact rather than by an endorsement.
   *
   * `sort` is validated against DIRECTORY_SORTS above; see the comment there
   * for why an unknown value is an error rather than a fallback. */
  listDirectory(sort: string = 'recent', tag?: string): DirectoryEntry[] {
    if (!DIRECTORY_SORTS.includes(sort as DirectorySort)) {
      throw new NotesError(
        400, 'unsupported_sort',
        `sort must be one of ${DIRECTORY_SORTS.join(', ')}. This directory deliberately ` +
        `offers no popularity, activity-volume or "top spaces" ordering: those are a ` +
        `leaderboard, and a leaderboard over rooms is the thing this layer sits above a ` +
        `protocol specifically built to avoid.`,
      );
    }
    const wanted = tag?.trim().toLowerCase();
    const rows: DirectoryEntry[] = [];
    for (const space of Object.values(this.state.spaces)) {
      if (!space.listed) continue;
      if (wanted && !space.tags.includes(wanted)) continue;
      const members = this.membersOf(space.id);
      rows.push({
        space,
        totalMembers: members.length,
        aiMembers: members.filter((m) => m.kind === 'ai').length,
        lastActivityAt: this.lastActivityAt(space.id),
      });
    }
    if (sort === 'alphabetical') {
      rows.sort((a, b) => a.space.name.localeCompare(b.space.name));
    } else {
      // Recency, with creation time standing in for a space where nothing has
      // happened yet — a brand-new room is recent news, and burying it under
      // rooms with one old note would make the cold-start problem worse.
      rows.sort((a, b) =>
        (b.lastActivityAt ?? b.space.createdAt) - (a.lastActivityAt ?? a.space.createdAt));
    }
    return rows;
  }

  // --- Invites -----------------------------------------------------------

  createInvite(spaceId: string, mode: InviteMode, ttlSeconds: number | null): Invite {
    this.getSpace(spaceId);
    if (mode !== 'open' && mode !== 'request' && mode !== 'expiring') {
      throw new NotesError(400, 'bad_field', 'mode must be "open", "request" or "expiring"');
    }
    if (mode === 'expiring' && (typeof ttlSeconds !== 'number' || !(ttlSeconds > 0))) {
      throw new NotesError(400, 'bad_field', 'an expiring invite needs a positive ttlSeconds');
    }
    const now = Date.now();
    const invite: Invite = {
      token: secret(),
      spaceId,
      mode,
      expiresAt: mode === 'expiring' ? now + (ttlSeconds as number) * 1000 : null,
      createdAt: now,
      revokedAt: null,
    };
    this.state.invites[invite.token] = invite;
    this.touched();
    return invite;
  }

  revokeInvite(token: string): Invite {
    const invite = this.state.invites[token];
    if (!invite) throw new NotesError(404, 'no_such_invite', 'no such invite');
    invite.revokedAt ??= Date.now();
    this.touched();
    return invite;
  }

  /** Which space an invite belongs to, WITHOUT the usability check — a
   * revoked or expired invite still belongs to a space, and revoking one
   * twice should not turn into a 410 about the very state you asked for. */
  inviteSpaceId(token: string): string {
    const invite = this.state.invites[token];
    if (!invite) throw new NotesError(404, 'no_such_invite', 'no such invite');
    return invite.spaceId;
  }

  listInvites(spaceId: string): Invite[] {
    return Object.values(this.state.invites).filter((i) => i.spaceId === spaceId);
  }

  /** Resolves an invite, refusing a revoked or expired one. Separated from
   * `previewInvite` and `joinViaInvite` so both share one definition of
   * "usable" — an invite that previews fine and then refuses the join would
   * be a small cruelty. */
  private usableInvite(token: string): Invite {
    const invite = this.state.invites[token];
    if (!invite) throw new NotesError(404, 'no_such_invite', 'no such invite');
    if (invite.revokedAt !== null) throw new NotesError(410, 'invite_revoked', 'this invite has been revoked');
    if (invite.expiresAt !== null && Date.now() > invite.expiresAt) {
      throw new NotesError(410, 'invite_expired', 'this invite has expired');
    }
    return invite;
  }

  /** What a newcomer sees before deciding. Unauthenticated by design: holding
   * the link IS the credential, and requiring membership to see what you are
   * being invited into would defeat the mechanism. */
  previewInvite(token: string): InvitePreview {
    const invite = this.usableInvite(token);
    const space = this.getSpace(invite.spaceId);
    const members = this.membersOf(space.id);
    const examples = Object.values(this.state.notes)
      .filter((n) => n.spaceId === space.id && n.exemplar)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((n) => n.text);
    const aiOffers = [...new Set(members.filter((m) => m.kind === 'ai').flatMap((m) => m.offers))];
    return {
      space,
      mode: invite.mode,
      expiresAt: invite.expiresAt,
      examples,
      totalMembers: members.length,
      aiMembers: members.filter((m) => m.kind === 'ai').length,
      aiOffers,
    };
  }

  joinViaInvite(token: string, input: JoinInput): JoinOutcome {
    const invite = this.usableInvite(token);
    if (invite.mode === 'request') {
      const request: JoinRequest = {
        id: id('req'),
        spaceId: invite.spaceId,
        inviteToken: token,
        displayName: trimmed(input.displayName, 'displayName', 80),
        kind: input.kind === undefined ? 'human' : memberKind(input.kind),
        offers: stringList(input.offers, 'offers', 8, 60),
        requestedAt: Date.now(),
        decidedAt: null,
        granted: null,
        memberId: null,
      };
      this.state.requests[request.id] = request;
      this.touched();
      return { outcome: 'requested', request };
    }
    const { member, token: memberToken } = this.addMember(invite.spaceId, input);
    this.touched();
    return { outcome: 'joined', member, token: memberToken };
  }

  listRequests(spaceId: string): JoinRequest[] {
    return Object.values(this.state.requests)
      .filter((r) => r.spaceId === spaceId)
      .sort((a, b) => a.requestedAt - b.requestedAt);
  }

  getRequest(requestId: string): JoinRequest {
    const request = this.state.requests[requestId];
    if (!request) throw new NotesError(404, 'no_such_request', 'no such join request');
    return request;
  }

  /** A decision by an existing member. Granting mints the membership then and
   * there; the requester collects their token by polling the request id they
   * were handed when they asked, which is the only thing they hold. */
  decideRequest(requestId: string, granted: boolean): { request: JoinRequest; token: string | null } {
    const request = this.getRequest(requestId);
    if (request.decidedAt !== null) {
      throw new NotesError(409, 'already_decided', 'this request has already been decided');
    }
    request.decidedAt = Date.now();
    request.granted = granted;
    if (!granted) {
      this.touched();
      return { request, token: null };
    }
    const { member, token } = this.addMember(request.spaceId, {
      displayName: request.displayName,
      kind: request.kind,
      offers: request.offers,
    });
    request.memberId = member.id;
    this.touched();
    return { request, token };
  }

  /** The requester's own view, by request id — how someone who asked to join
   * finds out whether they were let in, holding nothing but the id they were
   * given when they asked. Returns their member token once the request has
   * been granted, and null while it is pending or after a refusal. */
  claimGrantedRequest(requestId: string): { request: JoinRequest; token: string | null } {
    const request = this.getRequest(requestId);
    if (request.granted !== true || request.memberId === null) return { request, token: null };
    const member = this.state.members[request.memberId];
    if (!member || !member.token) return { request, token: null };
    const token = member.token;
    return { request, token };
  }

  // --- Members -----------------------------------------------------------

  private addMember(spaceId: string, input: JoinInput): { member: Member; token: string } {
    const now = Date.now();
    const stored: StoredMember = {
      id: id('mem'),
      spaceId,
      displayName: trimmed(input.displayName, 'displayName', 80),
      kind: input.kind === undefined ? 'human' : memberKind(input.kind),
      offers: stringList(input.offers, 'offers', 8, 60),
      joinedAt: now,
      lastSeenAt: now,
      token: secret(),
    };
    this.state.members[stored.id] = stored;
    return { member: publicShape(stored), token: stored.token };
  }

  /** Authenticates a bearer token and records the presence it implies. Every
   * authenticated route goes through here, which is what makes
   * "membersActiveToday" a real observation rather than a guess. */
  authenticate(token: string | null): Member {
    if (!token) throw new NotesError(401, 'no_token', 'this route needs a member token');
    const stored = Object.values(this.state.members).find((m) => m.token === token);
    if (!stored) throw new NotesError(401, 'bad_token', 'unrecognised member token');
    stored.lastSeenAt = Date.now();
    return publicShape(stored);
  }

  requireMemberOf(token: string | null, spaceId: string): Member {
    const member = this.authenticate(token);
    if (member.spaceId !== spaceId) {
      throw new NotesError(403, 'wrong_space', 'that token is for a different space');
    }
    return member;
  }

  membersOf(spaceId: string): Member[] {
    return Object.values(this.state.members)
      .filter((m) => m.spaceId === spaceId)
      .map(publicShape)
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }

  publicMembers(spaceId: string): PublicMember[] {
    return this.membersOf(spaceId).map(({ spaceId: _drop, ...rest }) => rest);
  }

  leave(memberId: string): void {
    const member = this.state.members[memberId];
    if (!member) throw new NotesError(404, 'no_such_member', 'no such member');
    delete this.state.members[memberId];
    this.touched();
  }

  // --- Notes -------------------------------------------------------------

  private insertNote(spaceId: string, authorId: string, text: string, exemplar: boolean): Note {
    const now = Date.now();
    const note: Note = {
      id: id('nte'),
      spaceId,
      authorId,
      text,
      exemplar,
      createdAt: now,
      updatedAt: now,
      promotions: [],
    };
    this.state.notes[note.id] = note;
    return note;
  }

  createNote(spaceId: string, authorId: string, text: unknown, exemplar = false): Note {
    this.getSpace(spaceId);
    const note = this.insertNote(spaceId, authorId, trimmed(text, 'text', 40000), exemplar === true);
    this.touched();
    return note;
  }

  listNotes(spaceId: string): Note[] {
    return Object.values(this.state.notes)
      .filter((n) => n.spaceId === spaceId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  getNote(noteId: string): Note {
    const note = this.state.notes[noteId];
    if (!note) throw new NotesError(404, 'no_such_note', 'no such note');
    return note;
  }

  /** Anyone in the space may rewrite any note.
   *
   * This is a shared notebook, not a set of adjacent private ones, and the
   * design's argument for freeform notes over threads — "a note lets you be
   * wrong first" — only pays off if being wrong is correctable by whoever
   * spots it. Authorship of the ORIGINAL is kept on the note; the protocol
   * below the gate is where authorship becomes cryptographic and permanent. */
  editNote(noteId: string, text: unknown): Note {
    const note = this.getNote(noteId);
    note.text = trimmed(text, 'text', 40000);
    note.updatedAt = Date.now();
    this.touched();
    return note;
  }

  /** Really deletes. See this file's header. */
  deleteNote(noteId: string): void {
    this.getNote(noteId);
    delete this.state.notes[noteId];
    this.touched();
  }

  // --- The gate ----------------------------------------------------------

  /** Records that a member carried something across. The publish already
   * happened, on the member's own agent key, in the client. */
  recordPromotion(
    noteId: string,
    memberId: string,
    input: { kind: unknown; excerpt: unknown; actionHash: unknown; dnaHash?: unknown },
  ): Promotion {
    const note = this.getNote(noteId);
    if (input.kind !== 'claim' && input.kind !== 'critique') {
      throw new NotesError(400, 'bad_field', 'kind must be "claim" or "critique"');
    }
    const promotion: Promotion = {
      id: id('prm'),
      noteId,
      memberId,
      excerpt: trimmed(input.excerpt, 'excerpt', 40000),
      kind: input.kind,
      actionHash: trimmed(input.actionHash, 'actionHash', 200),
      dnaHash: input.dnaHash === undefined || input.dnaHash === null
        ? null
        : trimmed(input.dnaHash, 'dnaHash', 200),
      promotedAt: Date.now(),
    };
    note.promotions.push(promotion);
    this.touched();
    return promotion;
  }

  // --- Asking the room's AI members --------------------------------------
  //
  // Routing only. This service never calls a model, holds no model
  // credentials, and cannot tell a considered answer from a keyword table —
  // which is why `source` is stored as the answerer's own statement and shown
  // to the reader rather than inferred here.

  private get assists(): Record<string, Assist> {
    this.state.assists ??= {};
    return this.state.assists;
  }

  askAssist(spaceId: string, askedBy: string, input: {
    kind: unknown; prompt: unknown; noteId?: unknown;
  }): Assist {
    this.getSpace(spaceId);
    const kind = input.kind;
    if (kind !== 'critique-mode' && kind !== 'draft' && kind !== 'general') {
      throw new NotesError(400, 'bad_field', 'kind must be "critique-mode", "draft" or "general"');
    }
    let noteId: string | null = null;
    if (input.noteId !== undefined && input.noteId !== null) {
      noteId = trimmed(input.noteId, 'noteId', 200);
      const note = this.getNote(noteId);
      if (note.spaceId !== spaceId) {
        throw new NotesError(400, 'bad_field', 'that note is in a different space');
      }
    }
    const assist: Assist = {
      id: id('ask'),
      spaceId,
      askedBy,
      noteId,
      kind: kind as AssistKind,
      prompt: trimmed(input.prompt, 'prompt', 20000),
      createdAt: Date.now(),
      answeredAt: null,
      answeredBy: null,
      answer: null,
      suggestion: null,
      source: null,
    };
    this.assists[assist.id] = assist;
    this.touched();
    return assist;
  }

  getAssist(assistId: string): Assist {
    const assist = this.assists[assistId];
    if (!assist) throw new NotesError(404, 'no_such_assist', 'no such request for help');
    return assist;
  }

  /** Every assist in a space, newest last. `waiting` narrows to the ones no
   * member has answered — what an assistant process polls for. */
  listAssists(spaceId: string, waiting: boolean): Assist[] {
    return Object.values(this.assists)
      .filter((a) => a.spaceId === spaceId && (!waiting || a.answeredAt === null))
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  answerAssist(assistId: string, answeredBy: string, input: {
    answer: unknown; suggestion?: unknown; source?: unknown;
  }): Assist {
    const assist = this.getAssist(assistId);
    if (assist.answeredAt !== null) {
      // First answer wins rather than last. Two assistants racing on the same
      // question should not overwrite each other, and a question that has
      // already been answered is not still open.
      throw new NotesError(409, 'already_answered', 'that question already has an answer');
    }
    assist.answer = trimmed(input.answer, 'answer', 20000);
    assist.answeredBy = answeredBy;
    assist.answeredAt = Date.now();
    assist.source = input.source === undefined || input.source === null
      ? null
      : trimmed(input.source, 'source', 200);
    assist.suggestion = normaliseSuggestion(input.suggestion);
    this.touched();
    return assist;
  }

  // --- Signals -----------------------------------------------------------

  private lastActivityAt(spaceId: string): number | null {
    let latest: number | null = null;
    for (const note of Object.values(this.state.notes)) {
      if (note.spaceId !== spaceId) continue;
      if (latest === null || note.updatedAt > latest) latest = note.updatedAt;
    }
    return latest;
  }

  /** Space-local and descriptive. See SpaceSignals' own comment for the line
   * this is careful to stay on. */
  signals(spaceId: string): SpaceSignals {
    this.getSpace(spaceId);
    const now = Date.now();
    const notes = this.listNotes(spaceId);
    const members = this.membersOf(spaceId);
    return {
      spaceId,
      notesLastDay: notes.filter((n) => now - n.createdAt <= DAY_MS).length,
      notesLastWeek: notes.filter((n) => now - n.createdAt <= WEEK_MS).length,
      membersActiveToday: members.filter((m) => now - m.lastSeenAt <= DAY_MS).length,
      aiMembers: members.filter((m) => m.kind === 'ai').length,
      totalMembers: members.length,
      lastActivityAt: this.lastActivityAt(spaceId),
      promotionsAllTime: notes.reduce((sum, n) => sum + n.promotions.length, 0),
    };
  }
}

/** Validates the structured half of an answer.
 *
 * `critiqueMode` is deliberately NOT checked against the protocol's five
 * variants here. This service knows nothing about the DNA's enums, and a
 * suggestion is not an entry — the client offers it, the protocol's own
 * validation is what refuses a bad one at publish time, and encoding the
 * enum here would put a second, staler copy of the protocol's vocabulary in
 * a service that has no business holding one. */
function normaliseSuggestion(value: unknown): AssistSuggestion | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object') throw new NotesError(400, 'bad_field', 'suggestion must be an object');
  const raw = value as Record<string, unknown>;
  const optional = (field: string, max: number): string | null => {
    const item = raw[field];
    if (item === undefined || item === null) return null;
    return trimmed(item, `suggestion.${field}`, max);
  };
  const entryKind = raw.entryKind;
  if (entryKind !== undefined && entryKind !== null && entryKind !== 'claim' && entryKind !== 'critique') {
    throw new NotesError(400, 'bad_field', 'suggestion.entryKind must be "claim" or "critique"');
  }
  return {
    critiqueMode: optional('critiqueMode', 60),
    entryKind: (entryKind ?? null) as AssistSuggestion['entryKind'],
    wording: optional('wording', 20000),
    reason: optional('reason', 2000),
  };
}

function publicShape(stored: StoredMember): Member {
  const { token: _token, ...rest } = stored;
  return rest;
}
