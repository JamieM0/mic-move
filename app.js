const roleEl = document.getElementById("role");
const nicknameEl = document.getElementById("nickname");
const saveProfileBtn = document.getElementById("save-profile");
const profileStatusEl = document.getElementById("profile-status");

const receiverSection = document.getElementById("receiver");
const senderSection = document.getElementById("sender");
const senderListEl = document.getElementById("sender-list");
const receiverListEl = document.getElementById("receiver-list");
const receiverStatusEl = document.getElementById("receiver-status");
const senderStatusEl = document.getElementById("sender-status");
const startMicBtn = document.getElementById("start-mic");
const remoteAudioEl = document.getElementById("remote-audio");
const outputDeviceEl = document.getElementById("output-device");
const pickOutputBtn = document.getElementById("pick-output");
const outputHelpEl = document.getElementById("output-help");

const rtcConfig = { iceServers: [] };

let ws;
let myId = "";
let peers = [];
let receiverPc;
let senderPc;
let senderStream;
let senderProcessedStream;
let senderAudioContext;
const MIC_GAIN = 3.0;
let nicknameDirty = false;

const saved = loadProfile();
roleEl.value = saved.role;
nicknameEl.value = saved.nickname;
toggleRoleUI();
connectSignal();

roleEl.addEventListener("change", () => {
  if (!nicknameDirty) {
    nicknameEl.value = randomNickname(roleEl.value);
  }
  toggleRoleUI();
  register();
  renderPeerLists();
});

nicknameEl.addEventListener("input", () => {
  nicknameDirty = true;
});

saveProfileBtn.addEventListener("click", () => {
  saveProfile();
  register();
  profileStatusEl.textContent = "Profile saved";
});

startMicBtn.addEventListener("click", async () => {
  try {
    senderStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1
      }
    });
    const processed = createStereoSenderStream(senderStream);
    senderProcessedStream = processed.stream;
    senderAudioContext = processed.ctx;
    senderStatusEl.textContent = "Mic ready";
    startMicBtn.disabled = true;
  } catch {
    senderStatusEl.textContent = "Mic permission denied or unavailable";
  }
});

outputDeviceEl.addEventListener("change", async () => {
  if (!remoteAudioEl.setSinkId) {
    outputHelpEl.textContent = "Browser cannot pick output device. Use Windows Settings > System > Sound > Volume mixer and set this browser output to CABLE Input.";
    return;
  }

  try {
    await remoteAudioEl.setSinkId(outputDeviceEl.value);
    outputHelpEl.textContent = "Output device changed.";
  } catch {
    outputHelpEl.textContent = "Could not switch output device. Use Windows volume mixer fallback.";
  }
});

pickOutputBtn.addEventListener("click", async () => {
  if (!navigator.mediaDevices?.selectAudioOutput) {
    outputHelpEl.textContent = "This browser does not support direct output picker. Use Windows Volume Mixer fallback.";
    return;
  }
  if (!remoteAudioEl.setSinkId) {
    outputHelpEl.textContent = "This browser cannot bind audio to a specific output device.";
    return;
  }

  try {
    const selected = await navigator.mediaDevices.selectAudioOutput();
    await remoteAudioEl.setSinkId(selected.deviceId);
    await refreshOutputDevices(selected.deviceId);
    outputHelpEl.textContent = `Output set: ${selected.label || "Selected device"}`;
  } catch {
    outputHelpEl.textContent = "Output selection was cancelled or blocked.";
  }
});

function connectSignal() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const wsUrl = `${protocol}://${location.host}/ws`;
  profileStatusEl.textContent = `Connecting to ${wsUrl}...`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    profileStatusEl.textContent = `Connected to signaling: ${wsUrl}`;
  };

  ws.onmessage = async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.type === "hello") {
      myId = msg.id;
      register();
      return;
    }

    if (msg.type === "peers") {
      peers = msg.peers;
      renderPeerLists();
      return;
    }

    if (msg.type === "signal") {
      await onSignal(msg.from, msg.payload);
    }
  };

  ws.onclose = () => {
    profileStatusEl.textContent = `Signaling disconnected: ${wsUrl}. Retrying...`;
    setTimeout(connectSignal, 1000);
  };

  ws.onerror = () => {
    profileStatusEl.textContent = `Signaling error: ${wsUrl}`;
  };
}

