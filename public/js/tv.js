/* Tela da TV: tudo grande, legível de longe e sem o gabarito antes da revelação. */
(function () {
  const { h, connect, avatar, qrSvg, phoneUrl, secondsLeft } = App;
  const stage = document.getElementById('stage');
  let S = null;
  let seenKey = '';
  const seen = new Set();

  const ring = (style) => h('div', { class: 'ring', style });
  const dot = (style) => h('div', { class: 'dot', style });
  const chip = (g) => h('div', { class: 'chip' }, avatar(g, 'av'), g.name);

  function topbar() {
    return h(
      'div',
      { class: 'topbar' },
      h('span', { class: 'name' }, 'Quiz da ', h('span', { class: 'accent' }, S.quizName)),
      h('div', { class: 'bar' }, h('i', { style: { width: ((S.qIndex + 1) / S.total) * 100 + '%' } })),
      h('span', { class: 'count' }, `${S.qIndex + 1} / ${S.total}`)
    );
  }

  function lobby(waiting) {
    const url = phoneUrl(S);
    const svg = qrSvg(url);
    const qr = h('div', { class: 'qr', 'aria-label': 'QR code para responder pelo celular' });
    if (svg) qr.innerHTML = svg;
    return [
      ring({ right: '-140px', top: '-140px', width: '460px', height: '460px' }),
      ring({ right: '-40px', top: '-40px', width: '260px', height: '260px' }),
      dot({ right: '140px', top: '96px', width: '26px', height: '26px', background: '#FF7A59' }),
      h(
        'div',
        { style: { position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2vh' } },
        h('div', { class: 'kicker', style: { color: '#B5AC9B' } }, 'O quanto você me conhece?'),
        h('h1', { style: { fontSize: 'clamp(64px,11vw,190px)' } }, 'Quiz da', h('br'), h('span', { class: 'accent' }, S.quizName))
      ),
      h(
        'div',
        { style: { position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '3vw' } },
        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: '2vh', maxWidth: '62vw' } },
          h('div', { class: 'chips' }, S.guests.map(chip)),
          h('div', { class: 'muted', style: { fontSize: 'clamp(14px,1.6vw,26px)' } }, waiting ? `${S.quizName} está preparando o jogo…` : `${S.total} perguntas · ${S.settings.seconds} segundos cada`)
        ),
        S.phase === 'lobby'
          ? h('div', { style: { display: 'flex', alignItems: 'center', gap: '1.5vw', textAlign: 'right' } }, h('div', { class: 'muted', style: { fontSize: 'clamp(12px,1.3vw,20px)', maxWidth: '16vw' } }, 'Quer responder pelo celular? Escaneie.', h('div', { style: { wordBreak: 'break-all', marginTop: '6px' } }, url)), qr)
          : null
      ),
    ];
  }

  function tile(g, a, phase) {
    const revealed = phase === 'reveal';
    const cls = ['tile'];
    if (a) {
      cls.push('in');
      if (!revealed) {
        const k = S.qIndex + ':' + g.id + ':' + a.text;
        if (!seen.has(k)) { seen.add(k); cls.push('fresh'); }
      }
      if (revealed) cls.push(a.status === 'errada' ? 'wrong' : 'right');
    } else if (revealed) cls.push('wrong');
    return h(
      'div',
      { class: cls.join(' ') },
      avatar(g, 'av'),
      h('div', { style: { minWidth: 0 } }, h('div', { class: 'who' }, g.name), h('div', { class: 'ans', style: { color: a ? '' : '#6F685B' } }, a ? a.text : revealed ? 'sem resposta' : 'pensando…')),
      revealed && a && a.points ? h('div', { class: 'pts' }, '+' + a.points) : null
    );
  }

  function question() {
    const q = S.question;
    const left = secondsLeft(S);
    const answers = S.answers || {};
    return [
      topbar(),
      h(
        'div',
        { style: { display: 'flex', gap: '3vw', alignItems: 'center', flex: 1, minHeight: 0 } },
        h(
          'div',
          { style: { flex: 1, minWidth: 0 } },
          q.double ? h('div', { class: 'kicker', style: { marginBottom: '2vh' } }, 'Vale em dobro') : null,
          h('h1', { style: { fontSize: 'clamp(36px,5.6vw,96px)' } }, q.text)
        ),
        h('div', { class: 'timer' + (left <= 5 ? ' low' : ''), id: 'timer' }, h('b', { id: 'timerNum' }, String(left)), h('span', {}, 'SEGUNDOS'))
      ),
      h('div', { class: 'grid' }, S.guests.map((g) => tile(g, answers[g.id], 'question'))),
    ];
  }

  function reveal() {
    const q = S.question;
    const answers = S.answers || {};
    const right = S.guests.filter((g) => answers[g.id] && answers[g.id].status !== 'errada').map((g) => g.name);
    return [
      topbar(),
      h(
        'div',
        { style: { textAlign: 'center' } },
        h('div', { class: 'kicker', style: { color: '#B5AC9B' } }, `${S.quizName} respondeu`),
        h('div', { class: 'serif accent', style: { fontSize: 'clamp(64px,10vw,170px)', lineHeight: 1.05, letterSpacing: '-.03em' } }, q.answer)
      ),
      h('div', { class: 'grid' }, S.guests.map((g) => tile(g, answers[g.id], 'reveal'))),
      h('div', { class: 'muted', style: { textAlign: 'center', fontSize: 'clamp(14px,1.6vw,26px)' } }, right.length ? `Acertaram: ${right.join(', ')}${q.double ? ' · pontos em dobro' : ''}` : 'Ninguém acertou dessa vez!'),
    ];
  }

  function final() {
    const r = S.ranking;
    const win = r[0];
    const aw = S.awards || {};
    return [
      ring({ left: '-160px', bottom: '-200px', width: '520px', height: '520px' }),
      dot({ left: '34vw', top: '6vh', width: '20px', height: '20px', background: '#FF7A59' }),
      dot({ left: '46vw', top: '12vh', width: '12px', height: '12px', background: '#F4E6B5' }),
      dot({ right: '9vw', top: '9vh', width: '16px', height: '16px', background: '#DDE7D3' }),
      h(
        'div',
        { style: { position: 'relative', flex: 1, display: 'flex', gap: '5vw', alignItems: 'center' } },
        h(
          'div',
          { style: { flex: 1, minWidth: 0 } },
          h('div', { class: 'kicker' }, `Quem mais conhece ${S.quizName}`),
          win ? h('h1', { style: { fontSize: 'clamp(64px,10vw,170px)', margin: '2vh 0' } }, win.name, h('br'), h('span', { class: 'accent' }, 'ganhou!')) : null,
          win ? h('div', { class: 'muted', style: { fontSize: 'clamp(16px,2vw,32px)', lineHeight: 1.4 } }, `${win.hits} ${win.hits === 1 ? 'acerto' : 'acertos'} em ${S.total} · ${win.points} pontos`) : null,
          aw.fastest || aw.streak
            ? h('div', { class: 'muted', style: { fontSize: 'clamp(14px,1.5vw,24px)', marginTop: '3vh', lineHeight: 1.6 } }, aw.fastest ? `Mais rápido(a): ${aw.fastest.name}` : null, aw.fastest && aw.streak ? h('br') : null, aw.streak ? `Maior sequência: ${aw.streak.name} (${aw.streak.value})` : null)
            : null
        ),
        h(
          'div',
          { style: { width: '32vw', flex: 'none' } },
          h('div', { class: 'muted', style: { fontSize: 'clamp(12px,1.2vw,18px)', letterSpacing: '.25em', marginBottom: '1vh' } }, 'PLACAR FINAL'),
          r.map((x, i) => h('div', { class: 'rank' + (i === 0 ? ' first' : '') }, h('span', { class: 'n' }, String(i + 1)), avatar(x, 'av'), h('span', { class: 'nm' }, x.name), h('span', { class: 'pt' }, String(x.points))))
        )
      ),
    ];
  }

  function render() {
    if (!S) return;
    const key = S.phase + ':' + S.qIndex;
    if (key !== seenKey) {
      seenKey = key;
      seen.clear();
    }
    let parts;
    if (S.phase === 'question') parts = question();
    else if (S.phase === 'reveal') parts = reveal();
    else if (S.phase === 'final') parts = final();
    else parts = lobby(S.phase === 'setup');
    stage.replaceChildren(...parts);
  }

  connect('tv', (s) => {
    S = s;
    render();
  });

  setInterval(() => {
    if (!S || S.phase !== 'question') return;
    const n = document.getElementById('timerNum');
    const t = document.getElementById('timer');
    const left = secondsLeft(S);
    if (n) n.textContent = String(left);
    if (t) t.classList.toggle('low', left <= 5);
  }, 250);
})();
