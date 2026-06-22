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
const DAYS_PER_COL = 5;

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

  payload.tasks.forEach((task, idx) => {
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

    // Dependencia: mostrar si es dependiente de la tarea anterior
    const depSpan = document.createElement("span");
    depSpan.className = "dep-badge";
    if (idx > 0) {
      depSpan.textContent = payload.tasks[idx - 1].id;
    } else {
      depSpan.textContent = "-";
    }

    // Calendario: mostrar fecha de inicio
    const calSpan = document.createElement("span");
    calSpan.className = "status-badge";
    calSpan.textContent = task.startDate.getDate();
    calSpan.title = formatDate(task.startDate);

    // Estado
    const statusSpan = document.createElement("span");
    statusSpan.className = `status-badge ${task.completed ? "" : "pending"}`;
    statusSpan.textContent = task.status === "Cerrada" ? "✓" : "○";

    row.append(title, pctSpan, startSpan, endSpan, depSpan, calSpan, statusSpan);
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
  // Ajustar a lunes más próximo
  const dayOfWeek = currentDate.getDay();
  if (dayOfWeek !== 1) {
    const daysToAdd = dayOfWeek === 0 ? 1 : (1 - dayOfWeek + 7) % 7;
    currentDate.setDate(currentDate.getDate() + daysToAdd);
  }
  
  let totalWidth = 0;

  const diasSemana = ["D", "L", "M", "M", "J", "V", "S"];

  while (currentDate <= payload.maxDate) {
    const col = document.createElement("div");
    col.className = "gantt-timeline-col";
    col.style.minWidth = colWidthPx + "px";
    col.style.width = colWidthPx + "px";

    // Calcular rango de fechas (Lunes a Viernes)
    const dateStart = currentDate.getDate();
    const dateEnd = new Date(currentDate.getTime() + 4 * 24 * 60 * 60 * 1000); // Viernes (4 días después del lunes)
    const dayEnd = dateEnd.getDate();
    
    // Obtener mes abreviado
    const month = currentDate.toLocaleDateString("es-CL", { month: "short" });
    
    // Generar rango de abreviaturas de días (L M M J V)
    let daysLabel = "";
    for (let i = 0; i < 5; i++) {
      const checkDate = new Date(currentDate.getTime() + i * 24 * 60 * 60 * 1000);
      daysLabel += diasSemana[checkDate.getDay()] + " ";
    }
    daysLabel = daysLabel.trim();

    col.innerHTML = `
      <div class="gantt-timeline-col-week">${dateStart}-${dayEnd} ${month}</div>
      <div class="gantt-timeline-col-date">${daysLabel}</div>
    `;

    header.appendChild(col);
    currentDate = new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000); // Avanzar 7 días al siguiente lunes
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
  const bottomScroll = document.getElementById("ganttHorizontalScroll");
  const bottomSpacer = document.getElementById("ganttHorizontalSpacer");
  const svg = document.getElementById("ganttDependencies");

  if (!leftPanel || !rightPanel || !timelineHeader) return;

  rightPanel.addEventListener("scroll", () => {
    leftPanel.scrollTop = rightPanel.scrollTop;
    timelineHeader.scrollLeft = rightPanel.scrollLeft;
    if (bottomScroll) {
      bottomScroll.scrollLeft = rightPanel.scrollLeft;
    }
    if (svg) {
      svg.style.transform = `translate(${-rightPanel.scrollLeft}px, ${-rightPanel.scrollTop}px)`;
    }
  });

  leftPanel.addEventListener("scroll", () => {
    rightPanel.scrollTop = leftPanel.scrollTop;
  });

  timelineHeader.addEventListener("scroll", () => {
    rightPanel.scrollLeft = timelineHeader.scrollLeft;
    if (bottomScroll) {
      bottomScroll.scrollLeft = timelineHeader.scrollLeft;
    }
  });

  if (bottomScroll) {
    bottomScroll.addEventListener("scroll", () => {
      rightPanel.scrollLeft = bottomScroll.scrollLeft;
      timelineHeader.scrollLeft = bottomScroll.scrollLeft;
    });
  }
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
    renderDependencies(payload);
  });

  zoomOutBtn.addEventListener("click", () => {
    zoomLevel = Math.max(MIN_ZOOM, zoomLevel - 0.2);
    renderTimelineHeader(payload);
    renderGanttRows(payload);
    renderDependencies(payload);
  });
}

