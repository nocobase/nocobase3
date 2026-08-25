import {
  createAppClient,
  resolveAppUrl,
  type AppClient,
} from '@nocobase/app-sdk';

export const appFileClient: AppClient = {
  request<T>(path: string, init?: RequestInit): Promise<T> {
    return createAppClient({ baseURL: resolveAppUrl('/api') }).request<T>(
      path,
      init,
    );
  },
};

export function buildAppFileUrl(
  path: string,
  query?: Readonly<Record<string, string>>,
): string {
  const base = resolveAppUrl(`/api/${path.replace(/^\/+/, '')}`);
  const search = query ? new URLSearchParams(query).toString() : '';
  return search ? `${base}${base.includes('?') ? '&' : '?'}${search}` : base;
}
