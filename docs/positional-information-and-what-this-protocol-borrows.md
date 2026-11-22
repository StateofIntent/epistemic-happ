# Positional information, and what this protocol actually borrows

**Written 2026-11-22.** Analysis of an external research synthesis against this
repository's biological borrowings, prompted by a Friston/Levin exchange on
"platonic ingression."

**Nothing here is a row.** Two `[D]`s fall out and are recorded at the bottom as
decisions *not* taken. `docs/open-work.md` §0 was deliberately not edited —
opening rows for things already analysed is what row 7.40 did.

**CITATION CONVENTION, AND IT CAUGHT A REAL ERROR IN THIS FILE'S FIRST DRAFT.**
Every citation below names a **heading, rule or symbol**, with any line number
given as a `~:NNN` convenience rather than as the identifier. This is checkpoint
0b's lesson in another costume — *a bare SHA is not an address* — and **a bare
line number is not one either**: nothing in this repository drift-checks
`docs/*.md` (`scripts/check-prose-claims.mjs` reads `README.md`, `SPEC.md`,
`READINESS.md`, `SECURITY.md` and `docs/open-work.md`, and nothing else), so a
line citation here rots silently. The first draft cited `fixed-core.md:177` and
`:196` in a list beside rule 5; **they are inside rule 4**, which is marked
ENFORCED where rule 5 is WRITTEN ONLY. Naming the anchor forced the check that
found it.

---

## 0. The source documents, and their provenance

**`ecm-morphogenesis-synthesis.md`** — **not in this repo**, and deliberately
not vendored into it; it lives in the author's own working directory. ~690
lines, ~9,300 words. Scope: how undifferentiated cells relate to growth and
development; what governs ECM morphology, quantity and dimension in adult
mammals; which physical and molecular inputs can and cannot change it.

**PROVENANCE MATTERS AND I GOT IT WRONG ONCE.** That file is a **compressed
summary of a much longer cited discussion**, produced to be fed into a fresh
session cheaply. **The citations were stripped in compression; the numbers were
not.** My first review's headline finding was "no citations anywhere" — which
was a criticism of the compression, not of the work, and was withdrawn.

**The real hazard in that artifact is worth recording, because this repository
will produce the same thing:** a summary that drops provenance and keeps
precision reads with full confidence and zero traceability, and **nothing in it
marks which claims were well-sourced upstream and which were inferences the
discussion made.** The precision survived and the confidence signal died. Cost
to prevent: bare author-year is ~3 tokens a claim, ~450 tokens against 9,300
words.

**Second source:** a multiscale **mechano-chemo-biological coupling** review,
Tsinghua / Sun Yat-sen / Tianjin, *Acta Mechanica Sinica*, July 2025,
`10.1007/s10409-025-25315-x`. Three coupling modes: mechano-chemical feedback,
chemo-biological cascades, mechano-biological remodelling. **It is NOT about
Friston or Levin** — no free energy, no Markov blankets, no top-down precision.
It was offered alongside the FEP argument and supports a different claim.

**Third source:** a posted exchange arguing that Levin's *platonic ingression*
is better described by a scale-invariant free-energy architecture — nested
Markov blankets, higher scales coarse-graining and sending down
precision-weighted predictions, *"the free lunch is real"* — plus Levin's
*"I don't think minds are made … what you make are interfaces."*

---

## 1. What this repository actually borrows, measured

Method, so it is reproducible and so its defect is visible:
case-insensitive substring counts over `SPEC.md` / `README.md` /
`docs/fixed-core.md`, 2026-11-22.

| borrowed from | terms | SPEC / README / fixed-core |
|---|---|---|
| **immunology** | `membrane` | 144 / 162 / 0 |
| | `antibody` | 31 / 32 / 0 |
| **neurology** | `conductance` | 44 / 82 / 3 |
| | `synaptic` | 28 / 67 / 0 |
| **ecology** | `species` | 92 / 96 / 0 |
| | `secretion` | 3 / 2 / 0 |
| **autopoiesis** | `metabolis*` | 9 / 8 / 0 |
| | `autopoie*` | 2 / 4 / 2 |

