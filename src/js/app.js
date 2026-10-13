// Espalha Hoje — lógica do site (sem frameworks).
// Páginas: home (/ e /hoje), post (/p/<id>/), arquivo (/arquivo/).
(function () {
  'use strict';

  var FUSO = 'America/Sao_Paulo';
  var Share = window.EHShare;
  var config = lerJson('eh-config') || {};
  var pagina = document.body.getAttribute('data-page');

  // Posts carregados na página, por id.
  var postsPorId = {};

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------

  // Lê um bloco <script type="application/json" id="..."> embutido na página.
  function lerJson(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      return null;
    }
  }

  // Escapa texto para inserir em HTML.
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Data de hoje (AAAA-MM-DD) no fuso de São Paulo, independente do fuso do celular.
  function hojeSP() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }

  // "terça-feira, 13 de outubro de 2026"
  function dataLonga(iso) {
    var d = new Date(iso + 'T12:00:00Z');
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  }

  // "13/10/2026"
  function dataCurta(iso) {
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function unicos(lista) {
    return lista.filter(function (v, i) {
      return lista.indexOf(v) === i;
    });
  }

  // Sorteia um índice diferente do atual (para "Trocar legenda").
  function sortearOutro(total, atual) {
    if (total <= 1) return 0;
    var r = Math.floor(Math.random() * (total - 1));
    return r >= atual ? r + 1 : r;
  }

  function urlDaPagina(post) {
    return location.origin + '/p/' + encodeURIComponent(post.id) + '/';
  }

  function nomeDoArquivo(post) {
    var arq = (post.media && post.media.file) || '';
    var ext = arq.slice(arq.lastIndexOf('.'));
    return post.id + ext;
  }

  // Avisa outros módulos (ex.: contador da fase 2) que alguém compartilhou.
  function avisarCompartilhamento(postId, rede) {
    document.dispatchEvent(new CustomEvent('eh:share', { detail: { postId: postId, rede: rede } }));
  }

  // ---------------------------------------------------------------------------
  // Aviso flutuante ("Legenda copiada!")
  // ---------------------------------------------------------------------------
  var toastEl = document.getElementById('toast');
  var toastTimer;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    // O painel (<dialog>) fica numa "camada superior" do navegador. Para o aviso
    // aparecer por cima dele, usamos a API de popover (reabrindo para ficar no topo).
    if (typeof toastEl.showPopover === 'function') {
      try {
        if (toastEl.matches(':popover-open')) toastEl.hidePopover();
        toastEl.showPopover();
      } catch (e) {}
    } else if (painel && painel.open && toastEl.parentNode !== painel) {
      painel.appendChild(toastEl);
    }
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('is-visible');
      if (typeof toastEl.hidePopover === 'function') {
        setTimeout(function () {
          try {
            if (!toastEl.classList.contains('is-visible')) toastEl.hidePopover();
          } catch (e) {}
        }, 250);
      } else if (toastEl.parentNode !== document.body) {
        document.body.appendChild(toastEl);
      }
    }, 2800);
  }

  // ---------------------------------------------------------------------------
  // Copiar texto (com alternativa para navegadores antigos)
  // ---------------------------------------------------------------------------
  function copiarTexto(texto) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(texto).then(
        function () {
          return true;
        },
        function () {
          return copiarAntigo(texto);
        }
      );
    }
    return Promise.resolve(copiarAntigo(texto));
  }

  function copiarAntigo(texto) {
    var ta = document.createElement('textarea');
    ta.value = texto;
    ta.setAttribute('readonly', '');
    ta.className = 'sr-only';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  // ---------------------------------------------------------------------------
  // Ícones (SVG simples, desenhados à mão — sem logos de marcas)
  // ---------------------------------------------------------------------------
  var ICONES = {
    share: '<svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M18 16.1c-.8 0-1.5.3-2 .8l-7.1-4.1c.1-.3.1-.5.1-.8s0-.5-.1-.8L16 7.1c.5.5 1.2.8 2 .8 1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3c0 .3 0 .5.1.8L8 9.8C7.5 9.3 6.8 9 6 9c-1.7 0-3 1.3-3 3s1.3 3 3 3c.8 0 1.5-.3 2-.8l7.1 4.2c-.1.2-.1.4-.1.6 0 1.6 1.3 2.9 2.9 2.9s2.9-1.3 2.9-2.9-1.2-2.9-2.8-2.9z"/></svg>',
    swap: '<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M7 7h11l-3-3 1.4-1.4L21.8 8l-5.4 5.4L15 12l3-3H7V7zm10 10H6l3 3-1.4 1.4L2.2 16l5.4-5.4L9 12l-3 3h11v2z"/></svg>',
    copy: '<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>',
    download: '<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg>',
  };

  // ---------------------------------------------------------------------------
  // Card do post
  // ---------------------------------------------------------------------------
  function htmlMidia(post, prioridade) {
    var m = post.media || {};
    var alt = m.alt || post.title;
    var dims = m.w && m.h ? ' width="' + m.w + '" height="' + m.h + '"' : '';
    if (m.type === 'video') {
      return (
        '<div class="card__media card__media--video">' +
        '<video controls playsinline preload="none" poster="/' + esc(m.thumb || '') + '" aria-label="Vídeo: ' + esc(alt) + '">' +
        '<source src="/' + esc(m.file) + '">' +
        'Seu navegador não reproduz este vídeo. Use o botão "Baixar mídia".' +
        '</video></div>'
      );
    }
    var carregamento = prioridade ? ' fetchpriority="high"' : ' loading="lazy"';
    return (
      '<div class="card__media">' +
      '<img src="/' + esc(m.thumb || m.file) + '" alt="' + esc(alt) + '"' + dims + carregamento + ' decoding="async">' +
      '</div>'
    );
  }

  function htmlCard(post, indice, tituloComLink) {
    var legendas = post.captions || [];
    var atual = Math.floor(Math.random() * legendas.length) || 0; // começa sorteada
    var tituloHtml = tituloComLink ? '<a href="/p/' + esc(post.id) + '/">' + esc(post.title) + '</a>' : esc(post.title);
    var fonte = post.source_url
      ? ' · <a href="' + esc(post.source_url) + '" rel="noopener noreferrer" target="_blank">Fonte</a>'
      : '';
    var botaoTrocar =
      legendas.length > 1
        ? '<button type="button" class="btn btn--ghost" data-acao="trocar">' + ICONES.swap + '<span>Trocar legenda</span></button>'
        : '';

    return (
      '<article class="card" id="post-' + esc(post.id) + '" data-id="' + esc(post.id) + '" data-legenda="' + atual + '" aria-labelledby="titulo-' + esc(post.id) + '">' +
      htmlMidia(post, indice === 0) +
      '<div class="card__body">' +
      (post.theme ? '<p class="card__tema">' + esc(post.theme) + '</p>' : '') +
      '<h2 class="card__titulo" id="titulo-' + esc(post.id) + '">' + tituloHtml + '</h2>' +
      '<p class="card__legenda" aria-live="polite">' + esc(legendas[atual] || '') + '</p>' +
      (post.hashtags && post.hashtags.length ? '<p class="card__tags">' + esc(post.hashtags.join(' ')) + '</p>' : '') +
      '<button type="button" class="btn btn--primary btn--grande" data-acao="compartilhar">' + ICONES.share + '<span>Compartilhar</span></button>' +
      '<div class="card__acoes">' +
      botaoTrocar +
      '<button type="button" class="btn btn--ghost" data-acao="copiar">' + ICONES.copy + '<span>Copiar legenda</span></button>' +
      '<a class="btn btn--ghost" data-acao="baixar" href="/' + esc(post.media.file) + '" download="' + esc(nomeDoArquivo(post)) + '">' + ICONES.download + '<span>Baixar mídia</span></a>' +
      '</div>' +
      '<p class="card__credito">Crédito: ' + esc(post.credit || config.default_credit || '') + fonte + '</p>' +
      '</div></article>'
    );
  }

  function renderizarCards(container, posts, tituloComLink) {
    posts.forEach(function (p) {
      postsPorId[p.id] = p;
    });
    container.innerHTML = posts
      .map(function (p, i) {
        return htmlCard(p, i, tituloComLink);
      })
      .join('');
    container.setAttribute('aria-busy', 'false');
  }

  // Legenda atualmente exibida no card.
  function legendaAtual(card) {
    var post = postsPorId[card.getAttribute('data-id')];
    var i = parseInt(card.getAttribute('data-legenda'), 10) || 0;
    return (post.captions || [])[i] || '';
  }

  // Cliques nos botões dos cards (delegação de eventos).
  document.addEventListener('click', function (ev) {
    var alvo = ev.target.closest('[data-acao]');
    if (!alvo) return;
    var card = alvo.closest('.card');
    if (!card) return;
    var post = postsPorId[card.getAttribute('data-id')];
    var acao = alvo.getAttribute('data-acao');

    if (acao === 'trocar') {
      var i = parseInt(card.getAttribute('data-legenda'), 10) || 0;
      var novo = sortearOutro(post.captions.length, i);
      card.setAttribute('data-legenda', String(novo));
      card.querySelector('.card__legenda').textContent = post.captions[novo];
      toast('Legenda trocada (' + (novo + 1) + ' de ' + post.captions.length + ')');
    } else if (acao === 'copiar') {
      copiarLegenda(post, legendaAtual(card));
    } else if (acao === 'baixar') {
      toast('Baixando mídia…');
    } else if (acao === 'compartilhar') {
      abrirPainel(post, legendaAtual(card), alvo);
    }
  });

  function copiarLegenda(post, legenda) {
    return copiarTexto(Share.textoCompleto(legenda, post.hashtags)).then(function (ok) {
      toast(ok ? 'Legenda copiada!' : 'Não deu para copiar. Selecione o texto e copie manualmente.');
      return ok;
    });
  }

  // ---------------------------------------------------------------------------
  // Painel de compartilhamento (bottom sheet)
  // ---------------------------------------------------------------------------
  var painel = document.getElementById('painel');
  var estado = { post: null, legenda: '', arquivo: null, origem: null };

  // O navegador consegue compartilhar arquivos pela lista nativa de apps?
  function suportaArquivos() {
    try {
      if (!navigator.canShare || !window.File) return false;
      return navigator.canShare({ files: [new File(['x'], 'teste.jpg', { type: 'image/jpeg' })] });
    } catch (e) {
      return false;
    }
  }

  // Baixa a mídia em segundo plano quando o painel abre, para que o
  // navigator.share() seja chamado logo no toque (exigência do Safari).
  function prepararArquivo(post) {
    var url = '/' + post.media.file;
    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.blob();
      })
      .then(function (blob) {
        var tipo = blob.type || (post.media.type === 'video' ? 'video/mp4' : 'image/jpeg');
        return new File([blob], nomeDoArquivo(post), { type: tipo });
      });
  }

  function abrirPainel(post, legenda, origem) {
    if (!painel) return;
    estado.post = post;
    estado.legenda = legenda;
    estado.origem = origem;
    estado.arquivo = null;
    estado.promessaArquivo = null;

    painel.querySelector('[data-painel-titulo]').textContent = post.title;

    // Links das redes com legenda + UTM.
    var dados = { pageUrl: urlDaPagina(post), legenda: legenda, hashtags: post.hashtags, titulo: post.title, data: post.date };
    painel.querySelectorAll('a[data-rede]').forEach(function (a) {
      a.href = Share.urlCompartilhar(a.getAttribute('data-rede'), dados);
    });

    // Download avulso dentro do painel.
    var baixar = painel.querySelector('[data-painel-baixar]');
    baixar.href = '/' + post.media.file;
    baixar.setAttribute('download', nomeDoArquivo(post));

    painel.querySelector('[data-passos]').hidden = true;
    painel.querySelector('[data-nativo]').hidden = !navigator.share;

    if (suportaArquivos()) {
      estado.promessaArquivo = prepararArquivo(post).then(
        function (f) {
          estado.arquivo = f;
          return f;
        },
        function () {
          return null;
        }
      );
    }

    if (typeof painel.showModal === 'function') painel.showModal();
    else painel.setAttribute('open', '');
  }

  function fecharPainel() {
    if (!painel) return;
    if (typeof painel.close === 'function') painel.close();
    else painel.removeAttribute('open');
  }

  if (painel) {
    // Devolve o foco ao botão que abriu o painel.
    painel.addEventListener('close', function () {
      if (estado.origem) estado.origem.focus();
    });
    // Tocar fora do painel fecha.
    painel.addEventListener('click', function (ev) {
      if (ev.target === painel) fecharPainel();
    });

    painel.addEventListener('click', function (ev) {
      var el = ev.target.closest('[data-rede],[data-app],[data-painel-acao]');
      if (!el || !estado.post) return;
      var post = estado.post;

      // Redes com link: o próprio <a target="_blank"> abre a rede.
      if (el.hasAttribute('data-rede')) {
        var rede = el.getAttribute('data-rede');
        if (rede === 'facebook') {
          // O Facebook só aceita o link: copiamos a legenda para a pessoa colar.
          copiarTexto(Share.textoCompleto(estado.legenda, post.hashtags));
          toast('Legenda copiada! Cole no Facebook.');
        }
        avisarCompartilhamento(post.id, rede);
        return;
      }

      // Instagram, TikTok, Kwai.
      if (el.hasAttribute('data-app')) {
        compartilharNoApp(el.getAttribute('data-app'));
        return;
      }

      var acao = el.getAttribute('data-painel-acao');
      if (acao === 'fechar') fecharPainel();
      else if (acao === 'copiar') copiarLegenda(post, estado.legenda);
      else if (acao === 'baixar') toast('Baixando mídia…');
      else if (acao === 'nativo') compartilharNativo();
    });
  }

  // Instagram/TikTok/Kwai: Web Share API com arquivo; senão, instruções "baixe + cole".
  function compartilharNoApp(rede) {
    var post = estado.post;
    var texto = Share.textoCompleto(estado.legenda, post.hashtags);
    var passos = painel.querySelector('[data-passos]');
    var nomeRede = { instagram: 'Instagram', tiktok: 'TikTok', kwai: 'Kwai' }[rede] || rede;

    function mostrarPassos() {
      passos.querySelector('[data-passos-rede]').textContent = nomeRede;
      passos.hidden = false;
      passos.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    // A legenda já vai copiada: a maioria desses apps ignora o texto do share.
    copiarTexto(texto);
    avisarCompartilhamento(post.id, rede);

    if (!estado.promessaArquivo) {
      toast('Legenda copiada!');
      mostrarPassos();
      return;
    }

    var tentar = function (arquivo) {
      var dados = { files: [arquivo], text: texto, title: post.title };
      var pode = false;
      try {
        pode = !!arquivo && typeof navigator.canShare === 'function' && navigator.canShare(dados);
      } catch (e) {
        pode = false;
      }
      if (!pode) {
        toast('Legenda copiada!');
        mostrarPassos();
        return;
      }
      toast('Legenda copiada! Escolha o ' + nomeRede + ' na lista.');
      navigator.share(dados).catch(function (erro) {
        if (erro && erro.name === 'AbortError') return; // pessoa cancelou
        if (erro && erro.name === 'NotAllowedError') {
          toast('Arquivo pronto! Toque de novo em ' + nomeRede + '.');
          return;
        }
        mostrarPassos();
      });
    };

    // Se o arquivo já foi baixado, compartilha imediatamente (mantém o "toque" válido).
    if (estado.arquivo) tentar(estado.arquivo);
    else {
      toast('Preparando a mídia…');
      estado.promessaArquivo.then(tentar);
    }
  }

  // "Mais apps": lista nativa do celular com legenda + link.
  function compartilharNativo() {
    var post = estado.post;
    var link = Share.comUtm(urlDaPagina(post), 'nativo', post.date);
    avisarCompartilhamento(post.id, 'nativo');
    navigator
      .share({ title: post.title, text: Share.textoCompleto(estado.legenda, post.hashtags), url: link })
      .catch(function () {});
  }

  // ---------------------------------------------------------------------------
  // Rodapé: créditos dos posts exibidos
  // ---------------------------------------------------------------------------
  function preencherCreditos(posts) {
    var el = document.getElementById('creditos');
    if (!el) return;
    var nomes = unicos(
      posts.map(function (p) {
        return p.credit || config.default_credit || '';
      }).filter(Boolean)
    );
    el.textContent = nomes.length ? 'Créditos dos conteúdos: ' + nomes.join('; ') + '.' : '';
  }

  // Pede ao service worker para guardar as thumbs do dia (uso offline).
  function guardarOffline(posts) {
    if (!('serviceWorker' in navigator)) return;
    var urls = [];
    posts.forEach(function (p) {
      if (p.media.thumb) urls.push('/' + p.media.thumb);
      if (p.media.type === 'image') urls.push('/' + p.media.file);
    });
    navigator.serviceWorker.ready.then(function (reg) {
      if (reg.active) reg.active.postMessage({ tipo: 'guardar', urls: urls });
    });
  }

  function carregarPosts() {
    return fetch('/data/posts.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function mostrarErro(container) {
    container.setAttribute('aria-busy', 'false');
    container.innerHTML =
      '<div class="vazio"><p><strong>Não foi possível carregar os conteúdos.</strong></p><p>Verifique sua conexão e tente de novo.</p>' +
      '<button type="button" class="btn btn--primary" data-recarregar>Tentar de novo</button></div>';
    container.querySelector('[data-recarregar]').addEventListener('click', function () {
      location.reload();
    });
  }

  // ---------------------------------------------------------------------------
  // Página inicial: só os posts de hoje
  // ---------------------------------------------------------------------------
  function iniciarHome() {
    var container = document.getElementById('posts');
    var hoje = hojeSP();
    document.getElementById('data-hoje').textContent = dataLonga(hoje);

    carregarPosts()
      .then(function (posts) {
        // Só datas até hoje (posts agendados para o futuro ficam escondidos).
        var datas = unicos(
          posts.map(function (p) {
            return p.date;
          })
        )
          .filter(function (d) {
            return d <= hoje;
          })
          .sort();

        var pedido = new URLSearchParams(location.search).get('d');
        var dia;
        if (pedido && datas.indexOf(pedido) !== -1) dia = pedido;
        else if (datas.indexOf(hoje) !== -1) dia = hoje;
        else dia = datas[datas.length - 1];

        if (!dia) {
          container.setAttribute('aria-busy', 'false');
          container.innerHTML = '<div class="vazio"><p>Ainda não há conteúdos publicados. Volte mais tarde!</p></div>';
          return;
        }

        var doDia = posts
          .filter(function (p) {
            return p.date === dia;
          })
          .sort(function (a, b) {
            return a.id < b.id ? -1 : 1;
          });

        if (dia !== hoje) {
          var aviso = document.getElementById('aviso-dia');
          aviso.innerHTML =
            'Conteúdos de <strong>' + esc(dataCurta(dia)) + '</strong>' +
            (pedido ? ' · <a href="/">ver os mais recentes</a>' : '');
          aviso.hidden = false;
        }

        renderizarCards(container, doDia, true);
        preencherCreditos(doDia);
        guardarOffline(doDia);
        document.dispatchEvent(new CustomEvent('eh:dia', { detail: { dia: dia, hoje: hoje, posts: doDia } }));
      })
      .catch(function () {
        mostrarErro(container);
      });
  }

  // ---------------------------------------------------------------------------
  // Página de um post (/p/<id>/)
  // ---------------------------------------------------------------------------
  function iniciarPost() {
    var post = lerJson('eh-post');
    var container = document.getElementById('posts');
    if (!post || !container) return;
    renderizarCards(container, [post], false);
    preencherCreditos([post]);
  }

  // ---------------------------------------------------------------------------
  // Arquivo (/arquivo/): dias anteriores
  // ---------------------------------------------------------------------------
  function iniciarArquivo() {
    var container = document.getElementById('lista-arquivo');
    var hoje = hojeSP();
    carregarPosts()
      .then(function (posts) {
        var visiveis = posts.filter(function (p) {
          return p.date <= hoje;
        });
        var datas = unicos(
          visiveis.map(function (p) {
            return p.date;
          })
        )
          .sort()
          .reverse();
        if (!datas.length) {
          container.innerHTML = '<p>Nenhum conteúdo publicado ainda.</p>';
          return;
        }
        container.innerHTML = datas
          .map(function (d) {
            var itens = visiveis
              .filter(function (p) {
                return p.date === d;
              })
              .sort(function (a, b) {
                return a.id < b.id ? -1 : 1;
              })
              .map(function (p) {
                return '<li><a href="/p/' + esc(p.id) + '/">' + esc(p.title) + '</a>' + (p.theme ? ' <span class="arquivo__tema">' + esc(p.theme) + '</span>' : '') + '</li>';
              })
              .join('');
            return (
              '<section class="arquivo__dia"><h2><a href="/?d=' + esc(d) + '">' + esc(dataLonga(d)) + '</a></h2><ul>' + itens + '</ul></section>'
            );
          })
          .join('');
        container.setAttribute('aria-busy', 'false');
      })
      .catch(function () {
        container.innerHTML = '<p>Não foi possível carregar o arquivo. Verifique sua conexão.</p>';
      });
  }

  // ---------------------------------------------------------------------------
  // Início
  // ---------------------------------------------------------------------------
  if (pagina === 'home') iniciarHome();
  else if (pagina === 'post') iniciarPost();
  else if (pagina === 'arquivo') iniciarArquivo();

  // PWA: registra o service worker.
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  // Exposto para testes automatizados.
  window.EHApp = { hojeSP: hojeSP, dataLonga: dataLonga };
})();
