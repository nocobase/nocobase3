/** One line of an expense report. Amounts are cents, so totals add up exactly. */
export interface ExpenseItem {
  readonly date: string;
  readonly category: string;
  readonly description: string;
  readonly amountCents: number;
}

/** Category keys; the pages translate them. */
export const EXPENSE_CATEGORIES: readonly string[] = [
  'transport',
  'lodging',
  'meals',
  'office',
  'entertainment',
  'other',
];

export function totalCents(items: readonly ExpenseItem[]): number {
  return items.reduce((sum, item) => sum + item.amountCents, 0);
}

export function yuan(cents: number): string {
  return `¥${(cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** What is wrong with a report's items; empty when it may be submitted. */
export function itemProblems(items: readonly ExpenseItem[]): string[] {
  if (!items.length) return ['至少填写一条费用明细'];
  const problems: string[] = [];
  items.forEach((item, index) => {
    const line = `第 ${index + 1} 行`;
    if (!DATE.test(item.date)) problems.push(`${line}缺少日期`);
    if (!EXPENSE_CATEGORIES.includes(item.category))
      problems.push(`${line}缺少类别`);
    if (!item.description.trim()) problems.push(`${line}缺少说明`);
    if (!Number.isSafeInteger(item.amountCents) || item.amountCents <= 0)
      problems.push(`${line}金额必须大于 0`);
  });
  return problems;
}

/** Items as they arrive from a form or a JSON column, with anything malformed dropped. */
export function parseItems(value: unknown): ExpenseItem[] {
  const source: unknown =
    typeof value === 'string' && value.startsWith('[')
      ? JSON.parse(value)
      : value;
  if (!Array.isArray(source)) return [];
  return source
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null,
    )
    .map((item) => ({
      date: typeof item.date === 'string' ? item.date : '',
      category: typeof item.category === 'string' ? item.category : '',
      description: typeof item.description === 'string' ? item.description : '',
      amountCents: Math.round(Number(item.amountCents) || 0),
    }));
}
