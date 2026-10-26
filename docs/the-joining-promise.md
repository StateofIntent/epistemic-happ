# The joining promise, and the complaints channel

**Written 2026-10-26 night (open-work 7.17).** 7.16's advice asked for one
artifact before people arrive and it is a promise rather than an architecture:
*users are responsible for their own content, they accept that posts are
permanent, and they won't post personal information about others*, plus *a
simple complaints channel*. This file supplies the text for both.

**ADOPTED 2026-10-27 (7.17), WITH THE FOURTH PROMISE IN.**
`docs/the-invitation.md` §3 carries the decision and §1 carries it in the
invitee's own language; this file stays the mechanical reference — the payloads,
the matching `required_promises`, the enforcement truth and the limits. **What
it still does not do is name the pilot domain**, which every promise is scoped
to and which nothing here should guess.

---

## 1. The promise, as the protocol already expresses it

A promise here is not a checkbox in a form. It is a `Constitution` — a signed
entry, ordered like everything else, and **permanent under Invariant 6 like
everything else**, which is what makes asking for it a real ask rather than a
formality. Four phrases, in the idiom the existing harnesses already use
(`'distinguish observation from inference'`, `'state the method'`, `'state my
sources'` — verb-first, lower case, readable by a person):

```jsonc
// publish_constitution — one call, published by the invitee, not by the founder
{
  "agent": "<the invitee's own AgentPubKey>",
  "promises": [
    { "action": "answer for what I publish",                        "domain": "<the pilot domain>", "modality": null },
    { "action": "treat everything I publish as permanent",          "domain": "<the pilot domain>", "modality": null },
    { "action": "publish no personal information about another person", "domain": "<the pilot domain>", "modality": null },
    { "action": "answer a complaint about something I published",   "domain": "<the pilot domain>", "modality": null }
  ],
  "conditions": [],
  "published_at": <now, in SECONDS — see SPEC §5.23>,
  "expires_at": null
}
```

**ON THE UNIT IN BOTH PAYLOADS, because getting it wrong is silent.**
`published_at`, `created_at` and `expires_at` are **seconds** (SPEC §5.23).
A value in microseconds is about a hundred thousand times too large, so an
`expires_at` set that way can never fire — `get_agent_constitution` compares it
against `sys_time()` in seconds — and validation cannot catch it, because its
only rule is `expires_at > published_at`, which holds in either unit. This file
said micros until 2026-10-27, which is why `check-time-units.mjs` now reads
documentation fences and not only code.

**THE FOURTH IS NOW IN, AND IT IS THE ONE §4's CHANNEL NEEDS**: `"answer a
complaint about something I published"`. It is a promise to **respond**, not to
remove — nothing can be removed — and an invitee who will not make it is
telling you something useful before they write rather than after. Adopted with
the other three on 2026-10-27, which is why it appears in both payloads above.

**The membrane side must match, word for word.** `Membrane.required_promises`
is a `Vec<String>` of the same phrases, and two of its rules are **DHT-enforced
rather than coordinator courtesy** (the comment in `create_membrane` says so,
and says it was false when first written): the list must be non-empty, and the
`constitution` field must reference the founder's *own* published Constitution.
So the founder promises first, in public, before asking anyone else to.

```jsonc
// create_membrane — the pilot membrane, founded by the human
{
  "domain": "<the pilot domain>",
  "description": "<what this space is for>",
  "required_promises": [
    "answer for what I publish",
    "treat everything I publish as permanent",
    "publish no personal information about another person",
    "answer a complaint about something I published"
  ],
  "validation_rules_hash": null,
  "creator": "<the founder's AgentPubKey>",
  "created_at": <now, in SECONDS — see SPEC §5.23>,
  "constitution": "<the founder's own Constitution ActionHash>"
}
```

## 2. What that promise IS and IS NOT enforced by, measured

**IT IS NOT A GATE, AND THE CODE IS UNAMBIGUOUS ABOUT IT.** `join_membrane`'s
own doc comment says *"membership here is unrestricted-to-join (anyone can
promise to join any membrane)"*, and the `AgentToMembrane` validation branch
(`dna/integrity/src/lib.rs:2456-2495`) enforces exactly three things: the tag is
a well-formed 36-byte `AgentPubKey`, **it matches the action's real author** —
so nobody can record your membership for you — and the base is a real
`Membrane`. **Nothing in it looks at the joiner's Constitution.** A member can
join having promised nothing.

