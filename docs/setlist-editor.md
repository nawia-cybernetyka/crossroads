# Setlist editor (concept, 2026-08-22)

## Why it belongs here and not on the pedal

Reordering a set is a **list manipulation** task. On a screen it is drag-and-drop
and takes seconds; on a pedal it is a rotary encoder, a 1.3" OLED and a lot of
clicking. The firmware deliberately does not try — it reads `setlist.txt` and
plays what it is told.

So the split is natural: **the pedal owns performance, the app owns preparation.**
That also raises the app from a thing you run when firmware ships to a thing you
open before every gig, which is a much better reason for it to exist.

## What it edits

Nothing exotic — `setlist.txt` at the card root, one filename per line, `#`
comments, blanks ignored. Because the format is plain text, the editor is
read → reorder → write, with no new on-device protocol beyond file access.

**This makes file transfer BIDIRECTIONAL.** The app must read the card to show
what is on it, not merely push files at it. Worth knowing before the transfer
protocol is designed, because a push-only design would have to be reworked.

## The parts that earn their keep

Ordinary drag-to-reorder is table stakes. These are the ones that catch problems
a musician would otherwise meet on stage:

- **Missing-file warnings.** An entry in `setlist.txt` with no matching file on
  the card is a typo or a deleted song. The firmware handles it correctly — it
  reports and stays stopped — but discovering that between songs is bad. Flag it
  in the editor, where it costs nothing.
- **Oversize-song warnings.** The firmware refuses any song over the 256KB RAM
  buffer rather than play a truncated one. That is the right call, and it is also
  something you want to know at home, not at soundcheck.
- **A library pane.** `.mid` files present on the card but absent from the
  setlist, ready to drag in. Makes the difference between "on the card" and "in
  the set" visible, which is exactly the distinction `setlist.txt` creates.
- **Total set length.** Requires parsing tempo and length out of each SMF in the
  browser. Real work, and genuinely useful — set duration is a thing gigging
  musicians actually plan around.
- **Named sets — now a headline feature, not a workaround.** Alternates live in
  `/setlists/*.txt`; the editor "activates" one by copying it over
  `setlist.txt`. Phase-1 firmware needs no change at all, and when the pedal
  learns to browse sets itself (phase 2, once the OLED and encoder land) the
  same cards keep working. The set's display name is its first `#` comment line,
  so it reads as "Friday at the Broken Anchor" rather than "set3.txt".

## Keep the limits in one place

The firmware enforces **64 songs max** and **64-char filenames**, and silently
truncates over-length lines. An editor that lets someone build a 70-song set
would produce a file the pedal quietly clips — the worst kind of bug, because
everything looks fine until song 65.

Put those limits in `src/devices.js` as product data and validate against them,
so app and firmware cannot drift apart.

## Open

- [x] ~~Design the file-transfer protocol over USB Serial~~ — `docs/card-access.md`
      (2026-10-20): through the pedal, bidirectional, with a card reader as an
      optional second source for the external card later.
- [ ] Decide whether to parse SMF in the browser for durations, or skip it.
- [ ] Does the pedal need to re-read `setlist.txt` without a power cycle?

## Two cards

Mœræ carries an internal microSD and a stage-swappable external SD, each able to
hold its own `setlist.txt`. The editor therefore has to be explicit about
**which card it is editing** — a set silently written to the wrong one is
indistinguishable from the app doing nothing.

Firmware precedence is **external wins when present**, exclusive rather than
merged. The editor should say which card the pedal will actually play from, so
"I edited the set and it played the old one" never happens.

**Each card holds its own `/setlists/` folder**, so sets exist per card and the
editor shows them as one list labelled by card. Two cards can hold the same
filename AND the same display name, so a set is identified by **(card,
filename)** everywhere — UI, and whatever the pedal remembers.

- [ ] Card selector in the UI, with the active card marked.
- [ ] Show sets from both cards in one list, labelled `[int]` / `[ext]`.
- [ ] Warn when editing a set on the internal card while the pedal's remembered
      set is on the external one — the edit is real but will not be heard.

## Copying sets between cards

**Committed app feature, independent of what the pedal can do.** The pedal may
also offer it from the OLED menu (see `Fates/HARDWARE.md`), gated on whether a
Teensy can mount both filesystems at once — but the app is immune to that
question, because **it never needs both cards mounted simultaneously**. Read the
set into the computer, unmount one card, mount the other, write. The computer is
the buffer the pedal does not have.

The rule that matters is identical in both places: **a set is the `.txt` plus the
songs it names.** Copying the setlist file alone produces a set pointing at
missing files, and it fails silently — nothing looks wrong until Play.

- [ ] Copy-set-between-cards, moving the `.txt` and every song it references.
- [ ] Name the direction ("Copy to internal"), not "import"/"export" — those
      need a reference point the user has to infer.
- [ ] **PER-FILE overwrite confirmation** — the app has a real screen, so this
      version should be the richer one. The pedal is limited to one decision for
      the whole operation by its 1.3" OLED; do not copy that constraint here.
      Deliberate divergence, not a gap.
- [ ] **Compare by CONTENT HASH, never by size.** Size equality means nothing
      for MIDI: moving a few notes reorders events or shifts delta times and
      routinely leaves the byte count unchanged (Dale, 2026-08-22). A
      same-name-same-size skip would silently keep a STALE song — the worst
      possible failure, because you believe your edited set copied across and
      find out on stage. SHA-256 over a 20-80KB file is instant in WebCrypto.
- [ ] **Default to OVERWRITE, silently, when the hash differs.** This is not
      merely the safer choice, it is the semantically correct one: a copy
      operation DECLARES THE SOURCE AUTHORITATIVE. Skipping contradicts what the
      user just asked for. Report what was replaced afterwards rather than
      interrogating them beforehand.
- [ ] Skip silently only when the hashes MATCH — there is genuinely nothing to
      do, and it is not a decision worth anyone's attention.
- [ ] Per-file confirmation therefore becomes an OPT-IN for the cautious ("ask
      me before replacing"), not the default flow. Reserve prompts for real
      ambiguity; a dialog per file trains people to click through without
      reading, which is how the one that mattered gets missed.
- [ ] Offer keep-both (rename) alongside overwrite/skip — cheap on a real screen,
      impossible on the pedal.
