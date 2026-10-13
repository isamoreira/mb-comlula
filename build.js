// Build do Espalha Hoje: lê data/posts.json e data/config.json e gera o site estático em /dist.
// Uso: npm run build
// Variável de ambiente opcional: SITE_URL (endereço público, usado nas meta tags Open Graph).
// Com "--exemplo", usa os posts de exemplo de test/fixture e gera em dist-teste/ (usado pelos testes).
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { carregarSharp } = require('./scripts/lib/midia');

const RAIZ = __dirname;
const EXEMPLO = process.argv.includes('--exemplo');
// BASE: de onde vêm posts.json e /media. O config.json sempre vem de data/.
const BASE = EXEMPLO ? path.join(RAIZ, 'test/fixture') : RAIZ;
const DIST = path.join(RAIZ, EXEMPLO ? 'dist-teste' : 'dist');
const SRC = path.join(RAIZ, 'src');

// ---------------------------------------------------------------------------
// Leitura e validação dos dados
// ---------------------------------------------------------------------------

function lerJson(rel, base = RAIZ) {
  const arq = path.join(base, rel);
  try {
    return JSON.parse(fs.readFileSync(arq, 'utf8'));
  } catch (e) {
    falhar(`Não consegui ler ${rel}: ${e.message}`);
  }
}

function falhar(msg) {
  console.error('\n✖ ' + msg + '\n');
  process.exit(1);
}

const config = lerJson('data/config.json');
const posts = lerJson('data/posts.json', BASE);

// Prioridade: variável SITE_URL > data/config.json > URL automática do Netlify > localhost.
const SITE_URL = String(process.env.SITE_URL || config.site_url || process.env.URL || 'http://localhost:8080').replace(/\/+$/, '');
const VERSAO = Date.now().toString(36);
// Endereço do contador (fase 2). A variável COUNTER_ENDPOINT tem prioridade sobre o config.
const CONTADOR = String(process.env.COUNTER_ENDPOINT || config.counter_endpoint || '').replace(/\/+$/, '');
const COR = /^#[0-9a-f]{6}$/i.test(config.primary_color || '') ? config.primary_color : '#C4122F';

