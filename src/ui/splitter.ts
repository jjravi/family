import { h, setAttrs } from './dom';

/** Keep in step with the sidebar column in styles.css. */
export const MIN_SIDE_PX = 300;
/** Width the preview keeps when the sidebar grows; keep in step with styles.css. */
export const MIN_MAIN_PX = 400;
const KEY_STEP_PX = 16;
const KEY_STEP_LARGE_PX = 80;
const STORAGE_KEY = 'family-tree:side-width';
const WIDTH_PROPERTY = '--side-width';

export type WidthStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The sidebar widths allowed in a layout `total` pixels wide. */
function sideWidthRange(total: number): [min: number, max: number] {
  return [MIN_SIDE_PX, Math.max(MIN_SIDE_PX, total - MIN_MAIN_PX)];
}

export function clampSideWidth(width: number, total: number): number {
  const [min, max] = sideWidthRange(total);
  return Math.round(Math.min(max, Math.max(min, width)));
}

function browserStore(): WidthStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export interface SplitterOptions {
  /** The grid whose sidebar column follows `--side-width`. */
  layout: HTMLElement;
  /** The sidebar; its id goes in aria-controls. */
  side: HTMLElement;
  /** Where the chosen width persists; defaults to localStorage. */
  store?: WidthStore | null;
}

/**
 * The divider on the sidebar's edge (WAI-ARIA window splitter): drag it or use
 * the arrow keys (Shift for bigger steps, Home and End for the limits), and
 * double-click to restore the default width. Only the width is stored.
 */
export function createSplitter({ layout, side, store = browserStore() }: SplitterOptions): HTMLElement {
  const handle = h('div', {
    class: 'splitter',
    role: 'separator',
    tabindex: 0,
    'aria-orientation': 'vertical',
    'aria-controls': side.id,
    'aria-label': 'Resize the tree panel',
    title: 'Drag to resize. Double-click to reset.',
  });

  function refresh(): void {
    const width = Math.round(side.getBoundingClientRect().width);
    const [min, max] = sideWidthRange(layout.clientWidth);
    setAttrs(handle, { 'aria-valuemin': min, 'aria-valuemax': max, 'aria-valuenow': width, 'aria-valuetext': `${width} pixels` });
  }

  function setWidth(width: number): void {
    layout.style.setProperty(WIDTH_PROPERTY, `${clampSideWidth(width, layout.clientWidth)}px`);
    refresh();
  }

  function save(): void {
    const width = parseFloat(layout.style.getPropertyValue(WIDTH_PROPERTY));
    try {
      if (Number.isFinite(width)) store?.setItem(STORAGE_KEY, String(width));
      else store?.removeItem(STORAGE_KEY);
    } catch {
      // Storage full or blocked: the width lasts for this visit only.
    }
  }

  function restore(): void {
    let saved = Number.NaN;
    try {
      saved = Number(store?.getItem(STORAGE_KEY) ?? Number.NaN);
    } catch {
      return;
    }
    // Before the first layout there is no width to clamp against; the stylesheet caps it to the window.
    if (Number.isFinite(saved) && saved > 0) layout.style.setProperty(WIDTH_PROPERTY, `${Math.max(MIN_SIDE_PX, Math.round(saved))}px`);
  }

  function reset(): void {
    layout.style.removeProperty(WIDTH_PROPERTY);
    save();
    refresh();
  }

  let drag: { pointerId: number; offset: number } | null = null;

  handle.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    drag = { pointerId: event.pointerId, offset: event.clientX - side.getBoundingClientRect().right };
    handle.setPointerCapture(event.pointerId);
    layout.classList.add('is-resizing');
  });

  handle.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    setWidth(event.clientX - drag.offset - side.getBoundingClientRect().left);
  });

  const finish = (event: PointerEvent): void => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = null;
    layout.classList.remove('is-resizing');
    save();
  };
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
  handle.addEventListener('lostpointercapture', finish);

  handle.addEventListener('keydown', (event) => {
    const width = side.getBoundingClientRect().width;
    const step = event.shiftKey ? KEY_STEP_LARGE_PX : KEY_STEP_PX;
    const targets: Record<string, number> = {
      ArrowLeft: width - step,
      ArrowRight: width + step,
      Home: 0,
      End: Number.POSITIVE_INFINITY,
    };
    const target = targets[event.key];
    if (target === undefined) return;
    event.preventDefault();
    setWidth(target);
    save();
  });

  handle.addEventListener('dblclick', reset);

  restore();
  refresh();
  if (typeof ResizeObserver === 'function') new ResizeObserver(refresh).observe(side);
  return handle;
}
