/**
 * Intel HEX parser.
 *
 * A .hex file is text: each line describes a small run of bytes and where in
 * memory they belong.  We flatten it into one image so the flasher can walk
 * fixed-size blocks.
 *
 * Record layout:  :LLAAAATT[DD...]CC
 *   LL = byte count, AAAA = 16-bit address, TT = record type,
 *   DD = data, CC = two's-complement checksum over everything before it.
 *
 * Only the record types a Teensy build emits are handled; anything else throws.
 * A silently skipped record means flashing a subtly wrong image, which is much
 * worse than refusing the file.
 */

/**
 * @typedef {object} HexImage
 * @property {Uint8Array} data   Flat image, gaps filled with 0xFF (erased flash).
 * @property {number} length     Highest address written, + 1.
 */

/**
 * @param {string} text
 * @param {number} maxSize   Size of the flash region.
 * @param {number} [flashBase] Subtracted from every address. Teensy 4.x .hex
 *   files address flash at 0x60000000; HalfKay wants offsets from zero.
 * @returns {HexImage}
 */
export function parseIntelHex(text, maxSize, flashBase = 0) {
  const data = new Uint8Array(maxSize).fill(0xff);
  let highest = 0;
  // Records carry 16-bit addresses; type-04 records supply the upper bits.
  let addressBase = 0;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") continue;
    if (!line.startsWith(":")) throw new Error(`Line ${i + 1}: not an Intel HEX record.`);

    const bytes = hexToBytes(line.slice(1), i + 1);
    if (bytes.length < 5) throw new Error(`Line ${i + 1}: record too short.`);

    const count = bytes[0];
    const addr16 = (bytes[1] << 8) | bytes[2];
    const type = bytes[3];
    const payload = bytes.slice(4, 4 + count);

    if (payload.length !== count) {
      throw new Error(`Line ${i + 1}: byte count says ${count}, found ${payload.length}.`);
    }
    // Every byte, checksum included, must sum to 0 mod 256.
    if (bytes.reduce((a, b) => (a + b) & 0xff, 0) !== 0) {
      throw new Error(`Line ${i + 1}: bad checksum.`);
    }

    switch (type) {
      case 0x00: {
        const absolute = addressBase + addr16;
        const at = absolute - flashBase;
        if (at < 0 || at + count > maxSize) {
          throw new Error(
            `Line ${i + 1}: address 0x${absolute.toString(16)} is outside flash ` +
            `(base 0x${flashBase.toString(16)}, size ${maxSize}).`);
        }
        data.set(payload, at);
        highest = Math.max(highest, at + count);
        break;
      }
      case 0x01:
        // End of file. Anything after it is ignored by design.
        return { data, length: highest };
      case 0x04:
        addressBase = ((payload[0] << 8) | payload[1]) << 16;
        // `<< 16` on a value ≥ 0x8000 would go negative under JS's signed
        // 32-bit bitwise ops. 0x6000 is safe, but be explicit rather than lucky.
        addressBase = addressBase >>> 0;
        break;
      case 0x03:
      case 0x05:
        // Start Segment / Start Linear Address: the entry point the program
        // should begin at. It is METADATA, not flash content — HalfKay decides
        // where to start on its own, so this is ignored, exactly as
        // teensy_loader_cli does. Found in a real Fates build 2026-08-22, where
        // throwing on it stopped the parse at line 7046.
        break;
      case 0x02:
        throw new Error(`Line ${i + 1}: segment addressing is not supported.`);
      default:
        throw new Error(`Line ${i + 1}: unsupported record type 0x${type.toString(16)}.`);
    }
  }
  throw new Error("File ended without an end-of-file record — it may be truncated.");
}

/** @returns {Uint8Array} */
function hexToBytes(s, lineNo) {
  if (s.length % 2 !== 0) throw new Error(`Line ${lineNo}: odd number of hex digits.`);
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(s.substr(i * 2, 2), 16);
    if (Number.isNaN(byte)) throw new Error(`Line ${lineNo}: not hex.`);
    out[i] = byte;
  }
  return out;
}
