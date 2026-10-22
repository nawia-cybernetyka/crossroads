//! Native transports for the Crossroads utility.
//!
//! The browser build reaches the pedal through WebHID and Web Serial, and both
//! make the customer pick the device in a dialog. On the Teensy bootloader that
//! is a three-second race (see docs/card-access.md). Here the OS hands us the
//! device directly, so reboot → claim → flash is one uninterrupted sequence.
//!
//! Everything device-facing is a `#[tauri::command]` the page calls with
//! `invoke`. The JavaScript core (hex parser, HalfKay protocol, verification)
//! is unchanged: `src/transport/tauri.js` wraps these commands in the same
//! `Transport` shape the WebHID backend has.
//!
//! Rust notes for a reader new to it: a `#[tauri::command]` is an ordinary
//! function the webview may call; `State` is Tauri's way of handing a function
//! shared app-wide data; `Mutex` makes that data safe to touch from any thread;
//! `Result<T, String>` is "either a value or an error message", and the `?`
//! operator returns the error early.

use std::io::{Read, Write};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::State;

/// The one open bootloader device (there is never more than one pedal in the
/// bootloader at a time), plus the hidapi context that owns it.
struct Hid {
    api: Mutex<Option<hidapi::HidApi>>,
    device: Mutex<Option<hidapi::HidDevice>>,
}

#[derive(Serialize)]
struct PortInfo {
    path: String,
    vid: u16,
    pid: u16,
    manufacturer: Option<String>,
    product: Option<String>,
    serial: Option<String>,
}

/// Every USB serial port on the machine, with its USB identity. The page keeps
/// the ones whose product string is ours ("Nawia Moerae", …).
#[tauri::command]
async fn serial_list() -> Result<Vec<PortInfo>, String> {
    let ports = serialport::available_ports().map_err(|e| e.to_string())?;
    Ok(ports
        .into_iter()
        .filter_map(|p| match p.port_type {
            serialport::SerialPortType::UsbPort(u) => Some(PortInfo {
                path: p.port_name,
                vid: u.vid,
                pid: u.pid,
                manufacturer: u.manufacturer,
                product: u.product,
                serial: u.serial_number,
            }),
            _ => None,
        })
        .collect())
}

/// Send `text` to the running firmware and return whatever it prints within
/// `wait_ms`. Used for the `?` identity line (and later the `@` protocol).
#[tauri::command]
async fn serial_query(path: String, text: String, wait_ms: u64) -> Result<String, String> {
    let mut port = serialport::new(&path, 115_200)
        .timeout(Duration::from_millis(50))
        .open()
        .map_err(|e| format!("open {path}: {e}"))?;
    port.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    let mut buf = [0u8; 4096];
    let deadline = Instant::now() + Duration::from_millis(wait_ms);
    while Instant::now() < deadline {
        match port.read(&mut buf) {
            Ok(0) => {}
            Ok(n) => out.extend_from_slice(&buf[..n]),
            Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(String::from_utf8_lossy(&out).into_owned())
}

/// Reboot the pedal into its bootloader. Opening the port at 134 baud is the
/// Teensy core's trigger (`usb.c`: the line-coding request arms an ~80 ms
/// timer that jumps to HalfKay). Measured 2026-10-21: the serial device is
/// gone within ~60 ms and the bootloader is on the bus ~0.3 s later — and it
/// gives up after ~3 s if nothing starts programming it, which is why the
/// page calls `hid_claim` the instant this returns.
#[tauri::command]
async fn serial_reboot(path: String) -> Result<(), String> {
    let port = serialport::new(&path, 134)
        .timeout(Duration::from_millis(50))
        .open()
        .map_err(|e| format!("open {path} at 134 baud: {e}"))?;
    std::thread::sleep(Duration::from_millis(120));
    drop(port);
    Ok(())
}

/// Claim the bootloader: keep trying to open vid:pid until it appears or
/// `timeout_ms` passes. Returns the device's product string (HalfKay has none,
/// so a fixed label). Polling is the whole point — the bootloader shows up a
/// few hundred ms after the reboot and leaves ~3 s later.
#[tauri::command]
async fn hid_claim(hid: State<'_, Hid>, vid: u16, pid: u16, timeout_ms: u64) -> Result<String, String> {
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    loop {
        {
            let mut api_guard = hid.api.lock().map_err(|e| e.to_string())?;
            if api_guard.is_none() {
                *api_guard = Some(hidapi::HidApi::new().map_err(|e| e.to_string())?);
            }
            let api = api_guard.as_mut().unwrap();
            api.refresh_devices().map_err(|e| e.to_string())?;
            if let Ok(dev) = api.open(vid, pid) {
                let label = dev
                    .get_product_string()
                    .ok()
                    .flatten()
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| "Teensy bootloader".to_string());
                *hid.device.lock().map_err(|e| e.to_string())? = Some(dev);
                return Ok(label);
            }
        }
        if Instant::now() >= deadline {
            return Err(format!("no bootloader ({vid:04x}:{pid:04x}) appeared within {timeout_ms} ms"));
        }
        std::thread::sleep(Duration::from_millis(40));
    }
}

/// One HalfKay report. The page sends the bytes exactly as the WebHID backend
/// would (3-byte offset, padding, 1024 data bytes); hidapi wants a leading
/// report id, and 0 means "none", which the macOS backend strips again.
#[tauri::command]
async fn hid_write(hid: State<'_, Hid>, data: Vec<u8>) -> Result<usize, String> {
    let guard = hid.device.lock().map_err(|e| e.to_string())?;
    let dev = guard.as_ref().ok_or("bootloader is not open")?;
    let mut report = Vec::with_capacity(data.len() + 1);
    report.push(0);
    report.extend_from_slice(&data);
    dev.write(&report).map_err(|e| e.to_string())
}

#[tauri::command]
async fn hid_close(hid: State<'_, Hid>) -> Result<(), String> {
    *hid.device.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Hid { api: Mutex::new(None), device: Mutex::new(None) })
        .invoke_handler(tauri::generate_handler![
            serial_list,
            serial_query,
            serial_reboot,
            hid_claim,
            hid_write,
            hid_close
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
