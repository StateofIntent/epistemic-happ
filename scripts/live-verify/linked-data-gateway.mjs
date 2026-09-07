#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/linked-data-gateway.mjs — THE LINKED DATA FACE.
//
// WHAT IT IS FOR. The design note's diagnosis of the Semantic Web is that it
// bought universal addresses and machine-readable structure and paid with no
// native model of disagreement and weak provenance. This protocol is the other
// way round: typed disagreement and cryptographic provenance, addressed by a
// hash nobody can paste into a browser. The gateway is the export that gives
// the second one the first one's reach — and the only interesting question is
// whether it can do that without becoming the thing it is exporting away from.
//
// THREE PROPERTIES, and each is a way the export could quietly go wrong:
//
//   1. ONE WAY. The DHT is the source, HTTP is the mirror. Checked at the
//      protocol level (POST is refused, with a reason) and structurally
//      (the built bundle contains no coordinator write function at all, and
//      every zome call goes through an allowlist that has none in it).
//
//   2. THE HASH TRAVELS AND STAYS CANONICAL. Every document carries the
//      entry's real address and says the DHT copy is authoritative. An export
//      whose provenance is its own URL has re-created the weak-provenance
//      problem it exists to answer.
//
//   3. NOTHING BECOMES A SCORE. schema.org has `aggregateRating`,
//      `ratingValue`, `interactionStatistic` and `upvoteCount`, and every one
//      of them would accept this protocol's critiques as input and emit
//      exactly the canonical comparative number Invariant 1 refuses — under
//      the protocol's own name, in a document every downstream tool would
//      believe. Asserted as an ABSENCE across every document this gateway
//      serves, because an absence is the only form this property can take.
//
// AND THE RETRACTION CHECK IS THE ONE THAT MATTERS MOST IN PRACTICE. A
// one-way export that drops a retraction leaves the web asserting something
// its author has publicly withdrawn, permanently and in their name. So the
// retraction has to be IN the document, and ABOVE the claim on the page —
// checked by document order, not by presence, the same lesson `founding-ui`
// records after its own presence-only assertion was found to pass a broken
// layout.
//
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — watched failing, and its own first run found three real
// defects before anything was injected.
//
//   Injection: emitting a schema.org `aggregateRating` computed from the
//   critique count — the single most plausible "helpful" addition anyone
//   would make to this export, and the one that would publish a canonical
//   comparative score under the protocol's name.
//   Result: two reds — the claim document's rating check and the page's,
//   since the page embeds the same JSON-LD. The domain and index documents
//   correctly stayed green: the injection only touched claim documents, and a
//   harness that went red on all three would have been asserting something
//   vaguer than it claims.
//
//   FOUND WITHOUT INJECTION, on the first run:
//   - A made-up hash reached the conductor and came back as a wasm
//     deserialization error, so a wrong URL was reported as a 502 about the
//     gateway. Now shape-checked before the call: 39 bytes, or a 400 that
//     says the address is malformed rather than that the claim is missing.
//   - Two of these checks were wrong rather than the code. The retraction
//     ordering check compared indices over the WHOLE document, and the
//     embedded JSON-LD in <head> carries the claim text too — so it measured
//     against that copy and went red against a correct page. And the "mode is
//     a label, not a severity" check forbade the word "score" anywhere in the
//     HTML, which the page legitimately uses to say there is not one. Both
//     now assert against markup and body order.
// ---------------------------------------------------------------------------
// Prereqs: a CLEAN sandbox (`scripts/sandbox.sh clean && start`) and a built
// gateway (`cd gateway && npm install && npm run build`). Starts and stops its
// own gateway on port 8796. Spends one unit of the critique budget.
//
// No browser: this is a machine-facing surface and its HTML is static, so the
// checks read the served bytes directly. That is a real limit — nothing here
// says the page looks right on a phone.
// ============================================================================

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_ID = 'epistemic-resonance-happ';
const PORT = Number(process.env.EPI_GATEWAY_TEST_PORT ?? 8796);
const ORIGIN = `http://localhost:${PORT}`;
const MAIN = new URL('../../gateway/dist/main.js', import.meta.url).pathname;
const SERVER_JS = new URL('../../gateway/dist/server.js', import.meta.url).pathname;
const CONDUCTOR_JS = new URL('../../gateway/dist/conductor.js', import.meta.url).pathname;

