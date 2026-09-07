// ============================================================================
// notes/src/types.ts — the shape of the soft layer.
//
// Everything here lives OFF the DHT. Nothing in this file corresponds to a
// Holochain entry type, nothing here is validated by an integrity zome, and
// nothing here is permanent. That is the whole point: the protocol below the
// gate is strict because it can afford to be, and it can afford to be because
// half-formed material now has somewhere else to live.
//
// The one place the two layers touch is `Promotion`, which records that a
// human or an agent deliberately carried something across the gate. Note what
// it stores: an opaque base64 ActionHash and nothing else about the published
// entry. This service never reads the DHT, never writes to it, and holds no
// conductor credentials — see server.ts's header for why that separation is
// load-bearing rather than tidy.
// ============================================================================

/** Humans and AI agents are both full members of a space. The kind is
 * recorded because a newcomer deserves to know which is which — the design
 * calls for AI collaborators to be *visible*, advertised as a reason to walk
 * in the door, never disguised as another participant. */
export type MemberKind = 'human' | 'ai';

export interface Member {
  id: string;
  spaceId: string;
  displayName: string;
  kind: MemberKind;
  /** What an AI member advertises it can help with ("onboarding",
   * "critique-tutor", "research"). Empty for humans, and empty is also a
   * legitimate answer for an agent that would rather not advertise. */
  offers: string[];
  joinedAt: number;
  /** Touched on every authenticated request. Feeds the "N people active
   * today" signal, which is descriptive and space-local by construction. */
  lastSeenAt: number;
}

/** A member as anyone in the space may see them. The access token never
 * appears here — it is returned exactly once, at join. */
export type PublicMember = Omit<Member, 'spaceId'>;

export interface Space {
  id: string;
  name: string;
  description: string;
  /** Tags the space chose FOR ITSELF. Nothing derives these, and no other
   * space's tags affect this one's. */
  tags: string[];
  /** Directory opt-in. Unlisted spaces are reachable only by invite link,
   * which is how most groups are expected to form. */
  listed: boolean;
  createdAt: number;
}

/** How an invite link behaves when someone follows it.
 *
 *  - `open`     — following it joins you.
 *  - `request`  — following it files a request an existing member decides on.
 *  - `expiring` — an open link with a hard expiry; refused afterwards.
 */
export type InviteMode = 'open' | 'request' | 'expiring';

export interface Invite {
  token: string;
  spaceId: string;
  mode: InviteMode;
  /** Required, and only meaningful, for `expiring`. */
  expiresAt: number | null;
  createdAt: number;
  revokedAt: number | null;
}

export interface JoinRequest {
  id: string;
  spaceId: string;
  inviteToken: string;
  displayName: string;
  kind: MemberKind;
  offers: string[];
  requestedAt: number;
  decidedAt: number | null;
  /** null while pending. */
  granted: boolean | null;
  /** Set when granted, so the requester can collect their token by polling
   * the request they already hold the id of. */
  memberId: string | null;
}

export interface Note {
  id: string;
  spaceId: string;
  authorId: string;
  text: string;
  /** One of the two or three example notes a space creator writes so a
   * newcomer immediately sees the tone. Ordinary notes in every other
   * respect — editable, deletable, and never ranked above anything. */
  exemplar: boolean;
  createdAt: number;
  updatedAt: number;
  promotions: Promotion[];
}

/** The gate, recorded after the fact.
 *
 * A promotion is created by the CLIENT, after it has already published to the
 * DHT under the member's own agent key. This service is told what happened;
 * it never makes it happen. Two consequences worth being explicit about:
 *
 *   1. Promotion cannot be automatic here, because this process has no way to
 *      publish anything. There is no code path to disable, no flag to get
 *      wrong, and no future refactor that quietly adds one.
 *   2. `actionHash` is unverifiable from inside this service, and is stored as
 *      what it is: a claim by a member about something they say they did. The
 *      authoritative copy is on the DHT, addressed by that hash, and anyone
 *      who cares can go and look. The soft layer is not a second source of
 *      truth about the hard one.
 */
export interface Promotion {
  id: string;
  noteId: string;
  memberId: string;
  /** The slice of note text the member chose to publish a stronger version
   * of. Kept verbatim so provenance points at the actual words, not at a
   * note that has since been rewritten — notes here are editable, and an
   * excerpt captured at promotion time is the only stable record of what
   * crossed. */
  excerpt: string;
  kind: 'claim' | 'critique';
  /** base64 ActionHash. Opaque here. Canonical there. */
  actionHash: string;
  /** base64 DnaHash of the network it was published to, when the client
   * knows it — the same hash means the same network, and two promotions
   * from different DNAs are not addressing the same graph. */
  dnaHash: string | null;
  promotedAt: number;
}

