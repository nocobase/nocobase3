import fs from 'node:fs/promises';
import path from 'node:path';
import { transformWithEsbuild, type Plugin } from 'vite';
import { themePresets } from '../client/theme/theme-presets';

export async function createThemeBootstrap(
  base: string,
  root = process.cwd(),
): Promise<string> {
  const source = await fs.readFile(
    path.join(root, 'client/theme/theme-preferences.ts'),
    'utf8',
  );
  const compiled = await transformWithEsbuild(
    source.replace(/^export /gm, ''),
    'theme-preferences.ts',
    { loader: 'ts', target: 'es2020' },
  );
  const css = (
    await Promise.all(
      themePresets.map((item) =>
        fs.readFile(
          path.join(root, 'client/theme/themes', item.id + '.css'),
          'utf8',
        ),
      ),
    )
  ).join('\n');
  const ids = JSON.stringify(themePresets.map((item) => item.id)).replace(
    /</g,
    '\\u003c',
  );
  // The SPA server injects runtime globals before the first module script.
  // This post-transform marker keeps restoration ahead of body/first paint.
  return (
    '<script type="module" data-theme-runtime-anchor></script><style>' +
    css +
    '</style><script data-theme-bootstrap>\n(() => {\n' +
    compiled.code +
    '\ninitializeTheme(window.APP_BASE_PATH || ' +
    JSON.stringify(base).replace(/</g, '\\u003c') +
    ', ' +
    ids +
    ');\n})();\n</script>'
  );
}

export function themeBootstrap(root: string, base: string): Plugin {
  return {
    name: 'app-theme-bootstrap',
    transformIndexHtml: {
      order: 'post',
      async handler(html) {
        const bootstrap = await createThemeBootstrap(base, root);
        return html.replace(
          /<head[^>]*>\s*(?:<meta\s+charset=[^>]+>)?/i,
          (match) => match + '\n' + bootstrap,
        );
      },
    },
  };
}
