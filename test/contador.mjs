// Testes do contador (api/contador.php) e da página "Veja os números".
//
// Roda o PHP de verdade usando o PHP em WebAssembly (@php-wasm/node). Como ele é grande (~470 MB),
// não faz parte do projeto: instale numa pasta à parte e aponte PHP_WASM_DIR para ela:
//   mkdir ../php-wasm && cd ../php-wasm && npm init -y && npm i @php-wasm/node@3
//   PHP_WASM_DIR=../php-wasm npm run test:contador
// Sem isso, o teste é pulado.
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(RAIZ, 'dist-teste');
const FOTOS = path.join(RAIZ, 'test/screenshots');
const PORTA_SITE = 8099;
const PORTA_ESTATICO = 8097;

// ---------------------------------------------------------------------------
// Carrega o PHP em WebAssembly
// ---------------------------------------------------------------------------
const dirPhp = path.resolve(process.env.PHP_WASM_DIR || RAIZ);
const pacoteNode = path.join(dirPhp, 'node_modules/@php-wasm/node/index.js');
if (!fs.existsSync(pacoteNode)) {
  console.log('\n⏭  Teste do contador PULADO: PHP em WebAssembly não encontrado.');
  console.log('   Veja as instruções no topo de test/contador.mjs.\n');
  process.exit(0);
}
const { loadNodeRuntime, createNodeFsMountHandler } = await import(pathToFileURL(pacoteNode).href);
const { PHP } = await import(pathToFileURL(path.join(dirPhp, 'node_modules/@php-wasm/universal/index.js')).href);

async function novoPhp(pastaSite) {
  // O carregador procura o .wasm a partir da pasta atual: entramos nela só durante o carregamento.
  const antes = process.cwd();
  process.chdir(path.join(dirPhp, 'node_modules/@php-wasm/node-8-3/asyncify'));
  const php = new PHP(await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 1 } }));
  process.chdir(antes);
  php.mkdir('/www');
  await php.mount('/www', createNodeFsMountHandler(pastaSite));
  // Uma requisição por vez (o PHP em WebAssembly não atende em paralelo).
  let fila = Promise.resolve();
  php.requisitar = (uri, metodo = 'GET', corpo, script = '/www/api/contador.php') => {
    const r = fila.then(() =>
      php.run({ scriptPath: script, relativeUri: uri, method: metodo, body: corpo ? new TextEncoder().encode(corpo) : undefined })
    );
    fila = r.catch(() => {});
    return r;
  };
  return php;
}

let falhas = 0;
async function teste(nome, fn) {
  try {
    await fn();
    console.log('  ✔ ' + nome);
  } catch (e) {
    falhas++;
    console.log('  ✖ ' + nome + '\n    ' + String(e.message).split('\n').join('\n    '));
  }
}

// Gera o site de teste com o contador ligado.
const build = spawnSync(process.execPath, [path.join(RAIZ, 'build.js'), '--exemplo'], {
  env: { ...process.env, COUNTER_ENDPOINT: '/api/contador.php' },
  encoding: 'utf8',
});
assert.strictEqual(build.status, 0, build.stderr);
const posts = JSON.parse(fs.readFileSync(path.join(DIST, 'data/posts.json'), 'utf8'));
const ID = posts[0].id;

// ---------------------------------------------------------------------------
// 1) PHP: SQLite (padrão) e arquivo JSON (quando a hospedagem não tem SQLite)
// ---------------------------------------------------------------------------
const semSqlite = fs
  .readFileSync(path.join(DIST, 'api/contador.php'), 'utf8')
  .replace("if (!in_array('sqlite', PDO::getAvailableDrivers(), true))", 'if (true)');
fs.writeFileSync(path.join(DIST, 'api/contador-json.php'), semSqlite);

