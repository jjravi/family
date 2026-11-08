// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { clampSideWidth, createSplitter, MIN_MAIN_PX, MIN_SIDE_PX, type WidthStore } from '../../src/ui/splitter';

const DEFAULT_WIDTH = 360;
const LAYOUT_WIDTH = 1400;

function memoryStore(initial: Record<string, string> = {}): WidthStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

/** jsdom has no layout: the sidebar's width follows --side-width, else the default. */
function mount(store: WidthStore | null = memoryStore()) {
  const layout = document.createElement('div');
  const side = document.createElement('aside');
  side.id = 'side-panel';
  Object.defineProperty(layout, 'clientWidth', { value: LAYOUT_WIDTH });
  side.getBoundingClientRect = () => {
    const width = parseFloat(layout.style.getPropertyValue('--side-width')) || DEFAULT_WIDTH;
    return new DOMRect(0, 0, width, 800);
  };
  const handle = createSplitter({ layout, side, store });
  layout.append(side, handle);
  document.body.replaceChildren(layout);
  const width = () => layout.style.getPropertyValue('--side-width');
  const press = (key: string, shiftKey = false) => handle.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
  return { layout, side, handle, width, press };
}

describe('clampSideWidth', () => {
  it('keeps the sidebar between its minimum and the room the preview needs', () => {
    expect(clampSideWidth(120, LAYOUT_WIDTH)).toBe(MIN_SIDE_PX);
    expect(clampSideWidth(512.4, LAYOUT_WIDTH)).toBe(512);
    expect(clampSideWidth(5000, LAYOUT_WIDTH)).toBe(LAYOUT_WIDTH - MIN_MAIN_PX);
  });

  it('gives the sidebar its minimum when the window is too narrow for both', () => {
    expect(clampSideWidth(500, 600)).toBe(MIN_SIDE_PX);
  });
});

describe('createSplitter', () => {
  it('is a focusable vertical separator that controls the sidebar', () => {
    const { handle } = mount();
    expect(handle.getAttribute('role')).toBe('separator');
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.getAttribute('aria-controls')).toBe('side-panel');
    expect(handle.tabIndex).toBe(0);
  });

  it('resizes with the arrow keys, Shift for big steps, Home and End for the limits', () => {
    const { handle, width, press } = mount();
    press('ArrowRight');
    expect(width()).toBe(`${DEFAULT_WIDTH + 16}px`);
    press('ArrowRight', true);
    expect(width()).toBe(`${DEFAULT_WIDTH + 16 + 80}px`);
    press('End');
    expect(width()).toBe(`${LAYOUT_WIDTH - MIN_MAIN_PX}px`);
    expect(handle.getAttribute('aria-valuenow')).toBe(String(LAYOUT_WIDTH - MIN_MAIN_PX));
    expect(handle.getAttribute('aria-valuemax')).toBe(String(LAYOUT_WIDTH - MIN_MAIN_PX));
    press('Home');
    expect(width()).toBe(`${MIN_SIDE_PX}px`);
    expect(handle.getAttribute('aria-valuemin')).toBe(String(MIN_SIDE_PX));
  });

  it('ignores other keys', () => {
    const { width, press } = mount();
    press('a');
    press('ArrowUp');
    expect(width()).toBe('');
  });

  it('remembers the chosen width and restores it on the next visit', () => {
    const store = memoryStore();
    mount(store).press('ArrowRight');
    expect(store.data.get('family-tree:side-width')).toBe(String(DEFAULT_WIDTH + 16));
    expect(mount(store).width()).toBe(`${DEFAULT_WIDTH + 16}px`);
  });

  it('double-click restores the default width and forgets the stored one', () => {
    const store = memoryStore({ 'family-tree:side-width': '640' });
    const { handle, width } = mount(store);
    expect(width()).toBe('640px');
    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(width()).toBe('');
    expect(store.data.has('family-tree:side-width')).toBe(false);
  });

  it('ignores a stored width that is not a number and raises one below the minimum', () => {
    expect(mount(memoryStore({ 'family-tree:side-width': 'wide' })).width()).toBe('');
    expect(mount(memoryStore({ 'family-tree:side-width': '120' })).width()).toBe(`${MIN_SIDE_PX}px`);
  });

  it('still resizes when storage is unavailable or throws', () => {
    const unavailable = mount(null);
    unavailable.press('ArrowRight');
    expect(unavailable.width()).toBe(`${DEFAULT_WIDTH + 16}px`);
    const broken: WidthStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const { width, press } = mount(broken);
    press('ArrowRight');
    expect(width()).toBe(`${DEFAULT_WIDTH + 16}px`);
  });
});
