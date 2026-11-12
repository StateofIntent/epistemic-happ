import './style.css';
import {
  HolochainConnection, loadConfig, saveConfig, decodeRecords,
  type ConductorConfig, type DecodedRecord, decodeEntry } from './holochain';
import {
  type Claim, type Critique, CONFIDENCE_LEVELS, CRITIQUE_MODES, nowMicros, nowSecs,
  type SynapticFrictionStatus, type AntibodyPattern, type Retraction,
  type Membrane, type DiscourseHealth, type CrossDomainCritique,
  type Constitution, type GroundingPath, EVIDENCE_TYPES, type EvidenceType,
  type Evidence,
  ANTIBODY_PATTERN_KINDS, type CritiqueSpecies, type AttestationPolicy,
  type CritiqueMode, type WorldlineTrace, type PeriodResonance,
  NeighborRecall, type Assessment, type UnseenReport,
  type AssessmentUnseenReport,
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
import { getThemePreference, setThemePreference, initTheme, type ThemePreference } from './theme';
import { askAdversary, AdversaryError, type AdversaryVerdict } from './adversary';
import { entryPoint, type AppletSurface, type AppletTarget, type WeaveHost } from './applet';
import { hostContext, connectAppletHost } from './applet-host';
import { renderNotesTab, onNotesTabOpened, onNotesTabClosed, type NotesContext } from './notes-ui';

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

// --- Running as a Moss Tool (open-work 1.28) --------------------------------
//
// Five variables, and four of them exist so that THREE DIFFERENT THINGS do not
// render the same screen. Inside Moss there is no connect form — the Admin API
// this app's form describes is not reachable from a Tool at all, exactly as
// under a Launcher (holochain.ts's header, shapes 1 and 3) — so "connecting",
// "the host declined" and "connected" would otherwise collapse into one blank
// panel. That collapse is this repository's most-repeated defect: an answer
// that is not yet known rendered as an answer.

/** The narrowed host, once it has answered. `null` while connecting and
 *  `null` for good if it never did. */
let appletHost: WeaveHost | null = null;
/** Which surface Moss asked for. Decided ONCE, by `connectAppletHost`, from
 *  `renderInfo` — never re-derived here, because `renderInfo.view.type` is
 *  `'main'` on both arms of the union and a second reading could disagree
 *  with the first. */
let appletSurfaceNow: AppletSurface | null = null;
/** True from the moment the applet branch is taken until the host answers.
 *  DISTINCT FROM `appletHost === null`, which is also true after a failure. */
let appletConnecting = false;
/** The host was detected and could not be used — a timeout, a throw, or a
 *  render shape this UI declines (a cross-group view, which carries no
 *  `appletClient` at all). Says so instead of looking like a slow connect
 *  forever. */
let appletUnavailable = false;

let currentDomain = '';
/** What is TYPED in the browse tab's domain box right now, as distinct from
 * `currentDomain`, which is the domain whose claims are currently loaded.
 *
 * These have to be two variables, and the reason is a real defect this screen
 * shipped with. `render()` rebuilds the DOM wholesale, so an input's value
 * survives a rebuild only if something outside the DOM remembers it. Nothing
 * did: the box was seeded from `currentDomain`, which is written only when a
 * load COMPLETES, so anything typed lived in the DOM node alone and any
 * re-render silently discarded it. Connecting fires two independent async
 * loads — the friction status and the taxonomy — and each calls `render()` when
 * it resolves, so a domain typed in the first seconds after connecting was
 * liable to vanish between the keystroke and the button; "Load claims" then
 * loaded the empty string and rendered nothing.
 *
 * It is the failure `notes-live.mjs` exists to prevent, on a screen that never
 * had the same treatment: a screen that rebuilds when something arrives is a
 * screen that can throw away what somebody is halfway through typing. It
 * surfaced as an intermittent CI failure in `hud-layer` — a bare timeout
 * waiting for `.claim-card` — and `layout-fits.mjs` had already been given a
 * click-twice workaround for the same cause, before the cause was known. */
let domainDraft = '';
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

/** critique actionHash (b64) -> its `critiques_unseen_by` report.
 *
 * READ FROM THE QUERY, NOT FROM THE ENTRY, and that is the difference
 * between this and `renderConeState`. The entry carries what its author
 * recorded; only the read carries the DENOMINATOR — how many sibling
 * critiques this conductor knows of — and a cone count with no
 * denominator is the half-statement open-work 6.1 was left holding. */
const unseenByCritique = new Map<string, UnseenReport>();
/** critique actionHash (b64) -> whether its unseen SET is expanded.
 *
 * The count line is always drawn; the identities sit behind this. Both
 * cone states get the same disclosure with the same affordance, so
 * neither is typographically privileged — see renderUnseenState. */
const unseenOpen = new Set<string>();
/** assessment actionHash (b64) -> its `critiques_unseen_by_assessment`
 * report.
 *
 * A DIFFERENT SET, NOT THE SAME READ POINTED ELSEWHERE.
 * `Assessment.past_cone` holds CRITIQUES of the target — the integrity
 * zome requires every member to resolve to one — so the denominator is
 * the target's critique count and not a count of other positions.
 * Nothing in this protocol records whether an assessor read anybody
 * else's position, and no screen here may imply otherwise. */
const unseenByAssessment = new Map<string, AssessmentUnseenReport>();
/** assessment actionHash (b64) -> whether its unseen SET is expanded. */
const unseenOpenAssessment = new Set<string>();

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

// --- The evidence chain, resolved ------------------------------------
//
// `get_grounding_path` answers whether a claim's support terminates in real
// Evidence and returns the path it walked — `Vec<EntryHash>`, hashes and a
// bool, NO CONTENT. The badge above the toggle has always rendered that as a
// step count, and every hash in the path was discarded unread, so the UI could
// say "reaches a source in 3 steps" and had no way to show what the source
// SAYS.
//
// INVARIANT #3 IS "EVERY CLAIM CARRIES ITS OWN HISTORY", and a step count is
// not the history. The resonance panel further down this card already tells its
// reader that "the evidence chain and critiques above are the exact answer" —
// a sentence that was true of the critiques and not of the chain, since the
// chain was a number.
//
// README §9 listed `get_claim` and `get_evidence` as needing no screen on the
// grounds that "a screen holding the record does not need to re-read it". That
// is right wherever the screen holds the record, and this is the one place it
// does not: it holds a hash the walk returned and nothing else. Those two
// getters are what resolve it, which is why they are called here and nowhere
// else.
//
// Resolved on request and cached, never eagerly: it is one DHT read per node,
// and a domain of twenty claims would otherwise fire the whole support graph
// to render a list nobody has asked to open.

/** One resolved node of a `GroundingPath`.
 *
 * Which getter can answer for a node is decided by its POSITION, per
 * `GroundingPath`'s own doc comment: when `grounded`, the terminal node is the
 * Evidence that closed the chain and every earlier node is a Claim; when not,
 * the walk broke down and the last node is wherever it broke. Asking the wrong
 * getter is not a soft failure — `to_app_option` on the wrong type errors — so
 * position is read rather than guessed, and anything that still will not
 * resolve stays visible as its hash. */
type GroundingStep =
  | { kind: 'claim'; hash: Uint8Array; claim: Claim }
  | { kind: 'evidence'; hash: Uint8Array; evidence: Evidence }
  | { kind: 'unresolved'; hash: Uint8Array };

/** claim entryHash (b64) -> whether its chain is expanded */
const chainOpen = new Set<string>();
/** claim entryHash (b64) -> its path resolved node by node */
const chainByClaim = new Map<string, GroundingStep[]>();
/** claim entryHash (b64) -> resolution in flight */
const chainLoading = new Set<string>();
/** claim entryHash (b64) -> whether its retract form is open */
const retractingClaims = new Set<string>();

// --- 6.14: a retraction can name what replaced it -------------------------
//
// `Retraction.replacement_claim` is `Option<EntryHash>` — *"Optional: what I
// believe now"* — and `create_retraction` writes a `RetractionToReplacement`
// link whenever one is named. Until now this form passed `null` as a LITERAL,
// so the link type had no producer anywhere and SPEC §4's *"read by nothing
// yet"* understated it: it was written by nothing reachable either.
//
// WHAT THIS BUILDS AND WHAT IT DELIBERATELY DOES NOT. The field is offered
// over claims the author has ALREADY published, which is the half that needs
// no decision. The half that does is 6.14's `[D]`: a replacement usually
// needs to be published BEFORE the retraction so a hash exists to point at,
// which inverts the order an author actually works in — they realise they
// were wrong first. Composing both entries in one act is a write of two
// permanent entries that can half-fail with no transaction available, and the
// alternative is a LATER claim pointing BACK, which is a different link and a
// different entry. Neither is wiring, so neither is done here, and the empty
// state below says so to the author rather than leaving them to infer it.

/** The author's own claims, for the replacement picker. `null` means NEVER
 *  ASKED, which is a different fact from an empty array — the distinction
 *  6.13 is about, and the one the applet asset surface got wrong first. */
let myClaimsForReplacement: DecodedRecord<Claim>[] | null = null;
let myClaimsReplacementLoading = false;
let myClaimsReplacementError = '';

/** Replacement chosen per open retract form, keyed by the retracted claim's
 *  entryHash (b64). `''` means none.
 *
 *  MODULE STATE RATHER THAN READ OFF THE `<select>` AT SUBMIT TIME, and the
 *  reason is a real hazard rather than tidiness: `captureFieldValues` covers
 *  `input, textarea` and NOT `select`, so any background render — a friction
 *  poll, an epistemic-state load — rebuilds the picker at its first option.
 *  A choice would reset to "none" with nothing on screen having changed, and
 *  the retraction would silently lose its replacement. This is why the New
 *  Claim form's confidence picker is backed by `newClaimDraft.confidence`;
 *  the same convention, for the same reason. */
const replacementChoice = new Map<string, string>();

/** Replacement claims resolved for display, keyed by the replacement's own
 *  entryHash (b64). A present key with a `null` value means the read
 *  completed and returned nothing — NOT that no replacement was named. */
const replacementClaimByHash = new Map<string, Claim | null>();
const replacementReading = new Set<string>();
const replacementReadFailed = new Map<string, string>();
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
// --- 6.17: a window opens its records ---------------------------------
//
// WHAT THIS REPLACED AND WHY IT WAS WRONG. This was
// `Map<number, number>` — a COUNT — and `samplePeriod` fetched the records,
// stored `records.length`, and threw the records away. The button said
// *"Show what is in this window"* and, on being clicked, relabelled itself
// *"2 records in this window"*. It never opened anything.
//
// FOUND BY A PILOT PARTICIPANT, 2026-11-11, in their own words: *"clicking to
// show the records in this window only shows — 2 records in this window.
// (expectation would've been that it would open the record."* That
// expectation is the correct reading of the label, and THREE places in this
// repository already agreed with them before the report arrived:
// `PeriodResonance`'s own doc comment in `types.ts` says the boundary is
// paired *"with sample_period to open that window's real records"*, the
// button's label promises to show them, and the coordinator returns
// `Vec<Record>` with `include_entries(true)` — the records were on the wire
// and discarded one line after arriving.
//
// AND THE HARNESS CERTIFIED IT. `worldline-ui.mjs` asserted
// `sample_period opens the window's real records` with the predicate
// `/\d+ record/.test(sampleText)` — a label about opening records over a
// test that only requires a digit next to the word. It was green throughout.
// That check is rewritten in the same commit, and it is the reason this
// survived to reach a participant.
type PeriodSample =
  | { state: 'reading' }
  | { state: 'failed'; why: string }
  | { state: 'open'; records: SampledRecord[] };

/** One record from a sampled window, identified by the ACTION's own
 *  `entry_type` rather than by reading its bytes.
 *
 *  THAT CHOICE IS LOAD-BEARING, NOT STYLISTIC. `check-entry-type-confusion.mjs`
 *  records a LIVE one-directional confusion — a `Claim`'s bytes read as a
 *  `Mew` — so identifying an entry by sniffing its decoded fields would
 *  mislabel exactly the entry type this app is mostly made of. The action
 *  carries `entry_type: { App: { entry_index, zome_index, visibility } }`,
 *  which is what the integrity zome actually committed. Measured against a
 *  live conductor before this was written. */
interface SampledRecord {
  entryIndex: number;
  kind: string;
  /** True when this is the chain's own machinery rather than something the
   *  agent wrote — a capability grant, say. Kept VISIBLE and labelled rather
   *  than filtered out: Invariant 1 says raw history stays open and
   *  queryable, and hiding rows from an agent's own view of their own chain
   *  would be this UI deciding what their history contains. Flagged so the
   *  screen can say *the app wrote this, not you*, which is the honest
   *  version of the same mercy. */
  machinery: boolean;
  /** Micros, from the action header — NOT from the entry, whose own
   *  `timestamp` field is author-supplied and which SPEC §5.22 says
   *  validation cannot check against a clock. */
  writtenAt: number | null;
  /** Whatever the entry carries as prose, if it carries any. Absent is a
   *  real answer: a `Membrane` has a description, a `WorldlineTrace` has no
   *  prose at all, and inventing a line for it would be worse than a blank. */
  content: string | null;
}

/** `entry_index` -> the integrity zome's own name for it.
 *
 *  POSITION-INDEXED, WHICH IS THE SAME HAZARD `LinkTypes` CARRIES AND SAYS SO
 *  IN ITS OWN COMMENT: an entry type inserted in the MIDDLE of
 *  `EntryTypes` renumbers everything after it, and this map would then put
 *  the wrong name on every record below the insertion — silently, because
 *  nothing about a number looks wrong. So it is GATED:
 *  `scripts/check-entry-index-map.mjs` parses the Rust enum and fails if this
 *  map and that order disagree. Do not edit one without the other. */
const ENTRY_KINDS: Record<number, string> = {
  0: 'Mew', 1: 'Claim', 2: 'Retraction', 3: 'Critique', 4: 'Evidence',
  5: 'Membrane', 6: 'Constitution', 7: 'Critique species', 8: 'Worldline trace',
  9: 'Bridge record', 10: 'External critique', 11: 'Antibody pattern',
  12: 'Federation record',
};

/** Entry types that are not app entries at all. Holochain writes these to an
 *  agent's own chain as a consequence of using the app — a `CapGrant` appears
 *  the moment signing credentials are authorized — so they turn up in a
 *  sampled window beside the agent's claims, and a reader deserves to be told
 *  which is which in words rather than in jargon. NOT position-indexed: these
 *  arrive as a plain string naming themselves. */
const NON_APP_KINDS: Record<string, string> = {
  CapGrant: 'Permission the app granted itself — not something you wrote',
  CapClaim: 'Permission the app is holding — not something you wrote',
  AgentPubKey: 'Your own key, written when you joined',
};

const sampledPeriods = new Map<number, PeriodSample>();
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
/** What a species' uptake is MADE OF, read at query time from real
 * CritiqueToSpecies links. Absent while in flight or if the read failed; the
 * UI says "adoption unavailable" rather than 0, because 0 is a real and
 * different answer.
 *
 * A BARE COUNT USED TO LIVE HERE, and it could not say the one thing worth
 * knowing. `get_critique_species_adoption_count` counts every citation
 * INCLUDING THE PROPOSER'S OWN, so a species one agent invented and then used
 * in fifty of their own critiques displayed identically to one fifty agents
 * had adopted. READINESS item 11 needed those told apart — a divergent
 * species taken up by others is exploration, and one nobody else touches is
 * indistinguishable from noise — so the screen now shows what the number is
 * composed of. Still a fact about the species, never its position. */
type SpeciesAdoption = {
  total_citations: number;
  proposer_citations: number;
  independent_adopters: Uint8Array[];
  unattributable_citations: number;
  warning: string | null;
};
const adoptionBySpecies = new Map<string, SpeciesAdoption>();
/** whether the propose-a-species form is open */
let proposingSpecies = false;

/** claim's own base64 entry-hash key -> its critiques, loaded lazily
 * per claim rather than for the whole domain at once. */
const critiquesByClaim = new Map<string, DecodedRecord<Critique>[]>();

/** ROW 6.19 — a critique's own base64 ENTRY-hash key -> the critiques that
 * target IT rather than the claim.
 *
 * WHY A SECOND MAP INSTEAD OF `critiqueTreeByClaim`, WHICH ALREADY HAS THIS.
 * That tree is a recursive fan-out to `MAX_TREE_DEPTH`, and the note above the
 * "View critique structure" button records it as opt-in per claim for exactly
 * that reason — most reading does not need depth. Replies are not depth: they
 * are the thread, and a reply nobody sees without opening a spatial view is a
 * reply that does not exist for readers. So this is ONE level, one
 * `get_critiques_for` per critique already on screen, and the full tree stays
 * opt-in with its reasoning intact.
 *
 * UNASKED IS NOT ZERO, the same distinction 6.13 drew for the Browse tab: a
 * missing key means the read has not happened, an empty array means it came
 * back with nothing, and `renderReplies` says different things about each. */
const repliesByCritique = new Map<string, DecodedRecord<Critique>[]>();

/** ROW 6.22 — how many critiques a claim shows before the rest are folded.
 *
 * FOUR, which is the top of the range the participant who asked for this named
 * ("after 3-4 critiques"). Taking the top of their range rather than the bottom
 * is deliberate: this is a CAP ON A LONG LIST and not a default that tidies a
 * short one away, so the bias belongs on the side of showing more. A claim with
 * exactly four critiques shows four and renders no control at all. */
const FOLD_CRITIQUES_AFTER = 4;

/** Which claims have had their full critique list asked for, keyed by the
 * claim's base64 entry hash. Folded is the default; expanded is a per-reader,
 * per-session choice that is never written anywhere. */
const critiqueListExpanded = new Set<string>();

/** Which critiques have their reply box open, keyed by the critique's base64
 * ACTION hash — the same per-row-open-state pattern as `unseenOpen`.
 *
 * Closed by default so a claim with six critiques is not six forms. The ask
 * this row answers was about clutter as much as about structure. */
const replyOpen = new Set<string>();

/** ROW 6.15's PULL HALF — how many critiques came back on each of the
 * reader's OWN claims, keyed by the claim's entry hash in base64.
 *
 * WHY IT EXISTS, and a participant asked for it in these words hours after
 * filing the pilot's first critique: "when someone posts a critique, how does
 * the author of the claim find out? If there's no notification, discussions
 * might fade simply because the author doesn't know someone responded."
 * `create_claim` emits a signal and `create_critique` emits NOTHING, so the
 * one act this protocol exists to carry is the one act that announces itself
 * to nobody. The first two critiques in its history were both delivered over
 * Telegram.
 *
 * WHY A COUNT AND NOT A NOTIFICATION. Push is the row's `[D]` half and stays
 * undecided, for a reason that is a cost rather than a taste:
 * `send_peer_signal` writes a permanent CapGrant per call on the SENDER's
 * chain, so notifying on every critique would grow a critic's own chain in
 * proportion to how much they disagree — a per-act permanent cost on exactly
 * the behaviour the protocol wants more of. A read on the author's side
 * writes nothing and is the opposite trade.
 *
 * THE ABSENCE OF AN ENTRY IS NOT A ZERO, which is 6.13's lesson arriving in a
 * second costume. A claim with no entry here has not been asked about; a
 * claim mapped to 0 has been asked about and nobody disagreed. Rendering the
 * first as the second would tell an author they are unchallenged at the
 * moment the screen opens, before any read has returned — the most
 * expensive false statement this surface could make. */
const myCritiqueCounts = new Map<string, number>();
/** which claims currently have their critique panel expanded. */
const expandedClaims = new Set<string>();

/** claim's own base64 entry-hash key -> the assessments filed against
 * it, loaded alongside its critiques.
 *
 * WHY THIS SURFACE EXISTS NOW. `publish_assessment` and
 * `get_assessments_for` have been in the coordinator all along with no
 * client reaching either, and on 2026-10-28 `agent-sdk` and
 * `mcp-server` gained both — so an agent can now file an attributed
 * position on somebody's claim and the person whose claim it is had no
 * way to see it. That asymmetry is worse than the original absence:
 * the write surfaced and the read did not, which is the half-surfaced
 * defect this codebase keeps recording, pointed the other way.
 *
 * WHAT IS STILL A DECISION, stated so this is not mistaken for closing
 * open-work 6.4: this is the READ half only. Whether and how a HUMAN
 * files an assessment from this client is the design question that row
 * is about, and no form is added here. Rendering somebody else's
 * attributed entry needs no new decision — it is the critique panel's
 * settled pattern, which this follows deliberately rather than
 * inventing a second one. */
const assessmentsByClaim = new Map<string, DecodedRecord<Assessment>[]>();

// --- Neighborhood resonance (HRR, the approximate half) -----------------
// §2.5 permits this layer to be "a receiver, not a truth engine", and
// query_neighborhood_resonance is explicit that a similarity is "a hint
// worth checking, not a claim of fact" and never a substitute for
// get_grounding_path or get_critiques_for, which stay the exact reads.
//
// IT IS A MEMBERSHIP PROBE, NOT A SEARCH, and that shapes the whole
// surface. It does not discover related claims — it scores candidates the
// caller supplies, so the candidates here are the other claims already on
// screen in this domain. A discovery feature would have to rank the DHT by
// relevance, which is the comparative ordering Invariant 1 refuses.
/** claim key -> probe results, absent until the reader asks for them. */
const resonanceByClaim = new Map<string, NeighborRecall[]>();
/** which claims currently have their resonance probe open. */
const resonanceOpen = new Set<string>();
/** claim keys whose probe is in flight, so the panel can say so. */
const resonanceLoading = new Set<string>();

// --- By Author -----------------------------------------------------------
// Kept in its own store rather than reusing `claims`, so that reading one
// agent's history and browsing a domain do not overwrite each other — a
// reader who clicks an author from a domain listing expects to be able to
// go back to that listing, and sharing one array would silently destroy it.
/** claims by one agent, as returned by `get_claims_by_agent`. */
let authorClaims: DecodedRecord<Claim>[] = [];
/** the agent whose claims `authorClaims` holds, base64, '' if none asked for. */
let currentAuthor = '';
/** The by-author tab's input, kept for exactly the reason `domainDraft` is
 * kept — the same shape, the same rebuild, the same loss. */
let authorDraft = '';

/** Everything a half-composed claim consists of, held outside the DOM.
 *
 * The New Claim form is the worst case of the problem `domainDraft` describes,
 * because it is the screen somebody spends real time on. Seven controls — the
 * claim itself, its domain, confidence, tags, and three evidence fields — all
 * lived only in their DOM nodes, so any `render()` while a claim was being
 * composed discarded the lot with no warning and no error. Publishing into the
 * domain you are browsing does exactly that, via `loadClaims`, which is why the
 * explicit `contentArea.value = ''` on success was doing nothing recognisable:
 * sometimes the rebuild cleared everything, sometimes nothing, depending on
 * which path ran.
 *
 * One object rather than a variable per field, deliberately. A form is a single
 * thing a person is in the middle of, and `clearAfterPublish` below is only
 * coherent when there is one place that says what "in the middle of" means. */
interface NewClaimDraft {
  content: string;
  /** Empty means "not typed yet", which is what lets the box keep pre-filling
   * from the domain being browsed without overwriting a real edit. */
  domain: string;
  confidence: string;
  tags: string;
  evidenceContent: string;
  evidenceType: EvidenceType;
  evidenceUrl: string;
}
const emptyClaimDraft = (): NewClaimDraft => ({
  content: '', domain: '', confidence: 'Moderate', tags: '',
  evidenceContent: '', evidenceType: EVIDENCE_TYPES[0], evidenceUrl: '',
});
let newClaimDraft: NewClaimDraft = emptyClaimDraft();

/** The post-publish confirmation, which also lived only in the DOM and was
 * therefore destroyed by the very re-render that publishing triggers.
 *
 * Its wording says what happened LOCALLY and what has not happened yet — see
 * the comment at the `create_claim` call for why "Claim published." was true,
 * incomplete, and the most expensive kind of silence this app can produce. */
let newClaimNotice: string | null = null;

// --- The compose-time adversary (open-work 6.10) ----------------------
//
// EPHEMERAL ON PURPOSE, AND THAT IS THE DECISION RATHER THAN AN
// OVERSIGHT. 6.10's second decision is that a machine objection NEVER
// renders beside a real one: these exist in the draft form, before the
// claim exists, and are gone the moment it is published. There is no
// co-located surface and there must not be one — §(1) of that row
// worried that machine objections at the same typographic weight as
// attributed ones would INVENT CRITICS, and 6.1 spent weeks on how to
// render two unequal claims honestly side by side. The lesson 6.1
// actually earned is that sometimes the honest answer to "how do we
// show this beside that" is NOT BESIDE IT. With no shared surface there
// is no weight to equalise and no caption to get right.
//
// Held in module state like every other piece of UI state, so a
// background render does not drop it — open-work 1.23's invariant.
let adversaryVerdict: AdversaryVerdict | null = null;
let adversaryRunning = false;
let adversaryError: { kind: string; message: string } | null = null;
/** The node holding whatever the model produced, so the publish path can
 * empty it without a rebuild. Set when the form is built; null before. */
let adversaryOutputEl: HTMLElement | null = null;

/** What a successful publish resets, and what it deliberately keeps.
 *
 * Content and tags are cleared because the claim is written. Domain and
 * confidence are kept because publishing several claims into one domain is the
 * normal case — that was the original code's intent, readable in the two lines
 * it cleared by hand.
 *
 * EVIDENCE IS CLEARED, and that is a change rather than a restoration. It was
 * never cleared before, but the form was also being wiped unpredictably by the
 * rebuild, so the hazard was intermittent. Making the draft reliable would make
 * it reliable too: evidence is cited at publication and fixed from then on, so
 * carrying the same text forward would silently create a SECOND Evidence entry
 * and cite it from the next claim, which is not something anybody asked for. */
function clearAfterPublish(): void {
  // THE ADVERSARY'S OUTPUT IS DISCARDED HERE, AND THIS LINE IS 6.10's
  // SECOND DECISION ENFORCED. The objections exist before the claim does
  // and are gone the moment it is published: there is no co-located
  // surface, nothing is carried onto the claim card, and nothing is
  // recorded. Keeping them so the author could "see what it said about
  // the one they just published" is exactly how a machine objection ends
  // up beside a real one.
  adversaryVerdict = null;
  adversaryError = null;
  // The DOM half, because this path does not rebuild. See `advOutput`.
  if (adversaryOutputEl) adversaryOutputEl.innerHTML = '';
  newClaimDraft = {
    ...newClaimDraft,
    content: '',
    tags: '',
    evidenceContent: '',
    evidenceUrl: '',
  };
}
/** set once a read has come back, so an empty list can be reported as the
 * real and different answer it is rather than as "nothing loaded yet".
 * The taxonomy adoption count makes the same distinction for the same
 * reason: 0 is an answer, absence is not. */
let authorLoaded = false;
/** a failed or malformed read, shown rather than swallowed into an empty list. */
let authorError = '';
/** Browse's half of the same distinction, for the same reason, and it was
 * missing for longer: one sentence stood for "never asked", "came back
 * empty" and "the read failed" at once. 6.13 — found by driving the shipped
 * build to check whether a participant's claims had landed, where a second
 * known-populated domain had to be loaded as a positive control to find out
 * whether the button worked at all. */
let browseLoaded = false;
/** a failed Browse read, shown rather than leaving the previous screen up. */
let browseError = '';

/** ROW 6.16. The domains this agent has PUBLISHED in, derived from
 * `get_claims_by_agent(me)` — every claim it returns carries its own
 * `.domain`, so this needs no new extern, writes nothing, and survives a
 * reinstall because it is read off the chain rather than off this device.
 *
 * WHY IT EXISTS, and the route it replaces was found by a user rather than
 * here. Asked how they returned to a domain somebody had given them, a pilot
 * participant answered: "I go to Worldline, then my records, copy the domain
 * name and paste it in again." That is `WorldlineBoundary.domain_tag`, a field
 * on a trace of their own activity, discovered independently as navigation
 * when it was never built to be any — AND IT DECAYS SILENTLY. `loadWorldline`
 * READS an existing trace; `generate_worldline_trace` is a separate explicit
 * act that COMMITS an entry. So the list they were navigating by is a snapshot
 * frozen at whenever the trace was last generated, every domain written in
 * since is missing from it, nothing on screen says it has an age, and the only
 * refresh is a permanent write. A navigation aid that omits your most recent
 * work is worse than none, because it reads as complete.
 *
 * WHY THIS IS NOT 6.12'S BLOCKED HALF, which is the reason it could be built
 * today. 6.12 is blocked on whether to index domains nobody founded — a
 * LOOKUP surface, which SECURITY.md's "containment holds for what you traverse
 * to and nothing for what you look up" is precisely about. This enumerates
 * nothing the reader has not already seen: it is their own history, it leaks
 * to nobody, and there is no lens for it to need.
 *
 * There is no `loaded` flag beside it, unlike `browseLoaded` three lines up,
 * and the asymmetry is deliberate rather than an omission: Browse has to tell
 * an empty answer from an unasked question because the reader ASKED and is
 * owed an answer. Nobody asked for this list. It is absent until it has
 * something to say, which is the honest render of a convenience. */
let myDomains: string[] = [];

/** The weaker half, kept visibly separate rather than merged into the list
 * above. READING IS NOT AN ACT THE PROTOCOL RECORDS — there is no entry for
 * "I looked at this" and 6.16 does not propose one — so a domain somebody
 * merely visited cannot come from the chain at all. It lives here, per-device
 * and losable, and the screen says so: presenting it beside a chain-derived
 * list without that distinction would be the same overclaim the Worldline
 * route makes by looking complete. */
const VISITED_KEY = 'epistemic-mobile-ui:visited-domains';
const VISITED_CAP = 12;

function readVisited(): string[] {
  try {
    const raw = localStorage.getItem(VISITED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((d) => typeof d === 'string') : [];
  } catch {
    // A private window, cleared site data, or storage the browser refuses.
    // An empty list is the correct render, not an error worth a screen.
    return [];
  }
}

let visitedDomains: string[] = readVisited();

/** Recorded only once a read has actually come back, for the same reason
 * `markDone('browsed-domain')` moved below the await: a domain a conductor
 * never answered for is not somewhere the reader has been. */
function rememberVisited(domain: string): void {
  visitedDomains = [domain, ...visitedDomains.filter((d) => d !== domain)].slice(0, VISITED_CAP);
  try { localStorage.setItem(VISITED_KEY, JSON.stringify(visitedDomains)); } catch { /* see readVisited */ }
}

/** First-seen order, deduplicated — the order the network returned the claims
 * in, not an ordering this client invented. Nothing is counted: a tally of
 * claims per domain beside a person is the shape Invariant 1 is about, and
 * the By Author tab already declines to print one. */
function distinctDomains(records: DecodedRecord<Claim>[]): string[] {
  const seen: string[] = [];
  for (const r of records) {
    if (r.entry.domain && !seen.includes(r.entry.domain)) seen.push(r.entry.domain);
  }
  return seen;
}

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function short(bytes: Uint8Array): string {
  return b64(bytes).slice(0, 12) + '…';
}

/** Inverse of b64, for the one place a key arrives as text: an agent key
 * typed or pasted into the By Author tab. Throws on anything that is not
 * valid base64 so the caller can say so, rather than passing malformed
 * bytes to the conductor and surfacing its error instead of ours. */
function bytesFromB64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

const app = document.querySelector<HTMLDivElement>('#app')!;

/** Whether the notes layer is being used without a conductor.
 *
 * The soft layer's whole argument is that it costs nothing to walk into, and
 * requiring a Holochain connection first would put the protocol's ceremony
 * back in front of the room built to sit in front of the protocol. So the
 * connect screen offers a second door: write notes now, connect when you have
 * something you want to publish. Promotion is the only thing that needs the
 * conductor, and its form says so where it is disabled. */
let notesWithoutConductor = false;

/** What notes-ui needs from this app: a connection when there is one, a way
 * to ask for a re-render, and the claims already on screen to offer as
 * critique targets. Built fresh on each use so it never holds a stale
 * connection. */
function notesContext(): NotesContext {
  return {
    connection,
    rerender: render,
    claimTargets: () => claims.map((record) => ({
      label: `${record.entry.content.slice(0, 60)}${record.entry.content.length > 60 ? '…' : ''}`
        + ` — ${record.entry.domain}`,
      // create_critique targets a Claim by ENTRY hash, exactly as the
      // critique form in this file does. An ActionHash here would validate
      // as a link target and point at nothing the critique panel can read.
      hash: record.entryHash,
    })),
  };
}

// --- Keeping the caret across a rebuild -----------------------------------
//
// THE HALF OF THE INPUT-LOSS DEFECT THAT PERSISTING DRAFTS DOES NOT FIX, and
// it is the half a person actually feels. `domainDraft`, `authorDraft`,
// `newClaimDraft` and the notes drafts keep what has ALREADY been typed when
// this app rebuilds its DOM wholesale. None of them keeps the CARET: the
// focused input is destroyed, focus falls back to `<body>`, and every
// keystroke after that lands nowhere at all. Nothing reports it — no error,
// no event, and the box still shows the text typed before the rebuild, so the
// screen looks fine and simply stops accepting letters.
//
// It is the same trigger as the value loss and therefore just as reachable:
// connecting fires two independent async loads, `loadClaims` re-renders when a
// read lands, and a note arriving in an open room re-renders too. Type into
// the domain box while any of those resolve and the rest of the word goes
// into nothing.
//
// FOUND BY REPRODUCING THE `hud-layer` INTERMITTENCY OUTSIDE THIS REPOSITORY.
// It survived the draft fix and went red again on main — the domain box empty,
// the harness's own diagnostic naming which half had failed. A minimal page
// with this app's exact shape (a wholesale rebuild, a value persisted on
// `oninput`) loses a Playwright `fill()` in 35 runs out of 300 when the
// rebuild lands in the few milliseconds the fill spends between focusing the
// box and inserting the text: no `input` event fires anywhere, and the value
// is never written, because the text is delivered to whatever holds focus and
// by then that is the body. A person types the same way, one keystroke at a
// time, and loses the same letters.
//
// The notes screens already had this, as `rerenderLive` — written when a
// stranger's note could arrive mid-sentence. It is app-wide now rather than
// notes-only, because every one of those triggers rebuilds every screen.
type Field = HTMLInputElement | HTMLTextAreaElement;

/** What identifies a field across a rebuild: it is a NEW element afterwards,
 * so the match has to be on what a person would say is "the same box". The
 * test id where there is one, then the placeholder, then the name — the
 * fallbacks matter, because most inputs in this file carry no test id and
 * they lose the caret exactly like the ones that do.
 *
 * The LABEL is the last of them, and it is the one that makes this safe to
 * forget. Auditing every field this app builds turned up exactly one that
 * named itself in none of the other ways — the New Claim form's Tags box,
 * which says what it is only through the `<label>` wrapped around it, and
 * which would therefore have gone on silently losing the caret while every
 * box beside it kept it. A field nobody remembered to name is precisely the
 * field that will be added next, so the fallback is worth more than the one
 * repair it makes today. */
function focusKey(field: Field): string | null {
  return field.dataset.testid || field.placeholder || field.name
    || field.getAttribute('aria-label')
    || field.closest('label')?.textContent?.trim() || null;
}

function fieldsWithKey(key: string): Field[] {
  return [...app.querySelectorAll<Field>('input, textarea')]
    .filter((field) => focusKey(field) === key);
}

/** The same idea for anything focusable that is NOT a text box.
 *
 * A button has no placeholder and no `name`, so it needs its own key:
 * its testid, its label, or failing both its own words — which is how a
 * reader would name it too. */
function controlKey(el: HTMLElement): string | null {
  return el.dataset.testid || el.getAttribute('aria-label')
    || el.textContent?.trim().slice(0, 40) || null;
}

function controlsWithKey(key: string): HTMLElement[] {
  return [...app.querySelectorAll<HTMLElement>('button, a[href], [tabindex]')]
    .filter((el) => controlKey(el) === key);
}

/** Captures where the caret is, and returns the function that puts it back.
 *
 * Both halves run inside one `render()` call, so there is no window in which
 * a keystroke can arrive and find nothing focused: the DOM is single-threaded
 * and the rebuild is synchronous.
 *
 * THIS COMMENT USED TO SAY "a render caused by pressing a button leaves the
 * button focused", AND THAT WAS FALSE — measured 2026-11-02 by
 * `render-invariant.mjs`: the button is destroyed with everything else and
 * focus falls to `BODY`. For a keyboard user that is worse than losing a
 * caret, because the next Tab restarts from the top of the document rather
 * than continuing from the control they were on. It was the reason this
 * function deliberately handled text boxes ONLY, so the reason was wrong and
 * the scope with it.
 *
 * SO BUTTONS AND LINKS ARE RESTORED TOO, and the distinction the old comment
 * was reaching for still holds: restoring focus to the control the person was
 * ALREADY on is not the same as dragging the caret back into a box they had
 * just left. Nothing here moves focus somewhere it was not. */
function captureFocus(): () => void {
  const active = document.activeElement;
  if (active instanceof HTMLElement
      && !(active instanceof HTMLInputElement)
      && !(active instanceof HTMLTextAreaElement)
      && app.contains(active)) {
    // A control rather than a text box: no caret to put back, so the key and
    // the ordinal are the whole of what has to survive.
    const key = controlKey(active);
    if (key === null) return () => { /* nothing names this control */ };
    const ordinal = controlsWithKey(key).indexOf(active);
    return () => {
      const restored = controlsWithKey(key)[ordinal];
      // `preventScroll`, because the measurement that found this bug also
      // established that a rebuild does NOT move the page — and a bare
      // `.focus()` scrolls its target into view, which would introduce the
      // jump this function is not supposed to cause.
      if (restored) restored.focus({ preventScroll: true });
    };
  }
  if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) {
    return () => { /* nothing was focused inside the app */ };
  }
  const key = focusKey(active);
  if (key === null) return () => { /* nothing names this box across a rebuild */ };
  // Several boxes can share a key — the evidence rows, for one — so remember
  // which of them it was rather than always restoring the first.
  const ordinal = fieldsWithKey(key).indexOf(active);
  let start: number | null = null;
  let end: number | null = null;
  // `selectionStart` throws on input types that have no caret (number, email
  // in some browsers), which is a normal field to be focused in, not an error.
  try { start = active.selectionStart; end = active.selectionEnd; } catch { /* no caret */ }
  const scroll = active.scrollTop;

  return () => {
    const restored = fieldsWithKey(key)[ordinal];
    if (!restored) return;
    restored.focus();
    if (start === null) return;
    try {
      restored.setSelectionRange(start, end ?? start);
      restored.scrollTop = scroll;
    } catch { /* it came back as something without a selection */ }
  };
}

/** Captures what has been TYPED but not yet submitted, and returns the
 * function that puts it back.
 *
 * WHY THIS EXISTS, AND IT IS A USER-FACING BUG RATHER THAN A TEST ONE.
 * `render()` is `app.innerHTML = ''` followed by a full rebuild, so every
 * input is a NEW element with an empty value. `captureFocus` above already
 * restores the caret across that — but the caret was being returned to a box
 * whose contents had just been thrown away. Any of the twenty-one
 * fire-and-forget `void load*()` calls can resolve mid-typing and trigger a
 * render, and twelve of the fourteen loaders end in one. So a person filling
 * the Commit-a-prediction form, or the New Claim form, can lose what they
 * typed to a background read completing — with no error and nothing to
 * suggest what happened.
 *
 * It was found from the other end: `foresight-ui.mjs` §7 failed on four-plus
 * CI runs because a render landed between filling the form and pressing
 * Commit, leaving the submit handler reading empty inputs and refusing with
 * its own validation message. The harness got a settle (see that file). This
 * is the half that was still wrong for people.
 *
 * THE SAFETY PROPERTY, and it is the whole design: a captured value is only
 * restored into a field the rebuild left EMPTY. A render that deliberately
 * fills a box — the prefilled question on the predict-about-a-claim path, a
 * form reset after a successful submit, a value loaded from the chain by
 * Recover — must win, because the app meant that and the stale keystrokes did
 * not. Restoring over it would turn this repair into a worse bug: input the
 * person had already committed reappearing after the app cleared it.
 *
 * Keyed by `focusKey`, so it inherits that function's audit and its fallback
 * to the wrapping `<label>` — a field nobody remembered to name keeps its
 * contents for the same reason it keeps its caret. */
function captureFieldValues(): () => void {
  const typed: { key: string; ordinal: number; value: string }[] = [];
  for (const field of app.querySelectorAll<Field>('input, textarea')) {
    // Checkboxes and radios carry state in `checked`, not `value`, and a
    // half-set checkbox is not half-typed text — left alone deliberately.
    if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) continue;
    if (!field.value) continue;
    const key = focusKey(field);
    if (key === null) continue;
    typed.push({ key, ordinal: fieldsWithKey(key).indexOf(field), value: field.value });
  }
  if (!typed.length) return () => { /* nothing was part-written */ };

  return () => {
    for (const { key, ordinal, value } of typed) {
      const field = fieldsWithKey(key)[ordinal];
      // ONLY into a box the rebuild left empty — see the safety property above.
      if (field && !field.value) field.value = value;
    }
  };
}

