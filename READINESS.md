# Can this be handed to strangers yet?

**Short answer: to a handful of people on desktop computers, yes — the release
is cut. To a crowd, and on phones, no — and the phone part is not a scheduling
problem.**

**`v0.2.0` of the desktop app was published on 2026-10-12** carrying
`protocol_version: 9`, which closes §1 below and makes step 1 and step 2 of
*The order to do things in* done. The next thing that matters is step 3:
two consumer networks, never measured.

This file exists because the honest answer was spread across README §9,
INSTALL.md, SPEC.md and two repositories, and nobody reading any one of them
would have assembled it. It is deliberately short. Where it says "see §9", the
detail there is long and current.

---

## What is genuinely ready

**The protocol's validation layer is in good shape, and that is measured rather
than asserted.** A security review of the zomes on 2026-10-11 found five
defects of one shape — links and update ops that bound nothing to the entry they
carried — and all five are closed. Eighteen link types are bound, which is every
link type anything writes; app-entry updates are refused. Both halves of all
eighteen rules have been watched failing on their own probe across six
deliberate injections. `scripts/live-verify/attachment-links.mjs` runs 101
checks against a live conductor on every push, and is a required check.

**The UI is clean against the obvious web attacks.** Every node is built through
DOM APIs; a cited `source_url` is rendered as text rather than an anchor, so the
app never vouches for where a user's citation points.

**One conductor, three conductors, and gossip between them all work**, verified
by twelve harnesses on every push.

**And the agent-facing path is not orphaned the way the desktop app is.**
`scripts/live-verify/published-packages.mjs` packs `@stateofintent/agent-sdk`
and `@stateofintent/mcp-server` — both at `0.1.2`, the published version —
installs them into an empty project **with a fresh dependency resolve**, and
drives them against a real conductor on every push. It has stayed green through
all six protocol forks. So a stranger who installs the SDK or points an
MCP-capable model at the server is driving the *current* protocol today, with no
release to wait for. That is a smaller audience than desktop installers and a
real one.

Said more precisely than it was before: the harness packs the **local**
packages rather than downloading the registry copy, which its own step-2
comment explains — during a version bump the replacement SDK is by definition
not published yet, so testing against the registry would verify precisely the
code being replaced. The fresh resolve is the thing under test, and that is the
part that matters, since the 0.1.1 failure lived in the dependency tree a
stranger's install builds and not in the tarball.

**Re-run locally on 2026-10-12, against a conductor carrying the protocol 9
artifact**: all seven checks pass — the installed SDK authorizes signing, writes
a claim the network accepts, an independent read finds it, and the MCP server's
own tool call returns that same claim, so both packages agree about one network.
Previously this had only ever been observed in CI.

---

## What blocks a release today

### 1. ~~There is no release of the current protocol~~ — CLOSED 2026-10-12

