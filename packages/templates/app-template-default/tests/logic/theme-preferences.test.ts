import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  initializeTheme,
  themeStorageKeys,
} from '../../client/theme/theme-preferences';

describe('application appearance storage', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('class');
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
  });

  it('separates apps, preserves nested paths and distinguishes the root', () => {
    expect(themeStorageKeys('/crm/').mode).toBe(
      'nocobase:crm:theme:color-scheme',
    );
    expect(themeStorageKeys('/crm').preset).toBe('nocobase:crm:theme:preset');
    expect(themeStorageKeys('/team/crm/').preset).toBe(
      'nocobase:team%2Fcrm:theme:preset',
    );
    expect(themeStorageKeys('/').preset).toBe('nocobase:%2F:theme:preset');
    expect(themeStorageKeys('/root/')).not.toEqual(themeStorageKeys('/'));
  });

  it('restores both preferences before React without reading another app', () => {
    localStorage.setItem('nocobase:crm:theme:color-scheme', 'light');
    localStorage.setItem('nocobase:crm:theme:preset', 'ocean');
    initializeTheme('/crm/', ['default', 'ocean']);
    expect(document.documentElement).toHaveAttribute('data-theme', 'ocean');
    expect(document.documentElement).toHaveClass('light');
    initializeTheme('/erp/', ['default', 'ocean']);
    expect(document.documentElement).toHaveAttribute('data-theme', 'default');
    expect(document.documentElement).toHaveClass('dark');
  });

  it('falls back on invalid values and unavailable storage', () => {
    localStorage.setItem('nocobase:crm:theme:color-scheme', 'invalid');
    localStorage.setItem('nocobase:crm:theme:preset', 'deleted');
    initializeTheme('/crm/', ['default', 'ocean']);
    expect(document.documentElement).toHaveAttribute('data-theme', 'default');
    expect(document.documentElement).toHaveClass('dark');
    const spy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    expect(() => initializeTheme('/crm/', ['default', 'ocean'])).not.toThrow();
    spy.mockRestore();
  });
});
