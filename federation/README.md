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

## Importing foreign critiques (Stage 5, `docs/open-work.md` item 2.5)

`--import-critiques` reads the remote membrane's discourse and records, on the local network, a **witness** for each foreign critique found.

**A foreign critique cannot become a native `Critique`.** `validate_critique` binds `critique.author` to the action's author (SPEC §5.2), so a `Critique` on this chain asserts that *this* agent wrote it. Writing somebody else's objection as one would forge provenance — permanently, since Invariant 6 keeps it. A `ForeignCritique` entry type is the honest home for one and is an integrity change, so it belongs in the single accumulated `protocol_version` bump rather than here.

So each import is `import_foreign_critique`: a `Claim` tagged `federation-import`, authored by the importer, saying *"a critique saying this exists over there."* The foreign author, target and mode travel as **opaque strings**, never typed hashes — a type would assert a validation this network never performed. `foreign_content_verified` is always `false`, because no DHT can see another's data to verify anything.

**It is excluded from `get_discourse_health`, and that is the part that would have bitten silently.** An import *is* a Claim in the domain — that is what makes it discoverable — so without a filter, importing fifty critiques from a partner would raise this domain's `total_claims` by fifty without anybody here having said anything. `DiscourseHealth.imported_claims` reports the count separately, which is the same remedy `reading_claims` is, for the same measured reason.

**The lens is an argument, because the reader is the promiser.** `AttestationPolicy` and `ConductancePolicy` are reader-supplied (READINESS item 10), so the remote's discourse read unfiltered and read under a declared policy are different sets and neither is "the" set. `--min-attestations`, `--min-conductance` and `--half-life-secs` declare it, and it lands in the permanent entry via the same `describe_method` a published reading uses. Supplying none means unfiltered — itself a methodological choice, and the most consequential one, so it is stated rather than left blank.

**It refuses unless federation is mutual.** Importing from a membrane that has not recognised you back is helping yourself to somebody's discourse, and the one-sided case is exactly what `FederationRecord` exists to expose.

### Verified live, two genuinely separate networks

Against `scripts/network.sh`'s **nodeA and nodeC**, which differ only in network seed and therefore have **different DNA hashes** — `hC0kwMLmv/K/yMZE…` and `hC0kgUquICMJXWNh…`, confirmed unequal in the run — so this is a real boundary and not one conductor pretending to be two:

- **Mutual federation confirmed**, then **2 witnesses written** on nodeA for the 2 critiques nodeC held.
- **The exclusion holds end to end**: nodeA's `total_claims` stayed at **2** across the import while `imported_claims` went **0 → 2**.
- **Provenance is the importer's**: the witness entry's author is nodeA's own agent key, with the foreign author recorded as an opaque string in the content.
- **The lens reached the permanent entry**: *"attestation lens: 2 distinct attester(s) required, direct attestation only, roots unrestricted; conductance lens: minimum effective conductance 0.25, half-life 604800s as promised by this reader."*
- **One-sided import REFUSED**: an unfederated membrane pair reports `NOT mutually federated` and `--import-critiques REFUSED`, exit 1.

**AND THE FIRST RUN OF THIS WAS WRONG IN A WAY WORTH RECORDING.** It reported `read_through: no attestation lens` despite the flags being passed — because `hc dna pack` packages the wasm already on disk and the last injection build was still there. The source had been restored; the **wasm had not**. That is the trap `scripts/live-verify/README.md` documents, hit for real: restoring the source is not restoring the build. The injection drivers now rebuild and repack after restoring pristine.

The zome half is covered by `scripts/live-verify/microbiome.mjs` (19 checks, one conductor, with injections DA/DB/DC).
