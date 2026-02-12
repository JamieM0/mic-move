# Mic Move

Minimal static web app to stream iPhone microphone audio directly to your PC over your local network, with no audio relay server.

## Why this keeps mic audio private

- App is static files only (`index.html`, `app.js`, `styles.css`) hosted on GitHub Pages.
- WebRTC is configured with `iceServers: []` (no STUN/TURN), so there are no third-party media relays.
- Audio is encrypted end-to-end by WebRTC (DTLS-SRTP) directly between your phone and PC browser.
- Signaling is manual copy/paste between your own devices.

## Setup

1. Push this repo and enable GitHub Pages.
2. Open the same GitHub Pages URL on:
- PC browser (Edge/Chrome recommended)
- iPhone Safari/Chrome
3. On the PC, install a virtual audio cable (for example VB-CABLE) so browser audio can become a virtual microphone input for other apps.

## Connect devices

### PC (Receiver)

1. Select `Receiver (PC)`.
2. Click `Create Offer`.
3. Copy the offer text and move it to your iPhone.

### iPhone (Sender)

1. Select `Sender (iPhone)`.
2. Tap `Start Mic` and allow microphone permission.
3. Paste PC offer into `Offer from PC`.
4. Tap `Create Answer` and copy answer text.

### Back on PC

1. Paste answer into `Answer from phone`.
2. Click `Apply Answer`.
3. In `Output device`, choose `CABLE Input (VB-Audio Virtual Cable)`.
4. In Windows apps (Discord/Zoom/OBS/etc), choose `CABLE Output` as microphone input.

## Latency notes

- This is near real-time WebRTC audio on LAN and should usually be low-latency.
- Keep both devices on strong Wi-Fi (5 GHz if possible).
- Disable Bluetooth audio devices while testing.

## Limitations

- Manual offer/answer exchange is intentional to avoid any signaling server.
- Works best on same network.
- Browser must stay open on both devices.
