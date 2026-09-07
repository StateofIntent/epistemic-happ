// ============================================================================
// gateway/src/server.ts — HTTP in front of a read-only conductor connection.
//
// CONTENT NEGOTIATION, and why both forms come from one URL. A Linked Data
// resource that only exists as JSON is invisible to a person, and one that
// only exists as a page is invisible to a program. So each resource is served
// at a single URL, as a page by default and as JSON-LD when asked for — plus a
// `.jsonld` suffix, because "just add .jsonld" survives being pasted into a
// terminal where an Accept header does not.
//
// NOINDEX BY DEFAULT, and this is a judgement worth stating rather than
// burying. Publishing a claim to a DHT is a decision to make it available to
// that network; it is not, by itself, a decision to have it indexed by search
// engines under someone's name forever. The gateway's purpose — letting an
// agent or a person read protocol material over plain HTTP — is fully served
// without indexing, so the default is `noindex` and an operator who has the
// standing to decide otherwise sets EPI_GATEWAY_INDEXABLE=1 deliberately.
// ============================================================================

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { ReadOnlyConductor, decodeRecords, type DecodedRecord } from './conductor.js';
import {
  claimDocument, domainDocument, fromB64url, vocabulary,
  type AntibodyPattern, type Claim, type Critique, type Origin, type Retraction,
} from './jsonld.js';
import { claimPage, domainPage, indexPage, notFoundPage, vocabularyPage } from './pages.js';

/** Every Holochain hash is 39 bytes: a 3-byte multihash prefix, a 32-byte
 * digest and a 4-byte DHT location. */
const HOLOCHAIN_HASH_BYTES = 39;

export interface GatewayServerOptions {
  conductor: ReadOnlyConductor;
  origin: string;
  indexable: boolean;
  /** The DNA this gateway reads from, base64, when the operator knows it.
   * Carried into every exported document: two entries with the same hash on
   * different networks are not the same claim. */
  dnaHash: string | null;
  /** How long a rendered resource may be reused. Small and non-zero: DHT
   * entries are immutable, but the CRITIQUES attached to one are not, so a
   * long cache would serve a claim whose disagreements have moved on. */
  cacheSeconds: number;
}

const wantsJsonLd = (req: IncomingMessage, path: string): boolean => {
  if (path.endsWith('.jsonld')) return true;
  const accept = String(req.headers.accept ?? '');
  if (/application\/ld\+json/.test(accept)) return true;
  // `Accept: application/json` from a script that did not know about JSON-LD
  // still means "give me the data", and giving it HTML would be pedantry.
  return /application\/json/.test(accept) && !/text\/html/.test(accept);
};

