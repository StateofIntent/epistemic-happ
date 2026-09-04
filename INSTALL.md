# Installing the Epistemic Resonance Protocol

This is for someone who wants to **run** it, not build it. If you want to work
on the code, read [README.md](README.md) §6 instead.

## What you need

**The [Holochain Launcher](https://github.com/holochain/launcher/releases),
a release built on Holochain 0.7.** The Launcher is the desktop application
that runs Holochain apps — it creates your identity, stores your data
locally, and connects you to other people running the same app. Download the
version for your operating system from its releases page and install it.

**The Launcher's Holochain version has to match this app's.** A `.webhapp`
built for 0.7 will not install into a 0.4-era Launcher, and the error you
get says something about the manifest rather than about versions: the app
manifest format changed at 0.6, and an older Launcher cannot parse it.
Launcher releases name the Holochain version they bundle; pick one that
says 0.7.

You do **not** need Rust, Node, a terminal, or a copy of this repository.

## Installing

1. Download **`epistemic-resonance-happ.webhapp`** from
   [this project's releases](../../releases/latest).
2. Open the Holochain Launcher.
3. Choose to install an app **from a file**, and select the `.webhapp` you
   downloaded.
4. The Launcher creates an agent key for you and starts the app.

That's it. There is no account, no server to sign up to, and no password to
choose — your identity is a keypair the Launcher generates and keeps on your
own machine.

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

  The five-and-a-half-minute figure this page used to quote was measured
  under Holochain 0.4's tx5/WebRTC transport, which 0.7 replaced with iroh
  QUIC. It has not been re-measured since, so no number is quoted here
  now. What has been re-measured is ordinary propagation between two nodes
  that are both up: about two seconds.

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

## Running an agent instead of a UI

If you want a program rather than a person to participate, use
[`agent-sdk/`](agent-sdk/README.md) — a typed client with the protocol's own
pacing rules built into its API.
