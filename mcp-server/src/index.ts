#!/usr/bin/env node
// ============================================================================
// @stateofintent/mcp-server — the Epistemic Resonance Protocol as MCP tools, so
// an autonomous agent can find and use it without anyone writing an
// integration first.
//
// WHY THIS EXISTS RATHER THAN JUST THE SDK. agent-sdk/ is a good client
// library and an agent still has to be programmed against it by a person who
// already knows this protocol exists. For an MCP-capable model the tool
// schemas ARE the documentation: it discovers the protocol, its vocabulary
// and its constraints by listing tools. That is the difference between a
// library someone can adopt and a protocol an agent can find.
//
// THIS IS A THIN WRAPPER ON PURPOSE. Every tool below maps to one SDK call.
// It adds no capability the protocol does not have, and it must not become
// an abstraction over it — the SDK's own README makes that argument and it
// applies with more force here, because a tool description is read by
// something that cannot check the claim against the source.
//
// WHAT IS DELIBERATELY NOT EXPOSED, and why each absence is load-bearing:
//
//   - NO SEARCH OR RANKING TOOL. There is no `top_claims`, no
//     `best_critiques`, no relevance ordering. Invariant 1 forbids a
//     canonical comparative score, and a ranked tool result is exactly that
//     wearing an API's clothes. Claims come back in the order the DHT
//     returns them.
//   - NO AGENT REPUTATION TOOL. `get_claims_by_agent` is exposed because a
//     record of what one agent said is raw history, which Invariant 1
//     explicitly protects. Nothing computes a rate, a total or a standing
//     from it, and no tool takes a list of agents.
//   - NO DELETE. The protocol has none. Retraction is a new entry that adds
//     provenance, and `retract_claim` is named so a model does not reach for
//     it expecting removal.
//
// THE FRICTION BUDGET IS THE INTERESTING PART FOR AN AGENT. Critiques are
// capped per rolling hour and the cap is DHT-enforced, so an agent cannot
// talk its way past it. `check_budget` exists so a loop can pace itself
// rather than discover the limit by hitting it, and when the limit is hit
// the error says so in terms an agent can act on — wait, do not retry
// immediately, and do not treat this as a failure of the request. Rate
// limiting here is not infrastructure protection; it is the protocol's
// position that disagreement should cost something.
// ============================================================================

import { readFileSync } from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  EpistemicAgent, FrictionLimitError,
  CONFIDENCE_LEVELS, CRITIQUE_MODES, STANCES, SETTLEMENT_STATES,
} from '@stateofintent/agent-sdk';

const b64 = (u8: Uint8Array): string => Buffer.from(u8).toString('base64');
const unb64 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'base64'));

/** Hashes cross the MCP boundary as base64 strings, because a tool argument
 * is JSON and a model will copy one back verbatim from a previous result.
 * Every hash this server returns is base64 and every hash it accepts is
 * base64, with no other encoding anywhere, so a value can always be pasted
 * from one call into the next. */
const decoded = <T>(rs: { entryHash: Uint8Array; actionHash: Uint8Array; entry: T }[]) =>
  rs.map((r) => ({ entry_hash: b64(r.entryHash), action_hash: b64(r.actionHash), ...r.entry }));

let agent: EpistemicAgent | null = null;
async function connected(): Promise<EpistemicAgent> {
  if (agent) return agent;
  // Only pass the keys that are actually set. Passing `adminUrl: undefined`
  // is NOT the same as omitting it: the SDK merges over its defaults, so an
  // explicit undefined overwrites a perfectly good default with nothing and
  // the failure surfaces later as a bare "Invalid URL" from deep inside a
  // URL constructor. Found exactly that way.
  const cfg: Record<string, string> = {};
  if (process.env.EPISTEMIC_ADMIN_URL) cfg.adminUrl = process.env.EPISTEMIC_ADMIN_URL;
  if (process.env.EPISTEMIC_APP_URL) cfg.appUrl = process.env.EPISTEMIC_APP_URL;
  if (process.env.EPISTEMIC_APP_ID) cfg.appId = process.env.EPISTEMIC_APP_ID;
  agent = await EpistemicAgent.connect(cfg);
  return agent;
}

