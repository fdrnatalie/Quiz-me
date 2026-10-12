'use strict';
const Shared = require('../public/js/shared.js');

const MAX_GUESTS = 10;
const COLORS = ['#F4D9CF', '#F4E6B5', '#DDE7D3', '#D6E3EC', '#E8D5E6', '#F2D3A8', '#CFE4DD', '#E3D7C4', '#D9D3EE', '#EFC9D3'];
const SPEED_BONUS = [30, 20, 10];
const BASE_POINTS = 100;

let idCounter = 0;
const uid = (p) => p + Date.now().toString(36) + (idCounter++).toString(36);

const DEFAULT_QUESTIONS = [
  ['Qual é a minha cor favorita?', false],
  ['Qual é a minha comida favorita?', false],
  ['Qual é a minha série favorita?', false],
  ['Para onde eu mais quero viajar?', true],
  ['Qual música eu canto no karaokê?', false],
  ['Qual filme me faz chorar?', false],
  ['Qual é o meu maior medo?', false],
  ['Qual é a minha bebida favorita?', false],
  ['Qual era o meu apelido de infância?', true],
  ['Qual superpoder eu escolheria?', false],
  ['Qual é o meu animal favorito?', false],
  ['Qual era a minha profissão dos sonhos na infância?', false],
].map(([text, double]) => ({ id: uid('q'), text, answer: '', double }));

function defaultState() {
  return {
    quizName: 'Fulana',
    guests: [],
    questions: DEFAULT_QUESTIONS.map((q) => ({ ...q, id: uid('q') })),
    settings: { seconds: 20, fuzzy: true },
    game: { phase: 'setup', qIndex: -1, startedAt: null, answers: {} },
  };
}

const clean = (s, max = 200) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);

function currentQuestion(state) {
  return state.questions[state.game.qIndex] || null;
}

function answersOf(state, qid) {
  return state.game.answers[qid] || (state.game.answers[qid] = {});
}

