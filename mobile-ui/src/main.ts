import './style.css';
import {
  HolochainConnection, loadConfig, saveConfig, decodeRecords,
  type ConductorConfig, type DecodedRecord,
} from './holochain';
import {
  type Claim, type Critique, CONFIDENCE_LEVELS, CRITIQUE_MODES, nowMicros,
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
    disconnectBtn.onclick = () => { connection = null; claims = []; render(); };
    meta.appendChild(disconnectBtn);
    header.appendChild(meta);
  }
  return header;
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
  render();
}

async function loadCritiques(claim: DecodedRecord<Claim>) {
  if (!connection) return;
  const key = b64(claim.entryHash);
  const records = await connection.callZome<any[]>('get_critiques_for', claim.entryHash);
  critiquesByClaim.set(key, decodeRecords<Critique>(records));
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
