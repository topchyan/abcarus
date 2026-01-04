# Release Notes

## [0.14.0] - 2026-01-03

Range: v0.13.1..HEAD

### Added
- Native transposition backend.
- Transposition of chord symbols (gchords) in quotes (12-TET).
- Native 53-EDO transposition support via `%%MIDI temperamentequal 53`.
- Project requirements/methodology docs and ADRs.

### Changed
- Settings now include a toggle for native transposition.

### Fixed
- 53-EDO repeated transposition corruption around inline fields and `!decorations!`.
