/**
 * Product + platform facts.  One utility serves the whole Nawia line, so every
 * product-specific value lives HERE and nowhere else.
 *
 * ✅ VERIFIED ON HARDWARE 2026-08-22 (Teensy 4.1, serial 20508910): Chrome
 * claimed the bootloader at 0x16C0/0x0478 via WebHID and flashed it end to end.
 * Observed ids on this board: 0x0478 bootloader (no product string at all),
 * 0x0486 running a RawHID build, 0x0483 running a Serial build.
 *
 * ⚠ DO NOT MATCH PRODUCTS BY PRODUCT ID.  The same board enumerated as 0x0486
 * ("Teensyduino RawHID") while running firmware.  A Teensy's product id tracks
 * the USB TYPE CHOSEN AT COMPILE TIME, not the product — Serial, MIDI and
 * RawHID builds all report different ids from identical hardware.  Only the
 * BOOTLOADER id is stable, because it belongs to the separate bootloader chip.
 * Running firmware is identified by its USB PRODUCT STRING, which is ours to set.
 */
export const PJRC_VENDOR_ID = 0x16c0;
export const HALFKAY_PRODUCT_ID = 0x0478;

/**
 * Teensy 4.1 flash geometry.
 *
 * `flashBase` is the one that bites.  A Teensy 4.x .hex addresses flash at
 * 0x60000000 (its address in the CPU's memory map), but HalfKay wants OFFSETS
 * from the start of flash.  Without subtracting this, every record in a real
 * build lands ~1.6 GB out of range.  Caught 2026-08-22 by reading the first
 * line of an actual firmware.hex before flashing it.
 */
export const TEENSY41 = {
  flashBase: 0x60000000,
  codeSize: 8126464,
  blockSize: 1024,
  /** Data begins 64 bytes into the report; the address occupies the first 3. */
  dataOffset: 64,
};

/** @typedef {"halfkay" | "dfu"} BootloaderKind */

/**
 * @typedef {object} Product
 * @property {string} code            Model code, matching the inventory database.
 * @property {string} displayName     Name the customer sees.
 * @property {string} usbProductString USB product string the RUNNING firmware
 *   advertises. ⚠ SET THIS IN FIRMWARE FIRST — until each platformio.ini
 *   overrides the USB descriptor, every product reports "Teensyduino" and they
 *   cannot be told apart. Do it before any unit ships, or you will need to
 *   firmware-update a device you cannot identify.
 * @property {boolean} supportsFileTransfer
 * @property {BootloaderKind} bootloader
 * @property {number} recoveryButtons How many recessed buttons the enclosure has.
 */

/** @type {Product[]} */
export const PRODUCTS = [
  { code: "FATES", displayName: "Mœræ", usbProductString: "Nawia Moerae",
    supportsFileTransfer: true, bootloader: "halfkay", recoveryButtons: 1 },
  { code: "LESHY", displayName: "Leshy", usbProductString: "Nawia Leshy",
    supportsFileTransfer: false, bootloader: "halfkay", recoveryButtons: 1 },
  // Daisy Seed3, not Teensy: different MCU, different bootloader (USB DFU),
  // different browser API (WebUSB), and TWO recovery buttons because STM32 DFU
  // entry is hold-BOOT-tap-RESET. Button count UNCONFIRMED — see Rusalka/HARDWARE.md.
  { code: "RUS", displayName: "Rusalka", usbProductString: "Nawia Rusalka",
    supportsFileTransfer: false, bootloader: "dfu", recoveryButtons: 2 },
];
