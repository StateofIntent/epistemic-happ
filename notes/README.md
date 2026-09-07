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

## The AI in the room

An assistant is a **member**, not a feature of this service. It follows an
invite link, registers with `kind: "ai"` and a list of what it offers, and
polls the same routes any member could. There is no registration endpoint for
AI members and no flag that conjures one into a space: somebody hands the
process a link, exactly as they would hand one to a person — and revoking the
link or removing the member is how you tell it to stop.

```bash
cd notes && npm install && npm run build
node dist/assistant-main.js 'http://localhost:8790/invites/<token>'

EPI_ASSISTANT_NAME=Tutor EPI_ASSISTANT_OFFERS=onboarding,critique-tutor \
  ANTHROPIC_API_KEY=... node dist/assistant-main.js '<invite link>'
```

**With no API key it still works, and says so.** The fallback answers from a
fixed keyword table and reports that in the `source` line the asker's screen
renders — because an assistant that goes silent without a key makes the whole
feature undemonstrable, and one that passes a keyword match off as a
considered judgement is worse than useless. The rules suggester therefore
declines to draft anyone's published wording at all: it will say which mode
the words look like and why, and stop there.

This service still holds no model credentials, makes no outbound calls, and
cannot tell a considered answer from a keyword table. It routes the question
and stores the answer, with `source` recorded as the answerer's own statement
and shown to the reader, who is the one deciding how much to trust it.

**An answer is a suggestion.** Nothing is applied by this service or by the
client on arrival; every field lands beside a button somebody presses. The
form is complete and usable with the assistant ignored entirely — the design
is explicit that someone who wants to explore unaided must still be able to.
Questions and answers are visible to the whole space rather than whispered to
the asker: an assistant answering privately would be a participant nobody else
can check. First answer wins, so two assistants racing cannot overwrite each
other, and any member — not only an AI one — may answer.

| | |
|---|---|
| `POST /spaces/:id/assists` | ask the room |
| `GET /spaces/:id/assists?waiting=1` | what an assistant polls for |
| `GET /assists/:id` | the asker collects the answer |
| `POST /assists/:id/answer` | any member answers, once |

## Verification

```bash
cd notes && npm install && npm run build
node scripts/live-verify/notes-layer.mjs        # the rules, over real HTTP
node scripts/live-verify/notes-assistant.mjs    # the assistant, in a real browser
```

Both drive a real server with several members at once; the second also runs a
real assistant process and a real Chromium. Neither needs a conductor or
spends any friction budget, so unlike most of that directory they are safe to
run at any time in any order. See their headers for what they prove and for
the fault injections that show they can fail — including one that *passed*
first time and had to be strengthened.

## The client, and the gate

`mobile-ui/` carries the browser half: a **Notes** tab, and a second door on
the connect screen so the notes layer is reachable *without a conductor at
all* — requiring one first would put the protocol's ceremony back in front of
the room built to sit in front of it.

Promotion happens there, not here. Selecting part of a note and choosing
"publish a stronger version" opens a form pre-filled from what was already
written; the critique mode — the one field the protocol will not let anyone
skip — is asked in plain language, with the five fixed variants spelled out as
sentences. Publishing calls `create_claim` or `create_critique` on the
practitioner's own conductor, under their own agent key, and only then tells
this service what happened. Without a connection the form is still rendered,
visibly disabled, saying that publishing needs an agent key this service does
not have and cannot obtain.

Verified end to end by `scripts/live-verify/notes-ui.mjs`, in a real Chromium
across two browser contexts, against a real conductor — with the published
Claim and Critique read back by an independent client rather than believed
from the screen.

## Status

**Proposed, now largely built.** The service, its rules, the browser client,
the promotion flow and the in-space assistant are real code, with three
verification harnesses. What is *not* here yet, and is tracked separately: the
Linked Data face for published entries.
