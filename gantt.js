function toISOFromDDMMYYYY(value) {
  if (!value || typeof value !== "string" || !value.includes("-")) return null;
  const [dd, mm, yyyy] = value.split("-");
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(isoDate, days) {
  const base = new Date(`${isoDate}T00:00:00`);
  base.setDate(base.getDate() + days);
  return base;
}

function daysBetween(a, b) {
  const ms = b.getTime() - a.getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function normalizeScope(scope) {
  const text = (scope || "").toLowerCase();
  if (text.includes("entel")) return "entel";
  if (text.includes("intellicore")) return "intellicore";
  if (text.includes("gestion") || text.includes("gerencia") || text.includes("ejecutiv")) return "gestion";
  if (text.includes("splunk") || text.includes("dplink")) return "splunk";
  if (text.includes("conjunta") || text.includes("conjunto")) return "conjunta";
  return "entel";
}

function parseRoadmapData() {
  try {
    const raw = localStorage.getItem("roadmapData");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((lane) =>
      (lane.tasks || []).map((task) => ({
        id: task.id,
        title: task.title,
        scope: task.scope,
        start: task.start,
        pending: task.pending,
        completed: Boolean(task.completed),
      }))
    );
  } catch {
    return [];
  }
}

function withSchedule(tasks) {
  const normalized = tasks
    .map((task) => {
      const startISO = toISOFromDDMMYYYY(task.start) || "2026-04-15";
      const endISO = toISOFromDDMMYYYY(task.pending);
      const startDate = new Date(`${startISO}T00:00:00`);
      const endDate = endISO ? new Date(`${endISO}T00:00:00`) : addDays(startISO, task.completed ? 5 : 10);
      const duration = daysBetween(startDate, endDate);

      return {
        ...task,
        scopeKey: normalizeScope(task.scope),
        startDate,
        endDate,
        duration,
        status: task.completed ? "Cerrada" : "Activa",
      };
    })
    .sort((a, b) => a.startDate - b.startDate);

  if (normalized.length === 0) return { tasks: [], spanDays: 1, minDate: new Date("2026-04-15T00:00:00") };

  const minDate = normalized.reduce((acc, item) => (item.startDate < acc ? item.startDate : acc), normalized[0].startDate);
  const maxDate = normalized.reduce((acc, item) => (item.endDate > acc ? item.endDate : acc), normalized[0].endDate);
  const spanDays = daysBetween(minDate, maxDate);

  return { tasks: normalized, spanDays, minDate };
}

function formatDate(date) {
  return date.toLocaleDateString("es-CL");
}

function updateCurrentDateAndCounter(payload) {
  const currentDate = document.getElementById("ganttCurrentDate");
  const dayCounter = document.getElementById("ganttDayCounter");
  if (!currentDate || !dayCounter) return;

  const now = new Date();
  currentDate.textContent = now.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const totalDays = Math.max(1, payload.spanDays);
  const elapsed = Math.floor((now.getTime() - payload.minDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const day = Math.max(1, Math.min(totalDays, elapsed));
  dayCounter.textContent = `D${day}/${totalDays}`;
}

function renderRows(payload) {
  const rows = document.getElementById("ganttRows");
  if (!rows) return;

  rows.innerHTML = "";

  payload.tasks.forEach((task) => {
    const offset = daysBetween(payload.minDate, task.startDate) - 1;
    const left = Math.round((offset / payload.spanDays) * 100);
    const width = Math.max(3, Math.round((task.duration / payload.spanDays) * 100));

    const row = document.createElement("article");
    row.className = "gantt-row";

    const title = document.createElement("div");
    title.className = "task-title";
    title.innerHTML = `<span class="task-id">${task.id}</span><span class="task-name">${task.title}</span>`;

    const start = document.createElement("span");
    start.textContent = formatDate(task.startDate);

    const end = document.createElement("span");
    end.textContent = formatDate(task.endDate);

    const duration = document.createElement("span");
    duration.textContent = `${task.duration} d`;

    const status = document.createElement("span");
    status.className = `status ${task.completed ? "closed" : ""}`;
    status.textContent = task.status;

    const timeline = document.createElement("div");
    timeline.className = "timeline";

    const bar = document.createElement("div");
    bar.className = `bar ${task.scopeKey}`;
    bar.style.left = `${left}%`;
    bar.style.width = `${Math.min(100 - left, width)}%`;

    timeline.appendChild(bar);
    row.append(title, start, end, duration, status, timeline);
    rows.appendChild(row);
  });
}

// ============= Zoom State =============
let zoomLevel = 1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const DAYS_PER_COL = 7;

function getColWidthPx() {
  return 80 * zoomLevel;
}

function getColWidthDays() {
  return DAYS_PER_COL / zoomLevel;
}

// ============= Render Left Panel (Task List) =============
function renderLeftPanel(payload) {
  const leftRows = document.getElementById("ganttRowsLeft");
  if (!leftRows) return;

  leftRows.innerHTML = "";

  payload.tasks.forEach((task) => {
    const pct = task.completed ? 100 : 0;
    const row = document.createElement("div");
    row.className = "gantt-row-left";

    const title = document.createElement("div");
    title.className = "task-title-left";
    title.innerHTML = `<span class="task-id-left">${task.id}</span><span class="task-name-left">${task.title}</span>`;

    const pctSpan = document.createElement("span");
    pctSpan.className = `pct-badge ${task.completed ? "completed" : ""}`;
    pctSpan.textContent = `${pct}%`;

    const startSpan = document.createElement("span");
    startSpan.textContent = formatDate(task.startDate);

    const endSpan = document.createElement("span");
    endSpan.textContent = formatDate(task.endDate);

    const durationSpan = document.createElement("span");
    durationSpan.textContent = `${task.duration}d`;

    row.append(title, pctSpan, startSpan, endSpan, durationSpan);
    leftRows.appendChild(row);
  });
}

// ============= Render Timeline Header =============
function renderTimelineHeader(payload) {
  const header = document.getElementById("ganttTimelineHeader");
  if (!header) return;

  header.innerHTML = "";

  const colWidthPx = getColWidthPx();
  const colWidthDays = getColWidthDays();

  let currentDate = new Date(payload.minDate);
  let totalWidth = 0;

  while (currentDate <= payload.maxDate) {
    const col = document.createElement("div");
    col.className = "gantt-timeline-col";
    col.style.minWidth = colWidthPx + "px";
    col.style.width = colWidthPx + "px";

    const weekNum = Math.ceil((currentDate.getDate() + 6) / 7);
    const month = currentDate.toLocaleDateString("es-CL", { month: "short", year: "2-digit" });
    const weekLabel = `S${weekNum}`;
    const dateStart = currentDate.getDate();

    col.innerHTML = `
      <div class="gantt-timeline-col-week">${month}</div>
      <div class="gantt-timeline-col-date">${dateStart}</div>
    `;

    header.appendChild(col);
    currentDate = new Date(currentDate.getTime() + colWidthDays * 24 * 60 * 60 * 1000);
    totalWidth += colWidthPx;
  }
}

// ============= Render Gantt Rows (Timeline Bars) =============
function renderGanttRows(payload) {
  const container = document.getElementById("ganttRowsContainer");
  if (!container) return;

  container.innerHTML = "";

  const colWidthPx = getColWidthPx();
  const colWidthDays = getColWidthDays();
  const now = new Date();

  // Add today line
  const daysFromMin = daysBetween(payload.minDate, now) - 1;
  const todayLeft = (daysFromMin / (colWidthDays || 1)) * colWidthPx;
  if (daysFromMin >= 0 && daysFromMin <= payload.spanDays) {
    const todayLine = document.createElement("div");
    todayLine.className = "gantt-today-line";
    todayLine.style.left = todayLeft + "px";
    container.appendChild(todayLine);
  }

  // Render each task row
  payload.tasks.forEach((task, idx) => {
    const rowDiv = document.createElement("div");
    rowDiv.className = "gantt-row-right";

    const barContainer = document.createElement("div");
    barContainer.className = "timeline-bar-container";

    // Calculate bar position and width
    const startOffset = daysBetween(payload.minDate, task.startDate) - 1;
    const barLeft = (startOffset / (colWidthDays || 1)) * colWidthPx;
    const barWidth = (task.duration / (colWidthDays || 1)) * colWidthPx;

    // Create bar
    const bar = document.createElement("div");
    bar.className = `timeline-bar ${task.scopeKey} ${task.completed ? "completed" : ""}`;
    bar.style.left = barLeft + "px";
    bar.style.width = Math.max(30, barWidth) + "px";

    const barText = document.createElement("span");
    barText.className = "bar-text";
    barText.textContent = task.title;
    bar.appendChild(barText);

    // Add tooltip on hover
    bar.title = `${task.title}\n${formatDate(task.startDate)} → ${formatDate(task.endDate)}\n${task.duration} días\n${task.status}`;

    barContainer.appendChild(bar);
    rowDiv.appendChild(barContainer);
    container.appendChild(rowDiv);
  });
}

// ============= Sync Scroll =============
function setupScrollSync() {
  const leftPanel = document.getElementById("ganttRowsLeft");
  const rightPanel = document.getElementById("ganttRowsContainer");
  const timelineHeader = document.getElementById("ganttTimelineHeader");

  if (!leftPanel || !rightPanel || !timelineHeader) return;

  rightPanel.addEventListener("scroll", () => {
    leftPanel.scrollTop = rightPanel.scrollTop;
    timelineHeader.scrollLeft = rightPanel.scrollLeft;
  });

  leftPanel.addEventListener("scroll", () => {
    rightPanel.scrollTop = leftPanel.scrollTop;
  });

  timelineHeader.addEventListener("scroll", () => {
    rightPanel.scrollLeft = timelineHeader.scrollLeft;
  });
}

// ============= Zoom Controls =============
function setupZoomControls(payload) {
  const zoomInBtn = document.getElementById("zoomIn");
  const zoomOutBtn = document.getElementById("zoomOut");

  if (!zoomInBtn || !zoomOutBtn) return;

  zoomInBtn.addEventListener("click", () => {
    zoomLevel = Math.min(MAX_ZOOM, zoomLevel + 0.2);
    renderTimelineHeader(payload);
    renderGanttRows(payload);
  });

  zoomOutBtn.addEventListener("click", () => {
    zoomLevel = Math.max(MIN_ZOOM, zoomLevel - 0.2);
    renderTimelineHeader(payload);
    renderGanttRows(payload);
  });
}

// ============= CSV Export =============
function buildCsv(payload) {
  const headers = ["ID", "Tarea", "Scope", "Inicio", "Fin", "DuracionDias", "Estado", "% Completado"];
  const lines = payload.tasks.map((task) => [
    task.id,
    task.title,
    task.scope,
    formatDate(task.startDate),
    formatDate(task.endDate),
    task.duration,
    task.status,
    task.completed ? "100%" : "0%",
  ]);

  return [headers, ...lines]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

function hookDownload(payload) {
  const button = document.getElementById("downloadCsv");
  if (!button) return;

  button.addEventListener("click", () => {
    const csv = buildCsv(payload);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "carta-gantt-roadmap-core.csv";
    link.click();
    URL.revokeObjectURL(url);
  });
}

// ============= Updated Date =============
function setUpdatedDate() {
  const target = document.getElementById("updatedAt");
  if (!target) return;

  const stored = localStorage.getItem("roadmapUpdatedAt");
  if (!stored) {
    target.textContent = "Actualizado: sin datos en localStorage";
    return;
  }

  const asDate = new Date(stored);
  target.textContent = `Actualizado: ${asDate.toLocaleString("es-CL", { hour12: false })}`;
}

// ============= Initialize =============
const tasks = parseRoadmapData();
const payload = withSchedule(tasks);

// Calcula maxDate si no existe
if (!payload.maxDate) {
  const maxDate = payload.tasks.reduce((acc, item) => (item.endDate > acc ? item.endDate : acc), payload.tasks[0]?.endDate || new Date());
  payload.maxDate = maxDate;
}

renderLeftPanel(payload);
renderTimelineHeader(payload);
renderGanttRows(payload);
setupScrollSync();
setupZoomControls(payload);
hookDownload(payload);
setUpdatedDate();
updateCurrentDateAndCounter(payload);
window.setInterval(() => updateCurrentDateAndCounter(payload), 1000);
