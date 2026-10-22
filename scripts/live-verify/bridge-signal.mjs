#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/bridge-signal.mjs — A WAY TO WATCH THE BRIDGE RECEIVE
// A SIGNAL, which is the thing READINESS item 21 said did not exist.
//
// Item 21 is a one-line defect whose blocker reads "Nothing technical", and
// the rest of its row explains why that was never the whole story: "a fix
// nobody watched fail is not evidence. Fixing it needs a way to observe the
// bridge receiving a signal, which does not exist yet." So the fix is not the
// work here — the instrument is.
//
// WHAT MADE THE BRIDGE UNWATCHABLE was not the conductor and not Twitter. It
// was that every decision lived inside a method of a class whose module calls
// `main()` at import: reaching `handleSignal` meant connecting to a conductor
// AND holding four Twitter secrets, so the parse could not be called at all.
// `bridge/src/signal.ts` now holds the decisions as pure functions, and THIS
// HARNESS DRIVES THOSE FUNCTIONS rather than a copy of them. That distinction
// is the whole point: a harness carrying its own parse would pass while the
// bridge stayed broken, which is this repository's "a prober proves the rule
// it probes and silently flatters the rules it does not" in its most direct
// form.
//
// The signals are real. They come off a real conductor's app interface,
// emitted by the coordinator zome because this harness called `create_claim`
// and `create_mew`. Nothing here is a fixture.
//
// WHAT IT FOUND, and only the first was known going in:
//
//   1. THE SIGNAL SHAPE (item 21 as filed). The guard read `signal.zome_name`
//      against the nested `{ type, value: { zome_name, payload } }` that
//      @holochain/client 0.21 delivers, so it evaluated
//      `undefined !== 'epistemic_coordinator'` — always true — and dropped
//      every signal. Masked by the polling fallback, which kept the feature
//      working with latency instead of breaking it.
//
//   2. THE HASH IN THE TWEET WAS RAW BYTES, and this one is NOT masked,
//      because the polling path formats it the same way. A hash arrives as 39
//      bytes; `${entryHash}` decoded them as text, so the "DHT:" reference in
//      every tweet the bridge would compose was mojibake. The Correlative
//      Witness Principle at the top of `bridge/src/index.ts` rests on step 1,
//      "the tweet references the DHT hash" — and a pointer nobody can read
//      back is not a reference.
//
//   3. THE REVERSE LEG LOOKED FOR A FORMAT NOTHING EVER WRITES.
//      `pollMentions` matched /0x[a-fA-F0-9]{64}/ — an Ethereum-shaped hex
//      string, which a Holochain hash is not in any encoding — and passed the
//      match on as a STRING where the zome's `ImportTwitterReplyInput` wants
//      an `EntryHash`. So Twitter -> Holochain could never fire, and failed
//      into a `logger.error` rather than anywhere anybody looks.
//
// 2 AND 3 ARE THE SAME BINDING SEEN FROM BOTH ENDS, and they disagreed with
// each other as well as with reality. Nothing checked that the format the
// bridge WRITES is the format the bridge READS, because the two sides were
// four hundred lines apart and neither was reachable from a test. Section 4
// below is that check, and it is the one this file most wants to keep.
//
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — watched failing against the defects AS THEY ACTUALLY
// SHIPPED, which is better than an injection because it is the real bug, and
// then against one injection per defect to show the three are independent.
// 19 checks total. Every figure below was run; also in READINESS item 21.
//
//   HEAD, all three defects live: 14 reds. Section 1 green (the controls
//   never depended on any of it), everything from section 2 down red.
//   MOST OF THAT IS CASCADE, NOT EVIDENCE — with no parsed signal there is
//   no hash, so sections 3, 4 and 5 red for want of an input. Which is the
//   argument for the three injections rather than for this run.
//
//   Item 21's one-line fix ALONE (defect 1 repaired, 2 and 3 left as
//   shipped): 7 reds. Section 2 goes fully green and the tweet reads
//   `Full context: \u0003Q...`. THIS IS THE RUN THAT JUSTIFIES THE HARNESS:
//   the fix item 21 asked for, applied exactly as its row describes it,
//   ships a bridge whose every tweet carries an unreadable pointer.
//
//   Injection BA, the ownership guard deleted from `parseCoordinatorSignal`
//   — the laziest way to make section 2 green: 1 red, the foreign-zome
//   control. ONLY ONE, and the shortfall is worth keeping: the sibling-
//   variant and empty-payload controls still pass, because the variant
//   check below returns null for a MetabolicTick whether the guard ran or
//   not. So the foreign-zome control is the ONLY check standing between
//   this module and claiming every signal on the interface. It is first for
//   that reason, and a second zome on this conductor would be the stronger
//   version of it that does not exist yet.
//
//   Injection BB, `formatDhtHash` returning `String(hash)` for a Uint8Array
//   (defect 2 alone): 7 reds, and SECTION 2 STAYS GREEN — the evidence that
//   the signal shape and the hash encoding are two defects, not one.
//
//   Injection BC, the `0x` pattern and the string passthrough restored
//   (defect 3 alone): 4 reds, all in section 4, with section 3 green.
//   BC EXISTS BECAUSE DEFECT 3 WAS MASKED BY DEFECT 2: while the tweet
//   carried raw bytes, section 4 red whatever the pattern was, so the third
//   defect could not be seen until the second was fixed. Two of these were
//   hiding behind the one item 21 named.
//
// Re-check all four the same way if you change what this asserts.
// ---------------------------------------------------------------------------
// Prereqs: a sandbox conductor (scripts/sandbox.sh clean && start), a built
// .happ, and a BUILT BRIDGE — `npm --prefix bridge ci && npm --prefix bridge
// run build` — because this harness imports the bridge's own compiled module
// on purpose. If `bridge/dist/signal.js` is missing it says so and exits 1
// rather than falling back to a local copy of the parse, which would make it
// a test of itself.
//
// No browser: the bridge has no screen, and asserting one would be testing
// nothing.
// ============================================================================

