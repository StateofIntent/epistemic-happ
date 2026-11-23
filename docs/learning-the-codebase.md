# Learning this codebase: a guided path

**Written 2026-11-22. Revised the same day to add the theory and application
strands.**

This repository is unusual in that **the hard part is not the code.** It is
~85,000 tracked lines, but the protocol itself is **two Rust files**, and every
non-obvious decision in them already carries a comment explaining why it was
taken. What those comments never explain is what
`ExternResult<ValidateCallbackResult>` *is*, or what the three pieces of
punctuation in `match op.flattened::<EntryTypes, LinkTypes>()?` do.

And the code is only one of four things you need in order to answer a question
about this system without reaching for a document:

1. **The notation** — Rust and TypeScript as they appear here.
2. **The substrate** — what Holochain actually stores and refuses.
3. **The theory** — Promise Theory, the biological borrowings, the HRR maths,
   the Ricardian question, and what this protocol refuses from Friston and Levin.
4. **The applications** — what Luck Light and Kupukupu did to the design when
   real people met it.

**The organising principle of this curriculum: never learn one of those alone.**
Every theory lesson names the lines that implement it and the case where
somebody tested it. That is the difference between *having read about Promise
Theory* and *being able to say why Invariant 6 is defensible and Invariant 9 is
not, and point at the function.*

---

## What you actually own

Measured 2026-11-22 from `git ls-files`, so these are tracked lines.

| Layer | Where | Lines | What it is |
|---|---|---|---|
| **Integrity zome** | `dna/integrity/src/lib.rs` | **3,996** | The refusal layer. 19 entry types, the link types, every rule the network enforces. **This file IS the network** — its hash is the DNA hash. |
| **Coordinator zome** | `dna/coordinator/src/lib.rs` | **9,759** | The API. **98** callable functions. Hot-swappable: changing it does *not* fork the network. |
| **UI** | `mobile-ui/src/main.ts` + `notes-ui.ts`, `applet.ts` | ~11,400 | The app. |
| **Verification harness** | `scripts/live-verify/*.mjs` | **34,795** | **76** scripts that run a real conductor and prove claims about it. |
| **Satellites** | `agent-sdk/`, `bridge/`, `mcp-server/`, `notes/`, `gateway/`, `federation/` | ~6,000 | Everything that talks to the zomes from outside. |

**You do not have to learn 85,000 lines. You have to learn one 4,000-line file
properly**, and the rest becomes readable by analogy.

---

## The method: read → predict → change → verify

Not lectures. Each lesson works the same way:

1. **Read** real lines from this repo. Never a toy example — the toy is where
   the understanding fails to transfer.
2. **Predict** what a change will do, *out loud, before running it.*
3. **Change** it in a scratch copy and run it.
4. **Verify** — was the prediction right? A wrong prediction is the lesson.

**Why prediction-first is non-negotiable here:** this repository's entire
epistemics is that a check which cannot fail has proven nothing. Reading code
and *feeling* you understood it is exactly the vacuous green it refuses
everywhere else.

**The feedback loop is 12 seconds.** Measured 2026-11-22:
`cd dna/integrity && cargo check --target wasm32-unknown-unknown`, warm cache.
That is fast enough that **`rustc`, not this document, is the teacher.**
`cargo check` type-checks without producing a binary, which is all you need.

**Toolchain, confirmed present 2026-11-22:** `cargo 1.98.0`, `rustc`,
`wasm32-unknown-unknown`, `node v26.8.1`, and `hc` / `holochain` /
`kitsune2-bootstrap-srv` in `~/.cargo/bin` (**not on `PATH` by default** — which
is why `scripts/sandbox.sh` passes `-H` instead of mutating it). Nothing needs
installing.

---

# PART I — THE NOTATION

Rust *as it appears in this repository*, and nothing more. No lifetimes
tutorial, no async, no trait objects — this codebase barely uses them.

### L1. An entry is a struct, and a struct is a shape for bytes
`pub`, `struct`, `name: Type`. The types you will meet: `String`, `u64`,
`Vec<T>`, `Option<T>`, `AgentPubKey`, `EntryHash`. **`Option<T>` is the big
one** — Rust has no null. Attribute macros (`#[hdk_entry_helper]`) and derive
macros (`#[derive(Clone, PartialEq)]`): code that writes code at compile time,
proven by your own E0119 comment above `Mew`.
*Read:* `dna/integrity/src/lib.rs`, the `Mew`, `Claim` and `Retraction` structs.
*Exercise (set, answer held):* remove the `Option<>` from `Claim.source_mew`,
predict error count and locations, then run.

### L2. Functions, `Result`, and the `?` operator
Why nearly everything returns `ExternResult<Something>`, what `?` does, how a
failure travels. *Read:* `validate_protocol_version()` — 20 lines using every
piece.

