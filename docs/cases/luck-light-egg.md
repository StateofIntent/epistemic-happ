# The superior-egg network, mapped onto what is actually shipped

**Drafted 2026-10-24.** Luck Light (Decent/Holochain community) is designing a
grant-based economy backed by an abundant commodity: a **superior egg**, defined
by a nutrient profile that follows from the hen's diet and environment. A *cyber
egg* is a future egg — ten units, immutably pegged, issued at $0.09 a unit and
$0.90 a cyber egg, redeemable for one certified egg from a network member.
Redemption is **on availability rather than from a reserve**, and the units are
spendable meanwhile in a bazaar of homestead goods. He describes the result as a
**decentralised franchise held together through voluntary verified non-binding
actions**, and asked two things:

1. how this protocol could carry the claims his system needs, and
2. whether there is interest in **decentralised IP royalty tracking with proofs
   of origin via authentications** — he holds full blueprints but will not
   publish them, because AI crawlers have made publication the opposite of
   protection.

This file answers both against the **shipped** zome at
`PROTOCOL_VERSION = 11`. Every function and field named below was read out of
`dna/coordinator/src/lib.rs` and `dna/integrity/src/lib.rs` rather than
remembered. §6 is the list of things it cannot do, and that section is the one
to read first if the rest looks too accommodating.

---

## 1. The load-bearing insight: the backing is the certification

Luck Light already said this better than I did — *"certification being the key
factor in valuing a specific crypto with an offline commodity of uncertain
verifiable quantities over time"*. So the peg is not the interesting engineering
problem. **The interesting problem is that "superior" is a claim somebody makes
about a physical object nobody else can inspect**, and every commodity-backed
unit in history has been gamed at exactly that seam rather than at the peg.

This protocol is built for that seam and for nothing else. It does not issue
currency, hold balances, or enforce a peg — Unyt's job, and §6 says so plainly.
What it does is make a reading **attributable, critiquable, and recomputable by
a third party**, which is precisely the assurance he said the system needs
*"even though all operations are decentralized"*.

---

## 2. Certification, and why the freshness horizon belongs to the buyer

A certification is a `Claim` carrying `Evidence`:

```
create_evidence(Evidence {
  content: "Panel: 410mg choline, 1.8mg lutein+zeaxanthin, omega-3 230mg/egg",
  evidence_type: EvidenceType::Measurement,     // the enum's six variants
  source_url: Some("<lab report>"), author, timestamp,
})
create_claim(Claim {
  content: "Flock 14 meets the superior profile for period 2026-Q4",
  domain: "SuperiorEgg", evidence_hashes: vec![panel], confidence,
  semantic_tags: vec!["certification", "region:cascadia"], author, timestamp,
})
```

A randomised retest is a `create_critique` in `CritiqueMode::Evidential` —
literally *"this source doesn't say what you claim"* — against that claim. So
**retesting is not a separate subsystem**; it is the ordinary critique path
pointed at a certification.

Now the part worth his attention, because it was **decided in this repository
today** and it answers the question his design keeps running into.

`get_standing(GetStandingPayload { membrane, standing_policy, horizon })`
returns, per claim, `has_standing`, `engagement_distance` and `engagements`.
Standing atrophies when nothing has engaged a claim within
`StandingPolicy::max_causal_distance` steps of the critique graph. And:

> **`standing_policy: None` is a complete answer — no threshold promised,
> nothing atrophied.** The report says `threshold_promised_by_caller`.

The decision of 2026-10-24 is that **the reader is the promiser**: there is no
network-wide N, no membrane-wide N, and no default. A wholesale buyer who wants
freshly retested flocks passes a tight horizon; a neighbour buying a dozen
passes `None` and sees everything. **Neither is the protocol's opinion.**

This is the right shape for a decentralised franchise and not merely a
convenient one. A franchise standard that any region could impose on the others
would be the centre he is trying to avoid; a standard each market promises for
itself is the same standard without the capture surface. It is also why §4.4 of
the integrity-bump plan was *dropped* rather than scheduled — a declared
per-membrane threshold was a candidate until this question was answered.

