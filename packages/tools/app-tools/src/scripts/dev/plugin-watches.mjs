import fs from 'node:fs';
import path from 'node:path';

import { listWorkspacePackages } from '../utils/workspace-packages.mjs';

// Read declarations without importing server code or starting providers.
export const resolvePluginWatchIncludes = async (rootDir) => {
  const file = path.join(rootDir, 'server/plugins.ts');
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const workspacePackages = listWorkspacePackages(rootDir);
  // Only a workspace neighbour has sources to watch, and watching one requires importing it by name here, so a file
  // naming none of them cannot produce a single entry. Deciding that by substring keeps TypeScript — 24 MB of
  // compiler — out of every `pnpm dev` that would only have been told `[]`. That is every generated application:
  // its plugins are installed under `node_modules`, and whatever sits beside it belongs to unrelated projects.
  if (![...workspacePackages.keys()].some((name) => text.includes(name)))
    return [];
  const { default: ts } = await import('typescript');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const imports = new Map();
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      statement.importClause?.name &&
      !statement.importClause.isTypeOnly &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const match = /^(.*)\/server(?:\/plugin)?$/.exec(
        statement.moduleSpecifier.text,
      );
      if (match) imports.set(statement.importClause.name.text, match[1]);
    }
  }
  const packages = new Set();
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineServerPlugins' &&
      ts.isArrayLiteralExpression(node.arguments[0])
    ) {
      for (const element of node.arguments[0].elements) {
        const identifier = ts.isCallExpression(element)
          ? element.expression
          : element;
        if (ts.isIdentifier(identifier) && imports.has(identifier.text))
          packages.add(imports.get(identifier.text));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...packages].flatMap((packageName) => {
    const pluginDir = workspacePackages.get(packageName);
    if (!pluginDir) return [];
    const relative = path
      .relative(rootDir, pluginDir)
      .split(path.sep)
      .join('/');
    return [
      `${relative}/package.json`,
      `${relative}/database/**/*`,
      `${relative}/server/**/*`,
    ];
  });
};
