// Testes do contador (contador-google/Codigo.gs, Google Apps Script) e da página "Veja os números".
// O código do Apps Script roda aqui no Node com uma planilha simulada em memória.
// Depois, o site é testado no Chrome (390px) morando em /mb-comlula/, como no GitHub Pages.
// Uso: npm run test:contador
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(RAIZ, 'dist-teste');
const FOTOS = path.join(RAIZ, 'test/screenshots');
const PORTA_SITE = 8099;
const PORTA_CONTADOR = 8788;
const PREFIXO = '/mb-comlula/';

// Gera o site de teste na subpasta, com o contador apontando para o "Apps Script" local.
const build = spawnSync(process.execPath, [path.join(RAIZ, 'build.js'), '--exemplo'], {
  env: { ...process.env, SITE_URL: `http://localhost:${PORTA_SITE}${PREFIXO}`, COUNTER_ENDPOINT: `http://localhost:${PORTA_CONTADOR}/exec` },
  encoding: 'utf8',
});
assert.strictEqual(build.status, 0, build.stderr);
const posts = JSON.parse(fs.readFileSync(path.join(DIST, 'data/posts.json'), 'utf8'));
const ID = posts[0].id;

// ---------------------------------------------------------------------------
// Google Apps Script simulado
// ---------------------------------------------------------------------------
function novoAppsScript() {
  const linhas = []; // a "planilha"
  const props = {};
  const cache = {};
  const dataSP = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const aba = {
    setName() {},
    setFrozenRows() {},
    // A planilha de verdade guarda "'2026-10-14" como o texto 2026-10-14.
    appendRow: (r) => linhas.push(r.map((v) => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v))),
    getDataRange: () => ({ getValues: () => linhas.map((l) => l.slice()) }),
    getRange: (lin, col) => ({ setValue: (v) => (linhas[lin - 1][col - 1] = v) }),
  };
  const planilha = { getSheets: () => [aba], getSheetByName: () => aba, getId: () => 'id-123', getUrl: () => 'https://docs.google.com/spreadsheets/d/id-123' };
  const ctx = {
    _planilha: linhas,
    Logger: { log() {} },
    SpreadsheetApp: { create: () => planilha, openById: () => planilha },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => (props[k] = v) }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => (cache[k] = v) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    UrlFetchApp: {
      fetch: () => ({ getResponseCode: () => 200, getContentText: () => fs.readFileSync(path.join(DIST, 'data/posts.json'), 'utf8') }),
    },
    Utilities: { formatDate: (d) => dataSP(d) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (texto) => ({ texto, setMimeType() { return this; } }),
    },
    Date,
    JSON,
    Math,
    Object,
    String,
    Number,
    parseInt,
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'contador-google/Codigo.gs'), 'utf8'), ctx);
  ctx.post = (corpo) => JSON.parse(ctx.doPost({ postData: { contents: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) } }).texto);
  ctx.get = (parametros) => JSON.parse(ctx.doGet({ parameter: parametros }).texto);
  return ctx;
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

// ---------------------------------------------------------------------------
// 1) Código do Apps Script
// ---------------------------------------------------------------------------
console.log('\nApps Script (Codigo.gs)');
{
  const gs = novoAppsScript();
  await teste('configurar() cria a planilha com o cabeçalho', async () => {
    assert.match(gs.configurar(), /docs\.google\.com/);
    assert.strictEqual(JSON.stringify(gs._planilha[0]), JSON.stringify(['dia', 'post', 'rede', 'compartilhamentos']));
  });
  await teste('hit válido soma 1 (mesma linha para o mesmo dia/post/rede)', async () => {
    assert.deepStrictEqual(gs.post({ postId: ID, network: 'whatsapp' }), { ok: true });
    gs.post({ postId: ID, network: 'whatsapp' });
    gs.post({ postId: ID, network: 'instagram' });
    assert.strictEqual(gs._planilha.length, 3); // cabeçalho + 2 linhas
    assert.strictEqual(gs._planilha[1][3], 2);
  });
  await teste('post que não existe no site é recusado', async () => assert.ok(gs.post({ postId: '2099-01-01-01', network: 'x' }).erro));
  await teste('rede desconhecida é recusada', async () => assert.ok(gs.post({ postId: ID, network: 'orkut' }).erro));
  await teste('JSON inválido é recusado', async () => assert.ok(gs.post('{oops').erro));
  await teste('acao=hoje → total do dia', async () => assert.strictEqual(gs.get({ acao: 'hoje' }).total, 3));
  await teste('acao=numeros → por rede, por post e por dia', async () => {
    const d = gs.get({ acao: 'numeros', dias: '7' });
    assert.strictEqual(d.total, 3);
    assert.strictEqual(d.hoje, 3);
    assert.deepStrictEqual(d.por_rede, { whatsapp: 2, instagram: 1 });
    assert.deepStrictEqual(d.por_post, [{ post_id: ID, total: 3, redes: { whatsapp: 2, instagram: 1 } }]);
  });
  await teste('dia guardado como data pela planilha continua sendo lido certo', async () => {
    gs._planilha[1][0] = new Date(gs._planilha[1][0] + 'T12:00:00-03:00');
    assert.strictEqual(gs.get({ acao: 'hoje' }).total, 3);
  });
  await teste('não lê IP, cookie nem identificador', async () => {
    const codigo = fs.readFileSync(path.join(RAIZ, 'contador-google/Codigo.gs'), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
    assert.ok(!/getActiveUser|getEffectiveUser|getTemporaryActiveUserKey|cookie|REMOTE_ADDR/i.test(codigo));
  });
}

// ---------------------------------------------------------------------------
// 2) Site em /mb-comlula/ + contador no Chrome (390px)
// ---------------------------------------------------------------------------
console.log('\nSite em /mb-comlula/ + contador no Chrome (390px)');
const gs = novoAppsScript();
gs.configurar();
const contador = http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pedacos = [];
    for await (const c of req) pedacos.push(c);
    const resposta =
      req.method === 'POST'
        ? gs.doPost({ postData: { contents: Buffer.concat(pedacos).toString() } })
        : gs.doGet({ parameter: Object.fromEntries(url.searchParams) });
    // O Apps Script de verdade responde com CORS liberado.
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(resposta.texto);
  })
  .listen(PORTA_CONTADOR);