### L3. `enum` and `match` — the shape of every decision here
A Rust `enum` is not a C enum: variants carry data. `match` is **exhaustive**,
which is why the dispatcher is safe. *Read:* `ConfidenceLevel`, `CritiqueMode`,
`Stance`, `SettlementState`, `settle()`, and the `validate()` dispatcher.

### L4. Ownership and borrowing — `&`
Why `settle(policy: &SettlementPolicy, …)` takes a reference. The one idea with
no equivalent in a 2016 intro course. Expect two passes; that is normal.

---

# PART II — THE SUBSTRATE

### L5. What Holochain actually stores
Source chain vs DHT. **Action vs Entry** — and therefore why `ActionHash` and
`EntryHash` are different types the compiler will not let you mix. What *"the
DNA hash is computed over the integrity zome"* means mechanically, and why it
makes `PROTOCOL_VERSION = 11` a **declaration, not a negotiation**: a network
runs exactly one version by construction, so there is nothing to be compatible
*with*. *Read:* the `PROTOCOL_VERSION` header.

### L6. The integrity zome is the refusal layer
`validate(op)`, `Op` → `FlatOp`, the dispatch, `ValidateCallbackResult`. Then
`validate_claim` line by line, then `validate_critique`. **The payoff:** after
this you can answer *"what can this network refuse, and where is the line that
refuses it"* unaided.
*The lesson inside the lesson:* the version gate sits on the two ops that write
protocol data and **deliberately not on the whole callback** — a blanket refusal
made `authorizeSigningCredentials` fail, so a misdeclaring network became one
nothing could even ask. **Refuse the protocol, not the ability to be
questioned.**

### L7. Links and anchors — how anything is found at all
A DHT has no queries. Everything findable is findable because a link was written
to a known hash. `LinkTypes`, the `*_anchor_hash` helpers, and
`validate_create_link` — the largest function in the repo.

---

# PART III — THE THEORY, EACH BOUND TO ITS CODE

### L8. Promise Theory (Burgess) — the spine
**The most load-bearing theory in the project**, and the one you will be asked
about most by Holochain people.

- **Autonomy**: no agent can make a promise on another's behalf. Everything else
  follows.
- **Observer-local assessment**: a promise's effect exists only in the assessment
  of an observer — which is *why* Invariant 1 forbids a canonical score.
- **Subjective trust**: interpretation of promise-keeping history stays local.

**The thing to know cold, because it is the sharpest claim in your SPEC:**
**Invariants 1, 2, 4, 5 and 8 are DERIVATIONS from Promise Theory. Invariants 6
and 9 are IMPORTS** — 6 from an immutable-ledger ethic and the substrate's
refusal of delete ops, 9 from autopoiesis. **So Promise Theory cannot adjudicate
between 6 and 9, because it speaks to neither**, and the long-standing "6 and 9
are in tension by construction" claim was wrong for that reason.

**And the detail that shows you have actually read it:** *"Nothing is deleted"*
has two readings. Read as *"no agent may erase another's record of what was
promised"* it is close to **required** by autonomy. Read as *"a promiser may not
withdraw their own promise"* it **violates** autonomy outright. `Retraction` is
what makes the first reading the operative one — the author withdraws while
every observer's record stays intact.

*Code:* `Constitution`, `Promise`, `Condition` structs; `ConductancePolicy` and
`AttestationPolicy` as **caller-supplied, never protocol defaults** — supplying
one states *the caller's own* policy. *And the live tension:* a reader who
supplies no `half_life_secs` still gets 30 days **with no promiser behind it**.
Half that complaint survives and is recorded, not closed.

### L9. The biological borrowings — and the one that is absent
Measured 2026-11-22: this protocol borrows from **immunology** (`Membrane`,
`AntibodyPattern`), **neurology** (`SynapticLink`, conductance; the README calls
the whole thing an *"epistemic nervous system"*), **ecology**
(`CritiqueSpecies`, secretion), and **autopoiesis** (Maturana & Varela,
`metabolic_tick`). It borrows **nothing** from developmental biology —
`morphogen`, `attractor`, `setpoint`, `homeostat`, `niche`, `organism` and
`tissue` occur **zero times**.

**Know the distinction `AntibodyPattern` exists to protect:** a `Critique`
adjudicates *content* (is it true, well-reasoned, well-evidenced); an
`AntibodyPattern` flags a *structural or behavioural* pattern — spam, a sybil
ring, plagiarism — **independent of whether the content is right.** Conflating
them would mean disagreeing with a claim became an accusation of bad faith. And
it **cannot target an `AgentPubKey`**, only an entry, because an antibody naming
an agent would be the comparative reputation mark Invariant 1 rules out.

