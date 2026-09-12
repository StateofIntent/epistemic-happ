#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/real-gossip.mjs — DOES AN ENTRY WRITTEN ON ONE NODE
// REACH A DIFFERENT NODE OVER A REAL NETWORK?
//
// WHY THIS EXISTS. README.md has said since Phase 1 that "gossip protocol
// is wave propagation — information ripples through the network
// organically," and §2.5's binding section says "DHT gossip propagates the
// binding." Until this harness, nothing in this repository had ever run
// two conductors that could reach each other, so those sentences described
// a property of Holochain that this project had taken on faith.
//
// The gap was not an oversight so much as a blind spot with a specific
// shape. `scripts/sandbox.sh` starts one conductor, and `hc sandbox`
// produces no networking by default — `transport_pool: []`,
// `bootstrap_service: null` in the conductor config. Every multi-agent
// harness here then installs its extra agents ON that conductor, so two
// "agents" share one local DHT store: an entry written by agent 1 is
// visible to agent 2 immediately, because it never went anywhere. That is
// the correct setup for the questions those harnesses ask, and it makes
// this one unaskable. `federation/` does run two real conductors, but
// deliberately ones sharing no network at all.
//
// So the arrangement this needs did not exist and had to be built:
// `scripts/network.sh`, which runs a local bootstrap server and a tx5
// iroh relay (one combined kitsune2-bootstrap-srv) and brings up three
// conductors against it.
//
// WHAT IS VERIFIED, against three live conductors in three separate OS
// processes with three distinct agent keys and three separate data
// directories:
//
//   1. PRECONDITIONS. nodeA and nodeB report the same DNA hash — same
//      DHT. nodeC reports a different one. All three agent keys differ.
//      If any of this is false the rest of the run means nothing, so it
//      is checked rather than assumed.
//   2. NOTHING IS THERE FIRST. Each run uses a fresh domain string, and
//      nodeB is read for it BEFORE nodeA publishes. This is what rules
//      out "it was already there" without depending on how fast gossip
//      happens to be.
//   3. THE FINDING. nodeA publishes a Claim; nodeB's `get_claims_by_domain`
//      returns it, having received it over the iroh QUIC transport.
//   4. IT IS THE SAME ENTRY. The claim nodeB holds is compared field by
//      field with what nodeA wrote, and its author is nodeA's key.
//   5. TWO INDEPENDENT READ PATHS. `get_claims_by_agent` on nodeB finds
//      it too, so the result is not a quirk of one index — and because they
//      really are independent, this one gets its own bounded wait rather
//      than being asked once the moment section 3 returns. Links on
//      different base hashes gossip separately; assuming otherwise is what
//      made this section fail on a documentation-only change.
//   6. THE CONTROL THAT MAKES 3 EVIDENCE. nodeC — same .happ, same code,
//      same bootstrap and signal servers, same machine, differing only in
//      network seed — never sees it, and is watched for a margin beyond
//      the moment nodeB succeeded rather than glanced at once.
//   7. NOT A FIREHOSE. A domain nobody ever published to reads empty on
//      nodeB, so `get_claims_by_domain` is not simply returning
//      everything.
//   8. BOTH DIRECTIONS. nodeB publishes and nodeA receives, so gossip is
//      not one-way.
//   9. THE CHAIN-LOCAL FINDING, TESTED WHERE IT ACTUALLY MATTERS. See the
//      long note above check 9 below — this is the check that could not
//      previously be run at all.
//
// ON A FAILURE ONLY, section 3 also runs a probe that publishes a fresh
// claim and reports whether THAT crosses while the missed one still has
// not — see `strandedProbe`. It is not a check and cannot change the
// verdict; it exists because this harness goes red intermittently and
// every occurrence before it was spent working out which story it was.
// Its verdicts are STRANDED OP, STRANDED THEN REPAIRED, LATE PATH,
// WINDOW TOO SHORT and NO PATH YET, and they point at different defects
// in different files — read that line first, not section 5's.
//
// Prereqs: scripts/network.sh clean && scripts/network.sh start, and a
// packed .happ at the repo root (scripts/pack-webhapp.sh).
//
// This harness does NOT use scripts/sandbox.sh's conductor and does not
// care whether it is running; the ports are deliberately disjoint.
//
// UNLIKE THE REST OF THIS DIRECTORY, it is safe to re-run without
// cleaning first. Every check is scoped to a domain string minted from
// Date.now() at the top of the run, and the constitution check matches on
// its own domain rather than on a count, so entries left by earlier runs
// cannot satisfy or break anything here. It also spends no SWO friction
// budget — `create_claim` and `publish_constitution` are not rate-limited;
// `create_critique` and `create_synaptic_link` are, and this file calls
// neither. Confirmed by re-running green on conductors that had already
// carried two previous runs. Clean anyway if you want the logs readable.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
// This directory's rule is that a harness which has only ever been green
// has not been shown to test anything.
//
//   Regression injected: nodeB's entry in NODES pointed at nodeC's ports,
//   so the "receiver" was a conductor on a different DHT — the exact
//   false-positive this harness exists to exclude.
//   Result: three checks red at once (same-DHT, distinct agent keys,
//   distinct admin ports) and the run aborted before publishing anything,
//   printing all three DNA hashes rather than producing a result that
//   looked like an answer. Exit 1.
//
//   Regression injected: the nodeB and nodeC entries in NODES were
//   SWAPPED and the precondition abort bypassed, so the "receiver" sat on
//   the isolated DHT while the "isolated control" was a genuine peer.
//   This is the more valuable of the two, because it is the only way to
//   see check 6 fail: a control asserting that something never happens is
//   exactly the check that can pass forever while testing nothing.
//   Result: 14 checks red, exit 1 — the gossip check after the full 120s
//   window, all five of check 4's same-entry checks, the second index,
//   both directions,
//   and BOTH nodeC control checks, which is what was being tested.
//
//   And one thing that run showed which no green run could have. Check
//   9's own assertion — "nodeB does NOT see nodeA's constitution" —
//   PASSED during that injection, because the node in the nodeB slot was
//   on a different DHT and could not have seen anything at all. It was
//   the PAIRED CONTROL immediately after it that went red and exposed
//   the pass as empty. That is precisely the job the paired control was
//   added to do, confirmed rather than assumed: without it, check 9
//   would report a green that means nothing whenever the network is
//   broken in the direction that matters most.
//
//   Restored afterwards and re-run: all 25 checks green again, on the
//   same conductors, without cleaning them.
//
// THE FAILURE DIAGNOSTICS WERE WATCHED TOO, which matters more here than
// usual: a diagnostic only ever runs on a red run, so a green CI history
// says nothing whatsoever about whether it prints the truth. One of them
// did not — section 5 reported "the by-domain index had it after never,
// so the entry crossed and only this index is missing" on a run where the
// entry had not crossed at all. Five injections, each on the real network
// of three conductors, one per message the failure paths can print:
//
//   GOSSIP_WINDOW_MS lowered to 100ms, so section 3 cannot win.
//   Result: the probe published a fresh claim, watched it cross in 2.1s
//   alongside the missed one, and reported LATE PATH. Section 4's five
//   checks then passed on the entry that had arrived during the probe —
//   the consequence `strandedProbe` documents, visible rather than
//   theoretical.
//
//   The same, plus `awaitSecondIndex` stubbed to return null.
//   Result: section 5 said the by-domain index "got it only AFTER section
//   3's window closed, during the probe above", which is the message that
//   replaces the false one. Exactly the CI run that prompted all of this.
//
//   nodeB's `get_claims_by_domain` and `get_claims_by_agent` stubbed to
//   return nothing at all, so nothing can appear to cross.
//   Result: probe reported NO PATH YET, and section 5 reported "the
//   by-domain index never had it either — this is section 3's failure
//   reaching down here". The wrong-cause message is gone from the run
//   whose shape produced it.
//
//   nodeB stubbed to see the PROBE's domain but never the missed one.
//   Result: STRANDED OP — "the fresh claim crossed in 2.0s and the missed
//   one is STILL absent". This is the shape that would confirm the
//   standing hypothesis in `peerCount` below, and it is now known to be
//   reportable rather than hoped to be.
//
//   nodeB made to throw `Websocket closed with code 1006` the moment the
//   probe asks it anything.
//   Result: "nodeB stopped answering during the probe", and the run
//   carried on to its remaining sections. Without the catch this would be
//   a stack trace replacing section 3's diagnostic with one about the
//   probe — on precisely the runs where section 3's is the thing somebody
//   needs.
//
//   Restored and re-run clean afterwards: all checks green, probe silent
//   (it runs only when section 3 has already failed).
//
// AND THEN THE PROBE MET REAL OCCURRENCES, which corrected it twice.
// Thirty dispatched CI runs produced seven failures of TWO shapes. Two of
// them printed the signature this probe was built for: the fresh claim
// crossing in 2.0s while the original was still missing — one then saw
// the original turn up 12 seconds AFTER the fresh one, the other never
// saw it at all. The other five were a shape never recorded here before,
// all in one wave and all publishing inside a 12-second window: NO PATH
// YET, nothing crossing in either direction, and `2` peers known on both
// sides throughout. README.md §9 keeps the two apart and explains why
// five clustered runs are not a rate.
//
//   What the first one broke: it printed LATE PATH — "the path came up
//   some time after the publish and then carried both" — over its own
//   timestamps showing a 12-second gap in the wrong direction. A path
//   that came up delivers both in the same poll. So "both arrived" is
//   three shapes, not one, and which one it is depends on the ORDER:
//   WINDOW TOO SHORT (already there at the probe's first poll), LATE PATH
//   (no later than the fresh claim), STRANDED THEN REPAIRED (after it).
//   Injected all three on the real network by withholding the missed
//   domain from nodeB for 0, 6 and 12 seconds into the probe; each
//   printed its own verdict, and the 12-second one reproduced the CI run.
//
//   What the second one broke: section 5's poll line printed
//   `by-agent=1` for two solid minutes next to a FAILING check. That
//   index is keyed on the author and the probe publishes as the same
//   author, so the count included the probe's own claim — the fresh
//   domain keeps the probe out of the by-DOMAIN sections, not out of this
//   one. Injected by filtering this run's claim out of nodeB's by-agent
//   results while leaving the probe's in place: the line now reads
//   `by-agent=10, none of them this run's claim`. The check was never
//   wrong, since it matches on content; the number beside it was.
//
// Re-check the same way if you change what this file asserts: inject,
// watch it go red, restore, watch it go green. And if you change what it
// PRINTS on a failure, inject a failure and read the words.
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { decode } from '@msgpack/msgpack';

