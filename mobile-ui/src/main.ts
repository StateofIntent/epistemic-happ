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
  ANTIBODY_PATTERN_KINDS, type CritiqueSpecies, type AttestationPolicy,
  type CritiqueMode, type WorldlineTrace, type PeriodResonance,
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
/** Why the automatic Launcher connection failed, if it did. Only ever
 * set on the hosted path, where there is no form for the practitioner to
 * retry from and so no other place this could be reported. */
let hostedConnectError: string | null = null;
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
/** critique actionHash (b64) -> the ActionHash of its own SynapticLink.
 *
 * loadConductances already resolves this (find_synaptic_link, because
 * create_critique returns the Critique's hash and not the link's) and
 * used to throw it away after scoring. Reinforcing needs exactly that
 * hash, so it is kept rather than resolved a second time. */
const linkHashByCritique = new Map<string, Uint8Array>();

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
/** claim entryHash (b64) -> whether its antibody-flag form is open */
const flaggingClaims = new Set<string>();
// --- Author constitutions ---------------------------------------------
// What an agent has publicly promised about how they work. §4.3's account
// of how a claim's status emerges requires agents cross-checking one
// another's disclosures, and a promise is the disclosure being checked
// against — so this is the one piece of context that makes a critique of
// someone's method a comparison rather than an opinion.
//
// Read per author, on request, never eagerly: get_agent_constitution is
// a DHT read per agent, and a claim list of twenty would otherwise fire
// twenty of them for context nobody asked to see.
/** author pubkey (b64) -> their current constitution, or null if they
 * have published none. Absent means not asked or still in flight, which
 * is deliberately distinct from null. */
const constitutionByAuthor = new Map<string, Constitution | null>();
/** author pubkey (b64) -> whether their promises are expanded */
const constitutionOpen = new Set<string>();

// --- My critiques by mode ---------------------------------------------
// CHAIN-LOCAL BY SPECIFICATION, and the UI must say so. SPEC §10.0 names
// get_critiques_by_mode as one of three reads left chain-local on
// purpose — a global index over every critique of a given mode would be
// an unbounded firehose whose desirability is an unanswered design
// question. So this returns THE CALLER'S OWN critiques and nothing else.
//
// A screen labelled "Logical critiques" over that data would be a plain
// falsehood, and worse than not surfacing it: a practitioner would read
// an empty result as "nobody critiques this way" when it means "I don't".
// Every label here says "your own", and the empty state says it too.
/** CritiqueMode -> the caller's own critiques in that mode */
const myCritiquesByMode = new Map<CritiqueMode, DecodedRecord<Critique>[]>();
/** whether the by-mode breakdown has been requested */
let modeBreakdownOpen = false;

// --- Worldline (HRR) --------------------------------------------------
// An agent's own source chain compressed into one vector, indexed by
// time. README §2.5's account of what this layer is permitted to be is
// the whole design here: "a receiver, not a truth engine".
//
// TWO KINDS OF ANSWER, AND THEY MUST NOT BE CONFUSED ON SCREEN.
// period_boundaries is EXACT and lossless — the real windows, their
// domain tags and entry counts. Resonance is APPROXIMATE by
// construction, and query_worldline_resonance's own doc comment says a
// high similarity "is a hint worth checking, not a claim of fact" and
// that it "never substitutes for get_agent_worldline_trace's own
// period_boundaries". So boundaries render first and always; resonance
// is a probe layered over them; and every hit is shown against the exact
// boundary it points at, with sample_period available to open that
// window's real records. Making the hint checkable is the difference
// between honouring that rule and reciting it.
//
// YOUR OWN WORLDLINE ONLY, IN THIS INCREMENT, AND FOR A REASON. The
// coordinator accepts any AgentPubKey, and offering a "how strongly does
// this agent resonate with domain X" probe over other people would hand
// every client a per-agent scalar that get_membrane_members makes
// enumerable and sortable — which is exactly the leaderboard §9 records
// removing get_credit_balance to avoid, arriving by another route. The
// protocol permitting a read does not oblige a UI to offer it.
/** this agent's own most recent trace, or null if none has been made */
let myWorldline: WorldlineTrace | null = null;
/** whether the trace has been read at all yet */
let worldlineLoaded = false;
/** whether the stored checksum verifies — absent while unasked */
let worldlineChecksumOk: boolean | null = null;
/** the last resonance probe: the tag asked, and what came back */
let resonanceProbe: { tag: string; hits: PeriodResonance[] } | null = null;
/** period index -> the real records inside that window, once opened */
const sampledPeriods = new Map<number, number>();
/** which period indices have their sample expanded */
const openPeriods = new Set<number>();

/** whether the expertise-assertion form is open */
let expertiseFormOpen = false;

// --- Trust lenses (opt-in, user-aimed) --------------------------------
// README.md §4.4's first constraint is the whole design here, not a
// caveat on it: "If the interface is filtering, the user must have
// chosen the filter and be able to see it."
//
// So three rules this state exists to make enforceable:
//
//   1. NEVER ON BY DEFAULT. lensByMembrane is empty until a user builds
//      a policy and applies it. Every get_discourse_health call keeps
//      passing attestation_policy: null until then, which is the read
//      that "hands back everything and takes no position".
//   2. NEVER APPLIED INVISIBLY. A membrane with a lens renders a banner
//      naming the roots, the threshold and the depth, plus a control to
//      remove it. An active lens the user cannot see is the failure mode
//      §4.4 describes exactly.
//   3. THE UNFILTERED FIGURES STAY ON SCREEN. healthByMembrane keeps the
//      neutral answer and lensedHealthByMembrane holds the filtered one,
//      so the card can show what the lens removed rather than quietly
//      replacing one number with another. A filter whose effect is
//      invisible is presented as neutral even when it is disclosed.
/** membrane entryHash (b64) -> the policy this user has aimed at it */
const lensByMembrane = new Map<string, AttestationPolicy>();
/** membrane entryHash (b64) -> discourse health computed WITH that lens.
 * Held separately from healthByMembrane, which stays the unfiltered
 * answer for as long as the lens is active. */
const lensedHealthByMembrane = new Map<string, DiscourseHealth>();
/** membrane entryHash (b64) -> whether the lens builder is open */
const lensBuilderOpen = new Set<string>();
/** "<membrane b64>|<agent b64>" -> whether that agent passes the active
 * lens. Absent when no lens is active, or while the read is in flight —
 * and absence renders as nothing at all rather than as "not attested",
 * because those are different claims and only one of them was checked. */
const attestedByMembraneAgent = new Map<string, boolean>();

// --- Critique taxonomy ------------------------------------------------
// The evolving vocabulary of critique *kinds*. CritiqueMode is the
// protocol's fixed five-variant axis; a CritiqueSpecies is the open one
// a domain authors for itself, and domains/climate.json and
// nutrition.json each seed a real two-level set that no screen could
// show until now.
//
// NOT SORTED BY ADOPTION, ANYWHERE, AND THAT IS DELIBERATE. The
// coordinator exposes get_critique_species_adoption_count as a
// *singular* read — one hash in, one count out — and its own doc comment
// records why there is intentionally no "all species ranked by
// adoption": that would recreate the comparative leaderboard Invariant
// #1 and README.md §4.4's first constraint exist to refuse. Ranking
// client-side by the number would reintroduce it one layer up and be
// exactly the "lens that aims itself" §4.4 names. So the tree renders in
// taxonomy order — parents, then their children — and the count is shown
// beside each species as a fact about it, never as its position.
let critiqueSpecies: DecodedRecord<CritiqueSpecies>[] = [];
/** species entryHash (b64) -> live adoption count, counted from real
 * CritiqueToSpecies links at query time. Absent while in flight or if
 * the read failed; the UI says "adoption unavailable" rather than 0,
 * because 0 is a real and different answer. */
const adoptionBySpecies = new Map<string, number>();
/** whether the propose-a-species form is open */
let proposingSpecies = false;

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

  // Under the Launcher there is nothing to ask and nothing to configure:
  // the host chose the app interface port and issued the token, and the
  // Admin API this form's fields describe is not reachable from here at
  // all (holochain.ts's header, shape 1). Showing the form anyway would
  // be asking the practitioner to supply values that would then be
  // ignored — so the only thing rendered on this path is the state of
  // an attempt already in flight, or the reason one failed.
  if (HolochainConnection.isHosted()) {
    const status = document.createElement('p');
    status.className = 'hint';
    status.textContent = hostedConnectError
      ? `Could not reach the conductor this app was launched by. ${hostedConnectError}`
      : 'Connecting to the conductor that launched this app…';
    if (hostedConnectError) status.classList.add('error-box');
    section.appendChild(status);
    return section;
  }

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
      // The critique form's species picker reads critiqueSpecies, and a
      // practitioner reaches that form without ever opening the taxonomy
      // tab. Loaded once on connect so the vocabulary is offered where
      // it is actually used, not only where it is browsed.
      void loadTaxonomy().catch(() => { /* tab shows its own empty state */ });
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