// --- A box you can read back what you wrote in ------------------------
//
// OPEN-WORK 6.20, SECOND HALF, and the report is one sentence long: "The
// window to write in could be made bigger, right now wanting to read back
// (as it is permanent) is difficult."
//
// THAT LAST CLAUSE IS THE WHOLE ARGUMENT. Every box in this app writes
// something that cannot be edited afterwards, so re-reading a draft is not a
// convenience here the way it is in a chat window — it is the last moment the
// text is still free to change, which is the same reason open-work 6.10
// exists. The stylesheet gave every textarea `min-height: 5rem`: about three
// lines, from which a five-paragraph critique is read three lines at a time
// through a scroll bar.
//
// IT GROWS RATHER THAN BEING TALLER. A box fixed at twenty lines pushes the
// submit button below the fold of a 390x844 phone before anything is typed,
// which is the defect `layout-fits.mjs` exists for wearing the other shoe. So
// the height follows the content, with a cap — past the cap the box scrolls,
// because a draft long enough to fill half the screen must not be able to
// push the button that commits it out of reach.
const PROSE_BOX_CAP = 0.55;

function fitProseBox(area: HTMLTextAreaElement) {
  // A box that is not laid out has no scrollHeight worth reading: a hidden
  // form would otherwise be pinned to 0 and come back the wrong size.
  if (!area.offsetParent) return;
  // `auto` FIRST so the box can shrink again — without it `scrollHeight`
  // never falls below the height already set, and deleting a paragraph
  // leaves the hole it was in.
  area.style.height = 'auto';
  const cap = Math.max(120, Math.round(window.innerHeight * PROSE_BOX_CAP));
  const wanted = area.scrollHeight;
  area.style.height = `${Math.min(wanted, cap)}px`;
  area.style.overflowY = wanted > cap ? 'auto' : 'hidden';
}

/** Every textarea in the app, after a rebuild.
 *
 * App-wide rather than per form, and for the same reason `captureFieldValues`
 * is: these forms are built in eleven places and a rule that has to be
 * remembered at each of them is a rule that will be missing from the twelfth.
 * Nothing here reads which form it is in. */
function fitProseBoxes() {
  for (const area of app.querySelectorAll<HTMLTextAreaElement>('textarea')) fitProseBox(area);
}

// Delegated, and installed ONCE. `render()` rebuilds the whole document on
// every state change, so a listener attached per element would be re-attached
// a few hundred times a session; this one survives every rebuild because it
// is on the container the rebuild happens inside.
app.addEventListener('input', (e) => {
  if (e.target instanceof HTMLTextAreaElement) fitProseBox(e.target);
});

function render() {
  const restoreFocus = captureFocus();
  // AFTER the focus capture and restored BEFORE it, so the caret lands in a
  // box that already has its text back rather than in an empty one.
  const restoreValues = captureFieldValues();
  // `finally`, because the early returns below are real exits and a rebuilt
  // connect screen loses the caret exactly like a rebuilt tab.
  try {
    app.innerHTML = '';
    conceptNoteShownThisPass = false;
    app.appendChild(renderHeader());
    if (!connection) {
      if (notesWithoutConductor) {
        app.appendChild(renderNotesWithoutConductor());
        return;
      }
      app.appendChild(renderConnectScreen());
      return;
    }
    // A WRAPPER, NEVER A REWRITE — constraint (1) of open-work 1.28. Each of
    // the three surfaces below reaches the SAME renderers the standalone app
    // reaches; what the host chooses is which of them to show, and `main` is
    // the whole app unchanged. If this block were deleted the standalone UI
    // would be exactly what it was, which is the property that makes the
    // dependency survivable.
    if (appletHost) app.appendChild(renderAppletFrame(appletHost));
    if (appletSurfaceNow === 'asset') {
      app.appendChild(renderAppletAsset());
      return;
    }
    if (appletSurfaceNow === 'creatable') {
      app.appendChild(renderAppletCreatable());
      return;
    }
    app.appendChild(renderTabs());
  } finally {
    restoreValues();
    restoreFocus();
    // AFTER the values are back, never before: the box is sized to what is
    // in it, and a draft restored into a rebuilt form is exactly the case
    // where the size would otherwise be a frame behind its contents.
    fitProseBoxes();
  }
}

/** The notes layer on its own, before any conductor exists. */
function renderNotesWithoutConductor(): HTMLElement {
  const wrap = document.createElement('main');
  wrap.className = 'tab-content';
  const back = document.createElement('button');
  back.className = 'link-button';
  back.textContent = '← Connect to a conductor';
  back.dataset.testid = 'notes-solo-back';
  back.onclick = () => { notesWithoutConductor = false; render(); };
  wrap.appendChild(back);
  const banner = document.createElement('p');
  banner.className = 'hint';
  banner.dataset.testid = 'notes-solo-banner';
  banner.textContent =
    'You are in the notes layer without a conductor. Everything here works — writing, '
    + 'invites, the directory. Publishing to the protocol is the one thing that needs your '
    + 'own agent key, and it will say so when you try.';
  wrap.appendChild(banner);
  wrap.appendChild(renderNotesTab(notesContext()));
  return wrap;
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
  titleRow.appendChild(renderThemeControl());
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

/** Light / dark / follow-the-OS, as a named control rather than a glyph
 * that cycles: three states cannot be read off a single icon, and the one
 * that matters most here — that 'System' is a live deferral to the OS and
 * not a third fixed palette — is exactly the one an icon cannot say.
 *
 * Changing it needs no re-render. The stylesheet is driven by data-theme on
 * the root element, so stamping that attribute repaints every surface at
 * once; tearing down and rebuilding the tree would only lose scroll position
 * and any half-typed claim. */
function renderThemeControl(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'theme-control';

  const select = document.createElement('select');
  select.className = 'theme-select';
  select.dataset.testid = 'theme-select';
  // Visible label omitted on purpose — the row is tight and the option text
  // is self-describing — so the accessible name has to come from here.
  select.setAttribute('aria-label', 'Colour theme');

  const options: Array<[ThemePreference, string]> = [
    ['system', 'System'], ['light', 'Light'], ['dark', 'Dark'],
  ];
  for (const [value, label] of options) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    select.appendChild(opt);
  }
  select.value = getThemePreference();
  select.onchange = () => { setThemePreference(select.value as ThemePreference); };

  wrap.appendChild(select);
  return wrap;
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

  // Inside Moss, the same prohibition as the Launcher below and for the same
  // reason — a Tool is handed its `AppClient` on `renderInfo.appletClient` and
  // has no Admin API (holochain.ts's header, shape 3) — but THREE states, not
  // two, because this path can also end in "the host is there and unusable".
  //
  // A cross-group render is the honest case of that: its `RenderInfo` arm
  // carries no `appletClient` at all, so there is nothing to connect to, and
  // the right answer is to say the view is not supported rather than to spin.
  // The other case is the measured one — `WeaveClient.connect()` never
  // resolves when render info is absent, so without the timeout in
  // `connectAppletHost` this screen is the LAST thing a Moss user would ever
  // see, permanently, with nothing in the console.
  if (appletConnecting || appletUnavailable) {
    const status = document.createElement('p');
    status.className = appletUnavailable ? 'hint error-box' : 'hint';
    status.dataset.testid = appletUnavailable ? 'applet-unavailable' : 'applet-connecting';
    status.textContent = appletUnavailable
      ? 'This Moss view is not one this Tool can render. Open the Tool\u2019s main '
        + 'view, or run the app on its own — nothing about it depends on Moss.'
      : 'Connecting through Moss\u2026';
    section.appendChild(status);
    return section;
  }

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
      // 6.16. Loaded on connect rather than when the Browse tab first
      // renders, because a render that starts a network read is a render
      // that can start several, and the list is wanted the first time
      // somebody opens Browse rather than the second. BOTH connect paths
      // call it, for the reason the taxonomy load above records: the one
      // that ships is the other one.
      void loadMyDomains();
    } catch (err) {
      errorBox.hidden = false;
      errorBox.textContent = err instanceof Error ? err.message : String(err);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Connect';
    }
  };

  section.appendChild(form);

  // The second door. A conductor is required to PUBLISH and to read the DHT;
  // it is not required to think, and the notes layer exists precisely so that
  // the two are not the same act.
  const softDoor = document.createElement('div');
  softDoor.className = 'soft-door';
  const softHint = document.createElement('p');
  softHint.className = 'hint';
  softHint.textContent =
    'Not ready for any of that yet? The notes layer is a shared, freeform place to think '
    + 'that never touches the DHT. Nothing there is published until you deliberately '
    + 'promote it, and that is the only step that needs a conductor.';
  softDoor.appendChild(softHint);
  const softBtn = document.createElement('button');
  softBtn.type = 'button';
  softBtn.className = 'link-button';
  softBtn.textContent = 'Go to the notes layer';
  softBtn.dataset.testid = 'connect-to-notes';
  softBtn.onclick = () => {
    notesWithoutConductor = true;
    onNotesTabOpened(notesContext());
    render();
  };
  softDoor.appendChild(softBtn);
  section.appendChild(softDoor);

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

type Tab = 'browse' | 'by-author' | 'membranes' | 'taxonomy' | 'worldline' | 'foresight' | 'new-claim' | 'notes';
let activeTab: Tab = 'browse';

function renderTabs(): HTMLElement {
  const wrap = document.createElement('div');

  const nav = document.createElement('nav');
  nav.className = 'tab-bar';
  const tabs: Array<[Tab, string]> = [
    ['browse', 'Browse'], ['by-author', 'By Author'],
    ['membranes', 'Domains'],
    ['taxonomy', 'Critique Types'], ['worldline', 'Worldline'],
    ['foresight', 'Foresight'],
    ['new-claim', 'New Claim'], ['notes', 'Notes'],
  ];
  for (const [tab, label] of tabs) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className = tab === activeTab ? 'tab active' : 'tab';
    btn.onclick = () => {
      // Leaving the notes tab hangs up on the room's parked long-poll. The
      // notes service caps concurrent polls per member, so a client that
      // wanders off holding sockets spends a ceiling meant to bound it.
      if (activeTab === 'notes' && tab !== 'notes') onNotesTabClosed();
      activeTab = tab;
      // The notes layer is a different service on the other end of a network
      // hop, so it is loaded when the tab is opened rather than on connect —
      // a practitioner who never opens it never talks to it at all.
      if (tab === 'notes') onNotesTabOpened(notesContext());
      // THE TAXONOMY'S FIGURES WERE AS OF CONNECT TIME AND NEVER MOVED.
      // `loadTaxonomy()` ran on connect and after proposing a species, and
      // nowhere else — so a session that added a critique, or whose peers
      // adopted a species, kept showing the adoption state it started with.
      // Found by a harness reading the screen instead of the zome: the old
      // check confirmed adoption rose through an INDEPENDENT client and never
      // looked at the tab again, so a stale count was invisible to it.
      //
      // It matters more now than it did as a bare count: "nobody has used it
      // yet" is a stronger false statement than a stale 0, and adoption BY
      // OTHER AGENTS is something this session cannot learn about any other
      // way.
      if (tab === 'taxonomy') void refreshTaxonomy().catch(() => { /* keeps what it has */ });
      render();
    };
    nav.appendChild(btn);
  }
  wrap.appendChild(nav);

  const content = document.createElement('main');
  content.className = 'tab-content';
  const step = renderNextStep();
  if (step) content.appendChild(step);
  content.appendChild(
    activeTab === 'browse' ? renderBrowseTab()
      : activeTab === 'by-author' ? renderByAuthorTab()
        : activeTab === 'membranes' ? renderMembranesTab()
          : activeTab === 'taxonomy' ? renderTaxonomyTab()
            : activeTab === 'worldline' ? renderWorldlineTab()
              : activeTab === 'foresight' ? renderForesightTab()
              : activeTab === 'notes' ? renderNotesTab(notesContext())
                : renderNewClaimTab(),
  );
  wrap.appendChild(content);

  return wrap;
}