const STAMP = Date.now();
const DOMAIN = `GatewayDomain${STAMP}`;
const CLAIM_TEXT = `A claim exported over HTTP, stamped ${STAMP}.`;
const RETRACTED_TEXT = `A claim its author took back, stamped ${STAMP}.`;
const CRITIQUE_TEXT = `A methodological objection, stamped ${STAMP}.`;
const RETRACTION_REASON = `Withdrawn because the measurement was wrong, stamped ${STAMP}.`;
const FLAG_RATIONALE = `Looks like a repost flood, stamped ${STAMP}.`;

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};
function setupFail(lines) {
  log('');
  for (const l of lines) log(`  SETUP FAILED: ${l}`);
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (u8) => Buffer.from(u8).toString('base64');
const b64url = (u8) => Buffer.from(u8).toString('base64url');
const nowMicros = () => Date.now() * 1000;

async function main() {
  if (!existsSync(MAIN)) {
    setupFail([`${MAIN} does not exist.`, 'Run: cd gateway && npm install && npm run build']);
  }

  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: APP_ID });
  const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const cellIds = [];
  for (const rc of Object.values(info.cell_info)) {
    for (const c of rc) {
      if (c?.type === CellType.Provisioned || c?.type === CellType.Cloned) cellIds.push(c.value.cell_id);
    }
  }
  if (cellIds.length === 0) setupFail([`App "${APP_ID}" has no provisioned cells.`]);
  for (const id of cellIds) await admin.authorizeSigningCredentials(id);
  const dnaHash = b64(cellIds[0][0]);
  const me = cellIds[0][1];
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });

  // --- Real entries for the export to carry ---------------------------------
  log('Publishing real entries to export...');
  const claimOf = (content) => ({
    content, domain: DOMAIN, author: me, timestamp: nowMicros(),
    evidence_hashes: [], confidence: 'Moderate', semantic_tags: ['exported'], source_mew: null,
  });
  await call('create_claim', claimOf(CLAIM_TEXT));
  await call('create_claim', claimOf(RETRACTED_TEXT));
  const records = await call('get_claims_by_domain', DOMAIN);
  const hashOf = (text) => {
    const record = records.find((r) => {
      const bytes = r.entry?.Present?.entry;
      return bytes && Buffer.from(bytes).includes(text);
    });
    if (!record) setupFail([`could not find the claim "${text}" back on the DHT`]);
    return record.signed_action.hashed.content.data.entry_hash;
  };
  const claimHash = hashOf(CLAIM_TEXT);
  const retractedHash = hashOf(RETRACTED_TEXT);

  await call('create_critique', {
    target: claimHash, target_type: 'Claim', critique_mode: 'Methodological',
    content: CRITIQUE_TEXT, author: me, timestamp: nowMicros(),
    replication_attempted: false, evidence_hashes: [], species: null,
  });
  await call('create_retraction', {
    target_claim: retractedHash, reason: RETRACTION_REASON,
    replacement_claim: null, author: me, timestamp: nowMicros(),
  });
  await call('publish_antibody_pattern', {
    target: claimHash, target_type: 'Claim', kind: 'SpamFlood',
    rationale: FLAG_RATIONALE, author: me, timestamp: nowMicros(),
  });

  // --- The gateway ----------------------------------------------------------
  const gateway = spawn(process.execPath, [MAIN], {
    env: {
      ...process.env,
      EPI_GATEWAY_PORT: String(PORT),
      EPI_GATEWAY_ORIGIN: ORIGIN,
      EPI_GATEWAY_DNA_HASH: dnaHash,
      EPI_GATEWAY_INDEXABLE: '',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  gateway.stderr.on('data', (d) => process.stderr.write(`[gateway stderr] ${d}`));
  let up = false;
  for (let i = 0; i < 200; i++) {
    await sleep(100);
    try { if ((await fetch(`${ORIGIN}/ns`)).ok) { up = true; break; } } catch { /* not up */ }
  }
  if (!up) { gateway.kill('SIGKILL'); setupFail([`the gateway never answered on ${ORIGIN}`]); }

  const claimPath = `/claims/${b64url(claimHash)}`;
  const retractedPath = `/claims/${b64url(retractedHash)}`;

  try {
    // === 1. One URL, two forms ===========================================
    log('\n=== 1. A normal link, and a machine-readable one ===');
    const page = await fetch(`${ORIGIN}${claimPath}`);
    const html = await page.text();
    check('a claim has an ordinary web page', page.ok && html.includes(CLAIM_TEXT));
    check('and it is served as HTML to a browser',
      /text\/html/.test(page.headers.get('content-type') ?? ''));
    check('the page embeds its own JSON-LD, so a pasted link carries its data with it',
      /<script type="application\/ld\+json">/.test(html));

    const negotiated = await fetch(`${ORIGIN}${claimPath}`, { headers: { accept: 'application/ld+json' } });
    check('asking for application/ld+json at the SAME url returns JSON-LD',
      /application\/ld\+json/.test(negotiated.headers.get('content-type') ?? ''));
    const doc = await negotiated.json();
    const suffixed = await (await fetch(`${ORIGIN}${claimPath}.jsonld`)).json();
    check('and a .jsonld suffix works too, for anywhere an Accept header cannot go',
      suffixed['@id'] === doc['@id']);
    check('the document has a resolvable @id on this gateway',
      doc['@id'] === `${ORIGIN}${claimPath}`);
    check('and a @context a consumer can actually dereference',
      Array.isArray(doc['@context']) && doc['@context'][0] === 'https://schema.org/');
    const ns = await fetch(`${ORIGIN}/ns`);
    check('the protocol-specific vocabulary is a real page, not an invented URL that 404s',
      ns.ok && /critiqueMode/.test(await ns.text()));

    // === 2. The hash travels, and stays canonical =========================
    log('\n=== 2. Provenance ===');
    check('the exported document carries the entry\'s own Holochain hash',
      doc.canonicalHash === b64(claimHash));
    check('and says which kind of hash it is', doc.canonicalHashAlgorithm === 'holochain-entry-hash');
    check('and names the network it came from — the same hash on another DNA is another claim',
      doc.dnaHash === dnaHash);
    check('and states in the data, not only in prose, that the DHT copy is authoritative',
      /canonical/i.test(JSON.stringify(doc.isBasedOn ?? '')) && /authoritative/i.test(JSON.stringify(doc.isBasedOn ?? '')));
    check('the human page shows the canonical hash too', html.includes(b64(claimHash)));

    // === 3. Typed disagreement survives the export ========================
    log('\n=== 3. The thing Linked Data had no way to say ===');
    check('the claim\'s critiques travel with it', Array.isArray(doc.critique) && doc.critique.length === 1);
    check('and each keeps its protocol mode, unflattened', doc.critique[0].critiqueMode === 'Methodological');
    check('each critique has its own dereferenceable identifier',
      String(doc.critique[0]['@id']).startsWith(`${ORIGIN}${claimPath}#critique-`));
    // The mode has to be rendered as a NAME, not as a severity — checked
    // against the markup rather than against the prose, since the page
    // legitimately uses the word "score" to say there is not one.
    check('the page renders the mode as a plain label',
      /class="mode">\s*Methodological\s*</.test(html));
    check('and nothing on it is marked up as a rating',
      !/aggregateRating|ratingValue|itemprop="rating|class="[^"]*(score|rank|rating)/i.test(html));

    // === 4. Nothing became a score =======================================
    log('\n=== 4. No score, anywhere ===');
    const RANKING = /aggregateRating|ratingValue|reviewRating|interactionStatistic|upvoteCount|downvoteCount|ratingCount|bestRating/;
    const domainDoc = await (await fetch(`${ORIGIN}/domains/${encodeURIComponent(DOMAIN)}.jsonld`)).json();
    const indexDoc = await (await fetch(`${ORIGIN}/.jsonld`, { headers: { accept: 'application/ld+json' } })).json()
      .catch(() => null);
    const rootDoc = indexDoc ?? await (await fetch(`${ORIGIN}/`, { headers: { accept: 'application/ld+json' } })).json();
    for (const [name, document] of [['claim', doc], ['domain', domainDoc], ['index', rootDoc]]) {
      check(`the ${name} document emits no rating vocabulary at all`,
        !RANKING.test(JSON.stringify(document)));
    }
    check('a domain listing declares itself UNORDERED rather than leaving a consumer to infer a ranking',
      domainDoc.itemListOrder === 'https://schema.org/ItemListUnordered');
    check('and lists the domain\'s claims', domainDoc.itemListElement.length >= 2);
    check('the vocabulary page states the absence of a score as a decision',
      /no term for a rating|no score/i.test(await (await fetch(`${ORIGIN}/ns`)).text()));

    // === 5. A retraction is not lost in translation ======================
    log('\n=== 5. The export cannot outlive a retraction ===');
    const retractedDoc = await (await fetch(`${ORIGIN}${retractedPath}.jsonld`)).json();
    check('a retracted claim exports its retraction',
      Array.isArray(retractedDoc.retraction) && retractedDoc.retraction.length === 1);
    check('with the author\'s own reason', retractedDoc.retraction[0].text === RETRACTION_REASON);
    const retractedHtml = await (await fetch(`${ORIGIN}${retractedPath}`)).text();
    check('the page says it was retracted', retractedHtml.includes('Retracted'));
    // Order, not presence: a retraction below the claim lets a reader finish
    // the claim believing it stands. Measured over the BODY only — the
    // embedded JSON-LD in <head> carries the claim text too, so comparing
    // over the whole document compares against that copy rather than the one
    // a person reads. The first version of this check did exactly that and
    // went red against a page that was correct.
    const readable = retractedHtml.slice(retractedHtml.indexOf('<main>'));
    check('and says so ABOVE the claim, where it is read first',
      readable.indexOf('Retracted') < readable.indexOf(RETRACTED_TEXT));
    check('the claim itself is still exported — a retraction withdraws, it does not delete',
      retractedHtml.includes(RETRACTED_TEXT));

    check('an antibody flag travels too, with its accuser attached',
      Array.isArray(doc.flag) && doc.flag.length === 1 && doc.flag[0].name === 'SpamFlood');

    // === 6. One way ======================================================
    log('\n=== 6. One way ===');
    const posted = await fetch(`${ORIGIN}${claimPath}`, { method: 'POST', body: '{}' });
    check('a write is refused at the HTTP level', posted.status === 405);
    const refusal = await posted.text();
    check('and the refusal explains where writing actually happens',
      /one-way|one way/i.test(refusal) && /agent key/i.test(refusal));

    // The structural half. A gateway that COULD write would need a rule
    // saying it must not.
    const built = readFileSync(SERVER_JS, 'utf8') + readFileSync(CONDUCTOR_JS, 'utf8');
    const WRITES = /create_claim|create_critique|create_evidence|create_membrane|publish_constitution|publish_antibody_pattern|create_retraction|promote_mew_to_claim|create_mew|grant_attestation|reinforce_synaptic_link|join_membrane|create_critique_species/;
    check('the built gateway contains no coordinator write function, anywhere', !WRITES.test(built));
    check('and every zome call goes through an allowlist that refuses anything else',
      /is not a read this gateway may perform/.test(built));

    // === 7. Publishing to a DHT is not consent to being indexed ===========
    log('\n=== 7. Indexing is the operator\'s decision, not a side effect ===');
    check('pages are noindex by default', /noindex/.test(page.headers.get('x-robots-tag') ?? ''));
    check('and robots.txt agrees rather than contradicting the header',
      /Disallow: \//.test(await (await fetch(`${ORIGIN}/robots.txt`)).text()));

    // === 8. What a gateway can and cannot see =============================
    log('\n=== 8. Honest about its own limits ===');
    // A WELL-FORMED hash of something that does not exist: the real claim's
    // hash with two digest bytes flipped, keeping the 3-byte prefix and the
    // 39-byte length. A made-up string of the wrong length tests the parser
    // instead, which is a different question and is asked separately below.
    const unknown = Buffer.from(claimHash);
    unknown[10] ^= 0xff;
    unknown[11] ^= 0xff;
    const missing = await fetch(`${ORIGIN}/claims/${b64url(unknown)}`);
    check('a well-formed hash this node does not hold is a 404', missing.status === 404);
    check('and the 404 distinguishes "does not exist" from "has not reached this node"',
      /not have reached this node|not reached/i.test(await missing.text()));
    const badHash = await fetch(`${ORIGIN}/claims/${b64url(Buffer.from(`too-short-${STAMP}`))}`);
    check('a malformed hash is reported as a malformed address, not as a gateway failure',
      badHash.status === 400 && /malformed address/i.test(await badHash.text()));
  } finally {
    gateway.kill('SIGTERM');
  }

  log('');
  if (failures === 0) log('ALL CHECKS PASSED');
  else log(`${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
