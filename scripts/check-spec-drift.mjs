#!/usr/bin/env node
// ============================================================================
// scripts/check-spec-drift.mjs — does SPEC.md §10 still list the functions
// that actually exist?
//
// WHY THIS EXISTS. `SPEC.md` is a hand-maintained snapshot of the commit named
// at its own top, and §11 says so. That is honest, and it is also the exact
// arrangement in which a document drifts: nothing fails when a function is
// added, renamed or deleted and the specification is not touched. This
// repository has now corrected the same class of defect by hand three times in
// one day — a §2.3 claim of a security property the code does not provide, and
// two changelog entries asserting a past that had stopped being true — each
// found by somebody reading carefully, and nothing preventing a recurrence.
// This converts the narrowest slice of that into something CI notices.
//
// WHAT IT CHECKS, AND NOTHING MORE. That the set of `#[hdk_extern]` functions
// in the coordinator zome equals the set of functions listed in §10's tables.
// Both directions matter and they fail differently:
//
//   An extern missing from §10 is an undocumented protocol surface — a call a
//   client can make that the specification does not admit exists.
//
//   A §10 row with no extern behind it is worse, because it is a specification
//   describing something that cannot be called. An implementer building
//   against it writes code against a function that is not there.
//
// WHAT IT DOES NOT CHECK, stated here because the gap is larger than the
// check. §10 is a name-and-signature reference; most of `SPEC.md` is MUST and
// SHOULD rules about validation. **One of those rules is now checked** — §5.2's
// author binding, below — and the rest are not: §5.1, §5.3 and every per-type
// rule in §2 remain prose. A green run means the function list agrees and that
// one rule holds. It does not mean the specification is verified, and this file
// must not be cited as if it did — that would be the same shape of overclaim
// §2.3 was just corrected for.
//
// WHY IT READS TABLES AND NOT EVERY BACKTICK. §10's normative content is its
// `| Function | Payload | Returns |` tables. Its prose legitimately names
// things that are not externs: HDK builtins (`get_links`), admin calls
// (`update_coordinators`), and — the case that matters — functions that were
// specified once and REMOVED, which §10 records rather than deleting. Scraping
// every backtick would flag that honesty as drift and push the document toward
// forgetting its own history, so the parser reads rows and leaves prose alone.
//
// ----------------------------------------------------------------------------
// AND SINCE THIS FILE ALREADY HAS THE EXTERN SET, IT ALSO COUNTS THE SURFACE.
//
// README.md §9 tracks how many coordinator functions the UI actually calls.
// That ratio has been wrong at least three times: reported as "12 of 56" for
// several increments because the metric regex only matched calls whose name
// sat on the same line as `callZome` and several wrap; then left at "37 of 58"
// in one paragraph while the headline above it had become correct again at
// "38 of 60"; and most recently a stale sentence naming a capability as
// unsurfaced a month after it shipped, which cost a session's work before
// anybody noticed. §9's own diagnosis is the right one: `check-spec-drift.mjs`
// computes the denominator on every push and "the numerator is the half
// nothing measures."
//
// So it measures the numerator too, and GATES on it. A hand recount that CI
// then enforces is not the mistake; a hand recount with nothing preventing
// recurrence is, and that is what this repository keeps paying for. Three
// further checks fall out of having both sets:
//
//   A `callZome` literal that is not an extern is a call to a function that
//   does not exist. §9 asserts "no call site names a function that does not
//   exist" — asserted by hand, until now.
//
//   A README ratio that disagrees with the real one fails the build, so the
//   number cannot quietly go stale between recounts.
//
//   And BOTH halves of §9's surfacing claim are checked rather than one. Every
//   unsurfaced extern must have a reason in the accounting table — and every
//   function the "Shipped so far:" sentence names must have a call site and be
//   a real extern. The residue half was gated first; leaving the shipped half
//   ungated left the direction nobody looks in unguarded, because a sentence
//   denying a screen gets found when somebody wants the feature, and a
//   sentence promising one that is gone does not get found at all.
//   This file printed "§9 carries a reason for each" for a long time without
//   testing it — a label claiming more than its assertion, which is the
//   defect this repository corrects most often, here in its own gate. The
//   residue had been itemised in prose and recounted by hand three times;
//   `get_protocol_version` was missed by all three. A table can be checked
//   where a paragraph cannot.
//
// WHAT COUNTS AS SURFACED is deliberately crude: at least one `callZome` call
// site naming the function as a string literal, anywhere under `mobile-ui/src`.
// It does NOT mean the function is well surfaced — §9 records a case where a
// function had a call site and was still half-surfaced, read-only where the
// write mattered. This is a reach metric, and the README says so; a check
// cannot tell a screen from a token call and must not imply it can.
//
// ----------------------------------------------------------------------------
// NEGATIVE EVIDENCE — all three new failures have been watched happening,
// because a gate nobody has seen go red is an assumption, not a check.
//
//   Injection: README's ratio edited to "41 of 60".
//   Result: red, naming both figures — says "41 of 60 coordinator functions",
//   measured 38 of 60.
//
//   Injection: a call site misspelled, `get_claims_by_dmoain`.
//   Result: red, and it names the file. Worth noting what this one proves:
//   the misspelling ALSO drops `get_claims_by_domain` into the unsurfaced
//   list, so the count check alone would have reported a plausible 37 of 60
//   and a one-function regression. The ghost check is what turns that into a
//   named typo instead of a number to be explained.
//
//   Injection: the gated sentence reworded so it states no ratio.
//   Result: red via SETUP FAILED rather than silently passing — the mode that
//   matters most, since a check that goes quiet when its subject disappears is
//   how the metric went unmeasured in the first place.
//
//   ----- and for the residue accounting, added later -----
//
//   Injection: `get_protocol_version`'s row deleted from §9's table.
//   Result: red, naming it. Chosen deliberately as the injection, because it
//   is not hypothetical: that function really did sit unsurfaced and
//   unaccounted for through three hand recounts of this residue, and was
//   found by somebody adding up a paragraph rather than by anything here.
//
//   Injection: a row added for `get_foresight_record`, which has a surface.
//   Result: red, "now surfaced" — the direction that catches accounting kept
//   after the thing it excuses has been built, which is how a residue list
//   grows reasons nobody rechecks.
//
//   Injection: a row added for `get_claim_by_vibes`, which does not exist.
//   Result: red, "not an extern".
//
//   Injection: the table's header reworded to `| Function | Note |`.
//   Result: red via SETUP FAILED, for the same reason as the ratio sentence
//   above — a gate whose subject can vanish silently is not a gate.
//
//   ----- and for the shipped half of §9's claim, added later -----
//
//   Injection: `get_grounding_path`'s call site renamed in `mobile-ui`, with
//   §9 still naming it as shipped.
//   Result: red, naming it — a sentence promising a screen that is not there.
//
//   Injection: `get_imaginary_thing` added to the shipped sentence.
//   Result: red, "names these as shipped and they are not externs".
//
//   THE FIRST ATTEMPT AT THAT SECOND INJECTION DID NOT FIRE, and the check was
//   right to stay green. The edit was aimed with a bare string replace and
//   landed on the FIRST `get_grounding_path` in the document — line 190, a §2
//   table — nowhere near §9's sentence. So it tested nothing and reported a
//   pass. Recorded because an injection that misses looks exactly like a gate
//   that works, and the only thing telling them apart is checking where the
//   edit landed.
//
//   Injection: "Shipped so far:" reworded to "Already done:".
//   Result: red via SETUP FAILED, same as the ratio sentence and the residue
//   table before it.
//
//   ----- and for SPEC §5.2's author binding, added later -----
//
//   Injection: `validate_claim`'s `if &claim.author != action.author()`
//   replaced with `if false`, so the arm exists and checks nothing.
//   Result: red, "Claim.author (validate_claim: NOT BOUND)".
//
//   AND THE INJECTED VERSION COMPILES, which is the premise this check rests
//   on rather than an aside. `cargo build --release --target
//   wasm32-unknown-unknown` finished clean, exit 0, with one warning — and the
//   warning only appeared because `action` became unused in that function. A
//   validator that still used the action for anything else would compile with
//   no warning at all. So rustc's exhaustive match guarantees an arm EXISTS
//   and says nothing about what it checks, and an entry type whose author is
//   forgeable ships green.
//
//   Not injected, because it cannot be done honestly in one edit: a NEW entry
//   type with an author field and no bind. The check covers it by construction
//   — it enumerates the structs rather than a fixed list — but that is reach,
//   not evidence, and is marked as such here.
//
//   Restored and re-run: green, exit 0, on all seven checks. The integrity
//   zome was rebuilt and repacked afterwards and the DNA hash is back to
//   uhC0keFcP2UoOwpAWpSNZp4gHfxalbVrV_aBQ8Fmi8U8b72kSp68Y, because an
//   injection into THIS zome leaves a different network behind if it is not.
//
// Run: node scripts/check-spec-drift.mjs
// Exits non-zero on drift, and names every difference in both directions.
// ============================================================================

