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
  if (text.includes("splunk")) return "splunk";
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

function buildCsv(payload) {
  const headers = ["ID", "Tarea", "Scope", "Inicio", "Fin", "DuracionDias", "Estado"];
  const lines = payload.tasks.map((task) => [
    task.id,
    task.title,
    task.scope,
    formatDate(task.startDate),
    formatDate(task.endDate),
    task.duration,
    task.status,
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

const tasks = parseRoadmapData();
const payload = withSchedule(tasks);
renderRows(payload);
hookDownload(payload);
setUpdatedDate();
updateCurrentDateAndCounter(payload);
window.setInterval(() => updateCurrentDateAndCounter(payload), 1000);