import { AdminWebsocket, AppWebsocket, CellType, encodeHashToBase64 } from '@holochain/client';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_ID = 'epistemic-resonance-happ';
const DOMAIN = `BridgeSignal${Date.now()}`;

// How long to wait for a signal the conductor emits synchronously with the
// call that causes it. Generous: what is under test is the parse, and a tight
// window would red on websocket scheduling rather than on the subject.
const SIGNAL_WAIT_MS = 10_000;

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Raw bytes that found their way into text: C0 controls, and the replacement
// character a lossy UTF-8 decode leaves behind. Built from escapes rather
// than literals so the pattern survives being copied around.
const RAW_BYTE_RE = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\uFFFD]');

// --- the bridge's own module, or nothing -----------------------------------
const here = dirname(fileURLToPath(import.meta.url));
const distPath = resolve(here, '../../bridge/dist/signal.js');
if (!existsSync(distPath)) {
  log('SETUP FAILED: bridge/dist/signal.js is not built.');
  log("  This harness drives the BRIDGE'S OWN parse, not a copy of it, so");
  log('  there is nothing to test until the bridge is compiled:');
  log('    npm --prefix bridge ci && npm --prefix bridge run build');
  process.exit(1);
}
// `require` rather than `import`: bridge/tsconfig.json emits CommonJS, and
// reaching it through createRequire is the honest way in from an ESM harness.
const bridge = createRequire(import.meta.url)(distPath);
const {
  parseCoordinatorSignal, formatDhtHash,
  buildMewTweet, buildClaimTweet,
  DHT_HASH_REF, decodeDhtHashRef,
} = bridge;

