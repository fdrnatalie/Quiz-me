/* Tela da apresentadora: cadastro, gabarito e condução do jogo. */
(function () {
  const { h, post, connect, avatar, toast, qrSvg, phoneUrl, secondsLeft } = App;
  const app = document.getElementById('app');
  const conn = document.getElementById('conn');

  let S = null; // último estado recebido do servidor
  let selected = null; // convidado selecionado para receber uma resposta
  const drafts = {}; // texto em edição nos formulários de adicionar

  // reconhecimento de voz
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  let wantListening = false;
  let listening = false;
  let interim = '';
  let pending = null; // { gid, answer, text }
  let pendingTimer = null;

  async function act(a) {
    try {
      await post('/api/host', a);
      return true;
    } catch (e) {
      toast(e.message);
      return false;
    }
  }

  const STATUS_LABEL = { certa: 'Certa', quase: 'Quase · vale', errada: 'Errada' };
  const NEXT_STATUS = { certa: 'quase', quase: 'errada', errada: 'certa' };

  // ---------- render com preservação de foco ----------
  function render() {
    if (!S) return;
    const ae = document.activeElement;
    const key = ae && ae.dataset && ae.dataset.key;
    const val = key ? ae.value : null;
    const range = key && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null;
    const y = window.scrollY;
    app.replaceChildren(S.phase === 'setup' ? setupView() : playView());
    if (key) {
      const n = app.querySelector(`[data-key="${CSS.escape(key)}"]`);
      if (n) {
        if (val !== null) n.value = val;
        n.focus();
        if (range) {
          try {
            n.setSelectionRange(range[0], range[1]);
          } catch (e) {
            /* campos sem seleção (number, checkbox) */
          }
        }
      }
    }
    window.scrollTo(0, y);
  }

  function input(key, attrs, onchange) {
    return h('input', { ...attrs, 'data-key': key, onchange: (e) => onchange(e.target.value, e.target) });
  }

  function draft(key, attrs) {
    return h('input', {
      ...attrs,
      'data-key': key,
      value: drafts[key] || '',
      oninput: (e) => {
        drafts[key] = e.target.value;
      },
    });
  }

  function closeIcon() {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('width', '18');
    s.setAttribute('height', '18');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M6 6l12 12M18 6L6 18');
    s.append(p);
    return s;
  }

  function micIcon() {
    const wrap = h('span', { 'aria-hidden': 'true' });
    wrap.innerHTML =
      '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/></svg>';
    return wrap;
  }

  // ---------- peças comuns ----------
  function topBar() {
    const playing = S.phase !== 'setup';
    return h(
      'header',
      { class: 'top' },
      playing
        ? h(
            'button',
            {
              class: 'icon-btn',
              'aria-label': 'Voltar ao cadastro',
              style: { border: '1px solid var(--ink)', color: 'var(--ink)' },
              onclick: () => {
                if (confirm('Voltar ao cadastro? O jogo em andamento será encerrado.')) act({ type: 'backToSetup' });
              },
            },
            closeIcon()
          )
        : null,
      h('div', { class: 'brand' }, 'Quiz da ', h('span', { class: 'it' }, S.quizName)),
      S.phase === 'question' || S.phase === 'reveal'
        ? [
            h('div', { class: 'progress' }, h('i', { style: { width: ((S.qIndex + 1) / S.total) * 100 + '%' } })),
            h('div', { class: 'muted' }, `Pergunta ${S.qIndex + 1} de ${S.total}`, S.question && S.question.double ? ' · vale 2x' : ''),
          ]
        : h('div', { style: { flex: 1 } }),
      h('a', { class: 'btn small', href: '/tv', target: '_blank', rel: 'noopener' }, 'Abrir a TV ↗')
    );
  }

  function phoneCard() {
    const url = phoneUrl(S);
    const svg = qrSvg(url);
    const qr = h('div', { style: { width: '88px', height: '88px', flex: 'none', lineHeight: 0 }, 'aria-hidden': 'true' });
    if (svg) qr.innerHTML = svg;
    return h(
      'div',
      { class: 'card', style: { display: 'flex', gap: '16px', alignItems: 'center' } },
      qr,
      h('div', {}, h('strong', {}, 'Respostas pelo celular (opcional)'), h('div', { class: 'muted', style: { fontSize: '14px', marginTop: '4px', wordBreak: 'break-all' } }, url))
    );
  }

  // ---------- CADASTRO ----------
  function setupView() {
    const missing = S.questions.filter((q) => !q.answer).length;
    const canStart = S.guests.length > 0 && S.questions.length > 0 && missing === 0;
    const hint = !S.guests.length ? 'Inscreva pelo menos um convidado.' : missing ? `Faltam ${missing} respostas no gabarito.` : 'Tudo certo!';

    return h(
      'div',
      {},
      topBar(),
      h(
        'div',
        { class: 'cols' },
        h(
          'div',
          { class: 'main' },
          h('p', { class: 'eyebrow' }, 'Antes do jogo'),
          h(
            'h1',
            { class: 'serif', style: { margin: '0 0 8px', fontWeight: 500, fontSize: '44px', letterSpacing: '-1px' } },
            'Quiz da ',
            h('span', { class: 'it' }, S.quizName)
          ),
          h(
            'div',
            { style: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' } },
            h('label', { for: 'quizName', class: 'muted' }, 'Quem é a dona do quiz?'),
            input('quizName', { id: 'quizName', class: 'field sm', value: S.quizName, maxlength: '40' }, (v) => act({ type: 'setName', name: v }))
          ),
          guestsSection(),
          questionsSection(),
          rulesSection()
        ),
        h(
          'aside',
          { class: 'side' },
          h(
            'div',
            { class: 'card' },
            h('div', { class: 'serif', style: { fontSize: '22px', marginBottom: '6px' } }, 'Como vai funcionar'),
            h(
              'p',
              { class: 'muted', style: { margin: 0, fontSize: '15px', lineHeight: 1.5 } },
              'Abra a TV em outra janela (ou aparelho). Cada convidado fala a resposta em voz alta e você registra aqui, por voz ou toque. A TV mostra tudo na hora.'
            )
          ),
          phoneCard(),
          h('button', { class: 'btn primary', style: { minHeight: '56px', fontSize: '17px' }, disabled: !canStart, onclick: () => act({ type: 'start' }) }, 'Começar a jogar'),
          h('div', { class: 'muted', style: { textAlign: 'center', fontSize: '14px' } }, hint)
        )
      )
    );
  }

  function guestsSection() {
    const full = S.guests.length >= S.maxGuests;
    return h(
      'section',
      {},
      h('div', { class: 'sec-title' }, h('h2', {}, 'Convidados'), h('span', { class: 'muted' }, `${S.guests.length} de ${S.maxGuests}`)),
      h(
        'form',
        {
          style: { display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '16px 0' },
          onsubmit: async (e) => {
            e.preventDefault();
            if (await act({ type: 'addGuest', name: drafts['d-gname'], say: drafts['d-gsay'] })) {
              drafts['d-gname'] = '';
              drafts['d-gsay'] = '';
              render();
              const n = app.querySelector('[data-key="d-gname"]');
              if (n) n.focus();
            }
          },
        },
        h('label', { for: 'gname', class: 'sr' }, 'Nome do convidado'),
        draft('d-gname', { id: 'gname', class: 'field', style: { flex: '1 1 200px' }, placeholder: 'Nome ou apelido', maxlength: '30', disabled: full }),
        h('label', { for: 'gsay', class: 'sr' }, 'Como você costuma falar o nome'),
        draft('d-gsay', { id: 'gsay', class: 'field', style: { flex: '1 1 200px' }, placeholder: 'Fala como (opcional): Mari, Rose', maxlength: '80', disabled: full }),
        h('button', { class: 'btn dark', type: 'submit', disabled: full }, 'Adicionar')
      ),
      S.guests.map((g) =>
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'avatar', style: { background: g.color }, 'aria-label': `Trocar a cor de ${g.name}`, onclick: () => act({ type: 'updateGuest', id: g.id, cycleColor: true }) }, App.initial(g.name)),
          h('label', { for: 'gn-' + g.id, class: 'sr' }, 'Nome'),
          input('gn-' + g.id, { id: 'gn-' + g.id, class: 'field sm', style: { flex: '1 1 160px' }, value: g.name, maxlength: '30' }, (v) => act({ type: 'updateGuest', id: g.id, name: v })),
          h('label', { for: 'gs-' + g.id, class: 'sr' }, 'Fala como'),
          input('gs-' + g.id, { id: 'gs-' + g.id, class: 'field sm', style: { flex: '1 1 180px' }, value: g.say || '', placeholder: 'Fala como…', maxlength: '80' }, (v) => act({ type: 'updateGuest', id: g.id, say: v })),
          h('button', { class: 'icon-btn', 'aria-label': `Remover ${g.name}`, onclick: () => act({ type: 'removeGuest', id: g.id }) }, closeIcon())
        )
      ),
      !S.guests.length ? h('p', { class: 'muted' }, 'Ninguém inscrito ainda. O campo "Fala como" ajuda a reconhecer apelidos quando você registra por voz.') : null
    );
  }

  function questionsSection() {
    return h(
      'section',
      {},
      h('div', { class: 'sec-title' }, h('h2', {}, 'Gabarito'), h('span', { class: 'muted' }, 'só você vê estas respostas')),
      S.questions.map((q, i) =>
        h(
          'div',
          { class: 'row' },
          h('div', { class: 'serif it', style: { width: '36px', fontSize: '28px' } }, String(i + 1)),
          h('label', { for: 'qt-' + q.id, class: 'sr' }, `Pergunta ${i + 1}`),
          input('qt-' + q.id, { id: 'qt-' + q.id, class: 'field sm', style: { flex: '2 1 240px' }, value: q.text, maxlength: '160' }, (v) => act({ type: 'updateQuestion', id: q.id, text: v })),
          h('label', { for: 'qa-' + q.id, class: 'sr' }, `Resposta da pergunta ${i + 1}`),
          input('qa-' + q.id, { id: 'qa-' + q.id, class: 'field sm', style: { flex: '1 1 180px', borderColor: q.answer ? 'var(--ink)' : '#B8AE9B', background: q.answer ? '#fff' : 'transparent' }, value: q.answer, placeholder: 'Sua resposta…', maxlength: '120' }, (v) => act({ type: 'updateQuestion', id: q.id, answer: v })),
          h(
            'label',
            { style: { display: 'inline-flex', alignItems: 'center', gap: '8px', minHeight: '44px', cursor: 'pointer' } },
            h('input', { type: 'checkbox', 'data-key': 'qd-' + q.id, checked: q.double ? '' : null, onchange: (e) => act({ type: 'updateQuestion', id: q.id, double: e.target.checked }) }),
            'Vale 2x'
          ),
          h('button', { class: 'icon-btn', 'aria-label': `Remover pergunta ${i + 1}`, onclick: () => act({ type: 'removeQuestion', id: q.id }) }, closeIcon())
        )
      ),
      h(
        'form',
        {
          style: { display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', padding: '20px 0' },
          onsubmit: async (e) => {
            e.preventDefault();
            if (await act({ type: 'addQuestion', text: drafts['d-qt'], answer: drafts['d-qa'], double: !!drafts['d-qd'] })) {
              drafts['d-qt'] = '';
              drafts['d-qa'] = '';
              drafts['d-qd'] = false;
              render();
            }
          },
        },
        h('label', { for: 'newq', class: 'eyebrow', style: { flexBasis: '100%' } }, 'Pergunta extra'),
        draft('d-qt', { id: 'newq', class: 'field', style: { flex: '2 1 260px' }, placeholder: 'Ex.: Qual foi a minha pior viagem?', maxlength: '160' }),
        h('label', { for: 'newa', class: 'sr' }, 'Resposta da pergunta extra'),
        draft('d-qa', { id: 'newa', class: 'field', style: { flex: '1 1 180px' }, placeholder: 'Resposta', maxlength: '120' }),
        h(
          'label',
          { style: { display: 'inline-flex', alignItems: 'center', gap: '8px', minHeight: '44px' } },
          h('input', { type: 'checkbox', 'data-key': 'd-qd', checked: drafts['d-qd'] ? '' : null, onchange: (e) => (drafts['d-qd'] = e.target.checked) }),
          'Vale 2x'
        ),
        h('button', { class: 'btn dark', type: 'submit' }, '+ Adicionar')
      )
    );
  }

  function rulesSection() {
    const opts = [10, 15, 20, 30, 45, 60];
    if (!opts.includes(S.settings.seconds)) opts.push(S.settings.seconds);
    opts.sort((a, b) => a - b);
    return h(
      'section',
      {},
      h('div', { class: 'sec-title' }, h('h2', {}, 'Regras')),
      h(
        'div',
        { class: 'row' },
        h('label', { for: 'secs', style: { flex: 1 } }, 'Tempo por pergunta'),
        h(
          'select',
          { id: 'secs', class: 'field sm', 'data-key': 'secs', onchange: (e) => act({ type: 'setSettings', seconds: Number(e.target.value) }) },
          opts.map((o) => h('option', { value: String(o), selected: o === S.settings.seconds ? '' : null }, o + ' segundos'))
        )
      ),
      h(
        'div',
        { class: 'row' },
        h('div', { style: { flex: 1 } }, 'Respostas parecidas contam como certas', h('div', { class: 'muted', style: { fontSize: '14px' } }, 'Ex.: "lasanha" vale para "Lasanha da vovó". Você pode corrigir qualquer resposta.')),
        h(
          'div',
          { class: 'toggle', role: 'group', 'aria-label': 'Respostas parecidas' },
          h('button', { 'aria-pressed': String(S.settings.fuzzy), onclick: () => act({ type: 'setSettings', fuzzy: true }) }, 'Sim'),
          h('button', { 'aria-pressed': String(!S.settings.fuzzy), onclick: () => act({ type: 'setSettings', fuzzy: false }) }, 'Não')
        )
      ),
      h('div', { class: 'row muted' }, h('div', { style: { flex: 1 } }, 'Pontuação'), h('div', {}, '100 por acerto (200 nas dobradas) + bônus para os 3 primeiros'))
    );
  }

  // ---------- JOGO ----------
  function playView() {
    if (S.phase === 'lobby') return lobbyView();
    if (S.phase === 'final') return finalView();
    return consoleView();
  }

  function lobbyView() {
    return h(
      'div',
      {},
      topBar(),
      h(
        'div',
        { class: 'cols' },
        h(
          'div',
          { class: 'main' },
          h('p', { class: 'eyebrow' }, 'Sala pronta'),
          h('h1', { class: 'serif', style: { margin: '0 0 16px', fontWeight: 500, fontSize: '56px', letterSpacing: '-1.5px', lineHeight: 1.05 } }, 'Todo mundo aí? ', h('span', { class: 'it' }, 'Vamos jogar.')),
          h('p', { class: 'muted', style: { fontSize: '17px', maxWidth: '520px', lineHeight: 1.5 } }, `A TV está mostrando a abertura. São ${S.total} perguntas de ${S.settings.seconds} segundos.`),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '10px', margin: '24px 0' } }, S.guests.map((g) => h('span', { class: 'pill', style: { background: g.color } }, g.name))),
          h('button', { class: 'btn primary', style: { minHeight: '56px', fontSize: '17px' }, onclick: () => act({ type: 'next' }) }, 'Mostrar a primeira pergunta')
        ),
        h('aside', { class: 'side' }, phoneCard())
      )
    );
  }

  function answerChips(q) {
    const counts = new Map();
    for (const a of Object.values(S.answers[q.id] || {})) counts.set(a.text, (counts.get(a.text) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }

  function nextWithoutAnswer(q, after) {
    const bucket = S.answers[q.id] || {};
    const order = S.guests.map((g) => g.id);
    const start = Math.max(0, order.indexOf(after) + 1);
    for (let k = 0; k < order.length; k++) {
      const id = order[(start + k) % order.length];
      if (!bucket[id]) return id;
    }
    return null;
  }

  async function giveAnswer(gid, text) {
    const q = S.question;
    const ok = await act({ type: 'answer', gid, text });
    if (ok && text) selected = nextWithoutAnswer(q, gid);
  }

  function consoleView() {
    const q = S.question;
    const reveal = S.phase === 'reveal';
    const bucket = S.answers[q.id] || {};
    const pts = (S.perQuestion && S.perQuestion[q.id]) || {};
    const done = Object.keys(bucket).length;
    const last = S.qIndex + 1 >= S.total;
    const chips = answerChips(q);

    if (selected && !S.guests.some((g) => g.id === selected)) selected = null;

    const rows = S.guests.map((g) => {
      const a = bucket[g.id];
      const isSel = selected === g.id;
      return h(
        'div',
        { class: 'row', style: { background: isSel ? 'rgba(244,211,94,.25)' : '', borderRadius: '16px', padding: '10px 8px' } },
        h('button', { class: 'avatar', style: { background: g.color }, 'aria-label': `Selecionar ${g.name}`, onclick: () => { selected = g.id; render(); } }, App.initial(g.name)),
        h('div', { style: { width: '104px', fontWeight: 500 } }, g.name),
        h('label', { for: 'a-' + g.id, class: 'sr' }, `Resposta de ${g.name}`),
        h('input', {
          id: 'a-' + g.id,
          'data-key': 'a-' + g.id,
          class: 'field sm',
          style: { flex: '1 1 180px', background: a ? '#fff' : 'transparent', borderColor: a ? (a.status === 'errada' ? '#B8AE9B' : a.status === 'quase' ? '#B5892B' : 'var(--sage)') : '#B8AE9B' },
          value: a ? a.text : '',
          placeholder: 'Toque ou fale…',
          maxlength: '120',
          onfocus: () => { selected = g.id; },
          onchange: (e) => { giveAnswer(g.id, e.target.value); },
        }),
        h(
          'div',
          { class: 'status ' + (a ? a.status : 'wait') },
          a ? STATUS_LABEL[a.status] : 'aguardando',
          reveal && pts[g.id] ? h('div', { style: { color: 'var(--ink)' } }, '+' + pts[g.id]) : null
        ),
        a ? h('button', { class: 'btn small', 'aria-label': `Corrigir resposta de ${g.name}`, onclick: () => act({ type: 'setStatus', gid: g.id, status: NEXT_STATUS[a.status] }) }, 'Corrigir') : h('span', { style: { width: '92px' } })
      );
    });

    return h(
      'div',
      {},
      topBar(),
      h(
        'div',
        { class: 'cols' },
        h(
          'div',
          { class: 'main', style: { display: 'flex', flexDirection: 'column', gap: '24px' } },
          h(
            'div',
            {},
            h('div', { class: 'eyebrow' }, reveal ? 'Rodada revelada' : 'Pergunta na TV'),
            h('h1', { class: 'serif', style: { margin: '6px 0 12px', fontWeight: 500, fontSize: '44px', lineHeight: 1.08, letterSpacing: '-1px' } }, q.text),
            h('span', { class: 'pill butter' }, 'Gabarito (só você vê): ', h('strong', { style: { marginLeft: '6px' } }, q.answer)),
            !reveal ? h('span', { class: 'muted', style: { marginLeft: '16px' } }, 'Tempo: ', h('strong', { id: 'hostTimer' }, secondsLeft(S) + 's'), ' ', h('button', { class: 'btn small', style: { marginLeft: '8px' }, onclick: () => act({ type: 'restartTimer' }) }, 'Reiniciar')) : null
          ),
          !reveal ? h('div', { id: 'voice' }, voiceCard()) : null,
          h(
            'div',
            {},
            h('div', { class: 'sec-title', style: { marginTop: 0 } }, h('h2', {}, 'Respostas dos convidados'), h('span', { class: 'muted' }, `${done} de ${S.guests.length} registradas`)),
            rows
          )
        ),
        h(
          'aside',
          { class: 'side' },
          !reveal
            ? h(
                'div',
                { class: 'card' },
                h('div', { class: 'eyebrow', style: { marginBottom: '12px' } }, 'Toque para usar a resposta'),
                chips.length
                  ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } }, chips.map((c) => h('button', { class: 'btn small', onclick: () => (selected ? giveAnswer(selected, c) : toast('Toque antes no nome de quem respondeu.')) }, c)))
                  : h('div', { class: 'muted', style: { fontSize: '14px' } }, 'As respostas já dadas aparecem aqui como atalhos.'),
                h('div', { class: 'muted', style: { fontSize: '13px', marginTop: '12px' } }, selected ? 'Para: ' + (S.guests.find((g) => g.id === selected) || {}).name : 'Escolha um convidado na lista.')
              )
            : null,
          reveal
            ? h('button', { class: 'btn primary', style: { minHeight: '56px', fontSize: '17px' }, onclick: () => { selected = null; act({ type: 'next' }); } }, last ? 'Ver o vencedor' : 'Próxima pergunta')
            : h('button', { class: 'btn primary', style: { minHeight: '56px', fontSize: '17px' }, onclick: () => act({ type: 'reveal' }) }, 'Encerrar rodada e revelar'),
          h('div', { class: 'muted', style: { textAlign: 'center', fontSize: '13px' } }, '"Quase" vale ponto. Toque em "Corrigir" para mudar o resultado de qualquer resposta.')
        )
      )
    );
  }

  function finalView() {
    const first = S.ranking[0];
    return h(
      'div',
      {},
      topBar(),
      h(
        'div',
        { class: 'cols' },
        h(
          'div',
          { class: 'main' },
          h('p', { class: 'eyebrow' }, 'Fim de jogo'),
          h('h1', { class: 'serif', style: { margin: '0 0 24px', fontWeight: 500, fontSize: '64px', letterSpacing: '-2px', lineHeight: 1 } }, first ? [first.name, h('span', { class: 'it' }, ' ganhou!')] : 'Fim'),
          S.ranking.map((r, i) =>
            h(
              'div',
              { class: 'row' },
              h('div', { class: 'serif it', style: { width: '36px', fontSize: '28px' } }, String(i + 1)),
              h('span', { class: 'avatar', style: { background: r.color } }, App.initial(r.name)),
              h('div', { style: { flex: 1, fontWeight: 500, fontSize: '18px' } }, r.name),
              h('div', { class: 'muted' }, `${r.hits} ${r.hits === 1 ? 'acerto' : 'acertos'}`),
              h('div', { class: 'serif', style: { fontSize: '24px', minWidth: '80px', textAlign: 'right' } }, String(r.points))
            )
          )
        ),
        h(
          'aside',
          { class: 'side' },
          S.awards && (S.awards.fastest || S.awards.streak)
            ? h(
                'div',
                { class: 'card' },
                h('div', { class: 'serif', style: { fontSize: '22px', marginBottom: '8px' } }, 'Prêmios'),
                S.awards.fastest ? h('div', { class: 'row' }, h('span', { style: { flex: 1 } }, 'Mais rápido(a)'), h('strong', {}, S.awards.fastest.name)) : null,
                S.awards.streak ? h('div', { class: 'row' }, h('span', { style: { flex: 1 } }, 'Maior sequência'), h('strong', {}, `${S.awards.streak.name} (${S.awards.streak.value})`)) : null
              )
            : null,
          h('button', { class: 'btn primary', style: { minHeight: '56px' }, onclick: () => act({ type: 'playAgain' }) }, 'Jogar de novo'),
          h('button', { class: 'btn', onclick: () => act({ type: 'backToSetup' }) }, 'Voltar ao cadastro')
        )
      )
    );
  }

  // ---------- voz ----------
  function voiceCard() {
    const status = !SR
      ? 'Reconhecimento de voz indisponível neste navegador. Use o Chrome ou digite abaixo.'
      : listening
        ? 'Ouvindo… diga "nome, resposta"'
        : 'Toque no microfone e diga "nome, resposta"';
    let detail;
    if (pending) {
      const g = S.guests.find((x) => x.id === pending.gid);
      detail = g
        ? h('div', { class: 'small' }, 'Entendi: ', h('strong', {}, `${g.name} → ${pending.answer || '…'}`), ' ', h('button', { class: 'btn small', style: { background: '#FF7A59', borderColor: '#FF7A59', color: '#1B1A17', marginLeft: '8px' }, onclick: confirmPending }, 'Confirmar'), ' ', h('button', { class: 'btn small', style: { color: '#F7F3EC', borderColor: '#6F685B' }, onclick: cancelPending }, 'Cancelar'))
        : h('div', { class: 'small' }, `Não reconheci o nome em "${pending.text}". De quem é a resposta? `, S.guests.map((x) => h('button', { class: 'btn small', style: { color: '#F7F3EC', borderColor: '#6F685B', marginRight: '6px' }, onclick: () => { pending.gid = x.id; pending.answer = pending.text; confirmPending(); } }, x.name)));
    } else if (interim) {
      detail = h('div', { class: 'small' }, `"${interim}"`);
    } else {
      detail = h('div', { class: 'small' }, 'Falou outra pessoa em seguida? Continue falando: a anterior é confirmada sozinha.');
    }
    return h(
      'div',
      { class: 'voice' },
      h('button', { class: 'mic' + (listening ? ' on' : ''), 'aria-label': listening ? 'Parar de ouvir' : 'Começar a ouvir', 'aria-pressed': String(listening), onclick: toggleMic }, micIcon()),
      h('div', { style: { flex: '1 1 280px', minWidth: 0 } }, h('div', { class: 'small', style: { letterSpacing: '1.5px', textTransform: 'uppercase', fontSize: '13px' } }, status), detail)
    );
  }

  function updateVoice() {
    const el = document.getElementById('voice');
    if (el) el.replaceChildren(voiceCard());
  }

  function confirmPending() {
    clearTimeout(pendingTimer);
    const p = pending;
    pending = null;
    if (p && p.gid && p.answer) giveAnswer(p.gid, p.answer);
    updateVoice();
  }

  function cancelPending() {
    clearTimeout(pendingTimer);
    pending = null;
    updateVoice();
  }

  function handleFinal(text) {
    if (pending && pending.gid) confirmPending();
    const parsed = Shared.parseUtterance(text, S.guests);
    pending = { gid: parsed.gid, answer: parsed.answer, text };
    clearTimeout(pendingTimer);
    if (parsed.gid && parsed.answer) pendingTimer = setTimeout(confirmPending, 3500);
    interim = '';
    updateVoice();
  }

  function toggleMic() {
    if (!SR) {
      toast('Seu navegador não tem reconhecimento de voz. Use o Chrome ou digite a resposta.');
      return;
    }
    if (listening || wantListening) {
      wantListening = false;
      if (rec) rec.stop();
      listening = false;
      updateVoice();
      return;
    }
    wantListening = true;
    startRec();
  }

  function startRec() {
    rec = new SR();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onstart = () => { listening = true; updateVoice(); };
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0].transcript.trim();
        if (r.isFinal) { if (t) handleFinal(t); } else { interim = t; updateVoice(); }
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wantListening = false;
        toast('Permita o uso do microfone no navegador para registrar por voz.');
      }
    };
    rec.onend = () => {
      listening = false;
      if (wantListening && S && S.phase === 'question') {
        try { startRec(); } catch (e) { wantListening = false; }
      }
      updateVoice();
    };
    try { rec.start(); } catch (e) { wantListening = false; }
  }

  // ---------- inicialização ----------
  connect(
    'host',
    (s) => {
      const phaseChanged = !S || S.phase !== s.phase || S.qIndex !== s.qIndex;
      S = s;
      if (phaseChanged) {
        selected = s.phase === 'question' ? nextWithoutAnswer(s.question, null) : null;
        pending = null;
        interim = '';
        if (s.phase !== 'question' && wantListening) { wantListening = false; if (rec) rec.stop(); }
      }
      render();
    },
    (ok) => { conn.hidden = ok; }
  );

  setInterval(() => {
    const t = document.getElementById('hostTimer');
    if (t && S) t.textContent = secondsLeft(S) + 's';
  }, 500);
})();
