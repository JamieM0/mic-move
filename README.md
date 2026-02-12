# Mic Move

LAN-only mic bridge: iPhone sends microphone audio, PC receives it, and your Windows apps can consume it as a mic via VB-CABLE.

## What changed

This now replaces manual copy/paste signaling.

- Before: you manually exchanged WebRTC offer/answer text.
- Now: both devices auto-discover each other by nickname through a tiny signaling server running on your PC.

Media privacy is still the same:

- Audio path is direct browser-to-browser WebRTC.
- `iceServers: []` (no STUN/TURN relays).
- Signaling stays on your LAN PC server (`server.js`).

## Files

- `server.js` - local LAN signaling server + static file host.
- `index.html`, `app.js`, `styles.css` - client app.

## Setup

1. Install Node.js 18+ on PC.
2. Create TLS cert files in `certs/`:

`certs/lan-cert.pem`

`certs/lan-key.pem`

Recommended: use `mkcert` and include your PC LAN IP in the cert:

```powershell
mkdir certs
mkcert -install
mkcert -cert-file certs/lan-cert.pem -key-file certs/lan-key.pem localhost 127.0.0.1 ::1 <PC_LAN_IP>
```

3. In this folder, run:

```powershell
npm install
npm start
```

4. Find your PC LAN IP (example `192.168.1.40`).
5. Open this URL on both devices:

`https://<PC_LAN_IP>:8787`

If your browser warns about certificate trust:

- PC: trust the mkcert local CA (handled by `mkcert -install`).
- iPhone: install/trust the same mkcert CA profile on iPhone, or it will block microphone/page access on untrusted HTTPS.

## Connect

1. On PC, choose `Receiver`, nickname like `Jamie-PC`, click `Save Profile`.
2. On iPhone, choose `Sender`, nickname like `Jamies-iPhone`, click `Save Profile`.
3. On iPhone, tap `Start Mic`.
4. On PC, click the iPhone nickname in sender list.

## VB-CABLE routing

Goal: web app audio must go to `CABLE Input`; your target app mic should be `CABLE Output`.

### If output device dropdown shows VB-CABLE

1. In web app (PC), select `CABLE Input` in Output device.
2. In Discord/Zoom/OBS/etc, select `CABLE Output` as microphone.

### If dropdown only shows `Output` or default

This is common when browser/device APIs hide outputs. Use Windows app-level routing:

1. Keep Mic Move playing audio in browser.
2. Open `Settings > System > Sound > Volume mixer`.
3. Under `Apps`, find your browser process (Edge/Chrome).
4. Set that app's `Output device` to `CABLE Input (VB-Audio Virtual Cable)`.
5. In your target app, set microphone to `CABLE Output (VB-Audio Virtual Cable)`.

## Notes

- Keep both devices on same LAN.
- Browser tab must remain open on both devices.
- Server defaults to HTTPS when cert files exist.
- To force HTTP fallback in PowerShell: `$env:USE_HTTPS='0'; npm start`
