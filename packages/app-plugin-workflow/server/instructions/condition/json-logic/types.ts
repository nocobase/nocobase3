import type { JsonPrimitive } from '../../../engine/types.js';

export type JsonLogicOperator =
  | 'and'
  | 'or'
  | '!'
  | '==='
  | '!=='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'in'
  | 'var'
  | 'startsWith'
  | 'endsWith';

export interface JsonLogicOperatorCapability {
  name: JsonLogicOperator;
  arguments: 'one' | 'two' | 'one-or-more' | 'variable';
  returnType: 'boolean' | 'value';
  description: string;
}

export interface JsonLogicCapabilities {
  engine: 'json-logic';
  version: 1;
  operators: readonly JsonLogicOperatorCapability[];
  variableRoots: readonly ('input' | 'parameters' | 'nodeResults')[];
  limits: {
    maxDepth: number;
    maxNodes: number;
    maxArrayLength: number;
    maxVariablePathLength: number;
  };
}

export type JsonLogicOperation =
  | { and: JsonLogicExpression[] }
  | { or: JsonLogicExpression[] }
  | { '!': JsonLogicExpression | [JsonLogicExpression] }
  | { '===': [JsonLogicExpression, JsonLogicExpression] }
  | { '!==': [JsonLogicExpression, JsonLogicExpression] }
  | { '>': [JsonLogicExpression, JsonLogicExpression] }
  | { '>=': [JsonLogicExpression, JsonLogicExpression] }
  | { '<': [JsonLogicExpression, JsonLogicExpression] }
  | { '<=': [JsonLogicExpression, JsonLogicExpression] }
  | { in: [JsonLogicExpression, JsonLogicExpression] }
  | { var: string | [string] | [string, JsonLogicExpression] }
  | { startsWith: [JsonLogicExpression, JsonLogicExpression] }
  | { endsWith: [JsonLogicExpression, JsonLogicExpression] };

/** The serializable JSON AST accepted by the built-in condition engine. */
export type JsonLogicExpression =
  JsonPrimitive | JsonLogicExpression[] | JsonLogicOperation;

export type JsonLogicValidationCode =
  | 'INVALID_VALUE'
  | 'RESOURCE_LIMIT'
  | 'INVALID_OPERATION'
  | 'INVALID_ARGUMENTS'
  | 'INVALID_VARIABLE';

export interface JsonLogicValidationIssue {
  code: JsonLogicValidationCode;
  path: string;
  message: string;
}

export interface JsonLogicValidationResult {
  valid: boolean;
  issues: JsonLogicValidationIssue[];
}

export interface JsonLogicDataBindings {
  readonly input: Readonly<Record<string, unknown>>;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly nodeResults: Readonly<Record<string, unknown>>;
}
