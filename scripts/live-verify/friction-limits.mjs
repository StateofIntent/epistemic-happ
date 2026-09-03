#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/friction-limits.mjs — asserts that SWO temporal
// friction is an ABSOLUTE per-agent limit (SPEC.md §5.11, §6): 20
// critiques, and therefore 20 SynapticLinks, per rolling hour, with no
// way to exceed it.
//
// This script has an instructive history. It was written to verify a
// burn-to-extend tier (free below 20, purchasable to a ceiling of 30
// against CreditBurns). Running it is what established the tier was
// unreachable: create_critique is the only way to create a
// SynapticLink, Critique creation carries its own hard 20/hour cap with
// no burn tier, and that cap is checked first. The tier was removed,
// and then the mutual-credit ledger it was the only consumer of was
// removed too. See docs/metabolic-biosignalling-currency-brief.md.
//
// It is kept because the property it asserts is the one that must not
// silently regress: throughput in this protocol is not purchasable by
// any means. If a future change makes it purchasable, these checks
// start failing, which is exactly when someone should be made to read
// that brief before proceeding.
//
// Prereqs: scripts/sandbox.sh start, against a CLEAN sandbox — friction
// is a rolling one-hour window over the agent's own source chain, so a
// resumed conductor carrying earlier critiques starts partway into the
// budget and makes every count below wrong.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
// This directory's own rule is that a harness which has only ever been
// green has not been shown to test anything. Recorded here, rather than
// only in a merged PR, so it is readable at the point someone runs this
// file.
//
//   Regression injected: raising the coordinator's CRITIQUE_MAX_PER_WINDOW to 25 while validation's stays 20.
//   Result: two FAILs — the refusal arrives from the SynapticLink budget instead of the Critique one, which is exactly the layer distinction this file exists to prove.
//
// Re-check it the same way if you change what this file asserts: inject,
// watch it go red, restore, watch it go green.
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_ID = 'epistemic-resonance-happ';

const SYNAPTIC_LINK_LIMIT = 20;       // SPEC.md §5.11 — absolute

function nowMicros() {
  return Date.now() * 1000;
}

function log(...args) {
  console.log(...args);
}

// A SETUP read coming back empty is the regression itself, not a bug in
// this harness — but dereferencing [0] on it dies with "Cannot read
// properties of undefined (reading 'signed_action')", which names this
// file's line number and says nothing about the zome that returned
// nothing. Observed for real while proving this suite catches
// regressions. The detection was sound; the diagnosis was useless, which
// is the opaque-failure mode this directory's README argues against.
const firstOrFail = (records, fn, expected) => {
  if (Array.isArray(records) && records.length > 0) return records[0];
  log(`\n  SETUP FAILED: ${fn} returned ${Array.isArray(records) ? '0 records' : String(records)}`);
  log(`  Expected ${expected}, published by this harness moments ago.`);
  log('  This is a real failure of the zome, not of the harness.');
  log('  If the code looks correct, the conductor is probably running a');
  log('  STALE BUILD: hc dna pack packages the wasm on disk rather than');
  log('  compiling it. Rebuild with scripts/pack-webhapp.sh, then');
  log('  scripts/sandbox.sh clean && scripts/sandbox.sh start.');
  process.exit(1);
};

function errText(e) {
  return String(e?.data?.data ?? e?.message ?? e);
}

async function connect(admin) {
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: APP_ID });
  const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      if (CellType.Provisioned in cell) cellIds.push(cell[CellType.Provisioned].cell_id);
      else if (CellType.Cloned in cell) cellIds.push(cell[CellType.Cloned].cell_id);
    }
  }
  if (cellIds.length === 0) throw new Error(`App "${APP_ID}" has no provisioned or cloned cells.`);
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  const myAgent = cellIds[0][1];
  const callZome = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { myAgent, callZome };
}

