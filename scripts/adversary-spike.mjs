#!/usr/bin/env node
// ============================================================================
// scripts/adversary-spike.mjs — open-work 6.10's spike, and NOT 6.10.
//
// WHAT THIS IS. A throwaway probe answering one question: does pointing a
// draft claim at a LOCAL model produce objections worth having? It prints
// them and exits. It is deliberately NOT the feature:
//
//   - It never connects to a conductor. No zome call, no entry, no link,
//     no friction budget, nothing attributed to anybody's key.
//   - It is not wired into any workflow and asserts nothing. It is not a
//     `live-verify` harness and must not be mistaken for one — there is no
//     `check()` here and no injection, because there is no claim to gate.
//   - It decides neither of 6.10's two open questions. Where inference runs
//     and how a machine objection renders next to a real one are decisions,
//     and running this does not take them.
//
// WHY LOCAL IS THE DEFAULT AND REMOTE NEEDS A FLAG. 6.10's third honesty
// problem: a hosted endpoint sends the text of every draft off the machine
// INCLUDING the claims the author decides not to publish — a disclosure the
// protocol cannot govern, because nothing was committed for a rule to bite
// on. So `--allow-remote` is required, never inferred from a key being
// present, and it names what leaves before it sends.
//
// `notes/src/assistant.ts` is the repository's real model call and the
// pattern worth copying if this graduates: the official SDK, tool-use
// structured output, a refusal reported to the asker rather than swallowed,
// and `chooseSuggester` degrading to fixed keyword rules WITH A LINE SAYING
// SO. This file stays zero-dependency raw `fetch` on purpose — it must run
// with bare `node` from a directory that has no `node_modules`, and its
// primary target is an OpenAI-compatible server rather than Anthropic. That
// is a spike's trade, not a recommendation for the feature.
//
// USAGE
//   node scripts/adversary-spike.mjs "claims text here"
//   node scripts/adversary-spike.mjs --file draft.txt
//   cat draft.txt | node scripts/adversary-spike.mjs
//   node scripts/adversary-spike.mjs --model my-ai "text"
//   node scripts/adversary-spike.mjs --allow-remote "text"    # leaves the machine
//
// ENV
//   YOAI_BASE   default http://localhost:11435/v1  (Your Own AI's endpoint)
//   YOAI_KEY    bearer token — only needed for Your Own AI's LAN toggle;
//               localhost on this machine is keyless
//   ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN   for --allow-remote only
// ============================================================================

import { readFileSync } from 'node:fs';

// The protocol's own vocabulary, read off dna/integrity/src/lib.rs:525 and
// :516 rather than invented here. A spike that offers modes the zome does
// not have would teach the author a vocabulary the app will refuse.
const MODES = ['Experiential', 'Methodological', 'Logical', 'Evidential', 'Phenomenological'];
const CONFIDENCE = ['Hypothetical', 'Tentative', 'Moderate', 'High', 'Certain'];

// The SHAPE is constrained at the server, not parsed out of prose. MEASURED
// 2026-10-29: a 3B model asked for one JSON object replied with an array AND
// THEN a separate object, which no lenient parser should be asked to guess at.
// `notes/src/assistant.ts` already reached this conclusion for the hosted API
// by using tool-use structured output; this is the same move for a local one.
//
// `mode` IS DELIBERATELY A FREE STRING RATHER THAN AN ENUM, and that is the
// interesting choice. An enum would make the label well-formed at the sampler
// and thereby HIDE the model picking the wrong one — the author would see five
// valid-looking modes and no sign the vocabulary was misunderstood. Shape
// errors are noise worth removing; mode errors are the finding.
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
          properties: { mode: { type: 'string' }, text: { type: 'string' } },
        },
      },
      evidence_gap: { type: ['string', 'null'] },
      confidence: { type: ['string', 'null'] },
    },
  },
};

const LOCAL_BASE = process.env.YOAI_BASE || 'http://localhost:11435/v1';

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

function usage(message) {
  if (message) console.error(`error: ${message}\n`);
  console.error(`usage: node scripts/adversary-spike.mjs [--file PATH] [--model ID] [--allow-remote] [TEXT]

Reads a draft claim and prints the objections it would attract. Writes
nothing — no conductor, no entry, no network beyond the model endpoint.`);
  process.exit(message ? 2 : 0);
}

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
let file = null, model = null, allowRemote = false;
const words = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--file') file = argv[++i] ?? usage('--file needs a path');
  else if (a === '--model') model = argv[++i] ?? usage('--model needs an id');
  else if (a === '--allow-remote') allowRemote = true;
  else if (a === '-h' || a === '--help') usage();
  else if (a.startsWith('--')) usage(`unknown flag ${a}`);
  else words.push(a);
}

