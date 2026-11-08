// ============================================================================
// mobile-ui/src/applet-host.ts — THE ONLY PLACE `@theweave/api` APPEARS.
//
// Separated from `applet.ts` so the addressing rules there import nothing: the
// package pulls `ws` through `isomorphic-ws`, which needs a CJS `require`, and
// with the import co-located those rules could not be exercised in node at
// all. A dependency that makes untouched code untestable is the coupling this
// integration is supposed to avoid.
//
// Installed at `0.7.0-dev.5` — a DEV PRERELEASE, and the same class of risk
// open-work 6.10 measured when it routed around Your Own AI: a surface that
// moves under you. Isolated here so the cost of it moving is one file.
//
// MEASURED, NOT ASSUMED: it took `node_modules` from 70M to 161M, and added
// 2,726 bytes to the shipped bundle — 0.40%. Dev-time weight, not installer
// weight, which is the distinction that matters for a UI that ships inside
// desktop installers.
// ============================================================================
import { isWeaveContext } from '@theweave/api';
import type { HostContext } from './applet';

/** DELEGATES TO `@theweave/api`'s OWN `isWeaveContext()`, and the reason is a
 *  mistake this file made first.
 *
 *  The prototype that preceded this hand-wrote the check against
 *  `window.__WEAVE__`, taken from the published API reference. **That name is
 *  wrong.** The installed source reads:
 *
 *      isWeaveContext = () => window.location.protocol === 'applet:'
 *                             || !!window.__WEAVE_API__
 *
 *  — `__WEAVE_API__`, and a second condition for an `applet:` protocol that no
 *  amount of reading documentation would have produced. The hand-written check
 *  would have returned `standalone` inside a real Moss applet and the
 *  integration would simply never have engaged, silently. That is precisely
 *  what `holochain.ts`'s "Confirmed against the installed 0.17.1 source" earns
 *  the right to say and this file previously could not, so the host's own
 *  function is now the authority rather than a copy of it.
 *
 *  WRAPPED IN `Boolean()` ON PURPOSE. `isWeaveContext` is DECLARED
 *  `() => true` (`api.d.ts:24`) while its body plainly returns a boolean. That
 *  does not break compilation — a probe confirmed `tsc` accepts a branch on it
 *  — but it does mean the type system will never warn that the standalone
 *  branch has gone dead. Coercing keeps the lie from propagating into the one
 *  decision this module exists to make.
 *
 *  `'unknown'` remains a real answer: no `window` at all, which is how the
 *  pure checks exercise this off the host. */
export function hostContext(): HostContext {
  if (typeof window === 'undefined') return 'unknown';
  if (Boolean(isWeaveContext())) return 'applet';
  return 'standalone';
}

