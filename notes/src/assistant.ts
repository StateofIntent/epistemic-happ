// ============================================================================
// notes/src/assistant.ts — the AI that lives in the room.
//
// WHAT THIS REPLACES. The design note's claim is that an assistant sitting
// inside a notes space, next to the writing actually happening, does the job
// documentation cannot: it can explain the difference between a note and a
// Claim *at the moment someone is trying to make one*, rather than in an
// onboarding flow they clicked through three days ago. It is allowed to be
// wrong, because every answer is a suggestion beside an accept and a reject.
//
// IT IS A MEMBER, AND JOINS LIKE ONE. This process follows an invite link,
// registers with `kind: "ai"` and a list of what it offers, and then polls the
// same routes any member could. It has no privileged endpoint, cannot write to
// the DHT, and cannot apply its own suggestion to anything. The notes service
// holds no model credentials — they live here, in a process someone chose to
// run.
//
// TWO SUGGESTERS, AND THE FALLBACK IS NOT A STUB. With ANTHROPIC_API_KEY set
// it asks Claude. Without one it answers from a fixed keyword table, and says
// so in the `source` field that the asker's screen renders. That matters more
// than it looks: an assistant that goes silent without a key makes the whole
// feature undemonstrable and unverifiable, and one that pretends a keyword
// match is a considered judgement is worse than useless. The rules suggester
// therefore declines to invent wording at all — it will say which mode the
// words look like and why, and nothing else, because a keyword table has no
// business drafting someone's published claim.
// ============================================================================

import type { Assist, AssistSuggestion } from './types.js';

/** What a suggester produces: the structured offer plus prose, and an honest
 * statement of what produced it. */
export interface Suggested {
  answer: string;
  suggestion: AssistSuggestion;
  source: string;
}

export interface Suggester {
  readonly name: string;
  suggest(assist: Assist): Promise<Suggested>;
}

/** The protocol's five critique modes, restated here as the assistant's own
 * vocabulary rather than imported from the DNA — this package deliberately
 * knows nothing about Holochain, and the coupling that matters is checked
 * where it is used: the client offers the suggestion, and the protocol's own
 * validation refuses a bad one at publish time. */
export const CRITIQUE_MODES = [
  'Experiential', 'Methodological', 'Logical', 'Evidential', 'Phenomenological',
] as const;

export const MODE_MEANINGS: Record<string, string> = {
  Experiential: 'I tried this myself and something different happened.',
  Methodological: 'The way this was arrived at has a problem.',
  Logical: 'The reasoning does not follow, even if the facts are right.',
  Evidential: 'The evidence cited does not support this, or better evidence exists.',
  Phenomenological: 'This does not match how the thing is actually experienced.',
};

// --- The fixed-rules suggester ---------------------------------------------

/** Markers that a passage is disagreeing with something rather than asserting
 * something. Deliberately conservative: a false "this is a critique" sends
 * someone looking for a target claim that does not exist, which is a worse
 * failure than defaulting to a Claim. */
const DISAGREEMENT_MARKERS = [
  'but ', "doesn't", 'does not', "didn't", 'did not', 'wrong', 'contradict',
  'actually', 'fails to', 'not true', 'disagree', 'however', "isn't", 'is not',
];

const MODE_MARKERS: Array<[string, string[]]> = [
  ['Experiential', ['i tried', 'i did', 'in my experience', 'my own', 'in practice', 'when i', 'i ran', 'i saw']],
  ['Methodological', ['sample', 'method', 'protocol', 'controlled', 'confound', 'study design', 'measured', 'blinded']],
  ['Evidential', ['evidence', 'citation', 'cited', 'source', 'the data', 'paper', 'no proof', 'study shows']],
  ['Logical', ['follow', 'circular', 'assumes', 'assumption', 'therefore', 'inconsistent', 'contradiction']],
  ['Phenomenological', ['feels', 'felt like', 'sensation', 'experience of', 'perceive', 'seems to me']],
];

export const rulesSuggester: Suggester = {
  name: 'fixed rules',
  async suggest(assist: Assist): Promise<Suggested> {
    const text = assist.prompt.toLowerCase();
    const disagreeing = DISAGREEMENT_MARKERS.some((marker) => text.includes(marker));
    const hit = MODE_MARKERS.find(([, markers]) => markers.some((marker) => text.includes(marker)));
    const mode = hit?.[0] ?? null;

    const parts: string[] = [];
    parts.push(disagreeing
      ? 'This reads like a disagreement with something, so a Critique rather than a Claim.'
      : 'This reads like an assertion, so a Claim rather than a Critique.');
    if (mode) {
      parts.push(`The wording matches ${mode} — ${MODE_MEANINGS[mode]}`);
    } else {
      parts.push(
        'Nothing in the wording points at one of the five critique modes, so this is a '
        + 'judgement to make yourself.');
    }
    parts.push(
      'This came from a fixed keyword table, not from a model — it can only tell you which '
      + 'words are present. Treat it as a prompt to think, not as an answer.');

    return {
      answer: parts.join(' '),
      suggestion: {
        critiqueMode: disagreeing ? mode : null,
        entryKind: disagreeing ? 'critique' : 'claim',
        // A keyword table has no business drafting someone's published
        // wording, and offering one would invite accepting it unread.
        wording: null,
        reason: mode
          ? `Matched on wording associated with ${mode}.`
          : 'No mode-specific wording found.',
      },
      source: 'fixed keyword rules (no model — set ANTHROPIC_API_KEY for a real suggestion)',
    };
  },
};

// --- The Claude suggester ---------------------------------------------------

const MODEL = 'claude-opus-5';

