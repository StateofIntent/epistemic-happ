# Installing the Epistemic Resonance Protocol

This is for someone who wants to **run** it, not build it. If you want to work
on the code, read [README.md](README.md) §6 instead.

> ## ✅ THE PUBLISHED RELEASE NOW CARRIES THE PROTOCOL THIS REPOSITORY DESCRIBES
>
> *(If you are deciding whether to hand this to other people rather than to
> install it yourself, read [READINESS.md](READINESS.md) instead — it is one
> page and it answers that question directly.)*
>
> **`v0.3.0`, published 2026-10-24, carries `protocol_version: 11`** — the
> version this repository actually describes, including SPEC.md §5.19's
> eighteen link validation rules, the refusal of entry updates, and all five
> autopoiesis stages. Building from source is not the only way to run the
> current protocol.
>
> **Download the latest release and not `v0.2.0`.** `v0.2.0` (2026-10-12)
> carries `protocol_version: 9`; the integrity zome has forked twice since,
> so it is now two forks behind this repository rather than level with it.
> It remains available and it is not broken — it is an older network.
>
> **Every minor version is a different network, and always will be.** The DNA
> hash is computed over the integrity zome (README §11.1), so `0.1.x`, `0.2.x`
> and `0.3.x` are three separate DHTs and only peers sharing a hash gossip at
> all. **Auto-update will not move anyone across** — each step is a minor bump
> and electron-updater only offers semver-compatible releases, so anyone
> already running `0.1.x` or `0.2.x` must download `v0.3.0` by hand. They keep
> their old data directory; the versions install side by side.
>
> **The hash in the release notes is the artifact's, not your cell's.** The
> desktop app installs the bundle with a network seed derived from its version
> (`Epistemic Resonance-0.3.x`), and the DNA hash covers that seed as well as
> the zome. So the cell a `v0.3.0` install runs hashes to
> `uhC0kozxlYwR0REOn2iS4NswBOPzJ7I6kKsRV6o3WOEuoQOuEi-4o`, not to the
> `uhC0kb-i4…` the notes quote. Every desktop install derives the same seed, so
> they are all on one network — but a conductor you run yourself from this
> repository uses no seed and therefore **will not see desktop peers**, which
> looks exactly like broken propagation if you test one against the other.
>
> This notice has now been wrong in both directions, and the second way is the
> instructive one. For five weeks it told readers to download `v0.1.1` while
> describing a protocol that release did not implement. Then `v0.2.0` closed
> that gap and this notice was rewritten to say so — and stayed pointed at
> `v0.2.0` for a day after `v0.3.0` superseded it, because a release was cut
> and the file that tells strangers what to download was not re-read. The
> failure mode is permanent even though each particular wording is not, and §9
> treats a stale instruction as a defect rather than a detail.

## Running two installs side by side (for release step 3's "against that build")

**Established 2026-10-23 by inspecting and launching the real `v0.2.0`
artifact.** Release step 3 still carries the clause *"against that build"*
because every cross-internet crossing measured so far used `hc sandbox`
conductors, which use no network seed and therefore cannot see desktop peers.
Closing it needs the packaged app. Here is what that actually takes, and what
stops it being automatable.

**The app does take the flags you need.** Hidden in the bundle, not documented
anywhere until now:

| flag | what it does |
|---|---|
| `-p, --profile <string>` | a **separate data store**, under `~/.config/org.stateofintent.epistemic-resonance/<version>/<profile>/` |
| `-n, --network-seed <string>` | overrides the derived seed, on first run of that profile |
| `-b, --bootstrap-url <url>` | not persisted across restarts |
| `--relay-url <url>`, `-s, --signal-url <url>`, `--ice-urls <csv>` | likewise |
| `ADMIN_PORT=<n>` (env) | pins the admin websocket; **without it a free port is chosen dynamically**, so there is nothing to connect a harness to |

So two installs CAN share one machine, with distinct profiles and pinned admin
ports. The `default` profile is untouched by this.

**The derived seed is confirmed, not merely asserted.** The bundle computes it
as `${productName}-${breakingAppVersion()}` → `Epistemic Resonance-0.2.x`, and
the release notes embedded in the artifact itself state both hashes exactly as
the notice above does: the packaged artifact at
`uhC0kUHSiD5aAt7BH6XJ3j7XGfdaxLL3oFUj6f-2OPU29caU0ZkxF`, and the cell a desktop
install actually runs at
`uhC0kozkSiLXO9mxkIAVWCRm6Qos6FYnyH65_gMkkP10hXUwtxVX0`.

