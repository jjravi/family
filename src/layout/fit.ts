import { ASCENT, DESCENT } from './geometry';
import type { PersonLabel } from './labels';
import type { TextMeasurer } from './measure';
import { faceText, splitName, textWidth, type LabelType, type SetFace } from './metrics';
import type { RunRole, TextFrame, TextRun } from './types';

/** Smallest fraction of the full type size text may shrink to. */
export const FIT_FLOOR = 0.7;
const STEP = 0.05;
const EPS = 0.01;

/** What fitting had to give up, for UI notices. */
export interface FitFlags {
  shrunk: boolean;
  traitsDropped: boolean;
  datesDropped: boolean;
  abbreviated: boolean;
  truncated: boolean;
  hidden: boolean;
}

/** Fitted runs plus what fitting gave up. */
export interface FittedText extends FitFlags {
  runs: TextRun[];
}

interface Line {
  role: RunRole;
  text: string;
  face: SetFace;
  lineHeight: number;
  /** Width at full size. */
  width: number;
}

/** How a label may be fitted. */
export interface FitOptions {
  /** Allow a name to wrap onto two lines (rectangular boxes). */
  wrap: boolean;
  /** Clearance kept at the ends of arc and radial lines, in points at full size. */
  endPad: number;
  floor?: number;
}

/** "Grace Ann Park" -> "G. A. Park"; lowercase particles stay ("M. de la Cruz"). Null when nothing shortens. */
export function abbreviateName(name: string): string | null {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return null;
  const given = words.slice(0, -1).map((w) => {
    const first = [...w][0]!;
    return first === first.toLocaleLowerCase() && first !== first.toLocaleUpperCase() ? w : `${first}.`;
  });
  const short = [...given, words.at(-1)!].join(' ');
  return short === name ? null : short;
}

function scaledFace(face: SetFace, f: number): SetFace {
  return { ...face, font: { ...face.font, size: face.font.size * f }, tracking: face.tracking * f };
}

function baselineOffset(line: Line, f: number): number {
  const size = line.face.font.size * f;
  return (line.lineHeight * f - (ASCENT + DESCENT) * size) / 2 + ASCENT * size;
}

/** Offsets of each baseline from the middle of the stack (positive = later lines), and the stack height. */
function stack(lines: readonly Line[], f: number): { offsets: number[]; total: number } {
  const total = lines.reduce((sum, l) => sum + l.lineHeight * f, 0);
  let top = -total / 2;
  const offsets = lines.map((line) => {
    const offset = top + baselineOffset(line, f);
    top += line.lineHeight * f;
    return offset;
  });
  return { offsets, total };
}

function run(line: Line, f: number, placement: TextRun['placement']): TextRun {
  const face = scaledFace(line.face, f);
  return {
    role: line.role,
    text: faceText(face, line.text),
    font: face.font,
    tracking: face.tracking,
    width: line.width * f,
    placement,
  };
}

/** Runs for `lines` set at scale `f` in `frame`, or null when they do not fit. */
function placeLines(lines: readonly Line[], f: number, frame: TextFrame, endPad: number): TextRun[] | null {
  const { offsets, total } = stack(lines, f);
  const pad = endPad * f;
  if (frame.kind === 'box') {
    if (total > frame.h + EPS) return null;
    if (lines.some((l) => l.width * f > frame.w + EPS)) return null;
    return lines.map((line, i) =>
      frame.rotate === 0
        ? run(line, f, { kind: 'line', x: frame.cx, y: frame.cy + offsets[i]!, rotate: 0 })
        : run(line, f, { kind: 'line', x: frame.cx + offsets[i]!, y: frame.cy, rotate: -90 }),
    );
  }
  const mid = (frame.a0 + frame.a1) / 2;
  const span = frame.a1 - frame.a0;
  const rMid = (frame.r0 + frame.r1) / 2;
  if (frame.kind === 'arc') {
    if (total > frame.r1 - frame.r0 + EPS) return null;
    const flipped = Math.sin(mid) > 0;
    const runs: TextRun[] = [];
    for (let i = 0; i < lines.length; i++) {
      const r = flipped ? rMid + offsets[i]! : rMid - offsets[i]!;
      if (r <= 0 || (lines[i]!.width * f + 2 * pad) / r > span + EPS / r) return null;
      runs.push(run(lines[i]!, f, { kind: 'arc', cx: frame.cx, cy: frame.cy, r, a: mid, flipped }));
    }
    return runs;
  }
  // Radial: lines run along the middle ray, reading outward on the right half and inward on the left.
  const outward = Math.cos(mid) >= -1e-9;
  const dir = outward ? mid : mid + Math.PI;
  const down = { x: -Math.sin(dir), y: Math.cos(dir) };
  const center = { x: frame.cx + rMid * Math.cos(mid), y: frame.cy + rMid * Math.sin(mid) };
  const half = Math.tan(span / 2);
  const runs: TextRun[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const w = line.width * f;
    if (w + 2 * pad > frame.r1 - frame.r0 + EPS) return null;
    const size = line.face.font.size * f;
    const v = offsets[i]!;
    const reach = Math.max(Math.abs(v - ASCENT * size), Math.abs(v + DESCENT * size));
    const inner = rMid - w / 2;
    if (reach + pad / 2 > inner * half + EPS) return null;
    runs.push(run(line, f, { kind: 'line', x: center.x + v * down.x, y: center.y + v * down.y, rotate: (dir * 180) / Math.PI }));
  }
  return runs;
}

