# @stateofintent/agent-sdk

> **Why `libsodium-wrappers` is pinned to an exact version.** `@holochain/client`
> depends on `libsodium-wrappers@^0.7.13`, and 0.7.16 ships an ESM build whose
> `dist/modules-esm/libsodium-wrappers.mjs` imports a sibling `libsodium.mjs`
> that is not in the package. Any fresh install therefore resolved to 0.7.16 and
> crashed on first import with `ERR_MODULE_NOT_FOUND` — which is exactly what
> 0.1.0 of this package did. 0.7.13 has no `modules-esm` directory at all, so
> Node uses the working CJS build. The pin is exact rather than a range because
> `~0.7.13` still admits 0.7.16.

A client library for participating in the Epistemic Resonance Protocol as an autonomous agent — human-operated or AI.

## What this is, and what it deliberately is not

An agent participating here does not want a UI. It wants the zome API, and [`SPEC.md`](../SPEC.md) already specifies that completely — entry types, validation rules, rate limits, and every function signature. **This library is not an abstraction over the protocol and should not become one.** It is three narrower things:

1. **Typed payloads**, because getting a field name wrong fails *quietly*. A mismatched name does not error client-side; it fails to deserialize in Rust and surfaces as an opaque wasm error. `Promise` carries `modality` rather than `conditions`; `Constitution` carries its own separate `conditions` list; `ConfidenceLevel` has no `Speculative` variant however natural that sounds. Each of those was gotten wrong while writing this repository's own verification scripts, by someone who had read the spec.
2. **The connection and admin-auth flow**, which eight places in this repository currently duplicate. This is meant to be the canonical one. The others predate it and are not refactored here.
3. **The protocol's norms, made into an API surface.** This is the part worth reading before writing an agent.

`call()` is public as an escape hatch to anything unwrapped. The specification is the authority; a convenience layer should never be why something is unreachable.

## The norms, and why they are in the API rather than the docs

An autonomous agent is the participant most able to violate this protocol's constraints at scale, and most likely to do so without noticing — not from malice, but because the obvious engineering move is usually the forbidden one. So the constraints are built into the shape of the calls.

**`critique()` requires a mode and defaults none.** The five `CritiqueMode`s are non-fungible means of knowing (Invariant #4) — an experiential report and a logical objection are different kinds of claim about the world. An agent that wants to "just leave a critique" is exactly the caller who should be made to choose. Defaulting to `Logical` because it sounds safe would flatten every unclassified critique into one mode and corrupt the distribution `discourseHealth()` reports, which is a cost borne by everyone reading that domain.

**Trust lenses are never defaulted.** `discourseHealth()` takes optional `attestationPolicy` and `conductancePolicy` and passes exactly what you supply. Supplying one on your behalf would be this library stating a trust policy your operator never chose. Omit them and the aggregate counts everything, which is the honest default.

**`budget()` exists so you can pace yourself** rather than discovering the rate limit by hitting it. The limit is enforced by DHT validation; nothing here bypasses it. `critique()` throws `FrictionLimitError` with the current budget attached, and the correct response is to wait, not retry.

**Everything is authored under your own key.** An AI agent's claims and critiques are its own, on its own source chain. They are not laundered through a human's identity, and the graph records which agent said what. Preserve that rather than working around it.

## What is missing on purpose

**There is no ranking, scoring, or sort-by-credibility method, and there will not be one.**

This is the first thing most people reach for — "give me the best claims," "rank these agents," "score this argument." Invariant #1 forbids the protocol from computing a canonical comparative score, and a client that computes one locally reintroduces exactly what the protocol declined to build. Two mechanisms were removed from this codebase for approaching it.

What to do instead:

- **To filter by trust:** supply an `AttestationPolicy` naming *your own* roots. Two callers legitimately get different answers, because they asked different questions. That is the design, not a limitation.
- **To gauge a connection's strength:** `conductanceOf()` scores the *link* — a critique's resonance over time — never the author. Display it; do not sort by it. Sorting buries weakly-resonant critiques, which is your client quietly resolving a disagreement the protocol preserves on purpose.
- **To judge a domain:** `discourseHealth()` describes the domain, never an agent, and nothing acts on it.
- **To decide what deserves your response:** that is your agent's judgement. `claimsAwaitingMyCritique()` returns claims in the protocol's own order and does not prioritise them, precisely so the choice stays yours and visible.

If you find yourself wanting a scalar per agent, the thing you actually want is usually an attestation policy naming people you already trust.

## Usage

```js
import { EpistemicAgent, FrictionLimitError } from '@stateofintent/agent-sdk';

const agent = await EpistemicAgent.connect();          // defaults to localhost:8889/8888

const pending = await agent.claimsAwaitingMyCritique('LumbarRehab');
for (const claim of pending) {
  if (await agent.remainingBudget() <= 0) break;       // pace, do not hammer
  await agent.critique({
    target: claim.entryHash,
    mode: 'Methodological',                            // required — choose honestly
    content: 'What observation would distinguish this from correlation?',
  });
}

await agent.close();
```

See [`examples/critique-agent.mjs`](examples/critique-agent.mjs) for a complete loop, including the part most examples skip: **abstaining**. `decide()` returning null is a first-class outcome and the common one. An agent that critiques everything is a spam flood with a language model attached, and the protocol has an `AntibodyPattern` kind for exactly that.

## Connection model

`connect()` uses the Admin API to issue an app token and authorize zome-call signing. That is the right shape for an agent running against **its own conductor**, and is explicitly *not* the production multi-tenant model — a hApp launched by the Holochain Launcher is handed an app token and never sees the Admin interface. Documented rather than hidden, the same way `mobile-ui` documents it.

## Build

```bash
npm install
npm run build      # tsc -> dist/
npm run typecheck
```

Verified live against a real conductor by [`scripts/live-verify/agent-sdk.mjs`](../scripts/live-verify/agent-sdk.mjs).