/** Aplica uma ação da apresentadora. Retorna uma mensagem de erro ou null. */
function applyHostAction(state, a, now = Date.now()) {
  const g = state.game;
  switch (a.type) {
    case 'setName': {
      const name = clean(a.name, 40);
      if (!name) return 'Dê um nome ao quiz.';
      state.quizName = name;
      return null;
    }
    case 'addGuest': {
      const name = clean(a.name, 30);
      if (!name) return 'Digite o nome do convidado.';
      if (state.guests.length >= MAX_GUESTS) return `Máximo de ${MAX_GUESTS} convidados.`;
      if (state.guests.some((x) => Shared.norm(x.name) === Shared.norm(name))) return 'Esse nome já está na lista.';
      const used = new Set(state.guests.map((x) => x.color));
      const color = COLORS.find((c) => !used.has(c)) || COLORS[state.guests.length % COLORS.length];
      state.guests.push({ id: uid('g'), name, say: clean(a.say, 80), color });
      return null;
    }
    case 'updateGuest': {
      const x = state.guests.find((y) => y.id === a.id);
      if (!x) return 'Convidado não encontrado.';
      if (a.name !== undefined) {
        const name = clean(a.name, 30);
        if (!name) return 'O nome não pode ficar vazio.';
        x.name = name;
      }
      if (a.say !== undefined) x.say = clean(a.say, 80);
      if (a.cycleColor) x.color = COLORS[(COLORS.indexOf(x.color) + 1) % COLORS.length];
      return null;
    }
    case 'removeGuest': {
      state.guests = state.guests.filter((x) => x.id !== a.id);
      for (const q of Object.values(g.answers)) delete q[a.id];
      return null;
    }
    case 'addQuestion': {
      const text = clean(a.text, 160);
      if (!text) return 'Digite a pergunta.';
      state.questions.push({ id: uid('q'), text, answer: clean(a.answer, 120), double: !!a.double });
      return null;
    }
    case 'updateQuestion': {
      const q = state.questions.find((y) => y.id === a.id);
      if (!q) return 'Pergunta não encontrada.';
      if (a.text !== undefined) {
        const text = clean(a.text, 160);
        if (!text) return 'A pergunta não pode ficar vazia.';
        q.text = text;
      }
      if (a.answer !== undefined) q.answer = clean(a.answer, 120);
      if (a.double !== undefined) q.double = !!a.double;
      return null;
    }
    case 'removeQuestion': {
      state.questions = state.questions.filter((y) => y.id !== a.id);
      delete g.answers[a.id];
      return null;
    }
    case 'setSettings': {
      const s = Number(a.seconds);
      if (a.seconds !== undefined) {
        if (!Number.isFinite(s) || s < 5 || s > 120) return 'O tempo deve ficar entre 5 e 120 segundos.';
        state.settings.seconds = Math.round(s);
      }
      if (a.fuzzy !== undefined) state.settings.fuzzy = !!a.fuzzy;
      return null;
    }
    case 'start': {
      if (!state.guests.length) return 'Inscreva pelo menos um convidado.';
      const ready = state.questions.filter((q) => q.answer);
      if (!ready.length) return 'Preencha o gabarito antes de começar.';
      if (ready.length !== state.questions.length) {
        return `Faltam respostas no gabarito (${state.questions.length - ready.length}). Preencha ou remova essas perguntas.`;
      }
      state.game = { phase: 'lobby', qIndex: -1, startedAt: null, answers: {} };
      return null;
    }
    case 'next': {
      if (g.phase === 'lobby' || g.phase === 'reveal') {
        if (g.qIndex + 1 < state.questions.length) {
          g.qIndex += 1;
          g.phase = 'question';
          g.startedAt = now;
        } else {
          g.phase = 'final';
        }
        return null;
      }
      return 'Ação indisponível agora.';
    }
    case 'reveal': {
      if (g.phase !== 'question') return 'Ação indisponível agora.';
      g.phase = 'reveal';
      return null;
    }
    case 'restartTimer': {
      if (g.phase !== 'question') return 'Ação indisponível agora.';
      g.startedAt = now;
      return null;
    }
    case 'answer': {
      if (g.phase !== 'question' && g.phase !== 'reveal') return 'Não há pergunta aberta.';
      const q = currentQuestion(state);
      if (!state.guests.some((x) => x.id === a.gid)) return 'Convidado não encontrado.';
      const text = clean(a.text, 120);
      const bucket = answersOf(state, q.id);
      if (!text) {
        delete bucket[a.gid];
        return null;
      }
      const prev = bucket[a.gid];
      bucket[a.gid] = {
        text,
        status: Shared.grade(text, q.answer, state.settings.fuzzy),
        at: prev ? prev.at : now,
        manual: false,
        source: a.source || 'host',
      };
      return null;
    }
    case 'setStatus': {
      const q = currentQuestion(state);
      const cur = q && answersOf(state, q.id)[a.gid];
      if (!cur) return 'Ainda não há resposta para corrigir.';
      if (!['certa', 'quase', 'errada'].includes(a.status)) return 'Status inválido.';
      cur.status = a.status;
      cur.manual = true;
      return null;
    }
    case 'playAgain': {
      state.game = { phase: 'lobby', qIndex: -1, startedAt: null, answers: {} };
      return null;
    }
    case 'backToSetup': {
      state.game = { phase: 'setup', qIndex: -1, startedAt: null, answers: {} };
      return null;
    }
    default:
      return 'Ação desconhecida.';
  }
}

/** Aplica uma resposta enviada pelo celular do convidado. */
function applyPlayerAnswer(state, a, now = Date.now()) {
  const g = state.game;
  if (g.phase !== 'question') return 'A rodada não está aberta.';
  if (now > g.startedAt + state.settings.seconds * 1000 + 2500) return 'O tempo acabou.';
  return applyHostAction(state, { type: 'answer', gid: a.gid, text: a.text, source: 'phone' }, now);
}

const isCorrect = (ans) => !!ans && (ans.status === 'certa' || ans.status === 'quase');

function scoredCount(state) {
  const g = state.game;
  if (g.phase === 'final') return state.questions.length;
  if (g.phase === 'reveal') return g.qIndex + 1;
  if (g.phase === 'question') return g.qIndex;
  return 0;
}

