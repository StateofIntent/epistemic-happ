#!/usr/bin/env node
// ============================================================================
// cross-internet.mjs — DOES AN ENTRY CROSS BETWEEN TWO HOSTS ON THE REAL
// INTERNET, THROUGH PUBLIC RENDEZVOUS INFRASTRUCTURE?
//
// THE ONE DIMENSION THIS REPOSITORY HAS NEVER TESTED, and it says so in two
// places: README's installation section and INSTALL.md both tell a first-time
// user that "cross-internet peer discovery is the one thing this project has
// never been able to test". Everything else here runs on one machine —
// `sandbox.sh` is a single conductor, `network.sh` is three or four of them
// against a bootstrap server and iroh relay on 127.0.0.1. Loopback peers prove
// gossip works; they prove nothing about peer DISCOVERY across NATs, through a
// public bootstrap, over an iroh relay.
//
// HOW TWO HOSTS COORDINATE WITHOUT TALKING. This runs as two halves on two
// different machines that have no channel between them — and need none, because
// THE DHT IS THE CHANNEL. The publisher writes one claim into a domain both
// sides derive from the same run identifier; the reader polls for it. If the
// reader sees it, discovery and gossip both worked, end to end, across the
// internet. If it does not, one of them did not.
//
// Both halves also derive the same NETWORK SEED, which is what keeps this off
// the DHT real installers share — see `cross-internet-node.sh`'s header for why
// that is a safety requirement rather than hygiene: the shipped `.happ` declares
// no seed, and Invariant #6 means an entry written there could never be removed.
//
// THE PUBLISHER MUST OUTLIVE ITS OWN WRITE, which is the subtlety that makes or
// breaks the run. Holochain is not a server: once the publishing conductor
// exits, there is no peer holding that entry and nothing for the reader to fetch
// it from. So the publisher writes and then HOLDS for the whole window. A
// publisher that exited on success would produce a reader-side failure that
// looks exactly like a discovery failure and is not one.
//
// WHAT A FAILURE DOES AND DOES NOT MEAN. This depends on two third-party
// services — Holochain's dev-test bootstrap and iroh's canary relay. Either
// being down, rate-limiting, or unreachable from a CI runner produces the same
// observable as a protocol problem. That is why this is an EXPERIMENT and not a
// gate: it is never a required check, and a red run is a prompt to look at the
// logs rather than evidence against the protocol. Same standing as
// `peering-rate.mjs` and `dht-isolation-probe.mjs`.
//
// Env:
//   EPI_XNET_ROLE      publisher | reader          (required)
//   EPI_XNET_DOMAIN    the shared domain string    (required, same both sides)
//   EPI_XNET_HOLD_S    seconds to hold/poll        (default 600)
//   EPI_XNET_ADMIN     admin port                  (default 9899)
//   EPI_XNET_APP       app port                    (default 9898, or
//                      DISCOVERED via listAppInterfaces when unset and
//                      EPI_XNET_PACKAGED=1)
//   EPI_XNET_PACKAGED  1 to drive an INSTALLED desktop app — see below
//
// Run: EPI_XNET_ROLE=publisher EPI_XNET_DOMAIN=xnet-123 node scripts/live-verify/cross-internet.mjs
//
// ----------------------------------------------------------------------------
// DRIVING AN INSTALLED DESKTOP APP (EPI_XNET_PACKAGED=1)
//
// This harness was written for `hc sandbox` conductors, and the thing release
// step 3's "against that build" clause needed was two PACKAGED installs — a
// different target, because a sandbox conductor declares no network seed and
// therefore cannot see a desktop peer at all. Item 1.4 closed that by hand on
// 2026-10-26; this flag is so it does not have to be done by hand twice.
//
// Three things differ from a sandbox, and the first two are why pointing this
// at an install used to fail on its first line:
//
//   - ORIGINS. The packaged app's conductor-config.yaml allows `kangaroo` on
//     admin and `webhapp://webhappwindow` on the app interface, and a
//     conductor REJECTS a handshake whose origin is not allowed — as it does
//     one with no Origin header at all, even under `allowed_origins: Any`
//     (README §9's bridge finding). `live-verify` is allowed by neither.
//   - THE APP PORT IS DYNAMIC. A sandbox gets a port we chose; an install
//     attaches its own, so it is read from `listAppInterfaces` rather than
//     assumed. The ADMIN port is dynamic too unless ADMIN_PORT was pinned at
//     launch — read it from the app's log, where it appears as
//     `###ADMIN_PORT:<n>###`.
//   - THE APP ID is `kangaroo.happ`, not this harness's own.
//
// **AND IT IS NOT A READ-ONLY OBSERVER OF SOMEBODY'S INSTALL.** `connect()`
// calls `authorizeSigningCredentials`, because a zome call from outside the
// app's own window cannot be signed without it — and authorising WRITES A CAP
// GRANT TO THAT AGENT'S SOURCE CHAIN, which under Invariant 6 is permanent and
// deletable by nobody. The publisher role then writes a Claim, which is also
// permanent. So this flag is an explicit opt-in rather than a default: running
// it against a real install spends two permanent entries on that agent's
// chain, and there is no version of this that "just looks". The read-only
// route is the admin API's own state dump.
// ----------------------------------------------------------------------------
// ============================================================================
import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';

