// Milestone 1 of the native app: the whole update, hands-free.
//
//   find the pedal → read its identity → parse the .hex FIRST →
//   reboot (134 baud) → claim HalfKay as it appears → flash at once →
//   wait for the pedal to come back → read its identity again.
//
// The order matters because of the bootloader's ~3 s patience (see
// docs/card-access.md): nothing slow may sit between the reboot and the first
// block, so the hex is parsed before the pedal is touched.
//
// `./src/` is a copy of the repo's `src/` made by `npm run sync` — Tauri embeds
// only this folder, and relative imports cannot climb out of it.

import { parseIntelHex } from "./src/ihex.js";
import { TEENSY41, PJRC_VENDOR_ID, PRODUCTS } from "./src/devices.js";
import { flashHex } from "./src/halfkay.js";
import { TauriHidTransport, serial, isTauri } from "./src/transport/tauri.js";

const $ = (id) => document.getElementById(id);
const logEl = $("log");
const log = (msg, cls = "") => {
  const line = document.createElement("div");
  if (cls) line.className = cls;
  line.textContent = `[${(performance.now() / 1000).toFixed(2)}s] ${msg}`;
  logEl.appendChild(line); logEl.scrollTop = 1e9;
};
const status = (s) => { $("status").textContent = s; };

let hexText = null;
let port = null;          // the chosen serial port path
let product = null;       // the PRODUCTS entry matched by USB product string

function refreshButtons() {
  $("identify").disabled = !port;
  $("update").disabled = !(port && hexText);
  $("pinhole").disabled = !hexText;
}

/** Keep only our pedals: PJRC vendor id and a product string from the table. */
function ours(ports) {
  return ports.filter((p) => p.vid === PJRC_VENDOR_ID && PRODUCTS.some((d) => d.usbProductString === p.product))
    // macOS lists each port twice; the cu.* node is the one to open.
    .filter((p) => !p.path.includes("/tty."));
}

async function findPedals() {
  const sel = $("ports"); sel.innerHTML = "";
  const list = ours(await serial.list());
  for (const p of list) {
    const o = document.createElement("option");
    o.value = p.path; o.textContent = `${p.product} — ${p.path}`;
    sel.appendChild(o);
  }
  port = list[0]?.path ?? null;
  product = list[0] ? PRODUCTS.find((d) => d.usbProductString === list[0].product) : null;
  log(list.length ? `found ${list.length} pedal(s): ${list.map((p) => p.product).join(", ")}` : "no pedal found — is it powered and plugged into COMPUTER?", list.length ? "ok" : "bad");
  refreshButtons();
  return list;
}

/** The `?` reply's first line is machine-readable: key=value pairs. */
function parseIdentity(text) {
  const line = text.split("\n").find((l) => l.startsWith("product="));
  if (!line) return null;
  return Object.fromEntries(line.trim().split(/\s+/).map((kv) => kv.split("=")));
}

async function identify(path = port) {
  const reply = await serial.query(path, "?", 600);
  const id = parseIdentity(reply);
  if (!id) throw new Error("the pedal did not answer the identity query");
  $("identity").textContent = `${product?.displayName ?? id.product} · model ${id.model} · firmware ${id.firmware}${id.hw ? ` · hardware ${id.hw}` : ""}`;
  log(`identity: ${Object.entries(id).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  return id;
}

/** Wait for a pedal's serial port to come back after a flash. */
async function waitForPedal(timeoutMs = 10000) {
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    const list = ours(await serial.list());
    if (list.length) return list[0].path;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("the pedal did not come back after flashing");
}

async function flash(transport) {
  const t0 = performance.now();
  await flashHex(transport, hexText, (p) => {
    $("bar").max = p.total || 1; $("bar").value = p.written;
    if (p.phase === "erasing") status("Erasing…");
    if (p.phase === "writing") status(`Writing ${p.written}/${p.total}`);
    if (p.phase === "rebooting") status("Starting the pedal…");
  });
  log(`flashed in ${((performance.now() - t0) / 1000).toFixed(1)} s`, "ok");
}

$("refresh").onclick = () => findPedals().catch((e) => log(e.message, "bad"));
$("ports").onchange = (e) => { port = e.target.value; refreshButtons(); };
$("identify").onclick = () => identify().catch((e) => log(e.message, "bad"));

$("file").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  hexText = await f.text();
  try {
    const img = parseIntelHex(hexText, TEENSY41.codeSize, TEENSY41.flashBase);
    const blocks = Math.ceil(img.length / TEENSY41.blockSize);
    $("fileinfo").textContent = `${f.name} — ${blocks} blocks`;
    log(`parsed ${f.name}: ${img.length.toLocaleString()} bytes, ${blocks} blocks`, "ok");
  } catch (err) {
    hexText = null; $("fileinfo").textContent = "";
    log(`not a usable firmware file: ${err.message}`, "bad");
  }
  refreshButtons();
};

$("update").onclick = async () => {
  const transport = new TauriHidTransport();
  try {
    $("update").disabled = true;
    status("Rebooting the pedal…");
    const t0 = performance.now();
    await serial.reboot(port);
    log(`reboot request sent (${(performance.now() - t0).toFixed(0)} ms)`);
    await transport.open(4000);
    log(`bootloader claimed at +${(performance.now() - t0).toFixed(0)} ms — ${transport.label}`, "ok");
    await flash(transport);
    await transport.close();
    status("Waiting for the pedal…");
    port = await waitForPedal();
    await findPedals();
    const id = await identify(port);
    status(`Done — firmware ${id.firmware}`);
  } catch (err) {
    log(err.message, "bad");
    status("Update failed. Hold BOOT while plugging in, then use the second button.");
    await transport.close().catch(() => {});
  } finally { refreshButtons(); }
};

$("pinhole").onclick = async () => {
  const transport = new TauriHidTransport();
  try {
    status("Looking for the bootloader…");
    await transport.open(1500);
    log(`bootloader found — ${transport.label}`, "ok");
    await flash(transport);
    await transport.close();
    status("Done. Power-cycle if the pedal does not come back by itself.");
  } catch (err) {
    log(err.message, "bad");
    status("No pedal in the bootloader. Hold BOOT while plugging in.");
  }
};

if (!isTauri()) log("This page needs the native app (npm run dev). In a browser use spike/flash.html.", "bad");
else findPedals().catch((e) => log(e.message, "bad"));
