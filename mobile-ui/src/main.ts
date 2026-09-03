import './style.css';
import {
  HolochainConnection, loadConfig, saveConfig, decodeRecords,
  type ConductorConfig, type DecodedRecord,
} from './holochain';
import {
  type Claim, type Critique, CONFIDENCE_LEVELS, CRITIQUE_MODES, nowMicros,
  type SynapticFrictionStatus, type AntibodyPattern, type Retraction,
} from './types';

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

// --- Tabs -----------------------------------------------------------------

type Tab = 'browse' | 'new-claim';
let activeTab: Tab = 'browse';

function renderTabs(): HTMLElement {
  const wrap = document.createElement('div');

  const nav = document.createElement('nav');
  nav.className = 'tab-bar';
  const tabs: Array<[Tab, string]> = [['browse', 'Browse'], ['new-claim', 'New Claim']];
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
  content.appendChild(activeTab === 'browse' ? renderBrowseTab() : renderNewClaimTab());
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
    banner.textContent = `Retracted by its author — ${retraction.entry.reason}`;
    card.appendChild(banner);
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

  if (isExpanded) {
    card.appendChild(renderCritiquePanel(claim));
  }

  return card;
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
      const [antibodies, retractions] = await Promise.all([
        conn.callZome<any[]>('get_antibody_patterns_for', claim.entryHash),
        conn.callZome<any[]>('get_retractions_for_claim', claim.entryHash),
      ]);
      antibodiesByClaim.set(key, decodeRecords<AntibodyPattern>(antibodies));
      retractionsByClaim.set(key, decodeRecords<Retraction>(retractions));
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
  contentLabel.appendChild(contentArea);

  const domainLabel = document.createElement('label');
  domainLabel.textContent = 'Domain';
  const domainInput = document.createElement('input');
  domainInput.type = 'text';
  domainInput.required = true;
  domainInput.placeholder = 'e.g. LumbarRehab';
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

  form.appendChild(contentLabel);
  form.appendChild(domainLabel);
  form.appendChild(confidenceLabel);
  form.appendChild(tagsLabel);
  form.appendChild(submitBtn);
  form.appendChild(errorBox);
  form.appendChild(successBox);

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!connection) return;
    errorBox.hidden = true;
    successBox.hidden = true;
    submitBtn.disabled = true;
    const claim: Claim = {
      content: contentArea.value,
      domain: domainInput.value.trim(),
      author: connection.myAgentPubKey,
      timestamp: nowMicros(),
      evidence_hashes: [],
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