**`v0.2.0` shipped**, carrying `protocol_version: 9`: run
[`38240998611`](https://github.com/StateofIntent/epistemic-resonance-desktop/actions/runs/38240998611),
all four platforms, 15 assets, published the same day. The AppImage was run to
`Conductor ready.` and `Happ installed.`, and `latest-linux.yml` was verified
by sha512 against the published artifact — §1b is why that second check is not
paranoia. **The rest of this section is kept as written**, because it is the
argument for why the release had to happen and it is still the argument for
why `v0.1.1` must not be recommended to anybody.

`v0.1.1` was packed on 2026-09-04. The integrity zome has forked **six times**
since — the Holochain 0.7 migration and link-delete refusal, then
`protocol_version` 5 through 9 on 2026-10-11. On this substrate the DNA hash is
computed over the integrity zome, so **each fork is a separate network**.

What that means concretely: the file a stranger downloads today works, talks
only to other `v0.1.1` installs, and implements **none** of the protocol this
repository describes. At that tag the zome has no `PROTOCOL_VERSION` constant at
all — the release predates the versioning mechanism, not just the versions.

**The packing is done.** `epistemic-resonance-happ.webhapp` and
`epistemic-resonance-happ.happ` were built from `protocol_version: 9` on
2026-10-11, and the resulting DNA hash is
`uhC0kUHSiD5aAt7BH6XJ3j7XGfdaxLL3oFUj6f-2OPU29caU0ZkxF`. **The artifact was
then verified against a real local conductor**: all 101 checks of
`attachment-links.mjs` pass on it, which is the first time a release candidate
has been tested as the thing that ships rather than as the tree it came from.

**That hash is the artifact's, and no running install has it.** The bundle
declares `network_seed: null`, but the desktop app installs it with a seed
derived from its own version — `holochainManager.ts:184` passes
`network_seed`, `cli.ts:85` builds it as `Epistemic Resonance-0.2.x` — and the
DNA hash covers the modifiers as well as the integrity zome. So a `v0.2.0`
install runs `uhC0kozkSiLXO9mxkIAVWCRm6Qos6FYnyH65_gMkkP10hXUwtxVX0`, read
from the conductor's own `dht-<hash>.db` filename. Every desktop install
derives the same seed and shares one network; **a conductor run from this
repository uses the null seed and is on a different one at identical code**,
which is worth knowing before §3's measurement is attempted against a desktop
build and read as a propagation failure.

The toolchain needed for this is `hc` and `holochain` 0.7.0, installed by
`scripts/ci/install-holochain.sh` into `~/.cargo/bin` — **which is where they
already were**, absent from `PATH` rather than from the machine. One line fixes
it: `export PATH="$HOME/.cargo/bin:$PATH"`.

The procedure, for the next time:

```bash
# in epistemic-happ
scripts/pack-webhapp.sh
cp epistemic-resonance-happ.webhapp ../epistemic-resonance-desktop/pouch/
```

Then in `epistemic-resonance-desktop`: **bump `version` in
`kangaroo.config.ts` to `0.2.0`, not `0.1.2`.** That repo's README explains
why and the trap is easy to walk into — `installHappIfNecessary` returns early
when the app id is already present, and all of `0.1.x` shares one data
directory, so a patch release onto an existing install silently puts the new UI
in front of the **old cell**. A minor bump gives it a fresh conductor. It also
means auto-update will not offer it: everyone already running the app has to
download manually.

**Done on 2026-10-12, up to the merge.** No repack was needed — nothing in
`dna/`, `mobile-ui/src/` or the manifests is newer than the artifact. It was
re-verified rather than assumed: unpacked, its `dna.yaml` declares
`protocol_version: 9` and `hc dna hash` returns the hash above. The desktop
side is prepared in two pull requests, both green:

- **#4** puts the relay fix on `main`, where it never landed (see §2).
- **#5** copies the protocol 9 webhapp into `pouch/`, bumps `version` to
  `0.2.0` in both `kangaroo.config.ts` and `package.json`, and records the
  release trap below.

What remains is merging those, creating the `v0.2.0` draft release by hand —
CI cannot create one, every upload is `gh release upload` against a tag that
must already exist — and merging `main` into `release` to trigger the builds.

### 1b. A release that reuses an existing tag replaces almost nothing

**Found 2026-10-12, and it has already happened.** Run `38130535367` — the
merge of the relay fix into `epistemic-resonance-desktop`'s `release` branch on
2026-10-11 — rebuilt all four platforms against the **already-published**
`v0.1.1` tag and succeeded everywhere, while replacing only two assets. The
AppImage is absent from the Linux job's explicit `gh release upload` list, and
the macOS and Windows jobs publish only through electron-builder, which does
not overwrite an asset already on the release. (Windows has a `gh release
upload` block, but it is gated on `WINDOWS_CODE_SIGNING == true`, which is
false here.)

So `latest-linux.yml` and the `.deb` on `v0.1.1` are from the relay-fixed
build, and the AppImage and every macOS and Windows artifact are still the
2026-09-06 build. That manifest now names an AppImage of 157541505 bytes
against a published AppImage of 157541572, so the sha512 cannot match:
**Linux AppImage auto-update is broken on `v0.1.1`**, which is the release
currently marked Latest. Nothing failed; the run was green throughout.

A new tag is unaffected, because every asset uploads for the first time — which
is how `v0.1.0` and `v0.1.1` got complete sets, and why `0.2.0` is a version
bump rather than a re-run. Repairing `v0.1.1` needs assets deleted from a
published release by hand and is a separate decision. The rule: a release is a
new version, or it is not a release.

### 2. The relay was pointed at the bootstrap server

Found 2026-10-11 and fixed in `epistemic-resonance-desktop` (`relayUrl` in
`kangaroo.config.ts`). Both fields read `dev-test-bootstrap2.holochain.org`;
Holochain 0.7's own default relay is an iroh relay
(`holochain_conductor_api-0.7.0/src/config/conductor.rs:394`). The configured
value is written straight to `network.relay_url`, so every installed copy was
telling iroh its relay is a bootstrap server.

**Why it matters more than it reads:** a relay carries traffic between two peers
that cannot reach each other directly, which is the ordinary case for two home
connections behind consumer NAT — and peers on one LAN never touch the relay at
all. So a wrong relay looks fine in every easy test and fails only in the case
mass adoption consists of.

**Not proven at runtime.** Nobody has watched a connection fail because of it.
The evidence is the pinned dependency's default and what the field is for.

**And it was merged to the wrong branch.** Discovered 2026-10-12: PR #3 merged
it into `release` only, inverting that repo's documented `main` → `release`
flow. `main` sat at the pre-fix commit, so the fix was present in the branch CI
builds from and absent from the branch everything is cut from — anyone
branching off `main` would have silently lost it, and the next release would
have reintroduced the bug. PR #4 restores `main` as the superset.

### 3. Two consumer networks have never been measured

This is the one that decides whether "people sharing info" works at all, and it
is first in §9's priority order for a reason. There is **one** measured
cross-internet crossing — 5.0s, between two datacentre VMs. Two laptops behind
two different home routers: zero measurements. Mobile networks and CGNAT: zero.

**The tooling exists and the measurement is cheap.** Two people on two different
home connections, or one person on home broadband and a phone hotspot:

```bash
# both hosts, same seed — the seed keeps this off the DHT real installers share
scripts/cross-internet-node.sh start xnet-$(date +%s)   # use the SAME value

# host A
EPI_XNET_ROLE=publisher EPI_XNET_DOMAIN=xnet-<same> EPI_XNET_HOLD_S=1800 node scripts/live-verify/cross-internet.mjs
# host B
EPI_XNET_ROLE=reader    EPI_XNET_DOMAIN=xnet-<same> EPI_XNET_HOLD_S=1800 node scripts/live-verify/cross-internet.mjs
```

**Set `EPI_XNET_HOLD_S`, and do not take its default.** It defaults to 600
(`cross-internet.mjs:55`), and two of the four crossings this repository has
ever measured — 929.1s and 943.0s, recorded under *What will generate false bug
reports* below — are longer than that window. At the default the reader logs
`NO CROSSING inside 600s.` and **counts it a failed check**
(`cross-internet.mjs:176`), so a working network would have been written down as
a propagation failure on half the measurements already taken. 1800 clears the
slowest recorded crossing with room; budget an hour for a couple of trials
rather than the ten minutes the window implies.

The publisher holds past its own write on purpose — Holochain is not a server,
so if the publishing conductor exits there is no peer left holding the entry.
**So the publisher's window must be at least the reader's** — same
`EPI_XNET_HOLD_S` on both sides, or the publisher exits mid-wait and the reader
measures the publisher's absence rather than the network.

**Run it against a build carrying the relay fix.** A run against the old value
measures the bug rather than the protocol.

**What the measurement does and does not cover.**
`scripts/cross-internet-node.sh` supplies its own relay, defaulting to
`https://use1-1.relay.n0.iroh-canary.iroh.link./` — 0.7's own, and the same
value §2's fix installs. Before that fix the script and the shipped app pointed
at *different* relays, so a green run here would have validated nothing about
what installers actually run. After it they agree, which is what makes this
measurement representative of the app rather than only of the protocol. It is
still two `hc sandbox` conductors rather than two copies of the Electron build;
the thing it transfers is the relay path, not the packaging.

**This measurement is now also the input to two decisions that are being held
for it**, which is new as of 2026-10-13 and is the reason it moved up in
priority rather than merely staying first.

`partition-rejoin` asserts that a rejoining node catches up within 60s, and
that bound is `DWELL_CAP_MS / 5` rather than a preference — clearing the
slowest crossing recorded so far would need a **79-minute dwell** on top of the
harness's two 600s convergence windows, so raising it is not available. A
baseline slower than 60s therefore reds the check, and while `network` was a
required check that red blocked merges on work with nothing to do with gossip:
a docs-only pull request (#263) on 2026-10-12 is the case in point.
`partition-rejoin` is **its own job now and deliberately not a required check**
(`network.yml`), which stops the merge-blocking without touching the harness —
it still goes red, where a red is information. The harness was not silenced,
because `partition-rejoin.mjs:714` has the divergence assertion go inconclusive
*because* this check is red, so a green run would have proved nothing.

What the split does **not** settle is whether a slow baseline is intermittent
or routine, and that is what these two decisions need:

- **Whether to re-measure the baseline 2-3x and fail only when consistently
  slow.** It assumes propagation is *intermittently* slow, so a retry finds a
  fast baseline. If consumer networks are routinely minutes-slow, the retry is
  wasted job time and the split above is the whole answer. Held rather than
  built, because the five crossings it would be sized from are not from
  consumer networks.
- **Whether `agent-sdk`'s `dependencyWaitMs` default of 1,200,000ms (20
  minutes) is right.** It was sized above the slowest of five crossings, none
  of them from a consumer network, so it is currently a datacentre number
  applied to home connections.

Both are decisions a measurement makes for you. Neither is worth arguing about
beforehand.

**AND THE SPLIT IS NOT THE WHOLE ANSWER, WHICH TOOK THREE HOURS TO FIND OUT.**
The paragraph above was written as though `partition-rejoin` were the only slow
crossing in `network.yml`. It is not. Within three hours of the split, two runs
landed on opposite sides of it:

| run | `network` (required) | `partition-rejoin` (advisory) |
|---|---|---|
| `main`, 2026-10-13 11:20 | **pass** | fail |
| #265, 2026-10-13 11:30 | **fail** | pass |

The first is the split working exactly as designed — `main` stayed green on its
required checks while the advisory job went red, which is the whole point. The
second is the case the split does not cover: `real-gossip`'s forward leg missed
its 330s window and the entry then arrived at **t+151s past it**, so roughly
481s for a crossing between three conductors on ONE MACHINE. `real-gossip` is
in the required job, so that red blocks merges exactly as `partition-rejoin`'s
used to.

**This is not the split misbehaving and it is not a regression from running the
two jobs in parallel** — `network.sh` runs its own `kitsune2-bootstrap-srv` on
127.0.0.1:8893 with the embedded relay on :8892, so two jobs on two runner VMs
cannot discover each other. It is the same intermittency, in the harness nobody
had separated out, and README §9's measured `network` pass rate (83.1% before
the dwell fix, ~86% after) was always a rate for BOTH harnesses pooled.

