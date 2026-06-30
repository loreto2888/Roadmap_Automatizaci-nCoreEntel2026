const fs = require("fs");
const path = require("path");
const express = require("express");
const { DeviceCodeCredential } = require("@azure/identity");
const { Client } = require("@microsoft/microsoft-graph-client");

const app = express();
const PORT = process.env.PORT || 3000;
const PLANNER_SYNC_TIMEOUT_MS = Number(process.env.PLANNER_SYNC_TIMEOUT_MS || 8000);
const PLANNER_AUTH_COOLDOWN_MS = Number(process.env.PLANNER_AUTH_COOLDOWN_MS || 300000);
const PLANNER_PROMPT_LOG_THROTTLE_MS = Number(process.env.PLANNER_PROMPT_LOG_THROTTLE_MS || 30000);

function readDotEnvPlanner() {
  const envPath = path.join(process.cwd(), ".env.planner");
  if (!fs.existsSync(envPath)) return {};

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  const values = {};

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;
    const separator = trimmed.indexOf("=");
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    values[key] = value;
  });

  return values;
}

const envPlanner = readDotEnvPlanner();
const TENANT_ID = process.env.PLANNER_TENANT_ID || envPlanner.PLANNER_TENANT_ID || "5bf66ace-03e6-4678-bb05-bd55ec310f0c";
const PLAN_ID = process.env.PLANNER_PLAN_ID || envPlanner.PLANNER_PLAN_ID || "4bj84BvXxU2W_YtJAIu6z2UAHPNx";

let plannerAuthBlockedUntil = 0;
let plannerPromptLoggedAt = 0;

const credential = new DeviceCodeCredential({
  tenantId: TENANT_ID,
  clientId: "04b07795-8ddb-461a-bbee-02f9e1bf7b46",
  userPromptCallback: (info) => {
    const now = Date.now();
    if (now - plannerPromptLoggedAt < PLANNER_PROMPT_LOG_THROTTLE_MS) {
      return;
    }

    plannerPromptLoggedAt = now;
    console.log("\nAutenticacion requerida en Microsoft Graph:");
    console.log(info.message);
  },
});

const graphClient = Client.initWithMiddleware({
  authProvider: {
    getAccessToken: async () => {
      const token = await credential.getToken("https://graph.microsoft.com/.default");
      return token.token;
    },
  },
});

