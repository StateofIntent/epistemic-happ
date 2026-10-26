# Erasure, and the content split

**Written 2026-10-26, the night 7.16 got the thing its row said it needed.**
Open-work 7.16 — *the deployment decision* — closed its own text with **"AND
BEFORE ANY PUBLIC POST OR FUNDING CONVERSATION THIS NEEDS AN HOUR OF ACTUAL
LEGAL ADVICE — not as a hedge."* Advice arrived the same day. This file records
what it said, what it changes, what it does **not** change, and the one claim in
it that was measured against the code rather than accepted.

**PROVENANCE, STATED FIRST BECAUSE IT BOUNDS EVERYTHING BELOW.** The advice came
from an informed non-lawyer and was given as *"informed guidance rather than
legal advice."* It is recorded here as received, with its own hedges intact —
*"as far as I know"*, *"treat this as a question to check, not a conclusion"* —
and it does **not** discharge 7.2's absent audit or replace counsel before a
funding conversation. What it does discharge is the thing 7.16 was actually
stuck on: whether the decision had to be taken **before** the invitation goes
out. It does not.

---

## 1. The exposure, as reported

**Australia — the Privacy Act probably does not reach this project.** The
small-business exemption still exists: most businesses and not-for-profits at or
under **$3 million** annual turnover sit outside the main regime, with
exceptions for health service providers, anyone trading in personal information,
CDR accreditation, voluntary opt-in, relation to a covered business, or
prescription by regulation. None applies to a free pilot. Blogs claiming the
exemption was abolished in 2026 are wrong as of mid-October; the OAIC has argued
for removing it and a reform round is being prepared, so this is a fact with a
shelf life rather than a settled one. **Check the OAIC's own guidance before
relying on it again.**

**One Australian exposure applies regardless of the exemption**: the statutory
tort for **serious invasions of privacy**, under which individuals can sue
directly. So the correct reading is not *"no Australian law applies"* — it is
*"the Privacy Act likely does not, and the thing that does is the one about
seriously exposing a person's private life."* That is the scenario the design
section below is actually for.

**EU — on paper yes, in practice near nil for now.** GDPR reaches outside the EU
where services are offered to people there or their behaviour is tracked there.
Enforcing that against an Australian individual with no EU presence, no EU
revenue and no EU users is very unlikely. **The variable is the cohort, not the
code**: 7.13 decides who is invited, and that decision is what moves this
number. Keeping the pilot out of the EU keeps it near zero.

**What the regulators prefer, where they have said it.** The EDPB's *Guidelines
02/2025* on blockchain, final this year, say in substance: the technology is no
excuse for non-compliance; keep personal data **off-chain** wherever possible
with only hashes or proofs on-chain; where it must go on-chain, prefer a proof
of existence checked against data held confidentially elsewhere over directly
identifying content; and do a **DPIA** first where processing is likely high
risk. **This DHT is not a blockchain and has the same problem in a stronger
form** — deletion is impossible for everyone, by construction, which is
Invariant 6 working as specified.

---

## 2. What this changes in 7.16, precisely

**HALF ONE — private informed group, or public deployment? The advice points
the same way the row already did**: stay a private informed group, keep the
pilot out of the EU, and treat going wide as the thing that forces the
architectural question. No change of direction, one new reason: the practical
enforcement gap is a property of **having no EU users**, so it is spent the
moment a public post recruits one.

**HALF TWO — should the default write path put personal data on an immutable
store at all? THE ANSWER IS STILL "NO, EVENTUALLY" AND NO LONGER "BEFORE THE
INVITATION."** The advice's first pass said *adopt the off-network content split
before the invitation goes out*; its second, after checking the OAIC position,
withdrew that: *"it's no longer a must-do before the invitation, but I'd still
note it as a design decision."* **That is the sentence that unblocks 7.4.** For
the pilot, telling invitees plainly that posts cannot be deleted is enough — and
`docs/the-invitation.md` §1 already does exactly that, in its own first
paragraph.