**THE COUNTS ARE INFLATED BY IDENTIFIERS AND SHOULD NOT BE READ AS PROSE
USAGE.** `Membrane`, `CritiqueSpecies` and `SynapticLink` are entry and link
type names, so most of those hits are the type being referred to rather than
the metaphor being reasoned with. The table measures **vocabulary presence**,
nothing more.

**The zeros are the finding, and they are clean** (no identifier confound,
because no such identifier exists):

> **`morphogen`, `attractor`, `setpoint`, `homeostat`, `niche`, `organism`,
> `tissue` — ZERO occurrences across all three files.**

**This protocol borrows from immunology, neurology and ecology, and borrows
NOTHING from developmental biology.** The entire positional-information,
morphogenesis and setpoint vocabulary is absent — which is precisely the domain
the ECM synthesis covers and the domain the Friston/Levin argument is conducted
in. `README.md` §1 *What This Is* calls the whole system an *"epistemic nervous
system"* (~:44); nothing calls it a developing one.

**Mostly a discipline rather than a gap**, and §4 below is why.

---

## 2. The one borrowing that is load-bearing, and it is not in the vocabulary

The ECM synthesis's §2.3 result, which is the best-argued thing in it:

Acoustic and electromagnetic patterning face an inescapable trade —
resolution ≈ λ/2 while attenuation ∝ d/λ. One parameter, two consequences,
opposite signs. Reaction–diffusion does not, because **there is no attenuation
budget: the field is locally regenerated, every cell a source.** A travelling
wave decays because energy left one emitter. Resolution and spatial extent
therefore **decouple completely**, which is why biology's patterning carriers
are chemistry and membrane voltage rather than sound or light.

Now this repository's settlement design, from the integrity zome's own header
(`dna/integrity/src/lib.rs`, the SETTLEMENT section): §7's **Invariant 10 is
that the system does not compute truth**, and settlement is instead *"a named
agent's declared policy, applied to a named set of inputs, [where] anybody can
recompute it."*

> **Positional information can only be carried by a field regenerated locally at
> every point, because that is the only kind whose resolution and extent
> decouple. Epistemic position can only be computed locally by each reader from
> named inputs, because that is the only kind nobody has to trust. SAME
> STRUCTURAL REASON: a signal broadcast from one place attenuates and must be
> trusted; a signal regenerated at every point does neither.**

**That is the real borrowing, it is correct, and the repository has it without
having the word for it.** It is better grounded than any of the immune-system
metaphors in the README, and it is the sentence to reach for when asked what
biology this protocol actually takes from.

---

## 3. The FEP framing — where it meets the evidence, and where it does not

### 3.1 FEP is a description language, not a carrier

The post's concrete commitment is *"look for measurable top-down precision
signals, changes in blanket statistics, and free-energy gradients that precede
the 'free' structure."* Falsifiable in principle — but **measurable as what?**
A descending precision-weighted prediction must be instantiated in some
physical quantity or it does no causal work in tissue.

**The ECM synthesis's §9 is the audit of exactly that, and it returns a
two-item list: chemistry and voltage.** Everything else fails on penetration,
resolution or payload — sound (λ/2 coupled to d/λ), light (the *pattern* dies
at ~300 μm even where photons do not), static magnetism (ruled out twice),
particle beams (geometry solved, payload is ionisation), biophotons (~14 orders
too weak), quantum coherence (parameter-setter only).

> **Any top-down precision signal doing morphogenetic work must be a morphogen
> gradient or a bioelectric pattern, because those are the only two fields whose
> resolution and spatial extent decouple — and they decouple because they are
> locally regenerated.**

**That is what turns the FEP claim from a promissory note into a programme**,
and it is a collaboration rather than a critique: the formalism says *look for
descending precision*, and the carrier budget says *there are exactly two places
it can be*.

### 3.2 The tension: the free lunch against the setpoint asymmetry

The post says **"The free lunch is real."** The ECM synthesis is ~64KB of
evidence that it is not: setpoints are *"easy to fall below and impossible to
exceed"*, the asymmetry is **selected-for** rather than an engineering gap (a
control system whose job is to stop growth has its brakes guarded), the only
route to raising a growth setpoint is oncogenesis, and plasticity trades off
against complexity — *"the inability to re-specify is the cost of holding a
specification."*

