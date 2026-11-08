import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STYLE,
  LAYOUT_IDS,
  LAYOUT_LABELS,
  PAGE_SIZE_IDS,
  PAGE_SIZES,
  THEME_IDS,
  THEME_LABELS,
  isLayoutId,
  isOrientation,
  isPageSizeId,
  isThemeId,
  layoutsForFocusCount,
  pageGeometry,
  physicalSize,
  resolveLayout,
  resolveOrientation,
  resolveStyle,
  type Style,
} from '../src/style';

const style = (overrides: Partial<Style> = {}): Style => ({ ...DEFAULT_STYLE, ...overrides });

describe('DEFAULT_STYLE', () => {
  it('holds the frozen codec v1 defaults', () => {
    expect(DEFAULT_STYLE).toEqual({
      layout: null,
      theme: 'classic',
      dates: true,
      traits: false,
      living: false,
      qr: true,
      size: '18x24',
      orientation: null,
    });
    expect(Object.isFrozen(DEFAULT_STYLE)).toBe(true);
  });
});

describe('ids and labels', () => {
  it('labels every layout and theme', () => {
    expect(LAYOUT_IDS.map((id) => LAYOUT_LABELS[id])).toEqual(['Pedigree', 'Fan', 'Descendants', 'Bowtie', 'Butterfly', 'Converging']);
    expect(THEME_IDS.map((id) => THEME_LABELS[id])).toEqual(['Classic', 'Botanical', 'Modern']);
    for (const id of PAGE_SIZE_IDS) expect(PAGE_SIZES[id].label).toBeTruthy();
  });

  it('validates ids from untrusted input', () => {
    expect(isLayoutId('fan')).toBe(true);
    expect(isLayoutId('Fan')).toBe(false);
    expect(isLayoutId(undefined)).toBe(false);
    expect(isThemeId('botanical')).toBe(true);
    expect(isThemeId('dark')).toBe(false);
    expect(isPageSizeId('a2')).toBe(true);
    expect(isPageSizeId('A2')).toBe(false);
    expect(isOrientation('landscape')).toBe(true);
    expect(isOrientation('square')).toBe(false);
  });
});

describe('layoutsForFocusCount', () => {
  it('offers single-root and couple layouts', () => {
    expect(layoutsForFocusCount(1)).toEqual(['ped', 'fan', 'desc']);
    expect(layoutsForFocusCount(2)).toEqual(['bowtie', 'butterfly', 'converge', 'desc']);
    expect(layoutsForFocusCount(0)).toEqual([]);
    expect(layoutsForFocusCount(3)).toEqual([]);
  });
});

describe('resolveLayout', () => {
  it('keeps a requested layout that fits the focus count', () => {
    expect(resolveLayout(style({ layout: 'fan' }), 1)).toBe('fan');
    expect(resolveLayout(style({ layout: 'desc' }), 2)).toBe('desc');
    expect(resolveLayout(style({ layout: 'butterfly' }), 2)).toBe('butterfly');
  });

  it('falls back to the default for the focus count', () => {
    expect(resolveLayout(style(), 1)).toBe('ped');
    expect(resolveLayout(style({ layout: 'bowtie' }), 1)).toBe('ped');
    expect(resolveLayout(style(), 2)).toBe('converge');
    expect(resolveLayout(style({ layout: 'fan' }), 2)).toBe('converge');
    expect(resolveLayout(style({ orientation: 'landscape' }), 2)).toBe('bowtie');
    expect(resolveLayout(style({ orientation: 'portrait' }), 2)).toBe('converge');
  });
});

describe('resolveOrientation', () => {
  it('uses the explicit value, else landscape for bowtie and fan', () => {
    expect(resolveOrientation(style(), 'bowtie')).toBe('landscape');
    expect(resolveOrientation(style(), 'fan')).toBe('landscape');
    for (const layout of LAYOUT_IDS.filter((l) => l !== 'bowtie' && l !== 'fan')) {
      expect(resolveOrientation(style(), layout)).toBe('portrait');
    }
    expect(resolveOrientation(style({ orientation: 'portrait' }), 'bowtie')).toBe('portrait');
    expect(resolveOrientation(style({ orientation: 'portrait' }), 'fan')).toBe('portrait');
    expect(resolveOrientation(style({ orientation: 'landscape' }), 'ped')).toBe('landscape');
  });
});

describe('page geometry', () => {
  it('is 1296 x 1728 pt for 18x24 portrait, swapped for landscape, with a 0.75 in margin', () => {
    expect(pageGeometry('18x24', 'portrait')).toEqual({ size: '18x24', orientation: 'portrait', width: 1296, height: 1728, margin: 54 });
    expect(pageGeometry('18x24', 'landscape')).toMatchObject({ width: 1728, height: 1296 });
  });

  it('converts every size to points', () => {
    const inches = { '8x10': [8, 10], '11x14': [11, 14], '16x20': [16, 20], '18x24': [18, 24], '24x36': [24, 36] } as const;
    for (const [id, [w, h]] of Object.entries(inches)) {
      expect(PAGE_SIZES[id as keyof typeof inches]).toMatchObject({ width: w * 72, height: h * 72 });
    }
    const mm = { a4: [210, 297], a3: [297, 420], a2: [420, 594] } as const;
    for (const [id, [w, h]] of Object.entries(mm)) {
      const size = PAGE_SIZES[id as keyof typeof mm];
      expect(size.width).toBeCloseTo((w / 25.4) * 72, 6);
      expect(size.height).toBeCloseTo((h / 25.4) * 72, 6);
    }
    for (const id of PAGE_SIZE_IDS) expect(PAGE_SIZES[id].width).toBeLessThan(PAGE_SIZES[id].height);
  });

  it('reports physical CSS lengths after orientation', () => {
    expect(physicalSize(pageGeometry('18x24', 'portrait'))).toEqual({ width: '18in', height: '24in' });
    expect(physicalSize(pageGeometry('18x24', 'landscape'))).toEqual({ width: '24in', height: '18in' });
    expect(physicalSize(pageGeometry('a3', 'portrait'))).toEqual({ width: '297mm', height: '420mm' });
  });
});

describe('resolveStyle', () => {
  it('derives layout, orientation, and page together', () => {
    expect(resolveStyle(style(), 2)).toEqual({ layout: 'converge', orientation: 'portrait', page: pageGeometry('18x24', 'portrait') });
    expect(resolveStyle(style({ layout: 'bowtie', size: 'a2' }), 2)).toEqual({ layout: 'bowtie', orientation: 'landscape', page: pageGeometry('a2', 'landscape') });
    expect(resolveStyle(style({ layout: 'fan' }), 1)).toEqual({ layout: 'fan', orientation: 'landscape', page: pageGeometry('18x24', 'landscape') });
    expect(resolveStyle(style({ layout: 'fan', orientation: 'portrait' }), 1).page).toEqual(pageGeometry('18x24', 'portrait'));
  });
});
