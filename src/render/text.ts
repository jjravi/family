import { polar } from '../layout/geometry';
import type { TextRun } from '../layout/types';
import { fontStack, type FontFamily } from '../themes/fonts/families';
import { el, esc, num, path } from './svg';

/** Collects `<defs>` children (text paths) with deterministic ids. */
export class Defs {
  readonly items: string[] = [];
  private readonly prefix: string;
  private count = 0;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  /** Adds an element built from a fresh id; returns the id. */
  add(build: (id: string) => string): string {
    const id = `${this.prefix}-${this.count++}`;
    this.items.push(build(id));
    return id;
  }
}

/** Font attributes for a run; families only through fontStack() so the exporter can detect them. */
function fontAttrs(run: Pick<TextRun, 'font' | 'tracking'>): Record<string, string | number | null> {
  const { font } = run;
  return {
    'font-family': fontStack(font.family as FontFamily),
    'font-size': font.size,
    'font-weight': font.weight ?? 400,
    'font-style': font.style === 'italic' ? 'italic' : null,
    'letter-spacing': run.tracking ? run.tracking : null,
  };
}

/** One text run: a centered `<text>`, rotated about its baseline point, or set on an arc with `<textPath>`. */
export function textSvg(run: TextRun, fill: string, defs: Defs, extra: Record<string, string | number | null> = {}): string {
  const p = run.placement;
  if (p.kind === 'line') {
    return el(
      'text',
      {
        x: p.x,
        y: p.y,
        transform: p.rotate ? `rotate(${num(p.rotate)} ${num(p.x)} ${num(p.y)})` : null,
        ...fontAttrs(run),
        fill,
        'text-anchor': 'middle',
        ...extra,
      },
      esc(run.text),
    );
  }
  // A near-semicircle centered on the label angle; flipped arcs run counter-clockwise so text stays upright.
  const span = Math.PI / 2 - 0.01;
  const from = polar(p.cx, p.cy, p.r, p.flipped ? p.a + span : p.a - span);
  const to = polar(p.cx, p.cy, p.r, p.flipped ? p.a - span : p.a + span);
  const d = path('M', from.x, from.y, 'A', p.r, p.r, 0, 0, p.flipped ? 0 : 1, to.x, to.y);
  const id = defs.add((pid) => el('path', { id: pid, d }));
  return el(
    'text',
    { ...fontAttrs(run), fill, ...extra },
    el('textPath', { href: `#${id}`, startOffset: '50%', 'text-anchor': 'middle' }, esc(run.text)),
  );
}
