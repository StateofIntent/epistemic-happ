# Open work, in order

**Assembled 2026-10-22, after the day that closed the last hardware-blocked
row.** This is the single ordered list the repository did not have: `READINESS`
carries the release order and the engineering queue, `README` §9 carries the
detail, and the research questions were in neither. Three stale pointers were
found on 2026-10-22 alone — `READINESS`'s step 3, `README`'s *scale beyond four
nodes* cell, and the dangling item 9 → item 22 reference — each because a
dependency closed and the thing waiting on it was not re-read. **This file
exists to be the thing that gets re-read.**

**Every line carries what it is blocked on.** That is the only property that
makes rot detectable: a line whose blocker has gone is a line to act on, and a
line whose blocker cannot be stated was never a task.

**Who can do what**, used as a column below rather than repeated in prose:
**[M]** model, bounded; **[H]** needs the human's hands or machines;
**[D]** a decision only the human can take; **[X]** outward-facing or
third-party.

---

## 0. In flight right now

**NOTHING IS IN FLIGHT. Checkpoint 2026-10-25.** Fourteen pull requests
merged across 2026-10-24/25 and the desktop release was cut. If this entry is
the only thing open when you read it, that is the expected state.

~~**START HERE: `[M]` IS EMPTY.**~~ **IT WASN'T, AND THE WAY IT WASN'T IS THE
POINT.** Every *row* the model could take unblocked was indeed struck — 1.7,
1.8, 5.1, 7.9, 7.10, 7.11, 7.12 — and that is still true. But **the release
itself created bounded work that no row described**: four documents were left
telling readers that the published build was `v0.2.0` at `protocol_version: 9`,
which stopped being true the moment `v0.3.0` shipped. `INSTALL.md`'s top notice
— the first thing an invitee reads, and the file #344 was already sent to fix
once — was pointing at the superseded release; `README`'s installing section
said the published release matched this tree *"as of 2026-10-12"*;
`docs/integrity-bump-plan.md` §4 still listed the version gap as *"a live
inconsistency to resolve"*; and `docs/cases/luck-light-egg.md` told Luck Light
that a trial today runs two forks behind. Swept 2026-10-25.

**So the standing instruction is stronger than "check the list".** A closed
row is not a closed claim: the list tracks work, and the prose that quotes the
work's result rots silently because nothing gates it. After anything ships,
grep for the fact it falsified — here, `v0.2.0`, `protocol_version: 9` and
*"two forks behind"* — before concluding there is nothing bounded to do.
`READINESS.md` was swept on the day and is the model for what that looks like.

**THE ONE THING THAT MOVED FURTHEST: `v0.3.0` SHIPPED AT `protocol_version:
11`** (2026-10-24, tag pinned to `9372f558`, 15 assets, Latest). Until then an
invitee would have joined a network two forks behind the protocol this
repository describes, which made release step 4 fiction whatever else was
decided. **So 7.4 is now blocked on 1.4 alone** — its release half closed with
the release, its decision half with 7.1, and 7.3 never gated it. One Setup
click per profile and a second machine, both `[H]`.

**AND 7.1 IS DECIDED: vouch for honesty, not for safety.** The commitment is
that these documents say accurately what the protocol does and does not do —
explicitly not that it is adversary-resistant, which `SECURITY.md` contradicts
in writing. It obliges keeping them true, and #344 was the first payment:
`INSTALL.md` was telling the ten people about to be invited that cross-network
discovery was untested, three days after it was measured.

**THE DECISION THAT GATES THE MOST, and it is not on any row above:** whether
the integrity bump goes **before** inviting ten people, **after**, or **never**
— §4's own plan calls it the scheduling question nobody had asked. Four of five
candidates wait on answers outside this project and 4.5 can be written and
held, so "invite first, and tell them their data is disposable" is the standing
recommendation and has not been taken.

**Research opened rather than closed:** 3.7 states the sybil question once,
with its boundary written down — *the cheapest promise structure that makes
sybil cost high enough without creating a centre* — and fences off the version
that cannot be answered, since validation can no more observe a person than it
can read a clock. Candidate (1), attestation capacity, is already shipped.

**THE COLD-READ INSTRUCTION BELOW EARNED ITS KEEP ON THE FIRST TRY.** #333 was
found open because a required check had gone red — `ui`, `taxonomy-ui` §5 —
not because the queue had stalled. Check that first, every time. And note what
the red turned out to be worth: chasing it produced item 1.7 and overturned a
documented cause (see the contention entry below).

**Each of the five was branched before the one ahead of it landed**, so
`strict: true` left each `BEHIND` in turn and each was updated from `main`
rather than moving the rule. Five sequential ~20-minute cycles for five
documentation changes is the concrete cost of that rule, and it is the evidence
the `[D]` below is asking for.

Before those two this section said **nothing**, and had listed five items on
2026-10-22; all five merged, and so did everything they were waiting on. The
heading is kept rather than deleted because an empty in-flight list is itself
the status.

`main` has branch protection with **`strict: true`**, and on 2026-10-23 that
cost was paid in full: fourteen pull requests landed one at a time, each merge
putting the rest behind and forcing a fresh ~20-minute cycle. It was relaxed
for the nine documentation PRs — verified safe first by building the combined
tree locally and running all six drift checkers against it — and **restored
immediately after**. `enforce_admins` is true, so there is no lighter
alternative: `--admin` does not bypass it, the rule itself has to move.
**Whether `strict` earns its keep on a repository where most pull requests
touch only Markdown remains a decision [D]**, and the evidence for taking it is
now concrete.

