#!/usr/bin/env node
// ============================================================================
// notes/src/assistant-main.ts — run an assistant as a member of a space.
//
//   node dist/assistant-main.js <invite-url-or-token>
//
//   EPI_NOTES_ORIGIN     where the notes server is (default http://localhost:8790)
//   EPI_ASSISTANT_NAME   how it appears in the room (default "Assistant")
//   EPI_ASSISTANT_OFFERS what it advertises, comma-separated
//                        (default "onboarding,critique-tutor")
//   ANTHROPIC_API_KEY    if set, answers come from Claude; if not, from fixed
//                        keyword rules, and every answer says which
//
// IT JOINS THROUGH AN INVITE LINK, like anyone else. There is no registration
// endpoint for AI members and no configuration flag that conjures one into a
// space: somebody in the room hands this process a link, exactly as they would
// hand one to a person — which is the point of putting the assistant in the
// membership model rather than in the service.
//
// HOW A ROOM STOPS ONE, HONESTLY. This file used to say "revoke the link or
// remove the member", and neither half is true today. An invite is consulted
// only at join time, so revoking it stops the NEXT assistant and does nothing
// about one already in the room. And there is no HTTP route to remove a
// member at all: `NotesStore.removeMember` exists and nothing exposes it. So
// the only way to stop an assistant right now is to stop its process, or to
// restart an ephemeral notes server and take every token with it.
//
// That is a gap in the membership model rather than in this file, and it is
// left open deliberately: a removal route needs an answer to "who may remove
// whom" — any member, only the creator, nobody without a second member
// agreeing — and that is a decision about how a room governs itself, not a
// detail to settle inside a client fix. The 401 handling below is what makes
// such a route work the day it exists. See notes/README.md's Status section.
//
// AND IT IS HELD TO THE SAME CEILINGS, which is the other half of the same
// idea. `notes/src/limits.ts` caps answers per member per hour, and an AI
// member is a member: a busy room is exactly where a tireless participant
// meets a limit sized for people. That is the cap working, not failing — so
// the fix belongs here, in the client, and it is threefold:
//
//   1. A 429 is WAITED OUT for the number of seconds the service named. The
//      old behaviour was subtler than a busy loop, and worth stating exactly:
//      the refusal was swallowed, so the question was retried on the next
//      wake of the /events poll — which means the retry rate was whatever the
//      room's write rate happened to be. A quiet room hid it entirely; a busy
//      one retried on every note anybody typed.
//   2. While paused, no further questions are answered and NO SUGGESTER IS
//      CALLED — the model is not asked for work that cannot be posted. With a
//      real API key that is money, and it would be spent producing an answer
//      the room is about to refuse.
//   3. A 401 or 403 ends this process rather than being retried forever.
//      Revoking the invite or removing the member is the documented way to
//      tell this assistant to stop, and a process that spins on a dead token
//      makes the documented way not work.
// ============================================================================

import { chooseSuggester, type Suggester } from './assistant.js';
import type { Assist } from './types.js';

const origin = (process.env.EPI_NOTES_ORIGIN ?? 'http://localhost:8790').replace(/\/$/, '');
const displayName = process.env.EPI_ASSISTANT_NAME ?? 'Assistant';
const offers = (process.env.EPI_ASSISTANT_OFFERS ?? 'onboarding,critique-tutor')
  .split(',').map((offer) => offer.trim()).filter(Boolean);

const log = (message: string) => console.log(message);

function inviteTokenFrom(text: string): string | null {
  const fromUrl = /\/invites\/([A-Za-z0-9_-]+)/.exec(text);
  if (fromUrl) return fromUrl[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(text.trim()) ? text.trim() : null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A refusal from the service, with the parts a client has to act on kept
 * separate from the prose.
 *
 * The previous version threw a bare Error with the status stringified into
 * the message, which meant every refusal was the same shape to the caller:
 * "wait 40 minutes", "another member answered first" and "your membership was
 * revoked" were one undifferentiated failure, handled by sleeping two seconds
 * and trying again. */
class NotesHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Seconds the service asked us to wait. Only 429s carry one. */
    readonly retryAfter: number | null,
  ) {
    super(message);
    this.name = 'NotesHttpError';
  }
}