// --- By Author tab ----------------------------------------------------
//
// `get_claims_by_agent` follows AgentToClaim links from an agent anchor, so
// this is a DHT-wide read of what one agent has published — not a lookup of
// a record the caller already holds. That distinction is the whole reason
// this screen exists: the function had been filed with three hash-addressed
// getters under the reasoning that a screen already holding the record does
// not need to call them, and that reasoning is true of those three and not
// of this one.
//
// INVARIANT 1 SHAPES THIS SCREEN, and it cuts both ways. It forbids a
// canonical comparative score, and it REQUIRES that raw history stay "open
// and queryable" — so an unranked list of what one agent has claimed is the
// shape the invariant protects rather than one it constrains. What would
// break it is not the list but the framing around it: arriving here by
// ranking agents, sorting the claims by anything readable as merit, or
// putting a total in the header that reads as a standing. So this screen
// takes one agent at a time and only because someone asked for that agent,
// renders the claims in the order the DHT returned them, and shows NO TALLY
// OF CLAIMS. A per-species adoption count is precedent for showing a number
// as a fact rather than a position, but agents are the thing Invariant 1 is
// actually about, and a claim tally next to a person is a great deal closer
// to karma than an adoption tally next to a critique type. Omitted on
// purpose; the list is right there to be counted by anyone who wants to.
//
// ONE NUMBER DOES NOW APPEAR HERE, AND THIS PARAGRAPH USED TO SAY "shows NO
// count" FLATLY, SO THE DISTINCTION IS WORTH STATING RATHER THAN ASSUMING.
// Row 6.15 put a count of CRITIQUES on each of the reader's OWN claims. That
// is a different object from the one refused above, in three ways that all
// have to hold at once:
//
//   - it is attached to a CLAIM, not to a person. "Two people disagreed with
//     this sentence" is a fact about the sentence; "this agent has made
//     fourteen claims" is a figure about the agent.
//   - it appears ONLY on the reader's own claims, so there is no second
//     number beside it to compare it with. A critique count rendered across
//     a domain's claims WOULD be comparative, and would quietly become the
//     ranking surface Invariant 1 exists to refuse — which is why nothing
//     outside `loadMyCritiqueCounts` ever writes that map.
//   - nothing is ordered by it, and no total is taken across claims. A sum
//     in the header would be precisely the "total that reads as a standing"
//     this paragraph already rules out, and the framing note below still
//     carries no digit at all — `author-scope-ui.mjs` asserts that.
//
// AND THE REASON FOR ADMITTING IT: there is no notification anywhere in this
// protocol, so without this number an author learns they were disagreed with
// only by reopening their own claim and looking. The first two critiques in
// the pilot's history were both delivered over Telegram. A disagreement
// protocol whose disagreements arrive by side channel has the side channel
// as a dependency.

function renderByAuthorTab(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'by-author';

  const searchRow = document.createElement('div');
  searchRow.className = 'search-row';
  const agentInput = document.createElement('input');
  agentInput.type = 'text';
  agentInput.placeholder = 'Agent key (base64)';
  agentInput.value = authorDraft;
  agentInput.oninput = () => { authorDraft = agentInput.value; };
  agentInput.setAttribute('data-testid', 'author-key-input');
  const loadBtn = document.createElement('button');
  loadBtn.textContent = 'Load claims';
  loadBtn.setAttribute('data-testid', 'author-load');
  loadBtn.onclick = () => void loadClaimsByAuthor(agentInput.value.trim());
  agentInput.onkeydown = (e) => { if (e.key === 'Enter') loadBtn.click(); };
  searchRow.appendChild(agentInput);
  searchRow.appendChild(loadBtn);
  // ROW 6.15. The reader's own listing was reachable only by pasting their
  // own base64 key into this box, which is the same unusability 6.16 was
  // about one screen over: a read that exists and that nobody can get to is
  // not a surface. It is also the ONLY listing that carries the critique
  // counts, so the route to it being awkward meant the answer to "did anyone
  // respond to me" was effectively unreachable.
  if (connection) {
    const mineBtn = document.createElement('button');
    mineBtn.textContent = 'Your claims';
    mineBtn.setAttribute('data-testid', 'author-mine');
    mineBtn.title = 'Your own claims, and how many critiques came back on each';
    mineBtn.onclick = () => void loadClaimsByAuthor(b64(connection!.myAgentPubKey));
    searchRow.appendChild(mineBtn);
  }
  section.appendChild(searchRow);

  const note = document.createElement('p');
  note.className = 'hint';
  note.setAttribute('data-testid', 'author-note');
  note.textContent =
    'Everything one agent has published, in the order the network returns it. '
    + 'This is a record, not a ranking: there is no score here, and no way to '
    + 'compare one agent with another.';
  section.appendChild(note);

  if (authorError) {
    const err = document.createElement('p');
    err.className = 'error';
    err.setAttribute('data-testid', 'author-error');
    err.textContent = authorError;
    section.appendChild(err);
    return section;
  }

  const list = document.createElement('div');
  list.className = 'claim-list';
  list.setAttribute('data-testid', 'author-claim-list');

  if (!currentAuthor) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'Enter an agent key above, or click an author on any claim.';
    list.appendChild(empty);
  } else if (!authorLoaded) {
    const loading = document.createElement('p');
    loading.className = 'hint';
    loading.textContent = 'Reading…';
    list.appendChild(loading);
  } else if (authorClaims.length === 0) {
    // A real answer, and a different one from "not asked yet".
    const none = document.createElement('p');
    none.className = 'hint';
    none.setAttribute('data-testid', 'author-empty');
    none.textContent = 'This agent has published no claims.';
    list.appendChild(none);
  }

  for (const claim of authorClaims) {
    list.appendChild(renderClaimCard(claim));
  }
  section.appendChild(list);

  return section;
}

// --- Browse tab -------------------------------------------------------

function renderBrowseTab(): HTMLElement {
  const section = document.createElement('section');

  const searchRow = document.createElement('div');
  searchRow.className = 'search-row';
  const domainInput = document.createElement('input');
  domainInput.type = 'text';
  domainInput.placeholder = 'Domain, e.g. LumbarRehab';
  // Named, so that what identifies this box across a rebuild (see
  // `focusKey`) is not the placeholder's wording, and so a harness driving
  // the input-loss checks does not have to match on prose either.
  domainInput.setAttribute('data-testid', 'browse-domain-input');
  domainInput.value = domainDraft;
  // Persisted on every keystroke, so a rebuild underneath restores what was
  // typed rather than replacing it with the last LOADED domain. See
  // `domainDraft`'s own comment for the failure this fixes.
  domainInput.oninput = () => { domainDraft = domainInput.value; };
  const loadBtn = document.createElement('button');
  loadBtn.textContent = 'Load claims';
  loadBtn.onclick = () => loadClaims(domainInput.value.trim(), true);
  domainInput.onkeydown = (e) => { if (e.key === 'Enter') loadBtn.click(); };
  searchRow.appendChild(domainInput);
  searchRow.appendChild(loadBtn);
  section.appendChild(searchRow);

  section.appendChild(renderWhereYouHaveBeen());

  // Four states where there was one, taken from By Author in this same file
  // rather than invented: a failure, a question not yet asked, a read in
  // flight, and a real empty answer. A conductor that is down, a domain
  // nobody has written in, and a button that was never pressed used to be
  // one indistinguishable sentence — and with an always-on node still the
  // only thing making a laptop's claims readable, the empty answer is the
  // one a participant sees most often.
  if (browseError) {
    const err = document.createElement('p');
    err.className = 'error';
    err.setAttribute('data-testid', 'browse-error');
    err.textContent = browseError;
    section.appendChild(err);
    return section;
  }

  const list = document.createElement('div');
  list.className = 'claim-list';
  list.setAttribute('data-testid', 'browse-claim-list');
  if (claims.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    if (!currentDomain) {
      empty.textContent = 'Enter a domain above and load its claims.';
    } else if (!browseLoaded) {
      empty.textContent = 'Reading…';
    } else {
      // A real answer, and a different one from "not asked yet". The wording
      // says the domain is empty rather than that the app failed to load it,
      // because an empty domain is an ordinary thing here: publishing does
      // not require founding, so a string with nothing behind it is as
      // likely to be a typo as a quiet field.
      empty.setAttribute('data-testid', 'browse-empty');
      empty.textContent = `No claims in "${currentDomain}". Nobody has published `
        + 'here, or the domain string is not the one you were given — it is an '
        + 'exact match, capitals and spaces included.';
    }
    list.appendChild(empty);
  }
  for (const claim of claims) {
    list.appendChild(renderClaimCard(claim));
  }
  section.appendChild(list);

  return section;
}

/** ROW 6.16 — the way back to a domain you have already been in.
 *
 * THE PILOT'S COMPLAINT WAS NEVER "I CANNOT DISCOVER NEW DOMAINS". It was
 * "I cannot get back to the one I was in ten minutes ago", and those were one
 * problem with the other until somebody who had to live with it separated
 * them. This is the second half; the first is 6.12's, and it is blocked.
 *
 * THE TWO LISTS ARE NOT MERGED, AND THE LABELS ARE THE POINT. The published
 * list is read off the chain, so it is true on any device and survives a
 * reinstall. The visited list is this browser's localStorage, because reading
 * is not an act the protocol records — it is losable, and it is the weaker of
 * the two. Merging them would produce one list with two different warranties
 * and no way for a reader to tell which line carried which, which is exactly
 * the mistake the Worldline route makes by looking complete while being a
 * frozen snapshot.
 *
 * NOTHING IS COUNTED AND NOTHING IS ORDERED BY ANYTHING BUT RECENCY and the
 * order the network returned. A busiest-domains list would be a ranking, and
 * Invariant 1 is about exactly that. */
