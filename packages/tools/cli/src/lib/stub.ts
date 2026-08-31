import type { Command } from '@oclif/core';

export type StubValues = Record<string, unknown>;

function formatValue(value: unknown): string {
  return Array.isArray(value)
    ? value.map((item) => formatValue(item)).join(', ')
    : String(value);
}

function collectEntries(
  values: StubValues | undefined,
  prefix: string,
): Array<[string, string]> {
  if (!values) {
    return [];
  }

  return Object.entries(values)
    .filter(
      ([, value]) => value !== undefined && value !== null && value !== false,
    )
    .map(([key, value]) => [`${prefix}${key}`, formatValue(value)]);
}

export interface StubReport {
  args?: StubValues;
  flags?: StubValues;
}

/**
 * Every command in this package parses its real arguments and then reports them instead of acting on them. Printing the
 * parsed values is what makes the stub worth running: it shows that the argument contract in the docs and the one the
 * CLI actually enforces are the same. Reports go to stdout and leave the exit code at 0, because "not built yet" is not
 * a failure and should not trip up scripts or CI.
 */
export function reportStub(command: Command, report: StubReport = {}): void {
  const commandId = (command.id ?? '').split(':').join(' ');
  command.log(`[nb3] ${commandId} (not implemented)`);

  const entries = [
    ...collectEntries(report.args, ''),
    ...collectEntries(report.flags, '--'),
  ];
  if (entries.length === 0) {
    return;
  }

  const width = Math.max(...entries.map(([label]) => label.length));
  for (const [label, value] of entries) {
    command.log(`  ${label.padEnd(width)}  ${value}`);
  }
}
