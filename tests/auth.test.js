'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

process.env.QUIZ_PIN = 'segredo123';
process.env.QUIZ_DATA = path.join(os.tmpdir(), `quiz-auth-${process.pid}.json`);
const { server } = require('../server.js');

let base;
test.before(() => new Promise((ok) => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; ok(); })));
test.after(() => server.close());

const post = (p, body, cookie) =>
  fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });

test('sem senha: controle e painel ficam bloqueados', async () => {
  assert.equal((await post('/api/host', { type: 'setName', name: 'X' })).status, 401);
  const page = await (await fetch(base + '/')).text();
  assert.match(page, /Senha da/);
  assert.equal((await fetch(base + '/events?role=host')).status, 401);
});

test('TV, celular e saúde continuam abertos', async () => {
  assert.equal((await fetch(base + '/tv')).status, 200);
  assert.equal((await fetch(base + '/play')).status, 200);
  assert.equal((await fetch(base + '/healthz')).status, 200);
});

test('senha errada é recusada e a certa libera o controle', async () => {
  assert.equal((await post('/api/login', { pin: 'errada' })).status, 401);
  const ok = await post('/api/login', { pin: 'segredo123' });
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get('set-cookie').split(';')[0];
  assert.equal((await post('/api/host', { type: 'setName', name: 'Fulana' }, cookie)).status, 200);
  assert.match(await (await fetch(base + '/', { headers: { Cookie: cookie } })).text(), /Apresentadora/);
});
