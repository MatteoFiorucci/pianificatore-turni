/*
 * Motore dei turni (versione web): stesse regole e stesso generatore dell'app Android
 * (app/src/main/java/com/familyfood/turni/domain). Orari in minuti dalla mezzanotte,
 * date come "giorno epoch" (giorni dal 1/1/1970), così non ci sono problemi di fuso orario.
 */
(function (root) {
  'use strict';

  const STATIONS = {
    CUCINA: { label: 'MFY (cucina, patate, bibite)', short: 'MFY' },
    FRONT: { label: 'OA (front)', short: 'OA' },
    MCCAFE: { label: 'McCafé', short: 'McC' },
    SERVIZIO: { label: 'Sala (servizio al tavolo / pulizia)', short: 'SALA' },
    HOSPITALITY: { label: 'Hospitality', short: 'HSP' },
  };
  const CREW_STATIONS = ['CUCINA', 'FRONT', 'MCCAFE', 'SERVIZIO'];
  /** Tipi di assenza: in tutti la persona non lavora e le ore della settimana si riducono in proporzione. */
  const ABSENCE_TYPES = {
    FERIE: { label: 'Ferie', phrase: 'in ferie', color: '#e8eefc', ink: '#1e40af' },
    MALATTIA: { label: 'Malattia', phrase: 'in malattia', color: '#fde2e4', ink: '#9f1239' },
    INFORTUNIO: { label: 'Infortunio', phrase: 'in infortunio', color: '#ffedd5', ink: '#9a3412' },
    ASSENTE: { label: 'Assente', phrase: 'assente', color: '#eeeeee', ink: '#555555' },
  };
  const absenceInfo = (type) => ABSENCE_TYPES[type] || { label: type, phrase: String(type).toLowerCase(), color: '#eeeeee', ink: '#555555' };
  const TYPES = { CREW: 'Crew', HOSPITALITY: 'Hospitality' };
  const DOW_SHORT = ['', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  const DOW_LONG = ['', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
  const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

  // open/close = orario del locale (7:30–21:30): il generatore non mette turni fuori da qui.
  // crewMax/hospMax = ore massime del turno normale in un giorno (5h). Il doppio è a parte:
  // al massimo doubleMax (3h) e almeno doubleGap (2h) di pausa dal turno.
  // crewMaxWeekday = turno normale dei crew da lunedì a giovedì (4h); crewMax = turno lungo e weekend (5h).
  // weekdayLongPerWeek = turni lunghi (oltre crewMaxWeekday) da lunedì a giovedì per persona a settimana, a rotazione
  // afternoonStart/End = post-rush del pranzo (14:30–19:00): niente turni "rigidi" tutti lì dentro, meglio sfalsati
  // dinnerPreStart = da quando può entrare chi copre la cena (pre-rush, 16:30); lunchPeak/dinnerPeak = cuore dei rush
  const DEFAULT_CONFIG = { dinnerPreStart: 990, lunchPeak: [750, 840], dinnerPeak: [1140, 1230], afternoonStart: 870, afternoonEnd: 1140, crewMaxWeekday: 240, crewMax: 300, weekdayLongPerWeek: 1, hospMax: 300, minShift: 120, rest11: 660, rest36: 2160, open: 450, close: 1290, doubleMax: 180, doubleGap: 120, closeGrace: 30 };
  // min = minimo di crew per giorno (lun→dom). Valori presi dagli orari reali delle settimane 39–44.
  const all = (n) => [n, n, n, n, n, n, n];
  const DEFAULT_COVERAGE = [
    // opening: true = contano solo i formati per l'apertura di quella postazione (sezione Aperture)
    // squadra di apertura (exact: 'start' = all'apertura ci sono esattamente questi, nessun altro): 1 McCafé + 1 MFY
    { id: 'c1', name: 'Apertura McCafé', start: 450, end: 630, min: all(1), station: 'MCCAFE', opening: true, exact: 'start' },
    { id: 'c2', name: 'Apertura MFY', start: 450, end: 630, min: all(1), station: 'CUCINA', opening: true, exact: 'start' },
    { id: 'c7', name: 'Intermedio mattina', start: 630, end: 720, min: all(2), station: null },
    { id: 'c4', name: 'Rush pranzo', start: 720, end: 900, min: [3, 3, 3, 3, 4, 5, 5], station: null },
    { id: 'c9', name: 'Picco pranzo', start: 750, end: 840, min: [4, 4, 4, 4, 6, 9, 8], station: null },
    { id: 'c8', name: 'Intermedio pomeriggio', start: 900, end: 1080, min: all(2), station: null },
    { id: 'c5', name: 'Rush cena', start: 1080, end: 1260, min: [3, 3, 3, 3, 4, 5, 5], station: null },
    { id: 'c10', name: 'Picco cena', start: 1140, end: 1230, min: [6, 6, 6, 6, 9, 11, 11], station: null },
    // squadra di chiusura (exact = alla fine della fascia devono restare esattamente questi, nessun altro):
    // lun–gio 2 MFY + 1 McCafé + 1 Sala, ven–dom 3 + 1 + 2 (la Sala può farla un'hospitality). Nessuno in front alla chiusura.
    // closing: true = contano solo i formati per la chiusura di quella postazione (sezione Aperture e chiusure)
    { id: 'c11', name: 'Chiusura McCafé', start: 1110, end: 1290, min: all(1), station: 'MCCAFE', exact: true, closing: true },
    { id: 'c12', name: 'Chiusura Sala', start: 1110, end: 1290, min: [1, 1, 1, 1, 2, 2, 2], station: 'SERVIZIO', exact: true, closing: true },
    { id: 'c13', name: 'Chiusura MFY', start: 1110, end: 1290, min: [2, 2, 2, 2, 3, 3, 3], station: 'CUCINA', exact: true, closing: true },
    // hospitality in sala (dallo storico: sempre presenti a pranzo e a cena, il pomeriggio varia; 2 nei rush del weekend)
    { id: 'h2', name: 'Hospitality pranzo', start: 750, end: 870, min: [1, 1, 1, 1, 2, 2, 2], station: 'HOSPITALITY' },
    { id: 'h3', name: 'Hospitality cena', start: 1050, end: 1290, min: [1, 1, 1, 1, 1, 2, 1], station: 'HOSPITALITY' },
  ];
  /**
   * Fine "controllata" di una fascia: gli ultimi closeGrace minuti prima della chiusura (21:00–21:30) non contano
   * per i minimi: chi finisce alle 21:00 o 21:15 copre comunque la chiusura.
   */
  const covEnd = (cfg, r) => { const close = cfg.close ?? 1290, g = cfg.closeGrace ?? 30; return r.end >= close ? Math.max(r.start + 15, Math.min(r.end, close - g)) : r.end; };
  /** Minimo richiesto da una fascia in un certo giorno. */
  const reqMin = (req, day) => (req.min ? req.min[dow(day) - 1] : req.minStaff);

  // ---------- orari e date ----------
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmtTime = (m) => `${Math.floor(m / 60)}:${pad2(m % 60)}`;
  function fmtDur(m) {
    const sign = m < 0 ? '-' : '';
    const a = Math.abs(m), h = Math.floor(a / 60), r = a % 60;
    return r ? `${sign}${h}h${pad2(r)}` : `${sign}${h}h`;
  }
  function parseTime(t) {
    const [h, m = '0'] = String(t).trim().split(':');
    return Number(h) * 60 + Number(m);
  }
  function parseHours(text) {
    const t = String(text).trim().replace(',', '.');
    if (!t) return null;
    if (t.includes(':')) {
      const [h, m] = t.split(':').map(Number);
      return Number.isInteger(h) && Number.isInteger(m) ? h * 60 + m : null;
    }
    const d = Number(t);
    return Number.isFinite(d) ? Math.round(d * 60) : null;
  }
  const hoursText = (min) => (min % 60 === 0 ? String(min / 60) : String(min / 60).replace('.', ','));

  const toDay = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
  const toIso = (day) => new Date(day * 864e5).toISOString().slice(0, 10);
  const dow = (day) => (((day + 3) % 7) + 7) % 7 + 1; // 1 = lunedì … 7 = domenica
  const mondayOf = (day) => day - (dow(day) - 1);
  const todayDay = () => { const n = new Date(); return Math.round(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / 864e5); };
  const parts = (day) => { const d = new Date(day * 864e5); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }; };
  const shortDate = (day) => { const p = parts(day); return `${DOW_SHORT[dow(day)]} ${p.d}/${p.m}`; };
  const longDate = (day) => { const p = parts(day); return `${DOW_LONG[dow(day)]} ${p.d}/${p.m}`; };
  const itDate = (day) => { const p = parts(day); return `${pad2(p.d)}/${pad2(p.m)}/${p.y}`; };
  function weekLabel(ws) {
    const a = parts(ws), b = parts(ws + 6);
    return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  }

  // ---------- contesto settimana ----------
  const fullName = (e) => `${e.lastName} ${e.firstName}`.trim();
  const dur = (s) => s.end - s.start;
  const isDouble = (s) => !!s.doppio;
  const sumDur = (list) => list.reduce((t, s) => t + dur(s), 0);
  const absStart = (s) => s.day * 1440 + s.start;
  const absEnd = (s) => s.day * 1440 + s.end;
  const maxDaily = (cfg, type) => (type === 'CREW' ? cfg.crewMax : cfg.hospMax);
  /** Weekend = venerdì, sabato, domenica. */
  const isWeekend = (day) => dow(day) >= 5;
  /**
   * Massimo del turno normale: 5h per tutti. Da lunedì a giovedì oltre le 4h è un "turno lungo",
   * concesso a rotazione (al massimo weekdayLongPerWeek a testa a settimana).
   */
  const maxFor = (cfg, e) => (e.type !== 'CREW' ? cfg.hospMax : cfg.crewMax);
  /**
   * Turno "rigido" nel pomeriggio: almeno 3h e oltre il 70% dentro la fascia post-rush (14:30–19:00), es. 14:30–19:30.
   * Il pomeriggio va coperto con turni sfalsati che si agganciano ai rush (es. 13:00–17:00 + 17:00–21:00).
   */
  const isRigidAfternoon = (cfg, s) => {
    const a = cfg.afternoonStart ?? 870, b = cfg.afternoonEnd ?? 1140, len = s.end - s.start;
    if (len < 180) return false;
    return Math.max(0, Math.min(s.end, b) - Math.max(s.start, a)) / len > 0.7;
  };
  /**
   * Turno "ibrido" nel pomeriggio: inizia nel post-rush (14:30–16:30) e arriva fino alla sera (dopo le 19:00),
   * es. 15:30–20:30: non intercetta bene né il pranzo né la cena. Chi fa la cena entra dalle 16:30.
   */
  const isHybridAfternoon = (cfg, s) => s.end - s.start >= 150 && s.start >= (cfg.afternoonStart ?? 870) && s.start < (cfg.dinnerPreStart ?? 990) && s.end > (cfg.afternoonEnd ?? 1140);
  /**
   * Turno lungo (oltre il turno normale di 4h) che non copre un rush: deve contenere almeno 1h del picco
   * del pranzo o della cena (rush + preparazione o recupero). Fa eccezione chi apre.
   */
  const isLongWithoutRush = (cfg, s) => {
    if (s.end - s.start <= (cfg.crewMaxWeekday ?? 240) || s.start <= (cfg.open ?? 450)) return false;
    const ov = (p) => Math.max(0, Math.min(s.end, p[1]) - Math.max(s.start, p[0]));
    return ov(cfg.lunchPeak ?? [750, 840]) < 60 && ov(cfg.dinnerPeak ?? [1140, 1230]) < 60;
  };
  /** Il generatore non mette mai una hospitality ad aprire il McCafé (si può fare solo a mano). */
  const autoOpenOk = (e, station) => !(e.type === 'HOSPITALITY' && station === 'MCCAFE');
  /** Turno lungo in settimana: crew, da lunedì a giovedì, oltre il turno normale (4h). */
  const isLongWeekday = (cfg, e, s) => e && e.type === 'CREW' && !s.doppio && !isWeekend(s.day) && s.end - s.start > (cfg.crewMaxWeekday ?? 240);

  function makeCtx(state, ws) {
    const employees = state.employees.filter((e) => e.active);
    // postazioni per cui qualcuno è segnato come formato alla chiusura (se nessuno: chiudono tutti i formati)
    const closingMarked = new Set(employees.flatMap((e) => e.closings || []));
    const ctx = {
      closingMarked,
      ws,
      days: [0, 1, 2, 3, 4, 5, 6].map((i) => ws + i),
      employees,
      byId: new Map(employees.map((e) => [e.id, e])),
      shifts: state.shifts.filter((s) => s.day >= ws && s.day <= ws + 6),
      prev: state.shifts.filter((s) => s.day >= ws - 2 && s.day < ws),
      absences: state.absences,
      coverage: state.coverage,
      cfg: state.config,
      hist: state.hist || root.TurniStorico || null, // orari reali e abitudini (turni-storico.js)
      forecast: null,
      // turni lunghi in settimana fatti nelle 4 settimane precedenti (per farli a rotazione)
      longHistory: new Map(),
    };
    for (const x of state.shifts) {
      if (x.day < ws - 28 || x.day >= ws) continue;
      const e = ctx.byId.get(x.employeeId);
      if (isLongWeekday(state.config, e, x)) ctx.longHistory.set(e.id, (ctx.longHistory.get(e.id) || 0) + 1);
    }
    const fc = forecastFor(state, ws, ctx);
    if (fc) {
      ctx.forecast = fc;
      // le fasce senza postazione (rush, picchi, intermedi) prendono i minimi dalle previsioni
      ctx.coverage = state.coverage.map((r) => (r.station ? r : { ...r, min: [0, 1, 2, 3, 4, 5, 6].map((k) => forecastMin(fc, r, k) ?? (r.min ? r.min[k] : r.minStaff)), fromForecast: true }));
    }
    return ctx;
  }

  // ---------- previsioni di vendita → fabbisogno di personale ----------
  /** Previsione di un giorno (0 = lunedì): { sales, gc } oppure null. Accetta anche il vecchio formato settimana/weekend. */
  function forecastDay(f, k) {
    if (!f) return null;
    if (Array.isArray(f.days)) return f.days[k] || null;
    return (k >= 4 ? f.weekend : f.weekday) || null;
  }
  /**
   * Fabbisogno giorno per giorno dalle Crew Hours indicate (stime dell'azienda), usate così come sono.
   * Vendite previste e clienti (GC) si salvano solo come informazione. Le ore si distribuiscono nella giornata come negli orari reali
   * (profilo dello storico: lun–gio "settimana", ven–dom "weekend"). Se le ore disponibili dei crew non bastano,
   * il fabbisogno viene ridotto in proporzione e segnalato. I giorni senza previsione usano i minimi di Regole.
   */
  function forecastFor(state, ws, ctx) {
    const f = state.forecasts && state.forecasts[ws], t = state.targets || {};
    const prof = (ctx.hist || {}).profile;
    if (!f || !prof) return null;
    // il fabbisogno viene solo dalle Crew Hours dell'azienda; vendite e clienti sono solo informativi
    const need = (x) => (x && x.crewHours > 0 ? x.crewHours : null);
    const typeOf = (k) => (k >= 4 ? 'weekend' : 'weekday');
    const days = [0, 1, 2, 3, 4, 5, 6];
    const hours = days.map((k) => need(forecastDay(f, k)));
    if (!hours.some((h) => h)) return null;
    const source = days.map((k) => { const x = forecastDay(f, k); return x && x.crewHours > 0 ? 'ch' : hours[k] ? 'calc' : null; });
    const base = days.map((k) => (typeOf(k) === 'weekend' ? prof.hoursWeekend : prof.hoursWeekday));
    const needed = days.reduce((tt, k) => tt + (hours[k] || base[k]), 0);
    const crew = ctx.employees.filter((e) => e.type === 'CREW');
    const available = crew.reduce((tt, e) => tt + target(ctx, e) + (e.doubleDays || 0) * (state.config.doubleMax ?? 180), 0) / 60;
    // le Crew Hours dell'azienda si usano così come sono; la riduzione vale solo per i giorni calcolati da vendite/clienti
    const usesCH = source.some((x) => x === 'ch');
    const scale = !usesCH && needed > available ? available / needed : 1;
    const factor = days.map((k) => (hours[k] ? (hours[k] / base[k]) * scale : null));
    return { hours, base, needed, available, scale, factor, prof, typeOf, source, usesCH };
  }
  /** Crew necessari in un quarto d'ora di un giorno (0 = lunedì) secondo le previsioni. */
  function forecastPeople(fc, k, t) {
    const i = Math.floor((t - fc.prof.start) / fc.prof.slot);
    return (fc.prof[fc.typeOf(k)][i] ?? 0) * (fc.factor[k] ?? 0);
  }
  /** Minimo di una fascia in un giorno (0 = lunedì) secondo le previsioni; null se quel giorno non ha previsione. */
  function forecastMin(fc, r, k) {
    if (!fc.factor[k]) return null;
    let mn = Infinity;
    for (let t = r.start; t < r.end; t += SLOT) mn = Math.min(mn, forecastPeople(fc, k, t));
    return mn === Infinity ? null : Math.max(1, Math.round(mn));
  }

  const shiftsOf = (ctx, id, day) =>
    ctx.shifts.filter((s) => s.employeeId === id && (day === undefined || s.day === day)).sort((a, b) => a.start - b.start);
  const absenceOn = (ctx, id, day) => ctx.absences.find((a) => a.employeeId === id && day >= a.from && day <= a.to);
  const isRest = (e, day) => e.restDays.includes(dow(day));
  /** In formazione quel giorno (fino alla data indicata, se c'è): in apertura/chiusura deve essere affiancato. */
  const isTrainee = (e, day) => !!e.trainee && (e.traineeUntil == null || day <= e.traineeUntil);
  /**
   * Può chiudere quella postazione? Se per la postazione è segnato qualcuno (sezione Aperture e chiusure), solo i segnati.
   * Se non è segnato nessuno, tutti i formati in quella postazione (per la Sala anche le hospitality).
   * La Sala la possono chiudere sia crew sia hospitality: nessuna delle due è obbligatoria.
   */
  const canClose = (ctx, e, station) => (e.closings || []).includes(station) ||
    (!(ctx.closingMarked && ctx.closingMarked.has(station)) && (e.trainings.includes(station) || (station === 'SERVIZIO' && e.type === 'HOSPITALITY')));
  /** In forza quel giorno? Prima della data di inizio (assunzione) non si può pianificare. */
  const started = (e, day) => e.startDate == null || day >= e.startDate;
  const isAvail = (ctx, e, day) => started(e, day) && !isRest(e, day) && !absenceOn(ctx, e.id, day);
  /** Ore del contratto: contano solo i turni normali, i doppi sono ore in più. */
  const worked = (ctx, id) => sumDur(ctx.shifts.filter((s) => s.employeeId === id && !isDouble(s)));
  const doubleWorked = (ctx, id) => sumDur(ctx.shifts.filter((s) => s.employeeId === id && isDouble(s)));

  /**
   * Ore da fare. Con orario fisso: durata del turno × giorni lavorabili (senza riposi e ferie).
   * Altrimenti ore da contratto, meno la quota giornaliera per ogni giorno di ferie (18h su 6 giorni → 3h).
   */
  function target(ctx, e) {
    if (e.fixedShift) {
      const days = ctx.days.filter((d) => isAvail(ctx, e, d)).length;
      return days * (e.fixedShift.end - e.fixedShift.start);
    }
    const workable = ctx.days.filter((d) => !isRest(e, d));
    if (!workable.length) return 0;
    // ferie, assenze e giorni prima della data di inizio tolgono la quota giornaliera
    const absent = workable.filter((d) => absenceOn(ctx, e.id, d) || !started(e, d)).length;
    const t = e.weeklyMinutes - (e.weeklyMinutes / workable.length) * absent;
    return Math.round(t / 15) * 15;
  }

  /** Stacco minimo: 11h tra giorni consecutivi, 36h se c'è un giorno libero in mezzo, 0 per i doppi. */
  function requiredGap(a, b, cfg) {
    const dd = b.day - a.day;
    return dd <= 0 ? 0 : dd === 1 ? cfg.rest11 : cfg.rest36;
  }

  // ---------- regole ----------
  const RULES = {
    COVERAGE: 'Copertura', FIXED_REST: 'Riposo fisso', ABSENCE: 'Ferie / malattia', INVALID_TIME: 'Orario non valido',
    OVERLAP: 'Turni sovrapposti', DAILY_MAX: 'Ore giornaliere', SHIFT_LENGTH: 'Durata turno', REST_11H: 'Stacco 11h',
    TRAINEE: 'In formazione', START_DATE: 'Data di inizio', AFTERNOON: 'Pomeriggio', LONG_SHIFTS: 'Turni lunghi', WEEKEND_REST: 'Riposo nel weekend', CLOSING_TEAM: 'Squadra apertura/chiusura', REST_36H: 'Stacco 36h', WEEKLY_HOURS: 'Ore settimanali', TRAINING: 'Formazione', FIXED_SHIFT: 'Orario fisso',
    DOUBLES: 'Doppi', WORK_DAYS: 'Giorni lavorati', RUSH_SPLIT: 'Pranzo e cena',
  };
  const V = (rule, sev, msg, emp = null, day = null) => ({ rule, sev, msg, emp, day });

  function ruleRestAndAbsence(ctx) {
    const out = [], seen = new Set();
    for (const s of ctx.shifts) {
      const e = ctx.byId.get(s.employeeId);
      if (!e) continue;
      const a = absenceOn(ctx, e.id, s.day);
      let v = null;
      if (a) v = V('ABSENCE', 'ERROR', `${fullName(e)} è ${absenceInfo(a.type).phrase} il ${shortDate(s.day)} ma ha un turno`, e.id, s.day);
      else if (isRest(e, s.day)) v = V('FIXED_REST', 'ERROR', `${fullName(e)}: turno nel giorno di riposo fisso (${DOW_LONG[dow(s.day)]})`, e.id, s.day);
      if (v && !seen.has(v.msg)) { seen.add(v.msg); out.push(v); }
    }
    return out;
  }

  function ruleDaily(ctx) {
    const out = [], cfg = ctx.cfg;
    const dMax = cfg.doubleMax ?? 180, dGap = cfg.doubleGap ?? 120;
    for (const e of ctx.employees) for (const d of ctx.days) {
      const day = shiftsOf(ctx, e.id, d);
      if (!day.length) continue;
      const who = fullName(e), when = shortDate(d);
      for (const s of day) {
        if (s.end <= s.start) out.push(V('INVALID_TIME', 'ERROR', `${who}: orario non valido il ${when} (${fmtTime(s.start)}–${fmtTime(s.end)})`, e.id, d));
        else if (dur(s) < cfg.minShift) out.push(V('SHIFT_LENGTH', 'WARNING', `${who}: ${isDouble(s) ? 'doppio' : 'turno'} di ${fmtDur(dur(s))} il ${when} (minimo ${fmtDur(cfg.minShift)})`, e.id, d));
      }
      for (let i = 1; i < day.length; i++) {
        if (day[i].start < day[i - 1].end) out.push(V('OVERLAP', 'ERROR', `${who}: turni sovrapposti il ${when}`, e.id, d));
      }
      const main = day.filter((s) => !isDouble(s)), dbl = day.filter(isDouble);
      const total = main.reduce((t, s) => t + Math.max(0, dur(s)), 0);
      const max = maxFor(cfg, e, d);
      if (total > max) out.push(V('DAILY_MAX', 'ERROR', `${who}: turno di ${fmtDur(total)} il ${when} (massimo ${fmtDur(max)}, doppio escluso)`, e.id, d));
      if (main.length > 1) out.push(V('DAILY_MAX', 'WARNING', `${who}: ${main.length} turni il ${when}: se uno è un doppio segnalo come doppio`, e.id, d));
      if (dbl.length > 1) out.push(V('DOUBLES', 'ERROR', `${who}: più di un doppio il ${when}`, e.id, d));
      // chi apre (turno che inizia all'apertura del locale) quel giorno non fa il doppio
      if (dbl.length && day.some((s) => s.start <= (cfg.open ?? 450))) out.push(V('DOUBLES', 'ERROR', `${who}: apre il ${when} e fa anche il doppio (chi apre non fa il doppio)`, e.id, d));
      for (const x of dbl) {
        if (dur(x) > dMax) out.push(V('DOUBLES', 'ERROR', `${who}: doppio di ${fmtDur(dur(x))} il ${when} (massimo ${fmtDur(dMax)})`, e.id, d));
        if (!main.length) out.push(V('DOUBLES', 'WARNING', `${who}: doppio senza turno normale il ${when}`, e.id, d));
        for (const m of main) {
          const gap = Math.max(x.start - m.end, m.start - x.end);
          if (gap >= 0 && gap < dGap) out.push(V('DOUBLES', 'ERROR', `${who}: solo ${fmtDur(gap)} di pausa tra turno e doppio il ${when} (minimo ${fmtDur(dGap)})`, e.id, d));
        }
      }
    }
    return out;
  }

  function ruleRest(ctx) {
    const out = [], cfg = ctx.cfg;
    for (const e of ctx.employees) {
      const all = [...ctx.prev.filter((s) => s.employeeId === e.id), ...shiftsOf(ctx, e.id)].sort((a, b) => absStart(a) - absStart(b));
      for (let i = 1; i < all.length; i++) {
        const a = all[i - 1], b = all[i];
        if (b.day < ctx.ws) continue;
        const req = requiredGap(a, b, cfg);
        if (!req) continue;
        const gap = absStart(b) - absEnd(a);
        if (gap >= req) continue;
        const between = `${shortDate(a.day)} ${fmtTime(a.end)} e ${shortDate(b.day)} ${fmtTime(b.start)}`;
        if (b.day - a.day > 1) out.push(V('REST_36H', 'ERROR', `${fullName(e)}: dopo il riposo servono ${fmtDur(req)} di stacco, ci sono solo ${fmtDur(gap)} tra ${between}`, e.id, b.day));
        else out.push(V('REST_11H', 'ERROR', `${fullName(e)}: solo ${fmtDur(gap)} di stacco tra ${between} (minimo ${fmtDur(req)})`, e.id, b.day));
      }
    }
    return out;
  }

  function ruleWeekly(ctx) {
    const out = [];
    for (const e of ctx.employees) {
      const w = worked(ctx, e.id), t = target(ctx, e), diff = w - t;
      if (diff > 0) out.push(V('WEEKLY_HOURS', 'ERROR', `${fullName(e)}: ${fmtDur(w)} su ${fmtDur(t)}, straordinario di ${fmtDur(diff)} non ammesso`, e.id));
      else if (diff < 0) out.push(V('WEEKLY_HOURS', 'WARNING', `${fullName(e)}: ${fmtDur(w)} su ${fmtDur(t)}, mancano ${fmtDur(-diff)}`, e.id));
    }
    return out;
  }

  /** Solo per chi ha già la formazione inserita: se non è inserita non si può sapere. */
  function ruleTraining(ctx) {
    const out = [];
    for (const s of ctx.shifts) {
      const e = ctx.byId.get(s.employeeId);
      if (e && s.station !== 'HOSPITALITY' && e.trainings.length && !e.trainings.includes(s.station)) {
        out.push(V('TRAINING', 'WARNING', `${fullName(e)} non risulta formato/a in ${STATIONS[s.station].label} (${shortDate(s.day)})`, e.id, s.day));
      }
    }
    return out;
  }

  const SLOT = 15;
  /**
   * Un turno conta per una fascia? Contano chi lavora in una postazione crew (anche hospitality messe lì);
   * per la Sala contano anche le hospitality nel loro turno normale. Nelle fasce generiche le hospitality in sala non contano.
   * Nelle fasce con postazione (aperture/chiusure) chi è in formazione non conta.
   */
  function countsFor(ctx, s, req) {
    const e = ctx.byId.get(s.employeeId);
    if (!e) return false;
    const station = req && req.station, opening = req && req.opening;
    if (station && isTrainee(e, s.day)) return false;
    if (req && req.closing && station && !canClose(ctx, e, station)) return false;
    if (station === 'HOSPITALITY') return s.station === 'HOSPITALITY';
    if (station === 'SERVIZIO' && !opening) return s.station === 'SERVIZIO' || s.station === 'HOSPITALITY';
    return s.station !== 'HOSPITALITY' && (!station || s.station === station) && (!opening || (e.openings || []).includes(station));
  }
  /** Persone presenti in un quarto d'ora che contano per la fascia. */
  function countAt(ctx, day, minute, req, list = ctx.shifts) {
    return list.filter((s) => s.day === day && s.start <= minute && s.end >= minute + SLOT && countsFor(ctx, s, req)).length;
  }
  /** Quarto d'ora in cui si controlla una squadra esatta: il primo della fascia (apertura) o l'ultimo (chiusura). */
  const teamSlot = (r) => (r.exact === 'start' ? r.start : r.end - SLOT);
  /**
   * Squadre esatte (apertura alle 7:30, chiusura alle 21:30): in quel quarto d'ora ci sono solo i previsti.
   * Restituisce null se il turno non tocca quel momento, { res: 'ok' } se ci sta, altrimenti
   * { res: 'troppi' | 'fuori squadra', t, team } (team = le fasce di quel momento).
   */
  function teamFit(ctx, cand, list) {
    const e = ctx.byId.get(cand.employeeId);
    if (!e || isTrainee(e, cand.day)) return null;
    const bySlot = new Map();
    for (const r of ctx.coverage) {
      if (!r.exact) continue;
      const t = teamSlot(r);
      if (!(cand.start <= t && cand.end >= t + SLOT)) continue;
      if (!bySlot.has(t)) bySlot.set(t, []);
      bySlot.get(t).push(r);
    }
    let ok = null;
    for (const [t, team] of bySlot) {
      const r = team.find((x) => countsFor(ctx, cand, x));
      if (!r) return { res: 'fuori squadra', t, team };
      const c = list.filter((x) => x !== cand && x.day === cand.day && x.start <= t && x.end >= t + SLOT && countsFor(ctx, x, r)).length;
      if (c + 1 > reqMin(r, cand.day)) return { res: 'troppi', t, team };
      ok = { res: 'ok' };
    }
    return ok;
  }
  /** Per il generatore: null, 'ok' o il motivo. */
  const closingFit = (ctx, cand, list) => { const f = teamFit(ctx, cand, list); return f ? f.res : null; };
  function coverageMin(ctx, day, req) {
    let min = Infinity;
    for (let m = req.start; m < covEnd(ctx.cfg, req); m += SLOT) min = Math.min(min, countAt(ctx, day, m, req));
    return min === Infinity ? 0 : min;
  }
  function ruleCoverage(ctx) {
    const out = [];
    for (const d of ctx.days) for (const req of ctx.coverage) {
      if (!reqMin(req, d)) continue;
      let runStart = null, runMin = Infinity;
      const flush = (end) => {
        if (runStart === null) return;
        const who = req.station ? `${req.opening ? 'formati apertura' : req.closing ? 'formati chiusura' : 'crew'} ${STATIONS[req.station].label}` : 'crew';
        const p = parts(d);
        out.push(V('COVERAGE', 'ERROR', `${DOW_LONG[dow(d)]} ${p.d}/${p.m} · ${req.name}: ${runMin}/${reqMin(req, d)} ${who} dalle ${fmtTime(runStart)} alle ${fmtTime(end)}`, null, d));
        runStart = null; runMin = Infinity;
      };
      const endC = covEnd(ctx.cfg, req);
      for (let m = req.start; m < endC; m += SLOT) {
        const c = countAt(ctx, d, m, req);
        if (c < reqMin(req, d)) { if (runStart === null) runStart = m; runMin = Math.min(runMin, c); }
        else flush(m);
      }
      flush(endC);
    }
    return out;
  }

  /**
   * Le ore si distribuiscono su tutti i giorni lavorabili (6 su 7 con un riposo): si lavora ogni giorno
   * che non è riposo o ferie. Errore se le ore sono già complete ma su meno giorni, altrimenti avviso.
   */
  function ruleWorkDays(ctx) {
    const out = [];
    for (const e of ctx.employees) {
      const avail = ctx.days.filter((d) => isAvail(ctx, e, d));
      if (!avail.length || target(ctx, e) === 0) continue;
      const missing = avail.filter((d) => !shiftsOf(ctx, e.id, d).length);
      if (!missing.length) continue;
      const done = worked(ctx, e.id) >= target(ctx, e);
      out.push(V('WORK_DAYS', done ? 'ERROR' : 'WARNING',
        `${fullName(e)}: lavora ${avail.length - missing.length} giorni su ${avail.length}, senza turno ${missing.map(shortDate).join(', ')}${done ? ': le ore vanno distribuite su tutti i giorni' : ''}`,
        e.id, missing[0]));
    }
    return out;
  }

  /** Formati presenti nella stessa postazione in un quarto d'ora (per la Sala valgono anche le hospitality). */
  function seniorsAt(ctx, day, minute, station, list) {
    return list.filter((x) => {
      const e = ctx.byId.get(x.employeeId);
      if (!e || isTrainee(e, day) || x.day !== day || x.start > minute || x.end < minute + SLOT) return false;
      return x.station === station || (station === 'SERVIZIO' && x.station === 'HOSPITALITY') || (station === 'HOSPITALITY' && x.station === 'SERVIZIO');
    }).length;
  }
  /**
   * Momenti di apertura/chiusura in cui un turno in formazione resterebbe senza un formato accanto nella stessa postazione.
   * Per la chiusura si controlla fino alla chiusura vera (21:30), compresi gli ultimi minuti: chi è in formazione
   * non chiude mai da solo/a, in nessuna postazione (neanche in front, dove alla chiusura non resta nessun formato).
   */
  function unaccompanied(ctx, s, list) {
    const e = ctx.byId.get(s.employeeId);
    if (!e || !isTrainee(e, s.day)) return null;
    for (const r of ctx.coverage) {
      if (!r.station || !(r.opening || r.closing) || !reqMin(r, s.day)) continue;
      const end = r.closing ? r.end : covEnd(ctx.cfg, r);
      for (let t = Math.max(s.start, r.start); t < Math.min(s.end, end); t += SLOT) {
        if (!seniorsAt(ctx, s.day, t, s.station, list)) return { req: r, t };
      }
    }
    return null;
  }
  /**
   * Picchi di pranzo e cena e presenze per postazione: serve a dividere le persone di una postazione tra pranzo e cena
   * (es. due persone di Sala: una a pranzo e una a cena), così nessuna postazione resta scoperta in un rush.
   */
  const PEAK_STATIONS = ['CUCINA', 'FRONT', 'MCCAFE', 'SERVIZIO'];
  const peaksOf = (cfg) => [cfg.lunchPeak || [750, 840], cfg.dinnerPeak || [1140, 1230]];
  const overlap = (a, b, p) => Math.max(0, Math.min(b, p[1]) - Math.max(a, p[0]));
  const inPeak = (a, b, p) => overlap(a, b, p) >= (p[1] - p[0]) / 2;
  const peakStation = (st) => (st === 'HOSPITALITY' ? 'SERVIZIO' : st);
  const peakCount = (list, day, st, p, except = null) => list.filter((x) => x !== except && x.day === day && !x.doppio && peakStation(x.station) === st && inPeak(x.start, x.end, p)).length;
  function ruleRushSplit(ctx) {
    const out = [];
    const [L, D] = peaksOf(ctx.cfg);
    for (const d of ctx.days) for (const st of PEAK_STATIONS) {
      const l = peakCount(ctx.shifts, d, st, L), n = peakCount(ctx.shifts, d, st, D);
      if ((l === 0 && n >= 2) || (n === 0 && l >= 2)) {
        const p = parts(d), label = st === 'SERVIZIO' ? 'Sala' : STATIONS[st].label;
        out.push(V('RUSH_SPLIT', 'WARNING', `${DOW_LONG[dow(d)]} ${p.d}/${p.m} · ${label}: ${l === 0 ? `a pranzo nessuno, a cena ${n}` : `a cena nessuno, a pranzo ${l}`}: meglio dividerli tra pranzo e cena`, null, d));
      }
    }
    return out;
  }
  function ruleTrainee(ctx) {
    const out = [];
    for (const s of ctx.shifts) {
      const u = unaccompanied(ctx, s, ctx.shifts);
      if (u) {
        const e = ctx.byId.get(s.employeeId);
        out.push(V('TRAINEE', 'ERROR', `${fullName(e)} è in formazione: il ${shortDate(s.day)} alle ${fmtTime(u.t)} (${u.req.name}) è da solo/a in ${STATIONS[s.station].label}, deve essere affiancato/a da un formato`, e.id, s.day));
      }
    }
    return out;
  }

  /** In apertura e alla chiusura ci sono esattamente i previsti per postazione (chi è in formazione può esserci in più). */
  function ruleClosingTeam(ctx) {
    const out = [];
    const exact = ctx.coverage.filter((r) => r.exact);
    if (!exact.length) return out;
    const label = (r) => r.name.replace(/^(Chiusura|Apertura) /, '');
    for (const d of ctx.days) {
      for (const r of exact) {
        const t = teamSlot(r), need = reqMin(r, d), c = countAt(ctx, d, t, r);
        const when = r.exact === 'start' ? `alle ${fmtTime(r.start)} ci sono` : `alle ${fmtTime(r.end)} restano`;
        if (c > need) out.push(V('CLOSING_TEAM', 'ERROR', `${DOW_LONG[dow(d)]} ${shortDate(d).split(' ')[1]} · ${r.name}: ${when} ${c} persone, previste ${need}`, null, d));
      }
      for (const s of ctx.shifts) {
        if (s.day !== d) continue;
        const f = teamFit(ctx, s, ctx.shifts);
        if (!f || f.res !== 'fuori squadra') continue;
        const e = ctx.byId.get(s.employeeId);
        const opening = f.team[0].exact === 'start';
        const st = s.station === 'HOSPITALITY' ? 'SERVIZIO' : s.station;
        const own = f.team.find((r) => r.station === st);
        if (own && own.closing && !canClose(ctx, e, st)) {
          out.push(V('CLOSING_TEAM', 'ERROR', `${fullName(e)} chiude in ${STATIONS[st].label} ma non è segnato/a per quella chiusura (sezione Aperture e chiusure)`, e.id, d));
        } else if (own && own.opening && !(e.openings || []).includes(st)) {
          out.push(V('CLOSING_TEAM', 'ERROR', `${fullName(e)} apre in ${STATIONS[st].label} ma non è segnato/a per quell'apertura (sezione Aperture e chiusure)`, e.id, d));
        } else if (opening) {
          out.push(V('CLOSING_TEAM', 'ERROR', `${fullName(e)} inizia alle ${fmtTime(s.start)} in ${STATIONS[s.station].label}: in apertura ci sono solo ${f.team.map(label).join(' e ')}`, e.id, d));
        } else {
          out.push(V('CLOSING_TEAM', 'ERROR', `${fullName(e)} resta fino alle ${fmtTime(s.end)} in ${STATIONS[s.station].label}: alla chiusura restano solo ${f.team.map(label).join(', ')}`, e.id, d));
        }
      }
    }
    return out;
  }

  /** Niente turni prima della data di inizio (assunzione). */
  function ruleStartDate(ctx) {
    const out = [];
    for (const x of ctx.shifts) {
      const e = ctx.byId.get(x.employeeId);
      if (e && !started(e, x.day)) out.push(V('START_DATE', 'ERROR', `${fullName(e)} entra il ${shortDate(e.startDate)}: non può avere turni il ${shortDate(x.day)}`, e.id, x.day));
    }
    return out;
  }

  /** Pomeriggio post-rush e turni lunghi: turni sfalsati che si agganciano ai rush, niente turni rigidi o ibridi. */
  function ruleAfternoon(ctx) {
    const out = [], cfg = ctx.cfg, a = cfg.afternoonStart ?? 870, b = cfg.afternoonEnd ?? 1140;
    for (const x of ctx.shifts) {
      const e = ctx.byId.get(x.employeeId);
      if (!e || e.fixedShift || isDouble(x)) continue;
      const t = `${fmtTime(x.start)}–${fmtTime(x.end)} il ${shortDate(x.day)}`;
      if (isRigidAfternoon(cfg, x)) out.push(V('AFTERNOON', 'WARNING', `${fullName(e)}: ${t} sta quasi tutto nel post-rush (${fmtTime(a)}–${fmtTime(b)}): meglio sfalsare, es. 13:00–17:00 e 17:00–21:00`, e.id, x.day));
      else if (e.type === 'CREW' && isHybridAfternoon(cfg, x)) out.push(V('AFTERNOON', 'WARNING', `${fullName(e)}: ${t} è un turno ibrido (entra nel post-rush e arriva alla sera): meglio uno che arriva dal pranzo (es. 13:00–17:00) e uno che entra per la cena dalle ${fmtTime(cfg.dinnerPreStart ?? 990)} (es. 17:00–21:00)`, e.id, x.day));
      else if (e.type === 'CREW' && isLongWithoutRush(cfg, x)) out.push(V('AFTERNOON', 'WARNING', `${fullName(e)}: ${t} è un turno lungo che non copre un rush: i turni oltre ${fmtDur(cfg.crewMaxWeekday ?? 240)} devono comprendere il picco del pranzo o della cena (più preparazione o recupero)`, e.id, x.day));
    }
    return out;
  }

  /** Turni lunghi (oltre le 4h) da lunedì a giovedì: a rotazione, al massimo N a testa a settimana. */
  function ruleLongShifts(ctx) {
    const out = [], lim = ctx.cfg.weekdayLongPerWeek ?? 1;
    for (const e of ctx.employees) {
      if (e.fixedShift) continue;
      const long = ctx.shifts.filter((x) => x.employeeId === e.id && isLongWeekday(ctx.cfg, e, x));
      if (long.length > lim) out.push(V('LONG_SHIFTS', 'WARNING', `${fullName(e)} fa ${long.length} turni lunghi (oltre ${fmtDur(ctx.cfg.crewMaxWeekday ?? 240)}) da lunedì a giovedì (${long.map((x) => shortDate(x.day)).join(', ')}): a rotazione al massimo ${lim} a testa`, e.id, long[long.length - 1].day));
    }
    return out;
  }

  /** Da venerdì a domenica sono tutti a disposizione: niente riposi fissi nel weekend (salvo orari fissi). */
  function ruleWeekendRest(ctx) {
    const out = [];
    for (const e of ctx.employees) {
      if (e.fixedShift) continue;
      const bad = e.restDays.filter((x) => x >= 5);
      if (bad.length) out.push(V('WEEKEND_REST', 'WARNING', `${fullName(e)} ha il riposo fisso di ${bad.map((x) => DOW_LONG[x]).join(' e ')}: da venerdì a domenica sono tutti a disposizione, sposta il riposo in settimana (Personale)`, e.id));
    }
    return out;
  }

  /** Chi ha un orario fisso deve fare sempre quello. */
  function ruleFixedShift(ctx) {
    const out = [];
    for (const s of ctx.shifts) {
      const e = ctx.byId.get(s.employeeId);
      if (e && e.fixedShift && (s.start !== e.fixedShift.start || s.end !== e.fixedShift.end)) {
        out.push(V('FIXED_SHIFT', 'WARNING', `${fullName(e)} ha l'orario fisso ${fmtTime(e.fixedShift.start)}–${fmtTime(e.fixedShift.end)}, ma il ${shortDate(s.day)} fa ${fmtTime(s.start)}–${fmtTime(s.end)}`, e.id, s.day));
      }
    }
    return out;
  }

  /** Doppi fatti rispetto a quelli previsti nella sezione Doppi. */
  function ruleDoubles(ctx) {
    const out = [];
    for (const e of ctx.employees) {
      const days = ctx.days.filter((d) => shiftsOf(ctx, e.id, d).some(isDouble));
      const planned = e.doubleDays || 0;
      if (days.length > planned) {
        out.push(V('DOUBLES', 'WARNING', `${fullName(e)} fa il doppio ${days.length} ${days.length === 1 ? 'giorno' : 'giorni'} (${days.map(shortDate).join(', ')}), previsti ${planned} nella sezione Doppi`, e.id, days[days.length - 1]));
      } else if (days.length < planned) {
        out.push(V('DOUBLES', 'WARNING', `${fullName(e)}: previsti ${planned} doppi, ne fa ${days.length}`, e.id));
      }
    }
    return out;
  }

  /** Quanto manca alle coperture in un giorno (persone × quarti d'ora sotto il minimo). */
  function deficitOf(ctx, list, d) {
    let n = 0;
    for (const r of ctx.coverage) {
      const need = reqMin(r, d);
      if (!need) continue;
      for (let t = r.start; t < r.end; t += SLOT) { const c = countAt(ctx, d, t, r, list); if (c < need) n += need - c; }
    }
    return n;
  }

  function validate(ctx) {
    const all = [ruleCoverage, ruleRestAndAbsence, ruleDaily, ruleRest, ruleWeekly, ruleTraining, ruleFixedShift, ruleDoubles, ruleWorkDays, ruleTrainee, ruleClosingTeam, ruleWeekendRest, ruleLongShifts, ruleAfternoon, ruleStartDate, ruleRushSplit].flatMap((r) => r(ctx));
    const sevOrder = { ERROR: 0, WARNING: 1 };
    return all.sort((a, b) => sevOrder[a.sev] - sevOrder[b.sev] || (a.day ?? -1e9) - (b.day ?? -1e9));
  }

  // ---------- generatore ----------
  /**
   * 0. Orari fissi (es. 9:00–12:30 tutti i giorni lavorativi).
   * 1. Coperture, un quarto d'ora alla volta, partendo dai giorni più difficili (più richiesta,
   *    meno persone libere). Per ogni momento scoperto aggiunge il turno che chiude più buchi;
   *    se nessuno è libero usa un doppio di chi lo fa (sezione Doppi).
   * 2. Riempimento delle ore di contratto nei giorni ancora vuoti (tutti i giorni lavorativi).
   * 3. Doppi rimasti: nei rush, preferendo sabato e domenica.
   * 4. Rifinitura: allunga turni generati per chiudere gli avanzi.
   * Mantiene i turni già presenti; resta dentro l'orario del locale.
   */
  function generate(ctx, opts = {}) {
    const cfg = ctx.cfg, shifts = ctx.shifts.slice(), added = [], notes = [];
    const OPEN = cfg.open ?? 450, CLOSE = cfg.close ?? 1290;
    const D_MAX = cfg.doubleMax ?? 180, D_GAP = cfg.doubleGap ?? 120;
    const emps = ctx.employees;
    const flexible = emps.filter((e) => !e.fixedShift);
    const crew = flexible.filter((e) => e.type === 'CREW');
    const mainOf = (id) => shifts.filter((s) => s.employeeId === id && !isDouble(s));
    const remaining = (e) => target(ctx, e) - sumDur(mainOf(e.id));
    const doublesLeft = (e) => (e.doubleDays || 0) - shifts.filter((s) => s.employeeId === e.id && isDouble(s)).length;
    const dayMain = (id, d) => shifts.filter((s) => s.employeeId === id && s.day === d && !isDouble(s));
    const freeDayList = (e, exceptDay) => ctx.days.filter((d) => d !== exceptDay && isAvail(ctx, e, d) && !dayMain(e.id, d).length);
    const cmpName = (a, b) => { const x = fullName(a), y = fullName(b); return x < y ? -1 : x > y ? 1 : 0; };
    const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
    const ceilDiv = (a, b) => Math.floor((a + b - 1) / b);
    const roundUp30 = (x) => Math.floor((x + 29) / 30) * 30;
    const dayLabel = (d) => { const p = parts(d); return `${DOW_LONG[dow(d)]} ${p.d}/${p.m}`; };

    const pairOk = (a, b) => absEnd(a) <= absStart(b) && absStart(b) - absEnd(a) >= requiredGap(a, b, cfg);
    function restOk(e, cand, replacing) {
      const all = [...ctx.prev.filter((s) => s.employeeId === e.id), ...shifts.filter((s) => s.employeeId === e.id && s !== replacing), cand]
        .sort((a, b) => absStart(a) - absStart(b));
      const i = all.indexOf(cand);
      // i doppi dello stesso giorno sono controllati a parte (pausa minima); qui gli stacchi tra giorni diversi
      let j = i - 1; while (j >= 0 && all[j].day === cand.day) { if (absEnd(all[j]) > absStart(cand)) return false; j--; }
      let k = i + 1; while (k < all.length && all[k].day === cand.day) { if (absEnd(cand) > absStart(all[k])) return false; k++; }
      return (j < 0 || pairOk(all[j], cand)) && (k >= all.length || pairOk(cand, all[k]));
    }
    /**
     * Ore che una persona può ancora fare nei giorni liberi: weekend fino a 5h, da lunedì a giovedì 4h
     * più i turni lunghi che le restano (a rotazione).
     */
    function capacity(e, days, cand) {
      if (e.type !== 'CREW') return days.reduce((t, d) => t + maxFor(cfg, e, d), 0);
      const norm = cfg.crewMaxWeekday ?? 240, lim = cfg.weekdayLongPerWeek ?? 1;
      const used = shifts.filter((x) => x.employeeId === e.id && isLongWeekday(cfg, e, x)).length + (cand && isLongWeekday(cfg, e, cand) ? 1 : 0);
      const wd = days.filter((d) => !isWeekend(d)).length, we = days.length - wd;
      return we * cfg.crewMax + wd * norm + Math.min(Math.max(0, lim - used), wd) * (cfg.crewMax - norm);
    }
    /** Turno normale: uno al giorno, entro il massimo, e le ore rimaste devono poter coprire tutti gli altri giorni. */
    // niente turni che finiscono negli ultimi minuti prima della chiusura (es. 21:15): o si chiude alle 21:30 o si esce prima
    const lateEnd = (b) => b > CLOSE - (cfg.closeGrace ?? 30) && b < CLOSE;
    function canPlace(e, cand, replacing = null) {
      if (!isAvail(ctx, e, cand.day)) return false;
      if (lateEnd(cand.end) && !e.fixedShift) return false;
      if (!e.fixedShift && !cand.doppio && isRigidAfternoon(cfg, cand)) return false; // pomeriggio: turni sfalsati, non rigidi
      if (!e.fixedShift && !cand.doppio && e.type === 'CREW' && (isHybridAfternoon(cfg, cand) || isLongWithoutRush(cfg, cand))) return false; // niente ibridi, turni lunghi solo sul rush
      if (dur(cand) <= 0 || cand.start < 0 || cand.end > 1440) return false;
      if (!cand.doppio && cand.start <= OPEN && shifts.some((s) => s.employeeId === e.id && s.day === cand.day && isDouble(s) && s !== replacing)) return false; // chi apre non fa il doppio
      const others = dayMain(e.id, cand.day).filter((s) => s !== replacing);
      if (!replacing && others.length) return false;
      if (sumDur(others) + dur(cand) > maxFor(cfg, e, cand.day)) return false;
      if (isLongWeekday(cfg, e, cand) && !e.fixedShift &&
        shifts.filter((x) => x !== replacing && x.employeeId === e.id && isLongWeekday(cfg, e, x)).length >= (cfg.weekdayLongPerWeek ?? 1)) return false;
      const extra = dur(cand) - (replacing ? dur(replacing) : 0);
      if (extra > remaining(e)) return false;
      if (!e.fixedShift) {
        const fl = freeDayList(e, cand.day), f = fl.length, after = remaining(e) - extra;
        if (after < cfg.minShift * f || after > capacity(e, fl, cand)) return false;
      }
      const dbl = shifts.find((s) => s.employeeId === e.id && s.day === cand.day && isDouble(s));
      if (dbl && Math.max(dbl.start - cand.end, cand.start - dbl.end) < D_GAP) return false;
      if (unaccompanied(ctx, cand, shifts)) return false; // in formazione: mai da solo in apertura/chiusura
      const cf = closingFit(ctx, cand, shifts.filter((s) => s !== replacing));
      if (cf && cf !== 'ok') return false; // squadra di chiusura esatta
      return restOk(e, cand, replacing);
    }
    /** Doppio: solo per chi lo fa, nello stesso giorno del turno normale, con la pausa minima. */
    function canPlaceDouble(e, cand) {
      if (doublesLeft(e) <= 0 || !isAvail(ctx, e, cand.day)) return false;
      if (dur(cand) <= 0 || dur(cand) > D_MAX || cand.start < OPEN || cand.end > CLOSE) return false;
      if (lateEnd(cand.end)) return false;
      const main = dayMain(e.id, cand.day);
      if (main.length !== 1 || shifts.some((s) => s.employeeId === e.id && s.day === cand.day && isDouble(s))) return false;
      if (cand.start <= OPEN || main[0].start <= OPEN) return false; // chi apre non fa il doppio
      if (Math.max(cand.start - main[0].end, main[0].start - cand.end) < D_GAP) return false;
      if (unaccompanied(ctx, cand, shifts)) return false;
      const cf = closingFit(ctx, cand, shifts);
      if (cf && cf !== 'ok') return false;
      return restOk(e, cand, null);
    }
    const place = (s) => { shifts.push(s); added.push(s); };
    function replace(old, neu) {
      shifts.splice(shifts.indexOf(old), 1); shifts.push(neu);
      added.splice(added.indexOf(old), 1); added.push(neu);
    }
    const stationFor = (e) => (e.type === 'HOSPITALITY' ? 'HOSPITALITY' : ['FRONT', 'CUCINA', 'MCCAFE', 'SERVIZIO'].find((s) => e.trainings.includes(s)) || 'FRONT');
    function pickStation(e, d, from, to) {
      if (e.type === 'HOSPITALITY') return 'HOSPITALITY';
      const opts = CREW_STATIONS.filter((s) => e.trainings.includes(s));
      const list = opts.length ? opts : ['FRONT'];
      let best = list[0], bestN = Infinity;
      for (const st of list) {
        const n = shifts.filter((s) => s.day === d && s.station === st && s.start < to && s.end > from).length;
        if (n < bestN) { best = st; bestN = n; }
      }
      return best;
    }

    // ---- varietà e abitudini (dallo storico) ----
    // numeri casuali ripetibili: stessa settimana + stesso tentativo = stesso risultato; "Genera" di nuovo = variante diversa
    let seed = (opts.seed ?? ctx.ws) >>> 0;
    const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const hist = ctx.hist || {};
    const tplOf = (type) => (hist.templates && hist.templates[type]) || [];
    const tplTop = { CREW: Math.max(1, ...tplOf('CREW').map((x) => x[2])), HOSPITALITY: Math.max(1, ...tplOf('HOSPITALITY').map((x) => x[2])) };
    const tplFreq = (type, a, b) => { const t = tplOf(type).find((x) => x[0] === a && x[1] === b); return t ? t[2] / tplTop[type] : 0; };
    const band = (a) => (a < 630 ? 0 : a < 780 ? 1 : a < 1020 ? 2 : 3);
    const habit = (e, a) => { const h = hist.habits && hist.habits[e.lastName]; return h ? h[band(a)] : 0.25; };
    /** Penalità se la persona inizia alla stessa ora il giorno prima/dopo, o se un collega dello stesso ruolo fa lo stesso identico turno. */
    function variety(e, d, a, b) {
      let p = 0;
      for (const s of shifts) {
        if (s.employeeId === e.id) { if ((s.day === d - 1 || s.day === d + 1) && s.start === a) p += 1; }
        else if (s.day === d && s.start === a && s.end === b && ctx.byId.get(s.employeeId)?.type === e.type) p += 0.5;
      }
      return p;
    }
    /** Quanto è "naturale" un turno per una persona: orario usato davvero, sua abitudine, poco ripetitivo. */
    // turno lungo in settimana: prima a chi ne ha fatti meno nelle ultime settimane (rotazione)
    const avgLong = (() => { const c = crew.filter((x) => !x.fixedShift); return c.length ? c.reduce((t, x) => t + (ctx.longHistory.get(x.id) || 0), 0) / c.length : 0; })();
    // il turno lungo costa sempre un po' (si usa solo se serve); a chi ne ha fatti più della media costa di più
    const longPenalty = (e, d, a, b) => (isLongWeekday(cfg, e, { day: d, start: a, end: b }) ? 0.8 + 2.5 * Math.max(0, (ctx.longHistory.get(e.id) || 0) - avgLong + 0.5) - 1.2 * Math.max(0, avgLong - (ctx.longHistory.get(e.id) || 0) - 0.5) : 0);
    // cambio turno complementare: se qualcuno esce quando questo entra (o entra quando esce), es. 13–17 → 17–21
    const handover = (e, d, a, b) => {
      if (a < (cfg.afternoonStart ?? 870) - 60 && b < (cfg.afternoonStart ?? 870)) return 0;
      let n = 0;
      for (const x of shifts) if (x.day === d && x.employeeId !== e.id && !isDouble(x) && (x.end === a || x.start === b)) n++;
      return Math.min(1, n * 0.5);
    };
    const natural = (e, d, a, b) => tplFreq(e.type, a, b) + habit(e, a) * 1.5 - variety(e, d, a, b) * 1.2 - longPenalty(e, d, a, b) + handover(e, d, a, b) + rnd() * 0.6;
    /**
     * Sceglie turno e persona insieme: tra le finestre che chiudono quasi più buchi possibile (≥ 80% della migliore)
     * preferisce chi ha più ore da fare e l'orario più naturale per lui/lei.
     */
    /**
     * Pranzo e cena divisi per postazione: bonus a chi porta la sua postazione in un picco dove manca,
     * penalità a chi la raddoppia in un picco mentre nell'altro non c'è nessuno di quella postazione.
     */
    function rushBalance(st, d, a, b) {
      // le hospitality hanno già le loro fasce di pranzo e cena (es. 2 a pranzo il sabato): la regola vale per i crew
      if (!st || st === 'HOSPITALITY') return 0;
      const ps = peakStation(st), [L, Dn] = peaksOf(cfg);
      let v = 0;
      for (const [P, Q] of [[L, Dn], [Dn, L]]) {
        if (!inPeak(a, b, P) || inPeak(a, b, Q)) continue;
        const cP = peakCount(shifts, d, ps, P), cQ = peakCount(shifts, d, ps, Q);
        if (cP === 0) v += 1;
        else if (cQ === 0) v -= 1.5;
        else if (cP > cQ) v -= 0.5;
      }
      return v;
    }
    function pickPair(d, wins, cands, stationFn, doppio = false, check = canPlace, bias = () => 0, share = 0.8) {
      if (!wins.length || !cands.length) return null;
      const best = Math.max(1, wins[0].gain);
      const good = wins.filter((w) => w.gain >= best * share);
      const need = (e) => (doppio ? doublesLeft(e) : remaining(e));
      const maxNeed = Math.max(1, ...cands.map(need));
      const tryList = (list) => {
        const pairs = [];
        for (const w of list) for (const e of cands) {
          const a = w.start, b = w.start + w.len;
          const stn = doppio ? null : stationFn(e, a, b);
          pairs.push({ w, e, score: (w.gain / best) * 3 + (need(e) / maxNeed) * 1.5 + natural(e, d, a, b) + bias(e) + rushBalance(stn, d, a, b) });
        }
        pairs.sort((x, y) => y.score - x.score);
        for (const p of pairs) {
          const s = { employeeId: p.e.id, day: d, start: p.w.start, end: p.w.start + p.w.len, station: stationFn(p.e, p.w.start, p.w.start + p.w.len), doppio };
          if (check(p.e, s)) return s;
        }
        return null;
      };
      return tryList(good.length ? good : wins) || (good.length && good.length < wins.length ? tryList(wins) : null);
    }

    // 0. orari fissi
    for (const e of emps.filter((x) => x.fixedShift)) {
      for (const d of ctx.days) {
        if (!isAvail(ctx, e, d) || shifts.some((s) => s.employeeId === e.id && s.day === d)) continue;
        const s = { employeeId: e.id, day: d, start: e.fixedShift.start, end: e.fixedShift.end, station: stationFor(e), doppio: false };
        if (canPlace(e, s)) place(s);
        else notes.push(`${fullName(e)}: non è stato possibile mettere l'orario fisso ${dayLabel(d)}`);
      }
    }

    // 1. coperture
    const LENGTHS = [180, 240, 210, 150, 270, 300, 120];
    // prima le aperture (pochi formati), poi le altre fasce con postazione, poi le generiche dalle più corte
    // per le hospitality prima la fascia lunga (in sala tutto il giorno), poi i rinforzi di pranzo e cena
    const isH = (r) => r.station === 'HOSPITALITY';
    const reqs = [...ctx.coverage].sort((a, b) =>
      (a.station === null) - (b.station === null) || !a.opening - !b.opening || isH(a) - isH(b) ||
      (isH(a) && isH(b) ? (b.end - b.start) - (a.end - a.start) : (a.end - a.start) - (b.end - b.start)) || b.start - a.start);
    const generic = ctx.coverage.filter((r) => !r.station);
    const byNeed = (a, b) => remaining(b) - remaining(a) || cmpName(a, b);
    const hospReqs = ctx.coverage.filter((r) => r.station === 'HOSPITALITY');
    const hospitality = flexible.filter((e) => e.type === 'HOSPITALITY');
    function benefit(d, start, end, list = generic) {
      let n = 0;
      for (const r of list) {
        const need = reqMin(r, d);
        for (let t = Math.max(start, r.start); t < Math.min(end, r.end); t += SLOT) if (countAt(ctx, d, t, r, shifts) < need) n++;
      }
      return n;
    }
    function windowsFor(d, m, lengths, reqList = generic, prefer = 0, type = 'CREW', maxLen = 300) {
      const list = [];
      for (const [a, b] of tplOf(type)) {
        if (a > m || b < m + SLOT || a < OPEN || b > CLOSE || b - a > maxLen) continue;
        list.push({ start: a, len: b - a, gain: benefit(d, a, b, reqList) });
      }
      for (const len of lengths) {
        for (let start = m - len + SLOT; start <= m; start += SLOT) {
          const st = Math.max(OPEN, Math.min(start, CLOSE - len));
          if (st > m || st + len <= m || list.some((w) => w.start === st && w.len === len)) continue;
          list.push({ start: st, len, gain: benefit(d, st, st + len, reqList) });
        }
      }
      // a parità di buchi chiusi: durata vicina a quella preferita (o la più corta), poi l'inizio più tardi
      return list.sort((a, b) => b.gain - a.gain || Math.abs(a.len - prefer) - Math.abs(b.len - prefer) || b.start - a.start);
    }
    function coverSlot(d, m, req) {
      if (req.station === 'HOSPITALITY') {
        // hospitality in sala: turni di 3–5h dove mancano più hospitality, con orari vari come nello storico
        const cands = hospitality.filter((e) => !isTrainee(e, d));
        const wins = windowsFor(d, m, [240, 270, 300, 210, 180], hospReqs, 240, 'HOSPITALITY', cfg.hospMax);
        // le hospitality sono poche: prima la copertura piena, la varietà solo a parità di copertura
        return pickPair(d, wins, cands, () => 'HOSPITALITY', false, canPlace, () => 0, 1);
      }
      if (req.station) {
        const pool = (req.opening ? flexible.filter((e) => (e.openings || []).includes(req.station) && autoOpenOk(e, req.station))
          : req.closing ? flexible.filter((e) => canClose(ctx, e, req.station))
          : flexible.filter((e) => e.trainings.includes(req.station) || (req.station === 'SERVIZIO' && e.type === 'HOSPITALITY')))
          .filter((e) => !isTrainee(e, d));
        const wins = windowsFor(d, m, [180, 210, 240, 150, 270, 300], [req], 0, 'CREW', cfg.crewMax);
        const st = (e) => (req.station === 'SERVIZIO' && e.type === 'HOSPITALITY' && !e.trainings.includes('SERVIZIO') ? 'HOSPITALITY' : req.station);
        // aperture/chiusure: prima i crew (le hospitality servono in sala); per la Sala di chiusura crew e hospitality alla pari
        const hospBias = req.station === 'SERVIZIO' && !req.opening ? 0 : -2;
        // in apertura si preferisce chi NON è segnato per le chiusure: chi chiude serve la sera (e dopo una chiusura non può aprire)
        const closerPenalty = (e) => (req.opening && (e.closings || []).length ? -1.5 : 0);
        return pickPair(d, wins, pool, (e) => st(e), false, canPlace, (e) => (e.type === 'HOSPITALITY' ? hospBias : 0) + closerPenalty(e));
      }
      const s1 = pickPair(d, windowsFor(d, m, LENGTHS, generic, 0, 'CREW', cfg.crewMax), crew, (e, a, b) => pickStation(e, d, a, b));
      if (s1) return s1;
      // nessuno libero: prova un doppio
      const dCands = crew.filter((e) => doublesLeft(e) > 0);
      const dWins = windowsFor(d, m, [D_MAX, 150, 120].filter((l) => l <= D_MAX), generic, 0, 'CREW', D_MAX);
      return pickPair(d, dWins, dCands, (e, a, b) => pickStation(e, d, a, b), true, canPlaceDouble);
    }
    const demand = (d) => generic.reduce((t, r) => t + reqMin(r, d) * (r.end - r.start), 0) / 60;
    const supply = (d) => crew.filter((e) => isAvail(ctx, e, d)).length * 3 + crew.reduce((t, e) => t + (e.doubleDays || 0), 0) * 3 / 7;
    const daysByDifficulty = [...ctx.days].sort((a, b) => (supply(a) - demand(a)) - (supply(b) - demand(b)) || a - b);
    for (const req of reqs) for (const d of daysByDifficulty) {
      const need = reqMin(req, d);
      if (!need) continue;
      let m = req.start;
      // la squadra di chiusura va coperta fino alla chiusura vera; le altre fasce (es. hospitality cena) fino alle 21:00,
      // così nessuna fascia obbliga una hospitality a restare fino alle 21:30
      const endC = req.closing ? req.end : covEnd(cfg, req);
      while (m < endC) {
        const c = countAt(ctx, d, m, req, shifts);
        if (c >= need) { m += SLOT; continue; }
        const s = coverSlot(d, m, req);
        if (s) { place(s); continue; }
        let n = m + SLOT;
        while (n < endC && countAt(ctx, d, n, req, shifts) < need) n += SLOT;
        const who = req.station ? ` formati ${req.opening ? 'per l\'apertura ' : 'in '}${STATIONS[req.station].label}` : '';
        notes.push(`${dayLabel(d)} · ${req.name}: dalle ${fmtTime(m)} alle ${fmtTime(n)} ci sono solo ${c}/${need} crew${who} (nessuno disponibile)`);
        m = n;
      }
    }

    /** Quanto è "affollata" una fascia: presenti / richiesti, in media sui quarti d'ora. */
    function crowding(d, start, end, reqList = generic, countReq = null) {
      let tot = 0, n = 0;
      for (let t = start; t < end; t += SLOT) {
        let want = 0.5; // fuori dalle fasce richieste: poco utile aggiungere gente
        for (const r of reqList) if (t >= r.start && t < r.end) want = Math.max(want, reqMin(r, d));
        tot += (countAt(ctx, d, t, countReq, shifts) + 1) / want; n++;
      }
      return n ? tot / n : Infinity;
    }

    // 2. riempimento ore di contratto (prima gli orari dei rush)
    const fillStarts = {
      CREW: [720, 1080, 1110, 690, 750, 1050, 660, 780, 1140, 630, 840, 900, 540, 480, 450],
      HOSPITALITY: [1050, 1020, 990, 660, 690, 720, 750, 780, 960, 1080, 1110, 630, 450],
    };
    for (const e of [...flexible].sort((a, b) => remaining(b) - remaining(a))) {
      let guard = 0;
      while (remaining(e) >= cfg.minShift && guard++ < 14) {
        const free = ctx.days.filter((d) => isAvail(ctx, e, d) && !dayMain(e.id, d).length);
        if (!free.length) break;
        const rem = remaining(e), max = Math.max(...free.map((d) => (e.type === 'CREW' && !isWeekend(d) ? cfg.crewMaxWeekday ?? 240 : maxFor(cfg, e, d))));
        const even = rem / free.length;
        const lens = free.length === 1 ? [rem] : [...new Set([Math.round(even / 15) * 15, roundUp30(ceilDiv(rem, free.length)), Math.floor(even / 30) * 30, Math.ceil(even / 15) * 15, Math.floor(even / 15) * 15])]
          .map((l) => Math.min(clamp(l, cfg.minShift, max), rem));
        const isHt = e.type === 'HOSPITALITY';
        const crowd = (d, a, b) => (isHt ? crowding(d, a, b, hospReqs, { station: 'HOSPITALITY' }) : crowding(d, a, b));
        let placed = null;
        // le ore in più vanno dove c'è meno gente rispetto a quella richiesta, con orari reali e vari
        for (const len of lens) {
          const opts = [];
          for (const d of free) {
            for (const st of fillStarts[e.type]) if (st >= OPEN && st + len <= CLOSE) opts.push([d, st, st + len]);
            for (const [a, b] of tplOf(e.type)) {
              const dl = b - a;
              if (Math.abs(dl - len) <= 30 && dl <= rem && dl <= max && dl >= cfg.minShift && a >= OPEN && b <= CLOSE) opts.push([d, a, b]);
            }
          }
          const scored = opts.map(([d, a, b]) => ({ d, a, b, sc: crowd(d, a, b) - natural(e, d, a, b) * 0.35 - rushBalance(pickStation(e, d, a, b), d, a, b) * 0.5 })).sort((x, y) => x.sc - y.sc);
          for (const o of scored) {
            const s = { employeeId: e.id, day: o.d, start: o.a, end: o.b, station: pickStation(e, o.d, o.a, o.b), doppio: false };
            if (canPlace(e, s)) { placed = s; break; }
          }
          if (placed) break;
        }
        if (!placed) break;
        place(placed);
      }
    }

    // 3. doppi rimasti: rush di pranzo o cena, prima nel weekend
    const RUSH = [[720, 900], [1080, 1260]];
    const dayPref = [...ctx.days].sort((a, b) => [5, 6, 4, 0, 1, 2, 3].indexOf(dow(a) - 1) - [5, 6, 4, 0, 1, 2, 3].indexOf(dow(b) - 1));
    for (const e of flexible.filter((x) => doublesLeft(x) > 0)) {
      for (const d of dayPref) {
        if (doublesLeft(e) <= 0) break;
        const main = dayMain(e.id, d);
        if (main.length !== 1) continue;
        // il rush lontano dal turno normale; dentro il rush l'orario dove manca più gente
        const opts = [];
        for (const [a, b] of RUSH) for (let st = a; st + D_MAX <= b; st += 30) opts.push({ start: st, end: st + D_MAX, gain: benefit(d, st, st + D_MAX) });
        opts.sort((x, y) => y.gain - x.gain || x.start - y.start);
        for (const o of opts) {
          const s = { employeeId: e.id, day: d, start: o.start, end: o.end, station: pickStation(e, d, o.start, o.end), doppio: true };
          if (canPlaceDouble(e, s)) { place(s); break; }
        }
      }
      if (doublesLeft(e) > 0) notes.push(`${fullName(e)}: non è stato possibile mettere ${doublesLeft(e)} doppi su ${e.doubleDays}`);
    }

    // 4. rifinitura
    for (const e of flexible) {
      let rem = remaining(e);
      if (rem <= 0) continue;
      for (const s of added.filter((x) => x.employeeId === e.id && !isDouble(x)).sort((a, b) => dur(a) - dur(b))) {
        if (rem <= 0) break;
        const room = maxFor(cfg, e, s.day) - sumDur(dayMain(e.id, s.day));
        let ext = Math.floor(Math.min(rem, room) / 15) * 15;
        while (ext > 0) {
          const later = { ...s, end: s.end + ext }, earlier = { ...s, start: s.start - ext };
          const ok = [later, earlier].find((c) => c.end <= CLOSE && c.start >= OPEN && canPlace(e, c, s));
          if (ok) { replace(s, ok); rem -= ext; break; }
          ext -= 15;
        }
      }
    }
    // 5. riparazione: se resta un buco, sposta un turno dello stesso giorno (stessa durata) per chiuderlo
    //    senza aprirne altri. Con opts.moveAll sposta anche i turni che c'erano già.
    const movable = () => (opts.moveAll ? shifts : added).filter((x) => { const e = ctx.byId.get(x.employeeId); return e && !e.fixedShift && !isDouble(x); });
    function swapIn(old, neu) {
      shifts[shifts.indexOf(old)] = neu;
      const k = added.indexOf(old);
      if (k >= 0) added[k] = neu; else if (opts.moveAll) added.push(neu);
    }
    for (let pass = 0; pass < 4; pass++) {
      let improved = false;
      for (const d of ctx.days) {
        let base = deficitOf(ctx, shifts, d);
        if (!base) continue;
        for (const r of reqs) {
          const need = reqMin(r, d);
          if (!need) continue;
          for (let m = r.start; m < r.end && base; m += SLOT) {
            if (countAt(ctx, d, m, r, shifts) >= need) continue;
            let fixed = false;
            for (const old of movable().filter((x) => x.day === d)) {
              const e = ctx.byId.get(old.employeeId), len = old.end - old.start;
              let stations = [old.station];
              if (r.station) {
                const ok = r.opening ? (e.openings || []).includes(r.station) && autoOpenOk(e, r.station)
                  : r.closing ? canClose(ctx, e, r.station)
                  : e.trainings.includes(r.station) || r.station === old.station || (r.station === 'SERVIZIO' && e.type === 'HOSPITALITY');
                if (!ok || isTrainee(e, d)) continue;
                stations = [r.station === 'SERVIZIO' && e.type === 'HOSPITALITY' && !e.trainings.includes('SERVIZIO') ? 'HOSPITALITY' : r.station];
              }
              for (let a = Math.max(OPEN, m - len + SLOT); !fixed && a <= m && a + len <= CLOSE; a += SLOT) {
                for (const st of stations) {
                  if (a === old.start && st === old.station) continue;
                  const cand = { ...old, start: a, end: a + len, station: st };
                  if (!countsFor(ctx, cand, r) || !canPlace(e, cand, old)) continue;
                  swapIn(old, cand);
                  const nd = deficitOf(ctx, shifts, d);
                  if (nd < base) { base = nd; fixed = true; improved = true; break; }
                  swapIn(cand, old);
                }
              }
              if (fixed) break;
            }
          }
        }
      }
      if (!improved) break;
    }

    // 6. squadre di chiusura incomplete: chi è segnato per chiudere spesso apre anche il giorno dopo (e allora non può chiudere).
    //    A) si sposta il suo turno della sera fino alla chiusura; B) se il giorno dopo apre, scambia quel turno con un collega
    //    che può aprire (il collega apre, lui prende il turno più tardi del collega) e così può chiudere.
    //    Si tiene il cambio solo se i buchi di copertura dei due giorni diminuiscono.
    const closingReqs = ctx.coverage.filter((r) => r.closing && r.exact && r.station);
    const movableSet = () => new Set(movable());
    const plain = (x, id) => ({ employeeId: id, day: x.day, start: x.start, end: x.end, station: x.station, doppio: false });
    const closeStation = (e, st) => (st === 'SERVIZIO' && e.type === 'HOSPITALITY' && !e.trainings.includes('SERVIZIO') ? 'HOSPITALITY' : st);
    const canDo = (e, x) => (x.start <= OPEN ? (e.openings || []).includes(x.station) && autoOpenOk(e, x.station)
      : e.type === 'HOSPITALITY' ? x.station === 'HOSPITALITY' || x.station === 'SERVIZIO' : e.trainings.includes(x.station) || x.station === 'FRONT');
    // quanto manca nei giorni indicati: { team } = squadre di apertura/chiusura, { other } = tutte le altre fasce
    const lossOf = (days) => {
      const n = { team: 0, other: 0 };
      for (const x of days) for (const r of ctx.coverage) {
        const need = reqMin(r, x);
        if (!need) continue;
        const k = r.opening || r.closing ? 'team' : 'other', end = r.closing ? r.end : covEnd(cfg, r);
        for (let m = r.start; m < end; m += SLOT) n[k] += Math.max(0, need - countAt(ctx, x, m, r, shifts));
      }
      return n;
    };
    // un cambio si tiene solo se completa di più le squadre senza scoprire niente altrove
    const better = (now, base) => now.team < base.team && now.other <= base.other;
    /** Prova a far chiudere e nella postazione di r il giorno d, spostando il suo turno di quel giorno (old). */
    function closeWith(e, d, r, old) {
      const lens = [...new Set([old ? dur(old) : 0, 180, 210, 240, 270, 300].filter((l) => l >= cfg.minShift))];
      for (const len of lens) {
        const cand = { employeeId: e.id, day: d, start: CLOSE - len, end: CLOSE, station: closeStation(e, r.station), doppio: false };
        if (!countsFor(ctx, cand, r)) continue;
        if (old ? canPlace(e, cand, old) : canPlace(e, cand)) { if (old) swapIn(old, cand); else place(cand); return { cand, old }; }
      }
      return null;
    }
    const undoClose = (res) => { if (res.old) swapIn(res.cand, res.old); else { shifts.splice(shifts.indexOf(res.cand), 1); added.splice(added.indexOf(res.cand), 1); } };
    for (let pass = 0; pass < 3; pass++) {
      let improved = false;
      for (const d of ctx.days) for (const r of closingReqs) {
        const t = teamSlot(r), need = reqMin(r, d);
        if (!need || countAt(ctx, d, t, r, shifts) >= need) continue;
        // il turno dopo la chiusura: il giorno dopo, oppure (se il giorno dopo è riposo) quello successivo (stacco di 36h)
        const nextDayOf = (e) => (ctx.days.includes(d + 1) && isAvail(ctx, e, d + 1) ? d + 1 : ctx.days.includes(d + 2) && !isAvail(ctx, e, d + 1) ? d + 2 : null);
        const closers = flexible.filter((e) => canClose(ctx, e, r.station) && !isTrainee(e, d) && isAvail(ctx, e, d));
        for (const e of closers) {
          if (countAt(ctx, d, t, r, shifts) >= need) break;
          const mv = movableSet();
          const old = dayMain(e.id, d)[0];
          if (old && (!mv.has(old) || old.end >= CLOSE)) continue;
          const nd = nextDayOf(e), span = nd ? [d, nd] : [d];
          const base = lossOf(span);
          // A) solo spostando il turno della sera
          let res = closeWith(e, d, r, old);
          if (res) { if (better(lossOf(span), base)) { improved = true; continue; } undoClose(res); }
          // B) scambio con l'apertura (o il turno presto) del giorno dopo
          const nxt = nd ? dayMain(e.id, nd)[0] : null;
          if (!old || !nxt || !mv.has(nxt) || nxt.end >= CLOSE) continue;
          for (const f of flexible) {
            if (f === e || f.fixedShift || isTrainee(f, nd) || !canDo(f, nxt)) continue;
            const y = dayMain(f.id, nd)[0];
            if (!y || !mv.has(y) || y.start <= nxt.start || y.end >= CLOSE || !canDo(e, y)) continue;
            const yE = plain(y, e.id), nF = plain(nxt, f.id);
            if (!canPlace(e, yE, nxt)) continue;
            swapIn(nxt, yE);
            if (!canPlace(f, nF, y)) { swapIn(yE, nxt); continue; }
            swapIn(y, nF);
            res = closeWith(e, d, r, old);
            if (res && better(lossOf(span), base)) { improved = true; break; }
            if (res) undoClose(res);
            swapIn(nF, y); swapIn(yE, nxt);
          }
        }
      }
      if (!improved) break;
    }

    for (const e of emps) {
      const left = remaining(e);
      if (left > 0) notes.push(`${fullName(e)}: mancano ${fmtDur(left)} (nessuno spazio valido trovato)`);
    }
    return { added, notes, all: shifts };
  }

  root.Turni = {
    ABSENCE_TYPES, absenceInfo,
    STATIONS, CREW_STATIONS, TYPES, DOW_SHORT, DOW_LONG, RULES, DEFAULT_CONFIG, DEFAULT_COVERAGE,
    fmtTime, fmtDur, parseTime, parseHours, hoursText, toDay, toIso, dow, mondayOf, todayDay, shortDate, longDate, itDate, weekLabel,
    fullName, dur, isDouble, reqMin, covEnd, maxDaily, maxFor, isWeekend, isLongWeekday, isRigidAfternoon, isHybridAfternoon, isLongWithoutRush, makeCtx, shiftsOf, absenceOn, isRest, isAvail, started, isTrainee, canClose, worked, doubleWorked, target, coverageMin, deficitOf, validate, generate, forecastPeople, forecastDay,
  };
  if (typeof module !== 'undefined') module.exports = root.Turni;
})(typeof window !== 'undefined' ? window : globalThis);
