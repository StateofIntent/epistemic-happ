import './style.css';
import {
  HolochainConnection, loadConfig, saveConfig, decodeRecords,
  type ConductorConfig, type DecodedRecord,
} from './holochain';
import {
  type Claim, type Critique, CONFIDENCE_LEVELS, CRITIQUE_MODES, nowMicros,
  type SynapticFrictionStatus, type AntibodyPattern, type Retraction,
  type Membrane, type DiscourseHealth, type CrossDomainCritique,
  type Constitution, type GroundingPath, EVIDENCE_TYPES, type EvidenceType,
} from './types';
import {
  layoutTree, countNodes, maxDepth, flattenPreOrder, NODE_RADIUS,
  type CritiqueNode,
} from './graph';
import {
  hasSeen, markSeen, markDone, nextStep,
  domainDetailExpanded, setDomainDetailExpanded,
  CONCEPT_NOTES, type Concept,
} from './onboarding';

// ============================================================================
// Tiny app state — no framework. This UI is small enough (browse
// claims, view/add critiques, create a claim) that a framework would be
// pure overhead; this codebase's own established preference (see the
// HRR section's reasoning for hand-rolled math over a new dependency)
// is minimal dependencies over convenience, applied here to UI as well.
// ============================================================================

let connection: HolochainConnection | null = null;
let currentDomain = '';
let claims: DecodedRecord<Claim>[] = [];

// --- Epistemic state (README.md §9's "surface what the backend already
// computes"). Held in the same in-memory store the claim/critique lists
// already use, so render() stays synchronous and never blocks on a zome
// call — reads happen once, asynchronously, and rendering reads memory.
//
// Everything here is protocol-computed and identical for every viewer,
// which is what keeps it inside §4.4's constraints. This client infers
// nothing, ranks nothing, and reorders nothing on the strength of it.
let frictionStatus: SynapticFrictionStatus | null = null;
/** claim entryHash (b64) -> AntibodyPatterns flagged against it */
const antibodiesByClaim = new Map<string, DecodedRecord<AntibodyPattern>[]>();
/** claim entryHash (b64) -> Retractions its author has published */
const retractionsByClaim = new Map<string, DecodedRecord<Retraction>[]>();
/** critique actionHash (b64) -> effective conductance of its SynapticLink */
const conductanceByCritique = new Map<string, number>();

// --- Critique structure (spatial view) --------------------------------
// A Critique is itself a valid critique target, so disagreement here is
// a tree rather than a flat list — and the critique panel only ever
// fetches depth 1. These hold the deeper structure for the claims whose
// graph the user has actually opened.
/** claim entryHash (b64) -> its full critique tree */
const critiqueTreeByClaim = new Map<string, CritiqueNode[]>();
/** claim entryHash (b64) -> whether the spatial view is open */
const graphOpenClaims = new Set<string>();

// --- Membranes -------------------------------------------------------
// A domain is a free-text string on a Claim; a Membrane is that domain
// founded as a real entry, with a description and the promises it
// demands. get_discourse_health and get_cross_domain_critiques are both
// anchored to a Membrane rather than a domain name, which is why they
// could not be surfaced until this existed.
let membranes: DecodedRecord<Membrane>[] = [];
/** membrane entryHash (b64) -> its joined members */
const membersByMembrane = new Map<string, Uint8Array[]>();
/** membrane entryHash (b64) -> protocol-computed discourse aggregate */
const healthByMembrane = new Map<string, DiscourseHealth>();
/** membrane entryHash (b64) -> critiques authored from other domains */
const crossDomainByMembrane = new Map<string, CrossDomainCritique[]>();
/** whether the founding form is open */
let foundingOpen = false;
/** claim entryHash (b64) -> whether its evidence chain reaches Evidence */
const groundingByClaim = new Map<string, GroundingPath>();
/** claim entryHash (b64) -> whether its retract form is open */
const retractingClaims = new Set<string>();
/** claim's own base64 entry-hash key -> its critiques, loaded lazily
 * per claim rather than for the whole domain at once. */
const critiquesByClaim = new Map<string, DecodedRecord<Critique>[]>();
/** which claims currently have their critique panel expanded. */
const expandedClaims = new Set<string>();

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function short(bytes: Uint8Array): string {
  return b64(bytes).slice(0, 12) + '…';
}

const app = document.querySelector<HTMLDivElement>('#app')!;

function render() {
  app.innerHTML = '';
  conceptNoteShownThisPass = false;
  app.appendChild(renderHeader());
  if (!connection) {
    app.appendChild(renderConnectScreen());
    return;
  }
  app.appendChild(renderTabs());
}

// --- Header -----------------------------------------------------------

function renderHeader(): HTMLElement {
  const header = document.createElement('header');
  header.className = 'app-header';
  const titleRow = document.createElement('div');
  titleRow.className = 'title-row';
  const title = document.createElement('h1');
  title.textContent = 'Epistemic';
  titleRow.appendChild(title);
  const subtitle = document.createElement('span');
  subtitle.className = 'subtitle';
  subtitle.textContent = 'Practitioner';
  titleRow.appendChild(subtitle);
  header.appendChild(titleRow);
  if (connection) {
    const meta = document.createElement('div');
    meta.className = 'header-meta';
    const status = document.createElement('div');
    status.className = 'status connected';
    status.textContent = `Connected · ${short(connection.myAgentPubKey)}`;
    meta.appendChild(status);
    const disconnectBtn = document.createElement('button');
    disconnectBtn.className = 'link-button';
    disconnectBtn.textContent = 'Disconnect';
    disconnectBtn.onclick = () => { connection = null; claims = []; frictionStatus = null; render(); };
    meta.appendChild(disconnectBtn);
    header.appendChild(meta);
    if (frictionStatus) header.appendChild(renderFrictionMeter(frictionStatus));
    const localNote = renderConceptNote('local-conductor');
    if (localNote) header.appendChild(localNote);
    // The budget bar is meaningless without knowing what it bounds, so
    // its note appears the first time the bar itself does.
    if (frictionStatus) {
      const frictionNote = renderConceptNote('friction-budget');
      if (frictionNote) header.appendChild(frictionNote);
    }
  }
  return header;
}

/** The SWO budget as a depleting meter rather than an error the user
 * discovers by hitting it. get_synaptic_link_friction_status already
 * returned recent_count/limit/window_secs/blocked before this UI ever
 * asked — see README.md §9. */
function renderFrictionMeter(status: SynapticFrictionStatus): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'friction-meter';
  wrap.dataset.testid = 'friction-meter';

  const remaining = Math.max(0, status.limit - status.recent_count);
  const minutes = Math.round(status.window_secs / 60);

  const label = document.createElement('span');
  label.className = 'friction-label';
  label.textContent = status.blocked
    ? `Critique budget spent — resets within ${minutes} min`
    : `Critique budget ${remaining}/${status.limit} left this ${minutes} min`;
  wrap.appendChild(label);

  const bar = document.createElement('div');
  bar.className = 'friction-bar';
  const fill = document.createElement('div');
  fill.className = status.blocked ? 'friction-fill blocked' : 'friction-fill';
  const usedPct = status.limit === 0 ? 0 : Math.min(100, (status.recent_count / status.limit) * 100);
  fill.style.width = `${usedPct}%`;
  bar.appendChild(fill);
  wrap.appendChild(bar);

  return wrap;
}

