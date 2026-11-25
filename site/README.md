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

**2. Nothing re-measures the numbers on this page.** `check-prose-claims.mjs`
reads an explicit list of six documents and this is not one of them, so every
counted claim in `index.html` is ungated. They were measured against the source
tree on 2026-11-26:

| claim | measured from |
|---|---|
| protocol version 11 | `PROTOCOL_VERSION` in `dna/integrity/src/lib.rs` |
| integrity 4,016 lines | `wc -l dna/integrity/src/lib.rs` |
| 19 entry types / 31 link types | the `EntryTypes` / `LinkTypes` enums |
| coordinator 9,863 lines / 98 externs | `wc -l`, `grep -c '#[hdk_extern]'` |
| 77 harnesses / 35,782 lines | `scripts/live-verify/*.mjs` |
| 15 document & spec gates | `scripts/check-*.mjs` |
| 580 merged PRs | GitHub search count |

Before changing any number here, re-measure it. Before publishing a new claim
here, run `node scripts/check-outbound-claims.mjs` against the draft — this
page is the most outward-facing document in the repository and the gates that
protect the others do not see it.

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
