const fs = require("fs");
const path = require("path");
const { DeviceCodeCredential } = require("@azure/identity");
const { Client } = require("@microsoft/microsoft-graph-client");

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const AZURE_CLI_CLIENT_ID = "04b07795-8ddb-461a-bbee-02f9e1bf7b46";
const DEFAULT_TENANT_ID = "5bf66ace-03e6-4678-bb05-bd55ec310f0c";
const DEFAULT_PLAN_ID = "4bj84BvXxU2W_YtJAIu6z2UAHPNx";

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function graphRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Graph request failed (${response.status}): ${text || "<empty body>"}`);
  }

  return text ? JSON.parse(text) : null;
}

function readDotEnvPlanner() {
  const envPath = path.join(process.cwd(), ".env.planner");
  if (!fs.existsSync(envPath)) return {};

  return fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .reduce((values, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return values;
      const separator = trimmed.indexOf("=");
      values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
      return values;
    }, {});
}

async function getAccessToken(tenantId, clientId, clientSecret) {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(`Token request failed: ${JSON.stringify(data)}`);
  }

  return data.access_token;
}

function createDeviceGraphClient(tenantId) {
  const credential = new DeviceCodeCredential({
    tenantId,
    clientId: AZURE_CLI_CLIENT_ID,
    userPromptCallback: (info) => {
      console.log(info.message);
    },
  });
  let tokenPromise = null;

  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => {
        if (!tokenPromise) {
          tokenPromise = credential
            .getToken("https://graph.microsoft.com/.default")
            .finally(() => {
              tokenPromise = null;
            });
        }

        const token = await tokenPromise;
        return token.token;
      },
    },
  });
}

function createAppGraphClient(token) {
  return {
    api: (apiPath) => ({
      get: () =>
        graphRequest(`${GRAPH_BASE_URL}${apiPath}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
    }),
  };
}

async function fetchJson(graphClient, apiPath) {
  return graphClient.api(apiPath).get();
}

