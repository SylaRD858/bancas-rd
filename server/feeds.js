/* AuraSport - actualizacion automatica de resultados (corre en el servidor).
   - Loterias: lee paginas publicas de resultados y publica cuando el mismo
     resultado se confirma (dos lecturas seguidas o dos fuentes iguales).
     Nunca reemplaza un resultado ingresado a mano.
   - Deportes: ESPN (ligas de EE.UU. y futbol) y MLB StatsAPI (LIDOM). */
'use strict';

const SOURCES = [
  { id: 'ld', name: 'loteriasdominicanas.com', url: 'https://loteriasdominicanas.com/' },
  { id: 'cn', name: 'conectate.com.do', url: 'https://www.conectate.com.do/loterias/' },
];
if (process.env.FEEDS_SOURCES) { try { SOURCES.splice(0, SOURCES.length, ...JSON.parse(process.env.FEEDS_SOURCES)); } catch (e) { console.error('FEEDS_SOURCES inválido'); } }
const UA = { 'User-Agent': 'AuraSport/3.1 (resultados para bancas; servidor)', 'Accept': 'text/html', 'Accept-Language': 'es-DO,es;q=0.9' };

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&amp;/g, '&').replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9:+&\/ ]+/g, ' ').replace(/\s+/g, ' ').trim();

/* reglas: texto "empresa titulo enlace" -> id de la loteria */
function mapLottery(text) {
  const t = ' ' + text + ' ';
  const has = re => re.test(t);
  if (has(/super pale|pega|\bloto\b|kino|juega|pick|cash|powerball|mega|millionaire|chances|toca|lotto|philipsburg|haiti|bolet|quemaito|agarra|tu fecha|take 5|win 4|numbers|billete|kinazo|repartidera|super ?mas/)) return null;
  if (has(/anguil/)) {
    if (has(/ 10| manana|10:00|10am/)) return 'anguila_10';
    if (has(/ 9 | 9:00|9pm| noche/)) return 'anguila_9';
    if (has(/ 6 | 6:00|6pm| tarde/)) return 'anguila_6';
    if (has(/ 1 | 1:00|1pm|medio ?dia| dia/)) return 'anguila_1';
    return null;
  }
  if (has(/king/)) return has(/7:30|noche| 7 /) ? 'king_noche' : has(/12:30|dia| 12 /) ? 'king_dia' : null;
  if (has(/primera/)) return has(/noche|7:00|8:00| 7 /) ? 'primera_noche' : has(/dia|12|medio|manana/) ? 'primera_dia' : null;
  if (has(/suerte/)) return has(/tarde|18:00|6:00| 6 /) ? 'suerte_tarde' : has(/12|md|dia|medio/) ? 'suerte_md' : null;
  if (has(/florida/)) return has(/noche|9:45|10:45/) ? 'florida_noche' : has(/dia|tarde|1:30|2:30|medio/) ? 'florida_dia' : null;
  if (has(/new ?york|nueva york| ny /)) return has(/noche|10:30|11:30/) ? 'ny_noche' : has(/tarde|medio|3:30|2:30|dia/) ? 'ny_tarde' : null;
  if (has(/gana mas|ganamas/)) return 'gana_mas';
  if (has(/loteka/)) return has(/quiniela|loteka /) ? 'loteka' : null;
  if (has(/lotedom/)) return has(/quiniela/) || / lotedom $/.test(t.replace(/.* /, ' ')) || has(/lotedom lotedom/) ? 'lotedom' : null;
  if (has(/leidsa/)) return has(/quiniela/) ? 'leidsa' : null;
  if (has(/ real /)) return has(/quiniela/) ? 'real' : null;
  if (has(/nacional/)) return has(/noche|loteria nacional|quiniela nacional/) ? 'nacional' : null;
  return null;
}

