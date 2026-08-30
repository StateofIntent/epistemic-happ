# SSTorytime local instance tooling

This directory resolves the four remaining `README.md` §9 Phase 2 checklist
items: a per-agent local SSTorytime instance, an N4L ingestion pipeline, the
graph visualization server, and cone-path navigation. All four turn out to be
mostly a deployment/wiring problem, not new algorithm or rendering code —
SSTorytime (Mark Burgess' reference implementation, see `README.md` §2.2)
already ships a real N4L compiler, an HTTP graph browser, and a cone-path
solver. What was missing was the glue connecting this repo's
`n4l/arrows-epistemic.sst` vocabulary and exported data to that toolchain,
and scripts to stand it up repeatably.

## Prerequisites

- `go` — https://go.dev/dl/
- A PostgreSQL server this agent controls (`psql` on `PATH`)
- `openssl` — for the visualization server's self-signed TLS cert

None of these are installed by these scripts — that's a real system-level
decision this project leaves to the operator, same as `README.md` §6.1's own
prerequisites list.

## Usage

```bash
# One-time (or after a version bump) — clone+build SSTorytime, merge our
# arrow vocabulary, create the sstoryline role/db if they don't exist yet.
sstorytime/setup.sh

# Load an N4L export into the local instance. Try the committed fixture
# first — it's the exact sample verified against the real N4L binary in
# README.md §5.2, so this proves the pipeline works without needing a live
# Holochain conductor.
sstorytime/ingest.sh sstorytime/fixtures/sample_export.n4l

# Visualize the ingested graph (§9's "3D graph visualization" — see the
# comment at the top of serve.sh for what "3D" actually refers to here).
sstorytime/serve.sh
# then open https://localhost:8443/ (self-signed cert warning is expected)

# Navigate a cone path between two ingested nodes (§9's "Local cone paths
# navigation"). -begin/-end match via full-text search against node text —
# use a short keyword, not the full sentence a node actually contains
# (confirmed directly: a full-sentence match silently fails at node lookup).
sstorytime/cone-path.sh -chapter "epistemic export" -begin "pelvic" -end "fascial"
```

## Ingesting real Holochain-exported data

Everything above is verified against `fixtures/sample_export.n4l`, a fixed
sample — not a live Holochain conductor. To ingest real data: call the
coordinator zome's `export_to_n4l` (see `README.md` §5.3) against a running
`hc` conductor, save its return string to a `.n4l` file, and pass that file
to `ingest.sh` instead of the fixture. That step needs the Holochain
toolchain (`hc` CLI, a running conductor) installed and working, which is a
separate, heavier prerequisite this pass deliberately did not take on — see
`README.md` §9 for that as its own open item.

## What's gitignored

`sstorytime/.local/` — the cloned SSTorytime source, built binaries, merged
config, and generated TLS cert. All rebuildable from `setup.sh`; nothing in
there is meant to be committed.
