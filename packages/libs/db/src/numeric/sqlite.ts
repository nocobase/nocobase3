import {
  decimalParts,
  decimalSortKey,
  decimalText,
  decimalString,
} from './decimal.js';

interface Accumulator {
  coefficient: bigint;
  scale: number;
  count: bigint;
}
interface SqliteFunctions {
  aggregate(
    name: string,
    options: {
      start: () => Accumulator;
      step: (state: Accumulator, value: unknown) => Accumulator;
      result: (state: Accumulator) => string | null;
      safeIntegers: boolean;
    },
  ): void;
  function(
    name: string,
    options: { deterministic: boolean; safeIntegers: boolean },
    fn: (value: unknown) => string | null,
  ): void;
}

export function installDecimalAggregates(connection: SqliteFunctions): void {
  const step = (state: Accumulator, value: unknown): Accumulator => {
    if (value === null) return state;
    const next = decimalParts(value);
    const scale = Math.max(state.scale, next.scale);
    return {
      coefficient:
        state.coefficient * 10n ** BigInt(scale - state.scale) +
        next.coefficient * 10n ** BigInt(scale - next.scale),
      scale,
      count: state.count + 1n,
    };
  };
  for (const kind of ['sum', 'avg'])
    connection.aggregate(`nb_decimal_${kind}`, {
      start: () => ({ coefficient: 0n, scale: 0, count: 0n }),
      step,
      safeIntegers: true,
      result: (state) => {
        if (state.count === 0n) return null;
        if (kind === 'sum') return decimalText(state.coefficient, state.scale);
        // Keep at least 18 fractional digits; round ties away from zero.
        const scale = Math.max(18, state.scale);
        const numerator =
          state.coefficient * 10n ** BigInt(scale - state.scale);
        let quotient = numerator / state.count;
        const remainder = numerator % state.count;
        if ((remainder < 0n ? -remainder : remainder) * 2n >= state.count)
          quotient += numerator < 0n ? -1n : 1n;
        return decimalText(quotient, scale);
      },
    });
  connection.function(
    'nb_decimal_text',
    { deterministic: true, safeIntegers: true },
    decimalString,
  );
  connection.function(
    'nb_decimal_key',
    { deterministic: true, safeIntegers: true },
    decimalSortKey,
  );
}