**So item 4 is mis-scoped as well as mis-blocked.** It proposes re-measuring
the baseline in `partition-rejoin`, which is now the advisory job — the one
where a red costs nothing. The harness that actually blocks merges is
`real-gossip`, and it wants the same treatment first. Splitting it out too
would be the wrong answer: it would leave `network` required and empty.

**And the intermittency is now proven on a SAME COMMIT, which is the strongest
form this evidence can take.** #265's `network` job failed at 11m50s and then
passed at **2m48s on the identical tree** — a re-run, no code difference to
explain it away, nothing left for a "something changed" account to attach to.
Five observations across 2026-10-12/13, pooling both harnesses: two slow
enough to fail, the rest inside their windows. That is what item 4's retry
assumes, so item 4 no longer needs §3 to proceed.

**The running count, and it has moved toward the boundary the retry's own
design names as its falsification condition.** #267's second `network` run
(2026-10-14, run `38546085167`) is the first real-network occurrence the retry
actually absorbed: the forward leg missed **two** full 330s windows and a third
fresh publish then crossed in **243.5s**. Pooling both harnesses, the count is
now **eight observations, four of them slow enough to fail without a retry** —
the two from 2026-10-12/13, plus that forward leg and, in the same run, the
`partition-rejoin` Phase 0 baseline that never crossed at all. Four of eight is
not "most runs", so the premise holds as written; it is also no longer the
comfortable minority it was at two of five. `real-gossip.mjs`'s
`CROSSING_ATTEMPTS` comment states the condition that would retire the
absorption — "a retry needed on most runs is not an intermittency being
absorbed, it is a routine failure being hidden" — and **the number to watch it
with is this count, which is why the occurrence is written here rather than
left in a run log.** The observations pool two harnesses with different window
semantics, so treat the rate as an order of magnitude rather than a
measurement.

**One thing this occurrence settles that no stubbed scenario could: three
attempts rather than two was load-bearing, and not as a statistical hedge.**
The comment's reason is the burst limiter — 15 initiations per peer per 10
minutes, so "two attempts at 330s each can land entirely within it while three
span past it". In this run attempt 1 began at 10:00:52 and attempt 3 at
10:10:51, so **attempts 1 and 2 fell inside a single ~10-minute burst window
and both missed, and the attempt that crossed is the first one past it**;
nodeB's census carries `initiate too soon=25` from the same window. A
two-attempt retry would have reddened this run. The reasoning that picked three
was written before any real-network run needed it, and this is the run that
needed it.