// ============= Excel Export =============
function startOfMonday(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);
  return result;
}

function addLocalDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getWeekPeriods(minDate, maxDate) {
  const weeks = [];
  let cursor = startOfMonday(minDate);
  const limit = new Date(maxDate);
  limit.setHours(0, 0, 0, 0);

  while (cursor <= limit) {
    const weekEnd = addLocalDays(cursor, 4);
    const monthLabel = cursor.toLocaleDateString("es-CL", { month: "short" });
    weeks.push({
      start: new Date(cursor),
      end: new Date(weekEnd),
      label: `${cursor.getDate()}-${weekEnd.getDate()} ${monthLabel}`,
      daysLabel: "L M M J V",
    });
    cursor = addLocalDays(cursor, 7);
  }

  return weeks;
}

function hexToArgb(hex) {
  return `FF${hex.replace("#", "").toUpperCase()}`;
}

function getScopeColor(scopeKey) {
  const palette = {
    entel: "67A9DF",
    intellicore: "E4580D",
    gestion: "D96FD3",
    splunk: "9DC77B",
    conjunta: "CCB96A",
  };

  return hexToArgb(`#${palette[scopeKey] || palette.entel}`);
}

function applyCellBorder(cell) {
  cell.border = {
    top: { style: "thin", color: { argb: "FF2E3A55" } },
    left: { style: "thin", color: { argb: "FF2E3A55" } },
    bottom: { style: "thin", color: { argb: "FF2E3A55" } },
    right: { style: "thin", color: { argb: "FF2E3A55" } },
  };
}

function styleHeaderCell(cell, fillColor, fontColor = "FFFFFFFF") {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillColor } };
  cell.font = { color: { argb: fontColor }, bold: true, name: "Manrope" };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  applyCellBorder(cell);
}

