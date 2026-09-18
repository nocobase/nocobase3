export function operationError(error: unknown): string {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? error.status
      : undefined;
  if (status === 401) return 'sales.errors.session';
  if (status === 403) return 'forbidden';
  if (status === 400) return 'sales.errors.input';
  if (status === 409) return 'sales.errors.conflict';
  return 'sales.errors.request';
}