function validarPosts() {
  if (!Array.isArray(posts)) falhar('data/posts.json precisa ser uma lista [ ... ].');
  const erros = [];
  const avisos = [];
  const ids = new Set();
  posts.forEach((p, i) => {
    const onde = `post #${i + 1} (${p && p.id ? p.id : 'sem id'})`;
    if (!p || typeof p !== 'object') return erros.push(`${onde}: não é um objeto.`);
    if (!p.id || !/^[\w-]+$/.test(p.id)) erros.push(`${onde}: "id" ausente ou com caracteres inválidos (use letras, números, - e _).`);
    if (ids.has(p.id)) erros.push(`${onde}: "id" repetido.`);
    ids.add(p.id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) erros.push(`${onde}: "date" deve ser AAAA-MM-DD.`);
    if (!p.title) erros.push(`${onde}: "title" ausente.`);
    if (!Array.isArray(p.captions) || !p.captions.length) erros.push(`${onde}: "captions" precisa ter pelo menos 1 legenda.`);
    if (!p.media || !['image', 'video'].includes(p.media.type)) erros.push(`${onde}: "media.type" deve ser "image" ou "video".`);
    else {
      if (!p.media.file || !fs.existsSync(path.join(BASE, p.media.file))) erros.push(`${onde}: arquivo de mídia não encontrado: ${p.media.file}`);
      if (p.media.thumb && !fs.existsSync(path.join(BASE, p.media.thumb))) erros.push(`${onde}: thumb não encontrada: ${p.media.thumb}`);
      if (p.media.type === 'video' && !p.media.thumb) erros.push(`${onde}: vídeos precisam de "media.thumb" (imagem de capa).`);
    }
    if (p.hashtags && !Array.isArray(p.hashtags)) erros.push(`${onde}: "hashtags" deve ser uma lista.`);
    if (Array.isArray(p.hashtags) && p.hashtags.length > 5)
      avisos.push(`${onde}: ${p.hashtags.length} hashtags. Só as 5 primeiras são usadas (limite do Instagram).`);
    (p.captions || []).forEach((c, j) => {
      if (/^\s*(#\S+\s*)+$/.test(c)) avisos.push(`${onde}: a legenda ${j + 1} só tem hashtags. Hashtags vão no campo "hashtags".`);
      else if (!/\p{L}/u.test(c)) avisos.push(`${onde}: a legenda ${j + 1} está vazia ou sem texto ("${c}").`);
    });
  });
  avisos.forEach((a) => console.warn('⚠ ' + a));
  if (erros.length) falhar('Problemas em data/posts.json:\n  - ' + erros.join('\n  - '));
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

// Escapa texto para HTML/atributos.
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// JSON seguro para colocar dentro de <script type="application/json">.
function jsonSeguro(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function escrever(rel, conteudo) {
  const arq = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  fs.writeFileSync(arq, conteudo);
}

function copiarPasta(origem, destino) {
  if (!fs.existsSync(origem)) return;
  fs.cpSync(origem, destino, { recursive: true });
}

function resumo(texto, max) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : t;
}

function urlAbs(caminho) {
  return SITE_URL + '/' + String(caminho).replace(/^\/+/, '');
}

// Contraste (WCAG) para escolher texto branco ou preto sobre a cor primária.
function luminancia(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a, b) {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
const SOBRE_COR = contraste(COR, '#ffffff') >= contraste(COR, '#111111') ? '#ffffff' : '#111111';

// ---------------------------------------------------------------------------
// Logo, ícones e imagens Open Graph
// ---------------------------------------------------------------------------

// Logo padrão (se config.logo estiver vazio): quadrado na cor primária com ícone de compartilhar.
function svgLogoPadrao() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
  <rect width="96" height="96" rx="22" fill="${COR}"/>
  <g transform="translate(18 18) scale(2.5)" fill="${SOBRE_COR}">
    <path d="M18 16.1c-.8 0-1.5.3-2 .8l-7.1-4.1c.1-.3.1-.5.1-.8s0-.5-.1-.8L16 7.1c.5.5 1.2.8 2 .8 1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3c0 .3 0 .5.1.8L8 9.8C7.5 9.3 6.8 9 6 9c-1.7 0-3 1.3-3 3s1.3 3 3 3c.8 0 1.5-.3 2-.8l7.1 4.2c-.1.2-.1.4-.1.6 0 1.6 1.3 2.9 2.9 2.9s2.9-1.3 2.9-2.9-1.2-2.9-2.8-2.9z"/>
  </g>
</svg>`;
}

// Copia o logo configurado (ou gera o padrão). Retorna o caminho público e o arquivo de origem.
function prepararLogo() {
  if (config.logo) {
    const origem = path.join(RAIZ, config.logo);
    if (!fs.existsSync(origem)) falhar(`Logo não encontrado: ${config.logo} (data/config.json → "logo").`);
    const publico = 'assets/logo' + path.extname(origem).toLowerCase();
    escrever(publico, fs.readFileSync(origem));
    return { publico, origem };
  }
  escrever('assets/logo.svg', svgLogoPadrao());
  return { publico: 'assets/logo.svg', origem: path.join(DIST, 'assets/logo.svg') };
}

async function gerarIcones(sharp, logo) {
  fs.mkdirSync(path.join(DIST, 'icons'), { recursive: true });
  const base = sharp(logo.origem, { density: 300 }).flatten({ background: COR });
  await base.clone().resize(192, 192, { fit: 'contain', background: COR }).png().toFile(path.join(DIST, 'icons/icon-192.png'));
  await base.clone().resize(512, 512, { fit: 'contain', background: COR }).png().toFile(path.join(DIST, 'icons/icon-512.png'));
  await base.clone().resize(180, 180, { fit: 'contain', background: COR }).png().toFile(path.join(DIST, 'icons/apple-touch-icon.png'));
  // Ícone "maskable": logo menor (zona segura de 80%) sobre a cor primária.
  const miolo = await base.clone().resize(360, 360, { fit: 'contain', background: COR }).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: COR } })
    .composite([{ input: miolo, gravity: 'center' }])
    .png()
    .toFile(path.join(DIST, 'icons/icon-maskable-512.png'));
}

// Imagem 1200x630 para a prévia de links: mídia centralizada sobre fundo desfocado dela mesma.
async function gerarOg(sharp, origem, destino) {
  const fundo = await sharp(origem).resize(1200, 630, { fit: 'cover' }).blur(28).modulate({ brightness: 0.7 }).toBuffer();
  const frente = await sharp(origem).resize(1200, 630, { fit: 'inside' }).toBuffer();
  await sharp(fundo).composite([{ input: frente, gravity: 'center' }]).jpeg({ quality: 82, mozjpeg: true }).toFile(destino);
}

async function gerarOgSite(sharp, logo, destino) {
  const miolo = await sharp(logo.origem, { density: 300 }).resize(300, 300, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: COR } })
    .composite([{ input: miolo, gravity: 'center' }])
    .jpeg({ quality: 85 })
    .toFile(destino);
}

// ---------------------------------------------------------------------------
// Templates HTML
// ---------------------------------------------------------------------------

const NOME = config.project_name || 'Espalha Hoje';

// Configuração enviada ao navegador (somente o necessário).
const CONFIG_PUBLICA = {
  project_name: NOME,
  default_credit: config.default_credit || '',
  counter_endpoint: CONTADOR,
};

let LOGO_PUBLICO = 'assets/logo.svg';

function cabecalhoHtml({ titulo, descricao, canonical, imagem, imagemAlt, tipo = 'website', noindex = false }) {
  const img = imagem || { url: urlAbs('og/site.jpg'), w: 1200, h: 630 };
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
${noindex ? '<meta name="robots" content="noindex, nofollow">' : `<link rel="canonical" href="${esc(canonical)}">`}
<meta name="theme-color" content="${COR}">
<meta name="color-scheme" content="light dark">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/${LOGO_PUBLICO}">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${esc(NOME)}">
<meta property="og:type" content="${tipo}">
<meta property="og:site_name" content="${esc(NOME)}">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(img.url)}">
${img.w ? `<meta property="og:image:width" content="${img.w}">\n<meta property="og:image:height" content="${img.h}">` : ''}
<meta property="og:image:alt" content="${esc(imagemAlt || titulo)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(descricao)}">
<meta name="twitter:image" content="${esc(img.url)}">
<meta name="twitter:image:alt" content="${esc(imagemAlt || titulo)}">
<link rel="stylesheet" href="/css/style.css?v=${VERSAO}">
<link rel="stylesheet" href="/css/theme.css?v=${VERSAO}">
</head>`;
}

function topoHtml({ home = false } = {}) {
  const marca = `<a class="topo__marca" href="/"><img class="topo__logo" src="/${LOGO_PUBLICO}" alt="" width="44" height="44"><span class="topo__nome">${esc(NOME)}</span></a>`;
  if (!home) return `<header class="topo"><div class="wrap">${marca}</div></header>`;
  return `<header class="topo"><div class="wrap">
  <h1 class="sr-only">${esc(NOME)}: conteúdos de hoje</h1>
  ${marca}
  <p class="topo__data" id="data-hoje"></p>
  ${config.mission ? `<div class="missao"><span class="missao__rotulo">Missão do dia</span><p>${esc(config.mission)}</p></div>` : ''}
  <p class="contador" id="contador" hidden></p>
</div></header>`;
}

function rodapeHtml({ creditos = '' } = {}) {
  return `<footer class="rodape"><div class="wrap">
  ${config.footer_identification ? `<p class="rodape__ident">${esc(config.footer_identification)}</p>` : ''}
  <p id="creditos">${esc(creditos)}</p>
  <p>Este site não usa cookies nem rastreadores.</p>
  <nav class="rodape__links" aria-label="Links do rodapé">
    <a href="/">Conteúdos de hoje</a>
    <a href="/arquivo/">Dias anteriores</a>
    ${CONTADOR ? '<a href="/numeros/">Veja os números</a>' : ''}
    <a href="/privacidade/">Privacidade</a>
  </nav>
</div></footer>`;
}

function redeHtml(id, nome, sigla, ehApp) {
  const conteudo = `<span class="rede__marca" aria-hidden="true">${sigla}</span><span>${esc(nome)}</span>`;
  if (ehApp) return `<button type="button" class="rede rede--${id}" data-app="${id}">${conteudo}</button>`;
  return `<a class="rede rede--${id}" data-rede="${id}" href="#" target="_blank" rel="noopener noreferrer">${conteudo}<span class="sr-only"> (abre em nova aba)</span></a>`;
}

// Painel de compartilhar (um por página, preenchido pelo app.js).
function painelHtml() {
  return `<dialog class="painel" id="painel" aria-labelledby="painel-h">
  <div class="painel__inner">
    <div class="painel__alca" aria-hidden="true"></div>
    <div class="painel__topo">
      <div>
        <h2 id="painel-h">Compartilhar</h2>
        <p class="painel__post" data-painel-titulo></p>
      </div>
      <button type="button" class="btn btn--ghost painel__fechar" data-painel-acao="fechar" aria-label="Fechar painel">✕</button>
    </div>

    <h3>Escolha a rede</h3>
    <div class="redes">
      ${redeHtml('whatsapp', 'WhatsApp', 'W')}
      ${redeHtml('telegram', 'Telegram', 'T')}
      ${redeHtml('x', 'X (Twitter)', 'X')}
      ${redeHtml('threads', 'Threads', '@')}
      ${redeHtml('facebook', 'Facebook', 'f')}
      ${redeHtml('reddit', 'Reddit', 'r')}
    </div>
    <p class="painel__nota">No celular, o WhatsApp recebe a foto/vídeo com a legenda (dá para postar no Status). No Facebook, a legenda é copiada automaticamente: é só colar.</p>
    <p class="painel__nota"><a class="painel__link" data-rede="whatsapp" data-so-link href="#" target="_blank" rel="noopener noreferrer">Mandar só o texto com o link no WhatsApp</a></p>

    <h3>Instagram, TikTok e Kwai</h3>
    <div class="redes">
      ${redeHtml('instagram', 'Instagram', 'IG', true)}
      ${redeHtml('tiktok', 'TikTok', 'TT', true)}
      ${redeHtml('kwai', 'Kwai', 'K', true)}
    </div>
    <div class="passos" data-passos hidden>
      <p><strong>Para postar no <span data-passos-rede>app</span>:</strong></p>
      <ol>
        <li>Baixe a mídia.</li>
        <li>Abra o app e cole a legenda (ela já foi copiada).</li>
      </ol>
      <div class="painel__extras">
        <a class="btn btn--primary" data-painel-acao="baixar" data-painel-baixar href="#" download>Baixar mídia</a>
        <button type="button" class="btn btn--ghost" data-painel-acao="copiar">Copiar legenda</button>
      </div>
    </div>

    <div class="painel__extras">
      <button type="button" class="btn btn--ghost" data-painel-acao="copiar">Copiar legenda</button>
      <a class="btn btn--ghost" data-painel-acao="baixar" data-painel-baixar href="#" download>Baixar mídia</a>
      <button type="button" class="btn btn--ghost" data-painel-acao="nativo" data-nativo hidden>Mais apps do celular…</button>
    </div>
  </div>
</dialog>`;
}

function scriptsHtml(extra = '') {
  return `<div class="toast" id="toast" role="status" aria-live="polite" popover="manual"></div>
<script type="application/json" id="eh-config">${jsonSeguro(CONFIG_PUBLICA)}</script>
${extra}
<script src="/js/share.js?v=${VERSAO}" defer></script>
${CONTADOR ? `<script src="/js/contador.js?v=${VERSAO}" defer></script>\n` : ''}<script src="/js/app.js?v=${VERSAO}" defer></script>`;
}

function paginaHome({ canonical }) {
  return `${cabecalhoHtml({
    titulo: `${NOME}: conteúdos de hoje`,
    descricao: config.tagline || 'Os conteúdos do dia, prontos para compartilhar.',
    canonical,
  })}
<body data-page="home">
<a class="pular" href="#conteudo">Pular para os conteúdos</a>
${topoHtml({ home: true })}
<main id="conteudo"><div class="wrap">
  <p class="aviso" id="aviso-dia" role="status" hidden></p>
  <div class="posts" id="posts" aria-busy="true" aria-live="polite">
    <p class="carregando">Carregando os conteúdos de hoje…</p>
  </div>
  <noscript><p class="aviso">Para compartilhar, ative o JavaScript. Você também pode ver a <a href="/arquivo/">lista de conteúdos</a>.</p></noscript>
</div></main>
${rodapeHtml()}
${painelHtml()}
${scriptsHtml()}
</body>
</html>
`;
}

function paginaPost(post, og) {
  const legenda = post.captions[0];
  const m = post.media;
  const canonical = urlAbs(`p/${post.id}/`);
  const alt = m.alt || post.title;
  const fallback = `<noscript><article class="card">
    <div class="card__media"><img src="/${esc(m.thumb || m.file)}" alt="${esc(alt)}"></div>
    <div class="card__body">
      <p class="card__tema">${esc(post.theme || '')}</p>
      <h2 class="card__titulo">${esc(post.title)}</h2>
      <p class="card__legenda">${esc(legenda)}</p>
      <p class="card__tags">${esc((post.hashtags || []).join(' '))}</p>
      <a class="btn btn--primary btn--grande" href="/${esc(m.file)}" download>Baixar mídia</a>
    </div></article></noscript>`;
  return `${cabecalhoHtml({
    titulo: post.title,
    descricao: resumo(legenda, 200),
    canonical,
    imagem: og,
    imagemAlt: alt,
    tipo: 'article',
  })}
<body data-page="post">
<a class="pular" href="#conteudo">Pular para o conteúdo</a>
${topoHtml()}
<main id="conteudo"><div class="wrap">
  <h1 class="sr-only">${esc(post.title)}</h1>
  <p><a class="voltar" href="/">← Ver todos os conteúdos de hoje</a></p>
  <div class="posts" id="posts" aria-live="polite">${fallback}</div>
</div></main>
${rodapeHtml({ creditos: `Créditos dos conteúdos: ${post.credit || config.default_credit || ''}.` })}
${painelHtml()}
${scriptsHtml(`<script type="application/json" id="eh-post">${jsonSeguro(post)}</script>`)}
</body>
</html>
`;
}

function paginaTexto({ pagina, titulo, descricao, canonical, corpo, noindex = false, extraScripts = '' }) {
  return `${cabecalhoHtml({ titulo: `${titulo} · ${NOME}`, descricao, canonical, noindex })}
<body data-page="${pagina}">
<a class="pular" href="#conteudo">Pular para o conteúdo</a>
${topoHtml()}
<main id="conteudo"><div class="wrap texto">
${corpo}
</div></main>
${rodapeHtml()}
${scriptsHtml(extraScripts)}
</body>
</html>
`;
}

function paginaArquivo() {
  return paginaTexto({
    pagina: 'arquivo',
    titulo: 'Dias anteriores',
    descricao: 'Conteúdos de dias anteriores.',
    canonical: urlAbs('arquivo/'),
    corpo: `<p><a class="voltar" href="/">← Voltar para hoje</a></p>
<h1>Dias anteriores</h1>
<div id="lista-arquivo" aria-busy="true"><p class="carregando">Carregando…</p></div>`,
  });
}

function paginaPrivacidade() {
  return paginaTexto({
    pagina: 'privacidade',
    titulo: 'Privacidade',
    descricao: 'Este site não coleta dados pessoais.',
    canonical: urlAbs('privacidade/'),
    corpo: `<p><a class="voltar" href="/">← Voltar para hoje</a></p>
<h1>Privacidade</h1>
<p><strong>Este site não coleta dados pessoais.</strong> Não há login, cadastro, formulários, cookies, Google Analytics ou qualquer rastreador de terceiros.</p>
<h2>O que é contado</h2>
<p>Quando a contagem está ativada, registramos apenas <strong>quantas vezes</strong> cada conteúdo foi compartilhado e em qual rede social (por exemplo: "post X, WhatsApp, +1"). Não registramos endereço IP, identificador do aparelho, localização nem qualquer informação sobre quem compartilhou. Os totais ficam públicos na página <a href="/numeros/">Veja os números</a>.</p>
<p>Para evitar contar duas vezes o mesmo compartilhamento, o seu navegador guarda localmente (no próprio aparelho, sem enviar a ninguém) uma marcação do tipo "este post já foi contado nesta rede". Você pode apagá-la limpando os dados do site no navegador.</p>
<h2>Redes sociais</h2>
<p>Ao tocar em uma rede social, você é levado ao site ou app daquela rede, que tem a própria política de privacidade. Os links levam um parâmetro de campanha (UTM) que indica apenas a rede e a data do conteúdo.</p>
<h2>Uso offline</h2>
<p>O site pode guardar no seu aparelho os conteúdos do dia para abrir mais rápido e funcionar sem internet. Esses arquivos ficam só no seu navegador.</p>
${config.footer_identification ? `<h2>Responsável</h2><p class="rodape__ident">${esc(config.footer_identification)}</p>` : ''}`,
  });
}

// Página pública "Veja os números" (compartilhamentos por rede, por post e por dia).
function paginaNumeros() {
  return paginaTexto({
    pagina: 'numeros',
    titulo: 'Veja os números',
    descricao: 'Quantas vezes os conteúdos foram compartilhados, e em quais redes.',
    canonical: urlAbs('numeros/'),
    corpo: `<p><a class="voltar" href="/">← Voltar para hoje</a></p>
<h1>Veja os números</h1>
<p><label for="numeros-dias">Período: </label>
<select id="numeros-dias" class="btn btn--ghost">
  <option value="1">Hoje</option>
  <option value="7" selected>Últimos 7 dias</option>
  <option value="30">Últimos 30 dias</option>
  <option value="90">Últimos 90 dias</option>
</select></p>
<div id="numeros" aria-live="polite" aria-busy="true"><p class="carregando">Carregando…</p></div>
<p class="painel__nota">Cada toque em uma rede conta 1 vez por post, por rede e por celular. Contagem anônima: sem IP, cookie ou cadastro.</p>`,
    extraScripts: `<script src="/js/numeros.js?v=${VERSAO}" defer></script>`,
  });
}

function pagina404() {
  return paginaTexto({
    pagina: '404',
    titulo: 'Página não encontrada',
    descricao: 'Página não encontrada.',
    canonical: urlAbs(''),
    noindex: true,
    corpo: `<h1>Página não encontrada</h1>
<p>Esse endereço não existe (ou o conteúdo foi removido).</p>
<p><a class="btn btn--primary" href="/">Ver os conteúdos de hoje</a></p>`,
  });
}

// ---------------------------------------------------------------------------
// Arquivos auxiliares: tema, manifest, service worker, headers
// ---------------------------------------------------------------------------

function temaCss() {
  return `/* Gerado pelo build.js a partir de data/config.json. Não edite à mão. */
:root {
  --primary: ${COR};
  --on-primary: ${SOBRE_COR};
}
`;
}

function manifest(temIcones) {
  const icones = temIcones
    ? [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ]
    : [{ src: '/' + LOGO_PUBLICO, sizes: 'any' }];
  return JSON.stringify(
    {
      name: NOME,
      short_name: NOME.length > 12 ? NOME.split(' ')[0] : NOME,
      description: config.tagline || '',
      lang: 'pt-BR',
      start_url: '/?origem=app',
      scope: '/',
      display: 'standalone',
      background_color: COR,
      theme_color: COR,
      icons: icones,
    },
    null,
    2
  );
}

function headers() {
  // Content-Security-Policy: só recursos do próprio site (+ endpoint do contador, se houver).
  let conexoes = "'self'";
  // Endereço relativo (ex.: "/api/contador.php") já é coberto por 'self'.
  if (CONTADOR && !CONTADOR.startsWith('/')) {
    try {
      conexoes += ' ' + new URL(CONTADOR).origin;
    } catch (e) {
      falhar('"counter_endpoint" em data/config.json não é uma URL válida.');
    }
  }
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    `connect-src ${conexoes}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  return `# Cabeçalhos HTTP (Cloudflare Pages e Netlify leem este arquivo).
/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()

/sw.js
  Cache-Control: no-cache

/data/*
  Cache-Control: no-cache
`;
}

// .htaccess: o mesmo que o _headers, para hospedagens Apache/LiteSpeed (ex.: Hostinger).
function htaccess() {
  const csp = /Content-Security-Policy: (.*)/.exec(headers())[1];
  return `# Gerado pelo build.js. Configuração para Apache/LiteSpeed (Hostinger).
DirectoryIndex index.html
ErrorDocument 404 /404.html
Options -Indexes

AddType application/manifest+json .webmanifest
AddType image/svg+xml .svg
AddType video/mp4 .mp4
AddType video/webm .webm

# Sempre HTTPS (necessário para "Copiar legenda" e para a lista de apps do celular).
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTPS} !=on
  RewriteCond %{HTTP:X-Forwarded-Proto} !https
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</IfModule>

<IfModule mod_headers.c>
  Header always set Content-Security-Policy "${csp}"
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=(), interest-cohort=()"

  # HTML, sw.js e posts.json: sempre conferir se há versão nova.
  <FilesMatch "(\\.html|sw\\.js|posts\\.json|\\.webmanifest)$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
  # CSS/JS têm ?v= no endereço; mídias não mudam de nome.
  <FilesMatch "\\.(css|js|jpg|jpeg|png|webp|gif|svg|mp4|webm)$">
    Header set Cache-Control "public, max-age=604800"
  </FilesMatch>
  <FilesMatch "sw\\.js$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
</IfModule>
`;
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

async function main() {
  const inicio = Date.now();
  validarPosts();

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  // Arquivos estáticos e mídias.
  copiarPasta(path.join(SRC, 'css'), path.join(DIST, 'css'));
  copiarPasta(path.join(SRC, 'js'), path.join(DIST, 'js'));
  copiarPasta(path.join(SRC, 'api'), path.join(DIST, 'api')); // contador (PHP, roda na Hostinger)
  copiarPasta(path.join(BASE, 'media'), path.join(DIST, 'media'));
  escrever('css/theme.css', temaCss());

  const logo = prepararLogo();
  LOGO_PUBLICO = logo.publico;

  fs.mkdirSync(path.join(DIST, 'og'), { recursive: true });
  const sharp = carregarSharp();
  if (!sharp) console.warn('⚠ "sharp" não está instalado: ícones PNG e imagens de prévia (OG) não serão gerados. Rode "npm install".');

  // Ícones PWA.
  let temIcones = false;
  if (sharp) {
    try {
      await gerarIcones(sharp, logo);
      await gerarOgSite(sharp, logo, path.join(DIST, 'og/site.jpg'));
      temIcones = true;
    } catch (e) {
      console.warn('⚠ Não consegui gerar ícones a partir do logo:', e.message);
    }
  }

  // Posts: ordem por data/id, dimensões da thumb e imagens OG.
  const ordenados = posts.slice().sort((a, b) => (a.date + a.id < b.date + b.id ? -1 : 1));
  const publicos = [];
  for (const p of ordenados) {
    const post = JSON.parse(JSON.stringify(p));
    post.hashtags = post.hashtags || [];
    const capa = path.join(BASE, post.media.thumb || post.media.file);
    let og = { url: urlAbs(post.media.thumb || post.media.file) };

    if (sharp) {
      try {
        const meta = await sharp(capa).metadata();
        if (meta.width && meta.height) {
          post.media.w = meta.width;
          post.media.h = meta.height;
        }
        await gerarOg(sharp, capa, path.join(DIST, `og/${post.id}.jpg`));
        og = { url: urlAbs(`og/${post.id}.jpg`), w: 1200, h: 630 };
      } catch (e) {
        console.warn(`⚠ Não consegui gerar a imagem de prévia de ${post.id}:`, e.message);
      }
    }
    publicos.push(post);
    escrever(`p/${post.id}/index.html`, paginaPost(post, og));
  }
  escrever('data/posts.json', JSON.stringify(publicos));

  // Páginas.
  escrever('index.html', paginaHome({ canonical: urlAbs('') }));
  escrever('hoje/index.html', paginaHome({ canonical: urlAbs('') }));
  escrever('arquivo/index.html', paginaArquivo());
  escrever('privacidade/index.html', paginaPrivacidade());
  escrever('404.html', pagina404());
  escrever('numeros/index.html', paginaNumeros());

  // PWA e configuração de hospedagem.
  escrever('manifest.webmanifest', manifest(temIcones));
  const shell = [
    '/',
    '/arquivo/',
    '/privacidade/',
    `/css/style.css?v=${VERSAO}`,
    `/css/theme.css?v=${VERSAO}`,
    `/js/share.js?v=${VERSAO}`,
    `/js/app.js?v=${VERSAO}`,
    ...(CONTADOR ? [`/js/contador.js?v=${VERSAO}`] : []),
    '/data/posts.json',
    '/manifest.webmanifest',
    '/' + LOGO_PUBLICO,
  ].concat(temIcones ? ['/icons/icon-192.png'] : []);
  const sw = fs
    .readFileSync(path.join(SRC, 'sw.js'), 'utf8')
    .replace('__VERSAO__', VERSAO)
    .replace('__ARQUIVOS__', JSON.stringify(shell));
  escrever('sw.js', sw);
  escrever('_headers', headers());
  escrever('.htaccess', htaccess());
  escrever('robots.txt', 'User-agent: *\nDisallow: /api/\n');

  const dias = new Set(publicos.map((p) => p.date)).size;
  console.log(`✔ Build concluído em ${Date.now() - inicio} ms → ${path.basename(DIST)}/${EXEMPLO ? ' (posts de exemplo, só para testes)' : ''}`);
  console.log(`  ${publicos.length} posts, ${dias} dia(s). Endereço público: ${SITE_URL}`);
  console.log(CONTADOR ? `  Contador ativado: ${CONTADOR}` : '  Contador desativado (preencha "counter_endpoint" em data/config.json).');
  if (!publicos.length) console.log('  Nenhum post ainda: adicione com "npm run novo-post".');
  if (/espalha-hoje\.pages\.dev/.test(SITE_URL)) {
    console.log('  Dica: ajuste "site_url" em data/config.json (ou a variável SITE_URL) para o endereço real do site.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
