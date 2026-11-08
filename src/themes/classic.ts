import { FONT_FAMILIES } from './fonts/families';
import type { ThemeDefinition } from './schema';

const { playfair, sourceSans } = FONT_FAMILIES;

/** Cream paper, dark serif (Playfair Display with Source Sans 3), orthogonal connectors, boxed names. */
export const classic: ThemeDefinition = {
  id: 'classic',
  palette: {
    background: '#f7f1e3',
    paper: { edge: '#ebe0c8' },
    ink: '#2b2520',
    title: '#2b2520',
    accent: '#8c6a32',
    muted: '#6e6255',
    placeholder: '#b9ad99',
    node: '#fcf8ef',
    stroke: '#4a3f35',
    edge: '#5a4d40',
  },
  type: {
    display: { family: playfair, weight: 500, style: 'normal', tracking: 0.01, uppercase: false },
    coupleTitle: { family: playfair, weight: 400, style: 'italic', tracking: 0, uppercase: false },
    name: { family: playfair, weight: 500, style: 'normal', tracking: 0, uppercase: false },
    focusName: { family: playfair, weight: 600, style: 'normal', tracking: 0, uppercase: false },
    dates: { family: sourceSans, weight: 400, style: 'normal', tracking: 0.06, uppercase: false },
    trait: { family: playfair, weight: 400, style: 'italic', tracking: 0, uppercase: false },
    nameSizes: [20, 16, 14, 13, 12, 11, 10],
    datesScale: 0.7,
    traitScale: 0.74,
    titleScale: 0.052,
  },
  node: { shape: 'box', stroke: 0.75, radius: 0.12, focusRing: true },
  edge: { style: 'orthogonal', width: 0.9, minWidth: 0, corner: 3 },
  ornaments: { border: 'double-rule', corners: 'classic', cartouche: 'classic', rule: 'diamond', join: 'ampersand' },
  placeholder: 'faded',
  metrics: {
    padX: 0.75,
    padY: 0.55,
    nameLine: 1.3,
    datesLine: 1.15,
    traitsLine: 1.2,
    minWidth: 6.5,
    maxWidth: 10,
    gap: 1.1,
    rowGap: 2.2,
  },
  layouts: {},
};
