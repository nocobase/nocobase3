import fs from 'node:fs';
import path from 'node:path';

import { build } from 'vite';
import { afterEach, expect, it } from 'vitest';

import { portalRawIndexHtmlPlugin } from '../src/vite/index.ts';

const fixtureRoots: string[] = [];

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('resolves lazy chunk dependencies from the runtime Portal base', async () => {
  const root = fs.mkdtempSync(
    path.join(process.cwd(), '.portal-runtime-asset-base-'),
  );
  fixtureRoots.push(root);
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(
    path.join(root, 'index.html'),
    '<div id="app"></div><script type="module" src="/src/main.js"></script>',
  );
  fs.writeFileSync(
    path.join(root, 'src/main.js'),
    [
      'import "./style.css";',
      'window.loadFirst = () => import("./first.js");',
      'window.loadSecond = () => import("./second.js");',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(root, 'src/first.js'),
    'import { shared } from "./shared.js"; export default shared;',
  );
  fs.writeFileSync(
    path.join(root, 'src/second.js'),
    'import { shared } from "./shared.js"; export default shared;',
  );
  fs.writeFileSync(
    path.join(root, 'src/shared.js'),
    'export const shared = "shared";',
  );
  fs.writeFileSync(path.join(root, 'src/style.css'), 'body { color: black; }');

  await build({
    root,
    base: '/main/',
    logLevel: 'silent',
    plugins: [portalRawIndexHtmlPlugin({ root, base: '/main/' })],
  });

  const assetsDir = path.join(root, 'dist/assets');
  const scripts = fs
    .readdirSync(assetsDir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => fs.readFileSync(path.join(assetsDir, file), 'utf8'))
    .join('\n');

  expect(scripts).toContain('window.NOCOBASE_PORTAL_BASE');
  expect(scripts).toContain('window.location.origin');
  expect(scripts).not.toMatch(/["']\/assets\//);

  const rawIndex = fs.readFileSync(
    path.join(root, 'dist/index.raw.html'),
    'utf8',
  );
  expect(rawIndex).toContain('src="/assets/');
  expect(rawIndex).toContain('href="/assets/');
  expect(rawIndex).not.toContain('/main/assets/');
});
