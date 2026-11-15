# ONE Communication Real-Device Acceptance Guide

This checklist covers all 10 mandatory real-device acceptance scenarios for **ONE Communication** (`LiveKit SFU + coturn TURN/TCP/TLS + WebRTC fallback`).

> Important: Headless Chromium verification (`--use-fake-device-for-media-stream`) validates signaling, authorization, state transitions, and UI controls, **not** physical microphone acoustics, carrier NAT traversal, or background VoIP push wake. Physical acceptance below requires HTTPS (`wss://`) and a deployed LiveKit + coturn server (see `./README.md`).

## Prerequisites

1. Deploy `docker-compose.livekit.yml` on a Linux VPS with public IP, HTTPS/WSS domain (e.g., `livekit.your-domain.com`), and TLS certificate for `turns:turn.your-domain.com:5349`.
2. Configure environment variables on the ONE backend:
   - `LIVEKIT_URL=wss://livekit.your-domain.com`
   - `LIVEKIT_PUBLIC_URL=wss://livekit.your-domain.com`
   - `LIVEKIT_API_KEY=...`
   - `LIVEKIT_API_SECRET=...`
   - `TURN_URLS=turn:turn.your-domain.com:3478?transport=udp,turn:turn.your-domain.com:3478?transport=tcp,turns:turn.your-domain.com:5349?transport=tcp`
   - `TURN_USERNAME=...`
   - `TURN_CREDENTIAL=...`
3. Open **Chat -> 通话 (Calls)** and click the network probe icon (`探测通话网络连通性`) to confirm STUN (`srflx`) and TURN (`relay`) candidates succeed before starting physical device tests.

## 10 Mandatory Acceptance Tests

| # | Scenario | Verification Steps | Pass Criteria |
|---|----------|--------------------|---------------|
| 1 | **Two Computers Audio Call** | Desktop A calls Desktop B (audio). B answers. Speak both directions for 30s. | Both hear clear audio without echo; duration timer counts up; RTT & packet loss visible. |
| 2 | **Two Phones Audio Call** | Phone A (iOS Safari/Chrome) calls Phone B (Android Chrome). Test earpiece/speaker volume. | Incoming ringtone plays cleanly; audio is audible after unlocking playback; call ends cleanly on hangup. |
| 3 | **Phone + Computer Interop** | Desktop A starts call with Phone B (and vice versa). | Bidirectional audio and state sync work regardless of caller platform. |
| 4 | **1:1 Video Call** | Start video call between A and B. Move in front of camera. | Remote video renders full-stage; local camera shows in PiP preview; framerate stays smooth. |
| 5 | **Camera Off / On Toggle** | During video call, tap `关画面` (`Camera Off`), wait 5s, tap `摄像头` (`Camera On`). | Remote UI switches cleanly to avatar placeholder and restores live video without dropping audio. |
| 6 | **Microphone Mute / Unmute** | Tap `麦克风` -> `已静音`. Speak into mic, then unmute. | Peer sees muted indicator; zero audio leaks while muted; voice resumes immediately on unmute. |
| 7 | **Network Switch (Wi-Fi <-> 4G/5G)** | On Phone A during active video call, disable Wi-Fi to force cellular handover. | Banner transitions to `正在自动重连音视频通道…` via automatic ICE restart and recovers media without ending call. |
| 8 | **UDP Blocked -> TURN/TCP or TURN/TLS** | On restricted Wi-Fi / corporate firewall blocking UDP (or toggle `TURN中继` button in overlay), place call. | ICE selects `relay/TCP` or `relay/TLS` (`turns:...5349`); audio & video connect cleanly. |
| 9 | **Connection Drop Recovery** | Temporarily toggle Airplane Mode for 4s on one client, then restore connectivity, or tap `重连`. | Session reconnects media tracks cleanly or cleans up expired call state cleanly after timeout. |
| 10 | **Unauthorized User Room Blocking** | Capture `callId` while A & B are in call. Have User C call `/api/calls/:id/accept`, `/token`, and `/signal`. | All endpoints reject User C with HTTP `403`/`404`; User C never receives LiveKit JWT or SDP. |
