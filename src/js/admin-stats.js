// Painel /admin-stats/: compartilhamentos por post e por rede.
// Acesso: /admin-stats/#token=SEU_TOKEN  (o token é conferido pelo Worker, que o lê de variável de ambiente).
// Usar "#" em vez de "?" evita que o token vá para logs de servidor.
(function () {
  'use strict';

  var config = {};
  try {
    config = JSON.parse(document.getElementById('eh-config').textContent);
  } catch (e) {}
  var base = String(config.counter_endpoint || '').replace(/\/+$/, '');
  var saida = document.getElementById('stats');
  var seletor = document.getElementById('stats-dias');

  var NOMES = {
    whatsapp: 'WhatsApp', telegram: 'Telegram', x: 'X', threads: 'Threads', facebook: 'Facebook',
    reddit: 'Reddit', instagram: 'Instagram', tiktok: 'TikTok', kwai: 'Kwai', nativo: 'Outros apps',
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var num = new Intl.NumberFormat('pt-BR');

  // Token: aceita #token=... (recomendado) ou ?token=... (movido para o # e apagado da barra).
  function lerToken() {
    var hash = new URLSearchParams(location.hash.slice(1)).get('token');
    if (hash) return hash;
    var q = new URLSearchParams(location.search).get('token');
    if (q) history.replaceState(null, '', location.pathname + '#token=' + encodeURIComponent(q));
    return q;
  }

  function mensagem(html) {
    saida.innerHTML = '<p class="aviso">' + html + '</p>';
    saida.setAttribute('aria-busy', 'false');
  }

  function tabela(titulo, cabecalho, linhas) {
    return (
      '<h2>' + esc(titulo) + '</h2><div class="tabela-rolagem"><table><thead><tr>' +
      cabecalho.map(function (c, i) {
        return '<th scope="col"' + (i ? ' class="num"' : '') + '>' + esc(c) + '</th>';
      }).join('') +
      '</tr></thead><tbody>' +
      (linhas.length
        ? linhas.map(function (l) {
            return '<tr>' + l.map(function (c, i) {
              return i ? '<td class="num">' + esc(c) + '</td>' : '<th scope="row">' + c + '</th>';
            }).join('') + '</tr>';
          }).join('')
        : '<tr><td colspan="' + cabecalho.length + '">Nenhum compartilhamento no período.</td></tr>') +
      '</tbody></table></div>'
    );
  }

  function carregar() {
    var token = lerToken();
    if (!base) return mensagem('O contador não está ativado. Preencha <code>counter_endpoint</code> em <code>data/config.json</code> (veja o README, "Fase 2").');
    if (!token) return mensagem('Acesse com o token no endereço: <code>/admin-stats/#token=SEU_TOKEN</code>');

    saida.setAttribute('aria-busy', 'true');
    var dias = seletor.value;
    Promise.all([
      fetch(base + '/stats?days=' + encodeURIComponent(dias), { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store', credentials: 'omit' }),
      fetch('/data/posts.json', { cache: 'no-cache' }).then(function (r) {
        return r.ok ? r.json() : [];
      }),
    ])
      .then(function (rs) {
        var resp = rs[0];
        var posts = rs[1];
        if (resp.status === 401) throw new Error('Token inválido.');
        if (!resp.ok) throw new Error('Erro ' + resp.status + ' ao consultar o contador.');
        return resp.json().then(function (dados) {
          renderizar(dados, posts);
        });
      })
      .catch(function (e) {
        mensagem(esc(e.message || 'Não foi possível carregar.'));
      });
  }

  function renderizar(d, posts) {
    var titulos = {};
    posts.forEach(function (p) {
      titulos[p.id] = p.title;
    });
    var redes = Object.keys(d.por_rede).sort(function (a, b) {
      return d.por_rede[b] - d.por_rede[a];
    });

    var html =
      '<p class="stats-total"><strong>' + num.format(d.total) + '</strong> compartilhamentos de ' + esc(d.desde.split('-').reverse().join('/')) +
      ' a ' + esc(d.ate.split('-').reverse().join('/')) + '</p>';

    html += tabela(
      'Por rede',
      ['Rede', 'Total'],
      redes.map(function (r) {
        return [esc(NOMES[r] || r), num.format(d.por_rede[r])];
      })
    );

    html += tabela(
      'Por post',
      ['Post', 'Total'].concat(redes.map(function (r) {
        return NOMES[r] || r;
      })),
      d.por_post.map(function (p) {
        var nome = '<a href="/p/' + esc(p.post_id) + '/">' + esc(titulos[p.post_id] || p.post_id) + '</a><br><small>' + esc(p.post_id) + '</small>';
        return [nome, num.format(p.total)].concat(redes.map(function (r) {
          return num.format(p.redes[r] || 0);
        }));
      })
    );

    html += tabela(
      'Por dia',
      ['Dia', 'Total'],
      Object.keys(d.por_dia).sort().reverse().map(function (dia) {
        return [esc(dia.split('-').reverse().join('/')), num.format(d.por_dia[dia])];
      })
    );

    saida.innerHTML = html;
    saida.setAttribute('aria-busy', 'false');
  }

  seletor.addEventListener('change', carregar);
  window.addEventListener('hashchange', carregar);
  carregar();
})();
