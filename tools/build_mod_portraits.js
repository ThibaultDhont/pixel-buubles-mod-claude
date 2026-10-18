'use strict';
// Convertit des portraits PNG (de n'importe quelle taille) en dessins vectoriels pixel art
// pour le mod, et réécrit hooks/portrait.ts.
//
// Pour chaque image : réduction à la largeur voulue, palette commune réduite à N couleurs,
// puis un rectangle par suite de pixels de même couleur (fusionnés verticalement). Le résultat
// est net à toute taille et reste sous la limite de 131072 caractères par SVG de Desktop.
//
// Usage :
//   node tools/build_mod_portraits.js <dossier-du-mod> [options] <expression>=<portrait.png> ...
// Options :
//   --width N       largeur de sortie en pixels (96 par défaut) ; la hauteur suit la première image
//   --colors N      taille de la palette commune (24 par défaut)
//   --preview F.png écrit une planche d'aperçu (agrandie 3x) pour juger le rendu
//   --inspect       décrit les images (taille, format, transparence) sans rien écrire
//
// Mode décor (image de fond de la bande), qui écrit hooks/background.ts :
//   node tools/build_mod_portraits.js <dossier-du-mod> --background <image.png>
//        [--crop x,y,l,h] [--width N] [--height N] [--scale N] [--colors N] [--preview F.png]
//   --crop    la bande de l'image à garder, en fractions de l'image source (0 à 1)
//   --width / --height   résolution d'origine du décor, en pixels (ici --width 270 par exemple)
//   --scale   facteur d'agrandissement entier pour l'affichage (3 par défaut)
//   --name    nom du fichier et des constantes (« background » par défaut : hooks/background.ts,
//             BACKGROUND ; « panel-background » : hooks/panel-background.ts, PANEL_BACKGROUND)
//
// Aucune dépendance : décodeur et encodeur PNG écrits ici, zlib de Node.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------- PNG : lecture ----------
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('ce fichier n\'est pas un PNG');
  let off = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0, plte = null, trns = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; interlace = data[12]; }
    else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (interlace) throw new Error('PNG entrelacé non géré : réenregistrez-le sans entrelacement');
  if (depth !== 8 && depth !== 16) throw new Error(`profondeur de ${depth} bits non gérée (8 ou 16 attendus)`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (!channels) throw new Error(`type de couleur PNG ${ctype} non géré`);
  const bytes = depth / 8;
  const bpp = channels * bytes;
  const stride = w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[y * stride + i - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + i] : 0;
      const c = y > 0 && i >= bpp ? px[(y - 1) * stride + i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + i] = v & 255;
    }
  }
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const at = y * stride + x * bpp;
      const s = (k) => px[at + k * bytes]; // octet de poids fort des échantillons de 16 bits
      const o = (y * w + x) * 4;
      let r, g, bl, al = 255;
      if (ctype === 6) { r = s(0); g = s(1); bl = s(2); al = s(3); }
      else if (ctype === 2) { r = s(0); g = s(1); bl = s(2); }
      else if (ctype === 0) { r = g = bl = s(0); }
      else if (ctype === 4) { r = g = bl = s(0); al = s(1); }
      else { const i = s(0); r = plte[i * 3]; g = plte[i * 3 + 1]; bl = plte[i * 3 + 2]; if (trns && i < trns.length) al = trns[i]; }
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = bl; rgba[o + 3] = al;
    }
  return { w, h, rgba, depth, ctype };
}

