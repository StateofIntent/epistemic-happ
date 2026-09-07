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

const store = NotesStore.open(statePath);
const server = createNotesServer({ store, publicOrigin });

server.listen(port, () => {
  console.log(`[notes] listening on ${publicOrigin} (port ${port})`);
  console.log(`[notes] state: ${statePath ?? 'in memory only — nothing here survives this process'}`);
  console.log('[notes] this process holds no Holochain credentials and cannot publish anything.');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
