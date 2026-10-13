// Service worker do Espalha Hoje.
// - Guarda o "esqueleto" do site (HTML, CSS, JS, ícones) na instalação.
// - Páginas e posts.json: tenta a rede primeiro (conteúdo sempre atualizado), cai no cache se offline.
// - Imagens de /media e /og: cache primeiro (são arquivos que não mudam).
// - Vídeos passam direto (o cache de vídeo com "Range" é problemático em alguns celulares).
// As marcações __VERSAO__ e __ARQUIVOS__ são preenchidas pelo build.js.

var VERSAO = '__VERSAO__';
var CACHE_SHELL = 'eh-shell-' + VERSAO;
var CACHE_MIDIA = 'eh-midia-v1';
var ARQUIVOS_SHELL = __ARQUIVOS__;
var MAX_MIDIAS = 60;

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches
      .open(CACHE_SHELL)
      .then(function (c) {
        // cache: 'reload' ignora o cache HTTP e garante arquivos novos a cada versão.
        return c.addAll(
          ARQUIVOS_SHELL.map(function (u) {
            return new Request(u, { cache: 'reload' });
          })
        );
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches
      .keys()
      .then(function (nomes) {
        return Promise.all(
          nomes
            .filter(function (n) {
              return n.indexOf('eh-shell-') === 0 && n !== CACHE_SHELL;
            })
            .map(function (n) {
              return caches.delete(n);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

// Remove as mídias mais antigas quando o cache passa do limite.
function limitarCache(nome, max) {
  return caches.open(nome).then(function (c) {
    return c.keys().then(function (chaves) {
      if (chaves.length <= max) return;
      return Promise.all(
        chaves.slice(0, chaves.length - max).map(function (k) {
          return c.delete(k);
        })
      );
    });
  });
}

// A página pede para guardar as mídias do dia (uso offline).
self.addEventListener('message', function (ev) {
  var dados = ev.data || {};
  if (dados.tipo !== 'guardar' || !Array.isArray(dados.urls)) return;
  ev.waitUntil(
    caches
      .open(CACHE_MIDIA)
      .then(function (c) {
        return Promise.all(
          dados.urls.map(function (u) {
            return c.match(u).then(function (r) {
              return r || c.add(u).catch(function () {});
            });
          })
        );
      })
      .then(function () {
        return limitarCache(CACHE_MIDIA, MAX_MIDIAS);
      })
  );
});

function redePrimeiro(req) {
  return fetch(req)
    .then(function (resp) {
      if (resp && resp.ok) {
        var copia = resp.clone();
        caches.open(CACHE_SHELL).then(function (c) {
          c.put(req, copia);
        });
      }
      return resp;
    })
    .catch(function () {
      return caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(function (r) {
        return r || caches.match('/');
      });
    });
}

function cachePrimeiro(req) {
  return caches.match(req).then(function (r) {
    if (r) return r;
    return fetch(req).then(function (resp) {
      if (resp && resp.ok) {
        var copia = resp.clone();
        caches.open(CACHE_MIDIA).then(function (c) {
          c.put(req, copia).then(function () {
            limitarCache(CACHE_MIDIA, MAX_MIDIAS);
          });
        });
      }
      return resp;
    });
  });
}

self.addEventListener('fetch', function (ev) {
  var req = ev.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // nada de terceiros
  if (url.pathname.indexOf('/api/') === 0) return; // contador: sempre direto do servidor
  if (/\.(mp4|webm|mov|m4v)$/i.test(url.pathname)) return; // vídeos: direto da rede

  if (req.mode === 'navigate' || url.pathname === '/data/posts.json') {
    ev.respondWith(redePrimeiro(req));
  } else if (url.pathname.indexOf('/media/') === 0 || url.pathname.indexOf('/og/') === 0) {
    ev.respondWith(cachePrimeiro(req));
  } else {
    ev.respondWith(
      caches.match(req).then(function (r) {
        return r || fetch(req);
      })
    );
  }
});
