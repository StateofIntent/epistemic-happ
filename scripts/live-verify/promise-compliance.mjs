#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/promise-compliance.mjs — DOES ANY MEMBER ACTUALLY
// PROMISE WHAT THEIR MEMBRANE REQUIRES?
//
// WHY THIS EXISTS. A `Membrane` declares `required_promises` and founding
// enforces two things about them DHT-side: the list may not be empty, and
// the founder must reference their own published `Constitution`. JOINING
// ENFORCES NOTHING. `join_membrane` is unrestricted — its own doc comment
// says so — and the `AgentToMembrane` validation rule checks a well-formed
// 36-byte tag, that the tag is the real author's, and that the base is a
// real Membrane. Nothing anywhere looks at the joiner's promises, and
// until this harness nothing anywhere COMPARED the two: `required_promises`
// was written by create_membrane, exported by the N4L serialiser, and read
// against nobody's constitution in either zome (open-work 6.6).
//
// THE NON-ENFORCEMENT IS NOT THE BUG, AND §5 ASSERTS IT DELIBERATELY.
// Membership is a voluntary promise; a protocol that refused the join would
// make a membrane an authority over who may speak. So the comparison belongs
// where every other threshold in this protocol ended up — in the reading, not
// the record. §5 therefore requires an agent who has promised NOTHING to be
// able to join, and requires the reading to say so rather than the write to
// refuse. A harness that asserted the opposite would be arguing for a
// different protocol.
//
// WHAT IT PROVES, in five parts:
//   §1  the comparison finds the founder's own promises, which are the one
//       case the protocol does enforce — so a green §1 with a red §2 means
//       the READ is wrong rather than the data.
//   §2  a member who promised everything reports nothing missing, and an
//       extra promise is not a violation.
//   §3  a member who promised SOME of it reports exactly the gap.
//   §4  THE SUBTLE ONE: the right phrase in the WRONG DOMAIN does not
//       count. A `Promise` carries a domain; a promise about another domain
//       is not a promise about this one, and a comparison that ignored the
//       field would pass anybody who promised anything anywhere.
//   §5  an agent with NO constitution joins successfully and is reported as
//       having promised nothing — which is the case the read exists for,
//       and which `hasConstitution: false` states as a fact rather than as
//       a verdict (nothing obliges an agent to publish one).
//   §6  the reading writes nothing: member count and the founder's own
//       claim count are identical before and after.
//
// IT DRIVES THE SHIPPED SDK, not a local reimplementation — if
// `EpistemicAgent.promiseCompliance()` breaks, this goes red.
//
// Prereqs: scripts/sandbox.sh clean && scripts/sandbox.sh start, a packed
// .happ at the repo root (scripts/pack-webhapp.sh, or `hc app pack .`), and
// a built SDK (cd agent-sdk && npm run build).
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
// This directory's own rule is that a harness which has only ever been
// green has not been shown to test anything. Recorded here, rather than
// only in a merged PR, so it is readable at the point someone runs this
// file.
//
//   Regression injected: promiseCompliance matching on `action` alone, ignoring the Promise's domain.
//   Result: 3 FAILs — both of §3's and one of §4's. AND THE ONE THAT STAYED
//   GREEN IS WHY §4 HAS TWO CHECKS: "reported as promised elsewhere" still
//   passed, because reporting a promise as out-of-domain and counting it as
//   in-domain are independent. Only the PAIR catches it, which is the
//   near-miss this directory keeps finding — a flag an implementation sets
//   about itself is not evidence that it acted on it.
//
//   Regression injected: hasConstitution hardcoded to true — absence rendered as presence.
//   Result: 1 FAIL, §5's, and the three set comparisons around it stayed green
//   because the sets were still right. That is the mode-and-constitution
//   failure one layer down: a member who published nothing read as a member
//   who published something empty.
//
// Re-check it the same way if you change what this file asserts: inject,
// watch it go red, restore, watch it go green.
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { createRequire } from 'node:module';

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const FOUNDER_APP_ID = 'epistemic-resonance-happ';
const HAPP_PATH = new URL('../../epistemic-resonance-happ.happ', import.meta.url).pathname;
const STAMP = Date.now();
const DOMAIN = `PromiseCompliance${STAMP}`;
const OTHER_DOMAIN = `SomewhereElse${STAMP}`;

const P_ANSWER = 'answer for what I publish';
const P_PERMANENT = 'treat everything I publish as permanent';
const P_NO_PERSONAL = 'publish no personal information about another person';
const P_EXTRA = 'answer a complaint about something I published';