// Ports and app ids are scripts/network.sh's, and must stay in step with it.
const NODES = {
  A: { admin: 8899, app: 8898, appId: 'epistemic-net-a' },
  B: { admin: 8897, app: 8896, appId: 'epistemic-net-b' },
  C: { admin: 8895, app: 8894, appId: 'epistemic-net-c' },
};

// Gossip between two nodes on a local signal server has been observed
// landing in ~2s. The window is generous because a timeout here should
// mean "it never arrived", not "the machine was busy" — a flaky red on a
// harness whose whole job is to distinguish arrival from non-arrival
// would be worse than useless.
const GOSSIP_WINDOW_MS = 120_000;
const POLL_MS = 2_000;
// How much longer the isolated node is watched AFTER nodeB succeeds. The
// control's claim is "it never arrives", and a single glance at the
// instant nodeB happens to succeed is not that claim.
const CONTROL_MARGIN_MS = 20_000;
// Only ever spent on a run that has ALREADY failed section 3, to ask whether
// a fresh op crosses while the missed one still has not. Short on purpose:
// the answer is "seconds or nothing" in every occurrence recorded so far, and
// a failing run has by then already spent four minutes waiting.
const STRANDED_PROBE_MS = 30_000;

const b64 = (u8) => Buffer.from(u8).toString('base64');
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowMicros = () => Date.now() * 1000;