**AND THE REASONS TO BUILD IT ARE NOW NON-EUROPEAN, WHICH MAKES THEM BETTER
REASONS.** Two:

1. **The tort, not the Act.** If someone posts something genuinely harmful about
   another person, nothing can remove it from anywhere. That is the shape the
   Australian statutory tort covers, and it reaches a hobby project the Privacy
   Act does not.
2. **It is a better invitation.** *"Your words are yours to withdraw; only the
   proof stays"* is easier to invite someone into than *"nothing you post can
   ever be removed"* — which is the line §1 currently has to lead with.

---

## 3. The design, and why it is not a retreat from Invariant 6

**THE SPLIT THE ADVICE PROPOSES IS ONE THIS PROTOCOL ALREADY IMPLEMENTS ONCE.**
Invariant 6's operative reading — SPEC §5.22 — is that **no agent may erase
another's record of what was promised.** That is about the **record**: who
claimed what, in what order. It does not require the **content** to be
permanent. So:

- **On the shared network:** the hash, the signature, the order, the links.
  That is the permanent witness, and it is all the egg case, IP priority and
  challenge chains actually need.
- **Off the shared network:** the readable content, held by the author as a
  private entry served to readers. They can stop serving it.

**`SealedPrediction` IS THIS, BUILT FOR A DIFFERENT REASON.** It is the one
private entry type in the DNA, and `dna/integrity/src/lib.rs:798-810` already
writes down the full pattern *and* its cost: the hash is published in the Action
so the author cannot quietly change what they committed to, a bare hash *"leaves
the content nowhere"*, and **validation cannot see a private entry's content at
all** — hdi delivers `None` for the body and treats `Some(_)` as an error.
Generalising it is extending something built, not inventing something new, which
is also how it was described to Luck Light on 2026-10-26
(`docs/cases/luck-light-egg-reply-2.md:37`, *"publish only the hash and reveal
later"*).

### 3.1 Per-field mode, declared by the membrane

Not all-or-nothing, and not per-claim either — **per field**, with the mode a
membrane **required promise** rather than a protocol imposition:

- **Public and permanent:** lab results, certifications, deliveries, prices —
  anything commercial or evidential. Luck Light's egg membrane would require it.
- **Withdrawable:** personal statements, opinions, anything about a person's
  life. A general discussion space could default to it.

A certification then keeps *"batch 47: 410mg choline"* public and permanent
while the farmer's name and address stay withdrawable. **This is the shape that
keeps the property the project is actually for** — unrewritable commercial track
records — and adds an erasure path only where personal data lives. It is also
the familiar move: the community promises its own standard and the protocol does
not impose one.

### 3.2 Erasure by key destruction, with shares held by custodians

The stronger variant: content goes on the network **encrypted per claim**, and
erasure is **destroying the key** (crypto-shredding) rather than withholding the
content. The advantage over plain withholding is availability — content stays
replicated and does not go dark when the author is offline. Split the key with
**Shamir's secret sharing** (1979, mature libraries) among *k*-of-*n* membrane
custodians and no single person can erase or unlock anything alone, which turns
the immune system's *more than one person must agree* from a social rule into
one enforced by arithmetic.

**ANDRAS'S WORK ORGANISES THIS AND DOES NOT CAUSE IT.** His system is about
**ordering** — versions closed by someone other than the author — and deletion
is a different problem: no ordering scheme can make another machine forget.
What it buys is that *"claim X is erased as of version N"* becomes an ordered,
agreed event, so custodians destroying shares have a point everyone agrees on
and anything served after N is provably out of line. **That is 4.1's ordinal
anchor, needed for a second purpose** — and it is a reading to confirm with him
rather than assert, since it comes second-hand.

### 3.3 Salted fingerprints — ALREADY DONE, AND THIS IS THE ONE CLAIM MEASURED

The advice flagged this as the cheap thing to do today: a hash of short personal
data — a phone number, a postcode — is brute-forceable, so every fingerprint
needs a per-item random salt or *"only the fingerprint stays"* quietly leaks the
data.

**Measured against the code: the only path here where a hash stands in for
withheld content already requires one.** `seal_prediction` rejects an empty salt
outright (`dna/coordinator/src/lib.rs:7249`) with that exact rationale in the
error string — *"without it a guessable prediction is recoverable from its
hash"* — the caller supplies the salt so it is in their hands at reveal time
(`:7240`), and the integrity zome states the reason at the type
(`dna/integrity/src/lib.rs:803`). **So there is nothing to add today.** What
there is instead is **a rule any withdrawable-content path inherits**: a
fingerprint of withheld content is unsalted only over somebody's dead body, and
`SealedPrediction` is the precedent to copy rather than the exception.

### 3.4 Zero-knowledge proofs — note, do not build

Validators checking that a hidden lab result exceeds a standard without seeing
it. Powerful, heavy, and a far horizon. Recorded so it is not re-derived.

---

## 4. The cost, inventoried rather than estimated

**WHAT IT COSTS NOTHING.** Authorship and signatures; order, and therefore IP
priority and pre-registered forecasts, which are hash-based already; the whole
graph — who critiqued what, critique mode, target types, citation chains,
grounding paths; decay and reinforcement; attestation and trust lists; two-sided
settlement. All of that is metadata rather than personal content, and fields
like `domain`, critique mode and confidence can stay public.

**WHAT IT COSTS, item 1: validators stop being able to inspect text — and the
whole bill in the integrity zome is FOUR RULES.** Counted, not guessed:

| rule | where | what it checks |
|---|---|---|
| `validate_claim` | `dna/integrity/src/lib.rs:1331` | `claim.content` non-empty |
| `validate_mew` | `dna/integrity/src/lib.rs:1309` | content ≤ 560 chars |
| `validate_settlement_policy` | `dna/integrity/src/lib.rs:1513`, `:1516` | `name` and `statement` non-empty |
| `validate_worldline_trace` | `dna/integrity/src/lib.rs:2119` | `trace_payload` ≤ 64KB |

Nothing else in either zome inspects the text of anything. `SettlementPolicy`
and `WorldlineTrace` are not personal content and would not move; the real loss
is **one rule on `Claim` and one on `Mew`**, both shape rules rather than
judgements, both of which move to the author's side or are dropped. **And the
loss has a name here already**: §5.22's family of goals that cannot be expressed
as a deterministic rule over data validation can reach — joined by `salt` and
`prediction` for exactly this reason (SPEC.md:590). This is the fourth member,
not a new kind of problem.

**ITEM 2: content can go dark.** A withdrawn or offline claim leaves a readable
fingerprint with nothing behind it, and a critique of it loses its context. The
encrypted variant (§3.2) is the answer to the *offline* half and not to the
*withdrawn* half, which is the point.

**ITEM 3: search and export get patchier.** Full-text search, the N4L export
(§9) and the SSTorytime graph all need the text, so they work on what a reader
can still fetch or has cached.

**ITEM 4 — AND THIS IS THE ONE THAT ACTUALLY STINGS: it cuts against something
this project told a named person.** `docs/cases/luck-light-egg.md:390` says a
track record with the bad quarters removed is not a track record. If a seller
can withdraw *"410mg choline"* after a retest says 361mg, the challenge stays
and the number disappears. That is still a signal — *challenged, then
withdrawn* — and it is a weaker one. **Two things bound the damage.** First,
§3.1 is exactly the answer: the egg membrane **requires** commercial claims to
be public and permanent, so the case that raised the objection is the case the
mode does not apply to. Second, withdrawal removes content from the network and
not from memory: anyone who kept a copy can still prove what was said, because
it has to match the fingerprint.

---

## 5. The honest limits

- **Nothing erases what someone already copied or read.** Ever. Both variants.
- **Encryption-as-erasure is legally debated.** Regulators accept encryption as
  a *mitigation*; whether destroying a key counts as erasure is unsettled. So
  this buys a defensible answer, not a guaranteed one.
- **It is real complexity for a four-person pilot**, which is why it is filed
  rather than built.
- **The advice itself is not counsel** (§0), and the OAIC exemption it leans on
  is under active reform pressure.

---

## 6. What is done now, and what is filed

**NOW, AND IT NEEDS NO CODE.** Three things, all at the invitation layer:

1. **A joining promise:** users are responsible for their own content, accept
   that posts are permanent, and will not post personal information about
   anyone else. As a membrane **required promise** it is signed, ordered and
   undisputable, which also answers 7.16's point (3) as far as it can be
   answered — consent does not discharge an erasure obligation, but informed
   consent is the difference between a disclosed design property and a surprise.
2. **A complaints channel.** Even with no deletion there is a response, and
   **the mechanisms exist**: a `Retraction` by the author, an `AntibodyPattern`
   by anyone — SPEC §7's additive remedies — plus removal from a reader's own
   trust list and root set (3.7's `require_attestation_from`). What is missing
   is not machinery but a **stated** channel and the promise to act on it. The
   defamation-reform point behind this is worth checking rather than relying on:
   intermediary protections generally assume a complaints process and some act
   capable of being taken, and *"nothing can be removed"* sits badly with that.
   **Jurisdiction-specific and unresolved — SA in particular.**
3. **A one-page impact assessment**, written in-house: what data, why, the
   risks, the mitigations. Free, and it is the artifact that demonstrates good
   faith if anyone ever asks.

**FILED, NOT BUILT.** The per-field mode and erasure-by-key-destruction are
**integrity-level** changes — new fields and plausibly a new entry type — so
they fork the network and belong with §4's bump candidates rather than before
the invitation. See open-work **4.6**.

**AND ONE THING NOT TO BUILD, NOW CONFIRMED FROM OUTSIDE.** The advice's last
pre-invitation item was *don't build the identity-verification layer: permanent
records that a named person is a verified unique human are the worst case under
these rules.* Open-work **3.7** reached the same verdict independently, from the
invariants rather than the regulations — candidate (4), hardware attestation and
biometrics, *"a personhood record is permanent under Invariant 6 with no erasure
path, which is the most sensitive data category imaginable to put somewhere
nothing can be removed from."* **Two different arguments, one conclusion, and
neither needed the other.**

---

## 7. The framing this hands the project, which may be the larger result

Once there is no central authority, cryptography is the only tool left for
enforcing anything: rules that would rest on a trusted administrator have to
rest on arithmetic. That is the cypherpunk tradition — Chaum's blind signatures,
Hughes's 1993 manifesto arguing privacy in an open society must be **built** by
people writing code rather than granted by institutions, Szabo and Dai on
digital money and contracts, and Shamir's 1979 secret sharing, which is §3.2's
key split. Bitcoin and, indirectly, Holochain descend from it.

**Two discipline rules come with the lineage.**

- **Cryptography is not obfuscation.** Everything above rests on proven
  hardness and stays safe when the design is fully public. If the design ever
  depends on an attacker not understanding it, that is a defect, not a feature.
- **Do not invent your own crypto.** Standard encryption, salted hashes, Shamir
  shares, combined carefully. Most real failures come from home-made schemes
  and small implementation mistakes rather than from the mathematics.

**And the position it lands on is one sentence: privacy for individuals,
transparency for power.**

| transparent and permanent | private and withdrawable |
|---|---|
| commercial claims, certifications, deliveries, prices | personal content about people's lives |
| who vouched for whom | |

That is not a compromise between two values — it is one coherent position, and
it is a better answer to *"what is your project?"* than the biology metaphors,
because people already understand it. **Noted here rather than edited into
`README`:** the metaphors are load-bearing in SPEC and README §9 and that is a
separate, larger edit than this file should make on its own.