// --- Connect screen -----------------------------------------------------

function renderConnectScreen(): HTMLElement {
  const config = loadConfig();
  const section = document.createElement('section');
  section.className = 'connect-screen';

  const form = document.createElement('form');
  form.className = 'connect-form';

  const fields: Array<[keyof ConductorConfig, string]> = [
    ['adminUrl', 'Admin WebSocket URL'],
    ['appUrl', 'App WebSocket URL'],
    ['appId', 'Installed app ID'],
  ];
  const inputs: Partial<Record<keyof ConductorConfig, HTMLInputElement>> = {};
  for (const [key, label] of fields) {
    const wrap = document.createElement('label');
    wrap.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = config[key];
    input.name = key;
    wrap.appendChild(input);
    form.appendChild(wrap);
    inputs[key] = input;
  }

  const errorBox = document.createElement('div');
  errorBox.className = 'error-box';
  errorBox.hidden = true;

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.textContent = 'Connect';
  form.appendChild(submitBtn);
  form.appendChild(errorBox);

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent =
    'Connects to a conductor running on your own device or local network — ' +
    'e.g. scripts/sandbox.sh (see the root README) for a local dev conductor. ' +
    'Nothing is sent anywhere else.';
  section.appendChild(hint);

  form.onsubmit = async (e) => {
    e.preventDefault();
    errorBox.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Connecting…';
    const newConfig: ConductorConfig = {
      ...config,
      adminUrl: inputs.adminUrl!.value.trim(),
      appUrl: inputs.appUrl!.value.trim(),
      appId: inputs.appId!.value.trim(),
    };
    try {
      connection = await HolochainConnection.connect(newConfig);
      saveConfig(newConfig);
      markDone('connected');
      render();
      void loadFrictionStatus();
    } catch (err) {
      errorBox.hidden = false;
      errorBox.textContent = err instanceof Error ? err.message : String(err);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Connect';
    }
  };

  section.appendChild(form);
  return section;
}

// --- Progressive disclosure ------------------------------------------
//
// See onboarding.ts for the model and, importantly, for the line it must
// not cross: this stages EXPLANATION and ROUTINE DETAIL only. Epistemic
// state attached to a claim under evaluation is never staged, collapsed
// or deferred — a newcomer must see the same artifact an expert sees
// (README.md §4.4).

/** At most one unseen concept note is rendered per pass. Reset by
 * render() before each rebuild.
 *
 * Without this, a first run showed three notes at once — the budget bar,
 * a domain's required promises, and discourse health all introduce
 * themselves on the same screen. Three explanations delivered
 * simultaneously is contextual help, not progressive disclosure: it
 * recreates exactly the wall of concepts this module exists to break up.
 * One at a time, in the order they are encountered on screen; dismissing
 * it brings the next. */
let conceptNoteShownThisPass = false;

/** A concept's first-encounter note, rendered where the concept itself
 * appears and dismissed permanently once read. Returns null after that,
 * so this costs nothing on every subsequent render. */
function renderConceptNote(concept: Concept): HTMLElement | null {
  if (hasSeen(concept)) return null;
  if (conceptNoteShownThisPass) return null;
  conceptNoteShownThisPass = true;

  const note = document.createElement('aside');
  note.className = 'concept-note';
  note.dataset.testid = `concept-${concept}`;

  const text = document.createElement('p');
  text.textContent = CONCEPT_NOTES[concept];
  note.appendChild(text);

  const dismiss = document.createElement('button');
  dismiss.className = 'link-button';
  dismiss.textContent = 'Got it';
  dismiss.onclick = () => { markSeen(concept); render(); };
  note.appendChild(dismiss);

  return note;
}

/** One suggested next action, or nothing once the user is under way.
 * Never a checklist — a backlog of suggestions is not onboarding. */
function renderNextStep(): HTMLElement | null {
  const step = nextStep();
  if (!step) return null;
  const hint = document.createElement('div');
  hint.className = 'next-step';
  hint.dataset.testid = step.testId;
  hint.textContent = step.text;
  return hint;
}

// --- Tabs -----------------------------------------------------------------

type Tab = 'browse' | 'membranes' | 'new-claim';
let activeTab: Tab = 'browse';

function renderTabs(): HTMLElement {
  const wrap = document.createElement('div');

  const nav = document.createElement('nav');
  nav.className = 'tab-bar';
  const tabs: Array<[Tab, string]> = [
    ['browse', 'Browse'], ['membranes', 'Domains'], ['new-claim', 'New Claim'],
  ];
  for (const [tab, label] of tabs) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className = tab === activeTab ? 'tab active' : 'tab';
    btn.onclick = () => { activeTab = tab; render(); };
    nav.appendChild(btn);
  }
  wrap.appendChild(nav);

  const content = document.createElement('main');
  content.className = 'tab-content';
  const step = renderNextStep();
  if (step) content.appendChild(step);
  content.appendChild(
    activeTab === 'browse' ? renderBrowseTab()
      : activeTab === 'membranes' ? renderMembranesTab()
        : renderNewClaimTab(),
  );
  wrap.appendChild(content);

  return wrap;
}

// --- Browse tab -------------------------------------------------------

function renderBrowseTab(): HTMLElement {
  const section = document.createElement('section');

  const searchRow = document.createElement('div');
  searchRow.className = 'search-row';
  const domainInput = document.createElement('input');
  domainInput.type = 'text';
  domainInput.placeholder = 'Domain, e.g. LumbarRehab';
  domainInput.value = currentDomain;
  const loadBtn = document.createElement('button');
  loadBtn.textContent = 'Load claims';
  loadBtn.onclick = () => loadClaims(domainInput.value.trim());
  domainInput.onkeydown = (e) => { if (e.key === 'Enter') loadBtn.click(); };
  searchRow.appendChild(domainInput);
  searchRow.appendChild(loadBtn);
  section.appendChild(searchRow);

  const list = document.createElement('div');
  list.className = 'claim-list';
  if (claims.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = currentDomain
      ? `No claims loaded yet for "${currentDomain}".`
      : 'Enter a domain above and load its claims.';
    list.appendChild(empty);
  }
  for (const claim of claims) {
    list.appendChild(renderClaimCard(claim));
  }
  section.appendChild(list);

  return section;
}

