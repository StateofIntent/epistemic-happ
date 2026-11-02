#!/usr/bin/env node
// ============================================================================
// scripts/live-verify/compose-adversary.mjs — the compose-time adversary, and
// the four promises it makes to the author.
//
// open-work 6.10. The only cheap moment to improve a permanent entry is BEFORE
// it exists; this is the thing in that moment. It writes nothing — no entry,
// no link, no friction budget, nothing attributed to anybody's key — so the
// reason this repository gives for keeping autonomous writes mechanical is
// silent here, and the author still signs.
//
// THE MODEL IS STUBBED AND THAT IS THE DESIGN, NOT A SHORTCUT. A 3B model in
// CI would be slow, enormous, and would test the MODEL rather than this
// client; worse, its output varies run to run, so the assertions would have to
// be weakened to whatever two models happened to agree on.
// `scripts/adversary-spike.mjs` is where the model is measured, against a real
// endpoint, and four runs across two models already established what it is
// good at (objection text) and bad at (mode labels). What is NOT measured
// anywhere else is whether this client reads a reply honestly — and every
// defect the spike found was in the reading, not the model:
//
//   - a bare ARRAY and then a separate object, which a first-brace-to-last-
//     brace span swallows and parses as neither
//   - `evidence_gap` satisfying `required` with the literal string "..."
//   - a mode label that is not one of the protocol's five
//
// So the stub replies with exactly those shapes, on purpose, and the checks
// are about what the screen then says.
//
// WHAT THE STUB CANNOT SHOW, said plainly: that a real model's objections are
// worth reading. Nothing here measures usefulness, and nothing here should be
// cited as evidence of it.
//
// Prereqs: a CLEAN sandbox (scripts/sandbox.sh clean && start) and a UI build.
// ============================================================================
// ---------------------------------------------------------------------------
// NEGATIVE EVIDENCE — this harness has been watched failing.
//
//   Injection DA: the `modeIsReal` test inverted, so a real mode is marked
//   NOT A MODE THIS PROTOCOL HAS and an invented one is not.
//   Result, FIRST TIME: **GREEN — and that is the most useful result this
//   file has produced.** §3 asserted only the COUNT: one marker, and fewer
//   markers than objections. Both stay true when the marking is exactly
//   backwards, so the section passed against a client that had the test
//   inverted. A count cannot tell you which row it is on.
//   Result, AFTER asserting WHICH objection carries the marker: TWO red.
//   The checks now read the marker's own row and name the mode in it.
//
//   Injection DB: `meaningful()` returns the string unchanged, so a
//   placeholder is rendered as a judgement.
//   Result: ONE red, §4 — the `"..."` evidence gap reaches the screen, and
//   everything else stays green, because a schema cannot forbid a
//   well-formed string and nothing else in the client is looking.
//
//   Injection DC: `clearAfterPublish` no longer discards the verdict.
//   Result: TWO red, §6, **with the publish control still GREEN** — so the
//   claim really was written and the objections really did survive it,
//   rather than a refused publish leaving them on screen for an unrelated
//   reason. That control exists because an earlier run of this file DID
//   fail that way: the fixture had not filled the domain, the publish was
//   refused, and §6 read as a broken decision.
//   THIS IS THE ONE THAT MATTERS: the failure mode is not an error message
//   but a machine objection sitting beside a published claim, which is
//   precisely what 6.10's second decision exists to make impossible.
//
//   AND THE DC RUN WAS WRONG THE FIRST TIME FOR A REASON WORTH RECORDING:
//   the injected `main.ts` did not type-check (an unused binding), the
//   build failed, and the harness ran against the PREVIOUS injection's
//   bundle — reporting DB's red under DC's name. The build output had been
//   piped to /dev/null. Watch the build, or the thing under test is not the
//   thing you changed.
//
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { CHROMIUM } from './chromium.mjs';

const require_ = createRequire(new URL('../../mobile-ui/package.json', import.meta.url));
let chromium;
try {
  ({ chromium } = require_('playwright'));
} catch {
  console.error('Could not resolve playwright from mobile-ui/. Run: cd mobile-ui && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install');
  process.exit(1);
}

const ADMIN = Number(process.env.ADMIN_PORT ?? 8889);
const APP = Number(process.env.APP_PORT ?? 8888);
const APP_ID = process.env.APP_ID ?? 'epistemic-resonance-happ';
const PREVIEW_PORT = Number(process.env.PREVIEW_PORT ?? 4188);
const STUB_PORT = Number(process.env.STUB_PORT ?? 4189);

