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
      if (method === 0) out[name] = dec.decode(data);
      else if (method === 8) {
        if (typeof DecompressionStream === 'undefined') throw new Error('Questo browser è troppo vecchio per leggere il file: usa Chrome o Safari aggiornati.');
        const s = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        out[name] = await new Response(s).text();
      }
    }
    return out;
  }
  const xml = (t) => new DOMParser().parseFromString(t, 'application/xml');
  const tags = (node, name) => [...node.getElementsByTagNameNS('*', name)];
  const colIndex = (ref) => { const m = /^([A-Z]+)/.exec(ref || ''); let n = 0; for (const ch of m ? m[1] : 'A') n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

  /** Fogli del file: [{ name, rows: [[testo, …], …] }] */
  async function leggiExcel(buf) {
    const f = await unzip(buf);
    if (!f['xl/workbook.xml']) throw new Error('Il file non è un Excel (.xlsx) valido.');
    const shared = f['xl/sharedStrings.xml'] ? tags(xml(f['xl/sharedStrings.xml']), 'si').map((si) => tags(si, 't').map((t) => t.textContent).join('')) : [];
    const rels = {};
    if (f['xl/_rels/workbook.xml.rels']) for (const r of tags(xml(f['xl/_rels/workbook.xml.rels']), 'Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target');
    const sheets = [];
    for (const s of tags(xml(f['xl/workbook.xml']), 'sheet')) {
      const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let target = rels[rid] || '';
      target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
      const doc = f[target]; if (!doc) continue;
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
  /** Le persone di tutti i fogli: [{ key, lastName, firstName, type, minutes, rest: [giorni], doppi, absent }] */
  function persone(sheets) {
    const map = new Map();
    for (const sh of sheets) {
      const sez = sezioneDi(sh) || 'CREW';
      const hi = sh.rows.findIndex((r) => r && GIORNI.filter((g) => r.some((c) => norm(c).startsWith(g) && norm(c).length <= 10)).length >= 5);
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
        if (sez !== 'DOPPI') p.type = p.type || sez;
        cols.forEach((c, i) => {
          if (c < 0) return;
          const txt = r[c] || '', n = norm(txt), ts = turni(txt);
          // i doppi sono in più rispetto al contratto: non si sommano alle ore
          if (sez === 'DOPPI') { if (ts.length) p.doppi++; }
          else for (const t of ts) { p.minutes += t.end - t.start; p.long += t.end - t.start >= 390 ? 1 : 0; p.shifts++; }
          if (sez !== 'DOPPI' && n.startsWith('RIPOSO')) p.rest.push(i + 1);
          if (sez !== 'DOPPI' && /MALATTIA|FERIE|INFORTUNIO|ASSENTE|PERMESSO/.test(n)) p.absent++;
        });
      }
    }
    return [...map.values()].map((p) => ({ ...p, type: p.type || 'CREW' }));
  }

  window.ImportaPersonale = { leggiExcel, persone, turni, norm };
})();
