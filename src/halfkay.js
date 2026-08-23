/**
 * HalfKay — the Teensy bootloader protocol.
 *
 * Reimplemented rather than borrowed: PJRC's teensy_loader_cli is GPLv3, and
 * the browser needs its own implementation regardless — you cannot invoke a
 * native binary from a web page.
 *
 * HalfKay is a USB HID device accepting exactly one kind of report: a 3-byte
 * address followed by a block of data at a fixed offset.  It NEVER REPLIES.
 * Three behaviours are implied rather than commanded:
 *   - writing offset 0 ERASES the whole chip (so it goes first, and it is slow);
 *   - writing any other offset programs one block;
 *   - writing 0xFFFFFF LEAVES the bootloader and runs the application.
 *
 * ⚠ 0xFFFFFF IS NOT HOW YOU ENTER THE BOOTLOADER. It is how you leave it. This
 * was mistested on 2026-08-22: the packet was sent to running firmware, which
 * ignored it. Entering HalfKay from firmware needs a Teensyduino side-channel
 * that is still unidentified; the recessed button is the known-good route.
 *
 * ✅ VERIFIED END TO END 2026-08-22 on a Teensy 4.1 (serial 20508910): flashed a
 * 110-block Fates build from Chrome in 3.7s. The board left HalfKay (0x0478,
 * no product string) and came back as USB Serial (0x0483), independently
 * confirmed on the USB bus rather than trusted from this code's own report.
 * That settles block size 1024, data offset 64, the 3s erase delay, and
 * offset-rather-than-absolute addressing.
 */
import { TEENSY41 } from "./devices.js";
import { parseIntelHex } from "./ihex.js";

/**
 * @typedef {object} FlashProgress
 * @property {number} written
 * @property {number} total
 * @property {"parsing"|"erasing"|"writing"|"rebooting"|"done"} phase
 */

/**
 * Flash one .hex through an already-open transport.
 *
 * @param {{send: (d: Uint8Array) => Promise<void>}} transport
 * @param {string} hexText
 * @param {(p: FlashProgress) => void} [onProgress]
 * @param {(ms: number) => Promise<void>} [sleep] Injected so tests run instantly.
 */
export async function flashHex(transport, hexText, onProgress = () => {}, sleep = defaultSleep) {
  const { blockSize, dataOffset, codeSize, flashBase } = TEENSY41;

  onProgress({ written: 0, total: 0, phase: "parsing" });
  const image = parseIntelHex(hexText, codeSize, flashBase);

  // Round up to whole blocks — the tail is already 0xFF from the parser.
  const total = Math.ceil(image.length / blockSize);
  if (total === 0) throw new Error("The firmware file contains no data.");

  onProgress({ written: 0, total, phase: "erasing" });

  for (let block = 0; block < total; block++) {
    const address = block * blockSize;
    const packet = new Uint8Array(dataOffset + blockSize);

    // 3-byte little-endian OFFSET (not absolute address) in the first three
    // bytes; bytes 3..63 stay zero — they pad out to the data offset.
    packet[0] = address & 0xff;
    packet[1] = (address >> 8) & 0xff;
    packet[2] = (address >> 16) & 0xff;
    packet.set(image.data.subarray(address, address + blockSize), dataOffset);

    await transport.send(packet);

    if (block === 0) {
      // The first write triggers a full-chip erase. Writing again before it
      // finishes loses the block silently, so wait generously.
      await sleep(3000);
      onProgress({ written: 1, total, phase: "writing" });
    } else {
      await sleep(5);
      onProgress({ written: block + 1, total, phase: "writing" });
    }
  }

  onProgress({ written: total, total, phase: "rebooting" });
  await runApplication(transport);
  onProgress({ written: total, total, phase: "done" });
}

/** Offset 0xFFFFFF: leave the bootloader and run the freshly flashed firmware. */
export async function runApplication(transport) {
  const { blockSize, dataOffset } = TEENSY41;
  const packet = new Uint8Array(dataOffset + blockSize);
  packet[0] = 0xff; packet[1] = 0xff; packet[2] = 0xff;
  await transport.send(packet);
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
