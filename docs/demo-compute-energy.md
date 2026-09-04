# Demo runbook: "The number that outran its methodology"

Entry-by-entry script for the `ComputeEnergy` domain, in the exact order the
mobile UI requires. Every fenced block is a single field value — paste it whole.

Part A is posted **before** the audience arrives. Part B is performed live.

---

## What the mobile UI can and cannot do

Read this before running the script; it is why the order below is what it is.

| Constraint | Consequence for the script |
|---|---|
| The founding form takes **one** promise (single text input, `modality: null`), but any number of required promises (one per line). | The four promises in `domains/compute-energy.json` become one founding promise plus four required ones. Use `bootstrap.mjs` instead if you want the full constitution. |
| The species parent dropdown offers **roots only** — the tree is two levels. | Create all four roots first, then the six children. This taxonomy is already two levels, so nothing is lost. |
| `required_evidence` is a single-line `<input>`. | One evidence requirement per species. |
| The critique form hardcodes `target_type: 'Claim'`. | **Critique-of-critique is not reachable from this UI.** See Step B6 for how to demo it anyway. |
| The retraction form hardcodes `replacement_claim: null`. | The retraction cannot link its replacement. The reason text below names it explicitly instead. |
| Critiques are capped at **20 per agent per rolling hour**, and each also spends a synaptic-link unit against the same budget. | Part A has 8 critiques and Part B has 6. Post Part A at least an hour ahead, or run from a second conductor. Two agents is better demo staging regardless — an agent critiquing only its own claims is not a convincing graph. |

Setup, if you have not already:

```bash
scripts/sandbox.sh start
```

Or skip Steps A1–A2 entirely and bootstrap the domain from the CLI:

```bash
cd domains && npm install && node bootstrap.mjs compute-energy.json
```

---

# PART A — Before the demo

## Step A1 · Found the domain

**Domains tab → "Found a domain"**

*What you promise* (single field):
```
state_measurement_boundary
```

*Domain name:*
```
ComputeEnergy
```

*What is this domain for?*
```
Claims about the electricity, water, and grid impact of computation — AI training and inference, datacenter siting, and proof-of-work — where the dominant failure mode is a real measurement quoted outside the boundary it was taken at. Stating the measurement boundary and tracing a figure to its primary source are first-class norms here, not background assumptions.
```

*Required promises, one per line:*
```
validate_claims
state_measurement_boundary
trace_figure_to_primary_source
disclose_operator_affiliation
```

---

## Step A2 · Build the taxonomy

**Taxonomy tab → "Propose"**, ten times. **Roots first** — the parent dropdown
only offers roots, so a child cannot be created before its parent exists.

### The four roots (parent: *No parent (a new root type)*)

**A2.1**
| Field | Value |
|---|---|
| Name | `BoundaryCritique` |
| Evidence | `A statement of what the disputed figure actually measures: which stage (training or inference), which enclosure (chip, rack, or whole facility), and over what unit of work` |

**A2.2**
| Field | Value |
|---|---|
| Name | `ProvenanceCritique` |
| Evidence | `The chain of citation from the claim back to a primary measurement, or the specific link at which that chain breaks` |

**A2.3**
| Field | Value |
|---|---|
| Name | `LocalIncidenceCritique` |
| Evidence | `The specific facility, ratepayer class, watershed, or airshed where the cost lands, and how it differs from the aggregate figure being quoted` |

**A2.4**
| Field | Value |
|---|---|
| Name | `ReboundCritique` |
| Evidence | `The efficiency gain being claimed, and the total-consumption series over the same period` |

### The six children

**A2.5** — parent: *Child of BoundaryCritique*
| Field | Value |
|---|---|
| Name | `TrainingVsInferenceCritique` |
| Evidence | `Which stage the cited measurement covers, and the figure for the other stage where the claim treats them as one number` |

**A2.6** — parent: *Child of BoundaryCritique*
| Field | Value |
|---|---|
| Name | `ChipVsFacilityCritique` |
| Evidence | `The PUE applied, or an explicit statement that the figure excludes cooling and facility overhead` |

**A2.7** — parent: *Child of BoundaryCritique*
| Field | Value |
|---|---|
| Name | `MarginalVsAverageCritique` |
| Evidence | `The grid emissions or capacity factor used, and whether it is an average or a marginal factor` |

**A2.8** — parent: *Child of ProvenanceCritique*
| Field | Value |
|---|---|
| Name | `CitationLaunderingCritique` |
| Evidence | `The primary source, quoted, showing it does not contain the figure attributed to it` |

