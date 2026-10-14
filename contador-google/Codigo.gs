/**
 * Espalha Hoje — contador anônimo de compartilhamentos (Google Apps Script).
 *
 * Como instalar: veja o README, seção "Contador (Google Planilhas)". Resumo:
 *   1. Acesse https://script.google.com → "Novo projeto".
 *   2. Apague o que estiver lá e cole TODO este arquivo. Salve.
 *   3. Escolha a função "configurar" e clique em "Executar" (autorize quando o Google pedir).
 *      Ela cria a planilha "Espalha Hoje – contador" no seu Google Drive.
 *   4. "Implantar" → "Nova implantação" → tipo "App da Web":
 *        Executar como: Eu | Quem pode acessar: Qualquer pessoa  → "Implantar".
 *   5. Copie o endereço que termina em /exec e coloque em data/config.json → "counter_endpoint".
 *
 * Rotas (o site chama sozinho):
 *   POST .../exec?acao=hit            corpo {"postId":"...","network":"..."}  → soma 1
 *   GET  .../exec?acao=hoje            → {"dia":"AAAA-MM-DD","total":N}
 *   GET  .../exec?acao=numeros&dias=7  → números por rede, por post e por dia
 *
 * Privacidade: o Google não repassa IP nem identificação de quem acessa ao script.
 * A planilha guarda só: dia, post, rede e a contagem.
 */

// Endereço do site (usado para conferir se o post existe). Troque se o endereço mudar.
var SITE = 'https://isamoreira.github.io/mb-comlula';

var REDES = ['whatsapp', 'telegram', 'x', 'threads', 'facebook', 'reddit', 'instagram', 'tiktok', 'kwai', 'nativo'];
var RE_POST = /^\d{4}-\d{2}-\d{2}-[\w-]{1,40}$/;
var FUSO = 'America/Sao_Paulo';
var ABA = 'contagem';

// ---------------------------------------------------------------------------
// Rode uma vez pelo editor (botão "Executar") para criar a planilha e autorizar.
// ---------------------------------------------------------------------------
function configurar() {
  var planilha = abrirPlanilha();
  Logger.log('Planilha pronta: ' + planilha.getUrl());
  return planilha.getUrl();
}

// ---------------------------------------------------------------------------
// Entradas do "App da Web"
// ---------------------------------------------------------------------------
function doPost(e) {
  var dados;
  try {
    dados = JSON.parse((e && e.postData && e.postData.contents) || '');
  } catch (erro) {
    return json({ erro: 'JSON inválido' });
  }
  var post = String((dados && dados.postId) || '');
  var rede = String((dados && dados.network) || '');
  if (!RE_POST.test(post) || REDES.indexOf(rede) === -1 || !postExiste(post)) {
    return json({ erro: 'postId ou network inválido' });
  }
  // Trava: dois cliques ao mesmo tempo não se perdem.
  var trava = LockService.getScriptLock();
  trava.waitLock(15000);
  try {
    incrementar(hoje(), post, rede);
  } finally {
    trava.releaseLock();
  }
  return json({ ok: true });
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.acao === 'hoje') {
    var dia = hoje();
    var total = 0;
    linhas().forEach(function (l) {
      if (l.dia === dia) total += l.n;
    });
    return json({ dia: dia, total: total });
  }
  if (p.acao === 'numeros') {
    return json(numeros(Math.max(1, Math.min(366, parseInt(p.dias, 10) || 7))));
  }
  return json({ erro: 'não encontrado' });
}

// ---------------------------------------------------------------------------
// Planilha
// ---------------------------------------------------------------------------
function abrirPlanilha() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('PLANILHA_ID');
  if (id) return SpreadsheetApp.openById(id);
  var planilha = SpreadsheetApp.create('Espalha Hoje – contador');
  var aba = planilha.getSheets()[0];
  aba.setName(ABA);
  aba.appendRow(['dia', 'post', 'rede', 'compartilhamentos']);
  aba.setFrozenRows(1);
  props.setProperty('PLANILHA_ID', planilha.getId());
  return planilha;
}

function aba() {
  return abrirPlanilha().getSheetByName(ABA);
}

// Todas as linhas como objetos { dia, post, rede, n }.
function linhas() {
  var valores = aba().getDataRange().getValues();
  var lista = [];
  for (var i = 1; i < valores.length; i++) {
    var v = valores[i];
    lista.push({ dia: textoData(v[0]), post: String(v[1]), rede: String(v[2]), n: Number(v[3]) || 0 });
  }
  return lista;
}

// A planilha pode transformar "2026-10-14" em data: volta para texto AAAA-MM-DD.
function textoData(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, FUSO, 'yyyy-MM-dd');
  return String(v);
}

function incrementar(dia, post, rede) {
  var a = aba();
  var valores = a.getDataRange().getValues();
  // Procura de baixo para cima: as linhas de hoje estão no fim.
  for (var i = valores.length - 1; i >= 1; i--) {
    if (textoData(valores[i][0]) === dia && String(valores[i][1]) === post && String(valores[i][2]) === rede) {
      a.getRange(i + 1, 4).setValue((Number(valores[i][3]) || 0) + 1);
      return;
    }
  }
  // "'" na frente força a planilha a guardar o dia como texto.
  a.appendRow(["'" + dia, post, rede, 1]);
}

function numeros(dias) {
  var ate = hoje();
  var desde = Utilities.formatDate(new Date(Date.now() - (dias - 1) * 86400000), FUSO, 'yyyy-MM-dd');
  var porRede = {};
  var porDia = {};
  var porPost = {};
  var total = 0;
  linhas().forEach(function (l) {
    if (l.dia < desde || l.dia > ate) return;
    total += l.n;
    porRede[l.rede] = (porRede[l.rede] || 0) + l.n;
    porDia[l.dia] = (porDia[l.dia] || 0) + l.n;
    var p = porPost[l.post] || (porPost[l.post] = { post_id: l.post, total: 0, redes: {} });
    p.total += l.n;
    p.redes[l.rede] = (p.redes[l.rede] || 0) + l.n;
  });
  var lista = Object.keys(porPost)
    .map(function (k) {
      return porPost[k];
    })
    .sort(function (a, b) {
      return b.total - a.total;
    });
  return { desde: desde, ate: ate, total: total, hoje: porDia[ate] || 0, por_rede: porRede, por_dia: porDia, por_post: lista };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function hoje() {
  return Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd');
}

// Só conta posts que existem no site (evita lixo na planilha). Guarda a lista por 10 minutos.
function postExiste(id) {
  var cache = CacheService.getScriptCache();
  var ids = cache.get('ids');
  if (!ids) {
    try {
      var r = UrlFetchApp.fetch(SITE + '/data/posts.json', { muteHttpExceptions: true });
      if (r.getResponseCode() !== 200) return true; // site fora do ar: não perde a contagem
      ids = JSON.parse(r.getContentText())
        .map(function (p) {
          return p.id;
        })
        .join(',');
      cache.put('ids', ids, 600);
    } catch (erro) {
      return true;
    }
  }
  return (',' + ids + ',').indexOf(',' + id + ',') !== -1;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
