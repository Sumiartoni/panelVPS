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

const maxHistoryPoints = 12;
const matrixPoints = 24;

function pushHistory(key, value, limit = maxHistoryPoints) {
  historyState[key].push(Number(value || 0));
  if (historyState[key].length > limit) {
    historyState[key].shift();
  }
}

function paddedHistory(key, limit = maxHistoryPoints) {
  const values = historyState[key].slice(-limit);
  while (values.length < limit) {
    values.unshift(0);
  }
  return values;
}

function matrixHistory(key) {
  const values = historyState[key].slice(-matrixPoints);
  while (values.length < matrixPoints) {
    values.unshift(0);
  }
  return values;
}

function getIntensityClass(value) {
  if (value >= 85) return "critical";
  if (value >= 65) return "high";
  if (value >= 35) return "medium";
  return "low";
}

function renderBarChart(containerId, values) {
  const container = document.getElementById(containerId);
  const safeValues = values.map((value) => Math.max(6, value));
  container.innerHTML = safeValues
    .map(
      (value) => `
        <div class="bar-col">
          <span class="bar-track">
            <span class="bar-fill" style="height:${value}%"></span>
          </span>
        </div>
      `
    )
    .join("");
}

function buildLinePath(values, width, height) {
  return values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * width;
      const y = height - (value / 100) * height;
      const safeY = Math.max(8, Math.min(height - 8, y));
      return `${x},${safeY}`;
    })
    .join(" ");
}

function renderDualLineChart(containerId, firstValues, secondValues) {
  const width = 320;
  const height = 140;
  const pointsA = buildLinePath(firstValues, width, height);
  const pointsB = buildLinePath(secondValues, width, height);
  const areaA = `0,${height} ${pointsA} ${width},${height}`;
  const areaB = `0,${height} ${pointsB} ${width},${height}`;

  document.getElementById(containerId).innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="line-svg">
      <g class="chart-grid">
        <line x1="0" y1="20" x2="${width}" y2="20"></line>
        <line x1="0" y1="60" x2="${width}" y2="60"></line>
        <line x1="0" y1="100" x2="${width}" y2="100"></line>
        <line x1="0" y1="140" x2="${width}" y2="140"></line>
      </g>
      <polygon points="${areaA}" class="area-blue"></polygon>
      <polygon points="${areaB}" class="area-amber"></polygon>
      <polyline points="${pointsA}" class="line-blue"></polyline>
      <polyline points="${pointsB}" class="line-amber"></polyline>
    </svg>
  `;
}

function renderStatusColumns(statusBuckets) {
  const total =
    statusBuckets.ok +
    statusBuckets.redirect +
    statusBuckets.clientError +
    statusBuckets.serverError ||
    1;

  const groups = [
    { label: "2xx", value: (statusBuckets.ok / total) * 100, className: "ok" },
    {
      label: "3xx",
      value: (statusBuckets.redirect / total) * 100,
      className: "redirect"
    },
    {
      label: "4xx",
      value: (statusBuckets.clientError / total) * 100,
      className: "client"
    },
    {
      label: "5xx",
      value: (statusBuckets.serverError / total) * 100,
      className: "server"
    }
  ];

  document.getElementById("status-columns").innerHTML = groups
    .map(
      (group) => `
        <div class="status-col">
          <div class="status-stick">
            <span class="status-stick-fill ${group.className}" style="height:${Math.max(
              8,
              group.value
            )}%"></span>
          </div>
          <strong>${group.label}</strong>
        </div>
      `
    )
    .join("");
}

function renderRankBars(containerId, items, primaryKey, secondaryKey) {
  const container = document.getElementById(containerId);
  if (!items.length) {
    container.innerHTML = `<p class="empty-note">Belum ada data.</p>`;
    return;
  }

  const max = Math.max(...items.map((item) => item[secondaryKey]), 1);
  container.innerHTML = items
    .slice(0, 5)
    .map(
      (item) => `
        <div class="rank-row">
          <div class="rank-copy">
            <span>${item[primaryKey]}</span>
            <strong>${item[secondaryKey]}</strong>
          </div>
          <div class="rank-track">
            <div class="rank-fill" style="width:${(item[secondaryKey] / max) * 100}%"></div>
          </div>
        </div>
      `
    )
    .join("");
}

function renderMatrix(containerId, values) {
  document.getElementById(containerId).innerHTML = values
    .map(
      (value) =>
        `<span class="matrix-cell ${getIntensityClass(value)}" title="${value.toFixed(
          1
        )}%"></span>`
    )
    .join("");
}

