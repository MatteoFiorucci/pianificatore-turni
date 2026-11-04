/*
 * Dati iniziali e aggiornamento dei dati salvati nel browser.
 * Nessun dato personale: se sul computer c'è il file privato (privato/turni-privato.js, escluso dalla pubblicazione)
 * si parte dal personale reale; altrimenti l'app parte vuota.
 */
(function (root) {
  'use strict';
  const T = root.Turni || (typeof require !== 'undefined' ? require('./turni-core.js') : null);
  const VERSION = 31;

  function emptyState() {
    return {
      version: VERSION, employees: [], shifts: [], absences: [],
      coverage: T.DEFAULT_COVERAGE.map((c) => ({ ...c, min: [...c.min] })),
      config: { ...T.DEFAULT_CONFIG }, forecasts: {}, targets: {}, nextId: 1, requests: [], reqCodes: {}, reqCreds: {},
    };
  }

  function sampleState() {
    const P = root.TurniPrivato;
    return P && P.sampleState ? migrate(P.sampleState()) : emptyState();
  }

  /** Completa i dati salvati con i campi aggiunti nelle versioni successive (senza toccare quelli esistenti). */
  function migrate(st) {
    const P = root.TurniPrivato;
    if (P && P.migrate) st = P.migrate(st);
    st.coverage = st.coverage || T.DEFAULT_COVERAGE.map((c) => ({ ...c, min: [...c.min] }));
    st.config = { ...T.DEFAULT_CONFIG, ...(st.config || {}) };
    st.forecasts = st.forecasts || {};
    st.targets = st.targets || {};
    st.absences = st.absences || [];
    st.shifts = st.shifts || [];
    // v23: richieste del personale (portale), codici personali per i link, chiavi del locale
    st.requests = st.requests || [];
    st.reqCodes = st.reqCodes || {};
    // v24: accessi del personale all'app Richieste (nome utente, password, impronta)
    st.reqCreds = st.reqCreds || {};
    // v25: settimane pubblicate per i dipendenti (copia fissata al momento della pubblicazione)
    st.publishedWeeks = st.publishedWeeks || {};
    // v26: eventi e chiusure (sezione Previsioni) e suggerimenti ignorati
    st.eventi = st.eventi || [];
    st.eventiIgnorati = st.eventiIgnorati || [];
    // riposi spostati per una sola settimana: { lunedì: { idDipendente: [giorni] } }
    st.restWeek = st.restWeek || {};
    // manager: squadra e turni (calendario a parte)
    st.managers = st.managers || [];
    st.mgrShifts = st.mgrShifts || [];
    for (const e of st.employees || []) {
      for (const [k, v] of Object.entries({ trainings: [], openings: [], closings: [], restDays: [], doubleDays: 0, fixedShift: null, trainee: false, traineeUntil: null, startDate: null, active: true })) {
        if (e[k] === undefined) e[k] = Array.isArray(v) ? [] : v;
      }
    }
    // v21: la Sala in chiusura non è più "sempre hospitality". Se qualcuno era già segnato per chiudere la Sala,
    // le hospitality (che prima potevano sempre) vengono segnate anche loro, così non cambia niente finché non lo decide il manager.
    if ((st.version || 1) < 21 && (st.employees || []).some((e) => (e.closings || []).includes('SERVIZIO'))) {
      for (const e of st.employees) if (e.type === 'HOSPITALITY' && !e.closings.includes('SERVIZIO')) e.closings.push('SERVIZIO');
    }
    // v22: squadra di chiusura confermata dal manager: lun–gio 1 McCafé + 1 Sala + 2 MFY, ven–dom 1 + 2 + 3
    if ((st.version || 1) < 22) {
      const fix = { c11: [1, 1, 1, 1, 1, 1, 1], c12: [1, 1, 1, 1, 2, 2, 2], c13: [2, 2, 2, 2, 3, 3, 3] };
      for (const r of st.coverage) if (fix[r.id]) r.min = [...fix[r.id]];
    }
    // v26: presidio delle postazioni 10:30–21:00 (1 MFY, 1 OA, 1 McCafé, 1 Sala), messo prima delle fasce hospitality
    if ((st.version || 1) < 26) {
      for (const id of ['p1', 'p2', 'p3', 'p4']) {
        if (st.coverage.some((r) => r.id === id)) continue;
        const d = T.DEFAULT_COVERAGE.find((r) => r.id === id), at = st.coverage.findIndex((r) => r.station === 'HOSPITALITY');
        st.coverage.splice(at < 0 ? st.coverage.length : at, 0, { ...d, min: [...d.min] });
      }
    }
    // v27: le postazioni coperte sono un consiglio (non un obbligo) e non si chiamano più "Presidio"
    if ((st.version || 1) < 27) for (const r of st.coverage) if (['p1', 'p2', 'p3', 'p4'].includes(r.id)) { r.soft = true; r.name = r.name.replace(/^Presidio /, 'Postazione '); }
    // v28: impegno → turno finito 30 minuti prima oppure iniziato 2 ore dopo (scelta del manager, 3/11/2026)
    if ((st.version || 1) < 28) { st.config.requestMargin = 30; st.config.requestAfter = 120; }
    // v29: da venerdì a domenica alle 9:00 entra il secondo McCafé (richiesta del manager, 4/11/2026)
    if ((st.version || 1) < 29 && !st.coverage.some((r) => r.id === 'm2')) {
      const d = T.DEFAULT_COVERAGE.find((r) => r.id === 'm2'), at = st.coverage.findIndex((r) => r.id === 'c1');
      st.coverage.splice(at + 1, 0, { ...d, min: [...d.min] });
    }
    // v30: il secondo McCafé serve in supporto di chi apre, cioè dalle 9:00 alle 10:30 (non fino a mezzogiorno)
    if ((st.version || 1) < 30) for (const r of st.coverage) if (r.id === 'm2' && r.end === 720) r.end = 630;
    // v31: impostazioni dello store (sezione Store): postazioni, orari per giorno, regole dei manager.
    // Si riempiono con i valori usati finora, così non cambia niente finché il manager non le modifica.
    if ((st.version || 1) < 31) {
      if (!Array.isArray(st.config.stations) || !st.config.stations.length) st.config.stations = T.DEFAULT_STATIONS.map((x) => ({ ...x }));
      if (!st.config.hours) st.config.hours = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [d, { open: st.config.open ?? 450, close: st.config.close ?? 1290 }]));
      if (!st.config.mgr) st.config.mgr = { short: [180, 300], long: [390, 510], rest: 720, rest36: 2160, orderBy: 690, restDays: [1, 2, 3, 4], minPerDay: 2 };
    }
    if (!st.nextId) st.nextId = Math.max(1, ...st.employees.map((e) => e.id), ...st.shifts.map((x) => x.id || 0), ...st.absences.map((a) => a.id || 0)) + 1;
    st.version = Math.max(st.version || 1, VERSION);
    return st;
  }

  root.TurniData = { sampleState, emptyState, migrate, VERSION };
  if (typeof module !== 'undefined') module.exports = root.TurniData;
})(typeof window !== 'undefined' ? window : globalThis);
