#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/mcp-server.mjs — the MCP server, driven the way an
// agent would drive it: over stdio, as JSON-RPC, against a real conductor.
//
// WHY NOT JUST IMPORT IT. The thing under test is the PROTOCOL BOUNDARY, not
// the functions behind it. An agent never calls these handlers; it lists
// tools, reads their schemas, and sends `tools/call` frames down a pipe. A
// test that imported the module would verify the half that was never in
// doubt and skip the half that is: whether the tool list is discoverable,
// whether the schemas say what the agent needs, and whether a hash returned
// by one call can be fed straight into the next.
//
// THAT LAST ONE IS THE POINT. An agent copies an identifier out of a result
// and pastes it into the next argument, so hashes must round-trip as strings
// with no encoding step a model has to infer. The server returns base64
// everywhere and accepts base64 everywhere; this file proves it by taking a
// hash out of `claims_in_domain` and using it verbatim as the argument to
// `critiques_for_claim`, with no transformation in between.
//
// IT ALSO CHECKS TWO ABSENCES, because for this protocol what is missing is
// as load-bearing as what is present. Invariant 1 forbids a canonical
// comparative score, so there must be NO tool offering ranked, best or top
// results — an agent that found one would use it, and the invariant would be
// broken from outside rather than inside. And retraction must not describe
// itself as deletion, since a model reaching for `retract` expecting removal
// would be wrong about what it just did to the record.
//
// Prereqs: a CLEAN sandbox (scripts/sandbox.sh clean && start), agent-sdk
// built, and mcp-server built (npm install && npm run build in each).
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing, and its first
// run caught a real bug in the server plus a real bug in itself.
//
//   FIRST RUN, before any injection: eight red. The server answered every
//   tool call with "Invalid URL". The cause was in the server and worth
//   recording because it is silent by construction: it passed
//   `adminUrl: process.env.EPISTEMIC_ADMIN_URL` unconditionally, and an
//   explicit `undefined` is NOT the same as an omitted key — the SDK merges
//   over its defaults, so undefined overwrote a working default with nothing
//   and surfaced much later as a bare URL-constructor error. Fixed by
//   building the config from only the variables that are actually set.
//
//   THE SAME RUN EXPOSED A FALSE POSITIVE IN THIS FILE. "No tool description
//   promises ordering by merit" went red against the server's own DISCLAIMER
//   — claims_in_domain says there is "no way to ask for the best, most
//   supported or most critiqued claims", and a keyword search cannot tell a
//   refusal from an offer. Re-anchored on phrasing that only parses as an
//   offer. A check that cannot distinguish a promise from its denial would
//   have had to be deleted or worked around later, and either would have
//   quietly removed the guard.
//
//   AND A VACUOUS PASS, in the same run, which is the one worth remembering.
//   "claims_awaiting_my_critique excludes what this agent already critiqued"
//   stayed GREEN while every call was failing and returning an empty list.
//   An absence check passes on nothing at all. It now publishes a second,
//   uncritiqued claim and requires that one to be PRESENT, so the absence of
//   the first means something.
//
//   Injection: a `top_claims` tool advertised as "the most supported claims
//   in a domain, ranked by score".
//   Result: both Invariant 1 absence checks red — the name check and the
//   description check. This is the injection this file exists for. The UI
//   has been kept free of ranking with some care; the agent surface is the
//   other door into the same protocol, and a ranked tool here would breach
//   the invariant just as thoroughly while never appearing on a screen.
//
//   Injection: hashes returned as hex instead of base64.
//   Result: three red — the two round-trip checks and the critique they
//   depended on. NOTE WHICH CHECK DID NOT FAIL: "claims carry a base64
//   entry_hash" stayed green, because hex characters are a subset of the
//   base64 character class and a format regex cannot tell them apart. The
//   format assertion is weaker than it looks and the ROUND TRIP is what
//   actually proves the property — feeding a returned hash back in verbatim
//   and requiring it to work.
//
//   Restored and re-run: 21 checks green.
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process';

const STAMP = Date.now();
const DOMAIN = `McpDomain${STAMP}`;
const CLAIM_TEXT = `A claim published through MCP, stamped ${STAMP}.`;
const CRITIQUE_TEXT = `A critique made through MCP, stamped ${STAMP}.`;

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

// --- a minimal MCP client, so this harness depends on the wire format
//     rather than on the server's own library version ---------------------
const server = spawn('node', ['dist/index.js'], {
  cwd: new URL('../../mcp-server/', import.meta.url).pathname,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env },
});
let stderr = '';
server.stderr.on('data', (d) => { stderr += d.toString(); });

let buffer = '';
const pending = new Map();
server.stdout.on('data', (d) => {
  buffer += d.toString();
  let nl;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    const resolve = pending.get(msg.id);
    if (resolve) { pending.delete(msg.id); resolve(msg); }
  }
});

