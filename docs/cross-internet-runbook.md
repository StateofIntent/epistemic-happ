# Runbook: the two-consumer-network crossing

**The measurement READINESS §3 has been waiting for, written down in the order
an operator does it.** The mechanism already has two long headers —
`scripts/cross-internet-node.sh` explains why a node points at the public
bootstrap and why the network seed is a safety requirement,
`scripts/live-verify/cross-internet.mjs` explains why the DHT is the only
channel between the two halves and why the publisher must outlive its own
write. Neither tells you what to do with two laptops on a table. This file
does, and it exists as a file because the same runbook has been reconstructed
from scratch twice and lost with the scrollback both times.

**What the run is for.** There is exactly one measured cross-internet crossing
in this repository — inside 5s, between two datacentre VMs with both peers
already up (README §9's summary row, and `.github/workflows/cross-internet.yml`
runs `37564173490` / `37567632325`). Two laptops behind two different home
routers: zero measurements. That is the only hardware-blocked row left, and two
decisions are explicitly held for it: whether `partition-rejoin` should
re-measure its baseline and fail only on consistent slowness, and whether
`agent-sdk`'s `dependencyWaitMs` default of 20 minutes is a datacentre number
applied to home connections (READINESS §3, both under "decisions a measurement
makes for you").

---

## 1. The five things that silently invalidate a run

The scripts enforce the sixth (a missing seed is refused). These five are
yours, and each of them produces an output **indistinguishable from a failed
crossing** — which is the whole reason they are listed before the commands.

**1. Both machines must run the same `.happ` file, copied — not rebuilt.**
`/*.happ` is gitignored (`.gitignore:37`), so a fresh clone on the second
laptop has no bundle and the obvious move is to build one. A different build is
a different DNA hash, a different DNA hash is a different network, and the
reader then polls an empty domain for the whole window and reports no crossing.
CI gets away with building twice because both jobs use one pinned toolchain on
one runner image; two laptops are not that. So:

```bash
# on the machine that has the bundle
scp epistemic-resonance-happ.happ laptopB:~/epistemic-happ/
```

The harness prints the DNA hash on both sides precisely so this is checkable
after the fact — step 4 below.

**2. `scripts/live-verify/node_modules` has to be recreated by hand.** It is an
untracked symlink to `federation/node_modules` (`.gitignore:21`), so on a fresh
clone the harness cannot import `@holochain/client` at all. Same two lines CI
uses, plus CI's assertion:

```bash
(cd federation && npm ci)
ln -sfn ../../federation/node_modules scripts/live-verify/node_modules
test -d scripts/live-verify/node_modules/@holochain/client \
  || { echo "@holochain/client is not reachable from scripts/live-verify/"; exit 1; }
```

**3. A fresh seed and domain every run, identical on both hosts.** The seed is
mandatory and `cross-internet-node.sh` refuses to start without one: the
shipped `.happ` declares no network seed, so a seedless run joins the DHT every
installer shares and Invariant #6 means whatever it wrote could never be
removed. *Fresh* matters separately from *present* — reusing a previous run's
seed and domain means a claim from the earlier run can satisfy the reader, and
the run proves nothing about today's network.

**4. `EPI_XNET_HOLD_S=1800` on both sides, and the publisher's window must be
at least the reader's.** The default is 600 (`cross-internet.mjs:55`) and two of
the four crossings this repository has ever measured — 929.1s and 943.0s — are
longer than that, so at the default a working network is written down as a
propagation failure. And because Holochain is not a server, a publisher that
exits mid-window leaves nothing for the reader to fetch from: the reader then
measures the publisher's absence, not the network.

**5. Copy the conductor log off before stopping.** `cross-internet-node.sh
stop` does `rm -rf /tmp/epi-xnet`, log included. That log is the only way to
tell a protocol result from a bootstrap outage, and it is needed most on the
runs that failed.

```bash
cp /tmp/epi-xnet/nodeX.log ~/xnet-<run-id>-<role>.log   # BEFORE stop
```

---

## 2. Per-machine prerequisites

Both laptops, on different home networks — two routers, or one router and a
phone hotspot. Not two machines behind the same NAT: that tests less than CI
already did.

- **Holochain 0.7.0, `hc` and `holochain`.** `scripts/ci/install-holochain.sh`
  puts the pinned pair in `~/.cargo/bin` and asserts the version rather than
  the exit code. Check with `~/.cargo/bin/hc --version` directly —
  `~/.cargo/bin` is not on this environment's default `PATH`, and the scripts
  pass `-H` explicitly rather than relying on it.
- **Node 22** and the `npm ci` + symlink from §1.2.
- **Ports 9899 (admin) and 9898 (app) free.** Any other sandbox on the machine
  will be holding them. Overridable: `start <seed> <admin> <app>` on the script,
  `EPI_XNET_ADMIN` / `EPI_XNET_APP` on the harness — change both or the harness
  connects to nothing.
- **Is the bootstrap answering?** Worth knowing before a 30-minute window
  rather than inferring from a failed crossing afterwards. `404` on `/` is
  expected — it is an API, not a website. `000` is the answer you care about:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' --max-time 20 \
  https://dev-test-bootstrap2.holochain.org/
```

---

## 3. Three runs

**No shared clock, so sequence it by hand.** CI aligns both jobs to the run's
`created_at` because its setup time varies by minutes between runners; here you
are the alignment. Start the publisher, wait for `published one claim into
...`, then start the reader. The publisher holds for the full window either way.

Budget ~35 minutes per run, an hour and a half for all three.

### Run 1 — A publishes, B reads

```bash
RUN=xnet-$(date +%s)          # generate ONCE, use the same value on both hosts

# laptop A
scripts/cross-internet-node.sh start "$RUN"
EPI_XNET_ROLE=publisher EPI_XNET_DOMAIN="$RUN" EPI_XNET_HOLD_S=1800 \
  node scripts/live-verify/cross-internet.mjs

# laptop B, once A prints "published one claim into ..."
scripts/cross-internet-node.sh start "$RUN"
EPI_XNET_ROLE=reader EPI_XNET_DOMAIN="$RUN" EPI_XNET_HOLD_S=1800 \
  node scripts/live-verify/cross-internet.mjs
```

Then §1.5's log copy, then `scripts/cross-internet-node.sh stop` on both.

### Run 2 — B publishes, A reads, **new `RUN`**

Not a repeat for confidence: NAT traversal is not symmetric, and a crossing
from A to B does not establish one from B to A. Two consumer routers can
differ in whether either side can be dialled at all, which is exactly the
dimension this whole experiment exists to measure. Identical commands with the
roles swapped and a fresh `RUN`.

### Run 3 — negative control: **different seeds, same domain**

```bash
# laptop A
scripts/cross-internet-node.sh start "ctrl-a-$(date +%s)"
# laptop B
scripts/cross-internet-node.sh start "ctrl-b-$(date +%s)"
# then publisher on A and reader on B with the SAME EPI_XNET_DOMAIN and HOLD_S=1800
```

**Expect the reader to find nothing and exit 1, and that red is the pass.** The
harness has no expect-absent mode, so this is the one run where you read the
verdict inverted. Without it, a positive result in runs 1-2 has an untested
alternative explanation — that the seed is not isolating anything and both
nodes are simply on the shared DHT, where any claim in the domain would satisfy
the reader. A crossing here would invalidate runs 1 and 2 rather than adding to
them. Same 1800s window as the positive runs: absence measured over a shorter
window than the crossings would not be evidence of isolation.

---

## 4. Check the two logs before believing either result

The halves cannot compare notes — they have no channel — so this comparison is
yours, and three of the four checks are about ruling out a false negative.

| Check | Where | A mismatch means |
|---|---|---|
| **Same `DNA hash:`** both sides | harness prints it on connect | different builds, §1.1 — the run measured nothing |
| **Different `agent key:`** | same place | both halves on one machine; nothing crossed the internet |
| **Windows overlapped in wall clock** | job timestamps | the reader polled while the publisher was down |
| **Bootstrap answered** | `nodeX.log`, §2's curl | an infrastructure outage, not a protocol result |

**Read the time as an upper bound.** The reader polls at t≈0 and then every 5s,
so `CROSSED by poll 3 ... WITHIN 10.0s` means absent at poll 2 and present at
poll 3: the true crossing is somewhere in the preceding 5 seconds. The harness
now says this in its own output because the "5.0s" in README §9 was read as a
latency for months. **Quote the poll count with the figure**, always.

**A red run is not evidence against the protocol.** This depends on
Holochain's dev-test bootstrap and iroh's canary relay; either being down or
rate-limiting looks exactly like a discovery failure. It is an experiment, never
a gate, and never a required check — the same standing as `peering-rate` and
`dht-isolation-probe`.

---

## 5. Where the result goes

The numbers are the easy part; the prose limit-claims are what rot. A crossing
on two home networks falsifies statements in **four** files, and counted claims
are gated here while prose claims are not — so grep the siblings rather than
editing only the row you came for:

- `READINESS.md:10` and `READINESS.md:193` ("Two consumer networks have never
  been measured"), plus the two held decisions at `READINESS.md:268` and
  `:274`, and the ordering at `:352` and `:581`.
- `README.md:1393`, `:1639`, `:1789` (**"the only hardware-blocked row left"**)
  and the summary row at `:1815`.
- `scripts/live-verify/README.md`'s `cross-internet` row, which currently says
  "consumer-NAT and returning-node cases still unchecked".
- `INSTALL.md:169-184`, which tells a first-time user the measured crossing is
  "not your case" and that two consumer routers are "still unchecked" — the
  honest warning until this run exists, and misleading the moment it does.

```bash
grep -rn "consumer network\|never been able to test\|hardware-blocked" \
  README.md INSTALL.md READINESS.md scripts/live-verify/README.md
```

Record the window, the poll count, both DNA hashes, and the control's result —
a crossing figure without its negative control is one number with an untested
alternative explanation.
