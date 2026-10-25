# The four interaction calls — one decision, and one of them is mis-filed

> ## STATUS: A DECISION BRIEF. NOTHING HERE IS BUILT, AND THE DECISION IS NOT TAKEN.
>
> Open-work §6 lists four unsurfaced reads — 6.1 `critiques_unseen_by`,
> 6.2 `publish_discourse_reading`, 6.3 the settlement screen, 6.4 the
> assessment screen — each `[D]`, each blocked on "a design decision",
> and notes that **6.2 structurally gates item 22's reopen.**
>
> This brief exists to make that decision answerable in one sitting
> instead of re-derived four times. It does two things:
>
> **1. The four are one question asked four times**, and the useful split
> is not per-screen. Three are **writes that commit the signer**; one is
> a **read that describes a third party**. The rule each family needs is
> different, and within each family it is the same rule.
>
> **2. 6.1 IS MIS-FILED, and that is the finding.** It is not blocked on
> a design decision. **No client populates `past_cone`** — zero hits
> across `mobile-ui/src` and `agent-sdk/`, measured 2026-10-26 — and
> `cone_recorded = !critique.past_cone.is_empty()`, so it is **false for
> every critique that exists.** A screen for 6.1 today can render exactly
> one thing: *no cone recorded*. There are no true positives to show. It
> is blocked on a client writing cones, and **no row says so.**

---

## 1. Why they are one question

Each of the four sits behind the same wall: **a button that writes a
permanent, attributed, signed promise**, under Invariant 6, where nothing
can be deleted or amended. The design problem is never the button. It is:

> **What must be on screen before a user is allowed to sign?**

And in every one of the three write cases, **the protocol already
publishes the thing the screen has to show.** None of them needs a new
zome surface. That is why these are interaction decisions and not
engineering ones — and also why they are cheaper than four rows suggests.

| row | the promise being signed | what must be beside it | already published by |
|---|---|---|---|
| 6.2 | a public reading of discourse health | **which lens produced it** | the caller's own `AttestationPolicy`/`ConductancePolicy`, and `describe_method`'s string, which is already carried into the entry |
| 6.3 | one aggregator's settlement | **the policy, the input set, and any competing status** | `policy` cited by hash, `inputs` listed on the entry, and `get_settlement_statuses_for` returning *all* statuses |
| 6.4 | one agent's stance on a target | **the objections already raised** | `get_critiques_for`, and `past_cone` records what the assessor had seen |

## 2. Family A — the three writes, and the one rule they share

**The rule: a signing button must display the precondition the protocol
already publishes, and must name what is permanent before it commits.**

That is one component, not three. Each of the three differs only in which
precondition it renders. Stating it once is what makes this a single
decision rather than four.

Why it is not optional in any of the three, in the repository's own words
(README §9):

- **6.2** — *"§4.4 forbids an interface that filters without the user
  having chosen and being able to see the filter — and a reading
  published through a lens the user did not knowingly aim is exactly the
  laundering this whole mechanism exists to prevent."*
- **6.3** — *"the most dangerous of the three to surface carelessly: a
  'Settle' button renders one agent's arithmetic as a verdict unless the
  screen also shows the policy, the input set, and any competing
  status."*
- **6.4** — *"A one-click Supports/Disputes without that is a vote, which
  is the thing this entry type is deliberately not."*

**The through-line is Invariant 1 at the view layer.** The protocol
refuses to compute a canonical comparative measure; a screen that renders
one agent's output without its method **rebuilds that measure in the
interface**, where no validation rule reaches. Each of these three is the
same defect in a different costume, which is why the mitigation is one
rule.

### 2.1 The cost of deciding 6.2, stated because it is easy to miss

**Building 6.2 makes half of item 22's reopen condition true.** §6 records
that item 22 needs both *a surface for readings exists* **and** *somebody
wants them faster than a person will click*, and that the first is false
while 6.2 is unbuilt. Item 22 was **decided 2026-10-21: no autonomous
write**, on three reasons — no consumer, Invariant 6 making it the least
reversible change available, and a reading being somebody's *signed*
promise.

