# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.12.2] - 2025-12-31
### Changed
- Document release notes generation
- Move local runner scripts out of repo
- Backup existing artifact
- Clarify local-only ignores
- Add practical checklist


## [0.10.0] - 2025-12-30
### Added
- 
### Changed
- 
### Fixed
- 
### Removed
- 


## [0.9.2] - 2025-12-29
### Added
- Print/export for all tunes in a file, with per-tune error summaries.
- Scan-and-filter view for tunes with render errors.
- Toast notifications for export feedback.

### Changed
- Print pipeline now renders via temp HTML/PDF windows for more consistent output.
- Error list grouped by tune/file context.
- File header UI shows filename, tune selector, and error scan controls.
- Rendering ignores `%%sep` and reports a warning instead of failing.

### Fixed
- Temporary print artifacts are cleaned on startup.

## [0.9.1] - 2025-12-28
Initial public versioning baseline; feature set is ~90% complete; details to be filled as we stabilize.
