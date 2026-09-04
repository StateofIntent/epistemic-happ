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

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { EpistemicAgent, FrictionLimitError, CONFIDENCE_LEVELS, CRITIQUE_MODES } from '@stateofintent/agent-sdk';

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
    name: 'discourse_health',
    description:
      'Structural measures of a domain\'s discourse — how much of it is critique, how much is '
      + 'grounded in evidence. These describe the CONVERSATION, never an agent, and they are not '
      + 'a score anyone can be ranked by.',
    inputSchema: {
      type: 'object',
      properties: { domain: { type: 'string' } },
      required: ['domain'],
    },
  },
] as const;

const server = new Server(
  { name: 'epistemic-resonance', version: '0.1.0' },
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
      case 'discourse_health':
        return ok(await ep.discourseHealth(a.domain));
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
