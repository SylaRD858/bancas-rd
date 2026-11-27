# BancaRD — Sistema para bancas de lotería y deportes (RD)

Aplicación web con dos módulos que comparten datos:

| Módulo | Archivo | Para quién |
|---|---|---|
| App de venta (POS) | `pos.html` | Cajeros/vendedores: lotería, deportes, pago de premios, historial, resultados, cuadre de caja |
| Panel de control | `control.html` | Dueño/supervisores: dashboard, bancas, staff con varias bancas, roles y permisos, inventario, pedidos de material, reportes de errores, resultados, juegos y líneas, topes, reportes, turnos, auditoría, configuración |

Usuarios de prueba: `admin/admin123`, `supervisor/super123`, `cajero1/1234`, `cajero2/1234`.

## Cómo usarlo

**Solo navegador (modo local):** abra `index.html` desde cualquier hosting estático (GitHub Pages, Netlify). Los datos quedan en el navegador de ese equipo.

**Varias bancas conectadas (modo servidor):**

```bash
node server/server.js          # Node 18+, sin dependencias
# PORT=8080 DATA_DIR=/ruta/datos node server/server.js
```

Abra `http://SU-SERVIDOR:8080/` en cada banca: la app detecta `/api/ping` y sincroniza todo automáticamente (cada 8 s).

> ⚠️ Antes de operar con dinero real: la autenticación se valida en el navegador y el servidor no autentica. Agregue autenticación del lado del servidor y HTTPS. Ver *Panel de control › Informe del sistema*.

## Estructura

```
index.html        inicio (enlaces a venta y control)
pos.html          punto de venta
control.html      panel de control
assets/core.js    datos, reglas, calificación, tickets, turnos, marcadores
assets/pos.js     interfaz de venta
assets/control.js interfaz de administración
assets/shared.js  pedidos de material y reportes de errores (usado por ambas apps)
assets/report.js  informe del sistema
server/server.js  servidor central opcional
```