**A2.9** — parent: *Child of ProvenanceCritique*
| Field | Value |
|---|---|
| Name | `StaleBaselineCritique` |
| Evidence | `The date and hardware generation of the underlying measurement, and a current figure for the same quantity where one exists` |

**A2.10** — parent: *Child of LocalIncidenceCritique*
| Field | Value |
|---|---|
| Name | `RatepayerIncidenceCritique` |
| Evidence | `The tariff, rate case, or interconnection agreement that determines who actually pays for the new load` |

---

## Step A3 · Claim — datacenter share (the one that survives)

**Claims tab → new claim.** Domain `ComputeEnergy` · Confidence **High**

*Content:*
```
US datacenters consumed roughly 4.4% of national electricity in 2023, and are projected to reach between 6.7% and 12% by 2028.
```

*Tags:*
```
datacenter-load, projections, lbnl
```

*Evidence* — Type `Study`
```
Lawrence Berkeley National Laboratory, "2024 United States Data Center Energy Usage Report" (December 2024).
```
*Source URL:* `https://eta.lbl.gov/publications/2024-united-states-data-center-energy-usage-report`

### A3.1 · Critique it
Mode **Methodological** · Species **BoundaryCritique**
```
The 6.7-12% is a scenario range, not a confidence interval. The low and high cases assume different accelerator shipment volumes and different utilization, and the report does not assign them probabilities. Quoting a midpoint as "the projection" converts a spread of futures into a point estimate the authors explicitly declined to make.
```

---

## Step A4 · Claim — the grid constraint

Domain `ComputeEnergy` · Confidence **Tentative**

*Content:*
```
The binding constraint on AI capacity buildout through 2030 is grid interconnection and transformer lead time, not chip supply.
```

*Tags:*
```
grid, interconnection, transformers, scaling-limits
```

### A4.1 · Critique
Mode **Experiential** · Species **BoundaryCritique**
```
I work interconnection studies. From inside the queue this reads as correct: study-to-energization is measured in years in our territory, and large power transformer quotes are coming back with multi-year lead times. The chips arrive and sit. What I cannot tell you is whether that generalizes — I see one queue.
```

### A4.2 · Critique
Mode **Methodological** · Species **MarginalVsAverageCritique**
```
"The grid" is not one object and the claim needs it to be. ERCOT, PJM and MISO have different queue reform status, different curtailment rules, and different tolerance for large flexible load. More importantly, self-supply routes around the queue entirely — a constraint you can buy your way out of with on-site generation is a cost, not a binding constraint. Restate this per-interconnection and it may well hold; stated globally it is not checkable.
```

---

## Step A5 · Claim — the efficiency claim

Domain `ComputeEnergy` · Confidence **Moderate**

*Content:*
```
Continued improvement in datacenter and model efficiency will reduce the total electricity consumed by computation.
```

*Tags:*
```
efficiency, jevons, total-consumption
```

### A5.1 · Critique
Mode **Logical** · Species **ReboundCritique**
```
Per-unit efficiency and total consumption are independent quantities, and here they have moved in opposite directions. Datacenter energy per unit of compute fell sharply through the 2010s while total datacenter energy stayed roughly flat, and since 2022 per-token inference cost has fallen by orders of magnitude while total inference energy has risen. Efficiency lowers the price of compute, and lowering the price of a useful good raises the quantity demanded. The claim needs a demand-elasticity argument it does not have.
```

---

## Step A6 · Claim — where the cost actually lands

Domain `ComputeEnergy` · Confidence **Tentative**

*Content:*
```
Datacenter load growth is increasingly met by on-site generation that bypasses the interconnection queue, which moves the cost from ratepayers onto the host community's air quality.
```

*Tags:*
```
siting, on-site-generation, air-quality, interconnection-bypass
```

### A6.1 · Critique
Mode **Phenomenological** · Species **LocalIncidenceCritique**
```
I live near one of these sites. The aggregate percentage figures in this domain describe nothing I experience. What I experience is turbine noise, an air permit process I found out about after it was underway, and a set of numbers about national electricity share that are all true and none of which are about me. That gap is not a rounding error in the analysis. It is the whole of what happened here.
```

### A6.2 · Critique
Mode **Methodological** · Species **RatepayerIncidenceCritique**
```
Half right, and the missing half changes the conclusion. On-site generation does move capacity cost off the rate base. But where a facility also takes utility power, transmission upgrade costs are frequently socialized across all ratepayers under the interconnection agreement, so "bypasses the queue" and "ratepayers don't pay" are separate questions. Who pays is determined by the rate case, not by whether there is a turbine on the property.
```

