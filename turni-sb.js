/*
 * Dati SmartBusiness dentro l'app: si caricano i report Excel scaricati a mano e l'app fa da sola quello che
 * sul Mac fanno strumenti/smartbusiness.py (archivio) e strumenti/previsioni.py (previsioni).
 * Report: "Fasce Orarie per Data" a quarti d'ora (CDC Tutti, Mc Cafè, Front, Chiosco…) e "Report Controllo VLH".
 * L'archivio sta nei dati del locale (cifrati online): state.sbArch = {
 *   giorni: { 'AAAA-MM-GG': { c: { tutti: [vendite, gc], mccafe: [...], ... }, o: [gc per ora, dalle 5] } },
 *   prev:   { 'AAAA-MM-GG': { ora: gc previsti da SmartBusiness } } }
 * Il calcolo è lo stesso di previsioni.py (stessi metodi e pesi): il risultato si usa con applyAutoForecasts.
 */
(function (root) {
  'use strict';
  const MESI = { gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12 };
  // suffisso del nome del locale nel report → reparto (CDC). 2 = Drive (nei locali che ce l'hanno)
  const CDC = { '': 'tutti', 1: 'front', 2: 'drive', 3: 'mccafe', 4: 'chiosco', 5: 'mcdelivery' };
  const CANALI = ['chiosco', 'mccafe', 'front', 'mcdelivery', 'drive'];
  const NORMALI = ['ultime 3 settimane', 'ultime 6 settimane pesate'];
  const FINESTRA = 56, SETTIMANE = 10, MIN_GIORNI = 28;

  // ---------- date come numero di giorni (UTC) ----------
  const dayOf = (iso) => Math.round(Date.parse(iso) / 864e5);
  const isoOf = (d) => new Date(d * 864e5).toISOString().slice(0, 10);
  const weekday = (d) => (d + 3) % 7; // lunedì = 0, come in Python
  const excelDay = (n) => Math.round(+n) - 25569; // numero di serie di Excel → giorno

  // arrotondamenti come in Python (a metà: verso il pari)
  function pyRound(x, n = 0) {
    const m = 10 ** n, y = x * m, f = Math.floor(y);
    if (y - f === 0.5) return (f % 2 === 0 ? f : f + 1) / m;
    return Math.round(y) / m;
  }
  const mean = (a) => a.reduce((t, x) => t + x, 0) / a.length;
  const median = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  const num = (x) => { const v = parseFloat(String(x).replace(',', '.')); return isFinite(v) ? v : 0; };

  // ---------- lettura dei report ----------
  const testoInizio = (rows) => rows.slice(0, 4).map((r) => (r || []).join(' ')).join(' ');
  /** Tipo di report: 'fasce', 'previsioni' oppure null. */
  function tipo(sheets) {
    const t = sheets[0] ? testoInizio(sheets[0].rows) : '';
    return /Projections/i.test(t) ? 'previsioni' : /Fasce/i.test(t) ? 'fasce' : null;
  }
  /** Fasce orarie per data: { cdc, giorni: { iso: { band: [vendite, gc] } } } */
  function leggiFasce(rows) {
    let store = '';
    for (const r of rows.slice(0, 10)) for (const c of r || []) if (!store && /\(.*\)/.test(c)) store = String(c).trim();
    const m = /\)\s*-\s*(\d+)\s*$/.exec(store), suf = m ? m[1] : '';
    const cdc = CDC[suf] || 'cdc' + suf;
    const isDate = (c) => /^\d+ \w+ \d{4}$/.test(String(c || '').trim());
    const h = rows.findIndex((r) => (r || []).some(isDate));
    if (h < 0) throw new Error('report delle fasce orarie senza date');
    const kinds = rows[h + 2] || [], giorni = {};
    (rows[h] || []).forEach((c, j) => {
      if (!isDate(c)) return;
      const [g, mese, y] = String(c).trim().split(/\s+/);
      const iso = `${y}-${String(MESI[mese.toLowerCase().slice(0, 3)]).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
      let gk = null; for (let k = j; k < j + 6; k++) if (kinds[k] === 'GC') { gk = k; break; }
      const sk = kinds[j] === 'Sales' ? j : null;
      const out = giorni[iso] = {};
      for (const r of rows.slice(h + 4)) {
        const band = r && r[1];
        if (!(typeof band === 'string' && /^\d+\.\d\d-/.test(band))) continue;
        out[band] = [pyRound(num(sk != null ? r[sk] : 0), 2), Math.round(num(gk != null ? r[gk] : 0))];
      }
    });
    return { cdc, giorni };
  }
  /** Report Controllo VLH (Projections): { iso: { band: gc } } */
  function leggiPrevisioni(rows) {
    const out = {}; let cur = null;
    for (const r of rows) {
      let v = (r || []).filter((c) => c !== '' && c != null);
      if (!v.length) continue;
      // la data è un numero di serie di Excel, seguita dalla fascia
      if (/^\d{5}(\.0+)?$/.test(String(v[0])) && v[1] && /\d-\d/.test(v[1])) { cur = isoOf(excelDay(v[0])); v = v.slice(1); }
      if (cur && v.length >= 2 && /-/.test(v[0]) && isFinite(parseFloat(v[1]))) {
        const o = out[cur] = out[cur] || {};
        o[v[0]] = (o[v[0]] || 0) + Math.round(num(v[1])); // la stessa fascia a volte compare due volte
      }
    }
    return out;
  }

  // ---------- archivio ----------
  /** Unisce un report letto nell'archivio (come smartbusiness.py importa). Restituisce { tipo, cdc, giorni: n }. */
  function unisci(arch, sheets) {
    arch.giorni = arch.giorni || {}; arch.prev = arch.prev || {};
    const t = tipo(sheets);
    if (t === 'previsioni') {
      const p = leggiPrevisioni(sheets[0].rows);
      for (const [iso, bands] of Object.entries(p)) {
        const o = arch.prev[iso] = {};
        for (const [b, g] of Object.entries(bands)) { const h = String(parseInt(b, 10)); o[h] = (o[h] || 0) + g; }
      }
      return { tipo: t, giorni: Object.keys(p).length, dal: Object.keys(p).sort()[0], al: Object.keys(p).sort().pop() };
    }
    if (t === 'fasce') {
      const { cdc, giorni } = leggiFasce(sheets[0].rows);
      for (const [iso, bands] of Object.entries(giorni)) {
        const g = arch.giorni[iso] = arch.giorni[iso] || { c: {} };
        let s = 0, n = 0; const o = new Array(24).fill(0);
        for (const [b, [sv, gv]] of Object.entries(bands)) { s += sv; n += gv; o[(parseInt(b, 10) - 5 + 24) % 24] += gv; }
        g.c[cdc] = [pyRound(s, 2), n];
        if (cdc === 'tutti') g.o = o;
      }
      const ks = Object.keys(giorni).sort();
      return { tipo: t, cdc, giorni: ks.length, dal: ks[0], al: ks[ks.length - 1] };
    }
    return { tipo: null };
  }
  /** Fino a che giorno arriva ogni serie: { tutti: 'AAAA-MM-GG', mccafe: …, previsioni: … } */
  function stato(arch) {
    const out = {};
    for (const [iso, g] of Object.entries((arch && arch.giorni) || {})) for (const c of Object.keys(g.c || {})) if (!out[c] || iso > out[c]) out[c] = iso;
    const p = Object.keys((arch && arch.prev) || {}).sort();
    if (p.length) out.previsioni = p[p.length - 1];
    out.giorniTutti = Object.values((arch && arch.giorni) || {}).filter((g) => g.c && g.c.tutti && g.c.tutti[1] > 0).length;
    return out;
  }

  // ---------- previsioni (come previsioni.py) ----------
  function carica(arch) {
    const real = new Map(), canali = new Map(), ORARI = new Map(), sb = new Map(), SB_ORA = new Map();
    for (const [iso, g] of Object.entries(arch.giorni || {})) {
      const d = dayOf(iso), c = g.c || {};
      if (c.tutti && c.tutti[1] > 0) real.set(d, [c.tutti[0], c.tutti[1]]);
      const ch = {}; let any = false;
      for (const k of Object.keys(c)) if (CANALI.includes(k)) { ch[k] = c[k]; any = true; }
      if (any) canali.set(d, ch);
      if (g.o) ORARI.set(d, g.o);
    }
    for (const [iso, hs] of Object.entries(arch.prev || {})) {
      const d = dayOf(iso); let t = 0;
      for (const v of Object.values(hs)) t += v;
      sb.set(d, t); SB_ORA.set(d, { ...hs });
    }
    // solo i giorni in cui ci sono tutti i canali scaricati almeno una volta
    const noti = new Set(); for (const v of canali.values()) for (const k of Object.keys(v)) noti.add(k);
    for (const [d, v] of [...canali]) if (![...noti].every((k) => k in v)) canali.delete(d);
    for (const d of [...ORARI.keys()]) if (!real.has(d)) ORARI.delete(d);
    return { real, sb, canali, ORARI, SB_ORA };
  }

  function Modello(real, sb, canali) {
    const minReal = Math.min(...real.keys()), minCan = canali.size ? Math.min(...canali.keys()) : null;
    const stessi = (d, oggi, n) => {
      const out = []; let x = d - 7;
      while (x >= oggi) x -= 7;
      while (out.length < n && x >= minReal) { if (real.has(x)) out.push(real.get(x)); x -= 7; }
      return out;
    };
    const metodi = (d, oggi) => {
      const m = {};
      if (sb.has(d)) m.SmartBusiness = sb.get(d);
      let v = stessi(d, oggi, 3);
      if (v.length === 3) m['ultime 3 settimane'] = mean(v.map((x) => x[1]));
      v = stessi(d, oggi, 6);
      if (v.length === 6) m['ultime 6 settimane pesate'] = v.reduce((t, x, i) => t + x[1] * (6 - i), 0) / 21;
      const ly = d - 364;
      if (real.has(ly)) {
        const ora = [], prima = [];
        for (let i = 1; i <= 28; i++) {
          const x = oggi - i;
          if (real.has(x)) { ora.push(real.get(x)[1]); if (real.has(x - 364)) prima.push(real.get(x - 364)[1]); }
        }
        if (ora.length >= 20 && prima.length >= 20) m['anno scorso x andamento'] = real.get(ly)[1] * mean(ora) / mean(prima);
      }
      return m;
    };
    const scontrino = (d, oggi) => { const v = stessi(d, oggi, 4); return v.length ? v.reduce((t, x) => t + x[0], 0) / v.reduce((t, x) => t + x[1], 0) : null; };
    const quote = (d, oggi) => {
      const giorni = []; let x = d - 7;
      while (x >= oggi) x -= 7;
      while (giorni.length < 4 && canali.size && x >= minCan) { if (canali.has(x) && real.has(x)) giorni.push(x); x -= 7; }
      if (!giorni.length) return null;
      const ts = giorni.reduce((t, g) => t + real.get(g)[0], 0), tg = giorni.reduce((t, g) => t + real.get(g)[1], 0), out = {};
      for (const c of CANALI) {
        const s_ = giorni.reduce((t, g) => t + (canali.get(g)[c] || [0, 0])[0], 0) / ts;
        const g_ = giorni.reduce((t, g) => t + (canali.get(g)[c] || [0, 0])[1], 0) / tg;
        if (s_ > 0.005 || g_ > 0.005) out[c] = { s: pyRound(s_, 3), g: pyRound(g_, 3) };
      }
      const rs = 1 - Object.values(out).reduce((t, v) => t + v.s, 0), rg = 1 - Object.values(out).reduce((t, v) => t + v.g, 0);
      if (rs > 0.01 || rg > 0.01) out.altro = { s: pyRound(Math.max(rs, 0), 3), g: pyRound(Math.max(rg, 0), 3) };
      return out;
    };
    const errori = (oggi) => {
      const err = {};
      for (let i = 1; i <= FINESTRA; i++) {
        const d = oggi - i;
        if (!real.has(d)) continue;
        const emesso = d - (weekday(d) + 1), r = real.get(d)[1];
        for (const [k, p] of Object.entries(metodi(d, emesso))) (err[k] = err[k] || []).push(Math.abs(p - r) / r);
      }
      const out = {}; for (const [k, v] of Object.entries(err)) if (v.length >= 14) out[k] = mean(v);
      return out;
    };
    const prevedi = (d, oggi, err) => {
      const m = metodi(d, oggi);
      let pesi = {};
      for (const k of Object.keys(m)) if (k in err) pesi[k] = 1 / Math.max(err[k], 0.02) ** 2;
      if (!Object.keys(pesi).length) for (const k of Object.keys(m)) pesi[k] = 1;
      if (!Object.keys(pesi).length) return null;
      const tot = Object.values(pesi).reduce((t, w) => t + w, 0);
      const gc = Object.entries(pesi).reduce((t, [k, w]) => t + m[k] * w, 0) / tot;
      const nac = scontrino(d, oggi);
      const out = { gc: pyRound(gc), sales: nac ? pyRound(gc * nac) : null, gcSB: sb.has(d) ? sb.get(d) : null,
        metodi: Object.fromEntries(Object.entries(pesi).map(([k, w]) => [k, pyRound(100 * w / tot)])) };
      const pn = Object.entries(pesi).filter(([k]) => NORMALI.includes(k));
      if (pn.length) {
        const gb = pn.reduce((t, [k, w]) => t + m[k] * w, 0) / pn.reduce((t, [, w]) => t + w, 0);
        out.base = { gc: pyRound(gb), sales: nac ? pyRound(gb * nac) : null };
      }
      const q = quote(d, oggi);
      if (q) out.canali = q;
      return out;
    };
    return { errori, prevedi };
  }

  function indici(real) {
    const out = {}, days = [...real.keys()], a = Math.min(...days), b = Math.max(...days);
    for (let d = a; d <= b; d++) {
      const vic = [-3, -2, -1, 1, 2, 3].map((i) => d + 7 * i).filter((x) => real.has(x)).map((x) => real.get(x));
      if (!real.has(d)) { if (vic.length >= 3) out[isoOf(d)] = [0, 0]; continue; }
      if (vic.length >= 3) {
        const ig = real.get(d)[1] / median(vic.map((x) => x[1])), iv = real.get(d)[0] / median(vic.map((x) => x[0]));
        if (Math.abs(ig - 1) > 0.12 || Math.abs(iv - 1) > 0.12) out[isoOf(d)] = [pyRound(ig, 2), pyRound(iv, 2)];
      }
    }
    return out;
  }
  function profilo(ORARI, oggi) {
    const out = {};
    for (let wd = 1; wd <= 7; wd++) {
      let tot = new Array(24).fill(0);
      for (let i = 1; i <= 56; i++) { const x = oggi - i; if (weekday(x) + 1 === wd && ORARI.has(x)) tot = tot.map((v, k) => v + ORARI.get(x)[k]); }
      const s = tot.reduce((t, v) => t + v, 0);
      if (s) out[String(wd)] = tot.map((v) => pyRound(v / s, 3));
    }
    return out;
  }

  /** Previsioni dall'archivio, nello stesso formato di previsioni-app.json. null se l'archivio ha troppi pochi giorni. */
  function crea(arch, creato) {
    const { real, sb, canali, ORARI, SB_ORA } = carica(arch || {});
    if (real.size < MIN_GIORNI) return null;
    const mod = Modello(real, sb, canali), maxReal = Math.max(...real.keys()), oggi = maxReal + 1;
    const err = mod.errori(oggi), lun = oggi - weekday(oggi), giorni = {};
    for (let i = 0; i < 7 * (1 + SETTIMANE); i++) {
      const d = lun + i;
      if (d < oggi) continue;
      const p = mod.prevedi(d, oggi, err);
      if (p) giorni[isoOf(d)] = p;
    }
    const reali = {};
    for (const d of [...real.keys()].sort((x, y) => x - y)) {
      if ((lun - 28 <= d && d < oggi) || (lun - 28 - 364 <= d && d < lun + 7 * (1 + SETTIMANE) - 364)) reali[isoOf(d)] = [pyRound(real.get(d)[0]), real.get(d)[1]];
    }
    const orarioSB = {};
    for (const d of [...SB_ORA.keys()].sort((x, y) => x - y)) if (d >= oggi - 7) orarioSB[isoOf(d)] = SB_ORA.get(d);
    return { tipo: 'previsioni-turni', creato: creato || new Date().toISOString().slice(0, 16), datiFinoA: isoOf(maxReal),
      errori: Object.fromEntries(Object.entries(err).map(([k, v]) => [k, pyRound(100 * v, 1)])), giorni,
      indici: indici(real), profiloOrario: profilo(ORARI, oggi), orarioSB, reali };
  }

  /**
   * Tiene solo quello che serve al calcolo (l'archivio viaggia con i dati del locale): vendite e GC del giorno
   * per 2 anni (confronto con l'anno scorso e giorni speciali), GC ora per ora e previsioni SmartBusiness
   * per le ultime 10 settimane (profilo orario, pesi dei metodi) e per il futuro.
   */
  function pota(arch) {
    const ks = Object.keys(arch.giorni || {}).sort();
    if (!ks.length) return arch;
    const ultimo = dayOf(ks[ks.length - 1]);
    for (const k of ks) {
      const d = dayOf(k);
      if (d < ultimo - 730) { delete arch.giorni[k]; continue; }
      if (d < ultimo - 70) delete arch.giorni[k].o;
      for (const c of Object.values(arch.giorni[k].c || {})) c[0] = pyRound(c[0], 2);
    }
    for (const k of Object.keys(arch.prev || {})) if (dayOf(k) < ultimo - 70) delete arch.prev[k];
    return arch;
  }

  root.TurniSB = { tipo, leggiFasce, leggiPrevisioni, unisci, stato, crea, pota, pyRound, MIN_GIORNI };
})(typeof window !== 'undefined' ? window : globalThis);
