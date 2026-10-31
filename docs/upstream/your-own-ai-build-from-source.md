# The documented five-command build cannot work outside the org — one wrong repo, one missing release, one glob, one unstated Node version

**Repo:** `WeAreFlowsta/Your-Own-AI`  **Component:** `download-llama-binaries.sh`, `download-holochain-binaries.sh`, README *Development*
**Version:** `v0.9.0` (`5a8f33d`, *"README: describe 0.9.0"*)
**Verified:** 2026-10-30, Arch Linux x86_64, by running the documented steps from a fresh clone.

## Summary

README:118 gives the whole build as five commands:

```bash
npm install
./download-llama-binaries.sh       # the inference engine sidecars
./download-holochain-binaries.sh   # the records sidecars
npm run tauri dev
```

From outside the org, **three of those four commands fail**, and the first of
them fails *silently* — it prints four green ticks and leaves four 9-byte files
marked executable. The app does build and run once the sidecars are obtained
another way: the three problems are all in the acquisition path, and three of
the four fixes are one line.

They are listed worst-first by how long the failure takes to understand, not by
how hard it is to fix.

---

## 1. `download-llama-binaries.sh` points at a repository that does not exist, and reports success anyway

`download-llama-binaries.sh:16`

```bash
# Get latest release from OUR repository
REPO="Your-Own-AI/App"
```

`https://api.github.com/repos/Your-Own-AI/App` → **404**. The sibling script,
`download-holochain-binaries.sh:15`, carries the same comment and the right
value (`WeAreFlowsta/Your-Own-AI`), which is what makes this look like a stale
line rather than a private mirror.

**Why it is not a visible failure.** The script no longer consults the API —
`RELEASE_TAG` is read straight out of `engine.rs` by `sed` (line 30, and the
comment above it explaining why the pin wins over "newest" is correct and
worth keeping). So it goes directly to the download URL, and the download is
`curl -L` without `-f`:

```
$ curl -sL "https://github.com/Your-Own-AI/App/releases/download/llama-b11669/llama-server-x86_64-unknown-linux-gnu" -o out.bin
$ echo $?        # 0
$ ls -l out.bin  # 9 bytes
$ cat out.bin    # Not Found
```

`curl` exits 0, the 404 body lands at the sidecar path, `chmod +x` makes it
executable, and the script prints `✅ Linux binary ready`. Four times. Then
`✅ All binaries downloaded!` and exit 0. The first sign anything is wrong
arrives much later, from a Tauri sidecar that is a text file.

**Fix (one line + one flag).**

```diff
-REPO="Your-Own-AI/App"
+REPO="WeAreFlowsta/Your-Own-AI"
```

All four assets the script asks for are public under that repo at the pinned
tag — checked 2026-10-30, `HTTP 200` on each:

| asset at tag `llama-b11669` | |
|---|---|
| `llama-server-x86_64-unknown-linux-gnu` | 200 |
| `llama-server-aarch64-apple-darwin` | 200 |
| `llama-server-x86_64-apple-darwin` | 200 |
| `llama-server-x86_64-pc-windows-msvc.exe` | 200 |

Independently of the repo name, `curl -L` → **`curl -fL`** on all four
downloads, so that an asset that moves or gets renamed in a later tag fails
loudly instead of installing an HTML page as an engine.

## 2. There is no public `holochain-*` release, and the workflow the error message names is not in the repository

`download-holochain-binaries.sh` has the right repo and still cannot succeed.
It looks for the newest tag matching `holochain-`:

```
$ curl -s ".../repos/WeAreFlowsta/Your-Own-AI/releases?per_page=100" | grep tag_name
v0.9.0, llama-b11669, llama-b11429, v0.8.1, v0.8.0, v0.7.2, v0.7.1,
llama-b10809, v0.7.0, llama-b10621, v0.6.0, ...
```

Engine tags and app tags, and **no `holochain-*` tag at all**. So the script
takes its error path, whose two suggestions are:

- *"For private repos, set `GITHUB_TOKEN`"* — a token does not help; the
  release is absent rather than hidden.
- *"Or run the `build-holochain-binaries` workflow first in GitHub Actions"* —
  `.github/workflows/` contains `build-llama-binaries.yml`, `build-release.yml`,
  `catalog-urls.yml`, `llama-watch.yml`, `rebuild-llama-{macos,windows,windows-cuda}.yml`
  and `test.yml`. **There is no `build-holochain-binaries.yml`**, so this is not
  runnable even in a fork. The header comment at line 4 names the same absent
  file.

**What works instead**, for anyone reading this before the release exists — both
sidecars build from crates.io at the versions the app already pins
(`src-tauri/Cargo.toml:61-63` — `lair_keystore_api = "=0.6.3"`,
`holochain_types = "=0.6.1"`, with the comment above them recording that they
move in lockstep with the conductor; `conductor.rs:21` sets
`NETWORK_GENERATION = "holochain-0.6"`). The two binaries then report
`holochain 0.6.1` and `lair_keystore 0.6.3`, which is what the app expects:

```bash
cargo install holochain --version 0.6.1 --locked --root /tmp/yoa
cargo install lair_keystore --version 0.6.3 --locked --root /tmp/yoa
cp /tmp/yoa/bin/holochain     src-tauri/binaries/yourowai-holochain-x86_64-unknown-linux-gnu
cp /tmp/yoa/bin/lair-keystore src-tauri/binaries/yourowai-lair-keystore-x86_64-unknown-linux-gnu
```

`--root` matters enough to be in the instruction rather than beside it: without
it, `cargo install holochain --version 0.6.1` silently replaces whatever
`holochain` the contributor already had in `~/.cargo/bin` — here it overwrote a
`0.7.0` used by an unrelated project, which took a while to notice because
nothing announces it.

**Fix:** publish a `holochain-*` release with the six assets, or — cheaper and
arguably better for an AGPL project — replace the error path's two suggestions
with the four commands above. Either one turns the Linux build from
*undocumented* into *documented*.

## 3. `download-holochain-binaries.sh` exits non-zero on success, because its last glob omits the prefix it just wrote

The downloads are written with the `yourowai-` prefix the Tauri config
requires (`tauri.conf.json:113-114`: `binaries/yourowai-holochain`,
`binaries/yourowai-lair-keystore`):

```bash
curl -L ... -o "${BINDIR}/yourowai-holochain-x86_64-unknown-linux-gnu"
```

The final summary (line 74) looks for them without it:

```bash
ls -lh "${BINDIR}"/holochain-* "${BINDIR}"/lair-keystore-*
```

Nothing can ever match. Under the `set -e` at line 6 that is fatal, so a
completely successful run prints `✅ All Holochain binaries downloaded!` and
then dies:

```
$ ls src-tauri/binaries/
yourowai-holochain-x86_64-unknown-linux-gnu
yourowai-lair-keystore-x86_64-unknown-linux-gnu
$ ls -lh src-tauri/binaries/holochain-*
ls: cannot access 'src-tauri/binaries/holochain-*': No such file or directory   # exit 2
```

**Fix.**

```diff
-ls -lh "${BINDIR}"/holochain-* "${BINDIR}"/lair-keystore-*
+ls -lh "${BINDIR}"/yourowai-holochain-* "${BINDIR}"/yourowai-lair-keystore-*
```

(`download-llama-binaries.sh`'s equivalent line is correct — it writes and
globs `llama-server-*`.)

## 4. The Node version is pinned in CI and nowhere a local build can see it

`npm install` on **Node 26.8.1** fails building `sharp`, which arrives through
`@builder.io/qwik-city` → `vite-imagetools`: there is no prebuilt binary for
Node 26's ABI and the fallback source build fails in `node-addon-api`.

The constraint is already known to the project — `build-release.yml:131` sets
`node-version: 20` — but nothing in the repository tells a contributor that:
`package.json` has no `engines` field, there is no `.nvmrc`, and README
*Development* opens on a bare `npm install`.

Node **20.20.2** builds it. One more wrinkle on the way: npm runs sharp's
install script *before* placing the platform prebuilt, so a clone that has
already failed once needs

```bash
npm install --ignore-scripts && npm install
```

**Fix:** an `engines` field, or `.nvmrc`/`mise.toml` committed, or one line in
README *Development*. Any of the three; the field is the one a package manager
will actually enforce.

---

## What this does not claim

The app itself is fine. With the sidecars in place it builds clean from source
and **the entire backend works**: lair 0.6.3 starts, a holochain 0.6.1
conductor comes up, the transcript happ installs, an agent is provisioned with
its own key, and `llama-server` binds and serves. The webview then crashes on
this machine, which is **not** this project's bug and is written up separately
(`your-own-ai-webkit-2.52-linux.md`) — it is a system WebKitGTK 2.52.6 problem
reproducible with WebKitGTK's own MiniBrowser and no Tauri involved.

Nor is any of this a complaint about release hygiene in general: the engine pin
in `engine.rs`, the `LLAMA_ENGINE_TAG` comment in the download script, the
Safari-15 regex floor check in `scripts/check-webview-floor.mjs` and the
`windows-2022` pin comment in `build-release.yml` are all the work of someone
who writes down *why*. These four findings are what a build does when it has
only ever been run by people who already had the assets.

---

## ADDENDUM, 2026-10-31 — finding 2's recommended fix was worse than his own build

