# Setup Power Automate Webhook para GitHub → Planner

> Ruta heredada. La sincronizacion activa del proyecto parte del roadmap local y se ejecuta desde `.github/workflows/static.yml`.

Este flujo reemplaza completamente la dependencia de Entra ID y corre automáticamente cuando haces push desde GitHub.

## Flujo sin código - Paso a paso visual

### 1. Abre Power Automate
1. Ve a https://make.powerautomate.com
2. Inicia sesión con tu cuenta corporativa
3. Clic en **Create** (lado izquierdo)
4. Selecciona **Cloud flow** → **Instant cloud flow**
5. Elige trigger: **When an HTTP request is received**
6. Clic **Create**

### 2. Configura el trigger HTTP (parte 1 del flujo)

En el trigger **When an HTTP request is received**:

Copia este JSON en **Request Body JSON Schema**:

```json
{
  "type": "object",
  "properties": {
    "repository": {
      "type": "string"
    },
    "branch": {
      "type": "string"
    },
    "sha": {
      "type": "string"
    },
    "actor": {
      "type": "string"
    },
    "commit_url": {
      "type": "string"
    }
  }
}
```

Clic **Save** y **continúa abajo**.

### 3. Agrega acción: Obtener tareas del bucket (parte 2)

1. Clic **+ New step**
2. Busca: **List tasks in a bucket** (Planner)
3. Selecciona el conector.
4. Rellena:
   - **Group ID**: tu Teams Group ID (o selecciona del dropdown)
   - **Plan ID**: tu Planner Plan ID (o selecciona)
   - **Bucket ID**: tu Bucket ID (o selecciona)
5. Clic **Save** → continúa

### 4. Agrega acción: Filtrar tarea existente (parte 3)

1. Clic **+ New step**
2. Busca: **Filter array**
3. En el campo **From**: selecciona **value** (del step anterior)
4. Condition: **title** (primero) **contains** (segundo) (tercero) `@{triggerBody()?['repository']}` (pégalo entre comillas)
5. Clic **Save**

### 5. Agrega acción: Condition - ¿Existe la tarea? (parte 4)

1. Clic **+ New step**
2. Busca: **Condition**
3. En el campo izquierdo: selecciona **length** function
4. Dentro: `@{body('Filter_array')}`
5. Operador: **is greater than**
6. Valor: `0`
7. Clic **Save**

### 6A. Si EXISTE: Actualizar tarea (rama TRUE)

En la rama **True** (clic en **Add an action**):

1. Busca: **Update a task** (Planner)
2. Rellena:
   - **Plan ID**: tu Plan ID
   - **Task ID**: `@{first(body('Filter_array')).id}`
   - **Title**: `[Auto]@{triggerBody()?['repository']}[@{triggerBody()?['branch']}] ultimo push @{substring(triggerBody()?['sha'],0,8)}`
   - **Description**: 
     ```
     Repositorio: @{triggerBody()?['repository']}
     Branch: @{triggerBody()?['branch']}
     Commit: @{triggerBody()?['sha']}
     Actor: @{triggerBody()?['actor']}
     URL: @{triggerBody()?['commit_url']}
     Actualizado: @{utcNow()}
     ```
3. Clic **Save**

### 6B. Si NO EXISTE: Crear tarea (rama FALSE)

En la rama **False** (clic en **Add an action**):

1. Busca: **Create a task** (Planner)
2. Rellena:
   - **Plan ID**: tu Plan ID
   - **Bucket ID**: tu Bucket ID
   - **Title**: `[Auto]@{triggerBody()?['repository']}[@{triggerBody()?['branch']}] ultimo push @{substring(triggerBody()?['sha'],0,8)}`
   - **Description**: (mismo que arriba)
3. Clic **Save**

### 7. Obtén la URL del webhook

1. Arriba en el trigger, abre **When an HTTP request is received**
2. Copia la URL bajo **HTTP POST URL**
3. Esa URL es lo que llama GitHub

Ejemplo: `https://prod-XX.westeurope.logic.azure.com:443/workflows/xxxxx/triggers/xxx/run?api-version=2016-06-01&sp=%2Ftriggers%2Fwhen_a_HTTP_request_is_received%2Frun&sv=1.0&sig=xxxx`

### 8. Carga la URL en GitHub Actions

En tu repo en el archivo `.github/workflows/planner-sync-webhook.yml`:

Vas a reemplazar la integración Graph API antigua con un simple POST HTTP al webhook.

