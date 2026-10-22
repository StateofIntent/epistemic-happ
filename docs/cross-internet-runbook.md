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

## 1. The six things that silently invalidate a run

The scripts enforce one of these (a missing seed is refused). The rest are
yours, and each of them produces an output **indistinguishable from a failed
crossing** — which is the whole reason they are listed before the commands.

**1. PROVE THE TWO HOSTS ARE ON DIFFERENT NATs, with a check that cannot
silently pass.** This is the precondition every result rests on and the only one
whose failure invalidates the experiment rather than merely breaking it: two
machines behind one router produce a perfectly healthy-looking crossing that
demonstrates nothing CI had not already. Run this on both hosts and compare:

```bash
ip=$(curl -s --max-time 10 https://api.ipify.org); \
  if [ -n "$ip" ]; then printf '%s' "$ip" | sha256sum | cut -c1-12; else echo "NO INTERNET"; fi
```

Equal values mean one NAT — stop. Different values mean two.

**The guard is not decoration, and it was added because the naive form fooled
us.** `curl ... | sha256sum` with no `-n` test prints
`e3b0c44298fc...` whenever curl returns nothing — that is the hash of the empty
string, and it is a *different* value from the other host's, so it reads as a
pass. On 2026-10-22 a laptop that had just joined a hotspot with no route yet
produced exactly that, and "no internet at all" was one glance away from being
recorded as "confirmed second NAT". Hash only a non-empty body, and say
`NO INTERNET` out loud otherwise.

It hashes rather than prints the address so a home IP does not end up pasted
through a chat log or a commit message; a 12-hex prefix is ample to compare two
values and useless for anything else.

**2. Both machines must run the same `.happ` file, copied — not rebuilt.**
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

**3. `scripts/live-verify/node_modules` has to be recreated by hand.** It is an
untracked symlink to `federation/node_modules` (`.gitignore:21`), so on a fresh
clone the harness cannot import `@holochain/client` at all. Same two lines CI
uses, plus CI's assertion:

```bash
(cd federation && npm ci)
ln -sfn ../../federation/node_modules scripts/live-verify/node_modules
test -d scripts/live-verify/node_modules/@holochain/client \
  || { echo "@holochain/client is not reachable from scripts/live-verify/"; exit 1; }
```

**4. A fresh seed and domain every run, identical on both hosts.** The seed is
mandatory and `cross-internet-node.sh` refuses to start without one: the
shipped `.happ` declares no network seed, so a seedless run joins the DHT every
installer shares and Invariant #6 means whatever it wrote could never be
removed. *Fresh* matters separately from *present* — reusing a previous run's
seed and domain means a claim from the earlier run can satisfy the reader, and
the run proves nothing about today's network.

**5. `EPI_XNET_HOLD_S=1800` on both sides, and the publisher's window must be
at least the reader's.** The default is 600 (`cross-internet.mjs:55`) and two of
the four crossings this repository has ever measured — 929.1s and 943.0s — are
longer than that, so at the default a working network is written down as a
propagation failure. And because Holochain is not a server, a publisher that
exits mid-window leaves nothing for the reader to fetch from: the reader then
measures the publisher's absence, not the network.

**6. Copy the conductor log off before stopping.** `cross-internet-node.sh
stop` does `rm -rf /tmp/epi-xnet`, log included. That log is the only way to
tell a protocol result from a bootstrap outage, and it is needed most on the
runs that failed.

```bash
cp /tmp/epi-xnet/nodeX.log ~/xnet-<run-id>-<role>.log   # BEFORE stop
```

---

## 2. Per-machine prerequisites

Both machines on different consumer networks — two routers, or one router and a
phone hotspot. Not two behind the same NAT, which tests less than CI already
did, and §1.1 is how you establish that rather than assume it.

- **Holochain 0.7.0, `hc` and `holochain`.** `scripts/ci/install-holochain.sh`
  puts the pinned pair in `~/.cargo/bin` and asserts the version rather than
  the exit code. Check with `~/.cargo/bin/hc --version` directly —
  `~/.cargo/bin` is not on this environment's default `PATH`, and the scripts
  pass `-H` explicitly rather than relying on it.
- **Node 22** and the `npm ci` + symlink from §1.3.
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

