#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/notes-layer.mjs — THE SOFT LAYER, AGAINST A REAL SERVER.
//
// WHAT THIS IS FOR. `notes/` is the first piece of the layer that sits ABOVE
// the promotion gate: a shared, freeform, off-DHT room where half-formed
// thinking can live without the protocol having to relax a single invariant to
// accommodate it. Every other harness in this directory drives a real
// conductor. This one drives a real `node notes/dist/main.js` over real HTTP
// with several members at once, for the same reason: the interesting failures
// are between processes, not inside one.
//
// IT DOES NOT NEED A CONDUCTOR, and that is the design rather than a gap. The
// notes service holds no Holochain credentials and cannot publish anything —
// promotion is performed by the CLIENT, on the member's own agent key, and the
// service is merely told afterwards. One check asserts that separation
// structurally, against the built bundle, because it is the property that
// makes "promotion is never automatic" true by construction rather than by
// policy: there is no code path here to accidentally enable.
//
// THE PROPERTY MOST WORTH CHECKING is the one that is easiest to lose later.
// Every field the directory legitimately shows — participant count, last
// activity, note counts — is one `sort=` parameter away from a leaderboard,
// and a leaderboard over rooms is precisely what this layer sits above a
// protocol built to avoid. So the refusal is a check, not a comment: an
// unrecognised sort is a 400 that says why, never a silent fall back to a
// default that leaves the caller believing they got what they asked for.
//
// THE THIRD PROPERTY, added when the browser client started showing other
// people's writing as it arrives, is that a shared notebook must not let the
// second save win silently. Any member may rewrite any note — that is the
// point — but a save may now say which version it was written against, and
// one written against a version somebody has already replaced is refused
// rather than applied. The checks live in the notes section below; the
// screen-level half is `notes-live.mjs`.
//
// THE SECOND PROPERTY WORTH CHECKING is the room's own friction. Ceilings are
// the part of a service that is written once, believed thereafter, and quietly
// stops working — so they are hit here rather than described: a real server
// started with tiny caps from the environment, refused at the wall, and asked
// what it refuses. Two of those checks exist because the failure they catch is
// invisible in review — a charge that lands after the store has already
// written, and an X-Forwarded-For honoured with nothing in front of the
// process, both of which read as a working defence and are not one.
//
// Prereqs: `cd notes && npm install && npm run build`. Needs NO sandbox
// conductor and spends no friction budget, so unlike most of this directory it
// is safe to run at any time, in any order, alongside anything else. It binds
// its own port (EPI_NOTES_TEST_PORT, default 8791 — deliberately not the
// service's own 8790, so a running notes server is not disturbed) and kills
// the servers it starts.
//
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness can fail, and fails in the right place.
//
//   Injection: `DIRECTORY_SORTS` widened to include 'popular', plus the four
//   lines of sort code that would make it work — exactly the shape the
//   convenience arrives in, since every field the directory already shows is
//   enough to rank on.
//   Result: exactly two reds — "a popularity ordering is REFUSED" and "the
//   refusal says why". Everything else stayed green, including the paired
//   `sort=activity` check, which is correct: that value was still refused, and
//   a harness that went red on it too would have been asserting something
//   vaguer than it claims. Reverted; 56 checks green.
//
//   Injection: `clientAddress` widened to read X-Forwarded-For unconditionally
//   — the shape this arrives in, since honouring the header is what you do the
//   day a proxy goes in front, and the `trustProxy` argument is right there.
//   Result: exactly one red — "X-Forwarded-For is ignored unless an operator
//   says something is in front". The two TRUST_PROXY=1 checks stayed green,
//   correctly: that server was told to trust the header, and the injection did
//   not change what it does. Reverted.
//
//   Injection: `clientAddress` returning `socket.remoteAddress` verbatim, with
//   no normalisation — the service exactly as it shipped, and the shape this
//   arrives in, since the address is right there on the socket and looks like
//   the whole answer.
//   Result: exactly one red — "one machine is one ceiling, whichever family it
//   connects over". The X-Forwarded-For check beside it stayed GREEN, which is
//   correct and is the reason both checks exist: the header rule was never
//   broken by this, and a harness that went red on both would be asserting
//   something vaguer than either. Reverted; the whole file green.
//
//   That injection is the defect this file kept flaking on rather than one
//   invented for the block. The X-Forwarded-For check failed on CI twice,
//   months apart, and was recorded in the root README as open and uncaused: it
//   asks a 1-per-hour ceiling to refuse the SECOND create, this harness reached
//   `http://localhost`, and Node's fetch picks an address family per
//   connection — so a call landing on the other family made it the first call
//   again and no refusal came. The connection is pinned to 127.0.0.1 now, and
//   the family question is asked on purpose instead of by accident.
//
//   Injection: the `spaces.create` charge moved to after `store.createSpace`,
//   which is where it lands if you are thinking "charge for what happened"
//   rather than "refuse before anything happens".
//   Result: exactly one red — "a refused create wrote nothing". Every 429
//   check stayed green, which is the point: the refusal still looked perfect
//   from outside while the room had already grown a space. Reverted.
// ---------------------------------------------------------------------------
// Runtime: ~5 seconds, most of it two deliberate waits against a real clock:
// 1.2s for a 1-second invite to expire, and a parked poll being interrupted
// by a SIGTERM that must not wait it out. 90 checks.
// ============================================================================

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.EPI_NOTES_TEST_PORT ?? 8791);
const ORIGIN = `http://localhost:${PORT}`;
/** Where this harness actually connects, and it is NOT `localhost`.
 *
 * `localhost` resolves to both ::1 and 127.0.0.1, and Node's fetch picks a
 * family per connection — so a harness that asks a per-address ceiling to
 * refuse the SECOND call is really asking two questions at once, and the one it
 * does not mean to ask is answered by the resolver. That is what made the
 * X-Forwarded-For check below fail twice on CI, months apart, for no reason
 * anybody could name: one call landing on the other family makes it the first
 * call again, and the refusal never comes. ORIGIN stays `localhost` because
 * that is the origin the SERVER is configured with; the connection is pinned. */
