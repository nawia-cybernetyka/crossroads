# Styx

**Styx** is the tool that updates and manages [Nawia Cybernetyka](https://nawiacybernetyka.com)
pedals — **Mœræ** (model FATES), **Leshy** and **Rusalka** — from a PC or Mac.

Named for the river you cross into the underworld, which is roughly what it does:
carries firmware over to the device. It runs in the browser today; a native app
may follow.

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

Delivery is **browser-first**: WebHID in Chrome or Edge means no install, no
code signing, and no OS-specific builds. A native app (Tauri) stays possible
later without a rewrite — see the seam below.

## The seam

Everything device-facing takes a [`Transport`](src/transport/transport.ts) and
knows nothing about how bytes reach the pedal:

    ┌─────────────────────────────────────────┐
    │  UI                                     │
    ├─────────────────────────────────────────┤
    │  halfkay.ts · ihex.ts · verify.ts       │  ← portable, no I/O
    ├─────────────────────────────────────────┤
    │  Transport (interface)                  │  ← the seam
    ├──────────────────────┬──────────────────┤
    │  WebHID (Teensy)     │  (future) Rust   │
    │  WebUSB (Daisy/DFU)  │  hidapi, Tauri   │
    └──────────────────────┴──────────────────┘

A native build reuses the same TypeScript UI and core and swaps one file.

## Layout

| Path | What |
|---|---|
| `src/transport/transport.ts` | The interface every backend implements |
| `src/transport/webhid.ts` | Browser backend (Chrome/Edge) |
| `src/halfkay.ts` | Teensy bootloader protocol, reimplemented (MIT, not GPL) |
| `src/dfu.ts` | *(to write)* STM32 DFU, for Rusalka |
| `src/ihex.ts` | Intel HEX parser |
| `src/verify.ts` | SHA-256 + Ed25519 checks, rollback guard |
| `src/devices.ts` | Product table — the only place product facts live |
| `src/keys.ts` | Shipped **public** key (placeholder) |
| `spike/` | Reboot-and-reclaim experiment |
| `docs/protocol.md` | Device protocol notes and open questions |
| `docs/setlist-editor.md` | Setlist editor concept — the app's second job |
| `docs/ux.md` | UI is unbuilt; the spike pages are bench tools, not the product |

## Security model

Downloads are signed with an Ed25519 key held **offline**; the public half
ships in `src/keys.ts`. TLS protects the connection, but a signature is what
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
- [ ] Decide the file-transfer protocol for Mœræ
