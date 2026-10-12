/* Funções compartilhadas entre servidor (Node) e navegador. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Shared = factory();
})(this, function () {
  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function stripArticle(s) {
    return s.replace(/^(o|a|os|as|um|uma)\s+/, '');
  }

  function lev(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  /** Compara a resposta com o gabarito: 'certa' | 'quase' | 'errada'. */
  function grade(answer, key, fuzzy) {
    const a = stripArticle(norm(answer));
    const k = stripArticle(norm(key));
    if (!a || !k) return 'errada';
    if (a === k) return 'certa';
    if (fuzzy === false) return 'errada';
    if (Math.min(a.length, k.length) >= 3 && (a.includes(k) || k.includes(a))) return 'quase';
    const max = Math.max(a.length, k.length);
    const d = lev(a, k);
    const tol = max <= 3 ? 0 : max <= 5 ? 1 : max <= 9 ? 2 : Math.floor(max * 0.25);
    return d <= tol ? 'quase' : 'errada';
  }

  /**
   * Interpreta uma fala como "Mariana, Japão" ou "Tia Rose respondeu Japão".
   * Retorna { gid, answer }; gid é null quando nenhum convidado foi reconhecido.
   */
  function parseUtterance(text, guests) {
    const original = String(text || '').trim();
    const words = original.split(/\s+/).filter(Boolean);
    const nWords = words.map((w) => norm(w));
    let best = null;
    for (const g of guests) {
      const aliases = [g.name].concat(String(g.say || '').split(','));
      for (const raw of aliases) {
        const alias = norm(raw);
        if (!alias) continue;
        const aw = alias.split(' ');
        for (const skip of [0, 1]) {
          if (skip && !/^(o|a|pro|pra|para|do|da)$/.test(nWords[0] || '')) continue;
          const slice = nWords.slice(skip, skip + aw.length);
          if (slice.length === aw.length && slice.join(' ') === alias) {
            const len = skip + aw.length;
            if (!best || alias.length > best.alias.length) best = { gid: g.id, alias, len };
          }
        }
      }
    }
    if (!best) return { gid: null, answer: original };
    let rest = words.slice(best.len).join(' ');
    rest = rest.replace(/^[\s,:;.\-–]*((respondeu|disse|falou|foi|é)(?=\s|$))?[\s,:;.\-–]*/i, '').trim();
    return { gid: best.gid, answer: rest };
  }

  return { norm, lev, grade, parseUtterance };
});
