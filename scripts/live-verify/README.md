# Live verification harnesses

Each file here drives a **real `hc sandbox` conductor** — real zome calls, real DHT validation, several of them through a real Playwright-controlled Chromium against the production UI bundle. Nothing here is a mock. That is the point: almost every defect recorded in the root `README.md`'s changelog was found by one of these, and several were invisible to `cargo test` and `tsc` by construction.

## The one rule: one clean conductor per harness

```bash
scripts/sandbox.sh clean && scripts/sandbox.sh start   # before EACH harness
node scripts/live-verify/<harness>.mjs
```

**Not once before the batch — before each one.** There is no way to run these as a suite, and a runner that starts one conductor and loops over the files will report failures that are not real.

This rule is not new and not undocumented. Every harness header has said "clean sandbox" since it was written. What was missing is the collective statement, and that gap is the whole problem: the rule was stated eight times, once per file, and visible in no place where someone decides to run them all. Reading any single file, "clean sandbox" looks like ordinary setup advice. Only in aggregate is it a hard constraint.

**Observed, not theorised.** Running five harnesses in sequence against one conductor produced two failures in `read-scope.mjs`, including one in a check labelled `CONTROL`. Both were artefacts: an earlier harness had already published claims and species to that conductor, and `read-scope` asserts exact counts (`=== 1`). On a clean conductor it passes. A failing control is the most alarming possible output — it reads as "the test framework itself is broken" — and here it meant only that the conductor was dirty.

### Why the harnesses are written this way

Two reasons, and neither is fixable by writing looser assertions:

- **Exact counts are the assertion.** `read-scope.mjs` proves a read returns *nothing* for another agent while a paired read returns *exactly that one entry*. Relaxing to "at least one" would delete the finding: the whole claim is about what is and is not visible, so an off-by-any-number is a different result, not a tolerable one.
- **Friction budgets are per-agent, per-hour, and real.** `create_critique` is capped at 20 per rolling hour and `create_synaptic_link` likewise. A harness that spends the budget leaves the next one unable to publish anything — `affordance-surfacing.mjs` deliberately spends the entire critique budget, so nothing that needs a critique can follow it inside the hour. Waiting out the window is not a workaround anyone will accept; a clean conductor resets the source chain the budget is counted from.

Where a precondition can be checked cheaply, the harness checks it and says so plainly rather than failing obscurely — `affordance-surfacing.mjs` and `write-symmetry.mjs` both read the friction budget first and exit with an explanation naming `sandbox.sh clean`. Prefer that pattern in new harnesses over letting a Playwright timeout stand in for "the budget was spent", which is what happened before those checks existed and cost real time to diagnose.

## What each harness needs

`hc dna pack dna/ && hc app pack .` after any Rust change; `npm run build` in `mobile-ui/` after any UI change — or `scripts/pack-webhapp.sh`, which does all of it in the right order. A harness marked **browser** serves the production `dist/` via `vite preview`, so a stale build means you are verifying the previous version of the UI and everything will pass.

The five rows marked † arrive with PRs #45–#49 and are not present on `main` until those land. They are listed now because this table is the thing someone reads before running anything, and a table that silently omits half the suite is the same failure mode as a rule stated only per-file.

| Harness | Needs | Agents | What it proves |
|---|---|---|---|
| `read-scope` † | — | **2** | Which reads see the DHT and which see only the caller's own chain |
| `domain-index` † | — | **2** | The by-domain and taxonomy indexes work across agents and cannot be poisoned |
| `friction-limits` | — | 1 | SWO temporal friction is enforced by validation, not coordinator courtesy |
| `agent-sdk` | — | 1 | The agent SDK's surface against a live conductor |
| `hud-layer` | browser | 1 | Discourse health, conductance, antibody flags rendered from real state |
| `membranes-ui` | browser | 1 | Membranes, membership, governance |
| `founding-ui` | browser | 1 | Domain founding, and that its accountability is real |
| `graph-ui` | browser | 1 | Spatial navigation of the critique tree |
| `onboarding-ui` | browser | 1 | Progressive disclosure staging |
| `evidence-retraction-ui` | browser | 1 | Evidence, grounding, author-only retraction |
| `affordance-surfacing` † | browser | 1 | The critique form is unavailable exactly when the protocol would refuse it |
| `write-symmetry` † | browser | 1 | Reinforcement and antibody flagging — the write halves of two read-only surfaces |
| `launcher-packaging` † | browser | 1 | The UI works on the path an installed `.webhapp` actually takes |

A **2-agent** harness installs its second agent on the same conductor itself (`generateAgentPubKey` + `installApp` + `enableApp`), so no second sandbox is needed — but it does install a second app, which is another reason the conductor should be clean when it starts.

## Writing a new one

Follow the shape the existing files share, and two conventions that carry most of their value:

- **Pair every negative result with a positive control.** A read returning zero proves nothing on its own; the entry might simply not have gossiped. `read-scope.mjs` pairs each chain-local read with a link-based read of the *same* entry by the *same* agent at the *same* moment, which is what turns an observed zero into evidence. Without the control it is an anecdote.
- **Prefer an independent client's confirmation over the UI's own word.** `write-symmetry.mjs` reads the raised conductance back with a separate connection rather than trusting the number on screen, which is what would catch the UI rendering an optimistic local value.

And check that a new harness can actually fail. `affordance-surfacing.mjs` passed on its first run, which proved nothing until the feature was disabled and the harness observed going red. A suite that has only ever been green has not been shown to test anything.
