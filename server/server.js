/*
 * BancaRD — Servidor central SEGURO (Node.js 18+, sin dependencias)
 * ---------------------------------------------------------------
 *  - Inicio de sesión con contraseña (scrypt) y token de sesión (12 h).
 *  - El servidor es la única fuente de verdad: valida cada venta, pago,
 *    anulación, resultado, movimiento de inventario, etc. con los permisos
 *    y el alcance (bancas) del usuario. Lo que no cumple se rechaza.
 *  - Califica tickets y actualiza marcadores él mismo.
 *  - Cada usuario solo recibe los datos de sus bancas.
 *
 *  Uso:   node server/server.js
 *  Variables de entorno:
 *    PORT            puerto (por defecto 8080)
 *    DATA_DIR        carpeta de datos para almacenamiento en archivo (por defecto server/data)
 *    ADMIN_PASSWORD  contraseña inicial del usuario "admin" (solo la primera vez; por defecto admin123)
 *    SUPABASE_URL + SUPABASE_KEY   (opcional) guardar los datos en Supabase/Postgres en vez de archivo
 *    TRUST_PROXY=1   usar X-Forwarded-For para la IP (detrás de Render/Railway/Nginx)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeCrypto = require('crypto');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const SESSION_TTL = 12 * 3600 * 1000;
const MAX_BODY = 4 * 1024 * 1024;

/* ======================= almacenamiento ======================= */
class FileStore {
  constructor(dir) { this.dir = dir; this.snap = path.join(dir, 'snapshot.json'); this.log = path.join(dir, 'changes.jsonl'); this.q = []; }
  async load() {
    fs.mkdirSync(path.join(this.dir, 'backups'), { recursive: true });
    let state = {};
    try { state = JSON.parse(fs.readFileSync(this.snap, 'utf8')); } catch (e) { }
    try {
      const lines = fs.readFileSync(this.log, 'utf8').split('\n');
      for (const l of lines) { if (!l) continue; try { const { c, rec } = JSON.parse(l); (state[c] = state[c] || {})[rec.id] = rec; } catch (e) { } }
    } catch (e) { }
    setInterval(() => this.flush(), 500);
    setInterval(() => this.compact(state), 3600 * 1000); // compacta y respalda cada hora
    return state;
  }
  write(c, rec) { this.q.push(JSON.stringify({ c, rec }) + '\n'); }
  flush() { if (!this.q.length) return; const data = this.q.join(''); this.q = []; fs.appendFileSync(this.log, data); }
  compact(state) {
    try {
      this.flush();
      const tmp = this.snap + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(state)); fs.renameSync(tmp, this.snap); fs.writeFileSync(this.log, '');
      const b = path.join(this.dir, 'backups', 'snapshot_' + new Date().toISOString().slice(0, 13).replace(/[:T]/g, '-') + '.json');
      fs.copyFileSync(this.snap, b);
      const all = fs.readdirSync(path.join(this.dir, 'backups')).sort(); all.slice(0, Math.max(0, all.length - 72)).forEach(f => fs.unlinkSync(path.join(this.dir, 'backups', f)));
    } catch (e) { console.error('compact', e.message); }
  }
  describe() { return 'archivo ' + this.dir; }
}