let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

function setupFail(lines) {
  log('');
  for (const l of lines) log(`  SETUP FAILED: ${l}`);
  log('');
  log('  Bring the network up first:');
  log('    scripts/network.sh clean && scripts/network.sh start');
  log('  and make sure the .happ is current: scripts/pack-webhapp.sh');
  process.exit(1);
}

async function connectNode(name, { admin: adminPort, app: appPort, appId }) {
  let admin;
  try {
    admin = await AdminWebsocket.connect({
      url: new URL(`ws://localhost:${adminPort}`),
      wsClientOptions: { origin: 'live-verify' },
    });
  } catch (e) {
    setupFail([
      `node${name}'s admin port ${adminPort} did not answer (${e.message}).`,
      'All three conductors must be up — this harness needs the isolated',
      'control node as much as the two that talk to each other.',
    ]);
  }
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: appId });
  const app = await AppWebsocket.connect({
    url: new URL(`ws://localhost:${appPort}`),
    token,
    wsClientOptions: { origin: 'live-verify' },
  });
  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      // CellInfo became a discriminated union in @holochain/client
      // 0.21 ({ type, value }); it used to be keyed by cell type. The
      // old `CellType.Provisioned in cell` test matches nothing against
      // the new shape, silently yielding no cell ids at all.
      if (cell?.type === CellType.Provisioned || cell?.type === CellType.Cloned) {
        cellIds.push(cell.value.cell_id);
      }
    }
  }
  if (cellIds.length === 0) setupFail([`App "${appId}" on node${name} has no provisioned cells.`]);

  // AUTHORIZING IS RETRIED, because a freshly resumed conductor reports
  // itself ready before it can actually grant a capability. `hc sandbox
  // run` on an existing sandbox brings the app back DISABLED;
  // scripts/network.sh re-enables it, but EnableApp is asynchronous and
  // the app's own status flips to "running" while the cell is still
  // coming up. A client connecting in that window fails here with
  // `CellDisabled(CellId(...))` — an error naming a cell id and nothing
  // else, raised from inside the client's signing-credential setup
  // rather than from anything this file wrote.
  //
  // Waiting on the app's reported status is NOT sufficient and was tried:
  // network.sh polls for `status: Running` before declaring a node ready,
  // that poll passes immediately, and the failure was unchanged. The only
  // reliable readiness signal is the operation itself succeeding, so it
  // is retried rather than predicted.
  for (const cellId of cellIds) {
    let lastErr;
    for (let attempt = 0; attempt < 30; attempt++) {
      try { await admin.authorizeSigningCredentials(cellId); lastErr = null; break; }
      catch (e) {
        lastErr = e;
        if (!String(e.message ?? e).includes('CellDisabled')) throw e;
        await sleep(1000);
      }
    }
    if (lastErr) setupFail([
      `node${name}'s cell was still disabled after 30s of retrying.`,
      String(lastErr.message ?? lastErr),
      'The conductor is up but its app never finished enabling. Try:',
      `  hc client call --port ${adminPort} list-apps`,
      'and if it is not Running, scripts/network.sh clean && scripts/network.sh start.',
    ]);
  }
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { name, dna: cellIds[0][0], me: cellIds[0][1], call, admin, adminPort, appPort };
}

const claimEntry = (record) => decode(record.entry.Present.entry);

async function publishClaim(node, domain, content) {
  await node.call('create_claim', {
    content,
    domain,
    confidence: 'Moderate',
    semantic_tags: [],
    author: node.me,
    timestamp: nowMicros(),
    evidence_hashes: [],
    attestation_policy: null,
  });
}

/** How many peers a conductor has actually heard of on this DHT.
 *
 * WHY THIS IS REPORTED RATHER THAN ASSUMED. `real-gossip` failed on CI on a
 * pull request that touched only the notes layer: nodeB did not receive
 * nodeA's claim inside 120 seconds, and then — seconds later, on the same pair
 * of conductors — the REVERSE direction arrived in about two. So the network
 * was working and the DHT was right; what was missing was earlier than gossip.
 * That is the same "instant-or-never" shape README.md §9 records for
 * `transitive-gossip`, and the reverse leg passing is the sharpest evidence yet
 * that the suspect is peer DISCOVERY rather than gossip itself: by the time the
 * second leg ran, the nodes had found each other.
 *
 * This harness connects and publishes immediately, so nothing in it has ever
 * distinguished "gossip is slow" from "these two had not met yet". The count
 * below is logged before the first publish and again in the failure
 * diagnostic, so the NEXT occurrence says which.
 *
 * IT DID, AND IT RULED DISCOVERY OUT. On the occurrence after that one — again
 * a pull request that could not have caused it, touching a CI script and spec
 * prose — the counts read `nodeA knows of 2 peer(s), nodeB knows of 2` BEFORE
 * the publish and the same after the window, and the claim still never crossed
 * in 120 seconds, nor its by-agent link in another 120. The nodes had met. And
 * the network was not broken either: a claim nodeA published four and a half
 * minutes later reached nodeB in 2 seconds. So the suspect is no longer
 * discovery and not the transport — it is one op going undelivered and not
 * retried, which is what `strandedProbe` exists to confirm or refute on the
 * next occurrence.
 *
 * What the count does NOT say is worth keeping next to what it does: it is the
 * number of agent infos the conductor holds, which is knowledge obtained from
 * the bootstrap server. It is not evidence of a live QUIC session or of a
 * gossip round having completed with that peer. "They had met" is the strongest
 * reading it supports, and a first publish issued before the first successful
 * gossip round would be consistent with every number recorded above. It is deliberately NOT a
 * check and NOT a wait that can fail the run: adding a red to a job that is
 * already intermittently red would obscure exactly the evidence being
 * gathered, and this repository's rule is that a timeout raised — or a
 * precondition invented — to paper over a stall makes it slower to notice
 * rather than absent. When the answer is known, the fix goes in the harness
 * that starts the nodes, not here. */