// ---------- PNG : écriture (aperçu) ----------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- Traitement ----------
// Réduction par moyenne de surface, alpha prémultiplié ; l'alpha final est tout ou rien.
function resize(img, W, H) {
  const out = new Uint8Array(W * H * 4);
  const sx = img.w / W, sy = img.h / H;
  for (let dy = 0; dy < H; dy++)
    for (let dx = 0; dx < W; dx++) {
      const x0 = dx * sx, x1 = (dx + 1) * sx, y0 = dy * sy, y1 = (dy + 1) * sy;
      let r = 0, g = 0, b = 0, a = 0, wsum = 0;
      for (let iy = Math.floor(y0); iy < Math.ceil(y1) && iy < img.h; iy++) {
        const wy = Math.min(iy + 1, y1) - Math.max(iy, y0);
        for (let ix = Math.floor(x0); ix < Math.ceil(x1) && ix < img.w; ix++) {
          const wgt = wy * (Math.min(ix + 1, x1) - Math.max(ix, x0));
          const i = (iy * img.w + ix) * 4;
          const al = img.rgba[i + 3] / 255;
          r += img.rgba[i] * al * wgt; g += img.rgba[i + 1] * al * wgt; b += img.rgba[i + 2] * al * wgt;
          a += al * wgt; wsum += wgt;
        }
      }
      const o = (dy * W + dx) * 4;
      if (wsum > 0 && a / wsum >= 0.5) {
        out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); out[o + 3] = 255;
      }
    }
  return out;
}

// Sous-image : x, y, largeur et hauteur en fractions (0 à 1) de l'image source.
function crop(img, fx, fy, fw, fh) {
  const x0 = Math.round(fx * img.w), y0 = Math.round(fy * img.h);
  const w = Math.min(img.w - x0, Math.round(fw * img.w)), h = Math.min(img.h - y0, Math.round(fh * img.h));
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) rgba.set(img.rgba.subarray(((y0 + y) * img.w + x0) * 4, ((y0 + y) * img.w + x0 + w) * 4), y * w * 4);
  return { ...img, w, h, rgba };
}

// Palette par coupe médiane sur les pixels opaques de toutes les images.
function buildPalette(images, count) {
  const pixels = [];
  for (const rgba of images) for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3]) pixels.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
  let boxes = [pixels];
  const range = (box, ch) => { let lo = 255, hi = 0; for (const p of box) { if (p[ch] < lo) lo = p[ch]; if (p[ch] > hi) hi = p[ch]; } return hi - lo; };
  while (boxes.length < count) {
    let best = -1, bestScore = 0, bestCh = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (let ch = 0; ch < 3; ch++) { const score = range(box, ch) * Math.sqrt(box.length); if (score > bestScore) { bestScore = score; best = i; bestCh = ch; } }
    });
    if (best < 0) break;
    const box = boxes[best].slice().sort((p, q) => p[bestCh] - q[bestCh]);
    const mid = box.length >> 1;
    boxes.splice(best, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes.filter((b) => b.length).map((box) => [0, 1, 2].map((ch) => Math.round(box.reduce((s, p) => s + p[ch], 0) / box.length)));
}

function indexImage(rgba, palette) {
  const idx = new Int16Array(rgba.length / 4).fill(-1);
  const cache = new Map();
  for (let i = 0; i < idx.length; i++) {
    if (!rgba[i * 4 + 3]) continue;
    const key = (rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2];
    let best = cache.get(key);
    if (best === undefined) {
      let d = Infinity;
      palette.forEach((c, k) => {
        const dr = c[0] - rgba[i * 4], dg = c[1] - rgba[i * 4 + 1], db = c[2] - rgba[i * 4 + 2];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < d) { d = dist; best = k; }
      });
      cache.set(key, best);
    }
    idx[i] = best;
  }
  return idx;
}