function renderRadarChart(values) {
  const size = 220;
  const center = size / 2;
  const radius = 78;
  const axisCount = values.length;
  const labels = ["CPU", "RAM", "Disk", "Traffic", "Errors", "RX/TX"];

  function pointFor(index, scale) {
    const angle = (-Math.PI / 2) + (index / axisCount) * Math.PI * 2;
    const distance = radius * scale;
    return [
      center + Math.cos(angle) * distance,
      center + Math.sin(angle) * distance
    ];
  }

  const rings = [0.25, 0.5, 0.75, 1]
    .map((scale) =>
      values
        .map((_, index) => pointFor(index, scale).join(","))
        .join(" ")
    )
    .map((points) => `<polygon points="${points}" class="radar-ring"></polygon>`)
    .join("");

  const axes = values
    .map((_, index) => {
      const [x, y] = pointFor(index, 1);
      return `<line x1="${center}" y1="${center}" x2="${x}" y2="${y}" class="radar-axis"></line>`;
    })
    .join("");

  const labelNodes = labels
    .map((label, index) => {
      const [x, y] = pointFor(index, 1.18);
      return `<text x="${x}" y="${y}" class="radar-label">${label}</text>`;
    })
    .join("");

  const dataPoints = values
    .map((value, index) => pointFor(index, value / 100).join(","))
    .join(" ");

  document.getElementById("radar-chart").innerHTML = `
    <svg viewBox="0 0 ${size} ${size}" class="radar-svg">
      ${rings}
      ${axes}
      <polygon points="${dataPoints}" class="radar-shape"></polygon>
      <polyline points="${dataPoints}" class="radar-line"></polyline>
      ${labelNodes}
    </svg>
  `;
}

function renderRequestCalendar(rows) {
  const cells = rows.slice(0, 28).map((row) => {
    const intensity =
      row.status >= 500
        ? "critical"
        : row.status >= 400
          ? "high"
          : row.status >= 300
            ? "medium"
            : "low";
    return `
      <div class="calendar-cell ${intensity}">
        <span>${new Date(row.at).getDate()}</span>
        <strong>${row.status}</strong>
      </div>
    `;
  });

  while (cells.length < 28) {
    cells.push('<div class="calendar-cell muted"><span>-</span><strong>0</strong></div>');
  }

  document.getElementById("request-calendar").innerHTML = cells.join("");
}

function renderRecentFeed(rows) {
  const container = document.getElementById("recent-feed");
  if (!rows.length) {
    container.innerHTML = `<p class="empty-note">Belum ada akses terbaru.</p>`;
    return;
  }

  container.innerHTML = rows
    .slice(0, 10)
    .map(
      (row) => `
        <div class="feed-row">
          <div class="feed-main">
            <strong>${row.method} ${row.path}</strong>
            <span>${row.ip}</span>
          </div>
          <div class="feed-side">
            <span class="feed-status status-${Math.floor(row.status / 100)}">${row.status}</span>
            <span>${row.bytes}</span>
            <span>${new Date(row.at).toLocaleTimeString("id-ID")}</span>
          </div>
        </div>
      `
    )
    .join("");
}

