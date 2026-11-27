/* =========================================================
   AuraSport — informes: PDF real (sin librerías) y versión
   para impresora normal (carta / A4). Los recibos van por la
   impresora térmica (core.printHTML 'termica').
   ========================================================= */
(function () {
  const { U, DB, UI } = BRD;

  /* anchos Helvetica (AFM, 1/1000 em) para ASCII 32..126 */
  const HW = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
  const HBW = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
  const BASE = { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ñ': 'n', 'ü': 'u', 'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', 'Ñ': 'N', 'Ü': 'U' };
  const WIN = { '€': 128, '‚': 130, '„': 132, '…': 133, '•': 149, '–': 150, '—': 151, '‘': 145, '’': 146, '“': 147, '”': 148 };
  function enc(str) { // texto -> bytes WinAnsi
    const out = [];
    for (const ch of String(str)) { const c = ch.codePointAt(0); if (WIN[ch]) out.push(WIN[ch]); else if (c >= 32 && c < 256) out.push(c); else if (c === 9) out.push(32); else if (c > 255 && !/\p{Extended_Pictographic}/u.test(ch)) out.push(63); }
    return out;
  }
  function width(str, size, bold) {
    const t = bold ? HBW : HW; let w = 0;
    for (const ch of String(str)) { const b = BASE[ch] || ch; const c = b.charCodeAt(0); w += (c >= 32 && c <= 126) ? t[c - 32] : 556; }
    return w * size / 1000;
  }
  function esc(bytes) { let s = ''; for (const b of bytes) { if (b === 40 || b === 41 || b === 92) s += '\\' + String.fromCharCode(b); else s += String.fromCharCode(b); } return s; }
  const latin1 = s => { const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255; return a; };

  const SIZES = { letter: [612, 792], a4: [595.28, 841.89] };

  class PDF {
    constructor(size = 'letter') { [this.W, this.H] = SIZES[size] || SIZES.letter; this.pages = []; this.images = []; this.addPage(); }
    addPage() { this.cur = []; this.pages.push(this.cur); }
    op(s) { this.cur.push(s); }
    color(hex, stroke) { const n = parseInt(String(hex || '#000').replace('#', ''), 16); const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; this.op(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} ${stroke ? 'RG' : 'rg'}`); }
    text(x, y, str, { size = 10, bold = false, align = 'left', color = '#111111', maxW } = {}) {
      str = String(str == null ? '' : str);
      if (maxW) while (str.length > 1 && width(str, size, bold) > maxW) str = str.slice(0, -2) + '…';
      let tx = x; const w = width(str, size, bold);
      if (align === 'right') tx = x - w; else if (align === 'center') tx = x - w / 2;
      this.color(color); this.op(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${tx.toFixed(2)} ${(this.H - y).toFixed(2)} Td (${esc(enc(str))}) Tj ET`);
      return w;
    }
    rect(x, y, w, h, fill) { this.color(fill); this.op(`${x.toFixed(2)} ${(this.H - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); }
    line(x1, y1, x2, y2, color = '#cccccc', wd = 0.6) { this.color(color, true); this.op(`${wd} w ${x1.toFixed(2)} ${(this.H - y1).toFixed(2)} m ${x2.toFixed(2)} ${(this.H - y2).toFixed(2)} l S`); }
    image(img, x, y, w, h) { const n = this.images.indexOf(img); const i = n >= 0 ? n : this.images.push(img) - 1; this.op(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${(this.H - y - h).toFixed(2)} cm /Im${i} Do Q`); }
    bytes() {
      const parts = []; let len = 0; const offs = [];
      const add = p => { const b = typeof p === 'string' ? latin1(p) : p; parts.push(b); len += b.length; };
      const objs = []; // [ (contenido string|Uint8Array[]) ]
      const obj = c => { objs.push(c); return objs.length; };
      const F1 = obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      const F2 = obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      const imgIds = this.images.map(im => obj([`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>\nstream\n`, im.data, '\nendstream']));
      const xo = imgIds.map((id, i) => `/Im${i} ${id} 0 R`).join(' ');
      const pagesId = objs.length + 1 + this.pages.length * 2 + 0; // se calcula abajo
      const pageIds = [];
      const pagesObjIndex = obj(null); // reservado
      this.pages.forEach(ops => {
        const content = ops.join('\n');
        const cid = obj(`<< /Length ${latin1(content).length} >>\nstream\n${content}\nendstream`);
        pageIds.push(obj(`<< /Type /Page /Parent ${pagesObjIndex} 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 ${F1} 0 R /F2 ${F2} 0 R >> /XObject << ${xo} >> >> /Contents ${cid} 0 R >>`));
      });
      objs[pagesObjIndex - 1] = `<< /Type /Pages /Kids [${pageIds.map(i => i + ' 0 R').join(' ')}] /Count ${pageIds.length} >>`;
      const cat = obj(`<< /Type /Catalog /Pages ${pagesObjIndex} 0 R >>`);
      void pagesId;
      add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
      objs.forEach((c, i) => { offs.push(len); add(`${i + 1} 0 obj\n`); (Array.isArray(c) ? c : [c]).forEach(add); add('\nendobj\n'); });
      const xref = len;
      add(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join(''));
      add(`trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R >>\nstartxref\n${xref}\n%%EOF`);
      const out = new Uint8Array(len); let p = 0; parts.forEach(b => { out.set(b, p); p += b.length; }); return out;
    }
  }

  /* logo -> JPEG para el PDF (fondo blanco) */
  async function logoJPEG(src) {
    if (!src) return null;
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
      const c = document.createElement('canvas'); c.width = img.naturalWidth || 200; c.height = img.naturalHeight || 200;
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0);
      const b64 = c.toDataURL('image/jpeg', 0.9).split(',')[1]; const bin = atob(b64); const data = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
      return { data, w: c.width, h: c.height };
    } catch (e) { return null; }
  }

  /* -------- informe estándar --------
     spec = { title, subtitle, ctx:{bancaId|consorcioId}, meta:[[k,v]], kpis:[[label,value]],
              sections:[{ title, columns:[{h, w, align}], rows:[[...]], foot:[...] }], notes:[], signatures:[] } */
  function brandOf(spec) { const b = BRD.Brand ? Object.assign({}, BRD.Brand.for(spec.ctx || BRD.Brand.ctx())) : { name: 'AuraSport', rnc: '', phone: '', address: '', logo: '' }; if (!b.logo && !b.consorcioId) b.logo = 'assets/logo.png'; return b; }

  async function toPDF(spec) {
    const dev = BRD.Brand ? BRD.Brand.Device.get() : {};
    const pdf = new PDF(dev.reportPaper === 'a4' ? 'a4' : 'letter');
    const M = 40, W = pdf.W - M * 2; let y = M;
    const br = brandOf(spec); const logo = await logoJPEG(br.logo);
    const accent = '#1f6feb';
    const header = () => {
      let x = M;
      if (logo) { const h = 42, w = Math.min(120, h * logo.w / logo.h); pdf.image(logo, M, y, w, h); x = M + w + 12; }
      pdf.text(x, y + 16, br.name, { size: 15, bold: true });
      pdf.text(x, y + 31, [br.rnc ? 'RNC ' + br.rnc : '', br.phone ? 'Tel. ' + br.phone : '', br.address].filter(Boolean).join(' · '), { size: 8.5, color: '#555555', maxW: W - (x - M) - 150 });
      pdf.text(M + W, y + 14, U.dt(Date.now()), { size: 8.5, align: 'right', color: '#555555' });
      pdf.text(M + W, y + 27, 'Generado por AuraSport', { size: 7.5, align: 'right', color: '#888888' });
      y += 52; pdf.rect(M, y, W, 2, accent); y += 18;
    };
    const ensure = h => { if (y + h > pdf.H - M - 20) { footer(); pdf.addPage(); y = M; header(); return true; } return false; };
    let pageNo = 0; const footer = () => { pageNo++; pdf.text(M + W, pdf.H - M + 6, 'Página ' + pageNo, { size: 8, align: 'right', color: '#888888' }); };
    header();
    pdf.text(M, y, spec.title || 'Informe', { size: 17, bold: true }); y += 16;
    if (spec.subtitle) { pdf.text(M, y, spec.subtitle, { size: 10, color: '#444444' }); y += 14; }
    if (spec.meta && spec.meta.length) { y += 4; spec.meta.forEach(([k, v]) => { pdf.text(M, y, k + ':', { size: 9, bold: true }); pdf.text(M + 110, y, v, { size: 9, maxW: W - 110 }); y += 13; }); }
    if (spec.kpis && spec.kpis.length) {
      y += 8; const n = spec.kpis.length, gap = 8, bw = (W - gap * (n - 1)) / n;
      ensure(48);
      spec.kpis.forEach(([l, v], i) => { const x = M + i * (bw + gap); pdf.rect(x, y, bw, 44, '#f1f4f9'); pdf.text(x + 8, y + 15, l, { size: 7.5, color: '#555555', maxW: bw - 16 }); pdf.text(x + 8, y + 34, v, { size: 12, bold: true, maxW: bw - 16 }); });
      y += 58;
    }
    (spec.sections || []).forEach(sec => {
      ensure(50);
      if (sec.title) { pdf.text(M, y, sec.title, { size: 12, bold: true }); y += 10; }
      const cols = sec.columns; const tw = cols.reduce((a, c) => a + (c.w || 1), 0);
      const xs = []; let acc = M; cols.forEach(c => { xs.push(acc); acc += W * (c.w || 1) / tw; });
      const cw = i => W * (cols[i].w || 1) / tw;
      const head = () => { pdf.rect(M, y, W, 18, '#e8edf5'); cols.forEach((c, i) => pdf.text(c.align === 'right' ? xs[i] + cw(i) - 5 : xs[i] + 5, y + 12.5, c.h, { size: 8.5, bold: true, align: c.align === 'right' ? 'right' : 'left', maxW: cw(i) - 8 })); y += 20; };
      head();
      if (!sec.rows.length) { pdf.text(M + 5, y + 10, 'Sin datos', { size: 9, color: '#777777' }); y += 18; }
      sec.rows.forEach((r, ri) => {
        if (ensure(16)) head();
        if (ri % 2) pdf.rect(M, y - 1, W, 15, '#fafbfd');
        r.forEach((v, i) => pdf.text(cols[i].align === 'right' ? xs[i] + cw(i) - 5 : xs[i] + 5, y + 10, v, { size: 8.5, align: cols[i].align === 'right' ? 'right' : 'left', maxW: cw(i) - 8 }));
        y += 15;
      });
      if (sec.foot) { ensure(18); pdf.line(M, y, M + W, y, '#999999'); y += 3; sec.foot.forEach((v, i) => pdf.text(cols[i].align === 'right' ? xs[i] + cw(i) - 5 : xs[i] + 5, y + 10, v, { size: 9, bold: true, align: cols[i].align === 'right' ? 'right' : 'left', maxW: cw(i) - 8 })); y += 16; }
      y += 14;
    });
    (spec.notes || []).forEach(n => { ensure(14); pdf.text(M, y, n, { size: 8.5, color: '#555555', maxW: W }); y += 12; });
    if (spec.signatures && spec.signatures.length) {
      ensure(70); y += 40; const n = spec.signatures.length, sw = (W - 30 * (n - 1)) / n;
      spec.signatures.forEach((s, i) => { const x = M + i * (sw + 30); pdf.line(x, y, x + sw, y, '#333333'); pdf.text(x + sw / 2, y + 12, s, { size: 9, align: 'center' }); });
      y += 20;
    }
    footer();
    return pdf.bytes();
  }

  function toHTML(spec) {
    const br = brandOf(spec);
    const k = spec.kpis && spec.kpis.length ? `<div class="rp-kpis">${spec.kpis.map(([l, v]) => `<div><small>${U.esc(l)}</small><b>${U.esc(v)}</b></div>`).join('')}</div>` : '';
    return `<div class="report">
      <div class="rp-head">${br.logo ? `<img src="${U.esc(br.logo)}" alt="">` : ''}<div><h1>${U.esc(br.name)}</h1><div class="rp-sub">${U.esc([br.rnc ? 'RNC ' + br.rnc : '', br.phone ? 'Tel. ' + br.phone : '', br.address].filter(Boolean).join(' · '))}</div></div><div class="rp-date">${U.esc(U.dt(Date.now()))}<br><small>Generado por AuraSport</small></div></div>
      <h2>${U.esc(spec.title || 'Informe')}</h2>${spec.subtitle ? `<p class="rp-sub">${U.esc(spec.subtitle)}</p>` : ''}
      ${(spec.meta || []).length ? `<table class="rp-meta">${spec.meta.map(([a, b]) => `<tr><th>${U.esc(a)}</th><td>${U.esc(b)}</td></tr>`).join('')}</table>` : ''}
      ${k}
      ${(spec.sections || []).map(s => `${s.title ? `<h3>${U.esc(s.title)}</h3>` : ''}<table class="rp-t"><thead><tr>${s.columns.map(c => `<th class="${c.align === 'right' ? 'r' : ''}">${U.esc(c.h)}</th>`).join('')}</tr></thead><tbody>${s.rows.map(r => `<tr>${r.map((v, i) => `<td class="${s.columns[i].align === 'right' ? 'r' : ''}">${U.esc(v)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${s.columns.length}">Sin datos</td></tr>`}</tbody>${s.foot ? `<tfoot><tr>${s.foot.map((v, i) => `<td class="${s.columns[i].align === 'right' ? 'r' : ''}">${U.esc(v)}</td>`).join('')}</tr></tfoot>` : ''}</table>`).join('')}
      ${(spec.notes || []).map(n => `<p class="rp-note">${U.esc(n)}</p>`).join('')}
      ${(spec.signatures || []).length ? `<div class="rp-sign">${spec.signatures.map(s => `<div><span></span>${U.esc(s)}</div>`).join('')}</div>` : ''}
    </div>`;
  }

  /* cierre de caja: hoja carta/PDF y recibo térmico */
  function shiftSpec(s) {
    const r = s.resumen || BRD.Shifts.summary(s); const b = DB.get('bancas', s.bancaId) || {}; const closed = s.status === 'cerrado';
    const exp = DB.all('expenses').filter(e => e.shiftId === s.id);
    const paid = DB.all('tickets').filter(t => t.paidShift === s.id);
    return {
      title: closed ? 'Cierre de caja' : 'Cuadre parcial de caja (turno abierto)', subtitle: `${b.code || ''} ${b.name || ''}`, ctx: { bancaId: s.bancaId },
      meta: [['Cajero', s.userName || ''], ['Apertura', U.dt(s.openedAt)], ['Cierre', closed ? U.dt(s.closedAt) : '—'], ['Nota', s.nota || '']],
      kpis: [['Ventas', U.money(r.ventas)], ['Premios pagados', U.money(r.pagos)], ['Esperado en caja', U.money(r.esperado)], ['Diferencia', closed ? U.money(s.diferencia) : '—']],
      sections: [
        { title: 'Resumen', columns: [{ h: 'Concepto', w: 3 }, { h: 'Monto', align: 'right' }], rows: [
          ['Fondo inicial', U.money(s.fondo)], ['Ventas lotería', U.money(r.ventasLot)], ['Ventas deportes', U.money(r.ventasDep)], ['Total ventas (' + r.tickets + ' tickets)', U.money(r.ventas)],
          ['Anulados (' + r.anulados + ')', U.money(r.montoAnulado)], ['Premios pagados (' + r.pagados + ')', '- ' + U.money(r.pagos)], ['Gastos', '- ' + U.money(r.gastos)],
          ['Esperado en caja', U.money(r.esperado)], ['Declarado', closed ? U.money(s.declarado) : '—']], foot: ['DIFERENCIA', closed ? U.money(s.diferencia) : '—'] },
        { title: 'Gastos', columns: [{ h: 'Concepto', w: 3 }, { h: 'Hora' }, { h: 'Monto', align: 'right' }], rows: exp.map(e => [e.concept, U.time(e.at), U.money(e.amount)]) },
        { title: 'Premios pagados', columns: [{ h: 'Ticket', w: 2 }, { h: 'Pagado' }, { h: 'Premio', align: 'right' }], rows: paid.map(t => [t.code, U.dt(t.paidAt), U.money(t.prize)]) },
      ],
      signatures: ['Firma del cajero', 'Firma del supervisor'],
    };
  }
  function shiftThermal(s) {
    const r = s.resumen || BRD.Shifts.summary(s); const b = DB.get('bancas', s.bancaId) || {}; const br = brandOf({ ctx: { bancaId: s.bancaId } });
    const paper = (BRD.Brand && BRD.Brand.Device.get().receiptPaper) || (br.invoice && br.invoice.paper) || '80';
    const row = (a, v) => `<div class="tk-row"><span>${a}</span><span>${v}</span></div>`; const closed = s.status === 'cerrado';
    return `<div class="ticket tk-${paper}">${br.logo && br.consorcioId ? `<div class="tk-c"><img class="tk-logo" src="${U.esc(br.logo)}" alt=""></div>` : ''}<div class="tk-c tk-h">${U.esc(br.name)}</div><div class="tk-c">${closed ? 'CIERRE DE CAJA' : 'CUADRE PARCIAL'}</div><div class="tk-c">${U.esc((b.code || '') + ' ' + (b.name || ''))}</div><div class="tk-hr"></div>
      ${row('Cajero', U.esc(s.userName))}${row('Apertura', U.dt(s.openedAt))}${row('Cierre', closed ? U.dt(s.closedAt) : '—')}<div class="tk-hr"></div>
      ${row('Fondo', U.money(s.fondo))}${row('Ventas lotería', U.money(r.ventasLot))}${row('Ventas deportes', U.money(r.ventasDep))}${row('Total ventas', U.money(r.ventas))}${row('Tickets', r.tickets)}${row('Anulados', r.anulados + ' / ' + U.money(r.montoAnulado))}${row('Premios pagados', U.money(r.pagos))}${row('Gastos', U.money(r.gastos))}<div class="tk-hr"></div>
      ${row('<b>ESPERADO</b>', '<b>' + U.money(r.esperado) + '</b>')}${closed ? row('Declarado', U.money(s.declarado)) + row('<b>DIFERENCIA</b>', '<b>' + U.money(s.diferencia) + '</b>') : ''}
      <br><br><div class="tk-c">______________________<br>Firma cajero</div><div class="tk-c small">${U.dt(Date.now())}</div></div>`;
  }

  const Docs = {
    PDF, toPDF, toHTML, shiftSpec, shiftThermal,
    async pdf(spec, filename) {
      try {
        const bytes = await toPDF(spec);
        const blob = new Blob([bytes], { type: 'application/pdf' }); const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = (filename || spec.title || 'informe').replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, '').replace(/\s+/g, '_') + '.pdf';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
        if (UI && UI.toast) UI.toast('PDF generado');
        return bytes;
      } catch (e) { console.error(e); UI.toast('No se pudo generar el PDF: ' + e.message, 'bad'); }
    },
    print(spec) { BRD.printHTML(toHTML(spec), 'carta'); },
    /* botones estándar: impresora normal + PDF */
    buttons(id) { return `<button class="btn sm" data-doc-print="${id}">🖨️ Imprimir (carta)</button><button class="btn sm" data-doc-pdf="${id}">📄 PDF</button>`; },
    bind(root, id, specFn, filename) {
      const p = root.querySelector(`[data-doc-print="${id}"]`), d = root.querySelector(`[data-doc-pdf="${id}"]`);
      if (p) p.onclick = () => Docs.print(specFn()); if (d) d.onclick = () => Docs.pdf(specFn(), typeof filename === 'function' ? filename() : filename);
    },
  };
  BRD.Docs = Docs;
})();
