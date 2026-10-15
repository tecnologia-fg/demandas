// Cor do sistema escolhida por pessoa: a partir de uma cor só, calcula os tons de destaque com contraste
// garantido (texto sobre o destaque, texto/links no destaque sobre fundo claro e escuro, manchas do fundo).
// Usado no servidor (layout) e no navegador (prévia ao vivo no perfil).

import { shapeColors } from "./color";

export const DEFAULT_ACCENT = "#19C9A9";

export const ACCENT_SUGGESTIONS: { name: string; hex: string }[] = [
  { name: "Verde-água", hex: "#19C9A9" },
  { name: "Azul", hex: "#2F6FDB" },
  { name: "Índigo", hex: "#5B4FD6" },
  { name: "Violeta", hex: "#8E44AD" },
  { name: "Rosa", hex: "#E0457B" },
  { name: "Coral", hex: "#F0654A" },
  { name: "Laranja", hex: "#F28C28" },
  { name: "Âmbar", hex: "#F2B705" },
  { name: "Verde", hex: "#22A35A" },
  { name: "Grafite", hex: "#3F4651" },
];

type RGB = [number, number, number];

function parse(hex: string): RGB {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex([r, g, b]: RGB) {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}
function mix(a: string, b: string, t: number) {
  const x = parse(a);
  const y = parse(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}
function lum(hex: string) {
  const ch = parse(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
export function contrast(a: string, b: string) {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
/** Escurece (ou clareia) até ter o contraste pedido com o fundo. */
function reach(hex: string, bg: string, target: number, toward: string) {
  let c = hex;
  for (let i = 0; i < 20 && contrast(c, bg) < target; i++) c = mix(c, toward, 0.08);
  return c;
}

export function isHex(v: string | null | undefined): v is string {
  return !!v && /^#[0-9a-fA-F]{6}$/.test(v);
}

/** CSS que sobrescreve os tokens de destaque do tema claro e do escuro. */
export function accentCss(hex: string | null | undefined) {
  if (!isHex(hex) || hex.toLowerCase() === DEFAULT_ACCENT.toLowerCase()) return "";
  // botão/item ativo: fundo e texto com leitura garantida (src/lib/color.ts)
  const lightShape = shapeColors(hex);
  const light = {
    "--accent": lightShape.bg,
    "--accent-hover": mix(lightShape.bg, "#000000", 0.1),
    "--accent-ink": lightShape.fg,
    "--accent-strong": reach(hex, "#ffffff", 4.5, "#000000"),
    "--blob-1": mix(hex, "#ffffff", 0.5),
    "--blob-4": mix(hex, "#ffffff", 0.65),
  };
  const darkShape = shapeColors(reach(hex, "#121c1b", 3, "#ffffff"));
  const dark = {
    "--accent": darkShape.bg,
    "--accent-hover": mix(darkShape.bg, "#ffffff", 0.12),
    "--accent-ink": darkShape.fg,
    "--accent-strong": reach(hex, "#121c1b", 4.5, "#ffffff"),
    "--blob-1": mix(hex, "#000000", 0.45),
    "--blob-4": mix(hex, "#000000", 0.6),
  };
  const decl = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${k}:${v};`).join("");
  return `:root{${decl(light)}}:root[data-theme="dark"]{${decl(dark)}}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${decl(dark)}}}`;
}
