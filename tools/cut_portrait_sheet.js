'use strict';
// Découpe une planche de portraits (plusieurs expressions sur une même image, fond blanc) et écrit un
// PNG par portrait dans art/, prêt pour tools/build_mod_portraits.js.
//
// Pour chaque portrait : la grille de la planche est repérée toute seule (bandes de lignes et de
// colonnes qui ne sont pas du fond blanc), le fond blanc relié aux bords est retiré (le blanc des
// yeux, entouré de traits sombres, reste), puis le portrait est ALIGNÉ sur le cadrage d'une image de
// référence (neutre.png) : même distance entre les yeux (donc même taille de visage), mêmes yeux au
// même endroit horizontalement, buste calé en bas du cadre comme dans une bulle. Un portrait aux yeux
// fermés prend la position médiane des autres.
//
// Usage :
//   node tools/cut_portrait_sheet.js <dossier-du-mod> <planche.png> --names a,b,c,d,e,f,g,h
//        [--reference art/neutre.png] [--scale 0.5] [--out art]
//   --names      les noms des portraits, dans l'ordre de lecture (ligne par ligne, de gauche à
//                droite) : sans accent, ce sont des identifiants du code (content, triste…)
//   --reference  l'image dont on reprend le cadrage (art/neutre.png par défaut)
//   --scale      taille des PNG écrits, en fraction de la référence (0.5 par défaut : assez fin pour
//                un portrait de 96 px, quatre fois plus léger que la taille de la référence)
//   --out        dossier d'écriture (art par défaut)
//
// La planche doit être un PNG (une planche webp s'enregistre en PNG avec Paint ou n'importe quel
// éditeur d'image). Aucune dépendance : le décodeur et l'encodeur PNG sont ceux de
// build_mod_portraits.js, dont on évalue le texte jusqu'à sa section « Ligne de commande ».
const fs = require('fs');
const path = require('path');

function loadLibrary(file) {
  const text = fs.readFileSync(file, 'utf8');
  const end = text.indexOf('// ---------- Ligne de commande ----------');
  if (end === -1) throw new Error(`marqueur « Ligne de commande » introuvable dans ${file}`);
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'process', `${text.slice(0, end)}\nmodule.exports = { decodePNG, encodePNG };`)(require, mod, mod.exports, process);
  return mod.exports;
}

// ---------- Ligne de commande ----------
const args = process.argv.slice(2);
const modDir = args.shift();
const sheetFile = args.shift();
let names = [], referenceFile = null, scale = 0.5, outDir = null;
while (args.length) {
  const a = args.shift();
  if (a === '--names') names = args.shift().split(',').map(n => n.trim()).filter(Boolean);
  else if (a === '--reference') referenceFile = args.shift();
  else if (a === '--scale') scale = Number(args.shift());
  else if (a === '--out') outDir = args.shift();
  else throw new Error(`argument inconnu : ${a}`);
}
if (!modDir || !sheetFile || names.length === 0) throw new Error('usage : <dossier-du-mod> <planche.png> --names a,b,c,... [--reference art/neutre.png] [--scale 0.5] [--out art]');
if (!(scale > 0 && scale <= 1)) throw new Error('--scale : un nombre de 0 (exclu) à 1');
referenceFile = referenceFile ?? path.join(modDir, 'art', 'neutre.png');
outDir = outDir ?? path.join(modDir, 'art');

