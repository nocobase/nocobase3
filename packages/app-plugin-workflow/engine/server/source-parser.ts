import vm from 'node:vm';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, type Message } from 'esbuild';
import ts from 'typescript';
import type { WorkflowSourceAst } from '../workflow-source/core.js';

import {
  WorkflowSourceCheckError,
  type WorkflowSourceIssue,
} from './source-issues.js';

export interface ParsedWorkflowSource {
  ast: WorkflowSourceAst;
  bundle: string;
}

function diagnosticIssue(
  filePath: string,
  diagnostic: ts.Diagnostic,
): WorkflowSourceIssue {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  const start =
    diagnostic.file && diagnostic.start !== undefined
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
      : undefined;
  return {
    phase: 'typecheck',
    code: `TS${diagnostic.code}`,
    message,
    file: diagnostic.file?.fileName ?? filePath,
    ...(start === undefined
      ? {}
      : { line: start.line + 1, column: start.character + 1 }),
    astPath: 'workflow',
    nodeKey: 'workflow',
    contractType: 'TypeScript',
  };
}

export function typecheckWorkflowSource(
  filePath: string,
): WorkflowSourceIssue[] {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    noEmit: true,
    allowImportingTsExtensions: true,
    skipLibCheck: true,
    customConditions: ['source'],
  };
  const program = ts.createProgram([filePath], options);
  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) => diagnosticIssue(filePath, diagnostic));
}

function bundleIssue(filePath: string, message: Message): WorkflowSourceIssue {
  return {
    phase: 'bundle',
    code: 'BUNDLE_FAILED',
    message: message.text,
    file: message.location?.file ?? filePath,
    ...(message.location === null
      ? {}
      : { line: message.location.line, column: message.location.column + 1 }),
    astPath: 'workflow',
    nodeKey: 'workflow',
    contractType: 'WorkflowSourceAst',
  };
}

function isWorkflowSourceAst(value: unknown): value is WorkflowSourceAst {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as { title?: unknown }).title === 'string' &&
    Array.isArray((value as { nodes?: unknown }).nodes)
  );
}

function assertSerializableDefinition(
  value: unknown,
  location: string,
  ancestors: Set<object> = new Set<object>(),
): void {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError(`${location} contains a non-finite number`);
    return;
  }
  if (typeof value !== 'object')
    throw new TypeError(
      `${location} contains a non-JSON ${typeof value} value`,
    );
  if (ancestors.has(value))
    throw new TypeError(`${location} contains a circular reference`);
  if (
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) !== '[object Object]'
  ) {
    throw new TypeError(`${location} contains a non-JSON object value`);
  }
  if (Object.getOwnPropertySymbols(value).length)
    throw new TypeError(`${location} contains a symbol-keyed value`);
  ancestors.add(value);
  try {
    for (const [key, item] of Object.entries(value))
      assertSerializableDefinition(item, `${location}.${key}`, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

export async function parseWorkflowSource(
  filePath: string,
  runTypecheck: boolean = true,
): Promise<ParsedWorkflowSource> {
  if (runTypecheck) {
    const issues = typecheckWorkflowSource(filePath);
    if (issues.length) throw new WorkflowSourceCheckError(issues);
  }

  let bundle: string;
  try {
    const sourceExtension = fileURLToPath(import.meta.url).endsWith('.ts')
      ? '.ts'
      : '.js';
    const workflowSourceEntry = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      `../workflow-source/index${sourceExtension}`,
    );
    const result = await build({
      entryPoints: [filePath],
      bundle: true,
      write: false,
      platform: 'node',
      format: 'cjs',
      target: 'node22',
      define: { 'import.meta.url': JSON.stringify(import.meta.url) },
      conditions: ['source'],
      plugins: [
        {
          name: 'workflow-authoring-entry',
          setup(buildContext): void {
            buildContext.onResolve(
              {
                filter:
                  /^@nocobase\/app-plugin-workflow(?:\/workflow-source)?$/,
              },
              () => ({
                path: workflowSourceEntry,
              }),
            );
          },
        },
      ],
      sourcemap: 'inline',
      logLevel: 'silent',
    });
    bundle = result.outputFiles[0]?.text ?? '';
  } catch (error) {
    const errors =
      typeof error === 'object' && error !== null && 'errors' in error
        ? (error as { errors: Message[] }).errors
        : [];
    throw new WorkflowSourceCheckError(
      errors.length
        ? errors.map((message) => bundleIssue(filePath, message))
        : [
            {
              phase: 'bundle',
              code: 'BUNDLE_FAILED',
              message: error instanceof Error ? error.message : String(error),
              file: filePath,
              nodeKey: 'workflow',
              astPath: 'workflow',
              contractType: 'WorkflowSourceAst',
            },
          ],
    );
  }

  try {
    const module = { exports: {} as { default?: unknown } };
    const context = vm.createContext({
      module,
      exports: module.exports,
      require: createRequire(filePath),
      process,
      Buffer,
      console,
      AbortController,
      AbortSignal,
      URL,
      setTimeout,
      clearTimeout,
    });
    new vm.Script(bundle, { filename: filePath }).runInContext(context, {
      timeout: 5_000,
    });
    if (!isWorkflowSourceAst(module.exports.default)) {
      throw new WorkflowSourceCheckError([
        {
          phase: 'evaluate',
          code: 'INVALID_DEFAULT_EXPORT',
          message:
            'workflow.ts must default-export the value returned by defineWorkflow()',
          file: filePath,
          nodeKey: 'workflow',
          astPath: 'workflow',
          contractType: 'WorkflowSourceAst',
        },
      ]);
    }
    assertSerializableDefinition(module.exports.default, 'workflow');
    // Move values out of the isolated VM realm and strip its object prototypes.
    const ast = JSON.parse(
      JSON.stringify(module.exports.default),
    ) as WorkflowSourceAst;
    return { ast, bundle };
  } catch (error) {
    if (error instanceof WorkflowSourceCheckError) throw error;
    throw new WorkflowSourceCheckError([
      {
        phase: 'evaluate',
        code: 'EVALUATION_FAILED',
        message: error instanceof Error ? error.message : String(error),
        file: filePath,
        nodeKey: 'workflow',
        astPath: 'workflow',
        contractType: 'WorkflowSourceAst',
      },
    ]);
  }
}
