# The Linked Data face

A **one-way** HTTP export of entries on an Epistemic Resonance DHT.

The protocol solved a problem the Semantic Web never did — typed disagreement
and cryptographic provenance — and inherited one the Semantic Web solved
decades ago: a `uhCEk…` hash is not something anyone pastes into a browser,
and no existing tool speaks Holochain. This service is the bridge in the only
direction that is safe: **out**.

```bash
cd gateway && npm install && npm run build
EPI_GATEWAY_ORIGIN=https://erp.example npm start
```

| | |
|---|---|
| `EPI_GATEWAY_PORT` | default 8795 |
| `EPI_GATEWAY_ORIGIN` | the public origin; every `@id` is minted from it |
| `EPI_GATEWAY_INDEXABLE` | `1` to allow search engines; `noindex` otherwise |
| `EPI_GATEWAY_DNA_HASH` | base64 DNA hash, carried into every document |
| `EPI_ADMIN_URL` · `EPI_APP_URL` · `EPI_APP_ID` | the conductor to read from |

## What it serves

Every resource is one URL in two forms: an ordinary page for a person, and
JSON-LD for a program — by `Accept: application/ld+json`, by a `.jsonld`
suffix, or embedded in the page itself so a pasted link still carries its own
data.

| | |
|---|---|
| `/` | what this is, and the domains founded as Membranes |
| `/ns` | the vocabulary, as a real dereferenceable page |
| `/domains/:domain` | that domain's claims, declared **unordered** |
| `/claims/:entryHash` | a claim with its critiques, retractions and flags |
| `/robots.txt` | agrees with the `X-Robots-Tag` rather than contradicting it |

## The three properties this is built around

**One way.** The DHT is the source; HTTP is a mirror. Every zome call goes
through an allowlist in `conductor.ts` containing ten reads and no writer, so
a call to anything else throws before it reaches the conductor; a `POST`
returns 405 with an explanation of where writing actually happens. Widening
what this service can do means editing that list, which makes it a visible,
reviewable act rather than a quiet one.

**The hash travels and stays canonical.** `@id` is an HTTP URL because Linked
Data needs one, but `canonicalHash` is the entry's real address,
`canonicalHashAlgorithm` says which kind, `dnaHash` says which network, and
`isBasedOn` states in the data — not only in the prose — that the DHT copy is
authoritative and this one may be stale or absent. An export whose provenance
is its own URL has recreated the weak-provenance problem it exists to answer.

**Nothing becomes a score.** schema.org offers `aggregateRating`,
`ratingValue`, `interactionStatistic` and `upvoteCount`, and every one of them
would accept this protocol's critiques as input and emit exactly the canonical
comparative number Invariant 1 refuses — under the protocol's own name, in a
document every downstream tool would believe. There is no vocabulary term here
for "how good is this claim". Critiques are exported with their five typed
modes intact, in the order the DHT returned them, and a domain listing
declares `ItemListUnordered` rather than leaving a consumer to infer a
ranking from the sequence.

## Two decisions worth arguing with

**Retractions and flags travel with the claim.** A one-way export that drops a
retraction leaves the web asserting something its author has publicly
withdrawn, in their name, indefinitely. So a retraction is in the document and
*above* the claim on the page, where it is read first — and the claim itself
is still exported, because a retraction withdraws rather than deletes.

**Noindex by default.** Publishing a claim to a DHT is a decision to make it
available to that network. It is not, by itself, a decision to be indexed by
search engines under your own name forever. The gateway's purpose — letting a
person or an agent read protocol material over plain HTTP — is fully served
without indexing, so the default is `noindex` and an operator who has the
standing to decide otherwise sets `EPI_GATEWAY_INDEXABLE=1` deliberately.

Related: this service **connects as an agent**, with a key of its own, because
even a read is a signed zome call. It is not an anonymous window onto other
people's data; it is a member of the network re-publishing what it can read,
which is something a human operator decides to do and answers for.

## Verification

```bash
scripts/sandbox.sh clean && scripts/sandbox.sh start
cd gateway && npm install && npm run build
node scripts/live-verify/linked-data-gateway.mjs
```

Publishes real claims, a real typed critique, a real retraction and a real
antibody flag to a live conductor, then reads them back through the gateway.
See the harness header for what it proves, the fault injection that shows it
can fail, and the three defects its first run found.

## What this is not

It is not a Linked Data store, and it does not make the protocol into one. It
is not a sync — nothing here reads back. It is not a cache with any guarantee:
a gateway sees what its own conductor has, which is not the same as what the
network has, and the pages say so. And it is not an endorsement of what it
exports; the operator chose to run it, and the entries are the authors'.