async function main() {
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const { myAgent, callZome } = await connect(admin);
  log(`agent = ${Buffer.from(myAgent).toString('base64')}\n`);

  let failures = 0;
  const check = (label, cond) => {
    if (cond) log(`  PASS: ${label}`);
    else { log(`  FAIL: ${label}`); failures++; }
  };

  // -- Setup: one Claim for every critique below to target. A Critique's
  // target must downcast to an EntryHash of a real entry (SPEC §5.4),
  // so the Claim's entry_hash is read back rather than reusing
  // create_claim's ActionHash return value.
  const domain = `FrictionLimits${Date.now()}`;
  log(`Creating a target Claim in domain ${domain} ...`);
  await callZome('create_claim', {
    content: 'Target claim for friction-limit verification.',
    domain,
    author: myAgent,
    timestamp: nowMicros(),
    evidence_hashes: [],
    confidence: 'Hypothetical',
    semantic_tags: [],
    source_mew: null,
  });
  const claimRecords = await callZome('get_claims_by_domain', domain);
  const targetEntryHash = firstOrFail(claimRecords, 'get_claims_by_domain',
    "the claim this harness seeded into its domain").signed_action.hashed.content.entry_hash;
  log('  got the claim\'s EntryHash.\n');

  const makeCritique = (n) => callZome('create_critique', {
    target: targetEntryHash,
    target_type: 'Claim',
    critique_mode: 'Logical',
    content: `Friction-limit verification critique #${n}.`,
    author: myAgent,
    timestamp: nowMicros(),
    replication_attempted: false,
    evidence_hashes: [],
    species: null,
  });

  // -- Free tier: every critique creates exactly one SynapticLink
  // (create_critique is the only caller of create_synaptic_link), so
  // this walks both budgets up in lockstep.
  log(`=== Creating critiques until one is refused ===`);
  let created = 0;
  let firstRefusal = null;
  for (let i = 1; i <= SYNAPTIC_LINK_LIMIT + 5; i++) {
    try {
      await makeCritique(i);
      created++;
    } catch (e) {
      firstRefusal = errText(e);
      break;
    }
  }
  log(`  created ${created} critiques (and therefore ${created} SynapticLinks) before refusal`);
  check(`the limit is exactly ${SYNAPTIC_LINK_LIMIT}`, created === SYNAPTIC_LINK_LIMIT);
  check('the 21st was refused, not silently accepted', firstRefusal !== null);
  log(`  refusal: ${firstRefusal?.slice(0, 240)}\n`);

  // -- WHICH limit refused it? This is the whole question. Both budgets
  // are 20/hour and both are advanced by the same create_critique call,
  // so they saturate together -- but only SynapticLink has a burn tier.
  const refusedByCritiqueLimit = /Critique/i.test(firstRefusal ?? '');
  const refusedBySynapticLimit = /SynapticLink/i.test(firstRefusal ?? '');
  log('=== Which budget refused it? ===');
  log(`  mentions Critique friction:     ${refusedByCritiqueLimit}`);
  log(`  mentions SynapticLink friction: ${refusedBySynapticLimit}`);
  check('the refusal came from the Critique budget, not the SynapticLink one',
    refusedByCritiqueLimit && !refusedBySynapticLimit);
  log('');

  // -- Now buy headroom and try again. Per SPEC §5.11 the 21st
  // SynapticLink needs (20 + 1 - 20) * 5.0 = 5.0 of burned credit;
  // this burns ten times that, so nothing below can be blamed on
  // having under-paid.
  // The limit must stay refused on a retry, not merely on first
  // contact — a budget that quietly reopens would be just as broken as
  // one that could be bought past.
  log('=== The limit holds on retry ===');
  let retryRefusal = null;
  try {
    await makeCritique(created + 1);
  } catch (e) {
    retryRefusal = errText(e);
  }
  check('a second attempt past the limit is also refused', retryRefusal !== null);
  check('and it is refused by the same friction budget',
    /Critique/i.test(retryRefusal ?? '') && /friction/i.test(retryRefusal ?? ''));

  log(`
=== What this establishes ===
Throughput is capped absolutely at ${SYNAPTIC_LINK_LIMIT} per rolling hour per agent, and
nothing reopens it early. There is no mechanism in this protocol for
buying past it: the burn-to-extend tier that once existed was removed
as unreachable, and the mutual-credit ledger it was the only consumer of
was removed with it.

A successor -- non-transferable regenerating capacity, one per-agent
budget spent at differing rates by differing acts -- was proposed and
then rejected too, because no act needs to cost more than another in a
way these separate caps cannot already express, and unifying them would
let unspent allowance for one act become extra allowance for another.
The cost model is flat per-act caps plus accountability plus vouching.
See docs/metabolic-biosignalling-currency-brief.md.
`);

  log(`${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