async function peerCount(node) {
  try {
    const infos = await node.admin.agentInfo({ dna_hashes: [node.dna] });
    return Array.isArray(infos) ? infos.length : null;
  } catch {
    return null;
  }
}

const peersLine = async (a, b) =>
  `node${a.name} knows of ${await peerCount(a) ?? '?'} peer(s), `
  + `node${b.name} knows of ${await peerCount(b) ?? '?'}`;

/** Asked ONLY after section 3 has already missed: does a FRESH op from the
 * same author cross to the same receiver right now, while the missed one still
 * has not arrived?
 *
 * WHY THIS IS THE QUESTION. The peer counts above were added to tell "gossip is
 * slow" from "these two had not met yet", and on their second occurrence they
 * answered: both conductors knew of 2 peers BEFORE the publish and still did
 * after the window, so the nodes had met and discovery was not the suspect.
 * What the run then showed is that the network was not broken either — a claim
 * nodeA published four and a half minutes later reached nodeB in 2 seconds, on
 * the same pair, in the same process. So one specific op was stranded while a
 * later one crossed, and nothing re-delivered it across four minutes.
 *
 * Sections 8 and 9 are what revealed that, but only indirectly: they run
 * minutes later and section 8 changes direction, so neither isolates "this op
 * was stranded" from "the path came up some time after the publish". This does:
 * one new claim, same author, same receiver, its own fresh domain, watched
 * alongside the missed one.
 *
 * WHAT THE FRESH DOMAIN DOES AND DOES NOT ISOLATE — stated precisely, because
 * the first version of this comment claimed it "cannot contaminate sections 4
 * to 7" and that was too strong. Sections 4, 6 and 7 read BY DOMAIN and are
 * genuinely untouched. Section 5 reads `get_claims_by_agent`, which is keyed on
 * the AUTHOR, and the probe publishes as that same author — so the probe's
 * claim does appear there, and did, printing `by-agent=1` beside a failing
 * check on a real CI run until that log line was fixed to say none of them
 * matched. The check itself compares content and so cannot be satisfied by the
 * probe's claim; it is the printed count that needed the qualifier.
 *
 * NOT A CHECK, and it cannot turn this run green — the rule this file already
 * follows for the peer counts. A job that is intermittently red must not gain a
 * second way to be red while the evidence for the first is still being
 * gathered, and a probe that could pass would invite reading it as "gossip
 * works, never mind section 3". It only ever prints, and it runs only on a path
 * where section 3's check has already failed.
 *
 * It is NOT free of consequence further down, though, and pretending otherwise
 * would be the same overclaim this file was just corrected for. It spends
 * 30 seconds before sections 4 and 5 read anything, so an entry that crosses
 * during the probe is one they will now see: five checks in section 4 that used
 * to be five reds can become five greens. That is the truth improving rather
 * than a failure being masked — section 3's red stands either way, the run
 * stays red, and a crossing this harness WATCHED happen should not be reported
 * as an absence. Section 5 is told about it explicitly for that reason. */
