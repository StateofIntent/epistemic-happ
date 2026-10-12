#!/usr/bin/env node
// ============================================================================
// scripts/validation-corpus/replay.mjs — DRIVE EVERY REACHABLE REJECTION AND
// ASSERT THE ZOME ACTUALLY REFUSES.
//
// Reads corpus/inventory.json (see enumerate.mjs), builds a VALID baseline
// payload per entry type, applies one mutation per site, and asserts the call
// is refused with that site's own message.
//
// WHY ONE MUTATION AT A TIME. A payload that violates two rules proves nothing
// about either: validation returns at the first failing check, so the message
// that comes back names whichever rule happens to sit earlier in the function.
// Every case here starts from a baseline that is known to COMMIT, and changes
// exactly one field — so a refusal naming a different rule is itself a failure,
// and is reported as one rather than being counted as a pass.
//
// WHY THE BASELINE IS ASSERTED FIRST. If the baseline does not commit, every
// case below it "passes" by being refused for the wrong reason, and the run is
// 46 green ticks that mean nothing. The baseline commit is check #1 for each
// entry type and the cases are skipped when it fails.
// ============================================================================

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AdminWebsocket, AppWebsocket } from '@holochain/client';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const INVENTORY = resolve(HERE, 'corpus/inventory.json');

const ADMIN_URL = process.env.EPI_ADMIN_URL ?? 'ws://localhost:8889';
const APP_URL = process.env.EPI_APP_URL ?? 'ws://localhost:8888';
const APP_ID = process.env.EPI_APP_ID ?? 'epistemic-resonance-happ';
const ROLE = 'epistemic';
const ZOME = 'epistemic_coordinator';

let pass = 0, fail = 0, skip = 0;
const failures = [];
const log = (s = '') => console.log(s);
function check(ok, label, detail) {
  if (ok) { pass++; log(`  PASS: ${label}`); }
  else { fail++; failures.push({ label, detail }); log(`  FAIL: ${label}`); if (detail) log(`        ${detail}`); }
}

// --- A well-formed hash that resolves to nothing.
//
// Holochain hashes are 39 bytes: a 3-byte type prefix, 32 bytes of digest, and
// 4 bytes of DHT location. The PREFIX IS PART OF THE TYPE, and getting it wrong
// does not produce the refusal under test — it produces a msgpack Deserialize
// error from the coordinator's extern before validation is ever reached, which
// a harness checking only "did it throw" would score as a pass. Building the
// first version of this file from an ActionHash for an EntryHash field is
// exactly that mistake, and it is why these are explicit constants.
const HASH_PREFIX = {
  entry: [0x84, 0x21, 0x24],   // uhCEk…
  action: [0x84, 0x29, 0x24],  // uhCkk…
  agent: [0x84, 0x20, 0x24],   // uhCAk…
};

function danglingHash(kind, seed = 0) {
  const prefix = HASH_PREFIX[kind];
  if (!prefix) throw new Error(`unknown hash kind: ${kind}`);
  const h = new Uint8Array(39);
  h.set(prefix, 0);
  for (let i = 3; i < 35; i++) h[i] = (i * 31 + seed * 7 + 11) & 0xff;
  // The trailing 4 bytes are the DHT location. Nothing on the write path
  // recomputes them for a hash arriving in a payload, so any value deserializes
  // — confirmed by the author-mismatch case, which reaches its rule with the
  // digest rewritten and the location left alone.
  h.set([0x00, 0x00, 0x00, 0x00], 35);
  return h;
}

const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
const token = (await admin.issueAppAuthenticationToken({ installed_app_id: APP_ID })).token;
const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });
const appInfo = await app.appInfo();
const myKey = appInfo.agent_pub_key;

// Zome calls from outside the launcher are signed, and the signing keypair has
// to be authorized per cell first — agent-sdk does the same at index.ts:181.
// Without it every call fails with "no signing credentials have been
// authorized", which looks exactly like a validation refusal to a harness that
// only checks "did it throw".
for (const roleCells of Object.values(appInfo.cell_info)) {
  for (const cell of roleCells) {
    const id = cell?.value?.cell_id;
    if (id) await admin.authorizeSigningCredentials(id);
  }
}