**AND THE CONTENTION EXPLANATION IS WRONG — the mechanism cannot exist on this
CI.** The 2026-10-23 correlation stands as an observation: six branches at
once, four `ui` failures, every one `taxonomy-ui` §5 — *"proposing a species
from the UI"* — timing out on `waitForSelector`, against 4-for-4 green when the
same branches ran solo. But every workflow is `runs-on: ubuntu-latest`
(`.github/workflows/ui.yml:115` and its six siblings), so **each job gets its
own VM**: jobs share no CPU and no ports, since `sandbox.sh` binds 8887-8889 on
`127.0.0.1` inside the runner it is given. And on 2026-10-24 #333's `ui` failed
on the same selector at 04:17:38, **by which time every other job in both
batches had finished except its own `conductor`** — one sibling, on another
machine — then passed on re-run with the tree unchanged.

~~So two things are now established and one is not. **Established**: §5 has an
intermittent race that does not need a loaded queue, and a re-run clears it.
**Not established**: why six branches correlated with four failures at all.~~

**ANSWERED THE SAME DAY BY #340, AND BRANCH COUNT PLAYED NO PART.**
`taxonomy-ui` §5 was missing the 3-second settle its own section 3 already
took. `render()` rebuilds `app.innerHTML` wholesale, so a re-render landing
between filling the species name and clicking **Propose** destroyed the input;
the form submitted an empty name; validation correctly refused it
(*"CritiqueSpecies name cannot be empty"*). Nothing was written, so nothing was
readable, so the wait timed out.

**The race is per-run and decided by the runner's speed.** A development machine
wins it every time — which is why this harness passed locally all day, twice
against the unfixed code — and a runner carrying vite, Playwright, lair and a
conductor on four cores does not. Six branches meant six samples of a coin a
slow runner loses; four reds in six against none in four solo is **sampling, not
causation**.

Two sentences above are therefore struck rather than edited. *"A re-run clears
it"* was also wrong: the re-run on #339 failed identically, twice in a row,
which is what ended the flake theory. And **"push one branch at a time" is dead
as a remedy** — it addresses a variable with no causal role. The thing that
actually settled it was making the read declare its own mode (§7b.2, item 1.7).

**THREE ATTRIBUTIONS WERE WRONG IN SEQUENCE, and that is the lesson worth
keeping.** Inter-job contention — mechanically impossible, every job holds its
own VM. Then the render path — which *this very section* named as the suspect.
Then commit-to-readable latency — the instrumentation's own first conclusion,
which conflated a refused write with a slow one. Each was retired by a
measurement rather than by an argument, and that is the only reason to trust the
fourth.

---

## 1. Immediate engineering — bounded, and the model can do all of it

