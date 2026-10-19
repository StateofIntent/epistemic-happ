#!/usr/bin/env node
// ============================================================================
// scripts/validation-corpus/enumerate.mjs — EVERY REJECTION THE INTEGRITY ZOME
// CAN RETURN, INVENTORIED AND CLASSIFIED BY WHETHER A CLIENT CAN REACH IT.
//
// WHY THIS EXISTS. `dna/integrity/src/lib.rs` has ~195 sites that return
// ValidateCallbackResult::Invalid. SECURITY.md records that 72 of the harness's
// 73 checks have never been shown capable of failing, and no harness in
// scripts/live-verify asserts a single one of these messages. So the validation
// layer is the largest body of untested behaviour in the repository, and the
// first thing needed is not a test — it is an honest list of what COULD be
// tested, because a large share of these sites cannot be reached by any client
// at all.
//
// THE THREE CLASSES, AND WHY THE DISTINCTION IS THE POINT.
//
//   honest     Reachable through the published SDK's typed methods or the MCP
//              server's tools, by a client doing nothing special. Empty strings
//              are the main family: the MCP tool schemas are bare
//              `type: 'string'` with no minLength, so "" reaches the zome.
//
//   crafted    Reachable only by calling the coordinator directly with a
//              payload the typed methods never produce. The author-identity
//              rules are all here: agent-sdk sets `author: this.agentPubKey`
//              (index.ts:308) and `timestamp: nowMicros()` (:309), so an honest
//              client cannot violate them — but create_claim takes the whole
//              Claim struct, and EpistemicAgent.call() is public (index.ts:195),
//              so a crafted payload can.
//
//   needs_extern
//              An ENTRY rule whose field the coordinator derives rather than
//              accepting. `crafted` assumed a hand-built payload can reach any
//              entry validator; that holds only where an extern takes the whole
//              entry struct. Five entry types instead take a params struct and
//              BUILD the entry — so `agent`, `checksum`, `period_boundaries`
//              and friends are the host's, not the caller's, and no payload
//              reaches the rules about them. Same cost as `needs_prober`: a new
//              extern plus a DNA rebuild.
//
//   remote     Not reachable from any local call. These fire on ops that arrive
//              from a peer during gossip — link validation, agent activity, and
//              the update/delete refusals that need an action type the
//              coordinator never emits. Testing these needs a second conductor
//              authoring the bad op, not a crafted payload.
//
// A site classified `remote` is NOT a gap in this corpus. Calling it one would
// be the same mistake as a green tick that cannot go red: it would claim
// coverage of something no test here can exercise. The report prints the three
// counts separately for exactly that reason.
//
// Output: corpus/inventory.json — one record per site, with the enclosing
// validator, the guard condition, the message, and the class. This file is
// INPUT to the payload corpus, not the corpus itself: it says what exists,
// not what to send.
// ============================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const SRC = resolve(REPO, 'dna/integrity/src/lib.rs');
const OUT = resolve(HERE, 'corpus/inventory.json');

const src = readFileSync(SRC, 'utf8');
const lines = src.split('\n');

// --- Locate every function, so each Invalid can name its enclosing validator.
// Brace counting rather than regex-per-function: the file has nested blocks and
// match arms, and a function's end is the only reliable boundary.
const fns = [];
{
  let cur = null, depth = 0, opened = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (cur === null) {
      const m = /^\s*(?:pub\s+)?fn\s+([a-z_0-9]+)/.exec(line);
      if (m) { cur = { name: m[1], start: i + 1 }; depth = 0; opened = false; }
    }
    if (cur !== null) {
      for (const ch of line) {
        if (ch === '{') { depth++; opened = true; }
        else if (ch === '}') depth--;
      }
      if (opened && depth <= 0) { cur.end = i + 1; fns.push(cur); cur = null; }
    }
  }
}

const fnAt = (ln) => {
  // innermost function containing this line
  let best = null;
  for (const f of fns) {
    if (f.start <= ln && ln <= f.end) {
      if (!best || f.start > best.start) best = f;
    }
  }
  return best ? best.name : '(top level)';
};

