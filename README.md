# Roadmap Automatizacion Core Entel 2026

Dashboard y Carta Gantt del roadmap de Automatizacion Core, sincronizados con Microsoft Teams Planner mediante Microsoft Graph y publicados en GitHub Pages.

## Enlaces

Version publica para compartir con el equipo:

- Dashboard: https://loreto2888.github.io/Roadmap_Automatizaci-nCoreEntel2026/
- Carta Gantt: https://loreto2888.github.io/Roadmap_Automatizaci-nCoreEntel2026/gantt.html

Version local para revisar cambios antes de publicar:

- Dashboard: http://localhost:3000/
- Carta Gantt: http://localhost:3000/gantt.html

## Ejecutar localmente

Instala dependencias una vez:

```bash
npm install
```

Inicia el servidor local:

```bash
npm start
```

El servidor publica los archivos estaticos y expone la API viva de Planner en:

```text
GET /api/planner/roadmap
```

Si Microsoft Graph pide autenticacion, la consola mostrara un codigo de dispositivo. Completa el login en:

```text
https://login.microsoft.com/device
```

## Sincronizacion con Teams Planner

- Planner/Teams es la fuente principal de las tareas.
- En local, el dashboard intenta leer primero `/api/planner/roadmap` para reflejar cambios vivos de Planner.
- Si la API viva no responde o falta autenticacion, la UI usa `planner-roadmap.json` como respaldo.
- En GitHub Pages no existe servidor Node, por eso la web publica usa el snapshot `planner-roadmap.json`.
- El snapshot se regenera con `.github/scripts/export-planner-roadmap.js`, leyendo Planner desde Microsoft Graph.
- El workflow `.github/workflows/static.yml` instala dependencias con `npm ci`, consulta Planner, valida el JSON y publica la version actualizada en GitHub Pages.
- Si la consulta a Planner falla, el workflow publica el ultimo `planner-roadmap.json` confirmado para no dejar la pagina sin desplegar.

## Actualizacion automatica diaria

GitHub Actions revisa Planner todos los dias a las 11:00 UTC:

```yaml
schedule:
	- cron: "0 11 * * *"
```

Flujo automatico:

1. GitHub Actions despierta por horario.
2. Instala dependencias con `npm ci`.
3. Ejecuta `node .github/scripts/export-planner-roadmap.js`.
4. El script entra a Microsoft Graph con los secrets del repositorio.
5. Lee buckets, tareas, responsables y estados desde Planner/Teams.
6. Regenera `planner-roadmap.json`.
7. Publica `index.html`, `gantt.html`, CSS, JS y `planner-roadmap.json` en la rama `gh-pages`.

Tambien se puede actualizar antes del horario diario:

- Con un push a `main`.
- Manualmente desde GitHub Actions con `workflow_dispatch`.
- Desde Power Automate enviando el evento `repository_dispatch` tipo `planner_changed` cuando cambie una tarea en Teams/Planner.

La guia de Power Automate esta en `POWER_AUTOMATE_SETUP.md`.

## Conteos por frente

Los frentes se agrupan por el prefijo real del ID de la tarea:

- `ENTEL-`
- `INTELLICORE-`
- `CONJUNTA-`
- `SPLUNK-`
- `GESTION-`

El dashboard muestra por frente:

- Sin hacer
- Listo
- Cantidad total
- Porcentaje de completitud

## Carta Gantt

- La Carta Gantt muestra tareas bajo semanas calendario alineadas con sus fechas de inicio y fin.
- El encabezado semanal usa semanas de lunes a viernes para lectura visual.
- Las barras se calculan con semanas reales de 7 dias para mantener la posicion correcta bajo cada semana.
- La vista permite descargar un Excel con hojas de Roadmap, Resumen y Gantt.

## Despliegue en GitHub Pages

Cada push a `main`, ejecucion manual, evento externo `planner_changed` o revision diaria programada ejecuta `.github/workflows/static.yml` y publica la web en GitHub Pages.

Secrets recomendados para regenerar el snapshot desde Planner:

- `MS_TENANT_ID`
- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `PLANNER_PLAN_ID`

Si alguno falta o falla, el workflow no podra regenerar el snapshot desde Planner y usara el ultimo `planner-roadmap.json` confirmado.

Para actualizar la pagina automaticamente desde Teams/Planner, configura Power Automate siguiendo `POWER_AUTOMATE_SETUP.md`.

## Verificar la sincronizacion

1. Abre GitHub Actions en el repositorio.
2. Entra al workflow `Deploy static content to Pages`.
3. Confirma que el paso `Export Planner roadmap snapshot` este en `success`.
4. Confirma que el paso `Publish static site to gh-pages` este en `success`.
5. Revisa el snapshot publicado:

```text
https://loreto2888.github.io/Roadmap_Automatizaci-nCoreEntel2026/planner-roadmap.json
```

Si el paso `Export Planner roadmap snapshot` falla, revisa los secrets `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` y `PLANNER_PLAN_ID`, ademas de los permisos Graph de la aplicacion Microsoft Entra.

## Validaciones rapidas

```bash
node --check script.js
node --check gantt.js
node --check server.js
node --check .github/scripts/export-planner-roadmap.js
```
