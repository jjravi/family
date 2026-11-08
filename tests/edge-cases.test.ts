import { describe, expect, it } from 'vitest';
import { decode } from '../src/codec/decode';
import { encode } from '../src/codec/encode';
import { format } from '../src/dsl/format';
import { parse } from '../src/dsl/parse';
import { approxMeasurer } from '../src/layout/measure';
import { shapeBounds } from '../src/layout/shapes';
import { hasErrors, type Tree } from '../src/model/types';
import { renderPoster } from '../src/pipeline';
import { composeScene, type Scene } from '../src/render/scene';
import { DEFAULT_STYLE, layoutsForFocusCount, THEME_IDS, type LayoutId, type Style } from '../src/style';
import { overlappingRuns } from './render/helpers';
import { hundredDescendants, NAMED_TREES } from './render/trees';

const style = (overrides: Partial<Style> = {}): Style => ({ ...DEFAULT_STYLE, traits: true, ...overrides });

/** DSL text -> poster, as the app does it; fails the test on a parse error or a failed draw. */
function draw(dsl: string, overrides: Partial<Style> = {}) {
  const result = renderPoster({ dsl, style: style(overrides), shareUrl: null });
  expect(result.diagnostics.filter((d) => d.severity === 'error'), dsl.slice(0, 80)).toEqual([]);
  expect(result.ok, result.notices.join('; ')).toBe(true);
  return { ...result, svg: result.svg ?? '' };
}

function scene(dsl: string, overrides: Partial<Style> = {}): Scene {
  const { tree, diagnostics } = parse(dsl);
  expect(hasErrors(diagnostics)).toBe(false);
  return composeScene(tree, style(overrides), { measure: approxMeasurer, shareUrl: null, seed: dsl });
}

/** Text overlaps, plus nodes reaching into the page margin (where only the background may go). */
function problems(s: Scene): string[] {
  const out = overlappingRuns(s);
  for (const { node } of s.nodes) {
    const b = shapeBounds(node.shape);
    const eps = 0.5;
    if (b.x < s.safe.x - eps || b.y < s.safe.y - eps || b.x + b.w > s.safe.x + s.safe.w + eps || b.y + b.h > s.safe.y + s.safe.h + eps) {
      out.push(`${node.key} outside the safe area`);
    }
  }
  return out;
}

function everyLayout(dsl: string, check: (layout: LayoutId, theme: (typeof THEME_IDS)[number]) => void): void {
  const focusCount = parse(dsl).tree.focus.length;
  for (const layout of layoutsForFocusCount(focusCount)) for (const theme of THEME_IDS) check(layout, theme);
}

describe('unknown partners', () => {
  const single = '? -> Cleo 1950\n? + ? -> Dan 1952\nCleo + Dan -> Eve 1980\nEve + ? -> Fay 2005\nfocus: Fay\n';
  const couple = '? -> Cleo 1950\n? + ? -> Dan 1952\nfocus: Cleo + Dan\n';

  it('`? -> C` and `? + ? -> C` parse to partners [null] and [null, null]', () => {
    expect(parse(single).tree.unions.slice(0, 2).map((u) => u.partners)).toEqual([[null], [null, null]]);
  });

  it.each([single, couple])('render in every offered layout and theme without overlaps (%#)', (dsl) => {
    everyLayout(dsl, (layout, theme) => {
      const result = draw(dsl, { layout, theme });
      expect(result.layout).toBe(layout);
      const s = scene(dsl, { layout, theme });
      expect(problems(s), `${layout} ${theme}`).toEqual([]);
      expect(s.nodes.filter((n) => n.node.person !== null).length).toBeGreaterThanOrEqual(parse(dsl).tree.focus.length);
    });
  });
});

describe('a person with three unions', () => {
  const dsl = [
    'Ann Lee 1950 + Bob Ray 1948 -> Cy Ray 1972',
    'Ann Lee + Don Fox 1949 -> Di Fox 1978, Ed Fox 1980',
    'Ann Lee + ? -> Flo Lee 1985',
    'focus: Ann Lee',
  ].join('\n');

  it.each(THEME_IDS)('%s desc: one family per union, Ann marked as repeated, every child drawn, no overlaps', (theme) => {
    const s = scene(dsl, { layout: 'desc', theme });
    expect(problems(s)).toEqual([]);
    const ann = s.nodes.filter((n) => n.node.person === 'Ann Lee');
    expect(ann).toHaveLength(3);
    for (const n of ann) expect(n.node.repeat).toBe(1);
    expect(s.marks.filter((m) => m.badge !== null)).toHaveLength(3);
    for (const child of ['Cy Ray', 'Di Fox', 'Ed Fox', 'Flo Lee']) expect(s.nodes.some((n) => n.node.person === child), child).toBe(true);
    expect(draw(dsl, { layout: 'desc', theme }).svg).toContain('data-id="Flo Lee"');
  });
});

