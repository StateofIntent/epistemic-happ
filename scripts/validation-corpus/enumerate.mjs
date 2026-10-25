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
//
// THE SIGNATURE IS READ ACROSS LINES, and bounding it to one was a real blind
// spot rather than a tidiness point. `rustfmt` wraps a signature once it is
// long enough, so `pub fn attempt_false_attachment_link(` carries its parameter
// on the NEXT line — and five of this file's 68 externs are wrapped that way,
// including BOTH of the multi-line `attempt_*` probers. They were invisible
// here, which is how the three LINK friction rules came to be reported as
// having no raw-write path while the prober written for exactly that purpose
// sat in the tree: the bypass could not be seen because its extern could not
// be seen. Same shape as item 18's finding — a classifier reaching a confident
// conclusion from an input nobody had maintained.
//
// No entry write path changes as a result (the five are two link probers and
// three reads), so 5d's classifications are unaffected; the hole was latent for
// entries and live for links.
const externs = [];
for (let i = 0; i < coordLines.length; i++) {
  if (!/#\[hdk_extern\]/.test(coordLines[i])) continue;
  for (let j = i + 1; j < Math.min(i + 6, coordLines.length); j++) {
    if (!/pub fn ([a-z_0-9]+)/.test(coordLines[j])) continue;
    const name = /pub fn ([a-z_0-9]+)/.exec(coordLines[j])[1];
    // The signature from `(` to its matching `)`, however many lines that takes.
    const sig = coordLines.slice(j, Math.min(j + 8, coordLines.length)).join(' ');
    const open = sig.indexOf('(');
    let depth = 0, close = -1;
    for (let k = open; k < sig.length && open !== -1; k++) {
      if (sig[k] === '(') depth++;
      else if (sig[k] === ')') { depth--; if (depth === 0) { close = k; break; } }
    }
    const params = close === -1 ? '' : sig.slice(open + 1, close);
    const m = /^\s*([a-z_0-9]+)\s*:\s*([A-Za-z_0-9]+)/.exec(params);
    if (m) externs.push({ fn: name, param: m[1], type: m[2], line: j + 1 });
    else externs.push({ fn: name, param: null, type: null, line: j + 1 });  // no-arg
    break;
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
// READINESS item 17 took the decision on 2026-10-19 to ACCEPT that rather than
// add a discriminant field (which would change the DNA hash and force a
// protocol bump), on the condition that the affected rules stop reading as
// enforcement HERE, in the inventory the corpus works from. Corpus findings 8
// and 9 are the two live sites; item 16's sweep is the gate on new pairs.
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
// --- Which LinkTypes a client can author with attacker-controlled fields.
// Link ops ARE authored locally — every create_claim writes index links — so a
// link rule is not "remote" merely for being a link rule. What decides whether
// its REJECTION can be observed is whether the coordinator exposes a path that
// writes that link type with a base, target or tag the caller chooses. Those
// paths are the `attempt_*` probers, and they are deliberate: see
// attachment-links.mjs's header on the link types "nobody probed".
//
// A link rule whose type has no prober is not untestable in principle — it is
// untestable from JavaScript alone. Reaching it needs a new `attempt_*` function
// in the coordinator, which means rebuilding and repacking the DNA. That is a
// different and much larger job than adding a payload to a corpus, which is why
// those sites get their own class instead of being counted as reachable.
// READ FROM THE RUST RATHER THAN RESTATED HERE, and the reason is a mistake
// this file invited and then got. This was a hand-maintained list of eighteen
// names. Item 18 added four `AttachmentLinkKind` variants in the coordinator
// and a fifth single-purpose prober — and because nothing connected the Rust to
// this list, five link types stayed classed `needs_prober` while their rules
// were perfectly drivable. The corpus went on to assert nine of them, and the
// coverage loop counted "0 of 0 assertable rules" for two whole link types:
// cases running, passing, and gating NOTHING, because a rule the inventory
// calls unreachable is a rule the coverage check does not require a case for.
//
// That is the exact inversion this directory exists to catch, committed by the
// tool that catches it. So the generic prober's reach is now PARSED from
// `enum AttachmentLinkKind`, and only the single-purpose probers — which are
// one extern per link type and cannot be enumerated from a type — stay listed.
const ATTACHMENT_KIND_VARIANTS = (() => {
  const m = /pub enum AttachmentLinkKind \{([\s\S]*?)\n\}/.exec(coord);
  if (!m) throw new Error('could not find `enum AttachmentLinkKind` in the coordinator — this classifier depends on it');
  return [...m[1].matchAll(/^\s{4}([A-Z][A-Za-z]*),/gm)].map((v) => v[1]);
})();

const SINGLE_PURPOSE_PROBERS = {
  DomainToClaim: 'attempt_false_domain_index',
  MembraneRegistry: 'attempt_false_membrane_registry',
  TaxonomyToSpecies: 'attempt_false_taxonomy_index',
  // Item 4.5's index, registered WITH the link type rather than after it. A
  // link type absent from here is classed `needs_prober`, and `needs_prober`
  // had been driven to zero — so adding a link type without its prober would
  // have undone that silently and left three rules inventoried as assertable
  // with nothing able to assert them.
  DomainToForeignCritique: 'attempt_false_foreign_critique_index',
};

// Each single-purpose prober must actually EXIST, or this list is the same kind
// of stale claim the hardcoded set was.
for (const [lt, fn] of Object.entries(SINGLE_PURPOSE_PROBERS)) {
  if (!coord.includes(`pub fn ${fn}(`)) {
    throw new Error(`${lt} is listed as probed by ${fn}, which is not in the coordinator`);
  }
}

const PROBED_LINK_TYPES = new Set([
  ...ATTACHMENT_KIND_VARIANTS,
  ...Object.keys(SINGLE_PURPOSE_PROBERS),
]);

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
  // be. `deferred` returns below this point and the link branch further down is
  // where `link_type` was set — so a DEFERRED LINK SITE came out of here with
  // no `link_type` at all, and replay.mjs's per-type coverage denominator is
  // keyed on exactly that field. Those rules were therefore in no type's
  // denominator and in no total: `AgentToMembrane base is not a valid
  // Membrane.` and `AttestationGrant's referenced membership action not found.`
  //
  // Found by the orphan check reporting a corpus case for a rule it said was
  // not in the inventory — the only one of these gates that could have seen it,
  // because the coverage loop cannot miss a rule it never iterates. Same shape
  // as item 18's finding one file over: a rule no number counted.
  if (isLink) site.link_type = linkBranch.get(site.line) ?? null;

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
  if (inDeferralBranch(site.line)) return 'deferred';

  // A pass-through returns whatever the validator it delegated to returned. It
  // is a real site but has no message and no payload of its own, so it is not
  // separately testable: the site it forwards from is what a test would target.
  if (msg === null) return 'passthrough';

  // Link rules: decided by whether the link type has a prober, not by being a
  // link rule. `attempt_entry_update` exists, so the update refusal is probed.
  if (isLink) {
    if (site.link_type === null) return 'remote';          // the chain's fallthrough
    return PROBED_LINK_TYPES.has(site.link_type) ? 'crafted' : 'needs_prober';
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

// --- THE CONFUSABLE-READ ANNOTATION APPLIED. Changes no class — both affected
// rules are reachable and both have passing corpus cases — and records what
// each one does not cover, on the site itself, where the inventory's next
// reader will see it. READINESS item 17.
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

if (unresolved.length) {
  console.error('\nUNRESOLVED: these sites belong to an entry type whose extern builds the');
  console.error('entry, and neither the message nor GUARDS_FIELD says which field they guard.');
  console.error('Add each to GUARDS_FIELD (naming the ENTRY field it guards) and re-run.\n');
  for (const s of unresolved) console.error(`  ${s.entry}:${s.line}  ${JSON.stringify(s.message)}`);
  process.exit(1);
}

// ============================================================================
// --- THE COORDINATOR REFUSES FIRST, so the rule's own message never appears.
// READINESS item 5e, and the direct sequel to 5d.
//
// 5d taught this tool that `crafted` is false when the extern DERIVES the
// field a rule guards: the payload cannot carry the violation, so the rule is
// unreachable however the caller is built. 5b, by running into it, found the
// OTHER way `crafted` is false — every field is the caller's, the payload
// carries the violation perfectly, and the rule still never fires, because the
// extern checks the same condition FIRST and returns its own `wasm_error!`.
// A corpus case driven that way passes while asserting nothing about
// validation: it was refused by the courtesy, not by the enforcement.
//
// WHAT IS MECHANICAL, and it is more than expected. A pre-check and its
// validation twin are usually the same Rust expression, because they were
// written as a pair — so the conditions are compared after normalising the one
// difference the pair always has: the integrity zome's constant carries a
// `_VALIDATION` suffix (`CRITIQUE_MAX_PER_WINDOW_VALIDATION` against
// `CRITIQUE_MAX_PER_WINDOW`, five such pairs). That catches the five friction
// rules and two of `Membrane`'s outright, on the expression text rather than on
// a curated opinion.
//
// WHAT IS NOT, and why guessing is worse than failing. Two of `Membrane`'s
// shadowed rules have no textual twin:
//
//   * the constitution-resolution rule is `let Some(c) = .. else` in the
//     validator and `.ok_or(wasm_error!(..))` in the extern — the same refusal
//     written two ways the parser cannot equate;
//   * `Membrane creator must match action author.` has no twin AT ALL. It is
//     shadowed by ORDERING: forging the creator means naming somebody else, and
//     the extern's `constitution.agent != membrane.creator` check then fires
//     first, on a different rule. 5b observed exactly that — the case came back
//     refused by the constitution rule instead.
//
// So those are curated below and the build FAILS if a curated entry matches no
// site or no extern guard, the same discipline GUARDS_FIELD and
// PROBED_LINK_TYPES already carry. An unverifiable claim about reachability is
// how the wrong denominator got here twice.
//
// WHAT SHADOWING COSTS DEPENDS ENTIRELY ON WHETHER A BYPASS EXISTS, which is
// the distinction item 5e asked to be kept:
//
//   * WITH a raw-write path, the rule is still assertable and the class does
//     not change — what changes is that the inventory now says the ordinary
//     extern MUST NOT be used, so a case cannot quietly be refused by the
//     courtesy and counted. `attempt_unaccountable_membrane` is `create_entry`
//     with nothing in front of it, and `attempt_false_attachment_link` carries
//     no friction check, so all four `Membrane` rules and all three LINK
//     friction rules are in this group.
//   * WITHOUT one, nothing can assert the rule and it leaves the denominator
//     as `shadowed`. That is the two ENTRY friction rules, `Critique` and
//     `AntibodyPattern`: no extern writes either without its friction helper.
//
// THE INVERSION IS THE POINT AND IS WORTH STATING PLAINLY: what is tested is
// the courtesy and what is untested is the enforcement. The coordinator's check
// is what a custom client skips; the integrity rule is what every validating
// peer runs.
// ============================================================================

// Every coordinator function's body, so a guard can be attributed to the extern
// that reaches it — the friction checks live in `check_*_friction()` helpers
// called from the extern, not in the extern itself, so a scan bounded by the
// extern body finds nothing. One level of calls is followed, which covers every
// case in this file; the bound is stated rather than assumed, and a helper that
// called another helper would be missed.
const coordFns = [];
for (let i = 0; i < coordLines.length; i++) {
  const m = /^(?:pub )?fn ([a-z_0-9]+)/.exec(coordLines[i]);
  if (m) coordFns.push({ name: m[1], start: i + 1 });
}
for (let i = 0; i < coordFns.length; i++) {
  coordFns[i].end = i + 1 < coordFns.length ? coordFns[i + 1].start - 1 : coordLines.length;
}
const coordFnByName = new Map(coordFns.map((f) => [f.name, f]));

// A guard that refuses with the coordinator's own message. The condition is
// taken only from an `if` on one of the three lines above — deliberately tight,
// because the `.ok_or(wasm_error!(..))` form has no condition at all and
// walking further back would attribute it to an unrelated `if` above it. A
// guard with no condition can still be matched by the curated table.
function guardsIn(fn) {
  const out = [];
  for (let i = fn.start; i < fn.end; i++) {
    if (!/wasm_error!\(WasmErrorInner::Guest/.test(coordLines[i])) continue;
    const seg = coordLines.slice(i, Math.min(i + 6, fn.end)).join(' ');
    const lit = /"((?:[^"\\]|\\.)*)"/.exec(seg);
    if (!lit) continue;                                   // `format!("{:?}", e)` passthrough
    if (/^\{:\?\}$/.test(lit[1])) continue;
    // Blanks and comments are skipped, and the FIRST real line above decides:
    // an `if` is the guard, anything else means this refusal carries no
    // condition of its own (the `.ok_or(wasm_error!(..))` form, whose preceding
    // real line is the `let` it hangs off). Breaking on the first real line is
    // what preserves that distinction, so the window can be generous without
    // mis-attributing a condition to a refusal that has none.
    //
    // Three lines was the first window and it was too tight by exactly one
    // comment block: `check_synaptic_link_friction` explains itself in four
    // comment lines between its `if` and its `return Err`, so its condition
    // read as absent, nothing matched, and the SynapticLink friction rule
    // stayed out of this analysis altogether rather than being misclassified.
    let cond = null;
    for (let j = i - 1; j >= Math.max(fn.start - 1, i - 12); j--) {
      const t = coordLines[j].trim();
      if (!t || t.startsWith('//')) continue;
      if (/^if\s/.test(t)) { cond = t.replace(/\s*\{$/, ''); }
      break;
    }
    out.push({ fn: fn.name, line: i + 1, cond, msg: lit[1].replace(/\\\n\s*/g, '').trim() });
  }
  return out;
}

// What an extern can reach: itself and every local function reachable from it,
// TRANSITIVELY, with a visited set for cycles.
//
// Guards AND link writes both derive from this same set, because both hide in
// helpers for the same reason. The friction checks are in `check_*_friction()`;
// the SynapticLink write is in `create_synaptic_link()`, which is not an extern
// at all.
//
// ONE LEVEL WAS TRIED FIRST AND IS NOT ENOUGH — the depth was not a detail to
// state and move on from, it was wrong. `create_critique` reaches the
// SynapticLink friction pre-check through TWO hops (`create_synaptic_link` ->
// `check_synaptic_link_friction`), so at depth one that rule matched no
// pre-check and dropped out of this analysis silently, which is the failure
// shape that is hardest to notice: not a wrong answer, an absent one. Going
// transitive removes the judgement rather than restating its bound.
//
// The risk of the closure being too BROAD is real and is bounded by what the
// match demands: a shadow needs the same condition expression as the rule, or a
// curated entry naming the exact message, so inheriting an unrelated helper's
// guards cannot manufacture one.
const reachCache = new Map();
function reachableFns(fnName) {
  if (reachCache.has(fnName)) return reachCache.get(fnName);
  const out = [];
  const seen = new Set();
  const stack = [fnName];
  while (stack.length) {
    const name = stack.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    const fn = coordFnByName.get(name);
    if (!fn) continue;
    out.push(fn);
    for (let i = fn.start; i < fn.end; i++) {
      for (const c of coordLines[i].matchAll(/\b([a-z_0-9]{4,})\s*\(/g)) {
        if (!seen.has(c[1]) && coordFnByName.has(c[1])) stack.push(c[1]);
      }
    }
  }
  reachCache.set(fnName, out);
  return out;
}

const externGuards = new Map();
for (const e of externs) {
  externGuards.set(e.fn, reachableFns(e.fn).flatMap((f) => guardsIn(f)));
}

// Which externs WRITE a given link type, so a LINK rule can be checked for a
// pre-check and a bypass the same way an entry rule is.
//
// Matching every line that merely NAMES a LinkTypes variant was the first cut
// and it was wrong in a way that invented bypasses: `get_links` names the same
// variant to READ it, so `find_synaptic_link` and
// `get_twitter_replies_for_claim` were recorded as write paths and then — being
// reads, with no pre-check to carry — offered as the raw-write bypass for a
// friction rule. The variant must appear as an argument to `create_link`.
//
// THE TEST IS "CALLS create_link AND NAMES THE VARIANT", not "names the variant
// near a create_link". Requiring proximity was the second cut and it dropped
// the one bypass that matters most: `attempt_false_attachment_link` resolves
// its link type through a `match` over `AttachmentLinkKind` twenty lines above
// its single `create_link`, so every variant it can write sat outside the
// window — which reported the three LINK friction rules as having no raw-write
// path when the prober written for exactly that purpose does.
//
// THE `create_link` AND THE VARIANT MUST BE IN THE SAME FUNCTION. Taking both
// from anywhere in the transitive closure was the third cut and it invented
// bypasses again, in a subtler way than the first: `get_discourse_health` and
// `is_agent_attested` READ `LinkTypes::Reinforcement`, and somewhere else in
// their closure sits an unrelated `create_link`, so the two halves met across
// two functions and three read-only externs were offered as raw-write paths for
// a friction rule. Resolving writes per function first, and only then unioning
// over the closure, keeps the closure's reach without its ambiguity.
const fnLinkWrites = new Map();
for (const fn of coordFns) {
  const body = coordLines.slice(fn.start - 1, fn.end).join('\n');
  if (!/create_link\s*\(/.test(body)) continue;        // a reader, not a write path
  const vs = new Set([...body.matchAll(/LinkTypes::([A-Za-z_0-9]+)/g)].map((m) => m[1]));
  if (vs.size) fnLinkWrites.set(fn.name, vs);
}
const linkWritePaths = new Map();
for (const e of externs) {
  for (const f of reachableFns(e.fn)) {
    for (const v of fnLinkWrites.get(f.name) ?? []) {
      const list = linkWritePaths.get(v) ?? new Set();
      list.add(e.fn);
      linkWritePaths.set(v, list);
    }
  }
}

const normCond = (c) => (c ?? '')
  .replace(/^if\s+/, '')
  .replace(/\s*\{$/, '')
  .replace(/_VALIDATION\b/g, '')
  .replace(/\.clone\(\)/g, '')
  .replace(/\bref\s+/g, '')
  .replace(/[&\s]/g, '');

// Shadowed rules whose pre-check is NOT the same expression. Each names the
// extern and the message that fires instead; both are verified to exist.
const SHADOWED_BY_PRECHECK = {
  'Membrane\'s constitution hash does not resolve to a Constitution entry.': {
    fn: 'create_membrane',
    refuses_with: 'Referenced entry is not a Constitution.',
    why: 'the same refusal written two ways — `let Some(c) = .. else` in the validator, '
      + '`.ok_or(wasm_error!(..))` on a `get` + `to_app_option` in the extern.',
  },
  'Membrane creator must match action author.': {
    fn: 'create_membrane',
    refuses_with: 'Membrane constitution must be the creator\'s own published Constitution.',
    why: 'shadowed by ORDERING rather than by a twin: forging the creator means naming '
      + 'somebody else, so the extern\'s constitution-ownership check fires first and the '
      + 'payload is refused on a DIFFERENT rule. Observed that way in 5b.',
  },
};

// Guards consumed as a shadow, by `fn:line`, so the inverse sweep below can
// tell a pre-check that mirrors a rule from one that has no rule at all.
const shadowHits = new Set();

const shadowMiss = [];
for (const [msg, decl] of Object.entries(SHADOWED_BY_PRECHECK)) {
  if (!sites.some((s) => s.message === msg)) shadowMiss.push(`no site has message ${JSON.stringify(msg)}`);
  else if (!(externGuards.get(decl.fn) ?? []).some((g) => g.msg === decl.refuses_with)) {
    shadowMiss.push(`${decl.fn} has no guard refusing with ${JSON.stringify(decl.refuses_with)}`);
  }
}
if (shadowMiss.length) {
  console.error('\nSHADOW DECLARATION STALE: SHADOWED_BY_PRECHECK names something that is no');
  console.error('longer there. A shadow claim nobody can check is exactly the wrong denominator.\n');
  for (const m of shadowMiss) console.error(`  ${m}`);
  process.exit(1);
}

for (const s of sites) {
  if (!['honest', 'crafted'].includes(s.class)) continue;

  // The externs that could carry this payload, and the raw-write paths that
  // skip their checks. A bypass is an extern writing the same thing with no
  // refusing guard reachable from it at all.
  const writers = s.link_type
    ? [...(linkWritePaths.get(s.link_type) ?? [])]
    : (s.entry ? (writePaths.get(pascal(s.entry)) ?? []).map((w) => w.fn) : []);
  if (!writers.length) continue;

  const ordinary = writers.filter((f) => !/^attempt_/.test(f));
  const declared = SHADOWED_BY_PRECHECK[s.message];
  let hit = null;
  for (const f of ordinary) {
    for (const g of externGuards.get(f) ?? []) {
      if (declared ? (f === declared.fn && g.msg === declared.refuses_with)
                   : (g.cond && normCond(g.cond) === normCond(s.guard))) { hit = g; break; }
    }
    if (hit) break;
  }
  if (!hit) continue;
  shadowHits.add(`${hit.fn}:${hit.line}`);

  // A BYPASS IS A WRITE PATH THAT DOES NOT CARRY *THIS* PRE-CHECK, not one
  // that carries no checks at all. Requiring a guard-free extern was the first
  // cut and it rejected the real bypasses: `attempt_false_attachment_link`
  // reaches a hash-parsing helper that refuses with its own message, so it
  // looked guarded, while being exactly the raw-write path its doc comment says
  // it is. What disqualifies an extern is refusing the SAME condition.
  const bypass = writers.filter((f) => !(externGuards.get(f) ?? []).some(
    (g) => (declared ? g.msg === declared.refuses_with
                     : (g.cond && normCond(g.cond) === normCond(s.guard))),
  ));
  s.shadowed_by = {
    extern: hit.fn,
    refuses_with: hit.msg,
    matched: declared ? 'curated' : 'identical condition',
    ...(declared ? { why: declared.why } : {}),
    bypass: bypass.length ? bypass : null,
  };
  if (bypass.length) {
    s.enforcement_caveat = [s.enforcement_caveat, `the coordinator refuses this payload FIRST — `
      + `${hit.fn} returns ${JSON.stringify(hit.msg)} — so a case driven through it passes on the `
      + `courtesy rather than the enforcement. Assert it through ${bypass.join('/')}, which carries `
      + `no pre-check.`].filter(Boolean).join(' ALSO: ');
  } else {
    // Nothing writes this without the pre-check, so no case can make the
    // validator's message appear. Out of the denominator.
    s.class = 'shadowed';
  }
}

// ============================================================================
// --- THE INVERSE SWEEP, which 5e did not ask for and which falls out of the
// same comparison for free.
//
// Shadowing is a pre-check WITH a validation twin, where the twin is the thing
// that cannot be reached. The opposite arrangement is a pre-check with NO twin
// — a condition the coordinator refuses and no validating peer checks — and
// that is not a testing gap, it is an ENFORCEMENT gap: a custom client skips
// the coordinator and the condition is simply not enforced.
//
// THIS REPOSITORY HAS SHIPPED THAT DEFECT TWICE, which is why the sweep is
// worth keeping rather than running once. `create_membrane` carried all three
// accountability checks while `validate_membrane` checked neither the
// constitution nor the promises — and its comment claimed to be "mirroring
// validate_membrane's DHT-enforced rule (the real enforcement layer,
// unbypassable by a custom client)" while that function did no such thing. The
// burn tier was the same shape: a pre-check asserting a validation twin that
// did not exist. Both are recorded in the zomes' own comments.
//
// WHAT THIS LIST IS AND IS NOT. It is every conditional refusal reachable from
// an extern that WRITES, whose condition matched no rule of the entry or link
// type it writes. That is a candidate list, not a defect list: a pre-check may
// legitimately have no twin because it guards a coordinator-only concern (a
// malformed link tag being read back), or because the field it guards is
// derived and the commitment is verified another way. Deciding which is which
// needs a reader, so the tool reports and does not classify — the same split
// 5d and 5e already use for the half that is not mechanical.
//
// THE WRITE TEST IS THE EXTERN'S OWN BODY, deliberately, and it is the one
// place here that does NOT use the transitive closure. Asking whether the
// closure reaches a writer makes every read a write path: `get_discourse_health`
// reaches `effective_conductance_with_half_life` legitimately, and from there
// the graph keeps going, so three read-only externs reported the same
// conductance-tag guard as an enforcement gap. A guard on a pure read cannot be
// one — nothing is being written for a peer to fail to check. Reachability is
// the right question for finding a guard and the wrong one for deciding whether
// a write happened.
//
// Deduplicated by the guard itself rather than per extern, since one helper is
// reached by many externs and the guard is one fact.
// PRE-CHECKS WITH NO VALIDATION TWIN THAT HAVE BEEN READ AND DECIDED.
//
// READINESS item 20 asked for "three readings and a decision each", and this
// is where the readings live so they do not have to be redone on every run.
// The list above is a CANDIDATE list — the tool reports conditions and cannot
// read the comments beside them, which is why all three of these were flagged
// while two already carried their reasoning in the source four lines away.
//
// Same discipline as `check-harness-counts.mjs`'s `EXEMPT`: carved out
// explicitly with a stated reason rather than quietly filtered, because a
// thing left out of a check needs a reason or it is just a gap. And a stale
// acknowledgement is worse than none — if one of these stops matching a real
// site, this file EXITS 1 rather than silently acknowledging nothing.
//
// Keyed by extern name and refusal-message prefix, NOT by line number: these
// move whenever anything above them is edited, which is a lesson this corpus
// has already paid for once.
const ACKNOWLEDGED = [
  {
    in_fn: 'assert_expertise',
    refuses_with: 'Can only assert expertise backed by your own WorldlineTrace.',
    verdict: 'courtesy, deliberately — already decided in the source',
    reading:
      'NOT A GAP, and it was never an open question: the twelve lines above this '
      + 'check say so explicitly ("A COURTESY, NOT AN ENFORCED RULE, and '
      + 'deliberately so"), name the reason, and state the condition for '
      + 'revisiting. What it builds is an ordinary Claim, so validate_claim '
      + 'governs it and has no notion of traces; a client bypassing the extern '
      + 'can cite anybody\'s. That is tolerable because an expertise assertion '
      + 'carries NO STANDING — a self-asserted, critiquable Claim in a '
      + 'non-authoritative index. SPEC §5.21. THE REVISIT TRIGGER IS WRITTEN '
      + 'INTO THE COMMENT: any future mechanism that gives these claims weight '
      + 'has to add the validation first.',
  },
  {
    in_fn: 'pre_register',
    refuses_with: 'prediction must not be empty',
    verdict: 'no twin is POSSIBLE, and the condition is the wrong boundary',
    reading:
      'A TWIN CANNOT EXIST HERE AT ANY protocol_version. The field lives in '
      + 'SealedPrediction, this zome\'s only private entry, and the integrity '
      + 'zome already says at the arm where the rule would go that "a private '
      + 'entry\'s content is not available here" — hdi delivers None for the '
      + 'body. So no peer ever sees the prediction at commit time. The content '
      + 'IS public at reveal, so the rule could in principle live in '
      + 'validate_revelation instead — and should not, for two measured '
      + 'reasons. (1) "Not empty" is a proxy for "not vacuous" and the proxy '
      + 'does not hold: `prediction: "."` is accepted, revealed, and lands in '
      + 'get_foresight_record\'s `revealed` list indistinguishably from a real '
      + 'kept commitment. A rule would refuse the one input nobody would ever '
      + 'use. (2) NOTHING COUNTS revealed commitments — no `.revealed.length` '
      + 'anywhere in the UI, the SDK or the MCP server; every surface renders '
      + 'the prediction\'s own text, and the foresight tab says in its intro '
      + 'that there is no score on the page. The inflation a vacuous reveal '
      + 'would cause has no consumer. Leave as a courtesy; spend no bump.',
  },
  {
    in_fn: 'pre_register',
    refuses_with: 'salt must not be empty',
    verdict: 'no twin is possible, and the check\'s own purpose is not a rule',
    reading:
      'Same impossibility as the prediction check — private entry, content is '
      + 'None in validation. But this one fails at its OWN STATED PURPOSE in a '
      + 'way worth recording, because it is the item-14 shape again. The '
      + 'message says the salt exists so "a guessable prediction is [not] '
      + 'recoverable from its hash", and `salt: "."` is accepted: a '
      + 'one-character salt is as brute-forcible as none, so the check does not '
      + 'achieve what it claims even in the coordinator. THE ACHIEVABLE VERSION '
      + 'IS AN ENTROPY REQUIREMENT, AND NO VALIDATION RULE CAN CHECK ONE — '
      + 'entropy is a property of the process that generated a string, not of '
      + 'the string, so a validator cannot tell a well-chosen salt from a badly '
      + 'chosen one by inspection. Like reveal_deadline needing a clock hdi '
      + 'does not have, this is a goal that is not expressible as a '
      + 'deterministic rule over the data. And the exposure is the COMMITTER\'S '
      + 'OWN: a weak salt makes their own commitment recoverable and misleads '
      + 'nobody else. Leave as a courtesy; spend no bump.',
  },
];

const prechecksWithoutValidator = [];
{
  const byGuard = new Map();
  for (const e of externs) {
    const self = coordFnByName.get(e.fn);
    if (!self) continue;
    const ownBody = coordLines.slice(self.start - 1, self.end).join('\n');
    if (!/create_entry\s*\(|create_link\s*\(/.test(ownBody)) continue;
    for (const g of externGuards.get(e.fn) ?? []) {
      if (!g.cond) continue;                               // no condition to compare
      if (shadowHits.has(`${g.fn}:${g.line}`)) continue;   // mirrored by a rule
      const key = `${g.fn}:${g.line}`;
      if (!byGuard.has(key)) {
        byGuard.set(key, {
          in_fn: g.fn, line: g.line, condition: g.cond, refuses_with: g.msg, reached_by: [],
        });
      }
      byGuard.get(key).reached_by.push(e.fn);
    }
  }
  prechecksWithoutValidator.push(...byGuard.values());
}

// Match each reported pre-check against ACKNOWLEDGED, and refuse to run with a
// stale acknowledgement. The repository's rule for every other gate here: a
// check whose subject can vanish silently is not a check.
const ackFor = (p) => ACKNOWLEDGED.find(
  (a) => a.in_fn === p.in_fn && p.refuses_with.startsWith(a.refuses_with));
for (const p of prechecksWithoutValidator) {
  const a = ackFor(p);
  if (a) { p.acknowledged = true; p.verdict = a.verdict; p.reading = a.reading; }
}
const staleAck = ACKNOWLEDGED.filter(
  (a) => !prechecksWithoutValidator.some(
    (p) => p.in_fn === a.in_fn && p.refuses_with.startsWith(a.refuses_with)));
const unreadPrechecks = prechecksWithoutValidator.filter((p) => !p.acknowledged);

const byClass = { honest: 0, crafted: 0, deferred: 0, needs_prober: 0, needs_extern: 0, remote: 0, passthrough: 0, shadowed: 0 };
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
  // Published so `scripts/check-entry-type-confusion.mjs` can check its own
  // independently-derived pairs against these, and so a reader of the
  // inventory can see why two rules carry an `enforcement_caveat`.
  confusable_entry_reads: confusableEntryReads,
  // READINESS item 5e's inverse sweep: coordinator refusals with no validation
  // twin. A candidate list for a reader, not a defect list — see the note above
  // the computation.
  prechecks_without_validator: prechecksWithoutValidator,
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
console.log(`  shadowed ${String(byClass.shadowed).padStart(3)}      the coordinator pre-check refuses first and no raw-write path exists — see item 5e`);
console.log(`  remote   ${String(byClass.remote).padStart(3)}   needs a peer authoring a bad op — not reachable locally`);
console.log(`  (passthrough ${byClass.passthrough} — forwards another validator's result, no message of its own)`);
console.log(`\n  assertable as a REFUSAL from JavaScript: ${byClass.honest + byClass.crafted}`);
console.log(`  assertable only as a DEFERRAL:          ${byClass.deferred}`);
console.log(`  blocked on a coordinator change:  ${byClass.needs_prober + byClass.needs_extern}`   + ` (${byClass.needs_prober} link rules + ${byClass.needs_extern} entry rules)`);
if (unreadPrechecks.length) {
  console.log(`\n  ${unreadPrechecks.length} coordinator refusal(s) on a WRITE path with no validation twin and NO READING —`);
  console.log('  candidates for an enforcement gap, not findings. A custom client skips these:');
  for (const p of unreadPrechecks) {
    console.log(`    ${p.in_fn}:${p.line}  ${JSON.stringify(p.refuses_with.slice(0, 64))}`);
    console.log(`      reached by: ${p.reached_by.join(', ')}`);
  }
  console.log('  Read each one and add it to ACKNOWLEDGED in this file, or act on it.');
}

// Listed every run rather than hidden, so the decisions stay visible and a
// reader can disagree with one. READINESS item 20 carries them in full.
const ackd = prechecksWithoutValidator.filter((p) => p.acknowledged);
if (ackd.length) {
  console.log(`\n  ${ackd.length} of those have been READ AND DECIDED (READINESS item 20) —`);
  console.log('  no validation twin, on purpose, and none needs a protocol_version bump:');
  for (const p of ackd) {
    console.log(`    ${p.in_fn}:${p.line}  ${JSON.stringify(p.refuses_with.slice(0, 48))}`);
    console.log(`      ${p.verdict}`);
  }
}

console.log(`\nwrote ${OUT.replace(REPO + '/', '')}`);

// A STALE ACKNOWLEDGEMENT IS WORSE THAN NO ACKNOWLEDGEMENT, because it reads as
// a decision somebody made about code that is no longer there. If a pre-check
// was removed, or its message reworded, the entry must be removed or updated
// deliberately — not left pointing at nothing while the report still prints a
// reassuring verdict. Same reason check-harness-counts.mjs reds on CLAIM NOT
// FOUND rather than skipping.
if (staleAck.length) {
  console.log(`\n::error::${staleAck.length} stale entr${staleAck.length === 1 ? 'y' : 'ies'} in ACKNOWLEDGED — each names a pre-check that no longer reports as having no validation twin:`);
  for (const a of staleAck) {
    console.log(`  ${a.in_fn}  ${JSON.stringify(a.refuses_with)}`);
  }
  console.log('  Either the check was removed, its message was reworded, or a validation twin now exists.');
  console.log('  Update or delete the entry in enumerate.mjs deliberately. See READINESS item 20.');
  process.exit(1);
}
