// Teste no navegador (Chrome/Edge instalado no computador), em viewport de celular (390px).
// Uso: npm run test:e2e  (usa os posts de exemplo em dist-teste/)
// Se o Chrome não for encontrado, defina CHROME_PATH com o caminho do executável.
// Capturas de tela ficam em test/screenshots/.
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const Share = require('../src/js/share.js');

const PORTA = 8099;
const BASE = `http://localhost:${PORTA}`;
const FOTOS = path.join(__dirname, 'screenshots');

function acharChrome() {
  const candidatos = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidatos.find((c) => fs.existsSync(c));
}

// Faz o navegador "achar" que hoje é outra data (para testar o aviso "Conteúdos de ...").
function fingirData(iso) {
  return `(() => {
    const fixo = new Date('${iso}').getTime();
    const D = Date;
    class DataFalsa extends D {
      constructor(...a) { super(...(a.length ? a : [fixo])); }
      static now() { return fixo; }
    }
    window.Date = DataFalsa;
  })();`;
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

(async () => {
  const chrome = acharChrome();
  if (!chrome) {
    console.error('Chrome/Edge não encontrado. Defina CHROME_PATH.');
    process.exit(1);
  }
  fs.mkdirSync(FOTOS, { recursive: true });

  const servidor = spawn(process.execPath, [path.join(__dirname, '..', 'dev.js')], { env: { ...process.env, PORT: String(PORTA), DIST_DIR: 'dist-teste' }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));

  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
  const ctx = browser.defaultBrowserContext();
  await ctx.overridePermissions(BASE, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);

  async function novaPagina({ data } = {}) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    page.erros = [];
    page.on('pageerror', (e) => page.erros.push(e.message));
    page.on('console', (m) => m.type() === 'error' && page.erros.push(m.text()));
    if (data) await page.evaluateOnNewDocument(fingirData(data));
    return page;
  }

  const posts = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dist-teste/data/posts.json'), 'utf8'));
  const ultimoDia = posts.map((p) => p.date).sort().pop();
  const doDia = posts.filter((p) => p.date === ultimoDia);

  console.log(`\nPágina inicial em 390px (fingindo que hoje é ${ultimoDia})`);
  const page = await novaPagina({ data: ultimoDia + 'T15:00:00Z' });
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });

  await teste(`mostra os ${doDia.length} posts do dia`, async () => {
    await page.waitForSelector('.card');
    assert.strictEqual(await page.$$eval('.card', (c) => c.length), doDia.length);
  });

  await teste('não mostra o aviso de dia anterior', async () => {
    assert.strictEqual(await page.$eval('#aviso-dia', (e) => e.hidden), true);
  });

  await teste('sem rolagem horizontal', async () => {
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(w <= 390, 'scrollWidth = ' + w);
  });

  await teste('botões dos cards têm pelo menos 48px de altura', async () => {
    const pequenos = await page.$$eval('.card .btn', (bs) => bs.filter((b) => b.getBoundingClientRect().height < 48).map((b) => b.textContent.trim()));
    assert.deepStrictEqual(pequenos, []);
  });

  await teste('imagens têm texto alternativo', async () => {
    const semAlt = await page.$$eval('.card img', (is) => is.filter((i) => !i.alt).length);
    assert.strictEqual(semAlt, 0);
  });

  await page.screenshot({ path: path.join(FOTOS, '01-home-390.png'), fullPage: false });
  await page.screenshot({ path: path.join(FOTOS, '02-home-390-completa.png'), fullPage: true });

  await teste('"Trocar legenda" mostra uma legenda diferente', async () => {
    const antes = await page.$eval('.card .card__legenda', (e) => e.textContent);
    await page.click('.card [data-acao="trocar"]');
    const depois = await page.$eval('.card .card__legenda', (e) => e.textContent);
    assert.notStrictEqual(depois, antes);
  });

  await teste('"Copiar legenda" copia legenda + hashtags e mostra "Legenda copiada!"', async () => {
    await page.click('.card [data-acao="copiar"]');
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('Legenda copiada'));
    const copiado = await page.evaluate(() => navigator.clipboard.readText());
    const legenda = await page.$eval('.card .card__legenda', (e) => e.textContent);
    assert.ok(copiado.startsWith(legenda), 'texto copiado: ' + copiado);
    assert.ok(copiado.includes(doDia[0].hashtags[0]));
  });

  await teste('"Compartilhar" abre o painel e cada rede tem a URL correta', async () => {
    await page.click('.card [data-acao="compartilhar"]');
    await page.waitForSelector('#painel[open]');
    const card = await page.$eval('.card', (c) => ({ id: c.dataset.id, legenda: c.querySelector('.card__legenda').textContent }));
    const post = posts.find((p) => p.id === card.id);
    const dados = { pageUrl: `${BASE}/p/${post.id}/`, legenda: card.legenda, hashtags: post.hashtags, titulo: post.title, data: post.date };
    const hrefs = await page.$$eval('#painel a[data-rede]', (as) => as.map((a) => [a.dataset.rede, a.href]));
    // 6 redes + o link extra "só texto com o link no WhatsApp".
    assert.deepStrictEqual([...new Set(hrefs.map((h) => h[0]))].sort(), ['facebook', 'reddit', 'telegram', 'threads', 'whatsapp', 'x']);
    for (const [rede, href] of hrefs) {
      assert.strictEqual(href, Share.urlCompartilhar(rede, dados), 'URL errada para ' + rede);
      assert.ok(decodeURIComponent(href).includes(`utm_source=${rede}&utm_medium=social&utm_campaign=${post.date}`), 'UTM ausente em ' + rede);
    }
  });

  await teste('itens do painel têm pelo menos 48px', async () => {
    const pequenos = await page.$$eval('#painel .rede, #painel .btn', (bs) =>
      bs.filter((b) => b.offsetParent !== null && b.getBoundingClientRect().height < 48).map((b) => b.textContent.trim())
    );
    assert.deepStrictEqual(pequenos, []);
  });

  await new Promise((r) => setTimeout(r, 300)); // espera a animação do painel
  await page.screenshot({ path: path.join(FOTOS, '03-painel-390.png') });

  await teste('Facebook copia a legenda e avisa', async () => {
    // Evita abrir a aba do Facebook durante o teste.
    await page.evaluate(() => document.querySelector('#painel a[data-rede="facebook"]').addEventListener('click', (e) => e.preventDefault()));
    await page.click('#painel a[data-rede="facebook"]');
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('Facebook'));
  });

  await teste('Instagram sem suporte a arquivos mostra "1. Baixe 2. Cole"', async () => {
    // Desativa a Web Share API para simular o fallback (computador).
    await page.click('#painel [data-painel-acao="fechar"]');
    await page.evaluate(() => {
      navigator.canShare = undefined;
    });
    await page.click('.card [data-acao="compartilhar"]');
    await page.waitForSelector('#painel[open]');
    await page.click('#painel [data-app="instagram"]');
    await page.waitForSelector('#painel [data-passos]:not([hidden])');
    const txt = await page.$eval('#painel [data-passos]', (e) => e.textContent);
    assert.ok(/Baixe a mídia/.test(txt) && /cole a legenda/.test(txt));
    const baixar = await page.$eval('#painel [data-passos] [data-painel-baixar]', (a) => a.getAttribute('href'));
    assert.ok(baixar.startsWith('/media/'));
  });

  await page.screenshot({ path: path.join(FOTOS, '04-painel-instagram-390.png') });

  // Celular simulado: Web Share API com arquivos (navigator.share é registrado em window.__compartilhado).
  async function paginaCelular(extra, { isolada = false } = {}) {
    let p2;
    if (isolada) {
      // Janela anônima: sem o cache do service worker das páginas anteriores.
      const ctx = await browser.createBrowserContext();
      p2 = await ctx.newPage();
      await p2.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await p2.evaluateOnNewDocument(fingirData(ultimoDia + 'T15:00:00Z'));
    } else {
      p2 = await novaPagina({ data: ultimoDia + 'T15:00:00Z' });
    }
    await p2.evaluateOnNewDocument(() => {
      navigator.canShare = () => true;
      navigator.share = (d) => {
        window.__compartilhado = { arquivos: (d.files || []).map((f) => f.name + '|' + f.type), texto: d.text };
        return Promise.resolve();
      };
    });
    if (extra) await extra(p2);
    await p2.goto(BASE + '/', { waitUntil: 'networkidle0' });
    return p2;
  }
  const esperarPronto = (p) => p.waitForFunction(() => /pront[oa]!/.test(document.querySelector('#painel [data-progresso]').textContent));

  await teste('celular: painel mostra "Preparando…" e libera os botões quando o arquivo está pronto', async () => {
    const p2 = await paginaCelular();
    await p2.click('.card [data-acao="compartilhar"]');
    await esperarPronto(p2);
    const desativados = await p2.$$eval('#painel [data-app][aria-disabled="true"]', (b) => b.length);
    assert.strictEqual(desativados, 0);
    assert.strictEqual(await p2.$eval('#painel [data-app="nativo"]', (b) => b.hidden), false, '"Outro app" deveria aparecer');
    await new Promise((r) => setTimeout(r, 300));
    await p2.screenshot({ path: path.join(FOTOS, '04b-painel-celular-390.png') });
    await p2.close();
  });

  await teste('Instagram no celular envia o arquivo + legenda (sem link)', async () => {
    const p2 = await paginaCelular();
    await p2.click('.card [data-acao="compartilhar"]');
    await esperarPronto(p2);
    await p2.click('#painel [data-app="instagram"]');
    await p2.waitForFunction(() => window.__compartilhado);
    const c = await p2.evaluate(() => window.__compartilhado);
    assert.strictEqual(c.arquivos.length, 1);
    assert.ok(c.arquivos[0].startsWith(doDia[0].id), c.arquivos[0]);
    assert.ok(c.texto.length > 0 && !c.texto.includes('utm_source'), c.texto);
    await p2.close();
  });

  await teste('WhatsApp no celular envia o ARQUIVO com legenda, sem link (Status)', async () => {
    const p2 = await paginaCelular();
    await p2.click('.card [data-acao="compartilhar"]');
    await esperarPronto(p2);
    await p2.click('#painel [data-app="whatsapp"]');
    await p2.waitForFunction(() => window.__compartilhado);
    const c = await p2.evaluate(() => window.__compartilhado);
    assert.strictEqual(c.arquivos.length, 1);
    assert.ok(c.texto.length > 0 && !c.texto.includes('http'), 'não deveria ter link: ' + c.texto);
    // "Ou mande só o link" continua sendo o wa.me.
    const soLink = await p2.$eval('#painel a[data-rede="whatsapp"]', (a) => a.href);
    assert.ok(soLink.startsWith('https://wa.me/?text='));
    await p2.close();
  });

  await teste('celular recusa o arquivo: 1º toque pede "toque de novo", 2º mostra salvar + colar', async () => {
    const p2 = await paginaCelular(async (p) => {
      await p.evaluateOnNewDocument(() => {
        navigator.share = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
      });
    });
    await p2.click('.card [data-acao="compartilhar"]');
    await esperarPronto(p2);
    await p2.click('#painel [data-app="instagram"]');
    await p2.waitForFunction(() => /Toque de novo/.test(document.getElementById('toast').textContent));
    await p2.click('#painel [data-app="instagram"]');
    await p2.waitForSelector('#painel [data-passos]:not([hidden])');
    const t = await p2.$eval('#toast', (e) => e.textContent);
    assert.ok(/Salve no celular/.test(t), t);
    await p2.close();
  });

  await teste('"Salvar no celular" abre a lista com SÓ o arquivo (para "Salvar vídeo/imagem")', async () => {
    const p2 = await paginaCelular();
    await p2.click('.card [data-acao="baixar"]'); // 1º toque: começa a preparar
    await p2.waitForFunction(() => /Toque em "Salvar no celular" de novo|Escolha "Salvar/.test(document.getElementById('toast').textContent) || window.__compartilhado);
    const jaFoi = await p2.evaluate(() => !!window.__compartilhado);
    if (!jaFoi) await p2.click('.card [data-acao="baixar"]'); // 2º toque: arquivo pronto
    await p2.waitForFunction(() => window.__compartilhado);
    const c = await p2.evaluate(() => window.__compartilhado);
    assert.strictEqual(c.arquivos.length, 1);
    assert.strictEqual(c.texto, undefined);
    await p2.close();
  });

  await teste('mídia faltando no servidor: avisa e sugere mandar o link', async () => {
    const p2 = await paginaCelular(async (p) => {
      await p.setBypassServiceWorker(true); // o service worker buscaria a mídia sem passar pela simulação
      await p.setRequestInterception(true);
      // Simula vídeos/fotos apagados do servidor (as thumbs continuam lá).
      p.on('request', (r) => {
        const caminho = new URL(r.url()).pathname;
        const midia = caminho.startsWith('/media/') && !caminho.includes('-thumb');
        return midia ? r.respond({ status: 404, body: 'x' }) : r.continue();
      });
    }, { isolada: true });
    await p2.click('.card [data-acao="compartilhar"]');
    await p2.waitForFunction(() => /Não foi possível/.test(document.querySelector('#painel [data-progresso]').textContent));
    await p2.close();
  });

  await teste('aberto dentro do Instagram: aviso "Abrir no navegador"', async () => {
    const p2 = await novaPagina({ data: ultimoDia + 'T15:00:00Z' });
    await p2.setUserAgent('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 Instagram 300.0');
    await p2.goto(BASE + '/', { waitUntil: 'networkidle0' });
    const t = await p2.$eval('.aviso--app', (e) => e.textContent);
    assert.ok(/Abrir no navegador/.test(t) && /Instagram/.test(t), t);
    const href = await p2.$eval('.aviso--app a', (a) => a.getAttribute('href'));
    assert.ok(href.startsWith('intent://') && href.includes('package=com.android.chrome'), href);
    await p2.screenshot({ path: path.join(FOTOS, '04c-aviso-instagram-390.png') });
    await p2.close();
  });

  await teste('navegador normal: sem aviso de app', async () => assert.strictEqual(await page.$('.aviso--app'), null));

  await teste('sem erros no console', async () => assert.deepStrictEqual(page.erros, []));

  console.log('\nModo escuro');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(FOTOS, '05-home-escuro-390.png') });
  await teste('fundo escuro aplicado', async () => {
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.strictEqual(bg, 'rgb(15, 15, 16)');
  });

  console.log('\nSem posts hoje → mostra o último dia com aviso');
  const p3 = await novaPagina({ data: '2099-01-01T15:00:00Z' });
  await p3.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await teste(`mostra "Conteúdos de ..." com os posts de ${ultimoDia}`, async () => {
    await p3.waitForSelector('.card');
    const aviso = await p3.$eval('#aviso-dia', (e) => (e.hidden ? '' : e.textContent));
    const [a, m, d] = ultimoDia.split('-');
    assert.ok(aviso.includes(`Conteúdos de ${d}/${m}/${a}`), 'aviso: ' + aviso);
    assert.strictEqual(await p3.$$eval('.card', (c) => c.length), doDia.length);
  });
  await p3.screenshot({ path: path.join(FOTOS, '06-aviso-dia-anterior-390.png') });
  await p3.close();

  console.log('\nPosts agendados para o futuro ficam escondidos');
  const p4 = await novaPagina({ data: '2000-01-01T15:00:00Z' });
  await p4.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await teste('nenhum card quando todos os posts são do futuro', async () => {
    await p4.waitForSelector('.vazio');
    assert.strictEqual(await p4.$$eval('.card', (c) => c.length), 0);
  });
  await p4.close();

  console.log('\nPágina do post');
  const p5 = await novaPagina();
  await p5.goto(`${BASE}/p/${doDia[0].id}/`, { waitUntil: 'networkidle0' });
  await teste('tem og:title, og:description, og:image, og:url e twitter:card', async () => {
    const metas = await p5.evaluate(() => {
      const g = (n) => (document.querySelector(`meta[property="${n}"],meta[name="${n}"]`) || {}).content;
      return { t: g('og:title'), d: g('og:description'), i: g('og:image'), u: g('og:url'), c: g('twitter:card') };
    });
    assert.strictEqual(metas.t, doDia[0].title);
    assert.ok(metas.d && metas.i && metas.u.endsWith(`/p/${doDia[0].id}/`));
    assert.strictEqual(metas.c, 'summary_large_image');
  });
  await teste('mostra o card do post com o botão Compartilhar', async () => {
    await p5.waitForSelector('.card [data-acao="compartilhar"]');
  });
  await p5.screenshot({ path: path.join(FOTOS, '07-pagina-post-390.png') });
  await p5.close();

  console.log('\nArquivo e privacidade');
  const p6 = await novaPagina({ data: '2099-01-01T15:00:00Z' });
  await p6.goto(`${BASE}/arquivo/`, { waitUntil: 'networkidle0' });
  await teste('arquivo lista os dias', async () => {
    await p6.waitForSelector('.arquivo__dia');
  });
  await p6.goto(`${BASE}/privacidade/`, { waitUntil: 'networkidle0' });
  await teste('privacidade informa que não coleta dados pessoais', async () => {
    const t = await p6.$eval('main', (m) => m.textContent);
    assert.ok(t.includes('não coleta dados pessoais'));
  });
  await teste('/hoje/ funciona', async () => {
    await p6.goto(`${BASE}/hoje`, { waitUntil: 'networkidle0' });
    await p6.waitForSelector('.card');
  });
  await p6.close();

  await browser.close();
  servidor.kill();
  console.log(falhas ? `\n✖ ${falhas} teste(s) falharam.\n` : `\n✔ Todos os testes passaram. Capturas em ${path.relative(process.cwd(), FOTOS)}/\n`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