function normalizeIdentifier(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function extractTaskCode(value) {
  return normalizeIdentifier(value).match(/\b(?:ENTEL-INTELLICORE|[A-Z]+)-\d+\b/)?.[0] || "";
}

function scopeFromTask(task, categoryDescriptions, bucketName = "") {
  const taskCode = extractTaskCode(`${task.title || ""} ${task.id || ""}`);
  if (taskCode.startsWith("ENTEL-INTELLICORE-") || taskCode.startsWith("CONJUNTA-")) return "Entel_Intellicore";
  if (taskCode.startsWith("CONJUNTA-")) return "Entel_Intellicore";
  if (taskCode.startsWith("ENTEL-")) return "Entel";
  if (taskCode.startsWith("INTELLICORE-")) return "Intellicore";
  if (taskCode.startsWith("SPLUNK-")) return "Servicio Splunk";
  if (taskCode.startsWith("GESTION-")) return "Scrum";
  if (taskCode.startsWith("DESARROLLO-")) return "Desarrollo";

  const bucket = normalizeIdentifier(bucketName);
  if (bucket.includes("INTELLICORE")) return "Intellicore";
  if (bucket.includes("GESTION") || bucket.includes("SCRUM")) return "Scrum";
  if (bucket.includes("DESARROLLO")) return "Desarrollo";
  if (bucket.includes("CONJUNTA") || bucket.includes("ENTEL_INTELLICORE") || bucket.includes("ENTEL-INTELLICORE")) return "Entel_Intellicore";

  const applied = task.appliedCategories || {};
  const activeCategories = Object.entries(applied)
    .filter(([, enabled]) => enabled)
    .map(([key]) => (categoryDescriptions && categoryDescriptions[key]) || "")
    .filter(Boolean);

  const haystack = normalizeIdentifier([task.title || "", ...activeCategories, task.id || ""].join(" "));
  if (haystack.includes("CONJUNTA") || haystack.includes("CONJUNTO") || haystack.includes("ENTEL_INTELLICORE") || haystack.includes("ENTEL-INTELLICORE")) return "Entel_Intellicore";
  if (haystack.includes("INTELLICORE")) return "Intellicore";
  if (haystack.includes("DESARROLLO")) return "Desarrollo";
  return "Entel";
}

function scopeKeyFromLabel(scope) {
  const normalized = normalizeIdentifier(scope);
  if (normalized.includes("CONJUNTA") || normalized.includes("CONJUNTO") || normalized.includes("ENTEL_INTELLICORE") || normalized.includes("ENTEL-INTELLICORE")) return "conjunta";
  if (normalized.includes("INTELLICORE") && !normalized.includes("ENTEL")) return "intellicore";
  if (normalized.includes("DESARROLLO")) return "desarrollo";
  if (normalized.includes("SCRUM") || normalized.includes("GESTION")) return "gestion";
  if (normalized.includes("SPLUNK")) return "splunk";
  return "entel";
}

function ownerFromTask(task, ownerMap) {
  const assignmentIds = Object.keys(task.assignments || {});
  if (!assignmentIds.length) return "Sin asignar";
  return ownerMap[assignmentIds[0]] || assignmentIds[0];
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

function readRoadmapOverrides() {
  const overridesPath = path.join(process.cwd(), "roadmap-overrides.json");
  if (!fs.existsSync(overridesPath)) return { completedTaskIds: [] };

  const overrides = JSON.parse(fs.readFileSync(overridesPath, "utf8"));
  return {
    completedTaskIds: Array.isArray(overrides.completedTaskIds) ? overrides.completedTaskIds : [],
  };
}

function applyRoadmapOverrides(lanes) {
  const completedTaskIds = new Set(readRoadmapOverrides().completedTaskIds.map((id) => normalizeIdentifier(id)));
  if (!completedTaskIds.size) return;

  lanes.forEach((lane) => {
    lane.tasks.forEach((task) => {
      if (!completedTaskIds.has(normalizeIdentifier(task.id))) return;
      task.completed = true;
      task.status = "Completa";
      task.deposit = "Cierre";
    });
  });
}

function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}-${month}-${year}`;
}

async function resolveOwnerMap(tasks, graphClient) {
  const userIds = new Set();
  tasks.forEach((task) => Object.keys(task.assignments || {}).forEach((id) => userIds.add(id)));

  const map = {};
  await Promise.all(
    Array.from(userIds).map(async (userId) => {
      try {
        const user = await fetchJson(graphClient, `/users/${userId}?$select=displayName`);
        map[userId] = user.displayName || userId;
      } catch {
        map[userId] = userId;
      }
    })
  );

  return map;
}

async function main() {
  const envPlanner = readDotEnvPlanner();
  const authMode = process.env.PLANNER_AUTH_MODE || "app";
  const tenantId = process.env.MS_TENANT_ID || process.env.PLANNER_TENANT_ID || envPlanner.PLANNER_TENANT_ID || DEFAULT_TENANT_ID;
  const planId = process.env.PLANNER_PLAN_ID || envPlanner.PLANNER_PLAN_ID || DEFAULT_PLAN_ID;

  let graphClient;
  if (authMode === "device") {
    graphClient = createDeviceGraphClient(tenantId);
  } else {
    const clientId = required("MS_CLIENT_ID");
    const clientSecret = required("MS_CLIENT_SECRET");
    const token = await getAccessToken(tenantId, clientId, clientSecret);
    graphClient = createAppGraphClient(token);
  }

  const [bucketResult, planDetails] = await Promise.all([
    fetchJson(graphClient, `/planner/plans/${planId}/buckets`),
    fetchJson(graphClient, `/planner/plans/${planId}/details`),
  ]);

  const buckets = (bucketResult.value || []).sort((a, b) => a.orderHint.localeCompare(b.orderHint));
  const bucketTasks = await Promise.all(
    buckets.map(async (bucket) => {
      const data = await fetchJson(graphClient, `/planner/buckets/${bucket.id}/tasks`);
      return { bucket, tasks: data.value || [] };
    })
  );

  const allPlannerTasks = bucketTasks.flatMap((item) => item.tasks);
  const ownerMap = await resolveOwnerMap(allPlannerTasks, graphClient);
  const categoryDescriptions = planDetails?.categoryDescriptions || {};

  const lanes = [
    { key: "entel", lane: "ENTEL", kicker: "Planner", title: "Roadmap Entel", tasks: [] },
    { key: "intellicore", lane: "INTELLICORE", kicker: "Planner", title: "Desarrollos", tasks: [] },
    { key: "conjunta", lane: "ENTEL_INTELLICORE", kicker: "Planner", title: "Roadmap Entel_Intellicore", tasks: [] },
    { key: "splunk", lane: "SERVICIO SPLUNK", kicker: "Planner", title: "Roadmap Servicio Splunk", tasks: [] },
    { key: "desarrollo", lane: "DESARROLLO", kicker: "Planner", title: "Roadmap Desarrollo", tasks: [] },
    { key: "gestion", lane: "SCRUM", kicker: "Planner", title: "Roadmap Scrum", tasks: [] },
  ];

  bucketTasks.forEach(({ bucket, tasks }) => {
    tasks.forEach((task) => {
      const scope = scopeFromTask(task, categoryDescriptions, bucket.name);
      const lane = lanes.find((item) => item.key === scopeKeyFromLabel(scope));
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

  applyRoadmapOverrides(lanes);

  lanes.forEach((lane) => {
    lane.tasks.sort((a, b) => {
      if (a.completed === b.completed) return a.id.localeCompare(b.id);
      return a.completed ? 1 : -1;
    });
  });

  const outputPath = path.join(process.cwd(), "planner-roadmap.json");
  fs.writeFileSync(outputPath, JSON.stringify({ roadmap: lanes, generatedAt: new Date().toISOString() }, null, 2));
  console.log(`Planner roadmap snapshot written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});