import { h, icon, uid } from './dom';
import { ICONS } from './icons';
import { clampView, fitView, zoomAt, type Insets, type Point, type Size, type View } from './zoom';

/** CSS pixels per poster point at the printed size (96 px and 72 pt per inch). */
const PRINT_SCALE = 96 / 72;
const MIN_ZOOM_OF_FIT = 0.5;
const MAX_ZOOM_OF_PRINT = 4;
const KEEP_VISIBLE_PX = 64;
const DRAG_THRESHOLD_PX = 4;
const WHEEL_SPEED = 0.0015;
const PINCH_SPEED = 0.01;
const STEP = 1.25;
const KEY_PAN_PX = 48;
/** Zoom bar offset from the viewport edge (styles.css) plus breathing room. */
const ZOOM_BAR_GAP_PX = 22;

export interface PreviewContent {
  /** The poster element (sanitized), or null. */
  svg: SVGSVGElement | null;
  /** Page size in points; the artboard is sized to it. */
  page: Size | null;
  /** When set, the poster is the last good render, not the current text: it dims under this message. */
  stale: string | null;
  /** Shown when there is no poster. */
  placeholder: string;
  /** Messages shown above the preview: engine notices and failures. */
  notices: readonly string[];
}

export interface Preview {
  readonly element: HTMLElement;
  show(content: PreviewContent): void;
  /** Back to fit-to-width, capped by the height so the whole artboard shows. */
  fit(): void;
}

/** Safari's non-standard trackpad pinch event. */
interface GestureLike extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function samePage(a: Size | null, b: Size | null): boolean {
  return a === b || (a !== null && b !== null && a.width === b.width && a.height === b.height);
}

function iconButton(path: string, label: string): HTMLButtonElement {
  return h('button', { type: 'button', class: 'btn ghost icon-only', 'aria-label': label, title: label }, icon(path));
}