/* Supabase (Postgres): tabla bancard_records(c text, id text, rec jsonb, primary key (c, id)) */
class SupabaseStore {
  constructor(url, key) { this.url = url.replace(/\/$/, '') + '/rest/v1/bancard_records'; this.key = key; this.q = new Map(); }
  h(extra) { return Object.assign({ apikey: this.key, Authorization: 'Bearer ' + this.key, 'Content-Type': 'application/json' }, extra || {}); }
  async load() {
    const state = {}; let from = 0; const size = 1000;
    for (; ;) {
      const r = await fetch(this.url + '?select=c,id,rec&order=c,id', { headers: this.h({ Range: `${from}-${from + size - 1}`, 'Range-Unit': 'items' }) });
      if (!r.ok) throw new Error('Supabase ' + r.status + ': ' + await r.text());
      const rows = await r.json(); rows.forEach(x => (state[x.c] = state[x.c] || {})[x.id] = x.rec);
      if (rows.length < size) break; from += size;
    }
    setInterval(() => this.flush(), 1500);
    return state;
  }
  write(c, rec) { this.q.set(c + '/' + rec.id, { c, id: rec.id, rec }); }
  async flush() {
    if (!this.q.size || this.busy) return; this.busy = true;
    const rows = [...this.q.values()].slice(0, 500); rows.forEach(r => this.q.delete(r.c + '/' + r.id));
    try {
      const r = await fetch(this.url, { method: 'POST', headers: this.h({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(rows) });
      if (!r.ok) throw new Error(r.status + ' ' + await r.text());
    } catch (e) { console.error('Supabase guardar:', e.message); rows.forEach(r => { if (!this.q.has(r.c + '/' + r.id)) this.q.set(r.c + '/' + r.id, r); }); }
    finally { this.busy = false; }
  }
  describe() { return 'Supabase'; }
}

/* ======================= núcleo compartido (mismo código que el navegador) ======================= */
const SS = new Map();
const ctx = {
  console, setTimeout, setInterval, clearTimeout, clearInterval, fetch, crypto: globalThis.crypto || nodeCrypto.webcrypto, TextEncoder, TextDecoder, Intl, URL,
  navigator: { userAgent: 'BancaRD-server' }, location: { protocol: 'file:', pathname: '/server' },
  localStorage: { getItem: () => null, setItem() { }, removeItem() { } },
  sessionStorage: { getItem: k => (SS.has(k) ? SS.get(k) : null), setItem: (k, v) => SS.set(k, String(v)), removeItem: k => SS.delete(k) },
  addEventListener() { }, __ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', 'core.js'), 'utf8'), ctx, { filename: 'core.js' });
const BRD = ctx.BRD;
const { DB, Auth, U } = BRD;
const plain = o => JSON.parse(JSON.stringify(o)); // datos del cliente -> objetos limpios

/* ejecuta fn como si el usuario u estuviera conectado (reutiliza permisos y reglas del núcleo) */
function asUser(u, banca, fn) {
  const prev = new Map(SS);
  SS.clear();
  if (u) SS.set('bancard_session_v1', JSON.stringify({ id: u.id }));
  if (banca) SS.set('bancard_pos_banca', banca);
  try { return fn(u ? Auth.user() : null); } finally { SS.clear(); prev.forEach((v, k) => SS.set(k, v)); }
}

/* ======================= contraseñas y sesiones ======================= */
function hashPw(pw) { const salt = nodeCrypto.randomBytes(16).toString('hex'); const h = nodeCrypto.scryptSync(String(pw), salt, 32).toString('hex'); return `scrypt$${salt}$${h}`; }
function checkPw(stored, pw) {
  if (!stored) return false;
  if (stored.startsWith('scrypt$')) {
    const [, salt, h] = stored.split('$'); const x = nodeCrypto.scryptSync(String(pw), salt, 32);
    const hb = Buffer.from(h, 'hex'); return hb.length === x.length && nodeCrypto.timingSafeEqual(x, hb);
  }
  const legacy = nodeCrypto.createHash('sha256').update('bancard:' + pw).digest('hex'); // contraseñas antiguas
  return legacy.length === stored.length && nodeCrypto.timingSafeEqual(Buffer.from(legacy), Buffer.from(stored));
}
let sessions = {}; // sha256(token) -> { userId, exp, ip }
const tokHash = t => nodeCrypto.createHash('sha256').update(String(t)).digest('hex');
let store;
function saveSessions() { clearTimeout(saveSessions.t); saveSessions.t = setTimeout(() => store.write('_sys', { id: 'sessions', data: sessions, updatedAt: Date.now() }), 1000); }
function sessionUser(req) {
  const m = /^Bearer\s+([a-f0-9]{64})$/i.exec(req.headers.authorization || ''); if (!m) return null;
  const k = tokHash(m[1]); const s = sessions[k]; if (!s || s.exp < Date.now()) { if (s) { delete sessions[k]; saveSessions(); } return null; }
  const u = DB.get('users', s.userId); if (!u || !u.active) return null;
  if (s.exp - Date.now() < SESSION_TTL - 600000) { s.exp = Date.now() + SESSION_TTL; saveSessions(); } // renovación
  return { u, key: k };
}
const hits = new Map(); // límite de solicitudes
function rateOk(key, max, ms) { const now = Date.now(); const a = (hits.get(key) || []).filter(t => now - t < ms); a.push(now); hits.set(key, a); return a.length <= max; }
setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.some(t => now - t < 600000)) hits.delete(k); for (const k in sessions) if (sessions[k].exp < now) delete sessions[k]; }, 300000);

/* ======================= visibilidad de datos ======================= */
function visible(u, c, rec) {
  if (rec._deleted) return true;
  const can = p => Auth.can(p, u), sees = id => Auth.sees(id, u), all = Auth.allBancas(u);
  switch (c) {
    case 'config': case 'roles': case 'lotteries': case 'results': case 'leagues': case 'games': case 'items': case 'locations': return true;
    case 'bancas': return sees(rec.id);
    case 'users': return rec.id === u.id || all || ((can('staff.view') || can('issues.manage') || can('requests.approve')) && Auth.userBancas(rec).some(sees));
    case 'tickets': case 'shifts': case 'expenses': return sees(rec.bancaId);
    case 'limits': return rec.scope === 'global' || sees(rec.scope);
    case 'audit': return (can('audit.view') && (rec.bancaId ? sees(rec.bancaId) : all)) || rec.userId === u.id;
    case 'stock': return rec.loc === 'central' ? (can('inventory.view') || can('requests.create') || can('requests.approve')) : sees(rec.loc);
    case 'movements': return [rec.from, rec.to].some(l => l && l !== 'central' && sees(l)) || (all && can('inventory.view'));
    case 'requests': return sees(rec.bancaId);
    case 'issues': return rec.by === u.username || (rec.bancaId ? sees(rec.bancaId) : (all && can('issues.manage')));
    case 'syserrors': return can('syserrors');
  }
  return false;
}
function sanitize(u, c, rec) {
  if (c === 'users') { const x = Object.assign({}, rec); delete x.pass; delete x.fails; delete x.lockedUntil; return x; }
  if (c === 'tickets') { const x = Object.assign({}, rec); delete x.payPin; if (!(rec.userId === u.id || Auth.can('tickets.pay', u))) delete x.pin; return x; }
  return rec;
}

/* ======================= validación de cada cambio ======================= */
class Deny extends Error { }
const deny = msg => { throw new Deny(msg); };
const str = (v, n = 200) => String(v == null ? '' : v).slice(0, n);
const num = v => { const n = Number(v); if (!isFinite(n)) deny('Número inválido'); return n; };
const ISSUE_ST = ['abierto', 'en_proceso', 'resuelto', 'cerrado'];
const ADMIN_COLLS = { config: 'config', roles: 'roles', lotteries: 'lotteries', leagues: 'games', games: 'games', results: 'results', items: 'inventory.edit', locations: 'config', limits: 'limits', bancas: 'bancas.edit' };

function legFrom(g, m, s) {
  const o = g.odds || {}; let odds = null, line = null;
  if (m === 'ml') odds = s === 'home' ? o.mlHome : s === 'away' ? o.mlAway : s === 'draw' ? o.mlDraw : null;
  else if (m === 'rl') { if (o.spread == null || !['home', 'away'].includes(s)) return null; line = s === 'home' ? Number(o.spread) : -Number(o.spread); odds = s === 'home' ? o.spHome : o.spAway; }
  else if (m === 'tot') { if (o.total == null || !['over', 'under'].includes(s)) return null; line = Number(o.total); odds = s === 'over' ? o.over : o.under; }
  if (odds == null || !Number(odds)) return null;
  return { gameId: g.id, market: m, side: s, line, odds: Number(odds), label: BRD.Sports.marketLabel(g, m, s, line) };
}