const call = (fn_name, payload) =>
  app.callZome({ role_name: ROLE, zome_name: ZOME, fn_name, payload });

async function refusal(fn_name, payload) {
  try { await call(fn_name, payload); return null; }
  catch (e) { return String(e?.message ?? e); }
}

const nowMicros = () => Date.now() * 1000;

log('=== validation corpus: replay ===');
log(`conductor ${APP_URL}  app ${APP_ID}`);
const inv = JSON.parse(readFileSync(INVENTORY, 'utf8'));
log(`inventory: ${inv.total_sites} sites, protocol_version ${inv.protocol_version}`);
log('');

// ---------------------------------------------------------------- Claim
log('--- Claim: baseline, then one mutation per rule ---');
const claimBaseline = () => ({
  content: 'corpus baseline claim',
  domain: 'CorpusDomain',
  author: myKey,
  timestamp: nowMicros(),
  evidence_hashes: [],
  confidence: 'Moderate',
  semantic_tags: [],
  source_mew: null,
});

let baselineClaimHash = null;
try {
  baselineClaimHash = await call('create_claim', claimBaseline());
  check(true, 'baseline Claim commits — the mutations below start from something valid');
} catch (e) {
  check(false, 'baseline Claim commits', String(e?.message ?? e).slice(0, 300));
}

if (baselineClaimHash) {
  const cases = [
    {
      rule: 'Claim content cannot be empty.',
      mutate: (c) => { c.content = ''; },
    },
    {
      rule: 'Claim domain cannot be empty.',
      mutate: (c) => { c.domain = ''; },
    },
    {
      rule: 'Claim author must match action author.',
      mutate: (c) => { c.author = danglingHash('agent', 1); },
    },
    // These two are classed `deferred`, not `honest`: the guard is a
    // must_get_entry, so a missing dependency abandons validation with
    // unresolved dependencies instead of returning Invalid. What is asserted
    // is therefore the real behaviour — the write STALLS, retryably — and the
    // site's own message is asserted NOT to appear, because a build where it
    // did would mean the semantics had changed.
    {
      rule: 'Claim evidence hash not found.',
      expect: 'deferral',
      mutate: (c) => { c.evidence_hashes = [danglingHash('entry', 2)]; },
    },
    {
      rule: 'Claim source_mew not found.',
      expect: 'deferral',
      mutate: (c) => { c.source_mew = danglingHash('entry', 3); },
    },
  ];

  for (const c of cases) {
    const p = claimBaseline();
    c.mutate(p);
    const err = await refusal('create_claim', p);
    const kind = c.expect ?? 'refusal';

    if (err === null) {
      check(false, `${kind}: ${c.rule}`, 'the call COMMITTED — nothing stopped this payload');
      continue;
    }
    if (kind === 'refusal') {
      check(err.includes(c.rule), `refused: ${c.rule}`,
        err.includes(c.rule) ? null : `stopped for a different reason: ${err.slice(0, 180)}`);
      continue;
    }
    // kind === 'deferral'
    const deferred = /DepMissingFromDht|may be retried|unresolved dependenc/i.test(err);
    const messageAppeared = err.includes(c.rule);
    check(deferred && !messageAppeared,
      `deferred (not refused): ${c.rule}`,
      deferred && !messageAppeared ? null
        : messageAppeared
          ? `the Invalid branch FIRED — must_get_* semantics have changed, update SPEC §5.3 and this corpus`
          : `expected a retryable dependency stall, got: ${err.slice(0, 180)}`);
  }
}

log('');
log(`${pass} passed, ${fail} failed, ${skip} skipped`);
if (failures.length) {
  log('');
  log('failures:');
  for (const f of failures) log(`  - ${f.label}${f.detail ? `\n      ${f.detail}` : ''}`);
}
process.exit(fail === 0 ? 0 : 1);