| # | item | who | blocked on |
|---|---|---|---|
| 1.1 | ~~**Why `send_remote_signal` does not deliver.**~~ Stage 1's receiving half, cost accounting, idempotence and control all verify; remote delivery does not. Every failure path in the host's implementation is `tracing::info!` then `return` under *"timeouts and errors are ignored"*, so the default log level hides it. Diagnostic: both nodes at `RUST_LOG=info` **CLOSED 2026-10-23 (#318). It delivers and always did** — the harness unwrapper missed `value.payload.PeerSignal` by one level, so *"nothing arrived"* and *"something arrived I cannot read"* were the same observation. `RUST_LOG` could not have found it: `network.sh:592` exports `CUSTOM_FILTER` at base `warn`, which overrides it. `NETAUDIT=trace` did. **Six silent paths, not the four the HDK documents.** | — | done |
| 1.2 | ~~**The scale run above twelve.**~~ `scale-dht.mjs` exists, `EPI_SCALE_NODES` parameterises it, twelve all claimed a FULL arc. The figure wanted is **the N at which an arc first narrows**. ~95-98 MB and ~8% of a core per conductor, so 48 is ~4.7 GB and ~4 cores against 11 GB and 12 cores free **CLOSED 2026-10-23 (#323). Measured at 48 members: 48 of 48 arcs still FULL**, 5,983 MB across 49 conductors, load 3.1-5.6 of 12 cores. **There is no N** — `kitsune2_gossip`'s narrowing path sits behind a `sharding` cargo feature that is OFF, and holochain declares `unstable-sharding = []`, an empty feature that does not forward to it. A feature-flag question, not a scale question. | — | done |
| 1.3 | ~~**The `ui` flake, which is probably not flake.**~~ Four failures on 2026-10-22 across `taxonomy-ui` and `graph-ui`, every one a `waitForSelector` timeout of the shape *write something, then wait for it to render*, every one green on re-run. The two-house run established that transit is sub-second and **local integration under contention** is the cost, which is exactly what a loaded runner has. Wanted: a counted record beside the harnesses the way the `network` pass rate is kept, and the wait declaring its own mode per §7b.2 **COUNTED 2026-10-23 (#316). CAUSE CORRECTED 2026-10-24 — see §0 and 1.7:** the 4-for-4-solo against 4-for-4-batch correlation stands as an observation, but *inter-job* contention cannot be its mechanism — every workflow is `runs-on: ubuntu-latest`, so no two jobs share a machine. What looked like it survived was `scripts/live-verify/README.md`'s *intra*-job hypothesis — one runner contending with itself — and **that was wrong too, settled by #340 the same day**: §5 was missing the 3-second settle §3 already took, so a re-render wiped the form and validation refused an empty name. Runner speed decides the race, but it was never about op integration. Re-running does **not** reliably clear it either — #339's re-run failed identically. See §0 and 1.7. | — | done |
| 1.4 | **Two desktop installs talking to each other.** Closes the clause still open in release step 3 — *"against that build"* — since both ends of every 2026-10-22 crossing were `hc sandbox` conductors. The relay path is measured; the packaging is not **NARROWED 2026-10-23 (#325): the protocol half is DONE and the blocker is smaller than this row said.** Verified against a running `v0.2.0` — the cell hashes to the seeded desktop hash recorded here, the zome reports `declared_version: 9`, a Claim written through the app's own conductor rendered in its UI, and a Retraction showed it retracted by its author while the claim stayed readable by hash. The conductor is reachable **without the GUI** (admin origin `kangaroo`, app interface `webhapp://webhappwindow`), so the crossing test is scriptable. **What remains: one Setup click per profile** — `passwordMode` is `password-optional` and the conductor does not launch until somebody clicks — **and a second machine.** ~~Note `v0.2.0` is `protocol_version: 9` against main's 11, so testing it validates packaging two forks behind; whether that is what *"against that build"* means is a decision.~~ **NOT A DECISION ANY MORE: `v0.3.0` shipped at 11, so run the test against `v0.3.0` and the clause means the documented build.** Three things do not carry over from the `v0.2.0` record — the seed is `Epistemic Resonance-0.3.x`, the running hash is `uhC0kozxl…`, and the launch log says `Connected to admin websocket.` rather than `Conductor ready.` See `INSTALL.md`. | H | the Setup click, and a second machine |
| 1.5 | ~~**Record the 426.0s `partition-rejoin` occurrence.**~~ It failed again on 2026-10-22 with a 426.0s crossing and an `INCONCLUSIVE` divergence verdict, and nodeB's census carried `All agents with overlapping arcs are on timeout=265`. §3 keeps a **running count** of these occurrences precisely so a premise going stale is visible as a rate; this one was observed and never written down **CLOSED 2026-10-23 (#315).** Two further occurrences recorded since, on #321 and #323 — both the baseline crossing failing with nodeB at 0 through t+260s, on a check deliberately non-required so a red informs rather than blocks. | — | done |
| 1.6 | ~~**The parked gate.**~~ Branch `chore/gate-probabilistic-setup`, no commits, to gate probabilistic setup searches in `ordering-policy.mjs` (three sites, lines 244/266/310) **CLOSED 2026-10-23 (#317), then corrected again in #326.** The gate was right; its arithmetic was not. §2 compares 32 hashes against ONE pivot, so a miss is *"is the pivot the maximum of 33"* = **1/33 ≈ 3%**, not 2^-32 — and CI drew it while the gate printed the false figure one line above the red. Repaired with seven independent pivots: (1/33)^7 = 2^-35.3. **Four wrong odds in one file, three of them in the commits that fixed the others.** | — | done |
| 1.7 | ~~**The `ui` §5 race, and the three places that call it contention.** On 2026-10-24 #333's `ui` timed out after 25s on `[data-species="ProposedCritique…"]` with exactly one sibling job alive on another VM, then passed on re-run against an unchanged tree — so the failure is `taxonomy-ui` §5's own race, and `runs-on: ubuntu-latest` leaves jobs nothing to contend over. The suspect is the write-then-render path: `mobile-ui/src/main.ts:3382-3402` awaits `create_critique_species`, sets `proposingSpecies = false`, then `await loadTaxonomy()` — the card exists only after that refetch returns, while the harness's independent-client read on the next line would still pass, which localises it to the render half. Wanted: the wait declaring its own mode per §7b.2, and the correction swept through 1.3 and `README.md`'s *"contention profile of the pull-request queue"* (§ the `ui` rate caveat) rather than §0 alone. **`scripts/live-verify/README.md` is NOT wrong and was not changed**: its hypothesis is intra-job — a busy runner integrating ops — which survives intact, and it already names the §7b.2 wait as what would settle it. **Swept 2026-10-24.**~~ **AND THE §7b.2 HALF IS NOW BUILT — `scripts/live-verify/declared-wait.mjs`.** On timeout it asks the DHT whether the entry is readable and reports which failure it was: RENDER if it was there, INTEGRATION if it was not, UNDETERMINED loudly if the probe throws. Applied to the three selectors that have actually failed and no others — the suite has about a hundred waits and the discipline names a shape, not all of them. Both harnesses re-run green against a real conductor (`taxonomy-ui` 25, `graph-ui` 14). It also generalised `check-harness-counts.mjs`, whose module exclusion was a hardcoded `chromium.mjs` with a comment asserting it was the only non-harness there. **AND IT FOUND THE CAUSE IN TWO RUNS — #340, with the suspect named in this very row exonerated.** `main.ts:3382-3402`'s write-then-render path was innocent: the species read NOT READABLE at the moment of timeout, twice consecutively, so the screen was right to show nothing. The bug was in the HARNESS — §5 lacked the 3-second settle §3 already took, so a re-render wiped the species name, the form submitted empty, and validation refused it. `ui` is green in CI on the fix, which is the only evidence that counts here. **The module's own first conclusion was wrong too** and is corrected: it called "not readable" a latency finding, but a REFUSED write and a SLOW one are identical to a probe — this was a refusal, visible on screen throughout — so it now reads the page for a displayed error on that branch. | M | done |
| 1.8 | ~~**Nothing verifies the artifact that is actually ON the registry — only the next one.** `published-packages.mjs` packs the **local** tree and installs those tarballs, deliberately: during a version bump the replacement SDK is not published yet, so resolving the registry copy would verify precisely the code being replaced. Its own step-2 comment says that, and READINESS records it. **The consequence nobody drew**: a green `conductor` run means *the tarball we would publish from HEAD works against a real conductor*, and says nothing about what a stranger installing today gets. **THIS FAILURE CLASS HAS ALREADY HAPPENED** — the registry copy of `0.1.3` was broken from 2026-10-15 until `0.1.4` because a dependency RANGE resolved to a bad version, which no local-tarball test can see by construction. Wanted: a by-version install **from the registry** into an empty project, driven against a conductor, reporting which version it resolved so the check cannot quietly pass against a stale pin — and run on a schedule rather than per-push, since it tests the registry and not the diff. Negative evidence is cheap here: point it at `0.1.1`, which is still on the registry and still broken. ~~ **BUILT 2026-10-24 — `scripts/live-verify/registry-install.mjs`, 6 checks.** Installs by version from the registry, reports what resolved and asserts it is what was asked for (§7b.2 for an install), and drives that copy against a real conductor. **Green at `latest`**: `agent-sdk` `0.1.5`, `mcp-server` `0.1.5`, `@holochain/client` `0.21.0` — which is the first direct evidence that the artifact on the registry *now* works, rather than the one we would publish next. **Negative evidence watched**: `EPI_REGISTRY_VERSION=0.1.1` gives 3 reds and exit 1 with install and resolution still green, naming the cause (`@holochain/client` `0.17.1`, the pre-0.7 client). Not wired into any workflow — it tests the registry, which does not change when this repository does, so **scheduling it is a [D] and a cron line, not code**. | M | done |

---

## 2. The autopoiesis staging — in dependency order, not preference order

**COMPLETE as of 2026-10-24.** All five stages are on `main`: the medium (#318), proprioception (#319), standing (#324), secretion (#320) and the microbiome (#321). Every one is coordinator-only — no entry type, no link type, no validation rule — so the DNA hash is untouched and nothing here forked the network.

The ordering is forced, not chosen. Stage 1 exists to make Stage 2 affordable;
Stage 2 is the only item that decides whether **operational closure** is true
rather than aspirational; Stage 3 is the first *consequence*; 4 and 5 are
downstream of both.

| # | item | who | blocked on |
|---|---|---|---|
| 2.1 | ~~**Stage 1 — the medium.**~~ Typed ephemeral peer signals. One entry to open a channel, zero per signal. Coordinator-only and **proven not to fork**: the DNA hash was byte-identical before and after **CLOSED 2026-10-23 (#318).** One entry to open a channel, zero per signal, four typed variants round-tripping, 22 checks. | — | done |
| 2.2 | ~~**Stage 2 — proprioception.**~~ `get_local_tension`: one read bundling closure deficit, ordering ambiguity, friction headroom, conductance decay, arc width. Then dispositions respond to it. **This is the stage that matters.** Luhmann's criterion for an autopoietic system of communications is that a communication be produced by prior communications rather than by the environment; right now every claim is produced by a human or an externally-triggered agent, and this is the single change that makes the graph's own state the proximate cause of the next write **CLOSED 2026-10-23 (#319).** `get_local_tension`, caller-scoped **by construction** — no agent parameter, so it cannot become the per-agent scalar Invariant 1 bars. 34 checks, four injections. **Four signals, not five: arc width is unreachable from a zome**, and the gap is reported as `signals_bundled: 4 / signals_intended: 5` rather than hidden. | — | done |
| 2.3 | ~~**Stage 3 — standing / apoptosis.**~~ Standing as a function of causal distance, computed at read time, writing nothing. Primitives exist (`order_records`, `past_cone`, `get_grounding_path`). Needs a harness with injections, since a standing rule that cannot go red is this repository's recurring failure **CLOSED 2026-10-24 (#324) WITHOUT waiting on 3.1**, by making the threshold the caller's promise. Apoptosis not necrosis: reported, still fetchable by hash, never deleted. Counted in causal **edges**, never ordinal position, since `tie_broken` means ordinal distance is part hash. 26 checks, five injections. **3.1 still decides whether a membrane may DECLARE N** — an addition to this read, not a replacement. | — | done |
| 2.4 | ~~**Stage 4 — secretion.**~~ Dispositions propose `CritiqueSpecies`; `get_species_adoption` read a second time **at a causal distance from the first**, which is the only way exploration becomes distinguishable from degradation. The swarm currently passes `species: null` (`scripts/swarm/run-swarm.mjs:250`) **CLOSED 2026-10-23 (#320).** Uptake told from a private vocabulary by **causal distance** from `past_cone`, not by polling twice — two reads are separated by a clock and §5.22 rules that out. A live 3-agent run produced both classes: 1 downstream adopter at depth 1 on `unevidenced-claim`, all-proposer citations on `method-unstated`. | — | done |
| 2.5 | ~~**Stage 5 — microbiome.**~~ Membranes read each other's published policies and import foreign critiques. `federation/` currently contains **zero** references to `ConductancePolicy` or `AttestationPolicy` **CLOSED 2026-10-23 (#321).** A foreign critique is a **witness** under the importer's own key — §5.2 binds author to the action author, so writing somebody else's objection would forge provenance. Excluded from `get_discourse_health` and counted as `imported_claims`, or importing fifty would make a domain's health a reading of another network. Verified across two genuinely separate DNA hashes. **`ForeignCritique` as a real entry type remains §4's bump.** | — | done |

---

## 3. Research questions — no code until these have answers

| # | question | who | why it is open |
|---|---|---|---|
| 3.1 | ~~**What sets the atrophy threshold?**~~ Quantitative Promise Theory: a threshold turning a signal into a decision **is itself a promise and needs an agent behind it** — the argument that retired `CONDUCTANCE_HALF_LIFE_SECS` as a universal constant with no promiser. **DECIDED 2026-10-24: THE READER IS THE PROMISER, and the answer was already shipped.** `StandingPolicy::max_causal_distance` (Stage 3, #324) makes the threshold the CALLER's promise. The row offered two candidates — per-membrane **declared** or **derived** — and a third had appeared since it was written. The deciding property is that the caller-supplied form has **a neutral off position**: `None` means no atrophy, not a default, so Invariant #1's "constant with no promiser" objection is answered in full rather than half-answered as it had to be for a half-life, where time passes whether or not anybody promised a rate. **Per-reader is enough; no membrane-wide answer is wanted.** Consequences: **4.4 leaves the §4 bump** (a declared-N `Constitution` field is not being built), and **3.2 loses its driver** — see its row. | — | done |
| 3.2 | **Is there a derived measure that does not punish exploration?** Project 89's dead-head criterion has exactly the right *form* — `τ = 0.96/√d`, local to the component, zero parameters, validated against ablation ground truth at 95-100% across six models. But it equates low alignment with the receiver's state with death, and in a discourse graph the orthogonal contribution is sometimes the only valuable one. **The swarm deliberately runs an exploring minority that this criterion would classify as dead on sight.** Candidates to replace alignment: grounding density, citation closure, assessment reachability over causal distance **NO LONGER BLOCKS ANYTHING, 2026-10-24.** Its blocker read *"3.1's second branch depends on it"*, and 3.1 closed per-reader — so the derived branch is not being pursued and nothing waits on this. **Kept as an open research question rather than closed**, because the thing it actually asks is still unanswered and still interesting: whether a measure can be derived that does not classify the exploring minority as dead on sight. Reopen it if a membrane-wide or derived threshold is ever wanted. | M | nothing — research, not a blocker |
| 3.3 | ~~**Why was rejoin round 1 slower than round 3, from a *shorter* outage?**~~ Round 3 self-recovered in 687-692s from 884s offline; round 1 was still dry at 905s from 861s offline, then crossed 65s after a third node joined. Recovery scales with absence in both clean runs, but round 1 is outside that. **The `Unsolicited Accept` hypothesis is dead** — it coincided to the second with round 2's recovery and failed to recur at round 3's **ANSWERED 2026-10-23 (#322)** by reading kitsune2's scheduler. Round 1 needs no cause of its own: recovery is gated by a URL-keyed unresponsive marker whose TTL is the peer's `agent_info.expires_at`, fixed **before** the outage. **Three recorded claims retired** — there is no 300s per-peer floor (`min_initiate_interval_ms` is read by no code), *"scales with absence"* is unsupported, and the first initiate is at ~120-130s not ~1s. The clean closed form is refuted by round 3; a fourth round needs the instrumentation listed in the runbook. | — | done |
| 3.4 | **Can a metabolic budget exist without being Invariant 1's leaderboard?** The mutual-credit ledger was built, verified and **removed** — `docs/metabolic-biosignalling-currency-brief.md`, 1,020 lines — and reason 3 was that `get_credit_balance` was a canonical per-agent scalar over an enumerable agent set. The escape route the brief itself names: `AttestationPolicy` survives because **its answers are caller-scoped and legitimately differ between observers**. So a budget can exist only **per-reader** — my budget for you, under my policy — and never as a number the protocol asserts about you. Without that constraint settled first, building it is a re-run of a deletion | D | the constraint is clear; whether to build on it is not |
| 3.5 | **Observer diversity is unverifiable, and it is one problem wearing two costumes.** Ten observer identities may be one actor; and if every observer runs one model, the exploring minority is one mind in different hats. **The swarm has an accidental defence**: dispositions are *mechanical*, every rule a property of auditable data, so the variation does not come from the model. **Observers-as-entries would throw that defence away**, since the thing being selected becomes a prompt **AND IT IS THE SAME PROBLEM AS THE SYBIL LIMIT, now stated once in 3.7** rather than half here and half in `SECURITY.md`. The mechanical-disposition defence is why ten observers genuinely differ even on one model: a disposition is a threshold and a mode preference published as a `Constitution` promise before the agent acts, every rule a property of data a reader can check — so divergence from a declared threshold is caught by comparison rather than by anybody's say-so. Prompts would make ten observers one mind in different hats. | D | a cost to price before adopting observers-as-entries, not a bug to fix; the question itself is now 3.7 |
| 3.6 | **Does anything actually depend on Andras's store shipping?** A prior session recorded a *"Phase 8 — waiting on Andras' CAS shipping"*. **"Phase 8", "CAS" and "content-addressable" appear nowhere in README, READINESS or SPEC.** After §5.22's repair 4 there is now a plausible real dependency — the ordinal anchor needs closed versions published into the DHT — so if something is blocked, it needs a row | D | undocumented; the first task is deciding whether it is real |
| 3.7 | **What is the cheapest promise structure that makes sybil cost high enough, without creating a centre?** *Raised 2026-10-25 as focused research.* **NOT the question**: how the protocol learns who is a person. That is unanswerable by construction and a year could be lost to it — deterministic replicated validation can only see the data handed to it, which is constitutive of any validator that must reach the same verdict on every machine forever, not a Holochain defect. **It is ONE wall, met three times**: validation cannot reach a clock (§5.22), cannot reach a chain (the notary Luck Light supplied), cannot observe personhood. And the protocol's answer has been the same each time — move the outside-world fact into a **named agent's promise** and let the reader decide whether to trust it. **FOUR CANDIDATE SCARCE RESOURCES, costed against the invariants.** (1) **Attestation capacity — already BUILT and the best fit**: the scarce thing is tenured members' willingness to vouch, bounded by `AttestationGrant`'s 30-day tenure bar and 5-per-week rate limit, so a thousand minted keys buy nothing. No money, no stake, no balance, no oracle. (2) **Sequential work — PoW or a VDF, unbuilt but structurally available**: validation can hash, so a proof over an agent key is checkable without reaching outside, and a one-shot proof creates no per-agent scalar so Invariant 1 is untouched. It cannot gate key *generation* (not a DHT op) but could gate membrane join via `AgentToMembrane` validation. Costs: it is *costly* rather than *accountable* (SPEC §398 — founding has no fee, stake or token) and it penalises low-power participants. A **VDF** proves how long sequential work took without knowing when, which is adjacent to 4.1's notary gap and not only to sybils. (3) **Social-graph topology** — same family as (1); `max_attestation_depth` already walks it. (4) **Hardware attestation, biometrics, state ID** — oracles in costume. Viable only as **opt-in**: a default breaks Invariant 1 (SPEC §712 — a hardcoded always-applied filter *is* the canonical signal the invariant rules out), and a personhood record is permanent under Invariant 6 with no erasure path, which is the most sensitive data category imaginable to put somewhere nothing can be removed from. **A CORRECTION THIS RESEARCH STARTS FROM**: "charging requires balances, and balances break Invariant 1" was asserted on 2026-10-25 and is FALSE for one-shot proofs — a balance is a running scalar, a proof consumed once is not. That error would have foreclosed candidate (2) entirely. **AND THIS IS THE THIRD COSTUME OF ONE PROBLEM**: 3.5 already says observer diversity is unverifiable and is "one problem wearing two costumes"; 7.12 is the read-layer half. Research that unifies the three beats three separate answers. | M to research and write up; **D** to adopt anything | nothing — this is research, and candidate (1) is already shipped |

---

## 4. Behind one integrity fork — accumulate, then bump once

Every edit to the integrity zome forks the network, additive changes included,
so these batch into a single `protocol_version` bump rather than four. **Stages
1 to 3 need no fork at all**, which is why they come first.

**The candidate set is four, and this section listed three until 2026-10-24.**
`docs/integrity-bump-plan.md` §2 is the authority on the set and says so in its
own heading: 4.1-4.3 below, plus **4.5**, which existed only in the plan. 4.4 —
a declared atrophy threshold `N` — was added and dropped on the same day, when
3.1 decided the reader is the promiser; it is not listed because it is dead,
not pending. **The gap is the lesson**: a candidate added in a plan document
does not reach the ordered list by itself.

| # | item | who | blocked on |
|---|---|---|---|
| 4.1 | **The foresight ordinal anchor.** `PreRegistration.reveal_deadline` changes type to a position in a declared order; `Revelation` gains an association; `Membrane` gains a declared notary key. Validation then checks shape only — the association resolves, its author is the declared notary, its counter precedes the deadline's. **Not adopted** — the 2026-10-19 decision stands, since no surface grants this timestamp authority — but the reopen order changed: repair 3 first because it is free, then **repair 4**, and countersigning only if an ordinal anchor is unavailable **THE QUESTIONS ARE ASKED (7.6, sent). This now waits on ANSWERS, not on anybody writing an email** — which is a different blocker and outside this repository's control. Nothing else in §4 depends on them, so the bump is not held up by 4.1 alone. | D | Andras's three answers |
| 4.2 | **Observers as entries**, if adopted — prompts, heuristics and thresholds as signed entries, so selection acts on the agents. Contrary to one claim on file, this **is** a new entry type and therefore does fork | D | 3.5's cost, priced |
| 4.3 | **Species provenance and metabolic policy fields**, if Stage 4 and a budget are adopted | M | 2.4, 3.4 |
| 4.5 | **`ForeignCritique` as a real entry type** — the honest home for an imported critique, in place of the tagged-`Claim` witness Stage 5 (#321) ships. That workaround was chosen precisely to avoid a fork and carries a real cost: a reader must filter by tag, and `get_discourse_health` needed `imported_claims` to keep its own count honest. One new entry type, **appended** — entry types are position-indexed, so it cannot go anywhere else. See `docs/integrity-bump-plan.md` §2. | [M] once the bump is cut | the bump itself, which is **[D]**: whether it goes before or after inviting ten people |

---

## 5. Adopted from Veritas (Project 89) — cheap, and partly landed

| # | item | who | blocked on |
|---|---|---|---|
| 5.1 | ~~**SPEC §7b, the two disciplines** — *grounded or silent, and counted*; *every read declares the mode it ran in*~~ **DONE in #312, which merged; struck 2026-10-24.** `§7b.1` and `§7b.2` are both in `SPEC.md` — the row sat open for days with its blocker column still reading *"in #312"*, which is the same rot as 4.5 in the other direction: the work landed and the list did not move. 7b.2 is now load-bearing elsewhere — item 1.7's open half is an application of it, not a test fix. | M | done |
| 5.2 | **Apply 7b.1 to an ingestion path.** The discipline's point is that automated inflow becomes safe to switch on exactly when its rejects are counted. Nothing ingests yet, so the rule currently binds nothing | M | a decision to build ingestion at all [D] |
| 5.3 | **A typed source-ownership class on `Evidence`**, applied bloc-agnostically — independent / public-broadcaster / state-media / state-official. `Evidence` currently carries only `source_url` and a free `EvidenceType`. **This is expressiveness without ranking**: a type, not a score, and the symmetry is what stops it being a politics | M | an integrity change, so §4's bump |
| 5.4 | **Divergence-by-perspective-class as a read.** Veritas does not adjudicate; it surfaces how the same event is told to different audiences. That is Invariant 2 and Invariant 10 implemented as a feature rather than a slogan, and the strongest evidence seen that *"creates conditions for truth to resonate"* is buildable | M | 5.3 |

**Do not import the surrounding cosmology.** Project 89's broader framing
includes deriving the fine structure constant from a lattice learning rule at
1.5 ppb with zero free parameters — an extraordinary claim, treated here as
unvalidated. The disciplines above and the dead-head *form* stand on their own
and do not depend on it.

---

## 6. Interaction design — four unsurfaced reads

Each is deliberately unsurfaced **with its reason recorded**, and each needs a
design decision rather than wiring. Verified 2026-10-22 against `mobile-ui/src`:
all four return zero hits, while `get_discourse_health` returns three — the
read is wired, the publish is not.

| # | item | who | blocked on |
|---|---|---|---|
| 6.1 | `critiques_unseen_by` — the honest screen must render `cone_recorded` as prominently as `unseen`, or silence reads as ignorance | D | a design decision |
| 6.2 | `publish_discourse_reading` | D | same |
| 6.3 | the settlement screen | D | same |
| 6.4 | the assessment screen | D | same |

**Item 22's reopen condition is structurally gated on 6.2**, which is a useful
property rather than a coincidence. Both halves are required — *a surface for
readings exists* AND *somebody wants them faster than a person will click* —
and the first is false while 6.2 is unbuilt, so the autonomous-writer question
cannot become live by any other route.

---

## 7. Human, outward-facing, and third-party

| # | item | who | blocked on |
|---|---|---|---|
| 7.1 | ~~**The sybil position.** *"A person standing behind it before inviting a crowd. Explicitly not technical."* The question is whether to vouch for this publicly knowing a modified coordinator stays on the network and the integrity zome is the only trust boundary **THE WRITTEN HALF IS ALREADY DONE AND WAS NOT THE PROBLEM.** `SECURITY.md` and `READINESS` both state the position deliberately: identity is free, containment is topological and holds for what you traverse to and nothing for what you look up, a sybil flood pollutes `get_claims_by_domain` in full, and a modified coordinator stays on the network so the integrity zome is the only trust boundary. **And for ten invited people those two limits are largely theoretical** — a free-identity flood and a hot-swapped coordinator are adversary models, and ten people you invited are not one. **The limit that can actually hurt an invitee is Invariant 6**: nothing is deletable by anyone, so a tester who writes something they regret has no remedy at all. `INSTALL.md` already discloses that well, including the GDPR exposure and the line that it belongs in whatever you tell participants before they join. So the decision is narrower than the row implied: **vouch for the protocol being honest about what it does and does not do, not for it being adversary-resistant** — the first is defensible and written down, the second is contradicted by `SECURITY.md` in writing. ~~ **DECIDED 2026-10-25 — option 1: vouch for honesty, not for safety.** The commitment made is that *this protocol describes accurately what it does and does not do*; explicitly NOT that it is adversary-resistant, which `SECURITY.md` contradicts in writing and which therefore was never an available choice. **What it obliges**: the documentation being truthful, and the permanence disclosure reaching every invitee *before* they write anything — because under Invariant 6 that disclosure is the only protection they get. #344 is the first payment on that obligation: `INSTALL.md` was telling readers that cross-network discovery was untested three days after it was measured. **Two options declined and why**: inviting as a pure experiment gets testers rather than users and teaches less, since people behave differently when told nothing counts; and waiting for the read-layer sybil lens delays on a hazard a cohort of ten invited people does not present. **CORRECTED 2026-10-25 — that alternative was costed as "indefinite" and the lens is in fact BUILT**: `AttestationPolicy` and `is_agent_attested` exist, `trust-lenses.mjs` covers them at 31 checks, and the lens is already wired into `get_discourse_health`. What is missing is narrower — it is not available on the reads a flood pollutes, since `get_claims_by_domain(domain: String)` takes a bare string and no policy. **The decision stands for the reason given** (the threat is absent for an invited cohort) **and not for the reason first written**, which overstated the remaining work. Tracked as 7.12. | D | done |
| 7.2 | **An outside audit — none has been done.** Distinct from the internal review of the *zomes* on 2026-10-11, which found five defects of one shape, closed all five, bound eighteen link types, watched both halves of all eighteen rules fail across six injections, and runs 101 checks on every push as a required check. **That part is strong and done** | X | procurement |
| 7.3 | **Four services with no security review at all** — `bridge/`, `gateway/`, `federation/`, `mcp-server/`. None is part of what an installing user runs, so they are outside a tester's attack surface and **inside it for anyone who deploys them** | M or X | scope decision: review, or state plainly that they are not for deployment |
| 7.4 | **Release step 4 — invite ten people on desktop.** **THE RELEASE HALF OF THIS IS DONE: `v0.3.0` shipped 2026-10-24 carrying `protocol_version: 11`**, so an invitee now joins the network this repository describes rather than one two forks behind — which is what made this row fiction until today. Verified end to end, including that the install created a fresh `0.3.x` conductor rather than reusing the 0.2.x cell. What remains is **1.4 alone**: 7.1 was decided on 2026-10-25 (vouch for honesty, not safety), and 7.3 does NOT gate this — `READINESS` is explicit that `bridge/`, `gateway/`, `federation/` and `mcp-server/` are none of them part of what an installing user runs, so an unreviewed service is outside a tester's attack surface. **So this row is now blocked on one [H] item and nothing else.** And there is now a number to tell them rather than a shrug: seconds between peers both up, but **five to twelve minutes for somebody who closed their laptop and came back**, growing with the absence. That is what ten testers will report as "it's broken" | H | 1.4 first; 7.1 arguably first |
| 7.5 | **Release step 5 — a per-claim delivery indicator.** Explicitly for the *second* round, not the first. Needs a zome surface that does not exist, so it is a protocol change rather than a UI task | M | §4's bump |
| 7.6 | ~~**Send the drafted reply to Andras.**~~ Drafted 2026-10-22 and **SENT** — confirmed by the human 2026-10-24, who has the message. It carries all three questions 4.1 is blocked on, verbatim: whether a closed version is citable by value **and signed**, what the closure cadence is, and whether a node learns which version its request landed in. It also carries the narrowing — *"inclusion is binary and self-evident to whoever asked, that's exactly why Lamport's happened-before is free, it says nothing about content. Judgement isn't"* — and the reason for keeping them apart: **conflating them is how a system that refuses scores ends up shipping one.** | — | done |
| 7.7 | **The HDK documentation bug, upstream.** `hdk-0.7.0/src/p2p.rs:138` gives the required receiving signature as `fn recv_remote_signal(signal: ExternIO)`. That fails every delivery: the host passes the payload's bytes *as* the extern input, so the macro tries to deserialize a map into a byte array, the receiver logs `Deserialize([129, 169, "Saturated"…])`, and the sender — which cannot see errors at all — sees nothing. Reproduced and worked around here | X | **the human's account and call; the model does not file upstream** |
| 7.8 | **The returning-node asymmetry, upstream.** A known peer returning behaves far worse than a stranger arriving — reproducibly, with a fresh node getting the full history in ~15s while a returning one had nothing after 905s. Plausibly worth reporting | X | **the human's account and the human's call; the model does not file upstream** |
| 7.9 | ~~**Send the egg-case reply to Luck Light** (Decent community). Drafted at `docs/cases/luck-light-egg-reply.md`, with the full verified mapping beside it. The substance: **his IP question is his peg question** — proof of origin is authorship plus *ordinal* order, and a **date needs a notary**, which is 4.1's gap exactly. Sending it makes 7.10 an outstanding promise to a named person~~ **SENT 2026-10-24, AND ANSWERED THE SAME DAY.** His reply raised four things and asked one question; §8-§11 of `luck-light-egg.md` map them and `luck-light-egg-reply-2.md` is the drafted response. **The notable one: he brought his own notary** — timestamps referenced to public-chain transaction hashes — which takes 4.1 off *his* critical path, since a promiser is what the protocol asks for and he named one. **And one correction to make to him**: his exclusion model wants removal, which does not exist here; the honest offer is caller-scoped non-recognition via `AttestationPolicy`, plus an `Impersonation` `AntibodyPattern`. | H | done |
| 7.10 | ~~**Build the egg-case walkthrough as a `live-verify` harness** — one membrane, producer/tester/buyer, one certification, one pre-registered capacity forecast, one redemption settled 2-of-2 with `max_dissent: 0`, and the buyer calling `get_standing` **twice** (once `None`, once tight) to see the same flock with and without standing.~~ **BUILT AND PASSING 2026-10-24** — `scripts/live-verify/superior-egg.mjs`, 33 checks, green on a real three-agent conductor, and `luck-light-egg.md` §7's NOT YET BUILT marking is removed because the condition it set is met. **It corrected the document it implements**: §7 listed `grant_attestation` among the steps and the 30-day tenure bar makes that impossible on a new membrane, so the harness asserts the refusal. Demonstration verified sensitive by injection (slack threshold for tight: 2 reds, exit 1), which also caught the harness printing a success line under its own failures. Two incidentals worth not re-deriving: `ClaimStanding.claim` is an ACTION hash while critique targets are ENTRY hashes, and the harness needs `sandbox.sh clean` first — on an accumulated DHT it exceeded 400s and was killed. | M | done |
| 7.11 | ~~**Send the SECOND egg-case reply to Luck Light.** Drafted at `docs/cases/luck-light-egg-reply-2.md`, mapped in `luck-light-egg.md` §8-§11. It answers his question — *what does a challengeable claim look like in an open bazaar* — with the load-bearing line that **a challengeable claim is one that says what would make it wrong**, which is §7b.1 pointed at a market. It also tells him three things he will not like: exclusion is non-recognition rather than removal (no `revoke_*` exists anywhere, verified), the 72-hour deadline cannot be enforced because validation cannot read a clock (§5.22), and *"the requested amount would update"* cannot be a mutable field so the outstanding amount is a reader's derivation over signed partial deliveries. **His own ledger plan rescues the deadline**: expressed against a block rather than a clock, *was this fulfilled in time* becomes answerable by anyone. ~~ **SENT 2026-10-25.** | H | done |
| 7.12 | ~~**The read-layer lens does not reach the reads a sybil flood pollutes.** `SECURITY.md` names a read-layer lens as the right fix for free identity, and it exists: `AttestationPolicy` (`require_attestation_from`, `min_attestations`, hop depth) with `is_agent_attested`, verified by `trust-lenses.mjs` at 31 checks and already wired into `get_discourse_health`. But `get_claims_by_domain(domain: String)` takes no policy at all, which is exactly README §2.3's caveat — **containment holds for what you traverse to and nothing for what you look up** — so an index lookup returns a flood in full while a traversal degrades gracefully. Wanted: the optional policy argument on the index reads, defaulting to `None` so nothing is filtered unless a caller asks, per README §4.4's rule that a lens is one **the user aims and can see, never one that aims itself**. Negative evidence is cheap — seed a domain from several keys, assert the unfiltered read returns all of them and a filtered read only the attested ones, so a lens that silently did nothing goes red. **Not urgent for ten invited people**: a free-identity flood is an adversary model and an invited cohort is not one, which is why 7.1 declined to wait for it. ~~ **BUILT 2026-10-25 — `get_membrane_claims`, and `scripts/live-verify/index-lens.mjs` at 15 checks.** Coordinator-only: no entry type, no link type, no validation rule, **so no DNA hash change and no fork.** `None` is `get_claims_by_domain`'s behaviour exactly, asserted against it. **Anchored to a Membrane rather than a bare domain string**, so a caller cannot ask about a domain nobody founded and the `AttestationGrant` source has the membrane its tenure bar is anchored to. **The drops are counted (§7b.1)** — `examined`, `unresolvable`, `filtered_unattested` — because a read returning three of a hundred and saying only "three" is indistinguishable from a domain holding three; `get_claims_by_domain` drops unresolvable links silently and this read counts them instead. `attestation_filtered` is §7b.2. **Injection: the policy replaced with `null` gives 4 reds**, and the over-refusal guard correctly stays green. The harness had to find its own way to an attested agent, since `grant_attestation` needs 30 days of tenure — a critique's `SynapticLink` attests its target's author, globally and free. **Unsurfaced deliberately**, with the reason in README §9: the screen question is *whose attestation does this user trust*, which is §6's family of decisions, and a filter on by default would be the canonical signal Invariant #1 rules out. | M | done |

---

## What this list does not contain

Anything whose blocker could not be stated. Two things were considered and left
out for that reason: a "speed and scalability" item, which `READINESS` already
says comes after real reports from step 4 and therefore has step 4 as its
blocker rather than a technical one; and a general "make it autopoietic" item,
which is §2 with the ambition removed — **the honest target is operational
closure in Varela's weaker sense, or Luhmann's autopoiesis of communications,
and not biological autopoiesis.** Varela himself declined to extend the term to
social systems. Self-production of the boundary and self-repair both stay out of
reach: a person still installs the hApp, and a system that cannot delete cannot
heal, only accrete and lose standing. **Coral reef rather than cell** — durable
accretion with living tissue on the surface — is the better description and the
better story.
