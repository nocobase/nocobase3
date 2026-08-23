import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  WorkflowFlatIr,
  WorkflowSourceAst,
} from '../workflow-source/core.js';

import { ConditionInstruction, RunInstruction } from './instructions/index.js';
import { compileWorkflowSource } from './source-compiler.js';
import { WorkflowSourceCheckError } from './source-issues.js';
import { parseWorkflowSource } from './source-parser.js';
import type {
  WorkflowNodeSourceContract,
  WorkflowSourceContracts,
} from './source-validator.js';
import { validateWorkflowSourceAst } from './source-validator.js';

export interface WorkflowSourceCheckOptions {
  contracts?: WorkflowSourceContracts;
}
export interface WorkflowSourceCheckResult {
  file: string;
  ast: WorkflowSourceAst;
  ir: WorkflowFlatIr;
}

export const coreWorkflowSourceContracts: WorkflowSourceContracts = {
  nodes: new Map<string, WorkflowNodeSourceContract>([
    ['condition', ConditionInstruction],
    ['run', RunInstruction],
  ]),
};

export async function checkWorkflowPackage(
  packagePath: string,
  options: WorkflowSourceCheckOptions = {},
): Promise<WorkflowSourceCheckResult> {
  const stat = await fs.stat(packagePath);
  const file = stat.isDirectory()
    ? path.join(packagePath, 'workflow.ts')
    : packagePath;
  const parsed = await parseWorkflowSource(file);
  const contracts = options.contracts ?? coreWorkflowSourceContracts;
  const issues = validateWorkflowSourceAst(parsed.ast, file, contracts);
  if (issues.length) throw new WorkflowSourceCheckError(issues);
  return {
    file,
    ast: parsed.ast,
    ir: compileWorkflowSource(parsed.ast, file, contracts),
  };
}
