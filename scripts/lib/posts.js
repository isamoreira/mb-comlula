// Funções compartilhadas entre o `novo-post` e o `importar`: ler/salvar posts e gerar ids.
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const ARQ_POSTS = path.join(RAIZ, 'data/posts.json');
const ARQ_CONFIG = path.join(RAIZ, 'data/config.json');

function hojeSP() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function lerJson(arq) {
  return JSON.parse(fs.readFileSync(arq, 'utf8'));
}

function salvarJson(arq, dados) {
  fs.writeFileSync(arq, JSON.stringify(dados, null, 2) + '\n');
}

// Próximo id livre para a data: AAAA-MM-DD-01, -02, ...
function proximoId(posts, data) {
  let n = 1;
  const ids = new Set(posts.map((p) => p.id));
  while (ids.has(`${data}-${String(n).padStart(2, '0')}`)) n++;
  return `${data}-${String(n).padStart(2, '0')}`;
}

// Adiciona o post e salva data/posts.json em ordem de data/id.
function adicionarPost(posts, post) {
  posts.push(post);
  posts.sort((a, b) => (a.date + a.id < b.date + b.id ? -1 : 1));
  salvarJson(ARQ_POSTS, posts);
}

module.exports = { RAIZ, ARQ_POSTS, ARQ_CONFIG, hojeSP, lerJson, salvarJson, proximoId, adicionarPost };