**FEP predicts that rigidity, and elegantly** — adult tissue at NESS with high
precision on its own setpoints is exactly a system that refuses
re-specification. **That is a better argument than the free-lunch one and the
post does not make it.** But the two cannot both be load-bearing: either
high-scale constraint is **tight**, which explains why adult ECM cannot be
re-specified and why acromegaly delivers more tissue in the wrong places, or it
is **generous**, which is what unpaid-for competency needs.

### 3.3 Scale-invariance of a formalism is not scale-invariance of a mechanism

*"Make that architecture scale-invariant from Planck ↔ Cosmic scales."* The
standard objection lands here, and it is the one to expect in public: a
formalism that fits at every scale is suspected of being unfalsifiable.

**§2.3 is the answer, and it is stronger than a defence because it is a
demarcation:** resolution and extent are coupled for propagating fields and
decouple **only** for locally regenerated ones. So scale-invariance in the
physics is false **and one can say exactly where it breaks and why**
(λ = √(D/k)). Conceding that the carriers are not scale-invariant while the
description is costs nothing and removes the objection's grip.

### 3.4 Select, not author — the middle position both sides step over

ECM synthesis §2.4: **"A uniform perturbation to a system with discrete
attractors can only shift which attractor you land in. It cannot author a new
one."** The Chladni argument: a plate driven by a single spatially-uniform
scalar produces a pattern because **the pattern is already in the plate** — its
geometry and boundary conditions determine a discrete eigenmode catalogue and
the driving frequency merely *selects*. The biological substitution is
wavelength for frequency.

Applied to Levin's flagship planaria result — brief, **uniform**, non-spatial
gap-junction blockade producing a stable alternate body plan at ~25%, heritable
through repeated amputation with a wild-type genome, not encoded in tissue
structure, marker expression or stem-cell distribution — the reading is
**attractor selection, not authoring.** The synthesis's own §12.1 records its
author conceding ground from *"form is computed, not stored"* to *"a setpoint
within a constrained repertoire."*

> **You do not need a transcendent realm, because the mode catalogue is already
> in the domain's geometry and boundary conditions. But the descending signal
> can only select from a repertoire the lower scale already holds.** Neither
> side in the exchange is saying this, and it is the strongest position
> available.

---

## 4. The architectural tension with this repository, stated fairly

The post's architecture — *"higher morphological/temporal scales coarse-grain
information and send it downward as precision weighted predictions"*, lower
scales *"steered by precision estimates that originated higher up"* — is a layer
above estimating precision for a layer below.

**This repository has refused that shape three times, on the record:**

- **`docs/fixed-core.md`, rule 4** — *Every threshold has an owner, and every
  owner can say `None`*, marked **ENFORCED** — whose discussion carries
  **"So a nervous system is allowed and a homunculus is not"** and names
  MAPE-K's *managed element* as *"the homunculus, architecturally"* (~:177,
  ~:196). **The test sits inside the one rule that is actually enforced, which
  strengthens the point rather than weakening it.**
- **`docs/fixed-core.md`, rule 5** — *A reflex acts only on its own substrate,
  from an enumerated set, at a rate it does not set*, marked **WRITTEN ONLY**
  (~:203).
- **`README.md`, "Where this is up to"** — **"ACTIVE, not autopoietic. The DNA
  still does nothing on its own clock"** (~:1809). Item 22 DECIDED: no
  autonomous write, and Invariant 9, *imported from autopoiesis*, stays
  unsatisfied **by choice**.

**THE FAIR COUNTER, WHICH SHOULD BE STATED BEFORE THE OBJECTION:** nested
Markov blankets are **not** a homunculus. Every level minimises its own free
energy, and "top-down" names a coupling, not a command. On that reading FEP and
this protocol agree, and rule 5 reads as a Markov-blanket condition written in
English.

**What remains is a language problem with teeth.** *"Steered by precision
estimates that originated higher up"* is controller phrasing, and controller
phrasing is what `fixed-core.md` exists to refuse. The distinction between a
nested homeostat and a managed element is the whole content of rule 4's
discussion, and it is not visible in the post's wording.

---

## 5. Levin's interfaces, and the constraint his framing is missing

*"I don't think minds are made — what you make are interfaces."*

