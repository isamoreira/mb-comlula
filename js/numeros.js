// Página pública /numeros/: compartilhamentos por rede, por post e por dia.
(function () {
  'use strict';

  var config = {};
  try {
    config = JSON.parse(document.getElementById('eh-config').textContent);
  } catch (e) {}
  var base = String(config.counter_endpoint || '');
  var BASE = config.base || '/'; // pasta do site
  var saida = document.getElementById('numeros');
  var seletor = document.getElementById('numeros-dias');

  var NOMES = {
    whatsapp: 'WhatsApp', telegram: 'Telegram', x: 'X (Twitter)', threads: 'Threads', facebook: 'Facebook',
    reddit: 'Reddit', instagram: 'Instagram', tiktok: 'TikTok', kwai: 'Kwai', nativo: 'Outros apps',
  };
  var num = new Intl.NumberFormat('pt-BR');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function dataBr(iso) {
    return iso.split('-').reverse().join('/');
  }

  function mensagem(texto) {
    saida.innerHTML = '<p class="aviso">' + texto + '</p>';
    saida.setAttribute('aria-busy', 'false');
  }

  // Lista com barras (elemento <progress>, sem estilos inline).
  function barras(titulo, itens, maximo) {
    if (!itens.length) return '<h2>' + esc(titulo) + '</h2><p class="numeros__vazio">Nenhum compartilhamento no período.</p>';
    return (
      '<h2>' + esc(titulo) + '</h2><ul class="barras">' +
      itens
        .map(function (i) {
          return (
            '<li><div class="barras__linha"><span class="barras__nome">' + i.nome + '</span><strong>' + num.format(i.valor) + '</strong></div>' +
            '<progress max="' + maximo + '" value="' + i.valor + '" aria-hidden="true"></progress></li>'
          );
        })
        .join('') +
      '</ul>'
    );
  }

  function carregar() {
    if (!base) return mensagem('A contagem ainda não está ativada neste site.');
    saida.setAttribute('aria-busy', 'true');
    var sep = base.indexOf('?') === -1 ? '?' : '&';
    Promise.all([
      fetch(base + sep + 'acao=numeros&dias=' + encodeURIComponent(seletor.value), { cache: 'no-store', credentials: 'omit' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }),
      fetch(BASE + 'data/posts.json', { cache: 'no-cache' }).then(function (r) {
        return r.ok ? r.json() : [];
      }),
    ])
      .then(function (rs) {
        renderizar(rs[0], rs[1]);
      })
      .catch(function () {
        mensagem('Não foi possível carregar os números agora. Tente de novo em instantes.');
      });
  }

  function renderizar(d, posts) {
    var titulos = {};
    posts.forEach(function (p) {
      titulos[p.id] = p.title;
    });

    var redes = Object.keys(d.por_rede).map(function (r) {
      return { nome: esc(NOMES[r] || r), valor: d.por_rede[r] };
    });
    var maxRede = Math.max.apply(null, [1].concat(redes.map(function (r) { return r.valor; })));

    var porPost = d.por_post.map(function (p) {
      var nome = titulos[p.post_id] ? '<a href="' + BASE + 'p/' + esc(p.post_id) + '/">' + esc(titulos[p.post_id]) + '</a>' : esc(p.post_id);
      return { nome: nome, valor: p.total };
    });
    var maxPost = Math.max.apply(null, [1].concat(porPost.map(function (p) { return p.valor; })));

    var dias = Object.keys(d.por_dia).sort().reverse().map(function (dia) {
      return { nome: esc(dataBr(dia)), valor: d.por_dia[dia] };
    });
    var maxDia = Math.max.apply(null, [1].concat(dias.map(function (x) { return x.valor; })));

    var periodo = d.desde === d.ate ? 'hoje' : 'de ' + dataBr(d.desde) + ' a ' + dataBr(d.ate);
    saida.innerHTML =
      '<div class="numeros__destaques">' +
      '<div class="destaque"><strong>' + num.format(d.hoje) + '</strong><span>compartilhamentos hoje</span></div>' +
      '<div class="destaque"><strong>' + num.format(d.total) + '</strong><span>no período (' + esc(periodo) + ')</span></div>' +
      '</div>' +
      barras('Por rede', redes, maxRede) +
      barras('Por post', porPost, maxPost) +
      (dias.length > 1 ? barras('Por dia', dias, maxDia) : '');
    saida.setAttribute('aria-busy', 'false');
  }

  seletor.addEventListener('change', carregar);
  carregar();
})();