function line(role: RunRole, text: string, face: SetFace, lineHeight: number, measure: TextMeasurer): Line {
  return { role, text, face, lineHeight, width: textWidth(measure, face, text) };
}

/** Name lines: one line, plus the best two-line split when wrapping is allowed. */
function nameArrangements(name: string, type: LabelType, measure: TextMeasurer, wrap: boolean): Line[][] {
  const one = [line('name', name, type.name, type.nameLine, measure)];
  if (!wrap) return [one];
  const split = splitName(name, (t) => textWidth(measure, type.name, t));
  if (!split) return [one];
  return [one, split.map((t) => line('name', t, type.name, type.nameLine, measure))];
}

/** The largest scale in [floor, 1] at which one of the arrangements fits, preferring earlier ones at equal scale. */
function bestFit(arrangements: readonly Line[][], frame: TextFrame, endPad: number, floor: number): { runs: TextRun[]; f: number } | null {
  for (let f = 1; f >= floor - 1e-9; f -= STEP) {
    for (const lines of arrangements) {
      const runs = placeLines(lines, f, frame, endPad);
      if (runs) return { runs, f };
    }
  }
  return null;
}

const NO_FLAGS: FitFlags = {
  shrunk: false,
  traitsDropped: false,
  datesDropped: false,
  abbreviated: false,
  truncated: false,
  hidden: false,
};

/**
 * Fits a person label into a frame (spec "Text fitting"). In order: wrap the name
 * to two lines (boxes only) and shrink everything together down to the floor;
 * then drop the trait line; then abbreviate given names to initials; then drop
 * the dates line; then truncate the name with an ellipsis; as a last resort the
 * label is hidden. Every run in the result lies inside the frame.
 */
export function fitLabel(label: PersonLabel, type: LabelType, frame: TextFrame, measure: TextMeasurer, options: FitOptions): FittedText {
  const floor = options.floor ?? FIT_FLOOR;
  const dates = label.dates ? [line('dates', label.dates, type.dates, type.datesLine, measure)] : [];
  const traits = label.traits ? [line('traits', label.traits, type.traits, type.traitsLine, measure)] : [];
  const short = abbreviateName(label.name);
  const names = nameArrangements(label.name, type, measure, options.wrap);
  const shortNames = short ? nameArrangements(short, type, measure, options.wrap) : [];

  const variants: { arrangements: Line[][]; flags: Partial<FitFlags> }[] = [
    { arrangements: names.map((n) => [...n, ...dates, ...traits]), flags: {} },
  ];
  if (traits.length > 0) variants.push({ arrangements: names.map((n) => [...n, ...dates]), flags: { traitsDropped: true } });
  const dropped = { traitsDropped: traits.length > 0 };
  if (short) variants.push({ arrangements: shortNames.map((n) => [...n, ...dates]), flags: { ...dropped, abbreviated: true } });
  if (dates.length > 0) {
    variants.push({ arrangements: names, flags: { ...dropped, datesDropped: true } });
    if (short) variants.push({ arrangements: shortNames, flags: { ...dropped, datesDropped: true, abbreviated: true } });
  }

  for (const variant of variants) {
    const fit = bestFit(variant.arrangements, frame, options.endPad, floor);
    if (fit) return { ...NO_FLAGS, ...variant.flags, shrunk: fit.f < 1 - 1e-9, runs: fit.runs };
  }

  // Ellipsis: the longest prefix of the (abbreviated) name that fits at the floor, with dates when they still fit.
  const base = [...(short ?? label.name)];
  for (let n = base.length - 1; n >= 1; n--) {
    const text = `${base.slice(0, n).join('').trimEnd()}\u2026`;
    const name = line('name', text, type.name, type.nameLine, measure);
    for (const extra of dates.length > 0 ? [dates, []] : [[]]) {
      const runs = placeLines([name, ...extra], floor, frame, options.endPad);
      if (runs) {
        return {
          ...NO_FLAGS,
          ...dropped,
          datesDropped: dates.length > 0 && extra.length === 0,
          abbreviated: short !== null,
          truncated: true,
          shrunk: true,
          runs,
        };
      }
    }
  }
  return { ...NO_FLAGS, ...dropped, datesDropped: dates.length > 0, hidden: true, runs: [] };
}