function register() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const role = roleEl.value === "sender" ? "sender" : "receiver";
  const nickname = (nicknameEl.value || defaultNickname(role)).trim().slice(0, 24);
  ws.send(JSON.stringify({ type: "register", role, nickname }));
}

function renderPeerLists() {
  const availableSenders = peers.filter((p) => p.id !== myId && p.role === "sender");
  const availableReceivers = peers.filter((p) => p.id !== myId && p.role === "receiver");

  senderListEl.innerHTML = "";
  for (const p of availableSenders) {
    senderListEl.appendChild(peerButton(p, "Connect", () => connectAsReceiver(p.id, p.nickname)));
  }
  if (!availableSenders.length) {
    senderListEl.appendChild(peerEmpty("No sender online"));
  }

  receiverListEl.innerHTML = "";
  for (const p of availableReceivers) {
    receiverListEl.appendChild(peerButton(p, "Connect", () => connectAsSender(p.id, p.nickname)));
  }
  if (!availableReceivers.length) {
    receiverListEl.appendChild(peerEmpty("No receiver online"));
  }
}

function peerButton(peer, label, onClick) {
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.textContent = `${peer.nickname} (${peer.role}) - ${label}`;
  btn.addEventListener("click", onClick);
  li.appendChild(btn);
  return li;
}

function peerEmpty(text) {
  const li = document.createElement("li");
  li.textContent = text;
  return li;
}

async function connectAsReceiver(targetId, targetName) {
  cleanupReceiver();
  receiverPc = new RTCPeerConnection(rtcConfig);
  receiverPc.addTransceiver("audio", { direction: "recvonly" });

  receiverPc.ontrack = async (event) => {
    remoteAudioEl.srcObject = event.streams[0];
    try {
      await remoteAudioEl.play();
    } catch {}
  };

  receiverPc.onconnectionstatechange = () => {
    receiverStatusEl.textContent = `Connection to ${targetName}: ${receiverPc.connectionState}`;
  };

  receiverStatusEl.textContent = `Calling ${targetName}...`;
  const offer = await receiverPc.createOffer();
  await receiverPc.setLocalDescription(offer);
  await waitForIce(receiverPc);

  sendSignal(targetId, {
    type: "offer",
    sdp: receiverPc.localDescription
  });

  await refreshOutputDevices();
}

async function connectAsSender(targetId, targetName) {
  if (!senderStream) {
    senderStatusEl.textContent = "Tap Start Mic first";
    return;
  }

  cleanupSenderPcOnly();
  senderPc = new RTCPeerConnection(rtcConfig);
  const activeStream = senderProcessedStream || senderStream;
  for (const track of activeStream.getTracks()) {
    senderPc.addTrack(track, activeStream);
  }

  senderPc.onconnectionstatechange = () => {
    senderStatusEl.textContent = `Connection to ${targetName}: ${senderPc.connectionState}`;
  };

  senderStatusEl.textContent = `Waiting for offer from ${targetName}...`;
}

async function onSignal(fromId, payload) {
  if (payload.type === "offer") {
    if (roleEl.value !== "sender") return;
    if (!senderStream) {
      senderStatusEl.textContent = "Offer received. Tap Start Mic then click receiver again.";
      return;
    }

    cleanupSenderPcOnly();
    senderPc = new RTCPeerConnection(rtcConfig);
    const activeStream = senderProcessedStream || senderStream;
    for (const track of activeStream.getTracks()) {
      senderPc.addTrack(track, activeStream);
    }

    senderPc.onconnectionstatechange = () => {
      senderStatusEl.textContent = `Connection: ${senderPc.connectionState}`;
    };

    await senderPc.setRemoteDescription(payload.sdp);
    const answer = await senderPc.createAnswer();
    await senderPc.setLocalDescription(answer);
    await waitForIce(senderPc);

    sendSignal(fromId, {
      type: "answer",
      sdp: senderPc.localDescription
    });
    senderStatusEl.textContent = "Answer sent";
    return;
  }

  if (payload.type === "answer") {
    if (roleEl.value !== "receiver" || !receiverPc) return;
    await receiverPc.setRemoteDescription(payload.sdp);
    receiverStatusEl.textContent = "Answer applied. Receiving...";
    return;
  }
}

