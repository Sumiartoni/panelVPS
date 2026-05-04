const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const { Server } = require("socket.io");
const si = require("systeminformation");

dotenv.config();

const PORT = Number(process.env.PORT || 3007);
const SESSION_SECRET = process.env.SESSION_SECRET || "change-me";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || "";
const TRUST_PROXY = String(process.env.TRUST_PROXY || "false") === "true";
const LOG_PATHS = String(process.env.LOG_PATHS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

if (TRUST_PROXY) {
  app.set("trust proxy", 1);
}

const sessionMiddleware = session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 1000 * 60 * 60 * 12
  }
});

app.use(express.json());
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, "public")));

io.engine.use(sessionMiddleware);

const logPattern =
  /^(\S+) \S+ \S+ \[([^\]]+)\] "([A-Z]+) ([^"\s]+)(?: [^"]+)?" (\d{3}) (\S+)/;

function formatBytes(bytes) {
  if (!bytes || Number.isNaN(bytes)) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size > 9 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function parseLogDate(rawDate) {
  const normalized = rawDate.replace(":", " ");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function isSameDay(date, target) {
  return (
    date.getFullYear() === target.getFullYear() &&
    date.getMonth() === target.getMonth() &&
    date.getDate() === target.getDate()
  );
}

class VisitorTracker {
  constructor(paths) {
    this.paths = paths;
    this.fileOffsets = new Map();
    this.maxRecentEntries = 40;
    this.reset();
  }

  reset() {
    this.state = {
      totalRequests: 0,
      totalBandwidth: 0,
      uniqueVisitorsToday: new Set(),
      requestsToday: 0,
      statusBuckets: {
        ok: 0,
        redirect: 0,
        clientError: 0,
        serverError: 0
      },
      topPaths: new Map(),
      topIps: new Map(),
      recent: []
    };
  }

  parseLine(line) {
    const match = line.match(logPattern);
    if (!match) return null;

    const [, ip, rawDate, method, reqPath, rawStatus, rawBytes] = match;
    const status = Number(rawStatus);
    const bytes = rawBytes === "-" ? 0 : Number(rawBytes);
    return {
      ip,
      date: parseLogDate(rawDate),
      method,
      path: reqPath,
      status,
      bytes
    };
  }

  registerEntry(entry) {
    const today = new Date();

    this.state.totalRequests += 1;
    this.state.totalBandwidth += entry.bytes;

    if (isSameDay(entry.date, today)) {
      this.state.requestsToday += 1;
      this.state.uniqueVisitorsToday.add(entry.ip);
    }

    if (entry.status >= 500) {
      this.state.statusBuckets.serverError += 1;
    } else if (entry.status >= 400) {
      this.state.statusBuckets.clientError += 1;
    } else if (entry.status >= 300) {
      this.state.statusBuckets.redirect += 1;
    } else {
      this.state.statusBuckets.ok += 1;
    }

    this.state.topPaths.set(
      entry.path,
      (this.state.topPaths.get(entry.path) || 0) + 1
    );
    this.state.topIps.set(entry.ip, (this.state.topIps.get(entry.ip) || 0) + 1);

    this.state.recent.unshift({
      ip: entry.ip,
      method: entry.method,
      path: entry.path,
      status: entry.status,
      bytes: formatBytes(entry.bytes),
      at: entry.date.toISOString()
    });
    this.state.recent = this.state.recent.slice(0, this.maxRecentEntries);
  }

  ingestChunk(chunk) {
    const lines = chunk.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      const entry = this.parseLine(line);
      if (entry) this.registerEntry(entry);
    }
  }

  readRecentLogSnapshot(filePath) {
    try {
      const stats = fs.statSync(filePath);
      const start = Math.max(0, stats.size - 1024 * 1024 * 2);
      const fd = fs.openSync(filePath, "r");
      const buffer = Buffer.alloc(stats.size - start);
      fs.readSync(fd, buffer, 0, buffer.length, start);
      fs.closeSync(fd);
      this.ingestChunk(buffer.toString("utf8"));
      this.fileOffsets.set(filePath, stats.size);
    } catch (error) {
      this.fileOffsets.set(filePath, 0);
    }
  }

  boot() {
    this.reset();
    for (const filePath of this.paths) {
      this.readRecentLogSnapshot(filePath);
    }
  }

  poll() {
    for (const filePath of this.paths) {
      try {
        const stats = fs.statSync(filePath);
        const previousOffset = this.fileOffsets.get(filePath) || 0;
        const nextOffset = stats.size < previousOffset ? 0 : previousOffset;
        if (stats.size === nextOffset) continue;

        const length = stats.size - nextOffset;
        const fd = fs.openSync(filePath, "r");
        const buffer = Buffer.alloc(length);
        fs.readSync(fd, buffer, 0, length, nextOffset);
        fs.closeSync(fd);

        this.ingestChunk(buffer.toString("utf8"));
        this.fileOffsets.set(filePath, stats.size);
      } catch (error) {
        this.fileOffsets.set(filePath, 0);
      }
    }
  }

  summary() {
    const topPaths = [...this.state.topPaths.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([pathName, hits]) => ({ path: pathName, hits }));

    const topIps = [...this.state.topIps.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([ip, hits]) => ({ ip, hits }));

    return {
      trackedLogs: this.paths,
      totalRequests: this.state.totalRequests,
      requestsToday: this.state.requestsToday,
      uniqueVisitorsToday: this.state.uniqueVisitorsToday.size,
      totalBandwidth: formatBytes(this.state.totalBandwidth),
      statusBuckets: this.state.statusBuckets,
      topPaths,
      topIps,
      recent: this.state.recent
    };
  }
}

const tracker = new VisitorTracker(LOG_PATHS);
tracker.boot();

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
}

async function getSystemStats() {
  const [currentLoad, mem, fsSize, networkStats, time, osInfo] =
    await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.networkStats(),
      si.time(),
      si.osInfo()
    ]);

  const rootDisk = fsSize
    .filter((disk) => disk.size > 0)
    .sort((a, b) => b.size - a.size)[0];

  const net = networkStats[0] || {
    rx_sec: 0,
    tx_sec: 0,
    rx_bytes: 0,
    tx_bytes: 0
  };

  return {
    hostname: osInfo.hostname,
    platform: `${osInfo.distro || osInfo.platform} ${osInfo.release || ""}`.trim(),
    uptime: time.uptime,
    cpuLoad: Number(currentLoad.currentLoad.toFixed(1)),
    memory: {
      used: mem.active,
      total: mem.total,
      usedPercent: Number(((mem.active / mem.total) * 100).toFixed(1))
    },
    disk: rootDisk
      ? {
          used: rootDisk.used,
          total: rootDisk.size,
          usedPercent: Number(rootDisk.use.toFixed(1)),
          mount: rootDisk.mount
        }
      : null,
    network: {
      rxPerSecond: net.rx_sec,
      txPerSecond: net.tx_sec,
      rxTotal: net.rx_bytes,
      txTotal: net.tx_bytes
    }
  };
}