/** Pontuação das rodadas já reveladas. */
function computeScores(state) {
  const totals = {};
  const perQuestion = {};
  const firsts = {};
  const streaks = {};
  const best = {};
  for (const x of state.guests) {
    totals[x.id] = 0;
    firsts[x.id] = 0;
    streaks[x.id] = 0;
    best[x.id] = 0;
  }
  let hits = Object.assign({}, totals);
  const n = scoredCount(state);
  for (let i = 0; i < n; i++) {
    const q = state.questions[i];
    const bucket = state.game.answers[q.id] || {};
    const correct = state.guests
      .filter((x) => isCorrect(bucket[x.id]))
      .sort((a, b) => bucket[a.id].at - bucket[b.id].at);
    const pts = {};
    correct.forEach((x, idx) => {
      pts[x.id] = BASE_POINTS * (q.double ? 2 : 1) + (SPEED_BONUS[idx] || 0);
      totals[x.id] += pts[x.id];
      hits[x.id] += 1;
      if (idx === 0) firsts[x.id] += 1;
    });
    for (const x of state.guests) {
      streaks[x.id] = pts[x.id] ? streaks[x.id] + 1 : 0;
      best[x.id] = Math.max(best[x.id], streaks[x.id]);
    }
    perQuestion[q.id] = pts;
  }
  return { totals, perQuestion, firsts, bestStreak: best, hits, answered: n };
}

function ranking(state, scores) {
  return state.guests
    .map((x) => ({ id: x.id, name: x.name, color: x.color, points: scores.totals[x.id], hits: scores.hits[x.id], firsts: scores.firsts[x.id] }))
    .sort((a, b) => b.points - a.points || b.hits - a.hits || a.name.localeCompare(b.name, 'pt-BR'));
}

function awards(state, scores) {
  const pick = (map) => {
    let top = null;
    for (const x of state.guests) if (map[x.id] > 0 && (!top || map[x.id] > map[top.id])) top = x;
    return top ? { name: top.name, value: map[top.id] } : null;
  };
  return { fastest: pick(scores.firsts), streak: pick(scores.bestStreak) };
}

function questionView(state, q, i, withAnswer) {
  return { id: q.id, index: i, text: q.text, double: q.double, ...(withAnswer ? { answer: q.answer } : {}) };
}

/** Visão do estado por papel: 'host' vê tudo; 'tv' e 'play' nunca veem o gabarito antes da revelação. */
function view(state, role, now = Date.now()) {
  const g = state.game;
  const scores = computeScores(state);
  const q = currentQuestion(state);
  const revealed = g.phase === 'reveal' || g.phase === 'final';
  const out = {
    serverNow: now,
    role,
    quizName: state.quizName,
    guests: state.guests,
    settings: state.settings,
    phase: g.phase,
    qIndex: g.qIndex,
    total: state.questions.length,
    startedAt: g.startedAt,
    maxGuests: MAX_GUESTS,
    scores: { totals: scores.totals, answered: scores.answered },
    ranking: ranking(state, scores),
  };
  if (role === 'host') {
    out.questions = state.questions;
    out.answers = g.answers;
    out.perQuestion = scores.perQuestion;
    out.question = q ? questionView(state, q, g.qIndex, true) : null;
  } else {
    out.question = q && g.phase !== 'lobby' ? questionView(state, q, g.qIndex, g.phase === 'reveal') : null;
    if (q && (g.phase === 'question' || g.phase === 'reveal')) {
      const bucket = g.answers[q.id] || {};
      const shown = {};
      // Na TV as respostas aparecem conforme são registradas; no celular só depois da revelação.
      if (role === 'tv' || g.phase === 'reveal') {
        for (const [gid, ans] of Object.entries(bucket)) {
          shown[gid] = g.phase === 'reveal' ? { text: ans.text, status: ans.status, points: (scores.perQuestion[q.id] || {})[gid] || 0 } : { text: ans.text };
        }
      }
      out.answers = shown;
      out.answeredCount = Object.keys(bucket).length;
    }
  }
  if (g.phase === 'final') out.awards = awards(state, scores);
  out.revealed = revealed;
  return out;
}

module.exports = { MAX_GUESTS, defaultState, applyHostAction, applyPlayerAnswer, computeScores, ranking, view };