function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}-${month}-${year}`;
}

function scopeFromTask(task, categoryDescriptions) {
  const taskCode = extractTaskCode(`${task.title || ""} ${task.id || ""}`);
  if (taskCode.startsWith("CONJUNTA-")) return "Conjunta";
  if (taskCode.startsWith("ENTEL-")) return "Entel";
  if (taskCode.startsWith("INTELLICORE-")) return "Intellicore";
  if (taskCode.startsWith("SPLUNK-")) return "Splunk";
  if (taskCode.startsWith("GESTION-")) return "Gestion";

  const applied = task.appliedCategories || {};
  const activeCategories = Object.entries(applied)
    .filter(([, enabled]) => enabled)
    .map(([key]) => (categoryDescriptions && categoryDescriptions[key]) || "")
    .filter(Boolean);

  const haystack = normalizeIdentifier([task.title || "", ...activeCategories, task.id || ""].join(" "));
  if (haystack.includes("INTELLICORE")) return "Intellicore";
  if (haystack.includes("SPLUNK") || haystack.includes("DPLINK")) return "Splunk";
  if (haystack.includes("CONJUNTA") || haystack.includes("CONJUNTO")) return "Conjunta";
  return "Entel";
}

function normalizeIdentifier(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function extractTaskCode(value) {
  return normalizeIdentifier(value).match(/\b[A-Z]+-\d+\b/)?.[0] || "";
}

function scopeKeyFromLabel(scope) {
  if (scope === "Intellicore") return "intellicore";
  if (scope === "Gestion") return "gestion";
  if (scope === "Splunk") return "splunk";
  if (scope === "Conjunta") return "conjunta";
  return "entel";
}

function scopeFromTaskId(taskId) {
  const text = normalizeIdentifier(taskId);
  if (text.startsWith("INT")) return "Intellicore";
  if (text.startsWith("GESTION")) return "Gestion";
  if (text.startsWith("SPL")) return "Splunk";
  if (text.startsWith("CON")) return "Conjunta";
  return "Entel";
}

function priorityFromTask(task) {
  const value = Number(task.priority);
  if (value >= 7) return "Urgent";
  if (value >= 5) return "Important";
  return "Medium";
}

function statusFromBucket(bucketName, task) {
  if (task.percentComplete === 100 || task.completedDateTime) return "Completa";
  const bucket = String(bucketName || "").toLowerCase();
  if (bucket.includes("revision") || bucket.includes("revisi")) return "Revision";
  if (bucket.includes("pendiente")) return "No iniciado";
  return "En curso";
}

async function fetchJson(apiPath) {
  return graphClient.api(apiPath).get();
}

async function resolveOwnerMap(tasks) {
  const userIds = new Set();
  tasks.forEach((task) => {
    const assignmentIds = Object.keys(task.assignments || {});
    assignmentIds.forEach((id) => userIds.add(id));
  });

  const map = {};
  await Promise.all(
    Array.from(userIds).map(async (userId) => {
      try {
        const user = await fetchJson(`/users/${userId}?$select=displayName`);
        map[userId] = user.displayName || userId;
      } catch {
        map[userId] = userId;
      }
    })
  );

  return map;
}

function ownerFromTask(task, ownerMap) {
  const assignmentIds = Object.keys(task.assignments || {});
  if (!assignmentIds.length) return "Sin asignar";
  return ownerMap[assignmentIds[0]] || assignmentIds[0];
}

function findTaskDependencies(allTasks) {
  // Extraer IDs de tareas (formato: SCOPE-###)
  const taskMap = new Map();
  allTasks.forEach((task) => {
    const id = extractTaskCode(task.title);
    if (id) taskMap.set(id, task);
  });

  const dependencies = {};
  
  // Buscar dependencias en el título y descripción
  allTasks.forEach((task) => {
    const taskId = extractTaskCode(task.title);
    if (!taskId) return;
    
    const text = normalizeIdentifier(`${task.title || ""} ${task.description || ""}`);
    const foundIds = text.match(/\b[A-Z]+-\d+\b/g) || [];
    
    const deps = foundIds
      .filter((id) => id !== taskId && taskMap.has(id))
      .filter((v, i, a) => a.indexOf(v) === i);
    
    if (deps.length > 0) {
      dependencies[taskId] = deps;
    }
  });
  
  return dependencies;
}

async function buildRoadmapFromPlanner() {
  const [bucketResult, planDetails] = await Promise.all([
    fetchJson(`/planner/plans/${PLAN_ID}/buckets`),
    fetchJson(`/planner/plans/${PLAN_ID}/details`),
  ]);

  const buckets = (bucketResult.value || []).sort((a, b) => a.orderHint.localeCompare(b.orderHint));
  const bucketTasks = await Promise.all(
    buckets.map(async (bucket) => {
      const data = await fetchJson(`/planner/buckets/${bucket.id}/tasks`);
      return { bucket, tasks: data.value || [] };
    })
  );

  const allPlannerTasks = bucketTasks.flatMap((item) => item.tasks);
  const ownerMap = await resolveOwnerMap(allPlannerTasks);
  const categoryDescriptions = planDetails?.categoryDescriptions || {};

  const lanes = [
    { key: "entel", lane: "ENTEL", kicker: "Planner", title: "Roadmap Entel", tasks: [] },
    { key: "intellicore", lane: "INTELLICORE", kicker: "Planner", title: "Roadmap Intellicore", tasks: [] },
    { key: "gestion", lane: "GESTION", kicker: "Planner", title: "Roadmap Gestion", tasks: [] },
    { key: "splunk", lane: "SPLUNK", kicker: "Planner", title: "Roadmap Splunk", tasks: [] },
    { key: "conjunta", lane: "CONJUNTA", kicker: "Planner", title: "Roadmap Conjunta", tasks: [] },
  ];

  bucketTasks.forEach(({ bucket, tasks }) => {
    tasks.forEach((task) => {
      const scope = scopeFromTask(task, categoryDescriptions);
      const laneKey = scopeKeyFromLabel(scope);
      const lane = lanes.find((item) => item.key === laneKey);
      if (!lane) return;

      lane.tasks.push({
        id: extractTaskCode(task.title) || task.id,
        title: task.title || "Sin titulo",
        owner: ownerFromTask(task, ownerMap),
        start: formatDate(task.startDateTime || task.createdDateTime),
        pending: formatDate(task.dueDateTime),
        deposit: bucket.name || "Curso",
        status: statusFromBucket(bucket.name, task),
        priority: priorityFromTask(task),
        scope,
        completed: task.percentComplete === 100 || Boolean(task.completedDateTime),
      });
    });
  });

  lanes.forEach((lane) => {
    lane.tasks.sort((a, b) => {
      if (a.completed === b.completed) return a.id.localeCompare(b.id);
      return a.completed ? 1 : -1;
    });
  });

  // Calcular dependencias basadas en todos los títulos
  const allTasks = [];
  lanes.forEach((lane) => {
    lane.tasks.forEach((task) => {
      allTasks.push(task);
    });
  });
  
  const dependencies = findTaskDependencies(
    allTasks.map((t) => ({
      title: `${t.id} ${t.title}`,
      description: "",
    }))
  );

  return { lanes, dependencies };
}

function withTimeout(promise, timeoutMs, createError) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(createError()), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

let refreshPromise = null;

async function refreshRoadmapCache() {
  if (!refreshPromise) {
    refreshPromise = buildRoadmapFromPlanner()
      .then(({ lanes, dependencies }) => {
        plannerAuthBlockedUntil = 0;
        const fetchedAt = Date.now();
        cache = {
          fetchedAt,
          roadmap: lanes,
          dependencies,
        };

        return { lanes, dependencies, fetchedAt };
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

let cache = {
  fetchedAt: 0,
  roadmap: null,
  dependencies: {},
};

app.get("/api/planner/roadmap", async (_req, res) => {
  try {
    const now = Date.now();

    if (plannerAuthBlockedUntil > now) {
      const secondsLeft = Math.ceil((plannerAuthBlockedUntil - now) / 1000);
      const message = `Planner requiere autenticacion en Microsoft Graph. Reintenta en ${secondsLeft}s o completa el codigo de dispositivo en la consola.`;

      if (cache.roadmap) {
        res.json({
          roadmap: cache.roadmap,
          dependencies: cache.dependencies,
          fetchedAt: new Date(cache.fetchedAt).toISOString(),
          cached: true,
          stale: true,
          syncWarning: message,
        });
        return;
      }

      res.status(503).json({
        error: "planner_auth_required",
        message,
      });
      return;
    }

    if (cache.roadmap && now - cache.fetchedAt < 15000) {
      res.json({ roadmap: cache.roadmap, dependencies: cache.dependencies, fetchedAt: new Date(cache.fetchedAt).toISOString(), cached: true });
      return;
    }

    const { lanes, dependencies, fetchedAt } = await withTimeout(
      refreshRoadmapCache(),
      PLANNER_SYNC_TIMEOUT_MS,
      () => {
        plannerAuthBlockedUntil = Date.now() + PLANNER_AUTH_COOLDOWN_MS;
        const error = new Error("Planner requiere autenticacion en Microsoft Graph. Revisa la consola del servidor y completa el codigo de dispositivo.");
        error.code = "planner_auth_required";
        error.status = 503;
        return error;
      }
    );

    res.json({ roadmap: lanes, dependencies, fetchedAt: new Date(fetchedAt).toISOString(), cached: false });
  } catch (error) {
    if (error.code === "planner_auth_required" && cache.roadmap) {
      res.json({
        roadmap: cache.roadmap,
        dependencies: cache.dependencies,
        fetchedAt: new Date(cache.fetchedAt).toISOString(),
        cached: true,
        stale: true,
        syncWarning: error.message,
      });
      return;
    }

    res.status(error.status || 500).json({
      error: error.code || "planner_sync_failed",
      message: error.message,
    });
  }
});

app.get("/api/planner/dependencies", (_req, res) => {
  // Agrupar dependencias por scope de origen
  const depsByScope = {
    Entel: [],
    Intellicore: [],
    Gestion: [],
    Splunk: [],
    Conjunta: [],
  };

  Object.entries(cache.dependencies || {}).forEach(([taskId, deps]) => {
    const taskScope = scopeFromTaskId(taskId);
    if (depsByScope[taskScope]) {
      depsByScope[taskScope].push({ task: taskId, dependsOn: deps });
    }
  });

  res.json({
    dependencies: cache.dependencies || {},
    byScope: depsByScope,
    summary: {
      total: Object.keys(cache.dependencies || {}).length,
      intellicoreDependsOnEntel: (depsByScope.Intellicore || []).filter((d) => d.dependsOn.some((t) => t.startsWith("ENT"))).length,
    },
  });
});

app.use(express.static(process.cwd()));

app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
  console.log("Abre esa URL para ver el dashboard con sincronizacion de Planner.");
});
