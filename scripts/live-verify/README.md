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
scripts/network.sh clean && scripts/network.sh start   # three conductors + bootstrap + iroh relay
node scripts/live-verify/real-gossip.mjs
node scripts/live-verify/partition-rejoin.mjs          # ~9 min; it waits out a real gossip backoff
node scripts/live-verify/transitive-gossip.mjs        # ~3 min; brings nodeD up and puts it back
```

**The one-clean-environment rule applies here too, and nothing above used to say so.** `clean && start` before EACH of these, exactly as with the single-node conductor. Observed rather than assumed: `partition-rejoin.mjs` run immediately after `transitive-gossip.mjs` on the same network died in its baseline phase with a 60-second zome-call timeout, and passed in full on a freshly started network. `transitive-gossip.mjs` restores what it changes and still leaves the network in a state the next harness cannot rely on.

`network-partition.mjs` is not in the list above because it is never launched directly — see below — but it needs the same thing, and `netns.sh` gives it that for free by building its network inside a namespace that is thrown away at exit.

`partition-rejoin.mjs` also drives `network.sh stop-node` / `start-node` itself, to take a conductor offline and bring it back mid-run.

**`transitive-gossip.mjs` needs a fourth conductor, and `start` deliberately does not give it one.** `nodeD` is a third member of the *shared* DHT, which is what makes "did this entry arrive from a peer that did not author it" a question at all — before it, that DHT had exactly two members and gossip was indistinguishable from point-to-point delivery. It is opt-in because a third node sitting up throughout would break `partition-rejoin.mjs` outright: that harness stops the author before restarting the returning node so the returning node provably cannot have obtained the entry from its author, and nodeD holding the same entry defeats exactly that. The harness brings nodeD up itself and stops it again at the end; if it dies mid-run, `scripts/network.sh stop-node nodeD` puts things back.

**`network-partition.mjs` is the third, and it is launched differently — never directly.** It partitions by dropping packets rather than by stopping a process, so it installs `iptables` **and `ip6tables`** rules — both, because they are separate rulesets and the conductors' QUIC sockets bind both address families — and it refuses to do that anywhere they could touch something real or outlive the run. `scripts/netns.sh` supplies a throwaway network **and PID** namespace to run it in, and starts the three-node network inside:

```bash
scripts/netns.sh run 'node scripts/live-verify/network-partition.mjs'   # ~25 min on 0.7
```

Inside that namespace it is uid 0 and may use `iptables`; outside it nothing it did applies, and when it exits the rules, the network and every conductor go with it.

**Why it takes so much longer on 0.7 than the ~8 minutes it used to.** Reconciling entries written during the partition took 930s and 925s once the link was healed — about fifteen and a half minutes each way, and that is the bulk of the run. This is not a regression in the harness or a slow machine: a claim written *after* healing crosses immediately in the same run, and `partition-rejoin.mjs` catches up in ~60s. The difference is what triggers the sync. `partition-rejoin` **stops** a conductor, so it re-runs discovery on restart and pulls what it missed; here both processes stay up throughout, regain connectivity, and wait for a periodic gossip reconciliation round on a much longer cycle. The harness's convergence window is 30 minutes for that reason, overridable with `EPI_CONVERGE_WINDOW_MS`. Run directly it exits 1 without connecting to anything, printing why — that refusal is checked two ways, including from inside a user namespace that is *not* a network namespace, where the uid check alone would have wrongly said yes.

**Do not run two namespace runs at once.** A network namespace is not a mount namespace, so both would share `/tmp/epi-ns` and each begins by deleting it — and they would share the CPU, which matters because this harness reports timings. `netns.sh` takes a lock and refuses the second, after an overlap silently invalidated a fault-injection result.

Its ports (8892-8899) are deliberately disjoint from `sandbox.sh`'s (8888/8889), so the two setups can be up at once and neither notices the other. Every other file in this directory uses `sandbox.sh` and the rule above applies to it unchanged.

They are also the only harnesses here that are **safe to re-run without cleaning first**, and for reasons worth copying rather than by luck: every check is scoped to a domain string minted from `Date.now()` at the top of the run, the one count-free check matches on its own domain rather than on a total, and it spends no friction budget — `create_claim` and `publish_constitution` are not rate-limited, and it calls neither `create_critique` nor `create_synaptic_link`. Confirmed by re-running it green on conductors that had already carried two previous runs. The two properties that force the clean-conductor rule elsewhere — exact counts and per-hour budgets — are simply absent here.

**Which Chromium.** All twenty-one browser harnesses here import `CHROMIUM` from `chromium.mjs`, which resolves `EPI_CHROMIUM` if set, then `/usr/bin/chromium` if it exists, then Playwright's own download. Set `EPI_CHROMIUM` if your browser lives somewhere unusual; otherwise there is nothing to configure on a machine with a system Chromium, and nothing to configure on a runner without one.

**It got there by the rule this paragraph used to state, and the rule is worth keeping for the next thing like it.** The harnesses hardcoded the path, correctly, while a conductor-bound harness only ever ran where a system Chromium already was: resolving a path nothing could exercise would have been churn asserting itself as safe. The rule that replaced it was **change the resolution in the harness you are adding to CI, in the same commit that adds it** — so `notes-ui` changed when `conductor.yml` took it, and seventeen files edited at once to satisfy a workflow running one of them would have been the same churn wearing a better justification. `ui.yml` runs all seventeen, so all seventeen changed in that commit, and the rule is satisfied rather than waived: every file that now imports `chromium.mjs` is exercised by CI as of the commit that made it import it.

**Why it is a module and not a line each.** By the time the seventeen arrived, four harnesses had the same fifteen-line paragraph explaining the fallback, written out four times. Twenty-one copies is the exact shape this file already warns about at the top: the clean-conductor rule was stated eight times, once per file, and visible in no place where somebody decides anything. The reasoning now lives once, in `chromium.mjs`, and the harnesses import a constant. What deliberately did **not** move is Playwright's own resolution out of `mobile-ui/node_modules` — that one prints a specific "install it there first" message, and moving it would put that message one import further from the file somebody actually ran.

**Four of these run on every push and pull request** — see `.github/workflows/live-verify.yml`. They are exactly the conductor-free ones described in the next paragraph, and nothing else is smuggled in behind them: the rest need a Holochain toolchain, a built WASM DNA and a clean conductor per run, and a green tick that quietly stopped covering them would be worse than no tick. A green tick there is evidence about the layer above the promotion gate and says nothing about the protocol below it. *(This paragraph used to end by naming `notes-ui.mjs` as the gate harness a person still had to run by hand; it has run in `conductor.yml` since that workflow existed, and all four workflows below now reach below the gate.)*

**A second workflow reaches below the gate, and reaches exactly as far as a compiler and a linker can** — `.github/workflows/zomes.yml` builds both zomes into the real `wasm32-unknown-unknown` release binaries `dna/dna.yaml` names, and runs their 77 unit tests, on every push. That is not a weakening of the sentence above: building is not validating, no conductor is started, no entry is published and no validation rule is exercised, so a zome that is green there can still be wrong about everything the DHT does. It exists because the two worst defects in the root `README.md`'s changelog were compile-class — the coordinator zome's duplicated function definitions (`E0119`/`E0428`) and the twelve `create_X` functions declaring `ExternResult<EntryHash>` while returning an `ActionHash` — and nothing automatic was watching for either. It builds rather than `cargo check`s because `check` never invokes the linker, which `.cargo/config.toml` exists to configure and which is where the `__hc__*` host functions either become WASM imports or fail. Nothing in *this* directory runs there.

**And eight harnesses from this directory now run against a real conductor on every push** — `.github/workflows/conductor.yml`: `domain-index`, `read-scope`, `mew-lifecycle`, `friction-limits` and `notes-ui`, then `agent-sdk`, `mcp-server` and `linked-data-gateway`, each preceded by `sandbox.sh clean && sandbox.sh start`, exactly as the rule above demands. This is the first CI here that is evidence about the protocol rather than about the layer above it — and `notes-ui` means **the promotion gate itself is no longer something only a person can check**.

**The last three cost about ten seconds each and needed only a `tsc`**, which is worth saying plainly because "needs its own package built" had sat in the exclusion list long enough to read like a wall. They also cover the three surfaces nothing else here touches: the SDK an agent imports, the MCP server an agent speaks to, and the HTTP export the rest of the web reads.

**One of them exposed something the registry is still serving, and it is not a CI detail.** `mcp-server` depends on `@stateofintent/agent-sdk` by version rather than by path — deliberately, since a `file:` dependency cannot resolve on anyone else's machine, and `scripts/check-packages.mjs` fails if that form returns. Now that the SDK is actually published, a plain `npm install` in `mcp-server/` resolves that version and installs **the registry's copy instead of this checkout's**, which would let a pull request changing `agent-sdk/src` pass against code it never touched. The workflow therefore installs the local path with `--no-save`, the same line `mcp-server/README.md` documents, and asserts afterwards that what landed is a symlink. Built against the registry copy this harness goes red on eight checks — the published 0.1.1 predates the `@holochain/client` 0.21 upgrade and authorizes no signing credentials, so every zome call fails. Watched failing and then passing, one line apart. See `mcp-server/README.md`: the published package is broken for anyone installing it today, and only a republish fixes that.

**The reason it was thought impossible is worth reading, because two thirds of it inverted.** The standing objection was that these need a Holochain toolchain, a built WASM DNA and a clean conductor per run, and would spend real friction budget. But the toolchain is a *download* — `holochain/holochain` publishes prebuilt `x86_64-unknown-linux-gnu` binaries per release, and the `holochain-0.7.0` tag carries both `hc` and `holochain`, so nothing is compiled to get them. And **the friction budget is free on a runner**: the clean-conductor-per-harness rule that is a chore on a development machine is automatic on a fresh VM, so the constraint that makes these awkward here costs nothing there. The workflow installs those binaries into `~/.cargo/bin` specifically so `pack-webhapp.sh` and `sandbox.sh` find them the way they do locally, and then drives both scripts unmodified — which makes it the only automatic check that those scripts still work.

**And one of the multi-node harnesses runs there too** — `.github/workflows/network.yml`, a separate job because it needs a different setup: `real-gossip`, preceded by `network.sh clean && network.sh start`, which is the same hard rule as above and just as observed. This is the only automatic evidence in the repository about propagation between peers; `conductor.yml`'s header says in as many words that a green tick there is silent on gossip, partition and convergence, because it is one conductor on one machine.

**The reason they were held back was stated here, and it was false.** This file said their "bootstrap and iroh-relay binaries are published on the same release tag", and `conductor.yml` said the same. They are not. The `holochain-0.7.0` tag publishes `hc`, `hcterm` and `holochain` — three binaries, no bootstrap server — and the bootstrap service and iroh relay are one binary from a different project, `kitsune2-bootstrap-srv`, whose `kitsune2` v0.5.1 release carries no assets at all. There is nothing to download. It has to be compiled with `cargo install kitsune2_bootstrap_srv --version 0.5.1 --locked`, which is exactly what `scripts/network.sh`'s own header has said since it was written — the claim contradicted a file in this repository and was believed anyway, having been generalised from the `hc`/`holochain` download that made `conductor.yml` possible. About two and a half minutes to build on a warm registry; `network.yml` caches the binary itself, keyed on the version, so a run pays it once rather than every push.

**And the seventeen conductor-bound browser harnesses now run too** — `.github/workflows/ui.yml`, one job, one clean conductor per harness, all seventeen on every push. That workflow asks a question none of the other four asks: not whether the protocol does what it says, but whether the screen tells the truth about the protocol underneath it. Measured before it existed: 247 seconds of harness time for the seventeen locally, from 9s (`hud-layer`, `membranes-ui`, `founding-ui`, `graph-ui`) to 36s (`layout-fits`, six tabs at three widths), plus about six seconds per conductor restart — and 243s for the same seventeen after the Chromium change, which is why that change is covered by evidence rather than by inspection. `notes-ui` is a browser harness against a real conductor and would fit there perfectly; it stays in `conductor.yml` because it is the promotion gate, and moving it would quietly shrink what that workflow's tick covers.

Still not running, and none of it is a wall: three of the four multi-node harnesses — `partition-rejoin`, at about five and a half minutes and driving `stop-node`/`start-node` itself; `network-partition`, at about twenty-five minutes inside a privileged throwaway namespace; and `transitive-gossip`, which is a different case and worth reading.

**`transitive-gossip` was in that workflow and came back out, on the evidence of its own first run.** It is green here in 29s and it went green on CI — on the second attempt. On the first, against an identical tree, it died waiting for nodeD to pick up the claim with a bare `Request timed out in 60000 ms: call_zome` — the `@holochain/client` default — while the baseline had crossed nodeA to nodeB in 5.0s earlier in the same run. The network was working and one conductor stopped answering. **The evidence is bimodal, which is the most useful thing known about it:** on the passing run the same wait reported `nodeD had it in 0.0s`. Gossip that was merely slow under load would produce values in between; instant-or-never instead points at nodeD not being ready to answer when the first call arrives — a readiness race between `network.sh start-node nodeD` and that call, which a development machine always wins, and which four conductors plus two services on two vCPUs is exactly where you would first lose. **That is a hypothesis and it is not confirmed**, so no fix was made on it and the client timeout was not widened; one failure in two runs is not a merge gate, and the rule this repository already applied to the `notes-ui` intermittency applies here unchanged. It goes back in when the race is demonstrated and closed, or when something else makes it deterministic.

**Four harnesses need no conductor at all**, and are the only ones exempt from the rule above: `theme-pinning` drives the built UI bundle alone, and `notes-layer`, `notes-live` and `notes-assistant` drive the `notes/` service, which lives *above* the promotion gate and by construction never touches a DHT. All four are safe to run at any time, in any order, alongside anything else, and they bind distinct ports so two of them can run at once. All three notes harnesses need `cd notes && npm install && npm run build` first (and `notes-live` and `notes-assistant` a built UI as well) — the same "packing does not compile" trap as everywhere else, in a different package.

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
| `neighborhood-ui` | browser | 1 | The other half of HRR — a claim's neighborhood probe is offered second, scored as an approximation, and filters nothing |
| `author-scope-ui` | browser | **2** | One agent's whole record is readable from the DHT — and the screen is not a client-side filter of what was already loaded |
| `layout-fits` | browser | 1 | Every tab fits every width this UI is for, with an unbreakable token on screen — the check fifteen harnesses were missing |
| `linked-data-gateway` | `sandbox.sh`, `gateway/` built | 1 | The one-way export — every document carries the canonical Holochain hash, typed critiques survive the crossing, retractions travel with their claim, and no rating vocabulary is emitted anywhere |
| `notes-assistant` | browser, `notes/` built, **no conductor** | 2 members + **1 AI member** | The AI in the room — it joins through an ordinary invite link as a visible member, its answer is attributed and labelled with what produced it, nothing it suggests is applied until a button is pressed, and when it meets the room's answer ceiling it waits the named number of seconds instead of retrying on every note anybody writes |
| `notes-ui` | browser, `sandbox.sh`, `notes/` built | 1 agent, **2 browser contexts** | The gate itself — the soft layer is reachable with no conductor, the promotion form is disabled and explains itself without one, and with one a note becomes a real Claim and a real typed Critique that a separate client reads back off the DHT |
| `notes-live` | browser, `notes/` built, **no conductor** | 3 members, **2 browser contexts** | Two people in one room — a note written in one browser appears in the other with nobody touching it, a half-typed sentence and its caret survive the arrival, a note that moved under an open editor refuses the save instead of losing either version, and leaving the room hands back the live connection it was holding |
| `notes-layer` | `notes/` built, **no conductor** | 4 members, 2 spaces | The soft layer above the gate — invite links, a directory that refuses to rank, space-local descriptive signals, deletion that really deletes, a service that structurally cannot publish to the DHT, and the room's own ceilings hit for real: refused before anything is written, uncapped where the protocol already charged, and not resettable by an `X-Forwarded-For` header |
| `theme-pinning` | browser, **no conductor** | 0 | The palette follows the OS by default and a user's pin overrides it in both directions — checked under both emulated OS preferences, and before first paint |
| `mew-lifecycle` | `sandbox.sh` | **2** | The Twitter bridge's zome surface end to end — Mew to Claim to mirror to imported reply, one deliberate step at a time. Does **not** cover the live X API |
| `mcp-server` | `sandbox.sh` | 1 | The MCP server driven over stdio as an agent would drive it — the protocol is discoverable from the tool list, offers no ranking, and round-trips hashes as strings |
| `real-gossip` | **`network.sh`** | 1 per node, **3 nodes** | An entry written on one conductor reaches a different conductor over a real network — and a chain-local read still does not |
| `partition-rejoin` | **`network.sh`** | 1 per node, **3 nodes** | A node that was offline while history was written catches up on rejoining — both directions, ~5.5 min |
| `network-partition` | **`netns.sh`** | 1 per node, **3 nodes** | Both conductors stay up and keep writing while a packet-level cut stops them reaching each other, then both converge — ~25 min on 0.7, most of it the post-heal reconciliation |
| `transitive-gossip` | **`network.sh`** + `nodeD` | 1 per node, **4 nodes** | An entry reaches a node from a peer that did not author it — the author is down for the whole wait, ~3 min (measured at **29s** on a fresh network in the pass that added it to CI; the older figure is kept rather than replaced, since one fast run on one machine does not overturn somebody else's measurement) |

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