**The honest mismatch, stated rather than buried:** atrophy here is loss of
standing over **causal distance**, not elapsed time. A certification nobody has
retested drifts out of the engaged cone because the graph grew around it, which
is close to what he wants but is *not* a wall-clock expiry. The protocol cannot
have one — see §5.

---

## 3. Unfulfilled → fulfilled is `Settlement`, and it already exists

He named this as a core requirement: *"ongoing verified claims and changes of
status from unfulfilled to fulfilled"*. That is the `Settlement` layer added at
`protocol_version: 11`, and its three entry types split exactly the way his
problem needs:

| entry | function | what it is |
|---|---|---|
| `Assessment` | `publish_assessment` | one named agent's `Stance` — `Supports`, `Disputes` or `Abstains` — on a target, with `rationale` and `past_cone` |
| `SettlementPolicy` | `publish_settlement_policy` | `min_assessors`, `max_dissent`, and a `statement` saying what the author thinks it means |
| `SettlementStatus` | `publish_settlement_status` | the result of applying *that* policy to *those* inputs |

The zome's own comment on why: the answer to *when is a claim settled* is
deliberately **not** "when the protocol says so" — Invariant 10 is that the
system does not compute truth — but *"when a named agent's declared policy,
applied to a named set of inputs, says so, and anybody can recompute it."*

**One redemption, end to end.** Producer publishes a delivery `Claim`. Receiver
publishes `Assessment { stance: Supports }`. A policy of `min_assessors: 2,
max_dissent: 0` yields a `SettlementStatus` of fulfilled — **two-sided
delivery, no oracle**. A receiver who publishes `Disputes` instead holds the
status open under `max_dissent: 0`, so **a contested delivery cannot silently
flip to fulfilled**. `recompute_settlement` lets any third party rerun it.

`Abstains` is the variant worth pointing out to him, because grant programmes
usually lack it: a recorded "I looked and I am not taking a position" counts
toward *enough people have looked* without counting toward agreement.

**Grant fulfilment is the same machinery** with the grant as the target claim
and the funder's policy as the declared one. That is the *"proofing grant
fulfillments across the network"* he said he would ponder, and it needs no new
entry types.

---

## 4. Issuance without a reserve: pre-registered capacity forecasts

His position is that an abundant good needs no reserve because producers make
more when they see demand rise. The risk I flagged — more units outstanding than
certified hens can fill — is a **forecasting** problem, and the protocol's
answer is a sealed commitment:

```
pre_register(PreRegisterInput { question, prediction, salt, reveal_deadline })
reveal_pre_registration(RevealInput { pre_registration, prediction, salt })
get_foresight_record(agent) -> { revealed, expired, pending }
```

`SealedPrediction` is **the only private entry type in the zome** — the content
is sealed and only the hash is public — so a region can commit to *"Cascadia
will request 40,000 eggs in Q1"* without telling competitors, then reveal and be
checked against actual redemptions recorded as `EvidenceType::Measurement`.
Issue against revealed-and-correct capacity rather than against a reserve.

A flock lost to bird flu is `create_retraction` with `replacement_claim`
pointing at the revised number. Invariant 6 means the superseded forecast stays
visible, which is the correct behaviour for a track record even though it is
uncomfortable.

**What is not hardened, precisely.** `reveal_deadline` is a `u64` that
**validation cannot check** — SPEC §5.22: validation cannot reach a clock.
`get_foresight_record` classifies `expired` by calling `sys_time()` **at read
time in the coordinator**, so the deadline is a *reader's* judgement, not an
enforced rule. A late reveal is therefore socially visible and not
protocol-prevented. The repair — an ordinal anchor against a declared notary —
is item 4.1, blocked on three questions out with Andras Gerlits. **Don't price
grant money off deadline enforcement yet.** The *seal* is sound; the *clock* is
not.

---

## 5. The IP question, which turns out to be the same question

