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

**Four harnesses are the exception, and they are the exception on purpose.** `real-gossip.mjs`, `partition-rejoin.mjs`, `network-partition.mjs` and `transitive-gossip.mjs` do not use this conductor at all. They need three of them on a real network — four, for the last — and get them from `scripts/network.sh` instead:

```bash
scripts/network.sh clean && scripts/network.sh start   # three conductors + bootstrap + WebRTC signal
node scripts/live-verify/real-gossip.mjs
node scripts/live-verify/partition-rejoin.mjs          # ~9 min; it waits out a real gossip backoff
node scripts/live-verify/transitive-gossip.mjs        # ~3 min; brings nodeD up and puts it back
```

`partition-rejoin.mjs` also drives `network.sh stop-node` / `start-node` itself, to take a conductor offline and bring it back mid-run.

**`transitive-gossip.mjs` needs a fourth conductor, and `start` deliberately does not give it one.** `nodeD` is a third member of the *shared* DHT, which is what makes "did this entry arrive from a peer that did not author it" a question at all — before it, that DHT had exactly two members and gossip was indistinguishable from point-to-point delivery. It is opt-in because a third node sitting up throughout would break `partition-rejoin.mjs` outright: that harness stops the author before restarting the returning node so the returning node provably cannot have obtained the entry from its author, and nodeD holding the same entry defeats exactly that. The harness brings nodeD up itself and stops it again at the end; if it dies mid-run, `scripts/network.sh stop-node nodeD` puts things back.

**`network-partition.mjs` is the third, and it is launched differently — never directly.** It partitions by dropping packets rather than by stopping a process, so it installs `iptables` rules, and it refuses to do that anywhere they could touch something real or outlive the run. `scripts/netns.sh` supplies a throwaway network **and PID** namespace to run it in, and starts the three-node network inside:

```bash
scripts/netns.sh run 'node scripts/live-verify/network-partition.mjs'   # ~8 min
```

Inside that namespace it is uid 0 and may use `iptables`; outside it nothing it did applies, and when it exits the rules, the network and every conductor go with it. Run directly it exits 1 without connecting to anything, printing why — that refusal is checked two ways, including from inside a user namespace that is *not* a network namespace, where the uid check alone would have wrongly said yes.

**Do not run two namespace runs at once.** A network namespace is not a mount namespace, so both would share `/tmp/epi-ns` and each begins by deleting it — and they would share the CPU, which matters because this harness reports timings. `netns.sh` takes a lock and refuses the second, after an overlap silently invalidated a fault-injection result.

Its ports (8892-8899) are deliberately disjoint from `sandbox.sh`'s (8888/8889), so the two setups can be up at once and neither notices the other. Every other file in this directory uses `sandbox.sh` and the rule above applies to it unchanged.

They are also the only harnesses here that are **safe to re-run without cleaning first**, and for reasons worth copying rather than by luck: every check is scoped to a domain string minted from `Date.now()` at the top of the run, the one count-free check matches on its own domain rather than on a total, and it spends no friction budget — `create_claim` and `publish_constitution` are not rate-limited, and it calls neither `create_critique` nor `create_synaptic_link`. Confirmed by re-running it green on conductors that had already carried two previous runs. The two properties that force the clean-conductor rule elsewhere — exact counts and per-hour budgets — are simply absent here.

## What each harness needs

`scripts/pack-webhapp.sh` after any change — it builds the zomes, packs the DNA and hApp, builds the UI and packs the bundle, in that order.

Doing it by hand needs all four steps: `cargo build --release --target wasm32-unknown-unknown` in `dna/integrity` **and** `dna/coordinator` *before* `hc dna pack dna/ && hc app pack .`, plus `npm run build` in `mobile-ui/`. **`hc dna pack` compiles nothing** — it packages the wasm already on disk, so packing without building first yields a freshly timestamped bundle around stale code, and every harness here will happily verify the previous build and pass. That is not hypothetical: it is how a deliberately broken `get_claims_by_domain` was observed passing this entire suite. The same trap applies to the UI — a harness marked **browser** serves the production `dist/` via `vite preview`, so a stale `npm run build` means you are verifying the previous version of the UI and everything will pass.

