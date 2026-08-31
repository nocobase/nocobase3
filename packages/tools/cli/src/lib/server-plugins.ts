// Reads and edits an application's explicit `server/plugins.ts` composition root.
//
// The shared source editor performs narrow text splices around imports and the
// `defineServerPlugins([...])` array, preserving application-authored comments,
// ordering, generics, and surrounding source byte for byte.
import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  createPluginSourceEditor,
  formatPluginsFile,
  localNameFor,
  type PluginSourceEditor,
  type PluginSourceDefinition,
} from './client-plugins.ts';

const SERVER_SOURCE_DEFINITION: PluginSourceDefinition = {
  entryKind: 'value',
  entrySpecifierSuffix: '/server',
  entrySuffixes: ['/server'],
  fileLabel: 'server/plugins.ts',
  registerCallName: 'defineServerPlugins',
};

const EMPTY_FILE = `import {
  defineServerPlugins,
  type AppServerPlugins,
} from '@nocobase/app-server/plugins';

// Array order is server composition order. A plugin is enabled by appearing
// in this list; removing its entry and import disables its server behavior.
const serverPlugins: AppServerPlugins = defineServerPlugins([]);

export default serverPlugins;
`;

export interface ServerPluginsFile {
  readonly exists: boolean;
  readonly filePath: string;
  readonly sourceText: string;
}

export interface ManualServerPluginEdit {
  readonly entry: string;
  readonly filePath: string;
  readonly importStatement: string;
  readonly localName: string;
}

export function serverPluginsPath(appRoot: string): string {
  return path.join(appRoot, 'server', 'plugins.ts');
}

export function serverPluginEntrySpecifier(packageName: string): string {
  return `${packageName}/server`;
}

export async function readServerPlugins(
  appRoot: string,
): Promise<ServerPluginsFile> {
  const filePath = serverPluginsPath(appRoot);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return { exists: false, filePath, sourceText: EMPTY_FILE };
  }
  return {
    exists: true,
    filePath,
    sourceText: await readFile(filePath, 'utf8'),
  };
}

export async function writeServerPlugins(
  appRoot: string,
  sourceText: string,
): Promise<string> {
  const filePath = serverPluginsPath(appRoot);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, sourceText);
  return filePath;
}

export function describeServerPluginEdit(
  appRoot: string,
  packageName: string,
): ManualServerPluginEdit {
  const localName = localNameFor(packageName);
  return {
    entry: `${localName},`,
    filePath: serverPluginsPath(appRoot),
    importStatement: `import ${localName} from '${serverPluginEntrySpecifier(packageName)}';`,
    localName,
  };
}

export async function createServerPluginsEditor(
  appRoot: string,
): Promise<PluginSourceEditor> {
  return createPluginSourceEditor(appRoot, SERVER_SOURCE_DEFINITION);
}

export async function formatServerPlugins(
  appRoot: string,
  sourceText: string,
  filePath: string,
): Promise<string> {
  return formatPluginsFile(appRoot, sourceText, filePath);
}
