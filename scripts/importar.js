// Importa conteúdos do Pode Espalhar (podeespalhar.com.br) pela API pública do WordPress.
// Uso: npm run importar
//
// Mostra os conteúdos mais recentes numerados; você escolhe (ex.: "1 4 7") e ele:
//  - baixa o vídeo/imagem original e a capa para /media;
//  - preenche título, legenda, tema (campanha), link da fonte e crédito;
//  - pergunta (opcional) por variações de legenda;
//  - adiciona em data/posts.json e gera o site.
//
// Opções (para automatizar):
//   --ids=2219220,2218993   importa esses conteúdos direto (ids do Pode Espalhar), sem lista
//   --data=2026-10-14       data em que os posts aparecem no Espalha Hoje (padrão: hoje)
//   --sim                   aceita os padrões sem perguntar (sem variações de legenda, sem build)
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { spawnSync } = require('child_process');
const { thumbDeImagem } = require('./lib/midia');
const { RAIZ, ARQ_POSTS, ARQ_CONFIG, hojeSP, lerJson, salvarJson, proximoId, adicionarPost } = require('./lib/posts');

const API = 'https://podeespalhar.com.br/wp-json/wp/v2';
const POR_PAGINA = 15;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);
const SEM_PERGUNTAS = !!args.sim;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
async function perguntar(texto, padrao = '') {
  if (SEM_PERGUNTAS) return padrao;
  const r = (await rl.question(texto)).trim();
  return r || padrao;
}

// ---------------------------------------------------------------------------
// API do Pode Espalhar
// ---------------------------------------------------------------------------