const ROLE = process.env.EPI_XNET_ROLE ?? '';
const DOMAIN = process.env.EPI_XNET_DOMAIN ?? '';
const HOLD_MS = Number(process.env.EPI_XNET_HOLD_S ?? 600) * 1000;
const ADMIN_PORT = Number(process.env.EPI_XNET_ADMIN ?? 9899);
const PACKAGED = process.env.EPI_XNET_PACKAGED === '1';
// Unset under PACKAGED means "discover it"; 0 is not a usable port either way.
const APP_PORT = Number(process.env.EPI_XNET_APP ?? (PACKAGED ? 0 : 9898));
const ADMIN_ORIGIN = PACKAGED ? 'kangaroo' : 'live-verify';
const APP_ORIGIN = PACKAGED ? 'webhapp://webhappwindow' : 'live-verify';
const APP_ID = PACKAGED ? 'kangaroo.happ' : 'epistemic-xnet';
const POLL_MS = 5_000;

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowMicros = () => Date.now() * 1000;
const b64 = (u8) => Buffer.from(u8).toString('base64');

if (!['publisher', 'reader'].includes(ROLE)) {
  console.error('EPI_XNET_ROLE must be "publisher" or "reader".');
  process.exit(2);
}
if (!DOMAIN) {
  console.error('EPI_XNET_DOMAIN is required and must match on both hosts.');
  process.exit(2);
}
if (PACKAGED) {
  // Said before anything connects, because by the time it has written there is
  // no undo — Invariant 6 applies to the cap grant exactly as it does to the
  // Claim. Printed rather than prompted: this runs unattended on two hosts.
  console.log('EPI_XNET_PACKAGED=1 — driving an INSTALLED app.');
  console.log(`  admin origin ${JSON.stringify(ADMIN_ORIGIN)}, `
    + `app origin ${JSON.stringify(APP_ORIGIN)}, app id ${JSON.stringify(APP_ID)}`);
  console.log('  THIS WRITES TO THAT AGENT\'S CHAIN AND NOTHING CAN DELETE IT:');
  console.log('    - a cap grant, because authorizeSigningCredentials is how a');
  console.log('      zome call from outside the app window gets signed at all;');
  if (ROLE === 'publisher') console.log('    - and a Claim, this role being the one that publishes.');
  console.log('  Both are permanent under Invariant 6. Use a profile you are');
  console.log('  willing to spend, not the one you keep.');
}

let failures = 0;
const check = (label, cond) => {
  log(`  ${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) failures++;
};

async function connect() {
  const admin = await AdminWebsocket.connect({
    url: new URL(`ws://localhost:${ADMIN_PORT}`), wsClientOptions: { origin: ADMIN_ORIGIN },
  });
  // An installed app attaches its own app interface on a port it chose, so ask
  // rather than assume. Reported with its allowed origin, which is the other
  // half of what a handshake needs — a mismatch there is a 400 and not a
  // protocol fault, so it is worth printing before anything else can fail.
  let appPort = APP_PORT;
  if (!appPort) {
    const ifaces = await admin.listAppInterfaces();
    if (ifaces.length === 0) {
      throw new Error('no app interface attached — nothing to connect to. '
        + 'Has the app finished launching? (its log prints ###ADMIN_PORT:<n>### '
        + 'and then `Conductor ready.`)');
    }
    appPort = ifaces[0].port;
    console.log(`  app interface discovered: port ${appPort}, `
      + `allowed_origins=${JSON.stringify(ifaces[0].allowed_origins)} `
      + `(connecting with origin ${JSON.stringify(APP_ORIGIN)})`);
  }
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: APP_ID });
  const app = await AppWebsocket.connect({
    url: new URL(`ws://localhost:${appPort}`), token, wsClientOptions: { origin: APP_ORIGIN },
  });
  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      if (cell?.type === CellType.Provisioned) cellIds.push(cell.value.cell_id);
    }
  }
  if (cellIds.length === 0) throw new Error('no provisioned cells');
  for (const cellId of cellIds) {
    for (let i = 0; i < 30; i++) {
      try { await admin.authorizeSigningCredentials(cellId); break; }
      catch (e) {
        if (!String(e.message ?? e).includes('CellDisabled')) throw e;
        await sleep(1000);
      }
    }
  }
  return {
    dna: cellIds[0][0],
    me: cellIds[0][1],
    call: (fn, payload) => app.callZome({
      role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload,
    }, 60_000),
  };
}