So 6.2 does not reopen item 22, but it removes the structural reason the
question cannot become live. That is a consequence to accept knowingly,
not a blocker: the decision stays taken, and `metabolism.mjs` still
asserts the tick's chain does not grow (watched failing as injection AO).

## 3. Family B — 6.1, and why it is not a design decision

6.1 is the odd one and the difference is not cosmetic. The other three
risk **committing the user to something they did not mean**. 6.1 risks
**publishing a false implication about somebody else** — README §9: *"a
screen showing that beside a critique is one step from reading as an
accusation."*

But the screen is not the binding constraint today. Measured 2026-10-26:

- **`past_cone` is sent by no client.** `grep -rn 'past_cone'` over
  `mobile-ui/src/*.ts` and `agent-sdk/` returns **zero hits**. The field
  is `#[serde(default)]`, so every `create_critique` call omits it and
  every critique commits with an empty cone.
- **`cone_recorded` is therefore universally false.** It is derived as
  `!critique.past_cone.is_empty()`.
- **The extern already says what that means.** When the cone is absent it
  returns the note: *"This critique recorded NO past cone, so nothing
  here is evidence of ignorance. An author whose client does not populate
  cones is silent, not uninformed. `unseen` is simply every sibling
  critique."*

**So a 6.1 screen built today can display exactly one state.** Every
critique returns *no cone recorded*; `unseen` is always just the sibling
list; and the honest rendering of that is "we do not know", for every
critique, with no exceptions. **The feature has no true positives
available to it**, and designing the careful two-column screen README §9
describes would be designing for a case that cannot yet occur.

**The honest reclassification:** 6.1 is blocked on a client populating
`past_cone` — which is itself an undecided question nobody has written
down, because populating a cone means a client asserting what its user
read, and that is a promise with its own design problem. Recommended as a
new row rather than smuggled into 6.1.

## 4. Recommended order, and the argument against each

| | recommendation | the argument against it |
|---|---|---|
| **6.2** | **First.** It is the one that unblocks something structural (§2.1), and `describe_method`'s string is already carried into the entry, so the hardest part — *having something true to show* — is done. | It is also the one that makes item 22's reopen possible. If you would rather that question stay structurally dead, 6.2 is the row to leave alone, and that is a coherent position. |
| **6.4** | **Second, and it is the cheapest of the three.** Its precondition is a critique list, which the UI already renders elsewhere. Doing it second also builds the shared commit component against the simplest case. | A stance button is the most inviting thing on this list to over-simplify, and the one a user will most want as one click. The pressure to ship it as a vote will be highest here. |
| **6.3** | **Third.** It reuses 6.4's component and adds the competing-status list, which is the part with real design content: *showing two valid contradictory statuses without implying one won.* | It is "the most dangerous to surface carelessly", so there is a case for never surfacing it and leaving settlement to aggregator tooling — `recompute_settlement` is already SDK-facing by design. |
| **6.1** | **Reclassify, do not design.** Open a row for *a client populates `past_cone`*; leave 6.1 blocked on it. | If a client is about to populate cones anyway, designing the screen now is not wasted. Nothing on the list says one is. |

## 5. What this brief does not decide

**The decision is still yours and it is now one decision, not four:**
whether a signing button in this interface must display the precondition
the protocol publishes — and if yes, 6.2 → 6.4 → 6.3 in that order, with
6.1 reclassified.

Not decided here, and deliberately:

- Whether to surface 6.3 **at all** (the leave-it-to-aggregators option
  is real).
- Whether a client should populate `past_cone`, which is 6.1's actual
  blocker and a new question.
- Any visual design. This brief argues about *what must be present*, and
  says nothing about layout, which is the half a person should do at a
  screen.
