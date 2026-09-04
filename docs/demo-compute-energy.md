# Demo script: "The number that outran its methodology"

A ready-to-run first demo for the `ComputeEnergy` domain (`domains/compute-energy.json`).
Every block below is copy-paste-able into the mobile UI's claim and critique forms.

---

## Why this topic

A first demo has to do two things at once: be immediately legible to a stranger,
and exercise the parts of the protocol that don't exist anywhere else. Most
topics do one or the other. Ultra-processed food is legible but its disputes are
mostly about values. Foundations of quantum mechanics exercises the taxonomy but
loses the room in ninety seconds.

The energy cost of computation does both, because its characteristic failure is
not disagreement about values — it is **a real measurement quoted outside the
boundary it was taken at**. That failure is a single, concrete, checkable thing.
It is also the same failure in four different rooms at once:

| Audience | Why they lean in |
|---|---|
| **Scientists and engineers** | The dispute is entirely about measurement boundary and citation provenance — the two things a typed critique system is actually for. Nothing here rests on the demonstrator's authority. |
| **Elon Musk / infrastructure builders** | Claim 4 is a position he has argued publicly (electricity and transformers, not chips, as the binding constraint). The demo shows what it looks like for that claim to be held *Tentative*, confirmed Experientially by someone inside an interconnection queue, and narrowed Methodologically — instead of quote-tweeted. |
| **Cryptocurrency community** | Claim 7. They spent a decade on the receiving end of exactly the boundary error the demo unwinds in Claim 1. Watching the protocol apply the same standard *in their favour and against them in the same breath* is the most credible thing it can do in front of that audience. |
| **The general public** | Claim 1 → the retraction. "Here is a number you have read. Here is where it actually came from. Here is the author saying they were wrong, in a way that makes the record stronger instead of making it disappear." That is the whole pitch, and it needs no vocabulary at all. |

It is also not politically radioactive. Nobody in the room has to be on a side
before the demo starts, which is what makes the *method* the thing they notice.

---

## Setup

```bash
scripts/sandbox.sh start
cd domains && npm install && node bootstrap.mjs compute-energy.json
```

Note the Membrane hash it prints — `join_membrane`, `get_discourse_health`, and
`get_cross_domain_critiques` all need it.

**Run the demo from at least two agents.** Critiques are rate-limited to 20 per
agent per rolling hour (`CRITIQUE_MAX_PER_WINDOW_VALIDATION`, and each critique
also spends a synaptic-link unit against the same 20/hour budget). The script
below has 13 critiques, which fits inside one agent's budget but leaves almost
nothing for live audience participation — and a single agent critiquing its own
claims is a weaker demo anyway. Two or three conductors is the honest staging.

---

## Act 1 — Publish the claim everyone in the room has already read

> **Field values**
> **Domain:** `ComputeEnergy`
> **Confidence:** `High` ← *deliberately wrong; this is the point of the demo*
> **Tags:** `llm-inference, per-query-energy, viral-statistic`

**Content:**

```
A single ChatGPT query consumes about ten times the electricity of a Google
search — roughly 2.9 Wh against 0.3 Wh. At current query volumes this makes
conversational AI a materially larger per-interaction load than web search, and
the gap is the main reason datacenter demand is climbing.
```

**Evidence** (attach before submitting):
- Type: `Text`
- Content: `Comparison as it appears in the IEA's Electricity 2024 report, which is where most downstream coverage picks it up.`
- Source URL: `https://www.iea.org/reports/electricity-2024`

Say out loud while posting it: *"I'm publishing this at High confidence. Watch
what the network does to that."*

---

## Act 2 — Four receptor types bind to the same claim

The demo's core move: these are not four downvotes. They are four **structurally
different objections**, and the protocol refuses to add them up into one number.

### Critique A — the provenance chain

> **Mode:** `Evidential` · **Species:** `CitationLaunderingCritique`

```
The figure does not have a primary source. Following it back: the IEA's
Electricity 2024 repeats the comparison rather than measuring it, citing de
Vries (2023, Joule, "The growing energy footprint of artificial intelligence")
for the ~2.9 Wh side. That paper derives its number bottom-up from assumed
request volumes and assumed server hardware — it is an estimate with stated
assumptions, not a meter reading. The 0.3 Wh side traces to a Google company
blog post from 2009. And the "10x" framing itself entered circulation via a
2023 remark by Alphabet's John Hennessy that an LLM exchange likely costs ten
times more than a keyword search — a statement about COST, which then became a
statement about ENERGY somewhere in the retelling.

Three sources, none of which contains the claim as stated.
```