ECM synthesis §7.3 is the built version: a decellularised scaffold retains
lamination, fibre orientation, vascular channels and mechanical anisotropy, so
**"the positional information lives in the material. Cells never need to know
where they are; the scaffold tells them by physically being that shape."** Its
own phrase: *"you do not build a compiler; you ship a pre-compiled binary."*

**§7.4 adds a constraint Levin's framing does not state.** Every method that
produces structure works **ex vivo** — micropatterning needs a fabricated
adhesive disc of defined diameter, synthetic-circuit self-organisation needed
*"dissociated cells in low-adhesion wells with no competing prior pattern"* —
because **boundary conditions can only be controlled outside the body.**

> **In interface language: you cannot install a new interface into a system that
> already has one running.** The adult organ's existing geometry *is* the
> incumbent interface, and it is the thing a new one would have to override.

**Corollary for dimension, worth keeping separate from the rest:** to specify a
*new* size you fabricate a template at that size and populate it. That is
**manufacture, not growth.**

---

## 6. The two corrections this analysis produced, and the class they belong to

Both were found by checking the synthesis against external sources.

**(a) A universal with approved counterexamples.** *"There is no depositional
drug class, anywhere, for any tissue."* **False** — teriparatide, abaloparatide
and romosozumab are approved osteoanabolic agents, and romosozumab's documented
mechanism is specifically dual (raises formation, lowers resorption). Bone is a
mineralised collagen matrix, i.e. an ECM tissue. **The scoped version is both
true and stronger**, because the synthesis's own §8.3 explains the exception:
periosteum retains a cambium progenitor layer. *The exception proves the
progenitor rule.*

**(b) An assisted figure presented as a bare one.** *"~85–95% for subcutaneous
injection"* is the **Matrigel-assisted** teratoma rate. Bare subcutaneous is
**25–40%**; intramuscular 12.5%, intratesticular 60%, sub-renal capsule 100%.

**AND (b) CARRIED A PAYLOAD THE CORRECTION SURFACED, WHICH IS WORTH MORE THAN
THE CORRECTION.** Matrigel-dependence is **evidence for the scaffold thesis,
from the opposite direction**: supplied matrix is a *prerequisite* for
pluripotent cells to engraft at an adult site at all — but Matrigel is
**isotropic**, so it supplies **permissiveness, not pattern**, and the outcome
is still a teratoma. **Matrix necessary, nowhere near sufficient.**

And the site range separates two claims the draft had fused: formation rate
spans **12.5% → 100%, roughly eightfold, with no change in the cells**, while
the teratoma stays disorganised at every site. So *"the adult environment
supports growth"* and *"the adult environment supplies positional
information"* are **independent claims, and the second fails even where the
first is most emphatically true.**

**That lands inside the synthesis's own §1 taxonomy for the first time.** Site
and Matrigel both track vascularity and substrate support; both are **Dose**
(scalar magnitude), neither is a **Carrier**. So: **teratoma formation is
dose-gated; teratoma composition is position-gated.** An eightfold rate range
with no compositional change is what turning the dose knob looks like on a
system whose position-gated output nobody supplies.

### 6.1 The class, and why tightening a quantifier returns explanatory work

