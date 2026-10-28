/*
 * Salvataggio online (Firebase: accesso con email/password + database Firestore), uguale su PC e telefono.
 * I dati vengono cifrati NEL BROWSER con la password (AES-GCM 256, chiave PBKDF2-SHA256 300.000 iterazioni)
 * prima di essere inviati: online c'è solo un blocco illeggibile. Ogni utente può leggere/scrivere solo il suo documento.
 * Le chiavi di accesso al progetto (turni-cloud-config.js) sono pubbliche per natura: non danno accesso ai dati.
 */
(function (root) {
  'use strict';
  const LS = 'turni-cloud-v1';
  const ITER = 300000;
  const cfg = () => root.TURNI_CLOUD_CONFIG || {};
  const subtle = () => root.crypto && root.crypto.subtle;
  const toB64 = (buf) => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  const fromB64 = (str) => { const s = atob(str); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };

  // ---- memoria locale della sessione (per dispositivo) ----
  function read() { try { return JSON.parse(root.localStorage.getItem(LS)) || null; } catch (e) { return null; } }
  function write(s) { try { if (s) root.localStorage.setItem(LS, JSON.stringify(s)); else root.localStorage.removeItem(LS); } catch (e) { /* niente */ } }
  function patch(p) { const s = read(); if (s) write(Object.assign(s, p)); }

  let idToken = null, idExp = 0, key = null;

  const configured = () => !!(cfg().apiKey && cfg().projectId);
  const session = () => read();
  const loggedIn = () => !!(configured() && read() && read().refreshToken && read().key);

  class CloudError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

  async function post(url, body, form) {
    let r;
    try {
      r = await fetch(url, form
        ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() }
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) { throw new CloudError('OFFLINE', 'Nessuna connessione a internet'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const m = (j.error && (j.error.message || j.error)) || String(r.status);
      throw new CloudError(String(m), authMessage(String(m)));
    }
    return j;
  }
  function authMessage(m) {
    if (/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|INVALID_EMAIL/.test(m)) return 'Email o password sbagliate.';
    if (/USER_DISABLED/.test(m)) return 'Questo account è disattivato.';
    if (/TOO_MANY_ATTEMPTS/.test(m)) return 'Troppi tentativi: riprova tra qualche minuto.';
    if (/TOKEN_EXPIRED|INVALID_REFRESH_TOKEN|USER_NOT_FOUND|invalid_grant/i.test(m)) return 'Accesso scaduto: rientra con email e password.';
    if (/API key not valid|CONFIGURATION_NOT_FOUND|OPERATION_NOT_ALLOWED/.test(m)) return 'Il collegamento online non è configurato bene (accesso con email non attivo?).';
    return 'Errore del servizio online: ' + m;
  }

  async function token() {
    if (idToken && Date.now() < idExp - 60000) return idToken;
    const s = read();
    if (!s || !s.refreshToken) throw new CloudError('LOGGED_OUT', 'Non sei collegato.');
    let j;
    try { j = await post(`https://securetoken.googleapis.com/v1/token?key=${cfg().apiKey}`, { grant_type: 'refresh_token', refresh_token: s.refreshToken }, true); }
    catch (e) { if (e.code !== 'OFFLINE') { write(null); key = null; e.code = 'LOGGED_OUT'; } throw e; }
    idToken = j.id_token; idExp = Date.now() + (+j.expires_in || 3600) * 1000;
    if (j.refresh_token && j.refresh_token !== s.refreshToken) patch({ refreshToken: j.refresh_token });
    return idToken;
  }

  const docUrl = (uid) => `https://firestore.googleapis.com/v1/projects/${cfg().projectId}/databases/(default)/documents/turni/${uid}`;

  /** Legge il documento online: null se non esiste ancora. */
  async function getDoc() {
    const s = read();
    let r;
    try { r = await fetch(docUrl(s.uid), { headers: { Authorization: 'Bearer ' + await token() }, cache: 'no-store' }); }
    catch (e) { if (e instanceof CloudError) throw e; throw new CloudError('OFFLINE', 'Nessuna connessione a internet'); }
    if (r.status === 404) return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new CloudError('SERVER', dbMessage(j, r.status));
    const f = j.fields || {};
    const v = (k) => f[k] && (f[k].stringValue ?? f[k].integerValue);
    return { updateTime: j.updateTime, box: v('box'), iv: v('iv'), salt: v('salt'), z: +(v('z') || 0), savedAt: v('savedAt'), device: v('device') };
  }
  function dbMessage(j, status) {
    const st = j && j.error && j.error.status;
    if (st === 'PERMISSION_DENIED') return 'Il database online non dà il permesso (regole di sicurezza da controllare).';
    if (st === 'NOT_FOUND') return 'Database online non trovato (va creato Firestore nel progetto).';
    return 'Errore del database online (' + (st || status) + ').';
  }

  // ---- cifratura ----
  async function deriveKey(password, salt) {
    const base = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }
  async function currentKey() {
    if (key) return key;
    const s = read();
    key = await subtle().importKey('raw', fromB64(s.key), 'AES-GCM', false, ['encrypt', 'decrypt']);
    return key;
  }
  async function pipe(bytes, Stream) {
    const out = new Response(new Blob([bytes]).stream().pipeThrough(new Stream('gzip')));
    return new Uint8Array(await out.arrayBuffer());
  }
  async function seal(obj, k) {
    let bytes = new TextEncoder().encode(JSON.stringify(obj)), z = 0;
    if (typeof root.CompressionStream === 'function') { bytes = await pipe(bytes, root.CompressionStream); z = 1; }
    const iv = root.crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, k, bytes);
    return { box: toB64(ct), iv: toB64(iv), z };
  }
  async function open(doc, k) {
    let bytes;
    try { bytes = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(doc.iv) }, k, fromB64(doc.box))); }
    catch (e) { throw new CloudError('BAD_KEY', 'I dati online sono cifrati con una password diversa da quella attuale.'); }
    if (doc.z) {
      if (typeof root.DecompressionStream !== 'function') throw new CloudError('OLD_BROWSER', 'Questo browser è troppo vecchio: aggiornalo.');
      bytes = await pipe(bytes, root.DecompressionStream);
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function deviceName() {
    const ua = (root.navigator && root.navigator.userAgent) || '';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'telefono Android' : 'tablet Android';
    if (/Macintosh/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'PC Windows';
    return 'altro dispositivo';
  }

  /**
   * Accesso: verifica email/password, prepara la chiave e restituisce il documento online già decifrato (o null se vuoto).
   * Non cambia i dati: decide l'app cosa fare (usare quelli online o caricare quelli di questo dispositivo).
   */
  async function login(email, password) {
    if (!configured()) throw new CloudError('NOT_CONFIGURED', 'Il salvataggio online non è ancora configurato.');
    if (!subtle()) throw new CloudError('OLD_BROWSER', 'Questo browser non supporta la cifratura: usa Safari o Chrome aggiornati.');
    const j = await post(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${cfg().apiKey}`, { email, password, returnSecureToken: true });
    idToken = j.idToken; idExp = Date.now() + (+j.expiresIn || 3600) * 1000; key = null;
    write({ email: j.email || email, uid: j.localId, refreshToken: j.refreshToken, key: null, salt: null, lastUpdate: null, dirty: false });
    let doc;
    try { doc = await getDoc(); } catch (e) { write(null); throw e; }
    const salt = doc && doc.salt ? fromB64(doc.salt) : root.crypto.getRandomValues(new Uint8Array(16));
    const k = await deriveKey(password, salt);
    let data = null;
    if (doc) {
      try { data = await open(doc, k); }
      catch (e) { if (e.code !== 'BAD_KEY') { write(null); throw e; } data = undefined; } // undefined = illeggibile con questa password
    }
    patch({ key: toB64(await subtle().exportKey('raw', k)), salt: toB64(salt) });
    key = null;
    return { doc, data };
  }

  function logout() { write(null); idToken = null; key = null; }

  /**
   * Salva online. base = updateTime che ci aspettiamo online (null = documento nuovo; 'force' = sovrascrivi comunque).
   * Se nel frattempo qualcuno ha salvato da un altro dispositivo lancia CONFLICT.
   */
  async function push(state, base) {
    const s = read();
    const sealed = await seal({ state }, await currentKey());
    const savedAt = new Date().toISOString();
    const fields = {
      box: { stringValue: sealed.box }, iv: { stringValue: sealed.iv }, salt: { stringValue: s.salt },
      z: { integerValue: String(sealed.z) }, v: { integerValue: '1' }, savedAt: { stringValue: savedAt }, device: { stringValue: deviceName() },
    };
    const b = base === undefined ? s.lastUpdate : base;
    const pre = b === 'force' ? '' : b ? `?currentDocument.updateTime=${encodeURIComponent(b)}` : '?currentDocument.exists=false';
    let r;
    try { r = await fetch(docUrl(s.uid) + pre, { method: 'PATCH', headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) }); }
    catch (e) { if (e instanceof CloudError) throw e; throw new CloudError('OFFLINE', 'Nessuna connessione a internet'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const st = j.error && j.error.status;
      if (st === 'FAILED_PRECONDITION' || st === 'ALREADY_EXISTS' || (st === 'NOT_FOUND' && b)) throw new CloudError('CONFLICT', 'Dati modificati da un altro dispositivo');
      throw new CloudError('SERVER', dbMessage(j, r.status));
    }
    patch({ lastUpdate: j.updateTime, lastSavedAt: savedAt });
    return j.updateTime;
  }

  /** Legge i dati online: { changed:false } se sono gli stessi già presenti su questo dispositivo. */
  async function pull() {
    const doc = await getDoc();
    if (!doc) return { changed: false, doc: null };
    if (doc.updateTime === read().lastUpdate) return { changed: false, doc };
    const data = await open(doc, await currentKey());
    return { changed: true, doc, state: data.state };
  }

  root.TurniCloud = {
    configured, loggedIn, session, login, logout, push, pull, deviceName,
    setDirty: (d) => patch({ dirty: !!d }),
    setLastUpdate: (t) => patch({ lastUpdate: t }),
  };
})(typeof window !== 'undefined' ? window : globalThis);