const site = spawn(process.execPath, [path.join(RAIZ, 'dev.js')], { env: { ...process.env, PORT: String(PORTA_SITE), DIST_DIR: 'dist-teste' }, stdio: 'ignore' });
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
const RAIZ_SITE = `http://localhost:${PORTA_SITE}${PREFIXO}`;

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const AGORA = new Date(posts[0].date + 'T15:00:00Z').getTime();
  await page.evaluateOnNewDocument(`(() => { const f = ${AGORA}; const D = Date; window.Date = class extends D { constructor(...a){ super(...(a.length ? a : [f])); } static now(){ return f; } }; })();`);
  const erros = [];
  const quebrados = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
  page.on('response', (r) => r.status() >= 400 && quebrados.push(r.status() + ' ' + r.url()));
  await page.goto(RAIZ_SITE, { waitUntil: 'networkidle0' });

  await teste('site abre em /mb-comlula/ com visual, fotos e cards', async () => {
    await page.waitForSelector('.card');
    const cor = await page.evaluate(() => getComputedStyle(document.querySelector('.topo')).backgroundColor);
    assert.notStrictEqual(cor, 'rgba(0, 0, 0, 0)', 'CSS não carregou');
    const fotos = await page.$$eval('.card img', (is) => is.filter((i) => i.complete && i.naturalWidth > 0).length);
    assert.ok(fotos > 0, 'nenhuma foto carregou');
    assert.deepStrictEqual(quebrados, []);
  });

  await teste('links internos ficam dentro de /mb-comlula/', async () => {
    const fora = await page.$$eval('a[href^="/"], img[src^="/"], source[src^="/"], link[href^="/"], script[src^="/"]', (els, pre) =>
      els.map((e) => e.getAttribute('href') || e.getAttribute('src')).filter((u) => !u.startsWith(pre)), PREFIXO);
    assert.deepStrictEqual(fora, []);
  });

  await teste('service worker instala com escopo /mb-comlula/', async () => {
    const escopo = await page.evaluate(() => navigator.serviceWorker.ready.then((r) => new URL(r.scope).pathname));
    assert.strictEqual(escopo, PREFIXO);
  });

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
    await tocar(1, '#painel a[data-rede="whatsapp"]');
    await tocar(1, '#painel a[data-rede="whatsapp"]'); // repetido: não conta
    await tocar(1, '#painel a[data-rede="telegram"]');
    await tocar(2, '#painel a[data-rede="x"]');
    await new Promise((r) => setTimeout(r, 800));
    assert.deepStrictEqual(gs.get({ acao: 'numeros', dias: '1' }).por_rede, { whatsapp: 1, telegram: 1, x: 1 });
  });

  await teste('mostra "3 pessoas já compartilharam hoje · veja os números"', async () => {
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('#contador:not([hidden])');
    assert.strictEqual(await page.$eval('#contador', (e) => e.textContent), '3 pessoas já compartilharam hoje · veja os números');
    assert.strictEqual(await page.$eval('#contador a', (a) => a.getAttribute('href')), PREFIXO + 'numeros/');
  });
  await page.screenshot({ path: path.join(FOTOS, '08-contador-390.png') });

  await teste('/numeros/ mostra hoje, por rede e por post', async () => {
    await page.goto(RAIZ_SITE + 'numeros/', { waitUntil: 'networkidle0' });
    await page.waitForSelector('#numeros .barras');
    const t = await page.$eval('#numeros', (e) => e.textContent);
    assert.ok(t.includes('compartilhamentos hoje'), t);
    assert.ok(t.includes('WhatsApp') && t.includes('Telegram') && t.includes('X (Twitter)'), t);
    assert.ok(t.includes(posts[0].title) && t.includes(posts[1].title), t);
  });
  await page.screenshot({ path: path.join(FOTOS, '09-numeros-390.png'), fullPage: true });

  await teste('página de um post funciona em /mb-comlula/p/<id>/', async () => {
    await page.goto(`${RAIZ_SITE}p/${ID}/`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.card [data-acao="compartilhar"]');
    const og = await page.$eval('meta[property="og:url"]', (m) => m.content);
    assert.strictEqual(og, `${RAIZ_SITE}p/${ID}/`);
  });

  await teste('sem erros no console', async () => assert.deepStrictEqual(erros, []));
} finally {
  await browser.close();
  site.kill();
  contador.close();
}

console.log(falhas ? `\n✖ ${falhas} teste(s) falharam.\n` : '\n✔ Todos os testes do contador passaram.\n');
process.exit(falhas ? 1 : 0);