const BASE = `http://127.0.0.1:${PORT}`;
const MAIN = new URL('../../notes/dist/main.js', import.meta.url).pathname;
const SERVER_JS = new URL('../../notes/dist/server.js', import.meta.url).pathname;
const STORE_JS = new URL('../../notes/dist/store.js', import.meta.url).pathname;

const STAMP = Date.now();
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

// --- The thinnest possible client ------------------------------------------
// Deliberately not the browser client from mobile-ui: a harness that shares a
// client with the thing it verifies can only find bugs both halves agree
// about. This talks to the documented HTTP surface directly.
/** A create over a base this harness does not otherwise use, for asking
 * whether the address family changes who the caller is. Returns the status, or
 * null when nothing is listening on that family at all. */
async function createOver(base, name) {
  try {
    const res = await fetch(`${base}/spaces`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `${name} ${STAMP}`, description: 'A room with small ceilings.',
        listed: true, creator: { displayName: 'Ada' },
      }),
    });
    return res.status;
  } catch {
    return null;
  }
}

async function call(method, path, { token, body, headers: extra, signal } = {}) {
  const headers = { ...extra };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    signal,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  try { payload = await res.json(); } catch { /* a body-less response is fine */ }
  // `retryAfter` is checked in both places deliberately: the header is what an
  // ordinary HTTP client acts on, the body is what a person reads.
  return { status: res.status, body: payload, retryAfter: res.headers.get('retry-after') };
}

async function startServer(statePath, extraEnv = {}) {
  // An empty EPI_NOTES_STATE is passed deliberately for the ephemeral case
  // rather than deleting the key. That is how a shell says "unset" — and it
  // is the shape that broke the service once: `?? null` does not catch an
  // empty string, so the server started, served reads, and threw ENOENT on
  // the first WRITE when the atomic rename tried to move `.tmp` onto `''`.
  // Found by notes-ui.mjs on its first run; kept here so it stays fixed.
  const env = {
    ...process.env,
    EPI_NOTES_PORT: String(PORT),
    EPI_NOTES_ORIGIN: ORIGIN,
    EPI_NOTES_STATE: statePath ?? '',
    // The ceilings are per-deployment config, so the harness sets them the
    // only way an operator can: through the environment, on a server it
    // actually starts. Poking a Limiter in-process would verify a class this
    // service might not be wiring up.
    ...extraEnv,
  };
  const child = spawn(process.execPath, [MAIN], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', (d) => process.stderr.write(`[notes stderr] ${d}`));
  for (let i = 0; i < 100; i++) {
    await sleep(50);
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return child;
    } catch { /* not up yet */ }
  }
  child.kill('SIGKILL');
  setupFail([`the notes server never answered /health on ${BASE}.`]);
}

/** Starts the service expecting it NOT to come up.
 *
 * A malformed ceiling has to be a process that dies loudly, and the only way
 * to prove that is to let one die: a harness that asserted the parse function
 * throws would leave `main.ts` free to catch it and start on defaults nobody
 * chose. */
