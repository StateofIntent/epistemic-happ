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
- **The forecasting deadline is unhardened** (§4). The version gap that stood
  here is closed: `v0.3.0` (2026-10-24) carries `protocol_version: 11`, the
  same as this repository, so **a trial today runs against the documented
  protocol** — but it must be run on `v0.3.0`, since `v0.2.0` is a separate
  DHT two forks behind and auto-update does not cross a minor bump.

---

## 7. The smallest thing worth actually running

One membrane, three agents, no currency:

1. `publish_constitution` for each of producer, tester, buyer — `Promise {
   action, domain, modality }` each, which is where *voluntary verified
   non-binding* becomes machine-readable rather than aspirational.
2. `create_membrane { domain: "SuperiorEgg", required_promises, constitution }`,
   then `join_membrane`. **NOT `grant_attestation` — corrected 2026-10-24 by
   building this.** `ATTESTATION_GRANT_MIN_TENURE_SECS_VALIDATION` is 30 days,
   so a membrane minutes old cannot grant an attestation at all; the harness
   asserts the refusal instead. That is the more flattering result rather than
   a gap: attestation here cannot be minted on day one, which is the property
   a franchise actually wants from it.
3. Producer certifies a flock (§2); tester retests as an `Evidential` critique.
4. Producer pre-registers a capacity forecast; reveals at period end (§4).
5. One redemption settled 2-of-2 with `max_dissent: 0` (§3).
6. Buyer calls `get_standing` **twice** — once with `None`, once with a tight
   `max_causal_distance` — and sees the same flock with and without standing.

Step 6 is the demonstration, and it is the one that would land, because it shows
the franchise standard living in the reader instead of in the protocol.

**Status: BUILT AND PASSING, 2026-10-24.**
`scripts/live-verify/superior-egg.mjs`, 33 checks, green against a real
three-agent sandbox conductor. The condition this section set for itself —
*"the membrane exists when that harness passes"* — is met, so the sequence
above is a result and no longer a design.

**What the build changed in this document.** Step 2's `grant_attestation`, as
above. Nothing else: every payload was accurate, which is the part that had
been verified against the source already. The temporal validation rule was not,
because reading a struct does not tell you a membrane must be a month old.

**Two flocks, not one, and the reason is the discipline.** This section
describes one certification read twice. A one-flock fixture cannot distinguish
*the tight read dropped the stale flock* from *the tight read drops
everything* — both look identical from a single row. So the harness buries
flock 14 under critique-of-critique (engagement distance 3) and leaves flock 7
engaged on the frontier (distance 0), and the tight read must drop one and keep
the other. Verified sensitive by injection: with the slack threshold in place
of the tight one, the demonstration goes red — 2 failures, exit 1.

**And the injection caught the harness narrating success underneath its own
red checks**, which is §7b.1's failure mode performed by a test. That line is
now conditional on there being no failures.

---

## 8. Excluding a violator: you can stop counting them, not remove them

**His ask, 2026-10-24:** *"preventing someone who entered my network and clearly
went against the collective intent … they would be excluded and not be able to
recertify themselves because of my judgement of their actions."*

**Verified against the source rather than assumed: there is no revocation path
at all.** No `leave_membrane`, no `revoke_*` of any kind in the coordinator, and
no delete op accepted anywhere (§5.1, Invariant 6). Membership is an
`AgentToMembrane` link and nothing unmakes it.

**What does exist is exactly his "my judgement", and it is caller-scoped.**
`is_agent_attested(IsAgentAttestedPayload { candidate, membrane, policy })` takes
an `AttestationPolicy` whose `require_attestation_from` is **a trusted root set
supplied by the caller**. So a reader who passes his key as the root set sees an
agent he has not vouched for as unattested; `None` means no restriction and
everyone counts. This is the same shape as 3.1's answer — the reader promises the
policy — which is now the third place that shape has turned up unprompted.

