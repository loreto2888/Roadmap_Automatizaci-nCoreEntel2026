#!/usr/bin/env node

/**
 * Script para obtener BUCKET IDs de Microsoft Planner
 * Uso: node get-planner-ids.js
 * 
 * Necesitas tener instalado: npm install @azure/identity @microsoft/microsoft-graph-client
 */

const { DeviceCodeCredential } = require("@azure/identity");
const { Client } = require("@microsoft/microsoft-graph-client");

const PLAN_ID = "4bj84BvXxU2W_YtJAIu6z2UAHPNx";
const TENANT_ID = "5bf66ace-03e6-4678-bb05-bd55ec310f0c";

async function getBucketIds() {
  try {
    console.log("🔐 Iniciando autenticación...\n");

    // Crear credencial con Device Code Flow (más simple para CLI)
    const credential = new DeviceCodeCredential({
      tenantId: TENANT_ID,
      clientId: "04b07795-8ddb-461a-bbee-02f9e1bf7b46", // Cliente CLI de Azure
    });

    // Crear cliente de Graph
    const client = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => {
          const token = await credential.getToken("https://graph.microsoft.com/.default");
          return token.token;
        },
      },
    });

    console.log("✅ Autenticado. Obteniendo buckets...\n");

    // Obtener buckets del plan
    const response = await client
      .api(`/planner/plans/${PLAN_ID}/buckets`)
      .get();

    console.log("📋 BUCKETS ENCONTRADOS:\n");
    console.log("┌─────────────────────────────────────────────┐");

    const buckets = response.value.sort((a, b) => a.name.localeCompare(b.name));

    buckets.forEach((bucket) => {
      console.log(`│ Nombre: ${bucket.name}`);
      console.log(`│ ID:     ${bucket.id}`);
      console.log(`├─────────────────────────────────────────────┤`);
    });

    console.log("└─────────────────────────────────────────────┘\n");

    // Generar JSON para copiar
    console.log("📝 COPIAR ESTO A TU .env o configuración:\n");
    console.log("PLANNER_PLAN_ID=" + PLAN_ID);
    buckets.forEach((bucket) => {
      const envKey = `PLANNER_BUCKET_${bucket.name.toUpperCase().replace(/\s+/g, "_")}`;
      console.log(`${envKey}=${bucket.id}`);
    });

    // Guardar en archivo
    const fs = require("fs");
    const configContent = `# Planner Configuration - Auto-generated
PLANNER_PLAN_ID=${PLAN_ID}
PLANNER_TENANT_ID=${TENANT_ID}

${buckets.map((b) => `PLANNER_BUCKET_${b.name.toUpperCase().replace(/\s+/g, "_")}=${b.id}`).join("\n")}
`;

    fs.writeFileSync(".env.planner", configContent);
    console.log("\n✅ Configuración guardada en '.env.planner'");
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

getBucketIds();