async function buildExcelWorkbook(payload) {
  const ExcelJS = window.ExcelJS;
  if (!ExcelJS) {
    throw new Error("ExcelJS no está disponible");
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Automatizacion Core";
  workbook.created = new Date();
  workbook.modified = new Date();

  const weeks = getWeekPeriods(payload.minDate, payload.maxDate);
  const totalColumns = 7 + weeks.length;
  const darkFill = "FF111D35";
  const darkFillAlt = "FF0E182B";
  const lineColor = "FF2E3A55";
  const titleFill = "FF0B1529";

  const roadmap = workbook.addWorksheet("Roadmap", {
    views: [{ state: "frozen", ySplit: 4, xSplit: 7 }],
  });

  roadmap.columns = [
    { width: 16 },
    { width: 40 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 10 },
    { width: 12 },
    ...weeks.map(() => ({ width: 16 })),
  ];

  roadmap.mergeCells(1, 1, 1, totalColumns);
  roadmap.getCell(1, 1).value = "Automatizacion Core - Roadmap";
  roadmap.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: titleFill } };
  roadmap.getCell(1, 1).font = { color: { argb: "FFFFFFFF" }, bold: true, size: 16, name: "Space Grotesk" };
  roadmap.getCell(1, 1).alignment = { vertical: "middle", horizontal: "left" };

  roadmap.mergeCells(2, 1, 2, totalColumns);
  roadmap.getCell(2, 1).value = "Vista de trabajo con columnas separadas y barras semanales";
  roadmap.getCell(2, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: darkFillAlt } };
  roadmap.getCell(2, 1).font = { color: { argb: "FF9DB0D1" }, italic: true, name: "Manrope" };
  roadmap.getCell(2, 1).alignment = { vertical: "middle", horizontal: "left" };

  const roadmapHeaders = ["TAREA", "%", "INICIO", "FIN", "DEP.", "CAL", "ESTADO"];
  roadmapHeaders.forEach((label, index) => {
    const cell = roadmap.getCell(4, index + 1);
    cell.value = label;
    styleHeaderCell(cell, "FF1A2742");
  });

  weeks.forEach((week, index) => {
    const cell = roadmap.getCell(4, 8 + index);
    cell.value = `${week.label}\n${week.daysLabel}`;
    styleHeaderCell(cell, "FF1A2742");
  });
  roadmap.getRow(4).height = 34;

  payload.tasks.forEach((task, idx) => {
    const rowNumber = 5 + idx;
    const row = roadmap.getRow(rowNumber);
    row.height = 24;

    const metadataValues = [
      `${task.id}\n${task.title}`,
      task.completed ? "100%" : "0%",
      formatDate(task.startDate),
      formatDate(task.endDate),
      idx > 0 ? payload.tasks[idx - 1].id : "-",
      task.startDate.getDate(),
      task.status === "Cerrada" ? "✓" : "○",
    ];

    metadataValues.forEach((value, columnIndex) => {
      const cell = roadmap.getCell(rowNumber, columnIndex + 1);
      cell.value = value;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: columnIndex % 2 === 0 ? darkFillAlt : darkFill } };
      cell.font = { color: { argb: "FFECF2FF" }, name: "Manrope", bold: columnIndex === 0 };
      cell.alignment = { vertical: "middle", horizontal: columnIndex === 0 ? "left" : "center", wrapText: true };
      applyCellBorder(cell);
    });

    weeks.forEach((week, weekIndex) => {
      const cell = roadmap.getCell(rowNumber, 8 + weekIndex);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: darkFill } };
      cell.border = {
        top: { style: "thin", color: { argb: lineColor } },
        left: { style: "thin", color: { argb: lineColor } },
        bottom: { style: "thin", color: { argb: lineColor } },
        right: { style: "thin", color: { argb: lineColor } },
      };
    });

    const overlaps = weeks
      .map((week, weekIndex) => ({ week, weekIndex }))
      .filter(({ week }) => task.startDate <= week.end && task.endDate >= week.start);

    if (overlaps.length > 0) {
      const first = overlaps[0].weekIndex + 8;
      const last = overlaps[overlaps.length - 1].weekIndex + 8;
      if (first === last) {
        roadmap.getCell(rowNumber, first).value = `${task.id} ${task.title}`;
        roadmap.getCell(rowNumber, first).fill = { type: "pattern", pattern: "solid", fgColor: { argb: getScopeColor(task.scopeKey) } };
        roadmap.getCell(rowNumber, first).font = { color: { argb: "FFFFFFFF" }, bold: true, name: "Manrope" };
        roadmap.getCell(rowNumber, first).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        applyCellBorder(roadmap.getCell(rowNumber, first));
      } else {
        roadmap.mergeCells(rowNumber, first, rowNumber, last);
        const barCell = roadmap.getCell(rowNumber, first);
        barCell.value = `${task.id} ${task.title}`;
        barCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: getScopeColor(task.scopeKey) } };
        barCell.font = { color: { argb: "FFFFFFFF" }, bold: true, name: "Manrope" };
        barCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        applyCellBorder(barCell);
      }
    }
  });

  roadmap.autoFilter = { from: "A4", to: `${String.fromCharCode(64 + Math.min(totalColumns, 26))}4` };

  const summary = workbook.addWorksheet("Resumen", {
    views: [{ state: "frozen", ySplit: 3 }],
  });

  summary.columns = [
    { width: 16 },
    { width: 42 },
    { width: 16 },
    { width: 16 },
    { width: 18 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
  ];

  summary.mergeCells(1, 1, 1, 8);
  summary.getCell(1, 1).value = "Automatizacion Core - Resumen de tareas";
  summary.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: titleFill } };
  summary.getCell(1, 1).font = { color: { argb: "FFFFFFFF" }, bold: true, size: 14, name: "Space Grotesk" };
  summary.getCell(1, 1).alignment = { vertical: "middle", horizontal: "left" };

  summary.mergeCells(2, 1, 2, 8);
  summary.getCell(2, 1).value = `Exportado: ${new Date().toLocaleString("es-CL", { hour12: false })}`;
  summary.getCell(2, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: darkFillAlt } };
  summary.getCell(2, 1).font = { color: { argb: "FF9DB0D1" }, italic: true, name: "Manrope" };

  const summaryHeaders = ["ID", "Tarea", "Scope", "Inicio", "Fin", "Duración", "Estado", "% Completado"];
  summary.addRow(summaryHeaders);
  const summaryHeaderRow = summary.getRow(3);
  summaryHeaderRow.height = 22;
  summaryHeaderRow.eachCell((cell) => {
    styleHeaderCell(cell, "FF1A2742");
  });

  payload.tasks.forEach((task) => {
    const row = summary.addRow([
      task.id,
      task.title,
      task.scope,
      formatDate(task.startDate),
      formatDate(task.endDate),
      task.duration,
      task.status,
      task.completed ? "100%" : "0%",
    ]);
    row.height = 20;
    row.eachCell((cell, colNumber) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colNumber % 2 === 0 ? darkFillAlt : darkFill } };
      cell.font = { color: { argb: "FFECF2FF" }, name: "Manrope" };
      cell.alignment = { vertical: "middle", horizontal: colNumber === 2 ? "left" : "center", wrapText: true };
      applyCellBorder(cell);
    });
  });

  summary.autoFilter = { from: "A3", to: "H3" };

  const gantt = workbook.addWorksheet("Gantt", {
    views: [{ state: "frozen", ySplit: 4, xSplit: 7 }],
  });

  gantt.columns = [
    { width: 16 },
    { width: 40 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 10 },
    { width: 12 },
    ...weeks.map(() => ({ width: 16 })),
  ];

  gantt.mergeCells(1, 1, 1, totalColumns);
  gantt.getCell(1, 1).value = "Carta Gantt del Roadmap";
  gantt.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: titleFill } };
  gantt.getCell(1, 1).font = { color: { argb: "FFFFFFFF" }, bold: true, size: 16, name: "Space Grotesk" };
  gantt.getCell(1, 1).alignment = { vertical: "middle", horizontal: "left" };

  gantt.mergeCells(2, 1, 2, totalColumns);
  gantt.getCell(2, 1).value = "Vista semanal tipo dashboard con barras por scope";
  gantt.getCell(2, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: darkFillAlt } };
  gantt.getCell(2, 1).font = { color: { argb: "FF9DB0D1" }, italic: true, name: "Manrope" };
  gantt.getCell(2, 1).alignment = { vertical: "middle", horizontal: "left" };

  const ganttHeaders = ["TAREA", "%", "INICIO", "FIN", "DEP.", "CAL", "ESTADO"];
  ganttHeaders.forEach((label, index) => {
    const cell = gantt.getCell(4, index + 1);
    cell.value = label;
    styleHeaderCell(cell, "FF1A2742");
  });

  weeks.forEach((week, index) => {
    const cell = gantt.getCell(4, 8 + index);
    cell.value = `${week.label}\n${week.daysLabel}`;
    styleHeaderCell(cell, "FF1A2742");
  });
  gantt.getRow(4).height = 34;

  payload.tasks.forEach((task, idx) => {
    const rowNumber = 5 + idx;
    const row = gantt.getRow(rowNumber);
    row.height = 24;

    const metadataValues = [
      `${task.id}\n${task.title}`,
      task.completed ? "100%" : "0%",
      formatDate(task.startDate),
      formatDate(task.endDate),
      idx > 0 ? payload.tasks[idx - 1].id : "-",
      task.startDate.getDate(),
      task.status === "Cerrada" ? "✓" : "○",
    ];

    metadataValues.forEach((value, columnIndex) => {
      const cell = gantt.getCell(rowNumber, columnIndex + 1);
      cell.value = value;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: columnIndex % 2 === 0 ? darkFillAlt : darkFill } };
      cell.font = { color: { argb: "FFECF2FF" }, name: "Manrope", bold: columnIndex === 0 };
      cell.alignment = { vertical: "middle", horizontal: columnIndex === 0 ? "left" : "center", wrapText: true };
      applyCellBorder(cell);
    });

    weeks.forEach((week, weekIndex) => {
      const cell = gantt.getCell(rowNumber, 8 + weekIndex);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: darkFill } };
      cell.border = {
        top: { style: "thin", color: { argb: lineColor } },
        left: { style: "thin", color: { argb: lineColor } },
        bottom: { style: "thin", color: { argb: lineColor } },
        right: { style: "thin", color: { argb: lineColor } },
      };
    });

    const overlaps = weeks
      .map((week, weekIndex) => ({ week, weekIndex }))
      .filter(({ week }) => task.startDate <= week.end && task.endDate >= week.start);

    if (overlaps.length > 0) {
      const first = overlaps[0].weekIndex + 8;
      const last = overlaps[overlaps.length - 1].weekIndex + 8;
      if (first === last) {
        gantt.getCell(rowNumber, first).value = `${task.id} ${task.title}`;
        gantt.getCell(rowNumber, first).fill = { type: "pattern", pattern: "solid", fgColor: { argb: getScopeColor(task.scopeKey) } };
        gantt.getCell(rowNumber, first).font = { color: { argb: "FFFFFFFF" }, bold: true, name: "Manrope" };
        gantt.getCell(rowNumber, first).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        applyCellBorder(gantt.getCell(rowNumber, first));
      } else {
        gantt.mergeCells(rowNumber, first, rowNumber, last);
        const barCell = gantt.getCell(rowNumber, first);
        barCell.value = `${task.id} ${task.title}`;
        barCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: getScopeColor(task.scopeKey) } };
        barCell.font = { color: { argb: "FFFFFFFF" }, bold: true, name: "Manrope" };
        barCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        applyCellBorder(barCell);
      }
    }
  });

  gantt.autoFilter = { from: "A4", to: `${String.fromCharCode(64 + Math.min(totalColumns, 26))}4` };

  return workbook;
}

