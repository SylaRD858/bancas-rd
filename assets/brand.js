/* =========================================================
   AuraSport — marca: temas, logos, plantilla de factura,
   ajustes de impresoras por equipo.
   (se carga después de core.js; también lo usa el servidor no)
   ========================================================= */
(function () {
  const { U, DB, Auth } = BRD;
  const APP_NAME = 'AuraSport';

  /* ---------- paquete de temas ---------- */
  // bg, bg2, card, card2, line, tx, mut, ac, ac2, acTx, light
  const THEMES = {
    aurasport: { name: 'AuraSport', v: ['#0a1330', '#0f1a3e', '#13204a', '#1a2a5c', '#2a3d78', '#eef2ff', '#93a1c9', '#f7b500', '#e11d2e', '#1a1200'] },
    verde: { name: 'Verde clásico', v: ['#0b1220', '#111a2e', '#151f36', '#1b2742', '#26365a', '#e8eefc', '#8c9bbd', '#16c784', '#0ea56c', '#04140d'] },
    medianoche: { name: 'Medianoche', v: ['#0d0b1e', '#151231', '#1b1840', '#24204f', '#342e6b', '#ece9ff', '#9a93c9', '#8b5cf6', '#7c3aed', '#ffffff'] },
    carbon_oro: { name: 'Carbón y oro', v: ['#0c0c0c', '#151515', '#1c1c1c', '#262626', '#383838', '#f4efe2', '#a69f8c', '#e7b53c', '#c99a22', '#1a1200'] },
    esmeralda: { name: 'Esmeralda', v: ['#071a14', '#0b241c', '#0f2e24', '#143a2e', '#1f5242', '#e6f7f0', '#86b8a5', '#34d399', '#10b981', '#022c1d'] },
    rubi: { name: 'Rubí', v: ['#1a0a0e', '#241015', '#2e141b', '#3a1a23', '#552633', '#fbe9ee', '#c08a98', '#f43f5e', '#e11d48', '#ffffff'] },
    oceano: { name: 'Océano', v: ['#06182a', '#0a2238', '#0d2c48', '#123758', '#1d4c78', '#e5f2ff', '#89aecf', '#38bdf8', '#0ea5e9', '#03263b'] },
    neon: { name: 'Neón', v: ['#0a0612', '#120b1f', '#170f29', '#201537', '#33204f', '#f3eaff', '#a58fc4', '#f72585', '#4cc9f0', '#ffffff'] },
    claro: { name: 'Blanco profesional', light: true, v: ['#f3f5f9', '#ffffff', '#ffffff', '#eef2f7', '#d9e0ea', '#1b2433', '#5d6b82', '#2563eb', '#1d4ed8', '#ffffff'] },
    arena: { name: 'Arena', light: true, v: ['#f6f1e7', '#fffaf0', '#fffdf8', '#f3ead9', '#e2d5bc', '#2d2416', '#7c6c52', '#c2410c', '#9a3412', '#ffffff'] },
    dominicana: { name: 'Quisqueya', light: true, v: ['#f2f5fb', '#ffffff', '#ffffff', '#eaf0fa', '#cfd9ec', '#0f1f3d', '#5a6a8a', '#ce1126', '#002d62', '#ffffff'] },
  };
  const DEVICE_KEY = 'aurasport_equipo';

  /* ---------- ajustes del equipo (cada PC / caja) ---------- */
  const Device = {
    get() { try { return Object.assign({ theme: '', receiptPaper: '', reportPaper: 'letter', autoPrint: true }, JSON.parse(localStorage.getItem(DEVICE_KEY) || '{}')); } catch (e) { return { theme: '', receiptPaper: '', reportPaper: 'letter', autoPrint: true }; } },
    set(ch) { const d = Object.assign(Device.get(), ch); try { localStorage.setItem(DEVICE_KEY, JSON.stringify(d)); } catch (e) { } return d; },
  };

  /* ---------- plantilla de factura / recibo ---------- */
  const DEFAULT_INVOICE = {
    paper: '80', fontSize: 'normal', showLogo: true, showName: true, showRnc: true, showAddress: true, showPhone: true,
    showSeller: true, showPin: true, showBarcode: true, showDate: true, showSerial: true,
    title: '', header: '¡Gracias por su jugada!', footer: 'Revise su ticket antes de retirarse. El premio se paga presentando el ticket original.', legal: '',
  };
  const INVOICE_FIELDS = [
    ['showLogo', 'Mostrar logo'], ['showName', 'Nombre del consorcio'], ['showRnc', 'RNC'], ['showAddress', 'Dirección'], ['showPhone', 'Teléfono'],
    ['showDate', 'Fecha y hora'], ['showSerial', 'Número de ticket'], ['showSeller', 'Vendedor'], ['showPin', 'PIN de pago'], ['showBarcode', 'Código de barras'],
  ];

  const Brand = {
    APP_NAME, THEMES, DEFAULT_INVOICE, INVOICE_FIELDS, Device,
    consorcio(id) { return id ? DB.get('consorcios', id) : null; },
    consorcioOfBanca(bancaId) { const b = DB.get('bancas', bancaId); return b ? (b.consorcioId || '') : ''; },
    /* datos de marca combinados: plataforma < consorcio < banca */
    for({ bancaId, consorcioId } = {}) {
      const b = bancaId ? DB.get('bancas', bancaId) : null;
      const cid = consorcioId || (b && b.consorcioId) || '';
      const c = Brand.consorcio(cid) || {};
      const cfg = DB.cfg() || {};
      const bi = b && b.invoice && b.invoice.custom ? b.invoice : {};
      const invoice = Object.assign({}, DEFAULT_INVOICE, { header: cfg.ticketHeader || DEFAULT_INVOICE.header, footer: cfg.ticketFooter || DEFAULT_INVOICE.footer }, clean(c.invoice), clean(bi));
      return {
        consorcioId: cid, consorcio: c,
        name: c.name || cfg.company || APP_NAME,
        rnc: c.rnc || cfg.rnc || '', phone: (b && b.phone) || c.phone || cfg.phone || '', address: (b && b.address) || c.address || '',
        bancaName: b ? b.name : '', bancaCode: b ? b.code : '',
        logo: (b && b.logo) || c.logo || '',
        theme: (b && b.theme) || c.theme || 'aurasport',
        invoice,
      };
    },
    /* tema efectivo para el usuario/banca actual (el del equipo tiene prioridad) */
    themeFor(ctx) { const d = Device.get(); if (d.theme && THEMES[d.theme]) return d.theme; return Brand.for(ctx).theme; },
    applyTheme(id) {
      const t = THEMES[id] || THEMES.aurasport; const r = document.documentElement.style;
      ['--bg', '--bg2', '--card', '--card2', '--line', '--tx', '--mut', '--ac', '--ac2', '--acTx'].forEach((k, i) => r.setProperty(k, t.v[i]));
      document.documentElement.dataset.light = t.light ? '1' : '';
      const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t.v[0];
    },
    /* contexto del usuario conectado: banca activa o su consorcio */
    ctx() { const u = Auth.user(); if (!u) return {}; return { bancaId: u.bancaId || '', consorcioId: u.consorcioId || '' }; },
    refresh() { Brand.applyTheme(Brand.themeFor(Brand.ctx())); },
    logoHTML(ctx, size = 30) {
      const br = Brand.for(ctx || Brand.ctx());
      if (!br.logo && !br.consorcioId) return `<img src="assets/logo.webp" alt="AuraSport" style="height:${size + 8}px;width:auto;vertical-align:middle">`;
      if (br.logo) return `<img class="clogo" src="${U.esc(br.logo)}" alt="" style="height:${size}px;max-width:${size * 3}px;object-fit:contain;border-radius:6px;vertical-align:middle">`;
      return `<i>${U.esc((br.name || APP_NAME).trim()[0] || 'A')}</i>`;
    },
    /* selector de tema con muestras de color */
    themePicker(current, name) {
      return `<div class="themes">${Object.entries(THEMES).map(([id, t]) => `<label class="theme-card ${current === id ? 'on' : ''}"><input type="radio" name="${name}" value="${id}" ${current === id ? 'checked' : ''}>
        <span class="sw" style="background:${t.v[0]}"><span style="background:${t.v[2]};border-color:${t.v[4]}"><b style="background:${t.v[7]}"></b><b style="background:${t.v[8]}"></b><i style="background:${t.v[5]}"></i></span></span><small>${U.esc(t.name)}${t.light ? ' · claro' : ''}</small></label>`).join('')}</div>`;
    },
    /* carga de logo: reduce a máx. 400px y PNG/JPEG liviano */
    async readLogo(file) {
      if (!file || !/^image\//.test(file.type)) throw new Error('Seleccione una imagen (PNG, JPG o SVG)');
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('No se pudo leer la imagen')); i.src = URL.createObjectURL(file); });
      const k = Math.min(1, 400 / Math.max(img.width || 400, img.height || 400)); const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round((img.width || 400) * k)); c.height = Math.max(1, Math.round((img.height || 400) * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      let url = c.toDataURL('image/png'); if (url.length > 300000) url = c.toDataURL('image/jpeg', 0.85);
      if (url.length > 380000) throw new Error('El logo es muy pesado; use una imagen más pequeña');
      return url;
    },
    /* ajustes rápidos del equipo (app de venta) */
    deviceModal() {
      const d = Device.get(); const cur = Brand.for(Brand.ctx()).theme;
      const m = BRD.UI.modal('Este equipo: tema e impresoras', `<div class="grid g2"><div class="field"><label>🧾 Impresora térmica (recibos)</label><select id="rp"><option value="">Según la plantilla</option><option value="80" ${d.receiptPaper === '80' ? 'selected' : ''}>80 mm</option><option value="58" ${d.receiptPaper === '58' ? 'selected' : ''}>58 mm</option></select></div>
        <div class="field"><label>🖨️ Impresora normal (cierres, informes)</label><select id="pp"><option value="letter" ${d.reportPaper !== 'a4' ? 'selected' : ''}>Carta</option><option value="a4" ${d.reportPaper === 'a4' ? 'selected' : ''}>A4</option></select></div></div>
        <label class="chk"><input type="checkbox" id="ap" ${d.autoPrint !== false ? 'checked' : ''}> Imprimir el ticket automáticamente al vender</label>
        <h4>Tema</h4><label class="chk"><input type="checkbox" id="thc" ${d.theme ? '' : 'checked'}> Usar el tema de la banca</label><div id="thw" ${d.theme ? '' : 'hidden'}>${Brand.themePicker(d.theme || cur, 'dtheme')}</div>
        <div class="row" style="margin-top:10px"><button class="btn" id="tt">Probar recibo</button><button class="btn pri" data-close>Listo</button></div>`, { wide: true });
      const save = ch => { Device.set(ch); Brand.refresh(); };
      m.querySelector('#rp').onchange = e => save({ receiptPaper: e.target.value }); m.querySelector('#pp').onchange = e => save({ reportPaper: e.target.value });
      m.querySelector('#ap').onchange = e => save({ autoPrint: e.target.checked });
      m.querySelector('#thc').onchange = e => { m.querySelector('#thw').hidden = e.target.checked; if (e.target.checked) save({ theme: '' }); };
      m.querySelectorAll('input[name=dtheme]').forEach(r => r.onchange = () => save({ theme: r.value }));
      m.querySelector('#tt').onclick = () => { const c = Brand.ctx(); BRD.printHTML(BRD.ticketHTML(Brand.sampleTicket(c.bancaId), { ctx: c }), 'termica'); };
    },
    /* editor de plantilla (devuelve HTML; usar bindInvoiceEditor) */
    invoiceEditor(inv, { banca } = {}) {
      return `<div class="grid g2 inv-ed"><div>
        ${banca ? `<label class="chk"><input type="checkbox" name="custom" ${inv.custom ? 'checked' : ''}> Usar plantilla propia en esta banca (si no, usa la del consorcio)</label>` : ''}
        <div class="grid g2"><div class="field"><label>Papel del recibo</label><select name="paper"><option value="80" ${inv.paper === '80' ? 'selected' : ''}>Térmica 80 mm</option><option value="58" ${inv.paper === '58' ? 'selected' : ''}>Térmica 58 mm</option></select></div>
        <div class="field"><label>Tamaño de letra</label><select name="fontSize">${[['pequena', 'Pequeña'], ['normal', 'Normal'], ['grande', 'Grande']].map(([k, n]) => `<option value="${k}" ${inv.fontSize === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
        <div class="field"><label>Título (opcional, ej. "TICKET DE APUESTA")</label><input name="title" value="${U.esc(inv.title || '')}"></div>
        <div class="field"><label>Mensaje superior</label><textarea name="header" rows="2">${U.esc(inv.header || '')}</textarea></div>
        <div class="field"><label>Pie del recibo</label><textarea name="footer" rows="3">${U.esc(inv.footer || '')}</textarea></div>
        <div class="field"><label>Texto legal (licencia, aviso de mayores de edad, etc.)</label><textarea name="legal" rows="2">${U.esc(inv.legal || '')}</textarea></div>
        <div class="chips">${INVOICE_FIELDS.map(([k, n]) => `<label class="chipc"><input type="checkbox" name="${k}" ${inv[k] !== false ? 'checked' : ''}> ${n}</label>`).join('')}</div>
      </div><div><label>Vista previa</label><div class="inv-prev" style="background:#e9edf3;padding:10px;border-radius:10px;max-height:520px;overflow:auto"></div></div></div>`;
    },
    readInvoice(form) {
      const g = n => form.querySelector(`[name="${n}"]`);
      const o = {};
      ['paper', 'fontSize', 'title', 'header', 'footer', 'legal'].forEach(k => { if (g(k)) o[k] = g(k).value; });
      INVOICE_FIELDS.forEach(([k]) => { if (g(k)) o[k] = g(k).checked; });
      if (g('custom')) o.custom = g('custom').checked;
      return o;
    },
    /* ticket de ejemplo para la vista previa */
    sampleTicket(bancaId) {
      const lot = (DB.all('lotteries')[0] || { id: 'nacional' }).id;
      return { id: 'demo', code: ((DB.get('bancas', bancaId) || {}).code || 'B001') + '-DEMO2345', pin: '1234', serial: 128, type: 'loteria', bancaId, userName: 'Cajero de ejemplo', createdAt: Date.now(), total: 85, status: 'pendiente',
        lines: [{ kind: 'Q', nums: ['25'], lot, amount: 50 }, { kind: 'P', nums: ['25', '47'], lot, amount: 25 }, { kind: 'T', nums: ['25', '47', '81'], lot, amount: 10 }] };
    },
    bindInvoiceEditor(root, bancaId, consorcioId, isBanca) {
      const prev = root.querySelector('.inv-prev');
      const draw = () => {
        const o = Brand.readInvoice(root);
        const base = isBanca && !o.custom ? Brand.for({ consorcioId }).invoice : Object.assign({}, DEFAULT_INVOICE, o);
        prev.innerHTML = BRD.ticketHTML(Brand.sampleTicket(bancaId), { invoice: base, ctx: { bancaId, consorcioId } });
      };
      root.querySelectorAll('input,select,textarea').forEach(e => e.addEventListener('input', draw)); root.querySelectorAll('input[type=checkbox],select').forEach(e => e.addEventListener('change', draw));
      draw();
    },
  };
  function clean(o) { const x = {}; if (!o) return x; for (const k in o) if (o[k] !== undefined && o[k] !== null && k !== 'custom') x[k] = o[k]; return x; }

  BRD.Brand = Brand;
})();
