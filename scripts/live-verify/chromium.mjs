// ============================================================================
// scripts/live-verify/chromium.mjs — which Chromium every browser harness in
// this directory drives, resolved once.
//
// WHY THIS IS A FILE RATHER THAN A LINE IN EACH HARNESS. These harnesses were
// written on a machine with a system Chromium at `/usr/bin/chromium` and named
// that path outright. That was correct while a conductor only ever existed on
// a machine that already had one: resolving a path nothing could exercise
// would have been churn asserting itself as safe. CI ended that condition — a
// runner has a real conductor and no system browser — and the fallback was
// then written out four separate times, once per harness that reached CI, each
// carrying its own copy of the paragraph explaining it. `ui.yml` adds
// seventeen more at once, and twenty-one copies of one fact is the shape this
// directory's own README already warns about: the clean-conductor rule was
// "stated eight times, once per file, and visible in no place where someone
// decides to run them all".
//
// RESOLUTION ORDER, and why each step is there:
//
//   1. `EPI_CHROMIUM`, so a machine with a browser somewhere unusual can say
//      so without editing twenty-one files.
//   2. `/usr/bin/chromium` if it exists — the browser these harnesses were
//      written against, and what a development machine here still has. First
//      among the automatic choices deliberately: if a harness ever behaves
//      differently under two browsers, that should surface where somebody can
//      attach a debugger, not on a runner.
//   3. `undefined`, which is Playwright's own downloaded browser and what a
//      runner has. Passing `executablePath: undefined` is how Playwright is
//      asked for it — it is the documented default, not an argument that went
//      missing.
//
// Used as:
//
//   import { CHROMIUM } from './chromium.mjs';
//   const browser = await chromium.launch({ executablePath: CHROMIUM });
//
// `chromium` there is still Playwright's own export, resolved per-harness out
// of `mobile-ui/node_modules` — this module deliberately does not resolve the
// library, only the browser binary. The library resolution prints a specific
// "install it there first" message on failure, and moving it here would put
// that message one import further from the file someone actually ran.
// ============================================================================

import { existsSync } from 'node:fs';

export const CHROMIUM = process.env.EPI_CHROMIUM?.trim()
  || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
