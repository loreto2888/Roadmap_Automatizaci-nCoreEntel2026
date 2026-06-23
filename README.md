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
- La fuente de verdad del roadmap vive en Planner/Teams.
- El dashboard carga primero `planner-roadmap.json` como snapshot publicado para mantener estable la vista.
- La API local `/api/planner/roadmap` sigue disponible para lectura directa desde Planner cuando el servidor está activo.
- En GitHub Pages, el workflow de despliegue genera `planner-roadmap.json` desde Planner y la UI lo usa como base principal.
- Cualquier cambio hecho en Planner/Teams debe reflejarse en el siguiente snapshot o sincronización.

## Vista del dashboard
- La dona muestra el porcentaje de cierre global en el centro.
- El desglose por frente muestra realizadas, pendientes, total y el porcentaje final por cada frente.
- La leyenda y los colores del dashboard mantienen la asociación visual por frente.
- El layout es responsive para evitar desbordes laterales en pantallas medias y chicas.

### Secrets requeridos para Pages
- `MS_TENANT_ID`
- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `PLANNER_PLAN_ID`