async function call<T>(method: string, path: string, options: { token?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${origin}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload: any = await response.json().catch(() => null);
  if (!response.ok) {
    // The header is read first because it is what any HTTP client would act
    // on; the body's copy is the fallback for a proxy that dropped it.
    const header = response.headers.get('retry-after');
    const retryAfter = header !== null ? Number(header)
      : typeof payload?.retryAfter === 'number' ? payload.retryAfter : null;
    throw new NotesHttpError(
      response.status,
      typeof payload?.error === 'string' ? payload.error : 'unknown',
      payload?.message ?? `${method} ${path} -> ${response.status}`,
      Number.isFinite(retryAfter) ? retryAfter : null,
    );
  }
  return payload as T;
}

/** How long to wait when the service says to wait, kept inside sane bounds.
 * Clamped low so a malformed header cannot spin, and high so a very long
 * window does not park this process for an afternoon without saying so
 * again. */
function waitFor(retryAfter: number | null): number {
  return Math.min(300, Math.max(1, retryAfter ?? 5));
}

/** Answers one question, and reports what to do next.
 *
 * Returns the seconds to pause for when the room refused on grounds of
 * friction, and null in every other case — including the ordinary one where
 * somebody else answered first. */
async function answerOne(assist: Assist, token: string, suggester: Suggester): Promise<number | null> {
  let suggested;
  try {
    suggested = await suggester.suggest(assist);
  } catch (error) {
    // An assistant that fails silently leaves a member watching a question
    // that never gets answered, with no way to tell whether anyone is there.
    suggested = {
      answer: `I could not answer that one: ${error instanceof Error ? error.message : String(error)}`,
      suggestion: { critiqueMode: null, entryKind: null, wording: null, reason: null },
      source: `${suggester.name} (failed)`,
    };
  }
  try {
    await call('POST', `/assists/${assist.id}/answer`, {
      token,
      body: { answer: suggested.answer, suggestion: suggested.suggestion, source: suggested.source },
    });
    log(`[assistant] answered ${assist.id} (${suggested.source})`);
    return null;
  } catch (error) {
    if (error instanceof NotesHttpError && error.status === 429) {
      const seconds = waitFor(error.retryAfter);
      // Said plainly, and said once. The distinction in the sentence is the
      // same one the service's own 429 makes: this is the room's ceiling, and
      // it has nothing to do with the protocol's friction budget one layer
      // down. Somebody reading this log should not go looking at their agent
      // key.
      log(`[assistant] the room's own answer ceiling is full — waiting ${seconds}s before trying `
        + `${assist.id} again. This is the notes layer's friction, not the protocol's.`);
      return seconds;
    }
    if (error instanceof NotesHttpError && error.code === 'already_answered') {
      // First answer wins, deliberately. A normal outcome, not a failure.
      log(`[assistant] ${assist.id} was already answered by somebody else.`);
      return null;
    }
    log(`[assistant] could not post an answer to ${assist.id}: ${error}`);
    return null;
  }
}

async function main(): Promise<void> {
  const argument = process.argv[2];
  if (!argument) {
    console.error('usage: node dist/assistant-main.js <invite-url-or-token>');
    process.exit(2);
  }
  const inviteToken = inviteTokenFrom(argument);
  if (!inviteToken) {
    console.error('that does not look like an invite link or token');
    process.exit(2);
  }

  const suggester = await chooseSuggester(log);

  const { preview } = await call<{ preview: { space: { id: string; name: string } } }>(
    'GET', `/invites/${inviteToken}`);
  const joined = await call<
    | { outcome: 'joined'; token: string; member: { id: string } }
    | { outcome: 'requested'; request: { id: string } }
  >('POST', `/invites/${inviteToken}/join`, {
    body: { displayName, kind: 'ai', offers },
  });

  let token: string;
  if (joined.outcome === 'joined') {
    token = joined.token;
  } else {
    // A request-to-join link means a person decides whether this assistant is
    // welcome. Waiting for that is the correct behaviour, not a limitation.
    log(`[assistant] asked to join ${preview.space.name}; waiting for someone to decide.`);
    const requestId = joined.request.id;
    for (;;) {
      await sleep(3000);
      const status = await call<{ request: { granted: boolean | null }; token: string | null }>(
        'GET', `/requests/${requestId}`);
      if (status.token) { token = status.token; break; }
      if (status.request.granted === false) {
        log('[assistant] the request was declined. Nothing more to do.');
        return;
      }
    }
  }

  const spaceId = preview.space.id;
  log(`[assistant] in "${preview.space.name}" as ${displayName}, offering: ${offers.join(', ') || 'nothing in particular'}`);

  let running = true;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => { running = false; process.exit(0); });
  }

  // Poll for questions. The long-poll on /events wakes on any change in the
  // space, which includes a new question — so this is not a busy loop, and an
  // idle room costs one parked request.
  let since = 0;
  /** Wall-clock time before which there is no point answering anything: the
   * room said its answer ceiling was full and named a moment. Held across
   * iterations so the pause covers the whole batch rather than being
   * rediscovered question by question. */
  let pausedUntil = 0;
  /** For failures that carry no instructions — a server that is down, a
   * network that is gone. Doubling, capped, and reset by any success. */
  let backoff = 2000;

  while (running) {
    try {
      const now = Date.now();
      if (now < pausedUntil) {
        await sleep(pausedUntil - now);
        continue;
      }

      const waiting = await call<{ assists: Assist[] }>(
        'GET', `/spaces/${spaceId}/assists?waiting=1`, { token });
      for (const assist of waiting.assists) {
        const pauseSeconds = await answerOne(assist, token, suggester);
        if (pauseSeconds !== null) {
          // Stop the batch here rather than asking the suggester for answers
          // that cannot be posted. With a real key that is a model call per
          // question, paid for, to produce text the room will refuse. The
          // questions stay in the waiting list and are picked up again after
          // the wait.
          pausedUntil = Date.now() + pauseSeconds * 1000;
          break;
        }
      }

      if (Date.now() >= pausedUntil) {
        const events = await call<{ revision: number }>(
          'GET', `/spaces/${spaceId}/events?since=${since}`, { token });
        since = events.revision;
      }
      backoff = 2000;
    } catch (error) {
      if (error instanceof NotesHttpError && (error.status === 401 || error.status === 403)) {
        // A token that no longer authenticates cannot be recovered by asking
        // again, so retrying here is a process that spins forever by design.
        // Stopping is also what makes a future member-removal route mean
        // something the day somebody adds one — see this file's header.
        log(`[assistant] this membership is no longer valid (${error.status}): ${error.message}`);
        log('[assistant] nothing more to do. Stopping.');
        return;
      }
      if (error instanceof NotesHttpError && error.status === 429) {
        const seconds = waitFor(error.retryAfter);
        log(`[assistant] the room asked for ${seconds}s before the next request (${error.code}). Waiting.`);
        await sleep(seconds * 1000);
        continue;
      }
      log(`[assistant] ${error}`);
      await sleep(backoff);
      backoff = Math.min(30000, backoff * 2);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
