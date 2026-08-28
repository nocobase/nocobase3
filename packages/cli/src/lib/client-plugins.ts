// Reads and edits an application's `client/plugins.ts`.
//
// The file is application source, so edits preserve everything the author wrote. TypeScript is used only to locate two
// things — the end of the import block and the argument array of `defineClientPlugins(...)` — and the edit itself is a
// splice into the original text. A full AST reprint would discard comments and formatting.
//
// TypeScript and Prettier are resolved from the application rather than from this package, so an app formats its own
// source with its own configuration and version. Both are optional: an app that has neither still gets a correct edit,
// only an unformatted one.
import { createRequire } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type ts from 'typescript';

const PLUGIN_PACKAGE_PATTERN = /^@nocobase\/app-plugin-([a-z0-9][a-z0-9-]*)$/;
const REGISTER_CALL_NAME = 'defineClientPlugins';

const EMPTY_FILE = `import {
  defineClientPlugins,
  type AppClientPlugins,
} from '@nocobase/app-client/plugins';

// Array order is bootstrap order. A plugin is enabled by appearing in this
// list; removing its entry and its import disables it.
const clientPlugins: AppClientPlugins = defineClientPlugins([]);

export default clientPlugins;
`;

export interface ClientPluginsFile {
  readonly exists: boolean;
  readonly filePath: string;
  readonly sourceText: string;
}

export interface ClientPluginEntry {
  readonly localName: string;
  readonly packageName: string;
}

export interface ClientPluginsEdit {
  readonly changed: boolean;
  readonly localName?: string;
  readonly sourceText: string;
}

export function clientPluginsPath(appRoot: string): string {
  return path.join(appRoot, 'client', 'plugins.ts');
}

/** `@nocobase/app-plugin-audit-log` -> `auditLog`. */
export function localNameFor(packageName: string): string {
  const match = PLUGIN_PACKAGE_PATTERN.exec(packageName);
  if (!match) {
    throw new Error(
      `Plugin package "${packageName}" must match @nocobase/app-plugin-<name>.`,
    );
  }
  return match[1].replace(/-([a-z0-9])/g, (_all, character: string) =>
    character.toUpperCase(),
  );
}

export function clientPluginEntrySpecifier(packageName: string): string {
  return `${packageName}/client/plugin`;
}

export async function readClientPlugins(
  appRoot: string,
): Promise<ClientPluginsFile> {
  const filePath = clientPluginsPath(appRoot);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return { exists: false, filePath, sourceText: EMPTY_FILE };
  }
  return {
    exists: true,
    filePath,
    sourceText: await readFile(filePath, 'utf8'),
  };
}

export async function writeClientPlugins(
  appRoot: string,
  sourceText: string,
): Promise<string> {
  const filePath = clientPluginsPath(appRoot);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, sourceText);
  return filePath;
}

/**
 * Loads the TypeScript the application depends on. Editing app source with the app's own compiler avoids a second
 * TypeScript in the dependency tree purely so the CLI can parse a file the app already builds.
 */
async function loadTypeScript(appRoot: string): Promise<typeof ts> {
  const require = createRequire(path.join(appRoot, 'package.json'));
  let loaded: unknown;
  try {
    loaded = await import(require.resolve('typescript'));
  } catch (error) {
    throw new Error(
      `TypeScript is required to edit client/plugins.ts but is not installed in ${appRoot}. Install it as a devDependency.`,
      { cause: error },
    );
  }
  return interopDefault<typeof ts>(loaded, 'createSourceFile');
}

/**
 * Both TypeScript and Prettier are CommonJS. Node hoists named exports from some CJS modules and not others, so the
 * usable object is either the namespace itself or its `default`. Probing for a known member picks the right one
 * without depending on which form a given version produces.
 */
function interopDefault<T>(loaded: unknown, member: string): T {
  const namespace = loaded as Record<string, unknown>;
  if (typeof namespace[member] === 'function') {
    return namespace as T;
  }
  const fallback = namespace.default as Record<string, unknown> | undefined;
  if (fallback && typeof fallback[member] === 'function') {
    return fallback as T;
  }
  throw new Error(`Loaded module does not provide ${member}().`);
}