**What §3 still decides, and it is not item 4.** Whether a real user on a home
connection waits minutes to publish, and whether `agent-sdk`'s
`dependencyWaitMs` default of 1,200,000ms is a datacentre number applied to
consumer networks. No amount of CI history answers either; only two machines on
two home connections do.


**AND THE RETRY IS BUILT, AS OF 2026-10-14 — so this section no longer holds
anything back.** `real-gossip.mjs` re-asks a missed crossing up to three times
with a fresh publish each time and reds only when all three miss
(`CROSSING_ATTEMPTS`), which is queue item 4 closed. What that means for the
required `network` job is that an intermittent slow crossing no longer blocks a
merge, while a routine one still does — the distinction this section spent three
weeks establishing is now the thing the gate actually measures.

**It changes nothing about §3's own measurement, and the temptation to think
otherwise is worth naming.** A retry that absorbs an intermittency on a GitHub
runner says nothing about how long a practitioner on a home connection waits to
publish, and it does not touch `dependencyWaitMs`. If anything it raises the
stakes slightly: the retry is sized on the premise that slow crossings are
intermittent, and the only measurement that could overturn that premise — rather
than confirm it on more runners — is the two-machine one below. The harness
prints a `::warning::` on every run that needed a retry precisely so that a
premise going stale is visible as a rate rather than invisible as a green tick.

### 4. There are no phone builds, and that is upstream

**There is no Android or iOS build, and the desktop builds cannot become one.**
The desktop app is Electron, which does not target mobile at all. A phone build
needs `tauri-plugin-holochain`, and the 0.7-capable work is cleanroom and
awaiting permission upstream. Android has been in active development upstream for
some time, and Holochain is under internal testing on iOS. **Neither changes this
repository's position** — the blocker here is the cleanroom plugin work, not
upstream platform support, so progress on Android and iOS does not produce a
phone build of this hApp.

So **"test on multiple phones" is not available at any schedule this repository
controls.** Multiple *computers* — Windows, macOS, Linux — is available, and is
what a first round of real testing has to look like. `mobile-ui` is
mobile-responsive and installable as a PWA, but it needs a conductor to talk to,
and on a phone there is not one.

---

## What will generate false bug reports

**Propagation is intermittently slow by minutes.** Measured crossings at 415s,
424.9s, 929.1s and 943.0s, alongside non-crossings inside 330s. §9 froze that
investigation deliberately: every remaining question sits in `kitsune2` or
Holochain's op store rather than in this repository.

For a stress test this is survivable, but **a user who writes a claim and sees a
peer not receive it for ten minutes will report a bug, not a latency figure.**
The protocol's whole value is claims reaching peers, so minutes-long silence is
a product characteristic.

**Partly mitigated, at the one moment it costs nothing.** The publish
confirmation read "Claim published." — true, and incomplete in the expensive
direction, since `create_claim` returning means the entry is on the author's own
source chain and nothing more. It now reads *"Published to your own chain. Peers
may take minutes to see it — that is expected on this network, not a fault."*
A statement about where the bytes are, identical for every claim, so it does not
breach §4.4's bar on this UI inferring a credibility ordering.

What does **not** exist is a per-claim indicator of whether a specific peer holds
it, and there cannot be one without a zome surface the protocol does not have.

**Nothing is code signed.** macOS quarantines the app with no UI to allow it;
users need `xattr -r -d com.apple.quarantine` from a terminal, which most will
not do.

---

## What is known and deliberate, not a bug

See `SECURITY.md` for the full list and the reasoning. In brief: **nothing in
the protocol resists sybil creation** — identity is free and containment is
topological, holding for what you traverse to and nothing for what you look up.
**Nothing is ever deleted and entries cannot be mutated**, which makes data
erasure structurally impossible and has real legal consequences for anyone
running this. **A modified coordinator stays on the network**, so the integrity
zome is the only trust boundary.

**No outside audit has been done**, and `bridge/`, `gateway/`, `federation/` and
`mcp-server/` have had no security review at all. None of them is part of what
an installing user runs — the `.webhapp` is the UI and the DNA — so they are
outside the attack surface of a tester, and inside it for anyone who deploys
them.

---

## The order to do things in

1. ~~**Merge the relay fix**~~ — **done 2026-10-12**,
   `epistemic-resonance-desktop` #4.
2. ~~**Release 0.2.0.**~~ — **done 2026-10-12.** #4 and #5 merged, the draft
   created by hand, `main` merged into `release`, all four platforms green,
   and the asset set checked before publishing as §1b demands. The manifest
   was additionally verified by sha512 against the published AppImage, which
   is the check `v0.1.1` fails. **Anybody can now test the current protocol
   without building from source.**
3. **Measure two consumer networks** against that build. If it fails, mass
   adoption fails, and everything else is premature.
4. **Then invite people — on desktop.** Ten, not ten thousand: enough to find
   what three conductors on one machine cannot, few enough that the propagation
   latency can be explained to each of them by hand.
5. **The publish-time caveat is in** (see above). What would still help before
   a second round is a per-claim delivery indicator, which needs a zome surface
   that does not exist — so it is a protocol change, not a UI task.

Scale beyond four nodes, a stated propagation bound, and the speed and
scalability work all come after step 4 has produced real reports — which is the
right order, and is what makes step 4 worth doing at ten people rather than at
one thousand.

### Engineering follow-ups, and what each is blocked on

**Current as of 2026-10-17.** The list above is the release order. This is the
work queue beside it, in the order it should be done, because the ordering is
about dependencies rather than size. Each line says what it is waiting for, so
the next session does not have to reconstruct that from a transcript.