async function api(caminho) {
  const r = await fetch(API + caminho, { headers: { 'User-Agent': 'EspalhaHoje-importador' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`A API do Pode Espalhar respondeu ${r.status} para ${caminho}`);
  return { dados: await r.json(), total: Number(r.headers.get('x-wp-total')) || 0 };
}

// Converte entidades HTML do WordPress ("&#8211;", "&amp;"...) em texto.
function texto(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|quot|apos|lt|gt|nbsp|hellip);/g, (_, e) => ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', hellip: '…' }[e]))
    .trim();
}

function termos(c, taxonomia) {
  return ((c._embedded && c._embedded['wp:term']) || [])
    .flat()
    .filter((t) => t && t.taxonomy === taxonomia)
    .map((t) => texto(t.name));
}

function resumoConteudo(c) {
  return {
    idPE: c.id,
    titulo: texto(c.title && c.title.rendered),
    legenda: texto((c.meta && c.meta.legenda) || '') || texto(c.excerpt && c.excerpt.rendered),
    data: c.date,
    link: c.link,
    campanha: termos(c, 'campanha')[0] || '',
    categoria: termos(c, 'category')[0] || '',
    formato: termos(c, 'formato').join(', '),
    medias: Array.isArray(c.medias) ? c.medias : [],
  };
}

async function listar(pagina, busca) {
  const q = `/conteudo?per_page=${POR_PAGINA}&page=${pagina}&_embed=wp:term` + (busca ? `&search=${encodeURIComponent(busca)}` : '');
  const { dados, total } = await api(q);
  return { itens: dados.map(resumoConteudo), total };
}

async function buscarPorId(idPE) {
  const { dados } = await api(`/conteudo/${encodeURIComponent(idPE)}?_embed=wp:term`);
  return resumoConteudo(dados);
}

// Anexos do conteúdo: o arquivo principal (vídeo ou imagem) e a capa.
async function midiasDo(c) {
  const { dados } = await api(`/media?parent=${encodeURIComponent(c.idPE)}&per_page=20`);
  const video = dados.find((m) => /^video\//.test(m.mime_type));
  const imagens = dados.filter((m) => /^image\//.test(m.mime_type));
  if (video) {
    // A capa do vídeo costuma ter o mesmo nome + ".jpg".
    const capa = imagens.find((i) => i.source_url === video.source_url + '.jpg') || imagens[0];
    return { tipo: 'video', arquivo: video.source_url, capa: capa && capa.source_url };
  }
  if (imagens.length) return { tipo: 'image', arquivo: imagens[0].source_url, capa: imagens[0].source_url };

  // Alternativa: mídia que não está anexada ao post, mas aparece no campo "medias".
  const m = c.medias.find((x) => x && x.url);
  if (!m) return null;
  if (/\.(mp4|mov|webm)\.jpg$/i.test(m.url)) {
    const video = m.url.replace(/\.jpg$/i, '');
    const h = await fetch(video, { method: 'HEAD', signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (h && h.ok) return { tipo: 'video', arquivo: video, capa: m.url };
  }
  return /^image\//.test(m.mime_type || 'image/') ? { tipo: 'image', arquivo: m.url, capa: m.url } : null;
}

async function baixar(url, destino) {
  const r = await fetch(url, { headers: { 'User-Agent': 'EspalhaHoje-importador' }, signal: AbortSignal.timeout(10 * 60 * 1000) });
  if (!r.ok) throw new Error(`Falha ao baixar ${url} (${r.status})`);
  await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(destino));
  return fs.statSync(destino).size;
}

// ---------------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------------

function quando(iso) {
  const [d, h] = iso.split('T');
  const [, m, dia] = d.split('-');
  return `${dia}/${m} ${h.slice(0, 5)}`;
}

function cortar(s, n) {
  s = String(s).replace(/\s+/g, ' ');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function mostrarLista(itens, inicio) {
  console.log('');
  itens.forEach((c, i) => {
    const n = String(inicio + i + 1).padStart(2, ' ');
    console.log(`${n}. [${quando(c.data)}] ${c.titulo}`);
    console.log(`    ${c.formato || '—'} · ${c.campanha || c.categoria || 'sem campanha'}`);
    if (c.legenda) console.log(`    "${cortar(c.legenda, 90)}"`);
  });
  console.log('');
}

// Lista paginada: a pessoa escolhe números, pede mais ("m") ou busca ("b palavra").
async function escolher() {
  let pagina = 1;
  let busca = '';
  let todos = [];
  for (;;) {
    const { itens, total } = await listar(pagina, busca);
    mostrarLista(itens, todos.length);
    todos = todos.concat(itens);
    console.log(`Mostrando ${todos.length} de ${total} conteúdos${busca ? ` com "${busca}"` : ''}.`);
    const r = (await rl.question('Escolha os números (ex.: 1 4 7), "m" para mais, "b palavra" para buscar: ')).trim();
    if (/^m$/i.test(r)) {
      pagina++;
      continue;
    }
    const mb = /^b\s+(.+)$/i.exec(r);
    if (mb) {
      busca = mb[1];
      pagina = 1;
      todos = [];
      continue;
    }
    const nums = (r.match(/\d+/g) || []).map(Number).filter((n) => n >= 1 && n <= todos.length);
    if (nums.length) return [...new Set(nums)].map((n) => todos[n - 1]);
    console.log('  → Digite pelo menos um número da lista.');
  }
}

// ---------------------------------------------------------------------------
// Importação de um conteúdo
// ---------------------------------------------------------------------------

async function importar(c, data, posts, config) {
  console.log(`\n— ${c.titulo}`);
  const repetido = posts.find((p) => p.source_url === c.link && p.date === data);
  if (repetido) {
    console.log(`  Já importado para ${data} (${repetido.id}). Pulando.`);
    return null;
  }

  const m = await midiasDo(c);
  if (!m) {
    console.log('  ✖ Esse conteúdo não tem vídeo nem imagem para baixar. Pulando.');
    return null;
  }

  const id = proximoId(posts, data);
  const ext = (path.extname(new URL(m.arquivo).pathname) || (m.tipo === 'video' ? '.mp4' : '.jpg')).toLowerCase();
  const arquivo = `media/${id}${ext}`;
  const thumb = `media/${id}-thumb.jpg`;
  fs.mkdirSync(path.join(RAIZ, 'media'), { recursive: true });

  const capaTmp = path.join(RAIZ, 'media', `${id}-capa-original.jpg`);
  const criados = [arquivo, thumb].map((f) => path.join(RAIZ, f)).concat(capaTmp);
  let bytes;
  try {
    process.stdout.write(`  Baixando ${m.tipo === 'video' ? 'vídeo' : 'imagem'}… `);
    bytes = await baixar(m.arquivo, path.join(RAIZ, arquivo));
    console.log(`${(bytes / 1024 / 1024).toFixed(1)} MB`);

    process.stdout.write('  Gerando thumb… ');
    if (m.tipo === 'image') {
      await thumbDeImagem(path.join(RAIZ, arquivo), path.join(RAIZ, thumb));
    } else {
      if (!m.capa) throw new Error('o vídeo não tem imagem de capa no Pode Espalhar');
      await baixar(m.capa, capaTmp);
      await thumbDeImagem(capaTmp, path.join(RAIZ, thumb));
      fs.rmSync(capaTmp, { force: true });
    }
    console.log('ok');
  } catch (e) {
    console.log('');
    // Não deixa arquivos pela metade em /media.
    criados.forEach((f) => fs.rmSync(f, { force: true }));
    throw e;
  }

  // Legendas: a do Pode Espalhar + variações opcionais (evita texto idêntico em muitas contas).
  const legendas = [c.legenda || c.titulo];
  console.log(`  Legenda: "${cortar(legendas[0], 120)}"`);
  if (!SEM_PERGUNTAS) {
    console.log('  Variações de legenda (opcional). Enter vazio para seguir.');
    for (;;) {
      const v = (await rl.question(`    Variação ${legendas.length + 1}: `)).trim();
      if (!v) break;
      legendas.push(v.replace(/\\n/g, '\n'));
    }
  }

  const post = {
    id,
    date: data,
    title: c.titulo,
    theme: c.campanha || c.categoria || '',
    media: { type: m.tipo, file: arquivo, thumb, alt: c.titulo },
    captions: legendas,
    hashtags: [],
    source_url: c.link,
    credit: config.default_credit || 'Pode Espalhar (podeespalhar.com.br)',
  };
  adicionarPost(posts, post);
  console.log(`  ✔ Adicionado como ${id}`);
  if (bytes > 25 * 1024 * 1024) console.log('  ⚠ Arquivo acima de 25 MB: na Hostinger tudo bem, mas não caberia no Cloudflare Pages.');
  return post;
}

// ---------------------------------------------------------------------------

(async () => {
  const posts = lerJson(ARQ_POSTS);
  const config = lerJson(ARQ_CONFIG);

  console.log('Importar do Pode Espalhar (podeespalhar.com.br)');
  const escolhidos = args.ids ? await Promise.all(String(args.ids).split(',').map((i) => buscarPorId(i.trim()))) : await escolher();

  let data = args.data || hojeSP();
  if (!args.data) {
    for (;;) {
      data = await perguntar(`\nData em que esses posts aparecem no Espalha Hoje [${hojeSP()}]: `, hojeSP());
      if (/^\d{4}-\d{2}-\d{2}$/.test(data)) break;
      console.log('  → Use o formato AAAA-MM-DD.');
    }
  }

  const hashtags = (await perguntar('Hashtags para esses posts (Enter = nenhuma): ', ''))
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((h) => (h.startsWith('#') ? h : '#' + h));

  const importados = [];
  for (const c of escolhidos) {
    try {
      const p = await importar(c, data, posts, config);
      if (p) importados.push(p);
    } catch (e) {
      console.log(`  ✖ Erro ao importar "${c.titulo}": ${e.message}`);
    }
  }
  if (hashtags.length && importados.length) {
    importados.forEach((p) => (p.hashtags = hashtags));
    salvarJson(ARQ_POSTS, posts);
  }

  console.log(`\n${importados.length} post(s) importado(s) para ${data}.`);
  const doDia = posts.filter((p) => p.date === data).length;
  if (doDia > 3) console.log(`⚠ ${data} agora tem ${doDia} posts (o ideal são 3). Edite data/posts.json se quiser remover algum.`);

  const missao = await perguntar(`\nMissão do dia (Enter para manter: "${config.mission || ''}"): `, '');
  if (missao) {
    config.mission = missao;
    salvarJson(ARQ_CONFIG, config);
    console.log('✔ Missão atualizada.');
  }

  const gerar = SEM_PERGUNTAS ? 'n' : (await perguntar('\nGerar o site.zip agora (npm run pacote)? (S/n): ', 's')).toLowerCase();
  rl.close();
  if (gerar !== 'n' && gerar !== 'nao' && gerar !== 'não') {
    const b = spawnSync(process.execPath, [path.join(RAIZ, 'build.js')], { stdio: 'inherit' });
    if (b.status === 0) spawnSync(process.execPath, [path.join(RAIZ, 'scripts/pacote.js')], { stdio: 'inherit' });
  }
})().catch((e) => {
  rl.close();
  console.error('\n✖ ' + e.message);
  process.exit(1);
});