**Autopoiesis, and the line you must be able to draw:** `docs/fixed-core.md`
rule 4 (**ENFORCED**) carries *"a nervous system is allowed and a homunculus is
not."* In Maturana & Varela the nervous system is **operationally closed** — so
plasticity yes, central controller no. Rule 5 (**WRITTEN ONLY**) states the
reflex condition. **The DNA is ACTIVE, not autopoietic**: `metabolic_tick`
exists and recurs on a 60s floor, but item 22 decided **no autonomous write**,
and `scripts/live-verify/metabolism.mjs` asserts the tick's chain does not grow
— watched failing. *A decision that cannot drift into its opposite.*

*Read:* `docs/positional-information-and-what-this-protocol-borrows.md`.

### L10. The physics and the maths — HRR, and worldlines
**HRR = Holographic Reduced Representations**, Plate (1995) — a Vector Symbolic
Architecture. `HRR_DIM = 512`, `f32` per component, 2048 bytes. Four operations:
`hrr_bind` (circular convolution), `hrr_unbind` (circular correlation via
involution), `hrr_superpose` (normalised sum), `hrr_cosine_similarity`. Symbol
vectors come from SHA-256 → splitmix64, so the same string always gives the same
vector, with empirically < 0.3 cosine similarity between unrelated strings.

**The sentence that matters more than the maths:** both HRR mechanisms are
**reading lenses only** — approximate, local, recomputed on demand, **never a
second source of truth.** Every value returned carries the real hash it was
computed from, and the exact answer is always the direct DHT read. The
neighborhood binding is **never written to the DHT at all.** `NeighborRecall`
always echoes the candidate hash its score is about, because *"a bare similarity
number with nothing to check it against would be a protocol violation, not a
convenience shortcut."*

**Worldline** is the relativity borrowing (41 uses in SPEC, 87 in README): an
agent's own path through their own chain, periodised. *Code:*
`WorldlineTrace`, `PeriodBoundary`, `query_worldline_resonance`,
`build_neighborhood_binding`.

**Also in this lesson, the physics from the positional-information brief:** a
field carries positional information only where it varies; resolution and extent
decouple **only** for locally regenerated fields. That is the physical analogue
of why settlement is recomputed by each reader rather than broadcast.

### L11. Mattereum, Grigg, and the Ricardian question
**A Ricardian contract** — Ian Grigg, 1996, for the Ricardo payment system,
named after David Ricardo — is simultaneously human-readable,
machine-executable, and **mutually enforceable between both parties.**
Mattereum's contribution is the application to physical assets.

**Your bridge is NOT one, and knowing exactly why is the lesson.**
`bridge/src/index.ts` says it in the file that implements the pattern: there is
no assent from Twitter, no legal enforceability, no obligation on their part. A
two-way Ricardian contract would be **an imposition described as an agreement**
— which is also a Promise Theory violation, so L8 and L11 meet here. What it is
instead: a **unilateral Ricardian instrument**, called a **correlative witness**
— a durable one-sided record that a DHT entry and an external post co-occurred.

**And carry the attribution history, because it is a live lesson:** an earlier
version credited the Ricardian contract to Vinay Gupta. The concept is
**Grigg's**; the physical-asset application is **Mattereum's**. The fix landed in
#527 — and five copies survived it, four of them in **already-sent letters**,
which produced the rule *a sent record is evidence, not prose.*

### L12. Friston, Levin, and what this protocol refuses
The FEP account — nested Markov blankets, higher scales sending down
precision-weighted predictions — is **structurally what rule 4 refuses**, and
you should be able to state both the objection and the fair counter.

- **The carrier budget:** FEP is a description language, not a carrier. A
  descending precision signal must be a morphogen gradient or a bioelectric
  pattern, because those are the only two fields whose resolution and extent
  decouple.
- **Select, not author:** a uniform perturbation to a system with discrete
  attractors shifts which attractor you land in; it cannot author a new one.
  Levin's planaria result reads as **attractor selection**.
- **Levin's interfaces:** *"what you make are interfaces"* — and the constraint
  he does not state is that **you cannot install a new interface into a system
  already running one.**
- **The fair counter you must give first:** nested Markov blankets are **not** a
  homunculus; every level minimises its own free energy and "top-down" names a
  coupling, not a command.

*Read:* `docs/positional-information-and-what-this-protocol-borrows.md`, whose
own §8 marks which of its claims are argument rather than measurement.

---

# PART IV — THE APPLICATIONS

**This is where theory stops being decoration.** In both cases a real person met
the design and changed it.

### L13. Luck Light — the superior-egg network
`docs/cases/luck-light-egg.md` (720 lines) maps his grant-based economy —
backed by a **superior egg** defined by a nutrient profile, with a *cyber egg* as
a future egg, ten units, immutably pegged — onto what is actually shipped. Four
replies follow it, each marked SENT or unsent with the date and who confirmed.