/** Assert expertise in a domain — assert_expertise.
 *
 * It lives in the New Claim tab and nowhere else on purpose. An expertise
 * assertion IS a Claim, published into "expertise/<domain>", critiquable
 * through the same typed CritiqueMode machinery as anything else. Giving
 * it a profile-shaped home of its own would present it as a property of
 * the person rather than an assertion they made and can be challenged
 * on — which is the distinction the coordinator's own comment says this
 * function exists to preserve.
 *
 * The WorldlineTrace is generated at submit time rather than chosen.
 * assert_expertise requires the trace to be the caller's own, and a
 * trace is derived entirely from the caller's own source chain, so there
 * is no meaningful choice to offer — only a stale-or-fresh one, and
 * fresh is the honest reading of "evidenced by my history". */
function renderExpertiseForm(): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'expertise-section';

  const toggle = document.createElement('button');
  toggle.className = 'link-button';
  toggle.dataset.testid = 'expertise-toggle';
  toggle.textContent = expertiseFormOpen ? 'Cancel' : 'Assert expertise in a domain';
  toggle.onclick = () => { expertiseFormOpen = !expertiseFormOpen; render(); };
  wrap.appendChild(toggle);
  if (!expertiseFormOpen) return wrap;

  const form = document.createElement('form');
  form.className = 'expertise-form';
  form.dataset.testid = 'expertise-form';

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent =
    'This publishes an ordinary claim about your own engagement in a domain, '
    + 'evidenced by your worldline trace. It is not a credential and confers nothing — '
    + 'anyone can critique it, and everyone will see it marked as self-asserted.';
  form.appendChild(hint);

  const domainLabel = document.createElement('label');
  domainLabel.textContent = 'Domain';
  const domainInput = document.createElement('input');
  domainInput.type = 'text';
  domainInput.required = true;
  domainInput.placeholder = 'e.g. LumbarRehab';
  domainInput.dataset.testid = 'expertise-domain';
  domainLabel.appendChild(domainInput);
  form.appendChild(domainLabel);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.dataset.testid = 'expertise-submit';
  submit.textContent = 'Publish expertise assertion';
  form.appendChild(submit);

  const errorBox = document.createElement('div');
  errorBox.className = 'error-box';
  errorBox.dataset.testid = 'expertise-error';
  errorBox.hidden = true;
  form.appendChild(errorBox);

  const done = document.createElement('p');
  done.className = 'hint';
  done.dataset.testid = 'expertise-done';
  done.hidden = true;
  form.appendChild(done);

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!connection) return;
    errorBox.hidden = true;
    done.hidden = true;
    submit.disabled = true;
    const domain = domainInput.value.trim();
    try {
      const trace = await connection.callZome<Uint8Array>('generate_worldline_trace', {
        period_granularity_secs: 3600,
        expertise_tags: [domain],
        expires_at: null,
      });
      await connection.callZome('assert_expertise', {
        domain, worldline_trace_hash: trace,
      });
      done.hidden = false;
      // Names where it went, because "expertise/<domain>" is a different
      // domain from "<domain>" and a user who does not know that will
      // look for it in the wrong place and conclude it was not published.
      done.textContent =
        `Published into expertise/${domain}. Browse that domain to see it — `
        + 'and so can anyone else, which is the point.';
      domainInput.value = '';
    } catch (err) {
      errorBox.hidden = false;
      errorBox.textContent = err instanceof Error ? err.message : String(err);
    } finally {
      submit.disabled = false;
    }
  };

  wrap.appendChild(form);
  return wrap;
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

type Tab = 'browse' | 'membranes' | 'taxonomy' | 'worldline' | 'new-claim';
let activeTab: Tab = 'browse';

