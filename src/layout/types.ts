import type { PersonId } from '../model/types';
import type { FontSpec } from './measure';
import type { Point, Rect } from './geometry';

/** Outline of a node: a box, or an annular sector of a fan (angles in radians, clockwise from +x). */
export type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | {
      kind: 'sector';
      cx: number;
      cy: number;
      r0: number;
      r1: number;
      a0: number;
      a1: number;
      /** Outline only the outer arc (a half of a split center disc). */
      arcOnly?: boolean;
    };

/**
 * Where a node's text may go. `box`: straight lines centered at (cx, cy) within
 * w x h, rotated by `rotate` degrees (-90 reads bottom to top). `arc`: lines
 * along concentric arcs between r0 and r1. `radial`: lines along the radius.
 */
export type TextFrame =
  | { kind: 'box'; cx: number; cy: number; w: number; h: number; rotate: 0 | -90 }
  | { kind: 'arc'; cx: number; cy: number; r0: number; r1: number; a0: number; a1: number }
  | { kind: 'radial'; cx: number; cy: number; r0: number; r1: number; a0: number; a1: number };

/** One person (or an unknown-ancestor placeholder) on the poster. */
export interface PosterNode {
  /** Unique within the poster, e.g. `a2.3` (side a, generation 2, slot 3). */
  key: string;
  /** Null for a placeholder. */
  person: PersonId | null;
  /** Generations from the focus (0 = focus); picks the type size. */
  generation: number;
  /** Pedigree slot index within the generation (< 2^generation), when the layout is a pedigree. */
  slot: number | null;
  /** 0 for the first focus side, 1 for the second (couple layouts). */
  side: 0 | 1;
  focus: boolean;
  shape: Shape;
  frame: TextFrame;
  /** Name size in points for this node before fitting. */
  size: number;
  /** "See also" number when the person is drawn more than once (cousin marriage, pedigree collapse). */
  repeat: number | null;
}

/** One far end of a fork connector. */
export interface LinkTarget {
  point: Point;
  placeholder: boolean;
  /** Persons in the subtree this end leads to (organic stroke width). */
  weight: number;
}

/**
 * A connector from one source to several targets along an axis: child to
 * parents in pedigrees, union to children in descendant charts. `mid` is the
 * coordinate on the axis where an orthogonal fork crosses.
 */
export interface ForkLink {
  kind: 'fork';
  axis: 'up' | 'down' | 'left' | 'right';
  source: Point;
  /** Subtree size at the source end. */
  weight: number;
  mid: number;
  targets: LinkTarget[];
}

/** A fan connector in polar coordinates: out from the child, along an arc at `mid`, out to each parent. */
export interface PolarLink {
  kind: 'polar';
  cx: number;
  cy: number;
  source: { r: number; a: number };
  weight: number;
  mid: number;
  targets: { r: number; a: number; placeholder: boolean; weight: number }[];
}

/** The mark between the two partners of a couple drawn side by side. */
export interface JoinLink {
  kind: 'join';
  a: Point;
  b: Point;
  /** Name size of the partners, for scaling the mark. */
  size: number;
}

/** Any connector a layout produces. */
export type Link = ForkLink | PolarLink | JoinLink;

/** Where the title goes and how it is framed. */
export interface TitleBlock {
  text: string;
  /** Area the title text and its ornament may occupy. */
  frame: Rect;
  /** `heading` for single root (top), `cartouche` for couples. */
  kind: 'heading' | 'cartouche';
}

/** A layout's output, before text fitting: positioned nodes, connectors, and the title block. */
export interface Layout {
  nodes: PosterNode[];
  links: Link[];
  title: TitleBlock;
  /** Layout scale (1 = theme sizes); edges and ornaments scale with it. */
  scale: number;
  notices: string[];
}

/** Where a run of text sits. `line`: baseline center (x, y), rotated `rotate` degrees about it. `arc`: centered at angle `a` on radius `r`. */
export type RunPlacement =
  | { kind: 'line'; x: number; y: number; rotate: number }
  | { kind: 'arc'; cx: number; cy: number; r: number; a: number; flipped: boolean };

/** What a text run is; picks its color. */
export type RunRole = 'name' | 'dates' | 'traits' | 'title' | 'mark';

/** One fitted line of text, with everything needed to draw it and to check it for overlaps. */
export interface TextRun {
  role: RunRole;
  text: string;
  font: FontSpec;
  /** Letter spacing in points. */
  tracking: number;
  /** Advance width in points, tracking included. */
  width: number;
  placement: RunPlacement;
}