import { readFileSync, readdirSync, statSync } from 'node:fs';

const ZOME = new URL('../dna/coordinator/src/lib.rs', import.meta.url).pathname;
const INTEGRITY = new URL('../dna/integrity/src/lib.rs', import.meta.url).pathname;
const SPEC = new URL('../SPEC.md', import.meta.url).pathname;
const UI = new URL('../mobile-ui/src', import.meta.url).pathname;
const README = new URL('../README.md', import.meta.url).pathname;

const log = (...a) => console.log(...a);

/** Every `#[hdk_extern] pub fn name` in the coordinator zome.
 *
 * The attribute and the signature are matched together rather than collecting
 * every `pub fn`: the zome has plenty of public helpers that are not protocol
 * surface, and a check that flagged those would train people to ignore it. */
function externs(source) {
  const found = new Set();
  const re = /#\[hdk_extern\][^\n]*\n(?:\s*(?:\/\/[^\n]*|#\[[^\]]*\])\n)*\s*pub fn\s+([a-z_0-9]+)/g;
  for (const m of source.matchAll(re)) found.add(m[1]);
  return found;
}

/** Every function named in the first column of a §10 function table.
 *
 * A table qualifies by its header — `| Function | ... |` — so a table of
 * entry fields or of anything else in the same section is not mistaken for a
 * function list. */
