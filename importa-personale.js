/*
 * Personale da file Excel: si carica un riepilogo orari della settimana (come quello che esporta l'app:
 * fogli Manager, Hospitality, Crew, Doppi; righe = persone, colonne = lunedì…domenica, caselle "7:30 14:30" o RIPOSO)
 * e l'app propone le persone con ruolo e ore della settimana. Si controlla e si conferma.
 * Il file si legge nel browser, senza librerie esterne e senza mandarlo da nessuna parte.
 */
(function () {
  'use strict';

  // ---------- lettura del file .xlsx (è un archivio zip di file XML) ----------
  async function unzip(buf) {
    const v = new DataView(buf), u8 = new Uint8Array(buf), out = {};
    let e = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('Il file non è un Excel (.xlsx) valido.');
    let p = v.getUint32(e + 16, true);
    const n = v.getUint16(e + 10, true), dec = new TextDecoder();
    for (let k = 0; k < n; k++) {
      if (v.getUint32(p, true) !== 0x02014b50) break;
      const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
      const nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      p += 46 + nl + xl + cl;
      if (!/\.(xml|rels)$/.test(name)) continue;
      const start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
      const data = u8.subarray(start, start + size);
      // si decomprime solo quando serve (i file grandi hanno fogli che non leggiamo)
      out[name] = async () => {
        if (method === 0) return dec.decode(data);
        if (typeof DecompressionStream === 'undefined') throw new Error('Questo browser è troppo vecchio per leggere il file: usa Chrome o Safari aggiornati.');
        return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
      };
    }
    return out;
  }
  const xml = (t) => new DOMParser().parseFromString(t, 'application/xml');
  const tags = (node, name) => [...node.getElementsByTagNameNS('*', name)];
  const colIndex = (ref) => { const m = /^([A-Z]+)/.exec(ref || ''); let n = 0; for (const ch of m ? m[1] : 'A') n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

  /** Fogli del file: [{ name, rows: [[testo, …], …] }]. filtro(nome) = quali fogli leggere (tutti se manca). */
  async function leggiExcel(buf, filtro) {
    const z = await unzip(buf), f = {};
    for (const k of ['xl/workbook.xml', 'xl/sharedStrings.xml', 'xl/_rels/workbook.xml.rels']) if (z[k]) f[k] = await z[k]();
    if (!f['xl/workbook.xml']) throw new Error('Il file non è un Excel (.xlsx) valido.');
    const shared = f['xl/sharedStrings.xml'] ? tags(xml(f['xl/sharedStrings.xml']), 'si').map((si) => tags(si, 't').map((t) => t.textContent).join('')) : [];
    const rels = {};
    if (f['xl/_rels/workbook.xml.rels']) for (const r of tags(xml(f['xl/_rels/workbook.xml.rels']), 'Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target');
    const sheets = [];
    for (const s of tags(xml(f['xl/workbook.xml']), 'sheet')) {
      if (filtro && !filtro(s.getAttribute('name') || '')) continue;
      const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let target = rels[rid] || '';
      target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
      const doc = z[target] ? await z[target]() : null; if (!doc) continue;
      const rows = [];
      for (const r of tags(xml(doc), 'row')) {
        const ri = (+r.getAttribute('r') || rows.length + 1) - 1, row = rows[ri] = rows[ri] || [];
        for (const c of tags(r, 'c')) {
          const t = c.getAttribute('t'), vEl = tags(c, 'v')[0];
          let val = '';
          if (t === 's') val = shared[+(vEl ? vEl.textContent : -1)] || '';
          else if (t === 'inlineStr') val = tags(c, 't').map((x) => x.textContent).join('');
          else if (vEl) val = vEl.textContent;
          row[colIndex(c.getAttribute('r'))] = String(val).trim();
        }
      }
      sheets.push({ name: s.getAttribute('name') || '', rows: Array.from(rows, (r) => Array.from(r || [], (x) => x || '')) });
    }
    return sheets;
  }


  // ---------- lettura del file .xls (formato Excel 97–2003: archivio "OLE" con dentro il flusso Workbook) ----------
  function oleStream(buf, wanted) {
    const v = new DataView(buf);
    if (v.getUint32(0, true) !== 0xe011cfd0) throw new Error('Il file non è un Excel valido.');
    const ss = 1 << v.getUint16(30, true), mss = 1 << v.getUint16(32, true);
    const sec = (n) => 512 + n * ss;
    // tabella dei settori (FAT): i primi 109 indirizzi sono nell'intestazione, gli altri nella catena DIFAT
    const difat = [];
    for (let i = 0; i < 109; i++) { const x = v.getInt32(76 + i * 4, true); if (x >= 0) difat.push(x); }
    let dn = v.getInt32(68, true), guard = 0;
    while (dn >= 0 && guard++ < 10000) { for (let i = 0; i < ss / 4 - 1; i++) { const x = v.getInt32(sec(dn) + i * 4, true); if (x >= 0) difat.push(x); } dn = v.getInt32(sec(dn) + ss - 4, true); }
    const fat = new Int32Array(difat.length * ss / 4);
    difat.forEach((d, k) => { for (let i = 0; i < ss / 4; i++) fat[k * ss / 4 + i] = v.getInt32(sec(d) + i * 4, true); });
    const chain = (start) => { const out = []; let n = start, g = 0; while (n >= 0 && n < fat.length && g++ < 1e6) { out.push(n); n = fat[n]; } return out; };
    const read = (start, size) => { const out = new Uint8Array(size); let o = 0; for (const n of chain(start)) { const len = Math.min(ss, size - o); if (len <= 0) break; out.set(new Uint8Array(buf, sec(n), len), o); o += len; } return out; };
    // cartella: voci da 128 byte (nome UTF-16, tipo, primo settore, dimensione)
    const dirSecs = chain(v.getInt32(48, true)), entries = [];
    for (const n of dirSecs) for (let i = 0; i < ss / 128; i++) {
      const o = sec(n) + i * 128, nl = v.getUint16(o + 64, true);
      let name = ''; for (let k = 0; k < Math.max(0, nl / 2 - 1); k++) name += String.fromCharCode(v.getUint16(o + k * 2, true));
      entries.push({ name, type: v.getUint8(o + 66), start: v.getInt32(o + 116, true), size: v.getUint32(o + 120, true) });
    }
    const e = entries.find((x) => wanted.includes(x.name));
    if (!e) throw new Error('Nel file non trovo i fogli di Excel.');
    if (e.size >= v.getUint32(56, true)) return read(e.start, e.size);
    // flusso piccolo: sta nel "mini stream" della voce radice
    const root = entries[0], mini = read(root.start, root.size), mfat = [];
    const mf = chain(v.getInt32(60, true));
    for (const n of mf) for (let i = 0; i < ss / 4; i++) mfat.push(v.getInt32(sec(n) + i * 4, true));
    const out = new Uint8Array(e.size); let n = e.start, o = 0;
    while (n >= 0 && o < e.size) { const len = Math.min(mss, e.size - o); out.set(mini.subarray(n * mss, n * mss + len), o); o += len; n = mfat[n]; }
    return out;
  }
  /** Fogli di un file .xls: stessa forma di leggiExcel. Si leggono testi e numeri (anche i risultati delle formule). */
  function leggiXls(buf, filtro) {
    const wb = oleStream(buf, ['Workbook', 'Book']), v = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
    const recs = []; // [tipo, inizio, lunghezza]
    for (let p = 0; p + 4 <= wb.length;) { const t = v.getUint16(p, true), l = v.getUint16(p + 2, true); recs.push([t, p + 4, l]); p += 4 + l; }
    const latin = new TextDecoder('windows-1252');
    // testo BIFF8: lunghezza, opzioni (1 = UTF-16), eventuali parti rich text / asiatiche
    const sst = [], sheets = [];
    const rkVal = (x) => { let n = (x & 2) ? (x >> 2) : (() => { const b = new DataView(new ArrayBuffer(8)); b.setUint32(4, x & 0xfffffffc, true); return b.getFloat64(0, true); })(); return (x & 1) ? n / 100 : n; };
    for (let i = 0; i < recs.length; i++) {
      const [t, o, l] = recs[i];
      if (t === 0x85) { // BOUNDSHEET: nome e posizione del foglio
        const pos = v.getUint32(o, true), kind = v.getUint8(o + 5), cch = v.getUint8(o + 6), fl = v.getUint8(o + 7);
        const name = fl & 1 ? new TextDecoder('utf-16le').decode(wb.subarray(o + 8, o + 8 + cch * 2)) : latin.decode(wb.subarray(o + 8, o + 8 + cch));
        if (kind === 0) sheets.push({ name, pos, rows: [] });
      } else if (t === 0xfc) { // SST: tutti i testi, con i CONTINUE che seguono
        const parts = [[o, l]]; let j = i + 1;
        while (j < recs.length && recs[j][0] === 0x3c) { parts.push([recs[j][1], recs[j][2]]); j++; }
        let pi = 0, p = o + 8, end = o + l;
        const need = () => { if (p >= end && pi + 1 < parts.length) { pi++; p = parts[pi][0]; end = p + parts[pi][1]; return true; } return false; };
        const total = v.getUint32(o + 4, true);
        for (let k = 0; k < total; k++) {
          need(); if (p >= end) break;
          const cch = v.getUint16(p, true); let fl = v.getUint8(p + 2); p += 3;
          let rich = 0, ext = 0;
          if (fl & 8) { rich = v.getUint16(p, true); p += 2; }
          if (fl & 4) { ext = v.getUint32(p, true); p += 4; }
          let str = '', left = cch;
          while (left > 0) {
            if (p >= end) { if (!need()) break; fl = v.getUint8(p); p += 1; } // nel CONTINUE il testo riprende con un nuovo byte di opzioni
            const wide = fl & 1, can = Math.min(left, Math.floor((end - p) / (wide ? 2 : 1)));
            str += wide ? new TextDecoder('utf-16le').decode(wb.subarray(p, p + can * 2)) : latin.decode(wb.subarray(p, p + can));
            p += can * (wide ? 2 : 1); left -= can;
          }
          let skip = rich * 4 + ext;
          while (skip > 0) { if (p >= end && !need()) break; const d = Math.min(skip, end - p); p += d; skip -= d; }
          sst.push(str);
        }
        i = j - 1;
      }
    }
    const byPos = new Map(sheets.map((s) => [s.pos, s]));
    let cur = null;
    const put = (r, c, val) => { if (!cur) return; const row = cur.rows[r] = cur.rows[r] || []; row[c] = String(val).trim(); };
    const num = (x) => String(Math.round(x * 1e9) / 1e9);
    for (let i = 0; i < recs.length; i++) {
      const [t, o, l] = recs[i];
      if (t === 0x809) { cur = byPos.get(o - 4) || null; continue; } // BOF: inizio di un foglio
      if (!cur) continue;
      if (t === 0x0a) { cur = null; continue; } // EOF
      const r = v.getUint16(o, true), c = v.getUint16(o + 2, true);
      if (t === 0xfd) put(r, c, sst[v.getUint32(o + 6, true)] || '');
      else if (t === 0x203) put(r, c, num(v.getFloat64(o + 6, true)));
      else if (t === 0x27e) put(r, c, num(rkVal(v.getInt32(o + 6, true))));
      else if (t === 0xbd) { const last = v.getUint16(o + l - 2, true); for (let k = 0; c + k <= last; k++) put(r, c + k, num(rkVal(v.getInt32(o + 4 + k * 6 + 2, true)))); }
      else if (t === 0x204) { const cch = v.getUint16(o + 6, true), fl = v.getUint8(o + 8); put(r, c, fl & 1 ? new TextDecoder('utf-16le').decode(wb.subarray(o + 9, o + 9 + cch * 2)) : latin.decode(wb.subarray(o + 9, o + 9 + cch))); }
      else if (t === 0x06) { // FORMULA: risultato già calcolato (numero, oppure testo nel record STRING che segue)
        if (v.getUint16(o + 12, true) === 0xffff) {
          if (v.getUint8(o + 6) === 0 && recs[i + 1] && recs[i + 1][0] === 0x207) {
            const so = recs[i + 1][1], cch = v.getUint16(so, true), fl = v.getUint8(so + 2);
            put(r, c, fl & 1 ? new TextDecoder('utf-16le').decode(wb.subarray(so + 3, so + 3 + cch * 2)) : latin.decode(wb.subarray(so + 3, so + 3 + cch)));
          }
        } else put(r, c, num(v.getFloat64(o + 6, true)));
      }
    }
    return sheets.filter((s) => !filtro || filtro(s.name)).map((s) => ({ name: s.name, rows: Array.from(s.rows, (r) => Array.from(r || [], (x) => x || '')) }));
  }
  /** .xlsx oppure .xls, riconosciuti dal contenuto */
  async function leggiFile(buf, filtro) {
    const b = new Uint8Array(buf, 0, 4);
    if (b[0] === 0xd0 && b[1] === 0xcf) return leggiXls(buf, filtro);
    return leggiExcel(buf, filtro);
  }

  // ---------- dal foglio alle persone ----------
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  const GIORNI = ['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM'];
  const SEZ = [['DOPPI', 'DOPPI'], ['MANAGER', 'MANAGER'], ['HOSPITALITY', 'HOSPITALITY'], ['CREW', 'CREW']];
  const sezioneDi = (sh) => {
    const testo = norm(sh.name) + ' ' + sh.rows.slice(0, 4).map((r) => r.map(norm).join(' ')).join(' ');
    const s = SEZ.find(([k]) => testo.includes(k));
    return s ? s[1] : null;
  };
  /** Orari scritti in una casella: "7:30 14:30", "7.30-14.30", "13-16", anche due turni nella stessa casella. */
  function turni(txt) {
    const out = [], re = /(\d{1,2})(?:[:.,](\d{2}))?\s*(?:-|–|—|\s)\s*(\d{1,2})(?:[:.,](\d{2}))?/g;
    let m;
    while ((m = re.exec(String(txt)))) {
      const a = +m[1] * 60 + +(m[2] || 0); let b = +m[3] * 60 + +(m[4] || 0);
      if (+m[1] > 24 || +m[3] > 24) continue;
      if (b <= a) b += 1440;
      if (b - a >= 60 && b - a <= 16 * 60) out.push({ start: a, end: b });
    }
    return out;
  }
  /**
   * Elenchi del personale (es. fogli "Elenco CREW"): una riga di intestazione con il ruolo e accanto "ORE",
   * sotto i nomi con le ore di contratto. Se ci sono, valgono più degli orari della settimana.
   */
  function elenchi(sheets) {
    const map = new Map();
    for (const sh of sheets) {
      for (let r = 0; r < Math.min(sh.rows.length, 15); r++) {
        const row = sh.rows[r] || [];
        const c = row.findIndex((x, i) => SEZ.some(([k]) => norm(x) === k) && /^ORE\b/.test(norm(row[i + 1])));
        if (c < 0) continue;
        const sez = SEZ.find(([k]) => norm(row[c]) === k)[1];
        for (const rr of sh.rows.slice(r + 1)) {
          const name = rr && rr[c], ore = rr && parseFloat(String(rr[c + 1]).replace(',', '.'));
          if (!name || !/[A-Za-zÀ-ÿ]{2}/.test(name)) continue;
          const key = norm(name);
          if (!map.has(key)) { const parts = name.replace(/\s+/g, ' ').trim().split(' '); map.set(key, { key, lastName: parts[0], firstName: parts.slice(1).join(' '), type: null, minutes: 0, long: 0, rest: [], doppi: 0, absent: 0, shifts: 0, contratto: true }); }
          const p = map.get(key);
          if (sez === 'DOPPI') p.doppi = Math.max(1, Math.round((ore || 3) / 3));
          else { p.type = p.type || sez; if (ore > 0) p.minutes = Math.round(ore * 60); }
        }
        break;
      }
    }
    return [...map.values()].filter((p) => p.type);
  }
  /** Le persone di tutti i fogli: [{ key, lastName, firstName, type, minutes, rest: [giorni], doppi, absent }] */
  function persone(sheets) {
    const el = elenchi(sheets);
    if (el.length) return el;
    const map = new Map();
    for (const sh of sheets) {
      const sez = sezioneDi(sh) || 'CREW';
      // riga dei giorni: quella con più giorni diversi (a parità, la prima), almeno 5
      const nDays = (r) => (r ? GIORNI.filter((g) => r.some((c) => norm(c).startsWith(g) && norm(c).length <= 10)).length : 0);
      let hi = -1; sh.rows.forEach((r, i) => { if (nDays(r) >= 5 && (hi < 0 || nDays(r) > nDays(sh.rows[hi]))) hi = i; });
      if (hi < 0) continue;
      const cols = GIORNI.map((g) => sh.rows[hi].findIndex((c) => norm(c).startsWith(g) && norm(c).length <= 10));
      const first = Math.min(...cols.filter((c) => c >= 0));
      for (const r of sh.rows.slice(hi + 1)) {
        if (!r) continue;
        const name = r.slice(0, first).find((c) => c && /[A-Za-zÀ-ÿ]{2}/.test(c) && !/^(totale|note)/i.test(c));
        if (!name) continue;
        const key = norm(name);
        if (!map.has(key)) {
          const parts = name.replace(/\s+/g, ' ').trim().split(' ');
          map.set(key, { key, lastName: parts[0], firstName: parts.slice(1).join(' '), type: null, minutes: 0, long: 0, rest: [], doppi: 0, absent: 0, shifts: 0 });
        }
        const p = map.get(key);
        p.score = p.score || {};
        cols.forEach((c, i) => {
          if (c < 0) return;
          const txt = r[c] || '', n = norm(txt), ts = turni(txt);
          // orari scritti come ore di Excel (frazioni di giorno): inizio in questa colonna e fine nella successiva
          const fr = (x) => (/^\d*\.?\d+$/.test(String(x || '')) && +x > 0 && +x <= 1 ? Math.round(+x * 1440) : null);
          if (!ts.length && fr(txt) != null && fr(r[c + 1]) != null) { let a = fr(txt), b = fr(r[c + 1]); if (b <= a) b += 1440; if (b - a >= 60 && b - a <= 960) ts.push({ start: a, end: b }); }
          // i doppi sono in più rispetto al contratto: non si sommano alle ore
          if (sez === 'DOPPI') { if (ts.length) p.doppi++; }
          else for (const t of ts) { p.minutes += t.end - t.start; p.long += t.end - t.start >= 390 ? 1 : 0; p.shifts++; }
          // ruolo: il foglio in cui la persona ha più caselle piene (orari, riposi, assenze), non le "X"
          if (sez !== 'DOPPI' && (ts.length || /RIPOSO|MALATTIA|FERIE|INFORTUNIO|ASSENT|PERMESSO/.test(n))) p.score[sez] = (p.score[sez] || 0) + 1;
          if (sez !== 'DOPPI' && n.startsWith('RIPOSO')) p.rest.push(i + 1);
          if (sez !== 'DOPPI' && /MALATTIA|FERIE|INFORTUNIO|ASSENT|PERMESSO/.test(n)) p.absent++;
        });
      }
    }
    return [...map.values()].map((p) => { const sc = Object.entries(p.score || {}).sort((a, b) => b[1] - a[1]); const { score, ...q } = p; return { ...q, type: sc.length ? sc[0][0] : 'CREW' }; })
      .filter((p) => p.type !== 'CREW' || p.shifts || p.rest.length || p.absent || p.doppi || !p.score || Object.keys(p.score).length);
  }

  window.ImportaPersonale = { leggiExcel, leggiXls, leggiFile, persone, elenchi, turni, norm };
})();
