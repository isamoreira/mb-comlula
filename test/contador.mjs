// Testes da fase 2 (contador anônimo).
// 1) Testa o Worker direto, com um banco D1 simulado em memória.
// 2) Sobe o Worker localmente, gera o site apontando para ele e testa no Chrome (390px):
//    clique conta 1x por post/rede/aparelho, "X pessoas já compartilharam hoje" e /admin-stats/.
// Uso: npm run test:contador   (usa os posts de exemplo em dist-teste/)
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FOTOS = path.join(RAIZ, 'test/screenshots');
const PORTA_SITE = 8099;
const PORTA_WORKER = 8788;
const TOKEN = 'token-de-teste-123';

// O Worker e o navegador "acham" que hoje é o último dia com posts.
const posts = JSON.parse(fs.readFileSync(path.join(RAIZ, 'test/fixture/data/posts.json'), 'utf8'));
const DIA = posts.map((p) => p.date).sort().pop();
const AGORA = new Date(DIA + 'T15:00:00Z').getTime();
const DataReal = Date;
globalThis.Date = class extends DataReal {
  constructor(...a) {
    super(...(a.length ? a : [AGORA]));
  }
  static now() {
    return AGORA;
  }
};

const { default: worker } = await import('../worker/src/index.js');

// Banco D1 falso: entende só as 3 consultas que o Worker usa.
function bancoFalso() {
  const linhas = new Map();
  return {
    linhas,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind: (...a) => ((args = a), stmt),
        async run() {
          assert.ok(/^INSERT INTO shares/.test(sql));
          const [day, post_id, network] = args;
          const k = [day, post_id, network].join('|');
          linhas.set(k, (linhas.get(k) || 0) + 1);
          return { success: true };
        },
        async first() {
          assert.ok(/SUM\(n\)/.test(sql));
          let total = 0;
          for (const [k, n] of linhas) if (k.startsWith(args[0] + '|')) total += n;
          return { total };
        },
        async all() {
          const results = [...linhas]
            .map(([k, n]) => {
              const [day, post_id, network] = k.split('|');
              return { day, post_id, network, n };
            })
            .filter((r) => r.day >= args[0]);
          return { results };
        },
      };
      return stmt;
    },
  };
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
console.log('\nWorker (unitário)');
{
  const env = { DB: bancoFalso(), ADMIN_TOKEN: TOKEN, ALLOWED_ORIGIN: '*' };
  const chamar = (caminho, init) => worker.fetch(new Request('https://w.test' + caminho, init), env, { waitUntil() {} });
  const hit = (corpo) => chamar('/hit', { method: 'POST', body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) });
  const id = `${DIA}-01`;

  await teste('POST /hit válido responde 204 e soma 1', async () => {
    assert.strictEqual((await hit({ postId: id, network: 'whatsapp' })).status, 204);
    assert.strictEqual((await hit({ postId: id, network: 'whatsapp' })).status, 204);
    assert.strictEqual(env.DB.linhas.get(`${DIA}|${id}|whatsapp`), 2);
  });
  await teste('rede desconhecida → 400', async () => assert.strictEqual((await hit({ postId: id, network: 'orkut' })).status, 400));
  await teste('postId inválido → 400', async () => assert.strictEqual((await hit({ postId: '../x', network: 'x' })).status, 400));
  await teste('JSON inválido → 400', async () => assert.strictEqual((await hit('{oops')).status, 400));
  await teste('corpo grande → 413', async () => assert.strictEqual((await hit('x'.repeat(2000))).status, 413));
  await teste('GET /today devolve o total do dia', async () => {
    const r = await chamar('/today');
    assert.deepStrictEqual(await r.json(), { day: DIA, total: 2 });
    assert.strictEqual(r.headers.get('Access-Control-Allow-Origin'), '*');
  });
  await teste('GET /stats sem token → 401', async () => assert.strictEqual((await chamar('/stats')).status, 401));
  await teste('GET /stats com token errado → 401', async () =>
    assert.strictEqual((await chamar('/stats', { headers: { Authorization: 'Bearer errado' } })).status, 401)
  );
  await teste('GET /stats com token certo → números por post e por rede', async () => {
    const r = await chamar('/stats?days=7', { headers: { Authorization: 'Bearer ' + TOKEN } });
    assert.strictEqual(r.status, 200);
    const d = await r.json();
    assert.strictEqual(d.total, 2);
    assert.deepStrictEqual(d.por_rede, { whatsapp: 2 });
    assert.strictEqual(d.por_post[0].post_id, id);
  });
  await teste('sem ADMIN_TOKEN configurado, /stats fica fechado', async () => {
    const r = await worker.fetch(new Request('https://w.test/stats', { headers: { Authorization: 'Bearer ' } }), { ...env, ADMIN_TOKEN: '' }, {});
    assert.strictEqual(r.status, 401);
  });
  await teste('OPTIONS (CORS) → 204', async () => assert.strictEqual((await chamar('/hit', { method: 'OPTIONS' })).status, 204));
  await teste('o Worker não lê IP nem cookies', async () => {
    const codigo = fs.readFileSync(path.join(RAIZ, 'worker/src/index.js'), 'utf8');
    assert.ok(!/CF-Connecting-IP|X-Forwarded-For|cookie/i.test(codigo.replace(/\/\/.*$/gm, '')));
  });
}

