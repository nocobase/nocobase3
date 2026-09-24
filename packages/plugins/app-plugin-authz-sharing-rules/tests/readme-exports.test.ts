import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import packageMetadata from '../package.json' with { type: 'json' };

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readme = readFileSync(resolve(root, 'README.md'), 'utf8');

/** Every name a module exports, following `export *` into sibling modules. */
function exportNames(file: string): Set<string> {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
  );
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements)
          names.add(element.name.text);
      } else if (
        statement.moduleSpecifier &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        const target = resolve(
          dirname(file),
          statement.moduleSpecifier.text.replace(/\.js$/, '.ts'),
        );
        for (const name of exportNames(target)) names.add(name);
      }
      continue;
    }
    if (ts.isExportAssignment(statement)) {
      names.add('default');
      continue;
    }
    const modifiers = ts.canHaveModifiers(statement)
      ? (ts.getModifiers(statement) ?? [])
      : [];
    if (!modifiers.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword))
      continue;
    if (modifiers.some(({ kind }) => kind === ts.SyntaxKind.DefaultKeyword)) {
      names.add('default');
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations)
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
    } else if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement)) &&
      statement.name
    ) {
      names.add(statement.name.text);
    }
  }
  return names;
}

/** The body of the `## \`specifier\`` section, up to the next `## ` heading. */
function section(specifier: string): string {
  const heading = `## \`${specifier}\``;
  const start = readme.split('\n').findIndex((line) => line === heading);
  if (start < 0) throw new Error(`README has no section ${heading}`);
  const lines = readme.split('\n').slice(start + 1);
  const end = lines.findIndex((line) => line.startsWith('## '));
  return lines.slice(0, end < 0 ? undefined : end).join('\n');
}

/** Identifiers in the first column of the section's `### Exports` table. */
function documented(body: string): Set<string> | undefined {
  const lines = body.split('\n');
  const start = lines.findIndex((line) => line === '### Exports');
  if (start < 0) return undefined;
  const names = new Set<string>();
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('#')) break;
    const cell = /^\|\s*`([A-Za-z_$][\w$]*)`\s*\|/.exec(line);
    if (cell?.[1]) names.add(cell[1]);
  }
  return names;
}

/** Source entries only; `./package.json` exports no names. */
const entries = Object.entries(packageMetadata.exports).flatMap(
  ([key, target]) =>
    typeof target === 'string'
      ? []
      : [
          {
            specifier:
              key === '.'
                ? packageMetadata.name
                : `${packageMetadata.name}/${key.slice(2)}`,
            file: resolve(root, target.import),
          },
        ],
);

/** An entry without its own section is an alias of the entry sharing its file. */
function sectionOf(entry: (typeof entries)[number]): string {
  if (readme.split('\n').includes(`## \`${entry.specifier}\``))
    return entry.specifier;
  const alias = entries.find(
    (other) => other.file === entry.file && other !== entry,
  );
  if (!alias) throw new Error(`README has no section for ${entry.specifier}`);
  return alias.specifier;
}

describe('README export reference', () => {
  for (const entry of entries) {
    it(`lists every export of ${entry.specifier}, and nothing else`, () => {
      const listed = documented(section(sectionOf(entry)));
      expect([...(listed ?? [])].sort()).toEqual(
        [...exportNames(entry.file)].sort(),
      );
    });
  }
});