export function createGatewayServer(options: GatewayServerOptions): Server {
  const { conductor, indexable, dnaHash, cacheSeconds } = options;
  const o: Origin = { origin: options.origin.replace(/\/$/, '') };

  const send = (res: ServerResponse, status: number, contentType: string, body: string) => {
    const headers: Record<string, string> = {
      'content-type': contentType,
      'content-length': String(Buffer.byteLength(body)),
      'cache-control': `public, max-age=${cacheSeconds}`,
      // Reading an export needs no credentials and carries none, so this is
      // safe to open and useless to attack: there is no session to ride.
      'access-control-allow-origin': '*',
    };
    if (!indexable) headers['x-robots-tag'] = 'noindex, nofollow';
    res.writeHead(status, headers);
    res.end(body);
  };

  const sendJson = (res: ServerResponse, status: number, document: unknown) =>
    send(res, status, 'application/ld+json; charset=utf-8', JSON.stringify(document, null, 2));
  const sendHtml = (res: ServerResponse, status: number, html: string) =>
    send(res, status, 'text/html; charset=utf-8', html);

  return createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      // The refusal is the feature. There is no write path to reach.
      send(res, 405, 'text/plain; charset=utf-8',
        'This gateway is a one-way export and accepts reads only. '
        + 'The protocol is written to with a Holochain client, under your own agent key.\n');
      return;
    }

    const url = new URL(req.url ?? '/', 'http://gateway.invalid');
    const asJson = wantsJsonLd(req, url.pathname);
    const path = url.pathname.replace(/\.jsonld$/, '').replace(/\/+$/, '') || '/';

    try {
      if (path === '/robots.txt') {
        send(res, 200, 'text/plain; charset=utf-8',
          indexable ? 'User-agent: *\nAllow: /\n' : 'User-agent: *\nDisallow: /\n');
        return;
      }

      if (path === '/ns') {
        if (asJson) {
          sendJson(res, 200, {
            '@context': 'https://schema.org/',
            '@type': 'DefinedTermSet',
            '@id': `${o.origin}/ns`,
            name: 'Epistemic Resonance Protocol vocabulary',
            url: vocabulary(o),
          });
          return;
        }
        sendHtml(res, 200, vocabularyPage(o));
        return;
      }

      if (path === '/') {
        const membranes = decodeRecords<{ domain: string }>(
          await conductor.read<any[]>('get_membranes'));
        // Deduplicated and sorted by NAME. Alphabetical is a fact about names;
        // any other ordering of domains would be this gateway expressing a
        // view about which one matters.
        const domains = [...new Set(membranes.map((m) => m.entry.domain))].sort();
        const document = {
          '@context': 'https://schema.org/',
          '@type': 'DataCatalog',
          '@id': `${o.origin}/`,
          name: 'An Epistemic Resonance gateway',
          description:
            'A one-way HTTP export of entries on a Holochain DHT. The DHT copy is canonical.',
          dataset: domains.map((domain) => ({
            '@type': 'Dataset', '@id': `${o.origin}/domains/${encodeURIComponent(domain)}`, name: domain,
          })),
        };
        if (asJson) sendJson(res, 200, document);
        else sendHtml(res, 200, indexPage(o, domains, document));
        return;
      }

      const domainMatch = /^\/domains\/(.+)$/.exec(path);
      if (domainMatch) {
        const domain = decodeURIComponent(domainMatch[1]);
        const claims = decodeRecords<Claim>(
          await conductor.read<any[]>('get_claims_by_domain', domain));
        const document = domainDocument({ o, domain, claims });
        if (asJson) sendJson(res, 200, document);
        else sendHtml(res, 200, domainPage({ o, domain, claims, jsonld: document }));
        return;
      }

      const claimMatch = /^\/claims\/([A-Za-z0-9_-]+)$/.exec(path);
      if (claimMatch) {
        let entryHash: Uint8Array;
        try {
          entryHash = fromB64url(claimMatch[1]);
        } catch {
          sendHtml(res, 400, notFoundPage('That is not a readable hash.'));
          return;
        }
        // Shape-checked BEFORE it reaches the conductor. A Holochain hash is
        // 39 bytes — a 3-byte multihash prefix, 32 bytes of digest and a
        // 4-byte location — and handing the zome anything else produces a
        // wasm deserialization error that surfaces as a 502 about the
        // gateway, when the truth is simply that the URL was wrong. Found by
        // this route's own harness, which fed it a made-up hash.
        if (entryHash.length !== HOLOCHAIN_HASH_BYTES) {
          sendHtml(res, 400, notFoundPage(
            `A Holochain hash is ${HOLOCHAIN_HASH_BYTES} bytes; that one is ${entryHash.length}. `
            + 'This is a malformed address rather than a claim that does not exist.'));
          return;
        }
        const claim = await conductor.read<Claim | null>('get_claim', entryHash);
        if (!claim) {
          const message =
            'No claim with that hash is visible from this gateway. It may not exist, or it may '
            + 'not have reached this node yet — a gateway sees what its own conductor has, which '
            + 'is not the same as what the network has.';
          if (asJson) sendJson(res, 404, { '@context': 'https://schema.org/', '@type': 'Thing', description: message });
          else sendHtml(res, 404, notFoundPage(message));
          return;
        }
        // get_claim returns the entry, not the Record, so the surrounding
        // action metadata is not available on this path — the author and
        // timestamp inside the entry are what the protocol validates against
        // anyway, and are used here rather than inventing action metadata.
        const record: DecodedRecord<Claim> = {
          entryHash,
          actionHash: entryHash,
          author: claim.author,
          timestamp: claim.timestamp,
          entry: claim,
        };
        const [critiqueRecords, retractionRecords, flagRecords] = await Promise.all([
          conductor.read<any[]>('get_critiques_for', entryHash),
          conductor.read<any[]>('get_retractions_for_claim', entryHash),
          conductor.read<any[]>('get_antibody_patterns_for', entryHash),
        ]);
        const critiques = decodeRecords<Critique>(critiqueRecords);
        const retractions = decodeRecords<Retraction>(retractionRecords);
        const flags = decodeRecords<AntibodyPattern>(flagRecords);
        const document = claimDocument({ o, claim: record, critiques, retractions, flags, dnaHash });
        if (asJson) sendJson(res, 200, document);
        else sendHtml(res, 200, claimPage({ o, claim: record, critiques, retractions, flags, jsonld: document }));
        return;
      }

      sendHtml(res, 404, notFoundPage(`Nothing is exported at ${path}.`));
    } catch (error) {
      console.error('[gateway]', error);
      send(res, 502, 'text/plain; charset=utf-8',
        'The gateway could not read from its conductor. The DHT copy is unaffected.\n');
    }
  });
}
