// ============================================================================
// scripts/live-verify/declared-wait.mjs — SPEC §7b.2 APPLIED TO THE ONE READ
// IN THIS SUITE THAT KEPT FAILING WITHOUT SAYING WHAT FAILED.
//
// THE DISCIPLINE. §7b.2 is "every read declares the mode it ran in", adopted
// from Veritas (Project 89). A Playwright `waitForSelector` is a read, and on
// timeout it declares nothing: `TimeoutError` names the selector and the
// milliseconds and is silent about the only question worth asking —
//
//   was the data there and the screen did not show it   (a RENDER failure)
//   or was the data not there yet                       (an INTEGRATION failure)
//
// Those two have completely different causes and the same symptom, which is
// why four failures across `taxonomy-ui` and `graph-ui` were attributed to CI
// contention for a week on no evidence beyond a correlation. `docs/open-work.md`
// item 1.7 and `scripts/live-verify/README.md` both named this helper as what
// would settle it; this is it.
//
// WHAT IT DOES. Wraps the wait, and ON TIMEOUT asks the DHT directly, through
// an INDEPENDENT zome call, whether the thing the screen was waiting for is
// readable at that moment. Then it reports elapsed time AND that answer, and
// rethrows so the harness still fails exactly as it did before. The diagnosis
// is added; nothing is softened. A wait that passed is not reported unless it
// came suspiciously close to its own ceiling, because a read that nearly timed
// out is the early warning for one that will.
//
// WHY `probe` IS A CALLBACK rather than a selector-to-query mapping. Only the
// calling harness knows which zome read corresponds to the thing on screen —
// `get_critiques_for` for a critique item, `get_all_critique_species` for a
// species card. A mapping living here would be this module guessing about
// screens it cannot see, and would rot the moment a testid changed.
//
// §7b.1 IS WHY `UNDETERMINED` IS LOUD. If the probe itself throws, that is not
// a reason to report nothing: an unanswerable mode question is a dropped read,
// and the discipline's counted half says a drop must be visible rather than
// silent.
// ============================================================================

/** Wait for `selector`, declaring the mode on timeout.
 *
 * @param page       Playwright page.
 * @param selector   What to wait for.
 * @param opts.timeout     ms, as passed to waitForSelector.
 * @param opts.probe       async () => boolean | { readable, detail }.
 *                         Must read the DHT independently of the page.
 * @param opts.probeLabel  What the probe asks, for the report.
 * @param opts.log         The harness's own log function.
 * @returns { elapsed } on success.
 * @throws  a labelled Error on timeout, carrying `.declared`.
 */
export async function waitDeclaringMode(page, selector, opts) {
  const { timeout, probe, probeLabel = 'the entry this screen is waiting for', log = console.log } = opts;
  const started = Date.now();
  try {
    await page.waitForSelector(selector, { timeout });
    const elapsed = Date.now() - started;
    // Only reported when it is nearly a failure. A read that used most of its
    // ceiling is the warning for the one that will exceed it, and reporting
    // every fast wait would bury that in noise.
    if (elapsed > timeout * 0.5) {
      log(`  WAIT MODE: ${selector} resolved after ${elapsed}ms of a ${timeout}ms ceiling `
        + `— over half, so this read is closer to timing out than it looks`);
    }
    return { elapsed };
  } catch (e) {
    const elapsed = Date.now() - started;
    let readable = null;
    let detail = '';
    try {
      const r = await probe();
      if (r !== null && typeof r === 'object') {
        readable = Boolean(r.readable);
        detail = r.detail ?? '';
      } else {
        readable = Boolean(r);
      }
    } catch (pe) {
      detail = `the probe itself threw: ${String(pe?.message ?? pe).slice(0, 140)}`;
    }

    log('');
    log(`  WAIT MODE: TIMED OUT on ${selector} after ${elapsed}ms (ceiling ${timeout}ms)`);
    log(`    asked the DHT directly — ${probeLabel}:`);
    if (readable === true) {
      log(`      READABLE by an independent zome call at the moment of timeout${detail ? ` (${detail})` : ''}`);
      log('      => THE DATA WAS THERE AND THE SCREEN DID NOT SHOW IT: a RENDER failure.');
      log('         Look at the component and its refetch, not at the conductor.');
    } else if (readable === false) {
      log(`      NOT readable by an independent zome call at the moment of timeout${detail ? ` (${detail})` : ''}`);
      log('      => THE DATA WAS NOT THERE YET: an INTEGRATION failure, not a render one.');
      log('         The screen was correct to show nothing. Look at commit-to-readable latency.');
    } else {
      log(`      UNDETERMINED${detail ? ` — ${detail}` : ''}`);
      log('      => the mode question could not be answered, which §7b.1 says must be');
      log('         reported rather than dropped. Treat this as a missing measurement.');
    }
    log('');

    const err = new Error(
      `declared-wait: ${selector} timed out after ${elapsed}ms; `
      + `readable_by_zome_call=${readable === null ? 'undetermined' : readable}`,
    );
    err.declared = { selector, elapsed, timeout, readable, detail };
    err.cause = e;
    throw err;
  }
}
