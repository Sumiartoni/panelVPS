function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size > 9 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}h ${hours}j ${minutes}m`;
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

const historyState = {
  cpu: [],
  memory: [],
  disk: [],
  traffic: []
};

const maxHistoryPoints = 24;

function pushHistory(key, value) {
  historyState[key].push(Number(value || 0));
  if (historyState[key].length > maxHistoryPoints) {
    historyState[key].shift();
  }
}

function getIntensityClass(value) {
  if (value >= 85) return "level-critical";
  if (value >= 65) return "level-high";
  if (value >= 35) return "level-medium";
  return "level-low";
}

function renderMatrix(containerId, values) {
  const container = document.getElementById(containerId);
  if (!values.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = values
    .map(
      (value) =>
        `<span class="matrix-cell ${getIntensityClass(value)}" title="${Number(
          value
        ).toFixed(1)}%"></span>`
    )
    .join("");
}

function renderSparkline(containerId, values, stroke) {
  const container = document.getElementById(containerId);
  if (!values.length) {
    container.innerHTML = "";
    return;
  }

  const width = 220;
  const height = 72;
  const max = 100;
  const min = 0;
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 0 : (index / (values.length - 1)) * width;
    const y = height - ((value - min) / (max - min)) * height;
    return `${x},${Math.max(4, Math.min(height - 4, y))}`;
  });

  const areaPoints = [`0,${height}`, ...points, `${width},${height}`].join(" ");
  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="sparkline-svg">
      <polygon points="${areaPoints}" class="sparkline-area"></polygon>
      <polyline points="${points.join(" ")}" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
    </svg>
  `;
}

function updateRealtimeVisuals(system, visitors) {
  const trafficScore = Math.min(100, visitors.requestsToday % 101);

  pushHistory("cpu", system.cpuLoad);
  pushHistory("memory", system.memory.usedPercent);
  pushHistory("disk", system.disk ? system.disk.usedPercent : 0);
  pushHistory("traffic", trafficScore);

  renderMatrix("cpu-matrix", historyState.cpu);
  renderMatrix("memory-matrix", historyState.memory);
  renderMatrix("disk-matrix", historyState.disk);
  renderMatrix("traffic-matrix", historyState.traffic);

  renderSparkline("cpu-sparkline", historyState.cpu, "#38bdf8");
  renderSparkline("memory-sparkline", historyState.memory, "#22c55e");
  renderSparkline("disk-sparkline", historyState.disk, "#f59e0b");
  renderSparkline("traffic-sparkline", historyState.traffic, "#f43f5e");

  document.getElementById("cpu-trend-value").textContent = formatPercent(system.cpuLoad);
  document.getElementById("memory-trend-value").textContent = formatPercent(
    system.memory.usedPercent
  );
  document.getElementById("disk-trend-value").textContent = system.disk
    ? formatPercent(system.disk.usedPercent)
    : "-";
  document.getElementById("traffic-trend-value").textContent = `${visitors.requestsToday} req`;
}

function setList(containerId, items, primaryKey, secondaryKey) {
  const container = document.getElementById(containerId);
  if (!items.length) {
    container.innerHTML = `<p class="text-secondary small mb-0">Belum ada data.</p>`;
    return;
  }

  container.innerHTML = items
    .map(
      (item) => `
        <div class="stack-list-row">
          <span class="text-break">${item[primaryKey]}</span>
          <strong>${item[secondaryKey]}</strong>
        </div>
      `
    )
    .join("");
}

function setRecentRows(rows) {
  const tbody = document.getElementById("recent-rows");
  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="text-center text-secondary py-4">Belum ada akses.</td></tr>';
    return;
  }

  tbody.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td>${new Date(row.at).toLocaleString("id-ID")}</td>
        <td>${row.ip}</td>
        <td>${row.method}</td>
        <td>${row.path}</td>
        <td>${row.status}</td>
        <td>${row.bytes}</td>
      </tr>
    `
    )
    .join("");
}