**What to take from it:**
- **The three limits in the last section are the part that must survive
  editing** — *"they are what makes the rest trustworthy."* That is the house
  style for outbound claims.
- **A caveat is not a defence against a number.** A correction written
  specifically to withdraw a figure still said *"a minute"*, and he read back
  *"1 minute to confident settlement, good to know"* — and repeated it where
  Holochain people read. **Specificity wins over hedging.** The fix is a range
  and two outcomes with no single figure to lift out.
- **The file is a RECORD, not a queue.** Every draft in it is sent. Do not
  resend.

### L14. Kupukupu — the pilot's first publisher, and a non-technical one
Kupukupu is the case that keeps producing rows, and the reason is that **they
are not a developer** — which is precisely the user this protocol must survive.

- **Seven points in one message** opened or settled rows 6.16, 6.17, 6.19, 6.21,
  6.22 and 6.23. **A fixed dropdown would have squeezed out exactly the report
  that opened a new row** — which is why the free-text note field is the thing
  that improves the form.
- **Asked how they return to a domain somebody gave them:** *"I go to Worldline,
  then my records, copy the domain name and paste it in again."* That is the
  `` `${start_time} · ${domain_tag}` `` line at `mobile-ui/src/main.ts:3753` —
  a `WorldlineBoundary.domain_tag` on **their own trace**, not `Claim.domain` on
  anybody's claim. **The user found a route the design did not know it had.**
- **They answered a `[D]` the project could not settle itself:** *"requiring
  founding to be findable seems fine"* — from the person who would pay the cost.
- **And they closed 6.21 with one observation:** *"The app offered the update,
  however it still didnt update or install. Had to go through the github."* The
  updater polled, found the version, **offered** it, and the install did not
  happen — which is what sent the investigation to macOS code signing.

**The general lesson, and it is the strongest argument for the pilot existing:**
every one of those findings was invisible from inside the repository.

---

# PART V — EXPLAINING IT

### L15. The three versions
Build and rehearse the **thirty-second**, **three-minute** and **thirty-minute**
explanations. Different audiences, same substance, no claim in the short one
that the long one would have to withdraw. **Anchor each on Invariant 10** —
*the system doesn't compute truth, it creates conditions for truth to
resonate* — because every other design decision is downstream of it.

### L16. Answer the follow-up
Take a claim from your own README, unaided, and trace it to the line that makes
it true. Then do one you are **not** sure about. **This is the lesson that closes
the real-world gap**: going one level deeper than the statement you just made,
in public, on demand.

**Two house disciplines to have ready**, because they are what distinguish this
project and they are stated in `SPEC.md` §7b (adopted from Veritas, Project 89,
and deliberately **not** numbered among the invariants, because nothing in
validation can enforce them):

- **Grounded or silent — and counted.** Anything that cannot cite what it rests
  on is dropped, *and the drop is counted.* **The counted half is load-bearing**:
  a silent drop is indistinguishable from an empty input.
- **Every read declares the mode it ran in.** A computation with a fallback, a
  cap or a tie-break reports which it used, **in the same structure as its
  answer** — so a harness can compare them rather than trusting either. *"A
  declaration nothing checks is a comment."* This repo was bitten three times
  before making it a rule.

---

## Progress

A lesson is **done** when the prediction was made *before* running and the
result was checked — not when it was read.

| # | Lesson | Status | Date |
|---|---|---|---|
| L1 | entries & structs | **in progress** — exercise set, answer held | 2026-11-22 |
| L2 | `Result` and `?` | not started | |
| L3 | `enum` and `match` | not started | |
| L4 | ownership | not started | |
| L5 | what Holochain stores | not started | |
| L6 | the refusal layer | not started | |
| L7 | links & anchors | not started | |
| L8 | Promise Theory | not started | |
| L9 | biological borrowings | not started | |
| L10 | HRR, worldlines, physics | not started | |
| L11 | Mattereum & Grigg | not started | |
| L12 | Friston & Levin | not started | |
| L13 | Luck Light | not started | |
| L14 | Kupukupu | not started | |
| L15 | the three versions | not started | |
| L16 | answer the follow-up | not started | |

---

## Two standing rules for these sessions

1. **Scratch experiments never get committed.** Lessons modify code to see what
   breaks. `git diff` before you finish, and `git checkout --` the scratch.
2. **Do not bump `PROTOCOL_VERSION` during a lesson.** Editing
   `dna/integrity/src/lib.rs` forks the network *when packed and released*;
   while learning you are compiling, not shipping. The two are distinguished by
   `hc dna pack`, not by the edit.