function renderTabs(): HTMLElement {
  const wrap = document.createElement('div');

  const nav = document.createElement('nav');
  nav.className = 'tab-bar';
  const tabs: Array<[Tab, string]> = [
    ['browse', 'Browse'], ['membranes', 'Domains'],
    ['taxonomy', 'Critique Types'], ['worldline', 'Worldline'],
    ['new-claim', 'New Claim'],
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
        : activeTab === 'taxonomy' ? renderTaxonomyTab()
          : activeTab === 'worldline' ? renderWorldlineTab()
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
  card.appendChild(renderAuthorConstitution(claim.entry.author));

  // An expertise assertion is an ordinary Claim and must read as one.
  //
  // §4.4 AGAIN, AND THIS IS THE PLACE IT WOULD BE EASIEST TO BREAK. The
  // coordinator's own comment is explicit that its trace-ownership check
  // is "a courtesy, not an enforced rule" — a client bypassing
  // assert_expertise can cite anyone's WorldlineTrace — and that these
  // claims carry NO standing. A badge that read like a credential would
  // manufacture exactly the credibility signal Invariant #1 declines to
  // compute, and would do it on a field nothing validates. So the marker
  // says what this is (a self-assertion), what it is not (verified), and
  // that it is critiquable like anything else.
  if (claim.entry.semantic_tags.includes('expertise-assertion')) {
    const badge = document.createElement('p');
    badge.className = 'expertise-badge';
    badge.dataset.testid = 'expertise-badge';
    badge.textContent =
      'Self-asserted expertise — not verified by anyone, and carrying no standing. '
      + 'It is an ordinary claim: critique it like any other.';
    card.appendChild(badge);
  }

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

  // The write half of those flags. get_antibody_patterns_for was
  // surfaced; publish_antibody_pattern was not — so this UI could show
  // what others had flagged and gave the practitioner no way to flag
  // anything themselves. §4.2's immune-system account has every agent
  // producing antibodies; a client that only renders other people's
  // makes the reader a spectator of an immune response they are
  // supposed to be part of.
  //
  // WHAT THIS IS NOT, and the microcopy below says so plainly: it is not
  // a report button and there is no moderator behind it. Publishing a
  // pattern removes nothing, hides nothing, and summons nobody — the
  // claim stays exactly as readable afterwards (Invariant #6). It adds
  // one attributable, typed entry saying THIS AGENT recognises THIS
  // structural pattern here. Language implying otherwise would promise
  // an authority the protocol deliberately does not have.
  card.appendChild(renderFlagAffordance(claim));

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
      // Re-read the budget every time a critique panel OPENS — not
      // inside loadCritiques, which the cache check below skips on a
      // re-open. The gate on this panel's form is only as honest as this
      // number, and the limit is a ROLLING WINDOW: a status read at
      // connect time keeps saying "blocked" for as long as the tab stays
      // open, minutes after the window has moved on and the conductor
      // would accept a critique again. A stale block refuses, on the
      // UI's behalf, something the protocol permits — the very failure
      // this gate exists to prevent, inverted. Opening the panel is the
      // moment the number matters, so it is the moment to refresh it.
      void loadFrictionStatus();
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
/** The "flag a structural pattern" affordance: a toggle, and the form it
 * opens. Kept collapsed by default because flagging is the rare act, not
 * the routine one — critiquing content is the ordinary path and should
 * stay visually dominant. That is presentation density, which §4.4
 * explicitly permits adapting; the claim and its existing flags render
 * identically for everyone regardless. */
function renderFlagAffordance(claim: DecodedRecord<Claim>): HTMLElement {
  const key = b64(claim.entryHash);
  const wrap = document.createElement('div');
  wrap.className = 'flag-affordance';

  const toggle = document.createElement('button');
  toggle.className = 'link-button';
  toggle.dataset.testid = 'flag-toggle';
  toggle.textContent = flaggingClaims.has(key) ? 'Cancel' : 'Flag a pattern';
  toggle.onclick = () => {
    if (flaggingClaims.has(key)) flaggingClaims.delete(key);
    else flaggingClaims.add(key);
    render();
  };
  wrap.appendChild(toggle);

  if (!flaggingClaims.has(key)) return wrap;

  const form = document.createElement('form');
  form.className = 'flag-form';
  form.dataset.testid = 'flag-form';

  const note = document.createElement('p');
  note.className = 'hint';
  // Stating the limits is not a disclaimer, it is the accurate
  // description — see the comment at the call site.
  note.textContent =
    'An AntibodyPattern flags a structural or behavioural pattern (spam, a sybil ' +
    'ring, plagiarism) rather than whether the claim is right — that is what a ' +
    'critique is for. It is published under your name, removes nothing, and hides ' +
    'nothing: the claim stays exactly as readable as it is now.';
  form.appendChild(note);

  const kindSelect = document.createElement('select');
  kindSelect.dataset.testid = 'flag-kind';
  for (const kind of ANTIBODY_PATTERN_KINDS) {
    const opt = document.createElement('option');
    opt.value = kind;
    opt.textContent = kind;
    kindSelect.appendChild(opt);
  }
  form.appendChild(kindSelect);

  const rationale = document.createElement('textarea');
  rationale.dataset.testid = 'flag-rationale';
  rationale.placeholder = 'Why this pattern — what you actually observed.';
  // Deliberately NOT `required`, matching renderRetractForm above. The
  // native constraint would block submission with the browser's generic
  // "Please fill out this field", and the whole point of the message the
  // submit handler raises instead is that it says WHY an unexplained
  // flag is useless here. Same reasoning, same shape, in both forms.
  form.appendChild(rationale);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.dataset.testid = 'flag-submit';
  submit.textContent = 'Publish flag';
  form.appendChild(submit);

  const error = document.createElement('div');
  error.className = 'error-box';
  error.dataset.testid = 'flag-error';
  error.hidden = true;
  form.appendChild(error);

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!connection) return;
    error.hidden = true;
    // A rationale is required for the same reason a retraction's is: the
    // record is the point. An untyped, unexplained flag is exactly the
    // flat "downvote" this protocol exists to not have.
    if (!rationale.value.trim()) {
      error.hidden = false;
      error.textContent = 'A rationale is required — an unexplained flag records nothing usable.';
      return;
    }
    submit.disabled = true;
    try {
      // Not gated on friction, for the same reason the reinforce button
      // above is not: publish_antibody_pattern has its own SWO limit
      // (check_antibody_pattern_friction) with no status function
      // exposed to re-derive it from, and §4.5's third rule forbids
      // gating on state this client cannot know.
      await connection.callZome('publish_antibody_pattern', {
        target: claim.entryHash,
        target_type: 'Claim',
        kind: kindSelect.value,
        rationale: rationale.value.trim(),
        author: connection.myAgentPubKey,
        timestamp: nowMicros(),
      });
      flaggingClaims.delete(key);
      // Re-read so the new flag appears exactly as everyone else will
      // see it, rather than as a locally-constructed optimistic copy.
      await loadClaimEpistemicState();
      render();
    } catch (err) {
      error.hidden = false;
      error.textContent = err instanceof Error ? err.message : String(err);
      submit.disabled = false;
    }
  };

  wrap.appendChild(form);
  return wrap;
}

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

        // The write half of the same number. get_effective_conductance
        // was surfaced; reinforce_synaptic_link was not — so this UI
        // could show a connection's strength and offered no way to
        // strengthen it, which is a read-only surface on a read-write
        // protocol. Reinforcement is what conductance is FOR: without
        // it every link decays toward zero on the same half-life, so a
        // client that only reads the number describes a process it
        // gives nobody any way to take part in.
        //
        // Legitimate under §4.4 because reinforcing scores a
        // SynapticLink, never an agent (README.md §2.6), and because it
        // is the user's own attributable act rather than something this
        // client infers on their behalf. It deliberately does NOT
        // reorder the list, for the same reason the conductance display
        // above doesn't.
        const linkHash = linkHashByCritique.get(b64(critique.actionHash));
        if (linkHash) {
          const reinforceBtn = document.createElement('button');
          reinforceBtn.className = 'link-button reinforce-button';
          reinforceBtn.dataset.testid = 'reinforce';
          reinforceBtn.textContent = 'Reinforce';
          reinforceBtn.title =
            'Record that this connection resonates with you. Raises its effective ' +
            'conductance, which decays again over time unless reinforced.';
          // NOT gated on friction, unlike the critique form. Reinforcement
          // has its own SWO limit (check_reinforcement_friction), but the
          // coordinator exposes no status function for it the way
          // get_synaptic_link_friction_status exposes the critique
          // budget — so this UI cannot re-derive the conductor's answer,
          // and §4.5's third rule applies: never gate on unknown state.
          // Guessing would refuse what the protocol permits. The refusal
          // is surfaced honestly below instead, and the coordinator's own
          // message already explains itself ("intentional friction, not a
          // reputation judgment — try again later").
          reinforceBtn.onclick = async () => {
            if (!connection) return;
            reinforceBtn.disabled = true;
            reinforceBtn.textContent = 'Reinforcing…';
            try {
              await connection.callZome('reinforce_synaptic_link', linkHash);
              // Re-read rather than incrementing locally: effective
              // conductance is computed fresh at read time from decay
              // plus every reinforcement, so the conductor's number is
              // the only correct one — and seeing it actually move is
              // the whole point of offering the action.
              await loadConductances(claim, list);
            } catch (err) {
              reinforceBtn.disabled = false;
              reinforceBtn.textContent = 'Reinforce';
              const msg = document.createElement('span');
              msg.className = 'reinforce-error';
              msg.dataset.testid = 'reinforce-error';
              msg.textContent = err instanceof Error ? err.message : String(err);
              item.appendChild(msg);
            }
          };
          item.appendChild(reinforceBtn);
        }

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

  // State-driven affordance surfacing (see the note above renderHeader):
  // every critique creates a SynapticLink, and create_synaptic_link is
  // the ONE coordinator path that spends the SWO budget (verified: it
  // has a single call site, in create_critique). So a spent budget makes
  // this exact form's submit certain to fail, and the UI already knows
  // it — get_synaptic_link_friction_status computes `blocked` from the
  // same count, over the same window, off the same source chain that
  // check_synaptic_link_friction uses to refuse. This is not a guess
  // about what the conductor will do; it is the same derivation.
  //
  // DISABLED AND EXPLAINED, NOT HIDDEN — the distinction matters, and it
  // is the reason this differs from the retract affordance above, which
  // IS hidden. Retraction on someone else's claim is structurally
  // impossible for this agent: offering it would be noise, and its
  // absence tells no lie. A spent budget is this agent's own transient
  // state, five minutes from being false. Hiding the form would conceal
  // a protocol rule the practitioner needs to see in order to plan
  // around it, and README.md §4.4's first constraint is precisely about
  // an interface that adapts while concealing that it is adapting. So
  // the form stays visibly present, visibly unavailable, and says why.
  const blocked = frictionStatus?.blocked === true;
  if (blocked) {
    // Never gate on unknown state: frictionStatus is null when the read
    // failed or has not returned yet, and `?.blocked === true` is false
    // in both cases. Guessing "blocked" from missing information would
    // refuse an action the protocol would have allowed, which is a worse
    // failure than the opaque error this whole change exists to remove.
    submitBtn.disabled = true;
    textarea.disabled = true;
    modeSelect.disabled = true;
    form.classList.add('affordance-blocked');

    const reason = document.createElement('p');
    reason.className = 'affordance-reason';
    reason.dataset.testid = 'critique-blocked-reason';
    const minutes = Math.round((frictionStatus?.window_secs ?? 0) / 60);
    // Same words as the meter in the header, deliberately: the user
    // should recognise the sentence they have been watching deplete,
    // not read a second, differently-worded account of one rule.
    reason.textContent =
      `Critique budget spent — resets within ${minutes} min. ` +
      `This is an absolute limit; nothing lifts it early.`;
    form.appendChild(reason);
  }

  // The species picker — the write half of the taxonomy surface. Without
  // it `species` was hardcoded null at the one place a critique is
  // created, so every species read 0 adoptions forever and the taxonomy
  // was a vocabulary nobody could speak. This is the same read/write
  // asymmetry the reinforcement work closed, in a different subsystem.
  //
  // OPTIONAL BY DESIGN. `Critique.species` is `Option<EntryHash>` in the
  // integrity zome and nothing validates its presence, so requiring one
  // here would be the UI inventing a rule the protocol does not enforce
  // — README.md §4.4's first constraint. It stays a free choice, and
  // "No specific type" is a real, first-class answer rather than a
  // placeholder.
  const speciesSelect = document.createElement('select');
  speciesSelect.dataset.testid = 'critique-species-select';
  const anySpecies = document.createElement('option');
  anySpecies.value = '';
  anySpecies.textContent = 'No specific type';
  speciesSelect.appendChild(anySpecies);
  for (const sp of critiqueSpecies) {
    const opt = document.createElement('option');
    opt.value = b64(sp.entryHash);
    opt.textContent = sp.entry.name;
    speciesSelect.appendChild(opt);
  }
  // Hidden only when the taxonomy is genuinely empty — nothing to pick
  // from is structurally impossible to act on, which is §4.5's rule for
  // hiding rather than disabling. A spent budget disables (above); an
  // empty vocabulary has nothing to offer at all.
  if (critiqueSpecies.length === 0) speciesSelect.hidden = true;
  if (blocked) speciesSelect.disabled = true;

  form.appendChild(modeSelect);
  form.appendChild(speciesSelect);
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
      species: speciesSelect.value
        ? critiqueSpecies.find((sp) => b64(sp.entryHash) === speciesSelect.value)?.entryHash ?? null
        : null,
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
    const next = await connection.callZome<SynapticFrictionStatus>(
      'get_synaptic_link_friction_status', null,
    );
    // Re-render ONLY when the number actually moved.
    //
    // render() rebuilds app.innerHTML wholesale, so every render throws
    // away any DOM the user is currently interacting with — including a
    // half-typed critique. That was tolerable while this read happened
    // once at connect time; it stopped being tolerable when the budget
    // began refreshing whenever a critique panel opens, which is exactly
    // when someone is about to start typing into that panel.
    //
    // Found the expensive way: a live harness filled the critique
    // textarea, this read returned between the fill and the submit, the
    // re-render replaced the textarea with an empty one, and the
    // critique was silently never created — no error, no budget spent,
    // just nothing. A person typing would have seen their text vanish.
    //
    // The deeper flaw is the wholesale rebuild itself, and this does not
    // fix it: loadCritiques and loadConductances still each call
    // render() unconditionally, so the race is narrowed, not closed.
    // Closing it properly is the "local-first in-memory mirror" pattern
    // in README.md §4.5 — render from memory, patch what changed — which
    // is a real piece of work and not this one.
    const changed = frictionStatus === null
      || frictionStatus.recent_count !== next.recent_count
      || frictionStatus.blocked !== next.blocked
      || frictionStatus.limit !== next.limit;
    frictionStatus = next;
    if (changed) render();
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
      linkHashByCritique.set(b64(critique.actionHash), linkHash);
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