function updateDashboard(payload) {
  const { system, visitors, generatedAt } = payload;
  const memoryFree = system.memory.free ?? Math.max(system.memory.total - system.memory.used, 0);
  const diskFree = system.disk
    ? system.disk.free ?? Math.max(system.disk.total - system.disk.used, 0)
    : 0;

  document.getElementById("generated-at").textContent = `Update ${new Date(
    generatedAt
  ).toLocaleTimeString("id-ID")}`;
  document.getElementById("server-hostname").textContent = system.hostname;
  document.getElementById("platform").textContent = system.platform;
  document.getElementById("uptime").textContent = formatUptime(system.uptime);
  document.getElementById("cpu-load").textContent = formatPercent(system.cpuLoad);
  document.getElementById(
    "cpu-breakdown"
  ).textContent = `Used: ${formatPercent(system.cpuLoad)} | Free: ${formatPercent(
    system.cpuFree
  )}`;
  document.getElementById(
    "memory-usage"
  ).textContent = formatPercent(system.memory.usedPercent);
  document.getElementById(
    "memory-breakdown"
  ).textContent = `Used: ${formatBytes(system.memory.used)} | Free: ${formatBytes(
    memoryFree
  )} | Total: ${formatBytes(system.memory.total)}`;
  document.getElementById("disk-usage").textContent = system.disk
    ? formatPercent(system.disk.usedPercent)
    : "-";
  document.getElementById("disk-breakdown").textContent = system.disk
    ? `Used: ${formatBytes(system.disk.used)} | Free: ${formatBytes(
        diskFree
      )} | Total: ${formatBytes(system.disk.total)}`
    : "Disk tidak tersedia";
  document.getElementById("visitor-count").textContent =
    visitors.uniqueVisitorsToday;
  document.getElementById(
    "visitor-breakdown"
  ).textContent = `Request hari ini: ${visitors.requestsToday}`;

  updateRealtimeVisuals(system, visitors);

  document.getElementById("rx-speed").textContent = `${formatBytes(
    system.network.rxPerSecond
  )}/s`;
  document.getElementById("tx-speed").textContent = `${formatBytes(
    system.network.txPerSecond
  )}/s`;
  document.getElementById("rx-total").textContent = formatBytes(
    system.network.rxTotal
  );
  document.getElementById("tx-total").textContent = formatBytes(
    system.network.txTotal
  );

  document.getElementById("total-requests").textContent = visitors.totalRequests;
  document.getElementById("requests-today").textContent =
    visitors.requestsToday;
  document.getElementById("bandwidth").textContent = visitors.totalBandwidth;
  document.getElementById("ok-status").textContent =
    visitors.statusBuckets.ok;
  document.getElementById("redirect-status").textContent =
    visitors.statusBuckets.redirect;
  document.getElementById("error-status").textContent = `${
    visitors.statusBuckets.clientError + visitors.statusBuckets.serverError
  }`;

  setList("top-paths", visitors.topPaths, "path", "hits");
  setList("top-ips", visitors.topIps, "ip", "hits");
  setRecentRows(visitors.recent);
}

async function ensureAuthenticated() {
  const response = await fetch("/api/me");
  const result = await response.json();
  if (!result.authenticated) {
    window.location.href = "/";
  }
}

document.getElementById("logout-button").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/";
});

const themeToggle = document.getElementById("theme-toggle");
const savedTheme = localStorage.getItem("dashboard-theme") || "dark";
document.documentElement.setAttribute("data-theme", savedTheme);
themeToggle.textContent = savedTheme === "dark" ? "Mode Terang" : "Mode Gelap";

themeToggle.addEventListener("click", () => {
  const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
  const nextTheme = currentTheme === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", nextTheme);
  localStorage.setItem("dashboard-theme", nextTheme);
  themeToggle.textContent = nextTheme === "dark" ? "Mode Terang" : "Mode Gelap";
});

ensureAuthenticated().then(() => {
  const socket = io();
  socket.on("stats", updateDashboard);
  socket.on("dashboard-error", (error) => {
    document.getElementById("generated-at").textContent =
      error.message || "Gagal mengambil data";
  });
});
