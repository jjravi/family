import type { RunRole } from '../layout/types';
import { physicalSize } from '../style';
import type { Theme } from '../themes/schema';
import { forkSvg, polarSvg, type EdgeContext } from './edges';
import { nodeShapeSvg, placeholderSvg } from './nodes';
import { frameSvg, joinSvg, titleOrnamentSvg } from './ornaments';
import { qrSvg } from './qr';
import { hashString } from './random';
import type { Scene } from './scene';
import { attrs, el, esc, num } from './svg';
import { Defs, textSvg } from './text';

function runColor(theme: Theme, role: RunRole): string {
  const { palette } = theme;
  if (role === 'name') return palette.ink;
  if (role === 'title') return palette.title;
  if (role === 'mark') return palette.accent;
  return palette.muted;
}

/** Page scale for strokes and ornaments: 1 at 18x24 in. */
function pageScale(scene: Scene): number {
  return Math.min(scene.safe.w, scene.safe.h) / 1188;
}

/** The scene as one standalone SVG document sized to the physical page. */
export function writeSvg(scene: Scene): string {
  const { page, theme } = scene;
  const { palette } = theme;
  const k = pageScale(scene);
  const prefix = `ft${hashString(`${scene.seed}|${scene.layout}|${theme.id}|${page.size}|${page.orientation}`).toString(36)}`;
  const defs = new Defs(prefix);
  const body: string[] = [];

  body.push(el('rect', { width: page.width, height: page.height, fill: palette.background }));
  if (palette.paper) {
    const paper = palette.paper;
    const id = defs.add((gid) =>
      el(
        'radialGradient',
        { id: gid, cx: '50%', cy: '45%', r: '75%' },
        el('stop', { offset: '0.55', 'stop-color': palette.background }) + el('stop', { offset: '1', 'stop-color': paper.edge }),
      ),
    );
    body.push(el('rect', { width: page.width, height: page.height, fill: `url(#${id})` }));
  }
  body.push(el('g', { class: 'frame' }, frameSvg(theme, scene.safe, scene.band, k)));

  const edgeCtx: EdgeContext = { theme, scale: scene.scale, page: k, seed: scene.seed };
  let edges = '';
  scene.links.forEach((link, i) => {
    if (link.kind === 'fork') edges += forkSvg(link, edgeCtx, `l${i}`);
    else if (link.kind === 'polar') edges += polarSvg(link, edgeCtx);
    else edges += joinSvg(theme, link);
  });
  body.push(el('g', { class: 'edges' }, edges));

  let nodes = '';
  for (const { node, runs } of scene.nodes) {
    if (node.person === null) {
      nodes += el('g', { class: 'placeholder' }, placeholderSvg(theme, node.shape, node.size, scene.scale));
      continue;
    }
    const shape = nodeShapeSvg(theme, node.shape, node.size, node.focus, scene.scale, k);
    const text = runs.map((run) => textSvg(run, runColor(theme, run.role), defs)).join('');
    nodes += el('g', { class: 'person', 'data-id': node.person }, shape + text);
  }
  body.push(el('g', { class: 'nodes' }, nodes));

  let marks = '';
  for (const mark of scene.marks) {
    if (mark.badge !== null) {
      const cx = mark.frame.x + mark.frame.w / 2;
      const cy = mark.frame.y + mark.frame.h / 2;
      marks += el('circle', { cx, cy, r: mark.badge, fill: palette.background, stroke: palette.accent, 'stroke-width': Math.max(0.5, mark.badge * 0.12) });
    }
    marks += textSvg(mark.run, runColor(theme, 'mark'), defs);
  }
  if (marks) body.push(el('g', { class: 'marks' }, marks));

  const { block, runs, size } = scene.title;
  const textBottom = Math.max(block.frame.y, ...runs.map((r) => (r.placement.kind === 'line' ? r.placement.y : 0)));
  const title = titleOrnamentSvg(theme, block, size, textBottom, k) + runs.map((run) => textSvg(run, runColor(theme, 'title'), defs)).join('');
  body.push(el('g', { class: 'title' }, title));

  if (scene.qr) {
    const { rect, url } = scene.qr;
    const code = qrSvg(url, rect.x, rect.y, rect.w, palette.ink);
    if (code) body.push(el('g', { class: 'qr' }, code));
  }

  const { width, height } = physicalSize(page);
  const label = `Family tree poster: ${block.text}`;
  const root = attrs({
    xmlns: 'http://www.w3.org/2000/svg',
    width,
    height,
    viewBox: `0 0 ${num(page.width)} ${num(page.height)}`,
    role: 'img',
    'aria-label': label,
    'data-layout': scene.layout,
    'data-theme': theme.id,
  });
  const defsSvg = defs.items.length > 0 ? `<defs>${defs.items.join('')}</defs>` : '';
  return `<svg${root}><title>${esc(block.text)}</title>${defsSvg}${body.join('')}</svg>`;
}
