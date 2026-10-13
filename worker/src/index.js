// Cloudflare Worker: contador anônimo de compartilhamentos do Espalha Hoje.
//
// Rotas:
//   POST /hit     corpo {"postId": "...", "network": "..."} → +1 (responde 204)
//   GET  /today   → {"day": "AAAA-MM-DD", "total": N}  (total de hoje, cache de 60 s)
//   GET  /stats?days=7   (cabeçalho Authorization: Bearer <ADMIN_TOKEN>) → números por post e por rede
//
// Privacidade: nenhum IP, cookie ou identificador é lido ou gravado. Só (dia, post, rede, contagem).

const REDES = new Set(['whatsapp', 'telegram', 'x', 'threads', 'facebook', 'reddit', 'instagram', 'tiktok', 'kwai', 'nativo']);
const RE_POST = /^\d{4}-\d{2}-\d{2}-[\w-]{1,40}$/;
const TAMANHO_MAX_CORPO = 512;

// Data de hoje no fuso de São Paulo (AAAA-MM-DD).
function hojeSP(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

function diasAtras(dia, n) {
  const d = new Date(dia + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function cabecalhosCors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function resposta(env, corpo, status = 200, extra = {}) {
  const cab = { ...cabecalhosCors(env), ...extra };
  if (corpo === null) return new Response(null, { status, headers: cab });
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cab } });
}

// Comparação em tempo constante (evita descobrir o token por medição de tempo).
function tokensIguais(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] || 0) ^ (y[i] || 0);
  return dif === 0;
}

async function registrar(req, env) {
  const texto = await req.text();
  if (texto.length > TAMANHO_MAX_CORPO) return resposta(env, { erro: 'corpo grande demais' }, 413);
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch (e) {
    return resposta(env, { erro: 'JSON inválido' }, 400);
  }
  const postId = String((dados && dados.postId) || '');
  const rede = String((dados && dados.network) || '');
  if (!RE_POST.test(postId) || !REDES.has(rede)) return resposta(env, { erro: 'postId ou network inválido' }, 400);

  // Incremento atômico: duas pessoas ao mesmo tempo não "apagam" a contagem uma da outra.
  await env.DB.prepare(
    'INSERT INTO shares (day, post_id, network, n) VALUES (?1, ?2, ?3, 1) ON CONFLICT(day, post_id, network) DO UPDATE SET n = n + 1'
  )
    .bind(hojeSP(), postId, rede)
    .run();
  return resposta(env, null, 204);
}

async function totalDeHoje(req, env, ctx) {
  // Cache de 60 s na borda da Cloudflare: milhares de visitas viram poucas leituras no banco.
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const chave = new Request(new URL('/today?d=' + hojeSP(), req.url).toString());
  if (cache) {
    const guardada = await cache.match(chave);
    if (guardada) return guardada;
  }
  const dia = hojeSP();
  const linha = await env.DB.prepare('SELECT COALESCE(SUM(n), 0) AS total FROM shares WHERE day = ?1').bind(dia).first();
  const r = resposta(env, { day: dia, total: Number((linha && linha.total) || 0) }, 200, { 'Cache-Control': 'public, max-age=60' });
  if (cache && ctx) ctx.waitUntil(cache.put(chave, r.clone()));
  return r;
}

async function estatisticas(req, env) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.ADMIN_TOKEN || !token || !tokensIguais(token, env.ADMIN_TOKEN)) {
    return resposta(env, { erro: 'não autorizado' }, 401, { 'Cache-Control': 'no-store' });
  }
  const url = new URL(req.url);
  const dias = Math.min(Math.max(parseInt(url.searchParams.get('days'), 10) || 7, 1), 366);
  const hoje = hojeSP();
  const desde = diasAtras(hoje, dias - 1);
  const { results } = await env.DB.prepare('SELECT day, post_id, network, n FROM shares WHERE day >= ?1 ORDER BY day DESC, post_id, network')
    .bind(desde)
    .all();

  // Agregados prontos para o painel.
  const porRede = {};
  const porPost = {};
  const porDia = {};
  let total = 0;
  for (const r of results) {
    total += r.n;
    porRede[r.network] = (porRede[r.network] || 0) + r.n;
    porDia[r.day] = (porDia[r.day] || 0) + r.n;
    const p = (porPost[r.post_id] = porPost[r.post_id] || { post_id: r.post_id, total: 0, redes: {} });
    p.total += r.n;
    p.redes[r.network] = (p.redes[r.network] || 0) + r.n;
  }
  return resposta(
    env,
    {
      desde,
      ate: hoje,
      total,
      por_rede: porRede,
      por_dia: porDia,
      por_post: Object.values(porPost).sort((a, b) => b.total - a.total),
      linhas: results,
    },
    200,
    { 'Cache-Control': 'no-store' }
  );
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    try {
      if (req.method === 'OPTIONS') return resposta(env, null, 204);
      if (url.pathname === '/hit' && req.method === 'POST') return await registrar(req, env);
      if (url.pathname === '/today' && req.method === 'GET') return await totalDeHoje(req, env, ctx);
      if (url.pathname === '/stats' && req.method === 'GET') return await estatisticas(req, env);
      return resposta(env, { erro: 'não encontrado' }, 404);
    } catch (e) {
      return resposta(env, { erro: 'erro interno' }, 500);
    }
  },
};
