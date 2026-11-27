/* Informe del sistema — se muestra en Panel de Control › Informe */
window.BRD = window.BRD || {};
BRD.REPORT_HTML = `
<h2>Informe del sistema BancaRD v2.0</h2>
<p class="mut">Sistema web para consorcios de bancas de lotería y apuestas deportivas en República Dominicana. Dos aplicaciones: <b>App de venta</b> (pos.html) y <b>Panel de control</b> (control.html), que comparten los mismos datos.</p>

<h3>1. Lo que pediste y cómo quedó</h3>
<ul>
<li><b>Punto de venta deportivo:</b> filtros por deporte, liga, día y equipo; juegos con hora; líneas de Ganador (money line), Run line / Spread / Hándicap y Total (Más/Menos), Empate en fútbol. Jugadas <b>directas</b> o <b>parlay</b> (mín./máx. configurable) con cálculo de premio por momios americanos.</li>
<li><b>Punto de venta de lotería:</b> selección de una o varias loterías a la vez; Quiniela (2 dígitos), Palé (4), Tripleta (6) y Super Palé (2 loterías). Atajos de montos, teclado rápido (Enter), "Combinar palés" y "Repetir último ticket".</li>
<li><b>Historial:</b> tickets por turno, del día o de toda la banca; reimprimir, compartir por WhatsApp, anular.</li>
<li><b>Marcadores y horarios:</b> importación y actualización automática de juegos y marcadores (feed público de ESPN) cada 90 s; edición manual para LIDOM/LNB.</li>
<li><b>Control de bancas:</b> alta, edición, suspensión, límite diario de venta, código de ticket por banca, ventas en vivo.</li>
<li><b>Control de staff:</b> usuarios con roles (Administrador, Supervisor, Cajero), banca asignada, comisión, cédula, último acceso, bloqueo por intentos fallidos, cambio de clave.</li>
</ul>

<h3>2. Funciones que faltaban y se agregaron</h3>
<ul>
<li><b>Calificación automática</b> de tickets al ingresar resultados o al terminar un juego (ganador / perdedor / devolución por empate o juego suspendido). Corregir un resultado recalcula los tickets no pagados.</li>
<li><b>Pago de premios</b> con código de ticket (compatible con lector de código de barras) y <b>PIN de seguridad</b> impreso; evita pagos dobles y tickets caducados.</li>
<li><b>Cierre automático de ventas</b> X minutos antes de cada sorteo y al inicio de cada juego; horarios distintos por día (ej. Leidsa y Nacional los domingos).</li>
<li><b>Topes y bloqueos por número</b> (por banca o sumando todas las bancas), máximo por jugada y monto mínimo — control del riesgo de la banca.</li>
<li><b>Turnos y cuadre de caja:</b> fondo inicial, ventas, premios pagados, gastos, efectivo esperado vs. contado, diferencia, impresión del cuadre; cierre forzado por el administrador.</li>
<li><b>Anulación controlada:</b> el cajero solo anula sus tickets dentro de N minutos y antes del cierre; supervisor/administrador con motivo registrado.</li>
<li><b>Ticket térmico 80 mm</b> con código de barras Code 39, PIN, datos de banca y RNC.</li>
<li><b>Reportes</b> por banca, vendedor, día o producto; comisiones; % de retorno por tipo de jugada; exportación CSV.</li>
<li><b>Dashboard</b>: ventas vs. ayer, neto, ventas por banca y por lotería, números más jugados, cajeros en turno, alertas de resultados pendientes.</li>
<li><b>Exposición por juego</b> (cuánto hay apostado en cada partido).</li>
<li><b>Auditoría</b> de todas las acciones (ventas, anulaciones, pagos, resultados, cambios de configuración, inicios de sesión).</li>
<li><b>Configuración de premios</b> (Quiniela 1ra/2da/3ra, Palé por combinación, Tripleta 3 y 2 números, Super Palé) y reglas de deportes.</li>
<li><b>Respaldo y restauración</b> en JSON, generador de ventas de prueba, instalable como app (PWA).</li>
<li><b>Servidor central opcional</b> (server/server.js, sin dependencias) para que todas las bancas compartan datos en tiempo real.</li>
</ul>

<h3>2b. Novedades v1.1 — organización del panel</h3>
<ul>
<li><b>Menú por áreas:</b> General, Ventas, Operación, Puntos de venta, Inventario, Soporte y Sistema, con contadores de pendientes (pedidos, reportes de errores, artículos bajo mínimo).</li>
<li><b>Bancas / puntos de venta:</b> tipo (banca, punto de venta, agencia, kiosco…), ficha completa con ventas, staff, existencias, pedidos y reportes de cada banca.</li>
<li><b>Staff con varias bancas:</b> cada miembro puede tener una o varias bancas asignadas. Al entrar a la venta elige en cuál trabaja; si tiene un turno abierto, entra directo a esa banca.</li>
<li><b>Roles y permisos configurables:</b> Administrador, Supervisor, Operador central, Encargado de banca y Cajero vienen listos; se pueden crear, editar o duplicar roles marcando permisos (27 permisos en 7 grupos). Cada rol tiene un <b>alcance</b>: "todas las bancas" o "solo bancas asignadas". Un supervisor de zona solo ve las ventas, tickets, cuadres, staff, inventario, pedidos y reportes de sus bancas. Un usuario solo puede crear staff con roles que no superen sus propios permisos.</li>
<li><b>Inventario:</b> catálogo de artículos (papel térmico, talonarios, bolígrafos, etc.) con mínimo por banca y por almacén; existencias por ubicación, vista general en matriz, entradas de compra, transferencias, conteo físico con ajuste automático y registro de todos los movimientos.</li>
<li><b>Pedidos de material:</b> el personal de la banca ve lo que tiene en existencia y pide lo que falta (el formulario sugiere cantidades para lo que está bajo mínimo). Flujo: Pendiente → el supervisor aprueba o rechaza → despacha desde el almacén → la banca confirma "recibido" y entra a su existencia. Todo queda con historial.</li>
<li><b>Reporte de errores:</b> desde la venta o el panel, con tipo (impresora, sistema, internet, ticket, caja, líneas, local), prioridad, ticket relacionado y foto. El supervisor u oficina lo asigna, responde y cambia el estado (abierto, en proceso, resuelto, cerrado); el cajero ve las respuestas y puede reabrirlo.</li>
<li><b>Errores del sistema:</b> los fallos técnicos de la app se registran solos (agrupados, con cantidad y usuario) para el equipo de desarrollo.</li>
</ul>

<h3>2c. Novedades v2.0 — servidor central seguro</h3>
<ul>
<li><b>Base limpia:</b> sin datos de ejemplo; solo el usuario <b>admin</b>, que debe crear su contraseña al entrar. El panel muestra una guía de primeros pasos.</li>
<li><b>Inicio de sesión real:</b> contraseñas cifradas con scrypt en el servidor, sesión con token de 12 horas, bloqueo tras 5 intentos fallidos y límite de intentos por IP. Al cambiarle la clave a alguien se cierran sus sesiones abiertas.</li>
<li><b>El servidor manda:</b> cada venta, pago, anulación, resultado, cambio de staff o de inventario se valida en el servidor con el rol y las bancas del usuario. Un ticket solo se entrega si el servidor lo aprueba (horario, topes, montos y línea vigente). Si la línea deportiva cambió, la venta se rechaza.</li>
<li><b>Calificación y marcadores en el servidor:</b> nadie puede marcarse un ticket como ganador; los pagos verifican el PIN y que no se paguen dos veces.</li>
<li><b>Privacidad:</b> cada usuario solo descarga los datos de sus bancas; las contraseñas nunca salen del servidor; el PIN del ticket solo lo ve quien lo vendió.</li>
<li><b>Datos guardados</b> en archivo con respaldo automático cada hora, o en Supabase (Postgres).</li>
</ul>

<h3>3. Valores por defecto (ajústelos en Configuración)</h3>
<ul>
<li>Premios por RD$1: Quiniela 60 / 8 / 4 · Palé 1000 (1ra-2da), 1000 (1ra-3ra), 100 (2da-3ra) · Tripleta 20,000 (3) y 100 (2) · Super Palé 2,000.</li>
<li>Horarios de referencia: La Primera 12:00 y 7:00 PM, La Suerte 12:30 y 6:00 PM, King Lottery, Real 12:55, LoteDom 1:55, Gana Más 2:30, Loteka 7:55, Leidsa 8:55 (dom 3:55), Nacional 9:00 (dom 6:00), Anguila, Florida y New York. Confírmelos con cada lotería.</li>
<li>Cierre 5 min antes del sorteo, anulación 5 min, caducidad 90 días.</li>
</ul>

<h3>4. Importante antes de operar con dinero real</h3>
<ul>
<li><b>Use siempre el modo servidor con HTTPS</b> para operar con dinero. La versión de GitHub Pages (modo local) es solo para demostración: ahí los permisos se validan en el navegador.</li>
<li><b>Datos deportivos:</b> el feed de ESPN es público y no oficial; no trae LIDOM ni garantiza líneas. Para líneas profesionales use un proveedor de odds con licencia (p. ej. The Odds API, Sportradar, OddsJam).</li>
<li><b>Legal:</b> las bancas deben tener licencia del Ministerio de Hacienda; los porcentajes de pago de quiniela están regulados (Ley 139-11). Consulte a su abogado para cumplir con impuestos y prevención de lavado.</li>
</ul>

<h3>5. Siguientes pasos recomendados</h3>
<ol>
<li>Backend con autenticación real y base de datos (PostgreSQL) — prioridad alta.</li>
<li>Integración con proveedor de líneas y resultados de lotería automáticos.</li>
<li>Impresión directa a impresoras térmicas Bluetooth/USB (ESC/POS) desde Android.</li>
<li>Banca móvil / ventas en línea con billetera de clientes (requiere licencia online).</li>
<li>Recargas y pagos de servicios (fuente de ingreso adicional común en bancas).</li>
<li>Notificaciones (WhatsApp/SMS) de premios y alertas de tope.</li>
</ol>
`;
