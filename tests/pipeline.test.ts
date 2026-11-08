import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from '../src/dsl/parse';
import { approxMeasurer, type TextMeasurer } from '../src/layout/measure';
import { emptyTree, type Diagnostic } from '../src/model/types';
import { renderPoster } from '../src/pipeline';
import { drawPoster, type DrawResult } from '../src/render/poster';
import { DEFAULT_STYLE, resolveStyle, type Style } from '../src/style';
import { exampleTree } from './fixtures/example-tree';

vi.mock('../src/dsl/parse', () => ({ parse: vi.fn(), stripCodeFence: vi.fn() }));
vi.mock('../src/render/poster', () => ({ drawPoster: vi.fn() }));

const parseMock = vi.mocked(parse);
const drawMock = vi.mocked(drawPoster);
const style: Style = { ...DEFAULT_STYLE };
const dsl = 'focus: Sarah + Dave Ruiz';

function drawn(overrides: Partial<DrawResult> = {}): DrawResult {
  return { svg: '<svg/>', ...resolveStyle(style, 2), notices: ['link too long for QR'], ...overrides };
}

beforeEach(() => {
  parseMock.mockReset();
  drawMock.mockReset();
});

describe('renderPoster', () => {
  it('draws a tree without errors, passing the default measurer, share URL, and DSL seed', () => {
    const tree = exampleTree();
    const warnings: Diagnostic[] = [
      { line: 9, severity: 'warning', message: 'b' },
      { line: 2, severity: 'warning', message: 'a' },
    ];
    parseMock.mockReturnValue({ tree, diagnostics: warnings });
    drawMock.mockReturnValue(drawn());

    const result = renderPoster({ dsl, style, shareUrl: 'https://family.jostache.com/#v=1' });

    expect(drawMock).toHaveBeenCalledWith(tree, style, { measure: approxMeasurer, shareUrl: 'https://family.jostache.com/#v=1', seed: dsl });
    expect(result).toEqual({
      ok: true,
      diagnostics: [warnings[1], warnings[0]],
      notices: ['link too long for QR'],
      tree,
      focusCount: 2,
      ...resolveStyle(style, 2),
      svg: '<svg/>',
    });
  });

  it('passes a custom measurer through', () => {
    const measure: TextMeasurer = { width: () => 1 };
    parseMock.mockReturnValue({ tree: exampleTree(), diagnostics: [] });
    drawMock.mockReturnValue(drawn());
    renderPoster({ dsl, style, shareUrl: null, measure });
    expect(drawMock.mock.calls[0]![2]).toEqual({ measure, shareUrl: null, seed: dsl });
  });

  it('stops on parse errors and reports them sorted by line, stable within a line', () => {
    const diagnostics: Diagnostic[] = [
      { line: 7, severity: 'error', message: 'Ana is already a child on line 5' },
      { line: 0, severity: 'error', message: 'Missing focus' },
      { line: 7, severity: 'warning', message: 'second on line 7' },
    ];
    const tree = { ...exampleTree(), focus: [] };
    parseMock.mockReturnValue({ tree, diagnostics });

    const result = renderPoster({ dsl, style, shareUrl: null });

    expect(drawMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, svg: null, tree, focusCount: 0, layout: null, orientation: null, page: null, notices: [] });
    expect(result.diagnostics.map((d) => d.message)).toEqual(['Missing focus', 'Ana is already a child on line 5', 'second on line 7']);
  });

  it('still resolves layout and page when errors block a tree that has a focus', () => {
    parseMock.mockReturnValue({ tree: exampleTree(), diagnostics: [{ line: 4, severity: 'error', message: 'x' }] });
    const result = renderPoster({ dsl, style: { ...style, layout: 'bowtie' }, shareUrl: null });
    expect(result).toMatchObject({ ok: false, focusCount: 2, layout: 'bowtie', orientation: 'landscape', svg: null });
    expect(result.page).toMatchObject({ width: 1728, height: 1296 });
  });

  it('turns an engine exception into ok: false with a notice', () => {
    parseMock.mockReturnValue({ tree: exampleTree(), diagnostics: [] });
    drawMock.mockImplementation(() => {
      throw new Error('not implemented: drawPoster');
    });
    const result = renderPoster({ dsl, style, shareUrl: null });
    expect(result).toMatchObject({ ok: false, svg: null, focusCount: 2, layout: 'converge' });
    expect(result.notices).toEqual(['Could not draw the poster: not implemented: drawPoster']);
  });

  it('turns a parser exception into ok: false with a notice', () => {
    parseMock.mockImplementation(() => {
      throw new Error('boom');
    });
    const result = renderPoster({ dsl, style, shareUrl: null });
    expect(result).toEqual({
      ok: false,
      diagnostics: [],
      notices: ['The parser failed: boom'],
      tree: null,
      focusCount: 0,
      layout: null,
      orientation: null,
      page: null,
      svg: null,
    });
  });

  it('refuses to draw without a focus even if the parser reported no error', () => {
    parseMock.mockReturnValue({ tree: emptyTree(), diagnostics: [] });
    const result = renderPoster({ dsl: '', style, shareUrl: null });
    expect(drawMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.notices).toHaveLength(1);
  });
});
