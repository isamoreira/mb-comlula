# Espalha Hoje

Página simples, pensada para celular, onde voluntários veem **só os conteúdos do dia** (3 posts), tocam em **Compartilhar**, escolhem a rede social e o post sai pronto para publicar.

- Sem login, sem cadastro, sem cookies, sem Google Analytics, sem rastreadores de terceiros.
- Site estático (HTML + CSS + JavaScript puro), gerado por um script Node.js.
- Pode ser "instalado" na tela inicial do celular (PWA).
- Publicado no **GitHub Pages**: https://isamoreira.github.io/mb-comlula/ (gratuito).
- Os 3 conteúdos do dia vêm do **Pode Espalhar** (podeespalhar.com.br): o comando `npm run importar` lista os conteúdos mais recentes pela API pública deles, você escolhe 3 e ele baixa tudo. O site só mostra o que for importado; nada é publicado sem alguém escolher.

---

## Sumário

1. [Rodar no computador](#1-rodar-no-computador)
2. [Estrutura de pastas](#2-estrutura-de-pastas)
3. [Configuração (`data/config.json`)](#3-configuração-dataconfigjson)
4. [Adicionar posts](#4-adicionar-posts)
5. [Publicar os 3 posts do dia em menos de 5 minutos](#5-publicar-os-3-posts-do-dia-em-menos-de-5-minutos)
6. [Publicação no GitHub Pages](#6-publicação-no-github-pages)
7. [Como o compartilhamento funciona em cada rede](#7-como-o-compartilhamento-funciona-em-cada-rede)
8. [Testes](#8-testes)
9. [Privacidade e conformidade](#9-privacidade-e-conformidade)
10. [Problemas comuns](#10-problemas-comuns)
11. [Contador de compartilhamentos e "Veja os números" (Google Planilhas)](#11-contador-de-compartilhamentos-e-veja-os-números-google-planilhas)

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

> **As mídias (`/media`) não vão para o ramo `main` do GitHub** (o do código): ficam no seu computador e no ramo `gh-pages`, junto com o site publicado (`npm run publicar`). Podem ser baixadas de novo do Pode Espalhar com `npm run importar`.

```
├── build.js                 # gera o site em /dist a partir de /data e /media
├── dev.js                   # servidor local (npm run dev)
├── netlify.toml             # configuração do Netlify
├── contador-google/
│   └── Codigo.gs            # contador (Google Apps Script + planilha)
├── data/
│   ├── config.json          # nome, cor, logo, missão do dia, rodapé...
│   └── posts.json           # os posts (todos os dias)
├── media/                   # imagens e vídeos dos posts (+ thumbs)
├── scripts/
│   ├── importar.js          # importa do Pode Espalhar (npm run importar)
│   ├── novo-post.js         # cadastro manual de um post (npm run novo-post)
│   ├── gerar-exemplos.js    # gera as imagens de exemplo dos testes (npm run exemplos)
│   ├── publicar.js          # publica no GitHub Pages (npm run publicar)
│   ├── conferir.js          # confere se o site publicado está completo (npm run conferir)
│   ├── otimizar.js          # deixa vídeos leves para celular (npm run otimizar)
│   └── lib/                 # funções compartilhadas (mídia, posts)
├── src/
│   ├── css/style.css        # estilos (mobile-first, claro/escuro automático)
│   ├── js/app.js            # cards, painel de compartilhar, cópia, Web Share API
│   ├── js/share.js          # monta as URLs de cada rede (com UTM)
│   └── sw.js                # service worker (PWA / offline)
├── test/
│   ├── smoke.js             # testes rápidos (URLs e meta tags)
│   ├── e2e.js               # teste no Chrome em tela de celular (390px)
│   ├── contador.mjs         # testes do contador (PHP) e da página de números
│   └── fixture/             # 3 posts de exemplo, usados só pelos testes
└── dist/                    # site pronto (gerado; não edite)
```

Páginas geradas:

| Endereço | O que mostra |
|---|---|
| `/` e `/hoje/` | Só os posts de hoje (fuso de São Paulo). Se não houver, os do último dia disponível, com o aviso "Conteúdos de dd/mm/aaaa". |
| `/p/<id>/` | Um post. Tem as meta tags Open Graph/Twitter Card para a prévia bonita no WhatsApp, Facebook e X. É o link que vai nos compartilhamentos. |
| `/arquivo/` | Dias anteriores (link discreto no rodapé). |
| `/privacidade/` | Explica que o site não coleta dados pessoais. |
| `/numeros/` | "Veja os números": compartilhamentos por rede, por post e por dia (público). |

## 3. Configuração (`data/config.json`)

| Campo | Para que serve |
|---|---|
| `project_name` | Nome no topo, na aba do navegador e no app instalado. |
| `tagline` | Descrição curta (aparece na prévia do link da página inicial). |
| `site_url` | **Endereço público do site** (`https://isamoreira.github.io/mb-comlula`, **não** o do Pode Espalhar). Usado nas meta tags de prévia, que exigem endereço completo, e para saber a "pasta" do site (`/mb-comlula/`). Pode ser sobrescrito pela variável de ambiente `SITE_URL`. |
| `primary_color` | Cor principal, formato `#RRGGBB`. A cor do texto sobre ela (branco ou preto) é escolhida automaticamente para manter o contraste. |
| `logo` | Caminho de um logo (ex.: `media/logo.png` ou `.svg`, de preferência quadrado). Vazio = logo padrão. Os ícones do app são gerados a partir dele. |
| `mission` | Texto da "Missão do dia", no topo da página inicial. |
| `footer_identification` | Texto livre sempre exibido no rodapé (ex.: quem produz o material, CNPJ quando aplicável). |
| `default_credit` | Crédito usado quando o post não tem `credit`. |
| `counter_endpoint` | Endereço do contador no Google Apps Script (termina em `/exec`, veja a seção 11). Vazio = desligado. |

## 4. Adicionar posts

### Opção A — importar do Pode Espalhar (recomendado)

```bash
npm run importar
```

1. Aparece a lista dos conteúdos mais recentes do Pode Espalhar, numerada, com data, formato, campanha e o começo da legenda.
   - `m` mostra mais conteúdos;
   - `b palavra` busca (ex.: `b 6x1`, `b saúde`);
   - digite os números escolhidos, ex.: `1 4 7`.
2. Confirme a data em que eles aparecem no Espalha Hoje (Enter = hoje) e, se quiser, hashtags.
3. Para cada conteúdo, o importador:
   - baixa o **vídeo ou imagem original** e a capa para `/media` (o site não depende do servidor do Pode Espalhar);
   - **deixa o vídeo leve para celular**: vídeos acima de 15 MB são convertidos para 720p (ex.: 65 MB → 9,5 MB, sem perda visível na tela do celular). Vídeos muito grandes travam o envio pela lista de apps (o Chrome do Android recusa arquivos acima de ~50 MB). Para vídeos já importados: `npm run otimizar`;
   - preenche título, legenda, tema (a campanha), link da fonte e crédito "Pode Espalhar";
   - pergunta por **variações de legenda** (opcional, mas recomendado: com 2 ou 3 variações aparece o botão "Trocar legenda" e evita texto idêntico em muitas contas). Enter vazio pula.
4. No final: missão do dia e **publicação** no GitHub Pages.

Se você importar o mesmo conteúdo duas vezes para o mesmo dia, ele é pulado. Para automatizar: `npm run importar -- --ids=2219220,2218993,2216484 --data=2026-10-14 --sim` (ids do Pode Espalhar; `--sim` aceita os padrões).

### Opção B — CLI de cadastro manual (para conteúdos que não estão no Pode Espalhar)

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

### Opção C — editar `data/posts.json` à mão

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
- **Hashtags:** no máximo 5, as mais importantes primeiro (o Instagram não aceita mais que 5). No X vão só as 2 primeiras e no Threads só a 1ª. Hashtags ficam **só** no campo `hashtags`, nunca dentro das legendas.
- Use 3 variações de legenda: cada pessoa recebe uma sorteada e pode tocar em "Trocar legenda". Isso evita milhares de contas postando texto idêntico.
- O build valida o arquivo e avisa com mensagens claras se faltar algo (arquivo de mídia, data no formato errado, id repetido…).
- Vídeo vertical 9:16 em MP4 (H.264) é o formato que funciona em todos os celulares.

**Agendamento:** posts com data futura ficam escondidos na página inicial até o dia chegar. Dá para preparar os posts de amanhã hoje à noite e publicar de uma vez.

> `data/posts.json` começa vazio: enquanto não houver posts, o site mostra "Ainda não há conteúdos publicados". Os 3 posts de exemplo ficam em `test/fixture/` e só são usados pelos testes (nunca vão para o site).

## 5. Publicar os 3 posts do dia em menos de 5 minutos

Todo dia, no terminal do VS Code, na pasta do projeto:

1. **Importe e escolha** (2–3 min):
   ```bash
   npm run importar
   ```
   Escolha os 3 conteúdos (ex.: `2 5 9`), confirme a data, hashtags (até 5) e, no final, responda `S` para **publicar**.
2. **Confira** (10 s, depois de 1–2 minutos):
   ```bash
   npm run conferir
   ```
   Ele verifica no site publicado se todos os arquivos estão lá (inclusive os vídeos) e se o contador responde.
3. **Guarde a lista de posts no GitHub** (opcional, cópia de segurança):
   ```bash
   git add -A
   git commit -m "Posts de 14/10"
   git push
   ```

**Dica:** prepare os posts de amanhã hoje à noite (com a data de amanhã). Eles ficam escondidos até o dia chegar.

> Os vídeos do Pode Espalhar são convertidos para 720p (em geral 10–25 MB). Com 3 por dia, o site cresce ~50 MB/dia. O GitHub Pages aceita sites de até 1 GB: de tempos em tempos, apague de `data/posts.json` e de `/media` os dias antigos que não precisam mais ficar no ar.

## 6. Publicação no GitHub Pages

O site fica em **https://isamoreira.github.io/mb-comlula/** (gratuito).

### Como funciona

`npm run publicar` gera o site (`dist/`) e envia para o ramo **`gh-pages`** deste repositório:
- cada publicação substitui a anterior por um único commit (os vídeos de dias antigos não se acumulam no histórico);
- fotos e vídeos que já estão no GitHub não são reenviados;
- o código e a lista de posts continuam no ramo `main` (onde as mídias não entram).

Na hora de enviar, o Windows pode abrir a janela de login do GitHub: é só entrar e autorizar.

### Primeira vez (uma vez só)

1. Rode `npm run publicar`.
2. No GitHub: repositório **mb-comlula → Settings → Pages**.
3. Em **Build and deployment**: Source **"Deploy from a branch"**, Branch **`gh-pages`**, pasta **`/ (root)`** → **Save**.
4. Em 1–2 minutos o site abre no endereço acima. Rode `npm run conferir`.

### Endereço do site

`site_url` em `data/config.json` está como `https://isamoreira.github.io/mb-comlula`. Ele é usado nas prévias dos links (WhatsApp/Facebook) e define a "pasta" do site (`/mb-comlula/`). Se o repositório mudar de nome ou o site ganhar um domínio próprio, troque esse campo e publique de novo.

### Segurança sem `.htaccess`

O GitHub Pages não permite configurar cabeçalhos HTTP. Por isso a política que bloqueia scripts de terceiros (Content-Security-Policy) também vai dentro de cada página, numa `<meta>`. Os arquivos `_headers` e `.htaccess` continuam sendo gerados, caso o site um dia volte para Cloudflare Pages, Netlify ou uma hospedagem Apache.

### Outras hospedagens

O conteúdo de `dist/` funciona em qualquer hospedagem de site estático (Cloudflare Pages, Netlify, Hostinger…): ajuste `site_url` para o novo endereço, rode `npm run build` e envie a pasta `dist/`.

## 7. Como o compartilhamento funciona em cada rede

Todos os links levam para a página do post (`/p/<id>/`), com UTM: `utm_source=<rede>&utm_medium=social&utm_campaign=<data do post>`.

| Rede | O que acontece |
|---|---|
| WhatsApp | Em "Enviar a foto/vídeo": envia o **arquivo** com a legenda (sem link) pela lista de apps do celular (dá para postar no **Status**). Em "Ou mande só o link": `wa.me` com legenda + hashtags + link, com prévia da imagem. |
| Telegram | `t.me/share/url` com link e legenda. |
| X | `twitter.com/intent/tweet` com legenda e link. Se passar de 280 caracteres, tira as hashtags e, se preciso, corta a legenda com "…". |
| Threads | `threads.net/intent/post` com legenda + link (limite de 500 caracteres respeitado). |
| Facebook | `facebook.com/sharer` só aceita o link: a legenda é **copiada automaticamente** e aparece o aviso "Legenda copiada! Cole no Facebook." |
| Reddit | `reddit.com/submit` com link e título. |
| Instagram, TikTok, Kwai | Não têm link de post pré-preenchido. No celular, a mídia é enviada pela **lista nativa de apps** (Web Share API) e a legenda já fica copiada. Onde isso não existe (ex.: computador), aparecem os passos "1. Baixe a mídia 2. Cole a legenda no app", com os botões. |
| Mais apps do celular | Lista nativa com legenda + link (aparece quando o navegador suporta). |

### No celular: o painel "Compartilhar"

1. **Enviar a foto/vídeo com a legenda** (WhatsApp, Instagram, TikTok, Kwai, Outro app): o site prepara o arquivo ("Preparando o vídeo… 40%") e, quando fica pronto, cada botão abre a lista de apps do celular já com o arquivo e a legenda. A legenda também fica copiada.
2. **Ou mande só o link** (WhatsApp, Telegram, X, Threads, Facebook, Reddit).
3. **Salvar no celular**: abre a lista do celular com o arquivo, onde aparece "Salvar vídeo"/"Salvar imagem", e o arquivo vai para a **Galeria** (no iPhone, o download comum iria para o app "Arquivos").

**Aberto dentro do Instagram, Facebook, TikTok ou Kwai?** Esses apps abrem links num navegador interno que não deixa baixar nem enviar arquivos. O site percebe e mostra um aviso com o passo "Abrir no navegador" (no Android, um botão "Abrir no Chrome").

"Copiar legenda" e "Salvar no celular" também ficam no card de cada post.

## 8. Testes

```bash
npm test               # URLs de cada rede e meta tags OG das páginas /p/<id>/
npm run test:e2e       # abre o site no Chrome em tela de 390px e testa tudo
npm run test:contador  # contador PHP + página /numeros/ (precisa do PHP em WebAssembly, veja o topo de test/contador.mjs)
```

Os testes usam os 3 posts de exemplo de `test/fixture/` e geram o site de teste em `dist-teste/`. O `dist/` real nunca é tocado pelos testes.

O teste e2e usa o Chrome ou Edge instalado (se não achar, defina `CHROME_PATH`). Ele verifica: posts do dia, aviso de dia anterior, posts futuros escondidos, botões ≥ 48px, ausência de rolagem horizontal, "Trocar legenda", "Copiar legenda", URL de cada rede, fallback do Instagram, Web Share com arquivo, modo escuro, meta tags OG e as páginas de arquivo/privacidade. As capturas de tela ficam em `test/screenshots/`.

Para conferir a prévia real depois do deploy: [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) ou mande o link para você mesmo no WhatsApp.

## 9. Privacidade e conformidade

- Nenhum dado pessoal é coletado. Não há cookies, login, formulários nem scripts de terceiros (a Content-Security-Policy em `.htaccess`/`_headers` bloqueia qualquer script externo).
- O rodapé sempre mostra `footer_identification` e os créditos (`credit`) dos posts exibidos; cada card também mostra seu crédito.
- A página `/privacidade/` explica o que é (e o que não é) registrado.
- Todo o conteúdo vem de `data/posts.json` e de `/media`. O site não busca nada de outros sites.

## 10. Problemas comuns

- **A prévia do link no WhatsApp não aparece ou está velha:** confira `site_url`; o WhatsApp/Facebook guardam a prévia em cache por um tempo — use o Sharing Debugger do Facebook para forçar a atualização.
- **"Copiar" não funciona no celular em teste local:** é a exigência de HTTPS (veja a seção 1).
- **Mudei o site mas o celular mostra a versão antiga:** o app instalado atualiza sozinho na próxima abertura (o service worker busca a nova versão). Feche e abra de novo.
- **Erro no build:** leia a mensagem — ela indica o post e o campo com problema.

## 11. Contador de compartilhamentos e "Veja os números" (Google Planilhas)

O contador é um pequeno programa em JavaScript que roda no **Google Apps Script**, na sua conta Google, e guarda os números numa **planilha**. O código está em `contador-google/Codigo.gs`.

- Cada toque em uma rede envia ao contador **só** `{ postId, network }`, sem cookie ou identificador. O Google não repassa ao script o IP de quem acessa.
- O próprio celular guarda (no `localStorage`) quais post/rede já foram contados: cada aparelho conta **1 vez por post e por rede**.
- A página inicial mostra "X pessoas já compartilharam hoje · veja os números".
- A página pública **`/numeros/`** ("Veja os números", também no rodapé) mostra hoje e o período (hoje, 7, 30 ou 90 dias), **por rede**, **por post** e **por dia**.
- A planilha "Espalha Hoje – contador" fica no seu Google Drive: dá para abrir e ver (ou somar) os números lá também.

### Como ativar (≈5 minutos, uma vez só)

1. Acesse **https://script.google.com** (entre com a conta Google que vai guardar os números) → **Novo projeto**.
2. Apague o código que aparece, abra `contador-google/Codigo.gs` deste projeto, copie **tudo** e cole lá. Clique no disquete (**Salvar**). Se quiser, dê o nome "Espalha Hoje contador".
3. Na barra de cima, escolha a função **`configurar`** e clique em **Executar**.
   - O Google pede autorização: **Revisar permissões** → escolha sua conta → **Avançado** → **Acessar Espalha Hoje contador (não seguro)** → **Permitir**. ("Não seguro" aparece porque o script é seu e não foi verificado pelo Google.)
   - No "Registro de execução" aparece o link da planilha criada.
4. Clique em **Implantar → Nova implantação** → no ícone de engrenagem escolha **App da Web**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
   - **Implantar** → copie o **URL do app da Web** (termina em `/exec`).
5. Cole esse endereço em `data/config.json`:
   ```json
   "counter_endpoint": "https://script.google.com/macros/s/XXXXXXXX/exec"
   ```
6. Rode `npm run publicar`. O build libera esse endereço na política de segurança automaticamente.
7. `npm run conferir` deve mostrar "✔ Contador funcionando".

Para desligar o contador, deixe `"counter_endpoint": ""` e publique: somem a frase da página inicial e o link "Veja os números".

**Se mudar o código do Apps Script:** use **Implantar → Gerenciar implantações → editar (lápis) → Versão: Nova versão → Implantar**. Assim o endereço `/exec` continua o mesmo.

### Rotas

| Rota | Uso |
|---|---|
| `POST …/exec?acao=hit` | Corpo `{"postId":"2026-10-14-01","network":"whatsapp"}`. Soma 1. Só aceita posts que existem no site e as redes: whatsapp, telegram, x, threads, facebook, reddit, instagram, tiktok, kwai, nativo. |
| `GET …/exec?acao=hoje` | `{"dia":"2026-10-14","total":123}` |
| `GET …/exec?acao=numeros&dias=7` | Totais de hoje e do período, por rede, por post e por dia. |

### Limites (para saber o que esperar)

- **"pessoas" na frase da página inicial é uma aproximação:** o número soma compartilhamentos (1 por post/rede/aparelho). Quem compartilha 3 posts em 2 redes conta 6.
- O contador registra o **toque no botão** da rede, não a publicação em si.
- **É possível inflar o contador** de propósito (limpando o navegador ou chamando a rota direto). Sem identificar pessoas, isso não tem como ser evitado 100%. Use o número como termômetro.
- O Apps Script gratuito atende bem dezenas de cliques por minuto. Em picos muito grandes (milhares ao mesmo tempo), alguns cliques podem não ser contados — o compartilhamento em si nunca é afetado.