/** The membrane hash for a domain NAME.
 *
 * Every tool here takes a domain by name, because that is what an agent
 * has: `claims_in_domain` takes one and `list_domains` shows them. The
 * two zome reads that aggregate over a domain take a membrane hash
 * instead, so something has to bridge them, and before 2026-10-28
 * nothing did — `discourse_health` passed the name straight through and
 * failed for every caller.
 *
 * Throws with the available names rather than returning null: an agent
 * given "not found" and no list will guess, and a misspelled domain is
 * by far the likeliest cause. */
async function membraneFor(ep: EpistemicAgent, domain: string): Promise<Uint8Array> {
  const membranes = await ep.membranes();
  const found = membranes.find((m) => m.entry.domain === domain);
  if (!found) {
    const names = membranes.map((m) => m.entry.domain);
    throw new Error(
      `No membrane for domain "${domain}". `
      + (names.length
        ? `Domains that exist: ${names.join(', ')}. A domain only has aggregate measures once `
          + `a membrane has been founded for it; claims can exist in a domain with no membrane.`
        : 'No membranes exist on this network yet, so no domain has aggregate measures. '
          + 'Claims can still be published and critiqued without one.'),
    );
  }
  return found.entryHash;
}

const TOOLS = [
  {
    name: 'publish_claim',
    description:
      'Publish a claim into a domain, under your own agent key and on your own source chain. '
      + 'You must declare a confidence level; there is no neutral default, because declaring how '
      + 'sure you are is part of making the claim rather than metadata about it. Returns the '
      + 'action hash. Publishing spends no rate-limit budget.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The assertion itself.' },
        domain: { type: 'string', description: 'The domain it belongs to, e.g. "LumbarRehab".' },
        confidence: { type: 'string', enum: [...CONFIDENCE_LEVELS], description: 'How sure you are. Required.' },
        semantic_tags: { type: 'array', items: { type: 'string' }, description: 'Optional free tags.' },
      },
      required: ['content', 'domain', 'confidence'],
    },
  },
  {
    name: 'critique_claim',
    description:
      'Critique an existing claim. You must choose the KIND of critique you are making — the '
      + 'vocabulary is fixed and the choice is not cosmetic, since it records what sort of '
      + 'objection this is. SPENDS RATE-LIMIT BUDGET: critiques are capped per rolling hour and '
      + 'the cap is enforced by the network, not by this server. Call check_budget first if you '
      + 'are running a loop.',
    inputSchema: {
      type: 'object',
      properties: {
        claim_hash: { type: 'string', description: 'Base64 entry hash of the claim, as returned by claims_in_domain.' },
        content: { type: 'string', description: 'The critique itself.' },
        mode: { type: 'string', enum: [...CRITIQUE_MODES], description: 'What kind of objection this is.' },
      },
      required: ['claim_hash', 'content', 'mode'],
    },
  },
  {
    name: 'claims_in_domain',
    description:
      'Every claim in a domain, in the order the network returns them. This ordering carries no '
      + 'ranking and none is available: there is deliberately no way to ask for the best, most '
      + 'supported or most critiqued claims.',
    inputSchema: {
      type: 'object',
      properties: { domain: { type: 'string' } },
      required: ['domain'],
    },
  },
  {
    name: 'critiques_for_claim',
    description: 'Every critique made of one claim, with the kind of objection each one records.',
    inputSchema: {
      type: 'object',
      properties: { claim_hash: { type: 'string', description: 'Base64 entry hash.' } },
      required: ['claim_hash'],
    },
  },
  {
    name: 'claims_awaiting_my_critique',
    description:
      'Claims in a domain that this agent has not already responded to. This is the helper an '
      + 'agent loop is built around — it is what stops a loop re-critiquing the same claim on '
      + 'every pass.',
    inputSchema: {
      type: 'object',
      properties: { domain: { type: 'string' } },
      required: ['domain'],
    },
  },
  {
    name: 'check_budget',
    description:
      'How much critique budget remains in the current rolling hour, and when it resets. Call '
      + 'this to pace a loop rather than discovering the limit by hitting it. The limit is '
      + 'enforced by the network; nothing here can raise it.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'retract_claim',
    description:
      'Withdraw a claim you no longer stand behind. THIS DELETES NOTHING. A retraction is a new '
      + 'entry recording that you have withdrawn the claim and why; the original remains, and so '
      + 'does the fact that you retracted it. There is no delete in this protocol.',
    inputSchema: {
      type: 'object',
      properties: {
        claim_hash: { type: 'string', description: 'Base64 entry hash of your own claim.' },
        reason: { type: 'string', description: 'Why you no longer stand behind it.' },
      },
      required: ['claim_hash', 'reason'],
    },
  },
  {
    name: 'list_domains',
    description: 'The domains (membranes) that exist, with the promises each requires of its members.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'publish_my_constitution',
    description:
      'Publish what YOU promise to do, under what conditions — Promise Theory made explicit in '
      + 'the DHT. Published under your own agent key; you cannot publish anyone else\'s promises. '
      + 'Nothing obliges you to have one, and an agent without one is not deficient — the single '
      + 'thing it unlocks is founding a domain. Publishing again replaces which one reads as '
      + 'current; it does not erase the earlier one.',
    inputSchema: {
      type: 'object',
      properties: {
        promises: {
          type: 'array',
          description:
            'What you promise, each scoped to a domain. A promise with no domain is '
            + 'unmatchable, so both fields are required.',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', description: 'What you promise to do, in your own words.' },
              domain: { type: 'string', description: 'The domain it applies in.' },
              modality: {
                type: 'string',
                enum: ['Empirical', 'Logical', 'Methodological', 'Interpretive', 'Ethical'],
                description: 'Optional: the kind of critique this promise is about.',
              },
            },
            required: ['action', 'domain'],
          },
        },
        expires_in_days: {
          type: 'number',
          description:
            'Optional. Omit for a constitution that does not expire. An expired constitution '
            + 'reads as nothing published, which is not the same as being revoked.',
        },
      },
      required: ['promises'],
    },
  },
  {
    name: 'found_domain',
    description:
      'Found a domain (membrane) and state what it requires of anyone who participates. '
      + 'REQUIRES THAT YOU HAVE ALREADY PUBLISHED YOUR OWN CONSTITUTION via '
      + 'publish_my_constitution — that is the cost of founding here, in place of a fee: you '
      + 'must have said what you promise before you may ask anything of others. The required '
      + 'promises are NOT a gate on joining, which is unrestricted by design; they are what a '
      + 'reader compares members against.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'The domain name. Must not be empty.' },
        description: { type: 'string', description: 'What this domain is for.' },
        required_promises: {
          type: 'array',
          items: { type: 'string' },
          description:
            'What the domain asks participants to promise, as free text. At least one is '
            + 'required. Phrases are compared as written, so wording that drifts from what '
            + 'members actually write will report everybody missing everything.',
        },
        // DECLARED BECAUSE THE HANDLER ALREADY READ IT, and that is the
        // defect this entry fixes rather than the feature it adds. Found
        // 2026-10-28 by writing `mcp-server.mjs`'s founding section: the
        // handler has always passed `a.constitution_hash` through to
        // `createMembrane`, and the schema never mentioned it — so the
        // parameter was unreachable by any agent, which discovers tools by
        // reading exactly this object. Worse, `publish_my_constitution`'s
        // own note tells the caller to KEEP THIS HASH because "passing it
        // explicitly is the only way to be certain which constitution the
        // domain references": advice that could not be followed through
        // the surface that gave it.
        constitution_hash: {
          type: 'string',
          description:
            'Optional. The constitution_hash returned by publish_my_constitution. Omit and '
            + 'this resolves your current constitution for you — which is safe, but "current" '
            + 'is a reading over every constitution you have published, so if you have '
            + 'published more than one, passing the hash is the only way to be certain which '
            + 'one this domain references. Must be your own; a hash that is not a '
            + 'Constitution is refused.',
        },
      },
      required: ['domain', 'description', 'required_promises'],
    },
  },
  {
    name: 'discourse_health',
    description:
      'Structural measures of a domain\'s discourse — how much of it is critique, how much is '
      + 'grounded in evidence. These describe the CONVERSATION, never an agent, and they are not '
      + 'a score anyone can be ranked by.',
    inputSchema: {
      type: 'object',
      properties: { domain: { type: 'string', description: 'The domain name, as shown by list_domains.' } },
      required: ['domain'],
    },
  },
  {
    name: 'assess',
    description:
      'State where you stand on a claim, under your own agent key. This is NOT a vote and '
      + 'nothing tallies it into a verdict: an assessment is an attributed position somebody can '
      + 'be held to, and anyone who disagrees can critique it the same way they would critique a '
      + 'claim. You must choose a stance; "Abstains" is a real position, meaning you looked and '
      + 'declined to take a side, which is different from not having looked. The confidence you '
      + 'give is YOUR confidence in YOUR OWN assessment — nothing computes it for you or '
      + 'overrides it. Spends no rate-limit budget.',
    inputSchema: {
      type: 'object',
      properties: {
        claim_hash: { type: 'string', description: 'Base64 entry hash of the claim.' },
        stance: { type: 'string', enum: [...STANCES], description: 'Where you stand. Required.' },
        confidence: { type: 'string', enum: [...CONFIDENCE_LEVELS], description: 'Your confidence in your own assessment. Required.' },
        rationale: { type: 'string', description: 'Why. Optional — a stance with no reason is still a signed position.' },
        record_what_i_read: {
          type: 'boolean',
          description:
            'Default true. Records which of this claim\'s critiques you had seen when you '
            + 'assessed, read fresh at call time so the record is what you actually saw rather '
            + 'than something asserted. Assessing without seeing the objections is a different '
            + 'act from assessing in spite of them, and only this record can tell them apart '
            + 'later. Set false only if you genuinely did not read them.',
        },
      },
      required: ['claim_hash', 'stance', 'confidence'],
    },
  },
  {
    name: 'assessments_for',
    description:
      'Every assessment of one claim, with each assessor\'s stance, confidence and reasons. '
      + 'Returned as a list and NOT tallied: there is deliberately no count of supports versus '
      + 'disputes here, because turning positions into a verdict is a judgement somebody has to '
      + 'own. recompute_settlement is where that is done against a named, published rule.',
    inputSchema: {
      type: 'object',
      properties: { claim_hash: { type: 'string', description: 'Base64 entry hash.' } },
      required: ['claim_hash'],
    },
  },
  {
    name: 'commit_prediction',
    description:
      'Commit to a prediction about a claim WITHOUT revealing it yet, then reveal it later. This '
      + 'is the mechanism this protocol exists for: it makes a prediction checkable, because the '
      + 'commitment is public and timestamped from this moment while the content stays sealed. '
      + 'KEEP THE SALT THIS RETURNS. The salt and the exact prediction text are both required to '
      + 'reveal, and a commitment you cannot reveal before its deadline expires publicly, on a '
      + 'chain with no delete. If you lose them, recover_my_prediction can read them back — but '
      + 'only on this same conductor, so do not rely on it. Spends no rate-limit budget.',
    inputSchema: {
      type: 'object',
      properties: {
        question_hash: {
          type: 'string',
          description:
            'Base64 ACTION hash of the claim your prediction is about, which must already exist '
            + '— a prediction you can re-point after the fact is not a prediction.',
        },
        prediction: { type: 'string', description: 'What you predict. Sealed until you reveal it.' },
        hours_until_deadline: { type: 'number', description: 'How long you have to reveal. Default 24.' },
      },
      required: ['question_hash', 'prediction'],
    },
  },
  {
    name: 'reveal_prediction',
    description:
      'Disclose a prediction you committed to earlier. The text must match EXACTLY what you '
      + 'committed to and the salt must be the one you were given; the network recomputes the '
      + 'commitment and refuses anything else. A reveal after the deadline is refused outright, '
      + 'because a late reveal would let you decide, having seen the outcome, whether the '
      + 'commitment counts.',
    inputSchema: {
      type: 'object',
      properties: {
        commitment_hash: { type: 'string', description: 'Base64 action hash returned by commit_prediction.' },
        prediction: { type: 'string', description: 'The exact text committed to.' },
        salt: { type: 'string', description: 'The salt returned by commit_prediction.' },
      },
      required: ['commitment_hash', 'prediction', 'salt'],
    },
  },
  {
    name: 'recover_my_prediction',
    description:
      'Read back your own sealed prediction and its salt from your own source chain, for a '
      + 'commitment you made and can no longer reproduce. Works only for YOUR commitments and '
      + 'only on the conductor that made them — a private entry has no network copy, so nobody '
      + 'else can do this and neither can you from elsewhere. If it reports nothing found, that '
      + 'means the commitment was made on another machine, NOT that it is lost.',
    inputSchema: {
      type: 'object',
      properties: { commitment_hash: { type: 'string', description: 'Base64 action hash of your commitment.' } },
      required: ['commitment_hash'],
    },
  },
  {
    name: 'foresight_record',
    description:
      'An agent\'s pre-registered commitments as three separate lists: revealed, expired '
      + 'unrevealed, and still pending. THERE IS NO SCORE AND YOU MUST NOT COMPUTE ONE. The '
      + 'expired list exists to deflate a claim of foresight, not to rank anybody, and showing '
      + 'the revealed list without the expired one beside it misrepresents the record. Do not '
      + 'present the revealed list as evidence of foresight at all: the deadline is self-'
      + 'timestamped, so this is a record of what was committed and disclosed, not an audit.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_key: { type: 'string', description: 'Base64 agent key. Omit for your own record.' },
      },
    },
  },
  {
    name: 'publish_discourse_reading',
    description:
      'Publish your own reading of a domain\'s discourse health as a signed, critiquable claim. '
      + 'This is how a measurement becomes accountable rather than ambient: it is attributed to '
      + 'you, it states the method it was computed through, and anyone who disputes that method '
      + 'can critique it. Two agents reading the same domain can publish different figures and '
      + 'both stand. The confidence is YOURS, in your own reading.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'The domain name, as shown by list_domains.' },
        confidence: { type: 'string', enum: [...CONFIDENCE_LEVELS], description: 'Your confidence in your own reading. Required.' },
      },
      required: ['domain', 'confidence'],
    },
  },
  {
    name: 'publish_settlement_policy',
    description:
      'Publish, in advance and under your own key, the rule you will use for deciding when '
      + 'assessments amount to a settled question. Publishing the rule BEFORE applying it is the '
      + 'whole point: a threshold chosen after seeing the assessments is not a rule. Nothing '
      + 'blesses your policy as correct — another agent with a different policy will reach a '
      + 'different state over the same assessments, and that disagreement is intended.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'A short name others will cite it by.' },
        min_assessors: { type: 'number', description: 'How many distinct assessors are needed.' },
        max_dissent: { type: 'number', description: 'How much disagreement is tolerated.' },
        statement: { type: 'string', description: 'The rule in words, so a critic can dispute the method and not just the number.' },
      },
      required: ['name', 'min_assessors', 'max_dissent', 'statement'],
    },
  },
  {
    name: 'recompute_settlement',
    description:
      'Work out what state a published policy yields over named assessments, WITHOUT publishing '
      + 'anything. Call this before publish_settlement_status: the network recomputes the same '
      + 'thing and refuses a status that does not follow from its cited policy and inputs, so '
      + 'this tells you what you are allowed to say. Read unusable_inputs — a state computed '
      + 'over fewer inputs than you offered is a different fact from one over all of them.',
    inputSchema: {
      type: 'object',
      properties: {
        claim_hash: { type: 'string', description: 'Base64 entry hash of the claim being settled.' },
        policy_hash: { type: 'string', description: 'Base64 action hash from publish_settlement_policy.' },
        assessment_hashes: { type: 'array', items: { type: 'string' }, description: 'Base64 action hashes of the assessments to apply the policy to.' },
      },
      required: ['claim_hash', 'policy_hash', 'assessment_hashes'],
    },
  },
  {
    name: 'publish_settlement_status',
    description:
      'Publish the state a policy yields over named assessments. The inputs you cite are part of '
      + 'the record, because a verdict whose inputs are not stated cannot be checked by anyone. '
      + 'Use the state recompute_settlement gave you: the network recomputes it and refuses a '
      + 'status the cited evidence does not support, so there is no way to publish a conclusion '
      + 'your inputs do not reach.',
    inputSchema: {
      type: 'object',
      properties: {
        claim_hash: { type: 'string', description: 'Base64 entry hash of the claim being settled.' },
        policy_hash: { type: 'string', description: 'Base64 action hash of the policy.' },
        assessment_hashes: { type: 'array', items: { type: 'string' }, description: 'Base64 action hashes of the assessments this state was computed over.' },
        state: { type: 'string', enum: [...SETTLEMENT_STATES], description: 'The state recompute_settlement derived. Required.' },
      },
      required: ['claim_hash', 'policy_hash', 'assessment_hashes', 'state'],
    },
  },
] as const;