async function strandedProbe(author, receiver, missedDomain) {
  const PROBE_DOMAIN = `GossipStranded${Date.now()}`;
  const PROBE_CONTENT = `Published on node${author.name} AFTER the window closed, at ${new Date().toISOString()}.`;
  log(`    --- probe: does a fresh op cross now? (${STRANDED_PROBE_MS / 1000}s, domain ${PROBE_DOMAIN}) ---`);
  try {
    await publishClaim(author, PROBE_DOMAIN, PROBE_CONTENT);
  } catch (e) {
    log(`    probe could not publish at all: ${e.message ?? e}`);
    log(`    which is itself the finding — node${author.name} stopped accepting writes`);
    return { probeMs: null, missedMs: null, missedArrivedLate: false };
  }
  const t0 = Date.now();
  let probeMs = null;
  let missedMs = null;
  let missedOnFirstPoll = false;
  let polls = 0;
  while (Date.now() - t0 < STRANDED_PROBE_MS) {
    polls += 1;
    // This runs only when something is already wrong, so the receiver being
    // unable to answer at all is one of the outcomes rather than a surprise.
    // Reported and abandoned, never thrown: a stack trace here would replace
    // the diagnostic for section 3 with a diagnostic about this probe.
    let probeSeen, missedSeen;
    try {
      probeSeen = (await receiver.call('get_claims_by_domain', PROBE_DOMAIN)).length;
      missedSeen = (await receiver.call('get_claims_by_domain', missedDomain)).length;
    } catch (e) {
      log(`    node${receiver.name} stopped answering during the probe: ${e.message ?? e}`);
      log('    so this run cannot say whether the op was stranded — the receiver is down,');
      log('    which is a finding of its own and not the one section 3 was about.');
      return { probeMs, missedMs, missedArrivedLate: missedMs !== null };
    }
    // WHEN each one arrived, not merely whether — the ORDER is the finding.
    if (missedSeen > 0 && missedMs === null) {
      missedMs = Date.now() - t0;
      if (polls === 1) missedOnFirstPoll = true;
    }
    if (probeSeen > 0 && probeMs === null) probeMs = Date.now() - t0;
    log(`    t+${((Date.now() - t0) / 1000).toFixed(0)}s  probe=${probeSeen}  missed=${missedSeen}`);
    if (probeMs !== null && missedMs !== null) break;
    await sleep(POLL_MS);
  }
  // The shapes, named, because the point of a diagnostic is that somebody handed
  // a red tick does not have to work this out for themselves. The shape is
  // RETURNED as well as printed, because section 5 reports on the by-domain
  // index too and must not go on calling it absent once this has watched it
  // arrive.
  //
  // "BOTH ARRIVED" WAS ONE SHAPE AND IS NOW THREE, and the split came from the
  // first real occurrence rather than from reasoning. That run printed LATE
  // PATH — "the path came up some time after the publish and then carried
  // both" — over its own timestamps showing the fresh claim crossing at t+2s
  // and the 130-second-old one only at t+14s. A path that came up would have
  // delivered both in the same poll; a fresh op overtaking an old one by twelve
  // seconds says the path was working the whole time. So the message asserted a
  // cause its own numbers contradicted, which is precisely the defect this
  // probe was shipped alongside a fix for. The ORDER of the two arrivals is
  // what separates them, and it was already being measured and thrown away.
  if (probeMs !== null && missedMs === null) {
    log(`    STRANDED OP: the fresh claim crossed in ${(probeMs / 1000).toFixed(1)}s and the missed one is STILL absent.`);
    log(`    node${author.name} to node${receiver.name} works at this moment, so neither discovery nor`);
    log('    the transport explains section 3. One op was not delivered and was not retried.');
  } else if (probeMs !== null && missedOnFirstPoll) {
    log(`    WINDOW TOO SHORT: the missed claim was already on node${receiver.name} at this probe's`);
    log(`    first poll, so it crossed within a second or so of the ${GOSSIP_WINDOW_MS / 1000}s window closing.`);
    log('    Nothing here is stranded and nothing needed repairing — section 3 gave up a');
    log('    moment too early. Raising the window is still the wrong reflex: what this says');
    log(`    is that a crossing took just over ${GOSSIP_WINDOW_MS / 1000}s, and THAT is the finding.`);
  } else if (probeMs !== null && missedMs <= probeMs) {
    log(`    LATE PATH: the missed claim turned up after ${(missedMs / 1000).toFixed(1)}s of this probe,`);
    log(`    no later than the fresh one (${(probeMs / 1000).toFixed(1)}s) — they arrived together.`);
    log('    Consistent with a path that was down and came up, then carried both at once.');
    log('    The fix would belong in scripts/network.sh, which starts the nodes.');
  } else if (probeMs !== null) {
    // THE SHAPE THAT BROKE THE FIRST VERSION OF THIS MESSAGE. A fresh op
    // crossing BEFORE an older one means the live path was already working
    // while a stale op sat undelivered — so "the path came up and carried
    // both" is contradicted by the harness's own timestamps.
    log(`    STRANDED THEN REPAIRED: the fresh claim crossed in ${(probeMs / 1000).toFixed(1)}s, and the missed`);
    log(`    one followed ${((missedMs - probeMs) / 1000).toFixed(1)}s LATER — ${(missedMs / 1000).toFixed(1)}s into this probe.`);
    log('    The order is the finding: new publishes were crossing in seconds while an op');
    log(`    already ${GOSSIP_WINDOW_MS / 1000}s old was still undelivered, so the path was NOT down and`);
    log('    did not "come up". A second mechanism delivered the old one afterwards.');
    log('    So the op was stranded and then repaired, and the suspect is whatever retries');
    log('    an op that missed its first delivery — not discovery, and not the transport.');
  } else if (missedMs !== null) {
    log('    The missed claim arrived but the fresh one did not, which no hypothesis here predicts.');
    log('    Worth keeping verbatim: it is the one shape that fits neither story.');
  } else {
    log(`    NO PATH YET: neither claim is on node${receiver.name} after this probe.`);
    log('    Section 3 is not about one stranded op — nothing is crossing right now.');
    log('    Sections 8 and 9 below say whether it recovers later in this run.');
  }
  return { probeMs, missedMs, missedArrivedLate: missedMs !== null };
}

// Polls `receiver` until the claim shows up, while checking on every
// iteration that `isolated` still has not seen it. Returns how long
// arrival took, or null if the window closed first.
async function awaitGossip(receiver, isolated, domain) {
  const t0 = Date.now();
  let isolatedEverSaw = false;
  while (Date.now() - t0 < GOSSIP_WINDOW_MS) {
    const got = (await receiver.call('get_claims_by_domain', domain)).length;
    const iso = (await isolated.call('get_claims_by_domain', domain)).length;
    if (iso > 0) isolatedEverSaw = true;
    const t = ((Date.now() - t0) / 1000).toFixed(0);
    log(`    t+${t}s  node${receiver.name}=${got}  node${isolated.name}=${iso}`);
    if (got > 0) return { ms: Date.now() - t0, isolatedEverSaw };
    await sleep(POLL_MS);
  }
  return { ms: null, isolatedEverSaw };
}

/** Wait, bounded, for the SECOND index to carry the claim — the mirror of
 * `awaitGossip`, and deliberately holding it to the same budget.
 *
 * Answers the arrival time rather than a boolean, because "it got there" and
 * "it got there in six seconds" are different facts and only the second one
 * notices an index that is quietly degrading. */
async function awaitSecondIndex(receiver, author, content) {
  const t0 = Date.now();
  while (Date.now() - t0 < GOSSIP_WINDOW_MS) {
    const got = await receiver.call('get_claims_by_agent', author);
    if (got.some((r) => claimEntry(r).content === content)) return Date.now() - t0;
    const t = ((Date.now() - t0) / 1000).toFixed(0);
    // THE COUNT ALONE BECAME MISLEADING THE MOMENT `strandedProbe` EXISTED, and
    // a real CI failure is how that was noticed. This index is keyed on the
    // AUTHOR, and the probe publishes as the same author — so on a run where
    // section 3 missed and the probe's claim crossed, this printed
    // `by-agent=1` for two solid minutes next to a check that was failing.
    // Anything reaching this line has already failed the content match, by
    // construction, so the line now says that rather than leaving a bare 1 to
    // be read as "it arrived". The CHECK was never wrong: it matches on
    // content, so the probe's claim cannot satisfy it.
    log(`    t+${t}s  node${receiver.name} by-agent=${got.length}, none of them this run's claim`);
    await sleep(POLL_MS);
  }
  return null;
}

