/** A number for SVG markup: at most two decimals, no trailing zeros, never `-0`. */
export function num(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) || rounded === 0 ? '0' : String(rounded);
}

/**
 * Escapes text and double-quoted attribute values (`&`, `<`, `>`, `"`). Single
 * quotes stay, so fontStack() values appear verbatim for the font exporter.
 */
export function esc(text: string): string {
  return text.replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);
}

/** An attribute value; null, undefined, and false omit the attribute. */
export type AttrValue = string | number | null | undefined | false;

/** ` name="value"` pairs in the given order; null, undefined, and false are skipped; numbers go through num(). */
export function attrs(values: Readonly<Record<string, AttrValue>>): string {
  let out = '';
  for (const [name, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === false) continue;
    out += ` ${name}="${typeof value === 'number' ? num(value) : esc(value)}"`;
  }
  return out;
}

/** An element: self-closing without children. */
export function el(tag: string, values: Readonly<Record<string, AttrValue>>, children?: string): string {
  return children === undefined || children === '' ? `<${tag}${attrs(values)}/>` : `<${tag}${attrs(values)}>${children}</${tag}>`;
}

/** Path data from commands and numbers: path('M', 1, 2, 'L', 3, 4) -> "M1 2L3 4". */
export function path(...parts: (string | number)[]): string {
  let out = '';
  let previousNumber = false;
  for (const part of parts) {
    if (typeof part === 'number') {
      out += (previousNumber ? ' ' : '') + num(part);
      previousNumber = true;
    } else {
      out += part;
      previousNumber = false;
    }
  }
  return out;
}
