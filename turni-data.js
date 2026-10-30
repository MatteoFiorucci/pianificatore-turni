/*
 * Dati iniziali e aggiornamento dei dati salvati nel browser.
 * Nessun dato personale: se sul computer c'è il file privato (privato/turni-privato.js, escluso dalla pubblicazione)
 * si parte dal personale reale; altrimenti l'app parte vuota.
 */
(function (root) {
  'use strict';
  const T = root.Turni || (typeof require !== 'undefined' ? require('./turni-core.js') : null);
  const VERSION = 25;

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
    if (!st.nextId) st.nextId = Math.max(1, ...st.employees.map((e) => e.id), ...st.shifts.map((x) => x.id || 0), ...st.absences.map((a) => a.id || 0)) + 1;
    st.version = Math.max(st.version || 1, VERSION);
    return st;
  }

  root.TurniData = { sampleState, emptyState, migrate, VERSION };
  if (typeof module !== 'undefined') module.exports = root.TurniData;
})(typeof window !== 'undefined' ? window : globalThis);
