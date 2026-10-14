// Confere se o site publicado está completo: todos os arquivos de dist/ precisam estar no servidor.
// Uso: npm run conferir   (rode depois de extrair o site.zip na Hostinger)
'use strict';

const fs = require('fs');
const path = require('path');
const { listar, faltandoNoServidor, enderecoDoSite } = require('./lib/servidor');

const DIST = path.join(__dirname, '..', 'dist');

(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('dist/ não existe. Rode "npm run build" antes.');
    process.exit(1);
  }
  const site = enderecoDoSite(DIST);
  const todos = listar(DIST);
  console.log(`Conferindo ${todos.length} arquivos em ${site}…`);
  const faltando = await faltandoNoServidor(site, DIST, todos);
  if (faltando === null) {
    console.error('✖ Não consegui acessar o site. Confira a internet e o endereço.');
    process.exit(1);
  }

  // Contador de compartilhamentos.
  let contador = '';
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data/config.json'), 'utf8'));
  if (config.counter_endpoint) {
    try {
      const r = await fetch(new URL(config.counter_endpoint + '?acao=hoje', site + '/'), { cache: 'no-store' });
      const d = r.ok ? await r.json() : null;
      contador = d && typeof d.total === 'number' ? `✔ Contador funcionando (${d.total} hoje).` : `✖ Contador não respondeu (HTTP ${r.status}).`;
    } catch (e) {
      contador = '✖ Contador não respondeu.';
    }
  }

  if (!faltando.size) {
    console.log('✔ Tudo no ar: nenhum arquivo faltando.');
  } else {
    const lista = [...faltando];
    const midias = lista.filter((r) => r.startsWith('media/'));
    console.log(`✖ ${lista.length} arquivo(s) faltando ou diferentes no servidor${midias.length ? ` (${midias.length} mídias: fotos/vídeos)` : ''}:`);
    lista.slice(0, 15).forEach((r) => console.log('   - ' + r));
    if (lista.length > 15) console.log(`   … e mais ${lista.length - 15}.`);
    console.log('\n→ Se acabou de publicar, espere 1–2 minutos e confira de novo.');
    console.log('  Se continuar faltando, rode "npm run publicar".');
  }
  if (contador) console.log(contador);
  process.exit(faltando.size ? 1 : 0);
})();