Classifying §12.1's nine logged corrections by failure mode — **method
declared, because this is interpretive** — five are unambiguously
quantifier/scope failures (*"only in Drosophila"*; *"false as a general
claim"*; *"too strong"*; a verdict softened to a risk signal; *"wrong, and
dated"*, i.e. scope in time), one is arguable (an overbroad dichotomy), three
are other (a conflation, a factual error, an imprecision). **With the two above:
5 of 11 strictly, 7 of 11 generously. The dominant class.**

**CAUTION, AND IT IS THE SAME DENOMINATOR DEFECT THIS REPOSITORY HAS NOW SEEN
TWICE** (`READINESS` §3's noticed-occurrences count; row 7.40's skipped jobs):
that log holds corrections somebody **noticed**, and a quantifier overreach is
unusually easy to notice — one counterexample kills it, where a subtle factual
error can sit for years. **So 7/11 is probably an OVERESTIMATE of the true
share, and the supported claim is "the most-CAUGHT class", not "the
most-COMMITTED class."**

The mechanism, which is why this is not a coincidence of a small sample:

> **A universal claim is a claim with the mechanism factored out.** It has no
> free parameter, so it cannot say *which cases* or *why*. Scoping forces you to
> name the discriminating variable, and the discriminating variable is the
> explanatory content. *"No depositional drug class anywhere"* explains nothing;
> *"none for soft or dense fibrous tissue, because bone alone retains a cambium
> layer"* names the mechanism. *"85–95%"* names nothing; *"25–40% bare, 80–100%
> with matrix"* names matrix as the variable — **and the variable IS the
> finding.** Tightening a quantifier does not weaken a claim; it restores what
> the quantifier had absorbed.

### 6.2 This protocol has no receptor for that class

`CritiqueMode` — the `pub enum CritiqueMode` declaration in
`dna/integrity/src/lib.rs` (~:525) — has five variants, with these glosses in
the code:

| mode | gloss |
|---|---|
| `Experiential` | "I tried this and..." |
| `Methodological` | "The study design is flawed because..." |
| `Logical` | "This contradicts itself because..." |
| `Evidential` | "This source doesn't say what you claim..." |
| `Phenomenological` | "My subjective experience differs because..." |

**Correction (b) is `Evidential`. Correction (a) fits none of the five** — it
misreads no source, contradicts nothing internally, and involves no study
design. The defect is that **the quantifier exceeds the surveyed domain**: true
of everything the author examined, false of something they did not.

**The repository knows the failure mode in prose and nowhere else:**
`overclaim` 5/3, `overstat*` 2/6, `too strong` 0/5 across SPEC/README —
and **zero** occurrences of `quantifier` or `overbroad`, zero in the integrity
zome. No seeded `CritiqueSpecies` matches scope, quantifier, universal or
overgeneralisation.

**The two candidate homes have very different prices, and that is the useful
part.** A sixth `CritiqueMode` variant edits the integrity zome — a
position-indexed enum inside the DNA hash, where *"every edit to this file forks
the network."* A `CritiqueSpecies` is an ordinary entry type created at runtime
through `create_critique_species`, linked by `CritiqueToSpecies`, **extensible
without forking anything.** That is what the extensible taxonomy is for.

---

## 7. Two `[D]`s, recorded as not taken

- **[D] Seed a scope/quantifier `CritiqueSpecies`?** The gap in §6.2 is real and
  the fix is free (runtime entry type, no fork). **Blocked on: a decision about
  whether the first seeded species should come from the protocol's own authors
  rather than from use** — a taxonomy seeded by its designer is a taxonomy that
  tells participants what to find. That tension is not resolved here and is not
  mine to resolve.
- **[D] Does the dose-gated / position-gated cut apply to this protocol's own
  readings?** §9.4 of the synthesis — *"decompose any morphological target into
  position-gated and dose-gated components; dose-gated features need only a
  scalar, and a scalar is deliverable"* — is the sharpest tool in it. This
  protocol has both kinds of quantity: scalars (`get_effective_conductance`,
  `get_local_tension`, `get_discourse_health`, `SettlementStatus`) and genuinely
  positional readings (`get_grounding_path`, `critiques_unseen_by`, the critique
  graph itself). **Blocked on: a decision about whether the distinction earns a
  place in the protocol's vocabulary, given §1's finding that the whole
  developmental register was kept out deliberately.**

---

## 8. Confidence tiering

**Will not move:**
- A spatially uniform field carries zero positional information.
- Resolution and extent decouple only for locally regenerated fields; the
  λ/2-versus-d/λ coupling for propagating fields is the wave equation.
- `CritiqueMode` is in the integrity zome, so a sixth variant forks the network;
  `CritiqueSpecies` is a runtime entry type and does not.
- Teriparatide/abaloparatide/romosozumab are approved osteoanabolic agents.

**Measured here, reproducible, method stated:**
- The §1 vocabulary counts, with the identifier confound named.
- The §6.1 classification — interpretive, and biased toward over-counting.

**Argument, not measurement — could be wrong:**
- §2's claim that the locally-regenerated condition and local recomputability
  are the *same* structural property. It is an analogy with a stated mechanism,
  not a derivation.
- §3.2's claim that the free lunch and the setpoint asymmetry cannot both be
  load-bearing. Someone could argue the scales differ.
- §4's reading of the post's phrasing as controller language. The fair counter
  is stated; this is a dispute about wording, and wording is what was offered.