function renderWhereYouHaveBeen(): HTMLElement {
  const block = document.createElement('div');
  block.className = 'where-youve-been';
  block.setAttribute('data-testid', 'where-youve-been');

  // Published first, because it is the list with the stronger claim behind
  // it, and the one a reader can trust from a machine they have never used.
  const visitedOnly = visitedDomains.filter((d) => !myDomains.includes(d));
  if (myDomains.length === 0 && visitedOnly.length === 0) {
    // Not an error and not worth a sentence: a reader who has published
    // nothing and loaded nothing has nothing to go back to, and the box
    // above already says what to do.
    block.hidden = true;
    return block;
  }

  const group = (label: string, domains: string[], testid: string, hint?: string) => {
    if (domains.length === 0) return;
    const row = document.createElement('div');
    row.className = 'domain-recall';
    const title = document.createElement('p');
    title.className = 'hint';
    title.textContent = label;
    row.appendChild(title);
    const chips = document.createElement('div');
    chips.className = 'domain-chips';
    chips.setAttribute('data-testid', testid);
    for (const domain of domains) {
      const chip = document.createElement('button');
      chip.className = 'domain-chip';
      chip.textContent = domain;
      chip.title = `Load the claims in ${domain}`;
      chip.onclick = () => { void loadClaims(domain); };
      chips.appendChild(chip);
    }
    row.appendChild(chips);
    if (hint) {
      const note = document.createElement('p');
      note.className = 'hint subtle';
      note.textContent = hint;
      row.appendChild(note);
    }
    block.appendChild(row);
  };

  group('Domains you have published in', myDomains, 'my-domains');
  group(
    'Domains you have loaded on this device',
    visitedOnly,
    'visited-domains',
    'This half is remembered by this browser only — reading is not something '
    + 'the protocol records, so it is lost if you clear your data or move to '
    + 'another machine. The list above is read from your own chain and is not.',
  );

  return block;
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
  meta.append(`${claim.entry.confidence} confidence · by `);
  // The byline is the way into the By Author tab, because that is where a
  // reader actually forms the question: they are looking at one claim and
  // want the rest of what this agent has said. Requiring them to copy a
  // base64 key into a box would make the read technically reachable and
  // practically unused. The tab still takes a typed key, so the affordance
  // is a shortcut rather than the only route.
  const authorBtn = document.createElement('button');
  authorBtn.className = 'author-link';
  authorBtn.textContent = short(claim.entry.author);
  authorBtn.title = 'See what else this agent has claimed';
  authorBtn.onclick = () => {
    activeTab = 'by-author';
    void loadClaimsByAuthor(b64(claim.entry.author));
  };
  meta.appendChild(authorBtn);
  // 6.12's cheap half. The card printed content, confidence and author and
  // never the claim's own domain, so a reader who arrived from anywhere but
  // the Browse box — the By Author tab, a critique, a link passed in chat —
  // could not learn the one string that would show them its neighbours. The
  // byline carried them to an agent when the question was about a field.
  //
  // A button for the same reason the byline is one: copying a string out of
  // a card and into a box is the move nobody makes. It routes through
  // `loadClaims` with `fromTheBox` false, which is the case that function's
  // own comment already described as "following a domain from a card".
  meta.append(' · in ');
  const domainBtn = document.createElement('button');
  domainBtn.className = 'domain-link';
  domainBtn.setAttribute('data-testid', 'claim-domain');
  domainBtn.textContent = claim.entry.domain;
  domainBtn.title = 'Browse the other claims in this domain';
  domainBtn.onclick = () => {
    activeTab = 'browse';
    void loadClaims(claim.entry.domain);
  };
  meta.appendChild(domainBtn);
  card.appendChild(meta);

  // ROW 6.15's pull half, rendered where the author will see it.
  //
  // THREE STATES, NOT TWO, and the middle one is the whole point: no entry in
  // the map means nobody has asked yet, and 0 means somebody asked and the
  // answer was none. Telling an author they are unchallenged before the read
  // has returned is the expensive version of this screen, and it is exactly
  // the defect 6.13 closed on the Browse tab one screen over.
  //
  // It can only ever appear on the reader's own claims, because
  // `loadMyCritiqueCounts` is the only writer of that map — see the Invariant
  // 1 note above `renderByAuthorTab` for why that restriction is load-bearing
  // rather than incidental.
  const mineForCount = connection
    && b64(claim.entry.author) === b64(connection.myAgentPubKey);
  if (mineForCount && myCritiqueCounts.has(key)) {
    const n = myCritiqueCounts.get(key)!;
    const line = document.createElement('p');
    line.className = n > 0 ? 'critique-count answered' : 'critique-count';
    line.setAttribute('data-testid', 'critique-count');
    line.dataset.count = String(n);
    // Says what happened, and does not say what to do about it. An
    // instruction here would be the attention ordering the row's `[D]` half
    // is still undecided about; a fact is not.
    line.textContent = n === 0
      ? 'No critiques on this yet.'
      : n === 1
        ? '1 critique on this claim.'
        : `${n} critiques on this claim.`;
    card.appendChild(line);
  }
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

    // WHAT THE AUTHOR BELIEVES NOW — 6.14's read half, and it is half of the
    // row rather than a nicety. `RetractionToReplacement` was written by
    // nothing reachable and read by nothing at all; adding the producer alone
    // would have left a link type with a writer and no reader, which is the
    // "declared but unread" shape this list keeps finding and the row itself
    // complains about.
    //
    // A retraction with no replacement says *I was wrong*; one WITH a
    // replacement says *I was wrong, and here is what I think now* — and the
    // second is the only structure that lets a reader follow a position
    // FORWARD through an author's own corrections instead of finding a
    // withdrawn claim and stopping.
    if (retraction.entry.replacement_claim) {
      card.appendChild(renderReplacementLine(retraction.entry.replacement_claim));
    }
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

    // The chain itself. See GroundingStep's note for why these two getters
    // are called here and nowhere else in this UI.
    //
    // Offered for an UNGROUNDED claim too, deliberately. GroundingPath's doc
    // comment says the last node of a failed walk is where it broke down, and
    // "which citation dead-ends" is the more useful answer of the two — a
    // reader who cannot see where support ran out has only been told that it
    // did. Nothing here ranks one state above the other; §2's position is that
    // an ungrounded claim is valid and unranked, and showing its chain is
    // showing what it cites, not scoring it.
    const chainBtn = document.createElement('button');
    chainBtn.className = 'link-button';
    chainBtn.dataset.testid = 'chain-toggle';
    const chainIsOpen = chainOpen.has(key);
    chainBtn.textContent = chainIsOpen
      ? 'Hide the chain'
      : grounding.grounded ? 'Read the evidence chain' : 'See where the chain breaks';
    chainBtn.onclick = () => {
      if (chainIsOpen) { chainOpen.delete(key); render(); return; }
      chainOpen.add(key);
      if (!chainByClaim.has(key)) void loadGroundingChain(claim);
      else render();
    };
    card.appendChild(chainBtn);

    if (chainIsOpen) {
      const panel = document.createElement('div');
      panel.className = 'chain-panel';
      panel.dataset.testid = 'chain-panel';

      const steps = chainByClaim.get(key);
      if (chainLoading.has(key)) {
        const p2 = document.createElement('p');
        p2.className = 'hint';
        p2.textContent = 'Reading the chain…';
        panel.appendChild(p2);
      } else if (!steps || steps.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'hint';
        empty.dataset.testid = 'chain-empty';
        empty.textContent = 'The walk returned no path.';
        panel.appendChild(empty);
      } else {
        steps.forEach((step, i) => {
          const row = document.createElement('div');
          row.className = 'chain-step';
          row.dataset.testid = 'chain-step';

          const ord = document.createElement('span');
          ord.className = 'chain-ord';
          // The queried claim is its own first node, named as such rather
          // than numbered — a reader should not have to work out that step 1
          // is the thing they are already looking at.
          ord.textContent = i === 0 ? 'this claim' : `${i}.`;
          row.appendChild(ord);

          const body = document.createElement('span');
          body.className = 'chain-body';
          if (step.kind === 'claim') {
            const what = document.createElement('span');
            what.className = 'chain-kind';
            what.textContent = 'Claim';
            body.appendChild(what);
            body.appendChild(document.createTextNode(` ${step.claim.content}`));
          } else if (step.kind === 'evidence') {
            const what = document.createElement('span');
            what.className = 'chain-kind chain-kind-evidence';
            // The TYPE is part of the answer, not decoration: "a study" and
            // "a case report" terminate a regress differently, and §2 makes
            // evidence_type a required field rather than a label.
            what.textContent = step.evidence.evidence_type;
            body.appendChild(what);
            body.appendChild(document.createTextNode(` ${step.evidence.content}`));
            if (step.evidence.source_url) {
              // Rendered as text, NOT as an anchor. A claim's cited source is
              // a string some agent published; turning it into a live link
              // would have this client vouch for where it points.
              const src = document.createElement('span');
              src.className = 'chain-source';
              src.dataset.testid = 'chain-source';
              src.textContent = step.evidence.source_url;
              body.appendChild(src);
            }
          } else {
            const what = document.createElement('span');
            what.className = 'chain-kind chain-kind-unresolved';
            what.textContent = 'unresolved';
            body.appendChild(what);
            body.appendChild(document.createTextNode(
              ` ${short(step.hash)} — the walk reached this and this client could not read it`,
            ));
          }
          row.appendChild(body);
          panel.appendChild(row);
        });

        // What the END of the chain means, stated once beneath it. The badge
        // states grounded-or-not as a fact about the walk; this says what the
        // walk does and does not establish, because "reaches a source" is
        // easily read as "is true".
        const note = document.createElement('p');
        note.className = 'hint';
        note.dataset.testid = 'chain-note';
        note.textContent = grounding.grounded
          ? 'The chain terminates in Evidence. That is a statement about '
            + 'citation, not about truth: nothing here checks whether the '
            + 'evidence supports the claim, and no part of the protocol scores it.'
          : 'The chain does not reach Evidence. An ungrounded claim is valid '
            + 'here and nothing gates on it — this shows what it cites and '
            + 'where the citations run out, nothing more.';
        panel.appendChild(note);
      }
      card.appendChild(panel);
    }
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
  // The LABEL IS UNCHANGED and the testid is additive: three harnesses
  // click this button by its exact text, so renaming it would break
  // them for no gain. The testid exists so the fourth does not have to.
  toggleBtn.dataset.testid = 'toggle-critiques';
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
      else {
        retractingClaims.add(key);
        // Loaded when the form OPENS rather than on connect, because this is
        // a whole-source-chain read for one optional field on one form — the
        // same reasoning the notes tab's own load uses. Fired here and not
        // inside `renderRetractForm`, so a render cannot start a read.
        //
        // EVERY OPEN, NOT ONLY THE FIRST, and the `=== null` guard this
        // replaced was a staleness bug with a plausible path: open a retract
        // form, cancel, publish the narrower claim, reopen — and the picker
        // would still be offering the list from before the claim it exists
        // to point at. That is 6.16's rule in a second place (re-read rather
        // than append locally), and the cost is one chain read per opening of
        // a form that is already a deliberate act. A list already on screen
        // stays on screen while the re-read runs, so there is no flicker and
        // nothing an author could pick is anything but a claim that exists.
        void loadMyClaimsForReplacement();
      }
      render();
    };
    card.appendChild(retractBtn);
    if (retractingClaims.has(key)) card.appendChild(renderRetractForm(claim));
  }

  // OFFERED ON ANY CLAIM, NOT ONLY YOUR OWN, because predicting an answer to
  // somebody else's question is the ordinary case — and validation requires
  // only that the question PREDATE the commitment, which any existing claim
  // does. This control is the whole of 6.8's fix: it carries `actionHash`
  // into the commit form so the question is chosen by pointing at it.
  const predictBtn = document.createElement('button');
  predictBtn.className = 'link-button';
  predictBtn.dataset.testid = 'predict-about-claim';
  predictBtn.textContent = 'Commit a prediction about this';
  predictBtn.onclick = () => {
    foresightPrefill = { question: claim.actionHash, content: claim.entry.content };
    foresightFormOpen = true;
    activeTab = 'foresight';
    render();
  };
  card.appendChild(predictBtn);

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
    // AFTER the critiques, deliberately. A critique says what is wrong
    // with the claim and carries its own reasoning; an assessment says
    // where somebody stands. Putting positions first would invite a
    // reader to take a side before reading the objections, which is the
    // ordering §2.5 already refuses for the approximate-versus-exact
    // reads — the specific argument comes before the summary stance.
    const positions = renderAssessmentPanel(claim);
    if (positions) card.appendChild(positions);
  }

  // --- Neighborhood resonance, the approximate half of HRR ------------
  //
  // PLACED AFTER the grounding badge and the critique toggle, deliberately.
  // §2.5's rule is that the approximate reading never displaces the exact
  // one, and on a screen "never displaces" is a question of document order
  // as much as of wording: the evidence chain and the critique stack are
  // the exact answers and they come first. worldline-ui.mjs already checks
  // that ordering for the other half of HRR; author-scope of this one is
  // checked the same way.
  const resonanceBtn = document.createElement('button');
  resonanceBtn.className = 'link-button';
  resonanceBtn.dataset.testid = 'resonance-toggle';
  const probeOpen = resonanceOpen.has(key);
  resonanceBtn.textContent = probeOpen ? 'Hide resonance probe' : 'Probe neighborhood resonance';
  resonanceBtn.onclick = () => {
    if (probeOpen) { resonanceOpen.delete(key); render(); return; }
    resonanceOpen.add(key);
    if (!resonanceByClaim.has(key)) void loadResonance(claim);
    else render();
  };
  card.appendChild(resonanceBtn);

  if (probeOpen) {
    const panel = document.createElement('div');
    panel.className = 'resonance-panel';
    panel.dataset.testid = 'resonance-panel';

    const caveat = document.createElement('p');
    caveat.className = 'hint';
    caveat.dataset.testid = 'neighborhood-caveat';
    // WHAT THIS LIST IS, STATED PLAINLY, for the same reason the worldline
    // probe states it: the coordinator applies NO THRESHOLD. It scores every
    // candidate handed to it and returns them all, so probing claims with no
    // relationship to this one still produces a full list — just with low
    // scores. Rendering that identically to a set of findings is how an
    // approximate probe becomes a truth engine through presentation rather
    // than through the number.
    caveat.textContent =
      'Unbinding is lossy by construction, and this scores every claim currently '
      + 'loaded in this domain rather than selecting matches — there is no threshold, '
      + 'so claims unrelated to this one still appear, just with low scores. A high '
      + 'score is a hint worth checking, not a claim of fact: the evidence chain and '
      + 'critiques above are the exact answer, and every row below points at a claim '
      + 'you can open and read for yourself.';
    panel.appendChild(caveat);

    const recalls = resonanceByClaim.get(key);
    if (resonanceLoading.has(key)) {
      const p2 = document.createElement('p');
      p2.className = 'hint';
      p2.textContent = 'Probing…';
      panel.appendChild(p2);
    } else if (!recalls || recalls.length === 0) {
      // A legitimate answer, not a failure: nothing to resonate with is
      // exactly what a claim with no other claims loaded beside it means.
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.dataset.testid = 'resonance-empty';
      empty.textContent = recalls
        ? 'Nothing to probe against — load more claims in this domain first.'
        : 'Nothing to probe against yet.';
      panel.appendChild(empty);
    } else {
      const byHash = new Map(claims.map((c) => [b64(c.entryHash), c]));
      for (const r of [...recalls].sort((a, b) => b.similarity - a.similarity)) {
        const row = document.createElement('div');
        row.className = 'resonance-row';
        row.dataset.testid = 'resonance-row';
        const target = byHash.get(b64(r.source_hash));
        const score = document.createElement('span');
        score.className = 'resonance-score';
        score.dataset.testid = 'resonance-score';
        // A tilde and two decimals, never a percentage. "73% match" states a
        // measurement; "~0.73" states an approximation, which is what this is.
        score.textContent = `~${r.similarity.toFixed(2)}`;
        const label = document.createElement('span');
        label.className = 'resonance-label';
        label.textContent = ` as ${r.kind} — ${target ? target.entry.content.slice(0, 60) : short(r.source_hash)}`;
        row.appendChild(score);
        row.appendChild(label);
        panel.appendChild(row);
      }
    }
    card.appendChild(panel);
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

/** The author's own claims, read once per form opening.
 *
 *  `get_claims_by_agent` on the caller's OWN key. That read is already how
 *  the By Author tab works, so nothing new is asked of the protocol — and it
 *  returns records rather than entries, which is what makes a picker possible
 *  at all: `replacement_claim` is an `EntryHash` and a human cannot type one. */
async function loadMyClaimsForReplacement(): Promise<void> {
  if (!connection || myClaimsReplacementLoading) return;
  const conn = connection;
  myClaimsReplacementLoading = true;
  myClaimsReplacementError = '';
  render();
  try {
    const records = await conn.callZome<unknown[]>('get_claims_by_agent', conn.myAgentPubKey);
    myClaimsForReplacement = decodeRecords<Claim>(records);
  } catch (err) {
    // Left as `null` — never set to `[]` on a failure. An empty list and a
    // read that did not happen render different sentences below, and
    // collapsing them would tell an author they have nothing to point at
    // when the truth is that nobody asked.
    myClaimsForReplacement = null;
    myClaimsReplacementError = err instanceof Error ? err.message : String(err);
  } finally {
    myClaimsReplacementLoading = false;
    render();
  }
}

/** Reads a claim named as a replacement, for the banner on the read side.
 *
 *  KEYED BY THE REPLACEMENT'S HASH, not by the retracted claim's, so two
 *  retractions naming the same replacement share one read. */
async function loadReplacementClaim(hash: Uint8Array): Promise<void> {
  if (!connection) return;
  const key = b64(hash);
  if (replacementClaimByHash.has(key) || replacementReading.has(key)) return;
  const conn = connection;
  replacementReading.add(key);
  replacementReadFailed.delete(key);
  try {
    const claim = await conn.callZome<Claim | null>('get_claim', hash);
    replacementClaimByHash.set(key, claim ?? null);
  } catch (err) {
    replacementReadFailed.set(key, err instanceof Error ? err.message : String(err));
  } finally {
    replacementReading.delete(key);
    render();
  }
}

/** The replacement, on the read side: *what the author believes now*.
 *
 *  FOUR STATES, AND THE THIRD IS THE ONE THAT MATTERS ON A DHT. A read that
 *  returned nothing is NOT proof the replacement does not exist — nobody
 *  reachable is holding it yet is the likelier answer, and the retraction
 *  itself is permanent evidence that the author named something. So the
 *  absent case reports the read and never the claim's existence, which is
 *  6.13's finding and the one the applet asset surface got wrong first.
 *
 *  RENDERED READ-ONLY, with no critique or retraction controls, and the
 *  reason is the same trap `renderAppletAsset` hit: `get_claim` answers with
 *  a `Claim` and not a record, so there is no `entryHash` to key those
 *  controls with. The replacement's own card — with every control on it —
 *  is one domain button away, and a control that looks live and reads
 *  nothing would be worse than not offering it. */
function renderReplacementLine(hash: Uint8Array): HTMLElement {
  const key = b64(hash);
  const line = document.createElement('div');
  line.className = 'retraction-banner';
  line.dataset.testid = 'replacement-line';

  const failure = replacementReadFailed.get(key);
  if (failure) {
    line.dataset.state = 'error';
    line.textContent = `The author named what they believe now, and it could not be read: ${failure}`;
    return line;
  }
  if (!replacementClaimByHash.has(key)) {
    // Covers both "not asked yet" and "in flight", deliberately: see
    // `AppletAssetState` for why those are one sentence to a reader.
    line.dataset.state = 'reading';
    line.textContent = 'Looking up what the author believes now…';
    return line;
  }
  const replacement = replacementClaimByHash.get(key) ?? null;
  if (!replacement) {
    line.dataset.state = 'absent';
    line.textContent =
      'The author named what they believe now, and nothing came back for it. '
      + 'On a DHT that means nobody reachable is holding it yet — not that it '
      + 'does not exist.';
    return line;
  }

  line.dataset.state = 'ready';
  const lead = document.createElement('span');
  lead.textContent = 'What the author believes now: ';
  line.appendChild(lead);
  const content = document.createElement('span');
  content.dataset.testid = 'replacement-content';
  content.textContent = replacement.content;
  line.appendChild(content);
  // The same breadcrumb 6.12 built, for the same reason: a reader who can see
  // the replacement and not reach it has been shown a dead end.
  const go = document.createElement('button');
  go.className = 'author-link';
  go.dataset.testid = 'replacement-domain';
  go.textContent = replacement.domain;
  go.onclick = () => {
    activeTab = 'browse';
    void loadClaims(replacement.domain);
  };
  line.append(' · in ');
  line.appendChild(go);
  return line;
}

/** The replacement picker: *what I believe now*, over claims that exist.
 *
 *  FOUR STATES AND THE EMPTY ONE CARRIES THE ROW'S OPEN DECISION. A reader
 *  who has published nothing else is not being told "no" — they are being
 *  told the order this protocol currently requires, which is the `[D]` half
 *  of 6.14 and is not a thing this form can decide for them.
 *
 *  THE CLAIM BEING RETRACTED IS EXCLUDED, and that is the client refusing
 *  something validation permits. `validate_retraction` checks only that a
 *  named `replacement_claim` EXISTS (`must_get_entry`) — it does not require
 *  the replacement to differ from the target, nor to be the author's own, nor
 *  even to be a `Claim`. So a retraction naming itself as its own replacement
 *  validates today, and a reader following it loops. Filed as an observation
 *  on 6.14 rather than fixed here: closing it is an integrity-zome change and
 *  a protocol version bump, which this row is not. */
function renderReplacementPicker(claim: DecodedRecord<Claim>): HTMLElement {
  const key = b64(claim.entryHash);
  const wrap = document.createElement('div');
  wrap.dataset.testid = 'replacement-picker';

  const label = document.createElement('p');
  label.className = 'hint';
  label.textContent = 'Optional — what you believe now, if you have already published it:';
  wrap.appendChild(label);

  if (myClaimsReplacementError) {
    const err = document.createElement('p');
    err.className = 'hint error-box';
    err.dataset.testid = 'replacement-error';
    err.textContent = `Could not read your own claims, so there is nothing to choose from: ${myClaimsReplacementError}`;
    wrap.appendChild(err);
    return wrap;
  }
  // `unasked` and `reading` render the same sentence, for the reason
  // `AppletAssetState` gives: to a reader they are one fact, and the
  // alternative is a negative answer shown before the question was asked.
  if (myClaimsForReplacement === null || myClaimsReplacementLoading) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.dataset.testid = 'replacement-loading';
    p.textContent = 'Looking up your own claims…';
    wrap.appendChild(p);
    return wrap;
  }

  const candidates = myClaimsForReplacement.filter((c) => b64(c.entryHash) !== key);
  if (candidates.length === 0) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.dataset.testid = 'replacement-none-available';
    // SAYS THE ORDER, because the order is the surprising part and it is the
    // row's open decision rather than a limitation of this screen.
    p.textContent =
      'You have not published anything else yet, so there is nothing to point at. '
      + 'A replacement has to exist before a retraction can name it — publish the '
      + 'narrower claim first, then retract this one and choose it here. Retracting '
      + 'without a replacement is a complete act on its own.';
    wrap.appendChild(p);
    return wrap;
  }

  const select = document.createElement('select');
  select.dataset.testid = 'replacement-select';
  const chosen = replacementChoice.get(key) ?? '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = '— none —';
  if (chosen === '') none.selected = true;
  select.appendChild(none);
  for (const candidate of candidates) {
    const opt = document.createElement('option');
    opt.value = b64(candidate.entryHash);
    // The domain is in the label because two claims of the author's can read
    // alike out of context, and the domain is the thing that tells them apart.
    const text = candidate.entry.content.trim();
    opt.textContent = `${text.length > 70 ? `${text.slice(0, 69)}…` : text} · ${candidate.entry.domain}`;
    if (opt.value === chosen) opt.selected = true;
    select.appendChild(opt);
  }
  select.onchange = () => { replacementChoice.set(key, select.value); };
  wrap.appendChild(select);
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

  // AFTER the reason and before the button, because the reason is required
  // and this is not: an optional field above a required one invites somebody
  // to treat the required one as optional too.
  form.appendChild(renderReplacementPicker(claim));

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
    // 6.14's write half. Read out of module state and NOT off the `<select>`
    // — see `replacementChoice` for why a background render would otherwise
    // reset this to "none" silently.
    const chosen = replacementChoice.get(key) ?? '';
    let replacement: Uint8Array | null = null;
    if (chosen) {
      try {
        replacement = bytesFromB64(chosen);
      } catch {
        error.hidden = false;
        error.textContent = 'That replacement could not be read. Reopen the form and choose again.';
        return;
      }
      // Belt to the picker's braces. The picker cannot offer the retracted
      // claim, so reaching this needs stale state — but validation PERMITS a
      // self-replacement (`validate_retraction` only checks the replacement
      // exists), so nothing downstream would refuse it, and a retraction
      // pointing at the claim it retracts is a loop in a permanent record.
      if (b64(replacement) === key) {
        error.hidden = false;
        error.textContent =
          'A claim cannot replace itself. Choose a different claim, or retract '
          + 'without naming a replacement.';
        return;
      }
    }
    submit.disabled = true;
    try {
      await connection.callZome('create_retraction', {
        target_claim: claim.entryHash,
        reason: reason.value.trim(),
        replacement_claim: replacement,
        author: connection.myAgentPubKey,
        timestamp: nowMicros(),
      });
      retractingClaims.delete(key);
      replacementChoice.delete(key);
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

/** The past-cone state of one entry, as a line a reader can act on.
 *
 * THIS IS open-work 6.1's RULE, AND IT IS THE WHOLE REASON THE FUNCTION
 * EXISTS: `cone_recorded` must be rendered as prominently as the cone
 * itself, or silence reads as ignorance. An absent cone means the
 * author RECORDED NOTHING about what they had seen. It does NOT mean
 * they had seen nothing, and on a screen the difference is everything —
 * "saw no objections" is a claim about the author's knowledge that
 * nobody made and no rule can check.
 *
 * 6.1 WAS BLOCKED AND IS NOT ANY MORE, which is why this is now worth
 * drawing. The row was reclassified as blocked on 6.5 because
 * `cone_recorded` was false for every entry in existence — nothing
 * populated the field, so this line could render one state and only
 * one, and a one-state indicator teaches nothing. As of 2026-10-28 an
 * SDK agent records a cone that is true by construction, so both states
 * occur and the distinction is finally observable.
 *
 * THERE ARE EXACTLY TWO STATES AND AN EMPTY CONE IS THE SECOND ONE.
 * This is the protocol's own definition, not a rendering choice:
 * `critiques_unseen_by` computes `cone_recorded = !past_cone.is_empty()`,
 * so an empty cone IS "not recorded" and there is no third state for a
 * client to draw. The first version of this function invented one — it
 * treated `[]` as a positive claim of having seen none of the siblings
 * and said so on screen — which is exactly the over-claim this row
 * exists to prevent, committed by the very code meant to prevent it.
 * Caught by `positions-ui.mjs` §4 failing against correct UI behaviour.
 *
 * It is also unrepresentable even in principle: `past_cone` is a
 * `Vec<ActionHash>` with `#[serde(default)]`, so a field the client
 * omits and a field it sends as `[]` are THE SAME STORED VALUE. A
 * client cannot tell them apart and must not imply it can. The
 * coordinator's own note says the honest reading in as many words — "an
 * author whose client does not populate cones is silent, not
 * uninformed."
 *
 * `always` makes the not-recorded case state itself even when it would
 * otherwise be left bare: in a list where one entry says what it saw,
 * an unmarked neighbour reads as the weaker claim by implication. */
function renderConeState(
  cone: Uint8Array[] | undefined,
  always: boolean,
): HTMLElement | null {
  const n = Array.isArray(cone) ? cone.length : 0;
  const recorded = n > 0;
  if (!recorded && !always) return null;
  const line = document.createElement('p');
  line.className = 'hint cone-state';
  line.dataset.testid = recorded ? 'cone-recorded' : 'cone-absent';
  line.textContent = recorded
    ? `Recorded having seen ${n} other objection${n === 1 ? '' : 's'} to this claim.`
    : 'Recorded nothing about what had already been said — which is not the '
      + 'same as having seen nothing.';
  return line;
}

/** The DENOMINATOR for one critique's cone, and the set it leaves out.
 *
 * THIS IS THE SECOND HALF OF open-work 6.1, AND THE FIRST HALF IS WHAT
 * MAKES IT SAFE TO DRAW. `renderConeState` already settles the rule
 * that carried this row for weeks: an absent cone says the author
 * RECORDED NOTHING, never that they saw nothing, and both states are
 * drawn at the same typographic weight. What was still unsurfaced is
 * `critiques_unseen_by` itself — the query that knows how many sibling
 * critiques exist and which of them the cone omits. Without it the
 * screen showed a numerator with the denominator hidden.
 *
 * WHY THE QUERY WAS HELD BACK AT ALL, because it is the thing to not
 * undo: a list captioned "objections this author did not see", placed
 * under an objection, reads as an accusation. And it would be a FALSE
 * one in the common case — `past_cone` is `#[serde(default)]`, so for
 * every critique written by a client that does not send the field the
 * "unseen" list is simply every sibling, and rendering it as a gap
 * manufactures a finding out of a missing feature.
 *
 * SO THE SET IS OFFERED IN ONE BRANCH AND REFUSED IN THE OTHER, and
 * that asymmetry is the honest one rather than a lapse from the
 * equal-weight rule. The equal-weight rule governs the STATE: both
 * branches state themselves, in a line of the same class and the same
 * weight, and neither is left bare. The SET is a different object. When
 * a cone was recorded, the omitted siblings are a real and checkable
 * gap in a statement its author chose to make, so they can be listed.
 * When no cone was recorded there is no statement to have a gap in —
 * the "set" is every objection already rendered above it — so this
 * says why there is nothing to show instead of offering a disclosure
 * that would list the author's neighbours under an accusing caption.
 *
 * THE COORDINATOR'S OWN `note` IS RENDERED, NOT PARAPHRASED. The
 * division of labour is deliberate: this client states the FIGURES,
 * which it can check, and the protocol states WHAT THEY SUPPORT, which
 * is a judgement SPEC §9 writes down and a client should not drift
 * from. A paraphrase here would be a second place for that wording to
 * rot, and open-work 1.20 is this repository's record of what happens
 * to duplicated prose claims.
 *
 * EVERY FIGURE CARRIES "this reader", because `total_known` is one
 * observer's count over its own arc at read time. "Recorded seeing 1 of
 * 2" stated flatly is a claim about the world; another peer may know of
 * forty. */
/** The vocabulary that differs between the two cones, and nothing else.
 *
 * ONE IMPLEMENTATION, TWO NOUNS, AND THE SPLIT IS DELIBERATELY THIN.
 * The honesty rules below — equal weight for both states, the set
 * withheld where there is no statement for it to be a gap in, the
 * protocol's note relayed verbatim, the denial rendered before the list
 * — must be the SAME rules on both surfaces, and two copies of them
 * would drift. What legitimately differs is only the words: a
 * critique's cone is drawn from its SIBLING critiques, an assessment's
 * from the target's critiques, so one says "other objection" and the
 * other says "objection"; and the inference each must deny is
 * different — ignoring an objection, against taking a position in spite
 * of one. */
interface ConeVocabulary {
  /** `data-testid` prefix. The two surfaces are counted separately by
   * `positions-ui.mjs`, so they must not share testids. */
  testid: string;
  /** "other objection" or "objection" — singular; the plural "s" is
   * appended. */
  noun: string;
  /** "author" or "assessor". */
  who: string;
  /** What the denial must rule out, in the caption above the set. */
  denies: string;
}

const CRITIQUE_CONE: ConeVocabulary = {
  testid: 'unseen',
  noun: 'other objection',
  who: 'author',
  denies: 'ignored them',
};

const ASSESSMENT_CONE: ConeVocabulary = {
  testid: 'assessment-unseen',
  noun: 'objection',
  who: 'assessor',
  denies: 'took a position anyway',
};

/** The shape both reports share. `UnseenReport.critique` and
 * `AssessmentUnseenReport.assessment` differ in name and are not read
 * here; everything this renders is common to both. */
type AnyUnseenReport = {
  unseen: Uint8Array[];
  seen_count: number;
  cone_recorded: boolean;
  total_known: number;
  note: string;
};

/** The DENOMINATOR for one cone, and the set it leaves out.
 *
 * THIS IS THE SECOND HALF OF open-work 6.1, AND THE FIRST HALF IS WHAT
 * MAKES IT SAFE TO DRAW. `renderConeState` already settles the rule
 * that carried this row for weeks: an absent cone says the author
 * RECORDED NOTHING, never that they saw nothing, and both states are
 * drawn at the same typographic weight. What was still unsurfaced is
 * the query that knows how many critiques exist and which of them the
 * cone omits. Without it the screen showed a numerator with the
 * denominator hidden.
 *
 * WHY THE QUERY WAS HELD BACK AT ALL, because it is the thing to not
 * undo: a list captioned "objections this author did not see", placed
 * under an objection, reads as an accusation. And it would be a FALSE
 * one in the common case — `past_cone` is `#[serde(default)]`, so for
 * every entry written by a client that does not send the field the
 * "unseen" list is simply every critique, and rendering it as a gap
 * manufactures a finding out of a missing feature.
 *
 * SO THE SET IS OFFERED IN ONE BRANCH AND REFUSED IN THE OTHERS, and
 * that asymmetry is the honest one rather than a lapse from the
 * equal-weight rule. The equal-weight rule governs the STATE: every
 * branch states itself, in a line of the same class and the same
 * weight, and none is left bare. The SET is a different object. When a
 * cone was recorded, the omitted critiques are a real and checkable gap
 * in a statement its author chose to make, so they can be listed. When
 * no cone was recorded there is no statement to have a gap in — the
 * "set" is every objection already rendered nearby — so this says why
 * there is nothing to show instead of offering a disclosure that would
 * list the author's neighbours under an accusing caption.
 *
 * AND WHEN THERE IS NOTHING TO HAVE SEEN, IT SAYS THAT INSTEAD. A
 * `total_known` of zero is not a silent author: there were no
 * objections to record. The not-recorded wording would be true and
 * would still mislead, because it invites a reader to wonder what was
 * missed when the answer is *nothing existed*. That branch was latent
 * on the critique side too — a claim's only critique has no siblings —
 * and was found by asking what the assessment side does on a claim
 * nobody has critiqued, which is the ordinary case there.
 *
 * THE COORDINATOR'S OWN `note` IS RENDERED, NOT PARAPHRASED. The
 * division of labour is deliberate: this client states the FIGURES,
 * which it can check, and the protocol states WHAT THEY SUPPORT, which
 * is a judgement SPEC §9 writes down and a client should not drift
 * from. A paraphrase here would be a second place for that wording to
 * rot, and open-work 1.20 is this repository's record of what happens
 * to duplicated prose claims.
 *
 * EVERY FIGURE CARRIES "this reader", because `total_known` is one
 * observer's count over its own arc at read time. "Recorded seeing 1 of
 * 2" stated flatly is a claim about the world; another peer may know of
 * forty. */
function renderUnseenBox(
  report: AnyUnseenReport | undefined,
  critiques: DecodedRecord<Critique>[],
  vocab: ConeVocabulary,
  openSet: Set<string>,
  key: string,
): HTMLElement | null {
  // Nothing is drawn until the read returns. An interim "unknown" line
  // would be an extra state for a distinction the cone line above has
  // already made.
  if (!report) return null;

  const box = document.createElement('div');
  box.className = 'unseen-state';
  box.dataset.testid = `${vocab.testid}-state`;

  const figures = document.createElement('p');
  // SAME CLASS AS THE CONE LINE in every branch — `hint cone-state` is
  // what carries 6.1's equal-weight rule, and a different class for the
  // recorded case would re-introduce the emphasis the wording was
  // careful to avoid.
  figures.className = 'hint cone-state';
  figures.dataset.testid = `${vocab.testid}-figures`;
  const others = report.total_known;
  const plural = others === 1 ? '' : 's';
  if (others === 0) {
    // NOT A STATEMENT ABOUT ANYBODY. See the note above: an empty
    // denominator means there was nothing to record, which is a fact
    // about the claim rather than about the writer.
    figures.dataset.state = 'none-known';
    figures.textContent =
      `This reader knows of no ${vocab.noun}s to this claim, so there was `
      + 'nothing here to have recorded seeing.';
  } else if (!report.cone_recorded) {
    figures.dataset.state = 'not-recorded';
    figures.textContent =
      `This reader knows of ${others} ${vocab.noun}${plural} to this claim. `
      + `Which of them this ${vocab.who} had seen is not recorded either way, so `
      + 'there is no gap here to show — the list would simply be all of them.';
  } else if (report.unseen.length === 0) {
    figures.dataset.state = 'recorded-complete';
    figures.textContent =
      `Recorded having seen every one of the ${others} ${vocab.noun}${plural} `
      + 'this reader knows of. Another reader may know of more.';
  } else {
    figures.dataset.state = 'recorded-partial';
    figures.textContent =
      `Recorded having seen ${report.seen_count} of the ${others} `
      + `${vocab.noun}${plural} this reader knows of.`;
  }
  box.appendChild(figures);

  // THE PROTOCOL'S SENTENCE, VERBATIM. It is the thing that says what
  // the figures do and do not support, and it differs per branch
  // because the coordinator computes it per branch.
  const note = document.createElement('p');
  note.className = 'hint';
  note.dataset.testid = `${vocab.testid}-note`;
  note.textContent = report.note;
  box.appendChild(note);

  // THE SET, in the one branch where it is a statement about something
  // its author said rather than about a field they never filled.
  if (report.cone_recorded && report.unseen.length > 0) {
    const byHash = new Map(critiques.map((c) => [b64(c.actionHash), c]));
    const open = openSet.has(key);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'link-button';
    toggle.dataset.testid = `${vocab.testid}-toggle`;
    toggle.textContent = open
      ? 'Hide the ones not recorded as seen'
      : `Show the ${report.unseen.length} not recorded as seen`;
    toggle.onclick = () => {
      if (open) openSet.delete(key); else openSet.add(key);
      render();
    };
    box.appendChild(toggle);

    if (open) {
      // THE CAPTION DENIES THE INFERENCE BEFORE THE LIST MAKES IT.
      // Read in the other order — list first, caveat after — a reader
      // has already drawn the conclusion by the time the denial
      // arrives, which is the whole failure mode this row names.
      const caption = document.createElement('p');
      caption.className = 'hint';
      caption.dataset.testid = `${vocab.testid}-caption`;
      caption.textContent =
        `Absent from what this ${vocab.who} recorded having seen. That may mean `
        + 'these had not arrived yet, or had not been read — it does NOT mean '
        + `the ${vocab.who} knew of them and ${vocab.denies}, and nothing in the `
        + 'protocol can tell the difference.';
      box.appendChild(caption);

      const list = document.createElement('ul');
      list.className = 'unseen-list';
      list.dataset.testid = `${vocab.testid}-list`;
      for (const hash of report.unseen) {
        const item = document.createElement('li');
        item.dataset.testid = `${vocab.testid}-item`;
        const sibling = byHash.get(b64(hash));
        if (sibling) {
          // Named by its MODE and its own words, because a reader can
          // check those against the objection itself further up the
          // panel. A bare hash would make the figure unauditable.
          const mode = document.createElement('span');
          mode.className = 'critique-mode';
          mode.textContent = sibling.entry.critique_mode;
          item.appendChild(mode);
          const text = document.createElement('span');
          text.textContent = ` ${sibling.entry.content}`;
          item.appendChild(text);
        } else {
          // THE READ CAN SEE MORE THAN THE PANEL DID. Both go to the
          // network, at different instants, so a critique can be in the
          // report and not in the list the panel was built from. Saying
          // so is better than dropping the row and leaving the stated
          // count larger than the rendered one.
          item.dataset.testid = `${vocab.testid}-item-unresolved`;
          item.textContent =
            'One this reader can count but could not fetch for this panel.';
        }
        list.appendChild(item);
      }
      box.appendChild(list);
    }
  }

  return box;
}

/** One critique's cone against its SIBLING critiques. */
function renderUnseenState(
  critique: DecodedRecord<Critique>,
  siblings: DecodedRecord<Critique>[],
): HTMLElement | null {
  const key = b64(critique.actionHash);
  return renderUnseenBox(
    unseenByCritique.get(key), siblings, CRITIQUE_CONE, unseenOpen, key,
  );
}

/** One assessment's cone against the TARGET'S critiques — a different
 * set, which is the whole reason `critiques_unseen_by_assessment` is a
 * separate query rather than the same one pointed elsewhere.
 *
 * `Assessment.past_cone` holds critiques of the target, not sibling
 * assessments: the integrity zome requires every member to resolve to a
 * `Critique` of the same target. So this screen says what objections an
 * assessor recorded having seen, and NEVER anything about whether they
 * read other people's positions — a question the protocol does not
 * record and no surface here may imply it can answer. */
function renderAssessmentUnseenState(
  assessment: DecodedRecord<Assessment>,
  critiques: DecodedRecord<Critique>[],
): HTMLElement | null {
  const key = b64(assessment.actionHash);
  return renderUnseenBox(
    unseenByAssessment.get(key), critiques, ASSESSMENT_CONE,
    unseenOpenAssessment, key,
  );
}

/** The attributed positions filed on one claim.
 *
 * READ-ONLY, AND THAT IS NOT AN OVERSIGHT. `publish_assessment` has
 * been callable all along and open-work 6.4 holds the question of
 * whether and how a HUMAN files one from this client; no form is added
 * here and that row stays open. What this closes is narrower and was
 * created by this project's own work on 2026-10-28: `agent-sdk` and
 * `mcp-server` both gained assessment publishing that day, so an agent
 * could file a position on somebody's claim and the person whose claim
 * it was had no surface that showed it. A write without its read is the
 * half-surfaced defect this codebase keeps recording; this is that
 * defect pointed the other way, and the read is the half that owes
 * nobody a design decision.
 *
 * NOTHING HERE IS COUNTED, and the omission is the design. Two
 * Supports beside one Disputes is the most natural thing in the world
 * to render as "2–1", and doing so would publish an unattributed
 * verdict off the back of attributed positions — Invariant #1 through
 * the back door, which is exactly what §6's rows are cautious about.
 * The protocol's own settlement machinery turns assessments into a
 * state only against a NAMED policy somebody signed and can be argued
 * with. So: a list, in the order the protocol returned it, never
 * reordered and never summarised.
 *
 * `Abstains` renders as a position like the others, for the reason the
 * type carries: an assessor who looked and declined to take a side is
 * saying something, and greying it out or folding it into "no opinion"
 * would lose the only thing it says. */
function renderAssessmentPanel(claim: DecodedRecord<Claim>): HTMLElement | null {
  const key = b64(claim.entryHash);
  const list = assessmentsByClaim.get(key);
  // NOT RENDERED AT ALL while unknown, and empty when there is nothing.
  // A "no assessments yet" line on every claim would teach a reader
  // that an unassessed claim is deficient, which is a standard nobody
  // set — assessing is not owed, and most claims will never carry one.
  if (list === undefined || list.length === 0) return null;

  // THE CRITIQUES OF THIS CLAIM, which are what an assessment's cone is
  // drawn from. Empty when the critique panel has not loaded them yet,
  // in which case an unseen row renders as unresolvable rather than
  // being dropped — the stated count must not exceed the rendered one.
  const critiquesHere = critiquesByClaim.get(key) ?? [];

  const panel = document.createElement('div');
  panel.className = 'assessment-panel';
  panel.dataset.testid = 'assessment-panel';

  const heading = document.createElement('p');
  heading.className = 'panel-heading';
  heading.dataset.testid = 'assessment-heading';
  heading.textContent = 'Positions taken on this claim';
  panel.appendChild(heading);

  const note = document.createElement('p');
  note.className = 'hint';
  note.dataset.testid = 'assessment-no-tally';
  note.textContent =
    'Each is one agent’s own position, signed and critiquable. These are not '
    + 'votes and nothing here counts them: a tally would be a verdict nobody '
    + 'published. Turning positions into a settled state needs a policy some '
    + 'agent has stated and can be argued with.';
  panel.appendChild(note);

  const anyConeRecorded = list.some((a) => (a.entry.past_cone?.length ?? 0) > 0);
  for (const assessment of list) {
    const item = document.createElement('div');
    item.className = 'assessment-item';
    item.dataset.testid = 'assessment-item';

    const stance = document.createElement('span');
    // Carried as a data attribute rather than baked into the class name
    // so a stylesheet can distinguish the three without this code
    // deciding that one of them is the good one.
    stance.className = 'assessment-stance';
    stance.dataset.stance = assessment.entry.stance;
    stance.dataset.testid = 'assessment-stance';
    stance.textContent = assessment.entry.stance;
    item.appendChild(stance);

    // THE ASSESSOR'S OWN CONFIDENCE, labelled as theirs. Unlabelled it
    // would read as this client's confidence in them, which is a
    // reputation signal the protocol does not compute and this UI must
    // not imply.
    const conf = document.createElement('span');
    conf.className = 'assessment-confidence';
    conf.dataset.testid = 'assessment-confidence';
    conf.textContent = `their confidence: ${assessment.entry.confidence}`;
    item.appendChild(conf);

    const by = document.createElement('button');
    by.className = 'link-button assessment-assessor';
    by.dataset.testid = 'assessment-assessor';
    by.textContent = short(assessment.entry.assessor);
    by.title = 'Read this agent’s other claims';
    // THE TAB SWITCH WAS MISSING HERE, found 2026-11-11 while giving the
    // critique beside it the same byline (6.18). This read the assessor's
    // claims into a tab the reader was not on, so the button looked inert
    // and the reader was left to find By Author themselves — the claim
    // card's byline has set both lines since it was written.
    by.onclick = () => {
      activeTab = 'by-author';
      void loadClaimsByAuthor(b64(assessment.entry.assessor));
    };
    item.appendChild(by);

    if (assessment.entry.rationale) {
      const why = document.createElement('p');
      why.dataset.testid = 'assessment-rationale';
      why.textContent = assessment.entry.rationale;
      item.appendChild(why);
    } else {
      // STATED RATHER THAN LEFT BLANK. A position with no reason is
      // still a signed position somebody can be held to — the entry
      // type says so — but a silent gap invites a reader to supply a
      // reason on the assessor's behalf.
      const noWhy = document.createElement('p');
      noWhy.className = 'hint';
      noWhy.dataset.testid = 'assessment-no-rationale';
      noWhy.textContent = 'No reason given. The position still stands as theirs.';
      item.appendChild(noWhy);
    }

    // AND NOW WITH ITS DENOMINATOR TOO — but the sentence that stood
    // here was WRONG about what the denominator is, and the correction
    // is the reason this comment is long.
    //
    // IT SAID "how many POSITIONS an assessor's cone was recorded out
    // of". It is not positions. `Assessment.past_cone` holds CRITIQUES
    // of the target: the integrity zome's `validate_assessment` refuses
    // any member that does not resolve to a `Critique` of the same
    // target. So the denominator is the target's critique count, and
    // *how many of the other assessments did this assessor read* is a
    // question the protocol does not record at all — there is no
    // sibling-assessment cone, and no surface here may imply one.
    //
    // The claim also said no query could supply the figure. A client
    // CAN subtract two lists, which is why `critiques_unseen_by_assessment`
    // had to be argued for rather than assumed: what the query adds is
    // that the gating rule travels with the data, the denominator is
    // counted over the conductor's own arc at read time rather than over
    // whatever the panel happened to fetch, and the protocol states what
    // the figures support instead of leaving a client to invent it.
    const cone = renderConeState(assessment.entry.past_cone, anyConeRecorded);
    if (cone) item.appendChild(cone);
    const unseen = renderAssessmentUnseenState(assessment, critiquesHere);
    if (unseen) item.appendChild(unseen);
    panel.appendChild(item);
  }
  return panel;
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
    // Computed over the WHOLE list before rendering any of it, because
    // whether an absence needs stating depends on its neighbours.
    // SAME DEFINITION AS THE PROTOCOL'S: recorded means NON-EMPTY.
    const anyConeRecorded = list.some((c) => (c.entry.past_cone?.length ?? 0) > 0);
    // ROW 6.22 — FOLD A LONG LIST, NEVER A SHORT ONE.
    //
    // Asked for by the pilot's first publisher on 2026-11-12: "I'd include an
    // option if possible in where the list minimizes after 3-4 critiques but
    // can be opened to see all, to not clutter?" — and bounded by the sentence
    // they sent next, which is why this hides so little: "As long as anyone
    // looking can see some information without having to click too much."
    //
    // THE SLICE IS OF TOP-LEVEL CRITIQUES ONLY. A visible critique keeps every
    // reply it has, because a reply behind a click is the defence being harder
    // to find than the objection — which is the asymmetry 6.19 exists to
    // remove, and it would be a poor trade to reintroduce it one row later.
    const expanded = critiqueListExpanded.has(key);
    const folds = list.length > FOLD_CRITIQUES_AFTER;
    const shown = folds && !expanded ? list.slice(0, FOLD_CRITIQUES_AFTER) : list;
    for (const critique of shown) {
      const item = document.createElement('div');
      item.className = 'critique-item';
      const modeLabel = document.createElement('span');
      modeLabel.className = 'critique-mode';
      modeLabel.textContent = critique.entry.critique_mode;
      item.appendChild(modeLabel);

      // WHO WROTE IT — open-work 6.18, and the words are the pilot's first
      // publisher's own, 2026-11-11: "on the app you see now a big blurb of
      // text. It doesnt show if an author responded, who the other person is.
      // Just text. If 5 people would enter, you wouldnt know if you're
      // speaking to the same or others."
      //
      // THE ENTRY HAS CARRIED `author` ALL ALONG, and the assessment panel
      // rendered sixty lines below this one has had exactly this byline since
      // 6.4's read half shipped. A critique was the one thing in this UI that
      // arrived anonymous, on the one screen where the whole point is that
      // somebody can be held to what they said.
      //
      // A BYLINE, NOT A TALLY, which is the line Invariant #1 draws and the
      // reason the By Author tab shows no count per agent: naming who said
      // something is attribution, counting how often they say it is a score.
      // Nothing here is grouped, ordered or totalled by author — the list
      // stays in the order the DHT returned it, and `reading-a-thread.mjs`
      // asserts that against a fixture whose wire order is deliberately NOT
      // author-grouped.
      const by = document.createElement('button');
      by.className = 'link-button critique-author';
      by.dataset.testid = 'critique-author';
      by.textContent = short(critique.entry.author);
      by.title = 'Read this agent’s other claims';
      by.onclick = () => {
        // The tab switch is part of the affordance rather than a nicety: a
        // read that lands on a tab the reader is not looking at is a button
        // that appears to do nothing. Same two lines as the claim card's
        // byline, for the same reason.
        activeTab = 'by-author';
        void loadClaimsByAuthor(b64(critique.entry.author));
      };
      item.appendChild(by);

      // AND WHETHER THIS IS THE CLAIM'S AUTHOR ANSWERING, which is the first
      // half of what they asked for and is not derivable from a shortened key
      // by a reader who has not memorised one. Stated only when it is TRUE of
      // this critique; an unmarked row is a stranger's objection, which is
      // what makes the marked one say anything at all.
      //
      // "the claim’s author" is reachable today only because an author can
      // critique their own claim — `validate_critique`'s author rule is
      // anti-spoofing, not anti-self. Replying to the critique itself is
      // open-work 6.19 and is NOT what this line claims: it says who wrote
      // this, never what it is attached to.
      const relations: string[] = [];
      if (connection && b64(critique.entry.author) === b64(connection.myAgentPubKey)) {
        relations.push('you');
      }
      if (b64(critique.entry.author) === b64(claim.entry.author)) {
        relations.push('the claim’s author');
      }
      // ROW 6.23 — IS THIS ONE PERSON OR SEVERAL?
      //
      // Asked by the pilot's first publisher on 2026-11-12, on a build that
      // already had 6.18's byline in it: "People writing critiques, still
      // unclear if it is one person or the same. I can see the number a person
      // gets when they sign up, but this remains unclear."
      //
      // 6.18 ANSWERED THE WRONG HALF OF THEIR FIRST REPORT, and this is the
      // other half. A byline that is DISTINCT is not a byline that is
      // DISTINGUISHABLE: `short()` renders twelve base64 characters, which is
      // a string a person compares character by character or not at all.
      //
      // COMPUTED OVER `list`, THE WHOLE SET, RATHER THAN OVER 6.22's `shown`.
      // Today those give the same answer and it is worth being exact about
      // why, rather than claiming a bug that is not there: `shown` is a
      // LEADING slice, and this search only ever looks BACKWARD, so for any
      // row that is visible its author's first appearance is necessarily
      // inside the slice too. The reason to read `list` anyway is that the
      // equivalence is a property of the fold being a prefix — the day it
      // becomes anything else (most-recent-first, say, or a filter), reading
      // `shown` would make the marker depend on how much of the list a reader
      // had opened. A statement about the artifact that changes with the
      // viewer's own expansion state is what README §4.4 forbids, and no
      // fixture shorter than the fold could catch it.
      //
      // IT SAYS "AN EARLIER ONE", NOT "THE ONE ABOVE", because the repeat is
      // frequently not adjacent — the fixture this is gated against publishes
      // stranger, author, stranger — and an adjacent-only marker would answer
      // the question only when it was already easy.
      //
      // AND IT COUNTS NOTHING. "Also wrote 3 of these" would be a per-agent
      // tally inside one panel, which is the Invariant #1 line the By Author
      // tab already declines to cross. This is an identity statement about
      // two rows a reader is looking at, and nothing is ordered, ranked or
      // totalled by it.
      const firstByThisAuthor = list.findIndex(
        (c) => b64(c.entry.author) === b64(critique.entry.author),
      );
      if (firstByThisAuthor >= 0 && list[firstByThisAuthor] !== critique) {
        relations.push('same author as an earlier critique');
      }
      if (relations.length > 0) {
        const rel = document.createElement('span');
        rel.className = 'critique-relation';
        rel.dataset.testid = 'critique-relation';
        rel.textContent = relations.join(', ');
        item.appendChild(rel);
      }

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
      // AS IT WAS WRITTEN — open-work 6.20. `textContent` has always put the
      // whole string on screen, and the stylesheet then collapsed every line
      // break in it, so a critique written as three paragraphs arrived as one
      // run of prose. The class is new because this element had none at all
      // and `.critique-item p` cannot say it: the cone and unseen lines below
      // are the app's own sentences, not the author's, and they are not
      // whitespace-significant.
      const text = document.createElement('p');
      text.className = 'critique-content';
      text.dataset.testid = 'critique-content';
      text.textContent = critique.entry.content;
      item.appendChild(text);
      // AFTER the critique's own words, never before them. The cone is
      // context about the author's state when they wrote; putting it
      // above the content would frame the objection before it is read.
      //
      // `anyConeRecorded` is passed as `always`: once ONE critique in
      // the list states what it had seen, an unmarked neighbour reads as
      // the weaker claim by implication, so every row says which it is.
      const cone = renderConeState(critique.entry.past_cone, anyConeRecorded);
      if (cone) item.appendChild(cone);
      // AND THE DENOMINATOR, from the query rather than the entry. The
      // cone line above says what was recorded; this says what it was
      // recorded OUT OF, which the entry cannot know.
      const unseen = renderUnseenState(critique, list);
      if (unseen) item.appendChild(unseen);

      // ROW 6.19 — THE THREAD, IN THE SHAPE THE PILOT'S FIRST PUBLISHER ASKED
      // FOR, 2026-11-12: "the reply comes under a critique, in where others
      // agreeing or disagreeing with that particular critique to the claim
      // can reply. A new critique gets its own section. It provides
      // organisation."
      //
      // THAT SENTENCE IS THE DECISION, NOT A PREFERENCE THIS CLIENT HELPED
      // ITSELF TO. The row stood open as a `[D]` on the grounds that
      // indenting a reply is a client deciding a thread's shape for readers
      // who never asked for it — an objection no amount of reasoning in this
      // file could answer, because the missing thing was a reader asking. The
      // one participant who has both published a claim and been critiqued on
      // it asked, unprompted.
      //
      // A REPLY'S PLACE IS GIVEN BY ITS TARGET, NOT BY ITS ARRIVAL, which is
      // the distinction that makes this safe: the DHT's return order still
      // governs the order of the sections and never the nesting, so nothing
      // here reorders, ranks or groups what the network handed back. That is
      // also why this does NOT answer 6.14's `[D]`, where the entries have no
      // target to hang from and arrival order is all there is.
      const thread = document.createElement('section');
      thread.className = 'critique-thread';
      thread.dataset.testid = 'critique-thread';
      thread.appendChild(item);
      thread.appendChild(renderReplies(critique));
      panel.appendChild(thread);
    }

    // AND IT SAYS WHAT IT IS HIDING, WHICH IS THE WHOLE REQUIREMENT.
    //
    // A chevron alone would make this the Worldline snapshot's defect (6.16)
    // and the under-count's (0.3.3) for a third time: a surface that reads as
    // complete while leaving something out. A reader who cannot see that four
    // of six critiques are on screen has been told the claim is less contested
    // than it is, by an interface decision they never made.
    //
    // THE NUMBER IS NOT A TALLY OF ANYTHING RANKED, which is the line
    // Invariant 1 draws: it is the length of a list the reader is already
    // looking at, nothing is ordered or scored by it, and the By Author tab
    // declines to print a per-agent count for a reason that does not reach
    // here.
    if (folds) {
      const hidden = list.length - FOLD_CRITIQUES_AFTER;
      // REPLIES UNDER A HIDDEN CRITIQUE ARE HIDDEN TOO, and saying only
      // "N more critiques" would understate that by exactly the amount this
      // row is about. Counted only when every hidden critique has actually
      // been read for replies: `undefined` is unasked, and 6.13's distinction
      // applies here as it does everywhere else — an unknown count is left
      // unsaid rather than reported as nothing.
      const hiddenThreads = list.slice(FOLD_CRITIQUES_AFTER);
      const replyCounts = hiddenThreads.map((c) => repliesByCritique.get(b64(c.entryHash)));
      const allKnown = replyCounts.every((r) => r !== undefined);
      const hiddenReplies = allKnown
        ? replyCounts.reduce((n, r) => n + (r?.length ?? 0), 0)
        : null;

      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'link-button critique-fold-toggle';
      more.dataset.testid = 'critique-fold-toggle';
      if (expanded) {
        more.textContent = 'Show fewer critiques';
      } else {
        const noun = hidden === 1 ? 'critique' : 'critiques';
        const withReplies = hiddenReplies
          ? ` and ${hiddenReplies} ${hiddenReplies === 1 ? 'reply' : 'replies'}`
          : '';
        more.textContent = `Show ${hidden} more ${noun}${withReplies}`;
      }
      more.onclick = () => {
        if (expanded) critiqueListExpanded.delete(key);
        else critiqueListExpanded.add(key);
        render();
      };
      panel.appendChild(more);
    }
  }

  /** ROW 6.19 — one reply.
   *
   * DELIBERATELY NOT THE FULL CRITIQUE ROW, and the omissions are the
   * reasoning rather than an economy. The cone line, the unseen denominator
   * and the conductance are all computed against the CLAIM's critique set:
   * `renderUnseenState` takes that list as its siblings, and
   * `conductanceByCritique` is keyed off links loaded for it. A reply belongs
   * to a different set, so printing those numbers here would attach a
   * denominator to a reply that was never measured over replies — a figure
   * that looks like the one above it and means something else. Depth beyond
   * this one level remains the spatial view's job, with its own reasoning.
   *
   * WHAT IT DOES CARRY IS WHO IS SPEAKING, which is the half of 6.18 that
   * matters most here. On a reply, "the claim's author" is the author
   * DEFENDING — the thing this participant said they could not see: "It
   * doesnt show if an author responded, who the other person is." */
  function renderReplyItem(
    reply: DecodedRecord<Critique>,
    parent: DecodedRecord<Critique>,
  ): HTMLElement {
    const item = document.createElement('div');
    item.className = 'critique-item critique-reply';
    item.dataset.testid = 'critique-reply';

    const modeLabel = document.createElement('span');
    modeLabel.className = 'critique-mode';
    modeLabel.textContent = reply.entry.critique_mode;
    item.appendChild(modeLabel);

    const by = document.createElement('button');
    by.className = 'link-button critique-author';
    by.dataset.testid = 'critique-author';
    by.textContent = short(reply.entry.author);
    by.title = 'Read this agent\u2019s other claims';
    by.onclick = () => {
      activeTab = 'by-author';
      void loadClaimsByAuthor(b64(reply.entry.author));
    };
    item.appendChild(by);

    // THREE RELATIONS HERE WHERE A CRITIQUE HAS TWO, because a reply sits
    // between two authors rather than beside one. Stated only when true; an
    // unmarked reply is a bystander's, which is what makes a marked one say
    // anything. A tally of any of this would be the Invariant 1 line — these
    // are attributions, nothing is counted or ordered by them.
    const relations: string[] = [];
    if (connection && b64(reply.entry.author) === b64(connection.myAgentPubKey)) {
      relations.push('you');
    }
    if (b64(reply.entry.author) === b64(claim.entry.author)) {
      relations.push('the claim\u2019s author');
    }
    if (b64(reply.entry.author) === b64(parent.entry.author)) {
      relations.push('the critique\u2019s author');
    }
    if (relations.length > 0) {
      const rel = document.createElement('span');
      rel.className = 'critique-relation';
      rel.dataset.testid = 'critique-relation';
      rel.textContent = relations.join(', ');
      item.appendChild(rel);
    }

    // `critique-content` CARRIES 6.20's `pre-wrap`, so a reply written as
    // paragraphs reads as paragraphs on the same terms as everything else
    // somebody wrote in their own words.
    const text = document.createElement('p');
    text.className = 'critique-content';
    text.dataset.testid = 'critique-content';
    text.textContent = reply.entry.content;
    item.appendChild(text);

    return item;
  }

  /** ROW 6.19 — the replies to one critique, and the box to write one.
   *
   * CLOSED BY DEFAULT, because the ask that produced this row was about
   * clutter as much as structure: a claim with six critiques must not be six
   * open forms. The folding of the SECTIONS themselves is 6.22 and is not
   * this. */
  function renderReplies(critique: DecodedRecord<Critique>): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'critique-replies';
    const replyKey = b64(critique.actionHash);
    const replies = repliesByCritique.get(b64(critique.entryHash));

    if (replies === undefined) {
      // UNASKED IS NOT UNANSWERED — 6.13's distinction, and it lands harder
      // here than it did on the Browse tab. "No replies" said about
      // somebody's objection is a claim about the discourse, and this client
      // must not make it before it has looked.
      const pending = document.createElement('p');
      pending.className = 'hint';
      pending.dataset.testid = 'replies-pending';
      pending.textContent = 'Checking for replies\u2026';
      wrap.appendChild(pending);
    } else {
      for (const reply of replies) wrap.appendChild(renderReplyItem(reply, critique));
    }

    // THE AFFORDANCE THE ROW IS ACTUALLY ABOUT, and the repair of something
    // we told this participant in writing on 2026-11-08 that was not true of
    // their build: asked whether authors can defend a claim, they were told
    // yes, with the rate limit. True of the protocol — `CritiqueTargetType`
    // has covered `Critique` all along and `validate_critique`'s author rule
    // is anti-spoofing rather than anti-self — and false of this client,
    // which hardcoded `target_type: 'Claim'` at every write. The defence
    // existed everywhere except where they could reach it.
    const open = replyOpen.has(replyKey);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'link-button reply-toggle';
    toggle.dataset.testid = 'reply-toggle';
    toggle.textContent = open ? 'Cancel reply' : 'Reply to this critique';
    toggle.title = 'Answer this critique directly. Your reply is attached to it, not to the claim.';
    toggle.onclick = () => {
      if (open) replyOpen.delete(replyKey);
      else replyOpen.add(replyKey);
      render();
    };
    wrap.appendChild(toggle);

    if (open) {
      wrap.appendChild(buildCritiqueForm({
        target: critique.entryHash,
        targetType: 'Critique',
        submitLabel: 'Add reply',
        placeholder: 'Your reply \u2014 say what this critique gets wrong, or what it gets right.',
        testid: 'reply-form',
      }));
    }
    return wrap;
  }

  /** The form that signs a critique — for a CLAIM or, since row 6.19, for
   * another CRITIQUE.
   *
   * EXTRACTED RATHER THAN COPIED, and the reason is the friction gate below
   * rather than tidiness. A reply IS a critique: `create_critique` creates a
   * SynapticLink either way, and that is the one coordinator path spending the
   * SWO budget. A hand-rolled reply form would have been an affordance that
   * bypassed a protocol limit the main form honours — offering an action this
   * client already knows will be refused, which is the exact failure §4.5's
   * surfacing rules exist to prevent. One form, one gate, both targets.
   *
   * Declared as a `function` so it is hoisted: the reply forms are built in
   * the critique loop above, which runs before this point in the body. */
  function buildCritiqueForm(opts: {
    target: Uint8Array;
    targetType: Critique['target_type'];
    submitLabel: string;
    placeholder: string;
    testid: string;
  }): HTMLFormElement {
  const form = document.createElement('form');
  form.className = 'critique-form';
  form.dataset.testid = opts.testid;
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
  textarea.placeholder = opts.placeholder;
  textarea.required = true;
  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.textContent = opts.submitLabel;
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
      target: opts.target,
      target_type: opts.targetType,
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

  return form;
  }

  // THE CLAIM-LEVEL FORM, unchanged in every respect a harness can see: same
  // class, same labels, same ordering, same gate. Only its target is now
  // named rather than assumed.
  panel.appendChild(buildCritiqueForm({
    target: claim.entryHash,
    targetType: 'Claim',
    submitLabel: 'Add critique',
    placeholder: 'Your critique — say why, not just that you disagree.',
    testid: 'critique-form',
  }));
  return panel;
}