/* parser de bloques de juego (marcado tipo "game-block") */
function parseBlocks(html) {
  const out = []; const parts = html.split(/<div[^>]+class="[^"]*\bgame-block\b[^"]*"/i);
  let company = '';
  for (let i = 1; i < parts.length; i++) {
    const prev = parts[i - 1]; const blk = parts[i].slice(0, 6000);
    const cm = [...prev.matchAll(/class="[^"]*company-(?:title|name)[^"]*"[^>]*>([\s\S]{0,200}?)<\//gi)].pop(); if (cm) company = norm(cm[1]);
    const title = (blk.match(/class="[^"]*game-title[^"]*"[^>]*>([\s\S]{0,300}?)<\/(?:a|div|span|h\d)>/i) || [])[1] || '';
    const href = (blk.match(/<a[^>]+href="([^"#]+)"/i) || [])[1] || '';
    const date = (blk.match(/class="[^"]*session-date[^"]*"[^>]*>\s*([\d\-\/]{4,10})/i) || [])[1] || '';
    const img = (blk.match(/<img[^>]+(?:data-src|src)="(https?:[^"]+\.(?:png|jpe?g|webp|svg)[^"]*)"/i) || [])[1] || '';
    const nums = [...blk.matchAll(/class="[^"]*\bscore\b[^"]*"[^>]*>\s*(\d{1,2})\s*</gi)].map(m => m[1]);
    out.push({ company, title: norm(title), href: norm(href.replace(/[-_]/g, ' ')), date, img, nums });
  }
  return out;
}

/* convierte "28-11" o "28-11-2026" a YYYY-MM-DD */
function toISO(dm, today) {
  const m = String(dm).match(/(\d{1,2})[\-\/](\d{1,2})(?:[\-\/](\d{2,4}))?/); if (!m) return '';
  let [, d, mo, y] = m; const ty = Number(today.slice(0, 4));
  y = y ? (y.length === 2 ? 2000 + Number(y) : Number(y)) : ty;
  if (!m[3] && Number(mo) > Number(today.slice(5, 7)) + 1) y = ty - 1; // fin de año
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function create({ BRD, DB, log, resetTicketsFor }) {
  const { U } = BRD;
  const status = { lottery: { lastRun: 0, lastOk: 0, published: 0, sources: {} }, sports: { lastRun: 0, leagues: {} }, started: Date.now() };
  const nowMins = () => { const p = U.parts(new Date()); return p.h * 60 + p.m; };
  const seen = {};           // id_fecha -> { nums, at, src }
  let busyL = false, busyS = false, lastFull = 0, lastAhead = 0, lastLotFull = 0;

  async function fetchText(url) {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 20000);
    try { const r = await fetch(url, { headers: UA, signal: ac.signal, redirect: 'follow' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); }
    finally { clearTimeout(t); }
  }

  async function readSource(src, today) {
    const st = status.lottery.sources[src.id] = Object.assign(status.lottery.sources[src.id] || {}, { name: src.name });
    if (st.pausedUntil && Date.now() < st.pausedUntil) return null;
    st.at = Date.now();
    try {
      const html = await fetchText(src.url);
      const blocks = parseBlocks(html); const found = {};
      blocks.forEach(b => {
        const id = mapLottery(`${b.company} ${b.title} ${b.href}`); if (!id || !DB.get('lotteries', id)) return;
        const date = b.date ? toISO(b.date, today) : '';
        if (b.img && !found[id]) found['logo:' + id] = b.img;
        if (b.nums.length < 3 || !b.nums.slice(0, 3).every(n => /^\d{2}$/.test(n)) || !date) return;
        if (!found[id] || found[id].date < date) found[id] = { date, nums: b.nums.slice(0, 3) };
      });
      Object.assign(st, { ok: true, error: '', blocks: blocks.length, matched: Object.keys(found).filter(k => !k.startsWith('logo:')).length, bytes: html.length });
      if (!blocks.length) st.sample = html.replace(/\s+/g, ' ').slice(0, 1500);
      else delete st.sample;
      return found;
    } catch (e) {
      Object.assign(st, { ok: false, error: e.message });
      if (/HTTP (401|403|429)/.test(e.message)) { st.pausedUntil = Date.now() + 6 * 3600000; st.error = e.message + ' — la fuente no permite consultas automáticas; en pausa'; }
      return null;
    }
  }

  async function lotteries() {
    if (busyL) return; busyL = true; status.lottery.lastRun = Date.now();
    try {
      const today = U.today(), yest = U.addDays(today, -1);
      const reads = []; for (const s of SOURCES) { const r = await readSource(s, today); if (r) reads.push({ s, r }); }
      if (!reads.length) return;
      status.lottery.lastOk = Date.now();
      // logos de las loterias (si el administrador no subio uno propio)
      for (const { r } of reads) for (const k in r) if (k.startsWith('logo:')) {
        const l = DB.get('lotteries', k.slice(5)); if (l && !l.logo && l.logoSrc !== r[k]) DB.put('lotteries', Object.assign({}, l, { logoSrc: r[k] }), { silent: true });
      }
      const ids = new Set(); reads.forEach(({ r }) => Object.keys(r).forEach(k => { if (!k.startsWith('logo:')) ids.add(k); }));
      let changed = false;
      for (const id of ids) {
        const vals = reads.map(({ s, r }) => r[id] && { src: s.name, ...r[id] }).filter(Boolean);
        for (const v of vals) {
          if (v.date !== today && v.date !== yest) continue;
          const l = DB.get('lotteries', id); if (!l) continue;
          // el sorteo debe haber ocurrido ya (hora local del sorteo)
          if (v.date === today && U.toMins(BRD.Lot.timeFor(l, today)) > nowMins() + 2) continue;
          const key = id + '_' + v.date; const sig = v.nums.join('-');
          const cur = DB.get('results', key);
          if (cur && (cur.source || 'manual') !== 'auto') continue;               // manual: no se toca
          if (cur && [cur.n1, cur.n2, cur.n3].join('-') === sig) continue;     // ya publicado igual
          const agree = vals.filter(x => x.date === v.date && x.nums.join('-') === sig).length >= 2;
          const prev = seen[key]; const confirmed = agree || (prev && prev.sig === sig && Date.now() - prev.at >= 50000);
          if (!prev || prev.sig !== sig) seen[key] = { sig, at: Date.now(), src: v.src };
          if (!confirmed) continue;
          if (cur && resetTicketsFor) resetTicketsFor(id, v.date);
          DB.put('results', { id: key, lot: id, date: v.date, n1: v.nums[0], n2: v.nums[1], n3: v.nums[2], by: 'auto', source: 'auto', srcName: v.src, at: Date.now() }, { silent: true });
          DB.log('resultado.auto', `${l.name} ${v.date}: ${sig} (${v.src})${cur ? ' corregido' : ''}`);
          status.lottery.published++; changed = true; break;
        }
      }
      if (changed) BRD.gradeAll();
    } catch (e) { log('feeds lot', e.message); }
    finally { busyL = false; }
  }

  async function sports(force) {
    if (busyS) return; busyS = true; status.sports.lastRun = Date.now();
    try {
      const today = U.today(), now = Date.now();
      const leagues = DB.all('leagues').filter(l => l.active && (l.espn || l.feed));
      const full = force || now - lastFull > 10 * 60000; const ahead = force || now - lastAhead > 60 * 60000;
      for (const l of leagues) {
        const games = DB.all('games').filter(g => g.league === l.id && (g.date === today || g.date === U.addDays(today, -1)));
        const hot = games.some(g => g.status === 'en_vivo' || (g.status === 'programado' && g.start - now < 20 * 60000 && now - g.start < 6 * 3600000));
        if (!hot && !full) continue;
        const dates = [today].concat(full ? [U.addDays(today, -1)] : []).concat(ahead ? [U.addDays(today, 1), U.addDays(today, 2)] : []);
        const st = status.sports.leagues[l.id] = status.sports.leagues[l.id] || {};
        for (const d of dates) {
          try { const r = await BRD.Scores.refreshLeague(l, d); Object.assign(st, { ok: true, at: Date.now(), error: '' }); st.games = (st.games || 0) + r.imported; }
          catch (e) { Object.assign(st, { ok: false, at: Date.now(), error: e.message }); }
        }
      }
      if (full) lastFull = now; if (ahead) lastAhead = now;
      BRD.gradeAll();
    } catch (e) { log('feeds sports', e.message); }
    finally { busyS = false; }
  }

  /* hay sorteos recientes sin resultado: revisar seguido */
  function lotteryHot() {
    const today = U.today(), m = nowMins();
    return BRD.Lot.list().some(l => { if (!l.active || !BRD.Lot.playsOn(l, today)) return false; const t = U.toMins(BRD.Lot.timeFor(l, today)); return m >= t - 1 && m <= t + 180 && !DB.get('results', l.id + '_' + today); });
  }

  function start() {
    const cfg = () => DB.cfg() || {};
    setTimeout(() => { if (cfg().autoResults !== false) lotteries(); sports(true); }, 8000);
    setInterval(() => {
      if (cfg().autoResults === false) return;
      const hot = lotteryHot();
      if (hot || Date.now() - lastLotFull > 20 * 60000) { if (!hot) lastLotFull = Date.now(); lotteries(); }
    }, 2 * 60000);
    setInterval(() => { if (cfg().autoScores !== false) sports(false); }, 60000);
  }

  return { start, status, lotteries, sports, parseBlocks, mapLottery };
}

module.exports = { create, parseBlocks, mapLottery, toISO };