function parse(typescript: typeof ts, sourceText: string): ts.SourceFile {
  return typescript.createSourceFile(
    'plugins.ts',
    sourceText,
    typescript.ScriptTarget.Latest,
    true,
    typescript.ScriptKind.TS,
  );
}

/**
 * Locates the `defineClientPlugins([...])` argument array. Everything the codegen needs is derived from this one node.
 */
function findRegistrationArray(
  typescript: typeof ts,
  sourceFile: ts.SourceFile,
): ts.ArrayLiteralExpression {
  let found: ts.ArrayLiteralExpression | undefined;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (
      typescript.isCallExpression(node) &&
      typescript.isIdentifier(node.expression) &&
      node.expression.text === REGISTER_CALL_NAME &&
      node.arguments.length === 1 &&
      typescript.isArrayLiteralExpression(node.arguments[0])
    ) {
      found = node.arguments[0];
      return;
    }
    typescript.forEachChild(node, visit);
  };
  typescript.forEachChild(sourceFile, visit);

  if (!found) {
    throw new Error(
      `client/plugins.ts must call ${REGISTER_CALL_NAME}() with an array literal.`,
    );
  }
  return found;
}

/** Package names already registered, in registration order. */
export function listClientPlugins(
  typescript: typeof ts,
  sourceText: string,
): ClientPluginEntry[] {
  const sourceFile = parse(typescript, sourceText);
  const importsByLocalName = new Map<string, string>();
  for (const statement of sourceFile.statements) {
    if (
      !typescript.isImportDeclaration(statement) ||
      !typescript.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }
    const localName = statement.importClause?.name?.text;
    if (localName) {
      importsByLocalName.set(localName, statement.moduleSpecifier.text);
    }
  }

  const entries: ClientPluginEntry[] = [];
  for (const element of findRegistrationArray(typescript, sourceFile)
    .elements) {
    const callee = typescript.isCallExpression(element)
      ? element.expression
      : element;
    if (!typescript.isIdentifier(callee)) {
      continue;
    }
    const specifier = importsByLocalName.get(callee.text);
    if (!specifier) {
      continue;
    }
    entries.push({
      localName: callee.text,
      packageName: specifier.replace(/\/client\/plugin$/, ''),
    });
  }
  return entries;
}

function insertionOffsetForImport(
  typescript: typeof ts,
  sourceFile: ts.SourceFile,
): number {
  const imports = sourceFile.statements.filter(typescript.isImportDeclaration);
  if (imports.length > 0) {
    return imports[imports.length - 1].getEnd();
  }
  return sourceFile.statements[0]?.getStart(sourceFile) ?? 0;
}

export function addClientPlugin(
  typescript: typeof ts,
  sourceText: string,
  packageName: string,
): ClientPluginsEdit {
  const localName = localNameFor(packageName);
  const existing = listClientPlugins(typescript, sourceText);
  if (existing.some((entry) => entry.packageName === packageName)) {
    return { changed: false, sourceText };
  }

  const sourceFile = parse(typescript, sourceText);
  const conflicting = sourceFile.statements.some(
    (statement) =>
      typescript.isImportDeclaration(statement) &&
      statement.importClause?.name?.text === localName,
  );
  if (conflicting) {
    throw new Error(
      `client/plugins.ts already binds "${localName}" to something else; add ${packageName} by hand.`,
    );
  }

  const array = findRegistrationArray(typescript, sourceFile);
  const importText = `\nimport ${localName} from '${clientPluginEntrySpecifier(packageName)}';`;
  const importOffset = insertionOffsetForImport(typescript, sourceFile);

  // Append rather than sort: appending is predictable and preserves whatever bootstrap order the author arranged.
  const last = array.elements[array.elements.length - 1];
  const entryOffset = last ? last.getEnd() : array.getStart(sourceFile) + 1;
  const entryText = last ? `,\n  ${localName}()` : `\n  ${localName}(),\n`;

  const withEntry =
    sourceText.slice(0, entryOffset) +
    entryText +
    sourceText.slice(entryOffset);
  const updated =
    withEntry.slice(0, importOffset) +
    importText +
    withEntry.slice(importOffset);

  return { changed: true, localName, sourceText: updated };
}