// --- Author constitutions ---------------------------------------------

/** Load one author's constitution on request. */
async function loadConstitution(author: Uint8Array) {
  if (!connection) return;
  const key = b64(author);
  try {
    const constitution = await connection.callZome<Constitution | null>(
      'get_agent_constitution', author,
    );
    constitutionByAuthor.set(key, constitution ?? null);
  } catch {
    // Left ABSENT rather than set to null. null is a real answer — "this
    // agent has published no constitution" — and rendering a failed read
    // as that answer would assert something nobody checked.
  }
  render();
}

/** "What this author promises" — get_agent_constitution.
 *
 * Collapsed by default and loaded only when opened. §4.3 is why it
 * exists at all: a claim's status is supposed to emerge from agents
 * cross-checking one another's disclosures, and the promise is the
 * disclosure being checked against. Without it, a methodological
 * critique is one person's opinion of another's method; with it, it is a
 * comparison against something the author put on the record.
 *
 * NOTHING IS INFERRED FROM ITS ABSENCE. An agent who has published no
 * constitution is shown as exactly that, with no adverse framing: there
 * is no protocol rule requiring one, and a UI that made its absence look
 * like a deficiency would be scoring agents on a field the protocol
 * never asked them to fill — §4.4's first constraint, arriving through
 * the back door. */
function renderAuthorConstitution(author: Uint8Array): HTMLElement {
  const key = b64(author);
  const wrap = document.createElement('div');
  wrap.className = 'author-constitution';

  const toggle = document.createElement('button');
  toggle.className = 'link-button';
  toggle.dataset.testid = 'constitution-toggle';
  const open = constitutionOpen.has(key);
  toggle.textContent = open ? 'Hide what this author promises' : 'What this author promises';
  toggle.onclick = () => {
    if (open) constitutionOpen.delete(key);
    else {
      constitutionOpen.add(key);
      if (!constitutionByAuthor.has(key)) void loadConstitution(author);
    }
    render();
  };
  wrap.appendChild(toggle);
  if (!open) return wrap;

  const body = document.createElement('div');
  body.dataset.testid = 'constitution-body';

  if (!constitutionByAuthor.has(key)) {
    body.textContent = 'Loading…';
    wrap.appendChild(body);
    return wrap;
  }

  const constitution = constitutionByAuthor.get(key) ?? null;
  if (constitution === null) {
    const none = document.createElement('p');
    none.className = 'hint';
    none.dataset.testid = 'constitution-none';
    // Neutral by design — see this function's header.
    none.textContent =
      'This author has not published a constitution. Nothing requires one, '
      + 'and its absence says nothing about their claims.';
    body.appendChild(none);
    wrap.appendChild(body);
    return wrap;
  }

  const list = document.createElement('ul');
  list.className = 'promise-list';
  list.dataset.testid = 'author-promises';
  for (const promise of constitution.promises) {
    const li = document.createElement('li');
    li.textContent = promise.modality
      ? `${promise.action} — in ${promise.domain}, for ${promise.modality} critique`
      : `${promise.action} — in ${promise.domain}`;
    list.appendChild(li);
  }
  body.appendChild(list);

  const meta = document.createElement('p');
  meta.className = 'hint';
  meta.dataset.testid = 'constitution-meta';
  // Stated because a promise is a commitment made AT a time, and a
  // reader comparing conduct against it needs to know which window it
  // covers. get_agent_constitution already filters out expired ones.
  meta.textContent = constitution.expires_at
    ? `Published ${new Date(constitution.published_at * 1000).toISOString().slice(0, 10)}, expires ${new Date(constitution.expires_at * 1000).toISOString().slice(0, 10)}.`
    : `Published ${new Date(constitution.published_at * 1000).toISOString().slice(0, 10)}. No expiry.`;
  body.appendChild(meta);

  wrap.appendChild(body);
  return wrap;
}

// --- Trust lenses -----------------------------------------------------

/** Re-read a membrane's discourse health THROUGH the user's aimed lens,
 * and check each member against it.
 *
 * The unfiltered read in healthByMembrane is deliberately left alone.
 * Replacing it would make the lens's effect invisible, which §4.4 treats
 * as presenting a filtered result as neutral even when the filter is
 * disclosed — the number would simply be different and nobody could say
 * by how much. */
async function applyLens(membrane: DecodedRecord<Membrane>, policy: AttestationPolicy) {
  if (!connection) return;
  const conn = connection;
  const key = b64(membrane.entryHash);
  lensByMembrane.set(key, policy);
  lensBuilderOpen.delete(key);
  render();

  try {
    const health = await conn.callZome<DiscourseHealth>('get_discourse_health', {
      membrane: membrane.entryHash,
      attestation_policy: policy,
      conductance_policy: null,
    });
    lensedHealthByMembrane.set(key, health);
  } catch {
    // Left absent: the card says the lensed read failed rather than
    // showing the unfiltered figure as though it were the lensed one.
  }
  render();

  const members = membersByMembrane.get(key) ?? [];
  await Promise.all(members.map(async (member) => {
    try {
      const attested = await conn.callZome<boolean>('is_agent_attested', {
        candidate: member,
        membrane: membrane.entryHash,
        policy,
      });
      attestedByMembraneAgent.set(`${key}|${b64(member)}`, attested);
    } catch {
      // Absent rather than false — see attestedByMembraneAgent.
    }
  }));
  render();
}

/** Remove the lens entirely and return to the neutral read. */
function clearLens(membrane: DecodedRecord<Membrane>) {
  const key = b64(membrane.entryHash);
  lensByMembrane.delete(key);
  lensedHealthByMembrane.delete(key);
  for (const k of [...attestedByMembraneAgent.keys()]) {
    if (k.startsWith(`${key}|`)) attestedByMembraneAgent.delete(k);
  }
  render();
}

/** The banner shown whenever a lens is active. This is the "be able to
 * see it" half of §4.4's rule, and it is not collapsible on purpose. */
