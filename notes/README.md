# The shared notes layer

The soft room above the gate.

This service is the first piece of the layer described in *Notes Above,
Protocol Below*: a shared, freeform, **off-DHT** place to think, sitting
directly on top of a protocol that is deliberately strict about what may be
published. Nothing here is permanent, validated, cryptographically authored or
public. That is the entire point.

## Why it exists

The Epistemic Resonance Protocol buys typed disagreement, permanent history
and a hard refusal of global scores, and it pays for them in ceremony: a
casual half-thought has nowhere to land, and a `uhCkk…` hash is not something
anyone pastes into a browser. The obvious fix — loosen the rules, allow a
half-thought as a `Claim` — would destroy the only thing the protocol has that
Twitter and the Semantic Web do not.

So the rules are not loosened. A room is put in front of them where the rules
do not apply yet, and one deliberate act — **promotion** — carries material
across. Because notes never reach the DHT, there is no pressure to weaken
validation, friction limits or the no-ranking rule to accommodate them.

## What it is, concretely

A single Node process, no runtime dependencies, speaking JSON over HTTP:

```bash
cd notes && npm install && npm run build
npm start                                        # ephemeral, http://localhost:8790
EPI_NOTES_STATE=./notes.json npm start           # opt-in persistence
EPI_NOTES_PORT=9000 EPI_NOTES_ORIGIN=https://notes.example npm start
```

**Ephemeral is the default**, and that is a statement about the layer rather
than a convenience for tests. A server quietly accumulating a durable archive
of every half-thought anyone ever wrote is the thing the two-layer design
exists to avoid. Persistence is opt-in, by naming a file you can delete.

This is the design note's "conventional collaborative store" — one rung above
local-only storage, and deliberately conventional. It is not a CRDT, it is not
eventually consistent, and it is not trying to be a second DHT. There is
exactly one DHT and it is one directory over and one gate down.

## The one property to preserve

**This process holds no Holochain credentials and cannot publish anything.**

Promotion is performed by the *client*, under the member's own agent key,
against their own conductor. This service is told afterwards, and stores an
opaque base64 `ActionHash` it has no way to verify — which is correct, because
the authoritative copy is on the DHT, addressed by that hash, and anyone who
cares can go and look. The soft layer is never a second source of truth about
the hard one.

A service that *could* publish would need a rule saying it must not. One that
cannot needs no rule, and `scripts/live-verify/notes-layer.mjs` asserts the
absence structurally against the built bundle.

## What the design refuses, in code

| Refused | Where |
|---|---|
| Popularity, "top spaces", activity-volume orderings | `listDirectory` — a 400 naming the reason, never a silent fallback |
| Comparative signals of any kind | `SpaceSignals` is space-local; no endpoint compares two spaces |
| Automatic promotion | no code path exists; see above |
| Permanent notes | `deleteNote` really deletes |

The directory offers exactly two orderings — `recent` and `alphabetical`.
One is a fact about time, the other a fact about names, and neither reads as
an endorsement. Every field the directory legitimately shows (participant
count, last activity) is one `sort=` parameter away from being a leaderboard,
which is why the refusal is explicit and tested rather than merely absent.

## Discovery, in the order the design builds it

1. **Invite links.** Every space has one from the moment it exists, carrying
   the creator's description and example notes so a newcomer sees the tone
   before joining. `open`, `request` (a member decides) or `expiring`. Holding
   the link *is* the credential — previewing one needs no token.
2. **A light directory.** Opt-in listing, self-chosen tags, the two orderings
   above.
3. **Descriptive activity signals.** "12 notes this week", "3 AI agents
   helping here" — enough to tell whether a room is alive, never enough to
   tell you it is better than another room.
4. **Visible AI collaborators.** An AI joins as a full member with
   `kind: "ai"` and advertises what it offers, which surfaces in the invite
   preview and the directory. It is a reason to walk in the door, and it is
   never disguised as a human participant.

## HTTP surface

Authentication is `Authorization: Bearer <member token>`, minted at join and
scoped to one space. It is a soft-layer credential: it says *someone gave you
this link and you walked through it*, not *you are this person*. Identity with
cryptographic weight starts one layer down.

| | |
|---|---|
| `GET /health` | liveness |
| `POST /spaces` | create a space; returns the creator's token and the first invite |
| `GET /directory?sort=&tag=` | listed spaces only |
| `GET /spaces/:id` · `PATCH /spaces/:id` | the space's own self-description |
| `GET /spaces/:id/members` · `/signals` | who is here; how alive it is |
| `POST /spaces/:id/invites` · `GET` · `DELETE /invites/:token` | mint, list, revoke |
| `GET /invites/:token` | **public** preview |
| `POST /invites/:token/join` | join, or file a request |
| `GET /spaces/:id/requests` · `POST /requests/:id/decision` | a member decides |
| `GET /requests/:id` | the requester collects their own token |
| `GET/POST /spaces/:id/notes` · `PATCH/DELETE /notes/:id` | the notes themselves |
| `POST /notes/:id/promotions` | record that something crossed the gate |
| `GET /spaces/:id/events?since=` | long-poll; wakes on the next change |

Any member may rewrite or delete any note in their space. This is a shared
notebook, not a set of adjacent private ones, and the argument for freeform
notes over threads — a note lets you be wrong first — only pays off if being
wrong is correctable by whoever spots it.

## Verification

```bash
cd notes && npm install && npm run build
node scripts/live-verify/notes-layer.mjs
```

Drives a real server over real HTTP with several members at once. Needs no
conductor and spends no friction budget, so unlike most of that directory it
is safe to run at any time in any order. See its header for what it proves and
for the fault injection that shows it can fail.

## Status

**Proposed, now partly built.** The service, its rules and its verification
are real code as of this commit. What is *not* here yet, and is tracked
separately: the browser client and promotion flow in `mobile-ui/`, the in-space
AI collaborator, and the Linked Data face for published entries.
