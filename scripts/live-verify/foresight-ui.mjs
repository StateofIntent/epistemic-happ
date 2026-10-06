#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/foresight-ui.mjs — the Foresight surface, and the fake
// it has to defeat.
//
// WHAT THE PLAUSIBLE FAKE IS HERE, because it is not a broken screen. It is a
// screen that renders the REVEALED predictions accurately, attractively, with
// their questions and timestamps, and does not show the commitments that
// expired unrevealed. Every row on it would be true. The agent would appear to
// have foreseen everything they disclosed, and nothing would indicate how much
// they committed to and let lapse.
//
// That is exactly the selective revelation README.md §9 refused to ship the
// backend for — rebuilt at the view layer, where no validation rule reaches.
// The protocol can refuse a late reveal and a mismatched hash; it cannot
// refuse a template that leaves a list out. So this harness's central check is
// not that the screen works. It is that the EXPIRED GROUP IS THERE, with a
// real expired commitment in it, rendered without being asked for.
//
// SET UP THROUGH THE CONDUCTOR, MEASURED THROUGH THE BROWSER. The commitments
// are created by zome call so their deadlines can be controlled to the second
// — one far out and revealed, one seconds out and deliberately left to lapse.
// The screen is then measured against state the harness already knows the
// truth about, rather than against whatever it happens to render.
//
// Prereqs: a CLEAN sandbox (scripts/sandbox.sh clean && start) and a UI build.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
//   Injection: the `foresight-expired` group removed from the render, leaving
//   revealed and pending.
//   Result, FIRST TIME: TWO red and then a crash. `innerText()` was called on
//   the missing locator, so the run died before reaching the rest — a harness
//   fragile at exactly the point of the defect it exists to detect, reporting
//   less than it knew. Recorded because the header previously claimed "four
//   red" from a run that never got that far.
//   Result, AFTER GUARDING: FIVE red out of sixteen and the run completes —
//   all four section-2 checks, plus "says it is sealed instead", which read
//   the expired group's text.
//
//   AND TWO CHECKS PASS VACUOUSLY UNDER THAT INJECTION, which is worth
//   knowing rather than glossing. "an expired commitment does not disclose
//   what it sealed" passes because the text is absent along with the group
//   that would have held it, and "expired commitments get NO reveal control"
//   passes by counting zero controls inside an element that is not there.
//   Both are absence assertions, and deleting the group satisfies them for
//   the wrong reason. They are kept because they catch the defects they were
//   written for — a lapsed commitment rendering its sealed content, and a
//   reveal button that would always fail — and the group's own presence is
//   asserted four times over in section 2, which is what makes their
//   vacuity detectable instead of silent.
//
//   Injection: a hit-rate line added — `revealed / (revealed + expired)`,
//   rendered as "Hit rate: 1/2" just above the no-score disclaimer.
//   Result, FIRST TIME: ALL SIXTEEN GREEN, and the harness was wrong. This
//   is the worst result in this file, because the check that exists for
//   exactly this injection passed it. The cause was not the pattern but the
//   TEXT: the check read `textContent`, which concatenates adjacent blocks
//   with no separator, so the page came out as "…Hit rate: 1/2There is no
//   hit rate on this page…". The `2` is followed by a `T` — both word
//   characters — so the ratio pattern's trailing `\b` had no boundary to
//   match. A screen displaying a computed ratio, and not one check objecting.
//   Result, AFTER APPENDING A NEWLINE PER ELEMENT: red on "no x/y ratio is
//   displayed", with every list check still green — which is the point of
//   asserting the absence of a score separately from the presence of the
//   lists. A screen can show all three lists honestly and still editorialise
//   them into one number.
//
//   THIS CORRECTS AN EARLIER VERSION OF THIS HEADER, which recorded the
//   hit-rate injection as going red. It did not, and the claim survived
//   because it was inherited rather than re-run. An injection result that
//   is not reproduced is a claim, not evidence.
//
//   Restored and re-run: all sixteen green.
// ---------------------------------------------------------------------------
import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { CHROMIUM } from './chromium.mjs';

// playwright is a mobile-ui dependency, not one of this directory's, so it is
// resolved from there the way every other browser harness here does. A bare
// `import ... from 'playwright'` fails with ERR_MODULE_NOT_FOUND.
const requireFromUi = createRequire(new URL('../../mobile-ui/package.json', import.meta.url));
let chromium;
try {
  ({ chromium } = requireFromUi('playwright'));
} catch {
  console.error('Could not resolve playwright from mobile-ui/. Run: cd mobile-ui && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install');
  process.exit(1);
}

const ADMIN = Number(process.env.ADMIN_PORT ?? 8889);
const APP = Number(process.env.APP_PORT ?? 8888);
const APP_ID = process.env.APP_ID ?? 'epistemic-resonance-happ';
const PREVIEW_PORT = Number(process.env.PREVIEW_PORT ?? 4181);

