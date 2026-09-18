const nameCollator = new Intl.Collator('en', { sensitivity: 'base' });

export function compareResourceNames(left: string, right: string): number {
  return (
    nameCollator.compare(left, right) ||
    (left < right ? -1 : left > right ? 1 : 0)
  );
}
