---
name: tauri-build
description: Use when building, rebuilding, or testing Tauri desktop apps after code changes. Covers the full cycle from build to verifying the correct version is running. Triggers on "build", "rebuild", "tauri build", "probar la app", "abrir la app", "no veo los cambios", or when finishing frontend/Rust changes in a desktop project.
---

# Tauri Build — Desktop App Build & Verification

Best practices for building Tauri desktop apps and ensuring the user always runs the latest version.

## When to Use

- **AUTOMATICALLY** after making ANY code changes to `desktop/src/` (frontend) or `desktop/src-tauri/` (Rust) — do NOT wait for the user to ask, just build
- User says "build", "rebuild", "tauri build", "probar la app"
- User reports "no veo los cambios" or the app shows stale UI
- After finishing a feature that needs testing in the desktop app

**IMPORTANT:** Unlike changes to `src/` (CLI TypeScript picked up by bun at runtime), changes inside `desktop/` require a rebuild to take effect. Always rebuild proactively after editing files in `desktop/`.

## The #1 Problem: Stale App Copies

macOS caches app locations. If the user previously installed the app to `/Applications/` (e.g., from a DMG), the dock and Spotlight will keep opening that OLD copy even after a new build.

**This is the most common issue.** Always handle it.

## Build Process

### 1. Build

```bash
cd desktop && bun run tauri build 2>&1
```

For development (faster, no bundling):
```bash
cd desktop && bun run tauri dev 2>&1
```

### 2. Replace ALL Installed Copies

After a successful build, ALWAYS check for and replace stale copies:

```bash
# Find all copies of the app
mdfind -name "<app-name>.app" kind:application 2>/dev/null
ls -la /Applications/<app-name>.app 2>/dev/null

# Replace the /Applications copy with the fresh build
rm -rf /Applications/<app-name>.app
cp -R desktop/src-tauri/target/release/bundle/macos/<app-name>.app /Applications/<app-name>.app
```

**CRITICAL:** If you skip this step, the user will open the old version from the dock and think the changes didn't work.

### 3. Launch the Correct Version

```bash
# Kill any running instance first
osascript -e 'quit app "<app-name>"' 2>/dev/null
sleep 1

# Open from /Applications (where the dock points)
open /Applications/<app-name>.app
```

**Never** just open from the build directory if the user has the app in their dock — they'll reopen the old one next time.

### 4. Verify Changes Are Present

After building, verify the compiled output contains your changes:

```bash
# For frontend changes: grep the bundled JS
grep "your_new_string" desktop/dist/assets/index-*.js

# For Rust changes: check binary timestamp
ls -la desktop/src-tauri/target/release/<binary-name>
```

## Common Gotchas

### Dock icon opens old version
**Cause:** App was previously installed to `/Applications/` (from DMG or manual copy). The dock shortcut points there, not to the build directory.
**Fix:** Always copy the new build to `/Applications/` after building (step 2).

### Build succeeds but no UI changes visible
**Cause:** The Vite build cache may serve old assets, or the Rust binary didn't recompile.
**Fix:** Check the Vite output for the JS filename — if it's the same hash, the frontend didn't change. For Rust, check `Compiling` appears in the build output.

### TypeScript errors from `src-tauri/target/`
**Cause:** Cargo build artifacts (binary `.js` files in codegen-assets) get picked up by `tsc`.
**Fix:** These are harmless — filter them out: `bun run typecheck 2>&1 | grep -v "src-tauri/target/"`

### Frontend changes don't trigger Rust recompile
The frontend build runs first (`beforeBuildCommand`), then Cargo compiles. If only frontend changed, Cargo may show `Finished` without `Compiling` — that's fine, the new frontend assets are embedded in the existing binary.

### `tauri dev` vs `tauri build`
- `tauri dev`: Fast iteration, hot-reload for frontend, debug Rust binary. Use during development.
- `tauri build`: Production build, creates `.app` bundle and `.dmg`. Use for testing the real app experience.

## Checklist (copy-paste for every build)

```
1. [ ] Build completed successfully
2. [ ] Verified changes in compiled output
3. [ ] Replaced /Applications copy with new build
4. [ ] Killed old app process
5. [ ] Launched from /Applications (not build dir)
6. [ ] User confirmed changes are visible
```

## Project-Specific Notes

For `transcribe-cli/desktop`:
- App name: `transcribe.app`
- Binary name: `transcribe-app`
- Build path: `desktop/src-tauri/target/release/bundle/macos/transcribe.app`
- DMG path: `desktop/src-tauri/target/release/bundle/dmg/transcribe_0.1.0_aarch64.dmg`
- Typecheck has known false positives from `src-tauri/target/` binary files
