import { cn } from "@/lib/cn";

export const BRAND = "Dmanda";

// O "D" da marca: um D sólido com três colunas vazadas de alturas diferentes (um quadro andando).
// Desenhado em curvas (fill-rule evenodd), sem depender de fonte.
// As colunas começam em y=16,6: com o D na altura das letras altas (0,71 em), é a linha do topo do "m"
// (altura-x 0,546 em), então o miolo do D alinha com o m.
const D_OUTER = "M8 0H28A36 36 0 0 1 28 72H8A8 8 0 0 1 0 64V8A8 8 0 0 1 8 0Z";
const D_COLUMNS =
  "M16.5 16.6A4.5 4.5 0 0 1 21 21.1V55A4.5 4.5 0 0 1 12 55V21.1A4.5 4.5 0 0 1 16.5 16.6Z" +
  "M30.5 16.6A4.5 4.5 0 0 1 35 21.1V43A4.5 4.5 0 0 1 26 43V21.1A4.5 4.5 0 0 1 30.5 16.6Z" +
  "M44.5 16.6A4.5 4.5 0 0 1 49 21.1V31A4.5 4.5 0 0 1 40 31V21.1A4.5 4.5 0 0 1 44.5 16.6Z";
const D_PATH = D_OUTER + D_COLUMNS;

export function DGlyph({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 64 72" className={cn("shrink-0", className)} style={style} aria-hidden>
      <path d={D_PATH} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

/** Ícone quadrado: bloco verde-água com o D escuro e as três colunas sempre brancas. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center bg-brand", className)}
      style={{ width: size, height: size, borderRadius: size * 0.31 }}
      aria-hidden
    >
      <svg viewBox="0 0 64 72" style={{ width: size * 0.5, height: size * 0.5625 }} className="shrink-0">
        <path d={D_OUTER} fill="var(--brand-ink)" />
        <path d={D_COLUMNS} fill="#FFFFFF" />
      </svg>
    </span>
  );
}

/**
 * Logotipo: o D verde-água + "manda". O D é um pouco maior que as letras altas da Geist (0,78 em contra 0,71)
 * e desce 0,09 em: o centro fica levemente acima do centro do "m". O respiro até o m é um pouco maior que o
 * espaço entre as letras.
 */
export function Logo({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline font-semibold tracking-tight whitespace-nowrap", className)} style={{ fontSize: size }} aria-label={BRAND}>
      <DGlyph className="mr-[0.06em] text-brand-strong" style={{ height: "0.78em", width: "0.693em", transform: "translateY(0.09em)" }} />
      <span aria-hidden>manda</span>
    </span>
  );
}
