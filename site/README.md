# site/ — the public page

Deployed to <https://stateofintent.github.io/epistemic-happ/> by
`.github/workflows/pages.yml` on every push to `main` that touches this
directory.

## What this is

A positioning page for a cold reader: what the protocol is, why the problem is
real, what exists today, where it sits against four neighbouring projects, and
the three weaknesses stated plainly. The funder-facing material is the last
section and is labelled as such.

## The two things to know before editing

**1. There is a second copy, and the two can drift.** The prose here was
adapted from `docs/funding/THE-STORY-2026-11-26.md`, which is **not in git** —
`docs/funding/` is in `.git/info/exclude`. If you revise one, revise the other.
The page is not a rendering of that file and has diverged deliberately: the
funder framing, the "versions to paste" section and the internal notes are not
here.

**2. Every number on this page is now gated, and three of them were wrong.**
`scripts/check-site-claims.mjs` re-measures each counted claim against the
thing that determines it, runs in `live-verify.yml` on every push and pull
request, exits 1 on a figure that does not match and **2 when it cannot find
the claim at all** — a renamed label or a rewritten figure grid is a failure,
not a pass. Run it by hand with `node scripts/check-site-claims.mjs`.

| claim | measured from |
|---|---|
| protocol version 11 | `PROTOCOL_VERSION` in `dna/integrity/src/lib.rs` |
| integrity 4,016 lines | `wc -l dna/integrity/src/lib.rs` |
| 19 entry types / 31 link types | the `EntryTypes` / `LinkTypes` enums |
| coordinator 9,863 lines | `wc -l dna/coordinator/src/lib.rs` |
| **95** callable functions | `#[hdk_extern] pub fn`, parsed as `check-spec-drift.mjs` parses it |
| **75** harnesses / **35,609** lines | `scripts/live-verify/*.mjs` **less the two shared modules** |
| **12** document & spec gates | `scripts/check-*.mjs` **that a workflow references** |
| 580 merged PRs | GitHub search count — a lower bound, may understate, may not overstate |

**What the first run of that gate found, and why the method column above is
written the way it is.** Three figures on the live public page were wrong, and
two of the three were mistakes this repository had already made, fixed and
written down somewhere else:

- **77 harnesses → 75.** `scripts/live-verify/` holds 77 `.mjs` files and two
  are shared modules, not harnesses. `check-harness-counts.mjs:207` excludes
  exactly those two, and `check-prose-claims.mjs`'s own header records making
  this same mistake and correcting it. The page was the third surface and the
  only public one. The line count moves with it: 35,782 → 35,609.
- **98 callable functions → 95.** The old method in this table was
  `grep -c '#[hdk_extern]'`, and **three of those 98 matches are the string
  `#[hdk_extern]` written inside comments** (coordinator lines 5667, 7533,
  8438). A looser pattern reaches 100 by also counting the two
  `#[hdk_extern(infallible)]` scheduled functions, which no caller can call.
  Three scripts reported 95, 98 and 100 for one artifact; 95 is the callable
  surface, and both copies of the pattern are now asserted against the gate
  that owns it.
- **"15 — run on every change" → 12.** Fifteen `check-*.mjs` existed, which is
  what was counted, but four are hand-run and in no workflow. The number was
  right and **the verb was false**. A page claiming enforcement gets its
  enforcement counted.

The figure that started this had already been corrected once: the source draft
said **21 document and spec gates**, which is `ls scripts/*.mjs | wc -l` — a
set including a spike, a generator, a coverage reporter and `ci-scope.mjs`,
none of which gate anything. Correcting 21 to 15 moved the claim onto the right
files and left it on the wrong verb, and nothing in the repository could see
either version.

Before changing any number here, re-measure it, and prefer the expression the
owning gate uses over a `grep -c` of your own. Before publishing a new claim
here, run `node scripts/check-outbound-claims.mjs` against the draft as well —
this page is the most outward-facing document in the repository.

## Files

- `index.html` — the whole page
- `assets/styles.css` — palette measured off the brand mark; three theme states
- `assets/app.js` — the wave, the tabs, the rail. The page reads fine without it
- `assets/epistemic-resonance.jpg` — the brand mark as supplied
- `assets/logo-light.png`, `logo-dark.png` — background removed, ink and teal
  lifted for the dark theme. Regenerate from the JPEG with ImageMagick:
  ```
  magick epistemic-resonance.jpg -fuzz 10% -transparent white -trim +repage logo-light.png
  magick logo-light.png -fuzz 13% -fill '#E7ECEA' -opaque '#26292A' \
                        -fuzz 16% -fill '#4FA396' -opaque '#266D63' logo-dark.png
  ```
  The fuzz on the ink replacement must stay under 20%: the teal `#266D63` sits
  about 20% away from the ink `#26292A`, and a wider threshold eats it.
