# Power Automate: Teams Planner -> GitHub Pages

Este flujo hace que la pagina se actualice sola cuando cambia una tarea en Teams/Planner.

Ruta activa:

1. Cambias una tarea en Teams/Planner.
2. Power Automate detecta el cambio.
3. Power Automate llama a GitHub con `repository_dispatch`.
4. GitHub Actions ejecuta `.github/workflows/static.yml`.
5. El workflow lee Planner, regenera `planner-roadmap.json`, lo sube a `main` y publica GitHub Pages.

Ademas del disparo inmediato por Power Automate, GitHub Actions revisa Planner todos los dias a las 11:00 UTC. Esa revision diaria publica cualquier cambio que haya quedado pendiente.

## 1. Preparar GitHub

### Crear token para Power Automate

1. En GitHub, abre `Settings -> Developer settings -> Personal access tokens -> Fine-grained tokens`.
2. Crea un token para este repositorio.
3. Permisos minimos:
   - `Metadata`: Read-only
   - `Contents`: Read and write
4. Copia el token. Power Automate lo usara en el header `Authorization`.

### Confirmar secrets del workflow

En el repo, entra a `Settings -> Secrets and variables -> Actions` y confirma estos secrets:

- `MS_TENANT_ID`
- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `PLANNER_PLAN_ID`

Sin estos secrets, GitHub no podra leer Planner para regenerar el snapshot.

## 2. Crear el flujo en Power Automate

1. Abre https://make.powerautomate.com.
2. Crea un `Automated cloud flow`.
3. Usa un trigger de Planner/Tasks para el plan del roadmap.
   - Si aparece `When a task is created or modified`, usa ese.
   - Si tu tenant solo ofrece triggers separados, crea flujos para `created`, `completed` o el evento disponible que cubra tu operacion.
   - Si no existe trigger de modificacion en tu conector, usa un flujo `Recurrence` cada 5 minutos como respaldo.

## 3. Agregar accion HTTP hacia GitHub

Agrega una accion `HTTP` despues del trigger.

Configura:

- Method: `POST`
- URI: `https://api.github.com/repos/loreto2888/Roadmap_Automatizaci-nCoreEntel2026/dispatches`
- Headers:

```text
Accept: application/vnd.github+json
Authorization: Bearer TU_TOKEN_DE_GITHUB
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json
```

- Body:

```json
{
  "event_type": "planner_changed",
  "client_payload": {
    "source": "power_automate",
    "taskId": "@{triggerOutputs()?['body/id']}",
    "changedAt": "@{utcNow()}"
  }
}
```

El valor importante es `event_type: planner_changed`; ese nombre coincide con el disparador configurado en `.github/workflows/static.yml`.

## 4. Probar

1. Guarda y activa el flujo.
2. Cambia una tarea del roadmap en Teams/Planner.
3. Revisa Power Automate: el run debe quedar exitoso.
4. Revisa GitHub: `Actions -> Deploy static content to Pages` debe iniciar solo.
5. Al terminar, valida:
   - `planner-roadmap.json` queda actualizado en `main`.
   - La rama `gh-pages` queda publicada.
   - La pagina publica refleja el cambio al refrescar.

## 5. Prueba manual desde terminal

Para probar GitHub sin tocar Planner, ejecuta este `curl` reemplazando el token:

```bash
curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer TU_TOKEN_DE_GITHUB" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/loreto2888/Roadmap_Automatizaci-nCoreEntel2026/dispatches \
  -d '{"event_type":"planner_changed","client_payload":{"source":"manual-test"}}'
```

GitHub responde `204 No Content` cuando acepta el evento.

## Troubleshooting

- `401 Bad credentials`: el token es invalido o fue copiado incompleto.
- `403 Resource not accessible`: faltan permisos `Contents: Read and write` o el token no tiene acceso a este repo.
- `404 Not Found`: el owner/repo del URI no coincide o el token no puede ver el repo.
- El workflow inicia pero falla leyendo Planner: revisa los secrets `MS_*` y permisos Graph de la app.
- El workflow termina bien pero la pagina no cambia: espera a que GitHub Pages publique `gh-pages` y refresca con cache limpia.

