# Security

## Reporting a vulnerability

Use **[GitHub Security Advisories](../../security/advisories/new)** — private to
the maintainers until published. Please do not open a public issue for anything
exploitable.

**No response time is promised.** This is a small project with no security team,
and a policy that committed to an SLA it cannot keep would be worse than one
that does not. What is promised instead: a report will be read, and the outcome
— fixed, decided against, or a known limitation already recorded — will be
stated plainly rather than left open.

## What is already known, and is not a vulnerability

This section exists so a reporter does not spend time on a position the project
has taken deliberately. All of it is documented at length in `README.md` §9 and
`SPEC.md`; a report that one of these is exploitable is useful only if it shows
the *consequence* is worse than recorded.

**Nothing in the protocol resists sybil creation.** Identity is free: anyone can
generate any number of agent keys. Containment is **topological**, not
preventive — claims become unreachable by traversal rather than refused. The
honest limit, stated in README §2.3: *containment holds for what you traverse
to, and nothing for what you look up.* A sybil flood pollutes
`get_claims_by_domain` in full. This is a design position, taken consciously,
and the right shape of a fix was understood to be a read-layer lens rather than
friction on the generative act.

**That lens now exists, and what it protects is narrower than "sybils are
expensive".** `get_membrane_claims` (2026-10-25) takes an optional
`AttestationPolicy` and counts its own drops; `get_discourse_health` takes the
same. Stated precisely, because the difference matters to anyone relying on it:

> **A reader who names a root set is unaffected by a sybil flood. A reader who
> does not is unprotected.** Nothing in between, and nothing automatic.

The lens is opt-in and defaults to `None`, which is the unfiltered read exactly
— deliberately, since a filter applied by default would be the canonical
comparative signal Invariant #1 rules out (README §4.4: a lens is one *the user
aims and can see, never one that aims itself*). So the protection is real and it
is **entirely contingent on a reader having named roots.**

**Sybil creation is not made expensive by any of this, and two mechanisms that
look like they do are weaker than they appear.** `AttestationGrant` carries a
thirty-day tenure bar and a five-per-week budget, but `direct_attesters_of`
**unions** that source with a free one — a `SynapticLink` attests its target's
author, and critique creation gates on a per-agent rate limit alone — and a set
union costs what its cheapest member costs. K minted keys critiquing an agent's
claims make it appear attested by K distinct attesters without the tenure bar
ever being consulted. Separately, `min_attestations` with
`require_attestation_from: None` filters **nothing** (`is_agent_attested`
returns `true`; the lens reports itself as `INERT`), because the quantity it
would count is the free one. **The root set is load-bearing precisely because
it is the only input a minted key cannot obtain for itself** — there is no
transaction that adds you to somebody else's. Full reasoning in
`docs/sybil-cost-and-the-root-set.md`; corrected here 2026-10-25/26 after
open-work 3.7 found the opposite claim on the record.

**A modified coordinator zome stays on the network.** Coordinator zomes are not
part of the DNA hash and are hot-swappable (`SPEC.md` §11.1). So the integrity
zome is the only trust boundary, and any claim of the form "a custom client can
do X" is only a vulnerability if the *integrity* zome permits X. The coordinator's
friendly pre-checks are courtesies and are documented as such.

**Nothing is ever deleted, and entry updates are refused.** As of
`protocol_version: 9` there is no deletion path for entries or links and no
mutation path for app entries — not for an author, an operator, or an
administrator. The capability is absent from the integrity zome rather than
merely unexposed. **This makes data erasure structurally impossible**, which is
a deliberate consequence of Invariant #6 and has real legal and operational
implications for anyone running this. The remedies the protocol offers are
additive: a `Retraction` by the original author, an `AntibodyPattern` by anyone.

**No scores, no rankings, no reputation.** Invariant #1 forbids the protocol
computing a canonical credibility ordering. If you find a surface that does
compute one, that *is* worth reporting — it is a protocol violation rather than
a feature.

**The bridge trusts Twitter's data as unverifiable.** `BridgeRecord` and
`ExternalCritique` carry external platform state that this DHT cannot check.
`author_handle` is a string from another platform and is never treated as an
identity; `ExternalCritique.importer` is the agent this network can actually
hold accountable.

## What has been reviewed, and what has not

