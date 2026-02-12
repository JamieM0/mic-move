const roleEl = document.getElementById("role");
const receiverSection = document.getElementById("receiver");
const senderSection = document.getElementById("sender");

const createOfferBtn = document.getElementById("create-offer");
const copyOfferBtn = document.getElementById("copy-offer");
const applyAnswerBtn = document.getElementById("apply-answer");
const offerOutEl = document.getElementById("offer-out");
const answerInEl = document.getElementById("answer-in");
const outputDeviceEl = document.getElementById("output-device");
const receiverStatusEl = document.getElementById("receiver-status");
const remoteAudioEl = document.getElementById("remote-audio");

const startMicBtn = document.getElementById("start-mic");
const createAnswerBtn = document.getElementById("create-answer");
const copyAnswerBtn = document.getElementById("copy-answer");
const offerInEl = document.getElementById("offer-in");
const answerOutEl = document.getElementById("answer-out");
const senderStatusEl = document.getElementById("sender-status");

let receiverPc;
let senderPc;
let senderStream;

const rtcConfig = { iceServers: [] };

roleEl.addEventListener("change", () => {
  const isReceiver = roleEl.value === "receiver";
  receiverSection.classList.toggle("hidden", !isReceiver);
  senderSection.classList.toggle("hidden", isReceiver);
});

createOfferBtn.addEventListener("click", async () => {
  cleanupReceiver();
  receiverPc = new RTCPeerConnection(rtcConfig);

  receiverPc.addTransceiver("audio", { direction: "recvonly" });

  receiverPc.ontrack = async (event) => {
    remoteAudioEl.srcObject = event.streams[0];
    try {
      await remoteAudioEl.play();
      receiverStatusEl.textContent = "Connected: receiving audio";
    } catch {
      receiverStatusEl.textContent = "Connected. Press play on audio control.";
    }
  };

  receiverPc.onconnectionstatechange = () => {
    if (receiverPc) {
      receiverStatusEl.textContent = `Connection: ${receiverPc.connectionState}`;
    }
  };

  receiverStatusEl.textContent = "Creating offer...";
  const offer = await receiverPc.createOffer();
  await receiverPc.setLocalDescription(offer);
  await waitForIce(receiverPc);

  offerOutEl.value = JSON.stringify(receiverPc.localDescription);
  copyOfferBtn.disabled = false;
  applyAnswerBtn.disabled = false;
  receiverStatusEl.textContent = "Offer ready";

  await refreshOutputDevices();
});

copyOfferBtn.addEventListener("click", async () => {
  await copyText(offerOutEl.value);
  receiverStatusEl.textContent = "Offer copied";
});

applyAnswerBtn.addEventListener("click", async () => {
  if (!receiverPc) return;
  try {
    const answer = JSON.parse(answerInEl.value);
    await receiverPc.setRemoteDescription(answer);
    receiverStatusEl.textContent = "Answer applied. Waiting for audio...";
  } catch {
    receiverStatusEl.textContent = "Invalid answer JSON";
  }
});

outputDeviceEl.addEventListener("change", async () => {
  if (!remoteAudioEl.setSinkId) {
    receiverStatusEl.textContent = "This browser does not support output-device selection";
    return;
  }

  try {
    await remoteAudioEl.setSinkId(outputDeviceEl.value);
    receiverStatusEl.textContent = "Output device changed";
  } catch {
    receiverStatusEl.textContent = "Failed to change output device";
  }
});

startMicBtn.addEventListener("click", async () => {
  cleanupSender();
  try {
    senderStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1
      }
    });

    senderStatusEl.textContent = "Mic ready";
    createAnswerBtn.disabled = false;
    startMicBtn.disabled = true;
  } catch {
    senderStatusEl.textContent = "Mic permission denied or unavailable";
  }
});

createAnswerBtn.addEventListener("click", async () => {
  if (!senderStream) {
    senderStatusEl.textContent = "Start mic first";
    return;
  }

  const offerText = offerInEl.value.trim();
  if (!offerText) {
    senderStatusEl.textContent = "Paste offer first";
    return;
  }

  cleanupSenderPcOnly();
  senderPc = new RTCPeerConnection(rtcConfig);

  senderPc.onconnectionstatechange = () => {
    if (senderPc) {
      senderStatusEl.textContent = `Connection: ${senderPc.connectionState}`;
    }
  };

  for (const track of senderStream.getTracks()) {
    senderPc.addTrack(track, senderStream);
  }

  try {
    const offer = JSON.parse(offerText);
    await senderPc.setRemoteDescription(offer);
    const answer = await senderPc.createAnswer();
    await senderPc.setLocalDescription(answer);
    await waitForIce(senderPc);

    answerOutEl.value = JSON.stringify(senderPc.localDescription);
    copyAnswerBtn.disabled = false;
    senderStatusEl.textContent = "Answer ready";
  } catch {
    senderStatusEl.textContent = "Invalid offer JSON";
  }
});

copyAnswerBtn.addEventListener("click", async () => {
  await copyText(answerOutEl.value);
  senderStatusEl.textContent = "Answer copied";
});

async function refreshOutputDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter((d) => d.kind === "audiooutput");

    outputDeviceEl.innerHTML = "";
    for (const output of outputs) {
      const option = document.createElement("option");
      option.value = output.deviceId;
      option.textContent = output.label || `Output ${output.deviceId.slice(0, 6)}`;
      outputDeviceEl.appendChild(option);
    }

    if (!remoteAudioEl.setSinkId) {
      receiverStatusEl.textContent = "Use Edge/Chrome on PC for output-device selection";
    }
  } catch {
    receiverStatusEl.textContent = "Could not list output devices";
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

function cleanupSender() {
  cleanupSenderPcOnly();
  if (senderStream) {
    senderStream.getTracks().forEach((t) => t.stop());
    senderStream = undefined;
  }
  startMicBtn.disabled = false;
  createAnswerBtn.disabled = true;
  copyAnswerBtn.disabled = true;
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

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const temp = document.createElement("textarea");
  temp.value = text;
  document.body.appendChild(temp);
  temp.select();
  document.execCommand("copy");
  document.body.removeChild(temp);
}