async function main() {
  log(`=== cross-internet ${ROLE} ===`);
  log(`domain: ${DOMAIN}`);
  log(`hold/poll window: ${(HOLD_MS / 1000).toFixed(0)}s`);
  log('');

  const c = await connect();
  // PRINTED ON BOTH SIDES SO A HUMAN CAN CONFIRM THEY MATCH. The two halves
  // cannot compare these with each other — they have no channel — so the
  // comparison is left to whoever reads the two job logs. A mismatch means the
  // seeds differed and the run proves nothing about discovery.
  log(`DNA hash:   ${b64(c.dna)}`);
  log(`agent key:  ${b64(c.me)}`);
  log('');

  if (ROLE === 'publisher') {
    const content = `cross-internet crossing for ${DOMAIN}`;
    await c.call('create_claim', {
      content, domain: DOMAIN, confidence: 'Moderate', semantic_tags: [],
      author: c.me, timestamp: nowMicros(), evidence_hashes: [], attestation_policy: null,
    });
    log(`published one claim into ${DOMAIN}`);
    const mine = await c.call('get_claims_by_domain', DOMAIN);
    check('the publisher can read its own claim back locally', mine.length >= 1);

    // HOLD. Not a courtesy — there is no peer to fetch from once this exits.
    log('');
    log(`holding for ${(HOLD_MS / 1000).toFixed(0)}s so the reader has a peer to gossip with.`);
    log('(a publisher that exited here would produce a reader-side failure');
    log(' indistinguishable from a discovery failure.)');
    const t0 = Date.now();
    while (Date.now() - t0 < HOLD_MS) {
      await sleep(30_000);
      log(`  still up, ${((Date.now() - t0) / 1000).toFixed(0)}s elapsed`);
    }
    log('hold finished.');
  } else {
    log(`polling for a claim in ${DOMAIN} that this host did not write ...`);
    const t0 = Date.now();
    let found = null;
    // THE FIGURE THIS LOOP REPORTS IS AN UPPER BOUND, NOT A LATENCY, and the
    // one it produced is quoted as a measurement. It polls at t≈0 and then
    // every POLL_MS, so "CROSSED in 5.0s" means ABSENT at the first check and
    // PRESENT at the second: the true crossing was anywhere in (0s, 5s]. The
    // single datacentre-to-datacentre crossing README §9 cites as "5.0s" is
    // therefore ≤5s with the real figure unresolved — which understates this
    // substrate rather than flattering it, and is the opposite error to the
    // one the same sampler caused in `partition-rejoin.mjs`, where a coarse
    // grid made a slow crossing look like a deterministic constant.
    //
    // Left coarse deliberately: this harness waits out a cross-internet
    // window on two paid hosts, and a finer poll would spend the budget it
    // exists to conserve. What is fixed is the CLAIM, not the sampler — the
    // poll count travels with the figure so nobody reads an upper bound as a
    // measurement again.
    let polls = 0;
    while (Date.now() - t0 < HOLD_MS) {
      polls++;
      let claims = [];
      try { claims = await c.call('get_claims_by_domain', DOMAIN); }
      catch { /* a read that cannot answer yet is "not yet" */ }
      // AUTHORED ELSEWHERE, asserted rather than assumed. These are separate
      // conductors with separate agent keys, so anything here is necessarily
      // foreign — but checking it is what makes the result mean "it crossed"
      // rather than "something was in the domain".
      const foreign = claims.filter((r) => {
        const a = r?.entry?.Present?.entry?.author ?? r?.author;
        return a ? b64(Uint8Array.from(Object.values(a))) !== b64(c.me) : true;
      });
      if (foreign.length > 0) { found = { at: Date.now() - t0, n: foreign.length, polls }; break; }
      log(`  t+${((Date.now() - t0) / 1000).toFixed(0)}s  nothing yet (${claims.length} local)`);
      await sleep(POLL_MS);
    }
    log('');
    if (found) {
      log(`CROSSED by poll ${found.polls} of a ${(POLL_MS / 1000).toFixed(1)}s sampler`
        + ` — so WITHIN ${(found.at / 1000).toFixed(1)}s, not measured AT it`
        + ` (true crossing somewhere in the preceding ${(POLL_MS / 1000).toFixed(1)}s).`
        + ` ${found.n} claim(s) from the other host.`);
      check('an entry written on another host, on another network, arrived here', true);
    } else {
      log(`NO CROSSING inside ${(HOLD_MS / 1000).toFixed(0)}s.`);
      log('Before reading this as a protocol result, check: did both jobs print');
      log('the SAME DNA hash, did their windows overlap in wall-clock time, and');
      log('is the dev-test bootstrap answering at all? Any of those explains it');
      log('without the protocol being involved.');
      check('an entry written on another host, on another network, arrived here', false);
    }
  }

  log('');
  log(failures === 0 ? 'OK' : `${failures} CHECK(S) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(1); });
