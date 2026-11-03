/*
 * Turni dei manager: generatore e controlli, separati da quelli di crew e hospitality.
 * Nessun nome qui dentro: i manager e le loro condizioni sono nei dati del locale (cifrati online).
 *
 * state.managers = [{ id, lastName, firstName, role: 'RDM' | 'SHIFT', weeklyMinutes, active,
 *                     orderDays: [giorni 1–7 dell'ordine: entra entro le 11:30], centralWeekly: bool (1 centrale lun–gio),
 *                     flexDays: [giorni 1–7 con orario flessibile, circa 9:00–16:30] }]
 * state.mgrShifts = [{ id, managerId, day, start, end, role }]   role: A apertura, C chiusura, CEN centrale,
 *                     D delivery (secondo manager alle 7:30), C2 secondo in chiusura, X rinforzo, M2 secondo in apertura,
 *                     F orario flessibile (circa 9:00–16:30)
 * state.config.mgrDelivery = [2, 5]   giorni con la delivery (secondo manager alle 7:30)
 * state.config.carpiStart = 'AAAA-MM-GG'   un martedì di smontaggio della Carpigiani (poi ogni 2 settimane)
 */
(function (root) {
  'use strict';
  const T = root.Turni;
  const OPEN = 450, CLOSE = 1290;            // 7:30 – 21:30
  const REST12 = 720, REST36 = 2160, ORDER_BY = 690; // stacco 12h, 36h con riposo; ordine: entra entro le 11:30
  const DAY = 1440;
  const ROLE_TXT = { A: 'Apertura', C: 'Chiusura', CEN: 'Centrale', D: 'Delivery', C2: 'Secondo in chiusura', X: 'Rinforzo', M2: 'Secondo in apertura', F: 'Flessibile' };
  // durata minima/massima e durata preferita di ogni ruolo (minuti)
  const LEN = { A: [360, 450, 420], C: [360, 450, 420], CEN: [330, 450, 420], D: [360, 450, 420], M2: [360, 450, 420], C2: [300, 420, 390], X: [270, 420, 360], F: [390, 480, 450] };
  // centrale: copre sempre le ore intermedie del pomeriggio (15:00–18:00), così i crew stanno sui rush
  const CEN_STARTS = [690, 660, 720, 675, 705], MID_END = 1080;
  const isMorning = (r) => r === 'A' || r === 'D' || r === 'M2';
  const isEvening = (r) => r === 'C' || r === 'C2' || r === 'X';

  const mgrs = (state) => (state.managers || []).filter((m) => m.active !== false);
  const weekShifts = (state, ws) => (state.mgrShifts || []).filter((s) => s.day >= ws && s.day <= ws + 6);
  const deliveryDays = (state) => state.config.mgrDelivery || [2, 5];
  /** La Carpigiani si smonta il martedì delle settimane "pari" rispetto alla data indicata (ogni 2 settimane). */
  function carpiWeek(state, ws) {
    const c = state.config.carpiStart; if (!c) return false;
    const w0 = T.mondayOf(T.toDay(c));
    return (((ws - w0) / 7) % 2 + 2) % 2 === 0;
  }

  /** Orario di un turno del ruolo r con durata len. */
  function timesFor(r, len, k, maxStart = 1440) {
    switch (r) {
      case 'A': return [OPEN, OPEN + len];
      case 'C': return [CLOSE - len, CLOSE];
      case 'C2': return [Math.max(840, 1260 - len), Math.max(840, 1260 - len) + len];
      case 'X': return [1260 - len, 1260];
      case 'D': case 'M2': return [OPEN, OPEN + len];
      case 'F': return [540, 540 + len];
      default: { const st = Math.min(Math.max(CEN_STARTS[k % CEN_STARTS.length], MID_END - len), 1170 - len, maxStart); return [st, st + len]; }
    }
  }

  /** Quanti manager servono come minimo nel giorno k (0 = lunedì). */
  function needOn(state, ws, k) {
    const d = k + 1, carpi = carpiWeek(state, ws);
    return 2 + (deliveryDays(state).includes(d) ? 1 : 0) + (carpi && (d === 2 || d === 3) ? 1 : 0);
  }
  const REST_DAYS = [1, 2, 3, 4]; // il riposo dei manager è da lunedì a giovedì

  /** Ruoli che servono in un giorno, dato quanti manager ci sono. */
  function rolesFor(state, ws, k, n) {
    const d = k + 1, deliv = deliveryDays(state).includes(d), carpi = carpiWeek(state, ws);
    const base = ['A', 'C'];
    const extra = [];
    if (carpi && d === 2) extra.push('C2');
    if (deliv) extra.push('D');
    if (carpi && d === 3) extra.push('M2');
    while (base.length + extra.length < n) extra.push(d >= 5 ? (extra.includes('CEN') ? 'X' : 'CEN') : 'CEN');
    return [...base, ...extra].slice(0, Math.max(n, 2));
  }

  /** Turni manager della settimana ws: vincoli di stacco con la settimana prima (e dopo, se già fatta). */
  function neighbours(state, ws) {
    return (state.mgrShifts || []).filter((s) => (s.day >= ws - 3 && s.day < ws) || (s.day > ws + 6 && s.day <= ws + 9));
  }
  const absStart = (s) => s.day * DAY + s.start, absEnd = (s) => s.day * DAY + s.end;
  /** Stacco tra due turni di una persona: 11 ore tra giorni vicini, 36 se in mezzo c'è un giorno libero. */
  function gapOk(a, b) {
    if (b.day <= a.day) return true;
    const need = b.day - a.day === 1 ? REST12 : REST36;
    return absStart(b) - absEnd(a) >= need;
  }

  /** Ore lavorate e ore da fare (contratto) di un manager nella settimana; ferie e assenze tolgono 1/6 a giorno. */
  function targetOf(state, m, ws) {
    const days = [0, 1, 2, 3, 4, 5, 6].map((k) => ws + k);
    const abs = days.filter((d) => (state.absences || []).some((a) => a.employeeId === m.id && d >= a.from && d <= a.to)).length;
    return Math.max(0, Math.round((m.weeklyMinutes || 2400) * (6 - Math.min(6, abs)) / 6));
  }
  const absentOn = (state, m, d) => (state.absences || []).some((a) => a.employeeId === m.id && d >= a.from && d <= a.to)
    || (state.eventi && T.closureOf && (T.closureOf(state.eventi, d) || {}).full);

  /**
   * Genera la settimana dei manager. Prova molte combinazioni (giorno di riposo di ognuno, ruolo di ogni giorno)
   * e tiene la migliore secondo i controlli. Restituisce { shifts, problems }.
   */
  function generate(state, ws, opts = {}) {
    const team = mgrs(state);
    if (!team.length) return { shifts: [], problems: [{ sev: 'ERROR', msg: 'Nessun manager: aggiungili nella scheda Manager.' }] };
    const keep = opts.keep ? weekShifts(state, ws) : [];
    const keepKey = new Set(keep.map((s) => s.managerId + '|' + s.day));
    const hist = (state.mgrShifts || []).filter((s) => s.day >= ws - 21 && s.day < ws);
    const nb = neighbours(state, ws);
    let seed = (ws * 7919 + (opts.seed || 1)) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    // quante volte nelle 3 settimane prima ognuno ha fatto ogni ruolo nel weekend (ven–dom), per la rotazione
    const wkHist = new Map();
    for (const s of hist) if (T.dow(s.day) >= 5) { const k = s.managerId + '|' + kindOf(s); wkHist.set(k, (wkHist.get(k) || 0) + 1); }

    let best = null;
    const tries = opts.tries || 500;
    for (let t = 0; t < tries; t++) {
      // 1. giorno di riposo: uno a testa da lunedì a giovedì, mai nei giorni dell'ordine; in ogni giorno restano
      //    abbastanza manager (apertura, chiusura, delivery, Carpigiani); meglio un riposo per giorno
      const restOf = new Map();
      const used = new Map();
      let ok = true;
      for (const m of shuffle([...team])) {
        const room = (d) => team.length - (used.get(d) || 0) - 1 >= needOn(state, ws, d - 1);
        const cand = shuffle(REST_DAYS.filter((d) => room(d) && !(m.orderDays || []).includes(d)))
          .sort((a, b) => (used.get(a) || 0) - (used.get(b) || 0) + ((m.flexDays || []).includes(a) - (m.flexDays || []).includes(b)) * 0.5);
        const pick = cand[0] ?? REST_DAYS.filter(room)[0];
        if (pick == null) { ok = false; break; }
        restOf.set(m.id, pick); used.set(pick, (used.get(pick) || 0) + 1);
      }
      if (!ok) continue;
      // 2. ruoli giorno per giorno
      const plan = []; // { m, k, role }
      const lastRole = new Map(); // id -> { k, role }
      // la settimana prima conta per gli stacchi (es. chiude domenica → lunedì non apre)
      for (const s of nb.filter((x) => x.day < ws).sort((a, b) => a.day - b.day)) lastRole.set(s.managerId, { k: s.day - ws, role: s.role || (s.end >= 1260 ? 'C' : s.start <= 510 ? 'A' : 'CEN') });
      let bad = 0;
      for (let k = 0; k < 7; k++) {
        const d = ws + k;
        const present = team.filter((m) => restOf.get(m.id) !== k + 1 && !absentOn(state, m, d));
        const roles = rolesFor(state, ws, k, present.length);
        // assegna: prima chi deve aprire, poi gli altri a caso tra i ruoli compatibili
        let bestDay = null;
        for (let p = 0; p < 24; p++) {
          const special = (m) => (m.orderDays || []).includes(k + 1) || (m.flexDays || []).includes(k + 1) || (m.orderDays || []).includes(((k + 2) % 7) + 1);
          const order = shuffle([...present]).sort((a, b) => special(b) - special(a));
          const free = [...roles];
          const asg = [];
          let sc = 0;
          for (const m of order) {
            const prev = lastRole.get(m.id);
            const okRole = (r) => {
              // giorno dell'ordine: entra entro le 11:30, quindi niente turni della sera
              if ((m.orderDays || []).includes(k + 1) && isEvening(r)) return false;
              // il giorno prima dell'ordine niente sera: il giorno dopo deve poter entrare presto
              if ((m.orderDays || []).includes(((k + 1) % 7) + 1) && isEvening(r)) return false;
              // due giorni prima dell'ordine niente sera se domani lavorano tutti (non c'è un centrale libero)
              if (k < 6 && (m.orderDays || []).includes(((k + 2) % 7) + 1) && isEvening(r) && needOn(state, ws, k + 1) >= team.length) return false;
              if (prev && isEvening(prev.role) && isMorning(r) && (k - prev.k === 1 || k - prev.k === 2)) return false; // stacco 12h / 36h
              if (prev && prev.role === 'C' && prev.k === k - 1 && r === 'CEN' && (m.flexDays || []).includes(k + 1)) return false; // 21:30 → 9:00 sono meno di 12 ore
              return true;
            };
            const choices = free.filter(okRole);
            if (!choices.length) { sc += 50; asg.push([m, free.shift() || 'CEN']); continue; }
            // preferenze: centrale settimanale, rimontaggio Carpigiani, rotazione del weekend, varietà
            const w = (r) => {
              let v = rnd() * 0.8;
              if (m.centralWeekly && k <= 3 && r === 'CEN') v -= 2;
              if ((m.flexDays || []).includes(k + 1) && r === 'CEN') v -= 2;
              if ((m.orderDays || []).includes(k + 1) && isMorning(r)) v -= 0.5;
              if ((m.orderDays || []).includes(((k + 2) % 7) + 1) && isEvening(r)) v += 1.5;
              if (k >= 4) v += 1.5 * (wkHist.get(m.id + '|' + kindOfRole(r)) || 0) + 0.9 * plan.filter((x) => x.m === m && x.k >= 4 && kindOfRole(x.role) === kindOfRole(r)).length;
              if (prev && prev.role === r && prev.k === k - 1) v += 0.6;
              if (r === 'A') v += 0.5 * plan.filter((x) => x.m === m && x.role === 'A').length;
              if (r === 'C') v += 0.5 * plan.filter((x) => x.m === m && x.role === 'C').length;
              return v;
            };
            const r = choices.sort((x, y) => w(x) - w(y))[0];
            free.splice(free.indexOf(r), 1);
            asg.push([m, r]);
            sc += w(r);
          }
          if (!bestDay || sc < bestDay.sc) bestDay = { sc, asg };
        }
        bad += bestDay.sc > 40 ? 1 : 0;
        for (const [m, r0] of bestDay.asg) {
          const role = r0 === 'CEN' && (m.flexDays || []).includes(k + 1) ? 'F' : r0; // orario flessibile 9:00–16:30
          plan.push({ m, k, role }); lastRole.set(m.id, { k, role });
        }
      }
      // 3. orari: durate che danno le ore di contratto esatte
      const shifts = [];
      for (const m of team) {
        const mine = plan.filter((x) => x.m === m);
        const target = targetOf(state, m, ws);
        const lens = mine.map((x) => LEN[x.role][2]);
        let diff = target - lens.reduce((a, b) => a + b, 0), guard = 0;
        while (diff !== 0 && guard++ < 200) {
          const step = diff > 0 ? 30 : -30;
          let idx = -1, room = -1;
          mine.forEach((x, i) => { const [lo, hi] = LEN[x.role]; const r = step > 0 ? hi - lens[i] : lens[i] - lo; if (r >= Math.abs(step) && r > room) { room = r; idx = i; } });
          if (idx < 0) break;
          const s = Math.abs(diff) < 30 ? diff : step;
          lens[idx] += s; diff -= s;
        }
        mine.forEach((x, i) => { const [a, b] = timesFor(x.role, lens[i], x.k + m.id, (m.orderDays || []).includes(x.k + 1) ? ORDER_BY : 1440); shifts.push({ managerId: m.id, day: ws + x.k, start: a, end: b, role: x.role }); });
      }
      const all = [...keep, ...shifts.filter((s) => !keepKey.has(s.managerId + '|' + s.day))];
      const probs = check(state, ws, all, nb);
      const score = probs.reduce((t2, p) => t2 + (p.sev === 'ERROR' ? 100 : p.sev === 'WARNING' ? 5 : 0), 0) + bad * 20;
      if (!best || score < best.score) best = { score, shifts: all, problems: probs };
      if (score === 0) break;
    }
    return best || { shifts: [], problems: [{ sev: 'ERROR', msg: 'Non è stato possibile creare la settimana dei manager.' }] };
  }
  const kindOfRole = (r) => (r === 'A' || r === 'D' || r === 'M2' ? 'apertura' : r === 'CEN' || r === 'F' ? 'centrale' : 'cena');
  const kindOf = (s) => (s.role ? kindOfRole(s.role) : s.start <= 510 ? 'apertura' : s.end >= 1260 ? 'cena' : 'centrale');

  /** Controlli della settimana dei manager. list = turni della settimana (di default quelli salvati). */
  function check(state, ws, list = weekShifts(state, ws), nb = neighbours(state, ws)) {
    const out = [], team = mgrs(state), V = (sev, msg, managerId = null, day = null) => out.push({ sev, msg, managerId, day });
    const name = (m) => T.fullName(m), when = (d) => `${T.DOW_LONG[T.dow(d)]} ${T.shortDate(d)}`;
    const carpi = carpiWeek(state, ws);
    for (let k = 0; k < 7; k++) {
      const d = ws + k, dl = list.filter((s) => s.day === d);
      if (!dl.length) continue;
      if (!dl.some((s) => s.start <= OPEN)) V('ERROR', `${when(d)}: nessun manager in apertura (7:30)`, null, d);
      if (!dl.some((s) => s.end >= CLOSE)) V('ERROR', `${when(d)}: nessun manager in chiusura (21:30)`, null, d);
      if (deliveryDays(state).includes(k + 1) && dl.filter((s) => s.start <= OPEN).length < 2) V('ERROR', `${when(d)}: delivery, servono 2 manager alle 7:30`, null, d);
      if (carpi && k === 1 && dl.filter((s) => s.end >= 1260).length < 2) V('ERROR', `${when(d)}: smontaggio Carpigiani, servono 2 manager in chiusura almeno fino alle 21:00`, null, d);
      if (carpi && k === 2 && dl.filter((s) => s.start <= OPEN).length < 2) V('ERROR', `${when(d)}: rimontaggio Carpigiani, servono 2 manager in apertura (7:30)`, null, d);
    }
    for (const m of team) {
      const mine = list.filter((s) => s.managerId === m.id).sort((a, b) => a.day - b.day || a.start - b.start);
      if (!mine.length) continue;
      for (const d of m.orderDays || []) {
        const day = ws + d - 1, s = mine.find((x) => x.day === day);
        if (absentOn(state, m, day)) continue;
        if (!s) V('ERROR', `${name(m)}: ${when(day)} c'è l'ordine (entro le 12:30), non può riposare`, m.id, day);
        else if (s.start > ORDER_BY) V('ERROR', `${name(m)}: ${when(day)} c'è l'ordine, deve entrare entro le 11:30`, m.id, day);
      }
      if (m.centralWeekly && !mine.some((s) => T.dow(s.day) <= 4 && s.start > OPEN && s.end < 1260)) V('WARNING', `${name(m)}: manca il turno centrale tra lunedì e giovedì`, m.id);
      const worked = mine.reduce((t, s) => t + s.end - s.start, 0), target = targetOf(state, m, ws);
      if (worked !== target) V(worked > target ? 'ERROR' : 'WARNING', `${name(m)}: ${T.fmtDur(worked)} su ${T.fmtDur(target)} di contratto`, m.id);
      const workDays = new Set(mine.map((s) => s.day)).size;
      if (workDays > 6) V('ERROR', `${name(m)}: lavora 7 giorni, serve un riposo`, m.id);
      const rest = [0, 1, 2, 3, 4, 5, 6].map((k) => ws + k).filter((d) => !mine.some((s) => s.day === d) && !absentOn(state, m, d));
      for (const d of rest) if (T.dow(d) >= 5) V('ERROR', `${name(m)}: riposo ${when(d)}, deve essere da lunedì a giovedì`, m.id, d);
      const all = [...nb.filter((s) => s.managerId === m.id), ...mine].sort((a, b) => absStart(a) - absStart(b));
      for (let i = 1; i < all.length; i++) {
        const a = all[i - 1], b = all[i];
        if (!gapOk(a, b)) V('ERROR', `${name(m)}: stacco troppo corto tra ${when(a.day)} (fine ${T.fmtTime(a.end)}) e ${when(b.day)} (inizio ${T.fmtTime(b.start)}): servono ${b.day - a.day === 1 ? '12' : '36'} ore`, m.id, b.day);
      }
    }
    return out;
  }

  /** Rotazione del weekend nelle ultime 4 settimane: per ognuno quante aperture, centrali e cene ven–dom. */
  function weekendStats(state, ws) {
    const out = {};
    for (const s of (state.mgrShifts || []).filter((x) => x.day >= ws - 21 && x.day <= ws + 6 && T.dow(x.day) >= 5)) {
      const o = (out[s.managerId] = out[s.managerId] || { apertura: 0, centrale: 0, cena: 0 });
      o[kindOf(s)]++;
    }
    return out;
  }

  root.TurniManager = { generate, check, weekendStats, carpiWeek, targetOf, ROLE_TXT, kindOf };
})(typeof window !== 'undefined' ? window : globalThis);
