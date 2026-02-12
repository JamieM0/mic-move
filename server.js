const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8787;
const HOST = "0.0.0.0";
const USE_HTTPS = process.env.USE_HTTPS !== "0";
const KEY_FILE = process.env.KEY_FILE || path.join(process.cwd(), "certs", "lan-key.pem");
const CERT_FILE = process.env.CERT_FILE || path.join(process.cwd(), "certs", "lan-cert.pem");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const clients = new Map();

const requestHandler = (req, res) => {
  const reqPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(reqPath).replace(/^([.][.][/\\])+/, "");
  const fullPath = path.join(process.cwd(), safePath);

  if (!fullPath.startsWith(process.cwd())) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(fullPath);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
};

let server;
let transport = "http";
if (USE_HTTPS) {
  try {
    const key = fs.readFileSync(KEY_FILE);
    const cert = fs.readFileSync(CERT_FILE);
    server = https.createServer({ key, cert }, requestHandler);
    transport = "https";
  } catch {
    server = http.createServer(requestHandler);
    transport = "http";
  }
} else {
  server = http.createServer(requestHandler);
}

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  const id = crypto.randomUUID();
  clients.set(id, {
    id,
    ws,
    nickname: `guest-${id.slice(0, 4)}`,
    role: "unknown"
  });

  send(ws, { type: "hello", id });
  broadcastPeers();

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "register") {
      const c = clients.get(id);
      if (!c) return;
      c.role = msg.role === "sender" ? "sender" : "receiver";
      c.nickname = sanitizeNickname(msg.nickname) || c.nickname;
      broadcastPeers();
      return;
    }

    if (msg.type === "signal") {
      const c = clients.get(id);
      if (!c) return;
      const target = clients.get(msg.to);
      if (!target) return;

      send(target.ws, {
        type: "signal",
        from: id,
        payload: msg.payload
      });
    }
  });

  ws.on("close", () => {
    clients.delete(id);
    broadcastPeers();
  });
});

function sanitizeNickname(name) {
  if (typeof name !== "string") return "";
  return name.trim().replace(/\s+/g, " ").slice(0, 24);
}

function broadcastPeers() {
  const peerList = [...clients.values()].map((c) => ({
    id: c.id,
    nickname: c.nickname,
    role: c.role
  }));

  for (const c of clients.values()) {
    send(c.ws, { type: "peers", peers: peerList });
  }
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

server.listen(PORT, HOST, () => {
  if (transport === "https") {
    console.log(`Mic Move running on https://localhost:${PORT}`);
    console.log("Open this on your PC and iPhone using your PC LAN IP.");
  } else {
    console.log(`Mic Move running on http://localhost:${PORT}`);
    console.log("HTTPS cert not found. Place certs/lan-cert.pem and certs/lan-key.pem or set CERT_FILE/KEY_FILE.");
  }
});
