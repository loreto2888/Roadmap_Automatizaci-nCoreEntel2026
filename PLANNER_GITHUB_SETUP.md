# Integracion Git Push -> Planner (Teams)

Este proyecto ya incluye:

- Workflow: `.github/workflows/planner-sync.yml`
- Script: `.github/scripts/planner-sync.js`

Cada `git push` ejecuta GitHub Actions y crea o actualiza una tarea en Planner.

## 1) Crear App Registration en Azure

1. Ve a `Azure Portal -> Microsoft Entra ID -> App registrations -> New registration`.
2. Copia estos valores:
   - `Directory (tenant) ID`
   - `Application (client) ID`
3. En `Certificates & secrets`, crea un `Client secret`.

## 2) Permisos Microsoft Graph

En la app, agrega permisos de Graph y da consentimiento de administrador:

- `Group.ReadWrite.All`
- `Tasks.ReadWrite.All`

Nota: Planner tiene restricciones segun tenant/politicas. Si no permite app-only, usa Power Automate como puente (ver seccion final).

## 3) Obtener IDs de Planner

Necesitas:

- `PLANNER_PLAN_ID`
- `PLANNER_BUCKET_ID`

Puedes obtenerlos desde Graph Explorer o script interno de tu organizacion.

## 4) Configurar secrets en GitHub

En tu repo: `Settings -> Secrets and variables -> Actions -> New repository secret`

Crea:

- `MS_TENANT_ID`
- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `PLANNER_PLAN_ID`
- `PLANNER_BUCKET_ID`

## 5) Probar

Haz push desde VS Code:

```bash
git add .
git commit -m "Prueba Planner sync"
git push
```

Luego revisa `Actions` en GitHub y valida la tarea en Planner.

## Como funciona el upsert

- Busca una tarea por prefijo: `[Auto][owner/repo][branch]`
- Si existe: actualiza titulo y descripcion con ultimo commit
- Si no existe: crea una tarea nueva

## Troubleshooting rapido

- `403/Unauthorized`:
  - Revisa permisos Graph y admin consent.
  - Verifica `tenant/client/secret`.
- `404 planId/bucketId`:
  - IDs incorrectos o plan fuera del alcance de permisos.
- Error por app-only en Planner:
  - Usa Power Automate con webhook HTTP y desde GitHub llama ese webhook.
