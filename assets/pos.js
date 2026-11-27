/* =========================================================
   BancaRD — Punto de Venta (cajero / vendedor)
   ========================================================= */
(async function () {
  const { U, DB, Auth, Lot, Sports, Tickets, Shifts, Scores, UI, KIND_NAMES, Inv, Requests, Issues } = BRD;
  BRD.captureErrors('venta');
  const root = document.getElementById('app');
  await DB.init();

  const S = {
    tab: 'loteria', lotSel: new Set(), lotLines: [], spMode: false,
    legs: [], betMode: 'directa', parlayAmt: '', sportFilter: 'todos', leagueFilter: '', dayFilter: 'hoy', q: '',
    lastTicket: null,
  };

  function start() {
    const u = Auth.user();
    if (!u) return BRD.loginScreen(root, { title: 'Punto de Venta', subtitle: 'Lotería y deportes', allow: x => Auth.hasPos(x) && (Auth.allBancas(x) || Auth.userBancas(x).length > 0), onLogin: start });
    if (!u.bancaId) return pickBanca(u);
    render();
  }

  /* usuario con varias bancas: elegir desde cuál trabajar */
  function pickBanca(u) {
    const open = Shifts.current(u);
    if (open && Auth.sees(open.bancaId, u)) { Auth.setPosBanca(open.bancaId); return render(); }
    const bancas = Auth.bancas(u).filter(b => b.status === 'activa');
    if (bancas.length === 1) { Auth.setPosBanca(bancas[0].id); return render(); }
    root.innerHTML = `<div class="login-wrap"><div class="card login"><h3>¿En qué banca va a trabajar?</h3>
      ${bancas.map(b => `<button class="btn" style="width:100%;margin:4px 0;justify-content:flex-start" data-b="${b.id}"><b>${U.esc(b.code)}</b>&nbsp;${U.esc(b.name)} <small style="margin-left:auto">${U.esc(b.zone || '')}</small></button>`).join('') || '<p class="mut">No tiene bancas activas asignadas.</p>'}
      <hr>${Auth.hasControl(u) ? '<a class="btn ghost" href="control.html">Ir al panel de control</a> ' : ''}<button class="btn ghost" id="lo">Salir</button></div></div>`;
    root.querySelectorAll('[data-b]').forEach(x => x.onclick = () => { Auth.setPosBanca(x.dataset.b); DB.log('venta.banca', (DB.get('bancas', x.dataset.b) || {}).code); render(); });
    root.querySelector('#lo').onclick = () => { Auth.logout(); start(); };
  }

  function me() { return Auth.user(); }
  function shift() { return Shifts.current(me()); }

  /* ---------------- render principal ---------------- */
  function render() {
    const u = me(); if (!u) return start();
    const b = DB.get('bancas', u.bancaId) || {};
    const sh = shift();
    if (sh && sh.bancaId !== u.bancaId && Auth.sees(sh.bancaId, u)) { Auth.setPosBanca(sh.bancaId); return render(); }
    root.innerHTML = `<div class="main" style="max-width:1400px;margin:auto">
      <div class="top">
        <div class="row"><div class="brand" style="padding:0"><i>B</i>${U.esc(b.name || '')}</div>
          <span class="pill">${U.esc(b.code || '')}</span><span class="pill">👤 ${U.esc(u.name)}</span>
          ${sh ? `<span class="badge b-ok">Turno abierto ${U.time(sh.openedAt)}</span>` : '<span class="badge b-bad">Sin turno</span>'}
          <span class="pill" title="Modo de datos">${DB.mode === 'servidor' ? '🟢 En línea' : '💾 Local'}</span>
        </div>
        <div class="row"><span class="clock" id="clock"></span>
          ${Auth.bancas(u).filter(x => x.status === 'activa').length > 1 && !sh ? '<button class="btn sm" id="swb">Cambiar banca</button>' : ''}${Auth.hasControl(u) ? '<a class="btn sm" href="control.html">Panel de control</a>' : ''}
          <button class="btn sm" id="chpw">Clave</button><button class="btn sm" id="logout">Salir</button></div>
      </div>
      <div class="tabs">
        ${[['loteria', '🎱 Lotería'], ['deporte', '🏟️ Deportes'], ['pagar', '💵 Pagar ticket'], ['tickets', '🧾 Mis tickets'], ['resultados', '📊 Resultados'], ['caja', '💰 Caja / Cuadre']].concat(Auth.can('inventory.view') || Auth.can('requests.create') ? [['inventario', '📦 Inventario' + (Inv.lowAt(u.bancaId).length || DB.all('requests').some(r => r.bancaId === u.bancaId && r.status === 'despachado') ? ' •' : '')]] : []).concat(Auth.can('issues.create') ? [['soporte', '🛠️ Reportar error']] : [])
        .map(([k, n]) => `<button class="tab ${S.tab === k ? 'on' : ''}" data-tab="${k}">${n}</button>`).join('')}
      </div>
      <div id="view"></div></div>`;
    root.querySelectorAll('[data-tab]').forEach(x => x.onclick = () => { S.tab = x.dataset.tab; render(); });
    UI.$('#logout').onclick = async () => { if (S.lotLines.length || S.legs.length) { if (!await UI.confirm('Hay jugadas sin vender. ¿Salir?')) return; } Auth.logout(); start(); };
    const swb = UI.$('#swb'); if (swb) swb.onclick = () => { Auth.setPosBanca(''); S.lotLines = []; S.legs = []; pickBanca(me()); };
    UI.$('#chpw').onclick = () => BRD.changePassword(u);
    tick();
    const v = UI.$('#view');
    if (!sh && (S.tab === 'loteria' || S.tab === 'deporte' || S.tab === 'pagar')) return viewNoShift(v);
    (({ loteria: viewLottery, deporte: viewSports, pagar: viewPay, tickets: viewTickets, resultados: viewResults, caja: viewCash, inventario: viewInventory, soporte: viewSupport })[S.tab] || viewLottery)(v);
  }

  function tick() { const c = UI.$('#clock'); if (c) c.textContent = new Intl.DateTimeFormat('es-DO', { timeZone: U.tz(), weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(new Date()); }
  setInterval(tick, 1000);

  function viewNoShift(v) {
    v.innerHTML = `<div class="card" style="max-width:420px"><h3>Abrir turno de caja</h3>
      <p class="mut">Para vender o pagar tickets debe abrir su turno indicando el fondo (efectivo inicial).</p>
      <form id="of"><div class="field"><label>Fondo inicial</label><input name="f" type="number" min="0" step="0.01" value="0"></div>
      <button class="btn pri">Abrir turno</button></form></div>`;
    UI.$('#of').onsubmit = async e => { e.preventDefault(); try { const s = Shifts.open(me(), UI.formData(e.target).f); await DB.confirm('shifts', s.id); UI.toast('Turno abierto'); render(); } catch (err) { UI.toast(err.message, 'bad'); render(); } };
  }

  /* ---------------- LOTERÍA ---------------- */
  function viewLottery(v) {
    const lots = Lot.list().filter(l => l.active);
    [...S.lotSel].forEach(id => { const l = DB.get('lotteries', id); if (!l || !Lot.status(l).open) S.lotSel.delete(id); });
    v.innerHTML = `<div class="pos">
      <div>
        <div class="card"><div class="row between"><h3>1. Seleccione lotería(s)</h3>
          <div class="row"><button class="btn sm" id="selOpen">Todas abiertas</button><button class="btn sm" id="selNone">Ninguna</button></div></div>
          <div class="lots" id="lots">${lots.map(l => {
      const st = Lot.status(l); const sel = S.lotSel.has(l.id);
      return `<div class="lot ${sel ? 'sel' : ''} ${st.open ? '' : 'closed'}" data-lot="${l.id}"><b>${U.esc(l.name)}</b><small>${U.hhmm12(Lot.timeFor(l))}</small><small style="color:${st.open ? (st.left < 15 ? 'var(--warn)' : 'var(--ac)') : 'var(--mut)'}">${st.label}</small></div>`;
    }).join('')}</div></div>
        <div class="card" style="margin-top:12px"><h3>2. Jugada</h3>
          <div class="row" style="align-items:flex-end">
            <div style="width:150px"><label>Número (2, 4 o 6 dígitos)</label><input id="num" inputmode="numeric" maxlength="8" placeholder="Ej: 25 · 2547 · 254781" autocomplete="off"></div>
            <div style="width:130px"><label>Monto</label><input id="amt" type="number" min="1" step="1" inputmode="decimal" placeholder="RD$"></div>
            <label class="chk" style="margin-bottom:9px"><input type="checkbox" id="spm" ${S.spMode ? 'checked' : ''}> Super Palé</label>
            <button class="btn pri" id="add">Agregar ⏎</button>
          </div>
          <div class="row" style="margin-top:8px">${[5, 10, 20, 25, 50, 100, 200, 500].map(a => `<button class="btn sm" data-qa="${a}">${a}</button>`).join('')}</div>
          <p class="small" id="hint" style="margin-top:8px">2 dígitos = Quiniela · 4 = Palé · 6 = Tripleta · Super Palé: marque la casilla, seleccione 2 loterías y escriba 4 dígitos. Enter en número → monto; Enter en monto → agrega.</p>
          <div class="row" style="margin-top:6px">
            <button class="btn sm" id="pales" title="Genera todos los palés posibles entre los números de quiniela agregados">Combinar palés</button>
            <button class="btn sm" id="rep">Repetir último ticket</button>
          </div>
        </div>
        <div class="card" style="margin-top:12px"><h3>Premios vigentes (por cada RD$1)</h3>${payTable()}</div>
      </div>
      <div class="card slip"><div class="row between"><h3>Ticket en preparación</h3><button class="btn sm ghost" id="clr">Limpiar</button></div>
        <div class="slip-lines">${S.lotLines.length ? S.lotLines.map((l, i) => `<div class="sl"><div><b>${KIND_NAMES[l.kind]} ${l.nums.join('-')}</b><br><small>${l.kind === 'SP' ? U.esc(Lot.name(l.lot) + ' + ' + Lot.name(l.lot2)) : U.esc(Lot.name(l.lot))}</small></div><div class="row"><b>${U.money(l.amount)}</b><button class="x" data-rm="${i}">✕</button></div></div>`).join('') : '<div class="empty">Agregue jugadas</div>'}</div>
        <div class="total-box"><span>Total</span><span>${U.money(S.lotLines.reduce((a, l) => a + Number(l.amount), 0))}</span></div>
        <div class="grid g2"><button class="btn pri lg" id="sellp" ${S.lotLines.length ? '' : 'disabled'}>Vender e imprimir</button><button class="btn lg" id="sell" ${S.lotLines.length ? '' : 'disabled'}>Vender</button></div>
      </div></div>`;

    v.querySelectorAll('[data-lot]').forEach(x => x.onclick = () => {
      const l = DB.get('lotteries', x.dataset.lot); if (!Lot.status(l).open) return UI.toast(l.name + ': ' + Lot.status(l).label, 'warn');
      S.lotSel.has(l.id) ? S.lotSel.delete(l.id) : S.lotSel.add(l.id); x.classList.toggle('sel');
    });
    UI.$('#selOpen').onclick = () => { lots.forEach(l => { if (Lot.status(l).open) S.lotSel.add(l.id); }); render(); };
    UI.$('#selNone').onclick = () => { S.lotSel.clear(); render(); };
    const num = UI.$('#num'), amt = UI.$('#amt');
    num.focus();
    num.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); amt.focus(); amt.select(); } };
    amt.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addLine(); } };
    UI.$('#spm').onchange = e => { S.spMode = e.target.checked; };
    UI.$('#add').onclick = addLine;
    v.querySelectorAll('[data-qa]').forEach(x => x.onclick = () => { amt.value = x.dataset.qa; addLine(); });
    v.querySelectorAll('[data-rm]').forEach(x => x.onclick = () => { S.lotLines.splice(+x.dataset.rm, 1); render(); });
    UI.$('#clr').onclick = () => { S.lotLines = []; render(); };
    UI.$('#sell').onclick = () => sellLottery(false);
    UI.$('#sellp').onclick = () => sellLottery(true);
    UI.$('#pales').onclick = combinePales;
    UI.$('#rep').onclick = repeatLast;

    function addLine() {
      const raw = num.value.replace(/\D/g, ''); const a = Number(amt.value);
      if (!S.lotSel.size) return UI.toast('Seleccione al menos una lotería', 'warn');
      const p = BRD.parsePlay(raw); if (!p) return UI.toast('Número inválido: use 2, 4 o 6 dígitos', 'warn');
      if (!(a > 0)) { amt.focus(); return UI.toast('Indique el monto', 'warn'); }
      const sel = [...S.lotSel];
      let newLines = [];
      if (S.spMode) {
        if (p.kind !== 'P') return UI.toast('Super Palé requiere 4 dígitos', 'warn');
        if (sel.length !== 2) return UI.toast('Super Palé: seleccione exactamente 2 loterías', 'warn');
        newLines.push({ kind: 'SP', nums: p.nums, lot: sel[0], lot2: sel[1], amount: a });
      } else newLines = sel.map(id => ({ kind: p.kind, nums: p.nums, lot: id, amount: a }));
      for (const l of newLines) {
        const err = BRD.validateLotteryLine(l, me().bancaId, S.lotLines); if (err) return UI.toast(err, 'bad', 4500);
      }
      S.lotLines.push(...newLines); render();
    }
  }

  function payTable() {
    const p = DB.cfg().pay;
    return `<div class="grid g3 small">
      <div>Quiniela 1ra: <b>${p.q1}</b><br>Quiniela 2da: <b>${p.q2}</b><br>Quiniela 3ra: <b>${p.q3}</b></div>
      <div>Palé 1ra-2da: <b>${p.p12}</b><br>Palé 1ra-3ra: <b>${p.p13}</b><br>Palé 2da-3ra: <b>${p.p23}</b></div>
      <div>Tripleta (3): <b>${p.t3.toLocaleString()}</b><br>Tripleta (2): <b>${p.t2}</b><br>Super Palé: <b>${p.sp.toLocaleString()}</b></div></div>`;
  }

  async function combinePales() {
    const qs = S.lotLines.filter(l => l.kind === 'Q');
    const byLot = {}; qs.forEach(l => (byLot[l.lot] = byLot[l.lot] || []).push(l));
    const a = Number(await UI.prompt('Monto por cada palé combinado:', '10')); if (!(a > 0)) return;
    let added = 0, errs = 0;
    for (const lot in byLot) {
      const nums = [...new Set(byLot[lot].map(l => l.nums[0]))];
      for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) {
        const l = { kind: 'P', nums: [nums[i], nums[j]], lot, amount: a };
        if (BRD.validateLotteryLine(l, me().bancaId, S.lotLines)) { errs++; continue; }
        S.lotLines.push(l); added++;
      }
    }
    UI.toast(added ? `${added} palés agregados${errs ? ` (${errs} rechazados)` : ''}` : 'Agregue al menos 2 quinielas en la misma lotería', added ? 'ok' : 'warn');
    render();
  }

  function repeatLast() {
    const t = DB.all('tickets').filter(t => t.userId === me().id && t.type === 'loteria').sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!t) return UI.toast('No hay tickets anteriores', 'warn');
    let ok = 0, bad = 0;
    t.lines.forEach(x => { const l = { kind: x.kind, nums: x.nums, lot: x.lot, lot2: x.lot2, amount: x.amount }; if (BRD.validateLotteryLine(l, me().bancaId, S.lotLines)) bad++; else { S.lotLines.push(l); ok++; } });
    UI.toast(`${ok} jugadas copiadas${bad ? `, ${bad} no disponibles (sorteo cerrado o tope)` : ''}`, bad ? 'warn' : 'ok'); render();
  }

  async function sellLottery(print) {
    // revalidar todo antes de vender
    const acc = [];
    for (const l of S.lotLines) { const err = BRD.validateLotteryLine(l, me().bancaId, acc); if (err) return UI.toast(err, 'bad', 5000); acc.push(l); }
    if (sellLottery.busy) return; sellLottery.busy = true;
    try {
      let t = Tickets.create({ type: 'loteria', lines: S.lotLines.map(l => Object.assign({}, l, { amount: Number(l.amount) })), user: me(), shift: shift() });
      t = await DB.confirm('tickets', t.id); // en modo servidor: el ticket solo vale si el servidor lo aprueba
      S.lotLines = []; S.lastTicket = t; render(); showTicket(t, print);
    } catch (e) { UI.toast(e.message, 'bad', 6000); render(); }
    finally { sellLottery.busy = false; }
  }

  /* ---------------- DEPORTES ---------------- */
  function viewSports(v) {
    const cfg = DB.cfg(); const leagues = DB.all('leagues').filter(l => l.active).sort((a, b) => a.order - b.order);
    const today = U.today(), tomorrow = U.addDays(today, 1);
    let games = DB.all('games').filter(g => {
      const lg = DB.get('leagues', g.league); if (!lg || !lg.active) return false;
      if (S.sportFilter !== 'todos' && lg.sport !== S.sportFilter) return false;
      if (S.leagueFilter && g.league !== S.leagueFilter) return false;
      if (S.dayFilter === 'hoy' && g.date !== today) return false;
      if (S.dayFilter === 'manana' && g.date !== tomorrow) return false;
      if (S.dayFilter === 'abiertos' && !Sports.isOpen(g)) return false;
      if (S.q && !(g.home + ' ' + g.away).toLowerCase().includes(S.q.toLowerCase())) return false;
      return g.status !== 'cancelado' && g.date >= U.addDays(today, -1);
    }).sort((a, b) => a.start - b.start);
    const sports = [...new Set(leagues.map(l => l.sport))];
    const byLeague = {}; games.forEach(g => (byLeague[g.league] = byLeague[g.league] || []).push(g));
    v.innerHTML = `<div class="pos"><div>
      <div class="card"><div class="row">
        <div class="row">${['todos', ...sports].map(s => `<button class="tab ${S.sportFilter === s ? 'on' : ''}" data-sp="${s}">${s === 'todos' ? 'Todos' : Sports.SPORT_ICON[s] + ' ' + Sports.SPORT_NAMES[s]}</button>`).join('')}</div></div>
        <div class="row" style="margin-top:8px">
          <select id="lg" style="width:auto"><option value="">Todas las ligas</option>${leagues.map(l => `<option value="${l.id}" ${S.leagueFilter === l.id ? 'selected' : ''}>${U.esc(l.name)}</option>`).join('')}</select>
          <select id="dy" style="width:auto">${[['hoy', 'Hoy'], ['manana', 'Mañana'], ['abiertos', 'Abiertos (todos los días)'], ['todos', 'Todos']].map(([k, n]) => `<option value="${k}" ${S.dayFilter === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <input id="q" placeholder="Buscar equipo…" value="${U.esc(S.q)}" style="width:200px">
          <button class="btn sm" id="rf">↻ Actualizar marcadores</button><span class="small" id="rfi">${Scores.lastRun ? 'Última actualización ' + U.time(Scores.lastRun) : ''}</span>
        </div></div>
      <div style="margin-top:12px">${Object.keys(byLeague).length ? Object.entries(byLeague).map(([lg, gs]) => `<h3 style="margin:14px 0 8px">${Sports.SPORT_ICON[(DB.get('leagues', lg) || {}).sport] || ''} ${U.esc((DB.get('leagues', lg) || {}).name || lg)}</h3>${gs.map(gameCard).join('')}`).join('') : '<div class="card empty">No hay juegos con estos filtros. El administrador puede cargarlos o importarlos en el panel de control.</div>'}</div>
      </div>
      <div class="card slip">${sportSlip(cfg)}</div></div>`;
    v.querySelectorAll('[data-sp]').forEach(x => x.onclick = () => { S.sportFilter = x.dataset.sp; S.leagueFilter = ''; render(); });
    UI.$('#lg').onchange = e => { S.leagueFilter = e.target.value; render(); };
    UI.$('#dy').onchange = e => { S.dayFilter = e.target.value; render(); };
    UI.$('#q').oninput = e => { S.q = e.target.value; clearTimeout(viewSports.t); viewSports.t = setTimeout(() => { render(); const q = UI.$('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 350); };
    UI.$('#rf').onclick = async () => { UI.$('#rfi').textContent = 'Actualizando…'; try { const r = await Scores.refreshAll({ ahead: true }); UI.toast(`Marcadores: ${r.updated} actualizados, ${r.imported} nuevos${r.errors ? ' · ' + r.errors + ' errores de conexión' : ''}`, r.errors ? 'warn' : 'ok'); } catch (e) { UI.toast(e.message, 'bad'); } render(); };
    v.querySelectorAll('[data-odd]').forEach(x => x.onclick = () => toggleLeg(x.dataset.g, x.dataset.m, x.dataset.s));
    bindSlip(v, cfg);
  }

  function gameCard(g) {
    const o = g.odds || {}; const open = Sports.isOpen(g); const soccer = Sports.sportOf(g) === 'futbol';
    const sel = (m, s) => S.legs.some(l => l.gameId === g.id && l.market === m && l.side === s) ? 'sel' : '';
    const btn = (m, s, main, sub) => main == null || main === '' || main === '—' ? `<div class="odd" disabled>—</div>` :
      `<button class="odd ${sel(m, s)}" data-odd data-g="${g.id}" data-m="${m}" data-s="${s}" ${open ? '' : 'disabled'}>${main}${sub ? `<small>${sub}</small>` : ''}</button>`;
    const st = g.status === 'en_vivo' ? '<span class="badge b-live">En vivo</span>' : g.status === 'final' ? '<span class="badge b-mute">Final</span>' : g.status === 'suspendido' ? '<span class="badge b-bad">Suspendido</span>' : open ? '<span class="badge b-ok">Abierto</span>' : '<span class="badge b-warn">Cerrado</span>';
    const sc = (g.scoreAway != null && g.status !== 'programado') ? `<span class="score">${g.scoreAway} - ${g.scoreHome}</span> <small>${U.esc(g.period || '')}</small>` : '';
    const spLabel = Sports.sportOf(g) === 'beisbol' ? 'Run line' : soccer ? 'Hándicap' : 'Spread';
    return `<div class="game"><div class="row between" style="margin-bottom:6px"><small>${U.dt(g.start)}</small><div class="row">${sc}${st}</div></div>
      <div class="teams"><div class="hdr">Equipo</div><div class="hdr">Ganador</div><div class="hdr">${spLabel}</div><div class="hdr">Total</div>
        <div><b>${U.esc(g.away)}</b> <small>(visitante)</small></div>${btn('ml', 'away', U.fmtOdds(o.mlAway))}${btn('rl', 'away', o.spread != null ? U.fmtLine(-o.spread) : null, U.fmtOdds(o.spAway))}${btn('tot', 'over', o.total != null ? 'Más ' + o.total : null, U.fmtOdds(o.over))}
        <div><b>${U.esc(g.home)}</b> <small>(local)</small></div>${btn('ml', 'home', U.fmtOdds(o.mlHome))}${btn('rl', 'home', o.spread != null ? U.fmtLine(o.spread) : null, U.fmtOdds(o.spHome))}${btn('tot', 'under', o.total != null ? 'Menos ' + o.total : null, U.fmtOdds(o.under))}
        ${soccer && o.mlDraw ? `<div><b>Empate</b></div>${btn('ml', 'draw', U.fmtOdds(o.mlDraw))}<div></div><div></div>` : ''}
      </div></div>`;
  }

  function legFrom(g, m, s) {
    const o = g.odds || {}; let odds, line = null;
    if (m === 'ml') odds = s === 'home' ? o.mlHome : s === 'away' ? o.mlAway : o.mlDraw;
    if (m === 'rl') { line = s === 'home' ? Number(o.spread) : -Number(o.spread); odds = s === 'home' ? o.spHome : o.spAway; }
    if (m === 'tot') { line = Number(o.total); odds = s === 'over' ? o.over : o.under; }
    return { gameId: g.id, market: m, side: s, line, odds: Number(odds), label: Sports.marketLabel(g, m, s, line), game: `${g.away} @ ${g.home}` };
  }

  function toggleLeg(gid, m, s) {
    const g = DB.get('games', gid); if (!g || !Sports.isOpen(g)) return UI.toast('Juego cerrado', 'warn');
    const i = S.legs.findIndex(l => l.gameId === gid && l.market === m && l.side === s);
    if (i >= 0) S.legs.splice(i, 1);
    else {
      const leg = legFrom(g, m, s); if (!leg.odds) return UI.toast('Línea no disponible', 'warn');
      // misma jugada contraria del mismo mercado no permitida
      S.legs = S.legs.filter(l => !(l.gameId === gid && l.market === m));
      leg.amount = ''; S.legs.push(leg);
    }
    render();
  }

  function sportSlip(cfg) {
    const sc = cfg.sports;
    const sameGame = S.legs.length !== new Set(S.legs.map(l => l.gameId)).size;
    let pot = 0, total = 0;
    if (S.betMode === 'parlay') { const a = Number(S.parlayAmt) || 0; total = a; pot = S.legs.length ? Sports.potential({ legs: S.legs, amount: a }) : 0; }
    else S.legs.forEach(l => { const a = Number(l.amount) || 0; total += a; pot += Sports.potential({ legs: [l], amount: a }); });
    return `<div class="row between"><h3>Ticket deportivo</h3><button class="btn sm ghost" id="sclr">Limpiar</button></div>
      <div class="row"><button class="tab ${S.betMode === 'directa' ? 'on' : ''}" data-bm="directa">Directas</button><button class="tab ${S.betMode === 'parlay' ? 'on' : ''}" data-bm="parlay">Parlay</button></div>
      <div class="slip-lines">${S.legs.length ? S.legs.map((l, i) => `<div class="sl"><div style="min-width:0"><b>${U.esc(l.label)}</b> <span class="pill">${U.fmtOdds(l.odds)}</span><br><small>${U.esc(l.game)}</small>
        ${S.betMode === 'directa' ? `<div class="row" style="margin-top:4px"><input type="number" min="1" class="lamt" data-i="${i}" value="${l.amount}" placeholder="Monto" style="width:110px;padding:6px"><small>Gana: ${U.money(Sports.potential({ legs: [l], amount: Number(l.amount) || 0 }))}</small></div>` : ''}</div>
        <button class="x" data-rml="${i}">✕</button></div>`).join('') : '<div class="empty">Toque una línea para agregarla</div>'}</div>
      ${S.betMode === 'parlay' ? `<div class="field"><label>Monto del parlay (${sc.minParlay}–${sc.maxParlay} jugadas)</label><input type="number" id="pamt" min="1" value="${S.parlayAmt}"></div>
        ${sameGame ? '<p class="small" style="color:var(--warn)">No se permiten dos jugadas del mismo partido en un parlay.</p>' : ''}
        <p class="small">Cuota combinada: ${S.legs.length ? '×' + S.legs.reduce((p, l) => p * U.am2dec(l.odds), 1).toFixed(2) : '—'}</p>` : `<div class="row"><input type="number" id="allamt" placeholder="Mismo monto a todas" style="width:170px"><button class="btn sm" id="setall">Aplicar</button></div>`}
      <div class="total-box"><span>Apuesta</span><span>${U.money(total)}</span></div>
      <div class="row between" style="margin-top:-6px;margin-bottom:10px"><span class="mut">A ganar</span><b style="color:var(--ac)">${U.money(pot)}</b></div>
      <div class="grid g2"><button class="btn pri lg" id="ssellp" ${S.legs.length ? '' : 'disabled'}>Vender e imprimir</button><button class="btn lg" id="ssell" ${S.legs.length ? '' : 'disabled'}>Vender</button></div>
      <p class="small">Mín. ${U.money(sc.minBet)} · Máx. ${U.money(sc.maxBet)} · Premio máx. ${U.money(sc.maxPayout)}</p>`;
  }

  function bindSlip(v, cfg) {
    v.querySelectorAll('[data-bm]').forEach(x => x.onclick = () => { S.betMode = x.dataset.bm; render(); });
    v.querySelectorAll('[data-rml]').forEach(x => x.onclick = () => { S.legs.splice(+x.dataset.rml, 1); render(); });
    v.querySelectorAll('.lamt').forEach(x => x.onchange = () => { S.legs[+x.dataset.i].amount = x.value; render(); });
    const pa = UI.$('#pamt'); if (pa) pa.onchange = () => { S.parlayAmt = pa.value; render(); };
    const sa = UI.$('#setall'); if (sa) sa.onclick = () => { const a = UI.$('#allamt').value; S.legs.forEach(l => l.amount = a); render(); };
    UI.$('#sclr').onclick = () => { S.legs = []; render(); };
    UI.$('#ssell').onclick = () => sellSports(false, cfg);
    UI.$('#ssellp').onclick = () => sellSports(true, cfg);
  }

  function sellSports(print, cfg) {
    const sc = cfg.sports; let bets = [];
    for (const l of S.legs) { const g = DB.get('games', l.gameId); if (!g || !Sports.isOpen(g)) return UI.toast('Juego cerrado: ' + l.game, 'bad'); }
    if (S.betMode === 'parlay') {
      const a = Number(S.parlayAmt);
      if (S.legs.length < sc.minParlay) return UI.toast(`Parlay requiere mínimo ${sc.minParlay} jugadas`, 'warn');
      if (S.legs.length > sc.maxParlay) return UI.toast(`Parlay máximo ${sc.maxParlay} jugadas`, 'warn');
      if (S.legs.length !== new Set(S.legs.map(l => l.gameId)).size) return UI.toast('No se permiten dos jugadas del mismo partido en un parlay', 'warn');
      bets = [{ mode: 'parlay', legs: S.legs.map(strip), amount: a }];
    } else bets = S.legs.map(l => ({ mode: 'directa', legs: [strip(l)], amount: Number(l.amount) }));
    for (const b of bets) {
      if (!(b.amount >= sc.minBet)) return UI.toast(`Apuesta mínima ${U.money(sc.minBet)}`, 'warn');
      if (b.amount > sc.maxBet) return UI.toast(`Apuesta máxima ${U.money(sc.maxBet)}`, 'warn');
      b.potential = Sports.potential(b);
    }
    if (sellSports.busy) return; sellSports.busy = true;
    (async () => {
      try {
        let t = Tickets.create({ type: 'deporte', lines: bets, user: me(), shift: shift() });
        t = await DB.confirm('tickets', t.id);
        S.legs = []; S.parlayAmt = ''; S.lastTicket = t; render(); showTicket(t, print);
      } catch (e) { UI.toast(e.message, 'bad', 7000); render(); }
      finally { sellSports.busy = false; }
    })();
    function strip(l) { return { gameId: l.gameId, market: l.market, side: l.side, line: l.line, odds: l.odds, label: l.label }; }
  }

  /* ---------------- ticket vendido ---------------- */
  function showTicket(t, print) {
    const m = UI.modal('Ticket ' + U.esc(t.code), `<div style="background:#fff;padding:8px;border-radius:8px">${BRD.ticketHTML(t)}</div>
      <div class="row" style="margin-top:12px;justify-content:center"><button class="btn pri" id="pr">🖨️ Imprimir</button>
      <a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(BRD.ticketText(t))}">WhatsApp</a>
      <button class="btn" id="cpy">Copiar</button><button class="btn ghost" data-close>Cerrar</button></div>`);
    m.querySelector('#pr').onclick = () => BRD.printTicket(t);
    m.querySelector('#cpy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(BRD.ticketText(t)).then(() => UI.toast('Copiado')); };
    if (print) BRD.printTicket(t);
  }

  /* ---------------- PAGAR ---------------- */
  function viewPay(v) {
    v.innerHTML = `<div class="grid g2"><div class="card"><h3>Verificar / pagar ticket</h3>
      <form id="pf"><div class="field"><label>Código del ticket (escanee o escriba)</label><input name="c" id="pc" autocomplete="off" placeholder="B001-XXXXXXXX"></div>
      <div class="field"><label>PIN de seguridad (impreso en el ticket)</label><input name="p" inputmode="numeric" maxlength="4"></div>
      <button class="btn pri">Buscar</button></form></div><div class="card" id="pres"><div class="empty">Escanee un ticket</div></div></div>`;
    UI.$('#pc').focus();
    UI.$('#pf').onsubmit = async e => {
      e.preventDefault(); const f = UI.formData(e.target);
      const t = await Tickets.lookup(f.c); const box = UI.$('#pres');
      if (!t) { box.innerHTML = '<div class="empty">❌ Ticket no encontrado</div>'; return; }
      BRD.gradeTicket(t); const cur = DB.get('tickets', t.id);
      box.innerHTML = `<div class="row between"><h3>${U.esc(cur.code)}</h3>${Tickets.statusBadge(cur.status)}</div>
        <p class="mut">${U.dt(cur.createdAt)} · ${U.esc((DB.get('bancas', cur.bancaId) || {}).name || '')} · ${U.esc(cur.userName || '')}</p>
        ${cur.lines.map(l => `<div class="sl"><div>${U.esc(Tickets.describeLine(cur, l))}</div><div>${l.result ? (l.result === 'win' ? `<span class="badge b-ok">+${U.money(l.prize)}</span>` : l.result === 'push' ? '<span class="badge b-info">Devolución</span>' : '<span class="badge b-mute">No</span>') : '<span class="badge b-warn">Pend.</span>'}</div></div>`).join('')}
        <div class="total-box"><span>Jugado</span><span>${U.money(cur.total)}</span></div>
        <div class="total-box" style="color:var(--ac)"><span>Premio</span><span>${U.money(cur.prize)}</span></div>
        ${cur.status === 'ganador' ? '<button class="btn pri lg" id="dopay" style="width:100%">Pagar premio</button>' : ''}
        ${cur.status === 'pagado' ? `<p class="mut">Pagado ${U.dt(cur.paidAt)} por ${U.esc(cur.paidBy)}</p>` : ''}`;
      const bp = UI.$('#dopay');
      if (bp) bp.onclick = async () => {
        if (!await UI.confirm(`¿Confirmar pago de ${U.money(cur.prize)}?`)) return;
        try { const t2 = Tickets.pay(cur, me(), f.p, shift()); await DB.confirm('tickets', t2.id); UI.toast('Premio pagado: ' + U.money(cur.prize)); UI.$('#pf').dispatchEvent(new Event('submit')); }
        catch (err) { UI.toast(err.message, 'bad', 5000); }
      };
    };
  }

  /* ---------------- MIS TICKETS ---------------- */
  function viewTickets(v) {
    const u = me(); const sh = shift();
    const scope = viewTickets.scope || 'turno';
    let list = DB.all('tickets').filter(t => scope === 'turno' ? (sh && t.shiftId === sh.id) : scope === 'hoy' ? (t.userId === u.id && t.date === U.today()) : (t.bancaId === u.bancaId && t.date === U.today()));
    list.sort((a, b) => b.createdAt - a.createdAt);
    v.innerHTML = `<div class="card"><div class="row between"><h3>Tickets</h3><div class="row">
      <select id="sc" style="width:auto">${[['turno', 'Turno actual'], ['hoy', 'Mis tickets de hoy'], ['banca', 'Toda la banca hoy']].map(([k, n]) => `<option value="${k}" ${scope === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
      <div class="tbl-wrap"><table><thead><tr><th>Hora</th><th>Ticket</th><th>Tipo</th><th>Detalle</th><th class="num">Monto</th><th class="num">Premio</th><th>Estado</th><th></th></tr></thead><tbody>
      ${list.map(t => `<tr><td>${U.time(t.createdAt)}</td><td><b>${U.esc(t.code)}</b></td><td>${t.type === 'loteria' ? '🎱' : '🏟️'}</td><td class="small">${t.lines.slice(0, 3).map(l => U.esc(Tickets.describeLine(t, l))).join('<br>')}${t.lines.length > 3 ? '<br>…' : ''}</td><td class="num">${U.money(t.total)}</td><td class="num">${t.prize ? U.money(t.prize) : ''}</td><td>${Tickets.statusBadge(t.status)}</td>
        <td><div class="row"><button class="btn sm" data-v="${t.id}">Ver</button>${t.status === 'pendiente' ? `<button class="btn sm bad" data-x="${t.id}">Anular</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="8" class="empty">Sin tickets</td></tr>'}
      </tbody></table></div></div>`;
    UI.$('#sc').onchange = e => { viewTickets.scope = e.target.value; render(); };
    v.querySelectorAll('[data-v]').forEach(x => x.onclick = () => showTicket(DB.get('tickets', x.dataset.v), false));
    v.querySelectorAll('[data-x]').forEach(x => x.onclick = async () => {
      const t = DB.get('tickets', x.dataset.x); const err = Tickets.canVoid(t, me()); if (err) return UI.toast(err, 'bad', 5000);
      const reason = await UI.prompt('Motivo de anulación:'); if (reason === null) return;
      try { Tickets.void(t, me(), reason); await DB.confirm('tickets', t.id); UI.toast('Ticket anulado'); render(); } catch (e) { UI.toast(e.message, 'bad', 5000); render(); }
    });
  }

  /* ---------------- RESULTADOS ---------------- */
  function viewResults(v) {
    const d = viewResults.date || U.today();
    const lots = Lot.list();
    const games = DB.all('games').filter(g => g.date === d).sort((a, b) => a.start - b.start);
    v.innerHTML = `<div class="row" style="margin-bottom:10px"><label style="margin:0">Fecha</label><input type="date" id="rd" value="${d}" style="width:auto"></div>
      <div class="grid g2"><div class="card"><h3>Loterías</h3><table><tbody>${lots.map(l => { const r = DB.get('results', l.id + '_' + d); return `<tr><td><b>${U.esc(l.name)}</b><br><small>${U.hhmm12(Lot.timeFor(l, d))}</small></td><td>${r ? `<span class="ball">${r.n1}</span><span class="ball b2">${r.n2}</span><span class="ball b3">${r.n3}</span>` : '<span class="mut">Pendiente</span>'}</td></tr>`; }).join('')}</tbody></table></div>
      <div class="card"><h3>Marcadores</h3>${games.length ? `<table><tbody>${games.map(g => `<tr><td><small>${U.time(g.start)} · ${U.esc((DB.get('leagues', g.league) || {}).name || '')}</small><br>${U.esc(g.away)}<br>${U.esc(g.home)}</td><td class="num score">${g.scoreAway != null && g.status !== 'programado' ? g.scoreAway + '<br>' + g.scoreHome : ''}</td><td>${g.status === 'en_vivo' ? '<span class="badge b-live">En vivo</span>' : `<span class="badge">${g.status}</span>`}<br><small>${U.esc(g.period || '')}</small></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sin juegos</div>'}</div></div>`;
    UI.$('#rd').onchange = e => { viewResults.date = e.target.value; render(); };
  }

  /* ---------------- CAJA ---------------- */
  function viewCash(v) {
    const sh = shift(); const u = me();
    const hist = DB.all('shifts').filter(s => s.userId === u.id && s.status === 'cerrado').sort((a, b) => b.closedAt - a.closedAt).slice(0, 15);
    if (!sh) { viewNoShift(v); v.insertAdjacentHTML('beforeend', histTable(hist)); bindHist(v); return; }
    const s = Shifts.summary(sh);
    const exps = DB.all('expenses').filter(e => e.shiftId === sh.id);
    v.innerHTML = `<div class="grid g4">
      <div class="card kpi"><div class="l">Fondo</div><div class="v">${U.money(sh.fondo)}</div></div>
      <div class="card kpi ok"><div class="l">Ventas (${s.tickets})</div><div class="v">${U.money(s.ventas)}</div><small>Lotería ${U.money(s.ventasLot)} · Deportes ${U.money(s.ventasDep)}</small></div>
      <div class="card kpi bad"><div class="l">Premios pagados (${s.pagados})</div><div class="v">${U.money(s.pagos)}</div></div>
      <div class="card kpi warn"><div class="l">Efectivo esperado</div><div class="v">${U.money(s.esperado)}</div><small>Gastos ${U.money(s.gastos)} · Anulados ${s.anulados} (${U.money(s.montoAnulado)})</small></div></div>
      <div class="grid g2" style="margin-top:12px">
      <div class="card"><h3>Gastos / salidas de caja</h3><form id="ef" class="row"><input name="c" placeholder="Concepto" required style="flex:2"><input name="a" type="number" min="1" step="0.01" placeholder="Monto" required style="flex:1"><button class="btn">Agregar</button></form>
        <table style="margin-top:8px"><tbody>${exps.map(e => `<tr><td>${U.time(e.at)}</td><td>${U.esc(e.concept)}</td><td class="num">${U.money(e.amount)}</td></tr>`).join('') || '<tr><td class="mut">Sin gastos</td></tr>'}</tbody></table></div>
      <div class="card"><h3>Cerrar turno (cuadre)</h3><form id="cf"><div class="field"><label>Efectivo contado en caja</label><input name="d" type="number" step="0.01" required></div>
        <div class="field"><label>Nota</label><input name="n"></div><button class="btn warn">Cerrar turno</button></form></div></div>
      ${histTable(hist)}`;
    UI.$('#ef').onsubmit = async e => { e.preventDefault(); const f = UI.formData(e.target); DB.put('expenses', { id: U.uid('e_'), shiftId: sh.id, bancaId: u.bancaId, userId: u.id, concept: f.c, amount: Number(f.a), at: Date.now(), date: U.today() }); DB.log('caja.gasto', `${f.c} ${f.a}`); render(); };
    UI.$('#cf').onsubmit = async e => {
      e.preventDefault(); const f = UI.formData(e.target);
      if (!await UI.confirm('¿Cerrar el turno? No podrá vender hasta abrir uno nuevo.')) return;
      try { const c = Shifts.close(sh, f.d, f.n); const ok = await DB.confirm('shifts', c.id); printShift(ok || c); } catch (err) { UI.toast(err.message, 'bad'); } render();
    };
    bindHist(v);
  }
  function histTable(hist) {
    return `<div class="card" style="margin-top:12px"><h3>Turnos anteriores</h3><table><thead><tr><th>Apertura</th><th>Cierre</th><th class="num">Ventas</th><th class="num">Pagos</th><th class="num">Esperado</th><th class="num">Declarado</th><th class="num">Diferencia</th><th></th></tr></thead><tbody>
      ${hist.map(s => `<tr><td>${U.dt(s.openedAt)}</td><td>${U.dt(s.closedAt)}</td><td class="num">${U.money(s.resumen.ventas)}</td><td class="num">${U.money(s.resumen.pagos)}</td><td class="num">${U.money(s.resumen.esperado)}</td><td class="num">${U.money(s.declarado)}</td><td class="num" style="color:${s.diferencia < 0 ? 'var(--bad)' : 'var(--ac)'}">${U.money(s.diferencia)}</td><td><button class="btn sm" data-ps="${s.id}">Imprimir</button></td></tr>`).join('') || '<tr><td colspan="8" class="mut">Sin turnos cerrados</td></tr>'}</tbody></table></div>`;
  }
  function bindHist(v) { v.querySelectorAll('[data-ps]').forEach(x => x.onclick = () => printShift(DB.get('shifts', x.dataset.ps))); }
  function printShift(s) {
    const r = s.resumen || Shifts.summary(s); const b = DB.get('bancas', s.bancaId) || {}; const cfg = DB.cfg();
    let el = document.getElementById('print-area'); if (!el) { el = document.createElement('div'); el.id = 'print-area'; document.body.appendChild(el); }
    const row = (a, b) => `<div class="tk-row"><span>${a}</span><span>${b}</span></div>`;
    el.innerHTML = `<div class="ticket"><div class="tk-c tk-h">${U.esc(cfg.company)}</div><div class="tk-c">CUADRE DE CAJA</div><div class="tk-c">${U.esc(b.name || '')}</div><div class="tk-hr"></div>
      ${row('Cajero', U.esc(s.userName))}${row('Apertura', U.dt(s.openedAt))}${row('Cierre', U.dt(s.closedAt))}<div class="tk-hr"></div>
      ${row('Fondo', U.money(s.fondo))}${row('Ventas lotería', U.money(r.ventasLot))}${row('Ventas deportes', U.money(r.ventasDep))}${row('Total ventas', U.money(r.ventas))}${row('Tickets', r.tickets)}${row('Anulados', r.anulados + ' / ' + U.money(r.montoAnulado))}${row('Premios pagados', U.money(r.pagos))}${row('Gastos', U.money(r.gastos))}<div class="tk-hr"></div>
      ${row('<b>ESPERADO</b>', '<b>' + U.money(r.esperado) + '</b>')}${row('Declarado', U.money(s.declarado))}${row('<b>DIFERENCIA</b>', '<b>' + U.money(s.diferencia) + '</b>')}
      <br><br><div class="tk-c">______________________<br>Firma cajero</div></div>`;
    setTimeout(() => window.print(), 50);
  }

  /* ---------------- INVENTARIO (banca) ---------------- */
  function viewInventory(v) {
    const u = me(); const b = u.bancaId;
    const items = DB.all('items').filter(i => i.active !== false).sort((a, c) => (a.category || '').localeCompare(c.category || '') || a.name.localeCompare(c.name));
    const reqs = DB.all('requests').filter(r => r.bancaId === b).sort((a, c) => c.at - a.at).slice(0, 20);
    const arriving = reqs.filter(r => r.status === 'despachado');
    v.innerHTML = `${arriving.length ? `<div class="card" style="border-color:var(--ac);margin-bottom:12px"><b>🚚 Material en camino:</b> ${arriving.map(r => `<button class="btn sm pri" data-o="${r.id}">${U.esc(r.code)} — confirmar recibido</button>`).join(' ')}</div>` : ''}
      <div class="grid g2"><div class="card"><div class="row between"><h3>Existencia en ${U.esc(Inv.locName(b))}</h3>${Auth.can('requests.create') ? '<button class="btn pri sm" id="np">Pedir material</button>' : ''}</div>
        <table><thead><tr><th>Artículo</th><th class="num">Tengo</th><th class="num">Mín.</th><th class="num">En camino</th><th></th></tr></thead><tbody>
        ${items.map(i => { const q = Inv.qty(b, i.id), mn = Inv.min(b, i), tr = Inv.inTransit(b, i.id); return `<tr><td>${U.esc(i.name)}<br><small>${U.esc(i.category || '')}</small></td><td class="num ${q <= 0 && mn ? 'zero' : q <= mn && mn ? 'low' : ''}">${q} ${U.esc(i.unit)}</td><td class="num">${mn}</td><td class="num">${tr || ''}</td><td>${Auth.can('inventory.use') && q > 0 ? `<button class="btn sm" data-use="${i.id}">Usé</button>` : ''}</td></tr>`; }).join('')}</tbody></table>
        <p class="small">Pulse <b>Usé</b> cuando gaste material (por ejemplo, un rollo de papel). Así el supervisor sabe cuándo reponer.</p></div>
      <div class="card"><h3>Mis pedidos</h3><table><tbody>${reqs.map(r => `<tr><td><b>${U.esc(r.code)}</b><br><small>${U.dt(r.at)} · ${U.esc(r.byName)}</small></td><td class="small">${r.lines.map(l => `${U.esc((DB.get('items', l.itemId) || {}).name || '')}: ${l.qty}`).join('<br>')}</td><td>${Requests.badge(r.status)}</td><td><button class="btn sm" data-o="${r.id}">Ver</button></td></tr>`).join('') || '<tr><td class="mut">Aún no ha pedido material</td></tr>'}</tbody></table></div></div>`;
    const np = UI.$('#np'); if (np) np.onclick = () => BRD.requestForm(b);
    v.querySelectorAll('[data-o]').forEach(x => x.onclick = () => BRD.requestModal(DB.get('requests', x.dataset.o)));
    v.querySelectorAll('[data-use]').forEach(x => x.onclick = async () => {
      const it = DB.get('items', x.dataset.use); const q = await UI.prompt(`¿Cuántos ${it.unit}(s) de ${it.name} usó?`, '1'); if (q === null) return;
      try { Inv.move({ type: 'consumo', itemId: it.id, qty: Number(q), from: b, note: 'Registrado en venta' }); UI.toast('Consumo registrado'); render(); } catch (e) { UI.toast(e.message, 'bad'); }
    });
  }

  /* ---------------- SOPORTE (reportar errores) ---------------- */
  function viewSupport(v) {
    const u = me();
    const list = DB.all('issues').filter(i => i.by === u.username || i.bancaId === u.bancaId).sort((a, c) => c.at - a.at).slice(0, 30);
    v.innerHTML = `<div class="grid g2"><div class="card"><h3>¿Algo no funciona?</h3><p class="mut">Reporte cualquier problema: impresora, sistema, internet, un ticket, la caja… Su supervisor y la oficina lo verán y le responderán aquí mismo.</p>
      <div class="row">${Object.entries(Issues.CATS).map(([k, n]) => `<button class="btn" data-cat="${k}">${n}</button>`).join('')}</div></div>
      <div class="card"><h3>Mis reportes</h3><table><tbody>${list.map(i => `<tr><td><b>${U.esc(i.code)}</b> ${U.esc(i.title)}<br><small>${U.dt(i.at)} · ${(i.comments || []).length} respuesta(s)</small></td><td>${Issues.badge(Issues.ST, i.status)}</td><td><button class="btn sm" data-o="${i.id}">Ver</button></td></tr>`).join('') || '<tr><td class="mut">Sin reportes</td></tr>'}</tbody></table></div></div>`;
    v.querySelectorAll('[data-cat]').forEach(x => x.onclick = () => { BRD.issueForm(u.bancaId); const sel = document.querySelector('#isf [name=category]'); if (sel) sel.value = x.dataset.cat; });
    v.querySelectorAll('[data-o]').forEach(x => x.onclick = () => BRD.issueModal(DB.get('issues', x.dataset.o)));
  }

  BRD.rerender = () => render();
  DB.on(c => { if (c === 'auth') { UI.toast('Su sesión venció. Entre de nuevo.', 'warn'); start(); } });
  /* refrescos */
  DB.on(c => {
    if (!Auth.user()) return;
    const a = document.activeElement; if (a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA')) return;
    if (document.getElementById('modal')) return;
    if (['tickets', 'results', 'games', 'lotteries', 'config', '*', 'requests', 'issues', 'stock'].includes(c) && ['resultados', 'tickets', 'deporte', 'caja', 'inventario', 'soporte'].includes(S.tab)) render();
  });
  setInterval(() => { // estados de cierre de loterías
    if (S.tab === 'loteria' && Auth.user() && !document.getElementById('modal')) {
      UI.$$('[data-lot]').forEach(x => { const l = DB.get('lotteries', x.dataset.lot); if (!l) return; const st = Lot.status(l); x.classList.toggle('closed', !st.open); x.querySelectorAll('small')[1].textContent = st.label; if (!st.open && S.lotSel.has(l.id)) { S.lotSel.delete(l.id); x.classList.remove('sel'); } });
    }
    BRD.gradeAll();
  }, 20000);
  Scores.startAuto();
  start();
})();