function resetTicketsFor(lotId, date) {
  DB.all('tickets').filter(t => t.type === 'loteria' && t.date === date && ['ganador', 'perdedor'].includes(t.status) && t.lines.some(l => l.lot === lotId || l.lot2 === lotId))
    .forEach(t => DB.put('tickets', Object.assign({}, t, { status: 'pendiente', prize: 0, lines: t.lines.map(l => (l.lot === lotId || l.lot2 === lotId) ? Object.assign({}, l, { result: null, prize: 0 }) : l) }), { silent: true }));
}

function applyPut(u, c, rec) {
  rec = plain(rec || {});
  if (!rec.id || typeof rec.id !== 'string' || rec.id.length > 100) deny('Registro inválido');
  const can = p => Auth.can(p, u), sees = id => Auth.sees(id, u), all = Auth.allBancas(u);
  const cur = DB.get(c, rec.id); const del = !!rec._deleted;
  const now = Date.now();

  /* las existencias se calculan en el servidor a partir de los movimientos */
  if (c === 'stock') return { ignore: true };

  /* --- colecciones administrativas --- */
  if (ADMIN_COLLS[c]) {
    if (!can(ADMIN_COLLS[c])) deny('No tiene permiso para modificar ' + c);
    if (c === 'config') { if (del || rec.id !== 'main') deny('Configuración inválida'); return { put: Object.assign({}, cur, rec) }; }
    if (c === 'roles') {
      const target = cur || rec;
      if (target.system || (cur && cur.perms.includes('*'))) deny('El rol Administrador no se puede modificar');
      if (u.role === rec.id && !can('*')) deny('No puede modificar su propio rol');
      if (del) { if (DB.all('users').some(x => x.role === rec.id)) deny('Hay usuarios con este rol'); return { put: { id: rec.id, _deleted: true } }; }
      const perms = (rec.perms || []).filter(p => Auth.ALL_PERMS.includes(p));
      if (!can('*') && perms.some(p => !can(p))) deny('No puede otorgar permisos que usted no tiene');
      if (rec.scope === 'all' && !all) deny('No puede crear roles con acceso a todas las bancas');
      return { put: { id: rec.id, name: str(rec.name, 60), desc: str(rec.desc, 200), scope: rec.scope === 'all' ? 'all' : 'assigned', perms, order: num(rec.order || 10) } };
    }
    if (c === 'bancas') {
      if (del) deny('Las bancas no se eliminan; suspéndalas');
      if (!cur && !all) deny('Solo un usuario con acceso a todas las bancas puede crear bancas');
      if (cur && !sees(cur.id)) deny('Banca fuera de su alcance');
      const code = str(rec.code, 6).toUpperCase().replace(/[^A-Z0-9]/g, ''); if (!code) deny('Código inválido');
      if (DB.all('bancas').some(b => b.code === code && b.id !== rec.id)) deny('Ese código de banca ya existe');
      return { put: Object.assign({}, cur || { createdAt: now }, rec, { code, serial: cur ? (cur.serial || 0) : 0, status: rec.status === 'activa' ? 'activa' : 'suspendida', dailyLimit: Math.max(0, num(rec.dailyLimit || 0)) }) };
    }
    if (c === 'limits') {
      const scope = (cur || rec).scope;
      if (scope === 'global' ? !all : !sees(scope)) deny('Tope fuera de su alcance');
      if (cur && !del && rec.scope !== scope) deny('No puede cambiar el alcance');
      if (del) return { put: { id: rec.id, _deleted: true } };
      return { put: Object.assign({}, rec, { max: Math.max(0, num(rec.max || 0)), by: u.username }) };
    }
    if (c === 'results') {
      if (del) { if (cur) resetTicketsFor(cur.lot, cur.date); return { put: { id: rec.id, _deleted: true }, regrade: true }; }
      if (!DB.get('lotteries', rec.lot) || !/^\d{4}-\d{2}-\d{2}$/.test(rec.date) || rec.id !== rec.lot + '_' + rec.date) deny('Resultado inválido');
      ['n1', 'n2', 'n3'].forEach(k => { if (!/^\d{2}$/.test(rec[k])) deny('Los números deben tener 2 dígitos'); });
      if (rec.date > U.today()) deny('No se pueden ingresar resultados de fechas futuras');
      if (cur && (cur.n1 !== rec.n1 || cur.n2 !== rec.n2 || cur.n3 !== rec.n3)) resetTicketsFor(rec.lot, rec.date);
      return { put: { id: rec.id, lot: rec.lot, date: rec.date, n1: rec.n1, n2: rec.n2, n3: rec.n3, by: u.username, at: now }, regrade: true };
    }
    if (c === 'games') {
      if (del) { const exp = DB.all('tickets').some(t => t.type === 'deporte' && t.status !== 'anulado' && t.lines.some(l => l.legs.some(x => x.gameId === rec.id))); if (exp) deny('El juego tiene jugadas vendidas: márquelo cancelado'); return { put: { id: rec.id, _deleted: true } }; }
      if (!['programado', 'en_vivo', 'final', 'suspendido', 'cancelado'].includes(rec.status)) deny('Estado inválido');
      if (rec.status === 'final' && (rec.scoreAway == null || rec.scoreHome == null)) deny('Falta el marcador final');
      return { put: Object.assign({}, cur, rec), regrade: true };
    }
    if (c === 'lotteries' && !del && !/^\d{2}:\d{2}$/.test(rec.time || '')) deny('Hora inválida');
    return { put: del ? { id: rec.id, _deleted: true } : Object.assign({}, cur, rec) };
  }

  switch (c) {
    /* --- staff --- */
    case 'users': {
      if (!can('staff.edit')) deny('No tiene permiso para editar staff');
      if (del) deny('Los usuarios no se eliminan; desactívelos');
      const role = DB.get('roles', rec.role); if (!role) deny('Rol inválido');
      const adminEditor = can('*');
      if (cur && Auth.can('*', cur) && !adminEditor) deny('Solo un administrador puede editar a otro administrador');
      if (cur && cur.id !== u.id && !all && !Auth.userBancas(cur).some(sees)) deny('Usuario fuera de su alcance');
      if (!adminEditor && (role.perms.includes('*') || role.perms.some(p => !can(p)) || (role.scope === 'all' && !all))) deny('No puede asignar un rol con más permisos que el suyo');
      const wanted = Array.isArray(rec.bancaIds) ? rec.bancaIds.filter(id => DB.get('bancas', id)) : [];
      const hidden = cur ? Auth.userBancas(cur).filter(id => !sees(id)) : [];
      const bancaIds = [...new Set(hidden.concat(wanted.filter(sees)))];
      if (role.scope !== 'all' && !bancaIds.length) deny('Asigne al menos una banca');
      if (cur && cur.id === u.id && (rec.active === false || (adminEditor && !role.perms.includes('*')))) deny('No puede quitarse su propio acceso');
      const username = str(cur ? cur.username : rec.username, 40).trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,40}$/.test(username)) deny('Usuario inválido (3 a 40 letras, números, punto, guion)');
      if (!cur && DB.all('users').some(x => x.username === username)) deny('Ese usuario ya existe');
      return { put: Object.assign({}, cur || { createdAt: now, pass: '', mustChange: true }, {
        id: rec.id, username, name: str(rec.name, 80), role: role.id, bancaIds, cedula: str(rec.cedula, 20), phone: str(rec.phone, 20),
        commission: Math.max(0, Math.min(50, num(rec.commission || 0))), active: rec.active !== false,
      }) };
    }

    /* --- tickets --- */
    case 'tickets': {
      if (del) deny('Los tickets no se eliminan');
      if (!cur) return { put: newTicket(u, rec) };
      if (rec.status === 'anulado' && cur.status !== 'anulado') {
        const err = BRD.Tickets.canVoid(cur, u); if (err) deny(err);
        return { put: Object.assign({}, cur, { status: 'anulado', voidAt: now, voidBy: u.username, voidReason: str(rec.voidReason, 200) }) };
      }
      if (rec.status === 'pagado' && cur.status !== 'pagado') {
        if (!can('pos') && !can('tickets.pay')) deny('No tiene permiso para pagar');
        const sh = BRD.Shifts.current(u);
        if (!can('tickets.pay') && !sh) deny('Abra su turno para pagar');
        try { BRD.Tickets.pay(cur, u, rec.payPin, sh); } catch (e) { deny(e.message); }
        return { done: true };
      }
      deny('Cambio no permitido en el ticket');
    }

    /* --- turnos y caja --- */
    case 'shifts': {
      if (del) deny('No permitido');
      if (!cur) {
        if (!can('pos')) deny('Sin permiso de venta');
        const b = DB.get('bancas', rec.bancaId); if (!b || !sees(b.id)) deny('Banca fuera de su alcance'); if (b.status !== 'activa') deny('La banca está suspendida');
        if (BRD.Shifts.current(u)) deny('Ya tiene un turno abierto');
        return { put: { id: rec.id, userId: u.id, userName: u.name, bancaId: b.id, openedAt: now, fondo: Math.max(0, num(rec.fondo || 0)), status: 'abierto' } };
      }
      if (cur.status !== 'abierto' || rec.status !== 'cerrado') deny('Cambio de turno no permitido');
      if (!(cur.userId === u.id || (can('shifts.close') && sees(cur.bancaId)))) deny('No puede cerrar este turno');
      BRD.Shifts.close(cur, num(rec.declarado || 0), str(rec.nota, 200));
      return { done: true };
    }
    case 'expenses': {
      if (cur || del) deny('Los gastos no se modifican');
      const sh = BRD.Shifts.current(u); if (!sh || sh.id !== rec.shiftId) deny('Gasto sin turno abierto');
      const amount = num(rec.amount); if (!(amount > 0)) deny('Monto inválido');
      return { put: { id: rec.id, shiftId: sh.id, bancaId: sh.bancaId, userId: u.id, concept: str(rec.concept, 120), amount, at: now, date: U.today() } };
    }

    /* --- inventario --- */
    case 'movements': {
      if (cur || del) deny('Los movimientos no se modifican');
      const it = DB.get('items', rec.itemId); if (!it) deny('Artículo inválido');
      const qty = num(rec.qty); const from = rec.from || '', to = rec.to || '';
      const locOk = l => l === 'central' ? all : !!(DB.get('bancas', l) && sees(l));
      const t = rec.type;
      if (t === 'consumo') { if (!can('inventory.use') || !locOk(from) || to) deny('No puede registrar consumo aquí'); }
      else if (t === 'entrada') { if (!can('inventory.edit') || from || !locOk(to)) deny('Sin permiso para registrar entradas'); }
      else if (t === 'transferencia' || t === 'devolucion') { if (!can('inventory.edit') || !locOk(from) || !locOk(to)) deny('Sin permiso de transferencia'); }
      else if (t === 'ajuste') { if (!can('inventory.edit') || !locOk(to)) deny('Sin permiso de ajuste'); }
      else if (t === 'despacho') {
        const r = DB.all('requests').find(x => x.code === rec.ref);
        if (!r || !['pendiente', 'aprobado'].includes(r.status) || !can('requests.approve') || !sees(r.bancaId) || from !== 'central' || to) deny('Despacho inválido');
        const line = r.lines.find(l => l.itemId === it.id); if (!line) deny('Artículo no está en el pedido');
        const sent = DB.all('movements').filter(m => m.type === 'despacho' && m.ref === r.code && m.itemId === it.id).reduce((a, m) => a + m.qty, 0);
        if (sent + qty > line.qty) deny('No puede enviar más de lo pedido');
      } else if (t === 'recepcion') {
        const r = DB.all('requests').find(x => x.code === rec.ref); if (!r || r.status !== 'despachado' || r.bancaId !== to || !sees(to) || from) deny('Recepción inválida');
        const line = r.lines.find(l => l.itemId === it.id); if (!line || qty > Number(line.qtySent || 0)) deny('Cantidad recibida mayor a la enviada');
        if (DB.all('movements').some(m => m.type === 'recepcion' && m.ref === r.code && m.itemId === it.id)) deny('Ya se recibió este artículo');
      } else deny('Tipo de movimiento inválido');
      if (t === 'ajuste') BRD.Inv.add(to, it.id, qty, true);
      else {
        if (!(qty > 0)) deny('Cantidad inválida');
        if (from && BRD.Inv.qty(from, it.id) < qty) deny(`No hay suficiente ${it.name} en ${BRD.Inv.locName(from)}`);
        if (from) BRD.Inv.add(from, it.id, -qty, true);
        if (to) BRD.Inv.add(to, it.id, qty, true);
      }
      return { put: { id: rec.id, at: now, type: t, itemId: it.id, qty, from, to, note: str(rec.note, 200), ref: str(rec.ref, 40), by: u.username } };
    }
    case 'requests': {
      if (del) deny('No permitido');
      if (!cur) {
        if (!can('requests.create') && !can('requests.approve')) deny('Sin permiso para pedir material');
        if (!DB.get('bancas', rec.bancaId) || !sees(rec.bancaId)) deny('Banca fuera de su alcance');
        const lines = (rec.lines || []).filter(l => DB.get('items', l.itemId) && Number(l.qty) > 0).map(l => ({ itemId: l.itemId, qty: num(l.qty), qtySent: 0 }));
        if (!lines.length) deny('Pedido vacío');
        const code = 'PED-' + String(DB.all('requests').length + 1).padStart(4, '0');
        return { put: { id: rec.id, code, bancaId: rec.bancaId, by: u.username, byName: u.name, at: now, lines, note: str(rec.note, 300), priority: rec.priority === 'urgente' ? 'urgente' : 'normal', status: 'pendiente', history: [{ at: now, by: u.username, status: 'pendiente', note: str(rec.note, 300) }] } };
      }
      if (!sees(cur.bancaId)) deny('Pedido fuera de su alcance');
      const to = rec.status, from = cur.status; const approve = can('requests.approve');
      const ok = (from === 'pendiente' && ['aprobado', 'rechazado'].includes(to) && approve) || (['pendiente', 'aprobado'].includes(from) && to === 'despachado' && approve) ||
        (from === 'despachado' && to === 'recibido' && (approve || can('requests.create'))) || (from === 'pendiente' && to === 'cancelado' && (approve || cur.by === u.username));
      if (!ok) deny('Cambio de estado del pedido no permitido');
      const note = str(((rec.history || []).slice(-1)[0] || {}).note, 300);
      if (to === 'rechazado' && !note) deny('Indique el motivo del rechazo');
      const x = Object.assign({}, cur, { status: to, history: (cur.history || []).concat([{ at: now, by: u.username, status: to, note }]) });
      if (to === 'despachado') {
        x.lines = cur.lines.map(l => ({ itemId: l.itemId, qty: l.qty, qtySent: DB.all('movements').filter(m => m.type === 'despacho' && m.ref === cur.code && m.itemId === l.itemId).reduce((a, m) => a + m.qty, 0) }));
        if (!x.lines.some(l => l.qtySent > 0)) deny('Primero debe salir material del almacén');
        x.dispatchedAt = now;
      }
      if (to === 'recibido') x.receivedAt = now;
      return { put: x };
    }

    /* --- soporte --- */
    case 'issues': {
      if (del) deny('No permitido');
      if (!cur) {
        if (!can('issues.create') && !can('issues.manage')) deny('Sin permiso para reportar');
        if (rec.bancaId ? !(DB.get('bancas', rec.bancaId) && sees(rec.bancaId)) : !all) deny('Banca fuera de su alcance');
        const photo = typeof rec.photo === 'string' && rec.photo.startsWith('data:image/jpeg;base64,') && rec.photo.length < 900000 ? rec.photo : '';
        const code = 'ERR-' + String(DB.all('issues').length + 1).padStart(4, '0');
        return { put: { id: rec.id, code, bancaId: rec.bancaId || '', by: u.username, byName: u.name, at: now, status: 'abierto', comments: [], assignedTo: '', category: str(rec.category, 20), priority: ['baja', 'media', 'alta', 'urgente'].includes(rec.priority) ? rec.priority : 'media', title: str(rec.title, 90), description: str(rec.description, 3000), ticketCode: str(rec.ticketCode, 30), photo, page: str(rec.page, 40) } };
      }
      if (!visible(u, 'issues', cur)) deny('Reporte fuera de su alcance');
      const manage = can('issues.manage') && (cur.bancaId ? sees(cur.bancaId) : all);
      const x = Object.assign({}, cur);
      const old = cur.comments || [], neu = Array.isArray(rec.comments) ? rec.comments : old;
      if (neu.length < old.length) deny('No se pueden borrar comentarios');
      neu.slice(old.length).forEach(cm => { const c2 = { at: now, by: u.username, byName: u.name, text: str(cm.text, 2000) }; if (cm.status && ISSUE_ST.includes(cm.status)) c2.status = cm.status; x.comments = (x.comments || []).concat([c2]); });
      if (rec.status !== cur.status) {
        if (!ISSUE_ST.includes(rec.status)) deny('Estado inválido');
        if (!(manage || (cur.by === u.username && cur.status === 'resuelto' && rec.status === 'abierto'))) deny('No puede cambiar el estado');
        x.status = rec.status; if (rec.status === 'resuelto') x.resolvedAt = now;
      }
      if ((rec.assignedTo || '') !== (cur.assignedTo || '')) { if (!manage) deny('No puede asignar'); x.assignedTo = str(rec.assignedTo, 40); }
      return { put: x };
    }
    case 'syserrors': {
      if (del) deny('No permitido');
      if (rec.resolved && !can('syserrors')) deny('Sin permiso');
      return { put: { id: rec.id, app: str(rec.app, 20), msg: str(rec.msg, 300), src: str(rec.src, 300), count: Math.min(1e6, Math.max(1, Number(rec.count) || 1)), first: cur ? cur.first : now, last: now, user: u.username, ua: str(rec.ua, 120), resolved: !!rec.resolved } };
    }
    case 'audit': {
      if (cur || del) return { ignore: true };
      return { put: { id: rec.id, at: now, user: u.username, userId: u.id, bancaId: rec.bancaId && sees(rec.bancaId) ? rec.bancaId : '', action: str(rec.action, 60), detail: str(rec.detail, 500), extra: null } };
    }
  }
  deny('Operación no permitida');
}