/** Read the draft from --file, the positional words, or stdin. stdin is
 *  last so a terminal with no pipe does not hang silently. */
async function readDraft() {
  if (file) return readFileSync(file, 'utf8');
  if (words.length) return words.join(' ');
  if (process.stdin.isTTY) usage('no draft given — pass text, --file, or pipe stdin');
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

// ------------------------------------------------------------------ callers
/** Your Own AI, or any OpenAI-compatible server. Keyless on localhost; the
 *  bearer is only for its LAN toggle, which serves other devices. */
async function askLocal(draft) {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.YOAI_KEY) headers.Authorization = `Bearer ${process.env.YOAI_KEY}`;

  // The model id is the AI's name slugified, so it is not guessable — ask the
  // server rather than making the author find it in a settings screen.
  if (!model) {
    const list = await fetch(`${LOCAL_BASE}/models`, { headers }).then((r) => r.json());
    const ids = (list.data || []).map((m) => m.id);
    if (!ids.length) throw new Error(`${LOCAL_BASE} answered but offers no models — create an AI in the app first.`);
    model = ids[0];
    console.error(`[spike] no --model given; using "${model}" of ${ids.length} offered (${ids.join(', ')})`);
  }

  const ask = async (withSchema) => {
    const payload = {
      model,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: draft }],
    };
    if (withSchema) payload.response_format = { type: 'json_schema', json_schema: SCHEMA };
    const res = await fetch(`${LOCAL_BASE}/chat/completions`, {
      method: 'POST', headers, body: JSON.stringify(payload),
    });
    return res;
  };

  // Not every OpenAI-compatible server implements json_schema. Ask for it,
  // and fall back ONCE to an unconstrained request rather than failing — the
  // lenient parser is the safety net for that case, and the line says which
  // path produced the answer so a ragged reply is not mistaken for the model.
  let res = await ask(true);
  let constrained = true;
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    console.error(`[spike] server refused json_schema (${res.status}); retrying unconstrained.`);
    console.error(`[spike] ${detail}`);
    res = await ask(false);
    constrained = false;
    if (!res.ok) throw new Error(`${LOCAL_BASE} returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const body = await res.json();
  return {
    text: body.choices?.[0]?.message?.content ?? '',
    via: `${model} (local, ${LOCAL_BASE}${constrained ? '' : ', UNCONSTRAINED'})`,
  };
}

/** The remote fallback. Reached ONLY via --allow-remote, and it says what
 *  leaves before it sends, because the draft may be one the author will
 *  decide not to publish. */
async function askRemote(draft) {
  const key = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  if (!key) throw new Error('--allow-remote needs ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN set.');
  const auth = process.env.ANTHROPIC_API_KEY
    ? { 'x-api-key': process.env.ANTHROPIC_API_KEY }
    : { Authorization: `Bearer ${process.env.ANTHROPIC_AUTH_TOKEN}`, 'anthropic-beta': 'oauth-2025-04-20' };

  console.error(`[spike] SENDING ${draft.length} characters of an UNPUBLISHED draft to api.anthropic.com.`);
  console.error('[spike] This is the flow open-work 6.10 argues against for the shipped feature.');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', ...auth },
    body: JSON.stringify({
      model: 'claude-opus-5',
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: 'user', content: draft }],
    }),
  });
  if (!res.ok) throw new Error(`api.anthropic.com returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  // A policy decline must be reported, not read as an empty answer — the same
  // reason notes/src/assistant.ts reports it to the asker.
  if (body.stop_reason === 'refusal') {
    throw new Error(`the model declined to answer (${body.stop_details?.category ?? 'no category'}). Nothing was published.`);
  }
  const text = (body.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { text, via: `${body.model} (REMOTE — the draft left this machine)` };
}

// ------------------------------------------------------------------- output
/** Tolerant parse: a local model may wrap JSON in a fence or add a sentence.
 *  Returns null rather than throwing, so a readable answer still reaches the
 *  author as raw text instead of becoming a stack trace. */
function parseVerdict(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();

  // Whole-string first: the constrained path lands here and needs nothing else.
  try { return normalise(JSON.parse(candidate)); } catch { /* fall through */ }

  // MEASURED FAILURE THIS EXISTS FOR: an unconstrained 3B model replied with a
  // bare ARRAY of objections and THEN a SEPARATE object carrying evidence_gap
  // and confidence. Spanning first `{` to last `}` swallows both and parses as
  // neither, which is how a readable answer became a stack trace. So scan for
  // every top-level JSON value and merge what is recognisable.
  const found = [];
  for (let i = 0; i < candidate.length; i++) {
    const ch = candidate[i];
    if (ch !== '{' && ch !== '[') continue;
    const close = ch === '{' ? '}' : ']';
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < candidate.length; j++) {
      const c = candidate[j];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === ch) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) {
          try { found.push(JSON.parse(candidate.slice(i, j + 1))); } catch { /* not a value */ }
          i = j;
          break;
        }
      }
    }
  }
  if (!found.length) return null;

  const merged = { objections: [], evidence_gap: null, confidence: null };
  for (const v of found) {
    if (Array.isArray(v)) merged.objections.push(...v.filter((o) => o && o.mode));
    else if (v && typeof v === 'object') {
      if (Array.isArray(v.objections)) merged.objections.push(...v.objections);
      if (v.evidence_gap) merged.evidence_gap = v.evidence_gap;
      if (v.confidence) merged.confidence = v.confidence;
    }
  }
  return merged;
}

