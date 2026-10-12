'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Shared = require('../public/js/shared.js');
const game = require('../lib/game.js');

test('grade: exata, parecida e errada', () => {
  assert.equal(Shared.grade('japão', 'Japão', true), 'certa');
  assert.equal(Shared.grade('JAPAO', 'Japão', true), 'certa');
  assert.equal(Shared.grade('lasanha', 'Lasanha da vovó', true), 'quase');
  assert.equal(Shared.grade('Friend', 'Friends', true), 'quase');
  assert.equal(Shared.grade('Itália', 'Japão', true), 'errada');
  assert.equal(Shared.grade('', 'Japão', true), 'errada');
});

test('grade: sem tolerância quando desligada', () => {
  assert.equal(Shared.grade('lasanha', 'Lasanha da vovó', false), 'errada');
  assert.equal(Shared.grade('Japão', 'japao', false), 'certa');
});

test('parseUtterance reconhece nome, apelido e conectivos', () => {
  const guests = [
    { id: 'a', name: 'Mariana', say: 'Mari' },
    { id: 'b', name: 'Tia Rose', say: 'Rose' },
    { id: 'c', name: 'Vovô Zé', say: 'Vovô, Zé' },
  ];
  assert.deepEqual(Shared.parseUtterance('Mariana, Japão', guests), { gid: 'a', answer: 'Japão' });
  assert.deepEqual(Shared.parseUtterance('mari japão', guests), { gid: 'a', answer: 'japão' });
  assert.deepEqual(Shared.parseUtterance('Tia Rose respondeu lasanha da vovó', guests), { gid: 'b', answer: 'lasanha da vovó' });
  assert.deepEqual(Shared.parseUtterance('o vovô disse Itália', guests), { gid: 'c', answer: 'Itália' });
  assert.deepEqual(Shared.parseUtterance('ninguém conhecido', guests), { gid: null, answer: 'ninguém conhecido' });
});

function playableState() {
  const s = game.defaultState();
  s.questions = s.questions.slice(0, 3);
  s.questions.forEach((q, i) => {
    q.answer = ['Verde', 'Lasanha', 'Friends'][i];
    q.double = i === 1;
  });
  for (const n of ['Ana', 'Beto', 'Cris']) assert.equal(game.applyHostAction(s, { type: 'addGuest', name: n }), null);
  return s;
}

test('limite de 10 convidados e nomes repetidos', () => {
  const s = game.defaultState();
  for (let i = 0; i < 10; i++) assert.equal(game.applyHostAction(s, { type: 'addGuest', name: 'Pessoa ' + i }), null);
  assert.match(game.applyHostAction(s, { type: 'addGuest', name: 'Extra' }), /Máximo/);
  const t = game.defaultState();
  game.applyHostAction(t, { type: 'addGuest', name: 'Ana' });
  assert.match(game.applyHostAction(t, { type: 'addGuest', name: 'ana' }), /já está/);
});

test('não começa com gabarito incompleto', () => {
  const s = game.defaultState();
  game.applyHostAction(s, { type: 'addGuest', name: 'Ana' });
  assert.match(game.applyHostAction(s, { type: 'start' }), /gabarito/i);
});

test('fluxo completo e pontuação com bônus de velocidade e pergunta dobrada', () => {
  const s = playableState();
  const [ana, beto, cris] = s.guests;
  assert.equal(game.applyHostAction(s, { type: 'start' }), null);
  assert.equal(game.applyHostAction(s, { type: 'next' }, 1000), null);
  assert.equal(s.game.phase, 'question');

  game.applyHostAction(s, { type: 'answer', gid: beto.id, text: 'verde' }, 1100); // 1º
  game.applyHostAction(s, { type: 'answer', gid: ana.id, text: 'Verde' }, 1200); // 2º
  game.applyHostAction(s, { type: 'answer', gid: cris.id, text: 'Azul' }, 1300); // errada
  assert.equal(game.computeScores(s).totals[beto.id], 0, 'rodada aberta não pontua');
  game.applyHostAction(s, { type: 'reveal' });
  let sc = game.computeScores(s);
  assert.equal(sc.totals[beto.id], 130);
  assert.equal(sc.totals[ana.id], 120);
  assert.equal(sc.totals[cris.id], 0);

  game.applyHostAction(s, { type: 'next' }, 2000); // pergunta dobrada
  game.applyHostAction(s, { type: 'answer', gid: cris.id, text: 'lasanha' }, 2100);
  game.applyHostAction(s, { type: 'reveal' });
  sc = game.computeScores(s);
  assert.equal(sc.totals[cris.id], 230);

  // correção manual da apresentadora
  game.applyHostAction(s, { type: 'setStatus', gid: cris.id, status: 'errada' });
  assert.equal(game.computeScores(s).totals[cris.id], 0);
});

test('TV e celular não recebem o gabarito antes da revelação', () => {
  const s = playableState();
  game.applyHostAction(s, { type: 'start' });
  game.applyHostAction(s, { type: 'next' }, 1000);
  game.applyHostAction(s, { type: 'answer', gid: s.guests[0].id, text: 'Verde' }, 1100);
  for (const role of ['tv', 'play']) {
    const v = game.view(s, role);
    assert.equal(v.question.answer, undefined);
    assert.equal(v.questions, undefined);
  }
  assert.ok(game.view(s, 'tv').answers[s.guests[0].id], 'TV mostra a resposta registrada');
  assert.equal(Object.keys(game.view(s, 'play').answers).length, 0, 'celular não vê respostas dos outros');
  game.applyHostAction(s, { type: 'reveal' });
  assert.equal(game.view(s, 'tv').question.answer, 'Verde');
});

test('celular: só responde dentro do tempo', () => {
  const s = playableState();
  game.applyHostAction(s, { type: 'start' });
  game.applyHostAction(s, { type: 'next' }, 1000);
  assert.equal(game.applyPlayerAnswer(s, { gid: s.guests[0].id, text: 'Verde' }, 5000), null);
  assert.match(game.applyPlayerAnswer(s, { gid: s.guests[1].id, text: 'Verde' }, 1000 + 30000), /tempo/);
});

test('final: ranking e prêmios', () => {
  const s = playableState();
  game.applyHostAction(s, { type: 'start' });
  const [ana, beto] = s.guests;
  for (let i = 0; i < 3; i++) {
    game.applyHostAction(s, { type: 'next' }, 1000 * (i + 1));
    game.applyHostAction(s, { type: 'answer', gid: ana.id, text: s.questions[i].answer }, 1000 * (i + 1) + 10);
    if (i === 0) game.applyHostAction(s, { type: 'answer', gid: beto.id, text: s.questions[i].answer }, 1000 * (i + 1) + 20);
    game.applyHostAction(s, { type: 'reveal' });
  }
  game.applyHostAction(s, { type: 'next' });
  assert.equal(s.game.phase, 'final');
  const v = game.view(s, 'tv');
  assert.equal(v.ranking[0].name, 'Ana');
  assert.equal(v.awards.fastest.name, 'Ana');
  assert.equal(v.awards.streak.value, 3);
});
