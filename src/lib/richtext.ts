import sanitizeHtml from "sanitize-html";

// Texto formatado (descriÃ§Ã£o e comentÃ¡rios) Ã© guardado como HTML, SEMPRE limpo por aqui antes de gravar.
// Lista fechada de tags: o que vier colado de Docs, Word ou da internet e nÃ£o estiver aqui some
// (estilos, scripts, imagens externas, iframes, classes).

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "strong", "b", "em", "i", "u", "s", "del", "code", "pre", "mark",
    "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "hr", "a", "span", "label", "input", "div",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    span: ["data-type", "data-id", "data-label", "class"],
    ul: ["data-type"],
    li: ["data-type", "data-checked"],
    input: ["type", "checked", "disabled"],
    ol: ["start"],
  },
  allowedClasses: { span: ["mention"] },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href"],
  transformTags: {
    h1: "h2",
    h5: "h4",
    h6: "h4",
    b: "strong",
    i: "em",
    strike: "s",
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer nofollow" }),
    input: (tagName, attribs) =>
      attribs.type === "checkbox"
        ? { tagName, attribs: { type: "checkbox", ...(attribs.checked !== undefined ? { checked: "" } : {}), disabled: "" } }
        : { tagName: "span", attribs: {} },
  },
  exclusiveFilter: (frame) => frame.tag === "span" && frame.attribs["data-type"] !== undefined && frame.attribs["data-type"] !== "mention",
};

export function sanitizeRich(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}

/** Texto puro (sem tags) para saber se estÃ¡ vazio e para buscas. */
export function richToText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim();
}

/** Limpa e devolve null quando nÃ£o sobra texto (ex.: "<p></p>"). */
export function cleanRich(html: string | null | undefined): string | null {
  if (!html) return null;
  const clean = sanitizeRich(html);
  return richToText(clean) || /<(hr|li|input)\b/.test(clean) ? clean : null;
}

/** Converte texto puro antigo em HTML seguro (parÃ¡grafos e quebras de linha). */
export function plainToRich(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Ids das pessoas mencionadas (spans data-type="mention" que o editor gera). */
export function mentionIds(html: string): string[] {
  return [...new Set([...html.matchAll(/data-type="mention"[^>]*data-id="([^"]+)"|data-id="([^"]+)"[^>]*data-type="mention"/g)].map((m) => m[1] ?? m[2]))];
}
