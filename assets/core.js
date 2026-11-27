/* =========================================================
   BancaRD — núcleo compartido (datos, reglas, calificación)
   Funciona 100% en el navegador (localStorage) y, si existe
   el servidor opcional (/api), sincroniza entre bancas.
   ========================================================= */
(function (global) {
  'use strict';

  const VERSION = '1.0.0';
  const LS_KEY = 'bancard_db_v1';
  const SS_KEY = 'bancard_session_v1';
  const COLLS = ['config', 'bancas', 'users', 'lotteries', 'results', 'leagues', 'games',
    'tickets', 'shifts', 'limits', 'audit', 'expenses'];

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
    DB.put('bancas', { id: 'b_001', code: 'B001', name: 'Banca Principal', address: 'Av. Principal #1', zone: 'Santo Domingo', phone: '', owner: '', status: 'activa', commission: 10, dailyLimit: 0, lotteries: 'todas', sports: true, createdAt: now });
    DB.put('bancas', { id: 'b_002', code: 'B002', name: 'Banca Los Mina', address: 'Calle 5, Los Mina', zone: 'Santo Domingo Este', phone: '', owner: '', status: 'activa', commission: 10, dailyLimit: 0, lotteries: 'todas', sports: true, createdAt: now });
    DB.put('users', { id: 'u_admin', username: 'admin', name: 'Administrador', role: 'admin', bancaId: '', active: true, pass: await U.sha('bancard:admin123'), mustChange: true, commission: 0, createdAt: now });
    DB.put('users', { id: 'u_sup', username: 'supervisor', name: 'Supervisor Zona', role: 'supervisor', bancaId: '', active: true, pass: await U.sha('bancard:super123'), mustChange: true, commission: 0, createdAt: now });
    DB.put('users', { id: 'u_caj1', username: 'cajero1', name: 'Cajero Principal', role: 'cajero', bancaId: 'b_001', active: true, pass: await U.sha('bancard:1234'), mustChange: false, commission: 5, createdAt: now });
    DB.put('users', { id: 'u_caj2', username: 'cajero2', name: 'Cajero Los Mina', role: 'cajero', bancaId: 'b_002', active: true, pass: await U.sha('bancard:1234'), mustChange: false, commission: 5, createdAt: now });
    LOTTERIES.forEach((l, i) => DB.put('lotteries', { id: l[0], name: l[1], time: l[2], dayTimes: l[3] || {}, days: [0, 1, 2, 3, 4, 5, 6], closeMinutes: 5, active: true, order: i, games: { Q: true, P: true, T: true, SP: true } }));
    LEAGUES.forEach((l, i) => DB.put('leagues', { id: l[0], name: l[1], sport: l[2], espn: l[3], active: true, order: i }));
    seedGames();
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
  let serverMode = false;
  let lastSync = 0;
  let pending = [];

  const DB = {
    VERSION, COLLS,
    get mode() { return serverMode ? 'servidor' : 'local'; },
    load() {
      try { state = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { state = {}; }
      COLLS.forEach(c => { if (!state[c]) state[c] = {}; });
      if (!state.__meta) state.__meta = { lastSync: 0 };
      lastSync = state.__meta.lastSync || 0;
    },
    save() {
      state.__meta = { lastSync };
      try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { console.warn('No se pudo guardar', e); }
    },
    isEmpty() { return !Object.keys(state.users || {}).length; },
    all(c) { return Object.values(state[c] || {}).filter(r => !r._deleted); },
    get(c, id) { const r = (state[c] || {})[id]; return r && !r._deleted ? r : null; },
    find(c, fn) { return DB.all(c).filter(fn); },
    cfg() { return state.config && state.config.main; },
    put(c, rec, opts = {}) {
      if (!rec.id) rec.id = U.uid();
      rec.updatedAt = Date.now();
      state[c][rec.id] = rec;
      if (!opts.silent) { DB.save(); emit(c); }
      if (serverMode) push(c, rec);
      return rec;
    },
    patch(c, id, changes) { const r = DB.get(c, id); if (!r) return null; return DB.put(c, Object.assign({}, r, changes)); },
    remove(c, id) { const r = state[c][id]; if (!r) return; DB.put(c, { id, _deleted: true, deletedAt: Date.now() }); },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    log(action, detail, extra) {
      const s = Auth.user();
      const rec = { id: U.uid('a_'), at: Date.now(), user: s ? s.username : 'sistema', userId: s ? s.id : '', bancaId: s ? s.bancaId : '', action, detail: detail || '', extra: extra || null };
      state.audit[rec.id] = rec; rec.updatedAt = rec.at; DB.save();
      if (serverMode) push('audit', rec);
    },
    exportJSON() { return JSON.stringify({ app: 'BancaRD', version: VERSION, exportedAt: new Date().toISOString(), data: state }, null, 1); },
    importJSON(text) {
      const o = JSON.parse(text); if (!o || !o.data) throw new Error('Archivo inválido');
      state = o.data; COLLS.forEach(c => { if (!state[c]) state[c] = {}; }); DB.save(); emit('*');
      if (serverMode) COLLS.forEach(c => Object.values(state[c]).forEach(r => push(c, r)));
    },
    reset() { localStorage.removeItem(LS_KEY); state = {}; DB.load(); },
    async init() {
      DB.load();
      await detectServer();
      if (DB.isEmpty()) await seed();
      if (!DB.cfg()) DB.put('config', Object.assign({}, DEFAULT_CONFIG));
      // completar llaves nuevas de configuración
      const cfg = DB.cfg(); let changed = false;
      for (const k in DEFAULT_CONFIG) if (cfg[k] === undefined) { cfg[k] = DEFAULT_CONFIG[k]; changed = true; }
      if (changed) DB.put('config', cfg);
      window.addEventListener('storage', e => { if (e.key === LS_KEY) { DB.load(); emit('*'); } });
      if (serverMode) setInterval(pull, 8000);
    },
  };

  function emit(c) { listeners.forEach(fn => { try { fn(c); } catch (e) { console.error(e); } }); }

  /* ---------- sincronización con servidor opcional ---------- */
  async function detectServer() {
    if (location.protocol === 'file:') return;
    try {
      const r = await fetch('api/ping', { cache: 'no-store' });
      if (r.ok) { const j = await r.json(); if (j && j.bancard) { serverMode = true; await pull(true); } }
    } catch (e) { /* sin servidor: modo local */ }
  }
  async function pull(first) {
    try {
      const r = await fetch('api/changes?since=' + (first ? 0 : lastSync), { cache: 'no-store' });
      if (!r.ok) return; const j = await r.json(); let n = 0;
      (j.records || []).forEach(({ c, rec }) => {
        if (!state[c]) state[c] = {};
        const cur = state[c][rec.id];
        if (!cur || (rec.updatedAt || 0) >= (cur.updatedAt || 0)) { state[c][rec.id] = rec; n++; }
      });
      lastSync = j.now || Date.now(); DB.save();
      if (first) { // subir lo local que el servidor no tenga
        COLLS.forEach(c => Object.values(state[c]).forEach(rec => push(c, rec)));
      }
      if (n) emit('*');
      flush();
    } catch (e) { /* desconectado */ }
  }
  function push(c, rec) { pending.push({ c, rec }); clearTimeout(push.t); push.t = setTimeout(flush, 300); }
  async function flush() {
    if (!pending.length) return; const batch = pending.splice(0, 500);
    try {
      const r = await fetch('api/put', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ records: batch }) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
    } catch (e) { pending = batch.concat(pending); setTimeout(flush, 5000); }
  }

  /* ---------------- autenticación y permisos ---------------- */
  const ROLES = {
    admin: { name: 'Administrador', control: true, pos: true, perms: '*' },
    supervisor: { name: 'Supervisor', control: true, pos: true, perms: ['dashboard', 'bancas.view', 'staff.view', 'results', 'games', 'tickets', 'reports', 'shifts', 'limits', 'audit.view'] },
    cajero: { name: 'Cajero / Vendedor', control: false, pos: true, perms: ['pos'] },
  };
  const Auth = {
    ROLES,
    user() {
      try { const s = JSON.parse(sessionStorage.getItem(SS_KEY) || 'null'); if (!s) return null; const u = DB.get('users', s.id); return u && u.active ? Object.assign({}, u) : null; } catch (e) { return null; }
    },
    async login(username, password) {
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
      if (u.bancaId) { const b = DB.get('bancas', u.bancaId); if (b && b.status !== 'activa') throw new Error('La banca ' + b.name + ' está ' + b.status + '.'); }
      DB.patch('users', u.id, { fails: 0, lockedUntil: 0, lastLogin: Date.now() });
      sessionStorage.setItem(SS_KEY, JSON.stringify({ id: u.id, at: Date.now() }));
      DB.log('login', u.username);
      return DB.get('users', u.id);
    },
    logout() { const u = Auth.user(); if (u) DB.log('logout', u.username); sessionStorage.removeItem(SS_KEY); },
    async setPassword(userId, pw) { DB.patch('users', userId, { pass: await U.sha('bancard:' + pw), mustChange: false }); },
    can(perm, u) {
      u = u || Auth.user(); if (!u) return false; const r = ROLES[u.role]; if (!r) return false;
      if (r.perms === '*') return true; return r.perms.includes(perm) || r.perms.includes(perm.split('.')[0]);
    },
  };

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
        for (const l of t.lines) for (const leg of l.legs) { const g = DB.get('games', leg.gameId); if (g && !Sports.isOpen(g) && u.role !== 'admin') return 'Un juego ya comenzó'; }
      }
      if (u.role === 'cajero') {
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
      if (cfg.requirePinToPay && u.role === 'cajero' && String(pin) !== String(t.pin)) throw new Error('PIN de seguridad incorrecto');
      if (cfg.payOnlyIssuingBanca && u.role === 'cajero' && t.bancaId !== u.bancaId) throw new Error('Este ticket solo se paga en la banca emisora');
      const upd = Object.assign({}, t, { status: 'pagado', paidAt: Date.now(), paidBy: u.username, paidBanca: u.bancaId, paidShift: shift ? shift.id : '' });
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
      <div class="tk-row"><span>PIN pago</span><b>${t.pin}</b></div>
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
        if (!g) {
          const o = (comp.odds && comp.odds[0]) || {};
          const odds = { mlAway: num(o.awayTeamOdds && o.awayTeamOdds.moneyLine), mlHome: num(o.homeTeamOdds && o.homeTeamOdds.moneyLine), mlDraw: num(o.drawOdds && o.drawOdds.moneyLine), spread: null, spAway: -110, spHome: -110, total: num(o.overUnder), over: -110, under: -110 };
          if (o.spread != null) { odds.spread = -num(o.spread); } // espn: spread del local
          if (o.homeTeamOdds && o.homeTeamOdds.spreadOdds) odds.spHome = num(o.homeTeamOdds.spreadOdds);
          if (o.awayTeamOdds && o.awayTeamOdds.spreadOdds) odds.spAway = num(o.awayTeamOdds.spreadOdds);
          if (o.overOdds) odds.over = num(o.overOdds); if (o.underOdds) odds.under = num(o.underOdds);
          g = Object.assign({ id: U.uid('g_'), odds, oddsLocked: false }, base);
          DB.put('games', g, { silent: true }); imported++;
        } else {
          const changed = g.status !== base.status || g.scoreAway !== base.scoreAway || g.scoreHome !== base.scoreHome || g.period !== base.period || g.start !== base.start;
          if (changed && !g.manualScore) { DB.put('games', Object.assign({}, g, base), { silent: true }); updated++; }
        }
      });
      return { imported, updated };
    },
    async refreshAll(opts = {}) {
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
      const cfg = DB.cfg(); if (!cfg.autoScores) return;
      const run = () => Scores.refreshAll().catch(() => { });
      setTimeout(run, 3000); setInterval(run, Math.max(30, cfg.scoresIntervalSec || 90) * 1000);
    },
  };
  function num(v) { if (v == null || v === '') return null; const n = Number(String(v).replace('+', '')); return isNaN(n) ? null : n; }

  /* ---------------- reportes ---------------- */
  const Reports = {
    range(from, to, filter = {}) {
      const tks = DB.all('tickets').filter(t => t.date >= from && t.date <= to &&
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

  global.BRD = { U, DB, Auth, Lot, Sports, Tickets, Shifts, Scores, Reports, UI, KIND_NAMES, parsePlay, validateLotteryLine, gradeAll, gradeTicket, ticketHTML, ticketText, printTicket, barcodeSVG, DEFAULT_CONFIG };
})(window);
