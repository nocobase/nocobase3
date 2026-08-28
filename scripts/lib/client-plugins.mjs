// Monorepo entry for editing an application's `client/plugins.ts`.
//
// The editing itself lives in `@nocobase/nb3-cli` so that this repository and a generated application run the same
// code. The CLI takes the application's TypeScript as a parameter, because a generated application supplies its own;
// inside the workspace there is exactly one, so it is loaded here once and bound into the exported functions, which
// keeps these signatures synchronous for the scripts that already call them.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  addClientPlugin as addWithTypeScript,
  clientPluginEntrySpecifier,
  clientPluginsPath,
  formatClientPlugins as formatForApp,
  listClientPlugins as listWithTypeScript,
  localNameFor,
  readClientPlugins,
  removeClientPlugin as removeWithTypeScript,
  writeClientPlugins,
} from '../../packages/cli/src/lib/client-plugins.ts';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

const typescript = await import('typescript').then(
  (loaded) => loaded.default ?? loaded,
);

export {
  clientPluginEntrySpecifier,
  clientPluginsPath,
  localNameFor,
  readClientPlugins,
  writeClientPlugins,
};

export function listClientPlugins(sourceText) {
  return listWithTypeScript(typescript, sourceText);
}

export function addClientPlugin(sourceText, packageName) {
  return addWithTypeScript(typescript, sourceText, packageName);
}

export function removeClientPlugin(sourceText, packageName) {
  return removeWithTypeScript(typescript, sourceText, packageName);
}

export function formatClientPlugins(sourceText, filePath) {
  return formatForApp(repoRoot, sourceText, filePath);
}
