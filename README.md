# Pianificatore turni

Web app per pianificare gli orari settimanali di un ristorante: crew, hospitality, doppi turni e manager.

- **Generatore automatico**: prima i turni dei manager, poi crew e hospitality, rispettando ore di contratto,
  riposi, stacchi, aperture e chiusure, formazione, richieste del personale ed eventi (chiusure, orari ridotti).
  "Risolvi problemi" propone la settimana migliore, sia per crew e hospitality sia per i manager.
- **Previsioni** di vendite, clienti (GC) e ore di lavoro, caricate da un file di previsioni automatiche o scritte a mano;
  posizioni ora per ora (VLH).
- **Stampe**: lineare del giorno, lineare ufficiale e riepilogo settimanale degli orari (anche PDF ed Excel).
- **App "Turni"** (richieste.html) per dipendenti e manager: turni personali e richieste, con notifiche al manager.
- **Impostazioni del locale** (sezione Store): orari, postazioni e regole, senza modificare il codice.

## Dati

- I dati del locale (personale, turni, previsioni) si salvano online **cifrati nel browser** prima dell'invio:
  senza la password del manager non sono leggibili. Senza accesso online restano solo nel browser.
- Copia su file: **Regole → Dati → Esporta / Importa dati**.
- In questo repository non c'è nessun dato del personale.

## File

| File | Contenuto |
| --- | --- |
| `index.html` | app del manager |
| `richieste.html` | app "Turni" per dipendenti e manager |
| `turni-core.js` | motore: regole, controlli e generatore dei turni di crew e hospitality |
| `turni-manager.js` | generatore e controlli dei turni manager |
| `turni-vlh.js` | posizioni ora per ora (VLH) |
| `turni-data.js` | struttura dei dati e aggiornamento dalle versioni precedenti |
| `turni-storico.js` | orari tipici usati dal generatore |
| `turni-cloud.js`, `turni-cripto.js` | salvataggio online e cifratura |
| `lineare-ufficiale.js`, `riepilogo.js` | stampe ed export |
