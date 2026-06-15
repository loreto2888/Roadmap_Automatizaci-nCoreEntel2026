# Importar Flujo Power Automate - Guía Rápida

## Archivo
Archivo JSON listo: `planner-webhook-flow.json`

## Pasos para importar

### 1. Abre Power Automate
- https://make.powerautomate.com

### 2. Clic en "My flows"
- Lado izquierdo, busca **Cloud flows**
- Clic en **My flows**

### 3. Importar flujo
- Clic en **Import** (arriba)
- Selecciona **Import** → **Upload** 
- Carga el archivo `planner-webhook-flow.json`

### 4. Configura conexiones
Power Automate pedirá que configures el conector de Planner:
- **Planner connection** → Selecciona tu conexión corporativa
- Si no hay, clic **Create new** y autentica

### 5. Mapea Plan ID y Bucket ID
El JSON tiene placeholders que necesitas reemplazar:

Busca en el JSON:
- `[PLANNER_PLAN_ID_HERE]` → Reemplaza con tu Plan ID real
- `[PLANNER_BUCKET_ID_HERE]` → Reemplaza con tu Bucket ID real

Si no sabes cómo sacar estos IDs, abre Tasks en Teams:
1. Teams → Apps → Tasks by Planner
2. Abre tu plan
3. Los IDs están en la URL o pídele a TI

### 6. Guarda el flujo
- Clic **Save**
- Espera a que complete (1-2 minutos)

### 7. Copia la URL del webhook
Una vez guardado:
1. Abre el flujo creado
2. Busca el trigger **When a HTTP request is received**
3. Copia la URL en **HTTP POST URL**

Ejemplo:
```
https://prod-XX.westeurope.logic.azure.com:443/workflows/xxxxx/triggers/xxx/run?api-version=2016-06-01&sp=%2Ftriggers%2F...
```

### 8. Carga el secret en GitHub
Ahora pégame aquí esa URL y yo:
1. La cargo en GitHub como secret `POWER_AUTOMATE_WEBHOOK_URL`
2. Disparamos un push de prueba
3. Validamos que la tarea se cree en Planner

---

## Si algo falla durante la importación

**Error: "Connection not found"**
- Power Automate necesita una conexión válida a Planner
- Clic **Create new connection** y autentica con tu cuenta corporativa

**Error: "Invalid JSON"**
- El archivo puede tener espacios o caracteres raros
- Descarga un editor JSON (VS Code) y valida antes

**Error: "Plan ID/Bucket ID inválido"**
- Verifica que copiaste los IDs correctamente
- Los IDs tienen formato UUID: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

---

Cuando termines de importar y tengas la URL, escribe aquí **"URL lista"** y yo cargo el secret en GitHub.