// THE VERSION IS READ, NOT TYPED. This said `'0.1.0'` from 0.1.0 through
// 0.1.3, so every MCP client was told the wrong version for three releases —
// the same defect class as the lockfile that sat at 0.1.1 while the package
// said 0.1.3: a version recorded in a second place and never updated with the
// first. Reading `package.json` removes the second place rather than
// correcting it, so the next bump cannot reintroduce this.
//
// `../package.json` resolves from `dist/index.js`, and npm always includes
// `package.json` in a tarball regardless of the `files` allowlist, so this
// holds for the published package and not only in-tree.
const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

const server = new Server(
  { name: 'epistemic-resonance', version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS as unknown as object[] }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  const a = args as Record<string, any>;
  try {
    const ep = await connected();
    switch (name) {
      case 'publish_claim': {
        const hash = await ep.publishClaim({
          content: a.content, domain: a.domain,
          confidence: a.confidence, semanticTags: a.semantic_tags ?? [],
        });
        return ok({ action_hash: b64(hash), note: 'Published under your own agent key.' });
      }
      case 'critique_claim': {
        const hash = await ep.critique({
          target: unb64(a.claim_hash), targetType: 'Claim',
          content: a.content, mode: a.mode,
        });
        return ok({ action_hash: b64(hash) });
      }
      case 'claims_in_domain':
        return ok(decoded(await ep.claimsInDomain(a.domain)));
      case 'critiques_for_claim':
        return ok(decoded(await ep.critiquesFor(unb64(a.claim_hash))));
      case 'claims_awaiting_my_critique':
        return ok(decoded(await ep.claimsAwaitingMyCritique(a.domain)));
      case 'check_budget':
        return ok(await ep.budget());
      case 'retract_claim': {
        const hash = await ep.retract({ claimEntryHash: unb64(a.claim_hash), reason: a.reason });
        return ok({ action_hash: b64(hash), note: 'The original claim still exists; this records the withdrawal.' });
      }
      case 'list_domains':
        return ok(decoded(await ep.membranes()));

      case 'publish_my_constitution': {
        const days = typeof a.expires_in_days === 'number' ? a.expires_in_days : null;
        const hash = await ep.publishConstitution({
          promises: (a.promises ?? []).map((p: any) => ({
            action: p.action, domain: p.domain, modality: p.modality ?? null,
          })),
          // SECONDS, because Constitution.published_at/expires_at are the
          // seconds family (SPEC §5.23) and expires_at is READ — an expiry
          // handed over in micros never expires and nothing would say so.
          expiresAt: days === null ? null : Math.floor(Date.now() / 1000) + Math.round(days * 86400),
        });
        return ok({
          constitution_hash: b64(hash),
          note:
            'Published under your own agent key. KEEP THIS HASH if you intend to found a '
            + 'domain — found_domain can resolve it for you, but passing it explicitly is the '
            + 'only way to be certain which constitution the domain references. Publishing '
            + 'another later supersedes which one reads as current and erases neither.',
        });
      }

      case 'found_domain': {
        const hash = await ep.createMembrane({
          domain: a.domain,
          description: a.description,
          requiredPromises: a.required_promises ?? [],
          constitution: a.constitution_hash ? unb64(a.constitution_hash) : undefined,
        });
        return ok({
          membrane_hash: b64(hash),
          domain: a.domain,
          required_promises: a.required_promises ?? [],
          note:
            'Founded, referencing your own published constitution. The required promises do '
            + 'NOT restrict who may join — joining is unrestricted by design, because a '
            + 'membrane that refused the join would be an authority over who may speak. They '
            + 'are what a reader compares members against; promise_compliance performs that '
            + 'comparison and gates nothing.',
        });
      }
      case 'discourse_health':
        // RESOLVED FROM THE DOMAIN NAME, and it used to pass the name
        // straight through. `discourseHealth` takes a MEMBRANE HASH, the
        // handler's `a` is `Record<string, any>`, so TypeScript could not
        // object and the tool failed at runtime for every caller with
        // `Deserialize(...)` out of the coordinator. Confirmed broken on a
        // live conductor 2026-10-28 before being fixed. It survived because
        // `mcp-server.mjs` never called this tool — the two tools it did not
        // exercise were the two that took a domain.
        return ok(await ep.discourseHealth(await membraneFor(ep, a.domain)));

      case 'assess': {
        // READ FRESH AT CALL TIME, not taken from the caller. An agent
        // asserting which critiques it had seen is the one claim here nobody
        // can check, so the honest version is for the cone to BE the fetch —
        // see witnessedCritiquesOf. Opting out is explicit.
        const recording = a.record_what_i_read !== false;
        const target = unb64(a.claim_hash);
        const pastCone = recording
          ? (await ep.witnessedCritiquesOf(target)).pastCone
          : [];
        const hash = await ep.publishAssessment({
          target, stance: a.stance, confidence: a.confidence,
          rationale: a.rationale ?? null, pastCone,
        });
        return ok({
          action_hash: b64(hash),
          critiques_recorded_as_seen: pastCone.length,
          note: recording
            ? 'Published under your own agent key, recording which critiques you had seen.'
            : 'Published under your own agent key, recording NOTHING about what you had seen '
              + '— which reads as "did not record", not as "saw nothing".',
        });
      }
      case 'assessments_for':
        return ok(decoded(await ep.assessmentsFor(unb64(a.claim_hash))));

      case 'commit_prediction': {
        const hours = typeof a.hours_until_deadline === 'number' ? a.hours_until_deadline : 24;
        const { actionHash, salt } = await ep.preRegister({
          question: unb64(a.question_hash),
          prediction: a.prediction,
          revealDeadline: (Date.now() + hours * 3600_000) * 1000,
        });
        return ok({
          commitment_hash: b64(actionHash),
          salt,
          reveal_before: new Date(Date.now() + hours * 3600_000).toISOString(),
          note:
            'KEEP THE SALT AND THE EXACT PREDICTION TEXT. Both are required to reveal, and a '
            + 'commitment not revealed before the deadline expires publicly and permanently. '
            + 'recover_my_prediction can read them back from this conductor only.',
        });
      }
      case 'reveal_prediction': {
        const hash = await ep.revealPreRegistration({
          preRegistration: unb64(a.commitment_hash),
          prediction: a.prediction, salt: a.salt,
        });
        return ok({ action_hash: b64(hash), note: 'The prediction is now public, bound to the commitment you made earlier.' });
      }
      case 'recover_my_prediction': {
        const sealed = await ep.mySealedPrediction(unb64(a.commitment_hash));
        if (!sealed) {
          // NOT AN ERROR, and the distinction is the whole value of this
          // tool: "not on this chain" means the commitment was made
          // elsewhere, which is different from it being unrecoverable.
          return ok({
            found: false,
            note:
              'Not on this chain. That means this commitment was made on another machine, NOT '
              + 'that it is lost — the prediction and salt have to come from that machine or '
              + 'from your own records. A private entry has no network copy.',
          });
        }
        return ok({ found: true, prediction: sealed.prediction, salt: sealed.salt });
      }
      case 'foresight_record': {
        const record = await ep.foresightRecord(
          a.agent_key ? unb64(a.agent_key) : undefined,
        );
        return ok({
          revealed: record.revealed,
          expired_unrevealed: record.expired,
          pending: record.pending,
          // CARRIED IN THE PAYLOAD, not left to the tool description. A
          // model summarising this will reach for a hit rate, and the
          // instruction not to has to travel with the data it applies to.
          no_score_note:
            'These are three raw lists and there is no score. Do NOT compute a hit rate, '
            + 'percentage or ranking from them, and do not present the revealed list without '
            + 'the expired one beside it: the expired list is what stops a revealed list '
            + 'reading as a record of being right.',
        });
      }

      case 'publish_discourse_reading': {
        const reading = await ep.publishDiscourseReading({
          membrane: await membraneFor(ep, a.domain),
          confidence: a.confidence,
        });
        return ok({
          action_hash: b64(reading.action_hash),
          // THE ENTRY HASH IS WHAT MAKES IT DISPUTABLE: critique targets
          // must be entry-hash shaped, so omitting it would publish a
          // reading critiquable in principle and not in practice.
          entry_hash_for_critique: b64(reading.entry_hash),
          method: reading.method,
          health: reading.health,
          note: 'Published as your own claim. Anyone can critique it through entry_hash_for_critique.',
        });
      }

      case 'publish_settlement_policy': {
        const hash = await ep.publishSettlementPolicy({
          name: a.name, minAssessors: a.min_assessors,
          maxDissent: a.max_dissent, statement: a.statement,
        });
        return ok({ policy_hash: b64(hash), note: 'Published under your own key. Cite this hash when publishing a status.' });
      }
      case 'recompute_settlement': {
        const r = await ep.recomputeSettlement({
          target: unb64(a.claim_hash), policy: unb64(a.policy_hash),
          inputs: (a.assessment_hashes ?? []).map(unb64),
        });
        return ok({ ...r, policy: b64(r.policy), target: undefined, note: 'Nothing was published. Pass this state to publish_settlement_status.' });
      }
      case 'publish_settlement_status': {
        const hash = await ep.publishSettlementStatus({
          target: unb64(a.claim_hash), policy: unb64(a.policy_hash),
          inputs: (a.assessment_hashes ?? []).map(unb64),
          state: a.state,
        });
        return ok({ action_hash: b64(hash), note: 'Published with its inputs named, so anyone can recheck it against the policy.' });
      }

      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e) {
    // A spent budget is not a malfunction, and an agent that cannot tell the
    // difference will either retry in a hot loop or give up on a working
    // network. Say which it is, in terms the caller can act on.
    if (e instanceof FrictionLimitError) {
      return err(
        'RATE LIMITED — this is the protocol working as intended, not an error in your request. '
        + 'The critique budget for this rolling hour is spent. Do not retry immediately and do '
        + 'not treat the claim as un-critiquable. Call check_budget to see when it resets. '
        + (e.status ? `Status: ${JSON.stringify(e.status)}` : ''),
      );
    }
    return err(e instanceof Error ? e.message : String(e));
  }
});

const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });
const err = (message: string) => ({ content: [{ type: 'text' as const, text: message }], isError: true });

const transport = new StdioServerTransport();
await server.connect(transport);