**START THE READER FIRST. This is the correction the first real run forced, and
it costs the whole timing result when you get it wrong.** The reader measures
from *its own start*, not from the write, so a reader that starts after the
publisher finds the entry already waiting and reports a figure that is only
"how long it took me to ask" — 0.1s, in the run that found this out, against a
true bound of 111s. The window the reader polls must contain the write.

```bash
RUN=xnet-$(date +%s)          # generate ONCE, use the same value on both hosts

# BOTH hosts, first — the conductors can be up well before either half runs
scripts/cross-internet-node.sh start "$RUN"

# laptop B — the READER goes first, and polls an empty domain while it waits
EPI_XNET_ROLE=reader EPI_XNET_DOMAIN="$RUN" EPI_XNET_HOLD_S=1800 \
  node scripts/live-verify/cross-internet.mjs \
  | while IFS= read -r l; do printf '%s %s\n' "$(date -u +%H:%M:%S)" "$l"; done

# laptop A — publish once B is printing "t+Ns nothing yet"
EPI_XNET_ROLE=publisher EPI_XNET_DOMAIN="$RUN" EPI_XNET_HOLD_S=1800 \
  node scripts/live-verify/cross-internet.mjs \
  | while IFS= read -r l; do printf '%s %s\n' "$(date -u +%H:%M:%S)" "$l"; done
```

**Pipe both halves through that `date` wrapper.** The harness prints no wall
clock, and the crossing figure you actually want is the publisher's
`published one claim` timestamp subtracted from the reader's first non-empty
poll — two numbers on two machines. Without the wrapper neither exists, and
you are left with the reader's self-relative figure, which is the trap above.
It also means the result inherits any clock offset between the hosts, so check
`timedatectl` on both; a crossing measured as 2s cannot survive a 10s skew.

CI avoids all of this by aligning both jobs to the run's `created_at`
(`.github/workflows/cross-internet.yml`), which is a luxury two laptops with no
shared clock do not have. You are the alignment.

Then §1.6's log copy, then `scripts/cross-internet-node.sh stop` on both.

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
them. Size the window to the crossings you actually measured, not to 1800s
reflexively: absence over a window shorter than your own crossings is no
evidence of isolation, but absence over 5x the slowest is plenty. The
2026-10-22 run used **600s** against crossings of 2s and under 111s, and spent
20 minutes less of a person's attention for it.

---

## 4. Check the two logs before believing either result

The halves cannot compare notes — they have no channel — so this comparison is
yours, and three of the four checks are about ruling out a false negative.

| Check | Where | A mismatch means |
|---|---|---|
| **Same `DNA hash:`** both sides | harness prints it on connect | different builds, §1.2 — the run measured nothing |
| **Different `agent key:`** | same place | both halves on one machine; nothing crossed the internet |
| **Different NAT fingerprints** | §1.1, run before the window | one router between them — a healthy-looking crossing that proves nothing. Equal values, or `NO INTERNET` from either host, void the run |
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

---

## 6. The first real run, 2026-10-22

Two machines on one household's LAN to begin with: A a desktop on home
broadband, B a laptop moved onto a Samsung phone hotspot. Both
`x86_64` Arch/omarchy, Holochain 0.7.0, the same `.happ` copied over the LAN
(`sha256 0138386790c7…`) rather than rebuilt on each.

| run | direction | seed | result |
|---|---|---|---|
| 1 | A -> B | `xnet-1792663677` | **CROSSED.** Publisher-first ordering, so the only bound is write `11:00:03Z` to first poll `11:01:54Z`: **under 111s**, discovery included |
| 2 | B -> A | `xnet-1792667416` | **CROSSED.** Reader already polling: write `11:14:22Z`, readable `11:14:24Z`, previous empty poll `11:14:19Z` (before the write). **Under 2s** for gossip between discovered peers; under ~85s including discovery |
| 3 | control | `ctrl-a-…` / `ctrl-b-…` | **NO CROSSING in 600s.** 82 polls after the write, all empty, hashes differing by construction |

Validity, in the order §4 lists it: DNA hashes matched within runs 1 and 2
(`hC0kPcXO…`, `hC0kX9R9…`), agent keys differed, public-IP fingerprints differed
(`96ad274aef89` vs `7c58318b6743`), and A's conductor config named
`dev-test-bootstrap2.holochain.org` with the iroh canary relay.

