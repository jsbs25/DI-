# Desktop prototype files

- `launcher.cjs`: starts the existing local Express/Vite app on loopback and launches Electron.
- `main.cjs`: secure desktop shell, origin-checked IPC, and atomic local browser-data file in Electron `userData`.
- `preload.cjs`: narrow EARTH ONE-only bridge for navigation, local bookmark/history data, and address-bar focus.
- `browser-engine.cjs`: Chromium `WebContentsView` lifecycle, URL checks, navigation state, and downloads.
- `test-browser-integration.cjs`: starts isolated loopback fixtures and temporary server/Electron profiles, then runs the Chromium persistence/privacy smoke test under Xvfb.

See [`../EMBEDDED_BROWSER_ENGINE.md`](../EMBEDDED_BROWSER_ENGINE.md) for usage, security, licensing and platform limits.
