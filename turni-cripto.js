/*
 * Cifratura dei dati per il sito: AES-GCM 256 con chiave ricavata dalla password (PBKDF2-SHA256, 300.000 iterazioni).
 * Senza la password il file pubblicato è illeggibile. Tutto avviene nel browser: la password non viene mai inviata.
 */
(function (root) {
  'use strict';
  const subtle = () => (root.crypto && root.crypto.subtle) || null;
  const enc = { encode: (x) => new TextEncoder().encode(x) }, dec = { decode: (x) => new TextDecoder().decode(x) };
  const toB64 = (buf) => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); };
  const fromB64 = (str) => { const s = atob(str); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };
  const ITER = 300000;

  async function keyFrom(password, salt, iter) {
    const base = await subtle().importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  /** Cifra un oggetto con la password → oggetto JSON da pubblicare. */
  async function encrypt(obj, password) {
    if (!subtle()) throw new Error('Questo browser non supporta la cifratura');
    const salt = root.crypto.getRandomValues(new Uint8Array(16)), iv = root.crypto.getRandomValues(new Uint8Array(12));
    const key = await keyFrom(password, salt, ITER);
    const data = await subtle().encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
    return { app: 'pianificatore-turni', v: 1, alg: 'AES-GCM-256', kdf: 'PBKDF2-SHA256', iter: ITER, salt: toB64(salt), iv: toB64(iv), data: toB64(data), createdAt: new Date().toISOString() };
  }
  /** Decifra; se la password è sbagliata lancia un errore. */
  async function decrypt(box, password) {
    if (!subtle()) throw new Error('Questo browser non supporta la cifratura');
    const key = await keyFrom(password, fromB64(box.salt), box.iter || ITER);
    try {
      const plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, key, fromB64(box.data));
      return JSON.parse(dec.decode(plain));
    } catch (e) { throw new Error('Password sbagliata'); }
  }
  // ---- richieste del personale: chiave pubblica del locale (per cifrare) e privata del manager (per leggere) ----
  const RSA = { name: 'RSA-OAEP', hash: 'SHA-256' };
  /** Nuova coppia di chiavi del locale: { pub, priv } in base64. */
  async function newKeyPair() {
    const k = await subtle().generateKey({ ...RSA, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['encrypt', 'decrypt']);
    return { pub: toB64(await subtle().exportKey('spki', k.publicKey)), priv: toB64(await subtle().exportKey('pkcs8', k.privateKey)) };
  }
  /** Cifra un oggetto per il manager (lo può aprire solo chi ha la chiave privata). */
  async function sealFor(pubB64, obj) {
    const pub = await subtle().importKey('spki', fromB64(pubB64), RSA, false, ['encrypt']);
    const aes = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
    const iv = root.crypto.getRandomValues(new Uint8Array(12));
    const box = await subtle().encrypt({ name: 'AES-GCM', iv }, aes, enc.encode(JSON.stringify(obj)));
    const key = await subtle().encrypt(RSA, pub, await subtle().exportKey('raw', aes));
    return { box: toB64(box), key: toB64(key), iv: toB64(iv) };
  }
  async function openWith(privB64, sealed) {
    const priv = await subtle().importKey('pkcs8', fromB64(privB64), RSA, false, ['decrypt']);
    const raw = await subtle().decrypt(RSA, priv, fromB64(sealed.key));
    const aes = await subtle().importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    return JSON.parse(dec.decode(await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(sealed.iv) }, aes, fromB64(sealed.box))));
  }
  /** Impronta del codice personale (il codice vero non va mai online). */
  async function codeHash(store, emp, pin) {
    const h = await subtle().digest('SHA-256', enc.encode(`${store}|${emp}|${pin}`));
    return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // ---- orario personale pubblicato: cifrato con una chiave che deriva da nome utente + password del dipendente ----
  // (la conoscono solo lui e il manager, che ha creato le credenziali)
  async function personalKey(store, user, pw) {
    return toB64(await subtle().digest('SHA-256', enc.encode(`turni-orario|${store}|${user}|${pw}`)));
  }
  async function sealWith(keyB64, obj) {
    const k = await subtle().importKey('raw', fromB64(keyB64), 'AES-GCM', false, ['encrypt']);
    const iv = root.crypto.getRandomValues(new Uint8Array(12));
    return { box: toB64(await subtle().encrypt({ name: 'AES-GCM', iv }, k, enc.encode(JSON.stringify(obj)))), iv: toB64(iv) };
  }
  async function openSealed(keyB64, sealed) {
    const k = await subtle().importKey('raw', fromB64(keyB64), 'AES-GCM', false, ['decrypt']);
    return JSON.parse(dec.decode(await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(sealed.iv) }, k, fromB64(sealed.box))));
  }

  root.TurniCripto = { encrypt, decrypt, newKeyPair, sealFor, openWith, codeHash, personalKey, sealWith, openSealed, supported: () => !!subtle() && typeof TextEncoder !== 'undefined' };
  if (typeof module !== 'undefined') module.exports = root.TurniCripto;
})(typeof window !== 'undefined' ? window : globalThis);
