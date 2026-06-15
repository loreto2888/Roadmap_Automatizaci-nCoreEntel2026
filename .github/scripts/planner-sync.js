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
    throw new Error(
      `Graph request failed (${response.status}): ${text || "<empty body>"}`
    );
  }

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
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
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Token request failed: ${JSON.stringify(data)}`);
  }

  if (!data.access_token) {
    throw new Error("Token response does not contain access_token");
  }

  return data.access_token;
}

function getGithubContext() {
  const raw = process.env.GITHUB_CONTEXT;
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function findTaskByPrefix(token, bucketId, prefix) {
  const url = `${GRAPH_BASE_URL}/planner/buckets/${bucketId}/tasks`;
  const data = await graphRequest(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const task = (data.value || []).find((item) =>
    typeof item.title === "string" && item.title.startsWith(prefix)
  );

  return task || null;
}

async function updateTask(token, taskId, title) {
  const taskUrl = `${GRAPH_BASE_URL}/planner/tasks/${taskId}`;
  const task = await graphRequest(taskUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const etag = task["@odata.etag"];
  if (!etag) {
    throw new Error(`Missing etag for task ${taskId}`);
  }

  await graphRequest(taskUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "If-Match": etag,
    },
    body: JSON.stringify({
      title,
    }),
  });
}

async function createTask(token, planId, bucketId, title) {
  const url = `${GRAPH_BASE_URL}/planner/tasks`;
  const payload = {
    planId,
    bucketId,
    title,
  };

  const created = await graphRequest(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return created;
}

async function updateTaskDetails(token, taskId, description) {
  const detailsUrl = `${GRAPH_BASE_URL}/planner/tasks/${taskId}/details`;
  const details = await graphRequest(detailsUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const etag = details["@odata.etag"];
  if (!etag) {
    throw new Error(`Missing details etag for task ${taskId}`);
  }

  await graphRequest(detailsUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "If-Match": etag,
    },
    body: JSON.stringify({
      description,
    }),
  });
}

async function main() {
  const tenantId = required("MS_TENANT_ID");
  const clientId = required("MS_CLIENT_ID");
  const clientSecret = required("MS_CLIENT_SECRET");
  const planId = required("PLANNER_PLAN_ID");
  const bucketId = required("PLANNER_BUCKET_ID");

  const github = getGithubContext() || {};
  const repo = github.repository || process.env.GITHUB_REPOSITORY || "unknown-repo";
  const branch = (github.ref || process.env.GITHUB_REF || "refs/heads/unknown")
    .replace("refs/heads/", "");
  const sha = (github.sha || process.env.GITHUB_SHA || "").slice(0, 8);
  const actor = github.actor || process.env.GITHUB_ACTOR || "unknown-actor";
  const serverUrl = github.server_url || "https://github.com";
  const commitUrl = sha ? `${serverUrl}/${repo}/commit/${github.sha || process.env.GITHUB_SHA}` : "";

  const taskPrefix = `[Auto][${repo}][${branch}]`;
  const title = `${taskPrefix} ultimo push ${sha || "n/a"}`;

  const description = [
    `Repositorio: ${repo}`,
    `Branch: ${branch}`,
    `Commit: ${github.sha || process.env.GITHUB_SHA || "n/a"}`,
    `Actor: ${actor}`,
    `Commit URL: ${commitUrl || "n/a"}`,
    `Actualizado: ${new Date().toISOString()}`,
  ].join("\n");

  const token = await getAccessToken(tenantId, clientId, clientSecret);
  const existing = await findTaskByPrefix(token, bucketId, taskPrefix);

  if (existing) {
    await updateTask(token, existing.id, title);
    await updateTaskDetails(token, existing.id, description);
    console.log(`Updated Planner task: ${existing.id}`);
  } else {
    const created = await createTask(token, planId, bucketId, title);
    await updateTaskDetails(token, created.id, description);
    console.log(`Created Planner task: ${created.id}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
