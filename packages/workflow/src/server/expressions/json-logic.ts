import type { JsonLogicDataBindings, JsonLogicExpression, JsonLogicOperator } from './types.js';
import { assertJsonLogicExpression } from './validator.js';

function jsonTruth(value: unknown): boolean {
  if (Array.isArray(value) && value.length === 0) return false;
  return Boolean(value);
}

function readVariable(path: string, data: JsonLogicDataBindings): unknown {
  let current: unknown = data;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function compareOrder(operator: '>' | '>=' | '<' | '<=', left: unknown, right: unknown): boolean {
  if (typeof left === 'number' && typeof right === 'number') {
    if (operator === '>') return left > right;
    if (operator === '>=') return left >= right;
    if (operator === '<') return left < right;
    return left <= right;
  }
  if (typeof left === 'string' && typeof right === 'string') {
    if (operator === '>') return left > right;
    if (operator === '>=') return left >= right;
    if (operator === '<') return left < right;
    return left <= right;
  }
  return false;
}

function evaluateOperation(operator: JsonLogicOperator, raw: JsonLogicExpression | JsonLogicExpression[], data: JsonLogicDataBindings): unknown {
  const args = Array.isArray(raw) ? raw : [raw];
  if (operator === 'var') {
    const path = args[0] as string;
    const value = readVariable(path, data);
    return value === undefined ? (args.length === 2 ? evaluate(args[1], data) : null) : value;
  }
  if (operator === 'and') {
    let result: unknown = null;
    for (const argument of args) {
      result = evaluate(argument, data);
      if (!jsonTruth(result)) return result;
    }
    return result;
  }
  if (operator === 'or') {
    let result: unknown = null;
    for (const argument of args) {
      result = evaluate(argument, data);
      if (jsonTruth(result)) return result;
    }
    return result;
  }
  const left = evaluate(args[0], data);
  if (operator === '!') return !jsonTruth(left);
  const right = evaluate(args[1], data);
  if (operator === '===') return left === right;
  if (operator === '!==') return left !== right;
  if (operator === '>' || operator === '>=' || operator === '<' || operator === '<=') return compareOrder(operator, left, right);
  if (operator === 'in') {
    if (Array.isArray(right)) return right.includes(left);
    if (typeof right === 'string' && typeof left === 'string') return right.includes(left);
    throw new TypeError('Operator "in" requires a string needle and string haystack, or an array haystack');
  }
  if (typeof left !== 'string' || typeof right !== 'string') {
    throw new TypeError(`Operator "${operator}" requires two string arguments`);
  }
  return operator === 'startsWith' ? left.startsWith(right) : left.endsWith(right);
}

function evaluate(expression: JsonLogicExpression, data: JsonLogicDataBindings): unknown {
  if (expression === null || typeof expression !== 'object') return expression;
  if (Array.isArray(expression)) return expression.map((item) => evaluate(item, data));
  const [operator, raw] = Object.entries(expression)[0] as [JsonLogicOperator, JsonLogicExpression | JsonLogicExpression[]];
  return evaluateOperation(operator, raw, data);
}

/** Validate and evaluate one expression using the built-in safe operator subset. */
export function evaluateJsonLogic(expression: unknown, data: JsonLogicDataBindings): unknown {
  assertJsonLogicExpression(expression);
  return evaluate(expression, data);
}
