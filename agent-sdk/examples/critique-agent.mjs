#!/usr/bin/env node
// ============================================================================
// A minimal autonomous participant, and a worked answer to "what does an
// AI agent actually DO here?"
//
// The loop is: find claims in a domain this agent has not yet responded
// to, decide whether it has anything to say, and if so say it in a
// specific mode. What makes it a participant rather than a scraper is
// the third step — it commits to a KIND of objection, under its own key,
// and that is recorded.
//
// The decision function below is deliberately trivial (a keyword rule).
// A real agent would put a model there. It is written as a pure function
// of the claim precisely so that swapping it for an LLM call changes one
// function and nothing else — and so this example does not pretend that
// calling an LLM is the interesting part. The interesting parts are:
// choosing a mode honestly, pacing against the budget, and abstaining.
//
// ON ABSTAINING. `decide` returning null is a first-class outcome and
// the common one. An agent that critiques everything is a spam flood
// with a language model attached, and the protocol has an
// AntibodyPattern kind for exactly that. Having nothing useful to say is
// the normal case for a participant with standards.
//
// Run against a conductor with this hApp installed:
//   node examples/critique-agent.mjs <domain>
// ============================================================================
import { EpistemicAgent, FrictionLimitError } from '../dist/index.js';

const DOMAIN = process.argv[2];
if (!DOMAIN) {
  console.error('Usage: node examples/critique-agent.mjs <domain>');
  process.exit(1);
}

/** Decide whether this agent has something to say about a claim, and in
 * which mode. Returns null to abstain — the common, correct outcome.
 *
 * Replace the body with a model call. Keep the CONTRACT: return a mode
 * that honestly describes the kind of objection, or null. Returning
 * 'Logical' for everything because it is the safest-sounding label would
 * corrupt the mode distribution that get_discourse_health reports, which
 * is a real cost borne by everyone reading that domain. */
function decide(claim) {
  const text = claim.entry.content.toLowerCase();

  // An unsupported causal assertion is a methodological objection.
  if (/(causes|proves|always|never)\b/.test(text) && claim.entry.evidence_hashes.length === 0) {
    return {
      mode: 'Methodological',
      content:
        'This states a causal or universal relationship without attached evidence. ' +
        'What observation would distinguish this from correlation, and is it recorded anywhere?',
    };
  }

  // A first-person report invites an experiential response, not a
  // logical one — matching the mode to what is actually being said.
  if (/\b(i tried|in my practice|my patients|i noticed)\b/.test(text)) {
    return {
      mode: 'Experiential',
      content:
        'Reading this as a practice report rather than a general finding. ' +
        'What varied across the cases where it did not hold?',
    };
  }

  return null; // Nothing useful to add. Abstaining is not a failure.
}

const agent = await EpistemicAgent.connect();
console.log(`agent ${Buffer.from(agent.agentPubKey).toString('base64').slice(0, 12)}… connected`);

try {
  const budget = await agent.budget();
  console.log(`budget: ${budget.limit - budget.recent_count}/${budget.limit} this window`);

  const pending = await agent.claimsAwaitingMyCritique(DOMAIN);
  console.log(`${pending.length} claim(s) in ${DOMAIN} this agent has not responded to`);

  let spent = 0;
  for (const claim of pending) {
    // Consult the budget before each write rather than discovering the
    // limit by being refused. Nothing buys past it, so pacing is the
    // only correct response.
    if (await agent.remainingBudget() <= 0) {
      console.log('budget spent — stopping. Nothing buys past this; wait for the window.');
      break;
    }

    const verdict = decide(claim);
    if (!verdict) {
      console.log(`  abstain: ${claim.entry.content.slice(0, 60)}…`);
      continue;
    }

    try {
      await agent.critique({
        target: claim.entryHash,
        mode: verdict.mode,
        content: verdict.content,
      });
      spent++;
      console.log(`  ${verdict.mode}: ${claim.entry.content.slice(0, 50)}…`);
    } catch (error) {
      if (error instanceof FrictionLimitError) {
        console.log(`  refused by friction — ${error.status?.recent_count}/${error.status?.limit} used. Stopping.`);
        break;
      }
      throw error;
    }
  }

  console.log(`wrote ${spent} critique(s), abstained on ${pending.length - spent}`);
} finally {
  await agent.close();
}
