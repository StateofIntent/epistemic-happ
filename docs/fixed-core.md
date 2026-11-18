# The fixed core — what a self-maintaining system may never change

**Written 2026-11-18, before the system it binds exists.** That is deliberate
and it is the only reason this document is cheap. README §4.4 makes the same
argument about client rules — *"far cheaper to state now than to retrofit once
an interface exists"* — and the rules below are the same shape one layer down:
written for whoever builds the self-maintaining layer, including an AI asked to
generate or evolve one.

**What this is not.** It is not the protocol invariants (Appendix A), which bind
what the DHT will accept. It is not `docs/integrity-bump-plan.md`, which binds
when a fork may happen. **This binds a system that converges its own machines
and proposes changes to its own code** — rows 7.31 (CFEngine-style
convergence), 5.5 (policy-as-claim), 1.36 (structured observations) — and
nothing in it is reachable from the happ.

---

## 0. READ THIS FIRST: almost none of this is enforced yet

**A document describing limits is not a mechanism enforcing them, and this
repository has been bitten by that distinction often enough to put it at the
top.** `ai-inhabitant-hooks-built-caller-absent` names the recurring shape: a
thing fully built, correct, and reachable from nowhere. A fixed core that lives
only in prose is that shape pointed at safety.

**So every rule below carries a status, and the statuses are honest:**

| | meaning |
|---|---|
| **ENFORCED** | a mechanism refuses the violation today, and something would go red |
| **STRUCTURAL** | not enforced by a check, but the architecture makes violating it expensive or visible |
| **WRITTEN ONLY** | a promise on paper. Nothing stops it being broken |

**The state as of 2026-11-18, with the rules named so a miscount is visible
rather than hidden:**

- **ENFORCED — rules 4 and 6** (and 6's enforcement lives outside this repo)
- **STRUCTURAL — rules 3, 7 and 8**
- **WRITTEN ONLY — rules 1, 2 and 5**

**Two, three and three.** The first draft of this list said *one, three, four*,
which was wrong on the day it was written — so the buckets name their rules
now, because a total nobody can check is the shape this repository spent
2026-11-18 removing from four other documents.

That state is fine *because the system these bind does not exist yet*. It stops
being fine the day row 7.31 is built. **A rule still WRITTEN ONLY when the
converging layer ships is a rule that layer can break on its first run** — and
rules 1, 2 and 5 are the three that layer touches first.

### Where a fixed core can actually live

**This project already has exactly one genuine fixed core, and its enforcement
is not a check — it is a fork.** The integrity zome defines what the DHT
accepts; the coordinator zome can be updated in place. Changing the integrity
zome changes the DNA hash, which changes the network, which strands everyone who
does not relaunch (`docs/integrity-bump-plan.md`; Invariant #6 makes it
permanent). **That is why all five autopoiesis stages shipped coordinator-only
and nothing forked.**

So the pattern to copy is not *write the rule down where the system can read
it*. It is **put the rule where changing it costs a relaunch.** Three places
qualify, in descending order of strength:

1. **The integrity zome** — changing it forks the network. Strongest, and the
   only one already in use.
2. **The signed release artifact** — a host runs a build whose hash it can
   check; changing the rules means shipping a new build, which is at least
   visible. (Note the limit measured on 2026-11-18: the macOS bundle carries no
   signature at all, so hash-checking a release is not currently possible on
   that platform.)
3. **Outside the machine entirely** — a host's own published promise, which the
   converging process has no write access to. This is where most of the rules
   below belong, and none of them are there yet.

**What does NOT qualify: a file on the managed machine, a policy the converging
agent can edit, or a constant in the coordinator zome.** All three are inside
what the system rewrites.

---

## 1. Consent, and revocation is not a proposal — **WRITTEN ONLY**

The system runs on a machine only while that machine's owner says it may, and
**withdrawal takes effect without being evaluated.** A host removing consent is
not making a claim to be critiqued, not opening a settlement, and not supplying
a signal to be weighed. It is an off switch.

**Why this one is first:** every other rule here assumes a host who can leave.
A system that reasons about whether a withdrawal is justified has already made
itself the judge of its own substrate.

**What would make it STRUCTURAL:** consent expressed as a host-published
promise the converging process cannot write, so its absence is the default and
its presence is a positive act. **Today there is no consent record at all** —
the one always-on node is on the author's own machine, so the question has
never been posed. Luck Light's second-node offer (§4 of the drafts, unanswered
since 2026-11-10) is the event that makes it real.

## 2. The stop mechanism sits outside write access — **WRITTEN ONLY**

