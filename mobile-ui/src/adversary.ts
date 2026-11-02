// ============================================================================
// The compose-time adversary — open-work 6.10.
//
// WHAT THIS IS FOR. The only cheap moment to improve a permanent entry is
// BEFORE it exists. Once `create_claim` returns, the entry is attributable
// for ever and the protocol has no delete; the objections it will attract are
// free to answer only while the draft is still a draft. This produces those
// objections, on the author's own screen, before they sign.
//
// IT WRITES NOTHING. No entry, no link, no §6 friction budget, no attribution
// to anybody's key. README:1743 records why the swarm's dispositions are
// mechanical rather than generated — "the first permanent writes an autonomous
// population ever makes should have a basis anybody can audit line by line" —
// and that reason is SILENT here, because nothing is written and the author is
// still the one who signs. That asymmetry is why 6.10 came before the
// inhabitant, and why this needs no evaluation harness gating its output.
//
// WHERE INFERENCE RUNS, decided 2026-11-02 after a route was ruled out by
// measurement. A hosted API was refused outright: the text of every draft —
// INCLUDING the claims the author decides not to publish — would leave the
// machine before the entry exists, which is a disclosure channel the protocol
// has never had and structurally cannot govern, and an abandoned draft is the
// one thing a user is entitled to assume stayed local. Routing through the
// person's own Your Own AI was the right SHAPE and lost on availability:
// `X-Your-Own-AI-Memory: off` is honoured in agent mode ONLY, agent mode
// needs an agentic model that fits, and that excludes the hardware the invited
// cohort actually has — so that route is refuse-or-leak on a modest machine.
//
// So the feature CARRIES ITS OWN MODEL, served at a local OpenAI-compatible
// endpoint. The weights are PULLED ON FIRST USE rather than bundled: the
// desktop installers are 113-150MB today and a 3B Q4_K_M is ~2.1GB, so
// bundling would make every one of six platform artifacts about fifteen times
// larger. **Pulling and serving are the desktop app's half and live in
// `StateofIntent/epistemic-resonance-desktop`.** This module's half is to
// talk to whatever is listening, and to say so honestly when nothing is.
//
// THAT A WEBVIEW MAY CALL A LOCALHOST SERVICE AT ALL IS NOT ASSUMED — it is
// how `notes.ts` already reaches `http://localhost:8790`, in a feature that
// ships, so the pattern here is copied rather than invented.
// ============================================================================

/** The five modes, for the prompt only. NEVER an enum in the schema — see
 * `SCHEMA` below, where the reason is load-bearing. */
const MODES = ['Experiential', 'Methodological', 'Logical', 'Evidential', 'Phenomenological'];
const CONFIDENCE = ['Hypothetical', 'Tentative', 'Moderate', 'High', 'Certain'];

const ORIGIN_KEY = 'epistemic-mobile-ui:adversary-origin';

/** Where the carried model is served. Localhost by construction: a remote
 * origin here would be the disclosure channel this feature exists to avoid,
 * and `isLocalOrigin` below is what refuses one. */
export const DEFAULT_ADVERSARY_ORIGIN = 'http://localhost:11434/v1';

export function loadAdversaryOrigin(): string {
  try {
    return localStorage.getItem(ORIGIN_KEY) ?? DEFAULT_ADVERSARY_ORIGIN;
  } catch {
    return DEFAULT_ADVERSARY_ORIGIN;
  }
}

export function saveAdversaryOrigin(origin: string): void {
  try { localStorage.setItem(ORIGIN_KEY, origin); } catch { /* private mode */ }
}

/** REFUSES A NON-LOCAL ORIGIN, and this is a rule rather than a default.
 *
 * §(3) of open-work 6.10 is the whole argument for this feature's shape: a
 * draft that leaves the machine is a disclosure the protocol cannot govern,
 * because nothing was committed for any rule to bite on. A configurable
 * origin that accepted `https://some-api.example` would hand that property
 * away through a settings box, so the check is here and not in the UI — a
 * screen can be bypassed, a refusal in the client cannot. */
export function isLocalOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
      || hostname === '[::1]';
  } catch {
    return false;
  }
}