function hookDownload(payload) {
  const button = document.getElementById("downloadCsv");
  if (!button) return;

  button.addEventListener("click", async () => {
    try {
      const workbook = await buildExcelWorkbook(payload);
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "carta-gantt-roadmap-core.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert("No se pudo generar el Excel. Revisa la conexión o intenta de nuevo.");
    }
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

// ============= Calendar Functionality =============
function getClampedCalendarMonth(referenceDate = new Date()) {
  const monthDate = new Date(referenceDate);
  monthDate.setHours(0, 0, 0, 0);

  if (monthDate.getMonth() < 3) monthDate.setMonth(3, 1);
  if (monthDate.getMonth() > 11) monthDate.setMonth(11, 1);
  return monthDate;
}

let calendarMonth = getClampedCalendarMonth();

function renderCalendar() {
  const container = document.getElementById("ganttCalendarContainer");
  if (!container) return;

  container.innerHTML = "";
  container.className = "calendar-sidebar-container";

  // Validar que esté entre abril (mes 3) y diciembre (mes 11)
  if (calendarMonth.getMonth() < 3) calendarMonth.setMonth(3);
  if (calendarMonth.getMonth() > 11) calendarMonth.setMonth(11);

  const monthDate = new Date(calendarMonth);
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  
  const monthName = monthDate.toLocaleDateString("es-CL", { month: "short", year: "2-digit" });
  
  const firstDay = new Date(year, month, 1);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay());

  const calendarDiv = document.createElement("div");
  calendarDiv.className = "gantt-calendar";

  let html = `
    <div class="calendar-month-year-inline">${monthName}</div>
    <div class="calendar-weekdays-inline">
      <div class="calendar-weekday-inline">D</div>
      <div class="calendar-weekday-inline">L</div>
      <div class="calendar-weekday-inline">M</div>
      <div class="calendar-weekday-inline">M</div>
      <div class="calendar-weekday-inline">J</div>
      <div class="calendar-weekday-inline">V</div>
      <div class="calendar-weekday-inline">S</div>
    </div>
    <div class="calendar-days-inline">
  `;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 42; i++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + i);
    const isCurrentMonth = currentDate.getMonth() === month;
    const isToday = currentDate.getTime() === today.getTime();
    const dateNum = currentDate.getDate();

    const classes = ["calendar-day-inline"];
    if (!isCurrentMonth) classes.push("other-month");
    if (isToday) classes.push("today");

    const dateStr = currentDate.toISOString().split("T")[0];
    html += `<div class="calendar-day-inline ${classes.join(" ")}" data-date="${dateStr}" onclick="handleCalendarClick('${dateStr}')">${dateNum}</div>`;
  }

  html += `</div>`;
  calendarDiv.innerHTML = html;
  container.appendChild(calendarDiv);
}