| Harness | Needs | Agents | What it proves |
|---|---|---|---|
| `read-scope` | — | **2** | Which reads see the DHT and which see only the caller's own chain |
| `domain-index` | — | **2** | The by-domain and taxonomy indexes work across agents and cannot be poisoned |
| `friction-limits` | — | 1 | SWO temporal friction is enforced by validation, not coordinator courtesy |
| `agent-sdk` | — | 1 | The agent SDK's surface against a live conductor |
| `hud-layer` | browser | 1 | Discourse health, conductance, antibody flags rendered from real state |
| `membranes-ui` | browser | 1 | Membranes, membership, governance |
| `founding-ui` | browser | 1 | Domain founding, and that its accountability is real |
| `graph-ui` | browser | 1 | Spatial navigation of the critique tree |
| `onboarding-ui` | browser | 1 | Progressive disclosure staging |
| `evidence-retraction-ui` | browser | 1 | Evidence, grounding, author-only retraction |
| `affordance-surfacing` | browser | 1 | The critique form is unavailable exactly when the protocol would refuse it |
| `write-symmetry` | browser | 1 | Reinforcement and antibody flagging — the write halves of two read-only surfaces |
| `launcher-packaging` | browser | 1 | The UI works on the path an installed `.webhapp` actually takes |
| `taxonomy-ui` | browser | 1 | The critique vocabulary renders as a tree, is writable, and is never ranked |
| `trust-lenses` | browser | **2** | A trust lens is never on by default, always visible, and its effect legible |
| `expertise-ui` | browser | **2** | An expertise assertion is findable by strangers, and reads as self-asserted |
| `mode-and-constitution` | browser | **3** | A chain-local read is never shown as global, and absence is never scored |
| `worldline-ui` | browser | 1 | The approximate HRR probe never displaces the exact period record |
| `author-scope-ui` | browser | **2** | One agent's whole record is readable from the DHT — and the screen is not a client-side filter of what was already loaded |
| `layout-fits` | browser | 1 | Every tab fits every width this UI is for, with an unbreakable token on screen — the check fifteen harnesses were missing |
| `mew-lifecycle` | `sandbox.sh` | **2** | The Twitter bridge's zome surface end to end — Mew to Claim to mirror to imported reply, one deliberate step at a time. Does **not** cover the live X API |
| `mcp-server` | `sandbox.sh` | 1 | The MCP server driven over stdio as an agent would drive it — the protocol is discoverable from the tool list, offers no ranking, and round-trips hashes as strings |
| `real-gossip` | **`network.sh`** | 1 per node, **3 nodes** | An entry written on one conductor reaches a different conductor over a real network — and a chain-local read still does not |
| `partition-rejoin` | **`network.sh`** | 1 per node, **3 nodes** | A node that was offline while history was written catches up on rejoining — both directions, ~5.5 min |
| `network-partition` | **`netns.sh`** | 1 per node, **3 nodes** | Both conductors stay up and keep writing while a packet-level cut stops them reaching each other, then both converge — ~8 min |
| `transitive-gossip` | **`network.sh`** + `nodeD` | 1 per node, **4 nodes** | An entry reaches a node from a peer that did not author it — the author is down for the whole wait, ~3 min |

A **2-agent** harness installs its second agent on the same conductor itself (`generateAgentPubKey` + `installApp` + `enableApp`), so no second sandbox is needed — but it does install a second app, which is another reason the conductor should be clean when it starts.

**Two agents on one conductor is not a network, and that distinction is worth holding on to.** Those agents share a single local DHT store: an entry written by one is visible to the other the instant it is written, because it never travelled. That is exactly the right arrangement for the questions those harnesses ask — read scope, per-agent friction budgets, what one agent can and cannot find of another's work — and it is silent on whether anything propagates between machines. `hc sandbox` produces no networking by default (`transport_pool: []`, `bootstrap_service: null` in the conductor config), so until `real-gossip.mjs` nothing here had ever run two conductors that could reach each other. Reach for `sandbox.sh` and a second agent when the question is about visibility; reach for `network.sh` and `real-gossip.mjs` when it is about propagation.

**Not a live-verify harness, but run by the same reflex:** `scripts/check-packages.mjs`
asks whether `npm publish` would produce a *working* package, by inspecting what
`npm pack --dry-run` actually puts in the tarball rather than what `package.json`
intends. It catches the quiet ones — `files` missing so `src/` ships, `dist`
listed but never built, a `file:../thing` dependency that resolves here and
nowhere else, a licence declared in metadata and absent from the tarball. None
of those is visible until someone installs the published package, by which point
the version number is spent.

## Writing a new one

Follow the shape the existing files share, and two conventions that carry most of their value:

- **Pair every negative result with a positive control.** A read returning zero proves nothing on its own; the entry might simply not have gossiped. `read-scope.mjs` pairs each chain-local read with a link-based read of the *same* entry by the *same* agent at the *same* moment, which is what turns an observed zero into evidence. Without the control it is an anecdote.
- **Prefer an independent client's confirmation over the UI's own word.** `write-symmetry.mjs` reads the raised conductance back with a separate connection rather than trusting the number on screen, which is what would catch the UI rendering an optimistic local value.

### Negative evidence

**Every harness here has been watched failing, and each one records how in its own header** under `NEGATIVE EVIDENCE` — what was broken, and which checks went red. That block is the evidence for the rule below; without it "check that it can fail" is a convention nobody can confirm was followed, which is what it was until the whole suite was swept.

Two of the seventeen were **not** caught by their own assertions on the first attempt, and both had the same shape — a check whose *label* claimed more than its assertion tested:

- `founding-ui` said "permanence is stated before the button, not confirmed after it" and asserted `count() === 1`. That is presence, not order. Moving the note below the button left it green. Now compared with `compareDocumentPosition`.
- `evidence-retraction-ui` said "ungrounded is not styled as an error" and asserted that `.grounding.ungrounded` existed. That class stays present when an error class is added *alongside* it, so styling the badge as an error left it green. Now asserts the absence of error classes and of deficiency wording.

A third, `launcher-packaging`, caught its regression but reported it as a bare `waiting for locator(friction-meter)` timeout — true, and useless. It now says what that means.

This is what the sweep was for. A green suite tells you nothing about assertions that cannot go red, and reading them will not reliably reveal it: both weak checks above look correct, and their labels describe the strong version.

And check that a new harness can actually fail. `affordance-surfacing.mjs` passed on its first run, which proved nothing until the feature was disabled and the harness observed going red. A suite that has only ever been green has not been shown to test anything.