async function main() {
  log('=== THE BRIDGE RECEIVES A SIGNAL (READINESS item 21) ===\n');
  log(`  driving ${distPath.replace(/^.*\/epistemic-happ\//, '')}\n`);

  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: APP_ID });
  const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });

  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      if (cell?.type === CellType.Provisioned || cell?.type === CellType.Cloned) cellIds.push(cell.value.cell_id);
    }
  }
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  const me = cellIds[0][1];
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });

  // Every raw signal this process is handed, untouched. The harness must not
  // reshape them before the bridge sees them — the shape IS the subject.
  const raw = [];
  app.on('signal', (s) => raw.push(s));

  const waitForSignal = async (from) => {
    const deadline = Date.now() + SIGNAL_WAIT_MS;
    while (raw.length <= from && Date.now() < deadline) await sleep(100);
    return raw.length > from ? raw[from] : null;
  };

  // === 1. The controls: signals this bridge must NOT claim ================
  // First, because they are the checks that do not depend on the fix, and the
  // ones a lazy fix breaks. Deleting the ownership guard makes every
  // assertion in section 2 pass; these are what notice.
  log('--- 1. The controls: what the bridge must refuse to claim ---');

  check('CONTROL: a shape-correct signal from ANOTHER zome is not claimed',
    parseCoordinatorSignal({
      type: 'app',
      value: {
        cell_id: cellIds[0], zome_name: 'some_other_coordinator',
        payload: { NewClaim: { claim: { content: 'not mine' }, entry_hash: new Uint8Array(39) } },
      },
    }) === null);

  check('CONTROL: a MetabolicTick — a real sibling variant — is not claimed',
    parseCoordinatorSignal({
      type: 'app',
      value: {
        cell_id: cellIds[0], zome_name: 'epistemic_coordinator',
        payload: { MetabolicTick: { claims: 1 } },
      },
    }) === null);

  check('CONTROL: a signal with no payload at all is not claimed, and does not throw',
    parseCoordinatorSignal({ type: 'app', value: { cell_id: cellIds[0], zome_name: 'epistemic_coordinator' } }) === null);

  // === 2. A real signal, off a real conductor ============================
  log('\n--- 2. A real claim, and the signal the coordinator emits for it ---');
  const before = raw.length;
  const content = 'A claim the bridge is supposed to witness.';
  await call('create_claim', {
    content, domain: DOMAIN, confidence: 'Moderate', evidence_hashes: [],
    semantic_tags: [], author: me, timestamp: Date.now() * 1000,
  });

  const claimSignal = await waitForSignal(before);
  check('a signal reaches this process at all, so the harness is wired to the interface',
    claimSignal !== null);
  if (!claimSignal) {
    log(`    No signal arrived in ${SIGNAL_WAIT_MS / 1000}s. Nothing below can mean anything:`);
    log('    every parse assertion would red for the wrong reason. Check the conductor.');
    log(`\n${failures} CHECK(S) FAILED`);
    process.exit(1);
  }
  log(`    top-level keys as delivered: [${Object.keys(claimSignal).join(', ')}]`);

  const parsedClaim = parseCoordinatorSignal(claimSignal);
  check("THE BRIDGE'S OWN PARSE CLAIMS IT — this is item 21, and the red was here",
    parsedClaim !== null);
  check('it is recognised as a NewClaim',
    parsedClaim?.kind === 'NewClaim');
  check('the claim content survives the parse intact',
    parsedClaim?.claim?.content === content);
  check('the parse yields an entry hash of 39 bytes, not undefined',
    parsedClaim?.entryHash?.length === 39);

  // The hash must be the REAL one, not merely present: a parse that returned
  // some other field of the right length would pass the check above.
  let resolves = null;
  if (parsedClaim?.entryHash) {
    resolves = await call('get_claim', parsedClaim.entryHash);
  }
  check('THE PARSED HASH RESOLVES ON THE DHT to the claim that caused the signal',
    resolves?.content === content);

  // === 3. The pointer the tweet carries =================================
  log('\n--- 3. What the tweet says, which is where the second defect was ---');
  const expectedRef = parsedClaim?.entryHash ? encodeHashToBase64(parsedClaim.entryHash) : '<no hash>';
  const claimTweet = parsedClaim ? buildClaimTweet(parsedClaim.claim, parsedClaim.entryHash) : { text: '', excerpt: '' };
  log(`    hash as base64: ${expectedRef}`);
  log(`    tweet text:     ${JSON.stringify(claimTweet.text.slice(0, 120))}`);

  check('THE TWEET CARRIES THE HASH IN BASE64 — the readable witness pointer',
    claimTweet.text.includes(expectedRef));
  // Named separately because it is the symptom somebody would actually see,
  // and it stays red under a fix that encodes to some OTHER string.
  check('the tweet text contains no raw bytes (no C0 controls, no replacement chars)',
    !RAW_BYTE_RE.test(claimTweet.text));
  check("the tweet still carries the claim's content and domain",
    claimTweet.text.includes(content) && claimTweet.text.includes(DOMAIN));

  // A Mew takes the other code path, with its own builder and its own prefix.
  log('\n    and the same for a Mew, which is the other builder:');
  const mewBefore = raw.length;
  const mewContent = 'A mew the bridge is supposed to witness.';
  await call('create_mew', {
    content: mewContent, author: me, timestamp: Date.now() * 1000,
    reply_to: null, semantic_tags: [], linked_claim: null,
  });
  const mewSignal = await waitForSignal(mewBefore);
  const parsedMew = mewSignal ? parseCoordinatorSignal(mewSignal) : null;
  check('a NewMew signal parses as a NewMew',
    parsedMew?.kind === 'NewMew' && parsedMew?.mew?.content === mewContent);
  const mewTweet = parsedMew ? buildMewTweet(parsedMew.mew, parsedMew.entryHash) : { text: '', excerpt: '' };
  check("the Mew's tweet carries its hash in base64 too",
    parsedMew?.entryHash ? mewTweet.text.includes(encodeHashToBase64(parsedMew.entryHash)) : false);

  // === 4. The binding read back from the other end ======================
  // The check this file most wants to keep: the bridge WRITES a reference
  // into a tweet and READS one back out of a reply, and until now nothing
  // confirmed the two formats were the same. They were not.
  log('\n--- 4. The reverse leg: does the bridge read back what it wrote? ---');
  // The reply is built from the tweet the bridge composed, the way a real
  // one would be — a human quoting the reference back at it.
  const quoted = claimTweet.text.match(DHT_HASH_REF)?.[0] ?? '';
  const reply = `Interesting, but the sample size is small. ${quoted}`;
  const matched = reply.match(DHT_HASH_REF)?.[0];
  check('THE MENTION-IMPORT PATTERN MATCHES THE REFERENCE THE BRIDGE ITSELF WROTE',
    typeof matched === 'string' && matched === expectedRef);

  const decoded = matched ? decodeDhtHashRef(matched) : null;
  check('the matched reference decodes back to the SAME 39 bytes the signal carried',
    decoded != null && parsedClaim?.entryHash != null &&
    Buffer.from(decoded).equals(Buffer.from(parsedClaim.entryHash)));

  // And the DHT must accept it, which is the half a format agreement cannot
  // prove on its own: `ImportTwitterReplyInput.linked_holochain_claim` is an
  // `EntryHash`, and the old code handed it a string.
  let imported = false;
  if (decoded) {
    try {
      await call('import_twitter_reply', {
        twitter_id: '1790000000000000000',
        author_handle: 'a_sceptic',
        content: reply,
        linked_holochain_claim: decoded,
        imported_at: Date.now(),
      });
      imported = true;
    } catch (e) {
      log(`    import_twitter_reply refused it: ${String(e).slice(0, 200)}`);
    }
  }
  check('the decoded hash is accepted as an EntryHash by import_twitter_reply',
    imported);

  const replies = decoded && imported ? await call('get_twitter_replies_for_claim', decoded) : [];
  check('the imported critique is linked to the claim the signal was about',
    Array.isArray(replies) && replies.length === 1);

  // === 5. The half that was always right ================================
  // Recorded as a check so nobody "fixes" `mew_hash` to base64 to match the
  // tweet text. The DHT side wants the bytes; only the text wanted base64.
  log('\n--- 5. The DHT half of the witness, which was never broken ---');
  let mirrored = false;
  if (parsedClaim?.entryHash) {
    try {
      await call('record_twitter_mirror', {
        mew_hash: parsedClaim.entryHash,
        twitter_id: '1790000000000000001',
        platform: 'twitter',
        mirrored_at: Date.now(),
        carried_fields: ['content', 'domain'],
        dropped_fields: ['author', 'timestamp', 'evidence_hashes', 'confidence', 'semantic_tags', 'source_mew'],
        original_length: content.length,
        excerpt_length: claimTweet.excerpt.length,
      });
      mirrored = true;
    } catch (e) {
      log(`    record_twitter_mirror refused the raw bytes: ${String(e).slice(0, 200)}`);
    }
  }
  check('record_twitter_mirror accepts the RAW bytes — so the fix belongs in the text, not here',
    mirrored);

  log('');
  if (failures === 0) log('ALL CHECKS PASSED');
  else log(`${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
