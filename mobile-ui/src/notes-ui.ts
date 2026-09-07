// ============================================================================
// mobile-ui/src/notes-ui.ts — the soft layer, on screen, and the gate.
//
// This is the room in front of the protocol: freeform notes, invite links, a
// directory that will not rank, and space-local signals that describe rather
// than compare. Everything here talks to `notes/` over HTTP and never to a
// conductor — with exactly one exception, which is the whole point of the
// screen: PROMOTION.
//
// HOW THE GATE IS BUILT HERE, and why it is built this way:
//
//   1. The publish is done by THIS CLIENT, through the app's own
//      HolochainConnection, under the practitioner's own agent key. The notes
//      service cannot publish and is never asked to; it is told afterwards.
//   2. It is always a form somebody submits. There is no "promote" that runs
//      without a person pressing it, and no batch path.
//   3. It is not a shortcut past anything. A promoted Critique spends the
//      same SWO friction budget as one written in the Browse tab, because it
//      is the same `create_critique` call — nothing here is privileged.
//   4. When there is no conductor connection the form is still RENDERED, and
//      visibly unavailable, saying why. That is this codebase's established
//      rule for an affordance the protocol would refuse (see
//      `scripts/live-verify/affordance-surfacing.mjs`): hide what is
//      structurally impossible, disable and explain what is merely
//      unavailable right now.
//
// THE ONE INVARIANT THAT NEEDED CARE ON THIS SCREEN is the same one the
// service enforces: nothing here may become comparative. The directory offers
// `recent` and `alphabetical` and no third option exists to add. Signals are
// rendered as sentences about one room ("12 notes this week", "2 AI agents
// helping here") and never beside another room's. A space's participant count
// is shown because a newcomer needs to know whether anyone is there; it is
// never used to order anything.
// ============================================================================

import {
  NotesClient, NotesRequestError, DEFAULT_NOTES_ORIGIN, loadNotesOrigin, saveNotesOrigin,
  loadMemberships, saveMembership, forgetMembership, membershipFor, inviteTokenFrom,
  type DirectoryEntry, type DirectorySort, type InvitePreview, type JoinRequest,
  type Membership, type Note, type NotesInvite, type NotesMember, type NotesSignals,
} from './notes';
import { CONFIDENCE_LEVELS, CRITIQUE_MODES, nowMicros, type Claim, type Critique, type CritiqueMode } from './types';
import type { HolochainConnection } from './holochain';

/** What the promotion form needs from the app around it. Passed in rather
 * than imported so this module never reaches back into main.ts's state. */
export interface NotesContext {
  connection: HolochainConnection | null;
  rerender: () => void;
  /** Claims already loaded elsewhere in the app, offered as critique targets.
   * A critique needs something to point at, and asking someone to paste a
   * base64 ActionHash is the ceremony this whole layer exists to soften — so
   * the list is offered first and the paste field remains for anything not in
   * it. */
  claimTargets: () => Array<{ label: string; hash: Uint8Array }>;
}

/** Plain language for the one field the protocol will not let anyone skip.
 *
 * `CritiqueMode` is a fixed five-variant axis in the integrity zome and a
 * critique cannot be written without one — which is exactly right for the
 * graph and exactly the wall a newcomer hits. The words below are a reading
 * of each mode, not a redefinition: the value sent is the variant name
 * unchanged, and nothing here narrows what a mode may be used for. */
const MODE_IN_PLAIN_WORDS: Record<CritiqueMode, string> = {
  Experiential: 'I tried this myself and something different happened.',
  Methodological: 'The way this was arrived at has a problem.',
  Logical: 'The reasoning does not follow, even if the facts are right.',
  Evidential: 'The evidence cited does not support this, or better evidence exists.',
  Phenomenological: 'This does not match how the thing is actually experienced.',
};

// --- Module state ----------------------------------------------------------
// Held here rather than in main.ts for the same reason graph.ts and
// onboarding.ts hold theirs: main.ts's render() rebuilds the DOM from scratch
// on every pass, so screen state has to outlive the elements showing it.

type Screen =
  | { kind: 'home' }
  | { kind: 'create' }
  | { kind: 'joining'; inviteToken: string }
  | { kind: 'space'; spaceId: string };

let origin = loadNotesOrigin();
let client = new NotesClient(origin);
let screen: Screen = { kind: 'home' };
let serverError: string | null = null;

let directory: DirectoryEntry[] = [];
let directorySort: DirectorySort = 'recent';
let directoryTag = '';
let directoryError: string | null = null;

let invitePreview: InvitePreview | null = null;
let inviteError: string | null = null;
/** A filed request-to-join, remembered so the answer can be collected later.
 * The requester holds nothing else — see the service's own account. */
let pendingJoin: { requestId: string; spaceName: string } | null = null;

const notesBySpace = new Map<string, Note[]>();
const membersBySpace = new Map<string, NotesMember[]>();
const signalsBySpace = new Map<string, NotesSignals>();
const invitesBySpace = new Map<string, NotesInvite[]>();
const requestsBySpace = new Map<string, JoinRequest[]>();

let editingNoteId: string | null = null;
/** The note whose promotion form is open, and the exact text that will cross.
 * Captured at the moment the form opens: the note is editable by anyone in
 * the space, and what gets published must be what was read. */
let promoting: { noteId: string; excerpt: string } | null = null;
let promotionError: string | null = null;
let promotionResult: string | null = null;

function setOrigin(next: string): void {
  origin = next.replace(/\/$/, '');
  saveNotesOrigin(origin);
  client = new NotesClient(origin);
  directory = [];
  notesBySpace.clear();
}

