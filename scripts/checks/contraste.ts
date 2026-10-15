// Confere a regra de leitura: todo texto sobre shape colorido tem leitura percebida boa (APCA Lc >= 60),
// para as paletas, prioridades, cores do sistema e 3.000 cores aleatórias (as do botão "+").
// Rodar: node node_modules/tsx/dist/cli.mjs scripts/checks/contraste.ts
import { EXTRA_PALETTE, PALETTE, PRIORITY_META } from "../../src/lib/domain";
import { ACCENT_SUGGESTIONS, accentCss } from "../../src/lib/accent";
import { apca, shapeColors } from "../../src/lib/color";

let fails = 0;
const check = (color: string, where: string) => {
  const { bg, fg } = shapeColors(color);
  const lc = apca(fg, bg);
  if (lc < 60) {
    fails++;
    console.log(`✗ ${where}: ${fg} sobre ${bg} (de ${color}) Lc ${lc.toFixed(0)}`);
  }
};
for (const c of [...PALETTE, ...EXTRA_PALETTE]) check(c, "paleta");
for (const p of Object.values(PRIORITY_META)) check(p.color, "prioridade");
for (const s of ACCENT_SUGGESTIONS) {
  for (const block of accentCss(s.hex).split("}").filter(Boolean)) {
    const accent = /--accent:(#[0-9a-f]{6})/i.exec(block)?.[1];
    const ink = /--accent-ink:(#[0-9a-f]{6})/i.exec(block)?.[1];
    if (accent && ink && apca(ink, accent) < 60) {
      fails++;
      console.log(`✗ cor do sistema ${s.name}: ${ink} sobre ${accent} Lc ${apca(ink, accent).toFixed(0)}`);
    }
  }
}
let rnd = 0;
for (let i = 0; i < 3000; i++) {
  const hex = "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
  const { bg, fg } = shapeColors(hex);
  if (apca(fg, bg) < 60) rnd++;
}
if (rnd) {
  fails += rnd;
  console.log(`✗ ${rnd} cores aleatórias sem leitura`);
}
console.log(fails ? `\n${fails} combinações sem leitura` : "✓ todas as combinações com leitura boa (APCA Lc 60 ou mais)");
process.exit(fails ? 1 : 0);
