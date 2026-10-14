// Publica o site no GitHub Pages: gera o site (dist/) e envia para o ramo "gh-pages" do repositório.
// Uso: npm run publicar
//
// - Cada publicação substitui a anterior por um único commit (sem acumular histórico de vídeos).
// - Fotos e vídeos que já estão no GitHub não são reenviados.
// - A pasta de trabalho fica em .publicar/ (não vai para o Git do projeto).
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { listar, enderecoDoSite } = require('./lib/servidor');

const RAIZ = path.join(__dirname, '..');
const DIST = path.join(RAIZ, 'dist');
const TRABALHO = path.join(RAIZ, '.publicar');
const RAMO = 'gh-pages';
const LIMITE_GITHUB = 100 * 1024 * 1024; // o GitHub recusa arquivos acima de 100 MB

function git(args, { cwd = TRABALHO, silencioso = false, podeFalhar = false } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: silencioso ? 'pipe' : ['ignore', 'pipe', 'inherit'] });
  if (r.status !== 0 && !podeFalhar) {
    console.error(`\n✖ Falhou: git ${args.join(' ')}\n${r.stderr || ''}`);
    process.exit(1);
  }
  return (r.stdout || '').trim();
}

// 1) Gera o site.
const b = spawnSync(process.execPath, [path.join(RAIZ, 'build.js')], { stdio: 'inherit' });
if (b.status !== 0) process.exit(b.status || 1);

const site = enderecoDoSite(DIST);
if (/localhost/.test(site)) {
  console.error('\n✖ "site_url" em data/config.json não está preenchido (ex.: https://isamoreira.github.io/mb-comlula).');
  process.exit(1);
}
const grandes = listar(DIST).filter((rel) => fs.statSync(path.join(DIST, rel)).size > LIMITE_GITHUB);
if (grandes.length) {
  console.error(`\n✖ O GitHub não aceita arquivos acima de 100 MB: ${grandes.join(', ')}. Rode "npm run otimizar".`);
  process.exit(1);
}

// 2) Prepara a pasta de trabalho ligada ao mesmo repositório do projeto.
// PUBLICAR_REMOTO: só para testes (publicar num repositório local em vez do GitHub).
const remoto = process.env.PUBLICAR_REMOTO || git(['remote', 'get-url', 'origin'], { cwd: RAIZ });
const nome = git(['config', 'user.name'], { cwd: RAIZ, podeFalhar: true }) || 'Espalha Hoje';
const email = git(['config', 'user.email'], { cwd: RAIZ, podeFalhar: true }) || 'espalha-hoje@users.noreply.github.com';
if (!fs.existsSync(path.join(TRABALHO, '.git'))) {
  fs.mkdirSync(TRABALHO, { recursive: true });
  git(['init', '-q']);
}
git(['remote', 'remove', 'origin'], { silencioso: true, podeFalhar: true });
git(['remote', 'add', 'origin', remoto]);
git(['config', 'user.name', nome]);
git(['config', 'user.email', email]);
git(['config', 'core.autocrlf', 'false']); // arquivos idênticos ao dist/, sem conversão de fim de linha

// Baixa o que já está publicado: assim o push só envia o que mudou.
process.stdout.write('\nConferindo o que já está publicado no GitHub… ');
const jaExiste = spawnSync('git', ['fetch', '-q', '--depth=1', 'origin', RAMO], { cwd: TRABALHO, stdio: 'ignore' }).status === 0;
console.log(jaExiste ? 'ok.' : 'primeira publicação.');

// 3) Monta um commit novo e "órfão" (sem histórico) com o conteúdo de dist/.
git(['checkout', '-q', '--orphan', 'publicar-' + Date.now()], { silencioso: true });
git(['rm', '-rq', '--cached', '.'], { silencioso: true, podeFalhar: true });
for (const item of fs.readdirSync(TRABALHO)) {
  if (item !== '.git') fs.rmSync(path.join(TRABALHO, item), { recursive: true, force: true });
}
fs.cpSync(DIST, TRABALHO, { recursive: true });
git(['add', '-A']);
const quando = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date());
git(['commit', '-q', '-m', `Site publicado em ${quando}`]);

// 4) Envia (substitui o ramo gh-pages).
console.log('Enviando para o GitHub (só o que mudou)…');
const push = spawnSync('git', ['push', '-f', 'origin', `HEAD:${RAMO}`], { cwd: TRABALHO, stdio: 'inherit' });
if (push.status !== 0) {
  console.error('\n✖ Não consegui enviar. Confira a internet e o login do GitHub e rode de novo.');
  process.exit(1);
}

// Limpa ramos e arquivos antigos da pasta de trabalho (os vídeos de dias anteriores).
const atual = git(['rev-parse', '--abbrev-ref', 'HEAD'], { silencioso: true });
git(['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], { silencioso: true })
  .split('\n')
  .filter((r) => r && r !== atual)
  .forEach((r) => git(['branch', '-q', '-D', r], { silencioso: true, podeFalhar: true }));
git(['reflog', 'expire', '--expire=now', '--all'], { silencioso: true, podeFalhar: true });
git(['gc', '-q', '--prune=now'], { silencioso: true, podeFalhar: true });

console.log(`\n✔ Publicado! Em 1–2 minutos o site atualiza em: ${site}/`);
console.log('  Depois rode "npm run conferir" para ver se está tudo no ar.');
if (!jaExiste) {
  console.log('\n  Primeira vez? Ative o GitHub Pages (uma vez só):');
  console.log('  github.com → repositório → Settings → Pages → "Deploy from a branch" → Branch: gh-pages, pasta / (root) → Save.');
}
