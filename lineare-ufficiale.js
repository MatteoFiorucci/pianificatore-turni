/*
 * Lineare ufficiale (modello aziendale), compilato con i turni dell'app.
 * Quando si stampa il lineare giornaliero, dopo il nostro foglio esce anche il lineare ufficiale (A4 verticale).
 * Manager, VLH, cambi turno, compleanni, training, pulizie e note restano vuoti: si compilano a mano.
 * Marchio, nome del locale e società vengono dai dati del manager (Regole), non dal codice.
 */
(function () {
  'use strict';
  const MESI = ['GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO', 'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE'];
  const POST = { CUCINA: 'MFY', FRONT: 'OA', MCCAFE: 'McCafè', SERVIZIO: 'Sala', HOSPITALITY: 'SAT' };
  const COL = { CUCINA: '#c8323a', FRONT: '#4a86b0', MCCAFE: '#6e4030', SERVIZIO: '#9a9a9a', HOSPITALITY: '#7e72b8' };
  const YEL = '#f2b632', GREEN = '#2f5f4f', LINE = '#555', THIN = '#b5b5b5';

  // misure in mm (foglio A4 verticale, margini 6 mm)
  const W = 198, H = 283;
  const X_POS = 0, X_NAME = 11, X_T1 = 42, X_T2 = 48.5, X_G = 55, QW = 1; // griglia: 96 quarti d'ora dalle 5 alle 5
  const X_GE = X_G + 96 * QW, X_R = X_GE + 3, RW = W - X_R;
  const RH = 2.35; // altezza riga

  const fmt = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  const num = (x) => (Math.round(x * 100) / 100).toString().replace('.', ',');
  const X = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const name = (e) => `${e.lastName || ''} ${e.firstName || ''}`.trim() || T.fullName(e);

  function dati(day) {
    const ctx = T.makeCtx(state, T.mondayOf(day));
    const all = ctx.shifts.filter((s) => s.day === day && ctx.byId.has(s.employeeId)).sort((a, b) => a.start - b.start || a.end - b.end);
    const typ = (s) => ctx.byId.get(s.employeeId).type;
    const hosp = all.filter((s) => !s.doppio && typ(s) === 'HOSPITALITY');
    const crew = all.filter((s) => !s.doppio && typ(s) === 'CREW');
    // crew come sul foglio: giorno, poi sera (dalle 17), poi McCafè; una riga vuota tra i gruppi
    const isMc = (s) => s.station === 'MCCAFE';
    const groups = [crew.filter((s) => !isMc(s) && s.start < 17 * 60), crew.filter((s) => !isMc(s) && s.start >= 17 * 60), crew.filter(isMc)].filter((g) => g.length);
    const crewRows = []; groups.forEach((g, i) => { if (i) crewRows.push(null); crewRows.push(...g); });
    const doppi = all.filter((s) => s.doppio);
    const riposi = ctx.employees.filter((e) => T.started(e, day) && T.isRest(e, day) && !all.some((s) => s.employeeId === e.id));
    const assenze = ctx.employees.map((e) => ({ e, a: T.absenceOn(ctx, e.id, day) })).filter((x) => x.a && x.a.type !== 'CHIUSURA');
    return { ctx, hosp, crewRows, doppi, riposi, assenze, all };
  }

  /** Ore lavorate nell'ora h (5..28) da una lista di turni. */
  const oreIn = (list, h) => list.reduce((t, s) => t + Math.max(0, Math.min(s.end, (h + 1) * 60) - Math.max(s.start, h * 60)), 0) / 60;

  function svg(day) {
    const d = dati(day), ctx = d.ctx;
    const out = [];
    const t = (x, y, s, o = {}) => out.push(`<text x="${x}" y="${y}" font-size="${o.fs || 1.9}" ${o.b ? 'font-weight="700"' : ''} ${o.a ? `text-anchor="${o.a}"` : ''} fill="${o.c || '#000'}" ${o.i ? 'font-style="italic"' : ''} ${o.tr ? `transform="${o.tr}"` : ''}>${X(s)}</text>`);
    const r = (x, y, w, h, o = {}) => out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${o.f || 'none'}" stroke="${o.s || 'none'}" stroke-width="${o.sw || 0.15}"/>`);
    const l = (x1, y1, x2, y2, c = THIN, w = 0.08) => out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}"/>`);

    // barra gialla con le ore 5…24, 1…5
    const hourBar = (y, title) => {
      r(X_G, y, 96 * QW, 2.2, { f: YEL, s: LINE });
      for (let q = 4; q < 96; q += 4) l(X_G + q * QW, y, X_G + q * QW, y + 2.2, '#555', 0.15);
      for (let i = 0; i < 24; i++) { const h = (5 + i) % 24 || 24; t(X_G + (i * 4 + 2) * QW, y + 1.65, h, { fs: 1.4, b: 1, a: 'middle' }); }
      if (title) t(X_G + 48 * QW, y - 0.6, title, { fs: 2, b: 1, a: 'middle', i: 1 });
    };
    // una sezione: intestazione + righe; rows = turni (null = riga vuota)
    const section = (y0, title, n, rows) => {
      t(X_POS + 1, y0 + 4, 'Postazione', { fs: 1.4, c: '#444' }); t(X_NAME + 1, y0 + 4, 'NOME', { fs: 2 }); t(X_T1 + 0.5, y0 + 4, 'ORARIO', { fs: 1.9 });
      hourBar(y0 + 2.4, title);
      const y = y0 + 5;
      // griglia
      r(X_POS, y, X_T2 + 6.5 - X_POS, n * RH, { s: LINE, sw: 0.2 });
      r(X_G, y, 96 * QW, n * RH, { s: LINE, sw: 0.2 });
      for (let i = 1; i < n; i++) { l(X_POS, y + i * RH, X_T2 + 6.5, y + i * RH, '#9a9a9a', 0.12); l(X_G, y + i * RH, X_GE, y + i * RH, '#9a9a9a', 0.12); }
      [X_NAME, X_T1, X_T2].forEach((x) => l(x, y, x, y + n * RH, LINE, 0.12));
      for (let q = 1; q < 96; q++) l(X_G + q * QW, y, X_G + q * QW, y + n * RH, q % 4 ? '#bdbdbd' : '#555', q % 4 ? 0.1 : 0.22);
      // turni
      rows.slice(0, n).forEach((s, i) => {
        if (!s) return;
        const e = ctx.byId.get(s.employeeId), yy = y + i * RH, ty = yy + RH - 0.6;
        const lim = T.limitOf(ctx, e.id, s.day);
        t(X_NAME - 0.6, ty, lim ? 'RICHIESTA' : POST[s.station] || '', { fs: 1.25, a: 'end' });
        t(X_NAME + 0.6, ty, name(e), { fs: 1.6 });
        t(X_T1 + 3.25, ty, fmt(s.start), { fs: 1.55, a: 'middle' }); t(X_T2 + 3.25, ty, fmt(s.end), { fs: 1.55, a: 'middle' });
        const a = Math.max(0, (s.start - 300) / 15), b = Math.min(96, (s.end - 300) / 15);
        r(X_G + a * QW, yy + 0.3, (b - a) * QW, RH - 0.6, { f: COL[s.station] || '#888' });
      });
      return y + n * RH;
    };
    // riquadro a destra con titolo verticale verde
    // riquadro a destra (n righe, sulle stesse righe della griglia a sinistra) con titolo verticale verde
    const box = (y, n, title) => {
      const h = n * RH;
      r(X_R, y, RW, h, { s: LINE, sw: 0.2 });
      r(X_R + RW - 3.2, y, 3.2, h, { f: GREEN });
      t(X_R + RW - 1, y + h / 2, title, { fs: 1.7, b: 1, c: '#fff', a: 'middle', tr: `rotate(-90 ${X_R + RW - 1} ${y + h / 2})` });
      l(X_R + (RW - 3.2) / 2, y, X_R + (RW - 3.2) / 2, y + h, THIN, 0.1);
      for (let i = 1; i < n; i++) l(X_R, y + i * RH, X_R + RW - 3.2, y + i * RH, THIN, 0.08);
    };
    // elenco (riposi, ferie): titolo verde su 2 righe, poi un nome per riga, su due colonne
    const listBox = (y, n, title, items) => {
      r(X_R, y, RW, 2 * RH, { f: GREEN }); t(X_R + RW / 2, y + 2 * RH - 1.2, title, { fs: 2.6, b: 1, c: '#fff', a: 'middle' });
      const y1 = y + 2 * RH, per = n - 2;
      r(X_R, y1, RW, per * RH, { s: LINE, sw: 0.2 });
      l(X_R + RW / 2, y1, X_R + RW / 2, y1 + per * RH, THIN, 0.1);
      for (let i = 1; i < per; i++) l(X_R, y1 + i * RH, X_R + RW, y1 + i * RH, THIN, 0.08);
      items.slice(0, per * 2).forEach((s, i) => t(X_R + 0.6 + (i >= per ? RW / 2 : 0), y1 + (i % per) * RH + RH - 0.6, s, { fs: 1.45 }));
    };

    // intestazione
    const p = new Date(day * 864e5);
    t(0, 4, 'CONTEGGIO SETTIMANALE', { fs: 1.8, b: 1, i: 1 }); l(0, 5, 40, 5, '#000', 0.15);
    const cfg = state.config || {}, marchio = (cfg.marchio || '').trim(), locale = (cfg.storeName || '').trim().toUpperCase();
    if (marchio) { t(98, 6, marchio, { fs: 4.2, b: 1, a: 'end' }); t(102, 6, locale, { fs: 4 }); } else t(100, 6, locale, { fs: 4, a: 'middle' });
    t(152, 6, T.DOW_LONG[T.dow(day)], { fs: 3 }); t(172, 6, p.getUTCDate(), { fs: 3.4, b: 1, a: 'middle' }); t(178, 6, MESI[p.getUTCMonth()], { fs: 3 });

    // sezioni: le righe crew riempiono lo spazio che resta
    const nM = 12, nH = Math.max(12, d.hosp.length + 1), nD = Math.max(10, d.doppi.length + 1);
    const TOT_H = 5 * 2.6 + 6;
    const free = H - 9 - 4 * 8 - TOT_H - (nM + nH + nD) * RH;
    const nC = Math.max(d.crewRows.length + 1, Math.floor(free / RH));
    let y = 9;
    const yM = y; y = section(y, 'MANAGER', nM, []) + 3;
    const yH = y; y = section(y, 'HOSPITALITY', nH, d.hosp) + 3;
    const yC = y; y = section(y, 'CREW', nC, d.crewRows) + 3;
    const yD = y; y = section(y, 'DOPPI TURNI', nD, d.doppi) + 2.5;

    // ore per fascia oraria (manager e VLH non si contano)
    const hosp = d.hosp, crew = d.crewRows.filter(Boolean), dop = d.doppi;
    const rowsT = [['ORE MANAGER', null], ['ORE HOSPITALITY', hosp], ['ORE CREW', crew], ['ORE DOPPI TURNI', dop], ['Totali', hosp.concat(crew, dop)]];
    rowsT.forEach(([lab, list], i) => {
      const yy = y + i * 2.6, bold = lab === 'Totali';
      t(X_T2 - 1, yy + 2, lab, { fs: 1.5, b: 1, i: 1, a: 'end' });
      r(X_T2, yy, 6.5, 2.6, { s: LINE, sw: 0.12 });
      if (list) t(X_T2 + 3.25, yy + 2, num(list.reduce((s, x) => s + x.end - x.start, 0) / 60), { fs: 1.5, b: bold, a: 'middle' });
      for (let k = 0; k < 24; k++) {
        r(X_G + k * 4 * QW, yy, 4 * QW, 2.6, { s: LINE, sw: 0.1, f: bold ? '#eef4ef' : 'none' });
        if (list) t(X_G + k * 4 * QW + 2, yy + 2, num(oreIn(list, 5 + k)), { fs: 1.4, b: bold, a: 'middle' });
      }
    });
    hourBar(y + 5 * 2.6 + 0.8);

    // colonna destra
    // colonna destra: ogni riquadro parte dalla prima riga della sua sezione e usa le stesse righe
    const row0 = (yS) => yS + 5;
    box(row0(yM), nM, 'CAMBI TURNO / ASSENZE');
    box(row0(yH), nH, 'COMPLEANNI');
    const c0 = row0(yC), nTr = Math.round(nC * 0.2), nPu = Math.round(nC * 0.22), nRi = Math.floor((nC - nTr - nPu - 3) / 2), nFe = nC - nTr - nPu - 3 - nRi;
    box(c0, nTr, 'TRAINING');
    box(c0 + (nTr + 1) * RH, nPu, 'PULIZIE E MANUTENZIONI');
    listBox(c0 + (nTr + nPu + 2) * RH, nRi, 'RIPOSI', d.riposi.map(name).sort((a, b) => a.localeCompare(b, 'it')));
    listBox(c0 + (nTr + nPu + nRi + 3) * RH, nFe, 'FERIE', d.assenze.map((x) => name(x.e) + (x.a.type === 'FERIE' ? '' : ` (${T.absenceInfo(x.a.type).label})`)).sort((a, b) => a.localeCompare(b, 'it')));
    box(row0(yD), nD, 'NOTE');
    if (cfg.societa) t(W - 1, H - 2, String(cfg.societa).toUpperCase(), { fs: 2.6, b: 1, a: 'end', c: GREEN });

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMin meet" font-family="Arial, Helvetica, sans-serif" shape-rendering="crispEdges" text-rendering="geometricPrecision">${out.join('')}</svg>`;
  }

  // stile: invisibile a schermo, in stampa su un foglio A4 verticale dopo il nostro lineare
  const css = document.createElement('style');
  css.textContent = `#lin-uff{display:none}
    @page uff { size: A4 portrait; margin: 6mm; }
    @media print { #lin-uff{display:block;page:uff;break-before:page;-webkit-print-color-adjust:exact;print-color-adjust:exact} #lin-uff svg{display:block;width:100%;height:auto;max-height:270mm;margin:0 auto} }`;
  document.head.appendChild(css);

  function prepara() {
    const old = document.getElementById('lin-uff'); if (old) old.remove();
    if (typeof ui === 'undefined' || ui.view !== 'giornaliero') return;
    const div = document.createElement('div'); div.id = 'lin-uff';
    try { div.innerHTML = svg(ui.day); } catch (e) { console.error('Lineare ufficiale:', e); return; }
    document.body.appendChild(div);
  }
  window.addEventListener('beforeprint', prepara);
  window.addEventListener('afterprint', () => { const x = document.getElementById('lin-uff'); if (x) x.remove(); });
  window.LineareUfficiale = { svg, prepara };
})();