function newTicket(u, rec) {
  if (!Auth.can('pos', u)) deny('Sin permiso de venta');
  const b = DB.get('bancas', rec.bancaId); if (!b || !Auth.sees(b.id, u)) deny('Banca fuera de su alcance'); if (b.status !== 'activa') deny('La banca está suspendida');
  const sh = BRD.Shifts.current(u); if (!sh || sh.bancaId !== b.id || rec.shiftId !== sh.id) deny('Debe tener un turno abierto en esta banca');
  if (!new RegExp('^' + b.code + '-[A-Z2-9]{8}$').test(rec.code || '') || DB.all('tickets').some(t => t.code === rec.code)) deny('Código de ticket inválido');
  if (!/^\d{4}$/.test(rec.pin || '')) deny('PIN inválido');
  const cfg = DB.cfg(); const lines = []; let potential;
  if (rec.type === 'loteria') {
    const L = Array.isArray(rec.lines) ? rec.lines : []; if (!L.length || L.length > 150) deny('Jugadas inválidas');
    const need = { Q: 1, P: 2, T: 3, SP: 2 };
    for (const l of L) {
      if (!need[l.kind] || !Array.isArray(l.nums) || l.nums.length !== need[l.kind] || !l.nums.every(n => /^\d{2}$/.test(n))) deny('Jugada inválida');
      const x = { kind: l.kind, nums: l.nums.slice(), lot: str(l.lot, 40), amount: U.round2(num(l.amount)) };
      if (l.kind === 'SP') x.lot2 = str(l.lot2, 40);
      const err = BRD.validateLotteryLine(x, b.id, lines); if (err) deny(err);
      lines.push(x);
    }
  } else if (rec.type === 'deporte') {
    if (b.sports === false) deny('Esta banca no vende deportes');
    const sc = cfg.sports; const B = Array.isArray(rec.lines) ? rec.lines : []; if (!B.length || B.length > 30) deny('Jugadas inválidas');
    for (const bet of B) {
      const legs = Array.isArray(bet.legs) ? bet.legs : [];
      const mode = bet.mode === 'parlay' ? 'parlay' : 'directa';
      if (mode === 'directa' && legs.length !== 1) deny('Directa inválida');
      if (mode === 'parlay' && (legs.length < sc.minParlay || legs.length > sc.maxParlay)) deny(`El parlay debe tener entre ${sc.minParlay} y ${sc.maxParlay} jugadas`);
      if (new Set(legs.map(x => x.gameId)).size !== legs.length) deny('No se permiten dos jugadas del mismo partido');
      const clean = legs.map(x => {
        const g = DB.get('games', x.gameId); if (!g) deny('Juego no existe');
        if (!BRD.Sports.isOpen(g)) deny(`El juego ${g.away} @ ${g.home} ya cerró`);
        const s = legFrom(g, x.market, x.side); if (!s) deny('Línea no disponible');
        if (Number(x.odds) !== s.odds || (s.line != null && Number(x.line) !== s.line)) deny(`La línea de ${g.away} @ ${g.home} cambió (${s.label} ${s.odds > 0 ? '+' : ''}${s.odds}). Vuelva a seleccionarla.`);
        return s;
      });
      const amount = U.round2(num(bet.amount));
      if (amount < sc.minBet) deny('Apuesta mínima ' + U.money(sc.minBet));
      if (amount > sc.maxBet) deny('Apuesta máxima ' + U.money(sc.maxBet));
      const x = { mode, legs: clean, amount }; x.potential = BRD.Sports.potential(x); lines.push(x);
    }
    potential = U.round2(lines.reduce((a, l) => a + l.potential, 0));
  } else deny('Tipo de ticket inválido');
  const total = U.round2(lines.reduce((a, l) => a + l.amount, 0));
  if (b.dailyLimit) {
    const sold = DB.all('tickets').filter(t => t.bancaId === b.id && t.date === U.today() && t.status !== 'anulado').reduce((a, t) => a + t.total, 0);
    if (sold + total > b.dailyLimit) deny('La banca alcanzó su límite de venta diario');
  }
  const serial = (b.serial || 0) + 1; DB.put('bancas', Object.assign({}, b, { serial }), { silent: true });
  const t = { id: rec.id, code: rec.code, pin: rec.pin, serial, type: rec.type, lines, total, prize: 0, status: 'pendiente', bancaId: b.id, userId: u.id, userName: u.name, shiftId: sh.id, date: U.today(), createdAt: Date.now() };
  if (potential != null) t.potential = potential;
  return t;
}