// --- Small DOM helpers -----------------------------------------------------
// The app builds DOM by hand throughout (no framework — see main.ts's own
// note on why). These three exist because this screen has more small
// elements than any other and repeating the four-line pattern would bury the
// structure.

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, testId: string, onClick: () => void, className = 'link-button'): HTMLButtonElement {
  const btn = el('button', className, label);
  btn.type = 'button';
  btn.dataset.testid = testId;
  btn.onclick = onClick;
  return btn;
}

function field(labelText: string, control: HTMLElement): HTMLLabelElement {
  const label = el('label', undefined, labelText);
  label.appendChild(control);
  return label;
}

function whenText(at: number | null): string {
  if (at === null) return 'nothing yet';
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 90) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

// --- Loading ---------------------------------------------------------------

async function loadDirectory(ctx: NotesContext): Promise<void> {
  directoryError = null;
  try {
    const { entries } = await client.directory(directorySort, directoryTag.trim() || undefined);
    directory = entries;
    serverError = null;
  } catch (error) {
    directory = [];
    directoryError = error instanceof Error ? error.message : String(error);
    if (error instanceof NotesRequestError && error.code === 'unreachable') serverError = directoryError;
  }
  ctx.rerender();
}

async function loadSpace(ctx: NotesContext, spaceId: string): Promise<void> {
  const membership = membershipFor(spaceId);
  if (!membership) return;
  try {
    const [notes, members, signals] = await Promise.all([
      client.notes(spaceId, membership.token),
      client.members(spaceId, membership.token),
      client.signals(spaceId, membership.token),
    ]);
    notesBySpace.set(spaceId, notes.notes);
    membersBySpace.set(spaceId, members.members);
    signalsBySpace.set(spaceId, signals.signals);
    serverError = null;
  } catch (error) {
    serverError = error instanceof Error ? error.message : String(error);
    // A token the server no longer recognises means this browser's membership
    // is gone — an ephemeral notes server was restarted, most likely. Saying
    // so beats leaving a space on screen that answers nothing.
    if (error instanceof NotesRequestError && (error.status === 401 || error.status === 403)) {
      forgetMembership(spaceId);
      screen = { kind: 'home' };
    }
  }
  // Invites and pending requests are secondary: a failure to read them must
  // not take the notes down with it.
  try {
    const [invites, requests] = await Promise.all([
      client.invites(spaceId, membership.token),
      client.pendingRequests(spaceId, membership.token),
    ]);
    invitesBySpace.set(spaceId, invites.invites);
    requestsBySpace.set(spaceId, requests.requests);
  } catch { /* the room still reads without them */ }
  ctx.rerender();
}

// --- Entry point -----------------------------------------------------------

export function renderNotesTab(ctx: NotesContext): HTMLElement {
  const section = el('section', 'notes-tab');
  section.appendChild(renderServerBar(ctx));
  if (serverError) {
    const warn = el('div', 'error-box', serverError);
    warn.dataset.testid = 'notes-server-error';
    section.appendChild(warn);
  }
  if (screen.kind === 'home') section.appendChild(renderHome(ctx));
  else if (screen.kind === 'create') section.appendChild(renderCreateSpace(ctx));
  else if (screen.kind === 'joining') section.appendChild(renderJoin(ctx, screen.inviteToken));
  else section.appendChild(renderSpace(ctx, screen.spaceId));
  return section;
}

// --- Where the server is ---------------------------------------------------

function renderServerBar(ctx: NotesContext): HTMLElement {
  const bar = el('div', 'notes-server-bar');
  const label = el('span', 'hint', 'Notes server');
  const input = el('input');
  input.type = 'text';
  input.value = origin;
  input.dataset.testid = 'notes-origin';
  input.placeholder = DEFAULT_NOTES_ORIGIN;
  const apply = button('Use', 'notes-origin-apply', () => {
    setOrigin(input.value.trim() || DEFAULT_NOTES_ORIGIN);
    void loadDirectory(ctx);
  }, 'link-button');
  bar.appendChild(label);
  bar.appendChild(input);
  bar.appendChild(apply);

  const note = el('p', 'hint',
    'The notes layer is a separate service from your conductor. Nothing written here '
    + 'reaches the DHT until you promote it, deliberately, one note at a time.');
  bar.appendChild(note);
  return bar;
}

// --- Home: my spaces, the directory, joining, creating ---------------------

function renderHome(ctx: NotesContext): HTMLElement {
  const wrap = el('div', 'notes-home');

  // My spaces first: the rooms this browser is already in are what someone
  // came back for, and the directory is for finding new ones.
  const mine = loadMemberships();
  const mineBlock = el('div', 'notes-block');
  mineBlock.appendChild(el('h2', undefined, 'Your spaces'));
  if (mine.length === 0) {
    const empty = el('p', 'hint',
      'None yet. Follow an invite link someone sent you, or start a space of your own.');
    empty.dataset.testid = 'notes-no-spaces';
    mineBlock.appendChild(empty);
  } else {
    const list = el('ul', 'notes-space-list');
    list.dataset.testid = 'notes-my-spaces';
    for (const membership of mine) {
      list.appendChild(renderMembershipRow(ctx, membership));
    }
    mineBlock.appendChild(list);
  }
  mineBlock.appendChild(button('Start a space', 'notes-start-space', () => {
    screen = { kind: 'create' };
    ctx.rerender();
  }, 'primary-button'));
  wrap.appendChild(mineBlock);

  wrap.appendChild(renderJoinBox(ctx));
  wrap.appendChild(renderDirectory(ctx));

  if (pendingJoin) wrap.appendChild(renderPendingJoin(ctx));
  return wrap;
}

