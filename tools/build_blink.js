'use strict';
// Dessine les paupières du clignement du portrait pensif et écrit hooks/eyelids.ts.
//
// Le portrait (hooks/portrait.ts) est un SVG de rectangles. Ce script le rebâtit en grille 96x103,
// puis, pour chaque œil, prépare deux couches de rectangles à poser PAR-DESSUS le portrait :
//   - mi-clos : le haut de l'œil en couleur de peau, un trait de cils au bord de la paupière ;
//   - clos    : tout l'œil en couleur de peau, un trait de cils en arc.
// hooks/blink.ts les anime (ouvert, clos, mi-clos, ouvert). Le portrait lui-même n'est pas modifié.
//
// Usage :
//   node tools/build_blink.js <dossier-du-mod> [--preview F.png]
//   --preview  écrit une planche agrandie 10x : yeux ouverts, mi-clos, clos (pour juger le dessin)
//
// Les yeux sont relevés à la main sur un aperçu agrandi : le repérage par la couleur verte seule se
// trompait (un reflet vert du sourcil agrandissait la zone). Si le portrait change, refaire ce
// relevé dans EYES (colonnes x0-x1 et rangées y0-y1 de la grille 96x103).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const W = 96, H = 103;
// `mid` : rangée du bord de la paupière à mi-clos ; `line` : rangée du trait des yeux clos.
// L'œil droit est un peu plus haut que le gauche (le visage est de trois quarts).
const EYES = [
  { x0: 32, x1: 45, y0: 46, y1: 53, mid: 50, line: 51 },
  { x0: 55, x1: 67, y0: 43, y1: 52, mid: 48, line: 49 },
];

const args = process.argv.slice(2);
const modDir = args.shift();
let previewFile = null;
while (args.length) {
  const a = args.shift();
  if (a === '--preview') previewFile = args.shift();
  else throw new Error(`argument inconnu : ${a}`);
}
if (!modDir) throw new Error('usage : <dossier-du-mod> [--preview F.png]');

// ---------- La grille du portrait pensif, rebâtie d'après son SVG ----------
const text = fs.readFileSync(path.join(modDir, 'hooks', 'portrait.ts'), 'utf8');
const line = text.split('\n').find(l => l.trimStart().startsWith('reflechi:'));
if (!line) throw new Error("hooks/portrait.ts n'a pas d'expression « reflechi »");
const svg = line.slice(line.indexOf("'") + 1, line.lastIndexOf("'"));
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const grid = Array.from({ length: H }, () => Array(W).fill(null));
for (const [, fill, d] of svg.matchAll(/<path fill="(#[0-9a-f]{6})" d="([^"]+)"/g)) {
  for (const [, x, y, w, h] of d.matchAll(/M(\d+) (\d+)h(\d+)v(\d+)h-\d+z/g)) {
    for (let j = +y; j < +y + +h; j++) for (let i = +x; i < +x + +w; i++) grid[j][i] = fill;
  }
}

