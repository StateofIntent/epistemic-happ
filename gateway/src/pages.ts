// ============================================================================
// gateway/src/pages.ts — the human half of the same export.
//
// Every resource here is served twice from one URL: as a page a person can
// read, and as JSON-LD a program can. The JSON-LD is embedded in the page as
// well as being content-negotiable, so a link that gets pasted into a chat
// window still carries its own machine-readable copy.
//
// THE PAGE HAS TO SAY WHAT IT IS. A claim rendered as an ordinary web page
// looks exactly like a blog post, and a reader who does not know better will
// treat it as one — permanent, authored, unranked and cryptographically
// signed are not things a page conveys by looking normal. So the provenance
// footer is not decoration: it names the canonical hash, says the DHT copy is
// authoritative, and says this export is one-way.
//
// AND IT MUST NOT INVENT A HIERARCHY. Critiques are listed in the order the
// DHT returned them, grouped by nothing, sized the same, with the mode stated
// as a label rather than as a severity. A page that put "3 Logical critiques"
// in a red badge would be scoring a claim in CSS.
// ============================================================================

import type { DecodedRecord } from './conductor.js';
import {
  b64, b64url, claimUrl, domainUrl, isoFromMicros, vocabulary,
  type AntibodyPattern, type Claim, type Critique, type Origin, type Retraction,
} from './jsonld.js';

const escape = (text: string): string => text
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const STYLE = `
  :root { color-scheme: light dark; --ink:#161a19; --dim:#5c6a66; --rule:#d8ddd8; --paper:#fbfbf8; --panel:#fff; }
  @media (prefers-color-scheme: dark) {
    :root { --ink:#e6ebe6; --dim:#9aa8a3; --rule:#2b3432; --paper:#101514; --panel:#161d1c; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink);
         font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
  main { max-width: 46rem; margin: 0 auto; padding: 2rem 1.15rem 5rem; }
  h1 { font-size: 1.5rem; line-height:1.25; margin:0 0 .5rem; }
  h2 { font-size: 1.1rem; margin: 2rem 0 .5rem; }
  a { color: inherit; }
  .meta { color: var(--dim); font-size:.85rem; margin:0 0 1.5rem; }
  .claim { font-size:1.15rem; margin: 0 0 1rem; overflow-wrap:anywhere; }
  .card { border:1px solid var(--rule); border-radius:10px; padding:.85rem 1rem;
          margin:.6rem 0; background:var(--panel); }
  .mode { font-size:.72rem; letter-spacing:.06em; text-transform:uppercase; color:var(--dim); }
  .card p { margin:.35rem 0 0; overflow-wrap:anywhere; }
  .retracted { border-color:#a5563f; }
  .retracted .mode { color:#a5563f; }
  code { font-size:.75rem; overflow-wrap:anywhere; word-break:break-all; color:var(--dim); }
  footer { margin-top:3rem; padding-top:1rem; border-top:1px solid var(--rule);
           color:var(--dim); font-size:.82rem; }
  ul { padding-left: 1.1rem; }
  li { margin:.35rem 0; }
`;

function shell(title: string, body: string, jsonld: unknown): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title>
<style>${STYLE}</style>
<script type="application/ld+json">${JSON.stringify(jsonld, null, 2).replace(/</g, '\\u003c')}</script>
</head><body><main>
${body}
<footer>
  Exported from a Holochain DHT by an Epistemic Resonance gateway. <strong>One way:</strong>
  the entry on the DHT is canonical and this page is a mirror of it — nothing done here reaches
  the protocol, and this copy may be stale or may disappear. The machine-readable form of this
  page is embedded above and available by asking for
  <code>application/ld+json</code>. <a href="/ns">What the terms mean</a>.
