export function validateLogPagination(offset: number, limit: number): void {
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new TypeError('Invalid mail log offset.');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new TypeError('Mail log limit must be between 1 and 100.');
}
