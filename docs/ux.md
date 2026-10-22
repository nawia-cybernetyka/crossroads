# UI / UX — unbuilt

**There is currently no customer-facing interface.** `spike/index.html` and
`spike/flash.html` are BENCH INSTRUMENTS: debug logs, raw hex, product IDs,
buttons labelled "1. Connect / 2. Reboot / 3. Reclaim". They exist to answer
engineering questions, and they answered them.

**They must not become the product by default.** Spike pages have a way of
quietly shipping because they work. This one would hand a musician a page
talking about HalfKay, `0x0478`, block counts and erase delays — none of which
is their problem.

## What the real thing has to do

Two jobs, from the customer's side:

- **Update my pedal.** Plug in, click once, watch a bar, done. The customer
  should never learn the word "bootloader", and ideally never learn "HalfKay".
- **Prepare my card.** Drag songs on, drag them into order, name the set, eject.

## Constraints that shape it, already known

- **Chrome or Edge only** (WebHID). The page must say so up front and gracefully,
  not fail at the connect step. A Safari user needs to know in the first sentence.
- **A visible Connect button every session** is unavoidable — the browser will not
  enumerate devices without a user gesture. Design with it, not around it.
- **The recessed bootloader button is the RECOVERY path, probably not the
  routine one.** The Teensy core reboots into the bootloader when the port is
  opened at 134 baud (see `docs/card-access.md`); if that holds up from Chrome,
  the customer never touches the pinhole unless an update fails. The pinhole
  sentence still has to be the right sentence, with a picture, on the failure
  screen. **Measured 2026-10-21: it works, with a catch** — the bootloader
  runs the firmware again after ~3 s if nothing starts programming it, and
  Chrome forgets the bootloader between updates, so **every update is "click
  Update, then pick your pedal in the dialog within about three seconds"**,
  with an automatic retry that brings the pedal back into the dialog if the
  click was late. The page needs a picture of that dialog with the right entry
  marked, because the bootloader has no name of its own.
- **Card-to-card copy and per-file overwrite** belong here rather than on the
  pedal, because a real screen affords them — see `setlist-editor.md`.
- **Stakes are high and the audience is not technical.** This writes firmware to
  an instrument someone gigs with. Confidence matters more than density: clear
  state, obvious progress, and a failure message that says what to do next rather
  than what went wrong internally.

## Open

- [ ] Decide whether the updater and the setlist editor are one page or two.
- [ ] What the customer sees when their pedal is already up to date.
- [ ] What happens on a failed flash — the recovery instruction has to be right
      there, not in a manual.
