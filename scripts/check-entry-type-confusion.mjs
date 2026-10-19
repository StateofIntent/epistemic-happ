#!/usr/bin/env node
// ============================================================================
// scripts/check-entry-type-confusion.mjs — READINESS.md item 16.
//
// CAN ONE ENTRY TYPE'S BYTES BE READ AS ANOTHER'S?
//
// WHY THIS EXISTS. `scripts/validation-corpus/` finding 10 found, by driving the
// obvious payload and watching it pass, that a `Claim`'s record deserialises
// into `Mew`: `to_app_option::<Mew>()` returns `Ok(Some(..))`, so
// `AgentToMew target is not a Mew.` never fires and the link commits. The rule
// reads as a type check and is not one.
//
// That was found by luck in a specific sense — one payload, one link type. The
// question it left is the one worth gating: **is any OTHER pair of entry types
// in this zome confusable the same way?** This answers it mechanically, and
// keeps answering it, because the answer changes whenever a field is added to
// an entry struct and nobody is thinking about this file.
//
// THE RULE IT APPLIES, and it is the empirical one rather than the one serde
// documents. Finding 10 established that a MISSING `Option` field is tolerated:
// `Mew` declares `reply_to` and `linked_claim`, a `Claim` carries neither, and
// the deserialise still succeeded. So:
//
//     A can be read from B  <=>  every NON-Option field of A exists in B
//                                with an identical declared type
//
// Extra fields in B are ignored, which is serde's default and is why the
// direction matters: a bigger struct can usually be read as a smaller one, not
// the other way round.
//
// LIVE vs LATENT, which is the distinction that makes this useful rather than
// alarming. A confusable pair only matters where some validation guard actually
// tries to read that type. So each pair is cross-referenced against the
// `to_app_option::<T>()` sites in the integrity zome:
//
//   LIVE    a guard reads the target type, so the confusion is reachable today
//   LATENT  nothing reads it, so the pair is a trap for a FUTURE guard
//
// A latent pair becoming live is exactly the change this gate exists to catch,
// and it is invisible in a diff that only adds a guard.
//
// WHAT IT DOES NOT CHECK, stated because the gap is bigger than the check. It
// reads declared Rust types textually; it does not reason about msgpack
// encoding, serde attributes, or whether two differently-named types are
// structurally compatible in some deeper sense. A green run means no NEW
// name-and-type overlap appeared. It is not proof that deserialisation is safe.
// ============================================================================
import { readFileSync } from 'node:fs';

const SRC = new URL('../dna/integrity/src/lib.rs', import.meta.url).pathname;
const src = readFileSync(SRC, 'utf8');

