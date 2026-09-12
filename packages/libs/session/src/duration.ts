import type { SessionDuration } from './types.js';

const unitMilliseconds: Record<string, number> = {
  ms: 1,
  millisecond: 1,
  milliseconds: 1,
  s: 1000,
  sec: 1000,
  second: 1000,
  seconds: 1000,
  m: 60 * 1000,
  min: 60 * 1000,
  minute: 60 * 1000,
  minutes: 60 * 1000,
  h: 60 * 60 * 1000,
  hr: 60 * 60 * 1000,
  hour: 60 * 60 * 1000,
  hours: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
};

export function parseSessionDuration(
  value: SessionDuration,
  label: string,
): number {
  if (typeof value === 'number') {
    assertPositiveDuration(value, label);
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} session duration is empty.`);
  }

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    assertPositiveDuration(numeric, label);
    return numeric;
  }

  const match = /^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/.exec(trimmed);
  if (!match) {
    throw new Error(`${label} session duration "${value}" is invalid.`);
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = unitMilliseconds[unit];
  if (!multiplier) {
    throw new Error(
      `${label} session duration unit "${match[2]}" is unsupported.`,
    );
  }

  const milliseconds = amount * multiplier;
  assertPositiveDuration(milliseconds, label);
  return milliseconds;
}

function assertPositiveDuration(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} session duration must be greater than zero.`);
  }
}
