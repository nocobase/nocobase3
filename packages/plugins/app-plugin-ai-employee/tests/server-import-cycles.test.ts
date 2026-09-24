import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverRoot = join(packageRoot, 'server');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.d.ts') ? [path] : [];
  });
}

/** Whether a declaration survives compilation, so its module loads at runtime. */
function loadsAtRuntime(
  node: ts.ImportDeclaration | ts.ExportDeclaration,
): boolean {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (!clause) return true; // a side-effect import
    if (clause.isTypeOnly) return false;
    if (clause.name) return true;
    const bindings = clause.namedBindings;
    if (!bindings || ts.isNamespaceImport(bindings)) return true;
    return bindings.elements.some((element) => !element.isTypeOnly);
  }
  if (node.isTypeOnly) return false;
  const clause = node.exportClause;
  if (!clause || ts.isNamespaceExport(clause)) return true;
  return clause.elements.some((element) => !element.isTypeOnly);
}

/** Relative value imports between the plugin's server modules. */
function importGraph(files: readonly string[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
    );
    const targets: string[] = [];
    for (const statement of source.statements) {
      if (!(
        ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
      ))
        continue;
      const specifier = statement.moduleSpecifier;
      if (!specifier || !ts.isStringLiteral(specifier)) continue;
      if (!specifier.text.startsWith('.') || !loadsAtRuntime(statement))
        continue;
      const target = resolve(dirname(file), specifier.text).replace(
        /\.js$/,
        '.ts',
      );
      if (existsSync(target)) targets.push(target);
    }
    graph.set(file, targets);
  }
  return graph;
}

/** Groups of modules that import one another, directly or through others. */
function cycles(graph: Map<string, string[]>): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const found: string[][] = [];
  const visit = (node: string): void => {
    index.set(node, index.size);
    low.set(node, index.get(node)!);
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node)!, low.get(next)!));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node)!, index.get(next)!));
      }
    }
    if (low.get(node) !== index.get(node)) return;
    const group: string[] = [];
    let member: string | undefined;
    do {
      member = stack.pop()!;
      onStack.delete(member);
      group.push(relative(packageRoot, member));
    } while (member !== node);
    if (group.length > 1 || (graph.get(node) ?? []).includes(node))
      found.push(group.sort());
  };
  for (const node of graph.keys()) if (!index.has(node)) visit(node);
  return found;
}

describe('server module graph', () => {
  // A module caught in a cycle can run before a module it imports has
  // finished, and then reads that module's exports while they are still
  // uninitialized. Whether that happens depends on which module the host loads
  // first, so the failure shows up in one application and not in the tests —
  // vitest's module runner does not reproduce it — and the only dependable
  // guard is to have no cycle at all.
  it('has no runtime import cycle', () => {
    const graph = importGraph(sourceFiles(serverRoot));
    expect(graph.size).toBeGreaterThan(100);
    expect(cycles(graph)).toEqual([]);
  });
});
