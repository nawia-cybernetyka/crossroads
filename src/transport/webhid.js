/**
 * WebHID transport — the browser half of the seam.
 *
 * ✅ VERIFIED 2026-08-22: claimed HalfKay on a real Teensy 4.1 from Chrome.
 *
 * Chrome and Edge only; Safari and Firefox have no WebHID and no polyfill is
 * possible (it needs OS-level device access). The browser will not enumerate
 * silently — `requestDevice` must come from a real click, and the customer
 * picks the device from a browser-drawn dialog. That is a platform privacy
 * guarantee, not something to engineer around.
 */
import { PJRC_VENDOR_ID, HALFKAY_PRODUCT_ID } from "../devices.js";

export function isWebHidAvailable() {
  return typeof navigator !== "undefined" && "hid" in navigator;
}

export class WebHidTransport {
  /** @type {HIDDevice | null} */
  #device = null;

  // `||` not `??`: HalfKay reports productName as an EMPTY STRING, not null,
  // so `??` let a blank label through. Seen in the 2026-08-22 flash run.
  get label() { return this.#device?.productName || "Teensy bootloader"; }
  get isOpen() { return this.#device?.opened ?? false; }

  /** Claim the bootloader. Prompts the user. */
  async open() {
    if (!isWebHidAvailable()) throw new Error("This browser has no WebHID. Use Chrome or Edge.");
    const devices = await navigator.hid.requestDevice({
      filters: [{ vendorId: PJRC_VENDOR_ID, productId: HALFKAY_PRODUCT_ID }],
    });
    if (devices.length === 0) throw new Error("No device selected.");
    this.#device = devices[0];
    if (!this.#device.opened) await this.#device.open();
  }

  /** Adopt an already-open device (e.g. one the spike page picked). */
  adopt(device) { this.#device = device; }

  /** @param {Uint8Array} data */
  async send(data) {
    if (!this.#device) throw new Error("Transport is not open.");
    // Report id 0: HalfKay does not use numbered reports.
    await this.#device.sendReport(0, data);
  }

  async close() {
    if (this.#device?.opened) await this.#device.close();
    this.#device = null;
  }
}