/** Descriptive, space-local activity. Every field answers "is this room
 * alive?" and none answers "is this room better than that one?".
 *
 * The distinction is the protocol's first invariant applied one layer up:
 * no canonical comparative score. A count of notes in THIS space over the
 * last week is a fact about this space. The same number sorted against
 * every other space's is a leaderboard, so the directory never sorts on
 * any of these — see store.ts's `listDirectory`. */
export interface SpaceSignals {
  spaceId: string;
  notesLastDay: number;
  notesLastWeek: number;
  membersActiveToday: number;
  aiMembers: number;
  totalMembers: number;
  /** null for a space where nothing has happened yet, which is a different
   * and more honest answer than the epoch. */
  lastActivityAt: number | null;
  /** How much of this room's thinking its members chose to stand behind
   * publicly. Descriptive of the space, not of any member — deliberately
   * not broken down per person. */
  promotionsAllTime: number;
}

/** A directory row. Name, description, self-chosen tags, participant count
 * and last activity — the design's list, exactly, and nothing else. */
export interface DirectoryEntry {
  space: Space;
  totalMembers: number;
  aiMembers: number;
  lastActivityAt: number | null;
}

/** The only two orderings the directory offers.
 *
 * `recent` is a fact about time and `alphabetical` is a fact about names;
 * neither reads as an endorsement. A "top spaces" ordering is refused
 * explicitly rather than merely absent — see store.ts. */
export type DirectorySort = 'recent' | 'alphabetical';

/** What someone following an invite link is shown BEFORE they join: enough
 * to judge the tone of a room without being in it. */
export interface InvitePreview {
  space: Space;
  mode: InviteMode;
  expiresAt: number | null;
  /** The creator's example notes, verbatim. */
  examples: string[];
  totalMembers: number;
  aiMembers: number;
  /** What the AI members here advertise, flattened and de-duplicated, so
   * "this room has an onboarding assistant" is answerable from the link. */
  aiOffers: string[];
}

/** A question asked of the room's AI members, and their answer.
 *
 * THE AI IS A MEMBER, NOT A FEATURE OF THE SERVICE. This service routes the
 * question and stores the answer; it holds no model credentials, makes no
 * outbound calls, and has no idea what produced a reply. An assistant is an
 * ordinary member with `kind: "ai"` that happens to be a program, joining
 * through an invite link like anyone else — which is what makes "3 AI agents
 * helping here" a fact about who is in the room rather than a feature flag.
 *
 * AND AN ANSWER IS A SUGGESTION. Nothing here is applied to anything. The
 * `suggestion` field is a structured offer the asker's client renders beside
 * an accept and a reject; no code path in this service or in the client
 * writes it anywhere on its own. The design's phrasing is the specification:
 * an assistant that can "say 'this reads like a methodological critique —
 * want me to draft it that way?' and be right often enough to be useful and
 * wrong safely enough to be corrected."
 */
export type AssistKind = 'critique-mode' | 'draft' | 'general';

export interface AssistSuggestion {
  /** One of the protocol's five critique modes, when the question was about
   * which one fits. Sent as the bare variant name so a client can offer it
   * without translating. */
  critiqueMode: string | null;
  /** Whether the material reads as an assertion or as a disagreement. */
  entryKind: 'claim' | 'critique' | null;
  /** A stronger wording of what the note said, for the asker to edit or
   * discard. Never published by anything but a person pressing publish. */
  wording: string | null;
  /** Why the assistant thinks so, in a sentence. An unexplained suggestion is
   * not correctable, and correctability is the whole safety argument. */
  reason: string | null;
}

export interface Assist {
  id: string;
  spaceId: string;
  askedBy: string;
  /** The note the question is about, when there is one. */
  noteId: string | null;
  kind: AssistKind;
  /** The text the asker wants help with — usually the note, or the part of it
   * they selected. */
  prompt: string;
  createdAt: number;
  answeredAt: number | null;
  answeredBy: string | null;
  answer: string | null;
  suggestion: AssistSuggestion | null;
  /** How the answer was produced, in the answerer's own words — a model id, or
   * a statement that it came from fixed rules. Stored and shown rather than
   * inferred, because "an AI said so" and "a keyword table said so" deserve
   * different amounts of trust and the reader is the one who decides. */
  source: string | null;
}
