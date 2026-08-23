# Device protocol notes

## Two MCU families, two bootloaders

The line is not one platform. This drives more of the design than it looks like:

| Product | MCU | Bootloader | Browser API | Recovery buttons | Panel port |
|---|---|---|---|---|---|
| Mœræ (FATES) | Teensy 4.1 | HalfKay (HID, write-only) | WebHID | 1 (Program pad) | micro-B |
| Leshy | Teensy 4.1 | HalfKay | WebHID | 1 | micro-B |
| Rusalka (RUS) | Daisy Seed3 / STM32 | USB DFU (request/response) | WebUSB | 2 (BOOT + RESET) | USB-C |

DFU is a **state machine** — you must read status back between blocks or you
will write into a device that is still erasing. HalfKay never answers at all.
That difference is why `ControlTransport` exists as a separate interface: the
type system refuses to hand a HID backend to the DFU flasher.

⚠ **Seed3's boot procedure is unconfirmed.** The local datasheet documents no
boot sequence and no button layout. Two buttons is the classic Daisy gesture,
carried forward on assumption. Verify against a physical board before drilling.
The standing rule for this part is to trust the local datasheet over
daisy.audio's web docs, which were already wrong once about the ADC count.

## Two USB identities

A Nawia pedal presents itself differently depending on what it is doing:

| State | Device class | Used for |
|---|---|---|
| Running firmware | USB Serial (+ MIDI) | version query, song/setlist transfer |
| Bootloader (HalfKay) | USB HID | firmware flashing |

They are different USB devices with different product ids, and the pedal
**re-enumerates** when it moves between them. Every awkward part of the update
flow comes from that one fact.

## Getting into the bootloader

Two routes, and the app should offer both:

1. **Soft** — ask the running firmware to reboot into HalfKay. Convenient, but
   depends on working firmware and on a clean handoff between two browser APIs.
   This is what `spike/` exists to test.
2. **Hard** — the customer holds the **recessed bootloader button** while the
   pedal is powered. Works even if the firmware is hung or a previous update
   failed. This is the documented recovery path and the reason the button was
   promoted from optional to required on both BOMs (2026-08-22).

## Open questions

- [x] ~~Confirm the HalfKay product id~~ — **0x16C0/0x0478 verified 2026-08-22**, claimed
      from Chrome via WebHID. Browser flashing is viable.
- [x] ~~Confirm block size 1024 / data offset 64~~ — **verified 2026-08-22** by
      flashing a 110-block Fates build end to end in 3.7s; confirmed via the USB
      identity change 0x0478 → 0x0483, not from the flasher's own report.
- [ ] **Find the real soft-reboot mechanism.** HalfKay's `0xFFFFFF` write means
      "jump to the application" and only works on a device ALREADY in the
      bootloader — it is the wrong direction. Getting from running firmware INTO
      HalfKay uses a Teensyduino side-channel that still needs identifying, and
      whatever it is must be reachable from a browser (WebHID or WebSerial) or
      the soft path is dead and the recessed button becomes the only route.
- [ ] Does a WebHID permission granted for the *serial* identity carry over to
      the *bootloader* identity? Untested — the reboot never happened, so this
      was never actually exercised.
- [ ] Decide the file-transfer protocol over USB Serial (Mœræ only).
- [ ] Confirm Seed3 DFU entry: is it BOOT+RESET, or single-button?
- [ ] Write the DFU protocol module (`src/dfu.ts`) against `ControlTransport`.
- [ ] Write the WebUSB backend (`src/transport/webusb.ts`) for Rusalka.
- [ ] Check whether libDaisy's software DFU trigger makes the buttons
      recovery-only, matching how the Teensy products behave.
- [x] ~~Set distinct USB product strings~~ — **Mœræ done 2026-08-22** via
      `Fates/firmware/src/usb_names.cpp` (manufacturer "Nawia Cybernetyka",
      product "Nawia Moerae"). Not a platformio.ini flag as originally assumed:
      Teensyduino declares the descriptors weakly in `usb_desc.c`, so a strong
      definition in `src/` overrides them with no build config at all.
      **Leshy still pending** — it has no firmware yet; a day-one note is filed
      in `Leshy/HARDWARE.md`. Rusalka (Daisy/STM32) needs its own mechanism.
