// Testes rápidos (sem navegador): URLs de compartilhamento e meta tags das páginas /p/<id>/.
// Uso: npm run build && npm test
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Share = require('../src/js/share.js');

const DIST = path.join(__dirname, '..', 'dist');
let falhas = 0;

function teste(nome, fn) {
  try {
    fn();
    console.log('  ✔ ' + nome);
  } catch (e) {
    falhas++;
    console.log('  ✖ ' + nome + '\n    ' + e.message.split('\n').join('\n    '));
  }
}

// ---------------------------------------------------------------------------
console.log('\nURLs de compartilhamento');
const dados = {
  pageUrl: 'https://exemplo.org/p/2026-10-14-01/',
  legenda: 'Legenda de teste com acentuação: ação & opinião',
  hashtags: ['#um', '#dois'],
  titulo: 'Título curto',
  data: '2026-10-14',
};
const enc = encodeURIComponent;
const link = (rede) => `https://exemplo.org/p/2026-10-14-01/?utm_source=${rede}&utm_medium=social&utm_campaign=2026-10-14`;
const texto = 'Legenda de teste com acentuação: ação & opinião\n\n#um #dois';

const esperado = {
  whatsapp: `https://wa.me/?text=${enc(texto + '\n\n' + link('whatsapp'))}`,
  telegram: `https://t.me/share/url?url=${enc(link('telegram'))}&text=${enc(texto)}`,
  x: `https://twitter.com/intent/tweet?text=${enc(texto)}&url=${enc(link('x'))}`,
  threads: `https://www.threads.net/intent/post?text=${enc(texto + '\n\n' + link('threads'))}`,
  facebook: `https://www.facebook.com/sharer/sharer.php?u=${enc(link('facebook'))}`,
  reddit: `https://www.reddit.com/submit?url=${enc(link('reddit'))}&title=${enc('Título curto')}`,
};

Object.keys(esperado).forEach((rede) => {
  teste(rede, () => assert.strictEqual(Share.urlCompartilhar(rede, dados), esperado[rede]));
});

teste('todas as redes de link estão cobertas', () => {
  assert.deepStrictEqual(Share.REDES_LINK.map((r) => r.id).sort(), Object.keys(esperado).sort());
});

teste('X: legenda longa é cortada para caber em 280 caracteres (link conta 23)', () => {
  const longa = 'palavra '.repeat(60).trim();
  const url = new URL(Share.urlCompartilhar('x', { ...dados, legenda: longa }));
  const t = url.searchParams.get('text');
  assert.ok(Array.from(t).length + 24 <= 280, 'tamanho: ' + Array.from(t).length);
  assert.ok(t.endsWith('…'));
});

teste('Threads: texto + link cabem em 500 caracteres', () => {
  const longa = 'palavra '.repeat(100).trim();
  const url = new URL(Share.urlCompartilhar('threads', { ...dados, legenda: longa }));
  const t = url.searchParams.get('text');
  assert.ok(Array.from(t).length <= 500, 'tamanho: ' + Array.from(t).length);
  assert.ok(t.endsWith(link('threads')));
});

teste('UTM é adicionado com & quando a URL já tem ?', () => {
  assert.strictEqual(Share.comUtm('https://a.b/?x=1', 'nativo', 'd'), 'https://a.b/?x=1&utm_source=nativo&utm_medium=social&utm_campaign=d');
});

// ---------------------------------------------------------------------------
console.log('\nPáginas geradas');
if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.log('  ✖ dist/ não existe. Rode "npm run build" antes.');
  process.exit(1);
}

const posts = JSON.parse(fs.readFileSync(path.join(DIST, 'data/posts.json'), 'utf8'));
const TAGS = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'];

function meta(html, nome) {
  const re = new RegExp(`<meta (?:property|name)="${nome.replace(':', '\\:')}" content="([^"]*)"`);
  const m = re.exec(html);
  return m ? m[1] : null;
}

posts.forEach((p) => {
  teste(`/p/${p.id}/ tem as meta tags Open Graph e Twitter Card`, () => {
    const html = fs.readFileSync(path.join(DIST, 'p', p.id, 'index.html'), 'utf8');
    TAGS.forEach((t) => assert.ok(meta(html, t), `faltando ${t}`));
    assert.strictEqual(meta(html, 'og:title'), p.title.replace(/&/g, '&amp;'));
    assert.ok(meta(html, 'og:url').endsWith(`/p/${p.id}/`), 'og:url incorreto');
    assert.strictEqual(meta(html, 'twitter:card'), 'summary_large_image');
    const img = new URL(meta(html, 'og:image'));
    assert.ok(fs.existsSync(path.join(DIST, img.pathname)), 'og:image não existe em dist: ' + img.pathname);
  });
});

teste('páginas principais existem', () => {
  ['index.html', 'hoje/index.html', 'arquivo/index.html', 'privacidade/index.html', '404.html', 'manifest.webmanifest', 'sw.js', '_headers'].forEach((f) =>
    assert.ok(fs.existsSync(path.join(DIST, f)), 'faltando ' + f)
  );
});

teste('nenhuma página carrega scripts ou estilos de terceiros', () => {
  const htmls = [];
  (function andar(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const f = path.join(d, e.name);
      if (e.isDirectory()) andar(f);
      else if (f.endsWith('.html')) htmls.push(f);
    });
  })(DIST);
  htmls.forEach((f) => {
    const html = fs.readFileSync(f, 'utf8');
    assert.ok(!/<script[^>]+src="https?:/i.test(html), 'script externo em ' + f);
    assert.ok(!/<link[^>]+href="https?:[^"]*"[^>]*stylesheet|stylesheet[^>]+href="https?:/i.test(html), 'CSS externo em ' + f);
    assert.ok(!/google-analytics|googletagmanager|gtag\(|fbq\(/i.test(html), 'rastreador em ' + f);
  });
});

console.log(falhas ? `\n✖ ${falhas} teste(s) falharam.\n` : '\n✔ Todos os testes passaram.\n');
process.exit(falhas ? 1 : 0);
