"use client";

import { Check, Copy, Download, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFeedback } from "@/components/ui/overlay";
import { LogoMark } from "@/components/Logo";
import metrics from "@/lib/brand-metrics.json";

// Manual da marca Dmanda. Os desenhos usam as mesmas curvas dos arquivos de public/marca
// (gerados por scripts/brand/build-logo.mjs), então o que aparece aqui é o que se baixa.

const COLORS = [
  { name: "Verde-água", hex: "#19C9A9", ink: "#04302A", use: "Destaque: botões, item ativo, progresso" },
  { name: "Verde-água profundo", hex: "#0B9A82", ink: "#FFFFFF", use: "D do logotipo e links sobre fundo claro" },
  { name: "Verde-água noturno", hex: "#2AD8B8", ink: "#04302A", use: "Destaque e D no tema escuro" },
  { name: "Tinta", hex: "#04302A", ink: "#FFFFFF", use: "Texto e ícones sobre o verde-água" },
  { name: "Grafite", hex: "#0F1A19", ink: "#FFFFFF", use: "Texto principal e o “manda”" },
  { name: "Névoa", hex: "#EAF5F3", ink: "#0F1A19", use: "Fundo do tema claro" },
  { name: "Noite", hex: "#060F0E", ink: "#EEF7F6", use: "Fundo do tema escuro" },
];
const BLOBS = ["#7EE8D3", "#9FD6FF", "#D3F3A6", "#86E3F2"];

const FILES = [
  { file: "dmanda-logotipo.svg", label: "Logotipo", note: "Fundos claros" },
  { file: "dmanda-logotipo-negativo.svg", label: "Logotipo negativo", note: "Fundos escuros" },
  { file: "dmanda-logotipo-monocromatico.svg", label: "Logotipo monocromático", note: "Uma cor só, impressão" },
  { file: "dmanda-simbolo.svg", label: "Símbolo", note: "Ícone, avatar, favicon" },
  { file: "dmanda-simbolo-escuro.svg", label: "Símbolo escuro", note: "Sobre fundos claros neutros" },
];

const [VX, VY, VW, VH] = metrics.viewBox;

/** Logotipo desenhado a partir das curvas oficiais. */
function Wordmark({ d = "#0B9A82", text = "#0F1A19", height = 48, style }: { d?: string; text?: string; height?: number; style?: React.CSSProperties }) {
  return (
    <svg viewBox={`${VX} ${VY} ${VW} ${VH}`} style={{ height, width: (height * VW) / VH, ...style }} role="img" aria-label="Dmanda">
      <path transform={metrics.dTransform} fill={d} fillRule="evenodd" d={metrics.dPath} />
      <path fill={text} d={metrics.textPath} />
    </svg>
  );
}

