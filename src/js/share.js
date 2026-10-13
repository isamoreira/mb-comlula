// Monta as URLs de compartilhamento de cada rede.
// Funciona no navegador (window.EHShare) e no Node (require), para podermos testar.
(function (root) {
  'use strict';

  // Redes com link de post pré-preenchido.
  var REDES_LINK = [
    { id: 'whatsapp', nome: 'WhatsApp' },
    { id: 'telegram', nome: 'Telegram' },
    { id: 'x', nome: 'X (Twitter)' },
    { id: 'threads', nome: 'Threads' },
    { id: 'facebook', nome: 'Facebook' },
    { id: 'reddit', nome: 'Reddit' },
  ];

  // Redes sem link pré-preenchido: usam Web Share API com arquivo, ou baixar + copiar.
  var REDES_APP = [
    { id: 'instagram', nome: 'Instagram' },
    { id: 'tiktok', nome: 'TikTok' },
    { id: 'kwai', nome: 'Kwai' },
  ];

  var enc = encodeURIComponent;

  // Adiciona os parâmetros UTM ao link da página do post.
  function comUtm(url, rede, campanha) {
    var sep = url.indexOf('?') === -1 ? '?' : '&';
    return url + sep + 'utm_source=' + enc(rede) + '&utm_medium=social&utm_campaign=' + enc(campanha);
  }

  // Legenda + hashtags em um único texto.
  function textoCompleto(legenda, hashtags) {
    var tags = (hashtags || []).join(' ').trim();
    return tags ? legenda + '\n\n' + tags : legenda;
  }

  // Conta caracteres "visíveis" (emojis e acentos contam como 1).
  function tamanho(s) {
    return Array.from(s).length;
  }

  // Corta o texto para caber no limite, terminando com "…".
  function cortar(s, max) {
    var chars = Array.from(s);
    if (chars.length <= max) return s;
    return chars.slice(0, max - 1).join('').replace(/\s+\S*$/, '') + '…';
  }

  // Ajusta o texto a um limite: tenta legenda + hashtags, depois só legenda, depois corta.
  function caber(legenda, hashtags, max) {
    var completo = textoCompleto(legenda, hashtags);
    if (tamanho(completo) <= max) return completo;
    if (tamanho(legenda) <= max) return legenda;
    return cortar(legenda, max);
  }

  // X: 280 caracteres, e o link sempre conta como 23 (+1 espaço).
  var LIMITE_X = 280 - 24;
  // Threads: 500 caracteres no total (texto + 2 quebras de linha + link).
  var LIMITE_THREADS = 500;

  /**
   * Gera a URL de compartilhamento.
   * @param {string} rede  id da rede (whatsapp, telegram, x, threads, facebook, reddit)
   * @param {object} p     { pageUrl, legenda, hashtags, titulo, data }
   */
  function urlCompartilhar(rede, p) {
    var link = comUtm(p.pageUrl, rede, p.data);
    var texto = textoCompleto(p.legenda, p.hashtags);
    switch (rede) {
      case 'whatsapp':
        return 'https://wa.me/?text=' + enc(texto + '\n\n' + link);
      case 'telegram':
        return 'https://t.me/share/url?url=' + enc(link) + '&text=' + enc(texto);
      case 'x':
        return 'https://twitter.com/intent/tweet?text=' + enc(caber(p.legenda, p.hashtags, LIMITE_X)) + '&url=' + enc(link);
      case 'threads': {
        var max = LIMITE_THREADS - tamanho(link) - 2;
        return 'https://www.threads.net/intent/post?text=' + enc(caber(p.legenda, p.hashtags, max) + '\n\n' + link);
      }
      case 'facebook':
        return 'https://www.facebook.com/sharer/sharer.php?u=' + enc(link);
      case 'reddit':
        return 'https://www.reddit.com/submit?url=' + enc(link) + '&title=' + enc(p.titulo);
      default:
        throw new Error('Rede desconhecida: ' + rede);
    }
  }

  var api = {
    REDES_LINK: REDES_LINK,
    REDES_APP: REDES_APP,
    comUtm: comUtm,
    textoCompleto: textoCompleto,
    urlCompartilhar: urlCompartilhar,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EHShare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
