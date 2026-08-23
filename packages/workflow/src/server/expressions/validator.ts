import type {
  JsonLogicExpression,
  JsonLogicCapabilities,
  JsonLogicOperatorCapability,
  JsonLogicOperator,
  JsonLogicValidationCode,
  JsonLogicValidationIssue,
  JsonLogicValidationResult,
} from './types.js';

export const JSON_LOGIC_MAX_DEPTH: 32 = 32;
export const JSON_LOGIC_MAX_NODES: 256 = 256;
export const JSON_LOGIC_MAX_ARRAY_LENGTH: 64 = 64;
export const JSON_LOGIC_MAX_VARIABLE_PATH_LENGTH: 256 = 256;

export const JSON_LOGIC_OPERATORS: readonly JsonLogicOperator[] = [
  'and', 'or', '!', '===', '!==', '>', '>=', '<', '<=', 'in', 'var', 'startsWith', 'endsWith',
];
export const JSON_LOGIC_VARIABLE_ROOTS: readonly ('context' | 'input' | 'nodeResults')[] = ['context', 'input', 'nodeResults'];

const OPERATORS: ReadonlySet<JsonLogicOperator> = new Set<JsonLogicOperator>(JSON_LOGIC_OPERATORS);
const ALLOWED_VARIABLE_ROOTS: ReadonlySet<string> = new Set<string>(JSON_LOGIC_VARIABLE_ROOTS);
const FORBIDDEN_PATH_SEGMENTS: ReadonlySet<string> = new Set<string>(['__proto__', 'prototype', 'constructor']);

export const JSON_LOGIC_CAPABILITIES: JsonLogicCapabilities = Object.freeze({
  engine: 'json-logic',
  version: 1,
  operators: Object.freeze<JsonLogicOperatorCapability[]>([
    { name: 'and', arguments: 'one-or-more', returnType: 'value', description: 'Short-circuit logical conjunction' },
    { name: 'or', arguments: 'one-or-more', returnType: 'value', description: 'Short-circuit logical disjunction' },
    { name: '!', arguments: 'one', returnType: 'boolean', description: 'Logical negation' },
    { name: '===', arguments: 'two', returnType: 'boolean', description: 'Strict equality' },
    { name: '!==', arguments: 'two', returnType: 'boolean', description: 'Strict inequality' },
    { name: '>', arguments: 'two', returnType: 'boolean', description: 'Same-type numeric or string ordering' },
    { name: '>=', arguments: 'two', returnType: 'boolean', description: 'Same-type numeric or string ordering' },
    { name: '<', arguments: 'two', returnType: 'boolean', description: 'Same-type numeric or string ordering' },
    { name: '<=', arguments: 'two', returnType: 'boolean', description: 'Same-type numeric or string ordering' },
    { name: 'in', arguments: 'two', returnType: 'boolean', description: 'Array membership or string containment' },
    { name: 'var', arguments: 'variable', returnType: 'value', description: 'Read an allowed data binding path' },
    { name: 'startsWith', arguments: 'two', returnType: 'boolean', description: 'String prefix test' },
    { name: 'endsWith', arguments: 'two', returnType: 'boolean', description: 'String suffix test' },
  ]),
  variableRoots: JSON_LOGIC_VARIABLE_ROOTS,
  limits: Object.freeze({
    maxDepth: JSON_LOGIC_MAX_DEPTH,
    maxNodes: JSON_LOGIC_MAX_NODES,
    maxArrayLength: JSON_LOGIC_MAX_ARRAY_LENGTH,
    maxVariablePathLength: JSON_LOGIC_MAX_VARIABLE_PATH_LENGTH,
  }),
});

interface ValidationState {
  nodes: number;
  readonly ancestors: Set<object>;
  readonly issues: JsonLogicValidationIssue[];
}

function addIssue(state: ValidationState, code: JsonLogicValidationCode, path: string, message: string): void {
  state.issues.push({ code, path, message });
}

