// Contador anônimo de compartilhamentos (api/contador.php, na própria Hostinger).
// Só é carregado quando "counter_endpoint" está preenchido em data/config.json.
// Envia apenas { postId, network }. Sem cookie, sem IP guardado, sem identificador.
// Para não contar duas vezes, guarda no próprio aparelho (localStorage) quais post/rede já foram contados.
(function () {
  'use strict';

  var config = {};
  try {
    config = JSON.parse(document.getElementById('eh-config').textContent);
  } catch (e) {}
  var base = String(config.counter_endpoint || '');
  if (!base) return;

  function rota(acao) {
    return base + (base.indexOf('?') === -1 ? '?' : '&') + 'acao=' + acao;
  }

  function jaContado(chave) {
    try {
      if (localStorage.getItem(chave)) return true;
      localStorage.setItem(chave, '1');
    } catch (e) {
      // Sem localStorage (modo privado etc.): conta mesmo assim.
    }
    return false;
  }

  // app.js dispara "eh:share" sempre que alguém toca em uma rede.
  document.addEventListener('eh:share', function (ev) {
    var d = ev.detail || {};
    if (!d.postId || !d.rede) return;
    if (jaContado('eh:contado:' + d.postId + ':' + d.rede)) return;

    var corpo = JSON.stringify({ postId: d.postId, network: d.rede });
    // sendBeacon continua enviando mesmo se a pessoa sair da página (ex.: abrir o WhatsApp).
    var enviado = false;
    if (navigator.sendBeacon) {
      try {
        enviado = navigator.sendBeacon(rota('hit'), new Blob([corpo], { type: 'text/plain' }));
      } catch (e) {}
    }
    if (!enviado) {
      fetch(rota('hit'), { method: 'POST', body: corpo, keepalive: true, credentials: 'omit' }).catch(function () {});
    }
  });

  // Mostra "X pessoas já compartilharam hoje" (só quando a página mostra os posts de hoje).
  document.addEventListener('eh:dia', function (ev) {
    var d = ev.detail || {};
    var el = document.getElementById('contador');
    if (!el || d.dia !== d.hoje) return;
    fetch(rota('hoje'), { credentials: 'omit', cache: 'no-store' })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (dados) {
        if (!dados || !(dados.total > 0)) return;
        var n = new Intl.NumberFormat('pt-BR').format(dados.total);
        el.textContent = (dados.total === 1 ? '1 pessoa já compartilhou hoje' : n + ' pessoas já compartilharam hoje') + ' · ';
        var a = document.createElement('a');
        a.href = '/numeros/';
        a.textContent = 'veja os números';
        el.appendChild(a);
        el.hidden = false;
      })
      .catch(function () {});
  });
})();