**So the honest answer is narrower than the ask, in one specific way.** He cannot
stop a violator *writing* a certification: the integrity zome is the only trust
boundary and a modified coordinator stays on the network (§7.1's open position).
What he can do is ensure it counts for nobody reading through his policy. **The
exclusion is in the reading, not in the record** — and that must be said plainly,
because a design that assumes removal will be wrong at the moment it is relied
on.

**And `AntibodyPattern` fits his imposter case by name.** Its kinds are
`SpamFlood`, `SybilCluster`, `Plagiarism`, `CoordinatedManipulation` and
**`Impersonation` — "content misrepresenting its own provenance or authorship"**.
Published by anyone, signed, additive: it attaches to the claim permanently and
leaves it readable with the objection on it.

---

## 9. He brought his own notary, which closes the gap §5 left open

**His plan:** *"I always planned to have the events proofed to have occurred by
referencing the transactions on the public crypto ledger hashes."*

§5 told him a date needs a notary — a named agent who promises it and can be
blamed for it — and that this is item 4.1, blocked on three questions with
Andras. **He had already chosen a notary, before the problem was put to him.** A
public chain is a promiser whose timestamps are backed by its own consensus and
whose failure is attributable.

**The precise caveat, which does not weaken it.** Validation cannot reach that
chain any more than it can reach a clock (§5.22), so the transaction hash lives
as `Evidence` on the claim and a **reader** verifies it out of band. The
composition is: ordinal order from `order_records`, date from the ledger, and the
join performed by whoever cares. **4.1 is therefore not on his critical path** —
an in-protocol ordinal anchor is one way to get a promiser, and he has supplied
another.

---

## 10. The 72-hour deadline, and why his own answer rescues it

**His plan:** a 72-hour expiry mirroring contract-law deal validation; partial
fulfilment updating the outstanding amount; fulfilment before the deadline
closing the request as fulfilled.

**Not enforceable here, structurally.** §5.22: validation cannot read a clock.
`get_foresight_record` already has exactly this shape and is honest about it — it
classifies `expired` by calling `sys_time()` **at read time in the coordinator**,
so a deadline is a reader's judgement and a late reveal is socially visible
rather than protocol-prevented.

**But §9's ledger converts it.** A deadline expressed against a block height
rather than a wall clock makes *"was this fulfilled in time"* a question about the
ledger, answerable by anyone. His two plans fix each other, which neither side of
this exchange predicted.

**One design consequence to state before he builds on it.** *"The requested
amount would update"* cannot be a mutable field — nothing is editable. It becomes
a sequence of signed partial deliveries with the outstanding amount **derived** by
the reader. `get_settlement_statuses_for` returns **all** statuses including ones
that disagree, because picking a winner would be the deletion Invariant 6 forbids,
performed by a reader instead of a writer (SPEC §10's own note). So there is no
single number to read; there is a reproducible derivation, which is the trade.

---

## 11. What a challengeable claim is, in a bazaar

**His question:** *"Could you give an example of what a challengeable claim might
look like in an open bazaar setting?"*

**A challengeable claim is one that says what would make it wrong.** That is the
whole content of the idea, and it is §7b.1's *grounded or silent* discipline
pointed at a market.

| | |
|---|---|
| **Not challengeable** | *"Our eggs are superior."* Nothing could contradict it |
| **Challengeable** | *"Flock 14 measured 410mg choline per egg on 1 October; lab panel attached"* |

Three challenge shapes, all shipped, and `superior-egg.mjs` drives the first:

1. **The evidence does not say that** — `Critique { critique_mode: Evidential }`,
   a retest measuring 361mg. Retesting is not a separate subsystem; it is the
   ordinary objection path aimed at a certification.
2. **The method was wrong** — `Critique { critique_mode: Methodological }`. The
   measurement is not disputed, its meaning is.
3. **The provenance is false** — `AntibodyPattern { kind: Impersonation }`.

None deletes or edits the claim; each attaches permanently and signed. The
seller's remedy is additive too: `create_retraction` with `replacement_claim`
pointing at the corrected figure, the superseded number staying visible —
uncomfortable, and correct, because a track record with the bad quarters removed
is not a track record.

**The load-bearing point, and the one worth sending him.** What makes a market
contestable is not adjudication — Invariant 10 forbids it and the protocol cannot
do it. It is the requirement that a claim name what it rests on, **so that a
challenge has somewhere to land**. A market of unfalsifiable boasts is not
contestable whatever software it runs on.

**And his own formulation is better than anything in this document:** *"The
author is the first witness."* That is §5.22's position exactly — authorship and
order are strong, priority against the outside world is not.

---

## 12. The big freeze — his sharpest question, and the one I answer worst

**He closed the loop on §9–§11 and then asked the best technical question
anybody has asked of this project:** *"How do you remedy the increasing data
load of immutable sequencing? This seems an ongoing challenge for blockchains
to solve for, how to avoid the big freeze, when the data becomes too large to
efficiently reference at all."*

**It deserves recording because the honest answer is that this is not solved,
and because the measurement showing it is not solved already exists in this
repository** — filed as a scale result rather than as a limitation, which is
how it went unnoticed as one.

### 12.1 One sharpening of his summary

His formulation: *"an immutable stack of events with additional states
maintaining a continuous sequence of before and after but not when"* — correct,
and better compressed than §5.22 manages.

But he then called the result an *"unchallengeable claim"*, and that inverts the
property. **Challengeability is the feature.** A claim stays contestable for
ever; what cannot be rearranged afterwards is the **order**. The protection is
not *nobody can object*, it is *nobody can object retroactively about what came
first* — and §11's point stands, that a claim nobody can test is the weak link
whatever ledger it sits on.

### 12.2 The structural answer exists upstream and is OFF in this build

Holochain's answer to unbounded growth is **sharding**: each agent holds an
*arc* of the DHT rather than all of it, so total storage grows with the network
while per-agent storage does not. That is the real difference from a blockchain,
where every full node holds everything for ever.

**Measured 2026-10-23 at 48 members: 48 of 48 storage arcs still FULL.**
`kitsune2_gossip`'s narrowing path sits behind a `sharding` cargo feature that
is not enabled, so **there is no N at which an arc narrows in this build**.
Every node holds everything.

So on storage this project currently has **blockchain economics, not DHT
economics.** README files that measurement under *scale beyond twelve* as a
feature-flag question rather than a scale question — which is accurate, and is
also the reason it does not read as the growth limitation it is. It is tractable
rather than handled, and the difference is worth stating to anybody asking this
question seriously.

### 12.3 What does hold, and it is narrower than solving it

- **Weight decays even though bytes do not.** Conductance decays at READ time:
  `get_effective_conductance` recomputes when asked and writes nothing, so the
  DHT is byte-identical before and after a link has decayed to nothing. Standing
  atrophies over causal distance the same way (`get_standing`). **Decay is a
  property of the reading, not of the record** — which is the same move §5.22
  makes for time and §8 makes for exclusion, and is the third instance of it in
  this document.
- **Reads are bounded rather than exhaustive, by construction and on purpose.**
  `MAX_NEIGHBORHOOD_CRITIQUES` 512, `MAX_RESONANCE_QUERY_PERIODS` 4096,
  `MAX_ATTESTATION_SEARCH_NODES` 100 — documented as heuristic rather than
  complete. A read that must touch everything stops working at scale; a bounded
  read that says it is bounded does not.
- **And the uncomfortable one: the integrity forks are functioning as garbage
  collection.** Each incompatible version is a separate network that never
  gossips with the previous one, two have happened and a third is planned, and
  SPEC's ratchet means hashes cannot cross that boundary — so history resets at
  every fork. **That is a side effect and not a design**, and it is the actual
  reason accumulated data has not become a problem yet. Recorded here rather
  than presented to him as a feature.

### 12.4 The deepest version of his question is Invariant 9

**He has independently arrived at the invariant this project cannot satisfy.**
Invariant 9 — *death is required; unused entry types and membranes must
atrophy* — is the only one on the list with no mechanism behind it, and since
item 22 it is **unsatisfied by decision rather than by omission**: anything a
scheduled process wrote in order to clean up would itself be permanent under
Invariant 6, so the consequence was declined.

The framing given to him is the one `docs/open-work.md` already settled on:
**a system that cannot delete cannot heal, only accrete and lose standing —
coral reef rather than cell**, durable accretion with living tissue on the
surface. The old structure stays and stops being load-bearing. That is honest
about what it is, and it is a different promise from self-repair.

### 12.5 His framing of the purpose is better than this repository's

Two things he wrote that are worth keeping verbatim:

**On IP:** *"The best way to protect IP is to have a trail of verifiable
evidence that would be unchallengable. The best way to refute a challenge is
before it begins."* That is what a commitment chain actually buys — not proof of
novelty, which nothing can supply, but proof of **order**, which nobody can
rearrange later. §5's hash-then-reveal is the mechanism and he validated it
independently.

**On purpose:** *"Responsibility for ones actions is the sequence I have
interest in tracking so that liability can be proven at scale without
centralized authority enforcing consequence."* **That is a better statement of
what this protocol is for than anything currently in `README.md`** — those
affected are the only ones who can challenge, and the protocol's whole job is
to ensure their challenge has something to grip and cannot be tidied away.

### 12.6 He offered to design simulations, and it was accepted

He offered: *"If you have any need for designing simulations to test the
capabilities of what you have built I may be able to assist as I have done
extensive pondering on variables to arrive at how my systems can achieve the
greatest probabilities of intended results."*

**Taken, and pointed at three specific open questions** — all of which are
population-and-adversary questions rather than engineering ones, which is
exactly what three conductors on one laptop cannot answer:

| | question | row |
|---|---|---|
| 1 | What makes identity cost enough without creating a centre — current answer is that a reader names whose vouches they trust and nothing is verified globally; unknown how it behaves against a coordinated minority | **3.7** |
| 2 | Whether ten observers are actually ten, or one model in different hats — the defence is dispositions published as promises beforehand and checkable against behaviour | **3.5** |
| 3 | Whether a derived measure can exist that does not classify a divergent minority as dead on sight | **3.2** |

**And he named the sequencing problem himself:** *"I feel my systems would have
to have launched before enough data would be available to harden your happ in
the wild."* That is right, and it does not block the useful half —
**simulation is how those three get probed before either party has a
population**, which is the one thing his offer is better positioned for than
anything in this repository.
