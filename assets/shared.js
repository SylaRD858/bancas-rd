/* Formularios compartidos entre la app de venta y el panel: pedidos de material y reportes de errores */
(function () {
  const { U, DB, Auth, UI, Inv, Requests, Issues } = BRD;
  function requestForm(bancaId, onDone) {
    const items = BRD.Inv.itemsFor(bancaId).slice().sort((a, b) => a.name.localeCompare(b.name));
    const low = new Set(Inv.lowAt(bancaId).map(i => i.id));
    const m = UI.modal('Pedir material — ' + U.esc(Inv.locName(bancaId)), `<form id="rq"><table><thead><tr><th>Artículo</th><th class="num">Tengo</th><th class="num">Mín.</th><th>Pedir</th></tr></thead><tbody>
      ${items.map(i => `<tr><td>${U.esc(i.name)} ${low.has(i.id) ? '<span class="badge b-warn">bajo</span>' : ''}</td><td class="num">${Inv.qty(bancaId, i.id)} ${U.esc(i.unit)}</td><td class="num">${Inv.min(bancaId, i)}</td><td><input type="number" min="0" step="any" name="q_${i.id}" value="${low.has(i.id) ? Math.max(1, Inv.min(bancaId, i) * 2 - Inv.qty(bancaId, i.id)) : ''}" style="width:90px"></td></tr>`).join('')}</tbody></table>
      <div class="grid g2" style="margin-top:10px"><div class="field"><label>Prioridad</label><select name="priority"><option value="normal">Normal</option><option value="urgente">Urgente</option></select></div><div class="field"><label>Nota para el supervisor</label><input name="note"></div></div>
      <button class="btn pri">Enviar pedido</button></form>`, { wide: true });
    m.querySelector('#rq').onsubmit = e => {
      e.preventDefault(); const f = UI.formData(e.target);
      const lines = items.filter(i => Number(f['q_' + i.id]) > 0).map(i => ({ itemId: i.id, qty: Number(f['q_' + i.id]) }));
      try { const r = Requests.create({ bancaId, lines, note: f.note, priority: f.priority }); UI.closeModal(); UI.toast('Pedido ' + r.code + ' enviado al supervisor'); (onDone || BRD.rerender)(); } catch (err) { UI.toast(err.message, 'bad'); }
    };
  }
  function requestModal(r, onDone) {
    const canA = Auth.can('requests.approve') && Auth.sees(r.bancaId);
    const u = Auth.user(); const mine = r.by === u.username;
    const m = UI.modal('Pedido ' + U.esc(r.code), `<p>${U.esc(Inv.locName(r.bancaId))} · ${U.esc(r.byName)} · ${U.dt(r.at)} · ${Requests.badge(r.status)} ${r.priority === 'urgente' ? '<span class="badge b-bad">Urgente</span>' : ''}</p>
      <form id="rmf"><table><thead><tr><th>Artículo</th><th class="num">Pedido</th><th class="num">Banca tiene</th><th class="num">Almacén</th><th>${r.status === 'aprobado' || r.status === 'pendiente' ? 'Enviar' : 'Enviado'}</th></tr></thead><tbody>
      ${r.lines.map(l => { const it = DB.get('items', l.itemId) || {}; return `<tr><td>${U.esc(it.name)}</td><td class="num">${l.qty}</td><td class="num">${Inv.qty(r.bancaId, l.itemId)}</td><td class="num ${Inv.qty('central', l.itemId) < l.qty ? 'zero' : ''}">${Inv.qty('central', l.itemId)}</td><td>${canA && ['pendiente', 'aprobado'].includes(r.status) ? `<input type="number" min="0" name="s_${l.itemId}" value="${Math.min(l.qty, Inv.qty('central', l.itemId))}" style="width:80px">` : (l.qtySent || '')}</td></tr>`; }).join('')}</tbody></table>
      <div class="field" style="margin-top:10px"><label>Comentario</label><input name="note"></div>
      <div class="row">
        ${canA && r.status === 'pendiente' ? '<button type="button" class="btn" data-a="aprobado">Aprobar</button><button type="button" class="btn bad" data-a="rechazado">Rechazar</button>' : ''}
        ${canA && ['pendiente', 'aprobado'].includes(r.status) ? '<button type="button" class="btn pri" data-a="despachar">Despachar desde almacén</button>' : ''}
        ${r.status === 'despachado' && (Auth.sees(r.bancaId)) && (Auth.can('requests.create') || canA) ? '<button type="button" class="btn pri" data-a="recibir">Confirmar recibido</button>' : ''}
        ${r.status === 'pendiente' && mine ? '<button type="button" class="btn ghost" data-a="cancelado">Cancelar pedido</button>' : ''}
      </div></form>
      <h4 style="margin-top:14px">Historial</h4>${(r.history || []).map(h => `<div class="tl">${U.dt(h.at)} · <b>${U.esc(h.by)}</b> → ${U.esc((Requests.STATUS[h.status] || [h.status])[0])}${h.note ? ' · ' + U.esc(h.note) : ''}</div>`).join('')}`, { wide: true });
    m.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const f = UI.formData(m.querySelector('#rmf')); const a = b.dataset.a;
      try {
        if (a === 'despachar') { const sent = {}; r.lines.forEach(l => sent[l.itemId] = Number(f['s_' + l.itemId] || 0)); if (!Object.values(sent).some(x => x > 0)) return UI.toast('Indique cantidades a enviar', 'warn'); Requests.dispatch(r, sent, f.note); }
        else if (a === 'recibir') Requests.receive(r, f.note);
        else { if (a === 'rechazado' && !f.note) return UI.toast('Indique el motivo del rechazo en el comentario', 'warn'); Requests.setStatus(r, a, f.note); }
        UI.closeModal(); UI.toast('Pedido actualizado'); (onDone || BRD.rerender)();
      } catch (err) { UI.toast(err.message, 'bad', 5000); }
    });
  }

  function issueForm(bancaId, onDone) {
    const bs = Auth.bancas();
    const m = UI.modal('Reportar un error o problema', `<form id="isf"><div class="grid g2">
      <div class="field"><label>Banca</label><select name="bancaId">${Auth.allBancas() ? '<option value="">Oficina / general</option>' : ''}${bs.map(b => `<option value="${b.id}" ${bancaId === b.id ? 'selected' : ''}>${U.esc(b.code + ' ' + b.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Tipo de problema</label><select name="category">${Object.entries(Issues.CATS).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></div>
      <div class="field"><label>Prioridad</label><select name="priority">${Object.entries(Issues.PRI).map(([k, [n]]) => `<option value="${k}" ${k === 'media' ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="field"><label>Ticket relacionado (opcional)</label><input name="ticketCode" placeholder="B001-XXXXXXXX"></div></div>
      <div class="field"><label>Título</label><input name="title" required maxlength="90" placeholder="Ej: La impresora no imprime"></div>
      <div class="field"><label>Describa qué pasó</label><textarea name="description" rows="4" required placeholder="Qué estaba haciendo, qué mensaje salió, desde cuándo…"></textarea></div>
      <div class="field"><label>Foto o captura (opcional)</label><input type="file" name="photo" accept="image/*"></div>
      <button class="btn pri">Enviar reporte</button></form>`, { wide: true });
    m.querySelector('#isf').onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(e.target); const f = UI.formData(e.target);
      let photo = ''; const file = fd.get('photo'); if (file && file.size) { try { photo = await Issues.compress(file); } catch (err) { return UI.toast('No se pudo leer la imagen', 'bad'); } }
      const r = Issues.create({ bancaId: f.bancaId, category: f.category, priority: f.priority, title: f.title.trim(), description: f.description.trim(), ticketCode: f.ticketCode.trim().toUpperCase(), photo, page: location.pathname.split('/').pop() });
      UI.closeModal(); UI.toast('Reporte ' + r.code + ' enviado'); (onDone || BRD.rerender)();
    };
  }
  function issueModal(r, onDone) {
    const canM = Auth.can('issues.manage') && (r.bancaId ? Auth.sees(r.bancaId) : Auth.allBancas());
    const managers = DB.all('users').filter(u => u.active && Auth.can('issues.manage', u) && (!r.bancaId || Auth.allBancas(u) || Auth.userBancas(u).includes(r.bancaId)));
    const m = UI.modal(U.esc(r.code + ' · ' + r.title), `<p>${Issues.badge(Issues.ST, r.status)} ${Issues.badge(Issues.PRI, r.priority)} <span class="pill">${Issues.CATS[r.category] || r.category}</span></p>
      <p class="small">${U.esc(r.bancaId ? Inv.locName(r.bancaId) : 'Oficina')} · ${U.esc(r.byName)} · ${U.dt(r.at)}${r.ticketCode ? ' · Ticket ' + U.esc(r.ticketCode) : ''}${r.assignedTo ? ' · Asignado a <b>' + U.esc(r.assignedTo) + '</b>' : ''}</p>
      <div class="card" style="white-space:pre-wrap">${U.esc(r.description)}</div>
      ${r.photo ? `<img class="photo" style="margin-top:8px" src="${r.photo.startsWith('data:image/') ? r.photo : ''}" alt="Foto adjunta">` : ''}
      <div class="thread">${(r.comments || []).map(c => `<div class="c"><div class="tl">${U.dt(c.at)} · <b>${U.esc(c.byName)}</b>${c.status ? ' → ' + Issues.badge(Issues.ST, c.status) : ''}</div>${c.text ? `<div>${U.esc(c.text)}</div>` : ''}</div>`).join('') || '<p class="small">Sin respuestas todavía.</p>'}</div>
      <form id="icf"><div class="field"><label>Respuesta / comentario</label><textarea name="text" rows="2"></textarea></div>
      <div class="row">${canM ? `<select name="status" style="width:auto">${Object.entries(Issues.ST).map(([k, [n]]) => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <select name="assigned" style="width:auto"><option value="">Sin asignar</option>${managers.map(u => `<option value="${U.esc(u.username)}" ${r.assignedTo === u.username ? 'selected' : ''}>${U.esc(u.name)}</option>`).join('')}</select>` : ''}
        <button class="btn pri">Enviar</button>${!canM && r.status === 'resuelto' ? '<button type="button" class="btn" id="reop">Sigue fallando (reabrir)</button>' : ''}</div></form>`, { wide: true });
    m.querySelector('#icf').onsubmit = e => {
      e.preventDefault(); const f = UI.formData(e.target);
      let cur = DB.get('issues', r.id);
      if (canM && f.assigned !== (cur.assignedTo || '')) { cur = Object.assign({}, cur, { assignedTo: f.assigned }); DB.put('issues', cur); }
      const st = canM && f.status !== cur.status ? f.status : (!canM && cur.status === 'cerrado' ? null : null);
      if (!f.text && !st) { UI.closeModal(); (onDone || BRD.rerender)(); return; }
      Issues.comment(cur, f.text, st || (cur.status === 'abierto' && canM && f.text ? 'en_proceso' : null));
      UI.closeModal(); UI.toast('Actualizado'); (onDone || BRD.rerender)();
    };
    const ro = m.querySelector('#reop'); if (ro) ro.onclick = () => { Issues.comment(DB.get('issues', r.id), 'El problema continúa', 'abierto'); UI.closeModal(); (onDone || BRD.rerender)(); };
  }
  Object.assign(BRD, { requestForm, requestModal, issueForm, issueModal });
})();
