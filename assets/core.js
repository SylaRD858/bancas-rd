/* =========================================================
   BancaRD — núcleo compartido (datos, reglas, calificación)
   Funciona 100% en el navegador (localStorage) y, si existe
   el servidor opcional (/api), sincroniza entre bancas.
   ========================================================= */
(function (global) {
  'use strict';

  const VERSION = '2.0.0';
  const LS_KEY = 'bancard_db_v2';
  const SS_KEY = 'bancard_session_v1';
  const COLLS = ['config', 'bancas', 'users', 'roles', 'lotteries', 'results', 'leagues', 'games',
    'tickets', 'shifts', 'limits', 'audit', 'expenses', 'items', 'stock', 'movements', 'locations', 'requests', 'issues', 'syserrors'];

  /* ---------------- utilidades ---------------- */
  const U = {
    uid(p = '') { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },
    code(n = 8) {
      const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = '';
      const r = crypto.getRandomValues(new Uint32Array(n));
      for (let i = 0; i < n; i++) s += a[r[i] % a.length];
      return s;
    },
    pin() { return String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, '0'); },
    money(v, cur) {
      const c = cur || (DB.cfg() && DB.cfg().currency) || 'RD$';
      const n = Number(v || 0);
      return c + ' ' + n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    tz() { return (DB.cfg() && DB.cfg().timezone) || 'America/Santo_Domingo'; },
    parts(d = new Date()) {
      const f = new Intl.DateTimeFormat('en-CA', { timeZone: U.tz(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, weekday: 'short' });
      const o = {}; f.formatToParts(d).forEach(p => o[p.type] = p.value);
      const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[o.weekday];
      const h = o.hour === '24' ? 0 : Number(o.hour);
      return { date: `${o.year}-${o.month}-${o.day}`, h, m: Number(o.minute), s: Number(o.second), wd, mins: h * 60 + Number(o.minute) };
    },
    today() { return U.parts().date; },
    addDays(dateStr, n) {
      const d = new Date(dateStr + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
    },
    dt(ts) {
      if (!ts) return '';
      return new Intl.DateTimeFormat('es-DO', { timeZone: U.tz(), day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(ts));
    },
    time(ts) {
      return new Intl.DateTimeFormat('es-DO', { timeZone: U.tz(), hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(ts));
    },
    hhmm12(hhmm) {
      if (!hhmm) return ''; const [h, m] = hhmm.split(':').map(Number);
      const ap = h >= 12 ? 'PM' : 'AM'; const h12 = ((h + 11) % 12) + 1; return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
    },
    toMins(hhmm) { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return h * 60 + m; },
    /* convierte fecha+hora local de la zona configurada a timestamp */
    zonedTs(dateStr, hhmm) {
      const guess = new Date(`${dateStr}T${hhmm || '00:00'}:00Z`).getTime();
      // offset de la zona en ese instante
      const p = U.parts(new Date(guess));
      const asUTC = Date.UTC(+p.date.slice(0, 4), +p.date.slice(5, 7) - 1, +p.date.slice(8, 10), p.h, p.m, p.s);
      const off = asUTC - guess; return guess - off;
    },
    pad2(n) { return String(n).padStart(2, '0'); },
    am2dec(o) { o = Number(o); if (!o) return 1; return o > 0 ? 1 + o / 100 : 1 + 100 / Math.abs(o); },
    fmtOdds(o) { o = Number(o); if (!o) return '—'; return o > 0 ? '+' + o : String(o); },
    fmtLine(l) { l = Number(l); if (isNaN(l)) return ''; return l > 0 ? '+' + l : String(l); },
    round2(n) { return Math.round(Number(n) * 100) / 100; },
    async sha(s) {
      const b = new TextEncoder().encode(s);
      if (crypto.subtle) { const h = await crypto.subtle.digest('SHA-256', b); return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join(''); }
      let h = 0; for (const c of b) h = (h * 31 + c) | 0; return 'x' + h; // respaldo sin crypto.subtle
    },
    csv(rows) {
      return rows.map(r => r.map(v => { const s = String(v == null ? '' : v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n');
    },
    download(name, text, type = 'text/plain') {
      const blob = new Blob([text], { type }); const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
  };

  /* ---------------- datos semilla ---------------- */
  const DEFAULT_CONFIG = {
    id: 'main',
    company: 'Consorcio BancaRD',
    rnc: '',
    phone: '809-000-0000',
    currency: 'RD$',
    timezone: 'America/Santo_Domingo',
    ticketHeader: '¡Gracias por su jugada!',
    ticketFooter: 'Revise su ticket antes de retirarse. Ticket premiado se paga presentando el original.',
    voidMinutes: 5,          // minutos que el cajero puede anular
    expiryDays: 90,          // días para reclamar premio
    payOnlyIssuingBanca: false,
    requirePinToPay: true,
    closeMinutesDefault: 5,  // cierre antes del sorteo
    pay: { q1: 60, q2: 8, q3: 4, p12: 1000, p13: 1000, p23: 100, t3: 20000, t2: 100, sp: 2000 },
    lotMin: 5,
    maxLine: { Q: 1000, P: 200, T: 50, SP: 200 },
    sports: { minBet: 50, maxBet: 20000, maxPayout: 500000, minParlay: 2, maxParlay: 8, closeMinutes: 0 },
    autoScores: true,
    scoresIntervalSec: 90,
    espnLeagues: ['nba', 'nfl', 'nhl', 'ncaab', 'epl', 'laliga', 'ucl', 'mls', 'mlb'],
    createdAt: Date.now(),
  };

  const LOTTERIES = [
    ['anguila_10', 'Anguila 10AM', '10:00'],
    ['primera_dia', 'La Primera Día', '12:00'],
    ['suerte_md', 'La Suerte MD', '12:30'],
    ['king_dia', 'King Lottery Día', '12:30'],
    ['real', 'Lotería Real', '12:55'],
    ['anguila_1', 'Anguila 1PM', '13:00'],
    ['florida_dia', 'Florida Día', '13:30'],
    ['lotedom', 'LoteDom', '13:55'],
    ['gana_mas', 'Nacional Gana Más', '14:30'],
    ['ny_tarde', 'New York Tarde', '14:30'],
    ['suerte_tarde', 'La Suerte Tarde', '18:00'],
    ['anguila_6', 'Anguila 6PM', '18:00'],
    ['primera_noche', 'La Primera Noche', '19:00'],
    ['king_noche', 'King Lottery Noche', '19:30'],
    ['loteka', 'Loteka', '19:55'],
    ['leidsa', 'Leidsa', '20:55', { 0: '15:55' }],
    ['nacional', 'Lotería Nacional', '21:00', { 0: '18:00' }],
    ['anguila_9', 'Anguila 9PM', '21:00'],
    ['florida_noche', 'Florida Noche', '21:45'],
    ['ny_noche', 'New York Noche', '22:30'],
  ];

  const LEAGUES = [
    ['lidom', 'LIDOM (Béisbol RD)', 'beisbol', ''],
    ['mlb', 'MLB', 'beisbol', 'baseball/mlb'],
    ['nba', 'NBA', 'baloncesto', 'basketball/nba'],
    ['ncaab', 'NCAA Baloncesto', 'baloncesto', 'basketball/mens-college-basketball'],
    ['lnb', 'LNB (Baloncesto RD)', 'baloncesto', ''],
    ['nfl', 'NFL', 'futbol_americano', 'football/nfl'],
    ['ncaaf', 'NCAA Fútbol Americano', 'futbol_americano', 'football/college-football'],
    ['nhl', 'NHL', 'hockey', 'hockey/nhl'],
    ['epl', 'Premier League', 'futbol', 'soccer/eng.1'],
    ['laliga', 'LaLiga', 'futbol', 'soccer/esp.1'],
    ['ucl', 'Champions League', 'futbol', 'soccer/uefa.champions'],
    ['mls', 'MLS', 'futbol', 'soccer/usa.1'],
    ['ufc', 'UFC / Boxeo', 'combate', 'mma/ufc'],
  ];

  const SPORT_NAMES = { beisbol: 'Béisbol', baloncesto: 'Baloncesto', futbol_americano: 'Fútbol Americano', hockey: 'Hockey', futbol: 'Fútbol', combate: 'Combate', otro: 'Otro' };
  const SPORT_ICON = { beisbol: '⚾', baloncesto: '🏀', futbol_americano: '🏈', hockey: '🏒', futbol: '⚽', combate: '🥊', otro: '🎯' };

  async function seed() {
    const now = Date.now();
    DB.put('config', Object.assign({}, DEFAULT_CONFIG));
    DEFAULT_ROLES.forEach(r => DB.put('roles', Object.assign({}, r), { silent: true }));
    const pw = (isServer && global.__ADMIN_PASSWORD) || 'admin123';
    DB.put('users', { id: 'u_admin', username: 'admin', name: 'Administrador', role: 'admin', bancaIds: [], active: true, pass: isServer ? '' : await U.sha('bancard:' + pw), mustChange: true, commission: 0, createdAt: now });
    LOTTERIES.forEach((l, i) => DB.put('lotteries', { id: l[0], name: l[1], time: l[2], dayTimes: l[3] || {}, days: [0, 1, 2, 3, 4, 5, 6], closeMinutes: 5, active: true, order: i, games: { Q: true, P: true, T: true, SP: true } }));
    LEAGUES.forEach((l, i) => DB.put('leagues', { id: l[0], name: l[1], sport: l[2], espn: l[3], active: true, order: i }));
    DB.log('sistema', 'Base de datos inicializada');
  }

  function seedGames() {
    const t = U.today();
    const mk = (league, away, home, dayOff, hhmm, ml, sp, tot) => {
      const date = U.addDays(t, dayOff);
      const g = {
        id: U.uid('g_'), league, away, home, date, time: hhmm, start: U.zonedTs(date, hhmm), status: 'programado',
        scoreAway: null, scoreHome: null, period: '', source: 'manual', demo: true,
        odds: {
          mlAway: ml[0], mlHome: ml[1], mlDraw: ml[2] || null,
          spread: sp[0], spAway: sp[1], spHome: sp[2],
          total: tot[0], over: tot[1], under: tot[2],
        }, updatedAt: Date.now(),
      };
      DB.put('games', g);
    };
    mk('lidom', 'Leones del Escogido', 'Tigres del Licey', 0, '19:15', [115, -135], [1.5, -170, 150], [8.5, -110, -110]);
    mk('lidom', 'Estrellas Orientales', 'Águilas Cibaeñas', 0, '19:15', [130, -150], [1.5, -155, 135], [8, -115, -105]);
    mk('lidom', 'Gigantes del Cibao', 'Toros del Este', 0, '19:15', [-110, -110], [1.5, -190, 165], [7.5, -110, -110]);
    mk('lidom', 'Tigres del Licey', 'Estrellas Orientales', 1, '17:00', [-120, 100], [1.5, 150, -175], [8.5, -105, -115]);
    mk('nba', 'Boston Celtics', 'New York Knicks', 0, '19:30', [-140, 120], [-3.5, -110, -110], [221.5, -110, -110]);
    mk('nba', 'Los Angeles Lakers', 'Denver Nuggets', 0, '22:00', [165, -195], [5, -110, -110], [228.5, -110, -110]);
    mk('nba', 'Miami Heat', 'Philadelphia 76ers', 1, '19:00', [105, -125], [1.5, -110, -110], [214.5, -110, -110]);
    mk('nfl', 'Kansas City Chiefs', 'Buffalo Bills', 2, '20:20', [110, -130], [2.5, -110, -110], [47.5, -110, -110]);
    mk('nhl', 'Toronto Maple Leafs', 'Boston Bruins', 0, '19:00', [-115, -105], [-1.5, 210, -250], [6, -110, -110]);
    mk('epl', 'Arsenal', 'Manchester City', 1, '12:30', [210, 120, 240], [0.5, -105, -115], [2.5, -125, 105]);
    mk('laliga', 'Barcelona', 'Real Madrid', 2, '15:00', [150, 165, 250], [0, -110, -110], [3, -105, -115]);
  }

  /* ---------------- almacén ---------------- */
  const listeners = new Set();
  let state = {};
  let serverMode = false;   // conectado al servidor central seguro
  let isServer = false;     // este código corre DENTRO del servidor (Node)
  let lastSync = 0;
  let pending = [];
  const waiting = {};       // confirmaciones pendientes: 'c/id' -> [resolve, reject]
  const TOKEN_KEY = 'bancard_token_v2';

  const DB = {
    VERSION, COLLS,
    get mode() { return serverMode ? 'servidor' : 'local'; },
    get serverMode() { return serverMode; },
    get isServer() { return isServer; },
    onPut: null,            // gancho usado por el servidor para persistir
    load() {
      if (serverMode || isServer) { state = state && state.users ? state : {}; }
      else { try { state = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { state = {}; } }
      COLLS.forEach(c => { if (!state[c]) state[c] = {}; });
      if (!state.__meta) state.__meta = { lastSync: 0 };
      lastSync = state.__meta.lastSync || 0;
    },
    save() {
      if (serverMode || isServer) return; // en modo servidor la verdad está en el servidor
      state.__meta = { lastSync };
      try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { console.warn('No se pudo guardar', e); }
    },
    isEmpty() { return !Object.keys(state.users || {}).length; },
    all(c) { return Object.values(state[c] || {}).filter(r => !r._deleted); },
    get(c, id) { const r = (state[c] || {})[id]; return r && !r._deleted ? r : null; },
    raw(c, id) { return (state[c] || {})[id] || null; },
    find(c, fn) { return DB.all(c).filter(fn); },
    cfg() { return state.config && state.config.main; },
    put(c, rec, opts = {}) {
      if (!rec.id) rec.id = U.uid();
      rec.updatedAt = Date.now();
      state[c][rec.id] = rec;
      if (DB.onPut) DB.onPut(c, rec);
      if (!opts.silent) { DB.save(); emit(c); }
      if (serverMode && !opts.local) push(c, rec);
      return rec;
    },
    /* el servidor reemplaza un registro con su versión oficial (no se reenvía) */
    setLocal(c, rec, gone, id) {
      if (!state[c]) state[c] = {};
      if (gone) delete state[c][id]; else state[c][rec.id] = rec;
    },
    patch(c, id, changes) { const r = DB.get(c, id); if (!r) return null; return DB.put(c, Object.assign({}, r, changes)); },
    remove(c, id) { const r = state[c][id]; if (!r) return; DB.put(c, { id, _deleted: true, deletedAt: Date.now() }); },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit(c) { emit(c); },
    log(action, detail, extra) {
      const s = Auth.user();
      const rec = { id: U.uid('a_'), at: Date.now(), user: s ? s.username : 'sistema', userId: s ? s.id : '', bancaId: s ? (s.bancaId || '') : '', action, detail: String(detail || '').slice(0, 500), extra: extra || null };
      rec.updatedAt = rec.at; state.audit[rec.id] = rec; if (DB.onPut) DB.onPut('audit', rec); DB.save();
      if (serverMode) push('audit', rec);
    },
    exportJSON() { return JSON.stringify({ app: 'BancaRD', version: VERSION, exportedAt: new Date().toISOString(), data: state }, null, 1); },
    importJSON(text) {
      if (serverMode) throw new Error('En modo servidor los respaldos se hacen en el servidor');
      const o = JSON.parse(text); if (!o || !o.data) throw new Error('Archivo inválido');
      state = o.data; COLLS.forEach(c => { if (!state[c]) state[c] = {}; }); DB.save(); emit('*');
    },
    reset() { localStorage.removeItem(LS_KEY); state = {}; DB.load(); },
    /* usado por el servidor */
    serverBoot(initialState) { isServer = true; state = initialState || {}; COLLS.forEach(c => { if (!state[c]) state[c] = {}; }); },
    state() { return state; },
    async init() {
      if (isServer) { if (DB.isEmpty()) await seed(); migrate(); fillConfig(); return; }
      await detectServer();
      if (serverMode) {
        DB.load();
        if (api.token()) { const ok = await pull(true); if (!ok) api.clear(); }
        if (!DB.cfg()) await loadPublic();
        setInterval(() => { if (api.token()) pull(); }, 6000);
        return;
      }
      DB.load();
      if (DB.isEmpty()) await seed();
      migrate(); fillConfig();
      window.addEventListener('storage', e => { if (e.key === LS_KEY) { DB.load(); emit('*'); } });
    },
    /* espera la respuesta del servidor para un registro (ventas, pagos, anulaciones) */
    confirm(c, id) {
      if (!serverMode) return Promise.resolve(DB.get(c, id));
      return new Promise((res, rej) => { (waiting[c + '/' + id] = waiting[c + '/' + id] || []).push([res, rej]); clearTimeout(push.t); flush(); });
    },
    pull() { return pull(); },
  };
  function fillConfig() {
    if (!DB.cfg()) DB.put('config', Object.assign({}, DEFAULT_CONFIG));
    const cfg = DB.cfg(); let changed = false;
    for (const k in DEFAULT_CONFIG) if (cfg[k] === undefined) { cfg[k] = DEFAULT_CONFIG[k]; changed = true; }
    if (changed) DB.put('config', cfg);
  }

  function emit(c) { listeners.forEach(fn => { try { fn(c); } catch (e) { console.error(e); } }); }

  /* ---------- comunicación con el servidor central ---------- */
  const api = {
    token() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } },
    setToken(t) { sessionStorage.setItem(TOKEN_KEY, t); },
    clear() { try { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(SS_KEY); } catch (e) { } },
    async call(path, body, method) {
      const h = { 'Content-Type': 'application/json' };
      const t = api.token(); if (t) h.Authorization = 'Bearer ' + t;
      try { const b = sessionStorage.getItem('bancard_pos_banca'); if (b) h['X-Banca'] = b; } catch (e) { }
      const r = await fetch('api/' + path, { method: method || (body ? 'POST' : 'GET'), headers: h, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
      let j = null; try { j = await r.json(); } catch (e) { }
      if (r.status === 401 && t) { api.clear(); emit('auth'); }
      if (!r.ok) throw new Error((j && j.error) || ('Error del servidor (' + r.status + ')'));
      return j;
    },
  };
  async function detectServer() {
    if (location.protocol === 'file:') return;
    try {
      const r = await fetch('api/ping', { cache: 'no-store' });
      if (r.ok) { const j = await r.json(); if (j && j.bancard && j.secure) serverMode = true; }
    } catch (e) { /* sin servidor: modo local */ }
  }
  async function loadPublic() {
    try { const j = await api.call('public'); state.config.main = Object.assign({}, DEFAULT_CONFIG, j.config || {}); } catch (e) { state.config.main = Object.assign({}, DEFAULT_CONFIG); }
  }
  async function pull(first) {
    try {
      const j = await api.call('changes?since=' + (first ? 0 : lastSync));
      let n = 0;
      if (first) { const keep = state.config && state.config.main; state = {}; COLLS.forEach(c => state[c] = {}); if (keep) state.config.main = keep; }
      (j.records || []).forEach(({ c, rec }) => { if (!state[c]) state[c] = {}; state[c][rec.id] = rec; n++; });
      lastSync = j.now || Date.now();
      if (n || first) emit('*');
      flush();
      return true;
    } catch (e) { return false; }
  }
  function push(c, rec) { pending.push({ c, rec }); clearTimeout(push.t); push.t = setTimeout(flush, 250); }
  let flushing = false;
  async function flush() {
    if (flushing) { setTimeout(flush, 200); return; }
    if (!pending.length || !api.token()) return;
    flushing = true; const batch = pending.splice(0, 300);
    try {
      const j = await api.call('put', { records: batch });
      // versiones oficiales devueltas por el servidor
      (j.records || []).forEach(x => DB.setLocal(x.c, x.rec, x.gone, x.id));
      const errs = [];
      (j.results || []).forEach(r => {
        const k = r.c + '/' + r.id; const w = waiting[k]; delete waiting[k];
        if (r.ok) (w || []).forEach(([res]) => res(DB.get(r.c, r.id)));
        else { (w || []).forEach(([, rej]) => rej(new Error(r.error))); if (!w && !r.silent) errs.push(r.error); }
      });
      if (errs.length && UI && UI.toast) UI.toast([...new Set(errs)].join(' · '), 'bad', 6000);
      emit('*');
    } catch (e) {
      // sin conexión: rechaza confirmaciones (no se entrega un ticket sin servidor) y reintenta lo demás
      const crit = new Set(['tickets', 'shifts']);
      batch.forEach(x => { const k = x.c + '/' + x.rec.id; const w = waiting[k]; if (w) { delete waiting[k]; w.forEach(([, rej]) => rej(new Error('Sin conexión con el servidor: ' + e.message))); DB.setLocal(x.c, null, true, x.rec.id); } else if (!crit.has(x.c)) pending.push(x); });
      setTimeout(flush, 5000); emit('*');
    } finally { flushing = false; }
  }

  /* ---------------- autenticación, roles y permisos ---------------- */
  /* Catálogo de permisos (agrupados para la pantalla de roles) */
  const PERMS = [
    ['Venta', [['pos', 'Usar la app de venta (vender, pagar, cuadre)'], ['pos.multi', 'Vender en cualquiera de sus bancas asignadas']]],
    ['Panel', [['dashboard', 'Ver dashboard de sus bancas'], ['tickets.view', 'Ver tickets'], ['tickets.void', 'Anular tickets pendientes (cualquier vendedor)'], ['tickets.void_late', 'Anular después del cierre del sorteo'], ['tickets.pay', 'Pagar sin PIN / marcar pagado desde el panel'], ['reports', 'Ver reportes de ventas'], ['shifts.view', 'Ver cuadres y turnos'], ['shifts.close', 'Forzar cierre de turnos'], ['audit.view', 'Ver auditoría']]],
    ['Operación', [['results', 'Ingresar / corregir resultados de lotería'], ['games', 'Gestionar juegos, líneas y marcadores'], ['limits', 'Topes y bloqueos de números'], ['lotteries', 'Loterías y horarios']]],
    ['Puntos de venta y staff', [['bancas.view', 'Ver bancas'], ['bancas.edit', 'Crear / editar / suspender bancas'], ['staff.view', 'Ver staff'], ['staff.edit', 'Crear / editar staff y claves'], ['roles', 'Administrar roles y permisos']]],
    ['Inventario', [['inventory.view', 'Ver existencias'], ['inventory.use', 'Registrar consumo en su banca'], ['inventory.edit', 'Catálogo, entradas y ajustes de inventario'], ['requests.create', 'Pedir material'], ['requests.approve', 'Aprobar, rechazar y despachar pedidos']]],
    ['Soporte', [['issues.create', 'Reportar errores / problemas'], ['issues.manage', 'Gestionar reportes (asignar, resolver)'], ['syserrors', 'Ver errores técnicos del sistema']]],
    ['Sistema', [['config', 'Configuración general, premios y respaldo']]],
  ];
  const ALL_PERMS = PERMS.flatMap(g => g[1].map(p => p[0]));
  const DEFAULT_ROLES = [
    { id: 'admin', name: 'Administrador', scope: 'all', perms: ['*'], system: true, order: 0, desc: 'Dueño del consorcio: acceso total.' },
    { id: 'supervisor', name: 'Supervisor', scope: 'assigned', order: 1, desc: 'Supervisa sus bancas asignadas, aprueba pedidos y atiende reportes.',
      perms: ['pos', 'pos.multi', 'dashboard', 'tickets.view', 'tickets.void', 'reports', 'shifts.view', 'shifts.close', 'audit.view', 'limits', 'bancas.view', 'staff.view', 'inventory.view', 'inventory.use', 'requests.create', 'requests.approve', 'issues.create', 'issues.manage'] },
    { id: 'operador', name: 'Operador central', scope: 'all', order: 2, desc: 'Oficina central: resultados, líneas y topes.',
      perms: ['dashboard', 'tickets.view', 'results', 'games', 'limits', 'issues.create', 'issues.manage', 'syserrors'] },
    { id: 'encargado', name: 'Encargado de banca', scope: 'assigned', order: 3, desc: 'Responsable de una o varias bancas: ve sus ventas, cuadres e inventario.',
      perms: ['pos', 'pos.multi', 'dashboard', 'tickets.view', 'reports', 'shifts.view', 'inventory.view', 'inventory.use', 'requests.create', 'issues.create'] },
    { id: 'cajero', name: 'Cajero / Vendedor', scope: 'assigned', order: 4, desc: 'Vende en su banca, ve su existencia, pide material y reporta errores.',
      perms: ['pos', 'inventory.view', 'inventory.use', 'requests.create', 'issues.create'] },
  ];
  const CONTROL_PERMS = ALL_PERMS.filter(p => !['pos', 'pos.multi', 'inventory.view', 'inventory.use', 'requests.create', 'issues.create', 'tickets.void_late', 'tickets.pay'].includes(p));
  const POS_KEY = 'bancard_pos_banca';

  const Auth = {
    PERMS, ALL_PERMS, DEFAULT_ROLES,
    role(u) { return DB.get('roles', u && u.role) || { id: u && u.role, name: u && u.role, perms: [], scope: 'assigned' }; },
    roleName(u) { return Auth.role(u).name; },
    /* usuario en sesión (copia), con bancaIds normalizado y bancaId = banca activa en la venta */
    user() {
      try {
        const s = JSON.parse(sessionStorage.getItem(SS_KEY) || 'null'); if (!s) return null;
        const r = DB.get('users', s.id); if (!r || !r.active) return null;
        const u = Object.assign({}, r); u.bancaIds = Auth.userBancas(r);
        const cur = sessionStorage.getItem(POS_KEY);
        const allowed = Auth.allBancas(u) ? DB.all('bancas').map(b => b.id) : u.bancaIds;
        u.bancaId = cur && allowed.includes(cur) ? cur : (u.bancaIds.length === 1 ? u.bancaIds[0] : '');
        return u;
      } catch (e) { return null; }
    },
    userBancas(u) { return Array.isArray(u.bancaIds) ? u.bancaIds.slice() : (u.bancaId ? [u.bancaId] : []); },
    allBancas(u) { u = u || Auth.user(); return !!u && Auth.role(u).scope === 'all'; },
    /* ids de bancas que el usuario puede ver; null = todas */
    scope(u) { u = u || Auth.user(); if (!u) return []; return Auth.allBancas(u) ? null : Auth.userBancas(u); },
    sees(bancaId, u) { const sc = Auth.scope(u); return sc === null || sc.includes(bancaId); },
    bancas(u) { const sc = Auth.scope(u); return DB.all('bancas').filter(b => sc === null || sc.includes(b.id)).sort((a, b) => a.code.localeCompare(b.code)); },
    setPosBanca(id) { if (id) sessionStorage.setItem(POS_KEY, id); else sessionStorage.removeItem(POS_KEY); },
    hasControl(u) { const r = Auth.role(u); return r.perms.includes('*') || r.perms.some(p => CONTROL_PERMS.includes(p)); },
    hasPos(u) { return Auth.can('pos', u); },
    async login(username, password) {
      if (serverMode) {
        const j = await api.call('login', { username, password });
        api.setToken(j.token); sessionStorage.setItem(SS_KEY, JSON.stringify({ id: j.user.id, at: Date.now() })); sessionStorage.removeItem(POS_KEY);
        await pull(true);
        return DB.get('users', j.user.id);
      }
      username = String(username || '').trim().toLowerCase();
      const u = DB.all('users').find(x => x.username.toLowerCase() === username);
      if (!u) throw new Error('Usuario o contraseña incorrectos');
      if (!u.active) throw new Error('Usuario desactivado. Contacte al administrador.');
      if (u.lockedUntil && u.lockedUntil > Date.now()) throw new Error('Usuario bloqueado temporalmente por intentos fallidos. Intente en unos minutos.');
      const h = await U.sha('bancard:' + password);
      if (h !== u.pass) {
        const fails = (u.fails || 0) + 1; const ch = { fails };
        if (fails >= 5) { ch.lockedUntil = Date.now() + 10 * 60000; ch.fails = 0; }
        DB.patch('users', u.id, ch); DB.log('login.fallido', u.username);
        throw new Error('Usuario o contraseña incorrectos');
      }
      const ids = Auth.userBancas(u);
      if (Auth.role(u).scope !== 'all' && ids.length && ids.every(id => { const b = DB.get('bancas', id); return b && b.status !== 'activa'; }))
        throw new Error('Sus bancas asignadas están suspendidas.');
      DB.patch('users', u.id, { fails: 0, lockedUntil: 0, lastLogin: Date.now() });
      sessionStorage.setItem(SS_KEY, JSON.stringify({ id: u.id, at: Date.now() }));
      sessionStorage.removeItem(POS_KEY);
      DB.log('login', u.username);
      return DB.get('users', u.id);
    },
    logout() { const u = Auth.user(); if (serverMode) { api.call('logout', {}).catch(() => { }); api.clear(); } else if (u) DB.log('logout', u.username); sessionStorage.removeItem(SS_KEY); sessionStorage.removeItem(POS_KEY); },
    async setPassword(userId, pw) {
      if (serverMode) { await new Promise(r => { clearTimeout(push.t); flush().then(r, r); }); await api.call('password', { userId, password: pw }); await pull(); return; }
      DB.patch('users', userId, { pass: await U.sha('bancard:' + pw), mustChange: false });
    },
    can(perm, u) {
      u = u || Auth.user(); if (!u) return false; const r = Auth.role(u);
      return r.perms.includes('*') || r.perms.includes(perm);
    },
  };

  /* migración de datos de la versión 1.0 */
  function migrate() {
    if (serverMode) return;
    if (!DB.all('roles').length) DEFAULT_ROLES.forEach(r => DB.put('roles', Object.assign({}, r), { silent: true }));
    DB.all('users').forEach(u => {
      if (!Array.isArray(u.bancaIds)) { const x = Object.assign({}, u, { bancaIds: u.bancaId ? [u.bancaId] : (u.role === 'supervisor' ? DB.all('bancas').map(b => b.id) : []) }); delete x.bancaId; DB.put('users', x, { silent: true }); }
    });
    if (!DB.get('locations', 'central')) DB.put('locations', { id: 'central', name: 'Almacén central' }, { silent: true });
    if (!DB.all('items').length) seedItems();
    DB.save();
  }
  function seedItems() {
    const items = [
      ['papel80', 'Rollo papel térmico 80mm', 'Papelería', 'rollo', 6, 60],
      ['papel58', 'Rollo papel térmico 58mm', 'Papelería', 'rollo', 0, 0],
      ['talon', 'Talonario de recibos', 'Papelería', 'unidad', 1, 10],
      ['boligrafo', 'Bolígrafos', 'Oficina', 'unidad', 3, 30],
      ['funda', 'Fundas para premios', 'Oficina', 'paquete', 1, 10],
      ['pizarra', 'Marcadores de pizarra', 'Oficina', 'unidad', 2, 20],
      ['limpieza', 'Desinfectante / limpieza', 'Limpieza', 'unidad', 1, 10],
      ['bateria', 'Baterías AA (UPS / control)', 'Equipos', 'paquete', 1, 10],
      ['cable', 'Cable USB impresora', 'Equipos', 'unidad', 0, 3],
      ['cartel', 'Cartel de resultados', 'Publicidad', 'unidad', 1, 10],
    ];
    items.forEach(([id, name, category, unit, minBanca, minCentral]) => DB.put('items', { id, name, category, unit, minBanca, minCentral, active: true }, { silent: true }));
  }

  /* ---------------- inventario ---------------- */
  const Inv = {
    TYPES: { entrada: 'Entrada (compra)', despacho: 'Despacho a banca', recepcion: 'Recibido en banca', transferencia: 'Transferencia', consumo: 'Consumo / uso', ajuste: 'Ajuste de conteo', devolucion: 'Devolución' },
    locName(id) { return id === 'central' ? 'Almacén central' : ((DB.get('bancas', id) || {}).name || id); },
    qty(loc, itemId) { const r = DB.get('stock', loc + ':' + itemId); return r ? Number(r.qty) : 0; },
    min(loc, item) { return loc === 'central' ? Number(item.minCentral || 0) : Number(item.minBanca || 0); },
    add(loc, itemId, delta, silent) {
      const id = loc + ':' + itemId; const cur = DB.get('stock', id) || { id, loc, itemId, qty: 0 };
      DB.put('stock', Object.assign({}, cur, { qty: U.round2(Number(cur.qty) + Number(delta)) }), { silent });
    },
    /* mueve inventario y deja el movimiento registrado */
    move({ type, itemId, qty, from, to, note, ref, silent }) {
      qty = Number(qty); if (!(qty > 0) && type !== 'ajuste') throw new Error('Cantidad inválida');
      const it = DB.get('items', itemId); if (!it) throw new Error('Artículo no existe');
      if (from && type !== 'ajuste' && Inv.qty(from, itemId) < qty) throw new Error(`No hay suficiente ${it.name} en ${Inv.locName(from)} (hay ${Inv.qty(from, itemId)})`);
      if (from) Inv.add(from, itemId, -qty, true);
      if (to) Inv.add(to, itemId, qty, true);
      const u = Auth.user();
      DB.put('movements', { id: U.uid('m_'), at: Date.now(), type, itemId, qty, from: from || '', to: to || '', note: note || '', ref: ref || '', by: u ? u.username : 'sistema' }, { silent: true });
      if (!silent) { DB.save(); emit('stock'); }
    },
    /* ajuste a conteo físico */
    setCount(loc, itemId, counted, note) {
      const diff = U.round2(Number(counted) - Inv.qty(loc, itemId)); if (!diff) return 0;
      Inv.add(loc, itemId, diff, true);
      const u = Auth.user();
      DB.put('movements', { id: U.uid('m_'), at: Date.now(), type: 'ajuste', itemId, qty: diff, from: '', to: loc, note: note || 'Conteo físico', by: u ? u.username : '' }, { silent: true });
      DB.save(); emit('stock'); return diff;
    },
    lowAt(loc) { return DB.all('items').filter(i => i.active !== false && Inv.min(loc, i) > 0 && Inv.qty(loc, i.id) <= Inv.min(loc, i)); },
    inTransit(bancaId, itemId) {
      return DB.all('requests').filter(r => r.bancaId === bancaId && r.status === 'despachado').reduce((a, r) => a + r.lines.filter(l => l.itemId === itemId).reduce((x, l) => x + Number(l.qtySent || 0), 0), 0);
    },
  };

  /* ---------------- pedidos de material ---------------- */
  const REQ_STATUS = { pendiente: ['Pendiente', 'b-warn'], aprobado: ['Aprobado', 'b-info'], despachado: ['Despachado', 'b-info'], recibido: ['Recibido', 'b-ok'], rechazado: ['Rechazado', 'b-bad'], cancelado: ['Cancelado', 'b-mute'] };
  const Requests = {
    STATUS: REQ_STATUS,
    badge(s) { const x = REQ_STATUS[s] || [s, '']; return `<span class="badge ${x[1]}">${x[0]}</span>`; },
    nextCode() { const n = DB.all('requests').length + 1; return 'PED-' + String(n).padStart(4, '0') + '-' + U.code(3); },
    create({ bancaId, lines, note, priority }) {
      const u = Auth.user(); if (!lines.length) throw new Error('Agregue al menos un artículo');
      const r = { id: U.uid('r_'), code: Requests.nextCode(), bancaId, by: u.username, byName: u.name, at: Date.now(), lines: lines.map(l => ({ itemId: l.itemId, qty: Number(l.qty), qtySent: 0 })), note: note || '', priority: priority || 'normal', status: 'pendiente', history: [{ at: Date.now(), by: u.username, status: 'pendiente', note: note || '' }] };
      DB.put('requests', r); DB.log('pedido.creado', `${r.code} ${Inv.locName(bancaId)}`); return r;
    },
    setStatus(r, status, note, extra) {
      const u = Auth.user();
      const upd = Object.assign({}, r, extra || {}, { status, history: (r.history || []).concat([{ at: Date.now(), by: u.username, status, note: note || '' }]) });
      DB.put('requests', upd); DB.log('pedido.' + status, `${r.code} ${note || ''}`); return upd;
    },
    dispatch(r, sent, note) {
      // sent: {itemId: qty}; descuenta del almacén central
      const lines = r.lines.map(l => Object.assign({}, l, { qtySent: Number(sent[l.itemId] ?? l.qty) }));
      for (const l of lines) if (l.qtySent > 0 && Inv.qty('central', l.itemId) < l.qtySent) throw new Error(`Almacén sin existencia suficiente de ${(DB.get('items', l.itemId) || {}).name}`);
      lines.forEach(l => { if (l.qtySent > 0) Inv.move({ type: 'despacho', itemId: l.itemId, qty: l.qtySent, from: 'central', note: 'En tránsito a ' + Inv.locName(r.bancaId), ref: r.code, silent: true }); });
      DB.save(); return Requests.setStatus(r, 'despachado', note, { lines, dispatchedAt: Date.now() });
    },
    receive(r, note) {
      r.lines.forEach(l => { if (l.qtySent > 0) Inv.move({ type: 'recepcion', itemId: l.itemId, qty: l.qtySent, to: r.bancaId, ref: r.code, silent: true }); });
      DB.save(); return Requests.setStatus(r, 'recibido', note, { receivedAt: Date.now() });
    },
  };

  /* ---------------- reportes de errores / soporte ---------------- */
  const ISSUE_CATS = { impresora: '🖨️ Impresora / papel', sistema: '💻 Sistema / app', internet: '🌐 Internet / conexión', ticket: '🧾 Ticket o premio', caja: '💰 Caja / cuadre', lineas: '🏟️ Líneas o resultados', local: '🏪 Local / equipo', otro: '❓ Otro' };
  const ISSUE_PRI = { baja: ['Baja', 'b-mute'], media: ['Media', 'b-info'], alta: ['Alta', 'b-warn'], urgente: ['Urgente', 'b-bad'] };
  const ISSUE_ST = { abierto: ['Abierto', 'b-warn'], en_proceso: ['En proceso', 'b-info'], resuelto: ['Resuelto', 'b-ok'], cerrado: ['Cerrado', 'b-mute'] };
  const Issues = {
    CATS: ISSUE_CATS, PRI: ISSUE_PRI, ST: ISSUE_ST,
    badge(map, k) { const x = map[k] || [k, '']; return `<span class="badge ${x[1]}">${x[0]}</span>`; },
    create(d) {
      const u = Auth.user(); const n = DB.all('issues').length + 1;
      const r = Object.assign({ id: U.uid('i_'), code: 'ERR-' + String(n).padStart(4, '0'), by: u.username, byName: u.name, at: Date.now(), status: 'abierto', comments: [], assignedTo: '' }, d);
      DB.put('issues', r); DB.log('error.reportado', `${r.code} ${r.title}`); return r;
    },
    comment(r, text, status) {
      const u = Auth.user(); const c = { at: Date.now(), by: u.username, byName: u.name, text: text || '' };
      if (status && status !== r.status) c.status = status;
      const upd = Object.assign({}, r, { comments: (r.comments || []).concat(text || status ? [c] : []) });
      if (status) { upd.status = status; if (status === 'resuelto') upd.resolvedAt = Date.now(); }
      DB.put('issues', upd); DB.log('error.actualizado', `${r.code} ${status || ''}`); return upd;
    },
    /* foto: reduce a máx. 1000px JPEG para no llenar el almacenamiento */
    async compress(file) {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
      const k = Math.min(1, 1000 / Math.max(img.width, img.height)); const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.7);
    },
  };

  /* errores técnicos automáticos (se ven en Soporte › Errores del sistema) */
  function captureErrors(app) {
    const rec = (msg, src) => {
      try {
        msg = String(msg || '').slice(0, 300); if (!msg || /ResizeObserver|Script error/.test(msg)) return;
        const key = (app + '|' + msg).replace(/[^\w]/g, '').slice(0, 80);
        const cur = DB.get('syserrors', key); const u = Auth.user();
        DB.put('syserrors', { id: key, app, msg, src: String(src || '').slice(0, 300), count: (cur ? cur.count : 0) + 1, first: cur ? cur.first : Date.now(), last: Date.now(), user: u ? u.username : '', ua: navigator.userAgent.slice(0, 120), resolved: false });
      } catch (e) { /* nunca romper la app por registrar */ }
    };
    window.addEventListener('error', e => rec(e.message, (e.filename || '') + ':' + (e.lineno || '')));
    window.addEventListener('unhandledrejection', e => rec(e.reason && (e.reason.stack || e.reason.message) || e.reason, 'promise'));
  }

  /* ---------------- loterías: horarios y cierres ---------------- */
  const Lot = {
    list() { return DB.all('lotteries').sort((a, b) => U.toMins(Lot.timeFor(a)) - U.toMins(Lot.timeFor(b)) || a.order - b.order); },
    timeFor(l, date) {
      const wd = date ? new Date(date + 'T12:00:00Z').getUTCDay() : U.parts().wd;
      return (l.dayTimes && l.dayTimes[wd]) || l.time;
    },
    playsOn(l, date) { const wd = new Date(date + 'T12:00:00Z').getUTCDay(); return l.active && (!l.days || l.days.includes(wd)); },
    closeMins(l) { const c = DB.cfg(); return l.closeMinutes != null ? Number(l.closeMinutes) : c.closeMinutesDefault; },
    /* estado para hoy: abierta | cerrada | no_juega */
    status(l) {
      const p = U.parts(); const date = p.date;
      if (!Lot.playsOn(l, date)) return { open: false, label: 'No juega hoy' };
      if (DB.get('results', l.id + '_' + date)) return { open: false, label: 'Sorteo realizado' };
      const closeAt = U.toMins(Lot.timeFor(l, date)) - Lot.closeMins(l);
      const left = closeAt - p.mins;
      if (left <= 0) return { open: false, label: 'Cerrada' };
      return { open: true, left, label: left < 60 ? `Cierra en ${left} min` : `Cierra ${U.hhmm12(Math.floor(closeAt / 60) + ':' + U.pad2(closeAt % 60))}` };
    },
    name(id) { const l = DB.get('lotteries', id); return l ? l.name : id; },
  };

  /* jugadas de lotería */
  const KIND_NAMES = { Q: 'Quiniela', P: 'Palé', T: 'Tripleta', SP: 'Super Palé' };
  function parsePlay(raw) {
    const s = String(raw || '').replace(/[^0-9]/g, '');
    if (s.length === 2) return { kind: 'Q', nums: [s] };
    if (s.length === 4) return { kind: 'P', nums: [s.slice(0, 2), s.slice(2)] };
    if (s.length === 6) return { kind: 'T', nums: [s.slice(0, 2), s.slice(2, 4), s.slice(4)] };
    return null;
  }

  /* suma vendida de un número hoy (para topes) */
  function soldOf(lot, kind, nums, date, bancaId) {
    const key = [...nums].sort().join('-'); let sum = 0;
    DB.all('tickets').forEach(t => {
      if (t.type !== 'loteria' || t.date !== date || t.status === 'anulado') return;
      if (bancaId && t.bancaId !== bancaId) return;
      t.lines.forEach(l => {
        if (l.kind !== kind) return;
        const lots = kind === 'SP' ? [l.lot, l.lot2].sort().join('+') : l.lot;
        if (lots !== lot) return;
        if ([...l.nums].sort().join('-') === key) sum += Number(l.amount);
      });
    });
    return sum;
  }

  function validateLotteryLine(line, bancaId, ctx = []) {
    const cfg = DB.cfg(); const date = U.today();
    const lotIds = line.kind === 'SP' ? [line.lot, line.lot2] : [line.lot];
    for (const id of lotIds) {
      const l = DB.get('lotteries', id); if (!l) return 'Lotería no existe';
      const st = Lot.status(l); if (!st.open) return `${l.name}: ${st.label}`;
      if (l.games && l.games[line.kind] === false) return `${l.name} no acepta ${KIND_NAMES[line.kind]}`;
    }
    if (line.kind === 'SP' && line.lot === line.lot2) return 'Super Palé requiere dos loterías distintas';
    if (new Set(line.nums).size !== line.nums.length && line.kind !== 'Q') return 'Los números de la jugada no pueden repetirse';
    const amt = Number(line.amount);
    if (!(amt > 0)) return 'Monto inválido';
    if (amt < (cfg.lotMin || 1)) return `Monto mínimo ${U.money(cfg.lotMin)}`;
    const ml = cfg.maxLine && cfg.maxLine[line.kind];
    if (ml && amt > ml) return `Máximo por jugada de ${KIND_NAMES[line.kind]}: ${U.money(ml)}`;
    const lotKey = line.kind === 'SP' ? [line.lot, line.lot2].sort().join('+') : line.lot;
    const key = [...line.nums].sort().join('-');
    const inCtx = ctx.filter(x => x.kind === line.kind && (x.kind === 'SP' ? [x.lot, x.lot2].sort().join('+') : x.lot) === lotKey && [...x.nums].sort().join('-') === key).reduce((a, x) => a + Number(x.amount), 0);
    // topes y bloqueos
    const rules = DB.all('limits').filter(r => r.active !== false && (r.kind === line.kind || r.kind === '*') &&
      (r.lot === '*' || lotIds.includes(r.lot)) && (r.num === '*' || [...String(r.num).split('-')].sort().join('-') === key || (line.nums.includes(r.num) && line.kind === 'Q')));
    for (const r of rules) {
      if (r.scope !== 'global' && r.scope !== bancaId) continue;
      if (r.blocked) return `Número ${line.nums.join('-')} bloqueado${r.note ? ': ' + r.note : ''}`;
      const sold = soldOf(lotKey, line.kind, line.nums, date, r.scope === 'global' ? null : bancaId);
      const avail = Number(r.max) - sold - inCtx;
      if (amt > avail) return `Tope alcanzado para ${line.nums.join('-')} (${lotIds.map(Lot.name).join(' / ')}). Disponible: ${U.money(Math.max(0, avail))}`;
    }
    return null;
  }

  /* ---------------- deportes ---------------- */
  const Sports = {
    SPORT_NAMES, SPORT_ICON,
    league(id) { return DB.get('leagues', id); },
    sportOf(g) { const l = DB.get('leagues', g.league); return l ? l.sport : 'otro'; },
    isOpen(g) {
      if (g.status !== 'programado') return false;
      const c = DB.cfg().sports.closeMinutes || 0;
      return Date.now() < (g.start - c * 60000);
    },
    marketLabel(g, m, side, line) {
      if (m === 'ml') return (side === 'home' ? g.home : side === 'away' ? g.away : 'Empate') + ' (Ganador)';
      if (m === 'rl') return (side === 'home' ? g.home : g.away) + ' ' + U.fmtLine(line);
      if (m === 'tot') return (side === 'over' ? 'Más de ' : 'Menos de ') + line;
      return m;
    },
    /* devuelve 'win' | 'lose' | 'push' | null */
    gradeLeg(leg) {
      const g = DB.get('games', leg.gameId);
      if (!g) return 'push';
      if (g.status === 'suspendido' || g.status === 'cancelado') return 'push';
      if (g.status !== 'final') return null;
      const a = Number(g.scoreAway), h = Number(g.scoreHome);
      if (isNaN(a) || isNaN(h)) return null;
      if (leg.market === 'ml') {
        if (leg.side === 'draw') return a === h ? 'win' : 'lose';
        if (a === h) return Sports.sportOf(g) === 'futbol' ? 'lose' : 'push';
        return (leg.side === 'home' ? h > a : a > h) ? 'win' : 'lose';
      }
      if (leg.market === 'rl') {
        const mine = leg.side === 'home' ? h : a, other = leg.side === 'home' ? a : h;
        const d = mine + Number(leg.line) - other; return d > 0 ? 'win' : d < 0 ? 'lose' : 'push';
      }
      if (leg.market === 'tot') {
        const t = a + h, L = Number(leg.line);
        if (t === L) return 'push'; return (leg.side === 'over' ? t > L : t < L) ? 'win' : 'lose';
      }
      return null;
    },
    potential(bet) {
      const dec = bet.legs.reduce((p, l) => p * U.am2dec(l.odds), 1);
      const cap = DB.cfg().sports.maxPayout || Infinity;
      return Math.min(U.round2(bet.amount * dec), cap);
    },
  };

  /* ---------------- calificación de tickets ---------------- */
  function gradeLotteryLine(l, date) {
    const pay = DB.cfg().pay;
    if (l.kind === 'SP') {
      const r1 = DB.get('results', l.lot + '_' + date), r2 = DB.get('results', l.lot2 + '_' + date);
      if (!r1 || !r2) return null;
      const [a, b] = l.nums;
      const win = (r1.n1 === a && r2.n1 === b) || (r1.n1 === b && r2.n1 === a);
      return win ? { result: 'win', prize: U.round2(l.amount * pay.sp) } : { result: 'lose', prize: 0 };
    }
    const r = DB.get('results', l.lot + '_' + date);
    if (!r) return null;
    const pos = n => [r.n1, r.n2, r.n3].indexOf(n); // 0,1,2 o -1
    if (l.kind === 'Q') {
      const n = l.nums[0]; let prize = 0;
      if (r.n1 === n) prize += l.amount * pay.q1;
      if (r.n2 === n) prize += l.amount * pay.q2;
      if (r.n3 === n) prize += l.amount * pay.q3;
      return prize > 0 ? { result: 'win', prize: U.round2(prize) } : { result: 'lose', prize: 0 };
    }
    if (l.kind === 'P') {
      const [x, y] = l.nums; const px = pos(x), py = pos(y);
      if (px < 0 || py < 0 || px === py) return { result: 'lose', prize: 0 };
      const pr = [px, py].sort().join('');
      const mult = pr === '01' ? pay.p12 : pr === '02' ? pay.p13 : pay.p23;
      return { result: 'win', prize: U.round2(l.amount * mult) };
    }
    if (l.kind === 'T') {
      const hits = new Set(l.nums.filter(n => pos(n) >= 0)).size;
      if (hits === 3) return { result: 'win', prize: U.round2(l.amount * pay.t3) };
      if (hits === 2) return { result: 'win', prize: U.round2(l.amount * pay.t2) };
      return { result: 'lose', prize: 0 };
    }
    return null;
  }

  function gradeTicket(t) {
    if (serverMode) return false; // en modo servidor califica el servidor
    if (t.status !== 'pendiente') return false;
    let decided = true, prize = 0, any = false, changed = false;
    const lines = t.lines.map(l => {
      if (l.result) { if (l.result === 'win' || l.result === 'push') { prize += l.prize; any = true; } return l; }
      let g = null;
      if (t.type === 'loteria') g = gradeLotteryLine(l, t.date);
      else {
        const res = l.legs.map(Sports.gradeLeg);
        if (res.includes('lose')) g = { result: 'lose', prize: 0 };
        else if (res.includes(null)) g = null;
        else {
          const live = l.legs.filter((x, i) => res[i] === 'win');
          if (!live.length) g = { result: 'push', prize: U.round2(l.amount) }; // todo empate: devolución
          else {
            const dec = live.reduce((p, x) => p * U.am2dec(x.odds), 1);
            const cap = DB.cfg().sports.maxPayout || Infinity;
            g = { result: 'win', prize: Math.min(U.round2(l.amount * dec), cap) };
          }
        }
      }
      if (!g) { decided = false; return l; }
      changed = true;
      if (g.result !== 'lose') { prize += g.prize; any = true; }
      return Object.assign({}, l, g);
    });
    if (!changed && !decided) return false;
    const upd = { lines };
    if (decided) { upd.status = any ? 'ganador' : 'perdedor'; upd.prize = U.round2(prize); upd.gradedAt = Date.now(); }
    DB.put('tickets', Object.assign({}, t, upd), { silent: true });
    return true;
  }

  function gradeAll() {
    if (serverMode) return 0;
    let n = 0; const cfg = DB.cfg(); const now = Date.now();
    DB.all('tickets').forEach(t => {
      if (gradeTicket(t)) n++;
      const cur = DB.get('tickets', t.id);
      if (cur.status === 'ganador' && cfg.expiryDays && now - cur.createdAt > cfg.expiryDays * 86400000) {
        DB.put('tickets', Object.assign({}, cur, { status: 'caducado' }), { silent: true }); n++;
      }
    });
    if (n) { DB.save(); emit('tickets'); }
    return n;
  }

  /* ---------------- tickets ---------------- */
  const Tickets = {
    nextSerial(bancaId) {
      if (serverMode) return 0; // lo asigna el servidor
      const b = DB.get('bancas', bancaId); const n = (b && b.serial || 0) + 1;
      if (b) DB.put('bancas', Object.assign({}, b, { serial: n }), { silent: true });
      return n;
    },
    create({ type, lines, user, shift }) {
      const b = DB.get('bancas', user.bancaId);
      const code = (b ? b.code : 'X') + '-' + U.code(8);
      const total = U.round2(lines.reduce((a, l) => a + Number(l.amount), 0));
      if (b && b.dailyLimit) {
        const sold = DB.all('tickets').filter(t => t.bancaId === b.id && t.date === U.today() && t.status !== 'anulado').reduce((a, t) => a + t.total, 0);
        if (sold + total > b.dailyLimit) throw new Error('La banca alcanzó su límite de venta diario (' + U.money(b.dailyLimit) + ')');
      }
      const t = {
        id: U.uid('t_'), code, pin: U.pin(), serial: Tickets.nextSerial(user.bancaId), type, lines,
        total, prize: 0, status: 'pendiente', bancaId: user.bancaId, userId: user.id, userName: user.name,
        shiftId: shift ? shift.id : '', date: U.today(), createdAt: Date.now(),
      };
      if (type === 'deporte') t.potential = U.round2(lines.reduce((a, l) => a + Sports.potential(l), 0));
      DB.put('tickets', t);
      DB.log('ticket.venta', `${t.code} ${U.money(t.total)}`);
      return t;
    },
    async lookup(code) {
      let t = Tickets.byCode(code); if (t || !serverMode) return t;
      try { const j = await api.call('ticket?code=' + encodeURIComponent(String(code).trim().toUpperCase())); if (j && j.ticket) { DB.setLocal('tickets', j.ticket); return j.ticket; } } catch (e) { }
      return null;
    },
    byCode(code) {
      code = String(code || '').trim().toUpperCase();
      return DB.all('tickets').find(t => t.code === code || t.code.endsWith('-' + code));
    },
    canVoid(t, u) {
      if (t.status !== 'pendiente') return 'Solo se anulan tickets pendientes';
      const cfg = DB.cfg();
      // algún sorteo/juego ya cerrado
      if (t.type === 'loteria') {
        for (const l of t.lines) for (const id of [l.lot, l.lot2].filter(Boolean)) {
          const lot = DB.get('lotteries', id); if (t.date !== U.today() || (lot && !Lot.status(lot).open)) { if (u.role !== 'admin') return 'El sorteo ya cerró'; }
        }
      } else {
        for (const l of t.lines) for (const leg of l.legs) { const g = DB.get('games', leg.gameId); if (g && !Sports.isOpen(g) && !Auth.can('tickets.void_late', u)) return 'Un juego ya comenzó'; }
      }
      if (!Auth.sees(t.bancaId, u)) return 'Ticket de otra banca';
      if (!Auth.can('tickets.void', u)) {
        if (t.userId !== u.id) return 'Solo puede anular sus propios tickets';
        if (Date.now() - t.createdAt > cfg.voidMinutes * 60000) return `Tiempo de anulación vencido (${cfg.voidMinutes} min). Solicite a un supervisor.`;
      }
      return null;
    },
    void(t, u, reason) {
      const err = Tickets.canVoid(t, u); if (err) throw new Error(err);
      DB.put('tickets', Object.assign({}, t, { status: 'anulado', voidAt: Date.now(), voidBy: u.username, voidReason: reason || '' }));
      DB.log('ticket.anulado', `${t.code} ${reason || ''}`);
    },
    pay(t, u, pin, shift) {
      gradeTicket(t); t = DB.get('tickets', t.id);
      const cfg = DB.cfg();
      if (t.status === 'pagado') throw new Error('Este ticket ya fue pagado el ' + U.dt(t.paidAt) + ' por ' + t.paidBy);
      if (t.status === 'anulado') throw new Error('Ticket anulado');
      if (t.status === 'caducado') throw new Error('Ticket caducado (más de ' + cfg.expiryDays + ' días)');
      if (t.status === 'perdedor') throw new Error('Ticket no premiado');
      if (t.status === 'pendiente') throw new Error('Ticket aún pendiente de resultados');
      if (!serverMode && cfg.requirePinToPay && !Auth.can('tickets.pay', u) && String(pin) !== String(t.pin)) throw new Error('PIN de seguridad incorrecto');
      if (!serverMode && cfg.payOnlyIssuingBanca && !Auth.can('tickets.pay', u) && t.bancaId !== u.bancaId) throw new Error('Este ticket solo se paga en la banca emisora');
      const upd = Object.assign({}, t, { payPin: String(pin || ''), status: 'pagado', paidAt: Date.now(), paidBy: u.username, paidBanca: u.bancaId, paidShift: shift ? shift.id : '' });
      DB.put('tickets', upd); DB.log('ticket.pagado', `${t.code} ${U.money(t.prize)}`);
      return upd;
    },
    statusBadge(s) {
      const m = { pendiente: 'b-warn', ganador: 'b-ok', perdedor: 'b-mute', pagado: 'b-info', anulado: 'b-bad', caducado: 'b-mute' };
      return `<span class="badge ${m[s] || ''}">${U.esc(s)}</span>`;
    },
    describeLine(t, l) {
      if (t.type === 'loteria') {
        const lot = l.kind === 'SP' ? Lot.name(l.lot) + ' + ' + Lot.name(l.lot2) : Lot.name(l.lot);
        return `${KIND_NAMES[l.kind]} ${l.nums.join('-')} · ${lot}`;
      }
      return (l.mode === 'parlay' ? `Parlay ${l.legs.length} jugadas` : 'Directa') + ': ' + l.legs.map(x => x.label).join(' | ');
    },
  };

  /* ---------------- impresión del ticket ---------------- */
  function ticketHTML(t) {
    const cfg = DB.cfg(); const b = DB.get('bancas', t.bancaId) || {};
    let body = '';
    if (t.type === 'loteria') {
      const groups = {};
      t.lines.forEach(l => { const k = l.kind === 'SP' ? 'SP|' + l.lot + '|' + l.lot2 : l.lot; (groups[k] = groups[k] || []).push(l); });
      for (const k in groups) {
        const first = groups[k][0];
        const title = first.kind === 'SP' ? 'SUPER PALÉ ' + Lot.name(first.lot) + ' + ' + Lot.name(first.lot2) : Lot.name(first.lot);
        body += `<div class="tk-sec">${U.esc(title.toUpperCase())}</div>`;
        groups[k].forEach(l => {
          const res = l.result ? (l.result === 'win' ? ' ✓' : '') : '';
          body += `<div class="tk-row"><span>${KIND_NAMES[l.kind].slice(0, 3).toUpperCase()} ${l.nums.join('-')}${res}</span><span>${U.money(l.amount)}</span></div>`;
        });
      }
    } else {
      t.lines.forEach((l, i) => {
        body += `<div class="tk-sec">${l.mode === 'parlay' ? 'PARLAY ' + l.legs.length : 'DIRECTA'} #${i + 1}</div>`;
        l.legs.forEach(x => {
          const g = DB.get('games', x.gameId) || {};
          body += `<div class="tk-leg">${U.esc(g.away || '')} @ ${U.esc(g.home || '')}<br><b>${U.esc(x.label)} (${U.fmtOdds(x.odds)})</b><br><small>${g.start ? U.dt(g.start) : ''}</small></div>`;
        });
        body += `<div class="tk-row"><span>Apuesta</span><span>${U.money(l.amount)}</span></div><div class="tk-row"><span>A ganar</span><span>${U.money(Sports.potential(l))}</span></div>`;
      });
    }
    return `<div class="ticket">
      <div class="tk-c tk-h">${U.esc(cfg.company)}</div>
      <div class="tk-c">${U.esc(b.name || '')} (${U.esc(b.code || '')})</div>
      ${b.address ? `<div class="tk-c small">${U.esc(b.address)}</div>` : ''}
      ${cfg.rnc ? `<div class="tk-c small">RNC: ${U.esc(cfg.rnc)}</div>` : ''}
      <div class="tk-hr"></div>
      <div class="tk-row"><span>Ticket</span><b>${U.esc(t.code)}</b></div>
      <div class="tk-row"><span>No.</span><span>${t.serial}</span></div>
      <div class="tk-row"><span>Fecha</span><span>${U.dt(t.createdAt)}</span></div>
      <div class="tk-row"><span>Vendedor</span><span>${U.esc(t.userName || '')}</span></div>
      <div class="tk-hr"></div>
      ${body}
      <div class="tk-hr"></div>
      <div class="tk-row tk-total"><span>TOTAL</span><span>${U.money(t.total)}</span></div>
      ${t.potential ? `<div class="tk-row"><span>Posible premio</span><span>${U.money(t.potential)}</span></div>` : ''}
      <div class="tk-row"><span>PIN pago</span><b>${t.pin || '****'}</b></div>
      ${t.status === 'anulado' ? '<div class="tk-c tk-h">*** ANULADO ***</div>' : ''}
      <div class="tk-hr"></div>
      <div class="tk-c">${barcodeSVG(t.code)}</div>
      <div class="tk-c small">${U.esc(cfg.ticketHeader)}</div>
      <div class="tk-c small">${U.esc(cfg.ticketFooter)}</div>
      <div class="tk-c small">Caduca a los ${cfg.expiryDays} días</div>
    </div>`;
  }

  /* código de barras Code 39 en SVG (sin librerías) */
  function barcodeSVG(text) {
    const C39 = { '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', 'A': 'wnnnnwnnw', 'B': 'nnwnnwnnw', 'C': 'wnwnnwnnn', 'D': 'nnnnwwnnw', 'E': 'wnnnwwnnn', 'F': 'nnwnwwnnn', 'G': 'nnnnnwwnw', 'H': 'wnnnnwwnn', 'I': 'nnwnnwwnn', 'J': 'nnnnwwwnn', 'K': 'wnnnnnnww', 'L': 'nnwnnnnww', 'M': 'wnwnnnnwn', 'N': 'nnnnwnnww', 'O': 'wnnnwnnwn', 'P': 'nnwnwnnwn', 'Q': 'nnnnnnwww', 'R': 'wnnnnnwwn', 'S': 'nnwnnnwwn', 'T': 'nnnnwnwwn', 'U': 'wwnnnnnnw', 'V': 'nwwnnnnnw', 'W': 'wwwnnnnnn', 'X': 'nwnnwnnnw', 'Y': 'wwnnwnnnn', 'Z': 'nwwnwnnnn', '-': 'nwnnnnwnw', '*': 'nwnnwnwnn' };
    const s = '*' + String(text).toUpperCase() + '*'; let x = 0; let rects = '';
    for (const ch of s) {
      const p = C39[ch] || C39['-'];
      for (let i = 0; i < 9; i++) { const w = p[i] === 'w' ? 3 : 1; if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${w}" height="40"/>`; x += w; }
      x += 1;
    }
    return `<svg class="barcode" viewBox="0 0 ${x} 40" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
  }

  function printTicket(t) {
    let el = document.getElementById('print-area');
    if (!el) { el = document.createElement('div'); el.id = 'print-area'; document.body.appendChild(el); }
    el.innerHTML = ticketHTML(t);
    setTimeout(() => { try { window.print(); } catch (e) { UI.toast('No se pudo imprimir en este navegador', 'bad'); } }, 50);
  }

  function ticketText(t) {
    const cfg = DB.cfg(); const b = DB.get('bancas', t.bancaId) || {};
    let s = `*${cfg.company}*\n${b.name || ''}\nTicket: *${t.code}*\nFecha: ${U.dt(t.createdAt)}\n`;
    t.lines.forEach(l => { s += `• ${Tickets.describeLine(t, l)} — ${U.money(l.amount)}\n`; });
    s += `TOTAL: ${U.money(t.total)}`; if (t.potential) s += `\nPosible premio: ${U.money(t.potential)}`;
    return s;
  }

  /* ---------------- turnos / cuadre de caja ---------------- */
  const Shifts = {
    current(u) { return DB.all('shifts').find(s => s.userId === u.id && s.status === 'abierto'); },
    open(u, fondo) {
      if (Shifts.current(u)) throw new Error('Ya tiene un turno abierto');
      const s = { id: U.uid('s_'), userId: u.id, userName: u.name, bancaId: u.bancaId, openedAt: Date.now(), fondo: Number(fondo) || 0, status: 'abierto' };
      DB.put('shifts', s); DB.log('turno.apertura', `Fondo ${U.money(s.fondo)}`); return s;
    },
    summary(s) {
      const tk = DB.all('tickets').filter(t => t.shiftId === s.id);
      const valid = tk.filter(t => t.status !== 'anulado');
      const ventas = U.round2(valid.reduce((a, t) => a + t.total, 0));
      const ventasLot = U.round2(valid.filter(t => t.type === 'loteria').reduce((a, t) => a + t.total, 0));
      const ventasDep = U.round2(ventas - ventasLot);
      const anulados = tk.filter(t => t.status === 'anulado');
      const paid = DB.all('tickets').filter(t => t.paidShift === s.id);
      const pagos = U.round2(paid.reduce((a, t) => a + t.prize, 0));
      const gastos = U.round2(DB.all('expenses').filter(e => e.shiftId === s.id).reduce((a, e) => a + Number(e.amount), 0));
      const esperado = U.round2(s.fondo + ventas - pagos - gastos);
      return { tickets: valid.length, ventas, ventasLot, ventasDep, anulados: anulados.length, montoAnulado: U.round2(anulados.reduce((a, t) => a + t.total, 0)), pagos, pagados: paid.length, gastos, esperado };
    },
    close(s, declarado, nota) {
      const sum = Shifts.summary(s);
      const upd = Object.assign({}, s, { status: 'cerrado', closedAt: Date.now(), declarado: Number(declarado) || 0, nota: nota || '', resumen: sum, diferencia: U.round2((Number(declarado) || 0) - sum.esperado) });
      DB.put('shifts', upd); DB.log('turno.cierre', `Esperado ${U.money(sum.esperado)} Declarado ${U.money(declarado)}`); return upd;
    },
  };

  /* ---------------- marcadores en vivo (ESPN público) ---------------- */
  const Scores = {
    lastRun: 0, lastError: '',
    async fetchLeague(leagueId, dateStr) {
      const lg = DB.get('leagues', leagueId); if (!lg || !lg.espn) return { imported: 0, updated: 0 };
      const d = (dateStr || U.today()).replace(/-/g, '');
      const url = `https://site.api.espn.com/apis/site/v2/sports/${lg.espn}/scoreboard?dates=${d}`;
      const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json(); let imported = 0, updated = 0;
      (j.events || []).forEach(ev => {
        const comp = ev.competitions && ev.competitions[0]; if (!comp) return;
        const home = comp.competitors.find(c => c.homeAway === 'home'), away = comp.competitors.find(c => c.homeAway === 'away');
        if (!home || !away) return;
        const st = ev.status && ev.status.type || {};
        const status = st.state === 'pre' ? (/postpon|cancel|suspend/i.test(st.name || '') ? 'suspendido' : 'programado') : st.state === 'in' ? 'en_vivo' : (st.completed ? 'final' : 'en_vivo');
        const start = new Date(ev.date).getTime();
        const p = U.parts(new Date(start));
        let g = DB.all('games').find(x => x.extId === 'espn:' + ev.id);
        const base = {
          league: leagueId, away: away.team.displayName, home: home.team.displayName,
          date: p.date, time: U.pad2(p.h) + ':' + U.pad2(p.m), start, status,
          scoreAway: away.score != null && status !== 'programado' ? Number(away.score) : null,
          scoreHome: home.score != null && status !== 'programado' ? Number(home.score) : null,
          period: st.shortDetail || st.detail || '', source: 'espn', extId: 'espn:' + ev.id,
        };
        const odds = parseEspnOdds((comp.odds && comp.odds[0]) || null);
        if (!g) {
          g = Object.assign({ id: U.uid('g_'), odds: odds || {}, oddsLocked: false }, base);
          DB.put('games', g, { silent: true }); imported++;
        } else {
          const upd = Object.assign({}, g);
          let changed = false;
          if (!g.manualScore && (g.status !== base.status || g.scoreAway !== base.scoreAway || g.scoreHome !== base.scoreHome || g.period !== base.period || g.start !== base.start)) { Object.assign(upd, base); changed = true; }
          // líneas: se actualizan mientras el juego no ha empezado y no estén bloqueadas
          if (odds && !g.oddsLocked && base.status === 'programado' && JSON.stringify(odds) !== JSON.stringify(g.odds)) { upd.odds = odds; changed = true; }
          if (changed) { DB.put('games', upd, { silent: true }); updated++; }
        }
      });
      return { imported, updated };
    },
    async refreshAll(opts = {}) {
      if (serverMode) { const r = await api.call('scores', { ahead: !!opts.ahead, all: !!opts.all }); Scores.lastRun = Date.now(); await pull(); return r; }
      const cfg = DB.cfg(); const leagues = DB.all('leagues').filter(l => l.active && l.espn && (opts.all || (cfg.espnLeagues || []).includes(l.id)));
      let imported = 0, updated = 0, errors = 0;
      const dates = [U.addDays(U.today(), -1), U.today()].concat(opts.ahead ? [U.addDays(U.today(), 1), U.addDays(U.today(), 2)] : []);
      for (const l of leagues) for (const d of dates) {
        try { const r = await Scores.fetchLeague(l.id, d); imported += r.imported; updated += r.updated; }
        catch (e) { errors++; Scores.lastError = e.message; }
      }
      Scores.lastRun = Date.now();
      DB.save(); emit('games'); const graded = gradeAll();
      return { imported, updated, errors, graded };
    },
    startAuto() {
      if (serverMode) return; // el servidor actualiza los marcadores
      const cfg = DB.cfg(); if (!cfg.autoScores) return;
      const run = () => Scores.refreshAll().catch(() => { });
      setTimeout(run, 3000); setInterval(run, Math.max(30, cfg.scoresIntervalSec || 90) * 1000);
    },
  };
  /* convierte las cuotas del marcador de ESPN (formato DraftKings) a nuestro formato */
  function parseEspnOdds(o) {
    if (!o) return null;
    const pick = x => x && (x.close || x.current || x.open) || null;
    const odd = x => { const p = pick(x); return p ? num(p.odds) : null; };
    const line = x => { const p = pick(x); return p && p.line != null ? num(String(p.line).replace(/^[ou]/i, '')) : null; };
    const ml = o.moneyline || {}, ps = o.pointSpread || {}, tt = o.total || {};
    const r = {
      mlAway: odd(ml.away) ?? num(o.awayTeamOdds && o.awayTeamOdds.moneyLine),
      mlHome: odd(ml.home) ?? num(o.homeTeamOdds && o.homeTeamOdds.moneyLine),
      mlDraw: odd(ml.draw) ?? num(o.drawOdds && o.drawOdds.moneyLine),
      spread: line(ps.home) ?? num(o.spread), // línea del local (ej. -3.5)
      spHome: odd(ps.home) ?? -110, spAway: odd(ps.away) ?? -110,
      total: line(tt.over) ?? num(o.overUnder), over: odd(tt.over) ?? -110, under: odd(tt.under) ?? -110,
    };
    if (r.mlAway == null && r.mlHome == null && r.spread == null && r.total == null) return null;
    return r;
  }
  function num(v) { if (v == null || v === '') return null; const n = Number(String(v).replace('+', '')); return isNaN(n) ? null : n; }

  /* ---------------- reportes ---------------- */
  const Reports = {
    range(from, to, filter = {}) {
      const sc = filter.all ? null : Auth.scope();
      const tks = DB.all('tickets').filter(t => t.date >= from && t.date <= to && (sc === null || sc.includes(t.bancaId)) &&
        (!filter.bancaId || t.bancaId === filter.bancaId) && (!filter.userId || t.userId === filter.userId) && (!filter.type || t.type === filter.type));
      const valid = tks.filter(t => t.status !== 'anulado');
      const ventas = U.round2(valid.reduce((a, t) => a + t.total, 0));
      const premios = U.round2(valid.filter(t => ['ganador', 'pagado', 'caducado'].includes(t.status)).reduce((a, t) => a + t.prize, 0));
      const pagados = U.round2(valid.filter(t => t.status === 'pagado').reduce((a, t) => a + t.prize, 0));
      const pendPago = U.round2(valid.filter(t => t.status === 'ganador').reduce((a, t) => a + t.prize, 0));
      const pendientes = valid.filter(t => t.status === 'pendiente').length;
      const anulados = tks.filter(t => t.status === 'anulado');
      // comisiones
      let comision = 0;
      valid.forEach(t => { const u = DB.get('users', t.userId); const b = DB.get('bancas', t.bancaId); const pct = (u && u.commission) || 0; comision += t.total * pct / 100; void b; });
      return { tickets: tks, valid, ventas, premios, pagados, pendPago, pendientes, anulados: anulados.length, montoAnulado: U.round2(anulados.reduce((a, t) => a + t.total, 0)), comision: U.round2(comision), neto: U.round2(ventas - premios - comision) };
    },
    groupBy(list, keyFn) {
      const m = {}; list.forEach(t => { const k = keyFn(t); (m[k] = m[k] || []).push(t); }); return m;
    },
  };

  /* ---------------- UI helpers comunes ---------------- */
  const UI = {
    $(s, el = document) { return el.querySelector(s); },
    $$(s, el = document) { return [...el.querySelectorAll(s)]; },
    toast(msg, type = 'ok', ms = 3000) {
      let box = document.getElementById('toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
      const el = document.createElement('div'); el.className = 'toast t-' + type; el.textContent = msg; box.appendChild(el);
      setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
    },
    modal(title, html, { onOpen, wide, locked } = {}) {
      UI.closeModal();
      const wrap = document.createElement('div'); wrap.className = 'modal-wrap'; wrap.id = 'modal';
      wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}"><div class="modal-h"><h3>${title}</h3>${locked ? '' : '<button class="btn ghost sm" data-close>✕</button>'}</div><div class="modal-b">${html}</div></div>`;
      wrap.addEventListener('click', e => { if (locked) return; if (e.target === wrap || e.target.closest('[data-close]')) UI.closeModal(); });
      document.body.appendChild(wrap); if (onOpen) onOpen(wrap.querySelector('.modal'));
      const f = wrap.querySelector('input,select,textarea'); if (f) setTimeout(() => f.focus(), 30);
      return wrap.querySelector('.modal');
    },
    closeModal() { const m = document.getElementById('modal'); if (m) m.remove(); },
    /* diálogos propios (funcionan también dentro de iframes que bloquean confirm/prompt) */
    ask(msg, { input = false, def = '', ok = 'Aceptar', danger = false } = {}) {
      return new Promise(res => {
        const w = document.createElement('div'); w.className = 'modal-wrap'; w.style.zIndex = 150;
        w.innerHTML = `<form class="modal" style="max-width:420px"><div class="modal-b"><p style="margin-top:0;font-size:15px">${U.esc(msg)}</p>
          ${input ? `<input name="v" value="${U.esc(def)}" autocomplete="off">` : ''}
          <div class="row" style="justify-content:flex-end;margin-top:14px"><button type="button" class="btn ghost" data-c>Cancelar</button><button class="btn ${danger ? 'bad' : 'pri'}">${U.esc(ok)}</button></div></div></form>`;
        const done = v => { w.remove(); document.removeEventListener('keydown', esc, true); res(v); };
        const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); done(input ? null : false); } };
        document.addEventListener('keydown', esc, true);
        w.querySelector('[data-c]').onclick = () => done(input ? null : false);
        w.querySelector('form').onsubmit = e => { e.preventDefault(); done(input ? w.querySelector('input').value : true); };
        document.body.appendChild(w);
        setTimeout(() => { const f = w.querySelector('input') || w.querySelector('button.btn:not(.ghost)'); f && f.focus(); if (f && f.select) f.select(); }, 30);
      });
    },
    confirm(msg) { return UI.ask(msg); },
    prompt(msg, def = '') { return UI.ask(msg, { input: true, def }); },
    formData(form) {
      const o = {}; new FormData(form).forEach((v, k) => { o[k] = v; });
      UI.$$('input[type=checkbox]', form).forEach(c => { if (c.name) o[c.name] = c.checked; });
      return o;
    },
  };

  global.BRD = { U, DB, Auth, api, Inv, Requests, Issues, captureErrors, Lot, Sports, Tickets, Shifts, Scores, Reports, UI, KIND_NAMES, parsePlay, validateLotteryLine, gradeAll, gradeTicket, ticketHTML, ticketText, printTicket, barcodeSVG, DEFAULT_CONFIG };
})(window);