**AND IT CANNOT BE DRIVEN HEADLESS, which is the real reason this item needs
hands rather than only two machines.** `passwordMode` is `password-optional`, so
the app opens a **Setup** screen — *Setup With Password* / *Setup Without
Password* — and **the Holochain conductor does not launch until somebody
clicks**. Measured on a fresh profile: the profile directory, `data/conductor`
and `data/keystore` are all created, `data/.pw` is **not**, the pinned
`ADMIN_PORT` never listens, and the app's own log file stays empty at zero
bytes. There is no CLI path past that screen.

So the procedure is: launch twice with different `--profile` and `ADMIN_PORT`,
**click through Setup in each window by hand**, and only then can a harness
attach to the two admin ports and check that a claim written in one appears in
the other.

**THE PROTOCOL ITSELF WORKS ON THE PACKAGED BUILD, verified 2026-10-23 against
a running `v0.2.0` install.** This is the half of step 3 that does not need two
machines, and it is now done rather than assumed:

- the cell the install runs hashes to
  `uhC0kozkSiLXO9mxkIAVWCRm6Qos6FYnyH65_gMkkP10hXUw…` — **the seeded desktop
  hash this file records, confirmed live rather than quoted**;
- the zome reports `declared_version: 9, implemented_version: 9`, so the
  artifact's protocol version is confirmed from the cell and not from the
  release notes;
- a `Claim` written through the app's own conductor was **indexed by domain and
  rendered in the app's UI**, with the author shown as the same agent the window
  reports as connected, and the grounding read correctly flagging it *"Not
  grounded — no cited evidence chain reaches a source"* for a claim citing no
  evidence;
- a `Retraction` against it was written, linked to the claim, and **the UI then
  showed the claim as retracted by its author** — while the claim itself
  **remained readable by hash**. Invariant 6 behaving as designed: a retraction
  adds provenance, it does not remove the record.

The conductor is reachable for this: admin on the port the app logs as
`###ADMIN_PORT:…###` with origin `kangaroo`, and the app interface with origin
`webhapp://webhappwindow` (both from `conductor-config.yaml`'s
`allowed_origins`). So a harness CAN attach to a running install without
driving the GUI — which is what makes the two-machine test automatable once two
installs are up.

**WHAT STILL NEEDS HANDS IS NARROWER THAN THE ROW SUGGESTS.** Not the protocol
work — that is scriptable through the conductor, as above. Only two things: the
Setup click on first run of each profile, and the second machine.

~~**ONE THING TO SETTLE BEFORE DOING IT.**~~ **SETTLED BY THE RELEASE, NOT BY A
DECISION.** This paragraph asked whether a two-install test against `v0.2.0`
— `protocol_version: 9` against `main`'s 11 — validated the packaging of the
protocol this repository describes or of an artifact two forks behind it.
`v0.3.0` shipped on 2026-10-24 at `protocol_version: 11`, so the question has
no subject any more: **run the test against `v0.3.0`**, where the packaged
artifact and `main` are the same protocol and *"against that build"* means the
build the repository documents.

**WHAT CARRIES OVER TO `v0.3.0` AND WHAT DOES NOT.** The flags, the pinned
`ADMIN_PORT`, the Setup-click block and the two admin origins are properties of
the Kangaroo wrapper rather than of the protocol, so they carry. Three things
change with the version and must not be copied from above:

- the derived seed becomes `Epistemic Resonance-0.3.x`, so the cell a running
  install hashes to
  `uhC0kozxlYwR0REOn2iS4NswBOPzJ7I6kKsRV6o3WOEuoQOuEi-4o`, while the release
  notes quote the artifact's `uhC0kb-i4w7LvWd-pzqG3Wmm76P0U4pFZ3yGXhWzp-aRCpinsVDdh`;
- the profile path is under `<version>`, so `0.3.x` profiles are a fresh tree
  and a machine that has run both carries both;
- **the launch milestone string changed.** `v0.2.0` logged `Conductor ready.`;
  `v0.3.0` logs `Connected to admin websocket.` and `Attached app interface
  port` instead (`READINESS.md` §1). Do not grep for the old string and
  conclude the conductor never came up.

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

## Phones: not yet, and the reason is upstream

