/*
 * Dati iniziali e aggiornamento dei dati salvati nel browser.
 * Nessun dato personale: se sul computer c'è il file privato (privato/turni-privato.js, escluso dalla pubblicazione)
 * si parte dal personale reale; altrimenti l'app parte vuota.
 */
(function (root) {
  'use strict';
  const T = root.Turni || (typeof require !== 'undefined' ? require('./turni-core.js') : null);
  const VERSION = 20;

  function emptyState() {
    return {
      version: VERSION, employees: [], shifts: [], absences: [],
      coverage: T.DEFAULT_COVERAGE.map((c) => ({ ...c, min: [...c.min] })),
      config: { ...T.DEFAULT_CONFIG }, forecasts: {}, targets: {}, nextId: 1,
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
    for (const e of st.employees || []) {
      for (const [k, v] of Object.entries({ trainings: [], openings: [], closings: [], restDays: [], doubleDays: 0, fixedShift: null, trainee: false, traineeUntil: null, startDate: null, active: true })) {
        if (e[k] === undefined) e[k] = Array.isArray(v) ? [] : v;
      }
    }
    if (!st.nextId) st.nextId = Math.max(1, ...st.employees.map((e) => e.id), ...st.shifts.map((x) => x.id || 0), ...st.absences.map((a) => a.id || 0)) + 1;
    st.version = Math.max(st.version || 1, VERSION);
    return st;
  }

  root.TurniData = { sampleState, emptyState, migrate, VERSION };
  if (typeof module !== 'undefined') module.exports = root.TurniData;
})(typeof window !== 'undefined' ? window : globalThis);