export function removeClientPlugin(
  typescript: typeof ts,
  sourceText: string,
  packageName: string,
): ClientPluginsEdit {
  const existing = listClientPlugins(typescript, sourceText);
  const target = existing.find((entry) => entry.packageName === packageName);
  if (!target) {
    return { changed: false, sourceText };
  }

  const sourceFile = parse(typescript, sourceText);
  const array = findRegistrationArray(typescript, sourceFile);
  const index = array.elements.findIndex((element) => {
    const callee = typescript.isCallExpression(element)
      ? element.expression
      : element;
    return typescript.isIdentifier(callee) && callee.text === target.localName;
  });
  const element = array.elements[index];

  // Take the trailing comma with the element, or the leading one for the last entry, so the array never ends up with a
  // doubled or dangling comma. The sole remaining entry is its own case: taking only the element would leave the comma
  // it carried behind as `[,]`, which is an array hole rather than an empty array, so the whole span between the
  // brackets goes.
  let start = element.getFullStart();
  let end = element.getEnd();
  if (array.elements.length === 1) {
    start = array.getStart(sourceFile) + 1;
    end = array.getEnd() - 1;
  } else if (index < array.elements.length - 1) {
    end = array.elements[index + 1].getFullStart();
  } else if (index > 0) {
    start = array.elements[index - 1].getEnd();
  }

  const importStatement = sourceFile.statements.find(
    (statement) =>
      typescript.isImportDeclaration(statement) &&
      statement.importClause?.name?.text === target.localName,
  );

  let updated = sourceText.slice(0, start) + sourceText.slice(end);
  if (importStatement) {
    const importStart = importStatement.getFullStart();
    const importEnd = importStatement.getEnd();
    const offset = start < importStart ? start - end : 0;
    updated =
      updated.slice(0, importStart + offset) +
      updated.slice(importEnd + offset);
  }

  return { changed: true, sourceText: updated };
}

/**
 * Formats with the application's own Prettier and configuration. An app without Prettier keeps the unformatted splice,
 * which is still valid TypeScript, rather than failing the registration over formatting.
 */
export async function formatClientPlugins(
  appRoot: string,
  sourceText: string,
  filePath: string,
): Promise<string> {
  const require = createRequire(path.join(appRoot, 'package.json'));
  let prettier: typeof import('prettier');
  try {
    prettier = interopDefault<typeof import('prettier')>(
      await import(require.resolve('prettier')),
      'format',
    );
  } catch {
    return sourceText;
  }
  const config = await prettier.resolveConfig(filePath);
  return prettier.format(sourceText, {
    ...config,
    filepath: filePath,
    parser: 'typescript',
  });
}

export interface ClientPluginsEditor {
  readonly add: (sourceText: string, packageName: string) => ClientPluginsEdit;
  readonly list: (sourceText: string) => ClientPluginEntry[];
  readonly remove: (
    sourceText: string,
    packageName: string,
  ) => ClientPluginsEdit;
}

/**
 * Binds the editing functions to the application's TypeScript, so a caller performing several edits loads the compiler
 * once and does not thread it through every call.
 */
export async function createClientPluginsEditor(
  appRoot: string,
): Promise<ClientPluginsEditor> {
  const typescript = await loadTypeScript(appRoot);
  return {
    add: (sourceText, packageName) =>
      addClientPlugin(typescript, sourceText, packageName),
    list: (sourceText) => listClientPlugins(typescript, sourceText),
    remove: (sourceText, packageName) =>
      removeClientPlugin(typescript, sourceText, packageName),
  };
}
