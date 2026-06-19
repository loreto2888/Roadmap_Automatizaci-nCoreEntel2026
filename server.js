const fs = require("fs");
const path = require("path");
const express = require("express");
const { DeviceCodeCredential } = require("@azure/identity");
const { Client } = require("@microsoft/microsoft-graph-client");

const app = express();
const PORT = process.env.PORT || 3000;

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

const credential = new DeviceCodeCredential({
  tenantId: TENANT_ID,
  clientId: "04b07795-8ddb-461a-bbee-02f9e1bf7b46",
  userPromptCallback: (info) => {
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
  const applied = task.appliedCategories || {};
  const activeCategories = Object.entries(applied)
    .filter(([, enabled]) => enabled)
    .map(([key]) => (categoryDescriptions && categoryDescriptions[key]) || "")
    .filter(Boolean);

  const haystack = [task.title || "", ...activeCategories, task.id || ""].join(" ").toLowerCase();
  if (haystack.includes("intellicore")) return "Intellicore";
  if (haystack.includes("splunk") || haystack.includes("dplink")) return "Splunk";
  if (haystack.includes("conjunta") || haystack.includes("conjunto")) return "Conjunta";
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
    const id = task.title?.match(/\b[A-Z]+-\d+\b/)?.[0];
    if (id) taskMap.set(id, task);
  });

  const dependencies = {};
  
  // Buscar dependencias en el título y descripción
  allTasks.forEach((task) => {
    const taskId = task.title?.match(/\b[A-Z]+-\d+\b/)?.[0];
    if (!taskId) return;
    
    const text = `${task.title || ""} ${task.description || ""}`.toUpperCase();
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
    { key: "splunk", lane: "SPLUNK", kicker: "Planner", title: "Roadmap Splunk", tasks: [] },
    { key: "conjunta", lane: "CONJUNTA", kicker: "Planner", title: "Roadmap Conjunta", tasks: [] },
  ];

  bucketTasks.forEach(({ bucket, tasks }) => {
    tasks.forEach((task) => {
      const scope = scopeFromTask(task, categoryDescriptions);
      const laneKey = scope === "Intellicore" ? "intellicore" : scope === "Splunk" ? "splunk" : scope === "Conjunta" ? "conjunta" : "entel";
      const lane = lanes.find((item) => item.key === laneKey);
      if (!lane) return;

      lane.tasks.push({
        id: task.title?.match(/\b[A-Z]+-\d+\b/)?.[0] || task.id,
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

let cache = {
  fetchedAt: 0,
  roadmap: null,
  dependencies: {},
};

app.get("/api/planner/roadmap", async (_req, res) => {
  try {
    const now = Date.now();
    if (cache.roadmap && now - cache.fetchedAt < 15000) {
      res.json({ roadmap: cache.roadmap, dependencies: cache.dependencies, fetchedAt: new Date(cache.fetchedAt).toISOString(), cached: true });
      return;
    }

    const { lanes, dependencies } = await buildRoadmapFromPlanner();
    cache = {
      fetchedAt: now,
      roadmap: lanes,
      dependencies,
    };

    res.json({ roadmap: lanes, dependencies, fetchedAt: new Date(now).toISOString(), cached: false });
  } catch (error) {
    res.status(500).json({
      error: "planner_sync_failed",
      message: error.message,
    });
  }
});

app.get("/api/planner/dependencies", (_req, res) => {
  // Agrupar dependencias por scope de origen
  const depsByScope = {
    Entel: [],
    Intellicore: [],
    Splunk: [],
    Conjunta: [],
  };

  Object.entries(cache.dependencies || {}).forEach(([taskId, deps]) => {
    const taskScope = taskId.startsWith("INT") ? "Intellicore" : taskId.startsWith("SPL") ? "Splunk" : taskId.startsWith("CON") ? "Conjunta" : "Entel";
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