There must be a way to halt the system that the system cannot modify, disable,
delay, or argue with. **And boundary defence must never treat a host or the
stop mechanism as an intruder.** The system defends against attackers; it never
defends against the people who agreed to run it.

**This is the rule whose violation is the dangerous version of the whole
project**, however good the purpose it is pursuing. A system whose
self-defence could resist shutdown is not a self-maintaining tool.

**AND THE PRESSURE TO BREAK IT WILL ARRIVE AS BEST PRACTICE, not as
temptation.** MAPE-K — the standard reference architecture for exactly this
kind of system, see rule 4 — lists **self-protection without human
intervention** among the properties an autonomic system is supposed to have.
So the literature will tell you this rule is a missing feature. It is not.

**Today: there is no stop mechanism, because there is nothing running that
needs stopping** — `systemctl --user stop epistemic-pilot-node` is the whole of
it, and it works because no converging process is trying to restart it.
**CFEngine-style convergence would break exactly that**, since restarting what
stopped is what it is for. So this rule has to be built *with* 7.31, not after:
the enumerated reflex set (rule 5) must exclude the stop.

## 3. A proposal is never self-applied — **STRUCTURAL**

An automated agent may **propose** a change. It may not **apply** one. The
approval step requires a named human or a settlement among named agents, and
the proposing agent is not among them for its own proposal.

**Why this is STRUCTURAL rather than WRITTEN ONLY:** the repository is already
built this way, and not by accident. The AI inhabitant hooks exist and *the
caller is deliberately absent*; the persistent agent at `~/.epi-agent` declares
itself an automated key answered for by a named person; and row 7.29 refused a
one-line change precisely because it would have put a declared instrument into
the pilot DHT as a side effect of a logistics fix. **The pattern is established
by three separate decisions, which is stronger than a sentence.**

**What it is not: enforced.** Nothing would stop a future agent applying its own
proposal. The protection today is that no such agent has a caller.

## 4. Every threshold has an owner, and every owner can say `None` — **ENFORCED**

**This is the only rule enforced by the PROTOCOL** — rule 6 is enforced too, but
by one operator's script on one machine — and it is the answer to the question
that opened this document rather than a constraint on it.

A threshold that turns a signal into a decision **is itself a promise and needs
an agent behind it.** That argument retired `CONDUCTANCE_HALF_LIFE_SECS` as a
universal constant (row 3.1, decided 2026-10-24). What replaced it is
`StandingPolicy::max_causal_distance`, **supplied by the caller**, where `None`
means *no atrophy* rather than a default — so a reader who promises nothing has
nothing imposed. `AttestationPolicy` has the same shape: omit it and nothing
changes from before it existed.

**Transposed to a self-maintaining layer: the HOST promises the threshold for
how its own machine behaves.** Not the protocol, not the fleet, not a constant
in a shared policy file. And absent policy means **no automated action**, never
a built-in default.

**What this forbids, concretely:** a system-wide *signals fade unless
reinforced* layer, or any fleet-wide level at which a signal becomes an action.
Time passes whether or not anybody promised a rate. Per-link conductance
already decays and may be read; what may not exist is a shipped number that
turns that reading into a decision on somebody's behalf.

**AND WHAT IT DOES NOT FORBID, because the first draft of this section
overstated it and was corrected the same day.** It is tempting to summarise
this rule as *no nervous system*, and that is false — **a human has one and is
autopoietic.** In Maturana and Varela the nervous system is **operationally
closed and non-representational**, a system *without inputs and outputs towards
the external world*: it does not pick up information from an environment, it
maintains correlations between its own sensory and motor surfaces. Closure is
not something the nervous system escapes, it is another instance of it — Varela
generalised closure beyond cells to nervous, immune and social systems.

**So a nervous system is allowed and a homunculus is not**, and the test is
usable rather than philosophical:

| proposed layer | shape |
|---|---|
| signals fade, and at threshold X the system acts | representation + command → **controller** |
| per-host threshold, neutral off, each node coupling its own sensing to its own acting | closed → **nervous-system-shaped** |

**Plasticity is also allowed and already exists.** Structural coupling —
structure changing with the history of interactions — is exactly per-link
conductance changing with reinforcement. **What 3.1 retired was a UNIVERSAL
RATE: plasticity yes, universal clock no.**