There is no Android or iOS build, and the desktop builds above cannot become
one — they are [Kangaroo](https://github.com/holochain/kangaroo-electron)
builds, which is Electron, and Electron does not target mobile at all. A phone
build would be a **separate** packaging project on Tauri 2 plus
[`tauri-plugin-holochain`](https://github.com/darksoil-studio/tauri-plugin-holochain),
which is the Holochain ecosystem's mobile path.

The UI is not what is missing: `mobile-ui/` is already responsive and
PWA-installable, and already adapts to being hosted rather than configured, so a
mobile shell would load it unchanged.

What blocks it sits one step upstream of this repository, so everything below is
recorded with its date and its source — it is somebody else's work, and the first
account of it reached here wrong:

- **Holochain 0.7 itself is ready.** It added wasmer's wasmi interpreted
  backend, which satisfies Apple's rule against hot-loading binaries — the thing
  that kept Holochain off iOS for years.
- **darksoil's published plugin is still on 0.6.** As of **2026-09-12**,
  `tauri-plugin-holochain` pins `holochain_types = "0.6"`, its branches stop at
  `main-0.6.1`, and `main` was last updated on 2026-05-15 by merging `main-0.6`.
  These zomes pin `hdk = "=0.7.0"`, so a 0.6 conductor cannot run them.
- **And no 0.7 branch should be expected from them.** Per Paul d'Aoust on
  **2026-09-14**, darksoil have moved from building Holochain developer tools to
  building p2p applications full-time, and who maintains the shipyard tool is
  unconfirmed. `tauri-plugin-holochain` is thought — not confirmed — to be the
  core of p2p shipyard, and of iOS support too.
- **A 0.7-capable replacement exists, and the holdup is a name rather than a
  licence.** Holochain have **cleanroom-implemented** their own, and the one thing
  being asked of darksoil is permission to use the now-outdated library's name.
  **The earlier version of this page said otherwise** — that the plugin had been
  *forked* and distribution consent was pending — which came from a secondhand
  report its own author corrected on 2026-09-23. A fork needs a copyright licence
  to someone else's source; cleanroom work needs no such licence, and a name is a
  separate question that does not gate shipping code.
- **iOS has no official support, but it is not untried.** Android is supported;
  every official iOS reference says "in development" and that project's own iOS
  how-to page returns 404 — yet two people have it working independently, one
  with an LLM's help. Unpaved, not impossible.

README.md §9 tracks this, including how the first account of it turned out to be
wrong and what the distinction between a fork and a cleanroom build changes.

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

**Two installs on different networks CAN find each other, and that is now
measured rather than hoped.** On 2026-10-22 four claims were crossed between
two separate households on two different ISPs, in both directions, all of
them in under seven seconds and two of them sub-second in transit — plus a
mobile-CGNAT pair with a negative control. This was the one case nobody had
been able to check, and it was the largest open question about whether this
is usable by two people at all. **This paragraph said "untested" for weeks
after it stopped being true**, which is worth knowing about a document you
are reading before you install something.

What is still unverified is **two desktop installs** specifically: every
crossing above used conductors run from the repository, not the packaged
app. The transport is the same; the packaging is not. So if you and a friend
both install this and never see each other's claims, that is still worth
reporting — but it is no longer the likeliest explanation.

**Peer discovery runs on `dev-test-bootstrap2.holochain.org`.** That is
Holochain's own development and testing infrastructure. It is not run by
this project and nobody has promised to keep it running. If it goes away,
installed copies stop finding each other.

**Your data will not survive an incompatible upgrade, and two have already
happened.** Each minor version has its own conductor and its own databases:
`0.1.x`, `0.2.x` and `0.3.x` are three separate networks that never gossip
with each other, and a machine that has run all three has three independent
data directories on it right now. `v0.3.0` (2026-10-24) carries
`protocol_version: 11`; `v0.2.0` carried 9 and `v0.1.1` predated the
versioning mechanism entirely.

So: **install the latest release and expect the next minor version to start
you fresh.** Auto-update will not offer it to you, by design — a patch
release would put a new interface in front of your old data, so breaking
changes are deliberately made visible as a manual download. Treat what you
publish with this build as impermanent *across upgrades*, while noting that
within one network nothing you write can ever be deleted. Those two facts
sound contradictory and are not: the network can be left behind, and the
record inside it cannot be edited.

## Finding other people

Everyone running the same release lands on the **same network**. The app
declares no network seed, so the bundle inside determines which network you
join: same version, same peers.

One caveat repeated from above, because it is the one that will actually
bite, and three more — two of which are permanent and worth reading before
you write anything you would mind standing behind forever:

- **Peer discovery across the internet has not been tested.** Everything in
  this project has been verified with several conductors on one machine
  against local discovery services — real separate processes, real transport,
  real gossip, but one physical host. Whether two laptops behind different
  home routers find each other is the one thing nobody here had checked.

  **One crossing has now been measured, and it is not your case.**
  `.github/workflows/cross-internet.yml` ran two conductors on two different
  machines against this same public bootstrap, with the DHT as the only channel
  between them, and an entry crossed **inside five seconds** on
  each of two runs — peer discovery, NAT traversal through the relay, and gossip
  of one entry, between two hosts that had never heard of each other. (Five
  seconds is how often the test looked, not how long it took; both runs found it
  on the first look.) That is the first evidence this project has
  ever had that any of it works off one machine.

  **But those were two datacentre VMs with good connectivity, which is the easy
  version of the problem.** Two laptops behind different consumer routers is
  harder — residential NATs are the case relays exist for.

  **A consumer measurement now exists too, as of 2026-10-22: home broadband to
  a phone hotspot, and back.** One entry crossed each way through the same
  public bootstrap and relay — under two seconds in the direction where the
  receiving side was already watching, and a control run with mismatched
  network seeds saw nothing at all for ten minutes, which is what makes the
  other two readings worth anything. A phone hotspot is CGNAT, so that crossing
  had no inbound path and went through the relay entirely: closer to the worst
  case than to the easy one.

  **And then two actual home routers, the same evening.** One machine stayed on
  its home connection; the other was carried to a different household on a
  different ISP. Four records crossed, every one in under seven seconds — and
  the receiving machine's own log shows it processing the incoming data in the
  same second the other machine wrote it, so the time was spent filing the
  record locally rather than moving it between the houses.

  **A machine that comes back after being offline is a different story, and a
  worse one.** This was tested the same day: one machine was taken off the
  network for fourteen minutes while three records were written, then brought
  back. Fifteen minutes later it still had none of them — while a freshly
  installed machine, joining for the first time at that same moment, received
  all three within seconds of starting up.

  **It does catch up on its own, and the wait grows with how long you were
  away.** Two further runs measured it with nothing else on the network: about
  five minutes of catch-up after two and a half minutes offline, and about
  eleven and a half minutes after fifteen minutes offline. So expect minutes,
  not seconds — and more of them the longer you were gone.

  When it does catch up, it catches up **completely**. There is no half-synced
  state where some records arrive and others go missing quietly, which would be
  a worse problem than the waiting.
- **A node that has been offline is not current the moment it returns.**
  With only one other person on the network, a node that tried to reach a
  peer while it was down waits out a retry backoff before trying again;
  with a third person online it is usually seconds, since a returning node
  has no failure history against someone who stayed up.
- **Nothing you publish can ever be deleted — not by you, not by anyone.**
  This is the protocol's central design choice, not a missing feature: a record
  that can vanish cannot carry its own history, so validation refuses every
  delete, of entries and of links. You *can* publish a **retraction**, which is
  a new entry saying you withdraw an earlier claim and why. The original stays
  readable with the retraction attached to it. Other people can **flag** your
  claim with a typed objection, which likewise adds something rather than
  removing anything. There is no moderator, no takedown, and no administrator
  with a delete button — not as policy, but because the capability does not
  exist in the code.

  **So an erasure request cannot be honoured.** If you are considering running
  this for a group of people, that is a decision to make deliberately rather
  than discover: under GDPR and similar regimes a person may ask for their data
  to be erased, and this network has no mechanism that could comply. For a
  private group among people who understand that, fine. For a public deployment
  it is a real exposure, and it belongs in whatever you tell participants before
  they join.
- **If you lose your key, your writing stands forever and you can never take it
  back.** Your identity here is a cryptographic key held by the app on your own
  machine. There is no account, no password reset, no recovery phrase, and
  nobody who can issue you a replacement — lose it and that identity is simply
  gone. Everything it published stays on the network, because nothing is ever
  deleted, and **only the original author can retract a claim** — validation
  checks that the retraction's author matches the claim's, so a key you no
  longer hold is a claim nobody can ever withdraw. Others can still flag it;
  nobody can retire it. Two practical consequences: back up the app's keystore
  if you care about keeping your identity, and treat a first claim from a fresh
  install as permanent rather than as a draft.

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
  other at all — and since `0.1.x`, `0.2.x` and `0.3.x` are three separate
  networks, "different versions" includes anyone who has not upgraded. If you
  are on the same release, cross-network discovery itself is **measured
  working** (see the top of this page), so a failure is worth reporting rather
  than expected — most likely in the packaged-app case, which is the half that
  has not been verified.
- **It was working and now seems stale.** See the backoff note above.
- **The same release looks different on two of your machines** — a white page
  with muted green on one, a dark page with brighter green on the other. Both
  are the app working correctly: it follows each machine's light/dark
  preference by default, and the desktop builds embed a webview that reports
  whatever the OS says. On Windows that comes from Settings > Personalization
  > Colors > "Choose your default app mode" (the separate *Windows mode*
  setting only changes the taskbar and Start menu, not embedded webviews). If
  you would rather the app not follow the machine at all, the theme control in
  the top right of the app header pins it to Light or Dark; that choice is
  remembered per machine and never leaves it.
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
