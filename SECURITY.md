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
and the right shape of a fix is understood to be a read-layer lens rather than
friction on the generative act.

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

**Not proven:** of the harness's 73 checks, exactly one has been demonstrated
capable of going red, by a deliberate injection. The rest are consistent with
checks that cannot fail, and the harness says so in its own header. Treat a
green tick there as weaker evidence than it looks.

## Scope

In scope: the integrity zome (`dna/integrity/`), the coordinator zome
(`dna/coordinator/`), and anything that lets one agent misrepresent another's
epistemic position — a forged author, a false retraction, an attribution that
names somebody who did not act. Invariant violations are in scope by default.

Out of scope: denial of service and resource exhaustion (the friction budgets
are cost mechanisms, not DoS defences, and are documented as such); anything
requiring control of a user's own machine or keys; Holochain and `kitsune2`
defects, which belong upstream — though a report that this project *depends* on
one in a way it has not recorded is welcome.

**Holochain `0.7.0` is pre-1.0.** Some classes of defect here are substrate
behaviour rather than protocol behaviour, and README §9 keeps a frozen record of
one such investigation with eight open questions. A finding that reaches into
that substrate is still worth reporting; it may be answered by a pointer to that
record.
