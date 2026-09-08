import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { findWorkspacePackageDirectory } from '../utils/workspace-packages.mjs';

// Read declarations without importing server code or starting providers.
export const resolvePluginWatchIncludes = (rootDir) => {
  const file = path.join(rootDir, 'server/plugins.ts');
  if (!fs.existsSync(file)) return [];
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
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
    const pluginDir = findWorkspacePackageDirectory(rootDir, packageName);
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
