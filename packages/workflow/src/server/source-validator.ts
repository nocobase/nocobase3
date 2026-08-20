import type { WorkflowSourceAst } from '../workflow-source/core.js';

import type { WorkflowInstruction, WorkflowTrigger } from './types.js';
import { normalizeWorkflowInputSchema, type WorkflowInputSchema } from './workflow-inputs.js';
import type { WorkflowSourceIssue } from './source-issues.js';

const NODE_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const BRANCH_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export interface WorkflowNodeSourceContract {
  readonly type: string;
  readonly branches: readonly string[] | null | ((config: never) => readonly string[]);
  readonly validateConfig: (config: unknown) => readonly { path: string; message: string }[];
}

export interface WorkflowTriggerSourceContract {
  readonly type: string;
  readonly validateConfig: (config: unknown) => readonly { path: string; message: string }[];
}

export interface WorkflowSourceContracts {
  nodes: ReadonlyMap<string, WorkflowNodeSourceContract>;
  triggers: ReadonlyMap<string, WorkflowTriggerSourceContract>;
}

export interface WorkflowSourceRuntimeContracts {
  instructions: Map<string, WorkflowInstruction>;
  triggers: Map<string, WorkflowTrigger>;
}

type TemplateParameter = { key: string; defaultValue?: string };

function templateParameters(value: unknown): TemplateParameter[] {
  if (typeof value === 'string') {
    return [...value.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((match) => {
      const expression = match[1].trim();
      const separator = expression.indexOf(':');
      return { key: separator < 0 ? expression : expression.slice(0, separator).trim(), ...(separator < 0 ? {} : { defaultValue: expression.slice(separator + 1) }) };
    }).filter((parameter) => parameter.key.includes('$input'));
  }
  if (Array.isArray(value)) return value.flatMap(templateParameters);
  if (value !== null && typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => [...templateParameters(key), ...templateParameters(item)]);
  return [];
}

function issue(file: string, phase: 'schema' | 'semantic', code: string, message: string, astPath: string, contractType: string, nodeKey?: string): WorkflowSourceIssue {
  return { phase, code, message, file, astPath, contractType, ...(nodeKey === undefined ? {} : { nodeKey }) };
}

export function validateWorkflowSourceAst(
  ast: WorkflowSourceAst,
  file: string,
  contracts: WorkflowSourceContracts | WorkflowSourceRuntimeContracts,
): WorkflowSourceIssue[] {
  const issues: WorkflowSourceIssue[] = [];
  let inputs: WorkflowInputSchema = {};
  try {
    inputs = normalizeWorkflowInputSchema(ast.inputs, 'workflow.inputs');
  } catch (error) {
    issues.push(issue(file, 'schema', 'INVALID_INPUT_SCHEMA', error instanceof Error ? error.message : String(error), 'workflow.inputs', 'WorkflowInputSchema', 'workflow'));
  }
  const triggerContract = 'triggers' in contracts && contracts.triggers.get(ast.trigger.type);
  if (!triggerContract) {
    issues.push(issue(file, 'semantic', 'UNREGISTERED_TRIGGER', `Trigger type "${ast.trigger.type}" is not registered by this application`, 'workflow.trigger', ast.trigger.type, 'workflow'));
  } else {
    const errors = triggerContract.validateConfig?.(ast.trigger.config) ?? [];
    if (Array.isArray(errors)) {
      for (const configIssue of errors) issues.push(issue(file, 'schema', 'INVALID_TRIGGER_CONFIG', configIssue.message, `workflow.trigger.${configIssue.path}`, ast.trigger.type, 'workflow'));
    } else {
      for (const [path, message] of Object.entries(errors)) issues.push(issue(file, 'schema', 'INVALID_TRIGGER_CONFIG', message, `workflow.trigger.config.${path}`, ast.trigger.type, 'workflow'));
    }
  }

  const keys = new Set<string>();
  const visit = (nodes: WorkflowSourceAst['nodes'], basePath: string): void => {
    nodes.forEach((node, index) => {
      const astPath = `${basePath}[${index}]`;
      if (!NODE_KEY_PATTERN.test(node.key) || FORBIDDEN_KEYS.has(node.key)) issues.push(issue(file, 'semantic', 'INVALID_NODE_KEY', `Node key must match ${NODE_KEY_PATTERN.source} and must not be a reserved object key`, astPath, node.type, node.key));
      if (keys.has(node.key)) issues.push(issue(file, 'semantic', 'DUPLICATE_NODE_KEY', `Node key "${node.key}" is used more than once`, astPath, node.type, node.key));
      keys.add(node.key);
      const contract = 'instructions' in contracts ? contracts.instructions.get(node.type) : contracts.nodes.get(node.type);
      if (!contract) {
        issues.push(issue(file, 'semantic', 'UNREGISTERED_NODE_TYPE', `Node type "${node.type}" is not registered by this application`, astPath, node.type, node.key));
      } else {
        const errors = contract.validateConfig?.(node.config) ?? [];
        if (Array.isArray(errors)) {
          for (const configIssue of errors) issues.push(issue(file, 'schema', 'INVALID_NODE_CONFIG', configIssue.message, `${astPath}.${configIssue.path}`, node.type, node.key));
        } else {
          for (const [path, message] of Object.entries(errors)) issues.push(issue(file, 'schema', 'INVALID_NODE_CONFIG', message, `${astPath}.config.${path}`, node.type, node.key));
        }
      }
      for (const parameter of templateParameters(node.config)) {
        const match = /^\$input\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(parameter.key);
        const message = parameter.defaultValue !== undefined
          ? `Workflow input reference "${parameter.key}" cannot have an inline default`
          : !match ? `Invalid workflow input reference "${parameter.key}"`
            : !Object.hasOwn(inputs, match[1]) ? `Workflow input "${match[1]}" is not declared` : null;
        if (message) issues.push(issue(file, 'semantic', 'INVALID_INPUT_REFERENCE', message, `${astPath}.config`, node.type, node.key));
      }
      for (const [branchKey, branch] of Object.entries(node.branches ?? {})) {
        if (!BRANCH_KEY_PATTERN.test(branchKey) || FORBIDDEN_KEYS.has(branchKey)) issues.push(issue(file, 'semantic', 'INVALID_BRANCH_KEY', `Branch key "${branchKey}" is unsafe`, `${astPath}.branches.${branchKey}`, node.type, node.key));
        visit(branch, `${astPath}.branches.${branchKey}`);
      }
      if (contract && 'branches' in contract) {
        const allowed = typeof contract.branches === 'function'
          ? contract.branches(node.config as never)
          : contract.branches;
        for (const branchKey of Object.keys(node.branches ?? {})) {
          if (allowed === null || !allowed.includes(branchKey)) {
            issues.push(issue(file, 'semantic', 'INVALID_BRANCH_KEY', `Branch "${branchKey}" is not declared by node contract "${node.type}"`, `${astPath}.branches.${branchKey}`, node.type, node.key));
          }
        }
      }
    });
  };
  visit(ast.nodes, 'workflow.nodes');
  return issues;
}
