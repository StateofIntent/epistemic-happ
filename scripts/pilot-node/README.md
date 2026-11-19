# `scripts/pilot-node/` — is the always-on node on the network the released app is on?

This is the check that answers that question, the harness that proves the check
can fail, and nothing else. It is the whole of what a second always-on operator
needs from this repository.

**It moved here on 2026-11-19** from `~/.epi-pilot-node/`, which is
[`docs/open-work.md`](../../docs/open-work.md) row 7.30's sub-`[D]` taken. Until
then it lived in one person's home directory: unversioned, ungated, and
impossible to send to the second operator who accepted on 2026-11-10. The row's
argument was that **a check nobody else can hold is a check that strands the
person it was written to protect.**

## The failure it exists for

The desktop builds its Holochain network seed as
`` `${productName}-${breakingAppVersion()}` ``, and `breakingAppVersion` maps
every `0.<minor>.<patch>` to the literal `0.<minor>.x`. So a **`0.4.0` release
joins a different network from a `0.3.7` one** — deliberately: a minor is a
relaunch, not an upgrade.

An always-on node that does not update keeps its old seed, keeps a full arc,
keeps answering, and **serves a network with nobody on it.** Nothing it can
observe locally distinguishes that from working — an empty DHT and a healthy DHT
with no current readers look identical from inside. It is a failure in perfect
health, and it costs the operator their donated hardware without either party
learning.

## What is here

| file | what it is |
| --- | --- |
| `verify.mjs` | the check. Installs the happ on first run, then verifies on every run. Exit `0` on the released DHT, `2` on the wrong one, `1` if it cannot tell. |
| `verify-injections.mjs` | watches `verify.mjs` fail, in every way it can, by stubbing **only** the release read. |
| `breaking-version.mjs` | the desktop's band function, ported. The one copy. |
| `band-plan.mjs` | which tags keep a given seed band and which move it. |
| `band-plan-check.mjs` | round-trips every derived tag through the real `breakingVersion`. No conductor needed. |

## Running it

```sh
npm ci --prefix federation                      # @holochain/client, pinned
ln -s ../../federation/node_modules scripts/pilot-node/node_modules
node scripts/pilot-node/band-plan-check.mjs     # no conductor needed
node scripts/pilot-node/verify.mjs              # needs the conductor running
node scripts/pilot-node/verify-injections.mjs   # needs it too; ~9 real runs
```

`verify.mjs` reads the live release from GitHub unauthenticated, so no `gh` and
no token — the repository is public precisely so a second operator needs neither.

Three environment variables, all defaulting to what the author's node has always
used, so nothing changed for it:

- `EPI_PILOT_ADMIN` — conductor admin websocket, default `ws://127.0.0.1:9499`
- `EPI_PILOT_APP_ID` — installed app id, default `epistemic-pilot-node`
- `EPI_PILOT_HAPP` — the bundle, default the repo root's
  `epistemic-resonance-happ.happ`. It is **gitignored and built, not committed**
  — run `./scripts/pack-webhapp.sh` first. Needed only on the run that installs.

## What did **not** move, and must not

The keystore, the passphrase and `conductor-config.yaml` stay in
`~/.epi-pilot-node` and are **not in this repository.** That asymmetry is
probably why the move was never asked about for so long — the directory looks
like one thing, and it is two. `~/.epi-pilot-node/verify.mjs` is now a symlink
to this directory, so `cd ~/.epi-pilot-node && node verify.mjs` still works and
there is still only one copy.

## Why it is not in CI, which is a decision rather than an omission

Both of the things that make this check real are things CI does not have: a
**running conductor with an installed cell**, and a **live read of the GitHub
release**. Worse than merely failing, it would fail *dishonestly* — the
`http404` and `down` modes exist to prove the check fails loud when it cannot
reach GitHub, and in CI those are indistinguishable from an ordinary rate limit.
A required check that goes red for reasons unrelated to what it measures gets
muted, and a muted check is the vacuous green this directory exists to refuse.

`band-plan-check.mjs` is the part that *is* CI-shaped — pure, no conductor, no
network — and is left ungated for now only because nothing in this directory is.

## Two limits, stated rather than implied

1. **It detects; it cannot migrate.** A new seed is a new cell with a new agent
   key and an **empty chain**, so the response to a `NO` is a reinstall and the
   node's tenure starts over. That is a cost worth knowing *before* a bump.
2. **A patch that changed an integrity zome would split the network and this
   would still say YES.** The DNA hash covers the integrity zomes *and* the
   modifiers; `breakingVersion` **is** the project's assertion that patches do
   not do that, and nothing here verifies it. Nothing can: the release publishes
   installers, not the `.happ`, so there is no released DNA hash to read.
