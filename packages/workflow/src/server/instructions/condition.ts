import { createNodeExpression } from '../../workflow-source/core.js';
import type { ConfigIssue, NodeExpression, NodeResultSchema, WorkflowNodeSourceInput } from '../../workflow-source/types.js';
import { NODE_RUN_STATUS } from '../constants.js';
import { evaluateJsonLogic, validateJsonLogicExpression } from '../expressions/index.js';
import type { JsonLogicExpression } from '../expressions/index.js';
import { WorkflowInstruction } from '../types.js';
import type { JsonObject, WorkflowInstructionContext, WorkflowInstructionResult, WorkflowNode, WorkflowNodeRun } from '../types.js';

export const CONDITION_BRANCH_KEYS: { readonly yes: 'yes'; readonly no: 'no' } = { yes: 'yes', no: 'no' };
export type ConditionBranchKey = (typeof CONDITION_BRANCH_KEYS)[keyof typeof CONDITION_BRANCH_KEYS];

export type ConditionConfig = JsonObject & { expression?: JsonLogicExpression };

function conditionConfigIssues(config: unknown): ConfigIssue[] {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    return [{ path: 'config', message: 'condition config must be an object' }];
  }
  const record = config as JsonObject;
  const issues: ConfigIssue[] = [];
  for (const key of Object.keys(record)) {
    if (key !== 'expression') issues.push({ path: `config.${key}`, message: `condition config does not accept field "${key}"` });
  }
  if (Object.hasOwn(record, 'expression')) {
    const result = validateJsonLogicExpression(record.expression);
    for (const issue of result.issues) {
      const path = issue.path === '$' ? 'expression' : `expression${issue.path.slice(1)}`;
      issues.push({ path: `config.${path}`, message: issue.message });
    }
  }
  return issues;
}

export function validateConditionConfig(config: JsonObject): Record<string, string> | null {
  const issues = conditionConfigIssues(config);
  const errors = Object.fromEntries(issues.map(({ path, message }) => [path.replace(/^config\./, ''), message]));
  return issues.length ? errors : null;
}

function readConditionConfig(config: JsonObject): ConditionConfig {
  const issues = conditionConfigIssues(config);
  if (issues.length) throw new Error(`Invalid condition config: ${issues.map(({ path, message }) => `${path}: ${message}`).join('; ')}`);
  return Object.hasOwn(config, 'expression') ? { expression: config.expression as JsonLogicExpression } : {};
}

export class ConditionInstruction extends WorkflowInstruction<ConditionConfig> {
  static readonly type: 'condition' = 'condition';
  static readonly branches: readonly ['yes', 'no'] = ['yes', 'no'];
  static readonly branching: true = true;
  static readonly result: NodeResultSchema = { type: 'boolean', description: 'The evaluated condition result.' };

  constructor(context: WorkflowInstructionContext) {
    super({ ...context, node: context.node as WorkflowNode<ConditionConfig> });
  }

  static create(source: WorkflowNodeSourceInput<ConditionConfig>): NodeExpression<ConditionBranchKey> {
    return createNodeExpression(ConditionInstruction, source);
  }

  static validateConfig(config: unknown): ConfigIssue[] {
    return conditionConfigIssues(config);
  }

  async run(): Promise<WorkflowInstructionResult> {
    const config = readConditionConfig(this.config);
    const evaluated = config.expression === undefined
      ? true
      : evaluateJsonLogic(config.expression, this.processor.getConditionDataBindings());
    if (typeof evaluated !== 'boolean') {
      throw new TypeError(`Condition expression must evaluate to a boolean, received ${evaluated === null ? 'null' : typeof evaluated}`);
    }
    const branchKey = evaluated ? CONDITION_BRANCH_KEYS.yes : CONDITION_BRANCH_KEYS.no;
    const branch = this.processor.getBranches(this.node).find((candidate) => candidate.branchKey === branchKey);
    return branch
      ? { status: NODE_RUN_STATUS.PENDING, result: evaluated, nextKey: branch.key }
      : { status: NODE_RUN_STATUS.RESOLVED, result: evaluated };
  }

  async resume(): Promise<WorkflowInstructionResult | null> {
    if (!this.input || !('status' in this.input)) throw new Error(`Condition node "${this.node.key}" was resumed without a branch nodeRun`);
    const branchNodeRun: WorkflowNodeRun = this.input;
    if (branchNodeRun.status === NODE_RUN_STATUS.PENDING) return null;
    if (branchNodeRun.status === NODE_RUN_STATUS.RESOLVED) {
      const parentNodeRun = this.processor.findBranchParentNodeRun(branchNodeRun, this.node);
      return { status: NODE_RUN_STATUS.RESOLVED, result: parentNodeRun ? parentNodeRun.result : null };
    }
    return {
      status: branchNodeRun.status,
      error: `Condition node "${this.node.key}" received an error from branch node "${branchNodeRun.nodeKey}"`,
    };
  }
}

export default ConditionInstruction;