function renderMembershipRow(ctx: NotesContext, membership: Membership): HTMLElement {
  const row = el('li', 'notes-space-row');
  const open = button(membership.spaceName, `notes-open-${membership.spaceId}`, () => {
    screen = { kind: 'space', spaceId: membership.spaceId };
    void loadSpace(ctx, membership.spaceId);
    ctx.rerender();
  }, 'link-button notes-space-name');
  row.appendChild(open);
  row.appendChild(el('span', 'hint', `as ${membership.displayName}`));
  row.appendChild(button('Forget', `notes-forget-${membership.spaceId}`, () => {
    forgetMembership(membership.spaceId);
    ctx.rerender();
  }));
  return row;
}

function renderJoinBox(ctx: NotesContext): HTMLElement {
  const block = el('div', 'notes-block');
  block.appendChild(el('h2', undefined, 'Follow an invite'));
  block.appendChild(el('p', 'hint',
    'Paste the link someone sent you. Holding the link is the credential — you will see '
    + 'what the room is about before deciding to join.'));
  const input = el('input');
  input.type = 'text';
  input.placeholder = `${origin}/invites/…`;
  input.dataset.testid = 'notes-invite-input';
  block.appendChild(input);
  const error = el('div', 'error-box');
  error.hidden = true;
  const go = button('Look at it', 'notes-invite-open', () => {
    const token = inviteTokenFrom(input.value);
    if (!token) {
      error.hidden = false;
      error.textContent = 'That does not look like an invite link or token.';
      return;
    }
    error.hidden = true;
    invitePreview = null;
    inviteError = null;
    screen = { kind: 'joining', inviteToken: token };
    void loadPreview(ctx, token);
    ctx.rerender();
  }, 'primary-button');
  block.appendChild(go);
  block.appendChild(error);
  return block;
}

async function loadPreview(ctx: NotesContext, token: string): Promise<void> {
  try {
    const { preview } = await client.previewInvite(token);
    invitePreview = preview;
    inviteError = null;
  } catch (error) {
    invitePreview = null;
    inviteError = error instanceof Error ? error.message : String(error);
  }
  ctx.rerender();
}

function renderDirectory(ctx: NotesContext): HTMLElement {
  const block = el('div', 'notes-block');
  block.appendChild(el('h2', undefined, 'Directory'));
  block.appendChild(el('p', 'hint',
    'Spaces that chose to be listed. Ordered by when something last happened, or by name '
    + '— there is no "most popular", because a ranking of rooms is a leaderboard.'));

  const controls = el('div', 'notes-directory-controls');
  const sortSelect = el('select');
  sortSelect.dataset.testid = 'notes-directory-sort';
  for (const [value, label] of [['recent', 'Recent activity'], ['alphabetical', 'Name']] as const) {
    const option = el('option', undefined, label);
    option.value = value;
    if (value === directorySort) option.selected = true;
    sortSelect.appendChild(option);
  }
  sortSelect.onchange = () => {
    directorySort = sortSelect.value as DirectorySort;
    void loadDirectory(ctx);
  };
  controls.appendChild(sortSelect);

  const tagInput = el('input');
  tagInput.type = 'text';
  tagInput.placeholder = 'Filter by tag';
  tagInput.value = directoryTag;
  tagInput.dataset.testid = 'notes-directory-tag';
  tagInput.onchange = () => {
    directoryTag = tagInput.value;
    void loadDirectory(ctx);
  };
  controls.appendChild(tagInput);
  controls.appendChild(button('Refresh', 'notes-directory-refresh', () => void loadDirectory(ctx)));
  block.appendChild(controls);

  if (directoryError) {
    const err = el('div', 'error-box', directoryError);
    err.dataset.testid = 'notes-directory-error';
    block.appendChild(err);
    return block;
  }
  if (directory.length === 0) {
    const empty = el('p', 'hint',
      'Nothing listed here yet. A directory of empty rooms recruits nobody — invite links are '
      + 'how most groups actually form.');
    empty.dataset.testid = 'notes-directory-empty';
    block.appendChild(empty);
    return block;
  }

  const list = el('ul', 'notes-space-list');
  list.dataset.testid = 'notes-directory';
  for (const entry of directory) {
    const row = el('li', 'notes-directory-row');
    row.appendChild(el('div', 'notes-space-name', entry.space.name));
    row.appendChild(el('p', undefined, entry.space.description));
    if (entry.space.tags.length) {
      const tags = el('div', 'notes-tags');
      for (const tag of entry.space.tags) tags.appendChild(el('span', 'tag', tag));
      row.appendChild(tags);
    }
    // Descriptive, never comparative: how many people are in this room and
    // when something last happened in it. Nothing on this line is used to
    // order the list.
    const meta = el('div', 'hint notes-space-meta');
    meta.dataset.testid = `notes-directory-meta-${entry.space.id}`;
    const people = `${entry.totalMembers} ${entry.totalMembers === 1 ? 'person' : 'people'}`;
    const ai = entry.aiMembers > 0
      ? `, ${entry.aiMembers} AI ${entry.aiMembers === 1 ? 'agent' : 'agents'} helping`
      : '';
    meta.textContent = `${people}${ai} · last activity ${whenText(entry.lastActivityAt)}`;
    row.appendChild(meta);
    const membership = membershipFor(entry.space.id);
    if (membership) {
      row.appendChild(button('Open', `notes-directory-open-${entry.space.id}`, () => {
        screen = { kind: 'space', spaceId: entry.space.id };
        void loadSpace(ctx, entry.space.id);
        ctx.rerender();
      }));
    } else {
      row.appendChild(el('span', 'hint', 'Ask someone in it for an invite link.'));
    }
    list.appendChild(row);
  }
  block.appendChild(list);
  return block;
}

