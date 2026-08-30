import { constants } from 'node:fs';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import prettierConfig from '@nocobase/dev-config/prettier';
import { format } from 'prettier';

import type { PluginNames } from './names.ts';

export const DEFAULT_TEMPLATE_DIRECTORY = fileURLToPath(
  new URL('../../template/', import.meta.url),
);

const placeholderPattern = /__NOCOBASE_[A-Z0-9_]+__/gu;

export interface PluginTemplateContext extends PluginNames {
  readonly datePrefix: string;
  readonly description: string;
  readonly displayName: string;
  readonly migrationName: string;
  readonly seedName: string;
}

interface TemplateFile {
  readonly sourcePath: string;
  readonly outputPath: string;
}

function outputPathForTemplateFile(relativePath: string): string {
  switch (relativePath) {
    case '.gitignore.template':
      return '.gitignore';
    case '.prettierignore.template':
      return '.prettierignore';
    case 'eslint.config.template.js':
      return 'eslint.config.js';
    case 'package.template.json':
      return 'package.json';
    default:
      return relativePath;
  }
}

function literal(value: string): string {
  return `'${JSON.stringify(value)
    .slice(1, -1)
    .replaceAll("'", "\\'")
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')}'`;
}

function jsonStringContent(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

function replacementEntries(
  context: PluginTemplateContext,
): readonly (readonly [string, string])[] {
  return [
    ['__NOCOBASE_COLLECTION_NAME_LITERAL__', literal(context.collectionName)],
    ['__NOCOBASE_DESCRIPTION__', context.description],
    ['__NOCOBASE_DISPLAY_NAME__', jsonStringContent(context.displayName)],
    ['__NOCOBASE_DISPLAY_NAME_LITERAL__', literal(context.displayName)],
    [
      '__NOCOBASE_HELLO_MESSAGE_LITERAL__',
      literal(`Hello from ${context.displayName}`),
    ],
    ['__NOCOBASE_MIGRATION_NAME_LITERAL__', literal(context.migrationName)],
    ['__NOCOBASE_MIGRATION_NAME__', context.migrationName],
    ['__NOCOBASE_MODULE_NAME__', context.moduleName],
    ['__NOCOBASE_PACKAGE_NAME_LITERAL__', literal(context.packageName)],
    ['__NOCOBASE_PACKAGE_NAME__', context.packageName],
    ['__NOCOBASE_ROUTE_PATH_LITERAL__', literal(`/${context.shortName}`)],
    ['__NOCOBASE_SEED_NAME_LITERAL__', literal(context.seedName)],
    ['__NOCOBASE_SEED_NAME__', context.seedName],
    [
      '__NOCOBASE_SERVICE_TOKEN_NAME_LITERAL__',
      literal(`${context.packageName}/service`),
    ],
    ['__NOCOBASE_SHORT_NAME_LITERAL__', literal(context.shortName)],
    ['__NOCOBASE_SHORT_NAME__', context.shortName],
    ['__NOCOBASE_SYMBOL_NAME__', context.symbolName],
    [
      '__NOCOBASE_WELCOME_MESSAGE_LITERAL__',
      literal(`Welcome from ${context.packageName}`),
    ],
  ];
}

export function renderTemplateValue(
  value: string,
  context: PluginTemplateContext,
): string {
  const replacements = new Map(replacementEntries(context));

  return value.replace(placeholderPattern, (placeholder) => {
    const replacement = replacements.get(placeholder);
    if (replacement === undefined) {
      throw new Error(`Unknown template placeholder: ${placeholder}`);
    }
    return replacement;
  });
}

async function collectTemplateFiles(
  templateDirectory: string,
  directory = templateDirectory,
): Promise<TemplateFile[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: TemplateFile[] = [];

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const sourcePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Template entries must not be symbolic links: ${sourcePath}`,
      );
    }
    if (entry.isDirectory()) {
      files.push(
        ...(await collectTemplateFiles(templateDirectory, sourcePath)),
      );
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`Unsupported template entry: ${sourcePath}`);
    }

    files.push({
      sourcePath,
      outputPath: outputPathForTemplateFile(
        path.relative(templateDirectory, sourcePath),
      ),
    });
  }

  return files;
}

export async function listTemplateFiles(
  templateDirectory: string = DEFAULT_TEMPLATE_DIRECTORY,
  context?: PluginTemplateContext,
): Promise<string[]> {
  await access(templateDirectory, constants.R_OK);
  const files = await collectTemplateFiles(templateDirectory);

  return files.map((file) =>
    context ? renderTemplateValue(file.outputPath, context) : file.outputPath,
  );
}

async function renderManifest(
  sourcePath: string,
  context: PluginTemplateContext,
): Promise<string> {
  const manifest = JSON.parse(await readFile(sourcePath, 'utf8')) as Record<
    string,
    unknown
  >;

  manifest.name = context.packageName;
  manifest.displayName = context.displayName;
  manifest.description = context.description;

  return `${JSON.stringify(manifest, null, 2)}\n`;
}

async function formatRenderedSource(
  contents: string,
  outputPath: string,
): Promise<string> {
  const parser =
    outputPath === 'package.json'
      ? 'json-stringify'
      : /\.(?:ts|tsx)(?:\.example)?$/u.test(outputPath)
        ? 'typescript'
        : /\.(?:js|mjs)$/u.test(outputPath)
          ? 'babel'
          : /\.json$/u.test(outputPath)
            ? 'json'
            : /\.md$/u.test(outputPath)
              ? 'markdown'
              : undefined;

  return parser
    ? format(contents, { ...prettierConfig, filepath: outputPath, parser })
    : contents;
}

export async function renderTemplate(options: {
  readonly context: PluginTemplateContext;
  readonly targetDirectory: string;
  readonly templateDirectory?: string;
}): Promise<string[]> {
  const templateDirectory =
    options.templateDirectory ?? DEFAULT_TEMPLATE_DIRECTORY;
  const files = await collectTemplateFiles(templateDirectory);
  const outputFiles: string[] = [];

  for (const file of files) {
    const outputPath = renderTemplateValue(file.outputPath, options.context);
    const targetPath = path.resolve(options.targetDirectory, outputPath);
    const relativeTarget = path.relative(options.targetDirectory, targetPath);
    if (
      relativeTarget.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeTarget)
    ) {
      throw new Error(`Template output escapes the target: ${outputPath}`);
    }

    const renderedContents =
      file.outputPath === 'package.json'
        ? await renderManifest(file.sourcePath, options.context)
        : renderTemplateValue(
            await readFile(file.sourcePath, 'utf8'),
            options.context,
          );
    const contents = await formatRenderedSource(renderedContents, outputPath);

    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, contents, { encoding: 'utf8', flag: 'wx' });
    outputFiles.push(outputPath);
  }

  return outputFiles;
}
