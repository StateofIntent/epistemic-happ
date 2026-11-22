# Immune effectors, and the selector that is not a position

**Written 2026-11-22.** Third companion to
`docs/positional-information-and-what-this-protocol-borrows.md` and
`docs/noesis-and-the-worth-blind-graph.md`. Same tiering, same provenance tags.

**Why it is in this repository and not only in the external synthesis:** the
finding that transfers is **a third kind of address** — neither a scalar nor a
position, but a *selector over a population* — and this protocol has three of
them and already refuses the failure mode they carry. §5 and §6.

**No rows opened. `docs/open-work.md` §0 untouched.**

---

## 0. Provenance

`[Q]` quoted from a source read this session · `[V]` verified this session ·
`[A]` this analysis's inference, reviewed by nobody · `[U]` asserted upstream
and **not** verified here.

The upstream material is an exchange about the external ECM synthesis
(see the first companion's §0 for that document's own provenance problem). **Two
details in it were explicitly flagged as background knowledge because a usage
limit interrupted verification. Both were checked here and both hold** — §1.
**One further claim in it is `[U]` and is flagged rather than repeated** — §4.

---

## 1. `[V]` The two flagged details, closed

**VCN-01 expresses PH20.** Confirmed: it carries human sperm hyaluronidase
PH20, degrading hyaluronic acid in the tumour ECM. The NCI drug-dictionary
entry is titled *"ph20 hyaluronidase expressing adenovirus vcn 01"*.

**Two corrections upward, both in the claim's favour:**

- `[Q]` *"VCN-01 treatment resulted in a dramatic decrease in the intratumoral
  hyaluronic acid content which was associated with **disruption of stromal
  collagen organization**."* `[A]` **That is the only intervention in this whole
  corpus with a measured effect on collagen ORGANISATION rather than quantity
  or stiffness** — in the destructive direction, but measured.
- `[V]` It is now `zabilugene almadenorepvec` (Theriva Biologics) and has
  **completed a phase 2 trial** in pancreatic ductal adenocarcinoma, further
  along than "in combination trials".

**Rurik et al., *Science* 2022, confirmed.** CD5-targeted lipid nanoparticles
carrying mRNA for a FAP chimeric antigen receptor, generating transient
anti-fibrotic CAR-T **in vivo**; `[Q]` *"reduced fibrosis and restored cardiac
function after injury"*, with both fibrosis and functional impairment reversed
on echocardiography in a pressure-overload mouse model, and the cells
persisting **only a few days**.

**`[U]` The percentage figures did not surface and are deliberately absent
here.** The direction and the mechanism are solid; the magnitudes are not
reachable from the sources read. *A figure reconstructed from memory is exactly
what 7.34 is about.*

---

## 2. `[A]` The synthesis has no immune row, and this is why it needs one

Its §9 modality table audits every physical input against penetration,
resolution and payload. **There is no biological-effector row at all** — no
immune, no cellular, no engineered-organism entry. The question *"can immunity
attenuate matrix?"* exposed the gap, and the answer is **yes, subtractively,
and partly in the clinic.**

Three worked instances: **oncolytic viruses engineered to degrade stroma**
(VCN-01, above); **FAP-directed CAR-T** against the matrix-producing cell
itself; and **Rurik's transient in-vivo FAP-CAR**, which is the one that matters
because it is reversible by construction and in a non-cancer organ.

---

## 3. `[A]` It has no row rather than a wrong one, and the equation says why

§8.1's three-term growth equation:

```
growth = φ(P − Y) + matched deposition of new matrix into the strained state
```

**FAP-CAR-T changes none of those terms.** It removes the cells that *perform*
the deposition term. The four existing rows — **carrier, trigger,
parameter-setter, dose** — are all **inputs to a field or to a controller.**
This is an intervention on **effectors**, which is a different kind of object.

> **So the taxonomy is a taxonomy of SIGNALS, and the synthesis never said so.
> Naming that is worth more than adding a fifth row**, because it tells a reader
> what the table can and cannot classify. The immune agents are not a missing
> row; they are a missing axis.

**And the depositional asymmetry gets sharper rather than weaker.** §8.2's rule
was *the pharmacological pipeline is all subtractive.* The corrected statement:

> **You can now remove the depositing cell population with cellular addressing
> and reversibly. There is still no way to install a depositing population with
> a chosen architecture. The rule holds WITH PRECISION TARGETING AVAILABLE ON
> ONE SIDE ONLY** — the subtractive side has a drug class *and* a cell-addressed
> agent; the depositional side has neither.

---

