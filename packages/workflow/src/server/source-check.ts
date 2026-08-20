import fs from 'node:fs/promises';
import path from 'node:path';

import type { WorkflowFlatIr, WorkflowSourceAst } from '../workflow-source/core.js';

import { condition, run } from '../workflow-source/index.js';
import { custom } from '../workflow-source/triggers/index.js';
import { compileWorkflowSource } from './source-compiler.js';
import { WorkflowSourceCheckError } from './source-issues.js';
import { parseWorkflowSource } from './source-parser.js';
import type { WorkflowNodeSourceContract, WorkflowSourceContracts, WorkflowTriggerSourceContract } from './source-validator.js';
import { validateWorkflowSourceAst } from './source-validator.js';

export interface WorkflowSourceCheckOptions { contracts?: WorkflowSourceContracts; }
export interface WorkflowSourceCheckResult { file: string; ast: WorkflowSourceAst; ir: WorkflowFlatIr; }

export const coreWorkflowSourceContracts: WorkflowSourceContracts = {
  nodes: new Map<string, WorkflowNodeSourceContract>([['condition', condition], ['run', run]]),
  triggers: new Map<string, WorkflowTriggerSourceContract>([['custom', custom]]),
};

export async function checkWorkflowPackage(packagePath: string, options: WorkflowSourceCheckOptions = {}): Promise<WorkflowSourceCheckResult> {
  const stat = await fs.stat(packagePath);
  const file = stat.isDirectory() ? path.join(packagePath, 'workflow.ts') : packagePath;
  const parsed = await parseWorkflowSource(file);
  const issues = validateWorkflowSourceAst(parsed.ast, file, options.contracts ?? coreWorkflowSourceContracts);
  if (issues.length) throw new WorkflowSourceCheckError(issues);
  return { file, ast: parsed.ast, ir: compileWorkflowSource(parsed.ast, file) };
}
