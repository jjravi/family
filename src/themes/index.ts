import type { LayoutId, ThemeId } from '../style';
import { botanical } from './botanical';
import { classic } from './classic';
import { modern } from './modern';
import type { Theme, ThemeDefinition, ThemeOverride } from './schema';

export type { Theme, ThemeDefinition, ThemeOverride } from './schema';

/** Every theme, keyed by id. */
export const THEMES: Readonly<Record<ThemeId, ThemeDefinition>> = { classic, botanical, modern };

/** Overrides every theme gets for a layout, applied after the theme's own (fans force radial connectors). */
export const LAYOUT_OVERRIDES: Readonly<Partial<Record<LayoutId, ThemeOverride>>> = {
  fan: { edge: { style: 'radial' } },
  butterfly: { edge: { style: 'radial' } },
};

function applyOverride(theme: Theme, override: ThemeOverride | undefined): Theme {
  if (!override) return theme;
  return {
    id: theme.id,
    palette: { ...theme.palette, ...override.palette },
    type: { ...theme.type, ...override.type },
    node: { ...theme.node, ...override.node },
    edge: { ...theme.edge, ...override.edge },
    ornaments: { ...theme.ornaments, ...override.ornaments },
    placeholder: override.placeholder ?? theme.placeholder,
    metrics: { ...theme.metrics, ...override.metrics },
  };
}

/** The theme as drawn for a layout: its own fields, then its per-layout override, then the global layout override. */
export function resolveTheme(id: ThemeId, layout: LayoutId): Theme {
  const { layouts, ...base } = THEMES[id];
  return applyOverride(applyOverride(base, layouts[layout]), LAYOUT_OVERRIDES[layout]);
}