## 4. `[A]` The best finding: a third way to self-extinguish, and it is the only engineerable one

§2.2's secondary criterion: `[Q]` *"does the stimulus self-extinguish? Load
does — growth raises crowding, crowding triggers extrusion. Pharmacological
agonists do not, which is why they tend toward either tachyphylaxis or
neoplasia."*

**mRNA-LNP CAR-T self-extinguishes by construction.** The mRNA degrades, the
receptor stops being expressed, the cells persist days.

> **Every self-limiting intervention in that synthesis self-limits because of
> WHERE IT ACTS. This one self-limits because of WHAT IT IS MADE OF — a cargo
> with a half-life.** That is a third mechanism for satisfying §2.2, and it is
> the only one in the corpus that is **engineered rather than inherited**: load's
> self-limitation is a property of tissue geometry nobody chose, and an mRNA
> half-life is a design parameter.

### 4.1 `[U]` The omission to check before repeating any of this

**FAP is not confined to pathogenic fibroblasts.** It is reported on
bone-marrow stromal cells and in healing wounds, and FAP-directed CAR-T
toxicity — cachexia and marrow toxicity in mouse models — is a known concern in
that literature. **NOT verified in this session.** Flagged because, if it holds,
the cellular-addressing advantage is narrower than stated: **it addresses a
MARKER, and the marker is shared with cells you need.**

`[A]` Same shape as the omissions catalogued in §7 below — the countervailing
evidence sits one search away from the claim it qualifies.

---

## 5. `[A]` What transfers to this protocol: a third kind of address

The first companion recorded a live `[D]` on whether the **dose-gated /
position-gated** cut applies to this protocol's own readings. **This material
adds a third category that neither of those covers.**

| kind of address | biology | this protocol |
|---|---|---|
| **scalar / dose** | mechanical load, gravity | `get_effective_conductance`, `get_local_tension`, `get_discourse_health`, `SettlementStatus` |
| **position** | morphogen gradient, scaffold geometry | `get_grounding_path`, `critiques_unseen_by`, the critique graph |
| **selector over a population** | FAP-CAR-T: *all cells bearing this marker* | `CritiqueMode` (5 variants), `AntibodyPatternKind` (5 variants), `CritiqueSpecies` (runtime, extensible) |

> **A CAR-T addresses a cell type. It does not address a position.** For
> fibrosis that is exactly right — you want them all gone. For patterning it is
> useless, because *"all cells of type X"* carries no spatial information
> whatsoever. **A selector is not a weak position; it is a different quantity.**

`[A]` **So the `[D]` is now three-way rather than two-way**, and the third
column is the one this protocol has most of. That does not resolve the `[D]`
— still the human's — but it changes its shape.

---

## 6. `[A]` And this protocol already refuses §4.1's failure mode, by design

The FAP problem is **over-broad selection on a shared marker.** This
protocol's `AntibodyPattern` is the same selector shape — a typed flag over a
population of entries — and the integrity zome's comment records that it
**deliberately cannot target an `AgentPubKey`**, only an entry, because an
antibody naming an agent *"would function as exactly the canonical, comparative
reputation mark on an identity that Invariant #1 rules out."*

> **An over-broad selector is what FAP toxicity IS: a marker that catches cells
> you need. This protocol refused the broadest available marker — identity — in
> advance, for a reason stated in terms of Invariant 1 rather than in terms of
> selectivity. The biology supplies the cost of not refusing it.**

**The second transfer, and it is a limit rather than a convergence.** §4's
finding is a **cargo with a half-life**. This protocol cannot build one:
**everything it writes is permanent under Invariant 6**, deletion being absent
from the integrity zome rather than merely unexposed. **A self-extinguishing
write is the one shape Invariant 6 forbids.** What it has instead is read-time
computation that writes nothing — `get_effective_conductance` recomputes decay
when asked and leaves the DHT byte-identical. `[A]` **Same property by the
opposite route: nothing expires because nothing was written.** Worth holding
beside the first companion's locally-regenerated/locally-recomputable parallel,
which has the same shape.

---

## 7. `[A]` The audit that produced this, as a worked specimen for the `[D]`

The exchange began with a post claiming a 1971 case report — Bluming & Ziegler,
*Lancet*, Burkitt's lymphoma regressing during measles infection — had been
**"buried"** by medicine.

**`[V]` That word is the load-bearing claim and it is flatly false.** The
observation became the founding case of **oncolytic measles virotherapy**,
pursued for fifty years, reaching a published complete remission (Mayo Clinic,
*Mayo Clin Proc* 2014, disseminated multiple myeloma after a single intravenous
dose of **MV-NIS**) and trials in ovarian cancer, glioblastoma and head and
neck cancer. **A finding that generated a half-century programme is the opposite
of buried.**

