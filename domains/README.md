# Domain Templates

Resolves README.md §9 Phase 5's "New domain templates (climate, nutrition, etc.)." Nothing in `dna/` is domain-specific — a `Membrane.domain` is a plain `String`, and every entry type is already domain-agnostic (see `SPEC.md`). What this directory adds is a **template format and a bootstrap tool** for actually founding a new domain with real, differentiated content, plus three worked examples proving the protocol's claimed generality (§2.2's "domains are membranes, critique types speciate") isn't just asserted — that a climate-science domain, a nutrition-science domain, and an energy-of-computation domain genuinely need, and get, their own distinct critique taxonomies, not a copy of `LumbarRehab`'s implicit one.

## What founding a domain actually requires

Per `SPEC.md` §2.4–§2.9, a real domain needs, at minimum:

1. A **Constitution** — the founding agent's own published promises (what they commit to doing in this domain). Required for a Membrane to exist at all (`Membrane.constitution` is not optional).
2. A **Membrane** — the domain's sovereign boundary: its name, description, and what it demands of members (`required_promises`).
3. A starter **CritiqueSpecies taxonomy** — not required by validation (a domain can exist with zero species), but the actual point of this exercise: what kinds of methodological, source, or logical problems does *this* field's discourse need named, that a generic domain wouldn't? A domain that skips this just inherits whatever critique vocabulary happens to already be in `CritiqueMode` (§SPEC.md §3.2 — five fixed, domain-independent modes) with no finer-grained taxonomy underneath it.

## Template format

See `template.json` for the annotated schema (its `_comment`/`_*_comment` keys explain each field; those keys are stripped before use — they exist to be read, not part of the real payload). In short:

```json
{
  "domain": "string",
  "description": "string",
  "promises": [{ "action": "string", "domain": "string", "modality": "CritiqueMode | null" }],
  "required_promises": ["string", ...],
  "conditions": [{ "condition_type": "string", "parameters": ["string", ...] }],
  "critique_species": [
    { "name": "string", "parent": "string | null", "required_evidence": ["string", ...] }
  ]
}
```

`critique_species` entries are created **in list order** — a species naming a `parent` MUST appear after that parent in the same list (root species use `parent: null`).

## Worked examples

- **`climate.json`** — `ClimateScience`: promises that distinguish model output from observation and require funding disclosure; a taxonomy splitting `MethodologicalCritique` into `ModelUncertaintyCritique`/`StatisticalCritique`, and `SourceCritique` into `FundingBiasCritique`/`PeerReviewStatusCritique`.
- **`compute-energy.json`** — `ComputeEnergy`: promises that require stating a figure's measurement boundary and tracing it to a primary source; a taxonomy splitting `BoundaryCritique` into `TrainingVsInferenceCritique`/`ChipVsFacilityCritique`/`MarginalVsAverageCritique`, `ProvenanceCritique` into `CitationLaunderingCritique`/`StaleBaselineCritique`, and `LocalIncidenceCritique` into `RatepayerIncidenceCritique`, plus a standalone `ReboundCritique`. This is the domain used by `docs/demo-compute-energy.md`, the standard first demo — see there for a full worked set of claims, typed critiques, a critique-of-critique, and a retraction.
- **`nutrition.json`** — `NutritionScience`: promises that require distinguishing correlation from causation and disclosing industry funding; a taxonomy splitting `StudyDesignCritique` into `ObservationalVsRCTCritique`/`SampleSizeCritique`, and a `ConflictOfInterestCritique` → `IndustryFundingCritique` branch.

None of the three is a deep or complete taxonomy for its real field — each is a genuine, differentiated *starting point* a real founding community would extend, not a finished ontology. The point is that they are visibly different from each other and from `LumbarRehab`'s implicit vocabulary, not generic placeholders.

## Running the bootstrap

```bash
cd domains
npm install
node bootstrap.mjs climate.json      # or nutrition.json, or your own template
```

Needs a running conductor with this hApp installed — `scripts/sandbox.sh start` from the repo root is the fastest local path (see the root `README.md` §6). Defaults match that script's own ports/app-id exactly; override with `--admin`/`--app`/`--app-id` if yours differ.

The script makes real, sequential zome calls (`publish_constitution` → `create_membrane` → `create_critique_species` once per species, resolving each `parent` name to the real `EntryHash` of a species created earlier in the same run) and prints every resulting hash, including the Membrane's own — the value `get_discourse_health`/`get_cross_domain_critiques`/`join_membrane` all need afterward.

## Verified live, not just written

`compute-energy.json` is newer and has NOT yet had a live bootstrap run recorded here — it is written against the same schema and validated as JSON, but do not describe it as live-verified until someone has actually run it. Both `climate.json` and `nutrition.json` were run for real against a live `hc sandbox` conductor with `bootstrap.mjs` — see the root `README.md`'s Phase 5 changelog for the full account of what was checked (every Constitution/Membrane/CritiqueSpecies hash resolving to real, correctly-parented entries; `get_all_critique_species` reflecting the real six-and-five-species taxonomies with correct `parent_species` links).