async function main() {
  log('Connecting to three conductors ...');
  const A = await connectNode('A', NODES.A);
  const B = await connectNode('B', NODES.B);
  const C = await connectNode('C', NODES.C);
  log(`  nodeA  dna ${b64(A.dna).slice(0, 14)}…  agent ${b64(A.me).slice(0, 12)}…  admin :${A.adminPort}`);
  log(`  nodeB  dna ${b64(B.dna).slice(0, 14)}…  agent ${b64(B.me).slice(0, 12)}…  admin :${B.adminPort}`);
  log(`  nodeC  dna ${b64(C.dna).slice(0, 14)}…  agent ${b64(C.me).slice(0, 12)}…  admin :${C.adminPort}`);

  // ---- 1. Preconditions -------------------------------------------------
  //
  // These are checks, not assumptions, because every one of them is a way
  // this harness could report a comforting result that means nothing. If
  // A and B were not on the same DHT the gossip check could never pass; if
  // C WERE on it, the control could never fail; and if any two "nodes"
  // shared an agent key we would be watching one identity talk to itself.
  log('\n--- 1. Preconditions: three real, distinct nodes ---');
  const sameDht = b64(A.dna) === b64(B.dna);
  const isolated = b64(A.dna) !== b64(C.dna);
  check('nodeA and nodeB are on the SAME DHT (identical DNA hash)', sameDht);
  check('nodeC is on a DIFFERENT DHT (different DNA hash)', isolated);
  check('all three agent keys are distinct', new Set([b64(A.me), b64(B.me), b64(C.me)]).size === 3);
  check('all three admin ports are distinct', new Set([A.adminPort, B.adminPort, C.adminPort]).size === 3);

  if (!sameDht || !isolated) {
    setupFail([
      'The DNA hashes are not in the arrangement this harness requires.',
      `nodeA ${b64(A.dna)}`,
      `nodeB ${b64(B.dna)}`,
      `nodeC ${b64(C.dna)}`,
      'nodeA and nodeB must match (same network seed); nodeC must not.',
      'Nothing below this point could be interpreted, so the run stops here',
      'rather than producing a result that looks like an answer.',
    ]);
  }

  // ---- 2. Nothing is there first ---------------------------------------
  const DOMAIN = `Gossip${Date.now()}`;
  const CONTENT = `Written on nodeA at ${new Date().toISOString()}, and nowhere else.`;
  log(`\n--- 2. Before anything is published, domain ${DOMAIN} is empty everywhere ---`);
  check('nodeB sees 0 claims in this run\'s domain before nodeA publishes',
    (await B.call('get_claims_by_domain', DOMAIN)).length === 0);
  check('nodeC sees 0 claims in this run\'s domain before nodeA publishes',
    (await C.call('get_claims_by_domain', DOMAIN)).length === 0);

  // ---- 3. The finding ---------------------------------------------------
  log('\n--- 3. nodeA publishes; does nodeB receive it over the network? ---');
  // Recorded BEFORE the publish, because after a failure it is too late to
  // ask: see `peerCount`. This says whether the two conductors had found each
  // other at the moment the claim was written.
  log(`  at publish time: ${await peersLine(A, B)}`);
  await publishClaim(A, DOMAIN, CONTENT);
  const ownRead = await A.call('get_claims_by_domain', DOMAIN);
  check('nodeA sees its own claim (control: the write itself worked)', ownRead.length === 1);
  if (ownRead.length !== 1) {
    setupFail([
      'nodeA cannot see the claim it just wrote, so there is nothing to gossip.',
      'This is a failure of the zome or of a stale build, not of networking:',
      'hc dna pack packages the wasm on disk rather than compiling it, so a',
      'pack without a build verifies the previous version. Rebuild with',
      'scripts/pack-webhapp.sh, then scripts/network.sh clean && start.',
    ]);
  }

  const { ms: arrivedMs, isolatedEverSaw } = await awaitGossip(B, C, DOMAIN);
  // Null unless section 3 missed; see `strandedProbe`. Section 5 reads it.
  let probe = null;
  check(`nodeB receives nodeA's claim over the network (within ${GOSSIP_WINDOW_MS / 1000}s)`,
    arrivedMs !== null);
  if (arrivedMs !== null) log(`    arrived after ${(arrivedMs / 1000).toFixed(1)}s`);
  if (arrivedMs === null) {
    // The whole point of the peer counts. A miss with both nodes knowing about
    // each other is a gossip problem; a miss with either of them alone on the
    // DHT is a discovery problem, and the fix for the second lives in
    // scripts/network.sh rather than in this file. Section 6 below publishes
    // in the OTHER direction on the same pair of conductors — if that arrives
    // in seconds after this waited two minutes, discovery is the answer.
    log(`    after the window: ${await peersLine(A, B)}`);
    log('    (both counts >1 means they had found each other and gossip still missed;');
    log('     a count of 1 on either means this node was alone on the DHT when it mattered)');
    probe = await strandedProbe(A, B, DOMAIN);
  }

  // ---- 4. It is the same entry -----------------------------------------
  //
  // "A record came back" and "the record nodeA wrote came back" are not
  // the same claim, and only the second one is interesting.
  log('\n--- 4. What arrived is the entry nodeA wrote ---');
  const received = await B.call('get_claims_by_domain', DOMAIN);
  if (received.length === 1) {
    const mine = claimEntry(ownRead[0]);
    const theirs = claimEntry(received[0]);
    check('the content nodeB holds is byte-identical to what nodeA wrote', theirs.content === CONTENT);
    check('the content matches nodeA\'s own read of it', theirs.content === mine.content);
    check('the domain matches', theirs.domain === DOMAIN);
    check('nodeB records the author as nodeA\'s agent key, not its own',
      b64(theirs.author) === b64(A.me) && b64(theirs.author) !== b64(B.me));
    check('the action hash nodeB holds is the one nodeA authored',
      b64(received[0].signed_action.hashed.hash) === b64(ownRead[0].signed_action.hashed.hash));
  } else {
    check('the content nodeB holds is byte-identical to what nodeA wrote', false);
    check('the content matches nodeA\'s own read of it', false);
    check('the domain matches', false);
    check('nodeB records the author as nodeA\'s agent key, not its own', false);
    check('the action hash nodeB holds is the one nodeA authored', false);
  }

  // ---- 5. A second, independent read path ------------------------------
  //
  // INDEPENDENT IS THE WHOLE POINT, AND IT IS WHY THIS HAS TO WAIT. This
  // section used to ask once, with no window at all, immediately after
  // section 3's poll returned — and it went red on CI on a documentation-only
  // change, having given the by-agent index about thirteen milliseconds to
  // arrive.
  //
  // The check's own justification is the reason it could not assume
  // simultaneity. `get_claims_by_domain` and `get_claims_by_agent` are link
  // queries on DIFFERENT base hashes, so their links are gossiped to different
  // neighbourhoods and land independently. If they arrived together this
  // section would prove nothing — it exists precisely because they are two
  // paths — so "the first index has it" says nothing about the second. They
  // usually land within milliseconds of each other, which is why a
  // development machine always wins and a loaded runner is where you first
  // lose.
  //
  // The window is NOT a timeout raised to hide a stall, which this repository
  // has twice decided is the wrong move. Two things keep it honest: it is the
  // same budget section 3 gets, so neither index is held to a laxer standard
  // than the other; and the arrival time is PRINTED, so an index that starts
  // taking sixty seconds shows up as a number that changed rather than as a
  // check that still passes. A by-agent link that never arrives inside the
  // window is a real finding and still fails.
  log('\n--- 5. A second index finds it too ---');
  const byAgentMs = await awaitSecondIndex(B, A.me, CONTENT);
  check(`nodeB's get_claims_by_agent(nodeA) finds the claim (within ${GOSSIP_WINDOW_MS / 1000}s)`,
    byAgentMs !== null);
  if (byAgentMs !== null) {
    log(`    arrived after ${(byAgentMs / 1000).toFixed(1)}s`);
    // The two indexes landing far apart is not a failure, but it is the thing
    // worth knowing if this ever goes red again: it says the separation is
    // real and widening, rather than the check being unlucky once.
    if (arrivedMs !== null && byAgentMs > arrivedMs + 5_000) {
      log(`    ::warning::the by-agent index lagged the by-domain index by `
        + `${((byAgentMs - arrivedMs) / 1000).toFixed(1)}s — they usually land together`);
    }
  } else {
    // WHICH FAILURE THIS IS, and the two are not the same thing. If the
    // by-domain index got the entry and this one did not, the entry crossed
    // and exactly one index is missing — the case this section exists for. If
    // NEITHER got it, section 3 has already failed and this is its shadow, not
    // an index-specific finding at all.
    //
    // The first version of this printed "so the entry crossed and only this
    // index is missing" unconditionally, and said it on a run where the entry
    // had not crossed at all. A diagnostic that states the wrong cause is
    // worse than one that says nothing, because it is read by somebody who has
    // just been handed a red tick and wants the answer.
    //
    // There is a THIRD case, and it is the reason `probe` is threaded down
    // here: the entry can arrive after section 3's window closed but while the
    // probe above was watching. `arrivedMs` is null on such a run and saying
    // "never had it either" would be the same wrong-cause mistake in a new
    // place — the crossing happened, late, and this harness saw it happen.
    if (arrivedMs !== null) {
      log(`    the by-domain index had it after ${(arrivedMs / 1000).toFixed(1)}s, `
        + 'so the entry crossed and only this index is missing');
    } else if (probe?.missedArrivedLate) {
      log('    the by-domain index got it only AFTER section 3\'s window closed, during');
      log('    the probe above — so the entry did cross, late, and this is not a finding');
      log('    about one index. Read section 3\'s probe, not this line.');
    } else {
      log('    the by-domain index never had it either — this is section 3\'s failure');
      log('    reaching down here, not an index that lagged behind a successful crossing');
    }
    log(`    ${await peersLine(A, B)}`);
  }

  // ---- 6. The control that makes 3 evidence ----------------------------
  //
  // nodeC is the whole reason check 3 is evidence rather than an anecdote.
  // It is not a differently-configured machine: same .happ, same wasm,
  // same bootstrap server, same signal server, same host, same moment.
  // The one difference is its network seed, hence its DNA hash, hence its
  // DHT. It is watched for a margin past nodeB's success because "never
  // arrives" is a statement about a stretch of time, not an instant.
  log(`\n--- 6. CONTROL: the isolated node never sees it (watching ${CONTROL_MARGIN_MS / 1000}s past nodeB's success) ---`);
  const marginEnd = Date.now() + CONTROL_MARGIN_MS;
  let isolatedSawLate = false;
  while (Date.now() < marginEnd) {
    if ((await C.call('get_claims_by_domain', DOMAIN)).length > 0) { isolatedSawLate = true; break; }
    await sleep(POLL_MS);
  }
  check('nodeC never saw the claim while nodeB was receiving it', !isolatedEverSaw);
  check(`nodeC still has not seen it ${CONTROL_MARGIN_MS / 1000}s later`, !isolatedSawLate);
  check('nodeC can still answer at all (control: it is alive, not just silent)',
    Array.isArray(await C.call('get_claims_by_domain', 'AnyDomainAtAll')));

  // ---- 7. Not a firehose ------------------------------------------------
  log('\n--- 7. CONTROL: an unpublished domain is empty on nodeB ---');
  check('nodeB returns 0 for a domain nobody ever published to',
    (await B.call('get_claims_by_domain', `NeverPublished${Date.now()}`)).length === 0);

  // ---- 8. Both directions ----------------------------------------------
  //
  // One-way propagation would satisfy every check above while being a
  // broken network, so the reverse direction is exercised on its own
  // fresh domain rather than inferred from symmetry.
  log('\n--- 8. The reverse direction: nodeB publishes, nodeA receives ---');
  const REVERSE_DOMAIN = `GossipReverse${Date.now()}`;
  const REVERSE_CONTENT = `Written on nodeB at ${new Date().toISOString()}.`;
  check('nodeA sees 0 in the reverse domain before nodeB publishes',
    (await A.call('get_claims_by_domain', REVERSE_DOMAIN)).length === 0);
  await publishClaim(B, REVERSE_DOMAIN, REVERSE_CONTENT);
  const { ms: reverseMs } = await awaitGossip(A, C, REVERSE_DOMAIN);
  check('nodeA receives nodeB\'s claim over the network', reverseMs !== null);
  if (reverseMs !== null) log(`    arrived after ${(reverseMs / 1000).toFixed(1)}s`);
  const reverseOnA = await A.call('get_claims_by_domain', REVERSE_DOMAIN);
  check('nodeA records the reverse claim\'s author as nodeB',
    reverseOnA.length === 1 && b64(claimEntry(reverseOnA[0]).author) === b64(B.me));

  // ---- 9. The chain-local finding, on a real network -------------------
  //
  // read-scope.mjs established that get_all_constitutions reads the
  // CALLING AGENT'S OWN SOURCE CHAIN rather than the DHT, and it proved
  // that with two agents on one conductor. That setup left one objection
  // permanently open: with both agents on the same node there is no
  // network, so "agent 2 cannot see it" was never fully separable from
  // "there is nothing here to see it with." read-scope answered that by
  // pairing each chain-local read with a link-based read of the same
  // entry at the same moment — a good answer, and an indirect one.
  //
  // Here the objection can be retired directly. Gossip has already been
  // demonstrated between these exact two nodes, moments ago, in both
  // directions. So when nodeA publishes a Constitution and nodeB's
  // get_all_constitutions returns nothing, "it has not gossiped yet" is
  // not available as an explanation — and the paired positive is not a
  // different read of the same entry, it is the network itself.
  //
  // This is the sharpest version of the caveat README.md §9 records: on a
  // real network, a practitioner browsing with a chain-local read sees
  // only their own work. That sentence has been true and untested. It is
  // now tested.
  log('\n--- 9. Chain-local reads stay chain-local ACROSS a working network ---');
  const CONST_DOMAIN = `GossipConstA${Date.now()}`;
  const CONST_DOMAIN_B = `GossipConstB${Date.now()}`;
  const publishConstitution = (node, domain) => node.call('publish_constitution', {
    agent: node.me,
    promises: [{ action: 'distinguish_observation_from_inference', domain, modality: 'Methodological' }],
    conditions: [],
    published_at: nowMicros(),
    expires_at: null,
  });
  await publishConstitution(A, CONST_DOMAIN);
  // nodeB publishes one of its own, so that its get_all_constitutions has
  // something it SHOULD find. Without this, "nodeB does not see nodeA's
  // constitution" is satisfied just as well by a read that is broken and
  // returns nothing to anyone — which is the vacuous pass this project's
  // own convention exists to rule out.
  await publishConstitution(B, CONST_DOMAIN_B);
  check('nodeA sees its own constitution (control: the write worked)',
    (await A.call('get_all_constitutions')).length >= 1);

  // Give it at least as long as gossip demonstrably needed for the claim,
  // so a zero here is a property of the read and not of impatience.
  const constWait = Math.max(arrivedMs ?? 0, reverseMs ?? 0, 10_000);
  log(`    waiting ${(constWait / 1000).toFixed(0)}s — at least as long as gossip took above ...`);
  await sleep(constWait);
  const constOnA = await A.call('get_all_constitutions');
  const constSeenByB = await B.call('get_all_constitutions');
  const constDomains = (records) => records.flatMap((r) =>
    (decode(r.entry.Present.entry).promises ?? []).map((p) => p.domain));
  const bDomains = constDomains(constSeenByB);
  log(`    nodeA get_all_constitutions -> ${constOnA.length}   nodeB -> ${constSeenByB.length}`);
  check('CONTROL: nodeB DOES see its own constitution, so the read is not simply broken',
    bDomains.includes(CONST_DOMAIN_B));
  check('nodeB does NOT see nodeA\'s constitution, on a network proven to carry claims',
    !bDomains.includes(CONST_DOMAIN));

  // The pairing. Without this the check above is satisfied by a network
  // that simply stopped working between check 8 and check 9.
  const PAIR_DOMAIN = `GossipPair${Date.now()}`;
  await publishClaim(A, PAIR_DOMAIN, 'Published alongside the constitution.');
  const { ms: pairMs } = await awaitGossip(B, C, PAIR_DOMAIN);
  check('PAIRED CONTROL: a claim published at the same moment DOES reach nodeB',
    pairMs !== null);

  // ---- Result -----------------------------------------------------------
  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — an entry written on one conductor reached a');
    log('genuinely different conductor over a real iroh QUIC network, an');
    log('isolated conductor never saw it, and chain-local reads stayed');
    log('chain-local across that same working network.');
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nHARNESS ERROR:', e);
  process.exit(1);
});
