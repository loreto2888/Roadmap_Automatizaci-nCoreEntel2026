# Roadmap Automatizacion Core Entel 2026

Dashboard y Carta Gantt del roadmap de Automatizacion Core, sincronizados con Microsoft Teams Planner cuando la API local o el workflow de GitHub Pages tienen acceso a Microsoft Graph.

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
- En GitHub Pages no existe servidor Node, por eso la web publica usa el snapshot `planner-roadmap.json` generado por el workflow.
- El workflow de Pages no bloquea el despliegue si falla la exportacion de Planner; en ese caso publica usando el snapshot existente.

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

Cada push a `main` ejecuta `.github/workflows/static.yml` y publica la web en GitHub Pages.

Secrets recomendados para regenerar el snapshot desde Planner:

- `MS_TENANT_ID`
- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `PLANNER_PLAN_ID`

Si alguno falta o falla, Pages igual despliega la version estatica con el ultimo `planner-roadmap.json` disponible.

## Validaciones rapidas

```bash
node --check script.js
node --check gantt.js
node --check server.js
node --check .github/scripts/export-planner-roadmap.js
```
