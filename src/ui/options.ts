import {
  LAYOUT_LABELS,
  PAGE_SIZE_IDS,
  PAGE_SIZES,
  THEME_IDS,
  THEME_LABELS,
  isLayoutId,
  isOrientation,
  isPageSizeId,
  isThemeId,
  resolveStyle,
  type Style,
} from '../style';
import { layoutChoice } from './choices';
import { h, uid } from './dom';

type ToggleKey = 'dates' | 'traits' | 'living' | 'qr';

const TOGGLES: readonly { key: ToggleKey; label: string; title: string }[] = [
  { key: 'dates', label: 'Dates', title: 'Show birth and death years' },
  { key: 'traits', label: 'Traits', title: 'Show the few words that describe each person' },
  { key: 'living', label: 'Hide living birth years', title: 'Privacy: leave out the birth years of people with no death year' },
  { key: 'qr', label: 'QR code', title: 'Print a QR code that reopens this tree' },
];

type Choice = readonly [value: string, label: string];

function setChoices(select: HTMLSelectElement, choices: readonly Choice[]): void {
  select.replaceChildren(...choices.map(([value, label]) => h('option', { value }, label)));
}

function field(label: string, select: HTMLSelectElement): HTMLElement {
  select.id = uid('option');
  return h('div', { class: 'field' }, h('label', { for: select.id }, label), select);
}

export interface OptionsBar {
  readonly element: HTMLElement;
  /** Shows `style`. Layout choices follow `focusCount`; counts other than 1 or 2 keep the previous choices. */
  show(style: Style, focusCount: number): void;
}

/** The options bar (spec "UI"): layout, theme, page, orientation, and the four toggles. Every change calls `onChange`. */
export function createOptionsBar(current: () => Style, onChange: (style: Style) => void): OptionsBar {
  const layout = h('select', {});
  const theme = h('select', {});
  const size = h('select', {});
  const orientation = h('select', {});
  setChoices(theme, THEME_IDS.map((id) => [id, THEME_LABELS[id]]));
  setChoices(size, PAGE_SIZE_IDS.map((id) => [id, PAGE_SIZES[id].label]));
  setChoices(orientation, [
    ['', 'Auto'],
    ['portrait', 'Portrait'],
    ['landscape', 'Landscape'],
  ]);
  const autoOrientation = orientation.options[0]!;

  const change = (patch: Partial<Style>): void => onChange({ ...current(), ...patch });
  layout.addEventListener('change', () => {
    if (isLayoutId(layout.value)) change({ layout: layout.value });
  });
  theme.addEventListener('change', () => {
    if (isThemeId(theme.value)) change({ theme: theme.value });
  });
  size.addEventListener('change', () => {
    if (isPageSizeId(size.value)) change({ size: size.value });
  });
  orientation.addEventListener('change', () => {
    change({ orientation: isOrientation(orientation.value) ? orientation.value : null });
  });

  const toggles = TOGGLES.map(({ key, label, title }) => {
    const input = h('input', { type: 'checkbox' });
    input.addEventListener('change', () => {
      const patch: Partial<Style> = {};
      patch[key] = input.checked;
      change(patch);
    });
    return { key, input, element: h('label', { class: 'toggle', title }, input, h('span', {}, label)) };
  });

  const element = h(
    'div',
    { class: 'options', role: 'group', 'aria-label': 'Poster options' },
    h('div', { class: 'fields' }, field('Layout', layout), field('Theme', theme), field('Page', size), field('Orientation', orientation)),
    h('div', { class: 'toggles', role: 'group', 'aria-label': 'Show on the poster' }, ...toggles.map((toggle) => toggle.element)),
  );

  let focusCount = 0;
  let offered: string | null = null;
  return {
    element,
    show(style, count) {
      if (count === 1 || count === 2) focusCount = count;
      const choice = layoutChoice(style, focusCount);
      const signature = choice.options.join(',');
      if (signature !== offered) {
        offered = signature;
        setChoices(layout, choice.options.length > 0 ? choice.options.map((id) => [id, LAYOUT_LABELS[id]]) : [['', '—']]);
      }
      layout.value = choice.selected ?? '';
      layout.disabled = choice.selected === null;
      theme.value = style.theme;
      size.value = style.size;
      orientation.value = style.orientation ?? '';
      autoOrientation.textContent = focusCount > 0 ? `Auto (${resolveStyle(style, focusCount).orientation})` : 'Auto';
      for (const { key, input } of toggles) input.checked = style[key];
    },
  };
}