function renderClaimCard(claim: DecodedRecord<Claim>): HTMLElement {
  const key = b64(claim.entryHash);
  const card = document.createElement('article');
  card.className = 'claim-card';

  const content = document.createElement('p');
  content.className = 'claim-content';
  content.textContent = claim.entry.content;
  card.appendChild(content);

  const meta = document.createElement('div');
  meta.className = 'claim-meta';
  meta.textContent = `${claim.entry.confidence} confidence · by ${short(claim.entry.author)}`;
  card.appendChild(meta);

  // Retraction is an additive act here, never a deletion (Invariant:
  // entries are immutable), so a retracted claim stays fully readable —
  // it is annotated, not hidden. Preserving disagreement rather than
  // resolving it is the point.
  const retractions = retractionsByClaim.get(key) ?? [];
  for (const retraction of retractions) {
    const banner = document.createElement('div');
    banner.className = 'retraction-banner';
    banner.dataset.testid = 'retraction-banner';
    // "by its author" is now guaranteed rather than asserted: validation
    // requires a Retraction to come from the claim's own author. This
    // banner said it unconditionally before that check existed, which
    // would have been a false statement about someone else's position
    // had a third party retracted.
    banner.textContent = `Retracted by its author — ${retraction.entry.reason}`;
    card.appendChild(banner);
  }

  // Whether this claim's evidence chain reaches a real Evidence entry.
  // An ungrounded claim is NOT invalid and this gates nothing — the
  // protocol lets a claim exist, be critiqued and be exported with no
  // grounding at all. Shown because a reader may want to know, never to
  // rank one claim above another.
  const grounding = groundingByClaim.get(key);
  if (grounding) {
    const badge = document.createElement('div');
    badge.className = grounding.grounded ? 'grounding grounded' : 'grounding ungrounded';
    badge.dataset.testid = 'grounding';
    badge.textContent = grounding.grounded
      ? `Grounded — evidence chain reaches a source in ${grounding.path.length} step${grounding.path.length === 1 ? '' : 's'}`
      : 'Not grounded — no cited evidence chain reaches a source';
    card.appendChild(badge);
  }

  // AntibodyPattern flags announce themselves. The kind and rationale
  // are shown verbatim, with the flagging agent named: this is one
  // agent's typed accusation, not a protocol verdict, and displaying it
  // as anything more would be the client inventing authority the DNA
  // never granted.
  const antibodies = antibodiesByClaim.get(key) ?? [];
  for (const pattern of antibodies) {
    const flag = document.createElement('div');
    flag.className = 'antibody-flag';
    flag.dataset.testid = 'antibody-flag';
    const kind = document.createElement('strong');
    kind.textContent = pattern.entry.kind;
    flag.appendChild(kind);
    const detail = document.createElement('span');
    detail.textContent = ` flagged by ${short(pattern.entry.author)} — ${pattern.entry.rationale}`;
    flag.appendChild(detail);
    card.appendChild(flag);
  }

  if (claim.entry.semantic_tags.length > 0) {
    const tags = document.createElement('div');
    tags.className = 'tag-row';
    for (const tag of claim.entry.semantic_tags) {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.textContent = tag;
      tags.appendChild(chip);
    }
    card.appendChild(tags);
  }

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'link-button';
  const isExpanded = expandedClaims.has(key);
  toggleBtn.textContent = isExpanded ? 'Hide critiques' : 'View / add critiques';
  toggleBtn.onclick = async () => {
    if (isExpanded) {
      expandedClaims.delete(key);
      render();
    } else {
      expandedClaims.add(key);
      render();
      if (!critiquesByClaim.has(key)) {
        await loadCritiques(claim);
      }
    }
  };
  card.appendChild(toggleBtn);

  // The spatial view sits beside the list rather than replacing it —
  // see graph.ts. It is opt-in per claim because building the tree is a
  // recursive fan-out of zome calls, and because most reading does not
  // need it: the list is the primary view and this is the one that can
  // show depth.
  // Retracting is offered only on your own claims, because validation
  // now permits only that — offering it on someone else's would be an
  // affordance the protocol refuses.
  const isMine = connection
    && b64(claim.entry.author) === b64(connection.myAgentPubKey);
  if (isMine && retractions.length === 0) {
    const retractBtn = document.createElement('button');
    retractBtn.className = 'link-button';
    retractBtn.dataset.testid = 'retract-toggle';
    retractBtn.textContent = retractingClaims.has(key) ? 'Cancel retraction' : 'Retract this claim';
    retractBtn.onclick = () => {
      if (retractingClaims.has(key)) retractingClaims.delete(key);
      else retractingClaims.add(key);
      render();
    };
    card.appendChild(retractBtn);
    if (retractingClaims.has(key)) card.appendChild(renderRetractForm(claim));
  }

  const graphOpen = graphOpenClaims.has(key);
  const graphBtn = document.createElement('button');
  graphBtn.className = 'link-button';
  graphBtn.dataset.testid = 'graph-toggle';
  graphBtn.textContent = graphOpen ? 'Hide structure' : 'View critique structure';
  graphBtn.onclick = async () => {
    if (graphOpen) {
      graphOpenClaims.delete(key);
      render();
    } else {
      graphOpenClaims.add(key);
      render();
      if (!critiqueTreeByClaim.has(key)) await loadCritiqueTree(claim);
    }
  };
  card.appendChild(graphBtn);

  if (isExpanded) {
    card.appendChild(renderCritiquePanel(claim));
  }
  if (graphOpen) {
    card.appendChild(renderCritiqueGraph(claim));
  }

  return card;
}

/** Retracting your own claim.
 *
 * A retraction is not a deletion — nothing here is deleted. It is a new
 * entry recording that you no longer stand by something you said, and
 * why, and the claim stays fully readable underneath it. That is why the
 * reason is required rather than optional: the record is the point.
 *
 * Offered only on your own claims, matching what validation permits.
 * Retracting someone else's claim is not a weaker form of disagreeing
 * with it — the mechanism for that is a typed Critique. */
function renderRetractForm(claim: DecodedRecord<Claim>): HTMLElement {
  const key = b64(claim.entryHash);
  const form = document.createElement('div');
  form.className = 'retract-form';
  form.dataset.testid = 'retract-form';

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent =
    'This does not delete the claim — it stays readable, annotated with '
    + 'your reason. Say why you no longer stand by it.';
  form.appendChild(hint);

  const reason = document.createElement('textarea');
  reason.placeholder = 'Why are you withdrawing this?';
  reason.dataset.testid = 'retract-reason';
  form.appendChild(reason);

  const error = document.createElement('p');
  error.className = 'error-box';
  error.dataset.testid = 'retract-error';
  error.hidden = true;
  form.appendChild(error);

  const submit = document.createElement('button');
  submit.textContent = 'Retract';
  submit.dataset.testid = 'retract-submit';
  submit.onclick = async () => {
    if (!connection) return;
    error.hidden = true;
    if (!reason.value.trim()) {
      error.hidden = false;
      error.textContent = 'A reason is required — the record is the point of a retraction.';
      return;
    }
    submit.disabled = true;
    try {
      await connection.callZome('create_retraction', {
        target_claim: claim.entryHash,
        reason: reason.value.trim(),
        replacement_claim: null,
        author: connection.myAgentPubKey,
        timestamp: Math.floor(Date.now() / 1000),
      });
      retractingClaims.delete(key);
      await loadClaims(currentDomain);
    } catch (err) {
      error.hidden = false;
      error.textContent = err instanceof Error ? err.message : String(err);
    } finally {
      submit.disabled = false;
    }
  };
  form.appendChild(submit);

  return form;
}

