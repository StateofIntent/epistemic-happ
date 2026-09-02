#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/burn-friction.mjs — live verification of the
// SynapticLink burn-to-extend-friction path (SPEC.md §5.11's three
// tiers), the one part of the metabolic currency layer that
// docs/metabolic-biosignalling-currency-brief.md §8 still listed as
// unverified against a real DHT.
//
// What the tiers are supposed to be, per SPEC.md §5.11:
//   < 20 SynapticLinks/hour  -> free
//   20..29                   -> allowed only against CreditBurns tagged
//                               "burn_friction" totalling
//                               (recent_count + 1 - 20) * 5.0
//   >= 30                    -> refused unconditionally, no matter the burn
//
// The result of running this is that the middle tier turns out to be
// UNREACHABLE through this zome's own API, for a structural reason
// worth stating rather than working around — see the summary this
// script prints, and README's Phase 5 entry.
//
// Prereqs: scripts/sandbox.sh start, against a CLEAN sandbox — friction
// is a rolling one-hour window over the agent's own source chain, so a
// resumed conductor carrying earlier critiques starts partway into the
// budget and makes every count below wrong.
// ============================================================================
import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_ID = 'epistemic-resonance-happ';

const CRITIQUE_MAX_PER_WINDOW = 20;   // SPEC.md §6
const SYNAPTIC_FREE_TIER = 20;        // SPEC.md §5.11
const CREDIT_PER_EXTRA_ACTION = 5.0;  // SPEC.md §5.11

function nowMicros() {
  return Date.now() * 1000;
}

function log(...args) {
  console.log(...args);
}

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
  const domain = `BurnFriction${Date.now()}`;
  log(`Creating a target Claim in domain ${domain} ...`);
  await callZome('create_claim', {
    content: 'Target claim for burn-friction verification.',
    domain,
    author: myAgent,
    timestamp: nowMicros(),
    evidence_hashes: [],
    confidence: 'Hypothetical',
    semantic_tags: [],
    source_mew: null,
  });
  const claimRecords = await callZome('get_claims_by_domain', domain);
  const targetEntryHash = claimRecords[0].signed_action.hashed.content.entry_hash;
  log('  got the claim\'s EntryHash.\n');

  const makeCritique = (n) => callZome('create_critique', {
    target: targetEntryHash,
    target_type: 'Claim',
    critique_mode: 'Logical',
    content: `Burn-friction verification critique #${n}.`,
    author: myAgent,
    timestamp: nowMicros(),
    replication_attempted: false,
    evidence_hashes: [],
    species: null,
  });

  // -- Free tier: every critique creates exactly one SynapticLink
  // (create_critique is the only caller of create_synaptic_link), so
  // this walks both budgets up in lockstep.
  log(`=== Free tier: creating critiques until one is refused ===`);
  let created = 0;
  let firstRefusal = null;
  for (let i = 1; i <= SYNAPTIC_FREE_TIER + 5; i++) {
    try {
      await makeCritique(i);
      created++;
    } catch (e) {
      firstRefusal = errText(e);
      break;
    }
  }
  log(`  created ${created} critiques (and therefore ${created} SynapticLinks) before refusal`);
  check(`the free tier is exactly ${SYNAPTIC_FREE_TIER}`, created === SYNAPTIC_FREE_TIER);
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
  const burnAmount = CREDIT_PER_EXTRA_ACTION * 10;
  log(`=== Buying headroom: burning ${burnAmount} tagged "burn_friction" ===`);
  // Asserted as a delta, not against an absolute threshold: this agent
  // may carry standing from an earlier script run on the same
  // conductor, and a threshold check would then pass on that prior
  // balance alone, whether or not this burn registered at all.
  const balanceBefore = await callZome('get_credit_balance', myAgent);
  await callZome('create_credit_burn', { amount: burnAmount, reason: 'burn_friction' });
  const balanceAfter = await callZome('get_credit_balance', myAgent);
  const delta = balanceBefore - balanceAfter;
  log(`  get_credit_balance: ${balanceBefore} -> ${balanceAfter} (delta ${delta})`);
  check(`the burn debited ~${burnAmount}`, delta >= burnAmount - 0.01 && delta <= burnAmount + 0.01);

  let afterBurnRefusal = null;
  try {
    await makeCritique(created + 1);
  } catch (e) {
    afterBurnRefusal = errText(e);
  }
  check('the 21st critique is STILL refused after a 10x burn', afterBurnRefusal !== null);
  log(`  refusal: ${afterBurnRefusal?.slice(0, 240)}`);
  check('and it is still the Critique budget refusing it',
    /Critique/i.test(afterBurnRefusal ?? '') && !/SynapticLink/i.test(afterBurnRefusal ?? ''));

  log(`
=== What this establishes ===
create_critique is the only caller of create_synaptic_link, so a
SynapticLink can only ever be created alongside a Critique entry. Both
carry a 20-per-hour budget, and one create_critique call advances both,
so they saturate on the same call -- but create_critique checks the
Critique budget FIRST, and the Critique budget has no burn tier.

The SynapticLink burn tier begins at exactly 20, which is the same count
at which Critique creation becomes impossible. So the 20..29 tier and
its ${CREDIT_PER_EXTRA_ACTION}-per-action price cannot be reached through this zome's API by
any sequence of calls, paid or unpaid. Burning credit buys nothing an
agent can actually spend.

This does NOT make the integrity-zome burn check pointless: it still
governs a client that hand-crafts SynapticLink CreateLink actions
without going through create_critique, which is exactly the DHT-side
enforcement it was written for. What it means is narrower and worth
saying exactly -- the enforcement is real, the FEATURE is unreachable.
`);

  log(`${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