const { decodePNG, encodePNG } = loadLibrary(path.join(__dirname, 'build_mod_portraits.js'));
const readPNG = file => {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file} n'est pas un PNG : enregistrez la planche en PNG d'abord`);
  return decodePNG(buf);
};
const sheet = readPNG(sheetFile);
const reference = readPNG(referenceFile);

// ---------- La grille de la planche ----------
// fond : blanc (les artefacts de compression laissent des pixels à 232-254) ou transparent
const isBackground = (x, y) => {
  const i = (y * sheet.w + x) * 4;
  return sheet.rgba[i + 3] < 20 || Math.min(sheet.rgba[i], sheet.rgba[i + 1], sheet.rgba[i + 2]) > 232;
};
// les segments consécutifs d'un profil (pixels non blancs) au-dessus d'un seuil, d'au moins `min` pixels
const segments = (profile, threshold, min) => {
  const out = [];
  let start = -1;
  profile.forEach((v, i) => {
    const last = i === profile.length - 1;
    if (v > threshold && start < 0) start = i;
    if ((v <= threshold || last) && start >= 0) {
      const end = v <= threshold ? i - 1 : i;
      if (end - start + 1 >= min) out.push([start, end]);
      start = -1;
    }
  });
  return out;
};

const rowProfile = Array.from({ length: sheet.h }, (_, y) => { let n = 0; for (let x = 0; x < sheet.w; x++) if (!isBackground(x, y)) n++; return n; });
const rows = segments(rowProfile, 5, 50);
const cells = [];
for (const [y0, y1] of rows) {
  const colProfile = Array.from({ length: sheet.w }, (_, x) => { let n = 0; for (let y = y0; y <= y1; y++) if (!isBackground(x, y)) n++; return n; });
  for (const [x0, x1] of segments(colProfile, 2, 50)) cells.push({ x0, x1, y0, y1 });
}
console.log(`planche ${sheet.w}x${sheet.h} : ${rows.length} ligne(s), ${cells.length} portrait(s) repéré(s)`);
if (cells.length !== names.length) {
  throw new Error(`${cells.length} portraits repérés mais ${names.length} noms donnés (--names) : vérifiez la planche (fond blanc uni, portraits séparés par du blanc)`);
}

// ---------- Un portrait : sous-image, fond retiré ----------
const cutCell = ({ x0, x1, y0, y1 }) => {
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) rgba.set(sheet.rgba.subarray(((y0 + y) * sheet.w + x0) * 4, ((y0 + y) * sheet.w + x0 + w) * 4), y * w * 4);
  return { w, h, rgba };
};

const luma = (d, i) => 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];

// Le fond est le blanc relié aux bords ; le blanc des yeux, entouré de traits sombres, reste.
function removeBackground(img) {
  const { w, h, rgba } = img;
  const bgLike = i => rgba[i + 3] < 20 || Math.min(rgba[i], rgba[i + 1], rgba[i + 2]) > 226;
  const gone = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => { const k = y * w + x; if (!gone[k] && bgLike(k * 4)) { gone[k] = 1; stack.push(k); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const k = stack.pop(), x = k % w, y = (k / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  // le liseré clair de l'anti-crénelage, resté contre le fond retiré : deux passes
  for (let pass = 0; pass < 2; pass++) {
    const next = Uint8Array.from(gone);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      if (gone[k]) continue;
      if ((gone[k - 1] || gone[k + 1] || gone[k - w] || gone[k + w]) && luma(rgba, k * 4) > 150) next[k] = 1;
    }
    gone.set(next);
  }
  for (let k = 0; k < w * h; k++) if (gone[k]) rgba[k * 4 + 3] = 0;
  return img;
}

// ---------- Repères : les iris verts et le bas du buste ----------
const isGreen = (d, i) => d[i + 3] > 128 && d[i + 1] > d[i] + 25 && d[i + 1] > d[i + 2];

function findEyes(img, yMin, yMax) {
  const sum = [{ x: 0, y: 0, n: 0 }, { x: 0, y: 0, n: 0 }];
  for (let y = Math.floor(yMin); y < Math.ceil(yMax); y++) for (let x = 0; x < img.w; x++) {
    if (isGreen(img.rgba, (y * img.w + x) * 4)) { const e = sum[x < img.w / 2 ? 0 : 1]; e.x += x; e.y += y; e.n++; }
  }
  if (sum[0].n < 20 || sum[1].n < 20) return null;
  const [l, r] = sum.map(e => ({ x: e.x / e.n, y: e.y / e.n }));
  return { mid: { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 }, dist: Math.hypot(r.x - l.x, r.y - l.y) };
}

const bottomOf = img => {
  for (let y = img.h - 1; y >= 0; y--) for (let x = 0; x < img.w; x++) if (img.rgba[(y * img.w + x) * 4 + 3] > 128) return y;
  return img.h - 1;
};

const ref = findEyes(reference, reference.h * 0.25, reference.h * 0.65);
if (!ref) throw new Error(`les yeux verts de la référence (${referenceFile}) n'ont pas été repérés`);
console.log(`référence ${reference.w}x${reference.h} : yeux au milieu (${ref.mid.x.toFixed(1)}, ${ref.mid.y.toFixed(1)}), écart ${ref.dist.toFixed(1)}`);

const portraits = cells.map((cell, i) => {
  const img = removeBackground(cutCell(cell));
  return { name: names[i], img, eyes: findEyes(img, img.h * 0.2, img.h * 0.75), bottom: bottomOf(img) };
});

const median = list => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
const seen = portraits.filter(p => p.eyes);
if (seen.length < 2) throw new Error('moins de deux portraits aux yeux verts repérés : impossible de calculer l\'échelle commune');
const factor = median(seen.map(p => ref.dist / p.eyes.dist)); // échelle commune planche -> référence
const midX = median(seen.map(p => p.eyes.mid.x));
console.log(`échelle commune : ${factor.toFixed(3)} (sur ${seen.length} portraits aux yeux repérés)`);

// ---------- Rendu : échelle commune, yeux alignés horizontalement, buste calé en bas ----------
const outW = Math.round(reference.w * scale), outH = Math.round(reference.h * scale);
function render(p) {
  const mx = p.eyes ? p.eyes.mid.x : midX;
  const { w, h, rgba } = p.img;
  const out = new Uint8Array(outW * outH * 4);
  // interpolation bilinéaire, couleurs pondérées par l'opacité
  const sample = (u, v) => {
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    let r = 0, g = 0, b = 0, a = 0;
    for (const [dx, dy, wt] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
      const x = x0 + dx, y = y0 + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const i = (y * w + x) * 4, al = rgba[i + 3] / 255;
      r += rgba[i] * al * wt; g += rgba[i + 1] * al * wt; b += rgba[i + 2] * al * wt; a += al * wt;
    }
    return a > 0 ? [r / a, g / a, b / a, a * 255] : [0, 0, 0, 0];
  };
  for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
    // le pixel (x, y) de la sortie, ramené aux coordonnées de la référence
    const rx = (x + 0.5) / scale - 0.5, ry = (y + 0.5) / scale - 0.5;
    const [r, g, b, a] = sample(mx + (rx - ref.mid.x) / factor, p.bottom - (reference.h - 1 - ry) / factor);
    const o = (y * outW + x) * 4;
    out[o] = Math.round(r); out[o + 1] = Math.round(g); out[o + 2] = Math.round(b); out[o + 3] = Math.round(a);
  }
  return out;
}

fs.mkdirSync(outDir, { recursive: true });
for (const p of portraits) {
  const file = path.join(outDir, `${p.name}.png`);
  fs.writeFileSync(file, encodePNG(outW, outH, render(p)));
  console.log(`${p.name.padEnd(10)} écrit : ${file}${p.eyes ? '' : ' (yeux non repérés : position médiane)'}`);
}
console.log(`${portraits.length} PNG de ${outW}x${outH}. Étape suivante : tools/build_mod_portraits.js avec ces images.`);
