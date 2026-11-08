import { FONT_FAMILIES } from './fonts/families';
import type { ThemeDefinition } from './schema';

const { jost } = FONT_FAMILIES;

/** White paper, Jost, thin straight connectors, text-only nodes. */
export const modern: ThemeDefinition = {
  id: 'modern',
  palette: {
    background: '#ffffff',
    paper: null,
    ink: '#1c1c1e',
    title: '#1c1c1e',
    accent: '#b4532a',
    muted: '#808086',
    placeholder: '#acacb2',
    node: '#ffffff',
    stroke: '#1c1c1e',
    edge: '#8e8e94',
  },
  type: {
    display: { family: jost, weight: 300, style: 'normal', tracking: 0.26, uppercase: true },
    coupleTitle: { family: jost, weight: 300, style: 'normal', tracking: 0.22, uppercase: true },
    name: { family: jost, weight: 500, style: 'normal', tracking: 0, uppercase: false },
    focusName: { family: jost, weight: 500, style: 'normal', tracking: 0, uppercase: false },
    dates: { family: jost, weight: 300, style: 'normal', tracking: 0.04, uppercase: false },
    trait: { family: jost, weight: 300, style: 'italic', tracking: 0, uppercase: false },
    nameSizes: [19, 15, 13.5, 12.5, 11.5, 10.5, 9.5],
    datesScale: 0.72,
    traitScale: 0.74,
    titleScale: 0.04,
  },
  node: { shape: 'text-only', stroke: 0, radius: 0, focusRing: false },
  edge: { style: 'radial', width: 0.7, minWidth: 1, corner: 0 },
  ornaments: { border: 'none', corners: 'none', cartouche: 'modern', rule: 'line', join: 'bar' },
  placeholder: 'dotted',
  metrics: {
    padX: 0.3,
    padY: 0.6,
    nameLine: 1.25,
    datesLine: 1.1,
    traitsLine: 1.15,
    minWidth: 5.5,
    maxWidth: 9,
    gap: 1.2,
    rowGap: 2.4,
  },
  layouts: {},
};