**Reviewed (2026-10-11):** the integrity zome's validation path and the
coordinator's read paths, by a security review recorded in README §9. It found
five defects of one shape — links and update ops that bound nothing to the entry
they carried — and all five are closed: eighteen link types bound at
`protocol_version` 5–8, and app-entry updates refused at 9. Each rule is probed
by `scripts/live-verify/attachment-links.mjs` against a live conductor on every
push, and that harness has been watched failing on its own rule.

**Not reviewed:** no outside audit has been done. The `bridge/`, `gateway/`,
`federation/` and `mcp-server/` services have had no security review of their
own — only the zomes and the reads have. Dependency supply chain is unaudited
beyond lockfiles.

**AND THE POSITION ON THOSE FOUR IS NOW STATED RATHER THAN LEFT TO BE
INFERRED — decided 2026-10-27 (open-work 7.3).** None of `bridge/`,
`gateway/`, `federation/` or `mcp-server/` has had a security review, **and
none of them is a service this project runs or recommends running.**
`gateway/` is the only one that binds a port (`gateway/src/main.ts`,
`server.listen`) and so the only one that would face a network if deployed;
`bridge/` and `federation/` listen for nothing — they are clients that reach
out to a conductor and to an external platform; `mcp-server/` is published to
npm, and is an **agent-side tool speaking stdio to its operator's own
conductor**, not a server a stranger can reach. **Deploy any of them and you
are the first person to have reviewed them.** That is also why the outside
audit's scope is deliberately the two zomes (7.2): they are what an installing
user actually runs, and a review of four unrun services would spend scarce
audit budget on the surface nobody is exposed to.

**What this does NOT say** is that they are abandoned or unused in
development: `bridge/`, `gateway/` and `federation/` are driven by harnesses
against a real conductor on every push, and `mcp-server`'s published tarball
is installed and exercised by `published-packages.mjs`. Exercised is not
reviewed, and running in CI is not running in production.

**How far the evidence actually goes, stated as arithmetic rather than as a
fraction.** Five deliberate injections have now established that **every rule
the harness claims to cover has been watched failing on its own probe** — both
halves (base comparison and author binding) of all eighteen link rules, plus
the update refusal, the tag rule, the shared anchor helper and the Claim/Mew
discrimination. All **38 of 38 probes** have been shown to detect the absence
of the rule they name, by reverting that rule and watching exactly that probe
go red. Five of the six poisoning checks have gone red on a real poisoning.

**What has never been shown to fail — 58 of the 101 checks, and each for a
reason worth knowing:**

- **38 paired "refused by DHT validation, not a coordinator guard" assertions.**
  Each would fail only if a refusal arrived from a coordinator guard instead of
  validation, which no injection has produced.
- **18 positive reads** asserting the honest path still works. These need an
  *over*-refusing injection rather than an under-refusing one — a different
  exercise, and the one that would catch a rule that refuses everything.
- **1 plumbing control** (credentials still work after the update refusal).
- **1 check that was proven INSENSITIVE** rather than unproven: the read-side
  check on an updated claim passed while a forged update was accepted, because
  no client-surface read can observe one. It is relabelled, not deleted.

So: the rules are well evidenced; a little under half the individual checks
are. Treat a green tick as meaning the rules hold, not that every assertion in
the file is load-bearing.

## Scope

In scope: the integrity zome (`dna/integrity/`), the coordinator zome
(`dna/coordinator/`), and anything that lets one agent misrepresent another's
epistemic position — a forged author, a false retraction, an attribution that
names somebody who did not act. Invariant violations are in scope by default.

Out of scope: denial of service and resource exhaustion (the friction budgets
are cost mechanisms, not DoS defences, and are documented as such); the four
services named under *What has been reviewed, and what has not* — they are
declared not-for-deployment rather than claimed safe, so a finding that one of
them is insecure when exposed to a network is a finding about a deployment this
project advises against (a finding that the **app** or a **zome** depends on
one of them is in scope, and welcome); anything
requiring control of a user's own machine or keys; Holochain and `kitsune2`
defects, which belong upstream — though a report that this project *depends* on
one in a way it has not recorded is welcome.

**Holochain `0.7.0` is pre-1.0.** Some classes of defect here are substrate
behaviour rather than protocol behaviour, and README §9 keeps a frozen record of
one such investigation with eight open questions. A finding that reaches into
that substrate is still worth reporting; it may be answered by a pointer to that
record.
