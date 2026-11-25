/*
 * Riepilogo settimanale degli orari, come i fogli Excel di riepilogo dei reparti:
 * una tabella per Manager, Hospitality, Crew e Doppi; righe = persone, colonne = lunedì…domenica,
 * nelle caselle l'orario ("7:30 14:30") oppure RIPOSO, FERIE, ASSENTE, MALATTIA…
 * Anteprima nell'app, stampa (anche "Salva come PDF") ed export in Excel (.xlsx, senza librerie esterne).
 * Marchio, nome del locale e società vengono dai dati del manager (Regole), non dal codice.
 */
(function () {
  'use strict';
  const MESI = ['GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO', 'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE'];
  const GIORNI = ['LUNEDÌ', 'MARTEDÌ', 'MERCOLEDÌ', 'GIOVEDÌ', 'VENERDÌ', 'SABATO', 'DOMENICA'];
  const SEZIONI = [['MANAGER', 'ORARI MANAGER'], ['HOSPITALITY', 'ORARI HOSPITALITY'], ['CREW', 'ORARI CREW'], ['DOPPI', 'ORARI DOPPI']];
  const X = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dataOf = (day) => { const d = new Date(day * 864e5); return { g: d.getUTCDate(), m: MESI[d.getUTCMonth()], y: d.getUTCFullYear() }; };
  const orario = (s) => `${T.fmtTime(s.start)} ${T.fmtTime(s.end)}`;
  // dicitura dei giorni senza turno: RIPOSO, FERIE, ASSENTE, MALATTIA, INFORTUNIO, CHIUSO
  const absTxt = (a) => (a.type === 'CHIUSURA' ? 'CHIUSO' : T.absenceInfo(a.type).label.toUpperCase());

  /** Le 4 tabelle della settimana ws: { key, title, rows: [{ name, cells: [{ txt, kind }] × 7 }] }. kind: turno | riposo | assenza | vuoto */
  function tabelle(ws) {
    const ctx = T.makeCtx(state, ws), days = [0, 1, 2, 3, 4, 5, 6].map((k) => ws + k);
    const byName = (a, b) => T.fullName(a).localeCompare(T.fullName(b), 'it');
    const week = ctx.shifts.filter((s) => s.day >= ws && s.day <= ws + 6);
    const absOf = (id, d) => (state.absences || []).find((a) => a.employeeId === id && d >= a.from && d <= a.to);
    const cellEmp = (e, d, doppio) => {
      const s = week.filter((x) => x.employeeId === e.id && x.day === d && !!x.doppio === doppio).sort((a, b) => a.start - b.start);
      if (s.length) return { txt: s.map(orario).join(' · '), kind: 'turno' };
      if (!T.started(e, d)) return { txt: '', kind: 'vuoto' };
      const a = T.absenceOn(ctx, e.id, d);
      if (a) return { txt: absTxt(a), kind: 'assenza' };
      if (T.isRest(e, d)) return { txt: 'RIPOSO', kind: 'riposo' };
      return doppio ? { txt: 'X', kind: 'vuoto' } : { txt: '', kind: 'vuoto' };
    };
    const out = {};
    // manager: giorno senza turno e senza assenza = riposo
    const mgrs = (state.managers || []).filter((m) => m.active !== false).sort(byName);
    out.MANAGER = mgrs.map((m) => ({ name: T.fullName(m), cells: days.map((d) => {
      const s = (state.mgrShifts || []).filter((x) => x.managerId === m.id && x.day === d).sort((a, b) => a.start - b.start);
      if (s.length) return { txt: s.map(orario).join(' · '), kind: 'turno' };
      const a = absOf(m.id, d);
      return a ? { txt: absTxt(a), kind: 'assenza' } : { txt: 'RIPOSO', kind: 'riposo' };
    }) }));
    const emps = ctx.employees.filter((e) => days.some((d) => T.started(e, d))).sort(byName);
    for (const type of ['HOSPITALITY', 'CREW']) out[type] = emps.filter((e) => e.type === type).map((e) => ({ name: T.fullName(e), cells: days.map((d) => cellEmp(e, d, false)) }));
    // doppi: chi li fa di solito (sezione Doppi) o chi ne ha uno questa settimana; "X" = niente doppio quel giorno
    out.DOPPI = emps.filter((e) => (e.doubleDays || 0) > 0 || week.some((s) => s.doppio && s.employeeId === e.id))
      .map((e) => ({ name: T.fullName(e), cells: days.map((d) => cellEmp(e, d, true)) }));
    return SEZIONI.map(([key, title]) => ({ key, title, rows: out[key] }));
  }

  function intestazione(ws) {
    const c = state.config || {}, a = dataOf(ws), b = dataOf(ws + 6);
    return { marchio: (c.marchio || '').trim(), locale: (c.storeName || '').trim(), societa: (c.societa || '').trim(), dal: a, al: b };
  }

  // ---------- anteprima e stampa ----------
  function htmlTabella(t, h) {
    const head = `<div class="rp-head"><div class="rp-brand">${h.marchio ? `<b>${X(h.marchio)}</b>` : ''}${h.locale ? `<span>${X(h.locale)}</span>` : ''}</div>
      <div class="rp-title">${X(t.title)}</div>
      <div class="rp-dates"><div><small>DAL</small><b>${h.dal.g}</b> ${h.dal.m}</div><div><small>AL</small><b>${h.al.g}</b> ${h.al.m}</div></div></div>`;
    const rows = t.rows.length ? t.rows.map((r) => `<tr><td class="rp-name">${X(r.name)}</td>${r.cells.map((c) => `<td class="rp-${c.kind}">${X(c.txt)}</td>`).join('')}</tr>`).join('')
      : '<tr><td class="rp-name rp-vuoto" colspan="8">Nessuna persona in questa tabella</td></tr>';
    return `<section class="rp-sheet">${head}<table class="rp-table"><thead><tr><th></th>${GIORNI.map((g) => `<th>${g}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
      ${h.societa ? `<div class="rp-foot">${X(h.societa.toUpperCase())}</div>` : ''}</section>`;
  }

  const css = document.createElement('style');
  css.textContent = `
    .rp-sheet { background:#fff; color:#000; padding:14px 16px; margin:0 auto 16px; max-width:1100px; border:1px solid #ddd; font-family:Arial, Helvetica, sans-serif; }
    .rp-head { display:flex; align-items:center; gap:18px; margin-bottom:12px; }
    .rp-brand { min-width:120px; display:flex; flex-direction:column; font-size:13px; line-height:1.2; }
    .rp-brand b { font-size:16px; }
    .rp-title { flex:1; font-size:34px; white-space:nowrap; font-weight:400; letter-spacing:.5px; }
    .rp-dates { display:flex; gap:22px; white-space:nowrap; } .rp-dates div { text-align:center; font-size:16px; }
    .rp-dates small { display:block; font-size:10px; } .rp-dates b { font-size:26px; font-weight:400; margin-right:4px; }
    .rp-table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:12.5px; }
    .rp-table th { font-weight:400; font-size:12px; padding:2px; }
    .rp-table th:first-child { width:25%; }
    .rp-table td { border:1.5px solid #000; height:26px; padding:2px 3px; text-align:center; white-space:nowrap; overflow:hidden; }
    .rp-table td.rp-name { text-align:left; font-size:13px; text-overflow:ellipsis; }
    .rp-table td.rp-riposo { color:#1d3fc4; text-align:left; }
    .rp-table td.rp-assenza { text-align:left; }
    .rp-foot { text-align:right; font-weight:700; font-size:11px; margin-top:6px; }
    .rp-preview .rp-sheet { min-width:900px; }
    .modal.rp-modal { max-width:1180px; width:96vw; }
    .rp-bar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:12px; }
    #rp-print { display:none; }
    @page riep { size: A4 portrait; margin: 10mm; }
    @media print {
      body.rp-printing > *:not(#rp-print) { display:none !important; }
      body.rp-printing #rp-print { display:block; }
      #rp-print .rp-sheet { page: riep; break-after: page; border:0; padding:0; margin:0; max-width:none; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      #rp-print .rp-sheet:last-child { break-after: auto; }
    }`;
  document.head.appendChild(css);

  let scelta = 'TUTTE';
  function apri(ws = ui.ws) {
    const tt = tabelle(ws), h = intestazione(ws);
    const vis = tt.filter((t) => scelta === 'TUTTE' || t.key === scelta);
    const btn = (k, l) => `<button class="${scelta === k ? 'on' : ''}" onclick="Riepilogo.scegli('${k}',${ws})">${l}</button>`;
    showModal(`<div class="rp-bar"><h3 style="margin:0;flex:1">📄 Riepilogo orari · ${X(T.weekLabel(ws))}</h3>
        <button class="btn" onclick="closeModal()">Chiudi</button></div>
      <div class="rp-bar"><div class="seg">${btn('TUTTE', 'Tutte')}${tt.map((t) => btn(t.key, t.key[0] + t.key.slice(1).toLowerCase())).join('')}</div>
        <div class="spacer" style="flex:1"></div>
        <button class="btn" onclick="Riepilogo.stampa(${ws})" title="Dalla finestra di stampa puoi anche scegliere &quot;Salva come PDF&quot;">🖨 Stampa / PDF</button>
        <button class="btn primary" onclick="Riepilogo.excel(${ws})">⬇ Excel</button></div>
      <div class="small muted" style="margin-bottom:8px">${scelta === 'TUTTE' ? 'In stampa ogni tabella va su un foglio A4.' : 'Si stampa e si esporta la tabella scelta.'} Per il PDF: 🖨 Stampa, poi "Salva come PDF".</div>
      <div class="rp-preview" style="overflow:auto;max-height:65vh;background:#f3f4f6;padding:10px">${vis.map((t) => htmlTabella(t, h)).join('')}</div>`);
    const m = document.querySelector('#modal .modal'); if (m) m.classList.add('rp-modal');
  }
  function stampa(ws) {
    const tt = tabelle(ws).filter((t) => scelta === 'TUTTE' || t.key === scelta), h = intestazione(ws);
    let div = document.getElementById('rp-print');
    if (!div) { div = document.createElement('div'); div.id = 'rp-print'; document.body.appendChild(div); }
    div.innerHTML = tt.map((t) => htmlTabella(t, h)).join('');
    document.body.classList.add('rp-printing');
    const fine = () => { document.body.classList.remove('rp-printing'); div.innerHTML = ''; window.removeEventListener('afterprint', fine); };
    window.addEventListener('afterprint', fine);
    window.print();
  }

  // ---------- Excel (.xlsx) ----------
  // un .xlsx è un archivio zip di file XML: qui lo si costruisce a mano (zip senza compressione)
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], central = [];
    let off = 0;
    const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    for (const [name, text] of files) {
      const nm = enc.encode(name), data = enc.encode(text), crc = crc32(data);
      const common = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nm.length), ...u16(0)];
      const local = new Uint8Array([...u32(0x04034b50), ...common]);
      parts.push(local, nm, data);
      central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nm);
      off += local.length + nm.length + data.length;
    }
    const cSize = central.reduce((t, p) => t + p.length, 0);
    const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cSize), ...u32(off), ...u16(0)]);
    return new Blob([...parts, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const xe = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  // stili: 0 normale · 1 titolo · 2 giorni · 3 nome (bordo) · 4 orario (bordo, centrato) · 5 riposo (bordo, blu) · 6 assenza (bordo) · 7 "DAL/AL" · 8 numero data · 9 mese · 10 marchio · 11 società
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="8"><font><sz val="12"/><name val="Arial"/></font><font><sz val="32"/><name val="Arial"/></font><font><sz val="11"/><name val="Arial"/></font><font><sz val="13"/><name val="Arial"/></font>
<font><sz val="12"/><color rgb="FF1D3FC4"/><name val="Arial"/></font><font><sz val="9"/><name val="Arial"/></font><font><sz val="24"/><name val="Arial"/></font><font><b/><sz val="14"/><name val="Arial"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="bottom"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="7" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="7" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right"/></xf>
</cellXfs></styleSheet>`;
  const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function foglio(t, h) {
    const rows = [], ref = (c, r) => COLS[c] + r;
    const cell = (c, r, v, s) => (v === '' ? `<c r="${ref(c, r)}" s="${s}"/>` : `<c r="${ref(c, r)}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xe(v)}</t></is></c>`);
    // colonne: A nome · per ogni giorno una colonna (B…H) · I margine
    const brand = [h.marchio, h.locale].filter(Boolean).join('\n');
    rows.push(`<row r="1" ht="18" customHeight="1">${cell(4, 1, 'DAL', 7)}${cell(6, 1, 'AL', 7)}</row>`);
    rows.push(`<row r="2" ht="44" customHeight="1">${cell(0, 2, brand, 10)}${cell(1, 2, t.title, 1)}${cell(4, 2, String(h.dal.g), 8)}${cell(5, 2, h.dal.m, 9)}${cell(6, 2, String(h.al.g), 8)}${cell(7, 2, h.al.m, 9)}</row>`);
    rows.push(`<row r="4" ht="18" customHeight="1">${GIORNI.map((g, i) => cell(i + 1, 4, g, 2)).join('')}</row>`);
    let r = 5;
    for (const p of t.rows) {
      rows.push(`<row r="${r}" ht="26" customHeight="1">${cell(0, r, p.name, 3)}${p.cells.map((c, i) => cell(i + 1, r, c.txt, c.kind === 'riposo' ? 5 : c.kind === 'assenza' ? 6 : 4)).join('')}</row>`);
      r++;
    }
    // righe vuote con i bordi, come nel modello (per aggiunte a mano), fino ad almeno 20 righe
    for (; r < Math.max(25, 5 + t.rows.length + 3); r++) rows.push(`<row r="${r}" ht="26" customHeight="1">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => cell(i, r, '', i ? 4 : 3)).join('')}</row>`);
    if (h.societa) rows.push(`<row r="${r + 1}">${cell(7, r + 1, h.societa.toUpperCase(), 11)}</row>`);
    const widths = [30, 16, 16, 16, 16, 16, 16, 16];
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${rows.join('')}</sheetData>
<mergeCells count="1"><mergeCell ref="B2:D2"/></mergeCells>
<printOptions horizontalCentered="1"/><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  }
  function xlsx(ws, vuote) {
    const tt = vuote ? SEZIONI.map(([key, title]) => ({ key, title, rows: [] })) : tabelle(ws).filter((t) => scelta === 'TUTTE' || t.key === scelta), h = intestazione(ws);
    const names = tt.map((t) => t.title.replace(/^ORARI /, 'Orari ').replace(/ (\w)(\w+)$/, (m, a, b) => ' ' + a + b.toLowerCase()));
    const files = [
      ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${tt.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
      ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${xe(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${tt.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${tt.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ['xl/styles.xml', STYLES],
      ...tt.map((t, i) => [`xl/worksheets/sheet${i + 1}.xml`, foglio(t, h)]),
    ];
    return zip(files);
  }
  const nomeFile = (ws) => { const a = dataOf(ws); return `Orari settimana ${String(a.g).padStart(2, '0')}-${String(new Date(ws * 864e5).getUTCMonth() + 1).padStart(2, '0')}-${a.y}${scelta === 'TUTTE' ? '' : ' ' + scelta.toLowerCase()}.xlsx`; };
  function excel(ws) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(xlsx(ws)); a.download = nomeFile(ws);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  /** Modello vuoto (stesse 4 tabelle) da compilare e ricaricare in Persone → Carica da Excel. */
  function modello() {
    const ws = T.mondayOf(T.todayDay()), a = document.createElement('a');
    a.href = URL.createObjectURL(xlsx(ws, true)); a.download = 'Modello personale.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  window.Riepilogo = { tabelle, apri, stampa, excel, xlsx, modello, scegli: (k, ws) => { scelta = k; apri(ws); } };
})();
