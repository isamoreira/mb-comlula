// Gera as imagens placeholder dos 3 posts de exemplo (em test/fixture/media, usadas só pelos testes).
// Uso: npm run exemplos
'use strict';

const fs = require('fs');
const path = require('path');
const { gerarCartaz, thumbDeImagem } = require('./lib/midia');

const RAIZ = path.join(__dirname, '..');

const EXEMPLOS = [
  { id: '2026-10-13-01', cor: '#C4122F', titulo: 'Exemplo 1 — Economia' },
  { id: '2026-10-13-02', cor: '#11734B', titulo: 'Exemplo 2 — Saúde' },
  { id: '2026-10-13-03', cor: '#1F4FA8', titulo: 'Exemplo 3 — Educação' },
];

(async () => {
  fs.mkdirSync(path.join(RAIZ, 'test/fixture/media'), { recursive: true });
  for (const ex of EXEMPLOS) {
    const arquivo = path.join(RAIZ, 'test/fixture/media', `${ex.id}.jpg`);
    const thumb = path.join(RAIZ, 'test/fixture/media', `${ex.id}-thumb.jpg`);
    const gerado = await gerarCartaz(arquivo, { largura: 1080, altura: 1350, cor: ex.cor, titulo: ex.titulo, subtitulo: 'Conteúdo de teste • Espalha Hoje' });
    if (gerado.endsWith('.jpg')) await thumbDeImagem(arquivo, thumb);
    console.log('✔', path.relative(RAIZ, gerado));
  }
  console.log('Pronto! Imagens de exemplo geradas em test/fixture/media.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
