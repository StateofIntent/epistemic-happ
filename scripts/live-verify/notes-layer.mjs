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
// ---------------------------------------------------------------------------
// Runtime: ~8 seconds, most of it the deliberate 1.2s wait for a 1-second
// invite to actually expire. Real clock, real expiry.
// ============================================================================

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.EPI_NOTES_TEST_PORT ?? 8791);
const ORIGIN = `http://localhost:${PORT}`;
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
async function call(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${ORIGIN}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  try { payload = await res.json(); } catch { /* a body-less response is fine */ }
  return { status: res.status, body: payload };
}

async function startServer(statePath) {
  const env = { ...process.env, EPI_NOTES_PORT: String(PORT), EPI_NOTES_ORIGIN: ORIGIN };
  if (statePath) env.EPI_NOTES_STATE = statePath;
  else delete env.EPI_NOTES_STATE;
  const child = spawn(process.execPath, [MAIN], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', (d) => process.stderr.write(`[notes stderr] ${d}`));
  for (let i = 0; i < 100; i++) {
    await sleep(50);
    try {
      const res = await fetch(`${ORIGIN}/health`);
      if (res.ok) return child;
    } catch { /* not up yet */ }
  }
  child.kill('SIGKILL');
  setupFail([`the notes server never answered /health on ${ORIGIN}.`]);
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
