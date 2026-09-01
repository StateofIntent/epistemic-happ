# Federation Bridge

Resolves README.md §9 Phase 5's "federation between domain membranes." Reuses the correlative-witness pattern §2.4 already establishes for the Twitter bridge (`BridgeRecord`), applied to a different pair of systems that share no DHT: two independently-run Holochain networks, rather than Holochain and Twitter.

## Why this is a bridge, not a protocol feature

Two membranes on the **same** DHT are already fully interlinked — nothing about the DNA restricts a `Critique`/`AntibodyPattern` from targeting an entry in a different domain (see `get_cross_domain_critiques`, Phase 4). "Federation" only means something once there's an actual boundary to cross — two conductors that genuinely don't share a network. Holochain gives no native way for one DHT to see another's data; the only way across is an external process that connects to both and carries information between them, the same shape the Twitter bridge already is.

## What gets recorded

`FederationRecord` (a new entry type, `dna/integrity/src/lib.rs`) is **one-sided by construction**: a membrane's own witness that it recognizes a specific membrane on a different network. It can only ever be authored by that membrane's own `creator` (validated on-chain — see `validate_federation_record`). The remote side is necessarily an opaque, out-of-band reference (a label + a hash string) — never a real Holochain hash on the local DHT, the same honest limitation `BridgeRecord.twitter_id` already has for Twitter.

**Mutual federation is never a stored fact on either DHT** — neither network can see the other's data to confirm reciprocation. It's a *derived* answer this bridge computes by connecting to both conductors and checking: does A have a `FederationRecord` naming B, **and** does B have one naming A? Both, independently confirmed, or it isn't mutual.

## Running it

```bash
cd federation
npm install
node federate.mjs \
  --local-admin ws://localhost:8889 --local-app ws://localhost:8888 --local-app-id epistemic-resonance-happ \
  --local-membrane <base64 EntryHash of a real Membrane on the local conductor> \
  --local-label "your-network-name" \
  --remote-admin ws://<remote host>:8889 --remote-app ws://<remote host>:8888 --remote-app-id epistemic-resonance-happ \
  --remote-membrane <base64 EntryHash of a real Membrane on the remote conductor> \
  --remote-label "their-network-name"
```

Add `--check-only` to re-confirm current mutual status without declaring anything new — useful for periodic re-verification, since mutuality is never cached, only ever freshly computed from both sides.

**The membrane hashes MUST be `EntryHash`, not the `ActionHash` `create_membrane` returns.** This is the exact getter/creator hash-type mismatch this project's own history is full of examples of — confirmed the hard way while verifying this tool: passing the wrong hash type fails with a real `Deserialize` error from the integrity zome, not a silent wrong answer. Recover a Membrane's real `EntryHash` via `get_membranes()` and decode, the same pattern used throughout this codebase's own live-verification harnesses (see, e.g., `domains/bootstrap.mjs`'s `CritiqueSpecies` entry-hash recovery for the identical technique).

## Verified live, not just wired

Run against **two genuinely separate `hc sandbox` conductors** (different ports, different sandbox data directories, different agent keys — not one conductor pretending to be two):

- **Positive case**: two real membranes, each on its own network, federated via `federate.mjs` — both sides' `FederationRecord`s created, and `MUTUAL FEDERATION CONFIRMED` reported, matching a direct independent read-back of both conductors (exit code 0).
- **`--check-only` re-verification**: re-run without writing, same confirmed result (exit code 0).
- **Negative case**: two real membranes that were never federated with each other correctly report `NOT mutually federated` (exit code 1) — not a false positive from the mere existence of *some* `FederationRecord` on either side.
- **Error handling**: a hash that genuinely doesn't exist on the network it's queried against surfaces a real `"Membrane not found."` error from the DHT itself, rather than a silently wrong `false`.
