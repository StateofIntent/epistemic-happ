// ============================================================================
// Colour theme selection.
//
// style.css used to take the palette from the OS and nothing else: light
// tokens on :root, dark tokens inside @media (prefers-color-scheme: dark).
// That is the right default and the wrong only option. The launcher embeds a
// webview that reports whatever the host says, so one install reads as a dark
// app on a dark desktop and a white one on a Windows machine left in the
// default light app mode — and nothing inside the app could say otherwise.
//
// So: three states rather than two. 'system' is the old behaviour and stays
// the default, which matters — most users never open this control, and the
// OS preference is the better guess for them. 'light' and 'dark' pin the
// palette by stamping data-theme on the root element; the stylesheet reads
// that attribute at a higher specificity than the media query, so a pin wins
// in both directions (pinned light on a dark OS works, not just the reverse).
//
// A pin is a per-viewer display preference. It lives in localStorage beside
// the onboarding state, never touches the DHT, and is wrapped the same way
// every other access here is — private browsing and blocked site-data both
// throw, and losing a theme choice costs a repeated click, not correctness.
// ============================================================================

/** Shared with the pre-paint script in index.html, which reads this key
 * before the module graph loads. That script is the only other reader;
 * this module stays the only writer. */
const STORAGE_KEY = 'epistemic-mobile-ui:theme';

export type ThemePreference = 'system' | 'light' | 'dark';

function isPreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function getThemePreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isPreference(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

export function setThemePreference(pref: ThemePreference): void {
  try {
    if (pref === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Same reasoning as saveConfig and the onboarding store: the choice is
    // lost on the next launch, the app is not.
  }
  applyTheme(pref);
}

/** Stamps or clears data-theme. Removing the attribute — rather than
 * writing 'system' into it — is what hands the decision back to the media
 * query, so the OS preference resumes being live rather than being sampled
 * once at the moment the user chose 'system'. */
function applyTheme(pref: ThemePreference): void {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
}

/** Called once at startup. The pre-paint script in index.html has already
 * stamped a pinned theme by the time this runs — this re-applies it from
 * the same key so the two never drift, and is a no-op in the common case. */
export function initTheme(): void {
  applyTheme(getThemePreference());
}
