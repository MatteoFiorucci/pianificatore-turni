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
  const AREAS = [['FC', 'Front Counter'], ['PR', 'Production'], ['MC', 'McCafé']];
  const PART_TXT = { B: 'Breakfast', L: 'Lunch', A: 'Afternoon', D: 'Dinner' };
  /** Fascia della giornata di un'ora (come nel foglio aziendale). */
  const partOf = (h) => (h <= 10 ? 'B' : h <= 14 ? 'L' : h <= 18 ? 'A' : 'D');
  // postazioni dell'app da cui prendere le persone, in ordine di preferenza
  const STATION_OF = (code) => {
    if (code[0] === 'M') return ['MCCAFE'];
    if (code[0] === 'T') return ['SERVIZIO', 'HOSPITALITY', 'FRONT'];
    if (code === 'F1') return ['CUCINA', 'FRONT'];
    return POS[code][1] === 'PR' ? ['CUCINA'] : ['FRONT', 'SERVIZIO', 'HOSPITALITY'];
  };

  /** Elenco ordinato delle postazioni di un giorno (1–7) e fascia: [{ code, name, area, gc, n }]. */
  function list(vlh, dow, part) {
    const g = vlh && vlh.giorni && vlh.giorni[String(dow)];
    if (!g || !g[part]) return null;
    const out = [['FO', 0], ['MO', 0], ['I1', 0], ...g[part].split(',').map((x) => { const [c, v] = x.split(':'); return [c, +v]; })];
    return out.map(([code, gc], i) => ({ code, gc, n: i + 1, name: (POS[code] || [code])[0], area: (POS[code] || [0, 'FC'])[1] }));
  }
  /** Postazioni aperte con quei GC e le tre successive. */
  function forHour(vlh, dow, h, gc) {
    const l = list(vlh, dow, partOf(h));
    if (!l) return null;
    const open = l.filter((p) => p.gc <= (gc || 0));
    return { part: partOf(h), open, next: l.slice(open.length, open.length + 3) };
  }

  /**
   * Proposta di nomi: per ogni ora mette le persone in turno sulle postazioni aperte, secondo la loro area,
   * tenendo la stessa persona sulla stessa postazione da un'ora all'altra quando possibile.
   * people(h) → [{ id, name, station }]; hours → [h...]; open(h) → [postazioni]. Restituisce { h: { code: nome } }.
   */
  function assign(hours, open, people) {
    const out = {}, last = {}; // code → id dell'ora prima
    for (const h of hours) {
      const pos = open(h), avail = people(h), used = new Set(), res = {};
      out[h] = res;
      const take = (code, id) => { const p = avail.find((x) => x.id === id); used.add(id); res[code] = p.name; last[code] = id; };
      for (const p of pos) if (last[p.code] != null && avail.some((x) => x.id === last[p.code] && !used.has(x.id))) take(p.code, last[p.code]);
      for (const p of pos) {
        if (res[p.code]) continue;
        for (const st of STATION_OF(p.code)) {
          const c = avail.find((x) => x.station === st && !used.has(x.id));
          if (c) { take(p.code, c.id); break; }
        }
      }
      for (const k of Object.keys(last)) if (!pos.some((p) => p.code === k)) delete last[k];
    }
    return out;
  }

  root.TurniVLH = { POS, AREAS, PART_TXT, partOf, list, forHour, assign };
})(typeof window !== 'undefined' ? window : globalThis);