**POSTED 2026-10-31 02:44Z (13:14 ACDT) as
[issue #3 comment 6537956104](https://github.com/WeAreFlowsta/Your-Own-AI/issues/3#issuecomment-6537956104)**
— 2,096 characters, by the human on the human's account. The wording is at the
end of this section; it opens by correcting ME rather than him, which is the
only version of a second comment that does not read as pressure.

**WHY IT WAS POSTED BEFORE HE REPLIED, rather than held with the webkit note.**
The uncorrected report tells a reader to compile `holochain 0.6.1` and
`lair_keystore 0.6.3` from crates.io, so every hour it stood alone was an hour
he might spend on a slower road to binaries his own CI downloads. That cost is
real and grows; the cost of being wrong the other way is one extra GitHub
notification. The webkit note stays held because it ASKS him something — pick a
tracker — whereas this one only removes a demand.

`2089e61`, *"Build: verify every downloaded Holochain binary against pinned
SHA-256s"*, landed **2026-10-30 10:28 ACDT — about eleven hours before this
report was filed.** It touches `.github/holochain-sidecars.sha256` and
`.github/workflows/build-release.yml` only, so **every finding above still
holds against current `origin/HEAD`**. What it exposes is that finding 2's
recommendation was the wrong fix.

`build-release.yml`'s step *"Download Holochain binaries (official release)"*
does this:

```bash
BASE="https://github.com/holochain/holochain/releases/download/${HC_RELEASE}"   # holochain-0.6.1
for BIN in holochain lair-keystore; do
  DEST="src-tauri/binaries/yourowai-${BIN}-${T}${EXT}"
  curl -fsSL --retry 5 --retry-delay 20 --retry-all-errors "${BASE}/${BIN}-${T}${EXT}" -o "$DEST"
  check "$DEST" "${HC_RELEASE}/${BIN}-${T}${EXT}"      # pinned SHA-256
done
```

Its own comment says *"the same pattern as Flowsta Vault (nothing compiled from
source)"* — which is a direct argument against the four `cargo install` commands
this report recommended.

**SO FINDING 2 IS REAL AND MIS-DIAGNOSED.** The release build never calls
`download-holochain-binaries.sh` at all. The script is not missing a release:
it is **stale relative to the workflow**, and README:118 sends a contributor to
a script the build itself abandoned. That also explains the original bug — the
`holochain-*` tag it greps for is a tag in **`holochain/holochain`**, never in
this repo, so `REPO` was the wrong variable to look in from the start.

Verified 2026-10-31: both Linux assets return `HTTP 200` at
`holochain/holochain` tag `holochain-0.6.1` —
`holochain-x86_64-unknown-linux-gnu` and
`lair-keystore-x86_64-unknown-linux-gnu`.

**Two consequences for the report above.** The `--root` warning becomes
irrelevant once the script is repointed, because there is no `cargo install` in
the fixed path at all — anyone following the original text would take a longer
road for no reason. And finding 3 (the `ls` glob) is unaffected: it is in the
same script and applies whichever way the downloads are sourced.

### The comment, as posted

Correcting myself on finding 2: the fix I suggested is worse than what this repo already does.

I hadn't looked at `build-release.yml` closely when I wrote that. Its "Download Holochain binaries (official release)" step does:

```bash
BASE="https://github.com/holochain/holochain/releases/download/${HC_RELEASE}"   # holochain-0.6.1
for BIN in holochain lair-keystore; do
  DEST="src-tauri/binaries/yourowai-${BIN}-${T}${EXT}"
  curl -fsSL --retry 5 --retry-delay 20 --retry-all-errors "${BASE}/${BIN}-${T}${EXT}" -o "$DEST"
  check "$DEST" "${HC_RELEASE}/${BIN}-${T}${EXT}"      # pinned SHA-256, as of 2089e61
done
```

— and its comment says "nothing compiled from source", which is a straight argument against the four `cargo install` commands I put in the report. Please ignore those; building the conductor from crates.io is a slower road to the same binaries.

So finding 2 is real but I mis-diagnosed it. `download-holochain-binaries.sh` isn't missing a release — the release build never calls it, and it's stale relative to the workflow. The README's step 3 sends a contributor to a script the build itself abandoned. That also explains the original symptom: the `holochain-*` tag it greps for is a tag in `holochain/holochain`, never in this repo, so `REPO` was the wrong variable to be looking in. The eleven lines above are the fix, already written and already tested by every release.

I checked both Linux assets resolve at that tag today: `holochain-x86_64-unknown-linux-gnu` and `lair-keystore-x86_64-unknown-linux-gnu`, both 200.

Two notes on the rest. `2089e61` landed about eleven hours before I filed this, and it doesn't touch either download script, so the other three findings still stand against current HEAD. And finding 3 (the final `ls` globbing `holochain-*` while the script writes `yourowai-holochain-*`) is unaffected either way — same script, same `set -e`.

Given the script is dead relative to CI, deleting it and putting those eleven lines in the README is also a reasonable answer, and a smaller diff than fixing it. Your call — happy to send either as a PR.
