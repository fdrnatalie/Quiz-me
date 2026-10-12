/* Celular do convidado (opcional): escolhe o nome e responde as perguntas. */
(function () {
  const { h, post, connect, avatar, toast, secondsLeft } = App;
  const app = document.getElementById('app');
  const conn = document.getElementById('conn');
  let S = null;
  let me = null;
  let sent = ''; // resposta enviada na pergunta atual
  let sentFor = '';

  try { me = localStorage.getItem('quiz-me-gid'); } catch (e) { /* armazenamento indisponível */ }

  function setMe(id) {
    me = id;
    try { id ? localStorage.setItem('quiz-me-gid', id) : localStorage.removeItem('quiz-me-gid'); } catch (e) { /* ignora */ }
    render();
  }

  async function send(text) {
    text = String(text || '').trim();
    if (!text) return;
    try {
      await post('/api/play/answer', { gid: me, text });
      sent = text;
      sentFor = S.question.id;
      render();
    } catch (e) {
      toast(e.message);
    }
  }

  function header(g) {
    return h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
      avatar(g),
      h('div', { style: { fontWeight: 500 } }, g.name),
      h('div', { class: 'muted', style: { marginLeft: 'auto', fontSize: '14px' } }, `${S.scores.totals[g.id] || 0} pontos`),
      h('button', { class: 'icon-btn', 'aria-label': 'Não sou eu', title: 'Não sou eu', onclick: () => setMe(null) }, '↺')
    );
  }

  function pick() {
    return [
      h('div', { class: 'brand' }, 'Quiz da ', h('span', { class: 'it' }, S.quizName)),
      h('h1', {}, 'Quem é ', h('span', { class: 'it' }, 'você?')),
      S.guests.length
        ? S.guests.map((g) => h('button', { class: 'opt', onclick: () => setMe(g.id) }, avatar(g), g.name))
        : h('p', { class: 'muted' }, 'Ainda não há convidados inscritos. Peça para a dona do quiz cadastrar seu nome.'),
    ];
  }

  function body(g) {
    const parts = [header(g)];
    const p = S.phase;
    if (p === 'setup' || p === 'lobby') {
      parts.push(h('h1', {}, p === 'setup' ? 'Já já começa…' : 'Prepare-se!'), h('p', { class: 'muted' }, 'Olhe a TV. A primeira pergunta vai aparecer em instantes.'));
    } else if (p === 'question') {
      const q = S.question;
      if (sentFor !== q.id) { sent = ''; }
      const progress = h('div', { class: 'progress' }, h('i', { style: { width: ((S.qIndex + 1) / S.total) * 100 + '%' } }));
      parts.push(progress, h('div', { class: 'eyebrow' }, `Pergunta ${S.qIndex + 1}${q.double ? ' · vale 2x' : ''} · `, h('span', { id: 'left' }, secondsLeft(S) + 's')), h('h1', {}, q.text));
      parts.push(
        h(
          'form',
          {
            style: { display: 'flex', flexDirection: 'column', gap: '12px' },
            onsubmit: (e) => { e.preventDefault(); send(e.target.elements.ans.value); },
          },
          h('label', { for: 'ans', class: 'sr' }, 'Sua resposta'),
          h('input', { id: 'ans', name: 'ans', class: 'field', placeholder: 'Sua resposta', autocomplete: 'off', value: sent, maxlength: '120' }),
          h('button', { class: 'btn dark', type: 'submit', style: { minHeight: '56px' } }, sent ? 'Trocar resposta' : 'Enviar')
        ),
        sent ? h('p', { class: 'muted', style: { textAlign: 'center' } }, `Enviado: "${sent}". Olhe a TV!`) : null
      );
    } else if (p === 'reveal') {
      const a = (S.answers || {})[g.id];
      const ok = a && a.status !== 'errada';
      parts.push(
        h('div', { class: 'eyebrow' }, `Pergunta ${S.qIndex + 1}`),
        h('h1', {}, a ? (ok ? 'Acertou!' : 'Não foi dessa vez.') : 'Sem resposta.'),
        h('p', { class: 'muted' }, `${S.quizName} respondeu: `, h('strong', { style: { color: 'var(--ink)' } }, S.question.answer)),
        a ? h('p', { class: 'muted' }, `Você disse: ${a.text}${a.points ? ' · +' + a.points + ' pontos' : ''}`) : null
      );
    } else if (p === 'final') {
      const pos = S.ranking.findIndex((r) => r.id === g.id) + 1;
      parts.push(h('div', { class: 'eyebrow' }, 'Fim de jogo'), h('h1', {}, pos === 1 ? 'Você ganhou!' : `Você ficou em ${pos}º lugar`), h('p', { class: 'muted' }, `${S.scores.totals[g.id] || 0} pontos no total.`));
    }
    return parts;
  }

  function render() {
    if (!S) return;
    const ae = document.activeElement;
    const typing = ae && ae.id === 'ans' ? ae.value : null;
    const g = me && S.guests.find((x) => x.id === me);
    if (me && !g) { me = null; }
    app.replaceChildren(...(g ? body(g) : pick()).flat());
    if (typing !== null) {
      const n = document.getElementById('ans');
      if (n) { n.value = typing; n.focus(); }
    }
  }

  connect('play', (s) => {
    const changed = !S || S.qIndex !== s.qIndex || S.phase !== s.phase;
    S = s;
    if (changed && s.phase !== 'question') { sent = ''; sentFor = ''; }
    render();
  }, (ok) => { conn.hidden = ok; });

  setInterval(() => {
    const el = document.getElementById('left');
    if (el && S) el.textContent = secondsLeft(S) + 's';
  }, 500);
})();