/** The preview pane (spec "UI", right): the exact print artboard in a zoom-and-pan viewport. */
export function createPreview(): Preview {
  const helpId = uid('preview-help');
  const stage = h('div', { class: 'stage' });
  const placeholder = h('p', { class: 'placeholder' });
  const staleBadge = h('p', { class: 'stale-badge' });
  const viewport = h(
    'div',
    {
      class: 'viewport',
      tabindex: 0,
      role: 'group',
      'aria-roledescription': 'zoomable preview',
      'aria-label': 'Poster preview',
      'aria-describedby': helpId,
    },
    stage,
    placeholder,
    staleBadge,
  );
  const notices = h('ul', { class: 'notices' });
  const noticeRegion = h('div', { class: 'notice-region', role: 'status' }, notices);
  const zoomOut = iconButton(ICONS.minus, 'Zoom out');
  const zoomIn = iconButton(ICONS.plus, 'Zoom in');
  const level = h('span', { class: 'zoom-level', title: 'Zoom (100% is the printed size)' });
  const fitButton = h('button', { type: 'button', class: 'btn ghost small', title: 'Fit the whole page (double-click)' }, icon(ICONS.fit), 'Fit');
  const zoomBar = h('div', { class: 'zoom-bar' }, zoomOut, level, zoomIn, fitButton);
  const element = h(
    'section',
    { class: 'preview', 'aria-label': 'Preview' },
    noticeRegion,
    h('div', { class: 'viewport-wrap' }, viewport, zoomBar),
    h('p', { id: helpId, class: 'visually-hidden' }, 'Scroll or pinch to zoom, drag to pan, double-click to fit. Keys: plus and minus zoom, arrows pan, 0 fits.'),
  );

  let page: Size | null = null;
  let svg: SVGSVGElement | null = null;
  let view: View = { scale: 1, x: 0, y: 0 };
  let fitted = true;
  let shownNotices = '';

  const box = (): Size => ({ width: viewport.clientWidth, height: viewport.clientHeight });
  const center = (): Point => ({ x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 });

  /** Margins around the fitted page; the bottom one keeps the zoom bar off the artboard. */
  function insets(): Insets {
    const pad = viewport.clientWidth < 600 ? 14 : 32;
    const bar = zoomBar.offsetHeight > 0 ? zoomBar.offsetHeight + ZOOM_BAR_GAP_PX : 0;
    return { top: pad, right: pad, bottom: Math.max(pad, bar), left: pad };
  }

  function limits(): [min: number, max: number] {
    const fitScale = page ? fitView(box(), page, insets()).scale : 1;
    return [fitScale * MIN_ZOOM_OF_FIT, Math.max(fitScale * 2, PRINT_SCALE * MAX_ZOOM_OF_PRINT)];
  }

  function apply(): void {
    stage.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    level.textContent = svg ? `${Math.round((view.scale / PRINT_SCALE) * 100)}%` : '';
    // At fit, one-finger vertical swipes scroll the page (the panes stack on phones); zoomed in, they pan.
    viewport.style.touchAction = fitted ? 'pan-y' : 'none';
  }

  function fit(): void {
    if (!page) return;
    const size = box();
    if (size.width === 0 || size.height === 0) return;
    view = fitView(size, page, insets());
    fitted = true;
    apply();
  }

  function setView(next: View): void {
    if (!page) return;
    view = clampView(next, box(), page, KEEP_VISIBLE_PX);
    fitted = false;
    apply();
  }

  function zoomBy(factor: number, anchor: Point): void {
    const [min, max] = limits();
    setView(zoomAt(view, factor, anchor, min, max));
  }

  let origin = { left: 0, top: 0 };
  const local = (event: { clientX: number; clientY: number }): Point => ({ x: event.clientX - origin.left, y: event.clientY - origin.top });
  const measureOrigin = (): void => {
    const rect = viewport.getBoundingClientRect();
    origin = { left: rect.left, top: rect.top };
  };

  const pointers = new Map<number, Point>();
  let gesture: { view: View; points: Point[]; moved: boolean } | null = null;

  function restartGesture(): void {
    gesture = pointers.size > 0 && svg ? { view, points: [...pointers.values()], moved: pointers.size > 1 } : null;
    viewport.classList.toggle('is-dragging', gesture !== null);
  }

  viewport.addEventListener('pointerdown', (event) => {
    if (!svg || (event.pointerType === 'mouse' && event.button !== 0)) return;
    measureOrigin();
    viewport.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, local(event));
    restartGesture();
  });

  viewport.addEventListener('pointermove', (event) => {
    if (!gesture || !pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, local(event));
    const now = [...pointers.values()];
    const [a0, b0] = gesture.points;
    const [a1, b1] = now;
    if (!a0 || !a1) return;
    if (b0 && b1) {
      const [min, max] = limits();
      const from = midpoint(a0, b0);
      const to = midpoint(a1, b1);
      const zoomed = zoomAt(gesture.view, distance(a1, b1) / Math.max(1, distance(a0, b0)), from, min, max);
      setView({ scale: zoomed.scale, x: zoomed.x + to.x - from.x, y: zoomed.y + to.y - from.y });
      return;
    }
    if (!gesture.moved && distance(a0, a1) < DRAG_THRESHOLD_PX) return;
    gesture.moved = true;
    setView({ ...gesture.view, x: gesture.view.x + a1.x - a0.x, y: gesture.view.y + a1.y - a0.y });
  });

  const release = (event: PointerEvent): void => {
    if (pointers.delete(event.pointerId)) restartGesture();
  };
  viewport.addEventListener('pointerup', release);
  viewport.addEventListener('pointercancel', release);
  viewport.addEventListener('lostpointercapture', release);

  viewport.addEventListener(
    'wheel',
    (event) => {
      if (!svg) return;
      event.preventDefault();
      measureOrigin();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
      const speed = event.ctrlKey ? PINCH_SPEED : WHEEL_SPEED;
      zoomBy(Math.exp(-event.deltaY * unit * speed), local(event));
    },
    { passive: false },
  );

  let gestureScale = 1;
  viewport.addEventListener('gesturestart', (event) => {
    event.preventDefault();
    gestureScale = 1;
  });
  viewport.addEventListener('gesturechange', (event) => {
    const pinch = event as GestureLike;
    event.preventDefault();
    if (!svg) return;
    measureOrigin();
    zoomBy(pinch.scale / gestureScale, local(pinch));
    gestureScale = pinch.scale;
  });

  viewport.addEventListener('dblclick', fit);
  viewport.addEventListener('keydown', (event) => {
    if (!svg || event.metaKey || event.ctrlKey || event.altKey) return;
    const moves: Record<string, () => void> = {
      '+': () => zoomBy(STEP, center()),
      '=': () => zoomBy(STEP, center()),
      '-': () => zoomBy(1 / STEP, center()),
      _: () => zoomBy(1 / STEP, center()),
      '0': fit,
      ArrowLeft: () => setView({ ...view, x: view.x + KEY_PAN_PX }),
      ArrowRight: () => setView({ ...view, x: view.x - KEY_PAN_PX }),
      ArrowUp: () => setView({ ...view, y: view.y + KEY_PAN_PX }),
      ArrowDown: () => setView({ ...view, y: view.y - KEY_PAN_PX }),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    move();
  });

  zoomIn.addEventListener('click', () => zoomBy(STEP, center()));
  zoomOut.addEventListener('click', () => zoomBy(1 / STEP, center()));
  fitButton.addEventListener('click', fit);

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      if (fitted) fit();
      else setView(view);
    }).observe(viewport);
  }

  function showNotices(items: readonly string[]): void {
    const key = items.join('\n');
    if (key === shownNotices) return;
    shownNotices = key;
    notices.replaceChildren(...items.map((text) => h('li', { class: 'notice' }, icon(ICONS.info), h('span', {}, text))));
  }

  function show(content: PreviewContent): void {
    if (content.svg !== svg) {
      svg = content.svg;
      stage.replaceChildren(...(svg ? [svg] : []));
    }
    const next = svg ? content.page : null;
    const resized = !samePage(page, next);
    page = next;
    if (page) {
      stage.style.width = `${page.width}px`;
      stage.style.height = `${page.height}px`;
    }
    stage.hidden = svg === null;
    if (resized) fit();
    apply();
    viewport.classList.toggle('is-stale', content.stale !== null && svg !== null);
    staleBadge.textContent = content.stale ?? '';
    placeholder.textContent = content.placeholder;
    placeholder.hidden = svg !== null || content.placeholder === '';
    for (const button of [zoomOut, zoomIn, fitButton]) button.disabled = svg === null;
    showNotices(content.notices);
  }

  return { element, show, fit };
}