Proof of origin decomposes into two claims that this protocol treats very
differently:

- **"This is mine"** — solved, strongly. Every entry is signed into the author's
  own source chain. Authorship is not a feature here, it is the substrate.
- **"I had it first"** — solved **only as order, never as a date.**

He can establish priority **without publishing the blueprint**: `pre_register`
seals it, publishing only a hash. Later — in a dispute, or at licensing — he
reveals, and anyone recomputes the hash against the sealed commitment. That
proves he held *that exact text* at an earlier point in the DHT's **causal
order**, which `order_records` reports as a causal-then-hash policy with
`tie_broken` flagged where the order is arbitrary.

**It does not prove a date, and the protocol will not pretend otherwise.** There
is no clock a validator can reach; a `timestamp` field is the author's own
assertion. Against an outside party — a patent office, a court, an infringer —
the date is usually the thing that matters, so he needs **a notary: a named
agent who promises a timestamp and can be blamed for it.** That is the identical
gap as §4, and the identical repair.

That is the real answer to *"proofs of origin via authentications"*: **the
authentication is strong, the origin is ordinal, and the date needs a promiser.**
A system that handed him a date without naming who promised it would be lying,
and would be the same lie every commodity peg has died of.

**Royalty tracking** splits the same way. The protocol can hold the origin
commitment, the attestations (`grant_attestation` / `is_agent_attested`), and
the settlement of a *royalty-due* claim. **It cannot move the money** — that is
Unyt — and under Invariant 1 it will not produce a canonical ranking of
contributors by earnings. Pairing is the natural fit, not an extension: this
side records what is owed and why, that side settles it.

---

## 6. What this protocol will not do for him

Listed because the value of the previous five sections depends on this one being
accurate.

- **It is not money.** No units, no balances, no transfers, no peg enforcement.
- **No wall-clock enforcement anywhere.** §5.22, and §4–5 above.
- **No canonical score for a farm.** Invariant 1 forbids canonical comparative
  reputation. He gets per-reader standing, not a leaderboard. If his franchise
  wants a published producer ranking, that is a product he builds *on* readings
  taken here, under his own name, and it will be his promise rather than the
  protocol's finding.
- **Nothing can be deleted.** Invariant 6. A `Retraction` is an *additional*
  entry; the original stays forever. **This is a direct hazard for his IP
  position**: a revealed blueprint cannot be unrevealed, and there is no cleanup
  path. Reveal in a dispute, not as routine hygiene.
- **A certification is only as good as the panel behind it.** The protocol makes
  a lab reading attributable and contestable. It cannot make it true.
- **The forecasting deadline is unhardened** (§4), and the live network is
  `protocol_version: 11` while the published desktop build carries 9 — so a
  trial today runs against a build two forks behind this repository.

---

## 7. The smallest thing worth actually running

One membrane, three agents, no currency:

1. `publish_constitution` for each of producer, tester, buyer — `Promise {
   action, domain, modality }` each, which is where *voluntary verified
   non-binding* becomes machine-readable rather than aspirational.
2. `create_membrane { domain: "SuperiorEgg", required_promises, constitution }`,
   then `join_membrane` and `grant_attestation`.
3. Producer certifies a flock (§2); tester retests as an `Evidential` critique.
4. Producer pre-registers a capacity forecast; reveals at period end (§4).
5. One redemption settled 2-of-2 with `max_dissent: 0` (§3).
6. Buyer calls `get_standing` **twice** — once with `None`, once with a tight
   `max_causal_distance` — and sees the same flock with and without standing.

Step 6 is the demonstration, and it is the one that would land, because it shows
the franchise standard living in the reader instead of in the protocol.

**Status: not yet built.** The functions above are shipped and the payloads are
accurate, but this sequence has not been run end to end as a fixture, so it is a
design and not a result. Building it as a `scripts/live-verify/` harness —
negative evidence discipline included, so each check can actually go red — is
the next step, and the honest thing to tell him is that the membrane exists when
that harness passes.
