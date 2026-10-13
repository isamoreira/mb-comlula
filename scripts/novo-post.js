// CLI interativa para adicionar posts em data/posts.json.
// Uso: npm run novo-post
// Pergunta data, título, tema, legendas, hashtags e mídia; copia a mídia para /media,
// gera a thumb e adiciona a entrada. Pode adicionar vários posts seguidos.
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const { spawnSync } = require('child_process');
const { tipoDaMidia, thumbDeImagem, thumbDeVideo, temFfmpeg } = require('./lib/midia');

const RAIZ = path.join(__dirname, '..');
const ARQ_POSTS = path.join(RAIZ, 'data/posts.json');
const ARQ_CONFIG = path.join(RAIZ, 'data/config.json');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function hojeSP() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function lerJson(arq) {
  return JSON.parse(fs.readFileSync(arq, 'utf8'));
}

function salvarJson(arq, dados) {
  fs.writeFileSync(arq, JSON.stringify(dados, null, 2) + '\n');
}

// Remove aspas que o Windows/Mac colocam ao arrastar um arquivo para o terminal.
function limparCaminho(s) {
  return s.trim().replace(/^& /, '').replace(/^['"]|['"]$/g, '').replace(/\\ /g, ' ');
}

async function perguntar(texto, { padrao = '', obrigatorio = false, validar } = {}) {
  for (;;) {
    const sufixo = padrao ? ` [${padrao}]` : '';
    const r = (await rl.question(`${texto}${sufixo}: `)).trim() || padrao;
    if (obrigatorio && !r) {
      console.log('  → Campo obrigatório.');
      continue;
    }
    const erro = validar && r ? validar(r) : null;
    if (erro) {
      console.log('  → ' + erro);
      continue;
    }
    return r;
  }
}

// Próximo id livre para a data: AAAA-MM-DD-01, -02, ...
function proximoId(posts, data) {
  let n = 1;
  const ids = new Set(posts.map((p) => p.id));
  while (ids.has(`${data}-${String(n).padStart(2, '0')}`)) n++;
  return `${data}-${String(n).padStart(2, '0')}`;
}

async function novoPost(posts, config) {
  console.log('\n— Novo post —');
  const data = await perguntar('Data (AAAA-MM-DD)', {
    padrao: hojeSP(),
    validar: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? null : 'Use o formato AAAA-MM-DD, ex.: 2026-10-14'),
  });
  const titulo = await perguntar('Título curto', { obrigatorio: true });
  const tema = await perguntar('Tema (ex.: Economia, Saúde)');

  console.log('Legendas: digite uma variação por vez (recomendado: 3). Enter vazio para terminar.');
  const legendas = [];
  for (;;) {
    const l = (await rl.question(`  Legenda ${legendas.length + 1}: `)).trim();
    if (!l) {
      if (legendas.length) break;
      console.log('  → Pelo menos 1 legenda.');
      continue;
    }
    // "\n" digitado vira quebra de linha de verdade.
    legendas.push(l.replace(/\\n/g, '\n'));
  }

  const hashtags = (await perguntar('Hashtags (separadas por espaço)'))
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((h) => (h.startsWith('#') ? h : '#' + h));

  const origem = limparCaminho(
    await perguntar('Caminho da mídia (pode arrastar o arquivo para cá)', {
      obrigatorio: true,
      validar: (v) => {
        const c = limparCaminho(v);
        if (!fs.existsSync(c)) return 'Arquivo não encontrado: ' + c;
        if (!tipoDaMidia(c)) return 'Formato não suportado. Use JPG, PNG, WEBP, GIF, MP4, WEBM ou MOV.';
        return null;
      },
    })
  );
  const tipo = tipoDaMidia(origem);

  let capa = '';
  if (tipo === 'video' && !temFfmpeg()) {
    capa = limparCaminho(
      await perguntar('Imagem de capa do vídeo (Enter = gerar uma capa simples)', {
        validar: (v) => (fs.existsSync(limparCaminho(v)) ? null : 'Arquivo não encontrado.'),
      })
    );
  }

  const alt = await perguntar('Descrição da imagem para acessibilidade (Enter = usar o título)');
  const fonte = await perguntar('Link da fonte original (opcional)');
  const credito = await perguntar('Crédito (autor/organização)', { padrao: config.default_credit || '' });

  // Copia a mídia e gera a thumb.
  const id = proximoId(posts, data);
  const ext = path.extname(origem).toLowerCase();
  const arquivo = `media/${id}${ext}`;
  const thumb = `media/${id}-thumb.jpg`;
  fs.mkdirSync(path.join(RAIZ, 'media'), { recursive: true });
  fs.copyFileSync(origem, path.join(RAIZ, arquivo));
  process.stdout.write('Gerando thumb… ');
  if (tipo === 'image') await thumbDeImagem(path.join(RAIZ, arquivo), path.join(RAIZ, thumb));
  else if (capa) await thumbDeImagem(capa, path.join(RAIZ, thumb));
  else await thumbDeVideo(path.join(RAIZ, arquivo), path.join(RAIZ, thumb), { titulo, cor: config.primary_color });
  console.log('ok');

  const post = {
    id,
    date: data,
    title: titulo,
    theme: tema,
    media: { type: tipo, file: arquivo, thumb, alt: alt || titulo },
    captions: legendas,
    hashtags,
    source_url: fonte,
    credit: credito,
  };
  posts.push(post);
  posts.sort((a, b) => (a.date + a.id < b.date + b.id ? -1 : 1));
  salvarJson(ARQ_POSTS, posts);
  console.log(`✔ Post ${id} adicionado em data/posts.json`);
}

(async () => {
  const posts = lerJson(ARQ_POSTS);
  const config = lerJson(ARQ_CONFIG);

  for (;;) {
    await novoPost(posts, config);
    const mais = (await rl.question('\nAdicionar outro post? (s/N): ')).trim().toLowerCase();
    if (mais !== 's' && mais !== 'sim') break;
  }

  const missao = (await rl.question(`\nMissão do dia (Enter para manter: "${config.mission || ''}"): `)).trim();
  if (missao) {
    config.mission = missao;
    salvarJson(ARQ_CONFIG, config);
    console.log('✔ Missão atualizada em data/config.json');
  }

  const build = (await rl.question('\nGerar o site agora (npm run build)? (S/n): ')).trim().toLowerCase();
  rl.close();
  if (build !== 'n' && build !== 'nao' && build !== 'não') {
    spawnSync(process.execPath, [path.join(RAIZ, 'build.js')], { stdio: 'inherit' });
  }
  console.log('\nPróximo passo: publique (veja "Publicar os posts do dia" no README).');
})().catch((e) => {
  rl.close();
  console.error('\n✖ ' + e.message);
  process.exit(1);
});