function handleCalendarClick(dateStr) {
  const selectedDays = document.querySelectorAll(".calendar-day-inline.selected");
  selectedDays.forEach((d) => d.classList.remove("selected"));
  
  const clicked = document.querySelector(`[data-date="${dateStr}"]`);
  if (clicked && !clicked.classList.contains("disabled") && !clicked.classList.contains("other-month")) {
    clicked.classList.add("selected");
  }
}

// ============= Render Dependencies =============
function renderDependencies(payload) {
  const svg = document.getElementById("ganttDependencies");
  if (!svg || payload.tasks.length < 2) return;

  svg.innerHTML = '<defs><marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><polygon points="0 0, 10 3, 0 6" fill="rgba(103, 169, 223, 0.6)" /></marker></defs>';

  const container = document.getElementById("ganttRowsContainer");
  if (!container) return;

  const colWidthPx = getColWidthPx();
  const colWidthDays = getColWidthDays();

  // Create dependencies based on task indices
  for (let idx = 1; idx < payload.tasks.length; idx++) {
    const prevTask = payload.tasks[idx - 1];
    const currTask = payload.tasks[idx];
    
    // Get bar positions
    const prevEndOffset = daysBetween(payload.minDate, prevTask.endDate) - 1;
    const prevX = (prevEndOffset / (colWidthDays || 1)) * colWidthPx + 80;

    const currStartOffset = daysBetween(payload.minDate, currTask.startDate) - 1;
    const currX = (currStartOffset / (colWidthDays || 1)) * colWidthPx;

    const rowHeight = 50;
    const prevY = idx * rowHeight + 25;
    const currY = (idx + 1) * rowHeight + 25;

    // Create Bezier curve for dependency
    const midX = (prevX + currX) / 2;
    const path = `M ${prevX} ${prevY} C ${midX} ${prevY}, ${midX} ${currY}, ${currX} ${currY}`;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
    line.setAttribute("d", path);
    line.setAttribute("class", "dependency-line");
    svg.appendChild(line);
  }

  // Resize SVG to fit content
  svg.setAttribute("width", container.scrollWidth);
  svg.setAttribute("height", container.scrollHeight);
}