for (const [modo, script] of [
  ['SQLite', '/www/api/contador.php'],
  ['arquivo JSON', '/www/api/contador-json.php'],
]) {
  console.log(`\nPHP (${modo})`);
  const php = await novoPhp(DIST);
  const uri = (q) => '/api/contador.php?' + q;
  const hit = (corpo) => php.requisitar(uri('acao=hit'), 'POST', typeof corpo === 'string' ? corpo : JSON.stringify(corpo), script);
  const get = (q) => php.requisitar(uri(q), 'GET', undefined, script);

  await teste('POST hit válido → 204 e soma', async () => {
    assert.strictEqual((await hit({ postId: ID, network: 'whatsapp' })).httpStatusCode, 204);
    assert.strictEqual((await hit({ postId: ID, network: 'whatsapp' })).httpStatusCode, 204);
    assert.strictEqual((await hit({ postId: ID, network: 'instagram' })).httpStatusCode, 204);
  });
  await teste('post que não existe no site → 400', async () => assert.strictEqual((await hit({ postId: '2099-01-01-01', network: 'x' })).httpStatusCode, 400));
  await teste('rede desconhecida → 400', async () => assert.strictEqual((await hit({ postId: ID, network: 'orkut' })).httpStatusCode, 400));
  await teste('JSON inválido → 400', async () => assert.strictEqual((await hit('{oops')).httpStatusCode, 400));
  await teste('GET em hit → 404', async () => assert.strictEqual((await get('acao=hit')).httpStatusCode, 404));
  await teste('hoje → total do dia', async () => {
    const r = await get('acao=hoje');
    assert.strictEqual(r.json.total, 3);
    assert.match(r.json.dia, /^\d{4}-\d{2}-\d{2}$/);
  });
  await teste('numeros → por rede, por post e por dia', async () => {
    const d = (await get('acao=numeros&dias=7')).json;
    assert.strictEqual(d.total, 3);
    assert.strictEqual(d.hoje, 3);
    assert.deepStrictEqual(d.por_rede, { whatsapp: 2, instagram: 1 });
    assert.deepStrictEqual(d.por_post, [{ post_id: ID, total: 3, redes: { whatsapp: 2, instagram: 1 } }]);
  });
  await teste('dados ficam FORA da pasta do site', async () => {
    assert.ok(php.fileExists('/espalha-hoje-dados'), 'pasta /espalha-hoje-dados não criada');
    assert.ok(!fs.existsSync(path.join(DIST, 'api/dados')), 'não deveria usar api/dados');
  });
  await teste('não guarda IP nem cookie', async () => {
    const codigo = fs.readFileSync(path.join(RAIZ, 'src/api/contador.php'), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/REMOTE_ADDR|X_FORWARDED|HTTP_COOKIE|\$_COOKIE|setcookie|session_start/i.test(codigo));
  });
}
fs.rmSync(path.join(DIST, 'api/contador-json.php'));