/** One objection, as the model gave it.
 *
 * `mode` IS A FREE STRING AND MUST STAY ONE. Constraining it to the five is
 * trivially available at the sampler and was deliberately not done: four runs
 * across two models and two serving paths established that small models read
 * the five modes as TOPIC categories rather than as the kind of objection
 * being made — `Experiential` attached to demands for evidence,
 * `Phenomenological` to conceptual objections — while the three modes that
 * describe an argument's STRUCTURE survive. An enum forces a well-formed
 * label and thereby HIDES that, leaving the author five plausible-looking
 * modes and no sign the vocabulary was missed. Shape errors are noise worth
 * removing; mode errors are the finding. */
export interface Objection {
  mode: string;
  text: string;
  /** False when `mode` is not one of the protocol's five. Surfaced rather
   * than corrected: the screen says NOT A MODE THIS PROTOCOL HAS. */
  modeIsReal: boolean;
}

export interface AdversaryVerdict {
  objections: Objection[];
  /** What would have to be attached for the strongest objection to lose its
   * force. Null when the model named none — or when it named a placeholder;
   * see `meaningful`. */
  evidenceGap: string | null;
  /** The strongest confidence the draft honestly supports, as the model reads
   * it. ADVISORY ONLY and never applied: the author sets their own. */
  confidence: string | null;
  /** True when the server could not honour `response_format` and the reply
   * was parsed leniently instead. The screen says so, because an
   * unconstrained reply is a weaker artifact and the reader should know. */
  unconstrained: boolean;
}

export class AdversaryError extends Error {
  constructor(readonly kind: 'unreachable' | 'refused' | 'unusable' | 'not-local', message: string) {
    super(message);
    this.name = 'AdversaryError';
  }
}

const SCHEMA = {
  name: 'adversary_verdict',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['objections', 'evidence_gap', 'confidence'],
    properties: {
      objections: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['mode', 'text'],
          // `mode` is `string`, NOT an enum. See `Objection`.
          properties: { mode: { type: 'string' }, text: { type: 'string' } },
        },
      },
      evidence_gap: { type: ['string', 'null'] },
      confidence: { type: ['string', 'null'] },
    },
  },
};

const SYSTEM = `You are reading a DRAFT claim that has not been published yet.

Once published it is PERMANENT: the protocol has no delete, and the entry is
attributable to its author for ever. Your job is to produce the objections it
will attract, while they are still free to answer.

For each objection give:
  mode   — one of ${MODES.join(', ')}. Pick the one that honestly describes
           the KIND of objection. Do not default to Logical because it sounds
           safest; the mode distribution is a published statistic.
  text   — the objection, addressed to the author, as a question or a
           specific challenge. Name what is missing, not that something is.

Then judge the draft overall:
  evidence_gap — what observation or source would have to be attached for the
                 strongest objection to lose its force. Null if none would.
  confidence   — the strongest of ${CONFIDENCE.join(', ')} the draft honestly
                 supports as written, or null if you cannot tell.

HAVING NOTHING SERIOUS TO SAY IS A REAL ANSWER. Return an empty objections
list rather than padding. A draft that survives is information.

Reply with JSON only, no prose and no code fence:
{"objections":[{"mode":"...","text":"..."}],"evidence_gap":"..."|null,"confidence":"..."|null}`;

/** A field whose content carries no alphanumeric character is a placeholder,
 * not a judgement.
 *
 * A SCHEMA CANNOT FORBID A WELL-FORMED STRING, which is how one constrained
 * reply satisfied `required` by setting `evidence_gap` to the literal `"..."`.
 * Rendering that would present a placeholder as a model's finding, so it is
 * dropped here rather than at the screen — the screen should not have to know
 * about this. */
function meaningful(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return /[a-z0-9]/i.test(value) ? value.trim() : null;
}

/** EVERY top-level JSON value in the text, not the span from first `{` to
 * last `}`.
 *
 * Asked for one object, a 3B model replied with a bare ARRAY of objections
 * and THEN a separate object carrying `evidence_gap` and `confidence`.
 * Spanning first-brace to last-brace swallows both and parses as neither, so
 * a perfectly readable answer rendered as raw text. This scans instead, and
 * the caller merges whatever it finds. */
