#!/usr/bin/env node
// ============================================================================
// notes/src/main.ts — run the shared notes layer.
//
//   node dist/main.js                       # ephemeral, port 8790
//   EPI_NOTES_STATE=./notes.json node dist/main.js
//   EPI_NOTES_PORT=9000 EPI_NOTES_ORIGIN=https://notes.example node dist/main.js
//
// Ephemeral is the DEFAULT rather than an option, and that is a statement
// about the layer rather than a convenience for tests. Nothing above the gate
// is permanent; a server that quietly accumulated a durable archive of every
// half-thought anyone ever wrote would be exactly the thing the two-layer
// design exists to avoid. Persistence is opt-in, by naming a file you can
// delete.
// ============================================================================

import { createNotesServer } from './server.js';
import { NotesStore } from './store.js';
import { capsFromEnv, DEFAULT_PARKED_POLLS, Limiter } from './limits.js';

const port = Number(process.env.EPI_NOTES_PORT ?? 8790);
// An EMPTY `EPI_NOTES_STATE` means "no state file", not "a file called
// nothing". `EPI_NOTES_STATE= node dist/main.js` and `env EPI_NOTES_STATE=''`
// are both ordinary ways for a shell — or a test harness building an env
// object — to say "unset this", and `?? null` does not catch either, because
// an empty string is not null. Found by `scripts/live-verify/notes-ui.mjs` on
// its first run: the server started, served reads, and threw ENOENT on the
// first WRITE, when the atomic rename tried to move `.tmp` onto `''`. A
// startup flag that only fails on write is the worst shape this could take,
// so it is normalised here and guarded again in NotesStore.open.
const statePath = (process.env.EPI_NOTES_STATE ?? '').trim() || null;
const publicOrigin = process.env.EPI_NOTES_ORIGIN ?? `http://localhost:${port}`;

// Built here rather than inside the server so a malformed EPI_NOTES_CAP_* is
// a process that refuses to start, not one that starts on defaults the
// operator does not know they are running.
const parkedPolls = Number(process.env.EPI_NOTES_PARKED_POLLS ?? DEFAULT_PARKED_POLLS);
const limiter = new Limiter(capsFromEnv(), parkedPolls);

// Opt-in for the same reason the state file is: reading X-Forwarded-For with
// nothing in front of this process makes every address-keyed ceiling spoofable
// by one header, and a defence that can be turned off by the attacker is worse
// than a missing one, because it is believed.
const trustProxy = (process.env.EPI_NOTES_TRUST_PROXY ?? '').trim() === '1';

const store = NotesStore.open(statePath);
const server = createNotesServer({ store, publicOrigin, limiter, trustProxy });

server.listen(port, () => {
  console.log(`[notes] listening on ${publicOrigin} (port ${port})`);
  console.log(`[notes] state: ${statePath ?? 'in memory only — nothing here survives this process'}`);
  const ceilings = Object.values(limiter.caps)
    .map((cap) => `${cap.bucket} ${cap.limit <= 0 ? 'off' : `${cap.limit}/${cap.windowMs / 1000}s`}`)
    .join(', ');
  console.log(`[notes] ceilings: ${ceilings}, events.parked ${parkedPolls}`);
  console.log(`[notes] client address from: ${trustProxy ? 'X-Forwarded-For (EPI_NOTES_TRUST_PROXY=1)' : 'the socket'}`);
  console.log('[notes] this process holds no Holochain credentials and cannot publish anything.');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    // `server.close()` alone waits for every open connection to finish, and
    // this service's whole liveness design is built on connections that stay
    // open for 25 seconds on purpose. So a plain close means Ctrl-C appears
    // to hang for half a minute, and a restart script that waits for the port
    // silently talks to the OLD process for as long as one poll is parked.
    // Found exactly that way: a harness restarted this server, got a healthy
    // /health from the process it had just asked to stop, and concluded the
    // replacement was up.
    //
    // A dropped long-poll costs a client one retry, which is what a long-poll
    // is already built to handle, so idle connections go at once and the rest
    // get a short grace period to finish an in-flight write.
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => server.closeAllConnections(), 500).unref();
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