function documented(spec) {
  const lines = spec.split('\n');
  const start = lines.findIndex((l) => /^## 10\./.test(l));
  if (start === -1) throw new Error('SPEC.md has no "## 10." section — this check cannot run');
  let end = lines.findIndex((l, i) => i > start && /^## 11\./.test(l));
  if (end === -1) end = lines.length;

  const found = new Set();
  let inFunctionTable = false;
  for (const line of lines.slice(start, end)) {
    if (/^\|\s*Function\s*\|/i.test(line)) { inFunctionTable = true; continue; }
    if (!line.startsWith('|')) { inFunctionTable = false; continue; }
    if (/^\|\s*-+/.test(line)) continue;
    if (!inFunctionTable) continue;
    const cell = line.split('|')[1] ?? '';
    const name = cell.match(/`([a-z_0-9]+)`/);
    if (name) found.add(name[1]);
  }
  return found;
}

/** Every `.ts`/`.js` file under `mobile-ui/src`, recursively. */
function uiSources(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) uiSources(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Map of function name -> the UI files whose `callZome` calls name it.
 *
 * MATCHED ACROSS NEWLINES ON PURPOSE. The previous version of this metric
 * lived in a shell pipeline that required the name on the same line as
 * `callZome`, and under-reported for several increments because calls like
 *
 *     await connection.callZome<NeighborRecall[]>(
 *       'query_neighborhood_resonance', { ... },
 *
 * wrap. `[^(]*` skips the generic parameter without crossing into the argument
 * list, and `\s*` then crosses whatever newlines follow the paren.
 *
 * Only string literals count. `holochain.ts`'s own wrapper passes a variable
 * (`callZome(fnName, payload)`), which is the right thing to miss: it is the
 * transport, not a surface. */
function callSites(files) {
  const found = new Map();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/callZome[^(]*\(\s*['"`]([a-z_0-9]+)['"`]/gs)) {
      if (!found.has(m[1])) found.set(m[1], new Set());
      found.get(m[1]).add(file.replace(/^.*\/mobile-ui\//, 'mobile-ui/'));
    }
  }
  return found;
}

/** SPEC §5.3's referential integrity, per VALIDATOR rather than per field name.
 *
 * §5.3: every field typed as an `EntryHash` reference to another entry MUST
 * resolve to a real entry of the expected type. It names eight such fields, and
 * names exactly ONE exception — `Critique.evidence_hashes` — with three
 * paragraphs on why: nothing traverses it, `must_get_entry` is a deterministic
 * dependency fetch that DEFERS validation until the dependency has propagated,
 * and paying that on the protocol's most frequent act buys nothing.
 *
 * SO THE INTERESTING PROPERTY IS NOT "EVERY FIELD IS CHECKED" BUT "THE SET OF
 * EXCEPTIONS IS EXACTLY THE DOCUMENTED ONE". A new reference field added without
 * a cross-check is a silent ninth exception; so is somebody quietly removing an
 * existing check to make validation resolve faster. Either leaves §5.3 claiming
 * a guarantee the zome no longer provides, and `Membrane.constitution` is
 * precedent that the list does move — §5.3 records it as a former exception now
 * cross-checked.
 *
 * PER-VALIDATOR, BECAUSE `evidence_hashes` EXISTS ON TWO TYPES with opposite
 * answers: `Claim`'s is checked and `Critique`'s is the exception. A check keyed
 * on the field name alone cannot tell them apart and would report whichever it
 * found first — the "matched something adjacent to the thing" error this file
 * already records twice.
 *
 * AND THE BINDER IS TIED TO THE FIELD, not merely found nearby. The idiom is:
 *
 *     if let Some(h) = &mew.linked_claim {        // or: for h in &claim.evidence_hashes
 *         if must_get_entry(h.clone()).is_err() { ... Invalid ... }
 *
 * so the check captures the binding name from the field and then requires
 * `must_get_entry(<that same name>.clone())`. A nearby `must_get_entry` on an
 * unrelated hash does not satisfy it. Proximity counting was tried first and
 * reported 3 matches for a field checked once.
 *
 * rustc CANNOT see any of this: `must_get_entry` is a host call, calling it is
 * optional, and omitting it is not a type error. */
function referentialIntegrity() {
  const spec = readFileSync(SPEC, 'utf8');
  const src = readFileSync(INTEGRITY, 'utf8');

  // The field list, read out of §5.3's own first sentence rather than restated.
  const sect = spec.slice(spec.indexOf('### 5.3 Referential integrity'));
  const firstPara = sect.slice(0, sect.indexOf('\n\n'));
  const fields = [...new Set([...firstPara.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]))];

  // The documented exceptions, as `Type.field`, read out of §5.3 too.
  const exceptions = [...new Set(
    [...sect.slice(0, sect.indexOf('### 5.4')).matchAll(/`(\w+)\.([a-z_]+)`\s+is the one remaining exception/g)]
      .map((m) => `${m[1]}.${m[2]}`))];

  // Split the zome into validator bodies, keyed by the type each one validates.
  const validators = {};
  const re = /^fn (validate_[a-z_]+)\(\s*(\w+)\s*:\s*&(\w+)/gm;
  const marks = [...src.matchAll(re)];
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : src.length;
    validators[m[3]] = { fn: m[1], binding: m[2], body: src.slice(m.index, end) };
  });

  // ENUMERATE FROM THE STRUCT DEFINITIONS, NOT FROM THE VALIDATORS. Keying on
  // "validators that mention this field" leaves the exact hole this check
  // exists to close: a reference field whose validator ignores it entirely is
  // then invisible, which is a silent ninth exception. It also could not see
  // `Critique.evidence_hashes` — the one DOCUMENTED exception — because
  // `validate_critique` does not mention the field at all, so the exception
  // could quietly stop being one and nothing would notice.
  const structFields = {};
  for (const m of src.matchAll(/pub struct (\w+)\s*\{([^}]*)\}/g)) {
    structFields[m[1]] = fields.filter((f) => new RegExp(`\\bpub ${f}\\s*:`).test(m[2]));
  }

  const found = [];
  for (const [type, present] of Object.entries(structFields)) {
    const v = validators[type];
    for (const field of present) {
      if (!v) { found.push({ type, field, fn: '(no validator)', checked: false }); continue; }
      // TWO IDIOMS, BOTH REAL, and recognising only one produced three false
      // negatives on first run — `Retraction.target_claim`,
      // `BridgeRecord.mew_hash` and `ExternalCritique.linked_holochain_claim`
      // are all checked directly, with no intermediate binding. A gate with
      // false negatives fails CI on correct code, which is worse than no gate.
      //
      //   direct:    must_get_entry(record.mew_hash.clone())
      //   indirect:  if let Some(h) = &mew.linked_claim { must_get_entry(h.clone())
      //              for h in &claim.evidence_hashes    { must_get_entry(h.clone())
      //
      // The indirect form still ties the binder to the field rather than
      // accepting any nearby call.
      const direct = new RegExp(
        `must_get_entry\\(\\s*${v.binding}\\.${field}\\.clone\\(\\)`).test(v.body);
      const bind = v.body.match(new RegExp(
        `(?:if let Some\\(\\s*(\\w+)\\s*\\)\\s*=|for\\s+(\\w+)\\s+in)\\s*&?${v.binding}\\.${field}\\b`));
      const name = bind ? (bind[1] ?? bind[2]) : null;
      const indirect = name !== null
        && new RegExp(`must_get_entry\\(\\s*${name}\\.clone\\(\\)`).test(v.body);
      const checked = direct || indirect;
      found.push({ type, field, fn: v.fn, checked });
    }
  }
  return { fields, exceptions, found };
}

/** SPEC §6's temporal-friction table, against the numbers THREE separate places
 *  independently hardcode.
 *
 * §6 states five rate limits as a table — window and ceiling per act — and then
 * says: "Every row is an absolute cutoff. Nothing in this protocol can be
 * bought past." That is the strongest security claim in the document, because
 * friction is the only thing standing between this DHT and a sybil farm
 * mass-reinforcing its own conductance. §5.11 records that a purchasable tier
 * existed once and was removed.
 *
 * THE SAME FIVE NUMBERS LIVE IN THREE PLACES AND NOTHING COMPARES THEM:
 *
 *   SPEC §6's table                  — the documented cutoff
 *   dna/integrity  *_VALIDATION      — the ENFORCED cutoff (DHT validation)
 *   dna/coordinator *                — a courtesy pre-check (§5.21)
 *
 * and the only thing holding them equal is a comment. The integrity constants
 * say "must match coordinator's limit"; the coordinator's say "must match
 * integrity zome's limit". Two files politely asking a human to keep ten
 * literals in agreement.
 *
 * WHY rustc CANNOT. They are separate literals in separate crates with no
 * shared definition — there is nothing to type-check against. A coordinator
 * limit raised to 200 compiles, and so does an integrity limit lowered to 2.
 * Neither crate can see SPEC's table at all.
 *
 * AND THE TWO FAILURE DIRECTIONS ARE DIFFERENT, which is why this compares all
 * three rather than just the enforced pair:
 *
 *   coordinator HIGHER than integrity -> the client lets a write through and
 *   the DHT refuses it. A user is told their action succeeded locally and then
 *   finds it rejected by validation; §5.21's whole point is that the
 *   coordinator is a courtesy, so the courtesy becomes a lie.
 *
 *   coordinator LOWER than integrity -> the client refuses writes the protocol
 *   would have accepted, inventing a limit nobody specified.
 *
 *   SPEC disagreeing with either -> the documented cutoff is not the real one,
 *   and §6's "absolute cutoff" sentence is false about the number it names.
 *
 * Window units are compared in SECONDS, so "7 days" in the table and
 * `7 * 24 * 3600` in the zome are the same fact in two notations rather than a
 * drift — the check evaluates the product instead of matching the text. */
function frictionTable() {
  const spec = readFileSync(SPEC, 'utf8');
  const integrity = readFileSync(INTEGRITY, 'utf8');
  const coordinator = readFileSync(ZOME, 'utf8');

  // `| `Critique` creation | 1 hour | 20 | DHT (§5.15) + coordinator pre-check |`
  const rows = [...spec.matchAll(
    /^\|\s*`(\w+)`\s+creation[^|]*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|/gm)]
    .map((m) => ({ type: m[1], windowText: m[2].trim(), limit: Number(m[3]) }));

  const windowSecs = (text) => {
    const m = text.match(/^(\d+)\s*(hour|hours|day|days|minute|minutes)$/i);
    if (!m) return null;
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    return unit.startsWith('hour') ? n * 3600 : unit.startsWith('day') ? n * 86400 : n * 60;
  };

  // `7 * 24 * 3600` and `3600` are both just products of integers.
  const evalProduct = (expr) => {
    const parts = expr.split('*').map((x) => Number(x.trim()));
    return parts.some(Number.isNaN) ? null : parts.reduce((a, b) => a * b, 1);
  };

  const constIn = (src, name) => {
    const m = src.match(new RegExp(`const ${name}\\s*:\\s*\\w+\\s*=\\s*([^;]+);`));
    return m ? evalProduct(m[1]) : null;
  };

  const screaming = (t) => t.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

  return rows.map((r) => {
    const base = screaming(r.type);
    return {
      ...r,
      specWindow: windowSecs(r.windowText),
      dhtWindow: constIn(integrity, `${base}_WINDOW_SECS_VALIDATION`),
      dhtLimit: constIn(integrity, `${base}_MAX_PER_WINDOW_VALIDATION`),
      coordWindow: constIn(coordinator, `${base}_WINDOW_SECS`),
      coordLimit: constIn(coordinator, `${base}_MAX_PER_WINDOW`),
    };
  });
}

/** SPEC §5.1 and Invariant #6 — "nothing is deleted" — which is this
 *  protocol's headline promise and was checked by nothing at all.
 *
 * §5.1: "Any `RegisterDelete` operation is rejected outright." Invariant #6 is
 * the same rule stated as a principle. It is what the epistemic argument rests
 * on: a record that can vanish cannot carry its own history.
 *
 * TWO ARMS, NOT ONE, AND THEY DISAGREE — which is why this reads both:
 *
 *     FlatOp::Delete(_)                       => Invalid("Deletion is not permitted…")
 *     FlatOp::Link(OpLink::DeleteLink { .. }) => Valid
 *
 * §5.1 is written about entries ("every entry type without exception") and
 * validation implements exactly that, so the accepted link delete is not a
 * violation of §5.1. But Invariant #6 says "nothing is deleted" with no
 * qualification, and a `SynapticLink`'s own `CreateLink` action is deletable —
 * so a critique's conductance edge can be removed even though the `Critique`
 * entry it points at cannot. Checking the entry arm alone and printing
 * "Invariant #6 holds" would be #185's defect — a refusal claiming more than
 * it enforces — reproduced inside the checker written to catch it. Both arms
 * are read, the asymmetry is printed rather than smoothed over, and §5.1 now
 * records it in the document, since the zome cannot be annotated for free.
 *
 * NEITHER OBVIOUS INSTRUMENT CAN REACH EITHER ARM, which is why this one is
 * static and why that is worth writing down rather than apologising for.
 *
 *   rustc cannot. `FlatOp::Delete(_) => Ok(ValidateCallbackResult::Valid)`
 *   compiles perfectly — a one-line edit from refusing every deletion to
 *   permitting every deletion, and nothing about it is a type error.
 *
 *   A LIVE PROBE CANNOT, and this repository already paid to learn it. There is
 *   no delete path in the coordinator — zero `delete_entry`, zero
 *   `delete_link`, zero `DeleteInput`, no extern with `delete` in its name —
 *   so a harness has nothing to call. README §9 records what that produces: a
 *   probe for "a commitment cannot be updated" called an extern that does not
 *   exist while asserting the error contained `"not"`, which `"function not
 *   found"` satisfies. A guard scoring a pass against a function that was never
 *   there. Verifying a path is ABSENT is this file's job, because it enumerates
 *   what exists; a live call cannot establish it by being rejected.
 *
 * So: both arms must exist and each must still return what §5.1 documents.
 * Narrow, for a rule that carries a lot — and narrow beats absent. */
function noDeletion() {
  const src = readFileSync(INTEGRITY, 'utf8');
  const entry = src.match(
    /FlatOp::Delete\s*\([^)]*\)\s*=>\s*Ok\(\s*(ValidateCallbackResult::\w+)/);
  const link = src.match(
    /OpLink::DeleteLink\s*\{[^}]*\}\s*\)\s*=>\s*Ok\(\s*(ValidateCallbackResult::\w+)/);
  return {
    entryArm: entry ? entry[1] : null,
    linkArm: link ? link[1] : null,
  };
}

/** SPEC §5.2's author binding, which is the first VALIDATION RULE this file
 *  checks rather than a name list.
 *
 * §5.2: "For every entry type carrying an `author`/`agent`/`creator`/`proposer`
 * field, that field MUST equal the actual authoring action's real author."
 * A missing bind is forgery — an agent authoring an entry attributed to
 * somebody else — so it is worth more than a prose rule.
 *
 * WHY THE COMPILER DOES NOT ALREADY COVER THIS, which is the whole reason the
 * check earns its place. `validate_create_entry`'s match over `EntryTypes` has
 * no wildcard, so rustc refuses to build if a new entry type has no arm — that
 * part is genuinely gated already and nothing here duplicates it. What rustc
 * cannot see is what the arm DOES. A new entry type with an `author` field,
 * wired to a validator that checks everything except the binding, compiles
 * clean and ships a forgeable entry.
 *
 * ALL THIRTEEN BIND TODAY, measured when this was written, so this finds no
 * current defect and is not pretending to. It exists for the fourteenth.
 *
 * The comparison has to name the FIELD, not merely mention the action: an
 * earlier version of this check looked for any `.author()` call in the
 * validator and would have passed a validator that called it for some other
 * purpose entirely. */
function authorBinding() {
  const src = readFileSync(INTEGRITY, 'utf8');
  const structs = [...src.matchAll(/#\[hdk_entry_helper\][\s\S]*?pub struct (\w+) \{([\s\S]*?)\n\}/g)];
  if (structs.length === 0) return null;

  const AUTHORISH = ['author', 'agent', 'creator', 'proposer'];
  const snake = (n) => n.replace(/(?<!^)(?=[A-Z])/g, '_').toLowerCase();
  const out = [];

  for (const [, name, body] of structs) {
    const fields = [...body.matchAll(/^\s*pub (\w+):/gm)].map((m) => m[1]);
    const field = fields.find((f) => AUTHORISH.includes(f));
    if (!field) continue;

    const fn = `validate_${snake(name)}`;
    const m = src.match(new RegExp(`\\nfn ${fn}\\b[\\s\\S]*?\\n\\}`));
    if (!m) { out.push({ name, field, fn, status: 'no validator found' }); continue; }

    const bound = new RegExp(
      `\\.${field}\\s*!=\\s*[^\\n]*action\\.author\\(\\)`
      + `|action\\.author\\(\\)\\s*!=\\s*[^\\n]*\\.${field}`,
    ).test(m[0]);
    out.push({ name, field, fn, status: bound ? 'bound' : 'NOT BOUND' });
  }
  return out;
}

/** Every function §9 names in its "Shipped so far:" sentence.
 *
 * THE MIRROR OF `accountedFor`, AND THE HALF THAT WAS NOT CHECKED. That
 * function gates the functions §9 says have NO screen; this one gates the ones
 * it says DO. Both halves of the same claim, and only one of them was tested.
 *
 * This repository has already paid for the error in the other direction — §9
 * records "a stale sentence naming a capability as unsurfaced a month after it
 * shipped, which cost a session's work before anybody noticed". A sentence
 * naming something as SHIPPED that has quietly lost its call site fails the
 * same way and costs the same thing: it tells the next person a screen exists
 * when it does not, which is a worse lie than the reverse because nobody goes
 * looking.
 *
 * Reads one sentence by its exact opening, so the document can still discuss
 * shipping elsewhere without being gated on it. */
function shippedNames(readme) {
  const i = readme.indexOf('Shipped so far:');
  if (i === -1) return null;
  const sentence = readme.slice(i, readme.indexOf('\n', i));
  return [...sentence.matchAll(/`([a-z_0-9]+)`/g)].map((m) => m[1]);
}

/** Every function named in §9's unsurfaced-accounting table.
 *
 * SCOPED BY ITS HEADER, not by indentation. README.md has other two-column
 * tables whose first cell is a backticked identifier, and a parser that read
 * every one of them would gate rows that are not accounting for anything.
 *
 * WHY THIS TABLE IS GATED AT ALL. The residue was itemised in prose three
 * times and went stale three times — once badly enough that a function was
 * never accounted for at all, which a paragraph cannot notice about itself.
 * Below, the printed line "§9 carries a reason for each" was an assertion this
 * file did not test, which is the same overclaim its own harnesses keep being
 * corrected for. A table is gated where a paragraph cannot be. */
function accountedFor(readme) {
  const lines = readme.split('\n');
  const start = lines.findIndex((l) => /^\s*\|\s*Unsurfaced extern\s*\|/i.test(l));
  if (start === -1) return null;
  const found = new Set();
  for (const line of lines.slice(start + 1)) {
    if (!/^\s*\|/.test(line)) break;
    if (/^\s*\|\s*-+/.test(line)) continue;
    const cell = line.split('|')[1] ?? '';
    const name = cell.match(/`([a-z_0-9]+)`/);
    if (name) found.add(name[1]);
  }
  return found;
}

/** Every live "N of M coordinator functions" claim in README.md.
 *
 * READS ONE EXACT PHRASING, so the document can still carry its own history.
 * §9 deliberately keeps superseded figures ("38 of 58, residue 20") as a
 * record of what was recounted when, and a check that flagged those would
 * push the document toward forgetting how its own count went wrong. Only the
 * phrase used for a CURRENT claim is gated, which means a new copy of the
 * number is gated the moment it is written in that form. */
function statedRatios(readme) {
  return [...readme.matchAll(/(\d+) of (\d+) coordinator functions/g)].map((m) => ({
    text: m[0],
    surfaced: Number(m[1]),
    total: Number(m[2]),
  }));
}

const inCode = externs(readFileSync(ZOME, 'utf8'));
const inSpec = documented(readFileSync(SPEC, 'utf8'));

if (inCode.size === 0) {
  log('SETUP FAILED: no #[hdk_extern] functions found — the parser or the zome moved.');
  process.exit(1);
}
if (inSpec.size === 0) {
  log('SETUP FAILED: no function tables found in SPEC.md §10 — the parser or the section moved.');
  process.exit(1);
}

const undocumented = [...inCode].filter((f) => !inSpec.has(f)).sort();
const phantom = [...inSpec].filter((f) => !inCode.has(f)).sort();

log(`${inCode.size} externs in dna/coordinator/src/lib.rs`);
log(`${inSpec.size} functions listed in SPEC.md §10`);
log('');

if (undocumented.length > 0) {
  log('DRIFT — callable, but not in SPEC.md §10:');
  for (const f of undocumented) log(`  ${f}`);
  log('  A client can call these and the specification does not admit they exist.');
  log('');
}
if (phantom.length > 0) {
  log('DRIFT — in SPEC.md §10, but not callable:');
  for (const f of phantom) log(`  ${f}`);
  log('  Somebody implementing against §10 would write code against a function');
  log('  that is not there. If one was removed on purpose, say so in prose —');
  log('  this check reads tables, so a recorded removal does not trip it.');
  log('');
}

// ---------------------------------------------------------------------------
// The surface count. Computed here rather than by hand, for the reason the
// header gives: every previous figure was hand-derived and every one of them
// went stale between recounts.
// ---------------------------------------------------------------------------
const sites = callSites(uiSources(UI));
const surfaced = [...inCode].filter((f) => sites.has(f)).sort();
const residue = [...inCode].filter((f) => !sites.has(f)).sort();
const ghosts = [...sites.keys()].filter((f) => !inCode.has(f)).sort();
const stated = statedRatios(readFileSync(README, 'utf8'));

log(`${surfaced.length} of ${inCode.size} externs have a callZome call site in mobile-ui/src`);
log('');

// A call to a function that does not exist. Gated, because it is a real
// defect rather than a metric: the UI would throw at runtime on that path.
if (ghosts.length > 0) {
  log('DRIFT — called by the UI, but not an extern:');
  for (const f of ghosts) log(`  ${f}  (${[...sites.get(f)].sort().join(', ')})`);
  log('  These calls name a function the coordinator does not export. Either the');
  log('  extern was renamed or removed, or the call site has a typo — and the UI');
  log('  path that makes the call fails at runtime either way.');
  log('');
}

// The README's own claim about the ratio, verified rather than trusted.
const wrongRatios = stated.filter((r) => r.surfaced !== surfaced.length || r.total !== inCode.size);
if (stated.length === 0) {
  log('SETUP FAILED: README.md states no "N of M coordinator functions" ratio.');
  log('  This check gates that sentence, so its absence means the sentence moved');
  log('  or was reworded, and the count has gone unmeasured again.');
  log('');
} else if (wrongRatios.length > 0) {
  log('DRIFT — README.md states a surface count that is not the real one:');
  for (const r of wrongRatios) log(`  says "${r.text}", measured ${surfaced.length} of ${inCode.size}`);
  log('  Update the sentence to the measured figure. Do not hand-count — this');
  log('  check prints the number, and hand-counting is how it went wrong before.');
  log('');
}

// Printed on every run, green or red: the residue is what somebody has to
// have a reason for, and §9 itemises it. A list that appears only on failure
// is a list nobody reads while it is still correct.
log(`Unsurfaced (${residue.length}) — §9 carries a reason for each:`);
for (const f of residue) log(`  ${f}`);
log('');

// ---------------------------------------------------------------------------
// And that the sentence above is TRUE, which until now it merely claimed.
// Both directions fail differently, and the first is the one that actually
// happened: `get_protocol_version` sat unsurfaced and unaccounted for through
// three hand recounts of this residue.
// ---------------------------------------------------------------------------
const accounted = accountedFor(readFileSync(README, 'utf8'));
const unaccounted = accounted === null ? [] : residue.filter((f) => !accounted.has(f));
const staleRows = accounted === null
  ? []
  : [...accounted].filter((f) => !residue.includes(f)).sort();

if (accounted === null) {
  log('SETUP FAILED: README.md §9 has no "| Unsurfaced extern |" table.');
  log('  This check gates that table, so its absence means it moved or was');
  log('  reworded — and the residue has gone unaccounted for again, which is');
  log('  exactly how a function stayed off the books through three recounts.');
  log('');
} else {
  if (unaccounted.length > 0) {
    log('DRIFT — unsurfaced, and §9 gives no reason:');
    for (const f of unaccounted) log(`  ${f}`);
    log('  Each of these is a protocol surface with no screen and nothing saying');
    log('  why. Add a row to §9\'s table with the reason, or give it a surface.');
    log('');
  }
  if (staleRows.length > 0) {
    log('DRIFT — §9 accounts for functions that are not in the residue:');
    for (const f of staleRows) {
      log(`  ${f}  (${inCode.has(f) ? 'now surfaced' : 'not an extern'})`);
    }
    log('  A row explaining why something has no screen, for something that has');
    log('  one — or that no longer exists. Remove the row.');
    log('');
  }
}

// ---------------------------------------------------------------------------
// And the OTHER half of §9's surfacing claim. `accountedFor` above gates the
// functions it says have no screen; this gates the ones it says do. Two
// directions, failing differently:
//
//   Named as shipped with no call site: the sentence is stale, and it tells
//   the next person a screen exists when it does not — the error §9 records
//   costing a session's work, in the direction nobody goes looking in.
//
//   Named as shipped but not an extern at all: renamed or removed, and the
//   sentence outlived it.
// ---------------------------------------------------------------------------
const shipped = shippedNames(readFileSync(README, 'utf8'));
const shippedUnsurfaced = shipped === null ? [] : shipped.filter((f) => !sites.has(f));
const shippedPhantom = shipped === null ? [] : shipped.filter((f) => !inCode.has(f));

if (shipped === null) {
  log('SETUP FAILED: README.md §9 has no "Shipped so far:" sentence.');
  log('  This check gates that sentence, so its absence means it moved or was');
  log('  reworded — and the shipped half of the surfacing claim has gone');
  log('  unchecked again, which is the half nobody goes looking at.');
  log('');
} else {
  log(`§9 names ${shipped.length} functions as shipped; ${shipped.length - shippedUnsurfaced.length} have a call site.`);
  log('');
  if (shippedUnsurfaced.length > 0) {
    log('DRIFT — §9 says these are shipped, and nothing in mobile-ui calls them:');
    for (const f of shippedUnsurfaced) log(`  ${f}`);
    log('  Either the surface was removed and the sentence was not, or the call');
    log('  site was renamed. A sentence promising a screen that is not there is');
    log('  worse than one denying a screen that is, because nobody checks it.');
    log('');
  }
  if (shippedPhantom.length > 0) {
    log('DRIFT — §9 names these as shipped and they are not externs:');
    for (const f of shippedPhantom) log(`  ${f}`);
    log('  Renamed or removed in the zome, with the sentence left standing.');
    log('');
  }
}

// ---------------------------------------------------------------------------
// SPEC §5.2, and the first validation RULE this file checks rather than a name
// list. rustc already refuses a new entry type with no match arm; it cannot see
// whether the arm binds the author. That gap is where forgery would live.
// ---------------------------------------------------------------------------
const binding = authorBinding();
const unbound = binding === null ? [] : binding.filter((b) => b.status !== 'bound');

if (binding === null) {
  log('SETUP FAILED: no #[hdk_entry_helper] structs found in the integrity zome.');
  log('  The parser or the zome moved, so §5.2 has gone unchecked again.');
  log('');
} else {
  log(`§5.2 author binding: ${binding.length - unbound.length} of ${binding.length} entry types bind their author field to the action author.`);
  log('');
  if (unbound.length > 0) {
    log('DRIFT — an author-ish field that is not bound to the real action author:');
    for (const b of unbound) log(`  ${b.name}.${b.field}  (${b.fn}: ${b.status})`);
    log('  SPEC §5.2 requires that field to equal the authoring action\'s author.');
    log('  Unbound, an agent can author an entry attributed to somebody else, and');
    log('  rustc cannot catch it: the match arm exists, it just does not check.');
    log('');
  }
}

// ---------------------------------------------------------------------------
// SPEC §5.1 / Invariant #6. One line from refusing every deletion to permitting
// every deletion, and until now nothing would have noticed the difference.
// ---------------------------------------------------------------------------
const deletion = noDeletion();
const entryRefuses = deletion.entryArm === 'ValidateCallbackResult::Invalid';
const linkAccepts = deletion.linkArm === 'ValidateCallbackResult::Valid';

if (deletion.entryArm === null || deletion.linkArm === null) {
  const missing = deletion.entryArm === null ? '`FlatOp::Delete`' : '`OpLink::DeleteLink`';
  log(`SETUP FAILED: no ${missing} arm found in the integrity zome.`);
  log('  Either the arm is gone — in which case those deletes now fall to');
  log('  whatever the catch-all does — or the arm stopped being a plain');
  log('  `=> Ok(ValidateCallbackResult::_)` and this parser no longer reads it.');
  log('  Both need a human.');
  log('');
} else {
  if (!entryRefuses) {
    log('DRIFT — the entry Delete arm no longer refuses:');
    log(`  it returns ${deletion.entryArm}, and §5.1 rejects any entry delete`);
    log('  outright, for every entry type without exception. rustc cannot see');
    log('  the difference, and no live probe can reach it: there is no delete');
    log('  extern to call.');
    log('');
  }
  if (!linkAccepts) {
    log('DRIFT — the DeleteLink arm no longer accepts:');
    log(`  it returns ${deletion.linkArm}, while §5.1 documents link deletes as`);
    log('  accepted. Refusing them may well be the better rule, but it forks the');
    log('  DNA hash (§11.1) and §5.1 has to say so first. Code and document');
    log('  disagree either way round; that is what this file is for.');
    log('');
  }
  if (entryRefuses && linkAccepts) {
    log('§5.1 no-deletion: entry deletes refused, link deletes accepted — both as');
    log('  §5.1 documents. So Invariant #6 holds for entries, NOT for links: a');
    log('  `SynapticLink` edge is deletable, its `Critique` entry is not.');
  }
}

// ---------------------------------------------------------------------------
// SPEC §5.3's referential integrity. The property is not "every field is
// checked" but "the exceptions are exactly the documented ones".
// ---------------------------------------------------------------------------
const ref = referentialIntegrity();
const refUndocumented = ref.found
  .filter((f) => !f.checked && !ref.exceptions.includes(`${f.type}.${f.field}`))
  .map((f) => `${f.type}.${f.field} (${f.fn}) is not cross-checked and §5.3 does not except it`);
const refStaleException = ref.exceptions
  .filter((e) => { const f = ref.found.find((x) => `${x.type}.${x.field}` === e); return f && f.checked; })
  .map((e) => `${e} IS cross-checked now, but §5.3 still lists it as the exception`);
const refSetupFailed = ref.found.length === 0
  ? ['no (type, field) pairs found at all — §5.3\'s field list or the entry structs changed shape']
  : [];

if (refSetupFailed.length > 0) {
  log('SETUP FAILED — §5.3 referential integrity could not be read:');
  for (const m of refSetupFailed) log(`  ${m}`);
  log('');
} else if (refUndocumented.length > 0 || refStaleException.length > 0) {
  log('DRIFT — §5.3 and the validators disagree about what resolves:');
  for (const m of refUndocumented) log(`  ${m}`);
  for (const m of refStaleException) log(`  ${m}`);
  log('  §5.3 grants exactly one exception and explains at length why it is');
  log('  safe. A second one nobody wrote down is a guarantee the document');
  log('  claims and the zome does not provide — and an exception that quietly');
  log('  became checked leaves §5.3 describing a zome that no longer exists.');
  log('');
} else {
  const n = ref.found.length;
  log(`§5.3 referential integrity: ${n - ref.exceptions.length} of ${n} reference fields`);
  const ex = ref.exceptions.length;
  log(`  resolve their target, and the ${ex} that ${ex === 1 ? 'does' : 'do'} not ${ex === 1 ? 'is' : 'are'} exactly what`);
  log(`  §5.3 excepts (${ref.exceptions.join(', ')}).`);
}

// ---------------------------------------------------------------------------
// SPEC §6's friction table, against the integrity zome and the coordinator.
// Ten literals in three files held equal by a comment until now.
// ---------------------------------------------------------------------------
const friction = frictionTable();
const frictionBroken = [];
const frictionUnparsed = [];

if (friction.length === 0) {
  frictionUnparsed.push('no rows parsed out of §6 at all — the table moved or changed shape');
} else {
  for (const r of friction) {
    const missing = Object.entries({
      'the §6 window': r.specWindow, 'the DHT window': r.dhtWindow, 'the DHT limit': r.dhtLimit,
      'the coordinator window': r.coordWindow, 'the coordinator limit': r.coordLimit,
    }).filter(([, v]) => v === null).map(([k]) => k);
    if (missing.length > 0) { frictionUnparsed.push(`${r.type}: could not read ${missing.join(', ')}`); continue; }

    if (r.dhtLimit !== r.limit || r.dhtWindow !== r.specWindow) {
      frictionBroken.push(`${r.type}: §6 says ${r.limit} per ${r.windowText} `
        + `(${r.specWindow}s), DHT enforces ${r.dhtLimit} per ${r.dhtWindow}s `
        + `— the DOCUMENTED cutoff is not the enforced one`);
    }
    if (r.coordLimit !== r.dhtLimit || r.coordWindow !== r.dhtWindow) {
      const dir = r.coordLimit > r.dhtLimit
        ? 'the client will let writes through that validation then refuses, so §5.21\'s "courtesy" becomes a lie'
        : 'the client refuses writes the protocol would accept, inventing a limit nobody specified';
      frictionBroken.push(`${r.type}: coordinator ${r.coordLimit} per ${r.coordWindow}s vs `
        + `DHT ${r.dhtLimit} per ${r.dhtWindow}s — ${dir}`);
    }
  }
}

if (frictionUnparsed.length > 0) {
  log('SETUP FAILED — §6 friction could not be read:');
  for (const m of frictionUnparsed) log(`  ${m}`);
  log('  A number this check cannot find is a number it is not guarding. Fix the');
  log('  parser or the shape it reads, rather than leaving it quietly unchecked.');
  log('');
}
if (frictionBroken.length > 0) {
  log('DRIFT — SPEC §6 and the code disagree about a rate limit:');
  for (const m of frictionBroken) log(`  ${m}`);
  log('  §6 says "Every row is an absolute cutoff. Nothing in this protocol can');
  log('  be bought past." That sentence is only true while these agree.');
  log('');
}
if (friction.length > 0 && frictionBroken.length === 0 && frictionUnparsed.length === 0) {
  log(`§6 friction: ${friction.length} of ${friction.length} rows agree across SPEC, the`);
  log('  integrity zome and the coordinator — window and ceiling both.');
}

const countDrift = ghosts.length > 0 || stated.length === 0 || wrongRatios.length > 0
  || accounted === null || unaccounted.length > 0 || staleRows.length > 0
  || shipped === null || shippedUnsurfaced.length > 0 || shippedPhantom.length > 0
  || binding === null || unbound.length > 0
  || deletion.entryArm === null || deletion.linkArm === null
  || !entryRefuses || !linkAccepts
  || frictionBroken.length > 0 || frictionUnparsed.length > 0
  || refUndocumented.length > 0 || refStaleException.length > 0 || refSetupFailed.length > 0;

if (undocumented.length === 0 && phantom.length === 0 && !countDrift) {
  log('NO DRIFT: every extern is listed, every listed function exists, every UI');
  log('call names a real extern, README.md states the measured ratio, and every');
  log('unsurfaced extern has a reason in §9 — checked, not just claimed.');
  log('(§5.1, §5.2, §5.3 and §6 are checked now — four of SPEC\'s ~105 MUSTs.');
  log('The per-type rules in §2 are not, and a call site is reach, not proof a');
  log('function is well surfaced.)');
  process.exit(0);
}
process.exit(1);