function renderLensBanner(membrane: DecodedRecord<Membrane>, policy: AttestationPolicy): HTMLElement {
  const key = b64(membrane.entryHash);
  const banner = document.createElement('div');
  banner.className = 'lens-banner';
  banner.dataset.testid = 'lens-banner';

  const text = document.createElement('p');
  text.className = 'lens-banner-text';
  const roots = policy.require_attestation_from?.length ?? 0;
  const depth = policy.max_attestation_depth ?? 1;
  text.textContent =
    `Your trust lens is applied: at least ${policy.min_attestations} attester`
    + `${policy.min_attestations === 1 ? '' : 's'} from ${roots} chosen root`
    + `${roots === 1 ? '' : 's'}, within ${depth} hop${depth === 1 ? '' : 's'}. `
    + 'This is your question, not the protocol\u2019s verdict — someone else\u2019s '
    + 'lens would give a different answer, and the unfiltered figures are shown beside it.';
  banner.appendChild(text);

  const clear = document.createElement('button');
  clear.className = 'link-button';
  clear.dataset.testid = 'lens-clear';
  clear.textContent = 'Remove lens';
  clear.onclick = () => clearLens(membrane);
  banner.appendChild(clear);

  const lensed = lensedHealthByMembrane.get(key);
  const plain = healthByMembrane.get(key);
  if (lensed && plain) {
    const delta = document.createElement('p');
    delta.className = 'lens-delta';
    delta.dataset.testid = 'lens-delta';
    // What the lens REMOVED, stated as a difference rather than only as
    // a new total. A total on its own is exactly as unreadable as no
    // disclosure at all.
    //
    // CRITIQUES ONLY, AND SAID SO. get_discourse_health applies an
    // AttestationPolicy when tallying critiques and never when counting
    // claims — read the loop in its coordinator implementation. An
    // earlier version of this banner printed "Claims N → N" beside the
    // critique figure, which was true only in the sense that the two
    // numbers were equal: it implied the lens had considered claims and
    // spared them, when the lens never looks at them at all. Stating the
    // scope of a filter incorrectly is the same §4.4 failure as hiding
    // it, so the claim total is named here as explicitly UNFILTERED.
    const removed = plain.total_critiques - lensed.total_critiques;
    delta.textContent =
      `Critiques ${plain.total_critiques} \u2192 ${lensed.total_critiques}`
      + (removed > 0 ? ` — your lens sets aside ${removed}.` : ' — your lens sets none aside.')
      + ` Claims (${plain.total_claims}) are not filtered by a trust lens; only critiques are.`;
    banner.appendChild(delta);
  } else if (!lensed) {
    const pending = document.createElement('p');
    pending.className = 'lens-delta';
    pending.dataset.testid = 'lens-pending';
    pending.textContent = 'The lensed read has not returned. The figures below are unfiltered.';
    banner.appendChild(pending);
  }

  return banner;
}

/** The builder. Roots are chosen from this membrane's own members —
 * the only agent set this UI can enumerate at all, and the one whose
 * membership is already meaningful here. */
function renderLensBuilder(membrane: DecodedRecord<Membrane>): HTMLElement {
  const key = b64(membrane.entryHash);
  const form = document.createElement('form');
  form.className = 'lens-builder';
  form.dataset.testid = 'lens-builder';

  const intro = document.createElement('p');
  intro.className = 'hint';
  intro.textContent =
    'A trust lens is a question you ask, not a ranking the protocol keeps. '
    + 'Choose whose attestation you count; everything stays visible underneath.';
  form.appendChild(intro);

  const members = membersByMembrane.get(key) ?? [];
  const rootBox = document.createElement('div');
  rootBox.className = 'lens-roots';
  const checkboxes: Array<[HTMLInputElement, Uint8Array]> = [];
  for (const member of members) {
    const label = document.createElement('label');
    label.className = 'lens-root';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.testid = 'lens-root-checkbox';
    cb.dataset.agent = b64(member);
    label.appendChild(cb);
    const name = document.createElement('span');
    name.textContent = connection && b64(member) === b64(connection.myAgentPubKey)
      ? `${short(member)} (you)` : short(member);
    label.appendChild(name);
    rootBox.appendChild(label);
    checkboxes.push([cb, member]);
  }
  if (members.length === 0) {
    const none = document.createElement('p');
    none.className = 'hint';
    none.textContent = 'No members are loaded for this domain yet, so there is nobody to trust as a root.';
    rootBox.appendChild(none);
  }
  form.appendChild(rootBox);

  const minInput = document.createElement('input');
  minInput.type = 'number';
  minInput.min = '1';
  minInput.value = '1';
  minInput.dataset.testid = 'lens-min-attestations';
  const minLabel = document.createElement('label');
  minLabel.textContent = 'Attesters required';
  minLabel.appendChild(minInput);
  form.appendChild(minLabel);

  const depthInput = document.createElement('input');
  depthInput.type = 'number';
  depthInput.min = '1';
  depthInput.max = '5';
  depthInput.value = '1';
  depthInput.dataset.testid = 'lens-depth';
  const depthLabel = document.createElement('label');
  depthLabel.textContent = 'Hops of transitive trust';
  depthLabel.appendChild(depthInput);
  form.appendChild(depthLabel);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.dataset.testid = 'lens-apply';
  submit.textContent = 'Apply this lens';
  form.appendChild(submit);

  const errorBox = document.createElement('div');
  errorBox.className = 'error-box';
  errorBox.dataset.testid = 'lens-error';
  errorBox.hidden = true;
  form.appendChild(errorBox);

  form.onsubmit = (e) => {
    e.preventDefault();
    const roots = checkboxes.filter(([cb]) => cb.checked).map(([, agent]) => agent);
    if (roots.length === 0) {
      // Refused rather than silently treated as "no restriction". An
      // empty root set means require_attestation_from: null, under which
      // is_agent_attested returns true for everyone — a lens that looks
      // applied and filters nothing is worse than no lens at all.
      errorBox.hidden = false;
      errorBox.textContent =
        'Choose at least one root. A lens with no roots would be applied and filter nothing, '
        + 'which reads as a verdict while being none.';
      return;
    }
    errorBox.hidden = true;
    void applyLens(membrane, {
      require_attestation_from: roots,
      min_attestations: Math.max(1, parseInt(minInput.value, 10) || 1),
      max_attestation_depth: Math.max(1, parseInt(depthInput.value, 10) || 1),
    });
  };

  return form;
}

/** Vouch for an agent within this membrane — grant_attestation.
 *
 * DELIBERATELY NOT GATED ON BUDGET. Attestation grants are rate-limited
 * by check_attestation_grant_friction, but the coordinator exposes NO
 * status read for it (unlike get_synaptic_link_friction_status), so this
 * client cannot re-derive the conductor's answer. §4.5's third rule is
 * explicit that an affordance must never be gated on unknown state:
 * guessing "blocked" would refuse what the protocol would have allowed.
 * A refusal surfaces as the conductor's own message instead. */
async function vouchFor(membrane: DecodedRecord<Membrane>, candidate: Uint8Array, onError: (m: string) => void) {
  if (!connection) return;
  try {
    const myMembership = await connection.callZome<Uint8Array | null>(
      'get_my_membership_action', membrane.entryHash,
    );
    if (!myMembership) {
      // Tenure is enforced DHT-side; saying so plainly beats letting
      // validation reject it with a message about link tags.
      onError('You must have joined this domain before you can vouch in it.');
      return;
    }
    await connection.callZome('grant_attestation', {
      candidate,
      membrane: membrane.entryHash,
      my_membership_action: myMembership,
    });
    const key = b64(membrane.entryHash);
    const policy = lensByMembrane.get(key);
    // A vouch changes who passes a lens, so re-run it if one is active.
    if (policy) await applyLens(membrane, policy);
    else render();
  } catch (err) {
    onError(err instanceof Error ? err.message : String(err));
  }
}

// --- Worldline tab ----------------------------------------------------

async function loadWorldline() {
  if (!connection) return;
  const conn = connection;
  worldlineLoaded = true;
  try {
    myWorldline = await conn.callZome<WorldlineTrace | null>(
      'get_agent_worldline_trace', conn.myAgentPubKey,
    ) ?? null;
  } catch {
    myWorldline = null;
  }
  render();
  // The checkpoint hash is what verify_trace_checksum needs, and the
  // trace itself does not carry its own ActionHash.
  try {
    const checkpoint = await conn.callZome<Uint8Array | null>(
      'get_my_latest_worldline_checkpoint', null,
    );
    if (checkpoint) {
      worldlineChecksumOk = await conn.callZome<boolean>('verify_trace_checksum', checkpoint);
    }
  } catch {
    // Left null — "not checked" is not "failed", and rendering a failed
    // read as a failed checksum would accuse the trace of being corrupt.
  }
  render();
}

/** Generate a fresh trace over this agent's own chain. */
async function makeWorldline(onError: (m: string) => void) {
  if (!connection) return;
  try {
    await connection.callZome('generate_worldline_trace', {
      period_granularity_secs: 3600,
      expertise_tags: [],
      expires_at: null,
    });
    worldlineChecksumOk = null;
    resonanceProbe = null;
    sampledPeriods.clear();
    openPeriods.clear();
    await loadWorldline();
  } catch (err) {
    onError(err instanceof Error ? err.message : String(err));
  }
}

/** Probe the trace vector for a domain tag — the approximate half. */
async function probeResonance(tag: string) {
  if (!connection || !myWorldline) return;
  const conn = connection;
  try {
    const hits = await conn.callZome<PeriodResonance[]>('query_worldline_resonance', {
      agent: conn.myAgentPubKey,
      domain_tag: tag,
      // period_boundaries' length is the natural bound; the function
      // deliberately never reads that field itself, so the caller
      // supplies it. Asking for more than exist wastes work and invites
      // hits at indices with no boundary to check them against.
      max_periods: myWorldline.period_boundaries.length,
    });
    resonanceProbe = { tag, hits };
  } catch {
    resonanceProbe = { tag, hits: [] };
  }
  render();
}

