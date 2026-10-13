// Compacta o conteúdo de dist/ em "site.zip", pronto para enviar à Hostinger
// (Gerenciador de Arquivos → public_html → Upload → Extrair).
// O zip leva o CONTEÚDO de dist/ (inclusive o .htaccess), não a pasta em si.
// Uso: npm run pacote                 (faz o build e gera o zip com o que falta ou mudou no servidor)
//      npm run pacote -- --completo    (zip com o site inteiro, sem conferir o servidor)
//
// Sem --completo, o pacote confere o site no ar e inclui tudo o que estiver faltando lá
// (ex.: se a public_html foi apagada) + o que mudou desde o último pacote.
//
// O registro do que já foi empacotado fica em .pacote-enviado.json (não vai para o site).
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { listar, faltandoNoServidor } = require('./lib/servidor');

const RAIZ = path.join(__dirname, '..');
const DIST = path.join(RAIZ, 'dist');
const SAIDA = path.join(RAIZ, 'site.zip');
const REGISTRO = path.join(RAIZ, '.pacote-enviado.json');
const COMPLETO = process.argv.includes('--completo');

// CRC-32 (exigido pelo formato zip).
const TABELA = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABELA[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Data/hora no formato do DOS, usado pelo zip.
function horaDos(d) {
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    data: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ não existe. Rode "npm run build" antes.');
  process.exit(1);
}

// Sem o domínio certo, as prévias dos links no WhatsApp/Facebook ficariam quebradas.
const ogUrl = (/og:url" content="([^"]*)"/.exec(fs.readFileSync(path.join(DIST, 'index.html'), 'utf8')) || [])[1] || '';
if (/localhost|podeespalhar\.com\.br/.test(ogUrl)) {
  console.log(`\nAinda não sei o endereço do Espalha Hoje (está como "${ogUrl}").`);
  console.log('Ele aparece no hPanel da Hostinger, em "Sites", depois que o site é criado.');
  console.log('Exemplo: https://palavra-aleatoria.hostingersite.com\n');
  if (!process.stdin.isTTY) {
    console.error('✖ Preencha "site_url" em data/config.json e rode de novo.\n');
    process.exit(1);
  }
  perguntarEndereco();
  return; // o resto roda de novo depois que o endereço for salvo
}

// Pergunta o endereço, salva em data/config.json, refaz o build e o pacote.
async function perguntarEndereco() {
  const readline = require('readline/promises');
  const { spawnSync } = require('child_process');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let url;
  for (;;) {
    url = (await rl.question('Cole aqui o endereço do site: ')).trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(url) && /^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(url)) url = 'https://' + url;
    if (/^https?:\/\/[\w.-]+\.[a-z]{2,}/i.test(url) && !/podeespalhar\.com\.br/i.test(url)) break;
    console.log('  → Endereço inválido. Copie do hPanel, ex.: https://palavra-aleatoria.hostingersite.com');
  }
  rl.close();
  const arqConfig = path.join(RAIZ, 'data/config.json');
  const config = JSON.parse(fs.readFileSync(arqConfig, 'utf8'));
  config.site_url = url;
  fs.writeFileSync(arqConfig, JSON.stringify(config, null, 2) + '\n');
  console.log(`✔ Endereço salvo em data/config.json: ${url}\n`);
  const b = spawnSync(process.execPath, [path.join(RAIZ, 'build.js')], { stdio: 'inherit' });
  if (b.status !== 0) process.exit(b.status || 1);
  const p = spawnSync(process.execPath, [__filename, ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(p.status || 0);
}

(async () => {
const crypto = require('crypto');
const site = ogUrl.replace(/\/+$/, '');
const anterior = !COMPLETO && fs.existsSync(REGISTRO) ? JSON.parse(fs.readFileSync(REGISTRO, 'utf8')) : {};
const atual = {};
const todos = listar(DIST);
todos.forEach((rel) => {
  atual[rel] = crypto.createHash('sha1').update(fs.readFileSync(path.join(DIST, rel))).digest('hex');
});

let arquivos;
let resumo;
if (COMPLETO) {
  arquivos = todos;
  resumo = 'site completo';
} else {
  process.stdout.write(`Conferindo o que já está em ${site}… `);
  const faltando = await faltandoNoServidor(site, DIST, todos);
  if (faltando === null) {
    console.log('sem acesso ao site.');
    // Sem conferir o servidor, o seguro é mandar tudo.
    arquivos = todos;
    resumo = 'site completo (não deu para conferir o servidor)';
  } else {
    console.log(`${faltando.size} arquivo(s) faltando ou diferentes no servidor.`);
    // Faltando no servidor + alterados desde o último pacote + arquivos ocultos (.htaccess).
    arquivos = todos.filter((rel) => faltando.has(rel) || anterior[rel] !== atual[rel] || path.basename(rel).startsWith('.'));
    resumo = 'o que falta ou mudou no servidor';
    const midias = [...faltando].filter((r) => r.startsWith('media/'));
    if (midias.length) console.log(`  Inclui ${midias.length} mídia(s) que não estão no servidor (ex.: ${midias[0]}).`);
  }
}

const partes = [];
const central = [];
let posicao = 0;
const { hora, data } = horaDos(new Date());

for (const rel of arquivos) {
  const bruto = fs.readFileSync(path.join(DIST, rel));
  const comprimido = zlib.deflateRawSync(bruto, { level: 9 });
  // Imagens/vídeos já são comprimidos: guarda sem compressão se não ganhar nada.
  const usarDeflate = comprimido.length < bruto.length;
  const dados = usarDeflate ? comprimido : bruto;
  const nome = Buffer.from(rel, 'utf8');
  const crc = crc32(bruto);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
  local.writeUInt16LE(usarDeflate ? 8 : 0, 8);
  local.writeUInt16LE(hora, 10);
  local.writeUInt16LE(data, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(dados.length, 18);
  local.writeUInt32LE(bruto.length, 22);
  local.writeUInt16LE(nome.length, 26);
  partes.push(local, nome, dados);

  const cab = Buffer.alloc(46);
  cab.writeUInt32LE(0x02014b50, 0);
  cab.writeUInt16LE(20, 4);
  cab.writeUInt16LE(20, 6);
  cab.writeUInt16LE(0x0800, 8);
  cab.writeUInt16LE(usarDeflate ? 8 : 0, 10);
  cab.writeUInt16LE(hora, 12);
  cab.writeUInt16LE(data, 14);
  cab.writeUInt32LE(crc, 16);
  cab.writeUInt32LE(dados.length, 20);
  cab.writeUInt32LE(bruto.length, 24);
  cab.writeUInt16LE(nome.length, 28);
  cab.writeUInt32LE(posicao, 42);
  central.push(cab, nome);

  posicao += local.length + nome.length + dados.length;
}

const tamanhoCentral = central.reduce((s, b) => s + b.length, 0);
const fim = Buffer.alloc(22);
fim.writeUInt32LE(0x06054b50, 0);
fim.writeUInt16LE(central.length / 2, 8);
fim.writeUInt16LE(central.length / 2, 10);
fim.writeUInt32LE(tamanhoCentral, 12);
fim.writeUInt32LE(posicao, 16);

fs.writeFileSync(SAIDA, Buffer.concat([...partes, ...central, fim]));
fs.writeFileSync(REGISTRO, JSON.stringify(atual, null, 1));
const mb = (fs.statSync(SAIDA).size / 1024 / 1024).toFixed(1);
console.log(`✔ ${path.basename(SAIDA)} criado: ${central.length / 2} arquivos, ${mb} MB (${resumo}).`);
console.log('  Hostinger: Gerenciador de Arquivos → public_html → Upload do site.zip → botão direito → Extrair.');
console.log('  ⚠ NÃO apague os arquivos da public_html antes de extrair: o zip só traz o que falta ou mudou.');
console.log('  Depois de extrair, rode "npm run conferir" para ver se está tudo no ar.');
})().catch((e) => {
  console.error('✖ ' + e.message);
  process.exit(1);
});
