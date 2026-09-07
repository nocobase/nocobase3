import { fork } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import type { WorkflowSourceAst } from '../server/instructions/definition.js';

import { WorkflowSourceCheckError } from './source-issues.js';

export interface ParsedWorkflowSource {
  ast: WorkflowSourceAst;
}

interface EvaluationSuccess {
  readonly ok: true;
  readonly json: string;
}

interface EvaluationFailure {
  readonly ok: false;
  readonly message: string;
}

type EvaluationResult = EvaluationSuccess | EvaluationFailure;

const EVALUATION_TIMEOUT_MS = 5_000;

function diagnosticIssue(
  filePath: string,
  diagnostic: ts.Diagnostic,
): import('./source-issues.js').WorkflowSourceIssue {
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
): import('./source-issues.js').WorkflowSourceIssue[] {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    noEmit: true,
    allowImportingTsExtensions: true,
    skipLibCheck: true,
    erasableSyntaxOnly: true,
    customConditions: ['source'],
  };
  const program = ts.createProgram([filePath], options);
  return ts
    .getPreEmitDiagnostics(program)
    .filter(
      (diagnostic) =>
        diagnostic.code !== 1294 ||
        diagnostic.file?.fileName === path.resolve(filePath),
    )
    .map((diagnostic) => diagnosticIssue(filePath, diagnostic));
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

function evaluationIssue(
  filePath: string,
  message: string,
): WorkflowSourceCheckError {
  return new WorkflowSourceCheckError([
    {
      phase: 'evaluate',
      code: 'EVALUATION_FAILED',
      message,
      file: filePath,
      nodeKey: 'workflow',
      astPath: 'workflow',
      contractType: 'WorkflowSourceAst',
    },
  ]);
}

/** Load one declarative workflow in a disposable Node process. */
export async function parseWorkflowSource(
  filePath: string,
): Promise<ParsedWorkflowSource> {
  const absolutePath = path.resolve(filePath);
  const issues = typecheckWorkflowSource(absolutePath);
  if (issues.length) throw new WorkflowSourceCheckError(issues);
  const runningFromSource = import.meta.url.endsWith('.ts');
  const workerUrl = new URL(
    `./source-evaluator-worker.${runningFromSource ? 'ts' : 'js'}`,
    import.meta.url,
  );
  const sourceLoader = runningFromSource
    ? createRequire(import.meta.url).resolve('tsx/esm')
    : undefined;

  const result = await new Promise<EvaluationResult>((resolve, reject) => {
    const child = fork(fileURLToPath(workerUrl), [absolutePath], {
      execArgv: sourceLoader ? ['--import', sourceLoader] : [],
      serialization: 'json',
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let stderr = '';
    let received = false;
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(
        evaluationIssue(
          absolutePath,
          `Workflow definition evaluation exceeded ${EVALUATION_TIMEOUT_MS}ms`,
        ),
      );
    }, EVALUATION_TIMEOUT_MS);
    child.once('message', (message: EvaluationResult) => {
      received = true;
      clearTimeout(timeout);
      resolve(message);
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(evaluationIssue(absolutePath, error.message));
    });
    child.once('exit', (code, signal) => {
      if (received) return;
      clearTimeout(timeout);
      reject(
        evaluationIssue(
          absolutePath,
          stderr.trim() ||
            `Workflow definition process exited before returning an AST (${signal ?? `code ${code}`})`,
        ),
      );
    });
  });

  if (!result.ok) throw evaluationIssue(absolutePath, result.message);
  const ast = JSON.parse(result.json) as unknown;
  if (!isWorkflowSourceAst(ast)) {
    throw new WorkflowSourceCheckError([
      {
        phase: 'evaluate',
        code: 'INVALID_DEFAULT_EXPORT',
        message:
          'workflow.ts must default-export the value returned by defineWorkflow()',
        file: absolutePath,
        nodeKey: 'workflow',
        astPath: 'workflow',
        contractType: 'WorkflowSourceAst',
      },
    ]);
  }
  return { ast };
}