**And the therapy is vaccine-lineage.** MV-NIS derives from the attenuated
**Edmonston** strain — the measles vaccine's lineage. `[A]` **The post used a
finding whose entire therapeutic payoff is an engineered, attenuated,
dose-controlled, tumour-targeted vaccine derivative to argue that wild infection
is beneficial.**

**Classified against the error taxonomy the second companion's §6.2 says this
protocol has no receptor for:**

| error | instance |
|---|---|
| **Scope exceeds survey** | *"buried"* — a universal negative over a literature, false on one search. And **n = 1 presented as causal**, where Burkitt's lymphoma is specifically known for occasional **spontaneous regression** documented by Burkitt himself, so a single case cannot distinguish *measles caused it* from *this tumour was among those that regress.* |
| **Selective sampling** | fifty years of follow-up; the vaccine lineage; that measles in an **immunocompromised** child — which a lymphoma patient is — carries high mortality; and **immune amnesia**, the dominant modern finding, which runs directly against the thesis (*Science* 2019: measles destroys 11–73% of pre-existing antibodies to other pathogens; 40–60% average loss in macaques at five months). |
| **A number that does not match its source** | the post's *51%* against the cohort's **HR 0.39 = 61% reduction** (Newcastle Thousand Families Study, n = 1,142, 95% CI **0.17–0.88** — wide, one cohort, authors say confirmation required). |

> **`[A]` THIS IS A WORKED SPECIMEN FOR THE SECOND COMPANION'S `[D]`.** That
> brief argued **selective sampling** is the more valuable `CritiqueSpecies` to
> seed than quantifier scope, because *every citation is valid* so `Evidential`
> cannot reach it. **Here is a case where every cited source is real — the 1971
> letter, the 2013 cohort — and the post is still wrong, entirely through what
> it left out.** The `[D]` now has a test case, which is what it was missing.

**And the structural distinction, which is the same one running through all
three briefs:** `[A]` a virus engineered to target tumour cells, attenuated,
dosed and delivered under control is a **targeted intervention**; catching wild
measles is **uniform systemic exposure**. *"A virus can kill tumour cells"* is
true. *"Therefore the infection is good for you"* drops strain, attenuation,
dose, targeting, patient selection, and whether the patient's immune system can
survive the vector — **which is §2.1's uniform-field result in a biological
costume.**

---

## 8. `[A]` What this does NOT open

**Building is still not on the table.** The immune system is a **removal and
regulatory** system; nothing in it deposits oriented load-bearing matrix, and
there is no immune analogue of the osteoblast lineage. §8.2's rule is unchanged
in its depositional half.

**The one route that would matter is NOT in this brief, because it is
unproven.** Not *use immunity to remove matrix*, but **use immunity to change
what the fibroblast builds** — immune context being one of the known gates on
the scar-versus-regeneration switch (fetal scarless healing occurs in a
low-inflammation context; the synthesis's own §10.3 named adaptive immune
maturity as a candidate for mammalian regenerative failure **and then did not
follow it up**). `[A]` **That is a loop the synthesis left open and it belongs in
its §11.3 as a further falsifiable step — in that document, not this one.**

---

## 9. Confidence tiering

**Will not move:**
- VCN-01 expresses PH20 hyaluronidase; Rurik et al. 2022 produced transient
  FAP-CAR-T in vivo via CD5-targeted LNP/mRNA and reduced cardiac fibrosis.
- MV-NIS derives from the attenuated Edmonston (vaccine) lineage.
- HR 0.39 is a 61% reduction. 51% would require HR ≈ 0.49.
- `AntibodyPattern` cannot target an `AgentPubKey`; deletion is absent from the
  integrity zome rather than unexposed.

**`[A]` Argument, reviewed by nobody — the load-bearing claims here:**
- §3's *the taxonomy is a taxonomy of signals, so immune agents are a missing
  axis rather than a missing row.*
- §4's *cargo with a half-life is a third, engineerable way to self-extinguish.*
- §5's *a selector is a third kind of address*, and §6's reading of
  `AntibodyPattern`'s identity refusal as the same failure refused in advance.

**`[U]` Not verified here, flagged not repeated:**
- FAP expression on bone-marrow stroma and healing wounds, and FAP-CAR-T
  cachexia/marrow toxicity in mouse models. **§4.1 depends on it.**
- The magnitude of Rurik's fibrosis reduction and functional recovery.
