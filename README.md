# Roadmap Automatizacion Core

Accesos rápidos al proyecto:

## Version pública
- Carta Gantt: https://loreto2888.github.io/Roadmap_Automatizaci-nCoreEntel2026/gantt.html
- Dashboard: https://loreto2888.github.io/Roadmap_Automatizaci-nCoreEntel2026/

## Version local
- Carta Gantt: gantt.html
- Dashboard: index.html

## Exportación
- La Carta Gantt permite descargar un archivo Excel con hojas separadas: Roadmap, Resumen y Gantt.

## Sincronización con Planner
- El dashboard y la carta Gantt consumen el roadmap desde la API local `/api/planner/roadmap` cuando el proyecto se ejecuta con `npm start`.
- Si la API no está disponible, la vista usa el respaldo guardado en `localStorage`.
- En GitHub Pages, el workflow de despliegue genera `planner-roadmap.json` y la UI lo usa como snapshot estático.

### Secrets requeridos para Pages
- `MS_TENANT_ID`
- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `PLANNER_PLAN_ID`
