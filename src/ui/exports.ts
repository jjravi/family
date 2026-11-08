import { downloadBlob } from '../export/download';
import { exportPng, pngSize } from '../export/png';
import { printPoster } from '../export/print';
import { exportSvg } from '../export/svg';
import type { PageGeometry } from '../style';
import { h, icon } from './dom';
import { posterFilename } from './filename';
import { ICONS } from './icons';
import { errorMessage } from './text';

/** PNG resolution for print shops (spec "Print and export"). */
const PNG_DPI = 300;

/** What the export buttons work from: the poster on screen. */
export interface ExportSource {
  /** Poster markup (sanitized). */
  svg: string;
  page: PageGeometry;
  /** Poster title, for file names. */
  title: string;
  /** True when the editor has errors and this is the last good poster. */
  stale: boolean;
}

export interface ExportBar {
  readonly element: HTMLElement;
  /** Enables the buttons while there is a poster to export. */
  setAvailable(available: boolean): void;
}

/** Print / Save PDF, Download PNG, and Download SVG (spec "Share and export"). */
export function createExportBar(source: () => Promise<ExportSource | null>): ExportBar {
  const printButton = h('button', { type: 'button', class: 'btn' }, icon(ICONS.print), 'Print / Save PDF');
  const pngButton = h('button', { type: 'button', class: 'btn' }, icon(ICONS.download), 'Download PNG');
  const svgButton = h('button', { type: 'button', class: 'btn' }, icon(ICONS.download), 'Download SVG');
  const buttons = [printButton, pngButton, svgButton];
  const progress = h('progress', { class: 'export-progress', 'aria-label': 'Making the PNG' });
  const status = h('p', { class: 'export-status', role: 'status' });
  const element = h(
    'section',
    { class: 'export-bar', 'aria-label': 'Print and export' },
    h('div', { class: 'export-buttons' }, ...buttons),
    h('div', { class: 'export-feedback' }, progress, status),
    h(
      'p',
      { class: 'export-note' },
      'For a print shop, Print → Save as PDF or the PNG is safest: some PDF tools ignore the fonts embedded in the SVG.',
    ),
  );
  progress.hidden = true;

  let available = false;
  let busy = false;
  const refresh = (): void => {
    for (const button of buttons) button.disabled = !available || busy;
  };

  function say(text: string, tone: 'ok' | 'error' = 'ok'): void {
    status.textContent = text;
    status.dataset.tone = tone;
  }

  async function run(task: (poster: ExportSource) => Promise<string | null>): Promise<void> {
    if (busy) return;
    busy = true;
    refresh();
    try {
      const poster = await source();
      if (!poster) {
        say('There is no poster to export yet.', 'error');
        return;
      }
      const done = await task(poster);
      if (done === null) return;
      say(poster.stale ? `${done} It is the last version that worked: fix the errors to include your latest edits.` : done);
    } catch (error) {
      say(`Export failed: ${errorMessage(error)}`, 'error');
    } finally {
      busy = false;
      progress.hidden = true;
      refresh();
    }
  }

  printButton.addEventListener('click', () =>
    run(async (poster) => {
      say('');
      printPoster(poster.svg, poster.page);
      return poster.stale ? 'Opened the print dialog.' : null;
    }),
  );

  pngButton.addEventListener('click', () =>
    run(async (poster) => {
      const target = pngSize(poster.page, PNG_DPI);
      progress.hidden = false;
      say(`Making a ${target.width} × ${target.height} px PNG at ${PNG_DPI} DPI…`);
      const png = await exportPng(poster.svg, poster.page, PNG_DPI);
      const filename = posterFilename(poster.title, poster.page, 'png');
      downloadBlob(png.blob, filename);
      const fallback = png.dpi < PNG_DPI ? ` This browser could not draw ${PNG_DPI} DPI at this size, so it used ${png.dpi} DPI.` : '';
      return `Saved ${filename} (${png.width} × ${png.height} px, ${png.dpi} DPI).${fallback}`;
    }),
  );

  svgButton.addEventListener('click', () =>
    run(async (poster) => {
      const blob = await exportSvg(poster.svg);
      const filename = posterFilename(poster.title, poster.page, 'svg');
      downloadBlob(blob, filename);
      return `Saved ${filename}.`;
    }),
  );

  refresh();
  return {
    element,
    setAvailable(next) {
      available = next;
      refresh();
    },
  };
}
