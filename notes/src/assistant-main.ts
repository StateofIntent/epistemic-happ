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
// hand one to a person. Whoever runs it can therefore be told to stop by
// revoking the link or removing the member — which is the point of putting the
// assistant in the membership model rather than in the service.
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

async function call<T>(method: string, path: string, options: { token?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${origin}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload as T;
}

async function answerOne(assist: Assist, token: string, suggester: Suggester): Promise<void> {
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
  } catch (error) {
    // 409 means another member got there first, which is a normal outcome
    // rather than a failure — first answer wins, deliberately.
    log(`[assistant] could not post an answer to ${assist.id}: ${error}`);
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
      await new Promise((resolve) => setTimeout(resolve, 3000));
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
  while (running) {
    try {
      const waiting = await call<{ assists: Assist[] }>(
        'GET', `/spaces/${spaceId}/assists?waiting=1`, { token });
      for (const assist of waiting.assists) await answerOne(assist, token, suggester);

      const events = await call<{ revision: number }>(
        'GET', `/spaces/${spaceId}/events?since=${since}`, { token });
      since = events.revision;
    } catch (error) {
      log(`[assistant] ${error}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