// ---------------------------------------------------------------------------
console.log('\nSite + contador no Chrome (390px)');
const env = { DB: bancoFalso(), ADMIN_TOKEN: TOKEN, ALLOWED_ORIGIN: '*' };
const servidorWorker = http
  .createServer(async (req, res) => {
    const pedacos = [];
    for await (const c of req) pedacos.push(c);
    const metodoSemCorpo = req.method === 'GET' || req.method === 'HEAD';
    const r = await worker.fetch(
      new Request(`http://localhost:${PORTA_WORKER}${req.url}`, { method: req.method, headers: req.headers, body: metodoSemCorpo ? undefined : Buffer.concat(pedacos) }),
      env,
      { waitUntil() {} }
    );
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  })
  .listen(PORTA_WORKER);

const build = spawnSync(process.execPath, [path.join(RAIZ, 'build.js'), '--exemplo'], { env: { ...process.env, COUNTER_ENDPOINT: `http://localhost:${PORTA_WORKER}` }, encoding: 'utf8' });
assert.strictEqual(build.status, 0, build.stderr);
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

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
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
  const abrirEClicar = async (seletorCard, rede) => {
    await page.click(`${seletorCard} [data-acao="compartilhar"]`);
    await page.waitForSelector('#painel[open]');
    await page.click(`#painel a[data-rede="${rede}"]`);
    await page.click('#painel [data-painel-acao="fechar"]');
  };

  await teste('cada toque em uma rede conta 1 vez por post/rede/aparelho', async () => {
    await abrirEClicar('.card:nth-child(1)', 'whatsapp');
    await abrirEClicar('.card:nth-child(1)', 'whatsapp'); // repetido: não conta
    await abrirEClicar('.card:nth-child(1)', 'telegram');
    await abrirEClicar('.card:nth-child(2)', 'x');
    await new Promise((r) => setTimeout(r, 600));
    const contagem = Object.fromEntries(env.DB.linhas);
    const ids = await page.$$eval('.card', (cs) => cs.map((c) => c.dataset.id));
    assert.deepStrictEqual(contagem, {
      [`${DIA}|${ids[0]}|whatsapp`]: 1,
      [`${DIA}|${ids[0]}|telegram`]: 1,
      [`${DIA}|${ids[1]}|x`]: 1,
    });
  });

  await teste('mostra "3 pessoas já compartilharam hoje"', async () => {
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('#contador:not([hidden])');
    assert.strictEqual(await page.$eval('#contador', (e) => e.textContent), '3 pessoas já compartilharam hoje');
  });
  await page.screenshot({ path: path.join(FOTOS, '08-contador-390.png') });

  await teste('/admin-stats/ com token mostra as tabelas por rede e por post', async () => {
    await page.goto(`http://localhost:${PORTA_SITE}/admin-stats/#token=${TOKEN}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#stats table');
    const texto = await page.$eval('#stats', (e) => e.textContent);
    assert.ok(texto.includes('3 compartilhamentos'), texto);
    assert.ok(texto.includes('WhatsApp') && texto.includes('Telegram') && texto.includes('Por post'));
  });
  await page.screenshot({ path: path.join(FOTOS, '09-admin-stats-390.png'), fullPage: true });

  await teste('/admin-stats/ com token errado mostra "Token inválido."', async () => {
    await page.goto(`http://localhost:${PORTA_SITE}/admin-stats/#token=errado`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.getElementById('stats').textContent.includes('Token inválido'));
  });

  await teste('/admin-stats/ é noindex', async () => {
    assert.ok(await page.$('meta[name="robots"][content*="noindex"]'));
  });

  await teste('sem erros no console', async () => assert.deepStrictEqual(erros, []));
} finally {
  await browser.close();
  site.kill();
  servidorWorker.close();
}

console.log(falhas ? `\n✖ ${falhas} teste(s) falharam.\n` : '\n✔ Todos os testes do contador passaram.\n');
process.exit(falhas ? 1 : 0);
