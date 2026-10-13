# Espalha Hoje

Página simples, pensada para celular, onde voluntários veem **só os conteúdos do dia** (3 posts), tocam em **Compartilhar**, escolhem a rede social e o post sai pronto para publicar.

- Sem login, sem cadastro, sem cookies, sem Google Analytics, sem rastreadores de terceiros.
- Site estático (HTML + CSS + JavaScript puro), gerado por um script Node.js.
- Pode ser "instalado" na tela inicial do celular (PWA).
- Hospedagem gratuita no Cloudflare Pages ou no Netlify.

---

## Sumário

1. [Rodar no computador](#1-rodar-no-computador)
2. [Estrutura de pastas](#2-estrutura-de-pastas)
3. [Configuração (`data/config.json`)](#3-configuração-dataconfigjson)
4. [Adicionar posts](#4-adicionar-posts)
5. [Publicar os 3 posts do dia em menos de 5 minutos](#5-publicar-os-3-posts-do-dia-em-menos-de-5-minutos)
6. [Deploy no Cloudflare Pages ou Netlify](#6-deploy-no-cloudflare-pages-ou-netlify)
7. [Como o compartilhamento funciona em cada rede](#7-como-o-compartilhamento-funciona-em-cada-rede)
8. [Testes](#8-testes)
9. [Privacidade e conformidade](#9-privacidade-e-conformidade)
10. [Problemas comuns](#10-problemas-comuns)
11. [Fase 2: contador anônimo de compartilhamentos](#11-fase-2-contador-anônimo-de-compartilhamentos)

---

## 1. Rodar no computador

Requisito: [Node.js](https://nodejs.org) 18 ou mais novo.

```bash
npm install
npm run build
npm run dev
```

Abra **http://localhost:8080**. O terminal também mostra um endereço `http://192.168.x.x:8080` para abrir no celular (mesmo Wi-Fi).

> No celular pelo IP local (sem HTTPS), "Copiar legenda" e a lista nativa de apps podem não funcionar: os navegadores só liberam essas funções em HTTPS. Depois do deploy funciona normalmente.

Atalho: `npm start` faz o build e já abre o servidor.

## 2. Estrutura de pastas

```
├── build.js                 # gera o site em /dist a partir de /data e /media
├── dev.js                   # servidor local (npm run dev)
├── netlify.toml             # configuração do Netlify
├── data/
│   ├── config.json          # nome, cor, logo, missão do dia, rodapé...
│   └── posts.json           # os posts (todos os dias)
├── media/                   # imagens e vídeos dos posts (+ thumbs)
├── scripts/
│   ├── novo-post.js         # CLI interativa (npm run novo-post)
│   ├── gerar-exemplos.js    # gera as imagens de exemplo (npm run exemplos)
│   └── lib/midia.js         # thumbs, capas e placeholders
├── src/
│   ├── css/style.css        # estilos (mobile-first, claro/escuro automático)
│   ├── js/app.js            # cards, painel de compartilhar, cópia, Web Share API
│   ├── js/share.js          # monta as URLs de cada rede (com UTM)
│   └── sw.js                # service worker (PWA / offline)
├── worker/                  # fase 2: contador (Cloudflare Worker + D1)
│   ├── src/index.js
│   ├── schema.sql
│   └── wrangler.toml
├── test/
│   ├── smoke.js             # testes rápidos (URLs e meta tags)
│   ├── e2e.js               # teste no Chrome em tela de celular (390px)
│   └── contador.mjs         # testes da fase 2
└── dist/                    # site pronto (gerado; não edite)
```

Páginas geradas:

| Endereço | O que mostra |
|---|---|
| `/` e `/hoje/` | Só os posts de hoje (fuso de São Paulo). Se não houver, os do último dia disponível, com o aviso "Conteúdos de dd/mm/aaaa". |
| `/p/<id>/` | Um post. Tem as meta tags Open Graph/Twitter Card para a prévia bonita no WhatsApp, Facebook e X. É o link que vai nos compartilhamentos. |
| `/arquivo/` | Dias anteriores (link discreto no rodapé). |
| `/privacidade/` | Explica que o site não coleta dados pessoais. |
| `/admin-stats/` | Painel de compartilhamentos (fase 2, protegido por token). |

## 3. Configuração (`data/config.json`)

| Campo | Para que serve |
|---|---|
| `project_name` | Nome no topo, na aba do navegador e no app instalado. |
| `tagline` | Descrição curta (aparece na prévia do link da página inicial). |
| `site_url` | **Endereço público do site** (ex.: `https://espalha-hoje.pages.dev`). Usado nas meta tags de prévia, que exigem endereço completo. Pode ser sobrescrito pela variável de ambiente `SITE_URL`. |
| `primary_color` | Cor principal, formato `#RRGGBB`. A cor do texto sobre ela (branco ou preto) é escolhida automaticamente para manter o contraste. |
| `logo` | Caminho de um logo (ex.: `media/logo.png` ou `.svg`, de preferência quadrado). Vazio = logo padrão. Os ícones do app são gerados a partir dele. |
| `mission` | Texto da "Missão do dia", no topo da página inicial. |
| `footer_identification` | Texto livre sempre exibido no rodapé (ex.: quem produz o material, CNPJ quando aplicável). |
| `default_credit` | Crédito usado quando o post não tem `credit`. |
| `counter_endpoint` | Endereço do contador de compartilhamentos (fase 2). Vazio = desligado. |

## 4. Adicionar posts

### Opção A — CLI interativa (recomendado)

```bash
npm run novo-post
```

Ela pergunta: data (Enter = hoje), título, tema, legendas (uma por vez; Enter vazio termina), hashtags, caminho da mídia (pode **arrastar o arquivo** para o terminal), descrição para acessibilidade, link da fonte e crédito. Depois:

- copia a mídia para `media/<id>.<ext>`;
- gera a thumb leve `media/<id>-thumb.jpg` (720px);
- cria o id automaticamente (`2026-10-14-01`, `-02`, `-03`…);
- adiciona o post em `data/posts.json`;
- pergunta se quer adicionar outro, atualizar a missão do dia e rodar o build.

Vídeos: se o [ffmpeg](https://ffmpeg.org) estiver instalado, a capa é tirada do próprio vídeo. Senão, a CLI pede uma imagem de capa (ou gera uma capa simples com o título).

### Opção B — editar `data/posts.json` à mão

```json
{
  "id": "2026-10-14-01",
  "date": "2026-10-14",
  "title": "Título curto",
  "theme": "Economia",
  "media": {
    "type": "video",
    "file": "media/2026-10-14-01.mp4",
    "thumb": "media/2026-10-14-01.jpg",
    "alt": "Descrição da imagem para quem usa leitor de tela"
  },
  "captions": ["variação 1", "variação 2", "variação 3"],
  "hashtags": ["#exemplo1", "#exemplo2"],
  "source_url": "https://link-original-opcional",
  "credit": "Autor/organização responsável pelo material"
}
```

- `media.type`: `image` ou `video`. Vídeo exige `thumb` (capa).
- `media.alt` é opcional (padrão: o título), mas ajuda muito na acessibilidade.
- Use 3 variações de legenda: cada pessoa recebe uma sorteada e pode tocar em "Trocar legenda". Isso evita milhares de contas postando texto idêntico.
- O build valida o arquivo e avisa com mensagens claras se faltar algo (arquivo de mídia, data no formato errado, id repetido…).
- Vídeo vertical 9:16 em MP4 (H.264) é o formato que funciona em todos os celulares.

**Agendamento:** posts com data futura ficam escondidos na página inicial até o dia chegar. Dá para preparar os posts de amanhã hoje à noite e publicar de uma vez.

> Os 3 posts que vêm no projeto são **exemplos** (texto genérico e imagens geradas por `npm run exemplos`). Apague-os de `data/posts.json` e de `/media` quando for usar de verdade.

## 5. Publicar os 3 posts do dia em menos de 5 minutos

Antes (uma vez só): faça o deploy por Git (seção 6, opção 1). A partir daí, cada `git push` publica o site sozinho.

Todo dia:

1. **Separe o material** (1 min): as 3 mídias numa pasta e as legendas num bloco de notas (3 variações por post).
2. **Rode a CLI** (3 min):
   ```bash
   npm run novo-post
   ```
   Preencha o 1º post, responda `s` para "Adicionar outro post?", repita para o 2º e o 3º. No final, escreva a missão do dia e confirme o build.
3. **Confira** (opcional, 30 s): `npm run dev` e abra http://localhost:8080.
4. **Publique** (30 s):
   ```bash
   git add -A
   git commit -m "Posts de 2026-10-14"
   git push
   ```
   O Cloudflare Pages/Netlify faz o build e o site fica no ar em ~1 minuto.

Sem Git? Rode `npm run build` e use `npx wrangler pages deploy dist --project-name espalha-hoje` (Cloudflare) ou `npx netlify-cli deploy --prod --dir dist` (Netlify).

## 6. Deploy no Cloudflare Pages ou Netlify

### Antes de tudo

Ajuste `site_url` em `data/config.json` para o endereço final do site (ou defina a variável de ambiente `SITE_URL` no painel da hospedagem). Sem isso, as prévias dos links no WhatsApp/Facebook apontam para o endereço errado.

### Cloudflare Pages

**Opção 1 — conectado ao GitHub/GitLab (recomendado, publica a cada push)**

1. Suba este projeto para um repositório (pode ser privado).
2. No painel da Cloudflare: **Workers & Pages → Create → Pages → Connect to Git** e escolha o repositório.
3. Configure:
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Variáveis de ambiente: `NODE_VERSION` = `20` e (opcional) `SITE_URL` = `https://seu-endereco.pages.dev`
4. Salve. O site fica em `https://<projeto>.pages.dev` (dá para ligar um domínio próprio em **Custom domains**).

**Opção 2 — upload direto (sem Git)**

```bash
npm run build
npx wrangler pages deploy dist --project-name espalha-hoje
```

> Limite do Cloudflare Pages: **25 MB por arquivo**. Comprima vídeos maiores (ex.: HandBrake, preset "Fast 720p30") ou use o Netlify.

### Netlify

**Opção 1 — conectado ao Git:** **Add new site → Import an existing project**, escolha o repositório. O arquivo `netlify.toml` já define build (`npm run build`) e pasta (`dist`). O Netlify informa o endereço do site ao build automaticamente; para um domínio próprio, defina `SITE_URL`.

**Opção 2 — arrastar e soltar:** rode `npm run build` e arraste a pasta `dist` para https://app.netlify.com/drop.

**Opção 3 — linha de comando:** `npx netlify-cli deploy --prod --dir dist`.

Os cabeçalhos de segurança (`dist/_headers`: Content-Security-Policy, sem cache para `sw.js` e `posts.json` etc.) funcionam nos dois serviços.

## 7. Como o compartilhamento funciona em cada rede

Todos os links levam para a página do post (`/p/<id>/`), com UTM: `utm_source=<rede>&utm_medium=social&utm_campaign=<data do post>`.

| Rede | O que acontece |
|---|---|
| WhatsApp | `wa.me/?text=` com legenda + hashtags + link. |
| Telegram | `t.me/share/url` com link e legenda. |
| X | `twitter.com/intent/tweet` com legenda e link. Se passar de 280 caracteres, tira as hashtags e, se preciso, corta a legenda com "…". |
| Threads | `threads.net/intent/post` com legenda + link (limite de 500 caracteres respeitado). |
| Facebook | `facebook.com/sharer` só aceita o link: a legenda é **copiada automaticamente** e aparece o aviso "Legenda copiada! Cole no Facebook." |
| Reddit | `reddit.com/submit` com link e título. |
| Instagram, TikTok, Kwai | Não têm link de post pré-preenchido. No celular, a mídia é enviada pela **lista nativa de apps** (Web Share API) e a legenda já fica copiada. Onde isso não existe (ex.: computador), aparecem os passos "1. Baixe a mídia 2. Cole a legenda no app", com os botões. |
| Mais apps do celular | Lista nativa com legenda + link (aparece quando o navegador suporta). |

"Copiar legenda" e "Baixar mídia" também ficam disponíveis no card e no painel.

## 8. Testes

```bash
npm run build
npm test            # URLs de cada rede e meta tags OG das páginas /p/<id>/
npm run test:e2e    # abre o site no Chrome em tela de 390px e testa tudo
npm run test:contador  # fase 2: Worker + contador + /admin-stats/ (refaz o dist/ no final)
```

O teste e2e usa o Chrome ou Edge instalado (se não achar, defina `CHROME_PATH`). Ele verifica: posts do dia, aviso de dia anterior, posts futuros escondidos, botões ≥ 48px, ausência de rolagem horizontal, "Trocar legenda", "Copiar legenda", URL de cada rede, fallback do Instagram, Web Share com arquivo, modo escuro, meta tags OG e as páginas de arquivo/privacidade. As capturas de tela ficam em `test/screenshots/`.

Para conferir a prévia real depois do deploy: [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) ou mande o link para você mesmo no WhatsApp.

## 9. Privacidade e conformidade

- Nenhum dado pessoal é coletado. Não há cookies, login, formulários nem scripts de terceiros (a Content-Security-Policy em `_headers` bloqueia qualquer script externo).
- O rodapé sempre mostra `footer_identification` e os créditos (`credit`) dos posts exibidos; cada card também mostra seu crédito.
- A página `/privacidade/` explica o que é (e o que não é) registrado.
- Todo o conteúdo vem de `data/posts.json` e de `/media`. O site não busca nada de outros sites.

## 10. Problemas comuns

- **A prévia do link no WhatsApp não aparece ou está velha:** confira `site_url`; o WhatsApp/Facebook guardam a prévia em cache por um tempo — use o Sharing Debugger do Facebook para forçar a atualização.
- **"Copiar" não funciona no celular em teste local:** é a exigência de HTTPS (veja a seção 1).
- **Mudei o site mas o celular mostra a versão antiga:** o app instalado atualiza sozinho na próxima abertura (o service worker busca a nova versão). Feche e abra de novo.
- **Erro no build:** leia a mensagem — ela indica o post e o campo com problema.

## 11. Fase 2: contador anônimo de compartilhamentos

Quando ativado:

- cada toque em uma rede envia ao contador **só** `{ postId, network }`, sem IP, cookie ou identificador;
- o próprio aparelho guarda (no `localStorage`) quais post/rede já foram contados, então cada aparelho conta **1 vez por post e por rede**;
- a página inicial mostra "X pessoas já compartilharam hoje" (a partir de 1);
- o painel `/admin-stats/#token=SEU_TOKEN` mostra os compartilhamentos por rede, por post e por dia.

O contador é um **Cloudflare Worker** com banco **D1** (código em `worker/`). Ele funciona com o site hospedado tanto no Cloudflare Pages quanto no Netlify.

> **Por que D1 e não KV?** O plano gratuito do Workers KV aceita só 1.000 gravações por dia e não tem incremento atômico (cliques simultâneos se perdem). O D1 gratuito aceita 100 mil gravações por dia e soma `n = n + 1` de forma atômica. Os dois são da Cloudflare e o custo é zero nesse volume.

### Como ativar (≈10 minutos, uma vez só)

Precisa de uma conta gratuita na Cloudflare.

```bash
cd worker
npx wrangler login                              # abre o navegador para autorizar
npx wrangler d1 create espalha-hoje             # mostra um "database_id"
```

1. Copie o `database_id` para `worker/wrangler.toml` (no lugar de `COLE-AQUI-O-ID-DO-BANCO`).
2. Em `worker/wrangler.toml`, troque `ALLOWED_ORIGIN = "*"` pelo endereço do site (ex.: `"https://espalha-hoje.pages.dev"`).
3. Crie a tabela e publique:

   ```bash
   npx wrangler d1 execute espalha-hoje --remote --file=schema.sql
   npx wrangler secret put ADMIN_TOKEN            # digite um token longo e difícil (ex.: 32 caracteres aleatórios)
   npx wrangler deploy                            # mostra o endereço: https://espalha-hoje-contador.<sua-conta>.workers.dev
   ```

4. Coloque esse endereço em `data/config.json`:

   ```json
   "counter_endpoint": "https://espalha-hoje-contador.<sua-conta>.workers.dev"
   ```

   (ou defina a variável de ambiente `COUNTER_ENDPOINT` no painel da hospedagem).
5. Rode `npm run build` e publique o site. O build libera esse endereço na Content-Security-Policy automaticamente.
6. Acesse `https://seu-site/admin-stats/#token=SEU_TOKEN`.

O token é conferido pelo Worker (lido do segredo `ADMIN_TOKEN`); ele nunca fica no código do site. Use `#token=` (e não `?token=`), assim ele não aparece em logs de servidor. Para trocar o token, rode `npx wrangler secret put ADMIN_TOKEN` de novo.

### Testar o Worker no computador

```bash
cd worker
npx wrangler d1 execute espalha-hoje --local --file=schema.sql
npx wrangler dev                                 # Worker local em http://localhost:8787
```

Em outro terminal, na raiz do projeto: `COUNTER_ENDPOINT=http://localhost:8787 npm run build && npm run dev` (no PowerShell: `$env:COUNTER_ENDPOINT="http://localhost:8787"; npm run build; npm run dev`). Para o painel local, crie `worker/.dev.vars` com a linha `ADMIN_TOKEN=um-token-de-teste`.

### Rotas do Worker

| Rota | Uso |
|---|---|
| `POST /hit` | Corpo `{"postId":"2026-10-14-01","network":"whatsapp"}`. Soma 1. Redes aceitas: whatsapp, telegram, x, threads, facebook, reddit, instagram, tiktok, kwai, nativo. |
| `GET /today` | `{"day":"2026-10-14","total":123}`. Cache de 60 s na Cloudflare para poupar o banco. |
| `GET /stats?days=7` | Exige `Authorization: Bearer <ADMIN_TOKEN>`. Totais por rede, por post e por dia. |

### Limites (para saber o que esperar)

- **"pessoas" na frase da página inicial é uma aproximação:** o número soma compartilhamentos (1 por post/rede/aparelho). Quem compartilha 3 posts em 2 redes conta 6.
- **É possível inflar o contador** de propósito (limpando o navegador ou chamando o `/hit` direto). Sem identificar pessoas, isso não tem como ser evitado 100%. Use o número como termômetro, não como dado exato.
- A Cloudflare, como qualquer servidor, recebe o IP na conexão. O Worker não lê nem grava esse IP, e os logs ficam desligados (`[observability] enabled = false`).