// The app entry types, taken from the EntryTypes enum rather than a hand list,
// so a new entry type is swept the moment it is defined.
const enumBlock = src.slice(src.indexOf('pub enum EntryTypes'));
const TYPES = [...enumBlock.slice(0, enumBlock.indexOf('\n}')).matchAll(/^\s{4}([A-Z][A-Za-z]*)\(/gm)]
  .map((m) => m[1]);

function fieldsOf(t) {
  const m = new RegExp(`pub struct ${t} \\{([\\s\\S]*?)\\n\\}`).exec(src);
  if (!m) return null;
  const out = new Map();
  for (const f of m[1].matchAll(/pub (\w+)\s*:\s*([^,\n]+)/g)) {
    out.set(f[1], f[2].trim().replace(/,$/, '').replace(/\s+/g, ''));
  }
  return out;
}

const FIELDS = new Map();
for (const t of TYPES) {
  const f = fieldsOf(t);
  if (f && f.size) FIELDS.set(t, f);
}

const isOption = (ty) => ty.startsWith('Option<');

// Can A be deserialised from B's bytes?
function readableAs(A, B) {
  if (A === B) return false;
  for (const [name, ty] of FIELDS.get(A)) {
    if (isOption(ty)) continue;
    const other = FIELDS.get(B).get(name);
    if (other === undefined || other !== ty) return false;
  }
  return true;
}

// Which types does validation actually try to READ out of a record?
const guarded = new Set(
  [...src.matchAll(/to_app_option::<([A-Za-z]+)>/g)].map((m) => m[1]),
);
// Two sites infer the type from the binding rather than a turbofish.
for (const m of src.matchAll(/let \w+\s*:\s*(?:Option<)?([A-Z][A-Za-z]*)>?\s*=\s*[^;]*to_app_option\(\)/g)) {
  guarded.add(m[1]);
}

// ---------------------------------------------------------------- the ledger
// Each known pair, with its status and WHY it is tolerable. A pair here that
// the zome no longer produces is stale and reds, on the same discipline the
// corpus applies to its declared-unreachable rules: an exemption outliving its
// reason is worse than no exemption.
const KNOWN = [
  {
    from: 'Claim', to: 'Mew', status: 'LIVE',
    why: 'corpus finding 10 — TWO live guard sites, which is more than this ledger first said. '
       + '(1) AgentToMew reads Mew, so an agent may index its OWN Claim under its own AgentToMew '
       + 'anchor and get_mews_by_agent returns a Claim to a reader expecting a Mew. (2) The shared '
       + 'BridgeRecord guard computes is_mew with to_app_option::<Mew>(), so a CLAIM base passes as '
       + 'a Mew and "A MewToBridgeRecord link\'s base is not a Mew." CANNOT FIRE — a claim\'s mirror '
       + 'can be filed under the Mew link type, which is the reverse of the harm its sibling rule '
       + 'names ("would make get_unbridged_claims answer about the wrong entry"). The sibling holds '
       + 'because this confusion is ONE-DIRECTIONAL: Claim carries domain/confidence/evidence_hashes/'
       + 'attestation_policy, which Mew does not, so a Mew never passes as a Claim. Both sites are '
       + 'bounded by their ownership rules, so neither is cross-agent. READINESS item 17 took the '
       + 'decision: ACCEPT the confusion and reclassify, rather than add a discriminant field and '
       + 'change the DNA hash — so both affected rules now carry an `enforcement_caveat` in the '
       + 'corpus inventory, and this pair is permanent. Item 16 was the sweep that found the '
       + 'second site.',
  },
  {
    from: 'Revelation', to: 'SealedPrediction', status: 'LATENT',
    why: 'found by this sweep, not by a probe. NOTHING reads SealedPrediction via to_app_option, and '
       + 'the commitment is verified by recomputing hash_entry(SealedPrediction{..}) and comparing '
       + 'bytes rather than by reading a type — so a Revelation, whose bytes differ, cannot stand in '
       + 'for one. It is a trap for a future guard, not a defect today.',
  },
];

// ---------------------------------------------------------------- the report
let failures = 0;
const fail = (msg, detail) => { failures++; console.log(`  FAIL: ${msg}`); if (detail) console.log(`        ${detail}`); };
const pass = (msg) => console.log(`  ok  : ${msg}`);

console.log(`${FIELDS.size} app entry types swept, ${guarded.size} read by a validation guard\n`);

const found = [];
for (const B of FIELDS.keys()) {
  for (const A of FIELDS.keys()) {
    if (readableAs(A, B)) found.push({ from: B, to: A, live: guarded.has(A) });
  }
}

console.log('--- confusable pairs: X\'s bytes can be read as Y ---');
if (!found.length) console.log('  (none)');
for (const p of found) {
  console.log(`  ${p.from} -> ${p.to}   ${p.live ? 'LIVE (a guard reads it)' : 'LATENT (nothing reads it)'}`);
}
console.log('');

const key = (p) => `${p.from}->${p.to}`;
const knownKeys = new Set(KNOWN.map(key));
const foundKeys = new Set(found.map(key));

console.log('--- against the ledger ---');
for (const p of found) {
  if (!knownKeys.has(key(p))) {
    fail(`NEW confusable pair: ${key(p)}`,
      `${p.from}'s bytes can be read as ${p.to}. ${p.live
        ? 'A guard READS ' + p.to + ', so this is reachable NOW — find which rule it defeats, the way corpus finding 10 did for Claim->Mew.'
        : 'Nothing reads ' + p.to + ' yet, so it is latent — add it to KNOWN with that reasoning, or change the structs.'}`);
  }
}
for (const k of knownKeys) {
  if (!foundKeys.has(k)) fail(`stale ledger entry: ${k} is no longer confusable`,
    'the structs changed and this exemption outlived its reason — delete it rather than leaving it to look like coverage');
}
if (!failures) pass(`every confusable pair is a known one (${found.length}), and every known one is still real`);

// A LATENT pair that has become LIVE is the change most likely to be missed,
// because it appears in a diff as a new guard rather than as a new pair.
for (const p of found) {
  const k = KNOWN.find((x) => key(x) === key(p));
  if (k && k.status === 'LATENT' && p.live) {
    fail(`${key(p)} was LATENT and is now LIVE`,
      `something now reads ${p.to} via to_app_option. The ledger says why this was tolerable while nothing read it; that reason no longer holds.`);
  }
}

// --- AND AGAINST THE INVENTORY, which derives the same pairs from the same
// zome by its own parse. Two independent derivations that must agree is
// stronger than one shared copy: this file gates a NEW pair, the inventory
// annotates the rules an existing pair costs, and if they ever disagree one of
// the two parsers is wrong and both conclusions are suspect. Soft-skipped when
// the inventory is absent, because this gate must stay runnable on its own.
try {
  const inv = JSON.parse(readFileSync(new URL('validation-corpus/corpus/inventory.json', import.meta.url).pathname, 'utf8'));
  if (!Array.isArray(inv.confusable_entry_reads)) {
    fail('the inventory publishes no confusable_entry_reads',
      'enumerate.mjs is older than this check — regenerate it, or the annotation on the affected rules is missing');
  } else {
    const mine = new Set(found.map((p) => `${p.from}->${p.to}`));
    const theirs = new Set(inv.confusable_entry_reads.map((p) => `${p.from}->${p.to}`));
    const onlyMine = [...mine].filter((k) => !theirs.has(k));
    const onlyTheirs = [...theirs].filter((k) => !mine.has(k));
    if (onlyMine.length || onlyTheirs.length) {
      fail('this check and the inventory disagree about which pairs are confusable',
        `only here: ${onlyMine.join(', ') || '(none)'} | only in the inventory: ${onlyTheirs.join(', ') || '(none)'}`
        + ' — two parsers of the same structs reached different answers, so neither conclusion can be relied on');
    } else {
      pass(`the inventory's independently-derived pairs agree (${theirs.size})`);
    }
  }
} catch (e) {
  if (e?.code !== 'ENOENT') throw e;
  console.log('  skip: corpus/inventory.json not present, so the cross-derivation check did not run');
}

console.log('');
for (const k of KNOWN) console.log(`  [${k.status}] ${k.from} -> ${k.to}\n      ${k.why}`);
console.log('');

if (failures) {
  console.log(`${failures} CHECK(S) FAILED.`);
  process.exit(1);
}
console.log('NO NEW ENTRY-TYPE CONFUSION: the overlap between entry structs is the known,');
console.log('reasoned set, and no latent pair has acquired a guard that makes it reachable.');
