import { boxHeightEm, type Face, type NodeShape, type Theme } from '../themes/schema';
import type { PersonLabel } from './labels';
import type { FontSpec, TextMeasurer } from './measure';

/** A face set at a size: the font to measure and draw with, plus its tracking in points. */
export interface SetFace {
  font: FontSpec;
  tracking: number;
  uppercase: boolean;
}

/** A theme face set at a size in points. */
export function setFace(face: Face, size: number): SetFace {
  return {
    font: { family: face.family, size, weight: face.weight, style: face.style },
    tracking: face.tracking * size,
    uppercase: face.uppercase,
  };
}

/** Text as drawn in a face (uppercased when the face says so). */
export function faceText(face: SetFace, text: string): string {
  return face.uppercase ? text.toLocaleUpperCase() : text;
}

/** Advance width of `text` in a set face, tracking included. */
export function textWidth(measure: TextMeasurer, face: SetFace, text: string): number {
  const shown = faceText(face, text);
  return measure.width(shown, face.font) + face.tracking * [...shown].length;
}

/** The three faces of a person label at a name size, plus line heights in points. */
export interface LabelType {
  name: SetFace;
  dates: SetFace;
  traits: SetFace;
  nameLine: number;
  datesLine: number;
  traitsLine: number;
}

/** Faces and line heights of a person label at name size `size` (focus persons use the focus face). */
export function labelType(theme: Theme, size: number, focus: boolean): LabelType {
  const { type, metrics } = theme;
  return {
    name: setFace(focus ? type.focusName : type.name, size),
    dates: setFace(type.dates, size * type.datesScale),
    traits: setFace(type.trait, size * type.traitScale),
    nameLine: metrics.nameLine * size,
    datesLine: metrics.datesLine * size,
    traitsLine: metrics.traitsLine * size,
  };
}

/** Name size at scale 1 for a generation (the last theme size repeats). */
export function nameSize(theme: Theme, generation: number): number {
  const sizes = theme.type.nameSizes;
  return sizes[Math.min(generation, sizes.length - 1)]!;
}

/** The best split of a name into two lines (minimizing the wider line), or null for a single word. */
export function splitName(name: string, width: (text: string) => number): [string, string] | null {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return null;
  let best: [string, string] | null = null;
  let bestWidth = Infinity;
  for (let i = 1; i < words.length; i++) {
    const lines: [string, string] = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    const w = Math.max(width(lines[0]), width(lines[1]));
    if (w < bestWidth) [best, bestWidth] = [lines, w];
  }
  return best;
}

/** Fraction of a node's box available to text, per shape (leaf and circle text sits in the inscribed rectangle). */
const SHAPE_TEXT: Readonly<Record<NodeShape, { w: number; h: number }>> = {
  box: { w: 1, h: 1 },
  pill: { w: 1, h: 1 },
  'text-only': { w: 1, h: 1 },
  leaf: { w: 0.7, h: 0.6 },
  circle: { w: Math.SQRT1_2, h: Math.SQRT1_2 },
};

/** Leaves flatter than this stop reading as leaves (height / width). */
const LEAF_MIN_ASPECT = 0.42;

/** Box size for a text block of tw x th at name size `size`. */
function boxForText(theme: Theme, tw: number, th: number, size: number): { w: number; h: number } {
  const { padX, padY } = theme.metrics;
  const shape = theme.node.shape;
  const ratio = SHAPE_TEXT[shape];
  const h = th / ratio.h + 2 * padY * size;
  const w = tw / ratio.w + 2 * padX * size + (shape === 'pill' ? h * 0.35 : 0);
  return { w, h: shape === 'leaf' ? Math.max(h, w * LEAF_MIN_ASPECT) : h };
}

/** The text block inside a w x h box at name size `size` (inverse of boxForText). */
export function textInBox(theme: Theme, w: number, h: number, size: number): { w: number; h: number } {
  const { padX, padY } = theme.metrics;
  const shape = theme.node.shape;
  const ratio = SHAPE_TEXT[shape];
  return {
    w: Math.max(0, (w - 2 * padX * size - (shape === 'pill' ? h * 0.35 : 0)) * ratio.w),
    h: Math.max(0, (h - 2 * padY * size) * ratio.h),
  };
}

/** Box metrics for one generation at scale 1. */
export interface GenerationMetrics {
  /** Name size in points. */
  size: number;
  /** Text block (the widest content, clamped to the theme's width bounds). */
  textW: number;
  textH: number;
  /** Box (shape) size. */
  w: number;
  h: number;
  /** Name lines the box has room for (2 when some name only fits wrapped). */
  nameLines: number;
}

/** Measured widths of a label at a name size. */
export interface LabelWidths {
  name: number;
  /** Widest line of the best two-line split; equals `name` for one word. */
  name2: number;
  dates: number;
  traits: number;
}

/** Widths of each line of a label, measured at the label type's sizes. */
export function labelWidths(label: PersonLabel, type: LabelType, measure: TextMeasurer): LabelWidths {
  const nameWidth = (text: string) => textWidth(measure, type.name, text);
  const name = nameWidth(label.name);
  const split = splitName(label.name, nameWidth);
  return {
    name,
    name2: split ? Math.max(nameWidth(split[0]), nameWidth(split[1])) : name,
    dates: label.dates ? textWidth(measure, type.dates, label.dates) : 0,
    traits: label.traits ? textWidth(measure, type.traits, label.traits) : 0,
  };
}

/**
 * Content-aware box metrics for a generation at scale 1: wide enough for the
 * widest name, dates, or trait line (within the theme's bounds), with a line for
 * dates and traits only when some label in the generation shows them.
 */
export function generationMetrics(
  theme: Theme,
  labels: readonly PersonLabel[],
  generation: number,
  measure: TextMeasurer,
  options: { focus?: boolean } = {},
): GenerationMetrics {
  const size = nameSize(theme, generation);
  const type = labelType(theme, size, options.focus ?? false);
  const { metrics } = theme;
  const minText = (metrics.minWidth - 2 * metrics.padX) * size;
  const maxText = (metrics.maxWidth - 2 * metrics.padX) * size;
  const widths = labels.map((label) => labelWidths(label, type, measure));
  const widest = Math.max(0, ...widths.map((w) => Math.max(w.name, w.dates, w.traits)));
  const textW = Math.min(maxText, Math.max(minText, widest));
  const nameLines = widths.some((w) => w.name > textW && w.name2 < w.name) ? 2 : 1;
  const lines = {
    dates: labels.some((l) => l.dates !== null),
    traits: labels.some((l) => l.traits !== null),
    nameLines,
  };
  const textH = (boxHeightEm(metrics, lines) - 2 * metrics.padY) * size;
  const box = boxForText(theme, textW, textH, size);
  return { size, textW, textH, w: box.w, h: box.h, nameLines };
}

/** Metrics scaled by `s`. */
export function scaleMetrics(m: GenerationMetrics, s: number): GenerationMetrics {
  return { size: m.size * s, textW: m.textW * s, textH: m.textH * s, w: m.w * s, h: m.h * s, nameLines: m.nameLines };
}
