import type { Translate } from '../i18n.js';

/** Rows a list shows before it pages. */
export const PAGE_SIZE = 10;

/** Numbered buttons are only offered while they stay readable. */
export const NUMBERED_PAGE_LIMIT = 7;

export function pageCount(total: number, size: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

/** Clamps a page a filter may have left beyond the end of the list. */
export function clampPage(
  page: number,
  total: number,
  size: number = PAGE_SIZE,
): number {
  return Math.min(Math.max(1, page), pageCount(total, size));
}

export function pageSlice<T>(
  rows: readonly T[],
  page: number,
  size: number = PAGE_SIZE,
): readonly T[] {
  const current = clampPage(page, rows.length, size);
  return rows.slice((current - 1) * size, current * size);
}

/** The range this page covers, as the pager states it. */
export function pageRangeLabel(
  t: Translate,
  total: number,
  page: number,
  size: number = PAGE_SIZE,
): string {
  if (total === 0) return t('pagination.empty');
  const current = clampPage(page, total, size);
  const first = (current - 1) * size + 1;
  return t('pagination.range', {
    first,
    last: Math.min(current * size, total),
    total,
  });
}

export function pageNumbers(
  total: number,
  size: number = PAGE_SIZE,
): readonly number[] {
  const pages = pageCount(total, size);
  if (pages > NUMBERED_PAGE_LIMIT) return [];
  return Array.from({ length: pages }, (_, index) => index + 1);
}
