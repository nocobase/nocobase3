// @vitest-environment node
import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { createThemeBootstrap } from '../../scripts/theme-bootstrap';
import { injectSpaRuntimeHtml } from '../../../../app/app-server/src/spa/runtime-globals';
describe('theme bootstrap', () => {
  it('restores the runtime app preset before the loading screen', async () => {
    const html = injectSpaRuntimeHtml(
      await createThemeBootstrap('/fallback/'),
      {
        runtimeGlobals: { APP_BASE_PATH: '/team/crm/' },
      },
    );
    expect(html.indexOf('type="module"')).toBeLessThan(
      html.indexOf('data-theme-bootstrap'),
    );
    expect(html).toContain('--background:');
    const script = [
      ...html.matchAll(
        /<script(?: data-theme-bootstrap)?>([\s\S]*?)<\/script>/g,
      ),
    ]
      .map((match) => match[1])
      .join('\n');
    const classes = new Set<string>();
    const root = {
      classList: {
        remove: (...items: string[]) => items.forEach((x) => classes.delete(x)),
        add: (x: string) => classes.add(x),
      },
      dataset: {} as Record<string, string>,
      style: {},
    };
    const saved = new Map([
      ['nocobase:team%2Fcrm:theme:preset', 'ocean'],
      ['nocobase:team%2Fcrm:theme:color-scheme', 'light'],
    ]);
    vm.runInNewContext(script, {
      window: {
        matchMedia: () => ({ matches: true }),
      },
      document: { documentElement: root },
      localStorage: { getItem: (key: string) => saved.get(key) ?? null },
    });
    expect(root.dataset.theme).toBe('ocean');
    expect(classes.has('light')).toBe(true);
  });
});