// ============= Setup Calendar Controls =============
function setupCalendarControls() {
  const prevBtn = document.getElementById("calendarPrevMonth");
  const nextBtn = document.getElementById("calendarNextMonth");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      calendarMonth.setMonth(calendarMonth.getMonth() - 1);
      if (calendarMonth.getMonth() < 3) calendarMonth.setMonth(3);
      renderCalendar();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      calendarMonth.setMonth(calendarMonth.getMonth() + 1);
      if (calendarMonth.getMonth() > 11) calendarMonth.setMonth(11);
      renderCalendar();
    });
  }
}

function syncCalendarToCurrentMonth() {
  const currentMonth = getClampedCalendarMonth();
  if (
    currentMonth.getFullYear() !== calendarMonth.getFullYear() ||
    currentMonth.getMonth() !== calendarMonth.getMonth()
  ) {
    calendarMonth = currentMonth;
    renderCalendar();
  }
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
renderDependencies(payload);
setupScrollSync();
setupZoomControls(payload);
setupCalendarControls();
renderCalendar();
hookDownload(payload);
setUpdatedDate();
updateCurrentDateAndCounter(payload);
window.setInterval(() => updateCurrentDateAndCounter(payload), 1000);
window.setInterval(syncCalendarToCurrentMonth, 60000);

if (bottomSpacer) {
  bottomSpacer.style.width = `${Math.max(1200, payload.tasks.length * getColWidthPx() * 1.6)}px`;
}