const requireFromSdk = createRequire(new URL('../../agent-sdk/package.json', import.meta.url));
let EpistemicAgent;
try {
  ({ EpistemicAgent } = await import(new URL('../../agent-sdk/dist/index.js', import.meta.url).href));
} catch (err) {
  console.error('Could not import the built SDK. Run: cd agent-sdk && npm run build');
  console.error(String(err));
  process.exit(1);
}
try {
  requireFromSdk('@holochain/client');
} catch {
  console.error('agent-sdk has no node_modules. Run: cd agent-sdk && npm install');
  process.exit(1);
}

const b64 = (u8) => Buffer.from(u8).toString('base64');
const short = (u8) => b64(u8).slice(0, 12) + '…';
const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};
const same = (a, b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

// A SETUP read coming back empty is the regression itself rather than a
// bug in this harness, but dereferencing it dies naming this file instead
// of the zome. Same shape as read-scope.mjs's firstOrFail, and here for
// the same reason.
const orFail = (value, what, why) => {
  if (value !== undefined && value !== null) return value;
  log(`\n  SETUP FAILED: ${what} came back empty.`);
  log(`  Expected ${why}, published by this harness moments ago.`);
  log('  This is a real failure of the zome or the SDK, not of the harness.');
  log('  If the code looks correct, the conductor is probably running a');
  log('  STALE BUILD: hc dna pack packages the wasm on disk rather than');
  log('  compiling it. Rebuild with scripts/pack-webhapp.sh, then');
  log('  scripts/sandbox.sh clean && scripts/sandbox.sh start. A stale SDK');
  log('  is the other candidate: cd agent-sdk && npm run build.');
  process.exit(1);
};

// Seconds, not micros, and that choice is load-bearing enough to say
// here: get_agent_constitution filters expiry against sys_time() in
// SECONDS, so a micros `expires_at` is ~1e5 times too large to ever fire.
// This repository's own harnesses publish `published_at` both ways.
const nowSecs = () => Math.floor(Date.now() / 1000);

async function connectApp(admin, appId) {
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: appId });
  const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      if (cell?.type === CellType.Provisioned || cell?.type === CellType.Cloned) cellIds.push(cell.value.cell_id);
    }
  }
  if (cellIds.length === 0) throw new Error(`App "${appId}" has no provisioned or cloned cells.`);
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { me: cellIds[0][1], call };
}

async function installAgent(admin, appId) {
  const apps = await admin.listApps({});
  if (!apps.some((a) => a.installed_app_id === appId)) {
    const pub = await admin.generateAgentPubKey();
    await admin.installApp({ source: { type: 'path', value: HAPP_PATH }, agent_key: pub, installed_app_id: appId });
    await admin.enableApp({ installed_app_id: appId });
  }
  return connectApp(admin, appId);
}

const publishConstitution = (agent, promises) => agent.call('publish_constitution', {
  agent: agent.me,
  promises: promises.map(([action, domain]) => ({ action, domain, modality: null })),
  conditions: [],
  published_at: nowSecs(),
  expires_at: null,
});