| # | task | cost | blocked on |
|---|---|---|---|
| 1 | ~~**Wire `validation-corpus` into CI**~~ | — | **CLOSED 2026-10-13 (#264).** `enumerate.mjs` + a diff of the committed `corpus/inventory.json` run in the `no-conductor` job; `replay.mjs` runs in `conductor.yml` with the protocol-layer harnesses, and the `validation-corpus/node_modules` symlink that job was missing is wired. The drift check fires on LINE SHIFTS as well as rule changes, which is intended: the records carry line numbers and `replay.mjs` reports by line. Run against a real conductor before shipping — 6 passed, 0 failed — and both deferral assertions are green on a runner too, which is the SPEC §5.3 `must_get_*` assumption actually gated rather than asserted. Watched going red: one new `Invalid` site in `lib.rs` moves the inventory to 195 and reds the diff |
| 2 | ~~**Split `partition-rejoin` into its own job**~~ | — | **CLOSED 2026-10-13 (#264).** It is its own job and advisory BY CONSTRUCTION — branch protection requires five checks by name with `enforce_admins` on, so a job named anything else cannot block a merge and no settings change was needed. The harness is untouched and still goes red. Two things the plan did not name and that would have bitten: both jobs would have collided on one `upload-artifact` name, and v4 FAILS a duplicate rather than merging it; and the two jobs now run in parallel, safe despite the fixed 8894-8899 ports only because each gets its own runner VM. The split pays for itself with ten duplicated setup steps, so `scripts/check-workflow-setup-drift.mjs` holds the two copies byte-identical — a version bump applied to one job alone would leave the advisory job building a different hApp from the one the required check verified |
| 3 | ~~**Corpus: the shallow slice**~~ | — | **CLOSED 2026-10-13 (#265).** Five entry types now, 29 checks against a real conductor and 0 failed — 5 baselines, 18 rules, 6 coverage assertions. **The pattern generalised with no change to the logic**, so the Claim block was folded into one driver rather than copied four times; that is what this slice was for. Two mutations needed care and both are BOUNDARIES: `Mew`'s length rule is asserted at 561 bytes rather than a comfortable 600, since a value well past the limit passes against an off-by-one, and `Constitution`'s `expires_at` is asserted at EQUALITY because the guard is `<=` while the message claims `>`. Coverage is now a check in both directions — a rule with no case fails, and a case naming a rule the inventory no longer lists fails too — which is **the gap item 1's drift gate cannot see**: that gate watches `lib.rs` against `inventory.json`, this one watches `inventory.json` against the corpus. Watched failing three ways, including one case deleted with the inventory left correct (27/1) |
| 4 | ~~**Re-measure the baseline 2–3×, failing only when consistently slow — in `real-gossip` first**~~ | — | **CLOSED 2026-10-14.** `CROSSING_ATTEMPTS = 3` in `real-gossip.mjs`: a missed window is re-asked with a FRESH publish in a fresh domain, and the gate reds only when every attempt misses. **A fresh publish rather than a longer window, and that is the whole design** — a longer window asks "does THIS op ever arrive", which `OBSERVE_PAST_WINDOW_MS` already asks and deliberately does not gate; the retry asks "does a crossing work NOW", which is the invariant. Every attempt gets the SAME window, because a shorter one for retries would red a crossing `CONVERGE_WINDOW_MS` itself calls a pass — the #131 defect in a new place. THREE rather than two for a reason that is not statistics: the burst limiter allows 15 initiations per peer per 10 MINUTES, so two attempts can land entirely inside one such window. Four things the plan did not name: a green tick that needed a retry prints a `::warning::` naming every missed domain, since the risk of absorbing an intermittency is that it stops being counted; each retry re-takes §2's emptiness precondition, which is the one way the retry could turn a real failure green; the counted checks stay at 25 regardless of attempts, so a run's check count is still comparable; and **the job ceiling had to move, 45 → 60** — see the row below. Watched in six scenarios against stubbed conductors, including the retry succeeding, all three missing, and one arriving during the observation |
| 4b | ~~**The `network` job's 45-minute ceiling was already thin**~~ | — | **CLOSED 2026-10-14, and found while costing item 4 rather than looked for.** `real-gossip.mjs` now sums every serial wait it can spend in `worstCaseMs()` and refuses to START if that plus a setup allowance exceeds `JOB_CEILING_MS`, which must equal `network.yml`'s `timeout-minutes`. The arithmetic: **33 minutes at ONE attempt**, because sections 3, 5, 8 and 9 each wait on a crossing with the same 330s window — so 45 was thin before this change and nobody had added it up. Three attempts take it to 44 minutes of waiting, 50 with setup, hence 60. A ceiling a PASSING run can reach kills it and reports it as a failure, which is the flaky-red-meaning-nothing this repository has twice refused. `partition-rejoin` stays at 45 — different harness, different worst case — and its comment no longer claims to be "the same 45 as `network`" |
| 5a | ~~**Corpus: the first dependency chain**~~ | — | **CLOSED 2026-10-17.** `Retraction` is covered: 6 entry types, 38 checks, 0 failed against a real conductor. A spec may now declare an async `setup` whose result `baseline(ctx)` consumes, built once per entry type, with a chain that fails to build reported as its own red rather than letting every case below it "pass" by being refused for the wrong reason. **The chain cost one extra call, not a new mechanism** — which retires item 5's stated reason for being costed in hours. One rule is declared unreachable with its reason (`GAPS`) and asserted to still exist in the inventory, so an exemption outliving its rule reds the file. Watched failing in three injections, including the deferral asserted as a refusal (F, G, I) |
| 5b | **Corpus: the four remaining raw-payload entry types** — `critique`, `antibody_pattern`, `membrane`, `federation_record`, 22 assertable sites | 2–3 h | **Nothing, and 5a is the pattern.** All four have an extern taking the raw entry, so they are payloads plus a chain: `membrane` needs the creator's own `Constitution`, and `federation_record` needs a `Membrane` which needs that `Constitution` — **depth 2, the deepest in the zome.** Two costs are real and named here so they are not rediscovered: `critique` and `antibody_pattern` each carry an SWO temporal-friction rule enforced at 20 per rolling hour, which is what crashes `agent-sdk.mjs` on a second run inside an hour, so those two cases are rate-limited by the protocol itself; and four rules across these types are second-agent rules ("only by the membrane's own creator" and kin) that one conductor cannot reach — `GAPS` or a second agent, and `scripts/network.sh` already builds one |
| 5c | **Corpus: the 90 link rules** — 19 link types via the `attempt_*` probers | 3–5 h | **Nothing, but it is a third driver shape rather than more of 5a/5b, and this is the row item 5 never had.** 90 distinct messages across 19 link types, strongly patterned — `target must be an ActionHash`, `base is not a X`, `may only be created by the author` — so one driver over a per-link-type baseline should generalise the way the shallow slice did. It is the bulk of what item 5 called "the remaining 143 assertable sites" and was invisible in that framing |
| 5d | **Teach `enumerate.mjs` to cross-check the coordinator's externs** — 24 sites are counted assertable and mostly are not | 1–2 h | **Nothing, and it should precede 5b/5c rather than follow them, because it corrects the denominator they are planned from.** `crafted` assumes a hand-built payload can reach the validator, which holds only if an extern accepts the raw entry. For `worldline_trace`, `revelation`, `pre_registration`, `bridge_record` and `external_critique` none does — the extern takes a params struct and derives the fields the rules are about. **`generate_worldline_trace` is the worked case: 1 of its 8 sites is reachable**, not 8, and the classification is wrong in BOTH directions there. `enumerate.mjs` reads only the integrity zome, so it cannot see any of it |
| 6 | **A `0.1.4` publish, now carrying two fixes rather than one.** (a) `serverInfo.version` is hardcoded `'0.1.0'` at `mcp-server/src/index.ts:193` while the package is `0.1.3`, so every MCP client is told the wrong thing, and has been since `0.1.0`. (b) **`@holochain/client` floated to `0.21.1` on 2026-10-15 and broke the published SDK** | ~5 min of edits, then a publish | **The pin is fixed in-tree as of 2026-10-17; the publish is not, and that is now urgent rather than tidy.** This row used to say "nothing to fix; a publish to deliver" and batching it was free. It no longer is: `agent-sdk@0.1.3` declares `^0.21.0`, client `0.21.1` is the client for conductor `0.7.1`, and this repository pins `0.7.0` exactly because the zomes pin `hdk = "=0.7.0"` — so **a fresh `npm install` of the published package cannot sign a zome call** (`authorizeSigningCredentials` → `Failed to deserialize request`). Confirmed both ways against one local conductor, not inferred from dates. All six conductor-facing packages now pin `0.21.0` with no range, which fixes what CI packs; **the registry copy stays broken until `0.1.4` ships.** Caught by `published-packages.mjs` going red on a documentation-only commit — see its header. Also relocked `agent-sdk/package-lock.json`, which was stale at `0.1.1` |
| 7 | **`partition-rejoin`'s Phase 0 baseline has no retry, and it is the same crossing invariant `real-gossip` now re-asks** — port `CROSSING_ATTEMPTS` to it, or state in the harness why an advisory job is deliberately left to red on intermittency | ~30 min | **Nothing. Evidence arrived on its own, from the same run rather than from reasoning.** #267's run `38546085167` is a controlled comparison nobody set up: same runner class, same `network.sh` services, same minutes — `network` absorbed two missed 330s windows and went green, while `partition-rejoin` failed at `a claim crosses nodeA -> nodeB with both up (baseline)` and reported `SETUP FAILED: The network is not carrying claims even with both nodes up`. Item 4 scoped the retry to `real-gossip` **first** and that was right, because that is where merges are blocked; what it leaves is an advisory job whose most likely red is now an intermittency rather than a rejoin defect, and **an advisory check that reds for a reason unrelated to its subject is one people learn to ignore** — which is the signal `partition-rejoin` exists to carry. Not urgent: it blocks no merge by construction (item 2). Note the ceiling if it is ported — `partition-rejoin` is at 45 minutes with its own worst case, so it needs item 4b's `worstCaseMs` treatment and not a copied constant |

**A revision to item 4's dependency, from two CI runs rather than from
reasoning.** It is listed as blocked on a consumer-network measurement, on the
grounds that retrying the baseline is wasted job time if propagation is
routinely minutes-slow rather than intermittently so. That premise is about
where the retry would actually RUN, and the retry runs on a GitHub runner — so
consumer-network behaviour does not decide it. Two runs now bracket it: #263's
`partition-rejoin` was still at 0 ops at t+160s and failed, and #264's crossed
inside 60s and passed, both on the same runner class a day apart. That is the
intermittent signature item 4 assumes, and README §9's measured `network` pass
rate (83.1% before the dwell fix, ~86% after) is a far larger sample of the
same thing. **So item 4 is probably unblocked already** — and §3 is still worth
measuring, for the question it is actually about: whether a real user on a home
connection waits minutes to publish, and whether `dependencyWaitMs`'s
20-minute default is a datacentre number applied to consumer networks. Those
two questions were conflated when this queue was written.

### Where this session stopped — 2026-10-13

**Closed today, all merged to `main`:** queue items **1** (#264, corpus gated in
CI), **2** (#264, `partition-rejoin` split out and advisory), **3** (#265,
corpus covers five entry types with coverage asserted both ways). Each row in
the table above carries what the work found, including the two findings that
would otherwise be rediscovered: the drift gate watches `lib.rs` against
`inventory.json` and is blind to a correct inventory with a missing case, which
is why `replay.mjs` now checks the other direction itself; and
`upload-artifact@v4` fails a duplicate name rather than merging it.

**Next, and it is the one thing standing between this repository and merges
that do not need watching:** item 4 as re-scoped above — the baseline retry, in
`real-gossip`, ~1 h. Unblocked; no decision outstanding; nothing to measure
first.

**Yours rather than anyone else's:** §3's two-machine measurement. It is
independent of every queue item, and after today it is the input to
`dependencyWaitMs` alone rather than to item 4 as well.

**One bookkeeping trap, recorded because it cost real confusion today.** This
queue numbers its own items, and a working session will naturally number its
own plan too — and the two do not line up. Today's plan called the §3
measurement "item 4"; this table's item 4 is the baseline retry. They are
different pieces of work with different owners. **Cite queue items as "queue
item N" and release-order steps as "step N of the release order"**, as the
rest of this file does, rather than a bare number.

### Where this session stopped — 2026-10-14

**Closed today:** queue item **4** (the crossing retry, in `real-gossip` where
it blocks merges) and **4b** (the job ceiling it exposed, 45 → 60). Both rows
above carry what the work found. One correction landed on the way past:
`partition-rejoin`'s timeout comment claimed to be "the same 45 as `network`",
which stopped being true the moment `network` moved to 60.

**The one finding that was not on the plan.** The ceiling was already thin
before this change, not because of it: sections 3, 5, 8 and 9 each wait on a
crossing with the same 330s window, so even at ONE attempt the worst case is 33
minutes against a 45-minute ceiling. Nobody had added it up, and the arithmetic
is now a startup guard (`worstCaseMs`) rather than a comment, so the next person
to raise `CROSSING_ATTEMPTS` is told to move the ceiling with it instead of
discovering it from a killed run an hour in.

**How it was verified, and the honest limit of that.** ~~There is no Holochain
toolchain on this machine, so the harness could not be run against three real
conductors here.~~ **THAT SENTENCE IS FALSE and is struck rather than deleted,
because it is the second recurrence of a claim PR #253 already corrected — see
the 2026-10-17 section below.** `~/.cargo/bin` held `hc` and `holochain` 0.7.0
the whole time. What remains true is the limit, for a different reason: the
harness was in fact only run against stubbed conductors that day, so the
verification below is what it is. It did not have to be. The new control flow was exercised against stubbed conductors
in six scenarios — a healthy crossing on the first attempt (which must cost
nothing: one attempt, 25 counted checks, no warning), a retry succeeding on the
second and on the third, all three missing, one arriving during the observation
window, and a retry domain that was not empty — and each behaved as designed.
**What that does NOT cover is the thing the harness exists for:** a real
crossing over real iroh. **Measured on #267's first CI run and it went exactly
that far:** `network` passed in 3m35s — the same figure `network.yml`'s header
records for this job before the change — with the crossing arriving `after 0.0s,
on attempt 1 of 3`, and the startup guard printing `worst case 44.3 min of
waiting against a 60 min job ceiling` against the real constants. So the
single-attempt path and the budget arithmetic are confirmed on a real network,
and **the retry path is not**: a healthy run never reaches it. Its real-network
behaviour is first observed on a run that needs it, and the `::warning::` is
what will say so. **That run arrived on the next push to the same PR — see
2026-10-17 below, which replaces this prediction with the measurement.**

**Next, and nothing in the queue is blocked:** item **5** (corpus long chains,
3–5 h) and item **6** (the `mcp-server` version, which needs a `0.1.4` publish
to reach anyone and should be batched). Item 5 is the substantial one.

**Yours rather than anyone else's, and unchanged by today:** §3's two-machine
measurement. It decides `dependencyWaitMs` and whether a practitioner on a home
connection waits minutes to publish. Today's retry does not touch either, and
§3 above says why it does not.

**That measurement has since been overtaken, and the registry copy is worse
than it reads below.** As of 2026-10-15 a fresh install of
`@stateofintent/agent-sdk@0.1.3` cannot sign a zome call at all:
`@holochain/client` published `0.21.1`, the package declares `^0.21.0`, and
`0.21.1` is the client for conductor `0.7.1` while this repository pins `0.7.0`
exactly. So `authorizeSigningCredentials` fails `Failed to deserialize request`
and every `tools/call` is dead for a reason that has nothing to do with a
conductor being absent. In-tree the pin is fixed; **on the registry it is broken
until `0.1.4` ships** — queue item 6. Read the paragraph below as the
2026-10-12 measurement it is.

**What an AI agent discovering the published packages actually gets**, measured
2026-10-12 against `@stateofintent/mcp-server@0.1.3` installed fresh from the
registry and driven over stdio: install works, `initialize` works, `tools/list`
returns all **9 tools** with no conductor at all — and every `tools/call` fails
with `could not connect to Holochain Conductor API … ECONNREFUSED`. That is the
same split `published-packages.mjs` exists to catch, in the field: listing tools
proves nothing about using them. Seamless use needs `hc` and `holochain` 0.7.0,
a conductor with this hApp installed and enabled, **and Admin API access** —
`agent-sdk` connects via `AdminWebsocket` and calls
`authorizeSigningCredentials`, which its own comment notes is "NOT the
production multi-tenant model". The published MCP server assumes it **owns** its
conductor. **There is no agent swarm**: it was offered and not chosen, and
nothing in this repository sends agent traffic at the hApp.

### Where this session stopped — 2026-10-17 (the crossing retry, measured)

**Nothing was built today. A CI run that finished after the last session had
already answered its open question, and this session's whole output is reading
it and writing down what it said.** The corpus and the dependency pin came
after, and have their own section below.

**The question it answered.** The 2026-10-14 section above predicted that the
crossing retry's real-network behaviour would first be observed "on a run that
needs it, and the `::warning::` is what will say so". #267's second `network`
run — `38546085167`, 22m27s against the 3m35s of its first — is that run. The
forward leg missed **two** full 330s windows and a third fresh publish crossed
in **243.5s**; the gate went green, the `::warning::` named both missed domains,
and the startup guard's budget held. **So the retry path is confirmed on a real
network, and `CROSSING_ATTEMPTS` is the reason a merge was not blocked by a
network that took fifteen minutes to carry one claim.**

**The finding that was not predicted, and it is the one worth carrying
forward.** Three attempts rather than two was argued from the burst limiter
before any run needed it — 15 initiations per peer per 10 minutes, so two
attempts can sit inside one window. This run's attempts 1 and 2 began at
10:00:52 and ran to 10:10:51, inside a single such window, and both missed;
the attempt that crossed is the first one past it, with `initiate too soon=25`
in nodeB's census. **A two-attempt retry would have reddened this run.** The
reasoning was load-bearing rather than cautious, which a stubbed scenario could
not have shown.

**And the same run is a controlled comparison nobody set up — hence new queue
item 7.** `partition-rejoin`, on the same commit and the same minutes with no
retry, failed at its Phase 0 baseline: `the network is not carrying claims even
with both nodes up`. Item 4 scoped the retry to `real-gossip` first and that was
correct, since that is where merges are blocked. What it leaves behind is an
advisory job whose likeliest red is now an intermittency rather than a rejoin
defect, and an advisory check that reds for reasons unrelated to its subject is
one people stop reading. ~30 min, blocked on nothing, and it needs item 4b's
`worstCaseMs` treatment rather than a copied constant.

**The number that now needs watching, recorded in §3 rather than here because
that is where the count lives.** Pooling both harnesses, four of eight
observations are slow enough to have failed without a retry, against two of five
before this run. Four of eight is not "most runs", so the premise the absorption
rests on holds as written — and it is no longer a comfortable minority.
`CROSSING_ATTEMPTS`'s own comment names "a retry needed on most runs" as the
condition under which the gate is hiding a routine failure, so **this rate is
the thing that decides whether the retry stays honest, and it only works as a
rate if every occurrence gets written down.**

**Where #267 stands.** All five required checks pass (`zomes`, `no-conductor`,
`conductor`, `ui`, `network`); `partition-rejoin` is red and is advisory by
construction, which is item 2 working as designed and is also what item 7 is
about.

**It is still a draft, and deliberately.** Today's commit is documentation only,
but pushing it re-triggered all six checks, so the green above belongs to the
parent commit rather than to the head. The remaining actions are therefore both
yours and in this order: take it out of draft once this run's five required
checks are green, then merge. **If `network` reds on this run, read the
`::warning::` before re-running it** — a second absorbed crossing would move the
count in §3 from four of eight to five of nine, and that is a number worth
having rather than discarding with a re-run.

**Yours rather than anyone else's, and still unchanged:** §3's two-machine
measurement. Two sessions of retry work have not touched it and §3 says why.

### Where this session stopped — 2026-10-17 (the dependency pin, and corpus 5a)

**Read this with the section directly above**, which covers the crossing-retry
measurement on #267. This one is #268 and #269, and the two were one session.

**THE TOOLCHAIN IS ON THIS MACHINE, and that is the third time this has had to
be written down.** `~/.cargo/bin` holds `hc` 0.7.0, `holochain` 0.7.0 and
`kitsune2-bootstrap-srv` 0.5.1 — exactly what `scripts/ci/install-holochain.sh`
installs, because that is where it installs them. PR #253, *"The toolchain was
installed the whole time"*, corrected this claim and is merged into `main`; the
2026-10-14 handoff section then repeated it verbatim — *"There is no Holochain
toolchain on this machine"* — and used it to explain why the crossing retry was
only stub-verified. `scripts/sandbox.sh` resolves `~/.cargo/bin` itself and has
since before any of this, so nothing was blocked at any point. **What it cost
today is nothing and what it has cost twice is a session's worth of verification
each time**, which is why it is in the queue-adjacent prose rather than a commit
message: `which holochain` printing nothing is not evidence of absence on this
machine, and the only check that counts is `ls ~/.cargo/bin`.

The one prerequisite that genuinely was missing is a packed bundle —
`hc app pack .` writes `epistemic-resonance-happ.happ`, which `sandbox.sh start`
needs and which is gitignored. That is a build step, not an install.

**Closed today:** queue item **6a** (the `mcp-server` version string, now READ
from `package.json` so the second place is gone rather than corrected, verified
over stdio as reporting `0.1.3`) and queue item **5a** (the first dependency
chain — `Retraction`, 38 checks, 0 failed). Item **6**'s row is rewritten: it is
no longer a tidy-up batched behind a publish, because the published package is
now broken in the field.

**The unplanned work, and it blocked everything else.** `published-packages.mjs`
went red on #267's documentation-only commit. `@holochain/client@0.21.1`
published 2026-10-15, `agent-sdk` declared `^0.21.0`, and 0.21.1 is the client
for conductor 0.7.1 while this repository pins 0.7.0 exactly — so a fresh
resolve cannot sign a zome call. **The defect was the caret, not the release.**
#268 pins all six conductor-facing packages. Confirmed both ways against one
local conductor rather than inferred from the dates.

**What is NOT fixed by that pin:** the registry copy of `0.1.3`, which has been
broken since 2026-10-15 for anyone running `npm install`. Only a `0.1.4` publish
reaches them, and that publish is yours — queue item 6.

**Next, in this order and the order matters:** item **5d** before 5b and 5c,
because it corrects the denominator both are planned from — 24 sites are counted
assertable and mostly are not. Then **5b** (four raw-payload entry types, 22
sites, with the depth-2 `Constitution → Membrane → FederationRecord` chain) and
**5c** (90 link rules, a third driver shape). Item 5's original "3–5 h for the
remaining 143" was an estimate for about a sixth of the work, under a reason
that turned out to be wrong.

**One trap to carry forward, because it cost a confusing probe today.** A zome
call from outside the launcher fails with `no signing credentials have been
authorized for cell [..]` until `authorizeSigningCredentials` is called per
cell. `replay.mjs`'s own comment says it reads exactly like a validation
refusal to a harness that only checks "did it throw" — and it reads exactly
like one to a person writing an ad-hoc probe, too.

**Yours rather than anyone else's, and unchanged by any of today:** §3's
two-machine measurement, and the `0.1.4` publish.
