export async function readBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  return contentType.includes('application/json') ? request.json() : {};
}

export function readEnabled(body: unknown): boolean | undefined {
  if (
    body === null ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    !Object.hasOwn(body, 'enabled')
  )
    return undefined;
  const enabled: unknown = Reflect.get(body, 'enabled');
  return typeof enabled === 'boolean' ? enabled : undefined;
}

export async function readParameterValues(request: Request): Promise<unknown> {
  const body = await readBody(request);
  return body !== null &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    Object.hasOwn(body, 'parameterValues')
    ? Reflect.get(body, 'parameterValues')
    : body;
}

export async function readInput(request: Request): Promise<unknown> {
  const body = await readBody(request);
  return body !== null &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    Object.hasOwn(body, 'input')
    ? Reflect.get(body, 'input')
    : body;
}

export function readPage(
  pageValue?: string,
  pageSizeValue?: string,
): { page: number; pageSize: number } {
  const page = Math.max(1, Number(pageValue ?? 1) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(pageSizeValue ?? 20) || 20),
  );
  return { page, pageSize };
}

export function toPageResponse<T>(page: {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}): { data: T[]; meta: { page: number; pageSize: number; total: number } } {
  return {
    data: page.data,
    meta: { page: page.page, pageSize: page.pageSize, total: page.total },
  };
}

export function parseBoolean(value?: string): boolean | undefined {
  return value === 'true' ? true : value === 'false' ? false : undefined;
}

export function parseStatus(value?: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === 'null') return null;
  const status = Number(value);
  return Number.isFinite(status) ? status : undefined;
}
