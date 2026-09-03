// ============================================================================
// Progressive disclosure.
//
// This protocol asks a newcomer to hold a lot at once: claims, typed
// critiques and their five non-fungible modes, membranes founded on
// constitutions, required promises, conductance, discourse health,
// antibody patterns, retraction, and a friction budget. Presented
// simultaneously — which is what this UI did before this module — that
// reads as noise, and the concepts that make the protocol worth using
// are the ones most easily lost in it.
//
// The model borrowed from games is not a tutorial carousel. It is:
// introduce a mechanic at the moment it is first encountered, explain it
// where it appears rather than in a manual, and always leave one obvious
// next action. Nothing here gates a feature behind "competence" — every
// control remains reachable from the first second. What is staged is
// explanation and routine detail, not capability.
//
// THE LINE THIS MUST NOT CROSS, from README.md §4.4:
//
//   Chrome may adapt per viewer. The artifact under evaluation must not.
//
// Onboarding is chrome, so staging it is explicitly sanctioned. But
// epistemic state attached to a claim someone is evaluating — antibody
// flags, retractions, critique content and modes, conductance readings —
// is NOT chrome, and is never staged, collapsed or deferred by this
// module. A newcomer who cannot see a flag is evaluating a different
// artifact than an expert, and the cross-checking §4.3 describes
// silently degrades. The corollary rule, applied below: progressive
// disclosure may collapse ROUTINE DETAIL, never an ACTIVE SIGNAL. A
// domain's mode distribution can wait behind a toggle; the protocol's
// own drift warning cannot.
//
// State lives in localStorage, so it is per-viewer and per-browser, and
// never touches the DHT. Losing it means a returning user sees the
// introductory notes again — mildly redundant, never broken — which is
// why every access is wrapped the same way loadConfig already wraps its
// own (private browsing and blocked site-data both throw here).
// ============================================================================

const STORAGE_KEY = 'epistemic-mobile-ui:onboarding';

/** Concepts that get a first-encounter note. Each is shown once, where
 * the thing itself appears, and then dismissed for good. */
export type Concept =
  | 'local-conductor'
  | 'typed-critiques'
  | 'friction-budget'
  | 'required-promises'
  | 'conductance'
  | 'discourse-health';

/** Things the user has actually done. Used only to choose which single
 * next step to suggest — never to unlock or withhold a capability. */
export type Milestone =
  | 'connected'
  | 'browsed-domain'
  | 'read-critiques'
  | 'wrote-critique'
  | 'wrote-claim'
  | 'viewed-domains'
  | 'viewed-taxonomy';

interface OnboardingState {
  seen: Concept[];
  done: Milestone[];
  /** Set once the user first expands a domain's detail. They have shown
   * they want it, so it defaults open from then on — disclosure that
   * runs one way and does not keep re-hiding what someone asked for. */
  expandDomainDetail: boolean;
}

const EMPTY: OnboardingState = { seen: [], done: [], expandDomainDetail: false };

function read(): OnboardingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    return {
      seen: Array.isArray(parsed.seen) ? parsed.seen : [],
      done: Array.isArray(parsed.done) ? parsed.done : [],
      expandDomainDetail: parsed.expandDomainDetail === true,
    };
  } catch {
    return { ...EMPTY };
  }
}

function write(state: OnboardingState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Same reasoning as saveConfig: losing this costs a repeated note,
    // not correctness, and is never worth breaking a render over.
  }
}

let state = read();

export function hasSeen(concept: Concept): boolean {
  return state.seen.includes(concept);
}

export function markSeen(concept: Concept): void {
  if (state.seen.includes(concept)) return;
  state = { ...state, seen: [...state.seen, concept] };
  write(state);
}

export function hasDone(milestone: Milestone): boolean {
  return state.done.includes(milestone);
}

export function markDone(milestone: Milestone): void {
  if (state.done.includes(milestone)) return;
  state = { ...state, done: [...state.done, milestone] };
  write(state);
}

export function domainDetailExpanded(): boolean {
  return state.expandDomainDetail;
}

export function setDomainDetailExpanded(expanded: boolean): void {
  state = { ...state, expandDomainDetail: expanded };
  write(state);
}

/** Forget everything — exposed so the live-verification script can drive
 * a genuine first-run, and so a user can replay the introduction. */
export function resetOnboarding(): void {
  state = { ...EMPTY };
  write(state);
}

/** The text shown when a concept is first encountered. Written to be
 * read once, at the moment the thing appears, and never again. Each
 * explains WHY the protocol works this way, since the mechanics are
 * visible on screen and the reasons are not. */
export const CONCEPT_NOTES: Record<Concept, string> = {
  'local-conductor':
    'You are connected to a conductor running on your own machine. There is no ' +
    'server holding this — your claims live on your own source chain, and you ' +
    'reach others as peers rather than through anyone in the middle.',
  'typed-critiques':
    'Critiques are typed, never a single up or down. The five modes are different ' +
    'kinds of knowing — an experiential report and a logical objection are not ' +
    'interchangeable, so this protocol refuses to flatten them into one score. ' +
    'Choose the mode that matches what you actually did.',
  'friction-budget':
    'Creating connections is rate-limited per hour, and this bar shows what you ' +
    'have left. It is deliberate friction rather than a penalty: it makes ' +
    'mass-produced critique slow without making any single critique cost ' +
    'anything. Nothing buys past it.',
  'required-promises':
    'A domain states what it demands of anyone working in it rather than charging ' +
    'to enter. These promises are the entry condition — accountability instead of ' +
    'a fee.',
  'conductance':
    'This is how strongly a critique still connects to what it critiques — it ' +
    'decays over time and strengthens when others reinforce it. It scores the ' +
    'connection, never the person, and it never reorders what you see.',
  'discourse-health':
    'A reading of the domain as a whole: how much of its discourse is embodied ' +
    'report versus abstract argument. It describes the domain, never an agent, ' +
    'and nothing acts on it — it is here for you to judge.',
};

/** The single next thing worth doing, or null once the user has done
 * enough that suggesting more would be nagging. Deliberately one item:
 * a list of suggestions is a backlog, and a backlog is not onboarding. */
export function nextStep(): { text: string; testId: string } | null {
  if (!hasDone('browsed-domain')) {
    return {
      text: 'Enter a domain and load its claims to begin. Try the one your practice lives in.',
      testId: 'next-browse',
    };
  }
  if (!hasDone('read-critiques')) {
    return {
      text: 'Open a claim to read its critiques — a claim\'s standing here comes from how others have engaged with it, not from the claim alone.',
      testId: 'next-read',
    };
  }
  if (!hasDone('wrote-critique') && !hasDone('wrote-claim')) {
    return {
      text: 'Add a critique, or publish a claim of your own. Both are how you enter the graph.',
      testId: 'next-contribute',
    };
  }
  if (!hasDone('viewed-domains')) {
    return {
      text: 'Look at Domains to see what a domain demands of its participants, and how its discourse is doing.',
      testId: 'next-domains',
    };
  }
  return null;
}
