// Gera os arquivos oficiais da marca Dmanda em curvas (sem depender de fonte instalada).
// Rodar: node scripts/brand/build-logo.mjs  ->  public/marca/*.svg + src/lib/brand-metrics.json
// As medidas espelham src/components/Logo.tsx: D com 0,78 em de altura, descendo 0,09 em, respiro de 0,06 em
// até o "manda" em Geist semibold com tracking -0,025 em.
import fs from "node:fs";
import path from "node:path";
import opentype from "opentype.js";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const font = opentype.parse(fs.readFileSync(path.join(root, "node_modules/@fontsource/geist-sans/files/geist-sans-latin-600-normal.woff")).buffer);

const EM = 100; // tamanho de referência
const D = { height: 0.78, width: 0.693, drop: 0.09, gap: 0.06 };
const TRACKING = -0.025;
const D_OUTER = "M8 0H28A36 36 0 0 1 28 72H8A8 8 0 0 1 0 64V8A8 8 0 0 1 8 0Z";
const D_COLUMNS =
  "M16.5 16.6A4.5 4.5 0 0 1 21 21.1V55A4.5 4.5 0 0 1 12 55V21.1A4.5 4.5 0 0 1 16.5 16.6Z" +
  "M30.5 16.6A4.5 4.5 0 0 1 35 21.1V43A4.5 4.5 0 0 1 26 43V21.1A4.5 4.5 0 0 1 30.5 16.6Z" +
  "M44.5 16.6A4.5 4.5 0 0 1 49 21.1V31A4.5 4.5 0 0 1 40 31V21.1A4.5 4.5 0 0 1 44.5 16.6Z";
const D_PATH = D_OUTER + D_COLUMNS;

const scale = EM / font.unitsPerEm;

// Conversão própria para o "d" do SVG: o toPathData do opentype.js 2.0 solta NaN numa curva do "a".
const n = (v) => {
  if (!Number.isFinite(v)) throw new Error("coordenada inválida na fonte");
  return String(Math.round(v * 100) / 100);
};
function pathData(path) {
  return path.commands
    .map((c) => {
      if (c.type === "M" || c.type === "L") return `${c.type}${n(c.x)} ${n(c.y)}`;
      if (c.type === "C") return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
      if (c.type === "Q") return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
      return "Z";
    })
    .join("");
}
const baseline = 0;
const dTop = baseline + D.drop * EM - D.height * EM;
const dW = D.width * EM;
const dH = D.height * EM;

// "manda" letra a letra, com kerning da fonte e o tracking do app
let x = dW + D.gap * EM;
const textStart = x;
const glyphs = font.stringToGlyphs("manda");
const parts = [];
glyphs.forEach((g, i) => {
  parts.push(pathData(g.getPath(x, baseline, EM)));
  x += g.advanceWidth * scale + TRACKING * EM;
  if (glyphs[i + 1]) x += font.getKerningValue(g, glyphs[i + 1]) * scale;
});
const textPath = parts.join("");
const tb = (() => {
  const p = new opentype.Path();
  let xx = textStart;
  glyphs.forEach((g, i) => {
    p.extend(g.getPath(xx, baseline, EM));
    xx += g.advanceWidth * scale + TRACKING * EM + (glyphs[i + 1] ? font.getKerningValue(g, glyphs[i + 1]) * scale : 0);
  });
  return p.getBoundingBox();
})();

const minX = 0;
const minY = Math.min(dTop, tb.y1);
const maxX = tb.x2;
const maxY = Math.max(dTop + dH, tb.y2);
const pad = 0;
const vb = [minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2].map((n) => +n.toFixed(2));
const dTransform = `translate(${0} ${dTop.toFixed(3)}) scale(${(dW / 64).toFixed(5)} ${(dH / 72).toFixed(5)})`;

const wordmark = (dColor, textColor) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(" ")}" width="${vb[2] * 4}" height="${vb[3] * 4}">` +
  `<title>Dmanda</title>` +
  `<path transform="${dTransform}" fill="${dColor}" fill-rule="evenodd" d="${D_PATH}"/>` +
  `<path fill="${textColor}" d="${textPath}"/></svg>\n`;

// columns = cor das três colunas; null = vazadas (mostram o fundo)
const symbol = (bg, fg, columns) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512"><title>Dmanda</title>` +
  `<rect width="64" height="64" rx="20" fill="${bg}"/>` +
  `<g transform="translate(16 14) scale(.5)">` +
  (columns
    ? `<path fill="${fg}" d="${D_OUTER}"/><path fill="${columns}" d="${D_COLUMNS}"/>`
    : `<path fill="${fg}" fill-rule="evenodd" d="${D_PATH}"/>`) +
  `</g></svg>\n`;

const out = path.join(root, "public/marca");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "dmanda-logotipo.svg"), wordmark("#0B9A82", "#0F1A19"));
fs.writeFileSync(path.join(out, "dmanda-logotipo-negativo.svg"), wordmark("#2AD8B8", "#EEF7F6"));
fs.writeFileSync(path.join(out, "dmanda-logotipo-monocromatico.svg"), wordmark("#0F1A19", "#0F1A19"));
fs.writeFileSync(path.join(out, "dmanda-simbolo.svg"), symbol("#19C9A9", "#04302A", "#FFFFFF"));
fs.writeFileSync(path.join(out, "dmanda-simbolo-escuro.svg"), symbol("#0F1A19", "#2AD8B8"));

// Medidas para o desenho de construção do manual (em unidades do viewBox, EM = 100)
const metrics = {
  viewBox: vb,
  em: EM,
  baseline,
  xHeight: -font.tables.os2.sxHeight * scale,
  capHeight: -font.tables.os2.sCapHeight * scale,
  d: { x: 0, y: +dTop.toFixed(3), width: dW, height: dH },
  textStart: +textStart.toFixed(3),
  gap: D.gap * EM,
  dPath: D_PATH,
  dTransform,
  textPath,
};
fs.writeFileSync(path.join(root, "src/lib/brand-metrics.json"), JSON.stringify({ ...metrics, dOuter: D_OUTER, dColumns: D_COLUMNS }));
// ícone da aba do navegador: a mesma versão verde-água com colunas brancas
fs.writeFileSync(path.join(root, "src/app/icon.svg"), symbol("#19C9A9", "#04302A", "#FFFFFF").replace(' width="512" height="512"', "").replace("<title>Dmanda</title>", ""));
console.log("viewBox", vb.join(" "), "xHeight", metrics.xHeight.toFixed(1), "capHeight", metrics.capHeight.toFixed(1));
