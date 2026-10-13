// Compacta o conteúdo de dist/ em "site.zip", pronto para enviar à Hostinger
// (Gerenciador de Arquivos → public_html → Upload → Extrair).
// O zip leva o CONTEÚDO de dist/ (inclusive o .htaccess), não a pasta em si.
// Uso: npm run pacote   (faz o build e gera o zip)
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const RAIZ = path.join(__dirname, '..');
const DIST = path.join(RAIZ, 'dist');
const SAIDA = path.join(RAIZ, 'site.zip');

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

function listar(dir, base = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const rel = base ? `${base}/${e.name}` : e.name;
    return e.isDirectory() ? listar(path.join(dir, e.name), rel) : [rel];
  });
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
  console.error(`\n✖ O endereço do site está como "${ogUrl}".`);
  console.error('  Preencha "site_url" em data/config.json com o domínio do Espalha Hoje (ex.: https://espalhahoje.com.br) e rode de novo.\n');
  process.exit(1);
}

const partes = [];
const central = [];
let posicao = 0;
const { hora, data } = horaDos(new Date());

for (const rel of listar(DIST)) {
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
const mb = (fs.statSync(SAIDA).size / 1024 / 1024).toFixed(1);
console.log(`✔ ${path.basename(SAIDA)} criado (${central.length / 2} arquivos, ${mb} MB).`);
console.log('  Hostinger: Gerenciador de Arquivos → public_html → Upload do site.zip → botão direito → Extrair.');