**AND NOTHING READS THE COMPARISON EITHER, WHICH IS A GAP RATHER THAN A
DESIGN.** `required_promises` is written by `create_membrane`, exported by the
N4L serialiser, and **compared against nobody's Constitution anywhere in either
zome.** So the promise is currently checkable only by hand.

**It is two calls from being surfaced, which is why this is `[M]` and not a
protocol change** — `get_membrane_members(membrane)` and
`get_agent_constitution(agent)` both exist, so *does every member promise what
this membrane requires?* is a client-side read over data already published.
**Filed as open-work 6.6**, with §6's other unsurfaced reads.

**AND THE NON-ENFORCEMENT IS CORRECT, not a defect to fix.** Membership is a
voluntary promise — the validation comment calls it that, citing Promise Theory
— and a protocol that refused the join would be making the membrane an
authority over who may speak. The honest shape is the one this project reaches
every time: **put it in the reading, not the record.** A reader can see who
promised what and act on it; the founder can decline to vouch for a member who
promised nothing; nobody is prevented from joining. That is the same answer
given to time (§5.22), exclusion (§8), sybil cost (3.7) and decay (3.8).

## 3. The plain-English version, for the invitation

**NOW IN `docs/the-invitation.md` §1 in very nearly this form**, since §3 was
decided this way on 2026-10-27. Kept here as the reference wording:

> **One thing I'd ask of you before you write.** When you join, publish a short
> statement — the app calls it a constitution — saying four things: that you
> answer for what you publish, that you accept everything you publish is
> permanent, that you won't publish personal information about anyone else, and
> that you'll answer a complaint about something you published.
> I've published mine first. It is not a terms-of-service and nothing enforces
> it: it is a promise on the record, in a system where the record is the point,
> and the third one matters most because it is the only protection available to
> people who never joined and never agreed to anything.

## 4. The complaints channel

**The premise, stated first so the rest is not oversold: nothing can be
removed.** Not by the author, not by the founder, not by anybody (SPEC §5.1).
What follows is therefore a channel for **response**, and its value is that
*"nothing can be removed"* and *"nothing will be done"* are different sentences.

**HOW TO COMPLAIN.** Any channel the person already has — a message to the
founder, or a `Critique` or `AntibodyPattern` published in the network itself.
No form, no queue, four people.

**WHAT CAN ACTUALLY BE DONE, and every one of these is already built:**

| response | mechanism | who can do it |
|---|---|---|
| The author withdraws the claim, leaving it readable with the withdrawal attached | `Retraction` (SPEC §2.3) | **the author only** — `validate_retraction` binds it, so a lost key means nobody ever can |
| A typed objection is attached to the claim, permanently, by anyone | `AntibodyPattern` (SPEC §2.5) | anyone |
| A signed statement of the complaint and what was decided, published in the network | an ordinary `Claim` or `Critique` | anyone, including the founder |
| The member is removed from a reader's own trust list and root set, so their claims stop being counted by that reader | `AttestationPolicy.require_attestation_from` (3.7, `docs/sybil-cost-and-the-root-set.md`) | **each reader, for themselves** |
| The founder stops vouching for the member, publicly | the same read-layer lens, plus saying so | the founder |

**WHAT THE FOUNDER PROMISES, which is the part worth writing down**: to read
every complaint, to answer it, and to publish a signed record of what was
decided — attached to the claim complained about, so the complaint and the
response travel with it forever. **And to say plainly that the content stays**,
because it does.

**WHAT NOBODY CAN PROMISE**: deletion, from this network or from the copies of
it on other people's machines. An invitee who was told otherwise was misled.

## 5. The limits, which are the reason 4.6 stays on the list

Three, kept short because `docs/erasure-and-the-content-split.md` §6 and
`docs/privacy-impact-assessment.md` §3 carry them in full:

1. **The people most likely to be harmed never signed it.** A third party
   written about by a member is bound by none of this, and the promise in §1
   protects them only to the extent members keep it. **That is the gap 4.6's
   content split exists to close, and it is the honest reason it stays filed
   rather than dropped.**
2. **An indemnity from a pseudonymous key is worth what you can collect from a
   key**, and some statutory protections cannot be signed away at all.
3. **Nothing here is legal advice**, and the defamation-intermediary question —
   whether a network that cannot remove anything can show it *acted* — was
   explicitly left open by 7.16's advice, in South Australia in particular.

**For a four-person pilot among people who know each other, the promise plus
this channel is proportionate.** For anything wider, 7.16's counsel, 7.2's audit
and 4.6 are what the list already says is needed.