let failures = 0;
const log = (...a) => console.log(...a);
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowMicros = () => Date.now() * 1000;

async function connect() {
  const admin = await AdminWebsocket.connect({ url: new URL(`ws://localhost:${ADMIN}`), wsClientOptions: { origin: 'live-verify' } });
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: APP_ID });
  const app = await AppWebsocket.connect({ url: new URL(`ws://localhost:${APP}`), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const ids = [];
  for (const cells of Object.values(info.cell_info))
    for (const c of cells) if (c?.type === CellType.Provisioned) ids.push(c.value.cell_id);
  for (const id of ids) {
    for (let i = 0; i < 30; i++) {
      try { await admin.authorizeSigningCredentials(id); break; }
      catch (e) { if (!String(e.message ?? e).includes('CellDisabled')) throw e; await sleep(1000); }
    }
  }
  return {
    me: ids[0][1],
    call: (fn, payload) => app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload }, 60000),
  };
}

const REVEALED_TEXT = 'This one was revealed before its deadline.';
const LAPSED_TEXT = 'This one was left to lapse on purpose.';

async function main() {
  const node = await connect();
  const DOMAIN = `Foresight${Date.now()}`;

  log('--- setting up through the conductor, so the truth is known ---');
  const question = await node.call('create_claim', {
    content: 'A question posed in advance, for the foresight surface.',
    domain: DOMAIN, confidence: 'Moderate', semantic_tags: [],
    author: node.me, timestamp: nowMicros(), evidence_hashes: [], attestation_policy: null,
  });
  await sleep(1100);   // the question must predate the commitments

  const far = nowMicros() + 3_600_000_000;
  const revealedPr = await node.call('pre_register', {
    question, prediction: REVEALED_TEXT, salt: 'salt-revealed', reveal_deadline: far,
  });
  await node.call('reveal_pre_registration', {
    pre_registration: revealedPr, prediction: REVEALED_TEXT, salt: 'salt-revealed',
  });

  const soon = nowMicros() + 4_000_000;
  await node.call('pre_register', {
    question, prediction: LAPSED_TEXT, salt: 'salt-lapsed', reveal_deadline: soon,
  });

  log('    waiting out the 4s deadline so one commitment genuinely expires ...');
  await sleep(6000);

  const truth = await node.call('get_foresight_record', node.me);
  log(`    conductor says: revealed=${truth.revealed.length} expired=${truth.expired.length} pending=${truth.pending.length}`);
  if (truth.revealed.length < 1 || truth.expired.length < 1) {
    log('  SETUP FAILED: need at least one revealed and one expired commitment.');
    log('  If the code looks right the conductor is on a STALE BUILD —');
    log('  scripts/pack-webhapp.sh, then scripts/sandbox.sh clean && start.');
    process.exit(1);
  }

  log('\nStarting vite preview (production bundle) ...');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: new URL('../../mobile-ui/', import.meta.url).pathname, stdio: 'ignore',
  });
  await sleep(3000);

  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  try {
    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });

    log('\n=== 1. the tab exists and reads the record ===');
    await page.getByRole('button', { name: 'Foresight', exact: true }).click();
    await page.waitForSelector('[data-testid="foresight-revealed"]', { timeout: 20000 });
    check('a Foresight tab is reachable', true);

    const revealedBox = page.locator('[data-testid="foresight-revealed"]');
    check('the revealed prediction is shown', (await revealedBox.innerText()).includes(REVEALED_TEXT));

    log('\n=== 2. THE DENOMINATOR IS ON SCREEN WITHOUT BEING ASKED FOR ===');
    //
    // No clicks between opening the tab and these assertions. An expired list
    // that needs a toggle is one a reader can miss, which is the fake.
    const expiredBox = page.locator('[data-testid="foresight-expired"]');
    const expiredPresent = await expiredBox.count() === 1;
    check('the expired group is rendered', expiredPresent);
    // SURVIVES THE ABSENCE IT IS LOOKING FOR. The first version called
    // innerText() unconditionally, so removing the expired group — the exact
    // defect this harness exists to catch — threw and killed the run after two
    // failures, reporting less than it knew. A harness that crashes on its own
    // injection cannot tell you how much the injection broke.
    check('and is visible without expanding anything', expiredPresent && await expiredBox.isVisible());
    const expiredText = expiredPresent ? await expiredBox.innerText() : '';
    check('it contains at least one expired commitment',
      expiredPresent && (await expiredBox.locator('[data-testid="foresight-expired-item"]').count()) >= 1);
    check('and says what the list is for', /denominator/i.test(expiredText));

    log('\n=== 3. the sealed content of a lapsed commitment is NOT on screen ===');
    const whole = await page.locator('.foresight-tab').innerText();
    check('an expired commitment does not disclose what it sealed', !whole.includes(LAPSED_TEXT));
    check('and says it is sealed instead', /sealed/i.test(expiredText));

    log('\n=== 4. no score, no ratio, no ordering ===');
    check('a no-score statement is present', await page.locator('[data-testid="foresight-no-score"]').count() === 1);
    // A SCREEN CAN SHOW ALL THREE LISTS AND STILL EDITORIALISE THEM, so the
    // absence of a score is asserted rather than inferred from the lists.
    //
    // ASSERTED AS THE ABSENCE OF A NUMBER, NOT OF A PHRASE. The first version
    // searched the tab text for "hit rate" — and failed, because the page's own
    // disclaimer says "There is no hit rate on this page". The check could not
    // tell a denial from a display, and the denial is the thing we want. What a
    // score actually looks like is a figure: a percentage, or one count over
    // another. Those are what cannot appear.
    // DATES ARE EXCLUDED, AND THAT IS NOT A LOOPHOLE. The ratio pattern
    // `\d+/\d+` matches a locale date — `10/5/2026` is digits over digits —
    // so the first numeric version of this check failed on the reveal
    // deadlines it is supposed to ignore. A date is not a score. Rather than
    // reformat the deadlines to satisfy a blunt regex, the deadline spans are
    // removed before the text is searched, which is exact: the harness knows
    // precisely which element renders a date, because the page gives it a
    // class of its own.
    //
    // FOURTH iteration of this one check, and the first three failures were
    // the same underlying error — pattern-matching surface text without
    // accounting for what else legitimately appears in it. The fourth is a
    // different and worse one: the check PASSED an injection it was written
    // to catch, because the text it searched had no boundaries in it. See the
    // separator comment below and the negative evidence in this file's header.
    //
    // THE EARLIER NOTE IN THE HEADER WAS WRONG ABOUT THIS, and that is the
    // reason to re-run an injection rather than inherit its result: the hit
    // rate was recorded as going red on the no-score check. It did not. It
    // went green, and the lists all stayed green too, so the page displayed a
    // computed ratio with no check objecting anywhere.
    const scored = await page.evaluate(() => {
      const tab = document.querySelector('.foresight-tab');
      if (!tab) return '';
      const copy = tab.cloneNode(true);
      for (const d of copy.querySelectorAll('.foresight-deadline')) d.remove();
      // SEPARATORS, BECAUSE textContent HAS NONE — and the fourth iteration of
      // this check exists entirely because of that. `textContent` concatenates
      // adjacent blocks with nothing between them, so an injected "Hit rate:
      // 1/2" rendered immediately above the disclaimer came out as
      // "…1/2There is no hit rate…". The `2` is then followed by a `T`, both
      // word characters, so the ratio pattern's trailing `\b` has no boundary
      // to match and the injection went GREEN. A newline per element restores
      // the boundaries the layout implies.
      for (const el of copy.querySelectorAll('p, div, span, li, h1, h2, h3, button, label')) el.append('\n');
      return copy.textContent ?? '';
    });
    const asPercent = /\d+(\.\d+)?\s*%/.test(scored);
    const asRatio = /\b\d+\s*\/\s*\d+\b/.test(scored);
    check('no percentage is displayed', !asPercent);
    check('no x/y ratio is displayed', !asRatio);
    check('and the page says in words that it does not compute one', /no hit rate on this page/i.test(whole));

    log('\n=== 5. a reveal control is offered only where a reveal can succeed ===');
    const expiredReveal = await expiredBox.locator('[data-testid="foresight-reveal-submit"]').count();
    check('expired commitments get NO reveal control', expiredReveal === 0);

    log('\n=== 6. the commit form warns before its fields, not after ===');
    await page.locator('[data-testid="foresight-commit-toggle"]').click();
    await page.waitForSelector('[data-testid="foresight-form"]', { timeout: 10000 });
    const warnBox = page.locator('[data-testid="foresight-form-warning"]');
    // Matched against a distinctive fragment of the string the page actually
    // ships. The first version asserted /cannot be recovered/ while the warning
    // reads "Neither can be recovered …" — an assertion written from what I
    // meant to say rather than from what was said.
    const warnText = await warnBox.innerText();
    check('the form warns that the prediction and salt are unrecoverable',
      /recovered from this app/i.test(warnText) && /required to reveal/i.test(warnText));
    const warnY = (await warnBox.boundingBox())?.y ?? 1e9;
    const fieldY = (await page.locator('[data-testid="foresight-prediction-input"]').boundingBox())?.y ?? -1;
    check('and the warning sits ABOVE the prediction field', warnY < fieldY);

    check('no page errors', pageErrors.length === 0);
    if (pageErrors.length) log(`    ${pageErrors[0].slice(0, 200)}`);
  } finally {
    await browser.close();
    preview.kill();
  }

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — the expired group is on screen unasked, beside the');
    log('revealed one, naming itself as the denominator; a lapsed commitment');
    log('does not disclose what it sealed; no reveal control is offered where a');
    log('reveal would be refused; and nothing on the page divides the lists.');
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(1); });
