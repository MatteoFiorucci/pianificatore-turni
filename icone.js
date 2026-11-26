/*
 * Icone a linea dell'app (stesso disegno su ogni computer e telefono) e sostituzione automatica delle emoji:
 * ogni emoji che compare sullo schermo diventa la sua icona disegnata (anche in finestre e messaggi).
 */
(function (root) {
  'use strict';
  const ICON = {
  turni: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18M8 14h3M13 14h3M8 17.5h3"/>',
  giornaliero: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  vlh: '<rect x="5" y="4" width="14" height="17.5" rx="2.5"/><path d="M9 2.5h6v3H9zM8.5 11h7M8.5 14.5h7M8.5 18h4"/>',
  previsioni: '<path d="M3.5 17.5l5.5-5.5 4 4 7.5-7.5"/><path d="M15 8.5h5.5V14"/>',
  richieste: '<path d="M20.5 15a2 2 0 0 1-2 2H8l-4.5 4V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 12.5h5"/>',
  personale: '<circle cx="9" cy="8" r="3.6"/><path d="M2.5 20.5v-.5a6.5 6.5 0 0 1 13 0v.5"/><path d="M15.5 4.6a3.6 3.6 0 0 1 0 6.8M21.5 20.5v-.5a6.4 6.4 0 0 0-3.8-5.8"/>',
  regole: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  home: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
  genera: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="3"/>',
  risolvi: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3.5 17.3a1.8 1.8 0 0 0 2.6 2.6l5.8-5.8a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.4-.4-.4-2.4z"/>',
  altro: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
  avviso: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.1"/>',
  ok: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.7 2.7L16 10"/>',
  store: '<path d="M3.5 9.5 5.5 4h13l2 5.5"/><path d="M4.5 9.5V20h15V9.5"/><path d="M3.5 9.5h17"/><path d="M10 20v-5.5h4V20"/>',

  ok2: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  undo: '<path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5h10a5 5 0 0 1 0 10H11"/>',
  cap: '<path d="M2.5 9.5 12 5l9.5 4.5L12 14z"/><path d="M6.5 11.5v4.5c3 2.2 8 2.2 11 0v-4.5M21.5 9.5v5"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>',
  megafono: '<path d="M3.5 10v4h3l7 4.5v-13l-7 4.5z"/><path d="M17 9a4 4 0 0 1 0 6M6.5 14l1 5h3l-1-4.5"/>',
  cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.6 4.5 4.5 0 0 0 7 18.5z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  key: '<circle cx="8" cy="15" r="4.5"/><path d="m11.2 11.8 8.8-8.8M16.5 6.5l2.5 2.5M14 9l2 2"/>',
  share: '<path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 12v7.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V12"/>',
  pen: '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z"/><path d="M13.5 7l3 3"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.5L3.5 9M4 13a8 8 0 0 0 14.3 4.5l2.2-2.5"/><path d="M3.5 4v5h5M20.5 20v-5h-5"/>',
  flask: '<path d="M9.5 3h5M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7 15h10"/>',
  download: '<path d="M12 3.5V15M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 17v2.5A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5V17"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5v-.5a7.5 7.5 0 0 1 15 0v.5"/>',
  move: '<path d="M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/>',
  print: '<path d="M7 8.5V3.5h10v5"/><rect x="3.5" y="8.5" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  truck: '<path d="M2.5 6.5h11v10h-11zM13.5 10h4l3 3.5v3h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  sparkle: '<path d="M12 3.5 13.8 10 20.5 12l-6.7 2-1.8 6.5-1.8-6.5L3.5 12l6.7-2z"/>',
  pin: '<path d="M9 3.5h6l-1 5 3.5 3.5h-11L10 8.5zM12 12v8.5"/>',
  cono: '<path d="M7.5 10.5h9L12 21z"/><path d="M7 10.5a5 5 0 0 1 10 0"/>',
  tie: '<path d="M9.5 3.5h5l-1 3 2 9.5-3.5 4.5-3.5-4.5 2-9.5z"/>',
  hourglass: '<path d="M6.5 3.5h11M6.5 20.5h11M7.5 3.5c0 5 9 6 9 8.5s-9 3.5-9 8.5M16.5 3.5c0 5-9 6-9 8.5s9 3.5 9 8.5"/>',
  inbox: '<path d="M3.5 13.5 6 5h12l2.5 8.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19z"/><path d="M3.5 13.5H8.5l1.5 2.5h4l1.5-2.5h5"/>',
  // occhio barrato: "non si vede più" (togli dall'app del personale)
  nascondi: '<path d="M3 12s3.4-6.5 9-6.5c1.7 0 3.2.6 4.5 1.4M21 12s-3.4 6.5-9 6.5c-1.7 0-3.2-.6-4.5-1.4"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M4 20 20 4"/>',
  };
  const icon = (k, size = 19) => `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k] || ''}</svg>`;
  // emoji → icona
  const EMOJI = { '✅': 'ok', '⚠': 'avviso', '🎓': 'cap', '⭐': 'star', '🗑': 'trash', '🛠': 'risolvi', '📢': 'megafono', '☁': 'cloud', '📱': 'phone', '📲': 'phone',
    '🔒': 'lock', '🕐': 'giornaliero', '🕒': 'giornaliero', '⏳': 'hourglass', '🔔': 'bell', '🔑': 'key', '📤': 'share', '🏬': 'store', '🏪': 'store', '✍': 'pen', '✏': 'pen',
    '📄': 'file', '📈': 'previsioni', '⚙': 'genera', '🍦': 'cono', '🔄': 'refresh', '🗓': 'turni', '📅': 'turni', '🧪': 'flask', '📥': 'download', '🎉': 'sparkle',
    '🌙': 'moon', '👔': 'tie', '✋': 'move', '🖨': 'print', '📩': 'inbox', '✉': 'mail', '📨': 'mail', '📋': 'vlh', '🚚': 'truck', '🧩': 'grid', '🤖': 'sparkle',
    '👤': 'user', '👥': 'personale', '📌': 'pin', '📊': 'previsioni', '🔍': 'info', 'ℹ': 'info', 'ⓘ': 'info', '💡': 'sparkle', '❌': 'trash', '🔁': 'refresh', '🕓': 'giornaliero', '✕': 'x', '✖': 'x', '✓': 'ok2', '✔': 'ok2', '↩': 'undo', '↻': 'refresh', '↺': 'undo', '🚫': 'nascondi' };
  const RE = new RegExp('(' + Object.keys(EMOJI).map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')️?', 'g');
  const SKIP = /^(SCRIPT|STYLE|TEXTAREA|OPTION|SELECT|TITLE|INPUT|svg|title)$/;
  function swap(node) {
    if (node.nodeType === 3) {
      const t = node.nodeValue; RE.lastIndex = 0;
      if (!RE.test(t)) return;
      const p = node.parentNode; if (!p || SKIP.test(p.nodeName) || p.closest && p.closest('svg')) return;
      if (/^(OPTION|SELECT)$/.test(p.nodeName)) { node.nodeValue = t.replace(RE, '').replace(/^\s+/, ''); return; }
      const span = document.createElement('span'); span.className = 'ei-wrap';
      span.innerHTML = t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]).replace(RE, (m, e) => `<span class="ei">${icon(EMOJI[e], 16)}</span>`);
      p.replaceChild(span, node);
      return;
    }
    if (node.nodeType !== 1 || SKIP.test(node.nodeName)) return;
    if (/^(OPTION|SELECT)$/.test(node.nodeName)) { for (const o of node.querySelectorAll ? [node, ...node.querySelectorAll('option')] : [node]) if (o.nodeName === 'OPTION') { RE.lastIndex = 0; o.textContent = o.textContent.replace(RE, '').replace(/^\s+/, ''); } return; }
    for (const c of [...node.childNodes]) swap(c);
  }
  function start() {
    const st = document.createElement('style');
    st.textContent = '.ei-wrap{display:contents}.ei{display:inline-flex;vertical-align:-0.18em;margin:0 .12em}.ei .ico{width:1.1em;height:1.1em}';
    document.head.appendChild(st);
    swap(document.body);
    new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'characterData') swap(m.target); else for (const n of m.addedNodes) swap(n); } })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  // nelle finestre del browser (avvisi e conferme) le icone non si possono disegnare: lì le emoji si tolgono
  const clean = (t) => String(t ?? '').replace(RE, '').replace(/^\s+/, '');
  for (const f of ['alert', 'confirm', 'prompt']) { const orig = root[f]; if (orig) root[f] = function (msg, ...rest) { return orig.call(root, clean(msg), ...rest); }; }
  root.ICON = ICON; root.icon = icon;
  if (typeof document !== 'undefined') { if (document.body) start(); else document.addEventListener('DOMContentLoaded', start); }
})(window);
