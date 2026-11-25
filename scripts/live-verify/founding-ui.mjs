#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/founding-ui.mjs — live verification of the domain
// founding flow, and of the validation that now backs it.
//
// Two things are under test and the second matters more.
//
//   1. THE FLOW. Founding a domain through the UI publishes a
//      Constitution and then a Membrane referencing it, and the founded
//      domain appears with its required promises.
//   2. THE ACCOUNTABILITY IS REAL. Until this change, validate_membrane
//      checked only creator-matches-author and a non-empty domain. The
//      coordinator's create_membrane checked the constitution and the
//      required promises, and its comment claimed to be "mirroring
//      validate_membrane's DHT-enforced rule (the real enforcement
//      layer, unbypassable by a custom client)" — which was false. The
//      whole "accountable rather than costly" mechanism was a
//      coordinator-side courtesy while being documented as an invariant.
//
// So the bypass cases below are the point. They call create_entry paths
// that a custom client could reach, and assert the INTEGRITY zome
// refuses them — not the form, and not the coordinator's pre-check.
//
// Prereqs: scripts/sandbox.sh start (clean), `npx vite build` in
// mobile-ui/, and a rebuilt/repacked hApp.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
// This directory's own rule is that a harness which has only ever been
// green has not been shown to test anything. Recorded here, rather than
// only in a merged PR, so it is readable at the point someone runs this
// file.
//
//   Regression injected: appending the permanence note AFTER the submit button.
//   Result: one FAIL — but only after this file's check was strengthened. It previously asserted count() === 1, which is presence, not order: the injected regression left it GREEN. Now compared with compareDocumentPosition.
//
// ROW 6.29's duplicate notice, 2026-11-23. FIVE INJECTIONS, AND THE ONE THAT
// PASSED IS THE ONE WORTH READING.
//
//   A — the notice appended AFTER the submit button. 1 red, the ordering
//   check. Same argument as the permanence note above it: a warning that a
//   domain already exists is worthless below the button that founds it.
//
//   B — `loadClaims(domain, true)`, the `fromTheBox` trap. 1 red. The
//   instructive part is HOW it failed: the browse box came back EMPTY rather
//   than holding the typo, because the typo lives in the FOUNDING form's box
//   and `fromTheBox` only suppresses seeding the browse one. Same defect
//   class, different surface — `browse-states.mjs` §6d exists because this
//   shipped once on the browse side.
//
//   C — the exact-duplicate branch removed, leaving only near misses. 2 red,
//   and the state it reported was `none`: "No FOUNDED domain uses this name"
//   about a domain that is founded. BOTH NEAR-MISS CHECKS STAYED GREEN, which
//   is why exact and near are asserted as a pair rather than as one notice.
//
//   D — the `membranesLoaded` in-flight guard deleted, so an unread list
//   answers "no duplicate". **IT PASSED. All 26 checks green.** The harness
//   waited for any state other than `checking` and the read had always landed
//   by the time Playwright finished typing, so the guard's removal changed
//   nothing this file could see — a guard that is not gated. Fixed by adding
//   `__stallZome`, which delays the read instead of failing it and makes the
//   in-flight window wide enough to observe: **now 4 red**, and the logged
//   state sequence goes `empty → none` where it should read
//   `empty → checking → none`.
//
//   AND D CAUGHT A SECOND DEFECT IN THIS FILE'S OWN CHECKS. The sequence
//   ordering was `indexOf('checking') < indexOf('none')`, which is not an
//   assertion: with the in-flight state gone `indexOf` returns -1, and -1 is
//   below every real index, so that check PASSED on the injection the three
//   beside it caught. Both indices are pinned now. `agent-sdk`'s CP injection
//   records the same shape.
//
//   E — the value-restore repaint removed (`captureFieldValues` no longer
//   dispatches `input`). 2 red and a FATAL the first time, because an
//   injection that detaches the way-out button turned the next click into an
//   uncaught timeout and killed the run before four later checks it never
//   touched. Guarded: 4 red and the run completes.
//
// TWO DEFECTS IN THIS HARNESS WERE FOUND BY RUNNING IT TWICE, which nothing
// had ever done — CI gives each harness a clean conductor. See the wait above
// the membrane-card check: it waited for `[data-testid="membrane-card"]` with
// no filter, which on a clean conductor is accidentally the same event as
// "the domain I just founded appeared" and on a reused one is satisfied
// instantly by an older run's card. Measured: 0 cards matching this run's
// domain, with the content checks green or red depending on how the race
// landed. Anchored to the domain under test, it is green three runs in a row
// on a dirty conductor.
//
// Re-check it the same way if you change what this file asserts: inject,
// watch it go red, restore, watch it go green.
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { CHROMIUM } from './chromium.mjs';