const SYSTEM = `You are an assistant living inside a shared notes space that sits above the
Epistemic Resonance Protocol — a Holochain protocol where published entries are permanent,
typed and cryptographically authored.

Someone is deciding whether to publish a rough note as a protocol entry, and if so, as what.
Your job is to help them decide, not to decide for them. Everything you say is shown beside
an accept and a reject button, and nothing you suggest is published by anything other than a
person pressing publish.

Two things the protocol requires that a newcomer will not know:

- A Claim asserts something. A Critique disagrees with an existing Claim and must point at one.
- Every Critique declares exactly one of five fixed modes, and free text is refused:
  Experiential (I tried this myself and something different happened),
  Methodological (the way this was arrived at has a problem),
  Logical (the reasoning does not follow, even if the facts are right),
  Evidential (the evidence cited does not support this, or better evidence exists),
  Phenomenological (this does not match how the thing is actually experienced).

Be brief and concrete. Say what you are unsure about rather than picking confidently. If the
note is too vague to publish as anything yet, say that — "not ready" is a useful answer here,
and this layer exists precisely so that half-formed thinking has somewhere to stay.

Never suggest wording that asserts more than the note does. The person is about to sign this
with their own key, permanently.`;

const SUGGEST_TOOL = {
  name: 'suggest_promotion',
  description:
    'Offer a suggestion about how a rough note might be published to the protocol. '
    + 'Every field is optional and null means "I do not have a view on this".',
  strict: true as const,
  input_schema: {
    type: 'object' as const,
    properties: {
      answer: {
        type: 'string',
        description: 'A short explanation for the person, in plain language. Two or three sentences.',
      },
      entry_kind: {
        type: ['string', 'null'],
        enum: ['claim', 'critique', null],
        description: 'Whether this reads as an assertion or as a disagreement.',
      },
      critique_mode: {
        type: ['string', 'null'],
        enum: [...CRITIQUE_MODES, null],
        description: 'Which of the five modes fits, if it is a critique.',
      },
      wording: {
        type: ['string', 'null'],
        description:
          'A stronger wording of what the note already says, for the person to edit or '
          + 'discard. Null if the note is too vague to reword without adding claims.',
      },
      reason: {
        type: ['string', 'null'],
        description: 'One sentence on why, so the person can disagree with the reasoning.',
      },
    },
    required: ['answer', 'entry_kind', 'critique_mode', 'wording', 'reason'],
    additionalProperties: false,
  },
};

/** Asks Claude. Constructed only when a credential is actually present — see
 * `chooseSuggester`. The SDK is imported dynamically so the notes SERVER, which
 * shares this package, never loads it. */
export async function claudeSuggester(): Promise<Suggester> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();

  return {
    name: MODEL,
    async suggest(assist: Assist): Promise<Suggested> {
      const asked = assist.kind === 'critique-mode'
        ? 'Which critique mode does this fit, if any?'
        : assist.kind === 'draft'
          ? 'How might this be worded if it were published?'
          : 'What should I know before publishing this?';

      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        // A policy decline here would leave a member staring at an unanswered
        // question with no explanation, so the request carries a fallback.
        betas: ['server-side-fallback-2026-06-01'],
        fallbacks: [{ model: 'claude-opus-4-8' }],
        system: SYSTEM,
        tools: [SUGGEST_TOOL],
        messages: [{
          role: 'user',
          content: `A note from the space:\n\n${assist.prompt}\n\n${asked}`,
        }],
      });

      if (response.stop_reason === 'refusal') {
        // Reported as an answer rather than swallowed: the asker is owed an
        // explanation, and silence would read as the assistant being broken.
        return {
          answer: 'I was not able to answer that one. Nothing was published, and the note is unchanged.',
          suggestion: { critiqueMode: null, entryKind: null, wording: null, reason: null },
          source: `${MODEL} (declined to answer)`,
        };
      }

      for (const block of response.content) {
        if (block.type !== 'tool_use' || block.name !== 'suggest_promotion') continue;
        // Parsed, never string-matched: escaping in tool inputs varies.
        const input = block.input as Record<string, unknown>;
        return {
          answer: typeof input.answer === 'string' ? input.answer : 'No explanation was offered.',
          suggestion: {
            critiqueMode: typeof input.critique_mode === 'string' ? input.critique_mode : null,
            entryKind: input.entry_kind === 'claim' || input.entry_kind === 'critique'
              ? input.entry_kind
              : null,
            wording: typeof input.wording === 'string' ? input.wording : null,
            reason: typeof input.reason === 'string' ? input.reason : null,
          },
          source: MODEL,
        };
      }

      // No tool call. Fall back to whatever prose came back rather than
      // failing: a plain answer is still an answer.
      const text = response.content
        .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();
      return {
        answer: text || 'I do not have a useful suggestion for this one.',
        suggestion: { critiqueMode: null, entryKind: null, wording: null, reason: null },
        source: MODEL,
      };
    },
  };
}

/** Picks a suggester from what is actually available, and says which out loud.
 *
 * An absent credential is a normal state, not an error: the rules suggester is
 * a real answer that labels itself, so the room still has a working assistant
 * and this whole feature stays demonstrable and verifiable without a key. */
export async function chooseSuggester(log: (message: string) => void): Promise<Suggester> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    log('[assistant] no ANTHROPIC_API_KEY — answering from fixed keyword rules, and saying so.');
    return rulesSuggester;
  }
  try {
    const suggester = await claudeSuggester();
    log(`[assistant] answering with ${suggester.name}.`);
    return suggester;
  } catch (error) {
    log(`[assistant] could not load the Anthropic SDK (${error}); falling back to fixed rules.`);
    return rulesSuggester;
  }
}
