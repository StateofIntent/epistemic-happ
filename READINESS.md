# Can this be handed to strangers yet?

**Short answer: to a handful of people on desktop computers, yes — the release
is cut. To a crowd, and on phones, no — and the phone part is not a scheduling
problem.**

**`v0.2.0` of the desktop app was published on 2026-10-12** carrying
`protocol_version: 9`, which closes §1 below and makes step 1 and step 2 of
*The order to do things in* done. The next thing that matters is step 3:
two consumer networks, **measured on 2026-10-22, including the two-home-router
case** — a mobile CGNAT pair both directions with a negative control, then four
crossings between two separate households on two ISPs, all under seven seconds
and two of them sub-second in transit (§3).

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

### 3. Two consumer networks: measured on 2026-10-22

This is the one that decides whether "people sharing info" works at all, and it
is first in §9's priority order for a reason.

**MEASURED 2026-10-22 — home broadband to mobile CGNAT, both directions, with a
negative control.** Three runs on two machines — a desktop on home broadband
and a laptop moved onto a phone hotspot — by hand, following
[`docs/cross-internet-runbook.md`](docs/cross-internet-runbook.md):

| run | direction | result |
|---|---|---|
| 1 | home broadband -> mobile CGNAT | **CROSSED.** Discovery + gossip **under 111s**. The reader started *after* the write, so nothing is resolved below that bound — see the ordering note below |
| 2 | mobile CGNAT -> home broadband | **CROSSED.** Write at `11:14:22Z`, readable on the far host at `11:14:24Z`: **under 2s** to gossip one entry between peers that had already found each other, and **under ~85s** for discovery and gossip together |
| 3 | **control** — different seeds, same domain | **NO CROSSING in 600s**, with **82 polls after the write, every one empty.** This is the run that makes 1 and 2 mean anything |

**FIVE MORE CROSSINGS THE SAME AFTERNOON, four of them with a lower bound as
well as an upper one.** The three runs above were one trial per direction; a
trial series on the same pair, varying only the domain so the peers stayed
discovered, turns that into a spread. Two further trials restarted both
conductors on fresh seeds to sample the *cold* case — the one a person actually
meets when they open the app and nobody is there yet.

| sample | peers | write | last empty poll | readable | crossing |
|---|---|---|---|---|---|
| run 2 | warm | `11:14:22Z` | `11:14:19Z` (pre-write) | `11:14:24Z` | **under 2s** |
| trial 1 | **cold** | `11:47:21Z` | `11:47:23Z` (+2s) | `11:47:28Z` | **2-7s** |
| trial 2 | warm | `11:49:10Z` | `11:49:08Z` (pre-write) | `11:49:13Z` | **under 3s** |
| trial 3 | warm | `11:51:34Z` | `11:51:33Z` (pre-write) | `11:51:38Z` | **under 4s** |
| cold 2 | **cold** | `11:55:40Z` | `11:55:41Z` (+1s) | `11:55:46Z` | **1-6s** |

**Every crossing on this path was single-digit seconds, and cold was not
distinguishable from warm at this resolution.** That is the opposite of what
CGNAT pessimism predicts: in `cold 2` host A had been on that network for 57
seconds, had never met the other peer, and had the entry 6 seconds after it was
written. Discovery is therefore not adding a measurable penalty here beyond a
few seconds — which is a statement about *this* path on *one* afternoon, not
about residential NAT in general.

**Why the positives are admissible.** Identical DNA hash on both hosts within
each run, **different** agent keys, different public-IP fingerprints, and a
byte-identical `.happ` copied between the machines rather than rebuilt on each.
Run 3's two hosts print *different* DNA hashes by construction — that is the
isolation being exercised, not a fault.

**The 2s figure compares clocks on two different machines**, so it rests on
their agreeing to within about a second. **Both hosts reported
`System clock synchronized: yes` with an active NTP service**, checked on each
rather than assumed, so the comparison rests on NTP agreement. The 5s poll grid
is still the resolution floor, so read it as "under 2s, unresolved below".

**AND THEN THE TWO-HOME-ROUTER CASE ITSELF, the same evening.** The desktop
stayed on its home connection; the laptop was carried to another household and
joined that house's `TelstraBE428C` — a different premises on a different ISP.
Four domains, one claim each, with the desktop already polling all four before
the laptop ever wrote:

| sample | laptop wrote | desktop's last empty poll | desktop received | crossing |
|---|---|---|---|---|
| r1 | `13:02:58Z` | `13:03:00Z` (+2s) | `13:03:05Z` | **2-7s** |
| r2 | `13:08:32Z` | `13:08:34Z` (+2s) | `13:08:39Z` | **2-7s** |
| r3 | `13:11:28Z` | `13:11:25Z` (-3s) | `13:11:30Z` | **under 2s** |
| r4 | `13:19:38Z` | `13:19:36Z` (-2s) | `13:19:41Z` | **under 3s** |

r1 and r2 carry a **lower** bound as well as an upper one: the reader polled
and found nothing *after* the write had already happened. Nothing in this
repository has had a two-sided bracket on cross-internet propagation before.

**The validity chain, every link checked rather than assumed:** public-IP
fingerprints `96ad274aef89` (home) against `4eed418b9c87` (the other house);
identical DNA hash `hC0k/CQhlEXP...` printed on both ends; different agent keys
(`hCAkFRdfGREV...` reading, `hCAkNJapXNyQ...` writing); the `.happ` verified by
`sha256` on the far machine before it was used; and both clocks reporting
`System clock synchronized: yes`.

**TWO OF THOSE FIGURES ARE INFLATED BY THE MEASUREMENT, AND THE CONDUCTOR LOG
SAYS SO.** The reading host logged `database is locked` from
`integrate_dht_ops_consumer` at `13:08:32.478Z` and `13:11:28.697Z` — the same
second as r2's and r3's remote writes. That host is a pure reader and writes
nothing, so the integration workflow running at all means **the ops had already
arrived**. Transit between the two houses was therefore **sub-second**, and the
2-7s and under-2s above are dominated by local integration.

The contention is self-inflicted: four readers were run in parallel against one
conductor so that the away host could publish without coordinating, and that is
four app connections competing to integrate. It buys an unattended run at the
cost of the resolution it was measuring. **Run one reader per conductor if the
figure matters**; the runbook now says so.

**What this does not close.** Both peers were up and waiting in every run, so
the returning-offline-node case is untouched. The trial series is five crossings on one mobile
carrier and one home ISP within half an hour, and the two-house run is four on
one pair of households — spreads for those paths, not a sample of consumer
networks generally. And these were two `hc sandbox` conductors, not two copies of the
Electron build — what transfers is the relay path, not the packaging.

The datacentre figure stands unchanged: **one** crossing, inside 5.0s.

**The tooling exists and the measurement is cheap.** Two people on two different
home connections, or one person on home broadband and a phone hotspot. The
operator-ordered version of this — three runs including the negative control,
and the five things that silently invalidate one — is
**[`docs/cross-internet-runbook.md`](docs/cross-internet-runbook.md)**; the
sketch below is the shape of it:

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

**AND THE MEASUREMENT NOW EXISTS, THOUGH IT SIZES LESS THAN IT SETTLES.** The
2026-10-22 runs say consumer propagation on *this* path is not routinely
minutes-slow: 2s between discovered peers, under 111s including discovery. So
the retry's premise — that slowness is intermittent rather than the norm — is
not contradicted by the first consumer data. But n is small, and the figure to
size against turned out not to be the steady-state crossing at all.

**CORRECTION, SAME DAY: this paragraph first said `dependencyWaitMs`'s 20
minutes was "roughly 600x the measured crossing", and that was the wrong
comparison.** It measured 20 minutes against *steady-state gossip between
connected peers* — 2s to 7s — which is not the case a timeout exists for. §3b
measures the cases that are: a peer that changes network address took **368-373s**
to deliver, and a peer returning from a 14-minute outage had **not delivered
after 905s**. Against those, 20 minutes is the right order of magnitude and
arguably tight rather than absurd. The original claim is left visible rather
than deleted because the error was in the choice of baseline, which is the kind
of mistake a replacement number would hide.

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

### 3b. A returning node is not a new node, and the gap is large

**Measured 2026-10-22, and partly spoiled by the instrument — both halves of
that are recorded here.** §3 established that entries cross between consumer
networks in single-digit seconds. This asks the next question: what happens to
a node that was *offline while history was written* and then comes back. Every
figure in §3 had both peers up and waiting, which is connecting rather than
catching up.