async function run() {
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });

  const founder = await connectApp(admin, FOUNDER_APP_ID);
  log(`founder     = ${short(founder.me)}`);
  const promisedAll = await installAgent(admin, `erh-pc-all-${STAMP}`);
  log(`promised-all= ${short(promisedAll.me)}`);
  const partial = await installAgent(admin, `erh-pc-partial-${STAMP}`);
  log(`partial     = ${short(partial.me)}`);
  const silent = await installAgent(admin, `erh-pc-silent-${STAMP}`);
  log(`silent      = ${short(silent.me)}\n`);

  // ---- Setup ------------------------------------------------------------
  log(`Founding a membrane in ${DOMAIN}, requiring three promises ...`);
  const founderConstitution = await publishConstitution(founder, [
    [P_ANSWER, DOMAIN], [P_PERMANENT, DOMAIN], [P_NO_PERSONAL, DOMAIN],
  ]);
  await founder.call('create_membrane', {
    domain: DOMAIN,
    description: 'The joining promise, as required promises (open-work 7.17).',
    required_promises: [P_ANSWER, P_PERMANENT, P_NO_PERSONAL],
    validation_rules_hash: null,
    creator: founder.me,
    created_at: nowSecs(),
    constitution: founderConstitution,
  });

  // promisedAll: everything required, in this domain, plus one extra.
  await publishConstitution(promisedAll, [
    [P_ANSWER, DOMAIN], [P_PERMANENT, DOMAIN], [P_NO_PERSONAL, DOMAIN], [P_EXTRA, DOMAIN],
  ]);
  // partial: one required promise here, and one of the others in ANOTHER
  // domain — §4's case, carried by the same agent so the two readings
  // cannot be confused with each other.
  await publishConstitution(partial, [
    [P_ANSWER, DOMAIN], [P_PERMANENT, OTHER_DOMAIN],
  ]);
  // silent: no constitution at all. Published nothing, promised nothing.

  // The membrane hash is found through the SDK, which is itself the
  // surface under test: get_membranes is a DHT-wide indexed read, and
  // promiseCompliance resolves the membrane the same way.
  const sdk = await EpistemicAgent.connect({ adminUrl: ADMIN_URL, appUrl: APP_URL, installedAppId: FOUNDER_APP_ID });
  const allMembranes = await sdk.membranes();
  const found = orFail(
    allMembranes.find((m) => m.entry.domain === DOMAIN),
    'EpistemicAgent.membranes()',
    'the membrane this harness founded moments ago',
  );
  const membraneHash = found.entryHash;

  for (const agent of [founder, promisedAll, partial, silent]) {
    await agent.call('join_membrane', membraneHash);
  }

  const membersBefore = (await founder.call('get_membrane_members', membraneHash)).length;
  const ownClaimsBefore = (await founder.call('get_claims_by_domain', DOMAIN)).length;

  // ---- The reading ------------------------------------------------------
  log('\nReading promise compliance through the SDK ...');
  const reading = await sdk.promiseCompliance(membraneHash);
  const by = (agent) => reading.members.find((m) => b64(m.agent) === b64(agent.me));

  log('\n§1 The membrane\'s own declaration, and the founder, whose promise IS enforced');
  check('the reading reports this membrane\'s domain', reading.domain === DOMAIN);
  check('it reports all three required promises', same(reading.requiredPromises, [P_ANSWER, P_PERMANENT, P_NO_PERSONAL]));
  check('every joiner appears exactly once', reading.members.length === 4);
  const f = orFail(by(founder), 'the founder\'s row', 'the founder, who joined moments ago');
  check('the founder has a constitution', f.hasConstitution === true);
  check('the founder is missing nothing', same(f.missing, []));

  log('\n§2 A member who promised everything — and an extra promise is not a violation');
  const a = orFail(by(promisedAll), 'the promised-all row', 'an agent who joined moments ago');
  check('promised-all is missing nothing', same(a.missing, []));
  check('promisesAll is true for them', a.promisesAll === true);
  check('their extra promise is reported as extra, not as a fault', same(a.extra, [P_EXTRA]));

  log('\n§3 A member who promised some of it — the gap is reported exactly');
  const p = orFail(by(partial), 'the partial row', 'an agent who joined moments ago');
  check('their in-domain promise is seen', same(p.promised, [P_ANSWER]));
  check('the two they did not promise here are missing', same(p.missing, [P_PERMANENT, P_NO_PERSONAL]));
  check('promisesAll is false for them', p.promisesAll === false);

  log('\n§4 THE SUBTLE ONE: the right phrase in the wrong domain does not count');
  check('the other-domain promise is reported as promised elsewhere', same(p.promisedElsewhere, [P_PERMANENT]));
  check('and it does NOT fill the gap it names', p.missing.includes(P_PERMANENT));

  log('\n§5 An agent who promised nothing — joined, and reported as a fact');
  const s = orFail(by(silent), 'the silent row', 'an agent who joined moments ago');
  check('they are a member: joining is unrestricted BY DESIGN', s !== undefined);
  check('hasConstitution is false, which is a fact and not a verdict', s.hasConstitution === false);
  check('they promise nothing here and nothing elsewhere', same(s.promised, []) && same(s.promisedElsewhere, []));
  check('every required promise is missing for them', same(s.missing, [P_ANSWER, P_PERMANENT, P_NO_PERSONAL]));

  log('\n§6 The reading writes nothing');
  const membersAfter = (await founder.call('get_membrane_members', membraneHash)).length;
  const ownClaimsAfter = (await founder.call('get_claims_by_domain', DOMAIN)).length;
  check('the member list is unchanged', membersAfter === membersBefore);
  check('no claim was written', ownClaimsAfter === ownClaimsBefore);

  await sdk.close();
  log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => { console.error(err); process.exit(1); });