app.get("/api/me", (req, res) => {
  res.json({
    authenticated: Boolean(req.session && req.session.authenticated),
    username: req.session?.username || null
  });
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password || (!ADMIN_PASSWORD_HASH && !ADMIN_PASSWORD)) {
    return res.status(400).json({ message: "Konfigurasi login belum lengkap." });
  }

  if (username !== ADMIN_USERNAME) {
    return res.status(401).json({ message: "Username atau password salah." });
  }

  const matches = ADMIN_PASSWORD_HASH
    ? await bcrypt.compare(password, ADMIN_PASSWORD_HASH)
    : password === ADMIN_PASSWORD;
  if (!matches) {
    return res.status(401).json({ message: "Username atau password salah." });
  }

  req.session.authenticated = true;
  req.session.username = username;
  return res.json({ ok: true });
});

app.post("/api/logout", requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get("/api/dashboard", requireAuth, async (req, res) => {
  const [system, visitors] = await Promise.all([getSystemStats(), tracker.summary()]);
  res.json({ system, visitors });
});

io.use((socket, next) => {
  const req = socket.request;
  if (req.session && req.session.authenticated) {
    return next();
  }
  return next(new Error("Unauthorized"));
});

io.on("connection", (socket) => {
  const sendStats = async () => {
    try {
      const payload = {
        system: await getSystemStats(),
        visitors: tracker.summary(),
        generatedAt: new Date().toISOString()
      };
      socket.emit("stats", payload);
    } catch (error) {
      socket.emit("dashboard-error", {
        message: "Gagal mengambil statistik."
      });
    }
  };

  sendStats();
  const interval = setInterval(sendStats, 5000);

  socket.on("disconnect", () => {
    clearInterval(interval);
  });
});

setInterval(() => {
  tracker.poll();
}, 3000);

app.get("/", (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.sendFile(path.join(__dirname, "public", "dashboard.html"));
  }
  return res.sendFile(path.join(__dirname, "public", "login.html"));
});

server.listen(PORT, () => {
  console.log(`VPS Dashboard berjalan di http://0.0.0.0:${PORT}`);
});