function renderPendingJoin(ctx: NotesContext): HTMLElement {
  const block = el('div', 'notes-block');
  block.dataset.testid = 'notes-pending-join';
  block.appendChild(el('h2', undefined, 'Waiting to be let in'));
  block.appendChild(el('p', 'hint',
    `You asked to join ${pendingJoin?.spaceName}. Someone already in the space decides.`));
  block.appendChild(button('Check', 'notes-pending-check', async () => {
    if (!pendingJoin) return;
    try {
      const { request, token } = await client.requestStatus(pendingJoin.requestId);
      if (token) {
        saveMembership({
          spaceId: request.spaceId,
          token,
          memberId: '',
          displayName: request.displayName,
          spaceName: pendingJoin.spaceName,
        });
        const spaceId = request.spaceId;
        pendingJoin = null;
        screen = { kind: 'space', spaceId };
        void loadSpace(ctx, spaceId);
      } else if (request.granted === false) {
        serverError = 'That request was declined.';
        pendingJoin = null;
      }
    } catch (error) {
      serverError = error instanceof Error ? error.message : String(error);
    }
    ctx.rerender();
  }, 'primary-button'));
  return block;
}

// --- Joining ---------------------------------------------------------------

function renderJoin(ctx: NotesContext, inviteToken: string): HTMLElement {
  const block = el('div', 'notes-block');
  block.appendChild(button('← Back', 'notes-join-back', () => {
    screen = { kind: 'home' };
    ctx.rerender();
  }));

  if (inviteError) {
    const err = el('div', 'error-box', inviteError);
    err.dataset.testid = 'notes-invite-error';
    block.appendChild(err);
    return block;
  }
  if (!invitePreview) {
    block.appendChild(el('p', 'hint', 'Reading the invite…'));
    return block;
  }

  const preview = invitePreview;
  block.appendChild(el('h2', undefined, preview.space.name));
  block.appendChild(el('p', undefined, preview.space.description));

  const meta = el('p', 'hint');
  meta.dataset.testid = 'notes-invite-meta';
  const ai = preview.aiMembers > 0
    ? ` · ${preview.aiMembers} AI ${preview.aiMembers === 1 ? 'agent' : 'agents'} helping here`
    : '';
  meta.textContent = `${preview.totalMembers} ${preview.totalMembers === 1 ? 'person' : 'people'}${ai}`;
  block.appendChild(meta);

  if (preview.aiOffers.length) {
    const offers = el('p', 'hint', `Offered here: ${preview.aiOffers.join(', ')}`);
    offers.dataset.testid = 'notes-invite-offers';
    block.appendChild(offers);
  }

  // The example notes are the whole reason a preview exists: they show the
  // tone before anyone commits to the room.
  if (preview.examples.length) {
    const examples = el('div', 'notes-examples');
    examples.dataset.testid = 'notes-invite-examples';
    examples.appendChild(el('h3', undefined, 'What the notes here look like'));
    for (const text of preview.examples) examples.appendChild(el('blockquote', undefined, text));
    block.appendChild(examples);
  }

  if (preview.mode === 'request') {
    block.appendChild(el('p', 'hint', 'This link files a request. Someone in the space decides.'));
  }
  if (preview.mode === 'expiring' && preview.expiresAt !== null) {
    block.appendChild(el('p', 'hint',
      `This link expires ${new Date(preview.expiresAt).toLocaleString()}.`));
  }

  const nameInput = el('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'What should people call you here?';
  nameInput.dataset.testid = 'notes-join-name';
  block.appendChild(field('Your name in this space', nameInput));

  const error = el('div', 'error-box');
  error.hidden = true;
  block.appendChild(error);

  block.appendChild(button(
    preview.mode === 'request' ? 'Ask to join' : 'Join',
    'notes-join-submit',
    async () => {
      const displayName = nameInput.value.trim();
      if (!displayName) {
        error.hidden = false;
        error.textContent = 'A name is needed so other people know who wrote what.';
        return;
      }
      try {
        const result = await client.joinInvite(inviteToken, { displayName, kind: 'human' });
        if (result.outcome === 'joined') {
          saveMembership({
            spaceId: preview.space.id,
            token: result.token,
            memberId: result.member.id,
            displayName,
            spaceName: preview.space.name,
          });
          screen = { kind: 'space', spaceId: preview.space.id };
          void loadSpace(ctx, preview.space.id);
        } else {
          pendingJoin = { requestId: result.request.id, spaceName: preview.space.name };
          screen = { kind: 'home' };
        }
        ctx.rerender();
      } catch (err) {
        error.hidden = false;
        error.textContent = err instanceof Error ? err.message : String(err);
      }
    },
    'primary-button',
  ));
  return block;
}

// --- Creating a space ------------------------------------------------------

function renderCreateSpace(ctx: NotesContext): HTMLElement {
  const block = el('div', 'notes-block');
  block.appendChild(button('← Back', 'notes-create-back', () => {
    screen = { kind: 'home' };
    ctx.rerender();
  }));
  block.appendChild(el('h2', undefined, 'Start a space'));

  const nameInput = el('input');
  nameInput.type = 'text';
  nameInput.dataset.testid = 'notes-create-name';
  block.appendChild(field('Name', nameInput));

  const descInput = el('textarea');
  descInput.dataset.testid = 'notes-create-description';
  descInput.placeholder = 'What is this room for? A newcomer reads this before deciding to join.';
  block.appendChild(field('Description', descInput));

  const tagsInput = el('input');
  tagsInput.type = 'text';
  tagsInput.dataset.testid = 'notes-create-tags';
  tagsInput.placeholder = 'comma-separated, chosen by you';
  block.appendChild(field('Tags', tagsInput));

  // Example notes at creation time rather than as a later nicety: an empty
  // room and a room with two example notes recruit differently, and the
  // person best placed to set the tone is the one starting it.
  const examplesInput = el('textarea');
  examplesInput.dataset.testid = 'notes-create-examples';
  examplesInput.placeholder =
    'Two or three example notes, one per line. These are shown to anyone following your '
    + 'invite link, so they can see the tone before joining.';
  block.appendChild(field('Example notes', examplesInput));

  const nameYou = el('input');
  nameYou.type = 'text';
  nameYou.dataset.testid = 'notes-create-you';
  nameYou.placeholder = 'What should people call you here?';
  block.appendChild(field('Your name in this space', nameYou));

  const listedLabel = el('label', 'notes-checkbox');
  const listed = el('input');
  listed.type = 'checkbox';
  listed.dataset.testid = 'notes-create-listed';
  listedLabel.appendChild(listed);
  listedLabel.appendChild(el('span', undefined,
    'List this space in the directory. Unlisted spaces are reachable only by invite link.'));
  block.appendChild(listedLabel);

  const error = el('div', 'error-box');
  error.hidden = true;
  block.appendChild(error);

  block.appendChild(button('Create', 'notes-create-submit', async () => {
    const name = nameInput.value.trim();
    const description = descInput.value.trim();
    const displayName = nameYou.value.trim();
    if (!name || !description || !displayName) {
      error.hidden = false;
      error.textContent = 'A name, a description and your own name are all needed.';
      return;
    }
    try {
      const created = await client.createSpace({
        name,
        description,
        tags: tagsInput.value.split(',').map((t) => t.trim()).filter(Boolean),
        listed: listed.checked,
        creator: { displayName, kind: 'human' },
        examples: examplesInput.value.split('\n').map((t) => t.trim()).filter(Boolean),
      });
      saveMembership({
        spaceId: created.space.id,
        token: created.token,
        memberId: created.member.id,
        displayName,
        spaceName: created.space.name,
      });
      screen = { kind: 'space', spaceId: created.space.id };
      void loadSpace(ctx, created.space.id);
      ctx.rerender();
    } catch (err) {
      error.hidden = false;
      error.textContent = err instanceof Error ? err.message : String(err);
    }
  }, 'primary-button'));
  return block;
}

// --- Inside a space --------------------------------------------------------

function renderSpace(ctx: NotesContext, spaceId: string): HTMLElement {
  const block = el('div', 'notes-space');
  const membership = membershipFor(spaceId);
  block.appendChild(button('← All spaces', 'notes-space-back', () => {
    screen = { kind: 'home' };
    ctx.rerender();
  }));
  if (!membership) {
    block.appendChild(el('p', 'hint', 'You are not in this space.'));
    return block;
  }

  block.appendChild(el('h2', undefined, membership.spaceName));
  block.appendChild(renderSignals(spaceId));
  block.appendChild(renderMembers(spaceId));
  block.appendChild(renderRequests(ctx, spaceId, membership));
  block.appendChild(renderInvites(ctx, spaceId, membership));
  block.appendChild(renderComposer(ctx, spaceId, membership));
  block.appendChild(renderNotes(ctx, spaceId, membership));
  return block;
}

/** Descriptive activity, as sentences about this room.
 *
 * Rendered as prose rather than as a row of figures on purpose: a number in a
 * box invites comparison with the same box elsewhere, and there is no
 * elsewhere on this screen. "12 notes this week" answers "is this alive?" and
 * refuses to answer "is this better?". */
function renderSignals(spaceId: string): HTMLElement {
  const wrap = el('p', 'hint notes-signals');
  wrap.dataset.testid = 'notes-signals';
  const signals = signalsBySpace.get(spaceId);
  if (!signals) {
    wrap.textContent = 'Reading activity…';
    return wrap;
  }
  const parts = [
    `${signals.notesLastWeek} ${signals.notesLastWeek === 1 ? 'note' : 'notes'} this week`,
    `${signals.membersActiveToday} ${signals.membersActiveToday === 1 ? 'person' : 'people'} active today`,
  ];
  if (signals.aiMembers > 0) {
    parts.push(`${signals.aiMembers} AI ${signals.aiMembers === 1 ? 'agent' : 'agents'} helping here`);
  }
  if (signals.promotionsAllTime > 0) {
    parts.push(`${signals.promotionsAllTime} ${signals.promotionsAllTime === 1 ? 'note has' : 'notes have'} been published to the protocol`);
  }
  wrap.textContent = `${parts.join(' · ')}.`;
  return wrap;
}

function renderMembers(spaceId: string): HTMLElement {
  const wrap = el('div', 'notes-members');
  wrap.dataset.testid = 'notes-members';
  const members = membersBySpace.get(spaceId) ?? [];
  for (const member of members) {
    const chip = el('span', member.kind === 'ai' ? 'member-chip ai' : 'member-chip');
    chip.textContent = member.kind === 'ai' ? `${member.displayName} (AI)` : member.displayName;
    if (member.kind === 'ai' && member.offers.length) chip.title = `Offers: ${member.offers.join(', ')}`;
    wrap.appendChild(chip);
  }
  return wrap;
}

function renderRequests(ctx: NotesContext, spaceId: string, membership: Membership): HTMLElement {
  const wrap = el('div', 'notes-requests');
  const pending = (requestsBySpace.get(spaceId) ?? []).filter((r) => r.decidedAt === null);
  if (pending.length === 0) return wrap;
  wrap.dataset.testid = 'notes-requests';
  wrap.appendChild(el('h3', undefined, 'Asking to join'));
  for (const request of pending) {
    const row = el('div', 'notes-request-row');
    row.appendChild(el('span', undefined, `${request.displayName} (${request.kind})`));
    row.appendChild(button('Let in', `notes-request-grant-${request.id}`, async () => {
      await client.decideRequest(request.id, membership.token, true);
      void loadSpace(ctx, spaceId);
    }));
    row.appendChild(button('Decline', `notes-request-deny-${request.id}`, async () => {
      await client.decideRequest(request.id, membership.token, false);
      void loadSpace(ctx, spaceId);
    }));
    wrap.appendChild(row);
  }
  return wrap;
}

function renderInvites(ctx: NotesContext, spaceId: string, membership: Membership): HTMLElement {
  const wrap = el('details', 'notes-invites');
  wrap.dataset.testid = 'notes-invites';
  const summary = el('summary', undefined, 'Invite people');
  wrap.appendChild(summary);

  const modeSelect = el('select');
  modeSelect.dataset.testid = 'notes-invite-mode';
  for (const [value, label] of [
    ['open', 'Anyone with the link joins'],
    ['request', 'Anyone with the link may ask'],
    ['expiring', 'Link works for a while, then stops'],
  ] as const) {
    const option = el('option', undefined, label);
    option.value = value;
    modeSelect.appendChild(option);
  }
  wrap.appendChild(modeSelect);

  const ttl = el('input');
  ttl.type = 'number';
  ttl.min = '1';
  ttl.value = '86400';
  ttl.dataset.testid = 'notes-invite-ttl';
  wrap.appendChild(field('Seconds before an expiring link stops working', ttl));

  wrap.appendChild(button('Make a link', 'notes-invite-create', async () => {
    const mode = modeSelect.value as NotesInvite['mode'];
    await client.createInvite(spaceId, membership.token, mode, mode === 'expiring' ? Number(ttl.value) : null);
    void loadSpace(ctx, spaceId);
  }, 'primary-button'));

  const list = el('ul', 'notes-invite-list');
  for (const invite of invitesBySpace.get(spaceId) ?? []) {
    if (invite.revokedAt !== null) continue;
    const row = el('li');
    const url = el('code', 'notes-invite-url', invite.url);
    url.dataset.testid = `notes-invite-url-${invite.token.slice(0, 8)}`;
    row.appendChild(url);
    row.appendChild(el('span', 'hint', ` ${invite.mode}`));
    list.appendChild(row);
  }
  wrap.appendChild(list);
  return wrap;
}

function renderComposer(ctx: NotesContext, spaceId: string, membership: Membership): HTMLElement {
  const form = el('form', 'notes-composer');
  const area = el('textarea');
  area.dataset.testid = 'notes-composer';
  area.placeholder = 'Write anything. Half-formed is the point — nothing here is published, permanent or validated.';
  form.appendChild(area);
  const submit = el('button', 'primary-button', 'Add note');
  submit.type = 'submit';
  submit.dataset.testid = 'notes-composer-submit';
  form.appendChild(submit);
  const error = el('div', 'error-box');
  error.hidden = true;
  form.appendChild(error);
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (!area.value.trim()) return;
    submit.disabled = true;
    try {
      await client.createNote(spaceId, membership.token, area.value);
      area.value = '';
      await loadSpace(ctx, spaceId);
    } catch (err) {
      error.hidden = false;
      error.textContent = err instanceof Error ? err.message : String(err);
    } finally {
      submit.disabled = false;
    }
  };
  return form;
}