/** Reads a domain's claims and shows them.
 *
 * `fromTheBox` says whether the Browse tab's own domain box started this
 * read, and it decides one thing: whether the box is re-seeded when the read
 * lands. A read started ANYWHERE ELSE — publishing a claim into the domain
 * being browsed, following a domain from a card — should leave the box
 * naming the domain now on screen. A read started from the box should not,
 * because it lands a network round trip later and somebody may have gone on
 * typing in the meantime; re-seeding then throws away exactly what
 * `domainDraft` exists to keep. */
async function loadClaims(domain: string, fromTheBox = false) {
  if (!connection || !domain) return;
  currentDomain = domain;
  if (!fromTheBox) domainDraft = domain;
  browseError = '';
  browseLoaded = false;
  // Cleared BEFORE the await rather than after it, so what is on screen
  // during the read is this domain's unanswered state rather than the last
  // domain's claims. A list that stays up while a different domain is being
  // read is the same lie as an empty one that cannot say it was asked.
  claims = [];
  critiquesByClaim.clear();
  assessmentsByClaim.clear();
  expandedClaims.clear();
  antibodiesByClaim.clear();
  retractionsByClaim.clear();
  // The reports are keyed by critique, but `total_known` is a count of
  // what the conductor could see AT READ TIME — so a report held across
  // a domain change would state a denominator for a different moment.
  unseenByCritique.clear();
  unseenOpen.clear();
  unseenByAssessment.clear();
  unseenOpenAssessment.clear();
  render();
  try {
    const records = await connection.callZome<any[]>('get_claims_by_domain', domain);
    claims = decodeRecords<Claim>(records);
    browseLoaded = true;
    // Marked once the read has come back, not before it. The step claims the
    // reader has browsed a domain, and a call that was rejected is not that
    // — it used to advance the tour on a conductor that was down.
    markDone('browsed-domain');
    rememberVisited(domain);
  } catch (e) {
    browseError = `Could not read claims for "${domain}": `
      + (e instanceof Error ? e.message : String(e));
  }
  render();
  // Epistemic state is fetched after the claims are already on screen,
  // so a slow or failing read degrades the badges rather than the list.
  if (browseLoaded) void loadClaimEpistemicState();
}

