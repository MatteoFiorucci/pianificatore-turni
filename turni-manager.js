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
  // regole dei manager: impostazioni dello store (state.config.mgr), con questi valori di partenza.
  // Orario del locale giorno per giorno (anche 24h) dalle impostazioni dello store.
  let CFG = {};
  const OPEN = (d) => T.dayHours(CFG, d).open, CLOSE = (d) => T.dayHours(CFG, d).close;
  let REST12 = 720, REST36 = 2160, ORDER_BY = 690; // stacco 12h, 36h con riposo; ordine: entra entro le 11:30
  const DAY = 1440;
  const ROLE_TXT = { AS: 'Apertura corta (poi notte)', N: 'Notte', A: 'Apertura', C: 'Chiusura', CEN: 'Centrale', D: 'Delivery', C2: 'Secondo in chiusura', X: 'Rinforzo', M2: 'Secondo in apertura', F: 'Flessibile' };
  // durata dei turni manager (regola tassativa, orario di presenza): corti da 3 a 5 ore senza pausa, oppure lunghi
  // da 6:00 a 8:30 con una pausa di 30 minuti timbrata (uscita e rientro); il turno di 5:30 non esiste.
  // La pausa non conta nelle ore lavorate: un turno di presenza 7:30–14:00 (6:30) vale 6 ore di contratto.
  let SHORT = [180, 300], LONG = [360, 510], BREAK_FROM = 360, BREAK_MIN = 30;
  const lenOk = (l) => (l >= SHORT[0] && l <= SHORT[1]) || (l >= LONG[0] && l <= LONG[1]);
  /** Ore lavorate di un turno di presenza lungo l minuti (tolta la pausa timbrata nei turni lunghi). */
  const workOf = (l) => (l >= BREAK_FROM ? l - BREAK_MIN : l);
  // durata preferita di ogni ruolo (minuti); i turni corti si usano solo se servono per le ore di contratto,
  // prima nei ruoli centrali e di rinforzo (CEN, X, C2), così apertura e chiusura restano coperte
  const PREF = { AS: 240, N: 420, A: 420, C: 420, CEN: 420, D: 420, M2: 420, C2: 390, X: 390, F: 450 };
  const CUT_ORDER = ['AS', 'CEN', 'X', 'C2', 'F', 'D', 'M2', 'N', 'A', 'C'];
  const lenUp = (l) => (l < SHORT[1] ? Math.min(l + 30, SHORT[1]) : l < LONG[0] ? LONG[0] : l < LONG[1] ? Math.min(l + 30, LONG[1]) : null);
  const lenDown = (l) => (l > LONG[0] ? Math.max(l - 30, LONG[0]) : l > SHORT[1] ? SHORT[1] : l > SHORT[0] ? Math.max(l - 30, SHORT[0]) : null);
  /**
   * Durate dei turni della settimana di una persona (roles = ruoli dei suoi giorni) che sommano esattamente target,
   * se possibile, restando nelle durate consentite.
   */
  /** Durata massima di un ruolo: l'apertura corta finisce in tempo per lo stacco prima della notte (mezzanotte). */
  const capOf = (r) => (r === 'AS' ? Math.max(SHORT[0], 1440 - REST12 - (CFG.open ?? 450)) : Infinity);
  function fitLens(roles, target) {
    // target = ore lavorate (contratto): la pausa dei turni lunghi non conta
    const lens = roles.map((r) => PREF[r] || 420);
    let diff = target - lens.reduce((a, b) => a + workOf(b), 0);
    for (let guard = 0; diff !== 0 && guard < 400; guard++) {
      // resto sotto la mezz'ora: lo prende un turno che resta nelle durate consentite
      if (Math.abs(diff) < 30) {
        const i = lens.findIndex((l) => lenOk(l + diff) && workOf(l + diff) - workOf(l) === diff);
        if (i >= 0) { lens[i] += diff; diff = 0; }
        break;
      }
      const up = diff > 0;
      const opts = lens.map((l, i) => ({ i, to: up ? lenUp(l) : lenDown(l) })).filter((o) => o.to != null && o.to <= capOf(roles[o.i]))
        .map((o) => ({ ...o, d: workOf(o.to) - workOf(lens[o.i]), jump: (lens[o.i] >= LONG[0]) !== (o.to >= LONG[0]) }))
        .filter((o) => Math.abs(o.d) <= Math.abs(diff) || !o.jump);
      if (!opts.length) break;
      // prima i passi di mezz'ora dentro lo stesso blocco (sui turni più lontani dal limite), poi il salto
      // tra corto e lungo, prima nei ruoli centrali/rinforzo
      // accorciare: prima centrali e rinforzi, per ultime apertura e chiusura (che devono toccarsi a metà giornata);
      // allungare: al contrario
      const rk = (i) => { const r = CUT_ORDER.indexOf(roles[i]); return up ? -r : r; };
      opts.sort((a, b) => a.jump - b.jump || rk(a.i) - rk(b.i) || (up ? lens[a.i] - lens[b.i] : lens[b.i] - lens[a.i]));
      const o = opts[0];
      diff -= o.d; lens[o.i] = o.to;
    }
    return lens;
  }
  // centrale: copre sempre le ore intermedie del pomeriggio (15:00–18:00), così i crew stanno sui rush
  const CEN_STARTS = [690, 660, 720, 675, 705], MID_END = 1080;
  // pranzo e cena: momenti in cui servono 2 manager (se quel giorno ce ne sono almeno 3)
  const LUNCH_AT = 750, DIN_END = 1230, LUNCH_CHECK = 780, DINNER_CHECK = 1200;
  const isMorning = (r) => r === 'AS' || r === 'N' || r === 'A' || r === 'D' || r === 'M2';
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
  function timesFor(r, len, k, maxStart = 1440, side = null, day = 0) {
    const h24 = T.dayHours(CFG, day).h24, op = h24 ? (CFG.open ?? 450) : OPEN(day), cl = CLOSE(day);
    switch (r) {
      case 'N': return [0, len];
      case 'AS': return [op, Math.min(op + len, 1440 - REST12)];
      case 'A': return [op, op + len];
      case 'C': return [cl - len, cl];
      case 'C2': return [Math.max(840, cl - 30 - len), Math.max(840, cl - 30 - len) + len];
      case 'X': return [cl - 30 - len, cl - 30];
      case 'D': case 'M2': return [op, op + len];
      case 'F': return [540, 540 + len];
      default: {
        // centrale: copre il pomeriggio (fino alle 18) e il rush dove manca il secondo manager:
        // side 'cena' → finisce alle 20:30, side 'pranzo' → inizia entro le 12:30; se la durata basta, tutti e due
        let st;
        if (len >= DIN_END - LUNCH_AT) st = DIN_END - len;
        else st = (side || (k % 2 ? 'cena' : 'pranzo')) === 'cena' ? Math.max(DIN_END - len, LUNCH_AT - 60) : Math.min(LUNCH_AT, Math.max(MID_END - len, CEN_STARTS[k % CEN_STARTS.length]));
        st = Math.max(op + 60, Math.min(st, maxStart));
        return [st, st + len];
      }
    }
  }

  /** Quanti manager servono come minimo nel giorno k (0 = lunedì). */
  function needOn(state, ws, k) {
    const d = k + 1, carpi = carpiWeek(state, ws);
    return (loadCfg(state).minPerDay ?? 2) + (T.dayHours(state.config, ws + k).h24 ? 1 : 0) + (deliveryDays(state).includes(d) ? 1 : 0) + (carpi && (d === 2 || d === 3) ? 1 : 0);
  }
  let REST_DAYS = [1, 2, 3, 4]; // il riposo dei manager è da lunedì a giovedì
  const MGR_DEFAULT = { short: [180, 300], long: [360, 510], breakFrom: 360, breakMin: 30, rest: 720, rest36: 2160, orderBy: 690, restDays: [1, 2, 3, 4], minPerDay: 2 };
  /** Legge le regole dei manager dalle impostazioni dello store (valori di partenza se mancano). */
  function loadCfg(state) {
    CFG = (state && state.config) || {};
    const g = { ...MGR_DEFAULT, ...(CFG.mgr || {}) };
    SHORT = g.short; LONG = g.long; BREAK_FROM = g.breakFrom; BREAK_MIN = g.breakMin; REST12 = g.rest; REST36 = g.rest36; ORDER_BY = g.orderBy; REST_DAYS = g.restDays;
    return g;
  }

  /** Ruoli che servono in un giorno, dato quanti manager ci sono. */
  function rolesFor(state, ws, k, n) {
    const d = k + 1, deliv = deliveryDays(state).includes(d), carpi = carpiWeek(state, ws);
    // giorno 24h: c'è anche il manager della notte (da mezzanotte), poi apertura all'orario normale e chiusura a mezzanotte
    const base = T.dayHours(state.config, ws + k).h24 ? ['N', 'A', 'C'] : ['A', 'C'];
    const extra = [];
    if (carpi && d === 2) extra.push('C2');
    if (deliv) extra.push('D');
    if (carpi && d === 3) extra.push('M2');
    // i primi due manager in più come sempre (centrale; nel weekend centrale e rinforzo serale);
    // dal terzo in poi a giro tra seconda apertura, centrale e sera, così non finiscono tutti sullo stesso turno
    const cycle = ['M2', 'CEN', 'X'];
    let added = 0;
    while (base.length + extra.length < n) {
      extra.push(added < 2 ? (d >= 5 ? (extra.includes('CEN') ? 'X' : 'CEN') : 'CEN') : cycle[(added - 2) % cycle.length]);
      added++;
    }
    return [...base, ...extra].slice(0, Math.max(n, base.length));
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
    loadCfg(state);
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
      for (const s of nb.filter((x) => x.day < ws).sort((a, b) => a.day - b.day)) lastRole.set(s.managerId, { k: s.day - ws, role: s.role || (s.end >= 1260 ? 'C' : s.start <= 510 ? 'A' : 'CEN'), end: s.end });
      let bad = 0;
      for (let k = 0; k < 7; k++) {
        const d = ws + k;
        const present = team.filter((m) => restOf.get(m.id) !== k + 1 && !absentOn(state, m, d));
        const roles = rolesFor(state, ws, k, present.length);
        // domani è 24h: chi farà la notte (da mezzanotte) oggi fa un'apertura corta che finisce entro le 12:00 (stacco di 12 ore)
        const nightTomorrow = k < 6 && T.dayHours(state.config, ws + k + 1).h24;
        if (nightTomorrow) {
          const i = roles.map((r, j) => [r, j]).reverse().find(([r]) => r === 'X' || r === 'CEN');
          if (i) roles[i[1]] = 'AS'; else if (roles.length >= 2) roles.push('AS');
        }
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
              // settimana prima: si conosce l'ora vera di fine (es. centrale fino alle 20:30 la domenica → lunedì niente apertura)
              if (prev && prev.end != null && prev.k === k - 1 && isMorning(r) && 1440 - prev.end + OPEN(d) < REST12) return false;
              // notte (da mezzanotte): solo chi il giorno prima non ha lavorato o ha fatto anche lui la notte (stacco di 12 ore)
              if (r === 'N' && prev && prev.k === k - 1 && prev.role !== 'N' && prev.role !== 'AS') return false;
              // chi ieri ha fatto l'apertura corta oggi fa la notte
              if (prev && prev.k === k - 1 && prev.role === 'AS' && free.includes('N') && r !== 'N') return false;
              // l'apertura corta la fa solo chi domani lavora (farà la notte)
              if (r === 'AS' && (restOf.get(m.id) === k + 2 || absentOn(state, m, d + 1))) return false;
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
              // domenica sera: meglio di no per chi il lunedì dopo ha l'orario flessibile o (settimana Carpigiani) l'ordine
              // del mercoledì, altrimenti il lunedì non ha un turno valido (stacco di 12 ore)
              if (k === 6 && isEvening(r) && ((m.flexDays || []).includes(1) || (carpiWeek(state, ws + 7) && (m.orderDays || []).includes(3)))) v += 3;
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
        const lens = fitLens(mine.map((x) => x.role), target);
        mine.forEach((x, i) => {
          // il centrale va dove manca il secondo manager: con la delivery (o il rimontaggio) il pranzo ne ha già 2 → cena;
          // con un secondo in chiusura o un rinforzo la cena ne ha già 2 → pranzo; altrimenti a giorni alterni
          const dayRoles = plan.filter((y) => y.k === x.k).map((y) => y.role);
          // chi il giorno dopo apre (7:30) non può finire alle 20:30 (stacco di 12 ore): il suo centrale copre il pranzo
          const opensNext = plan.some((y) => y.m === m && y.k === x.k + 1 && isMorning(y.role));
          const side = opensNext ? 'pranzo' : dayRoles.some((r) => r === 'D' || r === 'M2' || r === 'F') ? 'cena' : dayRoles.some((r) => r === 'X' || r === 'C2') ? 'pranzo' : null;
          const [a, b] = timesFor(x.role, lens[i], x.k + m.id, (m.orderDays || []).includes(x.k + 1) ? ORDER_BY : 1440, side, ws + x.k); shifts.push({ managerId: m.id, day: ws + x.k, start: a, end: b, role: x.role }); });
      }
      const all = [...keep, ...shifts.filter((s) => !keepKey.has(s.managerId + '|' + s.day))];
      fillGaps(all, keep);
      const probs = check(state, ws, all, nb);
      const score = probs.reduce((t2, p) => t2 + (p.sev === 'ERROR' ? 100 : p.sev === 'WARNING' ? 5 : 0), 0) + bad * 20;
      if (!best || score < best.score) best = { score, shifts: all, problems: probs };
      if (score === 0) break;
    }
    return best || { shifts: [], problems: [{ sev: 'ERROR', msg: 'Non è stato possibile creare la settimana dei manager.' }] };
  }
  /** Primo quarto d'ora del giorno d senza nessun manager (dall'apertura alla chiusura), oppure null. */
  function firstGap(list, d) {
    const dl = list.filter((s) => s.day === d);
    if (!dl.length) return null;
    for (let m = OPEN(d); m < CLOSE(d); m += 15) if (!dl.some((s) => s.start <= m && s.end > m)) return m;
    return null;
  }
  /**
   * Buchi a metà giornata (nessun manager, es. 14:00–15:00): il turno che finisce (o inizia) sul buco si allunga di
   * mezz'ora e un altro turno della stessa persona, in un altro giorno, si accorcia di mezz'ora: le ore restano uguali.
   * Si accorcia dal lato che non tocca apertura e chiusura, e solo se non apre un buco in quel giorno.
   */
  function fillGaps(list, keep) {
    const fixed = new Set(keep);
    for (let guard = 0; guard < 40; guard++) {
      let done = false;
      for (const d of [...new Set(list.map((s) => s.day))]) {
        const g = firstGap(list, d);
        if (g == null) continue;
        let e = g; while (e < CLOSE(d) && !list.some((s) => s.day === d && s.start <= e && s.end > e)) e += 15;
        const near = list.filter((s) => s.day === d && !fixed.has(s) && s.role !== 'AS' && (s.end === g || s.start === e));
        for (const s of near) {
          const grow = Math.min(30, e - g), len = s.end - s.start;
          if (!lenOk(len + grow)) continue;
          for (const t of list.filter((x) => x.managerId === s.managerId && x !== s && x.day !== d && !fixed.has(x))) {
            const tl = t.end - t.start;
            if (!lenOk(tl - grow)) continue;
            const old = { start: t.start, end: t.end };
            if (t.start <= OPEN(t.day)) t.end -= grow; else t.start += grow;
            if (firstGap(list, t.day) == null) {
              if (s.end === g) s.end += grow; else s.start -= grow;
              done = true; break;
            }
            Object.assign(t, old);
          }
          if (done) break;
        }
        if (done) break;
      }
      if (!done) break;
    }
  }
  const kindOfRole = (r) => (r === 'AS' || r === 'N' || r === 'A' || r === 'D' || r === 'M2' ? 'apertura' : r === 'CEN' || r === 'F' ? 'centrale' : 'cena');
  const kindOf = (s) => (s.role ? kindOfRole(s.role) : s.start <= 510 ? 'apertura' : s.end >= 1260 ? 'cena' : 'centrale');

  /** Controlli della settimana dei manager. list = turni della settimana (di default quelli salvati). */
  function check(state, ws, list = weekShifts(state, ws), nb = neighbours(state, ws)) {
    loadCfg(state);
    const out = [], team = mgrs(state), V = (sev, msg, managerId = null, day = null) => out.push({ sev, msg, managerId, day });
    const name = (m) => T.fullName(m), when = (d) => `${T.DOW_LONG[T.dow(d)]} ${T.shortDate(d)}`;
    const carpi = carpiWeek(state, ws);
    for (let k = 0; k < 7; k++) {
      const d = ws + k, dl = list.filter((s) => s.day === d);
      if (!dl.length) continue;
      if (!dl.some((s) => s.start <= OPEN(d))) V('ERROR', `${when(d)}: nessun manager in apertura (${T.fmtTime(OPEN(d))})`, null, d);
      if (!dl.some((s) => s.end >= CLOSE(d))) V('ERROR', `${when(d)}: nessun manager in chiusura (${T.fmtTime(CLOSE(d))})`, null, d);
      if (deliveryDays(state).includes(k + 1) && dl.filter((s) => s.start <= OPEN(d)).length < 2) V('ERROR', `${when(d)}: delivery, servono 2 manager alle ${T.fmtTime(OPEN(d))}`, null, d);
      if (carpi && k === 1 && dl.filter((s) => s.end >= CLOSE(d) - 30).length < 2) V('ERROR', `${when(d)}: smontaggio Carpigiani, servono 2 manager in chiusura almeno fino alle 21:00`, null, d);
      if (carpi && k === 2 && dl.filter((s) => s.start <= OPEN(d)).length < 2) V('ERROR', `${when(d)}: rimontaggio Carpigiani, servono 2 manager in apertura (${T.fmtTime(OPEN(d))})`, null, d);
      // pranzo e cena con 2 manager, quando quel giorno ce ne sono almeno 3
      if (dl.length >= 3) for (const [m, t] of [[LUNCH_CHECK, 'a pranzo (13:00)'], [DINNER_CHECK, 'a cena (20:00)']]) {
        if (dl.filter((s) => s.start <= m && s.end > m).length < 2) V('WARNING', `${when(d)}: un solo manager ${t}`, null, d);
      }
      // sempre almeno un manager dall'apertura alla chiusura
      for (let m = OPEN(d); m < CLOSE(d); m += 15) {
        if (dl.some((s) => s.start <= m && s.end > m)) continue;
        let e = m; while (e < CLOSE(d) && !dl.some((s) => s.start <= e && s.end > e)) e += 15;
        V('ERROR', `${when(d)}: nessun manager dalle ${T.fmtTime(m)} alle ${T.fmtTime(e)}`, null, d);
        break;
      }
    }
    for (const s of list) {
      const l = s.end - s.start;
      if (!lenOk(l)) V('ERROR', `${name(team.find((m) => m.id === s.managerId) || { lastName: '?' })}: ${when(s.day)} turno di ${T.fmtDur(l)}, non consentito (corti ${T.fmtDur(SHORT[0])}–${T.fmtDur(SHORT[1])} senza pausa, lunghi ${T.fmtDur(LONG[0])}–${T.fmtDur(LONG[1])} con pausa)`, s.managerId, s.day);
    }
    for (const m of team) {
      const mine = list.filter((s) => s.managerId === m.id).sort((a, b) => a.day - b.day || a.start - b.start);
      if (!mine.length) continue;
      for (const d of m.orderDays || []) {
        const day = ws + d - 1, s = mine.find((x) => x.day === day);
        if (absentOn(state, m, day)) continue;
        if (!s) V('ERROR', `${name(m)}: ${when(day)} c'è l'ordine (entro le 12:30), non può riposare`, m.id, day);
        else if (s.start > ORDER_BY) V('ERROR', `${name(m)}: ${when(day)} c'è l'ordine, deve entrare entro le ${T.fmtTime(ORDER_BY)}`, m.id, day);
      }
      if (m.centralWeekly && !mine.some((s) => T.dow(s.day) <= 4 && s.start > OPEN(s.day) && s.end < CLOSE(s.day) - 30)) V('WARNING', `${name(m)}: manca il turno centrale tra lunedì e giovedì`, m.id);
      const worked = mine.reduce((t, s) => t + workOf(s.end - s.start), 0), target = targetOf(state, m, ws);
      if (worked !== target) V(worked > target ? 'ERROR' : 'WARNING', `${name(m)}: ${T.fmtDur(worked)} lavorate (pause escluse) su ${T.fmtDur(target)} di contratto`, m.id);
      const workDays = new Set(mine.map((s) => s.day)).size;
      if (workDays > 6) V('ERROR', `${name(m)}: lavora 7 giorni, serve un riposo`, m.id);
      const rest = [0, 1, 2, 3, 4, 5, 6].map((k) => ws + k).filter((d) => !mine.some((s) => s.day === d) && !absentOn(state, m, d));
      for (const d of rest) if (!REST_DAYS.includes(T.dow(d))) V('ERROR', `${name(m)}: riposo ${when(d)}, i manager riposano solo ${REST_DAYS.map((x) => T.DOW_LONG[x].toLowerCase()).join(', ')} (sezione Store)`, m.id, d);
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

  root.TurniManager = { workOf: (l, state) => { if (state) loadCfg(state); return workOf(l); }, generate, check, weekendStats, carpiWeek, targetOf, ROLE_TXT, kindOf, lenOk };
})(typeof window !== 'undefined' ? window : globalThis);
