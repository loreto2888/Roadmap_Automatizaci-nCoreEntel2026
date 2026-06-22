const fs = require("fs");
const path = require("path");

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

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

function normalizeIdentifier(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function extractTaskCode(value) {
  return normalizeIdentifier(value).match(/\b[A-Z]+-\d+\b/)?.[0] || "";
}

function scopeFromTask(task, categoryDescriptions) {
  const applied = task.appliedCategories || {};
  const activeCategories = Object.entries(applied)
    .filter(([, enabled]) => enabled)
    .map(([key]) => (categoryDescriptions && categoryDescriptions[key]) || "")
    .filter(Boolean);

  const haystack = normalizeIdentifier([task.title || "", ...activeCategories, task.id || ""].join(" "));
  if (extractTaskCode(task.title || task.id).startsWith("GESTION-")) return "Gestion";
  if (haystack.includes("INTELLICORE")) return "Intellicore";
  if (haystack.includes("SPLUNK") || haystack.includes("DPLINK")) return "Splunk";
  if (haystack.includes("CONJUNTA") || haystack.includes("CONJUNTO")) return "Conjunta";
  return "Entel";
}

function scopeKeyFromLabel(scope) {
  if (scope === "Intellicore") return "intellicore";
  if (scope === "Gestion") return "gestion";
  if (scope === "Splunk") return "splunk";
  if (scope === "Conjunta") return "conjunta";
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

function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}-${month}-${year}`;
}

async function resolveOwnerMap(tasks, token) {
  const userIds = new Set();
  tasks.forEach((task) => Object.keys(task.assignments || {}).forEach((id) => userIds.add(id)));

  const map = {};
  await Promise.all(
    Array.from(userIds).map(async (userId) => {
      try {
        const user = await graphRequest(`${GRAPH_BASE_URL}/users/${userId}?$select=displayName`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        map[userId] = user.displayName || userId;
      } catch {
        map[userId] = userId;
      }
    })
  );

  return map;
}

async function main() {
  const tenantId = required("MS_TENANT_ID");
  const clientId = required("MS_CLIENT_ID");
  const clientSecret = required("MS_CLIENT_SECRET");
  const planId = required("PLANNER_PLAN_ID");

  const token = await getAccessToken(tenantId, clientId, clientSecret);

  const [bucketResult, planDetails] = await Promise.all([
    graphRequest(`${GRAPH_BASE_URL}/planner/plans/${planId}/buckets`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    graphRequest(`${GRAPH_BASE_URL}/planner/plans/${planId}/details`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  ]);

  const buckets = (bucketResult.value || []).sort((a, b) => a.orderHint.localeCompare(b.orderHint));
  const bucketTasks = await Promise.all(
    buckets.map(async (bucket) => {
      const data = await graphRequest(`${GRAPH_BASE_URL}/planner/buckets/${bucket.id}/tasks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { bucket, tasks: data.value || [] };
    })
  );

  const allPlannerTasks = bucketTasks.flatMap((item) => item.tasks);
  const ownerMap = await resolveOwnerMap(allPlannerTasks, token);
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