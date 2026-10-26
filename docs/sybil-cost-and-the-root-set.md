# Sybil cost and the root set — open-work 3.7

> ## STATUS: RESEARCH. THE HEADLINE IS A CORRECTION, NOT A PROPOSAL.
>
> Open-work 3.7 asks: *what is the cheapest promise structure that makes
> sybil cost high enough, without creating a centre?* It costed four
> candidate scarce resources and named candidate (1) — attestation
> capacity, already built — as "the best fit", on the grounds that
> `AttestationGrant`'s 30-day tenure bar and 5-per-week budget mean
> **"a thousand minted keys buy nothing."**
>
> **Measured against the code on 2026-10-25, that is false.** A thousand
> minted keys buy a thousand attesters, and the tenure bar never fires,
> because `direct_attesters_of` **unions** the tenure-gated source with a
> second source that is free, global, and unscoped by membrane.
>
> The row's own method is why this was worth checking: it opens by
> recording that *"charging requires balances, and balances break
> Invariant 1"* was asserted a day earlier and is false, and that the
> error "would have foreclosed candidate (2) entirely." This is the same
> shape, one layer down — an argument about cost resting on a mechanism
> nobody had read end to end.
>
> **What survives is better than what it replaces.** The scarce resource
> is real, it is already built, and 7.12 already ships it. It is not
> attestation capacity. It is **a reader's named root set**.

---

## 1. The wall, and why the answer keeps taking the same shape

3.7 states the frame and it is correct, so it is restated here only to be
built on. **The question is not how the protocol learns who is a person.**
That is unanswerable by construction: deterministic replicated validation
can only see the data handed to it, because every machine must reach the
same verdict forever. That is constitutive, not a Holochain defect.

It is **one wall, met four times**:

| met at | validation cannot reach | the protocol's answer |
|---|---|---|
| §5.22 | a clock | a named agent's timestamp, published and arguable |
| 4.1 / Luck Light | a chain | a declared notary, named in the DHT |
| 3.5 / 3.7 | personhood or distinctness | — *this document* |
| 7.12 | who a reader trusts | a policy the caller passes, defaulting to `None` |

Each time, the answer is the same move: **take the outside-world fact,
put it in a named agent's promise, and let the reader decide whether to
trust that agent.** Nothing is computed about a person; something is
*published by* a person and weighed by a reader.

This document argues that the sybil answer is already that move, already
built, and currently **described wrongly in three places** — which is why
it reads as weaker than it is in one respect and much stronger than it is
in another.

---

## 2. What `direct_attesters_of` actually does

`dna/coordinator/src/lib.rs`, `direct_attesters_of(agent, membrane)`
returns every agent who has attested `agent`, by **unioning two sources**:

**Source 1 — SynapticLink-derived.** For each of the agent's claims, every
`SynapticLink` on that claim counts, and **the link's author is the
attester**. The code's own comment: *"free, global, unscoped by membrane
(a SynapticLink is created wherever a critique happens, with no membrane
context anywhere in that schema)."*

**Source 2 — AttestationGrant-derived.** `AttestationGrant` links from the
membrane, gated at creation by
`ATTESTATION_GRANT_MIN_TENURE_SECS_VALIDATION = 30 * 24 * 3600` and
`ATTESTATION_GRANT_MAX_PER_WINDOW_VALIDATION = 5` per 7-day window,
and scoped to the membrane.

**The union is the whole finding.** Source 2 is the expensive one. Source 1
is free. A set union costs what its cheapest member costs.

### 2.1 The arithmetic candidate (1) got wrong

To make agent X appear attested by K distinct attesters:

1. Mint K keys. Key generation is **not a DHT op** — nothing validates it,
   nothing rate-limits it, it costs a keypair.
2. Have each key create one critique of one of X's claims.
   `create_critique` gates on `check_critique_friction()` and **nothing
   else** — no membership, no tenure, no attestation. The friction cap is
   20 per rolling hour **per agent**, so K agents have K × 20.
3. Each critique creates a `SynapticLink` whose author is the minted key.
4. `direct_attesters_of(X)` now returns K attesters.

The 30-day tenure bar is never consulted, because it guards Source 2 and
this attack never touches Source 2.

**The repository already knew the premise and had not drawn the
conclusion.** Open-work 7.12 records, as an incidental note about test
setup: *"The harness had to find its own way to an attested agent, since
`grant_attestation` needs 30 days of tenure — a critique's `SynapticLink`
attests its target's author, globally and free."* The harness took the
cheap path **because the expensive one was unreachable**. That is the
attack, performed in CI, described as a convenience.

