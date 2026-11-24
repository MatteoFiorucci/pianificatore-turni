/*
 * VLH (posizionamento del turno): quali postazioni aprire ora per ora in base ai clienti previsti.
 * Le tabelle (una per giorno della settimana, quattro fasce: colazione, pranzo, pomeriggio, cena) sono nei dati
 * del locale (cifrati online): state.vlh = { versione, giorni: { '1'..'7': { B, L, A, D: 'CODICE:GC,CODICE:GC,...' } } }.
 * Ogni postazione si apre quando i GC previsti dell'ora arrivano alla sua soglia; le prime tre ci sono sempre.
 * Qui ci sono solo i nomi delle postazioni e la logica: nessun dato del locale.
 */
(function (root) {
  'use strict';
  // codice → [nome, area]   area: FC banco, PR produzione, MC McCafé
  const POS = {
    FO: ['FCOT1/RUN', 'FC'], MO: ['McC OT1', 'MC'], I1: ['Initiator (side 1)', 'PR'],
    ME: ['McC Espr', 'MC'], MV: ['McC Vetrina', 'MC'], ML: ['McC Latte', 'MC'],
    R1: ['FC Run1', 'FC'], R2: ['FC Run2', 'FC'],
    C1: ['Active Cash 1', 'FC'], C2: ['Active Cash 2', 'FC'],
    T1: ['Table Server 1', 'FC'], T2: ['Table Server 2', 'FC'], T3: ['Table Server 3', 'FC'],
    T4: ['Table Server 4', 'FC'], T5: ['Table Server 5', 'FC'], T6: ['Table Server 6', 'FC'],
    P1: ['FC Pres1', 'FC'], P2: ['FC Pres2', 'FC'], P3: ['FC Pres3/Finisher', 'FC'], P4: ['FC Pres4/Finisher', 'FC'],
    B1: ['BDAP1', 'FC'], B2: ['BDAP2', 'FC'], B3: ['BDAP3', 'FC'], B4: ['BDAP4', 'FC'],
    F1: ['Fries 1', 'FC'], X1: ['FCEXP1', 'FC'], XT: ['FCEXP1 (+ table)', 'FC'], X2: ['FCEXP2', 'FC'], O2: ['FCOT2', 'FC'],
    G1: ['Grill Prod 1', 'PR'], G2: ['Grill Prod 2', 'PR'], G3: ['Grill Prod 3', 'PR'],
    A1: ['Assembler (side 1)', 'PR'], A2: ['Assembler (side 2)', 'PR'], A3: ['Assembler (side 3)', 'PR'], A4: ['Assembler (side 4)', 'PR'],
    I2: ['Initiator (side 2)', 'PR'], I3: ['Initiator (side 3)', 'PR'], I4: ['Initiator (side 4)', 'PR'],
    D1: ['Fried Prod. 1 (initiator 2)', 'PR'], D3: ['Fried Prod 3', 'PR'],
    GF: ['Grill/Fried Prod 2', 'PR'], FG: ['Fried/Grill Prod. 2', 'PR'],
    F2: ['Fries 2 (assembler)', 'PR'], F3: ['Fries 3 (finisher)', 'PR'],
    N1: ['Finisher (side 1)', 'PR'], N2: ['Finisher (side 2)', 'PR'], N3: ['Finisher (side 3)', 'PR'], N4: ['Finisher (side 4)', 'PR'],
    H1: ['Chaser (side 1)', 'PR'], H2: ['Chaser (side 2)', 'PR'],
  };
  const AREAS = [['FC', 'Front Counter'], ['PR', 'Production'], ['MC', 'McCafé'], ['DT', 'Drive']];
  const PART_TXT = { B: 'Breakfast', L: 'Lunch', A: 'Afternoon', D: 'Dinner', E: 'Evening', N: 'Late Night' };
  /**
   * Fascia della giornata di un'ora (come nel foglio aziendale). g = tabelle del giorno: la sera (22–23) e la notte (0–4)
   * hanno fasce proprie solo se il locale le ha nella sua VLH (locali aperti fino a tardi o 24 ore).
   */
  const partOf = (h, g) => (h < 5 && g && g.N ? 'N' : h >= 22 && g && g.E ? 'E' : h < 5 && g && g.E ? 'E' : h <= 10 ? 'B' : h <= 14 ? 'L' : h <= 18 ? 'A' : 'D');
  /** Postazioni che non sono nell'elenco qui sopra (es. Drive): arrivano con le tabelle del locale (vlh.pos). */
  function registra(vlh) { if (vlh && vlh.pos) for (const [c, v] of Object.entries(vlh.pos)) if (!POS[c]) POS[c] = v; }
  // area del lineare che può coprire ogni postazione: Production → MFY, Front Counter → OA, McCafé → McCafé.
  // Eccezione: le patatine (Fries) le fa chi sul lineare è in OA oppure in MFY.
  // Il servizio al tavolo (Table Server) lo fa anche chi sul lineare è in sala o hospitality.
  const STATION_OF = (code) => {
    if (POS[code][1] === 'MC') return ['MCCAFE'];
    if (POS[code][1] === 'DT') return ['DRIVE'];
    if (/^F\d/.test(code)) return ['FRONT', 'CUCINA']; // patatine (Fries 1–3): OA oppure MFY
    if (POS[code][1] === 'PR') return ['CUCINA'];
    if (code[0] === 'T') return ['FRONT', 'SERVIZIO', 'HOSPITALITY'];
    return ['FRONT'];
  };

  /** Elenco ordinato delle postazioni di un giorno (1–7) e fascia: [{ code, name, area, gc, n }]. */
  function list(vlh, dow, part) {
    const g = vlh && vlh.giorni && vlh.giorni[String(dow)];
    if (!g || !g[part]) return null;
    registra(vlh);
    // formato 2 (letto dai file aziendali): ci sono anche le prime postazioni "sempre aperte" (soglia 0)
    const first = vlh.formato === 2 ? [] : [['FO', 0], ['MO', 0], ['I1', 0]];
    const out = [...first, ...g[part].split(',').map((x) => { const [c, v] = x.split(':'); return [c, +v]; })];
    return out.map(([code, gc], i) => ({ code, gc, n: i + 1, name: (POS[code] || [code])[0], area: (POS[code] || [0, 'FC'])[1] }));
  }
  /** Postazioni aperte con quei GC e le tre successive. */
  function forHour(vlh, dow, h, gc) {
    const g = vlh && vlh.giorni && vlh.giorni[String(dow)], part = partOf(h, g);
    const l = list(vlh, dow, part);
    if (!l) return null;
    const open = l.filter((p) => p.gc <= (gc || 0));
    return { part, open, next: l.slice(open.length, open.length + 3) };
  }

  // ---------- tabelle lette dai file VLH aziendali (Cloud VLH Customization Tool, un file per giorno) ----------
  const nk = (t) => String(t || '').toLowerCase().replace(/curbside/g, '').replace(/[^a-z0-9]/g, '');
  const BY_NAME = () => Object.fromEntries(Object.entries(POS).map(([c, [n]]) => [nk(n), c]));
  const PARTS = [['breakfast', 'B'], ['lunch', 'L'], ['afternoon', 'A'], ['dinner', 'D'], ['evening', 'E'], ['latenight', 'N']];
  const GIORNI = [['LUN', 1], ['MAR', 2], ['MER', 3], ['GIO', 4], ['VEN', 5], ['SAB', 6], ['DOM', 7]];
  const areaOf = (name) => { const n = nk(name);
    return /^(dt|drive)/.test(n) ? 'DT' : /^mcc|mccafe|cafe/.test(n) ? 'MC' : /grill|assembl|initiator|finisher|chaser|fried|prod/.test(n) ? 'PR' : 'FC'; };
  /** Giorno della settimana dal nome del file (LUN.xlsm, MART.xlsm, "VLH Domenica.xlsm"…), null se non si capisce. */
  function giornoDaNome(file) {
    const n = String(file || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\.[A-Z]+$/, '');
    for (const w of n.split(/[^A-Z]+/)) { const g = GIORNI.find(([k]) => w.startsWith(k)); if (g) return g[1]; }
    return null;
  }
  /**
   * Da un file VLH: { giorno, data, locale, parti: { B: [[nome, gc], …], L: …, … } } oppure null se non è un file VLH.
   * Si legge il foglio "Custom VLH Tables Format B": per ogni fascia due colonne "Positions" e "GC Start".
   */
  function daFogli(sheets, file) {
    const sh = sheets.find((x) => /custom vlh tables format b/i.test(x.name)) || sheets.find((x) => /vlh tables format b/i.test(x.name));
    if (!sh) return null;
    const hi = sh.rows.findIndex((r) => r && r.filter((c) => /^positions$/i.test(String(c).trim())).length >= 2);
    if (hi < 0) return null;
    // la tabella finisce alla prima riga senza nessuna postazione (più in basso nel foglio ci sono altre tabelle)
    const cols = sh.rows[hi].map((c, i) => (/^positions$/i.test(String(c).trim()) ? i : -1)).filter((i) => i >= 0);
    const hasName = (r) => r && cols.some((c) => /[a-z]/i.test(String(r[c] || '')));
    let end = hi + 1; while (end < sh.rows.length && hasName(sh.rows[end])) end++;
    // nomi delle fasce: nelle righe sopra, nella stessa colonna di "Positions"
    const parti = {};
    sh.rows[hi].forEach((c, col) => {
      if (!/^positions$/i.test(String(c).trim())) return;
      let part = null;
      for (let r = hi - 1; r >= Math.max(0, hi - 5) && !part; r--) { const t = nk((sh.rows[r] || [])[col]); const p = PARTS.find(([k]) => t === k); if (p) part = p[1]; }
      if (!part) return;
      const list = [];
      for (const r of sh.rows.slice(hi + 1, end)) {
        const name = r && String(r[col] || '').trim(), gc = r && parseFloat(r[col + 1]);
        if (!name || !/[a-z]/i.test(name) || !isFinite(gc)) continue;
        list.push([name, Math.round(gc)]);
      }
      if (list.length) parti[part] = list;
    });
    if (!Object.keys(parti).length) return null;
    // data di creazione e locale, dal foglio "VLH Customization" (se c'è)
    let data = null, locale = '';
    const cu = sheets.find((x) => /^vlh customization$/i.test(x.name.trim()));
    if (cu) for (const r of cu.rows.slice(0, 15)) (r || []).forEach((c, i) => {
      if (/data creazione|creation date/i.test(c) && r[i + 1]) { const v = parseFloat(r[i + 1]); data = isFinite(v) && v > 20000 ? new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10) : String(r[i + 1]); }
      if (/^ristorante:?$|^restaurant:?$/i.test(String(c).trim()) && r[i + 1]) locale = String(r[i + 1]);
    });
    return { giorno: giornoDaNome(file), data, locale, parti };
  }
  /**
   * Tabelle del locale da più file (uno per giorno): { versione, formato: 2, pos, giorni }. prev = tabelle di prima:
   * i giorni senza file nuovo restano come erano. nuove = postazioni non conosciute (es. Drive), con l'area stimata.
   */
  function componi(lette, prev) {
    const byName = BY_NAME(), pos = { ...((prev && prev.formato === 2 && prev.pos) || {}) }, nuove = [];
    for (const [c, v] of Object.entries(pos)) byName[nk(v[0])] = c;
    let k = Object.keys(pos).length;
    const code = (name) => {
      const key = nk(name);
      if (byName[key]) return byName[key];
      const c = 'Y' + String(++k).padStart(2, '0');
      byName[key] = c; pos[c] = [name, areaOf(name)]; nuove.push({ code: c, name, area: areaOf(name) });
      return c;
    };
    const giorni = prev && prev.formato === 2 ? { ...prev.giorni } : {};
    let data = null;
    for (const f of lette) {
      if (!f.giorno) continue;
      giorni[String(f.giorno)] = Object.fromEntries(Object.entries(f.parti).map(([p, l]) => [p, l.map(([n, gc]) => code(n) + ':' + gc).join(',')]));
      if (f.data && (!data || f.data > data)) data = f.data;
    }
    const d = data ? data.split('-').reverse().join('/') : '';
    return { versione: 'VLH ' + d, formato: 2, data, pos, giorni, nuove };
  }

  /** Questa persona (con la sua area del lineare) può stare su questa postazione? */
  const fits = (code, x) => !!POS[code] && STATION_OF(code).includes(x.station);

  /**
   * Proposta di nomi: ogni persona va solo nelle postazioni dell'area in cui è messa sul lineare
   * (chi è in MFY solo in Production, chi è in OA solo al Front Counter, chi è al McCafé solo al McCafé; Fries: OA o MFY).
   * Le postazioni si riempiono SEMPRE in ordine di numero (1, 2, 3, ...): ogni postazione prende la persona
   * più adatta tra quelle ancora libere, prima di passare alla successiva. Tra i candidati si preferisce
   * chi era su quella postazione l'ora prima. Resta vuota solo una postazione per cui non c'è più nessuno di quell'area.
   * fixed(h) = spostamenti fatti a mano in quell'ora: { codice: id della persona, oppure 0 = lasciala vuota }.
   * Restituisce { ora: { codice: persona } }.
   */
  function assign(hours, open, people, fixed = () => ({})) {
    const out = {};
    let last = {}; // code → id dell'ora prima
    for (const h of hours) {
      const pos = [...open(h)].sort((a, b) => a.n - b.n), avail = people(h), used = new Set(), res = {}, fx = fixed(h) || {};
      // prima gli spostamenti fatti a mano (solo se la postazione è aperta e la persona è in turno)
      for (const p of pos) {
        if (!(p.code in fx)) continue;
        const x = fx[p.code] ? avail.find((y) => y.id === fx[p.code] && !used.has(y.id)) : null;
        if (x) { used.add(x.id); res[p.code] = x; } else if (fx[p.code] === 0) res[p.code] = null;
      }
      for (const p of pos) {
        if (p.code in res) continue;
        const cand = avail.filter((x) => !used.has(x.id) && fits(p.code, x));
        if (!cand.length) continue;
        const c = cand.sort((a, b) => (a.id === last[p.code] ? 0 : 1) - (b.id === last[p.code] ? 0 : 1))[0];
        used.add(c.id); res[p.code] = c;
      }
      for (const k of Object.keys(res)) if (!res[k]) delete res[k];
      out[h] = res; last = Object.fromEntries(Object.entries(res).map(([k, x]) => [k, x.id]));
    }
    return out;
  }

  root.TurniVLH = { POS, AREAS, PART_TXT, partOf, list, forHour, assign, fits, daFogli, componi, giornoDaNome, registra };
})(typeof window !== 'undefined' ? window : globalThis);
