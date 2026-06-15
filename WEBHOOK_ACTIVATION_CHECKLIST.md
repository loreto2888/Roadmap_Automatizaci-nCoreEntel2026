# Checklist Final: GitHub + Teams Planner (Power Automate)

## Estado actual
✅ GitHub Actions Workflow creado: `.github/workflows/planner-sync-webhook.yml`
✅ Guía Power Automate: `POWER_AUTOMATE_SETUP.md`
⏳ Falta: Crear flujo en Power Automate y cargar webhook en GitHub

## Próximos 10 minutos - Paso a paso

### PASO 1: Crear flujo en Power Automate (5 min)

1. Abre https://make.powerautomate.com
2. Inicia sesión con tu cuenta corporativa (Entel)
3. **Create** → **Cloud flow** → **Instant cloud flow**
4. Trigger: **When an HTTP request is received** → **Create**

En la parte **Request Body JSON Schema**, pega esto:
```json
{
  "type": "object",
  "properties": {
    "repository": { "type": "string" },
    "branch": { "type": "string" },
    "sha": { "type": "string" },
    "actor": { "type": "string" },
    "commit_url": { "type": "string" }
  }
}
```

Clic **Save**.

### PASO 2: Agrega pasos al flujo (3 min)

Copia exactamente de `POWER_AUTOMATE_SETUP.md`:
- Step 3: List tasks in bucket (filtra por nombre de repo)
- Step 4: Filter array
- Step 5: Condition (¿existe tarea?)
- Step 6A: Update (si existe)
- Step 6B: Create (si no existe)

(Instrucciones detalladas en POWER_AUTOMATE_SETUP.md)

### PASO 3: Copia la webhook URL (1 min)

En Power Automate, abre el trigger **When an HTTP request is received**.

Copia la URL bajo **HTTP POST URL**.

Ejemplo:
```
https://prod-XX.westeurope.logic.azure.com:443/workflows/xxxxxx/triggers/xxx/run?api-version=2016-06-01&sp=...
```

### PASO 4: Carga el secret en GitHub (1 min)

1. Abre tu repo en GitHub
2. **Settings** → **Secrets and variables** → **Actions**
3. **New repository secret**
4. Name: `POWER_AUTOMATE_WEBHOOK_URL`
5. Value: (pega la URL copiada)
6. **Add secret**

### PASO 5: Dispara el flujo (0.5 min)

En terminal o VS Code:
```bash
git commit --allow-empty -m "trigger planner webhook"
git push
```

### PASO 6: Verifica que funcionó (0.5 min)

1. GitHub: **Actions** → Busca **Sync Push To Planner (Webhook)**
2. Debe estar **green/success**
3. Planner: Abre tu Teams → Busca la tarea creada/actualizada

---

## Si algo falla

### El workflow dice "Missing POWER_AUTOMATE_WEBHOOK_URL"
→ El secret no fue cargado en GitHub. Repite PASO 4.

### El webhook recibe error 400/401
→ El JSON de Power Automate está mal formado. Verifica que copiaste exactamente la guía.

### La tarea no se crea en Planner
→ Revisa en Power Automate si el flujo está activado (verde en la esquina)
→ Abre los detalles del último run y busca errores de conexión Planner

---

## Archivos criados en tu repo
- `.github/workflows/planner-sync-webhook.yml` → Llama el webhook
- `POWER_AUTOMATE_SETUP.md` → Guía paso a paso del flujo
- `PLANNER_GITHUB_SETUP.md` → Guía antigua (opcional, no usar)
- `.github/workflows/planner-sync.yml` → Antigua (optional, puedes borrar)

---

Cuando termines, pégame aquí un "listo" y verifico el status final del flujo.
