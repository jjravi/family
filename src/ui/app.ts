import { decode } from '../codec/decode';
import { encode } from '../codec/encode';
import { SAMPLE_DSL } from '../dsl/sample';
import { preparePrint } from '../export/print';
import { createCanvasMeasurer, type TextMeasurer } from '../layout/measure';
import { hasErrors } from '../model/types';
import { renderPoster } from '../pipeline';
import { loadFonts } from '../themes/fonts';
import { h } from './dom';
import { createEditor } from './editor';
import { createExportBar, type ExportSource } from './exports';
import { posterTitle } from './filename';
import { createOptionsBar } from './options';
import { createPreview } from './preview';
import { createChatbotActions, promptMode } from './prompt';
import { sanitizeSvg } from './sanitize';
import { createShareControl } from './share';
import { createSplitter } from './splitter';
import { createSync, type Poster, type SyncState } from './sync';
import { errorMessage, isBlank } from './text';
import './styles.css';

const APP_NAME = 'Family Tree';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** The poster on screen, sanitized once per render. */
interface Shown {
  poster: Poster;
  element: SVGSVGElement;
  /** Sanitized markup for print and export. */
  markup: string;
  title: string;
}

function logo(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('class', 'logo');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML =
    '<rect width="32" height="32" rx="8" fill="currentColor"/>' +
    '<path d="M16 22v-5m0 0-5.5-4.5M16 17l5.5-4.5" fill="none" stroke="#fbf7ee" stroke-width="2" stroke-linecap="round"/>' +
    '<circle cx="10" cy="10.5" r="3" fill="#fbf7ee"/><circle cx="22" cy="10.5" r="3" fill="#fbf7ee"/><circle cx="16" cy="24" r="3" fill="#fbf7ee"/>';
  return svg;
}

function placeholderFor(state: SyncState): string {
  if (isBlank(state.dsl)) return 'Press Copy prompt, paste it into your chatbot, and describe your family after it. Then paste the reply into the editor, or load the example.';
  if (hasErrors(state.diagnostics)) return 'Fix the highlighted lines in the editor to draw your poster.';
  return 'The poster could not be drawn.';
}

/** Why the poster on screen is not the editor's text, or null when it is. */
function staleLabel(state: SyncState): string | null {
  if (!state.stale) return null;
  if (isBlank(state.dsl)) return 'Showing the last poster. Paste or type a tree to replace it.';
  if (hasErrors(state.diagnostics)) return 'Showing the last version that worked. Fix the errors to update it.';
  return 'Showing the last version that worked.';
}

/**
 * Builds the page in `root` and wires it (spec "UI"): editor and options feed
 * the sync controller, which owns the URL; each state it emits is painted
 * into the editor diagnostics, preview, options bar, and export buttons.
 */
export async function startApp(root: HTMLElement): Promise<void> {
  let measure: TextMeasurer | undefined;
  const ready = loadFonts().then(() => {
    try {
      measure = createCanvasMeasurer();
    } catch {
      measure = undefined; // No canvas: renderPoster falls back to its estimate.
    }
  });

  const chatbot = createChatbotActions(() => editor.value);
  const editor = createEditor(
    {
      onEdit(dsl) {
        chatbot.setMode(promptMode(dsl));
        sync.edit(dsl);
      },
      onReplace(dsl) {
        chatbot.setMode(promptMode(dsl));
        void sync.replace(dsl);
      },
    },
    { actions: chatbot.element, describedBy: chatbot.hintId },
  );
  const options = createOptionsBar(
    () => sync.style,
    (style) => void sync.setStyle(style),
  );
  const preview = createPreview();
  const exportBar = createExportBar(exportSource);
  const share = createShareControl(settle);
  const banner = h('p', { class: 'banner', role: 'alert', hidden: true });

  const side = h('aside', { class: 'side', id: 'side-panel', 'aria-label': 'Tree text' }, editor.element);
  const main = h('main', { class: 'main' }, options.element, preview.element, exportBar.element);
  const layout = h(
    'div',
    { class: 'app' },
    h(
      'header',
      { class: 'app-header' },
      h('div', { class: 'brand' }, logo(), h('div', {}, h('h1', {}, APP_NAME), h('p', { class: 'tagline' }, 'Describe a family. Print a poster.'))),
      share,
    ),
    banner,
    side,
    main,
  );
  layout.insertBefore(createSplitter({ layout, side }), main);
  root.replaceChildren(layout);
  preview.show({ svg: null, page: null, stale: null, placeholder: 'Drawing your poster…', notices: [] });

  let current: SyncState | null = null;
  let presented: Poster | null = null;
  let shown: Shown | null = null;
  /** Problems displaying or preparing to print the presented poster. */
  let problems: string[] = [];

  function present(poster: Poster | null): void {
    presented = poster;
    shown = null;
    problems = [];
    if (!poster) return;
    const safe = sanitizeSvg(poster.svg);
    if (!safe) {
      problems = ['The poster could not be displayed.'];
      return;
    }
    try {
      preparePrint(safe.markup, poster.page);
    } catch (error) {
      problems = [`Printing is not ready: ${errorMessage(error)}`];
    }
    shown = { poster, element: safe.element, markup: safe.markup, title: posterTitle(poster.tree) };
  }

  function showMessage(message: string | null): void {
    banner.textContent = message ?? '';
    banner.hidden = message === null;
  }

  function paint(state: SyncState): void {
    current = state;
    if (state.poster !== presented) present(state.poster);
    const blank = isBlank(state.dsl);
    const notices = [...(blank ? [] : state.notices), ...problems, ...(shown?.poster.notices ?? [])];
    editor.showDiagnostics(blank ? [] : state.diagnostics);
    preview.show({
      svg: shown?.element ?? null,
      page: shown?.poster.page ?? null,
      stale: staleLabel(state),
      placeholder: placeholderFor(state),
      notices: [...new Set(notices)],
    });
    options.show(sync.style, state.focusCount);
    exportBar.setAvailable(shown !== null);
    showMessage(state.message);
    document.title = shown?.title ? `${shown.title} · ${APP_NAME}` : APP_NAME;
  }

  async function settle(): Promise<void> {
    if (!sync.idle) await sync.flush();
  }

  async function exportSource(): Promise<ExportSource | null> {
    await settle();
    if (!shown) return null;
    return { svg: shown.markup, page: shown.poster.page, title: shown.title, stale: current?.stale ?? false };
  }

  const sync = createSync(
    {
      decode,
      encode,
      render: (input) => renderPoster({ ...input, measure }),
      shareBase: () => `${location.origin}${location.pathname}`,
      replaceFragment(fragment) {
        try {
          history.replaceState(history.state, '', `${location.origin}${location.pathname}#${fragment}`);
        } catch {
          // Safari throttles replaceState; the next update writes the URL again.
        }
      },
      ready,
      sampleDsl: SAMPLE_DSL,
    },
    {
      loaded(dsl, style, message) {
        editor.load(dsl);
        chatbot.setMode(promptMode(dsl));
        options.show(style, 0);
        showMessage(message);
      },
      updated: paint,
    },
  );

  window.addEventListener('hashchange', () => void sync.load(location.hash));
  await sync.load(location.hash);
}
