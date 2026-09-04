# Installing the Epistemic Resonance Protocol

This is for someone who wants to **run** it, not build it. If you want to work
on the code, read [README.md](README.md) §6 instead.

## The honest state of installation right now

**There is currently no download-and-run path for this app, and that is a
real gap rather than a missing paragraph.** It is worth two minutes of your
time to understand why, because the obvious instruction — "get the Holochain
Launcher" — is the one thing that will not work.

This app runs on **Holochain 0.7**. The [Holochain
Launcher](https://github.com/holochain/launcher/releases), which is what
these instructions used to point at, has not had a release since **v0.400.0
in March 2025, and that release bundles Holochain 0.4.1**. A `.webhapp`
built for 0.7 cannot be installed into it: the app manifest format changed
at Holochain 0.6, so an older Launcher fails to parse the file and reports
an error about the manifest rather than about versions, which is a
confusing way to discover the real problem.

So the Launcher is not a matter of picking the right version. There is no
version of it that runs this app.

**What replaced it** is
[Kangaroo](https://github.com/holochain/kangaroo-electron): rather than one
desktop application that installs many hApps, each hApp is packaged into its
own standalone, cross-platform Electron app with a Holochain conductor built
in. Its current branch targets Holochain 0.7 and the same
`@holochain/client` 0.21 series this project uses, and it takes exactly the
`.webhapp` this repository already builds — you drop the file into its
`pouch/` folder and it produces installers.

That is a **maintainer** action, not something you can do from a releases
page, and this project has not done it yet. Until it does, running this app
means building it: see [README.md](README.md) §6, which is verified working
end to end on 0.7.

If you want to be the person who closes this gap, the `.webhapp` is already
correct for it — including the `icon.png` at the root of its UI assets that
Kangaroo requires. What is missing is the packaging repository and a release
pipeline, not anything in this codebase.

**One caveat to weigh before doing that.** Kangaroo labels its Holochain
0.7 branch *unstable* and its 0.6 branch *stable*. This project moved to
0.7 deliberately — 0.4 was fourteen months unmaintained, and 0.6 would have
meant paying for the same source-level migration twice — but a packaged
release for other people to install is a different kind of commitment than a
development toolchain, and 0.7 was five weeks old when this was written.

## Finding other people

Everyone who installs this same `.webhapp` lands on the **same network**. The
app declares no network seed, so the bundle itself determines which network
you join: same file, same peers.

Two honest caveats, because the alternative is you discovering them yourself:

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
- **You cannot see a friend's claims.** Check you both installed the same
  `.webhapp` file. Different builds mean different networks, and they will not
  see each other at all.
- **It was working and now seems stale.** See the backoff note above.
- **The Holochain Launcher rejects the `.webhapp`, with an error about the
  manifest.** That is the version mismatch described at the top of this
  page, not a corrupt download. No released Launcher runs Holochain 0.7.

## Running an agent instead of a UI

If you want a program rather than a person to participate, use
[`agent-sdk/`](agent-sdk/README.md) — a typed client with the protocol's own
pacing rules built into its API.