---

## 3. Three defects found while costing it

These are stated separately from the research because each is checkable
and two are fixable without a fork.

### 3.1 `min_attestations` is not enforced when `require_attestation_from` is `None`

```rust
pub fn is_agent_attested(payload: IsAgentAttestedPayload) -> ExternResult<bool> {
    let Some(ref roots) = payload.policy.require_attestation_from else {
        return Ok(true);
    };
```

With no root set, **every agent is attested** and `min_attestations` is
never read. Three sources disagree about this:

| source | says |
|---|---|
| the code | returns `true` unconditionally; no filtering |
| `require_attestation_from`'s doc comment | *"this still requires `min_attestations` distinct attesters, just from anyone"* |
| `describe_method` | renders `"attestation lens: N distinct attester(s) required, …, roots unrestricted"` |

So a caller who passes `{ require_attestation_from: None, min_attestations: 5 }`
gets **no filtering at all**, and the read **publishes a method string
saying five attesters were required**. Both `get_membrane_claims`'s
`filtered_unattested` counter and `get_discourse_health` are affected;
`describe_method` is rendered into two published reads (lines 5467, 8487).

**This is the §7b.1 discipline inverted.** 7.12 was careful that a read
returning three of a hundred must say so, because *"a read returning three
of a hundred and saying only 'three' is indistinguishable from a domain
holding three."* Here the read returns **all** of a hundred and says it
applied a lens.

**The honest fix is not obvious, and that is the point.** Enforcing
`min_attestations` over unrestricted roots would be *implementable*
(`attesters.len() >= min_attestations`) and **still worthless as a sybil
defence**, for the reason in §2.1 — it counts a quantity that costs
nothing. So returning `true` may be the behaviour a careful author would
choose. What cannot stand is the doc and the method string claiming a
filter that is not applied. **Decide which one is the lie, then make the
other two agree with it** — recorded as open-work 1.12.

### 3.2 Attestation is created by criticism

In Source 1, the attester is *the author of a `SynapticLink`*, and
`create_critique` is the only thing that makes one. So **critiquing
someone's claim attests its author.** Disagreeing with somebody and
vouching for them are, at this layer, the same act.

This is defensible as "engaged with" and indefensible as "vouches for",
and the field is named `direct_attesters_of`. It also means the cheapest
way to accumulate attestation is to attract criticism.

### 3.3 One root-member critique promotes a sybil to a valid attester

`count_attestations_pure` counts an attester if it is in `roots`, **or**,
when `max_depth > 0`, if that attester is itself transitively attested by
`roots`. Combined with §3.2: if any root-set member critiques a sybil's
claim, the sybil acquires a root-set attester, and therefore counts as a
valid attester for everyone else — at depth ≥ 2, for arbitrarily many
candidates.

So the amplification step is *a trusted person publicly disagreeing with a
sybil*, which is the single most likely interaction between them. The
bound that saves this from being unlimited is
`MAX_ATTESTATION_SEARCH_NODES = 100` and the depth parameter, not anything
about cost.

---

## 4. What actually costs something

Strike "attestation capacity" and the answer that remains is the one the
other three walls already gave.

**The scarce resource is a reader's named root set** —
`require_attestation_from`. It is scarce for a reason no rate limit
supplies: **a minted key cannot put itself into somebody else's root
set.** There is no transaction that adds you to it. It is a list a reader
writes, and the only way in is for that reader to decide.

Against the invariants, which is where candidate (1) was being judged:

- **Invariant 1 (no canonical comparative measure):** safe, and 7.12
  already demonstrated how. The lens is opt-in, `None` by default, and
  README §4.4's rule is that a lens is one *"the user aims and can see,
  never one that aims itself."* A root set is a reader's declared
  position, not a protocol verdict. Two readers with different root sets
  get different answers and **both are correct**, which is the same
  property settlement has with different input sets.
- **Invariant 6 (nothing is deleted):** safe — the root set is a
  *parameter of a read*, not an entry. Nothing is written, so nothing is
  permanent. This is the sharpest advantage over candidate (4): a
  personhood record is permanent with no erasure path, and a root set is
  a value passed to a function.
- **No centre:** safe, and this is the load-bearing claim. There is no
  global root set, no registry of real people, no quorum. Each reader
  names their own. The protocol never learns who is a person; it learns
  nothing at all.
- **Cost to the honest participant:** zero. No money, no stake, no proof
  of work, no hardware. An honest newcomer is unattested by a stranger's
  lens and fully visible in the default unfiltered read, which is what
  `None` guarantees.

