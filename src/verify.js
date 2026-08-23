/**
 * Firmware signature verification.
 *
 * WHY: this app downloads an executable and writes it into a device that goes
 * on stage. HTTPS protects the pipe between customer and server; it does
 * nothing if the SERVER is what got compromised. A signature checked here,
 * against a public key baked into the app, means a bad file is refused even if
 * it was served from our own bucket.
 *
 * KEY HANDLING — the whole scheme rests on this:
 *   - the PUBLIC key ships in this repo and in the app. Not a secret.
 *   - the PRIVATE key signs releases OFFLINE. It never enters this repo, the
 *     Worker, CI, or any internet-facing machine.
 */

/**
 * @typedef {object} FirmwareRelease
 * @property {string} product  Model code: FATES | LESHY | RUS.
 * @property {string} version
 * @property {string} url
 * @property {string} sha256    Lowercase hex of the .hex bytes.
 * @property {string} signature Base64 Ed25519 signature over those bytes.
 * @property {string} [notes]
 */

/**
 * @typedef {object} Manifest
 * @property {number} sequence  Increment on every publish; clients refuse to go back.
 * @property {FirmwareRelease[]} releases
 */

/**
 * Verify a downloaded image. Throws on ANY failure — there is deliberately no
 * "warn and continue" path. Refusing to flash is always recoverable.
 *
 * @param {Uint8Array} bytes
 * @param {FirmwareRelease} release
 * @param {Uint8Array} publicKeyRaw
 */
export async function verifyFirmware(bytes, release, publicKeyRaw) {
  // 1. Content hash — catches truncated/corrupt downloads with a clear error.
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hex = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex !== release.sha256.toLowerCase()) {
    throw new Error("Download does not match its expected hash — try again.");
  }
  // 2. Signature — proves it came from the offline private key, not just our server.
  const key = await crypto.subtle.importKey("raw", publicKeyRaw, { name: "Ed25519" }, false, ["verify"]);
  const sig = base64ToBytes(release.signature);
  if (!(await crypto.subtle.verify({ name: "Ed25519" }, key, sig, bytes))) {
    throw new Error("Firmware signature is not valid. This file was NOT published by Nawia.");
  }
}

/**
 * Refuse a manifest older than the newest one this client has seen. Without
 * this, an attacker who cannot forge a signature can still replay an OLD,
 * validly-signed manifest to push customers back onto a buggy version.
 * @param {Manifest} manifest @param {number} lastSeenSequence
 */
export function assertNotRolledBack(manifest, lastSeenSequence) {
  if (manifest.sequence < lastSeenSequence) {
    throw new Error(
      `Update server returned an older release list (${manifest.sequence} < ${lastSeenSequence}). ` +
      "Refusing, in case this is a rollback attack.");
  }
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
