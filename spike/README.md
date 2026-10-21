# Spike: reboot & reclaim

Run it (Node is not installed on this machine; the page is plain ES modules):

    cd ~/crossroads && python3 -m http.server 8080
    # then open http://localhost:8080/spike/ in Chrome or Edge

WebHID requires a secure context — `localhost` counts, so no TLS setup needed.

## Result, 2026-08-22 (Teensy 4.1, serial 20508910, Chrome)

**Step 1 PASSED.** With the board held in bootloader mode, Chrome claimed it via
WebHID at `0x16C0/0x0478` and identified it as HalfKay. This is the finding that
mattered: **browser-based firmware flashing is viable**, and a native app is
optional rather than required.

**Step 2 did not test what it claimed to.** The Reboot button sent a HalfKay
`0xFFFFFF` packet to a device running normal firmware (`0x0486`,
"Teensyduino RawHID"), which does not speak HalfKay and ignored it. The pedal
never entered the bootloader, so Reclaim had nothing to find. The failure was in
the spike, not in the browser.

Note also that `0xFFFFFF` means *"jump to the application"* — it is how you leave
the bootloader, not how you enter it. Entering HalfKay from running firmware
needs a Teensyduino side-channel that is still to be identified.

## Flash test, 2026-08-22 — PASSED

Flashed a real 110-block Fates build (112,640 bytes) through the actual
`src/ihex.js` and `src/halfkay.js` — not a copy — in **3.7 seconds**.

Confirmed on the USB bus rather than taken from the flasher's own report:

| | before | after |
|---|---|---|
| product id | `0x0478` | `0x0483` |
| product name | *(none)* | `USB Serial` |
| serial device | — | `/dev/cu.usbmodem205089101` |

Same board (serial 20508910). This verifies block size 1024, data offset 64,
the 3s erase delay, and offset-rather-than-absolute addressing.

**Two real bugs were caught by parsing before writing**, which is why the page
has a no-writes "Parse only" button:

1. **Flash base not subtracted.** Teensy 4.x .hex files address flash at
   0x60000000 (its address in the CPU memory map); HalfKay wants offsets from
   zero. Every record would have landed ~1.6 GB out of range.
2. **Record type 0x05 rejected.** Start Linear Address is metadata, not flash
   content, and the parser threw on it at line 7046. Now ignored, as
   teensy_loader_cli does.

A third, cosmetic: HalfKay reports `productName` as an empty string rather than
null, so a `??` fallback printed a blank device label.

## What this means for the product

The **recessed bootloader button is now the known-good update path**, not just a
fallback: hold it, the pedal comes up as HalfKay, the browser claims it, done.
That is one sentence in the manual and needs no soft-reboot at all — which is a
second, independent reason the button was right to promote from optional to
required on every BOM.

A working soft reboot would remove that one manual step. Worth having, not worth
blocking on.

## Next

1. Identify how Teensyduino triggers reboot-into-HalfKay from running firmware,
   and whether it is reachable from WebHID or WebSerial.
2. Flash a real `.hex` end-to-end through `src/halfkay.ts` with the board held in
   bootloader mode — this verifies block size, data offset and erase timing, the
   remaining unverified constants.
3. Only then build UI.
