#!/usr/bin/env node
// ============================================================================
// gateway/src/main.ts — run the Linked Data face.
//
//   EPI_GATEWAY_ORIGIN=https://notes.example node dist/main.js
//
//   EPI_GATEWAY_PORT       default 8795
//   EPI_GATEWAY_ORIGIN     the public origin, used to mint every @id
//   EPI_GATEWAY_INDEXABLE  1 to allow search engines; noindex otherwise
//   EPI_GATEWAY_DNA_HASH   base64 DNA hash, carried into every document
//   EPI_ADMIN_URL / EPI_APP_URL / EPI_APP_ID   the conductor to read from
//
// THE ORIGIN IS EXPLICIT AND NOT GUESSED. Every `@id` in every exported
// document is minted from it, and a wrong one is a permanent falsehood in
// somebody else's cache — a Host header an intermediary rewrote is not good
// enough to build identifiers out of.
// ============================================================================

import { createGatewayServer } from './server.js';
import { DEFAULT_CONFIG, ReadOnlyConductor } from './conductor.js';

const port = Number(process.env.EPI_GATEWAY_PORT ?? 8795);
const origin = process.env.EPI_GATEWAY_ORIGIN ?? `http://localhost:${port}`;
const indexable = process.env.EPI_GATEWAY_INDEXABLE === '1';
const dnaHash = process.env.EPI_GATEWAY_DNA_HASH?.trim() || null;
const cacheSeconds = Number(process.env.EPI_GATEWAY_CACHE_SECONDS ?? 60);

const config = {
  ...DEFAULT_CONFIG,
  adminUrl: process.env.EPI_ADMIN_URL ?? DEFAULT_CONFIG.adminUrl,
  appUrl: process.env.EPI_APP_URL ?? DEFAULT_CONFIG.appUrl,
  appId: process.env.EPI_APP_ID ?? DEFAULT_CONFIG.appId,
};

async function main(): Promise<void> {
  const conductor = await ReadOnlyConductor.connect(config);
  const server = createGatewayServer({ conductor, origin, indexable, dnaHash, cacheSeconds });
  server.listen(port, () => {
    console.log(`[gateway] serving ${origin} on port ${port}`);
    console.log(`[gateway] reading from ${config.appUrl} as app "${config.appId}"`);
    console.log(`[gateway] search engines: ${indexable ? 'allowed (EPI_GATEWAY_INDEXABLE=1)' : 'noindex'}`);
    console.log('[gateway] one way: this process can perform a fixed list of reads and nothing else.');
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}

main().catch((error) => {
  console.error('[gateway] could not start:', error);
  process.exit(1);
});