function renderCritiquePanel(claim: DecodedRecord<Claim>): HTMLElement {
  const key = b64(claim.entryHash);
  const panel = document.createElement('div');
  panel.className = 'critique-panel';

  const list = critiquesByClaim.get(key);
  if (list === undefined) {
    const loading = document.createElement('p');
    loading.className = 'hint';
    loading.textContent = 'Loading critiques…';
    panel.appendChild(loading);
  } else if (list.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'No critiques yet.';
    panel.appendChild(empty);
  } else {
    for (const critique of list) {
      const item = document.createElement('div');
      item.className = 'critique-item';
      const modeLabel = document.createElement('span');
      modeLabel.className = 'critique-mode';
      modeLabel.textContent = critique.entry.critique_mode;
      item.appendChild(modeLabel);

      // Conductance renders as a visual attribute and deliberately does
      // NOT reorder the list. It scores a SynapticLink — a critique's
      // resonance over time — never an agent (README.md §2.6), so it is
      // safe to show; but sorting by it would let the client bury weakly
      // resonant critiques, which is the interface quietly resolving a
      // disagreement the protocol preserves on purpose.
      const conductance = conductanceByCritique.get(b64(critique.actionHash));
      if (conductance !== undefined) {
        const strength = document.createElement('span');
        strength.className = 'conductance';
        strength.dataset.testid = 'conductance';
        strength.title = `Effective conductance ${conductance.toFixed(2)} — decay- and reinforcement-weighted strength of this connection, computed fresh at read time`;
        strength.textContent = `⟿ ${conductance.toFixed(2)}`;
        // Opacity tracks strength so a faded connection reads as faded,
        // with a floor so it never becomes unreadable.
        strength.style.opacity = String(Math.max(0.35, Math.min(1, conductance)));
        item.appendChild(strength);
        const note = renderConceptNote('conductance');
        if (note) item.appendChild(note);
      }
      const text = document.createElement('p');
      text.textContent = critique.entry.content;
      item.appendChild(text);
      panel.appendChild(item);
    }
  }

  const form = document.createElement('form');
  form.className = 'critique-form';
  const modeSelect = document.createElement('select');
  const modeNote = renderConceptNote('typed-critiques');
  if (modeNote) form.appendChild(modeNote);

  for (const mode of CRITIQUE_MODES) {
    const opt = document.createElement('option');
    opt.value = mode;
    opt.textContent = mode;
    modeSelect.appendChild(opt);
  }
  const textarea = document.createElement('textarea');
  textarea.placeholder = 'Your critique — say why, not just that you disagree.';
  textarea.required = true;
  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.textContent = 'Add critique';
  const errorBox = document.createElement('div');
  errorBox.className = 'error-box';
  errorBox.hidden = true;

  form.appendChild(modeSelect);
  form.appendChild(textarea);
  form.appendChild(submitBtn);
  form.appendChild(errorBox);

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!connection) return;
    errorBox.hidden = true;
    submitBtn.disabled = true;
    const critique: Critique = {
      target: claim.entryHash,
      target_type: 'Claim',
      critique_mode: modeSelect.value as Critique['critique_mode'],
      content: textarea.value,
      author: connection.myAgentPubKey,
      timestamp: nowMicros(),
      replication_attempted: false,
      evidence_hashes: [],
      species: null,
    };
    try {
      await connection.callZome('create_critique', critique);
      markDone('wrote-critique');
      textarea.value = '';
      await loadCritiques(claim);
      // Every critique spends a unit of the SWO budget (create_critique
      // creates a SynapticLink), so the meter is re-read rather than
      // decremented locally — the conductor's own count is authoritative.
      void loadFrictionStatus();
    } catch (err) {
      errorBox.hidden = false;
      errorBox.textContent = err instanceof Error ? err.message : String(err);
    } finally {
      submitBtn.disabled = false;
    }
  };

  panel.appendChild(form);
  return panel;
}

async function loadClaims(domain: string) {
  if (!connection || !domain) return;
  currentDomain = domain;
  markDone('browsed-domain');
  const records = await connection.callZome<any[]>('get_claims_by_domain', domain);
  claims = decodeRecords<Claim>(records);
  critiquesByClaim.clear();
  expandedClaims.clear();
  antibodiesByClaim.clear();
  retractionsByClaim.clear();
  render();
  // Epistemic state is fetched after the claims are already on screen,
  // so a slow or failing read degrades the badges rather than the list.
  void loadClaimEpistemicState();
}

/** AntibodyPattern flags and Retractions for every claim currently
 * listed. Fetched per claim because both are link queries anchored to a
 * specific target; the count is bounded by what a domain actually holds,
 * and results land in the store rather than blocking any render. */
async function loadClaimEpistemicState() {
  if (!connection) return;
  const conn = connection;
  await Promise.all(claims.map(async (claim) => {
    const key = b64(claim.entryHash);
    try {
      const [antibodies, retractions, grounding] = await Promise.all([
        conn.callZome<any[]>('get_antibody_patterns_for', claim.entryHash),
        conn.callZome<any[]>('get_retractions_for_claim', claim.entryHash),
        conn.callZome<GroundingPath>('get_grounding_path', claim.entryHash),
      ]);
      antibodiesByClaim.set(key, decodeRecords<AntibodyPattern>(antibodies));
      retractionsByClaim.set(key, decodeRecords<Retraction>(retractions));
      groundingByClaim.set(key, grounding);
    } catch {
      // A failed epistemic read must never take the claim list down with
      // it — the claim is still real and still readable without its
      // badges, so this degrades silently rather than throwing.
    }
  }));
  render();
}

/** This agent's own SWO budget for the current window. One call, no
 * arguments, and it reads only the caller's own source chain — see
 * SynapticFrictionStatus's own comment in types.ts. */
async function loadFrictionStatus() {
  if (!connection) return;
  try {
    frictionStatus = await connection.callZome<SynapticFrictionStatus>(
      'get_synaptic_link_friction_status', null,
    );
    render();
  } catch {
    frictionStatus = null;
  }
}

async function loadCritiques(claim: DecodedRecord<Claim>) {
  if (!connection) return;
  const key = b64(claim.entryHash);
  markDone('read-critiques');
  const records = await connection.callZome<any[]>('get_critiques_for', claim.entryHash);
  const decoded = decodeRecords<Critique>(records);
  critiquesByClaim.set(key, decoded);
  render();
  void loadConductances(claim, decoded);
}

/** Effective conductance for each critique's own SynapticLink — the
 * decay- and reinforcement-weighted strength of the connection, computed
 * fresh at read time by the protocol (README.md §2.6).
 *
 * Two calls per critique: find_synaptic_link recovers the link's own
 * ActionHash (create_critique returns the Critique's hash, not the
 * link's), then get_effective_conductance scores it. Only runs for a
 * claim the user has actually expanded, so the fan-out is bounded by
 * what is on screen. */
