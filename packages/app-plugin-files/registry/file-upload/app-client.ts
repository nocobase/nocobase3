import {
  AppRequestError,
  createAppClient,
  resolveAppUrl,
  type AppClient,
} from '@nocobase/app-sdk';

export const appFileClient: AppClient = {
  async request<T>(path: string, init?: RequestInit): Promise<T> {
    try {
      return await createAppClient({
        baseURL: resolveAppUrl('/api'),
      }).request<T>(path, init);
    } catch (error) {
      if (
        error instanceof AppRequestError &&
        isRecord(error.payload) &&
        typeof error.payload.error === 'string'
      ) {
        throw new AppRequestError(
          error.payload.error,
          error.status,
          error.payload,
        );
      }
      throw error;
    }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
