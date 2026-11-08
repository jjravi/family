import { FONT_FAMILIES } from '../themes/fonts/families';
import type { Face, Theme } from '../themes/schema';
import { ASCENT, DESCENT, type Rect } from './geometry';
import type { TextMeasurer } from './measure';
import { faceText, setFace, textWidth, type SetFace } from './metrics';
import type { TextRun, TitleBlock } from './types';

/**
 * approxMeasurer can be off by 0.57x-1.33x for the script face, so script
 * titles are fitted as if they were this much wider.
 */
const SCRIPT_SLACK = 1.35;

/** The face a title block sets its text in: the couple face for cartouches, the display face for headings. */
function titleFace(theme: Theme, kind: TitleBlock['kind']): Face {
  return kind === 'cartouche' ? theme.type.coupleTitle : theme.type.display;
}

function slackFor(face: Face): number {
  return face.family === FONT_FAMILIES.greatVibes ? SCRIPT_SLACK : 1;
}

/** Preferred title size for a content width. */
export function titleSize(theme: Theme, width: number): number {
  return theme.type.titleScale * width;
}

/** Height of the top heading band (title plus rule) for a title size. */
function headingHeight(size: number): number {
  return size * 2.1;
}

/** Height of a cartouche for a title size. */
export function cartoucheHeight(size: number, lines = 1): number {
  return size * (1.25 * lines + 1.35);
}

/** A heading block across the top of `area`; returns it and the area left below. */
export function headingBlock(theme: Theme, text: string, area: Rect): { block: TitleBlock; rest: Rect } {
  const size = titleSize(theme, area.w);
  const h = headingHeight(size);
  const gap = size * 0.6;
  return {
    block: { text, kind: 'heading', frame: { x: area.x, y: area.y, w: area.w, h } },
    rest: { x: area.x, y: area.y + h + gap, w: area.w, h: area.h - h - gap },
  };
}

/** Natural cartouche width for the title at its preferred size (capped by `maxWidth`). */
export function cartoucheWidth(theme: Theme, text: string, maxWidth: number, measure: TextMeasurer, size: number): number {
  const face = titleFace(theme, 'cartouche');
  const width = textWidth(measure, setFace(face, size), text) * slackFor(face);
  return Math.min(maxWidth, width + size * 3);
}

/** A cartouche centered at the bottom of `area`; returns it and the area left above. */
export function bottomCartouche(theme: Theme, text: string, area: Rect, measure: TextMeasurer): { block: TitleBlock; rest: Rect } {
  const size = titleSize(theme, area.w);
  const w = cartoucheWidth(theme, text, area.w * 0.8, measure, size);
  const h = cartoucheHeight(size);
  const gap = size * 0.7;
  return {
    block: { text, kind: 'cartouche', frame: { x: area.x + (area.w - w) / 2, y: area.y + area.h - h, w, h } },
    rest: { x: area.x, y: area.y, w: area.w, h: area.h - h - gap },
  };
}

/** Text area inside a title block: the cartouche's inner panel, or the heading band above its rule. */
export function titleTextArea(block: TitleBlock, size: number): Rect {
  const f = block.frame;
  if (block.kind === 'heading') return { x: f.x, y: f.y, w: f.w, h: Math.max(0, f.h - size * 0.75) };
  const padX = Math.min(size * 1.3, f.w * 0.12);
  const padY = Math.min(size * 0.6, f.h * 0.2);
  return { x: f.x + padX, y: f.y + padY, w: Math.max(0, f.w - 2 * padX), h: Math.max(0, f.h - 2 * padY) };
}

/** Words that should start a line rather than end one ("The Kim / & Ruiz Family"). */
const LEADING = new Set(['&', '+', 'and', 'y', 'et', 'und', 'of', 'the']);

function splitTitle(text: string, width: (t: string) => number): [string, string] | null {
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return null;
  let best: [string, string] | null = null;
  let bestWidth = Infinity;
  for (let i = 1; i < words.length; i++) {
    const lines: [string, string] = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    const dangling = LEADING.has(words[i - 1]!.toLocaleLowerCase());
    const w = Math.max(width(lines[0]), width(lines[1])) * (dangling ? 1.5 : 1);
    if (w < bestWidth) [best, bestWidth] = [lines, w];
  }
  return best;
}

/**
 * Title runs inside the block: one line at the largest size up to `size` that
 * fits, or two lines when that is larger; never below 40% of `size`.
 */
export function fitTitle(block: TitleBlock, theme: Theme, size: number, measure: TextMeasurer): TextRun[] {
  const face = titleFace(theme, block.kind);
  const slack = slackFor(face);
  const area = titleTextArea(block, size);
  const lineHeight = 1.18;
  const at = (s: number): SetFace => setFace(face, s);
  // The run is shifted right by half its tracking to center the ink, so leave room for one more letter space.
  const unit = (t: string) => (textWidth(measure, at(1), t) * slack + face.tracking) || 1;

  const oneSize = Math.min(size, area.w / unit(block.text), area.h / lineHeight);
  const split = splitTitle(block.text, unit);
  const twoSize = split ? Math.min(size, area.w / Math.max(unit(split[0]), unit(split[1])), area.h / (2 * lineHeight)) : 0;
  const lines = twoSize > oneSize * 1.15 && split ? split : [block.text];
  const chosen = Math.max(size * 0.4, lines.length === 2 ? twoSize : oneSize);
  const set = at(chosen);
  const lh = chosen * lineHeight;
  const top = area.y + (area.h - lines.length * lh) / 2;
  const baseline = (lh - (ASCENT + DESCENT) * chosen) / 2 + ASCENT * chosen;
  return lines.map((text, i) => ({
    role: 'title',
    text: faceText(set, text),
    font: set.font,
    tracking: set.tracking,
    width: textWidth(measure, set, text) * slack,
    placement: { kind: 'line', x: area.x + area.w / 2 + set.tracking / 2, y: top + lh * i + baseline, rotate: 0 },
  }));
}