const requireFromUi = createRequire(new URL('../../mobile-ui/package.json', import.meta.url));
let chromium;
try {
  ({ chromium } = requireFromUi('playwright'));
} catch {
  console.error('Could not resolve playwright from mobile-ui/. Run: cd mobile-ui && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install');
  process.exit(1);
}

const ADMIN_URL = 'ws://localhost:8889';
const APP_URL = 'ws://localhost:8888';
const APP_ID = 'epistemic-resonance-happ';
const PREVIEW_PORT = 4177;
const DOMAIN = `Founded${Date.now()}`;

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

async function zomeConnection() {
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: APP_ID });
  const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      // CellInfo became a discriminated union in @holochain/client
      // 0.21 ({ type, value }); it used to be keyed by cell type. The
      // old `CellType.Provisioned in cell` test matches nothing against
      // the new shape, silently yielding no cell ids at all.
      if (cell?.type === CellType.Provisioned || cell?.type === CellType.Cloned) {
        cellIds.push(cell.value.cell_id);
      }
    }
  }
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  const me = cellIds[0][1];
  const call = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { app, admin, me, call };
}

async function main() {
  log('Starting vite preview (production bundle) ...');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: new URL('../../mobile-ui/', import.meta.url).pathname, stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 4000));

  const browser = await chromium.launch({ executablePath: CHROMIUM });
  // INSTRUMENTS, PORTED FROM `founding-is-findable.mjs` — the sibling harness
  // that already learned why they are needed, and added here because row
  // 6.29's duplicate notice has the same four states as the notice that file
  // gates, and the same two of them are unreachable from the ordinary path.
  //
  //   __noticeStates — the SEQUENCE of states the notice passed through. A
  //   final state is observable by reading the DOM; a state that was only
  //   ever displayed in passing is not, and the in-flight one is exactly
  //   that. Recorded through a MutationObserver because this app rebuilds
  //   its DOM wholesale and the element is a new node each time.
  //
  //   __failZome — makes a matching zome call reject at the transport, so a
  //   read FAILURE is driven rather than simulated.
  //
  //   __stallZome — delays a matching call instead of failing it, which is
  //   the one this file could not do without. THE IN-FLIGHT STATE WAS RACED,
  //   MEASURED AND NOT ARGUED: with the notice's `membranesLoaded` guard
  //   deleted, every check in this file still passed, because the harness
  //   waits for a state other than `checking` and the read had always landed
  //   by the time Playwright finished typing. A guard whose removal changes
  //   nothing is not gated. Stalling the read makes the window wide enough to
  //   observe, which turns that injection red.
  const INSTRUMENTS = () => {
    window.__noticeStates = [];
    window.__failZome = null;
    window.__stallZome = null;
    const record = () => {
      const el = document.querySelector('[data-testid="founding-duplicate"]');
      const state = el && el.getAttribute('data-state');
      if (state && window.__noticeStates[window.__noticeStates.length - 1] !== state) {
        window.__noticeStates.push(state);
      }
    };
    const observer = new MutationObserver(record);
    const start = () => {
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      record();
    };
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);

    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      let text = null;
      try {
        let bytes = null;
        if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
        else if (ArrayBuffer.isView(data)) bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        if (bytes) text = new TextDecoder('latin1').decode(bytes);
      } catch { /* observation must never break the page */ }
      if (text && window.__failZome && text.includes(window.__failZome)) {
        throw new Error('injected transport failure');
      }
      if (text && window.__stallZome && text.includes(window.__stallZome.call)) {
        // SENT LATE, NOT DROPPED. The client still gets its answer, so the
        // notice resolves on its own afterwards and the states AFTER the
        // in-flight one stay under test too.
        setTimeout(() => send.call(this, data), window.__stallZome.ms);
        return undefined;
      }
      return send.call(this, data);
    };
  };

  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    // REGISTERED PER PAGE, which is the defect the sibling file recorded
    // paying for: `addInitScript` applies to one Page, so a phase that opens
    // its own page ran against an inert property nobody read and drove no
    // failure at all.
    const openPage = async () => {
      const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
      p.on('pageerror', (e) => errors.push(String(e)));
      await p.addInitScript(INSTRUMENTS);
      return p;
    };
    await page.addInitScript(INSTRUMENTS);
    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });

    log('=== Founding a domain through the UI ===');
    await page.getByRole('button', { name: 'Domains', exact: true }).click();
    await page.getByRole('button', { name: 'Found a domain', exact: true }).click();
    await page.waitForSelector('[data-testid="founding-form"]', { timeout: 20000 });

    // The two commitments are kept visibly apart — the mistake this form
    // exists to prevent is conflating what you promise with what you
    // require of others.
    const legends = await page.locator('.founding-form legend').allInnerTexts();
    log(`  fieldsets: ${legends.join(' | ')}`);
    check('the founder\'s promise and the domain\'s demands are separate sections',
      legends.length === 2
      && /what you promise/i.test(legends[0])
      && /asks of participants/i.test(legends[1]));
    // ORDER, not merely presence. This check used to assert count() === 1,
    // which is what its own label says it is NOT checking: a note moved
    // below the submit button still counts 1, and the warning then
    // arrives after the irreversible act rather than before it. Caught by
    // deliberately deferring the note's append and watching this stay
    // green — the negative-evidence pass this suite's own convention asks
    // for. compareDocumentPosition is used rather than reading offsets,
    // so it is unaffected by layout, wrapping or viewport size.
    const permanenceBeforeButton = await page.evaluate(() => {
      const note = document.querySelector('[data-testid="permanence-note"]');
      const btn = document.querySelector('[data-testid="founding-submit"]');
      if (!note || !btn) return false;
      // DOCUMENT_POSITION_FOLLOWING (4) means btn comes after note.
      return (note.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    check('permanence is stated before the button, not confirmed after it',
      permanenceBeforeButton);

    // --- ROW 6.29: the duplicate notice ------------------------------
    // SAME ORDERING ARGUMENT AS THE PERMANENCE NOTE ABOVE, and it is the
    // check most likely to catch a real regression: a warning that a
    // domain already exists is worthless below the button that founds it.
    const duplicateBeforeButton = await page.evaluate(() => {
      const note = document.querySelector('[data-testid="founding-duplicate"]');
      const btn = document.querySelector('[data-testid="founding-submit"]');
      if (!note || !btn) return false;
      return (note.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    check('the duplicate notice is above the founding button',
      duplicateBeforeButton);

    const dupState = () => page.locator('[data-testid="founding-duplicate"]')
      .getAttribute('data-state');
    const dupText = () => page.locator('[data-testid="founding-duplicate"]').innerText();

    // An empty box says nothing. Asserted so that "says nothing" cannot
    // later be how a real finding is expressed.
    check('an empty domain box makes no claim about duplicates',
      await dupState() === 'empty' && (await dupText()).trim() === '');

    await page.locator('[data-testid="founding-domain"]').fill(DOMAIN);
    // The Domains tab may not have read membranes yet, in which case the
    // notice says so and reads once. Either way it must not rest in
    // `checking`, which would leave the reader with no answer at all.
    await page.waitForFunction(() => {
      const s = document.querySelector('[data-testid="founding-duplicate"]')?.dataset.state;
      return s && s !== 'checking';
    }, null, { timeout: 20000 }).catch(() => {});
    log(`  unfounded name: [${await dupState()}] ${await dupText()}`);
    // ANCHORED TO THE TEXT EXISTING, not merely to the state. A notice that
    // renders an empty paragraph would satisfy the state assertion alone and
    // tell the reader nothing — the vacuous-green shape 6.23's session paid
    // for by making a wait tolerant and watching a negative check pass
    // against an empty string.
    check('a name nobody founded reports that, in words',
      await dupState() === 'none' && /no FOUNDED domain/i.test(await dupText()));
    check('no "load existing" button when there is nothing to load',
      await page.locator('[data-testid="founding-duplicate-load"]').isVisible() === false);

    // ROW 6.29's SECOND HALF, BUILT 2026-11-26 — the closest founded names,
    // which answer what the notice above cannot: "spelt differently" is
    // invisible to a fold that only touches capitals and spacing.
    //
    // THE STATE AND THE WORDS, both, for the reason the check above this one
    // gives: a paragraph that renders empty satisfies a state assertion and
    // tells the reader nothing. And silence is not a state here either — with
    // nothing founded it must SAY nothing is founded.
    const closeState = () => page.locator('[data-testid="founding-closest"]')
      .getAttribute('data-state');
    const closeText = () => page.locator('[data-testid="founding-closest"]').innerText();
    await page.waitForFunction(() => {
      const s = document.querySelector('[data-testid="founding-closest"]')?.dataset.state;
      return s && s !== 'checking';
    }, null, { timeout: 20000 }).catch(() => {});
    log(`  closest: [${await closeState()}] ${await closeText()}`);
    check('a typed name always gets an answer about nearby founded names, in words',
      ['listed', 'covered', 'no-domains'].includes(await closeState())
      && (await closeText()).trim().length > 0);
    // INVARIANT 5 AS A TEST, not as a sentence in a row. "Every domain is a
    // sovereign membrane" forbids subordinating a new founder to whoever
    // founded first, so this list may never gate the button. A future version
    // that disabled submit on a near name would pass every other check here.
    check('the closest list blocks nothing — the founding button stays enabled',
      await page.locator('[data-testid="founding-submit"]').isEnabled() === true);
    // AND IT NEVER CALLS ANYTHING A DUPLICATE, which is the constraint the
    // 2026-11-26 sweep derived from Invariants 2 and 10: the protocol cannot
    // hold the identity that word asserts, because `get_claims_by_domain`
    // hashes the raw string. `domain-proximity-check.mjs` gates the ordering;
    // this gates the wording, and neither sees the other's half.
    check('and it never uses the word duplicate, or says these names are the same',
      !/duplicate|same domain|is the same/i.test(await closeText()));

    // Incomplete founding is refused with a usable message.
    await page.locator('[data-testid="founding-submit"]').click();
    const err = await page.locator('[data-testid="founding-error"]').innerText();
    log(`  incomplete: ${err}`);
    check('founding without promises is refused', /at least one promise/i.test(err));

    await page.locator('[data-testid="founder-promise"]').fill('distinguish observation from inference');
    await page.locator('[data-testid="founding-description"]').fill('Seeded by the founding-flow verification.');
    await page.locator('[data-testid="founding-required"]').fill('distinguish observation from inference\ndisclose funding');
    await page.locator('[data-testid="founding-submit"]').click();

    // WAITS FOR *THIS* DOMAIN'S CARD, NOT FOR A MEMBRANE CARD.
    //
    // It used to wait for `[data-testid="membrane-card"]` with no filter, and
    // that was vacuous in the one condition nobody had run it in. On a clean
    // conductor no card exists, so "a membrane card appeared" and "the domain
    // I just founded appeared" are accidentally the same event and the wait
    // worked for a reason nobody chose. Run a SECOND time against the same
    // conductor — which this file now does, having gained a phase that needs
    // a founded domain to exist — and an EARLIER run's card satisfies the
    // wait immediately, so the harness raced the founding it was supposed to
    // be waiting for. Measured, not reasoned: 0 cards matching this run's
    // domain, with the count check red and the card-content checks green or
    // red depending on how the race landed.
    //
    // This is the suite's own recorded family — a wait satisfied by the wrong
    // thing — and the fix is the same one every other instance got: anchor it
    // to the specific thing under test.
    const card = page.locator('[data-testid="membrane-card"]').filter({ hasText: DOMAIN });
    await card.first().waitFor({ state: 'visible', timeout: 25000 });
    // THE FIGURE IS LOGGED BECAUSE THE CHECK IS AN EQUALITY, and an equality
    // that fails tells you nothing about which side moved. Added after this
    // check went red on a SECOND run against the same conductor while every
    // assertion about the card's contents stayed green — which only happens
    // when the count is above one.
    log(`  membrane cards matching ${DOMAIN}: ${await card.count()}`);
    check('the founded domain appears in the list', await card.count() === 1);
    const promises = await card.locator('[data-testid="required-promises"]').innerText();
    log(`  required promises: ${promises.replace(/\n/g, ' | ')}`);
    check('both required promises were recorded',
      /distinguish observation/.test(promises) && /disclose funding/.test(promises));

    // A domain founded moments ago has no discourse, so nothing can have
    // drifted from practice. This warned on every new domain until
    // discourse_ratio stopped collapsing "no critiques at all" and
    // "abstract discourse with nothing embodied" into one sentinel.
    check('a brand-new domain does NOT warn about drifting from practice',
      await card.locator('[data-testid="health-warning"]').count() === 0);

    // --- ROW 6.29, the half that needed a founded domain to exist ----
    // Reopened rather than kept open: founding closes the form, so this is
    // also the path a reader takes when they come back to found a second
    // domain — which is exactly when they are most likely to retype a name
    // they already own.
    log('\n=== A domain that already exists is said so BEFORE founding ===');
    await page.getByRole('button', { name: 'Found a domain', exact: true }).click();
    await page.waitForSelector('[data-testid="founding-form"]', { timeout: 20000 });

    await page.locator('[data-testid="founding-domain"]').fill(DOMAIN);
    await page.waitForFunction(() => {
      const s = document.querySelector('[data-testid="founding-duplicate"]')?.dataset.state;
      return s && s !== 'checking';
    }, null, { timeout: 20000 }).catch(() => {});
    log(`  exact: [${await dupState()}] ${await dupText()}`);
    check('the exact name already founded is reported as already founded',
      await dupState() === 'exact' && /ALREADY FOUNDED/.test(await dupText()));
    // SAYS WHAT THE SECOND FOUNDING WOULD COST, because nothing refuses it:
    // no layer checks uniqueness, so two entries for one name is a real
    // outcome and the notice is the only place it is stated.
    check('it says a second founding leaves two entries rather than replacing one',
      /two\s+entries/i.test(await dupText()));

    // THE CASE VARIANT — the report this row came from. Differs from the
    // founded name in capitals only, so `get_claims_by_domain` hashes a
    // different path and the two can never see each other.
    const variant = DOMAIN.charAt(0).toLowerCase() + DOMAIN.slice(1);
    check('the variant really is a different string', variant !== DOMAIN);
    await page.locator('[data-testid="founding-domain"]').fill(variant);
    await page.waitForFunction(() => {
      const s = document.querySelector('[data-testid="founding-duplicate"]')?.dataset.state;
      return s && s !== 'checking';
    }, null, { timeout: 20000 }).catch(() => {});
    log(`  near: [${await dupState()}] ${await dupText()}`);
    check('a name differing only in capitals is reported as a near miss',
      await dupState() === 'near' && /SECOND domain/.test(await dupText()));

    // THE CLASS THE OLD FOLD COULD NOT SEE, and the one actually reported:
    // a plural is not a capitals-or-spacing difference, so the notice above
    // correctly says nothing about it. The closest list is where it surfaces.
    await page.locator('[data-testid="founding-domain"]').fill(`${DOMAIN}s`);
    await page.waitForFunction(() => {
      const s = document.querySelector('[data-testid="founding-closest"]')?.dataset.state;
      return s && s !== 'checking';
    }, null, { timeout: 20000 }).catch(() => {});
    log(`  plural: dup=[${await dupState()}] closest=[${await closeState()}] ${await closeText()}`);
    check('a plural of a founded name is NOT caught by the capitals-and-spacing notice',
      await dupState() === 'none');
    check('but the founded name is listed as the nearest one, by name',
      await closeState() === 'listed' && (await closeText()).includes(DOMAIN));
    // NAMES THE FOUNDED STRING, NOT THE TYPED ONE. Echoing what the reader
    // typed would be this row's own confusion rebuilt: the whole value is
    // telling them which string reaches the claims.
    // GUARDED, AND THE GUARD IS NOT TIDINESS. An injection that leaves this
    // button absent or detached turned the next click into an uncaught
    // timeout, which killed the run before the in-flight and failed-read
    // phases below and before the accountability section — so a real
    // regression here would have hidden four checks it never touched.
    // `agent-sdk`'s E injection records the same trade: crash once, guard,
    // and get reds with a complete run instead.
    const goBtn = page.locator('[data-testid="founding-duplicate-load"]');
    const goPresent = await goBtn.isVisible().catch(() => false);
    check('the way out is offered rather than left as a sentence', goPresent);
    const goLabel = goPresent ? await goBtn.innerText() : '';
    log(`  button: ${goPresent ? goLabel : '(absent)'}`);
    check('the way out names the founded string, not the typo',
      goPresent && goLabel.includes(DOMAIN) && !goLabel.includes(variant));

    // AND IT ACTUALLY GOES THERE. A button whose handler is wrong fails no
    // assertion above; this one leaves the tab and loads the real domain.
    if (goPresent) await goBtn.click({ timeout: 10000 }).catch(() => {});
    await page.waitForSelector('[data-testid="browse-domain-input"]', { timeout: 20000 })
      .catch(() => {});
    await page.waitForTimeout(3000);
    // THE INPUT IS THE ASSERTION, because `loadClaims` seeds `domainDraft`
    // with the domain it loaded whenever `fromTheBox` is false — so the box
    // holding the FOUNDED string is evidence the right domain was opened AND
    // that the typo did not travel with the reader. THE SAME DEFECT WAS
    // SHIPPED ONCE ON THE BROWSE SIDE: `browse-states.mjs` §6d exists because
    // the first version of 6.27's button passed `fromTheBox = true`, loaded
    // the right domain and left the wrong string on screen. Read as a value
    // rather than waited for, so a handler that never fired fails here
    // instead of timing out into a tolerated pass.
    // A SENTINEL RATHER THAN A THROW, and it cannot equal the domain: the
    // tolerated waits above exist so an injection reports instead of
    // aborting, and a tolerated wait whose read then throws has just moved
    // the crash. Nothing here can turn an absent box into a pass.
    const landedOn = await page.locator('[data-testid="browse-domain-input"]')
      .inputValue().catch(() => '(no browse box)');
    log(`  landed on: ${landedOn}`);
    check('the way out opens the founded domain, with the typo gone',
      landedOn === DOMAIN);
    check('taking the way out closes the founding form',
      await page.locator('[data-testid="founding-form"]').count() === 0);

    // --- ROW 6.29: the two states the ordinary path never reaches ----
    // SILENCE IS NEVER HOW "NO DUPLICATE" IS EXPRESSED, and these are the
    // two cases where it would be. `membranes` empty means "nothing founded"
    // OR "nobody asked" OR "the asking failed", and only the first of those
    // three is a finding. Each is driven on its own page, because each needs
    // a conductor read this run has not already performed.
    log('\n=== A read still in flight, and a read that failed ===');

    const openForm = async (p, name) => {
      await p.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
      await p.getByRole('button', { name: /connect/i }).first().click();
      await p.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });
      await p.getByRole('button', { name: 'Domains', exact: true }).click();
      await p.getByRole('button', { name: 'Found a domain', exact: true }).click();
      await p.waitForSelector('[data-testid="founding-form"]', { timeout: 20000 });
      await p.locator('[data-testid="founding-domain"]').fill(name);
    };

    // A NAME NOBODY FOUNDED, so the state this resolves to is the one whose
    // premature appearance is the defect: a stalled read that says `none` is
    // telling the reader there is no duplicate before it has looked.
    const stalled = await openPage();
    await stalled.addInitScript(() => {
      window.__stallZome = { call: 'get_membranes', ms: 9000 };
    });
    await openForm(stalled, `${DOMAIN}Stalled`);
    const stalledState = await stalled.locator('[data-testid="founding-duplicate"]')
      .getAttribute('data-state');
    const stalledText = await stalled.locator('[data-testid="founding-duplicate"]').innerText();
    log(`  in flight: [${stalledState}] ${stalledText}`);
    check('a read still in flight says so rather than reporting no duplicate',
      stalledState === 'checking');
    check('and it makes no claim about duplicates while it waits',
      !/no FOUNDED domain/i.test(stalledText));
    // THE STALL DELAYS AND DOES NOT DROP, so the states after the in-flight
    // one stay under test — without this the instrument could be hiding a
    // notice that never resolves at all, which is 6.25's family and the
    // exact hole the sibling harness found in its own error branch.
    // TOLERATED SO THAT THE SEQUENCE CHECKS BELOW DO THE REPORTING. A notice
    // that never resolves is a FINDING here, not a reason to abort — and it
    // is a reachable one: with the value-restore repaint removed, the rebuild
    // that follows the read landing leaves the box full and the notice
    // reading `empty`, so this wait times out and the three checks below name
    // what happened.
    await stalled.waitForFunction(() => {
      const s = document.querySelector('[data-testid="founding-duplicate"]')?.dataset.state;
      return s && s !== 'checking' && s !== 'empty';
    }, null, { timeout: 25000 }).catch(() => {});
    const settledStates = await stalled.evaluate(() => window.__noticeStates);
    log(`  states: ${settledStates.join(' → ')}`);
    check('the in-flight state was passed THROUGH, not rested in',
      settledStates.includes('checking') && settledStates.includes('none'));
    // BOTH INDICES PINNED, because the first version of this check was
    // `indexOf('checking') < indexOf('none')` and that is not an assertion:
    // with the in-flight state gone `indexOf` returns -1, and -1 is less
    // than every real index, so the check PASSED on the injection the three
    // above it caught. Measured, not spotted by reading — `agent-sdk`'s CP
    // injection records the same shape, an equality between two values that
    // can both be absent.
    check('and `checking` came before the answer',
      settledStates.indexOf('checking') >= 0
      && settledStates.indexOf('none') > settledStates.indexOf('checking'));
    await stalled.close();

    // A READ THAT FAILED. Driven at the transport rather than simulated,
    // so this is the conductor genuinely not answering.
    const failed = await openPage();
    await failed.addInitScript(() => { window.__failZome = 'get_membranes'; });
    await openForm(failed, `${DOMAIN}Failed`);
    const failedState = await failed.locator('[data-testid="founding-duplicate"]')
      .getAttribute('data-state');
    const failedText = await failed.locator('[data-testid="founding-duplicate"]').innerText();
    log(`  failed: [${failedState}] ${failedText}`);
    check('a failed read says the check could not be made',
      failedState === 'unknown');
    // THE CHECK THAT MATTERS MOST IN THIS FILE. A failed read rendering as
    // "no duplicate" is the whole defect class: the reader founds a second
    // domain on the strength of an answer nobody gave.
    check('a failed read NEVER reports that no duplicate exists',
      !/no FOUNDED domain/i.test(failedText));
    check('and it says nothing either way, in words',
      /either way/i.test(failedText));
    await failed.close();

    check('no uncaught page errors', errors.length === 0);
    if (errors.length) log(`  errors: ${errors.join(' | ')}`);

    if (process.env.FOUNDING_SCREENSHOT) {
      await page.screenshot({ path: process.env.FOUNDING_SCREENSHOT, fullPage: true });
      log(`  screenshot written to ${process.env.FOUNDING_SCREENSHOT}`);
    }
  } finally {
    await browser.close();
    preview.kill();
  }

  // --- The part that matters: is the accountability actually enforced?
  log('\n=== Accountability is DHT-enforced, not the form\'s courtesy ===');
  const { app, admin, me, call } = await zomeConnection();
  try {
    const constitution = await call('publish_constitution', {
      agent: me,
      promises: [{ action: 'state my sources', domain: 'BypassProbe', modality: null }],
      conditions: [], published_at: Math.floor(Date.now() / 1000), expires_at: null,
    });

    // 1. No required promises. The coordinator refuses this too, so the
    // interesting question is whether the INTEGRITY zome does — which is
    // what a client bypassing create_membrane would meet.
    let refused = null;
    try {
      await call('attempt_unaccountable_membrane', {
        domain: 'BypassProbeA', description: 'no demands stated',
        required_promises: [], validation_rules_hash: null,
        creator: me, created_at: Math.floor(Date.now() / 1000), constitution,
      });
    } catch (e) { refused = String(e?.data?.data ?? e?.message ?? e); }
    check('a domain declaring nothing of its participants is refused', refused !== null);
    check('  ...by DHT VALIDATION, not the coordinator pre-check',
      /InvalidCommit|Validation failed/i.test(refused ?? ''));
    log(`  ${refused?.slice(0, 150)}`);

    // 2. A constitution hash that resolves to something that is not a
    // Constitution. This is the case that had NO DHT-side check at all
    // before this change.
    const claimHash = await call('create_claim', {
      content: 'Not a constitution.', domain: 'BypassProbe', author: me,
      timestamp: Date.now() * 1000, evidence_hashes: [],
      confidence: 'Tentative', semantic_tags: [], source_mew: null,
    });
    let refusedB = null;
    try {
      await call('attempt_unaccountable_membrane', {
        domain: 'BypassProbeB', description: 'constitution points at a claim',
        required_promises: ['something'], validation_rules_hash: null,
        creator: me, created_at: Math.floor(Date.now() / 1000), constitution: claimHash,
      });
    } catch (e) { refusedB = String(e?.data?.data ?? e?.message ?? e); }
    check('a constitution hash pointing at a non-Constitution is refused', refusedB !== null);
    check('  ...by DHT VALIDATION, not the coordinator pre-check',
      /InvalidCommit|Validation failed/i.test(refusedB ?? ''));
    log(`  ${refusedB?.slice(0, 150)}`);
  } finally {
    try { await app.client?.close?.(); } catch { /* best effort */ }
    try { await admin.client?.close?.(); } catch { /* best effort */ }
  }

  log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
