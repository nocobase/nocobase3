export type CompactNumberProps = {
  value?: number;
  maximumFractionDigits?: number;
};

const suffixes = ['', 'k', 'm', 'b'] as const;

/** Formats large counts without hiding their exact value from assistive technology or hover users. */
export function formatCompactNumber(value: number, maximumFractionDigits = 1) {
  if (!Number.isFinite(value)) return '—';
  const absolute = Math.abs(value);
  if (absolute < 1000) return String(value);

  const precision = Math.max(0, Math.floor(maximumFractionDigits));
  const factor = 10 ** precision;
  let exponent = Math.min(
    Math.floor(Math.log10(absolute) / 3),
    suffixes.length - 1,
  );
  let rounded = Math.round((value / 1000 ** exponent) * factor) / factor;

  if (Math.abs(rounded) >= 1000 && exponent < suffixes.length - 1) {
    exponent += 1;
    rounded = Math.round((value / 1000 ** exponent) * factor) / factor;
  }

  return `${rounded}${suffixes[exponent]}`;
}

export function CompactNumber({
  value,
  maximumFractionDigits = 1,
}: CompactNumberProps) {
  if (value === undefined || !Number.isFinite(value)) return <>—</>;
  const exactValue = value.toLocaleString();
  return (
    <span title={exactValue} aria-label={exactValue}>
      {formatCompactNumber(value, maximumFractionDigits)}
    </span>
  );
}
