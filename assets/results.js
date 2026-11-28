/* =========================================================
   AuraSport — Tablero de resultados (loterías y deportes)
   Se usa en resultados.html (público) y en la app de venta.
   ========================================================= */
(function (global) {
  const COMPANIES = (global.BRD && global.BRD.COMPANIES) || {
    nacional: { name: 'Lotería Nacional', color: '#0a5c36', short: 'LN' }, leidsa: { name: 'Leidsa', color: '#0b4ea2', short: 'LE' }, loteka: { name: 'Loteka', color: '#e4002b', short: 'LK' },
    real: { name: 'Lotería Real', color: '#6b2fa0', short: 'LR' }, primera: { name: 'La Primera', color: '#f39200', short: 'LP' }, suerte: { name: 'La Suerte', color: '#00a19a', short: 'LS' },
    lotedom: { name: 'LoteDom', color: '#c8102e', short: 'LD' }, anguila: { name: 'Anguila', color: '#1d71b8', short: 'AN' }, king: { name: 'King Lottery', color: '#b8860b', short: 'KL' },
    florida: { name: 'Florida', color: '#ff7a00', short: 'FL' }, newyork: { name: 'New York', color: '#1f2a44', short: 'NY' }, otras: { name: 'Otras', color: '#64748b', short: '★' },
  };
  const SPORT_ICON = { beisbol: '⚾', baloncesto: '🏀', futbol_americano: '🏈', hockey: '🏒', futbol: '⚽', combate: '🥊', otro: '🎯' };
  const TZ = 'America/Santo_Domingo';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const partsOf = (d = new Date()) => { const o = {}; new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).forEach(p => o[p.type] = p.value); return o; };
  const today = () => { const p = partsOf(); return `${p.year}-${p.month}-${p.day}`; };
  const nowMins = () => { const p = partsOf(); return Number(p.hour) * 60 + Number(p.minute); };
  const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const toMins = h => { const [a, b] = String(h || '0:0').split(':').map(Number); return a * 60 + b; };
  const h12 = h => { const [a, b] = String(h).split(':').map(Number); return `${((a + 11) % 12) + 1}:${pad(b)} ${a < 12 ? 'AM' : 'PM'}`; };
  const timeOf = ts => new Intl.DateTimeFormat('es-DO', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const longDate = d => cap(new Intl.DateTimeFormat('es-DO', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d + 'T12:00:00Z')));
  const shortDate = d => new Intl.DateTimeFormat('es-DO', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(d + 'T12:00:00Z'));
  const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 55% 38%)`; };
  const initials = s => String(s || '?').replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 3).toUpperCase() || '?';

  /* logo con respaldo: insignia de color con iniciales debajo de la imagen */
  function logo(src, short, color, size = 44, round) {
    return `<span class="rb-logo ${round ? 'round' : ''}" style="--c:${color};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.34)}px"><b>${esc(short)}</b>${src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add('ok')" onerror="this.remove()">` : ''}</span>`;
  }
  const lotLogo = (l, size) => { const c = COMPANIES[l.company] || COMPANIES.otras; return logo(l.logo || l.logoSrc, c.short, c.color, size); };
  const compLogo = (id, list, size) => { const c = COMPANIES[id] || COMPANIES.otras; const l = list.find(x => x.company === id && (x.logo || x.logoSrc)); return logo(l && (l.logo || l.logoSrc), c.short, c.color, size); };
  const leagueLogo = (lg, size) => logo(lg && (lg.logo || lg.logoSrc), lg ? initials(lg.name.replace(/\(.*\)/, '')) : '?', lg ? hue(lg.id) : '#555', size);
  const teamLogo = (src, name, abbr, size = 34) => logo(src, abbr || initials(name), hue(name), size, true);

  /* ---------- fuentes de datos ---------- */
  function remoteSource(base = '') {
    return {
      live: true,
      async day(date) { const r = await fetch(base + 'api/board?date=' + date, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); },
      async history(lot, days) { const r = await fetch(base + `api/board/history?lot=${encodeURIComponent(lot)}&days=${days}`, { cache: 'no-store' }); return (await r.json()).results || []; },
    };
  }
  function localSource() {
    const { DB, Lot } = global.BRD;
    return {
      live: false,
      async day(date) {
        return {
          now: Date.now(), today: today(), date,
          lotteries: Lot.list().filter(l => l.active !== false).map(l => ({ id: l.id, name: l.name, company: l.company || 'otras', time: Lot.timeFor(l, date), plays: Lot.playsOn(l, date), logo: l.logo || '', logoSrc: l.logoSrc || '' })),
          results: Object.fromEntries(DB.all('results').filter(r => r.date === date).map(r => [r.lot, r])),
          leagues: DB.all('leagues').filter(l => l.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0)),
          games: DB.all('games').filter(g => g.date === date && g.status !== 'cancelado').sort((a, b) => a.start - b.start),
        };
      },
      async history(lot, days) { const from = addDays(today(), -days); return DB.all('results').filter(r => r.lot === lot && r.date >= from).sort((a, b) => b.date.localeCompare(a.date)); },
    };
  }

  /* ---------- tablero ---------- */
  function mount(root, opts = {}) {
    const src = opts.source || (global.BRD && global.BRD.DB && global.BRD.DB.mode ? localSource() : remoteSource(opts.base || ''));
    const S = Object.assign({ date: today(), tab: 'loterias', comp: 'todas', league: 'todas', lot: null, data: null, hist: null, err: '', loadedAt: 0 }, opts.state || {});
    let timer = null, alive = true;

    async function load(silent) {
      try { S.data = await src.day(S.date); S.err = ''; S.loadedAt = Date.now(); }
      catch (e) { S.err = 'Sin conexión con el servidor de resultados. Reintentando…'; }
      if (S.lot) { try { S.hist = await src.history(S.lot, 60); } catch (e) { } }
      if (alive) draw(); if (!silent) root.scrollTop = 0;
    }

    function header() {
      const d = S.data; const liveN = d ? d.games.filter(g => g.status === 'en_vivo').length : 0;
      const isToday = S.date === today();
      return `<div class="rb-head">
        <div class="rb-dates"><button class="rb-btn" data-nav="-1" title="Día anterior">‹</button>
          <label class="rb-date"><span>${isToday ? 'Hoy · ' : ''}${esc(longDate(S.date))}</span><input type="date" id="rb-d" value="${S.date}" max="${addDays(today(), 3)}"></label>
          <button class="rb-btn" data-nav="1" title="Día siguiente">›</button>${isToday ? '' : '<button class="rb-btn rb-today" data-today>Hoy</button>'}</div>
        <div class="rb-tabs"><button class="rb-tab ${S.tab === 'loterias' ? 'on' : ''}" data-rbtab="loterias">🎱 Loterías</button><button class="rb-tab ${S.tab === 'deportes' ? 'on' : ''}" data-rbtab="deportes">🏟️ Deportes${liveN ? ` <i class="rb-live-dot"></i> ${liveN}` : ''}</button></div>
        <div class="rb-upd">${S.err ? `<span class="rb-err">${esc(S.err)}</span>` : S.loadedAt ? `<i class="rb-live-dot ${src.live ? '' : 'off'}"></i> Actualizado ${esc(timeOf(S.loadedAt))}` : 'Cargando…'}</div>
      </div>`;
    }

    /* ----- loterías ----- */
    function lotStatus(l, r) {
      if (r) return { k: 'ok', t: 'Resultado' };
      if (!l.plays) return { k: 'off', t: 'No juega hoy' };
      if (S.date < today()) return { k: 'off', t: 'Sin resultado' };
      if (S.date > today()) return { k: 'next', t: h12(l.time) };
      const m = nowMins(), t = toMins(l.time);
      if (m < t) { const left = t - m; return { k: 'next', t: left < 60 ? `En ${left} min` : `A las ${h12(l.time)}` }; }
      return { k: 'wait', t: m - t < 90 ? 'Sorteando / esperando' : 'Esperando resultado' };
    }
    function lotteries() {
      const d = S.data; const lots = d.lotteries; const comps = [...new Set(lots.map(l => l.company))].sort((a, b) => Object.keys(COMPANIES).indexOf(a) - Object.keys(COMPANIES).indexOf(b));
      if (S.lot) return lotDetail(lots.find(l => l.id === S.lot));
      const shown = lots.filter(l => S.comp === 'todas' || l.company === S.comp);
      const done = lots.filter(l => d.results[l.id]).length, playing = lots.filter(l => l.plays).length;
      let next = null; if (S.date === today()) { const m = nowMins(); next = lots.filter(l => l.plays && !d.results[l.id] && toMins(l.time) > m).sort((a, b) => toMins(a.time) - toMins(b.time))[0]; }
      return `<div class="rb-chips">${chip('todas', '<span class="rb-all">★</span>', 'Todas', S.comp === 'todas', 'comp')}${comps.map(c => chip(c, compLogo(c, lots, 26), (COMPANIES[c] || COMPANIES.otras).name, S.comp === c, 'comp')).join('')}</div>
        <div class="rb-summary"><span><b>${done}</b> de ${playing} sorteos con resultado</span>${next ? `<span class="rb-next">⏱ Próximo: <b>${esc(next.name)}</b> a las ${h12(next.time)} (en ${toMins(next.time) - nowMins()} min)</span>` : ''}</div>
        ${S.comp === 'todas' ? '<div class="rb-groups">' + comps.map(c => { const ls = shown.filter(l => l.company === c); return ls.length ? `<div class="rb-group"><h3>${compLogo(c, lots, 30)} ${esc((COMPANIES[c] || COMPANIES.otras).name)}</h3><div class="rb-grid">${ls.map(lotCard).join('')}</div></div>` : ''; }).join('') + '</div>'
        : `<div class="rb-grid">${shown.map(lotCard).join('')}</div>`}`;
    }
    function lotCard(l) {
      const r = S.data.results[l.id]; const st = lotStatus(l, r);
      return `<button class="rb-card rb-lot st-${st.k}" data-lot="${esc(l.id)}">
        <div class="rb-lot-top">${lotLogo(l, 46)}<div><b>${esc(l.name)}</b><small>${h12(l.time)}</small></div></div>
        <div class="rb-balls">${r ? [r.n1, r.n2, r.n3].map((n, i) => `<span class="rb-ball p${i + 1}">${esc(n)}</span>`).join('') : '<span class="rb-ball e">–</span><span class="rb-ball e">–</span><span class="rb-ball e">–</span>'}</div>
        <div class="rb-st"><span class="rb-pill ${st.k}">${esc(st.t)}</span>${r && r.source === 'auto' ? '<small title="Publicado automáticamente">auto</small>' : ''}</div></button>`;
    }
    function lotDetail(l) {
      if (!l) { S.lot = null; return lotteries(); }
      const h = S.hist || []; const freq = {}; const pos1 = {};
      h.forEach(r => { [r.n1, r.n2, r.n3].forEach(n => freq[n] = (freq[n] || 0) + 1); pos1[r.n1] = (pos1[r.n1] || 0) + 1; });
      const hot = Object.entries(freq).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
      const last = {}; h.slice().reverse().forEach((r, i) => [r.n1, r.n2, r.n3].forEach(n => last[n] = r.date));
      const cold = Array.from({ length: 100 }, (_, i) => pad(i)).map(n => [n, last[n] || '']).sort((a, b) => (a[1] || '0').localeCompare(b[1] || '0')).slice(0, 10);
      const r = S.data.results[l.id];
      return `<button class="rb-btn rb-back" data-back>‹ Todas las loterías</button>
        <div class="rb-detail"><div class="rb-card rb-hero">${lotLogo(l, 72)}<div><h2>${esc(l.name)}</h2><div class="mut">${esc((COMPANIES[l.company] || COMPANIES.otras).name)} · sorteo ${h12(l.time)}</div>
          <div class="rb-balls big">${r ? [r.n1, r.n2, r.n3].map((n, i) => `<span class="rb-ball p${i + 1}">${esc(n)}</span>`).join('') : '<span class="mut">Sin resultado para esta fecha</span>'}</div></div></div>
        <div class="rb-cols"><div class="rb-card"><h3>${h.length === 1 ? 'Último sorteo' : `Últimos ${h.length} sorteos`}</h3><div class="rb-hist">${h.map(x => `<div class="rb-hrow"><span>${esc(shortDate(x.date))}</span><span class="rb-balls sm">${[x.n1, x.n2, x.n3].map((n, i) => `<span class="rb-ball p${i + 1}">${esc(n)}</span>`).join('')}</span></div>`).join('') || '<p class="mut">Sin historial todavía.</p>'}</div></div>
        <div><div class="rb-card"><h3>🔥 Números que más salen</h3><p class="mut small">${h.length === 1 ? 'Último sorteo' : `Últimos ${h.length} sorteos`} (1ra, 2da y 3ra)</p><div class="rb-freq">${hot.map(([n, c]) => `<div><span class="rb-ball">${n}</span><small>${c} ${c === 1 ? 'vez' : 'veces'}${pos1[n] ? ` · ${pos1[n]} en 1ra` : ''}</small></div>`).join('') || '<p class="mut">—</p>'}</div></div>
        <div class="rb-card"><h3>🧊 Números atrasados</h3><p class="mut small">Los que más tiempo llevan sin salir en este período</p><div class="rb-freq">${h.length ? cold.map(([n, d]) => `<div><span class="rb-ball e2">${n}</span><small>${d ? 'último ' + esc(shortDate(d)) : 'no ha salido'}</small></div>`).join('') : '<p class="mut">—</p>'}</div></div></div></div></div>`;
    }

    /* ----- deportes ----- */
    function sports() {
      const d = S.data; const lgs = d.leagues.filter(l => d.games.some(g => g.league === l.id));
      const games = d.games.filter(g => S.league === 'todas' || (S.league === 'vivo' ? g.status === 'en_vivo' : g.league === S.league));
      const liveN = d.games.filter(g => g.status === 'en_vivo').length;
      const groups = [['en_vivo', '🔴 En vivo'], ['programado', '🕒 Próximos'], ['final', '✅ Finalizados'], ['suspendido', '⛔ Suspendidos']];
      return `<div class="rb-chips">${chip('todas', '<span class="rb-all">★</span>', 'Todas', S.league === 'todas', 'league')}${liveN ? chip('vivo', '<i class="rb-live-dot"></i>', 'En vivo (' + liveN + ')', S.league === 'vivo', 'league') : ''}${lgs.map(l => chip(l.id, leagueLogo(l, 26), l.name, S.league === l.id, 'league')).join('')}</div>
        ${!d.games.length ? `<div class="rb-empty">No hay juegos registrados para esta fecha.${S.date >= today() ? ' Los juegos se cargan automáticamente desde las ligas.' : ''}</div>` : ''}
        ${groups.map(([k, t]) => { const gs = games.filter(g => g.status === k); return gs.length ? `<div class="rb-group"><h3>${t} <small class="mut">${gs.length}</small></h3><div class="rb-grid g">${gs.map(gameCard).join('')}</div></div>` : ''; }).join('')}`;
    }
    function gameCard(g) {
      const lg = S.data.leagues.find(l => l.id === g.league); const fin = g.status === 'final'; const has = g.scoreAway != null && g.scoreHome != null;
      const wA = fin && has && g.scoreAway > g.scoreHome, wH = fin && has && g.scoreHome > g.scoreAway;
      const row = (name, lg2, abbr, rec, sc, win) => `<div class="rb-team ${win ? 'win' : ''} ${fin && !win && has ? 'lose' : ''}">${teamLogo(lg2, name, abbr)}<div class="rb-tn"><b>${esc(name)}</b>${rec ? `<small>${esc(rec)}</small>` : ''}</div><span class="rb-sc">${has ? esc(sc) : ''}</span></div>`;
      return `<div class="rb-card rb-game st-${g.status}">
        <div class="rb-gtop">${lg ? leagueLogo(lg, 20) : ''}<small>${esc(lg ? lg.name : '')}</small><span class="rb-pill ${g.status === 'en_vivo' ? 'live' : g.status === 'final' ? 'ok' : 'next'}">${g.status === 'en_vivo' ? '● ' + esc(g.period || 'En vivo') : g.status === 'final' ? esc(g.period && !/final/i.test(g.period) ? g.period : 'Final') : g.status === 'suspendido' ? 'Suspendido' : esc(timeOf(g.start))}</span></div>
        ${row(g.away, g.awayLogo, g.awayAbbr, g.awayRec, g.scoreAway, wA)}${row(g.home, g.homeLogo, g.homeAbbr, g.homeRec, g.scoreHome, wH)}
        ${g.venue ? `<small class="rb-venue">📍 ${esc(g.venue)}</small>` : ''}</div>`;
    }
    const chip = (id, icon, name, on, kind) => `<button class="rb-chip ${on ? 'on' : ''}" data-${kind}="${esc(id)}">${icon}<span>${esc(name)}</span></button>`;

    function draw() {
      const y = root.scrollTop;
      root.innerHTML = `<div class="rb">${header()}<div class="rb-body">${!S.data ? '<div class="rb-empty">Cargando resultados…</div>' : S.tab === 'loterias' ? lotteries() : sports()}</div></div>`;
      root.scrollTop = y;
      root.querySelectorAll('[data-rbtab]').forEach(b => b.onclick = () => { S.tab = b.dataset.rbtab; S.lot = null; draw(); });
      root.querySelectorAll('[data-comp]').forEach(b => b.onclick = () => { S.comp = b.dataset.comp; draw(); });
      root.querySelectorAll('[data-league]').forEach(b => b.onclick = () => { S.league = b.dataset.league; draw(); });
      root.querySelectorAll('[data-lot]').forEach(b => b.onclick = async () => { S.lot = b.dataset.lot; S.hist = null; draw(); try { S.hist = await src.history(S.lot, 60); } catch (e) { } draw(); });
      const back = root.querySelector('[data-back]'); if (back) back.onclick = () => { S.lot = null; draw(); };
      root.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => { S.date = addDays(S.date, Number(b.dataset.nav)); S.data = null; draw(); load(); });
      const td = root.querySelector('[data-today]'); if (td) td.onclick = () => { S.date = today(); S.data = null; draw(); load(); };
      const di = root.querySelector('#rb-d'); if (di) di.onchange = () => { if (di.value) { S.date = di.value; S.data = null; draw(); load(); } };
      if (opts.onState) opts.onState(S);
    }

    draw(); load();
    const every = opts.interval || (src.live ? 20000 : 30000);
    timer = setInterval(() => { if (!document.hidden) load(true); }, every);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && alive) load(true); });
    return { reload: () => load(true), destroy() { alive = false; clearInterval(timer); }, state: S };
  }

  const api = { mount, remoteSource, localSource, logo, COMPANIES, SPORT_ICON };
  if (global.BRD) global.BRD.Results = api; global.AuraResults = api;
})(typeof window !== 'undefined' ? window : globalThis);
