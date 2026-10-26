# Privacy impact assessment — the pilot

**Written 2026-10-26 night (open-work 7.18). One page, deliberately.** It is
**not** a DPIA in the Article 35 sense and does not claim to be: no counsel
reviewed it, no supervisory authority has seen it, and the EDPB expects a real
one where high-risk processing is likely. It exists because it is free, because
7.16's advice asked for it, and because *"erasure is structurally impossible"*
is a diligence question that needs a prepared answer rather than a shrug.
**Scope: the four-to-ten-person desktop pilot of `v0.3.0`, not a public
deployment.** Detail lives in the rows and documents named inline.

---

## 1. What is processed, and by whom

| data | where it lives | who sees it | personal? |
|---|---|---|---|
| **Agent public key** — the only identity | every entry the agent authors | every peer in the network | **Yes, pseudonymous.** Recital 26: pseudonymised data stays personal where re-identification is possible, and a key is re-identifiable to anyone who knows whose it is |
| **Claim, critique, assessment, evidence and mew content** — free text the author writes, plus `Evidence.source_url` | the DHT, replicated to peers | every peer in the network | **Only if an author puts it there.** The protocol asks for none; §4's rule is that they must not |
| **Sealed predictions** (`SealedPrediction`) | the author's own source chain, **private entry** | **nobody but the author**, until they reveal | Yes, and it is the one type already built this way |
| **An external platform handle**, if and only if the author uses the bridge or imports a critique — `BridgeRecord.twitter_id`, `ExternalCritique.twitter_id`, `ExternalCritique.author_handle` | the DHT | every peer | **Yes, and it is a deliberate re-identification vector** — the author chooses to link a key to a named account, or names somebody else's |
| **Network metadata: IP address** | not in any entry; in the transport layer | peers, the bootstrap server, the relay operator | **Yes — see §5, the gap with no mitigation yet** |
| **Real names, emails, addresses, dates of birth, anything special-category** | **nowhere** | — | **Not processed.** No entry type in the DNA has a field for any of them: the only identity field is `AgentPubKey` (verified field-by-field across all 19 entry types: the only `AgentPubKey` is the author's, and the two `name` fields belong to a *critique species* and a *settlement policy*, not to a person) |

**No analytics, no telemetry, no crash reporting, no server-side account, no
log shipped anywhere.** Nothing in the installed app phones home. The services
that could hold data centrally — `bridge/`, `gateway/`, `federation/`,
`mcp-server/` — are **not part of what an installing user runs** (7.3) and none
is deployed for the pilot.

## 2. Why — the purpose, stated plainly

To find out whether a network of signed, ordered, critiquable claims is usable
by people who did not build it, and to surface what three conductors on one
machine cannot (release step 4). The data is the content of the experiment; the
personal data is **incidental to it and not its subject.** The single biggest
risk reducer is therefore not architectural: **keep the claims about the world
rather than about people** (7.16).

## 3. The risk, which is one risk wearing several faces

**Nothing can ever be deleted — by the author, by the operator, by anybody.**
As of `protocol_version: 4` validation refuses every delete op (SPEC §5.1), so
the capability is absent from the integrity zome rather than merely unexposed,
and a coordinator edit cannot add it because validation is what refuses. The
consequences, each a face of the same fact:

1. **An erasure request cannot be honoured.** Not by any means short of every
   peer abandoning the DNA.
2. **A lost key makes even retraction impossible.** Retraction is author-only
   (§5.2), and Holochain offers no key recovery here, so a key you no longer
   hold leaves claims nobody can ever withdraw.
3. **An author can publish personal data about a third party who never agreed
   to anything**, and no promise made by the members binds that person. **This
   is the sharpest residual risk, and it is the one Australia's statutory tort
   for serious invasions of privacy actually covers** — it applies regardless
   of the Privacy Act's small-business exemption.
4. **Every peer stores other peers' data**, so an invitee in the EU or UK may
   be acquiring obligations of their own rather than only accepting a risk to
   their own data (7.16).

## 4. Mitigations actually in place

| mitigation | state |
|---|---|
| **Permanence disclosed before anyone writes** — the obligation 7.1 names, and under Invariant 6 the only protection an invitee gets | **In place**: `docs/the-invitation.md` §1 leads with it, and the message is not sent after the fact |
| **Pseudonymous keys, no real names required** — and no field exists to put one in | **In place by construction** (§1) |
| **No identity-verification layer**, now a decided position rather than an omission: a permanent record that a named person is a verified unique human is the worst category to put somewhere nothing can be removed from | **Decided** — 3.7 candidate (4), from the invariants, and 7.16's advice independently |
| **Additive remedies instead of erasure** — `Retraction` by the author, `AntibodyPattern` by anyone, removal from a reader's own trust list and root set | **Built** (SPEC §7, §2.3, §2.5, 3.7) |
| **A joining promise**: own your content, accept permanence, **post no personal information about anyone else** — signed and ordered, so the agreement is itself on the record | **Drafted, not adopted — 7.17 `[D]`** |
| **A complaints channel**: nothing can be removed, something can still be done, and saying which is what keeps those two sentences apart | **Drafted, not adopted — 7.17 `[D]`** |
| **Cohort kept small, informed, and outside the EU**, which is what keeps GDPR's practical reach near nil | **Decision pending — 7.13 `[D]`**, and it is the variable that moves the exposure |
| **Content split**: readable content off the shared network (or on it encrypted), with the hash, the signature, the order and the links staying permanent | **Filed, not built — 4.6**, behind the integrity bump. The legal urgency dropped; the third-party risk in §3.3 is why it stays on the list |

## 5. The gap this assessment found, and it was disclosed nowhere

**Network metadata is personal data, and no document in this repository
mentions it.** Verified: the strings *"IP address"* and *"network metadata"*
appear in **no** `.md` file here, and the word *"address"* appears in neither
`INSTALL.md` nor `SECURITY.md`. A reader who audits the entry types — the
natural thing to do — will not find it, because it is not in an entry.

What is actually true, stated as conservatively as the evidence here supports:
peer discovery publishes an `agent_info` record carrying a transport URL to a
**third-party bootstrap server this project does not own** (7.14,
`dev-test-bootstrap2.holochain.org`, labelled dev/test by its operator); that
server sees a connecting node's IP as any HTTP server does; a peer that
negotiates a direct connection can learn the other end's address; and where NAT
prevents that, traffic goes through a **third-party relay** whose operator sees
it instead (`INSTALL.md` records a run that went through the relay entirely).
**The precise tx5/iroh mechanics were not measured for this document** — what is
established is that the exposure exists, is not in any entry, and is undisclosed.

**Unlike the content risk, this one is not permanent** — transport metadata is
not written to the DHT, so it is the ordinary exposure of any P2P application.
**Mitigation owed, not claimed:** one sentence in the invitation and one in
`INSTALL.md`. Tracked as part of 7.18's finding rather than quietly fixed here,
because what an invitee is told is a decision (`docs/the-invitation.md` §1).

## 6. Conclusion

For a pilot of this size, with this cohort, on content about the world rather
than about people, the residual risk is **accepted** on three conditions, two of
which are decisions somebody still has to take: the permanence disclosure
reaches every invitee before they write (**in place**), the joining promise and
complaints channel are adopted (**7.17**), and the network-metadata sentence is
added (**§5**). **Beyond the pilot — a public post, European users, or a funding
conversation — this document is not enough**, and the things that would be are
already on the list: 7.16's counsel, 7.2's absent audit, and 4.6's content
split.
