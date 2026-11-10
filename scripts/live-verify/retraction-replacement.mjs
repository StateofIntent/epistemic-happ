#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/retraction-replacement.mjs — a retraction can name what
// replaced it, and a reader can follow it. Open-work 6.14, the `[M]` half.
//
// WHY THIS EXISTS, and it was found by driving the pilot rather than by
// reading the file. `Retraction.replacement_claim` is `Option<EntryHash>` —
// *"Optional: what I believe now"* — and `renderRetractForm` passed `null` as
// a LITERAL. So an author who retracts because somebody changed their mind,
// and who immediately publishes the narrower claim that survives, had no way
// to attach the second to the first: the relationship existed only as prose
// inside the reason string, where nothing can traverse it. The pilot's first
// real retraction did exactly that — *"I am republishing it as: …"*.
//
// AND IT COMPLETES A GAP SPEC HALF-RECORDED. `RetractionToReplacement` was
// split out of `ClaimToRetraction` at `protocol_version: 5`, and SPEC §4 said
// of it *"read by nothing yet"*. The honest statement was stronger: it was
// written by nothing REACHABLE either, so the link type had no producer and
// no consumer, and a reader of §4 would reasonably conclude the write half
// was done. This harness covers BOTH halves on purpose — a producer with no
// reader is the same defect wearing the other shoe.
//
// WHAT IS UNDER TEST IS THE FIELD, NOT THE ORDER. 6.14's `[D]` is untouched
// and is deliberately visible in §2 below: a replacement must exist BEFORE a
// retraction can name it, which inverts the order an author actually works in
// — they realise they were wrong first. Composing both entries in one act is
// a write of two permanent entries that can half-fail with no transaction,
// and the alternative is a later claim pointing BACK, a different link and a
// different entry. §2 asserts that the form SAYS this to an author who has
// nothing to point at, rather than that it solves it.
//
// THE FIXTURE DEPENDENCY THAT MAKES §2 CAPABLE OF BEING VACUOUS, stated
// loudly because it is invisible otherwise: *"you have not published anything
// else yet"* is a claim about the author's WHOLE SOURCE CHAIN, not about this
// domain. On a dirty sandbox the agent has claims from previous runs, the
// picker offers them, and every assertion in §2 silently tests nothing. So §2
// opens by reading the chain and requiring exactly one claim on it. If that
// control is red, the run is telling you the sandbox was not clean — not that
// the screen is wrong.
//
// Prereqs: a CLEAN sandbox (scripts/sandbox.sh clean && scripts/sandbox.sh
// start) and a UI build — scripts/pack-webhapp.sh does both in the right
// order. A stale `dist/` means you are verifying the previous version of the
// UI and everything here will pass.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — watched failing five ways, and ONE OF THEM MEASURED A
// PROTOCOL GAP THIS FILE HAD ONLY REASONED ABOUT. 36 checks green on a live
// conductor; every figure below is a real run.
//
//   A. THE ROW UNDONE — `replacement_claim` back to a literal `null`.
//   8 red. §2 and §3 stayed green throughout and correctly so: the picker
//   still renders and still offers the right claims, and only the WRITE is
//   broken, which is the localisation this file is shaped to give.
//
//   B. THE WRITE HALF ONLY — the banner's replacement line suppressed, so
//   the entry is written correctly and nothing reads it. 6 red, all of them
//   in §5, with §4's independent DHT read green. That split is the point: a
//   producer with no reader is the same defect wearing the other shoe, and
//   without §5 this file would have certified it.
//
//   C. THE STALENESS BUG RESTORED — the picker's load put back behind a
//   `=== null` guard, so it reads the author's claims once per page rather
//   than once per form opening. 12 RED, THE MOST OF ANY INJECTION, because
//   it cascades: no option to choose, so no replacement written, so nothing
//   for the read half to show. This is the defect found while writing the
//   feature, and the figure is why the fix is not cosmetic.
//
//   D. THE SELF-REPLACEMENT GUARD REMOVED. Exactly 2 red — and the SECOND
//   one is a measurement rather than a regression: *"and nothing permanent
//   was written"* went red, meaning the conductor ACCEPTED a retraction
//   naming itself as its own replacement. The claim that
//   `validate_retraction` permits this was read off the integrity zome and
//   is now observed: a loop was committed to a real chain. That is the
//   evidence behind the observation filed on 6.14, and it is the reason the
//   client guard is not belt-and-braces.
//
//   E. THE EMPTY STATE SILENCED — `replacement-none-available` renamed, so
//   an author with nothing to point at gets a picker that is simply absent.
//   3 red. The form still works and still writes correctly; what is lost is
//   the only place this UI tells anyone which order the two entries have to
//   be published in, which is 6.14's `[D]` made visible.
//
// IN EVERY ONE OF A, B AND C THE TWO CONTROLS WENT RED TOO — *the observer
// saw the line at all* and *the claim that DID name one still draws its
// line* — while the absence checks they protect stayed green. That is the
// mechanism working rather than noise: with no replacement anywhere, *the
// picker does not offer the retracted claim* and *a replacement-less
// retraction draws no line* are both true of a screen that can no longer
// fail them, and the controls are what say so.
//
// This directory's rule is that a harness which has only ever been green has
// not been shown to test anything.
//
// Two shapes to keep in mind if you change what this asserts:
//
//   1. EVERY "X IS NOT SHOWN" CHECK HERE PASSES VACUOUSLY IF THE FORM NEVER
//   RENDERED. *The picker does not offer the claim being retracted* and *a
//   replacement-less retraction draws no replacement line* are both true of
//   a blank screen. Each is therefore paired with the positive control that
//   makes it capable of failing — the picker offers the OTHER claim, and the
//   retraction that DOES name a replacement does draw the line.
//
//   2. THE REPLACEMENT LINE'S STATES RACE THE READ. `ready` and `reading`
//   and `absent` are three sentences about one hash, and a sampled check
//   after the read has landed cannot tell "it was never wrong" from "it was
//   wrong and corrected itself". So §4 records every `data-state` the line
//   ever carried with a MutationObserver and asks what was EVER displayed —
//   the technique that caught an unasked read rendered as a zero in 6.13 and
//   again in the applet asset surface.
// ---------------------------------------------------------------------------

