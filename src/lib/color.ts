// Leitura de texto sobre shapes coloridos, decidida pela PERCEPÇÃO (APCA), não só pela razão de contraste WCAG.
// Motivo: pela WCAG, preto sobre rosa/laranja/vermelho "passa", mas o olho lê mal; o APCA mede a leitura real
// e prefere branco nessas cores médias e saturadas.
//
// shapeColors(cor) devolve { bg, fg }:
//   1. branco, se o branco já lê bem (Lc >= 60);
//   2. quase preto, se a cor é clara e o escuro lê muito bem (Lc >= 70);
//   3. senão, escurece o fundo aos poucos até o branco ler bem (a cor muda só o necessário).

const WHITE = "#FFFFFF";
const DARK = "#050505";
const WHITE_MIN = 60; // texto pequeno em negrito (etiquetas, botões)
const DARK_MIN = 70;

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Luminância do APCA (sRGB simples com expoente 2,4 e ajuste de pretos). */
function apcaY(hex: string) {
  const [r, g, b] = channels(hex).map((v) => (v / 255) ** 2.4);
  let y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  if (y < 0.022) y += (0.022 - y) ** 1.414;
  return y;
}

/** Contraste perceptual APCA (Lc, valor absoluto de 0 a ~106). */
export function apca(text: string, bg: string) {
  const yt = apcaY(text);
  const yb = apcaY(bg);
  let sapc: number;
  if (yb > yt) {
    sapc = (yb ** 0.56 - yt ** 0.57) * 1.14; // texto escuro sobre fundo claro
    return sapc < 0.1 ? 0 : (sapc - 0.027) * 100;
  }
  sapc = (yb ** 0.65 - yt ** 0.62) * 1.14; // texto claro sobre fundo escuro
  return sapc > -0.1 ? 0 : Math.abs((sapc + 0.027) * 100);
}

function mixBlack(hex: string, t: number) {
  const [r, g, b] = channels(hex).map((v) => Math.round(v * (1 - t)));
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

const cache = new Map<string, { bg: string; fg: string }>();

/** Cores de um shape com texto/ícone: fundo (às vezes levemente mais escuro) e cor do texto com leitura garantida. */
export function shapeColors(color: string): { bg: string; fg: string } {
  const hex = /^#?[0-9a-f]{6}$/i.test(color) ? (color.startsWith("#") ? color : `#${color}`).toUpperCase() : "#5B7F7A";
  const hit = cache.get(hex);
  if (hit) return hit;
  let out: { bg: string; fg: string };
  const white = apca(WHITE, hex);
  const dark = apca(DARK, hex);
  if (white >= WHITE_MIN) out = { bg: hex, fg: WHITE };
  else if (dark >= DARK_MIN && dark > white) out = { bg: hex, fg: DARK };
  else {
    let bg = hex;
    for (let t = 0.04; t <= 0.6 && apca(WHITE, bg) < WHITE_MIN; t += 0.04) bg = mixBlack(hex, t);
    out = { bg, fg: WHITE };
  }
  cache.set(hex, out);
  return out;
}

/** Só a cor do texto (para ícones sobre a cor original, quando o fundo não pode mudar). */
export function readableOn(color: string) {
  const white = apca(WHITE, color);
  const dark = apca(DARK, color);
  return white >= WHITE_MIN || white >= dark ? WHITE : DARK;
}
