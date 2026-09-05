# Installing the Epistemic Resonance Protocol

This is for someone who wants to **run** it, not build it. If you want to work
on the code, read [README.md](README.md) §6 instead.

## Installing

Download the build for your system from the
[latest release](https://github.com/StateofIntent/epistemic-resonance-desktop/releases/latest):

| your system | file |
|---|---|
| Windows | `...-setup.exe` |
| macOS (Apple Silicon) | `...-arm64.dmg` |
| macOS (Intel) | `...-x64.dmg` |
| Linux | `....AppImage`, or the `.deb` |

The `.zip` and `.blockmap` files in that release are for the in-app updater;
you do not need them.

You do **not** need Rust, Node, a terminal, or a copy of this repository. The
app carries its own Holochain conductor. There is no account, no server to
sign up to, and no password to choose unless you want one — your identity is
a keypair the app generates and keeps on your own machine.

**Not the Holochain Launcher.** If you have used Holochain apps before, that
is the tool you would reach for, and it will not work here. Its most recent
release is v0.400.0 from March 2025 and bundles Holochain 0.4.1; this app is
on 0.7, and the app manifest format changed at 0.6, so the Launcher fails to
parse the bundle and reports an error about the manifest rather than about
versions. The desktop builds above replace it — each Holochain app now ships
its own conductor rather than sharing one installer.

## Four things to know before you install

None of these are reasons not to try it. They are things you would otherwise
find out the hard way.

**The app is not code signed.** On **macOS 15 (Sequoia)** it is quarantined
when you open it, and the System Settings option that used to allow it has
been removed. You have to open Terminal and run:

```
xattr -r -d com.apple.quarantine "/Applications/Epistemic Resonance.app"
```

On Windows, SmartScreen will warn you; "More info" then "Run anyway".

**Whether two installs on different networks can find each other is
untested.** Everything on this project was verified with several conductors
on one machine — real separate processes, real transport, real gossip, but
one physical host. Two laptops behind different home routers is the one case
nobody has been able to check. If you and a friend both install this and
never see each other's claims, that is the most likely explanation, and it
is worth reporting.

**Peer discovery runs on `dev-test-bootstrap2.holochain.org`.** That is
Holochain's own development and testing infrastructure. It is not run by
this project and nobody has promised to keep it running. If it goes away,
installed copies stop finding each other.

**Your data will not survive an incompatible upgrade.** Versions 0.1.x share
a conductor and its databases; a future 0.2.0 — which any Holochain version
change requires — starts fresh. Treat what you publish with this build as
impermanent.

## Finding other people

Everyone running the same release lands on the **same network**. The app
declares no network seed, so the bundle inside determines which network you
join: same version, same peers.

One caveat repeated from above, because it is the one that will actually
bite, and one more:

- **Peer discovery across the internet has not been tested.** Everything in
  this project has been verified with several conductors on one machine
  against local discovery services — real separate processes, real transport,
  real gossip, but one physical host. Whether two laptops behind different
  home routers find each other is the one thing nobody here has been able to
  check. If you are the first two people to try it, you are also the first
  test.
- **A node that has been offline is not current the moment it returns.**
  With only one other person on the network, a node that tried to reach a
  peer while it was down waits out a retry backoff before trying again;
  with a third person online it is usually seconds, since a returning node
  has no failure history against someone who stayed up.

  On Holochain 0.7 that wait is **about a minute**: two conductors taken
  offline, each having written history the other could not see, converged
  on both after rejoining in 65 and 60 seconds respectively. Ordinary
  propagation between two nodes that are both up is about two seconds.

  This page previously quoted five and a half minutes. That was accurate
  when written and was measured under Holochain 0.4's tx5/WebRTC
  transport, which 0.7 replaced with iroh QUIC — the figure improved by
  roughly five-fold with the transport, and neither number was a guess:
  both come from `scripts/live-verify/partition-rejoin.mjs`, which
  partitions a real network and waits out the real backoff.

## What you can do in it

Publish a claim with a declared confidence level. Critique someone else's
claim, choosing the *kind* of critique you are making. Attach evidence.
Retract something you no longer stand behind — which adds a record rather than
deleting anything. Found a domain, and join one.

Two things you will notice are missing, and both are deliberate:

- **There are no scores, rankings or reputation numbers anywhere**, for any
  agent, claim or critique. That is the project's first invariant and it is not
  an oversight — see Appendix A of the README.
- **Some actions are rate-limited on purpose.** Critiques are capped per hour.
  The limit is not a performance measure; it exists so that disagreement costs
  something.

## If something goes wrong

- **The app installs but shows nothing.** Load a domain first — the browse
  screen is empty until you name one. Try publishing a claim into a domain of
  your own to confirm writing works.
- **You cannot see a friend's claims.** First check you are both on the same
  release — different versions mean different networks and will not see each
  other at all. If you are, this may be the untested case described at the
  top of this page: two machines on different networks finding each other has
  never been verified, and a report of it failing is genuinely useful.
- **It was working and now seems stale.** See the backoff note above.
- **macOS refuses to open the app**, or offers no way to allow it. That is
  the code-signing quarantine described above, not a corrupt download — see
  the `xattr` command in "Four things to know".
- **You tried the Holochain Launcher and it rejected a `.webhapp`.** You do
  not need the Launcher; install one of the desktop builds instead. No
  released Launcher runs Holochain 0.7.

## Running an agent instead of a UI

If you want a program rather than a person to participate, use
[`agent-sdk/`](agent-sdk/README.md) — a typed client with the protocol's own
pacing rules built into its API.
