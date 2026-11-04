# Desktop prototype files

- `launcher.cjs`: starts the existing local Express/Vite app on loopback and launches Electron.
- `main.cjs`: secure desktop shell and IPC authorization.
- `preload.cjs`: narrow EARTH ONE-only browser bridge.
- `browser-engine.cjs`: Chromium `WebContentsView` lifecycle, URL checks, tabs, and downloads.
- `test-browser-integration.cjs`: starts loopback fixtures and runs an end-to-end smoke test under Xvfb.

See [`../EMBEDDED_BROWSER_ENGINE.md`](../EMBEDDED_BROWSER_ENGINE.md) for usage, security, licensing and platform limits.
