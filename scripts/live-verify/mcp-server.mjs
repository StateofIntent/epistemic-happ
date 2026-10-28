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
//   THE 1.19 TOOLS WERE ADDED 2026-10-28 and injected twice. Both results
//   are about checks that PASS under the injection, which is the part worth
//   reading.
//
//   Injection F: `discourse_health` passing the domain name straight into
//   `discourseHealth`, which takes a membrane hash — i.e. THE BUG THAT
//   ACTUALLY SHIPPED, restored.
//   Result: TWO red — "the error says why rather than only that it failed"
//   and "discourse_health RESOLVES a real domain name to its membrane".
//   AND "discourse_health on a domain with no membrane is a legible error"
//   STAYED GREEN, which is the whole lesson: the broken version errors too.
//   An error-presence assertion would have passed the shipped defect
//   indefinitely. What catches it is requiring the error to SAY WHY and
//   asserting the positive case — the resolution actually working. This is
//   the same shape as the hex-instead-of-base64 result above: a check that
//   the shape is wrong-ish is weaker than a check that the thing works.
//
//   Injection G: `assess` recording an empty past cone regardless of the
//   caller's `record_what_i_read`.
//   Result: ONE red — "records what it had SEEN, read fresh rather than
//   asserted". The CONTROL beneath it ("opting out records nothing, so the
//   check above is not a constant") STAYED GREEN, vacuously, because under
//   this injection both paths record nothing and the control asserts zero.
//   The control still earns its place — it is what proves zero is reachable
//   and therefore that the first check is not a tautology — but it cannot
//   detect this injection, and a reader should not take its green as
//   evidence the cone is being recorded.
//
//   WHY THESE TOOLS ARE HERE AT ALL rather than only in the SDK: open-work
//   1.19 says `mcp-server` is a thin wrapper where every tool maps to one
//   SDK call, so a function added to the SDK and not to MCP is
//   DISCOVERABLE BY NOBODY — the half-surfaced defect that row is about,
//   one layer up. The two tools this file never called were the two that
//   took a domain name, and one of them had never worked.
//
//   Restored and re-run: 52 checks green (from 21), 19 tools (from 9).
//
//   THE FOUNDING SECTION (5d/5e) WAS INJECTED TWICE on 2026-10-28, and
//   writing it found a defect before either injection ran — see below.
//
//   FOUND BY WRITING IT, NOT BY AN INJECTION: `found_domain`'s handler has
//   always read `a.constitution_hash` and its SCHEMA NEVER DECLARED IT.
//   The tool list is the whole of what an agent knows about a tool, so the
//   parameter was unreachable by any agent — while
//   `publish_my_constitution`'s own note told the caller to KEEP THIS HASH
//   because "passing it explicitly is the only way to be certain which
//   constitution the domain references". Advice that could not be followed
//   through the surface that gave it. This harness could send the
//   undeclared argument, which is exactly why the handler checks could not
//   catch it and discoverability needed its own check in section 1.
//
//   Injection I: `constitution_hash` deleted from `found_domain`'s schema,
//   leaving the handler untouched — the defect above, restored.
//   Result: ONE red, the section-1 discoverability check, AND BOTH
//   WRONG-HASH CHECKS IN 5e STAYED GREEN. That is the whole shape of this
//   class of defect: the parameter still works for anything that already
//   knows it exists, and nothing that reads the schema can find it. A
//   harness is such a thing; an agent is not.
//
//   Injection J: `publish_my_constitution` computing `expires_in_days` from
//   a MILLISECOND clock (`Date.now()`) instead of seconds.
//   Result: SIX red and the reading tools not exercised — and the red is in
//   an ORDINARY 365-day publish, refused by the SDK's century ceiling,
//   which is that ceiling doing its job one layer down. The cascade is the
//   property section 5d was restructured for: the domain tools used to be
//   seeded through the SDK's raw `call` hatch, and are now seeded by the two
//   tools under test, so founding breaking takes seven later checks with it.
//   NOTE WHICH CHECK STAYED GREEN: "an expiry more than a century out is
//   refused" passed, because under this injection everything is refused. An
//   absence check cannot tell a correct refusal from a broken one, which is
//   why the ordinary publish beside it is what actually pins the unit.
//
//   Restored and re-run: 73 checks green (from 52), 21 tools (from 19).
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

  // A PARAMETER THE HANDLER READS AND THE SCHEMA DID NOT DECLARE IS
  // UNREACHABLE, because this object is the whole of what an agent knows
  // about a tool. Found 2026-10-28 while writing section 5e: `found_domain`
  // has always passed `a.constitution_hash` through to `createMembrane`, and
  // the schema never mentioned it — so no agent could pass it, while
  // `publish_my_constitution`'s own note said to KEEP THIS HASH because
  // "passing it explicitly is the only way to be certain which constitution
  // the domain references". Advice that could not be followed through the
  // surface that gave it.
  //
  // THE TWO CHECKS BELOW DO NOT OVERLAP, which is the point: the wrong-hash
  // checks in 5e exercise the HANDLER and pass whether or not the schema
  // declares the parameter, because this harness can send an undeclared one.
  // An agent cannot. So discoverability needs its own check, here.
  const foundDomain = tools.find((t) => t.name === 'found_domain');
  check('found_domain DECLARES constitution_hash, which its handler has always read',
    typeof foundDomain?.inputSchema?.properties?.constitution_hash === 'object');
  check('and it is optional, since resolving the current one is the ordinary path',
    !(foundDomain?.inputSchema?.required ?? []).includes('constitution_hash'));
  // (No check here that publish_my_constitution's DESCRIPTION names
  // found_domain. The first version of this block had one and it ended in
  // `|| true`, which passes on anything — a decorative check is worse than
  // none, because it reads as coverage. What actually matters is that the
  // RESPONSE carrying the hash says what to do with it, and that is asserted
  // against the response in 5e where the hash is in hand.)

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

  // ---- 5b. The tools added for open-work 1.19 --------------------------
  //
  // Every tool below wraps a function the SDK gained on 2026-10-28 and the
  // coordinator had all along. The row that opened this says why they belong
  // here and not only in the SDK: `mcp-server` is a thin wrapper where every
  // tool maps to one SDK call, so a function added to the SDK and not to MCP
  // is DISCOVERABLE BY NOBODY — which is the half-surfaced defect the row is
  // about, one layer up.
  log('\n--- 5b. Assessment, prediction, settlement and readings ---');
  const claimHash = (inDomain.parsed ?? []).find((c) => c.content === CLAIM_TEXT)?.entry_hash;
  check('a claim entry hash is in hand for the tools below',
    typeof claimHash === 'string' && claimHash.length > 0);

  const assessed = await callTool('assess', {
    claim_hash: claimHash, stance: 'Disputes', confidence: 'Tentative',
    rationale: 'Assessed by the MCP live-verify harness.',
  });
  check('assess publishes an attributed position',
    !assessed.isError && typeof assessed.parsed?.action_hash === 'string');
  // THE COUNT IS THE EVIDENCE THAT THE CONE WAS READ AT CALL TIME. The
  // harness critiqued this claim earlier, so a cone read fresh must be
  // non-empty — a tool that recorded nothing, or took the caller's word for
  // it, would report zero here and nothing else would notice.
  check('and records what it had SEEN, read fresh rather than asserted',
    assessed.parsed?.critiques_recorded_as_seen >= 1);
  const optedOut = await callTool('assess', {
    claim_hash: claimHash, stance: 'Abstains', confidence: 'Hypothetical',
    record_what_i_read: false,
  });
  check('CONTROL: opting out records nothing, so the check above is not a constant',
    !optedOut.isError && optedOut.parsed?.critiques_recorded_as_seen === 0);
  check('and says that recording nothing is not the same as having seen nothing',
    /did not record|not as "saw nothing"/i.test(optedOut.text));

  const assessmentsList = await callTool('assessments_for', { claim_hash: claimHash });
  check('assessments_for returns the positions taken, as a list',
    !assessmentsList.isError && (assessmentsList.parsed ?? []).length >= 2);
  // CONTROL FOR INVARIANT 1 AT THE TOOL BOUNDARY: a tally is exactly what a
  // model would reach for, so the payload must not hand it one.
  check('CONTROL: and does NOT tally them into a verdict',
    !/"(supports|disputes|total|tally|verdict|majority)_?(count)?":/i.test(assessmentsList.text));

  // Pre-registration needs the claim's ACTION hash, not its entry hash.
  const actionHash = (inDomain.parsed ?? []).find((c) => c.content === CLAIM_TEXT)?.action_hash;
  const committed = await callTool('commit_prediction', {
    question_hash: actionHash,
    prediction: 'Predicted through MCP, revealed from what recover gave back.',
    hours_until_deadline: 1,
  });
  check('commit_prediction seals a prediction against a claim',
    !committed.isError && typeof committed.parsed?.commitment_hash === 'string');
  // THE SALT MUST COME BACK OR THE COMMITMENT IS UNREVEALABLE, and a
  // conversational agent is the caller most likely to drop it — so the tool
  // returns it AND says to keep it, in the payload rather than only in the
  // tool description.
  check('and hands back the salt, without which it could never be revealed',
    typeof committed.parsed?.salt === 'string' && committed.parsed.salt.length >= 32);
  check('and says to keep it, in the response rather than only in the schema',
    /KEEP THE SALT/i.test(committed.text));

  const recoveredTool = await callTool('recover_my_prediction', {
    commitment_hash: committed.parsed?.commitment_hash,
  });
  check('recover_my_prediction reads the sealed content back',
    !recoveredTool.isError && recoveredTool.parsed?.found === true);
  check('including the salt, which has no network copy at all',
    recoveredTool.parsed?.salt === committed.parsed?.salt);

  // THE DECISIVE CHECK, same discipline as the SDK and UI harnesses: a reveal
  // driven ONLY by what recover returned proves the recovery is SUFFICIENT,
  // because validation recomputes the commitment hash from exactly these two.
  const revealed = await callTool('reveal_prediction', {
    commitment_hash: committed.parsed?.commitment_hash,
    prediction: recoveredTool.parsed?.prediction,
    salt: recoveredTool.parsed?.salt,
  });
  check('and a reveal driven ONLY by the recovered values is accepted',
    !revealed.isError && typeof revealed.parsed?.action_hash === 'string');

  const record = await callTool('foresight_record', {});
  check('foresight_record returns the three lists',
    !record.isError && Array.isArray(record.parsed?.revealed)
    && Array.isArray(record.parsed?.expired_unrevealed)
    && Array.isArray(record.parsed?.pending));
  // THE DENOMINATOR IS NAMED IN THE PAYLOAD, not left to the description. A
  // model summarising three lists will compute a ratio unless told not to,
  // and the instruction has to travel with the data it governs.
  check('CONTROL: and carries no score, ratio or rate field',
    !/"[a-z_]*(score|ratio|rate|rank|accuracy|percent)[a-z_]*":\s*[\d.]/i.test(record.text));
  check('and tells the caller in words not to compute one',
    /do NOT compute a hit rate/i.test(record.text));
  check('naming the expired list as what stops the revealed one reading as being right',
    /expired/i.test(record.parsed?.no_score_note ?? ''));

  // ---- 5c. The two tools that take a DOMAIN NAME -----------------------
  //
  // NEITHER WAS EVER CALLED BY THIS HARNESS, and that is how a dead tool
  // shipped. `discourse_health` passed the domain name straight into
  // `discourseHealth`, which takes a MEMBRANE HASH; the handler's args are
  // `Record<string, any>`, so TypeScript could not object, and every call
  // failed with a `Deserialize` error out of the coordinator. Confirmed
  // broken on a live conductor before the fix. The two tools this file did
  // not exercise were the two that took a domain rather than a hash.
  log('\n--- 5c. The domain-name tools, which nothing used to call ---');
  const noMembrane = await callTool('discourse_health', { domain: DOMAIN });
  // (the membrane for the positive case is seeded further down, after this
  // no-membrane case has been observed against a domain that has none)
  // A domain with no membrane founded has no aggregate, and the honest
  // answer names the domains that DO — an agent told only "not found" will
  // guess, and a misspelling is the likeliest cause.
  check('discourse_health on a domain with no membrane is a legible error',
    noMembrane.isError === true);
  check('and the error says why rather than only that it failed',
    /no membrane|membrane has been founded/i.test(noMembrane.text));

  // ---- 5d. FOUNDING, which used to be setup and is now the thing tested ---
  //
  // THE SEEDING THAT STOOD HERE WENT THROUGH THE SDK's RAW `call` HATCH with
  // hand-written snake_case payloads, and the comment above it said founding
  // "is not an MCP tool (an agent is not the participant who founds a
  // domain)". THAT WAS TRUE WHEN WRITTEN AND IS NOW FALSE: `found_domain`
  // and `publish_my_constitution` are tools, so the seed is a tool call, and
  // the hatch is gone from this file. Its disappearance is the verification —
  // the domain-name tools below are seeded by the two tools under test, so
  // founding breaking takes seven later checks red with it rather than none.
  //
  // THE ORDER IS A TEST AND NOT A STYLE. `found_domain`'s central refusal —
  // an agent with no published constitution founds nothing (README §2.6) —
  // is reachable ONLY while this server's agent still has none, and a
  // published constitution is permanent. So it is asserted here, before the
  // first publish, and nothing later in the run can restore the state it
  // needs. Note that `list_domains` above has already run against a
  // conductor with no membrane at all, which is why the no-membrane error
  // case could be observed first.
  log('\n--- 5d. Founding: refused first, since the refusal is reachable only now ---');
  const SEED_DOMAIN = `McpSeeded${STAMP}`;
  const unfounded = await callTool('found_domain', {
    domain: SEED_DOMAIN,
    description: 'Must not exist: founded with no constitution behind it.',
    required_promises: ['state the method'],
  });
  check('found_domain with no constitution published is refused',
    unfounded.isError === true);
  // THE REASON MATTERS MORE THAN THE REFUSAL, and that is measured rather
  // than assumed: disabling the SDK's client-side check left this refusal
  // INTACT, because the coordinator refuses it too. Only the message
  // distinguishes the two layers — and a refusal that does not say why reads
  // to a model as a missing parameter, which is the one failure mode that
  // ends in the model inventing a `constitution_hash`.
  check('and the refusal names publish_my_constitution as what to do instead',
    /publishConstitution|publish_my_constitution/i.test(unfounded.text));
  check('and gives the reason — accountable rather than costly, README §2.6',
    /README §2\.6|accountable rather than costly/i.test(unfounded.text));
  check('nothing was founded, so that was a refusal and not a warning',
    !((await callTool('list_domains', {})).parsed ?? []).some((d) => d.domain === SEED_DOMAIN));

  const demandsNothing = await callTool('found_domain', {
    domain: `${SEED_DOMAIN}Empty`,
    description: 'Must not exist: a domain that demands nothing of anyone.',
    required_promises: [],
  });
  check('a domain requiring nothing is refused — founding\'s only actual cost',
    demandsNothing.isError === true && /required_promise/i.test(demandsNothing.text));

  const emptyPromises = await callTool('publish_my_constitution', { promises: [] });
  check('an empty constitution is refused, not accepted as "promises nothing"',
    emptyPromises.isError === true);

  log('\n--- 5e. Founding: the constitution, then the domain ---');
  const myConstitution = await callTool('publish_my_constitution', {
    promises: [
      { action: 'state the method', domain: SEED_DOMAIN },
      { action: 'say what would change my mind', domain: SEED_DOMAIN, modality: 'Methodological' },
    ],
    expires_in_days: 365,
  });
  check('publish_my_constitution publishes under this agent\'s own key',
    !myConstitution.isError && typeof myConstitution.parsed?.constitution_hash === 'string');
  // THE HASH IS THE WHOLE REASON THIS TOOL RETURNS ANYTHING, because
  // `get_agent_constitution` returns the ENTRY and not its hash, and
  // `create_membrane` needs the hash. A tool that published and returned
  // only a note would leave the model unable to found anything it could be
  // certain referenced this constitution rather than a later one.
  check('and tells the caller to KEEP the hash, which is why it is returned',
    /KEEP THIS HASH/i.test(myConstitution.text));
  // THE UNIT, ASSERTED THROUGH THE TOOL. `expires_in_days` is converted to
  // SECONDS (SPEC §5.23), and the publish above succeeding is already an
  // assertion about that: a conversion to millis or micros would land the
  // expiry tens of thousands of years out and the SDK's century ceiling would
  // have refused it. This makes the other direction explicit — the ceiling is
  // REACHABLE through this tool, and the refusal names the unit.
  //
  // IT IS A STATED HEURISTIC AND NOT A PROTOCOL RULE, and the refusal says
  // so, because `expires_at > published_at` is TRUE IN EITHER UNIT: a micros
  // expiry passes the coordinator, passes validation and round-trips intact,
  // and the constitution then never expires while its author believes it
  // does. No layer below the client can object, since read as seconds that
  // number is a legitimate far-future date.
  const absurdExpiry = await callTool('publish_my_constitution', {
    promises: [{ action: 'state the method', domain: SEED_DOMAIN }],
    expires_in_days: 40_000,
  });
  check('an expiry more than a century out is refused through the tool',
    absurdExpiry.isError === true);
  check('and the refusal names SECONDS and offers the way to say "never expires"',
    /SECONDS/.test(absurdExpiry.text) && /expiresAt: null|expires_in_days/i.test(absurdExpiry.text));

  const founded = await callTool('found_domain', {
    domain: SEED_DOMAIN,
    description: 'Founded through found_domain by mcp-server.mjs, which seeds the domain tools below.',
    required_promises: ['state the method'],
  });
  check('found_domain founds the domain once a constitution exists',
    !founded.isError && typeof founded.parsed?.membrane_hash === 'string');
  // THE ONE THING A MODEL WILL GET WRONG ABOUT THIS TOOL, said in the
  // payload rather than only in the schema: required_promises looks like an
  // access list and is not one. `join_membrane` is unrestricted by design,
  // because a membrane that refused the join would be an authority over who
  // may speak — so a model that reads this as a gate will tell its user that
  // joining is controlled, which is false about the protocol.
  check('and says plainly that the promises do NOT gate who may join',
    /NOT restrict who may join|joining is unrestricted/i.test(founded.text));

  // TWO WRONG HASHES, AND THEY FAIL AT DIFFERENT LAYERS — which is the whole
  // reason both are here rather than one standing for the other.
  //
  // A CLAIM'S ACTION HASH is the right KIND of hash and the wrong entry. It
  // reaches the coordinator, resolves, and simply is not a Constitution — so
  // the friendly message is the coordinator's, and it only became reachable
  // on 2026-10-28: `to_app_option` failed before the arm carrying it, exactly
  // as `get_my_sealed_prediction` did the same day, and the founder got
  // `Guest("Deserialize(\"missing field `agent`\")")`.
  const notAConstitution = await callTool('found_domain', {
    domain: `${SEED_DOMAIN}WrongEntry`,
    description: 'Must not exist: founded against a claim.',
    required_promises: ['state the method'],
    constitution_hash: actionHash,
  });
  check('founding against a Claim rather than a Constitution is refused',
    notAConstitution.isError === true);
  check('and the refusal says it is not a Constitution, not a serde error',
    /not a Constitution/i.test(notAConstitution.text));

  // A CLAIM'S ENTRY HASH is the wrong KIND, and it never reaches the function
  // body at all: `Membrane.constitution` is typed `ActionHash`, so the
  // conductor rejects it while deserializing the whole payload and the caller
  // gets `Deserialize([135, 166, 100, 111, ...])` — the msgpack bytes of
  // their own arguments as a decimal array, with nothing in it naming the
  // problem. MEASURED on a live conductor before the guard was written.
  //
  // THIS IS THE MISTAKE MOST AVAILABLE TO A MODEL, which is why it is worth a
  // client-side refusal rather than a comment: `claims_in_domain` returns
  // `entry_hash` and `action_hash` side by side, critique targets ARE entry
  // hashes, and a constitution reference is an action hash — so an agent
  // copying "the hash of the thing" has even odds of copying the wrong one.
  const wrongHashKind = await callTool('found_domain', {
    domain: `${SEED_DOMAIN}WrongKind`,
    description: 'Must not exist: founded against an entry hash.',
    required_promises: ['state the method'],
    constitution_hash: claimHash,
  });
  check('founding with an ENTRY hash where an action hash belongs is refused',
    wrongHashKind.isError === true);
  check('and the refusal names the hash KIND rather than dumping msgpack bytes',
    /must be an ActionHash/i.test(wrongHashKind.text)
    && /EntryHash/i.test(wrongHashKind.text)
    && !/^\s*\[?1?3?5?,/.test(wrongHashKind.text));
  check('and it says which hash to use instead, since the caller holds several',
    /publishConstitution RETURNED|entry_hash/i.test(wrongHashKind.text));
  check('neither wrong hash founded anything',
    !((await callTool('list_domains', {})).parsed ?? [])
      .some((d) => d.domain.startsWith(`${SEED_DOMAIN}Wrong`)));

  const domains = await callTool('list_domains', {});
  check('list_domains returns the membranes that exist', !domains.isError);
  check('and the domain founded through the TOOL is among them, so the next checks run',
    (domains.parsed ?? []).some((d) => d.domain === SEED_DOMAIN));
  const seededDomain = (domains.parsed ?? []).find((d) => d.domain === SEED_DOMAIN);
  check('it carries the promises it declared, which is what a reader compares members against',
    JSON.stringify(seededDomain?.required_promises) === JSON.stringify(['state the method']));
  const someDomain = seededDomain?.domain;
  if (typeof someDomain === 'string') {
    const health = await callTool('discourse_health', { domain: someDomain });
    check('discourse_health RESOLVES a real domain name to its membrane',
      !health.isError && typeof health.parsed?.total_claims === 'number');
    const reading = await callTool('publish_discourse_reading', {
      domain: someDomain, confidence: 'Tentative',
    });
    check('publish_discourse_reading publishes an attributed reading',
      !reading.isError && typeof reading.parsed?.action_hash === 'string');
    check('and returns the ENTRY hash, without which it cannot be disputed',
      typeof reading.parsed?.entry_hash_for_critique === 'string');
    const disputeIt = await callTool('critique_claim', {
      claim_hash: reading.parsed?.entry_hash_for_critique,
      content: 'Disputing the method of this reading.', mode: 'Methodological',
    });
    check('and that hash, pasted verbatim, is accepted by critique_claim',
      !disputeIt.isError);
  } else {
    log('  NO MEMBRANE ON THIS CONDUCTOR — the reading tools were NOT exercised.');
    failures++;
  }

  // ---- 5f. Settlement --------------------------------------------------
  log('\n--- 5f. Settlement: the rule published before it is applied ---');
  const policy = await callTool('publish_settlement_policy', {
    name: 'mcp-harness-policy', min_assessors: 1, max_dissent: 0,
    statement: 'Settles on one assessor with no dissent.',
  });
  check('publish_settlement_policy publishes the rule',
    !policy.isError && typeof policy.parsed?.policy_hash === 'string');
  const recomp = await callTool('recompute_settlement', {
    claim_hash: claimHash, policy_hash: policy.parsed?.policy_hash,
    assessment_hashes: [assessed.parsed?.action_hash],
  });
  check('recompute_settlement reports a state without publishing one',
    !recomp.isError && typeof recomp.parsed?.state === 'string');
  check('and says plainly that nothing was published',
    /Nothing was published/i.test(recomp.text));
  check('naming the policy it applied rather than deciding anonymously',
    recomp.parsed?.policy_name === 'mcp-harness-policy');
  const status = await callTool('publish_settlement_status', {
    claim_hash: claimHash, policy_hash: policy.parsed?.policy_hash,
    assessment_hashes: [assessed.parsed?.action_hash],
    state: recomp.parsed?.state,
  });
  check('publish_settlement_status accepts the state recompute derived',
    !status.isError && typeof status.parsed?.action_hash === 'string');
  const wrongState = recomp.parsed?.state === 'Settled' ? 'Open' : 'Settled';
  const badStatus = await callTool('publish_settlement_status', {
    claim_hash: claimHash, policy_hash: policy.parsed?.policy_hash,
    assessment_hashes: [assessed.parsed?.action_hash], state: wrongState,
  });
  // WITHOUT THIS THE CHECK ABOVE IS VACUOUS: if any state were accepted,
  // publishing "what recompute derived" would mean nothing.
  check('and REFUSES a state the cited policy and inputs do not yield',
    badStatus.isError === true);

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
