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
  root.TurniCripto = { encrypt, decrypt, supported: () => !!subtle() && typeof TextEncoder !== 'undefined' };
  if (typeof module !== 'undefined') module.exports = root.TurniCripto;
})(typeof window !== 'undefined' ? window : globalThis);
