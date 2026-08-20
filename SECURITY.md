# Security and Privacy

## Reporting a vulnerability

Please report security-sensitive issues privately through GitHub Security Advisories:

`https://github.com/topchyan/abcarus/security/advisories/new`

Do not attach private music, local paths, credentials, or unredacted diagnostic files to a public issue.

## Data handling

ABCarus does not include telemetry or analytics and does not automatically upload scores, settings, diagnostics, or local file paths.

The following actions intentionally contact or open external services:

- YouTube metadata lookup sends the selected YouTube video URL to YouTube's oEmbed endpoint.
- YouTube preview and Help links open the selected web page.
- Development/update scripts may download explicitly requested upstream tools.

Debug dumps are local files created only on request. They include the active ABC/header text, playback/render payloads, and absolute local file paths. Review or redact a dump before sharing it.

## Repository and packaging policy

Local notes, chat exports, QA material, debug dumps, update staging, and developer-only scripts must remain untracked and must not be included in application packages. `npm run test:repo-privacy` enforces the current boundary.

ABCarus treats opened documents as untrusted data and applies security controls before passing their content to rendering components.