async function loadConductances(claim: DecodedRecord<Claim>, critiques: DecodedRecord<Critique>[]) {
  if (!connection) return;
  const conn = connection;
  await Promise.all(critiques.map(async (critique) => {
    try {
      const linkHash = await conn.callZome<Uint8Array | null>('find_synaptic_link', {
        base: claim.entryHash,
        target_action: critique.actionHash,
      });
      if (!linkHash) return;
      const conductance = await conn.callZome<number>('get_effective_conductance', linkHash);
      conductanceByCritique.set(b64(critique.actionHash), conductance);
    } catch {
      // Same degradation rule as above: a critique with no conductance
      // reading renders without one rather than not rendering.
    }
  }));
  render();
}

// --- Membranes (Domains) tab ------------------------------------------

async function loadMembranes() {
  if (!connection) return;
  markDone('viewed-domains');
  const records = await connection.callZome<any[]>('get_membranes', null);
  membranes = decodeRecords<Membrane>(records);
  membersByMembrane.clear();
  healthByMembrane.clear();
  crossDomainByMembrane.clear();
  render();
  void loadMembraneState();
}

/** Members, discourse health and cross-domain critiques for every listed
 * membrane. Same degradation rule the claim badges use: each read is
 * caught on its own, so a membrane whose aggregate fails still lists. */
async function loadMembraneState() {
  if (!connection) return;
  const conn = connection;
  await Promise.all(membranes.map(async (membrane) => {
    const key = b64(membrane.entryHash);
    try {
      const members = await conn.callZome<Uint8Array[]>('get_membrane_members', membrane.entryHash);
      membersByMembrane.set(key, members);
    } catch { /* a membrane with no readable member list still lists */ }
    try {
      // Both policies omitted deliberately. They are lenses the CALLER
      // aims (README.md §4.4) — supplying one silently on the user's
      // behalf would be this client stating a trust policy the user
      // never chose. Omitted, the aggregate counts everything.
      const health = await conn.callZome<DiscourseHealth>('get_discourse_health', {
        membrane: membrane.entryHash,
        attestation_policy: null,
        conductance_policy: null,
      });
      healthByMembrane.set(key, health);
    } catch { /* aggregate unavailable — the membrane still renders */ }
    try {
      const cross = await conn.callZome<CrossDomainCritique[]>(
        'get_cross_domain_critiques', membrane.entryHash,
      );
      crossDomainByMembrane.set(key, cross);
    } catch { /* reading lens unavailable — never load-bearing */ }
  }));
  render();
}

async function joinMembrane(membrane: DecodedRecord<Membrane>) {
  if (!connection) return;
  await connection.callZome('join_membrane', membrane.entryHash);
  const members = await connection.callZome<Uint8Array[]>(
    'get_membrane_members', membrane.entryHash,
  );
  membersByMembrane.set(b64(membrane.entryHash), members);
  render();
}

function renderMembranesTab(): HTMLElement {
  const section = document.createElement('section');

  const row = document.createElement('div');
  row.className = 'search-row';
  const loadBtn = document.createElement('button');
  loadBtn.textContent = 'Load domains';
  loadBtn.onclick = () => loadMembranes();
  row.appendChild(loadBtn);
  const foundBtn = document.createElement('button');
  foundBtn.className = 'link-button';
  foundBtn.dataset.testid = 'found-toggle';
  foundBtn.textContent = foundingOpen ? 'Cancel' : 'Found a domain';
  foundBtn.onclick = () => { foundingOpen = !foundingOpen; render(); };
  row.appendChild(foundBtn);
  section.appendChild(row);

  if (foundingOpen) section.appendChild(renderFoundingForm());

  const list = document.createElement('div');
  list.className = 'claim-list';
  if (membranes.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent =
      'No domains loaded. Load them, or found one — it costs nothing, but you ' +
      'state what you promise and what the domain asks of others. ' +
      '(domains/bootstrap.mjs founds them from templates in bulk.)';
    list.appendChild(empty);
  }
  for (const membrane of membranes) list.appendChild(renderMembraneCard(membrane));
  section.appendChild(list);

  return section;
}

/** Founding a domain: publish a Constitution, then create a Membrane
 * referencing it.
 *
 * This is where "accountable rather than costly" stops being a design
 * note and becomes something a user does. There is no fee, no stake and
 * no token — instead a founder states, under their own key, what they
 * promise, and states what the domain will demand of anyone working in
 * it. The form keeps those two visibly separate because conflating them
 * is the easy mistake: the first is a commitment you are held to, the
 * second is a condition you set for others.
 *
 * Both are enforced by DHT validation, not merely by this form — a
 * Membrane with no required promises, or one referencing a constitution
 * that is not the founder's own, is rejected by the integrity zome. */
