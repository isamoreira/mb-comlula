// Servidor local para testar o site gerado em /dist.
// Uso: npm run dev   (rode "npm run build" antes)
// Porta: variável PORT (padrão 8080). Fica acessível na rede local para testar no celular.
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

// DIST_DIR permite servir outra pasta (os testes usam dist-teste/).
const DIST = path.join(__dirname, process.env.DIST_DIR || 'dist');
const PORTA = Number(process.env.PORT) || 8080;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.txt': 'text/plain; charset=utf-8',
};

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('A pasta dist/ não existe. Rode primeiro: npm run build');
  process.exit(1);
}

// Encontra o arquivo para a URL: /x → /x, /x/index.html ou /x.html.
function resolver(urlPath) {
  const limpo = path.normalize(decodeURIComponent(urlPath)).replace(/^([\\/]\.\.)+/, '');
  const base = path.join(DIST, limpo);
  if (!base.startsWith(DIST)) return null; // impede sair da pasta dist
  const candidatos = [base, path.join(base, 'index.html'), base + '.html'];
  return candidatos.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) || null;
}

// O site pode morar numa subpasta (ex.: "/mb-comlula/" no GitHub Pages). Simulamos o mesmo aqui,
// lendo o endereço público gravado no build.
const PREFIXO = (() => {
  const og = (/og:url" content="([^"]*)"/.exec(fs.readFileSync(path.join(DIST, 'index.html'), 'utf8')) || [])[1];
  try {
    return og ? new URL(og).pathname : '/';
  } catch (e) {
    return '/';
  }
})();

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (PREFIXO !== '/') {
    // "/" ou "/mb-comlula" → "/mb-comlula/"
    if (url.pathname === '/' || url.pathname + '/' === PREFIXO) {
      res.writeHead(302, { Location: PREFIXO + url.search });
      return res.end();
    }
    if (!url.pathname.startsWith(PREFIXO)) {
      res.writeHead(404, { 'Content-Type': TIPOS['.html'] });
      return fs.createReadStream(path.join(DIST, '404.html')).pipe(res);
    }
  }
  const caminho = '/' + url.pathname.slice(PREFIXO.length);

  // /hoje → /hoje/ (igual ao GitHub Pages, Cloudflare Pages e Netlify)
  if (!caminho.endsWith('/') && !path.extname(caminho) && fs.existsSync(path.join(DIST, caminho, 'index.html'))) {
    res.writeHead(301, { Location: url.pathname + '/' + url.search });
    return res.end();
  }

  const arquivo = resolver(caminho);
  if (!arquivo) {
    res.writeHead(404, { 'Content-Type': TIPOS['.html'] });
    return fs.createReadStream(path.join(DIST, '404.html')).pipe(res);
  }

  const tipo = TIPOS[path.extname(arquivo).toLowerCase()] || 'application/octet-stream';
  const tamanho = fs.statSync(arquivo).size;
  const cabecalhos = { 'Content-Type': tipo, 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes' };

  // Suporte a "Range" (necessário para avançar/voltar vídeos no Safari).
  const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
  if (range) {
    const inicio = range[1] ? Number(range[1]) : 0;
    const fim = range[2] ? Math.min(Number(range[2]), tamanho - 1) : tamanho - 1;
    res.writeHead(206, { ...cabecalhos, 'Content-Range': `bytes ${inicio}-${fim}/${tamanho}`, 'Content-Length': fim - inicio + 1 });
    return fs.createReadStream(arquivo, { start: inicio, end: fim }).pipe(res);
  }

  res.writeHead(200, { ...cabecalhos, 'Content-Length': tamanho });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(arquivo).pipe(res);
});

servidor.listen(PORTA, () => {
  console.log(`\nEspalha Hoje rodando em: http://localhost:${PORTA}${PREFIXO}`);
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
  ips.forEach((ip) => console.log(`No celular (mesmo Wi-Fi):  http://${ip}:${PORTA}${PREFIXO}`));
  console.log('\nObs.: no celular via IP local (sem HTTPS), "copiar" e a lista nativa de apps podem não funcionar.');
  console.log('Isso funciona normalmente depois do deploy (HTTPS). Ctrl+C para parar.\n');
});