import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { decode } from '@msgpack/msgpack';
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
const ROLE = 'epistemic';
const ZOME = 'epistemic_coordinator';
const PREVIEW_PORT = 4187;

const STAMP = Date.now();
const DOMAIN = `Retract${STAMP}`;
// The pilot's own shape: a broad claim withdrawn in favour of a narrower one.
const BROAD = 'Every measurement in this repository was taken on a clean sandbox.';
const NARROW = 'Every measurement in this repository names the conductor it ran against.';
const UNREPLACED = 'A claim withdrawn with nothing offered in its place.';

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};

const nowMicros = () => Date.now() * 1000;
const b64 = (u8) => Buffer.from(u8).toString('base64');

// Nothing here touches an element without asking whether it is there. The
// applet-view harness paid for this rule the hard way: its first injection run
// died on `locator.fill` against an element the defect removes, reporting six
// reds and taking five passes with it, so the run read as a harness bug rather
// than a product defect. A gate that crashes on what it guards counts nothing.
const tryAct = async (fn) => { try { await fn(); return true; } catch { return false; } };
const countOf = (page, sel) => page.locator(sel).count();
const fillIfThere = (page, sel, v) => tryAct(async () => {
  if (await countOf(page, sel) === 0) throw new Error(`absent: ${sel}`);
  await page.locator(sel).first().fill(v);
});
const clickIfThere = (page, sel) => tryAct(async () => {
  if (await countOf(page, sel) === 0) throw new Error(`absent: ${sel}`);
  await page.locator(sel).first().click();
});
const clickByName = (page, name) => tryAct(async () => {
  const b = page.getByRole('button', { name }).first();
  if (await b.count() === 0) throw new Error(`absent button: ${name}`);
  await b.click();
});
const textIfThere = async (page, sel) => {
  try {
    if (await countOf(page, sel) === 0) return '';
    return await page.locator(sel).first().innerText();
  } catch { return ''; }
};