/* ======================= HTTP ======================= */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon' };
const SEC = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' };
function send(res, code, obj) { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, SEC)); res.end(JSON.stringify(obj)); }
function ipOf(req) { return (process.env.TRUST_PROXY && (req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || ''; }
function body(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', d => { size += d.length; if (size > MAX_BODY) { reject(new Error('Solicitud muy grande')); req.destroy(); } else chunks.push(d); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(new Error('JSON inválido')); } });
    req.on('error', reject);
  });
}

let lastScores = 0;
/* índice de cambios por tiempo: la sincronización no recorre toda la base cada vez */
const changeLog = []; // { t, c, id } en orden de tiempo
function noteChange(c, rec) { changeLog.push({ t: rec.updatedAt || Date.now(), c, id: rec.id }); if (changeLog.length > 400000) changeLog.splice(0, 100000); }
function changesSince(since) {
  if (!changeLog.length || since < changeLog[0].t) return null; // muy viejo: recorrido completo
  let lo = 0, hi = changeLog.length; while (lo < hi) { const m = (lo + hi) >> 1; if (changeLog[m].t <= since) lo = m + 1; else hi = m; }
  const seen = new Set(); const out = [];
  for (let i = lo; i < changeLog.length; i++) { const k = changeLog[i].c + '/' + changeLog[i].id; if (!seen.has(k)) { seen.add(k); out.push(changeLog[i]); } }
  return out;
}
async function handleApi(req, res, url) {
  const p = url.pathname.slice(5); const ip = ipOf(req);
  if (p === 'ping') return send(res, 200, { bancard: true, secure: true, version: DB.VERSION, now: Date.now(), uptime: Math.round(process.uptime()), mem: Math.round(process.memoryUsage().rss / 1048576) });
  if (p === 'public') { const c = DB.cfg() || {}; return send(res, 200, { config: { company: c.company, currency: c.currency, timezone: c.timezone } }); }
  if (p === 'login' && req.method === 'POST') {
    if (!rateOk('login:' + ip, 10, 5 * 60000)) return send(res, 429, { error: 'Demasiados intentos. Espere unos minutos.' });
    const b = await body(req); const username = str(b.username, 40).trim().toLowerCase();
    const u = DB.all('users').find(x => x.username === username);
    if (!u) { checkPw('scrypt$00$' + '0'.repeat(64), String(b.password || '')); return send(res, 401, { error: 'Usuario o contraseña incorrectos' }); }
    if (!u.active) return send(res, 403, { error: 'Usuario desactivado. Contacte al administrador.' });
    if (u.lockedUntil && u.lockedUntil > Date.now()) return send(res, 403, { error: 'Usuario bloqueado por intentos fallidos. Intente en unos minutos.' });
    if (!checkPw(u.pass, String(b.password || ''))) {
      const fails = (u.fails || 0) + 1; const ch = { fails }; if (fails >= 5) { ch.lockedUntil = Date.now() + 10 * 60000; ch.fails = 0; }
      DB.put('users', Object.assign({}, u, ch), { silent: true }); asUser(null, null, () => DB.log('login.fallido', u.username + ' desde ' + ip));
      return send(res, 401, { error: 'Usuario o contraseña incorrectos' });
    }
    const ids = Auth.userBancas(u);
    if (Auth.role(u).scope !== 'all' && ids.length && ids.every(id => { const x = DB.get('bancas', id); return x && x.status !== 'activa'; })) return send(res, 403, { error: 'Sus bancas están suspendidas.' });
    const upd = Object.assign({}, u, { fails: 0, lockedUntil: 0, lastLogin: Date.now() });
    if (!u.pass.startsWith('scrypt$')) upd.pass = hashPw(b.password); // actualiza contraseñas antiguas
    DB.put('users', upd, { silent: true });
    const token = nodeCrypto.randomBytes(32).toString('hex');
    sessions[tokHash(token)] = { userId: u.id, exp: Date.now() + SESSION_TTL, ip, at: Date.now() }; saveSessions();
    asUser(u, null, () => DB.log('login', u.username + ' desde ' + ip));
    return send(res, 200, { token, user: sanitize(u, 'users', upd), expiresIn: SESSION_TTL });
  }

  const s = sessionUser(req); if (!s) return send(res, 401, { error: 'Sesión vencida. Entre de nuevo.' });
  const u = s.u; const banca = str(req.headers['x-banca'], 60);
  if (!rateOk('api:' + u.id, 900, 60000)) return send(res, 429, { error: 'Demasiadas solicitudes' });

  if (p === 'logout') { delete sessions[s.key]; saveSessions(); asUser(u, null, () => DB.log('logout', u.username)); return send(res, 200, { ok: true }); }
  if (p === 'password' && req.method === 'POST') {
    const b = await body(req); const target = DB.get('users', b.userId); const pw = String(b.password || '');
    if (!target) return send(res, 404, { error: 'Usuario no existe' });
    if (pw.length < (Auth.hasControl(target) ? 6 : 4) || pw.length > 100) return send(res, 400, { error: 'Contraseña muy corta' });
    const self = target.id === u.id;
    const allowed = self || asUser(u, null, me => Auth.can('staff.edit', me) && (Auth.allBancas(me) || Auth.userBancas(target).some(id => Auth.sees(id, me))) && (!Auth.can('*', target) || Auth.can('*', me)));
    if (!allowed) return send(res, 403, { error: 'No puede cambiar esa contraseña' });
    DB.put('users', Object.assign({}, target, { pass: hashPw(pw), mustChange: self ? false : Auth.hasControl(target), fails: 0, lockedUntil: 0 }), { silent: true });
    if (!self) for (const k in sessions) if (sessions[k].userId === target.id) delete sessions[k]; // cierra sus sesiones abiertas
    saveSessions(); asUser(u, null, () => DB.log(self ? 'usuario.clave' : 'usuario.reset_clave', target.username));
    return send(res, 200, { ok: true });
  }
  if (p === 'changes') {
    const since = Number(url.searchParams.get('since')) || 0; const now = Date.now(); const records = [];
    asUser(u, banca, me => {
      const idx = since > 0 ? changesSince(since) : null;
      if (idx) {
        for (const x of idx) { const rec = DB.raw(x.c, x.id); if (rec && (rec.updatedAt || 0) > since && visible(me, x.c, rec)) records.push({ c: x.c, rec: sanitize(me, x.c, rec) }); }
      } else {
        const st = DB.state();
        for (const c of DB.COLLS) for (const rec of Object.values(st[c] || {})) {
          if ((rec.updatedAt || 0) <= since) continue;
          if (since === 0 && rec._deleted) continue;
          if (visible(me, c, rec)) records.push({ c, rec: sanitize(me, c, rec) });
        }
      }
    });
    return send(res, 200, { now, records });
  }
  if (p === 'ticket') {
    const code = str(url.searchParams.get('code'), 30).toUpperCase();
    return asUser(u, banca, me => {
      if (!Auth.can('pos', me) && !Auth.can('tickets.view', me)) return send(res, 403, { error: 'Sin permiso' });
      if (!rateOk('tk:' + u.id, 30, 60000)) return send(res, 429, { error: 'Demasiadas consultas' });
      const t = DB.all('tickets').find(x => x.code === code || x.code.endsWith('-' + code));
      if (!t) return send(res, 404, { error: 'Ticket no encontrado' });
      BRD.gradeTicket(t);
      return send(res, 200, { ticket: sanitize(me, 'tickets', DB.get('tickets', t.id)) });
    });
  }
  if (p === 'scores' && req.method === 'POST') {
    const b = await body(req);
    if (Date.now() - lastScores < 20000) return send(res, 200, { imported: 0, updated: 0, errors: 0, graded: 0, note: 'Actualizado hace poco' });
    lastScores = Date.now();
    const r = await BRD.Scores.refreshAll({ ahead: !!b.ahead, all: !!b.all && Auth.can('games', u) });
    return send(res, 200, r);
  }
  if (p === 'put' && req.method === 'POST') {
    const b = await body(req); const recs = Array.isArray(b.records) ? b.records.slice(0, 300) : [];
    const results = []; const touched = new Map(); let regrade = false;
    const prevOnPut = DB.onPut; DB.onPut = (c, rec) => { prevOnPut(c, rec); touched.set(c + '/' + rec.id, c); };
    try {
      asUser(u, banca, me => {
        if (!me) throw new Deny('Sesión inválida');
        for (const item of recs) {
          const c = item && item.c, rec = item && item.rec; const id = rec && rec.id;
          if (typeof c !== 'string' || !DB.COLLS.includes(c)) { results.push({ c, id, ok: false, error: 'Colección inválida' }); continue; }
          touched.set(c + '/' + id, c);
          try {
            const r = applyPut(me, c, rec);
            if (r.ignore) { results.push({ c, id, ok: false, silent: true, error: 'ignorado' }); continue; }
            if (r.put) DB.put(c, r.put, { silent: true });
            if (r.regrade) regrade = true;
            results.push({ c, id, ok: true });
          } catch (e) {
            if (!(e instanceof Deny)) console.error('put', c, e);
            results.push({ c, id, ok: false, error: e instanceof Deny ? e.message : 'Error interno' });
            if (e instanceof Deny && c !== 'syserrors') DB.log('rechazado', `${c}: ${e.message}`);
          }
        }
        if (regrade) BRD.gradeAll();
      });
    } finally { DB.onPut = prevOnPut; }
    const records = [];
    asUser(u, banca, me => {
      for (const [k, c] of touched) {
        const id = k.slice(c.length + 1); const rec = DB.raw(c, id);
        if (rec && visible(me, c, rec)) records.push({ c, rec: sanitize(me, c, rec) }); else records.push({ c, id, gone: true });
      }
    });
    return send(res, 200, { results, records });
  }
  return send(res, 404, { error: 'No encontrado' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    let p = decodeURIComponent(url.pathname); if (p === '/') p = '/index.html';
    const file = path.join(ROOT, path.normalize(p));
    const rel = path.relative(ROOT, file);
    if (rel.startsWith('..') || rel.startsWith('server') || rel.split(path.sep).some(x => x.startsWith('.'))) { res.writeHead(404, SEC); return res.end('No encontrado'); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, SEC); return res.end('No encontrado'); }
      res.writeHead(200, Object.assign({ 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': /\.html$/.test(file) ? 'no-cache' : 'public, max-age=300' }, SEC)); res.end(data);
    });
  } catch (e) { if (!res.headersSent) send(res, e.message === 'Solicitud muy grande' ? 413 : 400, { error: e.message }); }
});

