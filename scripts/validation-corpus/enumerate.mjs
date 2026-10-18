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
  if (/^validate_(create|delete)_link$/.test(v)) {
    const lt = linkBranch.get(site.line) ?? null;
    site.link_type = lt;
    if (lt === null) return 'remote';                      // the chain's fallthrough
    return PROBED_LINK_TYPES.has(lt) ? 'crafted' : 'needs_prober';
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