function Section({ n, title, text, children }: { n: string; title: string; text?: string; children: React.ReactNode }) {
  return (
    <section className="glass grid gap-5 rounded-[26px] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-panel font-mono text-xs font-semibold text-panel-fg">{n}</span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          {text && <p className="mt-0.5 max-w-2xl text-sm text-fg-2">{text}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function BrandManual() {
  const { toast } = useFeedback();
  const copy = async (hex: string) => {
    await navigator.clipboard.writeText(hex).catch(() => {});
    toast(`${hex} copiado`);
  };

  // guias do desenho de construção (unidades do viewBox, 1 em = 100)
  // o topo do D fica 2 unidades abaixo das letras altas: uma guia só para as duas
  const guides = [
    { y: metrics.capHeight, label: "Letras altas e topo do D" },
    { y: metrics.xHeight, label: "Topo do m" },
    { y: metrics.baseline, label: "Linha de base" },
    { y: metrics.d.y + metrics.d.height, label: "Pé do D" },
  ];
  const padL = 10;
  const padR = 150;
  const mInk = metrics.textStart + 7; // lateral esquerda do m na Geist semibold (0,07 em)
  const gapY = -27;
  const padT = 14;
  const padB = 30;
  const cw = VW + padL + padR;
  const ch = VH + padT + padB;

  return (
    <div className="grid gap-4">
      {/* Abertura */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="flex min-h-[220px] items-center justify-center rounded-[26px] bg-[#EAF5F3] p-8 shadow-sm">
          <Wordmark height={64} />
        </div>
        <div className="flex min-h-[220px] items-center justify-center rounded-[26px] bg-[#060F0E] p-8 shadow-sm">
          <Wordmark d="#2AD8B8" text="#EEF7F6" height={64} />
        </div>
      </section>

      <Section n="01" title="O símbolo" text="Um D com três colunas de alturas diferentes: um quadro de demandas andando, da maior para a menor. No símbolo verde-água, o D é escuro e as colunas são sempre brancas.">
        <div className="flex flex-wrap items-end gap-5">
          {[96, 64, 40, 28, 16].map((s) => (
            <div key={s} className="grid justify-items-center gap-2">
              <LogoMark size={s} />
              <span className="font-mono text-[11px] text-fg-3">{s}px</span>
            </div>
          ))}
          <div className="grid justify-items-center gap-2">
            <span className="inline-flex size-[64px] items-center justify-center rounded-[20px] bg-[#0F1A19]">
              <svg viewBox="0 0 64 72" width={32} height={36} aria-hidden>
                <path d={metrics.dPath} fill="#2AD8B8" fillRule="evenodd" />
              </svg>
            </span>
            <span className="font-mono text-[11px] text-fg-3">escuro</span>
          </div>
        </div>
      </Section>

      <Section n="02" title="Construção do logotipo" text="O D é um pouco maior que as letras altas do “manda” e desce até quase a linha de base, com o centro levemente acima do centro do m.">
        <div className="overflow-x-auto rounded-2xl bg-surface p-3">
          <svg viewBox={`${VX - padL} ${VY - padT} ${cw} ${ch}`} className="min-w-[560px]" style={{ width: "100%" }} role="img" aria-label="Construção do logotipo com linhas-guia">
            {guides.map((g) => (
              <g key={g.label}>
                <line x1={VX - padL} x2={VX + VW + 8} y1={g.y} y2={g.y} stroke="var(--border-strong)" strokeWidth={0.4} />
                <text x={VX + VW + 12} y={g.y + 1.6} fontSize={4.6} fill="var(--fg-2)">{g.label}</text>
              </g>
            ))}
            <path transform={metrics.dTransform} fill="#0B9A82" fillRule="evenodd" d={metrics.dPath} />
            <path fill="var(--fg)" d={metrics.textPath} />
            {/* respiro entre o D e o m, medido no meio da altura do m */}
            <g stroke="var(--danger)" strokeWidth={0.8}>
              <line x1={metrics.d.width} x2={mInk} y1={gapY} y2={gapY} />
              <line x1={metrics.d.width} x2={metrics.d.width} y1={gapY - 3} y2={gapY + 3} />
              <line x1={mInk} x2={mInk} y1={gapY - 3} y2={gapY + 3} />
            </g>
            <text x={(metrics.d.width + mInk) / 2} y={VY + VH + 20} fontSize={4.6} textAnchor="middle" fill="var(--fg-2)">respiro</text>
            <line x1={(metrics.d.width + mInk) / 2} x2={(metrics.d.width + mInk) / 2} y1={gapY + 4} y2={VY + VH + 15} stroke="var(--danger)" strokeWidth={0.5} />
          </svg>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            ["0,78", "altura do D, em relação ao tamanho do texto"],
            ["0,09", "quanto o D desce a partir da linha de base"],
            ["0,06", "respiro entre o D e o m (fora a lateral da letra)"],
          ].map(([v, t]) => (
            <div key={v} className="rounded-2xl bg-surface-2 px-4 py-3">
              <p className="text-2xl font-semibold tabular-nums">{v}<span className="ml-1 text-sm font-normal text-fg-3">em</span></p>
              <p className="text-xs text-fg-2">{t}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section n="03" title="Cores" text="Verde-água é a cor da marca. Sobre ele, texto e ícones são sempre na Tinta, escura e sólida: nada de verde claro sobre verde.">
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {COLORS.map((c) => (
            <button key={c.hex} type="button" onClick={() => copy(c.hex)} className="group grid overflow-hidden rounded-2xl bg-surface text-left shadow-sm transition-shadow hover:shadow-md">
              <span className="flex h-20 items-end justify-between p-3" style={{ background: c.hex, color: c.ink }}>
                <span className="text-sm font-semibold">Aa</span>
                <Copy className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="grid gap-0.5 px-3 py-2.5">
                <span className="text-sm font-semibold">{c.name}</span>
                <span className="font-mono text-xs text-fg-2">{c.hex}</span>
                <span className="text-xs text-fg-3">{c.use}</span>
              </span>
            </button>
          ))}
          <div className="grid overflow-hidden rounded-2xl bg-surface shadow-sm">
            <span className="flex h-20">
              {BLOBS.map((b) => (
                <button key={b} type="button" aria-label={`Copiar ${b}`} onClick={() => copy(b)} className="flex-1" style={{ background: b }} />
              ))}
            </span>
            <span className="grid gap-0.5 px-3 py-2.5">
              <span className="text-sm font-semibold">Manchas do fundo</span>
              <span className="font-mono text-xs text-fg-2">{BLOBS.join(" ")}</span>
              <span className="text-xs text-fg-3">Desfocadas atrás do vidro, nunca em formas com texto</span>
            </span>
          </div>
        </div>
      </Section>

      <Section n="04" title="Tipografia" text="Geist em tudo. Semibold para títulos e para o “manda”, regular para o texto corrido.">
        <div className="grid gap-3 rounded-2xl bg-surface p-5">
          <p className="text-[32px] font-semibold leading-tight tracking-tight">Social media <span className="font-mono text-xs font-normal tracking-normal text-fg-3">32 semibold</span></p>
          <p className="text-[24px] font-semibold tracking-tight">Minhas demandas <span className="font-mono text-xs font-normal tracking-normal text-fg-3">24 semibold</span></p>
          <p className="text-[15px] font-medium">Campanha de lançamento da coleção de verão <span className="font-mono text-xs font-normal text-fg-3">15 medium</span></p>
          <p className="text-sm text-fg-2">Escreva o briefing, os links de referência e o que precisa ser entregue. <span className="font-mono text-xs text-fg-3">14 regular</span></p>
          <p className="text-xs text-fg-3">Criada por Felipe Martins há 3 min <span className="font-mono">12 regular</span></p>
        </div>
      </Section>

      <Section n="05" title="Respiro e tamanho mínimo" text="Em volta do logotipo, deixe livre pelo menos a altura do m. Abaixo do tamanho mínimo, use só o símbolo.">
        <div className="flex flex-wrap items-center gap-6">
          <div className="rounded-2xl bg-surface p-4">
            <div className="rounded-xl bg-[#19C9A9]/15 p-[34px] ring-1 ring-[#19C9A9]/50 ring-inset">
              <div className="bg-[#EAF5F3]">
                <Wordmark height={52} />
              </div>
            </div>
          </div>
          <div className="grid gap-3 text-sm">
            <div className="flex items-center gap-3">
              <Wordmark height={16} />
              <span className="text-fg-2">Logotipo: no mínimo 80 px de largura</span>
            </div>
            <div className="flex items-center gap-3">
              <LogoMark size={16} />
              <span className="text-fg-2">Símbolo: no mínimo 16 px</span>
            </div>
          </div>
        </div>
      </Section>

      <Section n="06" title="Usos">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Usage ok label="Fundo claro com o D em verde-água profundo">
            <div className="flex h-24 items-center justify-center rounded-xl bg-[#EAF5F3]"><Wordmark height={30} /></div>
          </Usage>
          <Usage ok label="Fundo escuro com a versão negativa">
            <div className="flex h-24 items-center justify-center rounded-xl bg-[#060F0E]"><Wordmark d="#2AD8B8" text="#EEF7F6" height={30} /></div>
          </Usage>
          <Usage ok label="Uma cor só, quando a peça pede">
            <div className="flex h-24 items-center justify-center rounded-xl bg-white"><Wordmark d="#0F1A19" height={30} /></div>
          </Usage>
          <Usage ok label="Símbolo sozinho em espaços pequenos">
            <div className="flex h-24 items-center justify-center gap-3 rounded-xl bg-[#EAF5F3]"><LogoMark size={44} /><LogoMark size={28} /></div>
          </Usage>
          <Usage label="Trocar a cor do D (nada de violeta ou laranja)">
            <div className="flex h-24 items-center justify-center rounded-xl bg-[#EAF5F3]"><Wordmark d="#6C47FF" height={30} /></div>
          </Usage>
          <Usage label="Esticar, achatar ou girar">
            <div className="flex h-24 items-center justify-center overflow-hidden rounded-xl bg-[#EAF5F3]"><Wordmark height={30} style={{ transform: "scaleX(1.45)" }} /></div>
          </Usage>
          <Usage label="Mudar o tamanho ou a posição do D">
            <div className="flex h-24 items-center justify-center rounded-xl bg-[#EAF5F3]">
              <span className="inline-flex items-start text-[30px] font-semibold tracking-tight text-[#0F1A19]">
                <svg viewBox="0 0 64 72" style={{ height: "0.5em", width: "0.44em", marginTop: "0.12em", marginRight: "0.2em" }} aria-hidden><path d={metrics.dPath} fill="#0B9A82" fillRule="evenodd" /></svg>
                manda
              </span>
            </div>
          </Usage>
          <Usage label="Verde sobre verde, sem contraste">
            <div className="flex h-24 items-center justify-center rounded-xl bg-[#19C9A9]"><Wordmark d="#7EE8D3" text="#0B9A82" height={30} /></div>
          </Usage>
        </div>
      </Section>

      <Section n="07" title="Arquivos" text="Tudo em curvas (SVG): abre no Figma, Illustrator e navegador, sem precisar da fonte instalada.">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {FILES.map((f) => (
            <a key={f.file} href={`/marca/${f.file}`} download className="flex items-center gap-3 rounded-2xl bg-surface px-3 py-3 shadow-sm transition-shadow hover:shadow-md">
              <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded-xl bg-surface-2 p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/marca/${f.file}`} alt="" className={cn("max-h-full max-w-full", f.file.includes("negativo") && "rounded bg-[#060F0E] p-1")} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{f.label}</span>
                <span className="block text-xs text-fg-3">{f.note}</span>
              </span>
              <Download className="size-4 text-fg-2" />
            </a>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Usage({ ok, label, children }: { ok?: boolean; label: string; children: React.ReactNode }) {
  return (
    <figure className="grid gap-2 rounded-2xl bg-surface p-2.5 shadow-sm">
      {children}
      <figcaption className="flex items-start gap-2 px-1 pb-0.5 text-[13px] leading-snug">
        <span className={cn("mt-px inline-flex size-5 shrink-0 items-center justify-center rounded-full", ok ? "bg-success text-white" : "bg-danger text-white")}>
          {ok ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
        </span>
        {label}
      </figcaption>
    </figure>
  );
}
