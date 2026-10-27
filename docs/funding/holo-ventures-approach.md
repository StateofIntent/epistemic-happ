# Holo Ventures — the approach, and why services comes first

**Written 2026-10-27 (open-work 7.21).** This file exists for the same reason
`docs/cases/luck-light-egg.md` does: an outward-facing send is an obligation,
and an obligation nobody wrote down is one nobody tracks. It records what was
sent, to whom, on what reasoning, and what the honest disclosures were — so a
reply can be answered against the record rather than against memory.

**One convention first: the signature is a placeholder.** This repository is
public and its author appears in it as a handle. The draft below ends with
`<name>` deliberately; fill it in the mail client, not here.

---

## 1. Who they are, verified rather than assumed

Read from `holoventures.io` on 2026-10-27:

- **A venture studio, not a cheque-writing VC.** They build commercial software
  and services on Holochain, and their engagement model is four phases:
  strategic advisory and discovery → architecture design → proof of concept →
  production build and deployment.
- **Six capability areas**, of which three matter here: architecture
  assessment, infrastructure guidance, and **venture support for early-stage
  Holochain projects** ("early-stage Holochain projects can also apply to the
  studio").
- **Stated priorities**: always-on distributed hosting; peer-to-peer accounting
  and payment systems; **privacy-first collaboration tools**; building *"decent
  infrastructure resistant to value capture."*
- **Contact**: the site's *Talk to us* call-to-action is a `mailto:` link to
  **hello@holoventures.io** — there is no form to fill and no stated list of
  required materials. They claim they *"read everything and respond to every
  serious enquiry, usually within two business days."*
- They ask that an enquiry say which door it is for: professional services,
  running an Edge Node, applying to the studio, or something else.

## 2. Why the ask is SERVICES first and the project second

**The constraint is income by roughly the end of 2026, not a valuation.** Those
want different letters. A studio application is judged on users and a
commercial model; a services enquiry is judged on scarce skill, and converts in
weeks rather than quarters.

**Three assets, and they mature on different clocks.**

| asset | fundable when | why |
|---|---|---|
| **Holochain 0.7 / kitsune2 expertise** | **now, and it decays** | 0.7 is new, few have migrated, and most of what this project knows was MEASURED rather than read. Scarcity is highest today |
| **A named commercial use case** | weeks | Luck Light's egg franchise — four exchanges deep, real certifications and deliveries, and he offered to design simulations. *"Who wants this?"* answers far better with a named producer than with four friends |
| **The protocol itself** | months, and only with reports | four to six users with real `fieldnotes` reports is a different conversation from four to six users planned |

**Where the thesis genuinely matches**: *privacy-first collaboration tools*, and
*resistant to value capture* — which is not a slogan here but Invariant 1:
there is no canonical comparative score, so there is nothing to rank and no
attention surface to monetise. **The strongest version of that claim is that it
binds the author too**: a working mutual-credit ledger was built, verified and
**deleted** because `get_credit_balance` was a canonical per-agent scalar
(item 3.4).

**Where it does not match, and the letter says so**: peer-to-peer accounting
and payments is precisely what was removed.

**And one inversion worth naming**: 7.14 — this project's peer discovery
depends on a third party's dev/test bootstrap — is their hosting business seen
from the other side.

## 3. The disclosures, which lead rather than hide

This project's whole credibility is that its documents say what the code does,
so the letter states the hard parts before being asked. Each is one line, each
is already recorded here, and each has a row:

- **No users yet.** The first cohort is four to six invited people (7.13), not
  started as of writing.
- **Storage economics are currently a blockchain's.** 48 of 48 arcs measured
  full at 48 members, because `kitsune2_gossip`'s narrowing path is behind a
  cargo feature that is OFF — §12 of the egg case, and the measurement predates
  the question being asked.
- **Erasure is structurally impossible**, by design (Invariant 6) — *and the
  prepared answer exists*, which is exactly what 7.16 predicted a funder would
  need: `docs/erasure-and-the-content-split.md`,
  `docs/privacy-impact-assessment.md`, and 4.6 as the design that would answer
  it.
- **No outside audit** (7.2), with scope now decided: the two zomes, after the
  pilot.
- **One developer, AI-assisted**, and the commit history shows it.

## 4. The letter, as drafted

> **Subject:** Holochain 0.7 engineer available for services — and an
> early-stage project
>
> Hi,
>
> I'm an independent developer in Australia. The design of this protocol
> predates its code by years — I started on it around 2018, and its invariants
> come out of Mark Burgess's Promise Theory, with the binding layer influenced
> by Vinay Gupta's Ricardian contracts. The implementation is a month old:
> Holochain, `protocol_version: 11`, built daily against real conductors. I'm
> writing about two things — professional services first, because that's the
> more immediately useful one for you.
>
> **Services.** I'd like to be considered for paid work, either inside the
> studio or as a contractor on client engagements. What I bring is measured
> rather than read:
>
> - `kitsune2`'s arc-narrowing path sits behind a cargo feature that is **off**,
>   so storage does not shard at any N — I measured 48 of 48 arcs still full at
>   48 members.
> - A reproducible asymmetry where a returning peer behaves far worse than a
>   stranger: a fresh node received full history in ~15s while a returning one
>   still had nothing at 905s.
> - Cross-internet crossings verified between two households on different ISPs,
>   and through CGNAT via the relay.
> - An HDK 0.7 documentation error that silently breaks every remote signal
>   delivery, and a `libsodium-wrappers` 0.7.16 ESM break that kills any fresh
>   install of a pure-ESM Holochain client.
>
> I run a CI suite that drives twenty harness steps against a live DHT on every
> push, including browser harnesses against a real conductor.
>
> **The project.** The Epistemic Resonance Protocol — publishing claims and
> critiquing each other's, where disagreement is the point rather than a failure
> mode. `protocol_version: 11`, packaged desktop release, two installed copies
> have exchanged claims in both directions across two households. It fits two of
> your stated priorities: privacy-first by construction, and structurally
> resistant to value capture — its first invariant forbids any canonical
> comparative score, so there is nothing to rank and no attention surface to
> monetise. I enforce that against myself: I built a working mutual-credit
> ledger, verified it, and deleted it because one of its reads returned a
> per-agent scalar.
>
> The hard parts, since you'd find them anyway: no users yet — the first cohort
> is four to six invited people, starting this week. Storage economics are
> currently a blockchain's, as above. Erasure is structurally impossible by
> design; I've written the analysis, a privacy impact assessment, and the design
> that would answer it, and I'm happy to send all three. No outside audit yet.
> Peer discovery still depends on Holochain's own dev/test bootstrap.
>
> Happy to start with an architecture assessment, a short paid pilot, or a call.
>
> Repository: github.com/StateofIntent/epistemic-happ
> Worth reading first: `SECURITY.md` and `docs/erasure-and-the-content-split.md`
>
> Thanks,
> `<name>`

**WHY THE OPENING NAMES 2018, AND IT IS NOT CV-PADDING.** An outsider opening
a month-old repository that contains a 1,400-line specification, ten derived
invariants and a Promise Theory lineage will reasonably wonder how that was
written in a month. *Eight years of design, recently implemented* is the honest
answer, and without it the natural assumption is that the depth was generated
rather than earned. The first draft of this letter said *"I've spent the last
month building a Holochain hApp"*, which was true about the code and badly
wrong about the project.

**Why it is short.** An inbox is less forgiving than a form, and the evidence
is linked rather than attached — a 15,000-line README as a PDF is worse than a
URL. Two documents are named rather than twelve, because the restraint is
itself a signal.

## 5. What a reply lands on

- **A services conversation** → scope it against §2's first row, and keep the
  pilot running in parallel: it costs nothing and improves the second
  conversation.
- **A studio question about users** → the pilot write-up, which is a day's work
  on top of evidence the pilot generates by itself (the `fieldnotes` domain's
  own content).
- **The erasure question** → send the three documents named in §3. That
  question is the one 7.16 told this project to prepare for, and the answer is
  on file rather than improvised.
- **Silence past a week** → one short follow-up, then the other doors in 7.21.

**Anything that arrives gets recorded here as §6**, the way the egg case
records each round, so the next decision is made against what was actually
said.
