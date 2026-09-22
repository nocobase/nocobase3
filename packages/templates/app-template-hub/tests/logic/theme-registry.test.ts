// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';
import {
  defaultThemePreset,
  themePresets,
} from '../../client/theme/theme-presets.js';

// The Settings page labels each card from the locale and falls back to the registry ID, so a missing translation
// shows up as a raw ID rather than as a failure. These assertions sit next to the registry for that reason.
function label(resource: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((value, step) => {
    if (typeof value !== 'object' || value === null) return undefined;
    return (value as Record<string, unknown>)[step];
  }, resource);
}

describe('theme registry', () => {
  it('lists Default first, as the preset a fresh browser starts on', () => {
    expect(themePresets[0].id).toBe('default');
    expect(defaultThemePreset).toBe('default');
  });

  it('names every preset in every locale', () => {
    for (const { id, labelKey } of themePresets) {
      expect(labelKey).toBe(`appearance.themes.${id}`);
      for (const [locale, resource] of [
        ['en-US', enUS],
        ['zh-CN', zhCN],
      ] as const) {
        const text = label(resource, labelKey);
        expect(typeof text, `${id} in ${locale}`).toBe('string');
        expect(text, `${id} in ${locale}`).not.toBe('');
      }
    }
  });

  it('gives each preset a name the reader can tell apart', () => {
    const names = themePresets.map(({ labelKey }) => label(enUS, labelKey));
    expect(new Set(names).size).toBe(names.length);
  });

  it('uses IDs that can name a theme file and a saved value', () => {
    const ids = themePresets.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
      // One preset reads one theme file, so a missing file is a card with no styling behind it.
      expect(() =>
        readFileSync(
          new URL(`../../client/theme/themes/${id}.css`, import.meta.url),
        ),
      ).not.toThrow();
    }
  });
});
