/* Utilitários compartilhados pelas telas (apresentadora, TV e celular). */
(function () {
  let offset = 0; // diferença entre o relógio do servidor e o deste aparelho

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(c));
    }
    return el;
  }

  async function post(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Algo deu errado.');
    return data;
  }

  function connect(role, onState, onStatus) {
    const es = new EventSource('/events?role=' + role);
    es.onmessage = (e) => {
      const s = JSON.parse(e.data);
      offset = s.serverNow - Date.now();
      onState(s);
    };
    es.onopen = () => onStatus && onStatus(true);
    es.onerror = () => onStatus && onStatus(false);
    return es;
  }

  const serverNow = () => Date.now() + offset;
  const initial = (name) => (String(name).trim()[0] || '?').toUpperCase();

  function avatar(g, cls) {
    return h('span', { class: cls || 'avatar', style: { background: g.color } }, initial(g.name));
  }

  function secondsLeft(s) {
    if (!s.startedAt) return s.settings.seconds;
    return Math.max(0, Math.ceil(s.settings.seconds - (serverNow() - s.startedAt) / 1000));
  }

  let toastTimer;
  function toast(msg) {
    document.querySelectorAll('.toast').forEach((n) => n.remove());
    const t = h('div', { class: 'toast', role: 'status' }, msg);
    document.body.append(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 3500);
  }

  function qrSvg(text) {
    if (typeof qrcode !== 'function') return null;
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }

  /** Melhor endereço para os celulares: um IP da rede local (não localhost). */
  function phoneUrl(s) {
    const base = location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? (s.lan && s.lan[0]) || location.origin : location.origin;
    return base.replace(/\/$/, '') + '/play';
  }

  window.App = { h, post, connect, serverNow, avatar, initial, secondsLeft, toast, qrSvg, phoneUrl };
})();
