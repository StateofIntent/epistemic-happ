# Can this be handed to strangers yet?

**Short answer: to a handful of people on desktop computers, yes, once a release
is cut. To a crowd, and on phones, no — and the phone part is not a scheduling
problem.**

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
`scripts/live-verify/published-packages.mjs` installs the **published registry
tarballs** — `@stateofintent/agent-sdk@0.1.2` and
`@stateofintent/mcp-server@0.1.2` — into an empty project and drives them
against a real conductor, on every push. It has stayed green through all six
protocol forks. So a stranger who installs the SDK or points an MCP-capable
model at the server is driving the *current* protocol today, with no release to
wait for. That is a smaller audience than desktop installers and a real one.

---

## What blocks a release today

### 1. There is no release of the current protocol

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

### 4. There are no phone builds, and that is upstream

**There is no Android or iOS build, and the desktop builds cannot become one.**
The desktop app is Electron, which does not target mobile at all. A phone build
needs `tauri-plugin-holochain`, and the 0.7-capable work is cleanroom and
awaiting permission upstream. Android is a priority on the Holochain side; every
official iOS reference says "in development".

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

1. **Merge the relay fix** (`epistemic-resonance-desktop` PR).
2. **Pack and release**: `scripts/pack-webhapp.sh`, copy to `pouch/`, bump to
   `0.2.0`, release. Until this happens, nobody can test the current protocol
   without building from source.
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