**AND THE STANDARD ARCHITECTURE FOR THIS FAILS THIS RULE AND RULE 2 BY
CONSTRUCTION, WHICH IS WORTH KNOWING BEFORE READING ANY OF THE LITERATURE.**
What rows 7.31 and 5.5 describe has a canonical name — **MAPE-K**
(Monitor-Analyse-Plan-Execute over a shared Knowledge base), from IBM's
autonomic computing initiative, the reference model for self-adaptive systems.
It is an **external feedback-control approach with an *autonomic manager*
distinct from the *managed element*** — the homunculus, architecturally. And
its canonical self-\* properties are specified as *without human
intervention*, **including self-protection as "the ability to defend itself
against misuse without human intervention."** That is **rule 2's dangerous
version, in the reference architecture, as a stated goal.** Borrow MAPE-K's
vocabulary if useful; do not borrow its topology or its autonomy targets.

## 5. A reflex acts only on its own substrate, from an enumerated set — **WRITTEN ONLY**

Fast local action with no deliberation is allowed — that is what convergence
*is* — under two limits:

- **Own substrate only.** A node repairs itself. It does not act on another
  node, another host's machine, or the network.
- **From a fixed, enumerated list** that lives where rule 0 says a core must
  live. Restart a service, restore a config file, reinstall a known version,
  free disk. **Anything not on the list is a proposal, not a reflex.**

**And the list must exclude the stop mechanism** (rule 2), or convergence will
restart what a host halted and call it repair.

**This is also where the two speeds separate honestly:** reflexes are local and
unreviewed because they are a host keeping a promise about its own machine, and
**that needs no collective threshold at all** — nothing crosses the network, so
rule 4 has nothing to bite on. Anything structural goes the slow way, through
claim, critique and settlement, **which is agreement rather than aggregation**
and so also raises no threshold to own. The unpromised-constant problem appears
only when a *level* is made to stand in for *agreement*.

## 6. The archive publishes nothing — **ENFORCED (and it rules out the obvious design)**

`~/.epi-pilot-node/verify.mjs` dumps the node's own chain and asserts
`0 App entries` on every run, printing `VIOLATED` the moment anything calls a
zome function on it. Neither zome has an `init` callback, so enabling the app
writes no app entry **by construction rather than by restraint**.

**So the archive cannot report its own health into the network it archives.**
That would break the invariant it exists to demonstrate. Node-health
observations need a *different* key — which is row 7.29's refusal again, and
which is why row 5.5's *on which network?* is a blocker rather than a detail.

**Status caveat:** enforced by a script that lives at `~/.epi-pilot-node`,
**outside the repository and outside CI** — row 7.30's sub-`[D]`. So it is
enforced on one machine by one operator's copy. That is weaker than it reads.

## 7. Nothing writes at volume without a human, because nothing can be cleaned up — **STRUCTURAL**

**Invariant #6: no entry can be deleted.** A system that writes faster than a
person reviews therefore accumulates permanent junk that no participant can
remove. This is not a performance concern; it is the reason automated ingestion
is a decision (row 5.2) rather than an optimisation.

**The bar 5.2 records is specific and narrower than "be careful": an ingesting
agent is safe to switch on exactly when its rejects are counted.**
`"dropped 400 of 500, 380 for an unresolvable citation"` is a reading somebody
can dispute; the same run reporting 100 claims is indistinguishable from a quiet
day. SPEC §7b.1 forbids *a read that returns fewer things than it considered
without saying so.*

**STRUCTURAL because the only thing stopping volume today is that nothing
ingests.** The protection is absence, not refusal.

## 8. The core changes by relaunch, not by update — **STRUCTURAL**

Mirrors the rule the bump plan already enforces: **a bump is a RELAUNCH, not an
upgrade.** If a rule here can be changed by an in-place update, it was never
fixed. The friction is the feature — it means a change to the limits is an event
somebody notices and consents to, not a patch.

**STRUCTURAL today** because the integrity zome has this property and the rules
above do not live there yet. **Putting them there is the work**, and it is
behind §4's fork collision like everything else that touches integrity.

---

## What this document does not cover

- **Physical substrate.** Software cannot make chips or electricity. The
  realistic reading of *produces its own substrate* is that the system secures,
  maintains and pays for machines **with their owners' consent** — which is
  rules 1 and 2, not a manufacturing claim.
- **Purpose.** A boundary exists to protect something. None of the rules above
  say what the system is *for*, and a self-maintaining system with no function
  it serves for others ends up maintaining only its own survival. That is the
  version to avoid, and no constraint here prevents it.
- **Whether any of this should be built.** Rows 7.31 and 5.5 carry those
  decisions, both `[D]`, both the human's.

## The one-line version

**Every threshold has an owner, every owner can say `None`, and nothing that
repairs itself may touch the switch that stops it.**