/** ROW 6.16's read, and it is `get_claims_by_agent` again rather than
 * anything new. Failure is deliberately silent: this is a navigation aid
 * beside a working domain box, so a conductor that will not answer it should
 * degrade the convenience and leave the Browse tab's own four states to say
 * what happened to the read the user actually asked for. */
async function loadMyDomains() {
  if (!connection) return;
  try {
    const records = await connection.callZome<any[]>('get_claims_by_agent', connection.myAgentPubKey);
    myDomains = distinctDomains(decodeRecords<Claim>(records));
    render();
  } catch { /* the aid is absent rather than wrong */ }
}

/** Reads every claim one agent has published. Separate from loadClaims in
 * more than its zome function: this one takes an agent key rather than a
 * domain, so a malformed key is a real and likely input (it can be typed or
 * pasted) and is reported as such rather than being handed to the conductor
 * to fail on obscurely. */
async function loadClaimsByAuthor(agentB64: string) {
  if (!connection || !agentB64) return;
  currentAuthor = agentB64;
  authorDraft = agentB64;
  authorError = '';
  authorLoaded = false;
  authorClaims = [];

  let agent: Uint8Array;
  try {
    agent = bytesFromB64(agentB64);
  } catch {
    authorError = 'That is not a valid agent key. Keys are base64, like the one shown on a claim.';
    render();
    return;
  }

  render();
  try {
    const records = await connection.callZome<any[]>('get_claims_by_agent', agent);
    authorClaims = decodeRecords<Claim>(records);
    authorLoaded = true;
    // 6.15: only for the reader's own listing, and started after the claims
    // are already on screen so a slow count degrades the answer rather than
    // delaying it.
    if (agentB64 === b64(connection.myAgentPubKey)) void loadMyCritiqueCounts(authorClaims);
  } catch (e) {
    authorError = `Could not read this agent's claims: ${e instanceof Error ? e.message : String(e)}`;
  }
  render();
}

/** Probes a claim's neighborhood binding against the other claims loaded in
 * this domain. Candidates are supplied by us and echoed back scored; nothing
 * here searches. Both roles are probed for each candidate, because a claim
 * may sit in another's neighborhood as evidence or as critique and the
 * caller does not know which in advance. */
/** Resolve a claim's grounding path node by node, through the two
 *  hash-addressed getters.
 *
 * Sequential rather than `Promise.all`: a grounding path is a CHAIN, each node
 * cited by the one before it, and the display is that order. Firing them in
 * parallel would save a few hundred milliseconds on a path whose length is
 * bounded by DEFAULT_GROUNDING_MAX_DEPTH and lose the property that a partial
 * result is a correct prefix of the walk.
 *
 * A node that will not resolve does NOT lose the rest of the chain. Its hash is
 * still an honest statement about where the walk went, and a chain that renders
 * three of four steps plus "this one would not resolve" is strictly more than
 * the step count this replaces. */
async function loadGroundingChain(claim: DecodedRecord<Claim>) {
  if (!connection) return;
  const key = b64(claim.entryHash);
  const grounding = groundingByClaim.get(key);
  // No path means get_grounding_path has not answered yet. The toggle is only
  // rendered once it has, so this is a guard rather than a case.
  if (!grounding) return;

  chainLoading.add(key);
  render();
  try {
    const steps: GroundingStep[] = [];
    const last = grounding.path.length - 1;
    for (let i = 0; i < grounding.path.length; i++) {
      const hash = grounding.path[i];
      const terminalEvidence = grounding.grounded && i === last;
      try {
        if (terminalEvidence) {
          const evidence = await connection.callZome<Evidence | null>('get_evidence', hash);
          steps.push(evidence ? { kind: 'evidence', hash, evidence } : { kind: 'unresolved', hash });
        } else {
          const c = await connection.callZome<Claim | null>('get_claim', hash);
          steps.push(c ? { kind: 'claim', hash, claim: c } : { kind: 'unresolved', hash });
        }
      } catch (e) {
        console.error('grounding node would not resolve', short(hash), e);
        steps.push({ kind: 'unresolved', hash });
      }
    }
    chainByClaim.set(key, steps);
  } finally {
    chainLoading.delete(key);
    render();
  }
}