let failures = 0;
const log = (...a) => console.log(...a);
const check = (label, cond) => {
  if (cond) log(`  PASS: ${label}`);
  else { log(`  FAIL: ${label}`); failures++; }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// THE REPLY IS DELIBERATELY MALFORMED IN THREE WAYS AT ONCE, each one a shape
// the spike actually observed from a real model:
//   1. a bare ARRAY of objections, then a SEPARATE object — not one document
//   2. `evidence_gap` present and meaningless, satisfying `required` with "..."
//   3. one mode the protocol defines and one it does not
const STUB_REPLY = `[{"mode":"Methodological","text":"What controlled for season here?"},`
  + `{"mode":"Ontological","text":"What does 'resonance' denote in this sentence?"}]`
  + `{"evidence_gap":"...","confidence":"Tentative"}`;

function startStub() {
  const seen = [];
  // ONE handler, branching on method. The first draft registered a second
  // via `server.on('request')` for the CORS preflight, and both fired on
  // every request — `ERR_HTTP_HEADERS_SENT` on the first OPTIONS, which is a
  // defect in the instrument rather than in anything under test.
  const CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
  };
  const server = createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      res.end();
      return;
    }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push({ url: req.url, body });
      res.writeHead(200, { 'content-type': 'application/json', ...CORS });
      res.end(JSON.stringify({ choices: [{ message: { content: STUB_REPLY } }] }));
    });
  });
  return new Promise((resolve) => {
    server.listen(STUB_PORT, '127.0.0.1', () => resolve({ server, seen }));
  });
}

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
}

