# Upstream reports — drafted here, filed by the human

Text intended for somebody else's issue tracker. It is kept in the repository
so it survives the session it was written in, and so the claims in it can be
re-checked against the vendored source the way anything else here can.

**NOTHING IN THIS DIRECTORY IS FILED BY DOING ANYTHING IN THIS DIRECTORY.**
Posting upstream needs an account and is the human's call; `docs/open-work.md`
marks both items `X` with *"the human's account and call; the model does not
file upstream"*. A draft landing on `main` is not a report, and a merged pull
request here changes nothing on the other repository.

| draft | target repo | open-work |
|---|---|---|
| `7.7-hdk-recv-remote-signal.md` | `holochain/holochain`, `crates/hdk` | 7.7 |
| `7.8-returning-node-asymmetry.md` | **`holochain/kitsune2`** | 7.8 |
| `your-own-ai-build-from-source.md` | **`WeAreFlowsta/Your-Own-AI`** | 7.26 |
| `your-own-ai-webkit-2.52-linux.md` | `WeAreFlowsta/Your-Own-AI`, or **`bugs.webkit.org`** | 7.27 |

**They go to four different trackers**, which is worth noticing rather than
assuming: `hdk` declares `repository = ".../holochain/holochain/tree/develop/crates/hdk"`,
while every `kitsune2_*` crate declares `repository = ".../holochain/kitsune2"`.
Filing the kitsune2 report in the monorepo is the natural guess and the wrong
one.

The two Your Own AI drafts are **not the same kind of thing**, and the second
one says so in its own first line. The build report is four defects in that
repository, three of them one-line fixes. The webkit note is **not their bug**
— a system WebKitGTK 2.52.6 crash reproducible with WebKitGTK's own
MiniBrowser and no Tauri involved — and is addressed to them only because
their Linux users will hit it and will report it as theirs. Its last section is
the version to file at `bugs.webkit.org` instead, with the app's involvement
removed. Sending the webkit note to them as a *defect* would be the error the
draft is written to avoid.

## What these drafts are expected to carry

Both were written by verifying every claim against the vendored crate source
rather than from notes, and that is the standard to hold them to if they are
edited. Doing it caught one error in eighteen hours of accumulated notes — the
HDK's documented signature is at `p2p.rs:138`, not the `:134` this repository
had recorded in three places.

Each also states what it is **not** claiming, which is the part most likely to
be trimmed and the part most worth keeping:

- **7.7** says that if `ExternIO` is the intended contract then the host is the
  bug instead, because the documentation and the implementation disagree
  either way and we do not know which the maintainers prefer.
- **7.8** declines to fit a formula — the obvious one fits one measured outage
  and fails another — and **retracts a claim this repository previously
  published**, that a 300s per-peer initiate floor was involved. It is not:
  `min_initiate_interval_ms` is read by no code in `kitsune2_gossip/src/`. That
  retraction is load-bearing rather than decorative, because the floor was the
  *previous* explanation for the same delay, and a report that quietly replaced
  it would invite exactly the question it fails to answer.
