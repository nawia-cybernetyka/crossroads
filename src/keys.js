/**
 * The firmware-signing PUBLIC key. Shipping it is the point — it is what lets
 * every copy of the app verify a download really came from Nawia.
 *
 * ⚠ PLACEHOLDER. Generate the real keypair offline before the first release:
 *
 *   openssl genpkey -algorithm ed25519 -out nawia-firmware.key   # keep OFFLINE
 *   openssl pkey -in nawia-firmware.key -pubout -outform DER \
 *     | tail -c 32 | base64                                      # paste below
 *
 * Back the private key up in two physical places before signing anything: lose
 * it and every future release needs a new key AND an app update to carry it.
 */
export const FIRMWARE_PUBLIC_KEY_B64 = "REPLACE_ME_BEFORE_FIRST_RELEASE";
