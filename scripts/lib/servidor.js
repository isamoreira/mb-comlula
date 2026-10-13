// Funções para conferir o site publicado (usadas pelo `pacote` e pelo `conferir`).
'use strict';

const fs = require('fs');
const path = require('path');

function listar(dir, base = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const rel = base ? `${base}/${e.name}` : e.name;
    return e.isDirectory() ? listar(path.join(dir, e.name), rel) : [rel];
  });
}

// Confere no site publicado quais arquivos FALTAM (ou estão com tamanho diferente) no servidor.
// Retorna null se não conseguir acessar o site (sem internet etc.).
async function faltandoNoServidor(site, dist, arquivos, aoConferir) {
  const faltando = new Set();
  let respondeu = false;
  const fila = arquivos.filter((rel) => !path.basename(rel).startsWith('.')); // .htaccess não é acessível de fora
  async function conferir(rel) {
    const url = `${site}/${rel.split('/').map(encodeURIComponent).join('/')}`;
    try {
      const r = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(20000) });
      respondeu = true;
      // Se a Hostinger comprime o arquivo (br/gzip), o tamanho informado é o comprimido: não dá para comparar.
      const comprimido = !!r.headers.get('content-encoding');
      const tamanho = comprimido ? 0 : Number(r.headers.get('content-length'));
      if (!r.ok || (tamanho && tamanho !== fs.statSync(path.join(dist, rel)).size)) faltando.add(rel);
    } catch (e) {
      faltando.add(rel);
    }
    if (aoConferir) aoConferir();
  }
  for (let i = 0; i < fila.length; i += 8) await Promise.all(fila.slice(i, i + 8).map(conferir));
  return respondeu ? faltando : null;
}

// Endereço público gravado no build (og:url da página inicial).
function enderecoDoSite(dist) {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  return ((/og:url" content="([^"]*)"/.exec(html) || [])[1] || '').replace(/\/+$/, '');
}

module.exports = { listar, faltandoNoServidor, enderecoDoSite };