---

## Step A7 · Claim — the cross-domain comparison

Domain `ComputeEnergy` · Confidence **Tentative**

*Content:*
```
Bitcoin mining consumes more electricity annually than all global AI datacenter workloads combined, and receives a small fraction of the scrutiny.
```

*Tags:*
```
proof-of-work, cross-domain-comparison, media-attention
```

### A7.1 · Critique
Mode **Methodological** · Species **BoundaryCritique**
```
These two numbers are outputs of incompatible estimators, so their ratio is not a measurement of anything. The Bitcoin figure (Cambridge CBECI) is bottom-up: observed network hashrate divided by an assumed distribution of miner hardware efficiencies. The AI figure is top-down: facility power from utility and operator reporting, with AI's share apportioned by assumption. Comparing them compares two estimation methodologies. Neither number is wrong. The comparison is not a number.
```

### A7.2 · Critique
Mode **Evidential** · Species **ProvenanceCritique**
```
The claim has two halves and they need separating. The energy half is at least the kind of thing evidence could settle, once the estimator problem above is handled. The "fraction of the scrutiny" half has no evidence attached and no counting rule — no coverage corpus, no time window, no definition of scrutiny. It may well be true. As stated it is not the kind of sentence that can be false, which in this domain is the more serious defect of the two.
```

**Part A is done. Eight critiques spent. Wait an hour, or switch agents, before Part B.**

---

# PART B — Live, in front of the room

## Step B1 · Publish the claim everyone has already read

Domain `ComputeEnergy` · Confidence **High** ← *deliberately wrong; this is the demo*

*Content:*
```
A single ChatGPT query consumes about ten times the electricity of a Google search — roughly 2.9 Wh against 0.3 Wh. At current query volumes this makes conversational AI a materially larger per-interaction load than web search, and the gap is the main reason datacenter demand is climbing.
```

*Tags:*
```
llm-inference, per-query-energy, viral-statistic
```

*Evidence* — Type `Text`
```
Comparison as it appears in the IEA's Electricity 2024 report, which is where most downstream coverage picks it up.
```
*Source URL:* `https://www.iea.org/reports/electricity-2024`

> Say while posting: **"I'm publishing this at High confidence. Watch what the network does to that."**

---

## Step B2 · Critique — the provenance chain

Mode **Evidential** · Species **CitationLaunderingCritique**
```
The figure does not have a primary source. Following it back: the IEA's Electricity 2024 repeats the comparison rather than measuring it, citing de Vries (2023, Joule, "The growing energy footprint of artificial intelligence") for the ~2.9 Wh side. That paper derives its number bottom-up from assumed request volumes and assumed server hardware — it is an estimate with stated assumptions, not a meter reading. The 0.3 Wh side traces to a Google company blog post from 2009. And the "10x" framing itself entered circulation via a 2023 remark by Alphabet's John Hennessy that an LLM exchange likely costs ten times more than a keyword search — a statement about COST, which then became a statement about ENERGY somewhere in the retelling. Three sources, none of which contains the claim as stated.
```

---

## Step B3 · Critique — the measurement boundary

Mode **Methodological** · Species **ChipVsFacilityCritique**
```
Even granting both numbers, they are not measured at the same enclosure. The ~2.9 Wh is a server-level estimate built up from hardware assumptions. The 0.3 Wh figure is a facility-level number that already includes datacenter overhead — cooling, distribution, idle. Dividing one by the other compares a chip-boundary estimate to a facility-boundary measurement and reports the result as a property of the system. Whatever the true ratio is, this arithmetic cannot recover it. State the PUE, or state that the figure excludes it.
```

---

## Step B4 · Critique — the baseline has aged

Mode **Methodological** · Species **StaleBaselineCritique**
```
The denominator is from 2009: 2009 hardware, 2009 index size, 2009 ranking stack. The numerator is from 2023 and does not name a model. A ratio whose two terms are separated by fourteen years and several process nodes is not a comparison of two technologies; it is a comparison of two eras. Both ends have moved since. Google's August 2025 measurement puts a median Gemini text prompt at roughly 0.24 Wh at the facility boundary — the same order of magnitude as the 2009 search figure this claim uses as its baseline for "cheap."
```

---

## Step B5 · Critique — the unit of work isn't shared

Mode **Logical** · Species *No specific type*
```
"Per query" is not a comparable unit across the two systems. A search returns a ranked list of roughly fixed length. A generation produces a variable number of tokens, and energy scales with that count. A thirty-token answer and a three-thousand-token answer differ by two orders of magnitude inside the same product, from the same model, on the same hardware. So there is no single per-query ratio that could be a property of the system, independent of what was asked. The claim is not merely unsupported — as constructed, it has no truth value to support.
```

