# The invitation — release step 4

> ## STATUS: THE OBLIGATIONS ARE DISCHARGED AND THE CHOICES ARE NOW MADE — 2026-10-27.
>
> Release step 4 is *"invite ten people on desktop"*, and as of 2026-10-26
> it has no structural blocker left: `v0.3.0` ships `protocol_version: 11`,
> two packaged installs exchanged claims in both directions (item 1.4), and
> 7.1 decided what is being vouched for.
>
> **What was missing was an artifact.** 7.1's commitment obliges "the
> permanence disclosure reaching every invitee *before* they write
> anything — because under Invariant 6 that disclosure is the only
> protection they get," and there was nothing written to send. This file is
> that, plus the two other things step 4 names.
>
> **§2 AND §3 WERE THE OPEN DECISIONS AND BOTH WERE TAKEN ON 2026-10-27**
> (items 7.13 and 7.17). §2: **four to six humans, declared, each free to
> run an agent alongside, no EU or UK invitees for now.** §3: **invitees are
> asked for a published `Constitution` carrying four promises.** §1 is ready
> to paste and now carries the ask and the complaints channel.
>
> **THE PILOT DOMAIN IS `fieldnotes`, CHOSEN 2026-10-27.** Lowercase and one
> word because the UI trims the domain input but does not lowercase it, so
> `FieldNotes` would be a different domain forever; no `/`, because
> `assert_expertise` already uses that as a namespace separator. The name was
> chosen so that the claims the cohort will naturally produce — what the
> software actually did on their machine — are also the claims step 4 exists
> to collect, and are about the world rather than about people (7.16's
> largest risk reducer).
>
> **So nothing is unnamed and the order is fixed**: publish your own four
> promises in `fieldnotes`, found the `fieldnotes` membrane requiring those
> four phrases, then send §1.
>
> **ONE DISCLOSURE GAP WAS KNOWN AND IS NOW BOUNDED — 7.16's advice arrived
> 2026-10-26 night, recorded at `docs/erasure-and-the-content-split.md`.**
> §1 tells an invitee their data is permanent, which is the obligation 7.1
> names. It says nothing about the possibility that, because every peer
> stores other peers' data, an invitee in the EU or UK **may be acquiring
> obligations of their own** rather than only accepting a risk to theirs —
> permanence affects their data, controllership affects their duties.
>
> **WHAT THE ADVICE SETTLED: this does not hold the message.** For a pilot
> of a handful of invitees outside the EU, *"telling invitees plainly that
> posts can't be deleted is enough"* — which §1's first paragraph already
> does. **WHAT IT DID NOT SETTLE: the sentence is still owed to any invitee
> in the EU or UK**, because the practical-enforcement argument that makes
> this near-nil is an argument about **having no EU users**, and it is spent
> the moment one is invited. So the gap is now conditional on §2's cohort
> rather than open: **mixed or European cohort → add the sentence; otherwise
> §1 stands as written.** It is advice from an informed non-lawyer rather
> than counsel, and 7.2's absent audit and counsel-before-a-public-post are
> both untouched by it.
>
> **AND A SECOND GAP WAS FOUND THE SAME NIGHT, BY WRITING THE IMPACT
> ASSESSMENT — open-work 7.19.** §1 discloses what is permanent and says
> nothing about what is ordinary: **running this reveals your IP address to
> the peers you gossip with and to two third-party services** — the
> bootstrap server (7.14) and, behind NAT, the relay — the way any
> peer-to-peer application does. It is not permanent and not in the DHT,
> which is exactly why it was missed while the permanent risk got
> paragraphs. **BOTH SENTENCES ARE NOW WRITTEN AND IN PLACE** — §1's fourth
> obliged item below, and a paragraph at the head of `INSTALL.md`'s *Finding
> other people*. §1's count moved from three obliged things to **four**,
> which is the only thing about the message that changed.

---

## 1. The message

Everything in this section is determined by decisions already taken. It is
written to be sent as-is, or edited for tone but not for content.

---

