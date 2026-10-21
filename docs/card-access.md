# Card access — THROUGH THE PEDAL, over USB (decided 2026-10-20)

## The decision

The tool reaches a pedal's cards **through the pedal, over the USB serial port the
firmware already exposes.** A card reader in the computer is an *optional* second
route for the external SD only, added later.

Why it had to be USB:

- **The internal card never leaves the pedal.** Mœræ's library card is the
  Teensy's onboard microSD, behind the lid. A reader cannot reach it, and the
  internal card is the one a customer fills first.
- **Leshy has no card.** Its only use of the tool is firmware, over the same
  serial identity path, so the USB route is shared across the line rather than a
  Mœræ special.
- **The external card is swappable, so a reader is a convenience, not the
  design.** When it comes, it plugs into the same editor as a second *card
  source* (Chrome's File System Access API on a mounted card). Nothing in the
  editor should know which route the bytes took.

Consequence: **file transfer needs firmware support**, and that protocol is what
the rest of this document specifies. The Teensy has no USB mass storage and
macOS has no MTP, which is why the tool exists at all (see the README).

## What already exists on the pedal

- **USB type is Serial.** The firmware builds with Teensyduino's default USB
  type, so the running pedal is a CDC serial device (plus the separate USB
  *host* port for a keyboard, which is unrelated). Product string
  `Nawia Moerae`, matched byte-for-byte by `src/devices.js`.
- **A one-character bench console** on that port. `?` prints the identity line
  (`product=Moerae model=FATES firmware=0.1.0-dev`, machine-readable, first
  line) followed by the licence notice and a human help text; single letters
  toggle bench diagnostics. The file protocol must not collide with it.
- **Two mounted filesystems**, `int` (SDIO) and `ext` (SPI, hot-swappable,
  probed before every mount so an empty slot costs microseconds). Songs are read
  whole into a RAM buffer at load; **the card is never touched while music
  plays**, and that guarantee is the stage-safety rule this protocol inherits.
- **Soft reboot into the bootloader, for free.** The Teensy 4 core reboots
  into HalfKay when the host sets the serial port's line coding to **134 baud**
  (`usb.c`, `usb_cdc_line_coding[0] == 134` → `_reboot_Teensyduino_()` after
  ~80 ms). Web Serial can do that: `port.open({ baudRate: 134 })`. 134 is a
  standard POSIX rate, so macOS accepts it. **The mechanism is proven on the
  pedal:** PlatformIO's upload (the Teensy Loader, which sends exactly this)
  rebooted a running Mœræ into HalfKay through the panel port during the
  2026-10-19/20 bench sessions — *most* of the time. It failed occasionally and
  needed the button. ⚠ Not yet tried from a browser — `spike/reboot.html`
  exists to try it. Two consequences: the recessed BOOT pinhole stays the
  documented recovery path, and **the update flow must expect the soft reboot
  to fail sometimes** — if HalfKay has not appeared within a few seconds, show
  the pinhole instruction rather than an error.

## The protocol

Text, line-oriented, **every command begins with `@`**. The console reads one
character at a time; `@` is the one character that switches it to "read to end
of line", so the two can share the port with no mode switch and no risk of a
bench letter being swallowed by a file transfer. Lines end in `\n`. Names are
UTF-8, exactly as the firmware reads them off the card.

Replies: `+` lines carry results, `-` lines are errors, and a lone `.` ends any
multi-line reply. One reply per command; the host never sends the next command
before the `.` (or the single `+`/`-`) of the previous one.

| Command | Reply | Notes |
|---|---|---|
| `@hello` | `+hello product=Moerae model=FATES hw=FATES00 firmware=0.1.0 proto=1 cards=int,ext` | Same fields as `?`'s first line, plus the protocol version and which card slots exist. **`hw=` is the hardware gate** — the tool refuses a firmware file built for other hardware. |
| `@cards` | `+card int mounted` / `+card ext absent` … `.` | Mount state right now; the external slot is probed first. |
| `@ls <card> <path>` | `+d <name>` / `+f <size> <name>` … `.` | One level. `<path>` is `/` or a folder. |
| `@get <card> <path>` | `+data <n>` then `n` raw bytes, then `+crc <hex8>` | Host checks the CRC before trusting the bytes. |
| `@put <card> <path> <n>` | `+go`, host sends `n` raw bytes, pedal answers `+ok crc=<hex8>` | **Writes to `<path>.part` and renames on success**, so a half-written song can never be seen by the player. Host compares the CRC; a mismatch means delete and retry. |
| `@rm <card> <path>` | `+ok` | Files only. Deleting a song should also delete its `.ports` — the *host's* job, so the pedal stays dumb. |
| `@mkdir <card> <path>` | `+ok` | A folder is a set. |
| `@rmdir <card> <path>` | `+ok` | Empty folders only. |
| `@mv <card> <from> <to>` | `+ok` | Rename within one card. Reordering a folder set is renames. |
| `@crc <card> <path>` | `+crc <hex8>` | Content check without the download; see "Comparing files". |
| `@sets` | `+set <card> <file-or-empty> <display name>` … `.` | The firmware's own catalogue, rescanned first. What the pedal will show in Menu > Sets. |
| `@boot` | `+bye` then the port vanishes | Reboot into HalfKay from firmware, for hosts where 134 baud is awkward. |

Errors, all one word so the tool can map them to sentences:

| Error | Meaning |
|---|---|
| `-busy` | The transport is not STOPPED. **No file operation runs while music plays or is paused** — the card is never touched then, by design. The tool tells the customer to stop the pedal. |
| `-nocard` | That slot has nothing mounted. |
| `-nofile` | Path does not exist. |
| `-exists` | `@mkdir` / `@mv` target already exists. The pedal never overwrites by itself; the host decides and deletes first. |
| `-full` | Card full. |
| `-name` | Bad name: empty, over the limit, contains `..`, or not valid UTF-8. |
| `-size` | `@put` larger than the song buffer, or `n` disagrees with the bytes received. |
| `-what` | Unknown command. |

Physical access is the only authentication: anyone holding the cable can already
hold a card. There is nothing to sign here.

### Limits, kept in `src/devices.js`

The firmware enforces them; the tool validates before sending so a customer is
never told "no" by a pedal after a long transfer. Current values:

| Limit | Value | Where it bites |
|---|---|---|
| Songs per set | 64 | more are silently ignored by the pedal |
| Sets per pedal | 32 | both cards together |
| Song size | the firmware's RAM song buffer | the pedal refuses to play a larger file rather than truncate it |
| Name length | 96 bytes of path (`Folder/song.mid`) | a set entry is folder + file |
| Display name | ~28 characters | the OLED trims with `>` |

### Comparing files

`@crc` is a **content** check — it changes when a note moves even if the byte
count does not — so it is the cheap "has it changed?" answer and the thing to
compare before copying between cards. The SHA-256 the setlist editor notes ask
for is computed in the browser over bytes it already holds; the pedal only ever
needs to say whether a file is the one the browser thinks it is. CRC32 is
hardware on the Teensy 4 (`FastCRC`), so the check is free.

### Flow, from the customer's side

1. **Connect** (Web Serial, user gesture, filter on the PJRC vendor id and our
   product string). `@hello` → the tool knows the model, hardware and version.
2. **Prepare the card**: `@sets`, `@ls`, drag, `@put`/`@mv`/`@rm`, then `@sets`
   again to show exactly what the pedal will offer in its menu.
3. **Update**: compare the version against the signed manifest, filter releases
   by `hw=`, then reboot (134 baud or `@boot`), claim HalfKay over WebHID, flash,
   wait for the serial identity to return, `@hello` to confirm the new version.

Every step that fails has one sentence and one action for the customer; the
error words above are the hooks for those sentences.

## Host-side shape

- `src/transport/webserial.js` — `SerialTransport`: open, read lines, read `n`
  bytes, write; the 134-baud reboot lives here because it is a transport trick.
- `src/cardfs.js` — the `@` protocol as functions: `hello()`, `ls()`, `get()`,
  `put()`, … with the error words thrown as typed errors.
- `src/cardsource.js` — the interface the set editor talks to: list, read,
  write, rename, delete, sets. Two implementations: the pedal (`cardfs.js`) and,
  later, a local directory through the File System Access API. The editor does
  not know which it has.

## Firmware side (not built)

- Extend the console: on `@`, read to `\n` and dispatch; everything else stays as
  it is.
- Refuse all `@` file commands unless the transport is STOPPED.
- `@put` to a `.part` name, rename on a matching CRC; delete the `.part` on any
  failure, and sweep stray `.part` files at boot.
- After any write, rescan the set catalogue so the menu and `@sets` agree.
- Add `hw=` and `proto=` to the `?` identity line as well, so a human and the tool
  read the same facts.

## Open

- [ ] Try `spike/reboot.html` on a pedal: does Chrome's 134-baud open reboot it
      into HalfKay, and can the same page then claim the bootloader over WebHID?
      (The mechanism itself is proven via PlatformIO; this tests the browser.)
- [ ] Why does the soft reboot occasionally fail from PlatformIO? If it is the
      ~80 ms timer racing the port close, the browser page can hold the port
      open longer before closing; if it is the pedal's firmware being busy, it
      is the firmware's problem.
- [ ] Measure `@put` throughput over the Teensy's CDC (480 Mbit USB, SPI card at
      8 MHz): is chunked acknowledgement needed, or does one `+go` suffice?
- [ ] Does a Web Serial port permission survive the re-enumeration after an
      update, or is a second Connect click unavoidable? (One click is fine; the
      UI just has to expect it.)
- [ ] Rusalka (Daisy Seed3, DFU over WebUSB) has none of this yet and no card.
