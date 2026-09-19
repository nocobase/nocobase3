// Reads and edits an application's explicit `cli/plugins.ts` composition root.
//
// Same narrow text splices as the client and server roots: the shared source editor locates the import group and the
// `defineCliPlugins([...])` array and splices into the original text, so application-authored comments, ordering, and
// formatting survive byte for byte.
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

const CLI_SOURCE_DEFINITION: PluginSourceDefinition = {
  entryKind: 'value',
  entrySpecifierSuffix: '/cli',
  entrySuffixes: ['/cli'],
  fileLabel: 'cli/plugins.ts',
  registerCallName: 'defineCliPlugins',
};

const EMPTY_FILE = `import {
  defineCliPlugins,
  type AppCliPlugins,
} from '@nocobase/nb3-cli/plugins';

// Array order is command registration order. A plugin contributes its commands
// by appearing in this list; removing its entry and import removes them.
const cliPlugins: AppCliPlugins = defineCliPlugins([]);

export default cliPlugins;
`;

export interface CliPluginsFile {
  readonly exists: boolean;
  readonly filePath: string;
  readonly sourceText: string;
}

export interface ManualCliPluginEdit {
  readonly entry: string;
  readonly filePath: string;
  readonly importStatement: string;
  readonly localName: string;
}

export function cliPluginsPath(appRoot: string): string {
  return path.join(appRoot, 'cli', 'plugins.ts');
}

export function cliPluginEntrySpecifier(packageName: string): string {
  return `${packageName}/cli`;
}

export async function readCliPlugins(appRoot: string): Promise<CliPluginsFile> {
  const filePath = cliPluginsPath(appRoot);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return { exists: false, filePath, sourceText: EMPTY_FILE };
  }
  return {
    exists: true,
    filePath,
    sourceText: await readFile(filePath, 'utf8'),
  };
}

export async function writeCliPlugins(
  appRoot: string,
  sourceText: string,
): Promise<string> {
  const filePath = cliPluginsPath(appRoot);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, sourceText);
  return filePath;
}

export function describeCliPluginEdit(
  appRoot: string,
  packageName: string,
): ManualCliPluginEdit {
  const localName = localNameFor(packageName);
  return {
    entry: `${localName},`,
    filePath: cliPluginsPath(appRoot),
    importStatement: `import ${localName} from '${cliPluginEntrySpecifier(packageName)}';`,
    localName,
  };
}

export async function createCliPluginsEditor(
  appRoot: string,
): Promise<PluginSourceEditor> {
  return createPluginSourceEditor(appRoot, CLI_SOURCE_DEFINITION);
}

export async function formatCliPlugins(
  appRoot: string,
  sourceText: string,
  filePath: string,
): Promise<string> {
  return formatPluginsFile(appRoot, sourceText, filePath);
}