---

## Step B6 · Critique — someone who has actually metered it

Mode **Experiential** · Species **BoundaryCritique**
```
I run inference capacity and I read our own PDUs. Across our fleet, per-request draw varies by more than two orders of magnitude depending on model size, batch size, context length, and whether the request was served from cache. Batching alone moves it by 10x or more, and batching efficiency depends on traffic shape, which changes hour to hour. I am not disputing anyone's arithmetic. I am saying that the quantity this claim names is not one I can reproduce a single value for, and I have the meter.
```

---

## Step B7 · Critique — the abstraction doesn't match the experience

Mode **Phenomenological** · Species *No specific type*
```
I use these systems for hours a day and "a query" does not correspond to anything in how I actually use them. I do not issue queries. I have a conversation that runs forty exchanges, thirty of which exist only to correct the previous one, and the ones that matter are the long ones. Whatever the per-query figure is, the unit it counts is not a unit of my usage — and I suspect it is not a unit of anyone's.
```

> **Stop here and point at the six mode labels on screen.** "None of these is a
> like or a dislike. You cannot sum them. The methodological objection and the
> lived-experience objection are both real and they are not the same kind of
> thing, so the protocol keeps them as different kinds of thing — permanently,
> in the data, not just in the UI."

---

## Step B8 · Critique the critique (scale invariance)

**This is not reachable from the mobile UI** — its critique form hardcodes
`target_type: 'Claim'`. Two honest ways to demo it:

**(a) Show the type, then post the text as an ordinary critique on Claim B1.**
Open `dna/integrity/src/lib.rs` on the `CritiqueTargetType` enum — `Claim`,
`Critique`, `Constitution`, `Membrane`, `CritiqueSpecies` — and say that the
operation is identical at every one of those scales, then post this as a normal
critique so the argument is at least in the graph:

Mode **Logical** · Species **ProvenanceCritique**
```
The provenance critique above is right about the ratio and wrong about de Vries, and the overreach matters. de Vries (2023) is a peer-reviewed, bottom-up estimate that states its own assumptions and its own uncertainty. Its weakness is that those assumptions are load-bearing and unvalidated — which is a BoundaryCritique, not a CitationLaunderingCritique. "The assumptions are contestable" and "the source does not contain the claim" are different failures, and only the second one is laundering. Collapsing them makes the correction harder to trust than the thing it corrects, which is how good debunkings become the next round's bad citation.
```

**(b) Post it structurally with a direct zome call**, using the entry hash of the
Step B2 critique as `target` and `"Critique"` as `target_type`. Worth doing if
the room is technical and you have a terminal on screen.

Either way the line to say is: *"The correction is not privileged. It just got
corrected."*

---

## Step B9 · Publish the replacement claim

Post this **before** retracting, so the retraction has something to name.

Domain `ComputeEnergy` · Confidence **Moderate**

*Content:*
```
The best current operator-published figure for AI text inference — Google's August 2025 measurement of a median Gemini text prompt at roughly 0.24 Wh and 0.26 mL of water at the facility boundary — is the same order of magnitude as the 0.3 Wh Google published for a search in 2009. The claim that a conversational AI request costs an order of magnitude more energy than a web search is therefore not supported by the best available measurement, though the two figures are still not measured identically.
```

*Tags:*
```
llm-inference, per-query-energy, operator-measurement, gemini
```

*Evidence* — Type `Study`
```
Google, "Measuring the environmental impact of delivering AI at Google scale" (August 2025).
```
*Source URL:* paste the report URL.

---

## Step B10 · Retract Claim B1

**Retract** on the Step B1 claim. The UI cannot link the replacement, so the
reason names it:

```
I no longer stand by this. The two figures in the ratio were taken at different measurement boundaries — a server-level estimate over a facility-level measurement — a decade and several hardware generations apart, and the source I cited repeats the comparison rather than establishing it. Publishing it at High confidence was the larger error. What I believe now is the claim I just posted on Google's August 2025 median-prompt measurement, which finds the same order of magnitude as a 2009 search.
```

> **This is the peak of the demo. Slow down.**
>
> "Nothing was deleted. The wrong claim is still there, still readable, still
> attributed, with its six critiques and the author's own reason for abandoning
> it. On every platform you use, the correct outcome here is that the bad number
> quietly disappears and the person who spread it never mentions it again. Here
> the record of being wrong is a permanent, public, structured asset — and the
> graph is now more informative than if the claim had never been posted."