let nextId = 1;
const rpc = (method, params) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, resolve);
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout on ${method}`)); } }, 30000);
});
const callTool = async (name, args) => {
  const r = await rpc('tools/call', { name, arguments: args });
  const text = r.result?.content?.[0]?.text ?? '';
  return { isError: r.result?.isError === true, text, parsed: (() => { try { return JSON.parse(text); } catch { return null; } })() };
};

async function main() {
  await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'live-verify', version: '0' },
  });
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);

  // ---- 1. Discoverable ------------------------------------------------
  log('--- 1. An agent can discover the protocol from the tool list alone ---');
  const listed = await rpc('tools/list', {});
  const tools = listed.result?.tools ?? [];
  const names = tools.map((t) => t.name);
  check(`the server advertises its tools (${tools.length} found)`, tools.length >= 8);
  check('every tool carries a description an agent can act on',
    tools.every((t) => typeof t.description === 'string' && t.description.length > 40));
  check('every tool carries an input schema', tools.every((t) => t.inputSchema?.type === 'object'));
  const publish = tools.find((t) => t.name === 'publish_claim');
  check('confidence is an enumerated choice, not free text — the vocabulary is discoverable',
    Array.isArray(publish?.inputSchema?.properties?.confidence?.enum)
    && publish.inputSchema.properties.confidence.enum.length >= 4);
  check('confidence is REQUIRED — an agent cannot publish without declaring one',
    (publish?.inputSchema?.required ?? []).includes('confidence'));
  const crit = tools.find((t) => t.name === 'critique_claim');
  check('critique mode is an enumerated choice too', Array.isArray(crit?.inputSchema?.properties?.mode?.enum));

  // ---- 2. The absences -------------------------------------------------
  log('\n--- 2. What is deliberately NOT offered ---');
  check('CONTROL: no tool offers ranked, top or best results — Invariant 1 cannot be broken from outside',
    !names.some((n) => /rank|top|best|score|leaderboard|popular|trending/i.test(n)));
  // Matches a PROMISE of ordering, not a denial of one. The first version of
  // this check went red against the server's own disclaimer — claims_in_domain
  // says there is "no way to ask for the best, most supported or most
  // critiqued claims", and a bare keyword search cannot tell a refusal from
  // an offer. Anchored on phrasing that only makes sense as an offer.
  check('CONTROL: no tool description promises ordering by merit',
    !tools.some((t) => /(returns|ordered|sorted|ranked)[^.]{0,40}(by (relevance|score|quality|popularity)|most (popular|cited))/i.test(t.description)));
  const retract = tools.find((t) => t.name === 'retract_claim');
  check('retraction says plainly that it deletes nothing',
    /deletes nothing|no delete|remains/i.test(retract?.description ?? ''));
  check('CONTROL: no tool is named delete or remove',
    !names.some((n) => /delete|remove|erase/i.test(n)));

  // ---- 3. It actually works, end to end -------------------------------
  log('\n--- 3. Publishing and reading back over the wire ---');
  const published = await callTool('publish_claim', {
    content: CLAIM_TEXT, domain: DOMAIN, confidence: 'Moderate',
  });
  check('publish_claim succeeds and returns an action hash',
    !published.isError && typeof published.parsed?.action_hash === 'string');

  const inDomain = await callTool('claims_in_domain', { domain: DOMAIN });
  const found = (inDomain.parsed ?? []).find((c) => c.content === CLAIM_TEXT);
  check('the claim comes back from claims_in_domain', found !== undefined);
  check('it carries the confidence that was declared', found?.confidence === 'Moderate');

  // ---- 4. Hashes round-trip as strings ---------------------------------
  //
  // The check this file exists for: an agent copies a hash out of one
  // result and pastes it into the next argument, with no encoding step it
  // could get wrong.
  log('\n--- 4. A hash from one call is a valid argument to the next, verbatim ---');
  const hash = found?.entry_hash;
  check('claims carry a base64 entry_hash', typeof hash === 'string' && /^[A-Za-z0-9+/=]+$/.test(hash));
  const critiqued = await callTool('critique_claim', {
    claim_hash: hash, content: CRITIQUE_TEXT, mode: 'Logical',
  });
  check('that hash, pasted verbatim, is accepted by critique_claim', !critiqued.isError);
  const crits = await callTool('critiques_for_claim', { claim_hash: hash });
  check('and by critiques_for_claim, returning the critique just made',
    (crits.parsed ?? []).some((c) => c.content === CRITIQUE_TEXT));

  // ---- 5. Budget is legible before it is spent -------------------------
  log('\n--- 5. An agent can pace itself ---');
  const budget = await callTool('check_budget', {});
  check('check_budget returns a status an agent can read',
    !budget.isError && budget.parsed !== null && typeof budget.parsed === 'object');
  // Checked in BOTH directions, because "the critiqued claim is absent" passes
  // on an empty list — and did, on the run where every call was failing and
  // returning nothing. A second, uncritiqued claim has to be PRESENT for the
  // absence of the first one to mean anything.
  const UNCRITIQUED = `A second claim, left alone, stamped ${STAMP}.`;
  await callTool('publish_claim', { content: UNCRITIQUED, domain: DOMAIN, confidence: 'Tentative' });
  const awaiting = await callTool('claims_awaiting_my_critique', { domain: DOMAIN });
  const awaitingTexts = (awaiting.parsed ?? []).map((c) => c.content);
  check('CONTROL: an uncritiqued claim IS offered — the list is not simply empty',
    awaitingTexts.includes(UNCRITIQUED));
  check('claims_awaiting_my_critique excludes what this agent already critiqued',
    !awaitingTexts.includes(CLAIM_TEXT));

  // ---- 6. Errors are legible -------------------------------------------
  log('\n--- 6. A bad call fails as an error, not as a plausible answer ---');
  const bad = await callTool('critiques_for_claim', { claim_hash: 'not-a-hash' });
  check('a malformed hash is reported as an error rather than an empty list',
    bad.isError === true);
  const unknown = await callTool('no_such_tool', {});
  check('an unknown tool is refused', unknown.isError === true);

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — the protocol is discoverable from the tool list,');
    log('offers no ranking an agent could reach for, and round-trips hashes as');
    log('strings so one call\'s output is the next call\'s input.');
  } else {
    log(`${failures} CHECK(S) FAILED.`);
    if (stderr.trim()) log(`\nserver stderr:\n${stderr.trim().slice(0, 800)}`);
  }
  server.kill();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nHARNESS ERROR:', e);
  if (stderr.trim()) console.error(`server stderr:\n${stderr.trim().slice(0, 800)}`);
  server.kill();
  process.exit(1);
});