function renderNotes(ctx: NotesContext, spaceId: string, membership: Membership): HTMLElement {
  const list = el('ul', 'notes-list');
  list.dataset.testid = 'notes-list';
  const notes = notesBySpace.get(spaceId) ?? [];
  const members = membersBySpace.get(spaceId) ?? [];
  for (const note of notes) {
    list.appendChild(renderNote(ctx, note, membership, members));
  }
  // "Not read yet" and "genuinely empty" are different answers, and only one
  // of them is a fact about the room. Rendering an unloaded space as an empty
  // one tells a newcomer who just followed an invite that they walked into a
  // dead room — the same "absence is never a finding" rule this codebase
  // applies to adoption counts and to grounding.
  if (!notesBySpace.has(spaceId)) {
    const loading = el('li', 'hint', 'Reading this room…');
    loading.dataset.testid = 'notes-loading';
    list.appendChild(loading);
  } else if (notes.length === 0) {
    const empty = el('li', 'hint', 'Nothing written here yet.');
    empty.dataset.testid = 'notes-empty';
    list.appendChild(empty);
  }
  return list;
}

function renderNote(
  ctx: NotesContext, note: Note, membership: Membership, members: NotesMember[],
): HTMLElement {
  const item = el('li', 'note-card');
  item.dataset.testid = `note-${note.id}`;

  const author = members.find((m) => m.id === note.authorId);
  const byline = el('div', 'hint note-byline');
  byline.textContent = `${author?.displayName ?? 'someone'}${author?.kind === 'ai' ? ' (AI)' : ''} · ${whenText(note.createdAt)}`;
  if (note.exemplar) byline.textContent += ' · example note';
  item.appendChild(byline);

  if (editingNoteId === note.id) {
    const area = el('textarea');
    area.value = note.text;
    area.dataset.testid = `note-edit-${note.id}`;
    item.appendChild(area);
    item.appendChild(button('Save', `note-save-${note.id}`, async () => {
      await client.editNote(note.id, membership.token, area.value);
      editingNoteId = null;
      await loadSpace(ctx, note.spaceId);
    }, 'primary-button'));
    item.appendChild(button('Cancel', `note-cancel-${note.id}`, () => {
      editingNoteId = null;
      ctx.rerender();
    }));
    return item;
  }

  const body = el('p', 'note-text', note.text);
  item.appendChild(body);

  const actions = el('div', 'note-actions');
  actions.appendChild(button('Edit', `note-edit-open-${note.id}`, () => {
    editingNoteId = note.id;
    ctx.rerender();
  }));
  actions.appendChild(button('Delete', `note-delete-${note.id}`, async () => {
    await client.deleteNote(note.id, membership.token);
    await loadSpace(ctx, note.spaceId);
  }));
  // The gate. Opening the form captures the text as it reads right now —
  // any member may rewrite this note, and what gets published must be what
  // was read.
  actions.appendChild(button('Publish a stronger version', `note-promote-${note.id}`, () => {
    promoting = { noteId: note.id, excerpt: selectionWithin(body) ?? note.text };
    promotionError = null;
    promotionResult = null;
    ctx.rerender();
  }, 'link-button promote-button'));
  item.appendChild(actions);

  if (note.promotions.length) {
    const crossed = el('div', 'note-promotions');
    crossed.dataset.testid = `note-promotions-${note.id}`;
    for (const promotion of note.promotions) {
      const row = el('div', 'note-promotion');
      row.appendChild(el('span', 'chip', promotion.kind === 'claim' ? 'Published as a Claim' : 'Published as a Critique'));
      const hash = el('code', 'promotion-hash', promotion.actionHash);
      hash.title = 'The Holochain ActionHash of the published entry. That copy is canonical; this note is not.';
      row.appendChild(hash);
      crossed.appendChild(row);
    }
    item.appendChild(crossed);
  }

  if (promoting?.noteId === note.id) item.appendChild(renderPromotionForm(ctx, note, membership));
  return item;
}