function renderFoundingForm(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'founding-form';
  section.dataset.testid = 'founding-form';

  const intro = document.createElement('p');
  intro.className = 'hint';
  intro.textContent =
    'Founding a domain costs nothing. Instead you state what you promise, '
    + 'and what the domain will ask of anyone who works in it.';
  section.appendChild(intro);

  // --- Part one: what the founder promises -------------------------
  const mine = document.createElement('fieldset');
  const mineLegend = document.createElement('legend');
  mineLegend.textContent = 'What you promise';
  mine.appendChild(mineLegend);
  const mineHint = document.createElement('p');
  mineHint.className = 'hint';
  mineHint.textContent =
    'Published as your own Constitution, under your key. You are held to this.';
  mine.appendChild(mineHint);
  const promiseInput = document.createElement('input');
  promiseInput.type = 'text';
  promiseInput.placeholder = 'e.g. distinguish observation from inference';
  promiseInput.dataset.testid = 'founder-promise';
  mine.appendChild(promiseInput);
  section.appendChild(mine);

  // --- Part two: what the domain demands ---------------------------
  const theirs = document.createElement('fieldset');
  const theirsLegend = document.createElement('legend');
  theirsLegend.textContent = 'What the domain asks of participants';
  theirs.appendChild(theirsLegend);
  const theirsHint = document.createElement('p');
  theirsHint.className = 'hint';
  theirsHint.textContent =
    'One per line. This is the entry condition others see before joining — '
    + 'the alternative to charging them.';
  theirs.appendChild(theirsHint);

  const domainInput = document.createElement('input');
  domainInput.type = 'text';
  domainInput.placeholder = 'Domain name, e.g. LumbarRehab';
  domainInput.dataset.testid = 'founding-domain';
  theirs.appendChild(domainInput);

  const descInput = document.createElement('textarea');
  descInput.placeholder = 'What is this domain for?';
  descInput.dataset.testid = 'founding-description';
  theirs.appendChild(descInput);

  const requiredInput = document.createElement('textarea');
  requiredInput.placeholder = 'Required promises, one per line';
  requiredInput.dataset.testid = 'founding-required';
  theirs.appendChild(requiredInput);
  section.appendChild(theirs);

  // Founding is permanent. Entries here are immutable and there is no
  // deletion in this protocol, so saying so before the button is the
  // honest thing rather than a confirmation dialog after it.
  const permanence = document.createElement('p');
  permanence.className = 'permanence-note';
  permanence.dataset.testid = 'permanence-note';
  permanence.textContent =
    'Both entries are permanent. Nothing in this protocol is deleted — a domain '
    + 'you found stays founded, under your name.';
  section.appendChild(permanence);

  const error = document.createElement('p');
  error.className = 'error-box';
  error.dataset.testid = 'founding-error';
  error.hidden = true;
  section.appendChild(error);

  const submit = document.createElement('button');
  submit.textContent = 'Found this domain';
  submit.dataset.testid = 'founding-submit';
  submit.onclick = async () => {
    if (!connection) return;
    error.hidden = true;
    submit.disabled = true;

    const promise = promiseInput.value.trim();
    const domain = domainInput.value.trim();
    const required = requiredInput.value.split('\n').map((p) => p.trim()).filter(Boolean);

    // Checked here only to give a better message than the zome's; the
    // integrity zome rejects both cases regardless of this form.
    if (!promise || !domain || required.length === 0) {
      error.hidden = false;
      error.textContent =
        'A domain needs a name, at least one promise from you, and at least one '
        + 'it asks of others.';
      submit.disabled = false;
      return;
    }

    try {
      const constitution: Constitution = {
        agent: connection.myAgentPubKey,
        promises: [{ action: promise, domain, modality: null }],
        conditions: [],
        published_at: Math.floor(Date.now() / 1000),
        expires_at: null,
      };
      const constitutionHash = await connection.callZome<Uint8Array>(
        'publish_constitution', constitution,
      );
      await connection.callZome('create_membrane', {
        domain,
        description: descInput.value.trim(),
        required_promises: required,
        validation_rules_hash: null,
        creator: connection.myAgentPubKey,
        created_at: Math.floor(Date.now() / 1000),
        constitution: constitutionHash,
      });
      foundingOpen = false;
      await loadMembranes();
    } catch (err) {
      error.hidden = false;
      error.textContent = err instanceof Error ? err.message : String(err);
    } finally {
      submit.disabled = false;
    }
  };
  section.appendChild(submit);

  return section;
}

function renderMembraneCard(membrane: DecodedRecord<Membrane>): HTMLElement {
  const key = b64(membrane.entryHash);
  const card = document.createElement('article');
  card.className = 'claim-card';
  card.dataset.testid = 'membrane-card';

  const title = document.createElement('h2');
  title.className = 'membrane-domain';
  title.textContent = membrane.entry.domain;
  card.appendChild(title);

  const desc = document.createElement('p');
  desc.className = 'claim-content';
  desc.textContent = membrane.entry.description;
  card.appendChild(desc);

  const meta = document.createElement('div');
  meta.className = 'claim-meta';
  meta.textContent = `founded by ${short(membrane.entry.creator)}`;
  card.appendChild(meta);

  // What this domain demands of anyone working in it. This is the
  // "accountable rather than costly" mechanism — a domain states its
  // promises instead of charging a fee to enter.
  if (membrane.entry.required_promises.length > 0) {
    const promises = document.createElement('ul');
    promises.className = 'promise-list';
    promises.dataset.testid = 'required-promises';
    for (const promise of membrane.entry.required_promises) {
      const li = document.createElement('li');
      li.textContent = promise;
      promises.appendChild(li);
    }
    card.appendChild(promises);
    const note = renderConceptNote('required-promises');
    if (note) card.appendChild(note);
  }

  const members = membersByMembrane.get(key);
  if (members) {
    const me = connection ? b64(connection.myAgentPubKey) : '';
    const joined = members.some((m) => b64(m) === me);
    const row = document.createElement('div');
    row.className = 'membrane-members';
    const count = document.createElement('span');
    count.dataset.testid = 'member-count';
    count.textContent = `${members.length} member${members.length === 1 ? '' : 's'}`;
    row.appendChild(count);
    if (joined) {
      const badge = document.createElement('span');
      badge.className = 'joined-badge';
      badge.dataset.testid = 'joined-badge';
      badge.textContent = 'joined';
      row.appendChild(badge);
    } else {
      const joinBtn = document.createElement('button');
      joinBtn.className = 'link-button';
      joinBtn.textContent = 'Join domain';
      joinBtn.onclick = () => joinMembrane(membrane);
      row.appendChild(joinBtn);
    }
    card.appendChild(row);
  }

  const health = healthByMembrane.get(key);
  if (health) card.appendChild(renderDiscourseHealth(health));

  const cross = crossDomainByMembrane.get(key);
  if (cross && cross.length > 0) card.appendChild(renderCrossDomain(cross));

  return card;
}

/** The protocol's own aggregate over a domain. Everything shown is
 * computed by the DNA and identical for every viewer — no client-side
 * inference, per README.md §4.4.
 *
 * PROGRESSIVE DISCLOSURE, AND ITS LIMIT. The totals, ratio and mode
 * distribution are routine detail: informative, but not urgent, and a
 * newcomer meeting them alongside required promises, member counts and
 * cross-domain structure on one card is meeting too much at once. They
 * collapse behind a toggle, and once a user opens it they stay open for
 * good (onboarding.ts's setDomainDetailExpanded) — disclosure that runs
 * one way rather than re-hiding what someone asked to see.
 *
 * THE WARNING NEVER COLLAPSES. It is not routine detail; it is the
 * protocol actively saying this domain's discourse has drifted from
 * practice. Progressive disclosure may defer routine detail, never an
 * active signal — hiding one behind a fold a newcomer has not opened
 * would mean the people least able to notice the drift are the ones the
 * interface tells last. */
function renderDiscourseHealth(health: DiscourseHealth): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'discourse-health';
  wrap.dataset.testid = 'discourse-health';

  // Active signal — always rendered, before and regardless of the fold.
  if (health.warning) {
    const warn = document.createElement('div');
    warn.className = 'health-warning';
    warn.dataset.testid = 'health-warning';
    warn.textContent = health.warning;
    wrap.appendChild(warn);
  }

  const expanded = domainDetailExpanded();

  const toggle = document.createElement('button');
  toggle.className = 'link-button detail-toggle';
  toggle.dataset.testid = 'health-toggle';
  toggle.textContent = expanded ? 'Hide discourse detail' : 'Show discourse detail';
  toggle.onclick = () => { setDomainDetailExpanded(!expanded); render(); };
  wrap.appendChild(toggle);

  if (!expanded) return wrap;

  const note = renderConceptNote('discourse-health');
  if (note) wrap.appendChild(note);

  const totals = document.createElement('div');
  totals.className = 'health-totals';
  totals.dataset.testid = 'health-totals';
  totals.textContent =
    `${health.total_claims} claim${health.total_claims === 1 ? '' : 's'} · ` +
    `${health.total_critiques} critique${health.total_critiques === 1 ? '' : 's'} · ` +
    `abstract:embodied ${health.abstract_to_embodied_ratio.toFixed(2)}`;
  wrap.appendChild(totals);

  // The five CritiqueModes are non-fungible means of knowing (Invariant
  // #4), so the distribution is shown as five named counts rather than
  // summed into one number.
  if (health.critique_mode_distribution.length > 0) {
    const dist = document.createElement('div');
    dist.className = 'mode-distribution';
    dist.dataset.testid = 'mode-distribution';
    for (const [mode, count] of health.critique_mode_distribution) {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.textContent = `${mode} ${count}`;
      dist.appendChild(chip);
    }
    wrap.appendChild(dist);
  }

  return wrap;
}

