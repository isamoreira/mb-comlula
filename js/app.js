// Espalha Hoje — lógica do site (sem frameworks).
// Páginas: home (/ e /hoje), post (/p/<id>/), arquivo (/arquivo/).
(function () {
  'use strict';

  var FUSO = 'America/Sao_Paulo';
  var Share = window.EHShare;
  var config = lerJson('eh-config') || {};
  var pagina = document.body.getAttribute('data-page');
  // Pasta do site (ex.: "/mb-comlula/" no GitHub Pages). Todos os caminhos partem daqui.
  var BASE = config.base || '/';

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
    return location.origin + BASE + 'p/' + encodeURIComponent(post.id) + '/';
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
        '<video controls playsinline preload="none" poster="' + esc(BASE + (m.thumb || '')) + '" aria-label="Vídeo: ' + esc(alt) + '">' +
        '<source src="' + esc(BASE + m.file) + '">' +
        'Seu navegador não reproduz este vídeo. Use o botão "Salvar no celular".' +
        '</video></div>'
      );
    }
    var carregamento = prioridade ? ' fetchpriority="high"' : ' loading="lazy"';
    return (
      '<div class="card__media">' +
      '<img src="' + esc(BASE + (m.thumb || m.file)) + '" alt="' + esc(alt) + '"' + dims + carregamento + ' decoding="async">' +
      '</div>'
    );
  }

  function htmlCard(post, indice, tituloComLink) {
    var legendas = post.captions || [];
    var atual = Math.floor(Math.random() * legendas.length) || 0; // começa sorteada
    var tituloHtml = tituloComLink ? '<a href="' + BASE + 'p/' + esc(post.id) + '/">' + esc(post.title) + '</a>' : esc(post.title);
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
      (post.hashtags && post.hashtags.length ? '<p class="card__tags">' + esc(Share.hashtagsPara(post.hashtags).join(' ')) + '</p>' : '') +
      '<button type="button" class="btn btn--primary btn--grande" data-acao="compartilhar">' + ICONES.share + '<span>Compartilhar</span></button>' +
      '<div class="card__acoes">' +
      botaoTrocar +
      '<button type="button" class="btn btn--ghost" data-acao="copiar">' + ICONES.copy + '<span>Copiar legenda</span></button>' +
      '<a class="btn btn--ghost" data-acao="baixar" href="' + esc(BASE + post.media.file) + '" download="' + esc(nomeDoArquivo(post)) + '">' + ICONES.download + '<span>Salvar no celular</span></a>' +
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
      salvarNoCelular(post, ev);
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
  // Arquivos de mídia (para enviar a foto/vídeo pela lista de apps do celular)
  // ---------------------------------------------------------------------------

  // O navegador consegue compartilhar arquivos pela lista nativa de apps?
  function suportaArquivos() {
    try {
      if (!navigator.canShare || !navigator.share || !window.File) return false;
      return navigator.canShare({ files: [new File(['x'], 'teste.jpg', { type: 'image/jpeg' })] });
    } catch (e) {
      return false;
    }
  }

  function podeEnviar(dados) {
    try {
      return typeof navigator.canShare === 'function' && navigator.canShare(dados);
    } catch (e) {
      return false;
    }
  }

  // Um download por post, guardado: abrir o painel de novo não baixa outra vez.
  // O arquivo precisa estar PRONTO antes do toque: o iPhone só abre a lista de apps
  // se navigator.share() for chamado logo no toque.
  var arquivos = {};
  function obterArquivo(post) {
    var item = arquivos[post.id];
    if (item) return item;
    item = arquivos[post.id] = { pronto: null, erro: false, progresso: 0, ouvintes: [] };
    function avisar() {
      item.ouvintes.forEach(function (f) {
        f(item);
      });
    }
    fetch(BASE + post.media.file)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var total = Number(r.headers.get('content-length')) || 0;
        if (!r.body || !total || !window.ReadableStream) return r.blob();
        // Lê aos pedaços para mostrar "Preparando… 40%".
        var leitor = r.body.getReader();
        var pedacos = [];
        var recebido = 0;
        function ler() {
          return leitor.read().then(function (p) {
            if (p.done) return new Blob(pedacos, { type: r.headers.get('content-type') || '' });
            pedacos.push(p.value);
            recebido += p.value.length;
            item.progresso = Math.min(99, Math.round((recebido / total) * 100));
            avisar();
            return ler();
          });
        }
        return ler();
      })
      .then(function (blob) {
        var tipo = blob.type && blob.type.indexOf('text/') !== 0 ? blob.type : post.media.type === 'video' ? 'video/mp4' : 'image/jpeg';
        item.pronto = new File([blob], nomeDoArquivo(post), { type: tipo });
        item.progresso = 100;
        avisar();
      })
      .catch(function () {
        item.erro = true;
        avisar();
      });
    return item;
  }

  function nomeDaMidia(post) {
    return post.media.type === 'video' ? 'vídeo' : 'foto';
  }

  // "Salvar no celular": no celular, abre a lista de apps só com o arquivo, onde aparece
  // "Salvar vídeo"/"Salvar imagem" (vai para a Galeria). No computador, baixa normalmente.
  function salvarNoCelular(post, ev) {
    if (!suportaArquivos()) {
      toast('Baixando…');
      return; // segue o link de download
    }
    ev.preventDefault();
    var item = obterArquivo(post);
    if (item.erro) {
      toast('Não foi possível pegar a ' + nomeDaMidia(post) + '. Tente de novo mais tarde.');
      return;
    }
    if (!item.pronto) {
      toast('Preparando a ' + nomeDaMidia(post) + '… ' + item.progresso + '%. Toque de novo quando terminar.');
      item.ouvintes.push(function (it) {
        if (it.pronto && !it.avisadoSalvar) {
          it.avisadoSalvar = true;
          toast('Pronto! Toque em "Salvar no celular" de novo.');
        }
      });
      return;
    }
    var dados = { files: [item.pronto] };
    if (!podeEnviar(dados)) {
      location.href = BASE + post.media.file;
      return;
    }
    toast(post.media.type === 'video' ? 'Escolha "Salvar vídeo" na lista.' : 'Escolha "Salvar imagem" na lista.');
    navigator.share(dados).catch(function (erro) {
      if (erro && erro.name === 'AbortError') return;
      // Se a lista de apps recusar, abre o arquivo direto (download comum).
      location.href = BASE + post.media.file;
    });
  }

  // ---------------------------------------------------------------------------
  // Painel de compartilhamento (bottom sheet)
  // ---------------------------------------------------------------------------
  var painel = document.getElementById('painel');
  var estado = { post: null, legenda: '', origem: null };
  var NOMES_APP = { whatsapp: 'WhatsApp', instagram: 'Instagram', tiktok: 'TikTok', kwai: 'Kwai', nativo: 'app' };

  function abrirPainel(post, legenda, origem) {
    if (!painel) return;
    estado.post = post;
    estado.legenda = legenda;
    estado.origem = origem;

    painel.querySelector('[data-painel-titulo]').textContent = post.title;
    painel.querySelectorAll('[data-midia-nome]').forEach(function (el) {
      el.textContent = nomeDaMidia(post);
    });

    // Links das redes com legenda + UTM.
    var dados = { pageUrl: urlDaPagina(post), legenda: legenda, hashtags: post.hashtags, titulo: post.title, data: post.date };
    painel.querySelectorAll('a[data-rede]').forEach(function (a) {
      a.href = Share.urlCompartilhar(a.getAttribute('data-rede'), dados);
    });

    // Download/salvar.
    painel.querySelectorAll('[data-painel-baixar]').forEach(function (a) {
      a.href = BASE + post.media.file;
      a.setAttribute('download', nomeDoArquivo(post));
    });

    painel.querySelector('[data-passos]').hidden = true;
    var celular = suportaArquivos();
    painel.classList.toggle('painel--celular', celular);
    painel.querySelector('[data-app="nativo"]').hidden = !celular;

    if (celular) {
      var item = obterArquivo(post);
      atualizarPreparo(item);
      if (item.ouvintes.indexOf(atualizarPreparo) === -1) item.ouvintes.push(atualizarPreparo);
    } else {
      painel.querySelector('[data-progresso]').hidden = true;
      definirAppsAtivos(true);
    }

    if (typeof painel.showModal === 'function') painel.showModal();
    else painel.setAttribute('open', '');
  }

  function definirAppsAtivos(ativos) {
    painel.querySelectorAll('[data-app]').forEach(function (b) {
      b.setAttribute('aria-disabled', ativos ? 'false' : 'true');
      b.classList.toggle('rede--esperando', !ativos);
    });
  }

  // Mostra "Preparando o vídeo… 40%" e libera os botões quando o arquivo está pronto.
  function atualizarPreparo(item) {
    if (!estado.post || arquivos[estado.post.id] !== item) return;
    var el = painel.querySelector('[data-progresso]');
    el.hidden = false;
    el.classList.toggle('painel__progresso--erro', item.erro);
    if (item.erro) {
      el.textContent = 'Não foi possível preparar a ' + nomeDaMidia(estado.post) + '. Use "Ou mande só o link" abaixo.';
      definirAppsAtivos(false);
    } else if (item.pronto) {
      el.textContent = '✔ ' + (estado.post.media.type === 'video' ? 'Vídeo pronto' : 'Foto pronta') + '! Escolha onde enviar:';
      definirAppsAtivos(true);
    } else {
      el.textContent = 'Preparando o ' + (estado.post.media.type === 'video' ? 'vídeo' : 'arquivo') + '… ' + item.progresso + '%';
      definirAppsAtivos(false);
    }
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

      // "Ou mande só o link": o próprio <a target="_blank"> abre a rede.
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

      // "Enviar a foto/vídeo": WhatsApp, Instagram, TikTok, Kwai, outro app.
      if (el.hasAttribute('data-app')) {
        enviarArquivo(el.getAttribute('data-app'));
        return;
      }

      var acao = el.getAttribute('data-painel-acao');
      if (acao === 'fechar') fecharPainel();
      else if (acao === 'copiar') copiarLegenda(post, estado.legenda);
      else if (acao === 'baixar') salvarNoCelular(post, ev);
    });
  }

  // Envia a foto/vídeo + legenda pela lista de apps do celular.
  // No computador (sem essa função), mostra "1. Baixe a mídia 2. Cole a legenda".
  function enviarArquivo(app) {
    var post = estado.post;
    var nome = NOMES_APP[app] || app;
    // Só legenda + hashtags (sem link): o link fica para "Ou mande só o link".
    var texto = Share.textoCompleto(estado.legenda, post.hashtags, app);
    var passos = painel.querySelector('[data-passos]');

    function mostrarPassos() {
      passos.querySelector('[data-passos-rede]').textContent = app === 'nativo' ? 'app' : nome;
      passos.hidden = false;
      passos.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    if (!suportaArquivos()) {
      copiarTexto(texto);
      avisarCompartilhamento(post.id, app);
      toast('Legenda copiada!');
      mostrarPassos();
      return;
    }

    var item = obterArquivo(post);
    if (item.erro) {
      toast('Não foi possível preparar a ' + nomeDaMidia(post) + '. Mande só o link.');
      return;
    }
    if (!item.pronto) {
      toast('Só um instante: preparando… ' + item.progresso + '%');
      return;
    }

    var dados = { files: [item.pronto], text: texto };
    if (!podeEnviar(dados)) dados = { files: [item.pronto] };
    if (!podeEnviar(dados)) {
      copiarTexto(texto);
      toast('Legenda copiada!');
      mostrarPassos();
      return;
    }

    // A legenda também vai copiada: vários apps ignoram o texto e é só colar.
    copiarTexto(texto);
    avisarCompartilhamento(post.id, app);
    toast(app === 'nativo' ? 'Legenda copiada! Escolha o app na lista.' : 'Legenda copiada! Escolha o ' + nome + ' na lista.');
    navigator.share(dados).catch(function (erro) {
      if (erro && erro.name === 'AbortError') return; // pessoa cancelou
      // "NotAllowedError": o celular recusou. Pode ser o toque que "expirou" (aí tocar de novo resolve)
      // ou o arquivo grande demais para a lista de apps (aí não adianta insistir).
      if (erro && erro.name === 'NotAllowedError' && !item.recusado) {
        item.recusado = true;
        toast('Toque de novo em ' + nome + '.');
        return;
      }
      toast('O celular não deixou enviar direto. Salve no celular e poste pelo ' + (app === 'nativo' ? 'app' : nome) + '.');
      mostrarPassos();
    });
  }

  // ---------------------------------------------------------------------------
  // Aviso para quem abriu o link dentro do Instagram/Facebook/TikTok
  // (esses navegadores internos não deixam baixar nem enviar arquivos).
  // ---------------------------------------------------------------------------
  function avisoNavegadorInterno() {
    var ua = navigator.userAgent || '';
    var app = /Instagram/i.test(ua)
      ? 'Instagram'
      : /FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)
      ? 'Facebook'
      : /musical_ly|TikTok|BytedanceWebview/i.test(ua)
      ? 'TikTok'
      : /Kwai/i.test(ua)
      ? 'Kwai'
      : /Line\//i.test(ua)
      ? 'Line'
      : '';
    if (!app) return;
    var main = document.querySelector('main .wrap');
    if (!main) return;
    var android = /Android/i.test(ua);
    var aviso = document.createElement('div');
    aviso.className = 'aviso aviso--app';
    aviso.setAttribute('role', 'alert');
    var abrir = android
      ? '<a class="btn btn--primary" href="intent://' + esc(location.host + location.pathname + location.search) +
        '#Intent;scheme=https;package=com.android.chrome;end">Abrir no Chrome</a>'
      : '';
    aviso.innerHTML =
      '<p><strong>Você abriu pelo ' + esc(app) + '.</strong> Aqui dentro não dá para baixar nem enviar fotos e vídeos.</p>' +
      '<p>' + (android ? 'Toque no botão abaixo ou nos <strong>3 pontinhos ⋮</strong> e escolha <strong>"Abrir no navegador"</strong>.' : 'Toque em <strong>⋯</strong> (no canto da tela) e escolha <strong>"Abrir no navegador"</strong> ou <strong>"Abrir no Safari"</strong>.') + '</p>' +
      abrir;
    main.insertBefore(aviso, main.firstChild);
  }
  avisoNavegadorInterno();

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
      if (p.media.thumb) urls.push(BASE + p.media.thumb);
      if (p.media.type === 'image') urls.push(BASE + p.media.file);
    });
    navigator.serviceWorker.ready.then(function (reg) {
      if (reg.active) reg.active.postMessage({ tipo: 'guardar', urls: urls });
    });
  }

  function carregarPosts() {
    return fetch(BASE + 'data/posts.json', { cache: 'no-cache' }).then(function (r) {
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
            (pedido ? ' · <a href="' + BASE + '">ver os mais recentes</a>' : '');
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
                return '<li><a href="' + BASE + 'p/' + esc(p.id) + '/">' + esc(p.title) + '</a>' + (p.theme ? ' <span class="arquivo__tema">' + esc(p.theme) + '</span>' : '') + '</li>';
              })
              .join('');
            return (
              '<section class="arquivo__dia"><h2><a href="' + BASE + '?d=' + esc(d) + '">' + esc(dataLonga(d)) + '</a></h2><ul>' + itens + '</ul></section>'
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
      navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE }).catch(function () {});
    });
  }

  // Exposto para testes automatizados.
  window.EHApp = { hojeSP: hojeSP, dataLonga: dataLonga };
})();