async function connectApp(admin) {
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: APP_ID, single_use: false });
  const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions: { origin: 'live-verify' } });
  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      if (cell?.type === CellType.Provisioned || cell?.type === CellType.Cloned) {
        cellIds.push(cell.value.cell_id);
      }
    }
  }
  if (cellIds.length === 0) throw new Error('no provisioned cells');
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  const call = (fn, payload) =>
    app.callZome({ role_name: ROLE, zome_name: ZOME, fn_name: fn, payload });
  return { app, me: cellIds[0][1], call };
}

const publish = (agent, content) => agent.call('create_claim', {
  content, domain: DOMAIN, confidence: 'Moderate', semantic_tags: [],
  author: agent.me, timestamp: nowMicros(), evidence_hashes: [], attestation_policy: null,
});

/** `create_claim` returns an ActionHash and `replacement_claim` is an
 *  EntryHash, so the entry hashes are read back off the records rather than
 *  taken from the write. Same reason `own-critiques.mjs` does it. */
async function ownClaims(agent) {
  const records = await agent.call('get_claims_by_agent', agent.me);
  return records.map((r) => {
    const raw = r.entry?.Present?.entry ?? r.entry;
    return {
      content: decode(raw)?.content ?? '',
      entryHash: r.signed_action.hashed.content.data.entry_hash,
    };
  });
}

/** The retraction as the DHT holds it, decoded — this is the independent read
 *  that makes the on-screen assertions mean something. */
async function retractionsOf(agent, claimEntryHash) {
  const records = await agent.call('get_retractions_for_claim', claimEntryHash);
  return records.map((r) => decode(r.entry?.Present?.entry ?? r.entry));
}