/** The part of a note the reader has actually selected, if any.
 *
 * "You select part of a note and say publish a stronger version of this" is
 * the design's own description of the gate, and a selection is the honest
 * reading of which words someone meant. Falls back to the whole note, which
 * is what someone who selected nothing meant. */
function selectionWithin(element: HTMLElement): string | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!element.contains(range.commonAncestorContainer)) return null;
  const text = selection.toString().trim();
  return text.length > 0 ? text : null;
}

// --- The promotion form ----------------------------------------------------

function renderPromotionForm(ctx: NotesContext, note: Note, membership: Membership): HTMLElement {
  const panel = el('div', 'promotion-panel');
  panel.dataset.testid = `promotion-form-${note.id}`;
  panel.appendChild(el('h3', undefined, 'Publish a stronger version'));
  panel.appendChild(el('p', 'hint',
    'This writes to the protocol under your own agent key, and what it writes is permanent: '
    + 'entries are never deleted. The note stays here, unchanged, and the published entry '
    + 'records the words it came from.'));

  const excerpt = el('blockquote', 'promotion-excerpt', promoting?.excerpt ?? note.text);
  excerpt.dataset.testid = 'promotion-excerpt';
  panel.appendChild(excerpt);

  const connection = ctx.connection;

  const kindSelect = el('select');
  kindSelect.dataset.testid = 'promotion-kind';
  for (const [value, label] of [
    ['claim', 'A Claim — something you are asserting'],
    ['critique', 'A Critique — a typed disagreement with an existing claim'],
  ] as const) {
    const option = el('option', undefined, label);
    option.value = value;
    kindSelect.appendChild(option);
  }
  panel.appendChild(field('What is this?', kindSelect));

  const content = el('textarea');
  content.dataset.testid = 'promotion-content';
  content.value = promoting?.excerpt ?? note.text;
  panel.appendChild(field('The published wording', content));

  // --- Claim fields
  const claimFields = el('div', 'promotion-claim-fields');
  const domain = el('input');
  domain.type = 'text';
  domain.dataset.testid = 'promotion-domain';
  domain.placeholder = 'e.g. LumbarRehab';
  claimFields.appendChild(field('Domain', domain));
  const confidence = el('select');
  confidence.dataset.testid = 'promotion-confidence';
  for (const level of CONFIDENCE_LEVELS) {
    const option = el('option', undefined, level);
    option.value = level;
    if (level === 'Moderate') option.selected = true;
    confidence.appendChild(option);
  }
  claimFields.appendChild(field('How confident are you?', confidence));
  const tags = el('input');
  tags.type = 'text';
  tags.dataset.testid = 'promotion-tags';
  tags.placeholder = 'comma-separated, optional';
  claimFields.appendChild(field('Tags', tags));
  panel.appendChild(claimFields);

  // --- Critique fields
  const critiqueFields = el('div', 'promotion-critique-fields');
  critiqueFields.hidden = true;
  const targetSelect = el('select');
  targetSelect.dataset.testid = 'promotion-target';
  const targets = ctx.claimTargets();
  const none = el('option', undefined, targets.length ? 'Choose a claim…' : 'No claims loaded — browse a domain first');
  none.value = '';
  targetSelect.appendChild(none);
  for (const target of targets) {
    const option = el('option', undefined, target.label);
    option.value = b64(target.hash);
    targetSelect.appendChild(option);
  }
  critiqueFields.appendChild(field('Which claim are you critiquing?', targetSelect));

  // The one field the protocol will not let anyone skip, asked in plain
  // language. The value sent is the variant name unchanged; the sentence is
  // a reading of it, not a redefinition.
  const modeSelect = el('select');
  modeSelect.dataset.testid = 'promotion-mode';
  for (const mode of CRITIQUE_MODES) {
    const option = el('option', undefined, `${mode} — ${MODE_IN_PLAIN_WORDS[mode]}`);
    option.value = mode;
    modeSelect.appendChild(option);
  }
  critiqueFields.appendChild(field('What kind of disagreement is this?', modeSelect));
  const modeNote = el('p', 'hint',
    'The protocol requires one of these five and will not accept free text. That is what stops '
    + 'disagreement collapsing into a single agree/disagree bit.');
  critiqueFields.appendChild(modeNote);
  panel.appendChild(critiqueFields);

  kindSelect.onchange = () => {
    const critique = kindSelect.value === 'critique';
    claimFields.hidden = critique;
    critiqueFields.hidden = !critique;
  };

  const error = el('div', 'error-box');
  error.hidden = promotionError === null;
  if (promotionError) error.textContent = promotionError;
  const success = el('div', 'success-box');
  success.hidden = promotionResult === null;
  if (promotionResult) success.textContent = promotionResult;

  const submit = el('button', 'primary-button', 'Publish to the protocol');
  submit.type = 'button';
  submit.dataset.testid = 'promotion-submit';

  // Rendered, visibly unavailable, and saying why — this codebase's rule for
  // an affordance that is merely unavailable rather than structurally
  // impossible. Hiding it would leave a person believing the notes layer
  // cannot reach the protocol at all, which is the opposite of the thing
  // being explained.
  if (!connection) {
    submit.disabled = true;
    const why = el('p', 'hint promotion-unavailable',
      'Publishing needs your own conductor: the protocol only accepts entries signed by your '
      + 'agent key, and the notes server has no key and cannot sign for you. Connect on the '
      + 'first screen and this becomes available.');
    why.dataset.testid = 'promotion-unavailable';
    panel.appendChild(why);
  }

  submit.onclick = async () => {
    if (!connection) return;
    submit.disabled = true;
    promotionError = null;
    try {
      const text = content.value.trim();
      if (!text) throw new Error('There is nothing to publish.');
      let actionHash: Uint8Array;
      if (kindSelect.value === 'claim') {
        if (!domain.value.trim()) throw new Error('A claim needs a domain.');
        const claim: Claim = {
          content: text,
          domain: domain.value.trim(),
          author: connection.myAgentPubKey,
          timestamp: nowMicros(),
          evidence_hashes: [],
          confidence: confidence.value as Claim['confidence'],
          semantic_tags: tags.value.split(',').map((t) => t.trim()).filter(Boolean),
          source_mew: null,
        };
        actionHash = await connection.callZome<Uint8Array>('create_claim', claim);
      } else {
        if (!targetSelect.value) throw new Error('A critique needs a claim to point at.');
        const critique: Critique = {
          target: bytesFromB64(targetSelect.value),
          target_type: 'Claim',
          critique_mode: modeSelect.value as CritiqueMode,
          content: text,
          author: connection.myAgentPubKey,
          timestamp: nowMicros(),
          replication_attempted: false,
          evidence_hashes: [],
          species: null,
        };
        actionHash = await connection.callZome<Uint8Array>('create_critique', critique);
      }
      // Only now does the notes service hear about it. The publish already
      // happened; this records provenance, and a failure here loses the
      // back-link, never the entry.
      await client.recordPromotion(note.id, membership.token, {
        kind: kindSelect.value as 'claim' | 'critique',
        excerpt: promoting?.excerpt ?? note.text,
        actionHash: b64(actionHash),
        dnaHash: null,
      });
      promotionResult = 'Published. The note is still here; the published entry is permanent.';
      promoting = null;
      await loadSpace(ctx, note.spaceId);
    } catch (err) {
      promotionError = err instanceof Error ? err.message : String(err);
      ctx.rerender();
    } finally {
      submit.disabled = false;
    }
  };

  panel.appendChild(submit);
  panel.appendChild(button('Cancel', 'promotion-cancel', () => {
    promoting = null;
    promotionError = null;
    ctx.rerender();
  }));
  panel.appendChild(error);
  panel.appendChild(success);
  return panel;
}

// Local copies of main.ts's two hash helpers. Duplicated rather than exported
// across because they are four lines each and this module is deliberately
// importable without pulling main.ts's whole app state in behind it.
function b64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function bytesFromB64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Called by main.ts when the tab is opened, so the directory is populated
 * without every render firing a request. */
export function onNotesTabOpened(ctx: NotesContext): void {
  if (screen.kind === 'space') {
    void loadSpace(ctx, screen.spaceId);
    return;
  }
  if (directory.length === 0 && directoryError === null) void loadDirectory(ctx);
}