(async () => {
  store = process.env.SUPABASE_URL && process.env.SUPABASE_KEY ? new SupabaseStore(process.env.SUPABASE_URL, process.env.SUPABASE_KEY) : new FileStore(DATA_DIR);
  const loaded = await store.load();
  const sys = loaded._sys || {}; delete loaded._sys;
  sessions = (sys.sessions && sys.sessions.data) || {};
  DB.serverBoot(loaded);
  DB.onPut = (c, rec) => { store.write(c, rec); noteChange(c, rec); };
  await DB.init();
  const admin = DB.get('users', 'u_admin');
  if (admin && !admin.pass) {
    DB.put('users', Object.assign({}, admin, { pass: hashPw(process.env.ADMIN_PASSWORD || 'admin123'), mustChange: true }), { silent: true });
    console.log('Usuario inicial: admin / ' + (process.env.ADMIN_PASSWORD ? '(valor de ADMIN_PASSWORD)' : 'admin123') + '  -> se pedirá cambiarla al entrar');
  }
  setInterval(() => { try { BRD.gradeAll(); } catch (e) { console.error('grade', e.message); } }, 30000);
  BRD.Scores.startAuto();
  server.listen(PORT, () => console.log(`BancaRD seguro en http://localhost:${PORT}  ·  datos: ${store.describe()}`));
  const bye = () => { try { store.flush && store.flush(); } catch (e) { } process.exit(0); };
  process.on('SIGTERM', bye); process.on('SIGINT', bye);
})().catch(e => { console.error('No se pudo iniciar:', e); process.exit(1); });
