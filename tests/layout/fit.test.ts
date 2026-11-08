import { describe, expect, it } from 'vitest';
import { abbreviateName, FIT_FLOOR, fitLabel } from '../../src/layout/fit';
import { polygonInside } from '../../src/layout/geometry';
import type { PersonLabel } from '../../src/layout/labels';
import { approxMeasurer } from '../../src/layout/measure';
import { labelType } from '../../src/layout/metrics';
import { framePolygon, runPolygon } from '../../src/layout/shapes';
import type { TextFrame } from '../../src/layout/types';
import { resolveTheme } from '../../src/themes';

const theme = resolveTheme('classic', 'ped');
const type = labelType(theme, 14, false);
const grace: PersonLabel = { name: 'Grace Ann Park', dates: '1929 \u2013 2015', traits: 'gentle \u00b7 wise' };
const box = (w: number, h: number): TextFrame => ({ kind: 'box', cx: 100, cy: 100, w, h, rotate: 0 });
const fit = (label: PersonLabel, frame: TextFrame) => fitLabel(label, type, frame, approxMeasurer, { wrap: frame.kind === 'box', endPad: 5 });

function expectInside(frame: TextFrame, runs: ReturnType<typeof fit>['runs']) {
  for (const run of runs) expect(polygonInside(runPolygon(run), framePolygon(frame), 0.05), run.text).toBe(true);
}

describe('fitLabel in boxes', () => {
  it('keeps everything at full size when it fits', () => {
    const result = fit(grace, box(200, 80));
    expect(result.runs.map((r) => r.role)).toEqual(['name', 'dates', 'traits']);
    expect(result.shrunk || result.traitsDropped || result.abbreviated).toBe(false);
    expect(result.runs[0]!.font.size).toBe(14);
  });

  it('wraps a long name onto two balanced lines before shrinking', () => {
    const result = fit(grace, box(90, 90));
    expect(result.runs.map((r) => r.text)).toEqual(['Grace', 'Ann Park', grace.dates, grace.traits]);
    expect(result.shrunk).toBe(false);
  });

  it('shrinks everything together before dropping anything', () => {
    const result = fit(grace, box(90, 40));
    expect(result).toMatchObject({ shrunk: true, traitsDropped: false });
    expect(result.runs).toHaveLength(3);
  });

  it('drops traits first when the floor size is not enough, and never shrinks below the floor', () => {
    const result = fit(grace, box(90, 30));
    expect(result).toMatchObject({ traitsDropped: true, abbreviated: false, datesDropped: false });
    for (const run of result.runs) expect(run.font.size).toBeGreaterThanOrEqual(14 * theme.type.datesScale * FIT_FLOOR - 1e-9);
  });

  it('abbreviates given names to initials, then truncates with an ellipsis, then hides', () => {
    expect(fit(grace, box(62, 30)).runs[0]!.text).toBe('G. A. Park');
    const cut = fit(grace, box(26, 14));
    expect(cut).toMatchObject({ truncated: true, datesDropped: true });
    expect(cut.runs[0]!.text.endsWith('\u2026')).toBe(true);
    expect(fit(grace, box(4, 4))).toMatchObject({ hidden: true, runs: [] });
  });

  it('never lets a run leave its frame', () => {
    for (let w = 20; w <= 200; w += 9) {
      for (let h = 8; h <= 90; h += 7) {
        const frame = box(w, h);
        expectInside(frame, fit(grace, frame).runs);
      }
    }
  });

  it('sets rotated boxes reading bottom to top', () => {
    const frame: TextFrame = { kind: 'box', cx: 50, cy: 200, w: 120, h: 50, rotate: -90 };
    const result = fit(grace, frame);
    expect(result.runs.every((r) => r.placement.kind === 'line' && r.placement.rotate === -90)).toBe(true);
    expectInside(frame, result.runs);
  });
});

describe('fitLabel in fan slots', () => {
  const arc = (a0: number, a1: number): TextFrame => ({ kind: 'arc', cx: 400, cy: 400, r0: 200, r1: 260, a0, a1 });

  it('sets arc text upright: flipped on the bottom half only', () => {
    const top = fit(grace, arc(Math.PI * 1.25, Math.PI * 1.5));
    const bottom = fit(grace, arc(Math.PI * 0.25, Math.PI * 0.5));
    expect(top.runs.every((r) => r.placement.kind === 'arc' && !r.placement.flipped)).toBe(true);
    expect(bottom.runs.every((r) => r.placement.kind === 'arc' && r.placement.flipped)).toBe(true);
    expectInside(arc(Math.PI * 1.25, Math.PI * 1.5), top.runs);
    expectInside(arc(Math.PI * 0.25, Math.PI * 0.5), bottom.runs);
  });

  it('puts the name on the outer arc above the half and on the inner arc below it', () => {
    const [name, dates] = fit(grace, arc(Math.PI * 1.25, Math.PI * 1.5)).runs;
    expect(name!.placement.kind === 'arc' && dates!.placement.kind === 'arc' && name!.placement.r > dates!.placement.r).toBe(true);
    const [bName, bDates] = fit(grace, arc(Math.PI * 0.25, Math.PI * 0.5)).runs;
    expect(bName!.placement.kind === 'arc' && bDates!.placement.kind === 'arc' && bName!.placement.r < bDates!.placement.r).toBe(true);
  });

  it('never wraps fan text; it shrinks, abbreviates, then truncates', () => {
    const narrow = fit(grace, arc(Math.PI * 1.5, Math.PI * 1.5 + 0.28));
    expect(narrow.runs.filter((r) => r.role === 'name')).toHaveLength(1);
    expect(narrow.abbreviated || narrow.truncated).toBe(true);
    expectInside(arc(Math.PI * 1.5, Math.PI * 1.5 + 0.28), narrow.runs);
  });

  it('sets radial text reading outward on the right half and inward on the left', () => {
    const frame = (a0: number, a1: number): TextFrame => ({ kind: 'radial', cx: 400, cy: 400, r0: 300, r1: 420, a0, a1 });
    const right = fit(grace, frame(-0.3, -0.1));
    const left = fit(grace, frame(Math.PI + 0.1, Math.PI + 0.3));
    const angle = (r: (typeof right.runs)[number]) => (r.placement.kind === 'line' ? r.placement.rotate : NaN);
    expect(angle(right.runs[0]!)).toBeCloseTo((-0.2 * 180) / Math.PI, 6);
    expect(angle(left.runs[0]!)).toBeCloseTo(((Math.PI + 0.2 + Math.PI) * 180) / Math.PI, 6);
    expectInside(frame(-0.3, -0.1), right.runs);
    expectInside(frame(Math.PI + 0.1, Math.PI + 0.3), left.runs);
  });
});

describe('abbreviateName', () => {
  it('turns given names into initials and keeps particles', () => {
    expect(abbreviateName('Grace Ann Park')).toBe('G. A. Park');
    expect(abbreviateName('Maria de la Cruz')).toBe('M. de la Cruz');
    expect(abbreviateName('Mary')).toBeNull();
    expect(abbreviateName('Élodie Brun')).toBe('É. Brun');
  });
});