const isSkin = c => c && (([r, g, b]) => r > 200 && g > 150 && b > 100 && r > b + 30)(hex(c));
const lum = c => (([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b)(hex(c));
const mode = list => {
  const count = new Map();
  for (const c of list) count.set(c, (count.get(c) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};

// ---------- Les deux couches de paupières ----------
const layers = { half: [], closed: [] };
for (const eye of EYES) {
  const { x0, x1, y0, y1 } = eye;
  const ring = [], darks = [];
  for (let y = y0 - 4; y <= y1 + 4; y++) for (let x = x0 - 4; x <= x1 + 4; x++) if (isSkin(grid[y]?.[x])) ring.push(grid[y][x]);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (grid[y]?.[x] && lum(grid[y][x]) < 70) darks.push(grid[y][x]);
  const skin = mode(ring), dark = mode(darks);
  if (!skin || !dark) throw new Error(`couleurs de l'œil x ${x0}-${x1} introuvables : relever à nouveau EYES`);

  // clos : tout l'œil en peau, un trait de cils en arc (milieu plus bas, extrémités une rangée plus haut)
  layers.closed.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, fill: skin });
  layers.closed.push({ x: x0 + 1, y: eye.line, w: x1 - x0 - 1, h: 1, fill: dark });
  layers.closed.push({ x: x0, y: eye.line - 1, w: 1, h: 1, fill: dark });
  layers.closed.push({ x: x1, y: eye.line - 1, w: 1, h: 1, fill: dark });

  // mi-clos : le haut de l'œil en peau, un trait de cils au bord de la paupière, le bas de l'œil visible
  layers.half.push({ x: x0, y: y0, w: x1 - x0 + 1, h: eye.mid - y0, fill: skin });
  layers.half.push({ x: x0, y: eye.mid, w: x1 - x0 + 1, h: 1, fill: dark });
}

const fragment = rects => rects.map(r => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${r.fill}"/>`).join('');
const out = `// Généré par tools/build_blink.js : ne pas éditer à la main.
// Paupières à poser par-dessus le portrait pensif (grille ${W}x${H}) : voir hooks/blink.ts.
export const EYELIDS_HALF = '${fragment(layers.half)}'

export const EYELIDS_CLOSED = '${fragment(layers.closed)}'
`;
fs.writeFileSync(path.join(modDir, 'hooks', 'eyelids.ts'), out);
console.log(`eyelids.ts écrit : ${layers.half.length} rectangles mi-clos, ${layers.closed.length} rectangles clos`);

// ---------- Aperçu : ouvert | mi-clos | clos, agrandi ----------
if (previewFile) {
  const xs = EYES.flatMap(e => [e.x0, e.x1]), ys = EYES.flatMap(e => [e.y0, e.y1]);
  const crop = { x: Math.min(...xs) - 4, y: Math.min(...ys) - 6, w: Math.max(...xs) - Math.min(...xs) + 9, h: Math.max(...ys) - Math.min(...ys) + 12 };
  const Z = 10, gap = 12, panelH = crop.h * Z, sheetW = crop.w * Z, sheetH = panelH * 3 + gap * 2;
  const pix = new Uint8Array(sheetW * sheetH * 4).fill(255);
  const paint = (px, py, color, offsetY) => {
    const [r, g, b] = hex(color);
    for (let j = 0; j < Z; j++) for (let i = 0; i < Z; i++) {
      const o = ((offsetY + py * Z + j) * sheetW + px * Z + i) * 4;
      pix[o] = r; pix[o + 1] = g; pix[o + 2] = b; pix[o + 3] = 255;
    }
  };
  [[], layers.half, layers.closed].forEach((layer, index) => {
    const offsetY = index * (panelH + gap);
    for (let y = 0; y < crop.h; y++) for (let x = 0; x < crop.w; x++) {
      const c = grid[crop.y + y]?.[crop.x + x];
      if (c) paint(x, y, c, offsetY);
    }
    for (const r of layer) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const px = x - crop.x, py = y - crop.y;
      if (px >= 0 && py >= 0 && px < crop.w && py < crop.h) paint(px, py, r.fill, offsetY);
    }
  });
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const chunkBuf = Buffer.alloc(8 + data.length + 4);
    chunkBuf.writeUInt32BE(data.length, 0); body.copy(chunkBuf, 4); chunkBuf.writeUInt32BE(crc32(body), 8 + data.length);
    return chunkBuf;
  };
  const raw = Buffer.alloc((sheetW * 4 + 1) * sheetH);
  for (let y = 0; y < sheetH; y++) Buffer.from(pix.buffer, y * sheetW * 4, sheetW * 4).copy(raw, y * (sheetW * 4 + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(sheetW, 0); ihdr.writeUInt32BE(sheetH, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(previewFile, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  console.log(`aperçu écrit : ${previewFile} (${sheetW}x${sheetH})`);
}