/** Open one period's real records — the "check the hint" affordance. */
async function samplePeriod(index: number) {
  if (!connection || !myWorldline) return;
  const boundary = myWorldline.period_boundaries[index];
  if (!boundary) return;
  try {
    const records = await connection.callZome<any[]>('sample_period', boundary);
    sampledPeriods.set(index, records.length);
  } catch {
    // absent, not zero
  }
  render();
}

function renderWorldlineTab(): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'worldline-tab';

  const intro = document.createElement('p');
  intro.className = 'tab-intro';
  intro.dataset.testid = 'worldline-intro';
  intro.textContent =
    'Your own history, compressed into one vector and indexed by time. '
    + 'This is an index of when you worked, never a reading of what you said — '
    + 'nothing here scores a claim, an agent, or you.';
  wrap.appendChild(intro);

  if (!worldlineLoaded) {
    void loadWorldline();
    const loading = document.createElement('p');
    loading.className = 'hint';
    loading.textContent = 'Reading your worldline…';
    wrap.appendChild(loading);
    return wrap;
  }

  const errBox = document.createElement('div');
  errBox.className = 'error-box';
  errBox.dataset.testid = 'worldline-error';
  errBox.hidden = true;

  const makeBtn = document.createElement('button');
  makeBtn.className = 'secondary';
  makeBtn.dataset.testid = 'worldline-generate';
  makeBtn.textContent = myWorldline ? 'Regenerate from my chain' : 'Generate my worldline';
  makeBtn.onclick = () => {
    errBox.hidden = true;
    void makeWorldline((m) => { errBox.hidden = false; errBox.textContent = m; });
  };
  wrap.appendChild(makeBtn);
  wrap.appendChild(errBox);

  if (!myWorldline) {
    const none = document.createElement('p');
    none.className = 'hint';
    none.dataset.testid = 'worldline-none';
    none.textContent =
      'You have no worldline yet. Generating one scans your own source chain and '
      + 'compresses it — it publishes nothing about anyone else, and reads nothing '
      + 'from anyone else.';
    wrap.appendChild(none);
    return wrap;
  }

  // --- The EXACT half, first and unconditionally ----------------------
  const exact = document.createElement('div');
  exact.className = 'worldline-exact';
  exact.dataset.testid = 'worldline-exact';

  const exactHead = document.createElement('h3');
  exactHead.textContent = 'Your periods — the exact record';
  exact.appendChild(exactHead);

  const integrity = document.createElement('p');
  integrity.className = 'hint';
  integrity.dataset.testid = 'worldline-checksum';
  integrity.textContent = worldlineChecksumOk === true
    ? 'Checksum verifies — this trace is intact.'
    : worldlineChecksumOk === false
      ? 'Checksum does NOT verify — this trace has been altered since it was written.'
      : 'Checksum not checked.';
  exact.appendChild(integrity);

  if (myWorldline.period_boundaries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.dataset.testid = 'worldline-no-periods';
    empty.textContent =
      'This trace covers no periods — your chain had nothing to compress when it was made. '
      + 'That is an empty answer, not a failure.';
    exact.appendChild(empty);
  } else {
    const list = document.createElement('ol');
    list.className = 'period-list';
    list.dataset.testid = 'period-list';
    myWorldline.period_boundaries.forEach((b, i) => {
      const li = document.createElement('li');
      li.className = 'period-row';
      li.dataset.period = String(i);

      const when = document.createElement('span');
      when.className = 'period-when';
      when.textContent = `${new Date(b.start_time * 1000).toISOString().slice(0, 16).replace('T', ' ')} · ${b.domain_tag}`;
      li.appendChild(when);

      const count = document.createElement('span');
      count.className = 'period-count';
      count.dataset.testid = 'period-count';
      count.textContent = `${b.entry_count} ${b.entry_count === 1 ? 'entry' : 'entries'}`;
      li.appendChild(count);

      // sample_period is what turns any hint about this window into
      // something checkable against the chain itself.
      const open = document.createElement('button');
      open.className = 'link-button';
      open.dataset.testid = 'period-sample';
      const sampled = sampledPeriods.get(i);
      open.textContent = openPeriods.has(i) && sampled !== undefined
        ? `${sampled} record${sampled === 1 ? '' : 's'} in this window`
        : 'Show what is in this window';
      open.onclick = () => {
        openPeriods.add(i);
        if (!sampledPeriods.has(i)) void samplePeriod(i);
        else render();
      };
      li.appendChild(open);
      list.appendChild(li);
    });
    exact.appendChild(list);
  }
  wrap.appendChild(exact);

  // --- The APPROXIMATE half, layered over it --------------------------
  wrap.appendChild(renderResonanceProbe());
  return wrap;
}

/** The resonance probe. Everything here is framed as a hint because the
 * coordinator says it is one; the value of the screen is that each hint
 * lands next to the exact period it points at. */
function renderResonanceProbe(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'resonance';

  const head = document.createElement('h3');
  head.textContent = 'Probe by domain — every period, ranked, approximate';
  wrap.appendChild(head);

  const caveat = document.createElement('p');
  caveat.className = 'hint';
  caveat.dataset.testid = 'resonance-caveat';
  // WHAT THIS LIST IS, STATED PLAINLY, because the shape is not what a
  // reader assumes. query_worldline_resonance scores EVERY period index
  // and sorts them — it applies no threshold and filters nothing, so a
  // probe for a tag with no relationship to this chain still returns a
  // full ranked list, just with low scores throughout. Rendering that
  // identically to a set of matches would let a meaningless probe read
  // as findings, which is the "truth engine" reading README §2.5
  // forbids, arriving through presentation rather than through the
  // number. Found by probing a nonsense tag and getting a confident-
  // looking list back.
  caveat.textContent =
    'Unbinding is lossy by construction, and this ranks every one of your periods '
    + 'rather than selecting matches — there is no threshold, so a tag unrelated to '
    + 'your work still returns a full list, just with low scores. A high score is a '
    + 'hint worth checking, not a claim of fact: the periods above are the exact '
    + 'answer, and every row below points at one you can open.';
  wrap.appendChild(caveat);

  const form = document.createElement('form');
  form.className = 'resonance-form';
  form.dataset.testid = 'resonance-form';
  const input = document.createElement('input');
  input.type = 'text';
  input.required = true;
  input.placeholder = 'Domain tag, e.g. LumbarRehab';
  input.dataset.testid = 'resonance-tag';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.dataset.testid = 'resonance-submit';
  submit.textContent = 'Probe';
  form.append(input, submit);
  form.onsubmit = (e) => { e.preventDefault(); void probeResonance(input.value.trim()); };
  wrap.appendChild(form);

  if (!resonanceProbe) return wrap;

  if (resonanceProbe.hits.length === 0) {
    // Three distinct causes — no trace, an empty payload, a foreign
    // binding key — and the coordinator returns empty rather than
    // erroring for all of them, calling both "nothing resonates" and
    // "nothing to resonate with" legitimate answers. So this must not
    // read as a failure.
    const none = document.createElement('p');
    none.className = 'hint';
    none.dataset.testid = 'resonance-empty';
    // The empty return has exactly four causes in the coordinator, and
    // "your tag matched nothing" is NOT among them — every period is
    // always scored. An empty list means there was nothing to resonate
    // WITH: no trace, a null payload, or a binding key this build cannot
    // interpret. Wording it as a failed search would describe a
    // mechanism that does not exist.
    none.textContent =
      `No periods came back for "${resonanceProbe.tag}". This is not a failed match — `
      + 'every period is always scored — it means there was nothing to probe: no trace, '
      + 'a trace with nothing superposed into it, or one written under a different '
      + 'binding scheme. An answer, not an error.';
    wrap.appendChild(none);
    return wrap;
  }

  const list = document.createElement('ul');
  list.className = 'resonance-list';
  list.dataset.testid = 'resonance-list';
  for (const hit of resonanceProbe.hits) {
    const li = document.createElement('li');
    li.className = 'resonance-row';
    li.dataset.period = String(hit.period_index);

    const label = document.createElement('span');
    const boundary = myWorldline?.period_boundaries[hit.period_index];
    // Paired with the EXACT boundary it points at. A rank with no
    // referent is the "truth engine" reading §2.5 forbids; a rank
    // beside the real window is a lead.
    label.textContent = boundary
      ? `Period ${hit.period_index} — ${boundary.domain_tag}, ${boundary.entry_count} entries`
      : `Period ${hit.period_index} — no boundary recorded at this index`;
    li.appendChild(label);

    const score = document.createElement('span');
    score.className = 'resonance-score';
    score.dataset.testid = 'resonance-score';
    score.textContent = `~${hit.similarity.toFixed(2)}`;
    score.title = 'Approximate similarity from unbinding — a hint, not a measurement';
    li.appendChild(score);

    list.appendChild(li);
  }
  wrap.appendChild(list);
  return wrap;
}