async function main() {
  await connect();
  const { server, seen } = await startStub();
  let stubClosed = false;
  log(`stub model endpoint on http://127.0.0.1:${STUB_PORT}`);

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
    // Point the client at the stub before the app loads. Same key the client
    // reads, set the same way a person would by configuring the origin.
    await page.addInitScript((port) => {
      localStorage.setItem('epistemic-mobile-ui:adversary-origin', `http://127.0.0.1:${port}`);
    }, STUB_PORT);

    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForSelector('[data-testid="friction-meter"]', { timeout: 20000 });
    await page.locator('nav.tab-bar button', { hasText: 'New Claim' }).first().click();
    await page.waitForSelector('[data-testid="adversary"]', { timeout: 20000 });

    log('\n=== 1. IT IS IN THE COMPOSE FORM, AND SAYS WHAT IT IS ===');
    check('the adversary section is on the compose form', await page.locator('[data-testid="adversary"]').count() === 1);
    const hint = await page.locator('[data-testid="adversary-hint"]').innerText();
    check('it says the draft does not leave this machine', /does not leave this machine/i.test(hint));
    check('and that nothing is recorded and nobody is on record',
      /not recorded/i.test(hint) && /nobody is on record/i.test(hint));
    // THE BUTTON IS OFF UNTIL THERE IS A DRAFT, because asking a model about
    // an empty box wastes a wait and returns noise.
    check('CONTROL: the button is disabled with an empty draft',
      await page.locator('[data-testid="adversary-run"]').isDisabled());

    log('\n=== 2. THE SPLIT REPLY PARSES — array, then a separate object ===');
    const content = page.locator('textarea').first();
    await content.fill('Cold exposure raises winter mood scores in habitual practitioners.');
    // Chosen by the author BEFORE the model is asked, and deliberately not
    // the value the stub will advise — so "unchanged" is a real assertion.
    await page.locator('[data-testid="new-claim-confidence"]').selectOption('High');
    const confidenceBefore = await page.locator('[data-testid="new-claim-confidence"]').inputValue();
    await page.locator('[data-testid="adversary-run"]').click();
    await page.waitForSelector('[data-testid="adversary-list"]', { timeout: 20000 });
    const objections = page.locator('[data-testid="adversary-objection"]');
    // A first-brace-to-last-brace span would swallow both documents and parse
    // as NEITHER, which is how a readable answer once rendered as raw text.
    check('both objections from the bare array are rendered',
      await objections.count() === 2);
    check('and the SEPARATE object was read too, not discarded with it',
      await page.locator('[data-testid="adversary-confidence"]').count() === 1);
    check('CONTROL: the request actually reached the stub',
      seen.some((r) => r.url.includes('/chat/completions')));
    const sent = seen.find((r) => r.url.includes('/chat/completions'))?.body ?? '';
    check('and asked for a constrained shape at the server',
      /json_schema/.test(sent));
    // `mode` MUST NOT BE AN ENUM — an enum forces a well-formed label at the
    // sampler and hides the vocabulary misunderstanding the next check is for.
    check('with mode as a free string, NOT an enum',
      /"mode":\{"type":"string"\}/.test(sent.replace(/\s/g, '')));

    log('\n=== 3. A MODE THE PROTOCOL DOES NOT DEFINE IS SURFACED, NOT FIXED ===');
    const unreal = page.locator('[data-testid="adversary-mode-unreal"]');
    check('exactly one objection is marked NOT A MODE THIS PROTOCOL HAS',
      await unreal.count() === 1);
    // WHICH ONE, NOT HOW MANY — and this is the correction injection DA
    // forced. The first draft asserted only the COUNT: one marker, fewer
    // markers than objections. Inverting `modeIsReal` so the REAL mode is
    // marked and the invented one is not leaves both of those true, and the
    // run came back green against a client that had the test exactly
    // backwards. A count cannot tell you which row it is on.
    const marked = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="adversary-mode-unreal"]');
      const row = el?.closest('[data-testid="adversary-objection"]');
      return row?.querySelector('[data-testid="adversary-mode"]')?.textContent?.trim() ?? null;
    });
    log(`    marked as unreal: ${JSON.stringify(marked)}`);
    check('and it is the INVENTED mode that carries the marker',
      (marked ?? '').toLowerCase() === 'ontological');
    const markedReal = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-testid="adversary-objection"]')];
      return rows.some((r) =>
        r.querySelector('[data-testid="adversary-mode"]')?.textContent?.trim().toLowerCase() === 'methodological'
        && r.querySelector('[data-testid="adversary-mode-unreal"]') !== null);
    });
    check('CONTROL: and the mode the protocol DOES define carries none',
      markedReal === false);
    const modes = (await page.locator('[data-testid="adversary-mode"]').allInnerTexts())
      .map((t) => t.trim());
    log(`    modes rendered: ${JSON.stringify(modes)}`);
    // COMPARED CASE-INSENSITIVELY, because `.critique-mode` is uppercased by
    // the stylesheet and `innerText` returns the RENDERED text. The first
    // draft compared exactly and failed on correct behaviour — the
    // instrument's fault, not the client's.
    const lower = modes.map((m) => m.toLowerCase());
    check('both labels are shown as the model gave them, uncorrected',
      lower.includes('methodological') && lower.includes('ontological'));

    log('\n=== 4. A PLACEHOLDER IS NOT A JUDGEMENT ===');
    // The stub sets `evidence_gap` to "...", which satisfies `required` and
    // is well-formed, so no schema can forbid it. Showing it would present a
    // placeholder as the model's finding.
    check('an evidence gap with no alphanumeric content is dropped',
      await page.locator('[data-testid="adversary-evidence-gap"]').count() === 0);

    log('\n=== 5. SURVIVING IT IS NOT EVIDENCE, AND THE SELECT IS NOT TOUCHED ===');
    const denial = await page.locator('[data-testid="adversary-not-evidence"]').innerText();
    check('the denial is on screen', denial.length > 0);
    check('and says the model observed nothing and published nothing',
      /observed nothing/i.test(denial) && /published nothing/i.test(denial));
    check('and that it cannot support a higher confidence',
      /cannot support a higher confidence/i.test(denial));
    // THE CLIENT NEVER MOVES THE AUTHOR'S CONFIDENCE, and this is asserted
    // against what the author actually chose rather than against a guess.
    // The first draft of this check ended in `|| true`, which passes on
    // anything — a decorative check is worse than none, because it reads as
    // coverage. `confidenceBefore` is captured above, before the run.
    const advisedRaw = await page.locator('[data-testid="adversary-confidence"]').innerText();
    const chosen = await page.locator('[data-testid="new-claim-confidence"]').inputValue();
    check('CONTROL: the author\'s confidence select was NOT changed by the advice',
      chosen === confidenceBefore);
    check('CONTROL: and the advice really did differ from it, so that is not vacuous',
      /Tentative/.test(advisedRaw) && confidenceBefore !== 'Tentative');
    check('the advice is rendered as the model\'s reading, not as a setting',
      /Yours is the one that is published/i.test(advisedRaw));

    log('\n=== 6. COMPOSE-TIME ONLY — it does not survive the publish ===');
    // 6.10's SECOND DECISION, enforced. A machine objection never renders
    // beside a real one, and the way that is guaranteed is that there is no
    // surface for it after the claim exists.
    // THE DOMAIN IS REQUIRED and the first draft of this section did not fill
    // it, so the publish was refused, `clearAfterPublish` never ran, and §6
    // read as a real failure of the decision it tests. A fixture that cannot
    // reach the state under test fails indistinguishably from the defect.
    await page.locator('[data-testid="new-claim-domain"]').fill(`Adversary${Date.now()}`);
    await page.locator('[data-testid="new-claim-tags"]').fill('harness');
    await page.getByRole('button', { name: /publish claim/i }).first().click();
    await page.waitForSelector('[data-testid="adversary-objection"]', { state: 'detached', timeout: 30000 })
      .catch(() => log('    (objections did not clear; the checks below say so)'));
    // THE PUBLISH MUST HAVE SUCCEEDED BEFORE ANYTHING IS CONCLUDED FROM THE
    // CLEARING. A refused publish leaves the objections on screen for an
    // entirely different reason, and the two are indistinguishable without
    // this — which is exactly what happened on the run that forgot the
    // domain field.
    const published = await page.evaluate(() =>
      !!document.body.innerText.match(/Published to your own chain/i));
    check('CONTROL: the claim really was published', published);
    check('the objections are gone after publishing',
      await page.locator('[data-testid="adversary-objection"]').count() === 0);
    check('and so is the advice that came with them',
      await page.locator('[data-testid="adversary-confidence"]').count() === 0);
    // CONTROL: the section itself is still there, ready for the next draft —
    // the verdict is discarded, not the feature.
    check('CONTROL: the section itself remains, for the next draft',
      await page.locator('[data-testid="adversary"]').count() === 1);

    log('\n=== 7. AN ABSENT MODEL IS NOT A VERDICT ===');
    // A failure here is silent otherwise, and an author could read an empty
    // panel as "no objections found" — the opposite of what happened. This is
    // also the FIRST-USE case: the weights are ~2.1GB and are pulled rather
    // than bundled, so "not downloaded yet" is the ordinary reason.
    //
    // THE STUB IS CLOSED RATHER THAN THE ORIGIN CHANGED. The first draft set
    // localStorage and reloaded — but `addInitScript` runs on EVERY
    // navigation and put the live stub back, so the call succeeded and no
    // error ever rendered. Killing the server leaves the configured origin
    // alone and makes it genuinely unreachable, which is the real condition.
    await new Promise((r) => server.close(r));
    stubClosed = true;
    await page.locator('textarea').first().fill('A second draft, against an endpoint that is no longer there.');
    await page.locator('[data-testid="adversary-run"]').click();
    await page.waitForSelector('[data-testid="adversary-error"]', { timeout: 30000 })
      .catch(() => log('    (no error element appeared; the checks below say so)'));
    const errCount = await page.locator('[data-testid="adversary-error"]').count();
    check('a failure is reported at all, rather than an empty panel', errCount === 1);
    const errText = errCount ? await page.locator('[data-testid="adversary-error"]').innerText() : '';
    log(`    reads: ${JSON.stringify(errText.slice(0, 120))}`);
    check('the failure says nothing was checked',
      /nothing was checked/i.test(errText));
    check('and distinguishes that from nothing being wrong',
      /not the same as nothing being wrong/i.test(errText));
    check('and names the first-use case rather than blaming the draft',
      /still be downloading/i.test(errText));
    check('CONTROL: and no objection list is rendered beside the failure',
      await page.locator('[data-testid="adversary-list"]').count() === 0);

    check('no page errors', pageErrors.length === 0);
    if (pageErrors.length) log(`    ${pageErrors[0].slice(0, 200)}`);
  } finally {
    await browser.close();
    preview.kill();
    if (!stubClosed) server.close();
  }

  log('');
  if (failures === 0) {
    log('ALL CHECKS PASSED — the compose-time adversary reads a split reply,');
    log('surfaces a mode the protocol does not define rather than correcting it,');
    log('drops a placeholder rather than presenting it as a judgement, denies');
    log('that surviving it is evidence while leaving the author\'s confidence');
    log('alone, reports an absent model as nothing-checked rather than as');
    log('nothing-wrong — and leaves NOTHING behind when the claim is published.');
  } else {
    log(`${failures} CHECK(S) FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\nHARNESS ERROR: ${e?.stack ?? e}`); process.exit(1); });
