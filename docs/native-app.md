# The native app (Tauri) — decided 2026-10-21

## Why

Browser flashing works and was proven first. What killed it as the customer's
path is a pair of facts measured the same evening (`docs/card-access.md`):

- the Teensy bootloader runs the firmware again by itself ~3 s after a soft
  reboot if nothing starts programming it;
- Chrome cannot remember a device with no serial number, and HalfKay has none.

So in a browser every update means picking a nameless device in a dialog
inside a three-second window. Survivable with retries, not something to hand a
musician. A native app gets the device from the OS with no dialog, so reboot →
claim → flash is one uninterrupted sequence. The code was structured for this
from the start: the flasher takes a `Transport`, and the native build swaps
one file.

## Shape

| Path | What |
|---|---|
| `src-tauri/` | The Rust shell. `src/lib.rs` holds the device commands; nothing else is native. |
| `src/transport/tauri.js` | The `Transport` for the native app — wraps the Rust commands in the same shape as `webhid.js`. Plus `serial` (list / query / reboot). |
| `app/` | The page the native window shows. Imports the core from `app/src/`, a copy of `src/` made by `npm run sync` (Tauri embeds only this folder, and imports cannot climb out of it). `app/src/` is git-ignored. |
| `src/` | Unchanged: hex parser, HalfKay protocol, verification, product table. Shared by the browser build, the spikes and the app. |

Rust commands (`src-tauri/src/lib.rs`):

| Command | Does |
|---|---|
| `serial_list` | USB serial ports with vid/pid/product string; the page keeps the ones whose product string is in `devices.js` |
| `serial_query` | write text, return what the pedal prints within a wait — the `?` identity line today, the `@` protocol later |
| `serial_reboot` | open at 134 baud: the Teensy core's reboot-to-bootloader trigger |
| `hid_claim` | poll-open the bootloader by vid:pid until it appears or a timeout passes |
| `hid_write` | one HalfKay report (report id 0 prepended) |
| `hid_close` | release it |

Commands are `async` so their blocking waits run off the UI thread.

## Running it

Toolchain on this Mac: Node (Homebrew), Rust via `brew install rustup` +
`rustup default stable` (2026-10-21; `rustup` is keg-only, `~/.zshrc` adds
`/opt/homebrew/opt/rustup/bin` to PATH), Xcode command line tools.

    npm install          # Tauri CLI
    npm run dev          # sync src → app/src, build, open the window
    npm run build        # .app + .dmg in src-tauri/target/release/bundle/

Edits to `src/` need a re-sync (`npm run sync`, or restart `npm run dev`).

## Milestones

1. **Native transport, hands-free update.** `app/index.html`: find the pedal,
   read its identity, parse a `.hex`, reboot, claim, flash, confirm. Bench UI.
   ← here.
2. **Hardware gate**: refuse a file whose `hw=` does not match the pedal's
   (the firmware's `?` line carries `hw=FATES00` from the 2026-10-22 build on).
3. **The real UI** (`docs/ux.md`): one screen, one button, plain words.
4. **Signed manifest** from nawiacybernetyka.com (`src/verify.js`).
5. **Card management** over the `@` protocol (`docs/card-access.md`).
6. **Icon**: `Graphics/build_circle_icon.py --install-crossroads` writes the
   indigo-frost mark + `Crossroads.icns` into `assets/icon/`; point
   `bundle.icon` at it.
7. **Signing / notarization** for distribution (Apple Developer ID, Windows
   code signing) — the cost the browser route avoided; needed before the first
   customer download.

## Not decided

- Windows and Linux builds are untested; hidapi and serialport both support
  them, and Tauri bundles for all three.
- Whether the browser build stays public as a fallback or becomes bench-only.