// Un rectangle par suite de pixels de même couleur, fusionnés d'une ligne à la suivante.
function toSvg(W, H, idx, palette, { scale = 1, preserve = '' } = {}) {
  const byColor = new Map();
  const emit = (key, start, end) => {
    const [x, n, c] = key.split(',').map(Number);
    if (!byColor.has(c)) byColor.set(c, []);
    byColor.get(c).push(`M${x} ${start}h${n}v${end - start}h-${n}z`);
  };
  let active = new Map();
  for (let y = 0; y < H; y++) {
    const next = new Map();
    let x = 0;
    while (x < W) {
      const c = idx[y * W + x];
      if (c < 0) { x++; continue; }
      let n = 1;
      while (x + n < W && idx[y * W + x + n] === c) n++;
      const key = `${x},${n},${c}`;
      next.set(key, active.has(key) ? active.get(key) : y);
      x += n;
    }
    for (const [key, start] of active) if (!next.has(key)) emit(key, start, y);
    active = next;
  }
  for (const [key, start] of active) emit(key, start, H);
  const hex = (c) => c.map((v) => v.toString(16).padStart(2, '0')).join('');
  const paths = [...byColor].map(([c, d]) => `<path fill="#${hex(palette[c])}" d="${d.join('')}"/>`).join('');
  const fit = preserve ? ` preserveAspectRatio="${preserve}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * scale}" height="${H * scale}"${fit} shape-rendering="crispEdges">${paths}</svg>`;
}

// ---------- Ligne de commande ----------
const args = process.argv.slice(2);
const modDir = args.shift();
let width = 96, colors = 24, previewFile = null, inspect = false;
let backgroundFile = null, backgroundHeight = 35, backgroundScale = 3, backgroundCrop = [0, 0, 1, 1];
let backgroundName = 'background';
const pairs = [];
while (args.length) {
  const a = args.shift();
  if (a === '--width') width = Number(args.shift());
  else if (a === '--colors') colors = Number(args.shift());
  else if (a === '--preview') previewFile = args.shift();
  else if (a === '--inspect') inspect = true;
  else if (a === '--background') backgroundFile = args.shift();
  else if (a === '--height') backgroundHeight = Number(args.shift());
  else if (a === '--scale') backgroundScale = Number(args.shift());
  else if (a === '--crop') backgroundCrop = args.shift().split(',').map(Number);
  else if (a === '--name') backgroundName = args.shift();
  else if (a.includes('=')) pairs.push(a.split(/=(.*)/s).slice(0, 2));
  else throw new Error(`argument inconnu : ${a}`);
}

// Mode décor : une bande de l'image, recadrée, réduite à basse résolution (--width x --height
// pixels d'origine), puis agrandie d'un facteur entier (--scale). Écrit hooks/background.ts.
if (backgroundFile) {
  if (!modDir) throw new Error('usage : <dossier-du-mod> --background <image.png> [--crop x,y,l,h] [--width N] [--height N] [--scale N] [--colors N]');
  const source = decodePNG(fs.readFileSync(backgroundFile));
  const piece = resize(crop(source, ...backgroundCrop), width, backgroundHeight);
  const palette = buildPalette([piece], colors);
  const idx = indexImage(piece, palette);
  const svg = toSvg(width, backgroundHeight, idx, palette, { scale: backgroundScale, preserve: 'xMinYMin slice' });
  if (svg.length > 131072) throw new Error(`décor trop gros (${svg.length} caractères, limite 131072) ; essayez --colors ou --width plus petits`);
  const displayWidth = width * backgroundScale, displayHeight = backgroundHeight * backgroundScale;
  // --name donne le nom du fichier (hooks/<nom>.ts) et celui des constantes (<NOM>, <NOM>_WIDTH...).
  const exportBase = backgroundName.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const out = `// Généré par tools/build_mod_portraits.js (mode --background) : ne pas éditer à la main.
// Image d'origine ${width}x${backgroundHeight} px, ${palette.length} couleurs, agrandie ${backgroundScale}x.
export const ${exportBase}_WIDTH = ${displayWidth}
export const ${exportBase}_HEIGHT = ${displayHeight}

export const ${exportBase} = '${svg}'
`;
  fs.mkdirSync(path.join(modDir, 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(modDir, 'hooks', `${backgroundName}.ts`), out);
  console.log(`${backgroundName}.ts écrit : ${width}x${backgroundHeight} (affiché ${displayWidth}x${displayHeight}), ${palette.length} couleurs, ${svg.length} caractères`);
  if (previewFile) {
    const W = displayWidth, H = displayHeight, sheet = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = idx[Math.floor(y / backgroundScale) * width + Math.floor(x / backgroundScale)];
        const o = (y * W + x) * 4;
        if (c >= 0) { sheet[o] = palette[c][0]; sheet[o + 1] = palette[c][1]; sheet[o + 2] = palette[c][2]; sheet[o + 3] = 255; }
      }
    fs.writeFileSync(previewFile, encodePNG(W, H, sheet));
    console.log(`aperçu écrit : ${previewFile}`);
  }
  process.exit(0);
}

