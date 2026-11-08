import { describe, expect, it } from 'vitest';
import { approxMeasurer, type FontSpec } from '../../src/layout/measure';
import { FONT_FAMILIES } from '../../src/themes/fonts/families';

const fonts: FontSpec[] = [
  { family: FONT_FAMILIES.playfair, size: 12 },
  { family: FONT_FAMILIES.sourceSans, size: 9, weight: 600 },
  { family: FONT_FAMILIES.cormorant, size: 10, style: 'italic' },
  { family: FONT_FAMILIES.greatVibes, size: 40 },
  { family: FONT_FAMILIES.jost, size: 11, weight: 300 },
  { family: 'Unknown Family', size: 12 },
];

describe.each(fonts)('approxMeasurer with $family', (font) => {
  it('is deterministic and zero for empty text', () => {
    expect(approxMeasurer.width('Rose Kim', font)).toBe(approxMeasurer.width('Rose Kim', font));
    expect(approxMeasurer.width('', font)).toBe(0);
  });

  it('never shrinks as text grows, and scales linearly with size', () => {
    const text = 'Inés Vega 1931 – 2020';
    for (let i = 1; i < text.length; i++) {
      expect(approxMeasurer.width(text.slice(0, i + 1), font)).toBeGreaterThanOrEqual(approxMeasurer.width(text.slice(0, i), font));
    }
    expect(approxMeasurer.width(text, { ...font, size: font.size * 2 })).toBeCloseTo(approxMeasurer.width(text, font) * 2, 6);
  });

  it('gives a plausible width (0.3-0.9 em per character on average)', () => {
    const text = 'Carlos Ruiz';
    const em = approxMeasurer.width(text, font) / font.size / text.length;
    expect(em).toBeGreaterThan(0.3);
    expect(em).toBeLessThan(0.9);
  });
});