/** A reading lens, shown as one: which critiques here came from agents
 * whose own claims live in other domains. It gates nothing and scores
 * nothing — it reports real structure (README.md §9, Phase 4). */
function renderCrossDomain(cross: CrossDomainCritique[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'cross-domain';
  wrap.dataset.testid = 'cross-domain';
  const domains = [...new Set(cross.flatMap((c) => c.critiquer_home_domains))];
  wrap.textContent =
    `${cross.length} critique${cross.length === 1 ? '' : 's'} from agents whose ` +
    `claims live elsewhere${domains.length ? ` (${domains.join(', ')})` : ''}`;
  return wrap;
}

// --- Spatial view of a claim's critique structure ---------------------
//
// See graph.ts for why this exists and why it is SVG rather than canvas.
// In short: critiques of critiques are real structure the flat list
// cannot show, and SVG keeps the result focusable, labelled and
// keyboard-reachable rather than trading accessibility for pixels.

const MAX_TREE_DEPTH = 3;

/** Fetches a claim's critique tree, recursively, bounded by depth.
 *
 * Bounded because fan-out is unbounded in principle: every critique can
 * itself be critiqued, so an unlimited walk on a busy claim is an
 * unbounded number of zome calls fired from a UI thread. Three levels is
 * enough to see the shape of an argument; the list view remains the
 * complete record. */
async function loadCritiqueTree(claim: DecodedRecord<Claim>) {
  if (!connection) return;
  const conn = connection;

  const fetchLevel = async (
    targetHash: Uint8Array, depth: number,
  ): Promise<CritiqueNode[]> => {
    if (depth > MAX_TREE_DEPTH) return [];
    const records = await conn.callZome<any[]>('get_critiques_for', targetHash);
    const critiques = decodeRecords<Critique>(records);
    return Promise.all(critiques.map(async (critique) => {
      let conductance: number | null = null;
      try {
        const linkHash = await conn.callZome<Uint8Array | null>('find_synaptic_link', {
          base: targetHash, target_action: critique.actionHash,
        });
        if (linkHash) {
          conductance = await conn.callZome<number>('get_effective_conductance', linkHash);
        }
      } catch {
        // An unreadable conductance renders as a plain edge, never as a
        // missing node — the structure matters more than its weight.
      }
      return {
        entryHash: critique.entryHash,
        actionHash: critique.actionHash,
        entry: critique.entry,
        conductance,
        children: await fetchLevel(critique.entryHash, depth + 1),
      };
    }));
  };

  const tree = await fetchLevel(claim.entryHash, 1);
  critiqueTreeByClaim.set(b64(claim.entryHash), tree);
  render();
}

/** The graph itself.
 *
 * Every node is a real, focusable SVG element with its own accessible
 * label, so this is navigable by keyboard and readable by a screen
 * reader — which is the whole reason it is not a canvas. The plain-text
 * list below it is not a fallback but a peer view: it carries the same
 * nodes in the same order, and remains the primary way to read them. */
function renderCritiqueGraph(claim: DecodedRecord<Claim>): HTMLElement {
  const key = b64(claim.entryHash);
  const wrap = document.createElement('div');
  wrap.className = 'critique-graph';
  wrap.dataset.testid = 'critique-graph';

  const tree = critiqueTreeByClaim.get(key);
  if (tree === undefined) {
    const loading = document.createElement('p');
    loading.className = 'hint';
    loading.textContent = 'Reading the critique structure…';
    wrap.appendChild(loading);
    return wrap;
  }

  const total = countNodes(tree);
  const depth = maxDepth(tree);

  const summary = document.createElement('p');
  summary.className = 'graph-summary';
  summary.dataset.testid = 'graph-summary';
  summary.textContent = total === 0
    ? 'No critiques yet — nothing has engaged with this claim.'
    : `${total} critique${total === 1 ? '' : 's'}, ${depth} level${depth === 1 ? '' : 's'} deep`
      + (depth > 1 ? ' — critiques of critiques the list view cannot show.' : '.');
  wrap.appendChild(summary);

  if (total === 0) return wrap;

  const { nodes, edges, width, height } = layoutTree(key, claim.entry.content, tree);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label',
    `Critique structure: ${total} critiques across ${depth} levels`);
  svg.classList.add('graph-svg');

  for (const edge of edges) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(edge.x1));
    line.setAttribute('y1', String(edge.y1));
    line.setAttribute('x2', String(edge.x2));
    line.setAttribute('y2', String(edge.y2));
    line.setAttribute('class', 'graph-edge');
    // Conductance as opacity: the protocol's own value, shown as a
    // visual attribute exactly as the list shows it. Floored so a faded
    // connection stays visible — a weak critique is still present.
    const strength = edge.conductance ?? 1;
    line.setAttribute('stroke-opacity', String(Math.max(0.25, Math.min(1, strength))));
    svg.appendChild(line);
  }

  for (const node of nodes) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(node.x));
    circle.setAttribute('cy', String(node.y));
    // Uniform radius, deliberately. Sizing by conductance or by how much
    // engagement a node attracted would be this client asserting which
    // critique matters more — the canonical comparative signal
    // Invariant #1 forbids. Size carries no information here.
    circle.setAttribute('r', String(NODE_RADIUS));
    circle.setAttribute('class', `graph-node ${node.kind}`);
    circle.setAttribute('tabindex', '0');
    circle.setAttribute('role', 'button');
    const label = node.kind === 'claim'
      ? `Claim: ${node.content}`
      : `${node.mode} critique at level ${node.depth}: ${node.content}`;
    circle.setAttribute('aria-label', label);
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = label;
    circle.appendChild(title);
    svg.appendChild(circle);
  }

  wrap.appendChild(svg);

  // The same nodes as text, in the same order. Not a fallback — the
  // readable peer of the picture, and the thing a screen reader or a
  // keyboard user actually works through.
  const list = document.createElement('ol');
  list.className = 'graph-node-list';
  list.dataset.testid = 'graph-node-list';
  // Built from the tree in reading order, NOT from the placed nodes —
  // layout emits those post-order, which reads the argument backwards.
  // See flattenPreOrder's own comment.
  for (const { node, depth } of flattenPreOrder(tree)) {
    const li = document.createElement('li');
    li.style.marginLeft = `${(depth - 1) * 0.9}rem`;
    li.dataset.depth = String(depth);
    const mode = document.createElement('span');
    mode.className = 'critique-mode';
    mode.textContent = node.entry.critique_mode;
    li.appendChild(mode);
    const text = document.createElement('span');
    text.textContent = ` ${node.entry.content}`;
    li.appendChild(text);
    list.appendChild(li);
  }
  wrap.appendChild(list);

  return wrap;
}