---

## Step B11 · Critique the replacement

So nobody thinks the corrected claim is now sacred.

Mode **Evidential** · Species **ProvenanceCritique**
```
Two things this figure cannot carry. First, "median" is not "mean," and the distribution is what the argument is about: reasoning models and long-context requests live in the tail, and a median is specifically the statistic that hides a tail. Second, only the operator can see this meter. That is not an accusation, it is a structural fact about the measurement, and it is why this domain requires disclose_operator_affiliation. Accept the figure and note that it is unaudited.
```

---

# The 90-second version

If you have one minute with a stranger, do only Steps **B1 → B2 → B10**, then
point at the mode labels:

1. Post the claim at **High**. "You have read this number."
2. Show the provenance critique. "Here is where it came from. Three sources, none of which says it."
3. Retract. "Nothing was deleted. The author said, on the record, why they were wrong."
4. Point at the modes. "And none of that was a downvote."

---

# Why this topic

A first demo has to be immediately legible to a stranger *and* exercise the parts
of the protocol that exist nowhere else. Most topics do one or the other.

The energy cost of computation does both, because its characteristic failure is
not disagreement about values — it is a real measurement quoted outside the
boundary it was taken at. One concrete, checkable thing. And it is the same
failure in four rooms at once:

| Audience | Why they lean in |
|---|---|
| **Scientists and engineers** | The dispute is entirely measurement boundary and citation provenance — what a typed critique system is actually for. Nothing rests on the demonstrator's authority. |
| **Elon Musk / infrastructure builders** | Step A4 is a position he has argued publicly. The demo shows that claim held *Tentative*, confirmed Experientially by someone inside an interconnection queue, and narrowed Methodologically — instead of quote-tweeted. |
| **Cryptocurrency community** | Step A7. They spent a decade on the receiving end of exactly the boundary error Step B3 unwinds. Watching the protocol apply the same standard in their favour and against them in the same breath is the most credible thing it can do in that room. |
| **The general public** | B1 → B10. "Here is a number you have read, here is where it came from, here is the author saying they were wrong in a way that makes the record stronger." No vocabulary required. |

It is also not politically radioactive — nobody has to pick a side before the
demo starts, which is what makes the *method* the thing they notice.

---

# Two things to say when asked

**"Isn't a critique just a fancy dislike?"**
Show `CritiqueMode`: five fixed receptor types, non-fungible by construction —
they cannot be summed into a score because they are not the same kind of
quantity. Then show the species tree from Step A2: the five modes are universal,
but *this* domain evolved `CitationLaunderingCritique` and `ChipVsFacilityCritique`
because that is what its discourse needed. Compare `domains/climate.json` and
`domains/nutrition.json` — different fields, genuinely different taxonomies.

**"So how do you stop bad actors?"**
Point at the distinction the protocol is careful about and most platforms are
not: all fourteen critiques above **disagree with content**. None accuses anyone
of bad faith. That is a separate entry type — `AntibodyPattern`, with a fixed
vocabulary (`SpamFlood`, `SybilCluster`, `Plagiarism`, `CoordinatedManipulation`,
`Impersonation`), a required written rationale, and a hard rule that it can only
target an *entry*, never an agent. You cannot use it to mark a person.
Deliberately do **not** stage a fake accusation — that fourteen critiques
happened without needing one *is* the demonstration.

---

# Before you demo: verify these numbers

The demo's own thesis is that figures must trace to primary sources, so demoing
it on unchecked figures would be a poor look. Re-confirm each:

| Figure | Primary source to check |
|---|---|
| ~2.9 Wh per ChatGPT request; 0.3 Wh per search | IEA *Electricity 2024*; de Vries 2023 (*Joule*); Google's 2009 official blog post |
| The "10x" cost-vs-energy slippage | The 2023 Reuters interview quoting Alphabet's John Hennessy |
| ~0.24 Wh, ~0.26 mL median Gemini text prompt | Google, *Measuring the environmental impact of delivering AI at Google scale* (Aug 2025) |
| 4.4% of US electricity in 2023; 6.7–12% by 2028 | LBNL, *2024 United States Data Center Energy Usage Report* (Dec 2024) |
| Bitcoin annual consumption | Cambridge Bitcoin Electricity Consumption Index, current reading and methodology page |

If a figure has moved, that is not a problem for the demo — update the claim and
say so. A domain whose numbers are pinned to a two-year-old document is exactly
what `StaleBaselineCritique` exists to name.