**What it does not do, stated plainly:** it does not make sybils
expensive. It makes them *irrelevant to a reader who has named roots*, and
leaves them fully effective against every reader who has not. That is a
weaker promise than "sybil cost is high" and it is the true one. It is
also the only promise available at this wall, for the same reason the
other three walls ended where they did.

---

## 5. The three costumes, unified

3.5 asked whether ten observers might be one actor. 3.7 asked what makes
sybils expensive. 7.12 asked why an index lookup returns a flood while a
traversal degrades gracefully. **They are one question:** *the protocol
cannot verify that two identities are two people, so what replaces that?*

The unified answer: **nothing verifies distinctness; a reader names who
they trust, and everything else is derived from that.**

That resolves 3.5 without new machinery. 3.5's own "accidental defence" is
that dispositions are **mechanical** — a threshold and a mode preference
published as a `Constitution` promise *before* the agent acts, so
divergence from a declared threshold is caught by comparison rather than
by anybody's say-so. That is the same structure: a published promise,
checkable against later behaviour, by a reader. **Ten observers differ
verifiably not because the protocol counted ten people, but because each
published a threshold it can be held to.** 3.5's fear of
observers-as-entries is then precisely right and now has a reason that
generalises: a prompt is not a promise a reader can check, so replacing
thresholds with prompts would discard the only defence in the family.

**One correction to 3.5's framing.** It says the problem is "one problem
wearing two costumes" and 3.7 says three. It is three, and 7.12 is the
only one of them that is *built* — which makes it the evidence, not the
leftover.

---

## 6. The other three candidates, re-costed

- **(2) Sequential work (PoW/VDF).** 3.7's rescue of this candidate stands
  — a one-shot proof is not a running balance, so Invariant 1 is untouched
  and the earlier objection was wrong. The objection that survives is
  SPEC §398: founding has no fee, stake or token, and this is *costly*
  rather than *accountable*. **It is also now redundant for the stated
  purpose**: it would gate membrane join via `AgentToMembrane`, while the
  demonstrated attack needs no membrane at all (§2.1, Source 1 is
  unscoped). A gate on joining does not bound a free global attestation
  source. **Re-costing it requires fixing §3 first** — it is being
  evaluated against a threat model the code does not currently have.
  A **VDF** remains interesting for 4.1's notary gap, which is a different
  problem and should not be bundled.
- **(3) Social-graph topology.** Not a separate candidate. It *is* the root
  set plus `max_attestation_depth`, and §3.3 is its cost: depth is an
  amplifier, not a defence. Recommend depth default stays at 1.
- **(4) Hardware attestation / biometrics / state ID.** 3.7's verdict
  stands and §4 strengthens it: these are oracles in costume, a default
  breaks Invariant 1 (SPEC §7's first Invariant 1 note), and a personhood record is permanent
  under Invariant 6. The root set obtains the useful half — a reader
  deciding who counts — while writing nothing.

---

## 7. What this changes, and what stays a decision

**Bounded and clear (`[M]`), opened as rows:**

- **1.12** — the three-way disagreement in §3.1. Decide which of the three
  is the lie; make the other two agree. Coordinator-only either way: no
  entry type, no link type, no validation rule, **no DNA hash change**.
- **1.13** — `direct_attesters_of`'s two sources are documented
  individually and nowhere together, and the union is the security
  property. Say in one place that the union costs what its cheapest member
  costs, and correct 3.7's "a thousand minted keys buy nothing".
- **1.14** — `SECURITY.md` should state the free-identity position as §4
  states it: not *sybils are expensive* but *a reader who names roots is
  unaffected and a reader who does not is unprotected*. 7.1's commitment
  is to vouch for honesty, and this is currently the gap between what the
  documents imply and what the code does.

**Stays `[D]` — not for the model to take:**

- Whether `min_attestations` over unrestricted roots should filter at all
  (§3.1). The recommendation is **no** — it counts something free — with
  the doc and `describe_method` corrected to say so.
- Whether to pursue candidate (2) once §3 is fixed.
- Whether a default root set is ever offered in a client. The
  recommendation is **no**, on README §4.4: a lens that aims itself is the
  canonical signal Invariant 1 rules out.

**Not urgent for the ten invitees, and 7.1 already said why.** A
free-identity flood is an adversary model; an invited cohort is not one.
§3.1 matters sooner than the rest, because it is the one place the
documents currently promise a protection that is not applied.
