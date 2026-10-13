// Funções de mídia compartilhadas entre o build, o gerador de exemplos e o `novo-post`.
// Usa a biblioteca `sharp` para imagens e, se estiver instalado, o `ffmpeg` para vídeos.
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// O sharp é carregado de forma "preguiçosa": se não estiver instalado,
// o build continua funcionando (só não gera thumbs/ícones/imagens OG).
let sharpCache;
function carregarSharp() {
  if (sharpCache !== undefined) return sharpCache;
  try {
    sharpCache = require('sharp');
  } catch (e) {
    sharpCache = null;
  }
  return sharpCache;
}

const EXT_VIDEO = ['.mp4', '.webm', '.mov', '.m4v'];
const EXT_IMAGEM = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'];

function tipoDaMidia(arquivo) {
  const ext = path.extname(arquivo).toLowerCase();
  if (EXT_VIDEO.includes(ext)) return 'video';
  if (EXT_IMAGEM.includes(ext)) return 'image';
  return null;
}

// Escapa texto para colocar dentro de um SVG.
function escXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

// Monta um SVG simples de cartaz (usado nos exemplos e como thumb de vídeo sem ffmpeg).
function svgCartaz({ largura = 1080, altura = 1350, cor = '#C4122F', titulo = '', subtitulo = '' }) {
  const linhas = quebrarTexto(titulo, 16);
  const tamanho = 92;
  const inicioY = altura / 2 - ((linhas.length - 1) * tamanho * 1.15) / 2;
  const textos = linhas
    .map((l, i) => `<text x="50%" y="${inicioY + i * tamanho * 1.15}" font-size="${tamanho}" font-weight="800" text-anchor="middle" fill="#fff" font-family="Arial, Helvetica, sans-serif">${escXml(l)}</text>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}">
  <rect width="100%" height="100%" fill="${cor}"/>
  <circle cx="${largura * 0.85}" cy="${altura * 0.12}" r="${largura * 0.28}" fill="#fff" fill-opacity="0.10"/>
  <circle cx="${largura * 0.1}" cy="${altura * 0.92}" r="${largura * 0.35}" fill="#000" fill-opacity="0.12"/>
  ${textos}
  <text x="50%" y="${altura - 120}" font-size="44" text-anchor="middle" fill="#fff" fill-opacity="0.9" font-family="Arial, Helvetica, sans-serif">${escXml(subtitulo)}</text>
</svg>`;
}

// Quebra um texto em linhas de no máximo `max` caracteres (por palavra).
function quebrarTexto(texto, max) {
  const palavras = String(texto).split(/\s+/).filter(Boolean);
  const linhas = [];
  let atual = '';
  for (const p of palavras) {
    if ((atual + ' ' + p).trim().length > max && atual) {
      linhas.push(atual);
      atual = p;
    } else {
      atual = (atual + ' ' + p).trim();
    }
  }
  if (atual) linhas.push(atual);
  return linhas.slice(0, 5);
}

// Gera um JPG a partir de um cartaz SVG. Sem sharp, grava o próprio SVG.
async function gerarCartaz(destino, opcoes) {
  const svg = svgCartaz(opcoes);
  const sharp = carregarSharp();
  if (!sharp) {
    const destinoSvg = destino.replace(/\.\w+$/, '.svg');
    fs.writeFileSync(destinoSvg, svg);
    return destinoSvg;
  }
  await sharp(Buffer.from(svg)).jpeg({ quality: 85, mozjpeg: true }).toFile(destino);
  return destino;
}

// Thumb leve (720px de largura, JPG) a partir de uma imagem.
async function thumbDeImagem(origem, destino) {
  const sharp = carregarSharp();
  if (!sharp) {
    fs.copyFileSync(origem, destino);
    return destino;
  }
  await sharp(origem).rotate().resize({ width: 720, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toFile(destino);
  return destino;
}

// Verifica se o ffmpeg está disponível no PATH.
function temFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  return r.status === 0;
}

// Thumb de vídeo: tenta extrair um quadro com ffmpeg; senão, gera um cartaz.
async function thumbDeVideo(origem, destino, { titulo = 'Vídeo', cor } = {}) {
  if (temFfmpeg()) {
    const r = spawnSync('ffmpeg', ['-y', '-ss', '1', '-i', origem, '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '4', destino], { stdio: 'ignore' });
    if (r.status === 0 && fs.existsSync(destino)) return destino;
  }
  return gerarCartaz(destino, { largura: 720, altura: 1280, cor, titulo, subtitulo: '▶ Vídeo' });
}

module.exports = { carregarSharp, tipoDaMidia, svgCartaz, gerarCartaz, thumbDeImagem, thumbDeVideo, temFfmpeg, EXT_VIDEO, EXT_IMAGEM };
