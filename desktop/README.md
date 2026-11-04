# Desktop prototype files

- `launcher.cjs`: starts the existing local Express/Vite app on loopback and launches Electron.
- `main.cjs`: secure desktop shell, origin-checked IPC, and atomic local browser-data file in Electron `userData`.
- `preload.cjs`: narrow EARTH ONE-only bridge for navigation, local bookmark/history data, downloads, and address-bar focus.
- `browser-engine.cjs`: Chromium `WebContentsView` lifecycle, URL checks, navigation state, and owned-tab download wiring.
- `download-manager.cjs`: in-memory download records, safe display metadata, progress/cancellation, and terminal-entry removal; production leaves save-path selection to Electron's dialog.
- `test-download-manager.cjs`: synthetic local DownloadItem tests for save-dialog defaults, progress/success, cancellation, invalid URLs, and non-browser sources.
- `test-browser-integration.cjs`: starts isolated loopback fixtures and temporary server/Electron profiles, then runs the Chromium persistence/privacy/download smoke test under Xvfb.

See [`../EMBEDDED_BROWSER_ENGINE.md`](../EMBEDDED_BROWSER_ENGINE.md) for usage, security, licensing and platform limits.