### Critique B — the measurement boundary

> **Mode:** `Methodological` · **Species:** `ChipVsFacilityCritique`

```
Even granting both numbers, they are not measured at the same enclosure. The
~2.9 Wh is a server-level estimate built up from hardware assumptions. The
0.3 Wh figure is a facility-level number that already includes datacenter
overhead — cooling, distribution, idle. Dividing one by the other compares a
chip-boundary estimate to a facility-boundary measurement and reports the
result as a property of the system. Whatever the true ratio is, this arithmetic
cannot recover it. State the PUE, or state that the figure excludes it.
```

### Critique C — the baseline has aged

> **Mode:** `Methodological` · **Species:** `StaleBaselineCritique`

```
The denominator is from 2009: 2009 hardware, 2009 index size, 2009 ranking
stack. The numerator is from 2023 and does not name a model. A ratio whose two
terms are separated by fourteen years and several process nodes is not a
comparison of two technologies; it is a comparison of two eras.

Both ends have moved since. Google's August 2025 measurement puts a median
Gemini text prompt at roughly 0.24 Wh at the facility boundary — the same
order of magnitude as the 2009 search figure this claim uses as its baseline
for "cheap."
```

### Critique D — the unit of work isn't shared

> **Mode:** `Logical`

```
"Per query" is not a comparable unit across the two systems. A search returns a
ranked list of roughly fixed length. A generation produces a variable number of
tokens, and energy scales with that count. A thirty-token answer and a
three-thousand-token answer differ by two orders of magnitude inside the same
product, from the same model, on the same hardware.

So there is no single per-query ratio that could be a property of the system,
independent of what was asked. The claim is not merely unsupported — as
constructed, it has no truth value to support.
```

### Critique E — someone who has actually metered it

> **Mode:** `Experiential` · **Species:** `BoundaryCritique`

```
I run inference capacity and I read our own PDUs. Across our fleet, per-request
draw varies by more than two orders of magnitude depending on model size, batch
size, context length, and whether the request was served from cache. Batching
alone moves it by 10x or more, and batching efficiency depends on traffic shape,
which changes hour to hour.

I am not disputing anyone's arithmetic. I am saying that the quantity this claim
names is not one I can reproduce a single value for, and I have the meter.
```

### Critique F — the abstraction doesn't match the experience

> **Mode:** `Phenomenological`

```
I use these systems for hours a day and "a query" does not correspond to
anything in how I actually use them. I do not issue queries. I have a
conversation that runs forty exchanges, thirty of which exist only to correct
the previous one, and the ones that matter are the long ones. Whatever the
per-query figure is, the unit it counts is not a unit of my usage — and I
suspect it is not a unit of anyone's.
```

**Talking point here:** point at the five mode labels on screen. *"None of these
is a like or a dislike. You cannot sum them. The methodological objection and the
lived-experience objection are both real and they are not the same kind of thing,
so the protocol keeps them as different kinds of thing — permanently, in the
data, not just in the UI."*

---

## Act 3 — Critique the critique (scale invariance)

This is the move that surprises technical audiences. Target Critique A itself.

> **Target type:** `Critique` (not `Claim`)
> **Mode:** `Logical` · **Species:** `ProvenanceCritique`

```
This is right about the ratio and wrong about de Vries, and the overreach matters.
de Vries (2023) is a peer-reviewed, bottom-up estimate that states its own
assumptions and its own uncertainty. Its weakness is that those assumptions are
load-bearing and unvalidated — which is a BoundaryCritique, not a
CitationLaunderingCritique. "The assumptions are contestable" and "the source
does not contain the claim" are different failures, and only the second one is
laundering.

Collapsing them makes the correction harder to trust than the thing it corrects,
which is how good debunkings become the next round's bad citation.
```

**Talking point:** *"The correction is not privileged. It is an entry like any
other, and it just got corrected. This is what it means for `target` to accept a
Critique, a Constitution, a Membrane, or a species — the operation is the same at
every scale."*

---

## Act 4 — Retract, and watch the record get stronger

Retract Claim 1.

**Reason:**

```
I no longer stand by this. The two figures in the ratio were taken at different
measurement boundaries, a decade and several hardware generations apart, and the
source I cited repeats the comparison rather than establishing it. Publishing it
at High confidence was the larger error. What I believe now is in the
replacement.
```

**Replacement claim** — publish this first so you can point the retraction at it:

> **Domain:** `ComputeEnergy` · **Confidence:** `Moderate`
> **Tags:** `llm-inference, per-query-energy, operator-measurement`

```
The best current operator-published figure for AI text inference — Google's
August 2025 measurement of a median Gemini text prompt at roughly 0.24 Wh and
0.26 mL of water at the facility boundary — is the same order of magnitude as
the 0.3 Wh Google published for a search in 2009. The claim that a
conversational AI request costs an order of magnitude more energy than a web
search is therefore not supported by the best available measurement, though the
two figures are still not measured identically.
```

**Evidence:** Type `Study` · `Google, "Measuring the environmental impact of delivering AI at Google scale" (August 2025)` · URL to the report.

Then immediately critique the replacement, so nobody thinks the corrected claim
is now sacred:

> **Mode:** `Evidential` · **Species:** `ProvenanceCritique`

```
Two things this figure cannot carry. First, "median" is not "mean," and the
distribution is what the argument is about: reasoning models and long-context
requests live in the tail, and a median is specifically the statistic that hides
a tail. Second, only the operator can see this meter. That is not an accusation,
it is a structural fact about the measurement, and it is why this domain requires
disclose_operator_affiliation. Accept the figure and note that it is unaudited.
```

**Talking point — this is the emotional peak of the demo, take your time:**

*"Nothing was deleted. The wrong claim is still there, still readable, still
attributed, with its four critiques and the author's own reason for abandoning
it. On every platform you use, the correct outcome here is that the bad number
quietly disappears and the person who spread it never mentions it again. Here the
record of being wrong is a permanent, public, structured asset — and the graph is
now more informative than if the claim had never been posted."*

---

## Act 5 — The other three claims (post before the demo; use them for Q&A)

### Claim 3 — the one that survives

> **Confidence:** `High` · **Tags:** `datacenter-load, projections, lbnl`

```
US datacenters consumed roughly 4.4% of national electricity in 2023, and are
projected to reach between 6.7% and 12% by 2028.
```
**Evidence:** `Study` · `Lawrence Berkeley National Laboratory, "2024 United States Data Center Energy Usage Report" (December 2024)`

**Critique** — `Methodological` / `BoundaryCritique`:
```
The 6.7-12% is a scenario range, not a confidence interval. The low and high
cases assume different accelerator shipment volumes and different utilization,
and the report does not assign them probabilities. Quoting a midpoint as "the
projection" converts a spread of futures into a point estimate the authors
explicitly declined to make.
```
*Use this to show a claim that takes a critique and stays standing. Not everything
here ends in a retraction.*

### Claim 4 — the infrastructure claim

> **Confidence:** `Tentative` · **Tags:** `grid, interconnection, transformers, scaling-limits`

```
The binding constraint on AI capacity buildout through 2030 is grid
interconnection and transformer lead time, not chip supply.
```

**Critique** — `Experiential`:
```
I work interconnection studies. From inside the queue this reads as correct:
study-to-energization is measured in years in our territory, and large power
transformer quotes are coming back with multi-year lead times. The chips arrive
and sit. What I cannot tell you is whether that generalizes — I see one queue.
```

**Critique** — `Methodological` / `MarginalVsAverageCritique`:
```
"The grid" is not one object and the claim needs it to be. ERCOT, PJM and MISO
have different queue reform status, different curtailment rules, and different
tolerance for large flexible load. More importantly, self-supply routes around
the queue entirely — a constraint you can buy your way out of with on-site
generation is a cost, not a binding constraint. Restate this per-interconnection
and it may well hold; stated globally it is not checkable.
```

### Claim 6 — where the cost actually lands

> **Confidence:** `Tentative` · **Tags:** `siting, on-site-generation, air-quality`

```
Datacenter load growth is increasingly met by on-site generation that bypasses
the interconnection queue, which moves the cost from ratepayers onto the host
community's air quality.
```

**Critique** — `Phenomenological` / `LocalIncidenceCritique`:
```
I live near one of these sites. The aggregate percentage figures in this domain
describe nothing I experience. What I experience is turbine noise, an air permit
process I found out about after it was underway, and a set of numbers about
national electricity share that are all true and none of which are about me.
That gap is not a rounding error in the analysis. It is the whole of what
happened here.
```

**Critique** — `Methodological` / `RatepayerIncidenceCritique`:
```
Half right, and the missing half changes the conclusion. On-site generation does
move capacity cost off the rate base. But where a facility also takes utility
power, transmission upgrade costs are frequently socialized across all ratepayers
under the interconnection agreement, so "bypasses the queue" and "ratepayers
don't pay" are separate questions. Who pays is determined by the rate case, not
by whether there is a turbine on the property.
```