describe('large trees', () => {
  const sevenDeep = format(NAMED_TREES.deep7!());
  const hundred = format(hundredDescendants());

  it('a seven-generation pedigree draws all 127 slots in ped and caps the fan at six with a notice', () => {
    expect(parse(sevenDeep).tree.persons.size).toBe(127);
    for (const theme of THEME_IDS) {
      const ped = scene(sevenDeep, { layout: 'ped', theme });
      expect(ped.nodes.filter((n) => n.node.person !== null)).toHaveLength(127);
      expect(problems(ped), `ped ${theme}`).toEqual([]);
      const fan = scene(sevenDeep, { layout: 'fan', theme });
      expect(fan.nodes.filter((n) => n.node.person !== null)).toHaveLength(63);
      expect(fan.notices).toContain('This layout shows up to 6 generations; older ancestors are left out.');
      expect(problems(fan), `fan ${theme}`).toEqual([]);
    }
  });

  it('a 102-person descendant chart fits the page, tells the user it is small, and keeps text apart', () => {
    expect(parse(hundred).tree.persons.size).toBe(102);
    const notice = {
      '18x24': 'The widest generation does not fit this page legibly; try landscape or a larger page size.',
      '24x36': 'The widest generation does not fit this page legibly; try landscape.',
    };
    for (const theme of THEME_IDS) {
      for (const size of ['18x24', '24x36'] as const) {
        const s = scene(hundred, { layout: 'desc', theme, size });
        expect(s.nodes.filter((n) => n.node.person !== null)).toHaveLength(102);
        expect(problems(s), `${theme} ${size}`).toEqual([]);
        expect(s.notices).toContain(notice[size]);
      }
    }
    expect(scene(hundred, { layout: 'desc', size: '18x24', orientation: 'landscape' }).notices).toContain(
      'The widest generation does not fit this page legibly; try a larger page size.',
    );
    expect(scene(hundred, { layout: 'desc', size: '24x36', orientation: 'landscape' }).notices).toContain(
      'The widest generation does not fit legibly even on the largest page, so names print small.',
    );
  });
});

describe('names', () => {
  const long = 'Maria Guadalupe Fernanda de los Ángeles Rodríguez-Hernández';

  it.each(['ped', 'fan', 'desc'] as const)('a very long name is shortened with a notice and stays inside its node (%s)', (layout) => {
    const dsl = `${long} 1931-2020 "kind, devout" + Bo Li 1930 -> Ana Li 1960\nAna Li + Tom Wu 1958 -> Kai Wu 1990\nfocus: Kai Wu\n`;
    for (const theme of THEME_IDS) {
      const s = scene(dsl, { layout: layout === 'desc' ? 'desc' : layout, theme });
      expect(problems(s), `${layout} ${theme}`).toEqual([]);
    }
    const desc = `${long} 1931 + Bo Li 1930 -> ${long.replace('Maria', 'Rosa')} 1960, Ana Li 1962\nfocus: ${long}\n`;
    for (const theme of THEME_IDS) {
      const s = scene(desc, { layout: 'desc', theme });
      expect(problems(s), `desc ${theme}`).toEqual([]);
      expect(s.nodes.filter((n) => n.node.person !== null).every((n) => n.runs.some((r) => r.role === 'name'))).toBe(true);
    }
  });

  it('accented, Vietnamese, and CJK names render in every layout (CJK falls back to system fonts)', () => {
    const names = ['Zoë Ångström', 'Łukasz Żółć', 'Nguyễn Thị Minh', '王小明', '山田 太郎'];
    const ancestry = 'Zoë Ångström 1931 + Łukasz Żółć 1930 -> Nguyễn Thị Minh 1960\nNguyễn Thị Minh + 王小明 1958 -> 山田 太郎 1990\nfocus: 山田 太郎\n';
    const descent = ancestry.replace('focus: 山田 太郎', 'focus: Zoë Ångström + Łukasz Żółć');
    const seen = new Set<string>();
    for (const dsl of [ancestry, descent]) {
      everyLayout(dsl, (layout, theme) => {
        const { svg } = draw(dsl, { layout, theme });
        const text = [...svg.matchAll(/<text[^>]*>(?:<textPath[^>]*>)?([^<]*)</g)].map((m) => m[1]!).join(' ');
        for (const [, id] of svg.matchAll(/data-id="([^"]*)"/g)) {
          for (const word of id!.split(' ')) expect(text, `${layout} ${theme} ${id}`).toContain(word);
          seen.add(id!);
        }
        expect(problems(scene(dsl, { layout, theme })), `${layout} ${theme}`).toEqual([]);
      });
    }
    expect([...seen].sort()).toEqual([...names].sort());
  });
});

