# BancaRD — Sistema para bancas de lotería y deportes (RD)

| Módulo | Archivo | Para quién |
|---|---|---|
| App de venta | `pos.html` | Cajeros: lotería, deportes, pago de premios, historial, resultados, cuadre, inventario, reportar errores |
| Panel de control | `control.html` | Dueño, supervisores y oficina: bancas, staff, roles, inventario, pedidos, soporte, resultados, líneas, topes, reportes, auditoría |

Primer acceso: usuario **admin**. En modo local la clave inicial es `admin123`; en el servidor es la de `ADMIN_PASSWORD`
(o `admin123` si no se define). En ambos casos se exige cambiarla al entrar.

## Dos modos de funcionamiento

**Modo local** (GitHub Pages o cualquier hosting estático): todo vive en el navegador de cada equipo. Sirve para demostraciones o una sola banca.

**Modo servidor seguro** (`server/server.js`, Node 18+, sin dependencias): todas las bancas comparten datos.
Las páginas detectan el servidor solas.

- Inicio de sesión con contraseña cifrada (scrypt) y token de sesión de 12 h; bloqueo tras 5 intentos fallidos y límite de intentos por IP.
- El servidor valida **cada** operación con el rol y las bancas del usuario: ventas (horario, topes, montos, líneas vigentes), pagos (PIN, doble pago, caducidad), anulaciones, resultados, inventario, pedidos y reportes.
- Calificación de tickets y marcadores en el servidor; cada usuario solo recibe los datos de sus bancas; las contraseñas nunca salen del servidor.

```bash
node server/server.js                      # http://localhost:8080
PORT=8080 DATA_DIR=/datos ADMIN_PASSWORD='ClaveSegura' node server/server.js
```

### Almacenamiento
- **Archivo** (por defecto): `DATA_DIR/snapshot.json` + `changes.jsonl`, respaldo automático cada hora (se guardan 72).
- **Supabase** (gratis hasta 500 MB): defina `SUPABASE_URL` y `SUPABASE_KEY` (clave *service_role*) y ejecute `server/supabase.sql` una vez.

### Publicar
- **Render**: conecte este repo (usa `render.yaml`). Plan gratis + Supabase, o plan Starter + disco.
- **Docker**: `docker build -t bancard . && docker run -p 8080:8080 -v bancard:/data bancard`
- **VPS / PC propia**: `node server/server.js` detrás de HTTPS (Caddy, Nginx o Cloudflare Tunnel).

## Estructura
```
index.html  pos.html  control.html
assets/core.js      datos, reglas, permisos, calificación (lo usan navegador y servidor)
assets/pos.js       app de venta
assets/control.js   panel de control
assets/shared.js    pedidos de material y reportes de errores
assets/report.js    informe del sistema
server/server.js    servidor seguro
server/supabase.sql tabla para Supabase
```