function renderSparkline(containerId, values, colorClass) {
  const width = 240;
  const height = 70;
  const points = buildLinePath(values, width, height);
  const area = `0,${height} ${points} ${width},${height}`;

  document.getElementById(containerId).innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="line-svg">
      <polygon points="${area}" class="spark-area ${colorClass}"></polygon>
      <polyline points="${points}" class="spark-line ${colorClass}"></polyline>
    </svg>
  `;
}

function setRingValue(elementId, percent) {
  const node = document.getElementById(elementId);
  node.style.setProperty("--ring-percent", `${percent}%`);
}

function updateDashboard(payload) {
  const { system, visitors, generatedAt } = payload;
  const memoryFree =
    system.memory.free ?? Math.max(system.memory.total - system.memory.used, 0);
  const diskFree = system.disk
    ? system.disk.free ?? Math.max(system.disk.total - system.disk.used, 0)
    : 0;
  const totalRequests = Math.max(visitors.totalRequests, 1);
  const trafficScore = Math.min(100, (visitors.requestsToday / totalRequests) * 100 * 3);
  const errorScore = Math.min(
    100,
    ((visitors.statusBuckets.clientError + visitors.statusBuckets.serverError) /
      totalRequests) *
      100 *
      5
  );
  const networkScore = Math.min(
    100,
    ((system.network.rxPerSecond || 0) + (system.network.txPerSecond || 0)) / (1024 * 1024)
  );

  pushHistory("cpu", system.cpuLoad, matrixPoints);
  pushHistory("memory", system.memory.usedPercent, matrixPoints);
  pushHistory("disk", system.disk ? system.disk.usedPercent : 0, matrixPoints);
  pushHistory("traffic", trafficScore, matrixPoints);

  document.getElementById("server-hostname").textContent = system.hostname;
  document.getElementById("generated-at").textContent = new Date(
    generatedAt
  ).toLocaleTimeString("id-ID");
  document.getElementById("cpu-load").textContent = formatPercent(system.cpuLoad);
  document.getElementById(
    "cpu-breakdown"
  ).textContent = `Used: ${formatPercent(system.cpuLoad)} | Free: ${formatPercent(
    system.cpuFree
  )}`;
  document.getElementById("memory-usage").textContent = formatPercent(
    system.memory.usedPercent
  );
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
  document.getElementById("total-requests").textContent = visitors.totalRequests;
  document.getElementById("requests-today").textContent = visitors.requestsToday;
  document.getElementById("bandwidth").textContent = visitors.totalBandwidth;
  document.getElementById("visitor-breakdown").textContent = `Request hari ini: ${visitors.requestsToday}`;
  document.getElementById("ok-status").textContent = visitors.statusBuckets.ok;
  document.getElementById("redirect-status").textContent =
    visitors.statusBuckets.redirect;
  document.getElementById("error-status").textContent =
    visitors.statusBuckets.clientError + visitors.statusBuckets.serverError;
  document.getElementById("platform").textContent = system.platform;
  document.getElementById("uptime").textContent = formatUptime(system.uptime);
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

  document.getElementById("cpu-ring-value").textContent = formatPercent(system.cpuLoad);
  document.getElementById("memory-ring-value").textContent = formatPercent(
    system.memory.usedPercent
  );

  setRingValue("visitor-donut", Math.min(100, (visitors.uniqueVisitorsToday / totalRequests) * 100 * 8));
  setRingValue("ring-cpu", system.cpuLoad);
  setRingValue("ring-memory", system.memory.usedPercent);
  setRingValue("ring-disk", system.disk ? system.disk.usedPercent : 0);

  const cpuHistory = paddedHistory("cpu");
  const memoryHistory = paddedHistory("memory");
  const diskHistory = paddedHistory("disk");
  const trafficHistory = paddedHistory("traffic");

  renderBarChart("cpu-bars", cpuHistory);
  renderDualLineChart("memory-traffic-line", memoryHistory, trafficHistory);
  renderStatusColumns(visitors.statusBuckets);
  renderRankBars("top-paths", visitors.topPaths, "path", "hits");
  renderRankBars("top-ips", visitors.topIps, "ip", "hits");
  renderMatrix("cpu-matrix", matrixHistory("cpu"));
  renderMatrix("memory-matrix", matrixHistory("memory"));
  renderMatrix("disk-matrix", matrixHistory("disk"));
  renderMatrix("traffic-matrix", matrixHistory("traffic"));
  renderRadarChart([
    system.cpuLoad,
    system.memory.usedPercent,
    system.disk ? system.disk.usedPercent : 0,
    trafficScore,
    errorScore,
    networkScore
  ]);
  renderRequestCalendar(visitors.recent);
  renderRecentFeed(visitors.recent);
  renderSparkline("cpu-sparkline", cpuHistory, "blue");
  renderSparkline("memory-sparkline", memoryHistory, "green");
  renderSparkline("disk-sparkline", diskHistory, "amber");
  renderSparkline("traffic-sparkline", trafficHistory, "rose");

  document.getElementById("cpu-trend-value").textContent = formatPercent(system.cpuLoad);
  document.getElementById("memory-trend-value").textContent = formatPercent(
    system.memory.usedPercent
  );
  document.getElementById("disk-trend-value").textContent = system.disk
    ? formatPercent(system.disk.usedPercent)
    : "-";
  document.getElementById("traffic-trend-value").textContent = `${visitors.requestsToday} req`;
  document.getElementById("cpu-sparkline-label").textContent = formatPercent(
    system.cpuLoad
  );
  document.getElementById("memory-sparkline-label").textContent = formatPercent(
    system.memory.usedPercent
  );
  document.getElementById("disk-sparkline-label").textContent = system.disk
    ? formatPercent(system.disk.usedPercent)
    : "-";
  document.getElementById("traffic-sparkline-label").textContent = `${visitors.requestsToday} req`;
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
const savedTheme = localStorage.getItem("dashboard-theme") || "light";
document.documentElement.setAttribute("data-theme", savedTheme);
themeToggle.textContent = savedTheme === "dark" ? "Mode Terang" : "Mode Gelap";

themeToggle.addEventListener("click", () => {
  const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
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