Setup: the desktop on home broadband, the laptop on a phone hotspot, both on
one seed, peering confirmed across the internet first (a claim crossed in
under 2s). Then the laptop's network was taken down with `nmcli device
disconnect` — **not** `cross-internet-node.sh stop`, which deletes the database
and would make it a new node rather than a returning one.

| case | what happened |
|---|---|
| **Address change, conductor alive** | The laptop moved from home wifi to the hotspot. The desktop logged the connection loss at `14:06:42`; a claim written at `14:09:21` became readable on the laptop between `14:15:29` and `14:15:34` — **368-373s from the write, 527-532s from the drop** |
| **Return after a 861s outage** | Offline `14:18:23`-`14:32:44` with three claims written inside the gap. Back online, the laptop had **none of them after 905s** |
| **A brand-new node, same moment, same seed** | Generated at `14:47:53`, conductor up `14:47:59`, had **all three claims on its first poll** by `14:48:11` — roughly 15 seconds from not existing |
| **Completeness, once recovery happened** | The laptop got `gap2` and `gap3` on the first poll as well. Catch-up is **all-or-nothing, not partial** — no silently missing middle |
| **Round 2: return after a 154s outage, nothing else joining** | **Self-recovered in 304-309s** from reconnect, bracketed both sides — within seconds of the 300s per-peer initiate floor |

**THE ASYMMETRY IS THE FINDING.** A peer that has never been seen gets the
entire history in seconds. A peer that was known, went away, and came back had
over fifteen minutes with nothing. The desktop's conductor log is consistent
with it: across the whole run its only transport entries are the two
disconnections, with no retry and no error. This is the case a desktop app hits
every time somebody shuts a laptop, and it behaves worse than a fresh install.

**AND THE SELF-RECOVERY FIGURE WAS DESTROYED BY MEASURING IT.** The laptop
finally crossed at `14:49:04` — **65 seconds after the brand-new node joined**
the same network. Whether it self-recovered after ~980s or was unblocked by the
third node's arrival (new agent info, fresh gossip activity, possibly fetching
from that node rather than the desktop) cannot be separated from one run. The
"980s" is therefore **not** a recovery time and must not be quoted as one. Same
class of error as §3's four-parallel-readers contention: the instrument
perturbing what it measures, twice in one day, in opposite directions.

What is solid is the **lower** bound, which the confound cannot touch: no
recovery for at least 905s, measured against the moment before the third node
existed.

**One caveat on the new node, stated rather than buried:** it ran on the
desktop's own machine, so its path to the data was local. That does not weaken
the availability conclusion — the claims were served, completely, on demand —
but its ~15s is not a cross-internet figure.

**ROUND 2 ANSWERS THE "UNAIDED" QUESTION, AND IT LANDS ON A DOCUMENTED
CONSTANT.** Same pair, a 154s outage, one claim written inside it, **nothing
else joining the network and nothing touched from the serving side**:

| event | time |
|---|---|
| laptop offline | `14:54:11Z` |
| claim written | `14:56:03Z` |
| laptop back online | `14:56:45Z` |
| reader polling from | `14:57:07Z` |
| last empty poll | `15:01:49Z` |
| **readable** | **`15:01:54Z`** |

**Self-recovery in 304-309s from reconnect**, bracketed on both sides. That is
within a few seconds of kitsune2's **300s per-peer minimum initiate interval**,
which this file already describes elsewhere as the reason an exhausted gossip
allowance reaches past a 300s ceiling. A returning peer appears to wait out
exactly that floor before it can ask again.

**SO ROUND 1 IS NOT EXPLAINED, IT IS SHARPENED.** 905s with no recovery is
**three times** the floor that round 2 landed on. The two runs differ in one
obvious variable — 861s offline against 154s — so outage length is now the live
question rather than a caveat: something about a longer absence appears to cost
more than one re-initiate window. The weakness noted when round 2 was designed
(shortening the outage changes the variable most likely to matter) turned out to
be the finding.

**Still open:** a round 3 with the outage matched to round 1's ~861s and
nothing else joining, which is the only run that separates "long outages fail
to self-recover" from "round 1 was unlucky". Neither answer is available from
two runs.

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

**Propagation is intermittently slow by minutes.** Measured crossings at 175.4s,
210.5s, 415s, **421.1s**, 424.9s, **884.8s** (×2, 2026-10-21, local three-node),
929.1s and 943.0s, alongside non-crossings inside 330s. **Every one of these is
a poll-lattice sample, not a latency** — see the correction below, which is why
the figures cluster the way they appear to. §9 froze that investigation deliberately: every remaining question
sits in `kitsune2` or Holochain's op store rather than in this repository.

**The 421.1s was recorded on 2026-10-20 from [#296](../../pull/296)**, a
comment-only change to `partition-rejoin.mjs` itself — so it joins 210.5s
(#278) and 175.4s as an occurrence on a change that provably could not have
caused it.

**AND IT CAME BACK TWICE, IDENTICAL TO 0.1s, WHICH IS A DIFFERENT KIND OF
OBSERVATION FROM A SLOW CROSSING.** Runs
[`39360577602`](../../actions/runs/39360577602) and
[`39362103541`](../../actions/runs/39362103541) are consecutive, independent
runs of the same comment-only commit, and both report **`baseline crossed in
421.1s`** — checked from each run's own log rather than inferred. Network
variance does not produce the same figure twice to a tenth of a second.
**The hypothesis this suggests is a DETERMINISTIC timeout or a fixed retry
schedule, not a distribution** — and the recorded figures are consistent with
that reading: 415s, 421.1s, 421.1s and 424.9s cluster inside ±5s of ~420s,
while 929.1s and 943.0s sit near ~936s. If a constant is being hit rather than
a network being slow, the number to find is in `kitsune2`'s backoff or round
scheduling, not in a propagation distribution.

> **BOTH SENTENCES ABOVE ARE WRONG, AND THE RULING BELOW IS THEREFORE A
> MEASUREMENT RATHER THAN A DECISION — struck through in place because the
> error is more instructive than a corrected paragraph.** `awaitConvergence`
> **samples every 5 seconds.** It reports `polls × (POLL_MS + two zome calls)`,
> so **every true crossing inside one 5s window collapses to a single reported
> figure**, and the tenth-of-a-second on the end is accumulated call overhead
> over a fixed poll count — it comes from the sampler, not from the network.
>
> So *"network variance does not produce the same figure twice to a tenth of a
> second"* is exactly backwards for this instrument: **variance smaller than
> the sampling interval produces identical reported figures by construction.**
> Demonstrated rather than argued — simulating the loop's own shape, true
> crossings at 418.0s, 419.5s, 420.9s and 421.0s all report as **`421.1s`**,
> and true crossings spanning 416.0s–421.0s yield just **two** distinct
> reported values.
>
> And the cluster offered in support — *"inside ±5s of ~420s"* — **is the
> sampler's step size.** A spread whose width equals the sampling interval is
> the finest distinction the instrument can draw, so it is a fact about the
> sampler restated as a finding about gossip. The same applies to 929.1s and
> 943.0s sitting "near ~936s": 13.9s apart is under three polls.
>
> **What this does NOT show is that the deterministic-timeout reading is
> false.** It shows the observation cannot distinguish it from ordinary
> variance, which is a different and weaker claim — and the honest one. What
> would distinguish them is a sampler finer than the effect; at `POLL_MS = 5000`
> there is no measurement here to rule on.
>
> `partition-rejoin.mjs` now prints the poll count and the resolution beside
> every figure it reports, at all four sites, so a lattice sample cannot be
> read as a distribution sample again. That is the fix for the misreading, and
> it is cheaper than the investigation it nearly triggered.
>
> **AND A LIVE RUN THEN DEMONSTRATED THE MECHANISM OUTRIGHT, which is better
> evidence than the simulation.** Run against three real local conductors on
> 2026-10-21, all 25 checks green: the baseline reported **`5.1s (poll 2)`**
> and the post-heal crossing **`5.0s (poll 2)`** — **two crossings, the same
> poll index, figures differing by 0.1s.** That 0.1s is accumulated call
> overhead and nothing else, which is precisely the digit §3 treated as
> significant when the same two decimals repeated at 421.1s. Catch-up measured
> 30.2s (poll 7) and 20.1s (poll 5): ten seconds apart, two polls apart, and
> genuinely resolvable — the instrument is not useless, it is just blind below
> its step.
>
> **AND THE SIBLING HARNESS THEN REPRODUCED THE EXACT PHENOMENON §3 CALLED
> ANOMALOUS, in one run, on the same afternoon.** `network-partition.mjs`
> (under `scripts/netns.sh`, all checks green, exit 0) reported
> **`nodeA converged in 884.8s (poll 177)`** and
> **`nodeB converged in 884.8s (poll 177)`** — two convergences, opposite
> directions, **identical to a tenth of a second.** Same poll index, same
> accumulated overhead, same figure.
>
> **The caveat is real and is stated rather than buried: these two were
> measured CONCURRENTLY from near-identical start times**, so their clocks are
> correlated in a way two separate CI runs' are not. It is therefore not a
> perfect analogue of the 421.1s pair. What it does show, directly, is that
> **the tenth-of-a-second digit carries no independent information** — it is
> the lattice plus overhead, and two measurements on the same lattice agree to
> it as a matter of course. A reading built on that digit is built on nothing.
>
> It is also a fresh crossing figure for the list above: **884.8s**, which sits
> in the already-documented minutes-long range and is another sighting of a
> mode already named.
>
> **The same sweep found three more harnesses reporting figures from the same
> kind of sampler, and one of them is a headline number.** `network-partition.mjs`
> has the identical four sites at `POLL_MS = 5000`; `peering-rate.mjs` samples
> at 3s and **compares arms**, so two arms whose true difference is under 3s
> cannot be distinguished by it at all (its own summary already noted a median
> of "3.0s", which is one poll); and `cross-internet.mjs` samples at 5s, which
> is where **the single measured datacentre-to-datacentre crossing README §9
> cites as "5.0s"** comes from. That one polls at t≈0 and then every 5s, so
> "5.0s" means ABSENT at the first check and PRESENT at the second: **an upper
> bound of 5s, not a latency of 5s.** It understates the substrate rather than
> flattering it — the opposite error to the one at 421.1s, from the same cause.
> All four now report their resolution.

**RULED 2026-10-21: IT DOES NOT CLEAR THE BAR, AND NOBODY HAD TO DECIDE
THAT.** §9 froze the gossip investigation and named its reopen condition
precisely: *"a CI failure whose FIRST occurrence is already outside everything
documented here"*, and explicitly NOT *"a slow crossing, or another sighting of
a mode already named"*. The repeated constant looked like it might be outside
what is documented, because nothing here describes the slowness as
deterministic — and **the repetition turns out to be a property of the
instrument**, not of the network: a 5-second sampler reports identical figures
for any two crossings in the same window, which is the quoted block above.
**So this is another sighting of a mode already named — a slow crossing — read
through a sampler too coarse to say anything more**, and §9's condition
excludes it explicitly.

**IT WAS FILED AS A DECISION AND IT WAS A MEASUREMENT, which is the fourth row
in two days to carry that mistake.** The previous sentence here was *"that is a
call about where to spend effort rather than a measurement"*, and the effort it
would have cost was reading one constant in the harness that produced the
figure. Items 21, 20 and 11 each had a blocker naming a person where the work
was labour; this one named a judgement where the work was arithmetic. **The
common shape is a blocker written from the conclusion rather than from the
obstacle** — and in every one of the four, the thing that resolved it was
re-reading the row's own subject instead of its summary.

**The instruments did their job in a narrower sense than this section claimed:
the signal arrived, and it was legible only once its resolution was stated
alongside it.** An instrument that reports a figure without its own precision
invites exactly this inference, and three other call sites in the same harness
were printing bare figures the same way. **Seven measurements now span 175.4s to 943.0s**, which is the
spread, not a tail: the figure a bound would have to clear keeps moving, which
is why §9's propagation row chose to surface closure rather than promise one.
Recorded here rather than acted on, per item 7 — one occurrence is not a
distribution and now there are seven.

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
| 5b | ~~**Corpus: the four remaining raw-payload entry types**~~ | — | **CLOSED 2026-10-17.** `critique`, `antibody_pattern`, `membrane`, `federation_record` are covered: **10 entry types, 68 checks, 0 failed** against a real conductor. The depth-2 chain works (`Constitution → Membrane → its EntryHash`). **Two findings, and both are the reachability question 5d opened wearing new clothes.** (1) The coordinator PRE-CHECKS four of `Membrane`'s rules and both SWO friction rules, refusing first with its own wording — so cases driven through `create_membrane` passed by being refused for the wrong reason, and one came back naming a DIFFERENT rule because the coordinator checks in another order. `attempt_unaccountable_membrane` is the way through for `Membrane` and already existed for exactly this purpose; for the two friction rules **no bypassing extern exists**, so they are declared unreachable — which means **what is tested is the coordinator's courtesy and what is untested is the DHT enforcement**, the inversion this corpus exists to find. (2) `Membrane's constitution hash does not resolve…` needs `to_app_option` to return `Ok(None)`: a dangling hash defers, a Claim's ActionHash raises `Deserialize("missing field \`agent\`")`, and only an action with NO app entry — a CreateLink, built through `attempt_false_attachment_link` — fires it. Watched failing three ways (L, M, N), L being the one that matters: without the prober, three green ticks meant nothing. Also corrected: this row said four second-agent rules; there are **three** |
| 5c | ~~**Corpus: the link rules**~~ | — | **CLOSED 2026-10-18. All NINETEEN link types a published path can drive are covered: 92 → 217 checks across the day, 0 failed, every rule asserted or accounted for.** The last slice was the four rate-limited types — `CritiqueToSpecies`, `SpeciesToParent`, `TargetToCritique`, `TargetToAntibody`, 20 rules — grouped for a reason that is not about their rules: `Critique` and `AntibodyPattern` are capped at **20 per rolling hour** each (§6), so every setup spends allowance a later run will not have. They were written economically (agent 2's single critique declares a species AND names a target, serving two owner rules) and run ONCE, because iterating them separately fails for friction rather than for a defect — the kind of red that teaches people to ignore a harness. Watched failing (AC): **211 passed, 6 failed**. **The honest remaining denominator is not zero and it is not rules** — it is the five link types in item 18, which no extern can reach at all |
| 5d | ~~**Teach `enumerate.mjs` to cross-check the coordinator's externs**~~ | — | **CLOSED 2026-10-17.** The tool reads both zomes now, and the labour is split where it belongs: it parses each extern's struct literal to record, per entry field, whether the value is the caller's or the host's — mechanical — while mapping a RULE to the field it guards is curated in `GUARDS_FIELD` for the messages that name no field, and **a params-only site matching neither stops the build with exit 1 before the inventory is written.** The gate fired twice on real omissions during development. New class `needs_extern`, 10 sites; `crafted` 130 → 120, `honest` 24 → 19. **Of the 24 sites across the five params-only entry types, 9 are assertable as refusals** — `worldline_trace` is 1 of 8, as predicted by hand. Two implementation details were each found by being wrong first: matching only caller-controlled field names sends `trace_payload exceeds 64KB limit.` to "unresolved" precisely BECAUSE its field is derived, so the match runs over every field and membership decides afterwards; and EARLIEST field name in the message wins rather than longest, since `ExternalCritique importer must match action author. Note this is … `author_handle`` names two and guards the first. Watched failing two ways (J, K), K being the one that matters — it confirms the class is computed from the coordinator's source rather than a typed list of entry types |
| 5e | ~~**Teach `enumerate.mjs` that a coordinator pre-check can shadow a rule**~~ | — | **CLOSED 2026-10-20, and the sweep this row asked for answers its open question: NO others.** Nine shadowed sites exist — the six 5b found by running into them, plus the three LINK friction rules items 18 and 19 had already declared by hand for the same reason — and nothing else in either zome. `create_claim` and friends do carry pre-checks, and none of them shadows a rule. **Seven of the nine resolve mechanically**, on the expression text: a pre-check and its twin are usually the same Rust, so conditions are compared after normalising the one difference the pair always has — the integrity constant's `_VALIDATION` suffix, five such pairs. **Two are curated and the build fails if either stops matching** — the constitution-resolution rule (`let Some(c) = .. else` against `.ok_or(wasm_error!(..))`, the same refusal written two ways) and `Membrane creator must match action author.`, which has no twin at all and is shadowed by ORDERING: forging the creator trips the extern's constitution-ownership check first, which is what 5b observed. **THE BYPASS DISTINCTION THIS ROW ASKED FOR IS KEPT AND DECIDES THE CLASS.** With a raw-write path the rule stays assertable and carries an `enforcement_caveat` naming the extern that must NOT be used — four `Membrane` rules via `attempt_unaccountable_membrane`, three link friction rules via `attempt_false_attachment_link`. Without one it leaves the denominator as the new `shadowed` class: the `Critique` and `AntibodyPattern` friction rules, which nothing writes without its friction helper. **Two hand-written declarations in `replay.mjs` were DELETED rather than kept**, because the tool now derives from the two zomes exactly what they asserted in prose, and two copies of one fact is how one of them rots — `critique: 5 of 5` now, instead of `5 of 6, 1 declared unreachable`. The three LINK declarations stay: shadowing is not their only reason, each also needs a budget one run cannot spend, and that half is not mechanical. **THE PART WORTH CARRYING FORWARD IS TWO BUGS IN THIS TOOL'S VIEW OF THE COORDINATOR, both of which failed by producing an ABSENT answer rather than a wrong one** — the SynapticLink friction rule went missing from the analysis three times over. (a) **The extern scanner could not see wrapped signatures**, requiring the parameter on the `pub fn` line, so **five of 68 externs were invisible including BOTH multi-line `attempt_*` probers** — the three link rules reported no raw-write path while the prober written for that purpose sat in the tree. Same shape as item 18's `PROBED_LINK_TYPES`: a confident conclusion from an input nobody maintained. 5d's entry classifications are unaffected, so the hole was latent for entries and live for links. (b) **The guard window was too tight by exactly one comment block** — `check_synaptic_link_friction` explains itself in four comment lines between its `if` and its `return Err`, so its condition read as absent. **And one bound that was wrong rather than merely stated:** guards were collected one call level deep, documented as covering every case here, and `create_critique` reaches the SynapticLink pre-check in TWO hops. Now a transitive closure with a visited set, which removes the judgement instead of restating its limit. Verified: `replay.mjs` **244 passed, 0 failed** against a real conductor, and the inventory drift gate regenerates clean. Full account in `scripts/validation-corpus/README.md` *Finding 12* |
| 5f | ~~**Run the corpus against two agents**~~ | — | **CLOSED 2026-10-18. All seven second-agent rules are asserted, 92 → 99 checks, 0 failed, and it was cheaper than this row predicted.** The row assumed `scripts/network.sh` and two conductors on a real network. It needs neither: every one of these rules compares an owning field against the ACTION author, so the probe is *agent 1 writes about agent 2's thing* — the driver keeps calling as agent 1 and only the entity it points at changes owner. A second agent on the SAME conductor suffices, which `attachment-links.mjs` has done since §5.19. **Plumbing:** `callOther` (installed idempotently under its own app id, authoring only) and `awaitVisibleToMe`, which polls agent 1's own read rather than sleeping — until agent 2's entry resolves locally the commit DEFERS with `DepMissingFromDht` instead of being refused by the rule under test, which reads as a rule that does not fire. The shared fixtures are published once and waited for INDIVIDUALLY, because validation fetches a different one per rule. **Every link type in the slice is now 3 of 3** — nothing here is declared unreachable. **Watched failing twice, and the second one found a second shape.** R: the retraction probe aimed at agent 1's own claim → 92/1, `the call COMMITTED`. S: the fixtures published as agent 1 → **93/6, in two shapes** — four committed outright, while `AgentToClaim` and `AgentToConstitution` were refused for a DIFFERENT reason (their anchor is still agent 2's, so the base-mismatch rule fires one line above), and **the assertion caught that rather than passing on any refusal**, which is injection P's prefix discipline holding on a second family. **Two `GAPS` rows remain and neither is a second-agent problem**: both SWO friction rules are coordinator pre-checks with no bypassing extern, needing a new extern and a DNA rebuild. **This also makes 5c cheaper** — each of its remaining 15 link types carries an owner rule, and those are now free rather than blocked |
| 5g | ~~**Corpus: the foresight family** — `pre_registration`, `revelation`, `worldline_trace`, the last three raw-payload-reachable entry types~~ | — | **CLOSED 2026-10-21, 10 entry types to 13, 260 checks, 0 failed, 0 skipped.** **The exclusion note was wrong twice over, and it had already been corrected once** — it originally blamed dependency chains for `Retraction` too, which cost one extra call. Here the chains were **already built**: `otherAgentFixtures()` has published a trace, a commitment and a reveal since 5f, for the link rules, and nothing consumed them for entry rules. What actually blocks the rest is narrower and looks nothing like a chain — **most of these types' fields are DERIVED BY THE EXTERN**, so 8 of the 18 sites are `needs_extern` and leave the denominator by class rather than by exemption. Eight of the ten reachable rules now have cases: a deadline, a question hash, an expiry, and the content offered at reveal. **A THIRD SHAPE OF GAP, not seen here before.** `PreRegistration question must predate the commitment` is classed `crafted` because `question` IS caller-controlled — and is still unreachable, because the guard compares `question.action().timestamp()` rather than the field, and both timestamps are host-assigned. **A `crafted` classification is a claim about the field, not about the rule**, and this is the first time the two came apart. Declared in `GAPS` with that reason, beside `PeriodBoundary sample_action not found`, which cannot dangle because the extern builds every boundary from the caller's own chain. **AND THE INJECTION FOUND A WEAKNESS IN A CASE RATHER THAN CONFIRMING IT — the second time that has happened in this corpus and the better outcome both times.** **BH** removed `Only the author of a PreRegistration may reveal it.` The case red *for the wrong reason*: `stopped for a different reason: Revelation content does not hash to the sealed commitment`. It had been offering agent 1's own prediction and salt, so the **hash check one line later** was doing the refusing, and the case would have gone on passing if the author rule were deleted tomorrow. It now supplies agent 2's real content — named once in `OTHER_PREDICTION`/`OTHER_SALT` rather than typed a third time — leaving the author rule as the only check that can refuse it. Re-injected, **the forged reveal COMMITS**. **That also sharpens what the rule is for**: against somebody who does not know the committed content the hash check already suffices, so the author rule's unique work is against somebody who DOES — after a reveal elsewhere, or a leak. **Watched failing three times, one per new type, each a separate build against a clean conductor.** BG (expired-commitment rule removed): 1 red, **the call COMMITTED**. BH: as above. BI (`expires_at > created_at` disabled): 1 red, **COMMITTED**. **NOT asserted**: the two `expect: 'deferral'` cases were not individually injected, for the same reason `Claim`'s were not — they assert the message does *not* appear and the write stalls retryably, which removing a rule does not change. **AND THEN THE 8 `needs_extern` RULES WERE CLOSED TOO, on the same day, because that "protocol surface decision" had already been made six times.** This row first called a raw-payload extern a decision about whether the repository wants test-only externs. It does: `attempt_unaccountable_membrane`, `attempt_false_domain_index`, `attempt_false_membrane_registry`, `attempt_false_taxonomy_index`, `attempt_entry_update` and `attempt_false_attachment_link` all exist for exactly this reason, and the first one's comment carries the argument — *"Not an attack surface: every call that a custom client could make to gain something is rejected by `validate_membrane`, which is the point."* SPEC §11.1 makes it structural: a coordinator edit is hot-swappable, so a peer running a modified coordinator can already author any op validation accepts. **A prober grants an attacker nothing and grants a test the ability to OBSERVE the refusal.** `attempt_raw_worldline_trace`, `attempt_raw_pre_registration` and `attempt_raw_revelation` — three lines each, no index links, SPEC §10 and README §9 rows added. **`needs_extern` fell from 10 to 2** (what is left is `validate_bridge_record` and `validate_external_critique`'s author rules) and the corpus reads **270 checks, 0 failed, 0 skipped**: `worldline_trace` 8 of 8, `revelation` 6 of 6, `pre_registration` 3 of 4 with only the host-timestamp rule still declared unreachable. The `PeriodBoundary sample_action not found` gap is **removed rather than re-justified**, since a dangling boundary is now writable. **AND THE FIRST RUN OF THE NEWLY REACHABLE RULES FOUND SOMETHING UNKNOWABLE BEFORE.** Injection **BK**, all three author-binding rules removed at once: 3 reds, and they are not equivalent. `PreRegistration`'s forged-author payload **COMMITTED** — nothing else stands there, so that rule is solely load-bearing. `WorldlineTrace` fell through to *PeriodBoundary sample_action must be authored by trace agent*, and `Revelation` to *Only the author of a PreRegistration may reveal it*, so both have an adjacent rule behind them. **Which rules are load-bearing could not be established while the rules were unreachable**, which is this row's own argument pointed at its own conclusion. **The estimate was wrong in the same direction twice**: first the exclusion note blamed dependency chains that already existed, then this row called nine lines of Rust a governance decision. Both written from the conclusion rather than the obstacle. **AND THE LAST TWO WENT THE SAME DAY: `needs_extern` IS 0, and so is `needs_prober`.** `attempt_raw_bridge_record` and `attempt_raw_external_critique`, same three-line shape. The corpus is **15 entry types, 282 checks, 0 failed, 0 skipped**, and **every validation rule reachable from JavaScript now has a case or a stated gap** — what is left outside that is `remote` (4, needs a peer authoring a bad op), `passthrough` (12, no message of its own), `shadowed` (2, derived since item 5e) and four declared GAPS. **Injection BN says something BK did not.** All three newly reached rules removed at once, and all three red with **"the call COMMITTED — nothing stopped this payload"**: `BridgeRecord author must match action author`, the `BridgeRecord {}` loss-consistency rule, and `ExternalCritique importer must match action author`. **Compare BK**, where only `PreRegistration`'s author rule committed and the other two fell through to an adjacent rule — so these three are each **solely load-bearing**, which is precisely the question a prober makes answerable. **One harness improvement came out of it.** `BridgeRecord {}.` is a `format!` rule whose literal prefix is twelve characters and identifies nothing, so `assertStopped` refused it with *"assert it another way"* — correctly, and that refusal is kept. The *another way* is now a case-level `expectText` asserting the FULL interpolated message, which is **stricter rather than looser**: a prefix matches any rule sharing its head, while this names one exact string, and it has to be copied from the zome rather than imagined. |
| 6 | ~~**A `0.1.4` publish, now carrying two fixes rather than one.**~~ (a) `serverInfo.version` was hardcoded `'0.1.0'` while the package was `0.1.3`, so every MCP client was told the wrong thing since `0.1.0`. (b) **`@holochain/client` floated to `0.21.1` on 2026-10-15 and broke the published SDK** | ~15 min, and it needs `npm login` | **SHIPPED 2026-10-18, and this row sat stale for two days saying otherwise — corrected 2026-10-20.** Both packages are `0.1.4` on the registry, checked with `npm view` rather than inferred from the tree, and README §9 records the verification: a fresh install into an empty project resolving `@holochain/client` `0.21.0`, and both published tarball shasums matching the build the live check drove against a real conductor. It took two publish runs exactly as the sequence below says to expect. **The stale claim is corrected rather than deleted, because this file's whole purpose is the "blocked on" column, and a row saying "needs credentials" for work already done is the one failure mode that makes the column worth nothing.** **WHAT IS ACTUALLY OUTSTANDING IS A DIFFERENT PUBLISH:** `agent-sdk` is `0.1.5` in this tree against `0.1.4` on the registry, so item 12's `closureOf` is unpublished — see row 15, which needs the same run and is the cheaper reason to make it. The ordering constraint in the publish sequence below still applies. **CLOSED 2026-10-20: `0.1.5` of both packages is on the registry and is `latest`.** Verified against `registry.npmjs.org` directly rather than through npm's cache — `agent-sdk@0.1.5` shasum `f409a5f8` and `mcp-server@0.1.5` shasum `e61360d9`, both the figures preflight packed, so what the registry serves is the build the live check drove against a real conductor. `mcp-server@0.1.5` requires `agent-sdk ^0.1.5`, so the range tightening reached installers and nobody can resolve the SDK being replaced. Item 12's `closureOf` is published. See *The 0.1.5 publish sequence* below for what the run taught |
| 7 | ~~**`partition-rejoin`'s Phase 0 baseline has no retry** — port `CROSSING_ATTEMPTS` to it, or state in the harness why an advisory job is deliberately left to red on intermittency~~ | — | **Nothing. Evidence arrived on its own, from the same run rather than from reasoning.** #267's run `38546085167` is a controlled comparison nobody set up: same runner class, same `network.sh` services, same minutes — `network` absorbed two missed 330s windows and went green, while `partition-rejoin` failed at `a claim crosses nodeA -> nodeB with both up (baseline)` and reported `SETUP FAILED: The network is not carrying claims even with both nodes up`. Item 4 scoped the retry to `real-gossip` **first** and that was right, because that is where merges are blocked; what it leaves is an advisory job whose most likely red is now an intermittency rather than a rejoin defect, and **an advisory check that reds for a reason unrelated to its subject is one people learn to ignore** — which is the signal `partition-rejoin` exists to carry. Not urgent: it blocks no merge by construction (item 2). Note the ceiling if it is ported — `partition-rejoin` is at 45 minutes with its own worst case, so it needs item 4b's `worstCaseMs` treatment and not a copied constant **A SECOND CONTROLLED COMPARISON ARRIVED ON 2026-10-18, and it is cleaner than the one above because the change under test provably cannot affect propagation.** `partition-rejoin` passed eight times across the day, then red on [#278](../../pull/278) — `a claim crosses nodeA -> nodeB with both up (baseline)` PASSED and the job failed on its own precondition, `the baseline is fast enough to measure divergence inside the job budget (<= 60s)`, with **210.5s** measured and the dwell CAPPED, leaving the divergence assertion INCONCLUSIVE rather than measured. The rejoin itself still passed (`a NEW claim crosses nodeA -> nodeB after healing`). It then passed again on [#279](../../pull/279). **Both PRs touch only `scripts/validation-corpus/` and docs** — no zome, no workflow, nothing network-adjacent — so this is the intermittency reading confirmed by a change that could not have caused it, which is the evidence this row wanted. It also sharpens the fix: what reds is the PRECONDITION, not the subject, so porting `CROSSING_ATTEMPTS` here would retry the baseline rather than the rejoin. **A THIRD CONTROLLED COMPARISON ARRIVED ON 2026-10-20, on the pull request that closed this row, and it is the cleanest of the three: [#296](../../pull/296) changes NOTHING BUT COMMENTS, in `partition-rejoin.mjs` itself.** Run [`39360577602`](../../actions/runs/39360577602): baseline **421.1s**, **exactly one** check failed and it was the `<= 60s` precondition, the divergence assertion went INCONCLUSIVE as designed, and **every rejoin assertion passed** — both convergence legs, both authorship checks, `a NEW claim crosses nodeA -> nodeB after healing`, and all four nodeC isolation checks. A comment cannot slow a network, so this is the reading confirmed by the strongest available control, and it is also the row's own instruction being followed on its own pull request: the finding was the 421.1s, recorded in §3, rather than a re-run.  **CLOSED 2026-10-20 BY ITS SECOND OPTION, and this row's stated blocker was wrong — the third in three days.** It says "Nothing", and that is true of only one of the two things it offers. **The second option — state in the harness why an advisory job is deliberately left to red — IS DONE.** The reasoning existed, in `network.yml`, which is not where somebody debugging a red lands; `partition-rejoin.mjs` now carries it beside `MAX_SOUND_BASELINE_MS`, including the instruction that matters at that moment: check whether the rejoin assertions passed, and if they did, the finding is the baseline figure rather than a reason to re-run. **The first option — porting `CROSSING_ATTEMPTS` — is NOT blocked on nothing, and is refused on two grounds rather than deferred.** (a) What reds is the PRECONDITION and the baseline crossing SUCCEEDED, so a retry re-measures something that already worked. (b) **Retrying would make the assertion WEAKER, not stronger**, which is the part that is not obvious: the dwell must OUTLAST gossip for absence to mean "the partition held", so the figure this harness needs is the SLOWEST crossing the network produces, not the fastest. Retrying until a 5s sample appears and then dwelling 25s on a network that takes 210s is exactly the false premise `DWELL_CAP_MS`'s own note describes, reached from the other direction. **And `network.yml` had already recorded this decision**, including the identical objection to making the check non-failing ("a green run that proved nothing") — so attempting either here would have been re-litigating a settled call. That is why the harness is unchanged apart from the write-up. **What the retry is genuinely blocked on is the consumer-network measurement in §3**, which cannot be done in CI because it needs two physical home networks — a row under *Before mass adoption* that needs a person. Retrying is wasted job time if propagation turns out to be routinely minutes-slow, and nothing here can tell intermittent from routine yet |
| 8 | ~~**Give the DNA a heartbeat: one scheduled coordinator function plus a persistent observer agent** — the minimum that makes anything happen without an external call~~ | — | **Blocked on 5f, and the reason is a rate limit rather than a design.** Every primitive an observer needs is already an extern: `get_grounding_path` finds ungrounded claims, `get_effective_conductance` finds decayed links, `reinforce_synaptic_link` and the typed critique externs are the writes. What is missing is a caller that runs on its own clock. `#[hdk_extern(infallible)]` with `schedule()` is the host's only such mechanism and neither zome has one — `grep -c infallible` returns 0 both sides. **It belongs in the coordinator and MUST NOT go in validation** (SPEC §5.22: `hdi` has no `sys_time`, because every peer must reach the same verdict). The 5f dependency: `Critique` and `AntibodyPattern` are capped at 20 per rolling hour per agent with no banking (§6), so a single observer saturates almost immediately and any real metabolic loop is necessarily multi-agent — which is exactly the infrastructure 5f builds  **DEPENDENCY RESOLVED BY MEASUREMENT 2026-10-20 — this row is no longer blocked on 5f, and the blocker was the fourth wrong one in three days.** The row says the 5f dependency is a rate limit: `Critique` and `AntibodyPattern` are capped at 20 per rolling hour per agent with no banking, so a single observer saturates and a metabolic loop is necessarily multi-agent. That arithmetic is right. **What was never checked is whether the cap is per AGENT or per CONDUCTOR, and it is per agent, by construction in both zomes** — read rather than assumed: the integrity side is `count_recent_actions_since_checkpoint(author: AgentPubKey, ..)` calling `must_get_agent_activity(author, ..)`, and the coordinator side is `query()` over the CALLER's own source chain. Neither can see another agent's actions. **And 5f's `callOther` publishes under a genuine second `AgentPubKey`**, not a second conductor — which is exactly why 5f closed cheaper than it predicted. So the multi-agent infrastructure this row wants already exists, and it never needed `scripts/network.sh` or a second machine. **WHAT REMAINS IS THE WORK, NOT A DEPENDENCY**: `#[hdk_extern(infallible)]` plus `schedule()` in the coordinator, which is the thing that makes an agent act without an external call and is the row's actual deliverable. `grep -c infallible` over both zomes still returns 0. A coordinator-only change, so **no DNA hash change and no `protocol_version` bump** — unlike items 10, 17 and 20. **BUT IT NEEDS A PERSON BEFORE IT IS BUILT, AND THE REASON IS INVARIANT 6 RATHER THAN DIFFICULTY.** Everything a scheduled observer writes is a permanent, un-deletable entry, and it spends a real friction budget on every tick. Switching on an autonomous writer is the least reversible change available in this protocol, so WHAT it writes, HOW OFTEN, and under WHOSE key are decisions to take deliberately rather than defaults to inherit from whoever implements it first. The structural rule is already settled and is not the open part: metabolism belongs in the coordinator and never in validation (SPEC §5.22). **Item 11 is still behind this one, and also behind item 9**, which this row's own note already says: the swarm should not be built before 9 gives it something to measure with  **BUILT 2026-10-20, AND IT WRITES NOTHING — which is a decision, not a first step.** `metabolic_tick` is this repository's first `#[hdk_extern(infallible)]`: `grep -c infallible` now returns **6 in the coordinator and 0 in the integrity zome**, which is the split SPEC §5.22 requires — `hdi` has no `sys_time`, so a clock cannot be reached from a validator. `start_metabolism` schedules it; `init` is deliberately not used, because the host's own docs warn an `init` callback "may not happen immediately or ever after happ installation", which would make the heartbeat's existence depend on an unrelated call. **VERIFIED LIVE: `scripts/live-verify/metabolism.mjs`, 11 checks, against a real conductor.** First tick **0.1s** after scheduling, second at **60.1s** against the 60s floor, DHT byte-identical. **The central assertion is an ABSENCE OF CAUSE**, so the control comes first — no tick arrives before one is started, without which every later check passes vacuously on a conductor already ticking. Between `start_metabolism` and the end the harness makes **no zome call at all**, because a poll would be the external call whose absence is under test. **THE AUTONOMOUS WRITE IS DELIBERATELY NOT TAKEN.** Item 8's deliverable is a caller that runs on its own clock, and the row itself says every primitive an observer needs is already an extern — so the clock was the gap, and the clock is what this adds. What it does not add is a writer: Invariant 6 makes every entry permanent by anybody for ever, and each tick would spend a real §6 friction budget, so an autonomous writer is the least reversible change available here. **The observation is an ephemeral `emit_signal` instead** — it reaches a subscriber and touches neither the DHT nor the source chain. **WHAT SHOULD IT WRITE IS NOW ITEM 9'S QUESTION, which is the real ordering finding.** Item 9 decides whether a membrane may publish an attributed discourse-health reading; decide that and the heartbeat has its content. Building the write first would have settled a governance question by implementation. **Invariant 9 IS STILL NOT SATISFIED and this does not close it** — a tick that observes decay still drives nothing, so the missing half is now the consequence rather than the clock. Saying otherwise would be the mechanism-that-reads-as-enforcement failure this repository keeps finding. **`Ephemeral` rather than `Persisted`, deliberately**: a heartbeat that dies on conductor restart unless somebody starts it again is the conservative default, since a persisted schedule's failure mode is a thing still running after everyone forgot it exists. It also means it leaks nothing into the next CI step. **A LIMITATION, RECORDED RATHER THAN DISCOVERED**: there is no way to stop it mid-run. A scheduled function's only input and output is its schedule, so it cannot be passed a flag, and a persistent stop-flag needs an entry — a new entry type, a DNA hash change and a `protocol_version` bump, for a stop button. Restarting the conductor is the stop, which `Ephemeral` makes sufficient. **Watched failing twice. AN:** `None` instead of a schedule — 1 red, the first tick still arrives and the second never does. **AO:** an autonomous `create_entry` in the tick — **and it PASSED, which was the finding**: the no-write check read only the test's own domain, so a writer with a domain of its own was invisible. The ticks' own chain-local `own_claims` is now compared across ticks, which catches a write to ANY domain and needs no extra call; AO then reds with `own_claims: 1, 2`. **The injection found a weakness in the assertion rather than confirming it, which is the whole reason for injecting.** No DNA hash change and no `protocol_version` bump — coordinator only. Item 11 remains behind this and behind item 9 |
| 9 | ~~**Let a membrane PUBLISH its discourse-health reading as its own signed claim**, rather than leaving `get_discourse_health` a computation that dead-ends at the caller~~ | — | **Nothing technical. One governance decision, and it should be taken deliberately.** Quantitative Promise Theory's result is that an agent cannot normalise over a population it cannot see, so aggregation requires a *named* aggregator — which is also why this does **not** breach Invariant 1: the objection to a canonical score is that it claims a view from nowhere, and an attributed reading is a promise like any other, critiquable by anyone who disputes the method. That is strictly stronger than a protocol-computed score, because a protocol's arithmetic cannot be argued with. The decision to take first: two membranes may publish contradictory readings of the same discourse and **this protocol will not adjudicate between them.** That is correct and it will still be the first question anybody asks  **CLOSED 2026-10-20. THE DECISION IS TAKEN AND IT IS NOW EMPIRICAL RATHER THAN ASSERTED: two agents may publish contradictory readings of the same discourse and this protocol does not adjudicate between them.** `scripts/live-verify/discourse-readings.mjs` §4 drives exactly that — two agents read the SAME membrane at the SAME moment and publish different figures (2 critiques against 0), both readings standing, signed, with nothing computing which is right. 16 checks against a real conductor. **THE ROW'S FRAMING WAS NOT IMPLEMENTABLE AS WRITTEN, and the correction matters.** "Let a MEMBRANE publish its reading" cannot be done: a membrane has no key, and only an agent can author an entry. So "the membrane's reading" can only ever mean "this AGENT's reading OF this membrane" — the membrane is the subject, never the speaker. That is the difference between an institutional fact and somebody's promise, and this protocol can only represent the second. **Any agent may therefore publish a reading of any membrane**, which follows from the decision above rather than from permissiveness: "two agents may publish contradictory readings" presupposes more than one can. A founder-only rule would also need a new validation rule, a DNA hash change and a `protocol_version` bump — bought for a restriction the decision says should not exist. **It is a `Claim`, not a new entry type** — the same call `assert_expertise` already makes, and for the same reason: a reading inherits the typed `CritiqueMode` machinery Invariant 4 governs, so Methodological critique applies to it exactly as to any other claim. §3 does not merely check that it CAN be critiqued; the second agent critiques it. **No integrity change, no DNA hash change, no bump** — and discovery reuses the by-domain index plus a `discourse-health-reading` tag rather than a new `LinkTypes` variant, which would have been an integrity change. **THE METHOD IS PART OF THE READING, and leaving it out would have been the defect.** `get_discourse_health` takes lenses the CALLER aims, so two readings of the same membrane at the same moment legitimately differ — and a published figure that does not say which lens produced it is a lensed number presented as a neutral one. That is Invariant 1's objection rebuilt at the publishing layer, and §4.4's forbidden move performed by the protocol instead of a UI. The content states the policies, including when there were none, because "no lens" is itself the most consequential methodological choice. **§5 is the control and without it §2 would be vacuous**: the method statement only means anything if the method can move the figure, so both readings are taken at one moment and the figures are REQUIRED to differ before the method statement is credited. **Watched failing twice. AP:** the METHOD dropped from the content but left in the return value — **1 red, §2 alone, while `method_stated` went on passing**, because a flag the implementation sets about itself is not evidence. That is why §2 asserts against the decoded published entry rather than the return. **AQ:** `create_entry` instead of `create_claim` — discoverability, the tag and record-presence all red, with §2 cascading, which is why AP is the one that pins it. **A defect found by writing the harness**: `PublishedReading` returned only an `ActionHash`, and `validate_critique` requires an EntryHash-shaped target — so the reading was critiquable in principle and not in practice. It now returns `entry_hash` too, the same fix the signal variants already carry for the same reason. 76 unit tests (72 + 4 on the method rendering). Unsurfaced with a reason: a button commits the user to a public reading under their own key, so an honest screen must let them choose the lens and show it, per §4.4 — a real interaction design and the next increment. **Item 11 is now unblocked of its item-9 dependency**, and what it still needs is the measurement nobody has designed |
| 10 | ~~**Make the conductance half-life a membrane-declared promise instead of one global constant**~~ | — | **CLOSED 2026-10-19 by decision, verified and documented 2026-10-20 — and this row's stated blocker was wrong in the direction that mattered.** It said the resolution needed *"nothing but a `protocol_version` bump and one migration judgement"*, and both halves of that were the cost of the design it assumed: declaring the half-life per membrane in its `Constitution`. **That design was NOT taken, and the reason is its price rather than its shape.** `Constitution` is an **integrity** entry, so adding a field changes the DNA hash — and §11.1 is explicit that a different hash is a different network rather than an upgrade: every installed hApp reinstalls and no existing claim carries over. That is this repository's most expensive change class, and it is not worth paying for one decay knob while testers are about to be invited. It remains the better Promise-Theory shape, since a membrane is the agent whose domain is doing the forgetting, and it stays queued for the next bump that happens anyway. **WHAT WAS DONE INSTEAD MAKES THE READER THE PROMISER, which costs nothing beyond one file.** `ConductancePolicy.half_life_secs: Option<u64>` — supplying it states *"for the purposes of what I am about to count, connections are stale on this schedule"*; `None` is thirty days and therefore **exactly** the previous behaviour, which is the shape `AttestationPolicy` and `min_effective_conductance` already use. So the threshold that turns elapsed time into a decision now has an agent behind it, which is the whole of SPEC §7's first note on Invariant 1. **`PROTOCOL_VERSION` stays 9 and the integrity zome is untouched** — checked, not assumed: `git diff --name-only` names no integrity file, so there is no DNA hash change, no reinstall and no migration. The migration judgement the row asked for therefore never had to be made; the comparability cost is real but lands per READER rather than per membrane, and is accepted deliberately — two readers with different half-lives get different effective conductances for the same link and neither is wrong, because the number was never a property of the link alone. What stays byte-identical for every reader is what the DHT holds: the base conductance and the `Reinforcement` events. **`get_effective_conductance`'s signature is deliberately untouched**, because `agent-sdk` 0.1.4 on the registry calls it with a bare `ActionHash` — verified against the registry rather than assumed — and breaking every published client for a progress knob is a trade this repository has already been bitten by. The half-life therefore arrives where the policy already lives, the aggregate read that actually filters on conductance. **67 → 72 coordinator tests, 0 failed**, and the five new ones assert the properties that make the field more than a fudge factor: a shorter half-life forgets faster at the same elapsed time, a longer one forgets slower while the default still halves at exactly thirty days, **every half-life halves at its own half-life**, a non-positive one falls back to the default rather than dividing by zero, and the reader's half-life reaches the reinforcement terms too rather than only the base. `scripts/live-verify/trust-lenses.mjs` 27 → 31 checks with a setup guard of the same discipline as its attestation one (if a one-second half-life discounts nothing, the assertions would pass vacuously, so the harness refuses to continue). **HALF THE COMPLAINT SURVIVES AND IS RECORDED RATHER THAN QUIETLY CLOSED.** A reader who supplies no policy still gets thirty days, still with no promiser — and unlike an attestation filter, a half-life has no neutral "off" position, because time passes whether or not anybody promised a rate. The strict reading of §7's first note would be **no promiser, no decay**, leaving effective conductance as base plus reinforcements undecayed. That changes what every existing conductance read returns, was deliberately not taken, and is carried in SPEC §7 as the remaining half of the tension |
| 11 | ~~**Run a deliberate minority of observers with looser thresholds and unusual `CritiqueSpecies` preferences** — the swarm result applied to this graph~~ | — |  **RUN 2026-10-22, ON A DHT MINTED FOR THE RUN. `scripts/swarm.sh`, `scripts/swarm/dispositions.mjs`, `scripts/swarm/run-swarm.mjs`.** Five agents, three dispositions, one of them the deliberate minority. **THE SCRATCH DHT IS ENFORCED RATHER THAN CONVENTIONAL, and it earned that on its first use.** Invariant 6 means nothing a swarm writes can ever be deleted, and this row's own finding is that exploration cannot be told from degradation at the time of writing — so the output is judged after it is already permanent. `swarm.sh` mints a fresh network seed per run (a different DNA hash IS a different DHT, the mechanism nodeC already uses as an isolation control) and the driver refuses to run unless every agent reports the same hash. **That check fired immediately**: agents installed via `installApp` without the seed had silently formed their own network, so the population would have been several one-agent swarms that could not see each other. It failed loudly instead of running. **DISPOSITIONS ARE MECHANICAL, NOT GENERATED, and the reason is Invariant 6 rather than caution about language models.** Every rule is a property of the data a reader can check — *confidence is High and `evidence_hashes` is empty* is true or it is not. The first permanent writes an autonomous population ever makes should have a basis anybody can audit line by line; an LLM's free-form output would be permanent before it could be assessed. **THRESHOLDS ARE PUBLISHED AS PROMISES BEFORE ANY AGENT ACTS.** Each publishes a `Constitution` carrying its threshold, so the standard it judges by is itself on the record and itself critiquable, and divergence between declared and actual is visible by comparison rather than assertion. The minority differs **by one number** — `minConfidenceToFlag` — not by a personality. **AND IT PRODUCED THE RESULT THE `protocol_version: 10` FORK WAS FOR.** Three critiques of the same target, written in the same round, recorded **`saw 0 of 2`, `saw 1 of 2`, `saw 2 of 2`** — genuinely different views of what had been said, retained at write time and unrecoverable afterwards. That is Light Cone Consistency's Detection = Prevention bound paying for itself: a concurrent population is the only thing that generates it, and item 24 is the only reason it could be recorded. **FOUR DEFECTS WERE FOUND BY RUNNING IT, all mine and three of them documented elsewhere in this repository already.** (1) `hc sandbox generate` WITH PORTS does not return — it hands off to `holochain` and holds the foreground — so three detachment schemes failed in three different ways before reading what `sandbox.sh` had always done. (2) The dispositions invented confidence levels `Speculative` and `Replicated`; the real enum is `Hypothetical, Tentative, Moderate, High, Certain`, and the seeded claims failed to DESERIALIZE before validation saw them. (3) The author path is `content.header.author`, not `content.author` — so the *already critiqued* filter matched nothing and every agent repeated itself every round; `discourse-readings.mjs` documents this at length, after making the identical mistake. (4) The per-disposition totals **hid the finding**: three dispositions each showed 6, which reads as no difference, when one loose agent wrote 6 and two strict agents wrote 3 each. The aggregate divided the signal by the headcount, so the report is per-agent now. **WHAT THIS IS NOT: the graph is ACTIVE, not autopoietic.** The DNA still does nothing on its own clock — item 22 decided that deliberately — and a swarm of external agents is not a system that maintains its own organisation. **And no ranking is computed**: Invariant 1 bars a comparative reputation, so the report gives counts of ACTION, which measure which threshold was lower rather than which agent was right. Whether the minority explored or added noise is visible only in whether anybody ADOPTS what it proposes, which `get_species_adoption` answers and which cannot be known this early. |
| 12 | ~~**Surface closure instead of a guessed timeout**~~ | — | **CLOSED 2026-10-19, and this row's own stated blocker was wrong.** It said `onPendingDependency` already carries enough to report closure, which SPEC §5.3 said too. **It does not: the refusal names exactly ONE hash however many are missing.** Measured against a sandbox conductor before anything was built — a `Claim` citing two unresolvable hashes, then three, then three with a resolvable one placed first and then last, each came back `DepMissingFromDht([AnyDhtHash(..)])` with a single element. The cause is the protocol's own mechanism: `validate_claim` loops `must_get_entry` over `evidence_hashes` and the host abandons the callback at the FIRST unresolved dependency. A client subtracting that one hash from what it cited would report "3 of 4 resolve" for a claim where none of the other three do — worse than no indicator at all. **So closure is asked for directly.** `which_entries_resolve_locally(Vec<AnyDhtHash>) -> Vec<bool>` answers per hash, in order, type-agnostically (as `must_get_entry` does) and with `GetOptions::local()` — local databases only, no network call, which is exactly §5.3's "resolve locally" and also why it cannot be used as an amplification lever. `agent-sdk` exposes it as **`closureOf(hashes)` before a write** — the useful moment, since a composer can show "3 of 4 have arrived" while the author is still typing — and as **`closure` on `onPendingDependency`** while one is stalled, with `PendingDependencyError` carrying it too. The error message also stopped misreporting: it said "cites 1 entry" for every stall, because it was counting the hashes the refusal named. **A missing extern is survivable by design** — the SDK treats it as unknown closure and keeps writing, so an SDK newer than its happ loses the indicator and nothing else. `agent-sdk.mjs` 25 → 34 checks, 0 failed. **Watched failing twice. AH:** closure re-derived by subtracting the named hash — **33 of 34 still pass**, and only the case built to pin the mechanism reds, which is why that case exists: with one citation missing, subtraction is right by coincidence. **AI:** the extern deleted and the happ repacked — all 7 closure checks red while the typed-error and still-valid checks stay GREEN, which is the compatibility path proving a client that cannot report progress can still write. Closes README §9's propagation row, which asked for a bound or a "not yet propagated" surface: this is the second option, and §5.3 and §10 now carry the mechanism and the correction |
| 13 | ~~**Probe the `reveal_deadline` backdating argument**~~ | — | **CLOSED 2026-10-18: CONFIRMED, and the forgery turns out to be permanent.** `scripts/live-verify/clock-skew-reveal.mjs` against a conductor under `libfaketime` (`CLOCK_REALTIME` only — `FAKETIME_DONT_FAKE_MONOTONIC=1`, or tokio's timers go with it). Three phases, reproduced twice, 0 failed checks: commit with a 300s window at offset `+0`; at `+3600` it reads as `expired` and an honest reveal is **refused** naming `past its reveal_deadline`; at `+60` **the identical call is accepted.** **Phase B is the control and is what makes it trustworthy** — it reproduces `pre-registration.mjs` §6 in the same process against the same commitment, so the rule fires and the harness works, and phase C differs by exactly one variable. No `PrevActionError`, so B wrote nothing and monotonicity never bound C. **The unpredicted part: restoring the clock to `+3600` leaves it still reading as revealed** — a durable entry stamped inside a window that had really closed, and un-deletable by Invariant 6. SPEC §5.22 now carries the result and a new MUST: a conforming implementation must not present `revealed` as evidence of foresight, nor derive an accuracy figure from it. **That MUST is now PERMANENT, not interim — item 14 was closed by decision on 2026-10-19 rather than by a repair.** Not a CI check by design — it needs `libfaketime` and moves a clock; `scripts/run-clock-skew-probe.sh` documents the manual run |
| 14 | ~~**Make `reveal_deadline` actually enforceable**~~ | — | **CLOSED 2026-10-19 BY DECISION: no repair is adopted, and §5.22's MUST is permanent.** This was never blocked on technique. Item 13 confirmed the deadline is enforced against a number the author writes, and §5.22 records why no validation rule can fix it: `hdi` exposes no `sys_time`, because validation must be deterministic. So every available repair names a clock, and each costs something that is not implementation effort. **Countersigning — the in-platform one, already built — buys the deadline by requiring a witness online at reveal time**, so an agent could no longer complete a foresight commitment alone. That changes what the protocol promises rather than adding a check, and Invariant #2 prefers a read-layer observation to a mechanism that makes an agent wait on someone else. An attested external clock is the same shape with an operator in place of the witness. The third repair — detect rather than prevent, via the chain-gap signature — **is already permitted and needs nothing from the spec**, so it was never what this row was blocking on. **The position taken is the honest one: this protocol records foresight commitments and does not audit them.** The denominator still holds and an unrevealed commitment still expires visibly; `revealed` is a record of what an author chose to reveal, not evidence of when they knew it. **WHAT WOULD REOPEN IT**, so nobody re-derives the trade-off: any surface that grants the timestamp authority — an accuracy figure, a reputation weight over `revealed`, a scoring client. At that point the MUST blocks a feature rather than annotating a mechanism nobody reads, and the order is repair 3 first (free, read-layer, already allowed) and countersigning only if detection proves insufficient. Full reasoning in SPEC §5.22 |
| 15 | ~~**Four standing `npm audit` advisories in `mcp-server`, none of them reachable** — bump `@modelcontextprotocol/sdk` off `1.30.0`~~ | — | **RELOCKED 2026-10-20: `npm audit` reports 0 vulnerabilities, and the row's central prediction held exactly — `package.json` is untouched.** `git diff --stat mcp-server/package.json` is empty; the declared `^1.30.0` was always going to admit the fix, so deleting `package-lock.json` and `node_modules` and reinstalling was the whole change. **All five advisories cleared, not just the four**: `@modelcontextprotocol/sdk` 1.30.0 → **1.32.1**, which carries `express` 5.2.1 → 5.3.0 (`proxy-addr` → 2.0.8, the CRITICAL one), `express-rate-limit` 8.7.0 → 8.7.1 (`ip-address` → 10.7.4, both MODERATEs), and `fast-uri` → 3.1.9 — the fifth, which this row listed separately because it arrives via `ajv` rather than Express and might genuinely load. **The reachability analysis in this row is unchanged and was never the thing being fixed** — it is why this did not hold up `0.1.4`, and it is kept above rather than deleted because the next advisory may not be unreachable. **Verified beyond the audit number, because a clean audit on a broken package is worse than a dirty one.** `tsc --noEmit` and `tsc` both clean; `scripts/check-packages.mjs` green (both packages install from their tarballs into an empty project, import, and the server advertises `TOOLS:9`); and `scripts/live-verify/mcp-server.mjs` green against a **real sandbox conductor** on the new SDK — 1.30 → 1.32 is a minor bump, so the risk being tested was a behavioural regression rather than a compile error: `publish_claim` round-trips, a hash from one call is accepted verbatim by the next, and the refusal paths still fail as errors rather than as plausible empty answers. **THE PUBLISH IS THE PART THAT NEEDS A PERSON AND IS DELIBERATELY NOT DONE HERE** — it needs `npm login` and a browser second factor. **The dependency range was deliberately NOT flipped**: `mcp-server` still declares `@stateofintent/agent-sdk` `^0.1.4` and the lock resolves `0.1.4` from the registry, which is what is actually published, so `npm ci` in `conductor.yml` resolves. `agent-sdk` is `0.1.5` in this tree, so the flip to `^0.1.5` belongs to the publish run itself for the `ETARGET` reason the publish sequence below gives — committing it first makes CI red on purpose. **THE FLIP IS NOW DONE, on `release/0.1.5` 2026-10-20**, together with `mcp-server` `0.1.4` -> `0.1.5` — the range cannot reach an installer unless it is published. The ETARGET red was confirmed rather than assumed. **PUBLISHED 2026-10-20 — this row is now fully closed, code and publish.** `0.1.5` of both packages is `latest` on the registry, `npm ci` in `mcp-server` exits 0 where it previously failed `ETARGET`, and `npm audit` still reports **0 vulnerabilities** after the lock regeneration, so the relock survived it |
| 16 | ~~**A `Claim` passes `AgentToMew`'s type check, because it deserialises as a `Mew`**~~ | — | **ANSWERED 2026-10-18, and the answer is bounded: two instances, not a class.** The question this row existed for was whether finding 8 was luck — one payload on one link type — or the visible corner of something general. `scripts/check-entry-type-confusion.mjs` sweeps **all 16 app entry structs** under the rule finding 8 established EMPIRICALLY rather than the one serde documents (a MISSING `Option` field is tolerated, so A is readable from B when every NON-Option field of A exists in B with an identical declared type), then cross-references the `to_app_option::<T>()` sites so each pair is marked LIVE or LATENT. **Exactly two pairs exist.** `Claim -> Mew` is **LIVE** (finding 8; bounded by the ownership rule, so an agent can only mis-index its own Claim). `Revelation -> SealedPrediction` is **LATENT and was found by the sweep rather than by a probe** — nothing reads `SealedPrediction` via `to_app_option`, and the commitment is verified by recomputing `hash_entry(SealedPrediction{..})` and comparing BYTES rather than reading a type, so a `Revelation` (whose bytes differ) cannot stand in for one: a trap for a future guard, not a defect. **Gated in `no-conductor`, watched failing three ways** — U made `evidence_type` an `Option` → 3 new pairs; V renamed `Mew.content` → the stale ledger entry caught, the same discipline the corpus applies to declared gaps; W added a `SealedPrediction` guard → **LATENT became LIVE**, which is the change most likely to be missed because it reads as a new guard rather than a new pair. **What remains is a decision, not a sweep**: tighten `Claim -> Mew` with a discriminant field, or accept it and say so in SPEC §5.20a. The sweep's value is that the decision is now about one known pair instead of an unknown number |
| 17 | ~~**Decide whether to tighten `Claim -> Mew` — now TWO live sites, not one**~~ | — | **CLOSED 2026-10-19 BY DECISION: accept the confusion, and stop the two rules reading as enforcement.** The alternative was a discriminant field on `Mew`, and its cost is the decisive fact: it changes the integrity zome and therefore **the DNA hash** — a `protocol_version` bump off 9 and a network reset for every installed hApp, this repository's most expensive change class — bought for two guards whose exposure both findings had already bounded. Both sites sit behind their own ownership rules, so neither is cross-agent: the worst available is an agent filing its OWN Claim where a reader expects a Mew. **So the inventory now says so instead.** Both sites carry an `enforcement_caveat` in `corpus/inventory.json`, derived mechanically by `enumerate.mjs` from the entry structs rather than hand-noted, stating what the guard does not cover **and what it still does** — it fires for an entry of any other type (the deserialise fails) and for a non-entry action (`Ok(None)`), so the rule is narrower than it reads rather than vacuous. **The one-directionality is load-bearing and is now gated twice**: `Claim` carries domain/confidence/evidence_hashes which `Mew` does not, so the sibling rule `A ClaimToBridgeRecord link's base is not a Claim.` still enforces — and item 16's sweep plus a new cross-derivation check (the sweep and the inventory must agree on the pair set, or both are suspect) is what keeps that true. The annotation caught one rule too many on its first pass, which is worth keeping: `An AgentToMew link may only be created by the Mew's own author.` is NOT disabled, because it compares the deserialised `author` and a Claim carries one |
| 18 | ~~**Five link types no prober could reach**~~ | — | **CLOSED 2026-10-18. All 9 reachable rules driven, the other 5 declared with reasons, and the item exposed a coverage hole in the tool that finds coverage holes.** `TaxonomyToSpecies` 3, `AgentToMembrane` 3, `Reinforcement` 2, `SynapticLink` 1 — **223 → 238 checks**, watched failing (AD 221/2, AE 235/3). **THE IMPORTANT PART IS NOT THE RULES.** `enumerate.mjs` decided drivability from `PROBED_LINK_TYPES`, a HARDCODED list of eighteen names, and this item added four `AttachmentLinkKind` variants plus a fifth prober without anything connecting the Rust to that list. So five link types stayed `needs_prober` while their rules were drivable, the corpus asserted nine of them, and **the coverage loop reported `0 of 0 assertable rules` for two whole link types** — cases running, passing, and gating NOTHING, because a rule the inventory calls unreachable is one the coverage check does not demand a case for. Deleting those nine cases would have left the harness green. **Caught by reading output, not by a gate**: the inventory drift gate passed correctly, because regeneration produced an identical file — the inventory was not stale, it was WRONG, since the classifier's own input was a list nobody updated. `PROBED_LINK_TYPES` is now **parsed from `enum AttachmentLinkKind`**, with only the three single-purpose probers listed and each checked to exist; `needs_prober` fell to **zero**, so every link rule must now be cased or declared. **That forced five honest declarations:** `AttestationGrant`'s three, because `ATTESTATION_GRANT_MIN_TENURE_SECS_VALIDATION` is thirty days and **no committing baseline exists** — without one every case is refused for tenure rather than the rule under test — plus two friction rules. **Two operational findings recorded:** an agent target must be sent ENTRY-prefixed, because `EntryHash::from(AgentPubKey)` rewrites the three-byte prefix and `AnyLinkableHash` refuses the raw agent form before any rule runs; and a clean sandbox resets the 20-per-hour friction window, since it is per agent |
| 19 | ~~**The harness item 18 asked for: refusals with no valid baseline**~~ | — | **CLOSED 2026-10-19. 238 → 244 checks, 0 failed, and two of item 18's five honest declarations turn out to have been one.** Item 18 gapped all three `AttestationGrant` rules because `ATTESTATION_GRANT_MIN_TENURE_SECS_VALIDATION` is thirty days, so no run can construct a committing baseline — correct, and still true. The conclusion drawn from it was too strong, and item 18's own note said what was missing: *"these need a harness that asserts refusals WITHOUT a valid baseline, which is a different shape from this one — not another extern."* **That harness is `driveUnbaselined`, and what replaces the baseline was already in the evidence:** each link branch of `validate_create_link` returns at the first failing check, so a refusal naming rule N is itself proof that every check above N passed on that payload. The three cases are the branch's first three checks IN ORDER, each passing the ones above it. **The tag-length rule needed no baseline in the strongest sense** — `tag.0.len() != 36` is the FIRST check in the branch, so nothing can preempt it, and item 18's own prober passes raw tag bytes. Asserted: the tag rule (refusal), the referenced-action rule (DEFERRAL), and the tenure rule (refusal, from this agent's own join for this same membrane failing on AGE alone, so it exercises `tenure_satisfied`'s arithmetic rather than the tests in front of it). **Only the friction rule stays declared, and its reason changed**: not the baseline but the coordinator, which pre-checks at the same limit (5 = 5) — the shape the Critique and AntibodyPattern gaps already take. **WHAT IS LOST IS STATED RATHER THAN GLOSSED**: a deleted rule is still caught both ways (commit, or a refusal naming a later rule), but these cases assert the rule fires FIRST among those they violate, not that it is the only one — and `drive` stays strictly stronger wherever a baseline commits. **Plus corpus finding 10, the same family as item 18's own**: `classify()` returned `deferred` BEFORE the branch that records `link_type`, so two deferred LINK sites carried none — and the coverage loop keys on exactly that field, so they were in no type's denominator and no total. Found by the orphan check, which is the only gate that could see it, since a coverage loop cannot miss a rule it never iterates. Fixing it surfaced `AgentToMembrane base is not a valid Membrane.`, which now has a deferral case |
| 20 | ~~**Three coordinator pre-checks have NO validation twin — decide, per one, whether the condition should be enforced DHT-side** (`assert_expertise`'s *"Can only assert expertise backed by your own WorldlineTrace."*, and `pre_register`'s *"prediction must not be empty"* and *"salt must not be empty"*)~~ | — | **CLOSED 2026-10-21 WITH NO `protocol_version` BUMP, because two of the three cannot be enforced DHT-side at all and the third was already decided.** The row's cost model was its whole constraint — *"any of the three closes with a rule in the INTEGRITY zome, which is a DNA hash change and a network reset"* — and that priced an action none of the three turns out to need. **It also mis-stated what it was blocked on in the direction item 21 had just been caught in**: *"Nothing technical. Three readings and a decision each."* The readings are analysis, the row says so itself two sentences later (**"The cost of acting is the constraint, not the analysis"**), and analysis is effort. Nothing here needed a person. **READING 1 — `assert_expertise`: already answered, twice, before the row existed.** The twelve lines above the check say *"A COURTESY, NOT AN ENFORCED RULE, and deliberately so"*, give the reason, and name the revisit trigger; SPEC §5.21 carried the same decision in prose. The entry it builds is an ordinary `Claim`, so `validate_claim` governs it and has no notion of traces, and an expertise assertion carries **no standing** — a self-asserted, critiquable Claim in an index SPEC calls informal and non-authoritative. Nothing for a forgery to obtain. **The tool flagged it because it reads conditions and cannot read the comment four lines above them**, which is the honest limit of an inverse sweep rather than a fault in it. **READINGS 2 AND 3 — `pre_register`'s two: A TWIN IS IMPOSSIBLE, not undecided.** Both fields live in `SealedPrediction`, this zome's only private entry, and `dna/integrity/src/lib.rs` already says so at the exact arm where a rule would go: *"A PRIVATE ENTRY'S CONTENT IS NOT AVAILABLE HERE"* — `hdi` delivers `None` for the body. No peer sees either field at commit time, so no rule at any version can constrain them. **Same family as item 14's clock**: a goal not expressible as a deterministic rule over data validation can reach. **AND BOTH READINGS TURNED UP SOMETHING THE ROW DID NOT ANTICIPATE, measured on a live conductor rather than argued.** For `prediction`, the content IS public at reveal, so `validate_revelation` could carry the rule — and should not: **"not empty" is a proxy for "not vacuous" and the proxy does not hold.** `prediction: "."` is accepted, revealed inside its deadline, and lands in `get_foresight_record`'s `revealed` list indistinguishably from a real kept commitment (`""` and `"   "` are both refused — the check trims). A rule would refuse the one input nobody would use and admit every vacuous one. **The inflation it would guard against also has no consumer**: there is no `.revealed.length` anywhere in the UI, the SDK or the MCP server, every surface renders the prediction's own text, and the foresight tab's intro says there is no score on the page — an absence that is now load-bearing, so anything introducing a count inherits this. **For `salt`, the check fails at its OWN STATED PURPOSE, which is the sharpest thing here.** Its message says the salt exists so *"a guessable prediction is [not] recoverable from its hash"* — and `salt: "."` is accepted, a one-character salt being as brute-forcible as none. **The achievable version is an entropy requirement and no validation rule can check one**: entropy is a property of the process that generated a string, not of the string, so a validator cannot tell a well-chosen salt from a badly-chosen one by inspection. §5.22's shape from another direction. The exposure is the committer's own anyway — a weak salt makes *their* commitment recoverable and misleads nobody — so the coordinator is both the right layer and the only possible one. **THE READINGS ARE NOW DURABLE RATHER THAN A WRITE-UP THAT ROTS.** `enumerate.mjs` carries an `ACKNOWLEDGED` list — the repository's own `EXEMPT` idiom from `check-harness-counts.mjs` — so the report separates *read and decided* from *no reading yet* and stops presenting three settled questions as open ones every run. **It exits 1 on a stale acknowledgement**, watched failing: one message reworded so it matched nothing gives `::error::1 stale entry in ACKNOWLEDGED`, exit 1, while the other two stay acknowledged and the orphaned pre-check reappears under *NO READING*. A stale acknowledgement is worse than none, because it reads as a decision about code that is no longer there. **SPEC §5.21 said "ONE coordinator guard has no validation counterpart" and now says three** — a counted claim that went stale without anybody editing it, which is this file's own documented failure mode found in the specification instead. **What is genuinely left: nothing on this row.** If a future mechanism ever gives expertise claims weight, or anything starts counting revealed commitments, both inherit a stated gap rather than a hidden one. |
| 21 | ~~**The bridge discards EVERY signal it receives — one line, and its real-time path has been dead since `@holochain/client` 0.21**~~ | — | **CLOSED 2026-10-21, and the one line was a third of it.** `scripts/live-verify/bridge-signal.mjs`, 19 checks, green — and the row's own blocker was wrong in the direction the 2026-10-20 checkpoint named five times over. It says **"Nothing technical"**, and the technical thing it then describes — "a way to observe the bridge receiving a signal, which does not exist yet" — **is the entire job**, is pure effort, and needed no person at all. The blocker priced the fix (~15 min, correct) and omitted the instrument. **Write the obstacle, not the remedy**, which this row did by writing the remedy as an aside. **WHAT MADE IT UNWATCHABLE was not the conductor and not Twitter**: every decision lived on a class whose module calls `main()` at import, so reaching `handleSignal` meant a conductor AND four Twitter secrets. `bridge/src/signal.ts` now holds the parse, the hash encoding and both tweet builders as pure functions, and the harness drives THOSE — not copies. A harness carrying its own parse would pass while the bridge stayed broken, which is this file's "a prober proves the rule it probes" in its most direct form. **AND BUILDING THE INSTRUMENT FOUND TWO MORE DEFECTS HIDING BEHIND THE ONE THIS ROW NAMED.** (2) **A hash reached the tweet as 39 RAW BYTES** — `${entryHash}` on a `Buffer` — so every "DHT:"/"Full context:" reference the bridge composed was mojibake, measured as `Full context: \u0003Q...`. **That one is in the path that still WORKS**: `pollUnbridged` formats it identically, so the polling fallback has been posting unreadable pointers all along, and the Correlative Witness Principle's step 1 — "the tweet references the DHT hash" — was not true of any tweet. (3) **The reverse leg looked for a format nothing here ever writes**: `pollMentions` matched `/0x[a-fA-F0-9]{64}/`, an Ethereum shape a 39-byte Holochain hash is not in any encoding, then passed the match as a **String** where `ImportTwitterReplyInput.linked_holochain_claim` is an `EntryHash` — so Twitter → Holochain could never fire, and failed into a `logger.error` nobody reads. **2 and 3 are the same binding seen from both ends and they disagreed with each other as well as with reality**, because the writing side and the reading side were four hundred lines apart and neither was reachable from a test. Both now come from `signal.ts`, and §4 of the harness gates the round trip: the reference the bridge wrote, matched by the pattern it reads, decoded back to the bytes the signal carried, and accepted by the zome. **WATCHED FAILING FOUR TIMES, against the defects as they actually shipped rather than against injections alone.** HEAD with all three live: **14 reds of 19** — but most of that is cascade, not evidence, since no parse means no hash and §§3–5 red for want of an input, which is why each defect also got its own injection. **Item 21's one-line fix ALONE: 7 reds**, §2 fully green and the tweet still mojibake — **the run that justifies the harness**, because the fix exactly as this row describes it ships a bridge whose every tweet carries an unreadable pointer. **BA** (ownership guard deleted): **1 red**, not the 2 predicted, and the shortfall is kept rather than papered over — the sibling-variant and empty-payload controls pass either way, because the variant check returns null for a `MetabolicTick` whether the guard ran or not, so the foreign-zome control is the ONLY thing between that module and claiming every signal on the interface; a second zome on the conductor would be the stronger version that does not exist yet. **BB** (defect 2 alone): **7 reds, §2 green** — the evidence that the shape and the encoding are two defects, not one. **BC** (defect 3 alone): **4 reds, §3 green** — and BC exists because **defect 3 was MASKED by defect 2**: while the tweet carried raw bytes, §4 red whatever the pattern was, so the third defect was invisible until the second was fixed. **One defect masked by a fallback, hiding a second, masking a third.** **CI builds the bridge for the first time** — nothing was compiling `bridge/` at all, which is part of how this survived, though `tsc` would not have caught it either (the handler took `any`). `conductor.yml` builds it and runs the harness after `mew-lifecycle`, which is its pair: that one covers the bridge's zome surface, this one covers the bridge's own code. **What is still NOT verified: the live X API.** Nothing here posts a tweet, and the service's `start()` — admin auth, `getUserId`, the two `setInterval`s — is still unexercised. |
| 22 | ~~**Decide what the metabolic tick WRITES, if anything** — Invariant 9's consequence, which is the only half of that invariant still missing~~ | — | **DECIDED 2026-10-21: OPTION (a), NO AUTONOMOUS WRITE. The tick keeps emitting an ephemeral signal, and a reading is published when a person chooses to.** This is the present behaviour, so nothing was built — what changed is its STATUS, and that distinction is the point of recording it. A tick that writes nothing because nobody has decided yet is one implementation away from writing something; a tick that writes nothing BY DECISION has a reason somebody can argue with. **AND THE DECISION IS ENFORCED RATHER THAN STATED**, which is what makes it durable: `scripts/live-verify/metabolism.mjs` asserts *"ITS OWN CHAIN DID NOT GROW across ticks — detects a write to ANY domain, not just this one"*, compared chain-locally across ticks so a write to a domain the harness never seeded is still caught. **Watched failing as injection AO** — an autonomous `create_entry` added to the tick reds it with `own_claims: 1, 2` — and AO is the injection that originally found the assertion too weak, which is why it reads chain-locally now. So (a) cannot drift into (b) by implementation. **THE REASONS, in the order they actually weigh.** **(1) THERE IS NO CONSUMER.** `publish_discourse_reading` is itself unsurfaced — README §9 carries the reason, and it is a real interaction-design problem rather than a wiring gap. So switching on an autonomous publisher would create permanent supply for a screen that does not exist: ~1,440 un-deletable entries a day per agent, read by nothing. **(2) INVARIANT 6 MAKES IT THE LEAST REVERSIBLE CHANGE AVAILABLE.** No author, operator or administrator has a deletion path — the capability is absent from the integrity zome rather than unexposed (§5.1, §7) — so the off switch stops future writes and nothing else. The undo is "stop, and live with everything it already wrote." **(3) THE SIGNATURE, which is the half that is not about storage.** Item 9 established that a reading is somebody's signed, critiquable promise. An unattended writer makes permanent, attributable promises in an agent's name while they are not watching, each critiquable by anyone and none removable. `start_metabolism` is already an explicit call and therefore already the consent gesture — but it does not SAY what it consents to, and consent nobody was asked for in terms is not consent. **WHAT THIS DECISION COSTS, stated rather than minimised: Invariant 9 stays unsatisfied, and now by choice.** SPEC §699's admission stands and is no longer awaiting a decision — a conforming implementation still cannot satisfy *"death is required"*, because the clock exists and the consequence is declined. **The invariant is in tension with Invariant 6 by construction** — 9 requires atrophy to drive something, 6 makes anything it drives permanent — so the available consequences are ephemeral (which does not satisfy 9) or durable (which accumulates for ever). That tension is not resolved here and is not resolvable by implementation; it would need one of the two invariants amended, which is a different and larger question than this row. **REOPEN CONDITION, so this is not re-litigated from scratch: a surface for readings exists AND somebody wants them faster than a person will click.** Both halves are required. The first is the §9 row; the second is the thing nobody has yet asked for. If both arrive, go to option (b) — opt-in per agent, write-on-change — and not to a heartbeat: the cadence arithmetic above is unchanged by anything a surface would add. **Option (c), a separate observer key, is REFUSED rather than deferred**, and recorded so it is not rediscovered as a fresh idea: a key nobody is accountable for is item 9's membrane-publishing framing arriving by another route, and item 9 found that unbuildable because only an agent has a key and a reading has to be somebody's promise. A dedicated observer agent is an agent in name only. **AND THE CONSENT GESTURE NOW STATES ITS TERMS (2026-10-21), which is the cheap step toward (b) that is honest whichever way this goes.** `start_metabolism` returned `()` — and that was the whole of its problem: it is the only consent gesture this protocol has for an unattended process running on the caller's own key, and it said nothing about what it was consenting to, so the decision above lived in a doc comment where the next implementation could reverse it without anybody noticing they were never asked. It now returns **`MetabolismTerms`** — `runs_as` (the key anything it wrote would be signed with, which is not a parameter because a scheduled function runs as the author of its own chain), `tick_interval_secs`, `writes_to_the_dht: false`, `spends_friction_budget: false`, `stopped_by`, and the terms in words. **A version implementing (b) MUST return `writes_to_the_dht: true`** — a visible change to this payload rather than a quiet change in behaviour, the same device as `MetabolicObservation.wrote_nothing` and `PublishedReading.method_stated`. **THE TERMS ARE ASSERTED AGAINST THE BEHAVIOUR, and injection BM is why that matters more than the declaration does.** BM makes the tick write while the terms still say it does not: 3 reds — and **the declaration check STAYED GREEN**, because the declaration was still false. What red was the chain-growth check and the pair check requiring the two to agree (`own_claims across 2 tick(s): 2, 3`). **A declaration nothing compares to reality is a label**, which is the "mechanism that reads as enforcement" failure this repository keeps finding, caught here before it could ship. `metabolism.mjs` is 20 checks, nine of them new. **This is NOT a step toward (b) in substance** — nothing writes, and the decision above is unchanged. What it changes is that (b) can no longer arrive by accident, and that an agent calling this learns, at the moment of the call, that nothing is published in their name and what Invariant 6 would mean if it were. |
| 23 | ~~**The O dial: order concurrent records deterministically**~~ — Light Cone Consistency's second operator, which this protocol had left unset | — | **BUILT 2026-10-21. `order_records`, `scripts/live-verify/ordering-policy.mjs`, 22 checks, green. Coordinator-only: no entry type, no link type, no validation rule, so NO `protocol_version` bump.** Light Cone Consistency (arXiv 2605.09114) splits observer-relative consistency into **C**, the closure filter deciding which dependencies an observer must have seen, and **O**, the ordering of the concurrent forks that filter admits. **C was already here** — `which_entries_resolve_locally`, SPEC §5.3's closure, validation's dependency fetch, and §5.3 already used the words *"outside the observer's past cone"*. **O was unset**, so two critiques written in ignorance of each other had no order and every reader invented one. **WHAT IT IS NOT, stated here because the papers are explicit and the claim is easy to overstate: THIS IS NOT A GLOBAL ORDER.** Landers & Kramer put linearizability outside a single observer's reach by construction — *"a composite of two systems, a store and a global real-time serializer supplying an order no single observer's light cone can"* — and Burgess & Gerlits derive their invariant global ordering from a hierarchy whose parent nodes are *"a single point of calibration"*, which is the centralization this DNA does not have and did not add. What this promises is narrower and checkable: **every observer handed the same set computes the same sequence.** That is what makes an aggregate recomputable and therefore disputable, which is the property settlement would rest on. **AUTHOR TIMESTAMPS ARE REFUSED RATHER THAN UNUSED**, and the refusal is this repository's own hard-won position rather than an import: SPEC §5.22 records that validation cannot reach a clock at all, and **item 14 MEASURED a `reveal_deadline` being backdated by moving the authoring conductor's clock — permanently.** §4 of the harness writes a record whose self-reported timestamp claims it came first by a year and requires the order to ignore it. **THE FINDING IS WORTH MORE THAN THE DIAL: ALL THREE INJECTIONS PASSED AGAINST THE FIRST VERSION OF THE HARNESS.** Each section asserted that a causal rule produced the right order, and each used records that were **already in that order by hash** — so deleting the rule under test changed nothing and the tie-break silently produced the same answer. Three checks that could not go red, written immediately after two days of cataloguing exactly that failure. **The general form, which applies to any ordering test: a check is only sensitive when the policy under test and the policy it must NOT be give different answers on the data.** Every section now chooses records whose hash order CONTRADICTS the required order — **BO** (tie-break on timestamp) 1 red, **BP** (chain edge removed) 3, **BQ** (reference edge removed) 4. **AND FIXING THAT BROKE IT DIFFERENTLY, which is the second finding.** The repaired version retried `create_critique` until the hashes disagreed — against §6's ceiling of 20 per rolling hour — so **the harness exhausted its own author's critique budget** and reported `SWO temporal friction` as a setup failure. It was diagnosed only because the loop distinguishes *the write was refused* from *the predicate missed*; before that it read as twenty-five improbable misses and looked like a cold-conductor flake. **Nothing is retried now**: one batch of Claims and Evidence — neither carries friction — is written once and the pair is CHOSEN from it, with §4 searching 64 pairs after an 8-candidate search missed on a 1-in-256 draw. The lesson generalises past this file: **a harness that retries a rationed write will eventually measure the ration rather than the subject.** |
| 24 | ~~**Record the past cone: what an author had seen when they wrote**~~ — the C dial's retention half, and the one change in this sequence that cost a fork | a `protocol_version` bump, taken | **BUILT 2026-10-21 AT `protocol_version: 10`. `Critique.past_cone`, `critiques_unseen_by`, `scripts/live-verify/past-cone.mjs` (16 checks) and five corpus cases (287 total, 0 failed). All gates green; 76 unit tests pass.** Light Cone Consistency (arXiv 2605.09114) states the bound: *"a system can tell its order inverted causality only if it retained exactly what would have prevented the inversion."* **Detection requires retention.** `which_entries_resolve_locally` answered *can I see X now?*; nothing answered *had this author seen X when they wrote?*, and no later analysis recovers it. **THE FORK WAS THE DECISION, AND IT WAS TAKEN BECAUSE NOBODY HAD INSTALLED.** A field on an entry type is an integrity-zome change, so a DNA hash change, so a different network — peers on the old hash cannot see the new one at all. **Bumps are free only while there is no installed base**, and §11's own migration rule says entry hashes MUST NOT be carried across a fork, which means **a past cone — a list of ActionHashes — cannot survive one.** That is Landers & Kramer's *consistency ratchet* biting exactly here: cone history resets at every future bump. Doing it now destroys nothing; doing it later would. **THE FIELD IS ADDITIVE AND EVERY EXISTING CALLER STILL WORKS.** `#[serde(default)]`, so a payload omitting it records an EMPTY cone — which honestly says *this author recorded nothing*, a different statement from *this author had seen nothing*. Roughly twenty call sites across the harnesses, SDK and UI were unchanged. **WHAT VALIDATION ENFORCES, AND THE FIFTH THING IT REFUSES TO CLAIM.** Four deterministic rules: size ceiling (256, bounded because validation resolves every member AND every member's members, a cost every peer pays), no duplicates, every member resolves to a `Critique`, every member critiques the SAME target. Then the load-bearing one — **transitive closure: every member's own cone must be a subset of this one.** Admitting X means admitting everything X admitted. **IT CANNOT CHECK THAT THE AUTHOR ACTUALLY SAW THESE, and no rule can** — the field is author-supplied and validation has no view of anybody's screen, the same shape as item 14's `reveal_deadline`. So **over-claiming is possible and harmless; under-claiming is what the rules bite on**, and under-claiming is the direction an attacker wants: pretending you never saw the rebuttal. §4 of the harness asserts the limit explicitly so §3 is not over-read. **WATCHED FAILING THREE TIMES. BR** — transitive closure removed: 1 red and **the attack COMMITS** (`refusal: NONE — it committed`), an author successfully recording having read a rebuttal while denying the objection it answered. Nothing else in the validator catches it, so that rule is **solely load-bearing**. **BS** — same-target rule removed: 1 red, and the write is then stopped by transitive closure instead, which is why §2 asserts the MESSAGE rather than merely that something refused. **BT** — `cone_recorded` hardcoded true: 2 reds, silence reported as a finding about what the author knew. **AND THE QUERY REFUSES TO CONFLATE SILENCE WITH IGNORANCE**, which is the design decision most likely to be undone by somebody building the screen. `cone_recorded` is false when nothing was recorded, and that is the COMMON case — every existing client omits the field. Reporting those as *had not seen* would manufacture a finding out of a missing feature. `critiques_unseen_by` is deliberately unsurfaced for the same reason (README §9): the honest screen must render `cone_recorded` as prominently as `unseen`, which is an interaction design nobody has done. **ONE COST RECORDED FOR WHOEVER HITS IT NEXT**: the corpus's cone fixtures need three real critiques, and every `create_critique` also creates a SynapticLink against §6's 20-per-hour ceiling. Running the corpus twice inside an hour on one conductor now fails its Critique chain with `SWO temporal friction`. The clean-conductor rule, with less headroom than before — recorded rather than worked around, since trimming a fixture would make the under-claiming attack unreachable. |
| 25 | ~~**Settlement: assessments, published policies, and aggregators**~~ — when a claim stops being contested enough to act on, and who says so | a `protocol_version` bump, taken | **BUILT 2026-10-22 AT `protocol_version: 11`. Three entry types, two link types, six externs, `scripts/live-verify/settlement.mjs` (20 checks), 13 corpus cases (316 total, 0 failed), 76 unit tests, all gates green.** **THE ANSWER IS NOT "THE PROTOCOL DECIDES"** — Invariant 10 is that the system does not compute truth — but *a named agent's declared policy, applied to a named input set, which anybody can recompute*. `Assessment` is one agent's TYPED stance (`Supports`/`Disputes`/`Abstains`, never a score — Invariant 1 bars a comparative measure and a decimal point does not change that). `SettlementPolicy` is a threshold published BEFORE it is applied, which is Burgess's thresholds-are-promises made structural: the rule for turning disagreement into a status is on the record and separately arguable. `SettlementStatus` cites its policy BY HASH and lists every input it counted. **AND IT CAME OUT STRONGER THAN THE BRIEF ASKED FOR, which is the finding.** The brief wanted settlement to be a pure function so that *"anyone can recompute it and check the aggregator's result"* — a courtesy, telling a careful reader how to catch a liar. But a pure function over data every peer can fetch is a function **VALIDATION CAN RUN**, so `validate_settlement_status` runs it. **A forged `Settled` is refused by every peer independently, before the entry exists.** Injection **BU** removes that rule and the forged status **COMMITS**: a disputed claim declared settled, permanently, with the disproving inputs attached to the entry. **WHAT REMAINS POSSIBLE IS NOT A DEFECT.** Two aggregators may choose DIFFERENT input sets and reach different states — §5 of the harness demonstrates it, both valid, both reproducible — and the difference is visible because `inputs` is published. **Lying about arithmetic is refused; disagreeing about scope is not**, and the protocol has no business adjudicating the second. **STATUS IS AN ENTRY, NOT A FIELD, and Invariant 6 forced that.** §5.1 refuses app-entry updates, so there is no mutable status to flip from Contested to Settled; a later status does not erase an earlier one, and `get_settlement_statuses_for` returns ALL of them. Hiding a dissenting status behind a "current" one would be the deletion Invariant 6 forbids, performed by a reader instead of a writer. **THE COOL-DOWN THE BRIEF ASKED FOR IS NOT BUILT, and the reason is §5.22.** It wanted a cool-down "measured in causal steps rather than wall-clock time where possible" — the instinct is right, because validation cannot reach a clock at all. But causal distance needs a graph walk validation cannot afford, and every policy parameter here must be an exact integer comparison or peers disagree. Deferred with that reason rather than approximated. **WATCHED FAILING THREE TIMES. BU** (recompute rule removed): 3 reds, the forged status commits. **BV** (`min_assessors == 0` allowed): 1 red — a policy that would settle an empty input set becomes publishable. **BW** (`TargetToAssessment` base binding removed): 1 red, and the forgery is STILL refused by the author binding, which is why §8 asserts the message rather than merely that something refused. **AND BW IS WHY §8 EXISTS AT ALL — §5.19'S FINDING, REPRODUCED BY SOMEBODY WHO HAD READ IT THE DAY BEFORE.** The first version of the harness tested the status's target rules thoroughly and never tried to forge a LINK, so the whole file went green with the `TargetToAssessment` author binding deleted. *"The link types nobody probed are the link types nobody validated, and coverage looked complete because every link type anybody had TRIED to forge was refused."* Both new link types are now in `AttachmentLinkKind` and probed through `attempt_false_attachment_link` like the other eighteen. **ONE COST, recorded because finding 17 predicted it and it arrived:** the corpus's cone fixtures are now SHARED between the `critique` and `assessment` specs rather than minted per spec. Six critiques in one run exceeded §6's 20-SynapticLink ceiling and every case below it SKIPped. A corpus that silently stops testing things is worse than a slow one. |

**Items 8 to 13 come from a synthesis on 2026-10-18 and are grouped here
deliberately, because they share one structural rule and one prerequisite.**
They answer a question asked that day — the protocol is strong on integrity and
feels static, so what would make it *alive* — and the answer turned out to be
locatable rather than philosophical. The full argument is at
<https://claude.ai/code/artifact/b34b9fd9-88c2-41e3-8222-361c79e88386>; what it
concluded, and what these rows act on, is short enough to restate so the rows
are usable without it:

- **The protocol has a past tense and a future tense and no present tense.**
  Append-only chains are the past; `PreRegistration`/`Revelation` is the
  future; what is missing is anything that reads on its own schedule. That is
  one fact, not a family of gaps: `grep -c infallible` over both zomes returns
  0, so nothing can happen except as the synchronous consequence of an external
  call.
- **Decay already exists and is lazily evaluated.** `get_effective_conductance`
  recomputes `decay_factor` at read time and writes nothing, so a link rots on
  schedule while the DHT stays byte-identical. Atrophy that emits no events
  cannot drive anything, which is why Invariant 9 has no mechanism (SPEC §7).
- **THE STRUCTURAL RULE, and it is not negotiable.** Metabolism belongs in the
  coordinator and never in validation. `hdi` does not expose `sys_time`
  (SPEC §5.22) because validation must be deterministic — so a scheduled
  function, a published aggregate and a decay consequence are all legitimate in
  the coordinator, where `sys_time` and `schedule` both exist and
  `get_foresight_record` already calls the former. Holochain's own zome split
  is the kernel/observer boundary this needs; it has simply never been used on
  the observer side.
- **The prerequisite is 5f**, for items 8 and 11. One conductor has one agent
  and the friction limits are per agent, so a metabolic loop is multi-agent by
  arithmetic rather than by preference.

**Suggested order, and it is not the order above.** ~~Item 13 first, because it
is the only unmeasured claim~~ — **13 ran on 2026-10-18 and confirmed §5.22**,
which replaced it with **item 14** — and **14 is now closed too, on 2026-10-19, by
deciding not to repair it**, which makes §5.22's MUST permanent rather than
interim. ~~14 is the highest-priority row here.~~ ~~So the highest-priority rows
are now **12 and 10**.~~ **12 closed on 2026-10-19** — and it closed README §9's
propagation row with it, which was the point of doing it before 10. ~~So the
highest-priority row here is now **10**, the conductance half-life, which is
self-contained and closes a tension SPEC §7 already records.~~ **10 closed on
2026-10-19 by decision and was verified and written up on 2026-10-20**, and it
closed SPEC §7's tension by making the READER the promiser rather than the
membrane — which is why it needed no `protocol_version` bump, contrary to its
own stated blocker.

~~**So the two rows blocked on nothing but effort are now 5e and 15, and 15 is
first on cost alone**~~ **15's code half closed on 2026-10-20, and 5e closed the
same day — so NO row here is blocked on nothing but effort any more.** What 15 has left is the publish, which
needs a person: `npm login` and a browser second factor.

**What every remaining open row is blocked on, so the state is readable without
reading them all.** **15** — the publish, and it needs credentials. **6** — the
same publish run; its `0.1.4` half shipped and the row is corrected, what is
outstanding is `agent-sdk` `0.1.5`. ~~**7** — nothing, but it blocks no merge by
construction and its most likely red is now an intermittency rather than its
subject.~~ **7 closed on 2026-10-20 by its second option**, and its blocker was
wrong too: stating in the harness why the red is deliberate was blocked on
nothing and is done, while porting the retry is **refused on merit** — the
baseline succeeded, so a retry re-measures a success, and the dwell needs the
SLOWEST crossing rather than the fastest, so retrying would weaken the
assertion. `network.yml` had already recorded that call. **8** — a 5f dependency that **needs re-reading**: 5f closed by needing
neither a second conductor nor `network.sh`, and what it delivered is a second
agent on ONE conductor for probing authorship rules, which is not obviously the
per-agent friction budget row 8's arithmetic wants. **9** — one governance
decision, taken deliberately. **11** — blocked on 8, and then on a measurement
nobody has designed. **20** — three readings and a decision each, and acting on
any of them costs a `protocol_version` bump.

**So the single thing that needs a person rather than effort is the publish**,
which closes 15 and 6 together. The paragraph below is
kept because its ordering constraint is still live and is the thing most likely
to be got wrong by whoever runs it.

**The original note, for the record:** 15 was
first on cost alone — about fifteen minutes, since `package.json` already
declares `^1.30.0` and a plain relock picks up the fix, against 1–2 hours for
5e. Its advisories are still unreachable by the analysis in its own row, so
this is priority by hygiene rather than by exposure: four standing advisories,
one labelled critical, train everyone to ignore `npm audit`. **It now carries a
real publish with it** — `agent-sdk` is `0.1.5` in this tree and `0.1.4` on the
registry (checked against the registry, not inferred), so item 12's `closureOf`
is unpublished, and the publish sequence below applies with its ordering
constraint.

**TWO ROWS BELOW HAVE BLOCKERS THAT NEED RE-READING BEFORE THEY ARE TRUSTED,
and neither is a row this session touched.** Row **6** says the `0.1.4` publish
"is outstanding and needs credentials": **it is not outstanding** — both
packages are `0.1.4` on the registry and README §9 records the verification, so
that row is stale in the one direction this file is supposed to prevent. Row
**8** says it is blocked on 5f, and **5f closed on 2026-10-18 by discovering it
needed neither a second conductor nor `network.sh`** — but what it delivered is
a second agent on ONE conductor for probing authorship rules, which is not
obviously the per-agent friction budget row 8's arithmetic actually wants. That
is a question about row 8's blocker, not a claim that it is unblocked.

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

### The 0.1.5 publish sequence — DONE 2026-10-20, and what the run taught

**`release/0.1.5` is pushed and every check that does not need `npm login` has
been run and passed.** What is left is the five steps below, and only step 1 is
the reason they are left.

```
agent-sdk   0.1.5          (already in tree — item 12's closureOf, unpublished)
mcp-server  0.1.4 -> 0.1.5 (+ dependency range ^0.1.4 -> ^0.1.5)
```

**Why `mcp-server` bumps too, which is not obvious.** The range tightening is
what `publish-packages.sh:171` demands — it refuses unless the range NAMES the
SDK version being published, because `^0.1.4` resolves the 0.1.4 being replaced,
which is how `0.1.1` stayed reachable after `0.1.2`. But a range only reaches an
installer if it is PUBLISHED, so leaving `mcp-server` at `0.1.4` would have the
script skip it as already-published and the registry would keep a `0.1.4` whose
range is still `^0.1.4`. The tightening would then exist only in this tree.

**What has already passed, at 0.1.5:**

| check | result |
|---|---|
| both builds (`tsc`) | clean |
| `scripts/check-packages.mjs` | both tarballs install into an empty project, import, server advertises `TOOLS:9` |
| `scripts/live-verify/published-packages.mjs`, **against a real conductor** | **green** — the check that would have caught `0.1.1` |
| `npm publish --dry-run`, both | clean |

The live one is the one that counts: the INSTALLED SDK authorized signing, wrote
a claim the network accepted, an independent read found it, and the installed MCP
server returned that same claim through a tool call, resolving `@holochain/client`
`0.21.0`. It installs the SIBLING TARBALL rather than the registry copy —
deliberately, since during a version bump the new SDK is by definition not
published, and testing the registry's copy would verify the code being replaced.
`closureOf` is confirmed present in the built `dist`, which is why this publish
exists at all.

```
agent-sdk  0.1.5   20.1 kB, 8 files, shasum f409a5f8
mcp-server 0.1.5   13.5 kB, 6 files, shasum e61360d9
```

**THE STALE LOCK IS DELIBERATE AND THE BRANCH CANNOT PASS CI.** Confirmed rather
than predicted: `npm install --package-lock-only` in `mcp-server` returns
`ETARGET: No matching version found for @stateofintent/agent-sdk@^0.1.5`, and
`npm ci` — which `conductor.yml` runs there — fails the same way. The publish
script requires a clean tree, so the stale lock had to be committed first. **Do
not fix that red before publishing**; it clears at step 4. No pull request was
opened for this branch, because one sitting red reads as broken work.

**The boundary is earlier than the 0.1.4 sequence implies.** `npm whoami`
returns **E401**, and `publish-packages.sh` fails on that at line 87 **before
any other check** — so not even the script's own dry run can be driven without
logging in, which is why the checks above were run individually instead.

1. `npm login`, from a real terminal.
2. `scripts/sandbox.sh clean && scripts/sandbox.sh start` — the script refuses
   to publish unless `published-packages.mjs` has just passed against a live
   conductor.
3. `NPM_OTP=<code> NPM_OTP_2=<code> scripts/publish-packages.sh --publish`.
   **Two codes, not one**: the second publish waits for the registry to serve
   `agent-sdk` first and a TOTP will not still be valid by then. **Expect two
   RUNS as well** — if the resolvability wait (`publish-packages.sh:228`, 10
   attempts at 6s) expires first, the script refuses to publish `mcp-server`.
   That refusal is the `0.1.1` shape being prevented, not a fault; the second
   run skips the already-published SDK.
4. **Then, and only then:** `cd mcp-server && npm install --package-lock-only`,
   and commit the lock. This is the step that makes `npm ci` work and turns the
   `conductor` job green.
5. Merge `release/0.1.5` with the lock consistent.

**Closed rows 15 and 6 together on 2026-10-20.** Both packages are `latest` at
`0.1.5`, both shasums match what preflight packed, `mcp-server@0.1.5` requires
`agent-sdk ^0.1.5`, and step 4's lock regeneration cleared the deliberate red —
`npm ci` exits 0 and `npm audit` still reports 0 vulnerabilities.

**THREE THINGS THE RUN TAUGHT, none of which the sequence above predicted.**

**1. This account uses npm's `web` auth-type, so a publish opens a BROWSER and
cannot be driven from any non-tty shell.** `NPM_OTP`/`NPM_OTP_2` do not help —
they are for a TOTP prompt this account never reaches. The `EOTP` that results
is the documented failure arriving by a route the preflight guard does not
catch: the guard tests `[ ! -t 0 ]`, which is about stdin, and says nothing
about whether npm can reach a browser. **So the env-var advice in this
sequence is wrong for this account and the interactive path is the only one.**
Worth fixing in the guard — it could read `npm config get auth-type` alongside
the tty test — but that is a change to the script rather than to a row.

**2. The registry lagged by minutes, and it read exactly like a failed
publish.** `mcp-server@0.1.5` was published at 11:42:28 and a direct
`registry.npmjs.org` read moments later still showed `0.1.5 ABSENT` with
`latest=0.1.4`. The script's own `ALREADY PUBLISHED — skipping` on the next run
was correct and the registry read was the stale one. **Do not conclude a
publish failed from a registry read taken immediately after it** — check the
package's `time.modified`, which is what finally settled it.

**3. The two-run expectation held, but for the propagation wait rather than for
a refusal.** The first run published both; the resolvability wait simply
outlasted a direct read. The second run correctly did nothing and printed a
`!!!` line that reads like an error and is not one — both versions were already
spent, which is npm's rule, not a fault.

### The 0.1.4 publish sequence, and why one commit must red CI

**Prepared 2026-10-17 on `release/0.1.4`, off `main` at `0ca7b1e`.** Both fixes
it ships are already in `main`; this branch is only the version bump.

```
agent-sdk   0.1.3 -> 0.1.4   (+ relocked)
mcp-server  0.1.3 -> 0.1.4   (+ dependency range ^0.1.3 -> ^0.1.4)
```

**THE RANGE IS NOT OPTIONAL.** `scripts/publish-packages.sh` checks that
`mcp-server`'s `@stateofintent/agent-sdk` range CONTAINS the SDK version being
published, as a plain substring — so `^0.1.3` fails the check. Without the
tightening, an installer could resolve the very SDK version being replaced,
which is how `0.1.1` stayed reachable after `0.1.2` shipped.

**AND THAT IS WHAT MAKES ONE COMMIT UNABLE TO PASS CI, BY CONSTRUCTION RATHER
THAN BY MISTAKE.** `mcp-server/package-lock.json` cannot be regenerated until
`agent-sdk@0.1.4` exists on the registry — `npm install --package-lock-only`
fails `ETARGET: No matching version found for @stateofintent/agent-sdk@^0.1.4`,
and so does `npm ci`, which `conductor.yml` runs in `mcp-server`. Measured, not
predicted. The publish script requires a CLEAN TREE, so that stale lock has to
be committed before publishing, and the `conductor` job will red on it. **Do not
treat that red as a problem to fix before publishing — it is the ordering the
two-stage publish forces**, and it clears in step 4.

The order to do it in:

1. `npm login` — `npm whoami` currently returns **401**, and the script refuses
   without it. This is the only part that is not already done.
2. `scripts/sandbox.sh clean && scripts/sandbox.sh start` — the script will not
   publish unless `published-packages.mjs` has just passed against a real
   conductor, which is the check that would have caught `0.1.1`.
3. `scripts/publish-packages.sh` from the clean `release/0.1.4` tree. It
   publishes `agent-sdk` first and waits until the registry can serve it before
   `mcp-server`, because otherwise the first installer resolves whatever SDK
   version is already there.
4. **Then, and only then:** `cd mcp-server && npm install --package-lock-only`.
   It resolves now. Commit that lock — this is the step that makes `npm ci` work
   again and turns the `conductor` job green.
5. Merge `release/0.1.4` to `main` with the lock consistent.

**One thing to check after, rather than assume.** `0.1.3` is broken on the
registry and will stay there; what changes is that `latest` moves and
`mcp-server@0.1.4` requires `^0.1.4`, so nobody resolves the broken SDK any
more. That is the same way `0.1.1` was retired rather than removed. Confirm it
by installing fresh from the registry into an empty project and checking the
resolved `@holochain/client` is `0.21.0`.

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

**Later the same day: 5b is closed too, and it opened 5e.** The corpus covers
**ten entry types, 68 checks, 0 failed**, including the depth-2
`Constitution → Membrane → FederationRecord` chain. What it found is 5d's
question in a second form: a coordinator PRE-CHECK can refuse a rule before the
validator ever sees it, returning its own wording — so four `Membrane` rules are
reachable only through `attempt_unaccountable_membrane`, and both SWO friction
rules are reachable not at all. **That means the corpus was testing the
coordinator's courtesy while the DHT enforcement went untested**, which is the
inversion this whole directory exists to catch. 5e is the sweep for the rest.
**And 5c is started: the link driver works and 4 of 19 link types are covered,
92 checks, 0 failed.** It also produced the number that should reorder what is
left: **20 of the 88 link rules are "may only be created by the owner", across
all 19 types**, and with 5b's three entry gaps that is **23 rules blocked on one
thing — a second agent on one DHT.** That is now queue item **5f**, and it
should come BEFORE 5c's remaining 15 link types, because it unblocks more than
finishing 5c would. `scripts/network.sh` already stands up the conductors.
**Remaining: 5f, then 5c's last 15 types, then 5e.**

**Next, in this order and the order matters:** ~~item **5d** before 5b and 5c~~
— **5d is done, same day**, so the denominator is now correct and 5b and 5c are
planned from a true one. Of the 24 sites it was about, **9 are assertable as
refusals** and 10 are the new `needs_extern`. Then **5b** (four raw-payload
entry types, 22 sites, with the depth-2 `Constitution → Membrane →
FederationRecord` chain) and **5c** (90 link rules, a third driver shape) —
both counts unchanged by 5d, which is the useful outcome: the correction landed
entirely on entry types nobody had planned work against. Item 5's original
"3–5 h for the remaining 143" was an estimate for about a sixth of the work,
under a reason that turned out to be wrong.

**What 5d leaves for somebody else to decide, and it is not a defect.** Ten
rules now say plainly that no client can make them fire. Three options and no
recommendation: add `attempt_*`-style externs taking a raw payload (a DNA
rebuild, the same cost as the 14 `needs_prober` link rules); accept them as
permanently unasserted and let the class carry the reason; or treat the derived
fields as evidence the rules are redundant, which is the interesting reading and
the one that needs a careful argument rather than a patch — `validate_worldline_trace`
checks `agent` against the action author on an entry whose `agent` the
coordinator sets from `agent_info()`, so the rule defends against an extern that
does not exist yet. That is cheap insurance, not dead code, and it should be
written down as such rather than deleted by someone reading the class as a
to-do.

**One trap to carry forward, because it cost a confusing probe today.** A zome
call from outside the launcher fails with `no signing credentials have been
authorized for cell [..]` until `authorizeSigningCredentials` is called per
cell. `replay.mjs`'s own comment says it reads exactly like a validation
refusal to a harness that only checks "did it throw" — and it reads exactly
like one to a person writing an ad-hoc probe, too.

**Yours rather than anyone else's, and unchanged by any of today:** §3's
two-machine measurement, and the `0.1.4` publish.

### Where this session stopped — 2026-10-19 (two decisions taken, and a branch thrown away)

**Queue items 14, 17 and 19 closed, plus corpus finding 10. Merged as #290
(`160e1ca`), 238 → 244 checks, 0 failed, all six CI jobs green.** The two
decisions are the part worth reading, because neither was blocked on technique
and both are now permanent.

**Item 14 — `reveal_deadline` stays unenforceable, by decision, so §5.22's MUST
is permanent rather than interim.** It had been written as a caveat pending a
repair. Every available repair names a clock, and countersigning — the
in-platform one, already built — buys the deadline by requiring a witness online
at reveal time, so an agent could no longer complete a foresight commitment
alone. That changes what the protocol promises rather than adding a check, and
Invariant #2 prefers a read-layer observation. **The position taken: this
protocol records foresight commitments and does not audit them.** §5.22 carries
the full reasoning, what would reopen it (any surface granting the timestamp
authority — an accuracy figure, a reputation weight), and the order to do it in
if that day comes: repair 3 first, because the chain-gap signature is free,
read-layer and already permitted, and countersigning only if detection proves
insufficient.

**Item 17 — the `Claim`-reads-as-`Mew` confusion is accepted, not repaired.** A
discriminant field changes the integrity zome and therefore the DNA hash, which
is a `protocol_version` bump and a network reset for every installed hApp, for
two guards that findings 8 and 9 had already bounded to one agent's own entries.
So the inventory says so instead: both sites carry an `enforcement_caveat`
derived mechanically from the entry structs, stating what the guard misses **and
what it still does** — it fires for an entry of any other type and for a
non-entry action — so the rule reads as narrower rather than vacuous.
`check-entry-type-confusion.mjs` now also compares its pairs against the ones
the inventory publishes, and its CI step moved below `inventory-drift`, because
that comparison only means anything against an inventory already known current.

**Item 19 — the harness item 18 asked for by name.** Item 18 declared all three
`AttestationGrant` rules because thirty days of tenure makes a committing
baseline impossible. That is true and the conclusion was still too strong for
two of the three: each link branch returns at the first failing check, so a
refusal naming rule N is itself proof every check above it passed — which is
what a baseline supplies from outside. The tag-length rule needed no baseline in
the strongest sense, being the branch's first check. All three now assert; only
the friction rule stays declared, and its reason changed from the baseline to
the coordinator pre-check.

**THE TRAP THAT COST THE SESSION, and it will recur because nothing warns about
it.** The first version of this work was branched off a local `main` sitting at
**#279 while origin was at #288** — nine merged PRs behind. Everything looked
consistent: `git log` read as plausible history, and `README.md`, `READINESS.md`
and the corpus README were all stale in the same matching way, so a stale
checkout is internally coherent and gives no signal. What it produced was a PR
(#289, closed) that would have reverted nine PRs on four files, re-"discovered" a
rule item 18 had already made drivable, treated the already-merged
`check-entry-type-confusion.mjs` as an uncommitted loose end, and renumbered two
findings whose numbers were correct upstream all along. **`git fetch origin`
before branching, and branch from `origin/main` explicitly.** Before calling
anything unfinished, new, or a finding, check it against `origin/main` rather
than the working copy.

**Two smaller traps from the same day.** The `.happ` bundle is **gitignored and
built from whatever the tree was at build time**, so after syncing `main` it is
stale and a corpus run tests the old coordinator — item 18's prober simply was
not in the installed app until the zomes were rebuilt (two `cargo build
--release --target wasm32-unknown-unknown`, `hc dna pack dna/`, `hc app pack .`;
the UI steps in `pack-webhapp.sh` are not needed for corpus work). And
**repeated corpus runs saturate the 20-per-hour SynapticLink friction budget**,
which surfaces as `dependency chain builds` failures rather than as rule
failures — the harness separates them correctly, and the fix is
`scripts/sandbox.sh clean && scripts/sandbox.sh start`, since the window is per
agent.

**One thing left untidy on purpose, and one by accident.** On purpose: the
corpus README's link-type table is still the original four-type slice while its
own header says every link type is covered — flagged in place rather than
rewritten, because a twenty-four-row table would restate what `replay.mjs`
prints per type on every run. By accident: **`160e1ca` is a squash commit**,
where every other PR in this repository's history landed as a merge commit.
`--auto` fixes the merge method at the moment it is armed and GitHub refuses to
change it afterwards, so decide the method before arming it.

**Also recorded for the next reader: the corpus README has two findings numbered
8 and two numbered 9** — the first-run pair and the Claim/Mew pair. A handoff
citing "findings 8 and 9" means the Claim/Mew pair. The duplicates are left as
they are, because `check-entry-type-confusion.mjs` and the rows above cite them
by number; new findings are numbered 10 up and the collision is flagged where a
reader meets it.

**What is highest-priority now that 14 is closed:** items **12** and **10**,
both self-contained, each closing something already written down. Then **5f**'s
successors — **8**, then **9**, with **11** last, since it should not be built
before 9 can measure it.

**Yours rather than anyone else's, and unchanged by any of today:** §3's
two-machine measurement, and the publish — item **6**'s `0.1.4` and item
**15**'s `0.1.5` both need `npm login`, and item 15 needs no dependency edit at
all, since `package.json` already declares `^1.30.0` and a plain relock picks up
the fix.