function sendSignal(to, payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "signal", to, payload }));
}

async function refreshOutputDevices(preferredDeviceId) {
  outputDeviceEl.innerHTML = "";
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter((d) => d.kind === "audiooutput");

    if (!outputs.length) {
      const fallback = document.createElement("option");
      fallback.textContent = "Default output only";
      fallback.value = "default";
      outputDeviceEl.appendChild(fallback);
      outputHelpEl.textContent = "Only default output is visible. Route browser output to CABLE Input in Windows Volume Mixer.";
      return;
    }

    for (const output of outputs) {
      const option = document.createElement("option");
      option.value = output.deviceId;
      option.textContent = output.label || `Output (${output.deviceId.slice(0, 8)})`;
      outputDeviceEl.appendChild(option);
    }

    if (preferredDeviceId) {
      outputDeviceEl.value = preferredDeviceId;
    }

    if (!remoteAudioEl.setSinkId) {
      outputHelpEl.textContent = "Browser does not support output-device selection. Use Windows Volume Mixer fallback.";
    } else {
      outputHelpEl.textContent = "Use Pick Output Device for reliable VB-CABLE selection.";
    }
  } catch {
    outputHelpEl.textContent = "Could not read output devices. Use Windows Volume Mixer fallback.";
  }
}

function loadProfile() {
  const role = "receiver";
  return { role, nickname: randomNickname(role) };
}

function saveProfile() {
  const role = roleEl.value;
  const nickname = (nicknameEl.value || randomNickname(role)).trim().slice(0, 24);
  nicknameEl.value = nickname;
  nicknameDirty = true;
}

function randomNickname(role) {
  const adjectives = [
    "Swift", "Quiet", "Silver", "Bright", "Calm", "Rapid", "Neat", "Clear"
  ];
  const nouns = role === "sender"
    ? ["Sparrow", "Robin", "Wren", "Finch", "Lark", "Piper"]
    : ["Cedar", "Maple", "Willow", "Oak", "Birch", "Pine"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(100 + Math.random() * 900);
  return `${adj}-${noun}-${num}`;
}

function toggleRoleUI() {
  const isReceiver = roleEl.value === "receiver";
  receiverSection.classList.toggle("hidden", !isReceiver);
  senderSection.classList.toggle("hidden", isReceiver);
  if (isReceiver) {
    refreshOutputDevices();
  }
}

function cleanupReceiver() {
  if (receiverPc) {
    receiverPc.close();
    receiverPc = undefined;
  }
}

function cleanupSenderPcOnly() {
  if (senderPc) {
    senderPc.close();
    senderPc = undefined;
  }
}

function createStereoSenderStream(inputStream) {
  if (!window.AudioContext && !window.webkitAudioContext) {
    return { stream: inputStream, ctx: null };
  }

  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx({ latencyHint: "interactive" });
    const source = ctx.createMediaStreamSource(inputStream);
    const gain = ctx.createGain();
    gain.gain.value = MIC_GAIN;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    const left = ctx.createGain();
    const right = ctx.createGain();
    const merger = ctx.createChannelMerger(2);
    const destination = ctx.createMediaStreamDestination();

    source.connect(gain);
    gain.connect(compressor);
    compressor.connect(left);
    compressor.connect(right);
    left.connect(merger, 0, 0);
    right.connect(merger, 0, 1);
    merger.connect(destination);

    return { stream: destination.stream, ctx };
  } catch {
    return { stream: inputStream, ctx: null };
  }
}

async function waitForIce(pc) {
  if (pc.iceGatheringState === "complete") return;

  await new Promise((resolve) => {
    const onChange = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", onChange);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", onChange);
  });
}