async function startExpectingRefusal(extraEnv) {
  const env = {
    ...process.env,
    EPI_NOTES_PORT: String(PORT),
    EPI_NOTES_ORIGIN: ORIGIN,
    EPI_NOTES_STATE: '',
    ...extraEnv,
  };
  const child = spawn(process.execPath, [MAIN], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  const code = await new Promise((resolve) => {
    child.once('exit', (c) => resolve(c ?? 1));
    // Resolving 0 on the timeout is deliberate: "it stayed up" must read as a
    // failed check here, not as a hung harness.
    setTimeout(() => { child.kill('SIGKILL'); resolve(0); }, 5000);
  });
  return { code, stderr };
}

async function stopServer(child) {
  if (!child) return;
  await new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill('SIGTERM');
    setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 2000);
  });
}

async function main() {
  if (!existsSync(MAIN)) {
    setupFail([
      `${MAIN} does not exist.`,
      'Run: cd notes && npm install && npm run build',
      'Packing does not compile — the same trap this directory records for the zomes.',
    ]);
  }

  const stateDir = mkdtempSync(join(tmpdir(), 'epi-notes-'));
  const statePath = join(stateDir, 'notes.json');
  let server = await startServer(statePath);

  try {
    // === A space exists the moment it is created, and so does its link ===
    log('\n--- Creating a space ---');
    const created = await call('POST', '/spaces', {
      body: {
        name: `Loaded carries ${STAMP}`,
        description: 'Working notes on loaded-carry progressions, before any of it is worth publishing.',
        tags: ['Rehab', 'strength'],
        listed: true,
        creator: { displayName: 'Ada', kind: 'human' },
        examples: [
          'Rotator cuff felt fine at 32kg but the grip gave out first — worth writing up properly one day.',
          'Six weeks in, the asymmetry is gone. No idea if that generalises.',
        ],
      },
    });
    if (created.status !== 200) setupFail([`space creation returned ${created.status}: ${JSON.stringify(created.body)}`]);
    const space = created.body.space;
    const ada = created.body.token;
    check('creating a space returns a member token for its creator', typeof ada === 'string' && ada.length > 20);
    check('every space has an invite link from the moment it exists',
      typeof created.body.invite?.url === 'string' && created.body.invite.url.includes('/invites/'));
    check('the creator\'s example notes are stored as notes, flagged as examples',
      (await call('GET', `/spaces/${space.id}/notes`, { token: ada })).body.notes.filter((n) => n.exemplar).length === 2);
    check('tags are normalised to lower case so a directory filter is not case-sensitive',
      JSON.stringify(space.tags) === JSON.stringify(['rehab', 'strength']));

    // === The invite link is the credential, and it works unauthenticated ===
    log('\n--- Invite links ---');
    const openToken = created.body.invite.token;
    const preview = await call('GET', `/invites/${openToken}`);
    check('an invite previews WITHOUT a member token — holding the link is the credential',
      preview.status === 200 && preview.body.preview.space.id === space.id);
    check('the preview carries the example notes, so a newcomer sees the tone before joining',
      preview.body.preview.examples.length === 2);

    const joined = await call('POST', `/invites/${openToken}/join`, {
      body: { displayName: 'Brun', kind: 'human' },
    });
    check('an open invite joins you immediately', joined.body.outcome === 'joined');
    const brun = joined.body.token;
    check('joining mints a distinct member token', typeof brun === 'string' && brun !== ada);

    // === AI members are members, and visibly so ===
    log('\n--- Humans and AI agents are both members ---');
    const aiJoin = await call('POST', `/invites/${openToken}/join`, {
      body: { displayName: 'Tutor', kind: 'ai', offers: ['onboarding', 'critique-tutor'] },
    });
    const tutor = aiJoin.body.token;
    const members = await call('GET', `/spaces/${space.id}/members`, { token: ada });
    const ai = members.body.members.filter((m) => m.kind === 'ai');
    check('an AI agent joins as a full member, not as a feature of the room', ai.length === 1);
    check('what an AI member offers is visible to everyone in the space',
      JSON.stringify(ai[0].offers) === JSON.stringify(['onboarding', 'critique-tutor']));
    check('no member listing ever carries a member token',
      !JSON.stringify(members.body).includes(ada) && !JSON.stringify(members.body).includes(brun));
    const previewWithAi = await call('GET', `/invites/${openToken}`);
    check('an invite preview says what help the room offers — the AI is a reason to walk in the door',
      previewWithAi.body.preview.aiOffers.includes('critique-tutor'));

    // === The directory lists what opted in, and refuses to rank ===
    log('\n--- The directory ---');
    const unlisted = await call('POST', '/spaces', {
      body: {
        name: `Private reading group ${STAMP}`,
        description: 'Unlisted on purpose.',
        listed: false,
        creator: { displayName: 'Cass' },
      },
    });
    const dirRecent = await call('GET', '/directory?sort=recent');
    const ids = dirRecent.body.entries.map((e) => e.space.id);
    check('a listed space appears in the directory', ids.includes(space.id));
    check('an unlisted space does not', !ids.includes(unlisted.body.space.id));
    check('a directory row carries participant count and last activity, and nothing comparative',
      (() => {
        const row = dirRecent.body.entries.find((e) => e.space.id === space.id);
        const keys = Object.keys(row).sort().join(',');
        return keys === 'aiMembers,lastActivityAt,space,totalMembers' && row.totalMembers === 3;
      })());
    const alpha = await call('GET', '/directory?sort=alphabetical');
    check('alphabetical ordering is offered', alpha.status === 200);
    const byTag = await call('GET', '/directory?tag=REHAB');
    check('filtering by a tag the space chose for itself works, case-insensitively',
      byTag.body.entries.length === 1 && byTag.body.entries[0].space.id === space.id);

    const ranked = await call('GET', '/directory?sort=popular');
    check('a popularity ordering is REFUSED, not silently ignored', ranked.status === 400);
    check('and the refusal says why, in the response a client will actually surface',
      /leaderboard/i.test(ranked.body?.message ?? ''));
    const ranked2 = await call('GET', '/directory?sort=activity');
    check('the same refusal covers activity-volume orderings, which are the same thing in a hat',
      ranked2.status === 400 && ranked2.body.error === 'unsupported_sort');

    // === Request-to-join is a decision a member makes ===
    log('\n--- Request-to-join invites ---');
    const reqInvite = await call('POST', `/spaces/${space.id}/invites`, {
      token: ada, body: { mode: 'request' },
    });
    const reqToken = reqInvite.body.invite.token;
    const asked = await call('POST', `/invites/${reqToken}/join`, { body: { displayName: 'Dee' } });
    check('following a request-to-join link files a request rather than joining you',
      asked.body.outcome === 'requested' && asked.body.request.granted === null);
    const requestId = asked.body.request.id;
    const pending = await call('GET', `/requests/${requestId}`);
    check('the requester holds only a request id, and it yields no token while pending',
      pending.body.token === null);
    const decided = await call('POST', `/requests/${requestId}/decision`, {
      token: ada, body: { granted: true },
    });
    check('an existing member decides', decided.body.request.granted === true);
    check('the decision response does NOT hand the deciding member someone else\'s token',
      !('token' in decided.body));
    const collected = await call('GET', `/requests/${requestId}`);
    check('the requester collects their own token from the request they filed',
      typeof collected.body.token === 'string');
    const redecide = await call('POST', `/requests/${requestId}/decision`, {
      token: ada, body: { granted: false },
    });
    check('a decided request cannot be decided again', redecide.status === 409);

    // === Expiring invites expire on a real clock ===
    log('\n--- Expiring and revoked invites ---');
    const expiring = await call('POST', `/spaces/${space.id}/invites`, {
      token: ada, body: { mode: 'expiring', ttlSeconds: 1 },
    });
    const expToken = expiring.body.invite.token;
    check('an expiring invite works before it expires',
      (await call('GET', `/invites/${expToken}`)).status === 200);
    check('an expiring invite without a ttl is refused at creation',
      (await call('POST', `/spaces/${space.id}/invites`, { token: ada, body: { mode: 'expiring' } })).status === 400);
    await sleep(1200);
    const afterExpiry = await call('GET', `/invites/${expToken}`);
    check('after its ttl, the same link is gone — checked against the real clock, not a mock',
      afterExpiry.status === 410 && afterExpiry.body.error === 'invite_expired');
    check('and joining through an expired link is refused too, not just previewing it',
      (await call('POST', `/invites/${expToken}/join`, { body: { displayName: 'Late' } })).status === 410);

    const revocable = await call('POST', `/spaces/${space.id}/invites`, { token: ada, body: { mode: 'open' } });
    await call('DELETE', `/invites/${revocable.body.invite.token}`, { token: ada });
    check('a revoked invite is refused',
      (await call('GET', `/invites/${revocable.body.invite.token}`)).status === 410);
    check('revoking twice is idempotent rather than an error about the state you asked for',
      (await call('DELETE', `/invites/${revocable.body.invite.token}`, { token: ada })).status === 200);

    // === Notes: freeform, editable, and really deletable ===
    log('\n--- Notes ---');
    const note = await call('POST', `/spaces/${space.id}/notes`, {
      token: brun, body: { text: 'Grip failure might be the whole story. Or it might be posture.' },
    });
    check('any member can write a note', note.status === 200);
    const edited = await call('PATCH', `/notes/${note.body.note.id}`, {
      token: ada, body: { text: 'Grip failure might be the whole story. Or posture. Ada: or both.' },
    });
    check('any member can rewrite any note — this is a shared notebook, not adjacent private ones',
      edited.body.note.text.endsWith('or both.'));
    check('rewriting moves updatedAt but not the original authorship',
      edited.body.note.authorId === note.body.note.authorId && edited.body.note.updatedAt >= note.body.note.createdAt);

    // --- Two people, one note ---
    // Any member may rewrite any note, which is the point. What was wrong was
    // that the second save won SILENTLY: the first person's paragraph
    // vanished with nothing on either screen to say it had. A save may now
    // state which version it was written against.
    check('a note carries the version its text is on, starting at zero',
      note.body.note.rev === 0 && edited.body.note.rev === 1);
    const stale = await call('PATCH', `/notes/${note.body.note.id}`, {
      token: brun, body: { text: 'Written against the version Brun was looking at.', expectedRev: 0 },
    });
    check('a save written against a version somebody has already replaced is REFUSED, not applied',
      stale.status === 409 && stale.body.error === 'note_changed');
    check('and the refusal says nothing was lost, because nothing was',
      /nothing you typed is gone/i.test(stale.body?.message ?? ''));
    check('the refused save really did not touch the note',
      (await call('GET', `/spaces/${space.id}/notes`, { token: brun }))
        .body.notes.find((n) => n.id === note.body.note.id).text.endsWith('or both.'));
    const fresh = await call('PATCH', `/notes/${note.body.note.id}`, {
      token: brun, body: { text: 'Brun, having read Ada\'s line, rewrites it anyway.', expectedRev: 1 },
    });
    check('the same save against the version that is actually there succeeds, and moves the version on',
      fresh.status === 200 && fresh.body.note.rev === 2);
    const blind = await call('PATCH', `/notes/${note.body.note.id}`, {
      token: ada, body: { text: 'An edit that did not say what it was replacing.' },
    });
    check('an edit that names no version still overwrites — the check is opt-in, so curl stays usable',
      blind.status === 200 && blind.body.note.rev === 3);
    check('a version that is not an integer is refused as a bad request rather than ignored',
      (await call('PATCH', `/notes/${note.body.note.id}`, {
        token: ada, body: { text: 'x', expectedRev: 'two' },
      })).status === 400);

    const doomed = await call('POST', `/spaces/${space.id}/notes`, {
      token: brun, body: { text: 'Nonsense I want to take back.' },
    });
    await call('DELETE', `/notes/${doomed.body.note.id}`, { token: brun });
    const afterDelete = await call('GET', `/spaces/${space.id}/notes`, { token: brun });
    check('deletion really deletes — the opposite of the layer below, and deliberately so',
      !afterDelete.body.notes.some((n) => n.id === doomed.body.note.id));
    check('a deleted note is a 404, not a tombstone',
      (await call('PATCH', `/notes/${doomed.body.note.id}`, { token: brun, body: { text: 'x' } })).status === 404);

    // === Tokens are scoped to one space ===
    log('\n--- Scoping ---');
    const other = unlisted.body.space.id;
    check('a token for one space cannot read another space\'s notes',
      (await call('GET', `/spaces/${other}/notes`, { token: ada })).status === 403);
    check('and cannot write to it either',
      (await call('POST', `/spaces/${other}/notes`, { token: ada, body: { text: 'trespass' } })).status === 403);
    check('an absent token is refused before anything else',
      (await call('GET', `/spaces/${space.id}/notes`)).status === 401);
    check('an invented token is refused',
      (await call('GET', `/spaces/${space.id}/notes`, { token: 'not-a-real-token' })).status === 401);

    // === Signals are descriptive and space-local ===
    log('\n--- Activity signals ---');
    const signals = (await call('GET', `/spaces/${space.id}/signals`, { token: ada })).body.signals;
    check('signals count what happened in THIS space this week', signals.notesLastWeek >= 3);
    check('signals report how many members were active today, from real request activity',
      signals.membersActiveToday >= 2);
    check('signals name how many AI agents are helping here', signals.aiMembers === 1);
    check('no signal is comparative — the payload mentions no other space',
      !JSON.stringify(signals).includes(other));

    // === The gate ===
    log('\n--- Promotion: recorded, never performed ---');
    const fakeHash = Buffer.from(`uhCkk-promoted-${STAMP}`).toString('base64');
    const promoted = await call('POST', `/notes/${note.body.note.id}/promotions`, {
      token: ada,
      body: {
        kind: 'claim',
        excerpt: 'Grip failure might be the whole story.',
        actionHash: fakeHash,
        dnaHash: null,
      },
    });
    check('a promotion is recorded against the note it came from', promoted.status === 200);
    check('the excerpt is stored verbatim, so provenance survives the note being rewritten later',
      promoted.body.promotion.excerpt === 'Grip failure might be the whole story.');
    check('a promotion without an action hash is refused — there is nothing to point at',
      (await call('POST', `/notes/${note.body.note.id}/promotions`, {
        token: ada, body: { kind: 'claim', excerpt: 'x' },
      })).status === 400);
    check('a promotion of an unrecognised kind is refused',
      (await call('POST', `/notes/${note.body.note.id}/promotions`, {
        token: ada, body: { kind: 'mew', excerpt: 'x', actionHash: fakeHash },
      })).status === 400);
    const afterPromotion = await call('GET', `/spaces/${space.id}/notes`, { token: ada });
    check('the original note stays exactly where it was after being promoted',
      afterPromotion.body.notes.some((n) => n.id === note.body.note.id && n.promotions.length === 1));

    // The structural half of the same property. A service that COULD publish
    // would need a rule saying it must not; one that cannot needs no rule.
    const built = readFileSync(SERVER_JS, 'utf8') + readFileSync(STORE_JS, 'utf8');
    check('the built notes service imports no Holochain client and cannot publish anything',
      !/@holochain|AppWebsocket|callZome/.test(built));

    // === Liveness, without holding a socket per note ===
    log('\n--- Long-poll liveness ---');
    const first = await call('GET', `/spaces/${space.id}/events?since=0`, { token: ada });
    check('a client that has never polled gets an immediate snapshot',
      first.body.changed === true && Array.isArray(first.body.notes));
    const revision = first.body.revision;
    const waiting = call('GET', `/spaces/${space.id}/events?since=${revision}`, { token: ada });
    await sleep(300);
    await call('POST', `/spaces/${space.id}/notes`, { token: tutor, body: { text: 'The tutor writes too.' } });
    const woken = await waiting;
    check('a poll parked on the current revision wakes when another member writes',
      woken.body.changed === true && woken.body.revision > revision);
    check('and the wake carries the new note, so one round trip is enough',
      woken.body.notes.some((n) => n.text === 'The tutor writes too.'));

    // === Persistence is opt-in, and honest when it is on ===
    log('\n--- Restart ---');
    const beforeRestart = (await call('GET', `/spaces/${space.id}/notes`, { token: ada })).body.notes.length;
    await stopServer(server);
    server = await startServer(statePath);
    const afterRestart = await call('GET', `/spaces/${space.id}/notes`, { token: ada });
    check('a state file survives a restart, notes and member tokens together',
      afterRestart.status === 200 && afterRestart.body.notes.length === beforeRestart);

    await stopServer(server);
    server = await startServer(null);
    check('with no state file, a restart starts genuinely empty — nothing above the gate is permanent',
      (await call('GET', '/directory')).body.entries.length === 0);
    // The empty-string case above is only proven by a WRITE succeeding: the
    // defect it guards against left reads working perfectly.
    const ephemeralWrite = await call('POST', '/spaces', {
      body: { name: `Ephemeral ${STAMP}`, description: 'Written with EPI_NOTES_STATE empty.',
        listed: true, creator: { displayName: 'Ada' } },
    });
    check('an empty EPI_NOTES_STATE means "no file", and writes succeed rather than 500',
      ephemeralWrite.status === 200);

    // === Friction limits: the room's own ceilings, not the protocol's ======
    // Run last and against fresh servers with deliberately tiny caps, because
    // the only honest way to check a ceiling is to hit it. The caps are set
    // through the environment — the same surface an operator has — so what is
    // verified is the wiring, not a class in isolation.
    log('\n--- Friction limits ---');
    await stopServer(server);
    server = await startServer(null, {
      EPI_NOTES_CAP_SPACES_CREATE: '2/3600',
      EPI_NOTES_CAP_NOTES_CREATE: '2/3600',
      EPI_NOTES_CAP_INVITES_CREATE: 'off',
      EPI_NOTES_PARKED_POLLS: '1',
    });

    const makeSpace = (name, headers) => call('POST', '/spaces', {
      headers,
      body: {
        name: `${name} ${STAMP}`, description: 'A room with small ceilings.',
        listed: true, creator: { displayName: 'Ada' },
      },
    });

    const room = await makeSpace('Capped room');
    const secondRoom = await makeSpace('Second room');
    if (room.status !== 200 || secondRoom.status !== 200) {
      setupFail([`the first two creates under a 2/hour cap should both succeed; got ${room.status} and ${secondRoom.status}`]);
    }
    const third = await makeSpace('Third room');
    check('the one unauthenticated create is capped per address — the third is refused',
      third.status === 429 && third.body.error === 'rate_limited');
    check('the refusal names the ceiling that ran out, so a caller knows which call to slow down',
      third.body.bucket === 'spaces.create');
    check('the retry hint is in the Retry-After header AND the body — one for a client, one for a person',
      third.retryAfter === String(third.body.retryAfter) && Number(third.retryAfter) > 0);
    check('the refusal says this ceiling is the room\'s own and spends none of the protocol\'s friction',
      /nothing you do above the gate/i.test(third.body?.message ?? ''));
    check('a refused create wrote nothing — the charge lands before the store, not after',
      (await call('GET', '/directory')).body.entries.length === 2);
    const reads = await Promise.all(Array.from({ length: 12 }, () => call('GET', '/directory')));
    check('reads are capped at no rate at all — a room that will not answer is not a room',
      reads.every((r) => r.status === 200));

    // --- inside the room: per member, and the gate stays untaxed ---
    const capRoom = room.body.space.id;
    const capAda = room.body.token;
    const capBrun = (await call('POST', `/invites/${room.body.invite.token}/join`, {
      body: { displayName: 'Brun' },
    })).body.token;
    const write = (token, text) => call('POST', `/spaces/${capRoom}/notes`, { token, body: { text } });

    const adaNote = await write(capAda, 'First of two.');
    await write(capAda, 'Second of two.');
    const adaThird = await write(capAda, 'One past the ceiling.');
    check('writing inside a room is capped per member', adaThird.status === 429 && adaThird.body.bucket === 'notes.create');
    check('and the ceiling belongs to that member, not to the room — everybody else writes on',
      (await write(capBrun, 'Brun has budget of his own.')).status === 200);

    const promotions = [];
    for (let i = 0; i < 5; i++) {
      promotions.push(await call('POST', `/notes/${adaNote.body.note.id}/promotions`, {
        token: capAda,
        body: {
          kind: 'claim', excerpt: `Promoted ${i}.`,
          actionHash: Buffer.from(`uhCkk-capped-${STAMP}-${i}`).toString('base64'),
        },
      }));
    }
    check('promotion stays uncapped while the same member\'s note budget is spent — the gate is not taxed twice',
      promotions.every((p) => p.status === 200));

    const minted = [];
    for (let i = 0; i < 22; i++) {
      minted.push(await call('POST', `/spaces/${capRoom}/invites`, { token: capAda, body: { mode: 'open' } }));
    }
    check('a cap set to "off" is no ceiling at all, well past where the default (20) would have stopped',
      minted.every((m) => m.status === 200));

    // --- a meter you can only point at yourself ---
    const budget = await call('GET', '/me/budget', { token: capAda });
    const noteLine = budget.body.budget.find((b) => b.bucket === 'notes.create');
    check('a member can read their own remaining budget before they hit the wall',
      noteLine.used === 2 && noteLine.limit === 2 && noteLine.resetsAt > Date.now());
    check('a cap that is off reports as a zero limit rather than vanishing from the meter',
      budget.body.budget.find((b) => b.bucket === 'invites.create').limit === 0);
    check('address-keyed ceilings are absent from a member\'s budget — a member is not an address',
      !budget.body.budget.some((b) => b.bucket === 'spaces.create' || b.bucket === 'join.address'));
    check('a budget line carries a count and a reset and nothing sortable between members',
      budget.body.budget.every((b) => Object.keys(b).sort().join(',') === 'bucket,limit,resetsAt,used'));
    check('and the meter is a member route like any other, so it can only answer for a token in hand',
      (await call('GET', '/me/budget')).status === 401);

    // --- /events is limited by held sockets, not by rate ---
    const rev = (await call('GET', `/spaces/${capRoom}/events?since=0`, { token: capAda })).body.revision;
    const parked = call('GET', `/spaces/${capRoom}/events?since=${rev}`, { token: capAda });
    await sleep(300);
    const secondPoll = await call('GET', `/spaces/${capRoom}/events?since=${rev}`, { token: capAda });
    check('a second parked poll past the concurrency ceiling is refused, and says which ceiling',
      secondPoll.status === 429 && secondPoll.body.bucket === 'events.parked');
    await write(capBrun, 'A write that wakes the parked poll.');
    check('the poll that was holding the slot still answers normally', (await parked).body.changed === true);
    check('and the slot is released when it answers, rather than leaking until the process restarts',
      (await call('GET', `/spaces/${capRoom}/events?since=0`, { token: capAda })).status === 200);

    // Hanging up has to free the slot IMMEDIATELY, which is a different
    // property. A browser leaving a room aborts its poll; if the server only
    // released on timeout, walking in and out of a room would spend a
    // member's whole allowance on rooms they have already left — the ceiling
    // locking out the one caller it was never meant to bound.
    const liveRev = (await call('GET', `/spaces/${capRoom}/events?since=0`, { token: capAda })).body.revision;
    const hangUp = new AbortController();
    const abandoned = call('GET', `/spaces/${capRoom}/events?since=${liveRev}`, {
      token: capAda, signal: hangUp.signal,
    }).catch(() => null);
    await sleep(300);
    hangUp.abort();
    await abandoned;
    await sleep(600);
    check('a poll the client hangs up on frees its slot at once, rather than 25 seconds later',
      (await call('GET', `/spaces/${capRoom}/events?since=0`, { token: capAda })).status === 200);

    // And the same fact from the operator's side. `server.close()` waits for
    // open connections, and this service's liveness is built on connections
    // that stay open for 25 seconds ON PURPOSE — so a plain close means Ctrl-C
    // appears to hang, and worse, a restart script that waits for the port
    // gets a healthy answer from the process it just asked to stop. A poll is
    // parked deliberately here rather than hoped for: the first version of
    // this check lived in another harness, where whether anything was parked
    // at kill time was a matter of timing, and it passed cleanly against a
    // server with the defect still in it.
    const parkedRev = (await call('GET', `/spaces/${capRoom}/events?since=0`, { token: capAda })).body.revision;
    const stubborn = call('GET', `/spaces/${capRoom}/events?since=${parkedRev}`, { token: capAda })
      .catch(() => null);
    await sleep(400);
    const askedAt = Date.now();
    const exited = new Promise((resolve) => server.once('exit', () => resolve(Date.now() - askedAt)));
    server.kill('SIGTERM');
    const shutdownMs = await Promise.race([exited, sleep(10000).then(() => null)]);
    await stubborn;
    check('SIGTERM stops the server promptly even with a poll parked, rather than waiting out the poll',
      shutdownMs !== null && shutdownMs < 5000);
    server = null;

    // --- whose address it is, and who gets to say ---
    // The failure mode this pair guards against is the worst kind: a ceiling
    // that looks present in the code, reads as a defence in review, and can be
    // reset by any caller willing to send one header.
    server = await startServer(null, { EPI_NOTES_CAP_SPACES_CREATE: '1/3600' });
    await makeSpace('Behind nothing', { 'x-forwarded-for': '10.0.0.1' });
    const spoofed = await makeSpace('Spoofed', { 'x-forwarded-for': '10.0.0.2' });
    check('X-Forwarded-For is ignored unless an operator says something is in front — one header must not reset a ceiling',
      spoofed.status === 429);

    // THE SAME QUESTION ASKED OF THE TRANSPORT INSTEAD OF A HEADER, and the
    // answer used to be different. A ceiling keyed on socket.remoteAddress
    // verbatim is keyed on the address FAMILY as much as on the caller: the
    // same machine is `::1` over IPv6 and `127.0.0.1` over IPv4, which was two
    // budgets for one caller — openable by anybody who connects the other way
    // and nothing cleverer. It is also what made the check above flake, since
    // this harness reached `localhost` and Node's fetch chooses a family per
    // connection. Both halves are fixed; this is the half that stays checked.
    const overTheOtherFamily = await createOver(`http://[::1]:${PORT}`, 'Over the other family');
    if (overTheOtherFamily === null) {
      // Reported, not skipped silently: a machine with no IPv6 loopback cannot
      // answer this, and a green tick that proved nothing would be worse than
      // a line saying so.
      log('  (no IPv6 loopback here — the address-family check did not run)');
    } else {
      check('one machine is one ceiling, whichever family it connects over',
        overTheOtherFamily === 429);
    }

    await stopServer(server);
    server = await startServer(null, { EPI_NOTES_CAP_SPACES_CREATE: '1/3600', EPI_NOTES_TRUST_PROXY: '1' });
    const viaProxy = await makeSpace('Behind a proxy', { 'x-forwarded-for': '10.0.0.1' });
    const otherClient = await makeSpace('A different client', { 'x-forwarded-for': '10.0.0.2' });
    const sameClient = await makeSpace('The first client again', { 'x-forwarded-for': '10.0.0.1' });
    check('with EPI_NOTES_TRUST_PROXY=1 two forwarded clients are two budgets, not one shared proxy',
      viaProxy.status === 200 && otherClient.status === 200);
    check('and the first of them is still held to its own ceiling',
      sameClient.status === 429);

    // --- a ceiling nobody can typo their way out of ---
    await stopServer(server);
    server = null;
    const refusal = await startExpectingRefusal({ EPI_NOTES_CAP_NOTES_CREATE: '120 per hour' });
    check('a malformed ceiling stops the process at startup rather than quietly running a default',
      refusal.code !== 0);
    check('and the complaint names the variable and the shape it wanted',
      /EPI_NOTES_CAP_NOTES_CREATE/.test(refusal.stderr) && /count\/seconds/.test(refusal.stderr));
  } finally {
    await stopServer(server);
    rmSync(stateDir, { recursive: true, force: true });
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
