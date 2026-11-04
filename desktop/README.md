# Desktop prototype files

- `launcher.cjs`: starts the existing local Express/Vite app on loopback and launches Electron.
- `main.cjs`: secure desktop shell, origin-checked IPC, local browser data and ID-only download-folder validation in Electron `userData`.
- `preload.cjs`: narrow EARTH ONE-only bridge for navigation, local bookmark/history data, downloads, and address-bar focus.
- `browser-engine.cjs`: Chromium `WebContentsView` lifecycle, URL checks, navigation state, and owned-tab download wiring.
- `download-manager.cjs`: bounded local-only download history, safe display metadata, progress/cancellation, interrupted-on-restart restoration, and record-only remove/clear; production leaves save-path selection to Electron's dialog.
- `download-store.cjs`: versioned, validated, atomic `userData` store for at most 50 approved download records; corrupt stores fail closed without overwriting the original.
- `test-download-manager.cjs`: synthetic local DownloadItem and temporary-store tests for explicit save approval, restart restore, corrupt-store handling, the 50-record bound, missing-file validation, and record removal without deleting files.
- `test-browser-integration.cjs`: starts isolated loopback fixtures and temporary server/Electron profiles, then runs the Chromium persistence/privacy/download smoke test under Xvfb.

See [`../EMBEDDED_BROWSER_ENGINE.md`](../EMBEDDED_BROWSER_ENGINE.md) for usage, security, licensing and platform limits.