// --- Critique taxonomy tab -------------------------------------------

/** The whole taxonomy, then each species' live adoption count.
 *
 * Two reads, not one, because the protocol deliberately offers no
 * combined "species with counts" call (see the note on critiqueSpecies).
 * The counts are fetched per species and each is caught on its own, the
 * same degradation rule the claim badges and membrane aggregates use: a
 * species whose count read fails still lists, showing that its adoption
 * is unavailable rather than silently showing zero. */
async function loadTaxonomy() {
  if (!connection) return;
  markDone('viewed-taxonomy');
  const records = await connection.callZome<any[]>('get_all_critique_species', null);
  critiqueSpecies = decodeRecords<CritiqueSpecies>(records);
  adoptionBySpecies.clear();
  render();
  void loadAdoptionCounts();
}

async function loadAdoptionCounts() {
  if (!connection) return;
  const conn = connection;
  await Promise.all(critiqueSpecies.map(async (species) => {
    try {
      // The count is keyed by ENTRY hash, not action hash — the link base
      // is the species entry itself (CritiqueToSpecies), and passing the
      // action hash returns a confident, wrong zero rather than an error.
      const count = await conn.callZome<number>(
        'get_critique_species_adoption_count', species.entryHash,
      );
      adoptionBySpecies.set(b64(species.entryHash), count);
    } catch {
      // Left absent rather than set to 0 — see adoptionBySpecies.
    }
  }));
  render();
}

/** Children of a species, by entry hash. The DHT has SpeciesToParent
 * links, but there is no coordinator read that walks them, so the tree
 * is reassembled client-side from each species' own parent_species
 * field — which every species carries and which validation already
 * constrains. Purely structural: no ordering judgement is applied. */
function childrenOf(parentKey: string | null): DecodedRecord<CritiqueSpecies>[] {
  return critiqueSpecies.filter((s) => {
    const parent = s.entry.parent_species;
    return parentKey === null ? !parent : !!parent && b64(parent) === parentKey;
  });
}

/** The caller's own critiques, tallied by CritiqueMode.
 *
 * One read per mode, because get_critiques_by_mode takes one mode. Five
 * source-chain queries is cheap; the reason it is not a single call is
 * that the protocol offers no "all modes at once" read, and inventing a
 * client-side aggregate over five chain-local reads would not make the
 * result any less chain-local. */
async function loadMyCritiquesByMode() {
  if (!connection) return;
  const conn = connection;
  await Promise.all(CRITIQUE_MODES.map(async (mode) => {
    try {
      const records = await conn.callZome<any[]>('get_critiques_by_mode', mode);
      myCritiquesByMode.set(mode, decodeRecords<Critique>(records));
    } catch {
      // Absent, not zero — see the note on myCritiquesByMode.
    }
  }));
  render();
}

/** The fixed axis of critique, beside the open one.
 *
 * CritiqueMode is the protocol's five-variant, non-extensible axis;
 * CritiqueSpecies is the domain-authored one above. Showing them on one
 * screen is the only place the difference between the two is legible.
 *
 * EVERY LABEL HERE SAYS "YOUR OWN", AND THAT IS NOT MODESTY. SPEC §10.0
 * specifies get_critiques_by_mode as chain-local: it returns the
 * caller's own critiques and cannot see anyone else's. A heading reading
 * "Logical critiques" over that data would be false, and falser still in
 * its empty state — a practitioner would read zero as "nobody critiques
 * this way" when it means "I have not". This is the same read-scope
 * honesty the read-scope harness exists to defend, applied at the point
 * where the number is rendered rather than where it is fetched. */
function renderModeBreakdown(): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'mode-breakdown';

  const toggle = document.createElement('button');
  toggle.className = 'link-button';
  toggle.dataset.testid = 'mode-breakdown-toggle';
  toggle.textContent = modeBreakdownOpen
    ? 'Hide your critiques by mode' : 'Show your own critiques by mode';
  toggle.onclick = () => {
    modeBreakdownOpen = !modeBreakdownOpen;
    if (modeBreakdownOpen && myCritiquesByMode.size === 0) void loadMyCritiquesByMode();
    render();
  };
  wrap.appendChild(toggle);
  if (!modeBreakdownOpen) return wrap;

  const scope = document.createElement('p');
  scope.className = 'hint';
  scope.dataset.testid = 'mode-scope-note';
  scope.textContent =
    'These are your own critiques only. This read is chain-local by specification '
    + '(SPEC §10.0) — it cannot see anyone else\u2019s, so a zero here means you have '
    + 'not used that mode, not that nobody has.';
  wrap.appendChild(scope);

  const list = document.createElement('ul');
  list.className = 'mode-list';
  list.dataset.testid = 'mode-list';
  for (const mode of CRITIQUE_MODES) {
    const li = document.createElement('li');
    li.className = 'mode-row';
    li.dataset.mode = mode;

    const name = document.createElement('span');
    name.textContent = mode;
    li.appendChild(name);

    const count = document.createElement('span');
    count.className = 'mode-count';
    count.dataset.testid = 'mode-count';
    const records = myCritiquesByMode.get(mode);
    if (records) {
      count.textContent = records.length === 1
        ? 'you have written 1' : `you have written ${records.length}`;
    } else {
      count.textContent = 'not loaded';
      count.classList.add('unknown');
    }
    li.appendChild(count);
    list.appendChild(li);
  }
  wrap.appendChild(list);
  return wrap;
}

function renderTaxonomyTab(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'taxonomy-tab';

  const intro = document.createElement('p');
  intro.className = 'tab-intro';
  intro.textContent =
    'The vocabulary of critique this community has authored. A critique '
    + 'mode is fixed by the protocol; a species is not — anyone may propose one, '
    + 'and it earns standing only by being used.';
  wrap.appendChild(intro);

  // The fixed axis first, then the open one — a reader needs to know
  // which of the two they are looking at, and the fixed one is the
  // shorter, more familiar list.
  wrap.appendChild(renderModeBreakdown());

  const proposeBtn = document.createElement('button');
  proposeBtn.className = 'secondary';
  proposeBtn.dataset.testid = 'propose-species-toggle';
  proposeBtn.textContent = proposingSpecies ? 'Cancel' : 'Propose a critique type';
  proposeBtn.onclick = () => { proposingSpecies = !proposingSpecies; render(); };
  wrap.appendChild(proposeBtn);
  if (proposingSpecies) wrap.appendChild(renderProposeSpeciesForm());

  if (critiqueSpecies.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.dataset.testid = 'taxonomy-empty';
    empty.textContent =
      'No critique types have been proposed yet. A domain template '
      + '(domains/climate.json, domains/nutrition.json) seeds a set, or propose one above.';
    wrap.appendChild(empty);
    return wrap;
  }

  const list = document.createElement('div');
  list.className = 'species-tree';
  list.dataset.testid = 'species-tree';
  // Roots first, each followed by its own children — taxonomy order, not
  // adoption order. See the note on critiqueSpecies for why that is a
  // constraint rather than a default.
  for (const root of childrenOf(null)) {
    list.appendChild(renderSpeciesCard(root, 0));
    for (const child of childrenOf(b64(root.entryHash))) {
      list.appendChild(renderSpeciesCard(child, 1));
    }
  }
  wrap.appendChild(list);
  return wrap;
}

function renderSpeciesCard(species: DecodedRecord<CritiqueSpecies>, depth: number): HTMLElement {
  const card = document.createElement('article');
  card.className = depth > 0 ? 'species-card child' : 'species-card';
  card.dataset.testid = 'species-card';
  card.dataset.species = species.entry.name;

  const head = document.createElement('div');
  head.className = 'species-head';

  const name = document.createElement('h3');
  name.className = 'species-name';
  name.textContent = species.entry.name;
  head.appendChild(name);

  // The count is stated as a fact about this species, never as a rank.
  // "adoption unavailable" and "0 critiques" are different answers and
  // are rendered differently on purpose.
  const key = b64(species.entryHash);
  const adoption = document.createElement('span');
  adoption.className = 'species-adoption';
  adoption.dataset.testid = 'species-adoption';
  if (adoptionBySpecies.has(key)) {
    const n = adoptionBySpecies.get(key)!;
    adoption.textContent = n === 1 ? 'used by 1 critique' : `used by ${n} critiques`;
  } else {
    adoption.textContent = 'adoption unavailable';
    adoption.classList.add('unavailable');
  }
  head.appendChild(adoption);
  card.appendChild(head);

  if (species.entry.required_evidence.length > 0) {
    const req = document.createElement('ul');
    req.className = 'species-evidence';
    const label = document.createElement('li');
    label.className = 'species-evidence-label';
    label.textContent = 'A critique of this type must cite:';
    req.appendChild(label);
    for (const item of species.entry.required_evidence) {
      const li = document.createElement('li');
      li.textContent = item;
      req.appendChild(li);
    }
    card.appendChild(req);
  }

  const proposer = document.createElement('p');
  proposer.className = 'species-proposer';
  proposer.textContent = `proposed by ${short(species.entry.proposer)}`;
  card.appendChild(proposer);

  return card;
}

