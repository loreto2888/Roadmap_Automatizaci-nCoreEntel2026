# Discord Webhook Setup - GitHub Push Notifications

## ¿Qué es?
Cada vez que hagas `git push`, GitHub Actions envía una notificación a Discord con:
- Repositorio
- Branch
- Commit SHA
- Author
- Timestamp

## Pasos para obtener Webhook URL (2 minutos)

### 1. Abre Discord
- Acceso a tu servidor Discord (o crea uno gratis)
- O crea un canal privado para pruebas

### 2. Crear Webhook en el canal
1. **Clic derecho en el canal** → **Edit channel**
2. Lado izquierdo: **Integrations** → **Webhooks**
3. Clic **New Webhook**
4. Dale un nombre: `GitHub-Notifications`
5. Clic **Copy Webhook URL**

URL ejemplo:
```
https://discordapp.com/api/webhooks/XXXXXXXXXX/XXXXXXXXXXXXXXXXXXX
```

### 3. Cargar URL en GitHub
1. Tu repo en GitHub
2. **Settings** → **Secrets and variables** → **Actions**
3. **New repository secret**
   - Name: `DISCORD_WEBHOOK_URL`
   - Value: (pega la URL de Discord)
4. **Add secret**

### 4. Prueba
Desde terminal/VS Code:
```bash
git commit --allow-empty -m "test discord notification"
git push
```

Espera 10 segundos y deberías ver el mensaje en Discord. ✅

## Si algo falla

**"Missing DISCORD_WEBHOOK_URL"**
- El secret no está cargado en GitHub
- Verifica: Settings → Secrets → DISCORD_WEBHOOK_URL está ahí

**No llega el mensaje a Discord**
- Verifica que el webhook URL sea válido
- Verifica que el canal exista
- Revisa los logs en GitHub Actions

**Webhook URL inválido**
- Cópialo nuevamente desde Discord
- No debe tener espacios al inicio/final

## Personalizaciones (opcionales)

Si quieres cambiar el mensaje, edita:
- `.github/workflows/discord-notify.yml`
- Campo `"description"` o agrega más `"fields"`
- Commit y push

Los colores en Discord:
- `3447003` = Blue (actual)
- `15844367` = Gold
- `9109504` = Red
- `3066993` = Green

---

Cuando tengas el webhook URL cargado en GitHub, haz un push de prueba y confirma que recibas el mensaje en Discord. 👍
