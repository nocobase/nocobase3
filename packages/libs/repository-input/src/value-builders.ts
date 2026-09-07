import type {
  ValuesBuilder,
  MutationVariable,
  MutationLiteral,
  RepositoryMutationScalarValue,
  NumericMutationBuilder,
  NumericMutationOperandInput,
  NumericMutationJsonInput,
} from './types.js';

export class DefaultValuesBuilder implements ValuesBuilder {
  variable(path: string): MutationVariable {
    return { kind: 'variable', path };
  }
  literal<T extends RepositoryMutationScalarValue>(
    value: T,
  ): MutationLiteral<T> {
    return { kind: 'literal', value };
  }
}
export class DefaultNumericMutationBuilder implements NumericMutationBuilder {
  increment(value: NumericMutationOperandInput): NumericMutationJsonInput {
    return { increment: value };
  }
  decrement(value: NumericMutationOperandInput): NumericMutationJsonInput {
    return { decrement: value };
  }
  multiply(value: NumericMutationOperandInput): NumericMutationJsonInput {
    return { multiply: value };
  }
  divide(value: NumericMutationOperandInput): NumericMutationJsonInput {
    return { divide: value };
  }
}
