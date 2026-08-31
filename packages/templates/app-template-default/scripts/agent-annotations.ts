const DISABLED_VALUES = new Set(['false', '0', 'no', 'off']);

export function isAgentAnnotationsEnabled(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return !normalized || !DISABLED_VALUES.has(normalized);
}