if (!modDir || pairs.length === 0) throw new Error('usage : <dossier-du-mod> [options] <expression>=<portrait.png> ...');

const sources = pairs.map(([name, src]) => ({ name, src, img: decodePNG(fs.readFileSync(src)) }));

if (inspect) {
  for (const { name, src, img } of sources) {
    let clear = 0, solid = 0;
    for (let i = 3; i < img.rgba.length; i += 4) { if (img.rgba[i] === 0) clear++; else if (img.rgba[i] === 255) solid++; }
    const total = img.w * img.h;
    console.log(`${name} (${src}) : ${img.w}x${img.h}, ${img.depth} bits, type ${img.ctype}, transparent ${(100 * clear / total).toFixed(1)} %, opaque ${(100 * solid / total).toFixed(1)} %, translucide ${(100 * (total - clear - solid) / total).toFixed(1)} %`);
  }
  process.exit(0);
}

const height = Math.round(width * sources[0].img.h / sources[0].img.w);
const resized = sources.map(({ img }) => resize(img, width, height));
const palette = buildPalette(resized, colors);
const indexed = resized.map((rgba) => indexImage(rgba, palette));

const entries = sources.map(({ name }, i) => {
  const svg = toSvg(width, height, indexed[i], palette);
  if (svg.length > 131072) throw new Error(`${name} : SVG trop gros (${svg.length} caractères, limite 131072) ; essayez --colors plus petit ou --width plus petit`);
  return { name, svg };
});

const out = `// Généré par tools/build_mod_portraits.js : ne pas éditer à la main.
export const PORTRAIT_WIDTH = ${width}
export const PORTRAIT_HEIGHT = ${height}

export type Expression = ${entries.map((e) => `'${e.name}'`).join(' | ')}

export const PORTRAITS: Readonly<Record<Expression, string>> = {
${entries.map((e) => `  ${e.name}: '${e.svg}',`).join('\n')}
}
`;
fs.mkdirSync(path.join(modDir, 'hooks'), { recursive: true });
fs.writeFileSync(path.join(modDir, 'hooks', 'portrait.ts'), out);
console.log(`portrait.ts écrit : ${width}x${height}, ${palette.length} couleurs, ${entries.map((e) => `${e.name} (${e.svg.length} car.)`).join(', ')}`);

if (previewFile) {
  const scale = 3, gap = 8, PW = width * scale, PH = height * scale;
  const W = gap + entries.length * (PW + gap), H = PH + 2 * gap;
  const sheet = new Uint8Array(W * H * 4);
  for (let i = 0; i < sheet.length; i += 4) { sheet[i] = 0x28; sheet[i + 1] = 0x34; sheet[i + 2] = 0x48; sheet[i + 3] = 255; }
  indexed.forEach((idx, n) => {
    for (let y = 0; y < PH; y++)
      for (let x = 0; x < PW; x++) {
        const c = idx[Math.floor(y / scale) * width + Math.floor(x / scale)];
        if (c < 0) continue;
        const o = ((gap + y) * W + gap + n * (PW + gap) + x) * 4;
        sheet[o] = palette[c][0]; sheet[o + 1] = palette[c][1]; sheet[o + 2] = palette[c][2];
      }
  });
  fs.writeFileSync(previewFile, encodePNG(W, H, sheet));
  console.log(`aperçu écrit : ${previewFile}`);
}