</footer>
</main></body></html>`;
}

function hashLine(label: string, hash: Uint8Array): string {
  return `<p class="meta">${escape(label)} <code>${escape(b64(hash))}</code></p>`;
}

export function claimPage(input: {
  o: Origin;
  claim: DecodedRecord<Claim>;
  critiques: DecodedRecord<Critique>[];
  retractions: DecodedRecord<Retraction>[];
  flags: DecodedRecord<AntibodyPattern>[];
  jsonld: unknown;
}): string {
  const { o, claim, critiques, retractions, flags, jsonld } = input;
  const parts: string[] = [];

  // A retraction is rendered ABOVE the claim, before anyone reads it. Putting
  // it below would let a reader finish the claim believing it stands.
  for (const retraction of retractions) {
    parts.push(`<div class="card retracted">
      <div class="mode">Retracted by its author</div>
      <p>${escape(retraction.entry.reason)}</p>
      <p class="meta">${escape(isoFromMicros(retraction.entry.timestamp))}</p>
    </div>`);
  }

  parts.push(`<h1>Claim in ${escape(claim.entry.domain)}</h1>`);
  parts.push(`<p class="claim">${escape(claim.entry.content)}</p>`);
  parts.push(`<p class="meta">
    Stated confidence: ${escape(claim.entry.confidence)} ·
    ${escape(isoFromMicros(claim.entry.timestamp))} ·
    agent <code>${escape(b64(claim.entry.author).slice(0, 16))}…</code> ·
    <a href="${escape(domainUrl(o, claim.entry.domain))}">all of ${escape(claim.entry.domain)}</a>
  </p>`);
  if (claim.entry.semantic_tags.length) {
    parts.push(`<p class="meta">Tags: ${claim.entry.semantic_tags.map(escape).join(', ')}</p>`);
  }
  parts.push(hashLine('Canonical entry hash:', claim.entryHash));

  parts.push(`<h2>Critiques (${critiques.length})</h2>`);
  if (critiques.length === 0) {
    parts.push(`<p class="meta">None published. That is not evidence for the claim — it may
      simply not have been read yet.</p>`);
  }
  for (const critique of critiques) {
    parts.push(`<div class="card" id="critique-${escape(b64url(critique.actionHash))}">
      <div class="mode">${escape(critique.entry.critique_mode)}</div>
      <p>${escape(critique.entry.content)}</p>
      <p class="meta">${escape(isoFromMicros(critique.entry.timestamp))} ·
        agent <code>${escape(b64(critique.entry.author).slice(0, 16))}…</code></p>
    </div>`);
  }
  parts.push(`<p class="meta">Each critique declares one of five fixed modes and the protocol
    refuses free text in that field, which is why there is no score here to read: disagreement
    is typed rather than counted.</p>`);

  if (flags.length) {
    parts.push(`<h2>Flagged patterns (${flags.length})</h2>`);
    parts.push(`<p class="meta">One agent's accusation that this exhibits a structural pattern,
      not a verdict and not a critique of the content.</p>`);
    for (const flag of flags) {
      parts.push(`<div class="card" id="flag-${escape(b64url(flag.actionHash))}">
        <div class="mode">${escape(flag.entry.kind)}</div>
        <p>${escape(flag.entry.rationale)}</p>
        <p class="meta">agent <code>${escape(b64(flag.entry.author).slice(0, 16))}…</code></p>
      </div>`);
    }
  }

  return shell(`Claim in ${claim.entry.domain}`, parts.join('\n'), jsonld);
}

export function domainPage(input: {
  o: Origin; domain: string; claims: DecodedRecord<Claim>[]; jsonld: unknown;
}): string {
  const { o, domain, claims, jsonld } = input;
  const items = claims.map((record) => `<li>
    <a href="${escape(claimUrl(o, record.entryHash))}">${escape(record.entry.content)}</a>
    <span class="meta"> — ${escape(record.entry.confidence)},
      ${escape(isoFromMicros(record.entry.timestamp))}</span>
  </li>`).join('\n');
  const body = `<h1>${escape(domain)}</h1>
    <p class="meta">${claims.length} ${claims.length === 1 ? 'claim' : 'claims'}, in the order the
      DHT returned them. This list is not ranked and has no ordering to read anything into.</p>
    ${claims.length ? `<ul>${items}</ul>` : '<p class="meta">Nothing published in this domain yet.</p>'}`;
  return shell(domain, body, jsonld);
}

export function indexPage(o: Origin, domains: string[], jsonld: unknown): string {
  const list = domains.length
    ? `<ul>${domains.map((d) => `<li><a href="${escape(domainUrl(o, d))}">${escape(d)}</a></li>`).join('')}</ul>`
    : '<p class="meta">No founded domains are visible from this gateway yet.</p>';
  const body = `<h1>An Epistemic Resonance gateway</h1>
    <p>This serves entries from a Holochain DHT as ordinary web pages, with JSON-LD underneath.
      It exists so that material published to the protocol is not invisible to everything that
      already speaks HTTP — no Holochain client, no SDK and no network membership are needed to
      read it.</p>
    <p><strong>It is a one-way export.</strong> The DHT is the source of truth. Every page names
      the canonical hash of the entry it mirrors, and nothing here writes to the protocol: this
      service can perform a fixed list of reads and nothing else.</p>
    <p>There is no score anywhere in this export, and that is deliberate. Critiques carry their
      type — Experiential, Methodological, Logical, Evidential, Phenomenological — and are never
      counted into a rating, because the protocol computes no such number and a gateway that
      invented one would be publishing it in the protocol's name.</p>
    <h2>Domains</h2>
    ${list}
    <p class="meta">Only domains founded as Membranes are listed. A claim in an unfounded domain
      is still reachable at its own URL.</p>`;
  return shell('An Epistemic Resonance gateway', body, jsonld);
}

export function vocabularyPage(o: Origin): string {
  const terms: Array<[string, string]> = [
    ['erp:Claim', 'A claim published to the protocol. Permanent, authored by an agent key, never deleted.'],
    ['erp:Critique', 'A typed disagreement with a claim. Always carries erp:critiqueMode.'],
    ['erp:Retraction', "A claim's own author withdrawing it. The claim itself remains — nothing is deleted."],
    ['erp:AntibodyPattern', "One agent's accusation that an entry exhibits a structural bad-faith pattern. Not a verdict."],
    ['erp:Domain', 'A named region of the protocol. Claims carry one.'],
    ['erp:critiqueMode', 'One of exactly five values: Experiential, Methodological, Logical, Evidential, Phenomenological. Free text is refused by the protocol.'],
    ['erp:confidence', "The AUTHOR'S OWN stated confidence in their claim: Hypothetical, Tentative, Moderate, High or Certain. It is a self-declaration, never anyone else's assessment, and must not be read as a rating."],
    ['erp:canonicalHash', 'The Holochain hash of the entry this document mirrors. Authoritative; this URL is not.'],
    ['erp:canonicalHashAlgorithm', 'Which kind of hash: holochain-entry-hash or holochain-action-hash.'],
    ['erp:dnaHash', 'The network the entry lives on. Two entries with the same hash on different DNAs are not the same claim.'],
    ['erp:agentPubKey', "An agent's public key, base64. The only identity this protocol has."],
    ['erp:replicationAttempted', "Whether the critique's author says they tried to reproduce the claim."],
  ];
  const rows = terms.map(([term, meaning]) =>
    `<div class="card"><div class="mode">${escape(term)}</div><p>${escape(meaning)}</p></div>`).join('\n');
  const body = `<h1>Vocabulary</h1>
    <p class="meta">Namespace <code>${escape(vocabulary(o))}</code>. These terms describe what the
      protocol actually distinguishes; schema.org supplies the rest.</p>
    ${rows}
    <h2>What is deliberately not here</h2>
    <p>There is no term for a rating, a score, a ranking or a vote count, and
      <code>aggregateRating</code>, <code>interactionStatistic</code> and their relatives are never
      emitted. The protocol computes no canonical comparative number about a claim or an agent, and
      a gateway that produced one would be publishing its own invention under the protocol's name.
      Consumers that want to rank may do so; nothing here will do it for them or make it look
      official.</p>`;
  return shell('Vocabulary', body, {
    '@context': 'https://schema.org/',
    '@type': 'DefinedTermSet',
    '@id': `${o.origin}/ns`,
    name: 'Epistemic Resonance Protocol vocabulary',
    hasDefinedTerm: terms.map(([term, meaning]) => ({
      '@type': 'DefinedTerm', name: term, description: meaning,
    })),
  });
}

export function notFoundPage(message: string): string {
  return shell('Not found', `<h1>Not here</h1><p class="meta">${escape(message)}</p>`, {
    '@context': 'https://schema.org/', '@type': 'Thing', name: 'Not found',
  });
}