async function loadResonance(claim: DecodedRecord<Claim>) {
  if (!connection) return;
  const key = b64(claim.entryHash);
  resonanceLoading.add(key);
  render();
  try {
    const candidates: [Uint8Array, string][] = [];
    for (const other of claims) {
      if (b64(other.entryHash) === key) continue;
      candidates.push([other.entryHash, 'Evidence']);
      candidates.push([other.entryHash, 'Critique']);
    }
    const recalls = candidates.length === 0 ? [] : await connection.callZome<NeighborRecall[]>(
      'query_neighborhood_resonance', { claim_hash: claim.entryHash, candidates },
    );
    resonanceByClaim.set(key, recalls);
  } catch (e) {
    resonanceByClaim.set(key, []);
    console.error('resonance probe failed', e);
  } finally {
    resonanceLoading.delete(key);
    render();
  }
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
      const decodedRetractions = decodeRecords<Retraction>(retractions);
      retractionsByClaim.set(key, decodedRetractions);
      groundingByClaim.set(key, grounding);
      // 6.14's read half. Started HERE rather than from the banner, so no
      // render begins a read — and `loadReplacementClaim` is keyed by the
      // replacement's own hash, so two retractions naming the same claim
      // share one call and a re-render starts none.
      for (const retraction of decodedRetractions) {
        if (retraction.entry.replacement_claim) {
          void loadReplacementClaim(retraction.entry.replacement_claim);
        }
      }
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

/** ROW 6.15. Counts the critiques on each of the reader's own claims.
 *
 * ONE `get_critiques_for` PER CLAIM AND NO NEW EXTERN — which is the whole
 * reason this half needed no decision. The calls are independent, so they go
 * out together rather than in a chain: a grounding path is sequential because
 * each node is cited by the one before it, and these are not.
 *
 * EACH CLAIM IS SETTLED ON ITS OWN. One rejected read leaves that claim
 * without an entry — unasked, which the screen can say — rather than failing
 * the batch and leaving every claim looking unchallenged.
 *
 * SCOPED TO THE READER'S OWN CLAIMS BY CONSTRUCTION, not by a flag the render
 * could forget: nothing else writes to this map, so a card can ask it for a
 * count and a card belonging to somebody else will never find one. The
 * restriction matters — see the Invariant 1 note above `renderByAuthorTab`
 * for why a critique count across OTHER people's claims would be a different
 * and worse object than this one. */
async function loadMyCritiqueCounts(claimsOfMine: DecodedRecord<Claim>[]) {
  if (!connection) return;
  const conn = connection;
  await Promise.all(claimsOfMine.map(async (claim) => {
    try {
      const records = await conn.callZome<any[]>('get_critiques_for', claim.entryHash);
      myCritiqueCounts.set(b64(claim.entryHash), records.length);
    } catch { /* unasked rather than zero — see the map's own comment */ }
  }));
  render();
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
  void loadAssessments(claim);
  void loadUnseen(decoded);
  void loadReplies(decoded);
}

/** ROW 6.19 — the replies to each critique already on screen.
 *
 * ONE `get_critiques_for` PER CRITIQUE AND NO NEW EXTERN. `get_critiques_for`
 * takes an `AnyDhtHash` and has always accepted a critique's entry hash; what
 * did not exist was anything in this client that asked it. The calls are
 * independent, so they go out together.
 *
 * EACH CRITIQUE IS SETTLED ON ITS OWN, the same way `loadMyCritiqueCounts`
 * does it: one rejected read leaves that critique with no entry in the map —
 * which the screen can say — rather than failing the batch and leaving every
 * critique looking unanswered. An unanswered critique is a claim about the
 * discourse, and it is not one this client should make by accident. */
async function loadReplies(critiques: DecodedRecord<Critique>[]) {
  if (!connection) return;
  const conn = connection;
  await Promise.all(critiques.map(async (critique) => {
    try {
      const records = await conn.callZome<any[]>('get_critiques_for', critique.entryHash);
      repliesByCritique.set(b64(critique.entryHash), decodeRecords<Critique>(records));
    } catch {
      // Left absent on purpose — see the map's own comment. `renderReplies`
      // distinguishes "not asked" from "asked, nothing came back".
    }
  }));
  render();
}

/** The assessments filed against one claim.
 *
 * FAILS SOFT, and that is a deliberate difference from the critique
 * read. A conductor whose installed DNA predates the `Assessment` entry
 * type refuses this call, and the critique panel is the primary view —
 * so an older conductor must still show critiques rather than losing
 * the card to an error. The empty state says which it is, because
 * "nobody has assessed this" and "this conductor cannot answer" are
 * different facts and conflating them would be the UI asserting the
 * first while observing the second. */
async function loadAssessments(claim: DecodedRecord<Claim>) {
  if (!connection) return;
  const key = b64(claim.entryHash);
  try {
    const records = await connection.callZome<any[]>('get_assessments_for', claim.entryHash);
    const decoded = decodeRecords<Assessment>(records);
    assessmentsByClaim.set(key, decoded);
    render();
    void loadAssessmentUnseen(decoded);
  } catch {
    assessmentsByClaim.set(key, []);
  }
  render();
}

/** `critiques_unseen_by_assessment` for each position on an expanded
 * claim — the assessment side of the past cone's denominator.
 *
 * WHY A SEPARATE LOADER AND NOT A SECOND USE OF `loadUnseen`. The two
 * queries answer different questions over different sets: a critique's
 * cone is compared against its SIBLING critiques, an assessment's
 * against the TARGET'S critiques. Sharing one loader would have meant
 * one map keyed by two kinds of hash, and the first bug that produced
 * would be an assessment rendered with a critique's denominator.
 *
 * FAILS SOFT, PER ASSESSMENT, on the same terms as `loadUnseen`: a
 * conductor whose installed DNA predates this query refuses it, and a
 * position with no report renders with its cone line and no figures,
 * which is what this screen looked like before today. */
async function loadAssessmentUnseen(assessments: DecodedRecord<Assessment>[]) {
  if (!connection) return;
  const conn = connection;
  await Promise.all(assessments.map(async (assessment) => {
    try {
      const report = await conn.callZome<AssessmentUnseenReport>(
        'critiques_unseen_by_assessment', assessment.actionHash);
      unseenByAssessment.set(b64(assessment.actionHash), report);
    } catch {
      // A missing denominator, not a missing caveat — see loadUnseen.
    }
  }));
  render();
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

/** `critiques_unseen_by` for each critique on an expanded claim — the
 * DETECTION half of the past cone, and open-work 6.1's remaining work.
 *
 * WHY THIS IS A SEPARATE READ FROM THE CONE ALREADY ON SCREEN, which
 * is the thing 6.1 was actually still holding. `renderConeState` draws
 * what the ENTRY carries: how many critiques this author recorded
 * having seen. That number alone is a fraction with its denominator
 * hidden — "recorded having seen 1" says nothing until a reader knows
 * whether there was one other objection or forty. Only the query knows
 * that, because the denominator is a count of what THIS conductor can
 * resolve over the network right now, which no entry can carry.
 *
 * ONE CALL PER CRITIQUE, and only for a claim the user has expanded,
 * so the fan-out is bounded by what is on screen — the same rule
 * loadConductances follows for the same reason.
 *
 * FAILS SOFT, PER CRITIQUE. A conductor whose installed DNA predates
 * the query refuses it, and the critique panel is the primary view: a
 * critique with no report renders with its cone line and no figures,
 * which is what this screen looked like before today. Degrading to
 * silence is safe here in a way it would not be for the cone state
 * itself — a missing report omits a denominator, while a missing cone
 * line would leave an absence unmarked and let silence read as
 * ignorance. */
async function loadUnseen(critiques: DecodedRecord<Critique>[]) {
  if (!connection) return;
  const conn = connection;
  await Promise.all(critiques.map(async (critique) => {
    try {
      const report = await conn.callZome<UnseenReport>(
        'critiques_unseen_by', critique.actionHash);
      unseenByCritique.set(b64(critique.actionHash), report);
    } catch {
      // See the note above: no report is a missing denominator, not a
      // missing caveat, so the screen stays honest without it.
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
  // `reading` BEFORE the await, so the screen can say the read is in flight
  // rather than showing an answer it does not have yet — 6.13's rule, and the
  // one the applet asset surface got wrong first.
  sampledPeriods.set(index, { state: 'reading' });
  render();
  try {
    const records = await connection.callZome<any[]>('sample_period', boundary);
    sampledPeriods.set(index, { state: 'open', records: records.map(sampledRecord) });
  } catch (err) {
    // A FAILED READ IS NOT AN EMPTY WINDOW. The previous version swallowed
    // this entirely with the comment "absent, not zero" and then rendered
    // nothing, which is the same sentence for both — 6.13's finding, here.
    sampledPeriods.set(index, {
      state: 'failed',
      why: err instanceof Error ? err.message : String(err),
    });
  }
  render();
}

/** One conductor Record -> the narrow shape this screen draws.
 *
 *  Reads the entry type off the ACTION and the time off the HEADER. Both were
 *  measured against a live conductor rather than assumed: the action data
 *  carries `type`, `entry_type` and `entry_hash` and NO timestamp, while the
 *  header carries `author`, `timestamp`, `action_seq` and `prev_action`. A
 *  first draft of this read `content.data.timestamp` and got `undefined`. */
function sampledRecord(record: any): SampledRecord {
  const content = record?.signed_action?.hashed?.content ?? {};
  // `entry_type` IS NOT ALWAYS AN OBJECT, and the first version of this
  // assumed it was. Measured against a live conductor: an app entry gives
  // `{ App: { entry_index, zome_index, visibility } }`, and a capability
  // grant gives the plain STRING `"CapGrant"`. A chain that has authorized
  // signing credentials has one of those in it, so the very first record of
  // the very first window rendered as "Entry type (unreadable)" — machinery
  // reported to the agent as a failure to read their own history. Caught by
  // reading the harness's own output rather than its exit code, which was 0.
  const rawType = content?.data?.entry_type;
  const idx = rawType?.App?.entry_index;
  const entryIndex = typeof idx === 'number' ? idx : -1;
  if (typeof rawType === 'string' || (rawType && typeof rawType === 'object' && !rawType.App)) {
    const name = typeof rawType === 'string' ? rawType : Object.keys(rawType)[0] ?? 'Unknown';
    return {
      entryIndex: -1,
      kind: NON_APP_KINDS[name] ?? `${name} — written by the app, not by you`,
      machinery: true,
      writtenAt: typeof content?.header?.timestamp === 'number' ? content.header.timestamp : null,
      content: null,
    };
  }
  let prose: string | null = null;
  try {
    const entry = record?.entry?.Present ? decodeEntry(record.entry.Present.entry) : null;
    // `content` on a Claim/Critique/Evidence, `description` on a Membrane.
    // Nothing is inferred from the SHAPE of the entry — the kind already came
    // from the action — so this only picks a field to display.
    const candidate = entry?.content ?? entry?.description ?? null;
    prose = typeof candidate === 'string' && candidate.trim() ? candidate : null;
  } catch {
    prose = null;
  }
  return {
    entryIndex,
    // An App entry at an index this client does not name is reported BY ITS
    // INDEX rather than as unreadable — it is a type this build predates, not
    // a broken record, and the two deserve different words.
    kind: ENTRY_KINDS[entryIndex] ?? (entryIndex >= 0
      ? `An entry type this version does not know (#${entryIndex})`
      : 'An entry whose type could not be read'),
    machinery: false,
    writtenAt: typeof content?.header?.timestamp === 'number' ? content.header.timestamp : null,
    content: prose,
  };
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
      // something checkable against the chain itself — and 6.17 is why it now
      // DRAWS those records instead of counting them.
      const sampled = sampledPeriods.get(i);
      const isOpen = openPeriods.has(i);
      const open = document.createElement('button');
      open.className = 'link-button';
      open.dataset.testid = 'period-sample';
      // THE LABEL NOW DESCRIBES WHAT THE BUTTON DOES, in both directions. The
      // version this replaced said "Show what is in this window" and then
      // relabelled itself with a count, so after one click the only control
      // on the row was a number and there was no way back.
      open.textContent = isOpen ? 'Hide this window' : 'Show what is in this window';
      open.onclick = () => {
        if (openPeriods.has(i)) { openPeriods.delete(i); render(); return; }
        openPeriods.add(i);
        if (!sampledPeriods.has(i)) void samplePeriod(i);
        else render();
      };
      li.appendChild(open);
      if (isOpen) li.appendChild(renderPeriodWindow(i, b, sampled));
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
/** The records in one window — 6.17, and the row a participant opened.
 *
 *  FIVE STATES, AND THE LAST TWO ARE THE ONES THAT MATTER. `unasked`,
 *  `reading`, `open with records`, `open with NONE`, and `failed`. A read that
 *  failed and a window that is genuinely empty are different facts, and the
 *  version this replaces had one sentence — a count — for all five.
 *
 *  WHY THE TWO NUMBERS ON THIS ROW CAN DISAGREE, SAID ON SCREEN RATHER THAN
 *  LEFT TO BE DISCOVERED. The row's own `entry_count` is what the TRACE
 *  grouped into this period, and a period is a time window AND a domain tag.
 *  `sample_period` filters the chain on TIME ALONE — measured: two boundaries
 *  with the same window and different tags return byte-identical results, and
 *  neither matches its own `entry_count`. That is not obviously a defect: the
 *  coordinator's records are the chain's raw answer for that stretch of time,
 *  which is exactly what makes them a CHECK on the trace rather than a repeat
 *  of it. But a screen showing two different numbers for one window without
 *  saying why is a screen that looks broken, so it says why. Whether
 *  `sample_period` should honour `domain_tag` is filed as 6.17's `[D]` and
 *  deliberately not decided here — it would change what a published zome
 *  function returns to every existing caller. */
function renderPeriodWindow(
  index: number,
  boundary: { entry_count: number; domain_tag: string },
  sampled: PeriodSample | undefined,
): HTMLElement {
  const box = document.createElement('div');
  box.className = 'period-window';
  box.dataset.testid = 'period-window';
  box.dataset.period = String(index);

  const only = (testid: string, text: string, bad = false) => {
    const p = document.createElement('p');
    p.className = bad ? 'hint error-box' : 'hint';
    p.dataset.testid = testid;
    p.textContent = text;
    box.appendChild(p);
    return box;
  };

  // `unasked` and `reading` are one sentence to a reader: the answer is not
  // known yet. Same reasoning as the applet asset surface.
  if (!sampled || sampled.state === 'reading') {
    return only('period-window-reading', 'Reading this window from your own chain…');
  }
  if (sampled.state === 'failed') {
    return only('period-window-error',
      `That window could not be read: ${sampled.why}. This says nothing about `
      + 'what is in it — the read did not complete.', true);
  }
  if (sampled.records.length === 0) {
    return only('period-window-empty',
      'Nothing on your chain falls in this window. That is an answer, not a failure.');
  }

  const note = document.createElement('p');
  note.className = 'hint';
  note.dataset.testid = 'period-window-note';
  const n = sampled.records.length;
  note.textContent = n === boundary.entry_count
    ? `${n} record${n === 1 ? '' : 's'} on your chain in this window.`
    : `${n} record${n === 1 ? '' : 's'} on your chain in this stretch of time — the `
      + `row says ${boundary.entry_count} because that counts only `
      + `${boundary.domain_tag}, while this reads the chain by time alone. Both are `
      + 'true; the difference is other work you did in the same window.';
  box.appendChild(note);

  const ul = document.createElement('ul');
  ul.className = 'period-records';
  ul.dataset.testid = 'period-records';
  for (const r of sampled.records) {
    const li = document.createElement('li');
    li.className = 'period-record';
    li.dataset.testid = 'period-record';
    li.dataset.kind = r.kind;

    const kind = document.createElement('span');
    kind.className = 'period-record-kind';
    kind.dataset.testid = 'period-record-kind';
    kind.textContent = r.kind;
    li.appendChild(kind);

    if (r.writtenAt !== null) {
      const when = document.createElement('span');
      when.className = 'period-record-when';
      // The ACTION's time, which is the chain's own, not the author-supplied
      // field inside the entry — see `SampledRecord`.
      when.textContent = new Date(r.writtenAt / 1000).toISOString().slice(0, 16).replace('T', ' ');
      li.appendChild(when);
    }

    if (r.content !== null) {
      const text = document.createElement('p');
      text.className = 'period-record-content';
      text.dataset.testid = 'period-record-content';
      // IN FULL, NOT TRUNCATED. The participant who opened this row said they
      // were "unable to see your full critique", and a window that opened its
      // records and then cut them off would answer the letter of that and not
      // the point.
      text.textContent = r.content;
      li.appendChild(text);
    } else {
      const none = document.createElement('span');
      none.className = 'hint';
      none.dataset.testid = 'period-record-no-prose';
      // Said rather than left blank: a Worldline trace has no prose, and an
      // empty line would read as a failed decode.
      none.textContent = 'carries no text of its own';
      li.appendChild(none);
    }
    ul.appendChild(li);
  }
  box.appendChild(ul);
  return box;
}

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

/** Re-read the taxonomy for an already-connected session.
 *
 * Deliberately does NOT clear `adoptionBySpecies` the way `loadTaxonomy()`
 * does. Clearing is right on connect, where there is nothing to show yet and
 * "adoption unavailable" is the honest state; on a refresh it would blank
 * every figure on screen and then fill them back in, which reads as a failed
 * read rather than a pending one. Entries are replaced in place instead, so
 * the screen only ever moves from one true figure to another. */
async function refreshTaxonomy() {
  if (!connection) return;
  const records = await connection.callZome<any[]>('get_all_critique_species', null);
  critiqueSpecies = decodeRecords<CritiqueSpecies>(records);
  render();
  await loadAdoptionCounts();
}

async function loadAdoptionCounts() {
  if (!connection) return;
  const conn = connection;
  await Promise.all(critiqueSpecies.map(async (species) => {
    try {
      // Keyed by ENTRY hash, not action hash — the link base is the species
      // entry itself (CritiqueToSpecies), and passing the action hash returns
      // a confident, wrong zero rather than an error.
      const adoption = await conn.callZome<SpeciesAdoption>(
        'get_species_adoption', species.entryHash,
      );
      adoptionBySpecies.set(b64(species.entryHash), adoption);
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
    const a = adoptionBySpecies.get(key)!;
    const n = a.total_citations;
    adoption.textContent = n === 1 ? 'used by 1 critique' : `used by ${n} critiques`;
  } else {
    adoption.textContent = 'adoption unavailable';
    adoption.classList.add('unavailable');
  }
  head.appendChild(adoption);

  // WHO the citations came from, which is the half a count cannot carry.
  // Rendered as a separate element rather than folded into the sentence
  // above, so "how many critiques" and "how many other agents" stay two
  // facts — a reader deciding whether a species found purchase needs the
  // second, and the first has been standing in for it.
  //
  // Deliberately NOT a ratio and not a badge: a species with one independent
  // adopter is not "20% adopted", and a visual marker would rank the tree by
  // the back door, which §4.4's "lens that aims itself" is about and which
  // the ordering comment above already refuses.
  if (adoptionBySpecies.has(key)) {
    const a = adoptionBySpecies.get(key)!;
    const others = a.independent_adopters.length;
    const by = document.createElement('span');
    by.className = 'species-adopters';
    by.dataset.testid = 'species-adopters';
    if (a.total_citations === 0) {
      // No citations at all is not insularity, and saying "only its proposer"
      // here would assert a citation nobody made.
      by.textContent = 'nobody has used it yet';
      by.classList.add('none');
    } else if (others === 0) {
      by.textContent = 'all by its proposer';
      by.classList.add('self-only');
    } else {
      by.textContent = others === 1
        ? 'including 1 other agent'
        : `including ${others} other agents`;
    }
    head.appendChild(by);
  }
  card.appendChild(head);

  if (species.entry.required_evidence.length > 0) {
    const req = document.createElement('ul');
    req.className = 'species-evidence';
    const label = document.createElement('li');
    label.className = 'species-evidence-label';
    // NOT "must cite". `required_evidence` is declared on CritiqueSpecies
    // (integrity/src/lib.rs:384) and that declaration is its ONLY occurrence in
    // the DNA — no validation rule and no coordinator function reads it, so
    // nothing refuses a critique for citing none of it. "must" asserted a gate
    // this protocol does not have, on every species card in the shipped app.
    // See open-work 7.25, and 1.12 for the same defect one field over.
    label.textContent = 'This type asks a critique to cite:';
    req.appendChild(label);
    for (const item of species.entry.required_evidence) {
      const li = document.createElement('li');
      li.textContent = item;
      req.appendChild(li);
    }
    card.appendChild(req);
    // The limit travels with the list rather than living in a doc nobody
    // reads, which is 6.1's rule applied to a different unenforced field.
    const note = renderConceptNote('required-evidence');
    if (note) card.appendChild(note);
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
  // Was: "Evidence a critique of this type must cite (one per line, optional)"
  // — which contradicted itself in one sentence, promising a requirement and
  // then calling it optional. Nothing enforces the list; see above.
  evidenceInput.placeholder = 'Evidence this type asks a critique to cite (one per line, optional)';
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
        created_at: nowSecs(),
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
  section.appendChild(renderMyPromisesForm());

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

/** "Your promises" — publishing a `Constitution` WITHOUT founding a domain.
 *
 * WHY THIS EXISTS, AND IT IS A GAP RATHER THAN A FEATURE REQUEST. Until
 * 2026-10-27 the only call to `publish_constitution` in this client was
 * inside the founding form, so the only way to promise anything was to
 * found a domain — while `join_membrane` and the "what this author
 * promises" read were both already wired. A membrane may declare
 * `required_promises`, and a joiner had no surface on which to make them.
 * That made the protocol's own entry condition unusable by exactly the
 * people it is for. See open-work 6.7 and `docs/the-joining-promise.md`.
 *
 * THREE THINGS IT SAYS BECAUSE THEY ARE TRUE AND EASY TO GET WRONG:
 *
 *   - Promises are PER DOMAIN. `Promise.domain` is part of the clause, and
 *     a membrane's comparison is scoped to its own domain, so a promise
 *     made for one domain satisfies no other. The field is shown rather
 *     than inferred from whatever is loaded.
 *   - Publishing again does not erase anything. `get_agent_constitution`
 *     returns the most recently published non-expired one, so a later
 *     publish is what readers see — and the earlier one stays on the
 *     record permanently under Invariant 6. Said plainly, before the
 *     button, in the same shape the founding form states permanence.
 *   - Nothing here is enforced at join time. `join_membrane` is
 *     unrestricted by design: a reader compares what you promised against
 *     what a membrane asks, and that is the whole mechanism. This screen
 *     does not claim to admit anyone anywhere.
 */
function renderMyPromisesForm(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'founding-form';
  section.dataset.testid = 'my-promises-form';

  const legend = document.createElement('h3');
  legend.textContent = 'Your promises';
  section.appendChild(legend);

  const intro = document.createElement('p');
  intro.className = 'hint';
  intro.textContent =
    'A domain may ask things of anyone who writes in it. This is where you '
    + 'state what you promise, under your own key, without founding anything. '
    + 'Promises are per domain, and a reader compares them against what the '
    + 'domain asks.';
  section.appendChild(intro);

  const domainInput = document.createElement('input');
  domainInput.type = 'text';
  domainInput.placeholder = 'Which domain, e.g. fieldnotes';
  domainInput.dataset.testid = 'my-promises-domain';
  section.appendChild(domainInput);

  const promisesInput = document.createElement('textarea');
  promisesInput.placeholder = 'What you promise, one per line';
  promisesInput.dataset.testid = 'my-promises-text';
  section.appendChild(promisesInput);

  const permanence = document.createElement('p');
  permanence.className = 'hint';
  permanence.dataset.testid = 'my-promises-permanence';
  permanence.textContent =
    'This is permanent. Publishing again later does not replace or delete '
    + 'this one — readers see your most recent, and the earlier stays on the '
    + 'record. Nothing here admits you to anything: joining is separate, and '
    + 'unrestricted.';
  section.appendChild(permanence);

  const error = document.createElement('p');
  error.className = 'error';
  error.dataset.testid = 'my-promises-error';
  error.hidden = true;
  section.appendChild(error);

  const current = document.createElement('p');
  current.className = 'hint';
  current.dataset.testid = 'my-promises-current';
  current.hidden = true;
  section.appendChild(current);

  const submit = document.createElement('button');
  submit.textContent = 'Publish these promises';
  submit.dataset.testid = 'my-promises-submit';
  submit.onclick = async () => {
    if (!connection) return;
    error.hidden = true;
    current.hidden = true;
    submit.disabled = true;

    const domain = domainInput.value.trim();
    const promises = promisesInput.value.split('\n').map((p) => p.trim()).filter(Boolean);

    // Said better here than by the zome, which refuses both cases anyway:
    // validate_constitution rejects an empty promise list and any clause with
    // an empty action or domain.
    if (!domain || promises.length === 0) {
      error.hidden = false;
      error.textContent =
        'A promise needs a domain it applies to, and at least one thing you promise.';
      submit.disabled = false;
      return;
    }

    try {
      await connection.callZome('publish_constitution', {
        agent: connection.myAgentPubKey,
        promises: promises.map((action) => ({ action, domain, modality: null })),
        conditions: [],
        // SECONDS, not micros — SPEC §5.23. get_agent_constitution compares
        // `expires_at` against sys_time() in seconds, so the two fields share
        // that unit and a micros value here would be meaningless.
        published_at: nowSecs(),
        expires_at: null,
      });
      // Read it back rather than reporting success from the fact that no
      // exception was thrown: the point of this screen is that somebody can
      // see what they actually promised.
      const published = await connection.callZome<Constitution | null>(
        'get_agent_constitution', connection.myAgentPubKey,
      );
      const actions = (published?.promises ?? [])
        .filter((pr) => pr.domain === domain)
        .map((pr) => pr.action);
      current.hidden = false;
      current.textContent = actions.length > 0
        ? `Published. In ${domain} you now promise: ${actions.join('; ')}.`
        : `Published, but nothing reads back for ${domain} — load the domain and check before relying on it.`;
      promisesInput.value = '';
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
  // A TEXTAREA, ONE PER LINE, AND THE SINGLE-LINE INPUT THIS REPLACED WAS A
  // REAL LIMIT RATHER THAN A STYLE CHOICE. `Constitution.promises` is a Vec and
  // a membrane's `required_promises` is a Vec, and this form let a founder
  // declare SEVERAL demands of others while publishing exactly ONE promise of
  // their own — so a founder requiring four phrases was missing three of them
  // in their own membrane, visible in the first `promiseCompliance` read. Found
  // 2026-10-27 while preparing the pilot founding (open-work 6.7).
  const promiseInput = document.createElement('textarea');
  promiseInput.placeholder = 'What you promise, one per line';
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

    const mine = promiseInput.value.split('\n').map((p) => p.trim()).filter(Boolean);
    const domain = domainInput.value.trim();
    const required = requiredInput.value.split('\n').map((p) => p.trim()).filter(Boolean);

    // Checked here only to give a better message than the zome's; the
    // integrity zome rejects both cases regardless of this form.
    if (mine.length === 0 || !domain || required.length === 0) {
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
        promises: mine.map((action) => ({ action, domain, modality: null })),
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

  // THE EXCLUSION IS SHOWN, NOT ASSUMED. `total_claims` leaves out Claims that
  // are READINGS of this domain rather than discourse in it — a reading is
  // published into the domain it describes, so counting it made the aggregate
  // measure itself (READINESS item 22). Stating the figure here is the same
  // argument as reporting `reading_claims` from the zome at all: somebody
  // comparing this screen against the domain's own claim list must be able to
  // account for the difference, and a number that silently omits things is
  // indistinguishable from a wrong one.
  //
  // Rendered only when there ARE readings — a line saying "0 set aside" on
  // every domain is noise, and the absence is not a fact anybody needs.
  if (health.reading_claims > 0) {
    const setAside = document.createElement('p');
    setAside.className = 'health-set-aside';
    setAside.dataset.testid = 'health-set-aside';
    setAside.textContent =
      `${health.reading_claims} reading${health.reading_claims === 1 ? '' : 's'} of this domain `
      + `${health.reading_claims === 1 ? 'is' : 'are'} set aside, not counted above — `
      + `a reading is an observation of the discourse, not part of it.`;
    wrap.appendChild(setAside);
  }

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
  contentArea.value = newClaimDraft.content;
  contentArea.oninput = () => {
    newClaimDraft.content = contentArea.value;
    // Typing the next claim is what retires the last one's confirmation.
    if (newClaimNotice !== null) { newClaimNotice = null; successBox.hidden = true; }
  };
  contentLabel.appendChild(contentArea);

  const domainLabel = document.createElement('label');
  domainLabel.textContent = 'Domain';
  const domainInput = document.createElement('input');
  domainInput.type = 'text';
  domainInput.required = true;
  domainInput.placeholder = 'e.g. LumbarRehab';
  domainInput.dataset.testid = 'new-claim-domain';
  // An untouched box still pre-fills from the domain being browsed, which is
  // the affordance this line always provided; once it has been typed into, the
  // draft wins and a rebuild no longer overwrites the edit.
  domainInput.value = newClaimDraft.domain || currentDomain;
  domainInput.oninput = () => { newClaimDraft.domain = domainInput.value; };
  domainLabel.appendChild(domainInput);

  const confidenceLabel = document.createElement('label');
  confidenceLabel.textContent = 'Confidence';
  const confidenceSelect = document.createElement('select');
  // Named for the same reason `new-claim-tags` is: a harness has to be able
  // to say WHICH select, and the header's theme picker is the first one on
  // the page. `compose-adversary.mjs` asserts this box is never moved by the
  // model's advice, which it cannot do without naming it.
  confidenceSelect.dataset.testid = 'new-claim-confidence';
  for (const level of CONFIDENCE_LEVELS) {
    const opt = document.createElement('option');
    opt.value = level;
    opt.textContent = level;
    if (level === newClaimDraft.confidence) opt.selected = true;
    confidenceSelect.appendChild(opt);
  }
  confidenceSelect.onchange = () => { newClaimDraft.confidence = confidenceSelect.value; };
  confidenceLabel.appendChild(confidenceSelect);

  // --- THE COMPOSE-TIME ADVERSARY (open-work 6.10) -------------------
  //
  // PLACED AFTER CONFIDENCE AND BEFORE PUBLISH, which is the only place
  // it belongs: §(2) of that row names the trap as an author RAISING
  // their confidence because the draft survived an adversary that
  // observed nothing and published nothing. The denial has to be where
  // the confidence box is, not in a panel further down.
  const adversary = document.createElement('fieldset');
  adversary.className = 'adversary-fieldset';
  adversary.dataset.testid = 'adversary';
  const advLegend = document.createElement('legend');
  advLegend.textContent = 'Before you sign (optional)';
  adversary.appendChild(advLegend);

  const advHint = document.createElement('p');
  advHint.className = 'hint';
  advHint.dataset.testid = 'adversary-hint';
  advHint.textContent =
    'A model on this machine reads the draft and says what it will be asked. '
    + 'It writes nothing, it is not recorded anywhere, and nobody is on record '
    + 'as having raised any of it. The draft does not leave this machine.';
  adversary.appendChild(advHint);

  const advBtn = document.createElement('button');
  advBtn.type = 'button';
  advBtn.dataset.testid = 'adversary-run';
  advBtn.textContent = adversaryRunning ? 'Reading the draft…' : 'What will this be asked?';
  advBtn.disabled = adversaryRunning || newClaimDraft.content.trim().length === 0;
  advBtn.onclick = async () => {
    adversaryRunning = true;
    adversaryError = null;
    adversaryVerdict = null;
    render();
    try {
      adversaryVerdict = await askAdversary({
        draft: newClaimDraft.content,
        domain: newClaimDraft.domain || currentDomain || undefined,
      });
    } catch (err) {
      // THE FOUR KINDS ARE TOLD APART, because conflating them is how
      // "the weights have not finished downloading" becomes "the model
      // had nothing to say about your draft".
      adversaryError = err instanceof AdversaryError
        ? { kind: err.kind, message: err.message }
        : { kind: 'unusable', message: err instanceof Error ? err.message : String(err) };
    } finally {
      adversaryRunning = false;
      render();
    }
  };
  adversary.appendChild(advBtn);

  // THE BUTTON FOLLOWS THE DRAFT WITHOUT A REBUILD, and it has to.
  // `disabled` above is computed when the form is built, and typing
  // deliberately does NOT re-render — a rebuild per keystroke is exactly
  // the cost open-work 1.23 keeps this architecture honest about. So the
  // state was stale: an author typed a draft and the button stayed off
  // until something unrelated re-rendered. Found by
  // `compose-adversary.mjs` timing out against a disabled button, which
  // is a better way to find it than a user reporting it.
  const previousInput = contentArea.oninput;
  contentArea.oninput = (event) => {
    previousInput?.call(contentArea, event as Event & { target: EventTarget });
    advBtn.disabled = adversaryRunning || contentArea.value.trim().length === 0;
  };

  // ONE CONTAINER FOR EVERYTHING THE MODEL PRODUCED, so the publish path can
  // drop it in a line. That path deliberately does NOT call `render()` — it
  // resets the fields by hand — because a rebuild at that moment would let
  // `captureFieldValues` restore the very text the publish just cleared. So
  // the state clearing in `clearAfterPublish` needs a DOM counterpart here,
  // and this is it. Found by `compose-adversary.mjs` §6: the verdict was
  // nulled and the objections stayed on screen, which is 6.10's second
  // decision broken by an invisible gap between state and DOM.
  const advOutput = document.createElement('div');
  advOutput.dataset.testid = 'adversary-output';
  adversaryOutputEl = advOutput;
  adversary.appendChild(advOutput);

  if (adversaryError) {
    const box = document.createElement('p');
    box.className = 'hint';
    box.dataset.testid = 'adversary-error';
    box.dataset.kind = adversaryError.kind;
    // AN ABSENT ADVERSARY IS NOT A VERDICT. Said explicitly, because a
    // failure here is silent otherwise and an author could read an
    // empty panel as "no objections found".
    box.textContent = `${adversaryError.message} Nothing was checked, which is `
      + 'not the same as nothing being wrong.';
    advOutput.appendChild(box);
  }

  if (adversaryVerdict) {
    const v = adversaryVerdict;
    if (v.unconstrained) {
      const warn = document.createElement('p');
      warn.className = 'hint';
      warn.dataset.testid = 'adversary-unconstrained';
      warn.textContent =
        'UNCONSTRAINED — this server could not hold the reply to a schema, so the '
        + 'shape below was recovered by parsing rather than guaranteed.';
      advOutput.appendChild(warn);
    }

    if (v.objections.length === 0) {
      const none = document.createElement('p');
      none.className = 'hint';
      none.dataset.testid = 'adversary-none';
      // HAVING NOTHING TO SAY IS A REAL ANSWER and is reported as one —
      // but it is still not evidence, which the line below repeats
      // because this is the case most likely to be over-read.
      none.textContent =
        'The model raised nothing. That is a real answer and not a verdict: it '
        + 'read the words in front of it and nobody has looked at this claim.';
      advOutput.appendChild(none);
    } else {
      const list = document.createElement('ul');
      list.className = 'adversary-list';
      list.dataset.testid = 'adversary-list';
      for (const o of v.objections) {
        const li = document.createElement('li');
        li.dataset.testid = 'adversary-objection';
        if (o.mode) {
          const mode = document.createElement('span');
          mode.className = 'critique-mode';
          mode.dataset.testid = 'adversary-mode';
          mode.textContent = o.mode;
          li.appendChild(mode);
          if (!o.modeIsReal) {
            // SURFACED, NEVER CORRECTED. Four runs across two models
            // established that small models read the five modes as
            // topic categories; an enum at the sampler would hide that
            // behind a plausible label. The author sees the mistake.
            const bad = document.createElement('span');
            bad.className = 'hint';
            bad.dataset.testid = 'adversary-mode-unreal';
            bad.textContent = ' NOT A MODE THIS PROTOCOL HAS ';
            li.appendChild(bad);
          }
        }
        const text = document.createElement('span');
        text.textContent = ` ${o.text}`;
        li.appendChild(text);
        list.appendChild(li);
      }
      advOutput.appendChild(list);
    }

    if (v.evidenceGap) {
      const gap = document.createElement('p');
      gap.className = 'hint';
      gap.dataset.testid = 'adversary-evidence-gap';
      gap.textContent = `What would answer the strongest of these: ${v.evidenceGap}`;
      advOutput.appendChild(gap);
    }

    // THE DENIAL, AND IT IS THE REASON THIS SECTION SITS WHERE IT DOES.
    // §(2) of 6.10: a claim pre-hardened against a model's objections
    // reads as better-grounded than it was. Nothing goes on the record —
    // authors consult colleagues and cite nobody — so the honesty is
    // owed on the screen instead, next to the box it would corrupt.
    const notEvidence = document.createElement('p');
    notEvidence.className = 'hint';
    notEvidence.dataset.testid = 'adversary-not-evidence';
    notEvidence.textContent =
      'Surviving these is NOT evidence. This model observed nothing, replicated '
      + 'nothing and published nothing; it cannot support a higher confidence, '
      + 'and none of it is recorded anywhere or attributed to anybody.';
    advOutput.appendChild(notEvidence);

    if (v.confidence) {
      const advised = document.createElement('p');
      advised.className = 'hint';
      advised.dataset.testid = 'adversary-confidence';
      // RENDERED AS THE MODEL'S READING AND NEVER APPLIED. The select
      // above is not touched: a client that moved the author's
      // confidence would be making the claim for them.
      advised.textContent =
        `The model reads the draft as supporting ${v.confidence} at most. `
        + 'Yours is the one that is published, and nothing here changes it.';
      advOutput.appendChild(advised);
    }
  }

  const tagsLabel = document.createElement('label');
  tagsLabel.textContent = 'Tags (comma-separated, optional)';
  const tagsInput = document.createElement('input');
  tagsInput.type = 'text';
  // Named for the same reason the Browse tab's domain box is: this was the one
  // field in the app that `focusKey` could not identify across a rebuild.
  tagsInput.setAttribute('data-testid', 'new-claim-tags');
  tagsInput.value = newClaimDraft.tags;
  tagsInput.oninput = () => { newClaimDraft.tags = tagsInput.value; };
  tagsLabel.appendChild(tagsInput);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.textContent = 'Publish claim';

  const errorBox = document.createElement('div');
  errorBox.className = 'error-box';
  errorBox.hidden = true;
  const successBox = document.createElement('div');
  successBox.className = 'success-box';
  // Restored from state rather than left to the DOM, because the re-render that
  // publishing triggers is what used to destroy it — the confirmation vanished
  // exactly when it had just become true.
  successBox.hidden = newClaimNotice === null;
  if (newClaimNotice !== null) successBox.textContent = newClaimNotice;

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
  evidenceContent.value = newClaimDraft.evidenceContent;
  evidenceContent.oninput = () => { newClaimDraft.evidenceContent = evidenceContent.value; };
  evidenceFieldset.appendChild(evidenceContent);
  const evidenceTypeSelect = document.createElement('select');
  evidenceTypeSelect.dataset.testid = 'evidence-type';
  for (const t of EVIDENCE_TYPES) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    if (t === newClaimDraft.evidenceType) opt.selected = true;
    evidenceTypeSelect.appendChild(opt);
  }
  evidenceTypeSelect.onchange = () => {
    newClaimDraft.evidenceType = evidenceTypeSelect.value as EvidenceType;
  };
  evidenceFieldset.appendChild(evidenceTypeSelect);
  const evidenceUrl = document.createElement('input');
  evidenceUrl.type = 'text';
  evidenceUrl.placeholder = 'Source URL (optional)';
  evidenceUrl.dataset.testid = 'evidence-url';
  evidenceUrl.value = newClaimDraft.evidenceUrl;
  evidenceUrl.oninput = () => { newClaimDraft.evidenceUrl = evidenceUrl.value; };
  evidenceFieldset.appendChild(evidenceUrl);

  form.appendChild(contentLabel);
  form.appendChild(domainLabel);
  form.appendChild(confidenceLabel);
  form.appendChild(adversary);
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
          timestamp: nowMicros(),
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
      const createdAt = await connection.callZome<Uint8Array>('create_claim', claim);
      // SAYS WHAT HAPPENED LOCALLY, AND WHAT HAS NOT HAPPENED YET.
      //
      // "Claim published." was true and incomplete, and the gap between those
      // two is the most expensive kind of silence this app can produce.
      // create_claim returning means the entry is on this agent's own source
      // chain — nothing more. Whether a peer can see it depends on gossip, and
      // README §9 records crossings measured at 415s, 424.9s, 929.1s and
      // 943.0s against non-crossings inside 330s, with the investigation
      // deliberately frozen because every remaining question sits in kitsune2
      // rather than here.
      //
      // So a user who publishes, asks a peer, and hears nothing concludes the
      // app is broken. It is not: it is slow in a way nobody can predict yet.
      // Saying so at the moment of publishing costs one sentence and converts
      // the single most likely false bug report into a known characteristic.
      //
      // THIS IS NOT A JUDGEMENT ABOUT THE CLAIM, which matters because §4.4
      // forbids this UI inferring a credibility ordering and presenting it as
      // neutral. Delivery state is not credibility: the sentence is about
      // where the bytes are, is identical for every claim, and would read the
      // same if the content were the opposite.
      newClaimNotice = 'Published to your own chain. Peers may take '
        + 'minutes to see it — that is expected on this network, not a fault.';
      // 6.16: a domain just published into is the one a reader is most likely
      // to want back, and this list is the thing the Worldline route got
      // wrong by being a frozen snapshot. Re-read rather than appended to
      // locally, so the screen shows what the chain says.
      void loadMyDomains();
      // THE RESOLVE HALF OF THE `creatable` SURFACE (open-work 1.28), and the
      // one place in this handler that knows the hash. Moss opened a dialog
      // asking for a claim; it stays open until `resolve`, `reject` or
      // `cancel` is called (`types.d.ts:122-136`), so a publish that did not
      // call it would leave the host hanging on a claim that is already on
      // the chain — success, presented as a hang.
      //
      // `createdAt` is the ActionHash `create_claim` returns, which is what
      // the WAL carries. The DNA hash is asked for here rather than cached at
      // connect time because this is the only surface that needs it, and a
      // failure to get it must not stop the publish that has already
      // happened: `finishCreatable` is a notification to another program
      // about an entry that exists either way.
      if (appletSurfaceNow === 'creatable' && appletHost && !appletCreatableSettled) {
        appletCreatableSettled = true;
        void (async () => {
          try {
            const dna = await connection!.dnaHash();
            if (!dna) return;
            await appletHost!.finishCreatable({ ok: true, dnaHash: dna, targetHash: createdAt });
          } catch {
            // The host gets told nothing and closes its own dialog on the
            // user's next action. Reported nowhere on purpose: there is no
            // screen left to report it in, the dialog is the host's, and the
            // claim is published.
          }
        })();
      }
      successBox.hidden = false;
      successBox.textContent = newClaimNotice;
      clearAfterPublish();
      contentArea.value = newClaimDraft.content;
      tagsInput.value = newClaimDraft.tags;
      evidenceContent.value = newClaimDraft.evidenceContent;
      evidenceUrl.value = newClaimDraft.evidenceUrl;
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

// ============================================================================
// THE APPLET VIEW — open-work 1.28. Moss asked for one of three surfaces and
// this is where each one is drawn.
//
// NONE OF THESE IS A NEW SCREEN. `main` is `renderTabs()`, the whole app.
// `creatable` is `renderNewClaimTab()`, the same form, with the tab bar taken
// away because the host has already framed it as "create a claim" and a nav
// bar inside somebody else's modal is two navigations arguing. `asset` is the
// one surface with its own renderer, and the reason is stated where it is
// defined. Delete this section and the standalone app is untouched.
// ============================================================================

/** The claim this view was opened ON, for an `asset` render. */
let appletAsset: Claim | null = null;
let appletAssetError = '';

/** SIX STATES, AND THE FIRST ONE IS WHY THIS IS A STATE MACHINE AND NOT A
 *  BOOLEAN. The first version of this surface had `appletAssetLoading` and a
 *  `null` claim, and `bootApplet` renders once before it starts the read — so
 *  the first frame of every asset view said "Nothing came back for that
 *  address", about a claim that was there, before anything had been asked.
 *  `applet-view.mjs` caught it on its first green run, through the
 *  MutationObserver rather than through any of the checks that read the panel,
 *  which by then showed the claim.
 *
 *  That is open-work 6.13's finding — an unasked question rendered as a
 *  negative answer — arriving unprompted in new code written by someone who
 *  had just read the row. Hence a named `unasked`, which renders exactly what
 *  `reading` renders, because to a reader they are the same fact: this is not
 *  answered yet.
 *
 *  `unreadable` is separate from `absent` on the same principle. A WAL this
 *  Tool cannot address at all — a malformed `hrl`, a hash of length zero — is
 *  known synchronously and is a different thing from a read that returned
 *  nothing, which on a DHT is never proof of absence. */
type AppletAssetState = 'unasked' | 'reading' | 'ready' | 'absent' | 'unreadable' | 'error';
let appletAssetState: AppletAssetState = 'unasked';
/** Set once a `creatable` render has been resolved or cancelled, so the form
 *  stops offering to do it twice. The host closes its own dialog on the first
 *  call; a second would be a call into a view that is being torn down. */
let appletCreatableSettled = false;

/** A one-line frame naming where this UI is running and, when the host told
 *  us, which group.
 *
 *  THE GROUP NAME IS A LABEL AND NOT A MEMBERSHIP CLAIM, which is why it is
 *  rendered as plain text next to the word "Moss" rather than as anything a
 *  reader could take for a scope. `RenderInfo.groupProfiles` documents itself
 *  as NON-EXHAUSTIVE — a federated applet may be shared with groups this
 *  agent is not in — so the first entry is the host's idea of context, and
 *  this protocol's own answer to "who can see this" is the membrane, which is
 *  on the chain and is not affected by any of this. */
function renderAppletFrame(host: WeaveHost): HTMLElement {
  const frame = document.createElement('p');
  frame.className = 'hint';
  frame.dataset.testid = 'applet-frame';
  const group = host.groupLabel();
  frame.textContent = group
    ? `Running as a Moss Tool in ${group}.`
    : 'Running as a Moss Tool.';
  return frame;
}

/** The `asset` surface: ONE claim, because the host asked about one claim.
 *
 *  WHY THIS DOES NOT CALL `renderClaimCard`, which would have been the obvious
 *  reuse. That renderer keys every control it draws — the critique panel, the
 *  grounding chain, the retraction form — off `claim.entryHash`, and what
 *  arrives here is a WAL, whose hash is an `AnyDhtHash`: the `ActionHash`
 *  `create_claim` returned is what another Tool would most naturally have
 *  stored. `get_claim` resolves either (`AnyDhtHash` in the zome signature),
 *  but it answers with a `Claim` and NOT a record, so there is no entry hash
 *  to key those controls with. Passing the action hash in its place would
 *  produce controls that look live and silently read nothing — the exact shape
 *  open-work exists to catch, and the shape this row was opened for.
 *
 *  So: the claim is rendered read-only, and the way to the controls is the
 *  Tool's own main view, which the host can open and where the claim is
 *  reached by the browse path that does have records. An honest smaller
 *  surface, not a broken larger one. */
function renderAppletAsset(): HTMLElement {
  const wrap = document.createElement('main');
  wrap.className = 'tab-content';
  wrap.dataset.testid = 'applet-asset';

  const only = (testid: string, text: string, bad = false) => {
    const p = document.createElement('p');
    p.className = bad ? 'hint error-box' : 'hint';
    p.dataset.testid = testid;
    p.textContent = text;
    wrap.appendChild(p);
    return wrap;
  };

  // `unasked` and `reading` render the SAME panel on purpose — see
  // `AppletAssetState`. Anything else puts a negative answer on screen before
  // the question has been asked.
  if (appletAssetState === 'unasked' || appletAssetState === 'reading') {
    return only('applet-asset-loading', 'Looking this claim up on the DHT…');
  }
  if (appletAssetState === 'unreadable') {
    // Known without asking anyone, and therefore NOT the same sentence as
    // `absent` below. Saying "nothing came back" about an address that was
    // never addressable would blame the network for a malformed WAL.
    return only('applet-asset-unreadable',
      'That address is not one this Tool can read. Nothing was asked of the '
      + 'network, so this says nothing about whether the claim exists.', true);
  }
  if (appletAssetState === 'error') {
    // NOT "no such claim". A read that failed and a claim that is not here
    // are different facts, and on a DHT the second one is never knowable from
    // a single read — 6.13's whole finding, in a second place.
    return only('applet-asset-error', appletAssetError, true);
  }
  if (appletAssetState === 'absent' || !appletAsset) {
    return only('applet-asset-absent',
      'Nothing came back for that address. On a DHT that means nobody '
      + 'reachable is holding it yet, which is not the same as it not existing.');
  }

  const content = document.createElement('p');
  content.className = 'claim-content';
  content.dataset.testid = 'applet-asset-content';
  content.textContent = appletAsset.content;
  wrap.appendChild(content);

  const meta = document.createElement('div');
  meta.className = 'claim-meta';
  meta.dataset.testid = 'applet-asset-meta';
  meta.textContent = `${appletAsset.confidence} confidence · in ${appletAsset.domain}`;
  wrap.appendChild(meta);
  return wrap;
}

/** Reads the claim an `asset` render was opened on.
 *
 *  TAKES THE RAW HASH AND NEVER DECODES ONE. `AppletTarget` carries both
 *  forms precisely so this function does not have to choose an encoder, and
 *  the choice is a real trap rather than a hypothetical one: this file's own
 *  `b64`/`bytesFromB64` are plain base64 over raw bytes, while a Holochain
 *  hash in text is base64url with a `u` prefix (`uhCkk…`). Those two produce
 *  the same byte COUNT and different bytes, so crossing them gives a read
 *  that quietly returns nothing for a claim that is there. The one conversion
 *  lives in `applet-host.ts`, beside the library that defines it. */
async function loadAppletAsset(at: AppletTarget | null): Promise<void> {
  if (!connection) return;
  // A WAL that yielded no addressable hash. Reached synchronously and given
  // its own state rather than falling through to `absent`, which would report
  // a network answer nobody asked for.
  if (!at) { appletAssetState = 'unreadable'; render(); return; }
  appletAssetState = 'reading';
  appletAssetError = '';
  render();
  try {
    appletAsset = await connection.callZome<Claim | null>('get_claim', at.target);
    appletAssetState = appletAsset ? 'ready' : 'absent';
  } catch (err) {
    appletAsset = null;
    appletAssetState = 'error';
    appletAssetError = `Could not read that claim: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    render();
  }
}

/** The `creatable` surface: the New Claim form, and a way out of it.
 *
 *  THE CANCEL BUTTON IS NOT A COURTESY. `AppletView`'s creatable arm hands the
 *  view `resolve`, `reject` and `cancel`, and the host's dialog stays open
 *  until one of them is called (`types.d.ts:122-136`). A form with no cancel
 *  leaves a user who changed their mind holding a modal they cannot close,
 *  inside an application that is not ours — a hang rather than an error, which
 *  is the worse of the two. The resolve half is in the publish handler, where
 *  the hash exists. */
function renderAppletCreatable(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.dataset.testid = 'applet-creatable';
  if (!appletCreatableSettled) {
    const cancel = document.createElement('button');
    cancel.className = 'link-button';
    cancel.dataset.testid = 'applet-creatable-cancel';
    cancel.textContent = '← Cancel';
    cancel.onclick = () => {
      appletCreatableSettled = true;
      void appletHost?.finishCreatable({ ok: false, reason: 'cancel' });
      render();
    };
    wrap.appendChild(cancel);
  }
  wrap.appendChild(renderNewClaimTab());
  return wrap;
}

/** Boots the Moss path, and renders the standalone app if it cannot.
 *
 *  THE ORDER HERE IS THE WHOLE DESIGN. `appletConnecting` is set BEFORE the
 *  await and the first `render()` happens before it too, so the first frame a
 *  Moss user sees says "connecting through Moss" rather than this app's
 *  connect form — a form whose three fields describe an Admin API that is not
 *  reachable from inside a Tool. Getting that order wrong is not cosmetic: it
 *  asks somebody to type a websocket URL that will be ignored, which is
 *  `launcher-packaging.mjs`'s whole finding arriving a second time on a second
 *  host.
 *
 *  AND THE FALLBACK IS A STATE, NOT A SILENCE. When the host does not answer
 *  — the timeout in `connectAppletHost`, a throw, or a cross-group render with
 *  no `appletClient` in it — `appletUnavailable` makes the screen say so. The
 *  alternative, leaving `appletConnecting` true, is a spinner that never
 *  stops, which is exactly the failure the measured `connect()` hang produces
 *  and exactly the one the timeout exists to convert into a sentence. */
async function bootApplet(): Promise<void> {
  const config = loadConfig();
  appletConnecting = true;
  const got = await connectAppletHost(config);
  appletConnecting = false;
  if (!got) {
    appletUnavailable = true;
    render();
    return;
  }

  appletHost = got.host;
  appletSurfaceNow = got.host.surface();
  // Adopted, not connected — holochain.ts's shape (3). No socket is opened
  // here and no token is issued, because Moss installed and authenticated
  // this Tool's own happ before it rendered anything.
  connection = HolochainConnection.fromAppClient(got.appClient, config);
  markDone('connected');
  if (appletSurfaceNow === 'creatable') activeTab = 'new-claim';
  render();

  // The same three background loads the Launcher path does, and for the same
  // reason: the species picker lives in the critique form, which a Tool user
  // reaches without ever visiting the taxonomy tab.
  void loadFrictionStatus();
  void loadTaxonomy().catch(() => { /* the tab shows its own empty state */ });
  void loadMyDomains();
  if (appletSurfaceNow === 'asset') void loadAppletAsset(got.host.openedOn());
}

// --- Boot -------------------------------------------------------------

// Before the first render, so a pinned theme is in force for the first
// frame this module paints. index.html stamps the same attribute earlier
// still, from its own pre-paint read — this call is what keeps the two
// agreeing once the module graph owns the state.
initTheme();

// RUNNING AS A MOSS TOOL — one branch, and standalone is the default.
//
// `applet.ts` carries the reasoning; what matters here is that this is the
// ONLY line the host integration adds to the boot path, and that an unknown
// or absent host renders exactly what it rendered before. A host integration
// that could change the standalone app's behaviour would be a dependency on
// Moss rather than an option to run inside it.
if (entryPoint(hostContext()) === 'applet') {
  // Implemented as of open-work 1.28. `data-host` is stamped SYNCHRONOUSLY,
  // before the await inside `bootApplet`, because it is the only thing on this
  // path that is known without asking the host anything — and because the
  // first `render()` below has to be able to tell "inside Moss, still asking"
  // from "a browser tab with no host", which are two different first frames.
  document.body.dataset.host = 'applet';
  // Deliberately not awaited: `render()` below must paint the connecting
  // state, and awaiting here would leave the page blank for however long the
  // host takes — up to `CONNECT_TIMEOUT_MS` when it takes forever, which the
  // installed source says it can.
  void bootApplet();
}

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
      void loadMyDomains();
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

// --- Foresight (pre-registration) ----------------------------------------
//
// THE DENOMINATOR IS THE SCREEN'S WHOLE OBLIGATION, and this is the one tab
// where a beautiful rendering of the happy path would be a defect.
//
// The protocol refuses everything that would launder a track record: a reveal
// must hash to its commitment, come from the committer, and arrive before the
// deadline. But a SCREEN can undo all of that by presentation alone — show the
// revealed predictions, omit the expired ones, and the agent appears to have
// foreseen everything they chose to disclose. That is exactly the selective
// revelation README.md §9 refused to ship, reintroduced at the view layer
// where no validation rule reaches.
//
// So three things here are structural rather than stylistic:
//
//   EXPIRED SITS BESIDE REVEALED, in the same view, unconditionally. Not
//   behind a tab, a toggle, an accordion or a "show more" — one is the
//   denominator of the other and a reader who sees one must see both.
//   NO RATIO IS COMPUTED. SPEC §10.16 makes that a MUST NOT, and the reason
//   is Invariant #1: the expired set exists to deflate a claim of foresight,
//   not to score its author. Counting is the reader's business.
//   A PENDING COMMITMENT SHOWS ITS QUESTION AND DEADLINE AND NOT ITS CONTENT,
//   because the content is sealed and the other two are what make the
//   commitment answerable.
let foresightLoaded = false;
let myForesight: ForesightRecord | null = null;
let foresightFormOpen = false;
// THE QUESTION A COMMITMENT IS ABOUT, CARRIED FROM THE CLAIM ITSELF.
// `PreRegistration.question` is an ActionHash and validation resolves it, so
// the form's first field could only ever be satisfied by a real hash — which
// this UI renders exclusively through `short()` and offers no way to copy.
// The field was therefore unsatisfiable from inside the app: see
// `docs/open-work.md` 6.8. The fix is not a copy button; it is that the claim
// knows its own hash, so the route starts there and the user never sees one.
let foresightPrefill: { question: Uint8Array; content: string } | null = null;

interface ForesightEntry {
  pre_registration: Uint8Array;
  question: Uint8Array;
  reveal_deadline: number;
  revealed_prediction: string | null;
}
interface ForesightRecord {
  revealed: ForesightEntry[];
  expired: ForesightEntry[];
  pending: ForesightEntry[];
  /** `"chain"` or `"index"` — open-work 1.24. A chain count cannot be
   * skipped by the writer; an index count can. */
  counted_from: string;
  /** `"valid"`, `"forked"`, `"empty"`, `"unreadable"` or `"unreachable"`. */
  chain_status: string;
  /** Commitments on the chain the author's own index does not carry. */
  unindexed: number;
  /** The coordinator's own statement of what the figures rest on. */
  note: string;
}
/// The author's own sealed content, as `get_my_sealed_prediction` returns it.
/// `null` is a real answer and not an error: it means this chain does not
/// hold the commitment, which is the other-device case.
interface SealedPrediction {
  prediction: string;
  salt: string;
}

async function loadForesight(): Promise<void> {
  foresightLoaded = true;
  try {
    const conn = connection;
    if (!conn) return;
    myForesight = await conn.callZome<ForesightRecord>('get_foresight_record', conn.myAgentPubKey);
  } catch {
    myForesight = null;
  }
  render();
}

function renderForesightList(
  testid: string,
  heading: string,
  note: string,
  entries: ForesightEntry[],
  emptyText: string,
): HTMLElement {
  const box = document.createElement('div');
  box.className = 'foresight-group';
  box.dataset.testid = testid;

  const h = document.createElement('h3');
  // The count is the SIZE OF A SET, which is a fact, and not a ratio against
  // another set, which would be a score. §10.16 bars the second.
  h.textContent = `${heading} (${entries.length})`;
  box.appendChild(h);

  const why = document.createElement('p');
  why.className = 'hint';
  why.dataset.testid = `${testid}-note`;
  why.textContent = note;
  box.appendChild(why);

  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.dataset.testid = `${testid}-empty`;
    empty.textContent = emptyText;
    box.appendChild(empty);
    return box;
  }

  const ul = document.createElement('ul');
  ul.className = 'foresight-items';
  for (const e of entries) {
    const li = document.createElement('li');
    li.dataset.testid = `${testid}-item`;

    const q = document.createElement('span');
    q.className = 'foresight-question';
    q.textContent = `on question ${short(e.question)}`;
    li.appendChild(q);

    const when = document.createElement('span');
    when.className = 'foresight-deadline';
    when.textContent = ` · reveal by ${new Date(e.reveal_deadline / 1000).toLocaleString()}`;
    li.appendChild(when);

    if (e.revealed_prediction !== null) {
      const p = document.createElement('p');
      p.className = 'foresight-prediction';
      p.textContent = e.revealed_prediction;
      li.appendChild(p);
    } else {
      const sealed = document.createElement('p');
      sealed.className = 'hint';
      sealed.dataset.testid = `${testid}-sealed`;
      sealed.textContent = 'Sealed — the content is not on the DHT in readable form until it is revealed.';
      li.appendChild(sealed);

      // ONLY OFFERED WHERE A REVEAL CAN STILL SUCCEED. An expired commitment
      // gets no reveal control, because the protocol refuses a late reveal and
      // a button that always fails teaches a reader the deadline is advisory.
      if (testid === 'foresight-pending') {
        const rp = document.createElement('input');
        rp.placeholder = 'the prediction, exactly as committed';
        rp.dataset.testid = 'foresight-reveal-prediction';
        const rs = document.createElement('input');
        rs.placeholder = 'the salt';
        rs.dataset.testid = 'foresight-reveal-salt';
        const rb = document.createElement('button');
        rb.className = 'link-button';
        rb.dataset.testid = 'foresight-reveal-submit';
        rb.textContent = 'Reveal';
        const rerr = document.createElement('p');
        rerr.className = 'error-box';
        rerr.dataset.testid = 'foresight-reveal-error';
        rerr.hidden = true;
        rb.onclick = () => {
          rerr.hidden = true;
          void revealPrediction(e.pre_registration, rp.value, rs.value, (m) => {
            rerr.hidden = false; rerr.textContent = m;
          });
        };
        // RECOVER, NOT AUTOFILL. It is deliberately a button the author
        // presses rather than a silent prefill: the two fields are what they
        // are being held to, and a form that quietly filled them would hide
        // the one case that matters — a commitment made on another device,
        // which this chain does not hold and cannot recover.
        const rrec = document.createElement('button');
        rrec.className = 'link-button';
        rrec.dataset.testid = 'foresight-reveal-recover';
        rrec.textContent = 'Recover from my chain';
        rrec.onclick = async () => {
          rerr.hidden = true;
          const conn = connection;
          if (!conn) return;
          try {
            const sealed = await conn.callZome<SealedPrediction | null>(
              'get_my_sealed_prediction', e.pre_registration);
            if (sealed && typeof sealed.salt === 'string') {
              rp.value = sealed.prediction;
              rs.value = sealed.salt;
            } else {
              rerr.hidden = false;
              rerr.textContent =
                'Not on this chain — this commitment was made on another device, '
                + 'so the prediction and salt have to come from your own records.';
            }
          } catch (err) {
            rerr.hidden = false;
            rerr.textContent = String((err as Error)?.message ?? err);
          }
        };
        for (const el of [rp, rs, rrec, rb, rerr]) li.appendChild(el);
      }
    }
    ul.appendChild(li);
  }
  box.appendChild(ul);
  return box;
}

async function commitPrediction(
  question: string,
  prediction: string,
  salt: string,
  hoursAhead: number,
  onError: (m: string) => void,
): Promise<void> {
  try {
    const conn = connection;
    if (!conn) return;
    await conn.callZome('pre_register', {
      question: bytesFromB64(question),
      prediction,
      salt,
      reveal_deadline: (Date.now() + hoursAhead * 3600_000) * 1000,
    });
    foresightFormOpen = false;
    foresightLoaded = false;
    foresightPrefill = null;
    render();
  } catch (e) {
    onError(String((e as Error)?.message ?? e));
  }
}

/// THE REVEAL FORM ASKS FOR THE CONTENT AND THE SALT, and until 2026-10-27
/// this comment said it "cannot do otherwise" and that neither was
/// recoverable. **The second half was false, and it mattered.** Neither is
/// recoverable from the DHT — a private entry never goes there — but
/// `SealedPrediction` is written to the AUTHOR'S OWN SOURCE CHAIN, and the
/// integrity zome's rationale for choosing a private entry over a bare hash
/// is precisely that the content is then not lost: *"a bare hash would
/// commit equally well but leaves the content nowhere."* It was on the
/// author's disk the whole time and nothing read it back, so this form made
/// them retype both — and the salt is unguessable by design, so an author
/// who lost their note held a commitment that could never be revealed,
/// permanently and publicly, on a chain with no delete.
///
/// `get_my_sealed_prediction` now reads it back (`open-work.md` 6.9), and
/// Recover below calls it. The fields stay editable: a commitment made on
/// ANOTHER device is not on this chain, so recovery can legitimately come up
/// empty and typing it in must remain possible.
async function revealPrediction(
  preRegistration: Uint8Array,
  prediction: string,
  salt: string,
  onError: (m: string) => void,
): Promise<void> {
  try {
    const conn = connection;
    if (!conn) return;
    await conn.callZome('reveal_pre_registration', {
      pre_registration: preRegistration,
      prediction,
      salt,
    });
    foresightLoaded = false;
    render();
  } catch (e) {
    onError(String((e as Error)?.message ?? e));
  }
}

function renderForesightTab(): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'foresight-tab';

  const intro = document.createElement('p');
  intro.className = 'tab-intro';
  intro.dataset.testid = 'foresight-intro';
  intro.textContent =
    'Predictions you committed to before the evidence existed, and what became '
    + 'of each one. A revealed prediction means only that you held that content '
    + 'at that time — it never means it was all you held, which is why the '
    + 'commitments that expired unrevealed are shown here too, and why there is '
    + 'no score on this page.';
  wrap.appendChild(intro);

  if (!foresightLoaded) {
    void loadForesight();
    const loading = document.createElement('p');
    loading.className = 'hint';
    loading.textContent = 'Reading your commitments…';
    wrap.appendChild(loading);
    return wrap;
  }

  if (!myForesight) {
    const err = document.createElement('p');
    err.className = 'hint';
    err.dataset.testid = 'foresight-unavailable';
    err.textContent = 'Could not read your commitments.';
    wrap.appendChild(err);
    return wrap;
  }

  const errBox = document.createElement('div');
  errBox.className = 'error-box';
  errBox.dataset.testid = 'foresight-error';
  errBox.hidden = true;
  wrap.appendChild(errBox);
  const fail = (m: string) => { errBox.hidden = false; errBox.textContent = m; };

  const openBtn = document.createElement('button');
  openBtn.className = 'secondary';
  openBtn.dataset.testid = 'foresight-commit-toggle';
  openBtn.textContent = foresightFormOpen ? 'Cancel' : 'Commit a prediction';
  openBtn.onclick = () => { foresightFormOpen = !foresightFormOpen; errBox.hidden = true; render(); };
  wrap.appendChild(openBtn);

  if (foresightFormOpen) {
    const form = document.createElement('div');
    form.className = 'foresight-form';
    form.dataset.testid = 'foresight-form';

    const warn = document.createElement('p');
    warn.className = 'hint';
    warn.dataset.testid = 'foresight-form-warning';
    // SAID BEFORE THE FIELDS, NOT AFTER. The salt is unrecoverable and the
    // deadline is enforced, so a committer who learns this at reveal time
    // learns it too late — the commitment is already unrevealable.
    warn.textContent =
      'Keep the prediction text and the salt. Neither can be recovered from this '
      + 'app or from the DHT, and both are required to reveal. A commitment you '
      + 'cannot reveal before its deadline becomes an expired one, publicly.';
    form.appendChild(warn);

    // WHEN THE QUESTION CAME FROM A CLAIM, SHOW THE CLAIM. A hash the user
    // cannot check is not consent to predict about a thing — so the prefilled
    // path renders the claim's own words and keeps the hash out of sight.
    const qIn = document.createElement('input');
    qIn.dataset.testid = 'foresight-question-input';
    if (foresightPrefill) {
      qIn.value = b64(foresightPrefill.question);
      qIn.hidden = true;
      const chosen = document.createElement('p');
      chosen.className = 'hint';
      chosen.dataset.testid = 'foresight-question-chosen';
      chosen.textContent = `Predicting an answer to: "${foresightPrefill.content}"`;
      form.appendChild(chosen);
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'link-button';
      clear.dataset.testid = 'foresight-question-clear';
      clear.textContent = 'Choose a different question';
      clear.onclick = () => { foresightPrefill = null; render(); };
      form.appendChild(clear);
    } else {
      // THE ESCAPE HATCH, AND IT IS NOT THE ROUTE. Kept because an agent
      // using the SDK or a second device legitimately holds a hash, and
      // removing capability to fix an affordance would be the wrong trade.
      // The sentence says where the usable route is, because for a long time
      // this input WAS the only one and that was 6.8.
      qIn.placeholder = 'Question: the action hash of a claim posed in advance';
      const where = document.createElement('p');
      where.className = 'hint';
      where.dataset.testid = 'foresight-question-hint';
      where.textContent =
        'Easier: open the claim you want to predict about on Browse and use '
        + '"Commit a prediction about this", which fills this in for you. '
        + 'This field is for a hash you already hold.';
      form.appendChild(where);
    }
    const pIn = document.createElement('textarea');
    pIn.placeholder = 'Your prediction — sealed until you reveal it';
    pIn.dataset.testid = 'foresight-prediction-input';
    const sIn = document.createElement('input');
    sIn.placeholder = 'Salt — any phrase; without it the hash is guessable';
    sIn.dataset.testid = 'foresight-salt-input';
    const hIn = document.createElement('input');
    hIn.type = 'number';
    hIn.value = '24';
    hIn.dataset.testid = 'foresight-hours-input';
    const hLabel = document.createElement('label');
    hLabel.textContent = 'Hours until the reveal deadline ';
    hLabel.appendChild(hIn);

    const go = document.createElement('button');
    go.dataset.testid = 'foresight-commit-submit';
    go.textContent = 'Commit';
    go.onclick = () => {
      errBox.hidden = true;
      if (!qIn.value.trim() || !pIn.value.trim() || !sIn.value.trim()) {
        fail('A question, a prediction and a salt are all required.');
        return;
      }
      void commitPrediction(qIn.value.trim(), pIn.value.trim(), sIn.value.trim(), Number(hIn.value) || 24, fail);
    };

    // qIn IS LEFT OUT OF THE DOM ENTIRELY on the prefilled path rather than
    // merely hidden — a field that is not there cannot be revealed by a
    // later CSS change, which is exactly how this went wrong once. Its
    // `.value` is still read by the submit handler above; an input element
    // holds its value whether or not it is attached to a document.
    const fields = foresightPrefill ? [pIn, sIn, hLabel, go] : [qIn, pIn, sIn, hLabel, go];
    for (const el of fields) form.appendChild(el);
    wrap.appendChild(form);
  }

  // ORDER IS DELIBERATE AND EXPIRED IS NOT LAST. Putting the expired group
  // after the revealed one invites a reader to stop at the good news, and a
  // group below the fold is a group that can be missed. Revealed and expired
  // are adjacent and the expired note says what it is for.
  wrap.appendChild(renderForesightList(
    'foresight-revealed',
    'Revealed',
    'Each of these hashed to its commitment and arrived before its deadline, '
    + 'so the content was held at the time it was committed.',
    myForesight.revealed,
    'Nothing revealed yet.',
  ));

  wrap.appendChild(renderForesightList(
    'foresight-expired',
    'Expired unrevealed',
    'These were committed to and never revealed before their deadline. They are '
    + 'the denominator: a record of revealed predictions read without them '
    + 'overstates what was foreseen, which is why this list is not optional and '
    + 'not collapsed.',
    myForesight.expired,
    'Nothing has expired unrevealed.',
  ));

  wrap.appendChild(renderForesightList(
    'foresight-pending',
    'Still open',
    'Committed to, deadline not yet reached. The question and the deadline are '
    + 'public; the content is not.',
    myForesight.pending,
    'No open commitments.',
  ));

  // AND WHETHER THESE LISTS ARE THE DENOMINATOR OR ONLY A FLOOR — open-work
  // 1.24. The expired group above calls itself "the denominator", and that is
  // true only when the count came from the author's CHAIN, which they cannot
  // write a commitment outside of. When it came from their own INDEX it is a
  // floor: nothing in validation requires a commitment to be indexed, so a
  // client can hold one that no reader's count includes.
  //
  // RENDERED FROM THE COORDINATOR'S OWN `note`, not paraphrased, and only in
  // the branch where it changes what the lists mean. On the substrate as
  // measured on 2026-11-02 that is the branch always taken, because
  // `get_agent_activity` cannot read a chain here — so this is not a rare
  // caveat, it is the current state of the feature and the screen says so.
  // THREE SOURCES, AND ONLY ONE OF THEM IS A FLOOR — open-work 1.25.
  //
  // `index-superset` means the chain WAS read and the index held more besides,
  // because the activity authority was behind a recent write. Calling that a
  // floor would be the inverse of this screen's job: the number is longer than
  // the chain's, not shorter, and a reader told to treat it as a floor would
  // discount the one commitment they just made. The caveat still renders —
  // the count is not the authority's own view and the screen never implies it
  // is — but it says what actually happened, and the coordinator's `note`
  // carries the rest verbatim as before.
  if (myForesight.counted_from !== 'chain') {
    const floor = document.createElement('p');
    floor.className = 'hint';
    floor.dataset.testid = 'foresight-floor';
    floor.textContent =
      (myForesight.counted_from === 'index-superset'
        ? 'These lists include a recent commitment the network has not caught up to yet. '
        : 'These lists are a FLOOR rather than a complete count. ')
      + myForesight.note;
    wrap.appendChild(floor);
  }

  // SAID IN WORDS AS WELL AS IN STRUCTURE. The structural guarantee is that
  // expired is always rendered; this sentence is what a reader takes away if
  // they read nothing else, and the ui harness asserts on it.
  const noScore = document.createElement('p');
  noScore.className = 'hint';
  noScore.dataset.testid = 'foresight-no-score';
  noScore.textContent =
    'There is no hit rate on this page, and the protocol does not compute one. '
    + 'Dividing these lists would turn a record into a score, which Invariant 1 '
    + 'refuses — the lists are open so anyone can read them, not so anyone can '
    + 'be ranked by them.';
  wrap.appendChild(noScore);

  return wrap;
}
