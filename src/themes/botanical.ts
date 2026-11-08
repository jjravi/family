import { FONT_FAMILIES } from './fonts/families';
import type { ThemeDefinition } from './schema';

const { cormorant, greatVibes } = FONT_FAMILIES;

/** Ivory paper, muted greens, organic tapered branches, leaf nodes, Cormorant Garamond with a Great Vibes couple title. */
export const botanical: ThemeDefinition = {
  id: 'botanical',
  palette: {
    background: '#f5f2e8',
    paper: { edge: '#e6e3d2' },
    ink: '#2e3a2c',
    title: '#3f5a3a',
    accent: '#5d7651',
    muted: '#66705d',
    placeholder: '#b8c1ad',
    node: '#e2e9d3',
    stroke: '#9fb08f',
    edge: '#6b5a45',
  },
  type: {
    display: { family: cormorant, weight: 600, style: 'normal', tracking: 0.12, uppercase: true },
    coupleTitle: { family: greatVibes, weight: 400, style: 'normal', tracking: 0, uppercase: false },
    name: { family: cormorant, weight: 600, style: 'normal', tracking: 0, uppercase: false },
    focusName: { family: cormorant, weight: 600, style: 'normal', tracking: 0, uppercase: false },
    dates: { family: cormorant, weight: 500, style: 'normal', tracking: 0.04, uppercase: false },
    trait: { family: cormorant, weight: 500, style: 'italic', tracking: 0, uppercase: false },
    nameSizes: [23, 18.5, 16, 14.5, 13.5, 12.5, 11.5],
    datesScale: 0.74,
    traitScale: 0.78,
    titleScale: 0.075,
  },
  node: { shape: 'leaf', stroke: 0.6, radius: 0, focusRing: false },
  edge: { style: 'organic', width: 1.5, minWidth: 0, corner: 0 },
  ornaments: { border: 'hairline', corners: 'botanical', cartouche: 'botanical', rule: 'sprig', join: 'ring' },
  placeholder: 'faded',
  metrics: {
    padX: 0.6,
    padY: 0.5,
    nameLine: 1.2,
    datesLine: 1.05,
    traitsLine: 1.1,
    minWidth: 6,
    maxWidth: 9.5,
    gap: 0.9,
    rowGap: 2.4,
  },
  layouts: {},
};
