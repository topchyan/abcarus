# Playback — Manual Test Cases

These are manual regression checks (no automated playback tests are currently set up).

## PB-01 — Focus loop must not persist after exit

Goal: Ensure leaving Focus mode resets any pending Focus-derived loop playback plan.

Steps:
1. Open an `.abc` tune with multiple measures.
2. Enter Focus mode.
3. Enable Loop and set From/To to a non-trivial range (e.g. 5–8).
4. Press Play and confirm playback starts at the loop range.
5. Stop playback.
6. Exit Focus mode.
7. Press Play.

Expected:
- Playback starts from the normal transport start (beginning of tune, or the current transport playhead if you moved it),
  not from the previous Focus loop range.

## PB-DRUM-01 — `%%MIDI drum +:` lines collapse into one payload line

Goal: Ensure multiline drum definitions are merged into a single `%%MIDI drum` line for playback payload.

Steps:
1. Open `/home/avetik/Projects/ABC/abc/Ara_Dinkjian_etc.abc`.
2. Select the tune `X:160` (Bu akşam gün batarken gel).
3. Open **Help → Diagnostics → Payload mode** and switch to **Playback payload**.
4. Find the `%%MIDI drum` definition block in the payload.

Expected:
- No `%%MIDI drum +:` lines remain.
- A single `%%MIDI drum` line contains the rhythm, drum map numbers, and velocities appended in order.

## PB-DRUM-02 — V:DRUM preserves bar/repeat/volta skeleton of V:1

Goal: Ensure V:DRUM mirrors the barline/repeat/volta structure exactly.

Steps:
1. Use the same tune as PB-DRUM-01.
2. In **Playback payload**, locate `V:1` and `V:DRUM`.
3. Compare barlines (`|`, `||`, `|:`, `:|`) and voltas (`[1`, `[2`) visually.

Expected:
- V:DRUM has the same barline + volta positions as V:1.
- Pattern resets at repeats/voltas; there are no missing or extra bars.

## PB-DRUM-03 — No extra V:DRUM content after `|]`

Goal: Ensure drum generation stops at the final tune terminator.

Steps:
1. Use any tune with `|]` end (X:160 is sufficient).
2. Inspect the end of the V:DRUM payload.

Expected:
- V:DRUM ends cleanly at `|]` with no trailing generated bars.
