# Nawia Crossroads Utility

The **Nawia Crossroads Utility** — **Crossroads**, once introduced — is the tool
that updates and manages [Nawia Cybernetyka](https://nawiacybernetyka.com)
pedals — **Mœræ** (model FATES), **Leshy** and **Rusalka** — from a PC or Mac.

Named for the crossroads: in Slavic folklore the place where the worlds meet, and
in the blues the place a musician goes to make a deal. Here it is where the
computer, the pedal's cards and its firmware meet. It runs in the browser today;
a native app may follow. (Until 2026-10-20 this repo was called *Styx*.)

Two jobs: **update firmware**, and **prepare the card** — transferring songs and
editing the setlist, which is drag-and-drop on a screen and miserable on a pedal.

Free for anyone with a device. No account, no licence check, no purchase
verification. Open source so that the thing writing to your pedal can be read
by the person who owns the pedal.

## Status

**Flashing works.** On 2026-08-22 this code flashed a real Teensy 4.1 from
Chrome — a 110-block Fates build in 3.7 seconds, confirmed by the board's USB
identity changing on the bus. Browser-based firmware updates are viable and a
native app is optional rather than required.

Mœræ now identifies itself as "Nawia Moerae" over USB, so the updater can tell
products apart. Still to build: the manifest endpoint, signing, and any UI. Rusalka's DFU path is unwritten. See [`spike/README.md`](spike/README.md)
for what was tested and [`docs/protocol.md`](docs/protocol.md) for what is open.

## How it works

One tool serves the whole line, but the line is **not one platform**: Mœræ and
Leshy are Teensy 4.1 (HalfKay over WebHID), while Rusalka is a Daisy Seed3
(STM32 DFU over WebUSB). See [`docs/protocol.md`](docs/protocol.md). Firmware is fetched
from nawiacybernetyka.com, checked against an Ed25519 signature, and written to
the pedal's bootloader over USB.

Delivery was **browser-first** (WebHID in Chrome or Edge: no install, no code
signing, no OS-specific builds), and browser flashing works. But the Teensy
bootloader gives up after ~3 s and Chrome cannot remember a device with no
serial number, so a browser update means picking a nameless device in a
three-second window on every update (`docs/card-access.md`). **Since
2026-10-21 the customer's app is native (Tauri)**: same UI and core, a
hidapi transport, no picker. The browser build remains the bench harness and
a fallback — see the seam below.

## The seam

Everything device-facing takes a `Transport` (today the shape of
[`WebHidTransport`](src/transport/webhid.js)) and
knows nothing about how bytes reach the pedal:

    ┌─────────────────────────────────────────┐
    │  UI                                     │
    ├─────────────────────────────────────────┤
    │  halfkay.js · ihex.js · verify.js       │  ← portable, no I/O
    ├─────────────────────────────────────────┤
    │  Transport (interface)                  │  ← the seam
    ├──────────────────────┬──────────────────┤
    │  WebHID (Teensy)     │  Rust: hidapi +  │
    │  WebUSB (Daisy/DFU)  │  serialport      │
    │  (bench / fallback)  │  (Tauri — the    │
    │                      │   customer app)  │
    └──────────────────────┴──────────────────┘

A native build reuses the same UI and core (plain JS + JSDoc, no build step)
and swaps one file.

## Layout

| Path | What |
|---|---|
| `src/transport/` | One backend per way of reaching a pedal; each exposes the same `Transport` shape |
| `src/transport/webhid.js` | Browser backend (Chrome/Edge) — bench and fallback |
| `src/transport/tauri.js` | Native backend: wraps the Rust commands in the same shape |
| `src-tauri/` | The native app's Rust shell (`src/lib.rs` = the device commands) |
| `app/` | The page the native window shows; `app/src/` is a synced copy of `src/` |
| `src/halfkay.js` | Teensy bootloader protocol, reimplemented (MIT, not GPL) |
| `src/dfu.js` | *(to write)* STM32 DFU, for Rusalka |
| `src/ihex.js` | Intel HEX parser |
| `src/verify.js` | SHA-256 + Ed25519 checks, rollback guard |
| `src/devices.js` | Product table — the only place product facts live |
| `src/keys.js` | Shipped **public** key (placeholder) |
| `spike/` | Bench pages: flash test, reboot-and-reclaim, 134-baud soft reboot |
| `docs/protocol.md` | Device protocol notes and open questions |
| `docs/native-app.md` | Why native, the shape, how to run it, milestones |
| `docs/card-access.md` | How the tool reaches the cards: through the pedal over USB, and the `@` file protocol |
| `docs/setlist-editor.md` | Setlist editor concept — the app's second job |
| `docs/ux.md` | UI is unbuilt; the spike pages are bench tools, not the product |

## Security model

Downloads are signed with an Ed25519 key held **offline**; the public half
ships in `src/keys.js`. TLS protects the connection, but a signature is what
protects the customer if the server itself is compromised. The manifest carries
a monotonic `sequence` so an old, validly-signed release list cannot be replayed
to push someone back onto a buggy version.

**Never commit:** the signing private key, Cloudflare tokens, or anything from
the private hardware repo. See `.gitignore`.

## Not in this repo

Pedal firmware source. Only signed `.hex` builds are published.

## Before the first release

- [x] ~~Verify HalfKay VID/PID and packet layout on real hardware~~ — done 2026-08-22
- [x] ~~USB product string — Mœræ~~ done via `usb_names.cpp` (not platformio.ini)
- [ ] USB product string — **Leshy**, when its firmware starts; Rusalka needs its own mechanism
- [ ] Generate the signing keypair; replace the placeholder public key
- [ ] Stand up the manifest endpoint on the Cloudflare Worker
- [x] ~~Decide the file-transfer protocol for Mœræ~~ — `docs/card-access.md`, 2026-10-20
- [ ] Build it: firmware `@` commands, `src/cardfs.js` over `serial.query`
- [ ] Native app milestones — `docs/native-app.md`