### Claim 7 — the cross-domain one (this is the crypto moment)

> **Confidence:** `Tentative` · **Tags:** `proof-of-work, cross-domain-comparison, media-attention`

```
Bitcoin mining consumes more electricity annually than all global AI datacenter
workloads combined, and receives a small fraction of the scrutiny.
```

**Critique** — `Methodological` / `BoundaryCritique`:
```
These two numbers are outputs of incompatible estimators, so their ratio is not
a measurement of anything. The Bitcoin figure (Cambridge CBECI) is bottom-up:
observed network hashrate divided by an assumed distribution of miner hardware
efficiencies. The AI figure is top-down: facility power from utility and operator
reporting, with AI's share apportioned by assumption. Comparing them compares two
estimation methodologies. Neither number is wrong. The comparison is not a number.
```

**Critique** — `Evidential`:
```
The claim has two halves and they need separating. The energy half is at least
the kind of thing evidence could settle, once the estimator problem above is
handled. The "fraction of the scrutiny" half has no evidence attached and no
counting rule — no coverage corpus, no time window, no definition of scrutiny.
It may well be true. As stated it is not the kind of sentence that can be false,
which in this domain is the more serious defect of the two.
```

**Talking point for a crypto audience:** *"Notice what just happened. The
protocol did not defend AI and it did not defend Bitcoin. It applied the same
boundary standard to both, in the same breath, and it told the person making the
pro-crypto argument that half their claim was unfalsifiable. That is the entire
value proposition. If it only ever agreed with you, it would be worth nothing to
you."*

---

## The 90-second version

If you have one minute with a stranger, do only this:

1. Post Claim 1 at **High** confidence. "You have read this number."
2. Show Critique A. "Here is where it came from. Three sources, none of which says it."
3. Retract. "Nothing was deleted. The author said, on the record, why they were wrong."
4. Point at the five mode labels. "And none of that was a downvote."

---

## Two things to say when asked

**"Isn't a critique just a fancy dislike?"**
Show `CritiqueMode`. Five fixed receptor types, non-fungible by construction —
they cannot be summed into a score because they are not the same kind of
quantity. Then show the domain's `critique_species` tree: the five modes are
universal, but *this* domain evolved `CitationLaunderingCritique` and
`ChipVsFacilityCritique` because that is what its discourse actually needed.
Compare `domains/climate.json` and `domains/nutrition.json` — different fields,
genuinely different taxonomies.

**"So how do you stop bad actors?"**
Point at the distinction the protocol is careful about and most platforms are
not: every critique above **disagrees with content**. None of them accuses anyone
of bad faith. That is a separate entry type — `AntibodyPattern`, with a fixed
vocabulary (`SpamFlood`, `SybilCluster`, `Plagiarism`, `CoordinatedManipulation`,
`Impersonation`), a required written rationale, and a hard rule that it can only
ever target an *entry*, never an agent. You cannot use it to mark a person.
Disagreeing with a claim is not an accusation, and an accusation is not a claim
that the content is false. Deliberately don't stage a fake accusation in the
demo — the fact that thirteen critiques happened without needing one *is* the
demonstration.

---

## Before you demo: verify these numbers

The demo's own thesis is that figures must trace to primary sources, so it would
be a poor look to demo it on unchecked figures. Re-confirm each against the
primary source at demo time:

| Figure | Primary source to check |
|---|---|
| ~2.9 Wh per ChatGPT request; 0.3 Wh per search | IEA *Electricity 2024*; de Vries 2023 (*Joule*); Google's 2009 official blog post |
| The "10x" / cost-vs-energy slippage | The 2023 Reuters interview quoting Alphabet's John Hennessy |
| ~0.24 Wh, ~0.26 mL median Gemini text prompt | Google, *Measuring the environmental impact of delivering AI at Google scale* (Aug 2025) |
| 4.4% of US electricity in 2023; 6.7–12% by 2028 | LBNL, *2024 United States Data Center Energy Usage Report* (Dec 2024) |
| Bitcoin annual consumption | Cambridge Bitcoin Electricity Consumption Index, current reading and its methodology page |

If a figure has moved, that is not a problem for the demo — update the claim and
say so. A domain whose numbers are pinned to a document from two years ago is
exactly the thing `StaleBaselineCritique` exists to name.
