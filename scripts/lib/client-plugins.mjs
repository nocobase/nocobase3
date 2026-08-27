// Reads and edits an application's `client/plugins.ts`.
//
// The file is application source, so edits preserve everything the author
// wrote. TypeScript is used only to locate two things — the end of the import
// block and the argument array of `defineClientPlugins(...)` — and the edit
// itself is a splice into the original text. A full AST reprint would discard
// comments and formatting.
import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import ts from 'typescript';

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

export function clientPluginsPath(appRoot) {
  return path.join(appRoot, 'client', 'plugins.ts');
}

/** `@nocobase/app-plugin-audit-log` -> `auditLog`. */
export function localNameFor(packageName) {
  const match = PLUGIN_PACKAGE_PATTERN.exec(packageName);
  if (!match) {
    throw new Error(
      `Plugin package "${packageName}" must match @nocobase/app-plugin-<name>.`,
    );
  }
  return match[1].replace(/-([a-z0-9])/g, (_all, character) =>
    character.toUpperCase(),
  );
}

export function clientPluginEntrySpecifier(packageName) {
  return `${packageName}/client/plugin`;
}

export async function readClientPlugins(appRoot) {
  const filePath = clientPluginsPath(appRoot);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return { filePath, exists: false, sourceText: EMPTY_FILE };
  }
  return {
    filePath,
    exists: true,
    sourceText: await readFile(filePath, 'utf8'),
  };
}

export async function writeClientPlugins(appRoot, sourceText) {
  const filePath = clientPluginsPath(appRoot);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, sourceText);
}

function parse(sourceText) {
  return ts.createSourceFile(
    'plugins.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

/**
 * Locates the `defineClientPlugins([...])` argument array. Everything the
 * codegen needs is derived from this one node.
 */
function findRegistrationArray(sourceFile) {
  let found;
  const visit = (node) => {
    if (found) {
      return;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === REGISTER_CALL_NAME &&
      node.arguments.length === 1 &&
      ts.isArrayLiteralExpression(node.arguments[0])
    ) {
      found = node.arguments[0];
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);

  if (!found) {
    throw new Error(
      `client/plugins.ts must call ${REGISTER_CALL_NAME}() with an array literal.`,
    );
  }
  return found;
}

/** Package names already registered, in registration order. */
export function listClientPlugins(sourceText) {
  const sourceFile = parse(sourceText);
  const importsByLocalName = new Map();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }
    const localName = statement.importClause?.name?.text;
    if (localName) {
      importsByLocalName.set(localName, statement.moduleSpecifier.text);
    }
  }

  const entries = [];
  for (const element of findRegistrationArray(sourceFile).elements) {
    const callee = ts.isCallExpression(element) ? element.expression : element;
    if (!ts.isIdentifier(callee)) {
      continue;
    }
    const specifier = importsByLocalName.get(callee.text);
    if (!specifier) {
      continue;
    }
    const packageName = specifier.replace(/\/client\/plugin$/, '');
    entries.push({ packageName, localName: callee.text });
  }
  return entries;
}

function insertionOffsetForImport(sourceFile) {
  const imports = sourceFile.statements.filter(ts.isImportDeclaration);
  if (imports.length > 0) {
    return imports[imports.length - 1].getEnd();
  }
  return sourceFile.statements[0]?.getStart(sourceFile) ?? 0;
}

export function addClientPlugin(sourceText, packageName) {
  const localName = localNameFor(packageName);
  const existing = listClientPlugins(sourceText);
  if (existing.some((entry) => entry.packageName === packageName)) {
    return { sourceText, changed: false };
  }

  const sourceFile = parse(sourceText);
  const conflicting = sourceFile.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      statement.importClause?.name?.text === localName,
  );
  if (conflicting) {
    throw new Error(
      `client/plugins.ts already binds "${localName}" to something else; add ${packageName} by hand.`,
    );
  }

  const array = findRegistrationArray(sourceFile);
  const importText = `\nimport ${localName} from '${clientPluginEntrySpecifier(packageName)}';`;
  const importOffset = insertionOffsetForImport(sourceFile);

  // Append rather than sort: appending is predictable and preserves whatever
  // bootstrap order the author arranged.
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

  return { sourceText: updated, changed: true, localName };
}

export function removeClientPlugin(sourceText, packageName) {
  const existing = listClientPlugins(sourceText);
  const target = existing.find((entry) => entry.packageName === packageName);
  if (!target) {
    return { sourceText, changed: false };
  }

  const sourceFile = parse(sourceText);
  const array = findRegistrationArray(sourceFile);
  const index = array.elements.findIndex((element) => {
    const callee = ts.isCallExpression(element) ? element.expression : element;
    return ts.isIdentifier(callee) && callee.text === target.localName;
  });
  const element = array.elements[index];

  // Take the trailing comma with the element, or the leading one for the last
  // entry, so the array never ends up with a doubled or dangling comma.
  let start = element.getFullStart();
  let end = element.getEnd();
  if (index < array.elements.length - 1) {
    end = array.elements[index + 1].getFullStart();
  } else if (index > 0) {
    start = array.elements[index - 1].getEnd();
  }

  const importStatement = sourceFile.statements.find(
    (statement) =>
      ts.isImportDeclaration(statement) &&
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

  return { sourceText: updated, changed: true };
}

/** Formats with the repository's Prettier configuration. */
export async function formatClientPlugins(sourceText, filePath) {
  const prettier = await import('prettier');
  const config = await prettier.resolveConfig(filePath);
  return prettier.format(sourceText, {
    ...config,
    filepath: filePath,
    parser: 'typescript',
  });
}
