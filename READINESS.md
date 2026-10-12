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
EPI_XNET_ROLE=publisher EPI_XNET_DOMAIN=xnet-<same> node scripts/live-verify/cross-internet.mjs
# host B
EPI_XNET_ROLE=reader    EPI_XNET_DOMAIN=xnet-<same> node scripts/live-verify/cross-internet.mjs
```

The publisher holds past its own write on purpose — Holochain is not a server,
so if the publishing conductor exits there is no peer left holding the entry.

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
