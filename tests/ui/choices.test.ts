import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, type Style } from '../../src/style';
import { layoutChoice } from '../../src/ui/choices';

const style = (patch: Partial<Style> = {}): Style => ({ ...DEFAULT_STYLE, ...patch });

describe('layoutChoice', () => {
  it('offers only the layouts for the focus count', () => {
    expect(layoutChoice(style(), 1).options).toEqual(['ped', 'fan', 'desc']);
    expect(layoutChoice(style(), 2).options).toEqual(['bowtie', 'butterfly', 'converge', 'desc']);
  });

  it('selects the requested layout when it is offered', () => {
    expect(layoutChoice(style({ layout: 'fan' }), 1).selected).toBe('fan');
    expect(layoutChoice(style({ layout: 'desc' }), 2).selected).toBe('desc');
  });

  it('shows the resolved layout when the request is auto or not offered', () => {
    expect(layoutChoice(style(), 1).selected).toBe('ped');
    expect(layoutChoice(style(), 2).selected).toBe('converge');
    expect(layoutChoice(style({ orientation: 'landscape' }), 2).selected).toBe('bowtie');
    expect(layoutChoice(style({ layout: 'bowtie' }), 1).selected).toBe('ped');
    expect(layoutChoice(style({ layout: 'fan' }), 2).selected).toBe('converge');
  });

  it('offers nothing without a usable focus', () => {
    expect(layoutChoice(style({ layout: 'fan' }), 0)).toEqual({ options: [], selected: null });
    expect(layoutChoice(style(), 3)).toEqual({ options: [], selected: null });
  });
});