function renderProposeSpeciesForm(): HTMLElement {
  const form = document.createElement('form');
  form.className = 'propose-species-form';
  form.dataset.testid = 'propose-species-form';

  const nameInput = document.createElement('input');
  nameInput.placeholder = 'Name, e.g. SampleSizeCritique';
  nameInput.required = true;
  nameInput.dataset.testid = 'species-name-input';

  // Parent is optional: a species may be a root of its own. Only roots
  // are offered, so the tree stays the two levels the render walks.
  const parentSelect = document.createElement('select');
  parentSelect.dataset.testid = 'species-parent-select';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'No parent (a new root type)';
  parentSelect.appendChild(none);
  for (const root of childrenOf(null)) {
    const opt = document.createElement('option');
    opt.value = b64(root.entryHash);
    opt.textContent = `Child of ${root.entry.name}`;
    parentSelect.appendChild(opt);
  }

  const evidenceInput = document.createElement('input');
  evidenceInput.placeholder = 'Evidence a critique of this type must cite (one per line, optional)';
  evidenceInput.dataset.testid = 'species-evidence-input';

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Propose';
  const errorBox = document.createElement('div');
  errorBox.className = 'error-box';
  errorBox.hidden = true;

  form.append(nameInput, parentSelect, evidenceInput, submit, errorBox);

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!connection) return;
    errorBox.hidden = true;
    submit.disabled = true;
    const parentKey = parentSelect.value;
    const parent = parentKey
      ? critiqueSpecies.find((sp) => b64(sp.entryHash) === parentKey)?.entryHash ?? null
      : null;
    try {
      await connection.callZome('create_critique_species', {
        name: nameInput.value,
        parent_species: parent,
        required_evidence: evidenceInput.value
          .split('\n').map((l) => l.trim()).filter((l) => l.length > 0),
        proposer: connection.myAgentPubKey,
        created_at: nowMicros(),
      });
      proposingSpecies = false;
      await loadTaxonomy();
    } catch (err) {
      errorBox.hidden = false;
      errorBox.textContent = err instanceof Error ? err.message : String(err);
    } finally {
      submit.disabled = false;
    }
  };

  return form;
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
  /** The lens this user has aimed at this membrane, if any. Undefined is
   * the normal, neutral state and stays that way until they choose. */
  const activeLens = lensByMembrane.get(key);
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

    // Per-member attestation under the active lens, and the vouch
    // affordance. Both live here rather than in the lens builder because
    // "is this person attested" is a fact about a member, and the
    // builder is where the question gets asked, not answered.
    if (joined || activeLens) {
      const list = document.createElement('ul');
      list.className = 'member-list';
      list.dataset.testid = 'member-list';
      if (joined) {
        // DISCLOSED, NOT GATED. Vouching is bounded by two protocol
        // rules — a membership-tenure bar and a rolling grant budget —
        // and the coordinator exposes a status read for NEITHER, unlike
        // get_synaptic_link_friction_status. §4.5's third rule then
        // settles it: never gate on unknown state, because guessing
        // "blocked" refuses what the protocol would have allowed.
        //
        // So the button stays live and the cost is stated up front, which
        // is what stops a refusal from arriving as a surprise. The shape
        // of the rule is named and the NUMBERS deliberately are not: the
        // integrity zome calls its 30-day bar "a placeholder scale, not a
        // value derived from anything; tunable", so a figure copied into
        // this sentence would silently become a lie the day it is tuned.
        // The conductor's own refusal carries the specifics.
        const cost = document.createElement('li');
        cost.className = 'member-cost-note';
        cost.dataset.testid = 'vouch-cost-note';
        cost.textContent =
          'Vouching is deliberately expensive: it needs established membership here, '
          + 'and only a few vouches are possible per week. A refusal will say which limit you met.';
        list.appendChild(cost);
      }
      for (const member of members) {
        const li = document.createElement('li');
        li.className = 'member-row';
        li.dataset.agent = b64(member);
        const who = document.createElement('span');
        who.textContent = b64(member) === me ? `${short(member)} (you)` : short(member);
        li.appendChild(who);

        if (activeLens) {
          const verdict = attestedByMembraneAgent.get(`${key}|${b64(member)}`);
          const badge = document.createElement('span');
          badge.className = 'attested-badge';
          badge.dataset.testid = 'attested-badge';
          if (verdict === true) {
            badge.textContent = 'passes your lens';
          } else if (verdict === false) {
            badge.textContent = 'does not pass your lens';
            badge.classList.add('not-attested');
          } else {
            // Not checked, or the read failed. Rendered as unknown
            // rather than as a negative: "we did not ask" and "the
            // answer was no" are different claims.
            badge.textContent = 'not checked';
            badge.classList.add('unknown');
          }
          li.appendChild(badge);
        }

        if (joined && b64(member) !== me) {
          const vouchBtn = document.createElement('button');
          vouchBtn.className = 'link-button';
          vouchBtn.dataset.testid = 'vouch';
          vouchBtn.textContent = 'Vouch';
          const err = document.createElement('span');
          err.className = 'error-box';
          err.dataset.testid = 'vouch-error';
          err.hidden = true;
          vouchBtn.onclick = () => {
            err.hidden = true;
            void vouchFor(membrane, member, (m) => { err.hidden = false; err.textContent = m; });
          };
          li.appendChild(vouchBtn);
          li.appendChild(err);
        }
        list.appendChild(li);
      }
      card.appendChild(list);
    }
  }

  // --- Trust lens ------------------------------------------------------
  // Off unless this user turned it on. §4.4: the filter must be chosen,
  // and visible while it applies.
  const lensRow = document.createElement('div');
  lensRow.className = 'lens-row';
  const lensToggle = document.createElement('button');
  lensToggle.className = 'link-button';
  lensToggle.dataset.testid = 'lens-toggle';
  lensToggle.textContent = lensBuilderOpen.has(key) ? 'Cancel'
    : activeLens ? 'Change trust lens' : 'Apply a trust lens';
  lensToggle.onclick = () => {
    if (lensBuilderOpen.has(key)) lensBuilderOpen.delete(key);
    else lensBuilderOpen.add(key);
    render();
  };
  lensRow.appendChild(lensToggle);
  card.appendChild(lensRow);
  if (activeLens) card.appendChild(renderLensBanner(membrane, activeLens));
  if (lensBuilderOpen.has(key)) card.appendChild(renderLensBuilder(membrane));

  // The UNFILTERED health always renders, lens or no lens. When a lens
  // is active the lensed totals sit in the banner above beside these, so
  // what the lens removed is legible rather than merely disclosed.
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
  section.appendChild(renderExpertiseForm());
  return section;
}

// --- Boot -------------------------------------------------------------

render();

// Under a Launcher, connecting needs no input from the practitioner, so
// waiting for them to press a button they have no information to fill in
// would be pure friction. Fire it immediately and re-render when it
// settles, either way — the connect screen above renders both the
// in-flight and the failed state of exactly this call.
if (HolochainConnection.isHosted()) {
  void (async () => {
    try {
      connection = await HolochainConnection.connect(loadConfig());
      markDone('connected');
      render();
      void loadFrictionStatus();
      // Same reason as the manual connect path above: the species picker
      // lives in the critique form, which a Launcher-installed user
      // reaches without visiting the taxonomy tab. Both connect paths
      // load it, or the picker is empty on exactly the path that ships.
      void loadTaxonomy().catch(() => { /* tab shows its own empty state */ });
    } catch (err) {
      hostedConnectError = err instanceof Error ? err.message : String(err);
      render();
    }
  })();
}

if ('serviceWorker' in navigator) {
  // Registered RELATIVE to this document, not from the origin root —
  // same reason vite.config.ts sets `base: './'` (see its comment): once
  // this UI ships inside a .webhapp, the host chooses the origin and the
  // UI is not guaranteed to sit at its root. `./sw.js` also scopes the
  // worker to the app's own directory, which is what is wanted either
  // way. Failure here (e.g. served over plain http on a LAN IP, where
  // service workers are restricted to localhost/https, or a host whose
  // custom protocol does not permit workers at all) is non-fatal: the
  // app still works, it just isn't installable/offline-capable.
  // Plain relative string on purpose, NOT `new URL('sw.js',
  // import.meta.url)`: Vite treats that second form as a build-time
  // asset reference and resolves it against src/, where sw.js does not
  // live (it is a public/ file, copied verbatim). A plain './sw.js'
  // resolves at runtime against the document, which is what is meant.
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
