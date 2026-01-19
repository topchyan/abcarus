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