**A trial series followed, and it is the cheap way to get a spread.** The seed
defines the network; the *domain* is just a string. So several trials can share
one conductor pair and one seed, varying only the domain — the peers discover
each other once and each trial is then a fresh entry gossiped between peers
that already know each other, with no restart and one command per trial. Only
the *cold* case needs a fresh seed and a restart on both sides.

| sample | peers | crossing |
|---|---|---|
| trial 1 | cold | 2-7s |
| trial 2 | warm | under 3s |
| trial 3 | warm | under 4s |
| cold 2 | cold | 1-6s |

Five crossings counting run 2, every one single-digit seconds, cold
indistinguishable from warm at a 5s resolution. **Set the publisher's hold
above the reader's expected wait, not below it** — `cold 2` used a 120s
publisher hold against a 600s reader window, which was luck rather than
judgement: a crossing slower than 120s would have found no peer left holding
the entry and produced a false negative.

**Four things this run taught that the preconditions above did not say:**

1. **Reader before publisher**, for the reason in §3 — it cost run 1 its
   resolution and is now the first thing §3 says.
2. **A rebuild can be byte-identical.** The `.happ` was repacked at HEAD before
   the run and came out at the same sha256 as the one packed 26 minutes
   earlier, which is what makes §1.2's "copy, don't rebuild" a convenience
   rather than a correctness requirement on a single machine. Across two
   machines it stays a requirement.
3. **Disable wifi *autoconnect*, not the wifi radio.** A hotspot is wifi, so
   turning the radio off makes the hotspot unjoinable. What matters is that the
   laptop cannot silently fall back to the network the other host is on:
   `nmcli connection modify "<home-ssid>" connection.autoconnect no`. A
   mid-window fallback puts both halves behind one NAT with nothing in the
   output to say so.
4. **Stop the machines idling.** `omarchy toggle idle stay-awake` on both, and
   leave the lid open — a suspend mid-window produces a clean-looking
   `NO CROSSING` that measures the lid.

---

## 7. Two actual home routers, 2026-10-22 evening

The run §6 could not do: the desktop stayed on its home connection, the laptop
was carried to another household and joined that house's own router on a
different ISP. Fingerprints `96ad274aef89` against `4eed418b9c87`.

| sample | laptop wrote | desktop's last empty poll | desktop received | crossing |
|---|---|---|---|---|
| r1 | `13:02:58Z` | `13:03:00Z` (+2s) | `13:03:05Z` | **2-7s** |
| r2 | `13:08:32Z` | `13:08:34Z` (+2s) | `13:08:39Z` | **2-7s** |
| r3 | `13:11:28Z` | `13:11:25Z` (-3s) | `13:11:30Z` | **under 2s** |
| r4 | `13:19:38Z` | `13:19:36Z` (-2s) | `13:19:41Z` | **under 3s** |

**THE UNATTENDED PATTERN, which is what made this possible at all.** The
operator cannot be at both ends, and the reader must be polling before the
write (§3). So the reader side was armed *before leaving*: conductor up, idle
disabled, and **four readers started in parallel on four domains**, each with
an 8-hour window. The away machine could then publish into `r1`...`r4`
whenever it arrived, in any order, with nobody home and no channel between the
two. Both sides piped through the `date` wrapper; the brackets come from
pairing the two logs afterwards.

**AND THE PATTERN CORRUPTED WHAT IT MEASURED.** Four readers on one conductor
are four app connections competing to integrate incoming ops. The reading
conductor logged `database is locked` from `integrate_dht_ops_consumer` at
`13:08:32.478Z` and `13:11:28.697Z` — the same second as r2's and r3's remote
writes. A pure reader writes nothing, so that workflow running means the ops
had already arrived: **transit was sub-second, and the seconds in the table are
local integration under self-inflicted contention.**

So the pattern is right for *whether* an entry crosses with nobody home, and
wrong for *how fast*. **One reader per conductor when the figure matters.** If
several samples are wanted unattended, run them sequentially from one reader
process, or accept that the numbers are upper bounds carrying a contention
artefact — and say which, rather than quoting them as propagation times.

One further log line worth keeping: the relay dropped a connection at
`13:25:18Z` (`ConnectionLost(TimedOut)` against `use1-1.relay.n0.iroh-canary`),
about six minutes after the last crossing and after the away machine had
stopped. It affected no sample, and it is the kind of thing that would look
like a protocol fault if it had landed mid-window.