function topLevelValues(text: string): unknown[] {
  const out: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{' || ch === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0 && start >= 0) {
        try { out.push(JSON.parse(text.slice(start, i + 1))); } catch { /* not a value */ }
        start = -1;
      }
      if (depth < 0) depth = 0;
    }
  }
  return out;
}

/** Merge whatever shapes came back into one verdict. Tolerates the bare-array
 * reply and the split reply described above. */
function assemble(values: unknown[], unconstrained: boolean): AdversaryVerdict {
  const objections: Objection[] = [];
  let evidenceGap: string | null = null;
  let confidence: string | null = null;

  const takeObjections = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const raw of arr) {
      if (!raw || typeof raw !== 'object') continue;
      const o = raw as Record<string, unknown>;
      const text = meaningful(o.text);
      if (text === null) continue;
      const mode = typeof o.mode === 'string' ? o.mode.trim() : '';
      objections.push({ mode, text, modeIsReal: MODES.includes(mode) });
    }
  };

  for (const value of values) {
    if (Array.isArray(value)) { takeObjections(value); continue; }
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    takeObjections(v.objections);
    evidenceGap = evidenceGap ?? meaningful(v.evidence_gap);
    confidence = confidence ?? meaningful(v.confidence);
  }
  return { objections, evidenceGap, confidence, unconstrained };
}

/** Ask the carried model what this draft will be asked.
 *
 * Throws `AdversaryError` rather than returning a failure shape, because the
 * four kinds are told apart on screen and conflating them is how "nothing was
 * downloaded yet" becomes "the model had nothing to say". */
export async function askAdversary(input: {
  draft: string;
  domain?: string;
  origin?: string;
  model?: string;
  signal?: AbortSignal;
}): Promise<AdversaryVerdict> {
  const origin = (input.origin ?? loadAdversaryOrigin()).replace(/\/$/, '');
  if (!isLocalOrigin(origin)) {
    throw new AdversaryError('not-local',
      `${origin} is not on this machine. A draft sent anywhere else is a disclosure `
      + 'this protocol cannot govern — nothing has been committed for any rule to bite on.');
  }

  const user = input.domain
    ? `Domain: ${input.domain}\n\nDraft claim:\n${input.draft}`
    : `Draft claim:\n${input.draft}`;

  const post = async (withSchema: boolean): Promise<Response> => {
    const payload: Record<string, unknown> = {
      model: input.model ?? 'local',
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
      temperature: 0.2,
    };
    if (withSchema) payload.response_format = { type: 'json_schema', json_schema: SCHEMA };
    return fetch(`${origin}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: input.signal,
    });
  };

  // CONSTRAINED FIRST, ALWAYS. The shape must be constrained at the SERVER
  // where the server can do it; the lenient parser below is the safety net
  // for servers that cannot, not the primary path.
  let response: Response;
  let unconstrained = false;
  try {
    response = await post(true);
    if (!response.ok) {
      // Not every OpenAI-compatible server implements json_schema. One
      // unconstrained retry, and the verdict carries the fact.
      response = await post(false);
      unconstrained = true;
    }
  } catch (error) {
    if (input.signal?.aborted) throw new AdversaryError('refused', 'cancelled');
    throw new AdversaryError('unreachable',
      `no model is answering at ${origin}. If this is the first use, the weights may `
      + `still be downloading. (${error})`);
  }

  if (!response.ok) {
    throw new AdversaryError('refused',
      `the model endpoint refused the request (${response.status}).`);
  }

  let body: any;
  try { body = await response.json(); } catch {
    throw new AdversaryError('unusable', 'the endpoint replied with something that is not JSON.');
  }
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    throw new AdversaryError('unusable', 'the model returned an empty reply.');
  }
  const verdict = assemble(topLevelValues(content), unconstrained);
  if (verdict.objections.length === 0 && verdict.evidenceGap === null && !content.includes('[]')) {
    // An unparseable reply and a genuine "nothing to say" are different
    // answers, and only one of them is information. `[]` in the raw text is
    // the cheap discriminator: a model that meant an empty list wrote one.
    throw new AdversaryError('unusable',
      'the model replied, but not in a shape this client could read.');
  }
  return verdict;
}
