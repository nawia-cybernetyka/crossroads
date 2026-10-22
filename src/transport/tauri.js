/**
 * Native transport — the Tauri half of the seam.
 *
 * Same shape as `WebHidTransport` (open / send / close / label / isOpen), so
 * `flashHex` cannot tell them apart. The difference is who hands over the
 * device: WebHID shows the customer a picker, and the Teensy bootloader gives
 * up ~3 s after it appears (docs/card-access.md); here the OS hands the device
 * straight to the Rust side, which polls for it and opens it the moment it
 * enumerates. No picker, no window to miss.
 *
 * The Rust commands live in src-tauri/src/lib.rs. `window.__TAURI__` exists
 * because tauri.conf.json sets `app.withGlobalTauri`, which saves bundling an
 * npm package into a page that otherwise has no build step.
 */
import { PJRC_VENDOR_ID, HALFKAY_PRODUCT_ID } from "../devices.js";

export function isTauri() {
  return typeof window !== "undefined" && !!window.__TAURI__?.core?.invoke;
}

function invoke(cmd, args) {
  if (!isTauri()) throw new Error("Not running inside the native app.");
  return window.__TAURI__.core.invoke(cmd, args);
}

export class TauriHidTransport {
  #label = null;

  get label() { return this.#label ?? "Teensy bootloader"; }
  get isOpen() { return this.#label !== null; }

  /**
   * Claim the bootloader, waiting up to `timeoutMs` for it to appear. Call this
   * immediately after `serial.reboot()`; 4 s covers the ~0.3 s it takes to
   * enumerate with margin, and is still inside the bootloader's patience.
   */
  async open(timeoutMs = 4000) {
    this.#label = await invoke("hid_claim", {
      vid: PJRC_VENDOR_ID, pid: HALFKAY_PRODUCT_ID, timeoutMs,
    });
  }

  /** @param {Uint8Array} data */
  async send(data) {
    if (!this.isOpen) throw new Error("Transport is not open.");
    await invoke("hid_write", { data: Array.from(data) });
  }

  async close() {
    if (this.isOpen) await invoke("hid_close");
    this.#label = null;
  }
}

/** The running firmware's serial port: list, ask, reboot. */
export const serial = {
  /** @returns {Promise<{path:string, vid:number, pid:number, manufacturer?:string, product?:string, serial?:string}[]>} */
  list: () => invoke("serial_list"),
  /** Send text (default `?`) and return what the pedal prints within waitMs. */
  query: (path, text = "?", waitMs = 600) => invoke("serial_query", { path, text, waitMs }),
  /** The 134-baud trick: the pedal leaves the bus and comes back as HalfKay. */
  reboot: (path) => invoke("serial_reboot", { path }),
};
