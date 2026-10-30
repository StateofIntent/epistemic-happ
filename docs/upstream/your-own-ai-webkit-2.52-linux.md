# The Linux webview dies ~1s after the UI mounts on WebKitGTK 2.52.6 — not this app's bug, and its Linux users will hit it

**Repo:** `WeAreFlowsta/Your-Own-AI` (as a **compatibility note**, not a defect report)
**Also relevant to:** WebKitGTK itself — `bugs.webkit.org`, component *WebKit Gtk*
**Version:** app `v0.9.0` (`5a8f33d`), built from source, `x86_64-unknown-linux-gnu`
**Verified:** 2026-10-29 (app) and re-verified 2026-10-30 (isolating test)

## The environment, because that is the finding

| | |
|---|---|
| OS | Arch Linux, kernel 7.1.9-arch1-2 |
| webview | **`webkit2gtk-4.1 2.52.6-1`**, `gtk3 1:3.24.52-1` |
| compositor | Hyprland 0.56.2 (Wayland), `XDG_SESSION_TYPE=wayland` |
| GPU / driver | NVIDIA GTX 970 (GM204), `nvidia-580xx-dkms 580.178.04`, mesa 1:26.2.1 |

## What happens

The app starts correctly and **the whole backend comes up**: lair 0.6.3, a
holochain 0.6.1 conductor, the transcript happ installed, an agent provisioned
with its own key, `llama-server` bound and serving. Roughly a second after the
UI mounts, the webview segfaults and takes the app with it. From
`coredumpctl`, 2026-10-29 — note the order:

```
23:12:58  SIGSEGV  /usr/lib/webkit2gtk-4.1/WebKitWebProcess      11.7M
23:12:59  SIGSEGV  /home/.../src-tauri/target/release/app         7.7M
```

The **web process dies first** and the app follows about a second later; that
pair repeats on every launch. `SEGV_MAPERR`, and the top frames are:

```
#0  libwebkit2gtk-4.1.so.0 + 0x47b3b90
...
#11 0x00007fe8fc00c038  n/a (n/a + 0x0)              <- anonymous executable memory
#12 libjavascriptcoregtk-4.1.so.0 + 0x4d1f29
#13 libjavascriptcoregtk-4.1.so.0 + 0x4d1f29
#14 libjavascriptcoregtk-4.1.so.0 + 0x4d1f29
#15 libjavascriptcoregtk-4.1.so.0 + 0x4b1cc4
#17 JSC::profiledCall(JSGlobalObject*, ProfilingReason, JSValue, CallData const&, ArgList const&, NakedPtr<Exception>&)
```

Frame 11 is in anonymous memory with no backing file, reached through JSC's
call path, which is the shape of a crash *in generated code*. I am not
asserting that as the mechanism: `JSC_useJIT=0` did not prevent it, which
either rules JIT out or means the option did not reach the web process, and
Arch ships no WebKitGTK debug symbols so the frames above cannot be resolved
further.

## Why it is not this app's bug — the isolating test

WebKitGTK's own MiniBrowser, on `about:blank`, with no Tauri and no Your Own AI
code anywhere near it. Re-run 2026-10-30:

```
$ timeout 20 /usr/lib/webkit2gtk-4.1/MiniBrowser about:blank
Gdk-Message: Error 71 (Protocol error) dispatching to Wayland display.
exit 1                                                   # ~1s, no core

$ GDK_BACKEND=x11 timeout 20 /usr/lib/webkit2gtk-4.1/MiniBrowser about:blank
Failed to create GBM buffer of size 2048x1460: Invalid argument
Failed to create GBM buffer of size 2048x1460: Invalid argument
exit 124                                                 # survived the full 20s
```

A stock MiniBrowser on a blank page cannot stay alive under this compositor.
Under X11 it survives, while logging GBM buffer allocation failures against
the NVIDIA stack — so the common thread is WebKitGTK 2.52's DMABUF/GBM path on
this driver, and the Wayland case fails hard enough to come out as a protocol
error rather than a crash. The app's SIGSEGV and MiniBrowser's protocol error
are two exits from the same root; the app only differs in having JS running
when it goes.

## What did not help

Each tried against the app, individually: Wayland and `GDK_BACKEND=x11`,
`LIBGL_ALWAYS_SOFTWARE=1`, DMABUF disabled, compositing off, `JSC_useJIT=0`,
`WEBKIT_FORCE_SANDBOX=0`, `GSK_RENDERER=cairo`. None changed the outcome.

The one untried candidate is downgrading to `webkit2gtk-4.1 2.48.6-1` from the
Arch archive and holding it with `IgnorePkg` — on this machine only `aether`
depends on it. **Not attempted and not recommended**: it trades four minor
versions of browser-engine security fixes for a GUI, and it is unconfirmed as a
fix.

## Why you still want to know

Nothing here is yours to fix, but three things follow for a Tauri app shipping
on Linux:

1. **Tauri links the system WebKitGTK**, so the official `.deb` crashes exactly
   the same way on a distro at 2.52. There is no packaging change that avoids
   it — which also means `debtap`-style repackaging was never going to help.
2. **CI cannot see it.** `build-release.yml:95` builds Linux on `ubuntu-22.04`,
   whose WebKitGTK is far older than 2.52, and a CI build never launches the
   webview at all. So this combination is untested by construction, not by
   oversight.
3. **The symptom is indistinguishable from your bug, from the user's side.**
   The app window appears and vanishes; the backend had already succeeded, so
   the logs end mid-success. Anyone on a rolling distro who tries it will report
   *"Your Own AI crashes on launch"*, and `scripts/check-webview-floor.mjs`
   shows you already treat the old end of the WebKitGTK range as a real
   constraint — this is the same constraint from the new end.

So the ask is only this: a known-issue line naming WebKitGTK 2.52 and Wayland,
and, if it is cheap, a startup log line recording the resolved WebKitGTK
version. On a crash this fast, the version is the single most useful thing a
diagnostics file could carry, and README:136 already asks reporters to attach
one.

## If this goes to WebKitGTK instead

The report there is the MiniBrowser reproduction alone — `about:blank`,
Wayland, 2.52.6, NVIDIA 580.178.04, Hyprland 0.56.2 — plus the X11 GBM
failures as the second data point. None of the app's involvement belongs in it,
and a resolvable backtrace would need a distro that ships WebKitGTK debug
symbols; this one does not.
