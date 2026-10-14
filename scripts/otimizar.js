// Deixa leves (para celular) os vídeos que já estão em data/posts.json.
// Uso: npm run otimizar
// O `npm run importar` e o `npm run novo-post` já fazem isso sozinhos com os vídeos novos.
'use strict';

const fs = require('fs');
const path = require('path');
const { otimizarVideo, temFfmpeg, LIMITE_VIDEO } = require('./lib/midia');
const { RAIZ, ARQ_POSTS, lerJson, salvarJson } = require('./lib/posts');

const mb = (b) => (b / 1024 / 1024).toFixed(1) + ' MB';

if (!temFfmpeg()) {
  console.error('✖ ffmpeg não encontrado. Rode "npm install" (ele vem no pacote ffmpeg-static).');
  process.exit(1);
}

const posts = lerJson(ARQ_POSTS);
let mudou = false;
for (const p of posts) {
  if (p.media.type !== 'video') continue;
  const arquivo = path.join(RAIZ, p.media.file);
  if (!fs.existsSync(arquivo)) continue;
  const tamanho = fs.statSync(arquivo).size;
  if (tamanho <= LIMITE_VIDEO) continue;
  process.stdout.write(`${p.id} (${mb(tamanho)}): otimizando… `);
  const r = otimizarVideo(arquivo);
  if (!r) {
    console.log('não ficou menor, mantido.');
    continue;
  }
  console.log(`${mb(r.antes)} → ${mb(r.depois)}`);
  const novo = path.relative(RAIZ, r.arquivo).split(path.sep).join('/');
  if (novo !== p.media.file) {
    p.media.file = novo;
    mudou = true;
  }
}
if (mudou) salvarJson(ARQ_POSTS, posts);
console.log('Pronto. Agora rode "npm run pacote" e envie o site.zip.');