// --- Every Invalid site, with its message.
const sites = [];
{
  // Three shapes in this file, all of which must be counted:
  //   Invalid("msg".into())            — literal, same line or wrapped
  //   Invalid(format!("msg", ..))      — interpolated
  //   Invalid(reason)                  — a pass-through of another validator's
  //                                      result, carrying no message of its own
  // Rust's `\` line-continuation inside a literal eats the newline and the
  // next line's indent, so the source text is rejoined the same way before the
  // message is recorded — otherwise every wrapped message would carry the
  // file's indentation inside it.
  const re = /ValidateCallbackResult::Invalid\(\s*(?:format!\(\s*)?(?:"((?:[^"\\]|\\.)*)"|([a-z_][a-z_0-9]*)\s*\))/gs;
  let m;
  while ((m = re.exec(src)) !== null) {
    const line = src.slice(0, m.index).split('\n').length;
    if (/^\s*\/\//.test(lines[line - 1] ?? '')) continue;   // a doc comment, not a site
    const literal = m[1];
    const passthrough = m[2];
    sites.push({
      line,
      validator: fnAt(line),
      message: literal === undefined
        ? null
        : literal.replace(/\\\n\s*/g, '').replace(/\\"/g, '"').replace(/\\n/g, ' ').trim(),
      passthrough: passthrough ?? null,
      formatted: /format!/.test(m[0]),
    });
  }
}

// --- The guard condition: walk back from the site to the nearest control-flow
// line at or above it, skipping comments and blank lines.
function guardFor(siteLine) {
  for (let i = siteLine - 2; i >= Math.max(0, siteLine - 12); i--) {
    const t = lines[i].trim();
    if (!t || t.startsWith('//')) continue;
    if (/^(if|for|while|match|\}\s*else)/.test(t) || /=>\s*$/.test(t) || /=>\s*\{?$/.test(t)) {
      return t.replace(/\s*\{$/, '');
    }
    if (/^(if|for)\b/.test(t)) return t.replace(/\s*\{$/, '');
  }
  return null;
}

// --- The failure branches of `must_get_*` calls, as line ranges.
//
// WHY THIS IS NOT A REGEX ON THE GUARD. The deferral class used to be decided
// by `guardFor(site)` matching /must_get_(entry|action)/, which found exactly
// ONE of the four shapes this zome writes and silently mislabelled the rest:
//
//   if must_get_entry(h).is_err() { Invalid(..) }        <- found
//   let Ok(v) = must_get_entry(h) else { Invalid(..) }   <- guard came back null
//   match must_get_entry(h) { Err(_) => Invalid(..) }    <- guard came back "Err(_) =>"
//   must_get_valid_record(h)?                            <- no Invalid of its own
//
// Measured consequence, 2026-10-17, against a real conductor: `Retraction
// target claim not found.` and `FederationRecord local_membrane not found.`
// were classed `honest` — "reachable by a client doing nothing special" — and
// both are in fact retryable stalls. A `create_retraction` with a well-formed
// but nonexistent `target_claim` comes back
// `DepMissingFromDht([AnyDhtHash(..)])`, never the rule's own message. A corpus
// case asserting either message would have failed forever, which is precisely
// the trap README.md documents at length for the nine already known.
//
// AND PROXIMITY IS NOT ENOUGH EITHER, which is why this does brace matching.
// `Retraction target must be a Claim.` sits six lines below the same
// `must_get_entry` and is NOT a deferral: it is reached when the entry resolves
// and is the wrong type. Any rule keyed on "is there a must_get above me"
// mislabels it. What decides the class is whether the site sits INSIDE the
// failure branch of the call, so that is what is computed.
function matchingBrace(openLine, openIdx) {
  let depth = 0;
  for (let i = openLine; i < lines.length; i++) {
    const text = i === openLine ? lines[i].slice(openIdx) : lines[i];
    for (const ch of text) {
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) return i + 1; }
    }
  }
  return openLine + 1;
}

const MUST_GET = /must_get_(entry|action|valid_record)\s*\(/;

function deferralRanges() {
  const ranges = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!MUST_GET.test(l)) continue;

    // Shape 1: `if must_get_X(..).is_err() {` — the whole if-body.
    if (/\.is_err\(\)/.test(l) && l.includes('{')) {
      ranges.push([i + 1, matchingBrace(i, l.indexOf('{'))]);
      continue;
    }
    // Shape 2: `let Ok(..) = must_get_X(..) else {` — the else-body only.
    if (/^\s*let\s+Ok\s*\(/.test(l) && /\belse\b/.test(l) && l.includes('{')) {
      const idx = l.indexOf('{', l.indexOf('else'));
      if (idx !== -1) { ranges.push([i + 1, matchingBrace(i, idx)]); continue; }
    }
    // Shape 3: `match must_get_X(..) {` — the Err arm inside the match body.
    if (/^\s*(?:let\s+\w+\s*=\s*)?match\s/.test(l) && l.includes('{')) {
      const end = matchingBrace(i, l.indexOf('{'));
      for (let j = i + 1; j < end; j++) {
        const arm = /^\s*(Ok|Err)\b[^=]*=>\s*(\{?)/.exec(lines[j]);
        if (!arm || arm[1] !== 'Err') continue;
        // A braced arm ends at its own brace; a bare one ends at its line, and
        // a `return` inside it is on that same line in this file.
        const armEnd = arm[2] === '{' ? matchingBrace(j, lines[j].indexOf('{')) : j + 1;
        ranges.push([j + 1, armEnd]);
      }
      continue;
    }
    // Shape 4: `?` / `.map_err(..)` — the host defers and no Invalid of this
    // call's own is reachable, so there is no branch to record. Left alone
    // deliberately: these produce no site, rather than a mislabelled one.
  }
  return ranges;
}

const DEFERRAL_RANGES = deferralRanges();
const inDeferralBranch = (line) =>
  DEFERRAL_RANGES.some(([a, b]) => line >= a && line <= b);

// ============================================================================
// --- THE COORDINATOR CROSS-CHECK, which is what `crafted` was asserting
// without evidence.
//
// `crafted` means "reachable by calling the coordinator with a payload the
// typed methods never produce". That is only true if the coordinator exposes a
// path which carries the field the rule guards. For ten entry types it does —
// the extern takes the whole entry struct, so every field is the caller's. For
// FIVE it does not: the extern takes a params struct and BUILDS the entry,
// deriving the identity and timing fields from the host.
//
//   generate_worldline_trace(TraceGenerationParams)
//   reveal_pre_registration(RevealInput)
//   pre_register(PreRegisterInput)
//   record_twitter_mirror(RecordTwitterMirrorInput)
//   import_twitter_reply(ImportTwitterReplyInput)
//
// `generate_worldline_trace` is the worked case and it is not marginal: it sets
// `agent` from `agent_info()`, builds `period_boundaries` by `query()`ing the
// caller's own source chain, and derives `checksum` and `trace_payload`. Only
// `expertise_tags` and `expires_at` come from the caller. So of its 8 sites
// exactly ONE can be made to fire from JavaScript — and the old classification
// was wrong in BOTH directions there, calling `PeriodBoundary sample_action not
// found.` honest (it is a deferral, and unreachable besides) while the one rule
// a plain client CAN trigger sat in `crafted` alongside seven that nobody can.
//
// HOW THE DECISION IS MADE, and which half is mechanical. The tool reads each
// extern's struct literal and records, per entry field, whether the value comes
// from the params (`input.x`, `params.x`) or from somewhere else — that is
// mechanical and is the part a machine should own. Mapping a RULE to the field
// it guards is not mechanical: most messages name their field, some do not
// ("Only the author of a PreRegistration may reveal it." guards
// `pre_registration`), so the unnamed ones are curated in GUARDS_FIELD below
// and the build FAILS if a params-only site matches neither. An unresolved site
// is a question about reachability, and answering it by default is how the
// wrong denominator got here in the first place.
// Every entry struct's field list, read from the integrity zome, so a rule can
// be matched to the field it guards whether or not that field is the caller's.
// Matching only caller-controlled names was the first attempt and it was wrong
// in a telling way: `trace_payload exceeds 64KB limit.` names its field plainly
// and fell through to "unresolved" precisely BECAUSE the field is derived.
const entryFields = new Map();
{
  // COMMENTS ARE STRIPPED FIRST, and skipping that is a silent wrong answer
  // rather than a parse error. `PreRegistration`'s doc comment contains
  // `hash_entry(SealedPrediction { .. })`, so a field scan bounded by the first
  // `}` stops inside the comment and reports the struct as having one field —
  // which quietly loses `author` and `reveal_deadline` and sent both of their
  // rules to "unresolved".
  const bare = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const re = /pub struct ([A-Z][A-Za-z_0-9]*)\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(bare)) !== null) {
    const fields = [...m[2].matchAll(/pub\s+([a-z_0-9]+)\s*:/g)].map((f) => f[1]);
    if (fields.length) entryFields.set(m[1], fields);
  }
}

const COORD_SRC = resolve(REPO, 'dna/coordinator/src/lib.rs');
const coord = readFileSync(COORD_SRC, 'utf8');
const coordLines = coord.split('\n');

const pascal = (snake) => snake.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join('');

// Every #[hdk_extern], with the name and single parameter of the fn beneath it.
const externs = [];
for (let i = 0; i < coordLines.length; i++) {
  if (!/#\[hdk_extern\]/.test(coordLines[i])) continue;
  for (let j = i + 1; j < Math.min(i + 6, coordLines.length); j++) {
    const m = /pub fn ([a-z_0-9]+)\s*\(\s*([a-z_0-9]+)\s*:\s*([A-Za-z_0-9]+)/.exec(coordLines[j]);
    if (m) { externs.push({ fn: m[1], param: m[2], type: m[3], line: j + 1 }); break; }
    if (/pub fn ([a-z_0-9]+)\s*\(\s*\)/.test(coordLines[j])) break;   // no-arg extern
  }
}
const externAt = (ln) => {
  let best = null;
  for (const e of externs) if (e.line <= ln && (!best || e.line > best.line)) best = e;
  return best;
};

// Which extern writes which entry type, and — when the param is NOT the entry
// itself — which of the entry's fields that extern fills from the caller.
const writePaths = new Map();   // EntryTypes name -> [{fn, takes, raw, callerFields}]
for (let i = 0; i < coordLines.length; i++) {
  const m = /create_entry\(EntryTypes::([A-Za-z_0-9]+)/.exec(coordLines[i]);
  if (!m) continue;
  const owner = externAt(i + 1);
  if (!owner) continue;
  const entryType = m[1];
  const raw = owner.type === entryType;

  // The struct literal that built it: `Entry { field: expr, shorthand, .. }`,
  // the nearest one above this create_entry inside the same extern.
  const callerFields = new Set();
  if (!raw) {
    for (let j = i; j >= owner.line - 1; j--) {
      if (!new RegExp(`${entryType}\\s*\\{`).test(coordLines[j])) continue;
      let depth = 0, started = false;
      for (let k = j; k < Math.min(j + 60, coordLines.length); k++) {
        for (const ch of coordLines[k]) {
          if (ch === '{') { depth++; started = true; }
          else if (ch === '}') depth--;
        }
        if (k > j || started) {
          // `field: expr,` — caller-controlled when expr reads the param.
          const f = /^\s*([a-z_0-9]+)\s*:\s*(.+?),?\s*$/.exec(coordLines[k]);
          if (f && new RegExp(`\\b${owner.param}\\.`).test(f[2])) callerFields.add(f[1]);
        }
        if (started && depth <= 0) break;
      }
      break;
    }
  }
  const list = writePaths.get(entryType) ?? [];
  list.push({ fn: owner.fn, takes: owner.type, raw, callerFields: [...callerFields] });
  writePaths.set(entryType, list);
}

// Rules whose message does not name the entry field they guard. Curated, short,
// and asserted complete: a params-only site matching neither a field name nor
// this table stops the build rather than being guessed at.
const GUARDS_FIELD = {
  'Only the author of a PreRegistration may reveal it.': 'pre_registration',
  'Revelation content does not hash to the sealed commitment; this is not what was committed to.': 'prediction',
  'Revelation is past its reveal_deadline. A late reveal would let the author choose, after seeing the outcome, whether the commitment counts as revealed or expired.': 'pre_registration',
  'PreRegistration question must predate the commitment, so a prediction cannot be re-pointed at a question chosen after the outcome.': 'question',
  'WorldlineTrace must have at least one period boundary.': 'period_boundaries',
  'PeriodBoundary sample_action must be authored by trace agent.': 'period_boundaries',
  'PeriodBoundary start_time must be <= end_time.': 'period_boundaries',
  'Checksum must be 32 bytes.': 'checksum',
  'BridgeRecord {}.': 'carried_fields',
};

// ============================================================================
// --- ONE ENTRY TYPE'S BYTES READ AS ANOTHER'S, and which rules that costs.
//
// A `to_app_option::<T>()` guard reads as a type check. It is one only if no
// OTHER entry type's bytes deserialise as `T`. A `Claim`'s do deserialise as a
// `Mew` — `Mew`'s non-Option fields are content/author/timestamp/semantic_tags,
// a `Claim` carries all four at the same declared types, and serde ignores the
// extra ones — so two guards that read as type checks cannot fire for a Claim.
// READINESS item 17 took the decision to ACCEPT that rather than add a
// discriminant field (which would change the DNA hash and force a protocol
// bump), on the condition that the affected rules stop reading as enforcement
// HERE, in the inventory the corpus works from.
//
// So this does not change a class — both rules are still reachable and both
// still have corpus cases that pass — it records what the rule does NOT cover,
// on the site itself, where the next person reading the inventory will see it.
//
// THE RULE IS THE EMPIRICAL ONE, not the one serde documents: a MISSING
// `Option` field is tolerated, which is what the corpus measured rather than
// assumed. `scripts/check-entry-type-confusion.mjs` is the GATE on the same
// fact — it reds when a NEW confusable pair appears — and it derives the pairs
// independently and then checks them against the ones published here, so the
// two cannot drift apart in silence.
const structFieldTypes = new Map();
{
  const enumBlock = src.slice(src.indexOf('pub enum EntryTypes'));
  const names = [...enumBlock.slice(0, enumBlock.indexOf('\n}')).matchAll(/^\s{4}([A-Z][A-Za-z]*)\(/gm)]
    .map((m) => m[1]);
  for (const t of names) {
    const m = new RegExp(`pub struct ${t} \\{([\\s\\S]*?)\\n\\}`).exec(src);
    if (!m) continue;
    const f = new Map();
    for (const g of m[1].matchAll(/pub (\w+)\s*:\s*([^,\n]+)/g)) {
      f.set(g[1], g[2].trim().replace(/,$/, '').replace(/\s+/g, ''));
    }
    if (f.size) structFieldTypes.set(t, f);
  }
}

// Can A be read out of B's bytes? Every non-Option field of A must exist in B
// at an identical declared type; extra fields in B are ignored, which is why
// the direction matters — a bigger struct reads as a smaller one and not the
// reverse. That asymmetry is load-bearing here: it is why the Claim-side
// sibling rule ("A ClaimToBridgeRecord link's base is not a Claim.") still
// enforces, since a Mew lacks domain/confidence/evidence_hashes.
const readableFrom = (A, B) => {
  if (A === B || !structFieldTypes.has(A) || !structFieldTypes.has(B)) return false;
  for (const [name, ty] of structFieldTypes.get(A)) {
    if (ty.startsWith('Option<')) continue;
    if (structFieldTypes.get(B).get(name) !== ty) return false;
  }
  return true;
};

const confusableEntryReads = [];
for (const B of structFieldTypes.keys()) {
  for (const A of structFieldTypes.keys()) {
    if (readableFrom(A, B)) confusableEntryReads.push({ from: B, to: A });
  }
}

// Where validation actually READS a type out of a record. The line is the
// anchor: a rule affected by a confusable read sits inside the branch that
// tests the result, so it is below the read and names the type it wanted.
// Both conditions are needed and each excludes a real site that the other
// would have let through — `A ClaimToBridgeRecord link's base is not a Claim.`
// sits three lines under the `is_mew` read and names Claim (which nothing is
// confusable with), and `MewToClaim base must be a Mew's EntryHash.` names Mew
// but is an EntryHash downcast with no type read above it at all.
const typeReads = [...src.matchAll(/to_app_option::<([A-Za-z]+)>/g)].map((m) => ({
  line: src.slice(0, m.index).split('\n').length,
  type: m[1],
}));

// --- WHICH LINK RULES A CLIENT CAN REACH. Link ops ARE authored locally —
// every create_claim writes index links — so a link rule is not "remote"
// merely for being a link rule. What decides whether its REJECTION can be
// observed is whether some published path writes that link type with a base,
// target or tag the caller chooses.
//
// THIS WAS A HAND-MAINTAINED LIST OF TWENTY PROBER NAMES AND IT WAS GATING
// NOTHING FOR TWO LINK TYPES. `PROBED_LINK_TYPES` named the types reachable
// through an `attempt_*` prober, and everything else was classed
// `needs_prober` — "needs a coordinator change + DNA rebuild". That inference
// is wrong in one direction: a prober is not the only path with
// caller-chosen fields. `reinforce_synaptic_link(ActionHash)` takes the link's
// entire BASE as its only argument, and `grant_attestation` takes the base,
// the target and the bytes of the tag. So three rules on those two types were
// reachable from JavaScript today, were labelled as needing a DNA rebuild, and
// were therefore excluded from the coverage denominator in replay.mjs — a rule
// nobody would notice losing, which is the one defect this whole corpus exists
// to find. It had the shape its own header warned about: "a prober proves the
// rule it probes and silently flatters the rules it does not."
//
// THE SPLIT OF LABOUR IS THE SAME ONE THE ENTRY CROSS-CHECK USES, for the same
// reason — a machine should own what is mechanical and a human should be forced
// to answer what is not.
//
// MECHANICAL: which link types any path writes at all, read off the
// coordinator's own source. The eighteen attachment kinds come from
// `attempt_false_attachment_link`'s match arms rather than from a list retyped
// here, so a new kind is probed the moment the arm is added, and a prober
// deleted stops flattering its rules the moment it goes.
//
// JUDGEMENT: for a type with no prober, whether a rule is reachable depends on
// the rule — `grant_attestation` makes the tenure rule reachable and cannot
// make the tag-length rule fire at all, because it builds the tag from an
// ActionHash and an ActionHash is always 36 bytes. Those verdicts are curated
// in UNPROBED_LINK_RULES below, with the reason, and **a link rule on an
// unprobed type that is missing from that table exits 1 before the inventory is
// written.** The old list could omit a whole type in silence; this cannot omit
// a single rule.

// Mechanical (1) — every top-level fn in the coordinator, so a `create_link`
// is attributed to the function CONTAINING it. `externAt` above finds the
// nearest extern above a line, which is wrong here: `create_synaptic_link` is
// a private fn and its create_link would be charged to whatever extern happens
// to precede it in the file.
const coordFns = [];
for (let i = 0; i < coordLines.length; i++) {
  const m = /^(?:pub )?(?:async )?fn ([a-z_0-9]+)/.exec(coordLines[i]);
  if (!m) continue;
  coordFns.push({
    name: m[1],
    start: i + 1,
    isExtern: coordLines.slice(Math.max(0, i - 6), i).some((l) => /#\[hdk_extern\]/.test(l)),
  });
}
for (let i = 0; i < coordFns.length; i++) {
  coordFns[i].end = i + 1 < coordFns.length ? coordFns[i + 1].start - 1 : coordLines.length;
}

// Mechanical (2) — every create_link site, with the link types its enclosing fn
// can write. The type named in the call wins; a prober computes it from a
// `match payload.kind` into a local, so for an `attempt_*` extern every
// LinkTypes:: in the body counts. That widening is deliberate and is confined
// to the probers, where over-collecting is the correct answer: each arm IS a
// reachable type. Applying it everywhere would invent write paths out of a
// get_links query that happens to share a function with an unrelated write.
const linkWritePaths = new Map();   // LinkTypes name -> [{fn, isExtern, prober}]
for (const f of coordFns) {
  const body = coordLines.slice(f.start - 1, f.end);
  const prober = f.isExtern && /^attempt_/.test(f.name);
  const types = new Set();
  body.forEach((line, k) => {
    if (!/create_link\(/.test(line)) return;
    const callText = body.slice(k, k + 8).join('\n');
    for (const m of callText.matchAll(/LinkTypes::([A-Za-z_0-9]+)/g)) types.add(m[1]);
  });
  if (!types.size && !/create_link\(/.test(body.join('\n'))) continue;
  if (prober) for (const m of body.join('\n').matchAll(/LinkTypes::([A-Za-z_0-9]+)/g)) types.add(m[1]);
  for (const t of types) {
    if (!linkWritePaths.has(t)) linkWritePaths.set(t, []);
    linkWritePaths.get(t).push({ fn: f.name, isExtern: f.isExtern, prober });
  }
}

const probedLinkTypes = new Set(
  [...linkWritePaths].filter(([, ps]) => ps.some((p) => p.prober)).map(([t]) => t),
);

// JUDGEMENT — the fourteen link rules on the five types with no prober, each
// with a verdict and the evidence for it. `via` names the published extern that
// reaches it, and is what a corpus case should call.
//
// The three friction rules are the `GAPS` shape replay.mjs already records for
// Critique and AntibodyPattern, and the constants are the evidence: the
// coordinator's limit EQUALS validation's in all three cases
// (`SYNAPTIC_LINK_MAX_PER_WINDOW` 20 = `..._VALIDATION` 20,
// `REINFORCEMENT_MAX_PER_WINDOW` 40 = 40, `ATTESTATION_GRANT_MAX_PER_WINDOW`
// 5 = 5), and the coordinator checks BEFORE create_link — so the published
// path always refuses in the coordinator's own wording and the integrity
// zome's message cannot be the one that comes back.
const UNPROBED_LINK_RULES = {
  // --- SynapticLink: written only by the private `create_synaptic_link`,
  // which no extern exposes and whose every field it derives.
  'SynapticLink tag must contain at least 4 bytes (f32 conductance).': {
    reachable: false,
    why: 'the tag is `conductance.to_le_bytes()` of an f32, so it is always exactly 4 bytes; no extern passes raw tag bytes for this type',
  },
  'SWO temporal friction: author has {} SynapticLinks in the last {} seconds (limit {}). This is an absolute limit, enforced by DHT validation, not a client-side courtesy.': {
    reachable: false,
    why: 'create_synaptic_link calls check_synaptic_link_friction() first at the same limit (20), so the coordinator refuses in its own wording',
  },
  // --- AgentToMembrane: `join_membrane(AnyDhtHash)` derives all three fields.
  'AgentToMembrane tag must be exactly 36 bytes (a raw AgentPubKey).': {
    reachable: false,
    why: 'join_membrane builds the tag from `agent.get_raw_36()`, which is always 36 bytes',
  },
  'AgentToMembrane links can only be created by the agent joining, not on someone else\'s behalf.': {
    reachable: false,
    why: 'join_membrane takes the agent from agent_info(), so the joining agent is always the author',
  },
  'AgentToMembrane base is not a valid Membrane.': {
    reachable: false,
    why: 'join_membrane resolves the membrane through membrane_entry_hash, which `get()`s it and fails with "Membrane not found." before create_link — so a base that is not a Membrane is never authored and this guard is never reached, deferral or otherwise',
  },
  'AgentToMembrane base must be an EntryHash.': {
    reachable: false,
    why: 'the base is membrane_entry_hash(..), whose return type is EntryHash — the caller chooses WHICH membrane, never the hash kind',
  },
  // --- Reinforcement: `reinforce_synaptic_link(ActionHash)` is a published
  // extern whose ONE argument is the link's base, unmodified.
  'Reinforcement links can only be created by the agent doing the reinforcing, not on someone else\'s behalf.': {
    reachable: false,
    why: 'reinforce_synaptic_link sets the target from agent_info(), so the reinforcer is always the author',
  },
  'Reinforcement base is not a SynapticLink creation.': {
    reachable: true,
    via: 'reinforce_synaptic_link',
    why: 'the extern passes its ActionHash argument straight through as the link base, so any resolvable action that is not a SynapticLink CreateLink reaches this rule — a Claim creation does it',
  },
  'SWO temporal friction: author has {} Reinforcements in the last {} seconds (limit {}). This is enforced by DHT validation, not a client-side courtesy.': {
    reachable: false,
    why: 'reinforce_synaptic_link calls check_reinforcement_friction() first at the same limit (40), so the coordinator refuses in its own wording',
  },
  // --- AttestationGrant: `grant_attestation(GrantAttestationPayload)` is a
  // published extern carrying the base, the target and the tag's bytes.
  'AttestationGrant tag must be exactly 36 bytes (a raw ActionHash).': {
    reachable: false,
    why: 'grant_attestation builds the tag from `my_membership_action.get_raw_36()`, and an ActionHash is always 36 bytes',
  },
  'AttestationGrant\'s referenced membership action not found.': {
    reachable: true,
    via: 'grant_attestation',
    why: 'a well-formed my_membership_action that resolves to nothing reaches must_get_valid_record, which defers the commit — so this is assertable as a DEFERRAL and never as this message, which is what the corpus case asserts',
  },
  'AttestationGrant requires proof of sufficiently tenured membership in this membrane — the referenced action must be the granter\'s own AgentToMembrane join for this same membrane, created at least the required tenure period ago.': {
    reachable: true,
    via: 'grant_attestation',
    why: 'my_membership_action is the caller\'s, so any resolvable action of theirs that is not a 30-day-old AgentToMembrane join for this membrane reaches this rule — including their own join made a moment ago, which fails on tenure alone',
  },
  'SWO temporal friction: author has granted attestation {} times in the last {} seconds (limit {}). This bounds how fast the right to vouch can be spent, not just how fast links can be created.': {
    reachable: false,
    why: 'grant_attestation calls check_attestation_grant_friction() first at the same limit (5), and reaching the limit would need five grants that PASS the 30-day tenure bar',
  },
  // --- TaxonomyToSpecies: written by create_critique_species, which derives
  // the anchor and uses the entry it just created as the target.
  'TaxonomyToSpecies target is not a CritiqueSpecies.': {
    reachable: false,
    why: 'the target is the ActionHash create_critique_species just returned from create_entry, so it is always a CritiqueSpecies creation',
  },
  'TaxonomyToSpecies base is not the taxonomy anchor.': {
    reachable: false,
    why: 'the base is taxonomy_anchor_hash(), which takes no argument',
  },
  'A TaxonomyToSpecies link may only be created by the species\' own proposer.': {
    reachable: false,
    why: 'the species is created by the same call, so its proposer is always the author',
  },
};

// A link rule on an unprobed type with no verdict: collected during classify
// and fatal before the inventory is written.
const unresolvedLinks = [];

// The link validators are one long if / else-if chain over `link_type`, so the
// branch a site sits in is the last such comparison above it.
const linkBranch = new Map();
{
  const linkFns = fns.filter((f) => /^validate_(create|delete)_link$/.test(f.name));
  for (const f of linkFns) {
    let active = null;
    for (let i = f.start - 1; i < f.end; i++) {
      const mm = /(?:if|else if)\s*\(?\s*link_type\s*==\s*LinkTypes::([A-Za-z]+)/.exec(lines[i]);
      if (mm) active = mm[1];
      const mAny = /^\s*(?:\}\s*else\s*\{|\}\s*else$)/.test(lines[i]);
      if (mAny) active = active;   // trailing else keeps the chain's last subject
      linkBranch.set(i + 1, active);
    }
  }
}

// --- Classification. Driven by the enclosing validator and the message, both
// of which are stable in this file; see the header for what the classes mean.
const REMOTE_VALIDATORS = new Set([
  'validate', 'validate_create_link', 'validate_delete_link',
  'validate_update_entry', 'validate_delete_entry', 'validate_agent_activity',
  'validate_protocol_version',
]);

function classify(site) {
  const v = site.validator;
  const msg = site.message;
  const isLink = /^validate_(create|delete)_link$/.test(v);

  // THE LINK TYPE IS RECORDED BEFORE ANY CLASS IS DECIDED, and it used not to
  // be. `deferred` returns below this point, so a DEFERRED LINK SITE came out
  // of here with no `link_type` at all — and replay.mjs's per-type coverage
  // denominator is keyed on that field, so those rules were in no type's
  // denominator and in no total. Two sites, found by the orphan check reporting
  // a case for a rule it said was not in the inventory:
  // `AgentToMembrane base is not a valid Membrane.` and `AttestationGrant's
  // referenced membership action not found.` It is the same shape as the prober
  // list one file over — a rule that no number counted.
  if (isLink) {
    site.link_type = linkBranch.get(site.line) ?? null;
    if (site.link_type) {
      site.link_write_paths = (linkWritePaths.get(site.link_type) ?? []).map(
        (p) => `${p.fn}${p.prober ? ' (prober)' : p.isExtern ? '' : ' (private)'}`,
      );
    }
  }

  // A `must_get_*` guard cannot fire for the thing it is written to catch.
  // must_get_entry / must_get_action are DETERMINISTIC DEPENDENCY FETCHES: when
  // the dependency is absent the host does not hand the validator an Err, it
  // abandons the callback with unresolved dependencies, and the commit comes
  // back as "could not be completed but may be retried"
  // (DepMissingFromDht) — a retryable stall, not a rejection. Confirmed live
  // against protocol 9: a Claim citing a well-formed but nonexistent EntryHash
  // cannot be committed, and the "Claim evidence hash not found." branch is
  // never taken — the HOST stops the write, not that line.
  //
  // The rule therefore holds: SPEC.md §5.3:350 ("MUST resolve to a real,
  // existing entry at validation time") and §5.3:549 ("enforced for every
  // listed field") are substantively correct, and §5.3:358 already states the
  // deferral mechanism. Measured against protocol 9: the call throws in 0.1s
  // and nothing is written. What is misleading is only WHERE the enforcement
  // appears to live — the nine Invalid strings read as the check and are not,
  // and per §5.1 they cannot be annotated in place, because a comment in the
  // integrity zome changes the DNA hash.
  //
  // These sites are classed separately because a corpus case for them must
  // assert the deferral. Asserting the message would fail forever; asserting
  // only "it threw" would pass for the wrong reason, which is the failure mode
  // this whole corpus exists to stop.
  if (inDeferralBranch(site.line)) {
    // DEFERRED STILL PRESUMES SOMETHING REACHES THE VALIDATOR. `deferred` says
    // the message never fires because the host abandons the callback first —
    // but that is a statement about what happens WHEN the op is authored, and
    // on an unprobed link type whether it can be authored at all is the same
    // judgement call UNPROBED_LINK_RULES answers. Taking the early return
    // without asking put `AgentToMembrane base is not a valid Membrane.` in the
    // assertable-as-a-deferral count, where it does not belong: join_membrane
    // resolves the membrane with `get()` BEFORE create_link, so a base that is
    // not a Membrane is refused by the coordinator and the link is never
    // authored. The verdict can only make the class STRICTER here, never
    // reachable.
    if (isLink && site.link_type && !probedLinkTypes.has(site.link_type)) {
      const verdict = UNPROBED_LINK_RULES[msg];
      if (!verdict) { unresolvedLinks.push(site); return 'deferred'; }
      site.unreachable_why = verdict.reachable ? null : verdict.why;
      if (verdict.reachable) site.reached_via = verdict.via;
      return verdict.reachable ? 'deferred' : 'needs_prober';
    }
    return 'deferred';
  }

  // A pass-through returns whatever the validator it delegated to returned. It
  // is a real site but has no message and no payload of its own, so it is not
  // separately testable: the site it forwards from is what a test would target.
  if (msg === null) return 'passthrough';

  // Link rules: decided by whether a PUBLISHED PATH can make this rule fire,
  // not by whether the type has a prober — see UNPROBED_LINK_RULES on the two
  // types where those two questions had different answers.
  if (isLink) {
    const lt = site.link_type;
    if (lt === null) return 'remote';                      // the chain's fallthrough
    if (probedLinkTypes.has(lt)) return 'crafted';
    const verdict = UNPROBED_LINK_RULES[msg];
    if (!verdict) { unresolvedLinks.push(site); return 'needs_prober'; }
    site.unreachable_why = verdict.reachable ? null : verdict.why;
    if (verdict.reachable) site.reached_via = verdict.via;
    return verdict.reachable ? 'crafted' : 'needs_prober';
  }
  if (/updates are not permitted/i.test(msg)) return 'crafted';   // attempt_entry_update
  if (/deletes are not permitted/i.test(msg)) return 'remote';
  if (REMOTE_VALIDATORS.has(v)) return 'remote';

  // Author identity and self-reported timestamps: the SDK fills these in.
  if (/must match action author|must be authored by|Only the author of/i.test(msg)) return 'crafted';
  if (/timestamp|expires_at|start_time|created_at|published_at|must be <=|must be >/i.test(msg)) return 'crafted';
  if (/Checksum must be/i.test(msg)) return 'crafted';

  // Empty strings and missing references: an ordinary client reaches these.
  if (/cannot be empty|must contain at least one/i.test(msg)) return 'honest';
  if (/not found|does not resolve|is not a/i.test(msg)) return 'honest';

  return 'crafted';
}

for (const s of sites) {
  s.guard = guardFor(s.line);
  s.class = classify(s);
}

// --- Entry type the validator covers, for grouping the corpus by call target.
for (const s of sites) {
  const m2 = /^validate_(.+)$/.exec(s.validator);
  s.entry = m2 ? m2[1] : null;
}

// --- THE CONFUSABLE-READ ANNOTATION APPLIED. Changes no class — these rules
// are reachable and asserted — and records what each one does not cover.
for (const s of sites) {
  if (!s.message) continue;
  // THE MESSAGE MUST ASSERT THE TYPE, not merely mention it. The first cut
  // matched any message naming the type within range and caught one rule too
  // many: `An AgentToMew link may only be created by the Mew's own author.`
  // sits in the same branch and is NOT disabled by the confusion — it compares
  // the deserialised `author` to the action author, and a Claim carries an
  // `author` too, so it still fires. What it loses is narrower and is not an
  // enforcement gap: the entry it calls a Mew may be a Claim.
  const read = typeReads.find(
    (r) => s.line >= r.line && s.line <= r.line + 25
      && new RegExp(`(?:is not|must be|does not resolve to) an? ${r.type}\\b`).test(s.message),
  );
  if (!read) continue;
  const from = confusableEntryReads.filter((p) => p.to === read.type).map((p) => p.from);
  if (!from.length) continue;
  s.guard_reads = read.type;
  s.confusable_from = from;
  s.enforcement_caveat =
    `reads as a type check and is only a partial one: ${from.join('/')} bytes deserialise as `
    + `${read.type}, so this guard returns Ok(Some(..)) for ${from.join('/')} and the message `
    + `cannot fire for one. It DOES still fire for an entry of any other type (the deserialise `
    + `fails) and for a non-entry action (Ok(None)). READINESS item 17 accepted this rather than `
    + `adding a discriminant field, which would change the DNA hash.`;
}

// --- THE CROSS-CHECK APPLIED. Runs last and only ever makes a class STRICTER,
// so it cannot manufacture coverage: `honest`/`crafted` may become
// `needs_extern`, and nothing becomes reachable that was not.
//
// `deferred` is left alone on purpose. Its message does not fire whatever the
// write path looks like, and re-labelling those sites would lose the
// distinction the deferral cases in replay.mjs assert.
const unresolved = [];
for (const s of sites) {
  if (!s.entry || !['honest', 'crafted'].includes(s.class)) continue;
  const paths = writePaths.get(pascal(s.entry));
  if (!paths) continue;                       // not an entry type with a write path
  if (paths.some((w) => w.raw)) {             // the whole struct is the caller's
    s.write_path = paths.map((w) => `${w.fn}(${w.takes})`).join(', ');
    continue;
  }
  const caller = new Set(paths.flatMap((w) => w.callerFields));
  s.write_path = paths.map((w) => `${w.fn}(${w.takes})`).join(', ');
  s.caller_controlled_fields = [...caller];

  // The field this rule guards: curated first, else the entry field whose name
  // appears EARLIEST in the message. Earliest rather than longest, because
  // `ExternalCritique importer must match action author. Note this is ... the
  // Twitter handle in author_handle` names two fields and guards the first;
  // longest-match picks `author_handle` and is wrong.
  const fields = entryFields.get(pascal(s.entry)) ?? [];
  let field = GUARDS_FIELD[s.message] ?? null;
  if (!field) {
    let bestAt = Infinity;
    for (const f of fields) {
      const at = (s.message ?? '').search(new RegExp(`\\b${f}\\b`));
      if (at !== -1 && at < bestAt) { bestAt = at; field = f; }
    }
  }
  if (!field) {
    // Nothing named it, and the curated table does not cover it. Could be a
    // derived field (unreachable) or a caller field the message never names —
    // and defaulting either way is what produced the wrong denominator before.
    unresolved.push(s);
    continue;
  }
  s.guards_field = field;
  if (!caller.has(field)) s.class = 'needs_extern';
}

// The same discipline for link rules on a type with no prober. A missing
// verdict is a question about reachability, and the old prober list answered it
// by default for every rule at once — which is how three reachable rules came
// to sit in `needs_prober`. Fatal, and before the inventory is written.
// AND THE OTHER DIRECTION, on the same discipline replay.mjs applies to its
// declared-unreachable rules: a verdict whose rule the zome no longer has is an
// exemption outliving its subject. It would go on excluding a rule that does
// not exist, which is harmless today and is exactly how a stale list starts.
{
  const allMessages = new Set(sites.filter((s) => s.message).map((s) => s.message));
  const stale = Object.keys(UNPROBED_LINK_RULES).filter((m) => !allMessages.has(m));
  if (stale.length) {
    console.error('\nSTALE: UNPROBED_LINK_RULES carries a verdict for a rule the integrity zome');
    console.error('no longer has. Delete each — a verdict that outlives its rule is not coverage.\n');
    for (const m of stale) console.error(`  ${JSON.stringify(m)}`);
    process.exit(1);
  }
}

if (unresolvedLinks.length) {
  console.error('\nUNRESOLVED: these link rules are on a type no `attempt_*` prober writes,');
  console.error('so whether a published extern can make each one FIRE is a judgement call.');
  console.error('Add each to UNPROBED_LINK_RULES with `reachable` and a `why`, and re-run.');
  console.error('The write paths this tool found for the type are listed beside each.\n');
  for (const s of unresolvedLinks) {
    console.error(`  ${s.link_type}:${s.line}  ${JSON.stringify(s.message)}`);
    console.error(`      write paths: ${s.link_write_paths.join(', ') || '(none found)'}`);
  }
  process.exit(1);
}

if (unresolved.length) {
  console.error('\nUNRESOLVED: these sites belong to an entry type whose extern builds the');
  console.error('entry, and neither the message nor GUARDS_FIELD says which field they guard.');
  console.error('Add each to GUARDS_FIELD (naming the ENTRY field it guards) and re-run.\n');
  for (const s of unresolved) console.error(`  ${s.entry}:${s.line}  ${JSON.stringify(s.message)}`);
  process.exit(1);
}

const byClass = { honest: 0, crafted: 0, deferred: 0, needs_prober: 0, needs_extern: 0, remote: 0, passthrough: 0 };
for (const s of sites) byClass[s.class]++;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  // BOTH zomes, as of 2026-10-17. The coordinator decides reachability — which
  // fields an extern accepts rather than derives — so a coordinator-only change
  // can legitimately move a site's class. The CI drift gate regenerates this
  // file and diffs it, so that is caught without any new check; what would have
  // been misleading is this field continuing to name one input.
  generated_from: ['dna/integrity/src/lib.rs', 'dna/coordinator/src/lib.rs'],
  protocol_version: (/pub const PROTOCOL_VERSION: u16 = (\d+)/.exec(src) || [])[1] ?? null,
  total_sites: sites.length,
  // Published so `check-entry-type-confusion.mjs` can check its own
  // independently-derived pairs against these, and so a reader of the
  // inventory can see why two rules carry an `enforcement_caveat`.
  confusable_entry_reads: confusableEntryReads,
  by_class: byClass,
  sites,
}, null, 2) + '\n');

console.log(`integrity zome: ${SRC.replace(REPO + '/', '')}`);
console.log(`PROTOCOL_VERSION = ${(/pub const PROTOCOL_VERSION: u16 = (\d+)/.exec(src) || [])[1]}`);
console.log(`\n${sites.length} Invalid sites across ${new Set(sites.map(s => s.validator)).size} validators\n`);
console.log(`  honest   ${String(byClass.honest).padStart(3)}   reachable through the SDK's typed methods / MCP tools`);
console.log(`  crafted  ${String(byClass.crafted).padStart(3)}   reachable only via a crafted payload to the coordinator`);
console.log(`  deferred ${String(byClass.deferred).padStart(3)}   a must_get_* guard — the dependency defers the commit, so the message never fires`);
console.log(`  needs_prober ${String(byClass.needs_prober).padStart(3)}  link rules with no attempt_* path — needs a coordinator change + DNA rebuild`);
console.log(`  needs_extern ${String(byClass.needs_extern).padStart(3)}  entry rules whose field the extern DERIVES — same cost, needs a raw-payload extern`);
console.log(`  remote   ${String(byClass.remote).padStart(3)}   needs a peer authoring a bad op — not reachable locally`);
console.log(`  (passthrough ${byClass.passthrough} — forwards another validator's result, no message of its own)`);
console.log(`\n  assertable as a REFUSAL from JavaScript: ${byClass.honest + byClass.crafted}`);
console.log(`  assertable only as a DEFERRAL:          ${byClass.deferred}`);
console.log(`  blocked on a coordinator change:  ${byClass.needs_prober + byClass.needs_extern}`   + ` (${byClass.needs_prober} link rules + ${byClass.needs_extern} entry rules)`);
console.log(`\nwrote ${OUT.replace(REPO + '/', '')}`);