// --- New Claim tab ----------------------------------------------------

function renderNewClaimTab(): HTMLElement {
  const section = document.createElement('section');
  const form = document.createElement('form');
  form.className = 'claim-form';

  const contentLabel = document.createElement('label');
  contentLabel.textContent = 'Claim';
  const contentArea = document.createElement('textarea');
  contentArea.required = true;
  contentArea.placeholder = 'What are you asserting?';
  contentArea.dataset.testid = 'new-claim-content';
  contentLabel.appendChild(contentArea);

  const domainLabel = document.createElement('label');
  domainLabel.textContent = 'Domain';
  const domainInput = document.createElement('input');
  domainInput.type = 'text';
  domainInput.required = true;
  domainInput.placeholder = 'e.g. LumbarRehab';
  domainInput.dataset.testid = 'new-claim-domain';
  domainInput.value = currentDomain;
  domainLabel.appendChild(domainInput);

  const confidenceLabel = document.createElement('label');
  confidenceLabel.textContent = 'Confidence';
  const confidenceSelect = document.createElement('select');
  for (const level of CONFIDENCE_LEVELS) {
    const opt = document.createElement('option');
    opt.value = level;
    opt.textContent = level;
    if (level === 'Moderate') opt.selected = true;
    confidenceSelect.appendChild(opt);
  }
  confidenceLabel.appendChild(confidenceSelect);

  const tagsLabel = document.createElement('label');
  tagsLabel.textContent = 'Tags (comma-separated, optional)';
  const tagsInput = document.createElement('input');
  tagsInput.type = 'text';
  tagsLabel.appendChild(tagsInput);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.textContent = 'Publish claim';

  const errorBox = document.createElement('div');
  errorBox.className = 'error-box';
  errorBox.hidden = true;
  const successBox = document.createElement('div');
  successBox.className = 'success-box';
  successBox.hidden = true;

  // Evidence, cited at publication.
  //
  // It has to be here rather than added later: entries are immutable, so
  // a Claim's evidence_hashes are fixed the moment it is published and
  // there is no "attach evidence afterwards". Publishing creates the
  // Evidence entry first, then the Claim citing it — which is also what
  // makes get_grounding_path able to answer anything at all. Optional:
  // an ungrounded claim is perfectly valid here, just visibly ungrounded.
  const evidenceFieldset = document.createElement('fieldset');
  evidenceFieldset.className = 'evidence-fieldset';
  const evidenceLegend = document.createElement('legend');
  evidenceLegend.textContent = 'Evidence (optional)';
  evidenceFieldset.appendChild(evidenceLegend);
  const evidenceHint = document.createElement('p');
  evidenceHint.className = 'hint';
  evidenceHint.textContent =
    'Cited when the claim is published and fixed from then on — entries are '
    + 'immutable, so evidence cannot be attached later. A claim without it is '
    + 'still valid, just visibly ungrounded.';
  evidenceFieldset.appendChild(evidenceHint);
  const evidenceContent = document.createElement('textarea');
  evidenceContent.placeholder = 'What is the evidence? Leave blank to publish without any.';
  evidenceContent.dataset.testid = 'evidence-content';
  evidenceFieldset.appendChild(evidenceContent);
  const evidenceTypeSelect = document.createElement('select');
  evidenceTypeSelect.dataset.testid = 'evidence-type';
  for (const t of EVIDENCE_TYPES) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    evidenceTypeSelect.appendChild(opt);
  }
  evidenceFieldset.appendChild(evidenceTypeSelect);
  const evidenceUrl = document.createElement('input');
  evidenceUrl.type = 'text';
  evidenceUrl.placeholder = 'Source URL (optional)';
  evidenceUrl.dataset.testid = 'evidence-url';
  evidenceFieldset.appendChild(evidenceUrl);

  form.appendChild(contentLabel);
  form.appendChild(domainLabel);
  form.appendChild(confidenceLabel);
  form.appendChild(tagsLabel);
  form.appendChild(evidenceFieldset);
  form.appendChild(submitBtn);
  form.appendChild(errorBox);
  form.appendChild(successBox);

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!connection) return;
    errorBox.hidden = true;
    successBox.hidden = true;
    submitBtn.disabled = true;
    // Evidence first: the Claim cites it by hash, so it must exist
    // before the claim that references it.
    const evidenceHashes: Uint8Array[] = [];
    if (evidenceContent.value.trim()) {
      try {
        // create_evidence returns the ENTRY hash, which is what
        // Claim.evidence_hashes takes and what grounding walks. It used
        // to return the ActionHash — the one hash unusable for the
        // purpose — and was changed rather than worked around here.
        const evidenceHash = await connection.callZome<Uint8Array>('create_evidence', {
          content: evidenceContent.value.trim(),
          evidence_type: evidenceTypeSelect.value as EvidenceType,
          source_url: evidenceUrl.value.trim() || null,
          author: connection.myAgentPubKey,
          timestamp: Math.floor(Date.now() / 1000),
        });
        evidenceHashes.push(evidenceHash);
      } catch (err) {
        errorBox.hidden = false;
        errorBox.textContent = `Evidence could not be recorded: ${err}`;
        submitBtn.disabled = false;
        return;
      }
    }

    const claim: Claim = {
      content: contentArea.value,
      domain: domainInput.value.trim(),
      author: connection.myAgentPubKey,
      timestamp: nowMicros(),
      evidence_hashes: evidenceHashes,
      confidence: confidenceSelect.value as Claim['confidence'],
      semantic_tags: tagsInput.value.split(',').map((t) => t.trim()).filter(Boolean),
      source_mew: null,
    };
    try {
      await connection.callZome('create_claim', claim);
      successBox.hidden = false;
      successBox.textContent = 'Claim published.';
      contentArea.value = '';
      tagsInput.value = '';
      // If the practitioner is browsing this same domain, refresh it so
      // the new claim shows up without a manual reload.
      if (currentDomain === claim.domain) {
        await loadClaims(claim.domain);
      }
    } catch (err) {
      errorBox.hidden = false;
      errorBox.textContent = err instanceof Error ? err.message : String(err);
    } finally {
      submitBtn.disabled = false;
    }
  };

  section.appendChild(form);
  return section;
}

// --- Boot -------------------------------------------------------------

render();

if ('serviceWorker' in navigator) {
  // Registered from the app's own origin root — see public/sw.js.
  // Failure here (e.g. served over plain http on a LAN IP, where
  // service workers are restricted to localhost/https) is non-fatal:
  // the app still works, it just isn't installable/offline-capable.
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