> I've built something and I'd like you to try it. Before you do, there are
> four things I'm obliged to tell you, and one of them is permanent.
>
> **Nothing you write in it can ever be deleted.** Not by you, not by me,
> not by anyone. There is no delete button, no edit, and no admin who can
> remove it for you — the capability is absent from the protocol rather
> than withheld. If you publish a claim and regret it, the only remedy is
> to publish a *retraction*, which adds a record saying you no longer
> stand behind it. The original stays readable.
>
> That is a deliberate design property, not a missing feature, and it is
> the single thing I most want you to understand before you type anything.
> **Write as though it is public and permanent, because it is both.**
>
> **Your data will not survive the next upgrade, and that upgrade is
> planned.** Each minor version is a separate network that never talks to
> the previous one. Two such breaks have already happened, and a third is
> planned rather than hypothetical. So what you publish now is permanent
> *within this network* and will not carry over to the next one. Both of
> those are true at once, and neither cancels the other.
>
> **It is honest about what it does, and it is not secure against someone
> trying.** I can vouch for the first: the documentation says accurately
> what the protocol does and does not do, and where I have found it wrong
> I have corrected it. I explicitly cannot vouch for the second. Anyone
> can generate any number of identities, and a determined person can run a
> modified client. For a handful of people who know each other that is
> theoretical; I would not want you to learn it later from someone else.
>
> **Running it reveals your IP address** — to the people you are connected
> to, and to two services I don't run. That is ordinary for peer-to-peer
> software: your computer talks directly to other people's computers, so
> each end can see the other's address, and a public directory server plus
> a relay (both Holochain's infrastructure, not mine) are what let you find
> each other and get through a home router. Unlike what you write, none of
> that is stored on the network or permanent — I mention it because you are
> about to run something that connects your machine to the others, and
> because you should hear it from me rather than work it out later.
>
> **What it is.** A place to publish claims and critique each other's,
> where disagreement is the point rather than a failure mode. There are no
> scores, no rankings and no reputation numbers anywhere, for anyone — that
> is the first thing the design commits to. Critiques are rate-limited on
> purpose, so disagreeing costs something.
>
> **What to expect mechanically**, because this is the thing everyone
> reports as "it's broken" and it isn't:
>
> - When we are both online, things appear in **seconds**.
> - If you close your laptop and come back, expect to wait **five to twelve
>   minutes** to catch up — and longer the longer you were away. The app
>   looks stale during that time. It is not; it is syncing.
> - You will see **nothing at all** until you type a domain name and load
>   it. An empty screen on first open is correct. **Ours is `fieldnotes`** —
>   all lowercase, one word; it is case-sensitive, so `Fieldnotes` is a
>   different and empty place.
>
> **Installing** is at `INSTALL.md`. Two things worth knowing in advance:
> it is not code-signed, so macOS and Windows will both object and the file
> tells you the exact incantation; and you must click through a **Setup**
> screen once, because nothing starts until you do.
>
> Install the **same version** I am on — different versions are different
> networks and see nothing of each other. I am on `v0.3.0`.
>
> **One thing I'd ask of you before you write.** When you join, publish a
> short statement — the app calls it a constitution — saying four things:
> that you answer for what you publish, that you accept everything you
> publish is permanent, that you won't publish personal information about
> anyone else, and that you'll answer a complaint about something you
> published. I've published mine first, and the space itself asks for those
> four. Nothing enforces them: it is a promise on the record, in a system
> where the record is the point. **The third one matters most, because it is
> the only protection available to people who never joined and never agreed
> to anything.**
>
> **And if something does go wrong, here is what I can and cannot do.** Tell
> me, or publish an objection in the network itself — anyone can attach one
> to any claim, permanently. I will read it, answer it, and publish what was
> decided, attached to the claim complained about. What I cannot do is remove
> anything, including my own. So *nothing can be deleted* and *nothing will
> be done* are different sentences, and I'd rather you heard which is which
> from me.
>
> If you hit something that looks wrong, tell me. Most of what I know about
> how this behaves came from someone hitting it.

---

## 2. Who — DECIDED 2026-10-27: four to six humans, declared, agents allowed

Step 4 says ten. **Ten is a proxy, not a threshold:** its stated purpose is
*"enough to find what three conductors on one machine cannot, few enough
that the propagation latency can be explained to each of them by hand."*

So the number is doing two jobs — enough **independent operators, machines,
networks and usage patterns** to surface what a single host cannot, and few
enough to hand-hold. Four real people on four connections serve both better
than ten identities on one.

**Open-work 7.13 is the live question here** — whether an agent may be one
of the ten. Its conclusion: agents *instead of* people fails on three
counts (7.1's honesty commitment, step 4's purpose, and 3.5's one-actor
problem), while agents *alongside* declared people, or ten people each
running an agent, fail none. If ten humans is the binding constraint, the
recommendation on record is **fewer than ten, declared** — because 7.5 and
the scalability work gate on step 4 having produced **real reports**, not
on a headcount.

**DECIDED 2026-10-27 (item 7.13): four to six humans, each declared as a
person, each free to run an agent alongside, and no EU or UK invitees for now.**

Three reasons, each tied to something already on the record rather than to
preference:

- **Step 4's purpose is served at four**, because the number was always a proxy
  for *independent operators, machines, networks and usage patterns*. Four real
  people on four connections produce more of that than ten identities on one.
- **7.1's honesty commitment survives**, which it would not if agents were
  counted as people. Agents alongside declared humans costs nothing here — the
  `agent-sdk` and `mcp-server` doors already exist, and an agent's writes are
  attributable to its own key like anyone else's.
- **Exposure scales with people, and 7.16's practical-enforcement argument is
  an argument about having no EU users.** Keeping the first cohort outside the
  EU and UK keeps that true, and means §1 does not need the controllership
  sentence yet. **Inviting one European invitee is the thing that changes
  that**, and the sentence above is where it goes when it does.

**Still the human's: which four to six people.** That is the only part of §2
nothing in this repository can supply.

## 3. What you ask of them — DECIDED 2026-10-27: a published Constitution, four promises

The protocol has an opinion about this that the invitation above
deliberately does not act on. Founding a domain *"costs nothing. Instead
you state what you promise, and what the domain will ask of anyone who
works in it"* — an entry condition instead of a fee.

So there is a real choice about whether invitees are asked for anything at
all:

- **Nothing.** They try it and report what breaks. Simplest, and §1 as
  written assumes this.
- **A promise.** They publish a `Constitution` — what they commit to when
  they write here. This is the mechanism the protocol actually offers, and
  it makes the cohort participants rather than testers. It is also
  permanent under Invariant 6, so asking for it is asking for something
  real.
- **A domain each.** Heavier, and probably premature before anyone has
  used it.

**7.1 declined "invite as a pure experiment"** on the grounds that it
*"gets testers rather than users and teaches less, since people behave
differently when told nothing counts."* That argues against the first
option, and is the reason this section exists rather than defaulting.

**AND AS OF 2026-10-26 NIGHT THE TEXT EXISTS — `docs/the-joining-promise.md`,
open-work 7.17.** 7.16's advice asks for one artifact before people arrive,
and it is a promise rather than an architecture: invitees affirm that **they
are responsible for their own content, that posts are permanent, and that
they will not post personal information about anyone else.** The three
phrases are written as a publishable `Constitution` — *answer for what I
publish*, *treat everything I publish as permanent*, *publish no personal
information about another person* — with the matching
`Membrane.required_promises`, the exact zome payloads, a fourth optional
promise the complaints channel needs, and the paragraph to paste here if
this section is decided that way. **Two things that file establishes and
this one should not re-derive**: the founder's own promise is DHT-enforced
(`create_membrane` refuses an empty list or someone else's Constitution),
and **the invitee's is not enforced at all** — joining is unrestricted by
design, because membership is a voluntary promise, so what makes the ask
worth making is that it is *readable*, which is open-work 6.6. That is the
second option above with its content supplied — and the first
option, asking for nothing, is the one the advice argues against for a
second independent reason: the only people this cohort can be asked to
protect are the ones who never joined it.

**Its companion is a complaints channel, and the mechanisms already exist**
— a `Retraction` by the author, an `AntibodyPattern` by anyone, and removal
from a reader's own trust list. Nothing can be deleted; something can still
be *done*, and saying so in the invitation is what keeps *"nothing can be
removed"* from reading as *"nothing will be done."* **DECIDED 2026-10-27 (item 7.17): option two — invitees are asked for a
published `Constitution`, carrying four promises.** *Answer for what I publish;
treat everything I publish as permanent; publish no personal information about
another person; answer a complaint about something I published.*

**The fourth is in deliberately**, because the complaints channel in §1 needs
somebody who has promised to respond — a promise to answer, never a promise to
remove, since removal does not exist.

**The exact payloads are in `docs/the-joining-promise.md` §1** — the
`publish_constitution` call for an invitee and the matching `create_membrane`
call with `required_promises` set to the same four phrases, word for word,
because the comparison in `promiseCompliance()` is string equality scoped to
the domain.

**THE ORDER MATTERS AND IS NOT OPTIONAL**, because the protocol enforces half
of it:

1. **You publish your own four promises first**, in the pilot domain.
   `create_membrane` refuses a membrane whose `constitution` is not the
   founder's own, and refuses an empty `required_promises` — both DHT-side, so
   the founder promising first is enforced rather than merely polite.
2. **Found the membrane** requiring those four phrases.
3. **Send §1** to each invitee, before they write anything.
4. **Each invitee publishes their own four promises and joins.** Joining is
   unrestricted by design — a protocol that refused the join would make the
   membrane an authority over who may speak — so the promise is *checkable*
   rather than *required*: `EpistemicAgent.promiseCompliance(membraneHash)`
   reports who actually promised what, and `scripts/live-verify/promise-compliance.mjs`
   is the proof it works (19 checks, four agents, one of whom promised nothing
   and joined anyway).

**AND THE MEMBRANE CARRIES THE PROMISES WHILE THE DOMAIN DOES NOT, which is
worth knowing before the ask is described as a gate.** `validate_claim` requires
only a non-empty `domain`, and founding is not a prerequisite for publishing —
so anyone can write into `fieldnotes` without joining the `fieldnotes` membrane
and therefore without promising anything. That is Invariant 2 working rather
than a hole to plug: membership is voluntary, and `promiseCompliance` reports on
members. **The ask therefore depends on people joining, and §1 asks them to.**

**What this does NOT do, stated here so §1 is not oversold**: it does not bind
anyone who never joined, it cannot be enforced against a pseudonymous key, and
some protections cannot be signed away at all. The third parties are 4.6's and
3.9's problem, both filed and neither built.

## 4. What this file is not

It is not a launch announcement, and step 4 is explicit that this is ten
people rather than ten thousand. It is also not a substitute for
`INSTALL.md`, which carries the install path, the four things to know, and
the troubleshooting — all re-verified on 2026-10-26, including two
corrections that would otherwise have told an invitee their conductor had
failed when it had not.

**The one obligation this file exists to discharge** is 7.1's: that the
permanence disclosure reaches every invitee *before* they write. If the
message in §1 is sent after someone has already published, that obligation
has not been met, and under Invariant 6 there is no way to go back and meet
it.