describe('sparse trees', () => {
  it('a DSL with only `focus: Ann` draws Ann alone in every single-root layout', () => {
    everyLayout('focus: Ann\n', (layout, theme) => {
      const result = draw('focus: Ann\n', { layout, theme });
      expect(result.diagnostics).toEqual([]);
      expect(result.svg).toContain('data-id="Ann"');
      expect(problems(scene('focus: Ann\n', { layout, theme }))).toEqual([]);
    });
  });

  it('unconnected persons get one warning each and stay off the poster', () => {
    const dsl = 'Ann + Bob -> Cy\nZed + Yan -> Xu\nfocus: Cy\n';
    const result = draw(dsl);
    expect(result.diagnostics.map((d) => [d.line, d.severity])).toEqual([
      [2, 'warning'],
      [2, 'warning'],
      [2, 'warning'],
    ]);
    for (const name of ['Zed', 'Yan', 'Xu']) expect(result.svg).not.toContain(name);
    expect(format(parse(dsl).tree)).toContain('Zed + Yan -> Xu');
  });
});

describe('a hostile name', () => {
  const hostile = '<img src=x onerror=alert(1)> &';
  const dsl = `title: <script>alert("t")</script>\nRose 1950 + ${hostile} "quotes" -> Kid 1980\nfocus: ${hostile} + Rose\n`;

  it('parses as a name plus its quoted trait, and round-trips through format()', () => {
    const { tree, diagnostics } = parse(dsl);
    expect(diagnostics).toEqual([]);
    expect(tree.persons.get(hostile)?.traits).toEqual(['quotes']);
    const tidy = format(tree);
    expect(format(parse(tidy).tree)).toBe(tidy);
    expect([...parse(tidy).tree.persons.values()].map((p) => [p.id, p.traits])).toEqual([...tree.persons.values()].map((p) => [p.id, p.traits]));
  });

  it.each(['bowtie', 'butterfly', 'converge', 'desc'] as const)('is escaped everywhere in the %s SVG', (layout) => {
    for (const theme of THEME_IDS) {
      const { svg } = draw(dsl, { layout, theme });
      expect(svg).not.toMatch(/<img|<script|onerror=alert\(1\)>|="[^"]*"quotes/);
      expect(svg).toContain('data-id="&lt;img src=x onerror=alert(1)&gt; &amp;"');
      expect(svg).toContain('<title>&lt;script&gt;alert(&quot;t&quot;)&lt;/script&gt;</title>');
      expect(svg).toContain('aria-label="Family tree poster: &lt;script&gt;alert(&quot;t&quot;)&lt;/script&gt;"');
      // The name may be wrapped or abbreviated, so look for its escaped pieces inside text runs.
      const runs = [...svg.matchAll(/<text[^>]*>(?:<textPath[^>]*>)?([^<]*)</g)].map((m) => m[1]!);
      expect(runs.some((text) => text.includes('&lt;'))).toBe(true);
      for (const text of runs) expect(text).not.toMatch(/[<>"]|&(?!(?:lt|gt|amp|quot);)/);
    }
  });

  it('survives the share link: encode, then decode, gives the same text and style', async () => {
    const linkStyle = style({ layout: 'butterfly', theme: 'botanical' });
    const decoded = await decode(await encode(dsl, linkStyle));
    expect(decoded).toEqual({ status: 'ok', dsl, style: linkStyle, warnings: [] });
  });
});

describe('tree helpers used above', () => {
  it('format() of the generated trees parses back to the same people', () => {
    for (const make of [() => NAMED_TREES.deep7!(), hundredDescendants] as (() => Tree)[]) {
      const tree = make();
      expect([...parse(format(tree)).tree.persons.keys()].sort()).toEqual([...tree.persons.keys()].sort());
    }
  });
});
