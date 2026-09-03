import { defineConfig } from 'vite';

// The only reason this file exists — everything else about this build is
// Vite's own defaults, deliberately (see this project's minimal-
// dependency preference, README.md's HRR section).
//
// `base: './'` makes every emitted asset reference RELATIVE
// (`./assets/index-*.js`) rather than absolute (`/assets/index-*.js`,
// Vite's default). This matters only since the UI started shipping
// inside a `.webhapp`: a Holochain Launcher serves an installed hApp's
// UI from its own custom-protocol origin, and an absolute `/assets/...`
// resolves against the ROOT of whatever origin the host chose, which is
// only the UI's own directory if the host happens to serve it there.
// A relative reference resolves against the document, so it is correct
// under both — strictly more robust, with nothing given up: `vite
// preview` and the live-verification harnesses serve the bundle at the
// origin root, where relative and absolute resolve identically.
//
// This has NOT been verified inside a real Launcher (none is installed
// here — see README.md §6.7's own note on the limit of this packaging
// work's verification). It is the choice that cannot be wrong in either
// case rather than the one confirmed correct in the untested case.
export default defineConfig({
  base: './',
});