function operationArguments(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function validateArity(operator: JsonLogicOperator, value: unknown, path: string, state: ValidationState): boolean {
  const args = operationArguments(value);
  const count = args.length;
  const valid = operator === 'and' || operator === 'or'
    ? Array.isArray(value) && count >= 1
    : operator === 'var'
      ? typeof value === 'string' || (Array.isArray(value) && (count === 1 || count === 2))
      : count === (operator === '!' ? 1 : 2);
  if (!valid) {
    const expected = operator === 'and' || operator === 'or' ? 'an array with at least one argument'
      : operator === 'var' ? 'a path string or an array of one or two arguments'
        : operator === '!' ? 'exactly one argument' : 'exactly two arguments';
    addIssue(state, 'INVALID_ARGUMENTS', path, `Operator "${operator}" requires ${expected}`);
  }
  if (Array.isArray(value) && value.length > JSON_LOGIC_MAX_ARRAY_LENGTH) {
    addIssue(state, 'RESOURCE_LIMIT', path, `Array length exceeds ${JSON_LOGIC_MAX_ARRAY_LENGTH}`);
  }
  return valid;
}

function validateVariable(value: unknown, path: string, state: ValidationState): void {
  const args = operationArguments(value);
  const variablePath = args[0];
  if (typeof variablePath !== 'string' || variablePath.length === 0) {
    addIssue(state, 'INVALID_VARIABLE', path, 'Variable path must be a non-empty string');
    return;
  }
  if (variablePath.length > JSON_LOGIC_MAX_VARIABLE_PATH_LENGTH) {
    addIssue(state, 'RESOURCE_LIMIT', path, `Variable path exceeds ${JSON_LOGIC_MAX_VARIABLE_PATH_LENGTH} characters`);
    return;
  }
  const segments = variablePath.split('.');
  if (segments.some((segment) => segment.length === 0)) {
    addIssue(state, 'INVALID_VARIABLE', path, 'Variable path must not contain empty segments');
  } else if (!ALLOWED_VARIABLE_ROOTS.has(segments[0])) {
    addIssue(state, 'INVALID_VARIABLE', path, `Variable root must be one of: ${[...ALLOWED_VARIABLE_ROOTS].join(', ')}`);
  } else if (segments.some((segment) => FORBIDDEN_PATH_SEGMENTS.has(segment))) {
    addIssue(state, 'INVALID_VARIABLE', path, 'Variable path contains a forbidden property');
  }
}

function visit(value: unknown, path: string, depth: number, state: ValidationState): void {
  state.nodes += 1;
  if (state.nodes > JSON_LOGIC_MAX_NODES) {
    if (!state.issues.some((issue) => issue.code === 'RESOURCE_LIMIT' && issue.message.includes('nodes'))) {
      addIssue(state, 'RESOURCE_LIMIT', path, `Expression exceeds ${JSON_LOGIC_MAX_NODES} nodes`);
    }
    return;
  }
  if (depth > JSON_LOGIC_MAX_DEPTH) {
    addIssue(state, 'RESOURCE_LIMIT', path, `Expression depth exceeds ${JSON_LOGIC_MAX_DEPTH}`);
    return;
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) addIssue(state, 'INVALID_VALUE', path, 'Expression numbers must be finite');
    return;
  }
  if (typeof value !== 'object') {
    addIssue(state, 'INVALID_VALUE', path, 'Expression must contain only JSON-serializable values');
    return;
  }
  if (state.ancestors.has(value)) {
    addIssue(state, 'INVALID_VALUE', path, 'Expression must not contain circular references');
    return;
  }
  state.ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Reflect.ownKeys(value).some((key) => typeof key === 'symbol')) addIssue(state, 'INVALID_VALUE', path, 'Expression arrays must not contain symbol properties');
      if (value.length > JSON_LOGIC_MAX_ARRAY_LENGTH) addIssue(state, 'RESOURCE_LIMIT', path, `Array length exceeds ${JSON_LOGIC_MAX_ARRAY_LENGTH}`);
      value.forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1, state));
      return;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      addIssue(state, 'INVALID_VALUE', path, 'Expression objects must be plain JSON objects');
      return;
    }
    if (Reflect.ownKeys(value).some((key) => typeof key === 'symbol')) {
      addIssue(state, 'INVALID_VALUE', path, 'Expression objects must not contain symbol properties');
      return;
    }
    const entries = Object.entries(value);
    if (entries.length !== 1) {
      addIssue(state, 'INVALID_OPERATION', path, 'An operation object must contain exactly one operator');
      return;
    }
    const [operatorName, operand] = entries[0];
    if (!OPERATORS.has(operatorName as JsonLogicOperator)) {
      addIssue(state, 'INVALID_OPERATION', path, `Operator "${operatorName}" is not allowed`);
      return;
    }
    const operator = operatorName as JsonLogicOperator;
    if (!validateArity(operator, operand, `${path}.${operator}`, state)) return;
    if (operator === 'var') validateVariable(operand, `${path}.${operator}`, state);
    const args = operationArguments(operand);
    if (operator === 'var') {
      if (args.length === 2) visit(args[1], `${path}.${operator}[1]`, depth + 1, state);
      return;
    }
    args.forEach((item, index) => visit(item, `${path}.${operator}[${index}]`, depth + 1, state));
  } finally {
    state.ancestors.delete(value);
  }
}

export function validateJsonLogicExpression(expression: unknown): JsonLogicValidationResult {
  const state: ValidationState = { nodes: 0, ancestors: new Set<object>(), issues: [] };
  visit(expression, '$', 0, state);
  return { valid: state.issues.length === 0, issues: state.issues };
}

export class JsonLogicValidationError extends Error {
  readonly issues: JsonLogicValidationIssue[];

  constructor(issues: JsonLogicValidationIssue[]) {
    super(`Invalid JSON Logic expression: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`);
    this.name = 'JsonLogicValidationError';
    this.issues = issues;
  }
}

export function assertJsonLogicExpression(expression: unknown): asserts expression is JsonLogicExpression {
  const result = validateJsonLogicExpression(expression);
  if (!result.valid) throw new JsonLogicValidationError(result.issues);
}