async function main() {
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions: { origin: 'live-verify' } });
  const agent = await connectApp(admin);

  log(`Publishing the broad claim in ${DOMAIN} ...`);
  await publish(agent, BROAD);

  log('Starting vite preview (the same bundle pack-webhapp.sh zips) ...');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: new URL('../../mobile-ui/', import.meta.url).pathname, stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 4000));

  const browser = await chromium.launch({ executablePath: CHROMIUM });
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 980 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    // Records every `data-state` the replacement line ever carried. See
    // negative-evidence note 2: the three states race the read, and a
    // sampled check cannot tell "never wrong" from "wrong and self-corrected".
    await page.addInitScript(() => {
      window.__lineStates = [];
      const note = (root) => {
        if (root.nodeType !== 1) return;
        const seen = root.matches?.('[data-testid="replacement-line"]') ? [root] : [];
        seen.push(...root.querySelectorAll('[data-testid="replacement-line"]'));
        for (const el of seen) window.__lineStates.push(el.dataset.state ?? '(none)');
      };
      const start = () => {
        note(document.documentElement);
        new MutationObserver((rs) => { for (const r of rs) r.addedNodes.forEach(note); })
          .observe(document.documentElement, { childList: true, subtree: true });
      };
      if (document.documentElement) start();
      else document.addEventListener('readystatechange', start, { once: true });
    });

    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
    await fillIfThere(page, 'input[name="adminUrl"]', ADMIN_URL);
    await fillIfThere(page, 'input[name="appUrl"]', APP_URL);
    await clickByName(page, 'Connect');
    let connected = await tryAct(() => page.waitForSelector('[data-testid="friction-meter"]', { timeout: 30000 }));
    check('the UI connected to the conductor', connected);

    const loadDomain = async () => {
      await fillIfThere(page, '[data-testid="browse-domain-input"]', DOMAIN);
      await clickByName(page, 'Load claims');
      await page.waitForTimeout(2500);
    };
    await loadDomain();

    // =====================================================================
    log('\n=== 1. The form offers the field at all ===');
    {
      const opened = await clickIfThere(page, '[data-testid="retract-toggle"]');
      check('the retract form opens on the author\'s own claim', opened
        && await countOf(page, '[data-testid="retract-form"]') === 1);
      // FIRST, because every absence below it passes vacuously against a form
      // that never rendered.
      let picker = await tryAct(() => page.waitForSelector('[data-testid="replacement-picker"]', { timeout: 15000 }));
      check('the picker names itself, so the absences below can fail', picker);
      check('and the reason box is still there and still the required field',
        await countOf(page, '[data-testid="retract-reason"]') === 1);
    }

    // =====================================================================
    log('\n=== 2. With nothing to point at, the form says WHY — 6.14\'s [D], visible ===');
    {
      // THE CONTROL THAT MAKES THIS SECTION NON-VACUOUS. "You have not
      // published anything else" is about the whole source chain, so on a
      // dirty sandbox the picker legitimately offers old claims and every
      // assertion here tests nothing. A red here means the sandbox was not
      // clean.
      const mine = await ownClaims(agent);
      check(`CONTROL: the author's chain holds exactly one claim (${mine.length})`, mine.length === 1);
      check('so the picker offers no select at all',
        await countOf(page, '[data-testid="replacement-select"]') === 0);
      check('and says so in its own element rather than by being empty',
        await countOf(page, '[data-testid="replacement-none-available"]') === 1);
      const words = await textIfThere(page, '[data-testid="replacement-none-available"]');
      // The row's open decision, said to the author. Not "you cannot" — the
      // ORDER, which is the surprising part and is what they need to act.
      check('naming the order a replacement has to be published in',
        /before a retraction can name it/i.test(words));
      check('and saying a retraction with no replacement is still complete',
        /complete act on its own/i.test(words));
      check('without claiming the protocol forbids it', !/cannot retract|not allowed/i.test(words));
    }

    // =====================================================================
    log('\n=== 3. The picker refreshes, and offers the right claims ===');
    {
      // Cancel, publish the narrower claim, reopen. THIS IS A REGRESSION
      // TEST FOR A DEFECT FOUND WHILE WRITING THIS FEATURE: the first
      // version loaded the author's claims once, behind a `=== null` guard,
      // so a form opened before the replacement was published kept offering
      // the list from before it existed. 6.16's rule — re-read, never append
      // locally — in a second place.
      await clickIfThere(page, '[data-testid="retract-toggle"]');
      await publish(agent, NARROW);
      await clickIfThere(page, '[data-testid="retract-toggle"]');
      const back = await tryAct(() => page.waitForSelector('[data-testid="replacement-select"]', { timeout: 15000 }));
      check('reopening the form re-reads the chain and finds the new claim', back);

      const options = await page.locator('[data-testid="replacement-select"] option')
        .allTextContents().catch(() => []);
      // The positive control for the exclusion below it: a picker that
      // offered NOTHING would satisfy "does not offer the retracted claim".
      check('the narrower claim is on offer', options.some((o) => o.includes(NARROW.slice(0, 40))));
      check('the claim being retracted is NOT on offer',
        !options.some((o) => o.includes(BROAD.slice(0, 40))));
      check('and "none" is the default, so the field stays optional',
        options.some((o) => /none/i.test(o))
        && await page.locator('[data-testid="replacement-select"]').inputValue() === '');
      check('the domain is in each label, so two claims cannot read alike',
        options.filter((o) => o.includes(DOMAIN)).length >= 1);
    }

    // =====================================================================
    log('\n=== 4. Retract naming the replacement, and read it back off the DHT ===');
    let broadHash = null;
    let narrowHash = null;
    {
      const mine = await ownClaims(agent);
      broadHash = mine.find((c) => c.content === BROAD)?.entryHash ?? null;
      narrowHash = mine.find((c) => c.content === NARROW)?.entryHash ?? null;
      check('CONTROL: both claims resolved to entry hashes', Boolean(broadHash && narrowHash));

      await page.locator('[data-testid="replacement-select"]')
        .selectOption({ index: 1 }).catch(() => {});
      await fillIfThere(page, '[data-testid="retract-reason"]',
        'Too broad — a cleaner sandbox is not what every measurement here claims.');
      await clickIfThere(page, '[data-testid="retract-submit"]');
      await page.waitForTimeout(3500);

      // THE INDEPENDENT READ. Everything on screen could be right and this
      // wrong, which is the only failure that matters: the entry is permanent.
      const retractions = broadHash ? await retractionsOf(agent, broadHash) : [];
      check('one retraction is on the chain for the broad claim', retractions.length === 1);
      const named = retractions[0]?.replacement_claim ?? null;
      check('and it NAMES the narrower claim as the replacement',
        Boolean(named) && Boolean(narrowHash) && b64(named) === b64(narrowHash));
      // `RetractionToReplacement` has no getter — SPEC §4's "read by nothing
      // yet" is still true of the LINK — so its existence is attested by
      // validation rather than by a read: the integrity zome's own branch
      // refuses the link unless its target equals the hash the Retraction
      // names, and refuses it from anyone but the Retraction's author. A
      // create that succeeded is a link that satisfied both.
      check('so the link validation accepted it, which is the only reader there is',
        retractions.length === 1 && Boolean(named));
      check('the reason survived alongside it, rather than carrying the replacement in prose',
        typeof retractions[0]?.reason === 'string'
        && retractions[0].reason.length > 0
        && !/republishing it as/i.test(retractions[0].reason));
    }

    // =====================================================================
    log('\n=== 5. A reader can follow it forward ===');
    {
      await loadDomain();
      const line = await tryAct(() => page.waitForSelector('[data-testid="replacement-line"]', { timeout: 20000 }));
      check('the retracted claim shows what its author believes now', line);
      let ready = await tryAct(() => page.waitForFunction(
        () => document.querySelector('[data-testid="replacement-line"]')?.dataset.state === 'ready',
        null, { timeout: 20000 }));
      check('and resolves it rather than naming a hash at a reader', ready);
      const text = await textIfThere(page, '[data-testid="replacement-line"]');
      check('the replacement\'s own words are on screen', text.includes(NARROW.slice(0, 40)));
      check('the retraction banner is still there — this adds, it does not replace',
        await countOf(page, '[data-testid="retraction-banner"]') >= 1);
      check('and the way to the replacement is a button, not a dead end',
        await countOf(page, '[data-testid="replacement-domain"]') === 1);

      // Negative-evidence note 2: what was EVER displayed, not what is.
      const states = await page.evaluate(() => window.__lineStates);
      check('the line was never drawn as "absent" while the read was running',
        !states.includes('absent'));
      check('CONTROL: the observer saw the line at all, so the absence above can fail',
        states.length > 0 && states.includes('ready'));
    }

    // =====================================================================
    log('\n=== 6. A retraction with no replacement draws no line ===');
    {
      await publish(agent, UNREPLACED);
      await loadDomain();
      // The toggle only appears on an un-retracted claim of the author's, and
      // the broad one is now retracted — so the last toggle on screen is the
      // one for a claim that has none. Located by its own card rather than by
      // position, because position is the thing a re-render changes.
      const cards = page.locator('.claim-card');
      const n = await cards.count();
      let targetCard = null;
      for (let i = 0; i < n; i++) {
        const c = cards.nth(i);
        if ((await c.innerText()).includes(UNREPLACED.slice(0, 40))) { targetCard = c; break; }
      }
      check('CONTROL: the un-replaced claim is on screen to retract', targetCard !== null);
      if (targetCard) {
        await targetCard.locator('[data-testid="retract-toggle"]').first().click().catch(() => {});
        await page.waitForTimeout(1500);
        await targetCard.locator('[data-testid="retract-reason"]').first()
          .fill('Withdrawn, and I have nothing to offer in its place.').catch(() => {});
        await targetCard.locator('[data-testid="retract-submit"]').first().click().catch(() => {});
        await page.waitForTimeout(3500);
        await loadDomain();

        let thisCard = null;
        const m = await cards.count();
        for (let i = 0; i < m; i++) {
          const c = cards.nth(i);
          if ((await c.innerText()).includes(UNREPLACED.slice(0, 40))) { thisCard = c; break; }
        }
        check('it is retracted', thisCard !== null
          && await thisCard.locator('[data-testid="retraction-banner"]').count() === 1);
        check('and draws NO replacement line, because none was named', thisCard !== null
          && await thisCard.locator('[data-testid="replacement-line"]').count() === 0);
        // Without this the check above passes on a build that never draws the
        // line at all — which is the state this row started in.
        check('CONTROL: the claim that DID name one still draws its line',
          await countOf(page, '[data-testid="replacement-line"]') === 1);
      }
    }

    // =====================================================================
    log('\n=== 7. A claim cannot replace itself, and validation would allow it ===');
    {
      // THE GUARD THIS SECTION EXERCISES IS DEFENCE IN DEPTH, and it is worth
      // a check precisely because nothing downstream would catch the mistake:
      // `validate_retraction` checks only that a named `replacement_claim`
      // EXISTS (`must_get_entry`) — not that it differs from the target, not
      // that it is the author's own, not even that it is a Claim. So a
      // retraction naming itself as its own replacement validates today, and
      // a reader following it loops in a permanent record.
      //
      // The picker cannot offer it, so reaching the guard needs stale state.
      // An option carrying the retracted claim's own hash is injected and
      // selected, which is exactly what a stale picker would have produced.
      await publish(agent, `Self replacement probe ${STAMP}`);
      await loadDomain();
      const cards = page.locator('.claim-card');
      const n = await cards.count();
      let probe = null;
      for (let i = 0; i < n; i++) {
        const c = cards.nth(i);
        if ((await c.innerText()).includes(`Self replacement probe ${STAMP}`)) { probe = c; break; }
      }
      check('CONTROL: the probe claim is on screen with a retract toggle', probe !== null
        && await probe.locator('[data-testid="retract-toggle"]').count() === 1);
      if (probe) {
        await probe.locator('[data-testid="retract-toggle"]').first().click().catch(() => {});
        await page.waitForTimeout(1500);
        const mine = await ownClaims(agent);
        const selfHash = mine.find((c) => c.content === `Self replacement probe ${STAMP}`)?.entryHash;
        const injected = selfHash ? await page.evaluate((hash) => {
          const sel = document.querySelector('[data-testid="replacement-select"]');
          if (!sel) return false;
          const opt = document.createElement('option');
          opt.value = hash;
          opt.textContent = 'itself';
          sel.appendChild(opt);
          sel.value = hash;
          sel.dispatchEvent(new Event('change'));
          return sel.value === hash;
        }, b64(selfHash)) : false;
        check('CONTROL: a stale self-referential choice was reachable to make', injected);
        await probe.locator('[data-testid="retract-reason"]').first()
          .fill('Probing the self-replacement guard.').catch(() => {});
        await probe.locator('[data-testid="retract-submit"]').first().click().catch(() => {});
        await page.waitForTimeout(2000);
        const err = await probe.locator('[data-testid="retract-error"]').first().innerText().catch(() => '');
        check('the client refuses it in words', /cannot replace itself/i.test(err));
        const after = selfHash ? await retractionsOf(agent, selfHash) : [];
        check('and nothing permanent was written', after.length === 0);
      }
    }

    check('no uncaught error on the page throughout', pageErrors.length === 0);
    if (pageErrors.length) for (const e of pageErrors) log(`    page error: ${e}`);
  } finally {
    await browser.close();
    preview.kill();
    try { await agent.app.client.close(); } catch { /* best effort */ }
    try { await admin.client.close(); } catch { /* best effort */ }
  }

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — a retraction can name the claim that replaced it,');
    log('a reader can follow it forward, a replacement-less retraction is still');
    log('a complete act, and the form says which order the two have to be');
    log('published in rather than leaving an author to find out.');
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