/** A bare array is a valid-enough answer: objections and nothing else. */
function normalise(v) {
  if (Array.isArray(v)) return { objections: v, evidence_gap: null, confidence: null };
  return v;
}

function render(verdict, raw, via) {
  console.log(`\n── objections this draft would attract ──  via ${via}\n`);
  if (!verdict) {
    console.log('(the reply was not JSON; printing it as it came)\n');
    console.log(raw.trim());
  } else {
    const objections = Array.isArray(verdict.objections) ? verdict.objections : [];
    if (!objections.length) {
      console.log('No serious objection offered. That is a real answer, not a failure.');
    }
    for (const o of objections) {
      // An invented mode is surfaced rather than silently accepted: the zome
      // would refuse it, and the author should see which half is wrong.
      const known = MODES.includes(o.mode);
      console.log(`  [${o.mode}${known ? '' : ' ← NOT A MODE THIS PROTOCOL HAS'}]`);
      console.log(`  ${String(o.text ?? '').trim()}\n`);
    }
    // OBSERVED ONCE, 2026-10-29: a constrained reply satisfied `required` by
    // filling evidence_gap with the literal string "...". The schema cannot
    // forbid that — it is a well-formed string — so a field whose content is
    // only punctuation is dropped rather than shown. Printing it would present
    // a placeholder to the author as though a model had judged something.
    const gap = String(verdict.evidence_gap ?? '').trim();
    if (gap && /[a-z0-9]/i.test(gap)) console.log(`  evidence that would answer the strongest: ${gap}\n`);
    if (verdict.confidence) {
      const known = CONFIDENCE.includes(verdict.confidence);
      console.log(`  confidence the draft supports as written: ${verdict.confidence}${known ? '' : ' ← not a level this protocol has'}\n`);
    }
  }
  console.log('── nothing was written. No entry, no link, no budget spent. ──\n');
}

// --------------------------------------------------------------------- main
const draft = (await readDraft()).trim();
if (!draft) usage('the draft is empty');

try {
  const result = allowRemote ? await askRemote(draft) : await askLocal(draft);
  render(parseVerdict(result.text), result.text, result.via);
} catch (error) {
  // ECONNREFUSED on the local port is the expected first-run failure and
  // deserves the real instruction rather than a node stack trace.
  const refused = /ECONNREFUSED|fetch failed/i.test(String(error?.message ?? error));
  if (refused && !allowRemote) {
    console.error(`\nNothing is answering at ${LOCAL_BASE}.\n`);
    console.error('Any OpenAI-compatible server on that port will do. Two that work:');
    console.error('');
    console.error('  llama-server --host 127.0.0.1 --port 11435 -m <model.gguf>');
    console.error('    The leanest route, and it is the SAME engine Your Own AI wraps —');
    console.error('    so the objections are the same ones that app would have produced.');
    console.error('');
    console.error('  Your Own AI — https://yourownai.net/  (Flowsta, AGPL)');
    console.error('    Create an AI in it, which mints its own Holochain agent and signs');
    console.error('    each exchange onto that agent\'s chain; then Settings → External');
    console.error('    app access shows the base URL and the per-AI model id.');
    console.error('    VERIFIED 2026-10-29: builds and its backend runs, but its webview');
    console.error('    segfaults on webkit2gtk 2.52.6 (Arch) — the system MiniBrowser');
    console.error('    crashes the same way, so it is the library, not the app.');
    console.error('');
    console.error('Or, to send this draft OFF this machine instead:  --allow-remote\n');
  } else {
    console.error(`\n${error?.message ?? error}\n`);
  }
  process.exit(1);
}
