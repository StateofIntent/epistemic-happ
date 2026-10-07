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
//   EPI_XNET_APP       app port                    (default 9898)
//
// Run: EPI_XNET_ROLE=publisher EPI_XNET_DOMAIN=xnet-123 node scripts/live-verify/cross-internet.mjs
// ============================================================================
import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';

const ROLE = process.env.EPI_XNET_ROLE ?? '';
const DOMAIN = process.env.EPI_XNET_DOMAIN ?? '';
const HOLD_MS = Number(process.env.EPI_XNET_HOLD_S ?? 600) * 1000;
const ADMIN_PORT = Number(process.env.EPI_XNET_ADMIN ?? 9899);
const APP_PORT = Number(process.env.EPI_XNET_APP ?? 9898);
const APP_ID = 'epistemic-xnet';
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

let failures = 0;
const check = (label, cond) => {
  log(`  ${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) failures++;
};

async function connect() {
  const admin = await AdminWebsocket.connect({
    url: new URL(`ws://localhost:${ADMIN_PORT}`), wsClientOptions: { origin: 'live-verify' },
  });
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: APP_ID });
  const app = await AppWebsocket.connect({
    url: new URL(`ws://localhost:${APP_PORT}`), token, wsClientOptions: { origin: 'live-verify' },
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
    while (Date.now() - t0 < HOLD_MS) {
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
      if (foreign.length > 0) { found = { at: Date.now() - t0, n: foreign.length }; break; }
      log(`  t+${((Date.now() - t0) / 1000).toFixed(0)}s  nothing yet (${claims.length} local)`);
      await sleep(POLL_MS);
    }
    log('');
    if (found) {
      log(`CROSSED in ${(found.at / 1000).toFixed(1)}s — ${found.n} claim(s) from the other host.`);
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