// ---------------------------------------------------------------------------
// 2) Site + contador no Chrome (390px)
// ---------------------------------------------------------------------------
console.log('\nSite + contador no Chrome (390px)');
const php = await novoPhp(DIST);
const estatico = spawn(process.execPath, [path.join(RAIZ, 'dev.js')], {
  env: { ...process.env, PORT: String(PORTA_ESTATICO), DIST_DIR: 'dist-teste' },
  stdio: 'ignore',
});
// Servidor de teste: /api/contador.php vai para o PHP; o resto, para o dev.js.
const servidor = http
  .createServer(async (req, res) => {
    if (req.url.startsWith('/api/contador.php')) {
      const pedacos = [];
      for await (const c of req) pedacos.push(c);
      const r = await php.requisitar(req.url, req.method, pedacos.length ? Buffer.concat(pedacos).toString() : undefined);
      res.writeHead(r.httpStatusCode, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(r.text);
    }
    const r = await fetch(`http://localhost:${PORTA_ESTATICO}${req.url}`, { redirect: 'manual' });
    res.writeHead(r.status, Object.fromEntries([...r.headers].filter(([k]) => !/encoding|length/i.test(k))));
    res.end(Buffer.from(await r.arrayBuffer()));
  })
  .listen(PORTA_SITE);
await new Promise((r) => setTimeout(r, 800));

const puppeteer = require('puppeteer-core');
const chrome = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((c) => c && fs.existsSync(c));
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // O navegador "acha" que hoje é o dia dos posts de exemplo.
  const AGORA = new Date(posts[0].date + 'T15:00:00Z').getTime();
  await page.evaluateOnNewDocument(`(() => { const f = ${AGORA}; const D = Date; window.Date = class extends D { constructor(...a){ super(...(a.length ? a : [f])); } static now(){ return f; } }; })();`);
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto(`http://localhost:${PORTA_SITE}/`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.card');

  await teste('sem compartilhamentos, o contador fica escondido', async () => {
    assert.strictEqual(await page.$eval('#contador', (e) => e.hidden), true);
  });

  // Impede que os links abram as redes de verdade durante o teste.
  await page.evaluate(() => document.querySelectorAll('#painel a[data-rede]').forEach((a) => a.addEventListener('click', (e) => e.preventDefault())));
  const tocar = async (card, seletor) => {
    await page.click(`.card:nth-child(${card}) [data-acao="compartilhar"]`);
    await page.waitForSelector('#painel[open]');
    await page.click(seletor);
    await page.click('#painel [data-painel-acao="fechar"]');
  };

  await teste('cada toque em uma rede conta 1 vez por post/rede/aparelho', async () => {
    await tocar(1, '#painel a[data-rede="whatsapp"]'); // WhatsApp
    await tocar(1, '#painel a[data-rede="whatsapp"]'); // repetido: não conta
    await tocar(1, '#painel a[data-rede="telegram"]');
    await tocar(2, '#painel a[data-rede="x"]');
    await new Promise((r) => setTimeout(r, 800));
    const d = (await php.requisitar('/api/contador.php?acao=numeros&dias=1')).json;
    assert.deepStrictEqual(d.por_rede, { whatsapp: 1, telegram: 1, x: 1 });
  });

  await teste('mostra "3 pessoas já compartilharam hoje · veja os números"', async () => {
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('#contador:not([hidden])');
    assert.strictEqual(await page.$eval('#contador', (e) => e.textContent), '3 pessoas já compartilharam hoje · veja os números');
    assert.strictEqual(await page.$eval('#contador a', (a) => a.getAttribute('href')), '/numeros/');
  });
  await page.screenshot({ path: path.join(FOTOS, '08-contador-390.png') });

  await teste('rodapé tem o link "Veja os números"', async () => {
    assert.ok(await page.$('.rodape a[href="/numeros/"]'));
  });

  await teste('/numeros/ mostra hoje, por rede e por post (sem senha)', async () => {
    await page.goto(`http://localhost:${PORTA_SITE}/numeros/`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#numeros .barras');
    const t = await page.$eval('#numeros', (e) => e.textContent);
    assert.ok(t.includes('compartilhamentos hoje'), t);
    assert.ok(t.includes('WhatsApp') && t.includes('Telegram') && t.includes('X (Twitter)'), t);
    assert.ok(t.includes(posts[0].title) && t.includes(posts[1].title), t);
    const destaque = await page.$eval('.destaque strong', (e) => e.textContent);
    assert.strictEqual(destaque, '3');
  });

  await teste('/numeros/ sem rolagem horizontal', async () => {
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(w <= 390, 'scrollWidth = ' + w);
  });
  await page.screenshot({ path: path.join(FOTOS, '09-numeros-390.png'), fullPage: true });

  await teste('sem erros no console', async () => assert.deepStrictEqual(erros, []));
} finally {
  await browser.close();
  estatico.kill();
  servidor.close();
}

console.log(falhas ? `\n✖ ${falhas} teste(s) falharam.\n` : '\n✔ Todos os testes do contador passaram.\n');
process.exit(falhas ? 1 : 0);
