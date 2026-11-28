/* =========================================================
   AuraSport — Panel de Control (administración de bancas)
   ========================================================= */
(async function () {
  const { U, DB, Auth, Lot, Sports, Tickets, Shifts, Scores, Reports, UI, KIND_NAMES, Inv, Requests, Issues } = BRD;
  const { requestForm, requestModal, issueForm, issueModal, Brand, Docs } = BRD;
  BRD.captureErrors('panel');
  const root = document.getElementById('app');
  await DB.init();

  const NAV = [
    ['sep', 'General'],
    ['dashboard', '📈', 'Dashboard', 'dashboard'],
    ['sep', 'Ventas'],
    ['tickets', '🧾', 'Tickets', 'tickets.view'],
    ['reportes', '📑', 'Reportes de ventas', 'reports'],
    ['turnos', '💰', 'Cuadres / Turnos', 'shifts.view'],
    ['sep', 'Operación'],
    ['resultados', '🎱', 'Resultados lotería', 'results'],
    ['deportes', '🏟️', 'Juegos y líneas', 'games'],
    ['limites', '⛔', 'Topes y bloqueos', 'limits'],
    ['sep', 'Puntos de venta'],
    ['consorcios', '🏢', 'Consorcios', '@platform'],
    ['miconsorcio', '🏢', 'Mi consorcio', '@consorcio'],
    ['bancas', '🏪', 'Bancas', 'bancas.view'],
    ['staff', '👥', 'Staff', 'staff.view'],
    ['roles', '🔐', 'Roles y permisos', 'roles'],
    ['sep', 'Inventario'],
    ['inventario', '📦', 'Existencias', 'inventory.view', 'inventory.edit'],
    ['pedidos', '🚚', 'Pedidos de material', 'requests.create', 'requests.approve', 'inventory.edit'],
    ['sep', 'Soporte'],
    ['soporte', '🛠️', 'Reportes de errores', 'issues.create', 'issues.manage'],
    ['syserr', '🐞', 'Errores del sistema', 'syserrors'],
    ['sep', 'Sistema'],
    ['loterias', '🗓️', 'Loterías y horarios', 'lotteries'],
    ['config', '⚙️', 'Configuración', 'config'],
    ['apariencia', '🎨', 'Apariencia e impresoras', '@all'],
    ['auditoria', '🛡️', 'Auditoría', 'audit.view'],
    ['informe', '📘', 'Informe del sistema', 'dashboard'],
  ];
  const navOk = n => n.slice(3).some(p => p === '@all' ? true : p === '@platform' ? Auth.isPlatform() && (Auth.can('bancas.edit') || Auth.can('consorcio')) : p === '@consorcio' ? !Auth.isPlatform() && Auth.can('consorcio') : Auth.can(p));
  /* almacenes centrales visibles (plataforma: el general + uno por consorcio) */
  function centralLocs() {
    if (!Auth.allBancas()) return [];
    const cs = Auth.consorcios().map(c => ({ id: Inv.centralOf(c.id), code: 'ALM-' + c.code, name: 'Almacén ' + c.name }));
    return Auth.isPlatform() ? [{ id: 'central', code: 'ALM', name: 'Almacén general' }].concat(cs) : cs;
  }
  const consName = id => (DB.get('consorcios', id) || {}).name || '';
  function navHTML(r, bd) {
    let out = '', sep = null;
    NAV.forEach(n => {
      if (n[0] === 'sep') { sep = n[1]; return; }
      if (!navOk(n)) return;
      if (sep) { out += `<div class="sep">${sep}</div>`; sep = null; }
      out += `<a href="#${n[0]}" class="${r === n[0] ? 'on' : ''}">${n[1]} ${n[2]}${bd[n[0]] ? `<span class="nb">${bd[n[0]]}</span>` : ''}</a>`;
    });
    return out;
  }
  /* contadores para el menú */
  function badges() {
    const sc = Auth.scope(); const inSc = id => sc === null || sc.includes(id);
    const reqs = DB.all('requests').filter(r => inSc(r.bancaId));
    const iss = DB.all('issues').filter(i => inSc(i.bancaId) || (!i.bancaId && sc === null));
    return {
      pedidos: Auth.can('requests.approve') ? reqs.filter(r => r.status === 'pendiente' || r.status === 'aprobado').length : reqs.filter(r => r.status === 'despachado').length,
      soporte: Auth.can('issues.manage') ? iss.filter(i => i.status === 'abierto' || i.status === 'en_proceso').length : 0,
      syserr: DB.all('syserrors').filter(e => !e.resolved).length,
      inventario: Auth.bancas().reduce((a, b) => a + Inv.lowAt(b.id).length, 0) + centralLocs().reduce((a, l) => a + Inv.lowAt(l.id).length, 0),
    };
  }

  function start() {
    const u = Auth.user();
    if (!u) return BRD.loginScreen(root, { title: 'Panel de Control', subtitle: 'Administración de bancas y staff', allow: x => Auth.hasControl(x), onLogin: start });
    if (!Auth.hasControl(u)) { Auth.logout(); return start(); }
    render();
  }
  function route() { return (location.hash || '#dashboard').slice(1).split('?')[0]; }
  window.addEventListener('hashchange', () => Auth.user() && render());

  function render() {
    const u = Auth.user(); if (!u) return start();
    let r = route(); let item = NAV.find(n => n[0] === r);
    if (!item || !navOk(item)) { item = NAV.find(n => n[0] !== 'sep' && navOk(n)); r = item[0]; }
    const bd = badges(); Brand.refresh();
    const br = Brand.for({ consorcioId: u.consorcioId || '' });
    root.innerHTML = `<div class="app"><aside class="side" id="side">
      <div class="brand">${Brand.logoHTML({ consorcioId: u.consorcioId || '' })}<span>${U.esc(u.consorcioId ? br.name : 'AuraSport')}<br><small class="mut" style="font-weight:400">${u.consorcioId ? 'AuraSport' : 'Plataforma'}</small></span></div>
      <nav class="nav">${navHTML(r, bd)}</nav>
      <div style="margin-top:auto;padding:10px" class="small">👤 ${U.esc(u.name)}<br>${U.esc(Auth.roleName(u))}<br>${Auth.allBancas(u) ? (u.consorcioId ? 'Todas las bancas del consorcio' : 'Todos los consorcios') : Auth.userBancas(u).length + ' banca(s)'}<br>Datos: <b>${DB.mode}</b><br>
      <div class="row" style="margin-top:8px">${Auth.hasPos(u) ? '<a class="btn sm" href="pos.html">Ir a venta</a>' : ''}<button class="btn sm" id="pw">Clave</button><button class="btn sm" id="lo">Salir</button></div></div>
      </aside><main class="main"><div class="top"><div class="row"><button class="btn sm menu-btn" id="mb">☰</button><h2 id="ttl">${item[2]}</h2></div><div class="row" id="actions"></div></div><div id="view"></div></main></div>`;
    UI.$('#lo').onclick = () => { Auth.logout(); start(); };
    UI.$('#pw').onclick = () => BRD.changePassword(u);
    UI.$('#mb').onclick = () => UI.$('#side').classList.toggle('open');
    const views = { consorcios, miconsorcio, apariencia, dashboard, tickets, reportes, turnos, resultados, deportes, limites, bancas, staff, roles, inventario, pedidos, soporte, syserr, loterias, config, auditoria, informe };
    views[r](UI.$('#view'), UI.$('#actions'));
  }

  /* ======================= CONSORCIOS ======================= */
  function consorcios(v, act) {
    const list = Auth.consorcios(); const d = U.today();
    act.innerHTML = '<button class="btn sm pri" id="nc">+ Nuevo consorcio</button>';
    v.innerHTML = `<p class="mut">Cada consorcio agrupa sus bancas y su personal. El logo, el tema y la plantilla de factura del consorcio se aplican a todas sus bancas (cada banca puede tener los suyos).</p>
      <div class="tbl-wrap"><table><thead><tr><th>Logo</th><th>Código</th><th>Consorcio</th><th>RNC / Contacto</th><th class="num">Bancas</th><th class="num">Staff</th><th class="num">Ventas hoy</th><th>Tema</th><th>Estado</th><th></th></tr></thead><tbody>
      ${list.map(c => { const bs = DB.all('bancas').filter(b => b.consorcioId === c.id); const ids = new Set(bs.map(b => b.id)); const ve = DB.all('tickets').filter(t => ids.has(t.bancaId) && t.date === d && t.status !== 'anulado').reduce((a, t) => a + t.total, 0);
      return `<tr><td>${c.logo ? `<img src="${U.esc(c.logo)}" style="height:34px;max-width:90px;object-fit:contain;background:#fff;border-radius:6px;padding:2px">` : '<span class="mut">—</span>'}</td><td><b>${U.esc(c.code)}</b></td><td><b>${U.esc(c.name)}</b></td><td class="small">${U.esc(c.rnc ? 'RNC ' + c.rnc : '')}<br>${U.esc(c.phone || '')}</td>
        <td class="num">${bs.length}</td><td class="num">${DB.all('users').filter(u => u.consorcioId === c.id).length}</td><td class="num">${U.money(ve)}</td><td>${U.esc((Brand.THEMES[c.theme] || Brand.THEMES.aurasport).name)}</td>
        <td><span class="badge ${c.status === 'suspendido' ? 'b-bad' : 'b-ok'}">${c.status || 'activo'}</span></td>
        <td><div class="row"><button class="btn sm" data-e="${c.id}">Editar</button><button class="btn sm" data-a="${c.id}">+ Administrador</button><button class="btn sm ${c.status === 'suspendido' ? '' : 'warn'}" data-t="${c.id}">${c.status === 'suspendido' ? 'Activar' : 'Suspender'}</button></div></td></tr>`; }).join('') || '<tr><td colspan="10" class="empty">Aún no hay consorcios. Cree el primero.</td></tr>'}</tbody></table></div>`;
    UI.$('#nc').onclick = () => consorcioForm(null);
    v.querySelectorAll('[data-e]').forEach(b => b.onclick = () => consorcioForm(DB.get('consorcios', b.dataset.e)));
    v.querySelectorAll('[data-a]').forEach(b => b.onclick = () => userForm(null, { consorcioId: b.dataset.a, role: 'admin_consorcio' }));
    v.querySelectorAll('[data-t]').forEach(b => b.onclick = async () => { const c = DB.get('consorcios', b.dataset.t); const ns = c.status === 'suspendido' ? 'activo' : 'suspendido'; if (!await UI.confirm(ns === 'suspendido' ? `¿Suspender ${c.name}? Ninguna de sus bancas podrá vender ni su personal entrar.` : `¿Activar ${c.name}?`)) return; DB.patch('consorcios', c.id, { status: ns }); DB.log('consorcio.estado', c.name + ' → ' + ns); render(); });
  }
  function miconsorcio(v) {
    const c = DB.get('consorcios', Auth.consorcio()); if (!c) { v.innerHTML = '<div class="empty">Su usuario no pertenece a un consorcio.</div>'; return; }
    consorcioForm(c, v);
  }
  /* formulario del consorcio: datos, logo, tema y plantilla de factura (en modal o dentro de la vista) */
  function consorcioForm(c, inline) {
    const isNew = !c; const plat = Auth.isPlatform();
    c = c || { code: 'C' + String(DB.all('consorcios').length + 1).padStart(2, '0'), status: 'activo', theme: 'aurasport', logo: '', invoice: {} };
    const inv = Object.assign({}, Brand.DEFAULT_INVOICE, c.invoice || {});
    const html = `<form id="cf2"><div class="tabs">${[['datos', 'Datos'], ['logo', 'Logo y tema'], ['fact', 'Plantilla de factura']].map(([k, n], i) => `<button type="button" class="tab ${i ? '' : 'on'}" data-ct="${k}">${n}</button>`).join('')}</div>
      <div data-cp="datos"><div class="grid g2">
        <div class="field"><label>Código</label><input name="code" value="${U.esc(c.code)}" maxlength="6" ${plat ? '' : 'readonly'} required></div>
        <div class="field"><label>Nombre del consorcio</label><input name="name" value="${U.esc(c.name || '')}" required></div>
        <div class="field"><label>RNC</label><input name="rnc" value="${U.esc(c.rnc || '')}"></div>
        <div class="field"><label>Teléfono</label><input name="phone" value="${U.esc(c.phone || '')}"></div>
        <div class="field"><label>Correo</label><input name="email" value="${U.esc(c.email || '')}"></div>
        <div class="field"><label>Dirección</label><input name="address" value="${U.esc(c.address || '')}"></div></div></div>
      <div data-cp="logo" hidden><label>Logo del consorcio (se usa en todas sus bancas, recibos e informes)</label>
        <div class="logo-box"><span id="lprev">${c.logo ? `<img src="${U.esc(c.logo)}">` : '<span class="mut">Sin logo</span>'}</span><label class="btn sm" style="margin:0">Subir logo<input type="file" id="lfile" accept="image/*" hidden></label><button type="button" class="btn sm ghost" id="lrm">Quitar</button></div>
        <h4>Tema de colores</h4>${Brand.themePicker(c.theme || 'aurasport', 'theme')}<p class="small">Cada equipo puede cambiar su tema en <b>Apariencia e impresoras</b>.</p></div>
      <div data-cp="fact" hidden><p class="small">Esta plantilla la usan todas las bancas del consorcio. En cada banca puede personalizarse.</p>${Brand.invoiceEditor(inv)}</div>
      <button class="btn pri" style="margin-top:12px">${isNew ? 'Crear consorcio' : 'Guardar'}</button></form>`;
    let m;
    if (inline) { inline.innerHTML = `<div class="card">${html}</div>`; m = inline; } else m = UI.modal(isNew ? 'Nuevo consorcio' : 'Consorcio ' + U.esc(c.name), html, { wide: true });
    let logo = c.logo || '';
    m.querySelectorAll('[data-ct]').forEach(t => t.onclick = () => { m.querySelectorAll('[data-ct]').forEach(x => x.classList.toggle('on', x === t)); m.querySelectorAll('[data-cp]').forEach(p => p.hidden = p.dataset.cp !== t.dataset.ct); });
    m.querySelector('#lfile').onchange = async e => { try { logo = await Brand.readLogo(e.target.files[0]); m.querySelector('#lprev').innerHTML = `<img src="${logo}">`; } catch (err) { UI.toast(err.message, 'bad'); } };
    m.querySelector('#lrm').onclick = () => { logo = ''; m.querySelector('#lprev').innerHTML = '<span class="mut">Sin logo</span>'; };
    m.querySelectorAll('input[name=theme]').forEach(r => r.onchange = () => Brand.applyTheme(r.value));
    Brand.bindInvoiceEditor(m.querySelector('[data-cp=fact]'), (DB.all('bancas').find(b => b.consorcioId === c.id) || {}).id, c.id, false);
    m.querySelector('#cf2').onsubmit = async e => {
      e.preventDefault(); const f = UI.formData(e.target); const th = m.querySelector('input[name=theme]:checked');
      const code = String(f.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (DB.all('consorcios').some(x => x.code === code && x.id !== c.id)) return UI.toast('Ese código ya existe', 'warn');
      const rec = Object.assign({}, c, { code, name: f.name.trim(), rnc: f.rnc, phone: f.phone, email: f.email, address: f.address, logo, theme: th ? th.value : 'aurasport', invoice: Brand.readInvoice(m.querySelector('[data-cp=fact]')) });
      if (!rec.id) { rec.id = U.uid('c_'); rec.createdAt = Date.now(); }
      DB.put('consorcios', rec);
      try { await DB.confirm('consorcios', rec.id); } catch (err) { return UI.toast(err.message, 'bad', 6000); }
      DB.log(isNew ? 'consorcio.creado' : 'consorcio.editado', rec.code + ' ' + rec.name); UI.toast(isNew ? 'Consorcio creado. Ahora cree sus bancas y su administrador.' : 'Guardado');
      if (!inline) UI.closeModal(); render();
    };
  }
  /* banca: logo, tema y factura propios */
  function bancaBrandForm(b) {
    const base = Brand.for({ consorcioId: b.consorcioId });
    const inv = Object.assign({}, base.invoice, b.invoice && b.invoice.custom ? b.invoice : {}, { custom: !!(b.invoice && b.invoice.custom) });
    const m = UI.modal('Logo, tema y factura — ' + U.esc(b.name), `<form id="bb"><div class="tabs"><button type="button" class="tab on" data-ct="logo">Logo y tema</button><button type="button" class="tab" data-ct="fact">Factura</button></div>
      <div data-cp="logo"><label>Logo de la banca (si no sube uno, usa el del consorcio)</label>
      <div class="logo-box"><span id="lprev">${b.logo ? `<img src="${U.esc(b.logo)}">` : base.logo ? `<img src="${U.esc(base.logo)}" style="opacity:.5" title="Logo del consorcio">` : '<span class="mut">Sin logo</span>'}</span><label class="btn sm" style="margin:0">Subir logo propio<input type="file" id="lfile" accept="image/*" hidden></label><button type="button" class="btn sm ghost" id="lrm">Usar el del consorcio</button></div>
      <h4>Tema</h4><label class="chk"><input type="checkbox" id="thc" ${b.theme ? '' : 'checked'}> Usar el tema del consorcio (${U.esc((Brand.THEMES[base.theme] || {}).name || '')})</label><div id="thw" ${b.theme ? '' : 'hidden'}>${Brand.themePicker(b.theme || base.theme, 'theme')}</div></div>
      <div data-cp="fact" hidden>${Brand.invoiceEditor(inv, { banca: true })}</div><button class="btn pri" style="margin-top:12px">Guardar</button></form>`, { wide: true });
    let logo = b.logo || '';
    m.querySelectorAll('[data-ct]').forEach(t => t.onclick = () => { m.querySelectorAll('[data-ct]').forEach(x => x.classList.toggle('on', x === t)); m.querySelectorAll('[data-cp]').forEach(p => p.hidden = p.dataset.cp !== t.dataset.ct); });
    m.querySelector('#lfile').onchange = async e => { try { logo = await Brand.readLogo(e.target.files[0]); m.querySelector('#lprev').innerHTML = `<img src="${logo}">`; } catch (err) { UI.toast(err.message, 'bad'); } };
    m.querySelector('#lrm').onclick = () => { logo = ''; m.querySelector('#lprev').innerHTML = base.logo ? `<img src="${U.esc(base.logo)}" style="opacity:.5">` : '<span class="mut">Sin logo</span>'; };
    m.querySelector('#thc').onchange = e => { m.querySelector('#thw').hidden = e.target.checked; };
    Brand.bindInvoiceEditor(m.querySelector('[data-cp=fact]'), b.id, b.consorcioId, true);
    m.querySelector('#bb').onsubmit = async e => {
      e.preventDefault(); const th = m.querySelector('input[name=theme]:checked');
      const rec = Object.assign({}, b, { logo, theme: m.querySelector('#thc').checked ? '' : (th ? th.value : ''), invoice: Brand.readInvoice(m.querySelector('[data-cp=fact]')) });
      DB.put('bancas', rec); try { await DB.confirm('bancas', rec.id); } catch (err) { return UI.toast(err.message, 'bad', 6000); }
      DB.log('banca.marca', rec.code); UI.closeModal(); UI.toast('Guardado'); render();
    };
  }
  /* ajustes de este equipo */
  function apariencia(v) {
    const d = Brand.Device.get(); const u = Auth.user(); const cur = Brand.for(Brand.ctx()).theme;
    v.innerHTML = `<div class="grid g2"><div class="card"><h3>Tema de este equipo</h3><label class="chk"><input type="checkbox" id="thc" ${d.theme ? '' : 'checked'}> Usar el tema de ${u.consorcioId ? 'mi consorcio / banca' : 'la plataforma'} (${U.esc((Brand.THEMES[cur] || {}).name || '')})</label>
      <div id="thw" ${d.theme ? '' : 'hidden'}>${Brand.themePicker(d.theme || cur, 'dtheme')}</div></div>
      <div class="card"><h3>Impresoras de este equipo</h3>
      <div class="field"><label>🧾 Impresora térmica (recibos y tickets en caja)</label><select id="rp"><option value="">Según la plantilla de factura</option><option value="80" ${d.receiptPaper === '80' ? 'selected' : ''}>80 mm</option><option value="58" ${d.receiptPaper === '58' ? 'selected' : ''}>58 mm</option></select></div>
      <div class="field"><label>🖨️ Impresora normal (informes, cierres, listados)</label><select id="pp"><option value="letter" ${d.reportPaper !== 'a4' ? 'selected' : ''}>Carta (8.5 × 11)</option><option value="a4" ${d.reportPaper === 'a4' ? 'selected' : ''}>A4</option></select></div>
      <label class="chk"><input type="checkbox" id="ap" ${d.autoPrint !== false ? 'checked' : ''}> Imprimir el ticket automáticamente al vender</label>
      <p class="small">Al imprimir, el navegador muestra la lista de impresoras: elija la <b>térmica</b> para recibos y la <b>normal</b> (o "Guardar como PDF") para informes. En Chrome, cada tipo de documento recuerda la última impresora usada. Los botones <b>📄 PDF</b> descargan el informe directamente.</p>
      <div class="row"><button class="btn" id="tt">Probar recibo térmico</button><button class="btn" id="tl">Probar hoja carta</button><button class="btn" id="tp">Probar PDF</button></div></div></div>`;
    const save = ch => { Brand.Device.set(ch); Brand.refresh(); };
    UI.$('#thc').onchange = e => { UI.$('#thw').hidden = e.target.checked; if (e.target.checked) save({ theme: '' }); };
    v.querySelectorAll('input[name=dtheme]').forEach(r => r.onchange = () => { save({ theme: r.value }); v.querySelectorAll('.theme-card').forEach(c => c.classList.toggle('on', c.contains(r))); });
    UI.$('#rp').onchange = e => save({ receiptPaper: e.target.value });
    UI.$('#pp').onchange = e => save({ reportPaper: e.target.value });
    UI.$('#ap').onchange = e => save({ autoPrint: e.target.checked });
    const b0 = Auth.bancas()[0];
    UI.$('#tt').onclick = () => BRD.printHTML(BRD.ticketHTML(Brand.sampleTicket(b0 && b0.id), { ctx: b0 ? { bancaId: b0.id } : Brand.ctx() }), 'termica');
    const spec = () => ({ title: 'Página de prueba', subtitle: 'Impresora normal', meta: [['Equipo', navigator.userAgent.slice(0, 80)]], sections: [{ columns: [{ h: 'Columna' }, { h: 'Valor', align: 'right' }], rows: [['Ejemplo 1', U.money(100)], ['Ejemplo 2', U.money(250.5)]], foot: ['Total', U.money(350.5)] }] });
    UI.$('#tl').onclick = () => Docs.print(spec()); UI.$('#tp').onclick = () => Docs.pdf(spec(), 'prueba_aurasport');
  }

  /* ======================= DASHBOARD ======================= */
  function dashboard(v, act) {
    BRD.gradeAll();
    const d = U.today();
    const R = Reports.range(d, d);
    const yest = Reports.range(U.addDays(d, -1), U.addDays(d, -1));
    const bancas = Auth.bancas();
    const byB = Reports.groupBy(R.valid, t => t.bancaId);
    const byLot = {}; R.valid.filter(t => t.type === 'loteria').forEach(t => t.lines.forEach(l => { const k = l.kind === 'SP' ? 'Super Palé' : Lot.name(l.lot); byLot[k] = (byLot[k] || 0) + Number(l.amount); }));
    const lotMax = Math.max(1, ...Object.values(byLot));
    const openShifts = DB.all('shifts').filter(s => s.status === 'abierto' && Auth.sees(s.bancaId));
    const pendRes = !Auth.can('results') ? [] : Lot.list().filter(l => Lot.playsOn(l, d) && !DB.get('results', l.id + '_' + d) && U.toMins(Lot.timeFor(l, d)) < U.parts().mins);
    // números más jugados hoy
    const hot = {}; R.valid.filter(t => t.type === 'loteria').forEach(t => t.lines.forEach(l => { const k = KIND_NAMES[l.kind] + ' ' + l.nums.join('-'); hot[k] = (hot[k] || 0) + Number(l.amount); }));
    const hotList = Object.entries(hot).sort((a, b) => b[1] - a[1]).slice(0, 10);
    // riesgo: premio potencial si sale el número más jugado en quiniela 1ra
    const pct = (a, b) => b ? ((a - b) / b * 100).toFixed(0) + '%' : '—';
    act.innerHTML = `<button class="btn sm" id="rfs">↻ Actualizar marcadores</button>`;
    UI.$('#rfs').onclick = async () => { const r = await Scores.refreshAll({ ahead: true }); UI.toast(`Marcadores: ${r.updated} act., ${r.imported} nuevos, ${r.graded} tickets calificados${r.errors ? ', ' + r.errors + ' errores' : ''}`, r.errors ? 'warn' : 'ok'); render(); };
    const onboarding = Auth.can('bancas.edit') && !Auth.bancas().length ? `<div class="card" style="border-color:var(--ac);margin-bottom:12px"><h3>👋 Primeros pasos</h3><ol>
      ${Auth.isPlatform() ? `<li><a href="#config">Configuración</a>: premios, reglas y horarios generales de la plataforma.</li>
      <li><a href="#consorcios">Consorcios</a>: cree el consorcio (nombre, RNC, logo, tema y plantilla de factura).</li>` : `<li><a href="#miconsorcio">Mi consorcio</a>: datos, logo, tema y plantilla de factura.</li>`}
      <li><a href="#bancas">Bancas</a>: cree las bancas o puntos de venta del consorcio.</li>
      <li><a href="#staff">Staff</a>: cree cajeros, encargados y supervisores, y asígneles sus bancas.</li>
      <li><a href="#loterias">Loterías y horarios</a>: confirme las horas de cada sorteo.</li>
      <li><a href="#inventario">Existencias</a>: registre la entrada inicial de material en el almacén.</li></ol></div>` : '';
    v.innerHTML = onboarding + `<div class="grid g4">
      <div class="card kpi ok"><div class="l">Ventas hoy</div><div class="v">${U.money(R.ventas)}</div><small>Ayer ${U.money(yest.ventas)} (${pct(R.ventas, yest.ventas)})</small></div>
      <div class="card kpi bad"><div class="l">Premios generados</div><div class="v">${U.money(R.premios)}</div><small>Pagados ${U.money(R.pagados)} · Por pagar ${U.money(R.pendPago)}</small></div>
      <div class="card kpi ${R.neto >= 0 ? 'ok' : 'bad'}"><div class="l">Neto (ventas − premios − comisiones)</div><div class="v">${U.money(R.neto)}</div><small>Comisiones ${U.money(R.comision)}</small></div>
      <div class="card kpi"><div class="l">Tickets</div><div class="v">${R.valid.length}</div><small>Pendientes ${R.pendientes} · Anulados ${R.anulados}</small></div></div>
      ${dashAlerts()}${pendRes.length ? `<div class="card" style="margin-top:12px;border-color:var(--warn)"><b>⚠️ Resultados pendientes de ingresar:</b> ${pendRes.map(l => `<a class="pill" href="#resultados">${U.esc(l.name)}</a>`).join('')}</div>` : ''}
      <div class="grid g2" style="margin-top:12px">
        <div class="card"><h3>Ventas por banca (hoy)</h3><table><thead><tr><th>Banca</th><th class="num">Ventas</th><th class="num">Premios</th><th class="num">Neto</th><th>Estado</th></tr></thead><tbody>
          ${bancas.map(b => { const ts = byB[b.id] || []; const ve = ts.reduce((a, t) => a + t.total, 0); const pr = ts.filter(t => ['ganador', 'pagado', 'caducado'].includes(t.status)).reduce((a, t) => a + t.prize, 0); const online = openShifts.some(s => s.bancaId === b.id); return `<tr><td><b>${U.esc(b.code)}</b> ${U.esc(b.name)}</td><td class="num">${U.money(ve)}</td><td class="num">${U.money(pr)}</td><td class="num" style="color:${ve - pr >= 0 ? 'var(--ac)' : 'var(--bad)'}">${U.money(ve - pr)}</td><td>${b.status !== 'activa' ? `<span class="badge b-bad">${b.status}</span>` : online ? '<span class="badge b-ok">Abierta</span>' : '<span class="badge b-mute">Sin turno</span>'}</td></tr>`; }).join('')}</tbody></table></div>
        <div class="card"><h3>Ventas por lotería (hoy)</h3><div class="bars">${Object.entries(byLot).sort((a, b) => b[1] - a[1]).map(([k, val]) => `<div class="r"><span>${U.esc(k)}</span><div class="bar" style="width:${(val / lotMax * 100).toFixed(1)}%"></div><span class="num">${U.money(val)}</span></div>`).join('') || '<div class="empty">Sin ventas de lotería hoy</div>'}</div></div>
        <div class="card"><h3>Números más jugados (hoy)</h3><table><tbody>${hotList.map(([k, val]) => `<tr><td>${U.esc(k)}</td><td class="num">${U.money(val)}</td></tr>`).join('') || '<tr><td class="mut">—</td></tr>'}</tbody></table><small>Úselo para decidir topes por número.</small></div>
        <div class="card"><h3>Cajeros en turno</h3><table><tbody>${openShifts.map(s => { const sm = Shifts.summary(s); return `<tr><td>${U.esc(s.userName)}<br><small>${U.esc((DB.get('bancas', s.bancaId) || {}).name || '')} · desde ${U.time(s.openedAt)}</small></td><td class="num">${U.money(sm.ventas)}<br><small>en caja ${U.money(sm.esperado)}</small></td></tr>`; }).join('') || '<tr><td class="mut">Nadie en turno</td></tr>'}</tbody></table></div>
      </div>`;
  }

  /* ======================= TICKETS ======================= */
  function tickets(v, act) {
    const f = tickets.f || (tickets.f = { from: U.today(), to: U.today(), banca: '', status: '', type: '', q: '' });
    let list = DB.all('tickets').filter(t => Auth.sees(t.bancaId) && t.date >= f.from && t.date <= f.to && (!f.banca || t.bancaId === f.banca) && (!f.status || t.status === f.status) && (!f.type || t.type === f.type) && (!f.q || t.code.includes(f.q.toUpperCase()) || (t.userName || '').toLowerCase().includes(f.q.toLowerCase())));
    list.sort((a, b) => b.createdAt - a.createdAt);
    const shown = list.slice(0, 500);
    act.innerHTML = `<button class="btn sm" id="ex">Exportar CSV</button>${Docs.buttons('tk')}<button class="btn sm" id="gr">Recalificar</button>`;
    Docs.bind(act, 'tk', () => ({ title: 'Listado de tickets', subtitle: `Del ${U.d(f.from)} al ${U.d(f.to)}`, ctx: f.banca ? { bancaId: f.banca } : Brand.ctx(),
      meta: [['Filtros', [f.banca ? (DB.get('bancas', f.banca) || {}).name : 'Todas las bancas', f.status || 'todos los estados', f.type || 'todos los tipos', f.q].filter(Boolean).join(' · ')]],
      kpis: [['Tickets', String(list.length)], ['Vendido', U.money(list.filter(t => t.status !== 'anulado').reduce((a, t) => a + t.total, 0))], ['Premios', U.money(list.reduce((a, t) => a + (t.prize || 0), 0))]],
      sections: [{ columns: [{ h: 'Fecha', w: 1.6 }, { h: 'Ticket', w: 1.8 }, { h: 'Banca', w: 0.8 }, { h: 'Vendedor', w: 1.5 }, { h: 'Monto', align: 'right' }, { h: 'Premio', align: 'right' }, { h: 'Estado' }],
        rows: list.slice(0, 3000).map(t => [U.dt(t.createdAt), t.code, (DB.get('bancas', t.bancaId) || {}).code || '', t.userName || '', U.money(t.total), t.prize ? U.money(t.prize) : '', t.status]) }] }), () => `tickets_${f.from}_${f.to}`);
    v.innerHTML = `<div class="card"><form id="tf" class="row">
      <div><label>Desde</label><input type="date" name="from" value="${f.from}"></div><div><label>Hasta</label><input type="date" name="to" value="${f.to}"></div>
      <div><label>Banca</label><select name="banca"><option value="">Todas</option>${Auth.bancas().map(b => `<option value="${b.id}" ${f.banca === b.id ? 'selected' : ''}>${U.esc(b.name)}</option>`).join('')}</select></div>
      <div><label>Estado</label><select name="status"><option value="">Todos</option>${['pendiente', 'ganador', 'perdedor', 'pagado', 'anulado', 'caducado'].map(s => `<option ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div><label>Tipo</label><select name="type"><option value="">Todos</option><option value="loteria" ${f.type === 'loteria' ? 'selected' : ''}>Lotería</option><option value="deporte" ${f.type === 'deporte' ? 'selected' : ''}>Deportes</option></select></div>
      <div class="grow"><label>Código o vendedor</label><input name="q" value="${U.esc(f.q)}"></div><div><label>&nbsp;</label><button class="btn pri">Filtrar</button></div></form></div>
      <p class="small">${list.length} tickets · Total ${U.money(list.filter(t => t.status !== 'anulado').reduce((a, t) => a + t.total, 0))}${list.length > 500 ? ' · mostrando 500' : ''}</p>
      <div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Ticket</th><th>Banca</th><th>Vendedor</th><th>Detalle</th><th class="num">Monto</th><th class="num">Premio</th><th>Estado</th><th></th></tr></thead><tbody>
      ${shown.map(t => `<tr><td>${U.dt(t.createdAt)}</td><td><b>${U.esc(t.code)}</b></td><td>${U.esc((DB.get('bancas', t.bancaId) || {}).code || '')}</td><td>${U.esc(t.userName || '')}</td><td class="small">${t.type === 'loteria' ? '🎱' : '🏟️'} ${t.lines.slice(0, 2).map(l => U.esc(Tickets.describeLine(t, l))).join('<br>')}${t.lines.length > 2 ? '<br>+' + (t.lines.length - 2) + ' más' : ''}</td><td class="num">${U.money(t.total)}</td><td class="num">${t.prize ? U.money(t.prize) : ''}</td><td>${Tickets.statusBadge(t.status)}</td><td><button class="btn sm" data-v="${t.id}">Ver</button></td></tr>`).join('') || '<tr><td colspan="9" class="empty">Sin resultados</td></tr>'}</tbody></table></div>`;
    UI.$('#tf').onsubmit = e => { e.preventDefault(); tickets.f = UI.formData(e.target); render(); };
    UI.$('#gr').onclick = () => { const n = BRD.gradeAll(); UI.toast(n + ' tickets actualizados'); render(); };
    UI.$('#ex').onclick = () => U.download(`tickets_${f.from}_${f.to}.csv`, U.csv([['fecha', 'ticket', 'banca', 'vendedor', 'tipo', 'detalle', 'monto', 'premio', 'estado'], ...list.map(t => [U.dt(t.createdAt), t.code, (DB.get('bancas', t.bancaId) || {}).code, t.userName, t.type, t.lines.map(l => Tickets.describeLine(t, l) + ' ' + l.amount).join(' | '), t.total, t.prize, t.status])]), 'text/csv');
    v.querySelectorAll('[data-v]').forEach(x => x.onclick = () => ticketModal(DB.get('tickets', x.dataset.v)));
  }
  function ticketModal(t) {
    const u = Auth.user();
    const m = UI.modal('Ticket ' + U.esc(t.code), `<div class="grid g2"><div style="background:#fff;padding:6px;border-radius:8px">${BRD.ticketHTML(t)}</div><div>
      <p>Estado: ${Tickets.statusBadge(t.status)}</p><p>PIN: <b>${t.pin}</b></p>
      ${t.voidAt ? `<p class="mut">Anulado ${U.dt(t.voidAt)} por ${U.esc(t.voidBy)}<br>Motivo: ${U.esc(t.voidReason)}</p>` : ''}
      ${t.paidAt ? `<p class="mut">Pagado ${U.dt(t.paidAt)} por ${U.esc(t.paidBy)}</p>` : ''}
      ${t.lines.map(l => `<div class="sl"><span class="small">${U.esc(Tickets.describeLine(t, l))}</span><span>${l.result ? (l.result === 'win' ? `<span class="badge b-ok">${U.money(l.prize)}</span>` : l.result === 'push' ? '<span class="badge b-info">Devolución</span>' : '<span class="badge b-mute">perdió</span>') : '<span class="badge b-warn">pend.</span>'}</span></div>`).join('')}
      <div class="row" style="margin-top:12px"><button class="btn" id="pr">Imprimir</button>
      ${t.status === 'pendiente' && Auth.can('tickets.void') ? '<button class="btn bad" id="vd">Anular</button>' : ''}
      ${t.status === 'ganador' && Auth.can('tickets.pay') ? '<button class="btn pri" id="py">Marcar pagado</button>' : ''}</div></div></div>`, { wide: true });
    m.querySelector('#pr').onclick = () => BRD.printTicket(t);
    const vd = m.querySelector('#vd'); if (vd) vd.onclick = async () => { const r = await UI.prompt('Motivo de anulación:'); if (r === null) return; try { Tickets.void(t, u, r); await DB.confirm('tickets', t.id); UI.closeModal(); UI.toast('Anulado'); render(); } catch (e) { UI.toast(e.message, 'bad'); } };
    const py = m.querySelector('#py'); if (py) py.onclick = async () => { if (!await UI.confirm('¿Marcar como pagado ' + U.money(t.prize) + '?')) return; try { Tickets.pay(t, u, t.pin, null); await DB.confirm('tickets', t.id); UI.closeModal(); UI.toast('Pagado'); render(); } catch (e) { UI.toast(e.message, 'bad'); } };
  }

  /* ======================= REPORTES ======================= */
  function reportes(v, act) {
    const f = reportes.f || (reportes.f = { from: U.addDays(U.today(), -6), to: U.today(), banca: '', group: 'banca' });
    BRD.gradeAll();
    const R = Reports.range(f.from, f.to, { bancaId: f.banca });
    const keyFns = {
      banca: t => (DB.get('bancas', t.bancaId) || {}).name || t.bancaId,
      vendedor: t => t.userName || t.userId,
      dia: t => t.date,
      producto: t => t.type === 'loteria' ? 'Lotería' : 'Deportes',
    };
    const groups = Reports.groupBy(R.valid, keyFns[f.group]);
    const rows = Object.entries(groups).map(([k, ts]) => {
      const ve = ts.reduce((a, t) => a + t.total, 0), pr = ts.filter(t => ['ganador', 'pagado', 'caducado'].includes(t.status)).reduce((a, t) => a + t.prize, 0);
      const com = ts.reduce((a, t) => a + t.total * (((DB.get('users', t.userId) || {}).commission || 0) / 100), 0);
      return [k, ts.length, U.round2(ve), U.round2(pr), U.round2(com), U.round2(ve - pr - com)];
    }).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    // por tipo de jugada (lotería)
    const byKind = {}; R.valid.filter(t => t.type === 'loteria').forEach(t => t.lines.forEach(l => { const k = KIND_NAMES[l.kind]; byKind[k] = byKind[k] || [0, 0]; byKind[k][0] += Number(l.amount); byKind[k][1] += Number(l.prize || 0); }));
    act.innerHTML = `<button class="btn sm" id="ex">Exportar CSV</button>${Docs.buttons('rep')}`;
    v.innerHTML = `<div class="card"><form id="rf" class="row">
      <div><label>Desde</label><input type="date" name="from" value="${f.from}"></div><div><label>Hasta</label><input type="date" name="to" value="${f.to}"></div>
      <div><label>Banca</label><select name="banca"><option value="">Todas mis bancas</option>${Auth.bancas().map(b => `<option value="${b.id}" ${f.banca === b.id ? 'selected' : ''}>${U.esc(b.name)}</option>`).join('')}</select></div>
      <div><label>Agrupar por</label><select name="group">${[['banca', 'Banca'], ['vendedor', 'Vendedor'], ['dia', 'Día'], ['producto', 'Producto']].map(([k, n]) => `<option value="${k}" ${f.group === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div><label>&nbsp;</label><button class="btn pri">Generar</button></div>
      <div class="row"><label>&nbsp;</label>${[['Hoy', 0, 0], ['Ayer', -1, -1], ['7 días', -6, 0], ['30 días', -29, 0]].map(([n, a, b]) => `<button type="button" class="btn sm" data-q="${a},${b}">${n}</button>`).join('')}</div></form></div>
      <div class="grid g4" style="margin-top:12px">
        <div class="card kpi ok"><div class="l">Ventas</div><div class="v">${U.money(R.ventas)}</div></div>
        <div class="card kpi bad"><div class="l">Premios</div><div class="v">${U.money(R.premios)}</div><small>Pagados ${U.money(R.pagados)} · Por pagar ${U.money(R.pendPago)}</small></div>
        <div class="card kpi warn"><div class="l">Comisiones</div><div class="v">${U.money(R.comision)}</div></div>
        <div class="card kpi ${R.neto >= 0 ? 'ok' : 'bad'}"><div class="l">Beneficio neto</div><div class="v">${U.money(R.neto)}</div><small>Anulados: ${R.anulados} (${U.money(R.montoAnulado)})</small></div></div>
      <div class="grid g2" style="margin-top:12px"><div class="card"><h3>Detalle</h3><div class="tbl-wrap"><table><thead><tr><th>${f.group}</th><th class="num">Tickets</th><th class="num">Ventas</th><th class="num">Premios</th><th class="num">Comisión</th><th class="num">Neto</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${U.esc(r[0])}</td><td class="num">${r[1]}</td><td class="num">${U.money(r[2])}</td><td class="num">${U.money(r[3])}</td><td class="num">${U.money(r[4])}</td><td class="num" style="color:${r[5] >= 0 ? 'var(--ac)' : 'var(--bad)'}">${U.money(r[5])}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sin datos</td></tr>'}</tbody></table></div></div>
        <div class="card"><h3>Lotería por tipo de jugada</h3><table><thead><tr><th>Jugada</th><th class="num">Vendido</th><th class="num">Premios</th><th class="num">% retorno</th></tr></thead><tbody>
        ${Object.entries(byKind).map(([k, [a, p]]) => `<tr><td>${k}</td><td class="num">${U.money(a)}</td><td class="num">${U.money(p)}</td><td class="num">${a ? (p / a * 100).toFixed(1) + '%' : '—'}</td></tr>`).join('') || '<tr><td colspan="4" class="mut">Sin ventas</td></tr>'}</tbody></table></div></div>`;
    UI.$('#rf').onsubmit = e => { e.preventDefault(); reportes.f = UI.formData(e.target); render(); };
    v.querySelectorAll('[data-q]').forEach(x => x.onclick = () => { const [a, b] = x.dataset.q.split(',').map(Number); reportes.f = Object.assign({}, f, { from: U.addDays(U.today(), a), to: U.addDays(U.today(), b) }); render(); });
    UI.$('#ex').onclick = () => U.download(`reporte_${f.group}_${f.from}_${f.to}.csv`, U.csv([[f.group, 'tickets', 'ventas', 'premios', 'comision', 'neto'], ...rows]), 'text/csv');
    const gname = { banca: 'Banca', vendedor: 'Vendedor', dia: 'Día', producto: 'Producto' }[f.group];
    Docs.bind(act, 'rep', () => ({
      title: 'Reporte de ventas', subtitle: `Del ${U.d(f.from)} al ${U.d(f.to)} · agrupado por ${gname.toLowerCase()}`, ctx: f.banca ? { bancaId: f.banca } : Brand.ctx(),
      meta: [['Bancas', f.banca ? (DB.get('bancas', f.banca) || {}).name : (Auth.allBancas() ? 'Todas' : Auth.bancas().map(b => b.code).join(', '))], ['Generado por', Auth.user().name]],
      kpis: [['Ventas', U.money(R.ventas)], ['Premios', U.money(R.premios)], ['Comisiones', U.money(R.comision)], ['Neto', U.money(R.neto)]],
      sections: [{ title: 'Detalle', columns: [{ h: gname, w: 3 }, { h: 'Tickets', align: 'right' }, { h: 'Ventas', w: 1.4, align: 'right' }, { h: 'Premios', w: 1.4, align: 'right' }, { h: 'Comisión', w: 1.3, align: 'right' }, { h: 'Neto', w: 1.4, align: 'right' }],
        rows: rows.map(r => [r[0], r[1], U.money(r[2]), U.money(r[3]), U.money(r[4]), U.money(r[5])]), foot: ['TOTAL', R.valid.length, U.money(R.ventas), U.money(R.premios), U.money(R.comision), U.money(R.neto)] },
      { title: 'Lotería por tipo de jugada', columns: [{ h: 'Jugada', w: 2 }, { h: 'Vendido', align: 'right' }, { h: 'Premios', align: 'right' }, { h: '% retorno', align: 'right' }],
        rows: Object.entries(byKind).map(([k, [a, p]]) => [k, U.money(a), U.money(p), a ? (p / a * 100).toFixed(1) + '%' : '—']) }],
      notes: [`Anulados: ${R.anulados} (${U.money(R.montoAnulado)}) · Premios pagados ${U.money(R.pagados)} · Por pagar ${U.money(R.pendPago)}`],
    }), () => `reporte_${f.from}_${f.to}`);
  }

  /* ======================= TURNOS ======================= */
  function turnos(v) {
    const list = DB.all('shifts').filter(s => Auth.sees(s.bancaId)).sort((a, b) => b.openedAt - a.openedAt).slice(0, 300);
    v.innerHTML = `<div class="tbl-wrap"><table><thead><tr><th>Cajero</th><th>Banca</th><th>Apertura</th><th>Cierre</th><th class="num">Fondo</th><th class="num">Ventas</th><th class="num">Pagos</th><th class="num">Gastos</th><th class="num">Esperado</th><th class="num">Declarado</th><th class="num">Dif.</th><th></th></tr></thead><tbody>
      ${list.map(s => { const r = s.status === 'abierto' ? Shifts.summary(s) : s.resumen; return `<tr><td>${U.esc(s.userName)}</td><td>${U.esc((DB.get('bancas', s.bancaId) || {}).code || '')}</td><td>${U.dt(s.openedAt)}</td><td>${s.closedAt ? U.dt(s.closedAt) : '<span class="badge b-ok">abierto</span>'}</td><td class="num">${U.money(s.fondo)}</td><td class="num">${U.money(r.ventas)}</td><td class="num">${U.money(r.pagos)}</td><td class="num">${U.money(r.gastos)}</td><td class="num">${U.money(r.esperado)}</td><td class="num">${s.status === 'cerrado' ? U.money(s.declarado) : ''}</td><td class="num" style="color:${(s.diferencia || 0) < 0 ? 'var(--bad)' : 'var(--ac)'}">${s.status === 'cerrado' ? U.money(s.diferencia) : ''}</td><td><div class="row">${s.status === 'abierto' && Auth.can('shifts.close') ? `<button class="btn sm warn" data-fc="${s.id}">Forzar cierre</button>` : U.esc(s.nota || '')}<button class="btn sm" data-sp="${s.id}" title="Impresora normal">🖨️</button><button class="btn sm" data-sf="${s.id}" title="PDF">📄</button><button class="btn sm" data-st="${s.id}" title="Térmica">🧾</button></div></td></tr>`; }).join('') || '<tr><td colspan="12" class="empty">Sin turnos</td></tr>'}</tbody></table></div>`;
    v.querySelectorAll('[data-sp]').forEach(x => x.onclick = () => Docs.print(Docs.shiftSpec(DB.get('shifts', x.dataset.sp))));
    v.querySelectorAll('[data-sf]').forEach(x => x.onclick = () => { const s = DB.get('shifts', x.dataset.sf); Docs.pdf(Docs.shiftSpec(s), 'cierre_' + U.d(s.openedAt) + '_' + s.userName); });
    v.querySelectorAll('[data-st]').forEach(x => x.onclick = () => BRD.printHTML(Docs.shiftThermal(DB.get('shifts', x.dataset.st)), 'termica'));
    v.querySelectorAll('[data-fc]').forEach(x => x.onclick = async () => { const s = DB.get('shifts', x.dataset.fc); const d = await UI.prompt('Efectivo declarado/recibido para cerrar el turno de ' + s.userName + ':', Shifts.summary(s).esperado); if (d === null) return; Shifts.close(s, d, 'Cierre forzado por ' + Auth.user().username); render(); });
  }

  /* ======================= RESULTADOS ======================= */
  function resultados(v) {
    const d = resultados.d || U.today();
    const lots = Lot.list();
    v.innerHTML = `<div class="card" id="feedst" style="margin-bottom:12px"><b>🛰️ Resultados automáticos</b> <span class="mut small">${DB.mode === 'servidor' ? 'consultando estado…' : 'Disponible cuando el sistema funciona con el servidor central.'}</span> <a class="btn sm" href="resultados.html" target="_blank" style="float:right">📺 Ver tablero público</a></div><div class="card"><div class="row"><label style="margin:0">Fecha del sorteo</label><input type="date" id="rd" value="${d}" style="width:auto">${Docs.buttons('res')}<span class="small">Ingrese 1ra, 2da y 3ra (2 dígitos). Al guardar se califican automáticamente todos los tickets.</span></div></div>
      <div class="tbl-wrap" style="margin-top:12px"><table><thead><tr><th>Lotería</th><th>Hora</th><th>1ra</th><th>2da</th><th>3ra</th><th>Vendido</th><th>Premios</th><th></th></tr></thead><tbody>
      ${lots.map(l => { const r = DB.get('results', l.id + '_' + d); const st = soldPrize(l.id, d); return `<tr data-row="${l.id}"><td><b>${U.esc(l.name)}</b>${r ? `<br><small class="${r.source === 'auto' ? 'ok' : 'mut'}">${r.source === 'auto' ? '🛰️ automático · ' + U.esc(r.srcName || '') : '✍️ manual · ' + U.esc(r.by || '')} ${r.at ? U.time(r.at) : ''}</small>` : ''}${Lot.playsOn(l, d) ? '' : '<br><small>No juega este día</small>'}</td><td>${U.hhmm12(Lot.timeFor(l, d))}</td>
        ${['n1', 'n2', 'n3'].map(k => `<td><input class="rn" data-k="${k}" maxlength="2" inputmode="numeric" value="${r ? r[k] : ''}" style="width:58px;text-align:center;font-weight:700"></td>`).join('')}
        <td class="num">${U.money(st.sold)}</td><td class="num">${r ? U.money(st.prize) : ''}</td><td><div class="row"><button class="btn sm pri" data-save="${l.id}">Guardar</button>${r ? `<button class="btn sm ghost" data-del="${l.id}">Borrar</button>` : ''}</div>${r ? `<small>por ${U.esc(r.by)} ${U.time(r.at)}</small>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
    UI.$('#rd').onchange = e => { resultados.d = e.target.value; render(); };
    if (DB.mode === 'servidor') feedStatus(UI.$('#feedst'));
    Docs.bind(v, 'res', () => ({ title: 'Resultados de lotería', subtitle: U.d(d), sections: [{ columns: [{ h: 'Lotería', w: 2.5 }, { h: 'Hora' }, { h: '1ra', align: 'right' }, { h: '2da', align: 'right' }, { h: '3ra', align: 'right' }, { h: 'Vendido', w: 1.3, align: 'right' }, { h: 'Premios', w: 1.3, align: 'right' }],
      rows: lots.filter(l => Lot.playsOn(l, d)).map(l => { const r = DB.get('results', l.id + '_' + d) || {}; const st = soldPrize(l.id, d); return [l.name, U.hhmm12(Lot.timeFor(l, d)), r.n1 || '—', r.n2 || '—', r.n3 || '—', U.money(st.sold), r.n1 ? U.money(st.prize) : '']; }) }] }), () => 'resultados_' + d);
    v.querySelectorAll('.rn').forEach(i => i.oninput = () => { i.value = i.value.replace(/\D/g, '').slice(0, 2); if (i.value.length === 2) { const all = UI.$$('.rn'); const nx = all[all.indexOf(i) + 1]; if (nx) nx.focus(); } });
    v.querySelectorAll('[data-save]').forEach(b => b.onclick = async () => {
      const id = b.dataset.save; const row = v.querySelector(`[data-row="${id}"]`); const vals = {};
      row.querySelectorAll('.rn').forEach(i => vals[i.dataset.k] = i.value.padStart(2, '0'));
      if (row.querySelectorAll('.rn')[0].value === '' || [...row.querySelectorAll('.rn')].some(i => i.value.length === 0)) return UI.toast('Complete los 3 números', 'warn');
      const key = id + '_' + d; const prev = DB.get('results', key);
      if (prev && !await UI.confirm('Ya existe un resultado. Corregirlo recalculará los tickets no pagados. ¿Continuar?')) return;
      if (prev && !DB.serverMode) { // reabrir tickets no pagados de ese sorteo para recalificar (en modo servidor lo hace el servidor)
        DB.all('tickets').filter(t => t.type === 'loteria' && t.date === d && ['ganador', 'perdedor'].includes(t.status) && t.lines.some(l => l.lot === id || l.lot2 === id))
          .forEach(t => DB.put('tickets', Object.assign({}, t, { status: 'pendiente', prize: 0, lines: t.lines.map(l => (l.lot === id || l.lot2 === id) ? Object.assign({}, l, { result: null, prize: 0 }) : l) }), { silent: true }));
      }
      DB.put('results', { id: key, lot: id, date: d, n1: vals.n1, n2: vals.n2, n3: vals.n3, by: Auth.user().username, at: Date.now() });
      DB.log(prev ? 'resultado.corregido' : 'resultado.ingresado', `${Lot.name(id)} ${d}: ${vals.n1}-${vals.n2}-${vals.n3}`);
      try { await DB.confirm('results', key); const n = BRD.gradeAll(); UI.toast(DB.serverMode ? 'Resultado guardado; el servidor calificó los tickets' : `Resultado guardado · ${n} tickets calificados`); } catch (err) { UI.toast(err.message, 'bad'); } render();
    });
    v.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const id = b.dataset.del; if (!await UI.confirm('¿Borrar el resultado? Los tickets no pagados volverán a pendiente.')) return;
      if (!DB.serverMode) DB.all('tickets').filter(t => t.type === 'loteria' && t.date === d && ['ganador', 'perdedor'].includes(t.status) && t.lines.some(l => l.lot === id || l.lot2 === id))
        .forEach(t => DB.put('tickets', Object.assign({}, t, { status: 'pendiente', prize: 0, lines: t.lines.map(l => (l.lot === id || l.lot2 === id) ? Object.assign({}, l, { result: null, prize: 0 }) : l) }), { silent: true }));
      DB.remove('results', id + '_' + d); DB.log('resultado.borrado', `${Lot.name(id)} ${d}`); BRD.gradeAll(); render();
    });
  }
  function soldPrize(lot, d) {
    let sold = 0, prize = 0;
    DB.all('tickets').forEach(t => { if (t.type !== 'loteria' || t.date !== d || t.status === 'anulado') return; t.lines.forEach(l => { if (l.lot === lot || l.lot2 === lot) { sold += Number(l.amount); prize += Number(l.prize || 0); } }); });
    return { sold, prize };
  }

  /* ======================= DEPORTES ======================= */
  function deportes(v, act) {
    const f = deportes.f || (deportes.f = { league: '', date: U.today(), status: '' });
    const leagues = DB.all('leagues').sort((a, b) => a.order - b.order);
    const games = DB.all('games').filter(g => (!f.league || g.league === f.league) && (!f.date || g.date === f.date) && (!f.status || g.status === f.status)).sort((a, b) => a.start - b.start);
    act.innerHTML = `<button class="btn sm pri" id="ng">+ Nuevo juego</button><button class="btn sm" id="imp">⇣ Importar / actualizar (ESPN)</button><button class="btn sm" id="lgs">Ligas</button>${DB.all('games').some(g => g.demo) ? '<button class="btn sm ghost" id="deld">Quitar juegos de ejemplo</button>' : ''}`;
    v.innerHTML = `<div class="card"><form id="gf" class="row"><div><label>Liga</label><select name="league"><option value="">Todas</option>${leagues.map(l => `<option value="${l.id}" ${f.league === l.id ? 'selected' : ''}>${U.esc(l.name)}</option>`).join('')}</select></div>
      <div><label>Fecha</label><input type="date" name="date" value="${f.date}"></div>
      <div><label>Estado</label><select name="status"><option value="">Todos</option>${['programado', 'en_vivo', 'final', 'suspendido', 'cancelado'].map(s => `<option ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div><label>&nbsp;</label><button class="btn">Filtrar</button></div><div class="grow small">${Scores.lastRun ? 'Última importación: ' + U.dt(Scores.lastRun) : ''} ${Scores.lastError ? '· Último error: ' + U.esc(Scores.lastError) : ''}</div></form></div>
      <div class="tbl-wrap" style="margin-top:12px"><table><thead><tr><th>Hora</th><th>Liga</th><th>Visitante @ Local</th><th>Ganador</th><th>Spread/RL</th><th>Total</th><th>Marcador</th><th>Estado</th><th class="num">Expuesto</th><th></th></tr></thead><tbody>
      ${games.map(g => { const o = g.odds || {}; const ex = exposure(g.id); return `<tr><td>${U.time(g.start)}<br><small>${g.date}</small></td><td>${U.esc((DB.get('leagues', g.league) || {}).name || g.league)}</td><td>${U.esc(g.away)}<br>@ ${U.esc(g.home)}</td>
        <td>${U.fmtOdds(o.mlAway)}<br>${U.fmtOdds(o.mlHome)}${o.mlDraw ? '<br>E ' + U.fmtOdds(o.mlDraw) : ''}</td><td>${o.spread != null ? U.fmtLine(-o.spread) + ' (' + U.fmtOdds(o.spAway) + ')<br>' + U.fmtLine(o.spread) + ' (' + U.fmtOdds(o.spHome) + ')' : '—'}</td><td>${o.total != null ? 'O ' + o.total + ' (' + U.fmtOdds(o.over) + ')<br>U ' + o.total + ' (' + U.fmtOdds(o.under) + ')' : '—'}</td>
        <td class="score">${g.scoreAway != null ? g.scoreAway + ' - ' + g.scoreHome : ''}<br><small>${U.esc(g.period || '')}</small></td><td><span class="badge ${g.status === 'en_vivo' ? 'b-live' : g.status === 'final' ? 'b-mute' : g.status === 'programado' ? 'b-ok' : 'b-bad'}">${g.status}</span><br><small>${g.source}</small></td>
        <td class="num">${U.money(ex.amount)}<br><small>${ex.count} jug.</small></td><td><div class="row"><button class="btn sm" data-e="${g.id}">Editar</button><button class="btn sm" data-s="${g.id}">Marcador</button></div></td></tr>`; }).join('') || '<tr><td colspan="10" class="empty">Sin juegos para estos filtros</td></tr>'}</tbody></table></div>
      <p class="small">La importación usa el marcador público de ESPN (sin clave) para NBA, NFL, NHL, MLB, NCAA, fútbol europeo, MLS y UFC. LIDOM y LNB se cargan manualmente o con un proveedor de datos (ver Informe).</p>`;
    UI.$('#gf').onsubmit = e => { e.preventDefault(); deportes.f = UI.formData(e.target); render(); };
    UI.$('#ng').onclick = () => gameForm(null);
    UI.$('#lgs').onclick = leaguesModal;
    const dd = UI.$('#deld'); if (dd) dd.onclick = async () => { if (!await UI.confirm('¿Eliminar los juegos de ejemplo sin jugadas vendidas?')) return; let n = 0; DB.all('games').filter(g => g.demo && !exposure(g.id).count).forEach(g => { DB.remove('games', g.id); n++; }); DB.log('juegos.demo_eliminados', n + ''); UI.toast(n + ' juegos eliminados'); render(); };
    UI.$('#imp').onclick = async () => { UI.toast('Importando…', 'ok', 1500); try { const r = await Scores.refreshAll({ ahead: true, all: true }); UI.toast(`${r.imported} juegos nuevos, ${r.updated} actualizados, ${r.graded} tickets calificados${r.errors ? ' · ' + r.errors + ' errores (' + Scores.lastError + ')' : ''}`, r.errors ? 'warn' : 'ok', 6000); } catch (e) { UI.toast(e.message, 'bad'); } render(); };
    v.querySelectorAll('[data-e]').forEach(b => b.onclick = () => gameForm(DB.get('games', b.dataset.e)));
    v.querySelectorAll('[data-s]').forEach(b => b.onclick = () => scoreForm(DB.get('games', b.dataset.s)));
  }
  function exposure(gid) {
    let amount = 0, count = 0;
    DB.all('tickets').forEach(t => { if (t.type !== 'deporte' || t.status === 'anulado') return; t.lines.forEach(l => { if (l.legs.some(x => x.gameId === gid)) { amount += Number(l.amount); count++; } }); });
    return { amount, count };
  }
  function gameForm(g) {
    const leagues = DB.all('leagues').sort((a, b) => a.order - b.order);
    g = g || { league: leagues[0] && leagues[0].id, away: '', home: '', date: U.today(), time: '19:00', status: 'programado', odds: { mlAway: -110, mlHome: -110, spread: 1.5, spAway: -110, spHome: -110, total: 8.5, over: -110, under: -110 } };
    const o = g.odds || {};
    const inp = (n, val, lab, t = 'number', st = 'any') => `<div class="field"><label>${lab}</label><input name="${n}" type="${t}" step="${st}" value="${val == null ? '' : val}"></div>`;
    const m = UI.modal(g.id ? 'Editar juego' : 'Nuevo juego', `<form id="gfm">
      <div class="grid g2"><div class="field"><label>Liga</label><select name="league">${leagues.map(l => `<option value="${l.id}" ${g.league === l.id ? 'selected' : ''}>${U.esc(l.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Estado</label><select name="status">${['programado', 'en_vivo', 'final', 'suspendido', 'cancelado'].map(s => `<option ${g.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      ${inp('away', g.away, 'Visitante', 'text')}${inp('home', g.home, 'Local', 'text')}${inp('date', g.date, 'Fecha', 'date')}${inp('time', g.time, 'Hora (RD)', 'time')}</div>
      <h4>Líneas (momios americanos)</h4><div class="grid g3">${inp('mlAway', o.mlAway, 'Ganador visitante')}${inp('mlHome', o.mlHome, 'Ganador local')}${inp('mlDraw', o.mlDraw, 'Empate (fútbol)')}
      ${inp('spread', o.spread, 'Spread/RL del local (ej. -1.5)')}${inp('spHome', o.spHome, 'Momio spread local')}${inp('spAway', o.spAway, 'Momio spread visitante')}
      ${inp('total', o.total, 'Total (O/U)')}${inp('over', o.over, 'Momio Más')}${inp('under', o.under, 'Momio Menos')}</div>
      <label class="chk"><input type="checkbox" name="oddsLocked" ${g.oddsLocked ? 'checked' : ''}> Bloquear líneas (la importación no las cambia)</label>
      <div class="row"><button class="btn pri">Guardar</button>${g.id ? '<button type="button" class="btn bad" id="dg">Eliminar</button>' : ''}</div></form>`, { wide: true });
    m.querySelector('#gfm').onsubmit = e => {
      e.preventDefault(); const f = UI.formData(e.target); const n = k => f[k] === '' ? null : Number(f[k]);
      if (!f.away || !f.home) return UI.toast('Indique los equipos', 'warn');
      const rec = Object.assign({}, g, { league: f.league, away: f.away.trim(), home: f.home.trim(), date: f.date, time: f.time, start: U.zonedTs(f.date, f.time), status: f.status, oddsLocked: f.oddsLocked, source: g.source || 'manual',
        odds: { mlAway: n('mlAway'), mlHome: n('mlHome'), mlDraw: n('mlDraw'), spread: n('spread'), spHome: n('spHome'), spAway: n('spAway'), total: n('total'), over: n('over'), under: n('under') } });
      if (!rec.id) rec.id = U.uid('g_');
      DB.put('games', rec); DB.log(g.id ? 'juego.editado' : 'juego.creado', `${rec.away} @ ${rec.home}`); BRD.gradeAll(); UI.closeModal(); render();
    };
    const dg = m.querySelector('#dg'); if (dg) dg.onclick = async () => { if (exposure(g.id).count) return UI.toast('Tiene jugadas vendidas: márquelo como cancelado/suspendido en su lugar (se devuelve el dinero)', 'warn', 6000); if (await UI.confirm('¿Eliminar juego?')) { DB.remove('games', g.id); UI.closeModal(); render(); } };
  }
  function scoreForm(g) {
    const m = UI.modal('Marcador: ' + U.esc(g.away + ' @ ' + g.home), `<form id="sf"><div class="grid g2">
      <div class="field"><label>${U.esc(g.away)}</label><input name="a" type="number" value="${g.scoreAway == null ? '' : g.scoreAway}"></div>
      <div class="field"><label>${U.esc(g.home)}</label><input name="h" type="number" value="${g.scoreHome == null ? '' : g.scoreHome}"></div>
      <div class="field"><label>Estado</label><select name="s">${['programado', 'en_vivo', 'final', 'suspendido', 'cancelado'].map(s => `<option ${g.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="field"><label>Periodo / Inning</label><input name="p" value="${U.esc(g.period || '')}"></div></div>
      <label class="chk"><input type="checkbox" name="manual" ${g.manualScore ? 'checked' : ''}> Fijar marcador manual (ignorar importación)</label>
      <button class="btn pri">Guardar y calificar</button></form>`);
    m.querySelector('#sf').onsubmit = e => {
      e.preventDefault(); const f = UI.formData(e.target);
      if (f.s === 'final' && (f.a === '' || f.h === '')) return UI.toast('Para finalizar indique ambos marcadores', 'warn');
      DB.put('games', Object.assign({}, g, { scoreAway: f.a === '' ? null : Number(f.a), scoreHome: f.h === '' ? null : Number(f.h), status: f.s, period: f.p, manualScore: f.manual }));
      DB.log('juego.marcador', `${g.away} ${f.a} - ${g.home} ${f.h} (${f.s})`);
      const n = BRD.gradeAll(); UI.closeModal(); UI.toast(`Guardado · ${n} tickets calificados`); render();
    };
  }
  function leaguesModal() {
    const ls = DB.all('leagues').sort((a, b) => a.order - b.order);
    const m = UI.modal('Ligas', `<table><thead><tr><th>Logo</th><th>Liga</th><th>Deporte</th><th>Fuente automática</th><th>Activa</th></tr></thead><tbody>${ls.map(l => `<tr><td><label style="cursor:pointer;margin:0" title="Cambiar logo">${BRD.Results.logo(l.logo || l.logoSrc, l.name.slice(0, 2).toUpperCase(), '#475569', 34)}<input type="file" accept="image/*" data-ll="${l.id}" hidden></label>${l.logo ? `<button class="btn sm ghost" data-lr="${l.id}" title="Quitar logo propio">×</button>` : ''}</td><td>${U.esc(l.name)}</td><td>${Sports.SPORT_NAMES[l.sport]}</td><td><small>${l.feed === 'mlb-winter' ? 'MLB (ligas de invierno)' : l.espn ? 'ESPN · ' + U.esc(l.espn) : '— manual'}</small></td><td><input type="checkbox" data-la="${l.id}" ${l.active ? 'checked' : ''}></td></tr>`).join('')}</tbody></table>
      <p class="small mut">Haga clic en un logo para subir uno propio.</p>
      <hr><form id="nl" class="row"><input name="n" placeholder="Nueva liga" required style="flex:2"><select name="s" style="flex:1">${Object.entries(Sports.SPORT_NAMES).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select><button class="btn">Agregar</button></form>`, { wide: true });
    m.querySelectorAll('[data-la]').forEach(c => c.onchange = () => DB.patch('leagues', c.dataset.la, { active: c.checked }));
    m.querySelectorAll('[data-ll]').forEach(i => i.onchange = async () => { try { DB.patch('leagues', i.dataset.ll, { logo: await BRD.Brand.readLogo(i.files[0]) }); leaguesModal(); } catch (err) { UI.toast(err.message, 'bad'); } });
    m.querySelectorAll('[data-lr]').forEach(b => b.onclick = () => { DB.patch('leagues', b.dataset.lr, { logo: '' }); leaguesModal(); });
    m.querySelector('#nl').onsubmit = e => { e.preventDefault(); const f = UI.formData(e.target); DB.put('leagues', { id: U.uid('l_'), name: f.n, sport: f.s, espn: '', active: true, order: 99 }); leaguesModal(); };
  }

  /* estado de las fuentes automáticas (loterías y deportes) */
  async function feedStatus(box) {
    let st; try { st = await (await fetch('api/feeds', { cache: 'no-store' })).json(); } catch (e) { box.querySelector('.mut').textContent = 'No se pudo consultar el estado.'; return; }
    const ago = t => t ? (Math.round((Date.now() - t) / 60000) + ' min') : 'nunca';
    const src = Object.values((st.lottery || {}).sources || {});
    const lg = Object.entries((st.sports || {}).leagues || {});
    const can = Auth.can('config');
    box.innerHTML = `<div class="row" style="justify-content:space-between"><b>🛰️ Resultados automáticos</b><div class="row"><a class="btn sm" href="resultados.html" target="_blank">📺 Ver tablero público</a>${Auth.can('results') ? '<button class="btn sm pri" id="frun">Actualizar ahora</button>' : ''}</div></div>
      <div class="grid g2" style="margin-top:8px"><div><small class="mut">LOTERÍAS</small><br>${st.autoResults ? '<span class="badge b-ok">Activado</span>' : '<span class="badge b-bad">Desactivado</span>'} · última lectura hace ${ago(st.lottery.lastOk)} · publicados desde el arranque: <b>${st.lottery.published}</b>
        <div class="small" style="margin-top:4px">${src.map(x => `${x.ok ? '🟢' : '🔴'} ${U.esc(x.name)}: ${x.ok ? `${x.matched || 0} loterías leídas` : U.esc(x.error || 'sin respuesta')}`).join('<br>') || 'Aún no se ha consultado.'}</div>
        ${can ? `<label class="chk" style="margin-top:6px"><input type="checkbox" id="fauto" ${st.autoResults ? 'checked' : ''}> Publicar resultados automáticamente (nunca reemplaza los ingresados a mano)</label>` : ''}</div>
      <div><small class="mut">DEPORTES</small><br>última actualización hace ${ago(st.sports.lastRun)}<div class="small" style="margin-top:4px">${lg.map(([k, x]) => `${x.ok ? '🟢' : '🔴'} ${U.esc((DB.get('leagues', k) || {}).name || k)}${x.ok ? '' : ': ' + U.esc(x.error || '')}`).join(' · ') || '—'}</div></div></div>
      <p class="small mut" style="margin:8px 0 0">Un resultado automático se publica solo cuando se confirma dos veces (dos lecturas seguidas o dos fuentes iguales). Si corrige un número a mano, queda como manual y el sistema no lo vuelve a cambiar.</p>`;
    const fr = box.querySelector('#frun'); if (fr) fr.onclick = async () => { fr.disabled = true; fr.textContent = 'Consultando…'; try { await BRD.api.call('feeds/run', {}); await BRD.DB.pull(); UI.toast('Fuentes consultadas'); } catch (e) { UI.toast(e.message, 'bad'); } render(); };
    const fa = box.querySelector('#fauto'); if (fa) fa.onchange = () => { DB.put('config', Object.assign({}, DB.cfg(), { autoResults: fa.checked })); DB.log('config', 'Resultados automáticos ' + (fa.checked ? 'activados' : 'desactivados')); setTimeout(() => feedStatus(box), 1500); };
  }

  /* ======================= LÍMITES ======================= */
  function limites(v, act) {
    const scName = sc => sc === 'global' ? 'Todas las bancas (plataforma)' : String(sc).startsWith('c:') ? 'Consorcio ' + consName(sc.slice(2)) : (DB.get('bancas', sc) || {}).name || sc;
    const list = DB.all('limits').filter(r => r.scope === 'global' || (String(r.scope).startsWith('c:') ? Auth.seesConsorcio(r.scope.slice(2)) : Auth.sees(r.scope))).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const cfg = DB.cfg();
    act.innerHTML = `<button class="btn sm pri" id="nl">+ Nuevo tope / bloqueo</button>`;
    v.innerHTML = `<div class="card" ${Auth.can('config') ? '' : 'hidden'}><h3>Máximo por jugada (general)</h3><form id="ml" class="row">${['Q', 'P', 'T', 'SP'].map(k => `<div><label>${KIND_NAMES[k]}</label><input name="${k}" type="number" value="${cfg.maxLine[k] || ''}" style="width:120px"></div>`).join('')}<div><label>Mínimo lotería</label><input name="min" type="number" value="${cfg.lotMin}" style="width:100px"></div><div><label>&nbsp;</label><button class="btn">Guardar</button></div></form></div>
      <div class="tbl-wrap" style="margin-top:12px"><table><thead><tr><th>Alcance</th><th>Lotería</th><th>Jugada</th><th>Número</th><th>Regla</th><th>Vendido hoy</th><th>Nota</th><th>Activo</th><th></th></tr></thead><tbody>
      ${list.map(r => `<tr><td>${U.esc(scName(r.scope))}</td><td>${r.lot === '*' ? 'Todas' : U.esc(Lot.name(r.lot))}</td><td>${r.kind === '*' ? 'Todas' : KIND_NAMES[r.kind]}</td><td><b>${U.esc(r.num)}</b></td><td>${r.blocked ? '<span class="badge b-bad">Bloqueado</span>' : 'Tope ' + U.money(r.max)}</td><td>${r.num !== '*' && r.kind !== '*' && r.lot !== '*' ? U.money(soldQuick(r)) : '—'}</td><td class="small">${U.esc(r.note || '')}</td><td><input type="checkbox" data-ac="${r.id}" ${r.active !== false ? 'checked' : ''}></td><td><button class="btn sm ghost" data-d="${r.id}">Eliminar</button></td></tr>`).join('') || '<tr><td colspan="9" class="empty">Sin reglas. Las reglas limitan cuánto se puede vender de un número o lo bloquean.</td></tr>'}</tbody></table></div>`;
    if (Auth.can('config')) UI.$('#ml').onsubmit = e => { e.preventDefault(); const f = UI.formData(e.target); const c = DB.cfg(); DB.put('config', Object.assign({}, c, { lotMin: Number(f.min) || 1, maxLine: { Q: Number(f.Q) || 0, P: Number(f.P) || 0, T: Number(f.T) || 0, SP: Number(f.SP) || 0 } })); DB.log('config.topes', JSON.stringify(f)); UI.toast('Guardado'); };
    v.querySelectorAll('[data-ac]').forEach(c => c.onchange = () => DB.patch('limits', c.dataset.ac, { active: c.checked }));
    v.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { if (await UI.confirm('¿Eliminar regla?')) { DB.remove('limits', b.dataset.d); DB.log('tope.eliminado', b.dataset.d); render(); } });
    UI.$('#nl').onclick = () => {
      const m = UI.modal('Nuevo tope / bloqueo', `<form id="lf"><div class="grid g2">
        <div class="field"><label>Alcance</label><select name="scope">${Auth.allBancas() && Auth.isPlatform() ? '<option value="global">Todas las bancas de la plataforma (suma total)</option>' : ''}${Auth.allBancas() ? Auth.consorcios().map(c => `<option value="c:${c.id}">Todo el consorcio ${U.esc(c.name)} (suma)</option>`).join('') : ''}${Auth.bancas().map(b => `<option value="${b.id}">${U.esc(b.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Lotería</label><select name="lot"><option value="*">Todas</option>${Lot.list().map(l => `<option value="${l.id}">${U.esc(l.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Tipo de jugada</label><select name="kind">${['Q', 'P', 'T', 'SP'].map(k => `<option value="${k}">${KIND_NAMES[k]}</option>`).join('')}<option value="*">Todas</option></select></div>
        <div class="field"><label>Número (ej. 25, 25-47, o * = todos)</label><input name="num" required placeholder="25"></div>
        <div class="field"><label>Monto máximo por día</label><input name="max" type="number" min="0"></div>
        <div class="field"><label>Nota</label><input name="note"></div></div>
        <label class="chk"><input type="checkbox" name="blocked"> Bloquear completamente (no se vende)</label><button class="btn pri">Guardar</button></form>`);
      m.querySelector('#lf').onsubmit = e => {
        e.preventDefault(); const f = UI.formData(e.target);
        const num = f.num.trim() === '*' ? '*' : f.num.replace(/[^0-9-]/g, '').split('-').filter(Boolean).map(x => x.padStart(2, '0')).join('-');
        if (!f.blocked && !(Number(f.max) >= 0 && f.max !== '')) return UI.toast('Indique monto máximo o marque bloquear', 'warn');
        DB.put('limits', { id: U.uid('lim_'), scope: f.scope, lot: f.lot, kind: f.kind, num, max: Number(f.max) || 0, blocked: f.blocked, note: f.note, active: true, by: Auth.user().username });
        DB.log('tope.creado', `${num} ${f.kind} ${f.lot} ${f.blocked ? 'bloqueado' : f.max}`); UI.closeModal(); render();
      };
    };
  }
  function soldQuick(r) {
    let s = 0; const d = U.today();
    DB.all('tickets').forEach(t => { if (t.type !== 'loteria' || t.date !== d || t.status === 'anulado' || (r.scope !== 'global' && t.bancaId !== r.scope)) return; t.lines.forEach(l => { if (l.kind === r.kind && (l.lot === r.lot || l.lot2 === r.lot) && [...l.nums].sort().join('-') === r.num.split('-').sort().join('-')) s += Number(l.amount); }); });
    return s;
  }

  /* ======================= BANCAS ======================= */
  function staffOf(bancaId) { return DB.all('users').filter(u => Auth.userBancas(u).includes(bancaId)); }
  function bancas(v, act) {
    const list = Auth.bancas();
    const canEdit = Auth.can('bancas.edit');
    const d = U.today();
    act.innerHTML = canEdit ? '<button class="btn sm pri" id="nb">+ Nueva banca / punto de venta</button>' : '';
    const fc = bancas.c || ''; const plat = Auth.isPlatform();
    const shown = list.filter(b => !fc || b.consorcioId === fc);
    v.innerHTML = `${plat ? `<div class="card" style="margin-bottom:12px"><div class="row"><label style="margin:0">Consorcio</label><select id="fc" style="width:auto"><option value="">Todos</option>${Auth.consorcios().map(c => `<option value="${c.id}" ${fc === c.id ? 'selected' : ''}>${U.esc(c.name)}</option>`).join('')}</select></div></div>` : ''}<div class="tbl-wrap"><table><thead><tr><th>Código</th><th>Nombre</th>${plat ? '<th>Consorcio</th>' : ''}<th>Tipo</th><th>Zona / Dirección</th><th>Staff asignado</th><th class="num">Ventas hoy</th><th>Alertas</th><th>Estado</th><th></th></tr></thead><tbody>
      ${shown.map(b => {
      const staff = staffOf(b.id); const ve = DB.all('tickets').filter(t => t.bancaId === b.id && t.date === d && t.status !== 'anulado').reduce((a, t) => a + t.total, 0);
      const low = Inv.lowAt(b.id).length, iss = DB.all('issues').filter(i => i.bancaId === b.id && ['abierto', 'en_proceso'].includes(i.status)).length, req = DB.all('requests').filter(r => r.bancaId === b.id && ['pendiente', 'aprobado', 'despachado'].includes(r.status)).length;
      return `<tr><td>${b.logo ? `<img src="${U.esc(b.logo)}" style="height:22px;max-width:60px;object-fit:contain;background:#fff;border-radius:4px;vertical-align:middle"> ` : ''}<b>${U.esc(b.code)}</b></td><td>${U.esc(b.name)}<br><small>${U.esc(b.phone || '')}</small></td>${plat ? `<td>${U.esc(consName(b.consorcioId))}</td>` : ''}<td>${U.esc(b.type || 'Banca')}</td><td>${U.esc(b.zone || '')}<br><small>${U.esc(b.address || '')}</small></td>
        <td>${staff.map(u => `<span class="pill" title="${U.esc(Auth.roleName(u))}">${U.esc(u.name)} · <small>${U.esc(Auth.roleName(u))}</small></span>`).join('') || '<span class="mut">—</span>'}</td><td class="num">${U.money(ve)}</td>
        <td>${low ? `<span class="badge b-warn" title="Artículos bajo mínimo">📦 ${low}</span> ` : ''}${req ? `<span class="badge b-info" title="Pedidos abiertos">🚚 ${req}</span> ` : ''}${iss ? `<span class="badge b-bad" title="Errores abiertos">🛠️ ${iss}</span>` : ''}</td>
        <td><span class="badge ${b.status === 'activa' ? 'b-ok' : 'b-bad'}">${b.status}</span></td>
        <td><div class="row"><button class="btn sm" data-dt="${b.id}">Ver</button>${canEdit ? `<button class="btn sm" data-e="${b.id}">Editar</button>${Auth.can('consorcio') || Auth.can('bancas.edit') ? `<button class="btn sm" data-br="${b.id}">🎨 Logo y factura</button>` : ''}<button class="btn sm ${b.status === 'activa' ? 'warn' : ''}" data-t="${b.id}">${b.status === 'activa' ? 'Suspender' : 'Activar'}</button>` : ''}</div></td></tr>`;
    }).join('') || `<tr><td colspan="10" class="empty">${plat && !Auth.consorcios().length ? 'Primero cree un consorcio en <a href="#consorcios">Consorcios</a>.' : 'No hay bancas'}</td></tr>`}</tbody></table></div>`;
    const fcs = UI.$('#fc'); if (fcs) fcs.onchange = e => { bancas.c = e.target.value; render(); };
    v.querySelectorAll('[data-br]').forEach(b => b.onclick = () => bancaBrandForm(DB.get('bancas', b.dataset.br)));
    v.querySelectorAll('[data-dt]').forEach(b => b.onclick = () => bancaDetail(DB.get('bancas', b.dataset.dt)));
    if (canEdit) {
      UI.$('#nb').onclick = () => bancaForm(null);
      v.querySelectorAll('[data-e]').forEach(b => b.onclick = () => bancaForm(DB.get('bancas', b.dataset.e)));
      v.querySelectorAll('[data-t]').forEach(b => b.onclick = async () => { const x = DB.get('bancas', b.dataset.t); const ns = x.status === 'activa' ? 'suspendida' : 'activa'; if (!await UI.confirm(`¿${ns === 'activa' ? 'Activar' : 'Suspender'} ${x.name}? ${ns !== 'activa' ? 'No se podrá vender en ella.' : ''}`)) return; DB.patch('bancas', x.id, { status: ns }); DB.log('banca.estado', `${x.code} → ${ns}`, null); render(); });
    }
  }
  /* ficha completa de una banca */
  function bancaDetail(b) {
    const d = U.today(); const R = Reports.range(d, d, { bancaId: b.id }); const R7 = Reports.range(U.addDays(d, -6), d, { bancaId: b.id });
    const sh = DB.all('shifts').filter(s => s.bancaId === b.id && s.status === 'abierto');
    const items = DB.all('items').filter(i => i.active !== false);
    const reqs = DB.all('requests').filter(r => r.bancaId === b.id).sort((a, c) => c.at - a.at).slice(0, 5);
    const iss = DB.all('issues').filter(i => i.bancaId === b.id).sort((a, c) => c.at - a.at).slice(0, 5);
    UI.modal(`${U.esc(b.code)} — ${U.esc(b.name)}`, `<div class="grid g4">
      <div class="card kpi ok"><div class="l">Ventas hoy</div><div class="v">${U.money(R.ventas)}</div></div>
      <div class="card kpi bad"><div class="l">Premios hoy</div><div class="v">${U.money(R.premios)}</div></div>
      <div class="card kpi"><div class="l">Ventas 7 días</div><div class="v">${U.money(R7.ventas)}</div></div>
      <div class="card kpi ${R7.neto >= 0 ? 'ok' : 'bad'}"><div class="l">Neto 7 días</div><div class="v">${U.money(R7.neto)}</div></div></div>
      <div class="grid g2" style="margin-top:12px">
      <div class="card"><h3>Staff</h3>${staffOf(b.id).map(u => `<div class="sl"><span>${U.esc(u.name)} <small>@${U.esc(u.username)}</small></span><span><span class="pill">${U.esc(Auth.roleName(u))}</span>${sh.some(s => s.userId === u.id) ? '<span class="badge b-ok">en turno</span>' : ''}</span></div>`).join('') || '<p class="mut">Sin staff</p>'}
        <p class="small">${U.esc(b.address || '')} · ${U.esc(b.zone || '')} · ${U.esc(b.phone || '')}${b.license ? ' · Lic. ' + U.esc(b.license) : ''}</p></div>
      <div class="card"><h3>Existencias</h3><table><tbody>${items.map(i => { const q = Inv.qty(b.id, i.id), m = Inv.min(b.id, i); return `<tr><td>${U.esc(i.name)}</td><td class="num ${q <= 0 && m ? 'zero' : q <= m && m ? 'low' : ''}">${q} ${U.esc(i.unit)}</td><td class="small">mín. ${m}</td></tr>`; }).join('')}</tbody></table></div>
      <div class="card"><h3>Pedidos recientes</h3>${reqs.map(r => `<div class="sl"><span>${U.esc(r.code)} <small>${U.dt(r.at)}</small></span>${Requests.badge(r.status)}</div>`).join('') || '<p class="mut">Sin pedidos</p>'}</div>
      <div class="card"><h3>Reportes de errores</h3>${iss.map(i => `<div class="sl"><span>${U.esc(i.code)} ${U.esc(i.title)}</span>${Issues.badge(Issues.ST, i.status)}</div>`).join('') || '<p class="mut">Sin reportes</p>'}</div></div>`, { wide: true });
  }
  function bancaForm(b) {
    const isNew = !b; b = b || { code: 'B' + String(DB.all('bancas').length + 1).padStart(3, '0'), status: 'activa', type: 'Banca', consorcioId: Auth.consorcio() || bancas.c || (Auth.consorcios()[0] || {}).id };
    if (!Auth.consorcios().length) { UI.toast('Primero cree un consorcio', 'warn'); location.hash = '#consorcios'; return; }
    const m = UI.modal(isNew ? 'Nueva banca / punto de venta' : 'Editar banca', `<form id="bf"><div class="grid g2">
      ${Auth.isPlatform() ? `<div class="field"><label>Consorcio</label><select name="consorcioId">${Auth.consorcios().map(c => `<option value="${c.id}" ${b.consorcioId === c.id ? 'selected' : ''}>${U.esc(c.name)}</option>`).join('')}</select></div>` : ''}
      <div class="field"><label>Código (prefijo de tickets)</label><input name="code" value="${U.esc(b.code)}" required maxlength="6"></div>
      <div class="field"><label>Nombre</label><input name="name" value="${U.esc(b.name || '')}" required></div>
      <div class="field"><label>Tipo</label><select name="type">${['Banca', 'Punto de venta', 'Agencia', 'Kiosco', 'Vendedor ambulante', 'Oficina'].map(t => `<option ${b.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label>Zona / Sector</label><input name="zone" value="${U.esc(b.zone || '')}"></div>
      <div class="field"><label>Dirección</label><input name="address" value="${U.esc(b.address || '')}"></div>
      <div class="field"><label>Teléfono</label><input name="phone" value="${U.esc(b.phone || '')}"></div>
      <div class="field"><label>Encargado / Dueño del local</label><input name="owner" value="${U.esc(b.owner || '')}"></div>
      <div class="field"><label>Licencia / No. registro</label><input name="license" value="${U.esc(b.license || '')}"></div>
      <div class="field"><label>Límite de venta diario (0 = sin límite)</label><input name="dailyLimit" type="number" value="${b.dailyLimit || 0}"></div></div>
      <label class="chk"><input type="checkbox" name="sports" ${b.sports !== false ? 'checked' : ''}> Vende deportes</label>
      <button class="btn pri">Guardar</button></form>`, { wide: true });
    m.querySelector('#bf').onsubmit = async e => {
      e.preventDefault(); const f = UI.formData(e.target); f.code = f.code.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (DB.all('bancas').some(x => x.code === f.code && x.id !== b.id)) return UI.toast('Ese código ya existe', 'warn');
      const rec = Object.assign({}, b, f, { dailyLimit: Number(f.dailyLimit) || 0, consorcioId: f.consorcioId || b.consorcioId || Auth.consorcio() }); if (!rec.id) { rec.id = U.uid('b_'); rec.createdAt = Date.now(); }
      DB.put('bancas', rec); try { await DB.confirm('bancas', rec.id); } catch (err) { return UI.toast(err.message, 'bad', 6000); } DB.log(isNew ? 'banca.creada' : 'banca.editada', rec.code + ' ' + rec.name); UI.closeModal(); render();
    };
  }

  /* ======================= STAFF ======================= */
  function staff(v, act) {
    const sc = Auth.scope();
    const fb = staff.banca || '';
    const plat = Auth.isPlatform(); const fc = staff.c || '';
    const list = DB.all('users').filter(u => plat ? (sc === null || Auth.userBancas(u).some(id => sc.includes(id))) : (u.consorcioId === Auth.consorcio() && (Auth.allBancas() || Auth.userBancas(u).some(id => sc.includes(id)))))
      .filter(u => !fb || Auth.userBancas(u).includes(fb)).filter(u => !fc || (fc === '-' ? !u.consorcioId : u.consorcioId === fc))
      .sort((a, b) => (Auth.role(a).order || 0) - (Auth.role(b).order || 0) || a.name.localeCompare(b.name));
    const canEdit = Auth.can('staff.edit');
    const d = U.today();
    act.innerHTML = canEdit ? '<button class="btn sm pri" id="nu">+ Nuevo miembro</button>' : '';
    v.innerHTML = `<div class="card"><div class="row">${plat ? `<label style="margin:0">Consorcio</label><select id="fc" style="width:auto"><option value="">Todos</option><option value="-" ${fc === '-' ? 'selected' : ''}>Plataforma</option>${Auth.consorcios().map(c => `<option value="${c.id}" ${fc === c.id ? 'selected' : ''}>${U.esc(c.name)}</option>`).join('')}</select>` : ''}<label style="margin:0">Banca</label><select id="fb" style="width:auto"><option value="">Todas</option>${Auth.bancas().map(b => `<option value="${b.id}" ${fb === b.id ? 'selected' : ''}>${U.esc(b.code + ' ' + b.name)}</option>`).join('')}</select><span class="small">${list.length} miembros</span></div></div>
      <div class="tbl-wrap" style="margin-top:12px"><table><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Bancas asignadas</th><th>Comisión</th><th class="num">Ventas hoy</th><th>Último acceso</th><th>Estado</th><th></th></tr></thead><tbody>
      ${list.map(u => { const ve = DB.all('tickets').filter(t => t.userId === u.id && t.date === d && t.status !== 'anulado').reduce((a, t) => a + t.total, 0); const sh = Shifts.current(u); const r = Auth.role(u); const ids = Auth.userBancas(u);
      return `<tr><td><b>${U.esc(u.name)}</b><br><small>${U.esc(u.phone || '')} ${U.esc(u.cedula ? '· ' + u.cedula : '')}</small></td><td>${U.esc(u.username)}</td><td><span class="pill">${U.esc(r.name)}</span>${plat ? `<br><small>${u.consorcioId ? U.esc(consName(u.consorcioId)) : '<b>Plataforma</b>'}</small>` : ''}${r.scope === 'all' ? '<br><small>ve todas las bancas' + (u.consorcioId ? ' del consorcio' : '') + '</small>' : ''}</td>
        <td>${r.scope === 'all' ? '<span class="mut">Todas</span>' : ids.map(id => `<span class="pill">${U.esc((DB.get('bancas', id) || {}).code || '?')}</span>`).join('') || '<span class="badge b-warn">Sin banca</span>'}</td>
        <td>${u.commission || 0}%</td><td class="num">${U.money(ve)}</td><td>${u.lastLogin ? U.dt(u.lastLogin) : '—'}${sh ? '<br><span class="badge b-ok">en turno</span>' : ''}</td><td><span class="badge ${u.active ? 'b-ok' : 'b-bad'}">${u.active ? 'activo' : 'inactivo'}</span>${u.lockedUntil > Date.now() ? '<br><span class="badge b-warn">bloqueado</span>' : ''}</td>
        <td>${canEdit ? `<div class="row"><button class="btn sm" data-e="${u.id}">Editar</button><button class="btn sm" data-p="${u.id}">Clave</button></div>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="9" class="empty">Sin staff</td></tr>'}</tbody></table></div>`;
    UI.$('#fb').onchange = e => { staff.banca = e.target.value; render(); };
    const fcs = UI.$('#fc'); if (fcs) fcs.onchange = e => { staff.c = e.target.value; render(); };
    if (!canEdit) return;
    UI.$('#nu').onclick = () => userForm(null);
    v.querySelectorAll('[data-e]').forEach(b => b.onclick = () => userForm(DB.get('users', b.dataset.e)));
    v.querySelectorAll('[data-p]').forEach(b => b.onclick = async () => { const u = DB.get('users', b.dataset.p); const pw = await UI.prompt('Nueva contraseña para ' + u.username + ' (mín. 4):'); if (!pw || pw.length < 4) return; await Auth.setPassword(u.id, pw); DB.patch('users', u.id, { mustChange: Auth.hasControl(u), fails: 0, lockedUntil: 0 }); DB.log('usuario.reset_clave', u.username); UI.toast('Contraseña cambiada'); render(); });
  }
  function userForm(u, preset) {
    const isNew = !u; u = u || Object.assign({ role: 'cajero', active: true, commission: 5, bancaIds: [], consorcioId: Auth.consorcio() || staff.c && staff.c !== '-' && staff.c || (Auth.consorcios()[0] || {}).id || '' }, preset || {});
    const me = Auth.user(); const myRole = Auth.role(me); const plat = Auth.isPlatform();
    const ids = Auth.userBancas(u);
    // solo puede asignar roles con permisos que él mismo tenga (o admin)
    const rolesFor = cid => DB.all('roles').sort((a, b) => (a.order || 0) - (b.order || 0)).filter(r => (!r.consorcioId || r.consorcioId === cid) && !(cid && r.perms.includes('*')) && (Auth.can('*') || (!r.perms.includes('*') && r.perms.filter(p => !(Auth.PLATFORM_PERMS.includes(p) && cid)).every(p => Auth.can(p)) && (r.scope !== 'all' || myRole.scope === 'all'))));
    const roles = rolesFor(u.consorcioId || '');
    const bancasFor = cid => Auth.bancas().filter(b => !cid || b.consorcioId === cid);
    const m = UI.modal(isNew ? 'Nuevo miembro del staff' : 'Editar ' + U.esc(u.name), `<form id="uf"><div class="grid g2">
      ${plat ? `<div class="field"><label>Consorcio</label><select name="consorcioId" id="csel" ${!isNew && u.id === me.id ? 'disabled' : ''}><option value="">— Plataforma (AuraSport) —</option>${Auth.consorcios().map(c => `<option value="${c.id}" ${u.consorcioId === c.id ? 'selected' : ''}>${U.esc(c.name)}</option>`).join('')}</select></div>` : ''}
      <div class="field"><label>Nombre completo</label><input name="name" value="${U.esc(u.name || '')}" required></div>
      <div class="field"><label>Usuario</label><input name="username" value="${U.esc(u.username || '')}" required ${isNew ? '' : 'readonly'}></div>
      <div class="field"><label>Rol</label><select name="role" id="rsel">${roles.map(r => `<option value="${r.id}" ${u.role === r.id ? 'selected' : ''}>${U.esc(r.name)}</option>`).join('')}</select><small id="rdesc"></small></div>
      <div class="field"><label>Comisión sobre ventas (%)</label><input name="commission" type="number" step="0.1" value="${u.commission || 0}"></div>
      <div class="field"><label>Cédula</label><input name="cedula" value="${U.esc(u.cedula || '')}"></div>
      <div class="field"><label>Teléfono</label><input name="phone" value="${U.esc(u.phone || '')}"></div>
      ${isNew ? '<div class="field"><label>Contraseña inicial</label><input name="pw" type="text" required minlength="4"></div>' : ''}</div>
      <div class="field" id="bwrap"><label>Bancas asignadas (puede marcar varias)</label><div class="chips" id="bchips"></div></div>
      <label class="chk"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Activo</label>
      <button class="btn pri">Guardar</button></form>`, { wide: true });
    const sel = m.querySelector('#rsel'); const csel = m.querySelector('#csel');
    const cid = () => csel ? csel.value : (u.consorcioId || Auth.consorcio());
    const drawB = () => { const keep = new Set([...m.querySelectorAll('#bchips input:checked')].map(i => i.name.slice(2)).concat(m.querySelector('#bchips').dataset.init ? [] : ids)); m.querySelector('#bchips').dataset.init = 1;
      m.querySelector('#bchips').innerHTML = bancasFor(cid()).map(b => `<label class="chipc"><input type="checkbox" name="b_${b.id}" ${keep.has(b.id) ? 'checked' : ''}> ${U.esc(b.code)} ${U.esc(b.name)}</label>`).join('') || '<span class="mut">Este consorcio aún no tiene bancas</span>'; };
    const upd = () => { const r = DB.get('roles', sel.value) || {}; m.querySelector('#rdesc').textContent = (r.desc || '') + (r.scope === 'all' ? (cid() ? ' · Ve todas las bancas del consorcio.' : ' · Ve todos los consorcios.') : ' · Ve solo sus bancas asignadas.'); };
    if (csel) csel.onchange = () => { const cur = sel.value; sel.innerHTML = rolesFor(cid()).map(r => `<option value="${r.id}" ${cur === r.id ? 'selected' : ''}>${U.esc(r.name)}</option>`).join(''); drawB(); upd(); };
    sel.onchange = upd; drawB(); upd();
    m.querySelector('#uf').onsubmit = async e => {
      e.preventDefault(); const f = UI.formData(e.target); f.username = f.username.trim().toLowerCase();
      if (isNew && DB.all('users').some(x => x.username === f.username)) return UI.toast('Ese usuario ya existe', 'warn');
      const role = DB.get('roles', f.role);
      // conservar bancas que el editor no puede ver
      const hidden = ids.filter(id => !Auth.sees(id));
      const bancaIds = hidden.concat(bancasFor(cid()).filter(b => f['b_' + b.id]).map(b => b.id));
      if (role.scope !== 'all' && !bancaIds.length) return UI.toast('Asigne al menos una banca', 'warn');
      if (u.id === me.id && (!role.perms.includes('*') && myRole.perms.includes('*') || !f.active)) return UI.toast('No puede quitarse su propio acceso de administrador', 'warn');
      const rec = Object.assign({}, u, { consorcioId: cid() || '', name: f.name, username: f.username, role: f.role, bancaIds, cedula: f.cedula, phone: f.phone, commission: Number(f.commission) || 0, active: f.active });
      delete rec.bancaId;
      if (isNew) { rec.id = U.uid('u_'); rec.pass = await U.sha('bancard:' + f.pw); rec.mustChange = Auth.hasControl(rec); rec.createdAt = Date.now(); }
      DB.put('users', rec);
      if (DB.serverMode) { try { await DB.confirm('users', rec.id); if (isNew) await Auth.setPassword(rec.id, f.pw); } catch (err) { return UI.toast(err.message, 'bad', 6000); } } DB.log(isNew ? 'usuario.creado' : 'usuario.editado', `${rec.username} (${role.name}) bancas: ${bancaIds.map(id => (DB.get('bancas', id) || {}).code).join(',')}`); UI.closeModal(); render();
    };
  }

  /* ======================= ROLES ======================= */
  function roles(v, act) {
    const list = DB.all('roles').filter(r => (!r.consorcioId || Auth.seesConsorcio(r.consorcioId)) && (Auth.isPlatform() || !r.perms.includes('*'))).sort((a, b) => (a.order || 0) - (b.order || 0));
    act.innerHTML = '<button class="btn sm pri" id="nr">+ Nuevo rol</button>';
    const editable = r => !r.system && (Auth.isPlatform() || r.consorcioId === Auth.consorcio());
    v.innerHTML = `<p class="mut">Cada miembro del staff tiene un rol. El rol define qué puede hacer y si ve <b>todas las bancas</b> o <b>solo las asignadas</b>.</p>
      <div class="tbl-wrap"><table><thead><tr><th>Rol</th><th>Alcance</th><th>Accesos</th><th>Permisos</th><th class="num">Usuarios</th><th></th></tr></thead><tbody>
      ${list.map(r => { const n = DB.all('users').filter(u => u.role === r.id).length; const all = r.perms.includes('*'); return `<tr><td><b>${U.esc(r.name)}</b><br><small>${U.esc(r.desc || '')}</small></td><td>${r.scope === 'all' ? '<span class="badge b-info">Todas las bancas</span>' : '<span class="badge b-mute">Bancas asignadas</span>'}</td>
        <td>${Auth.can('pos', { role: r.id }) ? '<span class="pill">App de venta</span>' : ''}${Auth.hasControl({ role: r.id }) ? '<span class="pill">Panel</span>' : ''}</td><td class="small">${all ? 'Todos' : r.perms.length + ' permisos'}</td><td class="num">${n}</td>
        <td>${r.system ? '<span class="small mut">fijo</span>' : `<div class="row">${editable(r) ? `<button class="btn sm" data-e="${r.id}">Editar</button>` : '<span class="small mut">general</span>'}<button class="btn sm" data-c="${r.id}">Duplicar</button></div>`}${r.consorcioId && Auth.isPlatform() ? `<br><small>${U.esc(consName(r.consorcioId))}</small>` : ''}</td></tr>`; }).join('')}</tbody></table></div>
      <div class="card" style="margin-top:12px"><h3>Matriz de permisos</h3><div class="tbl-wrap"><table><thead><tr><th>Permiso</th>${list.map(r => `<th>${U.esc(r.name)}</th>`).join('')}</tr></thead><tbody>
      ${Auth.PERMS.map(([g, ps]) => `<tr><td colspan="${list.length + 1}"><b>${g}</b></td></tr>` + ps.map(([k, n]) => `<tr><td class="small">${U.esc(n)}</td>${list.map(r => `<td>${r.perms.includes('*') || r.perms.includes(k) ? '✅' : ''}</td>`).join('')}</tr>`).join('')).join('')}</tbody></table></div></div>`;
    UI.$('#nr').onclick = () => roleForm(null);
    v.querySelectorAll('[data-e]').forEach(b => b.onclick = () => roleForm(DB.get('roles', b.dataset.e)));
    v.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { const r = DB.get('roles', b.dataset.c); roleForm(Object.assign({}, r, { id: null, name: r.name + ' (copia)', system: false, consorcioId: Auth.consorcio() })); });
  }
  function roleForm(r) {
    const isNew = !r || !r.id; r = r || { name: '', scope: 'assigned', perms: ['pos'], order: 10, consorcioId: Auth.consorcio() };
    const platOnly = k => Auth.PLATFORM_PERMS.includes(k) && (!Auth.isPlatform() || r.consorcioId);
    const m = UI.modal(isNew ? 'Nuevo rol' : 'Editar rol', `<form id="rf"><div class="grid g2">
      <div class="field"><label>Nombre del rol</label><input name="name" value="${U.esc(r.name)}" required></div>
      <div class="field"><label>Alcance</label><select name="scope"><option value="assigned" ${r.scope !== 'all' ? 'selected' : ''}>Solo bancas asignadas</option><option value="all" ${r.scope === 'all' ? 'selected' : ''}>Todas las bancas${Auth.isPlatform() ? '' : ' del consorcio'}</option></select></div>
      ${Auth.isPlatform() && isNew ? `<div class="field"><label>Rol de</label><select name="consorcioId"><option value="">Uso general (todos los consorcios)</option>${Auth.consorcios().map(c => `<option value="${c.id}" ${r.consorcioId === c.id ? 'selected' : ''}>Solo ${U.esc(c.name)}</option>`).join('')}</select></div>` : ''}</div>
      <div class="field"><label>Descripción</label><input name="desc" value="${U.esc(r.desc || '')}"></div>
      ${Auth.PERMS.map(([g, ps]) => `<div class="perm-g"><h4>${g}</h4><div class="chips">${ps.filter(([k]) => !platOnly(k)).map(([k, n]) => `<label class="chipc"><input type="checkbox" name="p_${k}" ${r.perms.includes(k) ? 'checked' : ''}> ${U.esc(n)}</label>`).join('')}</div></div>`).join('')}
      <div class="row"><button class="btn pri">Guardar rol</button>${!isNew ? '<button type="button" class="btn bad" id="dr">Eliminar</button>' : ''}</div></form>`, { wide: true });
    m.querySelector('#rf').onsubmit = e => {
      e.preventDefault(); const f = UI.formData(e.target);
      const perms = Auth.ALL_PERMS.filter(k => f['p_' + k]);
      const rec = Object.assign({}, r, { name: f.name.trim(), scope: f.scope, desc: f.desc, perms: perms.filter(k => !platOnly(k)) }); if (!rec.id) rec.id = U.uid('rol_');
      if (isNew && Auth.isPlatform()) rec.consorcioId = f.consorcioId || '';
      DB.put('roles', rec); DB.log(isNew ? 'rol.creado' : 'rol.editado', `${rec.name}: ${perms.join(', ')}`); UI.closeModal(); render();
    };
    const dr = m.querySelector('#dr'); if (dr) dr.onclick = async () => { if (DB.all('users').some(u => u.role === r.id)) return UI.toast('Hay usuarios con este rol: cámbielos primero', 'warn'); if (await UI.confirm('¿Eliminar el rol ' + r.name + '?')) { DB.remove('roles', r.id); DB.log('rol.eliminado', r.name); UI.closeModal(); render(); } };
  }

  /* ======================= INVENTARIO ======================= */
  function inventario(v, act) {
    const locs = centralLocs().concat(Auth.bancas());
    const loc = inventario.loc && locs.some(l => l.id === inventario.loc) ? inventario.loc : (locs[0] || {}).id;
    const tab = inventario.tab || 'exist';
    const items = Inv.itemsFor(loc);
    const canEdit = Auth.can('inventory.edit'); const cen = loc && !Inv.isCentral(loc) ? Inv.centralForBanca(loc) : '';
    act.innerHTML = (canEdit ? '<button class="btn sm pri" id="ent">+ Entrada (compra)</button><button class="btn sm" id="cat">Catálogo de artículos</button>' : '') + Docs.buttons('inv');
    Docs.bind(act, 'inv', () => ({ title: 'Existencias de inventario', subtitle: Inv.locName(loc), ctx: Inv.isCentral(loc) ? { consorcioId: String(loc).startsWith('cen:') ? loc.slice(4) : '' } : { bancaId: loc },
      sections: [{ columns: [{ h: 'Artículo', w: 3 }, { h: 'Categoría', w: 1.5 }, { h: 'Existencia', align: 'right' }, { h: 'Mínimo', align: 'right' }, { h: 'Estado' }],
        rows: items.map(i => { const q = Inv.qty(loc, i.id), mn = Inv.min(loc, i); return [i.name, i.category || '', q + ' ' + (i.unit || ''), mn, !mn ? '' : q <= 0 ? 'AGOTADO' : q <= mn ? 'Bajo mínimo' : 'OK']; }) }],
      signatures: ['Contado por', 'Revisado por'] }), () => 'inventario_' + Inv.locName(loc) + '_' + U.today());
    const tabs = `<div class="tabs">${[['exist', 'Existencias por ubicación'], ['matriz', 'Vista general'], ['mov', 'Movimientos']].map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-it="${k}">${n}</button>`).join('')}</div>`;
    if (!loc) { v.innerHTML = '<div class="empty">No tiene bancas asignadas</div>'; return; }
    if (tab === 'exist') {
      v.innerHTML = tabs + `<div class="card"><div class="row"><label style="margin:0">Ubicación</label><select id="loc" style="width:auto">${locs.map(l => `<option value="${l.id}" ${l.id === loc ? 'selected' : ''}>${U.esc(l.name)}</option>`).join('')}</select>
        ${!Inv.isCentral(loc) && Auth.can('requests.create') ? '<button class="btn sm" id="ped">Pedir material para esta banca</button>' : ''}</div></div>
        <div class="tbl-wrap" style="margin-top:12px"><table><thead><tr><th>Artículo</th><th>Categoría</th><th class="num">Existencia</th><th class="num">Mínimo</th>${!Inv.isCentral(loc) ? '<th class="num">En camino</th><th class="num">En almacén</th>' : ''}<th>Estado</th><th></th></tr></thead><tbody>
        ${items.map(i => { const q = Inv.qty(loc, i.id), mn = Inv.min(loc, i); const st = !mn ? '' : q <= 0 ? '<span class="badge b-bad">Agotado</span>' : q <= mn ? '<span class="badge b-warn">Bajo mínimo</span>' : '<span class="badge b-ok">OK</span>';
        return `<tr><td><b>${U.esc(i.name)}</b></td><td>${U.esc(i.category || '')}</td><td class="num ${q <= 0 && mn ? 'zero' : q <= mn && mn ? 'low' : ''}">${q} ${U.esc(i.unit)}</td><td class="num">${mn}</td>${!Inv.isCentral(loc) ? `<td class="num">${Inv.inTransit(loc, i.id) || ''}</td><td class="num">${Inv.qty(cen, i.id)}</td>` : ''}<td>${st}</td>
          <td><div class="row">${Auth.can('inventory.use') && !Inv.isCentral(loc) ? `<button class="btn sm" data-use="${i.id}">Consumo</button>` : ''}${canEdit ? `<button class="btn sm" data-cnt="${i.id}">Conteo</button>${!Inv.isCentral(loc) ? `<button class="btn sm" data-tr="${i.id}">Transferir</button>` : ''}` : ''}</div></td></tr>`; }).join('')}</tbody></table></div>`;
      UI.$('#loc').onchange = e => { inventario.loc = e.target.value; render(); };
      const pb = UI.$('#ped'); if (pb) pb.onclick = () => requestForm(loc);
      v.querySelectorAll('[data-use]').forEach(b => b.onclick = () => qtyModal('Registrar consumo', DB.get('items', b.dataset.use), (q, note) => Inv.move({ type: 'consumo', itemId: b.dataset.use, qty: q, from: loc, note })));
      v.querySelectorAll('[data-cnt]').forEach(b => b.onclick = async () => { const it = DB.get('items', b.dataset.cnt); const c = await UI.prompt(`Conteo físico de ${it.name} en ${Inv.locName(loc)} (actual en sistema: ${Inv.qty(loc, it.id)})`, Inv.qty(loc, it.id)); if (c === null || c === '' || isNaN(c)) return; const d = Inv.setCount(loc, it.id, Number(c)); UI.toast(d ? `Ajuste de ${d > 0 ? '+' : ''}${d}` : 'Sin diferencia'); render(); });
      v.querySelectorAll('[data-tr]').forEach(b => b.onclick = () => transferModal(DB.get('items', b.dataset.tr), loc));
    } else if (tab === 'matriz') {
      const items = [...new Map(locs.flatMap(l => Inv.itemsFor(l.id)).map(i => [i.id, i])).values()];
      v.innerHTML = tabs + `<div class="tbl-wrap"><table><thead><tr><th>Artículo</th>${locs.map(l => `<th class="num">${U.esc(l.code || 'ALM')}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>
        ${items.map(i => `<tr><td>${U.esc(i.name)}</td>${locs.map(l => { const q = Inv.qty(l.id, i.id), mn = Inv.min(l.id, i); return `<td class="num ${q <= 0 && mn ? 'zero' : q <= mn && mn ? 'low' : ''}">${q}</td>`; }).join('')}<td class="num"><b>${locs.reduce((a, l) => a + Inv.qty(l.id, i.id), 0)}</b></td></tr>`).join('')}</tbody></table></div>
        <p class="small"><span class="low">Amarillo</span> = bajo mínimo · <span class="zero">Rojo</span> = agotado.</p>`;
    } else {
      const visible = new Set(locs.map(l => l.id));
      const mv = DB.all('movements').filter(m => visible.has(m.from) || visible.has(m.to)).sort((a, b) => b.at - a.at).slice(0, 400);
      v.innerHTML = tabs + `<div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Artículo</th><th class="num">Cant.</th><th>Desde</th><th>Hacia</th><th>Ref.</th><th>Usuario</th><th>Nota</th></tr></thead><tbody>
        ${mv.map(m => `<tr><td>${U.dt(m.at)}</td><td><span class="pill">${U.esc(Inv.TYPES[m.type] || m.type)}</span></td><td>${U.esc((DB.get('items', m.itemId) || {}).name || m.itemId)}</td><td class="num">${m.qty}</td><td>${m.from ? U.esc(Inv.locName(m.from)) : ''}</td><td>${m.to ? U.esc(Inv.locName(m.to)) : ''}</td><td>${U.esc(m.ref || '')}</td><td>${U.esc(m.by)}</td><td class="small">${U.esc(m.note || '')}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">Sin movimientos</td></tr>'}</tbody></table></div>`;
    }
    v.querySelectorAll('[data-it]').forEach(b => b.onclick = () => { inventario.tab = b.dataset.it; render(); });
    if (canEdit) {
      UI.$('#ent').onclick = () => entryModal(locs);
      UI.$('#cat').onclick = catalogModal;
    }
  }
  function qtyModal(title, item, fn) {
    const m = UI.modal(title + ': ' + U.esc(item.name), `<form id="qf"><div class="field"><label>Cantidad (${U.esc(item.unit)})</label><input name="q" type="number" min="0.01" step="any" required></div><div class="field"><label>Nota</label><input name="n"></div><button class="btn pri">Guardar</button></form>`);
    m.querySelector('#qf').onsubmit = e => { e.preventDefault(); const f = UI.formData(e.target); try { fn(Number(f.q), f.n); UI.closeModal(); UI.toast('Registrado'); render(); } catch (err) { UI.toast(err.message, 'bad'); } };
  }
  function transferModal(item, from) {
    const cid = Inv.isCentral(from) ? (String(from).startsWith('cen:') ? from.slice(4) : null) : (DB.get('bancas', from) || {}).consorcioId;
    const dests = centralLocs().concat(Auth.bancas()).filter(l => l.id !== from && (cid === null || (Inv.isCentral(l.id) ? l.id === Inv.centralOf(cid) : (DB.get('bancas', l.id) || {}).consorcioId === cid)));
    const m = UI.modal('Transferir ' + U.esc(item.name), `<form id="tf"><p class="mut">Desde: ${U.esc(Inv.locName(from))} (hay ${Inv.qty(from, item.id)})</p><div class="field"><label>Hacia</label><select name="to">${dests.map(l => `<option value="${l.id}">${U.esc(l.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Cantidad</label><input name="q" type="number" min="1" step="any" required></div><div class="field"><label>Nota</label><input name="n"></div><button class="btn pri">Transferir</button></form>`);
    m.querySelector('#tf').onsubmit = e => { e.preventDefault(); const f = UI.formData(e.target); try { Inv.move({ type: Inv.isCentral(f.to) ? 'devolucion' : 'transferencia', itemId: item.id, qty: Number(f.q), from, to: f.to, note: f.n }); DB.log('inventario.transferencia', `${item.name} ${f.q} ${Inv.locName(from)} → ${Inv.locName(f.to)}`); UI.closeModal(); render(); } catch (err) { UI.toast(err.message, 'bad'); } };
  }
  function entryModal(locs) {
    const items = [...new Map(locs.flatMap(l => Inv.itemsFor(l.id)).map(i => [i.id, i])).values()];
    const m = UI.modal('Entrada de inventario', `<form id="ef"><div class="grid g2"><div class="field"><label>Ubicación</label><select name="to">${locs.map(l => `<option value="${l.id}">${U.esc(l.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Artículo</label><select name="item">${items.map(i => `<option value="${i.id}">${U.esc(i.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Cantidad</label><input name="q" type="number" min="1" step="any" required></div><div class="field"><label>Costo total (opcional)</label><input name="c" type="number" step="0.01"></div></div>
      <div class="field"><label>Proveedor / factura / nota</label><input name="n"></div><button class="btn pri">Registrar entrada</button></form>`);
    m.querySelector('#ef').onsubmit = e => { e.preventDefault(); const f = UI.formData(e.target); try { Inv.move({ type: 'entrada', itemId: f.item, qty: Number(f.q), to: f.to, note: (f.n || '') + (f.c ? ` · Costo ${U.money(f.c)}` : '') }); DB.log('inventario.entrada', `${(DB.get('items', f.item) || {}).name} +${f.q} ${Inv.locName(f.to)}`); UI.closeModal(); UI.toast('Entrada registrada'); render(); } catch (err) { UI.toast(err.message, 'bad'); } };
  }
  function catalogModal() {
    const mine = i => Auth.isPlatform() ? true : i.consorcioId === Auth.consorcio();
    const items = DB.all('items').filter(i => !i.consorcioId || Auth.seesConsorcio(i.consorcioId)).sort((a, b) => a.name.localeCompare(b.name));
    const m = UI.modal('Catálogo de artículos', `<table><thead><tr><th>Artículo</th><th>Categoría</th><th>Unidad</th><th>Mín. banca</th><th>Mín. almacén</th><th>Activo</th></tr></thead><tbody>
      ${Auth.isPlatform() ? '' : '<tr><td colspan="6" class="small mut">Los artículos del catálogo general los mantiene la plataforma; puede agregar artículos propios de su consorcio.</td></tr>'}${items.map(i => !mine(i) ? `<tr><td>${U.esc(i.name)}</td><td>${U.esc(i.category || '')}</td><td>${U.esc(i.unit || '')}</td><td>${i.minBanca || 0}</td><td>${i.minCentral || 0}</td><td><small>general</small></td></tr>` : `<tr data-row="${i.id}"><td><input name="name" value="${U.esc(i.name)}"></td><td><input name="category" value="${U.esc(i.category || '')}" style="width:120px"></td><td><input name="unit" value="${U.esc(i.unit || '')}" style="width:90px"></td><td><input name="minBanca" type="number" value="${i.minBanca || 0}" style="width:80px"></td><td><input name="minCentral" type="number" value="${i.minCentral || 0}" style="width:80px"></td><td><input type="checkbox" name="active" ${i.active !== false ? 'checked' : ''}></td></tr>`).join('')}</tbody></table>
      <div class="row" style="margin-top:10px"><button class="btn pri" id="sv">Guardar cambios</button></div><hr>
      <form id="ni" class="row"><input name="name" placeholder="Nuevo artículo" required style="flex:2"><input name="category" placeholder="Categoría" style="flex:1"><input name="unit" placeholder="Unidad" style="width:100px"><input name="minBanca" type="number" placeholder="Mín. banca" style="width:110px"><button class="btn">Agregar</button></form>`, { wide: true });
    m.querySelector('#sv').onclick = () => { m.querySelectorAll('[data-row]').forEach(tr => { const it = DB.get('items', tr.dataset.row); const g = n => tr.querySelector(`[name=${n}]`); DB.put('items', Object.assign({}, it, { name: g('name').value, category: g('category').value, unit: g('unit').value, minBanca: Number(g('minBanca').value) || 0, minCentral: Number(g('minCentral').value) || 0, active: g('active').checked })); }); DB.log('inventario.catalogo', 'editado'); UI.closeModal(); UI.toast('Catálogo guardado'); render(); };
    m.querySelector('#ni').onsubmit = e => { e.preventDefault(); const f = UI.formData(e.target); DB.put('items', { id: U.uid('it_'), consorcioId: Auth.consorcio(), name: f.name, category: f.category, unit: f.unit || 'unidad', minBanca: Number(f.minBanca) || 0, minCentral: 0, active: true }); DB.log('inventario.articulo', f.name); catalogModal(); };
  }

  /* ======================= PEDIDOS ======================= */
  function pedidos(v, act) {
    const sc = Auth.scope(); const f = pedidos.f || 'abiertos';
    let list = DB.all('requests').filter(r => sc === null || sc.includes(r.bancaId));
    if (f === 'abiertos') list = list.filter(r => ['pendiente', 'aprobado', 'despachado'].includes(r.status));
    list.sort((a, b) => (b.priority === 'urgente') - (a.priority === 'urgente') || b.at - a.at);
    act.innerHTML = Auth.can('requests.create') && Auth.bancas().length ? '<button class="btn sm pri" id="np">+ Nuevo pedido</button>' : '';
    v.innerHTML = `<div class="tabs">${[['abiertos', 'Abiertos'], ['todos', 'Todos']].map(([k, n]) => `<button class="tab ${f === k ? 'on' : ''}" data-f="${k}">${n}</button>`).join('')}</div>
      <p class="small">Flujo: <b>Pendiente</b> → el supervisor <b>aprueba</b> o rechaza → <b>despacha</b> (sale del almacén) → la banca confirma <b>recibido</b> (entra a su existencia).</p>
      <div class="tbl-wrap"><table><thead><tr><th>Pedido</th><th>Banca</th><th>Solicitó</th><th>Artículos</th><th>Prioridad</th><th>Estado</th><th></th></tr></thead><tbody>
      ${list.map(r => `<tr><td><b>${U.esc(r.code)}</b><br><small>${U.dt(r.at)}</small></td><td>${U.esc(Inv.locName(r.bancaId))}</td><td>${U.esc(r.byName)}</td><td class="small">${r.lines.map(l => `${U.esc((DB.get('items', l.itemId) || {}).name || l.itemId)}: ${l.qty}${l.qtySent && l.qtySent !== l.qty ? ` (enviado ${l.qtySent})` : ''}`).join('<br>')}${r.note ? `<br><i>“${U.esc(r.note)}”</i>` : ''}</td>
        <td>${r.priority === 'urgente' ? '<span class="badge b-bad">Urgente</span>' : '<span class="badge b-mute">Normal</span>'}</td><td>${Requests.badge(r.status)}</td><td><button class="btn sm" data-o="${r.id}">Abrir</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Sin pedidos</td></tr>'}</tbody></table></div>`;
    v.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { pedidos.f = b.dataset.f; render(); });
    v.querySelectorAll('[data-o]').forEach(b => b.onclick = () => requestModal(DB.get('requests', b.dataset.o)));
    const np = UI.$('#np'); if (np) np.onclick = async () => { const bs = Auth.bancas(); if (bs.length === 1) return requestForm(bs[0].id); const m = UI.modal('¿Para qué banca?', bs.map(b => `<button class="btn" style="width:100%;margin:3px 0" data-b="${b.id}">${U.esc(b.code + ' ' + b.name)}</button>`).join('')); m.querySelectorAll('[data-b]').forEach(x => x.onclick = () => requestForm(x.dataset.b)); };
  }
  /* ======================= SOPORTE / ERRORES ======================= */
  BRD.rerender = () => render();
  DB.on(c => { if (c === 'auth') { UI.toast('Su sesión venció. Entre de nuevo.', 'warn'); start(); } });
  function soporte(v, act) {
    const sc = Auth.scope(); const canM = Auth.can('issues.manage'); const u = Auth.user();
    const f = soporte.f || { st: 'abiertos', cat: '', b: '' };
    let list = DB.all('issues').filter(i => (i.bancaId ? (sc === null || sc.includes(i.bancaId)) : sc === null) && (canM || i.by === u.username || (i.bancaId && Auth.sees(i.bancaId))));
    if (f.st === 'abiertos') list = list.filter(i => ['abierto', 'en_proceso'].includes(i.status)); else if (f.st === 'mios') list = list.filter(i => i.assignedTo === u.username || i.by === u.username);
    if (f.cat) list = list.filter(i => i.category === f.cat); if (f.b) list = list.filter(i => i.bancaId === f.b);
    const pri = { urgente: 0, alta: 1, media: 2, baja: 3 };
    list.sort((a, b) => (['abierto', 'en_proceso'].includes(b.status) - ['abierto', 'en_proceso'].includes(a.status)) || pri[a.priority] - pri[b.priority] || b.at - a.at);
    act.innerHTML = Auth.can('issues.create') ? '<button class="btn sm pri" id="ni">+ Reportar error</button>' : '';
    const all = DB.all('issues').filter(i => (i.bancaId ? (sc === null || sc.includes(i.bancaId)) : sc === null));
    v.innerHTML = `<div class="grid g4"><div class="card kpi warn"><div class="l">Abiertos</div><div class="v">${all.filter(i => i.status === 'abierto').length}</div></div><div class="card kpi"><div class="l">En proceso</div><div class="v">${all.filter(i => i.status === 'en_proceso').length}</div></div><div class="card kpi bad"><div class="l">Urgentes abiertos</div><div class="v">${all.filter(i => i.priority === 'urgente' && ['abierto', 'en_proceso'].includes(i.status)).length}</div></div><div class="card kpi ok"><div class="l">Resueltos (30 días)</div><div class="v">${all.filter(i => i.resolvedAt && Date.now() - i.resolvedAt < 30 * 864e5).length}</div></div></div>
      <div class="card" style="margin-top:12px"><form id="sf" class="row"><select name="st" style="width:auto">${[['abiertos', 'Abiertos / en proceso'], ['mios', 'Míos (asignados o reportados)'], ['todos', 'Todos']].map(([k, n]) => `<option value="${k}" ${f.st === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <select name="cat" style="width:auto"><option value="">Todo tipo</option>${Object.entries(Issues.CATS).map(([k, n]) => `<option value="${k}" ${f.cat === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <select name="b" style="width:auto"><option value="">Todas las bancas</option>${Auth.bancas().map(b => `<option value="${b.id}" ${f.b === b.id ? 'selected' : ''}>${U.esc(b.code)}</option>`).join('')}</select><button class="btn">Filtrar</button></form></div>
      <div class="tbl-wrap" style="margin-top:12px"><table><thead><tr><th>Código</th><th>Problema</th><th>Banca</th><th>Reportó</th><th>Prioridad</th><th>Estado</th><th>Asignado</th><th></th></tr></thead><tbody>
      ${list.map(i => `<tr><td><b>${U.esc(i.code)}</b><br><small>${U.dt(i.at)}</small></td><td>${U.esc(i.title)}<br><small>${Issues.CATS[i.category] || ''} ${i.photo ? '· 📷' : ''} ${(i.comments || []).length ? '· 💬 ' + i.comments.length : ''}</small></td><td>${U.esc(i.bancaId ? (DB.get('bancas', i.bancaId) || {}).code || '' : 'Oficina')}</td><td>${U.esc(i.byName)}</td><td>${Issues.badge(Issues.PRI, i.priority)}</td><td>${Issues.badge(Issues.ST, i.status)}</td><td>${U.esc(i.assignedTo || '—')}</td><td><button class="btn sm" data-o="${i.id}">Abrir</button></td></tr>`).join('') || '<tr><td colspan="8" class="empty">Sin reportes</td></tr>'}</tbody></table></div>`;
    UI.$('#sf').onsubmit = e => { e.preventDefault(); soporte.f = UI.formData(e.target); render(); };
    v.querySelectorAll('[data-o]').forEach(b => b.onclick = () => issueModal(DB.get('issues', b.dataset.o)));
    const ni = UI.$('#ni'); if (ni) ni.onclick = () => issueForm(Auth.bancas().length === 1 ? Auth.bancas()[0].id : '');
  }
  function syserr(v, act) {
    const list = DB.all('syserrors').sort((a, b) => (a.resolved - b.resolved) || b.last - a.last);
    act.innerHTML = '<button class="btn sm" id="clr">Marcar todos como revisados</button>';
    v.innerHTML = `<p class="mut">Errores técnicos capturados automáticamente en la app de venta y el panel (para el equipo de desarrollo). Se agrupan por mensaje.</p>
      <div class="tbl-wrap"><table><thead><tr><th>Último</th><th>App</th><th>Mensaje</th><th>Origen</th><th class="num">Veces</th><th>Usuario</th><th></th></tr></thead><tbody>
      ${list.map(e => `<tr style="${e.resolved ? 'opacity:.5' : ''}"><td>${U.dt(e.last)}<br><small>desde ${U.dt(e.first)}</small></td><td>${U.esc(e.app)}</td><td class="small" style="max-width:420px;word-break:break-word">${U.esc(e.msg)}</td><td class="small">${U.esc(e.src)}</td><td class="num">${e.count}</td><td>${U.esc(e.user)}</td><td>${e.resolved ? '✔' : `<button class="btn sm" data-r="${e.id}">Revisado</button>`}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Sin errores registrados 🎉</td></tr>'}</tbody></table></div>`;
    v.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { DB.patch('syserrors', b.dataset.r, { resolved: true }); render(); });
    UI.$('#clr').onclick = () => { list.filter(e => !e.resolved).forEach(e => DB.patch('syserrors', e.id, { resolved: true })); render(); };
  }
  /* avisos del dashboard */
  function dashAlerts() {
    const bd = badges(); const out = [];
    if (bd.pedidos && Auth.can('requests.approve')) out.push(`<a class="pill" href="#pedidos">🚚 ${bd.pedidos} pedido(s) de material por atender</a>`);
    if (bd.soporte) out.push(`<a class="pill" href="#soporte">🛠️ ${bd.soporte} reporte(s) de error abiertos</a>`);
    if (bd.inventario && Auth.can('inventory.view')) out.push(`<a class="pill" href="#inventario">📦 ${bd.inventario} artículo(s) bajo mínimo</a>`);
    if (bd.syserr && Auth.can('syserrors')) out.push(`<a class="pill" href="#syserr">🐞 ${bd.syserr} error(es) técnicos nuevos</a>`);
    return out.length ? `<div class="card" style="margin-top:12px"><b>Pendientes:</b> ${out.join(' ')}</div>` : '';
  }

  /* ======================= LOTERÍAS ======================= */
  function loterias(v, act) {
    const list = Lot.list(); const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    act.innerHTML = '<button class="btn sm pri" id="nl">+ Nueva lotería</button>';
    v.innerHTML = `<div class="tbl-wrap"><table><thead><tr><th>Lotería</th><th>Hora sorteo</th><th>Hora especial por día</th><th>Cierre antes</th><th>Días</th><th>Jugadas</th><th>Estado hoy</th><th>Activa</th><th></th></tr></thead><tbody>
      ${list.map(l => `<tr><td><div class="row" style="flex-wrap:nowrap">${BRD.Results.logo(l.logo || l.logoSrc, (BRD.COMPANIES[l.company] || BRD.COMPANIES.otras).short, (BRD.COMPANIES[l.company] || BRD.COMPANIES.otras).color, 34)}<span><b>${U.esc(l.name)}</b><br><small>${U.esc((BRD.COMPANIES[l.company] || BRD.COMPANIES.otras).name)}</small></span></div></td><td>${U.hhmm12(l.time)}</td><td class="small">${Object.entries(l.dayTimes || {}).map(([d, t]) => DAYS[d] + ' ' + U.hhmm12(t)).join(', ') || '—'}</td><td>${Lot.closeMins(l)} min</td><td class="small">${(l.days || []).length === 7 ? 'Todos' : (l.days || []).map(d => DAYS[d]).join(' ')}</td><td class="small">${Object.entries(l.games || {}).filter(([, on]) => on).map(([k]) => KIND_NAMES[k]).join(', ')}</td><td>${Lot.status(l).label}</td><td><input type="checkbox" data-a="${l.id}" ${l.active ? 'checked' : ''}></td><td><button class="btn sm" data-e="${l.id}">Editar</button></td></tr>`).join('')}</tbody></table></div>
      <p class="small">Los horarios por defecto son referenciales; verifíquelos con cada lotería y ajústelos aquí. La venta se cierra automáticamente X minutos antes del sorteo.</p>`;
    v.querySelectorAll('[data-a]').forEach(c => c.onchange = () => { DB.patch('lotteries', c.dataset.a, { active: c.checked }); DB.log('loteria.estado', c.dataset.a + ' ' + c.checked); });
    v.querySelectorAll('[data-e]').forEach(b => b.onclick = () => lotForm(DB.get('lotteries', b.dataset.e)));
    UI.$('#nl').onclick = () => lotForm(null);
    function lotForm(l) {
      const isNew = !l; l = l || { name: '', time: '12:00', dayTimes: {}, days: [0, 1, 2, 3, 4, 5, 6], closeMinutes: DB.cfg().closeMinutesDefault, active: true, order: 99, games: { Q: true, P: true, T: true, SP: true } };
      const m = UI.modal(isNew ? 'Nueva lotería' : 'Editar ' + U.esc(l.name), `<form id="lf"><div class="grid g2">
        <div class="field"><label>Nombre</label><input name="name" value="${U.esc(l.name)}" required></div>
        <div class="field"><label>Hora del sorteo</label><input name="time" type="time" value="${l.time}" required></div>
        <div class="field"><label>Cerrar venta (minutos antes)</label><input name="closeMinutes" type="number" min="0" value="${l.closeMinutes}"></div>
        <div class="field"><label>Empresa (para agrupar en resultados)</label><select name="company">${Object.entries(BRD.COMPANIES).map(([k, c]) => `<option value="${k}" ${(l.company || 'otras') === k ? 'selected' : ''}>${U.esc(c.name)}</option>`).join('')}</select></div></div>
        <label>Logo</label><div class="logo-box" style="margin-bottom:10px"><span id="llp">${BRD.Results.logo(l.logo || l.logoSrc, '?', '#64748b', 56)}</span><label class="btn sm" style="margin:0">Subir logo propio<input type="file" id="llf" accept="image/*" hidden></label><button type="button" class="btn sm ghost" id="llr">Usar el automático</button><small class="mut">${l.logoSrc ? 'Hay logo automático de la fuente de resultados.' : ''}</small></div>
        <label>Días que juega / hora especial (vacío = hora normal)</label><div class="grid g4">${DAYS.map((d, i) => `<div><label class="chk"><input type="checkbox" name="d${i}" ${l.days.includes(i) ? 'checked' : ''}> ${d}</label><input type="time" name="t${i}" value="${(l.dayTimes || {})[i] || ''}"></div>`).join('')}</div>
        <label style="margin-top:10px">Jugadas permitidas</label><div class="row">${['Q', 'P', 'T', 'SP'].map(k => `<label class="chk"><input type="checkbox" name="g${k}" ${l.games[k] !== false ? 'checked' : ''}> ${KIND_NAMES[k]}</label>`).join('')}</div>
        <button class="btn pri">Guardar</button></form>`, { wide: true });
      let llogo = l.logo || '';
      m.querySelector('#llf').onchange = async e => { try { llogo = await BRD.Brand.readLogo(e.target.files[0]); m.querySelector('#llp').innerHTML = BRD.Results.logo(llogo, '?', '#64748b', 56); } catch (err) { UI.toast(err.message, 'bad'); } };
      m.querySelector('#llr').onclick = () => { llogo = ''; m.querySelector('#llp').innerHTML = BRD.Results.logo(l.logoSrc, '?', '#64748b', 56); };
      m.querySelector('#lf').onsubmit = e => {
        e.preventDefault(); const f = UI.formData(e.target);
        const rec = Object.assign({}, l, { logo: llogo, company: f.company || 'otras', name: f.name, time: f.time, closeMinutes: Number(f.closeMinutes) || 0, days: DAYS.map((_, i) => f['d' + i] ? i : -1).filter(i => i >= 0), dayTimes: {}, games: { Q: f.gQ, P: f.gP, T: f.gT, SP: f.gSP } });
        DAYS.forEach((_, i) => { if (f['t' + i]) rec.dayTimes[i] = f['t' + i]; });
        if (!rec.id) rec.id = U.uid('lot_');
        DB.put('lotteries', rec); DB.log(isNew ? 'loteria.creada' : 'loteria.editada', rec.name + ' ' + rec.time); UI.closeModal(); render();
      };
    }
  }

  /* ======================= CONFIGURACIÓN ======================= */
  function config(v) {
    const c = DB.cfg(); const p = c.pay; const s = c.sports;
    const inp = (n, val, lab, t = 'number') => `<div class="field"><label>${lab}</label><input name="${n}" type="${t}" step="any" value="${U.esc(val)}"></div>`;
    v.innerHTML = `<form id="cf"><div class="grid g2">
      <div class="card"><h3>Empresa y ticket</h3>${inp('company', c.company, 'Nombre del consorcio', 'text')}${inp('rnc', c.rnc, 'RNC', 'text')}${inp('phone', c.phone, 'Teléfono', 'text')}${inp('currency', c.currency, 'Moneda', 'text')}${inp('ticketHeader', c.ticketHeader, 'Mensaje del ticket', 'text')}${inp('ticketFooter', c.ticketFooter, 'Pie del ticket', 'text')}
        <div class="field"><label>Zona horaria</label><select name="timezone">${['America/Santo_Domingo', 'America/New_York', 'America/La_Paz', 'America/Puerto_Rico'].map(z => `<option ${c.timezone === z ? 'selected' : ''}>${z}</option>`).join('')}</select></div></div>
      <div class="card"><h3>Premios lotería (pago por cada RD$1)</h3><div class="grid g3">${inp('q1', p.q1, 'Quiniela 1ra')}${inp('q2', p.q2, 'Quiniela 2da')}${inp('q3', p.q3, 'Quiniela 3ra')}${inp('p12', p.p12, 'Palé 1ra-2da')}${inp('p13', p.p13, 'Palé 1ra-3ra')}${inp('p23', p.p23, 'Palé 2da-3ra')}${inp('t3', p.t3, 'Tripleta 3 números')}${inp('t2', p.t2, 'Tripleta 2 números')}${inp('sp', p.sp, 'Super Palé')}</div>
        <small>La Ley 139-11 fija la devolución de quiniela; confirme los valores autorizados para su consorcio.</small></div>
      <div class="card"><h3>Reglas de operación</h3>${inp('voidMinutes', c.voidMinutes, 'Minutos para que el cajero anule')}${inp('expiryDays', c.expiryDays, 'Días para cobrar un premio (caducidad)')}${inp('closeMinutesDefault', c.closeMinutesDefault, 'Cierre de lotería por defecto (min antes)')}
        <label class="chk"><input type="checkbox" name="requirePinToPay" ${c.requirePinToPay ? 'checked' : ''}> Exigir PIN del ticket para pagar</label>
        <label class="chk"><input type="checkbox" name="payOnlyIssuingBanca" ${c.payOnlyIssuingBanca ? 'checked' : ''}> Pagar solo en la banca que vendió</label></div>
      <div class="card"><h3>Deportes</h3><div class="grid g2">${inp('minBet', s.minBet, 'Apuesta mínima')}${inp('maxBet', s.maxBet, 'Apuesta máxima')}${inp('maxPayout', s.maxPayout, 'Premio máximo por jugada')}${inp('sclose', s.closeMinutes, 'Cerrar X min antes del juego')}${inp('minParlay', s.minParlay, 'Mín. jugadas en parlay')}${inp('maxParlay', s.maxParlay, 'Máx. jugadas en parlay')}</div>
        <label class="chk"><input type="checkbox" name="autoScores" ${c.autoScores ? 'checked' : ''}> Actualizar marcadores automáticamente</label>${inp('scoresIntervalSec', c.scoresIntervalSec, 'Cada (segundos)')}
        <label>Ligas a actualizar automáticamente</label><div class="row">${DB.all('leagues').filter(l => l.espn).map(l => `<label class="chk"><input type="checkbox" name="el_${l.id}" ${(c.espnLeagues || []).includes(l.id) ? 'checked' : ''}> ${U.esc(l.name)}</label>`).join('')}</div></div>
      </div><button class="btn pri lg" style="margin-top:12px">Guardar configuración</button></form>
      <div class="card" style="margin-top:14px"><h3>Respaldo y datos</h3><p class="mut">Modo actual: <b>${DB.mode}</b>. ${DB.mode === 'local' ? 'Los datos viven en este navegador. Para que varias bancas compartan datos en tiempo real, despliegue el servidor incluido (ver Informe).' : 'Conectado al servidor central.'}</p>
        <div class="row"><button class="btn" id="exp">Descargar respaldo (JSON)</button><label class="btn" style="margin:0">Restaurar respaldo<input type="file" id="imp" accept=".json" hidden></label><button class="btn" id="demo">Generar ventas de prueba</button><button class="btn bad" id="rst">Borrar todo y reiniciar</button></div></div>`;
    UI.$('#cf').onsubmit = e => {
      e.preventDefault(); const f = UI.formData(e.target); const N = k => Number(f[k]) || 0;
      const nc = Object.assign({}, c, { company: f.company, rnc: f.rnc, phone: f.phone, currency: f.currency, ticketHeader: f.ticketHeader, ticketFooter: f.ticketFooter, timezone: f.timezone,
        pay: { q1: N('q1'), q2: N('q2'), q3: N('q3'), p12: N('p12'), p13: N('p13'), p23: N('p23'), t3: N('t3'), t2: N('t2'), sp: N('sp') },
        voidMinutes: N('voidMinutes'), expiryDays: N('expiryDays'), closeMinutesDefault: N('closeMinutesDefault'), requirePinToPay: f.requirePinToPay, payOnlyIssuingBanca: f.payOnlyIssuingBanca,
        sports: { minBet: N('minBet'), maxBet: N('maxBet'), maxPayout: N('maxPayout'), closeMinutes: N('sclose'), minParlay: Math.max(2, N('minParlay')), maxParlay: Math.max(2, N('maxParlay')) },
        autoScores: f.autoScores, scoresIntervalSec: Math.max(30, N('scoresIntervalSec')), espnLeagues: DB.all('leagues').filter(l => f['el_' + l.id]).map(l => l.id) });
      DB.put('config', nc); DB.log('config.guardada', ''); UI.toast('Configuración guardada'); render();
    };
    UI.$('#exp').onclick = () => { U.download(`bancard_respaldo_${U.today()}.json`, DB.exportJSON(), 'application/json'); DB.log('respaldo.descargado', ''); };
    UI.$('#imp').onchange = async e => { const file = e.target.files[0]; if (!file) return; if (!await UI.confirm('Esto reemplaza TODOS los datos actuales. ¿Continuar?')) return; const r = new FileReader(); r.onload = () => { try { DB.importJSON(r.result); UI.toast('Respaldo restaurado'); render(); } catch (err) { UI.toast(err.message, 'bad'); } }; r.readAsText(file); };
    UI.$('#rst').onclick = async () => { if (await UI.prompt('Escriba BORRAR para eliminar todos los datos de este navegador') !== 'BORRAR') return; DB.reset(); Auth.logout(); location.reload(); };
    UI.$('#demo').onclick = demoSales;
    if (DB.serverMode) {
      ['#demo', '#rst'].forEach(x => { const el = UI.$(x); if (el) el.remove(); }); const im = UI.$('#imp'); if (im) im.parentElement.remove();
      UI.$('#exp').textContent = 'Descargar respaldo completo del servidor';
      UI.$('#exp').onclick = async () => { try { const j = await BRD.api.call('backup'); U.download(`bancard_servidor_${U.today()}.json`, JSON.stringify(j), 'application/json'); UI.toast('Respaldo descargado'); } catch (e) { UI.toast(e.message, 'bad'); } };
    }
  }

  /* ventas simuladas para probar reportes */
  function demoSales() {
    const users = DB.all('users').filter(u => u.role === 'cajero' && Auth.userBancas(u).length).map(u => Object.assign({}, u, { bancaId: Auth.userBancas(u)[0] }));
    if (!users.length) return UI.toast('Cree al menos un cajero con banca', 'warn');
    const lots = Lot.list().filter(l => l.active); let n = 0;
    for (let d = -6; d <= 0; d++) {
      const date = U.addDays(U.today(), d);
      users.forEach(u => {
        for (let i = 0; i < 8; i++) {
          const lines = []; const k = Math.random();
          for (let j = 0; j < 1 + Math.floor(Math.random() * 4); j++) {
            const lot = lots[Math.floor(Math.random() * lots.length)].id; const r2 = () => U.pad2(Math.floor(Math.random() * 100));
            if (k < 0.6) lines.push({ kind: 'Q', nums: [r2()], lot, amount: [10, 20, 25, 50, 100][Math.floor(Math.random() * 5)] });
            else if (k < 0.9) { let a = r2(), b = r2(); while (b === a) b = r2(); lines.push({ kind: 'P', nums: [a, b], lot, amount: [5, 10, 20][Math.floor(Math.random() * 3)] }); }
            else { let a = r2(), b = r2(), c = r2(); while (b === a) b = r2(); while (c === a || c === b) c = r2(); lines.push({ kind: 'T', nums: [a, b, c], lot, amount: [5, 10][Math.floor(Math.random() * 2)] }); }
          }
          const ts = U.zonedTs(date, U.pad2(9 + Math.floor(Math.random() * 3)) + ':' + U.pad2(Math.floor(Math.random() * 60)));
          const b = DB.get('bancas', u.bancaId);
          DB.put('tickets', { id: U.uid('t_'), code: b.code + '-' + U.code(8), pin: U.pin(), serial: 0, type: 'loteria', lines, total: lines.reduce((a, l) => a + l.amount, 0), prize: 0, status: 'pendiente', bancaId: u.bancaId, userId: u.id, userName: u.name, shiftId: '', date, createdAt: ts, demo: true }, { silent: true });
          n++;
        }
      });
      if (d < 0) lots.forEach(l => { const r2 = () => U.pad2(Math.floor(Math.random() * 100)); const key = l.id + '_' + date; if (!DB.get('results', key)) DB.put('results', { id: key, lot: l.id, date, n1: r2(), n2: r2(), n3: r2(), by: 'demo', at: Date.now() }, { silent: true }); });
    }
    DB.save(); BRD.gradeAll(); DB.log('demo.ventas', n + ' tickets'); UI.toast(n + ' tickets de prueba creados (últimos 7 días)'); render();
  }

  /* ======================= AUDITORÍA ======================= */
  function auditoria(v, act) {
    const q = (auditoria.q || '').toLowerCase();
    const list = DB.all('audit').filter(a => (a.bancaId ? Auth.sees(a.bancaId) : Auth.allBancas())).filter(a => !q || (a.action + ' ' + a.detail + ' ' + a.user).toLowerCase().includes(q)).sort((a, b) => b.at - a.at).slice(0, 1000);
    act.innerHTML = '<button class="btn sm" id="ex">Exportar CSV</button>';
    v.innerHTML = `<div class="card"><input id="aq" placeholder="Buscar acción, usuario o detalle…" value="${U.esc(auditoria.q || '')}"></div>
      <div class="tbl-wrap" style="margin-top:12px"><table><thead><tr><th>Fecha</th><th>Usuario</th><th>Banca</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>
      ${list.map(a => `<tr><td>${U.dt(a.at)}</td><td>${U.esc(a.user)}</td><td>${U.esc((DB.get('bancas', a.bancaId) || {}).code || '')}</td><td><span class="pill">${U.esc(a.action)}</span></td><td class="small">${U.esc(a.detail)}</td></tr>`).join('')}</tbody></table></div>`;
    UI.$('#aq').onchange = e => { auditoria.q = e.target.value; render(); };
    UI.$('#ex').onclick = () => U.download('auditoria.csv', U.csv([['fecha', 'usuario', 'accion', 'detalle'], ...list.map(a => [U.dt(a.at), a.user, a.action, a.detail])]), 'text/csv');
  }

  /* ======================= INFORME ======================= */
  function informe(v) {
    v.innerHTML = `<div class="card doc" style="max-width:980px">${BRD.REPORT_HTML || '<p>Informe no disponible.</p>'}</div>`;
  }

  DB.on(c => {
    if (!Auth.user() || document.getElementById('modal')) return;
    const a = document.activeElement; if (a && ['INPUT', 'SELECT', 'TEXTAREA'].includes(a.tagName)) return;
    if (['dashboard', 'turnos', 'pedidos', 'soporte', 'inventario', 'syserr'].includes(route()) && ['tickets', '*', 'shifts', 'requests', 'issues', 'stock', 'syserrors'].includes(c)) render();
    else if (['requests', 'issues'].includes(c)) { const bd = badges(); UI.$$('.nav a').forEach(a => { const k = a.getAttribute('href').slice(1); const nb = a.querySelector('.nb'); if (bd[k]) { if (nb) nb.textContent = bd[k]; else a.insertAdjacentHTML('beforeend', `<span class="nb">${bd[k]}</span>`); } else if (nb) nb.remove(); }); }
  });
  setInterval(() => { if (Auth.user() && route() === 'dashboard' && !document.getElementById('modal')) render(); }, 60000);
  Scores.startAuto();
  start();
})();
