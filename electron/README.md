# ONE Desktop Shell (Electron) & Built-in Browser Proxy (Mode A)

## Architecture & Strict Isolation
- **Main Window (Default Session)**: Hosts ONE Auth, Messenger, LiveKit/WebRTC Audio & Video Calls. Never routes through Mode A browser proxy rules.
- **Built-in Browser Tabs (`persist:one-browser`)**: Every external web tab runs inside an isolated `WebContentsView` attached to `session.fromPartition('persist:one-browser')`.
- **Mode A Proxy (`electron/proxyConfig.ts`)**:
  - Uses Chromium `browserSession.setProxy(...)` + `browserSession.closeAllConnections()` so existing keep-alive sockets immediately switch nodes without affecting OS networking or ONE's own backend/LiveKit signaling.
  - Enforces `socks5h://host:port` for SOCKS5 so DNS resolution runs at the remote proxy node rather than leaking locally.
  - Handles HTTP 407 proxy credentials strictly inside Electron main process (`app.on('login')`) — proxy credentials are never sent back to the renderer UI.

## Running in Development
```bash
# Terminal 1: Start ONE Express + Vite backend on port 3000
npm run dev

# Terminal 2: Launch Electron Desktop pointing at ONE backend
ONE_APP_URL="http://127.0.0.1:3000" npx electron electron/main.ts
```

> Note: Inside Electron production builds, compile `electron/main.ts`, `electron/proxyConfig.ts`, and `electron/preload.ts` to CommonJS/ESM JS with `esbuild` and ensure `package.json` `"main"` points to the compiled entry.
